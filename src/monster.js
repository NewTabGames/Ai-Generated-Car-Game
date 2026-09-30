/* Hellcat Drive — procedural monster truck (stadium freestyle spec), in two bodies: the WRECKONING pickup (the default)
   and the AVENGER hot-rod coupe (opts.body 'avenger') - the same chassis, engine, axles and tyres under both.
   Chromoly tube chassis with the driver's cage in the middle, a supercharged big-block behind it (the blower and its
   butterfly hat stick up out of the bed, zoomie headers out of the bed sides), a 4-link on each solid axle with two
   nitrogen coil-over shocks and a bypass shock per corner - the axles, links and shocks follow the physics' 30 in of
   wheel travel every frame - planetary axles, 66x43.00-25 hand-cut tyres on beadlock rims, and a fiberglass pickup body
   (fenders arching over the tyres under black flares, a cab with real window openings - the driver sits in the cage
   behind the glass - a scooped hood, a chrome grille and sealed-beam headlights, an open bed with rails, a tailgate)
   in a livery drawn for the current paint.
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
    // (the windows are real openings: the glass is tinted and reflects the arena, and you see the driver through it)
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0x06090c, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.58, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false });
    M.lens = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 2.5, clearcoat: 1, depthWrite: false });
    M.amber = new THREE.MeshStandardMaterial({ color: 0x8a4a06, emissive: 0xff8a10, emissiveIntensity: 0.25, roughness: 0.25 });
    M.inner = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.85, side: THREE.BackSide });
    M.head = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xf4f8ff, emissiveIntensity: 0, roughness: 0.12, metalness: 0.85, side: THREE.DoubleSide });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x3a0306, emissive: 0xff1010, emissiveIntensity: 0.4, roughness: 0.25 });
    const headerTex = canvasTex(256, 16, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#6b5a3a'); gr.addColorStop(0.15, '#c9a24a'); gr.addColorStop(0.35, '#6a4a8a'); gr.addColorStop(0.5, '#2f4f9a');
      gr.addColorStop(0.7, '#8a8f99'); gr.addColorStop(1, '#b9bcc2');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    M.header = new THREE.MeshStandardMaterial({ map: headerTex, roughness: 0.28, metalness: 0.9 });

    // ---------------------------------------------------------------- the WRECKONING's body (the default)
    function bodyWreckoning() {
      // ---------------------------------------------------------------- livery (redrawn for the paint colour)
      // one canvas per body part side: top half = left side, bottom half = right side (drawn so the text reads on both)
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      const liveryTex = canvasTex(2048, 1024, () => {});
      const cabTex = canvasTex(1024, 1024, () => {});
      const hoodTex = canvasTex(1024, 632, () => {});
      const gateTex = canvasTex(1024, 144, () => {});
      // the hood decal's extent (it lies on the hood's slope, see hoodY) and width
      const HOOD_W = 3.0, HOOD_Z0 = -2.45, HOOD_Z1 = -0.6;
      // side profile extents (the livery is mapped over these)
      const BZ0 = -2.8, BZ1 = 2.66, BY0 = 1.5, BY1 = 2.58, CZ0 = -0.5, CZ1 = 1.0, CY0 = 2.44, CY1 = 3.48;
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
        // (truck z / y -> this side's picture; the right side is drawn mirrored)
        const zx = (z) => (z - BZ0) / (BZ1 - BZ0) * W, yy = (y) => (1 - (y - BY0) / (BY1 - BY0)) * H;
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
          // the door's shut line (the cab sits on it), and a claw slash across it between the wheel arches
          g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 5;
          g.beginPath(); g.moveTo(zx(-0.32), yy(1.5)); g.lineTo(zx(-0.32), yy(2.46)); g.quadraticCurveTo(zx(-0.32), yy(2.53), zx(-0.25), yy(2.53));
          g.lineTo(zx(0.85), yy(2.53)); g.quadraticCurveTo(zx(0.92), yy(2.53), zx(0.92), yy(2.46)); g.lineTo(zx(0.92), yy(1.5)); g.stroke();
          g.fillStyle = '#0b0b0c'; g.strokeStyle = '#a6ff1c'; g.lineWidth = 10;
          claw(g, zx(-0.12), yy(1.92), 0.62, false);
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
          // (along the beltline above the wheel arches, where the flares don't cover it; decals on the bed side behind)
          const X = (z) => (side ? W - zx(z) : zx(z));
          g.font = 'italic 900 138px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineJoin = 'round'; g.lineWidth = 24; g.strokeStyle = '#0b0b0c'; g.strokeText(NAME, X(-0.72), yy(2.41), zx(1.0) - zx(-2.45));
          g.lineWidth = 9; g.strokeStyle = '#a6ff1c'; g.strokeText(NAME, X(-0.72), yy(2.41), zx(1.0) - zx(-2.45));
          g.fillStyle = '#ffffff'; g.fillText(NAME, X(-0.72), yy(2.41), zx(1.0) - zx(-2.45));
          g.restore();
        }
        liveryTex.needsUpdate = true;
        // cab sides: window openings (dark), the number
        const c2 = cabTex.userData.canvas, g2 = c2.getContext('2d'), H2 = c2.height / 2, W2 = c2.width;
        for (let side = 0; side < 2; side++) {
          g2.save(); g2.translate(0, side * H2);
          if (side === 1) { g2.translate(W2, 0); g2.scale(-1, 1); }
          g2.fillStyle = P; g2.fillRect(0, 0, W2, H2);
          g2.fillStyle = '#0d0d0e'; g2.fillRect(0, H2 * 0.955, W2, H2 * 0.045);
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
        // hood (seen from above, front at the top): the panel gaps, twin stripes either side of the scoop, claw slashes
        // outboard of them, road dirt near the front edge
        const c3 = hoodTex.userData.canvas, g3 = c3.getContext('2d'), HWc = c3.width, HHc = c3.height;
        const hx = (x) => (x + HOOD_W / 2) / HOOD_W * HWc, hz = (z) => (z - HOOD_Z0) / (HOOD_Z1 - HOOD_Z0) * HHc;
        g3.clearRect(0, 0, HWc, HHc);
        g3.strokeStyle = 'rgba(0,0,0,0.6)'; g3.lineWidth = 4;
        g3.beginPath(); g3.moveTo(hx(-1.32), hz(-0.62)); g3.lineTo(hx(-1.32), hz(-2.36)); g3.quadraticCurveTo(hx(-1.32), hz(-2.42), hx(-1.24), hz(-2.42));
        g3.lineTo(hx(1.24), hz(-2.42)); g3.quadraticCurveTo(hx(1.32), hz(-2.42), hx(1.32), hz(-2.36)); g3.lineTo(hx(1.32), hz(-0.62)); g3.lineTo(hx(-1.32), hz(-0.62)); g3.stroke();
        for (const sx of [-1, 1]) {
          const x0 = hx(sx < 0 ? -0.86 : 0.64), x1 = hx(sx < 0 ? -0.64 : 0.86);
          g3.fillStyle = '#0b0b0c'; g3.fillRect(x0 - 6, hz(-2.4), x1 - x0 + 12, hz(-0.64) - hz(-2.4));
          g3.fillStyle = '#a6ff1c'; g3.fillRect(x0, hz(-2.4), x1 - x0, hz(-0.64) - hz(-2.4));
          g3.fillStyle = '#0b0b0c'; g3.fillRect((x0 + x1) / 2 - 3, hz(-2.4), 6, hz(-0.64) - hz(-2.4));
        }
        g3.fillStyle = '#0b0b0c'; g3.strokeStyle = '#a6ff1c'; g3.lineWidth = 10;
        claw(g3, hx(-1.2), hz(-1.2), 0.62, false); claw(g3, hx(1.2), hz(-1.2), 0.62, true);
        let sd3 = 4321; const r3 = () => ((sd3 = (sd3 * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 160; k++) {
          const x = r3() * HWc, y = hz(-2.42) + Math.pow(r3(), 2.2) * 0.35 * HHc, r = 2 + r3() * r3() * 10;
          g3.fillStyle = `rgba(${62 + r3() * 20 | 0},${40 + r3() * 12 | 0},${24 + r3() * 8 | 0},${0.6 + r3() * 0.4})`;
          g3.beginPath(); g3.ellipse(x, y, r * (1 + r3()), r, r3() * 3, 0, 7); g3.fill();
        }
        hoodTex.needsUpdate = true;
        // tailgate: the name, big, between claw slashes
        const c4 = gateTex.userData.canvas, g4 = c4.getContext('2d'), W4 = c4.width, H4 = c4.height;
        g4.clearRect(0, 0, W4, H4);
        g4.fillStyle = '#0b0b0c'; g4.strokeStyle = '#a6ff1c'; g4.lineWidth = 8;
        claw(g4, 70, H4 / 2, 0.42, false); claw(g4, W4 - 70, H4 / 2, 0.42, true);
        g4.font = 'italic 900 118px Impact, "Arial Black", Arial'; g4.textAlign = 'center'; g4.textBaseline = 'middle'; g4.lineJoin = 'round';
        g4.lineWidth = 20; g4.strokeStyle = '#0b0b0c'; g4.strokeText(NAME, W4 / 2, H4 / 2 + 4, W4 * 0.72);
        g4.lineWidth = 7; g4.strokeStyle = '#a6ff1c'; g4.strokeText(NAME, W4 / 2, H4 / 2 + 4, W4 * 0.72);
        g4.fillStyle = '#ffffff'; g4.fillText(NAME, W4 / 2, H4 / 2 + 4, W4 * 0.72);
        gateTex.needsUpdate = true;
      }
      function shade(c, k) { const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k; return `rgb(${r | 0},${g | 0},${b | 0})`; }
      M.livery = new THREE.MeshPhysicalMaterial({ map: liveryTex, metalness: 0.1, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.12 });
      M.cabSide = new THREE.MeshPhysicalMaterial({ map: cabTex, metalness: 0.1, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.12 });
      M.hoodDecal = new THREE.MeshPhysicalMaterial({ map: hoodTex, transparent: true, alphaTest: 0.35, metalness: 0.2, roughness: 0.35, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      M.gateDecal = new THREE.MeshPhysicalMaterial({ map: gateTex, transparent: true, alphaTest: 0.35, metalness: 0.2, roughness: 0.35, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
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
      // (side: a single panel on that side - its inner face goes onto the cab canvas' dark strip)
      function sideUVs(g, z0, z1, y0, y1, side) {
        const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const nx = n.getX(i);
          if (Math.abs(nx) < 0.7) continue;
          if (side && nx * side < 0) { uv.setXY(i, 0.5, 0.505); continue; }
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
      // a (z, y) profile extruded across the truck: from x0, depth + 2 bevels thick
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
      function rrect(sh, x0, y0, x1, y1, r) {
        sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1);
        sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0); return sh;
      }
      // cab: a fiberglass shell with real openings (windshield, side windows, back glass) - the driver in the cage shows
      // through them. Side panels (the profile with the window cut out), the roof, the back wall and a frame round the
      // raked windshield; dark inside
      const cabG = new THREE.Group(); bodyG.add(cabG);
      const CHW = 1.46;
      {
        const side = new THREE.Shape();
        side.moveTo(-0.5, 2.44); side.lineTo(-0.05, 3.36); side.quadraticCurveTo(0.02, 3.48, 0.18, 3.48); side.lineTo(0.84, 3.48);
        side.quadraticCurveTo(0.96, 3.48, 0.97, 3.36); side.lineTo(1.0, 2.44); side.lineTo(-0.5, 2.44);
        const win = new THREE.Path(); win.moveTo(-0.2, 2.62); win.lineTo(0.84, 2.62); win.lineTo(0.8, 3.32); win.lineTo(0.12, 3.3); win.lineTo(-0.2, 2.62);
        side.holes.push(win);
        for (const sx of [-1, 1]) {
          const g = alongX(side, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.04, bevelSegments: 3, curveSegments: 8 }, sx < 0 ? -CHW : CHW - 0.07);
          sideUVs(g, CZ0, CZ1, CY0, CY1, sx);
          smoothNormals(g, 32);
          const m = new THREE.Mesh(g, [M.cabSide, M.paint]); m.castShadow = true; m.receiveShadow = true; cabG.add(m);
        }
        // roof: a shell following the cab's top line from the windshield header back
        const roof = new THREE.Shape();
        roof.moveTo(-0.05, 3.36); roof.quadraticCurveTo(0.02, 3.48, 0.18, 3.48); roof.lineTo(0.84, 3.48); roof.quadraticCurveTo(0.96, 3.48, 0.97, 3.36);
        roof.lineTo(0.9, 3.36); roof.quadraticCurveTo(0.89, 3.43, 0.8, 3.43); roof.lineTo(0.2, 3.43); roof.quadraticCurveTo(0.07, 3.43, 0.02, 3.36); roof.lineTo(-0.05, 3.36);
        const rg = alongX(roof, { depth: 2 * CHW - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 8 }, -CHW);
        smoothNormals(rg, 32);
        add(cabG, rg, M.paint, 0, 0, 0);
        // back wall with the back glass (leaning forward a touch at the top), a dark liner on its inside
        const bwG = new THREE.Group(); bwG.position.set(0, 2.44, 0.955); bwG.rotation.x = -0.033; cabG.add(bwG);
        const bw = new THREE.Shape(); bw.moveTo(-CHW, 0); bw.lineTo(CHW, 0); bw.lineTo(CHW, 0.8); bw.quadraticCurveTo(CHW, 0.92, CHW - 0.12, 0.92);
        bw.lineTo(-CHW + 0.12, 0.92); bw.quadraticCurveTo(-CHW, 0.92, -CHW, 0.8); bw.lineTo(-CHW, 0);
        const bwin = new THREE.Path(); rrect(bwin, -1.1, 0.36, 1.1, 0.82, 0.07); bw.holes.push(bwin);
        add(bwG, new THREE.ExtrudeGeometry(bw, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 3, curveSegments: 6 }), M.paint, 0, 0, 0);
        add(bwG, new THREE.ShapeGeometry(bw), M.black, 0, 0, -0.025, 0, Math.PI, 0, false);
        add(bwG, new THREE.PlaneGeometry(2.24, 0.5), M.glass, 0, 0.59, 0.015, 0, 0, 0, false);
        // windshield: the frame (body colour) and a black gasket round the glass, and the wipers parked at its foot.
        // (its face runs (z -0.5, y 2.44) -> (-0.05, 3.36): 1.02 m long, raked back 26 deg; local y up the glass, z inwards)
        const wsG = new THREE.Group(); wsG.position.set(0, 2.9 + 0.439 * 0.03, -0.275 - 0.898 * 0.03); wsG.rotation.x = 0.4545; cabG.add(wsG);
        const fr = rrect(new THREE.Shape(), -CHW - 0.01, -0.53, CHW + 0.01, 0.53, 0.07); fr.holes.push(rrect(new THREE.Path(), -1.31, -0.44, 1.31, 0.44, 0.06));
        add(wsG, new THREE.ExtrudeGeometry(fr, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 6 }), M.paint, 0, 0, -0.02);
        const gk = rrect(new THREE.Shape(), -1.31, -0.44, 1.31, 0.44, 0.06); gk.holes.push(rrect(new THREE.Path(), -1.28, -0.415, 1.28, 0.415, 0.05));
        add(wsG, new THREE.ExtrudeGeometry(gk, { depth: 0.02, bevelEnabled: false }), M.black, 0, 0, -0.03, 0, 0, 0, false);
        const wsm = add(wsG, new THREE.PlaneGeometry(2.6, 0.86), M.glass, 0, 0, -0.012, 0, 0, 0, false);
        wsm.userData.ws = true;
        // (the sun strip: the truck's name across the top of the glass)
        const stripTex = canvasTex(1024, 64, (g, w, h) => {
          g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, w, h); g.fillStyle = '#a6ff1c';
          g.font = 'italic 900 50px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(NAME, w / 2, h / 2 + 2);
        });
        add(wsG, new THREE.PlaneGeometry(2.56, 0.15), new THREE.MeshStandardMaterial({ map: stripTex, roughness: 0.3, side: THREE.DoubleSide }), 0, 0.33, -0.016, 0, Math.PI, 0, false);
        for (const [x, a] of [[-0.62, 0.12], [0.34, 0.12]]) {
          const w = add(wsG, new THREE.BoxGeometry(0.78, 0.018, 0.015), M.black, x, -0.36, -0.045, 0, 0, a, false);
          add(w, new THREE.BoxGeometry(0.74, 0.03, 0.008), M.black, 0.01, 0.005, -0.008, 0, 0, 0, false);
        }
        // inside: dash along the windshield's foot, headliner, the floor (hides the body's top under the cab)
        add(cabG, rbox(2.6, 0.12, 0.2, 0.03), M.black, 0, 2.66, -0.25);
        add(cabG, new THREE.PlaneGeometry(2 * CHW - 0.12, 0.92), M.black, 0, 3.37, 0.44, Math.PI / 2, 0, 0, false);
        add(bodyG, new THREE.PlaneGeometry(2 * CHW - 0.08, 1.46), M.black, 0, 2.575, 0.25, -Math.PI / 2, 0, 0, false);
      }
      // bed walls, the tailgate between the bed's rear pillars (tail lamps in them), bed rails; the blower and headers
      // stand up out of the open bed; aluminium tread plate on the floor
      for (const sx of [-1, 1]) {
        add(bodyG, rbox(0.1, 0.46, 1.74, 0.03), M.paint, sx * (HW - 0.06), 2.33, 1.84);
        add(bodyG, rbox(0.18, 0.46, 0.1, 0.03), M.paint, sx * (HW - 0.09), 2.33, 2.71);
        add(bodyG, rbox(0.15, 0.38, 0.02, 0.01), M.black, sx * (HW - 0.09), 2.33, 2.765, 0, 0, 0, false);
        add(bodyG, rbox(0.12, 0.34, 0.03, 0.012), M.tail, sx * (HW - 0.09), 2.33, 2.775, 0, 0, 0, false);
        const R = (a, b, r) => tubeAB(bodyG, a, b, r, M.chassis, 10);
        R(V3(sx * (HW - 0.06), 2.64, 1.0), V3(sx * (HW - 0.06), 2.64, 2.68), 0.026);
        for (const z of [1.05, 1.84, 2.62]) R(V3(sx * (HW - 0.06), 2.555, z), V3(sx * (HW - 0.06), 2.64, z), 0.018);
      }
      add(bodyG, rbox(2 * HW - 0.36, 0.46, 0.1, 0.03), M.paint, 0, 2.33, 2.71);
      {
        const decTex = canvasTex(1024, 128, (g, w, h) => {
          g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
          [['METHANOL', '#ffd21a', '#111'], ['NITRO SHOCKS', '#d81e1e', '#fff'], ['540 BLOWN', '#f4f4f0', '#111']].forEach(([t, bg, fg], k) => {
            const x = 12 + k * 340, bw = 316;
            g.fillStyle = '#0b0b0c'; g.fillRect(x - 6, 14, bw + 12, h - 28); g.fillStyle = bg; g.fillRect(x, 20, bw, h - 40);
            g.fillStyle = fg; g.font = 'italic 900 58px Impact, "Arial Black", Arial'; g.fillText(t, x + bw / 2, h / 2 + 2, bw - 24);
          });
        });
        const decMat = new THREE.MeshStandardMaterial({ map: decTex, transparent: true, alphaTest: 0.3, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
        for (const sx of [-1, 1]) add(bodyG, new THREE.PlaneGeometry(1.5, 0.19), decMat, sx * (HW + 0.002), 2.36, 1.86, 0, sx * Math.PI / 2, 0, false);
      }
      add(bodyG, new THREE.PlaneGeometry(2.9, 0.41), M.gateDecal, 0, 2.33, 2.768, 0, 0, 0, false);
      {
        const plateTex = canvasTex(128, 128, (g, w, h) => {
          g.fillStyle = '#8d9197'; g.fillRect(0, 0, w, h);
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const cx = x * 32 + (y & 1) * 16 + 8, cy = y * 32 + 16, a = (y & 1) ? 0.6 : -0.6;
            g.save(); g.translate(cx, cy); g.rotate(a);
            g.fillStyle = '#c9ccd1'; g.fillRect(-11, -3, 22, 4); g.fillStyle = '#5b5f65'; g.fillRect(-11, 1, 22, 2); g.restore();
          }
        });
        plateTex.wrapS = plateTex.wrapT = THREE.RepeatWrapping; plateTex.repeat.set(10, 5);
        M.plate = new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.8, roughness: 0.35 });
        add(bodyG, new THREE.BoxGeometry(2 * HW - 0.2, 0.02, 1.62), M.plate, 0, 2.02 + BV + 0.008, 1.84, 0, 0, 0, false);
      }
      // hood: the decal lies on the hood's slope; a raised scoop down the middle with a dark mesh mouth
      const hoodY = (z) => 2.49 + (z + 2.3) * 0.0389;
      { const d = add(bodyG, new THREE.PlaneGeometry(HOOD_W, HOOD_Z1 - HOOD_Z0), M.hoodDecal, 0, hoodY((HOOD_Z0 + HOOD_Z1) / 2) + 0.005, (HOOD_Z0 + HOOD_Z1) / 2, -Math.PI / 2 - 0.0389, 0, 0, false); d.receiveShadow = true; }
      const meshTex = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = '#050506'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2a2c30'; g.lineWidth = 2;
        for (let y = 0; y < 5; y++) for (let x = 0; x < 18; x++) {
          const cx = x * 15 + (y & 1) * 7.5, cy = y * 13 + 6; g.beginPath();
          for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); } g.stroke();
        }
      });
      M.mesh = new THREE.MeshStandardMaterial({ map: meshTex, roughness: 0.6, metalness: 0.5 });
      {
        const P = [[-2.0, -0.03], [-2.0, 0.12], [-1.93, 0.16], [-0.8, 0.14], [-0.64, 0.06], [-0.58, -0.03]];
        const sc = new THREE.Shape(); sc.moveTo(P[0][0], hoodY(P[0][0]) + P[0][1]);
        for (let i = 1; i < P.length; i++) sc.lineTo(P[i][0], hoodY(P[i][0]) + P[i][1]);
        sc.lineTo(P[0][0], hoodY(P[0][0]) + P[0][1]);
        const g = alongX(sc, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.03, bevelSegments: 3, curveSegments: 4 }, -0.56);
        smoothNormals(g, 35);
        add(bodyG, g, M.gloss, 0, 0, 0);
        add(bodyG, new THREE.PlaneGeometry(0.94, 0.1), M.mesh, 0, hoodY(-2.0) + 0.055, -2.0 - 0.034, 0, Math.PI, 0, false);
      }
      // front: a chrome-framed grille with bars and the number badge, sealed-beam headlights in square chrome bezels
      // (they stand proud of the fiberglass), amber signals and red tow hooks on the bumper
      const FZ = -2.915, GY = 1.95;
      {
        add(bodyG, new THREE.PlaneGeometry(2.08, 0.24), M.mesh, 0, GY, FZ - 0.004, 0, Math.PI, 0, false);
        const gs = rrect(new THREE.Shape(), -1.1, -0.155, 1.1, 0.155, 0.05); gs.holes.push(rrect(new THREE.Path(), -1.03, -0.11, 1.03, 0.11, 0.03));
        add(bodyG, new THREE.ExtrudeGeometry(gs, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 }), M.chrome, 0, GY, FZ - 0.042);
        for (const y of [-0.055, 0, 0.055]) add(bodyG, new THREE.BoxGeometry(2.06, 0.02, 0.025), M.chrome, 0, GY + y, FZ - 0.03, 0, 0, 0, false);
        const badgeTex = canvasTex(128, 48, (g, w, h) => {
          g.fillStyle = '#a6ff1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#0b0b0c';
          g.font = 'italic 900 40px Impact, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(NUM, w / 2, h / 2 + 2);
        });
        add(bodyG, rbox(0.3, 0.12, 0.03, 0.012), M.black, 0, GY, FZ - 0.05, 0, 0, 0, false);
        add(bodyG, new THREE.PlaneGeometry(0.27, 0.1), new THREE.MeshStandardMaterial({ map: badgeTex, roughness: 0.35, metalness: 0.2 }), 0, GY, FZ - 0.0665, 0, Math.PI, 0, false);
        // headlights: reflector cup (glows), bulb, domed lens, bezel
        const cup = new THREE.LatheGeometry([[0.02, 0.058], [0.05, 0.05], [0.085, 0.032], [0.112, 0.012], [0.124, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
        cup.rotateX(Math.PI / 2);
        const bz = rrect(new THREE.Shape(), -0.165, -0.155, 0.165, 0.155, 0.05); { const h = new THREE.Path(); h.absarc(0, 0, 0.127, 0, Math.PI * 2, false); bz.holes.push(h); }
        const bezelGeo = new THREE.ExtrudeGeometry(bz, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 20 });
        const lensGeo = new THREE.SphereGeometry(0.3, 28, 6, 0, Math.PI * 2, 0, Math.asin(0.127 / 0.3)); lensGeo.rotateX(-Math.PI / 2);
        for (const sx of [-1, 1]) {
          const x = sx * 1.32;
          add(bodyG, bezelGeo, M.chrome, x, GY, FZ - 0.06);
          add(bodyG, cup, M.head, x, GY, FZ - 0.068, 0, 0, 0, false);
          add(bodyG, new THREE.SphereGeometry(0.02, 12, 8), M.chrome, x, GY, FZ - 0.03, 0, 0, 0, false);
          add(bodyG, lensGeo, M.lens, x, GY, FZ - 0.07 + 0.3 * Math.cos(Math.asin(0.127 / 0.3)), 0, 0, 0, false);
          add(bodyG, rbox(0.22, 0.07, 0.03, 0.015), M.amber, sx * 1.4, 1.64, -3.105, 0, 0, 0, false);
          const hook = new THREE.TorusGeometry(0.055, 0.017, 8, 16, Math.PI); hook.rotateX(-Math.PI / 2); hook.rotateZ(Math.PI / 2);
          add(bodyG, hook, M.red, sx * 0.86, 1.55, -3.07);
        }
        // (the rear: the old lamps low on the body become brake / reverse lights)
        for (const sx of [-1, 1]) add(bodyG, rbox(0.34, 0.16, 0.03, 0.02), M.tail, sx * 1.4, 1.95, 2.66 + BV + 0.01, 0, 0, 0, false);
      }
      // fender flares: a flat black band round each wheel arch, standing proud of the body side (trimmed to the body's length)
      M.flare = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.62, metalness: 0.1 });
      for (const za of [zF, zR]) for (const sx of [-1, 1]) {
        const Ri = 1.16, Ro = 1.33, cy = 0.95, lim = (zEnd) => Math.acos(clamp(Math.abs(zEnd - za) / Ro, 0, 1));
        const t0 = Math.max(0.42, za > 0 ? lim(BZ1 + BV - 0.03) : 0), t1 = Math.PI - Math.max(0.42, za < 0 ? lim(BZ0 - BV + 0.03) : 0);
        const sh = new THREE.Shape(); sh.absarc(za, cy, Ro, t0, t1, false); sh.absarc(za, cy, Ri, t1, t0, true);
        const g = alongX(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.022, bevelSegments: 3, curveSegments: 40 }, sx < 0 ? -HW - 0.09 : HW - 0.02);
        smoothNormals(g, 40);
        add(bodyG, g, M.flare, 0, 0, 0);
      }
      // molded bumpers, front and back
      add(bodyG, rbox(2 * HW + 0.1, 0.26, 0.3, 0.08), M.flare, 0, 1.64, -2.92 - BV + 0.08);
      add(bodyG, rbox(2 * HW + 0.1, 0.24, 0.26, 0.08), M.flare, 0, 1.72, 2.72 + BV - 0.06);
      // door handles
      for (const sx of [-1, 1]) add(bodyG, rbox(0.03, 0.045, 0.17, 0.012), M.chrome, sx * (HW + 0.004), 2.37, 0.74, 0, 0, 0, false);
      // roof light bar and mirrors
      add(bodyG, rbox(2.1, 0.13, 0.22, 0.04), M.flare, 0, 3.62, 0.02);
      for (let k = 0; k < 6; k++) add(bodyG, rbox(0.24, 0.09, 0.03, 0.02), M.head, -0.8 + k * 0.32, 3.62, -0.1, 0, 0, 0, false);
      for (const sx of [-1, 1]) {
        tubeAB(bodyG, V3(sx * 1.5, 2.72, -0.32), V3(sx * 1.78, 2.86, -0.4), 0.018, M.flare);
        add(bodyG, rbox(0.08, 0.28, 0.19, 0.03), M.flare, sx * 1.84, 2.92, -0.42, 0, sx * 0.12, 0);
        add(bodyG, new THREE.PlaneGeometry(0.15, 0.24), M.chrome, sx * 1.84, 2.92, -0.322, 0, sx * 0.12, 0, false);
      }
      return { cabG, repaint: drawLivery };
    }

    // ---------------------------------------------------------------- the AVENGER's body
    // A rounded hot-rod coupe in lime green: a long crowned hood falling to a blunt nose with an oval chrome grille, big
    // round fenders over all four tyres, a bubble cab with dark glass (a front door window and a quarter window each side)
    // running back in a fastback onto a long rounded deck; yellow-to-orange flames outlined in red licking back from the
    // nose and forward off the tail, the name arched across the doors in flame letters over a wall of stickers.
    // Lofted from cross-sections (superellipses) along the truck; the livery is painted on a canvas and mapped per
    // triangle: sideways faces take the side art at their (z, y), upward faces the top-view art at their (z, x).
    function bodyAvenger() {
      const bodyG = new THREE.Group(); model.add(bodyG);
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      const shade = (c, k) => `rgb(${Math.min(255, ((c >> 16) & 255) * k) | 0},${Math.min(255, ((c >> 8) & 255) * k) | 0},${Math.min(255, (c & 255) * k) | 0})`;
      M.chassis.color.setHex(0xb7bcc2);                         // (a silver chassis under this one)
      const tbl = (t, z) => { if (z <= t[0][0]) return t[0][1]; for (let i = 1; i < t.length; i++) if (z <= t[i][0]) { const a = t[i - 1], b = t[i], u = (z - a[0]) / (b[0] - a[0]); const s = u * u * (3 - 2 * u); return a[1] + (b[1] - a[1]) * (0.35 * u + 0.65 * s); } return t[t.length - 1][1]; };
      const archY = (z) => { let y = 1.55 + Math.max(0, -2.7 - z) * 0.45 + Math.max(0, z - 2.6) * 0.6; for (const za of [zF, zR]) { const d = z - za; if (Math.abs(d) < 1.27) y = Math.max(y, 0.95 + Math.sqrt(1.27 * 1.27 - d * d)); } return y; };
      const TOP = [[-3.0, 2.14], [-2.97, 2.28], [-2.88, 2.38], [-2.6, 2.45], [-2.0, 2.51], [-1.2, 2.57], [-0.62, 2.63], [1.2, 2.65], [1.6, 2.59], [2.0, 2.5], [2.35, 2.38], [2.6, 2.22], [2.76, 2.04], [2.85, 1.84]];
      const HWT = [[-3.0, 1.2], [-2.93, 1.42], [-2.75, 1.6], [-2.4, 1.68], [-1.9, 1.7], [2.2, 1.7], [2.55, 1.64], [2.75, 1.5], [2.85, 1.26]];
      const BZ0 = -3.05, BZ1 = 2.9, BY0 = 1.45, BY1 = 2.76, TW = 1.95;       // (the livery canvas' extents)
      // a loft: rings of N points (superellipse, rounder on top) at each z of zs; caps at both ends
      function loft(zs, sec, N) {
        const pos = [], idx = [];
        for (const z of zs) { const s = sec(z), yc = (s.yb + s.yt) / 2, hh = (s.yt - s.yb) / 2;
          for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), e = 2 / (sn >= 0 ? s.nT : s.nB);
            pos.push((s.xc || 0) + s.w * Math.sign(c) * Math.pow(Math.abs(c), 2 / (sn >= 0 ? s.nT : s.nB) * 1), yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), e), z); } }
        for (let r = 0; r < zs.length - 1; r++) for (let k = 0; k < N; k++) { const a = r * N + k, b = r * N + (k + 1) % N, c = a + N, d = b + N; idx.push(a, b, c, b, d, c); }
        for (const [ri, flip] of [[0, true], [zs.length - 1, false]]) {                   // (caps on their own vertices: a sharp edge)
          const base = pos.length / 3, z = zs[ri], s = sec(z);
          pos.push(s.xc || 0, (s.yb + s.yt) / 2, z);
          for (let k = 0; k < N; k++) pos.push(pos[(ri * N + k) * 3], pos[(ri * N + k) * 3 + 1], z);
          for (let k = 0; k < N; k++) { const p = base + 1 + k, q = base + 1 + (k + 1) % N; if (flip) idx.push(base, q, p); else idx.push(base, p, q); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
      }
      const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
      // per-triangle UVs onto a canvas laid out in regions; kind(n, c) -> 'L' / 'R' / 'T' / 'P' (plain) / 'D' (dark)
      function mapUV(g0, W, H, place, kind) {
        const g = g0.toNonIndexed(), p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
        for (let t = 0; t < p.count; t += 3) {
          let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
          for (let j = 0; j < 3; j++) { nx += n.getX(t + j); ny += n.getY(t + j); nz += n.getZ(t + j); cx += p.getX(t + j) / 3; cy += p.getY(t + j) / 3; cz += p.getZ(t + j) / 3; }
          const l = Math.hypot(nx, ny, nz) || 1, k = kind(nx / l, ny / l, nz / l, cx, cy, cz);
          for (let j = 0; j < 3; j++) { const [px, py] = place(k, p.getX(t + j), p.getY(t + j), p.getZ(t + j)); uv[(t + j) * 2] = px / W; uv[(t + j) * 2 + 1] = 1 - py / H; }
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
      }
      // the livery canvas: rows 0-800 the left side, 800-1600 the right side (mirrored), 1600-2048 the top seen from above
      const LW = 2048, LH = 2048, HS = 800;
      const livTex = canvasTex(LW, LH, () => {});
      const kx = LW / (BZ1 - BZ0), ky = HS / (BY1 - BY0);
      const zx = (z) => (z - BZ0) * kx, yy = (y) => (BY1 - y) * ky;
      const placeBody = (k, x, y, z) => k === 'L' ? [zx(z), yy(y)] : k === 'R' ? [LW - zx(z), HS + yy(y)] : k === 'T' ? [zx(z), 2 * HS + (x + TW) / (2 * TW) * (LH - 2 * HS)] : k === 'D' ? [6, LH - 6] : [LW - 6, LH - 6];
      const kindBody = (nx, ny, nz, cx, cy) => (ny < -0.5 ? 'D' : Math.abs(nx) >= 0.5 ? (nx < 0 ? 'L' : 'R') : ny >= 0.45 ? 'T' : 'P');
      // flames: a comb of licks from a front edge (x0, y0..y1) back to tips - in canvas px, drawn in a (z, y) frame
      function flames(g, tipsZY, z0, y0, y1, dir) {
        g.beginPath(); g.moveTo(zx(z0), yy(y1));
        let prevY = y1;
        tipsZY.forEach(([tz, ty], i) => {
          const nz = tipsZY[i + 1] ? z0 + (tz - z0) * 0.38 + (tipsZY[i + 1][0] - z0) * 0.08 : z0, ny = tipsZY[i + 1] ? (ty + tipsZY[i + 1][1]) / 2 : y0;
          g.bezierCurveTo(zx(z0 + (tz - z0) * 0.45), yy(prevY + (ty - prevY) * 0.1), zx(tz - (tz - z0) * 0.25 * dir * dir), yy(ty + 0.06), zx(tz), yy(ty));
          g.bezierCurveTo(zx(tz - (tz - z0) * 0.3), yy(ty - 0.02), zx(nz + (tz - nz) * 0.2), yy(ny), zx(nz), yy(ny));
          prevY = ny;
        });
        g.lineTo(zx(z0), yy(y0)); g.closePath();
        const gr = g.createLinearGradient(zx(z0), 0, zx(tipsZY.reduce((m, t) => (Math.abs(t[0] - z0) > Math.abs(m - z0) ? t[0] : m), z0)), 0);
        gr.addColorStop(0, '#fff45a'); gr.addColorStop(0.35, '#ffd21a'); gr.addColorStop(0.7, '#ff8a1a'); gr.addColorStop(1, '#f2461c');
        g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#4a0707'; g.stroke();
        g.lineWidth = 11; g.strokeStyle = '#d8141a'; g.stroke(); g.fillStyle = gr; g.fill();
      }
      const FL_SIDE = [[-2.05, 2.28], [-1.55, 1.98], [-1.1, 2.2], [-0.75, 1.86], [-0.45, 2.1], [-0.2, 1.8], [-0.62, 1.66]];
      const FL_TAIL = [[1.85, 2.3], [1.5, 2.02], [1.2, 2.2], [1.0, 1.9], [1.35, 1.75]];
      function drawAvenger(paint) {
        const P = hex(paint), c = livTex.userData.canvas, g = c.getContext('2d');
        for (let s = 0; s < 2; s++) {
          g.save(); g.translate(0, s * HS); if (s === 1) { g.translate(LW, 0); g.scale(-1, 1); }
          const gr = g.createLinearGradient(0, 0, 0, HS); gr.addColorStop(0, shade(paint, 1.08)); gr.addColorStop(0.55, P); gr.addColorStop(1, shade(paint, 0.62));
          g.fillStyle = gr; g.fillRect(0, 0, LW, HS);
          flames(g, FL_SIDE, BZ0, 1.62, 2.4, 1);
          flames(g, FL_TAIL.map(([z, y]) => [z, y]), BZ1, 1.66, 2.36, -1);
          // the sticker wall under the name (no brands: coloured patches with lettering bars, a few round ones)
          let sd = 4242 + s; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
          const cols = ['#f4f4f4', '#111111', '#ffd21a', '#1f4fd1', '#f2570f', '#d8141a', '#2f9e44', '#8a2be2'];
          for (let row = 0; row < 3; row++) for (let k = 0; k < 7; k++) {
            const z = -0.42 + k * 0.14 + (row & 1) * 0.06 + (rnd() - 0.5) * 0.03, y = 1.92 - row * 0.11, w = 0.1 + rnd() * 0.04, h = 0.075, c0 = cols[Math.floor(rnd() * cols.length)];
            g.fillStyle = '#111'; g.fillStyle = c0;
            if (rnd() < 0.25) { g.beginPath(); g.ellipse(zx(z + w / 2), yy(y + h / 2), w / 2 * kx, h / 2 * ky, 0, 0, 7); g.fill(); g.lineWidth = 3; g.strokeStyle = '#111'; g.stroke(); }
            else { g.fillRect(zx(z), yy(y + h), w * kx, h * ky); g.lineWidth = 3; g.strokeStyle = '#111'; g.strokeRect(zx(z), yy(y + h), w * kx, h * ky);
              g.fillStyle = c0 === '#111111' || c0 === '#1f4fd1' || c0 === '#8a2be2' ? '#f4f4f4' : '#111'; g.fillRect(zx(z + w * 0.15), yy(y + h * 0.62), w * 0.7 * kx, h * 0.28 * ky); }
          }
          // arena dirt low down and round the wheels
          for (let k = 0; k < 500; k++) {
            const near = rnd() < 0.6, x = near ? zx((rnd() < 0.5 ? zF : zR) + (rnd() - 0.5) * 2.6) : rnd() * LW, y = HS * (1 - Math.pow(rnd(), near ? 1.8 : 2.8) * 0.5), r = 2 + rnd() * rnd() * 18;
            g.fillStyle = `rgba(${60 + rnd() * 25 | 0},${38 + rnd() * 15 | 0},${22 + rnd() * 10 | 0},${0.2 + rnd() * 0.45})`; g.beginPath(); g.ellipse(x, y, r * (1 + rnd()), r, rnd() * 3, 0, 7); g.fill();
          }
          g.restore();
          // the name, arched across the doors: flame letters (yellow into orange) outlined in red, a black drop shadow
          g.save(); g.translate(0, s * HS);
          const NAMEA = 'AVENGER', zc = -0.05, yc = 2.24, span = 2.3, fs = 0.34;
          g.font = `italic 900 ${Math.round(fs * kx)}px Impact, "Arial Black", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
          const widths = [...NAMEA].map((ch) => g.measureText(ch).width), tot = widths.reduce((a, b) => a + b, 0), sc = span * kx / tot;
          let xx = -span * kx / 2;
          [...NAMEA].forEach((ch, i) => {
            const w = widths[i] * sc, xm = xx + w / 2, u = xm / (span * kx / 2);   // (-1..1 across the name)
            const X = (side) => (side ? LW - zx(zc) : zx(zc)) + xm, Y = yy(yc + 0.07 * (1 - u * u)), rot = -u * 0.08;
            g.save(); g.translate(X(s), Y); g.rotate(rot); g.scale(sc, ky / kx * 1.0);
            g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(ch, 6, 7);
            g.lineWidth = 16; g.strokeStyle = '#8a0a0a'; g.strokeText(ch, 0, 0);
            g.lineWidth = 8; g.strokeStyle = '#e8141a'; g.strokeText(ch, 0, 0);
            const lg = g.createLinearGradient(0, -fs * kx / 2, 0, fs * kx / 2); lg.addColorStop(0, '#fff45a'); lg.addColorStop(0.5, '#ffc61a'); lg.addColorStop(1, '#ff7a14');
            g.fillStyle = lg; g.fillText(ch, 0, 0); g.restore();
            xx += w;
          });
          g.restore();
        }
        // the top, seen from above (front at the left): the paint, flames down the hood from the nose, dirt near the nose
        { g.save(); g.fillStyle = P; g.fillRect(0, 2 * HS, LW, LH - 2 * HS);
          const tzx = zx, tyy = (x) => 2 * HS + (x + TW) / (2 * TW) * (LH - 2 * HS);
          for (const sx of [-1, 0, 1]) {
            const x0 = sx * 0.8, len = sx === 0 ? 1.7 : 1.25;
            g.beginPath(); g.moveTo(tzx(BZ0), tyy(x0 - 0.42));
            const n = 5; for (let k = 0; k < n; k++) { const a = x0 - 0.36 + k * 0.72 / (n - 1), tl = BZ0 + len * (0.55 + 0.45 * ((k * 7) % 5) / 4); g.quadraticCurveTo(tzx(BZ0 + (tl - BZ0) * 0.6), tyy(a - 0.1), tzx(tl), tyy(a)); g.quadraticCurveTo(tzx(BZ0 + (tl - BZ0) * 0.55), tyy(a + 0.05), tzx(BZ0 + (tl - BZ0) * 0.35), tyy(a + 0.12)); }
            g.lineTo(tzx(BZ0), tyy(x0 + 0.42)); g.closePath();
            const gr = g.createLinearGradient(tzx(BZ0), 0, tzx(BZ0 + len), 0); gr.addColorStop(0, '#fff45a'); gr.addColorStop(0.45, '#ffc61a'); gr.addColorStop(1, '#f2461c');
            g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = '#4a0707'; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#d8141a'; g.stroke(); g.fillStyle = gr; g.fill();
          }
          g.restore(); }
        // (the plain patches: body colour, and dark for the underside)
        g.fillStyle = P; g.fillRect(LW - 14, LH - 14, 14, 14); g.fillStyle = '#0d0d0e'; g.fillRect(0, LH - 14, 14, 14);
        livTex.needsUpdate = true;
        // the cab: body colour, the windows dark with a black seal - the side windows on the side views, the windshield and
        // the back glass on the front and back views (1024 x 1536: sides in rows 0-800, front 800-1150, back 1150-1500)
        const c2 = cabTex.userData.canvas, g2 = c2.getContext('2d');
        g2.fillStyle = P; g2.fillRect(0, 0, 1024, 1536);
        for (let s = 0; s < 2; s++) {
          g2.save(); g2.translate(0, s * 400); if (s === 1) { g2.translate(1024, 0); g2.scale(-1, 1); }
          const cz = (z) => (z - CZ0) / (CZ1 - CZ0) * 1024, cy = (y) => (CY1 - y) / (CY1 - CY0) * 400;
          g2.fillStyle = '#07090b'; g2.strokeStyle = '#111'; g2.lineWidth = 10; g2.lineJoin = 'round';
          g2.beginPath(); g2.moveTo(cz(-0.46), cy(2.86)); g2.lineTo(cz(0.6), cy(2.86)); g2.lineTo(cz(0.6), cy(3.33)); g2.quadraticCurveTo(cz(-0.1), cy(3.38), cz(-0.33), cy(3.28)); g2.closePath(); g2.fill(); g2.stroke();
          g2.beginPath(); g2.moveTo(cz(0.72), cy(2.86)); g2.lineTo(cz(1.16), cy(2.86)); g2.quadraticCurveTo(cz(1.04), cy(3.16), cz(0.72), cy(3.28)); g2.closePath(); g2.fill(); g2.stroke();
          // a flame lick along the bottom of the cab, and the door seam
          g2.strokeStyle = 'rgba(0,0,0,0.45)'; g2.lineWidth = 5; g2.beginPath(); g2.moveTo(cz(0.66), cy(2.5)); g2.lineTo(cz(0.66), cy(3.3)); g2.stroke();
          g2.restore();
        }
        // (a glass pane: rounded corners, a faint sheen across the top, the black rubber seal round it)
        const pane = (row, yb, yt, wb, wt, bow) => {
          const fx = (x) => (x + 1.6) / 3.2 * 1024, fy = (y) => row + (CY1 - y) / (CY1 - CY0) * 350, r = 0.07;
          g2.beginPath();
          g2.moveTo(fx(-wb + r), fy(yb)); g2.lineTo(fx(wb - r), fy(yb)); g2.quadraticCurveTo(fx(wb), fy(yb), fx(wb - 0.02), fy(yb + r));
          g2.lineTo(fx(wt + 0.01), fy(yt - r)); g2.quadraticCurveTo(fx(wt), fy(yt), fx(wt - r), fy(yt + bow * 0.3));
          g2.quadraticCurveTo(fx(0), fy(yt + bow), fx(-wt + r), fy(yt + bow * 0.3)); g2.quadraticCurveTo(fx(-wt), fy(yt), fx(-wt - 0.01), fy(yt - r));
          g2.lineTo(fx(-wb + 0.02), fy(yb + r)); g2.quadraticCurveTo(fx(-wb), fy(yb), fx(-wb + r), fy(yb)); g2.closePath();
          const gl = g2.createLinearGradient(0, fy(yt), 0, fy(yb)); gl.addColorStop(0, '#1a232b'); gl.addColorStop(0.35, '#0a0e12'); gl.addColorStop(1, '#05070a');
          g2.fillStyle = gl; g2.fill(); g2.lineJoin = 'round'; g2.lineWidth = 10; g2.strokeStyle = '#0d0d0e'; g2.stroke();
        };
        pane(800, 2.9, 3.33, 1.0, 0.84, 0.03);                                               // windshield
        pane(1150, 2.98, 3.28, 0.92, 0.72, 0.02);                                            // back glass
        g2.fillStyle = P; g2.fillRect(1000, 1510, 24, 24);
        cabTex.needsUpdate = true;
      }
      const CZ0 = -0.7, CZ1 = 1.55, CY0 = 2.45, CY1 = 3.52;
      const cabTex = canvasTex(1024, 1536, () => {});
      const livMat = new THREE.MeshPhysicalMaterial({ map: livTex, metalness: 0.05, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.15 });
      const cabMat = new THREE.MeshPhysicalMaterial({ map: cabTex, metalness: 0.05, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.1 });
      drawAvenger(PAINTS[opts.paint] || 0x6fd21e);
      // the main body
      { const g = mapUV(loft(range(-3.0, 2.85, 150), (z) => ({ w: tbl(HWT, z), yb: archY(z), yt: tbl(TOP, z), nT: 3.2, nB: 9 }), 44), LW, LH, placeBody, kindBody);
        const m = add(bodyG, g, livMat, 0, 0, 0); m.castShadow = true; }
      // the fenders: a rounded pontoon arching over each tyre, standing out from the body side
      function fender(za, sx, a0, a1) {
        const Rf = 1.34, tf = 0.14, wf = 0.21, xc = sx * 1.6, cy = 0.95, N = 26, S = 40, pos = [], idx = [];
        for (let i = 0; i <= S; i++) { const th = a0 + (a1 - a0) * i / S, uz = -Math.cos(th), uy = Math.sin(th);
          for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), dx = wf * Math.sign(c) * Math.pow(Math.abs(c), 0.6), dr = tf * Math.sign(sn) * Math.pow(Math.abs(sn), 0.6);
            pos.push(xc + dx, cy + (Rf + dr) * uy, za + (Rf + dr) * uz); } }
        for (let i = 0; i < S; i++) for (let k = 0; k < N; k++) { const a = i * N + k, b = i * N + (k + 1) % N, c = a + N, d = b + N; idx.push(a, c, b, b, c, d); }
        for (const [ri, fl] of [[0, false], [S, true]]) { const base = pos.length / 3; let mx = 0, my = 0, mz = 0; for (let k = 0; k < N; k++) { mx += pos[(ri * N + k) * 3] / N; my += pos[(ri * N + k) * 3 + 1] / N; mz += pos[(ri * N + k) * 3 + 2] / N; }
          pos.push(mx, my, mz); for (let k = 0; k < N; k++) pos.push(pos[(ri * N + k) * 3], pos[(ri * N + k) * 3 + 1], pos[(ri * N + k) * 3 + 2]);
          for (let k = 0; k < N; k++) { const p = base + 1 + k, q = base + 1 + (k + 1) % N; if (fl) idx.push(base, q, p); else idx.push(base, p, q); } }
        let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        // (winding check: the crown's outer point must face up)
        const top = (Math.round(S / 2) * N + Math.round(N / 4)); if (g.attributes.normal.getY(top) < 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; } g.setIndex(idx); g.computeVertexNormals(); }
        add(bodyG, mapUV(g, LW, LH, placeBody, kindBody), livMat, 0, 0, 0);
      }
      for (const sx of [-1, 1]) { fender(zF, sx, 0.2, Math.PI - 0.34); fender(zR, sx, 0.34, Math.PI - 0.16); }
      // the cab: a bubble coupe top, fastback down onto the deck
      const cabG = new THREE.Group(); bodyG.add(cabG);
      { const CT = [[-0.66, 2.6], [-0.56, 2.86], [-0.42, 3.28], [-0.28, 3.44], [0.4, 3.48], [0.8, 3.43], [1.05, 3.24], [1.3, 2.94], [1.52, 2.66]];
        const CW = [[-0.66, 1.4], [-0.3, 1.48], [0.9, 1.48], [1.52, 1.38]];
        // (sideways faces: the side views at their (z, y); forward / backward faces: the front / back views at their (x, y);
        // the roof: plain - every boundary between them is body colour, so no seam shows)
        const placeCab = (k, x, y, z) => { const u = (z - CZ0) / (CZ1 - CZ0) * 1024, v = (CY1 - y) / (CY1 - CY0) * 400, fx = (x + 1.6) / 3.2 * 1024, fv = (CY1 - y) / (CY1 - CY0) * 350;
          return k === 'L' ? [u, v] : k === 'R' ? [1024 - u, 400 + v] : k === 'F' ? [fx, 800 + fv] : k === 'B' ? [fx, 1150 + fv] : [1012, 1522]; };
        const kindCab = (nx, ny, nz) => (Math.abs(nx) >= 0.45 ? (nx < 0 ? 'L' : 'R') : nz <= -0.3 ? 'F' : nz >= 0.3 ? 'B' : 'P');
        const g = mapUV(loft(range(-0.66, 1.52, 90), (z) => ({ w: tbl(CW, z), yb: 2.4, yt: tbl(CT, z), nT: 3.0, nB: 9 }), 56), 1024, 1536, placeCab, kindCab);
        add(cabG, g, cabMat, 0, 0, 0);
      }
      // the nose: an oval chrome grille with vertical bars, round headlamps in chrome bezels on the fenders' fronts, a red
      // tube bumper; the tail: round red lamps on the rear fenders, a chrome bar
      { const GY = 1.92, GZ = -3.0;
        const gs = new THREE.Shape(); gs.absellipse(0, 0, 0.5, 0.19, 0, Math.PI * 2, false); const gh = new THREE.Path(); gh.absellipse(0, 0, 0.45, 0.15, 0, Math.PI * 2, true); gs.holes.push(gh);
        add(bodyG, new THREE.ExtrudeGeometry(gs, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 32 }), M.chrome, 0, GY, GZ - 0.055);
        add(bodyG, new THREE.CircleGeometry(1, 32).scale(0.46, 0.155, 1), M.black, 0, GY, GZ - 0.012, 0, Math.PI, 0, false);
        for (let k = -5; k <= 5; k++) { const x = k * 0.08, h = 0.15 * Math.sqrt(Math.max(0, 1 - (x / 0.46) ** 2)); add(bodyG, new THREE.BoxGeometry(0.016, 2 * h, 0.02), M.chrome, x, GY, GZ - 0.025, 0, 0, 0, false); }
        const cup = new THREE.LatheGeometry([[0.02, 0.05], [0.06, 0.04], [0.1, 0.02], [0.12, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 24); cup.rotateX(Math.PI / 2);
        for (const sx of [-1, 1]) {
          const x = sx * 0.82, y = 1.98, z = -3.0;
          add(bodyG, new THREE.TorusGeometry(0.13, 0.025, 10, 28), M.chrome, x, y, z - 0.01);
          add(bodyG, cup, M.head, x, y, z - 0.0, 0, 0, 0, false);
          add(bodyG, new THREE.SphereGeometry(0.3, 24, 6, 0, Math.PI * 2, 0, Math.asin(0.125 / 0.3)).rotateX(-Math.PI / 2), M.lens, x, y, z - 0.02 + 0.3 * Math.cos(Math.asin(0.125 / 0.3)));
          add(bodyG, rbox(0.16, 0.06, 0.03, 0.02), M.amber, sx * 1.05, 1.76, -2.99, 0, 0, 0, false);
          add(bodyG, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 22).rotateX(Math.PI / 2), M.tail, sx * 1.42, 2.1, 2.79, 0, 0, 0, false);
          add(bodyG, new THREE.TorusGeometry(0.09, 0.015, 8, 22), M.chrome, sx * 1.42, 2.1, 2.81);
        }
        tubeAB(bodyG, V3(-1.2, 1.66, -3.08), V3(1.2, 1.66, -3.08), 0.045, M.red);
        for (const sx of [-1, 1]) tubeAB(bodyG, V3(sx * 1.2, 1.66, -3.08), V3(sx * 1.35, 1.7, -2.8), 0.045, M.red);
        tubeAB(bodyG, V3(-1.0, 1.74, 2.92), V3(1.0, 1.74, 2.92), 0.035, M.chrome);
        // a door handle, a round mirror each side
        for (const sx of [-1, 1]) {
          add(bodyG, rbox(0.03, 0.04, 0.16, 0.012), M.chrome, sx * 1.72, 2.5, 0.5, 0, 0, 0, false);
          tubeAB(bodyG, V3(sx * 1.46, 2.8, -0.36), V3(sx * 1.66, 2.94, -0.38), 0.015, M.chrome);
          add(bodyG, new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20).rotateX(Math.PI / 2), M.chrome, sx * 1.7, 2.98, -0.38, 0, 0, 0, false);
        }
        // the underside's dark liner (seen from low down), the floor under the cab
        add(bodyG, new THREE.PlaneGeometry(2.9, 1.5), M.black, 0, 2.5, 0.4, -Math.PI / 2, 0, 0, false);
      }
      return { cabG, repaint: drawAvenger };
    }
    const BODY = opts.body === 'avenger' ? bodyAvenger() : bodyWreckoning(), cabG = BODY.cabG;

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
    // (the AVENGER's hat stays under its fastback: no hole in the body for it)
    if (opts.body !== 'avenger') {
      { const sc = new THREE.CylinderGeometry(0.2, 0.26, 0.52, 4, 1, false); sc.rotateY(Math.PI / 4); sc.scale(1, 1, 1.25);
        add(eng, sc, M.alu, 0, ey + 1.12, ez - 0.02); }
      add(eng, rbox(0.3, 0.26, 0.05, 0.02), M.gloss, 0, ey + 1.16, ez - 0.36, 0.25, 0, 0, false);            // the mouth
      add(eng, rbox(0.3, 0.035, 0.38, 0.01), M.gloss, 0, ey + 1.39, ez - 0.02);                               // butterfly plate
      for (const sx of [-0.07, 0.07]) add(eng, cylX(0.028, 0.028, 0.012, 14), M.red, sx, ey + 1.415, ez - 0.02, 0, 0, Math.PI / 2);
      add(eng, rbox(0.34, 0.06, 0.08, 0.02), M.red, 0, ey + 0.93, ez - 0.02);                               // hat base ring
    }
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
    const dash = new THREE.Group(); dash.position.set(0.32, sY + 0.37, sZ - (opts.body === 'avenger' ? 0.52 : 0.7)); dash.rotation.set(-0.45, -0.3, 0); cage.add(dash);
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
    // (deep: the off-road package's full-depth lugs - ~1 in taller, and the physics' rolling radius 2 cm bigger with them)
    function lugs(dir, deep) {
      const list = [], N = 34, lh = deep ? 0.075 : 0.055, ly = deep ? RT + 0.0225 : RT + 0.012;
      for (let k = 0; k < N; k++) {
        const phi = k * Math.PI * 2 / N;
        for (const side of [-1, 1]) {
          const b = new THREE.BoxGeometry(0.46, lh, deep ? 0.12 : 0.1);
          b.rotateY(-side * dir * 0.38); b.translate(side * 0.25, ly, side * dir * 0.04);
          const sh = new THREE.BoxGeometry(deep ? 0.14 : 0.12, deep ? 0.17 : 0.14, deep ? 0.12 : 0.1); sh.rotateZ(side * 0.75); sh.translate(side * (deep ? 0.51 : 0.5), RT - (deep ? 0.06 : 0.07), side * dir * 0.1);
          b.rotateX(phi + (side > 0 ? Math.PI / N : 0)); sh.rotateX(phi + (side > 0 ? Math.PI / N : 0)); list.push(b, sh);
        }
      }
      return mergeGeos(list);
    }
    const lugR = lugs(1), lugL = lugs(-1), lugRD = lugs(1, true), lugLD = lugs(-1, true);
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
      add(spin, tyreGeo, M.rubber, 0, 0, 0); rim(spin);
      const lugS = add(spin, left ? lugL : lugR, M.rubber, 0, 0, 0), lugD = add(spin, left ? lugLD : lugRD, M.rubber, 0, 0, 0);
      lugD.visible = false;
      // planetary hub housing (steers with the wheel, doesn't spin)
      add(flip, cylX(0.2, 0.24, 0.3, 32), M.cast, 0.3, 0, 0);
      add(flip, cylX(0.14, 0.17, 0.1, 28), M.polish, 0.48, 0, 0);
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; add(flip, cylX(0.014, 0.014, 0.04, 6), M.chrome, 0.54, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0, 0, 0, false); }
      wheels.push({ corner, flip, spin, squash, left, front: frontW, side, rt: RT, lugS, lugD });
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
      sl.position.set(sx * 1.32, 1.95 - cgH, -3.0 + zOff);
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
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.paint.color.setHex(c); BODY.repaint(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 5 : (o.night ? 1.2 : 0.4);
      M.head.emissiveIntensity = o.headlights ? 4 : 0; M.amber.emissiveIntensity = o.headlights ? 1.2 : 0.25;
      for (const hl of headlights) { hl.visible = !!o.headlights; hl.intensity = o.headlights ? 260 : 0; }
    }
    // cockpit view: hide the driver and the cab shell around your head (the cockpit has its own pillars and dash)
    function setInteriorVisible(v, cockpit) {
      driver.visible = !cockpit; inside.visible = !!cockpit; hoops.visible = !cockpit; cabG.visible = !cockpit;
    }
    function setTransmission() {}
    function setTires(front, rear) {
      for (const w of wheels) {
        const deep = (w.front ? front : rear) === 'monsterMud';
        w.lugS.visible = !deep; w.lugD.visible = deep; w.rt = RT + (deep ? 0.02 : 0);
      }
    }
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
