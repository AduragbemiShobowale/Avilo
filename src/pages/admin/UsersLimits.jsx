import { useState } from 'react'
import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { PageHead, Card, uname } from '../../components/ui'
import { usd, ROLE_LABEL } from '../../lib/format'

const CAPS = [
  ['tower.view', 'View control tower'], ['stores.use', 'Receive, issue, transfer'], ['request.raise', 'Raise part or AOG request'],
  ['rec.approve', 'Approve reorder below limit'], ['rec.approve.high', 'Second approval above limit'], ['compliance.use', 'Verify certificates, change condition'],
  ['supplier.portal', 'Confirm and ship own orders'], ['audit.view', 'Read audit log'], ['limit.propose', 'Propose approval limit'], ['limit.approve', 'Approve approval limit'],
]
const ROLES = ['admin', 'operator', 'technician', 'planner', 'procurement', 'compliance', 'supplier', 'viewer']

export default function UsersLimits() {
  const { role } = useAuth()
  const { S, act } = useLive()
  const [v, setV] = useState(S.limit)
  const pl = S.pendingLimit

  return (
    <>
      <PageHead title="Users & limits" sub="Roles, station scope and the approval limit. Any change that widens spending power needs a second person." />
      <div className="grid g2 top">
        <Card title="Approval limit">
          <p>Orders at or above <b className="mono">{usd(S.limit)}</b> need the Procurement Manager as well as the Planner.</p>
          {pl && <div className="why">Proposed change to <b className="mono">{usd(pl.value)}</b> by {uname(pl.by)}. Waiting for the Procurement Manager.</div>}
          {pl && role === 'procurement' && (
            <div className="row">
              <button className="btn danger" onClick={() => act('decide_limit', { p_ok: false })}>Reject</button>
              <button className="btn primary" onClick={() => act('decide_limit', { p_ok: true })}>Approve change</button>
            </div>
          )}
          {role === 'admin' && !pl && (
            <form className="row" onSubmit={(e) => { e.preventDefault(); act('propose_limit', { p_value: Number(v) }) }}>
              <input className="inp mono auto" type="number" min="500" step="500" value={v} onChange={(e) => setV(e.target.value)} aria-label="New limit in USD" />
              <button className="btn">Propose new limit</button>
            </form>
          )}
          <p className="note">The Admin cannot change this alone. Raising it would quietly remove second approvals.</p>
          {['admin', 'superadmin'].includes(role) && (
            <div className="reset">
              <b>Demo data</b>
              <p className="note">Restores the seeded starting scenario for everyone: the overdue pump, the AOG brake and the six recommendations.</p>
              <button className="btn danger" onClick={() => act('reset_demo', {})}>Reset demo data</button>
            </div>
          )}
        </Card>
        <Card title="Blocked role combinations">
          <div className="list">
            <div className="li"><div className="grow"><b>Admin + any approving role</b><span className="small muted">Could create a user and approve through it.</span></div></div>
            <div className="li"><div className="grow"><b>Stores Operator + Compliance at one station</b><span className="small muted">Could receive and certify the same part.</span></div></div>
            <div className="li"><div className="grow"><b>Planner + Procurement Manager</b><span className="small muted">Would collapse two-level approval into one person.</span></div></div>
          </div>
        </Card>
      </div>
      <Card title="Users">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Station scope</th><th>Sign-in</th></tr></thead>
            <tbody>{AV.users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{ROLE_LABEL[u.role]}</td><td className="mono small">{u.scope.length === 4 ? 'All stations' : u.scope.join(', ') || 'Own orders only'}</td><td className="mono small">{u.email}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card title="Permissions matrix">
        <p className="note">Generated from the same rules the app uses, and enforced again by the database on every action.</p>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Capability</th>{ROLES.map((r) => <th key={r} className="num">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>{CAPS.map(([c, l]) => <tr key={c}><td>{l}</td>{ROLES.map((r) => <td key={r} className="num">{AV.matrix[c].includes(r) ? <b style={{ color: 'var(--ok)' }}>Y</b> : <span className="muted">–</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
