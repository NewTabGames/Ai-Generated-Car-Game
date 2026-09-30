/* Hellcat Drive — procedural 2019+ Challenger SRT Hellcat model (exterior + interior + wheels).
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Dimensions from the spec sheet: 5017 L x 1923 W x 1454 H, 2946 wheelbase, 115 mm ground clearance. */
(function (root) {
  'use strict';

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function table(tb, x) {
    if (x <= tb[0][0]) return tb[0][1];
    for (let i = 1; i < tb.length; i++) if (x <= tb[i][0]) {
      const a = tb[i - 1], b = tb[i], t = (x - a[0]) / (b[0] - a[0]);
      const s = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      return a[1] + (b[1] - a[1]) * s;
    }
    return tb[tb.length - 1][1];
  }

  const Z_FRONT = -2.47, Z_REAR = 2.60, AXLE = 1.473, AXLE_Y = 0.357, ARCH_R = 0.425;
  let WIDE = 0;   // 1 while building the widebody (Demon 170): bolted-on fender flares around both axles

  // ------------------------------------------------------------------ body profile
  const YT = [[-2.47, 0.835], [-2.445, 0.868], [-2.38, 0.889], [-2.1, 0.907], [-1.6, 0.933], [-1.1, 0.962], [-0.64, 0.995],
    [0.0, 1.008], [0.8, 1.018], [1.62, 1.028], [2.0, 1.034], [2.40, 1.030], [2.50, 1.036], [2.555, 1.062], [2.585, 1.045], [2.60, 1.01]];
  const YB = [[-2.47, 0.2], [-2.43, 0.158], [-2.1, 0.15], [-1.98, 0.19], [1.95, 0.19], [2.10, 0.22], [2.48, 0.25], [2.60, 0.33]];
  function bodyYT(z) { return table(YT, z); }
  function bodyParams(z) {
    let W = 0.958;
    if (z < -1.85) W -= 0.14 * Math.pow((-1.85 - z) / (-1.85 - Z_FRONT), 2.6);
    if (z > 2.15) W -= 0.07 * Math.pow((z - 2.15) / (Z_REAR - 2.15), 2.2);
    W += 0.014 * Math.exp(-Math.pow((z - 1.55) / 0.55, 2));   // rear hips
    W += 0.007 * Math.exp(-Math.pow((z + 1.5) / 0.5, 2));     // front fender
    let yB = table(YB, z);
    for (const zc of [-AXLE, AXLE]) {
      const d = Math.abs(z - zc);
      if (d < ARCH_R) yB = Math.max(yB, AXLE_Y + Math.sqrt(ARCH_R * ARCH_R - d * d));
      if (d < 0.62) W += 0.008 * (1 - (d / 0.62) ** 2);
      if (WIDE && d < 0.86) W += 0.037 * Math.pow(1 - (d / 0.86) ** 2, 0.6);
    }
    const yT = bodyYT(z);
    let ySh = 0.845 + 0.045 * sstep(-2.2, 2.3, z);
    ySh = Math.min(ySh, yT - 0.07);
    let Wt = 0.74;
    if (z > -0.7) Wt = lerp(0.74, 0.86, sstep(-0.7, -0.3, z));
    if (z > 1.55) Wt = lerp(0.86, 0.80, sstep(1.55, 1.9, z));
    Wt = Math.min(Wt, W - 0.06);
    const crown = z < -0.62 ? 0.018 : 0.008;
    return { W, yB, ySh, yT, Wt, crown };
  }
  function bodySection(z) {
    const { W, yB, ySh, yT, Wt, crown } = bodyParams(z);
    // recessed scallop band along the doors (the Challenger's signature side cove), fades out at the wheels
    const sc = 0.014 * sstep(-1.02, -0.82, z) * (1 - sstep(0.82, 1.04, z));
    const P = [];
    P.push([0, yB], [W * 0.55, yB], [W - 0.07, yB + 0.004], [W - 0.018, yB + 0.03]);
    const ya = Math.min(yB + 0.075, ySh - 0.04);
    P.push([W, ya]);
    for (let k = 1; k <= 8; k++) {
      const t = k / 9, y = ya + (ySh - 0.02 - ya) * t;
      const band = sstep(0.32, 0.36, y) * (1 - sstep(0.53, 0.57, y));
      P.push([W + 0.013 * Math.sin(Math.PI * t) - sc * band, y]);
    }
    P.push([W + 0.006, ySh]);                 // shoulder crease
    P.push([W - 0.008, ySh + 0.012]);
    // smooth top corner: quadratic from just above the crease to the flat top
    const x0 = W - 0.008, y0 = ySh + 0.012, cx = W - 0.035, cy = yT + 0.004;
    for (const t of [0.18, 0.36, 0.54, 0.72, 0.88]) {
      const u = 1 - t;
      P.push([u * u * x0 + 2 * u * t * cx + t * t * Wt, u * u * y0 + 2 * u * t * cy + t * t * yT]);
    }
    P.push([Wt, yT]);
    P.push([Wt * 0.7, yT + crown * 0.6]);
    P.push([Wt * 0.4, yT + crown * 0.9]);
    P.push([Wt * 0.15, yT + crown * 0.99]);
    P.push([0, yT + crown]);
    for (let i = 2; i < P.length; i++) if (P[i][1] < P[i - 1][1]) P[i][1] = P[i - 1][1];
    return P;
  }

  // ------------------------------------------------------------------ greenhouse profile
  const GT = [[-0.64, 0.995], [-0.40, 1.105], [-0.10, 1.272], [0.08, 1.378], [0.18, 1.420], [0.35, 1.437], [0.92, 1.438],
    [1.08, 1.426], [1.2, 1.382], [1.42, 1.245], [1.62, 1.108], [1.74, 1.03]];
  function ghSection(z) {
    const yBelt = bodyYT(z) - 0.004, yTop = table(GT, z);
    const h = Math.max(0, yTop - yBelt), k = clamp(h / 0.43, 0, 1);
    const xB = 0.80 - 0.035 * sstep(-0.2, -0.64, z) - 0.03 * sstep(1.38, 1.74, z);
    const xT = 0.60 - 0.02 * sstep(0.95, 1.4, z) - 0.03 * sstep(0.1, -0.3, z);
    const P = [[xB, yBelt], [xB - 0.045 * k, yBelt + 0.3 * h], [xB - 0.09 * k, yBelt + 0.6 * h], [xB - 0.13 * k, yBelt + 0.83 * h],
      [lerp(xB - 0.13 * k, xT + 0.03, 0.55), yBelt + 0.95 * h], [xT + 0.02, yTop - 0.003], [xT * 0.72, yTop + 0.006], [xT * 0.36, yTop + 0.011], [0, yTop + 0.012]];
    for (let i = 1; i < P.length; i++) if (P[i][0] > P[i - 1][0] - 1e-4) P[i][0] = P[i - 1][0] - 1e-4;
    return { P, yBelt, yTop, xB, xT };
  }
  function ghYatX(z, x) {
    const { P } = ghSection(z);
    x = Math.abs(x);
    for (let i = 1; i < P.length; i++) {
      if (x >= P[i][0]) { const a = P[i - 1], b = P[i], t = (x - a[0]) / (b[0] - a[0] || 1e-6); return lerp(a[1], b[1], clamp(t, 0, 1)); }
    }
    return P[P.length - 1][1];
  }
  function ghXatY(z, y) {
    const { P } = ghSection(z);
    for (let i = 1; i < P.length; i++) {
      if (y <= P[i][1]) { const a = P[i - 1], b = P[i], t = (y - a[1]) / (b[1] - a[1] || 1e-6); return lerp(a[0], b[0], clamp(t, 0, 1)); }
    }
    return P[P.length - 1][0];
  }

  // ------------------------------------------------------------------ loft helper
  function loft(THREE, stations, sectionFn, opts) {
    opts = opts || {};
    const rings = stations.map((z) => {
      const half = sectionFn(z);
      const ring = [];
      if (opts.open) {
        for (let i = 0; i < half.length; i++) ring.push([half[i][0], half[i][1]]);
        for (let i = half.length - 2; i >= 0; i--) ring.push([-half[i][0], half[i][1]]);
      } else {
        for (let i = half.length - 1; i >= 0; i--) ring.push([half[i][0], half[i][1]]);
        for (let i = 1; i < half.length - 1; i++) ring.push([-half[i][0], half[i][1]]);
      }
      return { z, ring, half };
    });
    const m = rings[0].ring.length, ns = rings.length;
    const pos = [], col = [], idx = [];
    const black = opts.blackBelow;
    for (let s = 0; s < ns; s++) {
      const r = rings[s];
      for (let i = 0; i < m; i++) {
        const [x, y] = r.ring[i];
        pos.push(x, y, r.z);
        let c = 1;
        if (black) {
          const hi = r.half.length;
          // ring index -> half index
          const hiIdx = opts.open ? (i < hi ? i : 2 * hi - 2 - i) : (i < hi ? hi - 1 - i : i - hi + 1);
          if (hiIdx <= 2) c = 0.04;
        }
        col.push(c, c, c);
      }
    }
    const segs = opts.open ? m - 1 : m;
    for (let s = 0; s < ns - 1; s++) for (let i = 0; i < segs; i++) {
      const a = s * m + i, b = s * m + (i + 1) % m, c = (s + 1) * m + i, d = (s + 1) * m + (i + 1) % m;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // orientation check: a vertex on the right side should face +x
    const nrm = g.attributes.normal;
    const probe = Math.floor(ns / 2) * m + (opts.open ? 2 : Math.floor(m / 4));
    if (nrm.getX(probe) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      g.setIndex(idx); g.computeVertexNormals();
    }
    return { geo: g, rings };
  }
  function capGeo(THREE, ring, z, facing) {
    let cx = 0, cy = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; }
    cx /= ring.length; cy /= ring.length;
    const pos = [cx, cy, z], idx = [];
    for (const p of ring) pos.push(p[0], p[1], z);
    for (let i = 0; i < ring.length; i++) {
      const a = 1 + i, b = 1 + (i + 1) % ring.length;
      if (facing < 0) idx.push(0, b, a); else idx.push(0, a, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal;
    if (Math.sign(n.getZ(0)) !== Math.sign(facing)) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      g.setIndex(idx); g.computeVertexNormals();
    }
    const cols = new Float32Array(pos.length).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  }
  function gridPatch(THREE, ns, nt, fn) {
    const pos = [], idx = [], uv = [];
    for (let i = 0; i <= ns; i++) for (let j = 0; j <= nt; j++) {
      const p = fn(i / ns, j / nt); pos.push(p[0], p[1], p[2]); uv.push(i / ns, j / nt);
    }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
      const a = i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function stationList(z0, z1, fine) {
    const out = [];
    let z = z0;
    while (z < z1) {
      out.push(z);
      let step = 0.05;
      for (const f of fine) if (Math.abs(z - f[0]) < f[1]) step = Math.min(step, f[2]);
      z += step;
    }
    out.push(z1);
    return out;
  }
  function canvasTex(THREE, w, h, draw, srgb) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function mergeGeos(THREE, geos) {
    // minimal merge: non-indexed position/normal(/uv)
    const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) {
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return out;
  }

  // ------------------------------------------------------------------ paints
  const PAINTS = {
    'TorRed': 0xb3121a, 'Pitch Black': 0x0a0a0c, 'Plum Crazy': 0x4b1f78, 'Go Mango': 0xf2570f, 'B5 Blue': 0x1e6fc4,
    'F8 Green': 0x2f3d25, 'White Knuckle': 0xe6e6e3, 'Destroyer Grey': 0x55595e, 'Octane Red': 0x5e0b14,
    'Sinamon Stick': 0x7a3317, 'Frostbite': 0x2753a6, 'Triple Nickel': 0x8b8e92, 'Hellraisin': 0x2c1227, 'Smoke Show': 0x474c52, 'Sublime': 0x6cbf2a,
    // (the Car Crushers 2 cars' colours)
    'Stainless': 0xaeb2b6, 'Sand': 0xbfa07e, 'Saddle': 0x7b4a2b, 'Buttercup': 0xf2c21b, 'Bluebird': 0x2f6fd0, 'Bay Blue': 0x1f4fd1, 'Bronze Yellow': 0xc6cf2e, 'Potty Blue': 0x3d7cc9, 'Crimson': 0xb01020,
  };

  // ------------------------------------------------------------------ builder
  function build(THREE, opts) {
    opts = opts || {};
    const demon = opts.variant === 'demon', dragpak = opts.variant === 'dragpak';
    WIDE = demon ? 1 : 0;
    const cgH = opts.cgHeight || 0.53, zOff = opts.zOff || 0.2062;
    const rootG = new THREE.Group(); rootG.name = 'hellcat';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const ext = new THREE.Group(); model.add(ext);
    const intr = new THREE.Group(); model.add(intr);

    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] || PAINTS.TorRed, metalness: 0.45, roughness: 0.33, clearcoat: 1, clearcoatRoughness: 0.035, vertexColors: true });
    M.paintPlain = new THREE.MeshPhysicalMaterial({ color: M.paint.color, metalness: 0.45, roughness: 0.33, clearcoat: 1, clearcoatRoughness: 0.035 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6, metalness: 0.15 });
    M.gloss = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.18, metalness: 0.3 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: 0.1, metalness: 1 });
    M.darkChrome = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.18, metalness: 1 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0x05080b, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.72, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false });
    M.lens = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.18, depthWrite: false });
    M.halo = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 2.2 });
    M.headlamp = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, emissive: 0xfff4e0, emissiveIntensity: 0.0, roughness: 0.15, metalness: 0.9 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x3a0306, emissive: 0xff1010, emissiveIntensity: 0.35, roughness: 0.25 });
    M.tailRing = new THREE.MeshStandardMaterial({ color: 0x600000, emissive: 0xff1a12, emissiveIntensity: 1.2, roughness: 0.3 });
    M.reverse = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 });
    M.amber = new THREE.MeshStandardMaterial({ color: 0x7a4a00, emissive: 0xff8a00, emissiveIntensity: 0.25, roughness: 0.3 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0 });
    M.rim = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.42, metalness: 0.65 });
    M.rimLip = new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.25, metalness: 1 });
    M.rotor = new THREE.MeshStandardMaterial({ color: 0x77777a, roughness: 0.38, metalness: 0.9 });
    M.hat = new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.5, metalness: 0.8 });
    M.caliper = new THREE.MeshStandardMaterial({ color: 0xc40f12, roughness: 0.35, metalness: 0.3 });
    M.grille = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.5, metalness: 0.2 });
    // interior
    M.dash = new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.85 });
    M.trim = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.7, metalness: 0.1 });
    M.leather = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.62 });
    M.alcantara = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.95 });
    M.red = new THREE.MeshStandardMaterial({ color: 0x9d0a0a, roughness: 0.5 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0x8c8e92, roughness: 0.32, metalness: 0.9 });
    M.carpet = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1 });
    // race-car materials (Drag Pak)
    const carbonTex = canvasTex(THREE, 128, 128, (g, w, h) => {
      // 2x2 twill weave
      const n = 8, c = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const on = ((i + j) >> 1) % 2 === 0;
        const gr = g.createLinearGradient(i * c, j * c, i * c + (on ? c : 0), j * c + (on ? 0 : c));
        gr.addColorStop(0, on ? '#1c1d20' : '#101113'); gr.addColorStop(0.5, on ? '#34363b' : '#1a1b1e'); gr.addColorStop(1, on ? '#1c1d20' : '#101113');
        g.fillStyle = gr; g.fillRect(i * c, j * c, c, c);
      }
    });
    carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping; carbonTex.repeat.set(8, 8);
    M.carbon = new THREE.MeshPhysicalMaterial({ map: carbonTex, roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 });
    M.cage = new THREE.MeshStandardMaterial({ color: 0x3c3f45, roughness: 0.38, metalness: 0.65 });
    M.pad = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.95 });
    M.polish = new THREE.MeshStandardMaterial({ color: 0xe2e4e8, roughness: 0.12, metalness: 1 });
    M.sheet = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.48, metalness: 0.85 });
    M.calBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.6 });
    M.harness = new THREE.MeshStandardMaterial({ color: 0xb3121a, roughness: 0.8 });
    // planar UVs (for textured lofts)
    const planarUV = (geo, fn) => {
      const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { const r = fn(p.getX(i), p.getY(i), p.getZ(i)); uv[i * 2] = r[0]; uv[i * 2 + 1] = r[1]; }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
    };
    // round tube between two points
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), L = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, L, seg || 12), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0, 0, 0, false);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    // body side / top surface lookups (for decals that hug the paint)
    const sideXat = (z, y) => {
      const P = bodySection(z);
      for (let i = 4; i < P.length; i++) if (P[i][1] >= y) { const a = P[i - 1], b = P[i], t = clamp((y - a[1]) / ((b[1] - a[1]) || 1e-6), 0, 1); return lerp(a[0], b[0], t); }
      return P[P.length - 1][0];
    };
    const topYat = (z, x) => {
      const P = bodySection(z);
      x = Math.abs(x);
      for (let i = P.length - 1; i > 0; i--) if (P[i - 1][0] >= x) { const a = P[i], b = P[i - 1], t = clamp((x - a[0]) / ((b[0] - a[0]) || 1e-6), 0, 1); return lerp(a[1], b[1], t); }
      return P[P.length - 1][1];
    };

    const add = (parent, geo, mat, x, y, z, rx, ry, rz, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = cast !== false; m.receiveShadow = true;
      parent.add(m); return m;
    };

    // ---------------- body shell
    const fine = [[-AXLE, 0.52, 0.012], [AXLE, 0.52, 0.012], [Z_FRONT, 0.12, 0.012], [Z_REAR, 0.12, 0.012]];
    const bodyL = loft(THREE, stationList(Z_FRONT, Z_REAR, fine), bodySection, { blackBelow: true });
    {
      // open the cabin: drop the body-top quads inside the greenhouse footprint
      const g = bodyL.geo, pa = g.attributes.position, idx = g.index.array, keep = [];
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const cx = (pa.getX(a) + pa.getX(b) + pa.getX(c)) / 3, cy = (pa.getY(a) + pa.getY(b) + pa.getY(c)) / 3, cz = (pa.getZ(a) + pa.getZ(b) + pa.getZ(c)) / 3;
        if (cz > -0.6 && cz < 1.70 && cy > bodyYT(cz) - 0.03 && Math.abs(cx) < ghSection(cz).xB - 0.012) continue;
        keep.push(a, b, c);
      }
      g.setIndex(keep);
    }
    add(ext, bodyL.geo, M.paint);
    const r0 = bodyL.rings[0].ring, rN = bodyL.rings[bodyL.rings.length - 1].ring;
    add(ext, capGeo(THREE, r0, Z_FRONT, -1), M.paint);
    add(ext, capGeo(THREE, rN, Z_REAR, 1), M.paint);

    // ---------------- greenhouse: ring points are placed so every glass edge falls exactly on a mesh line
    // (smooth pillars, no stair-steps). Per half-ring: belt seal (2) | side glass (8) | roof rail / A-pillar (7) | top (12).
    const WS = [-0.615, 0.128], RW = [1.13, 1.70], SG = [-0.52, 1.53];
    const wsX = (z) => lerp(0.725, 0.555, (z - WS[0]) / (WS[1] - WS[0]));
    const rwX = (z) => lerp(0.53, 0.71, (z - RW[0]) / (RW[1] - RW[0]));
    const SEG = [2, 8, 7, 12], B1 = 2, B2 = 10, B3 = 17, NH = 30;
    function ghRing(z) {
      const sec = ghSection(z), P = sec.P;
      const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const tot = L[L.length - 1] || 1e-6;
      const at = (d) => { let i = 1; while (i < L.length - 1 && L[i] < d) i++; const t = clamp((d - L[i - 1]) / ((L[i] - L[i - 1]) || 1e-6), 0, 1); return [lerp(P[i - 1][0], P[i][0], t), lerp(P[i - 1][1], P[i][1], t)]; };
      const arcY = (y) => { for (let i = 1; i < P.length; i++) if (P[i][1] >= y) { const t = clamp((y - P[i - 1][1]) / ((P[i][1] - P[i - 1][1]) || 1e-6), 0, 1); return L[i - 1] + (L[i] - L[i - 1]) * t; } return tot; };
      const arcX = (x) => { for (let i = 1; i < P.length; i++) if (P[i][0] <= x) { const t = clamp((P[i - 1][0] - x) / ((P[i - 1][0] - P[i][0]) || 1e-6), 0, 1); return L[i - 1] + (L[i] - L[i - 1]) * t; } return tot; };
      const y0 = sec.yBelt + 0.012, y1 = Math.min(sec.yTop - 0.06, 1.405);
      const s0 = Math.min(arcY(y0), tot * 0.5), s1 = Math.max(s0, Math.min(arcY(Math.max(y0, y1)), tot * 0.8));
      let s2 = (z >= WS[0] && z <= WS[1]) ? arcX(wsX(z)) : (z >= RW[0] && z <= RW[1]) ? arcX(rwX(z)) : lerp(s1, tot, 0.3);
      s2 = Math.min(Math.max(s2, s1 + 1e-4), tot - 1e-3);
      const cuts = [0, s0, s1, s2, tot], pts = [];
      for (let k = 0; k < 4; k++) for (let j = 0; j < SEG[k]; j++) pts.push(at(lerp(cuts[k], cuts[k + 1], j / SEG[k])));
      pts.push(at(tot));
      return pts;
    }
    // 0 paint, 1 glass, 2 black trim / frit band — by half-ring segment index and station mid-z
    function ghClass(i, zc) {
      if (i >= B1 && i < B2) {
        if (zc > SG[0] && zc < SG[1]) return (i === B1 || i === B2 - 1 || zc < SG[0] + 0.05 || zc > SG[1] - 0.03 || Math.abs(zc - 0.93) < 0.02) ? 2 : 1;
        return 0;
      }
      if (i >= B3) {
        if (zc > WS[0] && zc < WS[1]) return (i === B3 || zc < WS[0] + 0.025 || zc > WS[1] - 0.03) ? 2 : 1;
        if (zc > RW[0] && zc < RW[1]) return (i === B3 || zc < RW[0] + 0.025 || zc > RW[1] - 0.025) ? 2 : 1;
      }
      if (i < B1 && zc > SG[0] && zc < SG[1]) return 2;
      return 0;
    }
    {
      const keyZ = [WS[0], WS[0] + 0.025, SG[0], SG[0] + 0.05, WS[1] - 0.03, WS[1], 0.91, 0.95, RW[0], RW[0] + 0.025, SG[1] - 0.03, SG[1], RW[1] - 0.025, RW[1]];
      const zs = [];
      for (let z = -0.64; z < 1.74; z += 0.02) zs.push(z);
      zs.push(1.74, ...keyZ);
      zs.sort((a, b) => a - b);
      const Z = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 0.004);
      const MR = 2 * NH - 1, pos = [];
      for (const z of Z) {
        const r = ghRing(z);
        for (let i = 0; i < NH; i++) pos.push(r[i][0], r[i][1], z);
        for (let i = NH - 2; i >= 0; i--) pos.push(-r[i][0], r[i][1], z);
      }
      const lists = [[], [], []];
      for (let si = 0; si < Z.length - 1; si++) {
        const zc = (Z[si] + Z[si + 1]) / 2;
        for (let q = 0; q < MR - 1; q++) {
          const a = si * MR + q, b = a + 1, c = a + MR, d = c + 1;
          const hi = q < NH - 1 ? q : MR - 2 - q;
          lists[ghClass(hi, zc)].push(a, c, b, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(lists[0].concat(lists[2], lists[1])); g.computeVertexNormals();
      const probe = Math.floor(Z.length / 2) * MR + 4;
      if (g.attributes.normal.getX(probe) < 0) {
        for (const l of lists) for (let i = 0; i < l.length; i += 3) { const t = l[i + 1]; l[i + 1] = l[i + 2]; l[i + 2] = t; }
        g.setIndex(lists[0].concat(lists[2], lists[1])); g.computeVertexNormals();
      }
      g.clearGroups(); g.addGroup(0, lists[0].length, 0); g.addGroup(lists[0].length, lists[2].length, 2); g.addGroup(lists[0].length + lists[2].length, lists[1].length, 1);
      const ghMesh = add(ext, g, [M.paintPlain, M.glass, M.gloss]);
      ghMesh.castShadow = true;
      // interior lining: the same pillars/roof seen from inside (headliner, A/B/C-pillar trim) — exact shape, no boxes
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', g.attributes.position); lg.setAttribute('normal', g.attributes.normal);
      lg.setIndex(lists[0].concat(lists[2]));
      add(intr, lg, new THREE.MeshStandardMaterial({ color: 0x19191b, roughness: 0.9, side: THREE.BackSide }), 0, 0, 0, 0, 0, 0, false);
    }
    for (const side of [-1, 1]) {
      // door / quarter glass divider & beltline trim
      const zDiv = 0.93, gd = ghSection(zDiv);
      const hh = Math.min(gd.yTop - 0.075, 1.39) - gd.yBelt;
      add(ext, new THREE.BoxGeometry(0.014, hh, 0.03), M.gloss, side * (ghXatY(zDiv, gd.yBelt + hh / 2) + 0.004), gd.yBelt + hh / 2 + 0.014, zDiv, 0, 0, side * 0.12);
      add(ext, new THREE.BoxGeometry(0.02, 0.016, 1.96), M.gloss, side * 0.8, 1.012, 0.48, 0, 0, 0, false);
    }

    // ---------------- hood: raised centre power bulge with the dual snorkel inlets, plus heat extractors
    const hoodY = (z) => bodyYT(z) + 0.018;
    const bigScoop = demon || dragpak;
    const bulgeZ0 = dragpak ? -2.02 : demon ? -1.95 : -2.24, bulgeZ1 = dragpak ? -0.76 : demon ? -0.9 : -0.74;
    const DP_H = 0.235, DP_W = 0.37;   // Drag Pak scoop: height at the mouth, half-width
    const bulgeL = loft(THREE, stationList(bulgeZ0, bulgeZ1, [[bulgeZ0, 0.12, 0.01]]), (z) => {
      const t = (z - bulgeZ0) / (bulgeZ1 - bulgeZ0);
      const hM = dragpak ? DP_H * Math.pow(1 - t, 1.1) + 0.006 : demon ? 0.135 * Math.pow(1 - t, 1.4) + 0.006 : 0.055 * (1 - 0.85 * t * t) + 0.004 + 0.012 * sstep(0.08, 0, t);
      const w = dragpak ? DP_W - 0.08 * t : demon ? 0.31 - 0.09 * t : 0.34 - 0.06 * t, base = hoodY(z) - 0.02;
      const pts = [[0, base], [w * 0.6, base], [w, base]];
      for (const xr of [0.985, 0.95, 0.9, 0.82, 0.7, 0.55, 0.38, 0.2, 0]) pts.push([w * xr, base + hM * Math.sqrt(Math.max(0, 1 - Math.pow(xr, 5)))]);
      return pts;
    });
    if (dragpak) {
      planarUV(bulgeL.geo, (x, y, z) => [x * 1.2 + y * 0.6, z * 1.2]);
      add(ext, bulgeL.geo, M.carbon);
    } else {
      add(ext, bulgeL.geo, M.paint);
      if (!bigScoop) add(ext, capGeo(THREE, bulgeL.rings[0].ring, bulgeZ0, -1), M.paint);
    }
    if (bigScoop) {
      // scoop mouth built from the scoop's own front section, so nothing pokes out past the shell: a lip that follows
      // the dome, a dark duct running back into the scoop and a mesh screen at its end
      const outer = bulgeL.rings[0].ring, base = hoodY(bulgeZ0) - 0.02;
      const hM0 = dragpak ? DP_H + 0.006 : 0.141, w0 = dragpak ? DP_W : 0.31;
      const lip = dragpak ? 0.022 : 0.018, lipB = dragpak ? 0.042 : 0.026;   // (floor sits above the hood + its stripes)
      const kx = (w0 - lip) / w0, ky = (hM0 - lip - lipB) / hM0;
      const inner = outer.map(([x, y]) => [x * kx, base + lipB + (y - base) * ky]);
      const toShape = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
      const lipShape = toShape(outer); lipShape.holes.push(toShape(inner.slice().reverse()));
      const lipG = new THREE.ShapeGeometry(lipShape, 4); lipG.rotateY(Math.PI); lipG.translate(0, 0, bulgeZ0 - 0.001);
      if (dragpak) planarUV(lipG, (x, y) => [x * 1.2 + y * 0.6, y * 1.2]);
      add(ext, lipG, dragpak ? M.carbon : M.paintPlain, 0, 0, 0, 0, 0, 0, false);
      const depth = dragpak ? 0.16 : 0.11, z1 = bulgeZ0 + depth, dp = [];
      for (let i = 0; i < inner.length; i++) {
        const [ax, ay] = inner[i], [bx, by] = inner[(i + 1) % inner.length];
        dp.push(ax, ay, bulgeZ0, bx, by, bulgeZ0, bx, by, z1, ax, ay, bulgeZ0, bx, by, z1, ax, ay, z1);
      }
      const duct = new THREE.BufferGeometry(); duct.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); duct.computeVertexNormals();
      add(ext, duct, new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.8, side: THREE.DoubleSide }), 0, 0, 0, 0, 0, 0, false);
      const scr = new THREE.ShapeGeometry(toShape(inner), 4); scr.rotateY(Math.PI); scr.translate(0, 0, z1);
      add(ext, scr, M.grille, 0, 0, 0, 0, 0, 0, false);
    }
    const hy0 = hoodY(bulgeZ0) - 0.02;
    if (dragpak) {
      // four hood pins
      for (const [px, pz] of [[-0.62, -2.25], [0.62, -2.25], [-0.6, -0.8], [0.6, -0.8]]) {
        add(ext, new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12), M.chrome, px, hoodY(pz) + 0.002, pz, 0, 0, 0, false);
        add(ext, new THREE.TorusGeometry(0.018, 0.003, 6, 16), M.chrome, px + 0.03, hoodY(pz) + 0.003, pz, Math.PI / 2, 0, 0, false);
      }
    }
    for (const sx of [-1, 1]) {
      if (!bigScoop) add(ext, new THREE.PlaneGeometry(0.2, 0.042), M.grille, sx * 0.145, hy0 + 0.032, bulgeZ0 - 0.003, 0, Math.PI, 0, false);
      // heat extractors near the front outer corners of the hood
      const hz = -1.95;
      add(ext, new THREE.BoxGeometry(0.2, 0.012, 0.26), M.gloss, sx * 0.55, hoodY(hz) - 0.008, hz, 0.075, 0, 0, false);
      for (let k = 0; k < 5; k++) add(ext, new THREE.BoxGeometry(0.18, 0.006, 0.012), M.grille, sx * 0.55, hoodY(hz) - 0.0 + (k - 2) * 0.0 + 0.001, hz - 0.1 + k * 0.05, 0.075, 0, 0, false);
    }

    // ---------------- front fascia: one thick, rounded bumper cover (follows the body's front outline) with the
    // grille / headlamp cavity, lower intake and brake ducts recessed into it; the hood's brow overhangs the grille
    const front = new THREE.Group(); front.position.z = Z_FRONT - 0.004; ext.add(front);
    const honey = canvasTex(THREE, 256, 128, (g, w, h) => {
      g.fillStyle = '#060606'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2c2c2e'; g.lineWidth = 2;
      for (let y = 0; y < h + 10; y += 10) for (let x = 0; x < w + 12; x += 12) {
        const ox = (y / 10) % 2 ? 6 : 0;
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + ox + 4.5 * Math.cos(a), y + 4.5 * Math.sin(a)); } g.closePath(); g.stroke();
      }
    });
    honey.wrapS = honey.wrapT = THREE.RepeatWrapping; honey.repeat.set(4, 1);
    const grilleMat = new THREE.MeshStandardMaterial({ map: honey, roughness: 0.6, metalness: 0.2 });
    // rounded convex polygon, and the same polygon pushed outwards by d (for trim rings around an opening)
    const rpoly = (path, pts, r) => {
      const n = pts.length, P = (i) => pts[(i + n) % n];
      const cut = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [p[0] + dx / l * d, p[1] + dy / l * d]; };
      for (let i = 0; i < n; i++) {
        const a = cut(P(i), P(i - 1), r), b = cut(P(i), P(i + 1), r);
        if (i) path.lineTo(a[0], a[1]); else path.moveTo(a[0], a[1]);
        path.quadraticCurveTo(P(i)[0], P(i)[1], b[0], b[1]);
      }
      path.closePath(); return path;
    };
    const offsetPoly = (pts, d) => {
      const n = pts.length, cx = pts.reduce((s2, p) => s2 + p[0], 0) / n, cy2 = pts.reduce((s2, p) => s2 + p[1], 0) / n;
      const nrm = (a, b) => {
        let nx = b[1] - a[1], ny = a[0] - b[0]; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
        if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy2) < 0) { nx = -nx; ny = -ny; }
        return [nx, ny];
      };
      return pts.map((p, i) => {
        const n1 = nrm(pts[(i + n - 1) % n], p), n2 = nrm(p, pts[(i + 1) % n]), k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
        return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
      });
    };
    const FASCIA_INTAKE = [[-0.5, 0.455], [0.5, 0.455], [0.565, 0.262], [-0.565, 0.262]];
    const FASCIA_DUCT = (sx) => [[0.607, 0.44], [0.772, 0.44], [0.745, 0.288], [0.638, 0.288]].map(([x, y]) => [sx * x, y]);
    const roundRect = (path, x0, y0, x1, y1, r) => {
      path.moveTo(x0 + r, y0); path.lineTo(x1 - r, y0); path.quadraticCurveTo(x1, y0, x1, y0 + r); path.lineTo(x1, y1 - r);
      path.quadraticCurveTo(x1, y1, x1 - r, y1); path.lineTo(x0 + r, y1); path.quadraticCurveTo(x0, y1, x0, y1 - r); path.lineTo(x0, y0 + r);
      path.quadraticCurveTo(x0, y0, x0 + r, y0); return path;
    };
    {
      const cy = r0.reduce((a2, p2) => a2 + p2[1], 0) / r0.length;
      const fs = new THREE.Shape();
      r0.forEach((p2, i) => { const x = p2[0] * 0.99, y = cy + (p2[1] - cy) * 0.985; if (i) fs.lineTo(x, y); else fs.moveTo(x, y); });
      fs.holes.push(roundRect(new THREE.Path(), -0.775, 0.572, 0.775, 0.805, 0.07));        // grille + headlamp cavity
      fs.holes.push(rpoly(new THREE.Path(), FASCIA_INTAKE, 0.03));                                 // lower grille
      for (const sx of [-1, 1]) fs.holes.push(rpoly(new THREE.Path(), FASCIA_DUCT(sx), 0.022));     // brake ducts
      const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.012, bevelSegments: 4, curveSegments: 8 });
      fg.translate(0, 0, -0.035);
      add(ext, fg, M.paintPlain, 0, 0, Z_FRONT, 0, 0, 0);
    }
    // recessed grille cavity (black backing + honeycomb mesh just in front of the body face)
    add(front, new THREE.BoxGeometry(1.58, 0.25, 0.02), M.gloss, 0, 0.689, 0.004);
    add(front, new THREE.PlaneGeometry(1.52, 0.2), grilleMat, 0, 0.689, -0.008, 0, Math.PI, 0, false);
    // quad headlamps with halo rings (driver-side inner = Air Catcher intake), set back inside the cavity
    const lampY = 0.689;
    for (const lx of [-0.66, -0.4, 0.4, 0.66]) {
      const air = lx === -0.4;
      add(front, new THREE.CylinderGeometry(0.093, 0.098, 0.04, 32), M.gloss, lx, lampY, -0.012, Math.PI / 2, 0, 0);
      if (air) {
        add(front, new THREE.TorusGeometry(0.078, 0.009, 8, 32), M.darkChrome, lx, lampY, -0.034, 0, 0, 0);
        add(front, new THREE.CircleGeometry(0.07, 24), M.grille, lx, lampY, -0.03, 0, Math.PI, 0, false);
        for (let k = -2; k <= 2; k++) add(front, new THREE.BoxGeometry(0.13, 0.006, 0.01), M.darkChrome, lx, lampY + k * 0.024, -0.033, 0, 0, 0, false);
      } else {
        const refl = add(front, new THREE.CircleGeometry(0.074, 24), M.headlamp, lx, lampY, -0.03, 0, Math.PI, 0, false);
        refl.userData.headlamp = true;
        add(front, new THREE.TorusGeometry(0.077, 0.0075, 8, 40), M.halo, lx, lampY, -0.035, 0, 0, 0, false);
        add(front, new THREE.CylinderGeometry(0.028, 0.03, 0.02, 16), M.chrome, lx, lampY, -0.038, Math.PI / 2, 0, 0, false);
        add(front, new THREE.CircleGeometry(0.09, 24), M.lens, lx, lampY, -0.042, 0, Math.PI, 0, false);
      }
    }
    // SRT badge on the grille
    const srtTex = canvasTex(THREE, 128, 48, (g, w, h) => {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8d8d8'; g.font = 'bold italic 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SRT', w / 2 - 8, h / 2 + 2);
      g.fillStyle = '#c00'; g.fillRect(w - 26, 10, 14, 28);
    });
    add(front, new THREE.PlaneGeometry(0.11, 0.04), new THREE.MeshStandardMaterial({ map: srtTex, roughness: 0.3, metalness: 0.6 }), -0.19, 0.61, -0.012, 0, Math.PI, 0, false);
    // lower grille & brake ducts: real openings - a gloss-black trim ring standing proud of the fascia, black walls
    // running back into the bumper and honeycomb at the back, so they read as holes with depth and shadow
    const FACE = -0.049;   // fascia face (front-group z)
    const ductWall = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.75, side: THREE.DoubleSide });
    const opening = (pts, r, trim, mesh) => {
      const ring = rpoly(new THREE.Shape(), offsetPoly(pts, trim), r + trim * 0.8);
      ring.holes.push(rpoly(new THREE.Path(), pts, r));
      const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6 });
      rg.translate(0, 0, -0.008);
      add(front, rg, M.gloss, 0, 0, FACE, 0, 0, 0, false);
      const poly = rpoly(new THREE.Path(), pts, r).getPoints(6).filter((p, i, a) => !i || p.distanceTo(a[i - 1]) > 1e-5);
      const z0 = FACE + 0.004, z1 = -0.004, w = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        w.push(a.x, a.y, z0, b.x, b.y, z0, b.x, b.y, z1, a.x, a.y, z0, b.x, b.y, z1, a.x, a.y, z1);
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(w, 3)); wg.computeVertexNormals();
      add(front, wg, ductWall, 0, 0, 0, 0, 0, 0, false);
      const back = new THREE.ShapeGeometry(rpoly(new THREE.Shape(), pts, r), 6); back.rotateY(Math.PI);
      add(front, back, mesh, 0, 0, -0.006, 0, 0, 0, false);
    };
    opening(FASCIA_INTAKE, 0.03, 0.016, grilleMat);
    for (const sx of [-1, 1]) {
      opening(FASCIA_DUCT(sx), 0.022, 0.012, grilleMat);
      // a body-colour bar across each duct, with a round LED fog lamp above it (lights up with the headlamps)
      add(front, new THREE.BoxGeometry(0.15, 0.014, 0.03), M.paintPlain, sx * 0.69, 0.352, FACE + 0.012, 0, 0, sx * 0.1, false);
      const fogX = sx * 0.692, fogY = 0.398;
      add(front, new THREE.CylinderGeometry(0.03, 0.032, 0.02, 24), M.gloss, fogX, fogY, -0.028, Math.PI / 2, 0, 0, false);
      const fog = add(front, new THREE.CircleGeometry(0.022, 20), M.headlamp, fogX, fogY, -0.039, 0, Math.PI, 0, false); fog.userData.headlamp = true;
      add(front, new THREE.TorusGeometry(0.025, 0.004, 6, 24), M.chrome, fogX, fogY, -0.04, 0, 0, 0, false);
      add(ext, new THREE.BoxGeometry(0.03, 0.05, 0.12), M.amber, sx * 0.9, 0.62, -2.28, 0, sx * 0.3, 0, false);
    }
    // the bumper's crease under the grille: a body-colour blade that juts forward with a sharp nose and an undercut,
    // so the upper grille and the lower intakes sit in shadow like the real fascia
    {
      const bs = new THREE.Shape();
      bs.moveTo(0, 0.566); bs.lineTo(-0.046, 0.534); bs.lineTo(-0.05, 0.522); bs.lineTo(-0.036, 0.5); bs.lineTo(0, 0.476); bs.closePath();
      const bg = new THREE.ExtrudeGeometry(bs, { depth: 1.34, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.006, bevelSegments: 5, curveSegments: 4 });
      bg.rotateY(-Math.PI / 2); bg.translate(0.67, 0, 0);
      add(front, bg, M.paintPlain, 0, 0, FACE + 0.004, 0, 0, 0);
    }
    // curved front splitter lip following the bumper in plan view
    {
      const O = [[0, -2.572], [0.4, -2.567], [0.62, -2.55], [0.75, -2.51], [0.82, -2.45], [0.858, -2.36], [0.868, -2.27]];
      const I = [[0.82, -2.27], [0.805, -2.36], [0.765, -2.43], [0.66, -2.47], [0.4, -2.478], [0, -2.48]];
      const sp = new THREE.Shape();
      const pts = [...O, ...I, ...I.slice().reverse().map(([x, z]) => [-x, z]).slice(1), ...O.slice().reverse().map(([x, z]) => [-x, z])];
      pts.forEach(([x, z], i) => { if (i) sp.lineTo(x, z); else sp.moveTo(x, z); });
      const sg = new THREE.ExtrudeGeometry(sp, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 });
      sg.rotateX(Math.PI / 2);
      add(ext, sg, M.gloss, 0, 0.182, 0);
    }
    // license-plate bracket area
    add(front, new THREE.BoxGeometry(0.02, 0.02, 0.02), M.black, 0, 0.5, 0);

    // ---------------- rear
    const rear = new THREE.Group(); rear.position.z = Z_REAR + 0.004; ext.add(rear);
    // racetrack LED tail lamp
    add(rear, new THREE.BoxGeometry(1.74, 0.13, 0.035), M.gloss, 0, 0.905, 0);
    const tailLens = add(rear, new THREE.BoxGeometry(1.68, 0.1, 0.02), M.tail, 0, 0.905, 0.016, 0, 0, 0, false);
    const rt = new THREE.Shape();
    const rw = 0.8, rh = 0.036, rr = 0.03;
    rt.moveTo(-rw + rr, -rh); rt.lineTo(rw - rr, -rh); rt.quadraticCurveTo(rw, -rh, rw, -rh + rr); rt.lineTo(rw, rh - rr); rt.quadraticCurveTo(rw, rh, rw - rr, rh);
    rt.lineTo(-rw + rr, rh); rt.quadraticCurveTo(-rw, rh, -rw, rh - rr); rt.lineTo(-rw, -rh + rr); rt.quadraticCurveTo(-rw, -rh, -rw + rr, -rh);
    const hole = new THREE.Path();
    const iw = rw - 0.012, ih = rh - 0.012;
    hole.moveTo(-iw, -ih); hole.lineTo(-iw, ih); hole.lineTo(iw, ih); hole.lineTo(iw, -ih); hole.lineTo(-iw, -ih);
    rt.holes.push(hole);
    add(rear, new THREE.ShapeGeometry(rt, 8), M.tailRing, 0, 0.905, 0.028, 0, 0, 0, false);
    for (const sx of [-1, 1]) add(rear, new THREE.PlaneGeometry(0.16, 0.05), M.reverse, sx * 0.13, 0.905, 0.029, 0, 0, 0, false);
    // black deck-lid spoiler
    const spl = add(ext, new THREE.BoxGeometry(1.62, 0.035, 0.13), M.gloss, 0, 1.072, 2.5);
    spl.rotation.x = 0.12;
    for (const sx of [-1, 1]) add(ext, new THREE.BoxGeometry(0.03, 0.05, 0.12), M.gloss, sx * 0.8, 1.055, 2.5, 0, 0, 0, false);
    if (dragpak) add(ext, new THREE.BoxGeometry(1.62, 0.03, 0.006), M.gloss, 0, 1.078, 2.566, 0, 0, 0, false);   // wicker bill
    // badge
    const badge = canvasTex(THREE, 256, 40, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = '#cfcfcf'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('C H A L L E N G E R', w / 2, h / 2 + 1);
    });
    add(rear, new THREE.PlaneGeometry(0.34, 0.053), new THREE.MeshStandardMaterial({ map: badge, transparent: true, metalness: 0.7, roughness: 0.3 }), 0, 0.775, 0.012, 0, 0, 0, false);
    // plate recess + diffuser + exhaust tips
    if (!dragpak) {
      // licence plate in a recess, with its lamps
      add(rear, new THREE.BoxGeometry(0.36, 0.19, 0.012), M.black, 0, 0.58, 0.0);
      const plTex = canvasTex(THREE, 256, 128, (g, w, h) => {
        g.fillStyle = '#f4f4ef'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a2a2a'; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
        g.fillStyle = '#1b2f6b'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M O P A R', w / 2, 20);
        g.font = 'bold 62px Arial'; g.fillText(demon ? 'DEMON' : 'HLLCAT', w / 2, 76);
        g.fillStyle = '#b3121a'; g.fillRect(12, h - 20, w - 24, 5);
      });
      add(rear, new THREE.PlaneGeometry(0.305, 0.152), new THREE.MeshStandardMaterial({ map: plTex, roughness: 0.5, metalness: 0.15 }), 0, 0.575, 0.008, 0, 0, 0, false);
      for (const sx of [-0.1, 0.1]) add(rear, new THREE.BoxGeometry(0.03, 0.008, 0.01), M.reverse, sx, 0.668, 0.004, 0, 0, 0, false);
      // lower valance: gloss-black, tapered, with the two exhaust outlets cut into it
      const vs = new THREE.Shape(), vT = 0.375, vB = 0.215, vW = 0.77, vWb = 0.68, vr = 0.03;
      vs.moveTo(-vWb + vr, vB); vs.lineTo(vWb - vr, vB); vs.quadraticCurveTo(vWb, vB, vWb + 0.01, vB + vr); vs.lineTo(vW, vT - vr); vs.quadraticCurveTo(vW, vT, vW - vr, vT);
      vs.lineTo(-vW + vr, vT); vs.quadraticCurveTo(-vW, vT, -vW, vT - vr); vs.lineTo(-vWb - 0.01, vB + vr); vs.quadraticCurveTo(-vWb, vB, -vWb + vr, vB);
      for (const sx of [-1, 1]) {
        const hp = new THREE.Path(), ex = sx * 0.62, ey = 0.29, ew = 0.085, eh = 0.058;
        hp.absellipse(ex, ey, ew, eh, 0, Math.PI * 2, true);
        vs.holes.push(hp);
      }
      const vg = new THREE.ExtrudeGeometry(vs, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 });
      vg.translate(0, 0, -0.045);
      add(rear, vg, M.gloss, 0, 0, 0);
      // red reflectors at the corners
      const refl = new THREE.MeshStandardMaterial({ color: 0x6b0a0a, emissive: 0x3a0404, roughness: 0.3 });
      for (const sx of [-1, 1]) add(rear, new THREE.BoxGeometry(0.1, 0.022, 0.01), refl, sx * 0.64, 0.4, 0.006, 0, 0, 0, false);
      // badges: SRT (right) and the model (left) under the tail lamp
      const bdg = (txt, col, font) => canvasTex(THREE, 256, 64, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 5; g.strokeStyle = '#d8d8d8'; g.strokeText(txt, w / 2, h / 2 + 2); g.fillStyle = col; g.fillText(txt, w / 2, h / 2 + 2);
      });
      const bmat = (t) => new THREE.MeshStandardMaterial({ map: t, transparent: true, metalness: 0.6, roughness: 0.3 });
      add(rear, new THREE.PlaneGeometry(0.15, 0.0375), bmat(bdg('SRT', '#c40d0d', 'italic 900 50px Arial')), 0.56, 0.775, 0.012, 0, 0, 0, false);
      add(rear, new THREE.PlaneGeometry(0.24, 0.06), bmat(bdg(demon ? 'DEMON 170' : 'HELLCAT', '#1a1a1c', 'italic bold 40px Arial')), -0.56, 0.775, 0.012, 0, 0, 0, false);
    } else {
      // race car: bumper cover trimmed to a black lip, a finned diffuser between the wheelie bars, red tow straps
      add(rear, new THREE.BoxGeometry(1.46, 0.035, 0.07), M.gloss, 0, 0.285, -0.02);
      const dfl = add(rear, new THREE.BoxGeometry(1.0, 0.012, 0.42), M.grille, 0, 0.235, -0.17); dfl.rotation.x = -0.2;
      for (let k = -2; k <= 2; k++) add(rear, new THREE.BoxGeometry(0.012, 0.07, 0.36), M.gloss, k * 0.2, 0.24, -0.14, 0, 0, 0, false);
      const tow = new THREE.MeshStandardMaterial({ color: 0xc8141c, roughness: 0.75 });
      for (const sx of [-0.52, 0.52]) {
        add(rear, new THREE.BoxGeometry(0.05, 0.12, 0.008), tow, sx, 0.23, 0.03, 0.25, 0, 0, false);
        add(rear, new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI), tow, sx, 0.175, 0.05, 0, 0, Math.PI, false);
      }
    }
    const tips = [];
    if (dragpak) for (const sx of [-1, 1]) {
      // open header collectors dumping out under the rockers, just ahead of the rear tyres
      const dz = 0.86;
      add(ext, new THREE.CylinderGeometry(0.045, 0.05, 0.3, 16, 1, true), M.darkChrome, sx * 0.84, 0.19, dz, 0, 0, sx * 1.25);
      add(ext, new THREE.TorusGeometry(0.047, 0.006, 6, 20), M.darkChrome, sx * 0.98, 0.14, dz, 0, Math.PI / 2, sx * 0.3, false);
      tips.push(new THREE.Vector3(sx * 1.0, 0.13 - cgH, dz + zOff));
    }
    for (const sx of dragpak ? [] : [-1, 1]) {
      const tip = add(rear, new THREE.CylinderGeometry(0.058, 0.058, 0.14, 24, 1, true), M.darkChrome, sx * 0.62, 0.285, -0.04, Math.PI / 2, 0, 0);
      tip.material = M.darkChrome;
      add(rear, new THREE.CircleGeometry(0.052, 20), M.black, sx * 0.62, 0.285, -0.03, 0, 0, 0, false);
      add(rear, new THREE.TorusGeometry(0.058, 0.007, 6, 24), M.chrome, sx * 0.62, 0.285, 0.022, 0, 0, 0, false);
      tips.push(new THREE.Vector3(sx * 0.62, 0.285 - cgH, Z_REAR + 0.06 + zOff));
    }

    // ---------------- side details
    const mirrors = [];
    for (const sx of [-1, 1]) {
      // side mirror: body-colour rounded housing on a black sail at the door's front corner, live glass facing back
      const mir = new THREE.Group(); mir.position.set(sx * 0.95, 1.035, -0.47); ext.add(mir);
      add(mir, new THREE.BoxGeometry(0.035, 0.1, 0.15), M.gloss, sx * 0.012, 0.0, 0.02);          // sail on the door
      add(mir, new THREE.BoxGeometry(0.06, 0.03, 0.05), M.gloss, sx * 0.05, 0.015, 0.03);        // arm
      const hW = 0.205, hH = 0.12, hr = 0.042;
      const hs = new THREE.Shape();
      hs.moveTo(-hW / 2 + hr, -hH / 2); hs.lineTo(hW / 2 - hr, -hH / 2); hs.quadraticCurveTo(hW / 2, -hH / 2, hW / 2, -hH / 2 + hr);
      hs.lineTo(hW / 2, hH / 2 - hr); hs.quadraticCurveTo(hW / 2, hH / 2, hW / 2 - hr, hH / 2); hs.lineTo(-hW / 2 + hr, hH / 2);
      hs.quadraticCurveTo(-hW / 2, hH / 2, -hW / 2, hH / 2 - hr); hs.lineTo(-hW / 2, -hH / 2 + hr); hs.quadraticCurveTo(-hW / 2, -hH / 2, -hW / 2 + hr, -hH / 2);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.012, bevelSegments: 4, curveSegments: 6 });
      hg.translate(0, 0, -0.06);   // back face (glass side) at z = 0 (+bevel), rounded nose towards the front
      const hx = sx * (0.07 + hW / 2);
      add(mir, hg, M.paintPlain, hx, 0.03, 0.02);
      add(mir, new THREE.PlaneGeometry(hW - 0.012, hH - 0.012), M.gloss, hx, 0.03, 0.02 + 0.036, 0, 0, 0, false);  // black frame
      const smRT = new THREE.WebGLRenderTarget(320, 180);
      smRT.texture.repeat.x = -1; smRT.texture.offset.x = 1;
      const smMesh = add(mir, new THREE.PlaneGeometry(hW - 0.03, hH - 0.03), new THREE.MeshBasicMaterial({ map: smRT.texture }), hx, 0.03, 0.02 + 0.037, 0, 0, 0, false);
      const smCam = new THREE.PerspectiveCamera(20, (hW - 0.03) / (hH - 0.03), 0.2, 700);
      smCam.position.set(sx * 0.95 + hx, 1.065, -0.4); smCam.rotation.set(-0.03, Math.PI + sx * 0.22, 0);
      model.add(smCam);
      mirrors.push({ mesh: smMesh, cam: smCam, rt: smRT });
      add(ext, new THREE.BoxGeometry(0.03, 0.045, 0.1), M.tail, sx * 0.93, 0.66, 2.42, 0, -sx * 0.25, 0, false);   // rear side marker
      // door handle
      add(ext, new THREE.BoxGeometry(0.012, 0.028, 0.16), M.black, sx * 0.968, 0.905, 0.55, 0, 0, 0, false);
      // rocker sill
      add(ext, new THREE.BoxGeometry(0.03, 0.07, 2.02), M.gloss, sx * 0.962, 0.225, 0.0, 0, 0, 0, false);
      // SUPERCHARGED fender badge
      const scTex = canvasTex(THREE, 256, 40, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#d0d0d0'; g.font = 'bold italic 24px Arial'; g.textBaseline = 'middle'; g.fillText(dragpak ? '354 HEMI' : demon ? 'DEMON 170' : 'SUPERCHARGED', 6, h / 2 + 1);
      });
      add(ext, new THREE.PlaneGeometry(0.2, 0.031), new THREE.MeshStandardMaterial({ map: scTex, transparent: true, metalness: 0.8, roughness: 0.25 }),
        sx * 0.972, 0.63, -0.9, 0, sx * Math.PI / 2, 0, false);
      // door gap lines
      for (const dz of [-0.70, 1.08]) add(ext, new THREE.BoxGeometry(0.004, 0.62, 0.005), M.black, sx * 0.973, 0.62, dz, 0, 0, 0, false);
      // fuel door (right rear quarter)
      if (sx > 0) {
        const fzC = 1.9, fyC = 0.815, fR = 0.062;     // below the shoulder crease (0.89 m), clear of the arch lip
        const disc = (r0, r1, off) => {
          const g = gridPatch(THREE, 28, 3, (i, j) => { const a = i * Math.PI * 2, r = r0 + (r1 - r0) * j, z = fzC + Math.cos(a) * r, y = fyC + Math.sin(a) * r; return [sideXat(z, y) + off, y, z]; });
          if (g.attributes.normal.getX(3) < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.index.needsUpdate = true; g.computeVertexNormals(); }
          return g;
        };
        add(ext, disc(fR, fR + 0.005, 0.0015), M.black, 0, 0, 0, 0, 0, 0, false);     // shut line
        add(ext, disc(0.001, fR, 0.003), M.paintPlain, 0, 0, 0, 0, 0, 0, false);      // the door, flush with the panel
      }
    }
    // underbody (hides the inside from low angles)
    add(ext, new THREE.BoxGeometry(1.7, 0.02, 4.7), M.black, 0, 0.2, 0.05, 0, 0, 0, false);

    // ---------------- Drag Pak livery: centre stripe with tracers, side billboards, windshield banner
    let chute = null;
    if (dragpak) {
      // decals face outwards only (so nothing bleeds through the headliner / door cards from inside)
      const decalMat = (tex, side) => new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, depthWrite: false, side: side === undefined ? THREE.FrontSide : side });
      const stripeTex = canvasTex(THREE, 8, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const band = (a, b, c) => { g.fillStyle = c; g.fillRect(0, h * a, w, h * (b - a)); };
        band(0, 0.05, '#b3121a'); band(0.115, 0.885, '#0b0b0c'); band(0.95, 1, '#b3121a');
      });
      const stripeMat = decalMat(stripeTex);
      const SW = 0.21;   // half width incl. tracers
      const strip = (z0, z1, yFn) => {
        const ns = Math.max(4, Math.round((z1 - z0) / 0.04));
        const g = gridPatch(THREE, ns, 10, (i, j) => { const z = lerp(z0, z1, i), x = lerp(SW, -SW, j); return [x, yFn(z, x) + 0.004, z]; });
        add(ext, g, stripeMat, 0, 0, 0, 0, 0, 0, false);
      };
      strip(Z_FRONT + 0.1, -0.66, (z, x) => topYat(z, x));                           // hood
      strip(0.16, 1.1, (z, x) => ghYatX(z, x));                                        // roof
      strip(1.76, Z_REAR - 0.06, (z, x) => topYat(z, x));                              // deck lid
      // side billboards between the wheel arches: 'drag pak' on the quarter, MOPAR ahead of it, red tracer under
      for (const side of [-1, 1]) {
        const z0 = -1.0, z1 = 1.0, y0 = 0.35, y1 = 0.7;
        const tex = canvasTex(THREE, 2048, 358, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          const rearLeft = side > 0;   // right side reads rear -> front
          g.fillStyle = '#b3121a'; g.fillRect(0, h - 26, w, 12); g.fillRect(0, h - 8, w, 5);
          g.save();
          g.font = 'italic 900 250px Arial Black, Arial'; g.textBaseline = 'alphabetic';
          const dp = 'drag pak', mw = g.measureText(dp).width;
          const xDP = rearLeft ? 30 : w - mw - 30;
          g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.strokeText(dp, xDP, h - 64);
          g.fillStyle = '#0b0b0c'; g.fillText(dp, xDP, h - 64);
          g.restore();
          // MOPAR mark: ringed M + wordmark
          const xM = rearLeft ? w - 560 : 40;
          g.lineWidth = 12; g.strokeStyle = '#0b0b0c'; g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(xM + 70, h / 2 - 10, 62, 0, 7); g.fill(); g.stroke();
          g.fillStyle = '#b3121a'; g.font = 'bold 92px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', xM + 70, h / 2 - 6);
          g.textAlign = 'left'; g.fillStyle = '#0b0b0c'; g.font = 'italic bold 96px Arial';
          g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.strokeText('MOPAR', xM + 146, h / 2 - 8); g.fillText('MOPAR', xM + 146, h / 2 - 8);
        });
        const ns = 60, nt = 8;
        const geo = gridPatch(THREE, ns, nt, (i, j) => {
          const z = side > 0 ? lerp(z1, z0, i) : lerp(z0, z1, i), y = lerp(y0, y1, j);
          return [side * (sideXat(z, y) + 0.004), y, z];
        });
        add(ext, geo, decalMat(tex, THREE.BackSide), 0, 0, 0, 0, 0, 0, false);
        // contingency decals on the front fender (behind the front wheel, above the arch)
        const ctex = canvasTex(THREE, 1024, 160, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          const labels = [['HEMI 354', '#b3121a', '#fff'], ['WHIPPLE', '#0b0b0c', '#fff'], ['HOLLEY EFI', '#ffffff', '#b3121a'], ['MICKEY THOMPSON', '#0b0b0c', '#f5c400'],
            ['WELD RACING', '#ffffff', '#0b0b0c'], ['STRANGE', '#0b0b0c', '#fff'], ['BILSTEIN', '#f5c400', '#0b3a8c'], ['RACEPAK', '#0b0b0c', '#fff']];
          labels.forEach(([t, bg, fg], k) => {
            const cx = (k % 4) * 256, cy = Math.floor(k / 4) * 80;
            g.fillStyle = bg; g.fillRect(cx + 6, cy + 6, 244, 68); g.strokeStyle = '#222'; g.lineWidth = 2; g.strokeRect(cx + 6, cy + 6, 244, 68);
            g.fillStyle = fg; g.font = 'bold italic 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, cx + 128, cy + 41);
          });
        });
        const fz0 = -1.68, fz1 = -1.26, fy0 = 0.786, fy1 = 0.84;
        const cg = gridPatch(THREE, 12, 4, (i, j) => { const z = side > 0 ? lerp(fz1, fz0, i) : lerp(fz0, fz1, i), y = lerp(fy0, fy1, j); return [side * (sideXat(z, y) + 0.004), y, z]; });
        add(ext, cg, decalMat(ctex, THREE.BackSide), 0, 0, 0, 0, 0, 0, false);
      }
      // windshield banner (reads correctly from outside, mirrored from the cockpit like the real thing)
      const bTex = canvasTex(THREE, 1024, 96, (g, w, h) => {
        g.fillStyle = 'rgba(10,10,12,0.93)'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff'; g.font = 'italic bold 62px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MOPAR  ·  DRAG PAK', w / 2, h / 2 + 2);
        g.fillStyle = '#b3121a'; g.fillRect(0, h - 8, w, 8);
      });
      const bg = gridPatch(THREE, 16, 4, (i, j) => { const x = lerp(0.54, -0.54, i), z = lerp(0.015, 0.11, j); return [x, ghYatX(z, x) + 0.004, z]; });
      add(ext, bg, decalMat(bTex, THREE.DoubleSide), 0, 0, 0, 0, 0, 0, false);

      // parachute pack on the rear bumper + the canopy that deploys behind the car
      const pack = new THREE.Group(); pack.position.set(0, 0.585, Z_REAR + 0.12); ext.add(pack);
      const packTex = canvasTex(THREE, 256, 256, (g, w, h) => {
        g.fillStyle = '#121214'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#b3121a'; g.fillRect(0, 0, w, 40); g.fillRect(0, h - 40, w, 40);
        g.fillStyle = '#fff'; g.font = 'bold 38px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STROUD', w / 2, 72); g.font = 'bold 20px Arial'; g.fillText('SAFETY  ·  10 FT', w / 2, 102);
      });
      // soft bag: rounded, stitched-looking pack (the texture sits on its rear face)
      const bagS = new THREE.Shape(), bw = 0.12, bh = 0.14, br = 0.045;
      bagS.moveTo(-bw + br, -bh); bagS.lineTo(bw - br, -bh); bagS.quadraticCurveTo(bw, -bh, bw, -bh + br); bagS.lineTo(bw, bh - br); bagS.quadraticCurveTo(bw, bh, bw - br, bh);
      bagS.lineTo(-bw + br, bh); bagS.quadraticCurveTo(-bw, bh, -bw, bh - br); bagS.lineTo(-bw, -bh + br); bagS.quadraticCurveTo(-bw, -bh, -bw + br, -bh);
      const bagG = new THREE.ExtrudeGeometry(bagS, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.018, bevelSegments: 3, curveSegments: 6 });
      bagG.translate(0, 0, -0.06);
      planarUV(bagG, (x, y) => [(x + 0.14) / 0.28, (y + 0.16) / 0.32]);
      add(pack, bagG, new THREE.MeshStandardMaterial({ map: packTex, roughness: 0.9 }), 0, 0, 0);
      // pilot-chute launcher on the back of the bag
      const pl = add(pack, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 28), M.grille, 0, -0.055, 0.075, Math.PI / 2, 0, 0, false);
      pl.material = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.6 });
      add(pack, new THREE.TorusGeometry(0.05, 0.006, 6, 28), new THREE.MeshStandardMaterial({ color: 0xc8141c, roughness: 0.6 }), 0, -0.055, 0.09, 0, 0, 0, false);
      add(pack, new THREE.TorusGeometry(0.025, 0.004, 6, 16), M.chrome, 0.1, 0.13, 0.05, 0, Math.PI / 2, 0, false);   // release pin ring
      // mount: a chromoly hoop from the rear frame rails up to the bag, and a cross bar under it
      for (const sx of [-1, 1]) {
        tubeAB(pack, V3(sx * 0.08, -0.15, -0.02), V3(sx * 0.15, -0.26, -0.14), 0.012, M.cage);   // into the bumper
        tubeAB(pack, V3(sx * 0.08, -0.15, -0.02), V3(sx * 0.08, 0.08, -0.06), 0.009, M.cage);
      }
      tubeAB(pack, V3(-0.1, -0.15, -0.02), V3(0.1, -0.15, -0.02), 0.012, M.cage);
      // rear panel decals either side of the chute
      const rTex = canvasTex(THREE, 1024, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.font = 'italic 900 62px Arial Black, Arial'; g.textBaseline = 'middle';
        g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.strokeText('drag pak', 10, h / 2 + 2); g.fillStyle = '#0b0b0c'; g.fillText('drag pak', 10, h / 2 + 2);
        const xM = 655;
        g.lineWidth = 6; g.strokeStyle = '#0b0b0c'; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(xM + 40, h / 2, 34, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#b3121a'; g.font = 'bold 50px Arial'; g.textAlign = 'center'; g.fillText('M', xM + 40, h / 2 + 2);
        g.textAlign = 'left'; g.fillStyle = '#0b0b0c'; g.font = 'italic bold 62px Arial'; g.fillText('MOPAR', xM + 88, h / 2 + 3);
        g.fillStyle = '#b3121a'; g.fillRect(10, h - 14, 380, 6); g.fillRect(640, h - 14, 374, 6);
      });
      add(rear, new THREE.PlaneGeometry(1.5, 0.1875), decalMat(rTex), 0, 0.69, 0.012, 0, 0, 0, false);
      chute = new THREE.Group(); chute.position.set(0, 0.62 - cgH, Z_REAR + 0.2 + zOff); chute.visible = false; rootG.add(chute);
      const cGeo = new THREE.SphereGeometry(1.52, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cGeo.rotateX(Math.PI / 2);   // apex points back (+z), mouth faces the car
      const cols = [], p = cGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const gore = Math.floor(((Math.atan2(p.getY(i), p.getX(i)) + Math.PI) / (Math.PI * 2)) * 16 + 0.001) % 16;
        const c = gore % 2 ? [0.72, 0.05, 0.07] : [0.95, 0.95, 0.95];
        cols.push(c[0], c[1], c[2]);
      }
      cGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const canopy = new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
      canopy.castShadow = true; chute.add(canopy);
      const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 6), 3));
      const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd }));
      chute.add(lines);
      chute.userData = { canopy, lines };
    }

    // ---------------- wheels
    const tireTex = (brand) => canvasTex(THREE, 1024, 128, (g, w, h) => {
      g.fillStyle = '#161616'; g.fillRect(0, 0, w, h);
      // tread band (middle of v)
      g.fillStyle = '#0f0f0f'; g.fillRect(0, h * 0.3, w, h * 0.4);
      g.fillStyle = '#090909';
      if (brand === 'etdragpro' || brand === 'etdrag') { /* slick: smooth tread */ }
      else if (brand === 'runner') { for (const f of [0.4, 0.5, 0.6]) g.fillRect(0, h * f, w, 4); }
      else if (brand === 'drag' || brand === 'etstreet') { for (let x = 0; x < w; x += 64) g.fillRect(x, h * 0.3, 3, h * 0.4); }
      else { for (const f of [0.38, 0.47, 0.53, 0.62]) g.fillRect(0, h * f, w, 3); for (let x = 0; x < w; x += 16) g.fillRect(x, h * 0.3, 2, h * 0.08); }
      g.fillStyle = '#353535'; g.font = 'bold 20px Arial'; g.textBaseline = 'middle';
      const txt = brand === 'drag' ? 'NITTO   NT555R II   315/35R20   DRAG RADIAL' : brand === 'etstreet' ? 'MICKEY THOMPSON   ET STREET R   315/50R17'
        : brand === 'skinny' ? 'MICKEY THOMPSON   245/55R18   SRT DEMON 170' : brand === 'etdragpro' ? 'MICKEY THOMPSON   ET DRAG PRO   30.0x9.0R15'
        : brand === 'runner' ? 'MICKEY THOMPSON   ET FRONT   27.5x4.0-17' : brand === 'etdrag' ? 'MICKEY THOMPSON   ET DRAG   29.5/10.5-15'
        : 'PIRELLI   P ZERO   275/40ZR20   SRT';
      for (const vy of [0.12, 0.88]) for (let k = 0; k < 2; k++) g.fillText(txt, k * w / 2 + 40, h * vy);
    });
    // BFGoodrich KO2: raised white letters on the outer sidewall (outer bead = v 0 = canvas bottom), black inside
    const koTex = () => canvasTex(THREE, 2048, 256, (g, w, h) => {
      g.fillStyle = '#161616'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0a0a'; g.fillRect(0, h * 0.3, w, h * 0.4);          // groove floor between the tread blocks
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const txt = (s, x, y, px, col) => { g.save(); g.translate(x, y); g.scale(1, 0.5); g.fillStyle = col; g.font = 'bold ' + px + 'px Arial'; g.fillText(s, 0, 0); g.restore(); };
      for (let k = 0; k < 2; k++) {
        const x0 = k * w / 2;
        txt('BFGoodrich', x0 + w * 0.12, h * 0.845, 46, '#ecebe6');
        txt('ALL-TERRAIN T/A  KO2', x0 + w * 0.32, h * 0.845, 30, '#ecebe6');
        txt('LT285/55R20   LOAD RANGE E', x0 + w * 0.44, h * 0.9, 16, '#3c3c3c');
        txt('BFGoodrich   ALL-TERRAIN T/A KO2   LT285/55R20', x0 + w * 0.25, h * 0.155, 22, '#353535');
      }
    });
    function tireGeo(width, rr, R) {
      const hw = width / 2, sw = R - rr;
      const prof = [[rr, -hw + 0.012], [rr + 0.02, -hw - 0.002], [rr + sw * 0.5, -hw - 0.006], [rr + sw * 0.83, -hw + 0.004], [R - 0.004, -hw + 0.022], [R, -hw + 0.05],
        [R, hw - 0.05], [R - 0.004, hw - 0.022], [rr + sw * 0.83, hw - 0.004], [rr + sw * 0.5, hw + 0.006], [rr + 0.02, hw + 0.002], [rr, hw - 0.012]];
      const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 56);
      g.rotateZ(Math.PI / 2);
      return g;
    }
    // 20" P Zero / Nitto (Hellcat), 17" ET Street R rears and 18" skinny fronts (Demon 170)
    const tireGeos = { street: tireGeo(0.275, 0.254, 0.364), drag: tireGeo(0.315, 0.254, 0.364), etstreet: tireGeo(0.315, 0.216, 0.373), skinny: tireGeo(0.245, 0.2286, 0.363),
      etdragpro: tireGeo(0.245, 0.1905, 0.381), runner: tireGeo(0.105, 0.2159, 0.349), etdrag: tireGeo(0.3, 0.1905, 0.3747),
      offroad: tireGeo(0.285, 0.254, 0.398) };       // KO2 carcass; the 13 mm tread blocks are a separate mesh on top
    const tireMats = {};
    for (const k of Object.keys(tireGeos)) tireMats[k] = new THREE.MeshStandardMaterial({ map: k === 'offroad' ? koTex() : tireTex(k), roughness: 0.89 });
    const RIM_R = { street: 0.254, drag: 0.254, etstreet: 0.216, skinny: 0.2286, etdragpro: 0.1905, runner: 0.2159, etdrag: 0.1905, offroad: 0.254 };
    // KO2 tread: staggered centre blocks, big shoulder blocks, and alternating long / short lugs that wrap onto the sidewall
    function koLugGeo(R, hw) {
      const parts = [], N = 40, dep = 0.013, half = Math.PI / N;
      const box = (x, r0, r1, len, wid, th) => {
        const g = new THREE.BoxGeometry(wid, r1 - r0, len);
        g.translate(x, (r0 + r1) / 2, 0); g.rotateX(th); parts.push(g);
      };
      for (let k = 0; k < N; k++) {
        const th = k * 2 * half, alt = k & 1;
        box(-0.036, R - dep - 0.004, R, 0.042, 0.05, th);
        box(0.036, R - dep - 0.004, R, 0.042, 0.05, th + half);
        box(-0.1, R - 0.03, R - 0.001, 0.046, 0.056, th);
        box(0.1, R - 0.03, R - 0.001, 0.046, 0.056, th + half);
        for (const sd of [-1, 1]) box(sd * (hw + 0.001), R - 0.03 - (alt ? 0.05 : 0.032), R - 0.03, 0.036, 0.014, th + (sd > 0 ? half : 0));
      }
      return mergeGeos(THREE, parts);
    }
    const koLugs = koLugGeo(0.411, 0.1425);
    // Drag Pak wheels: polished Weld 17x4.5 fronts, 15x10 double-beadlock rears (outer face = +X)
    function buildDragRim(g, frontW) {
      const R = frontW ? 0.212 : 0.188, W2 = frontW ? 0.055 : 0.125;
      const bar = new THREE.CylinderGeometry(R, R, W2 * 2, 40, 1, true); bar.rotateZ(Math.PI / 2);
      add(g, bar, M.polish, 0, 0, 0);
      const lip = new THREE.TorusGeometry(R + 0.002, 0.008, 8, 48); lip.rotateY(Math.PI / 2);
      add(g, lip, M.polish, W2, 0, 0, 0, 0, 0, false);
      if (!frontW) {
        // beadlock ring + 24 bolts
        const ring = new THREE.CylinderGeometry(R + 0.018, R + 0.018, 0.02, 48, 1, true); ring.rotateZ(Math.PI / 2);
        add(g, ring, M.polish, W2 + 0.006, 0, 0);
        const face = new THREE.RingGeometry(R - 0.012, R + 0.018, 48); face.rotateY(Math.PI / 2);
        add(g, face, M.polish, W2 + 0.016, 0, 0, 0, 0, 0, false);
        const bolt = new THREE.CylinderGeometry(0.006, 0.006, 0.012, 6); bolt.rotateZ(Math.PI / 2);
        for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; add(g, bolt, M.darkChrome, W2 + 0.022, Math.cos(a) * (R + 0.003), Math.sin(a) * (R + 0.003), 0, 0, 0, false); }
      }
      // five-spoke centre, set back into the barrel
      const cx = frontW ? 0.02 : 0.05;
      const sg = new THREE.BoxGeometry(0.018, R - 0.05, frontW ? 0.026 : 0.04);
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 2 / 5, rm = 0.035 + (R - 0.05) / 2;
        const s = add(g, sg, M.polish, cx, Math.cos(a) * rm, Math.sin(a) * rm, 0, 0, 0, false);
        s.rotation.x = a;
      }
      const hub = new THREE.CylinderGeometry(0.055, 0.06, 0.04, 24); hub.rotateZ(Math.PI / 2);
      add(g, hub, M.polish, cx + 0.005, 0, 0);
      const lug = new THREE.CylinderGeometry(0.009, 0.009, 0.025, 6); lug.rotateZ(Math.PI / 2);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 + 0.3; add(g, lug, M.chrome, cx + 0.03, Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0, 0, 0, false); }
      const back = new THREE.CircleGeometry(R - 0.004, 32); back.rotateY(Math.PI / 2);
      add(g, back, M.black, -W2 + 0.02, 0, 0, 0, 0, 0, false);
    }
    // split five-spoke rim face
    const spokeShape = new THREE.Shape();
    spokeShape.moveTo(-0.018, 0.07); spokeShape.lineTo(0.018, 0.07); spokeShape.lineTo(0.013, 0.236); spokeShape.lineTo(-0.013, 0.236);
    const spokeGeoBase = new THREE.ExtrudeGeometry(spokeShape, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2 });
    const spokeParts = [];
    for (let k = 0; k < 5; k++) for (const d of [-0.13, 0.13]) {
      const g = spokeGeoBase.clone();
      g.rotateX(-0.18);             // dish
      g.rotateZ(k * Math.PI * 2 / 5 + d);
      g.rotateY(Math.PI / 2);        // face +X
      g.translate(0.075, 0, 0);
      spokeParts.push(g);
    }
    const spokesGeo = mergeGeos(THREE, spokeParts);
    const barrelGeo = new THREE.CylinderGeometry(0.247, 0.247, 0.24, 48, 1, true); barrelGeo.rotateZ(Math.PI / 2);
    const lipGeo = new THREE.TorusGeometry(0.249, 0.011, 8, 56); lipGeo.rotateY(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.07, 0.078, 0.05, 28); hubGeo.rotateZ(Math.PI / 2);
    const capTex = canvasTex(THREE, 128, 128, (g, w, h) => {
      g.fillStyle = '#0d0d0d'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.fillStyle = '#c40d0d'; g.font = 'bold italic 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SRT', 64, 66);
    });
    const capMat = new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.35, metalness: 0.5 });
    const capGeoW = new THREE.CircleGeometry(0.045, 24); capGeoW.rotateY(Math.PI / 2);
    const lugGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6); lugGeo.rotateZ(Math.PI / 2);
    const rotorTex = canvasTex(THREE, 256, 256, (g, w, h) => {
      g.fillStyle = '#8a8a8d'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#4a4a4c'; g.lineWidth = 3;
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.beginPath(); g.moveTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80); g.lineTo(128 + Math.cos(a + 0.3) * 120, 128 + Math.sin(a + 0.3) * 120); g.stroke(); }
    });
    const rotorMat = new THREE.MeshStandardMaterial({ map: rotorTex, roughness: 0.35, metalness: 0.85 });

    const wheels = [];
    const cgToFront = opts.cgToFront || 1.2668, cgToRear = opts.cgToRear || 1.6792;
    const trackF = opts.trackF || 1.625, trackR = opts.trackR || 1.618;
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group();
      corner.position.set(side * (frontW ? trackF : trackR) / 2, 0, frontW ? -cgToFront : cgToRear);
      rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      const spin = new THREE.Group(); flip.add(spin);
      const tire = add(spin, tireGeos.street, tireMats.street, 0, 0, 0);
      const lugs = add(spin, koLugs, M.rubber, 0, 0, 0); lugs.visible = false;
      const rimG = new THREE.Group(); spin.add(rimG);
      // SRT five-spoke (scaled to the tyre's rim size); the Drag Pak runs its Weld race wheels, or these 20s under KO2s
      const stdRim = new THREE.Group(); rimG.add(stdRim);
      add(stdRim, barrelGeo, M.rim, -0.01, 0, 0);
      add(stdRim, lipGeo, M.rimLip, 0.115, 0, 0, 0, 0, 0, false);
      add(stdRim, spokesGeo, M.rim, 0, 0, 0);
      add(stdRim, hubGeo, M.rim, 0.085, 0, 0);
      add(stdRim, capGeoW, capMat, 0.112, 0, 0, 0, 0, 0, false);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; add(stdRim, lugGeo, M.chrome, 0.11, Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0, 0, 0, false); }
      let dragRim = null;
      if (dragpak) { dragRim = new THREE.Group(); rimG.add(dragRim); buildDragRim(dragRim, frontW); stdRim.visible = false; }
      const rr = dragpak ? 0.145 : demon ? 0.16 : frontW ? 0.2 : 0.175;
      const rotorG = new THREE.CylinderGeometry(rr, rr, 0.032, 40); rotorG.rotateZ(Math.PI / 2);
      add(spin, rotorG, rotorMat, -0.03, 0, 0);
      const hatG = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24); hatG.rotateZ(Math.PI / 2);
      add(spin, hatG, M.hat, -0.005, 0, 0);
      // caliper (fixed to knuckle, behind the axle)
      // torus arc in the wheel plane; arc sweeps from local forward towards up, centred up-and-behind the axle
      const arc = frontW ? 1.05 : 0.8;
      const calHolder = new THREE.Group(); flip.add(calHolder);
      calHolder.rotation.x = (left ? Math.PI / 4 : 3 * Math.PI / 4) - arc / 2;
      const calM = add(calHolder, new THREE.TorusGeometry(rr - 0.028, dragpak ? 0.026 : 0.034, 8, 12, arc), dragpak ? M.calBlack : M.caliper, -0.03, 0, 0, 0, Math.PI / 2, 0);
      calM.scale.set(1, 1, 1.35);
      wheels.push({ corner, flip, spin, tire, lugs, rimG, stdRim, dragRim, left, front: frontW, side });
      if (dragpak && !frontW) {
        // axle-mounted wheelie bar: triangulated tubes back to a pair of small wheels ~4" off the ground
        const dx = side * (0.26 - trackR / 2), yw = 0.16 - 0.378, L = 1.45;   // (matches the physics' wheelieBar)
        tubeAB(corner, V3(dx, -0.07, 0.02), V3(dx, yw + 0.02, L), 0.02, M.cage);
        tubeAB(corner, V3(dx, 0.12, 0.06), V3(dx, yw + 0.06, L - 0.08), 0.016, M.cage);
        tubeAB(corner, V3(dx, 0.05, 0.5), V3(dx, yw + 0.13, 0.9), 0.012, M.cage);
        if (left) tubeAB(corner, V3(dx, yw + 0.05, L - 0.12), V3(dx + 0.52, yw + 0.05, L - 0.12), 0.014, M.cage);
        // 4.5" x 3" polyurethane wheels in a fork on each bar
        const bw = new THREE.CylinderGeometry(0.058, 0.058, 0.075, 24); bw.rotateZ(Math.PI / 2);
        add(corner, bw, M.rubber, dx, yw, L);
        const bh = new THREE.CylinderGeometry(0.032, 0.032, 0.08, 16); bh.rotateZ(Math.PI / 2);
        add(corner, bh, M.polish, dx, yw, L, 0, 0, 0, false);
        const ax = new THREE.CylinderGeometry(0.009, 0.009, 0.12, 8); ax.rotateZ(Math.PI / 2);
        add(corner, ax, M.chrome, dx, yw, L, 0, 0, 0, false);
        for (const fx of [-0.052, 0.052]) add(corner, new THREE.BoxGeometry(0.01, 0.1, 0.05), M.cage, dx + fx, yw + 0.04, L - 0.01, 0, 0, 0, false);
      }
    }
    function setTires(front, rearT) {
      for (const w of wheels) {
        const t = tireGeos[w.front ? front : rearT] ? (w.front ? front : rearT) : 'street';
        w.tire.geometry = tireGeos[t];
        w.tire.material = tireMats[t];
        w.lugs.visible = t === 'offroad';
        if (w.dragRim) { w.dragRim.visible = t !== 'offroad'; w.stdRim.visible = t === 'offroad'; }
        const sc = RIM_R[t] / 0.254;
        w.stdRim.scale.set(1, sc, sc);
      }
    }

    // ---------------- interior: laid out from the driver's sight lines (eye -> gauges through the upper wheel opening,
    // hood visible over the dash). Driver sits on the left.
    const eye = new THREE.Vector3(-0.37, 1.19, 0.47);
    M.dash.color.setHex(0x26262a); M.trim.color.setHex(0x303035); M.leather.color.setHex(0x1b1b1e);
    M.alcantara.color.setHex(0x2a2a2d);
    const cabinLight = new THREE.PointLight(0xfff1e2, 1.6, 2.8, 1.2); cabinLight.position.set(-0.15, 1.3, 0.3); intr.add(cabinLight);
    // floor & tunnel
    add(intr, new THREE.BoxGeometry(1.64, 0.03, 2.5), M.carpet, 0, 0.27, 0.35, 0, 0, 0, false);
    add(intr, new THREE.BoxGeometry(0.26, 0.2, 2.2), M.carpet, 0, 0.37, 0.25, 0, 0, 0, false);
    // dashboard: extruded side profile across the full width
    const dashS = new THREE.Shape();
    const dp = [[-0.66, 0.995], [-0.46, 1.008], [-0.33, 1.004], [-0.27, 0.985], [-0.245, 0.94], [-0.255, 0.86], [-0.3, 0.74], [-0.38, 0.6], [-0.6, 0.52], [-0.72, 0.6], [-0.72, 0.96]];
    dashS.moveTo(dp[0][0], dp[0][1]); for (let i = 1; i < dp.length; i++) dashS.lineTo(dp[i][0], dp[i][1]);
    const dashG = new THREE.ExtrudeGeometry(dashS, { depth: 1.58, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 });
    dashG.rotateY(-Math.PI / 2); dashG.translate(0.79, 0, 0);
    add(intr, dashG, M.dash, 0, 0, 0, 0, 0, 0, false);
    // brushed-aluminium trim strip across the passenger side + SRT badge
    add(intr, new THREE.BoxGeometry(0.66, 0.03, 0.012), M.alu, 0.44, 0.9, -0.252, -0.12, 0, 0, false);
    const dashBadge = canvasTex(THREE, 128, 40, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#c40d0d'; g.font = 'bold italic 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SRT', w / 2, h / 2 + 1); });
    add(intr, new THREE.PlaneGeometry(0.07, 0.022), new THREE.MeshBasicMaterial({ map: dashBadge, transparent: true }), 0.6, 0.955, -0.244, -0.2, 0, 0, false);
    // gauge binnacle: tilted to face the driver; visor sits above the dials so it never covers them
    const bin = new THREE.Group(); bin.position.set(-0.37, 0.962, -0.208); bin.rotation.x = -0.29; intr.add(bin);
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 1024; clusterCanvas.height = 400;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace; clusterTex.anisotropy = 8;
    let shiftLamp = null;
    if (dragpak) {
      // carbon bezel: Holley 7" digital dash + tach / brake-pressure / oil-pressure gauges, shift light on top
      add(bin, new THREE.BoxGeometry(0.56, 0.22, 0.03), M.carbon, 0, 0.0, -0.02, 0, 0, 0, false);
      add(bin, new THREE.PlaneGeometry(0.52, 0.203), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0, -0.003, 0, 0, 0, false);
      add(bin, new THREE.CylinderGeometry(0.03, 0.034, 0.05, 20), M.gloss, 0.0, 0.135, -0.01, Math.PI / 2 - 0.3, 0, 0, false);
      shiftLamp = add(bin, new THREE.CircleGeometry(0.027, 20), new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff2010, emissiveIntensity: 0 }), 0.0, 0.142, 0.016, -0.3, 0, 0, false);
    } else {
      add(bin, new THREE.BoxGeometry(0.54, 0.21, 0.08), M.dash, 0, 0.0, -0.045, 0, 0, 0, false);
      const visorG = new THREE.CylinderGeometry(0.12, 0.12, 0.56, 28, 1, true, 0, Math.PI); visorG.rotateZ(Math.PI / 2);
      const visor = add(bin, visorG, new THREE.MeshStandardMaterial({ color: 0x26262a, roughness: 0.8, side: THREE.DoubleSide }), 0, 0.09, 0.0, 0, 0, 0, false);
      visor.scale.set(1, 0.55, 0.8);
      for (const sx2 of [-1, 1]) add(bin, new THREE.BoxGeometry(0.02, 0.17, 0.12), M.dash, sx2 * 0.27, 0.02, 0.02, 0, 0, 0, false);
      add(bin, new THREE.PlaneGeometry(0.46, 0.18), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0, 0.0, 0, 0, 0, false);
      for (const dx of [-0.1403, 0.1403]) add(bin, new THREE.TorusGeometry(0.084, 0.0045, 8, 48), M.chrome, dx, -0.002, 0.004, 0, 0, 0, false);
    }
    // centre stack angled to the driver + 8.4" Uconnect screen (live canvas); the Drag Pak gets a switch panel instead
    const stack = new THREE.Group(); stack.position.set(0.03, 0.8, -0.262); stack.rotation.set(-0.3, -0.16, 0); intr.add(stack);
    if (dragpak) {
      stack.visible = false;
      const sw = new THREE.Group(); sw.position.set(0.02, 0.8, -0.262); sw.rotation.set(-0.3, -0.16, 0); intr.add(sw);
      const swTex = canvasTex(THREE, 512, 300, (g, w, h) => {
        g.fillStyle = '#141518'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) for (let j = 0; j < 10; j++) { g.fillStyle = ((i + j) >> 1) % 2 ? '#1b1c20' : '#24262b'; g.fillRect(i * 32, j * 30, 32, 30); }
        g.fillStyle = '#e8e8e8'; g.font = 'bold 30px Arial'; g.textAlign = 'center';
        ['IGN', 'FUEL', 'FAN', 'PUMP', 'LIGHTS'].forEach((t, k) => g.fillText(t, 60 + k * 98, 60));
        g.fillStyle = '#b3121a'; g.fillText('START', 256, 280);
      });
      add(sw, new THREE.BoxGeometry(0.34, 0.2, 0.012), new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.4, metalness: 0.2 }), 0, 0.0, 0.0, 0, 0, 0, false);
      for (let k = 0; k < 5; k++) {
        const x = -0.137 + k * 0.0655;
        add(sw, new THREE.CylinderGeometry(0.009, 0.009, 0.012, 12), M.chrome, x, 0.012, 0.012, Math.PI / 2, 0, 0, false);
        add(sw, new THREE.CylinderGeometry(0.003, 0.004, 0.035, 8), M.chrome, x, 0.025, 0.022, 0.6, 0, 0, false);
      }
      add(sw, new THREE.CylinderGeometry(0.018, 0.018, 0.016, 20), M.harness, 0, -0.062, 0.012, Math.PI / 2, 0, 0, false);
      // fire extinguisher on the passenger floor
      add(intr, new THREE.CylinderGeometry(0.045, 0.045, 0.3, 18), M.harness, 0.36, 0.36, 0.5, Math.PI / 2, 0, 0, false);
      add(intr, new THREE.CylinderGeometry(0.02, 0.03, 0.06, 12), M.chrome, 0.36, 0.36, 0.33, Math.PI / 2, 0, 0, false);
    }
    add(stack, new THREE.BoxGeometry(0.36, 0.42, 0.05), M.trim, 0, -0.05, -0.02, 0, 0, 0, false);
    const scrCanvas = document.createElement('canvas'); scrCanvas.width = 512; scrCanvas.height = 300;
    const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace;
    add(stack, new THREE.BoxGeometry(0.235, 0.145, 0.012), M.gloss, 0, 0.075, 0.008, 0, 0, 0, false);
    add(stack, new THREE.PlaneGeometry(0.215, 0.126), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }), 0, 0.075, 0.0145, 0, 0, 0, false);
    for (const vx of [-0.11, 0.11]) {
      add(stack, new THREE.BoxGeometry(0.1, 0.055, 0.02), M.grille, vx, -0.055, 0.012, 0, 0, 0, false);
      add(stack, new THREE.BoxGeometry(0.104, 0.004, 0.022), M.alu, vx, -0.028, 0.012, 0, 0, 0, false);
    }
    for (let k = 0; k < 3; k++) {
      add(stack, new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20), M.gloss, -0.085 + k * 0.085, -0.15, 0.02, Math.PI / 2, 0, 0, false);
      add(stack, new THREE.TorusGeometry(0.023, 0.003, 6, 24), M.alu, -0.085 + k * 0.085, -0.15, 0.031, 0, 0, 0, false);
    }
    // outer dash vents
    for (const vx of dragpak ? [] : [-0.72, 0.72]) {
      add(intr, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24), M.grille, vx, 0.905, -0.258, Math.PI / 2 - 0.2, 0, 0, false);
      add(intr, new THREE.TorusGeometry(0.046, 0.004, 6, 28), M.alu, vx, 0.905, -0.24, -0.2, 0, 0, false);
    }
    // centre console + shifter
    const shifterAuto = new THREE.Group(); intr.add(shifterAuto);
    if (dragpak) {
      // mechanical ratchet shifter on the tunnel: tall stick, T-handle, trigger release
      shifterAuto.position.set(-0.05, 0.47, 0.18);
      add(shifterAuto, new THREE.BoxGeometry(0.07, 0.04, 0.24), M.sheet, 0, 0, 0, 0, 0, 0, false);
      add(shifterAuto, new THREE.BoxGeometry(0.02, 0.03, 0.2), M.gloss, 0, 0.03, 0, 0, 0, 0, false);
      const stick = new THREE.Group(); stick.position.set(0, 0.03, -0.03); stick.rotation.x = -0.18; shifterAuto.add(stick);
      add(stick, new THREE.CylinderGeometry(0.009, 0.011, 0.38, 12), M.polish, 0, 0.19, 0, 0, 0, 0, false);
      add(stick, new THREE.CylinderGeometry(0.016, 0.016, 0.11, 14), M.gloss, 0, 0.385, 0, 0, 0, Math.PI / 2, false);
      add(stick, new THREE.BoxGeometry(0.012, 0.05, 0.016), M.polish, 0, 0.33, -0.018, 0.2, 0, 0, false);
    } else {
      shifterAuto.position.set(0.0, 0.62, -0.02);
      add(intr, new THREE.BoxGeometry(0.24, 0.28, 0.95), M.trim, 0, 0.47, 0.1, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(0.22, 0.05, 0.36), M.leather, 0, 0.64, 0.48, 0, 0, 0, false);
      add(shifterAuto, new THREE.BoxGeometry(0.05, 0.1, 0.06), M.gloss, 0, 0.04, 0, -0.25, 0, 0, false);
      add(shifterAuto, new THREE.BoxGeometry(0.055, 0.035, 0.13), M.alu, 0, 0.1, 0.03, -0.15, 0, 0, false);
      add(shifterAuto, new THREE.BoxGeometry(0.02, 0.07, 0.02), M.alu, 0.0, 0.085, -0.03, -0.2, 0, 0, false);
    }
    const shifterMan = new THREE.Group(); shifterMan.position.set(0.0, 0.62, 0.0); intr.add(shifterMan);
    add(shifterMan, new THREE.CylinderGeometry(0.012, 0.016, 0.16, 12), M.alu, 0, 0.08, 0, 0, 0, 0, false);
    add(shifterMan, new THREE.SphereGeometry(0.03, 16, 12), M.gloss, 0, 0.17, 0, 0, 0, 0, false);
    add(shifterMan, new THREE.CylinderGeometry(0.05, 0.06, 0.03, 16), M.leather, 0, 0.01, 0, 0, 0, 0, false);
    // steering wheel: flat-bottom SRT wheel, brushed spokes, paddles
    const wheelPivot = new THREE.Group(); wheelPivot.position.set(-0.37, 0.845, -0.02); wheelPivot.rotation.x = -0.33; intr.add(wheelPivot);
    const steerWheel = new THREE.Group(); wheelPivot.add(steerWheel);
    class RimCurve extends THREE.Curve {
      getPoint(t, target) {
        const a = t * Math.PI * 2;
        let x = Math.sin(a) * 0.18, y = Math.cos(a) * 0.18;
        if (y < -0.14) y = -0.14 + (y + 0.14) * 0.2;
        return (target || new THREE.Vector3()).set(x, y, 0);
      }
    }
    if (dragpak) {
      // quick-release race wheel: round suede rim, three drilled aluminium spokes, QR hub, no airbag
      const rim = new THREE.TorusGeometry(0.165, 0.017, 12, 64);
      add(steerWheel, rim, M.alcantara, 0, 0, 0, 0, 0, 0, false);
      add(steerWheel, new THREE.BoxGeometry(0.03, 0.012, 0.038), M.harness, 0, 0.165, 0, 0, 0, 0, false);
      for (const a of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) {
        const sp2 = add(steerWheel, new THREE.BoxGeometry(0.15, 0.03, 0.006), M.polish, Math.cos(a + Math.PI) * 0.075, Math.sin(a + Math.PI) * 0.075, -0.012, 0, 0, a, false);
        sp2.userData.spoke = true;
      }
      add(steerWheel, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 20), M.gloss, 0, 0, -0.03, Math.PI / 2, 0, 0, false);
      add(steerWheel, new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), M.harness, 0, 0, 0.0, Math.PI / 2, 0, 0, false);
      add(wheelPivot, new THREE.CylinderGeometry(0.025, 0.025, 0.34, 12), M.polish, 0, 0, -0.21, Math.PI / 2, 0, 0, false);
    } else {
    add(steerWheel, new THREE.TubeGeometry(new RimCurve(), 110, 0.019, 12, true), M.leather, 0, 0, 0, 0, 0, 0, false);
    add(steerWheel, new THREE.BoxGeometry(0.03, 0.012, 0.042), M.red, 0, 0.18, 0, 0, 0, 0, false);  // 12 o'clock stripe
    for (const [sx, rot] of [[-1, 0.05], [1, -0.05]]) add(steerWheel, new THREE.BoxGeometry(0.13, 0.036, 0.016), M.alu, sx * 0.105, -0.015, -0.012, 0, 0, rot, false);
    add(steerWheel, new THREE.BoxGeometry(0.042, 0.095, 0.016), M.alu, 0, -0.1, -0.012, 0, 0, 0, false);
    add(steerWheel, new THREE.CylinderGeometry(0.06, 0.066, 0.05, 28), M.trim, 0, 0, -0.022, Math.PI / 2, 0, 0, false);
    const hubTex = canvasTex(THREE, 128, 128, (g, w, h) => {
      g.fillStyle = '#18181a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c40d0d'; g.font = 'bold italic 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SRT', 64, 66);
    });
    add(steerWheel, new THREE.CircleGeometry(0.056, 28), new THREE.MeshStandardMaterial({ map: hubTex, roughness: 0.6 }), 0, 0, 0.004, 0, 0, 0, false);
    for (const sx of [-1, 1]) {
      add(steerWheel, new THREE.BoxGeometry(0.018, 0.05, 0.03), M.trim, sx * 0.155, 0.045, -0.02, 0, 0, 0, false);
      add(wheelPivot, new THREE.BoxGeometry(0.065, 0.1, 0.008), M.alu, sx * 0.13, 0.06, -0.05, 0, 0, sx * 0.4, false);
    }
    add(wheelPivot, new THREE.CylinderGeometry(0.035, 0.045, 0.3, 16), M.trim, 0, 0, -0.19, Math.PI / 2, 0, 0, false);
    }
    // seats
    function seat(x) {
      const g = new THREE.Group(); g.position.set(x, 0.3, 0.66); intr.add(g);
      add(g, new THREE.BoxGeometry(0.5, 0.12, 0.52), M.leather, 0, 0.12, -0.05, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.08, 0.14, 0.5), M.leather, sx * 0.23, 0.19, -0.05, 0, 0, sx * 0.25, false);
      const back = new THREE.Group(); back.position.set(0, 0.18, 0.2); back.rotation.x = 0.2; g.add(back);
      add(back, new THREE.BoxGeometry(0.48, 0.66, 0.12), M.leather, 0, 0.33, 0, 0, 0, 0, false);
      add(back, new THREE.BoxGeometry(0.4, 0.5, 0.02), M.alcantara, 0, 0.3, -0.065, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(back, new THREE.BoxGeometry(0.08, 0.55, 0.18), M.leather, sx * 0.23, 0.3, -0.04, 0, sx * 0.3, 0, false);
      add(back, new THREE.BoxGeometry(0.28, 0.2, 0.12), M.leather, 0, 0.78, 0, 0, 0, 0, false);
      add(back, new THREE.BoxGeometry(0.3, 0.012, 0.004), M.red, 0, 0.54, -0.068, 0, 0, 0, false);
      return g;
    }
    function raceSeat(x) {
      // Racetech composite shell: high sides, shoulder and head wings, 5-point cam-lock harness lying on it
      const g = new THREE.Group(); g.position.set(x, 0.3, 0.66); intr.add(g);
      add(g, new THREE.BoxGeometry(0.4, 0.05, 0.46), M.gloss, 0, 0.08, -0.05, 0, 0, 0, false);
      add(g, new THREE.BoxGeometry(0.36, 0.03, 0.42), M.alcantara, 0, 0.115, -0.05, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.025, 0.2, 0.46), M.gloss, sx * 0.215, 0.16, -0.05, 0, 0, 0, false);
      const back = new THREE.Group(); back.position.set(0, 0.1, 0.19); back.rotation.x = 0.18; g.add(back);
      add(back, new THREE.BoxGeometry(0.42, 0.78, 0.04), M.gloss, 0, 0.39, 0.02, 0, 0, 0, false);
      add(back, new THREE.BoxGeometry(0.34, 0.6, 0.03), M.alcantara, 0, 0.36, -0.01, 0, 0, 0, false);
      for (const sx of [-1, 1]) {
        add(back, new THREE.BoxGeometry(0.025, 0.55, 0.2), M.gloss, sx * 0.215, 0.3, -0.07, 0, 0, 0, false);     // rib wings
        add(back, new THREE.BoxGeometry(0.025, 0.2, 0.2), M.gloss, sx * 0.13, 0.7, -0.08, 0, sx * 0.25, 0, false); // head wings
        add(back, new THREE.BoxGeometry(0.05, 0.62, 0.008), M.harness, sx * 0.08, 0.42, -0.03, 0, 0, sx * 0.05, false); // shoulder belts
      }
      add(back, new THREE.BoxGeometry(0.1, 0.03, 0.03), M.gloss, 0, 0.62, -0.02, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.2, 0.012, 0.05), M.harness, sx * 0.1, 0.132, 0.02, 0, sx * 0.2, 0, false); // lap belts
      add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), M.polish, 0, 0.14, 0.0, 0, 0, 0, false);                               // cam-lock
      add(g, new THREE.BoxGeometry(0.05, 0.012, 0.2), M.harness, 0, 0.132, -0.12, 0, 0, 0, false);                                     // sub strap
      return g;
    }
    if (dragpak) raceSeat(-0.37);
    else {
      seat(-0.37); seat(0.37);
      add(intr, new THREE.BoxGeometry(1.3, 0.12, 0.45), M.leather, 0, 0.45, 1.38, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(1.3, 0.45, 0.12), M.leather, 0, 0.7, 1.58, -0.25, 0, 0, false);
      add(intr, new THREE.BoxGeometry(1.4, 0.02, 0.3), M.trim, 0, 1.04, 1.72, 0, 0, 0, false);
    }
    // door cards
    for (const sx of dragpak ? [] : [-1, 1]) {
      add(intr, new THREE.BoxGeometry(0.04, 0.68, 1.75), M.trim, sx * 0.83, 0.66, 0.28, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(0.07, 0.05, 0.6), M.leather, sx * 0.79, 0.74, 0.35, 0, 0, 0, false);
      add(intr, new THREE.CylinderGeometry(0.07, 0.07, 0.01, 24), M.grille, sx * 0.81, 0.48, -0.05, 0, 0, Math.PI / 2, false);
      add(intr, new THREE.BoxGeometry(0.02, 0.02, 0.12), M.alu, sx * 0.8, 0.86, 0.02, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(0.05, 0.03, 1.7), M.dash, sx * 0.8, 1.0, 0.3, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(0.34, 0.012, 0.16), M.alcantara, sx * 0.34, 1.385, 0.2, 0.25, 0, 0, false);   // sun visor
    }
    if (dragpak) {
      for (const sx of [-1, 1]) add(intr, new THREE.BoxGeometry(0.015, 0.62, 1.72), M.sheet, sx * 0.84, 0.64, 0.28, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(1.5, 0.6, 0.02), M.sheet, 0, 0.62, 1.42, 0, 0, 0, false);            // rear bulkhead
      // SFI 25.5C 4130 chromoly cage: main hoop, halo, A-pillar downtubes, door bars, rear braces, harness bar, padding
      const R = 0.021, zH = 1.0;
      const inX = (z, y) => (y > bodyYT(z) ? ghXatY(z, y) : sideXat(z, y)) - 0.075;
      const hoop = [];
      for (const [sx, y] of [[-1, 0.3], [-1, 0.95], [-1, 1.18], [-1, 1.34], [0, 1.385], [1, 1.34], [1, 1.18], [1, 0.95], [1, 0.3]]) {
        const x = sx === 0 ? 0 : sx * Math.min(0.74, y > 1.3 ? inX(zH, y) - 0.03 : inX(zH, y));
        hoop.push(V3(x, y, zH));
      }
      add(intr, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hoop), 60, R, 10, false), M.cage, 0, 0, 0, 0, 0, 0, false);
      for (const sx of [-1, 1]) {
        const halo = [V3(sx * (inX(zH, 1.34) - 0.03), 1.34, zH), V3(sx * (inX(0.6, 1.36) - 0.03), 1.36, 0.6), V3(sx * (inX(0.2, 1.33) - 0.03), 1.33, 0.2),
          V3(sx * (inX(-0.15, 1.18) - 0.02), 1.18, -0.15), V3(sx * (inX(-0.45, 1.0)), 1.0, -0.45), V3(sx * 0.7, 0.62, -0.62), V3(sx * 0.68, 0.3, -0.68)];
        add(intr, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(halo), 60, R, 10, false), M.cage, 0, 0, 0, 0, 0, 0, false);
        // door bars (NASCAR style) and a rear brace to the shock towers
        tubeAB(intr, V3(sx * 0.76, 0.48, zH), V3(sx * 0.72, 0.46, -0.6), R, M.cage);
        tubeAB(intr, V3(sx * 0.76, 0.66, zH), V3(sx * 0.72, 0.7, -0.58), R, M.cage);
        tubeAB(intr, V3(sx * 0.76, 0.5, zH - 0.05), V3(sx * 0.72, 0.68, -0.5), R * 0.9, M.cage);
        tubeAB(intr, V3(sx * (inX(zH, 1.34) - 0.03), 1.34, zH), V3(sx * 0.62, 0.55, 2.0), R, M.cage);
      }
      tubeAB(intr, V3(-0.62, 1.3, zH), V3(0.72, 0.36, zH), R, M.cage);                     // main-hoop diagonal
      tubeAB(intr, V3(-0.72, 0.95, zH + 0.01), V3(0.72, 0.95, zH + 0.01), R, M.cage);        // harness bar
      // SFI padding where a helmet can reach it
      const padAB = (a, b) => tubeAB(intr, a, b, 0.036, M.pad, 14);
      padAB(V3(-(inX(0.7, 1.35) - 0.03), 1.355, 0.75), V3(-(inX(0.2, 1.33) - 0.03), 1.33, 0.2));
      padAB(V3(-0.6, 1.33, zH), V3(-0.2, 1.38, zH));
      padAB(V3(-0.76, 0.5, 0.8), V3(-0.745, 0.49, 0.1));
    }
    // rear-view mirror: hangs on a stalk from the windshield header, turned towards the driver
    const rvm = new THREE.Group(); rvm.position.set(-0.13, 1.305, 0.06); rvm.rotation.set(0.1, -0.26, 0); intr.add(rvm);
    {
      const w = 0.25, h = 0.068, r = 0.025, sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); sh.lineTo(w / 2, h / 2 - r);
      sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const rg = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.005, bevelSegments: 2, curveSegments: 6 });
      rg.translate(0, 0, -0.02);
      add(rvm, rg, M.trim, 0, 0, 0, 0, 0, 0, false);
    }
    const rvRT = new THREE.WebGLRenderTarget(512, 132);
    rvRT.texture.repeat.x = -1; rvRT.texture.offset.x = 1;
    const rvMesh = add(rvm, new THREE.PlaneGeometry(0.236, 0.056), new THREE.MeshBasicMaterial({ map: rvRT.texture }), 0, 0, 0.0095, 0, 0, 0, false);
    const rvCam = new THREE.PerspectiveCamera(12, 0.236 / 0.056, 0.3, 700);
    rvCam.position.set(0, 1.33, 0.2); rvCam.rotation.set(-0.04, Math.PI, 0);
    model.add(rvCam);
    mirrors.push({ mesh: rvMesh, cam: rvCam, rt: rvRT });
    {
      // stalk from the top of the mirror to the header mount
      const a = new THREE.Vector3(-0.13, 1.336, 0.058), b = new THREE.Vector3(-0.125, 1.382, 0.082);
      const d = b.clone().sub(a), L = d.length();
      const st = add(intr, new THREE.CylinderGeometry(0.008, 0.01, L, 10), M.trim, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0, 0, 0, false);
      st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      add(intr, new THREE.BoxGeometry(0.05, 0.016, 0.04), M.trim, -0.125, 1.386, 0.085, -0.5, 0, 0, false);
    }

    // ---------------- lights
    const headlights = [];
    for (const sx of [-1, 1]) {
      const sl = new THREE.SpotLight(0xfff2de, 0, 140, 0.42, 0.55, 1.3);
      sl.position.set(sx * 0.56, lampY - cgH, Z_FRONT + zOff - 0.05);
      sl.target.position.set(sx * 0.9, -cgH - 0.4, Z_FRONT + zOff - 40);
      rootG.add(sl); rootG.add(sl.target);
      sl.visible = false;
      headlights.push(sl);
    }

    // ---------------- dash drawing
    const cg = clusterCanvas.getContext('2d');
    function dial(g, cx, cy, r, v, vmax, step, sub, label, red, unit, big) {
      g.save();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      const ang = (x) => a0 + (a1 - a0) * x / vmax;
      const grad = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, '#16181b'); grad.addColorStop(1, '#050506');
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      g.strokeStyle = '#6d6f73'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r - 3, 0, 7); g.stroke();
      if (red) { g.strokeStyle = '#d11'; g.lineWidth = 12; g.beginPath(); g.arc(cx, cy, r - 16, ang(red), a1); g.stroke(); }
      g.strokeStyle = '#eee'; g.fillStyle = '#eee';
      for (let x = 0; x <= vmax + 1e-6; x += sub) {
        const a = ang(x), major = Math.abs(x / step - Math.round(x / step)) < 1e-6;
        g.lineWidth = major ? 4 : 2;
        const r1 = r - 10, r2 = r - (major ? 30 : 20);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
        if (major) {
          g.font = 'bold ' + Math.round(r * 0.14) + 'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(Math.round(x / (big || 1))), cx + Math.cos(a) * (r - 52), cy + Math.sin(a) * (r - 52));
        }
      }
      g.font = Math.round(r * 0.09) + 'px Arial'; g.fillStyle = '#aaa'; g.fillText(label, cx, cy + r * 0.42);
      if (unit) g.fillText(unit, cx, cy + r * 0.56);
      const a = ang(clamp(v, 0, vmax * 1.03));
      g.strokeStyle = '#ff2a1a'; g.lineWidth = 7; g.shadowColor = '#f00'; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(cx - Math.cos(a) * 18, cy - Math.sin(a) * 18); g.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18)); g.stroke();
      g.shadowBlur = 0; g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fill();
      g.restore();
    }
    let dpBg = null;
    function drawHolley(t) {
      const g = cg, w = 1024, h = 400;
      if (!dpBg) {
        dpBg = document.createElement('canvas'); dpBg.width = w; dpBg.height = h;
        const b = dpBg.getContext('2d');
        for (let i = 0; i < 64; i++) for (let j = 0; j < 25; j++) { b.fillStyle = ((i + j) >> 1) % 2 ? '#15161a' : '#23252a'; b.fillRect(i * 16, j * 16, 16, 16); }
        b.fillStyle = '#000'; b.fillRect(24, 22, 560, 356); b.strokeStyle = '#3a3a3e'; b.lineWidth = 6; b.strokeRect(24, 22, 560, 356);
      }
      g.drawImage(dpBg, 0, 0);
      const red = t.redline || 9300, maxR = Math.max(10000, t.maxRpm || 0);
      // Holley EFI 7" screen
      g.save(); g.beginPath(); g.rect(30, 28, 548, 344); g.clip();
      g.fillStyle = '#05070a'; g.fillRect(30, 28, 548, 344);
      const nSeg = 40, segW = 12;
      for (let k = 0; k < nSeg; k++) {
        const r = (k + 1) / nSeg * maxR, on = t.rpm >= r - maxR / nSeg * 0.5;
        g.fillStyle = r > red ? (on ? '#ff2a1a' : '#3a0c0a') : r > red - 1500 ? (on ? '#ffc400' : '#3a3000') : (on ? '#32e05a' : '#0b2a12');
        g.fillRect(44 + k * 13, 40, segW, 30);
      }
      g.fillStyle = '#9aa'; g.font = '18px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('RPM', 44, 88);
      g.fillStyle = '#fff'; g.font = 'bold 86px Arial'; g.textAlign = 'right'; g.fillText(String(Math.round(t.rpm / 10) * 10), 380, 140);
      g.fillStyle = t.shiftNow ? '#ff3a2a' : '#ffffff'; g.font = 'bold 120px Arial'; g.textAlign = 'center'; g.fillText(t.gear.replace(/^[DM]/, ''), 490, 150);
      g.fillStyle = '#9aa'; g.font = '18px Arial'; g.fillText('GEAR', 490, 88);
      const cells = [['MPH', Math.round(t.speedMph)], ['BOOST', t.boost.toFixed(1)], ['OIL', Math.round(t.oil)], ['WATER', Math.round(t.water)],
        ['AFR', t.afr.toFixed(1)], ['VOLTS', t.volts.toFixed(1)]];
      cells.forEach(([k, v], i) => {
        const cx = 44 + (i % 3) * 180, cy = 218 + Math.floor(i / 3) * 70;
        g.strokeStyle = '#1e2a33'; g.lineWidth = 2; g.strokeRect(cx, cy - 26, 170, 60);
        g.fillStyle = '#6fa8c8'; g.font = '16px Arial'; g.textAlign = 'left'; g.fillText(k, cx + 8, cy - 12);
        g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.textAlign = 'right'; g.fillText(String(v), cx + 160, cy + 16);
      });
      g.font = 'bold 22px Arial'; g.textAlign = 'left';
      if (t.launch) { g.fillStyle = '#ffc400'; g.fillText('TRANSBRAKE', 44, 356); }
      else if (t.chute) { g.fillStyle = '#ff5a3a'; g.fillText('CHUTE OUT', 44, 356); }
      else if (!t.running) { g.fillStyle = '#ff3a2a'; g.fillText('ENGINE OFF', 44, 356); }
      else if (t.tc) { g.fillStyle = '#ffc400'; g.fillText('TRACTION', 44, 356); }
      g.fillStyle = '#6fa8c8'; g.textAlign = 'right'; g.font = '18px Arial'; g.fillText(t.lastEt ? 'LAST  ' + t.lastEt : 'HOLLEY EFI', 566, 356);
      g.restore();
      // three round gauges: tach, brake pressure, oil pressure
      const gauge = (cx, cy, r, v, vmax, step, label, redFrom, big) => {
        g.save();
        const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = (x) => a0 + (a1 - a0) * clamp(x / vmax, 0, 1.02);
        g.fillStyle = '#060607'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
        g.strokeStyle = '#b9bcc2'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r - 3, 0, 7); g.stroke();
        if (redFrom) { g.strokeStyle = '#d11'; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, r - 12, ang(redFrom), a1); g.stroke(); }
        g.strokeStyle = '#eee'; g.fillStyle = '#eee';
        for (let x = 0; x <= vmax + 1e-6; x += step) {
          const a = ang(x); g.lineWidth = 3;
          g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); g.lineTo(cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20)); g.stroke();
          g.font = 'bold ' + Math.round(r * 0.2) + 'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(Math.round(x / (big || 1))), cx + Math.cos(a) * (r - 36), cy + Math.sin(a) * (r - 36));
        }
        g.fillStyle = '#aaa'; g.font = Math.round(r * 0.13) + 'px Arial'; g.fillText(label, cx, cy + r * 0.5);
        const a = ang(v); g.strokeStyle = '#ff5a1a'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
        g.fillStyle = '#333'; g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill();
        g.restore();
      };
      gauge(740, 200, 150, t.rpm, maxR, maxR <= 12000 ? 1000 : maxR <= 24000 ? 2000 : 5000, 'RPM x1000', red, 1000);
      gauge(940, 110, 72, t.brakeP, 1500, 500, 'BRAKE PSI');
      gauge(940, 292, 72, t.oil, 100, 25, 'OIL PSI');
      clusterTex.needsUpdate = true;
      if (shiftLamp) shiftLamp.material.emissiveIntensity = t.shiftNow ? 6 : 0;
    }
    function drawCluster(t) {
      if (dragpak) { drawHolley(t); return; }
      const g = cg, w = 1024, h = 400;
      g.fillStyle = '#020203'; g.fillRect(0, 0, w, h);
      const tk = (t.maxRpm || 7000) / 1000, tStep = tk <= 10 ? 1 : tk <= 20 ? 2 : tk <= 40 ? 5 : 10;
      dial(g, 200, 205, 190, t.rpm / 1000, tk, tStep, tStep / 2, 'RPM x1000', (t.redline || 6200) / 1000, '', 1);
      dial(g, 824, 205, 190, t.speedMph, 200, 20, 10, 'MPH', 0, '', 1);
      // centre 7" TFT
      g.fillStyle = '#07080a'; g.fillRect(392, 28, 240, 344);
      g.strokeStyle = '#333'; g.lineWidth = 2; g.strokeRect(392, 28, 240, 344);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 84px Arial'; g.fillText(t.gear, 512, 122);
      g.font = 'bold 44px Arial'; g.fillText(String(Math.round(t.speedMph)), 512, 250);
      g.font = '20px Arial'; g.fillStyle = '#aaa'; g.fillText('MPH', 512, 282);
      g.fillStyle = '#d22'; g.font = 'bold 22px Arial'; g.fillText(t.mode, 512, 52);
      g.fillStyle = '#888'; g.font = '18px Arial'; g.fillText('BOOST ' + t.boost.toFixed(1) + ' psi', 512, 320);
      g.fillStyle = '#333'; g.fillRect(420, 340, 184, 10);
      g.fillStyle = '#e33'; g.fillRect(420, 340, 184 * clamp(t.boost / (t.boostMax || 11.6), 0, 1), 10);
      // tell-tales
      g.font = 'bold 20px Arial';
      if (t.tc) { g.fillStyle = '#f5a300'; g.fillText('TC', 440, 100); }
      if (t.abs) { g.fillStyle = '#f5a300'; g.fillText('ABS', 590, 100); }
      if (t.lineLock) { g.fillStyle = '#f33'; g.fillText('LINE LOCK', 512, 215); }
      if (!t.running) { g.fillStyle = '#f33'; g.fillText('ENGINE OFF', 512, 215); }
      if (t.shift) { g.fillStyle = '#2f6'; g.beginPath(); g.arc(512, 100, 12, 0, 7); g.fill(); }
      clusterTex.needsUpdate = true;
    }
    const sg = scrCanvas.getContext('2d');
    function drawScreen(t) {
      const g = sg, w = 512, h = 300;
      g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b00'; g.fillRect(0, 0, w, 34);
      g.fillStyle = '#fff'; g.font = 'bold italic 20px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('SRT  PERFORMANCE PAGES', 12, 18);
      g.textAlign = 'right'; g.font = '16px Arial'; g.fillText(t.clock, w - 12, 18);
      // g-force ball
      g.strokeStyle = '#444'; g.lineWidth = 2;
      for (const rr of [30, 60, 90]) { g.beginPath(); g.arc(110, 170, rr, 0, 7); g.stroke(); }
      g.fillStyle = '#e22'; g.beginPath(); g.arc(110 + clamp(t.gLat, -1.5, 1.5) * 60, 170 - clamp(t.gLong, -1.5, 1.5) * 60, 8, 0, 7); g.fill();
      g.fillStyle = '#aaa'; g.textAlign = 'center'; g.font = '14px Arial'; g.fillText('G-FORCE', 110, 280);
      // timers
      g.textAlign = 'left'; g.fillStyle = '#ddd'; g.font = '18px Arial';
      const rows = [['0-60 mph', t.t60], ['0-100 mph', t.t100], ['1/4 mile', t.tq], ['60-0 brake', t.brk]];
      rows.forEach((r, i) => { g.fillStyle = '#888'; g.fillText(r[0], 232, 70 + i * 36); g.fillStyle = '#fff'; g.fillText(r[1] || '--', 360, 70 + i * 36); });
      g.fillStyle = '#888'; g.fillText('Boost', 232, 222); g.fillStyle = '#fff'; g.fillText(t.boost.toFixed(1) + ' psi', 360, 222);
      g.fillStyle = '#888'; g.fillText('Mode', 232, 256); g.fillStyle = '#e33'; g.fillText(t.mode, 360, 256);
      scrTex.needsUpdate = true;
    }

    function setPaint(name) {
      const c = PAINTS[name]; if (c === undefined) return;
      M.paint.color.setHex(c); M.paintPlain.color.setHex(c);
    }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 4.0 : (o.night ? 0.9 : 0.35);
      M.tailRing.emissiveIntensity = o.brake ? 5 : (o.night ? 2.2 : 1.2);
      M.reverse.emissiveIntensity = o.reverse ? 3 : 0;
      M.headlamp.emissiveIntensity = o.headlights ? 3.5 : 0;
      for (const h of headlights) { h.visible = !!o.headlights; h.intensity = o.headlights ? 160 : 0; }
    }
    function setInteriorVisible(v, cockpit) { intr.visible = v; ext.visible = true; M.glass.opacity = cockpit ? 0.16 : 0.72; }
    function setTransmission(type) { shifterAuto.visible = type === 'auto'; shifterMan.visible = type !== 'auto'; }
    // parachute: out = deployed, infl 0..1 (from the physics), t = seconds since the pin was pulled
    const _rim = new THREE.Vector3();
    function setChute(out, infl, t) {
      if (!chute) return;
      chute.visible = !!out && (infl > 0.03 || t < 1.2);
      if (!chute.visible) return;
      const { canopy, lines } = chute.userData;
      const pay = clamp(t / 0.3, 0, 1);                         // lines pay out as the pilot chute pulls
      const L = 1.0 + 5.0 * pay;
      const s = 0.12 + 0.88 * infl;
      canopy.scale.set(s, s, 0.6 + 0.4 * infl + (1 - infl) * 1.8 * pay);
      const sway = Math.sin(t * 3.1) * 0.05 * infl, bob = Math.sin(t * 2.3 + 1) * 0.04 * infl;
      canopy.position.set(Math.sin(t * 1.7) * 0.25 * infl, 0.35 * infl + bob, L);
      canopy.rotation.set(bob, sway, 0);
      const pa = lines.geometry.attributes.position;
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        _rim.set(Math.cos(a) * 1.52, Math.sin(a) * 1.52, 0).multiply(canopy.scale).applyEuler(canopy.rotation).add(canopy.position);
        pa.setXYZ(k * 2, 0, 0, 0); pa.setXYZ(k * 2 + 1, _rim.x, _rim.y, _rim.z);
      }
      pa.needsUpdate = true;
    }
    setTransmission('auto');

    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });

    return {
      root: rootG, model, exterior: ext, interior: intr, wheels, steerWheel, eye: eye.clone().add(new THREE.Vector3(0, -cgH, zOff)),
      exhaustTips: tips, materials: M, headlights, tailLens, mirrors,
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, variant: opts.variant || 'hellcat',
    };
  }

  root.HCCarModel = { build, PAINTS, bodySection, ghSection };
})(typeof self !== 'undefined' ? self : this);
