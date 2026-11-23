// H3 session: two matched sets of ten replenishment orders. Order i of set A and order i of set B are a
// matched pair (same supplier, same kind of part, same approval path), so the manual and Avilo arms can
// be compared order by order. `used` is what engineering drew from the shelf to create the shortage.
export const H3_SETS = {
 "A": [
  {
   "n": 1,
   "pn": "3505986-12",
   "station": "SIN",
   "used": 1
  },
  {
   "n": 2,
   "pn": "5009873-7",
   "station": "DXB",
   "used": 1
  },
  {
   "n": 3,
   "pn": "3214552-3",
   "station": "DXB",
   "used": 3
  },
  {
   "n": 4,
   "pn": "3291460-5",
   "station": "SIN",
   "used": 1
  },
  {
   "n": 5,
   "pn": "NW-277104",
   "station": "LOS",
   "used": 1
  },
  {
   "n": 6,
   "pn": "OF-1290-8",
   "station": "DXB",
   "used": 2
  },
  {
   "n": 7,
   "pn": "HF-500B-GL",
   "station": "LOS",
   "used": 7
  },
  {
   "n": 8,
   "pn": "EO-2380-QT",
   "station": "SIN",
   "used": 35
  },
  {
   "n": 9,
   "pn": "LL-4596-1",
   "station": "SIN",
   "used": 1
  },
  {
   "n": 10,
   "pn": "OK-29-104",
   "station": "LOS",
   "used": 2
  }
 ],
 "B": [
  {
   "n": 1,
   "pn": "3800706-2",
   "station": "LOS",
   "used": 1
  },
  {
   "n": 2,
   "pn": "5009873-7",
   "station": "LOS",
   "used": 1
  },
  {
   "n": 3,
   "pn": "2C1185-04",
   "station": "LHR",
   "used": 1
  },
  {
   "n": 4,
   "pn": "3291460-5",
   "station": "DXB",
   "used": 1
  },
  {
   "n": 5,
   "pn": "NW-277104",
   "station": "SIN",
   "used": 1
  },
  {
   "n": 6,
   "pn": "OF-1290-8",
   "station": "SIN",
   "used": 1
  },
  {
   "n": 7,
   "pn": "HF-500B-GL",
   "station": "DXB",
   "used": 24
  },
  {
   "n": 8,
   "pn": "EO-2380-QT",
   "station": "DXB",
   "used": 56
  },
  {
   "n": 9,
   "pn": "LL-4596-1",
   "station": "DXB",
   "used": 3
  },
  {
   "n": 10,
   "pn": "OK-29-104",
   "station": "DXB",
   "used": 12
  }
 ]
}

export const H3_STEPS = ['start', 'approved', 'confirmed', 'received', 'serviceable']
export const STEP_LABEL = { start: 'Card handed over', approved: 'Order fully approved', confirmed: 'Supplier confirmed', received: 'Delivery received', serviceable: 'Released serviceable' }

const mean = (y) => y.reduce((a, b) => a + b, 0) / y.length
const sd = (y) => { const m = mean(y); return Math.sqrt(y.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, y.length - 1)) }
const T = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086]

/** Times for one order. Manual arm: from the steps tapped on the timer screen. Avilo arm: from the
 *  purchase order and ledger events Avilo recorded itself, starting at the tapped card hand-over. */
export function orderTimes(log, S, session, arm, set, n) {
  const rows = log.filter((r) => r.session === session && r.arm === arm && r.set_name === set && r.order_no === n && r.step !== 'void')
  const voided = log.some((r) => r.session === session && r.arm === arm && r.set_name === set && r.order_no === n && r.step === 'void')
  const at = (step) => { const r = rows.filter((x) => x.step === step).sort((a, b) => b.ts - a.ts)[0]; return r ? r.ts : null }
  const start = voided ? null : at('start')
  const o = H3_SETS[set].find((x) => x.n === n)
  let t = { start, approved: null, confirmed: null, received: null, serviceable: null, po: null }
  if (!start) return { ...t, errors: rows.filter((r) => r.step === 'error').length }
  if (arm === 'manual') t = { ...t, approved: at('approved'), confirmed: at('confirmed'), received: at('received'), serviceable: at('serviceable') }
  else if (S) {
    const po = S.pos.filter((p) => p.pn === o.pn && p.station === o.station && p.sent >= start - 5000).sort((a, b) => a.sent - b.sent)[0]
    if (po) {
      const items = new Set(S.events.filter((e) => e.type === 'RECEIVE' && e.ref === po.id).map((e) => e.item))
      const ver = S.events.filter((e) => e.type === 'VERIFY' && items.has(e.item)).sort((a, b) => a.ts - b.ts)[0]
      t = { ...t, po: po.id, approved: po.sent, confirmed: po.acknowledged, received: po.received, serviceable: ver ? ver.ts : null }
    }
  }
  return { ...t, errors: rows.filter((r) => r.step === 'error').length }
}

/** Paired comparison: order i of the manual arm against order i of the Avilo arm. */
export function compare(pairs) {
  const ok = pairs.filter((p) => p.manual != null && p.avilo != null)
  if (ok.length < 2) return null
  const d = ok.map((p) => p.avilo - p.manual), m = mean(ok.map((p) => p.manual)), a = mean(ok.map((p) => p.avilo))
  const half = (T[Math.min(T.length - 1, ok.length - 2)] || 2.09) * sd(d) / Math.sqrt(ok.length)
  // exact Wilcoxon signed-rank is not needed for the decision rule; report the sign test count instead
  const faster = d.filter((x) => x < 0).length
  return { n: ok.length, manualMean: m, aviloMean: a, diff: mean(d), lo: mean(d) - half, hi: mean(d) + half, reduction: m ? (1 - a / m) * 100 : 0, faster,
    supported: m ? (1 - a / m) >= 0.3 && mean(d) + half < 0 : false }
}
