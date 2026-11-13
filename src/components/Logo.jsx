// The Avilo lockup: an A whose crossbar is the locator dot, and the lowercase wordmark
// whose i-dot is the same dot. `ink` colours the strokes; the dot is always Locator Blue.
export function Symbol({ ink = '#fff', size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke={ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 55 L32 9 L54 55" />
      </g>
      <circle cx="32" cy="43" r="6.4" fill="#1B96D2" />
    </svg>
  )
}

export default function Logo({ ink = '#fff', height = 26 }) {
  return (
    <svg height={height} viewBox="0 0 252 66" role="img" aria-label="Avilo" style={{ display: 'block', width: 'auto' }}>
      <g fill="none" stroke={ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(0 2)"><path d="M10 55 L32 9 L54 55" /></g>
        <g transform="translate(86 0)">
          <circle cx="22" cy="40" r="15.5" /><path d="M37.5 24.5 V55.5" /><path d="M55 24.5 L68 55.5 L81 24.5" />
          <path d="M95 24.5 V55.5" /><path d="M110 4.5 V55.5" /><circle cx="140" cy="40" r="15.5" />
        </g>
      </g>
      <circle cx="32" cy="45" r="6.4" fill="#1B96D2" />
      <circle cx="181" cy="6" r="6.2" fill="#1B96D2" />
    </svg>
  )
}
