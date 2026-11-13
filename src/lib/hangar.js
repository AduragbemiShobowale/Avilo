// The sign-in scene: Avilo's hangar at night. The doors roll open, the floodlights come on
// one by one, and the camera drifts around the aircraft on its stand while a scanner sweeps
// the parts racks and finds the lost pump. Time is the fourth dimension: nothing is static.
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { buildAircraft } from './aircraft.js'

const LOC = new THREE.Color('#1B96D2')
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

// Painted hangar floor: concrete, the stand box, the taxi line and stencilled lettering.
function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 2048
  const g = c.getContext('2d')
  g.fillStyle = '#1a2230'; g.fillRect(0, 0, 2048, 2048)
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; g.fillRect(Math.random() * 2048, Math.random() * 2048, 2, 2) }
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 3
  for (let i = 0; i <= 2048; i += 256) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 2048); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(2048, i); g.stroke() }
  g.strokeStyle = '#e8b931'; g.lineWidth = 14; g.setLineDash([60, 40])
  g.beginPath(); g.moveTo(0, 1024); g.lineTo(2048, 1024); g.stroke()
  g.setLineDash([]); g.lineWidth = 10; g.strokeStyle = 'rgba(232,185,49,0.85)'; g.strokeRect(330, 560, 1388, 928)
  g.strokeStyle = 'rgba(27,150,210,0.9)'; g.lineWidth = 8; g.beginPath(); g.arc(1024, 1024, 60, 0, Math.PI * 2); g.stroke()
  g.fillStyle = 'rgba(232,185,49,0.9)'; g.font = '700 92px Inter, sans-serif'; g.textAlign = 'center'
  g.fillText('STAND 2', 1024, 1640)
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '600 46px "IBM Plex Mono", monospace'
  g.fillText('AVILO MRO · LHR HANGAR 2 · NO SMOKING', 1024, 470)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Night sky seen through the doors: deep blue gradient with a horizon glow.
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, '#040b18'); gr.addColorStop(0.62, '#0d2a52'); gr.addColorStop(0.8, '#2b5d92'); gr.addColorStop(0.86, '#e0a45e'); gr.addColorStop(0.9, '#0a1a30'); gr.addColorStop(1, '#060f1d')
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// A soft light cone: brightest at the lamp, fading towards the floor and the edges.
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOn: { value: 0 } },
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOn; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(vN, vV)), 1.6); float a = pow(vH, 1.5) * rim * 0.32 * uOn; gl_FragColor = vec4(uColor, a); }',
  })
}

