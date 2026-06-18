import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Sparkles, Mic, CheckCircle } from 'lucide-react'
import { useSessionStore } from '../store/sessionStore'
import type { SessionConfig, Subject, GradeStage } from '../types'
import { SUBJECTS } from '../types'
import VoiceEnrollment from '../components/VoiceEnrollment'
import { listVoiceProfiles } from '../services/voiceApi'

const GRADE_STAGES: Array<{ label: string; value: GradeStage; description: string; emoji: string }> = [
  { label: 'K–2', value: 'K-2', description: 'Grammar Stage: Exploration & Discovery', emoji: '🌱' },
  { label: '3–5', value: '3-5', description: 'Logic Stage: Building Knowledge', emoji: '🔭' },
  { label: '6–8', value: '6-8', description: 'Rhetoric Stage: Application & Mastery', emoji: '🎓' },
]

export default function ParentSetup() {
  const navigate = useNavigate()
  const { setSessionConfig, startSession, logout, token } = useSessionStore()

  const [studentName, setStudentName] = useState('')
  const [showEnrollment, setShowEnrollment] = useState(false)
  const [enrolledProfiles, setEnrolledProfiles] = useState<string[]>([])

  useEffect(() => {
    if (token) listVoiceProfiles(token).then(setEnrolledProfiles).catch(() => {})
  }, [token])

  const isEnrolled = (name: string) =>
    enrolledProfiles.some((p) => p.toLowerCase() === name.toLowerCase())
  const [grade, setGrade] = useState('')
  const [gradeStage, setGradeStage] = useState<GradeStage>('3-5')
  const [selectedSubjects, setSelectedSubjects] = useState<Subject[]>(
    SUBJECTS.filter((s) => s.id !== 'free_study').map((s) => s.id)
  )
  const [lessonFocus, setLessonFocus] = useState('')
  const [faithEmphasis, setFaithEmphasis] = useState('')
  const [currentUnit, setCurrentUnit] = useState('')

  const toggleSubject = (id: Subject) => {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const totalMinutes = selectedSubjects.reduce((acc, s) => {
    const info = SUBJECTS.find((x) => x.id === s)
    return acc + (info?.durationMin ?? 0)
  }, 0)

  const handleStart = () => {
    if (!studentName.trim() || !grade.trim() || selectedSubjects.length === 0) return
    const config: SessionConfig = {
      student_name: studentName.trim(),
      grade: grade.trim(),
      grade_stage: gradeStage,
      subjects: selectedSubjects,
      lesson_focus: lessonFocus.trim() || undefined,
      faith_emphasis: faithEmphasis.trim() || undefined,
      current_unit: currentUnit.trim() || undefined,
    }
    setSessionConfig(config)
    startSession()
    navigate('/session')
  }

  return (
    <div className="min-h-screen bg-parchment-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-800">Plan Today's Session</h1>
            <p className="text-sm text-gray-500 mt-1">Sage will follow Charlotte Mason's approach</p>
          </div>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Log out
          </button>
        </div>

        <div className="space-y-6">
          {/* Student info */}
          <Card title="👤 Student">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Student's Name</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. Emma"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Grade</label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="e.g. 4 or K"
                  className="input"
                />
              </div>
            </div>
          </Card>

          {/* Stage */}
          <Card title="📚 Learning Stage (Trivium)">
            <div className="grid grid-cols-3 gap-3">
              {GRADE_STAGES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setGradeStage(s.value)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    gradeStage === s.value
                      ? 'border-sage-500 bg-sage-50'
                      : 'border-gray-200 bg-white hover:border-sage-200'
                  }`}
                >
                  <div className="text-xl mb-1">{s.emoji}</div>
                  <div className="font-semibold text-sm text-gray-800">{s.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-tight">{s.description}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* Subjects */}
          <Card title={`🗓️ Subjects — ${totalMinutes} min total`}>
            <p className="text-xs text-gray-500 mb-3">
              Drag to reorder subjects (order determines session flow).
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUBJECTS.map((s) => {
                const active = selectedSubjects.includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSubject(s.id)}
                    className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'border-sage-400 bg-sage-50'
                        : 'border-gray-200 bg-white opacity-50'
                    }`}
                  >
                    <span className="text-lg">{s.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{s.label}</div>
                      <div className="text-xs text-gray-400">{s.durationMin} min</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Context for AI */}
          <Card title="✨ Session Context (optional)">
            <div className="space-y-3">
              <div>
                <label className="label">Current Unit of Study</label>
                <input
                  type="text"
                  value={currentUnit}
                  onChange={(e) => setCurrentUnit(e.target.value)}
                  placeholder="e.g. Ancient Egypt, Fractions, Little House on the Prairie"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Today's Faith / Virtue Focus</label>
                <input
                  type="text"
                  value={faithEmphasis}
                  onChange={(e) => setFaithEmphasis(e.target.value)}
                  placeholder="e.g. Proverbs 3:5-6, Fruit of the Spirit: Patience"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Note for Sage (any special instruction)</label>
                <textarea
                  value={lessonFocus}
                  onChange={(e) => setLessonFocus(e.target.value)}
                  placeholder="e.g. Focus on multiplication facts 6-9 today. Emma struggled with fractions yesterday."
                  rows={3}
                  className="input resize-none"
                />
              </div>
            </div>
          </Card>

          {/* Voice enrolment */}
          {studentName.trim() && (
            <Card title="🎤 Voice Recognition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    {isEnrolled(studentName.trim())
                      ? `✅ Voice enrolled for ${studentName.trim()}`
                      : `No voice profile for ${studentName.trim()} yet`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isEnrolled(studentName.trim())
                      ? 'Student will be asked to say the passphrase at session start.'
                      : 'Enrol a voice profile so Sage can confirm the right student is present.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowEnrollment(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-sage-300 text-sage-700 hover:bg-sage-50 text-sm font-medium transition-colors flex-shrink-0 ml-4"
                >
                  {isEnrolled(studentName.trim()) ? (
                    <><CheckCircle size={14} /> Re-enrol</>
                  ) : (
                    <><Mic size={14} /> Enrol Voice</>
                  )}
                </button>
              </div>
            </Card>
          )}

          <button
            onClick={handleStart}
            disabled={!studentName.trim() || !grade.trim() || selectedSubjects.length === 0}
            className="w-full py-4 bg-sage-500 text-white rounded-xl font-semibold text-base hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles size={18} />
            Begin Session with Sage
            <ChevronRight size={18} />
          </button>

          {showEnrollment && studentName.trim() && (
            <VoiceEnrollment
              studentName={studentName.trim()}
              onEnrolled={() => {
                listVoiceProfiles(token!).then(setEnrolledProfiles).catch(() => {})
              }}
              onClose={() => setShowEnrollment(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-sage-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  )
}
