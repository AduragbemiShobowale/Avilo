// Discrete-event simulation of the Avilo spares network (Chapter 3, evaluation model).
//
// Events, kept in time order in a priority queue:
//   DEMAND     an unscheduled removal or top-up at a station (compound Poisson per flight hour)
//   CHECK      planned consumption when a scheduled A- or C-check starts
//   ARRIVAL    a purchase order arrives from the supplier
//   REPAIR     a repaired rotable returns serviceable from the repair shop
//   TRANSFER   a lateral transfer reaches the receiving station
//   FLAG       an in-transit transfer passes the 72-hour window and is flagged (visible policies)
//   SYNC       the weekly spreadsheet update the baseline planner works from
//   STOCKTAKE  the quarterly physical count that resets the baseline records
//   PLAN       every 28 days each policy re-estimates its reorder parameters
//   REVIEW     the end-of-day review: alerts, lateral transfers and purchase orders
//
// Three policies run on identical demand (common random numbers):
//   A  Baseline: reorder point from mean and standard deviation of past demand, static master
//      lead time, records updated weekly, unrecorded issues and transfers, no in-transit view
//   B  Visibility only: the event ledger (real-time, in-transit visible, lost transfers flagged
//      after 72 h) with the same reorder point as A
//   C  Framework: the ledger plus pattern-based forecasting (SES / SBA / TSB), flight-hour and
//      check-calendar advance demand, observed supplier lead times and a quantile reorder point
import { rng, FLEET, flownHours, unscheduled, checksOn, plannedDemand, plannedFH, classify, history, A_KIT, C_KIT, FH_MEAN } from './demand.js'

// Criticality follows the Minimum Equipment List: A = no-go rotable, B = no-go consumable or wheel/tyre,
// C = deferrable under the MEL. A "critical part" (H4) is one the aircraft cannot be released without: class A or B.
const SL = { A: 0.98, B: 0.95, C: 0.9 }
const Z = { A: 2.054, B: 1.645, C: 1.282 }
const EXPEDITE = { A: 25000, B: 6000, C: 1500 }
export const OVERDUE_DAYS = 3, TRACE_DAYS = 2

export const SCENARIOS = {
  normal: { label: 'Normal year', lostRate: 0.02 },
  aog: { label: 'AOG demand spike', lostRate: 0.02, spike: { station: '*', crit: 'A', mult: 4, from: 60, to: 90 } },
  delay: { label: 'Delayed supplier', lostRate: 0.02, delay: { sup: 'SUP-1', mult: 2.5, from: 90, to: 180 } },
  lost: { label: 'Lost transfer', lostRate: 0.25 },
}
export const POLICIES = { A: 'Reorder-point baseline', B: 'Visibility only', C: 'Avilo framework' }

class Heap {
  constructor() { this.a = [] }
  push(e) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].t <= e.t) break; a[i] = a[p]; i = p } a[i] = e }
  pop() {
    const a = this.a, top = a[0], last = a.pop()
    if (a.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1].t < a[c].t) c++; if (a[c].t >= last.t) break; a[i] = a[c]; i = c } a[i] = last }
    return top
  }
  get size() { return this.a.length }
}

const mean = (y) => y.reduce((s, v) => s + v, 0) / y.length
const sd = (y) => { const m = mean(y); return Math.sqrt(y.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, y.length - 1)) }
function poissonQuantile(mu, p) {
  if (mu <= 0) return 0
  let k = 0, pk = Math.exp(-mu), c = pk
  if (pk === 0) return Math.ceil(mu + 2.33 * Math.sqrt(mu))
  while (c < p && k < 1000) { k++; pk *= mu / k; c += pk }
  return k
}
// Intermittent-demand forecasts on weekly data; each returns the next-period forecast and the fitted errors.
function sesF(y, a = 0.2) { let f = y[0]; const e = []; for (const v of y) { e.push(v - f); f += a * (v - f) } return { next: f, e } }
function sbaF(y, a = 0.1) {
  let z = null, p = null, q = 1; const e = []
  for (const v of y) { const f = z === null ? 0 : (1 - a / 2) * z / p; e.push(v - f); if (v > 0) { if (z === null) { z = v; p = q } else { z += a * (v - z); p += a * (q - p) } q = 1 } else q++ }
  return { next: z === null ? 0 : (1 - a / 2) * z / p, e }
}
function tsbF(y, a = 0.1, b = 0.1) {
  const head = y.slice(0, 8), nz = head.filter((v) => v > 0)
  let d = nz.length / head.length || 0.1, z = nz.length ? mean(nz) : 1; const e = []
  for (const v of y) { e.push(v - d * z); if (v > 0) { d += b * (1 - d); z += a * (v - z) } else d += b * (0 - d) }
  return { next: d * z, e }
}
export function forecastFor(pattern, y) { return pattern === 'smooth' ? sesF(y) : pattern === 'intermittent' ? sbaF(y) : tsbF(y) }

