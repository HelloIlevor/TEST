import { Panel } from '../../layout/AppLayout'
import type { ChartEvent } from '../../types/events'

interface ChartPanelProps {
  chart: ChartEvent | null
}

/**
 * P1 只确认 chart 事件能到达并拿到合法的 option。
 * P2-5 接入 echarts-for-react 真实渲染、类型切换、历史回看与导出 PNG。
 */
export function ChartPanel({ chart }: ChartPanelProps) {
  return (
    <Panel title="可视化" extra={chart ? <span>{chart.chart_type}</span> : null}>
      {chart ? (
        <div className="event-log">
          <div className="event-row">
            <span className="event-type">已收到</span>
            <span className="event-detail">
              chart_type = {chart.chart_type}
              {'\n'}
              series 数量 = {Array.isArray(chart.option.series) ? chart.option.series.length : 0}
              {'\n'}
              标题 = {String((chart.option.title as { text?: string } | undefined)?.text ?? '无')}
            </span>
          </div>
        </div>
      ) : (
        <div className="placeholder">
          图表渲染将在 P2-5 接入 ECharts
          <br />
          当前仅校验 chart 事件是否送达
        </div>
      )}
    </Panel>
  )
}
