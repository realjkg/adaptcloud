import { CheckCircle } from 'lucide-react'
import type { Subject } from '../types'
import { SUBJECT_MAP, SUBJECTS } from '../types'

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

  return (
    <div className="bg-white rounded-xl border border-sage-100 shadow-sm p-4">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Today's Schedule
      </div>
      <div className="space-y-1.5">
        {subjects.map((subj, i) => {
          const info = SUBJECT_MAP[subj] ?? SUBJECTS[0]
          const isCurrent = subj === currentSubject
          const isDone = completed.includes(subj)
          const isUpcoming = !isCurrent && !isDone

          return (
            <div
              key={subj}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${
                isCurrent
                  ? 'bg-sage-100 border border-sage-300'
                  : isDone
                  ? 'opacity-50'
                  : 'opacity-60'
              }`}
            >
              <span className="text-base">{info.icon}</span>
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
              {isDone && <CheckCircle size={14} className="text-sage-500 flex-shrink-0" />}
              {isCurrent && (
                <span className="text-xs bg-sage-500 text-white rounded-full px-2 py-0.5 flex-shrink-0">
                  Now
                </span>
              )}
            </div>
          )
        })}
      </div>

      {hasNext && (
        <button
          onClick={onNext}
          disabled={disabled}
          className="mt-4 w-full py-2 px-4 rounded-lg text-sm font-medium bg-sage-500 text-white hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next Subject →
        </button>
      )}
    </div>
  )
}
