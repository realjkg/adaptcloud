import { useEffect, useState } from 'react'
import FirstRun from './pages/FirstRun'
import Dashboard from './pages/Dashboard'

declare global {
  interface Window {
    bede: {
      getConfig:      () => Promise<{ setup_complete: boolean }>
      saveConfig:     (cfg: unknown) => Promise<boolean>
      serverStart:    () => Promise<{ status: string; error: string }>
      serverStop:     () => Promise<boolean>
      serverStatus:   () => Promise<{ status: string; error: string }>
      openBrowser:    () => Promise<void>
      onStatusChange: (fn: (status: string, error: string) => void) => () => void
    }
  }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [setupDone, setSetupDone] = useState(false)

  useEffect(() => {
    window.bede.getConfig().then((cfg) => {
      setSetupDone(cfg.setup_complete)
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--amber-300)', letterSpacing: '0.1em', fontSize: '0.75rem' }}>
          LOADING…
        </p>
      </div>
    )
  }

  if (!setupDone) {
    return <FirstRun onComplete={() => setSetupDone(true)} />
  }

  return <Dashboard />
}
