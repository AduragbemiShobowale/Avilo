import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import AV from '../../lib/engine'
import { useLive } from '../../context/LiveContext'
import { Globe } from '../../components/Scene3D'
import { Chip, PageHead, Tile, Card, Empty, part } from '../../components/ui'
import { fDate, fTime, usdK, age, EVENT_LABEL } from '../../lib/format'

// What the globe draws: transfers, inbound supplier orders and a label per station.
export function globeData(S) {
  const transits = AV.transits(S)
  const pos = S.pos.filter((o) => ['Sent', 'Confirmed', 'Shipped'].includes(o.status))
  const stations = {}
  for (const s of AV.stations) {
    let short = 0
    for (const p of AV.parts) if (p.crit !== 'C' && AV.available(S, p.pn, s.code) < AV.ropFor(p.pn, s.code).avilo) short++
    const od = transits.some((t) => t.overdue && t.to === s.code)
    stations[s.code] = { label: short ? `${short} below ROP` : 'Stock OK', alert: short > 0 || od }
  }
  return { transits, pos, stations }
}

export default function ControlTower() {
  const { S, latencies } = useLive()
  const nav = useNavigate()
  const data = useMemo(() => globeData(S), [S])
  const recs = useMemo(() => AV.recommend(S), [S])
  const transits = data.transits
  const od = transits.filter((t) => t.overdue)
  const open = recs.filter((r) => !r.decision || r.decision.status === 'Awaiting second approval')
  const high = open.filter((r) => r.value >= S.limit && !r.aog).length
  const aog = S.requests.filter((q) => q.status === 'Open' && q.priority === 'AOG')
  const pump = S.items['HP-10482']
  const avgLat = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null

  const showStation = (code) => {
    const st = AV.stations.find((s) => s.code === code)
    const low = AV.parts.filter((p) => p.crit !== 'C' && AV.available(S, p.pn, code) < AV.ropFor(p.pn, code).avilo)
    toast(`${st.name}: ${low.length ? `${low.length} critical parts below reorder point (${low.map((p) => p.name).join(', ')})` : 'all critical parts at or above reorder point'}.`, { duration: 6000 })
  }

  return (
    <>
      <PageHead title="Control tower" sub="Every station, every part in transit, every order in flight.">
        <Link className="btn" to="/lab">See the evidence</Link>
      </PageHead>

      <div className="grid g4">
        <Tile label="Parts in transit" value={transits.length} tone={od.length ? 'warn' : ''} note={od.length ? <><b>{od.length} overdue</b> · window {AV.OVERDUE_HOURS} h</> : `All within ${AV.OVERDUE_HOURS} h window`} />
        <Tile label="Open recommendations" value={open.length} note={high ? <><b>{high}</b> at or above {usdK(S.limit)} limit</> : 'None above the approval limit'} />
        <Tile label="AOG requests open" value={aog.length} tone={aog.length ? 'bad' : 'ok'} note={<b>{aog.length ? aog.map((q) => `${q.aircraft} at ${q.station}`).join(', ') : 'No aircraft on ground'}</b>} />
        <Tile label="Inventory value" value={usdK(AV.inventoryValue(S)).replace('USD ', '')} note="USD, all stations and in transit" />
      </div>

      <div className="split">
        <div className="stack">
          <Globe data={data} onStation={showStation} height={540}>
            <div className="cap"><h2>Network</h2><span className="s">Drag to turn. Select a station for its stock.</span></div>
            <div className="legend">
              <span><i style={{ background: 'var(--locator)' }} />Station</span>
              <span><i style={{ background: '#F0A73A' }} />Transfer in transit</span>
              <span><i className="dotl" style={{ background: '#F0A73A' }} />Overdue, stuck</span>
              <span><i style={{ background: 'var(--locator)', opacity: 0.6 }} />Supplier order inbound</span>
            </div>
          </Globe>

          {pump && (
            <Card title={<>Where is hydraulic pump <span className="mono">HP-10482</span>?</>} aside={<Link to="/history?id=HP-10482">Full history</Link>}>
              <div className="vs">
                <div className="side-a">
                  <span className="label">Weekly spreadsheet, last updated Monday</span>
                  <span className="big">1 in stock at LHR</span>
                  <span className="small muted">The transfer to Singapore was never keyed in. Planners order against this number.</span>
                </div>
                <span className="arrow">vs</span>
                <div className="side-b">
                  <span className="label">Avilo ledger, live</span>
                  {pump.transit ? (
                    <>
                      <span className="big">In transit LHR → SIN</span>
                      <span>Sent {fDate(pump.transit.ts)} under {pump.transit.trf}. <Chip k="overdue">Overdue {age(pump.transit.ts)}</Chip></span>
                      <span className="small muted">Not counted as stock anywhere until Singapore stores confirms receipt.</span>
                    </>
                  ) : (
                    <>
                      <span className="big">{AV.condLabel(pump.cond)} at {pump.loc || pump.onAircraft}</span>
                      <span className="small muted">Receipt confirmed. The C-check at LHR can be served by a transfer back from SIN.</span>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title="Needs attention" aside={`${od.length + S.requests.filter((r) => r.status === 'Open').length} items`}>
            <div className="list">
              {od.map((t) => (
                <div className="li" key={t.trf}>
                  <span className="sev warn" />
                  <div className="grow">
                    <b>{part(t.items[0].pn).name}</b>
                    <span className="small muted"><span className="mono">{t.items[0].id}</span> · {t.from} → {t.to} · sent {fDate(t.ts)}</span>
                    <span><Chip k="overdue">Overdue {age(t.ts)}</Chip></span>
                  </div>
                  <Link className="btn ghost" to={`/history?id=${encodeURIComponent(t.items[0].id)}`}>History</Link>
                </div>
              ))}
              {S.requests.filter((q) => q.status === 'Open').map((q) => (
                <div className="li" key={q.id}>
                  <span className={`sev ${q.priority === 'AOG' ? 'bad' : 'loc'}`} />
                  <div className="grow">
                    <b>{part(q.pn).name} for {q.aircraft}</b>
                    <span className="small muted">{q.id} · {q.station} · {q.note}</span>
                    <span><Chip k={q.priority === 'AOG' ? 'aog' : 'routine'}>{q.priority}</Chip></span>
                  </div>
                  <button className="btn ghost" onClick={() => nav(`/find?pn=${q.pn}`)}>Find</button>
                </div>
              ))}
              {open.length > 0 && (
                <div className="li">
                  <span className="sev loc" />
                  <div className="grow"><b>{open.length} reorder recommendations waiting</b><span className="small muted">Each shows its reason and approval path.</span></div>
                  <Link className="btn ghost" to="/replenishment">Review</Link>
                </div>
              )}
              {!od.length && !open.length && !aog.length && <Empty>Nothing needs attention.</Empty>}
            </div>
          </Card>

          <Card title="Ledger feed" aside={avgLat != null ? <>Scan to every screen: <b className="mono">{avgLat.toFixed(0)} ms</b> · target under 5 s</> : 'Turn on the scanner feed to measure latency'}>
            <div className="list">
              {S.events.slice(-7).reverse().map((e) => (
                <div className="li" key={e.id}>
                  <div className="grow">
                    <span className="small"><b>{EVENT_LABEL[e.type]}</b> · <span className="mono">{e.item || e.trf}</span>{e.qty > 1 ? ` × ${e.qty}` : ''}</span>
                    <span className="small muted">{fTime(e.ts)} · {[e.from, e.to].filter(Boolean).join(' → ')} · {e.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Serviceable stock against reorder point" aside="Critical A and B parts · on hand / reorder point · red below, amber at">
        <div className="tbl-wrap">
          <table className="heat">
            <thead><tr><th>Part</th><th>P/N</th><th>Crit.</th>{AV.stations.map((s) => <th key={s.code} className="num">{s.code}</th>)}</tr></thead>
            <tbody>
              {AV.parts.filter((p) => p.crit !== 'C').map((p) => (
                <tr key={p.pn} className="click" onClick={() => nav(`/find?pn=${p.pn}`)}>
                  <td>{p.name}</td><td className="mono small">{p.pn}</td><td>{p.crit}</td>
                  {AV.stations.map((s) => {
                    const a = AV.available(S, p.pn, s.code), r = AV.ropFor(p.pn, s.code).avilo
                    const inb = transits.filter((t) => t.to === s.code).reduce((n, t) => n + t.items.filter((i) => i.pn === p.pn).reduce((m, i) => m + i.qty, 0), 0)
                    return <td key={s.code} className={`cell ${a < r ? 'low' : a === r ? 'at' : ''}`}>{a} / {r}{inb ? <span title="in transit"> +{inb}</span> : null}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
