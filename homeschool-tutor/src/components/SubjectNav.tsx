import { useState, useEffect } from 'react'
import { CheckCircle } from 'lucide-react'
import { SUBJECT_MAP } from '../types'
import type { Subject, SessionConfig } from '../types'

interface Props {
  subjects: Subject[]
  currentSubject: Subject
  completed: Subject[]
  config: SessionConfig
  onNext: () => void
  disabled?: boolean
  sessionStartedAt: Date | null
}

const SESSION_MAX_SECS = 120 * 60

export default function SubjectNav({
  subjects, currentSubject, completed, config, onNext, disabled, sessionStartedAt,
}: Props) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const elapsed = sessionStartedAt
    ? Math.floor((Date.now() - sessionStartedAt.getTime()) / 1000)
    : 0
  const elapsedMin = Math.floor(elapsed / 60)
  const sessionPct = Math.min(100, (elapsed / SESSION_MAX_SECS) * 100)
  const isNearLimit = sessionPct >= 75
  const isAtLimit   = sessionPct >= 91

  const currentIndex = subjects.indexOf(currentSubject)
  const hasNext = currentIndex < subjects.length - 1
  const allDone = completed.length >= subjects.length

  return (
    <aside className="hidden lg:flex flex-col w-64 xl:w-72 border-r border-navy-100 bg-white shrink-0 h-full overflow-hidden">

      {/* Identity */}
      <div className="px-5 pt-5 pb-4 border-b border-navy-50">
        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">Today's Plan</p>
        <p className="text-sm font-medium text-gray-600">{config.student_name}</p>
      </div>

      {/* 2-hour session bar */}
      <div className="px-5 py-3 border-b border-navy-50">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-400">Session</span>
          <span className={`tabular-nums font-semibold ${
            isAtLimit ? 'text-red-500' : isNearLimit ? 'text-amber-600' : 'text-navy-500'
          }`}>
            {elapsedMin} / 120 min
          </span>
        </div>
        <div className="h-1.5 bg-navy-50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              isAtLimit ? 'bg-red-400' : isNearLimit ? 'bg-amber-400' : 'bg-navy-300'
            }`}
            style={{ width: `${sessionPct}%` }}
          />
        </div>
        {isNearLimit && !isAtLimit && (
          <p className="text-xs text-amber-600 mt-1">Approaching session limit</p>
        )}
        {isAtLimit && (
          <p className="text-xs text-red-500 mt-1 font-medium">Session limit reached</p>
        )}
      </div>

      {/* Subject list — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {subjects.map((subj) => {
          const info = SUBJECT_MAP[subj]
          const isCurrent = subj === currentSubject
          const isDone    = completed.includes(subj)

          return (
            <div
              key={subj}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors ${
                isCurrent ? 'bg-navy-50' : ''
              }`}
            >
              {isDone ? (
                <CheckCircle size={14} className="text-navy-400 shrink-0" />
              ) : isCurrent ? (
                <div className="w-3.5 h-3.5 rounded-full bg-navy-500 shrink-0 ring-2 ring-navy-100 ring-offset-1" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 shrink-0" />
              )}

              <info.Icon
                size={13}
                className={`shrink-0 ${
                  isCurrent ? 'text-navy-600' : isDone ? 'text-gray-300' : 'text-gray-400'
                }`}
              />

              <span className={`flex-1 text-xs leading-snug ${
                isCurrent
                  ? 'font-semibold text-navy-700'
                  : isDone
                  ? 'text-gray-300 line-through'
                  : 'text-gray-500'
              }`}>
                {info.label}
              </span>

              <span className="text-xs text-gray-300 tabular-nums shrink-0">{info.durationMin}m</span>
            </div>
          )
        })}
      </div>

      {/* Unit / faith context */}
      {(config.current_unit || config.faith_emphasis) && (
        <div className="px-4 py-3 border-t border-navy-50 space-y-2">
          {config.current_unit && (
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="font-medium text-gray-500">Unit: </span>
              {config.current_unit}
            </p>
          )}
          {config.faith_emphasis && (
            <div className="px-3 py-2 bg-gold-50 border border-gold-100 rounded-lg">
              <p className="text-xs text-gold-700 leading-relaxed">{config.faith_emphasis}</p>
            </div>
          )}
        </div>
      )}

      {/* Next subject action */}
      <div className="px-4 py-4 border-t border-navy-50">
        {allDone ? (
          <p className="text-xs text-center text-navy-500 font-medium py-1">
            All subjects complete
          </p>
        ) : hasNext ? (
          <button
            onClick={onNext}
            disabled={disabled}
            className="w-full py-2.5 bg-navy-500 text-white text-xs font-semibold rounded-xl hover:bg-navy-600 disabled:opacity-40 transition-colors"
          >
            Next Subject
          </button>
        ) : null}
      </div>

    </aside>
  )
}
