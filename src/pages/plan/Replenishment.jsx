import { useMemo } from 'react'
import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { Chip, PageHead, Card, Empty, part, uname } from '../../components/ui'
import { fDate, usd } from '../../lib/format'

function RecCard({ r, S, profile, act }) {
  const p = part(r.pn)
  const d = r.decision || { approvals: [] }
  const high = r.value >= S.limit
  const canApprove = ['planner', 'procurement'].includes(profile.role)
  const path = r.aog ? 'AOG fast path: one approval by Planner or Procurement Manager, reviewed within 24 h'
    : high ? `At or above ${usd(S.limit)}: Planner, then Procurement Manager` : `Below ${usd(S.limit)}: one approval`
  let block = ''
  if (!canApprove) block = 'Your role can view but not approve.'
  else if (d.approvals.some((a) => a.by === profile.id)) block = 'You already approved. A second person must act.'
  else if (high && !r.aog && profile.role === 'procurement' && !d.approvals.length) block = "Waiting for the Planner's approval first."
  const q = S.requests.find((x) => x.pn === r.pn && x.station === r.station && x.status === 'Open')

  return (
    <section className={`card rec ${r.aog ? 'is-aog' : ''}`}>
      <div className="ch top">
        <div className="stack tight">
          <h3>Reorder {r.qty} × {p.name}, {r.station}</h3>
          <span className="small muted mono">P/N {p.pn} · {AV.supBy[p.sup].name} · lead {p.lead} d</span>
        </div>
        <div className="stack tight end">
          <span className="mono amount">{usd(r.value)}</span>
          <span className="row">{r.aog && <Chip k="aog" />}<span className="chip c-off">Crit. {r.crit}</span></span>
        </div>
      </div>
      <div className="why">{r.why}</div>
      {r.lateral && (
        <div className="row small lateral">
          <span>Cheaper and faster: {r.lateral.code} has {r.lateral.spare} spare above its own reorder point.</span>
          {canApprove && <button className="btn ghost" onClick={() => act('lateral_transfer', { p_rec: r.id, p_pn: r.pn, p_from: r.lateral.code, p_to: r.station, p_qty: Math.min(r.lateral.spare, Math.max(1, q ? q.qty : 1)) })}>Transfer from {r.lateral.code} instead</button>}
        </div>
      )}
      <div className="ch">
        <span className="small muted">{path}{d.approvals.length ? ` · approved by ${d.approvals.map((a) => uname(a.by)).join(', ')}` : ''}</span>
        <div className="row">
          {block && <span className="small muted">{block}</span>}
          <button className="btn danger" disabled={!canApprove} onClick={() => act('reject_rec', { p_rec: r.id })}>Reject</button>
          <button className="btn primary" disabled={!!block} onClick={() => act('approve_rec', { p_rec: r.id, p_pn: r.pn, p_station: r.station, p_qty: r.qty })}>Approve</button>
        </div>
      </div>
    </section>
  )
}

export default function Replenishment() {
  const { profile } = useAuth()
  const { S, act } = useLive()
  const recs = useMemo(() => AV.recommend(S), [S])
  const open = recs.filter((r) => !r.decision || r.decision.status === 'Awaiting second approval')
  const done = Object.entries(S.recDecisions).filter(([, d]) => !['Proposed', 'Awaiting second approval'].includes(d.status))
  const pos = S.pos.filter((o) => o.status !== 'Received').slice().reverse()

  return (
    <>
      <PageHead title="Replenishment" sub="The engine recommends. People approve. Nothing is ordered automatically.">
        <span className="pill light">Approval limit {usd(S.limit)}</span>
      </PageHead>
      <div className="grid g2 top">
        <div className="stack">
          {open.length ? open.map((r) => <RecCard key={r.id} r={r} S={S} profile={profile} act={act} />) : <Empty>No open recommendations.</Empty>}
        </div>
        <div className="stack">
          <Card title="Purchase orders in flight">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>PO</th><th>Part</th><th>To</th><th>Supplier</th><th>Status</th><th className="num">Value</th></tr></thead>
                <tbody>
                  {pos.map((o) => (
                    <tr key={o.id}>
                      <td className="mono small">{o.id}</td><td>{o.qty} × {part(o.pn).name}</td><td>{o.station}</td>
                      <td className="small">{AV.supBy[o.sup].name}</td>
                      <td>{o.status}{o.promised && <div className="small muted">due {fDate(o.promised)}</div>}</td>
                      <td className="num mono">{usd(o.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Decided">
            <div className="list">
              {done.length ? done.map(([id, d]) => {
                const pn = id.slice(4, id.lastIndexOf('-'))
                return (
                  <div className="li" key={id}>
                    <div className="grow"><b>{part(pn)?.name} · {id.slice(id.lastIndexOf('-') + 1)}</b><span className="small muted">{d.status}{d.po ? ` · ${d.po}` : ''}{d.note ? ` · ${d.note}` : ''}</span></div>
                  </div>
                )
              }) : <Empty>Decisions appear here, with the name of whoever made them.</Empty>}
            </div>
          </Card>
          <Card title="Supplier scorecards">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Supplier</th><th className="num">Orders</th><th className="num">On time</th><th className="num">Avg lead</th></tr></thead>
                <tbody>
                  {AV.suppliers.map((s) => {
                    const c = AV.scorecard(S, s.id)
                    return <tr key={s.id}><td>{s.name} <span className="small muted">{s.code}</span></td><td className="num mono">{c.n}</td><td className="num mono">{c.onTime == null ? '–' : Math.round(c.onTime * 100) + '%'}</td><td className="num mono">{c.lead == null ? '–' : c.lead.toFixed(0) + ' d'}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">Measured from promised and received dates on past orders. These lead times feed back into reorder points.</p>
          </Card>
        </div>
      </div>
    </>
  )
}
