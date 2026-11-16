import { useEffect, useState } from 'react'
import AV from '../../lib/engine'
import { PageHead, Card, Chip, Loading } from '../../components/ui'
import { usdK } from '../../lib/format'

const cache = {}
const RUNS = 10

// Runs 10 simulated years per policy for one scenario without blocking the page.
function useRuns(scenario) {
  const [runs, setRuns] = useState(cache[scenario] || null)
  useEffect(() => {
    if (cache[scenario]) { setRuns(cache[scenario]); return }
    setRuns(null)
    let alive = true
    const out = []
    const step = () => {
      if (!alive) return
      out.push(AV.simAll(AV.SEED + out.length, { scenario }))
      if (out.length < RUNS) setTimeout(step, 0)
      else { cache[scenario] = out; setRuns(out) }
    }
    setTimeout(step, 30)
    return () => { alive = false }
  }, [scenario])
  return runs
}

const ROWS = [
  ['Critical stockouts (class A and B parts)', 'critical', (v) => v.toFixed(1), true],
  ['  of which class A (no-go rotables)', 'criticalA', (v) => v.toFixed(1), true],
  ['All stockout events', 'stockouts', (v) => v.toFixed(1), true],
  ['Fill rate from stock', 'fillRate', (v) => (v * 100).toFixed(1) + '%', false],
  ['Average inventory value', 'invValue', (v) => usdK(v), true],
  ['False shortage alerts', 'falseAlerts', (v) => v.toFixed(1), true],
  ['Missed shortages (no alert beforehand)', 'missed', (v) => v.toFixed(1), true],
  ['Days from reorder trigger to receipt', 'avgReplenishDays', (v) => v.toFixed(1), true],
  ['Lost transfers flagged by the ledger', 'lostFlagged', (v) => v.toFixed(1), null],
  ['Lateral transfers', 'transfers', (v) => v.toFixed(0), null],
  ['Purchase orders placed', 'orders', (v) => v.toFixed(0), null],
]

const SCEN_NOTE = {
  normal: 'A normal year: demand follows flight hours and the check calendar.',
  aog: 'Removals of class-A rotables run at four times the normal rate across the network for 30 days.',
  delay: 'Halcyon (SUP-1), supplier of 9 of the 17 parts, takes 2.5 times its usual lead time for 90 days.',
  lost: 'A quarter of lateral transfers are misrouted and do not arrive until they are traced or counted.',
}

