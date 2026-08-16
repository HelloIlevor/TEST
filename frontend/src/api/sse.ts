/**
 * SSE 客户端。
 *
 * 不用原生 EventSource：它只支持 GET，无法提交 { conversation_id, question } 请求体。
 * 这里用 fetch + ReadableStream 手写解析，按空行切帧并兼容跨 chunk 的半截帧。
 *
 * 关于重连：POST 式的分析请求无法断点续传——重连等于让后端重跑一遍 SQL 与 LLM，
 * 既费钱又会让已渲染的半截结果和新流冲突。因此这里只对「连接尚未建立」的失败自动重试；
 * 一旦收到过事件再断开，就抛 StreamInterruptedError 交给 UI 出重试按钮，由用户决定是否重跑。
 */

import { streamEventSchema, type StreamEvent } from '../types/events'
import { USE_MOCK } from './client'

export type Scenario = 'bar' | 'line' | 'retry'

export class StreamInterruptedError extends Error {
  constructor() {
    super('连接中断，本次回答未完成')
    this.name = 'StreamInterruptedError'
  }
}

export interface StreamChatOptions {
  conversationId: string
  question: string
  scenario?: Scenario
  signal?: AbortSignal
  /** 批量回调而非逐条，避免 token 密集时把 React 渲染打满。 */
  onEvents: (events: StreamEvent[]) => void
}

const MAX_CONNECT_ATTEMPTS = 3
/** 队列积压到这个量就立刻冲刷，防止后台标签页里 rAF 暂停导致无限堆积。 */
const MAX_PENDING = 32

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

/** 从一个 SSE 帧里取出 data 部分。注释行（心跳）与 event 行直接跳过。 */
function parseFrame(frame: string): StreamEvent | null {
  const dataLines = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())

  if (dataLines.length === 0) return null

  // 校验失败直接抛出，避免脏数据静默流进 UI
  return streamEventSchema.parse(JSON.parse(dataLines.join('\n')))
}

async function connect(url: string, body: string, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body,
        signal,
      })

      // 4xx 是请求本身有问题，重试多少次都一样，直接抛
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`请求被拒绝: HTTP ${response.status}`)
      }
      if (!response.ok || !response.body) {
        throw new Error(`连接失败: HTTP ${response.status}`)
      }
      return response
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      if (error instanceof Error && error.message.startsWith('请求被拒绝')) throw error
      if (attempt < MAX_CONNECT_ATTEMPTS) {
        await delay(400 * 2 ** (attempt - 1), signal)
      }
    }
  }

  throw lastError
}

export async function streamChat({
  conversationId,
  question,
  scenario,
  signal,
  onEvents,
}: StreamChatOptions): Promise<void> {
  const url = USE_MOCK ? '/api/mock/chat/stream' : '/api/chat/stream'
  const body = JSON.stringify({ conversation_id: conversationId, question, scenario })

  const response = await connect(url, body, signal)
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()

  let pending: StreamEvent[] = []
  let scheduled = false
  let receivedAny = false
  let finished = false

  const flush = () => {
    scheduled = false
    if (pending.length === 0) return
    const batch = pending
    pending = []
    onEvents(batch)
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(flush)
  }

  try {
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += value.replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        const event = parseFrame(frame)
        if (!event) continue

        receivedAny = true
        pending.push(event)

        // 终止与错误事件必须立刻可见，不能等下一帧
        if (event.type === 'done' || event.type === 'error') {
          if (event.type === 'done') finished = true
          flush()
        } else if (pending.length >= MAX_PENDING) {
          flush()
        } else {
          schedule()
        }
      }
    }

    flush()

    if (!finished && receivedAny) {
      throw new StreamInterruptedError()
    }
  } finally {
    flush()
    reader.releaseLock()
  }
}
