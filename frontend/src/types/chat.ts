/** 前端消息模型。由 SSE 事件归约而来，见 store/applyEvent.ts。 */

import type { ChartType, Stage } from './events'

export interface StageStep {
  stage: Stage
  label: string
  startedAt: number
  /** 下一阶段开始时才能算出，因此进行中的阶段为 null。 */
  elapsedMs: number | null
}

export interface SqlAttempt {
  sql: string
  reasoning: string
  /** 该次尝试失败的原因。有值即说明后面还有一次重试。 */
  error: string | null
}

export type MessageStatus = 'streaming' | 'done' | 'failed' | 'aborted'

export interface UserMessage {
  id: string
  role: 'user'
  content: string
  createdAt: number
}

export interface AssistantMessage {
  /** 前端生成，全程稳定，用于定位消息。 */
  id: string
  /** 后端在 done 事件里给的 id，Phase 3 用它做消息持久化与回放。 */
  serverId: string | null
  role: 'assistant'
  createdAt: number
  /** 触发本次回答的问题，重试时要用。 */
  question: string
  stages: StageStep[]
  attempts: SqlAttempt[]
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  chartType: ChartType | null
  chartOption: Record<string, unknown> | null
  summary: string
  /** 仅记录不可恢复的错误；可恢复错误挂在对应的 SqlAttempt 上。 */
  error: { code: string; message: string } | null
  elapsedMs: number | null
  status: MessageStatus
}

export type Message = UserMessage | AssistantMessage

export function createUserMessage(id: string, content: string): UserMessage {
  return { id, role: 'user', content, createdAt: Date.now() }
}

export function createAssistantMessage(id: string, question: string): AssistantMessage {
  return {
    id,
    serverId: null,
    role: 'assistant',
    createdAt: Date.now(),
    question,
    stages: [],
    attempts: [],
    columns: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    chartType: null,
    chartOption: null,
    summary: '',
    error: null,
    elapsedMs: null,
    status: 'streaming',
  }
}
