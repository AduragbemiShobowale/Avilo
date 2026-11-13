// Avilo engine: ledger projection, permissions, intermittent-demand forecasting,
// the replenishment engine and the A/B/C simulation lab. Pure functions over the model.
// Writes never happen here: every change goes through a Supabase server function.
import AV from './model.js'

const DAY = AV.DAY
AV.clock = () => Date.now()

/* ---------- Ledger: stock is never edited, only derived from events ---------- */
function applyEvent(items, e) {
  const it = items[e.item];
  switch (e.type) {
    case 'RECEIVE':
    case 'TURN_IN':
      items[e.item] = { id: e.item, pn: e.pn, qty: e.qty, loc: e.to, cond: e.cond || 'pending', transit: null, reserved: null, expiry: e.expiry || null, cert: e.cert || null, ref: e.ref, since: e.ts };
      break;
    case 'VERIFY': if (it) { it.cond = 'serviceable'; it.cert = e.cert; } break;
    case 'CONDITION': if (it) it.cond = e.cond; break;
    case 'TRANSFER_OUT':
      if (!it) break;
      if (e.qty >= it.qty) { it.transit = { trf: e.trf, from: e.from, to: e.to, ts: e.ts }; it.loc = null; }
      else {
        it.qty -= e.qty;
        const cid = it.id + '/' + e.trf;
        items[cid] = Object.assign({}, it, { id: cid, qty: e.qty, loc: null, reserved: null, transit: { trf: e.trf, from: e.from, to: e.to, ts: e.ts }, parent: it.id });
      }
      break;
    case 'TRANSFER_IN':
      for (const x of Object.values(items)) if (x.transit && x.transit.trf === e.trf) { x.loc = x.transit.to; x.transit = null; x.since = e.ts; }
      break;
    case 'ISSUE':
      if (!it) break;
      if (AV.partBy[it.pn].type === 'rotable') { it.loc = null; it.cond = 'issued'; it.onAircraft = e.aircraft; it.reserved = null; }
      else { it.qty -= e.qty; if (it.reserved && it.qty <= 0) it.reserved = null; }
      break;
    case 'RESERVE': if (it) it.reserved = e.ref; break;
    case 'RELEASE': if (it) it.reserved = null; break;
    case 'ADJUST': if (it) it.qty += e.delta; break;
    case 'SCRAP': if (it) { it.cond = 'scrapped'; it.loc = null; } break;
  }
}
AV.project = function (events) { const items = {}; for (const e of events) applyEvent(items, e); return items; };

AV.isOverdue = (tr, now) => (now || AV.clock()) - tr.ts > AV.OVERDUE_HOURS * 36e5;

AV.condLabel = (c) => ({ serviceable: 'Serviceable', unserviceable: 'Unserviceable', repairable: 'Repairable', quarantined: 'Quarantined', pending: 'Pending inspection', issued: 'Fitted to aircraft', scrapped: 'Scrapped' }[c] || c);

AV.available = function (S, pn, station) {
  let q = 0;
  for (const it of Object.values(S.items)) if (it.pn === pn && it.loc === station && it.cond === 'serviceable' && !it.reserved && it.qty > 0) q += it.qty;
  return q;
};
AV.transits = function (S) {
  const by = {};
  for (const it of Object.values(S.items)) if (it.transit) { const k = it.transit.trf; (by[k] = by[k] || { trf: k, from: it.transit.from, to: it.transit.to, ts: it.transit.ts, items: [] }).items.push(it); }
  return Object.values(by).map(t => Object.assign(t, { overdue: AV.isOverdue(t) })).sort((a, b) => a.ts - b.ts);
};
AV.inventoryValue = function (S) {
  let v = 0;
  for (const it of Object.values(S.items)) if ((it.loc || it.transit) && !['issued', 'scrapped'].includes(it.cond)) v += AV.partBy[it.pn].cost * it.qty * (it.cond === 'serviceable' ? 1 : it.cond === 'pending' ? 1 : 0.4);
  return v;
};

