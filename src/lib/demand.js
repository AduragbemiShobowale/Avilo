// Maintenance-driven demand model (Chapter 3, data generation).
// Demand for a part at a station comes from two sources:
//   1. Unscheduled removals and top-ups, proportional to the flight hours flown by the
//      aircraft based there (a compound Poisson process per flight hour).
//   2. Planned consumption at scheduled checks: an A-check kit at the aircraft's base every
//      ~55 days, and a C-check kit in the London hangar once a year per aircraft.
// The same model generates the 104-week demand history the app forecasts from and the demand
// the discrete-event simulation replays, so the two always agree.

export function rng(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function poisson(r, lam) {
  if (lam <= 0) return 0
  if (lam > 40) { const u = Math.max(1e-9, r()), v = r(); return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))) }
  const L = Math.exp(-lam); let k = 0, p = 1
  do { k++; p *= r() } while (p > L)
  return k - 1
}

// Six B737-800s. Each flies about 9 hours a day (sd 1.5) unless it is in a check.
export const FLEET = [
  { tail: 'AVL-01', base: 'LHR' }, { tail: 'AVL-02', base: 'LHR' }, { tail: 'AVL-03', base: 'LOS' },
  { tail: 'AVL-04', base: 'SIN' }, { tail: 'AVL-05', base: 'DXB' }, { tail: 'AVL-06', base: 'LHR' },
]
export const FH_MEAN = 9, FH_SD = 1.5
export const A_CHECK_EVERY = 55, A_CHECK_DAYS = 1, C_CHECK_DAYS = 12, HANGAR = 'LHR'

// Unscheduled demand per flight hour: `occ` = occurrences per FH, `size` = units per occurrence.
// Values are set so the demand-pattern mix matches the literature (Chaiman and Watanabe, 2025:
// about 65% intermittent, 31% smooth, the rest erratic or lumpy); see validatePatterns().
export const DEMAND = {
  '3214552-3': { occ: 0.00075, size: [1] },
  '3505986-12': { occ: 0.0006, size: [1] },
  '2C1185-04': { occ: 0.0012, size: [1] },
  '5009873-7': { occ: 0.0007, size: [1] },
  'AD-822410': { occ: 0.0005, size: [1] },
  '3800706-2': { occ: 0.0006, size: [1] },
  'VT-622-0450': { occ: 0.0007, size: [1] },
  '3291460-5': { occ: 0.0007, size: [1] },
  'NW-277104': { occ: 0.0011, size: [1] },
  'LL-4596-1': { occ: 0.0009, size: [1] },
  'WB-5520-3': { occ: 0.0006, size: [2] },
  'TY-H44-5': { occ: 0.0035, size: [1, 1, 2, 2, 2, 4, 6] },
  'OF-1290-8': { occ: 0.012, size: [1, 1, 2] },
  'OK-29-104': { occ: 0.03, size: [1, 1, 2] },
  'EO-2380-QT': { occ: 0.09, size: [1, 2, 2, 3] },
  'HF-500B-GL': { occ: 0.035, size: [1, 1, 2, 2] },
  'RL-7700-2': { occ: 0.03, size: [1, 1, 2] },
}

// Planned consumption per check.
export const A_KIT = { 'OF-1290-8': 2, 'OK-29-104': 2, 'EO-2380-QT': 12, 'HF-500B-GL': 3 }
export const C_KIT = { '3214552-3': 1, 'OF-1290-8': 2, 'OK-29-104': 6, 'EO-2380-QT': 30, 'HF-500B-GL': 15, 'RL-7700-2': 20, 'LL-4596-1': 2 }

// The check calendar is known in advance (that is what makes it "advance demand information").
// Day numbers are relative to the simulation epoch; negative days are history.
export function checksOn(day) {
  const out = []
  FLEET.forEach((a, i) => {
    const offA = i * 9
    if (((day - offA) % A_CHECK_EVERY + A_CHECK_EVERY) % A_CHECK_EVERY === 0) out.push({ tail: a.tail, type: 'A', station: a.base, start: day })
    const cStart = ((120 + i * 61) % 365)
    if (((day - cStart) % 365 + 365) % 365 === 0) out.push({ tail: a.tail, type: 'C', station: HANGAR, start: day })
  })
  return out
}

