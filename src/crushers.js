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
   Nissan GTR     an R35 in a Liberty Walk widebody, slammed: riveted overfenders, a carbon hood with vents, swept LED
                  headlamps, a big grille over a carbon splitter and canards, a ducktail and GT wing, the four ring tail
                  lamps, black concave wheels round big brakes, red buckets
   Mini Dookie    a tall one-seat city pod: glass front, glass roof, an orange seat, 5-spoke wheels
   Porta Potty    a blue portable toilet with a white roof on a kart frame, the door swung open, the driver on the throne
   Turbo Scooter  a red four-wheel mobility scooter: the basket, the tiller with its mirrors, the high-back seat
   Razors Edge    a long faceted wedge of black glass edged in neon (the paint colour) - a knife-edge prow, the long
                  diagonal crease, a flat roof - a graveyard on its flanks, a golf cart's frame and seats inside
   (engines: the Mini's TwinAir shows its exhaust and intake vents, the scooter's turbo Hayabusa sits bare where the rear
   shell was, the Razors Edge's LS V8 is behind the bench under the glass)
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const CAR = opts.car || 'couch', ENGINE = opts.engine || 'ev';   // (the electric cars' petrol alternatives)
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
        if (m < 0) continue;
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
    // 9-10 shoulder, 11-14 greenhouse, 15-16 roof). Or o.section(z): the right half's points at z, any number (the same
    // at every station), bands numbered by them
    function carBody(o) {
      const secs = o.stations.map((z) => {
        if (o.section) return { z, P: o.section(z) };
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
    const DEF_PAINT = { golf: 0xeeeeea, rally: 0x1e6fc4, couch: 0x7b4a2b, eggrod: 0xe6e6e3, banana: 0xf2c21b, bluebird: 0x2f6fd0, gtr: 0xb3121a, mini: 0xc6cf2e, potty: 0x3d7cc9, scooter: 0xb01020, razor: 0xf2570f }[CAR];
    const paintHex = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : DEF_PAINT;
    const M = {};
    M.paint = CAR === 'bluebird' ? new THREE.MeshPhysicalMaterial({ color: paintHex, roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.25, envMapIntensity: 0.6 })
      : CAR === 'couch' ? new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.62, metalness: 0.02 })
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
    const SUITS = { golf: 0x2d5a3a, rally: 0x1b2f63, couch: 0x2b4a7a, eggrod: 0xe8e8e8, banana: 0x2a6a3a, bluebird: 0xe8e2d0, gtr: 0x222326, mini: 0x5a3d8a, potty: 0x3b6e2e, scooter: 0x3a2a22, razor: 0x1a1a1c };
    M.suit = new THREE.MeshStandardMaterial({ color: SUITS[CAR] || 0x333333, roughness: 0.8 });
    M.pants = new THREE.MeshStandardMaterial({ color: CAR === 'bluebird' || CAR === 'eggrod' || CAR === 'gtr' ? SUITS[CAR] : 0x2a3446, roughness: 0.85 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: { rally: 0xf2f2f2, golf: 0xd22020, couch: 0xf2c417, eggrod: 0x6fb6e8, bluebird: 0x5a3a22, scooter: 0x141416, potty: 0xf2f2f2, banana: 0xf2c21b }[CAR] || 0xf2f2f2, roughness: CAR === 'bluebird' ? 0.7 : 0.25, clearcoat: CAR === 'bluebird' ? 0 : 1 });

    const P = { tips: [], spots: [], hideCockpit: [], lampSlots: [] };
    let jetFan = null, jetFx = null, jetSize = null, jetSz = 1;   // (the jet golf cart's compressor face, exhaust and size)
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
      // (the body's surface: its section at z, a point on it at ring position k, its half-width at height y)
      const bbAt = (z) => { let i = 1; while (i < S.length - 1 && S[i][0] < z) i++; const a = S[i - 1], b = S[i], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; };
      const ringPt = (z, k) => {
        const [w, yb, yt] = bbAt(z), a = -Math.PI / 2 + k / 40 * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a), e = 2 / 2.6;
        const sx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
        return V3(w * (sy > 0 ? 1 - 0.18 * sy : 1) * sx, (yb + yt) / 2 + (yt - yb) / 2 * sy, z);
      };
      const bbX = (z, y) => { const [w, yb, yt] = bbAt(z), yc = (yb + yt) / 2, hh = (yt - yb) / 2, sy = clamp((y - yc) / hh, -0.999, 0.999), sn = Math.pow(Math.abs(sy), 1.3);
        return w * (sy > 0 ? 1 - 0.18 * sy : 1) * Math.pow(Math.sqrt(1 - sn * sn), 2 / 2.6); };
      // (on the body at (z, y), a small part facing out along the surface: its position and outward normal)
      const onSkin = (sx, z, y) => { const x = bbX(z, y), dxdy = (bbX(z, y + 0.01) - bbX(z, y - 0.01)) / 0.02, nn = V3(sx, -dxdy, 0).normalize(); return { p: V3(sx * x, y, z), n: nn }; };
      // the cockpit is a real opening in the skin (ring bands 17-22 between the stations at 0.8 and 1.6 m)
      const CK0 = 0.8, CK1 = 1.6;
      add(body, loft(S.map(([z, w, yb, yt]) => ({ z, w, yb, yt, n: 2.6, tw: 0.82 })), { seg: 40, mat: (x, y, z, k) => (k >= 17 && k <= 22 && z > CK0 && z < CK1 ? -1 : 0) }), M.paint, 0, 0, 0);
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
        // the four small ports high on each flank, flush with the skin, and the chrome strip lower down
        for (let k = 0; k < 4; k++) {
          const q = onSkin(sx, 0.05 + k * 0.12, 0.98), d = add(body, new THREE.CircleGeometry(0.026, 16), M.black, q.p.x + q.n.x * 0.002, q.p.y + q.n.y * 0.002, q.p.z, 0, 0, 0, false);
          d.quaternion.setFromUnitVectors(V3(0, 0, 1), q.n);
        }
        add(body, new THREE.BoxGeometry(0.012, 0.02, 1.6), M.chrome, sx * (bbX(0.2, 0.72) + 0.004), 0.72, 0.2);
        // the V12's exhaust stubs: a row of short pipes out of each side of the bonnet, raked back
        for (let k = 0; k < 6; k++) {
          const z = -3.0 + k * 0.24, q = onSkin(sx, z, 0.9), dir = q.n.clone().add(V3(0, 0.15, 0.55)).normalize();
          const a = q.p.clone().addScaledVector(q.n, -0.02), b = q.p.clone().addScaledVector(dir, 0.07);
          tubeAB(body, a, b, 0.022, M.steel, 10);
          P.tips.push(toRoot(b));
        }
      }
      // the nose intake
      add(body, new THREE.CircleGeometry(0.22, 28), M.black, 0, 0.66, -4.33, 0, Math.PI, 0, false).scale.set(0.9, 1.25, 1);
      // tail fin
      const fin = profile([[3.0, 1.05], [3.4, 1.35], [4.15, 1.85], [4.4, 1.85], [4.42, 0.9], [3.0, 1.0]], 0.06, 0.02);
      add(body, fin, M.paint, 0, 0, 0);
      // the cockpit: a padded leather roll round the opening, a tub inside it (walls, floor, a leather seat), the dash with
      // its dials, a wood-rimmed wheel and a little aero screen in front
      M.leather = new THREE.MeshStandardMaterial({ color: 0x5a3219, roughness: 0.65 });
      M.tub = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.9, side: THREE.DoubleSide });
      {
        const edge = [];
        for (let k = 17; k <= 23; k++) edge.push(ringPt(CK0, k));
        for (let k = 23; k >= 17; k--) edge.push(ringPt(CK1, k));
        const roll = new THREE.CatmullRomCurve3(edge.map((v) => v.clone().add(V3(0, 0.012, 0))), true, 'centripetal');
        add(body, new THREE.TubeGeometry(roll, 90, 0.024, 10, true), M.leather, 0, 0, 0);
        const floorY = 0.4, xR = ringPt(CK0, 17).x, xR1 = ringPt(CK1, 17).x;
        // side walls (their tops on the opening's edges), the front and back walls following the body's crown, the floor
        for (const sx of [-1, 1]) {
          const a = ringPt(CK0, sx > 0 ? 17 : 23), b = ringPt(CK1, sx > 0 ? 17 : 23);
          add(body, facesGeo([[a.x, floorY, CK0], [b.x, floorY, CK1], [b.x, b.y, CK1], [a.x, a.y, CK0]], [[0, 1, 2, 3]]), M.tub, 0, 0, 0, 0, 0, 0, false);
        }
        for (const z of [CK0, CK1]) {
          const top = []; for (let k = 17; k <= 23; k++) { const q = ringPt(z, k); top.push([q.x, q.y, z]); }
          const v = [[top[0][0], floorY, z]].concat(top).concat([[top[top.length - 1][0], floorY, z]]);
          add(body, facesGeo(v, [v.map((_, i) => i)]), M.tub, 0, 0, 0, 0, 0, 0, false);
        }
        add(body, facesGeo([[-xR, floorY, CK0], [xR, floorY, CK0], [xR1, floorY, CK1], [-xR1, floorY, CK1]], [[0, 1, 2, 3]]), M.tub, 0, 0, 0, 0, 0, 0, false);
        add(body, rbox(0.44, 0.1, 0.4, 0.04), M.leather, 0, 0.5, 1.36);
        add(body, rbox(0.44, 0.5, 0.08, 0.04), M.leather, 0, 0.78, 1.55, 0.2, 0, 0);
        // the dash: a black panel across the front wall with two round dials either side of the display
        add(body, rbox(0.5, 0.16, 0.03, 0.02), M.black, 0, 1.02, CK0 + 0.03, -0.2, 0, 0);
        for (const sx of [-1, 1]) {
          add(body, new THREE.TorusGeometry(0.036, 0.007, 8, 24), M.chrome, sx * 0.17, 1.03, CK0 + 0.05, -0.2, 0, 0);
          add(body, new THREE.CircleGeometry(0.034, 24), M.white, sx * 0.17, 1.03, CK0 + 0.047, -0.2, 0, 0, false);
        }
      }
      // (an aero screen: low, so the driver looks over it, not through a frame at eye level)
      const ws = add(body, new THREE.PlaneGeometry(0.46, 0.13), M.glass, 0, 1.235, CK0 - 0.02, -0.4, 0, 0, false); ws.castShadow = false;
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.23, 1.16, CK0 - 0.045), V3(sx * 0.23, 1.29, CK0 + 0.005), 0.007, M.chrome);
      add(body, loft([{ z: 1.62, w: 0.05, yb: 1.12, yt: 1.2 }, { z: 1.7, w: 0.15, yb: 1.1, yt: 1.36 }, { z: 1.95, w: 0.15, yb: 1.08, yt: 1.34 }, { z: 2.6, w: 0.08, yb: 1.04, yt: 1.12 }, { z: 3.0, w: 0.02, yb: 1.0, yt: 1.02 }].map((q) => Object.assign(q, { n: 2.2 })), { seg: 24 }), M.paint, 0, 0, 0);   // headrest fairing
      SW = steering(V3(0, 1.02, 0.98), 0.45, 0.17, 'wood');
      tubeAB(body, V3(0, 0.96, CK0 + 0.03), V3(0, 1.0, 0.95), 0.016, M.black);
      cluster = { parent: body, pos: V3(0, 1.03, CK0 + 0.05), rot: -0.2, w: 0.14, h: 0.07 };
      driver = person({ hip: V3(0, 0.6, 1.3), lean: 0.22, hands: [V3(-0.14, 1.06, 1.0), V3(0.14, 1.06, 1.0)],
        knee: { dx: 0.11, y: 0.72, z: 0.85 }, foot: { dx: 0.14, y: 0.42, z: 0.35 }, goggles: true });
    };

    // ---------------------------------------------------------------- Nissan GTR (Liberty Walk)
    // The R35 in the LB widebody, slammed on air: a real cross-section (carbon side skirts, the door crease, the front
    // fenders peaking either side of a carbon hood, the glasshouse with its shark-fin C-pillar), riveted overfenders
    // hugging the tyres, swept LED headlamps laid on the fender corners, a big grille and intakes over a carbon splitter
    // with canards, hood and fender vents, a ducktail, a GT wing on swan-neck uprights, the four ring tail lamps over
    // a diffuser and quad titanium tips; black concave wheels round big brakes; red buckets inside
    B.gtr = () => {
      WF = 0.285; WR = 0.315;
      wheelStyle = { rim: 'lb', rimR: 0.254, tread: 'road' };
      // carbon twill (the weave shows up close, a deep glossy grey further off)
      const weave = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#08090a'; g.fillRect(0, 0, w, h);
        const n = 16, c = w / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const d = ((i + j) >> 1) & 1, gr = d ? g.createLinearGradient(i * c, 0, (i + 1) * c, 0) : g.createLinearGradient(0, j * c, 0, (j + 1) * c);
          gr.addColorStop(0, '#08090a'); gr.addColorStop(0.5, '#1d1f23'); gr.addColorStop(1, '#070809');
          g.fillStyle = gr; g.fillRect(i * c + 0.6, j * c + 0.6, c - 1.2, c - 1.2);
        }
      });
      weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
      const weaveP = weave.clone(); weaveP.repeat.set(6, 6); weaveP.needsUpdate = true;
      const cMat = (map) => new THREE.MeshPhysicalMaterial({ map, color: 0xffffff, roughness: 0.4, metalness: 0.25, clearcoat: 0.75, clearcoatRoughness: 0.06, envMapIntensity: 0.5, side: THREE.DoubleSide });
      M.carbon = cMat(weave); M.carbonP = cMat(weaveP);
      M.ti = new THREE.MeshStandardMaterial({ color: 0x8b7b9a, roughness: 0.25, metalness: 1 });
      M.redSeat = new THREE.MeshStandardMaterial({ color: 0xb0141c, roughness: 0.7 });
      // (panels laid on the skin draw in front of it: a depth bias, so the body's facets can't poke through them)
      const onTop = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
      M.lampIn = new THREE.MeshPhysicalMaterial(Object.assign({ color: 0x2a2d33, roughness: 0.12, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide }, onTop));
      M.vent = Object.assign(M.gloss.clone(), onTop);
      M.dchrome = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.18, metalness: 1 });
      M.drl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef4ff, emissiveIntensity: 2, toneMapped: false });
      M.lensR = new THREE.MeshPhysicalMaterial({ color: 0x3a0306, roughness: 0.1, metalness: 0.2, clearcoat: 1 });
      M.paint.side = THREE.DoubleSide;

      const ZW = -0.64, ZRF = -0.02, ZRR = 0.98, ZR = 1.62;   // windscreen base, roof front / rear, rear-window base
      const flare = (z) => { let f = 0; for (const zc of [zF, zR]) { const d = Math.abs(z - zc); if (d < 0.7) f = Math.max(f, 0.085 * Math.pow(1 - (d / 0.7) ** 2, 0.8)); } return f; };
      const Wb0 = tbl([[-2.37, 0.72], [-2.33, 0.82], [-2.24, 0.885], [-2.05, 0.92], [-1.6, 0.935], [0, 0.94], [1.6, 0.95], [2.15, 0.94], [2.3, 0.9], [2.39, 0.8]]);
      const Wz = (z) => Wb0(z) + flare(z);
      const yBz = archY(tbl([[-2.37, 0.16], [-2.26, 0.11], [2.2, 0.11], [2.3, 0.2], [2.39, 0.26]]), [zF, zR], RF, 0.385);
      const yCr = tbl([[-2.37, 0.5], [-2.0, 0.6], [-1.0, 0.63], [0.5, 0.66], [1.4, 0.7], [2.39, 0.66]]);
      const ySh = tbl([[-2.37, 0.6], [-2.25, 0.7], [-2.0, 0.76], [-1.5, 0.8], [-0.8, 0.83], [0.3, 0.85], [1.3, 0.9], [1.8, 0.93], [2.2, 0.92], [2.39, 0.86]]);
      const yBe = tbl([[-2.37, 0.63], [-2.25, 0.74], [-2.0, 0.8], [-1.5, 0.845], [ZW, 0.905], [0.3, 0.91], [1.2, 0.93], [ZR, 0.965], [2.2, 0.97], [2.39, 0.92]]);
      const yTz = tbl([[-2.37, 0.62], [-2.3, 0.66], [-2.1, 0.71], [-1.7, 0.78], [-1.2, 0.845], [ZW, 0.915], [-0.35, 1.08], [ZRF, 1.215], [0.35, 1.265], [0.75, 1.255], [ZRR, 1.2], [1.3, 1.1], [ZR, 1.0], [2.0, 0.99], [2.3, 0.985], [2.39, 0.94]]);
      const Wtz = tbl([[-2.37, 0.3], [-1.5, 0.36], [ZW, 0.45], [ZRF, 0.56], [0.5, 0.6], [ZRR, 0.6], [ZR, 0.56], [2.39, 0.46]]);
      const Wbz = (z) => Wz(z) - flare(z) - (z < ZW ? 0.1 : 0.085);
      // the section at z, right half, 23 points: underbody 0-3, skirt 4-6, the side up to the crease 7-12, shoulder
      // 13-15, 16 the belt (the fender peak over the hood), 17-20 the glass (the hood beyond its shut line), 21-22 roof /
      // hood centre
      const section = (z) => {
        const W = Wz(z), yb = yBz(z), ysh = ySh(z), ybe = Math.max(yBe(z), ysh + 0.01), yt = yTz(z), wt = Wtz(z), wb = Wbz(z);
        const ycr = Math.max(yCr(z), yb + 0.05), ysk = Math.max(yb + 0.03, Math.min(yb + 0.13, ycr - 0.03));
        const dip = z < ZW ? 0.022 * clamp((z + 2.3) / 0.4, 0, 1) * clamp((ZW - z) / 0.2, 0, 1) : 0;
        const P = [[0, yb], [W * 0.55, yb], [W - 0.07, yb], [W - 0.035, yb + 0.012], [W - 0.014, yb + Math.min(0.04, (ysk - yb) * 0.4)], [W - 0.008, ysk], [W - 0.032, ysk + 0.008]];
        for (let k = 1; k <= 4; k++) { const t = k / 5; P.push([W - 0.032 * (1 - t) + 0.018 * Math.sin(Math.PI * t), ysk + 0.008 + (ycr - ysk - 0.008) * t]); }
        P.push([W, ycr], [W + 0.005, ycr + 0.006], [W - 0.01, ycr + (ysh - ycr) * 0.5], [W - 0.028, ysh], [W - 0.055, ysh + 0.01]);
        P.push([wb, ybe]);
        for (let k = 1; k <= 4; k++) { const t = k / 4; P.push([wb + (wt - wb) * Math.pow(t, 0.9), ybe + (yt - 0.02 - ybe) * (1 - Math.pow(1 - t, 1.6)) - dip * Math.sin(Math.PI * Math.min(1, t * 1.4))]); }
        P.push([wt * 0.55, yt - 0.004], [0, yt]);
        return P;
      };
      const arch = (z) => Math.abs(z - zF) < 0.4 || Math.abs(z - zR) < 0.4;
      const ST = stationsOf(-2.37, 2.39, 0.05, [ZW, ZRF, ZRR, ZR, 1.08, 1.22, 1.32, zF - 0.4, zF + 0.4, zR - 0.4, zR + 0.4, -2.2, 2.25]);
      const g = carBody({
        stations: ST,
        section,
        mat: (b, z) => {
          if (b <= 3) return 2;                                                           // underbody
          if (b <= 5) return !arch(z) ? 3 : 2;                                            // carbon side skirts
          if (b <= 15) return 0;                                                          // the painted sides
          if (z < ZW) return b >= 17 ? 3 : 0;                                             // the carbon hood between the fender peaks
          if (z > ZR) return 0;                                                           // the deck
          if (b === 19) return 0;                                                         // A-pillar / roof rail / C-pillar, body colour
          if (b >= 20) return z < ZRF || z > ZRR ? 1 : 0;                                 // windscreen, roof, rear window
          if (z > ZRR && z > (b === 16 ? 1.32 : b === 17 ? 1.22 : 1.08)) return 0;        // the shark-fin C-pillar
          return 1;                                                                       // the side glass (B-pillar blacked out behind it)
        },
      });
      // (UVs for the carbon weave: along the car, and across it / up it)
      { const p = g.attributes.position, uv = new Float32Array(p.count * 2);
        for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i) * 6.25; uv[i * 2 + 1] = (Math.abs(p.getX(i)) + p.getY(i)) * 6.25; }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
      add(body, g, [M.paint, M.tint, M.black, M.carbon], 0, 0, 0);
      // a point on the skin at (z, t: position round the section) on side sx, and the outward normal there. On the mesh,
      // not the ideal surface: straight between the stations, as the body's panels are (laid on the ideal curve, the
      // headlamps sank under the facets between stations and the paint and carbon showed through them in patches)
      const surf0 = (z, t, sx) => { const P = section(z), i = Math.max(0, Math.min(P.length - 2, Math.floor(t))), f = t - i; return V3(sx * (P[i][0] + (P[i + 1][0] - P[i][0]) * f), P[i][1] + (P[i + 1][1] - P[i][1]) * f, z); };
      const surf = (z, t, sx) => {
        let k = 1; while (k < ST.length - 1 && ST[k] < z) k++;
        const za = ST[k - 1], zb = ST[k], f = clamp((z - za) / (zb - za), 0, 1);
        return surf0(za, t, sx).lerp(surf0(zb, t, sx), f).setZ(z);
      };
      // (outward from the way the points run round the section - right side: up the flank and in over the top; a guess
      // from the centre got the inner face of the fender peak backwards and sank the lamps' upper edge into the body)
      const surfN = (z, t, sx) => {
        const p = surf0(z, t, sx), dz = surf0(z + 0.01, t, sx).sub(p), dt = surf0(z, t + 0.05, sx).sub(p);
        return (sx > 0 ? new THREE.Vector3().crossVectors(dt, dz) : new THREE.Vector3().crossVectors(dz, dt)).normalize();
      };
      // a panel laid on the skin (a lamp, a vent): z0..z1, and between tA(z) and tB(z) round the section
      const patch = (sx, z0, z1, tA, tB, off, mat, nz, nt) => {
        nz = nz || 18; nt = nt || 6;
        const pos = [], idx = [];
        // (rows on every station inside it too, so it follows the panels' kinks)
        const zs = [...new Set([...Array.from({ length: nz + 1 }, (_, i) => z0 + (z1 - z0) * i / nz), ...ST.filter((z) => z > z0 && z < z1)])].sort((p, q) => p - q);
        nz = zs.length - 1;
        for (let i = 0; i <= nz; i++) {
          const z = zs[i], a = tA(z), b = tB(z);
          for (let j = 0; j <= nt; j++) { const t = a + (b - a) * j / nt, p = surf(z, t, sx).addScaledVector(surfN(z, t, sx), off); pos.push(p.x, p.y, p.z); }
        }
        for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) { const a = i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setIndex(idx); pg.computeVertexNormals();
        return add(body, pg, mat, 0, 0, 0, 0, 0, 0, false);
      };
      // wheel-arch liners: black, so the arches read as holes, not the inside of the paint
      for (const [z, r] of [[zF, RF], [zR, RR]]) for (const sx of [-1, 1]) {
        const lg = new THREE.CylinderGeometry(0.39, 0.39, 0.4, 28, 1, true, 0, Math.PI); lg.rotateZ(Math.PI / 2);
        add(body, lg, M.black, sx * (Wz(z) - 0.24), r, z, 0, 0, 0, false).material = M.linerB || (M.linerB = Object.assign(M.black.clone(), { side: THREE.DoubleSide }));
      }
      // Liberty Walk overfenders: the lip round every arch, riveted on
      for (const sx of [-1, 1]) for (const [z, r] of [[zF, RF], [zR, RR]]) {
        const xo = Wz(z);
        add(body, arcGeo(z, r, 0.383, 0.4, 0.06, Math.PI - 0.06, 0.05), M.paint, sx > 0 ? xo - 0.043 : -xo - 0.007, 0, 0);
        for (let k = 0; k < 11; k++) { const a = 0.18 + k * (Math.PI - 0.36) / 10; add(body, new THREE.SphereGeometry(0.0085, 8, 6), M.chrome, sx * (xo + 0.009), r + Math.sin(a) * 0.392, z + Math.cos(a) * 0.392); }
      }
      // headlamps: laid on each front corner, wide at the nose and sweeping back to a point along the fender; a dark
      // chrome housing, three projectors and the LED strip along the bottom edge
      for (const sx of [-1, 1]) {
        const s = (z) => Math.pow(clamp((z + 2.35) / 0.56, 0, 1), 1.25);
        const lo = (z) => 12.2 + 3.4 * s(z), hi = (z) => 17.3 - 1.25 * s(z);
        patch(sx, -2.352, -1.79, lo, hi, 0.005, M.lampIn, 22, 8);
        const pts = []; for (let i = 0; i <= 14; i++) { const z = -2.34 + i * 0.5 / 14; pts.push(surf(z, lo(z) + 0.35, sx).addScaledVector(surfN(z, lo(z) + 0.35, sx), 0.012)); }
        add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0055, 6, false), M.drl, 0, 0, 0, 0, 0, 0, false);
        const hook = [surf(-2.34, lo(-2.34) + 0.35, sx), surf(-2.348, 13.6, sx), surf(-2.345, 15.2, sx)].map((p, i) => p.addScaledVector(V3(0, 0, -1), 0.009));
        add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hook), 16, 0.0055, 6, false), M.drl, 0, 0, 0, 0, 0, 0, false);
        for (const [z, t] of [[-2.27, 15.4], [-2.17, 15.8], [-2.07, 16.05]]) {
          const p = surf(z, t, sx), n = surfN(z, t, sx);
          const ring = add(body, new THREE.TorusGeometry(0.026, 0.005, 8, 20), M.chrome, p.x + n.x * 0.014, p.y + n.y * 0.014, p.z + n.z * 0.014, 0, 0, 0, false);
          const l = add(body, new THREE.CircleGeometry(0.024, 18), M.head, p.x + n.x * 0.016, p.y + n.y * 0.016, p.z + n.z * 0.016, 0, 0, 0, false);
          for (const o of [ring, l]) o.quaternion.setFromUnitVectors(V3(0, 0, 1), n);
        }
        // the carbon hood's vents, and the fender vent behind each front wheel
        patch(sx, -1.95, -1.52, () => 18.3, () => 19.7, 0.005, M.vent, 8, 4);
        for (let k = 1; k < 5; k++) { const z = -1.95 + k * 0.086, a = surf(z, 18.35, sx), b = surf(z, 19.65, sx), n = surfN(z, 19, sx); tubeAB(body, a.addScaledVector(n, 0.008), b.addScaledVector(n, 0.008), 0.005, M.carbonP, 6); }
        patch(sx, -0.98, -0.66, () => 11.3, () => 13.4, 0.005, M.vent, 8, 4);
        const bl = [surf(-0.98, 12.35, sx), surf(-0.66, 12.35, sx)].map((p) => p.addScaledVector(surfN(-0.8, 12.35, sx), 0.01));
        tubeAB(body, bl[0], bl[1], 0.006, M.chrome, 8);
        // mirrors on stalks, body colour
        tubeAB(body, V3(sx * 0.84, 0.93, -0.42), V3(sx * 0.92, 0.97, -0.45), 0.012, M.black);
        const mr = add(body, rbox(0.1, 0.075, 0.16, 0.03), M.paint, sx * 0.95, 0.975, -0.47, 0, sx * -0.12, 0);
        add(mr, new THREE.PlaneGeometry(0.085, 0.06), M.chrome, sx * -0.0, 0, 0.081, 0, 0, 0, false);
      }
      spots(0.66, 0.72, -2.22);
      // the nose: the big grille in a dark-chrome surround, the lower intakes, the carbon splitter and canards
      const onNose = (pts, mat, dz) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]); return add(body, new THREE.ShapeGeometry(sh), mat, 0, 0, -2.372 - (dz || 0), 0, Math.PI, 0, false); };
      const grille = [[-0.36, 0.56], [0.36, 0.56], [0.28, 0.33], [-0.28, 0.33]];
      onNose(grille, M.mesh);
      { const q = grille.concat([grille[0]]).map(([x, y]) => V3(x, y, -2.375)); for (let i = 0; i < 4; i++) tubeAB(body, q[i], q[i + 1], 0.008, M.dchrome, 8); }
      for (const sx of [-1, 1]) {
        onNose([[sx * 0.42, 0.44], [sx * 0.7, 0.4], [sx * 0.68, 0.2], [sx * 0.4, 0.22]], M.mesh);
        for (const [z, y] of [[-2.27, 0.28], [-2.21, 0.37]]) { const cn = add(body, rbox(0.13, 0.012, 0.15, 0.004), M.carbonP, sx * (Wb0(z) + 0.035), y, z, 0.1, sx * -0.5, sx * -0.16); cn.castShadow = false; }
      }
      onNose([[-0.3, 0.26], [0.3, 0.26], [0.26, 0.17], [-0.26, 0.17]], M.mesh);
      { const sp = new THREE.Shape(); sp.moveTo(-0.93, 0); sp.lineTo(0.93, 0); sp.lineTo(0.95, -0.1); sp.quadraticCurveTo(0.9, -0.2, 0.7, -0.22); sp.lineTo(-0.7, -0.22); sp.quadraticCurveTo(-0.9, -0.2, -0.95, -0.1); sp.lineTo(-0.93, 0);
        const sg = new THREE.ExtrudeGeometry(sp, { depth: 0.018, bevelEnabled: false }); sg.rotateX(Math.PI / 2); sg.translate(0, 0.12, -2.3);
        add(body, sg, M.carbonP, 0, 0, 0);
        for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.5, 0.12, -2.46), V3(sx * 0.5, 0.2, -2.36), 0.006, M.steel, 6); }
      // the tail: ring lamps, the black lower valance and diffuser, the plate, quad titanium tips
      for (const sx of [-1, 1]) for (const x of [0.33, 0.6]) {
        add(body, new THREE.TorusGeometry(0.07, 0.013, 10, 32), M.tail, sx * x, 0.83, 2.394, 0, 0, 0, false);
        add(body, new THREE.CircleGeometry(0.058, 28), M.lensR, sx * x, 0.83, 2.393, 0, 0, 0, false);
        add(body, new THREE.TorusGeometry(0.03, 0.006, 8, 20), M.tail, sx * x, 0.83, 2.395, 0, 0, 0, false);
      }
      add(body, rbox(1.62, 0.2, 0.08, 0.02), M.carbonP, 0, 0.37, 2.37);
      for (let k = -3; k <= 3; k++) add(body, new THREE.BoxGeometry(0.012, 0.13, 0.2), M.carbonP, k * 0.13, 0.3, 2.33);
      add(body, rbox(0.52, 0.13, 0.012, 0.006), M.white, 0, 0.6, 2.396);
      for (const x of [-0.56, -0.42, 0.42, 0.56]) { add(body, cylZ(0.048, 0.052, 0.14, 18, true), M.ti, x, 0.32, 2.41); P.tips.push(toRoot(V3(x, 0.32, 2.48))); }
      // the ducktail on the deck, and the GT wing on swan-neck uprights
      { const dt = new THREE.Shape(); dt.moveTo(0, 0); dt.lineTo(0.2, 0); dt.lineTo(0.24, 0.07); dt.lineTo(0.0, 0.012); dt.lineTo(0, 0);
        const dg = new THREE.ExtrudeGeometry(dt, { depth: 1.5, bevelEnabled: false }); dg.rotateY(-Math.PI / 2); dg.translate(0.75, 0.98, 2.17);
        add(body, dg, M.carbonP, 0, 0, 0); }
      const foil = new THREE.Shape(); foil.moveTo(0, 0); foil.bezierCurveTo(0.06, 0.05, 0.22, 0.05, 0.38, 0.0); foil.bezierCurveTo(0.22, 0.012, 0.08, -0.006, 0, 0);
      const wg = new THREE.ExtrudeGeometry(foil, { depth: 1.84, bevelEnabled: false, curveSegments: 16 }); wg.rotateY(-Math.PI / 2); wg.translate(0.92, 0, 0);
      const wing = add(body, wg, M.carbonP, 0, 1.36, 2.04, 0.12, 0, 0);
      for (const sx of [-1, 1]) {
        add(body, rbox(0.012, 0.17, 0.36, 0.01), M.carbonP, sx * 0.93, 1.36, 2.23, 0.08, 0, 0);
        const up = new THREE.Shape(); up.moveTo(0, 0); up.lineTo(0.16, 0); up.quadraticCurveTo(0.2, 0.2, 0.08, 0.38); up.lineTo(0.02, 0.38); up.quadraticCurveTo(0.1, 0.2, 0, 0);
        const ug = new THREE.ExtrudeGeometry(up, { depth: 0.012, bevelEnabled: false }); ug.rotateY(-Math.PI / 2);
        add(body, ug, M.carbonP, sx * 0.45 + 0.006, 0.985, 2.02);
      }
      void wing;
      // inside: red buckets, the dash, the wheel on the left (a US car)
      for (const sx of [-1, 1]) { add(body, rbox(0.46, 0.1, 0.46, 0.04), M.redSeat, sx * 0.38, 0.36, 0.28); add(body, rbox(0.46, 0.66, 0.1, 0.04), M.redSeat, sx * 0.38, 0.72, 0.5, 0.2, 0, 0);
        for (const dx of [-0.17, 0.17]) add(body, rbox(0.08, 0.5, 0.12, 0.03), M.redSeat, sx * 0.38 + dx, 0.68, 0.46, 0.2, 0, 0); }
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
      if (ENGINE === 'twinair') {
        for (const sx of [-1, 1]) {
          add(body, new THREE.PlaneGeometry(0.3, 0.1), M.mesh, sx * (W(0.72) + 0.004), 0.55, 0.72, 0, sx * Math.PI / 2, 0, false);
          add(body, rbox(0.33, 0.012, 0.012, 0.004), M.black, sx * (W(0.72) + 0.004), 0.605, 0.72, 0, Math.PI / 2, 0);
        }
        add(body, cylZ(0.026, 0.029, 0.12, 16, true), M.chrome, 0.34, 0.2, 1.2);
        P.tips.push(toRoot(V3(0.34, 0.2, 1.28)));
      }
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
      const BUSA = ENGINE === 'busa', sy = BUSA ? 0.06 : 0;       // (the seat sits a little higher over the Hayabusa)
      // front fairing with the lamp, the tiller rising from it, the low deck, the rear shell, the seat post and seat
      add(body, loft([{ z: -0.86, w: 0.12, yb: 0.12, yt: 0.34, n: 2.4 }, { z: -0.8, w: 0.24, yb: 0.08, yt: 0.44, n: 3 }, { z: -0.62, w: 0.3, yb: 0.1, yt: 0.48, n: 3.5, tw: 0.7 },
        { z: -0.44, w: 0.26, yb: 0.12, yt: 0.44, n: 3.5, tw: 0.6 }, { z: -0.38, w: 0.18, yb: 0.14, yt: 0.3, n: 3 }], { seg: 32 }), M.paint, 0, 0, 0);
      add(body, cylZ(0.04, 0.04, 0.02, 18), M.head, 0, 0.28, -0.86);
      add(body, rbox(0.44, 0.06, 0.1, 0.03), M.black, 0, 0.1, -0.86);    // bumper
      add(body, rbox(0.44, 0.05, 0.62, 0.02), M.black, 0, 0.16, -0.12);  // the deck
      if (!BUSA) {
        add(body, loft([{ z: 0.12, w: 0.24, yb: 0.12, yt: 0.34, n: 3 }, { z: 0.2, w: 0.32, yb: 0.1, yt: 0.44, n: 3.5, tw: 0.75 }, { z: 0.6, w: 0.34, yb: 0.12, yt: 0.46, n: 3.5, tw: 0.75 },
          { z: 0.76, w: 0.3, yb: 0.14, yt: 0.4, n: 3 }, { z: 0.82, w: 0.2, yb: 0.18, yt: 0.32, n: 2.5 }], { seg: 32 }), M.paint, 0, 0, 0);
        for (const sx of [-1, 1]) { const t = add(body, rbox(0.08, 0.05, 0.02, 0.01), M.tail, sx * 0.2, 0.36, 0.8); t.castShadow = false; }
        add(body, new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14), M.alu, 0, 0.56, 0.36);
      } else {
        // The turbo Hayabusa, bare where the rear shell was: crank across the frame under the seat, the cylinders
        // leaning back, the exhaust side facing the rear - four headers into the turbo on the right-hand corner, its
        // downpipe out the back, a pod filter on the compressor and the charge pipe forward to the plenum under the
        // seat; the chain to the axle on the left; a tube subframe carrying the seat and a rear bar with the lamps
        const eg = new THREE.Group(); eg.position.set(0, 0, 0.46); body.add(eg);
        const cam = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.35, metalness: 0.6 });
        add(eg, rbox(0.44, 0.22, 0.42, 0.04), M.alu, 0, 0.25, 0);                                 // crankcase + gearbox
        add(eg, cylX(0.1, 0.1, 0.05, 28), M.alu, 0.235, 0.26, 0.04); add(eg, cylX(0.075, 0.075, 0.05, 24), M.alu, -0.235, 0.28, -0.06);   // clutch / alternator covers
        const cy = new THREE.Group(); cy.position.set(0, 0.34, 0.04); cy.rotation.x = 0.32; eg.add(cy);
        add(cy, rbox(0.38, 0.16, 0.17, 0.02), M.alu, 0, 0.08, 0);                                  // cylinder block
        for (let k = 0; k < 5; k++) add(cy, new THREE.BoxGeometry(0.4, 0.006, 0.18), M.alu, 0, 0.03 + k * 0.025, 0);   // fins
        add(cy, rbox(0.4, 0.09, 0.2, 0.02), M.alu, 0, 0.2, 0);                                     // head
        add(cy, rbox(0.38, 0.05, 0.18, 0.02), cam, 0, 0.27, 0);                                    // cam cover
        for (let k = 0; k < 4; k++) add(cy, cylX(0.012, 0.012, 0.02, 8), M.chrome, -0.15 + k * 0.1, 0.3, 0);
        add(cy, rbox(0.36, 0.08, 0.1, 0.02), M.black, 0, 0.2, -0.15);                              // throttle bodies / plenum (front)
        // headers from the four ports at the back of the head, down and round into the turbo
        const tb = V3(0.26, 0.4, 0.84);
        for (let k = 0; k < 4; k++) {
          const x = -0.15 + k * 0.1;
          pipe(body, [V3(x, 0.61, 0.62), V3(x, 0.58, 0.72), V3(x * 0.6 + 0.04, 0.44, 0.8), V3(0.14 + k * 0.012, 0.36, 0.86), V3(tb.x - 0.07, tb.y - 0.02, tb.z)], 0.017, M.steel, 8);
        }
        add(body, new THREE.TorusGeometry(0.055, 0.03, 10, 20), M.steel, tb.x, tb.y, tb.z, 0, Math.PI / 2, 0);   // turbine housing
        add(body, cylX(0.07, 0.07, 0.04, 22), M.alu, tb.x + 0.07, tb.y, tb.z);                                  // compressor
        add(body, cylX(0.04, 0.055, 0.1, 18), new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.6 }), tb.x + 0.15, tb.y, tb.z);   // pod filter
        pipe(body, [V3(tb.x, tb.y - 0.05, tb.z + 0.02), V3(tb.x, 0.26, tb.z + 0.08), V3(tb.x, 0.24, 0.98)], 0.03, M.steel, 12);             // downpipe
        add(body, cylZ(0.036, 0.036, 0.06, 16, true), M.chrome, tb.x, 0.24, 0.99);
        P.tips.push(toRoot(V3(tb.x, 0.24, 1.03)));
        pipe(body, [V3(tb.x + 0.07, tb.y + 0.07, tb.z), V3(0.3, 0.55, 0.6), V3(0.22, 0.58, 0.3), V3(0.1, 0.55, 0.3)], 0.025, M.alu, 10);   // charge pipe
        // the chain and its guard on the left, the subframe, the rear bar with the lamps
        add(body, rbox(0.02, 0.1, 0.26, 0.02), M.black, -0.27, 0.2, 0.56);
        add(body, cylX(0.07, 0.07, 0.008, 24), M.steel, -0.285, RR, zR);
        for (const sx of [-1, 1]) {
          pipe(body, [V3(sx * 0.21, 0.18, 0.12), V3(sx * 0.22, 0.62 + sy, 0.12), V3(sx * 0.22, 0.64 + sy, 0.6), V3(sx * 0.22, 0.36, 0.92)], 0.016, M.black, 8);
          tubeAB(body, V3(sx * 0.22, 0.36, 0.92), V3(sx * 0.22, 0.2, 0.7), 0.014, M.black);
          const t = add(body, rbox(0.08, 0.05, 0.02, 0.01), M.tail, sx * 0.16, 0.38, 0.935); t.castShadow = false;
        }
        add(body, rbox(0.5, 0.05, 0.03, 0.01), M.black, 0, 0.38, 0.92);
      }
      add(body, rbox(0.5, 0.12, 0.48, 0.05), M.seat, 0, 0.7 + sy, 0.34);
      add(body, rbox(0.48, 0.62, 0.12, 0.05), M.seat, 0, 1.06 + sy, 0.58, 0.12, 0, 0);
      add(body, rbox(0.3, 0.18, 0.1, 0.04), M.seat, 0, 1.46 + sy, 0.63, 0.12, 0, 0);
      for (const sx of [-1, 1]) { add(body, rbox(0.07, 0.05, 0.38, 0.02), M.seat, sx * 0.29, 0.92 + sy, 0.28); tubeAB(body, V3(sx * 0.27, 0.72 + sy, 0.45), V3(sx * 0.29, 0.9 + sy, 0.45), 0.014, M.black); }
      // the wide-track kit: stub axles out to the wheels and mudguards over the rears; and a stabiliser caster on an arm
      // out each side beside the seat (they clear the ground by 3 cm and catch it when it leans)
      for (const sx of [-1, 1]) {
        tubeAB(body, V3(sx * 0.22, RF, zF), V3(sx * (trackF / 2 - 0.05), RF, zF), 0.02, M.steel);
        tubeAB(body, V3(sx * 0.2, RR, zR), V3(sx * (trackR / 2 - 0.05), RR, zR), 0.022, M.steel);
        add(body, arcGeo(zR, RR, 0.15, 0.162, 0.25, Math.PI - 0.1, 0.12), M.black, sx * trackR / 2 - 0.06, 0, 0);
        tubeAB(body, V3(sx * (trackR / 2 - 0.05), RR + 0.1, zR + 0.05), V3(sx * 0.2, 0.3, zR + 0.05), 0.01, M.black);
        const ox = sx * 0.74, oz = 0.06;
        tubeAB(body, V3(sx * 0.19, 0.2, oz - 0.08), V3(ox, 0.18, oz), 0.017, M.steel);
        tubeAB(body, V3(sx * 0.19, 0.2, oz + 0.1), V3(ox, 0.18, oz), 0.013, M.steel);
        add(body, new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), M.black, ox, 0.18, oz);
        for (const dx of [-0.022, 0.022]) tubeAB(body, V3(ox + dx, 0.17, oz), V3(ox + dx, 0.08, oz + 0.03), 0.006, M.steel);
        add(body, cylX(0.05, 0.05, 0.03, 18), M.rubber, ox, 0.08, oz + 0.03);
        add(body, cylX(0.022, 0.022, 0.034, 12), M.alu, ox, 0.08, oz + 0.03);
      }
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
      if (!BUSA) P.tips.push(toRoot(V3(0, 0.2, 0.85)));
      spots(0.05, 0.28, -0.9);
      driver = person({ hip: V3(0, 0.78 + sy, 0.33), lean: 0.1, hands: [V3(-0.2, 1.0, -0.28), V3(0.2, 1.0, -0.28)],
        knee: { dx: 0.12, y: 0.84 + sy * 0.6, z: -0.08 }, foot: { dx: 0.14, y: 0.22, z: -0.26 } });
    };

    // ---------------------------------------------------------------- Razors Edge
    // (a neon glow round each edge: a camera-facing ribbon, brightest on the line and fading out smoothly to its sides
    // and round its ends - soft, not a see-through tube)
    function glowEdges(edges, w, hex) {
      const pos = [], sd = [], al = [], ax = [], ln = [], idx = [];
      for (const [A, Bv] of edges) {
        const d = Bv.clone().sub(A), L = d.length(); d.normalize();
        const b = pos.length / 3;
        for (const [e, s] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { const P = e ? Bv : A; pos.push(P.x, P.y, P.z); sd.push(s); al.push(e ? L : 0); ax.push(d.x, d.y, d.z); ln.push(L); }
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSide', new THREE.Float32BufferAttribute(sd, 1));
      g.setAttribute('aAlong', new THREE.Float32BufferAttribute(al, 1)); g.setAttribute('aAxis', new THREE.Float32BufferAttribute(ax, 3)); g.setAttribute('aLen', new THREE.Float32BufferAttribute(ln, 1));
      g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 4);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(hex) }, uW: { value: w }, uI: { value: 1 } },
        vertexShader: `attribute float aSide; attribute float aAlong; attribute vec3 aAxis; attribute float aLen;
          uniform float uW; varying vec2 vQ; varying float vLen;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vec3 ax = normalize(mat3(modelMatrix) * aAxis), vd = normalize(cameraPosition - wp.xyz);
            vec3 s = cross(ax, vd); float sl = length(s); s = sl > 1e-4 ? s / sl : vec3(0.0, 1.0, 0.0);
            float ed = aAlong > 0.5 * aLen ? 1.0 : -1.0;
            wp.xyz += s * aSide * uW + ax * ed * uW;
            vQ = vec2(aSide, aAlong + ed * uW); vLen = aLen;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `uniform vec3 uColor; uniform float uW; uniform float uI; varying vec2 vQ; varying float vLen;
          void main() {
            float da = max(0.0, max(-vQ.y, vQ.y - vLen)) / uW, d = length(vec2(vQ.x, da));
            float a = (exp(-d * d * 9.0) * 0.8 + exp(-d * d * 2.5) * 0.35) * uI;
            gl_FragColor = vec4(uColor, a);
            #include <colorspace_fragment>
          }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; m.castShadow = false; m.receiveShadow = false;
      body.add(m); return mat;
    }
    B.razor = () => {
      WF = 0.215; WR = 0.215;
      wheelStyle = { rim: 'cart', rimR: 0.1, tread: 'road' };
      // The faceted wedge, as in the game: a knife-edge prow, the long diagonal crease from the front corner up to the
      // tail, a flat roof. Right side (the left mirrors it): A prow top (centre), Bc front-bottom corner, C shoulder,
      // E tail top, F tail bottom. All of it black glass (from outside, black as a phone screen)
      const A = [0, 0.62, -2.44], Bc = [0.66, 0.24, -1.95], Cs = [0.6, 1.22, 0.3], E = [0.66, 1.08, 2.36], F = [0.78, 0.3, 2.28];
      const mir = (p) => [-p[0], p[1], p[2]];
      const v = [A, Bc, Cs, E, F, mir(Bc), mir(Cs), mir(E), mir(F)];   // 0 A, 1-4 right, 5-8 left
      const Fc = [[0, 5, 1],                     // the front face under the prow
        [0, 1, 2], [1, 3, 2], [1, 4, 3],        // right: front facet, upper facet, lower facet
        [0, 6, 5], [5, 6, 7], [5, 7, 8],        // left
        [0, 2, 6], [2, 3, 7, 6],                // hood, roof
        [3, 4, 8, 7], [1, 5, 8, 4]];            // tail, floor
      M.smoke = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.1, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.05, envMapIntensity: 0.45, side: THREE.DoubleSide });
      const shell = add(body, facesGeo(v, Fc), M.smoke, 0, 0, 0); shell.castShadow = true;
      // the graveyard on each flank's lower facet: tombstones, crosses and dead trees along the bottom edge - a matte
      // charcoal decal on the gloss black, so it shows as the light catches it
      const gy = canvasTex(1024, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.8 + Math.sin(x * 0.02) * 8); g.lineTo(w, h); g.fill();
        const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
        for (let k = 0; k < 30; k++) {
          const x = 40 + rnd() * (w - 80), bh = 20 + rnd() * 30, y0 = h * 0.82;
          if (rnd() < 0.5) { g.fillRect(x - 9, y0 - bh, 18, bh); g.beginPath(); g.arc(x, y0 - bh, 9, Math.PI, 0); g.fill(); }
          else { g.fillRect(x - 2.5, y0 - bh - 10, 5, bh + 10); g.fillRect(x - 10, y0 - bh - 2, 20, 5); }
        }
        g.strokeStyle = '#ffffff';
        for (const tx of [170, 560, 880]) {
          g.lineWidth = 8; g.beginPath(); g.moveTo(tx, h * 0.82); g.lineTo(tx + 6, h * 0.34); g.stroke();
          g.lineWidth = 3.5; for (let b = 0; b < 6; b++) { const y = h * (0.38 + b * 0.06), d = (b & 1 ? 1 : -1) * (30 + rnd() * 30); g.beginPath(); g.moveTo(tx + 5, y); g.quadraticCurveTo(tx + d * 0.5, y - 20, tx + d, y - 30 - rnd() * 20); g.stroke(); }
        }
        g.beginPath(); g.arc(w * 0.72, h * 0.22, 22, 0, 7); g.fill();          // the moon
      });
      gy.wrapS = gy.wrapT = THREE.ClampToEdgeWrapping;
      const dec = new THREE.MeshStandardMaterial({ color: 0x2a2a2f, alphaMap: gy, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const sx of [-1, 1]) {
        // the lower facet (front corner, tail bottom, tail top), mapped along its bottom edge: u along it, v up from it
        const b0 = V3(sx * Bc[0], Bc[1], Bc[2]), f0 = V3(sx * F[0], F[1], F[2]), e0 = V3(sx * E[0], E[1], E[2]);
        const ua = f0.clone().sub(b0), Lb = ua.length(); ua.normalize();
        const nrm = new THREE.Vector3().crossVectors(f0.clone().sub(b0), e0.clone().sub(b0)).normalize().multiplyScalar(sx > 0 ? -1 : 1);
        const up = new THREE.Vector3().crossVectors(nrm, ua).normalize(); if (up.y < 0) up.negate();
        const pos = [], uv = [];
        for (const p of [b0, f0, e0]) { const q = p.clone().sub(b0); pos.push(p.x + nrm.x * 0.004, p.y + nrm.y * 0.004, p.z + nrm.z * 0.004); uv.push(q.dot(ua) / Lb, q.dot(up) / 0.5); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
        const m = add(body, g, dec, 0, 0, 0, 0, 0, 0, false); m.renderOrder = 2;
      }
      // neon along the edges the game lights (the prow, the flanks' creases and edges, the tail - not the roof's):
      // a thin bright core, round at the joints, and the glow round it
      const NE = [[0, 1], [1, 2], [1, 3], [1, 4], [2, 3], [3, 4], [0, 5], [5, 6], [5, 7], [5, 8], [6, 7], [7, 8], [1, 5], [3, 7], [4, 8]];
      const edges = NE.map(([a, b]) => [V3(...v[a]), V3(...v[b])]);
      for (const [a, b] of edges) tubeAB(body, a, b, 0.011, M.paint, 12).castShadow = false;
      for (const i of new Set(NE.flat())) add(body, new THREE.SphereGeometry(0.011, 12, 8), M.paint, ...v[i], 0, 0, 0, false);
      M.halo = glowEdges(edges, 0.08, paintHex); M.halo.uniforms.uI.value = 1.25;
      // lights: two LED slits low on the front face, a red bar across the top of the tail
      const onFront = (sx, t, s) => { const a = V3(...A), b = V3(sx * Bc[0], Bc[1], Bc[2]), c = V3(-sx * Bc[0], Bc[1], Bc[2]); return a.multiplyScalar(1 - t - s).add(b.multiplyScalar(t)).add(c.multiplyScalar(s)); };
      for (const sx of [-1, 1]) {
        const p0 = onFront(sx, 0.78, 0.06), p1 = onFront(sx, 0.5, 0.3);
        const l = tubeAB(body, p0.add(V3(0, 0, -0.006)), p1.add(V3(0, 0, -0.006)), 0.011, M.head, 8); l.castShadow = false;
      }
      { const t = add(body, rbox(1.04, 0.028, 0.02, 0.008), M.tail, 0, 1.0, 2.345); t.castShadow = false; }
      spots(0.3, 0.33, -2.1);
      // inside: the cart frame, a low bench and the driver reclined under the roof, the wheel on the left
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.42, 0.28, -1.6), V3(sx * 0.42, 0.28, 1.9), 0.03, M.black);
      add(body, rbox(1.0, 0.1, 0.46, 0.04), M.seat, 0, 0.33, 0.28); add(body, rbox(1.0, 0.5, 0.1, 0.04), M.seat, 0, 0.6, 0.6, 0.62, 0, 0);
      add(body, rbox(0.9, 0.08, 0.3, 0.03), M.black, 0, 0.72, -0.52, -0.35, 0, 0);
      tubeAB(body, V3(-0.26, 0.3, -0.72), V3(-0.26, 0.7, -0.3), 0.02, M.black);
      SW = steering(V3(-0.26, 0.74, -0.24), 0.95, 0.16);
      cluster = { parent: body, pos: V3(-0.26, 0.77, -0.53), rot: -0.9, w: 0.14, h: 0.07 };
      if (ENGINE === 'ls') {
        // the 5.3 LS behind the bench: the iron block, the heads and valve covers with their coil packs, the truck
        // intake on top, the 4L60E behind it, and headers into two pipes out under the tail
        const eg = new THREE.Group(); eg.position.set(0, 0, 1.25); body.add(eg);
        const orange = new THREE.MeshStandardMaterial({ color: 0xb8561c, roughness: 0.55, metalness: 0.2 });
        add(eg, rbox(0.42, 0.34, 0.62, 0.04), orange, 0, 0.42, 0);
        for (const sx of [-1, 1]) {
          const hd = add(eg, rbox(0.2, 0.12, 0.6, 0.03), M.alu, sx * 0.25, 0.64, 0, 0, 0, sx * 0.78);
          add(hd, rbox(0.16, 0.05, 0.56, 0.02), M.black, 0, 0.08, 0);
          for (let k = 0; k < 4; k++) add(hd, new THREE.BoxGeometry(0.05, 0.06, 0.07), M.black, 0.05, 0.12, -0.2 + k * 0.135);
          for (let k = 0; k < 4; k++) tubeAB(eg, V3(sx * 0.3, 0.5, -0.21 + k * 0.14), V3(sx * 0.4, 0.3, -0.12 + k * 0.1), 0.02, M.steel, 8);
          pipe(body, [V3(sx * 0.4, 0.28, 1.4), V3(sx * 0.36, 0.2, 1.8), V3(sx * 0.3, 0.22, 2.2), V3(sx * 0.3, 0.33, 2.36)], 0.032, M.steel);
          add(body, cylZ(0.042, 0.042, 0.08, 16, true), M.chrome, sx * 0.3, 0.33, 2.36);
          P.tips.push(toRoot(V3(sx * 0.3, 0.33, 2.42)));
        }
        add(eg, rbox(0.3, 0.14, 0.5, 0.05), M.black, 0, 0.74, 0);
        add(eg, cylZ(0.07, 0.07, 0.12, 20), M.alu, 0, 0.72, -0.34);
        add(eg, cylZ(0.14, 0.14, 0.05, 24), M.black, 0, 0.42, -0.34);
        add(eg, cylZ(0.14, 0.09, 0.5, 20), M.steel, 0, 0.36, 0.56);
      } else P.tips.push(toRoot(V3(0, 0.3, 2.3)));
      driver = person({ hip: V3(-0.26, 0.39, 0.3), lean: 0.68, hands: [V3(-0.38, 0.78, -0.26), V3(-0.14, 0.78, -0.26)],
        knee: { dx: 0.11, y: 0.62, z: -0.3 }, foot: { dx: 0.14, y: 0.3, z: -0.84 }, helmet: false });
    };

    // ---------------------------------------------------------------- Golf Cart (std / lsv / hot / busa)
    // A two-seat cart: the rounded front cowl over the front wheels with the dash behind it, a rubber-matted floorboard,
    // the seat pod and the rear body over the back wheels, and (standard / LSV) a roof on four struts. Standard: a bag
    // rack with two golf bags; LSV: windscreen, lights, mirrors, bigger wheels; Hot Rod: no roof, a chrome roll hoop,
    // racing buckets, fat tyres on deep-dish wheels; Record: stretched and lowered, the Hayabusa bare behind the seat
    // with its headers into a megaphone, a wheelie bar; Jet: stretched, lowered and widened, a turbojet on a cradle over
    // the back axle (bellmouth, spinning compressor face, afterburner can, a flame out of it), a tail fin, a nose cone
    B.golf = () => {
      const V = ENGINE, STD = V === 'std' || V === 'ev', LSV = V === 'lsv', HOT = V === 'hot', REC = V === 'busa', JET = V === 'jet' || V === 'mega';
      WF = REC ? 0.22 : HOT ? 0.225 : JET ? 0.205 : 0.215; WR = REC ? 0.3 : HOT ? 0.27 : JET ? 0.225 : 0.215;
      wheelStyle = STD ? { rim: 'cart', rimR: 0.1, tread: 'road' } : LSV || JET ? { rim: 'alloy5', rimR: 0.152, tread: 'road' }
        : HOT ? { rim: 'deepdish', rimR: 0.165, tread: 'slick' } : { rim: 'steel5', rimR: 0.15, tread: 'slick' };
      const low = REC || JET ? 0.1 : HOT ? 0.06 : 0;          // (dropped)
      const wyF = 2 * RF + 0.03, wyR = 2 * RR + 0.03;          // clearance over the tyres
      M.seatC = new THREE.MeshStandardMaterial({ color: STD ? 0xd8cdb4 : LSV ? 0x2a2a2c : 0x151517, roughness: 0.65 });
      M.mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.95 });
      // the front cowl, over the front wheels
      add(body, loft([{ z: zF - 0.47, w: 0.3, yb: 0.3 - low, yt: 0.5 - low * 0.5, n: 3 }, { z: zF - 0.4, w: 0.46, yb: 0.26 - low, yt: 0.62 - low * 0.5, n: 3.2 },
        { z: zF - 0.26, w: 0.6, yb: Math.max(0.4, wyF - 0.08), yt: 0.72 - low * 0.5, n: 3.5 }, { z: zF - 0.08, w: 0.64, yb: wyF, yt: 0.77 - low * 0.5, n: 4 },
        { z: zF + 0.2, w: 0.64, yb: wyF, yt: 0.84 - low * 0.5, n: 4 }, { z: zF + 0.27, w: 0.6, yb: 0.32 - low, yt: 0.86 - low * 0.5, n: 4 }], { seg: 36 }), M.paint, 0, 0, 0);
      add(body, rbox(0.9, 0.1, 0.1, 0.04), M.black, 0, 0.3 - low, zF - 0.47);          // bumper
      // the dash, floorboard, seat pod, seat, the rear body over the back wheels
      const zD = zF + 0.28, zS1 = REC ? zR - 0.45 : JET ? zR - 0.72 : zR - 0.25, zS0 = zS1 - 0.58;
      add(body, rbox(1.12, 0.14, 0.1, 0.03), M.black, 0, 0.8 - low * 0.5, zD);
      add(body, rbox(1.02, 0.05, zS0 - zD, 0.02), M.mat, 0, 0.3 - low, (zD + zS0) / 2);
      add(body, rbox(1.12, 0.32, zS1 - zS0, 0.05), M.paint, 0, 0.46 - low, (zS0 + zS1) / 2);
      const seats = HOT || REC || JET ? [-0.26, 0.26] : [0];
      for (const x of seats) {
        const w = seats.length > 1 ? 0.46 : 1.06;
        add(body, rbox(w, 0.1, 0.48, 0.04), M.seatC, x, 0.67 - low, (zS0 + zS1) / 2);
        add(body, rbox(w, seats.length > 1 ? 0.6 : 0.42, 0.09, 0.04), M.seatC, x, (seats.length > 1 ? 1.0 : 0.95) - low, zS1 - 0.02, 0.18, 0, 0);
        if (seats.length > 1) for (const dx of [-0.2, 0.2]) add(body, rbox(0.07, 0.36, 0.14, 0.03), M.seatC, x + dx, 0.88 - low, zS1 - 0.08, 0.18, 0, 0);
      }
      if (!REC && !JET) {
        add(body, rbox(0.72, 0.26, 0.7, 0.04), M.black, 0, 0.4 - low, zR + 0.05);
        add(body, rbox(1.22, 0.24, 0.76, 0.06), M.paint, 0, wyR + 0.1, zR + 0.05);
      } else for (const sx of [-1, 1]) add(body, arcGeo(zR, RR, RR + 0.03, RR + 0.07, 0.15, Math.PI - 0.1, WR + 0.04), M.paint, sx * trackR / 2 - (WR + 0.04) / 2, 0, 0);
      add(body, rbox(1.1, 0.1, 0.12, 0.04), M.black, 0, 0.3 - low, zR + 0.45);          // rear bumper
      for (const sx of [-1, 1]) { const t = add(body, rbox(0.12, 0.05, 0.02, 0.01), M.tail, sx * 0.45, 0.62 - low, zR + 0.44); t.castShadow = false; }
      // the steering column and wheel (on the left), the driver
      tubeAB(body, V3(-0.24, 0.32 - low, zD - 0.05), V3(-0.24, 0.9 - low, zD + 0.2), 0.025, M.black);
      SW = steering(V3(-0.24, 0.93 - low, zD + 0.23), 0.95, 0.19);
      cluster = { parent: body, pos: V3(-0.24, 0.8 - low * 0.5, zD - 0.055), rot: -0.3, w: 0.14, h: 0.07 };
      driver = person({ hip: V3(-0.26, 0.72 - low, zS0 + 0.3), lean: 0.14, hands: [V3(-0.38, 0.97 - low, zD + 0.25), V3(-0.1, 0.97 - low, zD + 0.25)],
        knee: { dx: 0.11, y: 0.8 - low, z: zD + 0.3 }, foot: { dx: 0.14, y: 0.34 - low, z: zD + 0.08 }, helmet: REC || HOT || JET });
      if (STD || LSV) {
        // the roof on its struts
        const yR = 1.88;
        for (const sx of [-1, 1]) {
          tubeAB(body, V3(sx * 0.5, 0.82, zF + 0.24), V3(sx * 0.5, yR, zF + 0.2), 0.02, M.black);
          tubeAB(body, V3(sx * 0.5, 0.62, zS1 + 0.08), V3(sx * 0.5, yR, zS1 + 0.2), 0.02, M.black);
        }
        add(body, rbox(1.22, 0.05, zS1 - zF + 0.2, 0.025), STD ? M.white : M.black, 0, yR + 0.02, (zF + 0.1 + zS1 + 0.3) / 2);
      }
      if (STD) {
        // the bag rack: two golf bags and their clubs
        add(body, rbox(0.9, 0.04, 0.4, 0.02), M.black, 0, wyR + 0.24, zR + 0.3);
        const bagM = [new THREE.MeshStandardMaterial({ color: 0x1d3160, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x9c1b1b, roughness: 0.6 })];
        [-0.2, 0.2].forEach((x, k) => {
          const bag = new THREE.Group(); bag.position.set(x, wyR + 0.26, zR + 0.3); bag.rotation.x = 0.35; body.add(bag);
          add(bag, new THREE.CylinderGeometry(0.12, 0.13, 0.88, 18), bagM[k], 0, 0.44, 0);
          add(bag, new THREE.TorusGeometry(0.12, 0.012, 6, 20), M.black, 0, 0.88, 0, Math.PI / 2, 0, 0);
          for (let c = 0; c < 5; c++) { const a = c * 1.26; tubeAB(bag, V3(Math.cos(a) * 0.06, 0.8, Math.sin(a) * 0.06), V3(Math.cos(a) * 0.07, 1.06, Math.sin(a) * 0.07), 0.008, M.steel, 6);
            add(bag, rbox(0.07, 0.035, 0.04, 0.01), c < 3 ? M.steel : M.black, Math.cos(a) * 0.075, 1.07, Math.sin(a) * 0.075); }
        });
      }
      if (LSV) {
        const ws = add(body, new THREE.PlaneGeometry(1.1, 0.95), M.glass, 0, 1.36, zF + 0.2, -0.04, 0, 0, false); ws.castShadow = false;
        for (const sx of [-1, 1]) {
          add(body, cylZ(0.055, 0.055, 0.04, 20), M.head, sx * 0.34, 0.58, zF - 0.44);
          tubeAB(body, V3(sx * 0.5, 1.15, zF + 0.2), V3(sx * 0.62, 1.2, zF + 0.16), 0.01, M.black);
          add(body, rbox(0.03, 0.08, 0.12, 0.01), M.black, sx * 0.64, 1.2, zF + 0.16);
        }
        spots(0.34, 0.58, -0.4 + zF);
      }
      if (HOT || JET) {
        // chrome roll hoop behind the buckets, a black stripe down the cowl
        const hp = [V3(-0.5, 0.62 - low, zS1 + 0.06), V3(-0.48, 1.3, zS1 + 0.1), V3(0.48, 1.3, zS1 + 0.1), V3(0.5, 0.62 - low, zS1 + 0.06)];
        add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp, false, 'centripetal'), 30, 0.03, 10, false), M.chrome, 0, 0, 0);
        add(body, rbox(0.3, 0.012, 0.55, 0.005), M.black, 0, 0.84 - low * 0.5 + 0.002, zF - 0.02, -0.18, 0, 0);
        for (const sx of [-1, 1]) add(body, cylZ(0.05, 0.05, 0.03, 18), M.head, sx * 0.3, 0.55 - low, zF - 0.45);
        spots(0.3, 0.55 - low, zF - 0.5);
      }
      if (REC) {
        // the Hayabusa behind the seats, cylinders forward, headers down into one megaphone; the wheelie bar
        const eg = new THREE.Group(); eg.position.set(0, 0.16, zR - 0.18); body.add(eg);
        const camM = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.35, metalness: 0.6 });
        add(eg, rbox(0.46, 0.22, 0.44, 0.04), M.alu, 0, 0.12, 0);
        add(eg, cylX(0.1, 0.1, 0.05, 28), M.alu, 0.245, 0.14, 0.04);
        const cy = new THREE.Group(); cy.position.set(0, 0.22, -0.08); cy.rotation.x = -0.35; eg.add(cy);
        add(cy, rbox(0.38, 0.16, 0.17, 0.02), M.alu, 0, 0.08, 0);
        for (let k = 0; k < 5; k++) add(cy, new THREE.BoxGeometry(0.4, 0.006, 0.18), M.alu, 0, 0.03 + k * 0.025, 0);
        add(cy, rbox(0.4, 0.09, 0.2, 0.02), M.alu, 0, 0.2, 0); add(cy, rbox(0.38, 0.05, 0.18, 0.02), camM, 0, 0.27, 0);
        const mega = V3(0.3, 0.42, zR + 0.62);
        for (let k = 0; k < 4; k++) { const x = -0.15 + k * 0.1; pipe(body, [V3(x, 0.52, zR - 0.4), V3(x, 0.4, zR - 0.5), V3(0.1 + k * 0.03, 0.3, zR - 0.2), V3(0.26, 0.34, zR + 0.3), mega.clone().add(V3(0, 0, -0.25))], 0.016, M.steel, 8); }
        add(body, cylZ(0.035, 0.07, 0.3, 18, true), M.steel, mega.x, mega.y, mega.z - 0.12);
        P.tips.push(toRoot(mega.clone().add(V3(0, 0, 0.05))));
        for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.3, 0.3, zR + 0.3), V3(sx * 0.3, 0.12, zR + 0.55 + 0.1), 0.018, M.steel);
        add(body, cylX(0.04, 0.04, 0.66, 14), M.rubber, 0, 0.08, zR + 0.65);
        spots(0.3, 0.45, zF - 0.5);
      } else if (!HOT && !LSV && !JET) P.tips.push(toRoot(V3(0, 0.3, zR + 0.45)));
      if (JET) {
        // the turbojet on its cradle over the back axle: a bellmouth intake behind the buckets, the compressor face (it
        // spins with the spool), a brushed case with its bands and fuel lines, the afterburner can and its nozzle, the tail
        // fin on top and the flame out of the back - all in one group that grows with the thrust tune (setJetSize)
        const ey = 0.6, er = 0.16, ez0 = zS1 + 0.12, eL = 0.9, abL = 0.55;
        const jg = new THREE.Group(); jg.position.set(0, ey, ez0); body.add(jg);
        const aluD = M.alu.clone(); aluD.side = THREE.DoubleSide;
        const heat = new THREE.MeshStandardMaterial({ color: 0x7a6a78, roughness: 0.3, metalness: 1 });
        const bell = new THREE.LatheGeometry([[0.235, 0], [0.225, 0.02], [0.2, 0.05], [0.18, 0.1], [0.172, 0.16]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
        bell.rotateX(Math.PI / 2); add(jg, bell, aluD, 0, 0, 0);
        jetFan = new THREE.Group(); jetFan.position.set(0, 0, 0.15); jg.add(jetFan);
        add(jetFan, new THREE.CircleGeometry(0.165, 32), M.black, 0, 0, 0.005);
        add(jetFan, cylZ(0.001, 0.05, 0.08, 18), M.alu, 0, 0, -0.035, Math.PI, 0, 0);
        for (let k = 0; k < 13; k++) { const b = add(jetFan, new THREE.BoxGeometry(0.012, 0.13, 0.03), M.steel, 0, 0, 0); b.geometry.translate(0, 0.095, 0); b.rotation.set(0, 0.5, k * 2 * Math.PI / 13, 'ZYX'); }
        add(jg, cylZ(er, er, eL, 36), M.alu, 0, 0, 0.16 + eL / 2);
        for (const dz of [0.05, 0.32, 0.6, 0.86]) add(jg, new THREE.TorusGeometry(er + 0.004, 0.009, 8, 36), M.steel, 0, 0, 0.16 + dz);
        for (const sx of [-1, 1]) pipe(jg, [V3(sx * 0.12, -0.1, 0.3), V3(sx * 0.17, -0.02, 0.5), V3(sx * 0.17, 0.02, 0.9)], 0.008, M.steel, 6);
        const zA = 0.16 + eL;
        add(jg, cylZ(er - 0.012, er - 0.02, abL, 36), heat, 0, 0, zA + abL / 2);
        const zN = zA + abL;
        add(jg, cylZ(0.14, 0.13, 0.1, 30, true), new THREE.MeshStandardMaterial({ color: 0x3a3436, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide }), 0, 0, zN + 0.05);
        add(jg, new THREE.CircleGeometry(0.12, 24), M.black, 0, 0, zN - 0.02, 0, Math.PI, 0);
        // the cradle: four struts from the frame rails up to the case (re-aimed when the engine grows)
        const strutGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 10), struts = [];
        for (const sx of [-1, 1]) for (const dz of [0.25, 0.8]) struts.push({ m: add(body, strutGeo, M.steel, 0, 0, 0), sx, dz });
        // the tail fin on top of the afterburner can, swept back
        const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(0.62, 0); fs.lineTo(0.78, 0.5); fs.lineTo(0.5, 0.52); fs.closePath();
        const fin = new THREE.ExtrudeGeometry(fs, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
        fin.rotateY(-Math.PI / 2); fin.translate(0.011, 0, 0);
        add(jg, fin, M.paint, 0, er - 0.03, zA - 0.2);
        // the nose cone on the front cowl
        const cone = new THREE.LatheGeometry([[0.17, 0], [0.16, 0.08], [0.13, 0.18], [0.08, 0.29], [0.02, 0.37], [0.001, 0.38]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
        cone.rotateX(-Math.PI / 2); cone.scale(1.3, 0.8, 1);
        add(body, cone, M.paint, 0, 0.42 - low, zF - 0.44);
        // the exhaust: a hot core and the plume around it, both additive - barely there dry, a long orange flame with
        // shock diamonds on the afterburner
        const flameMat = (core) => new THREE.ShaderMaterial({
          uniforms: { uAB: { value: 0 }, uThr: { value: 0 }, uT: { value: 0 }, uCore: { value: core ? 1 : 0 } },
          vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
          fragmentShader: `uniform float uAB; uniform float uThr; uniform float uT; uniform float uCore; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
            void main() {
              float t = 1.0 - vUv.y;
              float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
              float dia = 0.6 + 0.4 * pow(abs(sin(t * 16.0 - uT * 2.0)), 3.0);
              float flick = 0.85 + 0.15 * sin(uT * 53.0 + t * 9.0) * sin(uT * 31.0 + 1.3);
              vec3 hot = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.52, 0.14), smoothstep(0.0, 0.45, t));
              hot = mix(hot, vec3(0.85, 0.2, 0.06), smoothstep(0.45, 1.0, t));
              float a = edge * (1.0 - smoothstep(0.15, 1.0, t)) * flick * (uCore > 0.5 ? dia * 1.7 : 0.8) * (uAB * 2.4 + uThr * 0.18);
              gl_FragColor = vec4(hot * a, 1.0);
              #include <colorspace_fragment>
            }`,
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        });
        const plumeGeo = (r0, r1) => { const g = new THREE.CylinderGeometry(r0, r1, 1, 24, 6, true); g.translate(0, -0.5, 0); g.rotateX(-Math.PI / 2); return g; };
        jetFx = { outer: add(jg, plumeGeo(0.14, 0.07), flameMat(false), 0, 0, zN + 0.1, 0, 0, 0, false), core: add(jg, plumeGeo(0.1, 0.015), flameMat(true), 0, 0, zN + 0.1, 0, 0, 0, false), t: 0 };
        jetFx.outer.renderOrder = 5; jetFx.core.renderOrder = 6;
        // a bigger engine (s: its diameter against stock): fatter by s, longer by less, sat a little higher to clear the axle
        const up = V3(0, 1, 0), dv = V3(0, 0, 0);
        jetSize = (sz) => {
          const sa = 1 + (sz - 1) * 0.6, y = ey + Math.max(0, sz - 1) * 0.07, zb = ez0 + Math.max(0, sz - 1.4) * 0.3;
          jg.scale.set(sz, sz, sa); jg.position.set(0, y, zb);
          for (const st of struts) {
            const a = V3(st.sx * 0.3, 0.32, ez0 + st.dz), b = V3(st.sx * 0.1 * sz, y - (er - 0.02) * sz, zb + (st.dz + 0.05) * sa);
            dv.subVectors(b, a); const len = dv.length();
            st.m.position.addVectors(a, b).multiplyScalar(0.5); st.m.quaternion.setFromUnitVectors(up, dv.normalize()); st.m.scale.set(1, len, 1);
          }
        };
        jetSize(1);
      }
    };

    // ---------------------------------------------------------------- Rally Car (r4 / r2 / gb)
    // A gravel rally hatch on its long-travel suspension: bumpers and skirts in black, a contrasting stripe down each
    // flank and over the roof, the number panel on each door, a four-lamp pod on the bonnet for the night stages, a roof
    // scoop, mud flaps behind every wheel, gravel wheels, the cage inside and both crew in helmets. Rally4: a small hatch
    // with a roof spoiler; Rally2: flared arches, a big wing; Group B: wider still, the engine behind the seats (intakes
    // in the rear quarters, a louvred back window), a huge wing
    B.rally = () => {
      const V = ENGINE, R2 = V === 'r2', GB = V === 'gb';
      WF = 0.2; WR = GB ? 0.23 : 0.2;
      wheelStyle = { rim: 'rally', rimR: 0.19, tread: 'gravel', rimColor: R2 ? 0xc49a45 : 0xeeeee8 };     // (white; Rally2 in gold)
      const lv = (paintHex & 0xffffff) > 0xd0d0d0 || (((paintHex >> 16) & 255) + ((paintHex >> 8) & 255) + (paintHex & 255)) > 600 ? 0x1b2f63 : 0xf2f2ee;
      M.livery = new THREE.MeshPhysicalMaterial({ color: lv, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
      const flareA = GB ? 0.07 : R2 ? 0.055 : 0.02;
      const flare = (z) => { let f = 0; for (const zc of [zF, zR]) { const d = Math.abs(z - zc); if (d < 0.6) f = Math.max(f, flareA * Math.pow(1 - (d / 0.6) ** 2, 0.7)); } return f; };
      const N0 = -2.0, T0 = 1.95, ZW = -0.62, ZRF = -0.05, ZRR = 1.05, ZH = 1.2;
      const Wb0 = tbl([[N0, 0.72], [N0 + 0.08, 0.8], [N0 + 0.25, 0.855], [-1.2, 0.87], [1.2, 0.87], [T0 - 0.15, 0.86], [T0, 0.8]]);
      const W = (z) => Wb0(z) + flare(z);
      const g = carBody({
        stations: stationsOf(N0, T0, 0.05, [ZW, ZRF, ZRR, ZH, zF - 0.42, zF + 0.42, zR - 0.42, zR + 0.42, -0.35, 0.45, 0.55]),
        W, bulge: () => 0.014,
        yB: archY(tbl([[N0, 0.3], [N0 + 0.2, 0.22], [T0 - 0.2, 0.22], [T0, 0.32]]), [zF, zR], RF, 0.41),
        ySh: tbl([[N0, 0.6], [N0 + 0.2, 0.7], [-1.2, 0.78], [0, 0.8], [1.4, 0.82], [T0, 0.8]]),
        yBelt: tbl([[N0, 0.64], [N0 + 0.2, 0.74], [-1.2, 0.82], [ZW, 0.88], [0.5, 0.9], [1.4, 0.93], [T0, 0.9]]),
        Wb: (z) => W(z) - 0.08 - flare(z),
        yT: tbl([[N0, 0.66], [N0 + 0.1, 0.72], [-1.3, 0.84], [ZW, 0.92], [-0.3, 1.2], [ZRF, 1.38], [0.5, 1.43], [ZRR, 1.41], [ZH, 1.38], [1.72, 1.12], [T0 - 0.08, 1.0], [T0, 0.94]]),
        Wt: tbl([[N0, 0.45], [ZW, 0.55], [ZRF, 0.62], [ZRR, 0.63], [T0, 0.56]]),
        mat: (b, z) => {
          if (b <= 3) return 2;                                                           // underbody, skirts
          if (b >= 5 && b <= 6 && z > zF + 0.42 && z < zR - 0.42) return 3;               // the stripe down each flank
          if (z > ZW && z < ZH && b >= 11 && b <= 14) return GB && z > ZRR ? 2 : 1;       // windows (Group B: louvred back)
          if (z > ZRR && z < 1.72 && b >= 11) return 1;                                   // the hatch glass
          if (z > ZW && z < ZRF && b >= 15) return 1;                                     // windscreen
          if (b >= 15 && z > ZRF && z < ZRR) return 3;                                    // stripe over the roof
          return 0;
        },
      });
      add(body, g, [M.paint, M.tint, M.black, M.livery], 0, 0, 0);
      // bumpers, the nose's intakes, lamps; the light pod on the bonnet
      add(body, rbox(1.62, 0.2, 0.14, 0.04), M.black, 0, 0.36, N0 + 0.02);
      add(body, new THREE.PlaneGeometry(0.9, 0.16), M.mesh, 0, 0.36, N0 - 0.055, 0, Math.PI, 0, false);
      for (const sx of [-1, 1]) {
        add(body, new THREE.PlaneGeometry(0.2, 0.1), M.mesh, sx * 0.62, 0.34, N0 - 0.05, 0, Math.PI, 0, false);
        const hl = add(body, rbox(0.3, 0.1, 0.06, 0.03), M.black, sx * 0.55, 0.6, N0 + 0.03); hl.castShadow = false;
        add(body, cylZ(0.04, 0.04, 0.02, 16), M.head, sx * 0.47, 0.6, N0 - 0.005);
        add(body, cylZ(0.035, 0.035, 0.02, 16), M.head, sx * 0.62, 0.6, N0 + 0.005);
      }
      add(body, rbox(1.66, 0.18, 0.12, 0.04), M.black, 0, 0.34, T0 - 0.02);
      for (const sx of [-1, 1]) { const t = add(body, rbox(0.3, 0.1, 0.03, 0.01), M.tail, sx * 0.56, 0.78, T0 + 0.01); t.castShadow = false; }
      const pod = new THREE.Group(); pod.position.set(0, 0.8, N0 + 0.42); pod.rotation.x = -0.12; body.add(pod);
      add(pod, rbox(1.0, 0.2, 0.1, 0.04), M.black, 0, 0, 0);
      for (let k = 0; k < 4; k++) { const x = -0.36 + k * 0.24; add(pod, cylZ(0.085, 0.085, 0.03, 20), M.chrome, x, 0, -0.05); add(pod, new THREE.CircleGeometry(0.075, 20), M.head, x, 0, -0.066, 0, Math.PI, 0, false); }
      spots(0.36, 0.8, N0 + 0.3);
      // roof scoop, mirrors, the spoiler / wing
      add(body, rbox(0.3, 0.06, 0.3, 0.03), M.black, 0, 1.43, ZRF + 0.25);
      add(body, new THREE.PlaneGeometry(0.22, 0.04), M.mesh, 0, 1.44, ZRF + 0.1, 0, Math.PI, 0, false);
      for (const sx of [-1, 1]) { add(body, rbox(0.1, 0.07, 0.14, 0.02), M.paint, sx * 0.93, 0.99, ZW + 0.2); tubeAB(body, V3(sx * 0.82, 0.93, ZW + 0.22), V3(sx * 0.9, 0.98, ZW + 0.2), 0.01, M.black); }
      if (!R2 && !GB) add(body, rbox(1.1, 0.03, 0.26, 0.012), M.black, 0, 1.38, ZH + 0.1, -0.18, 0, 0);
      else {
        const span = GB ? 1.7 : 1.5, yW = GB ? 1.48 : 1.44, zW = GB ? T0 - 0.28 : ZH + 0.22;
        add(body, rbox(span, 0.035, GB ? 0.36 : 0.28, 0.014), M.black, 0, yW, zW, 0.12, 0, 0);
        for (const sx of [-1, 1]) {
          add(body, rbox(0.012, GB ? 0.24 : 0.16, GB ? 0.42 : 0.32, 0.006), M.black, sx * span / 2, yW - 0.04, zW);
          if (GB) tubeAB(body, V3(sx * 0.4, 1.06, T0 - 0.3), V3(sx * 0.4, yW - 0.02, zW), 0.018, M.black);
        }
      }
      // mud flaps behind every wheel; tow hooks
      const flapM = new THREE.MeshStandardMaterial({ color: GB ? 0x1a1a1c : 0xb3121a, roughness: 0.8, side: THREE.DoubleSide });
      for (const sx of [-1, 1]) for (const [z, tr] of [[zF, trackF], [zR, trackR]]) {
        const f = add(body, new THREE.PlaneGeometry(0.26, 0.3), flapM, sx * (tr / 2), 0.2, z + 0.4, 0, 0, 0, false); f.castShadow = false;
      }
      for (const z of [N0 - 0.05, T0 + 0.05]) add(body, new THREE.TorusGeometry(0.035, 0.01, 6, 14), new THREE.MeshStandardMaterial({ color: 0xd22 }), -0.4, 0.3, z, 0, Math.PI / 2, 0);
      // the number on each door
      const num = V === 'gb' ? '1' : V === 'r2' ? '7' : '23';
      const nt = canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 26); c.fill(); c.fillStyle = '#111'; c.font = 'bold 120px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(num, w / 2, h / 2 + 6); });
      const nm = new THREE.MeshStandardMaterial({ map: nt, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const sx of [-1, 1]) { const p = add(body, new THREE.PlaneGeometry(0.34, 0.21), nm, sx * (W(0.1) + 0.012), 0.6, 0.1, 0, sx * Math.PI / 2, 0, false); p.castShadow = false; }
      if (GB) {
        // the engine behind the seats breathes through the rear quarters
        for (const sx of [-1, 1]) add(body, new THREE.PlaneGeometry(0.3, 0.12), M.mesh, sx * (W(1.0) + 0.006), 0.72, 1.0, 0, sx * Math.PI / 2, 0, false);
        for (let k = 0; k < 6; k++) add(body, rbox(1.0, 0.012, 0.03, 0.004), M.black, 0, 1.33 - k * 0.055, ZRR + 0.12 + k * 0.1, 0.9, 0, 0);
      }
      // exhaust: the anti-lag's flames come out here
      const ex = GB ? V3(0, 0.3, T0 + 0.02) : V3(0.45, 0.24, T0 + 0.02);
      add(body, cylZ(0.05, 0.05, 0.1, 16, true), M.steel, ex.x, ex.y, ex.z);
      P.tips.push(toRoot(ex.clone().add(V3(0, 0, 0.07))));
      // inside: the cage, two buckets, the crew (co-driver with the pace notes), the wheel on the left
      for (const sx of [-1, 1]) {
        add(body, rbox(0.46, 0.12, 0.48, 0.05), M.seat, sx * 0.37, 0.36, 0.25);
        add(body, rbox(0.46, 0.7, 0.1, 0.05), M.seat, sx * 0.37, 0.74, 0.5, 0.15, 0, 0);
        tubeAB(body, V3(sx * 0.68, 0.35, 0.72), V3(sx * 0.6, 1.33, 0.72), 0.022, M.steel, 8);
        tubeAB(body, V3(sx * 0.76, 0.5, ZW + 0.06), V3(sx * 0.58, 1.3, ZRF + 0.1), 0.018, M.steel, 8);
        tubeAB(body, V3(sx * 0.58, 1.3, ZRF + 0.1), V3(sx * 0.6, 1.33, 0.72), 0.018, M.steel, 8);
      }
      tubeAB(body, V3(-0.6, 1.33, 0.72), V3(0.6, 1.33, 0.72), 0.022, M.steel, 8);
      tubeAB(body, V3(-0.6, 1.33, 0.72), V3(0.58, 1.3, ZRF + 0.1), 0.018, M.steel, 8);
      add(body, rbox(1.5, 0.14, 0.32, 0.05), M.black, 0, 0.84, ZW + 0.12);
      SW = steering(V3(-0.37, 0.84, -0.22), 0.42, 0.17);
      cluster = { parent: body, pos: V3(-0.37, 0.93, ZW + 0.05), rot: -0.35, w: 0.24, h: 0.1 };
      driver = person({ hip: V3(-0.37, 0.43, 0.26), lean: 0.3, hands: [V3(-0.5, 0.85, -0.2), V3(-0.24, 0.85, -0.2)],
        knee: { dx: 0.1, y: 0.58, z: -0.22 }, foot: { dx: 0.13, y: 0.24, z: -0.7 } });
      const co = person({ hip: V3(0.37, 0.43, 0.26), lean: 0.3, hands: [V3(0.28, 0.66, 0.02), V3(0.46, 0.66, 0.02)], knee: { dx: 0.1, y: 0.58, z: -0.22 }, foot: { dx: 0.13, y: 0.24, z: -0.7 } });
      add(co, rbox(0.2, 0.012, 0.15, 0.004), M.white, 0.37, 0.67, 0.02, -0.5, 0, 0);
      body.add(co); P.hideCockpit.push(driver);
    };

    (B[CAR] || B.couch)();
    model.add(driver);
    const eye = driver.userData.eye;

    // ---------------------------------------------------------------- the display on the dash
    if (cluster) add(cluster.parent, new THREE.PlaneGeometry(cluster.w, cluster.h), M_cluster, cluster.pos.x, cluster.pos.y, cluster.pos.z + 0.002, cluster.rot, 0, 0, false);
    const EV = CAR === 'golf' ? ENGINE !== 'busa' && ENGINE !== 'jet' && ENGINE !== 'mega' : (opts.engine || 'ev') === 'ev' && (CAR === 'mini' || CAR === 'scooter' || CAR === 'razor');
    const JETC = CAR === 'golf' && (ENGINE === 'jet' || ENGINE === 'mega');

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
    // block treads (gravel: the rally car's gravel tyres; mud: every car's knobby package) - the blocks stand proud of a
    // carcass built smaller by their depth, so their tops are the tyre's real rolling radius and they sit on the rubber
    // instead of floating round it. Gravel: small tight blocks four and three across, staggered, shoulder blocks turned
    // down the shoulder; mud: big staggered knobs with wide voids and lugs running down each sidewall
    function blockTread(R, W, rimR, kind) {
      const mud = kind === 'mud', depth = mud ? 0.02 : 0.012, rc = R - depth, h = W / 2, list = [];
      const box = (w, ht, l, x, r, ang, tilt) => { const b = new THREE.BoxGeometry(w, ht, l); if (tilt) b.rotateZ(tilt); b.translate(x, r, 0); b.rotateX(ang); list.push(b); };
      const pitch = mud ? 0.062 : 0.042, N = Math.round(2 * Math.PI * R / pitch), bl = pitch * (mud ? 0.55 : 0.6);
      for (let k = 0; k < N; k++) {
        const a = k * 2 * Math.PI / N, odd = k & 1;
        if (mud) {
          for (const f of odd ? [-0.5, 0.14] : [-0.14, 0.5]) box(W * 0.34, depth + 0.004, bl, f * h, rc + depth / 2 - 0.002, a);
          for (const sx of [-1, 1]) { const lg = (k + (sx > 0 ? 1 : 0)) & 1; box(0.014, 0.026 + 0.018 * lg, bl * 0.85, sx * (h - 0.003), rc - 0.01 - 0.009 * lg, a); }
        } else {
          for (const f of odd ? [-0.44, 0, 0.44] : [-0.66, -0.22, 0.22, 0.66]) box(W * (odd ? 0.19 : 0.16), depth + 0.004, bl, f * h, rc + depth / 2 - 0.002, a);
          for (const sx of [-1, 1]) box(W * 0.1, depth, bl * 0.85, sx * (h - W * 0.07), rc - 0.008 + depth / 2, a + (odd ? Math.PI / N : 0), -sx * 0.55);
        }
      }
      return { carc: carcass(rc + 0.004, W, rimR), tr: mergeGeos(list) };
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
      lb: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.32, metalness: 0.55 }),
      rally: new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.35, metalness: 0.2 }),
    };
    function rim(g, R, W, rimR, style) {
      const mat = RIM[style] || RIM.steel;
      const barrel = new THREE.CylinderGeometry(rimR, rimR, W * 0.92, 32, 1, true); barrel.rotateZ(Math.PI / 2); add(g, barrel, style === 'deepdish' || style === 'lb' ? M.black : mat, 0, 0, 0);
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
      if (style === 'rally') {
        // a flat-faced 15 in gravel wheel: six wide spokes cut from one face, a lip round it, a centre cap on five studs;
        // dark behind the face (the brake disc shows through the windows)
        const m = wheelStyle.rimColor !== undefined ? (M.rallyRim || (M.rallyRim = new THREE.MeshStandardMaterial({ color: wheelStyle.rimColor, roughness: 0.32, metalness: wheelStyle.rimColor === 0xeeeee8 ? 0.15 : 0.75 }))) : mat;
        const face = new THREE.Shape(); face.absarc(0, 0, rimR * 0.95, 0, Math.PI * 2, false);
        for (let j = 0; j < 6; j++) {
          const c = j * Math.PI / 3 + Math.PI / 6, hole = new THREE.Path();
          hole.absarc(0, 0, rimR * 0.8, c - 0.34, c + 0.34, false); hole.absarc(0, 0, rimR * 0.36, c + 0.2, c - 0.2, true); hole.closePath();
          face.holes.push(hole);
        }
        const fg = new THREE.ExtrudeGeometry(face, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 2, curveSegments: 20 });
        fg.rotateY(Math.PI / 2);
        add(g, fg, m, fx - 0.03, 0, 0);
        add(g, new THREE.TorusGeometry(rimR * 0.975, 0.011, 8, 44), m, fx - 0.012, 0, 0, 0, Math.PI / 2, 0);
        add(g, cylX(rimR * 0.96, rimR * 0.96, 0.01, 36), M.black, fx - 0.1, 0, 0);
        add(g, cylX(rimR * 0.2, rimR * 0.22, 0.03, 24), m, fx - 0.005, 0, 0);
        for (let j = 0; j < 5; j++) { const a = j * 2 * Math.PI / 5; add(g, cylX(0.009, 0.009, 0.022, 8), M.chrome, fx + 0.012, Math.cos(a) * rimR * 0.13, Math.sin(a) * rimR * 0.13); }
        add(g, cylX(0.018, 0.018, 0.014, 14), M.black, fx + 0.014, 0, 0);
        return;
      }
      if (style === 'lb') {
        // deep concave, all black: a gloss lip stepping down into the barrel, ten spokes in pairs dished from the
        // centre cap back to the rim, the cap
        add(g, new THREE.TorusGeometry(rimR, 0.016, 10, 44), M.gloss, fx + 0.02, 0, 0, 0, Math.PI / 2, 0);
        add(g, latheX([[rimR, fx + 0.02], [rimR * 0.93, fx - 0.02], [rimR * 0.9, fx - 0.07]], 44), M.gloss, 0, 0, 0);
        for (let k = 0; k < 5; k++) for (const da of [-0.11, 0.11]) {
          const a0 = k * 2 * Math.PI / 5 + da, a1 = k * 2 * Math.PI / 5 + da * 2.4;
          tubeAB(g, V3(fx, Math.cos(a0) * 0.06, Math.sin(a0) * 0.06), V3(fx - 0.07, Math.cos(a1) * rimR * 0.9, Math.sin(a1) * rimR * 0.9), 0.012, mat, 8);
        }
        add(g, cylX(0.066, 0.072, 0.05, 24), mat, fx - 0.015, 0, 0);
        add(g, cylX(0.028, 0.028, 0.02, 16), M.gloss, fx + 0.012, 0, 0);
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
      const nSp = style === 'alloy5' || style === 'steel5' ? 5 : style === 'cart' ? 8 : style === 'hub' || style === 'rally' ? 6 : 0;
      for (let k = 0; k < nSp; k++) { const s = add(g, new THREE.BoxGeometry(0.014, rimR * 0.9, style === 'alloy5' ? rimR * 0.34 : style === 'rally' ? rimR * 0.4 : rimR * 0.2), mat, fx - 0.005, 0, 0); s.rotation.x = k * 2 * Math.PI / nSp; s.geometry.translate(0, rimR * 0.45, 0); }
      add(g, new THREE.TorusGeometry(rimR * 0.99, 0.008, 6, 36), mat, fx - 0.005, 0, 0, 0, Math.PI / 2, 0);
      add(g, cylX(rimR * 0.28, rimR * 0.3, 0.035, 20), style === 'steel' ? M.chrome : mat, fx + 0.005, 0, 0);
    }
    const geo = {};
    for (const front of [true, false]) {
      const R = front ? RF : RR, W = front ? WF : WR, rimR = Math.min(R - 0.03, (!front && wheelStyle.rimRR) || wheelStyle.rimR || R * 0.6);
      const st = wheelStyle.tread === 'gravel' ? blockTread(R, W, rimR, 'gravel') : { carc: carcass(R, W, rimR), tr: tread(R, W, wheelStyle.tread) };
      geo[front] = { R, W, rimR, carc: st.carc, tr: st.tr, pk: blockTread(R + 0.006, W * 1.04, rimR, 'mud') };
    }
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1, G = geo[frontW];
      const corner = new THREE.Group();
      corner.position.set(side * (frontW ? trackF : trackR) / 2, (frontW ? RF : RR) - cgH, (frontW ? -cgToFront : cgToRear));
      rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      const spin = new THREE.Group(); flip.add(spin);
      const stock = [add(spin, G.carc, M.rubber, 0, 0, 0)].concat(G.tr ? [add(spin, G.tr, M.rubber, 0, 0, 0)] : []);
      const pkg = [add(spin, G.pk.carc, M.rubber, 0, 0, 0), add(spin, G.pk.tr, M.rubber, 0, 0, 0)]; for (const m of pkg) m.visible = false;
      rim(spin, G.R, G.W, G.rimR, wheelStyle.rim);
      if (frontW) add(flip, cylX(0.02, 0.02, 0.08, 8), M.steel, -G.W / 2 - 0.03, 0, 0);
      if (CAR === 'rally') {
        add(spin, cylX(0.15, 0.15, 0.026, 36), M.steel, -0.03, 0, 0);
        add(spin, cylX(0.075, 0.075, 0.03, 20), M.black, -0.03, 0, 0);
        const ph = left ? Math.PI - 0.8 : 0.8, cal = add(flip, rbox(0.055, 0.13, 0.08, 0.018), M.caliper || (M.caliper = new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.4 })), -0.012, 0.12 * Math.sin(ph), 0.12 * Math.cos(ph));
        cal.rotation.x = -ph;
      }
      if (CAR === 'gtr') {
        // the big brakes behind the spokes: a drilled-look disc turning with the wheel, the caliper fixed at its trailing top
        add(spin, cylX(0.19, 0.19, 0.03, 40), M.steel, -0.02, 0, 0);
        add(spin, cylX(0.1, 0.1, 0.034, 24), M.black, -0.02, 0, 0);
        const ph = left ? Math.PI - 0.8 : 0.8, cal = add(flip, rbox(0.06, 0.17, 0.09, 0.02), M.caliper || (M.caliper = new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.4 })), 0.005, 0.15 * Math.sin(ph), 0.15 * Math.cos(ph));
        cal.rotation.x = -ph;
      }
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
      g.font = 'bold 30px Arial'; g.fillStyle = '#8fb2c6'; g.fillText(JETC ? Math.round(t.rpm / 100) + '% N1' : EV ? Math.round(clamp(t.rpm / (t.redline || 1), 0, 1) * 100) + '% MOTOR' : Math.round(t.rpm) + ' RPM', 496, 214);
      clusterTex.needsUpdate = true;
    }
    function drawScreen() {}
    function setPaint(name) {
      const c = PAINTS[name]; if (c === undefined) return;
      if (CAR === 'razor') { M.paint.emissive.setHex(c); M.halo.uniforms.uColor.value.setHex(c); } else M.paint.color.setHex(c);
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
      // (the Razors Edge's black glass is black only from outside: from the seat you see out through it)
      if (M.smoke && M.smoke.transparent !== !!cockpit) {
        M.smoke.transparent = !!cockpit; M.smoke.opacity = cockpit ? 0.28 : 1; M.smoke.depthWrite = !cockpit; M.smoke.needsUpdate = true;
      }
    }
    function setTransmission() {}
    function setTires(front, rear) {
      for (const w of wheels) {
        const t = w.front ? front : rear, on = t === 'ccKnob' || t === 'rallyKnob' || t === 'offroad';
        for (const m of w.stock) m.visible = !on; for (const m of w.pkg) m.visible = on;
      }
    }
    function setChute() {}
    // the jet golf cart: the compressor face spins with the spool, the flame follows the thrust and the afterburner
    // (the thrust tune grows the engine: the game hands over its diameter against stock)
    function setJetSize(sz) { if (jetSize && Math.abs(sz - jetSz) > 1e-3) { jetSz = sz; jetSize(sz); } }
    function setJet(N, ab, thr, dt) {
      if (!jetFx) return;
      jetFx.t += dt;
      if (jetFan) jetFan.rotation.z += N * 45 * dt;
      const on = ab > 0.02 || thr > 0.3;
      jetFx.outer.visible = jetFx.core.visible = on;
      if (!on) return;
      jetFx.outer.scale.z = 0.35 + 1.9 * ab + 0.25 * thr; jetFx.core.scale.z = 0.2 + 0.95 * ab + 0.1 * thr;
      for (const m of [jetFx.outer.material, jetFx.core.material]) { m.uniforms.uAB.value = ab; m.uniforms.uThr.value = thr; m.uniforms.uT.value = jetFx.t; }
    }

    rootG.traverse((o) => { if (o.isMesh && o.material && (o.material.transparent || (Array.isArray(o.material) && false))) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel: SW.sw, eye: toRoot(eye),
      exhaustTips: P.tips, materials: M, headlights: P.spots, tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, setJet, setJetSize, variant: 'cc', cls: CAR,
    };
  }

  root.HCCrushers = { build };
})(typeof self !== 'undefined' ? self : this);
