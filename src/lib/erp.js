// ERP stock extracts: parse and reconcile.
// Accepts the stock-by-location exports most MRO/ERP systems produce (Navision / Business Central
// "Item Ledger by Location", AMOS / TRAX stock lists, a plain spreadsheet): comma, semicolon or tab
// separated, with a header row. Column names are matched loosely; see HEADERS.

const HEADERS = {
  pn: ['no.', 'item no.', 'item no', 'item number', 'part number', 'part no', 'part no.', 'p/n', 'pn', 'material'],
  station: ['location code', 'location', 'station', 'store', 'plant', 'site'],
  qty: ['quantity', 'qty', 'inventory', 'remaining quantity', 'qty on hand', 'on hand', 'stock'],
  bin: ['bin code', 'bin', 'shelf'],
}

function splitLine(line, sep) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === sep) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Parse an extract. Returns { rows: [{ pn, station, qty, bin, line }], errors: [string], columns } */
export function parseErp(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['The file needs a header row and at least one data row.'], columns: {} }
  const head = lines[0]
  const sep = [';', '\t', ','].sort((a, b) => head.split(b).length - head.split(a).length)[0]
  const cols = splitLine(head, sep).map((h) => h.toLowerCase())
  const idx = {}
  for (const [k, names] of Object.entries(HEADERS)) idx[k] = cols.findIndex((c) => names.includes(c))
  const missing = ['pn', 'station', 'qty'].filter((k) => idx[k] < 0)
  if (missing.length) return { rows: [], errors: [`Could not find a column for: ${missing.join(', ')}. Expected e.g. "Item No.", "Location Code", "Quantity".`], columns: idx }
  const rows = [], errors = []
  lines.slice(1).forEach((l, i) => {
    const f = splitLine(l, sep)
    const raw = (f[idx.qty] || '').replace(/\s/g, '')
    // accept 1,234.5 and 1.234,5
    const num = /,\d{1,2}$/.test(raw) && raw.includes('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
    const qty = Number(num)
    if (!f[idx.pn]) { errors.push(`Line ${i + 2}: no part number.`); return }
    if (!Number.isFinite(qty)) { errors.push(`Line ${i + 2}: quantity "${f[idx.qty]}" is not a number.`); return }
    rows.push({ pn: f[idx.pn].toUpperCase(), station: (f[idx.station] || '').toUpperCase(), qty, bin: idx.bin >= 0 ? f[idx.bin] : null, line: i + 2 })
  })
  // the same part and location on several lines (different bins) is summed, as the ledger has no bins
  const sum = new Map()
  for (const r of rows) { const k = r.pn + '|' + r.station; const x = sum.get(k); if (x) x.qty += r.qty; else sum.set(k, { ...r }) }
  return { rows: [...sum.values()], errors, columns: idx }
}

/** What the ledger says is on the shelf: serviceable and pending-inspection stock, by part and station. */
export function ledgerOnHand(items) {
  const m = new Map()
  for (const it of Object.values(items)) {
    if (!it.loc || !['serviceable', 'pending'].includes(it.cond) || it.qty <= 0 || String(it.id).startsWith('H1-')) continue
    const k = it.pn + '|' + it.loc
    m.set(k, (m.get(k) || 0) + it.qty)
  }
  return m
}

/** Line-by-line comparison of an ERP extract with the ledger. */
export function reconcile(items, records, stations) {
  const led = ledgerOnHand(items), erp = new Map()
  for (const r of records) erp.set(r.pn + '|' + r.station, (erp.get(r.pn + '|' + r.station) || 0) + Number(r.qty))
  const keys = new Set([...led.keys(), ...erp.keys()])
  const out = []
  for (const k of keys) {
    const [pn, station] = k.split('|')
    if (stations && !stations.includes(station)) continue
    const a = led.get(k) || 0, b = erp.has(k) ? erp.get(k) : null
    const diff = b == null ? null : b - a
    out.push({ pn, station, ledger: a, erp: b, diff, status: b == null ? 'Not in ERP' : diff === 0 ? 'Match' : 'Mismatch' })
  }
  return out.sort((x, y) => (x.status === 'Match') - (y.status === 'Match') || x.pn.localeCompare(y.pn) || x.station.localeCompare(y.station))
}

/** The ledger as a Navision-style extract, so the format round-trips. */
export function toNavisionCsv(items) {
  const lines = ['Item No.;Location Code;Quantity']
  for (const [k, q] of [...ledgerOnHand(items).entries()].sort()) { const [pn, st] = k.split('|'); lines.push(`${pn};${st};${q}`) }
  return lines.join('\n') + '\n'
}