// Classic reorder point (policies A and B): normal approximation, static master lead time.
function classicPlan(part, weeklyTotal) {
  const w = weeklyTotal.slice(-104), m = mean(w), s = sd(w), L = part.lead / 7
  const rop = Math.max(0, Math.ceil(m * L + 1.65 * s * Math.sqrt(L)))
  return { rop, S: part.type === 'rotable' ? rop + 1 : Math.max(rop + 1, rop + Math.ceil(m * 4)), weekly: m }
}

// Avilo reorder point (policy C): pattern-matched forecast of unscheduled demand, scaled by planned
// flight hours, observed lead time, service level by criticality, plus known check consumption.
function aviloPlan(part, station, weeklyUnsched, leadDays, day) {
  const y = weeklyUnsched.slice(-104)
  const { pattern } = classify(y)
  const fc = forecastFor(pattern, y)
  const histFH = plannedFH(station, day - 364, day) / 52
  const fhRatio = histFH > 0 ? plannedFH(station, day, day + leadDays) / ((histFH / 7) * leadDays || 1) : 1
  const Lw = leadDays / 7, mu = Math.max(0, fc.next) * Lw * Math.min(1.5, Math.max(0.5, fhRatio))
  let rop
  if (part.type === 'rotable') rop = poissonQuantile(mu, SL[part.crit])
  else { const e = fc.e.slice(8); const rmse = Math.sqrt(mean(e.map((v) => v * v)) || 0); rop = Math.ceil(mu + Z[part.crit] * rmse * Math.sqrt(Lw)) }
  return { rop: Math.max(part.type === 'rotable' ? 0 : 1, rop), weekly: Math.max(0, fc.next), pattern, fhRatio }
}

/**
 * Run one replication.
 * @returns per-run metrics and, if `trace` is set, the event log for the first part.
 */