export function mountHangar(el, { onFrame } = {}) {
  if (!webglOK()) { el.classList.add('no-webgl'); return { destroy() {}, start() {} } }
  const still = reduce()
  const small = Math.min(window.innerWidth, window.innerHeight) < 700 // phones: lighter mirror, no shadows
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = !small; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
  el.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#050c18')
  scene.fog = new THREE.FogExp2('#06101f', 0.022)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)

  // ---------- floor: a real mirror under a semi-transparent painted concrete layer ----------
  const mirror = new Reflector(new THREE.PlaneGeometry(60, 60), { textureWidth: small ? 512 : 1024, textureHeight: small ? 512 : 1024, color: 0x6b7a90, clipBias: 0.003 })
  mirror.rotation.x = -Math.PI / 2; scene.add(mirror)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 30), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.15, transparent: true, opacity: 0.86 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true; scene.add(floor)

  // ---------- structure ----------
  const steel = new THREE.MeshStandardMaterial({ color: '#2a3647', roughness: 0.7, metalness: 0.6 })
  const wallMat = new THREE.MeshStandardMaterial({ color: '#1b2940', roughness: 0.9 })
  const W = 15, D = 12, H = 7.5
  for (const x of [-W, W]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, H + 4, 2 * D), wallMat); w.position.set(x, (H + 4) / 2, 0); scene.add(w) }
  // barrel-vault roof: arched trusses with purlins
  for (let x = -W; x <= W + 0.01; x += 3) {
    const curve = new THREE.EllipseCurve(0, H, D, 4.5, 0, Math.PI, false)
    const pts = curve.getPoints(40).map((p) => new THREE.Vector3(x, p.y, p.x))
    const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.09, 6, false), steel); scene.add(arch)
    for (const z of [-D]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.35, H, 0.35), steel); col.position.set(x, H / 2, z); scene.add(col) }
  }
  for (let a = 0.12; a < Math.PI; a += 0.28) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.08, 0.08), steel); p.position.set(0, H + 4.5 * Math.sin(a), D * Math.cos(a)); scene.add(p)
  }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(D, D, 2 * W, 48, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#0b1422', side: THREE.BackSide, roughness: 1 }))
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scale.set(1, 1, 4.5 / D); roof.position.y = H; scene.add(roof)

  // ---------- doors on the back wall, and the night outside ----------
  const doorMat = new THREE.MeshStandardMaterial({ color: '#1b2638', roughness: 0.6, metalness: 0.5 })
  const doors = [], DW = 8
  for (const s of [-1, 1]) {
    const d = new THREE.Group()
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DW, H, 0.25), doorMat); panel.position.x = s * DW / 2; d.add(panel)
    for (let i = 1; i < 6; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(DW, 0.06, 0.32), steel); rib.position.set(s * DW / 2, (i * H) / 6 - H / 2, 0); d.add(rib) }
    d.position.set(0, H / 2, -D - 0.4); d.userData.side = s; scene.add(d); doors.push(d)
    const side = new THREE.Mesh(new THREE.BoxGeometry(W - DW, H, 0.3), wallMat); side.position.set(s * (DW + (W - DW) / 2), H / 2, -D); scene.add(side)
  }
  // LED strips that outline the walls
  const led = new THREE.MeshBasicMaterial({ color: '#7fc3ee' })
  for (const x of [-W + 0.2, W - 0.2]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2 * D), led); st.position.set(x, H - 0.4, 0); scene.add(st) }
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(W - DW, 0.05, 0.05), led); st.position.set(s * (DW + (W - DW) / 2), H - 0.4, -D + 0.2); scene.add(st) }
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2 * DW, 0.12, 0.12), led); doorFrame.position.set(0, H + 0.05, -D + 0.25); scene.add(doorFrame)
  const header = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 4.6, 0.4), wallMat); header.position.set(0, H + 2.3, -D); scene.add(header)
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 50), new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }))
  sky.position.set(0, 14, -60); scene.add(sky)
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(160, 50), new THREE.MeshStandardMaterial({ color: '#0a1220', roughness: 0.9 }))
  apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.02, -37); scene.add(apron)
  // runway and taxiway lights beyond the doors
  const lightPts = []
  for (let i = 0; i < 70; i++) lightPts.push(-70 + i * 2, 0.05, -42, -70 + i * 2.1, 0.05, -50)
  for (let i = 0; i < 24; i++) lightPts.push(-3 + (i % 2) * 6, 0.05, -14 - i * 1.6)
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3))
  const runwayLights = new THREE.Points(lg, new THREE.PointsMaterial({ color: '#8fd3f5', size: 0.22, transparent: true, opacity: 0.95, fog: false }))
  scene.add(runwayLights)

  // ---------- the aircraft on its stand ----------
  const plane = buildAircraft({ shadows: true })
  plane.scale.setScalar(2.1); plane.position.set(0, 1.26, 0.6); plane.rotation.y = -0.22; scene.add(plane)

  // maintenance dock at the left engine: platform, rails, stairs
  const yellow = new THREE.MeshStandardMaterial({ color: '#e8b931', roughness: 0.5, metalness: 0.3 })
  const dock = new THREE.Group()
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.4), steel); deck.position.y = 1.15; dock.add(deck)
  for (const [x, z] of [[-1.25, -0.65], [1.25, -0.65], [-1.25, 0.65], [1.25, 0.65]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.06), yellow); l.position.set(x, 0.575, z); dock.add(l) }
  for (const z of [-0.68, 0.68]) { const r = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.04), yellow); r.position.set(0, 2.05, z); dock.add(r) }
  for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.1), steel); st.position.set(1.6 + i * 0.22, 0.18 * (6 - i), 0); dock.add(st) }
  dock.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  dock.position.set(1.2, 0, -3.1); dock.rotation.y = -0.22; scene.add(dock)

  // ---------- parts racks along the back wall, left of the doors, with the box the scanner finds ----------
  const rack = new THREE.Group()
  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  const boxMats = ['#8a6a46', '#9b7b52', '#5d6b7d', '#2b4669', '#7a8695'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }))
  let target = null
  const RX0 = -W + 0.6, RX1 = -DW - 0.6
  for (let x = RX0; x <= RX1 + 0.01; x += (RX1 - RX0) / 2) { const up = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5.2, 0.1), yellow); up.position.set(x, 2.6, 0.6); rack.add(up); const up2 = up.clone(); up2.position.z = -0.6; rack.add(up2) }
  for (let lvl = 0; lvl < 4; lvl++) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(RX1 - RX0, 0.06, 1.3), steel); sh.position.set((RX0 + RX1) / 2, 0.25 + lvl * 1.3, 0); rack.add(sh)
    let cx = RX0 + 0.1
    while (cx < RX1 - 0.6) {
      const w = 0.45 + Math.random() * 0.55, h = 0.35 + Math.random() * 0.6
      const m = new THREE.Mesh(boxGeo, boxMats[Math.floor(Math.random() * boxMats.length)])
      m.scale.set(w, h, 0.9 + Math.random() * 0.25); m.position.set(cx + w / 2, 0.28 + lvl * 1.3 + h / 2, 0)
      m.castShadow = true; rack.add(m)
      if (lvl === 2 && !target && cx > (RX0 + RX1) / 2) target = m
      cx += w + 0.06
    }
  }
  rack.position.set(0, 0, -D + 1.0); scene.add(rack)
  target.material = new THREE.MeshStandardMaterial({ color: '#2b4669', emissive: LOC, emissiveIntensity: 0, roughness: 0.6 })
  const ping = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.52, 48), new THREE.MeshBasicMaterial({ color: LOC, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
  scene.add(ping)
  const rackLight = new THREE.PointLight('#9cc7ff', 18, 12, 1.6); rackLight.position.set((RX0 + RX1) / 2, 5.5, -D + 4); scene.add(rackLight)

  // scanner: a sheet of light that sweeps along the racks
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 5.4), new THREE.MeshBasicMaterial({ color: LOC, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }))
  scan.position.set(0, 2.7, -D + 1.75); scene.add(scan)
  const scanGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5.4), new THREE.MeshBasicMaterial({ color: LOC, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
  scanGlow.position.copy(scan.position); scene.add(scanGlow)

  // ---------- light: dim ambience, floodlights that switch on in sequence ----------
  scene.add(new THREE.HemisphereLight('#8fb3d9', '#0a1220', 0.35 * Math.PI))
  const moon = new THREE.DirectionalLight('#7fa8d8', 0.25 * Math.PI); moon.position.set(0, 12, -40); scene.add(moon)
  const floods = []
  const lampMat = new THREE.MeshStandardMaterial({ color: '#cfe6ff', emissive: '#cfe6ff', emissiveIntensity: 0 })
  ;[[-6, 4], [0, -2], [6, 4], [-2, 7], [4, -6]].forEach(([x, z], i) => {
    const spot = new THREE.SpotLight('#dbeaff', 0, 26, 0.55, 0.55, 1.4)
    spot.position.set(x, 10.6, z); spot.target.position.set(x * 0.4, 0, z * 0.4 + 0.5)
    if (i === 1) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004 }
    scene.add(spot, spot.target)
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5), lampMat.clone()); lamp.position.set(x, 10.75, z); scene.add(lamp)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 4.6, 10.6, 40, 1, true), beamMaterial('#bcd8ff'))
    const dir = new THREE.Vector3().subVectors(spot.target.position, spot.position).normalize()
    beam.position.copy(spot.position).addScaledVector(dir, 5.3)
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
    scene.add(beam)
    floods.push({ spot, lamp, beam, at: 1.6 + i * 0.45 })
  })
  // cool light spilling in from the doors
  const doorLight = new THREE.SpotLight('#5f8fd0', 0, 40, 0.9, 0.8, 1.2)
  doorLight.position.set(0, 6, -22); doorLight.target.position.set(0, 0, 4); scene.add(doorLight, doorLight.target)

  // ---------- dust drifting through the beams ----------
  const N = small ? 400 : 900, dust = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) { dust[i * 3] = (Math.random() - 0.5) * 22; dust[i * 3 + 1] = Math.random() * 10; dust[i * 3 + 2] = (Math.random() - 0.5) * 18 }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dust, 3))
  const dustPts = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#cfe0f5', size: 0.035, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  scene.add(dustPts)

  // ---------- labels that live in 3D space ----------
  const anchors = {
    part: () => target.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0.6)),
    craft: () => new THREE.Vector3(1.5, 4.6, 0.4),
    engine: () => new THREE.Vector3(1.15, 1.35, -0.85),
  }

  // ---------- camera: a slow, wide drift around the aircraft's front quarter, nudged by the pointer ----------
  const look = new THREE.Vector3(-1.5, 2.3, -1)
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  const onMove = (e) => { pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2; pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2 }
  window.addEventListener('pointermove', onMove)

  let raf = 0, w = 0, h = 0, t0 = null, started = false, last = performance.now()
  const proj = new THREE.Vector3()
  function frame(now) {
    raf = requestAnimationFrame(frame)
    if (document.hidden) return
    const cw = el.clientWidth, ch = el.clientHeight
    if (cw !== w || ch !== h) { w = cw; h = ch; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 55 : 40; camera.updateProjectionMatrix() }
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    if (started && t0 == null) t0 = now
    const t = started ? (still ? 30 : (now - t0) / 1000) : 0

    // doors roll open over the first seconds, then the floods click on in turn
    const open = ease((t - 0.2) / 3.2)
    for (const d of doors) d.position.x = d.userData.side * open * (DW + 0.2)
    doorLight.intensity = open * 120
    for (const f of floods) {
      const on = t > f.at ? Math.min(1, (t - f.at) / 0.12) : 0
      const flicker = t > f.at && t < f.at + 0.35 ? (Math.sin(t * 90) > 0 ? 1 : 0.25) : 1
      f.spot.intensity = 260 * on * flicker; f.lamp.material.emissiveIntensity = 2.2 * on * flicker; f.beam.material.uniforms.uOn.value = on * flicker
    }
    dustPts.material.opacity = 0.55 * ease((t - 2.4) / 2)
    const pos = dustPts.geometry.attributes.position
    for (let i = 0; i < N; i++) { let y = pos.array[i * 3 + 1] + dt * 0.08; if (y > 10) y = 0; pos.array[i * 3 + 1] = y; pos.array[i * 3] += Math.sin(now / 3000 + i) * dt * 0.03 }
    pos.needsUpdate = true

    // the scanner sweeps the racks every 9 seconds and lights the target box as it passes
    const cyc = ((t - 4) % 9 + 9) % 9, sweep = cyc / 3.2
    const sz = RX0 + sweep * (RX1 - RX0)
    const scanOn = t > 4 && sweep <= 1 ? 1 : 0
    scan.position.x = scanGlow.position.x = sz
    scan.material.opacity = 0.9 * scanOn; scanGlow.material.opacity = 0.08 * scanOn
    const tp = target.getWorldPosition(new THREE.Vector3())
    const found = t > 4 && (sweep > 1 || sz > tp.x) ? 1 : 0
    target.material.emissiveIntensity = found * (0.6 + 0.4 * Math.sin(now / 260))
    ping.position.set(tp.x, tp.y, tp.z + 0.62)
    const ph = (now / 1400) % 1
    ping.scale.setScalar(1 + ph * 1.6); ping.material.opacity = found * 0.8 * (1 - ph)

    // camera drift
    pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04
    const tt = still ? 0 : t
    const th = 0.78 + 0.32 * Math.sin(tt * 0.045)
    const r = 19 + 1.6 * Math.sin(tt * 0.031) + (1 - ease(t / 6)) * 6
    camera.position.set(r * Math.cos(th) + pointer.x * 0.9, 3.4 + 0.9 * Math.sin(tt * 0.037 + 1) - pointer.y * 0.5, r * Math.sin(th))
    camera.lookAt(look.x + pointer.x * 0.6, look.y - pointer.y * 0.3, look.z)

    renderer.render(scene, camera)
    if (onFrame) {
      const out = {}
      for (const [k, fn] of Object.entries(anchors)) {
        proj.copy(fn()).project(camera)
        out[k] = { x: (proj.x + 1) / 2 * w, y: (1 - proj.y) / 2 * h, visible: proj.z < 1 && proj.x > -1.1 && proj.x < 1.1 }
      }
      out.t = t; out.found = found
      onFrame(out)
    }
  }
  raf = requestAnimationFrame(frame)

  return {
    start() { started = true },
    destroy() {
      cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove)
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose() }) })
      mirror.getRenderTarget && mirror.getRenderTarget().dispose()
      renderer.dispose(); renderer.domElement.remove()
    },
  }
}
