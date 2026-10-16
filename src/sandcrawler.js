/* Hellcat Drive — procedural Sandcrawler: the Jawas' rusting mobile fortress, an old Corellia Mining digger crawler -
   36.8 m long and 20 m tall. A tall slab-sided hull, its sides leaning in a little towards the roof: the bridge's near-
   vertical face up front with its row of small windows, under it the long bow sloping back down to the tracks (the
   loading ramp let into it), the roof stepping down twice towards the stern, the sloped stern; a ledge round the lower
   hull with its ports, the dark hatch in the side, plates of every shade of rust riveted over each other, rust streaks,
   machinery and masts on the roof, floodlights on the bow. Under it four track units, each a belt of steel shoes round
   sprockets 3.4 m tall - a short pair forward, a long pair aft - each running at its own speed and swinging to steer.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build, plus afterWheels() (the tracks' belts and sprockets). */
(function (root) {
  'use strict';

  function build(THREE, opts) {
    opts = opts || {};
    const cgH = opts.cgHeight || 6.5, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 7.4, cgToRear = opts.cgToRear || 6.1;
    const trackX = (opts.trackF || 10.6) / 2, RW = opts.wheelRadius || 1.7;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || {};
    const rootG = new THREE.Group(); rootG.name = 'sandcrawler';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const toRoot = (v) => v.clone().add(V3(0, -cgH, zOff));
    const add = (parent, geo, mat, x, y, z, rx, ry, rz, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = cast !== false; m.receiveShadow = true;
      parent.add(m); return m;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cylX = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24); g.rotateZ(Math.PI / 2); return g; };
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 8), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    // (a seeded random, so it's the same crawler every time)
    let seed = 7349;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // ---------------------------------------------------------------- materials
    // the hull's skin: plates of every shade riveted over each other, seams, rust run down from the rivets, grime - a
    // neutral patchwork the paint colour tints (rust brown as it comes), the rust streaks warmer still. One tile is 16 m
    function rustTex() {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
      g.fillStyle = '#b4aaa0'; g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 260; i++) {
        const w = 48 + rnd() * 200, h = 40 + rnd() * 170, x = rnd() * 1024 - 40, y = rnd() * 1024 - 40, v = 165 + rnd() * 60, warm = rnd() * 0.08;
        g.fillStyle = `rgba(${Math.round(v)},${Math.round(v * (0.9 - warm))},${Math.round(v * (0.82 - warm * 1.6))},0.92)`;
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(28,18,12,0.45)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
        // (rivets along its edges, now and then)
        if (rnd() < 0.45) { g.fillStyle = 'rgba(40,26,18,0.6)'; for (let k = 6; k < w - 4; k += 14) { g.fillRect(x + k, y + 5, 3, 3); g.fillRect(x + k, y + h - 8, 3, 3); } }
      }
      // (rust run down from the seams and rivets)
      for (let i = 0; i < 160; i++) {
        const x = rnd() * 1024, y = rnd() * 1024, l = 40 + rnd() * 220, w = 2 + rnd() * 10;
        const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(170,92,48,0.26)'); gr.addColorStop(1, 'rgba(170,92,48,0)');
        g.fillStyle = gr; g.fillRect(x, y, w, l);
      }
      // (grime and scorched patches)
      for (let i = 0; i < 40; i++) {
        const x = rnd() * 1024, y = rnd() * 1024, r = 40 + rnd() * 160, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(30,22,16,0.32)'); gr.addColorStop(1, 'rgba(30,22,16,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      // (bright scrapes)
      g.strokeStyle = 'rgba(235,225,210,0.25)'; g.lineWidth = 1.5;
      for (let i = 0; i < 50; i++) { const x = rnd() * 1024, y = rnd() * 1024; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 20); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      return t;
    }
    const base = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : 0x7d5539;
    const M = {};
    M.hull = new THREE.MeshStandardMaterial({ map: rustTex(), color: base, roughness: 0.88, metalness: 0.22 });
    M.plate = new THREE.MeshStandardMaterial({ map: M.hull.map, color: base, roughness: 0.85, metalness: 0.25, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    M.paint = M.hull;
    M.dark = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.9, metalness: 0.2 });
    M.hole = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x0a0c0d, roughness: 0.15, metalness: 0.7, emissive: 0xffb860, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x45403a, roughness: 0.6, metalness: 0.6 });
    M.rusty = new THREE.MeshStandardMaterial({ map: M.hull.map, color: 0x5e402c, roughness: 0.9, metalness: 0.3 });
    M.head = new THREE.MeshStandardMaterial({ color: 0x77736a, emissive: 0xfff2d8, emissiveIntensity: 0, roughness: 0.25, metalness: 0.4 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a10, emissiveIntensity: 0.3, roughness: 0.3 });

    const body = new THREE.Group(); model.add(body);
    const tips = [], spots = [], panes = [];

    // ---------------------------------------------------------------- the hull
    // its side profile (z from the bow's tip back, y up; the hull's own z - the wheelbase's middle is 2 m behind its
    // middle): the bridge's top edge, the roof stepping down at the middle and again over the stern, the sloped stern, the
    // belly over the tracks, the bow sloping up from the front tracks to the bridge's face
    const ZH = 2.0, zm = (zh) => zh - ZH;
    const PROF = [[-18.4, 20.0], [-0.3, 18.3], [-0.3, 17.8], [11.0, 16.0], [11.0, 15.0], [15.8, 14.2], [18.4, 6.0], [17.6, 3.6], [-9.5, 3.6], [-17.6, 14.5]];
    // (its sides lean in a little towards the roof)
    const hwAt = (y) => 7.55 - 0.045 * (y - 3.6);
    let area = 0; for (let i = 0; i < PROF.length; i++) { const a = PROF[i], b = PROF[(i + 1) % PROF.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const ccw = area > 0;
    const insideProf = (z, y) => { let c = false; for (let i = 0, j = PROF.length - 1; i < PROF.length; j = i++) { const [zi, yi] = PROF[i], [zj, yj] = PROF[j]; if ((yi > y) !== (yj > y) && z < (zj - zi) * (y - yi) / (yj - yi) + zi) c = !c; } return c; };
    // a mesh from triangles, each turned to face `want`, UVs projected on the face's own plane (16 m a tile)
    function triMesh(tris, mat, colors) {
      const pos = [], uv = [], col = [];
      for (const t of tris) {
        let [a, b, c, want] = t;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { const s = b; b = c; c = s; nx = -nx; ny = -ny; nz = -nz; }
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), o = t[4] || 0;
        for (const p of [a, b, c]) {
          pos.push(p[0], p[1], p[2]);
          if (ax >= ay && ax >= az) uv.push(p[2] / 16 + o, p[1] / 16); else if (ay >= az) uv.push(p[0] / 16 + o, p[2] / 16); else uv.push(p[0] / 16 + o, p[1] / 16);
          if (colors) col.push(t[5], t[5] * 0.98, t[5] * 0.95);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return new THREE.Mesh(g, mat);
    }
    {
      const tris = [], n = PROF.length;
      const side = (sx, p) => [sx * hwAt(p[1]), p[1], zm(p[0])];
      const idx = THREE.ShapeUtils.triangulateShape(PROF.map(([z, y]) => new THREE.Vector2(z, y)), []);
      for (const sx of [-1, 1]) for (const [i, j, k] of idx) tris.push([side(sx, PROF[i]), side(sx, PROF[j]), side(sx, PROF[k]), [sx, 0, 0]]);
      for (let i = 0; i < n; i++) {
        const p = PROF[i], q = PROF[(i + 1) % n], dz = q[0] - p[0], dy = q[1] - p[1];
        const want = ccw ? [0, -dz, dy] : [0, dz, -dy];
        const a = side(-1, p), b = side(1, p), c = side(1, q), d = side(-1, q);
        tris.push([a, b, c, want], [a, c, d, want]);
      }
      const hull = triMesh(tris, M.hull); hull.castShadow = true; hull.receiveShadow = true; body.add(hull);
    }
    // ---- plates riveted over the sides, every shade of rust (a few hundred, as one mesh a side)
    {
      const tris = [];
      for (const sx of [-1, 1]) for (let i = 0; i < 150; i++) {
        const w = 1.2 + rnd() * 4.5, h = 0.8 + rnd() * 3.2, z0 = -18 + rnd() * 36, y0 = 3.8 + rnd() * 15.5;
        if (!insideProf(z0, y0) || !insideProf(z0 + w, y0) || !insideProf(z0, y0 + h) || !insideProf(z0 + w, y0 + h)) continue;
        const P = (z, y) => [sx * (hwAt(y) + 0.05), y, zm(z)], shade = 0.84 + rnd() * 0.26, o = rnd();
        tris.push([P(z0, y0), P(z0 + w, y0), P(z0 + w, y0 + h), [sx, 0, 0], o, shade], [P(z0, y0), P(z0 + w, y0 + h), P(z0, y0 + h), [sx, 0, 0], o, shade]);
      }
      body.add(triMesh(tris, M.plate, true));
    }
    // ---- the ledge round the lower hull and the one along the middle, the seams between the sections
    const slopeZ = (y) => -9.5 - 8.1 * (y - 3.6) / 10.9;            // (the bow's face, z at height y)
    for (const sx of [-1, 1]) {
      const z0 = slopeZ(6.6) + 0.3, z1 = 18.1;
      add(body, box(0.45, 0.32, z1 - z0), M.rusty, sx * (hwAt(6.6) + 0.18), 6.6, zm((z0 + z1) / 2));
      add(body, box(0.3, 0.22, 18.2), M.rusty, sx * (hwAt(8.8) + 0.12), 8.8, zm(-0.3 + 9.1));
      for (const [zh, y0, y1] of [[-2.7, 6.8, 18.6], [-0.3, 6.8, 17.9], [11.0, 6.8, 15.8]]) add(body, box(0.22, y1 - y0, 0.3), M.rusty, sx * (hwAt((y0 + y1) / 2) + 0.1), (y0 + y1) / 2, zm(zh));
      // (the lower band's ports and grilles)
      for (let zh = -7; zh < 17; zh += 2.4 + rnd() * 1.2) add(body, box(0.05, 0.5 + rnd() * 0.4, 0.6 + rnd() * 0.9), M.hole, sx * (hwAt(5) + 0.04), 4.7 + rnd() * 0.8, zm(zh));
      // (the dark hatch in the side, its frame - and on the right a second, smaller one aft)
      const hz = sx > 0 ? 6.6 : 5.4;
      add(body, box(0.06, 2.1, 2.2), M.hole, sx * (hwAt(10.2) + 0.05), 10.2, zm(hz));
      add(body, box(0.18, 0.2, 2.6), M.rusty, sx * (hwAt(11.3) + 0.1), 11.35, zm(hz));
      if (sx > 0) add(body, box(0.06, 1.1, 0.9), M.hole, sx * (hwAt(11.5) + 0.05), 11.5, zm(13.3));
      // (the small windows high up near the bow, and over the middle)
      for (let k = 0; k < 4; k++) panes.push(add(body, box(0.06, 0.42, 0.62), M.glass, sx * (hwAt(19.1) + 0.04), 19.1, zm(-17.2 + k * 1.3)));
      for (let k = 0; k < 3; k++) add(body, box(0.06, 0.32, 0.5), M.glass, sx * (hwAt(17.2) + 0.04), 17.2, zm(0.9 + k * 0.9));
      // (vertical ribs and a ladder up the stern quarter)
      for (const zh of [12.6, 14.1]) add(body, box(0.16, 7.2, 0.18), M.rusty, sx * (hwAt(10.5) + 0.08), 10.5, zm(zh));
    }
    // ---- the bridge's face: its row of small windows; the bow below it, the loading ramp let into it, the floodlights
    {
      const bz = (y) => -18.4 + 0.8 * (20 - y) / 5.5;              // (the bridge's face leans back a touch)
      for (let k = 0; k < 9; k++) { const x = -5.2 + k * 1.3; panes.push(add(body, box(0.72, 0.5, 0.06), M.glass, x, 18.6, zm(bz(18.6)) - 0.03)); }
      // the ramp: a plate the width of the bow, hinged at its foot, its ribs across it (its group's +y runs up the bow's
      // face, -z out of it)
      const rampG = new THREE.Group(); rampG.position.set(0, 3.6, zm(-9.5)); rampG.rotation.x = -Math.atan2(8.1, 10.9); body.add(rampG);
      const L = 7.6;
      add(rampG, box(8.6, L, 0.25), M.rusty, 0, L / 2, -0.15);
      for (let k = 1; k < 7; k++) add(rampG, box(8.4, 0.14, 0.12), M.dark, 0, k * L / 7, -0.33);
      for (const sx of [-1, 1]) add(rampG, box(0.3, L, 0.3), M.rusty, sx * 4.3, L / 2, -0.2);
      // (floodlights across the bow, under the bridge)
      for (const x of [-4.6, -1.6, 1.6, 4.6]) {
        const y = 13.1, z = zm(slopeZ(y)) - 0.3;
        add(body, box(0.85, 0.8, 0.6), M.dark, x, y, z);
        add(body, new THREE.CircleGeometry(0.32, 16), M.head, x, y, z - 0.31, 0, Math.PI, 0);
        if (Math.abs(x) > 3) {
          const sl = new THREE.SpotLight(0xfff0d8, 0, 160, 0.55, 0.5, 1.2);
          sl.position.copy(toRoot(V3(x, y, z - 0.4))); sl.target.position.copy(toRoot(V3(x * 1.4, 0, z - 60)));
          rootG.add(sl); rootG.add(sl.target); sl.visible = false; spots.push(sl);
        }
      }
      // (a red lamp each side of the stern)
      for (const sx of [-1, 1]) add(body, box(0.1, 0.4, 0.4), M.tail, sx * (hwAt(7.5) + 0.06), 7.5, zm(17.9));
    }
    // ---- the roof: machinery housings, vents, the masts and a sensor dish up front, a crane boom over the stern
    {
      const roofY = (zh) => zh < -0.3 ? 20 - 1.7 * (zh + 18.4) / 18.1 : zh < 11 ? 17.8 - 1.8 * (zh + 0.3) / 11.3 : 15 - 0.8 * (zh - 11) / 4.8;
      for (const [x, zh, w, h, d] of [[-3.2, -12, 3.5, 1.4, 4.5], [2.8, -8, 2.6, 1.0, 3.2], [-1.0, -3.5, 5, 1.2, 2.4], [3.0, 3, 2.4, 1.6, 4.2], [-3.4, 6, 2.2, 1.0, 2.8], [0.5, 13.2, 4.4, 1.1, 2.6]]) {
        const y = roofY(zh);
        add(body, box(w, h, d), M.rusty, x, y + h / 2 - 0.15, zm(zh));
        add(body, box(w * 0.8, 0.05, d * 0.7), M.hole, x, y + h - 0.12, zm(zh));
      }
      tubeAB(body, V3(4.8, roofY(-15), zm(-15)), V3(4.8, roofY(-15) + 4.5, zm(-15)), 0.08, M.steel);
      tubeAB(body, V3(-5.4, roofY(-9), zm(-9)), V3(-5.4, roofY(-9) + 3.2, zm(-9)), 0.06, M.steel);
      add(body, cylX(0.04, 0.04, 1.6, 6), M.steel, 4.8, roofY(-15) + 3.6, zm(-15));
      { const d = new THREE.Group(); d.position.set(-4.6, roofY(-16) + 0.9, zm(-16)); body.add(d);
        add(d, cylX(0.25, 0.25, 0.9, 12), M.rusty, 0, -0.45, 0, 0, 0, Math.PI / 2);
        const dish = add(d, new THREE.SphereGeometry(1.1, 18, 8, 0, Math.PI * 2, 0, 0.55), M.steel, 0, 0.2, 0, -1.2, 0, 0); dish.material = M.steel; }
      // the crane over the stern
      tubeAB(body, V3(5.0, roofY(15), zm(15)), V3(5.4, roofY(15) + 3.2, zm(9)), 0.22, M.rusty);
      tubeAB(body, V3(5.4, roofY(15) + 3.2, zm(9)), V3(6.6, roofY(15) + 1.4, zm(6.5)), 0.12, M.rusty);
      tubeAB(body, V3(6.6, roofY(15) + 1.4, zm(6.5)), V3(6.6, roofY(15) - 2.0, zm(6.5)), 0.03, M.dark, 4);
    }

    // ---------------------------------------------------------------- the track units
    // each a belt of steel shoes round two sprockets 3.4 m tall, a side frame over the inside; in its corner of the
    // physics (the game moves it with the suspension and swings it as it steers)
    function shoeTex() {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
      // (u runs along the belt - one shoe a tile - v across it)
      g.fillStyle = '#3b3631'; g.fillRect(0, 0, 64, 128);
      g.fillStyle = '#100d0b'; g.fillRect(0, 0, 5, 128);
      g.fillStyle = '#5e564c'; g.fillRect(14, 4, 14, 120);
      g.fillStyle = '#2a2622'; g.fillRect(30, 4, 6, 120);
      g.fillStyle = 'rgba(160,110,70,0.35)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 64, Math.random() * 128, 4, 6);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    }
    const PITCH = 0.75, BW = 3.6, BT = 0.28;
    function beltGeo(hl, r) {
      const pts = [], n = Math.max(48, Math.round((4 * hl + 2 * Math.PI * r) / 0.25));
      const per = 4 * hl + 2 * Math.PI * r;
      for (let i = 0; i <= n; i++) {
        let s = i / n * per, z, y, nz, ny;
        // (from the bottom of the front sprocket back along the ground, round the back one, forward over the top, round the front)
        if (s < 2 * hl) { z = -hl + s; y = -r; nz = 0; ny = -1; }
        else if ((s -= 2 * hl) < Math.PI * r) { const a = -Math.PI / 2 + s / r; z = hl + Math.cos(a) * r; y = Math.sin(a) * r; nz = Math.cos(a); ny = Math.sin(a); }
        else if ((s -= Math.PI * r) < 2 * hl) { z = hl - s; y = r; nz = 0; ny = 1; }
        else { s -= 2 * hl; const a = Math.PI / 2 + s / r; z = -hl + Math.cos(a) * r; y = Math.sin(a) * r; nz = Math.cos(a); ny = Math.sin(a); }
        pts.push([z, y, nz, ny, i / n * per]);
      }
      const pos = [], uv = [], idx = [], h = BW / 2;
      const ring = (off) => { const s0 = pos.length / 3; for (const p of pts) for (const x of [-h, h]) { pos.push(x, p[1] - p[3] * off, p[0] - p[2] * off); uv.push(p[4] / PITCH, x < 0 ? 0 : 1); } return s0; };
      const o = ring(0), ii = ring(BT);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = o + i * 2, b = a + 2, c = ii + i * 2, d = c + 2;
        idx.push(a, a + 1, b, b, a + 1, b + 1);                              // the shoes (outside)
        idx.push(c, d, c + 1, d, d + 1, c + 1);                              // the inside
        idx.push(a, b, c, b, d, c); idx.push(a + 1, c + 1, b + 1, b + 1, c + 1, d + 1);   // the edges
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // a stadium (the frame's outline, the side plates), radius r round centres +-hl, as a flat plate t thick across x
    function stadium(hl, r, t) {
      const s = new THREE.Shape(); s.moveTo(-hl, -r); s.lineTo(hl, -r); s.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-hl, r); s.absarc(-hl, 0, r, Math.PI / 2, Math.PI * 1.5, false);
      const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 16 }); g.rotateY(-Math.PI / 2); g.translate(t / 2, 0, 0); return g;
    }
    const units = [], wheels = [];
    const HL = [3.0, 6.3];                 // (the flat runs' half-lengths: front pair, back pair - as the physics has them)
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = (i & 1) === 0, side = left ? -1 : 1, hl = HL[front ? 0 : 1];
      const corner = new THREE.Group(); corner.position.set(side * trackX, RW - cgH, front ? -cgToFront : cgToRear); rootG.add(corner);
      const flip = new THREE.Group(); corner.add(flip); const spin = new THREE.Group(); flip.add(spin);
      const tex = shoeTex(), tm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.5, side: THREE.DoubleSide });
      add(corner, beltGeo(hl, RW), tm, 0, 0, 0);
      // (the frame inside the belt, its side plates, the sprockets' hubs and a run of rollers along the bottom)
      add(corner, stadium(hl, RW - 0.36, BW - 0.3), M.dark, 0, 0, 0);
      for (const sx of [-1, 1]) add(corner, stadium(hl + 0.2, RW - 0.5, 0.12), M.rusty, sx * (BW / 2 + 0.07), 0, 0);
      const hubs = [];
      for (const zz of [-hl, hl]) for (const sx of [-1, 1]) {
        const hg = new THREE.Group(); hg.position.set(sx * (BW / 2 + 0.18), 0, zz); corner.add(hg); hubs.push(hg);
        add(hg, cylX(0.75, 0.75, 0.16, 20), M.steel, 0, 0, 0);
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; add(hg, cylX(0.09, 0.09, 0.22, 8), M.dark, 0, Math.cos(a) * 0.5, Math.sin(a) * 0.5); }
      }
      for (let zz = -hl + 1.4; zz < hl - 1.2; zz += 1.6) for (const sx of [-1, 1]) add(corner, cylX(0.32, 0.32, 0.1, 14), M.steel, sx * (BW / 2 + 0.15), -RW + 0.75, zz);
      units.push({ tex, hubs, travel: 0, prev: null, i, left });
      wheels.push({ corner, flip, spin, left, front, side, stock: [], pkg: [] });
    }
    const steerG = new THREE.Group(); body.add(steerG);

    // the belts run and the sprockets turn with each unit's own spin (the physics turns it like a wheel of the
    // sprocket's radius)
    function afterWheels() {
      for (const u of units) {
        const w = wheels[u.i], a = u.left ? w.spin.rotation.x : -w.spin.rotation.x;
        if (u.prev !== null) { let d = a - u.prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; u.travel += d * RW; }
        u.prev = a;
        u.tex.offset.x = -u.travel / PITCH;
        for (const h of u.hubs) h.rotation.x = -u.travel / 0.75;
      }
    }
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.hull.color.setHex(c); M.plate.color.setHex(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 3 : (o.headlights ? 1.2 : 0.3);
      M.head.emissiveIntensity = o.headlights ? 3.5 : 0;
      M.glass.emissiveIntensity = o.headlights ? 0.6 : 0;          // (the Jawas' lamps on behind the windows at night)
      for (const s of spots) { s.visible = !!o.headlights; s.intensity = o.headlights ? 900 : 0; }
    }
    const noop = () => {};
    afterWheels();
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel: steerG,
      // (the bridge: behind its windows, 18 m up)
      eye: toRoot(V3(-1.3, 18.5, zm(-17.3))),
      exhaustTips: tips, materials: M, headlights: spots, tailLens: [], mirrors: [],
      // (on the bridge the windows' panes would fill the view, a hand's breadth from the eye: you look out past them)
      setPaint, setLights, setInteriorVisible(v, cockpit) { for (const p of panes) p.visible = !cockpit; }, setTires: noop, setTransmission: noop, drawCluster: noop, drawScreen: noop, setChute: noop,
      afterWheels, variant: 'sandcrawler', cls: 'sandcrawler',
    };
  }

  root.HCSandcrawler = { build };
})(typeof self !== 'undefined' ? self : this);
