import type { Subject } from '../types'
import { SUBJECT_MAP } from '../types'
import { ChevronRight } from 'lucide-react'

interface Props {
  subjects: Subject[]
  currentSubject: Subject
  completed: Subject[]
  onNext: () => void
  disabled?: boolean
}

export default function SubjectNav({ subjects, currentSubject, completed, onNext, disabled }: Props) {
  const currentIndex = subjects.indexOf(currentSubject)
  const hasNext = currentIndex < subjects.length - 1
  const progressPct = subjects.length > 0 ? (completed.length / subjects.length) * 100 : 0

  return (
    <nav className="bg-white rounded-xl border border-sage-100 shadow-sm p-4">
      {/* Session progress header */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Today's Progress
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-sage-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {completed.length} of {subjects.length} subjects
        </div>
      </div>

      {/* Subject rows */}
      <div className="space-y-1">
        {subjects.map((subj) => {
          const info = SUBJECT_MAP[subj]
          const isCurrent = subj === currentSubject
          const isDone = completed.includes(subj)
          const isUpcoming = !isCurrent && !isDone

          return (
            <div
              key={subj}
              className={`flex items-center gap-3 min-h-[48px] rounded-lg px-3 py-2 transition-all ${
                isCurrent
                  ? 'border-l-4 border-sage-500 pl-2 bg-sage-50'
                  : isDone
                  ? 'opacity-60 pl-[calc(0.75rem+4px)]'
                  : 'opacity-50 pl-[calc(0.75rem+4px)]'
              }`}
            >
              {/* Status indicator circle */}
              <div className="flex-shrink-0">
                {isDone ? (
                  /* Filled circle with checkmark */
                  <div className="w-4 h-4 rounded-full bg-sage-500 flex items-center justify-center">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 5l2 2 4-4"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                ) : isCurrent ? (
                  /* Filled circle with white inner dot (ring effect) */
                  <div className="w-4 h-4 rounded-full bg-sage-500 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                ) : (
                  /* Empty circle for upcoming */
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                )}
              </div>

              {/* Subject icon */}
              <span className="text-base flex-shrink-0">{info.icon}</span>

              {/* Label + duration */}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-medium truncate ${
                    isCurrent ? 'text-sage-800' : 'text-gray-600'
                  }`}
                >
                  {info.label}
                </div>
                <div className="text-xs text-gray-400">{info.durationMin} min</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Next Subject button */}
      {hasNext && (
        <button
          onClick={onNext}
          disabled={disabled}
          className="mt-4 w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-sm font-medium bg-sage-500 text-white hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-4"
        >
          Next Subject
          <ChevronRight size={16} />
        </button>
      )}
    </nav>
  )
}
