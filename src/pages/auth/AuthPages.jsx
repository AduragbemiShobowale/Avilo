import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Logo from '../../components/Logo'
import { mountHangar } from '../../lib/hangar'
import PasswordInput from '../../components/PasswordInput'

// The frame for every signed-out screen: Avilo's hangar at night, live in 3D, with the
// form floating over it on dark glass. Labels are pinned to things in the scene.
function useClock() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])
  const d = new Date(now)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

export function AuthFrame({ children, label = 'Sign in' }) {
  const stage = useRef(null)
  const tags = { part: useRef(null), craft: useRef(null), engine: useRef(null) }
  const clock = useClock()
  const copy = useRef(null)
  const card = useRef(null)
  useEffect(() => {
    const hangar = mountHangar(stage.current, {
      onFrame: (f) => {
        const avoid = [copy.current, card.current].filter(Boolean).map((n) => n.getBoundingClientRect())
        for (const k of ['part', 'craft', 'engine']) {
          const el = tags[k].current; if (!el) continue
          const { x, y } = f[k]
          const clear = !avoid.some((r) => x > r.left - 230 && x < r.right + 20 && y > r.top - 20 && y < r.bottom + 70)
          const on = clear && f[k].visible && (k === 'part' ? f.found : f.t > (k === 'craft' ? 3.4 : 4.4))
          el.style.transform = `translate(${f[k].x}px, ${f[k].y}px)`
          el.classList.toggle('on', !!on)
        }
      },
    })
    const go = () => hangar.start()
    if (window.__aviloIntroDone) go(); else window.addEventListener('avilo:intro-done', go, { once: true })
    return () => { window.removeEventListener('avilo:intro-done', go); hangar.destroy() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="hangar">
      <div className="hangar-stage" ref={stage} aria-hidden="true" />
      <div className="hangar-tags" aria-hidden="true">
        <div className="htag found" ref={tags.part}><span className="mono">HP-10482 · Rack C-04</span><b>Hydraulic pump located</b></div>
        <div className="htag" ref={tags.craft}><span className="mono">AVL-02 · Stand 2</span><b>C-check in progress</b></div>
        <div className="htag" ref={tags.engine}><span className="mono">No. 1 engine</span><b>Pump fitted here</b></div>
      </div>
      <div className="hangar-ui">
        <header className="hangar-top">
          <Logo height={28} />
          <span className="mono hangar-status"><i /> LHR · Hangar 2 · {clock}</span>
        </header>
        <div className="hangar-main">
          <div className="hangar-copy" ref={copy}>
            <span className="kicker">Aviation spares control tower</span>
            <h1>Every aircraft part, located.</h1>
            <p>Avilo follows every rotable and consumable from the store shelf to the wing, across every station and every transfer, so no aircraft waits for a part that was already in the network.</p>
          </div>
          <div className="glass" ref={card}>
            <div className="glass-head"><span>{label}</span><span className="mono">Avilo</span></div>
            <div className="glass-body">{children}</div>
          </div>
        </div>
        <footer className="hangar-foot">
          <span>Accounts are created by your organisation. Suppliers join by invitation.</span>
          <span className="mono">Capstone prototype · simulated data</span>
        </footer>
      </div>
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
      <div><h2 className="glass-title">Welcome back</h2><p className="muted gap-top">Sign in to see your stations, parts and orders.</p></div>
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
      <div><h2 className="glass-title">Forgot your password?</h2><p className="muted gap-top">Enter your e-mail and we will send you a link to choose a new one.</p></div>
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
      <div>{inApp ? <h1>Change your password</h1> : <h2 className="glass-title">Choose a new password</h2>}</div>
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