export default function SimulationLab() {
  const [scenario, setScenario] = useState('normal')
  const runs = useRuns(scenario)
  const mean = (k, pol) => runs.reduce((s, r) => s + r[pol][k], 0) / runs.length
  const pct = (k, a, b) => { const x = mean(k, a); return x ? ((mean(k, b) - x) / x) * 100 : 0 }

  return (
    <>
      <PageHead title="Simulation lab" sub="The same simulated year, run under three policies. Results are simulated: they test the design, not real savings.">
        {Object.entries(AV.SCENARIOS).map(([k, v]) => <button key={k} className={`btn ${scenario === k ? 'primary' : ''}`} onClick={() => setScenario(k)}>{v.label}</button>)}
      </PageHead>
      <div className="grid g3">
        <Card><span className="label">A · Reorder-point baseline</span><h3>How it is done today</h3><p className="note">Reorder point from the average and spread of past demand, set as an ERP would. Records updated weekly, 6% of issues never keyed in, transfers invisible until received, counted once a quarter.</p></Card>
        <Card><span className="label">B · Visibility only</span><h3>Real-time ledger</h3><p className="note">Every movement recorded as it happens; transfers overdue after 72 hours are flagged. Same reorder point as A, so A → B isolates the value of information.</p></Card>
        <Card><span className="label">C · Avilo framework</span><h3>Ledger plus forecasting</h3><p className="note">Each part classed by demand pattern and forecast with SES, SBA or TSB; adjusted for planned flight hours; check-kit demand added from the check calendar; supplier lead time taken from observed deliveries.</p></Card>
      </div>
      {!runs ? <Card><Loading /></Card> : (() => {
        const cA = mean('critical', 'A'), cB = mean('critical', 'B'), cC = mean('critical', 'C'), max = Math.max(cA, cB, cC, 1e-9)
        const h4 = -pct('critical', 'A', 'C'), h2 = -pct('falseAlerts', 'A', 'C'), miss = pct('missed', 'A', 'C')
        return (
          <Card title={`Results · mean of ${RUNS} simulated years · ${AV.SCENARIOS[scenario].label}`} aside={`4 stations · 17 parts · 90-day warm-up · common random numbers · seeds ${AV.SEED}–${AV.SEED + RUNS - 1}`}>
            <p className="small muted">{SCEN_NOTE[scenario]}</p>
            <div className="grid g2 top">
              <div className="stack">
                <div className="bars">
                  {[['A · Baseline', cA, ''], ['B · Visibility only', cB, 'b'], ['C · Framework', cC, 'c']].map(([l, v, c]) => (
                    <div className="bar" key={l}><span>{l}</span><span className="track"><span className={`fill ${c}`} style={{ width: `${(v / max) * 100}%` }} /></span><span className="mono num">{v.toFixed(1)}</span></div>
                  ))}
                </div>
                <p className="small muted">Critical stockouts per simulated year</p>
                <div className="why">
                  <b>H4: at least 30% fewer critical stockouts than the baseline.</b><br />
                  A → C: <b className="mono">{h4.toFixed(0)}%</b> fewer <Chip k={h4 >= 30 ? 'serviceable' : 'overdue'}>{h4 >= 30 ? 'Target met in this sample' : 'Target not met in this sample'}</Chip><br />
                  of which visibility alone (A → B): <b className="mono">{(-pct('critical', 'A', 'B')).toFixed(0)}%</b>; forecasting on top (B → C): <b className="mono">{(-pct('critical', 'B', 'C')).toFixed(0)}%</b>.
                </div>
                <div className="why">
                  <b>H2: at least 15% fewer false shortage alerts, with no more missed shortages.</b><br />
                  False alerts A → C: <b className="mono">{h2.toFixed(0)}%</b> fewer; missed shortages: <b className="mono">{miss >= 0 ? '+' : ''}{miss.toFixed(0)}%</b> <Chip k={h2 >= 15 && miss <= 0 ? 'serviceable' : 'overdue'}>{h2 >= 15 && miss <= 0 ? 'Target met in this sample' : 'Target not met in this sample'}</Chip>
                </div>
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Metric</th><th className="num">A</th><th className="num">B</th><th className="num">C</th><th className="num">C vs A</th></tr></thead>
                  <tbody>
                    {ROWS.map(([l, k, f, lowGood]) => {
                      const a = mean(k, 'A'), b = mean(k, 'B'), c = mean(k, 'C'), ch = a ? ((c - a) / a) * 100 : 0
                      const good = lowGood == null ? null : lowGood ? ch < 0 : ch > 0
                      return <tr key={k}><td>{l}</td><td className="num mono">{f(a)}</td><td className="num mono">{f(b)}</td><td className="num mono">{f(c)}</td><td className="num mono" style={{ color: good == null ? 'var(--ink-muted)' : good ? 'var(--ok)' : 'var(--bad)' }}>{a ? (ch >= 0 ? '+' : '') + ch.toFixed(0) + '%' : '–'}</td></tr>
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="note"><b>How to read this.</b> A shortage alert is raised when a policy expects that what it can see on the shelf, plus what it expects to arrive within the lead time, will not cover its own forecast of demand. The alert is false if no shortage would have happened anyway; a shortage is missed if no alert came in the lead time before it. This page runs {RUNS} years in your browser. The thesis figures use 30 replications with 95% confidence intervals (<span className="mono">npm run simulate</span>). Expedite costs use assumed rates: USD 25,000 per class-A stockout, 6,000 per class B and 1,500 per class C.</p>
          </Card>
        )
      })()}
    </>
  )
}
