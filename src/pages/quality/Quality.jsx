import AV from '../../lib/engine'
import { useAuth } from '../../context/AuthContext'
import { useLive } from '../../context/LiveContext'
import { Chip, PageHead, Card, Empty, Tile, part } from '../../components/ui'

export default function Quality() {
  const { profile } = useAuth()
  const { S, act } = useLive()
  const pend = Object.values(S.items).filter((i) => i.cond === 'pending' && i.loc)
  const quar = Object.values(S.items).filter((i) => i.cond === 'quarantined' && i.loc)
  const receiver = (id) => S.events.find((x) => x.item === id && x.type === 'RECEIVE')?.actor

  return (
    <>
      <PageHead title="Quality" sub="Only the Compliance Officer decides whether a part is airworthy. A part waiting here cannot be issued." />
      <div className="grid g3">
        <Tile label="Certificates to verify" value={pend.length} tone={pend.length ? 'warn' : 'ok'} note={pend.length ? <b>Blocking issue until checked</b> : <b>Queue clear</b>} />
        <Tile label="Quarantined or blocked" value={quar.length} tone={quar.length ? 'bad' : 'ok'} note="Cannot be issued or transferred" />
        <Tile label="Approved suppliers" value={AV.suppliers.length} note="EASA Form 1 and FAA 8130-3 sources" />
      </div>
      <div className="grid g2 top">
        <Card title="Certificates to verify" aside={`${pend.length}`}>
          <div className="list">
            {pend.length ? pend.map((i) => {
              const p = part(i.pn), self = receiver(i.id) === profile.id
              return (
                <div className="li" key={i.id}>
                  <span className="sev loc" />
                  <div className="grow">
                    <b>{p.name}</b>
                    <span className="small muted mono">P/N {p.pn} · {i.id} · {i.loc} · {i.ref}</span>
                    <span className="small">Certificate: {i.cert || 'not uploaded'}</span>
                    {self && <span className="small muted">You received this part, so another inspector must verify it.</span>}
                  </div>
                  <div className="row">
                    <button className="btn danger" onClick={() => act('ingest', { e: { type: 'CONDITION', item: i.id, pn: i.pn, cond: 'quarantined', reason: 'Certificate rejected at inspection' } }, `${i.id} quarantined.`)}>Reject</button>
                    <button className="btn primary" disabled={self} onClick={() => act('ingest', { e: { type: 'VERIFY', item: i.id, pn: i.pn, cert: (i.cert || 'Certificate') + ' · verified' } }, `${i.id} is now serviceable.`)}>Verify</button>
                  </div>
                </div>
              )
            }) : <Empty>No certificates waiting.</Empty>}
          </div>
        </Card>
        <Card title="Quarantined and blocked" aside={`${quar.length}`}>
          <div className="list">
            {quar.length ? quar.map((i) => {
              const why = S.events.filter((e) => e.item === i.id && e.type === 'CONDITION').pop()
              return (
                <div className="li" key={i.id}>
                  <span className="sev bad" />
                  <div className="grow"><b>{part(i.pn).name}</b><span className="small muted mono">{i.id} · {i.loc}</span><span className="small">{why?.reason}</span></div>
                  <div className="row">
                    <button className="btn danger" onClick={() => act('ingest', { e: { type: 'SCRAP', item: i.id, pn: i.pn, reason: 'Beyond economic repair' } }, `${i.id} scrapped.`)}>Scrap</button>
                    <button className="btn" onClick={() => act('ingest', { e: { type: 'CONDITION', item: i.id, pn: i.pn, cond: 'serviceable', reason: 'Released after re-inspection' } }, `${i.id} released to serviceable.`)}>Release</button>
                  </div>
                </div>
              )
            }) : <Empty>Nothing quarantined.</Empty>}
          </div>
        </Card>
      </div>
      <Card title="Approved supplier list">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Supplier</th><th>Base</th><th>Certificate</th><th>Status</th></tr></thead>
            <tbody>{AV.suppliers.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.city} · {s.code}</td><td>{s.id === 'SUP-3' ? 'FAA 8130-3' : 'EASA Form 1'}</td><td><Chip k="approved" /></td></tr>)}</tbody>
          </table>
        </div>
        <p className="note">Suppliers join this list only with Compliance approval. Procurement can propose new suppliers but cannot approve them.</p>
      </Card>
    </>
  )
}
