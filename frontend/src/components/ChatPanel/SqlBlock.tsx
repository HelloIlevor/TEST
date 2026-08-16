import { App, Button } from 'antd'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { SqlAttempt } from '../../types/chat'

const KEYWORDS = new Set([
  'select', 'from', 'where', 'group', 'by', 'order', 'having', 'limit', 'offset',
  'join', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'on', 'as', 'and',
  'or', 'not', 'in', 'is', 'null', 'like', 'between', 'case', 'when', 'then',
  'else', 'end', 'distinct', 'union', 'all', 'with', 'asc', 'desc', 'exists',
])

const FUNCTIONS = new Set([
  'sum', 'count', 'avg', 'min', 'max', 'round', 'abs', 'coalesce', 'cast',
  'strftime', 'date', 'datetime', 'substr', 'length', 'upper', 'lower',
])

// 按顺序匹配：注释、字符串、数字、标识符，最后是单字符兜底
const TOKEN_PATTERN =
  /(\s+|--[^\n]*|'(?:[^']|'')*'|"[^"]*"|\d+\.?\d*|[A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*|.)/g

function highlight(sql: string): ReactNode[] {
  const tokens = sql.match(TOKEN_PATTERN) ?? []
  return tokens.map((token, index) => {
    const lower = token.toLowerCase()
    let className: string | undefined

    if (/^\s+$/.test(token)) className = undefined
    else if (token.startsWith('--')) className = 'sql-comment'
    else if (token.startsWith("'") || token.startsWith('"')) className = 'sql-string'
    else if (/^\d/.test(token)) className = 'sql-number'
    else if (KEYWORDS.has(lower)) className = 'sql-keyword'
    else if (FUNCTIONS.has(lower)) className = 'sql-function'
    else if (/^[(),.*=<>+\-/|]$/.test(token)) className = 'sql-punct'

    return className ? (
      <span key={index} className={className}>
        {token}
      </span>
    ) : (
      <span key={index}>{token}</span>
    )
  })
}

interface SqlBlockProps {
  attempt: SqlAttempt
  index: number
  total: number
  defaultOpen?: boolean
}

export function SqlBlock({ attempt, index, total, defaultOpen = false }: SqlBlockProps) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(defaultOpen)
  const highlighted = useMemo(() => highlight(attempt.sql), [attempt.sql])

  // 失败是流式过程中后到的，此时组件已经挂载，useState 的初值早就用过了，
  // 必须在这里补一次展开，否则出错的 SQL 只显示一个折叠标题
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(attempt.sql)
      message.success('SQL 已复制')
    } catch {
      message.error('复制失败，请手动选择文本')
    }
  }

  const label = total > 1 ? `SQL 第 ${index + 1} 次` : 'SQL'

  return (
    <div className={attempt.error ? 'sql-block failed' : 'sql-block'}>
      <div className="sql-head" onClick={() => setOpen((value) => !value)}>
        <span className="sql-caret">{open ? '▾' : '▸'}</span>
        <span className="sql-label">{label}</span>
        {attempt.error && <span className="sql-badge">执行失败，已重试</span>}
        <span className="sql-spacer" />
        <Button
          size="small"
          type="text"
          onClick={(event) => {
            event.stopPropagation()
            void copy()
          }}
        >
          复制
        </Button>
      </div>

      {open && (
        <>
          {attempt.reasoning && <p className="sql-reasoning">{attempt.reasoning}</p>}
          <pre className="sql-code">
            <code>{highlighted}</code>
          </pre>
          {attempt.error && <p className="sql-error">{attempt.error}</p>}
        </>
      )}
    </div>
  )
}
