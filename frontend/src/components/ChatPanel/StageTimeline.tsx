import type { MessageStatus, StageStep } from '../../types/chat'

interface StageTimelineProps {
  stages: StageStep[]
  status: MessageStatus
  elapsedMs: number | null
}

export function StageTimeline({ stages, status, elapsedMs }: StageTimelineProps) {
  if (stages.length === 0) return null

  return (
    <div className="timeline">
      {stages.map((step, index) => {
        const running = step.elapsedMs === null && status === 'streaming'
        return (
          <span key={`${step.stage}-${index}`} className={running ? 'stage running' : 'stage'}>
            <span className="stage-dot" />
            {step.label}
            {step.elapsedMs !== null && <em>{step.elapsedMs} ms</em>}
          </span>
        )
      })}
      {elapsedMs !== null && <span className="stage total">合计 {elapsedMs} ms</span>}
    </div>
  )
}
