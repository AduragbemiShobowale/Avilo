// Sensitivity of the H2/H4 results to the baseline's unrecorded-issue rate (normal scenario, 30 replications,
// same seeds). Only policy A uses the rate, so B and C are run once per replication.
// npm run sensitivity [-- --reps 30 --out docs/chapter4/04_sensitivity]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AV from '../src/lib/engine.js'
import { runReplication, paired } from '../src/lib/des.js'
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const REPS = +arg('reps', 30), BASE = +arg('seed', 20261112), OUT = arg('out', 'docs/chapter4/04_sensitivity')
const RATES = [0, 0.02, 0.04, 0.06, 0.08, 0.10]
const run = (seed, policy, missRate) => runReplication({ parts: AV.parts, stations: AV.stations, suppliers: AV.suppliers, seed, policy, scenario: 'normal', overrides: { missRate } })
mkdirSync(OUT, { recursive: true })
const B = [], C = []
for (let i = 0; i < REPS; i++) { B.push(run(BASE + i, 'B', 0.06)); C.push(run(BASE + i, 'C', 0.06)) }
const rows = []
for (const r of RATES) {
  const A = []; for (let i = 0; i < REPS; i++) A.push(run(BASE + i, 'A', r))
  for (const [k, lab] of [['critical', 'Critical stockouts'], ['falseAlerts', 'False shortage alerts'], ['missed', 'Missed shortages'], ['invValue', 'Inventory value'], ['fillRate', 'Fill rate']]) {
    const t = paired(A.map((x) => x[k]), C.map((x) => x[k]))
    rows.push({ unrecorded_issue_rate: r, metric: k, label: lab, baseline_mean: t.meanA, framework_mean: t.meanB, pct_change: t.pct, ci_lo: t.lo, ci_hi: t.hi, p: t.p })
  }
  console.log(`rate ${(r * 100).toFixed(0)}%: critical ${rows.at(-5).pct_change.toFixed(1)}%  false alerts ${rows.at(-4).pct_change.toFixed(1)}%  missed ${rows.at(-3).pct_change.toFixed(1)}%  inventory ${rows.at(-2).pct_change.toFixed(1)}%`)
}
const f = (v) => (typeof v === 'number' ? +v.toFixed(4) : v)
writeFileSync(join(OUT, 'record_error_sensitivity.csv'), [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(f).join(','))].join('\n') + '\n')
