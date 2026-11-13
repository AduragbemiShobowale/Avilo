import { useEffect, useState } from 'react'

// The Avilo opening sequence, built from the logo itself:
// a radar sweep wakes up, the two strokes of the A draw in like approach paths, the locator dot
// drops into the A and pings, a second dot arcs across to become the dot on the i, the wordmark
// writes itself, runway lights chase underneath, and the screen opens from the centre.
// It plays once per browser session; later loads show only a short pulse while data loads.
const FULL_MS = 3000

export const introDone = () => { try { return sessionStorage.getItem('avilo-intro') === '1' } catch { return true } }

export default function Intro({ ready, onDone }) {
  const [quick] = useState(introDone)
  const [phase, setPhase] = useState('play')
  const minMs = quick ? 450 : window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 900 : FULL_MS

  useEffect(() => {
    const id = setTimeout(() => setPhase((p) => (p === 'play' ? 'wait' : p)), minMs)
    return () => clearTimeout(id)
  }, [minMs])
  useEffect(() => {
    if (phase !== 'wait' || !ready) return
    setPhase('out')
    try { sessionStorage.setItem('avilo-intro', '1') } catch { /* private mode */ }
    window.__aviloIntroDone = true
    window.dispatchEvent(new Event('avilo:intro-done'))
  }, [phase, ready])
  // Remove the intro once the opening animation has finished.
  useEffect(() => {
    if (phase !== 'out') return
    const id = setTimeout(onDone, 750)
    return () => clearTimeout(id)
  }, [phase, onDone])

  return (
    <div className={`intro ${quick ? 'quick' : ''} ${phase === 'out' ? 'out' : ''}`} role="status" aria-label="Loading Avilo">
      <div className="intro-radar" aria-hidden="true"><i /><i /><i /><b /></div>
      <svg className="intro-logo" viewBox="-6 -8 264 82" aria-hidden="true">
        <g className="strokes" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
          <path className="d a-left" pathLength="1" d="M10 57 L32 11" />
          <path className="d a-right" pathLength="1" d="M54 57 L32 11" />
          <g transform="translate(86 0)">
            <circle className="d w1" pathLength="1" cx="22" cy="40" r="15.5" />
            <path className="d w1" pathLength="1" d="M37.5 24.5 V55.5" />
            <path className="d w2" pathLength="1" d="M55 24.5 L68 55.5 L81 24.5" />
            <path className="d w3" pathLength="1" d="M95 24.5 V55.5" />
            <path className="d w4" pathLength="1" d="M110 4.5 V55.5" />
            <circle className="d w5" pathLength="1" cx="140" cy="40" r="15.5" />
          </g>
        </g>
        <circle className="ping" cx="32" cy="45" r="6.4" />
        <circle className="ping p2" cx="32" cy="45" r="6.4" />
        <circle className="dot-a" cx="32" cy="45" r="6.4" />
        <circle className="dot-i" cx="181" cy="6" r="6.2" />
      </svg>
      <p className="intro-tag">Every aircraft part, located.</p>
      <div className="intro-runway" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
    </div>
  )
}
