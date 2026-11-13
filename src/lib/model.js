// Avilo master data: stations, suppliers, fleet, part master and 104 weeks of demand history.
// Everything here is SIMULATED and fictional. The live stock ledger lives in Supabase.
const AV = {}
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

AV.users = []
AV.userBy = {}

export default AV
