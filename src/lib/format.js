// Aviation-style formatting: 12 NOV 2026, 09:42Z, money in USD.
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export const fDate = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` }
export const fTime = (t) => { const d = new Date(t); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z` }
export const fDT = (t) => `${fDate(t)} ${fTime(t)}`
export const usd = (v) => 'USD ' + Math.round(v).toLocaleString('en-US')
export const usdK = (v) => (v >= 1e6 ? `USD ${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `USD ${Math.round(v / 1e3)}k` : usd(v))
export const age = (t, now = Date.now()) => {
  const h = (now - t) / 36e5
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`
}
export const initials = (s) => (s || '?').replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export const ROLE_LABEL = {
  superadmin: 'Super Admin', admin: 'Admin', operator: 'Stores Operator', technician: 'Technician',
  planner: 'Supply Chain Planner', procurement: 'Procurement Manager', compliance: 'Compliance Officer',
  supplier: 'Supplier',
}

export const EVENT_LABEL = {
  RECEIVE: 'Received', VERIFY: 'Certificate verified', CONDITION: 'Condition changed', TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer received', ISSUE: 'Issued', RESERVE: 'Reserved', RELEASE: 'Reservation released',
  TURN_IN: 'Turned in', ADJUST: 'Adjusted', SCRAP: 'Scrapped', REPAIR_OUT: 'Sent for repair', REPAIR_IN: 'Back from repair',
}

// Save rows as a CSV file in the browser (for evidence exports).
export function downloadCsv(name, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const text = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
