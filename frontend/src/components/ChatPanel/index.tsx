import { Button } from 'antd'

import { Panel } from '../../layout/AppLayout'
import type { StreamEvent } from '../../types/events'

type Scenario = 'bar' | 'line' | 'retry'

interface ChatPanelProps {
  events: StreamEvent[]
  running: boolean
  onRun: (scenario: Scenario) => void
  onAbort: () => void
  onClear: () => void
}

function describe(event: StreamEvent): string {
  switch (event.type) {
    case 'stage':
      return `${event.stage} — ${event.label}`
    case 'sql':
      return event.sql.replace(/\s+/g, ' ').slice(0, 90) + '…'
    case 'rows':
      return `${event.columns.join(' | ')}  共 ${event.row_count} 行`
    case 'chart':
      return `chart_type = ${event.chart_type}`
    case 'token':
      return event.text
    case 'error':
      return `[${event.code}] ${event.message}${event.recoverable ? '（可恢复，将重试）' : ''}`
    case 'done':
      return `耗时 ${event.elapsed_ms} ms`
  }
}

/**
 * P1 阶段只做事件到达的可视化验证。
 * P2-4 实现真正的消息流、阶段时间线、SQL 折叠块、表格预览与输入框。
 */
export function ChatPanel({ events, running, onRun, onAbort, onClear }: ChatPanelProps) {
  const toolbar = (
    <div className="toolbar">
      <Button size="small" type="primary" disabled={running} onClick={() => onRun('bar')}>
        剧本 1 · 柱状图
      </Button>
      <Button size="small" disabled={running} onClick={() => onRun('line')}>
        剧本 2 · 折线图
      </Button>
      <Button size="small" disabled={running} onClick={() => onRun('retry')}>
        剧本 3 · 报错重试
      </Button>
      <Button size="small" danger disabled={!running} onClick={onAbort}>
        中止
      </Button>
      <Button size="small" type="text" disabled={running || events.length === 0} onClick={onClear}>
        清空
      </Button>
    </div>
  )

  return (
    <Panel
      title="问答"
      extra={<span>{running ? '接收中…' : `${events.length} 条事件`}</span>}
      toolbar={toolbar}
    >
      {events.length === 0 ? (
        <div className="placeholder">
          点击上方任一剧本，验证 Mock SSE 事件是否逐条到达
          <br />
          事件应当依次出现，而不是一次性全部涌现
        </div>
      ) : (
        <div className="event-log">
          {events.map((event, index) => (
            <div className="event-row" key={index}>
              <span className={`event-type ${event.type}`}>{event.type}</span>
              <span className="event-detail">{describe(event)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