/* ---------- Permissions (architecture section 3) ---------- */
const ALL = ['superadmin', 'admin', 'operator', 'technician', 'planner', 'procurement', 'compliance', 'viewer'];
const M = {
  'tower.view': ['planner', 'procurement', 'compliance', 'admin', 'superadmin', 'viewer'],
  'stores.use': ['operator'],
  'search': ['technician', 'planner', 'procurement', 'compliance', 'admin', 'superadmin', 'operator'],
  'request.raise': ['technician', 'planner'],
  'replen.view': ['planner', 'procurement', 'viewer'],
  'rec.approve': ['planner', 'procurement'],
  'rec.approve.high': ['procurement'],
  'forecast.view': ['planner', 'procurement', 'viewer'],
  'compliance.use': ['compliance'],
  'supplier.portal': ['supplier'],
  'history.view': ALL,
  'sim.view': ['planner', 'procurement', 'viewer', 'admin', 'superadmin'],
  'audit.view': ['admin', 'compliance', 'superadmin'],
  'admin.use': ['admin', 'superadmin', 'procurement'],
  'limit.propose': ['admin'],
  'limit.approve': ['procurement']
};
AV.can = function (u, cap, station) {
  if (!M[cap] || !M[cap].includes(u.role)) return false;
  if (station && u.role === 'operator') return u.scope.includes(station);
  if (station && u.role === 'technician' && cap === 'request.raise') return u.scope.includes(station);
  return true;
};
AV.matrix = M;

/* ---------- Forecasting for intermittent demand ---------- */
AV.croston = function (y, a, sba) {
  a = a || 0.1; let z = null, p = null, q = 1; const f = [];
  const k = sba ? 1 - a / 2 : 1;
  for (let t = 0; t < y.length; t++) {
    f.push(z === null ? NaN : (k * z) / p);
    if (y[t] > 0) { if (z === null) { z = y[t]; p = q; } else { z += a * (y[t] - z); p += a * (q - p); } q = 1; } else q++;
  }
  return { fitted: f, next: z === null ? 0 : (k * z) / p };
};
AV.tsb = function (y, a, b) {
  a = a || 0.1; b = b || 0.1;
  const head = y.slice(0, 8), nz = head.filter(v => v > 0);
  let d = nz.length / head.length || 0.1, z = nz.length ? nz.reduce((s, v) => s + v, 0) / nz.length : 1; const f = [];
  for (let t = 0; t < y.length; t++) {
    f.push(t < 8 ? NaN : d * z);
    if (y[t] > 0) { d += b * (1 - d); z += a * (y[t] - z); } else d += b * (0 - d);
  }
  return { fitted: f, next: d * z };
};
AV.movingMean = function (y) {
  const f = []; let s = 0;
  for (let t = 0; t < y.length; t++) { f.push(t ? s / t : NaN); s += y[t]; }
  return { fitted: f, next: s / y.length };
};
AV.evaluate = function (y, fitted, from) {
  let ae = 0, e = 0, n = 0;
  for (let t = from; t < y.length; t++) if (!isNaN(fitted[t])) { ae += Math.abs(y[t] - fitted[t]); e += fitted[t] - y[t]; n++; }
  return { mae: ae / n, bias: e / n };
};
AV.poissonQuantile = function (mu, p) {
  if (mu <= 0) return 0;
  let k = 0, pk = Math.exp(-mu), c = pk;
  if (pk === 0) return Math.ceil(mu + 2.33 * Math.sqrt(mu));
  while (c < p && k < 1000) { k++; pk *= mu / k; c += pk; }
  return k;
};
AV.Z = { A: 2.054, B: 1.645, C: 1.282 };
/* Rotables are demanded one unit at a time: Poisson quantile.
   Consumables come in variable quantities: forecast plus safety stock from the forecast's own error. */
