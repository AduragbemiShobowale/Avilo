import { useEffect, useState } from 'react'
import AV from '../../lib/engine'
import { PageHead, Card, Chip, Loading } from '../../components/ui'
import { usdK } from '../../lib/format'

const cache = {}
const RUNS = 20

// Runs 20 simulated years per policy without blocking the page.
function useRuns(shift) {
  const [runs, setRuns] = useState(cache[shift] || null)
  useEffect(() => {
    if (cache[shift]) { setRuns(cache[shift]); return }
    setRuns(null)
    let alive = true
    const out = []
    const step = () => {
      if (!alive) return
      out.push(AV.simAll(AV.SEED + out.length, { shift }))
      if (out.length < RUNS) setTimeout(step, 0)
      else { cache[shift] = out; setRuns(out) }
    }
    setTimeout(step, 30)
    return () => { alive = false }
  }, [shift])
  return runs
}

const ROWS = [
  ['Critical stockouts (A and B parts)', 'critical', (v) => v.toFixed(1), true],
  ['All stockout events', 'stockouts', (v) => v.toFixed(1), true],
  ['Fill rate from stock', 'fillRate', (v) => (v * 100).toFixed(1) + '%', false],
  ['Average inventory value', 'invValue', (v) => usdK(v), true],
  ['Expedite cost (assumed rates)', 'expedite', (v) => usdK(v), true],
  ['Orders placed', 'orders', (v) => v.toFixed(0), null],
]

export default function SimulationLab() {
  const [shift, setShift] = useState(0)
  const runs = useRuns(shift)
  const mean = (k, pol) => runs.reduce((s, r) => s + r[pol][k], 0) / runs.length

  return (
    <>
      <PageHead title="Simulation lab" sub="The same simulated year, run under three policies. Results are simulated: they test the design, not real savings.">
        <button className={`btn ${shift === 0 ? 'primary' : ''}`} onClick={() => setShift(0)}>Stable demand</button>
        <button className={`btn ${shift ? 'primary' : ''}`} onClick={() => setShift(0.3)}>Utilisation +30% from month 4</button>
      </PageHead>
      <div className="grid g3">
        <Card><span className="label">A · Status quo</span><h3>Weekly spreadsheet</h3><p className="note">Planners see stock as of the last weekly update. 6% of issues and transfers are never keyed in. Classic reorder point.</p></Card>
        <Card><span className="label">B · Visibility only</span><h3>Real-time ledger</h3><p className="note">Every movement recorded as it happens. Same classic reorder point as A, so this isolates the value of information.</p></Card>
        <Card><span className="label">C · Full Avilo</span><h3>Ledger plus forecasting</h3><p className="note">Real-time ledger, SBA forecasts, and service level set by part criticality. Re-plans every four weeks.</p></Card>
      </div>
      {!runs ? <Card><Loading /></Card> : (() => {
        const cA = mean('critical', 'A'), cB = mean('critical', 'B'), cC = mean('critical', 'C')
        const red = (1 - cC / cA) * 100, redB = (1 - cB / cA) * 100, max = Math.max(cA, cB, cC)
        return (
          <Card title={`Results · mean of ${RUNS} simulated years · ${shift ? 'utilisation +30% from month 4' : 'stable demand'}`} aside={`4 stations · 17 parts · common random numbers · seeds ${AV.SEED}–${AV.SEED + RUNS - 1}`}>
            <div className="grid g2 top">
              <div className="stack">
                <div className="bars">
                  {[['A · Status quo', cA, ''], ['B · Visibility only', cB, 'b'], ['C · Full Avilo', cC, 'c']].map(([l, v, c]) => (
                    <div className="bar" key={l}><span>{l}</span><span className="track"><span className={`fill ${c}`} style={{ width: `${(v / max) * 100}%` }} /></span><span className="mono num">{v.toFixed(1)}</span></div>
                  ))}
                </div>
                <p className="small muted">Critical stockouts per simulated year</p>
                <div className="why">
                  <b>Proposal hypothesis: at least 30% fewer critical stockouts.</b><br />
                  A → C: <b className="mono">{red.toFixed(0)}%</b> fewer <Chip k={red >= 30 ? 'serviceable' : 'overdue'}>{red >= 30 ? 'Met in this scenario' : 'Not met in this scenario'}</Chip><br />
                  A → B, visibility alone: <b className="mono">{redB.toFixed(0)}%</b> fewer.
                </div>
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Metric</th><th className="num">A</th><th className="num">B</th><th className="num">C</th><th className="num">C vs A</th></tr></thead>
                  <tbody>
                    {ROWS.map(([l, k, f, lowGood]) => {
                      const a = mean(k, 'A'), b = mean(k, 'B'), c = mean(k, 'C'), ch = ((c - a) / a) * 100
                      const good = lowGood == null ? null : lowGood ? ch < 0 : ch > 0
                      return <tr key={k}><td>{l}</td><td className="num mono">{f(a)}</td><td className="num mono">{f(b)}</td><td className="num mono">{f(c)}</td><td className="num mono" style={{ color: good == null ? 'var(--ink-muted)' : good ? 'var(--ok)' : 'var(--bad)' }}>{ch >= 0 ? '+' : ''}{ch.toFixed(0)}%</td></tr>
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="note"><b>How to read this.</b> Most of the gain comes from visibility (A → B): planners stop ordering against stock that is not there. Forecasting (B → C) helps when demand shifts, as in the utilisation scenario, and adds little when demand is stable, because a long-run average is then already a good forecast. Expedite costs use assumed rates of USD 25,000 per A-critical stockout, 6,000 per B and 1,500 per C. False-positive shortage alerts are not computed yet: the alert definition must be agreed first.</p>
          </Card>
        )
      })()}
    </>
  )
}
