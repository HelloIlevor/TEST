import { useEffect, useState } from 'react'

import { USE_MOCK, fetchHealth } from './api/client'
import { ChartPanel } from './components/ChartPanel'
import { ChatPanel } from './components/ChatPanel'
import { SessionPanel } from './components/SessionPanel'
import { AppLayout } from './layout/AppLayout'
import { useChatStore } from './store/useChatStore'
import type { Health } from './types/events'

function HealthBadge() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '未知错误'))
  }, [])

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
      后端 v{health.version} · 模型{health.llm_configured ? '已配置' : '未配置'} ·
      {USE_MOCK ? ' Mock 数据' : ' 真实接口'}
    </div>
  )
}

export default function App() {
  const loadConversations = useChatStore((state) => state.loadConversations)

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  return (
    <AppLayout
      header={
        <header className="app-header">
          <div className="app-title">
            智能数据分析助手<span>用自然语言查数据</span>
          </div>
          <HealthBadge />
        </header>
      }
      left={<SessionPanel />}
      center={<ChatPanel />}
      right={<ChartPanel />}
    />
  )
}