export function runReplication({ parts, stations, suppliers, seed, scenario = 'normal', policy = 'C', days = 365, warmup = 90, overrides = {} }) {
  const sc = { ...SCENARIOS[scenario], ...overrides }
  const missRate = overrides.missRate ?? 0.06
  const T0 = 0, T1 = warmup + days
  const hist = history(parts, stations, seed)
  const fhR = rng(seed * 7919 + 3)
  const fhByDay = []
  for (let d = 0; d < T1 + 1; d++) fhByDay.push(flownHours(fhR, d))
  const stationFH = (code, d) => FLEET.reduce((h, a, i) => h + (a.base === code ? fhByDay[d][i] : 0), 0)

  const m = { demand: 0, filled: 0, stockouts: 0, critical: 0, criticalA: 0, unmetUnits: 0, invValue: 0, orders: 0, transfers: 0, failedTransfers: 0, expedite: 0,
    alerts: 0, falseAlerts: 0, missed: 0, episodes: 0, replenishDays: 0, replenished: 0, lostTransfers: 0, lostFlagged: 0 }
  const supLT = Object.fromEntries(suppliers.map((s) => [s.id, []]))

  parts.forEach((p, pi) => {
    const q = new Heap()
    const S = {}
    stations.forEach((st, si) => {
      const s = S[st.code] = {
        phys: 0, rec: 0, seen: 0, pipe: [], repairs: [], inbound: [], weeksTot: hist.total[p.pn][st.code].slice(), weeksUn: hist.unscheduled[p.pn][st.code].slice(),
        curTot: 0, curUn: 0, plan: { rop: 0, S: 1 }, alertOn: false, alerts: [], demandLog: [], arrivalsLog: [],
        rD: rng(seed * 104729 + pi * 7907 + si * 613), rO: rng(seed * 15485863 + pi * 31 + si * 7 + policy.charCodeAt(0)),
      }
      const cp = classicPlan(p, s.weeksTot)
      const init = policy === 'C' ? aviloPlan(p, st.code, s.weeksUn, p.lead, 0) : cp
      const start = Math.max(1, policy === 'C' ? (p.type === 'rotable' ? init.rop + 1 : init.rop + Math.ceil(init.weekly * 4)) : cp.S)
      s.phys = s.rec = s.seen = start
      s.plan = policy === 'C' ? { rop: init.rop, S: start } : cp
      // demand: generated day by day from the station's own random stream (identical across policies)
      for (let d = T0; d < T1; d++) {
        const sp = sc.spike
        const mult = sp && (sp.station === '*' || st.code === sp.station) && p.crit === sp.crit && p.type === 'rotable' && d >= warmup + sp.from && d < warmup + sp.to ? sp.mult : 1
        for (const o of unscheduled(s.rD, p.pn, stationFH(st.code, d), mult)) q.push({ t: d + o.t, k: 'DEMAND', st: st.code, qty: o.qty, planned: false })
        for (const c of checksOn(d)) if (c.station === st.code) { const kit = c.type === 'A' ? A_KIT : C_KIT; if (kit[p.pn]) q.push({ t: d + 0.3, k: 'DEMAND', st: st.code, qty: kit[p.pn], planned: true }) }
        q.push({ t: d + 0.99, k: 'REVIEW', st: st.code })
        if (d % 7 === 6) q.push({ t: d + 0.995, k: 'WEEK', st: st.code })
      }
    })
    if (policy === 'A') {
      for (let d = 0; d < T1; d += 7) q.push({ t: d + 0.001, k: 'SYNC' })
      for (let d = 90; d < T1; d += 91) q.push({ t: d + 0.002, k: 'STOCKTAKE' })
    }
    for (let d = 28; d < T1; d += 28) q.push({ t: d + 0.005, k: 'PLAN' })

    const counted = (t) => t >= warmup
    const known = (s) => (policy === 'A' ? s.seen : s.rec)
    const inPipe = (s) => s.pipe.reduce((a, o) => a + o.qty, 0) + s.repairs.length
    const inTransit = (s) => s.inbound.reduce((a, x) => a + (policy === 'A' || x.overdue ? 0 : x.qty), 0)
    const position = (s) => known(s) + inPipe(s) + inTransit(s)

    let lastT = 0
    const stockValue = () => stations.reduce((v, st) => v + Math.max(0, S[st.code].phys) * p.cost, 0)
    while (q.size) {
      const e = q.pop()
      if (e.t >= T1) break
      // inventory value is integrated over time (only after warm-up)
      if (e.t > warmup) m.invValue += stockValue() * (e.t - Math.max(lastT, warmup))
      lastT = e.t
      const s = e.st ? S[e.st] : null
      switch (e.k) {
        case 'DEMAND': {
          const fill = Math.min(e.qty, s.phys)
          s.phys -= fill
          if (policy === 'A') { for (let k = 0; k < fill; k++) if (s.rO() >= missRate) s.rec-- }
          else s.rec -= fill
          s.curTot += e.qty; if (!e.planned) s.curUn += e.qty
          if (p.type === 'rotable' && !e.planned) for (let k = 0; k < e.qty; k++) if (s.rO() < 0.88) { const back = e.t + 21 + s.rO() * 14; s.repairs.push(back); q.push({ t: back, k: 'REPAIR', st: e.st }) }
          if (counted(e.t)) {
            m.demand += e.qty; m.filled += fill
            s.demandLog.push({ t: e.t, qty: e.qty })
            if (fill < e.qty) {
              m.stockouts++; m.unmetUnits += e.qty - fill; if (p.crit !== 'C') m.critical++; if (p.crit === 'A') m.criticalA++; m.expedite += EXPEDITE[p.crit]
              if (!s.outEp) { m.episodes++; if (!s.alerts.some((a) => a.t <= e.t && a.t > e.t - p.lead)) m.missed++ }
            }
          }
          if (fill < e.qty) s.outEp = true
          if (fill < e.qty && policy === 'A' && s.rec > s.phys) s.rec = s.phys // the shortage reveals the record error
          break
        }
        case 'REPAIR': { s.repairs.splice(s.repairs.indexOf(e.t), 1); s.phys++; s.outEp = false; s.rec++; s.arrivalsLog.push({ t: e.t, qty: 1 }); break }
        case 'ARRIVAL': {
          const o = s.pipe.find((x) => x.id === e.id); s.pipe.splice(s.pipe.indexOf(o), 1)
          s.phys += o.qty; s.outEp = false; s.rec += o.qty; s.arrivalsLog.push({ t: e.t, qty: o.qty })
          supLT[p.sup].push(e.t - o.placed)
          if (counted(e.t)) { m.replenishDays += e.t - o.need; m.replenished++ }
          break
        }
        case 'TRANSFER': {
          const x = s.inbound.find((y) => y.id === e.id)
          if (x.booked) { s.inbound.splice(s.inbound.indexOf(x), 1); s.phys += x.qty; s.rec += x.qty; s.outEp = false; s.arrivalsLog.push({ t: e.t, qty: x.qty }) }
          else { x.lost = true; if (counted(e.t)) m.lostTransfers++ } // misrouted: it never reaches the shelf
          break
        }
        case 'FLAG': { // the ledger flags the overdue transfer; it stops counting as inbound and a trace starts
          const x = s.inbound.find((y) => y.id === e.id)
          if (x && x.lost) { x.overdue = true; if (counted(e.t)) m.lostFlagged++; q.push({ t: e.t + TRACE_DAYS, k: 'FOUND', st: e.st, id: e.id }) }
          break
        }
        case 'FOUND': { // the trace locates the unit and it is received
          const x = s.inbound.find((y) => y.id === e.id)
          if (x) { s.inbound.splice(s.inbound.indexOf(x), 1); s.phys += x.qty; s.rec += x.qty; s.outEp = false; s.arrivalsLog.push({ t: e.t, qty: x.qty }) }
          break
        }
        case 'SYNC': for (const st of stations) S[st.code].seen = S[st.code].rec; break
        case 'STOCKTAKE': for (const st of stations) { const z = S[st.code]; for (const x of z.inbound.filter((y) => y.lost)) z.phys += x.qty; z.inbound = z.inbound.filter((y) => !y.lost); z.rec = z.phys; z.seen = z.phys } break // the count finds misrouted units
        case 'WEEK': { s.weeksTot.push(s.curTot); s.weeksUn.push(s.curUn); s.curTot = 0; s.curUn = 0; break }
        case 'PLAN': {
          for (const st of stations) {
            const z = S[st.code]
            if (policy === 'C') {
              const lt = supLT[p.sup].slice(-8)
              const leadDays = lt.length >= 3 ? mean(lt) + 1.0 * sd(lt) : p.lead
              const ap = aviloPlan(p, st.code, z.weeksUn, leadDays, Math.floor(e.t))
              z.base = ap; z.leadDays = leadDays; z.fhRatio = ap.fhRatio
            } else z.plan = classicPlan(p, z.weeksTot)
          }
          break
        }
        case 'REVIEW': {
          const d = Math.floor(e.t)
          let rop = s.plan.rop, Smax = s.plan.S
          if (policy === 'C') {
            const base = s.base || aviloPlan(p, e.st, s.weeksUn, p.lead, d)
            const leadDays = s.leadDays || p.lead
            const planned = plannedDemand(p.pn, e.st, d + 1, d + 1 + leadDays + 7)
            rop = base.rop + planned
            Smax = p.type === 'rotable' ? rop + 1 : Math.max(rop + 1, rop + Math.ceil(base.weekly * 4))
          }
          // Shortage alert (H2): the policy predicts that what it can see on the shelf plus what it expects
          // to arrive within the lead time will not cover its own forecast of demand over that lead time.
          {
            const L = p.lead, w = policy === 'C' ? (s.base ? s.base.weekly : 0) * Math.min(1.5, Math.max(0.5, s.fhRatio || 1)) : s.plan.weekly || 0
            const fcst = w * L / 7 + (policy === 'C' ? plannedDemand(p.pn, e.st, d + 1, d + 1 + L) : 0)
            const sees = known(s) + s.pipe.filter((o) => o.exp <= e.t + L).reduce((a, o) => a + o.qty, 0) + s.repairs.filter((r) => r <= e.t + L).length + (policy === 'A' ? 0 : s.inbound.filter((x) => x.exp <= e.t + L).reduce((a, x) => a + x.qty, 0))
            const short = sees < fcst
            if (short && !s.alertOn && counted(e.t)) {
              m.alerts++
              // what would truly have been available without any new action
              const have = s.phys + s.pipe.filter((o) => o.at <= e.t + L).reduce((a, o) => a + o.qty, 0) + s.repairs.filter((r) => r <= e.t + L).length + s.inbound.filter((x) => x.booked && x.at <= e.t + L).reduce((a, x) => a + x.qty, 0)
              s.alerts.push({ t: e.t, have, L })
            }
            s.alertOn = short
          }
          const ip = position(s)
          if (ip <= rop) {
            if (s.trigT == null) s.trigT = e.t
            let need = Math.max(1, Smax - ip)
            // lateral transfer first: from the station that appears to have most spare above its own reorder point
            const donors = stations.map((x) => x.code).filter((c) => c !== e.st).map((c) => ({ c, spare: known(S[c]) - (S[c].plan.rop || 0) - (policy === 'C' && S[c].base ? S[c].base.rop : 0) })).filter((x) => x.spare >= 1).sort((a, b) => b.spare - a.spare)
            if (p.type === 'rotable' && donors.length) {
              const dn = S[donors[0].c], qty = Math.min(donors[0].spare, need)
              if (dn.phys >= qty) {
                dn.phys -= qty; dn.rec -= qty; if (policy === 'A') dn.seen -= qty
                const id = `${pi}-${e.t}-x`, at = e.t + 2, booked = s.rO() >= sc.lostRate
                s.inbound.push({ id, qty, at, booked, arrived: false, exp: e.t + 2 }); q.push({ t: at, k: 'TRANSFER', st: e.st, id })
                if (!booked && policy !== 'A') q.push({ t: e.t + OVERDUE_DAYS, k: 'FLAG', st: e.st, id })
                if (counted(e.t)) m.transfers++
                need -= qty
              } else if (counted(e.t)) m.failedTransfers++ // the record said it was there; the shelf was empty
            }
            if (need > 0 && position(s) <= rop) {
              const dl = sc.delay && p.sup === sc.delay.sup && d >= warmup + sc.delay.from && d < warmup + sc.delay.to ? sc.delay.mult : 1
              const slip = p.sup === 'SUP-2' ? 1.15 : p.sup === 'SUP-1' ? 1.05 : 1.0
              const lt = p.lead * slip * dl * (0.8 + 0.4 * s.rO())
              const id = `${pi}-${e.t}`, at = e.t + lt
              s.pipe.push({ id, qty: need, at, placed: e.t, need: s.trigT ?? e.t, exp: e.t + (policy === 'C' ? (s.leadDays || p.lead) : p.lead) })
              q.push({ t: at, k: 'ARRIVAL', st: e.st, id })
              if (counted(e.t)) m.orders++
            }
          } else s.trigT = null
          break
        }
      }
    }
    if (lastT < T1) m.invValue += stockValue() * (T1 - Math.max(lastT, warmup))
    // score alerts once all demand is known
    for (const st of stations) for (const a of S[st.code].alerts) {
      const d = S[st.code].demandLog.filter((x) => x.t > a.t && x.t <= a.t + a.L).reduce((s2, x) => s2 + x.qty, 0)
      if (d <= a.have) m.falseAlerts++
    }
  })
  m.invValue /= days
  m.fillRate = m.filled / Math.max(1, m.demand)
  m.falseAlertRate = m.alerts ? m.falseAlerts / m.alerts : 0
  m.avgReplenishDays = m.replenished ? m.replenishDays / m.replenished : 0
  return m
}

