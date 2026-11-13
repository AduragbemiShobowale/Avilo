// The generic twin-engine narrowbody used across Avilo: the parts locator, the hangar
// and the sign-in scene. Built from primitives; fuselage along +x, right wing on +z.
import * as THREE from 'three'

export function buildAircraft({ shadows = false } = {}) {
  const plane = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f5f9, roughness: 0.45, metalness: 0.15 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xc3ccd8, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2533, roughness: 0.6 });
  const navy = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0B2545'), roughness: 0.5, metalness: 0.1 });
  const loc = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1B96D2'), roughness: 0.4, emissive: new THREE.Color('#1B96D2'), emissiveIntensity: 0.25 });
  const add = (geo, mat, p, r, s) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(p[0], p[1], p[2]); if (r) m.rotation.set(r[0], r[1], r[2]); if (s) m.scale.set(s[0], s[1], s[2]); plane.add(m); return m; };

  // fuselage, nose and tail cone
  add(new THREE.CylinderGeometry(0.22, 0.22, 3.0, 40), white, [0, 0, 0], [0, 0, Math.PI / 2]);
  add(new THREE.SphereGeometry(0.22, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), white, [1.5, 0, 0], [0, 0, -Math.PI / 2], [1, 1.9, 1]);
  add(new THREE.CylinderGeometry(0.22, 0.05, 0.95, 40), white, [-1.97, 0.06, 0], [0, 0, Math.PI / 2 - 0.12]);
  // belly stripe in navy, a quiet brand livery
  add(new THREE.CylinderGeometry(0.223, 0.223, 2.6, 40, 1, true, Math.PI * 0.62, Math.PI * 0.76), navy, [0.05, 0, 0], [0, 0, Math.PI / 2]);
  // flight-deck windows
  for (const z of [-0.07, 0.07]) add(new THREE.BoxGeometry(0.1, 0.045, 0.06), dark, [1.78, 0.12, z], [0, z > 0 ? -0.5 : 0.5, -0.35]);
  // cabin windows
  const wg = new THREE.BoxGeometry(0.035, 0.05, 0.01);
  for (let i = 0; i < 22; i++) { const x = 1.15 - i * 0.12; add(wg, dark, [x, 0.07, 0.219]); add(wg, dark, [x, 0.07, -0.219]); }
  // wings
  function wing(side) {
    const s = new THREE.Shape();
    s.moveTo(0.45, 0); s.lineTo(-0.45, 0); s.lineTo(-0.82, 1.95); s.lineTo(-0.55, 1.95); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: false });
    const m = new THREE.Mesh(g, grey);
    m.rotation.x = -Math.PI / 2; if (side > 0) m.scale.y = -1;
    const grp = new THREE.Group(); grp.add(m); grp.position.set(0, -0.08, side * 0.15); grp.rotation.x = -side * 0.07; plane.add(grp);
    const wl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.02), navy); wl.position.set(-0.72, 0.1, side * 2.08); wl.rotation.z = -0.35; plane.add(wl);
  }
  wing(1); wing(-1);
  // engines
  for (const side of [1, -1]) {
    add(new THREE.CylinderGeometry(0.135, 0.12, 0.6, 32), grey, [0.38, -0.24, side * 0.78], [0, 0, Math.PI / 2]);
    add(new THREE.TorusGeometry(0.128, 0.018, 12, 32), navy, [0.68, -0.24, side * 0.78], [0, Math.PI / 2, 0]);
    add(new THREE.CircleGeometry(0.115, 32), dark, [0.67, -0.24, side * 0.78], [0, Math.PI / 2, 0]);
    add(new THREE.BoxGeometry(0.4, 0.12, 0.04), grey, [0.25, -0.12, side * 0.78]);
  }
  // horizontal stabilisers
  for (const side of [1, -1]) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-0.42, 0); s.lineTo(-0.62, 0.72); s.lineTo(-0.44, 0.72); s.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }), grey);
    m.rotation.x = -Math.PI / 2; if (side > 0) m.scale.y = -1; m.position.set(-1.88, 0.1, side * 0.1); plane.add(m);
  }
  // vertical fin in navy with the locator dot
  const fin = new THREE.Shape(); fin.moveTo(-1.62, 0.18); fin.lineTo(-2.2, 0.18); fin.lineTo(-2.5, 1.02); fin.lineTo(-2.18, 1.02); fin.closePath();
  add(new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: false }), navy, [0, 0, -0.02]);
  for (const z of [0.024, -0.024]) add(new THREE.CircleGeometry(0.075, 32), loc, [-2.12, 0.6, z], [0, z > 0 ? 0 : Math.PI, 0]);
  // landing gear
  const strut = new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), tyre = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20);
  add(strut, grey, [1.25, -0.33, 0]); add(tyre, dark, [1.25, -0.5, 0.04], [Math.PI / 2, 0, 0]); add(tyre, dark, [1.25, -0.5, -0.04], [Math.PI / 2, 0, 0]);
  for (const side of [1, -1]) { add(strut, grey, [-0.05, -0.33, side * 0.3]); for (const dz of [0.05, -0.05]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20), dark, [-0.05, -0.5, side * 0.3 + dz], [Math.PI / 2, 0, 0]); }
  if (shadows) plane.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return plane
}
