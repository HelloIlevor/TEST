/**
 * 状态中枢。所有 UI 组件只从这里读状态、调 action，不直接碰网络与事件解析。
 */

import { create } from 'zustand'

import {
  createConversation as apiCreateConversation,
  deleteConversation as apiDeleteConversation,
  listConversations as apiListConversations,
  renameConversation as apiRenameConversation,
} from '../api/client'
import { StreamInterruptedError, streamChat, type Scenario } from '../api/sse'
import {
  createAssistantMessage,
  createUserMessage,
  type AssistantMessage,
  type Message,
} from '../types/chat'
import type { ChartType, Conversation } from '../types/events'
import { applyEvent } from './applyEvent'

/** AbortController 不放进 state：它不参与渲染，放进去只会带来无谓的重渲染。 */
let controller: AbortController | null = null

const uid = () => crypto.randomUUID()

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

interface ChatState {
  conversations: Conversation[]
  currentId: string | null
  conversationsLoading: boolean
  conversationsError: string | null

  messages: Record<string, Message[]>
  streaming: boolean

  /** 右侧展示哪条消息的图表；null 表示跟随最新。 */
  selectedChartMessageId: string | null
  /** 用户手动切换的图表类型；null 表示用后端给的类型。 */
  chartTypeOverride: ChartType | null

  loadConversations: () => Promise<void>
  addConversation: () => Promise<void>
  selectConversation: (id: string) => void
  renameConversation: (id: string, title: string) => Promise<void>
  removeConversation: (id: string) => Promise<void>

  send: (question: string, scenario?: Scenario) => Promise<void>
  abort: () => void
  retry: (messageId: string) => Promise<void>

  selectChart: (messageId: string | null) => void
  setChartType: (type: ChartType | null) => void
}

