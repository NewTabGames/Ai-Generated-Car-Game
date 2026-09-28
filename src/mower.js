/* Hellcat Drive — procedural racing lawn mowers.
   B-Prepared: a full-size garden tractor as it left the factory - stamped-steel frame, a rounded hood over the V-twin with
   the headlights taped over (the rules), the dash tower and a tilted steering wheel, running boards, the cutting deck hung
   empty underneath with its side chute, a fender pan over the rear tyres with a high-back seat on it, turf tyres on
   steel wheels, open pipes out the sides, a pod filter poking out of the hood, a loop bumper at the back.
   FX: a hand-built tube chassis under a lower lawn tractor hood with a scoop, a go-kart seat down in the frame, nerf bars
   and loop bumpers (the rules), a deck shell, small rear fenders with a spoiler, kart dirt tyres on aluminium rims.
   Record: a long carbon-and-red lawn tractor body over a superbike four - radiator behind the grille, the 4-into-1 down
   the right side to a big silencer, gold 10 in wheels on racing slicks, a roll hoop behind the seat, a carbon deck.
   The driver sits up on the seat in a race suit and full-face helmet, the kill-switch lanyard clipped to the dash.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const CLS = opts.cls === 'fx' ? 'fx' : opts.cls === 'rec' ? 'rec' : 'bp';
    const BP = CLS === 'bp', FX = CLS === 'fx', REC = CLS === 'rec';
    const cgH = opts.cgHeight || 0.42, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 0.68, cgToRear = opts.cgToRear || 0.54;
    const L = cgToFront + cgToRear, zF = -L / 2, zR = L / 2;
    const RF = opts.wheelRadiusF || 0.19, RR = opts.wheelRadiusR || 0.254;
    const WF = BP ? 0.152 : FX ? 0.115 : 0.19, WR = BP ? 0.254 : FX ? 0.178 : 0.19;
    const trackF = opts.trackF || 0.82, trackR = opts.trackR || 0.78;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || { 'Sublime': 0x6cbf2a };
    const NUM = BP ? '17' : FX ? '88' : '1';
    const rootG = new THREE.Group(); rootG.name = 'mower';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const toRoot = (v) => v.clone().add(V3(0, -cgH, zOff));

    // ---------------------------------------------------------------- helpers
    function canvasTex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      draw(g, w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    }
    const add = (parent, geo, mat, x, y, z, rx, ry, rz, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = cast !== false; m.receiveShadow = true;
      parent.add(m); return m;
    };
    function rbox(w, h, d, r) {
      r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
      const s = new THREE.Shape(), x0 = -w / 2 + r, y0 = -h / 2 + r, x1 = w / 2 - r, y1 = h / 2 - r;
      s.moveTo(x0, -h / 2 + r); s.lineTo(x0, y1); s.lineTo(x1, y1); s.lineTo(x1, y0); s.lineTo(x0, y0);
      const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
      g.translate(0, 0, -(d - 2 * r) / 2); return g;
    }
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    const pipe = (parent, pts, r, mat) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 10, r, 12, false), mat, 0, 0, 0);
    const cylX = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateZ(Math.PI / 2); return g; };
    function latheX(pts, seg) { const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg || 40); g.rotateZ(-Math.PI / 2); return g; }
    function mergeGeos(list) {
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.computeBoundingSphere(); return out;
    }
    // a (z, y) side profile extruded across the mower, centred on x = 0, w wide, with rounded edges
    function profile(pts, w, bevel) {
      const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      const b = bevel || 0.03;
      const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 8 });
      g.rotateY(Math.PI / 2); g.scale(1, 1, -1);
      const p = g.attributes.position;
      if (!g.index) for (let k = 0; k < p.count; k += 3) for (const a of [p, g.attributes.uv]) { const sz = a.itemSize; for (let c = 0; c < sz; c++) { const t = a.array[(k + 1) * sz + c]; a.array[(k + 1) * sz + c] = a.array[(k + 2) * sz + c]; a.array[(k + 2) * sz + c] = t; } }
      g.translate(-(w / 2 - b), 0, 0); g.computeVertexNormals();
      return g;
    }
    // a smooth curve through control points, sampled for profile()
    const curve = (cp, n) => new THREE.CatmullRomCurve3(cp.map(([z, y]) => V3(z, y, 0))).getPoints(n || 24).map((p) => [p.x, p.y]);

    // ---------------------------------------------------------------- materials
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] || 0x6cbf2a, metalness: 0.05, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    M.frame = new THREE.MeshStandardMaterial({ color: BP ? 0x2a2b2e : 0x151517, roughness: 0.45, metalness: 0.6 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.6, metalness: 0.1 });
    M.vinyl = new THREE.MeshStandardMaterial({ color: 0x19191a, roughness: 0.45, metalness: 0.05 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.92 });
    M.rim = new THREE.MeshStandardMaterial({ color: BP ? 0xf2c417 : FX ? 0xc9ccd1 : 0xc9a13a, roughness: BP ? 0.4 : 0.25, metalness: BP ? 0.3 : 0.85 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.08, metalness: 1 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xb4b8be, roughness: 0.35, metalness: 0.85 });
    M.cast = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.5, metalness: 0.7 });
    M.deck = new THREE.MeshStandardMaterial({ color: REC ? 0x1c1d20 : 0x2c2e31, roughness: REC ? 0.3 : 0.55, metalness: REC ? 0.4 : 0.5 });
    M.carbon = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.28, metalness: 0.45 });
    M.red = new THREE.MeshStandardMaterial({ color: 0xc81a1a, roughness: 0.4, metalness: 0.3 });
    M.suit = new THREE.MeshStandardMaterial({ color: BP ? 0x243a8a : FX ? 0xa51c1c : 0x1b1b1d, roughness: 0.8 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: BP ? 0xf2f2f2 : FX ? 0xf2c417 : 0xc81a1a, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.mesh = new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = '#060607'; g.fillRect(0, 0, w, h); g.strokeStyle = '#34363a'; g.lineWidth = 2;
      for (let x = -h; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); }
    }), roughness: 0.6, metalness: 0.4 });
    M.tape = new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.7 });
    M.lamp = new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.2, metalness: 0.6 });
    const numTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#111'; g.font = '900 150px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(NUM, w / 2, h / 2 - 12);
      g.font = 'bold 40px Arial'; g.fillText(BP ? 'B-PREP' : FX ? 'FX' : 'RECORD', w / 2, h - 34);
    });
    M.num = new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });

    // ---------------------------------------------------------------- frame
    const chassis = new THREE.Group(); model.add(chassis);
    const T = (a, b, r, mat) => tubeAB(chassis, a, b, r || 0.016, mat || M.frame, 10);
    const zNose = BP ? -1.0 : FX ? -1.0 : -1.32, zTail = zR + (BP ? 0.3 : FX ? 0.28 : 0.4);
    if (BP) {
      // two stamped channels, nose to tail, and the front axle beam on its centre pivot; a closed-loop rear bumper
      for (const sx of [-1, 1]) add(chassis, new THREE.BoxGeometry(0.035, 0.1, zTail - zNose - 0.1), M.frame, sx * 0.2, 0.24, (zNose + zTail) / 2 + 0.03);
      add(chassis, new THREE.BoxGeometry(trackF - 0.2, 0.06, 0.07), M.frame, 0, RF, zF);
      add(chassis, cylX(0.025, 0.025, 0.1, 12), M.cast, 0, RF + 0.04, zF);
      for (const y of [0.2, 0.34]) T(V3(-0.3, y, zTail + 0.04), V3(0.3, y, zTail + 0.04), 0.017, M.black);
      for (const sx of [-1, 1]) { T(V3(sx * 0.3, 0.2, zTail + 0.04), V3(sx * 0.3, 0.34, zTail + 0.04), 0.017, M.black); T(V3(sx * 0.3, 0.27, zTail + 0.04), V3(sx * 0.2, 0.24, zTail - 0.1), 0.015, M.black); }
    } else {
      // tube chassis: rails, cross tubes, the front axle welded in, nerf bars with their outer hoops, loop bumpers
      const y0 = FX ? 0.12 : 0.16, hw = FX ? 0.2 : 0.24;
      for (const sx of [-1, 1]) {
        T(V3(sx * hw * 0.8, y0 + 0.08, zNose + 0.05), V3(sx * hw, y0, zF + 0.1), 0.02); T(V3(sx * hw, y0, zF + 0.1), V3(sx * hw, y0, zR + 0.05), 0.02);
        T(V3(sx * hw, y0, zR + 0.05), V3(sx * hw * 0.8, y0 + 0.08, zTail - 0.05), 0.02);
        // nerf bars: out to just inside the tyres' outer faces, with the kart-style second hoop
        const nx = sx * ((FX ? trackR : trackF) / 2 + 0.02);
        T(V3(sx * hw, y0, zF + 0.22), V3(nx, y0 + 0.02, zF + 0.3), 0.014); T(V3(nx, y0 + 0.02, zF + 0.3), V3(nx, y0 + 0.02, zR - 0.28), 0.014);
        T(V3(nx, y0 + 0.02, zR - 0.28), V3(sx * hw, y0, zR - 0.2), 0.014);
        T(V3(sx * hw, y0 + 0.1, zF + 0.3), V3(nx - sx * 0.05, y0 + 0.12, zF + 0.34), 0.012); T(V3(nx - sx * 0.05, y0 + 0.12, zF + 0.34), V3(nx - sx * 0.05, y0 + 0.12, zR - 0.32), 0.012);
      }
      for (const z of [zNose + 0.05, zF + 0.1, 0, zR + 0.05, zTail - 0.05]) { const w = z === zNose + 0.05 || z === zTail - 0.05 ? hw * 0.8 : hw; T(V3(-w, z === zNose + 0.05 || z === zTail - 0.05 ? y0 + 0.08 : y0, z), V3(w, z === zNose + 0.05 || z === zTail - 0.05 ? y0 + 0.08 : y0, z), 0.016); }
      add(chassis, new THREE.BoxGeometry(trackF - 0.16, 0.05, 0.05), M.frame, 0, RF, zF);
      // front bumper (as wide as the hood) and the closed-loop rear bumper
      const bw = FX ? 0.28 : 0.34;
      T(V3(-bw, y0 + 0.12, zNose - 0.06), V3(bw, y0 + 0.12, zNose - 0.06), 0.017);
      for (const sx of [-1, 1]) T(V3(sx * bw, y0 + 0.12, zNose - 0.06), V3(sx * hw * 0.8, y0 + 0.08, zNose + 0.06), 0.015);
      const rb = FX ? 0.36 : 0.45;
      for (const y of [y0 + 0.06, y0 + 0.2]) T(V3(-rb, y, zTail + 0.06), V3(rb, y, zTail + 0.06), 0.017);
      for (const sx of [-1, 1]) { T(V3(sx * rb, y0 + 0.06, zTail + 0.06), V3(sx * rb, y0 + 0.2, zTail + 0.06), 0.017); T(V3(sx * rb, y0 + 0.13, zTail + 0.06), V3(sx * hw * 0.8, y0 + 0.08, zTail - 0.05), 0.015); }
    }
    // the cutting deck (blades out): a rounded housing hung under the middle, 2.5 in off the ground
    {
      const dw = BP ? 1.06 : FX ? 0.86 : 1.0, dl = BP ? 0.56 : FX ? 0.46 : 0.6, dz = BP ? -0.12 : FX ? -0.1 : -0.05;
      add(chassis, rbox(dw, 0.1, dl, 0.045), M.deck, 0, 0.115, dz);
      add(chassis, rbox(dw - 0.08, 0.02, dl - 0.08, 0.008), M.deck, 0, 0.17, dz);
      if (BP) { const ch = add(chassis, rbox(0.2, 0.08, 0.22, 0.02), M.deck, dw / 2 + 0.07, 0.12, dz + 0.04); ch.rotation.y = -0.3; }
      if (REC) for (const sx of [-1, 1]) add(chassis, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 20), M.alu, sx * 0.24, 0.19, dz);   // blade motors
    }

    // ---------------------------------------------------------------- body: hood, dash, footrests, fender pan, seat
    const body = new THREE.Group(); model.add(body);
    const HW2 = BP ? 0.56 : FX ? 0.5 : 0.62;              // hood width
    let hoodPts;
    if (BP) hoodPts = [[-0.3, 0.27]].concat(curve([[-0.3, 0.66], [-0.6, 0.63], [-0.88, 0.585], [-0.985, 0.52], [-1.0, 0.4], [-0.985, 0.27]]));
    else if (FX) hoodPts = [[-0.34, 0.2]].concat(curve([[-0.34, 0.54], [-0.62, 0.5], [-0.88, 0.45], [-0.99, 0.38], [-1.0, 0.3], [-0.985, 0.21]]));
    else hoodPts = [[-0.4, 0.25]].concat(curve([[-0.4, 0.7], [-0.8, 0.64], [-1.15, 0.56], [-1.3, 0.46], [-1.33, 0.36], [-1.31, 0.26]]));
    add(body, profile(hoodPts, HW2, 0.035), M.paint, 0, 0, 0);
    // grille and the hood's front: a black mesh inset, the headlights (taped over, as the rules want) and the number
    const zFront = BP ? -1.0 : FX ? -1.0 : -1.33, gy = BP ? 0.48 : FX ? 0.33 : 0.45;
    add(body, new THREE.PlaneGeometry(HW2 - 0.16, BP ? 0.15 : 0.12), M.mesh, 0, gy, zFront - 0.036, 0, Math.PI, 0, false);
    if (BP) for (const sx of [-1, 1]) {
      add(body, rbox(0.1, 0.06, 0.02, 0.01), M.lamp, sx * 0.17, 0.5, -1.042, 0.2, 0, 0, false);
      for (const a of [0.5, -0.5]) add(body, new THREE.BoxGeometry(0.11, 0.016, 0.004), M.tape, sx * 0.17, 0.5, -1.054, 0.2, 0, a, false);
    }
    // race numbers, visible from all four sides (the rules): the front, both sides of the hood, and the back (the seat
    // back, or the FX's spoiler)
    if (FX) add(body, new THREE.PlaneGeometry(0.14, 0.14), M.num, 0, 0.33, zNose - 0.085, 0, Math.PI, 0, false);
    else add(body, new THREE.PlaneGeometry(0.13, 0.13), M.num, 0, BP ? 0.33 : 0.3, zFront - 0.045, 0, Math.PI, 0, false);
    for (const sx of [-1, 1]) add(body, new THREE.PlaneGeometry(0.2, 0.2), M.num, sx * (HW2 / 2 + 0.002), BP ? 0.46 : FX ? 0.37 : 0.52, BP ? -0.62 : FX ? -0.6 : -0.52, 0, sx * Math.PI / 2, 0, false);
    if (FX) {
      // hood scoop down the middle
      const sc = profile([[-0.42, 0.53], [-0.42, 0.6], [-0.48, 0.61], [-0.8, 0.54], [-0.82, 0.5], [-0.42, 0.5]], 0.26, 0.02);
      add(body, sc, M.black, 0, 0, 0);
      add(body, new THREE.PlaneGeometry(0.2, 0.06), M.mesh, 0, 0.525, -0.825, 0, Math.PI, 0, false);
    }
    if (REC) {
      // side vents for the radiator's air, a clear wind deflector over the dash
      for (const sx of [-1, 1]) add(body, new THREE.PlaneGeometry(0.4, 0.14), M.mesh, sx * (HW2 / 2 + 0.002), 0.47, -0.8, 0, sx * Math.PI / 2, 0, false);
      const ws = add(body, new THREE.PlaneGeometry(0.46, 0.2), new THREE.MeshPhysicalMaterial({ color: 0x9aa6b0, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 0, 0.84, -0.4, -0.5, 0, 0, false);
      ws.castShadow = false;
    }
    // dash tower (steering column, fuel cap, the kill switch)
    const dashZ = BP ? -0.27 : FX ? -0.31 : -0.37, dashTop = BP ? 0.74 : FX ? 0.6 : 0.78;
    add(body, rbox(BP ? 0.34 : 0.3, dashTop - 0.2, 0.14, 0.04), BP ? M.paint : M.black, 0, (dashTop + 0.2) / 2, dashZ);
    add(body, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), M.black, 0.1, dashTop + 0.01, dashZ);
    add(body, new THREE.CylinderGeometry(0.018, 0.018, 0.025, 10), M.red, -0.09, dashTop + 0.01, dashZ - 0.02);
    // footrests / running boards
    const fbY = BP ? 0.27 : FX ? 0.2 : 0.26;
    for (const sx of [-1, 1]) add(body, rbox(0.22, 0.02, BP ? 0.62 : 0.5, 0.008), BP ? M.paint : M.alu, sx * 0.3, fbY, BP ? -0.02 : -0.05);
    // fender pan over the rear tyres with the seat on it (FX: small fenders either side, the seat down in the frame)
    const tyreX = trackR / 2, fr = RR + (BP ? 0.05 : 0.045), fw = WR + (BP ? 0.06 : 0.05);
    for (const sx of [-1, 1]) {
      const arc = new THREE.Shape(), a0 = 0.35, a1 = Math.PI - 0.1;
      arc.absarc(zR, RR, fr + 0.025, a0, a1, false); arc.absarc(zR, RR, fr, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(arc, { depth: fw, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 20 });
      // (shape x = z: turn it so it runs along z, across the tyre)
      g.rotateY(Math.PI / 2); g.scale(1, 1, -1);
      const p = g.attributes.position; for (let k = 0; k < p.count; k += 3) for (const a of [p, g.attributes.uv]) { const sz = a.itemSize; for (let c = 0; c < sz; c++) { const t = a.array[(k + 1) * sz + c]; a.array[(k + 1) * sz + c] = a.array[(k + 2) * sz + c]; a.array[(k + 2) * sz + c] = t; } }
      g.computeVertexNormals();
      add(body, g, M.paint, sx * tyreX - fw / 2, 0, 0);
    }
    const panY = BP ? RR + 0.25 : FX ? RR + 0.2 : RR + 0.26;
    if (!FX) {
      add(body, rbox(trackR - fw + 0.06, 0.04, 0.72, 0.015), M.paint, 0, panY, zR - 0.1);
      add(body, rbox(0.5, panY - 0.28, 0.06, 0.02), M.paint, 0, (panY + 0.28) / 2, zR - 0.44);
    }
    const sY = BP ? panY + 0.02 : FX ? 0.2 : panY + 0.02, sZ = BP ? zR - 0.24 : FX ? zR - 0.3 : zR - 0.24;
    if (FX) {
      // kart seat, low in the frame
      add(body, rbox(0.36, 0.06, 0.34, 0.03), M.black, 0, sY, sZ);
      add(body, rbox(0.38, 0.46, 0.06, 0.03), M.black, 0, sY + 0.24, sZ + 0.21, -0.35, 0, 0);
      for (const sx of [-1, 1]) add(body, rbox(0.04, 0.2, 0.36, 0.02), M.black, sx * 0.19, sY + 0.08, sZ + 0.02);
      // spoiler on struts over the tail
      for (const sx of [-1, 1]) T(V3(sx * 0.2, 0.28, zR + 0.12), V3(sx * 0.2, 0.62, zR + 0.2), 0.012, M.black);
      add(body, rbox(0.62, 0.02, 0.16, 0.008), M.paint, 0, 0.64, zR + 0.22, 0.12, 0, 0);
      add(body, new THREE.PlaneGeometry(0.14, 0.14), M.num, 0, 0.56, zR + 0.301, 0, 0, 0, false);
      add(body, rbox(0.3, 0.16, 0.012, 0.005), M.black, 0, 0.56, zR + 0.294);
      T(V3(0, 0.62, zR + 0.21), V3(0, 0.49, zR + 0.29), 0.01, M.black);
      for (const sx of [-1, 1]) add(body, rbox(0.01, 0.1, 0.18, 0.004), M.black, sx * 0.31, 0.62, zR + 0.22);
    } else {
      // a real mower seat: cushion, high back, the number panel on its back
      add(body, rbox(0.42, 0.08, 0.38, 0.035), M.vinyl, 0, sY + 0.04, sZ);
      const back = add(body, rbox(0.44, 0.38, 0.07, 0.035), M.vinyl, 0, sY + 0.26, sZ + 0.2, -0.22, 0, 0);
      add(back, new THREE.PlaneGeometry(0.2, 0.2), M.num, 0, 0.02, 0.0365, 0, 0, 0, false);
    }
    if (REC) {
      // roll hoop behind the seat
      for (const sx of [-1, 1]) T(V3(sx * 0.26, panY, sZ + 0.36), V3(sx * 0.22, panY + 0.98, sZ + 0.32), 0.022, M.frame);
      T(V3(-0.22, panY + 0.98, sZ + 0.32), V3(0.22, panY + 0.98, sZ + 0.32), 0.022, M.frame);
      for (const sx of [-1, 1]) T(V3(sx * 0.22, panY + 0.95, sZ + 0.33), V3(sx * 0.2, panY + 0.05, sZ + 0.7), 0.016, M.frame);
    }

    // ---------------------------------------------------------------- engine bits that show: filter, pipes
    const eng = new THREE.Group(); model.add(eng);
    const tips = [];
    if (BP) {
      // V-twin under the hood: its pod filter out through a hole in the hood's left side; open pipes down and back
      add(eng, cylX(0.06, 0.06, 0.12, 18), M.black, -0.34, 0.47, -0.86); add(eng, cylX(0.062, 0.062, 0.02, 18), M.red, -0.41, 0.47, -0.86);
      for (const sx of [-1, 1]) {
        const a = V3(sx * 0.25, 0.36, -0.6), b = V3(sx * 0.33, 0.3, -0.45), c = V3(sx * 0.36, 0.26, -0.15), e = V3(sx * 0.37, 0.25, 0.08);
        pipe(eng, [a, b, c, e], 0.022, M.chrome); tips.push(toRoot(e.clone().add(V3(0, 0, 0.02))));
      }
    } else if (FX) {
      // the single: pod filter out the left, a megaphone out the right
      add(eng, cylX(0.055, 0.055, 0.11, 18), M.black, -0.31, 0.36, -0.86); add(eng, cylX(0.057, 0.057, 0.02, 18), M.red, -0.37, 0.36, -0.86);
      const a = V3(0.22, 0.32, -0.62), b = V3(0.32, 0.3, -0.5), c = V3(0.36, 0.3, -0.3);
      pipe(eng, [a, b, c], 0.022, M.chrome);
      const m1 = V3(0.36, 0.3, -0.3), m2 = V3(0.37, 0.32, 0.05);
      const mg = add(eng, new THREE.CylinderGeometry(0.045, 0.024, m2.distanceTo(m1), 16, 1, true), M.chrome, (m1.x + m2.x) / 2, (m1.y + m2.y) / 2, (m1.z + m2.z) / 2);
      mg.quaternion.setFromUnitVectors(V3(0, 1, 0), m2.clone().sub(m1).normalize());
      tips.push(toRoot(m2.clone().add(V3(0, 0, 0.02))));
    } else {
      // superbike four: radiator behind the grille, the block glimpsed under the seat pan, 4-into-1 down the right to a
      // big carbon end can under the fender
      add(eng, rbox(0.46, 0.3, 0.04, 0.01), M.cast, 0, 0.44, -1.18);
      add(eng, rbox(0.42, 0.26, 0.32, 0.04), M.alu, 0, 0.36, -0.05);
      add(eng, rbox(0.36, 0.2, 0.2, 0.03), M.cast, 0, 0.26, 0.2);
      for (let k = 0; k < 4; k++) {
        const x = -0.12 + k * 0.08;
        pipe(eng, [V3(x, 0.38, -0.2), V3(x, 0.26, -0.26), V3(0.15 + k * 0.02, 0.18, -0.12), V3(0.3, 0.2, 0.1)], 0.016, M.chrome);
      }
      const c1 = V3(0.3, 0.2, 0.1), s1 = V3(0.42, 0.34, zTail - 0.06);
      tubeAB(eng, c1, V3(0.36, 0.24, 0.4), 0.03, M.chrome, 14);
      tubeAB(eng, V3(0.36, 0.24, 0.4), s1, 0.055, M.carbon, 18);
      tips.push(toRoot(s1.clone().add(V3(0.005, 0.02, 0.04))));
    }

    // ---------------------------------------------------------------- driver
    const driver = new THREE.Group(); model.add(driver);
    {
      // (lean: + = reclined, the shoulders behind the hips; the kart-style FX seat lies back, the others sit up a
      // little forward over the wheel)
      const hipY = sY + (FX ? 0.08 : 0.1), hipZ = sZ + (FX ? 0.02 : 0.05), lean = FX ? 0.28 : REC ? -0.2 : -0.1;
      add(driver, rbox(0.36, 0.5, 0.24, 0.1), M.suit, 0, hipY + 0.24 * Math.cos(lean), hipZ + 0.24 * Math.sin(lean), lean, 0, 0);
      const shY = hipY + 0.45 * Math.cos(lean), shZ = hipZ + 0.45 * Math.sin(lean);
      const wheelC = BP ? V3(0, 0.9, -0.12) : FX ? V3(0, 0.62, -0.12) : V3(0, 0.88, -0.2);
      for (const sx of [-1, 1]) {
        tubeAB(driver, V3(sx * 0.17, shY, shZ), V3(sx * 0.15, wheelC.y + 0.05, wheelC.z + 0.12), 0.042, M.suit);
        tubeAB(driver, V3(sx * 0.15, wheelC.y + 0.05, wheelC.z + 0.12), V3(sx * 0.13, wheelC.y + 0.02, wheelC.z + 0.02), 0.036, M.suit);
        add(driver, new THREE.SphereGeometry(0.038, 10, 8), M.black, sx * 0.13, wheelC.y + 0.02, wheelC.z + 0.01);
        // legs: knees up, boots on the footrests
        const knee = V3(sx * 0.13, hipY + (FX ? 0.16 : 0.2), hipZ - (FX ? 0.42 : 0.36)), foot = V3(sx * 0.2, fbY + 0.06, FX ? -0.28 : REC ? -0.3 : -0.26);
        tubeAB(driver, V3(sx * 0.1, hipY, hipZ - 0.02), knee, 0.058, M.suit);
        tubeAB(driver, knee, foot, 0.045, M.suit);
        add(driver, rbox(0.09, 0.1, 0.18, 0.03), M.black, foot.x, foot.y - 0.02, foot.z - 0.05);
      }
      const headY = shY + 0.26, headZ = shZ - 0.02;
      tubeAB(driver, V3(0, shY, shZ + 0.02), V3(0, headY - 0.1, headZ), 0.05, M.suit);
      add(driver, new THREE.TorusGeometry(0.075, 0.03, 8, 16), M.black, 0, shY + 0.04, shZ, Math.PI / 2, 0, 0);     // neck brace
      add(driver, new THREE.SphereGeometry(0.14, 24, 16), M.helmet, 0, headY, headZ);
      const vg = new THREE.SphereGeometry(0.143, 24, 12, -Math.PI / 2 - 0.85, 1.7, 1.25, 0.5); add(driver, vg, M.visor, 0, headY, headZ, 0, 0, 0, false);
      // the kill-switch lanyard: wrist to the dash
      pipe(driver, [V3(-0.13, wheelC.y + 0.02, wheelC.z + 0.05), V3(-0.1, wheelC.y - 0.12, wheelC.z + 0.02), V3(-0.09, dashTop + 0.02, dashZ - 0.02)], 0.004, M.red);
      driver.userData.eye = V3(0, headY - 0.02, headZ - 0.08);
    }
    const eye = driver.userData.eye;

    // ---------------------------------------------------------------- steering column, wheel, the little display
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 512; clusterCanvas.height = 256;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace;
    const wc = BP ? V3(0, 0.9, -0.12) : FX ? V3(0, 0.62, -0.12) : V3(0, 0.88, -0.2);
    const colG = new THREE.Group(); colG.position.copy(wc); colG.rotation.x = BP ? -0.75 : FX ? -1.0 : -0.8; model.add(colG);
    tubeAB(model, V3(0, dashTop - 0.02, dashZ + 0.02), wc, 0.016, M.black, 8);
    const steerWheel = new THREE.Group(); colG.add(steerWheel);
    const swR = BP ? 0.17 : 0.15;
    add(steerWheel, new THREE.TorusGeometry(swR, 0.016, 10, 30), M.black, 0, 0, 0);
    for (let k = 0; k < 3; k++) { const sp = add(steerWheel, new THREE.BoxGeometry(0.016, swR, 0.008), M.alu, 0, 0, 0.004); sp.rotation.z = k * 2.094 + Math.PI; sp.geometry.translate(0, swR / 2, 0); }
    add(steerWheel, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.black, 0, 0, 0.01, Math.PI / 2, 0, 0);
    // (a small data display on the dash tower's face, towards the driver)
    add(body, new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, dashTop - 0.1, dashZ + 0.071, 0, 0, 0, false);

    // ---------------------------------------------------------------- wheels
    // (turf tyres: a rounded carcass with a fine raised tread; kart dirt tyres: small staggered blocks; slicks: plain.
    // The off-road package's bar lugs: chevron bars across the crown - setTires shows one or the other)
    function carcass(R, W, rim) {
      const h = W / 2, c = R - 0.006;
      return latheX([[rim, -h + 0.01], [rim + 0.02, -h], [R * 0.72, -h + 0.002], [c - 0.025, -h + 0.008], [c - 0.006, -h + 0.028], [c, -h + 0.05],
        [c, h - 0.05], [c - 0.006, h - 0.028], [c - 0.025, h - 0.008], [R * 0.72, h - 0.002], [rim + 0.02, h], [rim, h - 0.01]], 44);
    }
    function tread(R, W, kind, dir) {
      const list = [], h = W / 2, c = R - 0.006;
      if (kind === 'slick') return null;
      if (kind === 'bar') {
        const N = Math.round(2 * Math.PI * c / 0.07);
        for (let k = 0; k < N; k++) {
          for (const side of [-1, 1]) {
            const b = new THREE.BoxGeometry(h * 0.95, 0.02, 0.028); b.rotateY(-side * dir * 0.5); b.translate(side * h * 0.45, c + 0.008, 0);
            b.rotateX(k * 2 * Math.PI / N + (side > 0 ? Math.PI / N : 0)); list.push(b);
          }
        }
      } else {
        const turf = kind === 'turf', N = Math.round(2 * Math.PI * c / (turf ? 0.03 : 0.034));
        for (let k = 0; k < N; k++) {
          const cols = k & 1 ? [-0.55, 0, 0.55] : [-0.8, -0.27, 0.27, 0.8];
          for (const f of cols) { const b = new THREE.BoxGeometry(W * (turf ? 0.16 : 0.18), turf ? 0.005 : 0.012, turf ? 0.016 : 0.02); b.translate(f * h * 0.95, c + (turf ? 0.002 : 0.005), 0); b.rotateX(k * 2 * Math.PI / N); list.push(b); }
        }
      }
      return mergeGeos(list);
    }
    const stockKind = BP ? 'turf' : FX ? 'dirt' : 'slick';
    function rim(g, R, W, rimR) {
      const barrel = new THREE.CylinderGeometry(rimR, rimR, W * 0.92, 28, 1, true); barrel.rotateZ(Math.PI / 2); add(g, barrel, M.rim, 0, 0, 0);
      const face = cylX(rimR, rimR, 0.01, 28); add(g, face, M.rim, W * 0.28, 0, 0);
      if (REC) for (let k = 0; k < 6; k++) { const s = add(g, new THREE.BoxGeometry(0.012, rimR * 1.6, 0.03), M.rim, W * 0.3, 0, 0); s.rotation.x = k * Math.PI / 3; }
      add(g, cylX(0.028, 0.034, 0.05, 14), BP ? M.rim : M.alu, W * 0.3 + 0.02, 0, 0);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, n = cylX(0.007, 0.007, 0.02, 6); add(g, n, M.chrome, W * 0.3 + 0.012, Math.cos(a) * rimR * 0.5, Math.sin(a) * rimR * 0.5, 0, 0, 0, false); }
    }
    const geo = {};
    for (const front of [true, false]) {
      const R = front ? RF : RR, W = front ? WF : WR, rimR = BP ? (front ? 0.078 : 0.103) : FX ? (front ? 0.066 : 0.078) : 0.13;
      geo[front] = { R, W, rimR, carc: carcass(R, W, rimR), trR: tread(R, W, stockKind, 1), trL: tread(R, W, stockKind, -1), barR: tread(R + 0.008, W, 'bar', 1), barL: tread(R + 0.008, W, 'bar', -1) };
    }
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1, G = geo[frontW];
      const corner = new THREE.Group();
      corner.position.set(side * (frontW ? trackF : trackR) / 2, (frontW ? RF : RR) - cgH, (frontW ? -cgToFront : cgToRear));
      rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      const spin = new THREE.Group(); flip.add(spin);
      add(spin, G.carc, M.rubber, 0, 0, 0);
      const stock = G.trR ? [add(spin, left ? G.trL : G.trR, M.rubber, 0, 0, 0)] : [];
      const pkg = [add(spin, left ? G.barL : G.barR, M.rubber, 0, 0, 0)]; pkg[0].visible = false;
      rim(spin, G.R, G.W, G.rimR);
      if (frontW) {
        // spindle and kingpin (steer with the wheel, don't spin); discs on the FX and the record mower
        add(flip, cylX(0.014, 0.014, 0.1, 8), M.chrome, -G.W / 2 - 0.04, 0, 0);
        add(flip, new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8), M.frame, -G.W / 2 - 0.08, 0.01, 0);
        if (!BP) { add(flip, cylX(G.rimR * 0.8, G.rimR * 0.8, 0.005, 24), M.cast, -G.W / 2 + 0.02, 0, 0); add(flip, rbox(0.03, 0.05, 0.06, 0.008), M.red, -G.W / 2 + 0.02, G.rimR * 0.7, 0); }
      }
      wheels.push({ corner, flip, spin, left, front: frontW, side, stock, pkg });
    }
    // rear axle (solid) with its brake discs and the drive sprocket / transaxle
    add(chassis, cylX(0.022, 0.022, trackR - WR, 16), M.alu, 0, RR, zR);
    if (BP) add(chassis, rbox(0.3, 0.18, 0.2, 0.03), M.cast, 0.02, RR + 0.02, zR - 0.04);
    else add(chassis, cylX(0.08, 0.08, 0.006, 28), M.cast, 0.12, RR, zR);
    for (const sx of [-1, 1]) add(chassis, cylX(BP ? 0.07 : 0.08, BP ? 0.07 : 0.08, 0.006, 24), M.cast, sx * (trackR / 2 - WR / 2 - 0.04), RR, zR);
    // tie rods (static)
    for (const sx of [-1, 1]) tubeAB(model, V3(0, RF + 0.02, zF + 0.06), V3(sx * (trackF / 2 - WF / 2 - 0.08), RF + 0.02, zF + 0.05), 0.008, M.chrome, 6);

    // ---------------------------------------------------------------- the display
    const cgx = clusterCanvas.getContext('2d');
    function drawCluster(t) {
      const g = cgx, w = 512, h = 256;
      g.fillStyle = '#0a0c0e'; g.fillRect(0, 0, w, h);
      const r = clamp(t.rpm / (t.redline || 7000), 0, 1.1);
      for (let k = 0; k < 10; k++) { g.fillStyle = r > 0.55 + k * 0.045 ? (k < 5 ? '#29ff5a' : k < 8 ? '#ffd21a' : '#ff2a1a') : '#1b1f22'; g.fillRect(16 + k * 48, 12, 40, 22); }
      g.fillStyle = '#e8f0f4'; g.font = 'bold 110px "Courier New", monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(String(Math.round(t.rpm)).padStart(5, ' '), 12, 120);
      g.font = 'bold 44px Arial'; g.fillStyle = '#8fb2c6'; g.fillText('RPM', 400, 96);
      g.fillStyle = '#ffffff'; g.font = 'bold 80px Arial'; g.textAlign = 'right'; g.fillText(t.gear.replace(/^[DM]/, '') || 'D', 500, 150);
      g.textAlign = 'left'; g.font = 'bold 50px Arial'; g.fillStyle = '#e8f0f4'; g.fillText(Math.round(t.speedMph) + ' MPH', 16, 212);
      g.fillStyle = '#8fb2c6'; g.font = '30px Arial'; g.fillText(Math.round(t.water) + '°F', 320, 212);
      clusterTex.needsUpdate = true;
    }
    function drawScreen() {}
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.paint.color.setHex(c); }
    function setLights() {}
    function setInteriorVisible(v, cockpit) { driver.visible = !cockpit; }
    function setTransmission() {}
    function setTires(front, rear) {
      for (const w of wheels) {
        const on = /^mowerBar/.test(w.front ? front : rear);
        for (const m of w.stock) m.visible = !on; for (const m of w.pkg) m.visible = on;
      }
    }
    function setChute() {}

    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel, eye: toRoot(eye),
      exhaustTips: tips, materials: M, headlights: [], tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, variant: 'mower', cls: CLS,
    };
  }

  root.HCMower = { build };
})(typeof self !== 'undefined' ? self : this);
