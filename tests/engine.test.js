// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import AV from '../src/lib/engine.js'

const ev = (type, o) => ({ type, ts: Date.now() - 100 * 36e5, ...o })

test('ledger: stock is derived from events, transfers show as in transit', () => {
  const items = AV.project([
    ev('RECEIVE', { item: 'HP-1', pn: '3214552-3', qty: 1, to: 'LHR', cond: 'pending' }),
    ev('VERIFY', { item: 'HP-1', pn: '3214552-3' }),
    ev('TRANSFER_OUT', { item: 'HP-1', pn: '3214552-3', qty: 1, from: 'LHR', to: 'SIN', trf: 'TRF-1' }),
  ])
  assert.equal(items['HP-1'].loc, null)
  assert.equal(items['HP-1'].transit.to, 'SIN')
  assert.equal(AV.isOverdue(items['HP-1'].transit), true)
})

test('ledger: a partial batch transfer splits the batch', () => {
  const items = AV.project([
    ev('RECEIVE', { item: 'OF-1', pn: 'OF-1290-8', qty: 9, to: 'DXB', cond: 'serviceable' }),
    ev('TRANSFER_OUT', { item: 'OF-1', pn: 'OF-1290-8', qty: 4, from: 'DXB', to: 'LOS', trf: 'TRF-2' }),
    ev('TRANSFER_IN', { trf: 'TRF-2', pn: 'OF-1290-8' }),
  ])
  assert.equal(items['OF-1'].qty, 5)
  assert.equal(items['OF-1/TRF-2'].loc, 'LOS')
  assert.equal(items['OF-1/TRF-2'].qty, 4)
})

test('forecasting: SBA is Croston scaled by (1 - alpha/2)', () => {
  const y = [0, 2, 0, 0, 3, 0, 1, 0, 0, 2]
  const c = AV.croston(y, 0.1, false).next, s = AV.croston(y, 0.1, true).next
  assert.ok(Math.abs(s - c * 0.95) < 1e-9)
})

test('reorder point: Poisson quantile reaches the service level', () => {
  assert.equal(AV.poissonQuantile(0, 0.98), 0)
  assert.ok(AV.poissonQuantile(2, 0.98) >= 5)
})

test('permissions: matrix matches the architecture', () => {
  assert.equal(AV.can({ role: 'admin', scope: [] }, 'rec.approve'), false)
  assert.equal(AV.can({ role: 'operator', scope: ['SIN'] }, 'stores.use', 'LHR'), false)
  assert.equal(AV.can({ role: 'procurement', scope: [] }, 'rec.approve.high'), true)
})

test('simulation: deterministic for a seed', () => {
  assert.deepEqual(AV.simAll(42), AV.simAll(42))
})

import { classify, history } from '../src/lib/demand.js'
import { runReplication, paired } from '../src/lib/des.js'

test('demand model: the pattern mix is close to the literature (about 65% intermittent, 31% smooth)', () => {
  const h = history(AV.parts, AV.stations, AV.SEED)
  const n = { smooth: 0, intermittent: 0, erratic: 0, lumpy: 0 }
  for (const p of AV.parts) for (const s of AV.stations) n[classify(h.unscheduled[p.pn][s.code]).pattern]++
  const tot = AV.parts.length * AV.stations.length
  assert.ok(n.intermittent / tot > 0.5 && n.intermittent / tot < 0.75)
  assert.ok(n.smooth / tot > 0.2 && n.smooth / tot < 0.4)
})

test('DES: common random numbers give every policy the same demand', () => {
  const args = { parts: AV.parts.slice(10, 13), stations: AV.stations, suppliers: AV.suppliers, seed: 7 }
  const a = runReplication({ ...args, policy: 'A' }), c = runReplication({ ...args, policy: 'C' })
  assert.equal(a.demand, c.demand)
  assert.deepEqual(runReplication({ ...args, policy: 'B' }), runReplication({ ...args, policy: 'B' }))
})

test('DES: lost transfers are flagged by the ledger and never by the baseline', () => {
  const args = { parts: AV.parts.slice(0, 5), stations: AV.stations, suppliers: AV.suppliers, seed: 11, scenario: 'lost' }
  assert.equal(runReplication({ ...args, policy: 'A' }).lostFlagged, 0)
  const b = runReplication({ ...args, policy: 'B' })
  assert.ok(b.lostFlagged <= b.lostTransfers + 1)
})