// Paired comparison across replications: mean difference, 95% t interval, Wilcoxon signed-rank p.
export function paired(a, b) {
  const d = a.map((x, i) => b[i] - x), n = d.length, md = mean(d), s = sd(d)
  const t = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042][Math.min(29, n - 2)] || 1.96
  const half = t * s / Math.sqrt(n)
  // Wilcoxon signed-rank with normal approximation
  const nz = d.filter((x) => x !== 0).map((x) => ({ x, a: Math.abs(x) })).sort((u, v) => u.a - v.a)
  let r = 1, W = 0
  for (let i = 0; i < nz.length;) { let j = i; while (j + 1 < nz.length && nz[j + 1].a === nz[i].a) j++; const rank = (r + r + (j - i)) / 2; for (let k = i; k <= j; k++) if (nz[k].x > 0) W += rank; r += j - i + 1; i = j + 1 }
  const N = nz.length, mu = N * (N + 1) / 4, sig = Math.sqrt(N * (N + 1) * (2 * N + 1) / 24)
  const zz = sig ? (W - mu) / sig : 0
  const pval = 2 * (1 - normCdf(Math.abs(zz)))
  return { meanA: mean(a), meanB: mean(b), diff: md, lo: md - half, hi: md + half, pct: mean(a) ? md / mean(a) * 100 : 0, p: pval, n }
}
function normCdf(x) { const t = 1 / (1 + 0.2316419 * x), d = 0.3989423 * Math.exp(-x * x / 2); return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))) }

export const FH_PER_DAY = FH_MEAN
