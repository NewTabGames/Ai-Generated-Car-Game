/* Hellcat Drive — procedural desert racers: the trophy truck and the dune buggy.
   Trophy truck: a fiberglass pickup body on a tube chassis - long flat hood with its black vent, huge black fender flares
   over 39 in desert tyres on black beadlocks with red rings, a grille full of stacked LED light bars behind a tube guard,
   round headlamps, a roof bar of spotlights, a short cab with net-window openings (the driver in the cage behind them),
   two spares and a chase light on the tube cage over the bed; long-travel A-arms at the front and a 4-link solid axle at
   the back, with coil-overs and bypass shocks - all following the physics' ~30 in of wheel travel every frame.
   Dune buggy: a VW sand rail - a red tube frame on a diamond-plate floor, a roll cage with two lamps on top, two high-back
   buckets, the battery box on the nose, a VW beam front end on yellow coil-overs, trailing arms at the back, the engine
   hung out behind the transaxle (a 1600 VW, a built 2276 on dual Webers, or an LS V8), polished five-spoke wheels.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build, plus afterWheels() (the game calls it once the wheels are placed). */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const CAR = opts.car === 'buggy' ? 'buggy' : 'trophy', TT = CAR === 'trophy';
    const VER = opts.engine || (TT ? 'tt' : 'vw');
    const cgH = opts.cgHeight || (TT ? 0.86 : 0.5), zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || (TT ? 1.716 : 1.426), cgToRear = opts.cgToRear || (TT ? 1.584 : 0.874);
    const L = cgToFront + cgToRear, zF = -L / 2, zR = L / 2;
    const RF = opts.wheelRadiusF || (TT ? 0.495 : 0.335), RR = opts.wheelRadiusR || (TT ? 0.495 : 0.367);
    const HXF = (opts.trackF || (TT ? 2.2 : 1.42)) / 2, HXR = (opts.trackR || (TT ? 2.2 : 1.5)) / 2;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || {};
    const rootG = new THREE.Group(); rootG.name = CAR;
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const toRoot = (v) => v.clone().add(V3(0, -cgH, zOff));

    // ---------------------------------------------------------------- helpers
    function canvasTex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      draw(g, w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData = { canvas: c }; return t;
    }
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
    // (a bent tube through points, with a joint ball at each bend)
    const tubes = (parent, pts, r, mat) => { for (let i = 1; i < pts.length; i++) tubeAB(parent, pts[i - 1], pts[i], r, mat); for (let i = 1; i < pts.length - 1; i++) add(parent, new THREE.SphereGeometry(r, 10, 8), mat, pts[i].x, pts[i].y, pts[i].z); };
    const pipe = (parent, pts, r, mat, seg) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 12, r, seg || 12, false), mat, 0, 0, 0);
    const cylX = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateZ(Math.PI / 2); return g; };
    const cylZ = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24); g.rotateX(Math.PI / 2); return g; };
    function latheX(pts, seg) {       // profile [[radius, x], ...] spun round the X axis
      const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg || 48);
      g.rotateZ(-Math.PI / 2); return g;
    }
    function mergeGeos(list) {
      const gs = list.map((g0) => { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); return g; });
      let n = 0; for (const g of gs) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of gs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
      const m = new THREE.BufferGeometry();
      m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      return m;
    }
    function smoothNormals(g, maxDeg) {
      const p = g.attributes.position, n = g.attributes.normal, cnt = p.count, cosMax = Math.cos(maxDeg * Math.PI / 180);
      const fn = new Float32Array(cnt * 3), groups = new Map();
      for (let i = 0; i < cnt; i++) {
        fn[i * 3] = n.getX(i); fn[i * 3 + 1] = n.getY(i); fn[i * 3 + 2] = n.getZ(i);
        const k = Math.round(p.getX(i) * 1000) + ',' + Math.round(p.getY(i) * 1000) + ',' + Math.round(p.getZ(i) * 1000);
        let l = groups.get(k); if (!l) groups.set(k, l = []); l.push(i);
      }
      for (const l of groups.values()) for (const i of l) {
        let x = 0, y = 0, z = 0;
        for (const j of l) { const d = fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2]; if (d >= cosMax) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; } }
        const il = 1 / (Math.hypot(x, y, z) || 1); n.setXYZ(i, x * il, y * il, z * il);
      }
      n.needsUpdate = true;
    }
    // a (z, y) profile extruded across the vehicle from x0: depth + 2 bevels thick
    function alongX(shape, opt, x0) {
      const g = new THREE.ExtrudeGeometry(shape, opt);
      g.rotateY(Math.PI / 2); g.scale(1, 1, -1);
      const idx = g.index ? g.index.array : null;                  // (the mirror turned the faces inside out)
      if (idx) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
      else { const p = g.attributes.position, u = g.attributes.uv; for (let k = 0; k < p.count; k += 3) for (const a of [p, u]) { const sz = a.itemSize; for (let c = 0; c < sz; c++) { const t = a.array[(k + 1) * sz + c]; a.array[(k + 1) * sz + c] = a.array[(k + 2) * sz + c]; a.array[(k + 2) * sz + c] = t; } } }
      g.translate(x0 + (opt.bevelEnabled ? opt.bevelThickness : 0), 0, 0);
      g.computeVertexNormals();
      return g;
    }
    // livery UVs on the flat sides (normals along +-x): left side in the canvas' top half, right side in its bottom half,
    // mirrored (the artwork's front is at its left on both)
    function sideUVs(g, z0, z1, y0, y1) {
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const nx = n.getX(i); if (Math.abs(nx) < 0.7) continue;
        const u = (p.getZ(i) - z0) / (z1 - z0), v = clamp((p.getY(i) - y0) / (y1 - y0), 0, 1);
        if (nx < 0) uv.setXY(i, u, 0.5 + 0.5 * v); else uv.setXY(i, 1 - u, 0.5 * v);
      }
      uv.needsUpdate = true;
    }
    function rrect(sh, x0, y0, x1, y1, r) {
      sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1);
      sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0); return sh;
    }
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');

    // ---------------------------------------------------------------- materials
    const paintHex = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : (TT ? 0xb3121a : 0xb01020);
    const M = {};
    M.paint = TT ? new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.15, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 })
      : new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.35, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2 });   // (powder-coated tube)
    M.black = new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.6, metalness: 0.2 });
    M.flare = new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.55, metalness: 0.1 });
    M.gloss = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.25, metalness: 0.4 });
    M.chassis = new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 0.45, metalness: 0.6 });
    M.guard = new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.35, metalness: 0.75 });
    M.cast = new THREE.MeshStandardMaterial({ color: 0x5d6066, roughness: 0.55, metalness: 0.7 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.07, metalness: 1 });
    M.polish = new THREE.MeshStandardMaterial({ color: 0xe4e6ea, roughness: 0.14, metalness: 1 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xaeb2b8, roughness: 0.4, metalness: 0.85 });
    M.red = new THREE.MeshStandardMaterial({ color: 0xc81a1a, roughness: 0.3, metalness: 0.6 });
    M.yellow = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.35, metalness: 0.4 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.93, metalness: 0 });
    M.seat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.8 });
    M.seatIn = new THREE.MeshStandardMaterial({ color: 0x5b5f64, roughness: 0.85 });
    M.suit = new THREE.MeshStandardMaterial({ color: TT ? 0x1b1d22 : 0x2a3446, roughness: 0.8 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: TT ? 0xf2f2f2 : 0x1a1a1c, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1014, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.35, envMapIntensity: 2, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    M.inner = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.85, side: THREE.DoubleSide });
    M.head = new THREE.MeshStandardMaterial({ color: 0xe8eef4, emissive: 0xf4f8ff, emissiveIntensity: 0.15, roughness: 0.15, metalness: 0.6 });
    M.led = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffd24a, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.3 });
    M.amber = new THREE.MeshStandardMaterial({ color: 0x8a4a06, emissive: 0xff8a10, emissiveIntensity: 0.3, roughness: 0.25 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x3a0306, emissive: 0xff1010, emissiveIntensity: 0.4, roughness: 0.25 });
    const tips = [], spots = [], rods = [];
    let steerWheel = new THREE.Group(), eye = V3(0, 1, 0), driver = null, cabShell = null, repaint = () => {};
    const cockpit = new THREE.Group(); model.add(cockpit);

    // per-frame links (A-arms, shocks, trailing arms): ends fixed to the chassis (model space) or riding on a wheel /
    // between two wheels (root space, off the hub centres)
    const tubeUnit = new THREE.CylinderGeometry(1, 1, 1, 12);
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    function placeRod(m, a, b) {
      _d.subVectors(b, a); const len = _d.length();
      m.position.addVectors(a, b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / Math.max(len, 1e-6)));
      m.scale.set(m.userData.r, len, m.userData.r);
    }
    const dyn = new THREE.Group(); rootG.add(dyn);
    // ends: V3 in model space (chassis) or { w: i, o: V3 } (off wheel i's hub) or { w: [i, j], t, o } (along an axle)
    function mkRod(mat, r) { const m = new THREE.Mesh(tubeUnit, mat); m.userData.r = r; m.castShadow = true; dyn.add(m); return m; }
    function link(mat, r, A, B) { const m = mkRod(mat, r); rods.push({ m, A, B }); return m; }
    function endPos(e, out) {
      if (e.isVector3) return out.copy(e).add(V3(0, -cgH, zOff));
      if (Array.isArray(e.w)) { const a = wheels[e.w[0]].corner.position, b = wheels[e.w[1]].corner.position; return out.copy(a).lerp(b, e.t).add(e.o); }
      return out.copy(wheels[e.w].corner.position).add(e.o);
    }
    // a shock: body at the chassis end, shaft to the other end, a coil over it (optional), a reservoir cap
    function shock(top, bot, col, coil, rBody) {
      const s = { body: mkRod(M.polish, rBody || 0.035), shaft: mkRod(M.chrome, 0.014), coil: coil ? mkRod(col, (rBody || 0.035) + 0.022) : null, cap: mkRod(col, (rBody || 0.035) + 0.008), top, bot };
      shocks.push(s); return s;
    }
    const shocks = [];

    // ---------------------------------------------------------------- wheels
    // tyre carcass: rounded sidewalls, flat tread; tread blocks merged into one geometry per tyre
    function carcass(R, W, rimR) {
      return latheX([[rimR + 0.005, -W * 0.46], [R - 0.08 * R, -W * 0.52], [R - 0.03 * R, -W * 0.49], [R - 0.004, -W * 0.4], [R - 0.004, W * 0.4],
        [R - 0.03 * R, W * 0.49], [R - 0.08 * R, W * 0.52], [rimR + 0.005, W * 0.46]], 56);
    }
    function blocks(R, W, N, rows, bh, dir) {        // rows: [[x offset / W, block width / W, block len (rad share), stagger]]
      const list = [];
      for (let k = 0; k < N; k++) for (const [ox, bw, bl, st] of rows) {
        const phi = (k + (st || 0)) * Math.PI * 2 / N, b = new THREE.BoxGeometry(bw * W, bh, 2 * Math.PI * R / N * bl);
        b.rotateY(dir * 0.18 * Math.sign(ox)); b.translate(ox * W, R + bh / 2 - 0.004, 0); b.rotateX(phi); list.push(b);
      }
      return mergeGeos(list);
    }
    const wheels = [];
    function makeWheels(buildWheel) {
      for (let i = 0; i < 4; i++) {
        const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1, R = frontW ? RF : RR, HX = frontW ? HXF : HXR;
        const corner = new THREE.Group(); corner.position.set(side * HX, R - cgH, (frontW ? zF : zR) + zOff); rootG.add(corner);
        const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
        const spin = new THREE.Group(); flip.add(spin);
        const w = { corner, flip, spin, left, front: frontW, side, stock: [], pkg: [] };
        buildWheel(w, R);
        wheels.push(w);
      }
    }

    // ---------------------------------------------------------------- the dash display
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const cTex = new THREE.CanvasTexture(cv); cTex.colorSpace = THREE.SRGBColorSpace;
    const cg = cv.getContext('2d');
    const dashMat = new THREE.MeshBasicMaterial({ map: cTex, toneMapped: false });
    function drawCluster(t) {
      cg.fillStyle = '#07090b'; cg.fillRect(0, 0, 512, 256);
      const r = clamp(t.rpm / (t.redline || 7000), 0, 1.1);
      for (let k = 0; k < 16; k++) { cg.fillStyle = r > 0.2 + k * 0.05 ? (k < 10 ? '#29ff5a' : k < 13 ? '#ffd21a' : '#ff2a1a') : '#1b1f22'; cg.fillRect(12 + k * 31, 10, 26, 20); }
      cg.fillStyle = '#e8f0f4'; cg.font = 'bold 110px Arial'; cg.textAlign = 'left'; cg.textBaseline = 'middle'; cg.fillText(String(Math.round(t.speedMph)), 16, 130);
      cg.font = 'bold 30px Arial'; cg.fillStyle = '#8fb2c6'; cg.fillText('MPH', 20, 215); cg.fillText(Math.round(t.rpm) + ' RPM', 150, 215);
      cg.fillStyle = '#ffffff'; cg.font = 'bold 96px Arial'; cg.textAlign = 'right'; cg.fillText(t.gear.replace(/^[DM](?=\d)/, '') || 'N', 496, 130);
      cTex.needsUpdate = true;
    }
    // the driver: seated at (x, hip y, hip z), hands on a wheel at hand y / z
    function makeDriver(parent, x, hy, hz, handY, handZ, lean) {
      const g = new THREE.Group(); parent.add(g);
      const ln = lean || 0, bz = Math.sin(ln);
      add(g, rbox(0.36, 0.52, 0.24, 0.09), M.suit, x, hy + 0.3, hz + 0.02 + 0.3 * bz, ln, 0, 0);
      const hd = V3(x, hy + 0.72, hz - 0.03 + 0.62 * bz);
      add(g, new THREE.SphereGeometry(0.14, 22, 16), M.helmet, hd.x, hd.y, hd.z);
      add(g, new THREE.SphereGeometry(0.143, 22, 12, -Math.PI / 2 - 0.85, 1.7, 1.25, 0.5), M.visor, hd.x, hd.y, hd.z, 0, 0, 0, false);
      for (const sx of [-1, 1]) {
        const sh = V3(x + sx * 0.17, hy + 0.5, hz + 0.5 * bz), hand = V3(x + sx * 0.17, handY, handZ), el = V3(x + sx * 0.25, hy + 0.3, (hz + handZ) / 2 + 0.05);
        tubeAB(g, sh, el, 0.045, M.suit); tubeAB(g, el, hand, 0.04, M.suit);
        add(g, new THREE.SphereGeometry(0.042, 10, 8), M.black, hand.x, hand.y, hand.z);
        const kn = V3(x + sx * 0.1, hy + 0.1, hz - 0.45), ft = V3(x + sx * 0.1, hy - 0.2, hz - 0.8);
        tubeAB(g, V3(x + sx * 0.1, hy, hz), kn, 0.065, M.suit); tubeAB(g, kn, ft, 0.05, M.suit);
      }
      return { g, head: hd };
    }

    // ================================================================ TROPHY TRUCK
    function buildTrophy() {
      const HW = 0.98, CHW = 0.9;
      // body side profile: the grille face, the long hood rising to the cowl, the deck under the cab, the bed side and
      // the tail - its bottom edge (the rocker) lifted into arches over the wheels
      const archC = 0.52, archR = 0.68;
      const archY = (z) => { let y = 0.9; for (const za of [zF, zR]) { const d = z - za; if (Math.abs(d) < archR) y = Math.max(y, archC + Math.sqrt(archR * archR - d * d)); } return y; };
      const hoodY = (z) => 1.28 + (z + 2.5) * 0.08;
      const BZ0 = -2.95, BZ1 = 2.8, BY0 = 0.86, BY1 = 1.56;
      // (NZ: the nose, ~0.35 m ahead of the front tyres; the cab from the cowl CB0 to its back wall CB1 is open down to
      // the floor FL - its sides are the doors, below)
      const NZ = -2.48, CB0 = -0.95, CB1 = 0.45, FL = 1.0;
      const side = new THREE.Shape();
      const top = [[NZ + 0.05, 0.92], [NZ, 1.0], [NZ, 1.16], [NZ + 0.06, 1.26], [-2.1, hoodY(-2.1)], [-1.8, hoodY(-1.8)], [CB0, 1.42], [CB0 + 0.02, FL], [CB1, FL], [CB1 + 0.02, 1.5], [2.66, 1.5], [2.75, 1.46], [2.78, 1.2], [2.74, 0.95]];
      side.moveTo(top[0][0], top[0][1]);
      for (let i = 1; i < top.length; i++) side.lineTo(top[i][0], top[i][1]);
      for (let k = 0; k <= 120; k++) { const z = 2.74 - k * (2.74 - NZ - 0.05) / 120; side.lineTo(z, archY(z)); }
      // the livery: the paint, a black rocker band, a white swoosh on the door, sponsor-style stickers on the bed side
      const livTex = canvasTex(2048, 1024, () => {});
      const drawLivery = (paint) => {
        const P = hex(paint), c = livTex.userData.canvas, g = c.getContext('2d'), W = c.width, H = c.height / 2;
        const zx = (z) => (z - BZ0) / (BZ1 - BZ0) * W, yy = (y) => (1 - (y - BY0) / (BY1 - BY0)) * H;
        for (let s = 0; s < 2; s++) {
          g.save(); g.translate(0, s * H); if (s === 1) { g.translate(W, 0); g.scale(-1, 1); }
          g.fillStyle = P; g.fillRect(0, 0, W, H);
          // the rocker: black, with a thin white pinstripe on top of it
          g.fillStyle = '#0e0e0f'; g.fillRect(0, yy(1.02), W, H - yy(1.02));
          g.fillStyle = '#f2f2f2'; g.fillRect(0, yy(1.045), W, yy(1.02) - yy(1.045) - 3);
          // the swoosh: a white sweep from the front fender up across the door, outlined in black
          g.beginPath(); g.moveTo(zx(-2.2), yy(1.08)); g.bezierCurveTo(zx(-1.2), yy(1.1), zx(-0.6), yy(1.36), zx(0.4), yy(1.37));
          g.lineTo(zx(0.4), yy(1.31)); g.bezierCurveTo(zx(-0.5), yy(1.29), zx(-1.1), yy(1.1), zx(-2.2), yy(1.08)); g.closePath();
          g.fillStyle = '#f4f4f4'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#111'; g.stroke();
          // stickers along the bed side and the front fender (no brands: coloured patches with lettering bars)
          let sd = 99 + s; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
          const cols = ['#f4f4f4', '#111111', '#ffd21a', '#1f4fd1', '#f2570f', '#2f9e44'];
          const sticker = (z0, y0, wz, hy) => {
            const x = zx(z0), y = yy(y0 + hy), w = zx(z0 + wz) - x, h = yy(y0) - y, c0 = cols[Math.floor(rnd() * cols.length)];
            g.fillStyle = '#111'; g.fillRect(x - 3, y - 3, w + 6, h + 6); g.fillStyle = c0; g.fillRect(x, y, w, h);
            g.fillStyle = c0 === '#111111' ? '#f4f4f4' : '#111'; g.fillRect(x + w * 0.12, y + h * 0.35, w * 0.76, h * 0.3);
          };
          for (let k = 0; k < 7; k++) sticker(0.75 + k * 0.23, 1.1, 0.19, 0.08);
          for (let k = 0; k < 5; k++) sticker(0.95 + k * 0.28, 1.21, 0.24, 0.09);
          for (let k = 0; k < 2; k++) sticker(-2.36 + k * 0.19, 1.12, 0.15, 0.07);
          g.restore();
        }
        livTex.needsUpdate = true;
      };
      M.livery = new THREE.MeshPhysicalMaterial({ map: livTex, metalness: 0.15, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });
      drawLivery(paintHex);
      repaint = (c) => { drawLivery(c); };
      const body = new THREE.Group(); model.add(body);
      { const g = alongX(side, { depth: 2 * HW - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.03, bevelSegments: 4, curveSegments: 12, steps: 1 }, -HW);
        sideUVs(g, BZ0, BZ1, BY0, BY1); smoothNormals(g, 32);
        const m = new THREE.Mesh(g, [M.livery, M.paint]); m.castShadow = true; m.receiveShadow = true; body.add(m); }
      // the doors: skins 10 cm thick flush with the sides, from the sill to the window line (the livery runs on across
      // them; their bevelled edges are the shut lines)
      { const d = new THREE.Shape(), e = 0.03;
        d.moveTo(CB0 + e, FL + e); d.lineTo(CB0 + e, 1.42 - e); d.lineTo(CB1 - e + 0.02, 1.42 - e); d.lineTo(CB1 - e + 0.02, FL + e); d.lineTo(CB0 + e, FL + e);
        for (const sx of [-1, 1]) {
          const g = alongX(d, { depth: 0.04, bevelEnabled: true, bevelThickness: e, bevelSize: e, bevelSegments: 3, curveSegments: 4, steps: 1 }, sx < 0 ? -HW : HW - 0.1);
          sideUVs(g, BZ0, BZ1, BY0, BY1); smoothNormals(g, 32);
          const m = new THREE.Mesh(g, [M.livery, M.paint]); m.castShadow = true; m.receiveShadow = true; body.add(m);
        }
      }
      // fender flares: wide black arches standing out over the tyres
      for (const za of [zF, zR]) for (const sx of [-1, 1]) {
        const Ri = archR, Ro = archR + 0.14, sh = new THREE.Shape();
        sh.absarc(za, archC, Ro, 0.2, Math.PI - 0.2, false); sh.absarc(za, archC, Ri, Math.PI - 0.2, 0.2, true);
        const g = alongX(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 40 }, sx < 0 ? -HW - 0.33 : HW - 0.03);
        smoothNormals(g, 40); add(body, g, M.flare, 0, 0, 0);
        // (the flare's top: a lip over the tyre from the body out to the flare's edge)
        const lip = new THREE.Shape(); lip.absarc(za, archC, Ri + 0.005, 0.35, Math.PI - 0.35, false); lip.absarc(za, archC, Ri - 0.03, Math.PI - 0.35, 0.35, true);
        add(body, alongX(lip, { depth: 0.36, bevelEnabled: false, curveSegments: 30 }, sx < 0 ? -HW - 0.33 : HW - 0.03), M.flare, 0, 0, 0);
      }
      // the cab: its sides with the big window openings (window nets, the driver behind them), the roof, the back
      // wall, the raked windshield; a number plate on each C-pillar
      const cabG = new THREE.Group(); body.add(cabG); cabShell = cabG;
      { const s = new THREE.Shape();
        s.moveTo(-0.95, 1.42); s.lineTo(-0.47, 1.97); s.quadraticCurveTo(-0.43, 2.03, -0.35, 2.03); s.lineTo(0.36, 2.03); s.quadraticCurveTo(0.44, 2.03, 0.45, 1.95); s.lineTo(0.47, 1.42); s.lineTo(-0.95, 1.42);
        const win = new THREE.Path(); win.moveTo(-0.74, 1.54); win.lineTo(0.08, 1.54); win.lineTo(0.08, 1.94); win.lineTo(-0.42, 1.94); win.lineTo(-0.74, 1.54); s.holes.push(win);
        for (const sx of [-1, 1]) { const g = alongX(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.025, bevelSegments: 2, curveSegments: 8 }, sx < 0 ? -CHW : CHW - 0.06); smoothNormals(g, 32); add(cabG, g, [M.paint, M.black], 0, 0, 0); }
        const rf = new THREE.Shape(); rf.moveTo(-0.47, 1.97); rf.quadraticCurveTo(-0.43, 2.03, -0.35, 2.03); rf.lineTo(0.36, 2.03); rf.quadraticCurveTo(0.44, 2.03, 0.45, 1.95);
        rf.lineTo(0.41, 1.95); rf.lineTo(0.36, 1.99); rf.lineTo(-0.35, 1.99); rf.lineTo(-0.44, 1.95); rf.lineTo(-0.47, 1.97);
        const rg = alongX(rf, { depth: 2 * CHW - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2, curveSegments: 8 }, -CHW); smoothNormals(rg, 32); add(cabG, rg, M.paint, 0, 0, 0);
        add(cabG, rbox(2 * CHW - 0.02, 0.55, 0.04, 0.015), M.paint, 0, 1.69, 0.44);
        add(cabG, new THREE.PlaneGeometry(1.1, 0.2), M.inner, 0, 1.85, 0.415, 0, 0, 0, false);                          // (the small back window)
        // windshield: raked 42 deg, a black frame round it
        const wsG = new THREE.Group(); wsG.position.set(0, 1.695, -0.71); wsG.rotation.x = 0.729; cabG.add(wsG);
        add(wsG, new THREE.PlaneGeometry(2 * CHW - 0.08, 0.72), M.glass, 0, 0, 0, 0, 0, 0, false);
        const fr = rrect(new THREE.Shape(), -CHW + 0.01, -0.38, CHW - 0.01, 0.38, 0.03); fr.holes.push(rrect(new THREE.Path(), -CHW + 0.06, -0.34, CHW - 0.06, 0.34, 0.03));
        add(wsG, new THREE.ExtrudeGeometry(fr, { depth: 0.02, bevelEnabled: false }), M.black, 0, 0, -0.01, 0, 0, 0, false);
        // inside: all dark - the floor at the sill, the door trims, the cab walls' insides (their window openings cut out
        // of them too), the firewall under the dash, the back wall, the headliner
        add(cabG, new THREE.PlaneGeometry(2 * HW - 0.2, CB1 - CB0), M.inner, 0, FL + 0.035, (CB0 + CB1) / 2, -Math.PI / 2, 0, false);
        for (const sx of [-1, 1]) {
          add(cabG, new THREE.PlaneGeometry(CB1 - CB0, 1.42 - FL), M.inner, sx * (HW - 0.103), (FL + 1.42) / 2, (CB0 + CB1) / 2, 0, Math.PI / 2, 0, false);
          const iw = new THREE.ShapeGeometry(s); iw.rotateY(-Math.PI / 2); add(cabG, iw, M.inner, sx * (CHW - 0.062), 0, 0, 0, 0, 0, false);
        }
        add(cabG, new THREE.PlaneGeometry(2 * HW - 0.2, 0.45), M.inner, 0, FL + 0.25, CB0 + 0.055, 0, 0, 0, false);
        add(cabG, new THREE.PlaneGeometry(2 * HW - 0.2, 0.96), M.inner, 0, FL + 0.5, CB1 - 0.04, 0, 0, 0, false);
        { const hl = [[-0.47, 1.912], [-0.35, 1.945], [0.36, 1.945], [0.44, 1.912]], pos = [], x = CHW - 0.06;
          for (let i = 0; i < hl.length - 1; i++) { const [z0, y0] = hl[i], [z1, y1] = hl[i + 1]; pos.push(-x, y0, z0, x, y0, z0, x, y1, z1, -x, y0, z0, x, y1, z1, -x, y1, z1); }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); add(cabG, g, M.inner, 0, 0, 0, 0, 0, 0, false); }
        add(cabG, rbox(0.28, 0.16, 0.9, 0.04), M.inner, 0, FL + 0.11, -0.45);                                         // (the tunnel / console)
        tubeAB(cabG, V3(0, FL + 0.19, -0.35), V3(0, FL + 0.42, -0.3), 0.012, M.polish); add(cabG, new THREE.SphereGeometry(0.03, 12, 10), M.black, 0, FL + 0.43, -0.3);
        // window nets: a black grid in each opening
        const netTex = canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#0c0c0c'; g.lineWidth = 5; for (let k = 0; k <= 8; k++) { g.beginPath(); g.moveTo(k * 16, 0); g.lineTo(k * 16, h); g.stroke(); g.beginPath(); g.moveTo(0, k * 16); g.lineTo(w, k * 16); g.stroke(); } });
        netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(4, 2);
        const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 });
        for (const sx of [-1, 1]) add(cabG, new THREE.PlaneGeometry(0.46, 0.34), netMat, sx * (CHW - 0.03), 1.73, -0.12, 0, Math.PI / 2, 0, false);
        // number plates on the C-pillars
        const numTex = canvasTex(256, 192, (g, w, h) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = 'italic 900 150px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('70', w / 2, h / 2 + 8); });
        const numMat = new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
        for (const sx of [-1, 1]) add(cabG, new THREE.PlaneGeometry(0.3, 0.24), numMat, sx * (CHW + 0.004), 1.78, 0.27, 0, sx * Math.PI / 2, 0, false);
      }
      // the hood's black vent panel with louvres
      { const y0 = hoodY(-1.6);
        const vp = add(body, rbox(0.9, 0.04, 1.25, 0.015), M.flare, 0, y0 + 0.045, -1.6); vp.rotation.x = -0.08;
        for (let k = 0; k < 9; k++) { const z = -2.12 + k * 0.13; add(body, rbox(0.78, 0.035, 0.03, 0.008), M.gloss, 0, hoodY(z) + 0.075, z, -0.5, 0, 0); }
        for (const sx of [-1, 1]) add(body, rbox(0.1, 0.03, 0.9, 0.01), M.black, sx * 0.62, hoodY(-1.7) + 0.04, -1.7);     // (hood pins)
      }
      // the grille: black mesh, three stacked LED light bars, a round headlamp each side, the tube guard in front
      const FZ = NZ - 0.045;
      { const meshTex = canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#050506'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a2c30'; g.lineWidth = 2; for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) { g.strokeRect(x + 1, y + 1, 6, 6); } });
        meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping; meshTex.repeat.set(6, 2);
        add(body, new THREE.PlaneGeometry(1.86, 0.3), new THREE.MeshStandardMaterial({ map: meshTex, roughness: 0.6, metalness: 0.4 }), 0, 1.08, FZ + 0.012, 0, Math.PI, 0, false);
        for (const [y, w] of [[1.17, 1.22], [1.095, 1.3], [1.02, 1.22]]) {
          add(body, rbox(w, 0.06, 0.07, 0.015), M.black, 0, y, FZ - 0.02);
          const n = Math.round(w / 0.07);
          for (let k = 0; k < n; k++) add(body, new THREE.BoxGeometry(0.05, 0.035, 0.01), M.led, -w / 2 + 0.035 + k * (w - 0.07) / (n - 1), y, FZ - 0.058, 0, 0, 0, false);
        }
        for (const sx of [-1, 1]) {
          add(body, cylZ(0.075, 0.075, 0.08, 24), M.black, sx * 0.83, 1.12, FZ - 0.02);
          add(body, new THREE.CircleGeometry(0.06, 24), M.head, sx * 0.83, 1.12, FZ - 0.062, 0, Math.PI, 0, false);
          add(body, cylZ(0.045, 0.045, 0.06, 20), M.black, sx * 0.83, 0.99, FZ - 0.01);
          add(body, new THREE.CircleGeometry(0.035, 20), M.head, sx * 0.83, 0.99, FZ - 0.042, 0, Math.PI, 0, false);
        }
        const T = (a, b) => tubeAB(body, a, b, 0.02, M.guard);
        T(V3(-0.72, 1.24, FZ - 0.1), V3(0.72, 1.24, FZ - 0.1)); T(V3(-0.72, 0.94, FZ - 0.1), V3(0.72, 0.94, FZ - 0.1));
        for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) T(V3(x, 0.94, FZ - 0.1), V3(x, 1.24, FZ - 0.1));
        for (const sx of [-1, 1]) T(V3(sx * 0.72, 1.24, FZ - 0.1), V3(sx * 0.62, 1.3, FZ + 0.15));
        // the front bumper tube and the skid plate under it
        tubes(body, [V3(-0.9, 0.95, FZ + 0.05), V3(-0.75, 0.84, FZ - 0.12), V3(0.75, 0.84, FZ - 0.12), V3(0.9, 0.95, FZ + 0.05)], 0.035, M.black);
        const sk = add(body, rbox(1.3, 0.02, 0.5, 0.01), M.alu, 0, 0.82, FZ + 0.26); sk.rotation.x = 0.35;
      }
      // the roof bar: eight round spotlights on a black bar over the windshield
      { add(cabG, rbox(1.66, 0.06, 0.08, 0.02), M.black, 0, 2.14, -0.3);
        for (const sx of [-1, 1]) tubeAB(cabG, V3(sx * 0.72, 2.03, -0.1), V3(sx * 0.72, 2.12, -0.28), 0.018, M.black);
        for (let k = 0; k < 8; k++) { const x = -0.735 + k * 0.21; add(cabG, cylZ(0.085, 0.075, 0.1, 22), M.black, x, 2.2, -0.34); add(cabG, new THREE.CircleGeometry(0.07, 22), M.head, x, 2.2, -0.392, 0, Math.PI, 0, false); }
      }
      // over the bed: the tube cage, two spares stacked flat, the fuel cell, the chase light; the tail
      { const T = (pts, r) => tubes(body, pts, r || 0.028, M.black);
        for (const sx of [-1, 1]) T([V3(sx * 0.82, 2.0, 0.42), V3(sx * 0.82, 1.95, 1.55), V3(sx * 0.86, 1.52, 2.62)]);
        T([V3(-0.82, 1.95, 1.55), V3(0.82, 1.95, 1.55)]); T([V3(-0.86, 1.52, 2.62), V3(0.86, 1.52, 2.62)]);
        add(body, rbox(0.9, 0.16, 0.5, 0.04), M.black, 0, 1.6, 0.78);                                                    // fuel cell
        const spT = carcass(0.49, 0.33, 0.22); spT.rotateZ(Math.PI / 2);
        for (const y of [1.67, 2.02]) { add(body, spT, M.rubber, 0, y, 1.95); add(body, cylZ(0.2, 0.2, 0.3, 24).rotateX(Math.PI / 2), M.black, 0, y, 1.95); }
        add(body, rbox(0.06, 0.72, 0.06, 0.02), M.black, 0, 1.86, 1.95);
        add(body, rbox(0.3, 0.1, 0.12, 0.03), M.amber, 0, 2.02, 1.55, 0, 0, 0, false);                                   // chase light
        add(body, rbox(1.6, 0.36, 0.03, 0.02), M.black, 0, 1.15, 2.825);
        for (const sx of [-1, 1]) { add(body, rbox(0.2, 0.06, 0.02, 0.01), M.tail, sx * 0.62, 1.3, 2.845, 0, 0, 0, false); }
        for (const sx of [-1, 1]) { const a = V3(sx * 0.42, 0.79, 2.3), b = V3(sx * 0.46, 0.8, 2.88); pipe(body, [V3(sx * 0.3, 0.78, 1.2), a, b], 0.05, M.polish); tips.push(toRoot(b)); }
      }
      // the chassis under it: rails, the front and rear hoops the suspension hangs from, a skid plate
      { const T = (a, b, r) => tubeAB(model, a, b, r || 0.04, M.chassis);
        for (const sx of [-1, 1]) { T(V3(sx * 0.42, 0.8, NZ + 0.2), V3(sx * 0.42, 0.78, 2.6)); T(V3(sx * 0.42, 0.8, zF), V3(sx * 0.62, 1.38, zF)); T(V3(sx * 0.42, 0.8, zR - 0.25), V3(sx * 0.62, 1.48, zR - 0.25)); }
        for (const z of [NZ + 0.2, zF, -0.4, zR - 0.25, 2.6]) T(V3(-0.42, 0.8, z), V3(0.42, 0.8, z));
        T(V3(-0.62, 1.38, zF), V3(0.62, 1.38, zF)); T(V3(-0.62, 1.48, zR - 0.25), V3(0.62, 1.48, zR - 0.25));
        add(model, rbox(0.95, 0.02, 1.8, 0.01), M.alu, 0, 0.74, -1.2);
      }
      // inside: two race seats, the cage, the wheel and the dash; the driver on the left
      { for (const sx of [-1, 1]) {
          add(cockpit, rbox(0.46, 0.1, 0.5, 0.04), M.seat, sx * 0.42, 1.06, 0.05);
          add(cockpit, rbox(0.46, 0.8, 0.1, 0.05), M.seat, sx * 0.42, 1.46, 0.33, 0.15, 0, 0);
          for (const bx of [-1, 1]) add(cockpit, rbox(0.06, 0.6, 0.3, 0.03), M.seat, sx * 0.42 + bx * 0.22, 1.38, 0.2, 0.15, 0, 0);
          tubeAB(cockpit, V3(sx * 0.82, 1.43, -0.9), V3(sx * 0.82, 1.98, -0.42), 0.025, M.black);
          tubeAB(cockpit, V3(sx * 0.82, 1.43, 0.4), V3(sx * 0.82, 1.98, 0.38), 0.025, M.black);
        }
        tubeAB(cockpit, V3(-0.82, 1.98, 0.38), V3(0.82, 1.98, 0.38), 0.025, M.black); tubeAB(cockpit, V3(-0.82, 1.98, -0.42), V3(0.82, 1.98, -0.42), 0.025, M.black);
        add(cockpit, rbox(1.6, 0.14, 0.26, 0.04), M.black, 0, 1.49, -0.8);
        add(cockpit, new THREE.PlaneGeometry(0.2, 0.1), dashMat, -0.12, 1.575, -0.685, -0.6, 0, 0, false);
        const colG = new THREE.Group(); colG.position.set(-0.42, 1.52, -0.44); colG.rotation.x = -0.35; cockpit.add(colG);
        add(colG, cylZ(0.02, 0.02, 0.3, 10), M.polish, 0, 0, -0.15);
        steerWheel = new THREE.Group(); colG.add(steerWheel);
        add(steerWheel, new THREE.TorusGeometry(0.16, 0.017, 10, 32), M.black, 0, 0, 0);
        for (let k = 0; k < 3; k++) { const sp = add(steerWheel, new THREE.BoxGeometry(0.016, 0.15, 0.01), M.polish, 0, 0, 0.005); sp.rotation.z = k * 2.094; sp.geometry.translate(0, 0.075, 0); }
        const d = makeDriver(model, -0.42, 1.12, 0.12, 1.52, -0.44, 0.1); driver = d.g;
        eye = V3(-0.42, d.head.y - 0.01, d.head.z - 0.08);
      }
      // wheels: 39 in desert tyres (interlocking blocks) on black 17 in beadlocks with red rings
      const TW = 0.343, rimR = 0.216;
      const tyG = carcass(RF, TW, rimR), trG = blocks(RF, TW, 30, [[0, 0.3, 0.55, 0], [0.3, 0.28, 0.5, 0.5], [-0.3, 0.28, 0.5, 0.5], [0.47, 0.12, 0.45, 0], [-0.47, 0.12, 0.45, 0]], 0.022, 1);
      makeWheels((w, R) => {
        add(w.spin, tyG, M.rubber, 0, 0, 0); add(w.spin, trG, M.rubber, 0, 0, 0);
        add(w.spin, cylX(rimR, rimR, TW * 0.85, 40, true), M.black, 0, 0, 0);
        add(w.spin, cylX(rimR * 0.98, rimR * 0.98, 0.02, 40), M.gloss, TW * 0.3, 0, 0);
        const ring = new THREE.TorusGeometry(rimR - 0.01, 0.022, 10, 48); ring.rotateY(Math.PI / 2); add(w.spin, ring, M.red, TW * 0.36, 0, 0);
        for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; add(w.spin, cylX(0.008, 0.008, 0.02, 6), M.chrome, TW * 0.38, Math.cos(a) * (rimR - 0.01), Math.sin(a) * (rimR - 0.01), 0, 0, 0, false); }
        add(w.spin, cylX(0.08, 0.09, 0.08, 24), M.black, TW * 0.34, 0, 0);
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; add(w.spin, cylX(0.012, 0.012, 0.03, 6), M.chrome, TW * 0.38, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0, 0, 0, false); }
        add(w.flip, cylX(0.17, 0.17, 0.02, 32), M.cast, -0.02, 0, 0);
        add(w.flip, rbox(0.06, 0.12, 0.1, 0.02), M.red, -0.03, 0.12, -0.08);
      });
      // front: long-travel A-arms, a coil-over and a bypass shock each side; back: a solid axle on a 4-link, two shocks a side
      for (const i of [0, 1]) {
        const sx = i === 0 ? -1 : 1;
        link(M.chassis, 0.03, V3(sx * 0.42, 0.8, zF - 0.28), { w: i, o: V3(-sx * 0.1, -0.12, 0) });
        link(M.chassis, 0.03, V3(sx * 0.42, 0.8, zF + 0.28), { w: i, o: V3(-sx * 0.1, -0.12, 0) });
        link(M.chassis, 0.025, V3(sx * 0.5, 1.12, zF - 0.2), { w: i, o: V3(-sx * 0.12, 0.16, 0) });
        link(M.chassis, 0.025, V3(sx * 0.5, 1.12, zF + 0.2), { w: i, o: V3(-sx * 0.12, 0.16, 0) });
        shock(V3(sx * 0.6, 1.38, zF - 0.08), { w: i, o: V3(-sx * 0.36, -0.08, -0.08) }, M.red, true, 0.04);
        shock(V3(sx * 0.6, 1.38, zF + 0.1), { w: i, o: V3(-sx * 0.3, -0.08, 0.1) }, M.polish, false, 0.032);
      }
      { const ax = new THREE.Group(); dyn.add(ax); add(ax, cylX(0.07, 0.07, 2 * HXR - 0.3, 18), M.black, 0, 0, 0); add(ax, new THREE.SphereGeometry(0.17, 20, 14), M.black, 0.1, -0.02, 0).scale.set(0.8, 1, 1);
        rearAxle = ax;
        for (const sx of [-1, 1]) {
          link(M.chassis, 0.03, V3(sx * 0.42, 0.78, zR - 1.25), { w: [2, 3], t: sx < 0 ? 0.3 : 0.7, o: V3(0, -0.1, 0) });
          link(M.chassis, 0.026, V3(sx * 0.3, 1.0, zR - 1.0), { w: [2, 3], t: sx < 0 ? 0.38 : 0.62, o: V3(0, 0.12, 0) });
          shock(V3(sx * 0.62, 1.48, zR - 0.32), { w: [2, 3], t: sx < 0 ? 0.12 : 0.88, o: V3(0, 0.06, -0.08) }, M.red, true, 0.042);
          shock(V3(sx * 0.62, 1.48, zR - 0.12), { w: [2, 3], t: sx < 0 ? 0.14 : 0.86, o: V3(0, 0.06, 0.1) }, M.polish, false, 0.034);
        }
      }
      // headlamps: the light bars and the roof bar
      for (const [x, y, z] of [[-0.4, 1.1, NZ - 0.07], [0.4, 1.1, NZ - 0.07], [0, 2.2, -0.45]]) {
        const sl = new THREE.SpotLight(0xfff2d8, 0, 120, x === 0 ? 0.7 : 0.45, 0.5, 1.3);
        sl.position.copy(toRoot(V3(x, y, z))); sl.target.position.copy(toRoot(V3(x * 3, 0, z - 40)));
        rootG.add(sl); rootG.add(sl.target); sl.visible = false; spots.push(sl);
      }
    }
    let rearAxle = null;

    // ================================================================ DUNE BUGGY
    function buildBuggy() {
      const T = (pts, r) => tubes(model, pts, r || 0.021, M.paint);
      const LS = VER === 'ls', BUILT = VER === 'built';
      // the frame: a lower perimeter on the floor, side bars at hip height, the dash hoop, the main hoop behind the seats,
      // the cage over the top with long diagonals down to the nose, the engine cage out the back
      const P = (sx, x, y, z) => V3(sx * x, y, z);
      for (const sx of [-1, 1]) {
        T([P(sx, 0.24, 0.33, -1.72), P(sx, 0.5, 0.3, -1.25), P(sx, 0.56, 0.3, -0.9), P(sx, 0.56, 0.3, 0.45), P(sx, 0.42, 0.34, 0.8), P(sx, 0.36, 0.42, 1.78)]);
        T([P(sx, 0.5, 0.58, -1.25), P(sx, 0.56, 0.62, -0.9), P(sx, 0.56, 0.62, 0.45)]);
        T([P(sx, 0.56, 0.3, -0.9), P(sx, 0.56, 0.62, -0.9)]); T([P(sx, 0.5, 0.3, -1.25), P(sx, 0.5, 0.58, -1.25)]);
        T([P(sx, 0.56, 0.3, 0.45), P(sx, 0.52, 1.4, 0.42), P(sx, 0.44, 1.56, 0.38)], 0.024);                       // main hoop
        T([P(sx, 0.44, 1.56, 0.38), P(sx, 0.46, 1.52, -0.35)], 0.022);                                               // roof side bar
        T([P(sx, 0.46, 1.52, -0.35), P(sx, 0.5, 0.6, -1.25)], 0.022);                                                // the long diagonal to the nose
        T([P(sx, 0.56, 0.62, -0.9), P(sx, 0.5, 0.84, -0.86)]);                                                        // dash hoop
        T([P(sx, 0.44, 1.56, 0.38), P(sx, 0.36, 0.78, 1.78)]); T([P(sx, 0.42, 0.34, 0.8), P(sx, 0.4, 0.95, 0.9)]);  // engine cage
      }
      T([V3(-0.24, 0.33, -1.72), V3(0.24, 0.33, -1.72)]); T([V3(-0.56, 0.3, 0.45), V3(0.56, 0.3, 0.45)]); T([V3(-0.36, 0.42, 1.78), V3(0.36, 0.42, 1.78)]);
      T([V3(-0.44, 1.56, 0.38), V3(0.44, 1.56, 0.38)], 0.024); T([V3(-0.46, 1.52, -0.35), V3(0.46, 1.52, -0.35)], 0.022);
      T([V3(-0.5, 0.84, -0.86), V3(0.5, 0.84, -0.86)]); T([V3(-0.36, 0.78, 1.78), V3(0.36, 0.78, 1.78)]);
      T([V3(-0.52, 1.4, 0.42), V3(0.52, 0.62, 0.44)]);                                                                // main-hoop diagonal
      T([V3(-0.5, 0.58, -1.25), V3(0.5, 0.58, -1.25)]);
      // the floor: diamond plate; the nose platform with the battery box and a red fuel / extinguisher box
      const plateTex = canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#8d9197'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const cx = x * 32 + (y & 1) * 16 + 8, cy = y * 32 + 16, a = (y & 1) ? 0.6 : -0.6; g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = '#c9ccd1'; g.fillRect(-11, -3, 22, 4); g.fillStyle = '#5b5f65'; g.fillRect(-11, 1, 22, 2); g.restore(); }
      });
      plateTex.wrapS = plateTex.wrapT = THREE.RepeatWrapping; plateTex.repeat.set(5, 8);
      const plate = new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.8, roughness: 0.35 });
      add(model, new THREE.BoxGeometry(1.1, 0.01, 1.35), plate, 0, 0.315, -0.22);
      add(model, new THREE.BoxGeometry(0.62, 0.01, 0.42), plate, 0, 0.565, -1.5);
      T([V3(-0.31, 0.56, -1.72), V3(-0.31, 0.56, -1.29)]); T([V3(0.31, 0.56, -1.72), V3(0.31, 0.56, -1.29)]);
      for (const sx of [-1, 1]) T([V3(sx * 0.24, 0.33, -1.72), V3(sx * 0.31, 0.56, -1.72)]);
      add(model, rbox(0.26, 0.2, 0.2, 0.02), M.black, -0.12, 0.67, -1.52); add(model, rbox(0.1, 0.03, 0.05, 0.01), M.red, -0.18, 0.785, -1.52);
      add(model, rbox(0.14, 0.12, 0.16, 0.02), M.red, 0.14, 0.63, -1.46);
      // lamps on the cage's front top bar
      for (const sx of [-1, 1]) {
        add(model, rbox(0.13, 0.11, 0.09, 0.015), M.black, sx * 0.3, 1.6, -0.35);
        add(model, new THREE.PlaneGeometry(0.1, 0.08), M.head, sx * 0.3, 1.6, -0.397, 0, Math.PI, 0, false);
      }
      // seats: high-back buckets, grey inserts, harnesses
      for (const sx of [-1, 1]) {
        const x = sx * 0.28;
        add(model, rbox(0.44, 0.1, 0.48, 0.04), M.seat, x, 0.4, -0.08);
        add(model, rbox(0.3, 0.02, 0.36, 0.01), M.seatIn, x, 0.455, -0.1);
        const bk = new THREE.Group(); bk.position.set(x, 0.45, 0.2); bk.rotation.x = 0.22; model.add(bk);
        add(bk, rbox(0.44, 0.78, 0.08, 0.05), M.seat, 0, 0.38, 0);
        add(bk, rbox(0.28, 0.5, 0.02, 0.01), M.seatIn, 0, 0.3, -0.045);
        for (const bx of [-1, 1]) add(bk, rbox(0.06, 0.6, 0.22, 0.03), M.seat, bx * 0.22, 0.32, -0.08);
        for (const bx of [-1, 1]) add(bk, rbox(0.05, 0.62, 0.01, 0.005), M.black, bx * 0.08, 0.36, -0.06, 0, 0, 0, false);
      }
      // the steering: a column from the dash hoop to a small wheel in front of the left seat
      { const colG = new THREE.Group(); colG.position.set(-0.28, 0.88, -0.6); colG.rotation.x = -0.75; model.add(colG);
        add(colG, cylZ(0.018, 0.018, 0.5, 10), M.polish, 0, 0, -0.22);
        steerWheel = new THREE.Group(); colG.add(steerWheel);
        add(steerWheel, new THREE.TorusGeometry(0.15, 0.016, 10, 32), M.black, 0, 0, 0);
        for (let k = 0; k < 3; k++) { const sp = add(steerWheel, new THREE.BoxGeometry(0.014, 0.14, 0.008), M.polish, 0, 0, 0.004); sp.rotation.z = k * 2.094 + Math.PI; sp.geometry.translate(0, 0.07, 0); }
        add(model, rbox(0.3, 0.12, 0.06, 0.02), M.black, -0.28, 0.9, -0.84, -0.3, 0, 0);
        add(model, new THREE.PlaneGeometry(0.2, 0.1), dashMat, -0.28, 0.9, -0.807, -0.3, 0, 0, false);
      }
      const d = makeDriver(model, -0.28, 0.5, 0.0, 0.88, -0.6, 0.18); driver = d.g;
      eye = V3(-0.28, d.head.y - 0.01, d.head.z - 0.08);
      // the engine out the back: a VW flat-four (fins, heads, the fan shroud, carburettors) - or the LS V8 - over the
      // transaxle, the exhaust out the back
      const eng = new THREE.Group(); model.add(eng);
      add(eng, rbox(0.34, 0.24, 0.34, 0.04), M.alu, 0, 0.38, zR);                                                     // transaxle
      if (!LS) {
        const ez = 1.55, ey = 0.46;
        add(eng, rbox(0.3, 0.26, 0.4, 0.05), M.alu, 0, ey, ez);
        for (const sx of [-1, 1]) for (const dz of [-0.09, 0.09]) {
          const cyl = add(eng, cylX(0.06, 0.06, 0.2, 18), M.black, sx * 0.25, ey, ez + dz);
          for (let k = 0; k < 7; k++) add(eng, cylX(0.075, 0.075, 0.008, 18), M.black, sx * (0.17 + k * 0.025), ey, ez + dz);
          cyl.castShadow = true;
        }
        for (const sx of [-1, 1]) add(eng, rbox(0.08, 0.16, 0.34, 0.03), M.alu, sx * 0.38, ey, ez);
        add(eng, rbox(0.5, 0.2, 0.3, 0.06), M.black, 0, ey + 0.26, ez + 0.02);                                         // the fan shroud
        add(eng, cylZ(0.07, 0.07, 0.2, 18), M.chrome, 0, ey + 0.4, ez + 0.02);                                          // alternator
        if (BUILT) {
          for (const sx of [-1, 1]) { add(eng, rbox(0.12, 0.08, 0.2, 0.02), M.alu, sx * 0.24, ey + 0.2, ez - 0.02); add(eng, cylX(0.07, 0.07, 0.07, 20), M.chrome, sx * 0.24, ey + 0.28, ez - 0.02, 0, 0, Math.PI / 2); }
          add(eng, rbox(0.2, 0.18, 0.04, 0.02), M.black, 0.35, ey + 0.1, ez - 0.3);                                     // oil cooler
        } else add(eng, cylX(0.1, 0.1, 0.08, 24), M.chrome, 0, ey + 0.23, ez - 0.2, 0, 0, Math.PI / 2);
        // header merging into the stinger out the back
        const ends = [];
        for (const sx of [-1, 1]) for (const dz of [-0.09, 0.09]) { const a = V3(sx * 0.33, ey - 0.08, ez + dz), b = V3(sx * 0.2, ey - 0.2, ez + 0.28), c = V3(0, ey - 0.16, ez + 0.36); pipe(eng, [a, b, c], 0.018, M.polish); ends.push(c); }
        const st = V3(0, ey - 0.1, 1.98); pipe(eng, [V3(0, ey - 0.16, ez + 0.36), V3(0, ey - 0.14, 1.85), st], 0.032, M.polish); tips.push(toRoot(st));
      } else {
        const ez = 1.5, ey = 0.58;
        add(eng, rbox(0.46, 0.42, 0.62, 0.05), M.alu, 0, ey, ez);
        for (const sx of [-1, 1]) { add(eng, rbox(0.2, 0.2, 0.6, 0.04), M.alu, sx * 0.24, ey + 0.22, ez, 0, 0, sx * 0.6); add(eng, rbox(0.14, 0.07, 0.56, 0.02), M.red, sx * 0.31, ey + 0.31, ez, 0, 0, sx * 0.6); }
        add(eng, rbox(0.3, 0.16, 0.62, 0.04), M.black, 0, ey + 0.34, ez);                                               // the intake
        add(eng, cylZ(0.07, 0.07, 0.14, 20), M.black, 0, ey + 0.34, ez - 0.38);
        add(eng, rbox(0.62, 0.42, 0.05, 0.02), M.black, 0, 1.05, 1.82, -0.3, 0, 0);                                      // the radiator up on the cage
        add(eng, cylZ(0.17, 0.17, 0.05, 24), M.gloss, 0, 1.06, 1.86, -0.3, 0, 0);
        for (const sx of [-1, 1]) {
          const tail = V3(sx * 0.2, ey - 0.12, 1.98);
          for (let k = 0; k < 4; k++) pipe(eng, [V3(sx * 0.32, ey + 0.05, ez - 0.22 + k * 0.15), V3(sx * 0.42, ey - 0.12, ez - 0.1 + k * 0.1), V3(sx * 0.3, ey - 0.16, ez + 0.36)], 0.018, M.polish);
          pipe(eng, [V3(sx * 0.3, ey - 0.16, ez + 0.36), V3(sx * 0.24, ey - 0.14, 1.85), tail], 0.03, M.polish); tips.push(toRoot(tail));
        }
      }
      // tail lights on the engine cage
      for (const sx of [-1, 1]) add(model, rbox(0.08, 0.05, 0.03, 0.01), M.tail, sx * 0.3, 0.78, 1.8, 0, 0, 0, false);
      // wheels: polished five-spokes; a ribbed narrow front, a fat rear with a street tread; sand paddles and ribbed
      // sand fronts in the off-road package
      const fW = 0.145, rW = 0.235;
      const rim = (g, R, W, rimR) => {
        add(g, cylX(rimR, rimR, W * 0.85, 36, true), M.polish, 0, 0, 0);
        add(g, cylX(rimR * 0.35, rimR * 0.4, 0.05, 24), M.polish, W * 0.28, 0, 0);
        for (let k = 0; k < 5; k++) { const sp = add(g, rbox(0.03, rimR * 0.95, 0.06, 0.012), M.polish, W * 0.26, 0, 0); sp.rotation.x = k * 2 * Math.PI / 5; sp.geometry.translate(0, rimR * 0.48, 0); }
        add(g, cylX(rimR * 0.97, rimR * 0.97, 0.01, 36), M.black, -W * 0.1, 0, 0);
        const lip = new THREE.TorusGeometry(rimR, 0.01, 8, 40); lip.rotateY(Math.PI / 2); add(g, lip, M.polish, W * 0.42, 0, 0);
      };
      const tyF = carcass(RF, fW, 0.19), trF = blocks(RF, fW, 60, [[0, 0.16, 0.8, 0], [0.3, 0.16, 0.8, 0], [-0.3, 0.16, 0.8, 0]], 0.008, 0);
      const tyR = carcass(RR, rW, 0.19), trR = blocks(RR, rW, 40, [[0.2, 0.3, 0.55, 0], [-0.2, 0.3, 0.55, 0.5], [0.44, 0.14, 0.5, 0.25], [-0.44, 0.14, 0.5, 0.75]], 0.01, 1);
      // (the package: rear paddles - a smooth carcass with rubber paddles across it - and ribbed sand fronts)
      const pRR = 0.381, pW = 0.28, tyP = carcass(pRR, pW, 0.19);
      const pad = []; for (let k = 0; k < 14; k++) { const b = new THREE.BoxGeometry(pW * 0.9, 0.03, 0.022); b.translate(0, pRR + 0.012, 0); b.rotateX(k * Math.PI * 2 / 14); pad.push(b); }
      const padG = mergeGeos(pad);
      const ribF = []; for (const ox of [-0.33, 0, 0.33]) { const t = new THREE.TorusGeometry(RF + 0.004, 0.009, 6, 48); t.rotateY(Math.PI / 2); t.translate(ox * fW, 0, 0); ribF.push(t); }
      const ribG = mergeGeos(ribF);
      makeWheels((w, R) => {
        if (w.front) { w.stock.push(add(w.spin, tyF, M.rubber, 0, 0, 0), add(w.spin, trF, M.rubber, 0, 0, 0)); w.pkg.push(add(w.spin, tyF, M.rubber, 0, 0, 0), add(w.spin, ribG, M.rubber, 0, 0, 0)); rim(w.spin, R, fW, 0.19); }
        else { w.stock.push(add(w.spin, tyR, M.rubber, 0, 0, 0), add(w.spin, trR, M.rubber, 0, 0, 0)); w.pkg.push(add(w.spin, tyP, M.rubber, 0, 0, 0), add(w.spin, padG, M.rubber, 0, 0, 0)); rim(w.spin, R, rW, 0.19); }
        for (const m of w.pkg) m.visible = false;
        add(w.flip, cylX(0.11, 0.11, 0.06, 24), M.cast, -0.03, 0, 0);                                                  // drum
      });
      // front: the VW beam (two tubes across), trailing arms back to the spindles, yellow coil-overs; back: trailing arms
      // and axle shafts from the transaxle, a shock each side
      const bz = zF - 0.32;
      tubeAB(model, V3(-0.5, 0.5, bz), V3(0.5, 0.5, bz), 0.035, M.black); tubeAB(model, V3(-0.5, 0.4, bz), V3(0.5, 0.4, bz), 0.035, M.black);
      for (const sx of [-1, 1]) tubeAB(model, V3(sx * 0.42, 0.4, bz), V3(sx * 0.42, 0.84, bz + 0.02), 0.028, M.black);
      for (const i of [0, 1]) {
        const sx = i === 0 ? -1 : 1;
        link(M.black, 0.022, V3(sx * 0.48, 0.5, bz), { w: i, o: V3(-sx * 0.09, 0.07, 0) });
        link(M.black, 0.022, V3(sx * 0.48, 0.4, bz), { w: i, o: V3(-sx * 0.09, -0.06, 0) });
        shock(V3(sx * 0.42, 0.84, bz + 0.02), { w: i, o: V3(-sx * 0.14, -0.02, -0.08) }, M.yellow, true, 0.026);
      }
      for (const i of [2, 3]) {
        const sx = i === 2 ? -1 : 1;
        link(M.black, 0.03, V3(sx * 0.52, 0.34, 0.55), { w: i, o: V3(-sx * 0.12, -0.02, 0) });
        link(M.black, 0.022, V3(sx * 0.16, 0.38, zR), { w: i, o: V3(-sx * 0.1, 0, 0) });
        shock(V3(sx * 0.42, 0.92, 0.92), { w: i, o: V3(-sx * 0.16, 0.02, -0.12) }, LS ? M.red : M.yellow, true, 0.028);
      }
      // the lamps' beams
      for (const sx of [-1, 1]) {
        const sl = new THREE.SpotLight(0xfff2d8, 0, 90, 0.5, 0.5, 1.3);
        sl.position.copy(toRoot(V3(sx * 0.3, 1.6, -0.42))); sl.target.position.copy(toRoot(V3(sx * 0.8, 0, -35)));
        rootG.add(sl); rootG.add(sl.target); sl.visible = false; spots.push(sl);
      }
    }

    if (TT) buildTrophy(); else buildBuggy();

    // ---------------------------------------------------------------- per frame
    const _e = new THREE.Vector3();
    function afterWheels() {
      if (rearAxle) {
        const pl = wheels[2].corner.position, pr = wheels[3].corner.position;
        rearAxle.position.addVectors(pl, pr).multiplyScalar(0.5);
        _d.subVectors(pr, pl).normalize(); rearAxle.quaternion.setFromUnitVectors(V3(1, 0, 0), _d);
      }
      for (const r of rods) { endPos(r.A, _a); endPos(r.B, _b); placeRod(r.m, _a, _b); }
      for (const s of shocks) {
        endPos(s.top, _a); endPos(s.bot, _b);
        _d.subVectors(_b, _a); const len = _d.length(); _d.normalize();
        const bl = Math.min(len * 0.55, TT ? 0.5 : 0.22);
        _e.copy(_a).addScaledVector(_d, bl); placeRod(s.body, _a, _e); placeRod(s.shaft, _e, _b);
        const c1 = _e.clone().addScaledVector(_d, -bl * 0.1); _e.copy(_a).addScaledVector(_d, 0.05); placeRod(s.cap, _a, _e);
        if (s.coil) placeRod(s.coil, c1.clone().addScaledVector(_d, -bl * 0.5), _b.clone().addScaledVector(_d, -Math.min(0.05, len * 0.1)));
      }
    }
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.paint.color.setHex(c); repaint(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 5 : (o.night || o.headlights ? 1.4 : 0.4);
      M.head.emissiveIntensity = o.headlights ? 4 : 0.15; M.led.emissiveIntensity = o.headlights ? 3 : 0.35; M.amber.emissiveIntensity = o.headlights ? 2 : 0.3;
      for (const s of spots) { s.visible = !!o.headlights; s.intensity = o.headlights ? 220 : 0; }
    }
    function setTires(front, rear) {
      if (TT) return;
      for (const w of wheels) { const pkg = (w.front ? front : rear) !== (w.front ? 'buggyF' : 'buggyR'); for (const m of w.stock) m.visible = !pkg; for (const m of w.pkg) m.visible = pkg; }
    }
    // cockpit view: the driver goes (you're in their seat); the trophy truck's cab shell stays - you look out of it
    function setInteriorVisible(v, cp) { if (driver) driver.visible = !cp; }
    const noop = () => {};
    afterWheels();
    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: cockpit, wheels, steerWheel, eye: toRoot(eye),
      exhaustTips: tips, materials: M, headlights: spots, tailLens: [], mirrors: [], afterWheels,
      setPaint, setLights, setTires, setInteriorVisible, setTransmission: noop, drawCluster, drawScreen: noop, setChute: noop,
      variant: CAR, cls: VER,
    };
  }

  root.HCOffroad = { build };
})(typeof self !== 'undefined' ? self : this);
