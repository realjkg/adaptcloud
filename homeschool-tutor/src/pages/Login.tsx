import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Lock } from 'lucide-react'
import { login } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import VoiceVerification from '../components/VoiceVerification'
import type { VerifyResult } from '../services/voiceApi'

type Phase = 'login' | 'voice-verify'

export default function Login() {
  const [role, setRole] = useState<'parent' | 'child'>('parent')
  const [credential, setCredential] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('login')
  const [pendingToken, setPendingToken] = useState('')
  const [studentName, setStudentName] = useState('')

  const navigate = useNavigate()
  const { setAuth, sessionConfig } = useSessionStore()

  // Derive student name from existing session config if parent already set it up
  const knownStudentName = sessionConfig?.student_name ?? studentName

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const token = await login(role, credential)

      if (role === 'parent') {
        // Parents go straight through — voice auth is for students
        setAuth(token, 'parent')
        navigate('/setup')
      } else {
        // Child: store token and move to voice verification gate
        setPendingToken(token)
        setPhase('voice-verify')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleVoiceVerified = (result: VerifyResult) => {
    setAuth(pendingToken, 'child')
    // If parent hasn't set up the session yet, child sees a waiting screen
    navigate('/session')
  }

  const handleVoiceSkip = () => {
    // No voice profile enrolled — let child in with PIN only
    setAuth(pendingToken, 'child')
    navigate('/session')
  }

  if (phase === 'voice-verify') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-parchment-100 via-sage-50 to-faith-100">
        <VoiceVerification
          studentName={knownStudentName || 'Student'}
          token={pendingToken}
          onVerified={handleVoiceVerified}
          onSkip={handleVoiceSkip}
        />
        {/* Fallback if student name unknown */}
        {!knownStudentName && (
          <div className="fixed bottom-6 left-0 right-0 text-center">
            <div className="inline-block bg-white/90 rounded-xl border border-sage-200 px-4 py-3 shadow">
              <p className="text-xs text-gray-500 mb-2">Enter student name for voice check:</p>
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Emma"
                className="text-sm border border-sage-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sage-400"
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-parchment-100 via-sage-50 to-faith-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-sage-100 w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sage-100 rounded-2xl mb-4">
            <BookOpen size={32} className="text-sage-600" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Sage</h1>
          <p className="text-sm text-gray-500 mt-1">Your Charlotte Mason Homeschool Tutor</p>
        </div>

        {/* Role toggle */}
        <div className="flex rounded-lg border border-sage-200 overflow-hidden mb-6">
          {(['parent', 'child'] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setRole(r); setCredential('') }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                role === r ? 'bg-sage-500 text-white' : 'bg-white text-gray-600 hover:bg-sage-50'
              }`}
            >
              {r === 'parent' ? '👨‍👩‍👧 Parent' : '🌟 Student'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {role === 'parent' ? 'Parent Password' : 'Student PIN'}
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={role === 'parent' ? 'Enter password' : 'Enter PIN'}
                inputMode={role === 'child' ? 'numeric' : 'text'}
                className="w-full pl-9 pr-4 py-2.5 border border-sage-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sage-400"
                required
              />
            </div>
          </div>

          {/* Voice verification notice for children */}
          {role === 'child' && (
            <div className="flex items-start gap-2.5 bg-sage-50 border border-sage-200 rounded-lg px-3 py-2.5">
              <span className="text-lg mt-0.5">🎤</span>
              <div className="text-xs text-sage-700">
                <p className="font-semibold">Voice check required</p>
                <p className="text-sage-600 mt-0.5">After your PIN, you'll say a short passphrase so Sage knows it's really you.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !credential}
            className="w-full py-3 bg-sage-500 text-white rounded-lg font-medium hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Checking…' : role === 'parent' ? 'Enter as Parent' : 'Continue to Voice Check →'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
          "Education is an atmosphere, a discipline, a life." — Charlotte Mason
        </p>
      </div>
    </div>
  )
}
