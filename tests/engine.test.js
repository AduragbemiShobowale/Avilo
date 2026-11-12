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
