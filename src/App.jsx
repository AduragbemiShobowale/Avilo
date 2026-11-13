import { useCallback, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Intro from './components/Intro'
import { Login, Forgot, SetPassword, AuthFrame } from './pages/auth/AuthPages'
import { SCREENS } from './pages/screens/registry'

// Signed out: sign in or reset a password. Accounts are created by the organisation, never self-registered.
export default function App() {
  const [intro, setIntro] = useState(true)
  const done = useCallback(() => setIntro(false), [])
  const { loading } = useAuth()
  return (
    <>
      {!loading && <Screens />}
      {intro && <Intro ready={!loading} onDone={done} />}
    </>
  )
}

function Screens() {
  const { session, profile, role, recovery, error, signOut } = useAuth()

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  if (recovery) return <SetPassword />
  if (!profile) {
    return (
      <AuthFrame label="Account">
        <h1>We could not open your account</h1>
        <p className="muted">{error ? error : 'This sign-in has no Avilo role yet. Ask your administrator to set one up.'}</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </AuthFrame>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        {(SCREENS[role] || []).map((s) => <Route key={s.path} path={s.path} element={<s.component />} />)}
        <Route path="/account" element={<SetPassword inApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
