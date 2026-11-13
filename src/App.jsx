import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Logo from './components/Logo'
import Landing from './pages/auth/Landing'
import Login from './pages/auth/Login'
import { SCREENS } from './pages/screens/registry'

function Splash() {
  return <div className="splash"><Logo height={34} /><span className="spinner light" /></div>
}

export default function App() {
  const { session, profile, role, loading, error, signOut } = useAuth()
  if (loading) return <Splash />

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  if (!profile) {
    return (
      <div className="splash">
        <Logo height={34} />
        <p>{error ? `Could not load your account: ${error}` : 'This account has no Avilo role yet.'}</p>
        <button className="btn ghost-light" onClick={signOut}>Sign out</button>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        {(SCREENS[role] || []).map((s) => <Route key={s.path} path={s.path} element={<s.component />} />)}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
