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
    <aside className="hidden lg:flex flex-col w-64 xl:w-72 border-r border-midnight-700 bg-midnight-800 shrink-0 h-full overflow-hidden">

      {/* Identity */}
      <div className="px-5 pt-5 pb-4 border-b border-midnight-700">
        <p className="font-display text-[9px] tracking-widest uppercase text-midnight-300 mb-1">Today's Plan</p>
        <p className="font-display text-sm tracking-wide text-amber-200">{config.student_name}</p>
      </div>

      {/* 2-hour session bar */}
      <div className="px-5 py-3 border-b border-midnight-700">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-display text-[10px] text-midnight-300">Session</span>
          <span className={`font-display text-[10px] tabular-nums ${
            isAtLimit ? 'text-coral-400' : isNearLimit ? 'text-amber-400' : 'text-amber-300'
          }`}>
            {elapsedMin} / 120 min
          </span>
        </div>
        <div className="h-1.5 bg-midnight-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              isAtLimit ? 'bg-coral-400' : isNearLimit ? 'bg-amber-400' : 'bg-amber-300'
            }`}
            style={{ width: `${sessionPct}%` }}
          />
        </div>
        {isNearLimit && !isAtLimit && (
          <p className="font-display text-[10px] text-amber-400 mt-1 italic">Approaching session limit</p>
        )}
        {isAtLimit && (
          <p className="font-display text-[10px] text-coral-400 mt-1">Session limit reached</p>
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
                isCurrent ? 'bg-midnight-700' : ''
              }`}
            >
              {isDone ? (
                <CheckCircle size={12} className="text-midnight-400 shrink-0" />
              ) : isCurrent ? (
                <div
                  className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"
                  style={{ boxShadow: '0 0 6px rgba(240,168,53,0.7)' }}
                />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full border border-midnight-500 shrink-0" />
              )}

              <info.Icon
                size={13}
                className={`shrink-0 ${
                  isCurrent ? 'text-amber-300' : isDone ? 'text-midnight-500' : 'text-midnight-400'
                }`}
              />

              <span className={`flex-1 font-display text-[9.5px] leading-snug tracking-wider ${
                isCurrent
                  ? 'text-amber-200'
                  : isDone
                  ? 'text-midnight-500 line-through'
                  : 'text-midnight-300'
              }`}>
                {info.label}
              </span>

              <span className="font-body italic text-[8px] text-midnight-500 tabular-nums shrink-0">{info.durationMin}m</span>
            </div>
          )
        })}
      </div>

      {/* Unit / faith context */}
      {(config.current_unit || config.faith_emphasis) && (
        <div className="px-4 py-3 border-t border-midnight-700 space-y-2">
          {config.current_unit && (
            <p className="font-body italic text-xs text-midnight-200 leading-relaxed">
              <span className="font-display text-[9px] tracking-wider text-midnight-300 not-italic">Unit: </span>
              {config.current_unit}
            </p>
          )}
          {config.faith_emphasis && (
            <div
              className="px-3 py-2 rounded-lg"
              style={{ background: 'rgba(240,168,53,0.08)', border: '1px solid rgba(240,168,53,0.2)' }}
            >
              <p className="text-xs text-amber-300 font-body italic leading-relaxed">{config.faith_emphasis}</p>
            </div>
          )}
        </div>
      )}

      {/* Next subject action */}
      <div className="px-4 py-4 border-t border-midnight-700">
        {allDone ? (
          <p className="font-display text-[10px] tracking-widest uppercase text-center text-amber-300 py-1">
            All subjects complete
          </p>
        ) : hasNext ? (
          <button
            onClick={onNext}
            disabled={disabled}
            className="w-full py-2.5 bg-midnight-700 text-amber-300 border border-midnight-500 font-display text-[10px] tracking-widest uppercase rounded-xl hover:bg-midnight-600 disabled:opacity-40 transition-colors"
          >
            Next Subject
          </button>
        ) : null}
      </div>

    </aside>
  )
}
