import {
  conversationSchema,
  healthSchema,
  type Conversation,
  type Health,
} from '../types/events'

/** Phase 1、2 走 Mock；Phase 4 把 VITE_USE_MOCK 设为 false 即切换到真实接口。 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

const conversationBase = USE_MOCK ? '/api/mock/conversations' : '/api/conversations'

async function request(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} 失败: ${response.status}`)
  }
  return response.status === 204 ? null : response.json()
}

export async function fetchHealth(): Promise<Health> {
  return healthSchema.parse(await request('/api/health'))
}

export async function listConversations(): Promise<Conversation[]> {
  return conversationSchema.array().parse(await request(conversationBase))
}

export async function createConversation(title = '新会话'): Promise<Conversation> {
  return conversationSchema.parse(
    await request(conversationBase, { method: 'POST', body: JSON.stringify({ title }) }),
  )
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  return conversationSchema.parse(
    await request(`${conversationBase}/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  )
}

export async function deleteConversation(id: string): Promise<void> {
  await request(`${conversationBase}/${id}`, { method: 'DELETE' })
}
