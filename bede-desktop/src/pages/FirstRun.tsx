import { useState } from 'react'

interface Props {
  onComplete: () => void
}

interface Config {
  anthropic_api_key: string
  parent_password: string
  child_pin: string
  secret_key: string
  master_secret: string
  setup_complete: boolean
}

const STEPS = ['Welcome', 'API Key', 'Credentials', 'All Set'] as const
type Step = 0 | 1 | 2 | 3

const s: Record<string, React.CSSProperties> = {
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--midnight-900)',
    padding: '2rem',
  },
  card: {
    background: 'var(--midnight-800)',
    border: '1px solid var(--midnight-600)',
    borderRadius: '1.25rem',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
  },
  stepRow: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    justifyContent: 'center',
  },
  dot: (active: boolean, done: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: done ? 'var(--amber-300)' : active ? 'var(--amber-400)' : 'var(--midnight-600)',
    transition: 'background 0.3s',
  }),
  eyebrow: {
    fontFamily: 'Cinzel, serif',
    fontSize: '0.625rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'var(--midnight-300)',
    marginBottom: '0.5rem',
  },
  h1: {
    fontFamily: 'Cinzel, serif',
    fontSize: '1.375rem',
    color: 'var(--amber-300)',
    marginBottom: '1rem',
    letterSpacing: '0.03em',
  },
  body: {
    color: 'var(--midnight-200)',
    fontSize: '0.9375rem',
    lineHeight: 1.65,
    marginBottom: '1.5rem',
  },
  label: {
    fontFamily: 'Cinzel, serif',
    fontSize: '0.625rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'var(--midnight-300)',
    display: 'block',
    marginBottom: '0.4rem',
  },
  input: {
    width: '100%',
    background: 'var(--midnight-700)',
    border: '1px solid var(--midnight-500)',
    borderRadius: '0.5rem',
    padding: '0.6rem 0.875rem',
    color: 'var(--star)',
    fontSize: '0.9375rem',
    outline: 'none',
    marginBottom: '1rem',
    fontFamily: 'EB Garamond, Georgia, serif',
  },
  hint: {
    fontSize: '0.8125rem',
    color: 'var(--midnight-300)',
    marginTop: '-0.6rem',
    marginBottom: '1rem',
    lineHeight: 1.5,
  },
  btnRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  btnPrimary: {
    flex: 1,
    padding: '0.75rem',
    background: 'var(--amber-400)',
    color: 'var(--midnight-900)',
    borderRadius: '0.625rem',
    fontFamily: 'Cinzel, serif',
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
  },
  btnSecondary: {
    padding: '0.75rem 1.25rem',
    background: 'var(--midnight-700)',
    color: 'var(--midnight-200)',
    borderRadius: '0.625rem',
    fontFamily: 'Cinzel, serif',
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    border: '1px solid var(--midnight-500)',
  },
  link: {
    color: 'var(--sky-400)',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: '0.8125rem',
  },
}

export default function FirstRun({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [config, setConfig] = useState<Config>({
    anthropic_api_key: '',
    parent_password:   '',
    child_pin:         '',
    secret_key:        '',
    master_secret:     '',
    setup_complete:    false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const update = (field: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConfig((c) => ({ ...c, [field]: e.target.value }))

  const next = () => setStep((s) => Math.min(s + 1, 3) as Step)
  const back = () => setStep((s) => Math.max(s - 1, 0) as Step)

  const finish = async () => {
    setSaving(true)
    setError('')
    try {
      const full: Config = { ...config, setup_complete: true }
      await window.bede.saveConfig(full)
      await window.bede.serverStart()
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.root}>
      <div style={s.card}>
        {/* Step dots */}
        <div style={s.stepRow}>
          {STEPS.map((_, i) => (
            <div key={i} style={s.dot(i === step, i < step)} />
          ))}
        </div>

        {step === 0 && (
          <>
            <p style={s.eyebrow}>First-time setup</p>
            <h1 style={s.h1}>Welcome to Bede</h1>
            <p style={s.body}>
              Bede is your family's Charlotte Mason tutor — a Socratic dialogue
              partner that helps children narrate, wonder, and connect learning
              to faith and nature.
            </p>
            <p style={s.body}>
              This wizard takes about two minutes. You'll need an{' '}
              <span style={s.link}>Anthropic API key</span> and your preferred
              parent password and child PIN.
            </p>
            <div style={s.btnRow}>
              <button style={s.btnPrimary} onClick={next}>Begin Setup →</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p style={s.eyebrow}>Step 1 of 3</p>
            <h1 style={s.h1}>Anthropic API Key</h1>
            <p style={s.body}>
              Bede uses Claude (claude-sonnet-4-6) to tutor your children. You'll
              need an API key from Anthropic's console.
            </p>
            <label style={s.label}>API Key</label>
            <input
              style={s.input}
              type="password"
              placeholder="sk-ant-api03-…"
              value={config.anthropic_api_key}
              onChange={update('anthropic_api_key')}
              autoComplete="off"
              spellCheck={false}
            />
            <p style={s.hint}>
              Get your key at{' '}
              <span style={s.link}>console.anthropic.com</span>.
              Bede stores this locally — it never leaves your computer.
            </p>
            <div style={s.btnRow}>
              <button style={s.btnSecondary} onClick={back}>← Back</button>
              <button
                style={{ ...s.btnPrimary, opacity: config.anthropic_api_key ? 1 : 0.4 }}
                disabled={!config.anthropic_api_key}
                onClick={next}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p style={s.eyebrow}>Step 2 of 3</p>
            <h1 style={s.h1}>Set Credentials</h1>
            <label style={s.label}>Parent Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="Choose a strong password"
              value={config.parent_password}
              onChange={update('parent_password')}
            />
            <label style={s.label}>Child PIN</label>
            <input
              style={s.input}
              type="password"
              inputMode="numeric"
              placeholder="4-digit PIN (e.g. 1234)"
              maxLength={8}
              value={config.child_pin}
              onChange={update('child_pin')}
            />
            <p style={s.hint}>
              Children enter this PIN before each session. Parents use the
              password to configure subjects and view reports.
            </p>
            {error && (
              <p style={{ color: 'var(--coral-400)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {error}
              </p>
            )}
            <div style={s.btnRow}>
              <button style={s.btnSecondary} onClick={back}>← Back</button>
              <button
                style={{
                  ...s.btnPrimary,
                  opacity: (config.parent_password && config.child_pin) ? 1 : 0.4,
                }}
                disabled={!config.parent_password || !config.child_pin}
                onClick={next}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p style={s.eyebrow}>All set</p>
            <h1 style={s.h1}>Ready to Begin</h1>
            <p style={s.body}>
              Bede will start its local server now. Then open your browser
              to <span style={{ color: 'var(--amber-300)' }}>localhost:8000</span> or
              tap <em>Open Bede</em> from the tray icon.
            </p>
            <p style={{ ...s.body, fontStyle: 'italic', fontSize: '0.875rem', color: 'var(--midnight-300)' }}>
              "Education is an atmosphere, a discipline, a life." — Charlotte Mason
            </p>
            {error && (
              <p style={{ color: 'var(--coral-400)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {error}
              </p>
            )}
            <div style={s.btnRow}>
              <button style={s.btnSecondary} onClick={back}>← Back</button>
              <button
                style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}
                disabled={saving}
                onClick={finish}
              >
                {saving ? 'Starting…' : 'Launch Bede →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
