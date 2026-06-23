import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Star, User, ShieldCheck, Copy, Check } from 'lucide-react'
import { passkeyLogin, passkeyRegister, fetchStudentConfig } from '../services/api'
import type { RegisterCompleteResponse } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import VoiceVerification from '../components/VoiceVerification'
import type { VerifyResult } from '../services/voiceApi'

type Phase = 'login' | 'register' | 'recovery-codes' | 'voice-verify'

export default function Login() {
  const [phase, setPhase] = useState<Phase>('login')
  const [familyName, setFamilyName] = useState('')
  const [parentName, setParentName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [copiedCodes, setCopiedCodes] = useState(false)
  const [pendingToken, setPendingToken] = useState('')
  const [studentName, setStudentName] = useState('')

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? ''
  const { setAuth, sessionConfig } = useSessionStore()

  const studentFromUrl = (() => {
    if (!returnTo) return ''
    try {
      const inner = new URLSearchParams(decodeURIComponent(returnTo).split('?')[1] ?? '')
      return inner.get('student') ?? ''
    } catch {
      return ''
    }
  })()

  const knownStudentName = (sessionConfig?.student_name ?? studentFromUrl) || studentName

  const afterParentAuth = (token: string) => {
    setAuth(token, 'parent')
    navigate(returnTo ? decodeURIComponent(returnTo) : '/setup')
  }

  const afterChildAuth = async (token: string) => {
    if (studentFromUrl) {
      try {
        const config = await fetchStudentConfig(token, studentFromUrl)
        if (config.voice_required === false) {
          setAuth(token, 'child')
          navigate(decodeURIComponent(returnTo))
          return
        }
      } catch {
        // proceed with voice check
      }
    }
    setPendingToken(token)
    setPhase('voice-verify')
  }

  const handlePasskeyLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const result = await passkeyLogin()
      if (result.role === 'parent') {
        afterParentAuth(result.access_token)
      } else {
        await afterChildAuth(result.access_token)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyName.trim() || !parentName.trim()) return
    setError('')
    setLoading(true)
    try {
      const result: RegisterCompleteResponse = await passkeyRegister(familyName.trim(), parentName.trim())
      setRecoveryCodes(result.recovery_codes)
      setPendingToken(result.access_token)
      setPhase('recovery-codes')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'))
    setCopiedCodes(true)
    setTimeout(() => setCopiedCodes(false), 2000)
  }

  const handleRecoveryDone = () => {
    setAuth(pendingToken, 'parent')
    navigate('/setup')
  }

  const handleVoiceVerified = (_result: VerifyResult) => {
    setAuth(pendingToken, 'child')
    navigate(returnTo ? decodeURIComponent(returnTo) : '/session')
  }

  const handleVoiceSkip = () => {
    setAuth(pendingToken, 'child')
    navigate(returnTo ? decodeURIComponent(returnTo) : '/session')
  }

  // ── Voice verification phase ────────────────────────────────────────────────
  if (phase === 'voice-verify') {
    return (
      <div className="min-h-screen bg-midnight-900">
        <VoiceVerification
          studentName={knownStudentName || 'Student'}
          token={pendingToken}
          onVerified={handleVoiceVerified}
          onSkip={handleVoiceSkip}
        />
        {!knownStudentName && (
          <div className="fixed bottom-6 left-0 right-0 text-center">
            <div className="inline-block bg-white/90 rounded-xl border border-midnight-200 px-4 py-3 shadow">
              <p className="text-xs text-gray-500 mb-2">Enter your name for the voice check:</p>
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Emma"
                className="text-sm border border-midnight-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Recovery codes phase ────────────────────────────────────────────────────
  if (phase === 'recovery-codes') {
    return (
      <div className="min-h-screen bg-midnight-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-midnight-100 w-full max-w-md p-8">
          <div className="text-center mb-6">
            <ShieldCheck size={40} className="mx-auto text-amber-500 mb-3" />
            <h2 className="text-xl font-display font-bold text-gray-800">Save Your Recovery Codes</h2>
            <p className="text-sm text-gray-500 mt-1.5">
              These 8 codes let you regain access if you lose your passkey. Store them somewhere safe — they won't be shown again.
            </p>
          </div>

          <div className="bg-midnight-50 border border-midnight-200 rounded-xl p-4 mb-4 font-mono text-sm space-y-1.5">
            {recoveryCodes.map((code) => (
              <div key={code} className="text-midnight-800 tracking-widest">{code}</div>
            ))}
          </div>

          <button
            onClick={handleCopyCodes}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-midnight-200 rounded-lg text-sm text-midnight-700 hover:bg-midnight-50 transition-colors mb-4"
          >
            {copiedCodes ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
            {copiedCodes ? 'Copied!' : 'Copy all codes'}
          </button>

          <button
            onClick={handleRecoveryDone}
            className="w-full py-3 bg-midnight-800 text-amber-300 rounded-lg font-medium hover:bg-midnight-700 transition-colors"
          >
            I've saved my codes — Continue →
          </button>
        </div>
      </div>
    )
  }

  // ── Register phase ──────────────────────────────────────────────────────────
  if (phase === 'register') {
    return (
      <div className="min-h-screen bg-midnight-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-midnight-100 w-full max-w-md p-8">
          <div className="text-center mb-7">
            <img src="/agnus-dei.png" alt="Agnus Dei" className="w-16 h-16 mx-auto mb-3 drop-shadow-sm" />
            <h1 className="text-xl font-display font-bold text-gray-800">Create Your Family Account</h1>
            <p className="text-sm text-gray-500 mt-1">You'll register a passkey with Face ID or Touch ID.</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Family name</label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="The Johnson Family"
                className="w-full px-4 py-2.5 border border-midnight-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name (parent)</label>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="Sarah"
                className="w-full px-4 py-2.5 border border-midnight-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !familyName.trim() || !parentName.trim()}
              className="w-full py-3 bg-midnight-800 text-amber-300 rounded-lg font-medium hover:bg-midnight-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <KeyRound size={16} />
              {loading ? 'Opening passkey dialog…' : 'Register with passkey'}
            </button>
          </form>

          <button
            onClick={() => { setPhase('login'); setError('') }}
            className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Already have an account? Sign in →
          </button>
        </div>
      </div>
    )
  }

  // ── Login phase (default) ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-midnight-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-midnight-100 w-full max-w-md p-8">
        <div className="text-center mb-8">
          <img src="/agnus-dei.png" alt="Agnus Dei" className="w-20 h-20 mx-auto mb-4 drop-shadow-sm" />
          <h1 className="text-2xl font-display font-bold text-gray-800">Agnus Dei</h1>
          <p className="text-sm text-gray-500 mt-1">Your Charlotte Mason Homeschool Tutor</p>
          {studentFromUrl && (
            <p className="text-sm font-medium text-midnight-700 mt-2">Welcome, {studentFromUrl}!</p>
          )}
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-2.5 bg-midnight-50 border border-midnight-100 rounded-xl px-4 py-3">
            <User size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-midnight-700">
              <p className="font-semibold">Parents &amp; Students</p>
              <p className="text-midnight-500 mt-0.5">Use the same button below. Your device will pick the right account.</p>
            </div>
          </div>
          {studentFromUrl && (
            <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
              <Star size={16} className="text-sky-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-sky-700">
                <span className="font-semibold">Student session</span> — after signing in, you'll do a short voice check so Bede knows it's really you.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="w-full py-3.5 bg-midnight-800 text-amber-300 rounded-xl font-medium hover:bg-midnight-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2.5 text-base"
        >
          <KeyRound size={18} />
          {loading ? 'Opening passkey…' : 'Sign in with passkey'}
        </button>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setPhase('register'); setError('') }}
            className="text-sm text-gray-400 hover:text-midnight-700 transition-colors"
          >
            First time? Create a family account →
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
          "Education is an atmosphere, a discipline, a life." — Charlotte Mason
        </p>
      </div>
    </div>
  )
}
