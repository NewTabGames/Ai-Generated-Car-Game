/* Hellcat Drive — procedural models of the Car Crushers 2 cars (the Roblox game's joke and special vehicles, built
   as they'd have to be for real):
   Couch Car      a brown leather three-seat sofa on hidden 13 in wheels, its turbo triple's three pipes out of the right
                  arm, a white footplate and a steering stick in front of the cushions
   Egg Rod        the Mork & Mindy egg car as a hot rod: a white fibreglass egg with a wraparound canopy and sky-blue
                  swooshes, a chromed small-block on the open frame behind it, copper wheels, a big wing
   Banana Car     a fibreglass banana on a pickup's frame: five seats sunk in a row, a little windscreen, the stem at the
                  back, a tube bumper with round lamps, black fenders over the truck wheels
   Blue Bird      Campbell's 1935 streamliner: a long blue body, the nose intake, white disc wheels outside it with
                  fairings flowing into the sides, the cockpit far back behind a tiny screen, a tail fin
   Nissan GTR     an R35 in a Liberty Walk widebody: bolt-on overfenders, a black hood and roof, a front splitter, deep-dish
                  wheels, the four round tail lamps and a GT wing on tall struts
   Mini Dookie    a tall one-seat city pod: glass front, glass roof, an orange seat, 5-spoke wheels
   Porta Potty    a blue portable toilet with a white roof on a kart frame, the door swung open, the driver on the throne
   Turbo Scooter  a red four-wheel mobility scooter: the basket, the tiller with its mirrors, the high-back seat
   Razors Edge    a long faceted wedge of smoked glass edged in neon (the paint colour), a graveyard on its flanks, a golf
                  cart's frame and seats inside
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const CAR = opts.car || 'couch';
    const cgH = opts.cgHeight || 0.5, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 1, cgToRear = opts.cgToRear || 1;
    const L = cgToFront + cgToRear, zF = -L / 2, zR = L / 2;
    const RF = opts.wheelRadiusF || opts.wheelRadius || 0.3, RR = opts.wheelRadiusR || opts.wheelRadius || 0.3;
    const trackF = opts.trackF || 1.5, trackR = opts.trackR || 1.5;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || {};
    const rootG = new THREE.Group(); rootG.name = CAR;
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
    const pipe = (parent, pts, r, mat, seg) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 10, r, seg || 12, false), mat, 0, 0, 0);
    const cylX = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateZ(Math.PI / 2); return g; };
    const cylZ = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateX(Math.PI / 2); return g; };
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
    // a (z, y) side profile extruded across the car, centred on x = 0, w wide
    function profile(pts, w, bevel) {
      const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      const b = bevel || 0.02;
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, w - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 8 });
      g.rotateY(Math.PI / 2); g.scale(1, 1, -1);
      const p = g.attributes.position;
      if (!g.index) for (let k = 0; k < p.count; k += 3) for (const a of [p, g.attributes.uv]) { const sz = a.itemSize; for (let c = 0; c < sz; c++) { const t = a.array[(k + 1) * sz + c]; a.array[(k + 1) * sz + c] = a.array[(k + 2) * sz + c]; a.array[(k + 2) * sz + c] = t; } }
      g.translate(-(w / 2 - b), 0, 0); g.computeVertexNormals();
      return g;
    }
    // Loft: a body from cross-sections along z. Each section is a superellipse (exponent n: 2 round, 4+ boxy) from yb
    // to yt, half-width w at mid height narrowing (or widening) to w*tw at the top and w*bw at the bottom, centred on
    // xc. mat(x, y, z) picks each triangle's material slot (windows, a black roof, stripes ...) -> geometry groups.
    function loft(secs, o) {
      o = o || {};
      const N = o.seg || 40, pos = [], idx = [];
      for (const s of secs) {
        const n = s.n || 2, e = 2 / n, yc = (s.yb + s.yt) / 2, hh = (s.yt - s.yb) / 2;
        for (let k = 0; k < N; k++) {
          const a = -Math.PI / 2 + k / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
          const sx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
          const wf = sy > 0 ? 1 + ((s.tw === undefined ? 1 : s.tw) - 1) * sy : 1 + ((s.bw === undefined ? 1 : s.bw) - 1) * -sy;
          pos.push((s.xc || 0) + s.w * wf * sx, yc + hh * sy, s.z);
        }
      }
      const R = secs.length;
      // end caps: a centre point each end
      const c0 = pos.length / 3; pos.push(secs[0].xc || 0, (secs[0].yb + secs[0].yt) / 2, secs[0].z);
      const c1 = pos.length / 3; pos.push(secs[R - 1].xc || 0, (secs[R - 1].yb + secs[R - 1].yt) / 2, secs[R - 1].z);
      const tris = [];
      for (let r = 0; r < R - 1; r++) for (let k = 0; k < N; k++) {
        const a = r * N + k, b = r * N + (k + 1) % N, c = (r + 1) * N + k, d = (r + 1) * N + (k + 1) % N;
        tris.push([a, c, b, a, d, k, r], [b, c, d, a, d, k, r]);
      }
      if (o.caps !== false) for (let k = 0; k < N; k++) { tris.push([c0, k, (k + 1) % N]); tris.push([c1, (R - 1) * N + (k + 1) % N, (R - 1) * N + k]); }
      // (the ring runs anticlockwise seen from -z; flip the winding so faces point outwards)
      const buckets = [];
      for (const t of tris) {
        const q = t.length > 3, cx = q ? (pos[t[3] * 3] + pos[t[4] * 3]) / 2 : (pos[t[0] * 3] + pos[t[1] * 3] + pos[t[2] * 3]) / 3,
          cy = q ? (pos[t[3] * 3 + 1] + pos[t[4] * 3 + 1]) / 2 : (pos[t[0] * 3 + 1] + pos[t[1] * 3 + 1] + pos[t[2] * 3 + 1]) / 3,
          cz = q ? (pos[t[3] * 3 + 2] + pos[t[4] * 3 + 2]) / 2 : (pos[t[0] * 3 + 2] + pos[t[1] * 3 + 2] + pos[t[2] * 3 + 2]) / 3;
        const m = o.mat ? o.mat(cx, cy, cz, q ? t[5] : -1, q ? t[6] : -1) : 0;
        (buckets[m] || (buckets[m] = [])).push(t[0], t[2], t[1]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      let start = 0;
      buckets.forEach((b, m) => { if (!b) return; for (const i of b) idx.push(i); g.addGroup(start, b.length, m); start += b.length; });
      g.setIndex(idx);
      g.computeVertexNormals();
      if (o.flat) { const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng; }
      return g;
    }
    // A car body the Challenger's way: a cross-section at each station, built from explicit points round the right half
    // (bottom centre -> sill -> the side -> shoulder -> belt -> greenhouse -> roof centre) and mirrored. The bottom
    // rises over the wheels (the arches cut themselves), and every band of points keeps its meaning along the car, so
    // the windows, a black roof or hood are whole bands between stations - clean edges, no jaggies.
    // o: stations [z], and functions of z: W (half width), yB (bottom, arches included), ySh (shoulder: top of the side),
    // Wb / yBelt (the belt line where the glass starts), Wt (greenhouse half width at the roof), yT (roof / hood / deck
    // height), bulge (outward curve of the side); mat(band, z) -> material slot (band 0-2 underside, 3-8 side,
    // 9-10 shoulder, 11-14 greenhouse, 15-16 roof)
    function carBody(o) {
      const secs = o.stations.map((z) => {
        const W = o.W(z), yB = o.yB(z), ySh = Math.max(o.ySh(z), yB + 0.08), yBelt = Math.max(o.yBelt(z), ySh + 0.01), yT = Math.max(o.yT(z), yBelt + 0.01);
        const Wb = o.Wb(z), Wt = o.Wt(z), bl = o.bulge ? o.bulge(z) : 0.015, P = [];
        P.push([0, yB], [W * 0.5, yB], [W - 0.05, yB + 0.002], [W - 0.012, yB + 0.022]);
        for (let k = 0; k <= 5; k++) { const t = k / 5, y = yB + 0.05 + (ySh - yB - 0.05) * t; P.push([W - 0.01 * (1 - t) + bl * Math.sin(Math.PI * t) * 0.6, y]); }
        P.push([W - 0.02, ySh + (yBelt - ySh) * 0.55], [Wb, yBelt]);
        for (let k = 1; k <= 4; k++) { const t = k / 4, y = yBelt + (yT - 0.02 - yBelt) * (1 - Math.pow(1 - t, 1.6)); P.push([Wb + (Wt - Wb) * Math.pow(t, 0.9), y]); }
        P.push([Wt * 0.55, yT - 0.004], [0, yT]);
        return { z, P };
      });
      const pos = [], buckets = [], nP = secs[0].P.length;
      const vid = (r, i, side) => r * nP * 2 + (side > 0 ? i : nP + i);
      for (const s of secs) { for (const [x, y] of s.P) pos.push(x, y, s.z); for (const [x, y] of s.P) pos.push(-x, y, s.z); }
      for (let r = 0; r < secs.length - 1; r++) {
        const zm = (secs[r].z + secs[r + 1].z) / 2;
        for (let i = 0; i < nP - 1; i++) {
          const m = o.mat ? o.mat(i, zm) : 0, B = buckets[m] || (buckets[m] = []);
          for (const sd of [1, -1]) {
            const a = vid(r, i, sd), b = vid(r, i + 1, sd), c = vid(r + 1, i, sd), d = vid(r + 1, i + 1, sd);
            if (sd > 0) B.push(a, b, c, b, d, c); else B.push(a, c, b, b, c, d);
          }
        }
      }
      // end caps: a fan from the middle of each end section
      for (const [r, f] of [[0, -1], [secs.length - 1, 1]]) {
        const s = secs[r], ci = pos.length / 3; pos.push(0, (s.P[0][1] + s.P[nP - 1][1]) / 2, s.z);
        const B = buckets[o.capMat || 0] || (buckets[o.capMat || 0] = []);
        for (const sd of [1, -1]) for (let i = 0; i < nP - 1; i++) {
          const a = vid(r, i, sd), b = vid(r, i + 1, sd);
          if (f * sd > 0) B.push(ci, a, b); else B.push(ci, b, a);
        }
      }
      const g = new THREE.BufferGeometry(), idx = [];
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      let start = 0;
      buckets.forEach((b, m) => { if (!b) return; for (const i of b) idx.push(i); g.addGroup(start, b.length, m); start += b.length; });
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    // piecewise-smooth lookup (z, value) pairs
    const tbl = (T) => (x) => {
      if (x <= T[0][0]) return T[0][1];
      for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const a = T[i - 1], b = T[i], t = (x - a[0]) / (b[0] - a[0]), s = t * t * (3 - 2 * t) * 0.4 + t * 0.6; return a[1] + (b[1] - a[1]) * s; }
      return T[T.length - 1][1];
    };
    // stations: every d metres from z0 to z1, plus the given break points (window edges, arches)
    const stationsOf = (z0, z1, d, brk) => { const S = new Set(); for (let z = z0; z < z1 - 1e-6; z += d) S.add(+z.toFixed(4)); S.add(z1); for (const b of brk || []) S.add(b); return [...S].sort((a, b) => a - b); };
    // the bottom of the body with the wheel arches cut out of it
    const archY = (base, axles, R, rA) => (z) => { let y = base(z); for (const zc of axles) { const d = Math.abs(z - zc); if (d < rA) y = Math.max(y, R + Math.sqrt(rA * rA - d * d) * 0.96); } return y; };
    // a flat polygon mesh from a list of 3D points (a convex face), both sides
    function facesGeo(verts, faces) {
      const pos = [];
      for (const f of faces) for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) pos.push(verts[k][0], verts[k][1], verts[k][2]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
    }
    // an arc (a fender / flare) around a wheel at (z, y), radius r0..r1, from angle a0 to a1 (0 = forward-down... see use),
    // w wide across x, starting at x0
    function arcGeo(zc, yc, r0, r1, a0, a1, w) {
      const s = new THREE.Shape();
      s.absarc(zc, yc, r1, a0, a1, false); s.absarc(zc, yc, r0, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
      g.rotateY(Math.PI / 2); g.scale(1, 1, -1);
      const p = g.attributes.position; for (let k = 0; k < p.count; k += 3) for (const a of [p, g.attributes.uv]) { const sz = a.itemSize; for (let c = 0; c < sz; c++) { const t = a.array[(k + 1) * sz + c]; a.array[(k + 1) * sz + c] = a.array[(k + 2) * sz + c]; a.array[(k + 2) * sz + c] = t; } }
      g.computeVertexNormals(); return g;
    }

    // ---------------------------------------------------------------- materials
    const DEF_PAINT = { couch: 0x7b4a2b, eggrod: 0xe6e6e3, banana: 0xf2c21b, bluebird: 0x2f6fd0, gtr: 0x1f4fd1, mini: 0xc6cf2e, potty: 0x3d7cc9, scooter: 0xb01020, razor: 0xf2570f }[CAR];
    const paintHex = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : DEF_PAINT;
    const M = {};
    M.paint = CAR === 'couch' ? new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.62, metalness: 0.02 })
      : CAR === 'banana' ? new THREE.MeshPhysicalMaterial({ color: paintHex, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, flatShading: true })
        : CAR === 'potty' ? new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.55, metalness: 0 })
          : CAR === 'razor' ? new THREE.MeshStandardMaterial({ color: 0x000000, emissive: paintHex, emissiveIntensity: 2.4, toneMapped: false })
            : new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: CAR === 'gtr' ? 0.5 : 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, side: CAR === 'gtr' || CAR === 'mini' || CAR === 'eggrod' ? THREE.DoubleSide : THREE.FrontSide });
    M.black = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55, metalness: 0.15 });
    M.gloss = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.18, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.06, metalness: 1 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.85 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.5, metalness: 0.7 });
    M.white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.45, metalness: 0.02 });
    M.seat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.7 });
    M.grey = new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.6 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0x8a98a4, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2 });
    M.tint = new THREE.MeshPhysicalMaterial({ color: 0x1c2228, roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
    M.skin = new THREE.MeshStandardMaterial({ color: 0xc89478, roughness: 0.6 });
    M.hair = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.head = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a10, emissiveIntensity: 0.4, roughness: 0.3 });
    M.amber = new THREE.MeshStandardMaterial({ color: 0x8a4a08, emissive: 0xff8a10, emissiveIntensity: 0.25, roughness: 0.3 });
    M.mesh = new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = '#060607'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a3c40'; g.lineWidth = 2;
      for (let x = -h; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); }
    }), roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
    const SUITS = { couch: 0x2b4a7a, eggrod: 0xe8e8e8, banana: 0x2a6a3a, bluebird: 0xe8e2d0, gtr: 0x222326, mini: 0x5a3d8a, potty: 0x3b6e2e, scooter: 0x3a2a22, razor: 0x1a1a1c };
    M.suit = new THREE.MeshStandardMaterial({ color: SUITS[CAR] || 0x333333, roughness: 0.8 });
    M.pants = new THREE.MeshStandardMaterial({ color: CAR === 'bluebird' || CAR === 'eggrod' || CAR === 'gtr' ? SUITS[CAR] : 0x2a3446, roughness: 0.85 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: { couch: 0xf2c417, eggrod: 0x6fb6e8, bluebird: 0x5a3a22, scooter: 0x141416, potty: 0xf2f2f2, banana: 0xf2c21b }[CAR] || 0xf2f2f2, roughness: CAR === 'bluebird' ? 0.7 : 0.25, clearcoat: CAR === 'bluebird' ? 0 : 1 });

    const P = { tips: [], spots: [], hideCockpit: [], lampSlots: [] };
    const body = new THREE.Group(); model.add(body);

    // ---------------------------------------------------------------- a seated driver
    // o: hip (V3 on the seat), lean (+ = reclined), hands [left, right] (V3), knee {dx, y, z}, foot {dx, y, z},
    // helmet true / false (false: a bare head with hair), goggles (1935), torsoW
    function person(o) {
      const g = new THREE.Group(), lean = o.lean || 0, hip = o.hip, tw = o.torsoW || 0.36;
      add(g, rbox(tw, 0.5, 0.23, 0.1), M.suit, hip.x, hip.y + 0.25 * Math.cos(lean) + 0.04, hip.z + 0.25 * Math.sin(lean), lean, 0, 0);
      const shY = hip.y + 0.46 * Math.cos(lean) + 0.04, shZ = hip.z + 0.46 * Math.sin(lean);
      for (const sx of [-1, 1]) {
        const sh = V3(hip.x + sx * (tw / 2 - 0.03), shY - 0.02, shZ);
        const hand = o.hands ? o.hands[sx < 0 ? 0 : 1] : V3(hip.x + sx * 0.2, hip.y + 0.15, hip.z - 0.22);
        const el = V3((sh.x + hand.x) / 2 + sx * 0.07, Math.min(sh.y, hand.y) - 0.08, (sh.z + hand.z) / 2 + 0.06);
        tubeAB(g, sh, el, 0.045, M.suit); tubeAB(g, el, hand, 0.038, M.suit);
        add(g, new THREE.SphereGeometry(0.04, 10, 8), o.helmet === false ? M.skin : M.black, hand.x, hand.y, hand.z);
        const hp = V3(hip.x + sx * 0.1, hip.y + 0.06, hip.z);
        const kn = V3(hip.x + sx * o.knee.dx, o.knee.y, o.knee.z), ft = V3(hip.x + sx * o.foot.dx, o.foot.y, o.foot.z);
        tubeAB(g, hp, kn, 0.065, M.pants); tubeAB(g, kn, ft, 0.05, M.pants);
        add(g, rbox(0.1, 0.09, 0.22, 0.03), M.black, ft.x, ft.y - 0.02, ft.z - 0.05);
      }
      const hd = V3(hip.x, shY + 0.26, shZ - 0.03);
      tubeAB(g, V3(hip.x, shY, shZ), V3(hip.x, hd.y - 0.1, hd.z), 0.05, o.helmet === false ? M.skin : M.suit);
      if (o.helmet === false || o.goggles) {
        add(g, new THREE.SphereGeometry(0.105, 20, 14), M.skin, hd.x, hd.y - 0.01, hd.z);
        if (o.goggles) {
          // 1935: a leather helmet and goggles
          add(g, new THREE.SphereGeometry(0.113, 20, 12, 0, Math.PI * 2, 0, 1.75), M.helmet, hd.x, hd.y, hd.z + 0.005);
          for (const sx of [-1, 1]) add(g, cylZ(0.03, 0.03, 0.03, 14), M.chrome, hd.x + sx * 0.042, hd.y + 0.02, hd.z - 0.095);
          add(g, new THREE.TorusGeometry(0.108, 0.008, 6, 24), M.black, hd.x, hd.y + 0.02, hd.z, 0, 0, 0);
        } else add(g, new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, 1.3), M.hair, hd.x, hd.y + 0.005, hd.z + 0.012);
      } else {
        add(g, new THREE.SphereGeometry(0.14, 24, 16), M.helmet, hd.x, hd.y, hd.z);
        add(g, new THREE.SphereGeometry(0.143, 24, 12, -Math.PI / 2 - 0.85, 1.7, 1.25, 0.5), M.visor, hd.x, hd.y, hd.z, 0, 0, 0, false);
      }
      g.userData.eye = V3(hd.x, hd.y - 0.01, hd.z - 0.09);
      return g;
    }
    // steering wheel on its column: centre, tilt (rad back from vertical), radius, style
    function steering(c, tilt, r, style) {
      const colG = new THREE.Group(); colG.position.copy(c); colG.rotation.x = -tilt; model.add(colG);
      const sw = new THREE.Group(); colG.add(sw);
      add(sw, new THREE.TorusGeometry(r, style === 'thin' ? 0.009 : 0.016, 10, 32), style === 'wood' ? new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.5 }) : M.black, 0, 0, 0);
      for (let k = 0; k < 3; k++) { const s = add(sw, new THREE.BoxGeometry(0.016, r, 0.008), style === 'wood' ? M.chrome : M.alu, 0, 0, 0.004); s.rotation.z = k * 2.094 + Math.PI; s.geometry.translate(0, r / 2, 0); }
      add(sw, new THREE.CylinderGeometry(r * 0.25, r * 0.25, 0.03, 16), M.black, 0, 0, 0.01, Math.PI / 2, 0, 0);
      return { colG, sw };
    }
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 512; clusterCanvas.height = 256;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace;
    const M_cluster = new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false });
    // headlight spots (the monster truck's / Challenger's way): a pair at the front, off until the lights come on
    function spots(x, y, z, aim) {
      for (const sx of [-1, 1]) {
        const sl = new THREE.SpotLight(0xf2f4ff, 0, 90, 0.5, 0.45, 1.4);
        sl.position.copy(toRoot(V3(sx * x, y, z))); sl.target.position.copy(toRoot(V3(sx * x * 1.2, 0, z - (aim || 40))));
        rootG.add(sl); rootG.add(sl.target); sl.visible = false; P.spots.push(sl);
      }
    }

    // ================================================================ the cars
    let driver, SW, wheelStyle = {}, cluster = null, WF = 0.2, WR = 0.2;
    const B = {};

    // ---------------------------------------------------------------- Couch Car
    B.couch = () => {
      WF = 0.2; WR = 0.26;
      wheelStyle = { rim: 'steel', rimR: 0.165, tread: 'slick' };
      M.pipe = new THREE.MeshStandardMaterial({ color: 0xa87a52, roughness: 0.55 });   // the lighter piping on the leather
      M.plate = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.35, metalness: 0.3 });
      const z0 = -0.4, z1 = 0.4, D = z1 - z0;
      // base between the arms, two seat cushions, the backrest and two back cushions (tilted back a little)
      add(body, rbox(1.64, 0.22, D, 0.05), M.paint, 0, 0.4, 0);
      for (const sx of [-1, 1]) add(body, rbox(0.8, 0.14, 0.6, 0.065), M.paint, sx * 0.405, 0.575, -0.09);
      add(body, rbox(1.64, 0.56, 0.2, 0.06), M.paint, 0, 0.74, 0.3, 0.12, 0, 0);
      for (const sx of [-1, 1]) add(body, rbox(0.78, 0.4, 0.14, 0.07), M.paint, sx * 0.405, 0.8, 0.17, 0.12, 0, 0);
      // arms, rolled over at the top, with the piping down their fronts and along the top
      for (const sx of [-1, 1]) {
        add(body, rbox(0.22, 0.4, D, 0.06), M.paint, sx * 0.93, 0.49, 0);
        add(body, cylZ(0.115, 0.115, D - 0.02, 20), M.paint, sx * 0.93, 0.69, 0);
        add(body, cylZ(0.12, 0.12, 0.014, 20), M.pipe, sx * 0.93, 0.69, z0 + 0.004);
        add(body, new THREE.BoxGeometry(0.018, 0.4, 0.014), M.pipe, sx * 0.93, 0.47, z0 - 0.002);
      }
      add(body, new THREE.BoxGeometry(0.014, 0.4, 0.02), M.pipe, 0, 0.8, 0.105, 0.12, 0, 0);   // the seam between the back cushions
      // a fabric skirt round the base
      add(body, new THREE.BoxGeometry(2.08, 0.04, D + 0.02), M.pipe, 0, 0.3, 0);
      // the white footplate out front, the chassis under it all, the steering stick
      add(body, rbox(1.3, 0.025, 0.56, 0.01), M.plate, 0, 0.17, -0.67);
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.5, 0.18, -0.95), V3(sx * 0.5, 0.2, 0.95), 0.025, M.black);
      tubeAB(body, V3(-0.8, 0.254, zF), V3(0.8, 0.254, zF), 0.022, M.black); tubeAB(body, V3(-0.8, 0.254, zR), V3(0.8, 0.254, zR), 0.03, M.black);
      tubeAB(body, V3(-0.5, 0.2, 0.9), V3(0.5, 0.2, 0.9), 0.025, M.black);
      const stk = [V3(-0.4, 0.18, -0.82), V3(-0.4, 0.42, -0.8), V3(-0.4, 0.62, -0.72), V3(-0.4, 0.8, -0.6)];
      pipe(body, stk, 0.018, M.grey);
      SW = steering(V3(-0.4, 0.82, -0.58), 0.9, 0.13, 'thin');
      cluster = { parent: body, pos: V3(-0.4, 0.83, -0.66), rot: -0.9, w: 0.1, h: 0.05 };
      // the turbo triple's three pipes out of the right arm, curling back
      for (let k = 0; k < 3; k++) {
        const y = 0.42 + k * 0.075;
        const pts = [V3(0.9, y, -0.26), V3(1.06, y, -0.3), V3(1.15, y - 0.02, -0.24), V3(1.18, y - 0.035, -0.1)];
        pipe(body, pts, 0.028, M.steel); add(body, cylZ(0.03, 0.03, 0.04, 14), M.steel, 1.18, y - 0.035, -0.09);
        P.tips.push(toRoot(V3(1.18, y - 0.035, -0.05)));
      }
      driver = person({ hip: V3(-0.4, 0.66, 0.05), lean: 0.22, hands: [V3(-0.49, 0.84, -0.55), V3(-0.31, 0.84, -0.55)],
        knee: { dx: 0.12, y: 0.72, z: -0.32 }, foot: { dx: 0.16, y: 0.2, z: -0.72 } });
    };

    // ---------------------------------------------------------------- Egg Rod
    B.eggrod = () => {
      WF = 0.215; WR = 0.31;
      wheelStyle = { rim: 'copper', rimR: 0.19, tread: 'road', rimRR: 0.2 };
      M.sky = new THREE.MeshPhysicalMaterial({ color: 0x86c3ec, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
      // the egg: narrow end forward, flattened a little underneath, with the canopy wrapped round its nose and top, and a
      // pair of sky-blue swooshes down its flanks
      const zc = -0.62, Lh = 1.26, secs = [];
      const eggAt = (t) => { const s = Math.sqrt(Math.max(0.0004, 1 - t * t)), f = 1 + 0.11 * t; return { z: zc + t * Lh, w: 0.8 * s * f, yb: 0.8 - 0.6 * s * f * 0.98, yt: 0.8 + 0.62 * s * f, n: 2, bw: 0.9 }; };
      for (let i = 0; i <= 56; i++) secs.push(eggAt(-1 + 2 * (0.5 - 0.5 * Math.cos(Math.PI * i / 56))));
      const eggMat = (x, y, z, k) => (k >= 0 && z < -0.22 && z > -1.86 && k >= 21 && k < 51 ? 1 : 0);
      add(body, loft(secs, { seg: 72, mat: eggMat }), [M.paint, M.tint], 0, 0, 0);
      // (a point on the egg's surface at (z, y), right side)
      const eggX = (z, y) => { const e = eggAt((z - zc) / Lh), yc = (e.yb + e.yt) / 2, hh = (e.yt - e.yb) / 2, sy = clamp((y - yc) / hh, -0.999, 0.999); return e.w * (sy < 0 ? 1 - 0.1 * -sy : 1) * Math.sqrt(1 - sy * sy); };
      const swoosh = (z0, z1, yf, hw0) => {
        const pos = [], idx = [], n = 40;
        for (const sx of [-1, 1]) {
          const base = pos.length / 3;
          for (let i = 0; i <= n; i++) {
            const u = i / n, z = z0 + (z1 - z0) * u, hw = hw0 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.45) + 0.004, yc = yf(u);
            for (const y of [yc - hw, yc + hw]) pos.push(sx * (eggX(z, y) + 0.005), y, z);
          }
          for (let i = 0; i < n; i++) { const a = base + i * 2; if (sx > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        add(body, g, M.sky, 0, 0, 0, 0, 0, 0, false);
      };
      swoosh(-1.4, 0.55, (u) => 0.48 + 0.42 * u + 0.08 * Math.sin(Math.PI * u), 0.04);
      swoosh(-0.95, 0.5, (u) => 0.38 + 0.26 * u + 0.05 * Math.sin(Math.PI * u), 0.022);
      // door seam and handle on each side
      for (const sx of [-1, 1]) {
        add(body, new THREE.BoxGeometry(0.01, 0.012, 0.03), M.chrome, sx * 0.78, 0.9, -0.08);
      }
      // sidepods behind the egg with their vents
      for (const sx of [-1, 1]) {
        add(body, rbox(0.26, 0.26, 1.0, 0.07), M.paint, sx * 0.72, 0.36, 0.5);
        for (let k = 0; k < 5; k++) add(body, new THREE.BoxGeometry(0.012, 0.03, 0.55), M.black, sx * 0.852, 0.3 + k * 0.035, 0.52);
        add(body, new THREE.BoxGeometry(0.01, 0.025, 0.9), M.sky, sx * 0.853, 0.47, 0.5);
      }
      // the open frame behind: rails, a chromed small-block with its air cleaner, zoomie headers
      for (const sx of [-1, 1]) { tubeAB(body, V3(sx * 0.42, 0.3, 0.3), V3(sx * 0.42, 0.3, 1.75), 0.03, M.black); tubeAB(body, V3(sx * 0.42, 0.3, 1.2), V3(sx * 0.32, 0.72, 0.6), 0.022, M.black); }
      tubeAB(body, V3(-0.42, 0.3, 1.75), V3(0.42, 0.3, 1.75), 0.03, M.black);
      add(body, rbox(0.44, 0.32, 0.62, 0.05), M.steel, 0, 0.5, 0.95);
      for (const sx of [-1, 1]) add(body, rbox(0.12, 0.08, 0.56, 0.02), M.chrome, sx * 0.17, 0.72, 0.95, 0, 0, sx * 0.5);
      add(body, cylZ(0.05, 0.05, 0.1, 12), M.steel, 0, 0.72, 0.95);
      add(body, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 28), M.chrome, 0, 0.84, 0.95);
      add(body, new THREE.CylinderGeometry(0.06, 0.06, 0.09, 16), M.chrome, 0, 0.92, 0.95);
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
        const z = 0.74 + k * 0.14, a = V3(sx * 0.26, 0.52, z), b = V3(sx * 0.42, 0.56, z + 0.03), c = V3(sx * 0.5, 0.74, z + 0.12);
        pipe(body, [a, b, c], 0.022, M.chrome); P.tips.push(toRoot(c));
      }
      // the wing: struts, a white plane, sky-blue endplates; tail lamps under it
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.4, 0.34, 1.62), V3(sx * 0.4, 1.28, 1.72), 0.025, M.black);
      add(body, rbox(1.56, 0.045, 0.44, 0.02), M.paint, 0, 1.31, 1.74, 0.12, 0, 0);
      for (const sx of [-1, 1]) add(body, rbox(0.035, 0.34, 0.54, 0.03), M.sky, sx * 0.78, 1.34, 1.74);
      for (const sx of [-1, 1]) { const tl = add(body, rbox(0.14, 0.05, 0.03, 0.01), M.tail, sx * 0.32, 0.36, 1.78); tl.castShadow = false; }
      // small headlamps low on the nose
      for (const sx of [-1, 1]) add(body, cylZ(0.045, 0.045, 0.03, 18), M.head, sx * 0.28, 0.5, -1.72);
      spots(0.28, 0.5, -1.74);
      // front suspension out to the wheels
      for (const sx of [-1, 1]) for (const y of [0.24, 0.38]) tubeAB(body, V3(sx * 0.3, y, zF), V3(sx * 0.66, y + 0.02, zF), 0.018, M.black);
      // inside: a seat, the dash with the display, the wheel
      add(body, rbox(0.46, 0.08, 0.44, 0.03), M.seat, 0, 0.36, -0.28); add(body, rbox(0.46, 0.55, 0.08, 0.03), M.seat, 0, 0.64, -0.02, 0.3, 0, 0);
      add(body, rbox(0.62, 0.05, 0.2, 0.02), M.black, 0, 0.8, -1.0, -0.3, 0, 0);
      SW = steering(V3(0, 0.84, -0.85), 0.55, 0.16);
      cluster = { parent: body, pos: V3(0, 0.9, -1.0), rot: -0.55, w: 0.18, h: 0.09 };
      driver = person({ hip: V3(0, 0.42, -0.26), lean: 0.3, hands: [V3(-0.13, 0.86, -0.82), V3(0.13, 0.86, -0.82)],
        knee: { dx: 0.1, y: 0.58, z: -0.7 }, foot: { dx: 0.14, y: 0.28, z: -1.15 } });
      P.hideCockpit.push(driver);
    };

    // ---------------------------------------------------------------- Banana Car
    B.banana = () => {
      WF = 0.235; WR = 0.235;
      wheelStyle = { rim: 'steel5', rimR: 0.19, tread: 'truck' };
      M.stem = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.8, flatShading: true });
      const cp = [[-3.4, 0.74, 0.03], [-3.2, 0.78, 0.17], [-2.8, 0.84, 0.33], [-2.2, 0.9, 0.44], [-1.4, 0.95, 0.5], [-0.4, 0.99, 0.52], [0.6, 1.04, 0.51],
        [1.5, 1.12, 0.47], [2.2, 1.26, 0.4], [2.75, 1.45, 0.3], [3.1, 1.66, 0.2], [3.35, 1.86, 0.12], [3.45, 1.95, 0.08]];
      const curve = new THREE.CatmullRomCurve3(cp.map(([z, y, r]) => V3(r, y, z)));
      const secs = [];
      for (let i = 0; i <= 40; i++) { const p = curve.getPoint(i / 40); secs.push({ z: p.z, w: p.x * 1.05, yb: p.y - p.x * 0.95, yt: p.y + p.x * 0.95, n: 2 }); }
      add(body, loft(secs, { seg: 10, flat: true }), M.paint, 0, 0, 0);
      const topAt = (z) => { let best = secs[0]; for (const s of secs) if (Math.abs(s.z - z) < Math.abs(best.z - z)) best = s; return best.yt; };
      // the tips: dark at the front, the stem at the back
      add(body, new THREE.SphereGeometry(0.06, 8, 6), M.stem, 0, 0.74, -3.42);
      const st = add(body, new THREE.CylinderGeometry(0.06, 0.075, 0.26, 6), M.stem, 0, 2.02, 3.52, 0.9, 0, 0);
      void st;
      // five seats sunk in a row: dark wells, seat backs and headrests
      const seatZ = [-1.05, -0.3, 0.45, 1.2, 1.95];
      seatZ.forEach((z, i) => {
        const y = topAt(z);
        add(body, rbox(0.62, 0.03, 0.58, 0.05), M.black, 0, y - 0.012, z);
        add(body, rbox(0.46, 0.44, 0.1, 0.04), M.seat, 0, y + 0.13, z + 0.22, 0.2, 0, 0);
        add(body, rbox(0.24, 0.16, 0.08, 0.03), M.seat, 0, y + 0.42, z + 0.28, 0.2, 0, 0);
        void i;
      });
      // windscreen and mirrors in front of the driver
      const yF = topAt(-1.55);
      add(body, rbox(0.72, 0.03, 0.04, 0.01), M.black, 0, yF + 0.02, -1.52);
      const ws = add(body, new THREE.PlaneGeometry(0.66, 0.34), M.glass, 0, yF + 0.2, -1.5, -0.45, 0, 0, false); ws.castShadow = false;
      for (const sx of [-1, 1]) { tubeAB(body, V3(sx * 0.34, yF, -1.52), V3(sx * 0.3, yF + 0.37, -1.4), 0.012, M.black); tubeAB(body, V3(sx * 0.42, yF - 0.02, -1.45), V3(sx * 0.56, yF + 0.08, -1.45), 0.01, M.black); add(body, rbox(0.03, 0.1, 0.14, 0.01), M.black, sx * 0.58, yF + 0.1, -1.45); }
      // the truck frame under it, the tube bumper with its round lamps, fenders
      for (const sx of [-1, 1]) {
        add(body, new THREE.BoxGeometry(0.06, 0.14, 5.2), M.black, sx * 0.42, 0.46, -0.2);
        for (const z of [-2.2, -1.0, 0.2, 1.4, 2.3]) tubeAB(body, V3(sx * 0.42, 0.5, z), V3(sx * 0.26, 0.82, z), 0.03, M.black);
      }
      tubeAB(body, V3(-0.95, 0.5, -3.1), V3(0.95, 0.5, -3.1), 0.045, M.black);
      tubeAB(body, V3(-0.95, 0.5, -3.1), V3(-1.02, 0.5, -2.92), 0.04, M.black); tubeAB(body, V3(0.95, 0.5, -3.1), V3(1.02, 0.5, -2.92), 0.04, M.black);
      for (const sx of [-1, 1]) {
        tubeAB(body, V3(sx * 0.42, 0.46, -2.8), V3(sx * 0.5, 0.5, -3.1), 0.035, M.black);
        add(body, cylZ(0.07, 0.07, 0.07, 18), M.black, sx * 0.7, 0.6, -3.14); add(body, cylZ(0.058, 0.058, 0.02, 18), M.head, sx * 0.7, 0.6, -3.18);
        add(body, rbox(0.05, 0.05, 0.04, 0.01), M.amber, sx * 1.0, 0.5, -3.02);
        for (const [z, r] of [[zF, RF], [zR, RR]]) add(body, arcGeo(z, r, r + 0.05, r + 0.08, 0.35, Math.PI - 0.35, 0.3), M.black, sx * ((z < 0 ? trackF : trackR) / 2) - 0.15, 0, 0);
        const tl = add(body, rbox(0.12, 0.08, 0.03, 0.01), M.tail, sx * 0.38, 0.62, 2.76); tl.castShadow = false;
      }
      tubeAB(body, V3(-0.45, 0.56, 2.72), V3(0.45, 0.56, 2.72), 0.03, M.black);
      spots(0.7, 0.6, -3.2);
      // driver's dash and wheel
      add(body, rbox(0.56, 0.1, 0.18, 0.03), M.black, 0, yF - 0.02, -1.38, -0.4, 0, 0);
      SW = steering(V3(0, yF + 0.04, -1.24), 0.75, 0.17);
      cluster = { parent: body, pos: V3(0, yF + 0.02, -1.4), rot: -0.7, w: 0.14, h: 0.07 };
      P.tips.push(toRoot(V3(0.35, 0.4, 2.7)));
      const hy = topAt(-1.05) - 0.09;
      driver = person({ hip: V3(0, hy, -1.0), lean: 0.18, hands: [V3(-0.14, yF + 0.07, -1.22), V3(0.14, yF + 0.07, -1.22)],
        knee: { dx: 0.11, y: hy + 0.12, z: -1.4 }, foot: { dx: 0.14, y: hy - 0.22, z: -1.62 }, helmet: false });
    };

    // ---------------------------------------------------------------- Blue Bird
    B.bluebird = () => {
      WF = 0.18; WR = 0.2;
      wheelStyle = { rim: 'disc', rimR: 0.3, tread: 'slick' };
      const S = [[-4.35, 0.2, 0.44, 0.84], [-4.22, 0.36, 0.33, 0.96], [-3.95, 0.47, 0.27, 1.05], [-3.4, 0.53, 0.25, 1.1], [-2.4, 0.56, 0.24, 1.13], [-1.2, 0.58, 0.25, 1.16],
        [0.0, 0.6, 0.26, 1.18], [0.8, 0.6, 0.27, 1.17], [1.6, 0.58, 0.28, 1.14], [2.5, 0.53, 0.3, 1.08], [3.3, 0.43, 0.34, 1.0], [3.95, 0.3, 0.4, 0.93], [4.38, 0.1, 0.5, 0.86]];
      add(body, loft(S.map(([z, w, yb, yt]) => ({ z, w, yb, yt, n: 2.6, tw: 0.82 })), { seg: 40 }), M.paint, 0, 0, 0);
      // wheel fairings flowing into the flanks: behind the front wheels, ahead of the rears
      for (const sx of [-1, 1]) {
        const xw = sx * trackF / 2, xb = sx * 0.5;
        // (a spat over the back of each front wheel that tapers into the side; ahead of each rear wheel a pod swelling out
        // of the side to meet it)
        const spat = (zw, xw0, hw, R) => {
          const S = [];
          for (let i = 0; i <= 16; i++) {
            const u = i / 16, z = zw - R - 0.08 + u * (2 * R + 1.25), a = clamp((z - (zw - R - 0.08)) / (R + 0.1), 0, 1), tail = clamp((z - zw) / (R + 1.2), 0, 1);
            const nose = Math.sqrt(Math.max(0.02, 1 - (1 - a) * (1 - a)));
            S.push({ z, xc: xw0 + (sx * 0.5 - xw0) * tail * tail, w: (hw * (1 - 0.55 * tail)) * nose + 0.02, yb: R - 0.02 + 0.06 * tail, yt: R + (R + 0.1) * nose * (1 - 0.45 * tail * tail), n: 2.3, bw: 1 });
          }
          add(body, loft(S, { seg: 28 }), M.paint, 0, 0, 0);
        };
        spat(zF, xw, 0.16, RF);
        spat(zR, sx * (trackR / 2 - 0.1), 0.22, RR);
        // the side's ports and chrome strip
        for (let k = 0; k < 4; k++) add(body, cylX(0.028, 0.028, 0.02, 14), M.black, sx * 0.575, 1.0, -1.1 + k * 0.13);
        add(body, new THREE.BoxGeometry(0.012, 0.02, 1.6), M.chrome, sx * 0.605, 0.72, 0.2);
        add(body, new THREE.SphereGeometry(0.05, 14, 10), M.paint, sx * 0.6, 0.72, 1.1);
        // exhaust stubs along the top of the engine bay
        for (let k = 0; k < 6; k++) { const z = -2.9 + k * 0.26; add(body, cylX(0.025, 0.025, 0.08, 10), M.steel, sx * 0.54, 1.02, z); P.tips.push(toRoot(V3(sx * 0.6, 1.02, z))); }
      }
      // the nose intake
      add(body, new THREE.CircleGeometry(0.22, 28), M.black, 0, 0.66, -4.33, 0, Math.PI, 0, false).scale.set(0.9, 1.25, 1);
      // tail fin
      const fin = profile([[3.0, 1.05], [3.4, 1.35], [4.15, 1.85], [4.4, 1.85], [4.42, 0.9], [3.0, 1.0]], 0.06, 0.02);
      add(body, fin, M.paint, 0, 0, 0);
      // cockpit well, the little screen, the driver's head and shoulders above the rim
      add(body, rbox(0.56, 0.03, 0.84, 0.2), M.black, 0, 1.175, 1.15);
      const rim = add(body, new THREE.TorusGeometry(0.3, 0.035, 10, 32), new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.7 }), 0, 1.19, 1.15, Math.PI / 2, 0, 0); rim.scale.set(1, 1.45, 1);
      const ws = add(body, new THREE.PlaneGeometry(0.46, 0.2), M.glass, 0, 1.28, 0.62, -0.6, 0, 0, false); ws.castShadow = false;
      add(body, new THREE.BoxGeometry(0.48, 0.02, 0.02), M.chrome, 0, 1.19, 0.66);
      add(body, loft([{ z: 1.5, w: 0.05, yb: 1.12, yt: 1.2 }, { z: 1.62, w: 0.15, yb: 1.1, yt: 1.36 }, { z: 1.9, w: 0.15, yb: 1.08, yt: 1.34 }, { z: 2.6, w: 0.08, yb: 1.04, yt: 1.12 }, { z: 3.0, w: 0.02, yb: 1.0, yt: 1.02 }].map((q) => Object.assign(q, { n: 2.2 })), { seg: 24 }), M.paint, 0, 0, 0);   // headrest fairing
      SW = steering(V3(0, 1.05, 0.82), 0.25, 0.2, 'wood');
      cluster = { parent: body, pos: V3(0, 1.1, 0.7), rot: -0.3, w: 0.16, h: 0.08 };
      driver = person({ hip: V3(0, 0.6, 1.3), lean: 0.22, hands: [V3(-0.16, 1.07, 0.86), V3(0.16, 1.07, 0.86)],
        knee: { dx: 0.11, y: 0.72, z: 0.85 }, foot: { dx: 0.14, y: 0.42, z: 0.35 }, goggles: true });
    };

    // ---------------------------------------------------------------- Nissan GTR (Liberty Walk)
    B.gtr = () => {
      WF = 0.285; WR = 0.315;
      wheelStyle = { rim: 'deepdish', rimR: 0.254, tread: 'road' };
      M.carbon = new THREE.MeshPhysicalMaterial({ color: 0x08090a, roughness: 0.42, metalness: 0.25, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 0.5, side: THREE.DoubleSide });
      M.ti = new THREE.MeshStandardMaterial({ color: 0x8b7b9a, roughness: 0.25, metalness: 1 });
      const flare = (z) => { let f = 0; for (const zc of [zF, zR]) { const d = Math.abs(z - zc); if (d < 0.78) f = Math.max(f, 0.075 * Math.pow(1 - (d / 0.78) ** 2, 0.55)); } return f; };
      const Wbase = tbl([[-2.37, 0.78], [-2.28, 0.9], [-2.1, 0.94], [-1.8, 0.955], [-0.9, 0.95], [0.5, 0.95], [1.9, 0.965], [2.25, 0.94], [2.39, 0.9]]);
      const W = (z) => Wbase(z) + flare(z);
      const ZW = -0.66, ZR = 1.64;                    // windshield base, rear-window base

      const g = carBody({
        stations: stationsOf(-2.37, 2.39, 0.06, [ZW, 0.12, 0.5, 0.6, 1.2, ZR, zF - 0.43, zF + 0.43, zR - 0.43, zR + 0.43]),
        W, bulge: () => 0.012,
        yB: archY(tbl([[-2.37, 0.24], [-2.25, 0.16], [2.2, 0.16], [2.39, 0.3]]), [zF, zR], RF, 0.43),
        ySh: tbl([[-2.37, 0.56], [-2.2, 0.66], [-1.8, 0.74], [-1.39, 0.78], [-0.8, 0.79], [0.3, 0.8], [1.2, 0.83], [1.6, 0.85], [2.1, 0.86], [2.39, 0.79]]),
        yBelt: tbl([[-2.37, 0.6], [-2.2, 0.71], [-1.8, 0.79], [-1.4, 0.84], [ZW, 0.9], [0.3, 0.9], [1.3, 0.93], [ZR, 0.95], [2.0, 0.955], [2.39, 0.88]]),
        Wb: (z) => W(z) - 0.085 - flare(z),
        yT: tbl([[-2.37, 0.62], [-2.3, 0.7], [-2.1, 0.77], [-1.7, 0.83], [-1.2, 0.87], [ZW, 0.925], [-0.3, 1.13], [0.12, 1.28], [0.5, 1.31], [0.95, 1.29], [1.3, 1.19], [ZR, 1.0], [2.0, 0.99], [2.25, 0.985], [2.33, 0.96], [2.39, 0.9]]),
        Wt: tbl([[-2.37, 0.4], [-0.9, 0.5], [ZW, 0.58], [-0.3, 0.64], [0.3, 0.66], [1.2, 0.66], [ZR, 0.6], [2.0, 0.55], [2.39, 0.5]]),
        mat: (b, z) => {
          if (b <= 3) return 2;                                                 // black skirts, splitter, diffuser sides
          if (z > ZW && z < ZR && b >= 11) {
            if (b >= 15 && z > 0.12 && z < 1.2) return 2;                        // black roof
            if (b <= 14 && z > 0.5 && z < 0.6) return 2;                         // B-pillar
            return 1;                                                            // glass
          }
          if (z < ZW && b >= 11) return 2;                                      // the black hood
          return 0;
        },
      });
      add(body, g, [M.paint, M.tint, M.carbon], 0, 0, 0);
      // Liberty Walk overfenders: riveted lips round every arch
      for (const sx of [-1, 1]) for (const [z, r] of [[zF, RF], [zR, RR]]) {
        const xo = W(z);
        add(body, arcGeo(z, r, 0.43, 0.47, 0.12, Math.PI - 0.12, 0.09), M.paint, sx > 0 ? xo - 0.07 : -xo - 0.02, 0, 0);
        for (let k = 0; k < 9; k++) { const a = 0.25 + k * (Math.PI - 0.5) / 8; add(body, new THREE.SphereGeometry(0.011, 8, 6), M.chrome, sx * (xo + 0.022), r + Math.sin(a) * 0.45, z + Math.cos(a) * 0.45); }
      }
      // front: grille, bumper intakes, the carbon splitter, the swept lamps
      add(body, new THREE.PlaneGeometry(0.9, 0.2), M.mesh, 0, 0.42, -2.375, 0, Math.PI, 0, false);
      for (const sx of [-1, 1]) add(body, new THREE.PlaneGeometry(0.26, 0.12), M.mesh, sx * 0.6, 0.3, -2.33, 0, Math.PI + sx * 0.4, 0, false);
      add(body, rbox(1.84, 0.022, 0.14, 0.008), M.carbon, 0, 0.15, -2.33);
      for (const sx of [-1, 1]) {
        add(body, rbox(0.4, 0.06, 0.22, 0.025), M.gloss, sx * 0.63, 0.715, -2.13, -0.32, sx * 0.3, 0);
        for (const [dx, dz] of [[-0.08, 0.02], [0.06, -0.04]]) { const l = add(body, new THREE.SphereGeometry(0.03, 14, 10), M.head, sx * (0.63 + dx), 0.74, -2.13 + dz); l.scale.set(1.5, 0.6, 1); l.castShadow = false; }
        const led = add(body, rbox(0.34, 0.012, 0.02, 0.004), M.head, sx * 0.64, 0.7, -2.23, -0.32, sx * 0.3, 0); led.castShadow = false;
        add(body, rbox(0.38, 0.01, 0.05, 0.004), M.amber, sx * 0.64, 0.685, -2.2, -0.32, sx * 0.3, 0);
        // mirrors, fender vents
        add(body, rbox(0.05, 0.08, 0.17, 0.02), M.carbon, sx * 1.0, 1.0, -0.5);
        tubeAB(body, V3(sx * 0.88, 0.95, -0.54), V3(sx * 0.99, 0.98, -0.5), 0.012, M.carbon);
        add(body, new THREE.PlaneGeometry(0.2, 0.08), M.mesh, sx * (W(-0.95) + 0.003), 0.62, -0.95, 0, sx * Math.PI / 2, 0, false);
      }
      spots(0.63, 0.7, -2.2);
      // rear: the four round lamps, the diffuser, four titanium tips, the GT wing on tall struts
      for (const sx of [-1, 1]) for (const x of [0.34, 0.6]) {
        add(body, new THREE.TorusGeometry(0.072, 0.013, 10, 28), M.chrome, sx * x, 0.8, 2.392);
        const l = add(body, new THREE.CircleGeometry(0.068, 28), M.tail, sx * x, 0.8, 2.395, 0, 0, 0, false); l.castShadow = false;
      }
      add(body, rbox(1.5, 0.12, 0.16, 0.02), M.carbon, 0, 0.3, 2.34);
      add(body, rbox(1.84, 0.1, 0.08, 0.02), M.carbon, 0, 0.44, 2.37);                       // the black lower valance
      add(body, rbox(0.52, 0.13, 0.012, 0.006), M.white, 0, 0.6, 2.393);                     // plate
      for (const x of [-0.95, 0.95]) add(body, rbox(0.04, 0.3, 0.12, 0.01), M.carbon, x * 0.98, 0.42, 2.3);
      for (const x of [-0.52, -0.4, 0.4, 0.52]) { add(body, cylZ(0.045, 0.05, 0.12, 18, true), M.ti, x, 0.33, 2.4); P.tips.push(toRoot(V3(x, 0.33, 2.47))); }
      for (const sx of [-1, 1]) { tubeAB(body, V3(sx * 0.52, 0.99, 2.0), V3(sx * 0.52, 1.4, 2.18), 0.018, M.carbon); add(body, rbox(0.04, 0.02, 0.16, 0.008), M.carbon, sx * 0.52, 0.995, 2.0); }
      add(body, rbox(1.9, 0.035, 0.36, 0.015), M.carbon, 0, 1.42, 2.22, 0.1, 0, 0);
      for (const sx of [-1, 1]) add(body, rbox(0.02, 0.22, 0.44, 0.01), M.carbon, sx * 0.95, 1.42, 2.24);
      // inside: two seats, the dash, the wheel on the left (a US car)
      for (const sx of [-1, 1]) { add(body, rbox(0.46, 0.1, 0.46, 0.04), M.seat, sx * 0.38, 0.36, 0.28); add(body, rbox(0.46, 0.62, 0.1, 0.04), M.seat, sx * 0.38, 0.7, 0.5, 0.2, 0, 0); }
      add(body, rbox(1.64, 0.14, 0.34, 0.05), M.black, 0, 0.84, -0.48);
      add(body, rbox(0.26, 0.48, 0.4, 0.05), M.black, 0, 0.54, -0.2);
      SW = steering(V3(-0.38, 0.8, -0.24), 0.4, 0.18);
      cluster = { parent: body, pos: V3(-0.38, 0.93, -0.4), rot: -0.35, w: 0.26, h: 0.1 };
      driver = person({ hip: V3(-0.38, 0.42, 0.28), lean: 0.3, hands: [V3(-0.52, 0.82, -0.22), V3(-0.24, 0.82, -0.22)],
        knee: { dx: 0.1, y: 0.56, z: -0.2 }, foot: { dx: 0.13, y: 0.22, z: -0.72 }, helmet: false });
      P.hideCockpit.push(driver);
    };

    // ---------------------------------------------------------------- Mini Dookie
    B.mini = () => {
      WF = 0.145; WR = 0.145;
      wheelStyle = { rim: 'alloy5', rimR: 0.19, tread: 'road' };
      M.orange = new THREE.MeshStandardMaterial({ color: 0xc8501c, roughness: 0.7 });
      const flare = (z) => { let f = 0; for (const zc of [zF, zR]) { const d = Math.abs(z - zc); if (d < 0.5) f = Math.max(f, 0.035 * Math.pow(1 - (d / 0.5) ** 2, 0.6)); } return f; };
      const Wb0 = tbl([[-1.28, 0.58], [-1.18, 0.68], [-1.0, 0.71], [1.0, 0.71], [1.15, 0.69], [1.22, 0.63]]);
      const W = (z) => Wb0(z) + flare(z);
      const g = carBody({
        stations: stationsOf(-1.28, 1.22, 0.05, [-1.18, -0.45, 0.12, 0.24, 0.8, 1.06, zF - 0.34, zF + 0.34, zR - 0.34, zR + 0.34]),
        W, bulge: () => 0.01,
        yB: archY(tbl([[-1.28, 0.32], [-1.15, 0.2], [1.1, 0.2], [1.22, 0.3]]), [zF, zR], RF, 0.34),
        ySh: tbl([[-1.28, 0.56], [-1.18, 0.68], [-1.0, 0.78], [-0.6, 0.84], [1.22, 0.84]]),
        yBelt: tbl([[-1.28, 0.6], [-1.18, 0.73], [-1.0, 0.8], [-0.62, 0.93], [1.0, 0.95], [1.22, 0.9]]),
        Wb: (z) => W(z) - 0.05 - flare(z),
        yT: tbl([[-1.28, 0.62], [-1.2, 0.76], [-1.0, 1.02], [-0.8, 1.26], [-0.6, 1.46], [-0.4, 1.57], [0, 1.62], [0.8, 1.6], [1.05, 1.52], [1.18, 1.36], [1.22, 1.18]]),
        Wt: tbl([[-1.28, 0.45], [-1.0, 0.58], [-0.6, 0.63], [0.8, 0.64], [1.22, 0.56]]),
        mat: (b, z) => {
          if (b <= 3) return 2;
          if (b >= 11 && b <= 14 && z > -1.18 && z < 1.1 && !(z > 0.12 && z < 0.24)) return 1;   // windscreen, side and rear windows
          if (b >= 15 && (z < -0.45 || (z < 0.8 && z > -0.45))) return 1;                       // the screen's top and the glass roof
          return 0;
        },
      });
      add(body, g, [M.paint, M.glass, M.black], 0, 0, 0);
      for (const sx of [-1, 1]) {
        add(body, cylZ(0.06, 0.06, 0.03, 20), M.head, sx * 0.44, 0.52, -1.285);
        const t = add(body, rbox(0.1, 0.14, 0.03, 0.02), M.tail, sx * 0.48, 0.75, 1.225); t.castShadow = false;
        add(body, rbox(0.03, 0.07, 0.1, 0.01), M.black, sx * 0.76, 1.02, -0.62);   // mirror
      }
      add(body, rbox(1.1, 0.06, 0.1, 0.02), M.black, 0, 0.3, -1.29);     // bumper strips
      add(body, rbox(1.1, 0.06, 0.1, 0.02), M.black, 0, 0.32, 1.23);
      spots(0.44, 0.52, -1.3);
      // inside: the orange seat, a little dash, the wheel - all in the middle
      add(body, rbox(0.5, 0.12, 0.5, 0.05), M.orange, 0, 0.5, 0.15); add(body, rbox(0.5, 0.7, 0.12, 0.05), M.orange, 0, 0.92, 0.42, 0.18, 0, 0);
      add(body, rbox(1.1, 0.1, 0.3, 0.04), M.black, 0, 0.78, -0.82, -0.3, 0, 0);
      SW = steering(V3(0, 0.95, -0.52), 0.5, 0.17);
      cluster = { parent: body, pos: V3(0, 0.84, -0.78), rot: -0.5, w: 0.2, h: 0.08 };
      driver = person({ hip: V3(0, 0.56, 0.16), lean: 0.12, hands: [V3(-0.14, 0.97, -0.5), V3(0.14, 0.97, -0.5)],
        knee: { dx: 0.11, y: 0.72, z: -0.25 }, foot: { dx: 0.14, y: 0.26, z: -0.62 }, helmet: false });
      P.hideCockpit.push(driver);
    };

    // ---------------------------------------------------------------- Porta Potty
    B.potty = () => {
      WF = 0.076; WR = 0.076;
      wheelStyle = { rim: 'hub', rimR: 0.07, tread: 'truck' };
      M.potty2 = new THREE.MeshStandardMaterial({ color: 0x5b95d8, roughness: 0.45 });
      const hw = 0.56, hd = 0.595, y0 = 0.36, y1 = 2.26;
      // the black base tray, walls with their moulded panels and ribs, the white door frame and roof
      add(body, rbox(1.14, 0.1, 1.21, 0.02), M.black, 0, 0.31, 0);
      add(body, new THREE.BoxGeometry(2 * hw, y1 - y0, 0.04), M.paint, 0, (y0 + y1) / 2, hd - 0.02);
      for (const sx of [-1, 1]) {
        add(body, new THREE.BoxGeometry(0.04, y1 - y0, 2 * hd), M.paint, sx * (hw - 0.02), (y0 + y1) / 2, 0);
        add(body, rbox(0.012, 0.2, 0.9, 0.01), M.potty2, sx * hw, 1.95, 0);
        add(body, rbox(0.012, 0.36, 0.64, 0.01), M.potty2, sx * hw, 1.45, 0);
        for (let k = 0; k < 7; k++) add(body, new THREE.BoxGeometry(0.014, 0.62, 0.035), M.potty2, sx * hw, 0.78, -0.39 + k * 0.13);
      }
      add(body, rbox(0.64, 0.36, 0.012, 0.01), M.potty2, 0, 1.45, hd);
      for (const sx of [-1, 1]) add(body, new THREE.BoxGeometry(0.1, y1 - y0, 0.05), M.white, sx * 0.49, (y0 + y1) / 2, -hd);
      add(body, new THREE.BoxGeometry(2 * hw, 0.2, 0.05), M.white, 0, y1 - 0.1, -hd);
      { const sh = new THREE.Shape(); sh.moveTo(-0.62, 0); sh.quadraticCurveTo(0, 0.3, 0.62, 0); sh.lineTo(0.62, -0.04); sh.lineTo(-0.62, -0.04); sh.lineTo(-0.62, 0);
        const rg = new THREE.ExtrudeGeometry(sh, { depth: 1.28, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 16 }); rg.translate(0, 0, -0.64);
        add(body, rg, M.white, 0, y1 + 0.04, 0); }
      add(body, new THREE.BoxGeometry(1.22, 0.06, 1.3), M.white, 0, y1 + 0.01, 0);
      add(body, new THREE.CylinderGeometry(0.05, 0.05, 0.26, 14), M.black, 0.28, y1 + 0.26, 0.4);     // the vent stack - the exhaust
      P.tips.push(toRoot(V3(0.28, y1 + 0.4, 0.4)));
      // the door, swung open on its left hinges
      const door = new THREE.Group(); door.position.set(-0.45, y0 + 0.02, -hd - 0.02); door.rotation.y = 1.75; body.add(door);
      add(door, new THREE.BoxGeometry(0.9, 1.78, 0.04), M.paint, 0.45, 0.89, 0);
      add(door, rbox(0.7, 0.5, 0.012, 0.01), M.potty2, 0.45, 1.3, -0.026);
      for (let k = 0; k < 5; k++) add(door, new THREE.BoxGeometry(0.035, 0.6, 0.014), M.potty2, 0.2 + k * 0.125, 0.5, -0.026);
      add(door, new THREE.BoxGeometry(0.04, 0.1, 0.03), M.white, 0.84, 1.0, -0.03);
      add(door, new THREE.BoxGeometry(0.1, 0.04, 0.015), new THREE.MeshStandardMaterial({ color: 0x2a9a3a, roughness: 0.4 }), 0.72, 1.12, -0.03);   // VACANT
      // inside: the floor, the throne (the engine's under it), a paper roll, the steering column
      add(body, new THREE.BoxGeometry(1.06, 0.03, 1.12), M.grey, 0, 0.37, 0);
      add(body, rbox(1.04, 0.46, 0.46, 0.02), M.potty2, 0, 0.6, 0.33);
      add(body, new THREE.TorusGeometry(0.15, 0.035, 10, 28), M.black, 0, 0.84, 0.3, Math.PI / 2, 0, 0);
      add(body, rbox(0.36, 0.42, 0.03, 0.02), M.black, 0, 1.06, 0.53, 0.2, 0, 0);
      add(body, cylX(0.06, 0.06, 0.1, 18), M.white, 0.48, 1.0, 0.1);
      pipe(body, [V3(0, 0.38, -0.3), V3(0, 0.7, -0.3), V3(0, 1.0, -0.2)], 0.018, M.grey);
      SW = steering(V3(0, 1.02, -0.18), 0.9, 0.14);
      cluster = { parent: body, pos: V3(0, 0.95, -0.28), rot: -0.9, w: 0.1, h: 0.05 };
      driver = person({ hip: V3(0, 0.88, 0.3), lean: 0.08, hands: [V3(-0.12, 1.04, -0.16), V3(0.12, 1.04, -0.16)],
        knee: { dx: 0.12, y: 0.95, z: -0.08 }, foot: { dx: 0.15, y: 0.42, z: -0.2 }, helmet: true });
    };

    // ---------------------------------------------------------------- Turbo Scooter 3000
    B.scooter = () => {
      WF = 0.08; WR = 0.09;
      wheelStyle = { rim: 'alloy5', rimR: 0.075, tread: 'truck' };
      // front fairing with the lamp, the tiller rising from it, the low deck, the rear shell, the seat post and seat
      add(body, loft([{ z: -0.86, w: 0.12, yb: 0.12, yt: 0.34, n: 2.4 }, { z: -0.8, w: 0.24, yb: 0.08, yt: 0.44, n: 3 }, { z: -0.62, w: 0.3, yb: 0.1, yt: 0.48, n: 3.5, tw: 0.7 },
        { z: -0.44, w: 0.26, yb: 0.12, yt: 0.44, n: 3.5, tw: 0.6 }, { z: -0.38, w: 0.18, yb: 0.14, yt: 0.3, n: 3 }], { seg: 32 }), M.paint, 0, 0, 0);
      add(body, cylZ(0.04, 0.04, 0.02, 18), M.head, 0, 0.28, -0.86);
      add(body, rbox(0.44, 0.06, 0.1, 0.03), M.black, 0, 0.1, -0.86);    // bumper
      add(body, rbox(0.44, 0.05, 0.62, 0.02), M.black, 0, 0.16, -0.12);  // the deck
      add(body, loft([{ z: 0.12, w: 0.24, yb: 0.12, yt: 0.34, n: 3 }, { z: 0.2, w: 0.32, yb: 0.1, yt: 0.44, n: 3.5, tw: 0.75 }, { z: 0.6, w: 0.34, yb: 0.12, yt: 0.46, n: 3.5, tw: 0.75 },
        { z: 0.76, w: 0.3, yb: 0.14, yt: 0.4, n: 3 }, { z: 0.82, w: 0.2, yb: 0.18, yt: 0.32, n: 2.5 }], { seg: 32 }), M.paint, 0, 0, 0);
      for (const sx of [-1, 1]) { const t = add(body, rbox(0.08, 0.05, 0.02, 0.01), M.tail, sx * 0.2, 0.36, 0.8); t.castShadow = false; }
      add(body, new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14), M.alu, 0, 0.56, 0.36);
      add(body, rbox(0.5, 0.12, 0.48, 0.05), M.seat, 0, 0.7, 0.34);
      add(body, rbox(0.48, 0.62, 0.12, 0.05), M.seat, 0, 1.06, 0.58, 0.12, 0, 0);
      add(body, rbox(0.3, 0.18, 0.1, 0.04), M.seat, 0, 1.46, 0.63, 0.12, 0, 0);
      for (const sx of [-1, 1]) { add(body, rbox(0.07, 0.05, 0.38, 0.02), M.seat, sx * 0.29, 0.92, 0.28); tubeAB(body, V3(sx * 0.27, 0.72, 0.45), V3(sx * 0.29, 0.9, 0.45), 0.014, M.black); }
      // tiller, console, handlebar, mirrors
      tubeAB(body, V3(0, 0.44, -0.56), V3(0, 0.92, -0.4), 0.04, M.paint);
      add(body, rbox(0.22, 0.12, 0.14, 0.04), M.paint, 0, 0.96, -0.38, -0.5, 0, 0);
      for (const sx of [-1, 1]) {
        tubeAB(body, V3(sx * 0.1, 0.98, -0.34), V3(sx * 0.2, 1.0, -0.28), 0.014, M.black);
        tubeAB(body, V3(sx * 0.08, 1.02, -0.4), V3(sx * 0.2, 1.18, -0.44), 0.008, M.black);
        add(body, rbox(0.08, 0.1, 0.02, 0.01), M.chrome, sx * 0.21, 1.2, -0.44);
      }
      // the basket
      const bk = new THREE.Group(); bk.position.set(0, 0.62, -0.9); body.add(bk);
      add(bk, new THREE.BoxGeometry(0.4, 0.02, 0.3), M.black, 0, -0.13, 0);
      for (const sx of [-1, 1]) add(bk, new THREE.BoxGeometry(0.015, 0.26, 0.3), M.mesh, sx * 0.2, 0, 0);
      for (const sz of [-1, 1]) add(bk, new THREE.BoxGeometry(0.4, 0.26, 0.015), M.mesh, 0, 0, sz * 0.15);
      tubeAB(body, V3(0, 0.46, -0.72), V3(0, 0.5, -0.82), 0.02, M.black);
      // the anti-tip wheels at the back
      for (const sx of [-1, 1]) { tubeAB(body, V3(sx * 0.16, 0.2, 0.7), V3(sx * 0.18, 0.1, 0.87), 0.012, M.black); add(body, cylX(0.04, 0.04, 0.03, 14), M.rubber, sx * 0.18, 0.08, 0.87); }
      SW = { colG: new THREE.Group(), sw: new THREE.Group() }; model.add(SW.colG); SW.colG.add(SW.sw);
      cluster = { parent: body, pos: V3(0, 1.0, -0.36), rot: -1.1, w: 0.12, h: 0.06 };
      P.tips.push(toRoot(V3(0, 0.2, 0.85)));
      spots(0.05, 0.28, -0.9);
      driver = person({ hip: V3(0, 0.78, 0.33), lean: 0.1, hands: [V3(-0.2, 1.0, -0.28), V3(0.2, 1.0, -0.28)],
        knee: { dx: 0.12, y: 0.84, z: -0.08 }, foot: { dx: 0.14, y: 0.22, z: -0.26 } });
    };

    // ---------------------------------------------------------------- Razors Edge
    B.razor = () => {
      WF = 0.215; WR = 0.215;
      wheelStyle = { rim: 'cart', rimR: 0.1, tread: 'road' };
      // the faceted wedge: nose low at the front, the ridge peaking just ahead of the middle, the tail up high
      const v = [[0, 0.42, -2.36], [0, 1.36, -0.55], [0, 1.08, 2.36], [0, 0.46, 2.32],          // 0 nose, 1 ridge, 2 tail top, 3 tail bottom
        [-0.86, 0.62, -0.45], [0.86, 0.62, -0.45], [-0.84, 0.66, 1.35], [0.84, 0.66, 1.35],      // 4-7 flanks
        [-0.66, 0.16, -1.45], [0.66, 0.16, -1.45], [-0.66, 0.16, 1.7], [0.66, 0.16, 1.7]];       // 8-11 floor
      const F = [[0, 1, 4], [0, 5, 1], [1, 6, 4], [1, 5, 7], [1, 2, 6], [1, 7, 2],           // upper faces
        [0, 4, 8], [0, 9, 5], [0, 8, 9], [4, 6, 10, 8], [5, 9, 11, 7],                      // nose underside, flanks
        [8, 10, 11, 9], [6, 2, 3], [7, 3, 2], [6, 3, 10], [7, 11, 3], [3, 11, 10]];          // floor, tail
      M.smoke = new THREE.MeshPhysicalMaterial({ color: 0x12161b, roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 });
      const shell = add(body, facesGeo(v, F), M.smoke, 0, 0, 0); shell.castShadow = true;
      // the graveyard on the flanks: tombstones, crosses and dead trees against the glass
      const gy = canvasTex(1024, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#050505';
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.72 + Math.sin(x * 0.02) * 10); g.lineTo(w, h); g.fill();
        const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
        for (let k = 0; k < 26; k++) {
          const x = rnd() * w, bh = 20 + rnd() * 26, y0 = h * 0.74;
          if (rnd() < 0.5) { g.fillRect(x - 8, y0 - bh, 16, bh); g.beginPath(); g.arc(x, y0 - bh, 8, Math.PI, 0); g.fill(); }
          else { g.fillRect(x - 2, y0 - bh - 8, 4, bh + 8); g.fillRect(x - 9, y0 - bh, 18, 4); }
        }
        g.strokeStyle = '#050505';
        for (const tx of [150, 520, 860]) {
          g.lineWidth = 7; g.beginPath(); g.moveTo(tx, h * 0.74); g.lineTo(tx + 6, h * 0.3); g.stroke();
          g.lineWidth = 3; for (let b = 0; b < 6; b++) { const y = h * (0.35 + b * 0.06), d = (b & 1 ? 1 : -1) * (30 + rnd() * 30); g.beginPath(); g.moveTo(tx + 5, y); g.quadraticCurveTo(tx + d * 0.5, y - 20, tx + d, y - 30 - rnd() * 20); g.stroke(); }
        }
      });
      const dec = new THREE.MeshBasicMaterial({ map: gy, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      for (const sx of [-1, 1]) {
        // the lower flank quad (4-6-10-8), a hair outside it, mapped by z / y
        const q = [v[sx < 0 ? 4 : 5], v[sx < 0 ? 6 : 7], v[sx < 0 ? 10 : 11], v[sx < 0 ? 8 : 9]].map((p) => [p[0] + sx * 0.004, p[1], p[2]]);
        const pos = [], uv = [];
        for (const t of [[0, 1, 2], [0, 2, 3]]) for (const i of t) { pos.push(...q[i]); uv.push((q[i][2] + 1.5) / 3.3, (q[i][1] - 0.1) / 0.62); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const m = add(body, g, dec, 0, 0, 0, 0, 0, 0, false); m.renderOrder = 2;
      }
      // neon on every edge: a bright core and a soft additive halo (the paint colour)
      M.halo = new THREE.MeshBasicMaterial({ color: paintHex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      const E = new Set(); for (const f of F) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; E.add(a < b ? a + '-' + b : b + '-' + a); }
      for (const e of E) {
        const [a, b] = e.split('-').map(Number);
        if ((a >= 8 && b >= 8) || (a === 3 && b >= 10)) continue;           // (not along the floor)
        const A = V3(...v[a]), Bv = V3(...v[b]);
        tubeAB(body, A, Bv, 0.012, M.paint, 6).castShadow = false;
        const h = tubeAB(body, A, Bv, 0.045, M.halo, 8); h.castShadow = false; h.renderOrder = 3;
      }
      // inside: the cart frame, a bench for two, the wheel on the left
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.42, 0.3, -1.6), V3(sx * 0.42, 0.3, 1.7), 0.03, M.black);
      add(body, rbox(1.0, 0.1, 0.45, 0.04), M.seat, 0, 0.5, 0.35); add(body, rbox(1.0, 0.5, 0.1, 0.04), M.seat, 0, 0.78, 0.6, 0.2, 0, 0);
      add(body, rbox(0.9, 0.1, 0.25, 0.03), M.black, 0, 0.7, -0.62, -0.4, 0, 0);
      SW = steering(V3(-0.26, 0.8, -0.35), 0.7, 0.16);
      cluster = { parent: body, pos: V3(-0.26, 0.74, -0.62), rot: -0.9, w: 0.14, h: 0.07 };
      for (const sx of [-1, 1]) { const t = add(body, rbox(0.14, 0.03, 0.02, 0.01), M.tail, sx * 0.1, 0.86, 2.33); t.castShadow = false; add(body, rbox(0.16, 0.02, 0.02, 0.01), M.head, sx * 0.14, 0.47, -2.2); }
      spots(0.14, 0.47, -2.3);
      P.tips.push(toRoot(V3(0, 0.3, 2.3)));
      driver = person({ hip: V3(-0.26, 0.56, 0.36), lean: 0.22, hands: [V3(-0.38, 0.82, -0.33), V3(-0.14, 0.82, -0.33)],
        knee: { dx: 0.11, y: 0.66, z: -0.18 }, foot: { dx: 0.14, y: 0.24, z: -0.66 }, helmet: false });
    };

    (B[CAR] || B.couch)();
    model.add(driver);
    const eye = driver.userData.eye;

    // ---------------------------------------------------------------- the display on the dash
    if (cluster) add(cluster.parent, new THREE.PlaneGeometry(cluster.w, cluster.h), M_cluster, cluster.pos.x, cluster.pos.y, cluster.pos.z + 0.002, cluster.rot, 0, 0, false);
    const EV = CAR === 'mini' || CAR === 'scooter' || CAR === 'razor';

    // ---------------------------------------------------------------- wheels
    function carcass(R, W, rim) {
      const h = W / 2, c = R - 0.004, sh = Math.min(0.05, W * 0.2);
      return latheX([[rim, -h + 0.01], [rim + 0.015, -h], [rim + (R - rim) * 0.6, -h + 0.002], [c - sh * 0.5, -h + sh * 0.16], [c - sh * 0.12, -h + sh * 0.56], [c, -h + sh],
        [c, h - sh], [c - sh * 0.12, h - sh * 0.56], [c - sh * 0.5, h - sh * 0.16], [rim + (R - rim) * 0.6, h - 0.002], [rim + 0.015, h], [rim, h - 0.01]], 48);
    }
    function tread(R, W, kind) {
      if (kind === 'slick' || kind === 'road') return null;     // (road tyres read best smooth - sipes showed as saw teeth)
      const list = [], h = W / 2, c = R - 0.004;
      if (kind === 'knob') {
        const N = Math.round(2 * Math.PI * c / 0.05);
        for (let k = 0; k < N; k++) for (const f of (k & 1 ? [-0.55, 0.55] : [-0.85, 0, 0.85])) { const b = new THREE.BoxGeometry(W * 0.24, 0.018, 0.03); b.translate(f * h, c + 0.007, 0); b.rotateX(k * 2 * Math.PI / N); list.push(b); }
      } else {
        const N = Math.round(2 * Math.PI * c / 0.035);
        for (let k = 0; k < N; k++) for (const f of (k & 1 ? [-0.5, 0.5] : [-0.8, 0, 0.8])) { const b = new THREE.BoxGeometry(W * 0.2, 0.006, 0.018); b.translate(f * h, c + 0.002, 0); b.rotateX(k * 2 * Math.PI / N); list.push(b); }
      }
      return mergeGeos(list);
    }
    const RIM = {
      steel: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.45, metalness: 0.6 }),
      steel5: new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.35, metalness: 0.7 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xd4884c, roughness: 0.25, metalness: 0.9 }),
      disc: new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide }),
      deepdish: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.3, metalness: 0.6 }),
      alloy5: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.22, metalness: 0.9 }),
      hub: new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.4, metalness: 0.6 }),
      cart: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.85 }),
    };
    function rim(g, R, W, rimR, style) {
      const mat = RIM[style] || RIM.steel;
      const barrel = new THREE.CylinderGeometry(rimR, rimR, W * 0.92, 32, 1, true); barrel.rotateZ(Math.PI / 2); add(g, barrel, style === 'deepdish' ? M.black : mat, 0, 0, 0);
      const fx = W * 0.3;
      if (style === 'disc') {
        // a flat white disc, domed a little, with a small hubcap
        add(g, latheX([[0.001, fx + 0.03], [rimR * 0.4, fx + 0.025], [rimR * 0.95, fx + 0.004], [rimR, fx]], 36), mat, 0, 0, 0);
        add(g, cylX(0.05, 0.06, 0.04, 20), M.chrome, fx + 0.04, 0, 0);
        return;
      }
      if (style === 'copper') {
        add(g, cylX(rimR * 0.98, rimR * 0.98, 0.012, 32), mat, fx - 0.03, 0, 0);
        add(g, new THREE.TorusGeometry(rimR * 0.98, 0.012, 8, 36), mat, fx, 0, 0, 0, Math.PI / 2, 0);
        add(g, cylX(rimR * 0.55, rimR * 0.6, 0.03, 28), mat, fx - 0.01, 0, 0);
        add(g, cylX(0.04, 0.05, 0.05, 16), mat, fx + 0.01, 0, 0);
        return;
      }
      if (style === 'deepdish') {
        // a polished lip, then black spokes set deep, and the centre cap
        add(g, new THREE.TorusGeometry(rimR, 0.018, 10, 44), M.chrome, fx + 0.02, 0, 0, 0, Math.PI / 2, 0);
        add(g, latheX([[rimR, fx + 0.02], [rimR * 0.9, fx - 0.04], [rimR * 0.86, fx - 0.08]], 44), M.chromeD || (M.chromeD = Object.assign(M.chrome.clone(), { side: THREE.DoubleSide })), 0, 0, 0);
        for (let k = 0; k < 10; k++) { const s = add(g, new THREE.BoxGeometry(0.02, rimR * 0.86, 0.022), mat, fx - 0.08, 0, 0); s.rotation.x = k * Math.PI / 5; s.geometry.translate(0, rimR * 0.43, 0); }
        add(g, cylX(0.05, 0.06, 0.05, 20), mat, fx - 0.06, 0, 0);
        return;
      }
      add(g, cylX(rimR, rimR, 0.012, 32), style === 'steel' ? RIM.steel : M.black, fx - 0.02, 0, 0);
      const nSp = style === 'alloy5' || style === 'steel5' ? 5 : style === 'cart' ? 8 : style === 'hub' ? 6 : 0;
      for (let k = 0; k < nSp; k++) { const s = add(g, new THREE.BoxGeometry(0.014, rimR * 0.9, style === 'alloy5' ? rimR * 0.34 : rimR * 0.2), mat, fx - 0.005, 0, 0); s.rotation.x = k * 2 * Math.PI / nSp; s.geometry.translate(0, rimR * 0.45, 0); }
      add(g, new THREE.TorusGeometry(rimR * 0.99, 0.008, 6, 36), mat, fx - 0.005, 0, 0, 0, Math.PI / 2, 0);
      add(g, cylX(rimR * 0.28, rimR * 0.3, 0.035, 20), style === 'steel' ? M.chrome : mat, fx + 0.005, 0, 0);
    }
    const geo = {};
    for (const front of [true, false]) {
      const R = front ? RF : RR, W = front ? WF : WR, rimR = Math.min(R - 0.03, (!front && wheelStyle.rimRR) || wheelStyle.rimR || R * 0.6);
      geo[front] = { R, W, rimR, carc: carcass(R, W, rimR), tr: tread(R, W, wheelStyle.tread), kn: tread(R + 0.01, W, 'knob') };
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
      const stock = G.tr ? [add(spin, G.tr, M.rubber, 0, 0, 0)] : [];
      const pkg = [add(spin, G.kn, M.rubber, 0, 0, 0)]; pkg[0].visible = false;
      rim(spin, G.R, G.W, G.rimR, wheelStyle.rim);
      if (frontW) add(flip, cylX(0.02, 0.02, 0.08, 8), M.steel, -G.W / 2 - 0.03, 0, 0);
      wheels.push({ corner, flip, spin, left, front: frontW, side, stock, pkg });
    }
    // the Blue Bird ran twin wheels at the back: a second one inboard of each rear
    if (CAR === 'bluebird') for (const w of wheels) if (!w.front) {
      const s2 = new THREE.Group(); s2.position.x = -0.2; w.spin.add(s2);
      add(s2, geo[false].carc, M.rubber, 0, 0, 0); rim(s2, geo[false].R, geo[false].W, geo[false].rimR, 'disc');
    }

    // ---------------------------------------------------------------- the display
    const cgx = clusterCanvas.getContext('2d');
    function drawCluster(t) {
      const g = cgx, w = 512, h = 256;
      g.fillStyle = '#07090b'; g.fillRect(0, 0, w, h);
      const r = clamp(t.rpm / (t.redline || 7000), 0, 1.1);
      for (let k = 0; k < 10; k++) { g.fillStyle = r > (EV ? k * 0.1 : 0.55 + k * 0.045) ? (EV ? '#35c6ff' : k < 5 ? '#29ff5a' : k < 8 ? '#ffd21a' : '#ff2a1a') : '#1b1f22'; g.fillRect(16 + k * 48, 12, 40, 22); }
      g.fillStyle = '#e8f0f4'; g.font = 'bold 120px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(String(Math.round(t.speedMph)), 16, 128);
      g.font = 'bold 36px Arial'; g.fillStyle = '#8fb2c6'; g.fillText('MPH', 20, 214);
      g.fillStyle = '#ffffff'; g.font = 'bold 90px Arial'; g.textAlign = 'right'; g.fillText(t.gear.replace(/^[DM](?=\d)/, '') || 'D', 496, 140);
      g.font = 'bold 30px Arial'; g.fillStyle = '#8fb2c6'; g.fillText(EV ? Math.round(clamp(t.rpm / (t.redline || 1), 0, 1) * 100) + '% MOTOR' : Math.round(t.rpm) + ' RPM', 496, 214);
      clusterTex.needsUpdate = true;
    }
    function drawScreen() {}
    function setPaint(name) {
      const c = PAINTS[name]; if (c === undefined) return;
      if (CAR === 'razor') { M.paint.emissive.setHex(c); M.halo.color.setHex(c); } else M.paint.color.setHex(c);
    }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 4 : (o.headlights ? 1.4 : 0.4);
      M.head.emissiveIntensity = o.headlights ? 3.5 : 0; M.amber.emissiveIntensity = o.headlights ? 1.2 : 0.25;
      for (const s of P.spots) { s.visible = !!o.headlights; s.intensity = o.headlights ? 220 : 0; }
    }
    // cockpit view: the driver goes (the camera sits in their head) and the glass clears, as it does from inside
    function setInteriorVisible(v, cockpit) {
      driver.visible = !cockpit;
      M.tint.opacity = cockpit ? 0.14 : 0.62; M.glass.opacity = cockpit ? 0.1 : 0.32;
      if (M.smoke) M.smoke.opacity = cockpit ? 0.3 : 0.8;
    }
    function setTransmission() {}
    function setTires(front, rear) {
      for (const w of wheels) {
        const on = (w.front ? front : rear) === 'ccKnob' || (w.front ? front : rear) === 'offroad';
        for (const m of w.stock) m.visible = !on; for (const m of w.pkg) m.visible = on;
      }
    }
    function setChute() {}

    rootG.traverse((o) => { if (o.isMesh && o.material && (o.material.transparent || (Array.isArray(o.material) && false))) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel: SW.sw, eye: toRoot(eye),
      exhaustTips: P.tips, materials: M, headlights: P.spots, tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, variant: 'cc', cls: CAR,
    };
  }

  root.HCCrushers = { build };
})(typeof self !== 'undefined' ? self : this);
