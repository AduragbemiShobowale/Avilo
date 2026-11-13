import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Logo from '../../components/Logo'
import Icon from '../../components/icons'
import PasswordInput from '../../components/PasswordInput'

// The path every part takes, drawn on the sign-in screen: shelf, transfer, aircraft.
function Journey() {
  return (
    <div className="journey" aria-hidden="true">
      <div className="stop"><span className="node"><Icon name="box" size={22} /></span><b>The store</b>receives</div>
      <div className="leg"><span>scan</span><i className="part" /></div>
      <div className="stop"><span className="node blue"><Icon name="globe" size={22} /></span><b>Avilo</b>tracks</div>
      <div className="leg"><span>work order</span></div>
      <div className="stop"><span className="node"><Icon name="plane" size={22} /></span><b>The aircraft</b>flies</div>
    </div>
  )
}

// The frame for every signed-out screen: the story on the left, the form on the right.
export function AuthFrame({ children, label = 'Sign in' }) {
  return (
    <div className="gate">
      <section className="gate-story">
        <Logo height={64} />
        <p className="gate-tag">Every aircraft part, located. Across every station, every transfer, every order.</p>
        <Journey />
        <div className="gate-who">
          <div><b>Airline and MRO staff:</b> your account is created by your organisation's administrator. Sign in with the e-mail you were given.</div>
          <div><b>Suppliers:</b> you join by invitation from the procurement team.</div>
        </div>
      </section>
      <section className="gate-form">
        <div className="tag">
          <div className="tag-head"><span>Avilo · <b>{label}</b></span><span className="mono">Spares control tower</span></div>
          <div className="tag-body">{children}</div>
        </div>
      </section>
    </div>
  )
}

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await signIn(email, password) } catch (x) { setErr(x.message); setBusy(false) }
  }
  return (
    <AuthFrame>
      <div><h1>Welcome back</h1><p className="muted gap-top">Sign in to see your stations, parts and orders.</p></div>
      <form className="stack" onSubmit={submit}>
        <label className="field">E-mail<input type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">Password<PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="notice bad">{err}</div>}
        <button className="btn primary lg block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <Link to="/forgot" className="small">Forgot your password?</Link>
    </AuthFrame>
  )
}

export function Forgot() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/reset' })
    setBusy(false)
    if (error) return toast.error(error.message)
    setDone(true)
  }
  return (
    <AuthFrame label="Reset password">
      <div><h1>Forgot your password?</h1><p className="muted gap-top">Enter your e-mail and we will send you a link to choose a new one.</p></div>
      {done ? (
        <div className="notice good">If an account exists for {email}, a reset link is on its way.</div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="field">E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <button className="btn primary lg block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <Link to="/login" className="small">Back to sign in</Link>
    </AuthFrame>
  )
}

// Used from a reset link (inside the frame) and from Account (inside the app).
export function SetPassword({ inApp }) {
  const { endRecovery } = useAuth()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const submit = async (e) => {
    e.preventDefault()
    if (p1.length < 8) return toast.error('Use at least 8 characters.')
    if (p1 !== p2) return toast.error('The passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Password saved.')
    setP1(''); setP2('')
    endRecovery()
    nav('/')
  }
  const body = (
    <>
      <div><h1>{inApp ? 'Change your password' : 'Choose a new password'}</h1></div>
      <form className="stack" onSubmit={submit}>
        <label className="field">New password <span className="hint">At least 8 characters</span><PasswordInput autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required /></label>
        <label className="field">Type it again<PasswordInput autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required /></label>
        <button className="btn primary lg block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </>
  )
  if (inApp) return <section className="card narrow">{body}</section>
  return <AuthFrame label="New password">{body}</AuthFrame>
}