AV.aviloRop = function (p, f, fitted, y, Lw) {
  if (p.type === 'rotable') return AV.poissonQuantile(f * Lw, AV.SERVICE_LEVEL[p.crit]);
  let se = 0, n = 0;
  for (let t = 8; t < y.length; t++) if (!isNaN(fitted[t])) { se += (y[t] - fitted[t]) ** 2; n++; }
  const rmse = Math.sqrt(se / Math.max(1, n));
  return Math.max(1, Math.ceil(f * Lw + AV.Z[p.crit] * rmse * Math.sqrt(Lw)));
};
const stats = (y) => { const m = y.reduce((s, v) => s + v, 0) / y.length; const v = y.reduce((s, x) => s + (x - m) ** 2, 0) / (y.length - 1); return { mean: m, sd: Math.sqrt(v) }; };
AV.ropFor = function (pn, station) {
  const p = AV.partBy[pn], y = AV.history[pn][station];
  const Lw = p.lead / 7, st = stats(y);
  const classic = Math.max(0, Math.ceil(st.mean * Lw + 1.65 * st.sd * Math.sqrt(Lw)));
  const fc = AV.croston(y, 0.1, true), f = fc.next;
  const avilo = AV.aviloRop(p, f, fc.fitted, y, Lw);
  return { classic, avilo, weekly: f, mean: st.mean, sd: st.sd, Lw, orderUpTo: avilo + Math.ceil(f * 4), method: p.type === 'rotable' ? 'Poisson' : 'forecast-error' };
};

/* ---------- Replenishment engine: recommend, never order ---------- */
AV.recommend = function (S) {
  const now = AV.clock(), recs = [];
  const transit = AV.transits(S);
  for (const p of AV.parts) {
    for (const st of AV.stations) {
      const r = AV.ropFor(p.pn, st.code);
      const onHand = AV.available(S, p.pn, st.code);
      let inbound = 0, overdueIn = 0;
      for (const t of transit) if (t.to === st.code) for (const it of t.items) if (it.pn === p.pn) { if (t.overdue) overdueIn += it.qty; else inbound += it.qty; }
      const onOrder = S.pos.filter(o => o.pn === p.pn && o.station === st.code && !['Received', 'Rejected'].includes(o.status)).reduce((s, o) => s + o.qty, 0);
      const reqs = S.requests.filter(q => q.pn === p.pn && q.station === st.code && q.status === 'Open');
      const openReq = reqs.reduce((s, q) => s + q.qty, 0);
      const aog = reqs.some(q => q.priority === 'AOG');
      const ip = onHand + inbound + onOrder - openReq;
      if (ip > r.avilo || (r.avilo === 0 && openReq === 0)) continue;
      const qty = Math.max(1, r.orderUpTo - ip);
      const id = 'REC-' + p.pn + '-' + st.code;
      const lateral = AV.stations.filter(o => o.code !== st.code).map(o => ({ code: o.code, spare: AV.available(S, p.pn, o.code) - AV.ropFor(p.pn, o.code).avilo })).filter(o => o.spare > 0).sort((a, b) => b.spare - a.spare)[0] || null;
      const dem = Math.round(r.weekly * (p.lead / 7) * 10) / 10;
      const why = 'Forecast demand ' + dem + ' ' + p.unit + ' over the ' + p.lead + '-day lead time (SBA). ' + onHand + ' serviceable on hand, ' + inbound + ' in transit, ' + onOrder + ' on order' + (openReq ? ', ' + openReq + ' requested' : '') + '. Reorder point ' + r.avilo + ' at ' + Math.round(AV.SERVICE_LEVEL[p.crit] * 100) + '% service level.' + (overdueIn ? ' ' + overdueIn + ' overdue in transit not counted until received.' : '');
      recs.push({ id, pn: p.pn, station: st.code, qty, value: qty * p.cost, why, aog, lateral, rop: r.avilo, ip, crit: p.crit, overdueIn, decision: S.recDecisions[id] || null });
    }
  }
  const rank = (x) => (x.aog ? 0 : 10) + ({ A: 0, B: 1, C: 2 }[x.crit]) + (x.decision ? 20 : 0);
  return recs.sort((a, b) => rank(a) - rank(b) || b.value - a.value);
};

AV.supBy = Object.fromEntries(AV.suppliers.map(s => [s.id, s]));

