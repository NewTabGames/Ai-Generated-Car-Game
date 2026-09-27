/* Hellcat Drive — procedural go-karts.
   Rental: a steel frame inside a full wraparound rubber bumper, a boxy 4-stroke single (fuel tank on top, pull
   starter), a big plastic seat. TaG 125: a race chassis with nose cone, front fairing and number panel, sidepods and rear
   bumper, a water-cooled 125 cc 2-stroke beside the seat with its expansion chamber curling back, radiator on the left.
   KZ shifter: the same with a bigger engine and gearbox, a gear lever by the wheel and front brakes. 5 in wheels,
   solid rear axle with the sprocket, chain and brake disc, the driver sitting up in the seat.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const CLS = opts.cls === 'rental' ? 'rental' : opts.cls === 'kz' ? 'kz' : 'tag';
    const RENT = CLS === 'rental', KZ = CLS === 'kz';
    const cgH = opts.cgHeight || 0.3, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 0.6, cgToRear = opts.cgToRear || 0.44;
    const L = cgToFront + cgToRear, zF = -L / 2, zR = L / 2;
    const RR = 0.14, RF = 0.127, WR = 0.18, WF = 0.115;
    const trackF = opts.trackF || 1.12, trackR = opts.trackR || 1.38;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || { 'B5 Blue': 0x1e6fc4 };
    const NUM = RENT ? '42' : KZ ? '1' : '23';
    const rootG = new THREE.Group(); rootG.name = 'kart';
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
    const pipe = (parent, pts, r, mat, closed) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, !!closed), pts.length * 10, r, 12, !!closed), mat, 0, 0, 0);
    const cylX = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateZ(Math.PI / 2); return g; };
    function latheX(pts, seg) { const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg || 40); g.rotateZ(-Math.PI / 2); return g; }
    // a smooth plastic panel: a rounded outline in (x, y) extruded d thick
    function panel(pts, d, bevel) {
      const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: bevel || 0.012, bevelSize: bevel || 0.012, bevelSegments: 3, curveSegments: 6 });
      g.translate(0, 0, -d / 2); return g;
    }

    // ---------------------------------------------------------------- materials
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] || 0x1e6fc4, metalness: 0.05, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    M.frame = new THREE.MeshStandardMaterial({ color: RENT ? 0xf2c200 : KZ ? 0x303236 : 0xd9dbde, roughness: RENT ? 0.45 : 0.18, metalness: RENT ? 0.2 : 0.9 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.6, metalness: 0.1 });
    M.plastic = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55, metalness: 0.05 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    M.bumper = new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.75 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xb4b8be, roughness: 0.35, metalness: 0.85 });
    M.mag = new THREE.MeshStandardMaterial({ color: RENT ? 0x9ca0a6 : 0xd7d9dc, roughness: 0.3, metalness: 0.8 });
    M.cast = new THREE.MeshStandardMaterial({ color: 0x5f6268, roughness: 0.5, metalness: 0.7 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.08, metalness: 1 });
    M.pipe = new THREE.MeshStandardMaterial({ color: 0x7c7266, roughness: 0.45, metalness: 0.8 });
    M.red = new THREE.MeshStandardMaterial({ color: 0xc81a1a, roughness: 0.4, metalness: 0.3 });
    M.engRed = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.45, metalness: 0.3 });
    M.tank = new THREE.MeshPhysicalMaterial({ color: 0x8fb7cf, roughness: 0.2, transparent: true, opacity: 0.75, depthWrite: false });
    M.suit = new THREE.MeshStandardMaterial({ color: RENT ? 0x2a3440 : 0x1b1d22, roughness: 0.8 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: RENT ? 0x202020 : 0xf2f2f2, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.rad = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.6 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x3a0306, emissive: 0xff1010, emissiveIntensity: 0.3, roughness: 0.3 });
    const numTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = RENT ? '#f2c200' : '#f4f4f0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111'; g.font = '900 170px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(NUM, w / 2, h / 2 + 8);
    });
    M.num = new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });

    // ---------------------------------------------------------------- chassis (30 mm tube)
    const chassis = new THREE.Group(); model.add(chassis);
    const T = (a, b, r) => tubeAB(chassis, a, b, r || 0.015, M.frame, 10);
    const y0 = 0.05, zNose = -0.98, zTail = zR + 0.22;
    for (const sx of [-1, 1]) {
      // main rails: narrow at the front axle, out round the seat, back to the rear axle bearings
      T(V3(sx * 0.2, y0, zNose + 0.12), V3(sx * 0.27, y0, zF - 0.02)); T(V3(sx * 0.27, y0, zF - 0.02), V3(sx * 0.33, y0, -0.1));
      T(V3(sx * 0.33, y0, -0.1), V3(sx * 0.36, y0, zR - 0.02)); T(V3(sx * 0.36, y0, zR - 0.02), V3(sx * 0.28, y0 + 0.02, zTail - 0.05));
      // front stub axles' mounts (C-brackets) and the nerf bar tubes out to the sidepods
      T(V3(sx * 0.27, y0, zF), V3(sx * (trackF / 2 - 0.1), RF - 0.01, zF), 0.017);
      T(V3(sx * 0.33, y0, -0.35), V3(sx * 0.62, y0 + 0.03, -0.3)); T(V3(sx * 0.62, y0 + 0.03, -0.3), V3(sx * 0.62, y0 + 0.03, 0.25));
      T(V3(sx * 0.62, y0 + 0.03, 0.25), V3(sx * 0.36, y0, 0.3));
      // seat stays up to the seat's upper edge
      T(V3(sx * 0.33, y0, 0.3), V3(sx * 0.16, 0.36, 0.38), 0.011);
    }
    for (const z of [zNose + 0.12, zF - 0.02, -0.1, zR - 0.02]) { const hw = z < zF ? 0.2 : z < -0.05 ? 0.3 : 0.35; T(V3(-hw, y0, z), V3(hw, y0, z), 0.013); }
    // floor tray under the driver's legs
    add(chassis, rbox(0.52, 0.01, 0.72, 0.004), M.plastic, 0, y0 - 0.012, -0.55);
    // rear axle (50 mm) with the bearings, brake disc and caliper, and the sprocket on the engine side
    add(chassis, cylX(0.025, 0.025, trackR - 0.12, 16), M.alu, 0, RR, zR);
    for (const sx of [-1, 1]) add(chassis, rbox(0.06, 0.09, 0.07, 0.01), M.cast, sx * 0.36, RR, zR);
    add(chassis, cylX(0.095, 0.095, 0.008, 28), M.alu, -0.2, RR, zR); add(chassis, rbox(0.04, 0.07, 0.08, 0.01), M.red, -0.2, RR + 0.08, zR);
    add(chassis, cylX(0.075, 0.075, 0.006, 28), M.cast, 0.26, RR, zR);

    // ---------------------------------------------------------------- bodywork
    const body = new THREE.Group(); model.add(body);
    if (RENT) {
      // full wraparound bumper: a fat rubber ring round the whole kart, on stays from the frame
      const ring = [], hx = 0.83, zb0 = -1.04, zb1 = zTail + 0.12, rc = 0.2;
      const corner = (cx, cz, a0) => { for (let k = 0; k <= 5; k++) { const a = a0 + k * Math.PI / 10; ring.push(V3(cx + Math.cos(a) * rc, 0.16, cz + Math.sin(a) * rc)); } };
      corner(hx - rc, zb1 - rc, 0); corner(-hx + rc, zb1 - rc, Math.PI / 2); corner(-hx + rc, zb0 + rc, Math.PI); corner(hx - rc, zb0 + rc, 1.5 * Math.PI);
      pipe(body, ring, 0.075, M.bumper, true);
      for (const [x, z] of [[0.6, zb0 + 0.1], [-0.6, zb0 + 0.1], [0.78, -0.1], [-0.78, -0.1], [0.6, zb1 - 0.08], [-0.6, zb1 - 0.08]]) T(V3(Math.sign(x) * 0.3, y0 + 0.02, z * 0.8), V3(x, 0.16, z), 0.014);
      // seat: a big moulded plastic bucket
      add(body, rbox(0.46, 0.08, 0.44, 0.04), M.plastic, -0.02, 0.1, 0.2);
      add(body, rbox(0.46, 0.5, 0.08, 0.04), M.plastic, -0.02, 0.36, 0.44, -0.3, 0, 0);
      for (const sx of [-1, 1]) add(body, rbox(0.06, 0.24, 0.44, 0.03), M.plastic, sx * 0.23 - 0.02, 0.2, 0.22);
      // front panel with the number
      add(body, rbox(0.42, 0.34, 0.04, 0.03), M.paint, 0, 0.26, -0.62, 0.25, 0, 0);
      add(body, new THREE.PlaneGeometry(0.2, 0.2), M.num, 0, 0.26 + 0.247 * 0.036, -0.62 - 0.969 * 0.036, 0.25, Math.PI, 0, false);
    } else {
      // nose cone: a rounded bumper fairing across the front
      // (its front silhouette, extruded fore and aft with rounded edges)
      add(body, panel([[-0.5, 0.0], [0.5, 0.0], [0.56, 0.08], [0.48, 0.17], [0.22, 0.22], [-0.22, 0.22], [-0.48, 0.17], [-0.56, 0.08]], 0.18, 0.03), M.paint, 0, 0.05, -0.91);
      add(body, rbox(0.96, 0.04, 0.2, 0.015), M.plastic, 0, 0.05, -0.91);
      // front fairing between the legs and the nose, number panel on it
      // (leaning back towards the driver; the number faces forward on it)
      add(body, rbox(0.36, 0.3, 0.04, 0.03), M.paint, 0, 0.24, -0.66, 0.35, 0, 0);
      add(body, new THREE.PlaneGeometry(0.2, 0.2), M.num, 0, 0.24 + 0.343 * 0.036, -0.66 - 0.94 * 0.036, 0.35, Math.PI, 0, false);
      // sidepods
      for (const sx of [-1, 1]) {
        const pod = add(body, rbox(0.26, 0.16, 0.74, 0.05), M.paint, sx * 0.56, 0.13, -0.03);
        pod.rotation.y = sx * 0.04;
        add(body, rbox(0.2, 0.02, 0.6, 0.01), M.plastic, sx * 0.56, 0.215, -0.03);
      }
      // rear bumper: a moulded plastic bar across the back
      add(body, rbox(1.46, 0.16, 0.12, 0.05), M.plastic, 0, 0.15, zTail + 0.08);
      for (const sx of [-1, 1]) T(V3(sx * 0.28, y0 + 0.02, zTail - 0.05), V3(sx * 0.5, 0.13, zTail + 0.06), 0.013);
      // race seat: a narrow fiberglass shell
      add(body, rbox(0.36, 0.06, 0.34, 0.03), M.black, -0.03, 0.08, 0.18);
      add(body, rbox(0.38, 0.46, 0.06, 0.03), M.black, -0.03, 0.32, 0.4, -0.35, 0, 0);
      for (const sx of [-1, 1]) add(body, rbox(0.04, 0.2, 0.36, 0.02), M.black, sx * 0.19 - 0.03, 0.16, 0.2);
      // fuel tank between the legs
      add(body, rbox(0.16, 0.12, 0.2, 0.05), M.tank, 0, 0.11, -0.38, 0, 0, 0, false);
    }

    // ---------------------------------------------------------------- engine beside the seat (right), chain to the axle
    const eng = new THREE.Group(); model.add(eng);
    const ex = 0.37, ez = 0.18;
    const tips = [];
    if (RENT) {
      // 4-stroke single: crankcase, slanted cylinder with fins under a shroud, fuel tank on top, pull starter, muffler
      add(eng, rbox(0.28, 0.2, 0.3, 0.03), M.engRed, ex, 0.2, ez);
      add(eng, rbox(0.24, 0.18, 0.2, 0.03), M.black, ex + 0.02, 0.36, ez - 0.02, 0, 0, -0.35);
      add(eng, rbox(0.26, 0.1, 0.3, 0.04), M.engRed, ex - 0.01, 0.5, ez);
      add(eng, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), M.black, ex - 0.01, 0.57, ez + 0.05);
      const st = add(eng, cylX(0.1, 0.1, 0.04, 24), M.black, ex + 0.16, 0.26, ez); st.castShadow = true;
      add(eng, rbox(0.12, 0.12, 0.26, 0.04), M.cast, ex + 0.08, 0.2, ez + 0.28);
      const mf = V3(ex + 0.08, 0.2, ez + 0.42); tips.push(toRoot(mf));
    } else {
      // 2-stroke single: crankcase (and the 6-speed box for the KZ), finned-looking head, carb + airbox, water pump
      add(eng, rbox(KZ ? 0.24 : 0.2, 0.18, KZ ? 0.3 : 0.22, 0.03), M.cast, ex, 0.17, ez);
      const cyl = add(eng, rbox(0.14, 0.16, 0.14, 0.03), M.alu, ex, 0.32, ez - 0.03); cyl.rotation.x = -0.35;
      add(eng, rbox(0.15, 0.05, 0.15, 0.02), M.cast, ex, 0.41, ez - 0.07, -0.35, 0, 0);
      add(eng, new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), M.black, ex, 0.46, ez - 0.08);                 // plug cap
      add(eng, cylX(0.035, 0.035, 0.08, 16), M.cast, ex - 0.12, 0.28, ez);                                     // carb
      add(eng, rbox(0.14, 0.14, 0.2, 0.05), M.black, ex - 0.12, 0.34, ez + 0.2);                             // airbox (behind the seat)
      tubeAB(eng, V3(ex - 0.12, 0.28, ez), V3(ex - 0.12, 0.32, ez + 0.12), 0.03, M.black);
      if (KZ) { add(eng, cylX(0.07, 0.07, 0.04, 20), M.alu, ex + 0.13, 0.18, ez + 0.05); tubeAB(eng, V3(0.16, 0.2, -0.42), V3(0.2, 0.42, -0.4), 0.008, M.alu); add(eng, new THREE.SphereGeometry(0.02, 10, 8), M.black, 0.2, 0.43, -0.4); }
      // expansion chamber: out of the cylinder, down and swelling, back along the right side to the silencer
      const e0 = V3(ex + 0.02, 0.3, ez - 0.14), segs = [[e0, 0.022], [V3(ex + 0.1, 0.18, ez - 0.22), 0.028], [V3(ex + 0.2, 0.12, ez - 0.12), 0.045],
        [V3(ex + 0.25, 0.13, ez + 0.08), 0.058], [V3(ex + 0.26, 0.15, ez + 0.26), 0.05], [V3(ex + 0.24, 0.17, ez + 0.42), 0.028]];
      for (let i = 0; i < segs.length - 1; i++) { const [a, ra] = segs[i], [b, rb] = segs[i + 1]; const m = tubeAB(eng, a, b, (ra + rb) / 2, M.pipe, 14); m.geometry = new THREE.CylinderGeometry(rb, ra, a.distanceTo(b), 14); }
      const sil0 = V3(ex + 0.24, 0.17, ez + 0.42), sil1 = V3(ex + 0.2, 0.22, zTail + 0.02);
      tubeAB(eng, sil0, sil1, 0.042, M.alu, 16);
      tips.push(toRoot(sil1.clone().add(V3(0, 0, 0.03))));
      // radiator on the left of the seat, hoses across
      add(eng, rbox(0.04, 0.28, KZ ? 0.34 : 0.28, 0.01), M.rad, -0.4, 0.28, 0.08);
      tubeAB(eng, V3(-0.38, 0.22, 0.2), V3(ex - 0.08, 0.2, ez + 0.02), 0.012, M.black);
    }
    // chain from the engine sprocket back to the axle sprocket
    const csy = RENT ? 0.2 : 0.16;
    tubeAB(eng, V3(0.26, csy + 0.03, ez + 0.02), V3(0.26, RR + 0.072, zR), 0.006, M.black, 6);
    tubeAB(eng, V3(0.26, csy - 0.03, ez + 0.02), V3(0.26, RR - 0.072, zR), 0.006, M.black, 6);
    add(eng, cylX(0.03, 0.03, 0.012, 16), M.cast, 0.26, csy, ez + 0.02);

    // ---------------------------------------------------------------- driver
    const driver = new THREE.Group(); model.add(driver);
    const sY = 0.12, sZ = 0.26;
    add(driver, rbox(0.36, 0.48, 0.24, 0.1), M.suit, -0.03, sY + 0.3, sZ + 0.02, -0.3, 0, 0);
    for (const sx of [-1, 1]) {
      tubeAB(driver, V3(sx * 0.16 - 0.03, sY + 0.46, sZ - 0.02), V3(sx * 0.14, sY + 0.34, sZ - 0.38), 0.042, M.suit);
      add(driver, new THREE.SphereGeometry(0.038, 10, 8), M.black, sx * 0.14, sY + 0.36, sZ - 0.42);
      tubeAB(driver, V3(sx * 0.1 - 0.03, sY + 0.08, sZ - 0.05), V3(sx * 0.12, sY + 0.16, sZ - 0.5), 0.058, M.suit);
      tubeAB(driver, V3(sx * 0.12, sY + 0.16, sZ - 0.5), V3(sx * 0.1, sY + 0.02, sZ - 0.95), 0.045, M.suit);
      add(driver, rbox(0.08, 0.1, 0.16, 0.03), M.black, sx * 0.1, sY - 0.01, sZ - 0.98);
    }
    tubeAB(driver, V3(-0.03, sY + 0.52, sZ + 0.06), V3(-0.03, sY + 0.64, sZ - 0.02), 0.05, M.suit);                  // neck
    add(driver, new THREE.SphereGeometry(0.14, 24, 16), M.helmet, -0.03, sY + 0.72, sZ - 0.04);
    { const vg = new THREE.SphereGeometry(0.143, 24, 12, -Math.PI / 2 - 0.85, 1.7, 1.25, 0.5); add(driver, vg, M.visor, -0.03, sY + 0.72, sZ - 0.04, 0, 0, 0, false); }
    if (!RENT) add(driver, new THREE.BoxGeometry(0.014, 0.05, 0.17), M.paint, -0.03, sY + 0.855, sZ - 0.04, 0, 0, 0, false);
    const eye = V3(-0.03, sY + 0.69, sZ - 0.1);

    // ---------------------------------------------------------------- steering wheel with a data display
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 512; clusterCanvas.height = 256;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace;
    const colG = new THREE.Group(); colG.position.set(0, sY + 0.41, sZ - 0.47); colG.rotation.x = -0.95; model.add(colG);
    tubeAB(model, V3(0, 0.07, -0.78), V3(0, sY + 0.36, sZ - 0.47), 0.012, M.frame, 8);
    const steerWheel = new THREE.Group(); colG.add(steerWheel);
    add(steerWheel, new THREE.TorusGeometry(0.15, 0.016, 10, 30), M.black, 0, 0, 0);
    for (let k = 0; k < 3; k++) { const sp = add(steerWheel, new THREE.BoxGeometry(0.016, 0.15, 0.008), M.alu, 0, 0, 0.004); sp.rotation.z = k * 2.094 + Math.PI; sp.geometry.translate(0, 0.075, 0); }
    add(steerWheel, rbox(0.14, 0.07, 0.02, 0.008), M.black, 0, 0.03, 0.012);
    add(steerWheel, new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0.03, 0.0235, 0, 0, 0, false);

    // ---------------------------------------------------------------- wheels
    const tyreR = latheX([[0.068, -0.09], [0.085, -0.094], [0.11, -0.092], [0.13, -0.08], [RR, -0.06], [RR, 0.06], [0.13, 0.08], [0.11, 0.092], [0.085, 0.094], [0.068, 0.09]], 36);
    const tyreF = latheX([[0.066, -0.057], [0.085, -0.06], [0.108, -0.056], [RF - 0.006, -0.042], [RF, -0.03], [RF, 0.03], [RF - 0.006, 0.042], [0.108, 0.056], [0.085, 0.06], [0.066, 0.057]], 36);
    // off-road package: knobby tyres on 6 in rims (12x5.00-6 front, 13x6.50-6 rear) - a rounded carcass under staggered
    // rows of square knobs
    function mergeGeos(list) {
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.computeBoundingSphere(); return out;
    }
    function knobby(R, W) {
      const c = R - 0.013, h = W / 2;
      const carcass = latheX([[0.068, -h + 0.014], [0.09, -h], [0.12, -h + 0.001], [c - 0.022, -h + 0.006], [c - 0.006, -h + 0.02], [c, -h + 0.04],
        [c, h - 0.04], [c - 0.006, h - 0.02], [c - 0.022, h - 0.006], [0.12, h - 0.001], [0.09, h], [0.068, h - 0.014]], 40);
      const list = [], N = Math.round(2 * Math.PI * c / 0.036);
      for (let k = 0; k < N; k++) {
        const phi = k * 2 * Math.PI / N, odd = k & 1;
        for (const f of odd ? [-0.36, 0.36] : [-0.74, 0, 0.74]) {
          const b = new THREE.BoxGeometry(W * 0.2, 0.016, 0.022); b.translate(f * h, c + 0.005, 0); b.rotateX(phi); list.push(b);
        }
        // shoulder knobs, stepping down the sidewall
        if (odd) for (const sd of [-1, 1]) { const b = new THREE.BoxGeometry(0.016, 0.02, 0.02); b.translate(sd * (h - 0.004), c - 0.018, 0); b.rotateX(phi); list.push(b); }
      }
      return [carcass, mergeGeos(list)];
    }
    const knobF = knobby(0.152, 0.127), knobR = knobby(0.165, 0.165);
    function rim(g, w) {
      const barrel = new THREE.CylinderGeometry(0.066, 0.066, w * 0.95, 28, 1, true); barrel.rotateZ(Math.PI / 2); add(g, barrel, M.mag, 0, 0, 0);
      const face = new THREE.CylinderGeometry(0.066, 0.066, 0.008, 28); face.rotateZ(Math.PI / 2); add(g, face, M.mag, w * 0.3, 0, 0);
      for (let k = 0; k < 3; k++) { const a = k * 2.094; const n = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6); n.rotateZ(Math.PI / 2); add(g, n, M.chrome, w * 0.3 + 0.01, Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0, 0, 0, false); }
      add(g, cylX(0.018, 0.022, 0.03, 12), M.alu, w * 0.3 + 0.01, 0, 0);
    }
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group();
      corner.position.set(side * (frontW ? trackF : trackR) / 2, (frontW ? RF : RR) - cgH, (frontW ? -cgToFront : cgToRear));
      rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      const spin = new THREE.Group(); flip.add(spin);
      // (the slick, and the package's knobby: setTires shows one)
      const stock = add(spin, frontW ? tyreF : tyreR, M.rubber, 0, 0, 0);
      const knob = (frontW ? knobF : knobR).map((g) => { const m = add(spin, g, M.rubber, 0, 0, 0); m.visible = false; return m; });
      if (frontW) {
        rim(spin, WF);
        // spindle and kingpin (steers, doesn't spin), a brake disc on the KZ
        add(flip, cylX(0.012, 0.012, 0.12, 8), M.chrome, -0.07, 0, 0);
        add(flip, new THREE.CylinderGeometry(0.014, 0.014, 0.11, 8), M.frame, -0.13, 0.01, 0);
        if (KZ) { add(flip, cylX(0.075, 0.075, 0.005, 24), M.cast, -0.06, 0, 0); add(flip, rbox(0.03, 0.05, 0.06, 0.008), M.red, -0.06, 0.06, 0); }
      } else rim(spin, WR);
      wheels.push({ corner, flip, spin, left, front: frontW, side, stock, knob });
    }
    // tie rods from the column to the spindles (static - a little artistic licence)
    for (const sx of [-1, 1]) tubeAB(model, V3(0, 0.1, -0.74), V3(sx * (trackF / 2 - 0.16), 0.11, zF + 0.05), 0.007, M.chrome, 6);

    // ---------------------------------------------------------------- lights (rental: a strip light; none on race karts)
    const headlights = [];
    if (RENT) { const tl = add(body, rbox(0.2, 0.05, 0.02, 0.01), M.tail, 0, 0.18, zTail + 0.12); tl.castShadow = false; }

    // ---------------------------------------------------------------- the data display on the wheel
    const cgx = clusterCanvas.getContext('2d');
    function drawCluster(t) {
      const g = cgx, w = 512, h = 256;
      g.fillStyle = '#0a0c0e'; g.fillRect(0, 0, w, h);
      // shift lights across the top
      const r = clamp(t.rpm / (t.redline || 14000), 0, 1.1);
      for (let k = 0; k < 10; k++) { g.fillStyle = r > 0.6 + k * 0.04 ? (k < 5 ? '#29ff5a' : k < 8 ? '#ffd21a' : '#ff2a1a') : '#1b1f22'; g.fillRect(16 + k * 48, 12, 40, 22); }
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
    function setLights(o) { M.tail.emissiveIntensity = o.brake ? 4 : (o.night ? 1 : 0.3); }
    function setInteriorVisible(v, cockpit) { driver.visible = !cockpit; }
    function setTransmission() {}
    function setTires(front, rear) {
      for (const w of wheels) {
        const kn = /^kartKnob/.test(w.front ? front : rear);
        w.stock.visible = !kn; for (const m of w.knob) m.visible = kn;
      }
    }
    function setChute() {}

    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel, eye: toRoot(eye),
      exhaustTips: tips, materials: M, headlights, tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, variant: 'kart', cls: CLS,
    };
  }

  root.HCKart = { build };
})(typeof self !== 'undefined' ? self : this);