export function inCheck(i, day) {
  const offA = i * 9
  const a = ((day - offA) % A_CHECK_EVERY + A_CHECK_EVERY) % A_CHECK_EVERY < A_CHECK_DAYS
  const cStart = ((120 + i * 61) % 365)
  const c = ((day - cStart) % 365 + 365) % 365 < C_CHECK_DAYS
  return a || c
}

// Planned demand for a part at a station from checks starting in [from, to).
export function plannedDemand(pn, station, from, to) {
  let q = 0
  for (let d = Math.ceil(from); d < to; d++) for (const c of checksOn(d)) {
    if (c.station !== station) continue
    const kit = c.type === 'A' ? A_KIT : C_KIT
    q += kit[pn] || 0
  }
  return q
}

// Planned flight hours at a station over a window (aircraft in a check fly zero hours).
export function plannedFH(station, from, to) {
  let h = 0
  for (let d = Math.ceil(from); d < to; d++) FLEET.forEach((a, i) => { if (a.base === station && !inCheck(i, d)) h += FH_MEAN })
  return h
}

// Flight hours actually flown by each aircraft on a day (stream `r`).
export function flownHours(r, day) {
  return FLEET.map((a, i) => (inCheck(i, day) ? 0 : Math.max(5, Math.min(13, FH_MEAN + FH_SD * Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r())))))
}

// One day's unscheduled occurrences for a part at a station: [{ t (fraction of day), qty }].
export function unscheduled(r, pn, fh, mult = 1) {
  const d = DEMAND[pn]
  const n = poisson(r, d.occ * fh * mult)
  const out = []
  for (let k = 0; k < n; k++) out.push({ t: r(), qty: d.size[Math.floor(r() * d.size.length)] })
  return out
}

// Weekly demand history (total, and the unscheduled part alone) for days [-weeks*7, 0).
export function history(parts, stations, seed, weeks = 104) {
  const fhR = rng(seed * 7 + 1), out = {}, unsched = {}
  const fhByDay = []
  for (let d = -weeks * 7; d < 0; d++) fhByDay.push(flownHours(fhR, d))
  parts.forEach((p, pi) => {
    out[p.pn] = {}; unsched[p.pn] = {}
    stations.forEach((s, si) => {
      const r = rng(seed * 131 + pi * 977 + si * 31)
      const tot = new Array(weeks).fill(0), un = new Array(weeks).fill(0)
      for (let d = -weeks * 7; d < 0; d++) {
        const w = Math.floor((d + weeks * 7) / 7)
        const fh = FLEET.reduce((h, a, i) => h + (a.base === s.code ? fhByDay[d + weeks * 7][i] : 0), 0)
        const u = unscheduled(r, p.pn, fh).reduce((q, o) => q + o.qty, 0)
        un[w] += u
        tot[w] += u + plannedDemand(p.pn, s.code, d, d + 1)
      }
      out[p.pn][s.code] = tot; unsched[p.pn][s.code] = un
    })
  })
  return { total: out, unscheduled: unsched }
}

// Syntetos-Boylan classification on monthly (4-week) buckets: ADI cut-off 1.32, CV-squared 0.49.
export function classify(weekly) {
  const m = []
  for (let i = 0; i + 4 <= weekly.length; i += 4) m.push(weekly.slice(i, i + 4).reduce((a, b) => a + b, 0))
  const nz = m.filter((v) => v > 0)
  if (nz.length < 2) return { pattern: 'lumpy', adi: Infinity, cv2: 0 }
  const adi = m.length / nz.length
  const mu = nz.reduce((a, b) => a + b, 0) / nz.length
  const cv2 = nz.reduce((a, b) => a + (b - mu) ** 2, 0) / nz.length / mu ** 2
  const pattern = adi < 1.32 ? (cv2 < 0.49 ? 'smooth' : 'erratic') : (cv2 < 0.49 ? 'intermittent' : 'lumpy')
  return { pattern, adi, cv2 }
}
