import { useState } from 'react'
import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { Chip, PageHead, Card, Empty, Tile, part } from '../../components/ui'
import { fDate } from '../../lib/format'

export default function SupplierOrders() {
  const { profile } = useAuth()
  const { S, act } = useLive()
  const sup = AV.supBy[profile.supplier]
  const mine = S.pos.filter((o) => o.sup === sup.id && o.status !== 'Received').slice().reverse()
  const sc = AV.scorecard(S, sup.id)
  const cert = sup.id === 'SUP-3' ? '8130-3' : 'Form 1'
  const [dates, setDates] = useState({})
  const iso = (t) => new Date(t).toISOString().slice(0, 10)
  const ackd = S.pos.filter((o) => o.sup === sup.id && o.acknowledged && o.sent)
  const ackH = ackd.length ? ackd.reduce((a, o) => a + (o.acknowledged - o.sent) / 36e5, 0) / ackd.length : null

  return (
    <>
      <PageHead title={sup.name} sub="Your orders only. Stock levels, other suppliers and internal costs are not visible here." />
      <div className="grid g3">
        <Tile label="On-time delivery" value={sc.onTime == null ? '–' : Math.round(sc.onTime * 100) + '%'} note={`Last ${sc.n} orders`} />
        <Tile label="Average lead time" value={sc.lead == null ? '–' : sc.lead.toFixed(0) + ' d'} note="Order sent to received" />
        <Tile label="Time to confirm" value={ackH == null ? '–' : ackH < 48 ? ackH.toFixed(0) + ' h' : (ackH / 24).toFixed(1) + ' d'} note={`Order sent to your confirmation · ${mine.length} open`} />
      </div>
      <Card title="My orders">
        <div className="list">
          {mine.length ? mine.map((o) => {
            const p = part(o.pn)
            return (
              <div className="li" key={o.id}>
                <span className={`sev ${o.aog ? 'bad' : 'loc'}`} />
                <div className="grow">
                  <b>{o.id} · {o.qty} × {p.name}</b>
                  <span className="small muted mono">P/N {p.pn} · deliver to {o.station} · sent {fDate(o.sent)}{o.promised ? ` · promised ${fDate(o.promised)}` : ''}</span>
                  {o.aog && <span><Chip k="aog">AOG order</Chip></span>}
                </div>
                <div className="row">
                  {o.status === 'Sent' && <>
                    <button className="btn danger" onClick={() => act('supplier_po', { p_po: o.id, p_action: 'decline' })}>Decline</button>
                    <label className="small muted">Deliver by <input className="inp auto mono" type="date" min={iso(Date.now())} value={dates[o.id] || iso(Date.now() + p.lead * 864e5)} onChange={(e) => setDates({ ...dates, [o.id]: e.target.value })} aria-label="Promised delivery date" /></label>
                    <button className="btn primary" onClick={() => act('supplier_po', { p_po: o.id, p_action: 'accept', p_promised: dates[o.id] || iso(Date.now() + p.lead * 864e5) })}>Confirm order</button>
                  </>}
                  {o.status === 'Confirmed' && <>
                    {o.certUploaded ? <span className="small muted">Certificate uploaded</span> : <button className="btn" onClick={() => act('supplier_po', { p_po: o.id, p_action: 'cert' })}>Upload {cert}</button>}
                    <button className="btn primary" onClick={() => act('supplier_po', { p_po: o.id, p_action: 'ship' })}>Mark shipped</button>
                  </>}
                  {!['Sent', 'Confirmed'].includes(o.status) && <span className="small muted">{o.status}{o.tracking ? ` · ${o.tracking}` : ''}</span>}
                </div>
              </div>
            )
          }) : <Empty>No open orders.</Empty>}
        </div>
      </Card>
    </>
  )
}
