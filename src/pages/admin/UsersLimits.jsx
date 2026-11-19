import { useState } from 'react'
import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { PageHead, Card, Chip, Modal, Empty, uname } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { usd, ROLE_LABEL, fDT } from '../../lib/format'

const CAPS = [
  ['tower.view', 'View control tower'], ['stores.use', 'Receive, issue, transfer'], ['request.raise', 'Raise part or AOG request'],
  ['rec.approve', 'Approve reorder below limit'], ['rec.approve.high', 'Second approval above limit'], ['compliance.use', 'Verify certificates, change condition'],
  ['supplier.portal', 'Confirm and ship own orders'], ['audit.view', 'Read audit log'], ['limit.propose', 'Propose approval limit'], ['limit.approve', 'Approve approval limit'],
]
const ROLES = ['admin', 'operator', 'technician', 'planner', 'procurement', 'compliance', 'supplier']

const STATIONS = ['LHR', 'SIN', 'LOS', 'DXB']
const HIGH = ['planner', 'procurement', 'compliance', 'admin']
const scopeText = (u) => (u.role === 'supplier' ? (AV.supBy[u.supplier]?.name || 'Own orders only') : u.scope.length === 4 ? 'All stations' : u.scope.join(', '))

// Admin asks for an account; high-risk roles wait for the Procurement Manager; the Admin then issues the login.
function Accounts({ S, role, act, reload }) {
  const blank = { email: '', name: '', role: 'operator', scope: ['LHR'], supplier: 'SUP-1' }
  const [f, setF] = useState(blank)
  const [issued, setIssued] = useState(null)
  const [busy, setBusy] = useState(null)
  const [edit, setEdit] = useState(null)
  const [showOff, setShowOff] = useState(false)
  const open = S.accountRequests.filter((q) => ['Awaiting approval', 'Approved'].includes(q.status))
  const recent = S.accountRequests.filter((q) => !['Awaiting approval', 'Approved'].includes(q.status)).slice(0, 6)
  const needsStations = ['operator', 'technician'].includes(f.role)
  const toggle = (arr, x) => (arr.includes(x) ? arr.filter((y) => y !== x) : arr.concat(x))

  const issue = async (q) => {
    setBusy(q.id)
    const { data, error } = await supabase.functions.invoke('create-account', { body: { request_id: q.id } })
    setBusy(null)
    if (error) {
      let msg = error.message
      try { msg = (await error.context.json()).error || msg } catch (e) { /* keep generic message */ }
      return toast.error(msg)
    }
    setIssued(data); reload()
  }

  return (
    <>
      <Card title="Accounts" aside="Nobody can sign themselves up">
        {role === 'admin' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); act('request_account', { p_email: f.email, p_name: f.name, p_role: f.role, p_scope: needsStations ? f.scope : [], p_supplier: f.role === 'supplier' ? f.supplier : null }).then((ok) => ok && setF(blank)) }}>
            <div className="grid g2">
              <label className="field">Full name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. R. Adeyemi" /></label>
              <label className="field">Work e-mail<input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@company.com" /></label>
            </div>
            <div className="grid g2">
              <label className="field">Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['operator', 'technician', 'planner', 'procurement', 'compliance', 'supplier', 'admin'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}{HIGH.includes(r) ? ' · needs approval' : ''}</option>)}</select></label>
              {needsStations && <div className="field">Stations<div className="row">{STATIONS.map((c) => <label key={c} className="small"><input type="checkbox" checked={f.scope.includes(c)} onChange={() => setF({ ...f, scope: toggle(f.scope, c) })} /> {c}</label>)}</div></div>}
              {f.role === 'supplier' && <label className="field">Supplier company<select value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })}>{AV.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
              {!needsStations && f.role !== 'supplier' && <div className="field">Stations<span className="small muted">All stations</span></div>}
            </div>
            <div className="row"><span className="small muted">{HIGH.includes(f.role) ? 'This role can approve spending, certify parts or change the system, so the Procurement Manager must agree first.' : 'This role is created as soon as you issue the login.'}</span><span className="spacer" /><button className="btn primary">Request account</button></div>
          </form>
        )}
        <div className="list">
          {open.map((q) => (
            <div className="li" key={q.id}>
              <span className={`sev ${q.status === 'Approved' ? 'ok' : 'warn'}`} />
              <div className="grow">
                <b>{q.kind === 'create' ? `New ${ROLE_LABEL[q.role]}: ${q.name}` : q.kind === 'role' ? `Make ${q.name} a ${ROLE_LABEL[q.role]}` : `Reactivate ${q.name}`}</b>
                <span className="small muted">{q.email} · {q.role === 'supplier' ? AV.supBy[q.supplier]?.name : q.scope.length === 4 ? 'All stations' : q.scope.join(', ')} · asked by {uname(q.by)} {fDT(q.ts)}</span>
                <span><Chip k={q.status === 'Approved' ? 'approved' : 'pending'}>{q.status === 'Approved' ? (q.decidedBy ? `Approved by ${uname(q.decidedBy)}` : 'No approval needed') : 'Waiting for the Procurement Manager'}</Chip></span>
              </div>
              {role === 'procurement' && q.status === 'Awaiting approval' && <div className="row"><button className="btn danger" onClick={() => act('decide_account_request', { p_id: q.id, p_ok: false })}>Reject</button><button className="btn primary" onClick={() => act('decide_account_request', { p_id: q.id, p_ok: true })}>Approve</button></div>}
              {role === 'admin' && <div className="row">
                <button className="btn ghost" onClick={() => act('cancel_account_request', { p_id: q.id })}>Cancel</button>
                {q.kind === 'create' && q.status === 'Approved' && <button className="btn primary" disabled={busy === q.id} onClick={() => issue(q)}>{busy === q.id ? 'Creating…' : 'Create account'}</button>}
              </div>}
            </div>
          ))}
          {!open.length && <Empty>No account requests waiting.</Empty>}
          {recent.length > 0 && <p className="small muted">Recent: {recent.map((q) => `${q.name} (${q.kind}, ${q.status.toLowerCase()})`).join(' · ')}</p>}
        </div>
      </Card>

      <Card title="Users" aside={<label className="small"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show {AV.users.filter((u) => !u.active).length} deactivated</label>}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Scope</th><th>Sign-in</th><th>Status</th>{role === 'admin' && <th />}</tr></thead>
            <tbody>{AV.users.filter((u) => showOff || u.active).map((u) => (
              <tr key={u.id} className={u.active ? '' : 'muted'}>
                <td>{u.name}</td><td>{ROLE_LABEL[u.role]}</td><td className="mono small">{scopeText(u)}</td><td className="mono small">{u.email}</td>
                <td>{!u.active ? <Chip k="scrapped">Deactivated</Chip> : u.mustChange ? <Chip k="pending">First sign-in pending</Chip> : <Chip k="serviceable">Active</Chip>}</td>
                {role === 'admin' && <td className="nowrap">{u.role !== 'superadmin' && u.role !== 'admin' && <>
                  <button className="btn ghost sm" onClick={() => setEdit({ id: u.id, name: u.name, role: u.role, scope: u.scope.length ? u.scope : ['LHR'], supplier: u.supplier || 'SUP-1' })}>Change role</button>
                  <button className="btn ghost sm" onClick={() => act('set_account_active', { p_user: u.id, p_active: !u.active })}>{u.active ? 'Deactivate' : 'Reactivate'}</button>
                </>}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      {issued && (
        <Modal title="Account created" onClose={() => setIssued(null)} actions={<button className="btn primary" onClick={() => setIssued(null)}>Done</button>}>
          <p>Give these details to <b>{issued.name}</b> in person or by phone. The password is shown only once.</p>
          <div className="why mono">E-mail: {issued.email}<br />Temporary password: <b>{issued.password}</b></div>
          <div className="row"><button className="btn" onClick={() => { navigator.clipboard?.writeText(`${issued.email} ${issued.password}`); toast.success('Copied.') }}>Copy</button></div>
          <p className="small muted">At first sign-in they must choose their own password. You will never see it.</p>
        </Modal>
      )}
      {edit && (
        <Modal title={`Change role · ${edit.name}`} onClose={() => setEdit(null)} actions={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={() => act('request_role_change', { p_user: edit.id, p_role: edit.role, p_scope: ['operator', 'technician'].includes(edit.role) ? edit.scope : [], p_supplier: edit.role === 'supplier' ? edit.supplier : null }).then((ok) => ok && setEdit(null))}>Save</button></>}>
          <label className="field">Role<select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{['operator', 'technician', 'planner', 'procurement', 'compliance', 'supplier', 'admin'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
          {['operator', 'technician'].includes(edit.role) && <div className="row">{STATIONS.map((c) => <label key={c} className="small"><input type="checkbox" checked={edit.scope.includes(c)} onChange={() => setEdit({ ...edit, scope: toggle(edit.scope, c) })} /> {c}</label>)}</div>}
          {edit.role === 'supplier' && <label className="field">Supplier company<select value={edit.supplier} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })}>{AV.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          <p className="small muted">{HIGH.includes(edit.role) ? 'Giving this role needs the Procurement Manager’s approval.' : 'Takes effect straight away.'}</p>
        </Modal>
      )}
    </>
  )
}

export default function UsersLimits() {
  const { role } = useAuth()
  const { S, act, reload } = useLive()
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
      <Accounts S={S} role={role} act={act} reload={reload} />
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
