import type { ReactNode } from 'react'

interface AppLayoutProps {
  header: ReactNode
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

/**
 * 三列骨架：左侧会话管理、中间问答、右侧图表。
 * P2-1 会在这里补上可拖拽的分隔条与宽度持久化。
 */
export function AppLayout({ header, left, center, right }: AppLayoutProps) {
  return (
    <div className="app-shell">
      {header}
      <div className="app-body">
        {left}
        {center}
        {right}
      </div>
    </div>
  )
}

interface PanelProps {
  title: string
  extra?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
}

export function Panel({ title, extra, toolbar, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span>{title}</span>
        {extra}
      </div>
      {toolbar}
      <div className="panel-body">{children}</div>
    </section>
  )
}