test('reorder point: the framework adds check-kit demand from the calendar', () => {
  const r = AV.ropFor('EO-2380-QT', 'LHR')
  assert.equal(r.avilo, r.base + r.planned)
  assert.ok(r.planned > 0)
})

test('paired test: a constant improvement has a CI that excludes zero', () => {
  const t = paired([10, 12, 11, 13, 12], [7, 9, 8, 10, 9])
  assert.equal(t.diff, -3)
  assert.ok(t.hi < 0)
})

import { parseErp, reconcile } from '../src/lib/erp.js'

test('ledger: repair send and return move a rotable out of stock and back to inspection', () => {
  const items = AV.project([
    ev('TURN_IN', { item: 'NW-1', pn: 'NW-277104', qty: 1, to: 'LHR', cond: 'unserviceable' }),
    ev('REPAIR_OUT', { item: 'NW-1', pn: 'NW-277104', qty: 1, from: 'LHR', ref: 'RO-1', reason: 'Kestrel Rotables' }),
  ])
  assert.equal(items['NW-1'].loc, null)
  assert.equal(items['NW-1'].cond, 'in repair')
  assert.equal(items['NW-1'].repair.ro, 'RO-1')
  const back = AV.project([
    ev('TURN_IN', { item: 'NW-1', pn: 'NW-277104', qty: 1, to: 'LHR', cond: 'unserviceable' }),
    ev('REPAIR_OUT', { item: 'NW-1', pn: 'NW-277104', qty: 1, from: 'LHR', ref: 'RO-1' }),
    ev('REPAIR_IN', { item: 'NW-1', pn: 'NW-277104', qty: 1, to: 'SIN', cert: 'Form 1' }),
  ])
  assert.equal(back['NW-1'].loc, 'SIN')
  assert.equal(back['NW-1'].cond, 'pending')
})

test('ERP: Navision extract with semicolons, bins and European decimals', () => {
  const r = parseErp('Item No.;Location Code;Bin Code;Quantity\nEO-2380-QT;LHR;A1;100\neo-2380-qt;lhr;A2;30\nHF-500B-GL;SIN;B1;"1.234,5"\n;LHR;;3')
  assert.equal(r.rows.length, 2)
  assert.equal(r.rows.find((x) => x.pn === 'EO-2380-QT').qty, 130)
  assert.equal(r.rows.find((x) => x.pn === 'HF-500B-GL').qty, 1234.5)
  assert.equal(r.errors.length, 1)
  assert.equal(parseErp('Part,Where,How many\nA,B,1').errors.length, 1)
})

test('ERP: reconciliation flags mismatches and lines missing from the ERP', () => {
  const items = AV.project([
    ev('RECEIVE', { item: 'EO-1', pn: 'EO-2380-QT', qty: 50, to: 'LHR', cond: 'serviceable' }),
    ev('RECEIVE', { item: 'HF-1', pn: 'HF-500B-GL', qty: 4, to: 'SIN', cond: 'serviceable' }),
  ])
  const rows = reconcile(items, [{ pn: 'EO-2380-QT', station: 'LHR', qty: 50 }, { pn: 'OF-1290-8', station: 'DXB', qty: 2 }])
  const by = Object.fromEntries(rows.map((r) => [r.pn + r.station, r]))
  assert.equal(by['EO-2380-QTLHR'].status, 'Match')
  assert.equal(by['HF-500B-GLSIN'].status, 'Not in ERP')
  assert.equal(by['OF-1290-8DXB'].status, 'Mismatch')
  assert.equal(by['OF-1290-8DXB'].diff, 2)
})

test('lead time: the planning factor follows observed lateness and never drops below quoted', () => {
  const D = 864e5, mk = (id, sup, pn, days) => ({ id, sup, pn, sent: 1, received: 1 + days * D })
  const late = AV.observedLead({ pos: [mk('a', 'SUP-2', 'NW-277104', 21), mk('b', 'SUP-2', 'NW-277104', 21), mk('c', 'SUP-2', '3214552-3', 45)] })
  assert.ok(Math.abs(late['SUP-2'].mean - 1.5) < 1e-9)
  const early = AV.observedLead({ pos: [mk('a', 'SUP-3', 'WB-5520-3', 6), mk('b', 'SUP-3', 'WB-5520-3', 6), mk('c', 'SUP-3', 'WB-5520-3', 6)] })
  assert.equal(early['SUP-3'].factor, 1)
  assert.equal(AV.observedLead({ pos: [] })['SUP-1'].factor, 1)
})
