import { useState } from 'react'
import AV from '../../lib/engine'
import { PageHead, Card, Chip, Tile } from '../../components/ui'

function Chart({ y, f, next }) {
  const W = 760, H = 240, ml = 34, mr = 16, mt = 12, mb = 26, iw = W - ml - mr, ih = H - mt - mb
  const max = Math.max(1, ...y, next) * 1.1, bw = iw / (y.length + 1)
  const Y = (v) => mt + ih - (v / max) * ih
  const step = max > 10 ? Math.ceil(max / 4 / 5) * 5 : max > 4 ? 2 : 1
  const ticks = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  let d = ''
  f.forEach((v, i) => { if (!isNaN(v)) d += `${d ? 'L' : 'M'}${(ml + i * bw + bw / 2).toFixed(1)} ${Y(v).toFixed(1)}` })
  d += `L${(ml + y.length * bw + bw / 2).toFixed(1)} ${Y(next).toFixed(1)}`
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly demand with SBA forecast">
      <rect x={ml + 78 * bw} y={mt} width={26 * bw} height={ih} style={{ fill: 'var(--locator-tint)' }} />
      {ticks.map((v) => <g key={v}><line x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} style={{ stroke: 'var(--line)' }} /><text x={ml - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
      {y.map((v, i) => v > 0 && <rect key={i} x={ml + i * bw + bw * 0.15} y={Y(v)} width={bw * 0.7} height={Y(0) - Y(v)} rx="1" style={{ fill: 'var(--off)', opacity: 0.55 }} />)}
      <path d={d} style={{ fill: 'none', stroke: 'var(--locator)', strokeWidth: 2 }} />
      <circle cx={ml + y.length * bw + bw / 2} cy={Y(next)} r="4.5" style={{ fill: 'var(--locator)' }} />
      {[0, 26, 52, 78, 103].map((i) => <text key={i} x={ml + i * bw + bw / 2} y={H - 8} textAnchor="middle">{i === 103 ? 'last wk' : `wk ${i + 1}`}</text>)}
    </svg>
  )
}

export default function Forecasts() {
  const [pn, setPn] = useState('3214552-3')
  const [st, setSt] = useState('LHR')
  const p = AV.partBy[pn], y = AV.history[pn][st]
  const m = { Mean: AV.movingMean(y), Croston: AV.croston(y, 0.1, false), SBA: AV.croston(y, 0.1, true), TSB: AV.tsb(y, 0.1, 0.1) }
  const ev = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, AV.evaluate(y, v.fitted, 78)]))
  const best = Object.entries(ev).sort((a, b) => a[1].mae - b[1].mae)[0][0]
  const r = AV.ropFor(pn, st)
  const zeros = y.filter((v) => v === 0).length

  return (
    <>
      <PageHead title="Forecasts" sub="Spare-parts demand is sparse and lumpy. Avilo uses intermittent-demand methods and always shows the classic baseline beside them.">
        <select className="inp auto" value={pn} onChange={(e) => setPn(e.target.value)} aria-label="Part">{AV.parts.map((x) => <option key={x.pn} value={x.pn}>{x.name}</option>)}</select>
        <select className="inp auto" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Station">{AV.stations.map((s) => <option key={s.code}>{s.code}</option>)}</select>
      </PageHead>
      <Card title={`${p.name} at ${st}, weekly demand`} aside={`104 weeks · ${zeros} with zero demand · shaded weeks are the hold-out test`}>
        <Chart y={y} f={m.SBA.fitted} next={m.SBA.next} />
        <div className="row small muted">
          <span><i className="key bar" /> Demand</span><span><i className="key line" /> SBA forecast</span>
          <span>Next week: <b className="mono">{m.SBA.next.toFixed(2)}</b> {p.unit}</span>
        </div>
      </Card>
      <div className="grid g2 top">
        <Card title="Method comparison">
          <p className="note">One-step-ahead error over the last 26 weeks. Lower is better. A method only earns its place if it beats the simple mean.</p>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Method</th><th className="num">Mean abs. error</th><th className="num">Bias</th><th /></tr></thead>
              <tbody>
                {Object.entries(ev).map(([k, v]) => (
                  <tr key={k} className={k === best ? 'sel' : ''}><td><b>{k}</b></td><td className="num mono">{v.mae.toFixed(3)}</td><td className="num mono">{v.bias >= 0 ? '+' : ''}{v.bias.toFixed(3)}</td><td>{k === best && <Chip k="serviceable">Best here</Chip>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Reorder point">
          <div className="grid g2">
            <Tile label="Classic baseline" value={r.classic} note={<><span className="mono">d̄·L + z·σ·√L</span><br />{r.mean.toFixed(2)} × {r.Lw.toFixed(1)} wk + 1.65 × {r.sd.toFixed(2)} × √{r.Lw.toFixed(1)}</>} />
            <Tile label="Avilo" value={r.avilo} note={<>{p.type === 'rotable' ? 'Poisson quantile of SBA demand over lead time' : 'SBA demand over lead time plus safety stock from forecast error'}<br />Service level {Math.round(AV.SERVICE_LEVEL[p.crit] * 100)}% for criticality {p.crit}</>} />
          </div>
          <p className="note">The classic formula assumes normally distributed demand. With {zeros} zero weeks out of 104, it is not. Avilo sets service level by criticality, so an AOG-critical part gets more protection than a reading lamp.</p>
        </Card>
      </div>
    </>
  )
}
