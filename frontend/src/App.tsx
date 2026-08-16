import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchHealth, USE_MOCK } from './api/client'
import { streamChat } from './api/sse'
import { ChartPanel } from './components/ChartPanel'
import { ChatPanel } from './components/ChatPanel'
import { SessionPanel } from './components/SessionPanel'
import { AppLayout } from './layout/AppLayout'
import type { ChartEvent, Health, StreamEvent } from './types/events'

type Scenario = 'bar' | 'line' | 'retry'

function HealthBadge({ health, error }: { health: Health | null; error: string | null }) {
  if (error) {
    return (
      <div className="health">
        <span className="dot err" />
        后端未连接 · {error}
      </div>
    )
  }
  if (!health) {
    return (
      <div className="health">
        <span className="dot" />
        正在检测后端…
      </div>
    )
  }
  return (
    <div className="health">
      <span className="dot ok" />
      后端 v{health.version} · 模型{health.llm_configured ? '已配置' : '未配置'} · 数据源
      {USE_MOCK ? ' Mock' : ' 真实接口'}
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [chart, setChart] = useState<ChartEvent | null>(null)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetchHealth()
      .then((value) => {
        setHealth(value)
        setHealthError(null)
      })
      .catch((error: unknown) => setHealthError(error instanceof Error ? error.message : '未知错误'))
  }, [])

  const handleRun = useCallback(async (scenario: Scenario) => {
    const controller = new AbortController()
    abortRef.current = controller
    setEvents([])
    setChart(null)
    setRunning(true)

    try {
      await streamChat({
        conversationId: 'p1-verify',
        question: `Phase 1 验证 · ${scenario}`,
        scenario,
        signal: controller.signal,
        onEvent: (event) => {
          setEvents((previous) => [...previous, event])
          if (event.type === 'chart') setChart(event)
        },
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('SSE 流失败', error)
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }, [])

  const handleAbort = useCallback(() => abortRef.current?.abort(), [])
  const handleClear = useCallback(() => {
    setEvents([])
    setChart(null)
  }, [])

  return (
    <AppLayout
      header={
        <header className="app-header">
          <div className="app-title">
            智能数据分析助手<span>Phase 1 · 基础框架验证</span>
          </div>
          <HealthBadge health={health} error={healthError} />
        </header>
      }
      left={<SessionPanel />}
      center={
        <ChatPanel
          events={events}
          running={running}
          onRun={handleRun}
          onAbort={handleAbort}
          onClear={handleClear}
        />
      }
      right={<ChartPanel chart={chart} />}
    />
  )
}
