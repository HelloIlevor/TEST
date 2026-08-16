import { Table } from 'antd'
import { useMemo } from 'react'

interface ResultTableProps {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
}

/** 超过这个行数就开启虚拟滚动，避免一次性铺出上千个 DOM 节点。 */
const VIRTUAL_THRESHOLD = 50

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '—'
  return String(value)
}

export function ResultTable({ columns, rows, rowCount, truncated }: ResultTableProps) {
  const tableColumns = useMemo(
    () =>
      columns.map((column, index) => ({
        title: column,
        dataIndex: String(index),
        key: String(index),
        // 列多时给固定宽度，配合 scroll.x 横向滚动，而不是把每列压扁到看不清
        width: columns.length > 4 ? 140 : undefined,
        ellipsis: true,
        render: (value: unknown) => renderCell(value),
      })),
    [columns],
  )

  const dataSource = useMemo(
    () =>
      rows.map((row, rowIndex) => {
        const record: Record<string, unknown> = { key: rowIndex }
        row.forEach((cell, cellIndex) => {
          record[String(cellIndex)] = cell
        })
        return record
      }),
    [rows],
  )

  if (columns.length === 0) return null

  const virtual = rows.length > VIRTUAL_THRESHOLD

  return (
    <div className="result-table">
      <div className="result-meta">
        <span>
          {columns.length} 列 × {rowCount} 行
        </span>
        {truncated && <span className="result-truncated">结果已截断，仅展示前 {rows.length} 行</span>}
      </div>
      <Table
        size="small"
        bordered
        columns={tableColumns}
        dataSource={dataSource}
        pagination={false}
        virtual={virtual}
        scroll={{
          x: columns.length > 4 ? columns.length * 140 : undefined,
          y: rows.length > 8 ? 280 : undefined,
        }}
      />
    </div>
  )
}
