/**
 * SSE 事件契约（前端侧）。
 *
 * 与 backend/app/schemas/events.py 一一对应，改动必须两侧同步。
 * 所有入站事件都要过这里的 zod 校验，字段漂移会在第一条事件就报错，
 * 而不是让图表静默不显示。
 */

import { z } from 'zod'

export const stageSchema = z.enum([
  'understanding',
  'generating_sql',
  'executing_sql',
  'building_chart',
  'summarizing',
])
export type Stage = z.infer<typeof stageSchema>

export const chartTypeSchema = z.enum(['bar', 'line', 'pie', 'scatter', 'table', 'metric'])
export type ChartType = z.infer<typeof chartTypeSchema>

export const stageEventSchema = z.object({
  type: z.literal('stage'),
  stage: stageSchema,
  label: z.string(),
})

export const sqlEventSchema = z.object({
  type: z.literal('sql'),
  sql: z.string(),
  reasoning: z.string().default(''),
})

export const rowsEventSchema = z.object({
  type: z.literal('rows'),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  row_count: z.number(),
  truncated: z.boolean().default(false),
})

export const chartEventSchema = z.object({
  type: z.literal('chart'),
  chart_type: chartTypeSchema,
  option: z.record(z.string(), z.unknown()),
})

export const tokenEventSchema = z.object({
  type: z.literal('token'),
  text: z.string(),
})

/** recoverable 为 true 表示后端会自行重试，前端不应据此终止渲染。 */
export const errorEventSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  stage: stageSchema.nullish(),
  recoverable: z.boolean().default(false),
})

/** 终止事件。前端只以此判定一轮结束。 */
export const doneEventSchema = z.object({
  type: z.literal('done'),
  message_id: z.string(),
  elapsed_ms: z.number(),
})

export const streamEventSchema = z.discriminatedUnion('type', [
  stageEventSchema,
  sqlEventSchema,
  rowsEventSchema,
  chartEventSchema,
  tokenEventSchema,
  errorEventSchema,
  doneEventSchema,
])

export type StageEvent = z.infer<typeof stageEventSchema>
export type SqlEvent = z.infer<typeof sqlEventSchema>
export type RowsEvent = z.infer<typeof rowsEventSchema>
export type ChartEvent = z.infer<typeof chartEventSchema>
export type TokenEvent = z.infer<typeof tokenEventSchema>
export type ErrorEvent = z.infer<typeof errorEventSchema>
export type DoneEvent = z.infer<typeof doneEventSchema>
export type StreamEvent = z.infer<typeof streamEventSchema>

export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  llm_configured: z.boolean(),
  db_ready: z.boolean(),
})
export type Health = z.infer<typeof healthSchema>

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Conversation = z.infer<typeof conversationSchema>
