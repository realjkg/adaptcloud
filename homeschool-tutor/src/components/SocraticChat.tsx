import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { streamTutorChat } from '../services/api'
import { getApiMessages, useSessionStore } from '../store/sessionStore'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useTextToSpeech } from '../hooks/useTextToSpeech'
import { SUBJECT_MAP } from '../types'

export default function SocraticChat({ breakActive = false }: { breakActive?: boolean }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastAssistantRef = useRef('')  // track last spoken text to avoid re-speaking

  const {
    token,
    sessionConfig,
    currentSubject,
    subjectStart,
    displayMessages,
    isStreaming,
    startAssistantStream,
    addUserMessage,
    appendAssistantChunk,
    addToolMessage,
    finalizeAssistantMessage,
    setStreaming,
  } = useSessionStore()

  // ── Text-to-speech: Bede speaks its responses ────────────────────────────
  const { speak, stop: stopSpeech, toggle: toggleTTS, isSpeaking, enabled: ttsEnabled, isSupported: ttsSupported } = useTextToSpeech()

  // ── Speech recognition: child speaks instead of typing ──────────────────
  const { isListening, interim, isSupported: sttSupported, start: startListening, stop: stopListening } = useSpeechRecognition({
    onFinal: (transcript) => {
      setInput((prev) => (prev ? prev + ' ' + transcript : transcript))
    },
  })

  // Track which subjects have already received their opening message
  const openerFiredRef = useRef(new Set<string>())

  // sendOpener reads live store state to avoid stale-closure issues during streaming
  const sendOpener = useCallback(async () => {
    const state = useSessionStore.getState()
    if (state.isStreaming || !state.token || !state.sessionConfig) return

    state.startAssistantStream()
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const stream = streamTutorChat(
        state.token,
        state.sessionConfig,
        state.currentSubject,
        [],          // no prior history — clean slate for each subject opener
        '[START]',
        abortRef.current.signal,
      )
      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.content) {
          appendAssistantChunk(chunk.content)
        } else if (chunk.type === 'tool' && chunk.content) {
          addToolMessage(chunk.tool ?? 'tool', chunk.content)
          speak(chunk.content)
        } else if (chunk.type === 'assessment') {
          // Silent server-side narration score — no UI change for child
        } else if (chunk.type === 'done') {
          break
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        addToolMessage('error', `⚠️ ${err.message}`)
      }
    } finally {
      finalizeAssistantMessage()
      setStreaming(false)
    }
  }, [appendAssistantChunk, addToolMessage, finalizeAssistantMessage, setStreaming, speak])

  // Fire opener once per subject — when subject changes and session is ready
  useEffect(() => {
    if (!sessionConfig || !token) return
    if (openerFiredRef.current.has(currentSubject)) return
    openerFiredRef.current.add(currentSubject)
    sendOpener()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSubject, !!sessionConfig, !!token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages])

  // Auto-speak new assistant messages
  useEffect(() => {
    const lastAssistant = displayMessages
      .filter((m) => m.role === 'assistant' && m.id !== 'streaming-response' && !m.tool)
      .at(-1)

    if (lastAssistant && lastAssistant.content && lastAssistant.content !== lastAssistantRef.current) {
      lastAssistantRef.current = lastAssistant.content
      speak(lastAssistant.content)
    }
  }, [displayMessages, speak])

  const send = useCallback(async () => {
    const msg = input.trim()
    if (!msg || isStreaming || !token || !sessionConfig) return

    stopSpeech()      // stop any ongoing speech when child replies
    stopListening()
    setInput('')

    // Snapshot current-subject history BEFORE addUserMessage mutates displayMessages
    const apiHistory = getApiMessages(displayMessages, subjectStart)
    addUserMessage(msg)

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const stream = streamTutorChat(
        token,
        sessionConfig,
        currentSubject,
        apiHistory,
        msg,
        abortRef.current.signal
      )

      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.content) {
          appendAssistantChunk(chunk.content)
        } else if (chunk.type === 'tool' && chunk.content) {
          addToolMessage(chunk.tool ?? 'tool', chunk.content)
          // Speak tool responses too (narration prompts, hints, etc.)
          speak(chunk.content)
        } else if (chunk.type === 'assessment') {
          // Silent server-side narration score — no UI change for child
        } else if (chunk.type === 'done') {
          break
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        addToolMessage('error', `⚠️ ${err.message}`)
      }
    } finally {
      finalizeAssistantMessage()
      setStreaming(false)
    }
  }, [
    input, isStreaming, token, sessionConfig, currentSubject, subjectStart, displayMessages,
    addUserMessage, appendAssistantChunk, addToolMessage, finalizeAssistantMessage,
    setStreaming, stopSpeech, stopListening, speak,
  ])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const toggleMic = () => {
    if (isListening) stopListening()
    else startListening()
  }

  const subjectInfo = SUBJECT_MAP[currentSubject]

  return (
    <div className="flex flex-col h-full bg-parchment-50 rounded-xl overflow-hidden border border-parchment-200 shadow-sm">
      {/* Subject header with TTS toggle */}
      <div className={`px-4 py-3 border-b ${subjectInfo?.color ?? 'bg-sage-50 border-sage-200'} flex items-center gap-2`}>
        <span className="text-xl">{subjectInfo?.icon}</span>
        <div className="flex-1">
          <div className="font-semibold text-sm">{subjectInfo?.label}</div>
          <div className="text-xs opacity-70">{subjectInfo?.description}</div>
        </div>
        {/* TTS toggle */}
        {ttsSupported && (
          <button
            onClick={toggleTTS}
            title={ttsEnabled ? 'Mute Bede' : 'Unmute Bede'}
            className={`p-1.5 rounded-lg transition-colors ${
              ttsEnabled ? 'text-sage-600 bg-white/50 hover:bg-white/80' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {ttsEnabled ? (
              isSpeaking ? <Volume2 size={16} className="animate-pulse" /> : <Volume2 size={16} />
            ) : (
              <VolumeX size={16} />
            )}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {displayMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} studentName={sessionConfig?.student_name ?? 'You'} />
        ))}
        {isStreaming &&
          displayMessages.find((m) => m.id === 'streaming-response')?.content === '' && (
            <div className="flex items-center gap-2 text-sage-500 text-sm animate-pulse-soft">
              <Loader2 size={14} className="animate-spin" />
              <span>Bede is thinking…</span>
            </div>
          )}
        {/* Interim speech-to-text preview */}
        {isListening && interim && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-sage-200/60 text-sage-800 italic border border-sage-200 animate-pulse-soft">
              {interim}…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 bg-white border-t border-parchment-200">
        <div className="flex gap-2 items-end">
          {/* Mic button */}
          {sttSupported && (
            <button
              onClick={toggleMic}
              disabled={isStreaming || breakActive}
              title={isListening ? 'Stop listening' : 'Speak your answer'}
              className={`p-2.5 rounded-lg transition-colors flex-shrink-0 ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-sage-100 text-sage-600 hover:bg-sage-200 disabled:opacity-40'
              }`}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={isStreaming || breakActive}
            placeholder={
              breakActive
                ? '☕ On a break — Bede will be here when you return'
                : isListening
                ? '🎤 Listening… speak now'
                : sttSupported
                ? 'Type or tap the mic to speak…'
                : 'Share your thoughts or answer Bede\'s question…'
            }
            rows={2}
            className="flex-1 resize-none rounded-lg border border-sage-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400 bg-white placeholder-gray-400 disabled:bg-gray-50"
          />

          <button
            onClick={send}
            disabled={isStreaming || breakActive || !input.trim()}
            className="p-2.5 rounded-lg bg-sage-500 text-white hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {sttSupported ? 'Enter to send · 🎤 mic for voice input' : 'Press Enter to send · Shift+Enter for new line'}
        </p>
      </div>
    </div>
  )
}

interface MsgProps {
  msg: {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    tool?: string
    timestamp: Date
  }
  studentName: string
}

function MessageBubble({ msg, studentName }: MsgProps) {
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-gray-400 bg-white border border-gray-100 rounded-full px-3 py-1 italic">
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.tool) {
    const toolColors: Record<string, string> = {
      request_narration: 'bg-amber-50 border-amber-200 text-amber-800',
      offer_socratic_hint: 'bg-blue-50 border-blue-200 text-blue-800',
      celebrate_discovery: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      connect_to_faith: 'bg-purple-50 border-purple-200 text-purple-800',
    }
    const cls = toolColors[msg.tool] ?? 'bg-gray-50 border-gray-200 text-gray-800'
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm animate-slide-up ${cls}`}>
        {msg.content}
      </div>
    )
  }

  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-sage-500 text-white rounded-br-sm'
            : 'bg-white border border-sage-100 text-gray-800 rounded-bl-sm shadow-sm'
        }`}
      >
        {!isUser && <div className="text-xs font-semibold text-sage-600 mb-1">Bede</div>}
        {isUser && <div className="text-xs font-semibold text-sage-100 mb-1">{studentName}</div>}
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    </div>
  )
}
