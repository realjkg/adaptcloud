import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Lock } from 'lucide-react'
import { login } from '../services/api'
import { useSessionStore } from '../store/sessionStore'

export default function Login() {
  const [role, setRole] = useState<'parent' | 'child'>('parent')
  const [credential, setCredential] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAuth = useSessionStore((s) => s.setAuth)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const token = await login(role, credential)
      setAuth(token, role)
      navigate(role === 'parent' ? '/setup' : '/session')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
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
          <p className="text-sm text-gray-500 mt-1">
            Your Charlotte Mason Homeschool Tutor
          </p>
        </div>

        {/* Role toggle */}
        <div className="flex rounded-lg border border-sage-200 overflow-hidden mb-6">
          {(['parent', 'child'] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setRole(r); setCredential('') }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                role === r
                  ? 'bg-sage-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-sage-50'
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
            {loading ? 'Signing in…' : `Enter as ${role === 'parent' ? 'Parent' : 'Student'}`}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
          "Education is an atmosphere, a discipline, a life." — Charlotte Mason
        </p>
      </div>
    </div>
  )
}
