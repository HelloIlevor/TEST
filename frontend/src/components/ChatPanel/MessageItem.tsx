import { Button } from 'antd'
import { useState } from 'react'

import { useChatStore } from '../../store/useChatStore'
import type { AssistantMessage, Message } from '../../types/chat'
import { ResultTable } from './ResultTable'
import { SqlBlock } from './SqlBlock'
import { StageTimeline } from './StageTimeline'

/** 总结超过这个长度就先折叠，避免一条消息刷满整屏。 */
const SUMMARY_CLAMP = 220

function AssistantBody({ message }: { message: AssistantMessage }) {
  const retry = useChatStore((state) => state.retry)
  const selectChart = useChatStore((state) => state.selectChart)
  const selectedId = useChatStore((state) => state.selectedChartMessageId)
  const streaming = useChatStore((state) => state.streaming)
  const [expanded, setExpanded] = useState(false)

  const longSummary = message.summary.length > SUMMARY_CLAMP
  const visibleSummary =
    longSummary && !expanded ? `${message.summary.slice(0, SUMMARY_CLAMP)}…` : message.summary

  return (
    <div className="bubble assistant">
      <StageTimeline
        stages={message.stages}
        status={message.status}
        elapsedMs={message.elapsedMs}
      />

      {message.attempts.map((attempt, index) => (
        <SqlBlock
          key={index}
          attempt={attempt}
          index={index}
          total={message.attempts.length}
          defaultOpen={Boolean(attempt.error)}
        />
      ))}

      {message.columns.length > 0 && (
        <ResultTable
          columns={message.columns}
          rows={message.rows}
          rowCount={message.rowCount}
          truncated={message.truncated}
        />
      )}

      {message.chartOption && (
        <div className="chart-hint">
          <span>已生成图表</span>
          <Button
            size="small"
            type={selectedId === message.id ? 'primary' : 'default'}
            onClick={() => selectChart(message.id)}
          >
            {selectedId === message.id ? '正在右侧展示' : '在右侧查看'}
          </Button>
        </div>
      )}

      {message.summary && (
        <p className="summary">
          {visibleSummary}
          {message.status === 'streaming' && <span className="caret" />}
          {longSummary && (
            <Button size="small" type="link" onClick={() => setExpanded((value) => !value)}>
              {expanded ? '收起' : '展开'}
            </Button>
          )}
        </p>
      )}

      {message.status === 'failed' && message.error && (
        <div className="state-block error">
          <p className="state-title">回答失败</p>
          <p className="state-desc">{message.error.message}</p>
          <Button size="small" disabled={streaming} onClick={() => void retry(message.id)}>
            重试
          </Button>
        </div>
      )}

      {message.status === 'aborted' && (
        <div className="state-block">
          <p className="state-desc">已中止，本次回答未完成</p>
          <Button size="small" disabled={streaming} onClick={() => void retry(message.id)}>
            重新提问
          </Button>
        </div>
      )}

      {message.status === 'streaming' && message.stages.length === 0 && (
        <div className="skeleton-lines">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  )
}

export function MessageItem({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="message user">
        <div className="bubble user">{message.content}</div>
      </div>
    )
  }
  return (
    <div className="message assistant">
      <AssistantBody message={message} />
    </div>
  )
}
