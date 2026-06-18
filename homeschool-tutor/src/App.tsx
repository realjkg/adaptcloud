import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import ParentSetup from './pages/ParentSetup'
import TutorSession from './pages/TutorSession'
import { useSessionStore } from './store/sessionStore'

function RequireAuth({ children, allowedRole }: { children: React.ReactNode; allowedRole?: 'parent' | 'child' }) {
  const { token, role } = useSessionStore()
  if (!token) return <Navigate to="/" replace />
  if (allowedRole && role !== allowedRole) return <Navigate to="/session" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