export const useChatStore = create<ChatState>((set, get) => {
  /** 按 id 就地替换某条助手消息。 */
  function patchMessage(
    conversationId: string,
    messageId: string,
    updater: (message: AssistantMessage) => AssistantMessage,
  ) {
    set((state) => {
      const list = state.messages[conversationId]
      if (!list) return state
      return {
        messages: {
          ...state.messages,
          [conversationId]: list.map((message) =>
            message.role === 'assistant' && message.id === messageId ? updater(message) : message,
          ),
        },
      }
    })
  }

  async function runStream(
    conversationId: string,
    messageId: string,
    question: string,
    scenario?: Scenario,
  ) {
    controller = new AbortController()
    set({ streaming: true })

    try {
      await streamChat({
        conversationId,
        question,
        scenario,
        signal: controller.signal,
        onEvents: (events) => {
          patchMessage(conversationId, messageId, (message) =>
            events.reduce((accumulated, event) => applyEvent(accumulated, event), message),
          )
        },
      })
    } catch (error) {
      const aborted = controller?.signal.aborted
      patchMessage(conversationId, messageId, (message) => ({
        ...message,
        status: aborted ? 'aborted' : 'failed',
        error: aborted
          ? null
          : {
              code: error instanceof StreamInterruptedError ? 'stream_interrupted' : 'network_error',
              message: errorText(error),
            },
      }))
    } finally {
      controller = null
      set({ streaming: false })
    }
  }

  return {
    conversations: [],
    currentId: null,
    conversationsLoading: false,
    conversationsError: null,
    messages: {},
    streaming: false,
    selectedChartMessageId: null,
    chartTypeOverride: null,

    loadConversations: async () => {
      set({ conversationsLoading: true, conversationsError: null })
      try {
        const conversations = await apiListConversations()
        set((state) => ({
          conversations,
          conversationsLoading: false,
          currentId: state.currentId ?? conversations[0]?.id ?? null,
        }))
        if (conversations.length === 0) await get().addConversation()
      } catch (error) {
        set({ conversationsLoading: false, conversationsError: errorText(error) })
      }
    },

    addConversation: async () => {
      try {
        const conversation = await apiCreateConversation()
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          currentId: conversation.id,
          messages: { ...state.messages, [conversation.id]: [] },
          selectedChartMessageId: null,
          chartTypeOverride: null,
        }))
      } catch (error) {
        set({ conversationsError: errorText(error) })
      }
    },

    selectConversation: (id) => {
      if (get().streaming) return
      set({ currentId: id, selectedChartMessageId: null, chartTypeOverride: null })
    },

    renameConversation: async (id, title) => {
      const previous = get().conversations
      // 先改本地再发请求，输入框不会因为等网络而卡住
      set((state) => ({
        conversations: state.conversations.map((item) =>
          item.id === id ? { ...item, title } : item,
        ),
      }))
      try {
        await apiRenameConversation(id, title)
      } catch (error) {
        set({ conversations: previous, conversationsError: errorText(error) })
      }
    },

    removeConversation: async (id) => {
      const previous = get().conversations
      set((state) => {
        const conversations = state.conversations.filter((item) => item.id !== id)
        const messages = { ...state.messages }
        delete messages[id]
        return {
          conversations,
          messages,
          currentId: state.currentId === id ? (conversations[0]?.id ?? null) : state.currentId,
          selectedChartMessageId: null,
          chartTypeOverride: null,
        }
      })
      try {
        await apiDeleteConversation(id)
        if (get().conversations.length === 0) await get().addConversation()
      } catch (error) {
        set({ conversations: previous, conversationsError: errorText(error) })
      }
    },

    send: async (question, scenario) => {
      const { currentId, streaming, conversations, messages } = get()
      if (!currentId || streaming) return

      const messageId = uid()
      const existing = messages[currentId] ?? []

      set((state) => ({
        messages: {
          ...state.messages,
          [currentId]: [
            ...existing,
            createUserMessage(uid(), question),
            createAssistantMessage(messageId, question),
          ],
        },
        selectedChartMessageId: messageId,
        chartTypeOverride: null,
      }))

      // 首次提问时用问题给会话命名，省去用户手动重命名
      const conversation = conversations.find((item) => item.id === currentId)
      if (existing.length === 0 && conversation?.title === '新会话') {
        const title = question.length > 20 ? `${question.slice(0, 20)}…` : question
        void get().renameConversation(currentId, title)
      }

      await runStream(currentId, messageId, question, scenario)
    },

    abort: () => controller?.abort(),

    retry: async (messageId) => {
      const { currentId, streaming, messages } = get()
      if (!currentId || streaming) return

      const target = messages[currentId]?.find(
        (message): message is AssistantMessage =>
          message.role === 'assistant' && message.id === messageId,
      )
      if (!target) return

      // 重置为初始态再重跑，避免上一次的半截结果和新流混在一起
      patchMessage(currentId, messageId, (message) =>
        createAssistantMessage(message.id, message.question),
      )
      set({ selectedChartMessageId: messageId, chartTypeOverride: null })
      await runStream(currentId, messageId, target.question)
    },

    selectChart: (messageId) => set({ selectedChartMessageId: messageId, chartTypeOverride: null }),
    setChartType: (type) => set({ chartTypeOverride: type }),
  }
})

/**
 * 当前会话的消息列表。
 *
 * 空列表必须是同一个常量引用：选择器每次返回新的 []，
 * React 会认为快照一直在变，进而陷入无限重渲染。
 */
const EMPTY_MESSAGES: Message[] = []

export function useCurrentMessages(): Message[] {
  return useChatStore((state) =>
    state.currentId ? (state.messages[state.currentId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )
}

/** 右侧图表要展示的消息：优先用户选中的，否则取最新一条有图的。 */
export function useActiveChartMessage(): AssistantMessage | null {
  const messages = useCurrentMessages()
  const selectedId = useChatStore((state) => state.selectedChartMessageId)

  const assistants = messages.filter(
    (message): message is AssistantMessage => message.role === 'assistant',
  )
  if (selectedId) {
    const selected = assistants.find((message) => message.id === selectedId)
    if (selected) return selected
  }
  return assistants.filter((message) => message.chartOption).at(-1) ?? null
}
