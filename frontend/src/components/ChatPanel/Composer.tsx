import { Button, Input } from 'antd'
import { useState, type KeyboardEvent } from 'react'

import type { Scenario } from '../../api/sse'
import { USE_MOCK } from '../../api/client'
import { useChatStore } from '../../store/useChatStore'

const SAMPLES: { label: string; question: string; scenario: Scenario }[] = [
  { label: '各品类销售额', question: '各品类的销售额分别是多少？', scenario: 'bar' },
  { label: '近一年趋势', question: '近 12 个月的销售额变化趋势如何？', scenario: 'line' },
  { label: '区域排名', question: '各区域的销售额排名是怎样的？', scenario: 'retry' },
]

export function Composer() {
  const streaming = useChatStore((state) => state.streaming)
  const currentId = useChatStore((state) => state.currentId)
  const send = useChatStore((state) => state.send)
  const abort = useChatStore((state) => state.abort)
  const [value, setValue] = useState('')

  const submit = (question?: string, scenario?: Scenario) => {
    const text = (question ?? value).trim()
    if (!text || streaming || !currentId) return
    setValue('')
    void send(text, scenario)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送、Shift+Enter 换行；输入法组合中的回车不能当发送
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer">
      {USE_MOCK && (
        <div className="samples">
          {SAMPLES.map((sample) => (
            <button
              key={sample.scenario}
              className="sample-chip"
              disabled={streaming}
              onClick={() => submit(sample.question, sample.scenario)}
            >
              {sample.label}
            </button>
          ))}
        </div>
      )}

      <div className="composer-row">
        <Input.TextArea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="用自然语言提问，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 2, maxRows: 6 }}
          disabled={streaming}
        />
        {streaming ? (
          <Button danger onClick={abort}>
            中止
          </Button>
        ) : (
          <Button type="primary" disabled={!value.trim() || !currentId} onClick={() => submit()}>
            发送
          </Button>
        )}
      </div>
    </div>
  )
}
