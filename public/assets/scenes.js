/* Avilo 3D: the network globe (stations, transfers, supplier orders) and the aircraft parts locator. */
(function () {
  const AV = window.AV;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#1B96D2';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function webglOK() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; }
  }
  function fallback(el, msg) {
    const d = document.createElement('div'); d.className = 'fallback';
    d.textContent = msg || '3D view unavailable in this browser. All the same information is in the lists beside it.';
    el.appendChild(d);
    return { update() {}, focus() {}, destroy() { d.remove(); } };
  }
  function dotTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); return t;
  }
  function makeRenderer(el) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.insertBefore(r.domElement, el.firstChild);
    return r;
  }
  function vec(lat, lon, rad) {
    const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-rad * Math.sin(phi) * Math.cos(th), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(th));
  }

  /* ---------------- Globe ---------------- */
  AV.Globe = {
    mount(el, opts) {
      if (!webglOK()) return fallback(el);
      const ov = document.createElement('div'); ov.className = 'ov'; el.appendChild(ov);
      const renderer = makeRenderer(el);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.set(0, 0, 3.6);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.minDistance = 2.2; controls.maxDistance = 5; controls.rotateSpeed = 0.5;
      controls.autoRotate = !reduce(); controls.autoRotateSpeed = 0.35;
      renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });

      const globe = new THREE.Group(); scene.add(globe);
      globe.rotation.y = -(90 + 45) * Math.PI / 180; globe.rotation.x = 22 * Math.PI / 180;

      const sea = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--globe-sea')) }));
      globe.add(sea);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--locator')), transparent: true, opacity: 0.07, side: THREE.BackSide }));
      scene.add(halo);
      // graticule
      const gmat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--globe-grid')), transparent: true, opacity: 0.9 });
      for (let lat = -60; lat <= 60; lat += 30) { const pts = []; for (let lon = -180; lon <= 180; lon += 4) pts.push(vec(lat, lon, 1.001)); globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat)); }
      for (let lon = -180; lon < 180; lon += 30) { const pts = []; for (let lat = -88; lat <= 88; lat += 4) pts.push(vec(lat, lon, 1.001)); globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat)); }
      // land dots
      const L = window.AVILO_LAND || [], pos = new Float32Array(L.length / 2 * 3);
      for (let i = 0; i < L.length; i += 2) { const v = vec(L[i], L[i + 1], 1.003); pos.set([v.x, v.y, v.z], i / 2 * 3); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const tex = dotTexture();
      globe.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: new THREE.Color(css('--globe-land')), size: 0.026, map: tex, transparent: true, alphaTest: 0.4, sizeAttenuation: true })));

      const locC = new THREE.Color(css('--locator'));
      const warnC = new THREE.Color('#F0A73A');
      const supC = new THREE.Color('#8FA6BF');
      const labels = [];
      function addLabel(lat, lon, html, cls, onClick) {
        const d = document.createElement('div'); d.className = 'glabel ' + (cls || ''); d.innerHTML = html;
        if (onClick) d.addEventListener('click', onClick);
        ov.appendChild(d); labels.push({ el: d, p: vec(lat, lon, 1.02) }); return d;
      }
      // stations: pin + ring
      const stLabels = {};
      for (const s of AV.stations) {
        const base = vec(s.lat, s.lon, 1), n = base.clone().normalize();
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 8), new THREE.MeshBasicMaterial({ color: locC }));
        pin.position.copy(n.clone().multiplyScalar(1.045)); pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); globe.add(pin);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color: locC }));
        head.position.copy(n.clone().multiplyScalar(1.09)); globe.add(head);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.025, 0.032, 32), new THREE.MeshBasicMaterial({ color: locC, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
        ring.position.copy(n.clone().multiplyScalar(1.004)); ring.lookAt(n.clone().multiplyScalar(2)); globe.add(ring);
        ring.userData.pulse = true;
        stLabels[s.code] = addLabel(s.lat, s.lon, '<span>' + s.code + '</span><span class="q"></span>', '', () => opts && opts.onStation && opts.onStation(s.code));
        labels[labels.length - 1].p = n.clone().multiplyScalar(1.11);
      }
      for (const s of AV.suppliers) {
        const n = vec(s.lat, s.lon, 1).normalize();
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.014), new THREE.MeshBasicMaterial({ color: supC }));
        m.position.copy(n.clone().multiplyScalar(1.02)); globe.add(m);
        addLabel(s.lat, s.lon, s.code, 'sup');
      }

      let arcs = [];
      const arcGroup = new THREE.Group(); globe.add(arcGroup);
      function arc(a, b, color, kind) {
        const va = vec(a.lat, a.lon, 1.005), vb = vec(b.lat, b.lon, 1.005);
        const dist = va.distanceTo(vb);
        const mid = va.clone().add(vb).normalize().multiplyScalar(1 + dist * 0.35);
        const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, kind === 'po' ? 0.0028 : 0.0045, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'po' ? 0.55 : 0.9 }));
        arcGroup.add(tube);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(kind === 'po' ? 0.011 : 0.016, 12, 10), new THREE.MeshBasicMaterial({ color }));
        arcGroup.add(dot);
        return { curve, dot, kind, t: Math.random() };
      }
      const where = (code) => AV.stations.find(s => s.code === code) || AV.suppliers.find(s => s.id === code || s.code === code);
      function update(data) {
        while (arcGroup.children.length) { const c = arcGroup.children.pop(); c.geometry.dispose(); c.material.dispose(); }
        arcs = [];
        for (const t of data.transits) arcs.push(arc(where(t.from), where(t.to), warnC, t.overdue ? 'overdue' : 'transit'));
        for (const po of data.pos) arcs.push(arc(where(po.sup), where(po.station), locC, 'po'));
        for (const s of AV.stations) {
          const d = data.stations[s.code]; const l = stLabels[s.code];
          l.querySelector('.q').textContent = d.label; l.classList.toggle('alert', !!d.alert);
        }
      }
      update(opts.data);

      let raf = 0, w = 0, h = 0, t0 = performance.now();
      const tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
      function frame(now) {
        raf = requestAnimationFrame(frame);
        const cw = el.clientWidth, ch = el.clientHeight;
        if (cw !== w || ch !== h) { w = cw; h = ch; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
        const dt = (now - t0) / 1000; t0 = now;
        controls.update();
        const still = reduce();
        for (const a of arcs) {
          if (a.kind === 'overdue') { a.t = 0.62; const s = 1 + 0.5 * Math.abs(Math.sin(now / 350)); a.dot.scale.setScalar(still ? 1.3 : s); }
          else if (!still) a.t = (a.t + dt * (a.kind === 'po' ? 0.08 : 0.12)) % 1;
          a.dot.position.copy(a.curve.getPoint(a.t));
        }
        globe.children.forEach(c => { if (c.userData.pulse && !still) { const k = 1 + ((now / 1600) % 1) * 1.6; c.scale.setScalar(k); c.material.opacity = 0.8 * (1 - ((now / 1600) % 1)); } });
        renderer.render(scene, camera);
        camera.getWorldDirection(camDir);
        for (const L of labels) {
          tmp.copy(L.p).applyMatrix4(globe.matrixWorld);
          const facing = tmp.clone().normalize().dot(camera.position.clone().normalize()) > 0.25;
          tmp.project(camera);
          L.el.style.left = ((tmp.x + 1) / 2 * w) + 'px'; L.el.style.top = ((1 - tmp.y) / 2 * h) + 'px';
          L.el.classList.toggle('hide', !facing);
        }
      }
      raf = requestAnimationFrame(frame);
      return {
        update,
        destroy() { cancelAnimationFrame(raf); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); ov.remove(); }
      };
    }
  };

  /* ---------------- Aircraft (generic twin-engine narrowbody) ---------------- */
  AV.ZONE_POS = {
    engL: [0.35, -0.22, -0.78], engR: [0.35, -0.22, 0.78], wingL: [-0.45, 0.02, -1.45], wingR: [-0.45, 0.02, 1.45],
    noseGear: [1.25, -0.5, 0], mainGear: [-0.05, -0.5, -0.3], avionics: [1.3, -0.08, 0], cockpit: [1.72, 0.14, 0],
    apu: [-2.38, 0.12, 0], belly: [0.1, -0.24, 0], cabin: [-0.5, 0.2, 0]
  };
  AV.Plane = {
    mount(el, opts) {
      if (!webglOK()) return fallback(el);
      const ov = document.createElement('div'); ov.className = 'ov'; el.appendChild(ov);
      const renderer = makeRenderer(el);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      const zp = AV.ZONE_POS[opts && opts.zone] || [0, 0, 1];
      camera.position.set(4.2, 2.3, zp[2] < -0.1 ? -4.6 : 4.6);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false; controls.enableDamping = true; controls.minDistance = 3.5; controls.maxDistance = 9;
      controls.target.set(-0.2, -0.05, 0); controls.autoRotate = !reduce(); controls.autoRotateSpeed = 0.6;
      renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });

      scene.add(new THREE.HemisphereLight(0xdbe8f5, 0x0b2545, 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(3, 5, 4); scene.add(sun);
      const rim = new THREE.DirectionalLight(0x8fd3f5, 0.35); rim.position.set(-4, 2, -3); scene.add(rim);

      const plane = new THREE.Group(); scene.add(plane);
      const white = new THREE.MeshStandardMaterial({ color: 0xf2f5f9, roughness: 0.45, metalness: 0.15 });
      const grey = new THREE.MeshStandardMaterial({ color: 0xc3ccd8, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
      const dark = new THREE.MeshStandardMaterial({ color: 0x1a2533, roughness: 0.6 });
      const navy = new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--navy')), roughness: 0.5, metalness: 0.1 });
      const loc = new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--locator')), roughness: 0.4, emissive: new THREE.Color(css('--locator')), emissiveIntensity: 0.25 });
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

      // ground ring
      const grid = new THREE.PolarGridHelper(3.2, 12, 6, 64, new THREE.Color(css('--panel-line')), new THREE.Color(css('--panel-line')));
      grid.position.y = -0.58; scene.add(grid);

      // hotspots
      const spots = {};
      const dotGeo = new THREE.SphereGeometry(0.035, 16, 12);
      for (const [k, p] of Object.entries(AV.ZONE_POS)) {
        const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--locator')), transparent: true, opacity: 0.55 }));
        m.position.set(p[0], p[1], p[2]); plane.add(m);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.075, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--locator')), transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }));
        ring.position.copy(m.position); plane.add(ring);
        spots[k] = { m, ring };
      }
      const label = document.createElement('div'); label.className = 'plabel'; label.hidden = true; ov.appendChild(label);
      let focus = null;
      function setFocus(zone, color, text, kind) {
        focus = zone && spots[zone] ? { zone, color: new THREE.Color(color || css('--locator')) } : null;
        for (const [k, s] of Object.entries(spots)) {
          const on = focus && k === zone;
          s.m.material.color.copy(on ? focus.color : new THREE.Color(css('--locator')));
          s.m.material.opacity = on ? 1 : 0.35; s.m.scale.setScalar(on ? 1.6 : 1); s.ring.material.opacity = 0;
        }
        label.hidden = !focus; label.textContent = text || ''; label.className = 'plabel' + (kind === 'loc' ? ' loc' : '');
      }
      setFocus(opts && opts.zone, opts && opts.color, opts && opts.label, opts && opts.kind);

      let raf = 0, w = 0, h = 0;
      const tmp = new THREE.Vector3();
      function frame(now) {
        raf = requestAnimationFrame(frame);
        const cw = el.clientWidth, ch = el.clientHeight;
        if (cw !== w || ch !== h) { w = cw; h = ch; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
        controls.update();
        if (focus) {
          const s = spots[focus.zone], ph = reduce() ? 0.5 : (now / 1200) % 1;
          s.ring.material.color.copy(focus.color); s.ring.material.opacity = 0.9 * (1 - ph); s.ring.scale.setScalar(1 + ph * 2.2); s.ring.lookAt(camera.position);
          tmp.copy(s.m.position).applyMatrix4(plane.matrixWorld).project(camera);
          label.style.left = ((tmp.x + 1) / 2 * w) + 'px'; label.style.top = ((1 - tmp.y) / 2 * h) + 'px';
        }
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(frame);
      return { focus: setFocus, destroy() { cancelAnimationFrame(raf); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); ov.remove(); } };
    }
  };
})();
