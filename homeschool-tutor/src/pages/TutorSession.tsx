import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LogOut, FileText, ChevronDown, Loader2, AlertCircle, PenLine } from 'lucide-react'
import { getApiMessages, useSessionStore } from '../store/sessionStore'
import SocraticChat from '../components/SocraticChat'
import SubjectDrawer from '../components/SubjectDrawer'
import SubjectNav from '../components/SubjectNav'
import { fetchSessionSummary, fetchStudentConfig } from '../services/api'
import { SUBJECT_MAP } from '../types'
import { getTimerConfig, getPhase, fmtTime } from '../utils/gradeTimer'
import { Coffee } from 'lucide-react'

export default function TutorSession() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const studentParam = searchParams.get('student')

  const {
    token, role, sessionConfig, currentSubject, subjectsCompleted,
    sessionStartedAt, subjectStartedAt, displayMessages, isStreaming,
    nextSubject, endSession, setSessionConfig, startSession, logout,
  } = useSessionStore()

  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!token) { navigate('/'); return }
    if (!sessionConfig) {
      if (studentParam && token) {
        setConfigLoading(true)
        setConfigError('')
        fetchStudentConfig(token, studentParam)
          .then((config) => { setSessionConfig(config); startSession() })
          .catch((err) => setConfigError(err instanceof Error ? err.message : 'Could not load session config.'))
          .finally(() => setConfigLoading(false))
      } else if (role === 'parent') {
        navigate('/setup')
      }
    }
  }, [token, sessionConfig, role, studentParam, navigate, setSessionConfig, startSession])

  if (!sessionConfig) {
    if (configLoading) return (
      <div className="min-h-screen bg-parchment-50 flex flex-col items-center justify-center gap-4">
        <Loader2 size={28} className="text-navy-500 animate-spin" />
        <p className="text-sm text-gray-500">Loading your session…</p>
      </div>
    )
    if (configError) return (
      <div className="min-h-screen bg-parchment-50 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertCircle size={36} className="text-gray-400" />
        <p className="text-gray-700 font-medium">Session not found</p>
        <p className="text-sm text-gray-500 max-w-sm">{configError}</p>
        <button onClick={() => { logout(); navigate('/') }} className="mt-2 text-sm text-navy-600 underline">
          Back to login
        </button>
      </div>
    )
    return null
  }

  const timerCfg = getTimerConfig(sessionConfig.grade)
  const timerStartedAt = timerCfg.isYounger ? subjectStartedAt : sessionStartedAt
  const { phase: currentPhase, remainingSecs } = getPhase(timerStartedAt, timerCfg.blockMinutes, timerCfg.breakMinutes)
  const isOnBreak = currentPhase === 'break'
  const isWarning = !isOnBreak && remainingSecs > 0 && remainingSecs <= timerCfg.warningMinutes * 60

  const handleEndSession = async () => {
    endSession()
    if (role === 'parent' && token) {
      setSummaryLoading(true)
      setShowSummary(true)
      try {
        const elapsed = sessionStartedAt ? Math.floor((Date.now() - sessionStartedAt.getTime()) / 60000) : 0
        const text = await fetchSessionSummary(token, sessionConfig, getApiMessages(displayMessages), subjectsCompleted, elapsed)
        setSummary(text)
      } catch {
        setSummary('Unable to generate summary — check your API connection.')
      } finally {
        setSummaryLoading(false)
      }
    } else {
      logout(); navigate('/')
    }
  }

  if (showSummary) return (
    <SessionSummaryView summary={summary} loading={summaryLoading} onDone={() => { logout(); navigate('/') }} />
  )

  const subjectInfo = SUBJECT_MAP[currentSubject]

  return (
    <div className="h-screen flex flex-col bg-parchment-50 overflow-hidden">

      {/* ── Header ── */}
      <header className="pt-safe bg-midnight-900 border-b border-midnight-700 shrink-0 h-12 flex items-center px-4 gap-2">
        <img src="/agnus-dei.png" alt="Agnus Dei" className="w-6 h-6 shrink-0" />

        <span className="font-display text-xs tracking-wider text-amber-300 truncate max-w-[100px]">
          {sessionConfig.student_name}
        </span>

        {/* Subject pill — phone/tablet small only; sidebar replaces this at lg */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="lg:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-midnight-700 text-amber-300 font-display text-[10px] tracking-wider border border-midnight-500 hover:bg-midnight-600 transition-colors shrink-0"
        >
          {subjectInfo && <subjectInfo.Icon size={12} />}
          <span className="max-w-[120px] truncate">{subjectInfo?.label}</span>
          <ChevronDown size={11} />
        </button>

        {/* Static subject label at lg — sidebar is the interactive list */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-midnight-700 text-amber-300 font-display text-[10px] tracking-wider border border-midnight-500 shrink-0 pointer-events-none">
          {subjectInfo && <subjectInfo.Icon size={12} />}
          <span className="max-w-[160px] truncate">{subjectInfo?.label}</span>
        </div>

        <div className="flex-1" />

        {/* Timer — warning zone or break only */}
        {(isWarning || isOnBreak) && (
          <div className={`text-xs font-display tracking-wider tabular-nums ${
            isOnBreak ? 'text-amber-400' : 'text-coral-400'
          }`}>
            {fmtTime(remainingSecs)}
          </div>
        )}

        {role === 'parent' && (
          <button
            onClick={handleEndSession}
            disabled={isStreaming}
            title="End session & generate summary"
            className="p-2 text-midnight-300 hover:text-amber-300 rounded-lg hover:bg-midnight-700 transition-colors disabled:opacity-40"
          >
            <FileText size={15} />
          </button>
        )}

        <button
          onClick={() => { logout(); navigate('/') }}
          title="Log out"
          className="p-2 text-midnight-300 hover:text-midnight-100 rounded-lg hover:bg-midnight-800 transition-colors"
        >
          <LogOut size={15} />
        </button>
      </header>

      {/* ── Body: sidebar (lg+) + chat ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Persistent sidebar — lg and above only */}
        <SubjectNav
          subjects={sessionConfig.subjects}
          currentSubject={currentSubject}
          completed={subjectsCompleted}
          config={sessionConfig}
          onNext={nextSubject}
          disabled={isStreaming}
          sessionStartedAt={sessionStartedAt}
        />

        {/* Chat column */}
        <main className="flex-1 overflow-hidden relative">
          {isOnBreak && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-parchment-50/90 backdrop-blur-sm p-6">
              <div className="bg-white rounded-2xl border border-amber-200 shadow-xl p-8 max-w-sm w-full text-center">
                <Coffee size={36} className="mx-auto mb-4 text-amber-500" />
                <h2 className="text-xl font-display font-bold text-gray-800 mb-2">Break Time</h2>
                <p className="text-sm text-gray-600 mb-1">{sessionConfig.student_name}, you've been working hard.</p>
                <p className="text-sm text-gray-500 mb-6">Step away, have a snack, come back refreshed.</p>
                <div className="text-3xl font-mono font-bold text-amber-600 mb-1">{fmtTime(remainingSecs)}</div>
                <p className="text-xs text-gray-400">until your next learning block</p>
              </div>
            </div>
          )}
          <SocraticChat breakActive={isOnBreak} gradeStage={sessionConfig.grade_stage} />
        </main>
      </div>

      {/* ── Subject drawer — small screens only ── */}
      <SubjectDrawer
        open={drawerOpen}
        subjects={sessionConfig.subjects}
        currentSubject={currentSubject}
        completed={subjectsCompleted}
        config={sessionConfig}
        onNext={nextSubject}
        onClose={() => setDrawerOpen(false)}
        disabled={isStreaming}
      />
    </div>
  )
}

function SessionSummaryView({ summary, loading, onDone }: { summary: string; loading: boolean; onDone: () => void }) {
  return (
    <div className="min-h-screen bg-parchment-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-navy-100 w-full max-w-xl p-8">
        <div className="text-center mb-6">
          <FileText size={36} className="mx-auto mb-3 text-navy-500" />
          <h1 className="text-xl font-display font-bold text-gray-800">Session Summary</h1>
          <p className="text-sm text-gray-500 mt-1">Prepared by Bede · for your records</p>
        </div>
        {loading ? (
          <div className="text-center py-12 text-navy-500 animate-pulse-soft">
            <PenLine size={28} className="mx-auto mb-3" />
            <p className="text-sm">Bede is writing your summary…</p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap bg-parchment-50 rounded-xl p-5 border border-parchment-200 font-serif text-sm">
            {summary}
          </div>
        )}
        <button
          onClick={onDone}
          className="mt-6 w-full py-3 bg-navy-500 text-white rounded-xl font-semibold hover:bg-navy-600 transition-colors"
        >
          Done — Return Home
        </button>
      </div>
    </div>
  )
}
