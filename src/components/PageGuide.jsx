import { useState } from 'react'
import { PAGE_GUIDE } from '../lib/guide'
import Icon from './icons'

// "About this page": a short, plain explanation at the top of every page.
// Open the first time someone visits a page; after that it stays as they left it.
export default function PageGuide({ id }) {
  const g = PAGE_GUIDE[id]
  const key = 'avilo-guide-' + id
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== 'closed' } catch { return true } })
  if (!g) return null
  const toggle = () => { const n = !open; setOpen(n); try { localStorage.setItem(key, n ? 'open' : 'closed') } catch { /* private mode */ } }
  return (
    <section className={`guide ${open ? 'open' : ''}`}>
      <button className="guide-head" onClick={toggle} aria-expanded={open}>
        <Icon name="info" /><b>About this page</b><span className="muted">{g.what}</span><span className="guide-toggle">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <ul className="guide-body">{g.how.map((h) => <li key={h}>{h}</li>)}</ul>}
    </section>
  )
}
