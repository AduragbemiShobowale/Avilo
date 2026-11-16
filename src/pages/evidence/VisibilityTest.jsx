import { useEffect, useRef, useState } from 'react'
import AV from '../../lib/engine'
import { useLive } from '../../context/LiveContext'
import { supabase, rpc } from '../../lib/supabase'
import { reconcile } from '../../lib/erp'
import { PageHead, Card, Tile, Chip } from '../../components/ui'
import { downloadCsv } from '../../lib/format'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pct = (y, p) => { const s = y.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null }
const mean = (y) => (y.length ? y.reduce((a, b) => a + b, 0) / y.length : null)
const KEY = 'avilo-h1-manifest'

// H1: are stock changes visible within 5 seconds, and is every seeded discrepancy flagged?
export default function VisibilityTest() {
  const { S, reload } = useLive()
  const latest = useRef(S)
  const waiters = useRef([])
  useEffect(() => {
    latest.current = S
    const ids = new Set(S.events.map((e) => e.dbid))
    waiters.current = waiters.current.filter((w) => { if (ids.has(w.id)) { w.resolve(performance.now()); return false } return true })
  }, [S])

  const [n, setN] = useState(200)
  const [gap, setGap] = useState(600)
  const [runs, setRuns] = useState([])
  const [running, setRunning] = useState(false)
  const stop = useRef(false)

  const runLatency = async () => {
    setRunning(true); stop.current = false
    const out = []
    setRuns([])
    for (let i = 0; i < n && !stop.current; i++) {
      const t0 = performance.now()
      let row
      try {
        const res = await rpc('h1_probe', { p_seq: i })
        const t1 = performance.now()
        const seen = await Promise.race([
          new Promise((resolve) => waiters.current.push({ id: res.id, resolve })),
          sleep(15000).then(() => null),
        ])
        row = { seq: i + 1, event_id: res.id, server_ts: res.ts, write_ms: Math.round(t1 - t0), visible_ms: seen == null ? null : Math.round(seen - t0) }
      } catch (e) { row = { seq: i + 1, event_id: null, server_ts: null, write_ms: null, visible_ms: null, error: e.message } }
      out.push(row); setRuns(out.slice())
      await sleep(gap)
    }
    setRunning(false)
  }

  const vis = runs.map((r) => r.visible_ms).filter((v) => v != null)
  const within5 = vis.filter((v) => v <= 5000).length

  // detection
  const [manifest, setManifest] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) } catch (e) { return null } })
  const [erpRows, setErpRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!manifest) return
    supabase.from('erp_records').select('pn,station,qty').eq('batch', manifest.erpBatch).then(({ data }) => setErpRows(data || []))
  }, [manifest])
  const plant = async () => {
    setBusy(true); setErr(null)
    try { const m = await rpc('seed_h1'); try { localStorage.setItem(KEY, JSON.stringify(m)) } catch (e) { /* private window */ } setManifest(m); await reload() } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  let score = null
  if (manifest && erpRows) {
    const flagged = new Set(AV.transits(S).filter((t) => t.overdue).map((t) => t.trf))
    const mism = reconcile(S.items, erpRows, AV.stations.map((s) => s.code)).filter((r) => r.status === 'Mismatch')
    const mk = new Set(mism.map((r) => r.pn + '|' + r.station))
    const seededErp = new Set(manifest.erp.map((x) => x.pn + '|' + x.station))
    const exc = new Set(S.exceptions.map((x) => x.object))
    score = [
      { kind: 'Lost transfers (sent 80 h ago, never received)', seeded: manifest.lost.length, detected: manifest.lost.filter((t) => flagged.has(t)).length, falseFlags: manifest.normal.filter((t) => flagged.has(t)).length, controls: manifest.normal.length, how: 'Overdue after 72 h' },
      { kind: 'ERP record mismatches', seeded: manifest.erp.length, detected: manifest.erp.filter((x) => mk.has(x.pn + '|' + x.station)).length, falseFlags: [...mk].filter((k) => !seededErp.has(k)).length, controls: erpRows.length - manifest.erp.length, how: 'Line-by-line reconciliation' },
      { kind: 'Stock leaving with no transfer (gate)', seeded: manifest.gates.length, detected: manifest.gates.filter((g) => exc.has(g)).length, falseFlags: null, controls: null, how: 'RFID goods-out read checked against the ledger' },
    ]
  }

  return (
    <>
      <PageHead title="Visibility test" sub="Evidence for H1: how long a stock change takes to reach the screen, and whether every planted discrepancy is caught. Both tests write test data: reset the demo data afterwards." />

      <Card title="1 · Latency" aside="Hypothesis: mean ≤ 5 s">
        <p className="note">Posts small, self-cancelling adjustments on a quarantined test item (<span className="mono">H1-PROBE</span>) through the server, then times how long until the change arrives back through realtime and the screen's data has reloaded. That is the full path a planner depends on.</p>
        <div className="row">
          <label className="small muted">Events <input className="inp auto mono" type="number" min="10" max="500" value={n} onChange={(e) => setN(Number(e.target.value))} disabled={running} /></label>
          <label className="small muted">Gap (ms) <input className="inp auto mono" type="number" min="100" max="5000" value={gap} onChange={(e) => setGap(Number(e.target.value))} disabled={running} /></label>
          <span className="spacer" />
          {running ? <button className="btn danger" onClick={() => { stop.current = true }}>Stop</button> : <button className="btn primary" onClick={runLatency}>Run latency test</button>}
          <button className="btn" disabled={!runs.length} onClick={() => downloadCsv('h1_latency.csv', runs)}>Export CSV</button>
        </div>
        <div className="grid g3">
          <Tile label="Events measured" value={`${runs.length}${running ? ` / ${n}` : ''}`} note={`${runs.length - vis.length} timed out or failed`} />
          <Tile label="Mean · median · 95th" value={vis.length ? `${(mean(vis) / 1000).toFixed(2)} s` : '–'} note={vis.length ? `median ${(pct(vis, 0.5) / 1000).toFixed(2)} s · 95th ${(pct(vis, 0.95) / 1000).toFixed(2)} s · max ${(Math.max(...vis) / 1000).toFixed(2)} s` : 'Not run yet'} />
          <Tile label="Within 5 s" value={vis.length ? `${Math.round(within5 / runs.length * 100)}%` : '–'} note={vis.length ? <Chip k={mean(vis) <= 5000 ? 'serviceable' : 'overdue'}>{mean(vis) <= 5000 ? 'Mean within 5 s' : 'Mean above 5 s'}</Chip> : 'Of all events sent'} />
        </div>
      </Card>

      <Card title="2 · Detection of planted discrepancies" aside="Hypothesis: every seeded lost transfer is flagged">
        <p className="note">Plants 10 transfers that will never be received (sent 80 hours ago), 10 normal transfers as controls (sent 10 hours ago), an ERP extract with 10 deliberately wrong lines, and 5 units read leaving through a goods-out gate with no paperwork. Avilo is then scored on what it flags, using the same rules the screens use.</p>
        <div className="row">
          <button className="btn primary" disabled={busy || !!manifest} onClick={plant}>{busy ? 'Planting…' : 'Plant discrepancies'}</button>
          {manifest && <button className="btn" onClick={() => { try { localStorage.removeItem(KEY) } catch (e) { /* ignore */ } setManifest(null); setErpRows(null) }}>Clear result (after a reset)</button>}
          <span className="spacer" />
          <button className="btn" disabled={!score} onClick={() => downloadCsv('h1_detection.csv', score.map((s) => ({ discrepancy: s.kind, seeded: s.seeded, detected: s.detected, detection_rate: (s.detected / s.seeded).toFixed(3), false_flags: s.falseFlags ?? '', controls: s.controls ?? '', rule: s.how })))}>Export CSV</button>
        </div>
        {err && <div className="notice bad small">{err}</div>}
        {score && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Discrepancy</th><th>Detected by</th><th className="num">Seeded</th><th className="num">Flagged</th><th className="num">Rate</th><th className="num">False flags</th></tr></thead>
              <tbody>
                {score.map((s) => (
                  <tr key={s.kind}>
                    <td>{s.kind}</td><td className="small muted">{s.how}</td>
                    <td className="num mono">{s.seeded}</td><td className="num mono">{s.detected}</td>
                    <td className="num mono">{Math.round(s.detected / s.seeded * 100)}%</td>
                    <td className="num mono">{s.falseFlags == null ? '–' : `${s.falseFlags} of ${s.controls}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
