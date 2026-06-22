import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LogOut, FileText, ChevronRight, Loader2, Coffee } from 'lucide-react'
import { getApiMessages, useSessionStore } from '../store/sessionStore'
import SocraticChat from '../components/SocraticChat'
import SubjectNav from '../components/SubjectNav'
import SessionTimer from '../components/SessionTimer'
import { fetchSessionSummary, fetchStudentConfig } from '../services/api'
import { SUBJECT_MAP } from '../types'
import { getTimerConfig, getPhase, fmtTime } from '../utils/gradeTimer'

export default function TutorSession() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const studentParam = searchParams.get('student')

  const {
    token,
    role,
    sessionConfig,
    currentSubject,
    subjectsCompleted,
    sessionStartedAt,
    subjectStartedAt,
    displayMessages,
    isStreaming,
    nextSubject,
    endSession,
    setSessionConfig,
    startSession,
    logout,
  } = useSessionStore()

  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState('')

  // Guard: redirect if no token; load config from server if child has a student param
  useEffect(() => {
    if (!token) { navigate('/'); return }

    if (!sessionConfig) {
      if (studentParam && token) {
        // Child or parent opening a pod session via URL — fetch config from server
        setConfigLoading(true)
        setConfigError('')
        fetchStudentConfig(token, studentParam)
          .then((config) => {
            setSessionConfig(config)
            startSession()
          })
          .catch((err) => setConfigError(err instanceof Error ? err.message : 'Could not load session config.'))
          .finally(() => setConfigLoading(false))
      } else if (role === 'parent') {
        navigate('/setup')
      }
    }
  }, [token, sessionConfig, role, studentParam, navigate, setSessionConfig, startSession])

  if (!sessionConfig) {
    if (configLoading) {
      return (
        <div className="min-h-screen bg-parchment-50 flex flex-col items-center justify-center gap-4">
          <Loader2 size={32} className="text-sage-500 animate-spin" />
          <p className="text-sm text-gray-500">Loading your session…</p>
        </div>
      )
    }
    if (configError) {
      return (
        <div className="min-h-screen bg-parchment-50 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">😕</div>
          <p className="text-gray-700 font-medium">Session not found</p>
          <p className="text-sm text-gray-500 max-w-sm">{configError}</p>
          <button onClick={() => { logout(); navigate('/') }} className="mt-2 text-sm text-sage-600 underline">
            Back to login
          </button>
        </div>
      )
    }
    return null
  }

  const allSubjectsDone = subjectsCompleted.length >= sessionConfig.subjects.length

  // Grade-based timer: K-3 uses per-subject 20-min blocks; 4-8 uses 60-min blocks with 10-min breaks
  const timerCfg = getTimerConfig(sessionConfig.grade)
  const timerStartedAt = timerCfg.isYounger ? subjectStartedAt : sessionStartedAt
  const { phase: currentPhase, remainingSecs } = getPhase(
    timerStartedAt,
    timerCfg.blockMinutes,
    timerCfg.breakMinutes,
  )
  const isOnBreak = currentPhase === 'break'

  const handleEndSession = async () => {
    endSession()
    if (role === 'parent' && token) {
      setSummaryLoading(true)
      setShowSummary(true)
      try {
        const elapsed = sessionStartedAt
          ? Math.floor((Date.now() - sessionStartedAt.getTime()) / 60000)
          : 0
        const text = await fetchSessionSummary(
          token,
          sessionConfig,
          getApiMessages(displayMessages),  // full session, no subject filter
          subjectsCompleted,
          elapsed
        )
        setSummary(text)
      } catch {
        setSummary('Unable to generate summary — check your API connection.')
      } finally {
        setSummaryLoading(false)
      }
    } else {
      // Child ends session — just go back to login
      logout()
      navigate('/')
    }
  }

  if (showSummary) {
    return <SessionSummaryView summary={summary} loading={summaryLoading} onDone={() => { logout(); navigate('/') }} />
  }

  const subjectInfo = SUBJECT_MAP[currentSubject]

  // Build subject progress segments for the header progress bar
  const subjects = sessionConfig.subjects

  // SVG break countdown ring dimensions
  const RING_R = 54
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R
  const breakTotalSecs = timerCfg.breakMinutes * 60
  const breakProgress = breakTotalSecs > 0 ? Math.max(0, remainingSecs) / breakTotalSecs : 0
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - breakProgress)

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-sage-100 shadow-sm flex flex-col pt-safe">
        {/* Main header row */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-3">
            <img src="/agnus-dei.png" alt="Agnus Dei" className="w-8 h-8 flex-shrink-0" />
            {/* Breadcrumb */}
            <nav aria-label="breadcrumb" className="hidden sm:flex items-center gap-1 text-sm">
              <span className="font-display font-bold text-sage-700">Agnus Dei</span>
              <span className="text-gray-300 mx-1">›</span>
              <span className="text-gray-600">{sessionConfig.student_name}</span>
              <span className="text-gray-300 mx-1">›</span>
              <span className="font-medium text-sage-700">{subjectInfo?.label ?? currentSubject}</span>
            </nav>
          </div>

          <SessionTimer
            startedAt={timerStartedAt}
            blockMinutes={timerCfg.blockMinutes}
            breakMinutes={timerCfg.breakMinutes}
            warningMinutes={timerCfg.warningMinutes}
          />

          {role === 'parent' && (
            <button
              onClick={handleEndSession}
              disabled={isStreaming}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-sage-700 border border-gray-200 hover:border-sage-300 rounded-lg px-3 min-h-[44px] transition-colors"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">End &amp; Summarize</span>
            </button>
          )}

          <button
            onClick={() => { logout(); navigate('/') }}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* Subject progress bar — full width, 4px strip at the bottom of the header */}
        <div className="flex h-1" role="progressbar" aria-label="Subject progress">
          {subjects.map((subj) => {
            const isDone = subjectsCompleted.includes(subj)
            const isCurrent = subj === currentSubject
            return (
              <div
                key={subj}
                className={`flex-1 transition-all duration-500 ${
                  isDone
                    ? 'bg-sage-500'
                    : isCurrent
                    ? 'bg-sage-300 animate-pulse'
                    : 'bg-gray-100'
                }`}
              />
            )
          })}
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Sidebar (subjects) — hidden on mobile, visible md+, wider on lg */}
        <aside className="hidden md:flex flex-col w-64 lg:w-64 bg-white border-r border-sage-100 p-4 overflow-y-auto">
          <SubjectNav
            subjects={sessionConfig.subjects}
            currentSubject={currentSubject}
            completed={subjectsCompleted}
            onNext={nextSubject}
            disabled={isStreaming}
          />

          {sessionConfig.current_unit && (
            <div className="mt-4 p-3 bg-parchment-100 rounded-xl text-xs text-gray-600">
              <div className="font-semibold text-gray-700 mb-1">Current Unit</div>
              {sessionConfig.current_unit}
            </div>
          )}

          {sessionConfig.faith_emphasis && (
            <div className="mt-3 p-3 bg-faith-100 rounded-xl text-xs text-faith-600">
              <div className="font-semibold text-faith-700 mb-1">🙏 Faith Focus</div>
              {sessionConfig.faith_emphasis}
            </div>
          )}

          {allSubjectsDone && (
            <button
              onClick={handleEndSession}
              className="mt-4 w-full py-2.5 bg-sage-500 text-white rounded-lg text-sm font-medium hover:bg-sage-600 transition-colors flex items-center justify-center gap-2"
            >
              <FileText size={14} />
              View Summary
            </button>
          )}
        </aside>

        {/* Chat */}
        <main className="flex-1 flex flex-col overflow-hidden p-4 relative">
          {isOnBreak && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-parchment-50/90 backdrop-blur-sm p-6">
              <div className="bg-white rounded-2xl border border-amber-200 shadow-lg p-8 max-w-sm w-full text-center">
                <Coffee size={28} className="mx-auto mb-3 text-amber-500" />
                <h2 className="text-xl font-display font-bold text-gray-800 mb-2">Break Time!</h2>
                <p className="text-sm text-gray-600 mb-1">
                  {sessionConfig.student_name}, you've been working hard.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Step away from the screen, have a snack, and come back refreshed.
                </p>

                {/* Animated countdown ring */}
                <div className="relative inline-flex items-center justify-center mb-3">
                  <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
                    {/* Background circle */}
                    <circle cx="64" cy="64" r={RING_R} fill="#fffbeb" stroke="#fef3c7" strokeWidth="10" />
                    {/* Progress arc */}
                    <circle
                      cx="64"
                      cy="64"
                      r={RING_R}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={strokeDashoffset}
                      transform="rotate(-90 64 64)"
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                  {/* Timer text centered over ring */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-mono font-bold text-amber-600 leading-none">
                      {fmtTime(remainingSecs)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400">until your next learning block</p>
              </div>
            </div>
          )}
          <SocraticChat breakActive={isOnBreak} />
        </main>
      </div>

      {/* Mobile bottom bar */}
      <div className="md:hidden bg-white border-t border-sage-100 px-4 py-3 pb-safe flex items-center gap-3">
        <span className="text-xl leading-none">{subjectInfo?.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-700 truncate">{subjectInfo?.label}</div>
        </div>
        <button
          onClick={nextSubject}
          disabled={isStreaming || allSubjectsDone}
          className="flex items-center gap-1.5 bg-sage-500 text-white rounded-full px-4 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:bg-sage-600"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function SessionSummaryView({
  summary,
  loading,
  onDone,
}: {
  summary: string
  loading: boolean
  onDone: () => void
}) {
  return (
    <div className="min-h-screen bg-parchment-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-sage-100 w-full max-w-xl p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📋</div>
          <h1 className="text-xl font-display font-bold text-gray-800">Session Summary</h1>
          <p className="text-sm text-gray-500 mt-1">
            Prepared by Bede · for your records
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sage-500 animate-pulse-soft">
            <div className="text-2xl mb-3">✍️</div>
            <p className="text-sm">Bede is writing your summary…</p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap bg-parchment-50 rounded-xl p-5 border border-parchment-200 font-serif text-sm">
            {summary}
          </div>
        )}

        <button
          onClick={onDone}
          className="mt-6 w-full py-3 bg-sage-500 text-white rounded-xl font-medium hover:bg-sage-600 transition-colors"
        >
          Done — Return Home
        </button>
      </div>
    </div>
  )
}
