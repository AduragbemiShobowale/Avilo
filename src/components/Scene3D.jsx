import { useEffect, useRef } from 'react'
import { mountGlobe, mountPlane } from '../lib/scenes'

// React wrappers around the three.js scenes. The scene mounts once and is
// updated in place, so live data never rebuilds the WebGL context.
export function Globe({ data, onStation, height = 520, children }) {
  const el = useRef(null)
  const api = useRef(null)
  const cb = useRef(onStation)
  cb.current = onStation
  useEffect(() => {
    api.current = mountGlobe(el.current, { data, onStation: (c) => cb.current && cb.current(c) })
    return () => api.current.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (api.current && data) api.current.update(data) }, [data])
  return <div className="radar" ref={el} style={{ height }}>{children}</div>
}

export function Plane({ zone, color, label, kind, height = 440, children }) {
  const el = useRef(null)
  const api = useRef(null)
  useEffect(() => {
    api.current = mountPlane(el.current, { zone, color, label, kind })
    return () => api.current.destroy()
  }, [zone]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (api.current) api.current.focus(zone, color, label, kind) }, [zone, color, label, kind])
  return <div className="radar" ref={el} style={{ height }}>{children}</div>
}
