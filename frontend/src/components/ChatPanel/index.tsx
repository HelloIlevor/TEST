import { useEffect, useRef } from 'react'

import { Panel } from '../../layout/AppLayout'
import { useChatStore, useCurrentMessages } from '../../store/useChatStore'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'

export function ChatPanel() {
  const messages = useCurrentMessages()
  const streaming = useChatStore((state) => state.streaming)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  // 只在用户本来就贴着底部时才自动滚，否则会把正在回看历史的人一把拽走
  useEffect(() => {
    const node = bodyRef.current
    if (!node || !pinnedToBottom.current) return
    node.scrollTop = node.scrollHeight
  }, [messages, streaming])

  const handleScroll = () => {
    const node = bodyRef.current
    if (!node) return
    pinnedToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }

  return (
    <Panel
      title="问答"
      extra={<span>{streaming ? '回答中…' : `${messages.length} 条消息`}</span>}
      footer={<Composer />}
      scroll={false}
    >
      <div className="message-scroll" ref={bodyRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="state-block centered">
            <p className="state-title">用自然语言问一个数据问题</p>
            <p className="state-desc">
              系统会自动生成 SQL、执行查询，并在右侧渲染图表。
              <br />
              可以点下方的示例问题快速试一次。
            </p>
          </div>
        ) : (
          messages.map((message) => <MessageItem key={message.id} message={message} />)
        )}
      </div>
    </Panel>
  )
}
