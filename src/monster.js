/* Hellcat Drive — procedural monster truck (stadium freestyle spec).
   Chromoly tube chassis with the driver's cage in the middle, a supercharged big-block behind it (the blower and its
   butterfly hat stick up out of the bed, zoomie headers out of the bed sides), a 4-link on each solid axle with two
   nitrogen coil-over shocks and a bypass shock per corner - the axles, links and shocks follow the physics' 30 in of
   wheel travel every frame - planetary axles, 66x43.00-25 hand-cut tyres on beadlock rims, and a fiberglass pickup body
   (fenders arching over the tyres, cab, open bed) in a livery drawn for the current paint.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build, plus afterWheels() (the game calls it once the wheels are placed). */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const cgH = opts.cgHeight || 1.26, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 1.932, cgToRear = opts.cgToRear || 1.518;
    const L = cgToFront + cgToRear, zF = -L / 2, zR = L / 2;       // axle stations (model space)
    const RT = 0.838, WT = 1.09, RRIM = 0.33;                       // tyre radius / width, rim radius
    const track = opts.trackF || 2.71, HX = track / 2;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || { 'Go Mango': 0xf2570f };
    const NAME = 'WRECKONING', NUM = '13';
    const rootG = new THREE.Group(); rootG.name = 'monster';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const toRoot = (v) => v.clone().add(V3(0, -cgH, zOff));       // model space -> root (CG) space

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
    const cylX = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateZ(Math.PI / 2); return g; };
    function latheX(pts, seg) {       // profile [[radius, x], ...] spun round the X axis
      const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg || 48);
      g.rotateZ(-Math.PI / 2); return g;
    }
    function mergeGeos(list) {
      const gs = list.map((g0) => { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); return g; });
      let n = 0; for (const g of gs) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = []; let o = 0;
      for (const g of gs) {
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        for (let i = 0; i < g.attributes.position.count; i++) idx.push(o + i);
        o += g.attributes.position.count;
      }
      const m = new THREE.BufferGeometry();
      m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setIndex(idx);
      return m;
    }

    // smooth shading for the extruded body: average the normals of faces meeting at a point when they're within maxDeg
    // of each other - the rounded edges (bevels) come out smooth, the real creases stay sharp
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

    // ---------------------------------------------------------------- materials
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] || 0xf2570f, metalness: 0.1, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.12 });
    M.chassis = new THREE.MeshPhysicalMaterial({ color: 0x9be31c, metalness: 0.25, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });   // powder-coated chromoly
    M.black = new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.6, metalness: 0.2 });
    M.gloss = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.25, metalness: 0.4 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.5, metalness: 0.6 });
    M.cast = new THREE.MeshStandardMaterial({ color: 0x5d6066, roughness: 0.55, metalness: 0.7 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.07, metalness: 1 });
    M.polish = new THREE.MeshStandardMaterial({ color: 0xe4e6ea, roughness: 0.12, metalness: 1 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xaeb2b8, roughness: 0.4, metalness: 0.85 });
    M.blue = new THREE.MeshStandardMaterial({ color: 0x1b58d6, roughness: 0.3, metalness: 0.75 });
    M.red = new THREE.MeshStandardMaterial({ color: 0xc81a1a, roughness: 0.3, metalness: 0.75 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x1d1915, roughness: 0.94, metalness: 0 });   // (dusty)
    M.suit = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1116, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false });
    M.inner = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.85, side: THREE.BackSide });
    M.head = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xf4f8ff, emissiveIntensity: 0, roughness: 0.15, metalness: 0.5 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x3a0306, emissive: 0xff1010, emissiveIntensity: 0.4, roughness: 0.25 });
    const headerTex = canvasTex(256, 16, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#6b5a3a'); gr.addColorStop(0.15, '#c9a24a'); gr.addColorStop(0.35, '#6a4a8a'); gr.addColorStop(0.5, '#2f4f9a');
      gr.addColorStop(0.7, '#8a8f99'); gr.addColorStop(1, '#b9bcc2');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    M.header = new THREE.MeshStandardMaterial({ map: headerTex, roughness: 0.28, metalness: 0.9 });

    // ---------------------------------------------------------------- livery (redrawn for the paint colour)
    // one canvas per body part side: top half = left side, bottom half = right side (drawn so the text reads on both)
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const liveryTex = canvasTex(2048, 1024, () => {});
    const cabTex = canvasTex(1024, 1024, () => {});
    const hoodTex = canvasTex(1024, 1024, () => {});
    // side profile extents (the livery is mapped over these)
    const BZ0 = -2.8, BZ1 = 2.66, BY0 = 1.5, BY1 = 2.5, CZ0 = -0.5, CZ1 = 1.0, CY0 = 2.44, CY1 = 3.48;
    function claw(g, x, y, s, flip) {          // three torn claw slashes
      g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
      for (let k = 0; k < 3; k++) {
        g.beginPath(); const ox = k * 70;
        g.moveTo(ox, -150); g.quadraticCurveTo(ox + 60, 0, ox - 10, 150); g.lineTo(ox + 18, 138);
        g.quadraticCurveTo(ox + 80, 0, ox + 34, -150); g.closePath(); g.fill(); g.stroke();
      }
      g.restore();
    }
    function drawLivery(paint) {
      const P = hex(paint), cv = liveryTex.userData.canvas, g = cv.getContext('2d'), W = cv.width, H = cv.height / 2;
      for (let side = 0; side < 2; side++) {
        g.save(); g.translate(0, side * H);
        // (right side: flip the artwork so the front of the truck is at the right of the picture)
        if (side === 1) { g.translate(W, 0); g.scale(-1, 1); }
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P); gr.addColorStop(1, shade(paint, 0.55));
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        // lime tear-away graphics sweeping back from the front fender
        g.fillStyle = '#0b0b0c'; g.strokeStyle = '#a6ff1c'; g.lineWidth = 10;
        g.beginPath(); g.moveTo(0, H * 0.62);
        for (let k = 0; k <= 14; k++) { const x = k * W / 14, y = H * (0.62 + 0.18 * Math.sin(k * 1.9) * (k % 2 ? 1 : -0.6)); g.lineTo(x, y); }
        g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill(); g.stroke();
        claw(g, W * 0.12, H * 0.45, 0.9, false);
        // arena dirt: flung up by the tyres - thickest low down and round the wheel arches, streaks and spots higher up
        let sd = 1234 + side * 77; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 900; k++) {
          const nearArch = rnd() < 0.55, arch = rnd() < 0.5 ? 0.197 : 0.829;
          const x = (nearArch ? arch + (rnd() - 0.5) * 0.3 : rnd()) * W;
          const yy = H * (1 - Math.pow(rnd(), nearArch ? 1.6 : 2.6) * (nearArch ? 0.75 : 0.5));
          const r = 3 + rnd() * rnd() * 22;
          g.fillStyle = `rgba(${60 + rnd() * 25 | 0},${38 + rnd() * 15 | 0},${22 + rnd() * 10 | 0},${0.25 + rnd() * 0.5})`;
          g.beginPath(); g.ellipse(x, yy, r * (1 + rnd()), r, rnd() * 3, 0, 7); g.fill();
        }
        const mud = g.createLinearGradient(0, H * 0.72, 0, H); mud.addColorStop(0, 'rgba(66,42,24,0)'); mud.addColorStop(1, 'rgba(66,42,24,0.75)');
        g.fillStyle = mud; g.fillRect(0, H * 0.72, W, H * 0.28);
        g.restore();
        // the name, reading left to right on both sides
        g.save(); g.translate(0, side * H);
        // (between the wheel arches and ahead of the bed, which drops the body's top edge)
        const nx = side ? W * 0.62 : W * 0.38;
        g.font = 'italic 900 215px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = 30; g.strokeStyle = '#0b0b0c'; g.strokeText(NAME, nx, H * 0.46, W * 0.6);
        g.lineWidth = 11; g.strokeStyle = '#a6ff1c'; g.strokeText(NAME, nx, H * 0.46, W * 0.6);
        g.fillStyle = '#ffffff'; g.fillText(NAME, nx, H * 0.46, W * 0.6);
        g.font = 'bold 48px Arial'; g.fillStyle = '#0b0b0c';
        g.fillText('HELLCAT DRIVE  ·  540 BLOWN  ·  METHANOL', nx, H * 0.7, W * 0.5);
        g.restore();
      }
      liveryTex.needsUpdate = true;
      // cab sides: window openings (dark), the number
      const c2 = cabTex.userData.canvas, g2 = c2.getContext('2d'), H2 = c2.height / 2, W2 = c2.width;
      for (let side = 0; side < 2; side++) {
        g2.save(); g2.translate(0, side * H2);
        if (side === 1) { g2.translate(W2, 0); g2.scale(-1, 1); }
        g2.fillStyle = P; g2.fillRect(0, 0, W2, H2);
        // side window: the cab's profile (windshield raked forward at the left of the picture), inset
        const zt = (z) => (z - CZ0) / (CZ1 - CZ0) * W2, yt = (y) => (1 - (y - CY0) / (CY1 - CY0)) * H2;
        g2.fillStyle = '#07090b'; g2.beginPath();
        g2.moveTo(zt(-0.2), yt(2.62)); g2.lineTo(zt(0.12), yt(3.3)); g2.lineTo(zt(0.8), yt(3.32)); g2.lineTo(zt(0.84), yt(2.62)); g2.closePath(); g2.fill();
        g2.strokeStyle = '#a6ff1c'; g2.lineWidth = 8; g2.stroke();
        g2.restore();
        g2.save(); g2.translate(0, side * H2);
        g2.font = 'italic 900 150px Impact, "Arial Black", Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.lineWidth = 16; g2.strokeStyle = '#0b0b0c'; g2.strokeText(NUM, W2 * 0.5, H2 * 0.8); g2.fillStyle = '#a6ff1c'; g2.fillText(NUM, W2 * 0.5, H2 * 0.8);
        g2.restore();
      }
      cabTex.needsUpdate = true;
      // hood: a big claw mark and the name
      const c3 = hoodTex.userData.canvas, g3 = c3.getContext('2d');
      g3.clearRect(0, 0, c3.width, c3.height);
      g3.fillStyle = '#0b0b0c'; g3.strokeStyle = '#a6ff1c'; g3.lineWidth = 14;
      claw(g3, 330, 470, 1.35, false);
      g3.save(); g3.translate(512, 870); g3.font = 'italic 900 150px Impact, "Arial Black", Arial'; g3.textAlign = 'center';
      g3.lineWidth = 22; g3.strokeStyle = '#0b0b0c'; g3.strokeText(NAME, 0, 0); g3.fillStyle = '#ffffff'; g3.fillText(NAME, 0, 0); g3.restore();
      hoodTex.needsUpdate = true;
    }
    function shade(c, k) { const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k; return `rgb(${r | 0},${g | 0},${b | 0})`; }
    M.livery = new THREE.MeshPhysicalMaterial({ map: liveryTex, metalness: 0.1, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.12 });
    M.cabSide = new THREE.MeshPhysicalMaterial({ map: cabTex, metalness: 0.1, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.12 });
    M.hoodDecal = new THREE.MeshPhysicalMaterial({ map: hoodTex, transparent: true, alphaTest: 0.5, metalness: 0.2, roughness: 0.35, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    drawLivery(PAINTS[opts.paint] || 0xf2570f);

    // ---------------------------------------------------------------- body shell (fiberglass)
    // Side profiles extruded across the truck with rounded edges. The lower body: grille, hood, a flat deck under the
    // cab, the bed floor and the tailgate face - its bottom edge arcs high over both tyres (the wheel wells).
    const archY = (z) => {               // bottom edge of the body: the rocker, lifted into arches over the tyres
      let y = 1.55;
      for (const za of [zF, zR]) { const d = z - za; if (Math.abs(d) < 1.27) y = Math.max(y, 0.95 + Math.sqrt(1.27 * 1.27 - d * d)); }
      return y;
    };
    function sideShape() {
      const s = new THREE.Shape();
      const top = [[-2.8, 1.66], [-2.82, 2.02], [-2.76, 2.26], [-2.62, 2.35], [-2.3, 2.39], [-0.5, 2.46], [1.0, 2.46], [1.02, 2.02], [2.62, 2.02], [2.66, 1.95]];
      s.moveTo(top[0][0], top[0][1]);
      for (let i = 1; i < top.length; i++) s.lineTo(top[i][0], top[i][1]);
      for (let k = 0; k <= 80; k++) { const z = 2.66 - k * 5.46 / 80; s.lineTo(z, archY(z)); }
      return s;
    }
    // livery UVs on the flat sides (normals along +-x): u along the length, v up; left side in the top half of the
    // canvas, right side in the bottom half
    function sideUVs(g, z0, z1, y0, y1) {
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const nx = n.getX(i);
        if (Math.abs(nx) < 0.7) continue;
        const u = (p.getZ(i) - z0) / (z1 - z0), v = (p.getY(i) - y0) / (y1 - y0);
        if (nx < 0) uv.setXY(i, u, 0.5 + 0.5 * clamp(v, 0, 1));                 // left side: top half of the canvas
        else uv.setXY(i, 1 - u, 0.5 * clamp(v, 0, 1));                           // right side: bottom half, mirrored
      }
      uv.needsUpdate = true;
    }
    const bodyG = new THREE.Group(); model.add(bodyG);
    const HW = 1.74, BV = 0.1;          // half width; the rounded edges (bevel) stand 0.1 m proud of the side outline
    {
      const g = new THREE.ExtrudeGeometry(sideShape(), { depth: 2 * HW - 0.24, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 12, steps: 1 });
      // shape (x, y) = (z, y); extrusion along +z -> rotate so it runs along x
      g.rotateY(Math.PI / 2); g.translate(-(HW - 0.12), 0, 0);
      // rotateY(+90): shape x -> -z. Mirror z back so the shape's x is the truck's z
      g.scale(1, 1, -1); g.computeVertexNormals();
      // (the mirror turned the faces inside out)
      const idx = g.index ? g.index.array : null;
      if (idx) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
      else { const p = g.attributes.position, u = g.attributes.uv; for (let k = 0; k < p.count; k += 3) for (const a of [p, u]) { const sz = a.itemSize; for (let c = 0; c < sz; c++) { const t = a.array[(k + 1) * sz + c]; a.array[(k + 1) * sz + c] = a.array[(k + 2) * sz + c]; a.array[(k + 2) * sz + c] = t; } } }
      g.computeVertexNormals();
      sideUVs(g, BZ0, BZ1, BY0, BY1);
      smoothNormals(g, 32);
      const m = new THREE.Mesh(g, [M.livery, M.paint]); m.castShadow = true; m.receiveShadow = true; bodyG.add(m);
      // the inside of the shell (seen from under the truck / from the bed)
      const inner = new THREE.Mesh(g, M.inner); inner.scale.set(0.985, 1, 0.99); bodyG.add(inner);
    }
    // cab: windshield raked back, roof, back window; narrower than the fenders
    {
      const s = new THREE.Shape(), CHW = 1.46;
      s.moveTo(-0.5, 2.44); s.lineTo(-0.05, 3.36); s.quadraticCurveTo(0.02, 3.48, 0.18, 3.48); s.lineTo(0.84, 3.48);
      s.quadraticCurveTo(0.96, 3.48, 0.97, 3.36); s.lineTo(1.0, 2.44); s.lineTo(-0.5, 2.44);
      const g = new THREE.ExtrudeGeometry(s, { depth: 2 * CHW - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, curveSegments: 8 });
      g.rotateY(Math.PI / 2); g.translate(-(CHW - 0.08), 0, 0); g.scale(1, 1, -1);
      const idx = g.index ? g.index.array : null;
      if (!idx) { const p = g.attributes.position, u = g.attributes.uv; for (let k = 0; k < p.count; k += 3) for (const a of [p, u]) { const sz = a.itemSize; for (let c = 0; c < sz; c++) { const t = a.array[(k + 1) * sz + c]; a.array[(k + 1) * sz + c] = a.array[(k + 2) * sz + c]; a.array[(k + 2) * sz + c] = t; } } }
      else for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
      g.computeVertexNormals();
      sideUVs(g, CZ0, CZ1, CY0, CY1);
      smoothNormals(g, 32);
      const cab = new THREE.Mesh(g, [M.cabSide, M.paint]); cab.castShadow = true; cab.receiveShadow = true; bodyG.add(cab);
      // windshield and back glass (a hair proud of the cab)
      const ws = new THREE.PlaneGeometry(2 * CHW - 0.34, 0.86);
      // (the windshield face runs (-0.5, 2.44) -> (-0.05, 3.36) in (z, y); its outward normal is (y 0.439, z -0.898))
      const wsm = add(bodyG, ws, M.glass, 0, 2.935, -0.35, Math.asin(0.439), Math.PI, 0, false);
      wsm.userData.ws = true;
      // back window
      add(bodyG, new THREE.PlaneGeometry(2 * CHW - 0.6, 0.55), new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.08, metalness: 0.3 }), 0, 3.02, 1.075, 0, 0, 0, false);
    }
    // bed walls and tailgate (the bed is open: the blower and headers stand up out of it)
    for (const sx of [-1, 1]) add(bodyG, rbox(0.1, 0.46, 1.74, 0.03), M.paint, sx * (HW - 0.06), 2.33, 1.84);
    add(bodyG, rbox(2 * HW - 0.04, 0.46, 0.1, 0.03), M.paint, 0, 2.33, 2.71);
    add(bodyG, new THREE.BoxGeometry(2 * HW - 0.2, 0.02, 1.62), M.black, 0, 2.02 + BV + 0.008, 1.84, 0, 0, 0, false);
    // hood decal
    { const d = add(bodyG, new THREE.PlaneGeometry(2.8, 2.1), M.hoodDecal, 0, 2.43 + BV, -1.45, -Math.PI / 2 + 0.039, 0, 0, false); d.receiveShadow = true; }
    // grille, headlights, bumper face, tail lights
    const grilleTex = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d1e20'; for (let k = 0; k < 9; k++) g.fillRect(250 + k * 58, 60, 40, 150);
      g.strokeStyle = '#8f9399'; g.lineWidth = 10; g.strokeRect(236, 46, 552, 178);
      g.fillStyle = '#a6ff1c'; g.font = 'italic 900 64px Impact, Arial'; g.textAlign = 'center'; g.fillText(NUM, w / 2, 150);
    });
    add(bodyG, new THREE.PlaneGeometry(2.9, 0.36), new THREE.MeshStandardMaterial({ map: grilleTex, roughness: 0.45, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 1.99, -2.82 - BV - 0.005, 0, Math.PI, 0, false);
    const heads = [];
    for (const sx of [-1, 1]) {
      const h = add(bodyG, new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24), M.head, sx * 1.36, 1.99, -2.82 - BV - 0.01, Math.PI / 2, 0, 0, false); heads.push(h);
      add(bodyG, new THREE.TorusGeometry(0.155, 0.02, 8, 24), M.chrome, sx * 1.36, 1.99, -2.82 - BV - 0.03, 0, 0, 0, false);
      add(bodyG, rbox(0.34, 0.16, 0.03, 0.02), M.tail, sx * 1.4, 1.95, 2.66 + BV + 0.01, 0, 0, 0, false);
    }
    // fender flares: a thick black lip round each wheel arch, standing out from the body sides
    M.flare = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.62, metalness: 0.1 });
    for (const za of [zF, zR]) for (const sx of [-1, 1]) {
      const pts = [], R = 1.27 - BV + 0.02;
      for (let k = 0; k <= 24; k++) {
        const ph = 0.5 + (Math.PI - 1.0) * k / 24, z = za - R * Math.cos(ph), y = 0.95 + R * Math.sin(ph);
        if (z < BZ0 - 0.05 || z > BZ1 + 0.05) continue;
        pts.push(V3(sx * (HW + 0.02), y, z));
      }
      const f = add(bodyG, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.085, 10, false), M.flare, 0, 0, 0);
      f.scale.set(1, 1, 1);
    }
    // molded bumpers, front and back
    add(bodyG, rbox(2 * HW + 0.1, 0.26, 0.3, 0.08), M.flare, 0, 1.72, -2.92 - BV + 0.08);
    add(bodyG, rbox(2 * HW + 0.1, 0.24, 0.26, 0.08), M.flare, 0, 1.78, 2.72 + BV - 0.06);
    // roof light bar and mirrors
    add(bodyG, rbox(2.1, 0.13, 0.22, 0.04), M.flare, 0, 3.62, 0.02);
    for (let k = 0; k < 6; k++) add(bodyG, rbox(0.24, 0.09, 0.03, 0.02), M.head, -0.8 + k * 0.32, 3.62, -0.1, 0, 0, 0, false);
    for (const sx of [-1, 1]) {
      tubeAB(bodyG, V3(sx * 1.5, 2.72, -0.32), V3(sx * 1.78, 2.86, -0.4), 0.018, M.flare);
      add(bodyG, rbox(0.1, 0.24, 0.3, 0.03), M.flare, sx * 1.84, 2.9, -0.42, 0, sx * 0.12, 0);
      add(bodyG, new THREE.PlaneGeometry(0.22, 0.18), M.chrome, sx * 1.84, 2.9, -0.265, 0, 0, 0, false);
    }

    // ---------------------------------------------------------------- chassis (chromoly tube frame)
    const chassis = new THREE.Group(); model.add(chassis);
    const T = (a, b, r) => tubeAB(chassis, a, b, r || 0.032, M.chassis, 10);
    // (the cage hoops round the driver's head: hidden in the cockpit view - they'd fill it)
    const hoops = new THREE.Group(); chassis.add(hoops);
    const H = (a, b) => tubeAB(hoops, a, b, 0.032, M.chassis, 10);
    const RY = 1.02, UY = 1.92, CX = 0.44;
    for (const sx of [-1, 1]) {
      const x = sx * CX;
      // main rails, kicked up at both ends
      T(V3(x, 1.3, -2.45), V3(x, RY, -1.35), 0.04); T(V3(x, RY, -1.35), V3(x, RY, 1.35), 0.04); T(V3(x, RY, 1.35), V3(x, 1.3, 2.45), 0.04);
      // upper frame over the middle, dropping to the shock towers
      T(V3(x * 1.2, UY, -1.3), V3(x * 1.2, UY, 1.5), 0.036);
      T(V3(x * 1.2, UY, -1.3), V3(x, 1.3, -2.45)); T(V3(x * 1.2, UY, 1.5), V3(x, 1.3, 2.45));
      for (const z of [-1.3, -0.55, 0.45, 1.5]) T(V3(x, RY, z), V3(x * 1.2, UY, z));
      T(V3(x, RY, -1.35), V3(x * 1.2, UY, -0.55)); T(V3(x, RY, 1.35), V3(x * 1.2, UY, 0.45));
      // the driver's cage: hoops up into the cab
      H(V3(x * 1.1, UY, -0.55), V3(x * 1.3, 3.34, -0.3)); H(V3(x * 1.1, UY, 0.45), V3(x * 1.3, 3.36, 0.62));
      H(V3(x * 1.3, 3.34, -0.3), V3(x * 1.3, 3.36, 0.62));
    }
    for (const z of [-2.45, -1.35, -0.55, 0.45, 1.35, 2.45]) T(V3(-CX, z === -2.45 || z === 2.45 ? 1.3 : RY, z), V3(CX, z === -2.45 || z === 2.45 ? 1.3 : RY, z), 0.034);
    for (const z of [-1.3, 1.5]) T(V3(-CX * 1.2, UY, z), V3(CX * 1.2, UY, z));
    H(V3(-CX * 1.3, 3.34, -0.3), V3(CX * 1.3, 3.34, -0.3)); H(V3(-CX * 1.3, 3.36, 0.62), V3(CX * 1.3, 3.36, 0.62));
    // skid plate under the driver, seat
    add(chassis, rbox(0.9, 0.02, 1.0, 0.008), M.alu, 0, RY - 0.05, 0);
    // (the seat sits high on a riser - the driver has to see over that long hood)
    add(chassis, rbox(0.56, 0.07, 0.55, 0.03), M.black, 0, 2.24, 0.12);
    add(chassis, rbox(0.56, 0.75, 0.08, 0.04), M.black, 0, 2.61, 0.4, -0.12, 0, 0);
    add(chassis, rbox(0.5, 0.34, 0.5, 0.03), M.alu, 0, 2.05, 0.12);

    // ---------------------------------------------------------------- engine: blown big-block behind the driver
    const eng = new THREE.Group(); model.add(eng);
    const ez = 1.25, ey = 1.45;
    add(eng, rbox(0.62, 0.55, 0.9, 0.05), M.alu, 0, ey, ez);                         // block + heads
    for (const sx of [-1, 1]) add(eng, rbox(0.3, 0.26, 0.86, 0.04), M.alu, sx * 0.34, ey + 0.28, ez, 0, 0, sx * 0.55);
    add(eng, rbox(0.5, 0.12, 0.8, 0.03), M.cast, 0, ey + 0.46, ez);                   // intake
    add(eng, rbox(0.4, 0.32, 0.74, 0.06), M.polish, 0, ey + 0.66, ez);                // 14-71 roots case
    add(eng, rbox(0.42, 0.06, 0.78, 0.02), M.black, 0, ey + 0.84, ez);
    // butterfly injector hat standing up through the bed
    // (a forward-facing scoop: tapered aluminium walls, a dark mouth, the butterfly plate and its linkage on top)
    { const sc = new THREE.CylinderGeometry(0.2, 0.26, 0.52, 4, 1, false); sc.rotateY(Math.PI / 4); sc.scale(1, 1, 1.25);
      add(eng, sc, M.alu, 0, ey + 1.12, ez - 0.02); }
    add(eng, rbox(0.3, 0.26, 0.05, 0.02), M.gloss, 0, ey + 1.16, ez - 0.36, 0.25, 0, 0, false);            // the mouth
    add(eng, rbox(0.3, 0.035, 0.38, 0.01), M.gloss, 0, ey + 1.39, ez - 0.02);                               // butterfly plate
    for (const sx of [-0.07, 0.07]) add(eng, cylX(0.028, 0.028, 0.012, 14), M.red, sx, ey + 1.415, ez - 0.02, 0, 0, Math.PI / 2);
    add(eng, rbox(0.34, 0.06, 0.08, 0.02), M.red, 0, ey + 0.93, ez - 0.02);                               // hat base ring
    add(eng, cylX(0.1, 0.1, 0.04, 24), M.polish, 0, ey + 0.66, ez - 0.4, 0, Math.PI / 2, 0);
    // belt drive at the front of the blower
    add(eng, rbox(0.12, 0.62, 0.08, 0.03), M.black, 0, ey + 0.33, ez - 0.46);
    // zoomie headers out through the bed sides, turned up and back
    const tips = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      const z = ez - 0.3 + k * 0.2, a = V3(sx * 0.42, ey + 0.2, z);
      const b = V3(sx * 1.0, ey + 0.45, z + 0.05), c = V3(sx * 1.55, ey + 0.9, z + 0.18), e = V3(sx * 1.66, ey + 1.32, z + 0.32);
      add(eng, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, b, c, e]), 20, 0.042, 10, false), M.header, 0, 0, 0);
      add(eng, new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12, 1, true), M.polish, e.x, e.y, e.z).quaternion.setFromUnitVectors(V3(0, 1, 0), e.clone().sub(c).normalize());
      tips.push(toRoot(e.clone().add(e.clone().sub(c).normalize().multiplyScalar(0.04))));
    }
    // transmission / transfer case under the driver, driveshafts fore and aft
    add(eng, rbox(0.34, 0.3, 0.6, 0.04), M.cast, 0, 1.1, 0.45);
    add(eng, rbox(0.3, 0.26, 0.32, 0.04), M.cast, 0, 0.98, 0.0);

    // ---------------------------------------------------------------- driver
    const driver = new THREE.Group(); model.add(driver);
    const sY = 2.28, sZ = 0.12;
    add(driver, rbox(0.38, 0.52, 0.26, 0.1), M.suit, 0, sY + 0.34, sZ + 0.08, -0.1, 0, 0);
    for (const sx of [-1, 1]) {
      add(driver, rbox(0.05, 0.52, 0.012, 0.005), M.red, sx * 0.08, sY + 0.36, sZ - 0.05, -0.1, 0, 0, false);
      tubeAB(driver, V3(sx * 0.18, sY + 0.52, sZ + 0.02), V3(sx * 0.16, sY + 0.36, sZ - 0.38), 0.045, M.suit);
      tubeAB(driver, V3(sx * 0.1, sY + 0.1, sZ - 0.05), V3(sx * 0.12, sY + 0.12, sZ - 0.55), 0.06, M.suit);
    }
    add(driver, new THREE.SphereGeometry(0.15, 24, 16), M.helmet, 0, sY + 0.74, sZ + 0.03);
    { const vg = new THREE.SphereGeometry(0.153, 24, 12, -Math.PI / 2 - 0.85, 1.7, 1.28, 0.5); add(driver, vg, M.visor, 0, sY + 0.74, sZ + 0.03, 0, 0, 0, false); }
    const eye = V3(0, sY + 0.76, sZ - 0.06);

    // ---------------------------------------------------------------- cockpit: dash, wheel, pillars (seen from the seat)
    const cage = new THREE.Group(); model.add(cage);
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 512; clusterCanvas.height = 300;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace;
    const dash = new THREE.Group(); dash.position.set(0.32, sY + 0.37, sZ - 0.7); dash.rotation.set(-0.45, -0.3, 0); cage.add(dash);
    add(dash, rbox(0.34, 0.2, 0.05, 0.02), M.black, 0, 0, -0.03);
    add(dash, new THREE.PlaneGeometry(0.31, 0.18), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0, 0.0, 0, 0, 0, false);
    const colG = new THREE.Group(); colG.position.set(0, sY + 0.28, sZ - 0.4); colG.rotation.x = -0.6; cage.add(colG);
    { const col = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 10); col.rotateX(Math.PI / 2); add(colG, col, M.polish, 0, 0, -0.15); }
    const steerWheel = new THREE.Group(); colG.add(steerWheel);
    add(steerWheel, new THREE.TorusGeometry(0.16, 0.018, 10, 32), M.black, 0, 0, 0);
    for (let k = 0; k < 3; k++) { const sp = add(steerWheel, new THREE.BoxGeometry(0.018, 0.15, 0.01), M.polish, 0, 0, 0.005); sp.rotation.z = k * 2.094; sp.geometry.translate(0, 0.075, 0); }
    add(steerWheel, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.polish, 0, 0, 0.01, Math.PI / 2, 0, 0);
    // the cab's inside from the seat: dark door panels below the windows, the headliner, the A-pillars
    const inside = new THREE.Group(); cage.add(inside);
    for (const sx of [-1, 1]) {
      add(inside, new THREE.PlaneGeometry(1.5, 0.2), M.inner, sx * 1.37, 2.54, 0.25, 0, sx * Math.PI / 2, 0, false);
      tubeAB(inside, V3(sx * 1.36, 2.46, -0.48), V3(sx * 1.36, 3.36, -0.06), 0.05, M.black);
    }
    add(inside, new THREE.PlaneGeometry(2.8, 1.0), M.inner, 0, 3.42, 0.34, Math.PI / 2, 0, 0, false);
    add(inside, rbox(2.7, 0.14, 0.34, 0.04), M.black, 0, 2.5, -0.36);            // dash top along the windshield base

    // ---------------------------------------------------------------- wheels: 66x43.00-25 on beadlocks, planetary hubs
    // tyre carcass: tall rounded sidewalls bulging past the rim, a wide flat tread
    const tyreGeo = latheX([[RRIM + 0.01, -0.5], [0.4, -0.54], [0.55, -0.545], [0.68, -0.535], [0.77, -0.505], [0.815, -0.46], [RT - 0.02, -0.39],
      [RT - 0.02, 0.39], [0.815, 0.46], [0.77, 0.505], [0.68, 0.535], [0.55, 0.545], [0.4, 0.54], [RRIM + 0.01, 0.5]], 64);
    // hand-cut paddle tread: chevron lugs across the crown and wrapping over the shoulders (mirrored for the left)
    function lugs(dir) {
      const list = [], N = 34;
      for (let k = 0; k < N; k++) {
        const phi = k * Math.PI * 2 / N;
        for (const side of [-1, 1]) {
          const b = new THREE.BoxGeometry(0.46, 0.055, 0.1);
          b.rotateY(-side * dir * 0.38); b.translate(side * 0.25, RT + 0.012, side * dir * 0.04);
          const sh = new THREE.BoxGeometry(0.12, 0.14, 0.1); sh.rotateZ(side * 0.75); sh.translate(side * 0.5, RT - 0.07, side * dir * 0.1);
          b.rotateX(phi + (side > 0 ? Math.PI / N : 0)); sh.rotateX(phi + (side > 0 ? Math.PI / N : 0)); list.push(b, sh);
        }
      }
      return mergeGeos(list);
    }
    const lugR = lugs(1), lugL = lugs(-1);
    // sidewall lettering
    const swTex = canvasTex(1024, 1024, (g, w) => {
      g.clearRect(0, 0, w, w); g.fillStyle = '#e8e8e8'; g.font = 'bold 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const txt = ['66x43.00-25', 'MONSTER PADDLE', 'HAND CUT', '16 PSI'];
      txt.forEach((t, i) => { g.save(); g.translate(w / 2, w / 2); g.rotate(i * Math.PI / 2); const R = w * 0.4;
        for (let k = 0; k < t.length; k++) { const a = (k - (t.length - 1) / 2) * 0.052; g.save(); g.rotate(a); g.translate(0, -R); g.fillText(t[k], 0, 0); g.restore(); } g.restore(); });
    });
    const swMat = new THREE.MeshStandardMaterial({ map: swTex, transparent: true, alphaTest: 0.4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    function rim(g) {
      // 25 in wheel: outer beadlock ring with bolts, deep dish, centre with the planetary hub
      const ring = new THREE.TorusGeometry(RRIM + 0.02, 0.03, 10, 56); ring.rotateY(Math.PI / 2); add(g, ring, M.polish, 0.47, 0, 0);
      const bl = new THREE.CylinderGeometry(RRIM + 0.05, RRIM + 0.05, 0.05, 56, 1, true); bl.rotateZ(Math.PI / 2); add(g, bl, M.black, 0.47, 0, 0);
      for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, n = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6); n.rotateZ(Math.PI / 2); add(g, n, M.chrome, 0.5, Math.cos(a) * (RRIM + 0.035), Math.sin(a) * (RRIM + 0.035), 0, 0, 0, false); }
      const dish = new THREE.CylinderGeometry(0.2, RRIM, 0.3, 48, 1, true); dish.rotateZ(Math.PI / 2); add(g, dish, M.polish, 0.33, 0, 0);
      const barrel = new THREE.CylinderGeometry(RRIM, RRIM, 0.95, 48, 1, true); barrel.rotateZ(Math.PI / 2); add(g, barrel, M.alu, 0, 0, 0);
      const plate = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 40); plate.rotateZ(Math.PI / 2); add(g, plate, M.polish, 0.2, 0, 0);
      const back = new THREE.CircleGeometry(RRIM, 40); back.rotateY(-Math.PI / 2); add(g, back, M.steel, -0.44, 0, 0, 0, 0, 0, false);
      // sidewall letters on the outside
      const sw = new THREE.PlaneGeometry(1.64, 1.64); sw.rotateY(Math.PI / 2); add(g, sw, swMat, 0.548, 0, 0, 0, 0, 0, false);
    }
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group();
      corner.position.set(side * HX, RT - cgH, (frontW ? zF : zR) + zOff);
      rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      // (squash: the tyre flattens and bulges when a hard landing drives it past the end of the suspension's travel)
      const squash = new THREE.Group(); flip.add(squash);
      const spin = new THREE.Group(); squash.add(spin);
      add(spin, tyreGeo, M.rubber, 0, 0, 0); add(spin, left ? lugL : lugR, M.rubber, 0, 0, 0); rim(spin);
      // planetary hub housing (steers with the wheel, doesn't spin)
      add(flip, cylX(0.2, 0.24, 0.3, 32), M.cast, 0.3, 0, 0);
      add(flip, cylX(0.14, 0.17, 0.1, 28), M.polish, 0.48, 0, 0);
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; add(flip, cylX(0.014, 0.014, 0.04, 6), M.chrome, 0.54, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0, 0, 0, false); }
      wheels.push({ corner, flip, spin, squash, left, front: frontW, side, rt: RT });
    }

    // ---------------------------------------------------------------- axles, 4-links and shocks (moved every frame)
    // Each solid axle hangs between its two wheel centres; the links run from the axle to fixed chassis mounts and the
    // shocks from the axle up to the frame, so you can watch the whole 30 in of travel.
    const dyn = new THREE.Group(); rootG.add(dyn);
    const tubeUnit = new THREE.CylinderGeometry(1, 1, 1, 12);
    const makeRod = (mat, r) => { const m = new THREE.Mesh(tubeUnit, mat); m.userData.r = r; m.castShadow = true; dyn.add(m); return m; };
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    function placeRod(m, a, b) {
      _d.subVectors(b, a); const len = _d.length();
      m.position.addVectors(a, b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / Math.max(len, 1e-6)));
      m.scale.set(m.userData.r, len, m.userData.r);
    }
    const axles = [];
    for (const zA of [zF, zR]) {
      const g = new THREE.Group(); dyn.add(g);
      add(g, cylX(0.11, 0.11, 2 * HX - 0.95, 20), M.black, 0, 0, 0);                          // housing
      add(g, new THREE.SphereGeometry(0.27, 24, 16), M.black, 0.12, -0.02, 0).scale.set(0.8, 1, 1);   // centre section
      add(g, cylX(0.2, 0.2, 0.06, 24), M.cast, 0.02, -0.02, 0);
      add(g, cylX(0.08, 0.13, 0.2, 16), M.cast, 0.12, 0, zA < 0 ? 0.28 : -0.28).rotation.set(0, Math.PI / 2, 0);   // pinion snout
      for (const sx of [-1, 1]) add(g, cylX(0.16, 0.16, 0.14, 20), M.cast, sx * (HX - 0.55), 0, 0);   // hub ends
      const front = zA < 0, dir = front ? 1 : -1;                                              // chassis side of the axle
      const links = [], shocks = [];
      for (const sx of [-1, 1]) {
        // lower link (long) and upper link, both forward/back from the axle to the frame
        links.push({ rod: makeRod(M.chassis, 0.04), ax: V3(sx * 0.62, -0.12, 0), ch: V3(sx * CX, RY, zA + dir * 1.35) });
        links.push({ rod: makeRod(M.chassis, 0.032), ax: V3(sx * 0.3, 0.2, 0), ch: V3(sx * CX * 0.6, 1.35, zA + dir * 1.0) });
        // two coil-overs and a bypass shock per side, from the axle up to the frame's shock tower
        for (const [ox, oz, col] of [[0.86, -0.12, M.blue], [0.86, 0.12, M.blue], [0.72, 0, M.red]]) {
          const top = V3(sx * (CX * 1.2 + 0.08), UY + 0.02, zA + dir * 0.55 + oz), bot = V3(sx * ox, 0.12, oz);
          const body = makeRod(M.polish, col === M.red ? 0.05 : 0.065), shaft = makeRod(M.chrome, 0.022);
          const coil = col === M.red ? null : makeRod(col, 0.1);
          const cap = makeRod(col, col === M.red ? 0.058 : 0.075);
          shocks.push({ body, shaft, coil, cap, top, bot, bypass: col === M.red });
        }
      }
      axles.push({ g, zA, links, shocks, iL: front ? 0 : 2, iR: front ? 1 : 3 });
    }
    const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Vector3();
    function afterWheels() {
      for (const ax of axles) {
        const pl = wheels[ax.iL].corner.position, pr = wheels[ax.iR].corner.position;
        // axle frame: centred between the hubs, its x axis through them
        ax.g.position.addVectors(pl, pr).multiplyScalar(0.5);
        _d.subVectors(pr, pl).normalize();
        ax.g.quaternion.setFromUnitVectors(V3(1, 0, 0), _d);
        ax.g.updateMatrix();
        _m.copy(ax.g.matrix);
        for (const l of ax.links) {
          _a.copy(l.ax).applyMatrix4(_m); _b.copy(l.ch); _b.y += -cgH; _b.z += zOff;
          placeRod(l.rod, _a, _b);
        }
        for (const s of ax.shocks) {
          _b.copy(s.top); _b.y += -cgH; _b.z += zOff;                                        // frame end (fixed)
          _a.copy(s.bot).applyMatrix4(_m);                                                    // axle end (moves)
          _d.subVectors(_a, _b); const len = _d.length(); _d.normalize();
          const bodyLen = s.bypass ? 0.62 : 0.55;
          _e.copy(_b).addScaledVector(_d, bodyLen); placeRod(s.body, _b, _e);
          placeRod(s.shaft, _e, _a);
          const c0 = _e.clone().addScaledVector(_d, 0.05);
          _e.copy(_b).addScaledVector(_d, 0.06); placeRod(s.cap, _b, _e);
          if (s.coil) placeRod(s.coil, c0.clone().addScaledVector(_d, -0.35), _a.clone().addScaledVector(_d, -Math.min(0.12, len * 0.1)));
        }
      }
    }

    // ---------------------------------------------------------------- headlights
    const headlights = [];
    for (const sx of [-1, 1]) {
      const sl = new THREE.SpotLight(0xf2f6ff, 0, 110, 0.5, 0.45, 1.4);
      sl.position.set(sx * 1.36, 1.99 - cgH, -2.9 + zOff);
      sl.target.position.set(sx * 1.6, -cgH, -45 + zOff);
      rootG.add(sl); rootG.add(sl.target); sl.visible = false; headlights.push(sl);
    }

    // ---------------------------------------------------------------- dash
    const cgx = clusterCanvas.getContext('2d');
    function drawCluster(t) {
      const g = cgx, w = 512, h = 300;
      g.fillStyle = '#050607'; g.fillRect(0, 0, w, h);
      const maxR = Math.max(1000, t.maxRpm || 8000), red = t.redline || maxR * 0.95;
      const cx = 150, cy = 160, r = 120, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = (x) => a0 + (a1 - a0) * clamp(x / maxR, 0, 1.02);
      g.strokeStyle = '#c2c6cc'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
      g.strokeStyle = '#d11'; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, r - 12, ang(red), a1); g.stroke();
      g.fillStyle = '#eee'; g.strokeStyle = '#eee'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 20px Arial';
      for (let x = 0; x <= maxR + 1; x += 1000) {
        const a = ang(x); g.lineWidth = 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); g.lineTo(cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20)); g.stroke();
        g.fillText(String(x / 1000), cx + Math.cos(a) * (r - 38), cy + Math.sin(a) * (r - 38));
      }
      g.font = '15px Arial'; g.fillStyle = '#999'; g.fillText('RPM x1000', cx, cy + 58);
      const a = ang(t.rpm); g.strokeStyle = '#ff5a1a'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.fill();
      g.fillStyle = t.shiftNow ? '#ff3a2a' : '#ffffff'; g.font = 'bold 96px Arial'; g.fillText(t.gear.replace(/^[DM]/, ''), 345, 80);
      // rear steer indicator: where the rear wheels point, and the 4WS mode
      const rs = clamp(t.rearSteer || 0, -1, 1);
      g.strokeStyle = '#6fa8c8'; g.lineWidth = 4; g.beginPath(); g.arc(440, 80, 38, Math.PI, 0); g.stroke();
      const ra = -Math.PI / 2 + rs * 1.2; g.strokeStyle = '#a6ff1c'; g.lineWidth = 6; g.beginPath(); g.moveTo(440, 80); g.lineTo(440 + Math.cos(ra) * 34, 80 + Math.sin(ra) * 34); g.stroke();
      g.font = 'bold 15px Arial'; g.fillStyle = '#a6ff1c'; g.fillText('REAR ' + (t.rsMode || ''), 440, 106);
      g.textAlign = 'left'; g.font = '16px Arial';
      const cells = [['BOOST', t.boost.toFixed(0) + ' psi'], ['OIL', Math.round(t.oil) + ' psi'], ['WATER', Math.round(t.water) + ' F'], ['MPH', String(Math.round(t.speedMph))]];
      cells.forEach(([k, v], i) => { const y = 150 + i * 30; g.fillStyle = '#6fa8c8'; g.fillText(k, 300, y); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText(v, 380, y); g.font = '16px Arial'; });
      if (!t.running) { g.fillStyle = '#ff3a2a'; g.font = 'bold 20px Arial'; g.fillText('ENGINE OFF', 300, 285); }
      clusterTex.needsUpdate = true;
    }
    function drawScreen() {}
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.paint.color.setHex(c); drawLivery(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 5 : (o.night ? 1.2 : 0.4);
      M.head.emissiveIntensity = o.headlights ? 4 : 0;
      for (const hl of headlights) { hl.visible = !!o.headlights; hl.intensity = o.headlights ? 260 : 0; }
    }
    // cockpit view: hide the driver and the cab shell around your head (you look out through where the glass is)
    const cabMeshes = bodyG.children.filter((m) => m.geometry && m.geometry.type === 'ExtrudeGeometry' && m.material && Array.isArray(m.material) && m.material[0] === M.cabSide);
    const wsMesh = bodyG.children.find((m) => m.userData.ws);
    function setInteriorVisible(v, cockpit) {
      driver.visible = !cockpit; inside.visible = !!cockpit; hoops.visible = !cockpit;
      for (const m of cabMeshes) m.visible = !cockpit;
      if (wsMesh) wsMesh.visible = !cockpit;
    }
    function setTransmission() {}
    function setTires() {}
    function setChute() {}

    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    afterWheels();
    return {
      root: rootG, model, exterior: model, interior: cage, wheels, steerWheel, eye: toRoot(eye),
      exhaustTips: tips, materials: M, headlights, tailLens: [], mirrors: [], afterWheels,
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, variant: 'monster',
    };
  }

  root.HCMonster = { build };
})(typeof self !== 'undefined' ? self : this);
