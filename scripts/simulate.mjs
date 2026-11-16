// Chapter 4 simulation runner: npm run simulate [-- --reps 30 --out docs/chapter4/03_simulation]
// Runs every scenario x policy for N replications with common random numbers (replication i uses
// seed BASE + i under every policy and scenario) and writes the raw runs, a summary per cell and
// the paired hypothesis tests. Decision rules are fixed here, before any run, and not tuned afterwards.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AV from '../src/lib/engine.js'
import { runReplication, paired, SCENARIOS, POLICIES } from '../src/lib/des.js'

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const REPS = +arg('reps', 30), BASE = +arg('seed', 20261112), OUT = arg('out', 'docs/chapter4/03_simulation')
const DAYS = 365, WARMUP = 90
const METRICS = ['demand', 'stockouts', 'critical', 'criticalA', 'fillRate', 'invValue', 'orders', 'transfers', 'expedite', 'alerts', 'falseAlerts', 'missed', 'episodes', 'avgReplenishDays', 'lostTransfers', 'lostFlagged']

// Pre-registered decision rules (Chapter 3).
const RULES = {
  H2: 'False-positive shortage alerts (C vs A, normal scenario) fall by >= 15%, the 95% CI of the paired difference lies below zero, and missed shortages do not rise (CI upper bound <= 0).',
  H4: 'Critical-part stockouts (class A or B) fall by >= 30% (C vs A) in the normal scenario, with the 95% CI of the paired difference below zero; reported for every scenario.',
}

mkdirSync(OUT, { recursive: true })
const runs = []
const t0 = Date.now()
for (const sc of Object.keys(SCENARIOS)) for (let i = 0; i < REPS; i++) for (const pol of Object.keys(POLICIES)) {
  const r = runReplication({ parts: AV.parts, stations: AV.stations, suppliers: AV.suppliers, seed: BASE + i, scenario: sc, policy: pol, days: DAYS, warmup: WARMUP })
  runs.push({ scenario: sc, policy: pol, rep: i + 1, seed: BASE + i, ...Object.fromEntries(METRICS.map((k) => [k, r[k]])) })
}
const f = (v) => (typeof v === 'number' ? +v.toFixed(4) : v)
writeFileSync(join(OUT, 'runs.csv'), ['scenario,policy,rep,seed,' + METRICS.join(','), ...runs.map((r) => [r.scenario, r.policy, r.rep, r.seed, ...METRICS.map((k) => f(r[k]))].join(','))].join('\n') + '\n')

const pick = (sc, pol, k) => runs.filter((r) => r.scenario === sc && r.policy === pol).map((r) => r[k])
const mean = (y) => y.reduce((s, v) => s + v, 0) / y.length
const sd = (y) => { const m = mean(y); return Math.sqrt(y.reduce((s, v) => s + (v - m) ** 2, 0) / (y.length - 1)) }
const summary = []
for (const sc of Object.keys(SCENARIOS)) for (const pol of Object.keys(POLICIES)) for (const k of METRICS) {
  const y = pick(sc, pol, k); summary.push({ scenario: sc, policy: pol, metric: k, mean: mean(y), sd: sd(y), ci95: 2.045 * sd(y) / Math.sqrt(y.length) })
}
writeFileSync(join(OUT, 'summary.csv'), ['scenario,policy,metric,mean,sd,ci95', ...summary.map((s) => [s.scenario, s.policy, s.metric, f(s.mean), f(s.sd), f(s.ci95)].join(','))].join('\n') + '\n')

const tests = []
for (const sc of Object.keys(SCENARIOS)) for (const [a, b] of [['A', 'C'], ['A', 'B'], ['B', 'C']]) for (const k of METRICS) {
  const t = paired(pick(sc, a, k), pick(sc, b, k)); tests.push({ scenario: sc, from: a, to: b, metric: k, ...t })
}
writeFileSync(join(OUT, 'paired_tests.csv'), ['scenario,from,to,metric,mean_from,mean_to,diff,ci_lo,ci_hi,pct_change,wilcoxon_p,n', ...tests.map((t) => [t.scenario, t.from, t.to, t.metric, f(t.meanA), f(t.meanB), f(t.diff), f(t.lo), f(t.hi), f(t.pct), f(t.p), t.n].join(','))].join('\n') + '\n')

const T = (sc, k, a = 'A', b = 'C') => tests.find((t) => t.scenario === sc && t.metric === k && t.from === a && t.to === b)
const fp = T('normal', 'falseAlerts'), miss = T('normal', 'missed'), crit = T('normal', 'critical')
const verdict = {
  H2: { falseAlerts: fp, missed: miss, supported: fp.pct <= -15 && fp.hi < 0 && miss.hi <= 0 },
  H4: { critical: crit, supported: crit.pct <= -30 && crit.hi < 0, byScenario: Object.keys(SCENARIOS).map((sc) => ({ scenario: sc, ...T(sc, 'critical') })) },
}
writeFileSync(join(OUT, 'hypotheses.json'), JSON.stringify({ generated: new Date().toISOString(), reps: REPS, baseSeed: BASE, days: DAYS, warmup: WARMUP, rules: RULES, verdict }, null, 2) + '\n')
console.log(`${runs.length} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`)
console.log(`H2 false alerts ${fp.pct.toFixed(1)}% [${fp.lo.toFixed(1)}, ${fp.hi.toFixed(1)}], missed ${miss.pct.toFixed(1)}% -> ${verdict.H2.supported ? 'supported' : 'not supported'}`)
console.log(`H4 critical stockouts ${crit.pct.toFixed(1)}% [${crit.lo.toFixed(1)}, ${crit.hi.toFixed(1)}] -> ${verdict.H4.supported ? 'supported' : 'not supported'}`)
