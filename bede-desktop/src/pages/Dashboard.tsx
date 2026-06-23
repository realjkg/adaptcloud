import { useEffect, useState, useCallback } from 'react'

type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

const STATUS_LABEL: Record<ServerStatus, string> = {
  stopped:  'Server stopped',
  starting: 'Server starting…',
  running:  'Server running',
  error:    'Server error',
}

const STATUS_COLOR: Record<ServerStatus, string> = {
  stopped:  'var(--midnight-400)',
  starting: 'var(--amber-400)',
  running:  '#4ade80',   // emerald-400
  error:    'var(--coral-400)',
}

const s: Record<string, React.CSSProperties> = {
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--midnight-900)',
  },
  titleBar: {
    height: 28,
    WebkitAppRegion: 'drag' as unknown as undefined,
    flexShrink: 0,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    gap: '2rem',
  },
  logo: {
    textAlign: 'center' as const,
  },
  eyebrow: {
    fontFamily: 'Cinzel, serif',
    fontSize: '0.625rem',
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: 'var(--midnight-300)',
    marginBottom: '0.5rem',
  },
  title: {
    fontFamily: 'Cinzel, serif',
    fontSize: '1.5rem',
    color: 'var(--amber-300)',
    letterSpacing: '0.04em',
  },
  card: {
    background: 'var(--midnight-800)',
    border: '1px solid var(--midnight-600)',
    borderRadius: '1rem',
    padding: '1.75rem 2rem',
    width: '100%',
    maxWidth: '420px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.25rem',
  },
  dot: (status: ServerStatus) => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: STATUS_COLOR[status],
    boxShadow: status === 'running' ? '0 0 8px #4ade8099' : status === 'starting' ? '0 0 8px rgba(240,168,53,0.5)' : 'none',
    flexShrink: 0,
    animation: status === 'starting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
  }),
  statusLabel: (status: ServerStatus) => ({
    fontFamily: 'Cinzel, serif',
    fontSize: '0.75rem',
    letterSpacing: '0.08em',
    color: STATUS_COLOR[status],
  }),
  errorMsg: {
    fontSize: '0.8125rem',
    color: 'var(--coral-400)',
    marginBottom: '1rem',
    lineHeight: 1.5,
  },
  btnRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  btnPrimary: (disabled: boolean) => ({
    flex: 1,
    padding: '0.7rem',
    background: 'var(--amber-400)',
    color: 'var(--midnight-900)',
    borderRadius: '0.5rem',
    fontFamily: 'Cinzel, serif',
    fontSize: '0.6875rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    opacity: disabled ? 0.4 : 1,
    transition: 'opacity 0.2s',
  }),
  btnSecondary: (disabled: boolean) => ({
    flex: 1,
    padding: '0.7rem',
    background: 'var(--midnight-700)',
    color: 'var(--midnight-200)',
    borderRadius: '0.5rem',
    fontFamily: 'Cinzel, serif',
    fontSize: '0.6875rem',
    letterSpacing: '0.1em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid var(--midnight-500)',
    opacity: disabled ? 0.4 : 1,
    transition: 'opacity 0.2s',
  }),
  openBtn: {
    width: '100%',
    marginTop: '0.75rem',
    padding: '0.7rem',
    background: 'transparent',
    color: 'var(--sky-400)',
    border: '1px solid var(--sky-400)',
    borderRadius: '0.5rem',
    fontFamily: 'Cinzel, serif',
    fontSize: '0.6875rem',
    letterSpacing: '0.1em',
    cursor: 'pointer',
  },
  footer: {
    textAlign: 'center' as const,
    paddingBottom: '1.5rem',
    fontStyle: 'italic',
    fontSize: '0.8rem',
    color: 'var(--midnight-400)',
  },
}

export default function Dashboard() {
  const [status, setStatus] = useState<ServerStatus>('stopped')
  const [error, setError]   = useState('')
  const [busy, setBusy]     = useState(false)

  const refreshStatus = useCallback(async () => {
    const s = await window.bede.serverStatus()
    setStatus(s.status as ServerStatus)
    setError(s.error ?? '')
  }, [])

  useEffect(() => {
    refreshStatus()
    const unsub = window.bede.onStatusChange((s, err) => {
      setStatus(s as ServerStatus)
      setError(err ?? '')
    })
    return unsub
  }, [refreshStatus])

  const toggle = async () => {
    setBusy(true)
    try {
      if (status === 'running') {
        await window.bede.serverStop()
      } else {
        await window.bede.serverStart()
      }
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={s.root}>
      <div style={s.titleBar} />

      <div style={s.main}>
        <div style={s.logo}>
          <p style={s.eyebrow}>Agnus Dei</p>
          <h1 style={s.title}>Bede Tutor</h1>
        </div>

        <div style={s.card}>
          <div style={s.statusRow}>
            <div style={s.dot(status)} />
            <span style={s.statusLabel(status)}>{STATUS_LABEL[status]}</span>
          </div>

          {error && <p style={s.errorMsg}>{error}</p>}

          <div style={s.btnRow}>
            <button
              style={s.btnPrimary(busy || status === 'starting')}
              disabled={busy || status === 'starting'}
              onClick={toggle}
            >
              {status === 'running' ? 'Stop' : 'Start'}
            </button>
            <button
              style={s.btnSecondary(status !== 'running')}
              disabled={status !== 'running'}
              onClick={() => window.bede.openBrowser()}
            >
              Open in Browser
            </button>
          </div>

          {status === 'running' && (
            <button style={s.openBtn} onClick={() => window.bede.openBrowser()}>
              Open Session → localhost:8000
            </button>
          )}
        </div>
      </div>

      <p style={s.footer}>
        "Education is an atmosphere, a discipline, a life." — Charlotte Mason
      </p>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
