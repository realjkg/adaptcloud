import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import AppShell from './guards/AppShell'
import Login from './pages/Login'
import ParentSetup from './pages/ParentSetup'
import TutorSession from './pages/TutorSession'
import { useSessionStore } from './store/sessionStore'

/**
 * Global 401 interceptor.
 * Patches window.fetch so that ANY 401 from the API immediately clears session
 * state and redirects to the login page — regardless of which component made
 * the request. This is the last line of defence against expired/stolen tokens.
 */
function GlobalAuthInterceptor() {
  const navigate = useNavigate()
  const logout = useSessionStore((s) => s.logout)

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      if (response.status === 401) {
        // Check it's our API (not a third-party call)
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url
        if (url.startsWith('/api/') || url.includes(window.location.host)) {
          logout()
          navigate('/', { replace: true })
        }
      }
      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [logout, navigate])

  return null
}

function RequireAuth({
  children,
  allowedRole,
}: {
  children: React.ReactNode
  allowedRole?: 'parent' | 'child'
}) {
  const { token, role } = useSessionStore()
  if (!token) return <Navigate to="/" replace />
  if (allowedRole && role !== allowedRole) return <Navigate to="/session" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <GlobalAuthInterceptor />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/setup"
            element={
              <RequireAuth allowedRole="parent">
                <ParentSetup />
              </RequireAuth>
            }
          />
          <Route
            path="/session"
            element={
              <RequireAuth>
                <TutorSession />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
