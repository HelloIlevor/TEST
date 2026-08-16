/**
 * 事件归约函数：把 7 类 SSE 事件映射为消息状态变更。
 *
 * 这是 Phase 2 的核心抽象。整个前端只有这一个文件理解 SSE 事件的语义，
 * UI 组件一律只读 AssistantMessage，因此 Phase 4 从 Mock 切到真实接口时，
 * 只要事件契约不变，组件代码一行都不用动。
 *
 * 纯函数、不可变更新，便于单测。
 */

import type { AssistantMessage } from '../types/chat'
import type { StreamEvent } from '../types/events'

export function applyEvent(
  message: AssistantMessage,
  event: StreamEvent,
  now: number = Date.now(),
): AssistantMessage {
  switch (event.type) {
    case 'stage': {
      // 上一阶段的耗时要等下一阶段开始才能确定
      const stages = message.stages.map((step, index) =>
        index === message.stages.length - 1 && step.elapsedMs === null
          ? { ...step, elapsedMs: now - step.startedAt }
          : step,
      )
      return {
        ...message,
        stages: [...stages, { stage: event.stage, label: event.label, startedAt: now, elapsedMs: null }],
      }
    }

    case 'sql':
      return {
        ...message,
        attempts: [...message.attempts, { sql: event.sql, reasoning: event.reasoning, error: null }],
      }

    case 'rows':
      return {
        ...message,
        columns: event.columns,
        rows: event.rows,
        rowCount: event.row_count,
        truncated: event.truncated,
      }

    case 'chart':
      return { ...message, chartType: event.chart_type, chartOption: event.option }

    case 'token':
      return { ...message, summary: message.summary + event.text }

    case 'error': {
      if (event.recoverable) {
        // 可恢复错误归到最近一次 SQL 尝试上，后面还会有新的 sql 事件
        const attempts = message.attempts.map((attempt, index) =>
          index === message.attempts.length - 1 ? { ...attempt, error: event.message } : attempt,
        )
        return { ...message, attempts }
      }
      return {
        ...message,
        error: { code: event.code, message: event.message },
        status: 'failed',
      }
    }

    case 'done': {
      const stages = message.stages.map((step, index) =>
        index === message.stages.length - 1 && step.elapsedMs === null
          ? { ...step, elapsedMs: now - step.startedAt }
          : step,
      )
      return {
        ...message,
        stages,
        serverId: event.message_id,
        elapsedMs: event.elapsed_ms,
        // 中途已判定失败的，done 不应把它改回成功
        status: message.status === 'failed' ? 'failed' : 'done',
      }
    }
  }
}
