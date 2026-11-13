import { useEffect } from 'react'
import AV from '../lib/engine'
import { age } from '../lib/format'

// Status is always colour + icon + words, so it survives monochrome print and colour blindness.
const CHIP = {
  serviceable: ['ok', <path d="M3 8.5l3 3 7-7" />, 'Serviceable'],
  transit: ['warn', <path d="M2 8h11M9 4l4 4-4 4" />, 'In transit'],
  overdue: ['warn', <path d="M2 8h11M9 4l4 4-4 4" />, 'Overdue'],
  repairable: ['rep', <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" />, 'Repairable'],
  quarantined: ['bad', <><circle cx="8" cy="8" r="5.5" /><path d="M4.2 11.8l7.6-7.6" /></>, 'Quarantined'],
  aog: ['bad', <><circle cx="8" cy="8" r="5.5" /><path d="M4.2 11.8l7.6-7.6" /></>, 'AOG'],
  unserviceable: ['off', <path d="M4 4l8 8M12 4l-8 8" />, 'Unserviceable'],
  pending: ['off', <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5l2 1.5" /></>, 'Pending inspection'],
  issued: ['loc', <path d="M2 9l12-5-4 10-2-4z" />, 'Fitted'],
  scrapped: ['off', <path d="M4 4l8 8M12 4l-8 8" />, 'Scrapped'],
  reserved: ['loc', <path d="M5 2h6v12l-3-2-3 2z" />, 'Reserved'],
  routine: ['off', <circle cx="8" cy="8" r="2.5" />, 'Routine'],
  approved: ['ok', <path d="M3 8.5l3 3 7-7" />, 'Approved'],
}

export function Chip({ k, children }) {
  const c = CHIP[k] || CHIP.routine
  return (
    <span className={`chip c-${c[0]}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">{c[1]}</svg>
      {children || c[2]}
    </span>
  )
}

export function ItemChip({ it }) {
  if (it.transit) {
    const late = AV.isOverdue(it.transit)
    return <Chip k={late ? 'overdue' : 'transit'}>{late ? `Overdue ${age(it.transit.ts)}` : 'In transit'}</Chip>
  }
  return <Chip k={it.cond} />
}

export const PageHead = ({ title, sub, children }) => (
  <div className="head">
    <div className="t"><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
    {children && <div className="row">{children}</div>}
  </div>
)

export const Tile = ({ label, value, note, tone }) => (
  <div className="tile">
    <span className="label">{label}</span>
    <span className="v">{value}</span>
    {note && <span className={`n ${tone ? 't-' + tone : ''}`}>{note}</span>}
  </div>
)

export const Card = ({ title, aside, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || aside) && <div className="ch">{title && <h2>{title}</h2>}{aside && <span className="small muted">{aside}</span>}</div>}
    {children}
  </section>
)

export const Empty = ({ children }) => <div className="empty">{children}</div>

export const Loading = () => (
  <div className="loading" role="status"><span className="spinner" /> Loading the ledger…</div>
)

export const part = (pn) => AV.partBy[pn]
export const uname = (id) => (AV.userBy[id] ? AV.userBy[id].name : 'System')

// A confirmation dialog. Escape or the backdrop closes it.
export function Modal({ title, children, onClose, actions }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}
