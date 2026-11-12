import { Component, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, matchPath } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { ROLE_LABEL, fDT, initials } from '../lib/format'
import { SCREENS } from '../pages/screens/registry'
import Icon from './icons'
import Logo from './Logo'
import { Loading } from './ui'

// Keeps a crash in one page from blanking the whole app. Resets when the route changes.
class PageErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidUpdate(prev) { if (prev.path !== this.props.path && this.state.error) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="notice bad">
        <strong>This page could not be shown.</strong> Reload to try again.
        <div className="small mono">{String(this.state.error.message || this.state.error)}</div>
      </div>
    )
  }
}

function Clock() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id) }, [])
  return <span className="pill mono hide-sm">{fDT(now)}</span>
}

export default function Layout() {
  const { profile, role, signOut } = useAuth()
  const { S, error, scanner, setScanner } = useLive()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  const screens = (SCREENS[role] || []).filter((s) => !s.hidden)
  const groups = []
  for (const s of screens) {
    let g = groups.find((x) => x.name === s.group)
    if (!g) groups.push((g = { name: s.group, items: [] }))
    g.items.push(s)
  }
  const current = (SCREENS[role] || []).find((s) => matchPath({ path: s.path, end: true }, loc.pathname))
  const scope = profile?.scope?.length === 4 ? 'All stations' : profile?.scope?.join(' · ') || 'Own orders'

  return (
    <div className="shell" data-role={role}>
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Main menu">
        <NavLink to="/" className="brand" aria-label="Avilo home"><Logo height={24} /></NavLink>
        <div className="role-chip"><i /><b>{ROLE_LABEL[role]}</b><span>{scope}</span></div>
        <nav>
          {groups.map((g) => (
            <div className="nav-group" key={g.name}>
              <small>{g.name}</small>
              {g.items.map((m) => {
                const n = S && m.count ? m.count(S, profile) : 0
                return (
                  <NavLink key={m.path} to={m.path} end={m.path === '/'}>
                    <Icon name={m.icon} /><span>{m.label}</span>{n > 0 && <span className="count">{n}</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="me">
            <span className="avatar">{initials(profile?.name)}</span>
            <div><b>{profile?.name}</b><small>{profile?.email}</small></div>
          </div>
          <button className="side-out" onClick={signOut}><Icon name="out" /> Sign out</button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="top">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <div className="top-title"><span className="crumb">Avilo · {ROLE_LABEL[role]}</span><b>{current?.label || 'Avilo'}</b></div>
          <span className="spacer" />
          <span className="pill sim">Simulated data</span>
          <Clock />
          {role !== 'supplier' && (
            <button className={`pill ${scanner ? 'live' : ''}`} onClick={() => setScanner(!scanner)} title="The scanner simulator posts stock movements through the same server door as a real scanner">
              <span className="dot" />{scanner ? 'Scanner feed live' : 'Scanner feed off'}
            </button>
          )}
        </header>
        <main className="page">
          {error && <div className="notice bad">Could not load data: {error}</div>}
          {!S ? <Loading /> : <PageErrorBoundary path={loc.pathname}><Outlet /></PageErrorBoundary>}
        </main>
      </div>
    </div>
  )
}
