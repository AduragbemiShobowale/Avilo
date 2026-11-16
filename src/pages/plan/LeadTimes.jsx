import AV from '../../lib/engine'
import { useLive } from '../../context/LiveContext'
import { PageHead, Card, Empty, Tile, Chip, part } from '../../components/ui'
import { fDate, downloadCsv } from '../../lib/format'

const H = 36e5
const dur = (a, b) => (a && b ? (b - a) / H : null)
const fH = (h) => (h == null ? '–' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`)
const median = (y) => { const s = y.filter((v) => v != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

// Every purchase order as a timeline: approval, supplier confirmation, shipment, receipt, inspection.
export function poTimelines(S) {
  // inspection = the first certificate verification of a unit received against the order, after its receipt
  const recv = {}, verified = {}, byId = Object.fromEntries(S.pos.map((o) => [o.id, o]))
  for (const e of S.events) {
    if (e.type === 'RECEIVE' && e.ref && byId[e.ref]) recv[e.item] = e.ref
    const o = recv[e.item] && byId[recv[e.item]]
    if (e.type === 'VERIFY' && o && o.received && !verified[o.id] && e.ts >= o.received - 36e5 && e.ts - o.received < 30 * 864e5) verified[o.id] = e.ts
  }
  return S.pos.map((o) => {
    const approved = o.approvals.length ? Math.min(...o.approvals.map((a) => a.ts)) : null
    const start = approved || o.sent
    return {
      id: o.id, sup: o.sup, pn: o.pn, qty: o.qty, station: o.station, status: o.status, aog: o.aog,
      approved, sent: o.sent, acknowledged: o.acknowledged, promised: o.promised, shipped: o.shipped, received: o.received, verified: verified[o.id] || null,
      approvalH: dur(approved, o.sent), confirmH: dur(o.sent, o.acknowledged), approvalToConfirmH: dur(start, o.acknowledged),
      supplyH: dur(o.sent, o.received), inspectH: dur(o.received, verified[o.id]), totalH: dur(start, verified[o.id] || null),
      onTime: o.received && o.promised ? o.received <= o.promised + 864e5 * 0.5 : null,
      leadRatio: o.received && o.sent ? ((o.received - o.sent) / 864e5) / part(o.pn).lead : null,
    }
  }).sort((a, b) => b.sent - a.sent)
}

export default function LeadTimes() {
  const { S } = useLive()
  const T = poTimelines(S)
  const lead = S.leadStats || AV.observedLead(S)
  const done = T.filter((t) => t.totalH != null)

  return (
    <>
      <PageHead title="Supplier lead times" sub="How long each order takes, step by step. The observed lateness of each supplier feeds straight into the reorder points.">
        <button className="btn" onClick={() => downloadCsv('time_to_replenish.csv', T.map((t) => ({ po: t.id, supplier: t.sup, pn: t.pn, qty: t.qty, station: t.station, status: t.status, aog: t.aog,
          approved: t.approved && new Date(t.approved).toISOString(), sent: t.sent && new Date(t.sent).toISOString(), acknowledged: t.acknowledged && new Date(t.acknowledged).toISOString(),
          promised: t.promised && new Date(t.promised).toISOString(), shipped: t.shipped && new Date(t.shipped).toISOString(), received: t.received && new Date(t.received).toISOString(), verified: t.verified && new Date(t.verified).toISOString(),
          approval_to_confirmation_h: t.approvalToConfirmH?.toFixed(2), supplier_confirm_h: t.confirmH?.toFixed(2), sent_to_received_h: t.supplyH?.toFixed(2), inspection_h: t.inspectH?.toFixed(2), total_h: t.totalH?.toFixed(2), on_time: t.onTime, lead_ratio: t.leadRatio?.toFixed(3) })))}>Export CSV</button>
      </PageHead>

      <div className="grid g3">
        <Tile label="Approval to supplier confirmation" value={fH(median(T.map((t) => t.approvalToConfirmH)))} note={`Median over ${T.filter((t) => t.approvalToConfirmH != null).length} orders`} />
        <Tile label="Time to replenish" value={fH(median(done.map((t) => t.totalH)))} note={`Median, approval to serviceable on the shelf · ${done.length} orders`} />
        <Tile label="On-time delivery" value={(() => { const r = T.filter((t) => t.onTime != null); return r.length ? Math.round(r.filter((t) => t.onTime).length / r.length * 100) + '%' : '–' })()} note="Received by the promised date" />
      </div>

      <Card title="By supplier" aside="Planning lead time = quoted × lateness factor, never less than quoted">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Supplier</th><th className="num">Deliveries</th><th className="num">Actual ÷ quoted</th><th className="num">Spread (sd)</th><th className="num">Planning factor</th><th className="num">Median confirm</th></tr></thead>
            <tbody>
              {AV.suppliers.map((s) => {
                const L = lead[s.id] || {}
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b> <span className="small muted">{s.code}</span></td>
                    <td className="num mono">{L.n ?? 0}</td>
                    <td className="num mono">{L.mean == null ? '–' : L.mean.toFixed(2)}</td>
                    <td className="num mono">{L.sd == null ? '–' : L.sd.toFixed(2)}</td>
                    <td className="num mono">{(L.factor || 1).toFixed(2)}×</td>
                    <td className="num mono">{fH(median(T.filter((t) => t.sup === s.id).map((t) => t.confirmH)))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="note">Example: a part quoted at 30 days from a supplier with factor 1.35 is planned with a 40.5-day lead time, so its reorder point covers the delay the supplier has actually shown. Below 3 deliveries Avilo uses the quoted lead time.</p>
      </Card>

      <Card title="Orders" aside={`${T.length} purchase orders`}>
        {T.length ? (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Order</th><th>Part</th><th>To</th><th>Sent</th><th className="num">Approval</th><th className="num">Confirm</th><th className="num">Supply</th><th className="num">Inspect</th><th className="num">Total</th><th>Status</th></tr></thead>
              <tbody>
                {T.map((t) => (
                  <tr key={t.id}>
                    <td className="mono small nowrap">{t.id}{t.aog && <> <Chip k="aog">AOG</Chip></>}</td>
                    <td className="small">{t.qty} × {part(t.pn).name}<br /><span className="muted">{AV.supBy[t.sup].name}</span></td>
                    <td>{t.station}</td><td className="small nowrap">{fDate(t.sent)}</td>
                    <td className="num mono small">{fH(t.approvalH)}</td><td className="num mono small">{fH(t.confirmH)}</td>
                    <td className="num mono small">{fH(t.supplyH)}</td><td className="num mono small">{fH(t.inspectH)}</td><td className="num mono small"><b>{fH(t.totalH)}</b></td>
                    <td className="small">{t.status}{t.onTime === false && <> <Chip k="overdue">Late</Chip></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No orders yet.</Empty>}
        <p className="note"><b>Approval</b>: first approval to order sent. <b>Confirm</b>: order sent to the supplier's confirmation. <b>Supply</b>: sent to received. <b>Inspect</b>: received to certificate verified. <b>Total</b>: first approval (or order date) to serviceable on the shelf. Orders from before Avilo have no approval step recorded.</p>
      </Card>
    </>
  )
}
