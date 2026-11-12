import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { Plane } from '../../components/Scene3D'
import { Chip, ItemChip, PageHead, Card, part, uname } from '../../components/ui'
import { fDate, usd, age } from '../../lib/format'

export default function FindPart() {
  const { profile, role } = useAuth()
  const { S, act } = useLive()
  const [params, setParams] = useSearchParams()
  const pn = params.get('pn') || '3214552-3'
  const p = part(pn) || AV.parts[0]
  const [q, setQ] = useState('')
  const canRequest = role === 'technician' || role === 'planner'
  const stations = role === 'technician' ? profile.scope : AV.stations.map((s) => s.code)
  const [form, setForm] = useState({ ac: 'AVL-04', st: stations[0], wo: 'WO-88' + (300 + (S.requests.length % 100)), pr: 'Routine' })

  const ql = q.toLowerCase()
  const list = AV.parts.filter((x) => !ql || x.name.toLowerCase().includes(ql) || x.pn.toLowerCase().includes(ql) || Object.values(S.items).some((i) => i.pn === x.pn && i.id.toLowerCase().includes(ql)))
  const moving = AV.transits(S).filter((t) => t.items.some((i) => i.pn === p.pn))
  const aogReq = S.requests.find((r) => r.pn === p.pn && r.status === 'Open' && r.priority === 'AOG')
  const bad = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim()

  return (
    <>
      <PageHead title="Find a part" sub="Search every station, including parts in transit. The aircraft shows where the part is fitted." />
      <div className="split">
        <div className="stack">
          <Plane zone={p.zone} color={aogReq ? bad : null} label={(aogReq ? `AOG · ${aogReq.aircraft} · ` : '') + AV.zones[p.zone]} kind={aogReq ? 'bad' : 'loc'} height={440}>
            <div className="cap"><h2>{p.name}</h2><span className="s">{AV.zones[p.zone]} · ATA {p.ata} · <span className="mono">P/N {p.pn}</span> · generic twin-jet</span></div>
          </Plane>
          <Card title="Where it is" aside={`${p.type} · criticality ${p.crit} · ${usd(p.cost)} each`}>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Station</th><th className="num">Serviceable, free</th><th>Other units</th><th className="num">Reorder point</th></tr></thead>
                <tbody>
                  {AV.stations.map((s) => {
                    const other = Object.values(S.items).filter((i) => i.pn === p.pn && i.loc === s.code && (i.cond !== 'serviceable' || i.reserved))
                    return (
                      <tr key={s.code}>
                        <td><b>{s.code}</b> <span className="small muted">{s.name}</span></td>
                        <td className="num mono">{AV.available(S, p.pn, s.code)}</td>
                        <td><span className="row">{other.length ? other.map((i) => <span key={i.id} className="row"><ItemChip it={i} />{i.reserved && <Chip k="reserved">For {i.reserved}</Chip>}</span>) : <span className="muted small">–</span>}</span></td>
                        <td className="num mono">{AV.ropFor(p.pn, s.code).avilo}</td>
                      </tr>
                    )
                  })}
                  {moving.map((t) => (
                    <tr key={t.trf}><td colSpan={4}><span className="row"><Chip k={t.overdue ? 'overdue' : 'transit'}>{t.overdue ? `Overdue ${age(t.ts)}` : 'In transit'}</Chip><span className="mono small">{t.items.filter((i) => i.pn === p.pn).map((i) => i.id).join(', ')}</span> {t.from} → {t.to} <span className="small muted">since {fDate(t.ts)}</span></span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <label className="label" htmlFor="findq">Search by name, P/N or serial</label>
            <input id="findq" className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. brake, 3214552-3, HP-10482" />
            <div className="list scroll">
              {list.map((x) => (
                <button key={x.pn} className={`li pick ${x.pn === p.pn ? 'on' : ''}`} onClick={() => setParams({ pn: x.pn })}>
                  <span className={`sev ${x.pn === p.pn ? 'loc' : ''}`} />
                  <span className="grow"><b>{x.name}</b><span className="small muted mono">{x.pn} · ATA {x.ata}</span></span>
                  <span className="mono small">{AV.stations.reduce((n, s) => n + AV.available(S, x.pn, s.code), 0)} {x.unit}</span>
                </button>
              ))}
            </div>
          </Card>

          {canRequest && (
            <Card title="Request this part">
              <form className="stack" onSubmit={(e) => { e.preventDefault(); act('raise_request', { p_pn: p.pn, p_station: form.st, p_aircraft: form.ac, p_wo: form.wo, p_priority: form.pr }) }}>
                <div className="grid g2">
                  <label className="field">Aircraft<select value={form.ac} onChange={(e) => setForm({ ...form, ac: e.target.value })}>{AV.fleet.map((f) => <option key={f.tail} value={f.tail}>{f.tail} · {f.status}</option>)}</select></label>
                  <label className="field">Needed at<select value={form.st} onChange={(e) => setForm({ ...form, st: e.target.value })}>{stations.map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                <div className="grid g2">
                  <label className="field">Work order<input className="mono" value={form.wo} onChange={(e) => setForm({ ...form, wo: e.target.value })} /></label>
                  <label className="field">Priority<select value={form.pr} onChange={(e) => setForm({ ...form, pr: e.target.value })}><option>Routine</option><option>AOG</option></select></label>
                </div>
                <p className="note">An AOG request reserves the nearest serviceable unit at once, and sends a transfer task if it sits at another station.</p>
                <button className="btn primary">Raise request</button>
              </form>
            </Card>
          )}

          <Card title="Part requests">
            <div className="list">
              {S.requests.slice().reverse().map((r) => (
                <div className="li" key={r.id}>
                  <span className={`sev ${r.priority === 'AOG' && r.status === 'Open' ? 'bad' : ''}`} />
                  <div className="grow"><b>{part(r.pn).name}</b><span className="small muted">{r.id} · {r.aircraft} · {r.station} · {r.status} · by {uname(r.by)}</span></div>
                  <Chip k={r.priority === 'AOG' ? 'aog' : 'routine'}>{r.priority}</Chip>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
