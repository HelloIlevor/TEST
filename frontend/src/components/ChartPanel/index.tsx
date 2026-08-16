import { App, Button, Segmented } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useEffect, useMemo, useRef } from 'react'

import { CHART_TYPE_LABELS, buildOption, isMetricShape } from '../../charts/buildOption'
import { Panel } from '../../layout/AppLayout'
import { useActiveChartMessage, useChatStore, useCurrentMessages } from '../../store/useChatStore'
import type { AssistantMessage } from '../../types/chat'
import type { ChartType } from '../../types/events'
import { ResultTable } from '../ChatPanel/ResultTable'

const SWITCHABLE: ChartType[] = ['bar', 'line', 'pie', 'scatter', 'table']

function chartTitle(message: AssistantMessage): string {
  const fromOption = (message.chartOption?.title as { text?: string } | undefined)?.text
  return fromOption ?? message.question
}

function MetricCard({ message }: { message: AssistantMessage }) {
  const value = message.rows[0]?.[message.columns.length - 1]
  return (
    <div className="metric-card">
      <span className="metric-label">{message.columns.at(-1)}</span>
      <span className="metric-value">{String(value ?? '—')}</span>
    </div>
  )
}

export function ChartPanel() {
  const { message: toast } = App.useApp()
  const active = useActiveChartMessage()
  const messages = useCurrentMessages()
  const override = useChatStore((state) => state.chartTypeOverride)
  const setChartType = useChatStore((state) => state.setChartType)
  const selectChart = useChatStore((state) => state.selectChart)
  const selectedId = useChatStore((state) => state.selectedChartMessageId)

  const chartRef = useRef<ReactECharts>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 拖动分隔条只改变容器尺寸、不触发 window resize，必须自己观察容器
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance().resize()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const history = useMemo(
    () =>
      messages.filter(
        (message): message is AssistantMessage =>
          message.role === 'assistant' && Boolean(message.chartOption),
      ),
    [messages],
  )

  const effectiveType: ChartType | null = override ?? active?.chartType ?? null

  const option = useMemo(() => {
    if (!active) return null
    // 没手动切换时用后端给的 option：它是权威版本，标题与轴名都由后端定好
    if (!override) return active.chartOption
    return buildOption(override, active.columns, active.rows, chartTitle(active))
  }, [active, override])

  const exportPng = () => {
    const instance = chartRef.current?.getEchartsInstance()
    if (!instance) return
    const url = instance.getDataURL({ pixelRatio: 2, backgroundColor: '#161a21' })
    const link = document.createElement('a')
    link.href = url
    link.download = `${chartTitle(active!) || 'chart'}.png`
    link.click()
    toast.success('图表已导出')
  }

  const toolbar = active ? (
    <div className="toolbar chart-toolbar">
      <Segmented
        size="small"
        value={effectiveType ?? 'bar'}
        onChange={(value) => setChartType(value as ChartType)}
        options={SWITCHABLE.map((type) => ({ label: CHART_TYPE_LABELS[type], value: type }))}
      />
      <span className="sql-spacer" />
      {override && (
        <Button size="small" type="text" onClick={() => setChartType(null)}>
          复位
        </Button>
      )}
      <Button size="small" disabled={!option} onClick={exportPng}>
        导出 PNG
      </Button>
    </div>
  ) : undefined

  return (
    <Panel
      title="可视化"
      extra={active && effectiveType ? <span>{CHART_TYPE_LABELS[effectiveType]}</span> : null}
      toolbar={toolbar}
      scroll={false}
    >
      <div className="chart-area" ref={containerRef}>
        {!active ? (
          <div className="state-block centered">
            <p className="state-title">还没有图表</p>
            <p className="state-desc">提问后，查询结果会在这里自动渲染成图表</p>
          </div>
        ) : effectiveType === 'table' ? (
          <div className="chart-scroll">
            <ResultTable
              columns={active.columns}
              rows={active.rows}
              rowCount={active.rowCount}
              truncated={active.truncated}
            />
          </div>
        ) : effectiveType === 'metric' || (!option && isMetricShape(active.columns, active.rows)) ? (
          <MetricCard message={active} />
        ) : option ? (
          <ReactECharts
            ref={chartRef}
            option={option}
            notMerge
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
          />
        ) : (
          <div className="state-block centered">
            <p className="state-title">当前数据画不出{CHART_TYPE_LABELS[effectiveType ?? 'bar']}</p>
            <p className="state-desc">结果集里缺少可用的数值列，换个图表类型或看表格</p>
            <Button size="small" onClick={() => setChartType('table')}>
              改看表格
            </Button>
          </div>
        )}
      </div>

      {history.length > 1 && (
        <div className="chart-history">
          {history.map((message, index) => (
            <button
              key={message.id}
              className={
                (selectedId ?? history.at(-1)?.id) === message.id
                  ? 'history-chip active'
                  : 'history-chip'
              }
              title={chartTitle(message)}
              onClick={() => selectChart(message.id)}
            >
              <span className="history-index">{index + 1}</span>
              <span className="history-title">{chartTitle(message)}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}
