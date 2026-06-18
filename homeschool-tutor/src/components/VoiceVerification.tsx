import { useState, useCallback } from 'react'
import { Mic, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { verifyVoice, parentOverrideVoice } from '../services/voiceApi'
import type { VerifyResult } from '../services/voiceApi'

const PASSPHRASE = "I am ready to learn today!"

interface Props {
  studentName: string
  token: string
  parentToken?: string          // if parent is also present, they can override
  onVerified: (result: VerifyResult) => void
  onSkip?: () => void           // parent can skip verification entirely
}

type Step = 'prompt' | 'recording' | 'processing' | 'result'

export default function VoiceVerification({ studentName, token, parentToken, onVerified, onSkip }: Props) {
  const [step, setStep] = useState<Step>('prompt')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [attempts, setAttempts] = useState(0)
  const MAX_ATTEMPTS = 3

  const handleRecordingComplete = useCallback(async (wavBlob: Blob) => {
    setStep('processing')
    const res = await verifyVoice(token, studentName, wavBlob)
    setResult(res)
    setStep('result')
    setAttempts((a) => a + 1)
    if (res.verified) onVerified(res)
  }, [token, studentName, onVerified])

  const { isRecording, level, startRecording, stopRecording } = useVoiceRecorder({
    maxDurationMs: 8000,
    onComplete: handleRecordingComplete,
  })

  const retry = () => { setResult(null); setStep('prompt') }

  const handleParentOverride = async () => {
    const overrideToken = parentToken ?? token
    const res = await parentOverrideVoice(overrideToken, studentName)
    onVerified(res)
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-sage-900/80 to-faith-600/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-5">
          <div className="text-5xl mb-3">🎙️</div>
          <h2 className="text-xl font-display font-bold text-gray-800">
            Hi, {studentName}!
          </h2>
          <p className="text-sm text-gray-500 mt-1">Say the passphrase to begin your session</p>
        </div>

        {/* Passphrase */}
        <div className="bg-parchment-100 border border-parchment-300 rounded-xl p-4 text-center mb-5">
          <p className="text-xs text-gray-500 mb-1">Say this aloud:</p>
          <p className="text-base font-display text-gray-800 italic">"{PASSPHRASE}"</p>
        </div>

        {step === 'prompt' && (
          <div className="text-center space-y-4">
            <button
              onClick={() => { setStep('recording'); setTimeout(startRecording, 300) }}
              className="w-24 h-24 rounded-full bg-sage-500 hover:bg-sage-600 text-white flex items-center justify-center mx-auto shadow-xl transition-all active:scale-95"
            >
              <Mic size={40} />
            </button>
            <p className="text-sm text-gray-500">Click the mic and speak clearly</p>
            {onSkip && (
              <button onClick={onSkip} className="text-xs text-gray-400 hover:text-gray-600 underline">
                Skip voice check (parent mode)
              </button>
            )}
          </div>
        )}

        {step === 'recording' && (
          <div className="text-center space-y-4">
            {/* Live volume bars */}
            <div className="flex items-end justify-center gap-1 h-16">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-sage-400 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, level * 60 * (0.3 + Math.random() * 0.7))}px`,
                  }}
                />
              ))}
            </div>
            <button
              onClick={stopRecording}
              className="w-24 h-24 rounded-full bg-red-500 text-white flex items-center justify-center mx-auto shadow-xl animate-pulse"
            >
              <div className="w-10 h-10 bg-white rounded-sm" />
            </button>
            <p className="text-sm text-red-500 font-medium">Listening… click to stop</p>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center py-8">
            <div className="text-3xl animate-spin mb-3">🧠</div>
            <p className="text-gray-600 text-sm">Checking your voice…</p>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <ConfidenceDisplay result={result} />

            {result.verified ? (
              <button
                onClick={() => onVerified(result)}
                className="w-full py-3 bg-sage-500 text-white rounded-xl font-medium hover:bg-sage-600 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} /> Start Learning!
              </button>
            ) : (
              <div className="space-y-2">
                {attempts < MAX_ATTEMPTS && (
                  <button
                    onClick={retry}
                    className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} /> Try Again ({MAX_ATTEMPTS - attempts} left)
                  </button>
                )}
                {/* Parent override always available */}
                <button
                  onClick={handleParentOverride}
                  className="w-full py-2.5 bg-faith-100 text-faith-600 rounded-xl font-medium hover:bg-faith-200 transition-colors text-sm"
                >
                  👨‍👩‍👧 Parent Approve Session
                </button>
                {attempts >= MAX_ATTEMPTS && (
                  <p className="text-xs text-center text-gray-400">
                    A parent can also enrol your voice again in the Setup page.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConfidenceDisplay({ result }: { result: VerifyResult }) {
  const pct = result.score !== null ? Math.round(result.score * 100) : null

  const config = {
    high: { icon: <CheckCircle size={28} className="text-sage-500" />, color: 'text-sage-700', bg: 'bg-sage-50 border-sage-200' },
    medium: { icon: <AlertTriangle size={28} className="text-amber-500" />, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    low: { icon: <XCircle size={28} className="text-red-400" />, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  }[result.level]

  return (
    <div className={`rounded-xl border p-4 ${config.bg}`}>
      <div className="flex items-center gap-3">
        {config.icon}
        <div>
          <p className={`font-semibold text-sm ${config.color}`}>{result.message}</p>
          {pct !== null && (
            <p className="text-xs text-gray-400 mt-0.5">Confidence: {pct}%</p>
          )}
        </div>
      </div>
      {pct !== null && (
        <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              result.level === 'high' ? 'bg-sage-500' : result.level === 'medium' ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}
