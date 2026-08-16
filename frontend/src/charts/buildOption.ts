/**
 * 用本地结果集重算 ECharts option。
 *
 * 用户切换图表类型时不再请求后端：数据已经在手里，重跑一次 SQL 和 LLM
 * 既慢又费钱，还可能因为模型不确定性返回不一样的结果集。
 */

import type { ChartType } from '../types/events'

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
  scatter: '散点图',
  table: '表格',
  metric: '指标卡',
}

const PALETTE = ['#4c8dff', '#35c46b', '#f0a33a', '#ef5f6b', '#a97bff', '#33c4d6']

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** 整列都能转成数字才算数值列，避免把 "2026-01" 这类当成数值。 */
function isNumericColumn(rows: unknown[][], index: number): boolean {
  if (rows.length === 0) return false
  return rows.every((row) => toNumber(row[index]) !== null)
}

export interface ChartShape {
  labelIndex: number
  valueIndexes: number[]
}

/** 第一个非数值列作标签，其余数值列作系列。全是数值列时用第一列作标签。 */
export function detectShape(columns: string[], rows: unknown[][]): ChartShape {
  const numeric = columns.map((_, index) => isNumericColumn(rows, index))
  const labelIndex = numeric.findIndex((flag) => !flag)
  const resolvedLabel = labelIndex === -1 ? 0 : labelIndex
  const valueIndexes = columns
    .map((_, index) => index)
    .filter((index) => index !== resolvedLabel && numeric[index])

  return { labelIndex: resolvedLabel, valueIndexes }
}

const baseGrid = { left: 64, right: 28, top: 56, bottom: 48 }

export function buildOption(
  chartType: ChartType,
  columns: string[],
  rows: unknown[][],
  title: string,
): Record<string, unknown> | null {
  if (chartType === 'table' || chartType === 'metric') return null
  if (columns.length === 0 || rows.length === 0) return null

  const { labelIndex, valueIndexes } = detectShape(columns, rows)
  if (valueIndexes.length === 0) return null

  const labels = rows.map((row) => String(row[labelIndex] ?? ''))
  const titleBlock = { text: title, left: 'center', textStyle: { fontSize: 14 } }
  const legend =
    valueIndexes.length > 1
      ? { bottom: 0, data: valueIndexes.map((index) => columns[index]) }
      : undefined

  if (chartType === 'pie') {
    const valueIndex = valueIndexes[0]
    return {
      color: PALETTE,
      title: titleBlock,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          name: columns[valueIndex],
          type: 'pie',
          radius: ['38%', '64%'],
          center: ['50%', '54%'],
          data: rows.map((row, index) => ({
            name: labels[index],
            value: toNumber(row[valueIndex]) ?? 0,
          })),
          label: { color: '#c7cddb' },
        },
      ],
    }
  }

  if (chartType === 'scatter') {
    const [xIndex, yIndex] = valueIndexes.length >= 2 ? valueIndexes : [-1, valueIndexes[0]]
    return {
      color: PALETTE,
      title: titleBlock,
      tooltip: { trigger: 'item' },
      grid: baseGrid,
      // 只有一个数值列时用序号当横轴，散点仍然成立
      xAxis: { type: 'value', name: xIndex === -1 ? '序号' : columns[xIndex] },
      yAxis: { type: 'value', name: columns[yIndex] },
      series: [
        {
          type: 'scatter',
          symbolSize: 14,
          data: rows.map((row, index) => [
            xIndex === -1 ? index + 1 : (toNumber(row[xIndex]) ?? 0),
            toNumber(row[yIndex]) ?? 0,
          ]),
        },
      ],
    }
  }

  return {
    color: PALETTE,
    title: titleBlock,
    tooltip: { trigger: 'axis', axisPointer: { type: chartType === 'bar' ? 'shadow' : 'line' } },
    legend,
    grid: { ...baseGrid, bottom: legend ? 64 : baseGrid.bottom },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: chartType === 'bar',
      axisLabel: { interval: labels.length > 12 ? 'auto' : 0, rotate: labels.length > 8 ? 30 : 0 },
    },
    yAxis: { type: 'value' },
    series: valueIndexes.map((index) => ({
      name: columns[index],
      type: chartType,
      data: rows.map((row) => toNumber(row[index]) ?? 0),
      ...(chartType === 'bar'
        ? { barMaxWidth: 48 }
        : { smooth: true, areaStyle: valueIndexes.length === 1 ? { opacity: 0.12 } : undefined }),
    })),
  }
}

/** 指标卡：结果只有一行一列时最合适的呈现。 */
export function isMetricShape(columns: string[], rows: unknown[][]): boolean {
  return rows.length === 1 && columns.length <= 2
}
