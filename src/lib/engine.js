// Avilo engine: ledger projection, permissions, intermittent-demand forecasting,
// the replenishment engine and the A/B/C simulation lab. Pure functions over the model.
// Writes never happen here: every change goes through a Supabase server function.
import AV from './model.js'
import { classify, plannedDemand, plannedFH } from './demand.js'
import { runReplication, forecastFor, paired, SCENARIOS, POLICIES } from './des.js'

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
AV.ses = function (y, a) {
  a = a || 0.2; const f = []; let l = null;
  for (let t = 0; t < y.length; t++) { f.push(l === null ? NaN : l); l = l === null ? y[t] : l + a * (y[t] - l); }
  return { fitted: f, next: l || 0 };
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
/* Reorder points.
   classic: what an ERP computes, mean and standard deviation of total weekly demand, 95% service.
   avilo:   the framework. Unscheduled demand is classified (Syntetos-Boylan) and forecast with the matching
            method (SES / SBA / TSB), scaled by planned flight hours; known check-kit consumption inside the
            lead time is added from the check calendar; the lead time is the supplier's observed lead time
            (mean + 1 sd of recent deliveries) when there are at least 3, otherwise the master lead time. */
const ropCache = new Map();
AV.ropFor = function (pn, station, opts) {
  opts = opts || {};
  const key = pn + '|' + station + '|' + (opts.leadDays || '');
  if (ropCache.has(key)) return ropCache.get(key);
  const out = ropForUncached(pn, station, opts);
  ropCache.set(key, out);
  return out;
};
function ropForUncached(pn, station, opts) {
  const p = AV.partBy[pn], y = AV.history[pn][station];
  const Lw = p.lead / 7, st = stats(y);
  const classic = Math.max(0, Math.ceil(st.mean * Lw + 1.65 * st.sd * Math.sqrt(Lw)));
  const leadDays = opts.leadDays || p.lead, Lwa = leadDays / 7;
  const yu = AV.historyUnscheduled[pn][station];
  const cls = classify(yu);
  const fc = forecastFor(cls.pattern, yu);
  const histFH = plannedFH(station, -364, 0) / 52;
  const fhRatio = histFH > 0 ? Math.min(1.5, Math.max(0.5, plannedFH(station, 0, leadDays) / ((histFH / 7) * leadDays))) : 1;
  const f = Math.max(0, fc.next) * fhRatio;
  let base;
  if (p.type === 'rotable') base = AV.poissonQuantile(f * Lwa, AV.SERVICE_LEVEL[p.crit]);
  else { const e = fc.e.slice(8); const rmse = Math.sqrt(e.reduce((s, v) => s + v * v, 0) / Math.max(1, e.length)); base = Math.max(1, Math.ceil(f * Lwa + AV.Z[p.crit] * rmse * Math.sqrt(Lwa))); }
  const planned = plannedDemand(pn, station, 0, leadDays + 7);
  const avilo = base + planned;
  const orderUpTo = p.type === 'rotable' ? avilo + 1 : avilo + Math.ceil(f * 4);
  return { classic, avilo, base, planned, weekly: f, pattern: cls.pattern, adi: cls.adi, cv2: cls.cv2, fhRatio, leadDays, mean: st.mean, sd: st.sd, Lw: Lwa, orderUpTo,
    method: { smooth: 'SES', intermittent: 'SBA', erratic: 'TSB', lumpy: 'TSB' }[cls.pattern] };
}

/* ---------- Replenishment engine: recommend, never order ---------- */
AV.recommend = function (S) {
  const now = AV.clock(), recs = [];
  const transit = AV.transits(S);
  const lead = AV.observedLead(S);
  for (const p of AV.parts) {
    for (const st of AV.stations) {
      const r = AV.ropFor(p.pn, st.code, { leadDays: Math.round(p.lead * lead[p.sup].factor * 10) / 10 });
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
      const dem = Math.round(r.weekly * r.Lw * 10) / 10;
      const why = 'Forecast demand ' + dem + ' ' + p.unit + ' over the ' + Math.round(r.leadDays) + '-day lead time (' + r.pattern + ' demand, ' + r.method + ')' + (r.planned ? ' plus ' + r.planned + ' for scheduled checks' : '') + '. ' + onHand + ' serviceable on hand, ' + inbound + ' in transit, ' + onOrder + ' on order' + (openReq ? ', ' + openReq + ' requested' : '') + '. Reorder point ' + r.avilo + ' at ' + Math.round(AV.SERVICE_LEVEL[p.crit] * 100) + '% service level.' + (overdueIn ? ' ' + overdueIn + ' overdue in transit not counted until received.' : '');
      recs.push({ id, pn: p.pn, station: st.code, qty, value: qty * p.cost, why, aog, lateral, rop: r.avilo, ip, crit: p.crit, overdueIn, decision: S.recDecisions[id] || null });
    }
  }
  const rank = (x) => (x.aog ? 0 : 10) + ({ A: 0, B: 1, C: 2 }[x.crit]) + (x.decision ? 20 : 0);
  return recs.sort((a, b) => rank(a) - rank(b) || b.value - a.value);
};

/* Observed supplier lateness: actual / quoted lead time over the supplier's last 8 received orders (any part).
   Plans with quoted lead × (mean + 1 sd), never less than quoted; fewer than 3 deliveries → quoted lead time. */
AV.observedLead = function (S) {
  const out = {};
  for (const sup of AV.suppliers) {
    const r = (S.pos || []).filter(o => o.sup === sup.id && o.received && o.sent).sort((a, b) => a.received - b.received).slice(-8)
      .map(o => ((o.received - o.sent) / DAY) / AV.partBy[o.pn].lead);
    if (r.length >= 3) { const st = stats(r); out[sup.id] = { factor: Math.max(1, st.mean + st.sd), mean: st.mean, sd: st.sd, n: r.length }; }
    else out[sup.id] = { factor: 1, mean: null, sd: null, n: r.length };
  }
  return out;
};

AV.supBy = Object.fromEntries(AV.suppliers.map(s => [s.id, s]));

AV.scorecard = function (S, supId) {
  const done = S.pos.filter(o => o.sup === supId && o.received);
  if (!done.length) return { n: 0, onTime: null, lead: null };
  const onTime = done.filter(o => o.received <= o.promised).length / done.length;
  const lead = done.reduce((s, o) => s + (o.received - o.sent) / DAY, 0) / done.length;
  return { n: done.length, onTime, lead };
};

/* ---------- Simulation lab: discrete-event simulation (src/lib/des.js) ----------
   The same simulated year under three policies (A baseline, B visibility only, C framework) and four scenarios. */
AV.SCENARIOS = SCENARIOS;
AV.POLICIES = POLICIES;
AV.simulate = function (seed, policy, opts) {
  opts = opts || {};
  return runReplication({ parts: AV.parts, stations: AV.stations, suppliers: AV.suppliers, seed, policy, scenario: opts.scenario || 'normal', days: opts.days, overrides: opts.overrides });
};
AV.simAll = function (seed, opts) { return { A: AV.simulate(seed, 'A', opts), B: AV.simulate(seed, 'B', opts), C: AV.simulate(seed, 'C', opts) }; };
AV.paired = paired;

export default AV
