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

    // a rounded rectangle on a shape / path (front view, x / y)
    function rrPath(pth, x0, y0, x1, y1, r) {
      pth.moveTo(x0 + r, y0); pth.lineTo(x1 - r, y0); pth.quadraticCurveTo(x1, y0, x1, y0 + r); pth.lineTo(x1, y1 - r); pth.quadraticCurveTo(x1, y1, x1 - r, y1);
      pth.lineTo(x0 + r, y1); pth.quadraticCurveTo(x0, y1, x0, y1 - r); pth.lineTo(x0, y0 + r); pth.quadraticCurveTo(x0, y0, x0 + r, y0); return pth;
    }
    // a bowl from a profile [[radius, depth], ...] spun round the y axis (a lamp's reflector)
    const latheGeo = (pts) => new THREE.LatheGeometry(pts.map(([r, d]) => new THREE.Vector2(r, d)), 28);

    // ---------------------------------------------------------------- materials
    const DEF_PAINT = { hotrod: 0xb01020, chevelle: 0x0a0a0c, prius: 0x5f6266, sixseven: 0xc8cbcf, silverbullet: 0xc9cbc6, diesel: 0x1b3a94, ram: 0x0b0c0e, cyber: 0xaeb2b6, golf: 0xeeeeea, rally: 0x1e6fc4, couch: 0x7b4a2b, eggrod: 0xe6e6e3, banana: 0xf2c21b, bluebird: 0x2f6fd0, gtr: 0xb3121a, mini: 0xc6cf2e, potty: 0x3d7cc9, scooter: 0xb01020, razor: 0xf2570f }[CAR];
    const paintHex = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : DEF_PAINT;
    const M = {};
    const brushed = CAR !== 'cyber' ? null : (() => {
      const t = canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < h; y++) { const v = 78 + Math.floor(Math.random() * 34); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, w, 1); }
        for (let k = 0; k < 400; k++) { const v = 60 + Math.floor(Math.random() * 60); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 80, 1); } });
      t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 6); return t;
    })();
    M.paint = CAR === 'cyber' ? new THREE.MeshStandardMaterial({ color: paintHex, metalness: 0.82, roughness: 1, roughnessMap: brushed, envMapIntensity: 1.1 })
      : CAR === 'bluebird' ? new THREE.MeshPhysicalMaterial({ color: paintHex, roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.25, envMapIntensity: 0.6 })
      : CAR === 'couch' ? new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.62, metalness: 0.02 })
      : CAR === 'banana' ? new THREE.MeshPhysicalMaterial({ color: paintHex, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, flatShading: true })
        : CAR === 'potty' ? new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.55, metalness: 0 })
          : CAR === 'razor' ? new THREE.MeshStandardMaterial({ color: 0x000000, emissive: paintHex, emissiveIntensity: 2.4, toneMapped: false })
            : new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: CAR === 'gtr' ? 0.5 : 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, side: CAR === 'gtr' || CAR === 'mini' || CAR === 'eggrod' || CAR === 'ram' || CAR === 'diesel' ? THREE.DoubleSide : THREE.FrontSide });
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
    const SUITS = { hotrod: 0x2a2a2c, chevelle: 0x30353c, prius: 0x3a4250, sixseven: 0x1a1a1c, silverbullet: 0xd9d2bc, diesel: 0x4a5a3a, ram: 0x2e3440, cyber: 0x2a2c30, golf: 0x2d5a3a, rally: 0x1b2f63, couch: 0x2b4a7a, eggrod: 0xe8e8e8, banana: 0x2a6a3a, bluebird: 0xe8e2d0, gtr: 0x222326, mini: 0x5a3d8a, potty: 0x3b6e2e, scooter: 0x3a2a22, razor: 0x1a1a1c };
    M.suit = new THREE.MeshStandardMaterial({ color: SUITS[CAR] || 0x333333, roughness: 0.8 });
    M.pants = new THREE.MeshStandardMaterial({ color: CAR === 'bluebird' || CAR === 'silverbullet' || CAR === 'eggrod' || CAR === 'gtr' ? SUITS[CAR] : 0x2a3446, roughness: 0.85 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: { rally: 0xf2f2f2, golf: 0xd22020, couch: 0xf2c417, eggrod: 0x6fb6e8, bluebird: 0x5a3a22, silverbullet: 0x4a2a16, scooter: 0x141416, potty: 0xf2f2f2, banana: 0xf2c21b }[CAR] || 0xf2f2f2, roughness: CAR === 'bluebird' || CAR === 'silverbullet' ? 0.7 : 0.25, clearcoat: CAR === 'bluebird' || CAR === 'silverbullet' ? 0 : 1 });

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
      if (style === 'squircle') {
        // (the Cybertruck's: a rounded rectangle, wider than tall)
        const q = []; for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); q.push(V3(Math.sign(c) * Math.pow(Math.abs(c), 0.45) * r * 1.2, Math.sign(s) * Math.pow(Math.abs(s), 0.45) * r * 0.82, 0)); }
        add(sw, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(q, true), 96, 0.017, 8, true), M.black, 0, 0, 0);
      } else add(sw, new THREE.TorusGeometry(r, style === 'thin' ? 0.009 : 0.016, 10, 32), style === 'wood' ? new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.5 }) : M.black, 0, 0, 0);
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

    // ---------------------------------------------------------------- Cybertruck
    // Flat stainless panels. The profile is two straight lines: from the light bar across the nose (1.04 m) the hood and
    // the windscreen rise as one plane to the peak over the B-pillar (1.79 m), and from there the glass roof and the
    // vault over the bed fall as one to the tailgate (1.12 m). The sides are flat, leaning out a touch to a crease at the
    // window line; the greenhouse above it leans in. Trapezoid wheel openings with black flares, black rockers and
    // bumpers, a light bar across the nose and one across the tail, frameless glass, the one big wiper, the vault's dark
    // cover. A section at each station, right half, 7 points: underside centre (0), rocker (1), the foot of the side (2),
    // the crease (3: where the side meets the greenhouse - or the hood / vault edge, ahead of and behind the cab), the
    // roof edge (4), a hair in from it (5), the top centre (6)
    // ---------------------------------------------------------------- Ram 1500 Rebel (DT, 2019-24)
    // Crew cab, 5'7" box: 5.92 m long, 2.09 m wide, 1.99 m tall on a 3.67 m wheelbase. The body the Challenger's way - a
    // section at each station - in two pieces: the front clip and cab (the hood with the Rebel's power dome, the
    // windshield, the doors' glass with the black B-pillar, the roof), and the box (its sides, black rail caps, a lined
    // floor with the wheel tubs); the shoulder crease runs from the headlamps back to the tail lamps. Black: the flares,
    // the bumpers (the front one wrapping up under the headlamps, fog lamps and a skid plate in it), the grille (a
    // honeycomb in a heavy frame with the bar across it), the mirrors, handles and running boards. LED headlamps: two
    // projectors each under a DRL strip along the top that turns down the outer end. 18 in black six-spokes on 33 in
    // all-terrains. Inside: the dash with the 12 in portrait screen, buckets, the rear bench
    B.ram = () => {
      WF = 0.275; WR = 0.275;
      wheelStyle = { rim: 'ram', rimR: 0.229, tread: 'at' };
      M.paint.side = THREE.DoubleSide; M.paint.envMapIntensity = 0.55; M.paint.roughness = 0.24;
      M.frame = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: 0.32, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.5 });
      M.tint.color.setHex(0x0a0d10); M.tint.metalness = 0.5;
      M.clad = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.78, metalness: 0.05 });
      M.cladD = Object.assign(M.clad.clone(), { side: THREE.DoubleSide });
      M.liner = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
      M.seam = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.6 });
      M.drl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.4, toneMapped: false });
      M.lampIn = new THREE.MeshStandardMaterial({ color: 0xd4d9df, roughness: 0.16, metalness: 0.95, emissive: 0x20242a });
      M.lampSmoke = new THREE.MeshStandardMaterial({ color: 0x5b6169, roughness: 0.2, metalness: 0.9 });
      M.lampLens = new THREE.MeshPhysicalMaterial({ color: 0x0c0f13, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
      M.trimIn = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.85, side: THREE.DoubleSide });
      M.hidden = new THREE.MeshBasicMaterial({ visible: false });
      const AR = 0.56, zN = zF - 0.955, zC = -1.02, zRF = -0.3, zCB = 1.17, zBF = 1.22, zT = zR + 1.245;
      const ySh = 1.2, yRail = 1.37, yFl = 0.9;
      const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1), sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
      const archH = (z, base, zc, R) => { const d = Math.abs(z - zc); return d < R ? Math.max(base, RF + Math.sqrt(R * R - d * d) * 0.98) : base; };
      // (half width at the shoulder: the nose's corners rounded in plan, ~0.2 m radius, body colour round them)
      const Wz = (z) => { const u = (zN + 0.2 - z) / 0.2; return u <= 0 ? 1.0 : 0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - u * u)); };
      const hoodEdge = (z) => lerp(1.265, 1.375, (z - zN) / (zC - zN));
      const hoodMid = (z) => hoodEdge(z) + 0.012 + 0.03 * sm((z - zN) / 0.3);
      const dome = (z) => 0.05 * sm((z - zN - 0.1) / 0.3);
      const belt = (z) => 1.405 + 0.02 * clamp((z - zC) / (zCB - zC), 0, 1);
      // the lower side: slightly convex up to the shoulder crease (the points kept above the arches)
      const lower = (W, yb) => { const s = [yb + 0.12, 0.8, 1.05, ySh - 0.02].map((y, i) => Math.max(y, yb + 0.12 + i * 0.02));
        return [[0, yb], [W - 0.12, yb], [W - 0.02, yb + 0.04], [W + 0.005, s[0]], [W + 0.015, s[1]], [W + 0.02, s[2]], [W + 0.012, s[3]], [W, ySh]]; };
      // ---- the front clip and the cab (bands: 0 underside, 1-7 the side up to the crease and the fender / door tops,
      // 8 the hood's edge / the window seal, 9 the hood's flank / the side glass, 10 the dome's edge / the roof edge and
      // A-pillar, 11-12 the hood's dome / the windshield / the roof)
      const secCab = (z) => {
        const W = Wz(z), yb = archH(z, z < zF ? 0.62 : 0.44, zF, AR);
        let P;
        if (z < zC) {
          const he = hoodEdge(z), hm = hoodMid(z), dm = dome(z);
          P = [[W - 0.03, he - 0.012], [W - 0.06, he], [0.6, hm - 0.008], [0.5, hm + dm * 0.2], [0.44, hm + dm], [0, hm + dm + 0.006]];
        } else {
          const t = (z - zC) / (zRF - zC), yb2 = belt(z), back = sm((z - (zCB - 0.14)) / 0.14);
          const yTop = t < 1 ? lerp(hoodMid(zC) + dome(zC) + 0.012, 1.975, t) : 1.975 - 0.045 * back;
          const eY = t < 1 ? lerp(yb2 + 0.035, 1.925, t) : 1.925 - 0.045 * back, wT = lerp(0.9, 0.8, t);
          P = [[W - 0.03, yb2 - 0.012], [0.945, yb2 + 0.012], [wT, eY], [wT - 0.07, Math.max(eY + 0.002, yTop - 0.03)], [0.4, yTop - 0.004], [0, yTop]];
        }
        return lower(W, yb).concat(P);
      };
      const inWin = (z) => (z > -0.95 && z < -0.02) || (z > 0.06 && z < 0.93), inB = (z) => z >= -0.02 && z <= 0.06;
      const ST = stationsOf(zN, zCB, 0.05, [zN + 0.02, zN + 0.06, zN + 0.12, zN + 0.2, zC - 0.012, zC, zC + 0.05, zRF, -0.98, -0.95, -0.02, 0.06, 0.93, 0.95, zCB - 0.14, zCB - 0.07, zCB - 0.02,
        zF - AR, zF - AR + 0.02, zF + AR - 0.02, zF + AR]);
      const cabBody = carBody({
        stations: ST, section: secCab, capMat: 4,
        mat: (b, z) => {
          if (b === 0) return 2;
          if (b <= 7) return 0;
          if (z < zC) return 0;                                                           // the hood
          if (b === 8) return z > -0.98 && z < 0.95 ? 2 : 0;                              // the window seal
          if (b === 9) return inWin(z) ? 1 : inB(z) || (z > -0.98 && z <= -0.95) ? 2 : 0; // the side glass, the B-pillar, the mirror sail
          if (b === 10) return inB(z) ? 2 : 0;                                            // the roof edge / A-pillar
          return z < zRF ? 3 : 0;                                                         // the windshield, the roof
        },
      });
      add(body, cabBody, [M.paint, M.tint, M.black, M.glass, M.hidden], 0, 0, 0);
      // the ends: the nose behind the grille (black), the cab's back (paint) with its big back window and the third
      // brake lamp; the box's ends black (the tailgate covers the back)
      const capGeo = (P) => { const s = new THREE.Shape(); s.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]); for (let i = P.length - 2; i > 0; i--) s.lineTo(-P[i][0], P[i][1]); s.closePath(); return new THREE.ShapeGeometry(s, 4); };
      add(body, capGeo(secCab(zN)), M.cladD, 0, 0, zN, 0, 0, 0, false);
      add(body, capGeo(secCab(zCB)), M.paint, 0, 0, zCB, 0, 0, 0, false);
      { const rw = new THREE.Shape(); rw.moveTo(-0.6, 1.47); rw.lineTo(0.6, 1.47); rw.lineTo(0.57, 1.86); rw.quadraticCurveTo(0.56, 1.88, 0.53, 1.88); rw.lineTo(-0.53, 1.88); rw.quadraticCurveTo(-0.56, 1.88, -0.57, 1.86); rw.closePath();
        add(body, new THREE.ShapeGeometry(rw, 6), M.tint, 0, 0, zCB + 0.004, 0, 0, 0, false);
        for (const x of [-0.2, 0.2]) add(body, new THREE.BoxGeometry(0.012, 0.4, 0.004), M.black, x, 1.675, zCB + 0.008, 0, 0, 0, false);   // (the sliding centre panel)
        add(body, rbox(0.34, 0.03, 0.02, 0.008), M.tail, 0, 1.92, zCB + 0.01, 0, 0, 0, false); }
      // ---- the box
      const yBb = (z) => archH(z, 0.6, zR, AR);
      const tub = (z) => { const d = Math.abs(z - zR), r = AR + 0.05; return d < r ? Math.min(yRail - 0.12, RR + Math.sqrt(r * r - d * d) + 0.04) : yFl; };
      const secBed = (z) => { const hu = Math.max(yFl, tub(z));
        return lower(1.0, yBb(z)).concat([[0.99, yRail - 0.02], [0.985, yRail], [0.93, yRail + 0.004], [0.92, yRail - 0.02], [0.915, hu], [0.66, hu], [0.6, yFl], [0, yFl]]); };
      const bedBody = carBody({
        stations: stationsOf(zBF, zT, 0.05, [zBF + 0.02, zT - 0.02, zR - AR - 0.05, zR - AR, zR - AR + 0.02, zR + AR - 0.02, zR + AR, zR + AR + 0.05]),
        section: secBed, capMat: 4,
        mat: (b) => (b === 0 ? 2 : b <= 8 ? 0 : b <= 10 ? 5 : 6),
      });
      add(body, bedBody, [M.paint, M.tint, M.black, M.glass, M.hidden, M.clad, M.liner], 0, 0, 0);
      add(body, capGeo(secBed(zBF)), M.cladD, 0, 0, zBF, 0, 0, 0, false);
      add(body, capGeo(secBed(zT)), M.cladD, 0, 0, zT - 0.001, 0, 0, 0, false);
      add(body, rbox(1.83, yRail - yFl, 0.05, 0.01), M.liner, 0, (yRail + yFl) / 2 - 0.005, zBF + 0.03);                        // the box's front wall
      // the tailgate: paint, a black cap along its top, the handle; the tail lamps in the box's corners
      add(body, rbox(1.82, 0.74, 0.06, 0.02), M.paint, 0, 1.0, zT - 0.03);
      add(body, rbox(1.82, 0.03, 0.07, 0.01), M.clad, 0, 1.372, zT - 0.03);
      add(body, rbox(0.3, 0.07, 0.03, 0.012), M.clad, 0, 1.25, zT + 0.005);
      for (const sx of [-1, 1]) {
        const tl = new THREE.Group(); tl.position.set(sx * 0.957, 1.17, zT + 0.004); body.add(tl);
        add(tl, rbox(0.09, 0.4, 0.05, 0.015), M.black, 0, 0, -0.02);
        add(tl, rbox(0.075, 0.26, 0.012, 0.01), M.tail, 0, 0.06, 0.006, 0, 0, 0, false);
        add(tl, rbox(0.075, 0.08, 0.012, 0.01), M.lens || (M.lens = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.1, metalness: 0.4 })), 0, -0.13, 0.006, 0, 0, 0, false);
        add(tl, rbox(0.014, 0.2, 0.014, 0.006), M.drl, -sx * 0.022, 0.06, 0.012, 0, 0, 0, false);   // (the LED bar inside)
      }
      // the rear bumper, its step pad, the plate
      add(body, profile([[zT - 0.12, 0.72], [zT + 0.08, 0.72], [zT + 0.1, 0.68], [zT + 0.1, 0.5], [zT + 0.06, 0.44], [zT - 0.12, 0.44]], 2.0, 0.03), M.clad, 0, 0, 0);
      add(body, rbox(0.5, 0.012, 0.16, 0.005), M.black, 0, 0.726, zT + 0.0);
      add(body, rbox(0.3, 0.15, 0.01, 0.005), M.white, 0, 0.575, zT + 0.105, 0, 0, 0, false);
      // ---- the nose: the grille (heavy black frame, the lower corners chamfered, a honeycomb in it, the bar across),
      // the headlamps, the bumper (black, up under the headlamps at the corners) with the fog lamps, the lower grille,
      // tow hooks and the skid plate
      const GZ = zN - 0.012;
      const lampCurve = (u) => {
        const L0 = 0.8 - 0.588, s1 = u * (L0 + 0.2 * 1.15);
        if (s1 <= L0) return { x: 0.588 + s1, z: zN, nx: 0, nz: -1 };
        const f = (s1 - L0) / 0.2; return { x: 0.8 + 0.2 * Math.sin(f), z: zN + 0.2 - 0.2 * Math.cos(f), nx: Math.sin(f), nz: -Math.cos(f) };
      };
      const lampYt = (u) => 1.243 - 0.022 * u * u, lampYb = (u) => 1.078 + 0.055 * u * u;
      function lampStrip(sx, u0, u1, yb, yt, off) {
        const pos = [], idx = [], n = 28;
        for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n, c = lampCurve(u), x = sx * (c.x + c.nx * off), z = c.z + c.nz * off; pos.push(x, yb(u), z, x, yt(u), z); }
        for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
      }
      M.lampBezel = new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.3, metalness: 0.2, clearcoat: 0.6, side: THREE.DoubleSide });
      M.lampGlass = new THREE.MeshStandardMaterial({ color: 0x353a41, roughness: 0.16, metalness: 0.9, side: THREE.DoubleSide });
      M.lampChrome = new THREE.MeshStandardMaterial({ color: 0xc8cdd3, roughness: 0.14, metalness: 1, side: THREE.DoubleSide });
      M.drlD = Object.assign(M.drl.clone(), { side: THREE.DoubleSide });
      M.amber.side = THREE.DoubleSide; M.amberD = M.amber;
      // (polygons in the front view, (x, y): a point-in test, a path, an inset of a convex anticlockwise one)
      const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
      const polyPath = (P, path) => { path.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) path.lineTo(P[i][0], P[i][1]); path.closePath(); return path; };
      const inset = (P, d) => P.map((_, i) => {
        const n = P.length, a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
        const off = (p, q) => { const ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey); return { px: p[0] - ey / l * d, py: p[1] + ex / l * d, ex, ey }; };
        const L1 = off(a, b), L2 = off(b, c), den = L1.ex * L2.ey - L1.ey * L2.ex, t = ((L2.px - L1.px) * L2.ey - (L2.py - L1.py) * L2.ex) / den;
        return [L1.px + L1.ex * t, L1.py + L1.ey * t];
      });
      // a honeycomb: a plate cut with hexagonal cells (pointy-topped, radius r, webs w wide) wherever a whole cell fits
      // inside the outline P - real openings with depth, each cell lit on its own
      function honeycomb(P, r, w, depth) {
        const sh = polyPath(P, new THREE.Shape()), dx = Math.sqrt(3) * r, dy = 1.5 * r, hr = r - w / Math.sqrt(3);
        const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        for (let row = 0, y = y0 + r * 0.8; y < y1; row++, y += dy) for (let x = x0 - dx + (row & 1 ? dx / 2 : 0); x < x1 + dx; x += dx) {
          const V = [], Vm = [];
          for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; V.push([x + Math.cos(a) * hr, y + Math.sin(a) * hr]); Vm.push([x + Math.cos(a) * (hr + w * 0.8), y + Math.sin(a) * (hr + w * 0.8)]); }
          if (Vm.every(([vx, vy]) => inPoly(P, vx, vy))) sh.holes.push(polyPath(V, new THREE.Path()));
        }
        return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 });
      }
      // the Rebel's grille: an octagon - straight across the top under the hood lip, straight down the sides, the lower
      // corners cut away at 45 deg to a narrower bottom - in a heavy satin-black surround with a stepped gloss lip inside
      // it, a big open honeycomb recessed behind that, and the radiator's fins dark behind the cells
      const G_OUT = [[-0.44, 0.745], [0.44, 0.745], [0.585, 0.9], [0.585, 1.262], [-0.585, 1.262], [-0.585, 0.9]];
      const G_LIP = inset(G_OUT, 0.046), G_IN = inset(G_OUT, 0.06);
      { const sh = polyPath(G_OUT, new THREE.Shape()); sh.holes.push(polyPath(G_LIP, new THREE.Path()));
        add(body, new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 3 }), M.clad, 0, 0, GZ - 0.058);
        const lip = polyPath(G_LIP, new THREE.Shape()); lip.holes.push(polyPath(G_IN, new THREE.Path()));
        add(body, new THREE.ExtrudeGeometry(lip, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 }), M.frame, 0, 0, GZ - 0.046);
        add(body, honeycomb(inset(G_OUT, 0.052), 0.032, 0.009, 0.024), M.frame, 0, 0, GZ - 0.042);
        const fin = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h); g.fillStyle = '#26282c'; for (let k = 0; k < 8; k++) g.fillRect(k * 8, 0, 3, h); g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, w, 10); });
        fin.wrapS = fin.wrapT = THREE.RepeatWrapping; fin.repeat.set(40, 40);
        add(body, new THREE.ShapeGeometry(polyPath(inset(G_OUT, 0.045), new THREE.Shape())), new THREE.MeshStandardMaterial({ map: fin, roughness: 0.7, metalness: 0.4 }), 0, 0, GZ + 0.005, 0, 0, 0, false);
        // (the surround's top is a heavier beam than its sides)
        add(body, rbox(1.08, 0.046, 0.034, 0.012), M.clad, 0, 1.2, GZ - 0.05); }
      for (const sx of [-1, 1]) {
        // headlamp: one piece wrapping the fender's rounded corner - a black bezel, the smoked lens, the LED light bar
        // along its top all the way round, two projectors on the front, a chrome reflector and the amber signal round
        // the corner (it narrows towards its outer end)
        add(body, lampStrip(sx, 0, 1, (u) => lampYb(u) - 0.013, (u) => lampYt(u) + 0.011, 0.022), M.lampBezel, 0, 0, 0, 0, 0, 0, false);
        add(body, lampStrip(sx, 0, 1, lampYb, lampYt, 0.027), M.lampGlass, 0, 0, 0, 0, 0, 0, false);
        add(body, lampStrip(sx, 0, 1, (u) => lampYt(u) - 0.032, (u) => lampYt(u) - 0.008, 0.031), M.drlD, 0, 0, 0, 0, 0, 0, false);
        add(body, lampStrip(sx, 0.52, 0.97, (u) => lampYb(u) + 0.036, (u) => lampYt(u) - 0.042, 0.03), M.lampChrome, 0, 0, 0, 0, 0, 0, false);
        add(body, lampStrip(sx, 0.55, 0.95, (u) => lampYb(u) + 0.01, (u) => lampYb(u) + 0.028, 0.031), M.amberD, 0, 0, 0, 0, 0, 0, false);
        for (const px of [0.648, 0.748]) {
          add(body, cylZ(0.053, 0.053, 0.008, 28), M.lampBezel, sx * px, 1.142, zN - 0.031);
          add(body, new THREE.TorusGeometry(0.044, 0.007, 8, 28), M.chrome, sx * px, 1.142, zN - 0.036, 0, 0, 0, false);
          add(body, new THREE.SphereGeometry(0.04, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).rotateX(-Math.PI / 2), M.lampLens, sx * px, 1.142, zN - 0.035, 0, 0, 0, false);
          add(body, new THREE.CircleGeometry(0.014, 16), M.head, sx * px, 1.142, zN - 0.052, 0, Math.PI, 0, false);
        }
        add(body, rbox(0.22, 0.29, 0.04, 0.012), M.clad, sx * 0.69, 0.905, zN - 0.004);                                 // (the black under the lamp)
      }
      spots(0.72, 1.15, zN - 0.02);
      // the bumper: a profile across the front, rounded corners wrapping back, the corners rising to the headlamps
      { const bp = new THREE.Shape(), zf = zN - 0.07, zc = zN + 0.2, zb = zF - AR - 0.03, bx = 0.985, bi = bx - 0.1;
        bp.moveTo(-0.72, -zf); bp.lineTo(0.72, -zf); bp.quadraticCurveTo(bx, -zf, bx, -zc); bp.lineTo(bx, -zb); bp.lineTo(bi, -zb); bp.lineTo(bi, -(zN + 0.25));
        bp.lineTo(-bi, -(zN + 0.25)); bp.lineTo(-bi, -zb); bp.lineTo(-bx, -zb); bp.lineTo(-bx, -zc); bp.quadraticCurveTo(-bx, -zf, -0.72, -zf); bp.closePath();
        const bg = new THREE.ExtrudeGeometry(bp, { depth: 0.29, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 12 });
        bg.rotateX(-Math.PI / 2); add(body, bg, M.clad, 0, 0.46, 0); }
      for (const sx of [-1, 1]) {
        add(body, rbox(0.23, 0.1, 0.03, 0.022), M.frame, sx * 0.66, 0.6, zN - 0.094);
        add(body, rbox(0.17, 0.042, 0.012, 0.012), M.lampIn, sx * 0.665, 0.6, zN - 0.109, 0, 0, 0, false);
        add(body, new THREE.PlaneGeometry(0.15, 0.012), M.head, sx * 0.665, 0.6, zN - 0.1155, 0, Math.PI, 0, false);
        add(body, rbox(0.035, 0.07, 0.14, 0.012), M.steel, sx * 0.5, 0.425, zN - 0.05);
      }
      { const L = [[-0.42, 0.515], [0.42, 0.515], [0.42, 0.655], [-0.42, 0.655]];
        add(body, honeycomb(L, 0.021, 0.006, 0.014), M.frame, 0, 0, zN - 0.104);
        const fr = polyPath([[-0.44, 0.498], [0.44, 0.498], [0.44, 0.672], [-0.44, 0.672]], new THREE.Shape()); fr.holes.push(polyPath(L, new THREE.Path()));
        add(body, new THREE.ExtrudeGeometry(fr, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 }), M.frame, 0, 0, zN - 0.112); }
      for (const x of [-0.24, 0, 0.24]) add(body, rbox(0.15, 0.042, 0.012, 0.008), M.frame, x, 0.472, zN - 0.095);
      add(body, rbox(1.1, 0.03, 0.4, 0.01), M.steel, 0, 0.38, zN + 0.16, 0.2, 0, 0);                                  // skid plate
      // the hood: its shut lines, the dome's two vents, the wipers
      const seam = (a, b) => tubeAB(body, a, b, 0.0035, M.seam, 5);
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 6; k++) { const z0 = zN + 0.03 + k * (zC - zN - 0.05) / 6, z1 = zN + 0.03 + (k + 1) * (zC - zN - 0.05) / 6;
          seam(V3(sx * (Wz(z0) - 0.045), hoodEdge(z0) + 0.001, z0), V3(sx * (Wz(z1) - 0.045), hoodEdge(z1) + 0.001, z1)); }
        const vz = zN + 0.24, vy = hoodMid(vz) + dome(vz) * 0.75;
        add(body, rbox(0.26, 0.03, 0.08, 0.01), M.gloss, sx * 0.2, vy + 0.004, vz, -0.18, 0, 0);
        tubeAB(body, V3(sx * 0.06, 1.505, zC + 0.045), V3(sx * 0.57, 1.495, zC + 0.05), 0.009, M.black, 6);
      }
      seam(V3(-0.93, hoodEdge(zC - 0.02) + 0.004, zC - 0.02), V3(0.93, hoodEdge(zC - 0.02) + 0.004, zC - 0.02));
      // the flares (square-edged black arches), the wheel liners
      for (const [zc, rr] of [[zF, AR], [zR, AR]]) for (const sx of [-1, 1]) {
        add(body, arcGeo(zc, RF, rr - 0.005, rr + 0.075, 0.1, Math.PI - 0.1, 0.085), M.clad, sx > 0 ? 0.965 : -1.05, 0, 0);
        add(body, rbox(0.02, 0.5, 1.12, 0.005), M.cladD, sx * 0.62, zc === zF ? 0.78 : 0.82, zc);
      }
      // the sides: door shut lines, black handles, the mirrors on their sails, the running boards
      for (const sx of [-1, 1]) {
        const xs = (y) => sx * (1.0 + (y > 1.0 ? 0.012 : 0.018) + 0.002);
        for (const z of [-0.985, 0.02, 0.95]) { seam(V3(xs(0.5), 0.5, z), V3(sx * 1.014, ySh - 0.01, z)); seam(V3(sx * 0.999, ySh + 0.005, z), V3(sx * 0.973, belt(z) - 0.014, z)); }
        seam(V3(xs(0.5), 0.49, -0.985), V3(xs(0.5), 0.49, 0.95));
        for (const z of [-0.36, 0.56]) add(body, rbox(0.024, 0.045, 0.2, 0.012), M.clad, sx * 1.03, 1.14, z);
        const my = 1.6, mz = -0.84;
        add(body, rbox(0.05, 0.13, 0.14, 0.02), M.clad, sx * 0.975, belt(mz) + 0.04, mz - 0.02);
        add(body, rbox(0.12, 0.05, 0.1, 0.02), M.clad, sx * 1.04, 1.48, mz, 0, 0, sx * 0.35);
        const mh = new THREE.Group(); mh.position.set(sx * 1.16, my, mz + 0.02); mh.rotation.y = -sx * 0.12; body.add(mh);
        add(mh, rbox(0.28, 0.21, 0.1, 0.045), M.clad, sx * 0.03, 0, 0);
        add(mh, new THREE.PlaneGeometry(0.25, 0.18), M.chrome, sx * 0.03, 0, 0.051, 0, 0, 0, false);
        add(mh, rbox(0.1, 0.018, 0.02, 0.006), M.amber, sx * 0.1, -0.06, -0.049, 0, 0, 0, false);
        add(body, rbox(0.2, 0.045, 1.95, 0.015), M.clad, sx * 1.12, 0.395, -0.02);
        for (const z of [-0.7, 0.62]) add(body, rbox(0.14, 0.03, 0.06, 0.01), M.black, sx * 1.02, 0.42, z);
      }
      // the exhaust: a single tip out behind the right rear wheel, turned down
      add(body, cylZ(0.045, 0.045, 0.16, 16, true), M.chrome, 0.62, 0.43, zR + 0.72);
      P.tips.push(toRoot(V3(0.62, 0.43, zR + 0.82)));
      // ---- inside: the floor, door trims, headliner, the dash (cluster under its hood, the 12 in portrait screen), the
      // console, two buckets and the rear bench
      add(body, rbox(1.9, 0.04, 2.1, 0.01), M.trimIn, 0, 0.6, 0.06);
      for (const sx of [-1, 1]) add(body, new THREE.PlaneGeometry(1.93, 0.8), M.trimIn, sx * 0.975, 1.0, -0.02, 0, sx * Math.PI / 2, 0, false);
      add(body, new THREE.PlaneGeometry(1.6, 1.4), M.trimIn, 0, 1.905, 0.4, Math.PI / 2, 0, 0, false);
      add(body, new THREE.PlaneGeometry(1.9, 0.82), M.trimIn, 0, 1.03, zCB - 0.02, 0, 0, 0, false);
      add(body, rbox(1.92, 0.34, 0.42, 0.08), M.black, 0, 1.2, -0.82);
      add(body, rbox(0.5, 0.1, 0.22, 0.04), M.black, -0.44, 1.41, -0.72);
      add(body, rbox(0.3, 0.36, 0.18, 0.05), M.black, 0.03, 1.12, -0.7);
      const scr = canvasTex(256, 384, (g, w, h) => {
        g.fillStyle = '#0a0f16'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1b2a3a'; g.fillRect(10, 10, w - 20, h * 0.55);
        g.strokeStyle = '#3d6f9e'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 180); g.bezierCurveTo(90, 120, 140, 160, 220, 60); g.stroke();
        g.fillStyle = '#e8313a'; g.beginPath(); g.arc(128, 120, 7, 0, 7); g.fill();
        g.fillStyle = '#1c2530'; for (let k = 0; k < 3; k++) g.fillRect(10 + k * 82, h * 0.62, 72, 60);
        g.fillStyle = '#8fb2c6'; g.fillRect(10, h * 0.84, w - 20, 8); g.fillRect(10, h * 0.9, (w - 20) * 0.6, 8);
      });
      add(body, new THREE.PlaneGeometry(0.19, 0.28), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false }), 0.03, 1.15, -0.607, -0.08, 0, 0, false);
      add(body, rbox(0.3, 0.26, 0.85, 0.05), M.seat, 0, 0.8, -0.1);
      for (const sx of [-1, 1]) {
        add(body, rbox(0.52, 0.14, 0.52, 0.05), M.seat, sx * 0.44, 0.9, 0.02);
        add(body, rbox(0.52, 0.7, 0.12, 0.05), M.seat, sx * 0.44, 1.3, 0.3, 0.2, 0, 0);
        add(body, rbox(0.26, 0.16, 0.1, 0.04), M.seat, sx * 0.44, 1.73, 0.37, 0.2, 0, 0);
      }
      add(body, rbox(1.56, 0.14, 0.5, 0.05), M.seat, 0, 0.92, 0.8);
      add(body, rbox(1.56, 0.62, 0.12, 0.05), M.seat, 0, 1.28, 1.07, 0.2, 0, 0);
      SW = steering(V3(-0.44, 1.25, -0.47), 0.45, 0.19);
      tubeAB(body, V3(-0.44, 1.25, -0.48), V3(-0.44, 1.17, -0.64), 0.03, M.black, 10);
      cluster = { parent: body, pos: V3(-0.44, 1.335, -0.605), rot: -0.2, w: 0.36, h: 0.14 };
      driver = person({ hip: V3(-0.44, 1.0, 0.04), lean: 0.22, hands: [V3(-0.6, 1.28, -0.46), V3(-0.28, 1.28, -0.46)],
        knee: { dx: 0.1, y: 1.1, z: -0.42 }, foot: { dx: 0.12, y: 0.66, z: -0.8 }, helmet: false });
      P.hideCockpit.push(driver);
    };

    // ---------------------------------------------------------------- Diesel dually (2nd-gen one-ton, '98-'02)
    // The big-rig front: the hood stands well above the front fenders, which drop away to the headlamps; a tall chrome
    // crosshair grille, big clear headlamps with the park / turn lamps under them, a chrome bumper; a Quad Cab with the
    // front window's sill dropped at its leading corner, five amber cab lights on the roof, towing mirrors; the 8 ft box
    // between the dually fenders, tall tail lamps, a chrome step bumper; polished 16 in 8-lug wheels, duals at the back.
    // Versions: stock (its exhaust out the side ahead of the duals), the built street truck (twin stacks in the bed) and
    // the pulling truck (a short stack up through a primer-grey hood, the hitch)
    B.diesel = () => {
      WF = 0.235; WR = 0.235;
      wheelStyle = { rim: 'dualF', rimRR: 0.2, rimR: 0.2, tread: 'hwy' };
      const PULL = ENGINE === 'pull', BUILT = ENGINE === 'built';
      M.paint.envMapIntensity = 0.7; M.paint.roughness = 0.26; M.paint.side = THREE.DoubleSide;
      M.hood = PULL ? new THREE.MeshStandardMaterial({ color: 0x6b6e72, roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide }) : M.paint;
      M.clad = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.75, metalness: 0.05 });
      M.cladD = Object.assign(M.clad.clone(), { side: THREE.DoubleSide });
      M.chromeD = Object.assign(M.chrome.clone(), { side: THREE.DoubleSide });
      M.liner = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95, side: THREE.DoubleSide });
      M.seam = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.6 });
      M.trimIn = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.85, side: THREE.DoubleSide });
      M.hidden = new THREE.MeshBasicMaterial({ visible: false });
      M.tint.color.setHex(0x1a2026); M.tint.metalness = 0.4;
      M.lampRefl = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.1, metalness: 1, emissive: 0x1a1d22, side: THREE.DoubleSide });
      M.clearLens = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false });
      const AR = 0.5, ARR = 0.53, zN = zF - 0.86, zC = -1.18, zRF = -0.5, zCB = 0.62, zBF = 0.68, zT = zR + 1.22;
      const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1), sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
      const archH = (z, base, zc, R, rw) => { const d = Math.abs(z - zc); return d < R ? Math.max(base, rw + Math.sqrt(R * R - d * d) * 0.98) : base; };
      // the lower side, up to the body's crease (the points kept above the arches)
      const lower = (W, yb) => [[0, yb], [W - 0.1, yb], [W - 0.02, yb + 0.04], [W + 0.005, Math.max(yb + 0.12, 0.86)], [W + 0.012, Math.max(yb + 0.16, 1.0)], [W + 0.01, Math.max(yb + 0.2, 1.12)]];
      // ---- the front clip: the fenders (their tops rise from the headlamps back to the cowl) and the hood above them,
      // the hood's raised centre narrowing to the grille's crossbar (bands: 0 underside, 1-4 the side, 5 above the crease,
      // 6 the fender's edge, 7 its top, 8 the step up, 9 the hood's edge, 10 the hood, 11-12 its raised centre)
      const uF = (z) => clamp((z - zN) / (zC - zN), 0, 1);
      const Wz = (z) => { const u = (zN + 0.07 - z) / 0.07; return u <= 0 ? 1.0 : 0.93 + 0.07 * Math.sqrt(Math.max(0, 1 - u * u)); };
      const fTop = (z) => 1.255 + 0.135 * Math.sqrt(uF(z)) - 0.02 * Math.pow(Math.max(0, 1 - (z - zN) / 0.08), 2);
      const hEdge = (z) => 1.335 + 0.105 * sm(uF(z) * 1.2), xH = 0.78, xr = (z) => lerp(0.075, 0.28, uF(z));
      const secFront = (z) => {
        const W = Wz(z), yb = archH(z, 0.74, zF, AR, RF), ft = fTop(z), he = hEdge(z), hm = he + 0.012;
        return lower(W, yb).concat([[W, ft - 0.03], [W - 0.03, ft], [xH + 0.04, ft + 0.004], [xH + 0.012, he - 0.012], [xH - 0.015, he], [xr(z) + 0.035, hm], [xr(z), hm + 0.026], [0, hm + 0.028]]);
      };
      const front = carBody({
        stations: stationsOf(zN, zC, 0.05, [zN + 0.02, zN + 0.05, zN + 0.1, zF - AR, zF - AR + 0.02, zF + AR - 0.02, zF + AR, zC - 0.02]),
        section: secFront, capMat: 4,
        mat: (b) => (b === 0 ? 2 : b >= 9 ? 5 : 0),
      });
      add(body, front, [M.paint, M.tint, M.black, M.glass, M.hidden, M.hood], 0, 0, 0);
      // ---- the cab: the windshield rising from the cowl to the roof, the side glass over the dropped sill, the roof
      // (bands: 0-5 as the front, 6 the belt, 7 the window seal, 8 the side glass, 9 the drip rail / A-pillar, 10 the roof's
      // edge / the windshield's frame, 11-12 the windshield / roof)
      const cowl = 1.455, roof = 1.98, roofE = 1.95, Wr = 0.83, Wg = 0.945;
      const belt = (z) => 1.395 + 0.04 * sm((z - zC) / 0.32);
      const secCab = (z) => {
        const t = clamp((z - zC) / (zRF - zC), 0, 1), bl = belt(z), back = sm((z - (zCB - 0.12)) / 0.12);
        const rf = roof - 0.04 * back, rE = roofE - 0.04 * back;
        return lower(1.0, 0.62).concat([[1.0, bl - 0.03], [0.97, bl], [Wg, bl + 0.02],
          [lerp(0.935, Wr + 0.015, t), lerp(bl + 0.05, rE - 0.05, t)], [lerp(0.905, Wr, t), lerp(cowl + 0.03, rE, t)],
          [lerp(0.82, Wr - 0.1, t), lerp(cowl + 0.032, rf - 0.01, t)], [0.35, lerp(cowl + 0.036, rf, t)], [0, lerp(cowl + 0.036, rf, t)]]);
      };
      const inWin = (z) => (z > zC + 0.02 && z < -0.09) || (z > 0.0 && z < 0.5), inB = (z) => z >= -0.09 && z <= 0.0;
      const cab = carBody({
        stations: stationsOf(zC, zCB, 0.05, [zC + 0.02, zC + 0.05, zRF, -0.11, -0.09, 0.0, 0.02, 0.5, 0.52, zCB - 0.12, zCB - 0.06, zCB - 0.02]),
        section: secCab, capMat: 4,
        mat: (b, z) => {
          if (b === 0) return 2;
          if (b <= 6) return 0;
          if (b === 7) return 2;                                                             // the window seal
          if (b === 8) return inWin(z) ? 1 : inB(z) ? 2 : 0;                                 // the side glass, the B-pillar
          if (b === 9) return 0;                                                             // the drip rail / A-pillar
          if (b === 10) return z < zRF ? 2 : 0;
          return z < zRF ? 3 : 0;                                                            // the windshield, the roof
        },
      });
      add(body, cab, [M.paint, M.tint, M.black, M.glass, M.hidden], 0, 0, 0);
      const capGeo = (P) => { const sh = new THREE.Shape(); sh.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) sh.lineTo(P[i][0], P[i][1]); for (let i = P.length - 2; i > 0; i--) sh.lineTo(-P[i][0], P[i][1]); sh.closePath(); return new THREE.ShapeGeometry(sh, 4); };
      add(body, capGeo(secFront(zN)), M.paint, 0, 0, zN, 0, 0, 0, false);
      add(body, capGeo(secCab(zCB)), M.paint, 0, 0, zCB, 0, 0, 0, false);
      // (the cowl panel between the hood and the windshield, the wipers)
      add(body, rbox(1.62, 0.02, 0.08, 0.008), M.clad, 0, cowl + 0.012, zC + 0.02, 0.3, 0, 0);
      for (const x of [-0.42, 0.18]) tubeAB(body, V3(x - 0.02, cowl + 0.03, zC + 0.05), V3(x + 0.48, cowl + 0.06, zC + 0.1), 0.008, M.black, 6);
      // the back window (a slider) and the third brake lamp
      { const rw = new THREE.Shape(); rw.moveTo(-0.66, 1.5); rw.lineTo(0.66, 1.5); rw.lineTo(0.62, 1.86); rw.quadraticCurveTo(0.6, 1.88, 0.56, 1.88); rw.lineTo(-0.56, 1.88); rw.quadraticCurveTo(-0.6, 1.88, -0.62, 1.86); rw.closePath();
        add(body, new THREE.ShapeGeometry(rw, 6), M.tint, 0, 0, zCB + 0.004, 0, 0, 0, false);
        for (const x of [-0.22, 0.22]) add(body, new THREE.BoxGeometry(0.014, 0.38, 0.004), M.black, x, 1.69, zCB + 0.008, 0, 0, 0, false);
        add(body, rbox(0.3, 0.035, 0.02, 0.008), M.tail, 0, 1.915, zCB + 0.012, 0, 0, 0, false); }
      // ---- the box between the dually fenders: the fenders bulge out of its lower half round the duals (their outline in
      // side view an ellipse round the axle), the top rail, the liner, the tubs
      const bulge = (z, y) => 0.215 * Math.pow(Math.max(0, 1 - ((z - zR) / 0.93) * ((z - zR) / 0.93) - ((y - 0.62) / 0.6) * ((y - 0.62) / 0.6)), 0.42);
      const yBb = (z) => archH(z, 0.62, zR, ARR, RR), yFl = 0.96;
      const tub = (z) => { const d = Math.abs(z - zR), r = ARR + 0.06; return d < r ? Math.min(1.3, RR + Math.sqrt(r * r - d * d) + 0.04) : yFl; };
      const secBed = (z) => {
        const yb = yBb(z), y3 = Math.max(yb + 0.12, 0.8), y4 = Math.max(yb + 0.16, 0.95), y5 = Math.max(yb + 0.2, 1.1), hu = Math.max(yFl, tub(z));
        const X = (y) => 1.0 + bulge(z, y);
        return [[0, yb], [X(yb) - 0.1, yb], [X(yb) - 0.02, yb + 0.04], [X(y3) + 0.005, y3], [X(y4) + 0.008, y4], [X(y5) + 0.006, y5], [1.0, 1.36], [0.995, 1.385], [0.95, 1.39], [0.94, 1.37], [0.935, hu], [0.66, hu], [0.6, yFl], [0, yFl]];
      };
      const bed = carBody({
        stations: stationsOf(zBF, zT, 0.04, [zBF + 0.02, zT - 0.02, zR - 0.93, zR - 0.9, zR - ARR - 0.02, zR - ARR, zR + ARR, zR + ARR + 0.02, zR + 0.9, zR + 0.93]),
        section: secBed, capMat: 4,
        mat: (b) => (b === 0 ? 2 : b <= 8 ? 0 : b <= 9 ? 5 : 6),
      });
      add(body, bed, [M.paint, M.tint, M.black, M.glass, M.hidden, M.clad, M.liner], 0, 0, 0);
      add(body, capGeo(secBed(zBF)), M.cladD, 0, 0, zBF, 0, 0, 0, false);
      add(body, rbox(1.86, 1.39 - yFl, 0.05, 0.01), M.liner, 0, (1.39 + yFl) / 2 - 0.005, zBF + 0.03);
      // the tailgate (paint), its handle; the tall tail lamps in the box's corners
      add(body, rbox(1.86, 0.62, 0.06, 0.02), M.paint, 0, 1.06, zT - 0.03);
      add(body, rbox(0.26, 0.06, 0.03, 0.012), M.black, 0, 1.3, zT + 0.005);
      for (const sx of [-1, 1]) {
        const tl = new THREE.Group(); tl.position.set(sx * 0.955, 1.13, zT + 0.005); body.add(tl);
        add(tl, rbox(0.1, 0.46, 0.05, 0.015), M.black, 0, 0, -0.02);
        add(tl, rbox(0.085, 0.3, 0.012, 0.008), M.tail, 0, 0.06, 0.006, 0, 0, 0, false);
        add(tl, rbox(0.085, 0.07, 0.012, 0.008), M.lens || (M.lens = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.1, metalness: 0.4 })), 0, -0.13, 0.006, 0, 0, 0, false);
        add(tl, rbox(0.085, 0.04, 0.012, 0.008), M.amber, 0, -0.195, 0.006, 0, 0, 0, false);
        // (the dually fenders' clearance lamps: amber up front, red at the back)
        add(body, rbox(0.012, 0.035, 0.07, 0.006), M.amber, sx * (1.0 + bulge(zR - 0.62, 0.85) + 0.005), 0.85, zR - 0.62, 0, 0, 0, false);
        add(body, rbox(0.012, 0.035, 0.07, 0.006), M.tail, sx * (1.0 + bulge(zR + 0.62, 0.85) + 0.005), 0.85, zR + 0.62, 0, 0, 0, false);
      }
      // the chrome step bumper, the black step pad on it, the plate, the hitch
      add(body, profile([[zT - 0.1, 0.74], [zT + 0.16, 0.74], [zT + 0.2, 0.7], [zT + 0.2, 0.57], [zT + 0.16, 0.53], [zT - 0.1, 0.53]], 2.0, 0.03), M.chrome, 0, 0, 0);
      add(body, rbox(0.62, 0.012, 0.18, 0.005), M.black, 0, 0.746, zT + 0.06);
      add(body, rbox(0.3, 0.15, 0.01, 0.005), M.white, 0, 0.63, zT + 0.205, 0, 0, 0, false);
      add(body, rbox(0.08, 0.08, 0.3, 0.01), M.black, 0, 0.5, zT + 0.12);
      if (PULL) {
        // (the pulling hitch: a tall plate behind the bumper, the clevis at its foot)
        add(body, rbox(0.16, 0.42, 0.04, 0.01), M.steel, 0, 0.62, zT + 0.27);
        add(body, new THREE.TorusGeometry(0.05, 0.016, 8, 18), M.steel, 0, 0.44, zT + 0.3, 0, Math.PI / 2, 0);
      } else { add(body, rbox(0.06, 0.06, 0.1, 0.008), M.steel, 0, 0.5, zT + 0.3); add(body, new THREE.SphereGeometry(0.045, 14, 10), M.chrome, 0, 0.57, zT + 0.34); }
      // ---- the nose: the crosshair grille in its chrome surround, the headlamps, the park / turn lamps, the bumper
      const GZ = zN - 0.012;
      { const go = new THREE.Shape(); rrPath(go, -0.4, 0.84, 0.4, 1.335, 0.05);
        const gi = new THREE.Path(); rrPath(gi, -0.35, 0.885, 0.35, 1.29, 0.03); go.holes.push(gi);
        add(body, new THREE.ExtrudeGeometry(go, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 3 }), M.chrome, 0, 0, GZ - 0.05);
        // the crosshair: a chrome bar down the middle and one across, standing proud of the mesh
        add(body, rbox(0.085, 0.42, 0.06, 0.02), M.chrome, 0, 1.087, GZ - 0.035);
        add(body, rbox(0.72, 0.075, 0.055, 0.02), M.chrome, 0, 1.087, GZ - 0.032);
        // (the four openings: a black egg-crate behind)
        const crate = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#050506'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2c30'; for (let k = 0; k < 4; k++) { g.fillRect(k * 16, 0, 3, h); g.fillRect(0, k * 16, w, 3); } });
        crate.wrapS = crate.wrapT = THREE.RepeatWrapping; crate.repeat.set(9, 5);
        add(body, new THREE.PlaneGeometry(0.72, 0.43), new THREE.MeshStandardMaterial({ map: crate, roughness: 0.6, metalness: 0.4 }), 0, 1.087, GZ + 0.004, 0, Math.PI, 0, false); }
      for (const sx of [-1, 1]) {
        // headlamp: a big clear lens over two chrome reflector bowls (low beam inside, high beam outside), black round it
        const hl = new THREE.Group(); hl.position.set(sx * 0.665, 1.115, zN - 0.005); body.add(hl);
        add(hl, rbox(0.5, 0.25, 0.05, 0.02), M.black, 0, 0, 0.015);
        add(hl, new THREE.PlaneGeometry(0.47, 0.22), M.black, 0, 0, -0.011, 0, Math.PI, 0, false);
        // (the two reflectors side by side - the low beam inboard, a touch bigger - each a rounded chrome recess with its bulb)
        for (const [dx, w] of [[-0.115, 0.22], [0.12, 0.19]]) {
          const rs = new THREE.Shape(); rrPath(rs, -w / 2, -0.09, w / 2, 0.09, 0.035);
          const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 3, curveSegments: 8 });
          add(hl, rg, M.lampRefl, sx * dx, 0, -0.016);
          add(hl, latheGeo([[0.0, 0.0], [0.022, 0.006], [0.03, 0.016]]), M.lampRefl, sx * dx, 0, -0.03, Math.PI / 2, 0, 0, false);
          add(hl, new THREE.SphereGeometry(0.012, 12, 8), M.head, sx * dx, 0, -0.033, 0, 0, 0, false);
        }
        add(hl, rbox(0.012, 0.2, 0.02, 0.004), M.black, sx * 0.0, 0, -0.026);
        add(hl, rbox(0.47, 0.22, 0.012, 0.016), M.clearLens, 0, 0, -0.044, 0, 0, 0, false);
        // park / turn lamp under it, wrapping round the corner
        add(body, rbox(0.33, 0.1, 0.03, 0.02), M.black, sx * 0.79, 0.93, zN - 0.002);
        add(body, rbox(0.21, 0.075, 0.012, 0.015), M.amber, sx * 0.85, 0.93, zN - 0.02, 0, 0, 0, false);
        add(body, rbox(0.1, 0.075, 0.012, 0.015), M.lampRefl, sx * 0.69, 0.93, zN - 0.02, 0, 0, 0, false);
        add(body, rbox(0.012, 0.075, 0.12, 0.006), M.amber, sx * 1.002, 0.93, zN + 0.09, 0, 0, 0, false);
      }
      spots(0.66, 1.12, zN - 0.04);
      // the bumper: chrome, the face rolled under at the bottom, wrapping back round the corners; the black valance below
      { const bp = new THREE.Shape(), zf = zN - 0.1, zc = zN + 0.12, zb = zN + 0.36, bx = 1.0, bi = bx - 0.1;
        bp.moveTo(-0.85, -zf); bp.lineTo(0.85, -zf); bp.quadraticCurveTo(bx, -zf, bx, -zc); bp.lineTo(bx, -zb); bp.lineTo(bi, -zb); bp.lineTo(bi, -(zN + 0.04));
        bp.lineTo(-bi, -(zN + 0.04)); bp.lineTo(-bi, -zb); bp.lineTo(-bx, -zb); bp.lineTo(-bx, -zc); bp.quadraticCurveTo(-bx, -zf, -0.85, -zf); bp.closePath();
        const bg = new THREE.ExtrudeGeometry(bp, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 4, curveSegments: 14 });
        bg.rotateX(-Math.PI / 2); add(body, bg, M.chrome, 0, 0.57, 0); }
      add(body, rbox(1.7, 0.12, 0.06, 0.02), M.clad, 0, 0.5, zN - 0.04);
      for (const sx of [-1, 1]) add(body, rbox(0.04, 0.08, 0.12, 0.015), M.steel, sx * 0.55, 0.47, zN - 0.08);          // (tow hooks)
      // the hood's shut line round its edge and across the cowl; the fender tops' lines
      const seam = (a, b) => tubeAB(body, a, b, 0.0035, M.seam, 5);
      for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
        const z0 = zN + 0.04 + k * (zC - zN - 0.06) / 6, z1 = zN + 0.04 + (k + 1) * (zC - zN - 0.06) / 6;
        seam(V3(sx * (xH + 0.012), hEdge(z0) - 0.01, z0), V3(sx * (xH + 0.012), hEdge(z1) - 0.01, z1));
      }
      // the wheel arches' lips, the wheel-well liners
      for (const sx of [-1, 1]) {
        add(body, arcGeo(zF, RF, AR - 0.005, AR + 0.03, 0.08, Math.PI - 0.08, 0.04), M.paint, sx > 0 ? 0.985 : -1.025, 0, 0);
        add(body, rbox(0.02, 0.55, 1.05, 0.005), M.cladD, sx * 0.62, 0.86, zF);
        add(body, rbox(0.02, 0.6, 1.1, 0.005), M.cladD, sx * 0.66, 0.9, zR);
      }
      // the sides: door shut lines, black handles, the towing mirrors, the running boards
      for (const sx of [-1, 1]) {
        for (const z of [zC + 0.05, -0.05, 0.55]) seam(V3(sx * 1.017, 0.66, z), V3(sx * 1.017, belt(z) - 0.03, z));
        seam(V3(sx * 1.017, 0.65, zC + 0.05), V3(sx * 1.017, 0.65, 0.55));
        for (const z of [-0.32, 0.4]) add(body, rbox(0.03, 0.04, 0.17, 0.012), M.black, sx * 1.025, 1.3, z);
        const mz = zC + 0.3;
        tubeAB(body, V3(sx * 1.0, 1.46, mz), V3(sx * 1.2, 1.5, mz + 0.02), 0.014, M.black, 8);
        tubeAB(body, V3(sx * 1.0, 1.36, mz + 0.06), V3(sx * 1.2, 1.4, mz + 0.04), 0.014, M.black, 8);
        const mh = new THREE.Group(); mh.position.set(sx * 1.24, 1.5, mz + 0.03); mh.rotation.y = -sx * 0.1; body.add(mh);
        add(mh, rbox(0.2, 0.36, 0.07, 0.02), M.black, 0, 0, 0);
        add(mh, new THREE.PlaneGeometry(0.17, 0.32), M.chrome, 0, 0, 0.036, 0, 0, 0, false);
        add(body, rbox(0.17, 0.04, 1.75, 0.012), M.black, sx * 1.09, 0.55, -0.24);
        for (const z of [-0.9, 0.35]) add(body, rbox(0.12, 0.05, 0.05, 0.01), M.black, sx * 1.02, 0.57, z);
      }
      // five amber cab lights across the roof's front edge
      for (const x of [-0.72, -0.12, 0, 0.12, 0.72]) add(body, rbox(0.07, 0.035, 0.05, 0.012), M.amber, x, roofE + 0.015 + (Math.abs(x) < 0.2 ? 0.015 : 0), zRF + 0.06, 0, 0, 0, false);
      // ---- the exhaust: stock out the side ahead of the duals; the built truck's twin stacks in the bed; the pulling
      // truck's stack straight up through the hood. (P.soot: where the black smoke comes out, and which way)
      P.soot = [];
      const stack = (x, y0, y1, z, r) => {
        add(body, new THREE.CylinderGeometry(r, r, y1 - y0, 24, 1, true), M.chromeD, x, (y0 + y1) / 2, z);
        // (the slash cut: the top cut at 45 deg, the open side facing back)
        const cut = new THREE.CylinderGeometry(r, r, 0.12, 24, 1, true); const ps = cut.attributes.position;
        for (let i = 0; i < ps.count; i++) { const pz = ps.getZ(i); if (ps.getY(i) > 0) ps.setY(i, 0.06 - 0.12 * clamp((pz + r) / (2 * r), 0, 1)); }
        cut.computeVertexNormals(); add(body, cut, M.chromeD, x, y1 + 0.06, z);
        add(body, new THREE.CircleGeometry(r * 0.92, 20), M.black, x, y1 + 0.03, z, -Math.PI / 2, 0, 0, false);
        P.soot.push({ p: toRoot(V3(x, y1 + 0.1, z + 0.02)), d: V3(0, 1, 0.12).normalize() });
      };
      if (PULL) {
        stack(0.42, 1.4, 1.9, zC - 0.25, 0.064);
        add(body, new THREE.CylinderGeometry(0.085, 0.085, 0.02, 24), M.chrome, 0.42, hEdge(zC - 0.25) + 0.04, zC - 0.25);
      } else if (BUILT) for (const sx of [-1, 1]) {
        stack(sx * 0.8, 1.0, 2.45, zBF + 0.14, 0.076);
        add(body, rbox(0.04, 0.12, 0.06, 0.01), M.steel, sx * 0.8, 1.42, zBF + 0.07);
      } else {
        add(body, cylX(0.05, 0.05, 0.22, 16, true), M.chrome, 0.9, 0.5, zR - 0.82);
        P.soot.push({ p: toRoot(V3(1.02, 0.5, zR - 0.82)), d: V3(1, -0.25, 0.1).normalize() });
      }
      P.tips.push(...P.soot.map((t) => t.p));
      // ---- inside: the floor, door trims, headliner, the dash with its big cluster, the bench, the rear bench
      add(body, rbox(1.9, 0.04, 1.75, 0.01), M.trimIn, 0, 0.72, -0.25);
      for (const sx of [-1, 1]) add(body, new THREE.PlaneGeometry(1.7, 0.75), M.trimIn, sx * 0.975, 1.08, -0.25, 0, sx * Math.PI / 2, 0, false);
      add(body, new THREE.PlaneGeometry(1.62, 1.05), M.trimIn, 0, 1.935, 0.08, Math.PI / 2, 0, 0, false);
      add(body, new THREE.PlaneGeometry(1.9, 0.8), M.trimIn, 0, 1.08, zCB - 0.02, 0, 0, 0, false);
      add(body, rbox(1.9, 0.36, 0.42, 0.08), M.trimIn, 0, 1.22, zC + 0.32);
      add(body, rbox(0.6, 0.12, 0.2, 0.04), M.black, -0.42, 1.42, zC + 0.38);
      add(body, rbox(0.42, 0.34, 0.2, 0.05), M.trimIn, 0.0, 1.12, zC + 0.42);
      if (!ENGINE || ENGINE === 'stock' ? false : true) {
        // (the A-pillar gauge pod a tuned diesel wears: boost, pyrometer, trans temp)
        for (let k = 0; k < 3; k++) { const gz = zC + 0.12 + k * 0.1, gy = 1.62 + k * 0.1;
          add(body, cylZ(0.03, 0.03, 0.04, 16), M.black, -0.86 + k * 0.012, gy, gz, -0.6, 0.5, 0);
          add(body, new THREE.CircleGeometry(0.024, 16), new THREE.MeshBasicMaterial({ color: 0xd8e4ec }), -0.85 + k * 0.012, gy - 0.012, gz + 0.016, -0.6 - Math.PI / 2 + 1.2, 0.5, 0, false); }
      }
      add(body, rbox(1.6, 0.16, 0.55, 0.06), M.seat, 0, 0.95, 0.0);
      add(body, rbox(1.6, 0.66, 0.14, 0.06), M.seat, 0, 1.3, 0.27, 0.18, 0, 0);
      add(body, rbox(1.56, 0.14, 0.2, 0.06), M.seat, 0, 1.02, 0.5);
      SW = steering(V3(-0.42, 1.3, zC + 0.62), 0.5, 0.2);
      tubeAB(body, V3(-0.42, 1.3, zC + 0.6), V3(-0.42, 1.2, zC + 0.42), 0.035, M.black, 10);
      cluster = { parent: body, pos: V3(-0.42, 1.38, zC + 0.475), rot: -0.25, w: 0.4, h: 0.15 };
      driver = person({ hip: V3(-0.42, 1.05, -0.02), lean: 0.2, hands: [V3(-0.6, 1.36, zC + 0.6), V3(-0.24, 1.36, zC + 0.6)],
        knee: { dx: 0.1, y: 1.14, z: -0.42 }, foot: { dx: 0.12, y: 0.78, z: -0.8 }, helmet: false });
      P.hideCockpit.push(driver);
    };
    B.cyber = () => {
      WF = 0.285; WR = 0.285;
      wheelStyle = { rim: 'cyber', rimR: 0.262, tread: 'gravel' };
      M.paint.side = THREE.DoubleSide;
      // (its glass is near black from outside - it clears from the seat, as all the glass does in the cockpit view)
      M.tint.color.setHex(0x07090b); M.tint.metalness = 0.55; M.tint.opacity = 0.9;
      M.vault = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
      M.drl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 2.2, toneMapped: false });
      M.clad = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.78, metalness: 0.05 });
      M.seam = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.4 });
      const zN = -2.83, zT = 2.85, zA = -0.25, yN = 1.04, yA = 1.79, yTl = 1.12, yBe = 1.2;
      const zWs = -1.48, zSg0 = -1.33, zSg1 = 0.55, zCab = 0.62, zBp = -0.3;
      // (straight lines: a lookup through (z, value) points, linear between them - flat panels, crisp creases)
      const lin = (T) => (x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return T[T.length - 1][1]; };
      const yTop = lin([[zN, yN], [zA, yA], [zT, yTl]]);
      // the underside: the nose's chisel face runs down and back from the light bar to the bumper; the tailgate stands
      // on the rear bumper; trapezoid wheel openings (flat tops, angled sides)
      const yUnder = lin([[zN, 0.99], [zN + 0.12, 0.64], [zN + 0.38, 0.47], [zT - 0.2, 0.47], [zT - 0.05, 0.55], [zT, 0.56]]);
      const arch = (z) => { let y = yUnder(z); for (const zc of [zF, zR]) { const d = Math.abs(z - zc); if (d < 0.4) y = Math.max(y, 1.0); else if (d < 0.6) y = Math.max(y, 1.0 - (d - 0.4) / 0.2 * 0.53); } return y; };
      const Wlo = 0.975, Wc = 1.012;
      const section = (z) => {
        const yt = yTop(z), yb = Math.min(arch(z), yt - 0.06), yc = Math.max(yb + 0.03, Math.min(yBe, yt - 0.016));
        // (the greenhouse leans in ~23 degrees; ahead of and behind the cab the top edge is just a chamfer)
        const wr = Math.max(0.7, Wc - Math.max(0, yt - 0.012 - yc) * 0.42);
        return [[0, yb], [Wlo - 0.04, yb], [Wlo, Math.min(yb + 0.02, yc - 0.01)], [Wc, yc], [wr, yt - 0.012], [wr - 0.018, yt], [0, yt]];
      };
      const ST = stationsOf(zN, zT, 0.05, [zN + 0.12, zN + 0.38, zT - 0.2, zT - 0.05, zA, zWs, zSg0, zSg1, zCab, zBp - 0.04, zBp + 0.04,
        zF - 0.6, zF - 0.4, zF + 0.4, zF + 0.6, zR - 0.6, zR - 0.4, zR + 0.4, zR + 0.6]);
      const sideGlass = (z) => z > zSg0 && z < zSg1 && Math.abs(z - zBp) > 0.04;
      const gi = carBody({
        stations: ST,
        section,
        mat: (b, z) => {
          if (b === 0) return z < zN + 0.12 ? 0 : 2;                     // the chisel nose, else the (black) underside
          if (b <= 2) return 0;                                            // the flat sides
          if (b === 3) return sideGlass(z) ? 1 : z > zSg0 && z < zCab ? 2 : 0;   // frameless side glass, the B-pillar / window surround
          if (b === 4) return z > zWs && z < zCab ? 2 : 0;                // the black edge round the glass roof
          return z < zWs ? 0 : z < zCab ? 1 : 3;                           // hood, the windscreen / glass roof / rear glass, the vault
        },
      });
      // (flat panels: every face its own normal)
      const g = gi.toNonIndexed(); g.computeVertexNormals();
      { const p = g.attributes.position, uv = new Float32Array(p.count * 2);
        for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i) * 1.5; uv[i * 2 + 1] = (p.getY(i) + Math.abs(p.getX(i))) * 1.5; }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
      add(body, g, [M.paint, M.tint, M.black, M.vault], 0, 0, 0);
      // the wheel openings' insides, black
      // (the openings' inner walls, inboard of the tyres: the underside over them is the arch's roof)
      for (const zc of [zF, zR]) for (const sx of [-1, 1]) add(body, rbox(0.02, 0.56, 1.24, 0.005), M.linerB || (M.linerB = Object.assign(M.black.clone(), { side: THREE.DoubleSide })), sx * 0.69, 0.74, zc);
      // the flares: a black band round each opening, standing proud of the side
      const band = (zc) => [[zc - 0.68, 0.47], [zc - 0.46, 1.07], [zc + 0.46, 1.07], [zc + 0.68, 0.47], [zc + 0.6, 0.47], [zc + 0.4, 1.0], [zc - 0.4, 1.0], [zc - 0.6, 0.47]];
      for (const zc of [zF, zR]) for (const sx of [-1, 1]) add(body, profile(band(zc), 0.06, 0.008), M.clad, sx * (Wlo + 0.02), 0, 0);
      // the rockers between the openings, the bumpers
      for (const sx of [-1, 1]) add(body, rbox(0.05, 0.16, zR - zF - 1.28, 0.012), M.clad, sx * (Wlo + 0.012), 0.55, 0);
      add(body, profile([[zN + 0.02, 0.64], [zN + 0.16, 0.64], [zN + 0.44, 0.46], [zN + 0.44, 0.36], [zN + 0.12, 0.36], [zN - 0.02, 0.5]], 1.96, 0.02), M.clad, 0, 0, 0);
      add(body, rbox(1.6, 0.04, 0.3, 0.01), M.steel, 0, 0.36, zN + 0.3);                                   // the bash plate
      for (const sx of [-1, 1]) add(body, rbox(0.05, 0.05, 0.08, 0.01), M.steel, sx * 0.45, 0.42, zN + 0.05); // tow points
      add(body, profile([[zT - 0.32, 0.56], [zT + 0.03, 0.56], [zT + 0.03, 0.4], [zT - 0.1, 0.38], [zT - 0.32, 0.38]], 1.98, 0.02), M.clad, 0, 0, 0);
      add(body, rbox(0.34, 0.12, 0.012, 0.004), M.white, 0, 0.47, zT + 0.036);                               // the plate
      // the light bar across the nose (the headlamps are in its ends) and across the tail, running down the corners
      add(body, rbox(1.98, 0.022, 0.02, 0.006), M.drl, 0, yN - 0.03, zN - 0.004, 0, 0, 0, false);
      add(body, rbox(1.98, 0.03, 0.02, 0.006), M.tail, 0, yTl - 0.035, zT + 0.004, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(body, rbox(0.03, 0.2, 0.02, 0.006), M.tail, sx * 0.985, yTl - 0.13, zT + 0.004, 0, 0, 0, false);
      spots(0.78, yN - 0.03, zN - 0.02);
      // the panel seams: the doors' edges, the tailgate's, the hood's; all frameless - no handles
      const seam = (a, b) => tubeAB(body, a, b, 0.0035, M.seam, 5);
      for (const sx of [-1, 1]) {
        const xs = (y) => sx * (Wlo + (Wc - Wlo) * clamp((y - 0.5) / (yBe - 0.5), 0, 1) + 0.002);
        for (const z of [zF + 0.64, zBp, zSg1 + 0.14]) seam(V3(xs(0.6), 0.6, z), V3(xs(yBe - 0.01), yBe - 0.01, z));
        seam(V3(xs(0.6), 0.6, zF + 0.64), V3(xs(0.6), 0.6, zSg1 + 0.14));
        // the hood's shut line along each side, and the mirror on its black stalk
        seam(V3(sx * 0.92, yTop(zN + 0.05) + 0.004, zN + 0.05), V3(sx * 0.9, yTop(zWs - 0.04) + 0.004, zWs - 0.04));
        const my = yBe + 0.1, mz = zSg0 + 0.08;
        tubeAB(body, V3(sx * 1.0, my, mz), V3(sx * 1.1, my + 0.03, mz + 0.02), 0.014, M.black);
        const mh = add(body, facesGeo([[0, -0.05, -0.06], [0, 0.05, -0.06], [0, 0.06, 0.05], [0, -0.05, 0.06], [0.2, -0.04, 0.02], [0.2, 0.05, 0.02]], [[0, 1, 5, 4], [1, 2, 5], [2, 3, 4, 5], [3, 0, 4], [0, 3, 2, 1]]), M.paint, sx * 1.08, my + 0.04, mz + 0.02);
        if (sx < 0) mh.scale.x = -1;
        add(body, new THREE.PlaneGeometry(0.16, 0.08), M.chrome, sx * 1.16, my + 0.045, mz + 0.066, 0, 0, 0, false);
      }
      seam(V3(-0.9, yTop(zN + 0.05) + 0.004, zN + 0.05), V3(0.9, yTop(zN + 0.05) + 0.004, zN + 0.05));
      seam(V3(-0.96, yTl - 0.08, zT + 0.002), V3(0.96, yTl - 0.08, zT + 0.002));
      // the one big wiper, parked along the bottom of the windscreen
      { const y0 = yTop(zWs + 0.06) + 0.012; tubeAB(body, V3(-0.86, y0, zWs + 0.06), V3(0.62, y0 + 0.01, zWs + 0.1), 0.01, M.black, 6);
        tubeAB(body, V3(0.62, y0 + 0.01, zWs + 0.1), V3(0.7, y0 - 0.01, zWs + 0.02), 0.012, M.black, 6); }
      // inside: the seats, the dash across the cab with the big screen in the middle, the squircle wheel on the left
      // (the seats sit low and forward: the glass roof over the front row is ~1.74 m up)
      for (const sx of [-1, 1]) {
        add(body, rbox(0.52, 0.12, 0.52, 0.05), M.seat, sx * 0.44, 0.78, -0.16);
        add(body, rbox(0.52, 0.62, 0.12, 0.05), M.seat, sx * 0.44, 1.1, 0.12, 0.2, 0, 0);
        add(body, rbox(0.52, 0.12, 0.52, 0.05), M.seat, sx * 0.44, 0.8, 0.62);
      }
      add(body, rbox(1.9, 0.16, 0.4, 0.04), M.black, 0, 1.08, -0.96);
      add(body, rbox(1.9, 0.3, 1.0, 0.04), M.black, 0, 0.72, -0.9);
      add(body, rbox(1.9, 0.04, 3.2, 0.02), M.black, 0, 0.64, 0.1);
      SW = steering(V3(-0.44, 1.1, -0.66), 0.45, 0.17, 'squircle');
      cluster = { parent: body, pos: V3(0.05, 1.26, -0.86), rot: -0.35, w: 0.44, h: 0.26 };
      add(body, rbox(0.46, 0.28, 0.02, 0.01), M.black, 0.05, 1.26, -0.87, -0.35, 0, 0);
      driver = person({ hip: V3(-0.44, 0.84, -0.12), lean: 0.28, hands: [V3(-0.58, 1.12, -0.6), V3(-0.3, 1.12, -0.6)],
        knee: { dx: 0.1, y: 0.98, z: -0.6 }, foot: { dx: 0.12, y: 0.7, z: -1.05 }, helmet: false });
      P.hideCockpit.push(driver);
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
      if (JET) {
        // the jet carts' back end, one piece with the seat pod: a deck in the body colour from the seat back to the
        // bumper, out to just inside the back tyres (the fenders' ends sit on it), and two posts at the back carrying
        // the tail lights - the engine's pylon stands on the deck
        const dh = trackR / 2 - WR / 2 - 0.012, dz0 = zS1 - 0.03, dz1 = zR + 0.44;
        add(body, rbox(dh * 2, 0.12, dz1 - dz0, 0.03), M.paint, 0, 0.3, (dz0 + dz1) / 2);
        for (const sx of [-1, 1]) add(body, rbox(0.14, 0.27, 0.05, 0.015), M.paint, sx * 0.45, 0.43, zR + 0.42);
      }
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
        // the mount: two frame rails run back from the seat pod under the engine (past the back axle, and on under a big
        // engine's afterburner), a pylon in the body colour stands from them to the case's belly along its length, and
        // four struts brace the case from the rails - all re-sized and re-aimed with the engine (jetSize)
        const strutGeo = new THREE.CylinderGeometry(0.026, 0.026, 1, 10), struts = [];
        for (const sx of [-1, 1]) for (const dz of [0.25, 0.8]) struts.push({ m: add(body, strutGeo, M.steel, 0, 0, 0), sx, dz });
        const unit = new THREE.BoxGeometry(1, 1, 1);
        const rails = [-1, 1].map((sx) => ({ m: add(body, unit, M.steel, 0, 0, 0), sx })), cross = add(body, unit, M.steel, 0, 0, 0), pylon = add(body, unit, M.paint, 0, 0, 0);
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
        // a bigger engine (s: its diameter against stock): fatter by s, longer by less, sat a little higher to clear the axle -
        // and a huge one high enough that its intake clears the back tyres and its belly the frame rails
        const up = V3(0, 1, 0), dv = V3(0, 0, 0), RY = 0.28, RH = 0.08;
        jetSize = (sz) => {
          const bell = 0.235 * sz, sa = 1 + (sz - 1) * 0.6, zb = ez0 + Math.max(0, sz - 1.4) * 0.3;
          const y = Math.max(ey + Math.max(0, sz - 1) * 0.07, RY + RH / 2 + (er - 0.01) * sz, 0.58 + Math.sqrt(Math.max(0, bell * bell - 0.47 * 0.47)));
          jg.scale.set(sz, sz, sa); jg.position.set(0, y, zb);
          // (the rails: from the seat pod back past the axle, or to the afterburner of a long engine; the pylon: rail top to
          // the case's belly, from just behind the intake to the rails' end)
          const caseBot = y - (er - 0.01) * sz, zAb = zb + (0.16 + eL) * sa, r0 = zS1 - 0.05, r1 = Math.max(zR + 0.5, zAb);
          for (const r of rails) { r.m.scale.set(0.06, RH, r1 - r0); r.m.position.set(r.sx * 0.3, RY, (r0 + r1) / 2); }
          cross.scale.set(0.66, 0.06, 0.06); cross.position.set(0, RY, r1 - 0.03);
          const p0 = zb + 0.2 * sa, p1 = Math.min(zAb, r1 - 0.04), ph = caseBot - (RY + RH / 2) + 0.03;
          pylon.scale.set(0.12 + 0.05 * sz, Math.max(0.02, ph), Math.max(0.1, p1 - p0)); pylon.position.set(0, RY + RH / 2 + ph / 2 - 0.01, (p0 + p1) / 2);
          for (const st of struts) {
            const a = V3(st.sx * 0.3, RY + RH / 2, zb + st.dz * sa), b = V3(st.sx * 0.1 * sz, y - (er - 0.02) * sz, zb + (st.dz + 0.05) * sa);
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

    // ---------------------------------------------------------------- Toyota Prius (XW20, 2004-09)
    // The second-generation Prius side on is one arc: a short hood sloping on into a long, steeply raked windshield, the
    // roof peaking just behind the B-pillar and falling in a straight line over the hatch to the spoiler - and there the
    // tail cut off near-vertical (the Kammback), a strip of glass in it under the spoiler. The beltline rises towards the
    // back over a character line; swept-back headlamps along the fender tops, a slot of a grille between them, a wide lower
    // intake with the fog lamps at its ends; a small fixed window at the foot of each A-pillar, black B-pillars, a quarter
    // window behind the rear doors; tall tail lamps wrapping the rear corners; body-colour mirrors and handles, the mast
    // aerial at the back of the roof; 15 in ten-spoke alloys. Inside: the display centred on top of the dash, the joystick
    // shifter on the centre stack, cloth seats
    B.prius = () => {
      WF = 0.185; WR = 0.185;
      wheelStyle = { rim: 'prius', rimR: 0.19, tread: 'road' };
      M.paint.side = THREE.DoubleSide;
      // (panels laid on the skin draw in front of it: a depth bias, so the body's facets can't poke through them)
      const onTop = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
      M.lampIn = new THREE.MeshPhysicalMaterial(Object.assign({ color: 0x9aa2ab, roughness: 0.1, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide }, onTop));
      M.lampRim = new THREE.MeshStandardMaterial(Object.assign({ color: 0x15171a, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }, onTop));
      Object.assign(M.tail, onTop, { side: THREE.DoubleSide }); Object.assign(M.amber, onTop, { side: THREE.DoubleSide });
      M.trimIn = new THREE.MeshStandardMaterial({ color: 0x45484e, roughness: 0.85, side: THREE.DoubleSide });
      M.cloth = new THREE.MeshStandardMaterial({ color: 0x5b5e64, roughness: 0.95 });
      M.seam = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6 });
      M.linerB = Object.assign(M.black.clone(), { side: THREE.DoubleSide });
      // stations: the nose and tail, the windshield's foot and top, the roof's back (the hatch glass), the spoiler
      const ZN = -2.27, ZT = 2.18, ZW = -1.24, ZRF = -0.33, ZH = 0.95, ZSp = 2.05;
      const Wz = tbl([[ZN, 0.34], [-2.255, 0.52], [-2.23, 0.63], [-2.19, 0.71], [-2.12, 0.77], [-2.02, 0.815], [-1.85, 0.85], [-1.4, 0.862], [0, 0.862], [1.5, 0.858], [1.9, 0.846], [2.04, 0.826], [2.12, 0.79], [2.16, 0.75], [ZT, 0.7]]);
      const yBz = archY(tbl([[ZN, 0.36], [-2.255, 0.27], [-2.22, 0.21], [-2.12, 0.18], [-2.0, 0.17], [2.0, 0.18], [2.12, 0.25], [ZT, 0.3]]), [zF, zR], RF, 0.365);
      const yCr = tbl([[ZN, 0.43], [-2.255, 0.48], [-2.2, 0.56], [-2.1, 0.63], [-1.6, 0.72], [-0.5, 0.76], [0.8, 0.8], [1.8, 0.85], [ZT, 0.86]]);
      const ySh = tbl([[ZN, 0.5], [-2.255, 0.58], [-2.21, 0.65], [-2.12, 0.71], [-1.8, 0.81], [ZW, 0.93], [-0.5, 0.96], [0.5, 0.99], [1.3, 1.02], [1.9, 1.045], [ZT, 1.03]]);
      const yBe = tbl([[ZN, 0.52], [-2.255, 0.6], [-2.21, 0.675], [-2.12, 0.74], [-1.9, 0.82], [-1.6, 0.885], [ZW, 0.975], [-0.6, 0.995], [0.3, 1.02], [1.0, 1.045], [1.5, 1.07], [1.95, 1.095], [ZT, 1.07]]);
      const yTz = tbl([[ZN, 0.54], [-2.255, 0.62], [-2.21, 0.695], [-2.12, 0.765], [-2.0, 0.815], [-1.6, 0.9], [ZW, 0.985], [-0.95, 1.12], [-0.65, 1.26], [ZRF, 1.41], [-0.05, 1.465], [0.2, 1.488], [0.5, 1.48],
        [ZH, 1.43], [1.3, 1.36], [1.65, 1.27], [ZSp, 1.155], [2.12, 1.125], [ZT, 1.085]]);
      const Wtz = tbl([[ZN, 0.24], [-2.22, 0.46], [-2.1, 0.58], [-1.8, 0.64], [ZW, 0.64], [-0.8, 0.58], [ZRF, 0.6], [0.3, 0.62], [ZH, 0.6], [1.6, 0.58], [ZSp, 0.56], [ZT, 0.5]]);
      // the section at z, right half, 23 points: underbody 0-3, the sill 4-6, the side up to the character line 7-11, its
      // step and the panel above 12-15, 16 the belt (the hood's edge ahead of the windshield), 17-20 the glass (the hood,
      // the tail's top), 21-22 roof / hood centre
      const section = (z) => {
        const W = Wz(z), yb = yBz(z), ysh = Math.max(ySh(z), yb + 0.2), ybe = Math.max(yBe(z), ysh + 0.012), yt = Math.max(yTz(z), ybe + 0.012), wt = Math.min(Wtz(z), W - 0.12);
        const wb = W - (z < ZW ? 0.055 : 0.07);
        const ycr = clamp(yCr(z), yb + 0.08, ysh - 0.04), ysk = Math.max(yb + 0.03, Math.min(yb + 0.1, ycr - 0.04));
        const P = [[0, yb], [W * 0.55, yb], [W - 0.08, yb], [W - 0.04, yb + 0.012], [W - 0.016, yb + Math.min(0.04, (ysk - yb) * 0.4)], [W - 0.01, ysk], [W - 0.012, ysk + 0.008]];
        for (let k = 1; k <= 4; k++) { const t = k / 5; P.push([W - 0.012 * (1 - t) + 0.014 * Math.sin(Math.PI * t), ysk + 0.008 + (ycr - ysk - 0.008) * t]); }
        P.push([W, ycr], [W - 0.006, ycr + 0.01], [W - 0.016, ycr + (ysh - ycr) * 0.55], [W - 0.03, ysh], [W - 0.046, ysh + 0.008]);
        P.push([wb, ybe]);
        for (let k = 1; k <= 4; k++) { const t = k / 4; P.push([wb + (wt - wb) * Math.pow(t, 0.9), ybe + (yt - 0.02 - ybe) * (1 - Math.pow(1 - t, 1.6))]); }
        P.push([wt * 0.55, yt - 0.004], [0, yt]);
        return P;
      };
      // the glass: a small fixed window at the foot of the A-pillar, the front and rear door glass, the quarter window -
      // the black pillars between them, the D-pillar body colour
      const pillar = (z) => (z > -0.99 && z < -0.945) || (z > -0.02 && z < 0.07) || (z > 1.0 && z < 1.045);
      const ST = stationsOf(ZN, ZT, 0.05, [ZW, ZRF, ZH, ZSp, -0.99, -0.945, -0.02, 0.07, 1.0, 1.045, 1.62, zF - 0.365, zF + 0.365, zR - 0.365, zR + 0.365, -2.265, -2.255, -2.245, -2.23, -2.21, -2.19, -2.16, 2.12, 2.15]);
      const g = carBody({
        stations: ST, section,
        mat: (b, z) => {
          if (b <= 3) return 2;                                                           // underbody
          if (b <= 15) return 0;                                                          // the sides
          if (z < ZW || z > ZSp) return 0;                                                // the hood, the tail's top
          if (b <= 18) return z > ZW + 0.05 && z < 1.62 ? (pillar(z) ? 2 : 1) : 0;        // side glass and pillars
          if (b === 19) return 0;                                                         // A-pillar / roof rail
          return z < ZRF ? 3 : z > ZH ? 1 : 0;                                            // windshield, roof, hatch glass
        },
      });
      add(body, g, [M.paint, M.tint, M.black, M.glass], 0, 0, 0);
      // (a point on the skin at z, t round the section, side sx - on the mesh, straight between the stations - and the
      // outward normal there; a panel laid on the skin between tA(z) and tB(z): see the GTR)
      const surf0 = (z, t, sx) => { const P = section(z), i = Math.max(0, Math.min(P.length - 2, Math.floor(t))), f = t - i; return V3(sx * (P[i][0] + (P[i + 1][0] - P[i][0]) * f), P[i][1] + (P[i + 1][1] - P[i][1]) * f, z); };
      const surf = (z, t, sx) => {
        let k = 1; while (k < ST.length - 1 && ST[k] < z) k++;
        const za = ST[k - 1], zb = ST[k], f = clamp((z - za) / (zb - za), 0, 1);
        return surf0(za, t, sx).lerp(surf0(zb, t, sx), f).setZ(z);
      };
      const surfN = (z, t, sx) => {
        const p = surf0(z, t, sx), dz = surf0(z + 0.01, t, sx).sub(p), dt = surf0(z, t + 0.05, sx).sub(p);
        return (sx > 0 ? new THREE.Vector3().crossVectors(dt, dz) : new THREE.Vector3().crossVectors(dz, dt)).normalize();
      };
      const patch = (sx, z0, z1, tA, tB, off, mat, nz, nt) => {
        nz = nz || 18; nt = nt || 6;
        const pos = [], idx = [];
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
      // a line along the skin (a shut line): through (z, t) points, standing off it a touch
      const seamAlong = (sx, pts, r) => {
        const P = pts.map(([z, t]) => surf(z, t, sx).addScaledVector(surfN(z, t, sx), 0.0015));
        add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), P.length * 4, r || 0.0035, 5, false), M.seam, 0, 0, 0, 0, 0, 0, false);
      };
      // wheel-arch liners: black, so the arches read as holes
      for (const z of [zF, zR]) for (const sx of [-1, 1]) {
        const lg = new THREE.CylinderGeometry(0.36, 0.36, 0.36, 28, 1, true, 0, Math.PI); lg.rotateZ(Math.PI / 2);
        add(body, lg, M.linerB, sx * (Wz(z) - 0.22), RF, z, 0, 0, 0, false);
      }
      for (const sx of [-1, 1]) {
        // headlamps: laid on the front corners, tall at the nose and sweeping back along the fender top to a point - a
        // silver reflector, the projector and the low beam, the amber signal along the bottom edge, a dark rim
        const s = (z) => Math.pow(clamp((z + 2.235) / 0.6, 0, 1), 1.2);
        const lo = (z) => 10.6 + 4.6 * s(z), hi = (z) => 17.4 - 1.1 * s(z);
        patch(sx, -2.24, -1.63, (z) => lo(z) - 0.25, (z) => hi(z) + 0.12, 0.003, M.lampRim, 26, 9);
        patch(sx, -2.232, -1.65, lo, hi, 0.005, M.lampIn, 26, 9);
        for (const [z, t, r] of [[-2.08, 14.4, 0.038], [-2.17, 12.4, 0.032]]) {
          const p = surf(z, t, sx), n = surfN(z, t, sx);
          const ring = add(body, new THREE.TorusGeometry(r, 0.006, 8, 22), M.lampRim, p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012, 0, 0, 0, false);
          const l = add(body, new THREE.CircleGeometry(r - 0.004, 20), M.head, p.x + n.x * 0.014, p.y + n.y * 0.014, p.z + n.z * 0.014, 0, 0, 0, false);
          for (const o of [ring, l]) o.quaternion.setFromUnitVectors(V3(0, 0, 1), n);
        }
        patch(sx, -2.225, -1.9, (z) => lo(z) + 0.06, (z) => lo(z) + 0.55, 0.008, M.amber, 10, 3);
        // the fog lamps in the bumper's corners
        { const p = surf(-2.215, 7.4, sx), n = surfN(-2.215, 7.4, sx);
          const ring = add(body, new THREE.TorusGeometry(0.042, 0.009, 8, 22), M.lampRim, p.x + n.x * 0.006, p.y + n.y * 0.006, p.z + n.z * 0.006, 0, 0, 0, false);
          const l = add(body, new THREE.CircleGeometry(0.036, 20), M.lampIn, p.x + n.x * 0.005, p.y + n.y * 0.005, p.z + n.z * 0.005, 0, 0, 0, false);
          for (const o of [ring, l]) o.quaternion.setFromUnitVectors(V3(0, 0, 1), n); }
        // the tail lamps wrapping round the rear corners
        patch(sx, 1.975, ZT - 0.004, (z) => 11.3 + 0.6 * clamp((2.06 - z) / 0.09, 0, 1), () => 15.4, 0.005, M.tail, 12, 6);
        // shut lines: the hood's edges, the front door's leading edge, the B-pillar, the rear door's back edge, the hatch
        seamAlong(sx, Array.from({ length: 9 }, (_, i) => { const z = -2.17 + i * (ZW - 0.02 + 2.17) / 8; return [z, 16.35]; }));
        for (const z of [-0.965, 0.025]) seamAlong(sx, [[z, 4.6], [z, 7], [z, 10], [z, 12.5], [z, 15.4]]);
        seamAlong(sx, [[0.99, 15.4], [0.995, 12.5], [0.99, 11.2], [zR - 0.4, 9.6]]);
        seamAlong(sx, [[ZSp + 0.01, 15.5], [2.02, 13], [2.0, 11], [1.99, 9]]);
        // handles, body colour
        for (const z of [-0.28, 0.72]) { const p = surf(z, 12.9, sx); add(body, rbox(0.026, 0.034, 0.17, 0.012), M.paint, p.x + sx * 0.012, p.y, z); }
        // mirrors on the doors at the window's front corner: a black base, the body-colour housing, the glass
        const mz = -0.9, by = yBe(mz), mx = Wz(mz);
        add(body, rbox(0.05, 0.07, 0.13, 0.02), M.black, sx * (mx - 0.045), by + 0.035, mz);
        tubeAB(body, V3(sx * (mx - 0.03), by + 0.05, mz), V3(sx * (mx + 0.05), by + 0.075, mz + 0.01), 0.016, M.black);
        const mh = new THREE.Group(); mh.position.set(sx * (mx + 0.1), by + 0.085, mz + 0.015); mh.rotation.y = -sx * 0.1; body.add(mh);
        add(mh, rbox(0.17, 0.11, 0.09, 0.035), M.paint, 0, 0, 0);
        add(mh, new THREE.PlaneGeometry(0.15, 0.088), M.chrome, 0, 0, 0.047, 0, 0, 0, false);
      }
      // (the fuel door on the left rear fender)
      { const p = surf(1.55, 13.2, -1), n = surfN(1.55, 13.2, -1); const r = add(body, new THREE.TorusGeometry(0.075, 0.003, 4, 28), M.seam, p.x + n.x * 0.002, p.y + n.y * 0.002, p.z + n.z * 0.002, 0, 0, 0, false); r.quaternion.setFromUnitVectors(V3(0, 0, 1), n); }
      spots(0.62, 0.66, -2.2);
      // the nose: a slot of a grille under the hood's edge, the wide lower intake with its slats
      const onNose = (pts, mat, z) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]); return add(body, new THREE.ShapeGeometry(sh), mat, 0, 0, z, 0, Math.PI, 0, false); };
      onNose([[-0.24, 0.585], [0.24, 0.585], [0.21, 0.61], [-0.21, 0.61]], M.gloss, -2.262);
      onNose([[-0.34, 0.44], [0.34, 0.44], [0.27, 0.29], [-0.27, 0.29]], M.mesh, -2.274);
      for (const y of [0.33, 0.39]) { const hw = 0.27 + (y - 0.29) / 0.15 * 0.07; add(body, new THREE.BoxGeometry(hw * 2 - 0.03, 0.012, 0.02), M.black, 0, y, -2.276); }
      { const q = [[-0.34, 0.44], [0.34, 0.44], [0.27, 0.29], [-0.27, 0.29], [-0.34, 0.44]].map(([x, y]) => V3(x, y, -2.276)); for (let i = 0; i < 4; i++) tubeAB(body, q[i], q[i + 1], 0.008, M.lampRim, 8); }
      // the cowl: the wipers lying at the windshield's foot
      for (const x0 of [-0.64, -0.06]) tubeAB(body, V3(x0, yTz(ZW + 0.05) + 0.012, ZW + 0.05), V3(x0 + 0.54, yTz(ZW + 0.09) + 0.012, ZW + 0.09), 0.008, M.black, 6);
      // the tail: the strip of glass under the spoiler, the tail lamps' faces, the hatch's shut line and the plate in its
      // recess, the bumper's black lower lip and its reflectors, the spoiler's lip with the third brake lamp
      const onTail = (pts, mat, dz) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]); return add(body, new THREE.ShapeGeometry(sh), mat, 0, 0, ZT + (dz || 0.003), 0, 0, 0, false); };
      onTail([[-0.47, 0.93], [0.47, 0.93], [0.47, 1.045], [-0.47, 1.045]], M.tint);
      for (const sx of [-1, 1]) {
        onTail([[sx * 0.47, 0.78], [sx * 0.62, 0.765], [sx * 0.665, 0.82], [sx * 0.665, 1.0], [sx * 0.635, 1.05], [sx * 0.47, 1.05]], M.tail);
        add(body, rbox(0.12, 0.03, 0.012, 0.006), M.tail, sx * 0.6, 0.47, ZT + 0.008, 0, 0, 0, false);
      }
      add(body, rbox(0.38, 0.16, 0.02, 0.02), M.black, 0, 0.62, ZT + 0.004);
      add(body, rbox(0.3, 0.15, 0.008, 0.005), M.white, 0, 0.62, ZT + 0.014);
      for (const [a, b] of [[V3(-0.47, 0.74, ZT + 0.004), V3(0.47, 0.74, ZT + 0.004)], [V3(-0.47, 0.74, ZT + 0.004), V3(-0.47, 1.05, ZT + 0.004)], [V3(0.47, 0.74, ZT + 0.004), V3(0.47, 1.05, ZT + 0.004)]]) tubeAB(body, a, b, 0.0035, M.seam, 5);
      add(body, rbox(1.24, 0.1, 0.05, 0.02), M.black, 0, 0.335, ZT - 0.005);
      add(body, rbox(1.2, 0.03, 0.12, 0.012), M.paint, 0, yTz(2.12) + 0.006, 2.13, -0.08, 0, 0);
      add(body, rbox(0.3, 0.014, 0.01, 0.004), M.tail, 0, yTz(2.12) + 0.008, ZT + 0.012, 0, 0, 0, false);
      // the exhaust: a small turned-down tip under the left of the bumper
      add(body, cylZ(0.025, 0.025, 0.1, 12, true), M.steel, -0.48, 0.27, ZT - 0.05);
      P.tips.push(toRoot(V3(-0.48, 0.27, ZT + 0.02)));
      // the mast aerial at the back of the roof
      tubeAB(body, V3(0, yTz(0.82) - 0.01, 0.82), V3(0, yTz(0.82) + 0.3, 1.2), 0.004, M.black, 5);
      add(body, rbox(0.04, 0.025, 0.07, 0.01), M.black, 0, yTz(0.82) + 0.005, 0.83);
      // ---- inside: the floor, the dash (the display in its pod centred along the top, facing the driver), the centre
      // stack with the joystick shifter, cloth seats and the rear bench
      add(body, rbox(1.56, 0.04, 2.3, 0.01), M.trimIn, 0, 0.27, 0.15);
      add(body, rbox(1.58, 0.26, 0.48, 0.07), M.trimIn, 0, 0.86, -1.0);
      add(body, rbox(1.4, 0.03, 0.34, 0.012), M.black, 0, 0.995, -1.04, 0.15, 0, 0);
      add(body, rbox(0.42, 0.08, 0.15, 0.03), M.black, 0, 1.025, -0.985);
      cluster = { parent: body, pos: V3(0, 1.03, -0.912), rot: -0.15, w: 0.36, h: 0.062 };
      add(body, rbox(0.32, 0.36, 0.24, 0.05), M.trimIn, 0, 0.76, -0.74);
      add(body, rbox(0.2, 0.13, 0.012, 0.01), new THREE.MeshBasicMaterial({ color: 0x1d3a52, toneMapped: false }), 0, 0.84, -0.615, -0.25, 0, 0, false);
      tubeAB(body, V3(0.13, 0.86, -0.63), V3(0.13, 0.9, -0.57), 0.008, M.black, 6);
      add(body, new THREE.SphereGeometry(0.018, 10, 8), M.black, 0.13, 0.905, -0.565);
      for (const sx of [-1, 1]) {
        add(body, rbox(0.5, 0.12, 0.5, 0.05), M.cloth, sx * 0.38, 0.47, -0.02);
        add(body, rbox(0.5, 0.62, 0.11, 0.05), M.cloth, sx * 0.38, 0.82, 0.22, 0.2, 0, 0);
        add(body, rbox(0.25, 0.15, 0.09, 0.04), M.cloth, sx * 0.38, 1.2, 0.3, 0.2, 0, 0);
      }
      add(body, rbox(1.3, 0.12, 0.45, 0.05), M.cloth, 0, 0.5, 0.82);
      add(body, rbox(1.3, 0.55, 0.11, 0.05), M.cloth, 0, 0.82, 1.08, 0.25, 0, 0);
      SW = steering(V3(-0.38, 0.96, -0.56), 0.5, 0.185);
      tubeAB(body, V3(-0.38, 0.96, -0.57), V3(-0.38, 0.86, -0.78), 0.03, M.black, 10);
      driver = person({ hip: V3(-0.38, 0.55, -0.02), lean: 0.22, hands: [V3(-0.54, 0.99, -0.55), V3(-0.22, 0.99, -0.55)],
        knee: { dx: 0.08, y: 0.7, z: -0.5 }, foot: { dx: 0.1, y: 0.34, z: -0.92 }, helmet: false });
      P.hideCockpit.push(driver);
    };

    // smooth normals for a non-indexed geometry: each corner takes the mean of the faces meeting there whose normals lie
    // within ang of its own (a bevelled edge rounds off, a crisp one stays crisp)
    function smoothNormals(g, ang) {
      const p = g.attributes.position, n = p.count, fn = new Float32Array(n * 3), cmax = Math.cos(ang || 0.7), map = new Map();
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < n; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
        b.sub(a); c.sub(a); b.cross(c); b.normalize();
        for (let k = 0; k < 3; k++) { fn[(i + k) * 3] = b.x; fn[(i + k) * 3 + 1] = b.y; fn[(i + k) * 3 + 2] = b.z; }
      }
      for (let i = 0; i < n; i++) { const key = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4); let L = map.get(key); if (!L) map.set(key, L = []); L.push(i); }
      const out = new Float32Array(n * 3);
      for (const L of map.values()) for (const i of L) {
        let x = 0, y = 0, z = 0;
        for (const j of L) if (fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2] > cmax) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; }
        const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(out, 3)); return g;
    }
    // a side-view shape (z, y) extruded across the car from x0 to x1, its edges bevelled b (rounded off, smooth)
    function slab(shape, x0, x1, b, seg) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-3, x1 - x0 - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: seg || 48 });
      g.rotateY(Math.PI / 2); g.scale(1, 1, -1);
      // (the mirror turned the faces inside out: swap each triangle's winding back)
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k += 3) for (const at of [p, g.attributes.uv]) { const sz = at.itemSize; for (let cc = 0; cc < sz; cc++) { const t = at.array[(k + 1) * sz + cc]; at.array[(k + 1) * sz + cc] = at.array[(k + 2) * sz + cc]; at.array[(k + 2) * sz + cc] = t; } }
      g.translate(x0 + b, 0, 0);
      return smoothNormals(g, 0.75);
    }

    // ---------------------------------------------------------------- 67
    // A custom supercar whose body is the numerals 6 and 7, side on (traced from the car): the 6's bowl sits over the front
    // wheels with its counter a black oval in the flank, its hook sweeping up and back into the roof; the 7's bar is the
    // rest of the roof and its stroke slants down ahead of the rear wheels. The numerals stand proud on each side - satin
    // silver slabs, their edges rounded off - a smoked canopy between them, a recessed door panel where they meet, the
    // window the sliver between the hook and the bowl. Under them a carbon chassis: the low nose with its LED lamps and a
    // splitter, eyebrows over the wheels, the tail behind the rear wheels; black ten-spoke wheels round red calipers; a wing
    // on two pairs of stalks off the 7's bar
    B.sixseven = () => {
      WF = 0.275; WR = 0.3;
      wheelStyle = { rim: 'lb', rimR: 0.254, tread: 'road' };
      M.paint.side = THREE.DoubleSide; M.paint.metalness = 0.82; M.paint.roughness = 0.34; M.paint.clearcoat = 0.7; M.paint.clearcoatRoughness = 0.12;
      const weave = canvasTex(256, 256, (gx, w, h) => {
        gx.fillStyle = '#08090a'; gx.fillRect(0, 0, w, h);
        const n = 16, c = w / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const d = ((i + j) >> 1) & 1, gr = d ? gx.createLinearGradient(i * c, 0, (i + 1) * c, 0) : gx.createLinearGradient(0, j * c, 0, (j + 1) * c);
          gr.addColorStop(0, '#08090a'); gr.addColorStop(0.5, '#1d1f23'); gr.addColorStop(1, '#070809');
          gx.fillStyle = gr; gx.fillRect(i * c + 0.6, j * c + 0.6, c - 1.2, c - 1.2);
        }
      });
      weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(6, 6);
      M.carbon = new THREE.MeshPhysicalMaterial({ map: weave, color: 0xffffff, roughness: 0.4, metalness: 0.25, clearcoat: 0.75, clearcoatRoughness: 0.06, envMapIntensity: 0.5, side: THREE.DoubleSide });
      M.tint.color.setHex(0x06080b); M.tint.metalness = 0.6;
      M.drl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef4ff, emissiveIntensity: 2, toneMapped: false });
      M.cab = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5, side: THREE.DoubleSide });
      // the picture's pixels -> model (z, y): its wheels' centres 925 px apart for the 2.94 m wheelbase, the ground at 830
      const K = L / 925, Q = (x, y) => new THREE.Vector2((x - 827.5) * K, (830 - y) * K);
      const Qs = (pts) => pts.map(([x, y]) => Q(x, y));
      const SIX_FRONT = [[800, 315], [660, 325], [540, 370], [455, 450], [410, 540], [400, 620], [412, 700], [450, 755], [520, 788], [650, 800], [790, 790], [880, 755], [940, 690], [962, 600], [955, 530]];
      const start = (x, y) => { const s = new THREE.Shape(), q = Q(x, y); s.moveTo(q.x, q.y); return s; };
      const lines = (s, pts) => { for (const q of Qs(pts)) s.lineTo(q.x, q.y); return s; };
      // the 6: the hook's top from its tip, round the front and the bowl's bottom, up its back and over its top to the
      // window's foot, then back up the hook's underside; the counter an oval hole
      const counter = (P) => { const c = Q(727, 578); P.absellipse(c.x, c.y, 103 * K, 63 * K, 0, Math.PI * 2, P instanceof THREE.Shape ? false : true, 0.1); return P; };
      const six = start(905, 318); six.splineThru(Qs(SIX_FRONT.concat([[915, 490], [850, 462], [760, 452], [670, 462], [600, 485], [572, 500]])));
      six.splineThru(Qs([[600, 445], [660, 400], [740, 370], [820, 356], [905, 350]])); six.closePath();
      six.holes.push(counter(new THREE.Path()));
      // the 7: its bar along the roof, the stroke slanting down to the ground ahead of the rear wheels
      const seven = lines(start(885, 318), [[1440, 318], [1456, 323], [1462, 336], [1112, 782], [976, 782], [1298, 372], [885, 362]]); seven.closePath();
      // the door panel between them under the window (set back from the numerals' faces)
      const door = lines(start(945, 505), [[1203, 496], [976, 782], [905, 782]]); door.splineThru(Qs([[940, 690], [962, 600], [955, 530]])); door.closePath();
      // the core between the slabs: a smoked canopy (the 6 and the window), the 7 and the door behind it solid
      const canopy = start(905, 318); canopy.splineThru(Qs(SIX_FRONT)); lines(canopy, [[1205, 490], [1298, 372], [905, 352]]); canopy.closePath();
      const core7 = lines(start(885, 318), [[1440, 318], [1456, 323], [1462, 336], [1112, 782], [905, 782]]); core7.splineThru(Qs([[940, 690], [962, 600], [955, 530]]));
      lines(core7, [[1205, 490], [1298, 372], [885, 362]]); core7.closePath();
      add(body, slab(canopy, -0.6, 0.6, 0.03), M.tint, 0, 0, 0, 0, 0, 0, false);
      add(body, slab(core7, -0.6, 0.6, 0.03), M.paint, 0, 0, 0);
      for (const sx of [-1, 1]) {
        const xr = (a, b) => (sx > 0 ? [a, b] : [-b, -a]);
        add(body, slab(six, ...xr(0.58, 0.7), 0.03), M.paint, 0, 0, 0);
        add(body, slab(seven, ...xr(0.58, 0.7), 0.03), M.paint, 0, 0, 0);
        add(body, slab(door, ...xr(0.58, 0.67), 0.015), M.paint, 0, 0, 0);
        add(body, slab(counter(new THREE.Shape()), ...xr(0.6, 0.62), 0), M.cab, 0, 0, 0, 0, 0, 0, false);   // (the counter: black behind)
        // a slanted LED marker on the 6's face behind the front wheel
        tubeAB(body, V3(sx * 0.705, 0.31, -1.0), V3(sx * 0.705, 0.48, -0.93), 0.009, M.drl, 6);
      }
      // ---- the chassis: the nose (its back an arch round the front tyres), the eyebrows over the wheels, the tail behind
      // the rear ones (its front an arch too), the floor and the side skirts, the boxes between the wheels
      const nose = new THREE.Shape(); nose.moveTo(-2.18, 0.12); nose.lineTo(-2.235, 0.2); nose.quadraticCurveTo(-2.25, 0.3, -2.18, 0.36); nose.quadraticCurveTo(-2.05, 0.47, -1.93, 0.57);
      for (let k = 0; k <= 12; k++) { const a = 2.55 + k * (3.62 - 2.55) / 12; nose.lineTo(zF + 0.49 * Math.cos(a), RF + 0.49 * Math.sin(a)); }   // (0.49: 0.43 past the bevel)
      nose.lineTo(-1.84, 0.1); nose.closePath();
      add(body, slab(nose, -0.9, 0.9, 0.06, 16), M.paint, 0, 0, 0);
      const tail = new THREE.Shape(); tail.moveTo(1.86, 0.1);
      for (let k = 0; k <= 12; k++) { const a = -0.45 + k * (0.62 + 0.45) / 12; tail.lineTo(zR + 0.43 * Math.cos(a), RR + 0.43 * Math.sin(a)); }
      tail.lineTo(1.95, 0.64); tail.lineTo(2.02, 0.6); tail.lineTo(2.035, 0.3); tail.lineTo(2.0, 0.1); tail.closePath();
      add(body, slab(tail, -0.88, 0.88, 0.03, 12), M.carbon, 0, 0, 0);
      for (const sx of [-1, 1]) {
        add(body, arcGeo(zF, RF, 0.43, 0.47, 0.35, 2.6, 0.3), M.paint, sx > 0 ? 0.68 : -0.98, 0, 0);
        add(body, arcGeo(zR, RR, 0.43, 0.47, 0.5, 2.8, 0.3), M.carbon, sx > 0 ? 0.66 : -0.96, 0, 0);
        for (const z of [zF, zR]) { const lg = new THREE.CylinderGeometry(0.44, 0.44, 0.3, 28, 1, true, 0, Math.PI); lg.rotateZ(Math.PI / 2); add(body, lg, M.cab, sx * 0.82, RF, z, 0, 0, 0, false); }
        add(body, rbox(0.3, 0.07, 2.16, 0.02), M.carbon, sx * 0.76, 0.115, 0);
      }
      add(body, rbox(1.3, 0.05, 3.7, 0.01), M.carbon, 0, 0.12, 0);
      add(body, rbox(1.1, 0.42, 0.5, 0.04), M.carbon, 0, 0.33, -1.55);
      add(body, rbox(1.1, 0.42, 0.95, 0.04), M.carbon, 0, 0.35, 1.38);
      // the splitter and the nose's black intake, the diffuser's fins under the tail
      add(body, rbox(1.8, 0.03, 0.34, 0.012), M.carbon, 0, 0.075, -2.1);
      add(body, rbox(1.7, 0.08, 0.12, 0.02), M.carbon, 0, 0.13, -2.16);
      { const sh = new THREE.Shape(); sh.moveTo(-0.6, 0.19); sh.lineTo(0.6, 0.19); sh.lineTo(0.55, 0.29); sh.lineTo(-0.55, 0.29); sh.closePath();
        add(body, new THREE.ShapeGeometry(sh), M.mesh, 0, 0, -2.312, 0, Math.PI, 0, false); }
      for (let k = -3; k <= 3; k++) add(body, new THREE.BoxGeometry(0.012, 0.14, 0.3), M.carbon, k * 0.18, 0.17, 1.92);
      // lamps: an LED blade along the nose's top edge, the headlamps in its corners; the tail's red bar
      add(body, rbox(1.3, 0.014, 0.014, 0.006), M.drl, 0, 0.37, -2.255, 0, 0, 0, false);
      for (const sx of [-1, 1]) {
        const hl = new THREE.Group(); hl.position.set(sx * 0.68, 0.41, -2.07); hl.rotation.set(-0.45, sx * 0.45, 0); body.add(hl);
        add(hl, rbox(0.3, 0.075, 0.08, 0.025), M.gloss, 0, 0, 0);
        add(hl, new THREE.PlaneGeometry(0.25, 0.035), M.head, 0, 0.005, -0.041, 0, Math.PI, 0, false);
        add(hl, rbox(0.26, 0.01, 0.01, 0.004), M.drl, 0, -0.03, -0.04, 0, 0, 0, false);
      }
      spots(0.62, 0.42, -2.2);
      add(body, rbox(1.62, 0.022, 0.012, 0.008), M.tail, 0, 0.585, 2.04, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(body, rbox(0.016, 0.14, 0.012, 0.006), M.tail, sx * 0.8, 0.52, 2.04, 0, 0, 0, false);
      for (const x of [-0.13, 0.13]) { add(body, cylZ(0.05, 0.055, 0.12, 16, true), M.steel, x, 0.3, 2.0); P.tips.push(toRoot(V3(x, 0.3, 2.08))); }
      // the wing: an inverted foil 1 m in chord on two pairs of stalks off the 7's bar
      { const foil = new THREE.Shape(); foil.moveTo(0, 0); foil.bezierCurveTo(0.12, -0.075, 0.55, -0.085, 1.0, -0.01); foil.bezierCurveTo(0.6, 0.02, 0.2, 0.02, 0, 0);
        const wg = new THREE.ExtrudeGeometry(foil, { depth: 1.7, bevelEnabled: false, curveSegments: 20 }); wg.rotateY(-Math.PI / 2); wg.translate(0.85, 0, 0);
        add(body, wg, M.paint, 0, 1.96, 1.3, -0.167, 0, 0);
        for (const sx of [-1, 1]) {
          tubeAB(body, V3(sx * 0.4, 1.6, 1.47), V3(sx * 0.4, 1.97, 1.66), 0.02, M.paint, 10);
          tubeAB(body, V3(sx * 0.4, 1.6, 1.65), V3(sx * 0.4, 2.0, 1.87), 0.02, M.paint, 10);
        } }
      // ---- inside the canopy: a carbon tub, two black buckets, the dash, the wheel on the left
      for (const sx of [-1, 1]) { add(body, rbox(0.42, 0.1, 0.46, 0.04), M.cab, sx * 0.3, 0.42, 0.3); add(body, rbox(0.42, 0.62, 0.1, 0.04), M.cab, sx * 0.3, 0.78, 0.53, 0.3, 0, 0); }
      add(body, rbox(1.1, 0.16, 0.36, 0.05), M.cab, 0, 0.82, -0.6);
      SW = steering(V3(-0.3, 0.93, -0.3), 0.45, 0.17);
      tubeAB(body, V3(-0.3, 0.93, -0.31), V3(-0.3, 0.86, -0.5), 0.025, M.black);
      cluster = { parent: body, pos: V3(-0.3, 0.92, -0.42), rot: -0.4, w: 0.24, h: 0.09 };
      driver = person({ hip: V3(-0.3, 0.55, 0.28), lean: 0.3, hands: [V3(-0.44, 0.97, -0.3), V3(-0.16, 0.97, -0.3)],
        knee: { dx: 0.1, y: 0.68, z: -0.25 }, foot: { dx: 0.12, y: 0.3, z: -0.78 }, helmet: false });
      P.hideCockpit.push(driver);
    };

    // ---------------------------------------------------------------- Silver Bullet (Sunbeam, 1930)
    // Kaye Don's land-speed car: a long silver cigar, the nose drawn out low to a point far ahead of the front wheels, the
    // body rising to its highest at the cockpit, far back just ahead of the rear wheels; the wheels out in the wind with
    // aluminium discs over them, a curved fairing behind each front wheel and a long streamlined fairing down each side
    // between the wheels; two tall fins side by side on the tail; the V12's exhaust stubs along the bonnet; a Union flag
    // on each side of the nose. The driver sits up in the open behind a little aero screen, in a leather helmet
    B.silverbullet = () => {
      WF = 0.18; WR = 0.18;
      wheelStyle = { rim: 'discAlu', rimR: 0.33, tread: 'slick' };
      M.paint.metalness = 0.72; M.paint.roughness = 0.32; M.paint.clearcoat = 0.25; M.paint.clearcoatRoughness = 0.3;
      const S = [[-5.2, 0.05, 0.38, 0.5], [-5.13, 0.15, 0.31, 0.58], [-4.98, 0.24, 0.27, 0.66], [-4.65, 0.32, 0.245, 0.75], [-4.1, 0.39, 0.232, 0.835], [-3.3, 0.445, 0.225, 0.9],
        [-2.3, 0.475, 0.222, 0.95], [-1.2, 0.495, 0.222, 0.995], [-0.2, 0.51, 0.222, 1.03], [0.55, 0.515, 0.225, 1.055], [1.3, 0.505, 0.232, 1.065], [1.9, 0.485, 0.245, 1.045],
        [2.5, 0.44, 0.27, 0.99], [2.95, 0.37, 0.31, 0.92], [3.2, 0.29, 0.36, 0.86], [3.3, 0.2, 0.42, 0.8]];
      // (the body's surface: its section at z, a point on it at ring position k, its half-width at height y - the Blue
      // Bird's way)
      const sbAt = (z) => { let i = 1; while (i < S.length - 1 && S[i][0] < z) i++; const a = S[i - 1], b = S[i], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; };
      const ringPt = (z, k) => {
        const [w, yb, yt] = sbAt(z), a = -Math.PI / 2 + k / 40 * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a), e = 2 / 2.6;
        const sx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
        return V3(w * (sy > 0 ? 1 - 0.18 * sy : 1) * sx, (yb + yt) / 2 + (yt - yb) / 2 * sy, z);
      };
      const sbX = (z, y) => { const [w, yb, yt] = sbAt(z), yc = (yb + yt) / 2, hh = (yt - yb) / 2, sy = clamp((y - yc) / hh, -0.999, 0.999), sn = Math.pow(Math.abs(sy), 1.3);
        return w * (sy > 0 ? 1 - 0.18 * sy : 1) * Math.pow(Math.sqrt(1 - sn * sn), 2 / 2.6); };
      // (on the body at (z, y), side sx: the point and the outward normal, along the car too)
      const onSkin = (sx, z, y) => {
        const x = sbX(z, y), fy = (sbX(z, y + 0.01) - sbX(z, y - 0.01)) / 0.02, fz = (sbX(z + 0.01, y) - sbX(z - 0.01, y)) / 0.02;
        return { p: V3(sx * x, y, z), n: V3(sx, -fy, -fz).normalize() };
      };
      // the cockpit is a real opening in the skin (ring bands 17-22 between the stations at 0.55 and 1.3 m)
      const CK0 = 0.55, CK1 = 1.3;
      add(body, loft(S.map(([z, w, yb, yt]) => ({ z, w, yb, yt, n: 2.6, tw: 0.82 })), { seg: 40, mat: (x, y, z, k) => (k >= 17 && k <= 22 && z > CK0 && z < CK1 ? -1 : 0) }), M.paint, 0, 0, 0);
      for (const sx of [-1, 1]) {
        // the side fairing: a long cigar between the wheels at hub height, pointed at the front, rounded off at the back
        const secs = [];
        for (let i = 0; i <= 20; i++) {
          const u = i / 20, z = -1.42 + 2.87 * u, r = 0.13 * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, u / 0.14)), 0.6) * (u > 0.9 ? Math.sqrt(Math.max(0.04, 1 - ((u - 0.9) / 0.1) ** 2)) : 1);
          secs.push({ z, xc: sx * 0.6, w: r + 0.004, yb: 0.47 - r, yt: 0.47 + r, n: 2 });
        }
        add(body, loft(secs, { seg: 24 }), M.paint, 0, 0, 0);
        // the curved fairing behind each front wheel, from the side fairing's nose up round the back of the tyre
        add(body, arcGeo(zF, RF, 0.52, 0.56, -0.38, 1.45, 0.2), M.paint, sx > 0 ? 0.63 : -0.83, 0, 0);
        // the V12's exhaust stubs: a row of short pipes out of each side of the bonnet, raked back
        for (let k = 0; k < 6; k++) {
          const z = -3.1 + k * 0.22, q = onSkin(sx, z, 0.76), dir = q.n.clone().add(V3(0, 0.1, 0.6)).normalize();
          const a = q.p.clone().addScaledVector(q.n, -0.02), b = q.p.clone().addScaledVector(dir, 0.08);
          tubeAB(body, a, b, 0.022, M.steel, 10); P.tips.push(toRoot(b));
        }
        // the tail fins: two tall ones side by side, their tops rounded
        add(body, profile([[2.25, 0.88], [2.42, 1.48], [2.53, 1.57], [3.1, 1.57], [3.23, 1.49], [3.3, 0.74], [2.25, 0.78]], 0.1, 0.03), M.paint, sx * 0.27, 0, 0);
      }
      // a Union flag on each side of the nose, laid on the skin
      { const flag = canvasTex(256, 128, (gx, w, h) => {
          gx.fillStyle = '#012169'; gx.fillRect(0, 0, w, h);
          const X = (c, lw) => { gx.strokeStyle = c; gx.lineWidth = lw; gx.beginPath(); gx.moveTo(0, 0); gx.lineTo(w, h); gx.moveTo(w, 0); gx.lineTo(0, h); gx.stroke(); };
          X('#ffffff', h * 0.2); X('#c8102e', h * 0.067);
          gx.fillStyle = '#ffffff'; gx.fillRect(0, h / 2 - h / 6, w, h / 3); gx.fillRect(w / 2 - h / 6, 0, h / 3, h);
          gx.fillStyle = '#c8102e'; gx.fillRect(0, h / 2 - h / 10, w, h / 5); gx.fillRect(w / 2 - h / 10, 0, h / 5, h);
        });
        const fm = new THREE.MeshStandardMaterial({ map: flag, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
        for (const sx of [-1, 1]) {
          const q = onSkin(sx, -3.7, 0.6), fl = add(body, new THREE.PlaneGeometry(0.4, 0.2), fm, q.p.x + q.n.x * 0.01, q.p.y + q.n.y * 0.01, q.p.z + q.n.z * 0.01, 0, 0, 0, false);
          fl.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(q.n, V3(0, 0, 0), V3(0, 1, 0)));   // (facing out, upright)
        } }
      // the cockpit: a padded leather roll round the opening, a tub inside it (walls, floor, a leather seat), the dash with
      // its dials, a wood-rimmed wheel and a little aero screen in front
      M.leather = new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.65 });
      M.tub = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.9, side: THREE.DoubleSide });
      {
        const edge = [];
        for (let k = 17; k <= 23; k++) edge.push(ringPt(CK0, k));
        for (let k = 23; k >= 17; k--) edge.push(ringPt(CK1, k));
        const roll = new THREE.CatmullRomCurve3(edge.map((v) => v.clone().add(V3(0, 0.012, 0))), true, 'centripetal');
        add(body, new THREE.TubeGeometry(roll, 90, 0.024, 10, true), M.leather, 0, 0, 0);
        const floorY = 0.34, xR = ringPt(CK0, 17).x, xR1 = ringPt(CK1, 17).x;
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
        add(body, rbox(0.44, 0.1, 0.4, 0.04), M.leather, 0, 0.44, 1.08);
        add(body, rbox(0.44, 0.5, 0.08, 0.04), M.leather, 0, 0.72, 1.27, 0.2, 0, 0);
        add(body, rbox(0.5, 0.16, 0.03, 0.02), M.black, 0, 0.98, CK0 + 0.03, -0.2, 0, 0);
        for (const sx of [-1, 1]) {
          add(body, new THREE.TorusGeometry(0.036, 0.007, 8, 24), M.chrome, sx * 0.17, 0.99, CK0 + 0.05, -0.2, 0, 0);
          add(body, new THREE.CircleGeometry(0.034, 24), M.white, sx * 0.17, 0.99, CK0 + 0.047, -0.2, 0, 0, false);
        }
      }
      const ws = add(body, new THREE.PlaneGeometry(0.46, 0.13), M.glass, 0, 1.13, CK0 - 0.02, -0.4, 0, 0, false); ws.castShadow = false;
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.23, 1.06, CK0 - 0.045), V3(sx * 0.23, 1.19, CK0 + 0.005), 0.007, M.chrome);
      // (a low headrest fairing behind the seat, running back into the tail)
      add(body, loft([{ z: 1.32, w: 0.05, yb: 1.04, yt: 1.1 }, { z: 1.4, w: 0.14, yb: 1.03, yt: 1.24 }, { z: 1.62, w: 0.14, yb: 1.03, yt: 1.22 }, { z: 2.2, w: 0.07, yb: 1.0, yt: 1.06 }, { z: 2.5, w: 0.02, yb: 0.97, yt: 0.99 }].map((q) => Object.assign(q, { n: 2.2 })), { seg: 24 }), M.paint, 0, 0, 0);
      SW = steering(V3(0, 0.98, 0.74), 0.45, 0.17, 'wood');
      tubeAB(body, V3(0, 0.93, CK0 + 0.03), V3(0, 0.96, 0.71), 0.016, M.black);
      cluster = { parent: body, pos: V3(0, 0.99, CK0 + 0.05), rot: -0.2, w: 0.14, h: 0.07 };
      driver = person({ hip: V3(0, 0.48, 1.08), lean: 0.25, hands: [V3(-0.13, 1.01, 0.76), V3(0.13, 1.01, 0.76)],
        knee: { dx: 0.11, y: 0.66, z: 0.62 }, foot: { dx: 0.13, y: 0.42, z: 0.15 }, goggles: true });
    };

    // ---------------------------------------------------------------- Hot Rod (a chopped 1934 Ford five-window coupe)
    // The body from the firewall back: the rounded cowl, the doors hinged at the back (their handles at the front), the
    // chopped top - a short near-upright windshield, door and quarter windows with round corners, a small back window - the
    // back curving down over the deck to the tail, bulbous rear fenders over the big tyres. Fenderless at the front: the
    // tall grille shell over the dropped axle on its transverse leaf, the frame rails, and the engine out in the open - a red
    // big-block, polished valve covers, a polished 8-71 blower with its drive belt, two carbs under a big flat hat - and the
    // zoomies, four polished pipes a side down from the ports and turning back and up into flared tips ahead of the cowl. Polished wheels
    B.hotrod = () => {
      WF = 0.225; WR = 0.42;
      wheelStyle = { rim: 'rod', rimR: 0.19, rimRR: 0.19, tread: 'road' };
      M.paint.side = THREE.DoubleSide; M.paint.metalness = 0.2; M.paint.roughness = 0.2; M.paint.clearcoat = 1;
      M.polish = M.polish || new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.08, metalness: 1 });
      M.block = new THREE.MeshStandardMaterial({ color: 0xa0161c, roughness: 0.35, metalness: 0.3 });
      M.hose = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.7 });
      M.trimIn = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.8, side: THREE.DoubleSide });
      M.linerB = Object.assign(M.black.clone(), { side: THREE.DoubleSide });
      M.seam = new THREE.MeshStandardMaterial({ color: 0x220405, roughness: 0.6 });
      const ZC = -0.45, ZT = 2.32, ZWT = -0.34, ZB = 0.62, ZD = 1.22;      // the cowl, the tail, the windshield's top, the roof's back, the deck
      const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
      // ---- the body: cross-sections from the cowl to the tail (the coupe's round-shouldered, tumbled-in sides)
      const Wz = tbl([[ZC, 0.62], [-0.38, 0.66], [-0.2, 0.69], [0.6, 0.71], [1.4, 0.7], [1.9, 0.67], [2.15, 0.6], [2.27, 0.5], [ZT, 0.36]]);
      const yBz = tbl([[ZC, 0.36], [1.6, 0.36], [2.0, 0.4], [2.25, 0.48], [ZT, 0.56]]);
      const ySh = tbl([[ZC, 0.96], [-0.3, 0.99], [0.6, 1.0], [1.3, 0.99], [1.9, 0.9], [2.2, 0.76], [ZT, 0.66]]);
      const yTop = tbl([[ZC, 1.0], [-0.42, 1.03], [-0.4, 1.06], [ZWT, 1.35], [-0.2, 1.375], [0.3, 1.385], [ZB, 1.355], [0.85, 1.27], [1.05, 1.13], [ZD, 1.06], [1.6, 1.0], [1.95, 0.9], [2.2, 0.76], [ZT, 0.66]]);
      const Wtz = tbl([[ZC, 0.5], [ZWT, 0.56], [0.3, 0.58], [ZB, 0.56], [ZD, 0.52], [ZT, 0.3]]);
      const section = (z) => {
        const W = Wz(z), yb = yBz(z), ysh = Math.max(ySh(z), yb + 0.15), yt = Math.max(yTop(z), ysh + 0.02), Wb = W - 0.035, wt = Math.min(Wtz(z), Wb - 0.02);
        const P = [[0, yb], [W * 0.6, yb], [W - 0.06, yb + 0.005], [W - 0.02, yb + 0.03]];
        for (let k = 1; k <= 5; k++) { const t = k / 5; P.push([W - 0.02 * (1 - t) + 0.025 * Math.sin(Math.PI * t), yb + 0.03 + (ysh - yb - 0.03) * t]); }
        P.push([W - 0.012, ysh + 0.012], [Wb, ysh + 0.03]);
        for (let k = 1; k <= 4; k++) { const t = k / 4; P.push([Wb + (wt - Wb) * Math.pow(t, 0.8), ysh + 0.03 + (yt - 0.03 - ysh - 0.03) * (1 - Math.pow(1 - t, 1.8))]); }
        P.push([wt * 0.55, yt - 0.006], [0, yt]);
        return P;
      };
      // (the glass: the windshield, the door window, the quarter window; a small back window on the slope)
      const ST = stationsOf(ZC, ZT, 0.05, [-0.42, -0.4, ZWT, -0.3, -0.26, 0.45, 0.52, 0.8, ZB, 0.92, 1.02]);
      const g = carBody({
        stations: ST, section, capMat: 0,
        mat: (b, z) => {
          if (b <= 2) return 2;
          if (b <= 10) return 0;
          if (b <= 13) return (z > -0.26 && z < 0.45) || (z > 0.52 && z < 0.8 - (b - 11) * 0.04) ? 1 : 0;   // door and quarter windows
          if (z > -0.4 && z < ZWT - 0.01 && b >= 14) return 1;                                               // the windshield
          if (z > 0.92 && z < 1.02 && b >= 15) return 1;                                                     // the back window
          return 0;
        },
      });
      add(body, g, [M.paint, M.tint, M.black], 0, 0, 0);
      const surf0 = (z, t, sx) => { const P = section(z), i = Math.max(0, Math.min(P.length - 2, Math.floor(t))), f = t - i; return V3(sx * (P[i][0] + (P[i + 1][0] - P[i][0]) * f), P[i][1] + (P[i + 1][1] - P[i][1]) * f, z); };
      const seamAlong = (sx, pts, r, mat) => { const Pp = pts.map(([z, t]) => surf0(z, t, sx).multiply(V3(1.004, 1, 1))); add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Pp), Pp.length * 4, r || 0.0035, 5, false), mat || M.seam, 0, 0, 0, 0, 0, 0, false); };
      // the windshield's frame, the doors (hinged at the back, the handles at the front), the drip rail
      for (const sx of [-1, 1]) {
        for (const z of [-0.3, 0.47]) seamAlong(sx, [[z, 3.5], [z, 6], [z, 9], [z, 11.5]]);
        seamAlong(sx, [[-0.3, 3.4], [0.1, 3.4], [0.47, 3.4]]);
        const p = surf0(-0.22, 9.4, sx); add(body, rbox(0.025, 0.02, 0.1, 0.008), M.chrome, p.x + sx * 0.014, p.y, -0.22);
        seamAlong(sx, Array.from({ length: 12 }, (_, i) => [-0.33 + i * 1.12 / 11, 14.6]), 0.005, M.chrome);
        tubeAB(body, surf0(-0.41, 13.9, sx), surf0(ZWT, 15, sx), 0.012, M.chrome);
      }
      // ---- the rear fenders: bulbous pontoons over the big tyres, the openings cut round them
      for (const sx of [-1, 1]) {
        const secs = [];
        for (let i = 0; i <= 44; i++) {
          const u = i / 44, z = 0.62 + 1.66 * u, top = 0.66 + 0.36 * Math.sin(Math.PI * Math.pow(u, 0.85)), w = 0.07 + 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.05));
          secs.push({ z, xc: sx * 0.78, w, yb: 0.34, yt: Math.max(0.4, top), n: 2.4, bw: 0.9 });
        }
        add(body, loft(secs, { seg: 64, mat: (x, y, z) => (Math.hypot(z - zR, y - RR) < RR + 0.04 ? -1 : 0) }), M.paint, 0, 0, 0);
        // (a black rubber edging round the opening hides the cut's steps)
        { const rim = new THREE.TorusGeometry(RR + 0.045, 0.014, 6, 48, Math.PI * 1.1); rim.rotateY(Math.PI / 2); rim.rotateX(-Math.PI * 0.05); add(body, rim, M.black, sx * 0.97, RR, zR, 0, 0, 0, false); }
        const lg = new THREE.CylinderGeometry(RR + 0.04, RR + 0.04, 0.46, 28, 1, true, 0, Math.PI); lg.rotateZ(Math.PI / 2);
        add(body, lg, M.linerB, sx * 0.76, RR, zR, 0, 0, 0, false);
        // (a small teardrop tail lamp on each fender's back)
        add(body, new THREE.SphereGeometry(0.045, 14, 10).scale(1, 0.75, 1.5), M.tail, sx * 0.78, 0.72, 2.18, 0, 0, 0, false);
      }
      // the nerf bar across the back, the plate under it
      tubeAB(body, V3(-0.62, 0.42, ZT - 0.02), V3(0.62, 0.42, ZT - 0.02), 0.022, M.chrome, 12);
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.45, 0.42, ZT - 0.02), V3(sx * 0.45, 0.4, ZT - 0.3), 0.018, M.chrome, 10);
      add(body, rbox(0.3, 0.15, 0.01, 0.005), M.white, 0, 0.6, ZT + 0.006, -0.35, 0, 0);
      // ---- the frame rails and the front end: the dropped tube axle on its transverse leaf, hairpins back to the frame,
      // the shocks; the grille shell over the axle (red, its chrome bars, the radiator behind it) and the hose to the engine
      for (const sx of [-1, 1]) tubeAB(body, V3(sx * 0.38, 0.36, zF - 0.25), V3(sx * 0.42, 0.36, zR + 0.75), 0.04, M.black, 8);
      for (const zz of [zF - 0.2, -0.6, 0.6]) tubeAB(body, V3(-0.38, 0.36, zz), V3(0.38, 0.36, zz), 0.03, M.black, 8);
      tubeAB(body, V3(-0.62, RF - 0.04, zF), V3(0.62, RF - 0.04, zF), 0.03, M.chrome, 12);
      for (const sx of [-1, 1]) {
        tubeAB(body, V3(sx * 0.6, RF - 0.04, zF), V3(sx * 0.62, RF + 0.04, zF), 0.03, M.chrome, 10);
        tubeAB(body, V3(sx * 0.6, RF - 0.03, zF + 0.02), V3(sx * 0.36, 0.37, zF + 0.75), 0.016, M.chrome, 8);
        tubeAB(body, V3(sx * 0.6, RF - 0.06, zF + 0.02), V3(sx * 0.36, 0.33, zF + 0.75), 0.016, M.chrome, 8);
        tubeAB(body, V3(sx * 0.55, RF - 0.02, zF - 0.05), V3(sx * 0.42, 0.62, zF + 0.05), 0.02, M.chrome, 10);
      }
      { const lf = new THREE.TorusGeometry(0.9, 0.025, 6, 40, 0.75); lf.rotateZ(Math.PI / 2 - 0.375); lf.scale(1.3, 0.12, 1); add(body, lf, M.black, 0, RF + 0.05 - 0.12 * 0.9 * 0.93, zF + 0.04, 0, 0, 0); }
      { // the grille shell: tall, its top round, a chrome surround and bars; the radiator behind
        const gz = zF + 0.08, sh = new THREE.Shape();
        sh.moveTo(-0.2, 0.45); sh.lineTo(0.2, 0.45); sh.lineTo(0.235, 0.95); sh.quadraticCurveTo(0.235, 1.08, 0, 1.1); sh.quadraticCurveTo(-0.235, 1.08, -0.235, 0.95); sh.closePath();
        const hole = new THREE.Path(); hole.moveTo(-0.16, 0.5); hole.lineTo(0.16, 0.5); hole.lineTo(0.19, 0.94); hole.quadraticCurveTo(0.19, 1.04, 0, 1.055); hole.quadraticCurveTo(-0.19, 1.04, -0.19, 0.94); hole.closePath();
        sh.holes.push(hole);
        const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3, curveSegments: 16 });
        add(body, sg, M.paint, 0, 0, gz - 0.06);
        const ins = new THREE.Shape(); ins.moveTo(-0.16, 0.5); ins.lineTo(0.16, 0.5); ins.lineTo(0.19, 0.94); ins.quadraticCurveTo(0.19, 1.04, 0, 1.055); ins.quadraticCurveTo(-0.19, 1.04, -0.19, 0.94); ins.closePath();
        add(body, new THREE.ShapeGeometry(ins), M.linerB, 0, 0, gz - 0.03, 0, Math.PI, 0, false);
        for (let k = -6; k <= 6; k++) { const x = k * 0.028, top = 1.04 - Math.pow(Math.abs(x) / 0.19, 2.2) * 0.1; add(body, new THREE.BoxGeometry(0.008, top - 0.52, 0.02), M.chrome, x, (top + 0.52) / 2, gz - 0.045); }
        add(body, rbox(0.42, 0.5, 0.08, 0.02), M.black, 0, 0.78, gz + 0.12);
        pipe(body, [V3(0.1, 0.98, gz + 0.16), V3(0.15, 1.0, gz + 0.32), V3(0.12, 0.92, gz + 0.5)], 0.03, M.hose, 10);
      }
      spots(0.15, 0.7, zF - 0.1);
      // ---- the engine: the red block and heads, polished valve covers, the blower with its ribs and belt drive, two carbs
      // under the flat hat
      const ez = -0.82, eg = new THREE.Group(); eg.position.set(0, 0, ez); body.add(eg);
      add(eg, rbox(0.42, 0.36, 0.74, 0.04), M.block, 0, 0.52, 0);
      add(eg, rbox(0.46, 0.08, 0.6, 0.02), M.black, 0, 0.32, 0.02);
      for (const sx of [-1, 1]) {
        const hd = new THREE.Group(); hd.position.set(sx * 0.2, 0.7, 0); hd.rotation.z = -sx * 0.6; eg.add(hd);
        add(hd, rbox(0.16, 0.14, 0.7, 0.02), M.block, 0, 0, 0);
        add(hd, rbox(0.15, 0.09, 0.68, 0.03), M.polish, sx * 0.0, 0.1, 0);
        // the zoomies: a polished pipe from each port, out and down outboard of the frame rail, then turning back and UP into a
        // flared tip - the front pipe the longest and outermost, each tip passing outside the next pipe's bend, so the four
        // tips step up and back in a row ahead of the cowl
        add(hd, rbox(0.014, 0.07, 0.6, 0.004), M.polish, sx * 0.084, -0.02, 0);
        M.polish2 = M.polish2 || Object.assign(M.polish.clone(), { side: THREE.DoubleSide });
        for (let k = 0; k < 4; k++) {
          const Z = ez - 0.21 + k * 0.115, xk = 0.47 + (3 - k) * 0.055, yb = 0.25 + k * 0.05;
          const pts = [V3(sx * 0.255, 0.66, Z), V3(sx * 0.31, 0.626, Z), V3(sx * (xk - 0.02), 0.52, Z + 0.012), V3(sx * xk, yb + 0.07, Z + 0.032),
            V3(sx * xk, yb, Z + 0.07), V3(sx * (xk + 0.04), yb + 0.035, Z + 0.14)];
          const cv = new THREE.CatmullRomCurve3(pts), e = pts[5], d = cv.getTangent(1);
          add(body, new THREE.TubeGeometry(cv, 72, 0.027, 14, false), M.polish, 0, 0, 0);
          const tip = add(body, cylZ(0.042, 0.0275, 0.08, 18, true), M.polish2, e.x + d.x * 0.04, e.y + d.y * 0.04, e.z + d.z * 0.04);
          tip.quaternion.setFromUnitVectors(V3(0, 0, 1), d);
          const hole = add(body, new THREE.CircleGeometry(0.027, 14), M.black, e.x + d.x * 0.006, e.y + d.y * 0.006, e.z + d.z * 0.006, 0, 0, 0, false);
          hole.quaternion.setFromUnitVectors(V3(0, 0, 1), d);
          P.tips.push(toRoot(e.clone().addScaledVector(d, 0.11)));
        }
      }
      // (the intake, the blower case with its ribs, the drive belt and pulleys at the front, the carbs and the hat)
      add(eg, rbox(0.3, 0.1, 0.55, 0.02), M.polish, 0, 0.84, 0);
      add(eg, rbox(0.26, 0.2, 0.6, 0.04), M.polish, 0, 0.98, 0);
      for (let k = 0; k < 9; k++) add(eg, rbox(0.29, 0.008, 0.6, 0.003), M.alu, 0, 0.9 + k * 0.022, 0, 0, 0, 0, false);
      add(eg, cylX(0.07, 0.07, 0.05, 24), M.polish, 0, 0.98, -0.33, 0, Math.PI / 2, 0);
      add(eg, cylZ(0.07, 0.07, 0.05, 24), M.polish, 0, 0.98, -0.33);
      add(eg, cylZ(0.08, 0.08, 0.05, 24), M.polish, 0, 0.56, -0.4);
      add(eg, rbox(0.06, 0.48, 0.02, 0.01), M.black, 0, 0.77, -0.39);
      for (const dz of [-0.13, 0.13]) add(eg, rbox(0.17, 0.1, 0.18, 0.02), M.alu, 0, 1.12, dz);
      add(eg, rbox(0.46, 0.09, 0.66, 0.04), M.polish, 0, 1.21, 0);
      add(eg, rbox(0.42, 0.012, 0.62, 0.004), M.alu, 0, 1.256, 0);
      // ---- the firewall (red, the cowl's front), the seat, the dash and the wheel, the driver in a helmet
      add(body, rbox(1.2, 0.6, 0.03, 0.02), M.paint, 0, 0.68, ZC + 0.01);
      add(body, rbox(1.2, 0.04, 2.0, 0.01), M.trimIn, 0, 0.4, 0.5);
      add(body, rbox(1.1, 0.14, 0.5, 0.05), M.trimIn, 0, 0.5, 0.45);
      add(body, rbox(1.1, 0.6, 0.12, 0.05), M.trimIn, 0, 0.8, 0.72, 0.18, 0, 0);
      add(body, rbox(1.2, 0.16, 0.2, 0.04), M.paint, 0, 0.94, -0.36);
      SW = steering(V3(-0.32, 0.98, -0.1), 0.6, 0.17);
      tubeAB(body, V3(-0.32, 0.98, -0.11), V3(-0.32, 0.86, -0.38), 0.022, M.chrome);
      cluster = { parent: body, pos: V3(0.0, 0.97, -0.255), rot: -0.25, w: 0.2, h: 0.08 };
      driver = person({ hip: V3(-0.32, 0.56, 0.42), lean: 0.25, hands: [V3(-0.46, 1.0, -0.08), V3(-0.18, 1.0, -0.08)],
        knee: { dx: 0.1, y: 0.7, z: 0.0 }, foot: { dx: 0.12, y: 0.42, z: -0.38 }, helmet: false });
      P.hideCockpit.push(driver);
    };

    // ---------------------------------------------------------------- Chevrolet Chevelle SS 454 (1970)
    // The 1970 sport coupe to its real dimensions (5.01 m long, 1.92 wide, 1.34 tall, 2.85 m wheelbase): the long hood with
    // the cowl-induction bulge (and the flap at its back); the V-nose - a point in plan and dipping in the middle - its
    // leading edge a lip over the quad headlamps (sunk in the fenders' ends behind deep chrome bezels) and the two-tier
    // grille; the chrome bumper round the front and its corners dipping under the grille, the plate under its middle;
    // one crisp shoulder crease the whole length of the body; round wheel openings with bright lips, the rear one under the
    // coke-bottle hips; the hardtop - no B-pillar, chrome round the glass - with the semi-fastback roof: the backlight set
    // down between sail panels that run on to the deck, the black vinyl top over both; the tail lamps in the rear bumper;
    // two red stripes over the hood bulge and the deck lid; a red interior. Polished five-spokes on redline radials
    B.chevelle = () => {
      WF = 0.235; WR = 0.255;
      wheelStyle = { rim: 'chev', rimR: 0.216, tread: 'road' };
      M.paint.side = THREE.DoubleSide; M.paint.metalness = 0.15; M.paint.roughness = 0.22; M.paint.clearcoat = 1;
      M.vinyl = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });
      M.stripe = new THREE.MeshPhysicalMaterial({ color: 0xe0141f, roughness: 0.25, metalness: 0.1, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      M.redIn = new THREE.MeshStandardMaterial({ color: 0x9a0c12, roughness: 0.6, side: THREE.DoubleSide });
      M.chromeD = M.chromeD || Object.assign(M.chrome.clone(), { side: THREE.DoubleSide });
      M.seam = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 });
      M.linerB = Object.assign(M.black.clone(), { side: THREE.DoubleSide });
      M.lampLens = new THREE.MeshPhysicalMaterial({ color: 0xdfe6ee, roughness: 0.05, metalness: 0.3, clearcoat: 1 });
      M.tint.color.setHex(0x1a2026);
      const ZN = -2.4, ZT = 2.61, ZW = -0.62, ZH = 0.03, ZB0 = 1.0, ZB1 = 1.62, ZS1 = 2.0;
      const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }, lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
      const Wz = tbl([[ZN, 0.89], [-2.385, 0.918], [-2.35, 0.935], [-2.2, 0.943], [-1.4, 0.95], [-0.6, 0.945], [0.4, 0.94], [0.9, 0.948], [1.4, 0.958], [2.0, 0.953], [2.4, 0.94], [2.53, 0.918], [ZT, 0.88]]);
      const yBz = archY(tbl([[ZN, 0.36], [-2.3, 0.27], [-2.12, 0.22], [2.2, 0.22], [2.45, 0.27], [ZT, 0.36]]), [zF, zR], RF, 0.415);
      const ySh = tbl([[ZN, 0.815], [-2.33, 0.836], [-2.2, 0.845], [-1.4, 0.86], [ZW, 0.875], [0.4, 0.885], [1.2, 0.9], [1.9, 0.91], [2.45, 0.905], [ZT, 0.88]]);
      const yH = tbl([[ZN, 0.848], [-2.36, 0.858], [-2.3, 0.865], [-2.2, 0.872], [-1.6, 0.886], [ZW, 0.905]]);               // the hood
      const bulge = (z) => 0.06 * sm((z + 2.27) / 0.28) * (z < ZW - 0.04 ? 1 : 0);                        // its cowl-induction bulge
      const yRoof = tbl([[ZW, 0.91], [-0.3, 1.105], [ZH, 1.305], [0.5, 1.335], [ZB0, 1.31]]);                // windshield, roof
      const yBL = tbl([[ZB0, 1.31], [1.3, 1.155], [ZB1, 0.98]]);                                          // the backlight
      const ySail = tbl([[ZB0, 1.31], [ZB1, 1.12], [ZS1, 0.97]]);                                        // the sail panels
      // (the nose's V: dZ(x) back from the body's end - its middle 2 cm ahead, the corners 7 cm back - and eV(x) down, the
      // point in its middle; the body's front ramps into both over its last 35 cm, and its parts on the front are bent to them)
      const kV = 0.1, dZ = (x) => -0.02 + kV * Math.abs(x), eV = (x) => 0.045 * Math.max(0, 1 - Math.abs(x) / 0.5);
      const wZ = (z) => sm((-2.05 - z) / 0.35), wY = (z) => sm((-2.15 - z) / 0.25);
      const warp = (x, y, z) => [y - eV(x) * wY(z) * clamp((y - 0.6) / 0.2, 0, 1), z + wZ(z) * dZ(x)];
      const yDeck = tbl([[ZB1, 0.975], [ZS1, 0.97], [2.45, 0.958], [2.56, 0.946], [ZT, 0.925]]);
      // the section at z, right half, 20 points: underbody 0-3, the rocker 4, the side up to the crease 5-9, the crease
      // 10-11, the shoulder 12, 13 the belt (the hood's edge ahead of the windshield), 14-19 by zone: the hood and its
      // bulge / the glass up to the roof / the sail up its slope and the backlight set down inside it / the sail and the
      // deck lid / the deck
      const section = (z) => {
        const W = Wz(z), yb = yBz(z), ysh = Math.max(ySh(z), yb + 0.09), ycr = ysh - 0.022, ybe = ysh + 0.022;   // (just clear of the wheel openings' tops)
        const hip = 0.03 * sm((z - 0.65) / 0.55) * sm((2.35 - z) / 0.45);                    // (the rear hips swell a touch more)
        const P = [[0, yb], [W * 0.55, yb], [W - 0.09, yb], [W - 0.04, yb + 0.015], [W - 0.012, yb + 0.05]];
        for (let k = 1; k <= 5; k++) { const t = k / 5; P.push([W - 0.012 * (1 - t) + (0.016 + hip) * Math.sin(Math.PI * t * 0.9), yb + 0.05 + (ycr - yb - 0.05) * t]); }
        P.push([W + 0.006, ycr + 0.006], [W - 0.004, ycr + 0.016], [W - 0.03, ysh + 0.012]);
        if (z < ZW) {
          const h = yH(z), bu = bulge(z);
          P.push([W - 0.075, ybe - 0.005], [0.66, h + 0.004], [0.5, h + 0.008], [0.475, h + 0.01 + bu * 0.85], [0.445, h + 0.012 + bu], [0.3, h + 0.016 + bu], [0, h + 0.02 + bu]);
        } else if (z < ZB0) {
          const yt = yRoof(z), Wb = W - 0.1, Wt = 0.64;
          P.push([Wb, ybe]);
          for (let k = 1; k <= 4; k++) { const t = k / 4; P.push([Wb + (Wt - Wb) * Math.pow(t, 0.9), ybe + (yt - 0.02 - ybe) * (1 - Math.pow(1 - t, 1.6))]); }
          P.push([0.56, yt - 0.006], [0, yt]);
        } else {
          // (the sail rising from the belt to its top, then down into the recess: the backlight, then the deck lid)
          const ys = z < ZS1 ? ySail(z) : yDeck(z), yin = z < ZB1 ? yBL(z) : yDeck(z), Wb = W - 0.1, Ws = lerp(0.64, 0.66, (z - ZB0) / 1.0);
          P.push([Wb, ybe]);
          for (let k = 1; k <= 3; k++) { const t = k / 3; P.push([Wb + (Ws - Wb) * Math.pow(t, 0.9), ybe + (ys - 0.02 - ybe) * (1 - Math.pow(1 - t, 1.6))]); }
          P.push([0.6, ys], [0.565, Math.min(ys, yin + 0.004)], [0, yin + 0.014]);
        }
        return P;
      };
      const quarterGlass = (z) => z > 0.645 && z < ZB0 - 0.02, doorGlass = (z) => z > ZW + 0.07 && z < 0.615;
      const ST = stationsOf(ZN, ZT, 0.05, [ZW - 0.05, ZW - 0.01, ZW, ZW + 0.02, ZW + 0.07, ZH, 0.615, 0.645, ZB0 - 0.02, ZB0, ZB0 + 0.02, ZB1, ZB1 + 0.02, ZS1, ZS1 + 0.03,
        zF - 0.43, zF + 0.43, zR - 0.43, zR + 0.43, -2.39, -2.37, -2.33, 2.55, 2.59]);
      const g = carBody({
        stations: ST, section,
        mat: (b, z) => {
          if (b <= 3) return 2;                                                   // underbody
          if (b <= 12) return 0;                                                  // the sides, the crease, the shoulder
          if (z < ZW) return 0;                                                   // the hood
          if (z < ZB0) {
            if (b <= 15) return doorGlass(z) || quarterGlass(z) ? 1 : z > 0.6 ? 4 : 0;  // the side glass (a vinyl sail behind it)
            if (b === 16) return z < ZH ? 0 : 4;                                  // the A-pillar / the roof's edge
            return z < ZH ? 3 : 4;                                                // windshield / the vinyl roof
          }
          if (z < ZS1 && b <= 17) return 4;                                       // the sail panels (vinyl), their inner walls
          if (z < ZB1 && b >= 18) return 3;                                       // the backlight
          return 0;                                                               // the deck lid, the tail
        },
      });
      { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const [y, z] = warp(p.getX(i), p.getY(i), p.getZ(i)); p.setY(i, y); p.setZ(i, z); } g.computeVertexNormals(); }
      add(body, g, [M.paint, M.tint, M.black, M.glass, M.vinyl], 0, 0, 0);
      // (a point on the skin at z, t round the section, side sx, and the outward normal; a line along the skin; the
      // height of the top surface at (z, |x|) - for the stripes)
      const surf0 = (z, t, sx) => { const P = section(z), i = Math.max(0, Math.min(P.length - 2, Math.floor(t))), f = t - i; return V3(sx * (P[i][0] + (P[i + 1][0] - P[i][0]) * f), P[i][1] + (P[i + 1][1] - P[i][1]) * f, z); };
      const surfN = (z, t, sx) => {
        const p = surf0(z, t, sx), dz = surf0(z + 0.01, t, sx).sub(p), dt = surf0(z, t + 0.05, sx).sub(p);
        return (sx > 0 ? new THREE.Vector3().crossVectors(dt, dz) : new THREE.Vector3().crossVectors(dz, dt)).normalize();
      };
      const seamAlong = (sx, pts, r, mat) => {
        const Pp = pts.map(([z, t]) => { const p = surf0(z, t, sx).addScaledVector(surfN(z, t, sx), 0.0015), [y, wz] = warp(p.x, p.y, p.z); return p.set(p.x, y, wz); });
        add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Pp), Pp.length * 4, r || 0.0035, 5, false), mat || M.seam, 0, 0, 0, 0, 0, 0, false);
      };
      const topY = (z, x) => { const P = section(z); x = Math.abs(x); for (let i = 12; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; if (x <= a[0] && x >= b[0]) return a[1] + (b[1] - a[1]) * (a[0] - x) / Math.max(1e-6, a[0] - b[0]); } return P[P.length - 1][1]; };
      // the stripes: two red ones over the hood's bulge and the deck lid, a thin black line between them
      const stripe = (z0, z1, x0, x1) => {
        const nz = Math.ceil((z1 - z0) / 0.025), nx = 6, pos = [], idx = [];
        for (let i = 0; i <= nz; i++) { const z = z0 + (z1 - z0) * i / nz; for (let j = 0; j <= nx; j++) { const x = x0 + (x1 - x0) * j / nx, [y, wz] = warp(x, topY(z, x) + 0.0025, z); pos.push(x, y, wz); } }
        for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) { const a = i * (nx + 1) + j, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
        add(body, sg, M.stripe, 0, 0, 0, 0, 0, 0, false);
      };
      for (const sx of [-1, 1]) {
        stripe(-2.39, ZW - 0.05, sx > 0 ? 0.03 : -0.37, sx > 0 ? 0.37 : -0.03);
        stripe(ZB1 + 0.04, 2.57, sx > 0 ? 0.03 : -0.37, sx > 0 ? 0.37 : -0.03);
      }
      // wheel-arch liners, and the bright lips round the openings
      for (const [z, r] of [[zF, RF], [zR, RR]]) for (const sx of [-1, 1]) {
        const lg = new THREE.CylinderGeometry(0.405, 0.405, 0.42, 28, 1, true, 0, Math.PI); lg.rotateZ(Math.PI / 2);
        add(body, lg, M.linerB, sx * (Wz(z) - 0.24), RF, z, 0, 0, 0, false);
        const lip = new THREE.TorusGeometry(0.415 * 0.97, 0.009, 6, 40, Math.PI * 0.92); lip.rotateY(Math.PI / 2); lip.rotateX(Math.PI * 0.04);
        add(body, lip, M.chrome, sx * (Wz(z) + 0.004), RF, z, 0, 0, 0, false);
      }
      // ---- the front, the 1970's: the nose a V in plan - its middle ahead, the corners swept back - and dipping to a point
      // in the middle; the hood's and fenders' leading edge a lip right across, over the quad lamps (sunk in the fenders'
      // ends behind deep chrome bezels) and the grille between them: two tiers of black egg-crate in a bright surround, a
      // body-colour bar between them; the chrome bumper round the front and its corners, dipping under the grille's point,
      // the parking lamps in its lower face, the plate under its middle. (Built flat a few cm ahead of the body's end, then
      // bent to the V whole - the body's end is warped to the same V)
      const ZF = ZN - 0.045, yL = 0.705, LX = [0.585, 0.775], GX = 0.48, yG0 = 0.598, yG1 = 0.81, yB0 = 0.664, yB1 = 0.69;
      const S0 = section(ZN), yTopF = (x) => {
        x = Math.abs(x);
        for (let i = 10; i < S0.length - 1; i++) { const a = S0[i], b = S0[i + 1]; if (x <= a[0] && x >= b[0]) return a[1] + (b[1] - a[1]) * (a[0] - x) / Math.max(1e-6, a[0] - b[0]); }
        return S0[S0.length - 1][1];
      };
      const fr = new THREE.Group(), frP = new THREE.Group(); body.add(fr, frP);
      // (a profile [[out, y], ...] carried along a plan path [[x, z], ...] - out along the path's outward normal - its ends
      // pinched shut)
      const sweep = (path, prof, pinch) => {
        const pos = [], idx = [], n = path.length; let m = 0;
        for (let i = 0; i < n; i++) {
          const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
          const nx = tz / tl, nz = -tx / tl, Pr = prof(path[i][0], nz), f = pinch ? Math.min(1, 0.08 + 0.92 * Math.min(i, n - 1 - i) / pinch) : 1;
          const cy = Pr.reduce((s, q) => s + q[1], 0) / Pr.length; m = Pr.length;
          for (const [d, y] of Pr) pos.push(path[i][0] + nx * d * f, cy + (y - cy) * f, path[i][1] + nz * d * f);
        }
        for (let i = 0; i < n - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, c = a + m; idx.push(a, c, a + 1, a + 1, c, c + 1); }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals(); return sg;
      };
      // the leading edge: the hood's lip, on round the fenders' tops over the lamps
      { const xs = []; for (let k = -35; k <= 35; k++) xs.push([k * 0.025, ZF]);
        add(fr, sweep(xs, (x) => { const t = yTopF(x); return [[-0.07, t - 0.004], [-0.035, t], [0, t + 0.003], [0.02, t + 0.001], [0.033, t - 0.006], [0.038, t - 0.016], [0.035, t - 0.026], [0.022, t - 0.032], [-0.005, t - 0.034], [-0.07, t - 0.034]]; }, 3), M.paint, 0, 0, 0); }
      M.grB = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.32, metalness: 0.8 });
      M.lensT = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false });
      for (const sx of [-1, 1]) {
        const half = (w, h, d, x, y) => new THREE.BoxGeometry(w, h, d).translate(sx * x, y, 0);
        // the grille: black behind, the egg-crate's bars, the bright surround along the top and down the ends, the
        // body-colour bar between the tiers with bright edges
        add(fr, half(GX + 0.01, yG1 - yG0 + 0.06, 0.01, (GX + 0.01) / 2, (yG0 + yG1) / 2 + 0.01), M.linerB, 0, 0, ZF + 0.035, 0, 0, 0, false);
        const bars = [];
        for (const [y0, y1, nH] of [[yG0, yB0, 2], [yB1, yG1, 3]]) {
          for (let j = 1; j <= nH; j++) bars.push(half(GX, 0.005, 0.03, GX / 2, y0 + (y1 - y0) * j / (nH + 1)));
          for (let x = 0.021; x < GX; x += 0.042) bars.push(half(0.006, y1 - y0, 0.03, x, (y0 + y1) / 2));
        }
        add(fr, mergeGeos(bars), M.grB, 0, 0, ZF + 0.015, 0, 0, 0, false);
        add(fr, half(GX + 0.012, 0.008, 0.014, (GX + 0.012) / 2, yG1 + 0.004), M.chrome, 0, 0, ZF + 0.002, 0, 0, 0, false);
        add(fr, half(0.008, yG1 - yG0, 0.014, GX + 0.004, (yG0 + yG1) / 2), M.chrome, 0, 0, ZF + 0.002, 0, 0, 0, false);
        add(fr, half(GX, yB1 - yB0, 0.04, GX / 2, (yB0 + yB1) / 2), M.paint, 0, 0, ZF + 0.004);
        for (const y of [yB0, yB1]) add(fr, half(GX, 0.004, 0.008, GX / 2, y), M.chrome, 0, 0, ZF - 0.014, 0, 0, 0, false);
        // the fender's end with the two lamps sunk in it: a deep chrome bezel, the bright bowl of the reflector with the
        // bulb, a clear lens
        const xi = GX + 0.008, xo = 0.872, sh = new THREE.Shape();
        sh.moveTo(sx * xi, yG0); sh.lineTo(sx * xo, yG0);
        for (let k = 0; k <= 12; k++) { const x = xo - (xo - xi) * k / 12; sh.lineTo(sx * x, yTopF(x) - 0.03); }
        sh.closePath();
        for (const lx of LX) sh.holes.push(new THREE.Path().absarc(sx * lx, yL, 0.075, 0, Math.PI * 2, false));
        add(fr, new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 28 }), M.paint, 0, 0, ZF - 0.008);
        for (const lx of LX) {
          const hx = sx * lx;
          add(fr, cylZ(0.0745, 0.0745, 0.04, 28, true), M.chromeD, hx, yL, ZF + 0.012, 0, 0, 0, false);
          add(fr, new THREE.TorusGeometry(0.081, 0.0095, 10, 36), M.chrome, hx, yL, ZF - 0.012, 0, 0, 0, false);
          add(fr, latheGeo([[0.004, 0.035], [0.03, 0.031], [0.055, 0.02], [0.074, 0]]).rotateX(Math.PI / 2), M.chromeD, hx, yL, ZF + 0.006, 0, 0, 0, false);
          add(fr, new THREE.SphereGeometry(0.016, 12, 8), M.head, hx, yL, ZF + 0.03, 0, 0, 0, false);
          add(fr, new THREE.SphereGeometry(0.074, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.22, 1).rotateX(-Math.PI / 2), M.lensT, hx, yL, ZF + 0.006, 0, 0, 0, false);
        }
      }
      spots(0.68, yL, ZF);
      // the bumper: a chrome blade round the front and its corners and back along the sides - its top rolled, its face down
      // to a step, the lower face sloping back under; the parking lamps in that lower face
      { const zb = ZF + 0.005, R0 = 0.16, xc = 0.775, zc = zb + R0, path = [], yT = 0.598;
        for (let z = zb + 0.33; z > zc + 1e-6; z -= 0.04) path.push([-(xc + R0), z]);
        for (let k = 0; k <= 8; k++) { const a = Math.PI - k / 8 * Math.PI / 2; path.push([-xc + R0 * Math.cos(a), zc - R0 * Math.sin(a)]); }
        for (let k = -30; k <= 30; k++) path.push([k * 0.025, zb]);
        for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 - k / 8 * Math.PI / 2; path.push([xc + R0 * Math.cos(a), zc - R0 * Math.sin(a)]); }
        for (let z = zc + 0.04; z < zb + 0.33 + 1e-6; z += 0.04) path.push([xc + R0, z]);
        add(fr, sweep(path, (x, nz) => {
          const s = 0.62 + 0.38 * Math.abs(nz);
          return [[-0.03, yT - 0.014], [0, yT], [0.028 * s, yT + 0.003], [0.048 * s, yT - 0.004], [0.062 * s, yT - 0.02], [0.068 * s, yT - 0.045], [0.067 * s, yT - 0.082],
            [0.06 * s, yT - 0.097], [0.046 * s, yT - 0.108], [0.03 * s, yT - 0.132], [0.014 * s, yT - 0.148], [-0.03, yT - 0.152]];
        }, 3), M.chromeD, 0, 0, 0);
        for (const sx of [-1, 1]) add(fr, rbox(0.15, 0.026, 0.012, 0.005), M.amber, sx * 0.63, yT - 0.12, zb - 0.04, -0.75, 0, 0, false);
        // (the valance behind and under it, black; the plate on its bracket under the bumper's middle)
        for (const sx of [-1, 1]) add(frP, new THREE.BoxGeometry(0.84, 0.15, 0.03).translate(sx * 0.42, 0.385, 0), M.black, 0, 0, ZF + 0.03, 0, 0, 0, false);
        add(body, rbox(0.33, 0.17, 0.012, 0.006), M.black, 0, 0.335, ZF - 0.024 + dZ(0));
        add(body, rbox(0.3, 0.15, 0.01, 0.006), M.white, 0, 0.335, ZF - 0.031 + dZ(0)); }
      // (bend it all to the nose's V: each part's vertices moved back by dZ(x) - and the grille, the lip, the bumper down by
      // eV(x) - their normals sheared to match)
      const bend = (grp, dip) => {
        for (const m of grp.children) {
          m.updateMatrix(); const gg = m.geometry; gg.applyMatrix4(m.matrix); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrix();
          const p = gg.attributes.position, nn = gg.attributes.normal;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), s = Math.sign(x), k = s * kV, e = dip && Math.abs(x) < 0.5 ? s * 0.09 : 0;
            p.setZ(i, p.getZ(i) + dZ(x)); if (dip) p.setY(i, p.getY(i) - eV(x));
            if (nn) { const nx = nn.getX(i) - e * nn.getY(i) - k * nn.getZ(i), ny = nn.getY(i), nz = nn.getZ(i), l = Math.hypot(nx, ny, nz) || 1; nn.setXYZ(i, nx / l, ny / l, nz / l); }
          }
          gg.computeBoundingSphere();
        }
      };
      bend(fr, true); bend(frP, false);
      for (const sx of [-1, 1]) {
        add(body, rbox(0.012, 0.035, 0.12, 0.006), M.amber, sx * (Wz(-1.97) + 0.004), 0.52, -1.97, 0, 0, 0, false);    // side markers
        add(body, rbox(0.012, 0.035, 0.1, 0.006), M.tail, sx * (Wz(2.42) + 0.004), 0.56, 2.42, 0, 0, 0, false);
      }
      // ---- the hood: the cowl-induction flap at the bulge's back, the shut lines; the wipers
      add(body, rbox(0.7, 0.04, 0.05, 0.01), M.black, 0, yH(ZW - 0.07) + 0.04, ZW - 0.07, 0.25, 0, 0);
      for (const sx of [-1, 1]) {
        seamAlong(sx, Array.from({ length: 9 }, (_, i) => [-2.36 + i * (ZW - 0.02 + 2.36) / 8, 12.6]));
        tubeAB(body, V3(sx * 0.06, yRoof(ZW + 0.05) + 0.01, ZW + 0.05), V3(sx * 0.6, yRoof(ZW + 0.08) + 0.01, ZW + 0.08), 0.008, M.black, 6);
      }
      seamAlong(1, [[ZW - 0.02, 12.9], [ZW - 0.02, 16], [ZW - 0.02, 19]]); seamAlong(-1, [[ZW - 0.02, 12.9], [ZW - 0.02, 16], [ZW - 0.02, 19]]);
      // ---- the sides: the door's shut lines, its handle, the bright trim round the glass and up the A-pillars, the
      // driver's mirror; the trunk lid's shut lines
      for (const sx of [-1, 1]) {
        for (const z of [-0.56, 0.72]) seamAlong(sx, [[z, 4.3], [z, 6.5], [z, 9.5], [z, 12.3]]);
        seamAlong(sx, [[-0.56, 4.3], [0.1, 4.3], [0.72, 4.3]]);
        { const p = surf0(0.6, 10.6, sx); add(body, rbox(0.024, 0.026, 0.13, 0.01), M.chrome, p.x + sx * 0.012, p.y - 0.02, 0.6); }
        // (the glass's bright surround: along the belt, up the A-pillar and over along the roof's edge, down behind the
        // quarter window, the post between the two)
        seamAlong(sx, Array.from({ length: 14 }, (_, i) => { const z = ZW + 0.04 + i * (ZB0 - 0.06 - ZW) / 13; return [z, 13.02]; }), 0.006, M.chrome);
        seamAlong(sx, Array.from({ length: 16 }, (_, i) => { const z = ZW + 0.03 + i * (ZB0 - 0.05 - ZW) / 15; return [z, 15.95]; }), 0.006, M.chrome);
        seamAlong(sx, [[0.63, 13.05], [0.63, 14.5], [0.63, 15.9]], 0.007, M.chrome);
        seamAlong(sx, [[ZB0 - 0.04, 13.05], [ZB0 - 0.05, 15.0], [ZB0 - 0.08, 15.9]], 0.006, M.chrome);
        seamAlong(sx, Array.from({ length: 8 }, (_, i) => [ZB1 + 0.02 + i * (2.57 - ZB1 - 0.02) / 7, 17.6]));
      }
      { const mz = -0.48, by = ySh(mz) + 0.06, mx = -(Wz(mz) - 0.05);
        tubeAB(body, V3(mx, by - 0.03, mz), V3(mx - 0.06, by + 0.03, mz + 0.01), 0.01, M.chrome);
        const mh = new THREE.Group(); mh.position.set(mx - 0.08, by + 0.05, mz + 0.02); mh.rotation.y = 0.12; body.add(mh);
        add(mh, new THREE.SphereGeometry(0.06, 18, 12).scale(1.2, 0.85, 0.6), M.chrome, 0, 0, 0);
        add(mh, new THREE.CircleGeometry(0.058, 20).scale(1.18, 0.82, 1), M.glass, 0, 0, 0.037, 0, 0, 0, false); }
      // ---- the tail: the bumper with the tail lamps in it, the trunk's lock, the plate, the valance and the exhaust tips
      { const bp = new THREE.Shape(), zf = ZT + 0.07, zc = ZT - 0.14, zb = zR + 0.5, bx = 0.935, bi = bx - 0.05;
        bp.moveTo(-0.7, -zf); bp.lineTo(0.7, -zf); bp.quadraticCurveTo(bx, -zf, bx, -zc); bp.lineTo(bx, -zb); bp.lineTo(bi, -zb); bp.lineTo(bi, -(ZT - 0.03));
        bp.lineTo(-bi, -(ZT - 0.03)); bp.lineTo(-bi, -zb); bp.lineTo(-bx, -zb); bp.lineTo(-bx, -zc); bp.quadraticCurveTo(-bx, -zf, -0.7, -zf); bp.closePath();
        const bg = new THREE.ExtrudeGeometry(bp, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.022, bevelSegments: 7, curveSegments: 12 });
        bg.rotateX(-Math.PI / 2); add(body, bg, M.chrome, 0, 0.475, 0); }
      for (const sx of [-1, 1]) {
        add(body, rbox(0.4, 0.08, 0.012, 0.006), M.black, sx * 0.55, 0.53, ZT + 0.097);
        add(body, rbox(0.3, 0.06, 0.012, 0.008), M.tail, sx * 0.58, 0.53, ZT + 0.104, 0, 0, 0, false);
        add(body, rbox(0.08, 0.06, 0.012, 0.008), M.lampLens, sx * 0.39, 0.53, ZT + 0.104, 0, 0, 0, false);
        add(body, cylZ(0.04, 0.04, 0.12, 16, true), M.chrome, sx * 0.55, 0.3, ZT - 0.02); P.tips.push(toRoot(V3(sx * 0.55, 0.3, ZT + 0.05)));
      }
      add(body, rbox(0.33, 0.17, 0.012, 0.006), M.black, 0, 0.52, ZT + 0.097);
      add(body, rbox(0.3, 0.15, 0.01, 0.006), M.white, 0, 0.52, ZT + 0.104);
      add(body, rbox(0.05, 0.05, 0.01, 0.02), M.chrome, 0, 0.86, ZT + 0.004);
      add(body, rbox(1.62, 0.08, 0.05, 0.02), M.black, 0, 0.34, ZT - 0.05);
      // ---- inside: red - the buckets and the rear bench, the door panels, the console with its shifter; a black dash
      // with its round gauges and the wheel
      add(body, rbox(1.66, 0.04, 2.0, 0.01), M.redIn, 0, 0.3, 0.3);
      for (const sx of [-1, 1]) add(body, new THREE.PlaneGeometry(1.4, 0.45), M.redIn, sx * 0.84, 0.7, 0.05, 0, sx * Math.PI / 2, 0, false);
      add(body, rbox(1.66, 0.22, 0.4, 0.06), M.black, 0, 0.83, -0.66);
      add(body, rbox(0.5, 0.12, 0.08, 0.03), M.black, -0.4, 0.88, -0.48);
      for (const dx of [-0.13, 0.0, 0.13]) { add(body, new THREE.TorusGeometry(0.045, 0.006, 6, 20), M.chrome, -0.4 + dx, 0.89, -0.437, 0, 0, 0, false); add(body, new THREE.CircleGeometry(0.042, 20), M.black, -0.4 + dx, 0.89, -0.438, 0, 0, 0, false); }
      add(body, rbox(0.22, 0.2, 0.7, 0.04), M.black, 0, 0.42, -0.05);
      tubeAB(body, V3(0, 0.52, 0.0), V3(0, 0.62, 0.04), 0.012, M.chrome); add(body, new THREE.SphereGeometry(0.022, 12, 8), M.black, 0, 0.63, 0.045);
      for (const sx of [-1, 1]) {
        add(body, rbox(0.5, 0.12, 0.5, 0.05), M.redIn, sx * 0.42, 0.4, 0.02);
        add(body, rbox(0.5, 0.62, 0.12, 0.05), M.redIn, sx * 0.42, 0.74, 0.3, 0.3, 0, 0);
      }
      add(body, rbox(1.4, 0.12, 0.5, 0.05), M.redIn, 0, 0.47, 0.88);
      add(body, rbox(1.4, 0.5, 0.12, 0.05), M.redIn, 0, 0.75, 1.1, 0.3, 0, 0);
      SW = steering(V3(-0.4, 0.92, -0.38), 0.45, 0.2);
      tubeAB(body, V3(-0.4, 0.92, -0.39), V3(-0.4, 0.83, -0.6), 0.03, M.black, 10);
      driver = person({ hip: V3(-0.42, 0.48, 0.06), lean: 0.32, hands: [V3(-0.58, 0.93, -0.36), V3(-0.22, 0.93, -0.36)],
        knee: { dx: 0.08, y: 0.62, z: -0.45 }, foot: { dx: 0.1, y: 0.32, z: -0.85 }, helmet: false });
      P.hideCockpit.push(driver);
    };

    (B[CAR] || B.couch)();
    model.add(driver);
    const eye = driver.userData.eye;

    // ---------------------------------------------------------------- the display on the dash
    if (cluster) add(cluster.parent, new THREE.PlaneGeometry(cluster.w, cluster.h), M_cluster, cluster.pos.x, cluster.pos.y, cluster.pos.z + 0.002, cluster.rot, 0, 0, false);
    const EV = CAR === 'golf' ? ENGINE !== 'busa' && ENGINE !== 'jet' && ENGINE !== 'mega' : CAR === 'cyber' || (opts.engine || 'ev') === 'ev' && (CAR === 'mini' || CAR === 'scooter' || CAR === 'razor');
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
      if (kind === 'hwy') {
        // a highway truck tyre: five ribs round the tread between its grooves, the shoulders notched
        for (const f of [-0.8, -0.4, 0, 0.4, 0.8]) { const t = new THREE.TorusGeometry(c - 0.002, 0.0055, 4, 72); t.rotateY(Math.PI / 2); t.translate(f * h, 0, 0); list.push(t); }
        const N = Math.round(2 * Math.PI * c / 0.05);
        for (let k = 0; k < N; k++) for (const sx of [-1, 1]) { const b = new THREE.BoxGeometry(W * 0.12, 0.008, 0.025); b.translate(sx * h * 0.93, c - 0.004, 0); b.rotateX(k * 2 * Math.PI / N); list.push(b); }
        return mergeGeos(list);
      }
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
      const mud = kind === 'mud', at = kind === 'at', depth = mud ? 0.02 : at ? 0.017 : 0.012, rc = R - depth, h = W / 2, list = [];
      const box = (w, ht, l, x, r, ang, tilt) => { const b = new THREE.BoxGeometry(w, ht, l); if (tilt) b.rotateZ(tilt); b.translate(x, r, 0); b.rotateX(ang); list.push(b); };
      const pitch = mud ? 0.062 : at ? 0.052 : 0.042, N = Math.round(2 * Math.PI * R / pitch), bl = pitch * (mud ? 0.55 : at ? 0.62 : 0.6);
      for (let k = 0; k < N; k++) {
        const a = k * 2 * Math.PI / N, odd = k & 1;
        if (at) {
          // all-terrain (the Rebel's): three blocks across and two, staggered, big shoulder blocks, lugs down the sidewalls
          for (const f of odd ? [-0.64, 0, 0.64] : [-0.34, 0.34]) box(W * (odd ? 0.24 : 0.28), depth + 0.004, bl, f * h, rc + depth / 2 - 0.002, a);
          for (const sx of [-1, 1]) { const lg = (k + (sx > 0 ? 1 : 0)) & 1; box(0.012, 0.022 + 0.012 * lg, bl * 0.8, sx * (h - 0.003), rc - 0.009 - 0.006 * lg, a); }
        } else if (mud) {
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
      if (style === 'disc' || style === 'discAlu') {
        // a flat white disc, domed a little, with a small hubcap (the Silver Bullet's: polished aluminium, a dark ring
        // round its hub)
        const dm = style === 'disc' ? mat : M.discAlu || (M.discAlu = new THREE.MeshStandardMaterial({ color: 0xd6d8d8, roughness: 0.22, metalness: 0.9, side: THREE.DoubleSide }));
        add(g, latheX([[0.001, fx + 0.03], [rimR * 0.4, fx + 0.025], [rimR * 0.95, fx + 0.004], [rimR, fx]], 36), dm, 0, 0, 0);
        add(g, cylX(0.05, 0.06, 0.04, 20), M.chrome, fx + 0.04, 0, 0);
        if (style === 'discAlu') add(g, new THREE.TorusGeometry(0.075, 0.008, 8, 28), M.black, fx + 0.03, 0, 0, 0, Math.PI / 2, 0);
        return;
      }
      if (style === 'rod') {
        // a polished drag wheel: a dished face with a ring of ten round holes, the lip and the centre polished
        const m = M.polish || (M.polish = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.08, metalness: 1 }));
        const face = new THREE.Shape(); face.absarc(0, 0, rimR * 0.95, 0, Math.PI * 2, false);
        for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5, hole = new THREE.Path(); hole.absellipse(Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, rimR * 0.2, rimR * 0.13, 0, Math.PI * 2, true, a); face.holes.push(hole); }
        const fg = new THREE.ExtrudeGeometry(face, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 18 });
        fg.rotateY(Math.PI / 2); add(g, fg, m, fx - 0.05, 0, 0);
        add(g, latheX([[rimR, fx + 0.004], [rimR * 0.97, fx - 0.015], [rimR * 0.94, fx - 0.04]], 44), M.chromeD || (M.chromeD = Object.assign(M.chrome.clone(), { side: THREE.DoubleSide })), 0, 0, 0);
        add(g, new THREE.TorusGeometry(rimR * 0.985, 0.012, 8, 44), m, fx + 0.004, 0, 0, 0, Math.PI / 2, 0);
        add(g, cylX(rimR * 0.92, rimR * 0.92, 0.01, 36), M.black, fx - 0.09, 0, 0);
        add(g, latheX([[rimR * 0.3, fx - 0.04], [rimR * 0.24, fx - 0.01], [rimR * 0.12, fx + 0.005], [0.001, fx + 0.01]], 24), m, 0, 0, 0);
        return;
      }
      if (style === 'chev') {
        // polished five-spokes: the spokes and the lip bright, dark between them, a centre cap on five lugs
        const m = M.chevRim || (M.chevRim = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.12, metalness: 1 }));
        const face = new THREE.Shape(); face.absarc(0, 0, rimR * 0.94, 0, Math.PI * 2, false);
        for (let j = 0; j < 5; j++) {
          const c = j * 2 * Math.PI / 5 + Math.PI / 5, hole = new THREE.Path();
          hole.absarc(0, 0, rimR * 0.82, c - 0.42, c + 0.42, false); hole.absarc(0, 0, rimR * 0.36, c + 0.24, c - 0.24, true); hole.closePath(); face.holes.push(hole);
        }
        const fg = new THREE.ExtrudeGeometry(face, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 3, curveSegments: 20 });
        fg.rotateY(Math.PI / 2);
        add(g, fg, m, fx - 0.04, 0, 0);
        add(g, latheX([[rimR, fx + 0.005], [rimR * 0.97, fx - 0.012], [rimR * 0.93, fx - 0.03]], 44), M.chromeD || (M.chromeD = Object.assign(M.chrome.clone(), { side: THREE.DoubleSide })), 0, 0, 0);
        add(g, new THREE.TorusGeometry(rimR * 0.985, 0.011, 8, 44), m, fx + 0.004, 0, 0, 0, Math.PI / 2, 0);
        add(g, cylX(rimR * 0.92, rimR * 0.92, 0.01, 36), new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.5, metalness: 0.4 }), fx - 0.07, 0, 0);
        add(g, cylX(rimR * 0.2, rimR * 0.22, 0.03, 24), m, fx - 0.012, 0, 0);
        for (let j = 0; j < 5; j++) { const a = j * 2 * Math.PI / 5; add(g, cylX(0.009, 0.009, 0.022, 8), M.chrome, fx + 0.006, Math.cos(a) * rimR * 0.14, Math.sin(a) * rimR * 0.14); }
        add(g, cylX(0.028, 0.028, 0.012, 16), M.black, fx + 0.01, 0, 0);
        return;
      }
      if (style === 'prius') {
        // the XW20's 15 in alloy: ten slim spokes in pairs from a small centre out to the lip, silver, dark behind
        const m = M.priusRim || (M.priusRim = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.25, metalness: 0.85 }));
        const face = new THREE.Shape(); face.absarc(0, 0, rimR * 0.96, 0, Math.PI * 2, false);
        for (let j = 0; j < 5; j++) {
          const c = j * 2 * Math.PI / 5 + Math.PI / 5, hole = new THREE.Path();
          hole.absarc(0, 0, rimR * 0.85, c - 0.42, c + 0.42, false); hole.absarc(0, 0, rimR * 0.38, c + 0.3, c - 0.3, true); hole.closePath(); face.holes.push(hole);
          const c2 = j * 2 * Math.PI / 5, sl = new THREE.Path();
          sl.absarc(0, 0, rimR * 0.8, c2 - 0.045, c2 + 0.045, false); sl.absarc(0, 0, rimR * 0.46, c2 + 0.06, c2 - 0.06, true); sl.closePath(); face.holes.push(sl);
        }
        const fg = new THREE.ExtrudeGeometry(face, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 20 });
        fg.rotateY(Math.PI / 2);
        add(g, fg, m, fx - 0.03, 0, 0);
        add(g, new THREE.TorusGeometry(rimR * 0.975, 0.01, 8, 44), m, fx - 0.012, 0, 0, 0, Math.PI / 2, 0);
        add(g, cylX(rimR * 0.96, rimR * 0.96, 0.01, 36), M.black, fx - 0.1, 0, 0);
        add(g, cylX(rimR * 0.2, rimR * 0.21, 0.025, 24), m, fx - 0.008, 0, 0);
        for (let j = 0; j < 5; j++) { const a = j * 2 * Math.PI / 5 + Math.PI / 5; add(g, cylX(0.008, 0.008, 0.02, 8), M.chrome, fx + 0.008, Math.cos(a) * rimR * 0.3, Math.sin(a) * rimR * 0.3); }
        add(g, cylX(0.026, 0.026, 0.01, 16), M.black, fx + 0.01, 0, 0);
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
      if (style === 'cyber') {
        // the Cybertruck's 20 in wheel: a flat dark face cut into six wide spokes, a black centre, dark behind the windows
        const m = M.cyberRim || (M.cyberRim = new THREE.MeshStandardMaterial({ color: 0x2e3033, roughness: 0.42, metalness: 0.55 }));
        const face = new THREE.Shape(); face.absarc(0, 0, rimR * 0.97, 0, Math.PI * 2, false);
        for (let j = 0; j < 6; j++) {
          const c = j * Math.PI / 3 + Math.PI / 6, hole = new THREE.Path();
          hole.absarc(0, 0, rimR * 0.84, c - 0.3, c + 0.3, false); hole.absarc(0, 0, rimR * 0.42, c + 0.17, c - 0.17, true); hole.closePath();
          face.holes.push(hole);
        }
        const fg = new THREE.ExtrudeGeometry(face, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 20 });
        fg.rotateY(Math.PI / 2);
        add(g, fg, m, fx - 0.035, 0, 0);
        add(g, new THREE.TorusGeometry(rimR * 0.975, 0.012, 8, 44), m, fx - 0.012, 0, 0, 0, Math.PI / 2, 0);
        add(g, cylX(rimR * 0.96, rimR * 0.96, 0.01, 36), M.black, fx - 0.13, 0, 0);
        add(g, cylX(rimR * 0.2, rimR * 0.21, 0.03, 20), M.black, fx - 0.008, 0, 0);
        return;
      }
      if (style === 'dualF' || style === 'dualR') {
        // polished 16 in 8-lug dually wheels. Front: the face dished out to a big domed hub (the hub pilot sticks out past
        // the tyre) with eight hand holes round it; rear outer: the face set deep inside a polished cone, the lugs at its
        // bottom. (the rear inner wheel: a plain face, only its edge shows)
        const pol = M.polish || (M.polish = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.08, metalness: 1 }));
        const front = style === 'dualF', fz = front ? fx + 0.02 : fx - 0.12;
        const face = new THREE.Shape(); face.absarc(0, 0, rimR * 0.82, 0, Math.PI * 2, false);
        for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4 + Math.PI / 8, hole = new THREE.Path(); hole.absellipse(Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, 0.026, 0.017, 0, Math.PI * 2, false, a); face.holes.push(hole); }
        const fg = new THREE.ExtrudeGeometry(face, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 18 });
        fg.rotateY(Math.PI / 2); add(g, fg, pol, fz - 0.004, 0, 0);
        add(g, cylX(rimR * 0.82, rimR * 0.82, 0.008, 32), M.black, fz - 0.03, 0, 0);
        if (front) {
          // the cone from the lip out to the face, the domed hub pilot with its lugs
          add(g, latheX([[rimR, fx - 0.005], [rimR * 0.97, fx + 0.004], [rimR * 0.84, fz]], 40), M.chromeD || (M.chromeD = Object.assign(M.chrome.clone(), { side: THREE.DoubleSide })), 0, 0, 0);
          add(g, latheX([[rimR * 0.38, fz], [rimR * 0.36, fz + 0.04], [rimR * 0.3, fz + 0.075], [rimR * 0.18, fz + 0.095], [0.001, fz + 0.1]], 32), pol, 0, 0, 0);
          for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; add(g, cylX(0.011, 0.011, 0.03, 6), M.chrome, fz + 0.015, Math.cos(a) * rimR * 0.46, Math.sin(a) * rimR * 0.46); }
        } else {
          add(g, latheX([[rimR, fx + 0.002], [rimR * 0.96, fx - 0.03], [rimR * 0.84, fz]], 40), M.chromeD || (M.chromeD = Object.assign(M.chrome.clone(), { side: THREE.DoubleSide })), 0, 0, 0);
          add(g, cylX(rimR * 0.3, rimR * 0.32, 0.03, 24), pol, fz + 0.012, 0, 0);
          for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; add(g, cylX(0.011, 0.011, 0.03, 6), M.chrome, fz + 0.012, Math.cos(a) * rimR * 0.42, Math.sin(a) * rimR * 0.42); }
        }
        add(g, new THREE.TorusGeometry(rimR * 0.99, 0.011, 8, 44), pol, fx - 0.004, 0, 0, 0, Math.PI / 2, 0);
        return;
      }
      if (style === 'ram') {
        // the Rebel's 18 in: six wide spokes, each split down its middle, satin black; a black cap on six lugs
        const m = M.ramRim || (M.ramRim = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.38, metalness: 0.5 }));
        const face = new THREE.Shape(); face.absarc(0, 0, rimR * 0.96, 0, Math.PI * 2, false);
        for (let j = 0; j < 6; j++) {
          const c = j * Math.PI / 3 + Math.PI / 6, hole = new THREE.Path();
          hole.absarc(0, 0, rimR * 0.86, c - 0.36, c + 0.36, false); hole.absarc(0, 0, rimR * 0.42, c + 0.2, c - 0.2, true); hole.closePath(); face.holes.push(hole);
          const sa = j * Math.PI / 3, sl = new THREE.Path();
          sl.absarc(0, 0, rimR * 0.82, sa - 0.035, sa + 0.035, false); sl.absarc(0, 0, rimR * 0.5, sa + 0.05, sa - 0.05, true); sl.closePath(); face.holes.push(sl);
        }
        const fg = new THREE.ExtrudeGeometry(face, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 2, curveSegments: 20 });
        fg.rotateY(Math.PI / 2);
        add(g, fg, m, fx - 0.035, 0, 0);
        add(g, new THREE.TorusGeometry(rimR * 0.975, 0.012, 8, 44), m, fx - 0.012, 0, 0, 0, Math.PI / 2, 0);
        add(g, cylX(rimR * 0.96, rimR * 0.96, 0.01, 36), M.black, fx - 0.13, 0, 0);
        add(g, cylX(rimR * 0.22, rimR * 0.23, 0.03, 24), m, fx - 0.008, 0, 0);
        for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3 + Math.PI / 6; add(g, cylX(0.009, 0.009, 0.022, 8), M.chrome, fx + 0.012, Math.cos(a) * rimR * 0.15, Math.sin(a) * rimR * 0.15); }
        add(g, cylX(0.03, 0.03, 0.012, 16), M.black, fx + 0.014, 0, 0);
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
      const st = wheelStyle.tread === 'gravel' || wheelStyle.tread === 'at' ? blockTread(R, W, rimR, wheelStyle.tread) : { carc: carcass(R, W, rimR), tr: tread(R, W, wheelStyle.tread) };
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
      rim(spin, G.R, G.W, G.rimR, CAR === 'diesel' && !frontW ? 'dualR' : wheelStyle.rim);
      if (frontW) add(flip, cylX(0.02, 0.02, 0.08, 8), M.steel, -G.W / 2 - 0.03, 0, 0);
      if (CAR === 'rally') {
        add(spin, cylX(0.15, 0.15, 0.026, 36), M.steel, -0.03, 0, 0);
        add(spin, cylX(0.075, 0.075, 0.03, 20), M.black, -0.03, 0, 0);
        const ph = left ? Math.PI - 0.8 : 0.8, cal = add(flip, rbox(0.055, 0.13, 0.08, 0.018), M.caliper || (M.caliper = new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.4 })), -0.012, 0.12 * Math.sin(ph), 0.12 * Math.cos(ph));
        cal.rotation.x = -ph;
      }
      if (CAR === 'chevelle') {
        // (redline radials: a thin red ring round the outer sidewall)
        const rl = new THREE.TorusGeometry(G.R - 0.055, 0.0045, 4, 48); rl.rotateY(Math.PI / 2);
        stock.push(add(spin, rl, M.redline || (M.redline = new THREE.MeshStandardMaterial({ color: 0xb01018, roughness: 0.6 })), G.W / 2 + 0.001, 0, 0, 0, 0, 0, false));
      }
      if (CAR === 'gtr' || CAR === 'sixseven') {
        // the big brakes behind the spokes: a drilled-look disc turning with the wheel, the caliper fixed at its trailing top
        add(spin, cylX(0.19, 0.19, 0.03, 40), M.steel, -0.02, 0, 0);
        add(spin, cylX(0.1, 0.1, 0.034, 24), M.black, -0.02, 0, 0);
        const ph = left ? Math.PI - 0.8 : 0.8, cal = add(flip, rbox(0.06, 0.17, 0.09, 0.02), M.caliper || (M.caliper = new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.4 })), 0.005, 0.15 * Math.sin(ph), 0.15 * Math.cos(ph));
        cal.rotation.x = -ph;
      }
      wheels.push({ corner, flip, spin, left, front: frontW, side, stock, pkg });
    }
    // the dually: two tyres each end of the rear axle - the physics' wheel is the pair, the outer tyre drawn outboard of its
    // centre with the deep-dished wheel, the inner one inboard (its tyre and a plain wheel)
    if (CAR === 'diesel') for (const w of wheels) if (!w.front) {
      const off = 0.137;
      for (const m of w.spin.children.slice()) m.position.x += off;
      const inner = new THREE.Group(); inner.position.x = -off; w.spin.add(inner);
      for (const m of w.stock.slice()) { const c = add(inner, m.geometry, M.rubber, 0, 0, 0); w.stock.push(c); }
      for (const m of w.pkg.slice()) { const c = add(inner, m.geometry, M.rubber, 0, 0, 0); c.visible = false; w.pkg.push(c); }
      add(inner, cylX(geo[false].rimR, geo[false].rimR, geo[false].W * 0.9, 32, true), M.steel, 0, 0, 0);
      add(inner, cylX(geo[false].rimR * 0.9, geo[false].rimR * 0.9, 0.01, 28), M.steel, 0.02, 0, 0);
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
      M.tint.opacity = cockpit ? 0.14 : CAR === 'cyber' || CAR === 'sixseven' ? 0.9 : CAR === 'prius' ? 0.7 : CAR === 'ram' ? 0.84 : CAR === 'diesel' ? 0.72 : 0.62; M.glass.opacity = cockpit ? 0.1 : CAR === 'ram' || CAR === 'diesel' ? 0.55 : 0.32;
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
      exhaustTips: P.tips, sootTips: P.soot || null, materials: M, headlights: P.spots, tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, setJet, setJetSize, variant: 'cc', cls: CAR,
    };
  }

  root.HCCrushers = { build };
})(typeof self !== 'undefined' ? self : this);
