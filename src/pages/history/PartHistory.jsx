import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AV from '../../lib/engine'
import { useLive } from '../../context/LiveContext'
import { ItemChip, PageHead, Card, Empty, part, uname } from '../../components/ui'
import { fDate, fTime, age, EVENT_LABEL, ROLE_LABEL } from '../../lib/format'

export default function PartHistory() {
  const { S } = useLive()
  const [params, setParams] = useSearchParams()
  const id = (params.get('id') || 'HP-10482').toUpperCase()
  const [q, setQ] = useState(id)
  const it = S.items[id]
  const evs = S.events.filter((e) => e.item === id || (e.item && e.item.startsWith(id + '/')) || (e.type === 'TRANSFER_IN' && S.events.some((x) => x.trf === e.trf && x.item === id)))
  const picks = ['HP-10482', 'AD-55102', ...Object.values(S.items).filter((i) => i.transit).map((i) => i.id)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5)
  const role = (u) => (AV.userBy[u] ? ROLE_LABEL[AV.userBy[u].role] : '')

  return (
    <>
      <PageHead title="Part history" sub="Every movement of a serial or batch, from receipt to now. Nothing here can be edited; corrections are new events." />
      <Card>
        <form className="scan" onSubmit={(e) => { e.preventDefault(); setParams({ id: q.trim().toUpperCase() }) }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Serial or batch number" />
          <button className="btn primary lg">Show history</button>
        </form>
        <div className="row small">Try: {picks.map((p) => <button key={p} className="btn ghost mono" onClick={() => { setQ(p); setParams({ id: p }) }}>{p}</button>)}</div>
      </Card>
      {!it ? <Empty>No serial or batch <span className="mono">{id}</span> in the ledger.</Empty> : (
        <div className="split">
          <Card title={<>{part(it.pn).name} <span className="mono">{id}</span></>} aside={<ItemChip it={it} />}>
            <div className="timeline">
              {evs.map((e) => (
                <div className="tl" key={e.id}>
                  <span className="when">{fDate(e.ts)}<br />{fTime(e.ts)}</span>
                  <span className="rail"><i className={e.type === 'TRANSFER_OUT' && it.transit?.trf === e.trf ? 'warn' : ''} /></span>
                  <div className="what">
                    <b>{EVENT_LABEL[e.type]}{e.type === 'CONDITION' ? `: ${AV.condLabel(e.cond)}` : ''}</b>
                    <span className="small muted">{[e.from, e.to].filter(Boolean).join(' → ')}{e.trf ? ` · ${e.trf}` : ''}{e.ref ? ` · ${e.ref}` : ''}{e.aircraft ? ` · ${e.aircraft}` : ''}{e.cert ? ` · ${e.cert}` : ''}</span>
                    <span className="small">{uname(e.actor)}{role(e.actor) ? `, ${role(e.actor)}` : ''} · via {e.source}{e.reason ? ` · ${e.reason}` : ''}</span>
                  </div>
                </div>
              ))}
              {it.transit && (
                <div className="tl">
                  <span className="when">now</span><span className="rail"><i className="warn" /></span>
                  <div className="what"><b>No receipt recorded at {it.transit.to}</b><span className="small muted">{AV.isOverdue(it.transit) ? `Overdue by ${age(it.transit.ts + AV.OVERDUE_HOURS * 36e5)}. The planner has an alert.` : `Within the ${AV.OVERDUE_HOURS} h window.`}</span></div>
                </div>
              )}
            </div>
          </Card>
          <div className="stack">
            <Card title="Right now">
              <dl className="facts">
                <dt>Location</dt><dd>{it.loc || (it.transit ? `Between ${it.transit.from} and ${it.transit.to}` : it.onAircraft ? `Fitted to ${it.onAircraft}` : '–')}</dd>
                <dt>Condition</dt><dd><ItemChip it={it} /></dd>
                <dt>Certificate</dt><dd>{it.cert || 'Not verified'}</dd>
                <dt>Events in ledger</dt><dd className="mono">{evs.length}</dd>
              </dl>
            </Card>
            <Card title="Why this matters">
              <p className="note">A spreadsheet stores where a part is. The ledger stores how it got there. When the two disagree, the ledger shows the exact step that went missing, who did the last one, and when.</p>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
