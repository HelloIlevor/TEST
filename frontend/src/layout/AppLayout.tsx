import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'data-agent:layout'

const LIMITS = {
  left: { min: 200, max: 420, initial: 280 },
  right: { min: 320, max: 760, initial: 480 },
} as const

type Side = keyof typeof LIMITS

interface Widths {
  left: number
  right: number
}

function clamp(side: Side, value: number): number {
  return Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, value))
}

function loadWidths(): Widths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Widths>
      return {
        left: clamp('left', Number(parsed.left) || LIMITS.left.initial),
        right: clamp('right', Number(parsed.right) || LIMITS.right.initial),
      }
    }
  } catch {
    // 存储被禁用或内容损坏都不该影响启动，用默认值即可
  }
  return { left: LIMITS.left.initial, right: LIMITS.right.initial }
}

interface AppLayoutProps {
  header: ReactNode
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

export function AppLayout({ header, left, center, right }: AppLayoutProps) {
  const [widths, setWidths] = useState<Widths>(loadWidths)
  const dragging = useRef<Side | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
    } catch {
      // 忽略：宽度记不住不影响使用
    }
  }, [widths])

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const side = dragging.current
    if (!side) return
    setWidths((previous) => ({
      ...previous,
      [side]: clamp(
        side,
        side === 'left' ? event.clientX : window.innerWidth - event.clientX,
      ),
    }))
  }, [])

  const stopDragging = useCallback(() => {
    dragging.current = null
    document.body.classList.remove('resizing')
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
    }
  }, [handlePointerMove, stopDragging])

  const startDragging = (side: Side) => () => {
    dragging.current = side
    // 拖动时全局禁用选中，否则会把界面文字一路刷蓝
    document.body.classList.add('resizing')
  }

  const reset = (side: Side) => () =>
    setWidths((previous) => ({ ...previous, [side]: LIMITS[side].initial }))

  return (
    <div className="app-shell">
      {header}
      <div
        className="app-body"
        style={{ gridTemplateColumns: `${widths.left}px 4px minmax(0, 1fr) 4px ${widths.right}px` }}
      >
        {left}
        <div
          className="divider"
          role="separator"
          aria-orientation="vertical"
          title="拖动调整宽度，双击复位"
          onPointerDown={startDragging('left')}
          onDoubleClick={reset('left')}
        />
        {center}
        <div
          className="divider"
          role="separator"
          aria-orientation="vertical"
          title="拖动调整宽度，双击复位"
          onPointerDown={startDragging('right')}
          onDoubleClick={reset('right')}
        />
        {right}
      </div>
    </div>
  )
}

interface PanelProps {
  title: string
  extra?: ReactNode
  toolbar?: ReactNode
  footer?: ReactNode
  scroll?: boolean
  children: ReactNode
}

export function Panel({ title, extra, toolbar, footer, scroll = true, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span>{title}</span>
        {extra}
      </div>
      {toolbar}
      <div className={scroll ? 'panel-body' : 'panel-body panel-body-fixed'}>{children}</div>
      {footer}
    </section>
  )
}
