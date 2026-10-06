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
   The ABLAZE jet fire truck (opts.body 'firetruck') is the same chassis on a 3.3 m wheelbase under a cab-forward fire
   cab and a hose-bed box with a J34's tailpipe out of the back (no big-block: setJet draws its afterburner's flame).
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

    const cylZ = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateX(Math.PI / 2); return g; };
    // a tube along points: smooth through them, or (sharp) straight from one to the next
    function pipeTo(parent, pts, r, mat, sharp) {
      let c = new THREE.CatmullRomCurve3(pts);
      if (sharp) { c = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) c.add(new THREE.LineCurve3(pts[i - 1], pts[i])); }
      return add(parent, new THREE.TubeGeometry(c, pts.length * 16, r, 10, false), mat, 0, 0, 0);
    }
    // a flat polygon mesh from 3D points (convex faces), uvs in metres on its plane
    function facesGeo(verts, faces) {
      const pos = [], uv = [];
      for (const f of faces) {
        const a = V3(...verts[f[0]]), n = V3().subVectors(V3(...verts[f[1]]), a).cross(V3().subVectors(V3(...verts[f[2]]), a));
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        const UV = (v) => (ay >= ax && ay >= az ? [v[0], v[2]] : ax >= az ? [v[2], v[1]] : [v[0], v[1]]);
        for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) { pos.push(...verts[k]); uv.push(...UV(verts[k]).map((t) => t * 2)); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
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
    const FT = opts.body === 'firetruck';
    M.paint = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] || (FT ? 0xc4161c : 0xf2570f), metalness: 0.1, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.12 });
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

    // ---------------------------------------------------------------- the jet fire truck's body (ABLAZE)
    // ALL STAR FIRE DEPT's jet monster fire truck, as the photo has it: a cab-forward fire cab - a flat front with a big
    // two-pane windshield, a tall narrow window ahead of each door, the door with its window, a chrome grab handle at its
    // front edge, ALLSTAR on a black plate under the window, a gold Maltese cross on the cab's front corner, the black
    // roof edge with a light bar, mirrors out on arms, a rounded arch over the front tyre - then an open crew step under
    // the roof (a plain grey panel low, a dark screen above behind a black brace), then the tall box: a ribbed band along
    // its top round the hose bed, the ABLAZE flame logo (a parallelogram leaning back, flames off its edges) at the front,
    // ALL STAR - the cross - FIRE DEPT. in gold leaf between steel strips, a flourish under it, a shallow notch over the
    // back tyre trimmed in chrome, reflective tape along the bottom and chevrons up the back corners; a red ladder rack
    // along its left side and a hoop across the back; at the back a polished hood sloping over a dark grille and, under
    // it, the J34's grey tailpipe a metre out of the back wall. Proportions fitted to the photo off the box's corners
    function bodyFiretruck() {
      const bodyG = new THREE.Group(); model.add(bodyG);
      const cabG = new THREE.Group(); bodyG.add(cabG);
      const ZC0 = -2.55, ZD0 = -2.0, ZD1 = -1.05, ZC1 = -0.95, ZB0 = -0.07, ZB1 = 2.67, HC = 1.2, HB = 1.22;
      const YC0 = 1.72, YCS = 1.45, YCR = 3.0, YB0 = 1.47, YBT = 2.85, YBS = 3.32;
      const LZ0 = ZC0 - 0.02, LZ1 = ZB1 + 0.02, LY0 = 1.4, LY1 = 3.3;
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      M.paint.side = THREE.DoubleSide; M.rack = M.paint;
      M.chassis.color.setHex(0x18181a); M.blue.color.setHex(0xd8b21c);     // (a black frame, yellow coil springs)
      M.ftDark = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
      M.ftIn = new THREE.MeshStandardMaterial({ color: 0x3a0a0c, roughness: 0.8, side: THREE.DoubleSide });
      M.ftGlass = new THREE.MeshPhysicalMaterial({ color: 0x0a0e12, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: 2.2, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
      M.ftPipe = new THREE.MeshStandardMaterial({ color: 0x9a9894, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
      M.ftHood = new THREE.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.12, metalness: 1, side: THREE.DoubleSide });   // (polished stainless)
      M.ftGrey = new THREE.MeshStandardMaterial({ color: 0xa9adb2, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
      // ---- a flat side panel in the body's (z, y), with holes, at x = sx * hw - its uvs on the side's livery canvas
      // (right side: the front at the canvas's right, so the lettering reads on both)
      function sideGeo(outline, holes, sx, hw) {
        const sh = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
        for (const hl of holes || []) sh.holes.push(new THREE.Path(hl.map(([z, y]) => new THREE.Vector2(z, y))));
        const g = new THREE.ShapeGeometry(sh, 8), p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const z = p.getX(i), y = p.getY(i);
          p.setXYZ(i, sx * hw, y, z);
          uv.setXY(i, sx > 0 ? (LZ1 - z) / (LZ1 - LZ0) : (z - LZ0) / (LZ1 - LZ0), (y - LY0) / (LY1 - LY0));
        }
        if (sx > 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } }
        g.computeVertexNormals(); return g;
      }
      const rr = (z0, y0, z1, y1, r) => { const out = [], n = 5; const arc = (cz, cy, a0) => { for (let k = 0; k <= n; k++) { const a = a0 + k / n * Math.PI / 2; out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
        arc(z1 - r, y0 + r, -Math.PI / 2); arc(z1 - r, y1 - r, 0); arc(z0 + r, y1 - r, Math.PI / 2); arc(z0 + r, y0 + r, Math.PI); return out; };
      // the windows: the narrow one ahead of the door, the door's
      const WIN1 = rr(ZC0 + 0.08, 2.12, ZD0 - 0.06, 2.82, 0.04), WIN2 = rr(ZD0 + 0.1, 2.15, ZD1 - 0.1, 2.84, 0.05);
      // the wheel openings: the box's a shallow notch over the back tyre as the photo has it, the cab's a rounded one over
      // the front - dark tubs behind both take the tyres when the suspension's compressed (they're mostly outboard)
      const AR = [[zR - 0.55, YB0], [zR - 0.35, 1.78], [zR + 0.6, 1.78], [zR + 0.8, YB0]], AF = [zF - 0.63, zF + 0.65], AFY = 1.95;
      // ---- the livery: one canvas a side over the cab and the box
      const liv = [0, 1].map(() => canvasTex(2048, 816, () => {}));
      function drawSide(c, left, paint) {
        const g = c.getContext('2d'), w = c.width, h = c.height;
        const X = (z) => (left ? (z - LZ0) : (LZ1 - z)) / (LZ1 - LZ0) * w, Y = (y) => (1 - (y - LY0) / (LY1 - LY0)) * h, S = w / (LZ1 - LZ0);
        const R = (z0, y0, z1, y1) => [Math.min(X(z0), X(z1)), Y(y1), Math.abs(X(z1) - X(z0)), Y(y0) - Y(y1)];
        // (the paint's sRGB components - a THREE.Color holds them linear, which drew every shade of it far too dark)
        const col = new THREE.Color(paint).convertLinearToSRGB(), dk = (k) => `rgb(${Math.round(col.r * 255 * k)},${Math.round(col.g * 255 * k)},${Math.round(col.b * 255 * k)})`;
        g.fillStyle = hex(paint); g.fillRect(0, 0, w, h);
        // (a little sun and wear in the paint)
        for (let k = 0; k < 60; k++) { const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 120, gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, `rgba(255,255,255,${0.02 + Math.random() * 0.04})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
        // the door's seams, the cab's lower edge
        g.strokeStyle = dk(0.45); g.lineWidth = 4; g.strokeRect(...R(ZD0, 1.99, ZD1, 2.96));
        g.fillStyle = dk(0.6); g.fillRect(...R(LZ0, YC0, ZC1, YC0 + 0.03));
        // ALLSTAR on a black plate under the door's window
        { const [x, y, ww, hh] = R(ZD0 + 0.12, 1.98, ZD1 - 0.12, 2.1); g.fillStyle = '#0d0d0f'; g.fillRect(x, y, ww, hh);
          g.save(); g.translate(x + ww / 2, y + hh / 2); g.transform(1, 0, -0.2, 1, 0, 0); g.font = `italic 900 ${hh * 0.82}px Impact, "Arial Black", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = 4; g.strokeStyle = '#8a1014'; g.strokeText('ALLSTAR', 0, 2, ww * 0.94); g.fillStyle = '#f2f2ee'; g.fillText('ALLSTAR', 0, 2, ww * 0.94); g.restore();
          g.fillStyle = '#ffd21a'; star(g, x + ww * 0.08, y + hh * 0.5, hh * 0.3); }
        // reflective tape along the cab's and the box's lower edges
        g.fillStyle = '#f4f4f0'; for (let z = ZC0 + 0.04; z < ZC1 - 0.1; z += 0.32) if (z < AF[0] - 0.14 || z > AF[1]) g.fillRect(...R(z, YC0 + 0.07, z + 0.12, YC0 + 0.11));
        for (let z = ZB0 + 0.12; z < ZB1 - 0.15; z += 0.32) if (z < AR[0][0] - 0.14 || z > AR[3][0]) g.fillRect(...R(z, YB0 + 0.06, z + 0.12, YB0 + 0.1));
        // the gold Maltese cross on the cab's front corner
        cross(g, X(ZC0 + 0.13), Y(1.9), 0.1 * S);
        // ---- the box
        // (its top edge: a steel strip under the slats)
        g.fillStyle = '#b8bcc2'; g.fillRect(...R(ZB0, YBT - 0.05, ZB1, YBT));
        // the ABLAZE logo: a tall parallelogram leaning back, flames licking off its edges, the name in flame letters
        { const cx = X(0.47), cy = Y(2.2), s = S, hw = 0.25 * s, hh = 0.36 * s, sk = 0.42;
          g.save(); g.translate(cx, cy); g.transform(1, 0, left ? sk : -sk, 1, 0, 0);
          // (the flames: tongues off each edge, orange under yellow)
          const tongues = (k, col2) => { g.beginPath(); const n = 9, pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
            for (let e = 0; e < 4; e++) { const [ax, ay] = pts[e], [bx, by] = pts[(e + 1) % 4], nx = (by - ay), ny = -(bx - ax), nl = Math.hypot(nx, ny);
              for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 0.5) / n, L = (0.05 + 0.04 * Math.sin(i * 2.3 + e)) * s * k;
                g.lineTo(ax + (bx - ax) * t0, ay + (by - ay) * t0); g.quadraticCurveTo(ax + (bx - ax) * t1 + nx / nl * L * 1.6, ay + (by - ay) * t1 + ny / nl * L * 1.6 - L * 0.6, ax + (bx - ax) * (t1 + 0.5 / n), ay + (by - ay) * (t1 + 0.5 / n)); } }
            g.closePath(); g.fillStyle = col2; g.fill(); };
          tongues(1.15, '#ff7a14'); tongues(0.75, '#ffd23a');
          const pg = g.createLinearGradient(0, -hh, 0, hh); pg.addColorStop(0, '#c8141a'); pg.addColorStop(1, '#8a0c10'); g.fillStyle = pg; g.fillRect(-hw, -hh, 2 * hw, 2 * hh);
          g.strokeStyle = '#ffd23a'; g.lineWidth = 4; g.strokeRect(-hw, -hh, 2 * hw, 2 * hh);
          g.font = `italic 900 ${0.1 * s}px Impact, "Arial Black", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
          g.lineWidth = 6; g.strokeStyle = '#5a1206'; g.strokeText('ALL STAR', 0, -0.14 * s, 2 * hw * 0.9); g.fillStyle = '#ffe06a'; g.fillText('ALL STAR', 0, -0.14 * s, 2 * hw * 0.9);
          const gr = g.createLinearGradient(0, -0.05 * s, 0, 0.2 * s); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.5, '#ffb82a'); gr.addColorStop(1, '#ff5a10');
          g.font = `italic 900 ${0.19 * s}px Impact, "Arial Black", Arial`; g.lineWidth = 10; g.strokeStyle = '#5a1206';
          for (const [t, y] of [['AB', 0.02], ['LAZE', 0.2]]) { g.strokeText(t, 0, y * s, 2 * hw * 0.95); g.fillStyle = gr; g.fillText(t, 0, y * s, 2 * hw * 0.95); }
          g.restore(); }
        // the gold-leaf panel: recessed a shade darker, framed in steel strips, ALL STAR - the cross - FIRE DEPT.
        { const z0 = 1.07, z1 = 2.49, y0 = 2.06, y1 = 2.8;
          g.fillStyle = dk(0.94); g.fillRect(...R(z0, y0, z1, y1));
          g.fillStyle = '#c9ccd0'; g.fillRect(...R(z0 - 0.06, y0 - 0.02, z0, y1 + 0.02)); g.fillRect(...R(z1, y0 - 0.02, z1 + 0.06, y1 + 0.02));
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(...R(z0, y0 - 0.02, z0 + 0.02, y1 + 0.02)); g.fillRect(...R(z1 - 0.02, y0 - 0.02, z1, y1 + 0.02));
          const gold = (txt, z, y, px) => { const gr = g.createLinearGradient(0, Y(y) - px / 2, 0, Y(y) + px / 2); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.45, '#e0b23a'); gr.addColorStop(1, '#8a6412');
            g.font = `bold ${px}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 4; g.strokeStyle = '#3a1a08'; g.strokeText(txt, X(z), Y(y)); g.fillStyle = gr; g.fillText(txt, X(z), Y(y)); };
          const zc = (z0 + z1) / 2;
          gold('ALL STAR', zc, 2.66, 0.12 * S); cross(g, X(zc), Y(2.47), 0.09 * S); gold('FIRE DEPT.', zc, 2.29, 0.12 * S);
          g.fillStyle = '#e0b23a'; g.beginPath(); g.arc(X(zc), Y(2.15), 0.045 * S, 0, 7); g.fill(); g.fillStyle = dk(0.6); g.beginPath(); g.arc(X(zc), Y(2.15), 0.03 * S, 0, 7); g.fill();
          // (the gold flourish under it)
          g.strokeStyle = '#e0b23a'; g.lineWidth = 4; g.beginPath(); g.moveTo(X(zc - 0.4), Y(2.03)); g.bezierCurveTo(X(zc - 0.2), Y(1.95), X(zc - 0.1), Y(2.08), X(zc), Y(2.01));
          g.bezierCurveTo(X(zc + 0.1), Y(2.08), X(zc + 0.2), Y(1.95), X(zc + 0.4), Y(2.03)); g.stroke(); }
        // the white chevrons up the box's back corner
        g.save(); g.beginPath(); g.rect(...R(ZB1 - 0.16, YB0, ZB1, YBT - 0.05)); g.clip(); g.fillStyle = '#f4f4f0';
        for (let y = YB0; y < YBT; y += 0.2) { g.beginPath(); g.moveTo(X(ZB1 - 0.16), Y(y)); g.lineTo(X(ZB1 - 0.16), Y(y + 0.07)); g.lineTo(X(ZB1), Y(y + 0.2)); g.lineTo(X(ZB1), Y(y + 0.13)); g.closePath(); g.fill(); }
        g.restore();
      }
      function star(g, x, y, r) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k & 1 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath(); g.fill(); }
      // a Maltese cross in gold round a green-and-gold centre (the fire service's emblem)
      function cross(g, x, y, r) {
        g.save(); g.translate(x, y);
        const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.5, '#e0b23a'); gr.addColorStop(1, '#8a6412');
        g.fillStyle = gr; g.strokeStyle = '#3a1a08'; g.lineWidth = 2;
        for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2); g.beginPath(); g.moveTo(0, -r * 0.25); g.lineTo(-r * 0.62, -r); g.lineTo(-r * 0.2, -r * 0.8); g.lineTo(0, -r * 0.95); g.lineTo(r * 0.2, -r * 0.8); g.lineTo(r * 0.62, -r); g.closePath(); g.fill(); g.stroke(); g.restore(); }
        g.fillStyle = '#2f6a3a'; g.beginPath(); g.arc(0, 0, r * 0.36, 0, 7); g.fill(); g.strokeStyle = '#e0b23a'; g.lineWidth = 3; g.stroke();
        g.restore();
      }
      const livMat = liv.map((t) => new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.4, metalness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.15, side: THREE.DoubleSide }));
      function repaint(paint) { liv.forEach((t, k) => { drawSide(t.userData.canvas, k === 0, paint); t.needsUpdate = true; }); M.paint.color.setHex(paint); }
      repaint(M.paint.color.getHex());
      // ---- the cab: its sides (the windows open, the bottom up over the front tyre), the flat front, the roof
      for (const [k, sx] of [[0, -1], [1, 1]]) {
        add(cabG, sideGeo([[ZC0, YC0], [AF[0], YC0], [AF[0], AFY - 0.14], [AF[0] + 0.14, AFY], [AF[1] - 0.14, AFY], [AF[1], AFY - 0.14], [AF[1], YC0], [ZC1, YC0], [ZC1, YCR], [ZC0 + 0.045, YCR]], [WIN1, WIN2], sx, HC), livMat[k], 0, 0, 0);
        pipeTo(cabG, [[AF[0], YC0], [AF[0], AFY - 0.14], [AF[0] + 0.14, AFY], [AF[1] - 0.14, AFY], [AF[1], AFY - 0.14], [AF[1], YC0]].map(([z, y]) => V3(sx * (HC + 0.01), y, z)), 0.02, M.black);
        add(cabG, new THREE.BoxGeometry(HC - 0.75, AFY + 0.25 - YC0, AF[1] - AF[0]), M.ftDark, sx * (0.73 + (HC - 0.75) / 2), (YC0 + AFY + 0.25) / 2, (AF[0] + AF[1]) / 2);
        for (const W2 of [WIN1, WIN2]) { add(cabG, sideGeo(W2, [], sx, HC - 0.03), M.ftGlass, 0, 0, 0, 0, 0, 0, false); }
        // (the window frames: dark rubber)
        for (const W2 of [WIN1, WIN2]) add(cabG, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(W2.map(([z, y]) => V3(sx * (HC + 0.005), y, z)), true), 60, 0.015, 5, true), M.black, 0, 0, 0);
        // the grab handle at the door's front edge, the mirror on its arm
        pipeTo(cabG, [V3(sx * (HC + 0.01), 1.86, ZD0 - 0.02), V3(sx * (HC + 0.07), 1.9, ZD0 - 0.03), V3(sx * (HC + 0.07), 2.32, ZD0 - 0.03), V3(sx * (HC + 0.01), 2.36, ZD0 - 0.02)], 0.018, M.chrome);
        tubeAB(cabG, V3(sx * HC, 2.6, ZC0 + 0.1), V3(sx * (HC + 0.32), 2.62, ZC0 + 0.02), 0.02, M.black);
        tubeAB(cabG, V3(sx * HC, 2.2, ZC0 + 0.1), V3(sx * (HC + 0.32), 2.3, ZC0 + 0.02), 0.02, M.black);
        add(cabG, rbox(0.12, 0.42, 0.06, 0.02), M.black, sx * (HC + 0.34), 2.46, ZC0 + 0.02);
        // (the crew step behind the door: grey plate to the step's height, open above it, a black brace up to the roof)
        add(bodyG, new THREE.PlaneGeometry(ZB0 - ZC1, 2.12 - YCS), M.ftGrey, sx * (HC - 0.02), (YCS + 2.12) / 2, (ZC1 + ZB0) / 2, 0, sx * Math.PI / 2, 0);
        add(bodyG, new THREE.PlaneGeometry(ZB0 - ZC1, YCR - 2.14), M.ftDark, sx * (HC - 0.05), (2.14 + YCR) / 2, (ZC1 + ZB0) / 2, 0, sx * Math.PI / 2, 0, false);
        add(bodyG, rbox(0.05, 0.05, ZB0 - ZC1, 0.015), M.alu, sx * (HC - 0.01), 2.13, (ZC1 + ZB0) / 2);
        tubeAB(bodyG, V3(sx * (HC - 0.03), 2.14, ZC1 + 0.1), V3(sx * (HC - 0.03), 2.95, ZB0 - 0.05), 0.03, M.black);
        tubeAB(bodyG, V3(sx * (HC - 0.03), 2.12, ZC1), V3(sx * (HC - 0.03), YCR, ZC1), 0.035, M.paint);
        tubeAB(bodyG, V3(sx * (HC - 0.03), 2.12, ZB0 - 0.02), V3(sx * (HC - 0.03), YCR, ZB0 - 0.02), 0.035, M.paint);
      }
      // (the cab's insides and the crew area's: dark)
      add(cabG, new THREE.PlaneGeometry(2 * HC, YCR - YC0), M.ftIn, 0, (YC0 + YCR) / 2, ZC1 + 0.002, 0, 0, 0, false);
      add(bodyG, new THREE.BoxGeometry(2 * HC - 0.06, 0.04, ZB0 - ZC1), M.ftDark, 0, 2.12, (ZC1 + ZB0) / 2);
      add(bodyG, new THREE.BoxGeometry(1.44, 0.04, ZB0 - ZC0), M.ftDark, 0, YC0 + 0.02, (ZC0 + ZB0) / 2);
      // the front: a flat face raked back a touch, two windshield panes over a red panel, a chrome grille band, round
      // headlamps in their bezels, the amber turn lamps, a chrome bumper
      { const fg = new THREE.Group(); fg.position.set(0, YC0, ZC0); fg.rotation.x = 0.035; cabG.add(fg);
        const H = YCR - YC0, sh = new THREE.Shape([[-HC, 0], [HC, 0], [HC, H], [-HC, H]].map(([x, y]) => new THREE.Vector2(x, y)));
        const pane = (x0, x1) => rr(x0, 2.18 - YC0, x1, 2.88 - YC0, 0.05).map(([x, y]) => new THREE.Vector2(x, y));
        sh.holes.push(new THREE.Path(pane(-HC + 0.1, -0.04)), new THREE.Path(pane(0.04, HC - 0.1)));
        const f = new THREE.ShapeGeometry(sh, 8); f.rotateY(Math.PI); add(fg, f, M.paint, 0, 0, 0);
        for (const [x0, x1] of [[-HC + 0.1, -0.04], [0.04, HC - 0.1]]) {
          const pg = new THREE.ShapeGeometry(new THREE.Shape(pane(x0, x1)), 6); pg.rotateY(Math.PI); add(fg, pg, M.ftGlass, 0, 0, 0.03, 0, 0, 0, false);
          add(fg, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pane(x0, x1).map((v) => V3(-v.x, v.y, -0.005)), true), 60, 0.016, 5, true), M.black, 0, 0, 0);
        }
        // (the wiper arms, at rest)
        for (const x of [-0.6, 0.5]) tubeAB(fg, V3(x, 2.2 - YC0, -0.02), V3(x + 0.45, 2.24 - YC0, -0.02), 0.008, M.black);
        for (let k = 0; k < 3; k++) add(fg, rbox(1.3, 0.04, 0.03, 0.01), M.chrome, 0, 0.18 + k * 0.08, -0.02);
        for (const sx of [-1, 1]) {
          for (const dx of [0, 0.22]) { add(fg, cylZ(0.085, 0.085, 0.05, 24), M.chrome, sx * (0.78 + dx), 0.26, -0.02); add(fg, new THREE.CircleGeometry(0.07, 20), M.head, sx * (0.78 + dx), 0.26, -0.05, 0, Math.PI, 0, false); }
          add(fg, rbox(0.14, 0.08, 0.04, 0.015), M.amber, sx * 0.92, 0.07, -0.02);
        }
        add(cabG, rbox(2 * HC + 0.1, 0.16, 0.14, 0.04), M.chrome, 0, YC0 - 0.02, ZC0 - 0.1); }
      // the roof, over the cab and the crew step to the box: red, its edge black, the light bar and the marker lamps
      add(bodyG, rbox(2 * HC + 0.02, 0.08, ZB0 - ZC0 + 0.02, 0.03), M.paint, 0, YCR + 0.02, (ZC0 + ZB0) / 2);
      add(bodyG, rbox(2 * HC + 0.06, 0.05, ZB0 - ZC0 + 0.06, 0.02), M.black, 0, YCR - 0.02, (ZC0 + ZB0) / 2);
      M.beaconA = new THREE.MeshStandardMaterial({ color: 0x5a0606, emissive: 0xff1010, emissiveIntensity: 0.3, roughness: 0.25, transparent: true, opacity: 0.92 });
      M.beaconB = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.25, transparent: true, opacity: 0.92 });
      add(bodyG, rbox(1.7, 0.1, 0.24, 0.04), M.black, 0, YCR + 0.11, ZC0 + 0.3);
      for (let k = 0; k < 6; k++) add(bodyG, rbox(0.24, 0.12, 0.2, 0.05), k === 2 || k === 3 ? M.beaconB : M.beaconA, -0.68 + k * 0.272, YCR + 0.2, ZC0 + 0.3);
      for (let k = 0; k < 5; k++) add(bodyG, rbox(0.08, 0.05, 0.05, 0.015), M.amber, -0.4 + k * 0.2, YCR + 0.07, ZC0 + 0.08);
      for (const sx of [-1, 1]) tubeAB(bodyG, V3(sx * 0.9, YCR + 0.06, ZC0 + 0.9), V3(sx * 0.95, YCR + 0.75, ZC0 + 1.05), 0.008, M.black);
      // ---- the box: its sides (the notch over the back tyre), the ribbed band along its top round the hose bed, the front
      // and back walls, corner posts
      for (const [k, sx] of [[0, -1], [1, 1]]) {
        add(bodyG, sideGeo([[ZB0, YB0], ...AR, [ZB1, YB0], [ZB1, YBT], [ZB0, YBT]], [], sx, HB), livMat[k], 0, 0, 0);
        // (the chrome trim round the opening)
        pipeTo(bodyG, AR.map(([z, y]) => V3(sx * (HB + 0.012), y, z)), 0.022, M.chrome, true);
        // the slats, their rails, and the hose bed's inner wall behind them
        add(bodyG, rbox(0.05, 0.05, ZB1 - ZB0, 0.015), M.alu, sx * (HB - 0.01), YBT + 0.005, (ZB0 + ZB1) / 2);
        add(bodyG, rbox(0.06, 0.05, ZB1 - ZB0, 0.02), M.paint, sx * (HB - 0.01), YBS, (ZB0 + ZB1) / 2);
        for (let z = ZB0 + 0.05; z <= ZB1 - 0.04; z += 0.27) add(bodyG, rbox(0.04, YBS - YBT, 0.045, 0.012), M.paint, sx * (HB - 0.01), (YBT + YBS) / 2, z);
        add(bodyG, new THREE.PlaneGeometry(ZB1 - ZB0, YBS - YBT), M.paint, sx * (HB - 0.035), (YBT + YBS) / 2, (ZB0 + ZB1) / 2, 0, sx * Math.PI / 2, 0, false);
        // (the corner posts and the bottom rub rail, black)
        for (const z of [ZB0, ZB1]) add(bodyG, rbox(0.07, YBS - YB0, 0.07, 0.02), M.paint, sx * (HB - 0.02), (YB0 + YBS) / 2, z);
        add(bodyG, rbox(0.06, 0.08, ZB1 - ZB0, 0.02), M.black, sx * (HB + 0.01), YB0 + 0.03, (ZB0 + ZB1) / 2);
      }
      add(bodyG, new THREE.PlaneGeometry(2 * HB, YBS - YB0), M.paint, 0, (YB0 + YBS) / 2, ZB0, 0, 0, 0);
      add(bodyG, new THREE.BoxGeometry(2 * HB, 0.04, ZB1 - ZB0), M.ftIn, 0, YBT - 0.02, (ZB0 + ZB1) / 2);
      // the wheel well inside the opening (dark), the box's floor
      for (const sx of [-1, 1]) add(bodyG, new THREE.BoxGeometry(HB - 0.74, 0.75, AR[3][0] - AR[0][0]), M.ftDark, sx * (0.73 + (HB - 0.76) / 2), YB0 + 0.375, (AR[0][0] + AR[3][0]) / 2);
      for (const [z0, z1] of [[ZB0, AR[0][0]], [AR[3][0], ZB1]]) add(bodyG, new THREE.BoxGeometry(2 * HB - 0.04, 0.04, z1 - z0), M.ftDark, 0, YB0 + 0.02, (z0 + z1) / 2);
      add(bodyG, new THREE.BoxGeometry(1.44, 0.04, AR[3][0] - AR[0][0]), M.ftDark, 0, YB0 + 0.02, (AR[0][0] + AR[3][0]) / 2);
      // the back wall: red, the jet's tailpipe out of its lower middle, a dark grille over that under the sloping hood,
      // the tail lamps, the step under it
      { const sh = new THREE.Shape([[-HB, YB0], [HB, YB0], [HB, YBT], [-HB, YBT]].map(([x, y]) => new THREE.Vector2(x, y)));
        sh.holes.push(new THREE.Path(Array.from({ length: 33 }, (_, k) => { const a = -k / 32 * Math.PI * 2; return new THREE.Vector2(Math.cos(a) * 0.34, 1.95 + Math.sin(a) * 0.34); })));
        add(bodyG, new THREE.ShapeGeometry(sh, 12), M.paint, 0, 0, ZB1);
        const gTex = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4a4d52'; g.lineWidth = 2;
          for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 8, y); g.lineTo(x + 16, y + 4); g.lineTo(x + 8, y + 8); g.closePath(); g.stroke(); } });
        add(bodyG, new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.6, metalness: 0.5 }), 0, 2.5, ZB1 + 0.01, 0, 0, 0, false);
        add(bodyG, rbox(1.76, 0.05, 0.05, 0.015), M.alu, 0, 2.27, ZB1 + 0.02);
        for (const sx of [-1, 1]) {
          add(bodyG, rbox(0.12, 0.2, 0.05, 0.02), M.tail, sx * (HB - 0.14), 1.72, ZB1 + 0.02);
          add(bodyG, rbox(0.12, 0.08, 0.05, 0.02), M.amber, sx * (HB - 0.14), 1.9, ZB1 + 0.02);
          // (chevrons up the back corners)
          add(bodyG, new THREE.PlaneGeometry(0.16, YBT - YB0 - 0.1), M.chevron || (M.chevron = new THREE.MeshStandardMaterial({ map: canvasTex(64, 256, (g, w, h) => {
            g.fillStyle = '#c4161c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f0'; for (let y = -w; y < h; y += 44) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.lineTo(w, y + w + 16); g.lineTo(0, y + 16); g.closePath(); g.fill(); } }), roughness: 0.4 })),
          sx * (HB - 0.08), (YB0 + YBT) / 2 - 0.05, ZB1 + 0.012, 0, 0, 0, false);
        }
        // (the step, its ladder rung)
        add(bodyG, rbox(2.1, 0.06, 0.32, 0.02), M.black, 0, 1.28, ZB1 + 0.18);
        for (const sx of [-1, 1]) tubeAB(bodyG, V3(sx * 0.95, 1.28, ZB1 + 0.05), V3(sx * 0.95, YB0, ZB1 - 0.02), 0.025, M.black);
        // the hood: a sloping sheet of diamond plate over the back of the hose bed, its sides closed
        const hz0 = ZB1 - 0.62, hz1 = ZB1 + 0.1, hy0 = YBS + 0.02, hy1 = 2.78;
        const hv = [[-HB + 0.06, hy0, hz0], [HB - 0.06, hy0, hz0], [HB - 0.06, hy1, hz1], [-HB + 0.06, hy1, hz1]];
        add(bodyG, facesGeo(hv, [[0, 1, 2, 3]]), M.ftHood, 0, 0, 0);
        for (const sx of [-1, 1]) add(bodyG, facesGeo([[sx * (HB - 0.06), hy0, hz0], [sx * (HB - 0.06), hy1, hz1], [sx * (HB - 0.06), hy1, ZB1], [sx * (HB - 0.06), YBT, ZB1], [sx * (HB - 0.06), YBT, hz0]], [[0, 1, 2, 3, 4]]), M.ftHood, 0, 0, 0);
      }
      // the J34's tailpipe: a grey steel tube a metre out of the back wall, sooted dark inside, its rim heat-stained
      const JY = 1.95, JR = 0.34, JZ0 = ZB1 - 0.4, JZ1 = ZB1 + 0.98;
      add(bodyG, cylZ(JR, JR, JZ1 - JZ0, 40, true), M.ftPipe, 0, JY, (JZ0 + JZ1) / 2);
      add(bodyG, cylZ(JR - 0.012, JR - 0.012, 0.5, 36, true), new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.9, side: THREE.BackSide }), 0, JY, JZ1 - 0.25);
      add(bodyG, new THREE.TorusGeometry(JR - 0.005, 0.012, 8, 40), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.5, metalness: 0.7 }), 0, JY, JZ1);
      add(bodyG, new THREE.CircleGeometry(JR - 0.02, 32), M.black, 0, JY, JZ1 - 0.5, 0, Math.PI, 0, false);
      // ---- the ladder rack arching over the box: a red tube frame along each side, joined across front and back
      { const z0 = ZB0 + 0.1, z1 = ZB1 - 0.32, yT = YBS + 0.62, yH = YBS + 0.36, x = 1.1;
        pipeTo(bodyG, [V3(-x, YBS, z0), V3(-x, yT - 0.1, z0), V3(-x, yT, z0 + 0.1), V3(-x, yT, z1 - 0.1), V3(-x, yT - 0.1, z1), V3(-x, YBS, z1)], 0.045, M.rack, true);
        pipeTo(bodyG, [V3(-x, yH, z1), V3(x - 0.1, yH, z1), V3(x, yH - 0.1, z1), V3(x, YBS, z1)], 0.04, M.rack, true); }
      // ---- the jet's flame: a hot core and the plume round it, both additive - a shimmer dry, a long flame lit
      const flameMat = (core) => new THREE.ShaderMaterial({
        uniforms: { uAB: { value: 0 }, uThr: { value: 0 }, uT: { value: 0 }, uCore: { value: core ? 1 : 0 }, uK: { value: core ? 0.1 : 0.135 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `uniform float uAB; uniform float uThr; uniform float uT; uniform float uCore; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main() {
            float t = 1.0 - vUv.y;
            float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
            float dia = 0.6 + 0.4 * pow(abs(sin(t * 16.0 - uT * 2.0)), 3.0);
            float flick = 0.85 + 0.15 * sin(uT * 53.0 + t * 9.0) * sin(uT * 31.0 + 1.3);
            vec3 hot = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.52, 0.14), smoothstep(0.0, 0.45, t));
            hot = mix(hot, vec3(0.85, 0.2, 0.06), smoothstep(0.45, 1.0, t));
            float a = edge * (1.0 - smoothstep(0.15, 1.0, t)) * flick * (uCore > 0.5 ? dia * 1.7 : 0.8) * (uAB * 2.4 + uThr * 0.18) * uK;
            gl_FragColor = vec4(hot * a, 1.0);
            #include <colorspace_fragment>
          }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      });
      const plumeGeo = (r0, r1) => { const g = new THREE.CylinderGeometry(r0, r1, 1, 24, 6, true); g.translate(0, -0.5, 0); g.rotateX(-Math.PI / 2); return g; };
      const fx = new THREE.Group(); fx.position.set(0, JY, JZ1 - 0.05); bodyG.add(fx);
      const jetFx = { g: fx, outer: add(fx, plumeGeo(0.3, 0.16), flameMat(false), 0, 0, 0, 0, 0, 0, false), core: add(fx, plumeGeo(0.22, 0.03), flameMat(true), 0, 0, 0, 0, 0, 0, false), t: 0 };
      jetFx.outer.renderOrder = 5; jetFx.core.renderOrder = 6; jetFx.outer.visible = jetFx.core.visible = false;
      return { cabG, repaint, jetFx, eyeGlass: M.ftGlass };
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
      function loft(zs, sec, N, skip) {
        const pos = [], idx = [];
        for (const z of zs) { const s = sec(z), yc = (s.yb + s.yt) / 2, hh = (s.yt - s.yb) / 2;
          for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), e = 2 / (sn >= 0 ? s.nT : s.nB);
            pos.push((s.xc || 0) + s.w * Math.sign(c) * Math.pow(Math.abs(c), 2 / (sn >= 0 ? s.nT : s.nB) * 1), yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), e), z); } }
        for (let r = 0; r < zs.length - 1; r++) for (let k = 0; k < N; k++) {
          const a = r * N + k, b = r * N + (k + 1) % N, c = a + N, d = b + N;
          if (skip && skip((pos[a * 3] + pos[d * 3]) / 2, (pos[a * 3 + 1] + pos[d * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[d * 3 + 2]) / 2)) continue;
          idx.push(a, b, c, b, d, c);
        }
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
      const HOLE = { z0: -0.45, z1: 1.3, x: 1.25 }, inHole = (x, y, z) => y > 2.3 && z > HOLE.z0 && z < HOLE.z1 && Math.abs(x) < HOLE.x;
      const kindBody = (nx, ny, nz, cx, cy, cz) => (ny < -0.5 ? 'D' : Math.abs(nx) >= 0.5 ? (nx < 0 ? 'L' : 'R') : ny >= 0.45 ? (cz > HOLE.z0 - 0.02 && cz < HOLE.z1 + 0.02 && Math.abs(cx) < 1.5 ? 'D' : 'T') : 'P');
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
        cabWindows(g2, false);
        for (let s = 0; s < 2; s++) {
          g2.save(); g2.translate(0, s * 400); if (s === 1) { g2.translate(1024, 0); g2.scale(-1, 1); }
          const cz = (z) => (z - CZ0) / (CZ1 - CZ0) * 1024, cy = (y) => (CY1 - y) / (CY1 - CY0) * 400;
          // the door seam
          g2.strokeStyle = 'rgba(0,0,0,0.45)'; g2.lineWidth = 5; g2.beginPath(); g2.moveTo(cz(0.66), cy(2.5)); g2.lineTo(cz(0.66), cy(3.3)); g2.stroke();
          g2.restore();
        }
        g2.fillStyle = P; g2.fillRect(1000, 1510, 24, 24);
        cabTex.needsUpdate = true;
      }
      // (cut: the glass black and the rest white, the seal left round the openings - the cockpit's alpha map)
      function cabWindows(g2, cut) {
        for (let s = 0; s < 2; s++) {
          g2.save(); g2.translate(0, s * 400); if (s === 1) { g2.translate(1024, 0); g2.scale(-1, 1); }
          const cz = (z) => (z - CZ0) / (CZ1 - CZ0) * 1024, cy = (y) => (CY1 - y) / (CY1 - CY0) * 400;
          g2.fillStyle = cut ? '#000' : '#07090b'; g2.strokeStyle = cut ? '#fff' : '#111'; g2.lineWidth = 10; g2.lineJoin = 'round';
          g2.beginPath(); g2.moveTo(cz(-0.46), cy(2.86)); g2.lineTo(cz(0.6), cy(2.86)); g2.lineTo(cz(0.6), cy(3.33)); g2.quadraticCurveTo(cz(-0.1), cy(3.38), cz(-0.33), cy(3.28)); g2.closePath(); g2.fill(); g2.stroke();
          g2.beginPath(); g2.moveTo(cz(0.72), cy(2.86)); g2.lineTo(cz(1.16), cy(2.86)); g2.quadraticCurveTo(cz(1.04), cy(3.16), cz(0.72), cy(3.28)); g2.closePath(); g2.fill(); g2.stroke();
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
          g2.fillStyle = cut ? '#000' : gl; g2.fill(); g2.lineJoin = 'round'; g2.lineWidth = 10; g2.strokeStyle = cut ? '#fff' : '#0d0d0e'; g2.stroke();
        };
        pane(800, 2.9, 3.33, 1.0, 0.84, 0.03);                                               // windshield
        pane(1150, 2.98, 3.28, 0.92, 0.72, 0.02);                                            // back glass
      }
      const CZ0 = -0.7, CZ1 = 1.55, CY0 = 2.45, CY1 = 3.52;
      const cabTex = canvasTex(1024, 1536, () => {});
      const livMat = new THREE.MeshPhysicalMaterial({ map: livTex, metalness: 0.05, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.15 });
      const cabMat = new THREE.MeshPhysicalMaterial({ map: cabTex, metalness: 0.05, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.1 });
      drawAvenger(PAINTS[opts.paint] || 0x6fd21e);
      // the main body
      { const g = mapUV(loft(range(-3.0, 2.85, 150), (z) => ({ w: tbl(HWT, z), yb: archY(z), yt: tbl(TOP, z), nT: 3.2, nB: 9 }), 44, inHole), LW, LH, placeBody, kindBody);
        const m = add(bodyG, g, livMat, 0, 0, 0); m.castShadow = true; }
      // the tub under the cab: a floor, walls round the opening, a firewall behind the seat and a lid over the engine
      { const tub = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9, side: THREE.DoubleSide }), FY = 2.15, X = HOLE.x + 0.08, Z0 = HOLE.z0 - 0.04, Z1 = HOLE.z1 + 0.04, FW = 0.75;
        add(bodyG, new THREE.PlaneGeometry(2 * X, FW - Z0), tub, 0, FY, (Z0 + FW) / 2, -Math.PI / 2, 0, 0, false);
        add(bodyG, new THREE.PlaneGeometry(2 * X, 0.55), tub, 0, FY + 0.27, Z0, 0, 0, 0, false);
        for (const sx of [-1, 1]) add(bodyG, new THREE.PlaneGeometry(Z1 - Z0, 0.5), tub, sx * X, FY + 0.25, (Z0 + Z1) / 2, 0, Math.PI / 2, 0, false);
        add(bodyG, new THREE.PlaneGeometry(2 * X, 0.38), tub, 0, FY + 0.19, FW, 0, 0, 0, false);
        add(bodyG, new THREE.PlaneGeometry(2 * X, Z1 - FW), tub, 0, FY + 0.38, (FW + Z1) / 2, -Math.PI / 2, 0, 0, false);
        add(bodyG, new THREE.PlaneGeometry(2 * X, 0.55), tub, 0, FY + 0.27, Z1, 0, 0, 0, false); }
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
      const cabG = new THREE.Group(); bodyG.add(cabG); let cabIn = null;
      { const CT = [[-0.66, 2.6], [-0.56, 2.86], [-0.42, 3.28], [-0.28, 3.44], [0.4, 3.48], [0.8, 3.43], [1.05, 3.24], [1.3, 2.94], [1.52, 2.66]];
        const CW = [[-0.66, 1.4], [-0.3, 1.48], [0.9, 1.48], [1.52, 1.38]];
        // (sideways faces: the side views at their (z, y); forward / backward faces: the front / back views at their (x, y);
        // the roof: plain - every boundary between them is body colour, so no seam shows)
        const placeCab = (k, x, y, z) => { const u = (z - CZ0) / (CZ1 - CZ0) * 1024, v = (CY1 - y) / (CY1 - CY0) * 400, fx = (x + 1.6) / 3.2 * 1024, fv = (CY1 - y) / (CY1 - CY0) * 350;
          return k === 'L' ? [u, v] : k === 'R' ? [1024 - u, 400 + v] : k === 'F' ? [fx, 800 + fv] : k === 'B' ? [fx, 1150 + fv] : [1012, 1522]; };
        const kindCab = (nx, ny, nz) => (Math.abs(nx) >= 0.45 ? (nx < 0 ? 'L' : 'R') : nz <= -0.3 ? 'F' : nz >= 0.3 ? 'B' : 'P');
        const g = mapUV(loft(range(-0.66, 1.52, 90), (z) => ({ w: tbl(CW, z), yb: 2.4, yt: tbl(CT, z), nT: 3.0, nB: 9 }), 56), 1024, 1536, placeCab, kindCab);
        add(cabG, g, cabMat, 0, 0, 0);
        const cutTex = canvasTex(1024, 1536, (g2) => { g2.fillStyle = '#fff'; g2.fillRect(0, 0, 1024, 1536); cabWindows(g2, true); });
        cabIn = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.9, side: THREE.BackSide, alphaMap: cutTex, alphaTest: 0.5 }));
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
      return { cabG, cabIn, repaint: drawAvenger };
    }
    const BODY = opts.body === 'avenger' ? bodyAvenger() : FT ? bodyFiretruck() : bodyWreckoning(), cabG = BODY.cabG;

    // ---------------------------------------------------------------- chassis (chromoly tube frame)
    const chassis = new THREE.Group(); model.add(chassis);
    const T = (a, b, r) => tubeAB(chassis, a, b, r || 0.032, M.chassis, 10);
    // (the cage hoops round the driver's head: hidden in the cockpit view - they'd fill it)
    const hoops = new THREE.Group(); chassis.add(hoops);
    const RY = 1.02, UY = 1.92, CX = 0.44;
    // (the jet fire truck's: its rails end under the cab's front and the box's back)
    const RF = FT ? -2.45 : -2.45, RB = FT ? 2.65 : 2.45, H = FT ? () => {} : (a, b) => tubeAB(hoops, a, b, 0.032, M.chassis, 10);
    for (const sx of [-1, 1]) {
      const x = sx * CX;
      // main rails, kicked up at both ends
      T(V3(x, 1.3, RF), V3(x, RY, -1.35), 0.04); T(V3(x, RY, -1.35), V3(x, RY, 1.35), 0.04); T(V3(x, RY, 1.35), V3(x, 1.3, RB), 0.04);
      // upper frame over the middle, dropping to the shock towers
      T(V3(x * 1.2, UY, -1.3), V3(x * 1.2, UY, 1.5), 0.036);
      T(V3(x * 1.2, UY, -1.3), V3(x, 1.3, RF)); T(V3(x * 1.2, UY, 1.5), V3(x, 1.3, RB));
      for (const z of [-1.3, -0.55, 0.45, 1.5]) T(V3(x, RY, z), V3(x * 1.2, UY, z));
      T(V3(x, RY, -1.35), V3(x * 1.2, UY, -0.55)); T(V3(x, RY, 1.35), V3(x * 1.2, UY, 0.45));
      // the driver's cage: hoops up into the cab
      H(V3(x * 1.1, UY, -0.55), V3(x * 1.3, 3.34, -0.3)); H(V3(x * 1.1, UY, 0.45), V3(x * 1.3, 3.36, 0.62));
      H(V3(x * 1.3, 3.34, -0.3), V3(x * 1.3, 3.36, 0.62));
    }
    for (const z of [RF, -1.35, -0.55, 0.45, 1.35, RB]) T(V3(-CX, z === RF || z === RB ? 1.3 : RY, z), V3(CX, z === RF || z === RB ? 1.3 : RY, z), 0.034);
    for (const z of [-1.3, 1.5]) T(V3(-CX * 1.2, UY, z), V3(CX * 1.2, UY, z));
    H(V3(-CX * 1.3, 3.34, -0.3), V3(CX * 1.3, 3.34, -0.3)); H(V3(-CX * 1.3, 3.36, 0.62), V3(CX * 1.3, 3.36, 0.62));
    // skid plate under the driver, seat
    add(chassis, rbox(0.9, 0.02, 1.0, 0.008), M.alu, 0, RY - 0.05, 0);
    // (the seat sits high on a riser - the driver has to see over that long hood)
    const SL = opts.body === 'avenger' ? 0.06 : 0;
    // (the fire truck's driver sits in its cab, on the left, over the front axle: the seat, the driver, the wheel and the
    // dash all moved there by OFF)
    const OFF = FT ? V3(-0.55, -0.4, -1.75) : V3(0, 0, 0), seatG = new THREE.Group(); seatG.position.copy(OFF); chassis.add(seatG);
    add(seatG, rbox(0.56, 0.07, 0.55, 0.03), M.black, 0, 2.24 + SL, 0.12);
    add(seatG, rbox(0.56, 0.75, 0.08, 0.04), M.black, 0, 2.61 + SL, 0.4, -0.12, 0, 0);
    if (!FT) add(seatG, rbox(0.5, 0.34 + SL, 0.5, 0.03), M.alu, 0, 2.05 + SL / 2, 0.12);

    // ---------------------------------------------------------------- engine: blown big-block behind the driver
    const eng = new THREE.Group(); if (!FT) model.add(eng);
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
      if (!FT) tips.push(toRoot(e.clone().add(e.clone().sub(c).normalize().multiplyScalar(0.04))));
    }
    // transmission / transfer case under the driver, driveshafts fore and aft
    add(eng, rbox(0.34, 0.3, 0.6, 0.04), M.cast, 0, 1.1, 0.45);
    add(eng, rbox(0.3, 0.26, 0.32, 0.04), M.cast, 0, 0.98, 0.0);

    // ---------------------------------------------------------------- driver
    const driver = new THREE.Group(); driver.position.copy(OFF); model.add(driver);
    const sY = 2.28 + SL, sZ = 0.12;
    add(driver, rbox(0.38, 0.52, 0.26, 0.1), M.suit, 0, sY + 0.34, sZ + 0.08, -0.1, 0, 0);
    for (const sx of [-1, 1]) {
      add(driver, rbox(0.05, 0.52, 0.012, 0.005), M.red, sx * 0.08, sY + 0.36, sZ - 0.05, -0.1, 0, 0, false);
      tubeAB(driver, V3(sx * 0.18, sY + 0.52, sZ + 0.02), V3(sx * 0.16, sY + 0.36, sZ - 0.38), 0.045, M.suit);
      tubeAB(driver, V3(sx * 0.1, sY + 0.1, sZ - 0.05), V3(sx * 0.12, sY + 0.12, sZ - 0.55), 0.06, M.suit);
    }
    add(driver, new THREE.SphereGeometry(0.15, 24, 16), M.helmet, 0, sY + 0.74, sZ + 0.03);
    { const vg = new THREE.SphereGeometry(0.153, 24, 12, -Math.PI / 2 - 0.85, 1.7, 1.28, 0.5); add(driver, vg, M.visor, 0, sY + 0.74, sZ + 0.03, 0, 0, 0, false); }
    const eye = V3(0, sY + 0.76, sZ - 0.06).add(OFF);

    // ---------------------------------------------------------------- cockpit: dash, wheel, pillars (seen from the seat)
    const cage = new THREE.Group(); model.add(cage);
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 512; clusterCanvas.height = 300;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace;
    const dash = new THREE.Group(); cage.add(dash);
    if (opts.body === 'avenger') { dash.position.set(0.42, 2.92, -0.4); dash.rotation.set(-0.9, -0.12, 0); } else { dash.position.set(0.32, sY + 0.37, sZ - 0.7).add(OFF); dash.rotation.set(-0.45, -0.3, 0); }
    add(dash, rbox(0.34, 0.2, 0.05, 0.02), M.black, 0, 0, -0.03);
    add(dash, new THREE.PlaneGeometry(0.31, 0.18), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0, 0.0, 0, 0, 0, false);
    const colG = new THREE.Group(); colG.position.set(0, sY + (opts.body === 'avenger' ? 0.42 : 0.28), sZ - (opts.body === 'avenger' ? 0.3 : 0.4)).add(OFF); colG.rotation.x = -0.6; cage.add(colG);
    { const col = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 10); col.rotateX(Math.PI / 2); add(colG, col, M.polish, 0, 0, -0.15); }
    const steerWheel = new THREE.Group(); colG.add(steerWheel);
    add(steerWheel, new THREE.TorusGeometry(0.16, 0.018, 10, 32), M.black, 0, 0, 0);
    for (let k = 0; k < 3; k++) { const sp = add(steerWheel, new THREE.BoxGeometry(0.018, 0.15, 0.01), M.polish, 0, 0, 0.005); sp.rotation.z = k * 2.094; sp.geometry.translate(0, 0.075, 0); }
    add(steerWheel, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.polish, 0, 0, 0.01, Math.PI / 2, 0, 0);
    // the cab's inside from the seat: dark door panels below the windows, the headliner, the A-pillars
    const inside = new THREE.Group(); cage.add(inside);
    if (FT) {
      // (the fire truck's cab stays: you look out of its own windows - the dash across under the windshield)
      add(inside, rbox(2.3, 0.26, 0.42, 0.05), M.black, 0, 2.1, -2.3);
    } else if (opts.body === 'avenger') {
      // (the AVENGER: its own cab seen from within, and a dash across under the windshield - behind the cab's skin)
      inside.add(BODY.cabIn);
      add(inside, rbox(2.5, 0.28, 0.2, 0.05), M.black, 0, 2.72, -0.44);
      add(inside, rbox(2.4, 0.22, 0.03, 0.01), M.black, 0, 2.68, -0.33, 0, 0, 0, false);
    } else {
      for (const sx of [-1, 1]) {
        add(inside, new THREE.PlaneGeometry(1.5, 0.2), M.inner, sx * 1.37, 2.54, 0.25, 0, sx * Math.PI / 2, 0, false);
        tubeAB(inside, V3(sx * 1.36, 2.46, -0.48), V3(sx * 1.36, 3.36, -0.06), 0.05, M.black);
      }
      add(inside, new THREE.PlaneGeometry(2.8, 1.0), M.inner, 0, 3.42, 0.34, Math.PI / 2, 0, 0, false);
      add(inside, rbox(2.7, 0.14, 0.34, 0.04), M.black, 0, 2.5, -0.36);            // dash top along the windshield base
    }

    // ---------------------------------------------------------------- wheels: 66x43.00-25 on beadlocks, planetary hubs
    // tyre carcass: tall rounded sidewalls bulging past the rim, a wide flat tread
    const tyreGeo = latheX([[RRIM + 0.01, -0.5], [0.4, -0.54], [0.55, -0.545], [0.68, -0.535], [0.77, -0.505], [0.815, -0.46], [RT - 0.02, -0.39],
      [RT - 0.02, 0.39], [0.815, 0.46], [0.77, 0.505], [0.68, 0.535], [0.55, 0.545], [0.4, 0.54], [RRIM + 0.01, 0.5]], 64);
    // hand-cut paddle tread: chevron lugs across the crown and wrapping over the shoulders (mirrored for the left)
    // (deep: the off-road package's full-depth lugs - ~1 in taller, and the physics' rolling radius 2 cm bigger with them)
    function lugs(dir, deep) {
      if (FT && !deep) {
        // (the fire truck's flotation tyres: low bars curving across the crown, the shoulders smooth)
        const list = [], N = 24;
        for (let k = 0; k < N; k++) for (const side of [-1, 1]) {
          for (const [o, a] of [[0.12, 0.25], [0.32, 0.5]]) { const b = new THREE.BoxGeometry(0.22, 0.025, 0.08); b.rotateY(-side * dir * a); b.translate(side * o, RT + 0.004, side * dir * (o - 0.1) * 0.6);
            b.rotateX(k * Math.PI * 2 / N + (side > 0 ? Math.PI / N : 0)); list.push(b); }
        }
        return mergeGeos(list);
      }
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
      if (FT) {
        // (the fire truck's: plain painted steel, light grey - a rolled lip, the dish, the centre plate; no lettering)
        M.ftWheel = M.ftWheel || new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
        const lip = new THREE.TorusGeometry(RRIM + 0.015, 0.025, 10, 56); lip.rotateY(Math.PI / 2); add(g, lip, M.ftWheel, 0.47, 0, 0);
        const dsh = new THREE.CylinderGeometry(0.2, RRIM, 0.3, 48, 1, true); dsh.rotateZ(Math.PI / 2); add(g, dsh, M.ftWheel, 0.33, 0, 0);
        const brl = new THREE.CylinderGeometry(RRIM, RRIM, 0.95, 48, 1, true); brl.rotateZ(Math.PI / 2); add(g, brl, M.ftWheel, 0, 0, 0);
        const plt = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 40); plt.rotateZ(Math.PI / 2); add(g, plt, M.ftWheel, 0.2, 0, 0);
        const bck = new THREE.CircleGeometry(RRIM, 40); bck.rotateY(-Math.PI / 2); add(g, bck, M.steel, -0.44, 0, 0, 0, 0, 0, false);
        return;
      }
      // 25 in wheel: outer beadlock ring with bolts, deep dish, centre with the planetary hub
      const ring = new THREE.TorusGeometry(RRIM + 0.02, 0.03, 10, 56); ring.rotateY(Math.PI / 2); add(g, ring, M.polish, 0.47, 0, 0);
      const bl = new THREE.CylinderGeometry(RRIM + 0.05, RRIM + 0.05, 0.05, 56, 1, true); bl.rotateZ(Math.PI / 2); add(g, bl, FT ? M.alu : M.black, 0.47, 0, 0);
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
      sl.position.set(sx * (FT ? 0.9 : 1.32), (FT ? 2.0 : 1.95) - cgH, (FT ? -2.6 : -3.0) + zOff);
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
      // (the fire truck's light bar: the reds and whites flash with the lights on)
      if (M.beaconA) { const t = performance.now() / 1000, ph = Math.floor(t * 6) & 1; M.beaconA.emissiveIntensity = o.headlights ? (ph ? 4 : 0.3) : 0.3; M.beaconB.emissiveIntensity = o.headlights ? (ph ? 0.1 : 3) : 0.1; }
    }
    // cockpit view: hide the driver and the cab shell around your head (the cockpit has its own pillars and dash)
    function setInteriorVisible(v, cockpit) {
      driver.visible = !cockpit; inside.visible = !!cockpit; hoops.visible = !cockpit; cabG.visible = !cockpit || FT;
      if (FT) BODY.eyeGlass.opacity = cockpit ? 0.12 : 0.55;
    }
    // the jet fire truck's afterburner: a shimmer running dry, a long flame out of the tailpipe lit (the tune's bigger
    // engine a bigger flame)
    function setJet(N, ab, thr, dt) {
      const J = BODY.jetFx; J.t += dt;
      const on = ab > 0.02 || thr > 0.3;
      J.outer.visible = J.core.visible = on;
      if (!on) return;
      J.outer.scale.z = (0.35 + 1.9 * ab + 0.25 * thr) * 1.4; J.core.scale.z = (0.2 + 0.95 * ab + 0.1 * thr) * 1.4;
      for (const m of [J.outer.material, J.core.material]) { m.uniforms.uAB.value = ab; m.uniforms.uThr.value = thr; m.uniforms.uT.value = J.t; }
    }
    function setJetSize(sz) { BODY.jetFx.g.scale.setScalar(clamp(sz / 2.6, 0.7, 1.6)); }
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
      setJet: FT ? setJet : undefined, setJetSize: FT ? setJetSize : undefined,
    };
  }

  root.HCMonster = { build };
})(typeof self !== 'undefined' ? self : this);
