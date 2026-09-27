/* Hellcat Drive — procedural modified pulling tractor (European "Modified 3.6 t" class).
   Two engine packages: four blown methanol HEMIs (two tandem pairs side by side, roots blowers, 4-stack injector hats,
   zoomie headers) or two supercharged Allison V-1710 V12s side by side (long polished intake pipes over the top,
   ejector exhaust stubs). 30.5L-32 cut pulling tyres, open roll cage over the rear axle, weight bar with skid pads.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const engine = opts.engine === 'v12' ? 'v12' : 'hemi4';
    const cgH = opts.cgHeight || 0.95, zOff = opts.zOff || 0;
    const L = (opts.cgToFront || 3.408) + (opts.cgToRear || 1.392);
    const zF = -L / 2, zR = L / 2;                    // axle stations (model space)
    const RR = 0.87, RF = 0.37;                       // tyre radii
    const trackF = opts.trackF || 1.42, trackR = opts.trackR || 1.76;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || { 'B5 Blue': 0x1e6fc4 };
    const rootG = new THREE.Group(); rootG.name = 'puller';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

    // ---------------------------------------------------------------- materials
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] || 0x1e6fc4, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
    M.accent = new THREE.MeshPhysicalMaterial({ color: 0xb8d62a, metalness: 0.2, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.08 });
    M.gloss = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.22, metalness: 0.4 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.6, metalness: 0.2 });
    M.polish = new THREE.MeshStandardMaterial({ color: 0xe4e6ea, roughness: 0.1, metalness: 1 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.06, metalness: 1 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xaeb2b8, roughness: 0.42, metalness: 0.85 });
    M.cast = new THREE.MeshStandardMaterial({ color: 0x8e9197, roughness: 0.6, metalness: 0.7 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.5, metalness: 0.6 });
    M.weight = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.5 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 });
    M.redA = new THREE.MeshStandardMaterial({ color: 0xc81a1a, roughness: 0.28, metalness: 0.75 });
    M.blueA = new THREE.MeshStandardMaterial({ color: 0x1b58d6, roughness: 0.28, metalness: 0.75 });
    M.hoseB = new THREE.MeshStandardMaterial({ color: 0x1540b8, roughness: 0.55, metalness: 0.1 });
    M.hoseR = new THREE.MeshStandardMaterial({ color: 0xb01414, roughness: 0.55, metalness: 0.1 });
    M.belt = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    M.suit = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.led = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xf4f8ff, emissiveIntensity: 0, roughness: 0.15, metalness: 0.5 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x3a0306, emissive: 0xff1010, emissiveIntensity: 0.4, roughness: 0.25 });
    M.hole = new THREE.MeshBasicMaterial({ color: 0x050505 });
    // burnt titanium / stainless headers: straw -> blue -> brown heat colours from the port outwards (uv.x runs along a tube)
    const headerTex = canvasTex(256, 16, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#6b5a3a'); gr.addColorStop(0.12, '#c9a24a'); gr.addColorStop(0.3, '#6a4a8a'); gr.addColorStop(0.45, '#2f4f9a');
      gr.addColorStop(0.62, '#8a8f99'); gr.addColorStop(1, '#b9bcc2');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    M.header = new THREE.MeshStandardMaterial({ map: headerTex, roughness: 0.28, metalness: 0.9 });

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
    // rounded box (w x h x d, corner radius r)
    function rbox(w, h, d, r) {
      r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
      const s = new THREE.Shape(), x0 = -w / 2 + r, y0 = -h / 2 + r, x1 = w / 2 - r, y1 = h / 2 - r;
      s.moveTo(x0, -h / 2 + r); s.lineTo(x0, y1); s.lineTo(x1, y1); s.lineTo(x1, y0); s.lineTo(x0, y0);
      const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
      g.translate(0, 0, -(d - 2 * r) / 2); return g;
    }
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 12), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    const pipe = (parent, pts, r, mat, seg) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg || 24, r, 10, false), mat, 0, 0, 0);
    function mergeGeos(list) {
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.computeBoundingSphere(); return out;
    }
    // a lathe around the X axis from (radius, x) pairs
    function latheX(pr, seg) {
      const g = new THREE.LatheGeometry(pr.map(([r, x]) => new THREE.Vector2(r, x)), seg || 48);
      g.rotateZ(-Math.PI / 2); return g;
    }

    // ---------------------------------------------------------------- livery (decals over the paint)
    const names = { hemi4: 'BLOWN AWAY', v12: 'WARBIRD' };
    const NAME = names[engine];
    const skirtTex = canvasTex(2048, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // swooping stripes
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.moveTo(0, h * 0.78); g.bezierCurveTo(w * 0.35, h * 0.7, w * 0.6, h * 0.25, w, h * 0.18); g.lineTo(w, h * 0.3); g.bezierCurveTo(w * 0.62, h * 0.38, w * 0.36, h * 0.84, 0, h * 0.9); g.fill();
      g.fillStyle = 'rgba(10,10,12,0.9)';
      g.beginPath(); g.moveTo(0, h * 0.92); g.bezierCurveTo(w * 0.36, h * 0.86, w * 0.63, h * 0.41, w, h * 0.33); g.lineTo(w, h * 0.4); g.bezierCurveTo(w * 0.64, h * 0.48, w * 0.37, h * 0.95, 0, h);
      g.fill();
      g.font = 'italic 900 150px Arial Black, Arial'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.strokeStyle = '#0a0a0c'; g.fillStyle = '#ffffff';
      g.strokeText(NAME, 70, h * 0.42); g.fillText(NAME, 70, h * 0.42);
      g.font = 'bold 44px Arial'; g.fillStyle = '#0a0a0c';
      const sp = ['TORQUE KING', 'BIG BORE RACING', 'IRONHORSE', 'NITRO SUPPLY'];
      sp.forEach((t, i) => { const x = 1180 + i * 215; g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(x, 150, 200, 64); g.fillStyle = '#111'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText(t, x + 100, 183); });
      g.textAlign = 'left';
    });
    skirtTex.wrapS = THREE.ClampToEdgeWrapping;
    const fenderTex = canvasTex(1024, 1024, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // lightning bolts
      const bolt = (x, y, s, rot) => {
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
        g.beginPath(); g.moveTo(-20, -210); g.lineTo(40, -60); g.lineTo(0, -60); g.lineTo(60, 120); g.lineTo(10, 120); g.lineTo(70, 260); g.lineTo(-60, 60); g.lineTo(-15, 60); g.lineTo(-75, -80); g.lineTo(-30, -80); g.closePath();
        g.lineWidth = 16; g.strokeStyle = 'rgba(10,10,14,0.9)'; g.stroke(); g.fillStyle = '#ffffff'; g.fill(); g.restore();
      };
      bolt(310, 380, 1.15, -0.35); bolt(700, 300, 0.8, 0.25);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(0, 520 + k * 38); g.lineTo(w, 470 + k * 38); g.lineTo(w, 488 + k * 38); g.lineTo(0, 538 + k * 38); g.fill(); }
      // number + class
      g.font = 'italic 900 200px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 16; g.strokeStyle = '#0a0a0c'; g.strokeText('7', 520, 560); g.fillStyle = '#ffd400'; g.fillText('7', 520, 560);
      g.font = 'bold 46px Arial'; g.fillStyle = '#ffffff'; g.fillText('MODIFIED 3.6 T', 520, 690);
    });
    const noseTex = canvasTex(512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0b0b0d'; g.font = 'italic 900 150px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', w / 2, h * 0.47);
      g.fillStyle = '#c81a1a'; g.fillRect(0, h - 26, w, 26); g.fillRect(0, 0, w, 16);
    });
    const decal = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });

    // ---------------------------------------------------------------- frame, final drive, front axle, weights
    const RAIL_X = 0.36, RAIL_Y = 0.44;
    for (const sx of [-1, 1]) {
      add(model, new THREE.BoxGeometry(0.09, 0.16, zR - 0.75 - (zF - 0.7)), M.accent, sx * RAIL_X, RAIL_Y, (zR - 0.75 + zF - 0.7) / 2);
      tubeAB(model, V3(sx * RAIL_X, RAIL_Y, zR - 0.78), V3(sx * RAIL_X, 0.78, zR - 0.28), 0.055, M.accent);
    }
    for (let z = zF - 0.6; z < zR - 0.8; z += 0.8) add(model, new THREE.BoxGeometry(2 * RAIL_X, 0.08, 0.08), M.accent, 0, RAIL_Y - 0.03, z);
    // final drive / planetary housing on the rear axle, axle tubes out to the wheels
    add(model, rbox(0.82, 0.72, 0.8, 0.12), M.cast, 0, RR, zR);
    add(model, rbox(0.9, 0.12, 0.6, 0.04), M.steel, 0, RR + 0.4, zR - 0.02);
    for (const sx of [-1, 1]) {
      const at = new THREE.CylinderGeometry(0.14, 0.17, trackR / 2 - 0.39 - 0.4, 24); at.rotateZ(Math.PI / 2);
      add(model, at, M.cast, sx * (0.4 + (trackR / 2 - 0.39 - 0.4) / 2), RR, zR);
    }
    // front axle beam on its pivot pin, kingpins
    add(model, rbox(trackF - 0.25, 0.13, 0.15, 0.03), M.steel, 0, RF + 0.02, zF);
    { const pv = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 16); pv.rotateX(Math.PI / 2); add(model, pv, M.polish, 0, RF + 0.12, zF); }
    add(model, new THREE.BoxGeometry(0.3, 0.2, 0.3), M.accent, 0, RAIL_Y + 0.02, zF);
    // weight rack ahead of the front axle: slabs of steel like pages in a book, a painted number board, LED light bar
    const zW0 = zF - 0.45;
    for (let k = 0; k < 7; k++) {
      add(model, rbox(0.92, 0.5, 0.075, 0.02), M.weight, 0, 0.5, zW0 - k * 0.085);
      for (const sx of [-1, 1]) add(model, new THREE.CylinderGeometry(0.022, 0.022, 0.08, 8), M.chrome, sx * 0.34, 0.66, zW0 - k * 0.085, Math.PI / 2, 0, 0, false);
    }
    // open tube cradle round the plates, braced back to the frame
    for (const sx of [-1, 1]) {
      for (const y of [0.24, 0.78]) tubeAB(model, V3(sx * 0.5, y, zW0 + 0.08), V3(sx * 0.5, y, zW0 - 0.62), 0.026, M.accent);
      for (const z of [zW0 + 0.08, zW0 - 0.62]) tubeAB(model, V3(sx * 0.5, 0.22, z), V3(sx * 0.5, 0.8, z), 0.026, M.accent);
      tubeAB(model, V3(sx * 0.5, 0.78, zW0 + 0.08), V3(sx * 0.36, RAIL_Y + 0.05, zF + 0.25), 0.028, M.accent);
      tubeAB(model, V3(sx * 0.5, 0.24, zW0 + 0.08), V3(sx * 0.36, RAIL_Y - 0.06, zF + 0.1), 0.024, M.accent);
    }
    tubeAB(model, V3(-0.5, 0.8, zW0 - 0.62), V3(0.5, 0.8, zW0 - 0.62), 0.03, M.accent);
    tubeAB(model, V3(-0.5, 0.8, zW0 + 0.08), V3(0.5, 0.8, zW0 + 0.08), 0.026, M.accent);
    const nose = add(model, rbox(0.96, 0.46, 0.04, 0.02), M.paint, 0, 0.52, zW0 - 0.64);
    add(model, new THREE.PlaneGeometry(0.62, 0.31), decal(noseTex), 0, 0.53, zW0 - 0.665, 0, Math.PI, 0, false); void nose;
    add(model, rbox(0.84, 0.08, 0.07, 0.02), M.black, 0, 0.93, zW0 - 0.6);
    const ledBar = add(model, new THREE.PlaneGeometry(0.78, 0.045), M.led, 0, 0.93, zW0 - 0.637, 0, Math.PI, 0, false);
    void ledBar;
    // tow hook at the very front
    add(model, new THREE.TorusGeometry(0.06, 0.018, 8, 16), M.steel, 0, 0.26, zW0 - 0.66, 0, Math.PI / 2, 0);

    // ---------------------------------------------------------------- engines
    const tips = [];
    const CY_H = 0.93, CY_V = 0.92;              // crank heights: the sumps clear the frame rails
    const engG = new THREE.Group(); model.add(engG);
    function stack(parent, x, y, z) {
      // injector stack with a rolled bell mouth, dark inside
      const st = new THREE.CylinderGeometry(0.05, 0.043, 0.17, 20, 1, true);
      add(parent, st, M.polish, x, y, z);
      add(parent, new THREE.TorusGeometry(0.05, 0.013, 8, 24), M.polish, x, y + 0.085, z, Math.PI / 2, 0, 0);
      add(parent, new THREE.CircleGeometry(0.046, 18), M.hole, x, y + 0.03, z, -Math.PI / 2, 0, 0, false);
    }
    function hemi(ex, ez, front) {
      const g = new THREE.Group(); g.position.set(ex, CY_H, ez); engG.add(g);      // crank centre, 500 ci aluminium HEMI
      add(g, rbox(0.44, 0.3, 0.74, 0.04), M.alu, 0, -0.1, 0);
      add(g, rbox(0.42, 0.17, 0.66, 0.04), M.gloss, 0, -0.31, 0.02);                 // dry-sump pan
      add(g, rbox(0.46, 0.05, 0.1, 0.02), M.alu, 0, -0.02, -0.39);                   // front cover
      for (const sd of [-1, 1]) {
        const bank = new THREE.Group(); bank.rotation.z = -sd * Math.PI / 4; g.add(bank);
        add(bank, rbox(0.25, 0.3, 0.68, 0.03), M.alu, 0, 0.21, 0);
        add(bank, rbox(0.35, 0.14, 0.74, 0.04), M.alu, 0, 0.42, 0);
        const vc = add(bank, rbox(0.31, 0.07, 0.72, 0.035), sd > 0 ? M.redA : M.blueA, 0, 0.525, 0);
        for (let k = 0; k < 5; k++) add(bank, new THREE.BoxGeometry(0.2, 0.012, 0.018), M.polish, 0, 0.564, -0.28 + k * 0.14, 0, 0, 0, false);
        void vc;
        // plug wires from the magneto-side over the valve cover
        for (let k = 0; k < 4; k++) add(bank, new THREE.CylinderGeometry(0.009, 0.009, 0.12, 6), M.hoseR, -sd * 0.17, 0.5, -0.25 + k * 0.17, 0, 0, Math.PI / 2, false);
      }
      // blower manifold, 14-71 roots blower (ribbed case), snout and belt drive
      add(g, rbox(0.36, 0.08, 0.66, 0.02), M.alu, 0, 0.36, 0);
      add(g, rbox(0.32, 0.27, 0.64, 0.07), M.polish, 0, 0.53, 0);
      for (let k = 0; k < 6; k++) add(g, new THREE.BoxGeometry(0.335, 0.2, 0.012), M.alu, 0, 0.53, -0.25 + k * 0.1, 0, 0, 0, false);
      { const sn = new THREE.CylinderGeometry(0.055, 0.055, 0.12, 16); sn.rotateX(Math.PI / 2); add(g, sn, M.alu, 0, 0.52, -0.38); }
      const pul = (r, y, z, w) => { const p = new THREE.CylinderGeometry(r, r, w, 28); p.rotateX(Math.PI / 2); add(g, p, M.polish, 0, y, z); };
      pul(0.085, 0.52, -0.45, 0.07); pul(0.1, 0, -0.45, 0.07);
      for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.012, 0.52, 0.064), M.belt, sx * 0.093, 0.26, -0.45, 0, 0, sx * -0.03);
      // injector hat: 4 stacks in a row, butterfly linkage, fuel log
      add(g, rbox(0.26, 0.06, 0.5, 0.02), M.polish, 0, 0.695, 0);
      for (let k = 0; k < 4; k++) stack(g, 0, 0.8, -0.18 + k * 0.12);
      tubeAB(g, V3(0.07, 0.76, -0.24), V3(0.07, 0.76, 0.24), 0.008, M.polish);
      tubeAB(g, V3(-0.09, 0.73, -0.22), V3(-0.09, 0.73, 0.22), 0.016, M.blueA);
      // fuel pump on the front cover, hoses up to the hat
      { const fp = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 16); fp.rotateX(Math.PI / 2); add(g, fp, M.blueA, -0.14, -0.08, -0.45); }
      pipe(g, [V3(-0.14, -0.04, -0.5), V3(-0.22, 0.2, -0.5), V3(-0.18, 0.62, -0.32), V3(-0.09, 0.73, -0.22)], 0.012, M.hoseB, 20);
      pipe(g, [V3(-0.1, -0.1, -0.5), V3(0.18, 0.1, -0.52), V3(0.2, 0.55, -0.35), V3(0.09, 0.72, -0.2)], 0.011, M.hoseR, 20);
      // magneto at the back
      { const mg = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16); add(g, mg, M.polish, 0, 0.3, 0.42, -0.5, 0, 0); add(g, new THREE.CylinderGeometry(0.06, 0.05, 0.04, 16), M.redA, 0, 0.37, 0.46, -0.5, 0, 0); }
      // zoomie headers: four per bank out of the heads' exhaust ports, sweeping up and back (the inner banks straight up
      // so they clear the engine next door)
      const inner = (sd) => Math.sign(sd) === -Math.sign(ex);
      for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
        const zp = -0.255 + k * 0.17, px = sd * 0.4, py = 0.165;
        // (the two engines' inner ports are only ~20 cm apart: each inner row stubs out just clear of its own head and
        // goes straight up, leaving a gap between the rows - they used to meet in the middle and run through each other)
        const pts = inner(sd)
          ? [V3(px, py, zp), V3(px + sd * 0.035, py + 0.02, zp), V3(px + sd * 0.04, py + 0.3, zp + 0.05), V3(px + sd * 0.03, py + 0.62, zp + 0.2)]
          : [V3(px, py, zp), V3(px + sd * 0.11, py - 0.02, zp), V3(px + sd * 0.2, py + 0.22, zp + 0.08), V3(px + sd * 0.26, py + 0.5, zp + 0.26)];
        pipe(g, pts, 0.03, M.header, 18);
        const e = pts[3];
        add(g, new THREE.TorusGeometry(0.03, 0.006, 6, 16), M.header, e.x, e.y, e.z, Math.PI / 2 - 0.5, 0, 0, false);
        tips.push(V3(ex + e.x, CY_H + e.y + 0.02, ez + e.z + 0.02));
      }
      // bellhousing / coupler at the back
      { const bh = new THREE.CylinderGeometry(0.2, 0.22, 0.14, 24); bh.rotateX(Math.PI / 2); add(g, bh, M.gloss, 0, -0.04, 0.43); }
      void front;
      return g;
    }
    function allison(ex, ez) {
      // 28 L Allison V-1710: 60-deg V12, cast crankcase, long cam covers, intake log down the V, gear-driven
      // supercharger at the back feeding a big polished intake pipe that arches over the top to a bell mouth up front
      const g = new THREE.Group(); g.position.set(ex, CY_V, ez); engG.add(g);
      const LEN = 1.86;
      add(g, rbox(0.5, 0.34, LEN, 0.06), M.cast, 0, -0.1, 0);
      add(g, rbox(0.4, 0.14, LEN - 0.2, 0.05), M.gloss, 0, -0.32, 0.04);
      add(g, rbox(0.46, 0.4, 0.2, 0.08), M.cast, 0, 0.02, -LEN / 2 - 0.08);          // nose case
      for (const sd of [-1, 1]) {
        const bank = new THREE.Group(); bank.rotation.z = -sd * Math.PI / 6; g.add(bank);
        add(bank, rbox(0.24, 0.3, LEN - 0.14, 0.03), M.cast, 0, 0.23, 0);
        add(bank, rbox(0.3, 0.12, LEN - 0.08, 0.04), M.alu, 0, 0.43, 0);
        add(bank, rbox(0.25, 0.1, LEN - 0.04, 0.05), M.polish, 0, 0.53, 0);         // cam cover
        for (let k = 0; k < 7; k++) add(bank, new THREE.BoxGeometry(0.2, 0.012, 0.02), M.alu, 0, 0.583, -0.78 + k * 0.26, 0, 0, 0, false);
        // six ejector stubs per bank on the outside, flattened and swept back (the inner banks' point straight up)
        const inn = Math.sign(sd) === -Math.sign(ex);
        for (let k = 0; k < 6; k++) {
          const zp = -0.72 + k * 0.29;
          const a = V3(sd * 0.36, 0.3, zp), b = inn ? V3(sd * 0.4, 0.62, zp + 0.1) : V3(sd * 0.56, 0.52, zp + 0.16);
          const st = pipe(g, [a, V3((a.x + b.x) / 2 + sd * 0.02, (a.y + b.y) / 2, (a.z + b.z) / 2), b], 0.036, M.header, 10);
          st.scale.set(1, 1, 1);
          tips.push(V3(ex + b.x, CY_V + b.y, ez + b.z));
        }
      }
      // intake log down the V with 12 short runners
      { const lg = new THREE.CylinderGeometry(0.075, 0.075, LEN - 0.2, 24); lg.rotateX(Math.PI / 2); add(g, lg, M.polish, 0, 0.42, 0); }
      for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) tubeAB(g, V3(0, 0.42, -0.72 + k * 0.29), V3(sd * 0.2, 0.44, -0.72 + k * 0.29), 0.03, M.alu);
      // supercharger drum at the back, and the big intake pipe arching forward over the top to a bell mouth
      { const dr = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 36); dr.rotateX(Math.PI / 2); add(g, dr, M.alu, 0, 0.05, LEN / 2 + 0.12); }
      { const dr = new THREE.CylinderGeometry(0.2, 0.26, 0.08, 36); dr.rotateX(Math.PI / 2); add(g, dr, M.polish, 0, 0.05, LEN / 2 + 0.27); }
      pipe(g, [V3(0, 0.3, LEN / 2 + 0.12), V3(0, 0.62, LEN / 2 - 0.02), V3(0, 0.8, LEN / 2 - 0.5), V3(0, 0.82, -0.2), V3(0, 0.78, -LEN / 2 + 0.1), V3(0, 0.72, -LEN / 2 - 0.12)], 0.1, M.polish, 48);
      add(g, new THREE.TorusGeometry(0.105, 0.03, 10, 28), M.polish, 0, 0.72, -LEN / 2 - 0.13);
      add(g, new THREE.CircleGeometry(0.1, 24), M.hole, 0, 0.72, -LEN / 2 - 0.1, 0, Math.PI, 0, false);
      // second, smaller pipe from the blower up into the log
      pipe(g, [V3(0, 0.2, LEN / 2), V3(0, 0.48, LEN / 2 - 0.12), V3(0, 0.46, LEN / 2 - 0.3)], 0.06, M.polish, 16);
      // magnetos
      for (const sx of [-1, 1]) { const mg = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16); mg.rotateX(Math.PI / 2); add(g, mg, M.redA, sx * 0.12, 0.3, LEN / 2 + 0.02); }
      return g;
    }
    let splitZ;
    if (engine === 'v12') {
      for (const sx of [-1, 1]) allison(sx * 0.47, -0.55);
      splitZ = 0.95;
    } else {
      // two tandem pairs side by side; couplers between the front and rear engine of each pair
      for (const sx of [-1, 1]) {
        // (0.53 apart from the centre line: the inner valve covers of the two engines clear each other by ~3 cm)
        hemi(sx * 0.53, -1.1, true); hemi(sx * 0.53, -0.06, false);
        const cp = new THREE.CylinderGeometry(0.07, 0.07, 0.26, 16); cp.rotateX(Math.PI / 2); add(engG, cp, M.polish, sx * 0.53, CY_H - 0.04, -0.58);
      }
      splitZ = 0.85;
    }
    // engine plates on the rails
    for (const z of [-1.46, 0.32]) add(model, new THREE.BoxGeometry(1.5, 0.03, 0.14), M.steel, 0, RAIL_Y + 0.095, z);
    // splitter gearbox combining the engines, driveshaft back to the final drive
    add(model, rbox(1.3, 0.46, 0.5, 0.08), M.cast, 0, 0.8, splitZ + 0.25);
    for (const sx of [-1, 1]) { const f = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 24); f.rotateX(Math.PI / 2); add(model, f, M.polish, sx * 0.47, 0.82, splitZ - 0.02); }
    { const ds = new THREE.CylinderGeometry(0.065, 0.065, zR - 0.4 - (splitZ + 0.5), 16); ds.rotateX(Math.PI / 2); add(model, ds, M.polish, 0, 0.84, (zR - 0.4 + splitZ + 0.5) / 2); }
    // painted cowl over the splitter with the dash, a fire bottle
    add(model, rbox(1.0, 0.16, 0.9, 0.06), M.paint, 0, 1.08, splitZ + 0.72);
    { const fb = new THREE.CylinderGeometry(0.07, 0.07, 0.42, 20); fb.rotateZ(Math.PI / 2); add(model, fb, M.redA, 0, 1.24, splitZ + 0.45); }

    // ---------------------------------------------------------------- side skirts with the livery
    const skL = 3.3, skZ = (zF + 0.5 + zR - 1.0) / 2;
    for (const sx of [-1, 1]) {
      add(model, rbox(0.035, 0.36, skL, 0.015), M.paint, sx * 0.64, 0.36, skZ);
      const d = add(model, new THREE.PlaneGeometry(skL, skL / 8), decal(skirtTex), sx * 0.66, 0.36, skZ, 0, sx * Math.PI / 2, 0, false);
      d.scale.y = 0.36 / (skL / 8);
      for (const z of [skZ - skL / 2 + 0.2, skZ + skL / 2 - 0.2]) tubeAB(model, V3(sx * RAIL_X, RAIL_Y, z), V3(sx * 0.62, 0.4, z), 0.02, M.accent);
    }

    // ---------------------------------------------------------------- rear fenders (inner walls carry the livery)
    const shellM = M.paint.clone(); shellM.side = THREE.DoubleSide; M.paintShell = shellM;
    for (const sx of [-1, 1]) {
      const xw = sx * (trackR / 2 - 0.39 - 0.05), R = 1.0, th0 = -0.32, th1 = Math.PI - 0.12, W = 0.9;
      // curved shell over the tyre
      const seg = 40, pos = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const th = th0 + (th1 - th0) * i / seg, y = RR + R * Math.sin(th), z = zR - R * Math.cos(th);
        pos.push(xw, y, z, xw + sx * W, y, z);
      }
      for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
      add(model, sg, shellM, 0, 0, 0);
      // rolled outer edge
      const edge = [];
      for (let i = 0; i <= seg; i++) { const th = th0 + (th1 - th0) * i / seg; edge.push(V3(xw + sx * W, RR + R * Math.sin(th), zR - R * Math.cos(th))); }
      pipe(model, edge, 0.02, M.polish, 60);
      // inner wall: a big "D" (in the y-z plane, forward = -z)
      const s = new THREE.Shape();
      const P = (th) => [-(zR - R * Math.cos(th)) + zR, RR + R * Math.sin(th)];
      // shape coords: u = forward distance from the axle (so +u = -z), v = height
      s.moveTo(R * Math.cos(th0), RR + R * Math.sin(th0));
      for (let i = 1; i <= 40; i++) { const th = th0 + (th1 - th0) * i / 40; s.lineTo(R * Math.cos(th), RR + R * Math.sin(th)); }
      s.lineTo(-0.85, RR - 0.18); s.lineTo(0.72, RR - 0.42); s.closePath();
      void P;
      const wg = new THREE.ShapeGeometry(s, 8);
      wg.rotateY(Math.PI / 2);                 // shape x (u) -> -z ; shape y -> y
      const wm = add(model, wg, M.paintShell, xw, 0, zR, 0, 0, 0);
      void wm;
      // decal on the side facing the middle (and so the driver / the camera from the front three-quarter)
      add(model, new THREE.PlaneGeometry(1.9, 1.9), decal(fenderTex), xw - sx * 0.006, RR + 0.18, zR - 0.02, 0, -sx * Math.PI / 2, 0, false);
      // fender top sun-visor plate
      add(model, rbox(W, 0.025, 0.4, 0.01), M.paint, xw + sx * W / 2, RR + R * Math.sin(1.25) + 0.02, zR - R * Math.cos(1.25) - 0.18, -0.35, 0, 0);
    }

    // ---------------------------------------------------------------- cage, seat, driver, dash, steering
    const zS = zR - 0.28, yFloor = RR + 0.46;      // seat over the final drive
    const cage = new THREE.Group(); model.add(cage);
    const cx = 0.38, zc0 = zS - 0.55, zc1 = zS + 0.42, yTop = yFloor + 1.05;
    for (const sx of [-1, 1]) {
      tubeAB(cage, V3(sx * cx, yFloor - 0.1, zc0), V3(sx * cx * 0.92, yTop, zc0 + 0.1), 0.028, M.accent);
      tubeAB(cage, V3(sx * cx, yFloor - 0.1, zc1), V3(sx * cx * 0.92, yTop, zc1 - 0.05), 0.028, M.accent);
      tubeAB(cage, V3(sx * cx * 0.92, yTop, zc0 + 0.1), V3(sx * cx * 0.92, yTop, zc1 - 0.05), 0.028, M.accent);
      tubeAB(cage, V3(sx * cx, yFloor + 0.3, zc0 + 0.05), V3(sx * cx, yFloor + 0.3, zc1), 0.022, M.accent);
      tubeAB(cage, V3(sx * cx, yFloor - 0.1, zc0), V3(sx * cx * 0.95, yFloor + 0.62, zc1 - 0.02), 0.02, M.accent);
    }
    for (const z of [zc0 + 0.1, zc1 - 0.05]) tubeAB(cage, V3(-cx * 0.92, yTop, z), V3(cx * 0.92, yTop, z), 0.028, M.accent);
    tubeAB(cage, V3(-cx * 0.92, yTop, zc1 - 0.05), V3(cx * 0.92, yTop - 0.02, zc0 + 0.1), 0.022, M.accent);
    tubeAB(cage, V3(-cx, yFloor - 0.08, zc1), V3(cx, yFloor - 0.08, zc1), 0.028, M.accent);
    // floor pan, seat
    add(cage, new THREE.BoxGeometry(0.8, 0.03, 1.0), M.steel, 0, yFloor - 0.1, zS - 0.1);
    add(cage, rbox(0.46, 0.08, 0.46, 0.03), M.black, 0, yFloor, zS + 0.05);
    add(cage, rbox(0.46, 0.62, 0.08, 0.04), M.black, 0, yFloor + 0.32, zS + 0.3, -0.15, 0, 0);
    for (const sx of [-1, 1]) add(cage, rbox(0.06, 0.3, 0.3, 0.02), M.black, sx * 0.23, yFloor + 0.4, zS + 0.18, -0.15, 0, 0);
    // red tail / brake light on the back hoop
    add(cage, new THREE.BoxGeometry(0.18, 0.07, 0.03), M.tail, 0, yTop - 0.08, zc1 - 0.02, 0, 0, 0, false);
    // dash (cluster canvas) and steering
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 512; clusterCanvas.height = 300;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace; clusterTex.anisotropy = 8;
    const dash = new THREE.Group(); dash.position.set(-0.05, yFloor + 0.3, zS - 0.56); dash.rotation.x = -0.75; cage.add(dash);
    add(dash, rbox(0.3, 0.19, 0.04, 0.02), M.black, 0, 0, -0.025);
    add(dash, new THREE.PlaneGeometry(0.27, 0.158), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0, 0.0, 0, 0, 0, false);
    const colG = new THREE.Group(); colG.position.set(0, yFloor + 0.36, zS - 0.36); colG.rotation.x = -0.55; cage.add(colG);
    { const col = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 10); col.rotateX(Math.PI / 2); add(colG, col, M.polish, 0, 0, -0.2); }
    const steerWheel = new THREE.Group(); colG.add(steerWheel);
    add(steerWheel, new THREE.TorusGeometry(0.15, 0.017, 10, 32), M.black, 0, 0, 0);
    for (let k = 0; k < 3; k++) { const sp = add(steerWheel, new THREE.BoxGeometry(0.018, 0.14, 0.01), M.polish, 0, 0, 0.005); sp.rotation.z = k * 2.094; sp.geometry.translate(0, 0.07, 0); }
    add(steerWheel, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.polish, 0, 0, 0.01, Math.PI / 2, 0, 0);
    // the driver (hidden in the cockpit view): firesuit, belts, arms to the wheel, helmet with a dark visor
    const driver = new THREE.Group(); cage.add(driver);
    add(driver, rbox(0.36, 0.5, 0.24, 0.1), M.suit, 0, yFloor + 0.38, zS + 0.15, -0.15, 0, 0);
    for (const sx of [-1, 1]) {
      add(driver, rbox(0.05, 0.5, 0.012, 0.005), M.redA, sx * 0.08, yFloor + 0.4, zS + 0.02, -0.15, 0, 0, false);
      tubeAB(driver, V3(sx * 0.17, yFloor + 0.55, zS + 0.1), V3(sx * 0.13, yFloor + 0.41, zS - 0.31), 0.045, M.suit);
      add(driver, new THREE.SphereGeometry(0.04, 10, 8), M.black, sx * 0.13, yFloor + 0.4, zS - 0.34);
      tubeAB(driver, V3(sx * 0.1, yFloor + 0.08, zS - 0.05), V3(sx * 0.12, yFloor + 0.2, zS - 0.45), 0.06, M.suit);
    }
    add(driver, new THREE.SphereGeometry(0.15, 24, 16), M.helmet, 0, yFloor + 0.77, zS + 0.1);
    { const vg = new THREE.SphereGeometry(0.153, 24, 12, -Math.PI / 2 - 0.85, 1.7, 1.28, 0.5); add(driver, vg, M.visor, 0, yFloor + 0.77, zS + 0.1, 0, 0, 0, false); }
    add(driver, new THREE.BoxGeometry(0.016, 0.06, 0.18), M.paint, 0, yFloor + 0.915, zS + 0.1, 0, 0, 0, false);
    const eye = V3(0, yFloor + 0.79, zS - 0.02);

    // ---------------------------------------------------------------- weight bar with skid pads, hitch
    const barLen = 1.75, barClr = 0.34;
    for (const sx of [-1, 1]) {
      tubeAB(model, V3(sx * 0.3, RR - 0.18, zR + 0.34), V3(sx * 0.55, barClr + 0.02, zR + barLen), 0.035, M.accent);
      tubeAB(model, V3(sx * 0.32, RR + 0.18, zR + 0.36), V3(sx * 0.55, barClr + 0.08, zR + barLen - 0.05), 0.026, M.accent);
      add(model, rbox(0.18, 0.1, 0.34, 0.03), M.steel, sx * 0.55, barClr - 0.03, zR + barLen);
      add(model, rbox(0.2, 0.03, 0.36, 0.012), M.black, sx * 0.55, barClr - 0.08, zR + barLen);   // skid pad
    }
    tubeAB(model, V3(-0.55, barClr + 0.03, zR + barLen), V3(0.55, barClr + 0.03, zR + barLen), 0.035, M.accent);
    tubeAB(model, V3(-0.44, barClr + 0.1, zR + barLen * 0.66), V3(0.44, barClr + 0.1, zR + barLen * 0.66), 0.022, M.accent);
    // drawbar hitch at 20 in (the sled hooks on here)
    add(model, rbox(0.16, 0.36, 0.62, 0.02), M.steel, 0, 0.58, zR + 0.62);
    add(model, new THREE.TorusGeometry(0.07, 0.025, 10, 20), M.chrome, 0, 0.51, zR + 0.95, 0, Math.PI / 2, 0);

    // ---------------------------------------------------------------- wheels
    // rear: 30.5L-32 cut pulling tyre - tall round-shouldered carcass and sharpened chevron bars
    const tyreR = latheX([[0.41, -0.33], [0.46, -0.365], [0.56, -0.39], [0.68, -0.392], [0.78, -0.375], [0.835, -0.34], [RR - 0.012, -0.28],
      [RR, -0.2], [RR, 0.2], [RR - 0.012, 0.28], [0.835, 0.34], [0.78, 0.375], [0.68, 0.392], [0.56, 0.39], [0.46, 0.365], [0.41, 0.33]], 64);
    // (the left wheel sits in a group turned 180 deg, so it gets a mirrored set)
    function lugs(dir) {
      const list = [];
      for (let k = 0; k < 46; k++) {
        const side = k & 1 ? 1 : -1, phi = k * Math.PI * 2 / 46;
        const b = new THREE.BoxGeometry(0.4, 0.07, 0.05);
        b.rotateY(-side * dir * 0.62); b.translate(side * 0.18, RR + 0.02, 0);
        // wrap over the shoulder a little
        const sh = new THREE.BoxGeometry(0.08, 0.12, 0.05); sh.rotateZ(side * 0.7); sh.translate(side * 0.36, RR - 0.04, dir * 0.12);
        b.rotateX(phi); sh.rotateX(phi); list.push(b, sh);
      }
      return mergeGeos(list);
    }
    const lugGeoR = lugs(1), lugGeoL = lugs(-1);
    // polished 32 in rim: lip, deep cone dish, centre plate with nuts, planetary hub
    function rearRim(g) {
      const lip = new THREE.TorusGeometry(0.405, 0.024, 10, 56); lip.rotateY(Math.PI / 2); add(g, lip, M.polish, 0.33, 0, 0);
      const dish = new THREE.CylinderGeometry(0.23, 0.4, 0.2, 48, 1, true); dish.rotateZ(Math.PI / 2); add(g, dish, M.polish, 0.23, 0, 0);
      const plate = new THREE.CylinderGeometry(0.23, 0.23, 0.02, 40); plate.rotateZ(Math.PI / 2); add(g, plate, M.polish, 0.13, 0, 0);
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; const n = new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6); n.rotateZ(Math.PI / 2); add(g, n, M.chrome, 0.15, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0, 0, 0, false); }
      const hub = new THREE.CylinderGeometry(0.13, 0.17, 0.2, 32); hub.rotateZ(-Math.PI / 2); add(g, hub, M.polish, 0.24, 0, 0);
      const cap = new THREE.CylinderGeometry(0.1, 0.13, 0.05, 32); cap.rotateZ(-Math.PI / 2); add(g, cap, M.cast, 0.36, 0, 0);
      const barrel = new THREE.CylinderGeometry(0.4, 0.4, 0.66, 48, 1, true); barrel.rotateZ(Math.PI / 2); add(g, barrel, M.alu, 0, 0, 0);
      const back = new THREE.CircleGeometry(0.4, 40); back.rotateY(Math.PI / 2); add(g, back, M.steel, -0.2, 0, 0, 0, 0, 0, false);
    }
    // front: ribbed steering tyre on a polished rim
    const tyreF = latheX([[0.2, -0.1], [0.24, -0.11], [0.31, -0.112], [0.35, -0.1], [RF - 0.004, -0.07], [RF, -0.055], [RF - 0.012, -0.04], [RF, -0.025],
      [RF - 0.012, -0.01], [RF, 0.005], [RF - 0.012, 0.02], [RF, 0.035], [RF - 0.012, 0.05], [RF, 0.06], [RF - 0.004, 0.075], [0.35, 0.1], [0.31, 0.112], [0.24, 0.11], [0.2, 0.1]], 48);
    function frontRim(g) {
      const lip = new THREE.TorusGeometry(0.2, 0.014, 8, 40); lip.rotateY(Math.PI / 2); add(g, lip, M.polish, 0.1, 0, 0);
      const dish = new THREE.CylinderGeometry(0.1, 0.195, 0.07, 36, 1, true); dish.rotateZ(Math.PI / 2); add(g, dish, M.polish, 0.07, 0, 0);
      const hub = new THREE.CylinderGeometry(0.06, 0.09, 0.1, 24); hub.rotateZ(-Math.PI / 2); add(g, hub, M.polish, 0.06, 0, 0);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const n = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6); n.rotateZ(Math.PI / 2); add(g, n, M.chrome, 0.05, Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0, 0, 0, false); }
    }
    const wheels = [];
    const cgToFront = opts.cgToFront || 3.408, cgToRear = opts.cgToRear || 1.392;
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group();
      corner.position.set(side * (frontW ? trackF : trackR) / 2, 0, frontW ? -cgToFront : cgToRear);
      rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      const spin = new THREE.Group(); flip.add(spin);
      if (frontW) {
        add(spin, tyreF, M.rubber, 0, 0, 0); frontRim(spin);
        // steering knuckle / spindle (turns with the wheel, doesn't spin)
        add(flip, new THREE.BoxGeometry(0.06, 0.2, 0.12), M.steel, -0.13, 0, 0);
      } else {
        add(spin, tyreR, M.rubber, 0, 0, 0); add(spin, left ? lugGeoL : lugGeoR, M.rubber, 0, 0, 0); rearRim(spin);
      }
      wheels.push({ corner, flip, spin, left, front: frontW, side });
    }

    // ---------------------------------------------------------------- headlights (LED bar on the weight rack)
    const headlights = [];
    for (const sx of [-1, 1]) {
      const sl = new THREE.SpotLight(0xf2f6ff, 0, 90, 0.5, 0.45, 1.4);
      sl.position.set(sx * 0.3, 0.93 - cgH, zW0 - 0.66 + zOff);
      sl.target.position.set(sx * 0.6, -cgH - 0.5, zW0 - 40 + zOff);
      rootG.add(sl); rootG.add(sl.target); sl.visible = false; headlights.push(sl);
    }

    // ---------------------------------------------------------------- dash
    const cg = clusterCanvas.getContext('2d');
    function drawCluster(t) {
      const g = cg, w = 512, h = 300;
      g.fillStyle = '#050607'; g.fillRect(0, 0, w, h);
      const maxR = Math.max(1000, t.maxRpm || 9000), red = t.redline || maxR * 0.95;
      const cx = 150, cy = 160, r = 120, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = (x) => a0 + (a1 - a0) * clamp(x / maxR, 0, 1.02);
      const step = maxR <= 5000 ? 500 : 1000;
      g.strokeStyle = '#c2c6cc'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
      g.strokeStyle = '#d11'; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, r - 12, ang(red), a1); g.stroke();
      g.fillStyle = '#eee'; g.strokeStyle = '#eee'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 20px Arial';
      for (let x = 0; x <= maxR + 1; x += step) {
        const a = ang(x); g.lineWidth = 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); g.lineTo(cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20)); g.stroke();
        if (x % (step * (maxR > 5000 ? 1 : 2)) === 0) g.fillText(String(x / 1000), cx + Math.cos(a) * (r - 38), cy + Math.sin(a) * (r - 38));
      }
      g.font = '15px Arial'; g.fillStyle = '#999'; g.fillText('RPM x1000', cx, cy + 58);
      const a = ang(t.rpm); g.strokeStyle = '#ff5a1a'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.fill();
      // right: gear, boost, oil, water, speed
      g.fillStyle = t.shiftNow ? '#ff3a2a' : '#ffffff'; g.font = 'bold 110px Arial'; g.fillText(t.gear.replace(/^[DM]/, ''), 360, 96);
      g.textAlign = 'left'; g.font = '16px Arial';
      const cells = [['BOOST', t.boost.toFixed(0) + ' psi'], ['OIL', Math.round(t.oil) + ' psi'], ['WATER', Math.round(t.water) + ' F'], ['MPH', String(Math.round(t.speedMph))]];
      cells.forEach(([k, v], i) => { const y = 176 + i * 30; g.fillStyle = '#6fa8c8'; g.fillText(k, 300, y); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText(v, 380, y); g.font = '16px Arial'; });
      if (!t.running) { g.fillStyle = '#ff3a2a'; g.font = 'bold 20px Arial'; g.fillText('ENGINE OFF', 300, 290); }
      else if (t.launch) { g.fillStyle = '#ffc400'; g.font = 'bold 20px Arial'; g.fillText('CLUTCH HELD', 300, 290); }
      clusterTex.needsUpdate = true;
    }
    function drawScreen() {}
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.paint.color.setHex(c); if (M.paintShell) M.paintShell.color.setHex(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 5 : (o.night ? 1.2 : 0.4);
      M.led.emissiveIntensity = o.headlights ? 4 : 0;
      for (const hl of headlights) { hl.visible = !!o.headlights; hl.intensity = o.headlights ? 220 : 0; }
    }
    function setInteriorVisible(v, cockpit) { driver.visible = !cockpit; }
    function setTransmission() {}
    function setTires() {}
    function setChute() {}

    for (const t of tips) t.add(V3(0, -cgH, zOff));
    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: cage, wheels, steerWheel, eye: eye.clone().add(V3(0, -cgH, zOff)),
      exhaustTips: tips, materials: M, headlights, tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, variant: 'puller', engine,
    };
  }

  root.HCPuller = { build };
})(typeof self !== 'undefined' ? self : this);
