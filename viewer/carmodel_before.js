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

  const Z_FRONT = -2.47, Z_REAR = 2.60, AXLE = 1.473, AXLE_Y = 0.357, ARCH_R = 0.44;

  // ------------------------------------------------------------------ body profile
  const YT = [[-2.47, 0.80], [-2.445, 0.855], [-2.38, 0.883], [-2.1, 0.903], [-1.6, 0.932], [-1.1, 0.962], [-0.64, 0.995],
    [0.0, 1.008], [0.8, 1.018], [1.62, 1.028], [2.0, 1.034], [2.40, 1.030], [2.50, 1.036], [2.555, 1.062], [2.585, 1.045], [2.60, 1.01]];
  const YB = [[-2.47, 0.22], [-2.43, 0.155], [-2.1, 0.15], [-1.98, 0.19], [1.95, 0.19], [2.10, 0.22], [2.48, 0.25], [2.60, 0.33]];
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
    const P = [];
    P.push([0, yB], [W * 0.55, yB], [W - 0.07, yB + 0.004], [W - 0.018, yB + 0.03]);
    const ya = Math.min(yB + 0.075, ySh - 0.04);
    P.push([W, ya]);
    for (let k = 1; k <= 3; k++) { const t = k / 4; P.push([W + 0.013 * Math.sin(Math.PI * t), ya + (ySh - 0.02 - ya) * t]); }
    P.push([W + 0.005, ySh]);
    P.push([W - 0.014, ySh + 0.028]);
    const ys = ySh + 0.028, xs = W - 0.014;
    P.push([lerp(xs, Wt, 0.45), lerp(ys, yT, 0.62)]);
    P.push([lerp(xs, Wt, 0.8), lerp(ys, yT, 0.9)]);
    P.push([Wt, yT]);
    P.push([Wt * 0.62, yT + crown * 0.72]);
    P.push([Wt * 0.28, yT + crown * 0.96]);
    P.push([0, yT + crown]);
    for (let i = 2; i < P.length; i++) if (P[i][1] < P[i - 1][1]) P[i][1] = P[i - 1][1];
    return P;
  }

  // ------------------------------------------------------------------ greenhouse profile
  const GT = [[-0.64, 0.995], [-0.40, 1.105], [-0.10, 1.272], [0.08, 1.378], [0.18, 1.420], [0.35, 1.437], [0.85, 1.436],
    [1.0, 1.424], [1.12, 1.372], [1.35, 1.228], [1.55, 1.098], [1.66, 1.028]];
  function ghSection(z) {
    const yBelt = bodyYT(z) - 0.004, yTop = table(GT, z);
    const h = Math.max(0, yTop - yBelt), k = clamp(h / 0.43, 0, 1);
    const xB = 0.80 - 0.035 * sstep(-0.2, -0.64, z) - 0.03 * sstep(1.3, 1.66, z);
    const xT = 0.60 - 0.02 * sstep(0.9, 1.3, z) - 0.03 * sstep(0.1, -0.3, z);
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
    'Sinamon Stick': 0x7a3317, 'Frostbite': 0x2753a6, 'Triple Nickel': 0x8b8e92, 'Hellraisin': 0x2c1227, 'Smoke Show': 0x474c52,
  };

  // ------------------------------------------------------------------ builder
  function build(THREE, opts) {
    opts = opts || {};
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
        if (cz > -0.6 && cz < 1.62 && cy > bodyYT(cz) - 0.03 && Math.abs(cx) < ghSection(cz).xB - 0.012) continue;
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
    const WS = [-0.615, 0.128], RW = [1.065, 1.62], SG = [-0.52, 1.49];
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
      for (let z = -0.64; z < 1.66; z += 0.02) zs.push(z);
      zs.push(1.66, ...keyZ);
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
    const bulgeZ0 = -2.24, bulgeZ1 = -0.74;
    const bulgeL = loft(THREE, stationList(bulgeZ0, bulgeZ1, [[bulgeZ0, 0.2, 0.015]]), (z) => {
      const t = (z - bulgeZ0) / (bulgeZ1 - bulgeZ0);
      const hM = 0.058 * (1 - 0.8 * t * t) + 0.004;
      const w = 0.33 - 0.05 * t, base = hoodY(z) - 0.02;
      return [[0, base], [w, base], [w - 0.012, base + hM * 0.55], [w - 0.05, base + hM * 0.92], [w - 0.11, base + hM], [w * 0.4, base + hM * 1.02], [0, base + hM * 1.03]];
    });
    add(ext, bulgeL.geo, M.paint);
    add(ext, capGeo(THREE, bulgeL.rings[0].ring, bulgeZ0, -1), M.paint);
    const hy0 = hoodY(bulgeZ0) - 0.02;
    for (const sx of [-1, 1]) {
      add(ext, new THREE.PlaneGeometry(0.2, 0.042), M.grille, sx * 0.145, hy0 + 0.032, bulgeZ0 - 0.003, 0, Math.PI, 0, false);
      // heat extractors near the front outer corners of the hood
      const hz = -1.95;
      add(ext, new THREE.BoxGeometry(0.2, 0.012, 0.26), M.gloss, sx * 0.55, hoodY(hz) - 0.008, hz, 0.075, 0, 0, false);
      for (let k = 0; k < 5; k++) add(ext, new THREE.BoxGeometry(0.18, 0.006, 0.012), M.grille, sx * 0.55, hoodY(hz) - 0.0 + (k - 2) * 0.0 + 0.001, hz - 0.1 + k * 0.05, 0.075, 0, 0, false);
    }

    // ---------------- front fascia
    const front = new THREE.Group(); front.position.z = Z_FRONT - 0.004; ext.add(front);
    const honey = canvasTex(THREE, 256, 128, (g, w, h) => {
      g.fillStyle = '#060606'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2a2a2c'; g.lineWidth = 2;
      for (let y = 0; y < h + 10; y += 10) for (let x = 0; x < w + 12; x += 12) {
        const ox = (y / 10) % 2 ? 6 : 0;
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + ox + 4.5 * Math.cos(a), y + 4.5 * Math.sin(a)); } g.closePath(); g.stroke();
      }
    });
    honey.wrapS = honey.wrapT = THREE.RepeatWrapping; honey.repeat.set(4, 1);
    const grilleMat = new THREE.MeshStandardMaterial({ map: honey, roughness: 0.6, metalness: 0.2 });
    add(front, new THREE.BoxGeometry(1.6, 0.27, 0.04), M.gloss, 0, 0.69, 0.0);
    add(front, new THREE.PlaneGeometry(1.54, 0.21), grilleMat, 0, 0.69, -0.022, 0, Math.PI, 0);
    // quad headlamps with halo rings (driver-side inner = Air Catcher intake)
    const lampY = 0.695;
    for (const lx of [-0.685, -0.42, 0.42, 0.685]) {
      const air = lx === -0.42;
      add(front, new THREE.CylinderGeometry(0.093, 0.098, 0.05, 32), M.gloss, lx, lampY, -0.03, Math.PI / 2, 0, 0);
      if (air) {
        add(front, new THREE.TorusGeometry(0.078, 0.009, 8, 32), M.darkChrome, lx, lampY, -0.058, 0, 0, 0);
        add(front, new THREE.CircleGeometry(0.07, 24), M.grille, lx, lampY, -0.052, 0, Math.PI, 0, false);
        for (let k = -2; k <= 2; k++) add(front, new THREE.BoxGeometry(0.13, 0.006, 0.01), M.darkChrome, lx, lampY + k * 0.024, -0.056, 0, 0, 0, false);
      } else {
        const refl = add(front, new THREE.CircleGeometry(0.074, 24), M.headlamp, lx, lampY, -0.052, 0, Math.PI, 0, false);
        refl.userData.headlamp = true;
        add(front, new THREE.TorusGeometry(0.077, 0.0075, 8, 40), M.halo, lx, lampY, -0.058, 0, 0, 0, false);
        add(front, new THREE.CylinderGeometry(0.028, 0.03, 0.02, 16), M.chrome, lx, lampY, -0.062, Math.PI / 2, 0, 0, false);
        add(front, new THREE.CircleGeometry(0.09, 24), M.lens, lx, lampY, -0.066, 0, Math.PI, 0, false);
      }
    }
    // SRT badge
    const srtTex = canvasTex(THREE, 128, 48, (g, w, h) => {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8d8d8'; g.font = 'bold italic 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SRT', w / 2 - 8, h / 2 + 2);
      g.fillStyle = '#c00'; g.fillRect(w - 26, 10, 14, 28);
    });
    add(front, new THREE.PlaneGeometry(0.11, 0.04), new THREE.MeshStandardMaterial({ map: srtTex, roughness: 0.3, metalness: 0.6 }), -0.2, 0.61, -0.03, 0, Math.PI, 0, false);
    // lower fascia intake, splitter, fog/brake ducts
    add(front, new THREE.BoxGeometry(1.36, 0.19, 0.04), M.gloss, 0, 0.36, 0.0);
    add(front, new THREE.PlaneGeometry(1.28, 0.14), grilleMat, 0, 0.36, -0.022, 0, Math.PI, 0);
    for (const sx of [-1, 1]) {
      add(front, new THREE.BoxGeometry(0.16, 0.1, 0.04), M.gloss, sx * 0.72, 0.33, 0.02);
      add(ext, new THREE.BoxGeometry(0.03, 0.05, 0.12), M.amber, sx * 0.905, 0.62, -2.28, 0, sx * 0.3, 0, false);
    }
    const brow = add(front, new THREE.BoxGeometry(1.6, 0.045, 0.1), M.paintPlain, 0, 0.848, -0.03);
    brow.rotation.x = -0.12;
    add(front, new THREE.BoxGeometry(1.66, 0.022, 0.1), M.gloss, 0, 0.158, -0.035);
    for (const sx of [-1, 1]) { const w = add(front, new THREE.BoxGeometry(0.02, 0.022, 0.34), M.gloss, sx * 0.84, 0.158, 0.13); w.rotation.y = -sx * 0.35; }
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
    // badge
    const badge = canvasTex(THREE, 256, 40, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = '#cfcfcf'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('C H A L L E N G E R', w / 2, h / 2 + 1);
    });
    add(rear, new THREE.PlaneGeometry(0.34, 0.053), new THREE.MeshStandardMaterial({ map: badge, transparent: true, metalness: 0.7, roughness: 0.3 }), 0, 0.775, 0.012, 0, 0, 0, false);
    // plate recess + diffuser + exhaust tips
    add(rear, new THREE.BoxGeometry(0.34, 0.17, 0.02), M.black, 0, 0.58, 0.005);
    add(rear, new THREE.BoxGeometry(1.5, 0.16, 0.05), M.gloss, 0, 0.3, -0.005);
    const tips = [];
    for (const sx of [-1, 1]) {
      const tip = add(rear, new THREE.CylinderGeometry(0.058, 0.058, 0.12, 24, 1, true), M.darkChrome, sx * 0.62, 0.285, -0.02, Math.PI / 2, 0, 0);
      tip.material = M.darkChrome;
      add(rear, new THREE.CircleGeometry(0.052, 20), M.black, sx * 0.62, 0.285, 0.0, 0, 0, 0, false);
      add(rear, new THREE.TorusGeometry(0.058, 0.006, 6, 24), M.chrome, sx * 0.62, 0.285, 0.04, 0, 0, 0, false);
      tips.push(new THREE.Vector3(sx * 0.62, 0.285 - cgH, Z_REAR + 0.06 + zOff));
    }

    // ---------------- side details
    const mirrors = [];
    for (const sx of [-1, 1]) {
      // side mirror: body-colour rounded housing on a black sail at the door's front corner, live glass facing back
      const mir = new THREE.Group(); mir.position.set(sx * 0.95, 1.035, -0.47); ext.add(mir);
      add(mir, new THREE.BoxGeometry(0.035, 0.1, 0.15), M.gloss, sx * 0.012, 0.0, 0.02);          // sail on the door
      add(mir, new THREE.BoxGeometry(0.09, 0.032, 0.05), M.gloss, sx * 0.07, 0.015, 0.03);        // arm
      const hW = 0.23, hH = 0.13, hr = 0.045;
      const hs = new THREE.Shape();
      hs.moveTo(-hW / 2 + hr, -hH / 2); hs.lineTo(hW / 2 - hr, -hH / 2); hs.quadraticCurveTo(hW / 2, -hH / 2, hW / 2, -hH / 2 + hr);
      hs.lineTo(hW / 2, hH / 2 - hr); hs.quadraticCurveTo(hW / 2, hH / 2, hW / 2 - hr, hH / 2); hs.lineTo(-hW / 2 + hr, hH / 2);
      hs.quadraticCurveTo(-hW / 2, hH / 2, -hW / 2, hH / 2 - hr); hs.lineTo(-hW / 2, -hH / 2 + hr); hs.quadraticCurveTo(-hW / 2, -hH / 2, -hW / 2 + hr, -hH / 2);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.012, bevelSegments: 4, curveSegments: 6 });
      hg.translate(0, 0, -0.06);   // back face (glass side) at z = 0 (+bevel), rounded nose towards the front
      const hx = sx * (0.1 + hW / 2);
      add(mir, hg, M.paintPlain, hx, 0.03, 0.02);
      add(mir, new THREE.PlaneGeometry(hW - 0.012, hH - 0.012), M.gloss, hx, 0.03, 0.02 + 0.036, 0, 0, 0, false);  // black frame
      const smRT = new THREE.WebGLRenderTarget(320, 180);
      smRT.texture.repeat.x = -1; smRT.texture.offset.x = 1;
      const smMesh = add(mir, new THREE.PlaneGeometry(hW - 0.03, hH - 0.03), new THREE.MeshBasicMaterial({ map: smRT.texture }), hx, 0.03, 0.02 + 0.037, 0, 0, 0, false);
      const smCam = new THREE.PerspectiveCamera(20, (hW - 0.03) / (hH - 0.03), 0.2, 700);
      smCam.position.set(sx * 0.95 + hx, 1.065, -0.4); smCam.rotation.set(-0.03, Math.PI + sx * 0.22, 0);
      model.add(smCam);
      mirrors.push({ mesh: smMesh, cam: smCam, rt: smRT });
      // door handle
      add(ext, new THREE.BoxGeometry(0.012, 0.028, 0.16), M.black, sx * 0.968, 0.905, 0.55, 0, 0, 0, false);
      // rocker sill
      add(ext, new THREE.BoxGeometry(0.03, 0.07, 2.02), M.gloss, sx * 0.962, 0.225, 0.0, 0, 0, 0, false);
      // SUPERCHARGED fender badge
      const scTex = canvasTex(THREE, 256, 40, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#d0d0d0'; g.font = 'bold italic 24px Arial'; g.textBaseline = 'middle'; g.fillText('SUPERCHARGED', 6, h / 2 + 1);
      });
      add(ext, new THREE.PlaneGeometry(0.2, 0.031), new THREE.MeshStandardMaterial({ map: scTex, transparent: true, metalness: 0.8, roughness: 0.25 }),
        sx * 0.972, 0.63, -0.9, 0, sx * Math.PI / 2, 0, false);
      // door gap lines
      for (const dz of [-0.70, 1.08]) add(ext, new THREE.BoxGeometry(0.004, 0.62, 0.005), M.black, sx * 0.973, 0.62, dz, 0, 0, 0, false);
      // fuel door (right rear quarter)
      if (sx > 0) add(ext, new THREE.CylinderGeometry(0.075, 0.075, 0.004, 24), M.paintPlain, 0.976, 0.86, 1.5, 0, 0, Math.PI / 2, false);
    }
    // underbody (hides the inside from low angles)
    add(ext, new THREE.BoxGeometry(1.7, 0.02, 4.7), M.black, 0, 0.2, 0.05, 0, 0, 0, false);

    // ---------------- wheels
    const tireTex = (brand) => canvasTex(THREE, 1024, 128, (g, w, h) => {
      g.fillStyle = '#161616'; g.fillRect(0, 0, w, h);
      // tread band (middle of v)
      g.fillStyle = '#0f0f0f'; g.fillRect(0, h * 0.3, w, h * 0.4);
      g.fillStyle = '#090909';
      if (brand === 'drag') { for (let x = 0; x < w; x += 64) g.fillRect(x, h * 0.3, 3, h * 0.4); }
      else { for (const f of [0.38, 0.47, 0.53, 0.62]) g.fillRect(0, h * f, w, 3); for (let x = 0; x < w; x += 16) g.fillRect(x, h * 0.3, 2, h * 0.08); }
      g.fillStyle = '#5a5a5a'; g.font = 'bold 22px Arial'; g.textBaseline = 'middle';
      const txt = brand === 'drag' ? 'NITTO   NT555R II   315/35R20   DRAG RADIAL' : 'PIRELLI   P ZERO   275/40ZR20   SRT';
      for (const vy of [0.12, 0.88]) for (let k = 0; k < 2; k++) g.fillText(txt, k * w / 2 + 40, h * vy);
    });
    const tireTexStreet = tireTex('street'), tireTexDrag = tireTex('drag');
    function tireGeo(width) {
      const hw = width / 2, R = 0.364, rr = 0.254;
      const prof = [[rr, -hw + 0.012], [rr + 0.02, -hw - 0.002], [0.31, -hw - 0.006], [0.345, -hw + 0.004], [R - 0.004, -hw + 0.022], [R, -hw + 0.05],
        [R, hw - 0.05], [R - 0.004, hw - 0.022], [0.345, hw - 0.004], [0.31, hw + 0.006], [rr + 0.02, hw + 0.002], [rr, hw - 0.012]];
      const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 56);
      g.rotateZ(Math.PI / 2);
      return g;
    }
    const tireGeos = { street: tireGeo(0.275), drag: tireGeo(0.315) };
    const tireMats = {
      street: new THREE.MeshStandardMaterial({ map: tireTexStreet, roughness: 0.9 }),
      drag: new THREE.MeshStandardMaterial({ map: tireTexDrag, roughness: 0.88 }),
    };
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
      add(spin, barrelGeo, M.rim, -0.01, 0, 0);
      add(spin, lipGeo, M.rimLip, 0.115, 0, 0, 0, 0, 0, false);
      add(spin, spokesGeo, M.rim, 0, 0, 0);
      add(spin, hubGeo, M.rim, 0.085, 0, 0);
      add(spin, capGeoW, capMat, 0.112, 0, 0, 0, 0, 0, false);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; add(spin, lugGeo, M.chrome, 0.11, Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0, 0, 0, false); }
      const rr = frontW ? 0.2 : 0.175;
      const rotorG = new THREE.CylinderGeometry(rr, rr, 0.032, 40); rotorG.rotateZ(Math.PI / 2);
      add(spin, rotorG, rotorMat, -0.03, 0, 0);
      const hatG = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24); hatG.rotateZ(Math.PI / 2);
      add(spin, hatG, M.hat, -0.005, 0, 0);
      // caliper (fixed to knuckle, behind the axle)
      // torus arc in the wheel plane; arc sweeps from local forward towards up, centred up-and-behind the axle
      const arc = frontW ? 1.05 : 0.8;
      const calHolder = new THREE.Group(); flip.add(calHolder);
      calHolder.rotation.x = (left ? Math.PI / 4 : 3 * Math.PI / 4) - arc / 2;
      const calM = add(calHolder, new THREE.TorusGeometry(rr - 0.028, 0.034, 8, 12, arc), M.caliper, -0.03, 0, 0, 0, Math.PI / 2, 0);
      calM.scale.set(1, 1, 1.35);
      wheels.push({ corner, flip, spin, tire, left, front: frontW, side });
    }
    function setTires(front, rearT) {
      for (const w of wheels) {
        const t = w.front ? front : rearT;
        w.tire.geometry = tireGeos[t] || tireGeos.street;
        w.tire.material = tireMats[t] || tireMats.street;
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
    add(bin, new THREE.BoxGeometry(0.54, 0.21, 0.08), M.dash, 0, 0.0, -0.045, 0, 0, 0, false);
    const visorG = new THREE.CylinderGeometry(0.12, 0.12, 0.56, 28, 1, true, 0, Math.PI); visorG.rotateZ(Math.PI / 2);
    const visor = add(bin, visorG, new THREE.MeshStandardMaterial({ color: 0x26262a, roughness: 0.8, side: THREE.DoubleSide }), 0, 0.09, 0.0, 0, 0, 0, false);
    visor.scale.set(1, 0.55, 0.8);
    for (const sx2 of [-1, 1]) add(bin, new THREE.BoxGeometry(0.02, 0.17, 0.12), M.dash, sx2 * 0.27, 0.02, 0.02, 0, 0, 0, false);
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 1024; clusterCanvas.height = 400;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace; clusterTex.anisotropy = 8;
    add(bin, new THREE.PlaneGeometry(0.46, 0.18), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0, 0.0, 0, 0, 0, false);
    for (const dx of [-0.1403, 0.1403]) add(bin, new THREE.TorusGeometry(0.084, 0.0045, 8, 48), M.chrome, dx, -0.002, 0.004, 0, 0, 0, false);
    // centre stack angled to the driver + 8.4" Uconnect screen (live canvas)
    const stack = new THREE.Group(); stack.position.set(0.03, 0.8, -0.262); stack.rotation.set(-0.3, -0.16, 0); intr.add(stack);
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
    for (const vx of [-0.72, 0.72]) {
      add(intr, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24), M.grille, vx, 0.905, -0.258, Math.PI / 2 - 0.2, 0, 0, false);
      add(intr, new THREE.TorusGeometry(0.046, 0.004, 6, 28), M.alu, vx, 0.905, -0.24, -0.2, 0, 0, false);
    }
    // centre console + shifter
    add(intr, new THREE.BoxGeometry(0.24, 0.28, 0.95), M.trim, 0, 0.47, 0.1, 0, 0, 0, false);
    add(intr, new THREE.BoxGeometry(0.22, 0.05, 0.36), M.leather, 0, 0.64, 0.48, 0, 0, 0, false);
    const shifterAuto = new THREE.Group(); shifterAuto.position.set(0.0, 0.62, -0.02); intr.add(shifterAuto);
    add(shifterAuto, new THREE.BoxGeometry(0.05, 0.1, 0.06), M.gloss, 0, 0.04, 0, -0.25, 0, 0, false);
    add(shifterAuto, new THREE.BoxGeometry(0.055, 0.035, 0.13), M.alu, 0, 0.1, 0.03, -0.15, 0, 0, false);
    add(shifterAuto, new THREE.BoxGeometry(0.02, 0.07, 0.02), M.alu, 0.0, 0.085, -0.03, -0.2, 0, 0, false);
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
    seat(-0.37); seat(0.37);
    add(intr, new THREE.BoxGeometry(1.3, 0.12, 0.45), M.leather, 0, 0.45, 1.38, 0, 0, 0, false);
    add(intr, new THREE.BoxGeometry(1.3, 0.45, 0.12), M.leather, 0, 0.7, 1.58, -0.25, 0, 0, false);
    add(intr, new THREE.BoxGeometry(1.4, 0.02, 0.3), M.trim, 0, 1.04, 1.72, 0, 0, 0, false);
    // door cards
    for (const sx of [-1, 1]) {
      add(intr, new THREE.BoxGeometry(0.04, 0.68, 1.75), M.trim, sx * 0.83, 0.66, 0.28, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(0.07, 0.05, 0.6), M.leather, sx * 0.79, 0.74, 0.35, 0, 0, 0, false);
      add(intr, new THREE.CylinderGeometry(0.07, 0.07, 0.01, 24), M.grille, sx * 0.81, 0.48, -0.05, 0, 0, Math.PI / 2, false);
      add(intr, new THREE.BoxGeometry(0.02, 0.02, 0.12), M.alu, sx * 0.8, 0.86, 0.02, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(0.05, 0.03, 1.7), M.dash, sx * 0.8, 1.0, 0.3, 0, 0, 0, false);
      add(intr, new THREE.BoxGeometry(0.34, 0.012, 0.16), M.alcantara, sx * 0.34, 1.385, 0.2, 0.25, 0, 0, false);   // sun visor
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
    function drawCluster(t) {
      const g = cg, w = 1024, h = 400;
      g.fillStyle = '#020203'; g.fillRect(0, 0, w, h);
      dial(g, 200, 205, 190, t.rpm / 1000, 7, 1, 0.5, 'RPM x1000', 6.2, '', 1);
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
      g.fillStyle = '#e33'; g.fillRect(420, 340, 184 * clamp(t.boost / 11.6, 0, 1), 10);
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
    setTransmission('auto');

    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });

    return {
      root: rootG, model, exterior: ext, interior: intr, wheels, steerWheel, eye: eye.clone().add(new THREE.Vector3(0, -cgH, zOff)),
      exhaustTips: tips, materials: M, headlights, tailLens, mirrors,
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen,
    };
  }

  root.HCCarModelBefore = { build, PAINTS, bodySection, ghSection };
})(typeof self !== 'undefined' ? self : this);
