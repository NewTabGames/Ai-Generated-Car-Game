/* Hellcat Drive — procedural touring bagger, built like a Street Glide (no badges): the batwing fairing on the forks
   with its short smoked screen, the LED headlamp and the dash inside it, a long tank with its console, the stepped
   two-up seat, the 45-degree V-twin with finned barrels and heads, the round air cleaner and the primary cover, black
   pipes both sides into mufflers under the bags, hard saddlebags with their red light strips, floorboards, a black 19 in
   front wheel on twin discs and an 18 in rear with the belt pulley; the rider, who puts a foot down at a stop.
   The whole front end (forks, fender, fairing, bars) turns about the raked steering head with the front wheel.
   The physics runs it as two wheels side by side at each axle: one tyre is drawn at each.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build, plus afterWheels() and setRider(speed). */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const VER = opts.engine || 'stock', RACE = VER === 'race', TURBO = VER === 'turbo';
    const cgH = opts.cgHeight || 0.66, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 0.8, cgToRear = opts.cgToRear || 0.8;
    const L = cgToFront + cgToRear, zB = -(L - 1.625) / 2, zF = -0.8125, zR = L / 2 - zB;
    const RF = opts.wheelRadiusF || 0.335, RR = opts.wheelRadiusR || 0.33;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || {};
    const rootG = new THREE.Group(); rootG.name = 'bike';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const toRoot = (v) => v.clone().add(V3(0, -cgH, zOff + zB));
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
    const cylX = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24); g.rotateZ(Math.PI / 2); return g; };
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    const pipe = (parent, pts, r, mat, seg) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 12, r, seg || 12, false), mat, 0, 0, 0);
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

    // a shell from its outline (points round a centre, counter-clockwise seen from behind): rings from the centre out to
    // the edge, each point pushed along z by depth(x, y, r) - r is 0 at the centre, 1 on the edge. back: facing +z
    function shell(outline, depth, cx, cy, back, rings) {
      const N = outline.length, R = rings || 10, pos = [cx || 0, cy || 0, depth(cx || 0, cy || 0, 0)], idx = [];
      for (let j = 1; j <= R; j++) { const r = j / R; for (const q of outline) { const x = (cx || 0) + (q.x - (cx || 0)) * r, y = (cy || 0) + (q.y - (cy || 0)) * r; pos.push(x, y, depth(x, y, r)); } }
      const tri = (a, b, c) => (back ? idx.push(a, c, b) : idx.push(a, b, c));
      for (let k = 0; k < N; k++) tri(0, 1 + (k + 1) % N, 1 + k);
      for (let j = 1; j < R; j++) for (let k = 0; k < N; k++) {
        const a = 1 + (j - 1) * N + k, b = 1 + (j - 1) * N + (k + 1) % N, c = a + N, d = b + N; tri(a, b, c); tri(b, d, c);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    const outlineOf = (pts, n) => new THREE.CatmullRomCurve3(pts.map((q) => V3(q[0], q[1], 0)), true, 'centripetal').getSpacedPoints(n).slice(0, n);
    // a two-bone limb (thigh and shin, upper arm and forearm) from a to c, the joint bent toward pole
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
    const paintHex = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : 0x2f3b42;
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
    M.black = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.45, metalness: 0.4 });
    M.gloss = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.15, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xdadde0, roughness: 0.08, metalness: 1 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xa8acb2, roughness: 0.3, metalness: 0.9 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 });
    M.seat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.75 });
    M.disc = new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.35, metalness: 0.85 });
    M.screen = new THREE.MeshPhysicalMaterial({ color: 0x151a1e, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    M.head = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, emissive: 0xeef4ff, emissiveIntensity: 1.2, roughness: 0.2 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a10, emissiveIntensity: 0.4, roughness: 0.3 });
    M.jacket = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.7 });
    M.jeans = new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.85 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: 0x101012, roughness: 0.2, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    const body = new THREE.Group(); body.position.z = zB; model.add(body);
    const tips = [], spots = [];

    // ---------------------------------------------------------------- the frame, tank, seat, side covers
    const yTank = 0.86;
    tubeAB(body, V3(0, 0.98, -0.46), V3(0, 0.78, 0.35), 0.03, M.black);                      // backbone
    for (const sx of [-1, 1]) { tubeAB(body, V3(sx * 0.07, 0.95, -0.48), V3(sx * 0.1, 0.25, -0.34), 0.022, M.black); tubeAB(body, V3(sx * 0.1, 0.22, -0.32), V3(sx * 0.12, 0.22, 0.38), 0.02, M.black); }
    add(body, loft([{ z: -0.5, w: 0.14, yb: yTank, yt: yTank + 0.14, n: 2.6 }, { z: -0.4, w: 0.2, yb: yTank - 0.06, yt: yTank + 0.24, n: 2.6 }, { z: -0.2, w: 0.22, yb: yTank - 0.08, yt: yTank + 0.25, n: 2.6 },
      { z: 0.0, w: 0.19, yb: yTank - 0.06, yt: yTank + 0.2, n: 2.6 }, { z: 0.08, w: 0.14, yb: yTank - 0.04, yt: yTank + 0.12, n: 2.6 }]), M.paint, 0, 0, 0);
    add(body, rbox(0.1, 0.03, 0.34, 0.012), M.black, 0, yTank + 0.25, -0.2);                    // the tank console
    add(body, cylX(0.035, 0.035, 0.03, 16), M.chrome, 0, yTank + 0.24, -0.4);                    // (the filler cap)
    // the stepped two-up seat
    add(body, loft([{ z: 0.02, w: 0.1, yb: 0.68, yt: 0.73, n: 3 }, { z: 0.1, w: 0.16, yb: 0.63, yt: 0.71, n: 3 }, { z: 0.2, w: 0.19, yb: 0.61, yt: 0.7, n: 3 }, { z: 0.34, w: 0.19, yb: 0.61, yt: 0.73, n: 3 },
      { z: 0.42, w: 0.17, yb: 0.64, yt: 0.8, n: 3 }, { z: 0.5, w: 0.15, yb: 0.68, yt: 0.8, n: 3 }, { z: 0.74, w: 0.13, yb: 0.7, yt: 0.8, n: 3 }, { z: 0.8, w: 0.1, yb: 0.72, yt: 0.77, n: 3 }]), M.seat, 0, 0, 0);
    for (const sx of [-1, 1]) add(body, rbox(0.03, 0.2, 0.3, 0.01), M.paint, sx * 0.15, 0.56, 0.22);   // side covers

    // ---------------------------------------------------------------- the 45-degree V-twin
    const eng = new THREE.Group(); eng.position.set(0, 0.2, -0.12); body.add(eng);
    add(eng, rbox(0.24, 0.26, 0.42, 0.05), M.black, 0, 0.14, 0.0);                             // crankcase
    for (const [dz, ang] of [[-0.12, -0.39], [0.13, 0.39]]) {
      const cyl = new THREE.Group(); cyl.position.set(0, 0.28, dz); cyl.rotation.x = ang; eng.add(cyl);
      add(cyl, new THREE.CylinderGeometry(0.075, 0.08, 0.2, 20), M.black, 0, 0.1, 0);
      for (let k = 0; k < 9; k++) add(cyl, new THREE.CylinderGeometry(0.105, 0.105, 0.008, 20), M.black, 0, 0.03 + k * 0.02, 0);
      add(cyl, rbox(0.2, 0.1, 0.19, 0.03), M.black, 0, 0.26, 0);                                   // head
      for (let k = 0; k < 4; k++) add(cyl, new THREE.BoxGeometry(0.22, 0.006, 0.2), M.alu, 0, 0.225 + k * 0.018, 0);
      add(cyl, rbox(0.17, 0.05, 0.16, 0.02), M.alu, 0, 0.33, 0);                                  // rocker cover
    }
    add(eng, cylX(0.12, 0.12, 0.05, 28), M.chrome, 0.16, 0.44, 0.0);                              // air cleaner (right)
    add(eng, cylX(0.1, 0.1, 0.052, 28), M.black, 0.165, 0.44, 0.0);
    add(eng, loft([{ z: -0.18, xc: -0.13, w: 0.02, yb: 0.02, yt: 0.2, n: 2 }, { z: 0.0, xc: -0.15, w: 0.04, yb: -0.02, yt: 0.24, n: 2 }, { z: 0.34, xc: -0.15, w: 0.04, yb: -0.02, yt: 0.24, n: 2 }, { z: 0.48, xc: -0.13, w: 0.02, yb: 0.04, yt: 0.2, n: 2 }]), M.gloss, 0, 0, 0);   // primary (left)
    add(body, rbox(0.2, 0.18, 0.3, 0.04), M.black, 0, 0.36, 0.32);                                  // transmission
    // (the turbo drag bagger: a turbo hung on the right, its intercooler piping)
    if (TURBO) { add(body, new THREE.SphereGeometry(0.09, 16, 12), M.alu, 0.24, 0.42, -0.35); pipe(body, [V3(0.24, 0.42, -0.35), V3(0.26, 0.6, -0.3), V3(0.2, 0.64, -0.12)], 0.035, M.alu); }
    // the pipes: both heads down the right, into a muffler under each bag
    for (const sx of [-1, 1]) {
      pipe(body, [V3(0.05, 0.62, -0.3), V3(sx * 0.14, 0.4, -0.42), V3(sx * 0.2, 0.2, -0.28), V3(sx * 0.24, 0.22, 0.2), V3(sx * 0.28, 0.26, 0.45)], 0.03, M.black);
      add(body, new THREE.CylinderGeometry(0.055, 0.05, 0.62, 20).rotateX(Math.PI / 2), M.black, sx * 0.3, 0.27, 0.72, 0.05, 0, 0);
      add(body, new THREE.CylinderGeometry(0.045, 0.045, 0.02, 18).rotateX(Math.PI / 2), M.alu, sx * 0.3, 0.285, 1.035);
      tips.push(toRoot(V3(sx * 0.3, 0.285, 1.05)));
      // floorboards (rider and passenger)
      add(body, rbox(0.12, 0.02, 0.3, 0.008), M.black, sx * 0.32, 0.28, -0.22);
      add(body, rbox(0.1, 0.02, 0.18, 0.008), M.black, sx * 0.3, 0.32, 0.36);
    }
    // ---------------------------------------------------------------- the saddlebags, the rear fender and lights
    // (hard bags hung either side of the back wheel: a flat face, the back end rounded down to the muffler, the lid a
    // lip wider than the bag, a red light strip set into the back of each)
    for (const sx of [-1, 1]) {
      const xc = sx * 0.37;
      add(body, loft([{ z: 0.5, xc, w: 0.085, yb: 0.36, yt: 0.64, n: 4 }, { z: 0.54, xc, w: 0.095, yb: 0.34, yt: 0.66, n: 4 }, { z: 0.95, xc, w: 0.1, yb: 0.33, yt: 0.66, n: 4 },
        { z: 1.12, xc, w: 0.098, yb: 0.34, yt: 0.66, n: 4 }, { z: 1.21, xc, w: 0.092, yb: 0.37, yt: 0.64, n: 4 }, { z: 1.27, xc, w: 0.08, yb: 0.42, yt: 0.6, n: 4 }, { z: 1.29, xc, w: 0.06, yb: 0.47, yt: 0.56, n: 4 }]), M.paint, 0, 0, 0);
      add(body, loft([{ z: 0.49, xc, w: 0.09, yb: 0.64, yt: 0.7, n: 4 }, { z: 0.53, xc, w: 0.104, yb: 0.64, yt: 0.745, n: 4 }, { z: 0.95, xc, w: 0.108, yb: 0.64, yt: 0.755, n: 4 },
        { z: 1.14, xc, w: 0.106, yb: 0.64, yt: 0.74, n: 4 }, { z: 1.23, xc, w: 0.098, yb: 0.64, yt: 0.705, n: 4 }, { z: 1.27, xc, w: 0.08, yb: 0.64, yt: 0.67, n: 4 }]), M.paint, 0, 0, 0);
      add(body, rbox(0.012, 0.012, 0.72, 0.004), M.black, xc + sx * 0.104, 0.641, 0.88);                  // the lid seam
      add(body, rbox(0.02, 0.05, 0.02, 0.006), M.chrome, xc + sx * 0.108, 0.62, 0.62);                   // the latch
      const strip = add(body, rbox(0.14, 0.022, 0.03, 0.008), M.tail, xc, 0.5, 1.265, 0, 0, 0, false); strip.rotation.x = -0.5;
      add(body, rbox(0.012, 0.03, 0.05, 0.004), M.tail, xc + sx * 0.1, 0.44, 1.2, 0, 0, 0, false);      // side reflector
    }
    // the rear fender over the tyre, the tail light and the plate
    add(body, loft([{ z: 0.46, w: 0.12, yb: 0.62, yt: 0.7, n: 3 }, { z: 0.62, w: 0.14, yb: 0.66, yt: 0.76, n: 3 }, { z: 0.85, w: 0.145, yb: 0.68, yt: 0.78, n: 3 }, { z: 1.05, w: 0.14, yb: 0.64, yt: 0.75, n: 3 },
      { z: 1.22, w: 0.13, yb: 0.54, yt: 0.68, n: 3 }, { z: 1.32, w: 0.11, yb: 0.44, yt: 0.58, n: 3 }, { z: 1.35, w: 0.09, yb: 0.4, yt: 0.5, n: 3 }]), M.paint, 0, 0, 0);
    add(body, rbox(0.14, 0.035, 0.03, 0.01), M.tail, 0, 0.6, 1.285, -0.6, 0, 0, false);
    add(body, rbox(0.19, 0.1, 0.008, 0.004), M.black, 0, 0.44, 1.36, -0.15, 0, 0);                        // plate bracket
    add(body, rbox(0.17, 0.085, 0.004, 0.003), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5 }), 0, 0.44, 1.365, -0.15, 0, 0);

    // ---------------------------------------------------------------- the front end: turns about the steering head
    const RAKE = 26 * Math.PI / 180, head = V3(0, 0.99, zF + 0.34);
    const axis = V3(0, Math.cos(RAKE), Math.sin(RAKE));
    const front = new THREE.Group(); front.position.copy(head); body.add(front);
    const at = (x, y, z) => V3(x - head.x, y - head.y, z - head.z);
    // forks (from the axle up the rake to the triple trees)
    const axle = V3(0, RF, zF), slide = new THREE.Group(); front.add(slide);
    for (const sx of [-1, 1]) {
      const a = at(sx * 0.1, axle.y + 0.02, axle.z), b = at(sx * 0.1, head.y + 0.05, head.z + 0.03);
      tubeAB(slide, a, b.clone().lerp(a, 0.55), 0.028, M.black); tubeAB(front, b.clone().lerp(a, 0.7), b, 0.022, M.chrome);
    }
    add(front, rbox(0.26, 0.04, 0.1, 0.015), M.black, 0, 0.0, 0.0);
    // the front fender, low over the tyre
    { const fg = new THREE.Group(); fg.position.copy(at(0, axle.y, axle.z)); slide.add(fg);
      const sh = new THREE.Shape(); sh.absarc(0, 0, RF + 0.05, 0.25, Math.PI - 0.15, false); sh.absarc(0, 0, RF + 0.02, Math.PI - 0.15, 0.25, true);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 });
      g.rotateY(Math.PI / 2); g.translate(-0.075, 0, 0); add(fg, g, M.paint, 0, 0, 0); }
    // the batwing fairing: a wide shell on the forks - flat and wide along the top, its tips swept back past the bars, its
    // lower edge swept down and in to the fork crown - the twin LED headlamps in its nose, the short smoked screen on
    // top, and the inner fairing (the dash, the speakers) bulged back toward the rider
    const fair = new THREE.Group(); fair.position.copy(at(0, 0.98, zF + 0.19)); front.add(fair);
    const wingPts = [[0, -0.2], [0.14, -0.18], [0.27, -0.1], [0.37, -0.01], [0.425, 0.08], [0.41, 0.13], [0.3, 0.17], [0.15, 0.19], [0, 0.195],
      [-0.15, 0.19], [-0.3, 0.17], [-0.41, 0.13], [-0.425, 0.08], [-0.37, -0.01], [-0.27, -0.1], [-0.14, -0.18]];
    const wing = outlineOf(wingPts, 72);
    const sweep = (x, y) => 0.17 * (x / 0.42) * (x / 0.42) + (y > 0 ? 0.24 * y : 0.1 * -y);
    add(fair, shell(wing, (x, y, r) => sweep(x, y) - 0.11 * (1 - r * r), 0, 0, false, 12), M.paint, 0, 0, 0);
    add(fair, shell(wing, (x, y, r) => sweep(x, y) + 0.1 * (1 - r * r), 0, 0, true, 12), M.black, 0, 0, 0);
    // (the edge: a thin black lip where the two shells meet)
    add(fair, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wing.map((q) => V3(q.x, q.y, sweep(q.x, q.y))), true), 96, 0.008, 6, true), M.black, 0, 0, 0);
    // the headlamps: two round LED lamps side by side in one chrome-ringed housing, the vent slot above
    const hz = (x, y) => sweep(x, y) - 0.11 * (1 - (x * x / 0.17 + y * y / 0.04)) - 0.004;
    { const hs = new THREE.Shape(); hs.absarc(-0.075, 0, 0.068, Math.PI / 2, Math.PI * 1.5, false); hs.absarc(0.075, 0, 0.068, -Math.PI / 2, Math.PI / 2, false);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 20 });
      add(fair, hg, M.chrome, 0, -0.03, hz(0, -0.03) - 0.018); }
    for (const sx of [-1, 1]) {
      add(fair, new THREE.CylinderGeometry(0.058, 0.058, 0.012, 28).rotateX(Math.PI / 2), M.black, sx * 0.075, -0.03, hz(0, -0.03) - 0.026);
      // (each an LED reflector: the lit ring round a dark projector lens)
      add(fair, new THREE.RingGeometry(0.036, 0.052, 32), M.head, sx * 0.075, -0.03, hz(0, -0.03) - 0.033, 0, Math.PI, 0, false);
      add(fair, new THREE.CircleGeometry(0.036, 28), M.lens || (M.lens = new THREE.MeshPhysicalMaterial({ color: 0x20262c, roughness: 0.05, metalness: 0.6, clearcoat: 1 })), sx * 0.075, -0.03, hz(0, -0.03) - 0.031, 0, Math.PI, 0, false);
      add(fair, new THREE.TorusGeometry(0.036, 0.004, 8, 32), M.chrome, sx * 0.075, -0.03, hz(0, -0.03) - 0.034, 0, 0, 0, false);
      // (the turn signals on the fork, below the fairing)
      add(front, new THREE.SphereGeometry(0.03, 14, 10), M.amber || (M.amber = new THREE.MeshStandardMaterial({ color: 0x8a5a10, emissive: 0xff9a20, emissiveIntensity: 0.25, roughness: 0.3 })),
        ...at(sx * 0.2, 0.78, zF + 0.2).toArray());
      tubeAB(front, at(sx * 0.1, 0.79, zF + 0.24), at(sx * 0.2, 0.78, zF + 0.2), 0.008, M.chrome);
    }
    add(fair, rbox(0.12, 0.018, 0.02, 0.008), M.black, 0, 0.08, hz(0, 0.08) - 0.005);
    // the short smoked screen, raked back off the top edge
    { const scr = outlineOf([[0, 0.17], [0.2, 0.16], [0.31, 0.15], [0.26, 0.22], [0.14, 0.28], [0, 0.3], [-0.14, 0.28], [-0.26, 0.22], [-0.31, 0.15], [-0.2, 0.16]], 48);
      add(fair, shell(scr, (x, y) => sweep(x, y) + 0.5 * Math.max(0, y - 0.17) - 0.01, 0, 0.22, false, 4), M.screen, 0, 0, 0, 0, 0, 0, false); }
    // the dash on the inner fairing: the screen in the middle, a round gauge either side
    const dash = { parent: fair, pos: V3(0, 0.05, 0.115), w: 0.17, h: 0.085 };
    for (const sx of [-1, 1]) {
      add(fair, new THREE.CylinderGeometry(0.045, 0.048, 0.02, 24).rotateX(Math.PI / 2), M.chrome, sx * 0.15, 0.05, 0.12);
      add(fair, new THREE.CircleGeometry(0.04, 24), new THREE.MeshStandardMaterial({ color: 0x0c0d0e, emissive: 0x1a2a38, emissiveIntensity: 0.6, roughness: 0.3 }), sx * 0.15, 0.05, 0.131, 0, 0, 0, false);
      add(fair, new THREE.CylinderGeometry(0.035, 0.035, 0.01, 20).rotateX(Math.PI / 2), M.black, sx * 0.3, 0.08, 0.165);   // speakers
    }
    // the bars: risers off the top clamp, swept back to the grips; stalk mirrors on the bars
    const grip = (sx) => at(sx * 0.38, 1.1, zF + 0.6);
    for (const sx of [-1, 1]) {
      pipe(front, [at(sx * 0.05, 1.03, zF + 0.38), at(sx * 0.07, 1.1, zF + 0.43), at(sx * 0.22, 1.12, zF + 0.5), at(sx * 0.33, 1.1, zF + 0.58)], 0.012, M.chrome);
      add(front, cylX(0.019, 0.019, 0.12, 14), M.rubber, ...grip(sx).toArray());
      add(front, rbox(0.06, 0.05, 0.06, 0.015), M.black, ...at(sx * 0.29, 1.1, zF + 0.57).toArray());          // switch housing
      add(front, cylX(0.006, 0.006, 0.16, 6), M.black, ...at(sx * 0.37, 1.13, zF + 0.55).toArray());          // lever
      tubeAB(front, at(sx * 0.3, 1.12, zF + 0.56), at(sx * 0.4, 1.23, zF + 0.55), 0.007, M.chrome);
      const mr = add(front, new THREE.SphereGeometry(0.055, 18, 10), M.chrome, ...at(sx * 0.42, 1.25, zF + 0.55).toArray()); mr.scale.set(1.3, 0.7, 0.3);
    }
    const SW = new THREE.Group(); front.add(SW);
    // headlamp spots
    for (const sx of [-1, 1]) {
      const sl = new THREE.SpotLight(0xf2f4ff, 0, 70, 0.45, 0.45, 1.4);
      sl.position.copy(toRoot(V3(sx * 0.05, 0.98, zF - 0.1))); sl.target.position.copy(toRoot(V3(sx * 0.3, 0, zF - 40)));
      rootG.add(sl); rootG.add(sl.target); sl.visible = false; spots.push(sl);
    }

    // ---------------------------------------------------------------- the wheels: one tyre drawn at each axle
    // (on the left wheel of each pair; the right ones are the physics' twins, nothing drawn)
    // (the dual-sport knobbies - the off-road package: a slimmer carcass under rows of square knobs, three across the
    // crown and four down the shoulders in turn, standing out to the road tyre's size. Merged into one mesh)
    function knobbyGeo(R, W) {
      const Rc = R - W * 0.42, r = W * 0.4, kh = 0.013, N = Math.round(2 * Math.PI * R / 0.048), pos = [], nrm = [];
      for (let k = 0; k < N; k++) for (const ph of (k & 1 ? [-1.12, -0.38, 0.38, 1.12] : [-0.76, 0, 0.76])) {
        const b = new THREE.BoxGeometry(W * 0.17, kh * 2, 0.026).toNonIndexed();
        b.rotateZ(-ph); b.translate((r + kh * 0.5) * Math.sin(ph), Rc + (r + kh * 0.5) * Math.cos(ph), 0); b.rotateX(k * 2 * Math.PI / N);
        pos.push(...b.attributes.position.array); nrm.push(...b.attributes.normal.array);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      const carc = new THREE.TorusGeometry(Rc, r, 14, 40); carc.rotateY(Math.PI / 2);
      return [carc, g];
    }
    function wheelGeo(g, R, W, rimR, front) {
      const tyre = new THREE.TorusGeometry(R - W * 0.42, W * 0.46, 14, 40); tyre.rotateY(Math.PI / 2);
      const stock = [add(g, tyre, M.rubber, 0, 0, 0)], pkg = knobbyGeo(R, W).map((k) => { const m = add(g, k, M.rubber, 0, 0, 0); m.visible = false; return m; });
      add(g, new THREE.CylinderGeometry(rimR, rimR, W * 0.7, 32, 1, true).rotateZ(Math.PI / 2), M.black, 0, 0, 0);
      // a black cast wheel, many thin spokes with their edges machined
      const n = front ? 10 : 8;
      for (let k = 0; k < n; k++) {
        const s = add(g, new THREE.BoxGeometry(0.02, rimR * 0.95, 0.022), M.black, 0, 0, 0); s.geometry.translate(0, rimR * 0.48, 0); s.rotation.x = k * 2 * Math.PI / n;
        const e = add(g, new THREE.BoxGeometry(0.022, rimR * 0.85, 0.006), M.alu, 0.002, 0, 0); e.geometry.translate(0, rimR * 0.5, 0.012); e.rotation.x = k * 2 * Math.PI / n;
      }
      add(g, cylX(0.05, 0.05, 0.1, 16), M.alu, 0, 0, 0);
      if (front) for (const sx of [-1, 1]) { add(g, cylX(0.15, 0.15, 0.005, 32), M.disc, sx * 0.07, 0, 0); add(g, cylX(0.08, 0.08, 0.007, 16), M.black, sx * 0.07, 0, 0); }
      else { add(g, cylX(0.15, 0.15, 0.008, 32), M.disc, 0.07, 0, 0); add(g, cylX(0.2, 0.2, 0.03, 40), M.alu, -0.07, 0, 0); }
      return { stock, pkg };
    }
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group(); corner.position.set(side * 0.01, (frontW ? RF : RR) - cgH, frontW ? -cgToFront : cgToRear); rootG.add(corner);
      const flip = new THREE.Group(); corner.add(flip); const spin = new THREE.Group(); spin.position.x = -side * 0.01; flip.add(spin);
      const T = left ? wheelGeo(spin, frontW ? RF : RR, frontW ? 0.13 : 0.18, frontW ? 0.24 : 0.23, frontW) : { stock: [], pkg: [] };
      // (left: false - the game spins a mirrored left wheel the other way, and these are drawn unmirrored)
      wheels.push({ corner, flip, spin, left: false, front: frontW, side, stock: T.stock, pkg: T.pkg });
    }
    // (the calipers on the fork sliders; the swingarm pivots in the frame and follows the back axle)
    add(slide, rbox(0.04, 0.1, 0.07, 0.01), M.black, ...at(-0.07, RF + 0.12, zF + 0.08).toArray());
    add(slide, rbox(0.04, 0.1, 0.07, 0.01), M.black, ...at(0.07, RF + 0.12, zF + 0.08).toArray());
    const pivot = V3(0, 0.34, 0.3), swing = new THREE.Group(); swing.position.copy(pivot); body.add(swing);
    for (const sx of [-1, 1]) tubeAB(swing, V3(sx * 0.12, 0, 0), V3(sx * 0.12, RR - pivot.y, zR - pivot.z), 0.025, M.black);
    add(swing, rbox(0.05, 0.1, 0.14, 0.01), M.black, 0.12, RR - pivot.y + 0.06, zR - pivot.z - 0.08);
    const swLen = Math.hypot(RR - pivot.y, zR - pivot.z), swAng = Math.atan2(RR - pivot.y, zR - pivot.z);

    // ---------------------------------------------------------------- the rider (a foot down at a stop)
    const rider = new THREE.Group(); body.add(rider);
    // (sat upright in the seat's pocket: hands forward on the grips, feet forward on the floorboards)
    const hip = V3(0, 0.79, 0.2);
    { const torso = [[-0.06, 0.16, 0.1, 0.12], [0.1, 0.155, 0.1, 0.1], [0.28, 0.17, 0.11, 0.1], [0.42, 0.2, 0.1, 0.1], [0.5, 0.19, 0.08, 0.09], [0.56, 0.09, 0.05, 0.06]];
      const tg = loft(torso.map(([h, w, dF, dB]) => ({ z: h, w, yb: -dB, yt: dF, n: 2.6 })), 28); tg.rotateX(-Math.PI / 2);
      add(rider, tg, M.jacket, hip.x, hip.y, hip.z); }
    add(rider, new THREE.CylinderGeometry(0.05, 0.055, 0.16, 14), M.jacket, hip.x, hip.y + 0.6, hip.z + 0.005);
    const hd = V3(0, hip.y + 0.745, hip.z - 0.015);
    { const hm = add(rider, new THREE.SphereGeometry(0.135, 26, 18), M.helmet, hd.x, hd.y, hd.z); hm.scale.set(0.95, 1, 1.08); }
    add(rider, new THREE.SphereGeometry(0.138, 26, 12, -Math.PI / 2 - 0.9, 1.8, 1.2, 0.55), M.visor, hd.x, hd.y, hd.z, 0, 0, 0, false);
    for (const sx of [-1, 1]) {
      const sh = V3(sx * 0.19, hip.y + 0.47, hip.z), hand = grip(sx).add(head);
      add(rider, new THREE.SphereGeometry(0.058, 14, 10), M.jacket, sh.x, sh.y, sh.z);
      limb(rider, sh, hand, 0.29, 0.28, V3(sx * 0.8, -0.5, 0.3), 0.05, 0.043, 0.036, M.jacket);
      add(rider, new THREE.SphereGeometry(0.042, 12, 10), M.black, hand.x, hand.y, hand.z);
    }
    const legs = (down) => {
      const g = new THREE.Group(); rider.add(g);
      for (const sx of [-1, 1]) {
        const hp = V3(sx * 0.1, hip.y, hip.z), put = down && sx < 0;
        const ank = put ? V3(sx * 0.36, 0.1, 0.02) : V3(sx * 0.31, 0.36, -0.2);
        limb(g, hp, ank, 0.44, 0.43, put ? V3(sx * 0.4, 0.2, -1) : V3(sx * 0.6, 0.6, -1), 0.075, 0.056, 0.045, M.jeans);
        const boot = add(g, rbox(0.1, 0.1, 0.27, 0.035), M.black, ank.x, ank.y - 0.04, ank.z - 0.06);
        if (!put) boot.rotation.x = 0.15;
      }
      return g;
    };
    const legsRide = legs(false), legsDown = legs(true); legsDown.visible = false;
    const eye = toRoot(V3(hd.x, hd.y - 0.01, hd.z - 0.08));

    // ---------------------------------------------------------------- the dash display (in the fairing)
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const cTex = new THREE.CanvasTexture(cv); cTex.colorSpace = THREE.SRGBColorSpace;
    add(dash.parent, new THREE.PlaneGeometry(dash.w, dash.h), new THREE.MeshBasicMaterial({ map: cTex, toneMapped: false }), dash.pos.x, dash.pos.y, dash.pos.z + 0.002, -0.3, 0, 0, false);
    const cg = cv.getContext('2d');
    function drawCluster(t) {
      cg.fillStyle = '#07090b'; cg.fillRect(0, 0, 512, 256);
      const r = clamp(t.rpm / (t.redline || 5500), 0, 1.1);
      for (let k = 0; k < 10; k++) { cg.fillStyle = r > 0.3 + k * 0.07 ? (k < 6 ? '#29ff5a' : k < 8 ? '#ffd21a' : '#ff2a1a') : '#1b1f22'; cg.fillRect(16 + k * 48, 12, 40, 22); }
      cg.fillStyle = '#e8f0f4'; cg.font = 'bold 120px Arial'; cg.textAlign = 'left'; cg.textBaseline = 'middle'; cg.fillText(String(Math.round(t.speedMph)), 16, 128);
      cg.font = 'bold 36px Arial'; cg.fillStyle = '#8fb2c6'; cg.fillText('MPH', 20, 214);
      cg.fillStyle = '#ffffff'; cg.font = 'bold 90px Arial'; cg.textAlign = 'right'; cg.fillText(t.gear.replace(/^[DM](?=\d)/, '') || 'N', 496, 140);
      cTex.needsUpdate = true;
    }

    // ---------------------------------------------------------------- per frame
    const _q = new THREE.Quaternion();
    function afterWheels() {
      // the front end turns about the raked steering head with the front wheel
      _q.setFromAxisAngle(axis, wheels[0].corner.rotation.y);
      front.quaternion.copy(_q);
      // (the wheels' travel from where the model was drawn: up the fork, and the swingarm swings)
      const dF = wheels[0].corner.position.y - (RF - cgH), dR = wheels[2].corner.position.y - (RR - cgH);
      slide.position.set(0, dF, dF * Math.tan(RAKE));
      swing.rotation.x = -(Math.asin(clamp((RR - pivot.y + dR) / swLen, -1, 1)) - swAng);
    }
    function setRider(speed) { const down = Math.abs(speed) < 1.2; legsRide.visible = !down; legsDown.visible = down; }
    function setPaint(name) { const c = PAINTS[name]; if (c !== undefined) M.paint.color.setHex(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 4 : (o.headlights ? 1.4 : 0.4);
      M.head.emissiveIntensity = o.headlights ? 3.5 : 1.2;
      for (const s of spots) { s.visible = !!o.headlights; s.intensity = o.headlights ? 160 : 0; }
    }
    function setInteriorVisible(v, cockpit) { rider.visible = !cockpit; M.screen.opacity = cockpit ? 0.2 : 0.7; }
    const noop = () => {};
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel: SW, eye,
      exhaustTips: tips, materials: M, headlights: spots, tailLens: [], mirrors: [],
      setPaint, setLights, setInteriorVisible,
      // (the off-road package's dual-sport knobbies - ccKnob - in place of the touring tyres)
      setTires(front, rear) { for (const w of wheels) { const on = (w.front ? front : rear) === 'ccKnob'; for (const m of w.stock) m.visible = !on; for (const m of w.pkg) m.visible = on; } }, setTransmission: noop, drawCluster, drawScreen: noop, setChute: noop,
      afterWheels, setRider, variant: 'bike', cls: VER,
    };
  }

  root.HCBike = { build };
})(typeof self !== 'undefined' ? self : this);
