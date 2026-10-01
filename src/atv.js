/* Hellcat Drive — procedural sport quad (ATV), no badges: a black tube frame under red plastics - the pointed nose with
   its angular headlamp and black vents, front fenders sweeping back into the footwells, silver side panels, rear fenders
   - a long black seat, a tube front bumper and a rear rack (the 200), double A-arms and red coil-overs at the front, a
   swingarm with one shock on the solid rear axle, the chain on the left, the air-cooled single under the tank and a
   silver muffler out the back on the right, silver split-spoke alloys on knobbies; the rider astride it, who hangs off
   the inside of a turn (the physics' riderShift). The 450 race quad: a wider stance, nerf bars, no rack; the turbo drag
   quad: the 450 with a turbo, a swingarm stretched 10 in, a wheelie bar and drag slicks.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build, plus afterWheels() and setRider(speed, vehicle). */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const VER = opts.engine || 'sport', SPORT = VER === 'sport', TURBO = VER === 'turbo', RACE = !SPORT;
    const cgH = opts.cgHeight || 0.6, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 0.69, cgToRear = opts.cgToRear || 0.49;
    const L = cgToFront + cgToRear, zF = -L / 2, zR = L / 2;
    // (the frame's own wheelbase: the turbo quad's rear axle sits 10 in further back on its stretched swingarm)
    const Lb = SPORT ? 1.18 : 1.27, zRb = zF + Lb;
    const RF = opts.wheelRadiusF || 0.267, RR = opts.wheelRadiusR || 0.279;
    const HXF = (opts.trackF || 0.94) / 2, HXR = (opts.trackR || 0.88) / 2;
    const WF = 0.178, WRr = TURBO ? 0.28 : 0.254;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || {};
    const rootG = new THREE.Group(); rootG.name = 'atv';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const toRoot = (v) => v.clone().add(V3(0, -cgH, zOff));
    const wide = RACE ? 0.05 : 0;          // (the race quads' wider stance: the fenders and footwells move out with it)

    // ---------------------------------------------------------------- helpers
    const add = (parent, geo, mat, x, y, z, rx, ry, rz, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = cast !== false; m.receiveShadow = true;
      parent.add(m); return m;
    };
    function rbox(w, h, d, r) {
      r = Math.max(0.002, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
      const s = new THREE.Shape(), x0 = -w / 2 + r, y0 = -h / 2 + r, x1 = w / 2 - r, y1 = h / 2 - r;
      s.moveTo(x0, -h / 2 + r); s.lineTo(x0, y1); s.lineTo(x1, y1); s.lineTo(x1, y0); s.lineTo(x0, y0);
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
      g.translate(0, 0, -(d - 2 * r) / 2); return g;
    }
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    // (a bent tube through points, a ball at each bend)
    const tubes = (parent, pts, r, mat) => { for (let i = 1; i < pts.length; i++) tubeAB(parent, pts[i - 1], pts[i], r, mat); for (let i = 1; i < pts.length - 1; i++) add(parent, new THREE.SphereGeometry(r, 10, 8), mat, pts[i].x, pts[i].y, pts[i].z); };
    const pipe = (parent, pts, r, mat, seg) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 12, r, seg || 12, false), mat, 0, 0, 0);
    const cylX = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateZ(Math.PI / 2); return g; };
    const cylZ = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24); g.rotateX(Math.PI / 2); return g; };
    function latheX(pts, seg) { const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg || 48); g.rotateZ(-Math.PI / 2); return g; }
    function mergeGeos(list) {
      const gs = list.map((g0) => { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); return g; });
      let n = 0; for (const g of gs) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of gs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
      const m = new THREE.BufferGeometry();
      m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      return m;
    }
    // a body from sections along z (superellipse, n: 2 round, 4+ boxy), half-width w, from yb to yt, centred on xc
    function loft(secs, seg) {
      const N = seg || 28, pos = [], idx = [];
      for (const s of secs) {
        const e = 2 / (s.n || 2.5), yc = (s.yb + s.yt) / 2, hh = (s.yt - s.yb) / 2;
        for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pos.push((s.xc || 0) + s.w * Math.sign(c) * Math.pow(Math.abs(c), e), yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), e), s.z); }
      }
      for (let r = 0; r < secs.length - 1; r++) for (let k = 0; k < N; k++) { const a = r * N + k, b = r * N + (k + 1) % N, c = a + N, d = b + N; idx.push(a, b, c, b, d, c); }
      const c0 = pos.length / 3; pos.push(secs[0].xc || 0, (secs[0].yb + secs[0].yt) / 2, secs[0].z);
      const c1 = pos.length / 3; const S = secs[secs.length - 1]; pos.push(S.xc || 0, (S.yb + S.yt) / 2, S.z);
      for (let k = 0; k < N; k++) { idx.push(c0, (k + 1) % N, k); idx.push(c1, (secs.length - 1) * N + k, (secs.length - 1) * N + (k + 1) % N); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // a fender: a curved plastic sheet swept along a side-view path [[z, y], ...], from xIn to xOut across, crowned a
    // little and rolled down at its outer edge (drop) - one sheet, drawn both sides. sx: the side (mirrors it)
    function fender(path, xIn, xOut, drop, sx, crown) {
      const curve = new THREE.CatmullRomCurve3(path.map(([z, y]) => V3(0, y, z)), false, 'catmullrom', 0.2);
      const NU = 48, NV = 12, P = curve.getSpacedPoints(NU), pos = [], idx = [];
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
        const v = j / NV, x = xIn + (xOut - xIn) * v;
        const dy = (crown || 0.012) * Math.sin(Math.PI * Math.min(1, v / 0.84)) - drop * Math.pow(Math.max(0, (v - 0.84) / 0.16), 1.3);
        // (the lip also tucks in a touch)
        const dx = -0.012 * Math.pow(Math.max(0, (v - 0.9) / 0.1), 2);
        // the normal of the path in the side view, so the sheet's crown stands off it
        const t = curve.getTangentAt(Math.min(1, i / NU)), ny = t.z, nz = -t.y, nl = Math.hypot(ny, nz) || 1;
        pos.push(sx * (x + dx), P[i].y + dy * ny / nl, P[i].z + dy * nz / nl);
      }
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
        if (sx > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // a flat plate from a side-view outline [[z, y], ...], t thick, at x (its inner face)
    function plate(outline, t, x) {
      const s = new THREE.Shape(); s.moveTo(outline[0][0], outline[0][1]); for (let i = 1; i < outline.length; i++) s.lineTo(outline[i][0], outline[i][1]); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 8 });
      g.rotateY(-Math.PI / 2); g.translate(x + t, 0, 0); g.computeVertexNormals(); return g;
    }
    // a two-bone limb from a to c, the joint bent toward pole
    function limb(parent, a, c, l1, l2, pole, r0, r1, r2, mat) {
      const d = c.clone().sub(a), len = Math.min(d.length(), l1 + l2 - 1e-3), dir = d.normalize();
      const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
      const pp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
      const j = a.clone().add(dir.clone().multiplyScalar(x)).add(pp.multiplyScalar(h)), e = a.clone().add(dir.multiplyScalar(len));
      const seg = (p, q, ra, rb) => { const v = q.clone().sub(p), m = add(parent, new THREE.CylinderGeometry(rb, ra, v.length(), 14), mat, (p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2); m.quaternion.setFromUnitVectors(V3(0, 1, 0), v.normalize()); };
      seg(a, j, r0, r1); seg(j, e, r1, r2);
      add(parent, new THREE.SphereGeometry(r1, 12, 10), mat, j.x, j.y, j.z);
      return e;
    }

    // ---------------------------------------------------------------- materials
    const paintHex = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : 0xb01020;
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.05, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.08 });
    M.under = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.7, metalness: 0.05, side: THREE.BackSide });
    M.silver = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, metalness: 0.55, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });
    M.black = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.55, metalness: 0.25 });
    M.plastic = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });
    M.gloss = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.2, metalness: 0.3, clearcoat: 1 });
    M.frame = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.42, metalness: 0.55 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xdadde0, roughness: 0.08, metalness: 1 });
    M.muffler = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.22, metalness: 0.95 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.28, metalness: 0.9 });
    M.engine = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6 });
    M.fins = new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.4, metalness: 0.7 });
    M.spring = new THREE.MeshStandardMaterial({ color: 0xc8141c, roughness: 0.35, metalness: 0.5 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 0.93 });
    M.seat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.78 });
    M.rim = new THREE.MeshStandardMaterial({ color: 0xc6cacf, roughness: 0.2, metalness: 0.9 });
    M.rimDark = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.4, metalness: 0.5 });
    M.head = new THREE.MeshStandardMaterial({ color: 0xe8eef4, emissive: 0xf4f8ff, emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.5 });
    M.lens = new THREE.MeshPhysicalMaterial({ color: 0x20262c, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a10, emissiveIntensity: 0.4, roughness: 0.3 });
    M.amber = new THREE.MeshStandardMaterial({ color: 0x8a4a06, emissive: 0xff8a10, emissiveIntensity: 0.3, roughness: 0.25 });
    M.red = new THREE.MeshStandardMaterial({ color: 0x8a0a0c, emissive: 0xd01010, emissiveIntensity: 0.15, roughness: 0.3 });
    M.jacket = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.75 });
    M.pants = new THREE.MeshStandardMaterial({ color: 0x2c3442, roughness: 0.85 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: 0xf0f0ee, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.boot = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
    const body = new THREE.Group(); model.add(body);
    const tips = [], spots = [], rods = [], shocks = [];

    // per-frame links (A-arms, shocks): ends fixed to the frame (model space) or riding on a wheel (off its hub)
    const tubeUnit = new THREE.CylinderGeometry(1, 1, 1, 12);
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    function placeRod(m, a, b) {
      _d.subVectors(b, a); const len = _d.length();
      m.position.addVectors(a, b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / Math.max(len, 1e-6)));
      m.scale.set(m.userData.r, len, m.userData.r);
    }
    const dyn = new THREE.Group(); rootG.add(dyn);
    function mkRod(mat, r) { const m = new THREE.Mesh(tubeUnit, mat); m.userData.r = r; m.castShadow = true; dyn.add(m); return m; }
    function link(mat, r, A, B) { const m = mkRod(mat, r); rods.push({ m, A, B }); return m; }
    function endPos(e, out) {
      if (e.isVector3) return out.copy(e).add(V3(0, -cgH, zOff));
      if (Array.isArray(e.w)) { const a = wheels[e.w[0]].corner.position, b = wheels[e.w[1]].corner.position; return out.copy(a).lerp(b, e.t).add(e.o); }
      return out.copy(wheels[e.w].corner.position).add(e.o);
    }
    function shock(top, bot, coil, rBody) {
      const s = { body: mkRod(M.alu, rBody || 0.022), shaft: mkRod(M.chrome, 0.009), coil: coil ? mkRod(M.spring, (rBody || 0.022) + 0.016) : null, top, bot };
      shocks.push(s); return s;
    }

    // ---------------------------------------------------------------- the frame (black tube)
    const fz = (d) => zF + d;                 // (frame stations: metres back from the front axle)
    for (const sx of [-1, 1]) {
      // lower rails, the upper rails up to the steering head and back under the seat, the rear subframe
      tubes(body, [V3(sx * 0.12, 0.26, fz(-0.3)), V3(sx * 0.13, 0.22, fz(0.1)), V3(sx * 0.15, 0.22, fz(0.62)), V3(sx * 0.15, 0.34, fz(0.78))], 0.016, M.frame);
      tubes(body, [V3(sx * 0.1, 0.5, fz(-0.3)), V3(sx * 0.08, 0.7, fz(0.08)), V3(sx * 0.11, 0.66, fz(0.45)), V3(sx * 0.14, 0.66, fz(Lb + 0.1))], 0.016, M.frame);
      tubeAB(body, V3(sx * 0.12, 0.26, fz(-0.3)), V3(sx * 0.1, 0.5, fz(-0.3)), 0.016, M.frame);
      tubeAB(body, V3(sx * 0.13, 0.22, fz(0.1)), V3(sx * 0.08, 0.7, fz(0.08)), 0.015, M.frame);
      tubeAB(body, V3(sx * 0.15, 0.34, fz(0.78)), V3(sx * 0.13, 0.66, fz(0.62)), 0.015, M.frame);
      tubeAB(body, V3(sx * 0.15, 0.34, fz(0.78)), V3(sx * 0.14, 0.62, fz(Lb + 0.1)), 0.014, M.frame);
    }
    for (const d of [-0.3, 0.1, 0.62]) tubeAB(body, V3(-0.13, 0.23, fz(d)), V3(0.13, 0.23, fz(d)), 0.013, M.frame);
    // skid plate
    add(body, rbox(0.3, 0.012, 0.75, 0.005), M.alu, 0, 0.2, fz(0.22));

    // ---------------------------------------------------------------- the engine: an air-cooled single, its cylinder
    // leaning forward with the fins, the carb and the airbox behind it
    const eng = new THREE.Group(); eng.position.set(0, 0, fz(0.32)); body.add(eng);
    add(eng, rbox(0.26, 0.24, 0.36, 0.05), M.engine, 0, 0.36, 0.05);                                                // crankcase
    add(eng, cylX(0.11, 0.11, 0.06, 28), M.engine, -0.15, 0.36, 0.06);                                             // (the magneto cover, left)
    add(eng, cylX(0.09, 0.09, 0.05, 28), M.alu, 0.15, 0.37, 0.0);                                                  // (the clutch cover, right)
    { const cyl = new THREE.Group(); cyl.position.set(0, 0.46, -0.08); cyl.rotation.x = -0.45; eng.add(cyl);
      add(cyl, new THREE.CylinderGeometry(0.055, 0.06, 0.2, 20), M.engine, 0, 0.1, 0);
      for (let k = 0; k < 8; k++) add(cyl, rbox(0.17, 0.008, 0.15, 0.003), M.fins, 0, 0.03 + k * 0.022, 0);
      add(cyl, rbox(0.15, 0.06, 0.13, 0.02), M.engine, 0, 0.22, 0);
      add(cyl, rbox(0.13, 0.03, 0.11, 0.012), M.alu, 0, 0.265, 0); }
    add(eng, cylZ(0.035, 0.03, 0.09, 14), M.alu, 0, 0.56, 0.1, -0.2, 0, 0);                                        // carb
    add(eng, rbox(0.2, 0.14, 0.18, 0.04), M.black, 0, 0.6, 0.26);                                                   // airbox
    if (TURBO) {
      // the turbo hung off the header on the right, its intercooler pipe up to the throttle body
      add(eng, new THREE.SphereGeometry(0.06, 16, 12), M.alu, 0.2, 0.52, -0.14);
      add(eng, cylX(0.045, 0.045, 0.07, 18), M.alu, 0.25, 0.52, -0.14);
      pipe(eng, [V3(0.22, 0.56, -0.14), V3(0.24, 0.66, -0.02), V3(0.12, 0.66, 0.1), V3(0.03, 0.6, 0.12)], 0.022, M.alu);
      add(eng, rbox(0.14, 0.1, 0.03, 0.01), M.black, 0.16, 0.48, 0.12);
    }
    // the exhaust: out of the head, back along the right side inside the plastics, then out behind the footwell into the
    // silver muffler - a polished canister on the right above the front of the rear tyre (inboard of it), under the
    // rear fender's leading edge, tipped up a little toward the back, strapped to the frame
    { const hp = V3(0.04, 0.6, -0.27);
      const mz0 = fz(Lb - 0.46), mz1 = fz(Lb - 0.06), mr = 0.052, my = 0.585, mx = 0.245 + (RACE ? 0.02 : 0), tilt = 0.1, ml = mz1 - mz0;
      const lift = (dz) => Math.sin(tilt) * dz;           // (the canister's centre line rising toward the back)
      pipe(body, [hp.clone().add(V3(0, 0, fz(0.32))), V3(0.11, 0.52, fz(0.14)), V3(0.14, 0.5, fz(0.42)), V3(0.15, 0.52, mz0 - 0.07), V3(mx - 0.05, my + lift(-ml / 2) - 0.012, mz0 - 0.02), V3(mx, my + lift(-ml / 2) - 0.004, mz0 + 0.03)], 0.022, M.chrome);
      const mf = new THREE.Group(); mf.position.set(mx, my, (mz0 + mz1) / 2); mf.rotation.x = -tilt; body.add(mf);
      add(mf, cylZ(mr, mr, ml, 28), M.muffler, 0, 0, 0);
      add(mf, cylZ(mr + 0.004, mr + 0.004, 0.024, 28), M.alu, 0, 0, -ml / 2);
      add(mf, cylZ(mr + 0.004, mr + 0.004, 0.03, 28), M.engine, 0, 0, ml / 2);              // (the dark end cap)
      add(mf, cylZ(0.021, 0.021, 0.05, 14), M.chrome, 0, -0.012, ml / 2 + 0.03);           // (the tip)
      // (two straps round it to the frame)
      for (const dz of [-0.1, 0.1]) {
        add(mf, new THREE.TorusGeometry(mr + 0.003, 0.005, 6, 28), M.frame, 0, 0, dz, 0, 0, 0);
        tubeAB(body, V3(0.14, my + lift(dz) + 0.01, (mz0 + mz1) / 2 + dz), V3(mx - mr, my + lift(dz) + 0.01, (mz0 + mz1) / 2 + dz), 0.008, M.frame);
      }
      const tp = V3(mx, my + lift(ml / 2) - 0.012, mz1 + 0.06); tips.push(toRoot(tp)); }

    // ---------------------------------------------------------------- the plastics
    // the nose and the tank: one red shell from the pointed nose back to the seat
    const nose = [
      { z: fz(-0.43), w: 0.1, yb: 0.49, yt: 0.6, n: 3.4 }, { z: fz(-0.38), w: 0.14, yb: 0.45, yt: 0.63, n: 3.4 }, { z: fz(-0.28), w: 0.18, yb: 0.43, yt: 0.66, n: 3.4 },
      { z: fz(-0.12), w: 0.2, yb: 0.43, yt: 0.7, n: 3.4 }, { z: fz(0.02), w: 0.19, yb: 0.47, yt: 0.73, n: 3.4 }, { z: fz(0.2), w: 0.18, yb: 0.52, yt: 0.78, n: 3 },
      { z: fz(0.36), w: 0.19, yb: 0.54, yt: 0.82, n: 2.8 }, { z: fz(0.48), w: 0.16, yb: 0.58, yt: 0.8, n: 2.6 },
    ];
    add(body, loft(nose, 36), M.paint, 0, 0, 0);
    // (its vents: a black grille across the nose's top, two slots each side of it)
    { const vg = add(body, rbox(0.22, 0.012, 0.16, 0.005), M.gloss, 0, 0.674, fz(-0.2), -0.18, 0, 0);
      for (let k = 0; k < 4; k++) add(body, rbox(0.2, 0.006, 0.012, 0.002), M.plastic, 0, 0.684 - k * 0.0065, fz(-0.26) + k * 0.034, -0.18, 0, 0, false);
      void vg;
      for (const sx of [-1, 1]) add(body, rbox(0.012, 0.05, 0.14, 0.004), M.plastic, sx * 0.17, 0.62, fz(-0.12), 0, 0, -sx * 0.3); }
    // the headlamp: an angular cluster in the nose's face - a black housing, a lit lens each side of the point, the
    // amber markers on the corners
    const hzc = fz(-0.44);
    add(body, rbox(0.21, 0.085, 0.04, 0.02), M.gloss, 0, 0.545, hzc + 0.012);
    for (const sx of [-1, 1]) {
      const h = new THREE.Group(); h.position.set(sx * 0.052, 0.548, hzc - 0.008); h.rotation.set(0, -sx * 0.32, sx * 0.14); body.add(h);
      add(h, rbox(0.1, 0.05, 0.014, 0.012), M.head, 0, 0, 0, 0, 0, 0, false);
      add(h, new THREE.CircleGeometry(0.017, 18), M.lens, sx * 0.018, 0.0, -0.0075, 0, Math.PI, 0, false);
      add(h, new THREE.TorusGeometry(0.018, 0.003, 6, 18), M.chrome, sx * 0.018, 0.0, -0.008, 0, 0, 0, false);
    }
    add(body, rbox(0.05, 0.03, 0.012, 0.008), M.gloss, 0, 0.51, hzc - 0.006);            // (the point between them)
    // silver side panels on the tank and the black panels below them
    for (const sx of [-1, 1]) {
      add(body, plate([[fz(0.0), 0.56], [fz(0.08), 0.72], [fz(0.3), 0.77], [fz(0.44), 0.74], [fz(0.4), 0.6], [fz(0.18), 0.55]], 0.008, sx > 0 ? 0.185 : -0.193), M.silver, 0, 0, 0);
      add(body, plate([[fz(0.02), 0.5], [fz(0.18), 0.54], [fz(0.42), 0.58], [fz(0.48), 0.5], [fz(0.3), 0.44], [fz(0.05), 0.44]], 0.008, sx > 0 ? 0.175 : -0.183), M.plastic, 0, 0, 0);
    }
    // the front fenders: sweeping from the beak over the wheel and back down into the footwell
    const fx0 = 0.17, fx1 = HXF + WF / 2 + 0.04 + wide * 0.4;
    const fPath = [[zF - 0.3, 0.43], [zF - 0.43, 0.515], [zF - 0.31, 0.6], [zF - 0.12, 0.668], [zF + 0.1, 0.672], [zF + 0.24, 0.62], [zF + 0.32, 0.5], [zF + 0.345, 0.36]];
    for (const sx of [-1, 1]) {
      const fg = fender(fPath, fx0, fx1, 0.085, sx, 0.012);
      add(body, fg, M.paint, 0, 0, 0); add(body, fg, M.under, 0, 0, 0, 0, 0, 0, false);
      // (a silver flash down the fender's flank)
      add(body, fender([[zF + 0.05, 0.665], [zF + 0.2, 0.62], [zF + 0.28, 0.54]], fx1 - 0.08, fx1 - 0.015, 0.03, sx, 0.004).translate(0, 0.006, 0), M.silver, 0, 0, 0, 0, 0, 0, false);
    }
    // the rear fenders and the tail between them under the rack
    const rx1 = HXR + WRr / 2 + 0.04 + wide * 0.4;
    // (their leading edges stop high, over the front of the tyres - the muffler, the frame and the shock show under them)
    const rPath = [[zRb - 0.27, 0.645], [zRb - 0.22, 0.69], [zRb - 0.1, 0.72], [zRb + 0.06, 0.73], [zRb + 0.3, 0.71], [zRb + 0.42, 0.62], [zRb + 0.45, 0.5]];
    for (const sx of [-1, 1]) { const rg = fender(rPath, 0.16, rx1, 0.085, sx, 0.012); add(body, rg, M.paint, 0, 0, 0); add(body, rg, M.under, 0, 0, 0, 0, 0, 0, false); }
    add(body, rbox(0.34, 0.2, 0.05, 0.02), M.plastic, 0, 0.6, zRb + 0.4);
    for (const sx of [-1, 1]) {
      add(body, rbox(0.07, 0.035, 0.02, 0.008), M.tail, sx * 0.1, 0.66, zRb + 0.43, 0, 0, 0, false);
      add(body, rbox(0.028, 0.028, 0.01, 0.006), M.red, sx * 0.14, 0.58, zRb + 0.43, 0, 0, 0, false);
    }
    add(body, rbox(0.13, 0.08, 0.008, 0.004), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5 }), 0, 0.55, zRb + 0.435, -0.1, 0, 0);   // plate
    // footwells: a black floor each side from the front fender back to the rear one, a lip up the outside
    for (const sx of [-1, 1]) {
      const x0 = 0.17, x1 = 0.44 + wide, z0 = zF + 0.3, z1 = zRb - 0.34;
      add(body, rbox(x1 - x0, 0.016, z1 - z0, 0.006), M.plastic, sx * (x0 + x1) / 2, 0.29, (z0 + z1) / 2);
      for (let k = 0; k < 5; k++) add(body, rbox(x1 - x0 - 0.04, 0.008, 0.012, 0.003), M.black, sx * (x0 + x1) / 2, 0.3, z0 + 0.06 + k * (z1 - z0 - 0.12) / 4);   // (the grip ribs)
      add(body, rbox(0.012, 0.05, z1 - z0, 0.004), M.plastic, sx * x1, 0.31, (z0 + z1) / 2);
      add(body, rbox(0.1, 0.022, 0.05, 0.008), M.alu, sx * (x0 + 0.08), 0.315, fz(0.62));              // (the footpeg)
      // (the heel guard: a black plate standing up at the footwell's back end, slots through it)
      add(body, rbox(x1 - x0 - 0.02, 0.2, 0.012, 0.004), M.plastic, sx * ((x0 + x1) / 2 + 0.01), 0.4, z1 + 0.005, 0.12, 0, 0);
      for (let k = 0; k < 3; k++) add(body, rbox(0.035, 0.11, 0.004, 0.0015), M.black, sx * (x0 + 0.06 + k * (x1 - x0 - 0.1) / 2), 0.41, z1 - 0.004, 0.12, 0, 0, false);
      // the race quads' nerf bars: a tube loop outside each footwell, front fender to rear
      if (RACE) tubes(body, [V3(sx * 0.3, 0.42, z0 - 0.02), V3(sx * (x1 + 0.06), 0.36, z0 + 0.06), V3(sx * (x1 + 0.06), 0.36, z1 - 0.06), V3(sx * 0.3, 0.42, z1 + 0.02)], 0.014, M.frame);
    }
    // the seat: long and black, from the tank back over the rear fenders
    add(body, loft([{ z: fz(0.42), w: 0.1, yb: 0.74, yt: 0.8, n: 3 }, { z: fz(0.52), w: 0.15, yb: 0.72, yt: 0.83, n: 3.2 }, { z: fz(0.75), w: 0.16, yb: 0.7, yt: 0.86, n: 3.4 },
      { z: fz(1.0), w: 0.16, yb: 0.7, yt: 0.86, n: 3.4 }, { z: fz(Lb + 0.12), w: 0.15, yb: 0.7, yt: 0.85, n: 3.2 }, { z: fz(Lb + 0.2), w: 0.11, yb: 0.72, yt: 0.82, n: 3 }], 32), M.seat, 0, 0, 0);
    add(body, rbox(0.33, 0.012, 0.5, 0.005), M.black, 0, 0.705, fz(0.85));
    // the front bumper (the 200): a tube guard round the nose with its uprights, the round marker lamps on its ends;
    // the race quads: a small grab bar
    if (SPORT) {
      const bz = zF - 0.52;
      tubes(body, [V3(-0.24, 0.3, zF - 0.3), V3(-0.24, 0.32, bz + 0.04), V3(-0.2, 0.32, bz), V3(0.2, 0.32, bz), V3(0.24, 0.32, bz + 0.04), V3(0.24, 0.3, zF - 0.3)], 0.017, M.frame);
      tubes(body, [V3(-0.2, 0.32, bz), V3(-0.2, 0.6, bz + 0.03), V3(-0.13, 0.65, bz + 0.05), V3(0.13, 0.65, bz + 0.05), V3(0.2, 0.6, bz + 0.03), V3(0.2, 0.32, bz)], 0.016, M.frame);
      for (const sx of [-1, 1]) { tubeAB(body, V3(sx * 0.12, 0.32, bz), V3(sx * 0.12, 0.64, bz + 0.05), 0.012, M.frame); tubeAB(body, V3(sx * 0.2, 0.47, bz + 0.015), V3(sx * 0.12, 0.42, zF - 0.33), 0.012, M.frame); }
      for (const sx of [-1, 1]) {
        add(body, cylZ(0.024, 0.024, 0.03, 16), M.black, sx * 0.24, 0.42, bz + 0.03);
        add(body, new THREE.CircleGeometry(0.019, 16), sx < 0 ? M.red : M.amber, sx * 0.24, 0.42, bz + 0.014, 0, Math.PI, 0, false);
      }
    } else tubes(body, [V3(-0.16, 0.42, zF - 0.4), V3(-0.12, 0.38, zF - 0.5), V3(0.12, 0.38, zF - 0.5), V3(0.16, 0.42, zF - 0.4)], 0.016, M.frame);
    // the rear rack (the 200): a tube grid over the back with a raised rail at its tail; the race quads: a grab bar
    if (SPORT) {
      const y = 0.88, z0 = zRb - 0.12, z1 = zRb + 0.4, hw = 0.29;
      tubes(body, [V3(-hw, y, z0), V3(-hw, y, z1), V3(hw, y, z1), V3(hw, y, z0), V3(-hw, y, z0)], 0.012, M.frame);
      for (const x of [-0.18, -0.06, 0.06, 0.18]) tubeAB(body, V3(x, y, z0), V3(x, y, z1), 0.008, M.frame);
      tubes(body, [V3(-hw, y, z1 - 0.15), V3(-hw, y + 0.08, z1 - 0.1), V3(-hw + 0.02, y + 0.09, z1), V3(hw - 0.02, y + 0.09, z1), V3(hw, y + 0.08, z1 - 0.1), V3(hw, y, z1 - 0.15)], 0.011, M.frame);
      for (const sx of [-1, 1]) { tubeAB(body, V3(sx * hw, y, z0 + 0.05), V3(sx * 0.14, 0.66, z0 + 0.02), 0.011, M.frame); tubeAB(body, V3(sx * hw, y, z1 - 0.02), V3(sx * 0.15, 0.62, zRb + 0.22), 0.011, M.frame); }
    } else tubes(body, [V3(-0.14, 0.74, zRb + 0.3), V3(-0.12, 0.8, zRb + 0.42), V3(0.12, 0.8, zRb + 0.42), V3(0.14, 0.74, zRb + 0.3)], 0.014, M.frame);

    // ---------------------------------------------------------------- the handlebars: turn about the raked column with the
    // front wheels - the riser clamp, the bar, grips, levers and the thumb throttle, the dash pod in the middle
    const RAKE = 0.42, headP = V3(0, 0.74, fz(0.06));
    const axis = V3(0, Math.cos(RAKE), Math.sin(RAKE));
    const bars = new THREE.Group(); bars.position.copy(headP); body.add(bars);
    const at = (x, y, z) => V3(x - headP.x, y - headP.y, z - headP.z);
    const clampP = at(0, 0.97, fz(0.16)), gripP = (sx) => at(sx * 0.4, 1.0, fz(0.24));
    tubeAB(bars, at(0, 0.8, fz(0.1)), clampP, 0.018, M.frame);
    add(bars, rbox(0.07, 0.03, 0.07, 0.012), M.black, ...at(0, 0.79, fz(0.1)).toArray());   // (the boot round it)
    add(bars, rbox(0.1, 0.035, 0.05, 0.012), M.alu, ...clampP.toArray());
    pipe(bars, [gripP(-1).add(V3(0.06, 0, 0)), at(-0.2, 1.0, fz(0.2)), at(-0.08, 0.98, fz(0.16)), at(0.08, 0.98, fz(0.16)), at(0.2, 1.0, fz(0.2)), gripP(1).add(V3(-0.06, 0, 0))], 0.012, M.frame);
    for (const sx of [-1, 1]) {
      add(bars, cylX(0.019, 0.019, 0.12, 14), M.rubber, ...gripP(sx).toArray());
      add(bars, rbox(0.05, 0.045, 0.05, 0.012), M.black, ...gripP(sx).add(V3(-sx * 0.09, 0.005, 0)).toArray());
      const lev = add(bars, rbox(0.15, 0.012, 0.018, 0.005), M.alu, ...gripP(sx).add(V3(-sx * 0.03, 0.02, -0.06)).toArray()); lev.rotation.y = sx * 0.2;
      add(bars, rbox(0.028, 0.04, 0.02, 0.006), M.black, ...gripP(sx).add(V3(-sx * 0.1, -0.02, -0.03)).toArray());   // (the thumb throttle / switches)
    }
    // the dash pod: a small black cowl on the clamp with the display facing back at the rider
    const pod = new THREE.Group(); pod.position.copy(clampP).add(V3(0, 0.05, -0.02)); pod.rotation.x = -0.5; bars.add(pod);
    add(pod, rbox(0.16, 0.08, 0.06, 0.02), M.black, 0, 0, 0);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const cTex = new THREE.CanvasTexture(cv); cTex.colorSpace = THREE.SRGBColorSpace;
    add(pod, new THREE.PlaneGeometry(0.13, 0.062), new THREE.MeshBasicMaterial({ map: cTex, toneMapped: false }), 0, 0.002, 0.031, 0, 0, 0, false);
    const cg = cv.getContext('2d');
    function drawCluster(t) {
      cg.fillStyle = '#07090b'; cg.fillRect(0, 0, 512, 256);
      const r = clamp(t.rpm / (t.redline || 8000), 0, 1.1);
      for (let k = 0; k < 12; k++) { cg.fillStyle = r > 0.25 + k * 0.06 ? (k < 8 ? '#29ff5a' : k < 10 ? '#ffd21a' : '#ff2a1a') : '#1b1f22'; cg.fillRect(14 + k * 40, 10, 34, 22); }
      cg.fillStyle = '#e8f0f4'; cg.font = 'bold 120px Arial'; cg.textAlign = 'left'; cg.textBaseline = 'middle'; cg.fillText(String(Math.round(t.speedMph)), 16, 130);
      cg.font = 'bold 34px Arial'; cg.fillStyle = '#8fb2c6'; cg.fillText('MPH', 20, 216);
      cg.fillStyle = '#ffffff'; cg.font = 'bold 96px Arial'; cg.textAlign = 'right'; cg.fillText(t.gear.replace(/^[DM](?=\d)/, '') || 'N', 496, 130);
      cTex.needsUpdate = true;
    }
    const SW = new THREE.Group(); bars.add(SW);

    // ---------------------------------------------------------------- wheels: silver split-spoke 10 in alloys (the dark
    // barrel behind the spokes), knobbies - square knobs staggered across the tread, lugs down the shoulders
    function carcass(R, W, rimR) {
      return latheX([[rimR + 0.005, -W * 0.46], [R - 0.1 * R, -W * 0.53], [R - 0.035 * R, -W * 0.5], [R - 0.004, -W * 0.38], [R - 0.004, W * 0.38],
        [R - 0.035 * R, W * 0.5], [R - 0.1 * R, W * 0.53], [rimR + 0.005, W * 0.46]], 48);
    }
    function blocks(R, W, N, rows, bh, dir) {        // rows: [[x offset / W, block width / W, block len (share of the pitch), stagger]]
      const list = [];
      for (let k = 0; k < N; k++) for (const [ox, bw, bl, st] of rows) {
        const phi = (k + (st || 0)) * Math.PI * 2 / N, b = new THREE.BoxGeometry(bw * W, bh, 2 * Math.PI * R / N * bl);
        b.rotateY(dir * 0.2 * Math.sign(ox)); b.translate(ox * W, R + bh / 2 - 0.004, 0); b.rotateX(phi); list.push(b);
      }
      return mergeGeos(list);
    }
    const rimR = 0.127;
    function rim(g, W) {
      add(g, cylX(rimR, rimR, W * 0.84, 32, true), M.rimDark, 0, 0, 0);
      const fx = W * 0.3;
      add(g, cylX(rimR * 0.95, rimR * 0.95, 0.008, 32), M.rimDark, fx - 0.03, 0, 0);
      // eight split spokes from the hub to the rim
      for (let k = 0; k < 8; k++) for (const da of [-0.09, 0.09]) {
        const a = k * Math.PI / 4 + da, a1 = k * Math.PI / 4 + da * 1.7;
        const s = add(g, rbox(0.012, rimR * 0.66, 0.016, 0.004), M.rim, fx, 0, 0);
        s.geometry.translate(0, rimR * 0.5, 0); s.rotation.x = (a + a1) / 2;
      }
      add(g, new THREE.TorusGeometry(rimR * 0.97, 0.009, 8, 36), M.rim, fx - 0.004, 0, 0, 0, Math.PI / 2, 0);
      add(g, cylX(0.04, 0.045, 0.03, 20), M.rim, fx, 0, 0);
      add(g, cylX(0.018, 0.018, 0.012, 12), M.rimDark, fx + 0.016, 0, 0);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; add(g, cylX(0.006, 0.006, 0.012, 8), M.chrome, fx + 0.014, Math.cos(a) * 0.028, Math.sin(a) * 0.028); }
    }
    const knob = (R, W, N) => blocks(R - 0.016, W, N, [[0.15, 0.24, 0.42, 0], [-0.15, 0.24, 0.42, 0.5], [0.4, 0.2, 0.4, 0.25], [-0.4, 0.2, 0.4, 0.75]], 0.022, 1);
    const tyF = carcass(RF - 0.016, WF, rimR), trF = knob(RF, WF, 18);
    const tyR = carcass(RR - 0.016, WRr, rimR), trR = TURBO ? null : knob(RR, WRr, 20);
    const slickR = TURBO ? carcass(RR, WRr, rimR) : null;
    // (the package: sand paddles on the back, ribbed fronts)
    const tyP = carcass(RR - 0.004, 0.28, rimR);
    const pad = []; for (let k = 0; k < 10; k++) { const b = new THREE.BoxGeometry(0.26, 0.026, 0.018); b.translate(0, RR + 0.008, 0); b.rotateX(k * Math.PI * 2 / 10); pad.push(b); }
    const padG = mergeGeos(pad);
    const ribF = []; for (const ox of [-0.3, 0, 0.3]) { const t = new THREE.TorusGeometry(RF - 0.004, 0.008, 6, 40); t.rotateY(Math.PI / 2); t.translate(ox * WF, 0, 0); ribF.push(t); }
    const ribG = mergeGeos(ribF), tyRib = carcass(RF - 0.004, WF, rimR);
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1, R = frontW ? RF : RR, HX = frontW ? HXF : HXR;
      const corner = new THREE.Group(); corner.position.set(side * HX, R - cgH, (frontW ? zF : zR) + zOff); rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      const spin = new THREE.Group(); flip.add(spin);
      const w = { corner, flip, spin, left, front: frontW, side, stock: [], pkg: [] };
      if (frontW) {
        w.stock.push(add(spin, tyF, M.rubber, 0, 0, 0), add(spin, trF, M.rubber, 0, 0, 0));
        w.pkg.push(add(spin, tyRib, M.rubber, 0, 0, 0), add(spin, ribG, M.rubber, 0, 0, 0));
        rim(spin, WF);
        add(flip, cylX(0.075, 0.075, 0.008, 24), M.alu, -WF * 0.32, 0, 0);                       // (the brake disc)
        add(flip, rbox(0.03, 0.05, 0.04, 0.008), M.black, -WF * 0.36, 0.06, 0.03);              // (its caliper)
      } else {
        w.stock.push(add(spin, TURBO ? slickR : tyR, M.rubber, 0, 0, 0)); if (trR) w.stock.push(add(spin, trR, M.rubber, 0, 0, 0));
        w.pkg.push(add(spin, tyP, M.rubber, 0, 0, 0), add(spin, padG, M.rubber, 0, 0, 0));
        rim(spin, WRr);
      }
      for (const m of w.pkg) m.visible = false;
      wheels.push(w);
    }
    // ---------------------------------------------------------------- suspension
    // front: double A-arms from the frame to each knuckle, a red coil-over from the lower arm up to the frame
    for (const i of [0, 1]) {
      const sx = i === 0 ? -1 : 1, ax = sx * 0.13;
      for (const [y, oy] of [[0.3, -0.07], [0.46, 0.07]]) {
        link(M.frame, 0.013, V3(ax, y, zF - 0.1), { w: i, o: V3(-sx * 0.06, oy, 0) });
        link(M.frame, 0.013, V3(ax, y, zF + 0.1), { w: i, o: V3(-sx * 0.06, oy, 0) });
      }
      link(M.alu, 0.022, { w: i, o: V3(-sx * 0.06, -0.075, 0) }, { w: i, o: V3(-sx * 0.06, 0.075, 0) });   // (the knuckle)
      shock(V3(sx * 0.15, 0.68, zF - 0.03), { w: i, o: V3(-sx * 0.12, -0.04, 0) }, true, 0.02);
    }
    // back: the swingarm from its pivot to the axle, the axle tube, one shock in the middle, the chain on the left
    const piv = V3(0, 0.33, fz(0.62));
    for (const sx of [-1, 1]) link(M.frame, 0.024, V3(sx * 0.12, piv.y, piv.z), { w: [2, 3], t: 0.5, o: V3(sx * 0.13, 0.0, -0.02) });
    link(M.frame, 0.03, { w: 2, o: V3(0.06, 0, 0) }, { w: 3, o: V3(-0.06, 0, 0) });
    shock(V3(0, 0.68, fz(0.78)), { w: [2, 3], t: 0.5, o: V3(0, 0.07, -0.22) }, true, 0.024);
    link(M.black, 0.012, V3(-0.18, 0.4, fz(0.42)), { w: 2, o: V3(0.11, 0.06, 0) });
    link(M.black, 0.012, V3(-0.18, 0.32, fz(0.42)), { w: 2, o: V3(0.11, -0.06, 0) });
    const sprk = new THREE.Mesh(cylX(0.1, 0.1, 0.008, 28), M.alu); dyn.add(sprk);
    const rDisc = new THREE.Mesh(cylX(0.09, 0.09, 0.008, 28), M.alu); dyn.add(rDisc);
    // (the turbo drag quad's wheelie bar: off the axle, back to two small wheels)
    let wbar = null;
    if (TURBO) {
      wbar = new THREE.Group(); dyn.add(wbar);
      for (const sx of [-1, 1]) { tubeAB(wbar, V3(sx * 0.12, 0, 0), V3(sx * 0.22, -RR + 0.1, 0.95), 0.014, M.frame); add(wbar, cylX(0.04, 0.04, 0.03, 16), M.alu, sx * 0.22, -RR + 0.07, 0.95); }
      tubeAB(wbar, V3(-0.22, -RR + 0.1, 0.95), V3(0.22, -RR + 0.1, 0.95), 0.012, M.frame);
    }
    // the lamps' beams
    for (const sx of [-1, 1]) {
      const sl = new THREE.SpotLight(0xf2f4ff, 0, 60, 0.5, 0.45, 1.4);
      sl.position.copy(toRoot(V3(sx * 0.07, 0.56, zF - 0.42))); sl.target.position.copy(toRoot(V3(sx * 0.4, 0, zF - 30)));
      rootG.add(sl); rootG.add(sl.target); sl.visible = false; spots.push(sl);
    }

    // ---------------------------------------------------------------- the rider: sat on the seat, feet on the pegs, hands
    // on the grips; the torso leans and the hips slide across the seat into a turn
    const rider = new THREE.Group(); body.add(rider);
    const hip = V3(0, 0.93, fz(0.78));
    const upper = new THREE.Group(); upper.position.copy(hip); rider.add(upper);
    const lean = 0.42;                        // (forward, from upright)
    // (a point on the upper body - y up the spine, z back - with the lean applied)
    const tor = (x, y, z) => V3(x, y * Math.cos(lean) + z * Math.sin(lean), -y * Math.sin(lean) + z * Math.cos(lean));
    { const torso = [[-0.04, 0.15, 0.1, 0.11], [0.1, 0.15, 0.1, 0.1], [0.26, 0.17, 0.11, 0.1], [0.4, 0.2, 0.1, 0.1], [0.48, 0.19, 0.08, 0.09], [0.54, 0.09, 0.05, 0.06]];
      const tg = loft(torso.map(([hh, w, dF, dB]) => ({ z: hh, w, yb: -dB, yt: dF, n: 2.6 })), 28); tg.rotateX(-Math.PI / 2); tg.rotateX(-lean);
      add(upper, tg, M.jacket, 0, 0, 0); }
    const neck = tor(0, 0.6, 0), hd = tor(0, 0.75, -0.015);
    add(upper, new THREE.CylinderGeometry(0.05, 0.055, 0.14, 14), M.jacket, neck.x, neck.y, neck.z, -lean, 0, 0);
    { const hm = add(upper, new THREE.SphereGeometry(0.14, 26, 18), M.helmet, hd.x, hd.y, hd.z); hm.scale.set(0.95, 1, 1.1);
      const vs = add(upper, new THREE.SphereGeometry(0.146, 26, 12, -Math.PI / 2 - 0.85, 1.7, 1.18, 0.55), M.visor, hd.x, hd.y, hd.z, 0, 0, 0, false); vs.scale.set(0.95, 1, 1.1);
      add(upper, new THREE.TorusGeometry(0.142, 0.012, 6, 32), M.jacket, hd.x, hd.y - 0.005, hd.z, Math.PI / 2, 0, 0, false);
      const pk = add(upper, rbox(0.17, 0.012, 0.1, 0.005), M.helmet, hd.x, hd.y + 0.07, hd.z - 0.13); pk.rotation.x = -0.2; }   // (the peak)
    const shoulder = (sx) => tor(sx * 0.19, 0.47, 0);
    for (const sx of [-1, 1]) { const s = shoulder(sx); add(upper, new THREE.SphereGeometry(0.058, 14, 10), M.jacket, s.x, s.y, s.z); }
    // legs: thigh down to the knee out by the tank, shin to the boot on the peg
    for (const sx of [-1, 1]) {
      const hp = V3(sx * 0.1, hip.y, hip.z), ank = V3(sx * 0.27 + sx * wide * 0.6, 0.38, fz(0.6));
      limb(rider, hp, ank, 0.44, 0.43, V3(sx * 0.5, 0.6, -1), 0.075, 0.056, 0.045, M.pants);
      const boot = add(rider, rbox(0.1, 0.12, 0.27, 0.035), M.boot, ank.x, ank.y - 0.04, ank.z - 0.06); boot.rotation.x = 0.1;
    }
    // arms: rods from the (leaning) shoulders to the grips, bent at the elbows - placed every frame
    const arms = [-1, 1].map((sx) => ({ sx, up: mkRod(M.jacket, 0.045), fo: mkRod(M.jacket, 0.038), elb: new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), M.jacket), hand: new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), M.black) }));
    for (const a of arms) { a.elb.scale.setScalar(0.042); dyn.add(a.elb); dyn.add(a.hand); }
    // (the first-person eye: a touch back and up from the helmet's middle, so the bars and the dash are in view looking down)
    const eyeL = hd.clone().add(V3(0, 0.03, 0.12));
    const eye = toRoot(eyeL.clone().add(hip));

    // ---------------------------------------------------------------- per frame
    const _q = new THREE.Quaternion(), _sh = new THREE.Vector3(), _hand = new THREE.Vector3(), _pole = new THREE.Vector3(), _el = new THREE.Vector3(), _m4 = new THREE.Matrix4();
    let riderD = 0;
    function afterWheels() {
      // the bars turn about the raked column with the front wheels
      _q.setFromAxisAngle(axis, 0.5 * (wheels[0].corner.rotation.y + wheels[1].corner.rotation.y));
      bars.quaternion.copy(_q);
      for (const r of rods) { endPos(r.A, _a); endPos(r.B, _b); placeRod(r.m, _a, _b); }
      for (const s of shocks) {
        endPos(s.top, _a); endPos(s.bot, _b);
        _d.subVectors(_b, _a); const len = _d.length(); _d.normalize();
        const bl = Math.min(len * 0.55, 0.2);
        _e.copy(_a).addScaledVector(_d, bl); placeRod(s.body, _a, _e); placeRod(s.shaft, _e, _b);
        if (s.coil) placeRod(s.coil, _a.clone().addScaledVector(_d, 0.04), _b.clone().addScaledVector(_d, -0.03));
      }
      // the sprocket and the rear disc ride the axle
      const pl = wheels[2].corner.position, pr = wheels[3].corner.position;
      sprk.position.copy(pl).lerp(pr, 0.12); rDisc.position.copy(pl).lerp(pr, 0.82);
      if (wbar) wbar.position.copy(pl).lerp(pr, 0.5);
      // the arms: shoulder (where the leaning torso puts it) to the grip (where the turned bars put it), elbows out
      model.updateMatrixWorld(true);
      _m4.copy(rootG.matrixWorld).invert();
      for (const a of arms) {
        _sh.copy(shoulder(a.sx)); upper.localToWorld(_sh); _sh.applyMatrix4(_m4);
        _hand.copy(gripP(a.sx)); bars.localToWorld(_hand); _hand.applyMatrix4(_m4);
        const dd = _hand.clone().sub(_sh), len = Math.min(dd.length(), 0.6), dir = dd.normalize();
        const xx = len / 2, hh = Math.sqrt(Math.max(0, 0.3 * 0.3 - xx * xx));
        _pole.set(a.sx * 0.8, -0.4, 0.3); _pole.sub(dir.clone().multiplyScalar(_pole.dot(dir))).normalize();
        _el.copy(_sh).addScaledVector(dir, xx).addScaledVector(_pole, hh);
        placeRod(a.up, _sh, _el); placeRod(a.fo, _el, _hand); a.elb.position.copy(_el); a.hand.position.copy(_hand);
      }
    }
    // the rider hangs off the inside of a turn: hips across the seat, the upper body leaned in (riderD: the physics'
    // weight shift, m, + to the right)
    function setRider(speed, veh) {
      const d = veh && veh.riderD ? veh.riderD : 0;
      riderD += (d - riderD) * 0.3;
      rider.position.x = riderD * 0.35;
      upper.rotation.z = -riderD * 0.9;
    }
    function setPaint(name) { const c = PAINTS[name]; if (c !== undefined) M.paint.color.setHex(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 4 : (o.headlights ? 1.4 : 0.4);
      M.head.emissiveIntensity = o.headlights ? 3.5 : 0.25; M.amber.emissiveIntensity = o.headlights ? 1.4 : 0.3;
      for (const s of spots) { s.visible = !!o.headlights; s.intensity = o.headlights ? 140 : 0; }
    }
    function setTires(front, rear) {
      for (const w of wheels) {
        const t = w.front ? front : rear, pkg = t === 'atvRib' || t === 'atvPaddle';
        for (const m of w.stock) m.visible = !pkg; for (const m of w.pkg) m.visible = pkg;
      }
    }
    // cockpit view: the rider goes (the camera is in their helmet) - the arms too
    function setInteriorVisible(v, cp) { rider.visible = !cp; for (const a of arms) { a.up.visible = a.fo.visible = a.elb.visible = a.hand.visible = !cp; } }
    const noop = () => {};
    afterWheels();
    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel: SW, eye,
      exhaustTips: tips, materials: M, headlights: spots, tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission: noop, drawCluster, drawScreen: noop, setChute: noop,
      afterWheels, setRider, variant: 'atv', cls: VER,
    };
  }

  root.HCAtv = { build };
})(typeof self !== 'undefined' ? self : this);
