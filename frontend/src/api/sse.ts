/**
 * SSE 客户端。
 *
 * 不用原生 EventSource：它只支持 GET，无法提交 { conversation_id, question } 请求体。
 * 这里用 fetch + ReadableStream 手写解析，按空行切帧并兼容跨 chunk 的半截帧。
 *
 * Phase 1 只需满足「事件能逐条到达」；断连重连与背压在 P2-2 补齐。
 */

import { streamEventSchema, type StreamEvent } from '../types/events'
import { USE_MOCK } from './client'

export interface StreamChatOptions {
  conversationId: string
  question: string
  scenario?: 'bar' | 'line' | 'retry'
  signal?: AbortSignal
  onEvent: (event: StreamEvent) => void
}

/** 从一个 SSE 帧里取出 data 部分。注释行（心跳）与 event 行直接跳过。 */
function parseFrame(frame: string): StreamEvent | null {
  const dataLines = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())

  if (dataLines.length === 0) return null

  const payload = JSON.parse(dataLines.join('\n'))
  // 校验失败直接抛出，避免脏数据静默流进 UI
  return streamEventSchema.parse(payload)
}

export async function streamChat({
  conversationId,
  question,
  scenario,
  signal,
  onEvent,
}: StreamChatOptions): Promise<void> {
  const url = USE_MOCK ? '/api/mock/chat/stream' : '/api/chat/stream'

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ conversation_id: conversationId, question, scenario }),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`SSE 请求失败: ${response.status}`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += value.replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseFrame(frame)
        if (event) onEvent(event)
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}
