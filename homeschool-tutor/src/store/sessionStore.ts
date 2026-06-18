import { create } from 'zustand'
import type { SessionConfig, Subject, ChatMessage } from '../types'
import { SUBJECTS } from '../types'

interface SessionState {
  // Auth
  token: string | null
  role: 'parent' | 'child' | null
  setAuth: (token: string, role: 'parent' | 'child') => void
  logout: () => void

  // Session configuration (set by parent)
  sessionConfig: SessionConfig | null
  setSessionConfig: (config: SessionConfig) => void

  // Active tutoring state
  currentSubjectIndex: number
  currentSubject: Subject
  history: ChatMessage[]         // full conversation history for API
  displayMessages: Array<{       // UI messages (includes tool results)
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    tool?: string
    timestamp: Date
  }>
  isStreaming: boolean
  sessionStartedAt: Date | null
  subjectsCompleted: Subject[]

  // Actions
  startSession: () => void
  addUserMessage: (content: string) => void
  appendAssistantChunk: (content: string) => void
  addToolMessage: (tool: string, content: string) => void
  finalizeAssistantMessage: () => void
  nextSubject: () => void
  endSession: () => void
  setStreaming: (v: boolean) => void
}

let msgIdCounter = 0
const nextId = () => `msg-${++msgIdCounter}`

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  role: null,
  setAuth: (token, role) => set({ token, role }),
  logout: () =>
    set({
      token: null,
      role: null,
      sessionConfig: null,
      history: [],
      displayMessages: [],
      sessionStartedAt: null,
      currentSubjectIndex: 0,
      subjectsCompleted: [],
    }),

  sessionConfig: null,
  setSessionConfig: (config) => set({ sessionConfig: config }),

  currentSubjectIndex: 0,
  currentSubject: 'morning_time',
  history: [],
  displayMessages: [],
  isStreaming: false,
  sessionStartedAt: null,
  subjectsCompleted: [],

  startSession: () => {
    const config = get().sessionConfig
    if (!config) return
    const firstSubject = config.subjects[0] ?? 'morning_time'
    set({
      sessionStartedAt: new Date(),
      currentSubjectIndex: 0,
      currentSubject: firstSubject,
      history: [],
      displayMessages: [
        {
          id: nextId(),
          role: 'system',
          content: `Welcome, ${config.student_name}! Today we begin with ${
            SUBJECTS.find((s) => s.id === firstSubject)?.label ?? firstSubject
          }. Sage is ready to learn with you. 🌿`,
          timestamp: new Date(),
        },
      ],
      subjectsCompleted: [],
    })
  },

  addUserMessage: (content) => {
    const msg: ChatMessage = { role: 'user', content }
    set((s) => ({
      history: [...s.history, msg],
      displayMessages: [
        ...s.displayMessages,
        { id: nextId(), role: 'user', content, timestamp: new Date() },
      ],
      isStreaming: true,
    }))
    // Reserve a slot for the streaming assistant response
    set((s) => ({
      displayMessages: [
        ...s.displayMessages,
        { id: 'streaming-response', role: 'assistant', content: '', timestamp: new Date() },
      ],
    }))
  },

  appendAssistantChunk: (content) => {
    set((s) => ({
      displayMessages: s.displayMessages.map((m) =>
        m.id === 'streaming-response'
          ? { ...m, content: m.content + content }
          : m
      ),
    }))
  },

  addToolMessage: (tool, content) => {
    set((s) => ({
      displayMessages: [
        ...s.displayMessages.filter((m) => m.id !== 'streaming-response'),
        // keep existing content from the streaming slot if any
        ...s.displayMessages
          .filter((m) => m.id === 'streaming-response' && m.content)
          .map((m) => ({ ...m, id: nextId() })),
        { id: nextId(), role: 'assistant' as const, content, tool, timestamp: new Date() },
        { id: 'streaming-response', role: 'assistant' as const, content: '', timestamp: new Date() },
      ],
    }))
  },

  finalizeAssistantMessage: () => {
    set((s) => {
      const streamingMsg = s.displayMessages.find((m) => m.id === 'streaming-response')
      const fullContent = streamingMsg?.content ?? ''

      const withoutSlot = s.displayMessages.filter((m) => m.id !== 'streaming-response')
      const display = fullContent
        ? [...withoutSlot, { id: nextId(), role: 'assistant' as const, content: fullContent, timestamp: new Date() }]
        : withoutSlot

      const assistantHistoryMsg: ChatMessage = {
        role: 'assistant',
        content: fullContent || '(thinking...)',
      }

      return {
        displayMessages: display,
        history: [...s.history, assistantHistoryMsg],
        isStreaming: false,
      }
    })
  },

  nextSubject: () => {
    const { currentSubjectIndex, sessionConfig, currentSubject } = get()
    if (!sessionConfig) return
    const nextIndex = currentSubjectIndex + 1
    const nextSubj = sessionConfig.subjects[nextIndex]
    set((s) => ({
      currentSubjectIndex: nextIndex,
      currentSubject: nextSubj ?? currentSubject,
      subjectsCompleted: [...s.subjectsCompleted, currentSubject],
      displayMessages: [
        ...s.displayMessages,
        {
          id: nextId(),
          role: 'system' as const,
          content: nextSubj
            ? `✅ Moving to ${SUBJECTS.find((s) => s.id === nextSubj)?.label ?? nextSubj}`
            : '🎉 All subjects complete! Great work today.',
          timestamp: new Date(),
        },
      ],
    }))
  },

  endSession: () => {
    const { currentSubject } = get()
    set((s) => ({
      subjectsCompleted: s.subjectsCompleted.includes(currentSubject)
        ? s.subjectsCompleted
        : [...s.subjectsCompleted, currentSubject],
    }))
  },

  setStreaming: (v) => set({ isStreaming: v }),
}))
