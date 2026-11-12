/* Avilo demo data: a fixed, seeded world so every run of the demo is identical.
   Everything here is SIMULATED: stations, fleet, parts, suppliers and people are fictional. */
(function () {
  const AV = (window.AV = window.AV || {});
  const DAY = 864e5;
  AV.DAY = DAY;
  AV.NOW = Date.UTC(2026, 10, 12, 9, 42); // demo clock: 12 NOV 2026 09:42Z
  AV.SEED = 20261112;
  AV.OVERDUE_HOURS = 72;

  AV.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  AV.poisson = function (r, lam) {
    if (lam <= 0) return 0;
    if (lam > 40) { const u = Math.max(1e-9, r()), v = r(); return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))); }
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  };

  AV.stations = [
    { code: 'LHR', name: 'London Heathrow', kind: 'Main base · MRO hangar', lat: 51.47, lon: -0.45, weight: 0.4 },
    { code: 'SIN', name: 'Singapore Changi', kind: 'Satellite store', lat: 1.36, lon: 103.99, weight: 0.2 },
    { code: 'LOS', name: 'Lagos', kind: 'Line station', lat: 6.58, lon: 3.32, weight: 0.2 },
    { code: 'DXB', name: 'Dubai', kind: 'Regional warehouse', lat: 25.25, lon: 55.36, weight: 0.2 }
  ];
  AV.suppliers = [
    { id: 'SUP-1', name: 'Halcyon Aero Spares', code: 'MIA', city: 'Miami', lat: 25.79, lon: -80.29, approved: true },
    { id: 'SUP-2', name: 'Kestrel Rotables', code: 'HAM', city: 'Hamburg', lat: 53.63, lon: 9.99, approved: true },
    { id: 'SUP-3', name: 'Cascade Avionics Supply', code: 'SEA', city: 'Seattle', lat: 47.45, lon: -122.31, approved: true }
  ];
  AV.fleet = ['AVL-01', 'AVL-02', 'AVL-03', 'AVL-04', 'AVL-05', 'AVL-06'].map((t, i) => ({ tail: t, type: 'B737-800', base: ['LHR', 'LHR', 'LOS', 'SIN', 'DXB', 'LHR'][i], fhPerDay: [9.1, 0, 8.4, 0, 10.2, 8.8][i], status: ['In service', 'C-check · LHR hangar 2', 'In service', 'AOG · SIN', 'In service', 'In service'][i] }));

  // zone keys map to hotspots on the 3D aircraft
  AV.zones = {
    engL: 'Left engine (No. 1)', engR: 'Right engine (No. 2)', wingL: 'Left wing', wingR: 'Right wing',
    noseGear: 'Nose landing gear', mainGear: 'Main landing gear', avionics: 'Avionics bay (E/E)', cockpit: 'Flight deck',
    apu: 'APU · tail cone', belly: 'Air-conditioning bay', cabin: 'Passenger cabin'
  };

  // rate = network demand per day. P/Ns and serial prefixes are fictional.
  AV.parts = [
    { pn: '3214552-3', name: 'Hydraulic pump, engine-driven', ata: '29', type: 'rotable', unit: 'ea', cost: 48500, lead: 30, crit: 'A', zone: 'engL', sup: 'SUP-2', rate: 0.03, sn: 'HP' },
    { pn: '3505986-12', name: 'Air turbine starter', ata: '80', type: 'rotable', unit: 'ea', cost: 62000, lead: 45, crit: 'A', zone: 'engR', sup: 'SUP-1', rate: 0.02, sn: 'ST' },
    { pn: '2C1185-04', name: 'Brake assembly, main wheel', ata: '32', type: 'rotable', unit: 'ea', cost: 34000, lead: 21, crit: 'A', zone: 'mainGear', sup: 'SUP-2', rate: 0.06, sn: 'BK' },
    { pn: '5009873-7', name: 'Fuel boost pump', ata: '28', type: 'rotable', unit: 'ea', cost: 21800, lead: 28, crit: 'A', zone: 'wingL', sup: 'SUP-1', rate: 0.025, sn: 'FP' },
    { pn: 'AD-822410', name: 'Air data computer', ata: '34', type: 'rotable', unit: 'ea', cost: 71000, lead: 40, crit: 'A', zone: 'avionics', sup: 'SUP-3', rate: 0.012, sn: 'AD' },
    { pn: '3800706-2', name: 'APU starter-generator', ata: '49', type: 'rotable', unit: 'ea', cost: 39000, lead: 35, crit: 'B', zone: 'apu', sup: 'SUP-1', rate: 0.015, sn: 'AG' },
    { pn: 'VT-622-0450', name: 'VHF transceiver', ata: '23', type: 'rotable', unit: 'ea', cost: 18500, lead: 30, crit: 'B', zone: 'avionics', sup: 'SUP-3', rate: 0.02, sn: 'VH' },
    { pn: '3291460-5', name: 'Pack flow control valve', ata: '21', type: 'rotable', unit: 'ea', cost: 16400, lead: 25, crit: 'B', zone: 'belly', sup: 'SUP-2', rate: 0.02, sn: 'PV' },
    { pn: 'NW-277104', name: 'Nose wheel assembly', ata: '32', type: 'rotable', unit: 'ea', cost: 9800, lead: 14, crit: 'B', zone: 'noseGear', sup: 'SUP-2', rate: 0.05, sn: 'NW' },
    { pn: 'LL-4596-1', name: 'Landing light lamp', ata: '33', type: 'consumable', unit: 'ea', cost: 1250, lead: 10, crit: 'C', zone: 'wingR', sup: 'SUP-1', rate: 0.08, batch: 'LL' },
    { pn: 'TY-H44-5', name: 'Tyre, main wheel', ata: '32', type: 'consumable', unit: 'ea', cost: 2900, lead: 14, crit: 'B', zone: 'mainGear', sup: 'SUP-1', rate: 0.12, batch: 'TY' },
    { pn: 'OF-1290-8', name: 'Engine oil filter element', ata: '79', type: 'consumable', unit: 'ea', cost: 210, lead: 10, crit: 'B', zone: 'engR', sup: 'SUP-1', rate: 0.15, batch: 'OF' },
    { pn: 'OK-29-104', name: 'O-ring kit, hydraulic', ata: '29', type: 'consumable', unit: 'kit', cost: 85, lead: 7, crit: 'C', zone: 'engL', sup: 'SUP-1', rate: 0.5, batch: 'OK' },
    { pn: 'EO-2380-QT', name: 'Turbine engine oil', ata: '79', type: 'consumable', unit: 'qt', cost: 38, lead: 5, crit: 'B', zone: 'engL', sup: 'SUP-1', rate: 3.0, batch: 'EO', shelf: 720 },
    { pn: 'HF-500B-GL', name: 'Hydraulic fluid', ata: '29', type: 'consumable', unit: 'gal', cost: 140, lead: 5, crit: 'B', zone: 'engR', sup: 'SUP-1', rate: 1.2, batch: 'HF', shelf: 900 },
    { pn: 'WB-5520-3', name: 'Windshield wiper blade', ata: '30', type: 'consumable', unit: 'ea', cost: 320, lead: 12, crit: 'C', zone: 'cockpit', sup: 'SUP-3', rate: 0.04, batch: 'WB' },
    { pn: 'RL-7700-2', name: 'Cabin reading light lamp', ata: '33', type: 'consumable', unit: 'ea', cost: 45, lead: 7, crit: 'C', zone: 'cabin', sup: 'SUP-3', rate: 0.3, batch: 'RL' }
  ];
  AV.partBy = Object.fromEntries(AV.parts.map(p => [p.pn, p]));
  AV.SERVICE_LEVEL = { A: 0.98, B: 0.95, C: 0.9 };

  AV.roleNames = {
    superadmin: 'Super Admin', admin: 'Admin', operator: 'Stores Operator', technician: 'Technician',
    planner: 'Supply Chain Planner', procurement: 'Procurement Manager', compliance: 'Compliance Officer',
    supplier: 'Supplier', viewer: 'Management viewer'
  };
  AV.users = [
    { id: 'u-pl', name: 'A. Mensah', role: 'planner', scope: ['*'] },
    { id: 'u-op1', name: 'J. Patel', role: 'operator', scope: ['LHR', 'DXB'] },
    { id: 'u-op2', name: 'L. Tan', role: 'operator', scope: ['SIN'] },
    { id: 'u-op3', name: 'O. Bello', role: 'operator', scope: ['LOS'] },
    { id: 'u-te', name: 'M. Rahman', role: 'technician', scope: ['SIN'] },
    { id: 'u-pm', name: 'S. Weber', role: 'procurement', scope: ['*'] },
    { id: 'u-co', name: 'N. Haddad', role: 'compliance', scope: ['*'] },
    { id: 'u-su', name: 'K. Ortiz · Halcyon', role: 'supplier', scope: [], supplier: 'SUP-1' },
    { id: 'u-ad', name: 'T. Okafor', role: 'admin', scope: ['*'] },
    { id: 'u-sa', name: 'Avilo Support', role: 'superadmin', scope: ['*'] },
    { id: 'u-mv', name: 'Finance', role: 'viewer', scope: ['*'] }
  ];
  AV.userBy = Object.fromEntries(AV.users.map(u => [u.id, u]));

  /* Daily demand generator shared by history, forecasts and the simulation lab. */
  AV.dailyDemand = function (r, part, weight) {
    const lam = part.rate * weight;
    if (part.type === 'rotable') return AV.poisson(r, lam);
    // consumables: intermittent occurrences with a variable size
    const occ = Math.min(0.9, lam / 3);
    if (r() > occ) return 0;
    let size = 1; const mean = lam / occ;
    while (size < mean * 3 && r() < 1 - 1 / mean) size++;
    return size;
  };

  /* 104 weeks of demand history per part and station. */
  AV.history = (function () {
    const r = AV.rng(AV.SEED + 7), out = {};
    for (const p of AV.parts) {
      out[p.pn] = {};
      for (const s of AV.stations) {
        const weeks = [];
        for (let w = 0; w < 104; w++) {
          const season = 1 + 0.15 * Math.sin((w / 52) * 2 * Math.PI);
          let sum = 0;
          for (let d = 0; d < 7; d++) sum += AV.dailyDemand(r, p, s.weight * season);
          weeks.push(sum);
        }
        out[p.pn][s.code] = weeks;
      }
    }
    return out;
  })();

  /* Initial ledger. Every stock fact in the app is derived from these events. */
  AV.seedState = function () {
    const r = AV.rng(AV.SEED);
    const ev = [];
    let n = 0;
    const push = (e) => { e.id = 'EV-' + String(++n).padStart(5, '0'); ev.push(e); return e; };
    const serial = {};
    const nextSn = (p) => { serial[p.sn] = (serial[p.sn] || 10400) + 1 + Math.floor(r() * 3); return p.sn + '-' + serial[p.sn]; };
    const ago = (days, hours) => AV.NOW - days * DAY - (hours || 0) * 36e5;
    const certFor = (sup) => (sup === 'SUP-3' ? 'FAA 8130-3' : 'EASA Form 1');

    // stock levels per station, chosen so the demo opens with a realistic mix
    const level = {
      '3214552-3': { LHR: 0, SIN: 0, LOS: 3, DXB: 3 },
      '3505986-12': { LHR: 3, SIN: 2, LOS: 2, DXB: 2 },
      '2C1185-04': { LHR: 3, SIN: 0, LOS: 3, DXB: 3 },
      '5009873-7': { LHR: 3, SIN: 2, LOS: 2, DXB: 2 },
      'AD-822410': { LHR: 0, SIN: 2, LOS: 0, DXB: 2 },
      '3800706-2': { LHR: 2, SIN: 2, LOS: 2, DXB: 2 },
      'VT-622-0450': { LHR: 1, SIN: 2, LOS: 2, DXB: 2 },
      '3291460-5': { LHR: 2, SIN: 2, LOS: 2, DXB: 2 },
      'NW-277104': { LHR: 2, SIN: 2, LOS: 2, DXB: 2 },
      'LL-4596-1': { LHR: 6, SIN: 3, LOS: 3, DXB: 4 },
      'TY-H44-5': { LHR: 14, SIN: 7, LOS: 5, DXB: 6 },
      'OF-1290-8': { LHR: 12, SIN: 6, LOS: 2, DXB: 9 },
      'OK-29-104': { LHR: 40, SIN: 12, LOS: 9, DXB: 18 },
      'EO-2380-QT': { LHR: 160, SIN: 60, LOS: 44, DXB: 72 },
      'HF-500B-GL': { LHR: 55, SIN: 20, LOS: 16, DXB: 30 },
      'WB-5520-3': { LHR: 4, SIN: 1, LOS: 2, DXB: 2 },
      'RL-7700-2': { LHR: 30, SIN: 10, LOS: 8, DXB: 14 }
    };
    for (const p of AV.parts) {
      for (const s of AV.stations) {
        const qty = level[p.pn][s.code];
        if (!qty) continue;
        const t = ago(40 + Math.floor(r() * 300), Math.floor(r() * 20));
        if (p.type === 'rotable') {
          for (let i = 0; i < qty; i++) {
            const sn = nextSn(p);
            push({ ts: t - i * DAY * 3, type: 'RECEIVE', item: sn, pn: p.pn, qty: 1, to: s.code, cond: 'pending', ref: 'PO-6' + (100 + Math.floor(r() * 800)), actor: 'seed', source: 'ERP extract' });
            push({ ts: t - i * DAY * 3 + 5 * 36e5, type: 'VERIFY', item: sn, pn: p.pn, cert: certFor(p.sup), actor: 'u-co', source: 'Avilo' });
          }
        } else {
          const b = p.batch + '-' + s.code + '-' + (100 + Math.floor(r() * 800));
          const exp = p.shelf ? AV.NOW + (120 + Math.floor(r() * 500)) * DAY : null;
          push({ ts: t, type: 'RECEIVE', item: b, pn: p.pn, qty, to: s.code, cond: 'pending', ref: 'PO-6' + (100 + Math.floor(r() * 800)), expiry: exp, actor: 'seed', source: 'ERP extract' });
          push({ ts: t + 4 * 36e5, type: 'VERIFY', item: b, pn: p.pn, cert: certFor(p.sup), actor: 'u-co', source: 'Avilo' });
        }
      }
    }
    // a few units in repair loops
    const rep = [['3214552-3', 'DXB', 'repairable'], ['3505986-12', 'LHR', 'unserviceable'], ['2C1185-04', 'SIN', 'repairable'], ['VT-622-0450', 'LHR', 'repairable']];
    for (const [pn, st, cond] of rep) {
      const sn = nextSn(AV.partBy[pn]);
      push({ ts: ago(20 + Math.floor(r() * 30)), type: 'TURN_IN', item: sn, pn, qty: 1, to: st, cond, ref: 'WO-87' + (100 + Math.floor(r() * 800)), actor: 'seed', source: 'ERP extract', reason: 'Removed on condition' });
    }

    // THE STORY: hydraulic pump HP-10482 left LHR for an AOG in Singapore and was never logged in.
    push({ ts: ago(470), type: 'RECEIVE', item: 'HP-10482', pn: '3214552-3', qty: 1, to: 'LHR', cond: 'pending', ref: 'PO-5874', actor: 'seed', source: 'ERP extract' });
    push({ ts: ago(469, 20), type: 'VERIFY', item: 'HP-10482', pn: '3214552-3', cert: 'EASA Form 1', actor: 'u-co', source: 'Avilo' });
    push({ ts: ago(59, 6), type: 'TRANSFER_OUT', item: 'HP-10482', pn: '3214552-3', qty: 1, from: 'LHR', to: 'SIN', trf: 'TRF-0417', actor: 'u-op1', source: 'Scanner', reason: 'AOG cover, AVL-04 at SIN' });

    // other movements
    const vhf = nextSn(AV.partBy['VT-622-0450']);
    push({ ts: ago(200), type: 'RECEIVE', item: vhf, pn: 'VT-622-0450', qty: 1, to: 'SIN', cond: 'pending', ref: 'PO-6311', actor: 'seed', source: 'ERP extract' });
    push({ ts: ago(199, 18), type: 'VERIFY', item: vhf, pn: 'VT-622-0450', cert: 'FAA 8130-3', actor: 'u-co', source: 'Avilo' });
    push({ ts: ago(5, 2), type: 'TRANSFER_OUT', item: vhf, pn: 'VT-622-0450', qty: 1, from: 'SIN', to: 'LHR', trf: 'TRF-0428', actor: 'u-op2', source: 'Scanner' });
    const ofb = ev.find(e => e.type === 'RECEIVE' && e.pn === 'OF-1290-8' && e.to === 'DXB');
    push({ ts: ago(1, 3), type: 'TRANSFER_OUT', item: ofb.item, pn: 'OF-1290-8', qty: 4, from: 'DXB', to: 'LOS', trf: 'TRF-0431', actor: 'u-op1', source: 'Scanner' });
    const tyb = ev.find(e => e.type === 'RECEIVE' && e.pn === 'TY-H44-5' && e.to === 'LHR');
    push({ ts: ago(2, 1), type: 'TRANSFER_OUT', item: tyb.item, pn: 'TY-H44-5', qty: 4, from: 'LHR', to: 'DXB', trf: 'TRF-0432', actor: 'u-op1', source: 'Scanner' });

    // a received unit waiting for its certificate check
    push({ ts: ago(1, 5), type: 'RECEIVE', item: 'AD-55102', pn: 'AD-822410', qty: 1, to: 'LHR', cond: 'pending', ref: 'PO-6990', actor: 'u-op1', source: 'Scanner', cert: 'FAA 8130-3 (uploaded by supplier)' });
    // a quarantined fuel pump with a certificate discrepancy
    const fpq = nextSn(AV.partBy['5009873-7']);
    push({ ts: ago(30), type: 'RECEIVE', item: fpq, pn: '5009873-7', qty: 1, to: 'DXB', cond: 'pending', ref: 'PO-6902', actor: 'seed', source: 'ERP extract' });
    push({ ts: ago(29), type: 'CONDITION', item: fpq, pn: '5009873-7', cond: 'quarantined', actor: 'u-co', source: 'Avilo', reason: 'Form 1 serial does not match data plate' });
    // a little consumption so history is visible
    const eo = ev.find(e => e.type === 'RECEIVE' && e.pn === 'EO-2380-QT' && e.to === 'LHR');
    for (let i = 0; i < 4; i++) push({ ts: ago(4 - i, 3), type: 'ISSUE', item: eo.item, pn: 'EO-2380-QT', qty: 6 + i, from: 'LHR', ref: 'WO-881' + (40 + i), aircraft: ['AVL-01', 'AVL-06', 'AVL-01', 'AVL-06'][i], actor: 'u-op1', source: 'Scanner' });

    ev.sort((a, b) => a.ts - b.ts);

    const requests = [
      { id: 'REQ-3301', pn: '3214552-3', qty: 1, station: 'LHR', aircraft: 'AVL-02', wo: 'WO-88213', priority: 'Routine', status: 'Open', by: 'u-pl', ts: ago(1, 7), note: 'C-check, hangar 2. Needed by 19 NOV.' },
      { id: 'REQ-3302', pn: '2C1185-04', qty: 1, station: 'SIN', aircraft: 'AVL-04', wo: 'WO-88240', priority: 'AOG', status: 'Open', by: 'u-te', ts: ago(0, 5), note: 'No. 3 brake worn beyond limits at transit check.' }
    ];
    // purchase-order history gives the supplier scorecard real numbers
    const pos = [];
    const rr = AV.rng(AV.SEED + 3);
    for (let i = 0; i < 24; i++) {
      const sup = AV.suppliers[i % 3];
      const parts = AV.parts.filter(p => p.sup === sup.id);
      const p = parts[Math.floor(rr() * parts.length)];
      const sent = ago(400 - i * 15);
      const promised = sent + p.lead * DAY;
      const slip = (sup.id === 'SUP-2' ? 6 : sup.id === 'SUP-1' ? 2 : 0) + Math.round((rr() - 0.45) * 8);
      pos.push({ id: 'PO-6' + (500 + i * 13), sup: sup.id, pn: p.pn, qty: p.type === 'rotable' ? 1 : 20, station: AV.stations[i % 4].code, value: p.cost * (p.type === 'rotable' ? 1 : 20), status: 'Received', sent, promised, shipped: promised + (slip - 2) * DAY, received: promised + slip * DAY, approvals: [] });
    }
    pos.push({ id: 'PO-7001', sup: 'SUP-1', pn: '3505986-12', qty: 1, station: 'LOS', value: 62000, status: 'Confirmed', sent: ago(18), promised: AV.NOW + 27 * DAY, approvals: [{ by: 'u-pl', ts: ago(19) }, { by: 'u-pm', ts: ago(18) }] });
    pos.push({ id: 'PO-7003', sup: 'SUP-1', pn: 'OK-29-104', qty: 30, station: 'SIN', value: 2550, status: 'Shipped', sent: ago(6), promised: AV.NOW + 1 * DAY, shipped: ago(1), tracking: 'AWB 176-44190335', approvals: [{ by: 'u-pl', ts: ago(6) }] });
    pos.push({ id: 'PO-7004', sup: 'SUP-1', pn: 'LL-4596-1', qty: 6, station: 'LHR', value: 7500, status: 'Sent', sent: ago(0, 20), approvals: [{ by: 'u-pl', ts: ago(1) }, { by: 'u-pm', ts: ago(0, 21) }] });

    const audit = [
      { ts: ago(29), by: 'u-co', action: 'Changed condition', object: fpq, detail: 'serviceable → quarantined · Form 1 serial does not match data plate' },
      { ts: ago(18), by: 'u-pm', action: 'Approved purchase order', object: 'PO-7001', detail: 'Second-level approval · USD 62,000' },
      { ts: ago(3), by: 'u-ad', action: 'Assigned location scope', object: 'J. Patel', detail: 'LHR → LHR, DXB' }
    ];
    return { events: ev, seq: n, requests, pos, audit, recDecisions: {}, tasks: [], limit: 5000, pendingLimit: null, nextPo: 7005, nextTrf: 433, nextReq: 3303 };
  };
})();
