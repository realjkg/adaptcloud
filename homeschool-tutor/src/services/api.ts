import type { SessionConfig, Subject, ChatMessage, StreamChunk } from '../types'

const BASE = '/api'

// ── Auth ────────────────────────────────────────────────────────────────────

export async function login(role: 'parent' | 'child', credential: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, credential }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Login failed')
  }
  const data = await res.json()
  return data.access_token
}

// ── Streaming tutor chat ─────────────────────────────────────────────────────

export async function* streamTutorChat(
  token: string,
  config: SessionConfig,
  subject: Subject,
  history: ChatMessage[],
  childMessage: string,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${BASE}/tutor/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_config: config,
      current_subject: subject,
      conversation_history: history,
      child_message: childMessage,
    }),
    signal,
  })

  if (!res.ok) {
    throw new Error('Tutor request failed — check your connection')
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim()
        if (!jsonStr) continue
        try {
          const chunk: StreamChunk = JSON.parse(jsonStr)
          yield chunk
          if (chunk.type === 'done') return
        } catch {
          // skip malformed chunk
        }
      }
    }
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface SystemStatus {
  voice_profiles_enrolled: number
  student_names: string[]
  encryption: string
  key_storage: string
  audit_log: string
}

export async function fetchSystemStatus(token: string): Promise<SystemStatus> {
  const res = await fetch(`${BASE}/admin/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Status unavailable')
  return res.json()
}

// ── Session summary ──────────────────────────────────────────────────────────

export async function fetchSessionSummary(
  token: string,
  config: SessionConfig,
  history: ChatMessage[],
  subjectsCompleted: Subject[],
  durationMinutes: number
): Promise<string> {
  const res = await fetch(`${BASE}/tutor/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_config: config,
      conversation_history: history,
      subjects_completed: subjectsCompleted,
      duration_minutes: durationMinutes,
    }),
  })
  if (!res.ok) throw new Error('Failed to generate summary')
  const data = await res.json()
  return data.summary
}
