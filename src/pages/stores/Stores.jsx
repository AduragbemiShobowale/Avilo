import { useState } from 'react'
import { Link } from 'react-router-dom'
import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { Chip, ItemChip, PageHead, Card, Empty, part } from '../../components/ui'
import { fDate, fDT, age } from '../../lib/format'

function ScanResult({ q, station, S, act }) {
  const [dest, setDest] = useState({})
  const [qty, setQty] = useState({})
  const Q = q.trim().toUpperCase()
  if (!Q) return null
  const hits = Object.values(S.items).filter((i) => (i.id.toUpperCase() === Q || i.pn.toUpperCase() === Q || i.id.toUpperCase().startsWith(Q)) && i.cond !== 'scrapped').slice(0, 8)
  if (!hits.length) return <p className="note">No stock record matches <span className="mono">{q}</span>. Check the data plate, or receive it against a purchase order first.</p>
  return (
    <div className="list">
      {hits.map((i) => {
        const p = part(i.pn)
        const here = i.loc === station && i.cond === 'serviceable'
        const to = dest[i.id] || AV.stations.find((s) => s.code !== station).code
        return (
          <div className="li" key={i.id}>
            <div className="grow">
              <b>{p.name}</b>
              <span className="small muted"><span className="mono">P/N {p.pn} · {i.id}</span> · {i.loc ? `at ${i.loc}` : i.transit ? `${i.transit.from} → ${i.transit.to}` : i.onAircraft ? `fitted to ${i.onAircraft}` : ''} · {i.qty} {p.unit}</span>
              <span className="row"><ItemChip it={i} />{i.reserved && <Chip k="reserved">For {i.reserved}</Chip>}</span>
              {here && (
                <div className="row">
                  <select className="inp auto" value={to} onChange={(e) => setDest({ ...dest, [i.id]: e.target.value })} aria-label="Destination station">
                    {AV.stations.filter((s) => s.code !== station).map((s) => <option key={s.code}>{s.code}</option>)}
                  </select>
                  {i.qty > 1 && <input className="inp mono auto" type="number" min="1" max={i.qty} value={qty[i.id] || 1} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} aria-label="Quantity" />}
                  <button className="btn" onClick={() => act('ingest', { e: { type: 'TRANSFER_OUT', item: i.id, pn: i.pn, qty: Number(qty[i.id] || 1), from: station, to } }, `${qty[i.id] || 1} × ${p.name} sent to ${to}.`)}>Transfer out</button>
                </div>
              )}
            </div>
            <Link className="btn ghost" to={`/history?id=${encodeURIComponent(i.id)}`}>History</Link>
          </div>
        )
      })}
    </div>
  )
}