AV.scorecard = function (S, supId) {
  const done = S.pos.filter(o => o.sup === supId && o.received);
  if (!done.length) return { n: 0, onTime: null, lead: null };
  const onTime = done.filter(o => o.received <= o.promised).length / done.length;
  const lead = done.reduce((s, o) => s + (o.received - o.sent) / DAY, 0) / done.length;
  return { n: done.length, onTime, lead };
};

/* ---------- Simulation lab: the same simulated year under three policies ----------
   A  Status quo: weekly spreadsheet snapshot, 6% of issues/transfers never logged, classic reorder point.
   B  Visibility only: real-time ledger, same classic reorder point.
   C  Full Avilo: real-time ledger, SBA forecast, reorder point by criticality (Poisson for rotables,
      forecast-error safety stock for consumables). A and B re-estimate from a 104-week mean every 4 weeks; C re-runs SBA.
   Demand uses common random numbers, so all three policies face the identical year. */
AV.simulate = function (seed, policy, opts) {
  opts = opts || {};
  const days = opts.days || 365, miss = opts.missRate == null ? 0.06 : opts.missRate;
  const m = { demand: 0, filled: 0, stockouts: 0, critical: 0, invValue: 0, orders: 0, expedite: 0 };
  let pi = 0;
  for (const p of AV.parts) {
    for (const st of AV.stations) {
      pi++;
      const rD = AV.rng(seed * 31 + pi * 7919);
      const rO = AV.rng(seed * 17 + pi * 104729 + policy.charCodeAt(0));
      const y = AV.history[p.pn][st.code];
      const L = p.lead;
      const wk = y.slice(); let wsum = 0;
      let rop, S;
      const plan = () => {
        if (policy === 'C') { const fc = AV.croston(wk, 0.1, true); rop = AV.aviloRop(p, fc.next, fc.fitted, wk, L / 7); S = rop + Math.ceil((fc.next / 7) * 28); }
        else { const sm = stats(wk.slice(-104)), dm = sm.mean / 7, ds = sm.sd / Math.sqrt(7); rop = Math.ceil(dm * L + 1.65 * ds * Math.sqrt(L)); S = rop + Math.ceil(dm * 28); }
        S = Math.max(S, 1);
      };
      plan();
      let phys = S, rec = S, seen = S;
      const pipe = [];
      for (let d = 0; d < days; d++) {
        for (let i = pipe.length - 1; i >= 0; i--) if (pipe[i].at <= d) { phys += pipe[i].q; rec += pipe[i].q; pipe.splice(i, 1); }
        const season = 1 + 0.15 * Math.sin(((104 + d / 7) / 52) * 2 * Math.PI);
        const lift = d >= (opts.shiftDay || 90) ? 1 + (opts.shift || 0) : 1;
        const dem = AV.dailyDemand(rD, p, st.weight * season * lift);
        wsum += dem;
        if (d % 7 === 6) { wk.push(wsum); wsum = 0; }
        if (d % 28 === 27) plan();
        const fill = Math.min(dem, phys);
        phys -= fill; m.demand += dem; m.filled += fill;
        if (dem > fill) { m.stockouts++; if (p.crit !== 'C') m.critical++; m.expedite += p.crit === 'A' ? 25000 : p.crit === 'B' ? 6000 : 1500; rec = phys; }
        if (policy === 'A') { for (let k = 0; k < fill; k++) if (rO() >= miss) rec--; if (d % 7 === 0) seen = rec; }
        else { rec = phys; seen = phys; }
        const onOrder = pipe.reduce((s, x) => s + x.q, 0);
        const pos = seen + onOrder;
        if (pos <= rop) {
          const q = Math.max(1, S - pos);
          let lt = L * (1 + 0.3 * rO()); if (rO() < 0.1) lt *= 1.5;
          pipe.push({ at: d + Math.round(lt), q }); m.orders++;
        }
        m.invValue += phys * p.cost;
      }
    }
  }
  m.invValue /= days;
  m.fillRate = m.filled / Math.max(1, m.demand);
  m.holding = m.invValue * 0.25;
  return m;
};
AV.simAll = function (seed, opts) { return { A: AV.simulate(seed, 'A', opts), B: AV.simulate(seed, 'B', opts), C: AV.simulate(seed, 'C', opts) }; };

export default AV
