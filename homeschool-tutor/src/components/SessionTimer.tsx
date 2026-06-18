import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  startedAt: Date | null
  totalMinutes?: number
}

export default function SessionTimer({ startedAt, totalMinutes = 120 }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const totalSeconds = totalMinutes * 60
  const remaining = Math.max(0, totalSeconds - elapsed)
  const progressPct = Math.min(100, (elapsed / totalSeconds) * 100)

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const isLow = remaining < 600  // last 10 min
  const isDone = remaining === 0

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-2 shadow-sm border border-sage-100">
      <Clock size={16} className={isLow ? 'text-red-500' : 'text-sage-500'} />
      <div className="flex flex-col gap-1 min-w-[140px]">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{isDone ? '🎉 Session complete!' : `${fmt(remaining)} remaining`}</span>
          <span className="text-gray-400">{fmt(elapsed)} elapsed</span>
        </div>
        <div className="h-1.5 bg-sage-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              isLow ? 'bg-red-400' : 'bg-sage-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
