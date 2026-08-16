import { Button, Input, Popconfirm, Skeleton, type InputRef } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Panel } from '../../layout/AppLayout'
import { useChatStore } from '../../store/useChatStore'

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function SessionPanel() {
  const conversations = useChatStore((state) => state.conversations)
  const currentId = useChatStore((state) => state.currentId)
  const loading = useChatStore((state) => state.conversationsLoading)
  const error = useChatStore((state) => state.conversationsError)
  const streaming = useChatStore((state) => state.streaming)
  const addConversation = useChatStore((state) => state.addConversation)
  const selectConversation = useChatStore((state) => state.selectConversation)
  const renameConversation = useChatStore((state) => state.renameConversation)
  const removeConversation = useChatStore((state) => state.removeConversation)
  const loadConversations = useChatStore((state) => state.loadConversations)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [conversations],
  )

  const commitRename = (id: string) => {
    const title = draft.trim()
    if (title && title !== conversations.find((item) => item.id === id)?.title) {
      void renameConversation(id, title)
    }
    setEditingId(null)
  }

  const toolbar = (
    <div className="toolbar">
      <Button size="small" type="primary" block disabled={streaming} onClick={() => void addConversation()}>
        ＋ 新建会话
      </Button>
    </div>
  )

  return (
    <Panel title="会话" extra={<span>{conversations.length}</span>} toolbar={toolbar}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      ) : error ? (
        <div className="state-block">
          <p className="state-title">会话列表加载失败</p>
          <p className="state-desc">{error}</p>
          <Button size="small" onClick={() => void loadConversations()}>
            重试
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="state-block">
          <p className="state-title">还没有会话</p>
          <p className="state-desc">新建一个会话，然后在中间提问试试</p>
        </div>
      ) : (
        <ul className="session-list">
          {sorted.map((conversation) => {
            const active = conversation.id === currentId
            return (
              <li
                key={conversation.id}
                className={active ? 'session-item active' : 'session-item'}
                onClick={() => selectConversation(conversation.id)}
              >
                {editingId === conversation.id ? (
                  <Input
                    ref={inputRef}
                    size="small"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => commitRename(conversation.id)}
                    onPressEnter={() => commitRename(conversation.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="session-main">
                      <span className="session-title">{conversation.title}</span>
                      <span className="session-time">{formatTime(conversation.updated_at)}</span>
                    </div>
                    <div className="session-actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        className="icon-button"
                        title="重命名"
                        onClick={() => {
                          setDraft(conversation.title)
                          setEditingId(conversation.id)
                        }}
                      >
                        ✎
                      </button>
                      <Popconfirm
                        title="删除这个会话？"
                        description="会话内的消息会一并清除，且无法撤销。"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void removeConversation(conversation.id)}
                      >
                        <button className="icon-button danger" title="删除">
                          ✕
                        </button>
                      </Popconfirm>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
