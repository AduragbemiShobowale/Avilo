import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Globe } from '../../components/Scene3D'
import Logo from '../../components/Logo'
import Icon from '../../components/icons'

const DEMO = [
  ['Supply Chain Planner', 'planner'], ['Stores · LHR and DXB', 'stores.lhr'], ['Stores · SIN', 'stores.sin'], ['Stores · LOS', 'stores.los'],
  ['Technician · SIN', 'technician'], ['Procurement Manager', 'procurement'], ['Compliance Officer', 'compliance'], ['Supplier · Halcyon', 'supplier'],
  ['Admin', 'admin'], ['Super Admin', 'support'], ['Management viewer', 'finance'],
]

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const net = useMemo(() => ({ transits: [], pos: [], stations: { LHR: { label: 'London' }, SIN: { label: 'Singapore' }, LOS: { label: 'Lagos' }, DXB: { label: 'Dubai' } } }), [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await signIn(email, password) } catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <div className="auth">
      <div className="auth-art">
        <Globe data={net} height="100%" />
        <div className="auth-copy">
          <Link to="/" aria-label="Avilo home"><Logo height={28} /></Link>
          <div className="stack">
            <h1>Aviation logistics, without the blind spots.</h1>
            <ul>
              <li><Icon name="check" /> Every part on one ledger, across every station and in transit.</li>
              <li><Icon name="check" /> Forecasts built for sparse, lumpy spares demand.</li>
              <li><Icon name="check" /> Reorders that explain themselves, approved by the right people.</li>
            </ul>
          </div>
          <small>Capstone prototype · all data simulated</small>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-card">
          <div className="stack tight">
            <h1>Sign in</h1>
            <p className="muted">Every role uses the same sign-in. Your role decides what you see.</p>
          </div>
          <form className="stack" onSubmit={submit}>
            <label className="field">E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            {err && <div className="notice bad">{err}</div>}
            <button className="btn primary lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="stack tight">
            <span className="label">Demo accounts</span>
            <div className="acc">
              {DEMO.map(([r, l]) => (
                <button type="button" key={l} className="accb" onClick={() => setEmail(`${l}@avilo.test`)}>
                  <span>{r}</span><span className="mono small muted">{l}@avilo.test</span>
                </button>
              ))}
            </div>
            <p className="small muted">Selecting an account fills in its e-mail. Passwords are held by the project team.</p>
          </div>
          <Link to="/" className="small">← Back to the overview</Link>
        </div>
      </div>
    </div>
  )
}
