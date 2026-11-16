import { useEffect, useMemo, useState } from 'react'
import AV from '../../lib/engine'
import { useLive } from '../../context/LiveContext'
import { supabase, rpc } from '../../lib/supabase'
import { PageHead, Card, Empty, Tile, Chip, part, uname } from '../../components/ui'
import { fDT, downloadCsv } from '../../lib/format'
import { parseErp, reconcile, toNavisionCsv } from '../../lib/erp'

// ERP stock extracts in, reconciliation against the ledger out.
export default function ErpImport() {
  const { S, reload } = useLive()
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [system, setSystem] = useState('Navision')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const batches = S.erpBatches.slice().sort((a, b) => b.id - a.id)
  const [batch, setBatch] = useState(batches[0]?.id || null)
  const [records, setRecords] = useState(null)
  const [onlyDiff, setOnlyDiff] = useState(true)
  const parsed = useMemo(() => (text ? parseErp(text) : null), [text])

  useEffect(() => { if (!batch && batches[0]) setBatch(batches[0].id) }, [batches.length])
  useEffect(() => {
    if (!batch) return
    let alive = true
    supabase.from('erp_records').select('pn,station,qty').eq('batch', batch).then(({ data }) => alive && setRecords(data || []))
    return () => { alive = false }
  }, [batch])

  const rows = records ? reconcile(S.items, records, AV.stations.map((s) => s.code)) : []
  const mism = rows.filter((r) => r.status !== 'Match')
  const shown = onlyDiff ? mism : rows
  const b = batches.find((x) => x.id === batch)

  const onFile = async (f) => { if (!f) return; setName(f.name); setText(await f.text()) }
  const doImport = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await rpc('import_erp', { p_filename: name || 'pasted extract', p_system: system, p_rows: parsed.rows.map(({ pn, station, qty, bin }) => ({ pn, station, qty: String(qty), bin })) })
      setMsg({ ok: true, text: `Imported ${r.accepted} lines as ERP-${r.batch}.${r.rejected.length ? ` ${r.rejected.length} rejected: ${r.rejected.slice(0, 3).map((x) => `line ${x.line} ${x.reason}`).join('; ')}.` : ''}` })
      setText(''); setName(''); await reload(); setBatch(r.batch)
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  return (
    <>
      <PageHead title="ERP reconciliation" sub="Import a stock-on-hand extract from the ERP and compare it, line by line, with what the ledger says is on the shelf.">
        <button className="btn" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toNavisionCsv(S.items)], { type: 'text/csv' })); a.download = 'avilo_stock_navision_format.csv'; a.click() }}>Download ledger in ERP format</button>
      </PageHead>

      <div className="split">
        <Card title="Import an extract">
          <p className="note">Comma, semicolon or tab separated, with a header row. Columns are recognised by name: part (<span className="mono">Item No.</span>, <span className="mono">Part Number</span>, <span className="mono">P/N</span>), location (<span className="mono">Location Code</span>, <span className="mono">Station</span>) and quantity (<span className="mono">Quantity</span>, <span className="mono">Inventory</span>). Several bins for the same part and location are added together.</p>
          <div className="stack">
            <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => onFile(e.target.files[0])} aria-label="Choose extract file" />
            <textarea className="inp mono" rows={5} placeholder={'Item No.;Location Code;Quantity\nEO-2380-QT;LHR;130'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Or paste the extract" />
            <div className="row">
              <label className="small muted">Source system <select className="inp auto" value={system} onChange={(e) => setSystem(e.target.value)}><option>Navision</option><option>Business Central</option><option>AMOS</option><option>TRAX</option><option>SAP</option><option>Spreadsheet</option></select></label>
              <span className="spacer" />
              <button className="btn primary" disabled={!parsed || !parsed.rows.length || busy} onClick={doImport}>{busy ? 'Importing…' : `Import ${parsed?.rows.length || 0} lines`}</button>
            </div>
            {parsed && parsed.errors.length > 0 && <div className="notice bad small">{parsed.errors.slice(0, 5).join(' ')}{parsed.errors.length > 5 ? ` …and ${parsed.errors.length - 5} more.` : ''}</div>}
            {msg && <div className={`notice ${msg.ok ? '' : 'bad'} small`}>{msg.text}</div>}
          </div>
        </Card>
        <Card title="Imports">
          <div className="list">
            {batches.map((x) => (
              <button key={x.id} className={`li click ${x.id === batch ? 'sel' : ''}`} onClick={() => setBatch(x.id)}>
                <div className="grow"><b>ERP-{x.id} · {x.filename}</b><span className="small muted">{x.system} · {x.rows} lines · {fDT(x.ts)} · {uname(x.by)}{x.rejected.length ? ` · ${x.rejected.length} rejected` : ''}</span></div>
              </button>
            ))}
            {!batches.length && <Empty>No ERP extract imported yet.</Empty>}
          </div>
        </Card>
      </div>

      {b && (
        <Card title={`Ledger vs ERP-${b.id}`} aside={`${b.filename} · imported ${fDT(b.ts)}`}>
          <div className="grid g3">
            <Tile label="Lines compared" value={rows.length} note="Part and station pairs in either source" />
            <Tile label="Mismatches" value={mism.filter((r) => r.status === 'Mismatch').length} note="Both have the line, quantities differ" />
            <Tile label="Missing from ERP" value={mism.filter((r) => r.status === 'Not in ERP').length} note="The ledger has stock the ERP does not list" />
          </div>
          <div className="row">
            <label className="small"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Show differences only</label>
            <span className="spacer" />
            <button className="btn" onClick={() => downloadCsv(`reconciliation_ERP-${b.id}.csv`, rows.map((r) => ({ pn: r.pn, part: part(r.pn).name, station: r.station, ledger: r.ledger, erp: r.erp ?? '', difference: r.diff ?? '', status: r.status })))}>Export CSV</button>
          </div>
          {!records ? <p className="small muted">Loading…</p> : shown.length ? (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Part</th><th>P/N</th><th>Station</th><th className="num">Ledger</th><th className="num">ERP</th><th className="num">Difference</th><th>Status</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.pn + r.station}>
                      <td>{part(r.pn).name}</td><td className="mono small">{r.pn}</td><td>{r.station}</td>
                      <td className="num mono">{r.ledger}</td><td className="num mono">{r.erp ?? '–'}</td>
                      <td className="num mono">{r.diff == null ? '–' : (r.diff > 0 ? '+' : '') + r.diff}</td>
                      <td>{r.status === 'Match' ? <Chip k="serviceable">Match</Chip> : <Chip k="exception">{r.status}</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>The ERP and the ledger agree on every line.</Empty>}
          <p className="note">A positive difference means the ERP shows more than the ledger: typically an issue or transfer recorded in Avilo but not yet in the ERP, or a lost unit. Investigate each line before correcting either system.</p>
        </Card>
      )}
    </>
  )
}
