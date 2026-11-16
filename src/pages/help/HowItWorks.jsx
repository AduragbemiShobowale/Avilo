import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_GUIDE, ROLE_STEPS } from '../../lib/guide'
import { ROLE_LABEL } from '../../lib/format'
import { PageHead, Card } from '../../components/ui'
import Icon from '../../components/icons'

// Only the signed-in role: what it is for, and a checklist of things to try, each with a button
// that opens the right page. Ticks are remembered in this browser.
export default function HowItWorks() {
  const { profile, role } = useAuth()
  const g = ROLE_GUIDE[role]
  const station = profile.scope?.length && profile.scope.length < 4 ? profile.scope.join(' / ') : 'your station'
  const steps = (ROLE_STEPS[role] || []).map((s) => ({ ...s, do: s.do.replace('{station}', station) }))
  const key = 'avilo-steps-' + role
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } })
  const toggle = (i) => {
    const n = done.includes(i) ? done.filter((x) => x !== i) : [...done, i]
    setDone(n)
    try { localStorage.setItem(key, JSON.stringify(n)) } catch { /* private mode */ }
  }

  return (
    <>
      <PageHead title="How Avilo works for you" sub={`You are signed in as ${profile.name}, ${ROLE_LABEL[role]}.`} />

      <div className="grid g2 top">
        <Card title="Your role">
          <p className="lead-line">{g.who}</p>
          <div className="cando">
            <div><span className="label">You can</span><ul>{g.does.map((d) => <li key={d}>{d}</li>)}</ul></div>
            <div><span className="label">You cannot</span><ul className="no">{g.cannot.map((d) => <li key={d}>{d}</li>)}</ul></div>
          </div>
        </Card>
        <Card title="Avilo in one minute">
          <p>Parts move between stores, stations and aircraft all day. If one move is not recorded, the system says a part is somewhere it is not, and an aircraft waits.</p>
          <p>Avilo records every move the moment it happens, suggests what to reorder, and makes sure the right person approves each step. Everyone sees the same, up-to-date picture.</p>
        </Card>
      </div>

      <Card title="Things to try" aside={`${done.length} of ${steps.length} done`}>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i} className={done.includes(i) ? 'done' : ''}>
              <button className="tick" onClick={() => toggle(i)} aria-pressed={done.includes(i)} aria-label={done.includes(i) ? 'Mark as not done' : 'Mark as done'}>
                {done.includes(i) ? <Icon name="check" size={16} /> : i + 1}
              </button>
              <div className="step-text">
                <b>{s.do}</b>
                <span className="muted">What you should see: {s.see}</span>
              </div>
              <Link className="btn" to={s.go}>Go there <Icon name="arrow" size={16} /></Link>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Words you will see">
        <dl className="glossary">
          <dt>AOG</dt><dd>Aircraft on ground: the aircraft cannot fly until a part arrives. Always the most urgent.</dd>
          <dt>P/N and S/N</dt><dd>Part number (what kind of part) and serial number (this exact one).</dd>
          <dt>In transit / Overdue</dt><dd>On its way between stations. Overdue means nobody confirmed it arrived within 72 hours.</dd>
          <dt>Serviceable</dt><dd>Checked, certified and safe to fit on an aircraft.</dd>
          <dt>Reorder point</dt><dd>When stock falls to this number, Avilo suggests ordering more.</dd>
          <dt>Approval limit</dt><dd>USD 5,000. Below it, the Planner approves alone. At or above it, the Planner approves first and then the Procurement Manager.</dd>
          <dt>Form 1 / 8130-3</dt><dd>The safety certificate that comes with every aircraft part.</dd>
        </dl>
      </Card>
    </>
  )
}