export default function Stores() {
  const { profile } = useAuth()
  const { S, act } = useLive()
  const scope = profile.scope
  const [station, setStation] = useState(scope[0])
  const [q, setQ] = useState('')
  const [lookup, setLookup] = useState('')
  const [turn, setTurn] = useState({ pn: AV.parts.find((p) => p.type === 'rotable').pn, sn: '', ac: 'AVL-01', why: 'Removed on condition' })

  const inbound = AV.transits(S).filter((t) => t.to === station)
  const tasks = S.tasks.filter((t) => t.from === station && t.status === 'Open')
  const deliveries = S.pos.filter((o) => o.station === station && o.status === 'Shipped')
  const toIssue = Object.values(S.items).filter((i) => i.loc === station && i.reserved).map((i) => [i, S.requests.find((r) => r.id === i.reserved)]).filter(([, r]) => r && r.status === 'Open' && r.station === station)
  const stock = Object.values(S.items).filter((i) => i.loc === station && i.qty > 0 && !['issued', 'scrapped'].includes(i.cond)).sort((a, b) => a.pn.localeCompare(b.pn))
  const work = inbound.length + tasks.length + deliveries.length + toIssue.length

  return (
    <>
      <PageHead title={`Stores · ${station}`} sub={`${AV.stations.find((s) => s.code === station).name} · ${profile.name}`}>
        {scope.length > 1 && scope.map((c) => <button key={c} className={`btn ${c === station ? 'primary' : ''}`} onClick={() => { setStation(c); setLookup('') }}>{c}</button>)}
      </PageHead>

      <Card>
        <label className="label" htmlFor="scan">Scan or type a part number, serial or batch</label>
        <form className="scan" onSubmit={(e) => { e.preventDefault(); setLookup(q) }}>
          <input id="scan" autoFocus autoComplete="off" spellCheck="false" placeholder="e.g. HP-10482 or 3214552-3" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary lg">Look up</button>
        </form>
        <ScanResult q={lookup} station={station} S={S} act={act} />
      </Card>

      <div className="split">
        <Card title={`Work for ${station}`} aside={`${work} tasks`}>
          <div className="list">
            {inbound.map((t) => (
              <div className="li" key={t.trf}>
                <span className={`sev ${t.overdue ? 'warn' : 'loc'}`} />
                <div className="grow">
                  <b>Confirm receipt · {t.trf}</b>
                  <span className="small muted">From {t.from} · sent {fDT(t.ts)} · {t.items.map((i) => `${i.id} ${part(i.pn).name}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ')}</span>
                  <span><Chip k={t.overdue ? 'overdue' : 'transit'}>{t.overdue ? `Overdue ${age(t.ts)}` : 'In transit'}</Chip></span>
                </div>
                <button className="btn primary lg" onClick={() => act('ingest', { e: { type: 'TRANSFER_IN', trf: t.trf, pn: t.items[0].pn } }, `${t.trf} received at ${station}. Stock, alerts and the reorder queue updated for everyone.`)}>Confirm receipt</button>
              </div>
            ))}
            {tasks.map((t) => (
              <div className="li" key={t.id}>
                <span className="sev bad" />
                <div className="grow"><b>Send {t.qty} × {part(t.pn).name} to {t.to}</b><span className="small muted">{t.why}</span></div>
                <button className="btn primary lg" onClick={() => act('send_task', { p_task: t.id })}>Send transfer</button>
              </div>
            ))}
            {deliveries.map((o) => (
              <div className="li" key={o.id}>
                <span className="sev loc" />
                <div className="grow"><b>Receive delivery · {o.id}</b><span className="small muted">{o.qty} × {part(o.pn).name} from {AV.supBy[o.sup].name} · {o.tracking} · certificate {o.certUploaded ? 'uploaded' : 'not yet uploaded'}</span></div>
                <button className="btn primary lg" onClick={() => act('receive_po', { p_po: o.id })}>Receive</button>
              </div>
            ))}
            {toIssue.map(([i, r]) => (
              <div className="li" key={i.id}>
                <span className={`sev ${r.priority === 'AOG' ? 'bad' : 'loc'}`} />
                <div className="grow"><b>Issue <span className="mono">{i.id}</span> to {r.aircraft}</b><span className="small muted">{r.id} · {r.wo} · {part(i.pn).name}</span><span><Chip k={r.priority === 'AOG' ? 'aog' : 'routine'}>{r.priority}</Chip></span></div>
                <button className="btn primary lg" onClick={() => act('issue_reserved', { p_item: i.id, p_req: r.id })}>Issue</button>
              </div>
            ))}
            {!work && <Empty>No receipts, transfers or issues waiting.</Empty>}
          </div>
        </Card>

        <Card title="Turn in a removed part">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); act('ingest', { e: { type: 'TURN_IN', item: turn.sn.trim().toUpperCase(), pn: turn.pn, qty: 1, to: station, cond: 'unserviceable', aircraft: turn.ac, reason: turn.why } }, `${turn.sn.toUpperCase()} recorded as unserviceable at ${station}.`).then((ok) => ok && setTurn({ ...turn, sn: '' })) }}>
            <label className="field">Part<select value={turn.pn} onChange={(e) => setTurn({ ...turn, pn: e.target.value })}>{AV.parts.filter((p) => p.type === 'rotable').map((p) => <option key={p.pn} value={p.pn}>{p.name} · {p.pn}</option>)}</select></label>
            <div className="grid g2">
              <label className="field">Serial number<input className="mono" required value={turn.sn} onChange={(e) => setTurn({ ...turn, sn: e.target.value })} placeholder="S/N on data plate" /></label>
              <label className="field">Removed from<select value={turn.ac} onChange={(e) => setTurn({ ...turn, ac: e.target.value })}>{AV.fleet.map((f) => <option key={f.tail}>{f.tail}</option>)}</select></label>
            </div>
            <label className="field">Reason<input value={turn.why} onChange={(e) => setTurn({ ...turn, why: e.target.value })} /></label>
            <button className="btn">Record as unserviceable</button>
          </form>
        </Card>
      </div>

      <Card title={`Stock at ${station}`} aside={`${stock.length} records · derived from the ledger`}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Part</th><th>P/N</th><th>S/N or batch</th><th>Condition</th><th className="num">Qty</th><th>Expiry</th></tr></thead>
            <tbody>
              {stock.map((i) => (
                <tr key={i.id} className="click" onClick={() => { setQ(i.id); setLookup(i.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                  <td>{part(i.pn).name}</td><td className="mono small">{i.pn}</td><td className="mono small">{i.id}</td>
                  <td><span className="row"><ItemChip it={i} />{i.reserved && <Chip k="reserved">For {i.reserved}</Chip>}</span></td>
                  <td className="num mono">{i.qty} {part(i.pn).unit}</td><td className="small">{i.expiry ? fDate(i.expiry) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
