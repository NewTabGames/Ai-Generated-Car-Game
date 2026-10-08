/* Hellcat Drive — deterministic procedural world (terrain, road network, props).
   Shared by physics (ground queries, colliders) and renderer (meshes, instancing).
   UMD: window.HCWorld in the browser, module.exports in Node. */
(function (root) {
  'use strict';

  const SEED = 20151;

  // ---------------------------------------------------------------- hashing / PRNG
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashInt(a, b, c) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul((c | 0) + 0x1b873593, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function hash01(a, b, c) { return hashInt(a, b, c) / 4294967296; }

  // ---------------------------------------------------------------- simplex noise 2D
  const GX = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]);
  const GY = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function makeSimplex(seed) {
    const rnd = mulberry32(seed >>> 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
    return function (xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { const g = pm12[ii + perm[jj]]; t0 *= t0; n += t0 * t0 * (GX[g] * x0 + GY[g] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { const g = pm12[ii + i1 + perm[jj + j1]]; t1 *= t1; n += t1 * t1 * (GX[g] * x1 + GY[g] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { const g = pm12[ii + 1 + perm[jj + 1]]; t2 *= t2; n += t2 * t2 * (GX[g] * x2 + GY[g] * y2); }
      return 70 * n;
    };
  }

  const nLow1 = makeSimplex(SEED + 1), nLow2 = makeSimplex(SEED + 2);
  const nHill = makeSimplex(SEED + 3), nDet = makeSimplex(SEED + 4);
  const nRegion = makeSimplex(SEED + 5), nRidge = makeSimplex(SEED + 6);
  const nLake = makeSimplex(SEED + 7), nForest = makeSimplex(SEED + 8);
  const nForest2 = makeSimplex(SEED + 9), nKind = makeSimplex(SEED + 10);

  function smooth(e0, e1, x) {
    let t = (x - e0) / (e1 - e0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  // ---------------------------------------------------------------- world constants
  const C = {
    ROAD_SPACING: 1400,
    LANE_W: 3.6,
    ROAD_HALF: 4.7,        // paved half width (2 lanes + paved shoulder)
    SHOULDER: 6.6,         // gravel shoulder outer edge
    FLAT: 7.5,             // terrain equals road grade out to here
    WATER_LEVEL: -30,
    GRID: 2,               // LOD0 terrain grid spacing (physics matches this mesh)
    CHUNK: 256,
    TREE_LINE: 150,
  };
  const S = C.ROAD_SPACING;

  // map: 'country' (endless winding road network) or 'straight' (flat, one dead-straight road along -Z, drag markers)
  let MAP = 'country';
  // 'straight', 'drag' and 'dirtdrag' share the single dead-straight road along -Z; 'drag' is a prepped two-lane strip,
  // 'dirtdrag' the same layout (tree, timing, walls, stands) on groomed dirt
  const DRAGMAP = () => MAP === 'drag' || MAP === 'dirtdrag';
  // the prepped maps ('prepcountry', 'preptarmac'): the Countryside / All Road with every road prepped like a drag strip
  // (VHT on rubbered-in asphalt - surface 5). MAP holds the base map, PREP the prep
  let PREP = false;
  const STRAIGHT = () => MAP === 'straight' || DRAGMAP();
  // drag strip layout (metres): prepped half-width, wall centre, lane centre, lane edge line
  const DRAG = { HALF: 8.3, WALL: 9.0, LANE: 3.1, EDGE: 6.2, SPAWN_Z: 14 };
  // drag strip distances from the start line (z = 0, racing towards -z), metres
  const DRAG_MARKS = [[0, 'START'], [18.288, '60 FT'], [100.584, '330 FT'], [201.168, '1/8 MILE'], [304.8, '1000 FT'], [402.336, '1/4 MILE']];
  // 'tarmac' (All Road): the whole world is pavement - dead flat asphalt to the horizon with a grid of painted 4-lane
  // avenues every AV metres (lanes 3.6 m, edge lines at 7.2 m, avenue paving to 8.4 m), street lights down both sides,
  // and every block between them a different lot (painted by the terrain shader). Physics: asphalt everywhere.
  const TARMAC = { AV: 240, EDGE: 7.2, PAVE: 8.4, LAMP: 48, LAMP_OFF: 9.6, LAMP_REACH: 3.4, SPAWN_X: 1.8, SPAWN_Z: 40 };
  // 'mowtrack' (Mower Track): a lawn mower race track - a mown field, dead flat, with a dirt oval of ~1/5 mile at the
  // centre line: two 80 m straights along z joined by 28 m-radius turns, 12 m wide, run anticlockwise seen from above
  // (left turns: the front straight is x = +R, heading -z). Straw bales line both edges and make the walls, with a gap in
  // the outside of the front straight into the pits; the start / finish line crosses the front straight at z = 0,
  // bleachers stand beyond it. Gentle country rises well back from the field. Physics: dirt on the track, grass off it
  const MOWT = { SL: 40, R: 28, W: 12, BALE: 1.25, PIT: [18, 30], SPAWN_X: 28, SPAWN_Z: 12, STANDS: { x: 47, z0: -26, z1: 26, d: 9 } };
  // 'dunes' (Sand Dunes): an endless sand sea. Transverse dune ridges across a steady wind blowing along +x (UX, UZ):
  // each rises on a long, gentle windward face (up to ~20 deg) to a rounded brink, then drops down its slip face at
  // sand's angle of repose (~30-37 deg) - so heading downwind you climb the gentle side and go over the top. Ridges ~L
  // apart, the windward face K of the way; the crests wander (the field is warped), each ridge swells and dies away
  // along its crest (crescents, gaps, bowls), the dune fields grow and shrink, big slow swells underneath. The start is
  // a flat hardpan of packed sand CAMP_R across (dirt physics; the dunes rise round it by CAMP_E). Sand everywhere else.
  const DUNES = { L: 80, K: 0.68, UX: 0.96, UZ: 0.28, A0: 1.5, A1: 10.5, CAMP_R: 38, CAMP_E: 95, SPAWN_X: -22, SPAWN_Z: 0 };
  function duneSwell(x, z) { return nLow1(x * 0.0011, z * 0.0011) * 14 + nLow2(x * 0.0031 + 5.3, z * 0.0031 - 2.2) * 3.5; }
  function duneHeight(x, z) {
    const D = DUNES;
    const wx = x + nHill(x * 0.0035, z * 0.0035) * 22 + nDet(x * 0.012 + 7.1, z * 0.012 - 2.9) * 3.5;
    const wz = z + nHill(x * 0.0035 + 31.7, z * 0.0035 - 17.3) * 22;
    const q = (wx * D.UX + wz * D.UZ) / D.L, n = Math.floor(q), ph = q - n;
    // (the profile: an S up the windward face to the brink, a steeper S down the slip face; zero at the trough, where
    // one ridge meets the next - so each ridge can have its own height with no step between them)
    const prof = ph < D.K ? 0.5 - 0.5 * Math.cos(Math.PI * ph / D.K) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - D.K) / (1 - D.K));
    const along = -wx * D.UZ + wz * D.UX;
    const field = smooth(-0.4, 0.45, nRegion(x * 0.0016, z * 0.0016));
    const cres = smooth(-0.55, 0.35, nForest2(along * 0.009, n * 1.37 + 0.5));
    const A = D.A0 + D.A1 * Math.pow(field, 0.8) * cres;
    // small dunes riding on the big ones' windward faces
    const q2 = (wx * 0.9 + wz * 0.44) / 23 + nDet(x * 0.02, z * 0.02) * 0.4, p2 = q2 - Math.floor(q2);
    const small = (p2 < 0.72 ? 0.5 - 0.5 * Math.cos(Math.PI * p2 / 0.72) : 0.5 + 0.5 * Math.cos(Math.PI * (p2 - 0.72) / 0.28)) * 0.7 * (1 - 0.6 * prof);
    return duneSwell(x, z) + A * prof + small;
  }
  function duneCampD(x, z) { return Math.hypot(x, z); }
  // signed distance from the track's centre line (- towards the infield)
  function mowtD(x, z) { const zc = z < -MOWT.SL ? -MOWT.SL : z > MOWT.SL ? MOWT.SL : z; return Math.hypot(x, z - zc) - MOWT.R; }
  // the bales: one every ~1.25 m round both edges, each with its heading along the edge
  let mowtBaleList = null;
  function mowtrackBales() {
    if (mowtBaleList) return mowtBaleList;
    const M = MOWT, list = [];
    for (const off of [-M.W / 2 - 0.55, M.W / 2 + 0.55]) {
      const r = M.R + off, Lp = 4 * M.SL + 2 * Math.PI * r, n = Math.round(Lp / M.BALE);
      for (let k = 0; k < n; k++) {
        let t = k * Lp / n, x, z, rot;
        // front straight (x = r, z from +SL to -SL), top turn round (0, -SL), back straight, bottom turn round (0, +SL)
        if (t < 2 * M.SL) { x = r; z = M.SL - t; rot = 0; }
        else if ((t -= 2 * M.SL) < Math.PI * r) { const a = t / r; x = r * Math.cos(a); z = -M.SL - r * Math.sin(a); rot = a; }
        else if ((t -= Math.PI * r) < 2 * M.SL) { x = -r; z = -M.SL + t; rot = Math.PI; }
        else { t -= 2 * M.SL; const a = Math.PI + t / r; x = r * Math.cos(a); z = M.SL - r * Math.sin(a); rot = a; }
        if (off > 0 && x > 0 && z > M.PIT[0] && z < M.PIT[1] && Math.abs(z) <= M.SL) continue;   // the pit gap
        list.push({ x, z, rot });
      }
    }
    mowtBaleList = list;
    return list;
  }

  // ---------------------------------------------------------------- closed-loop tracks: the two rally stages and the windy
  // mower track. Each is a closed centre line through control points (a centripetal Catmull-Rom spline, resampled every
  // 2 m), run in the order of its points; the start / finish line crosses it at the first point (0, 0), heading -z. A grid
  // of 16 m cells lists the segments within 40 m of each, for fast distance queries (terrain, surfaces, trees, the shader's
  // distance texture). Beyond 40 m from the road a query reports d = 1e4
  const trkArc = (cx, cz, R, a0, a1) => { const o = []; for (let k = 0; k <= 4; k++) { const a = (a0 + (a1 - a0) * k / 4) * Math.PI / 180; o.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); } return o; };
  const TRACK_DEFS = {
    // Rally Stage: ~4 km of fast, flowing gravel over rolling hills - long sweepers, crests you get light over, a few
    // tighter corners - through woods, with fields opening up here and there. 7.5 m wide
    rally: { W: 7.5, kind: 'rally', steep: 0, pts: [[0, 0], [0, -150], [-30, -300], [20, -430], [120, -500], [160, -620], [120, -760], [180, -880], [320, -900],
      [420, -820], [470, -700], [600, -660], [720, -720], [800, -640], [780, -500], [680, -420], [700, -300], [820, -240], [860, -100], [780, 0], [640, 20],
      [560, 120], [580, 240], [480, 330], [340, 300], [260, 380], [140, 420], [40, 360], [-20, 240], [20, 130]] },
    // Windy Rally Stage: ~2.4 km of narrow, twisting gravel through dense forest in steeper hills - esses, kinks and four
    // hairpins (~12 m radius). 6.5 m wide
    rallywind: { W: 6.5, kind: 'rally', steep: 1, pts: [[0, 0], [0, -60], [20, -110], [0, -160], [-25, -200], [-10, -250], [20, -275],
      ...trkArc(34, -300, 13, 180, 360), [50, -240], [75, -190], [70, -130], [95, -80], [100, 20],
      ...trkArc(114, 42, 13, 180, 0), [135, -40], [122, -100], [150, -160], [143, -230], [168, -300], [160, -365], [125, -420], [55, -440], [-20, -425],
      [-80, -400], [-150, -392], ...trkArc(-172, -377, 13, 270, 90), ...trkArc(-98, -347, 13, 270, 450),
      [-170, -333], [-200, -300], [-205, -240], [-180, -180], [-210, -120], [-185, -60], [-150, 0], [-110, 50], [-60, 80], [-20, 80], [0, 45]] },
    // Windy Mower Track: a ~750 m twisting dirt road course cut into a mown field, 9 m wide, straw bales both sides
    mowwind: { W: 9, kind: 'mow', steep: 0, pts: [[0, 0], [0, -45], [15, -75], [45, -80], [65, -60], [60, -35], [75, -10], [105, -5], [125, -25], [120, -60],
      [135, -90], [110, -115], [70, -120], [30, -118], [-10, -115], [-35, -95], [-30, -65], [-50, -40], [-45, -10], [-55, 20], [-35, 45], [-10, 40], [0, 20]] },
  };
  const TRK_CELL = 16, TRK_REACH = 40;
  function buildTrack(def) {
    const C = def.pts, n0 = C.length, raw = [];
    for (let i = 0; i < n0; i++) {
      const p0 = C[(i - 1 + n0) % n0], p1 = C[i], p2 = C[(i + 1) % n0], p3 = C[(i + 2) % n0];
      const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-3;
      const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
      const m = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
      for (let k = 0; k < m; k++) {
        const t = t1 + (t2 - t1) * k / m;
        const L = (a, b, ta, tb) => [(a[0] * (tb - t) + b[0] * (t - ta)) / (tb - ta), (a[1] * (tb - t) + b[1] * (t - ta)) / (tb - ta)];
        const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
        raw.push(L(L(A1, A2, 0, t2), L(A2, A3, t1, t3), t1, t2));
      }
    }
    const cum = [0];
    for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const Ltot = cum[raw.length], n = Math.round(Ltot / 2), T = { W: def.W, kind: def.kind, steep: def.steep, n, L: Ltot };
    T.x = new Float64Array(n); T.z = new Float64Array(n); T.s = new Float64Array(n + 1); T.tx = new Float64Array(n); T.tz = new Float64Array(n); T.R = new Float64Array(n);
    for (let k = 0, j = 0; k < n; k++) {
      const t = k * Ltot / n;
      while (cum[j + 1] < t) j++;
      const a = raw[j], b = raw[(j + 1) % raw.length], f = (t - cum[j]) / (cum[j + 1] - cum[j] || 1);
      T.x[k] = a[0] + (b[0] - a[0]) * f; T.z[k] = a[1] + (b[1] - a[1]) * f; T.s[k] = t;
    }
    T.s[n] = Ltot;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n, dx = T.x[b] - T.x[a], dz = T.z[b] - T.z[a], l = Math.hypot(dx, dz) || 1;
      T.tx[k] = dx / l; T.tz[k] = dz / l;
      // signed radius of curvature over an 8 m chord (+ turning left, seen driving along it)
      const p = (k - 4 + n) % n, q = (k + 4) % n, ax = T.x[p], az = T.z[p], bx = T.x[k], bz = T.z[k], cx = T.x[q], cz = T.z[q];
      const cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const R = Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(ax - cx, az - cz) / (2 * Math.abs(cr) + 1e-9);
      T.R[k] = cr > 0 ? -R : R;     // (x right, z down the screen: a positive cross product turns right)
      x0 = Math.min(x0, T.x[k]); x1 = Math.max(x1, T.x[k]); z0 = Math.min(z0, T.z[k]); z1 = Math.max(z1, T.z[k]);
    }
    T.box = [x0, z0, x1, z1]; T.cx = (x0 + x1) / 2; T.cz = (z0 + z1) / 2;
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ia = Math.floor((Math.min(T.x[i], T.x[j]) - TRK_REACH) / TRK_CELL), ib = Math.floor((Math.max(T.x[i], T.x[j]) + TRK_REACH) / TRK_CELL);
      const ja = Math.floor((Math.min(T.z[i], T.z[j]) - TRK_REACH) / TRK_CELL), jb = Math.floor((Math.max(T.z[i], T.z[j]) + TRK_REACH) / TRK_CELL);
      for (let a = ia; a <= ib; a++) for (let b = ja; b <= jb; b++) {
        const key = (a + 32768) * 65536 + (b + 32768);
        let l = cells.get(key); if (!l) cells.set(key, l = []); l.push(i);
      }
    }
    T.grid = new Map();
    for (const [k, l] of cells) T.grid.set(k, Int32Array.from(l));
    // yumps: crests built into the straighter bits of a rally stage - you go light over them, and flat out you fly (~50 mph
    // and up). Only where nothing else of the road is within 60 m (the raised bit needs room for its embankment)
    T.yumps = [];
    if (def.kind === 'rally') {
      const need = def.steep ? 110 : 140, span = def.steep ? 14 : 18, gap = def.steep ? 350 : 520, maxN = def.steep ? 3 : 7;
      for (let k = 0; k < n && T.yumps.length < maxN; k++) {
        const s = T.s[k];
        if (s < 150 || s > Ltot - 150 || (T.yumps.length && s - T.yumps[T.yumps.length - 1].s < gap)) continue;
        let ok = true;
        for (let j = -span; j <= span && ok; j++) if (Math.abs(T.R[(k + j + n) % n]) < need) ok = false;
        for (let m = 0; m < n && ok; m++) { const ds = Math.abs(T.s[m] - s); if (Math.min(ds, Ltot - ds) > 100 && Math.hypot(T.x[m] - T.x[k], T.z[m] - T.z[k]) < 60) ok = false; }
        if (ok) T.yumps.push({ s, A: def.steep ? 0.75 : 0.95 + 0.45 * ((T.yumps.length * 0.37) % 1), hl: def.steep ? 14 : 18 });
      }
    }
    return T;
  }
  let TRK = null;          // the current map's track (setMap)
  const trackCache = {};
  /** Nearest point of the current track's centre line: d (unsigned distance), sd (signed: + to the right, driving it the
   *  right way), s (distance along it from the start line), tx / tz (its direction there), i (segment) */
  function trackQuery(x, z, out) {
    out = out || {};
    const T = TRK;
    out.d = 1e4; out.sd = 1e4; out.s = 0; out.i = -1; out.tx = 0; out.tz = -1;
    if (!T) return out;
    const list = T.grid.get((Math.floor(x / TRK_CELL) + 32768) * 65536 + (Math.floor(z / TRK_CELL) + 32768));
    if (!list) return out;
    let best = 1e18, bi = -1, bt = 0;
    for (let k = 0; k < list.length; k++) {
      const i = list[k], j = i + 1 === T.n ? 0 : i + 1, ax = T.x[i], az = T.z[i], dx = T.x[j] - ax, dz = T.z[j] - az;
      let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t, d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    const i = bi, j = i + 1 === T.n ? 0 : i + 1;
    let tx = T.tx[i] * (1 - bt) + T.tx[j] * bt, tz = T.tz[i] * (1 - bt) + T.tz[j] * bt;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const px = T.x[i] + (T.x[j] - T.x[i]) * bt, pz = T.z[i] + (T.z[j] - T.z[i]) * bt;
    out.d = Math.sqrt(best); out.px = px; out.pz = pz; out.sd = (x - px) * -tz + (z - pz) * tx; out.s = T.s[i] + (T.s[i + 1] - T.s[i]) * bt; out.i = i; out.tx = tx; out.tz = tz;
    return out;
  }
  /** The point s metres along the current track (wrapping), its direction and its centre-line radius */
  function trackPoint(s, out) {
    out = out || {};
    const T = TRK, L = T.L;
    s = ((s % L) + L) % L;
    const f = s / L * T.n, i = Math.floor(f) % T.n, j = (i + 1) % T.n, u = f - Math.floor(f);
    out.x = T.x[i] + (T.x[j] - T.x[i]) * u; out.z = T.z[i] + (T.z[j] - T.z[i]) * u;
    const tx = T.tx[i] * (1 - u) + T.tx[j] * u, tz = T.tz[i] * (1 - u) + T.tz[j] * u, tl = Math.hypot(tx, tz) || 1;
    out.tx = tx / tl; out.tz = tz / tl; out.R = T.R[i]; out.i = i;
    return out;
  }
  // roadside furniture along the current track, placed once: straw bales (both edges of the mower course; the outside
  // of the rally stages' hairpins), chevron boards on the outside of the rally stages' tighter corners, and the start arch
  let trkPropList = null;
  function trackProps() {
    if (trkPropList) return trkPropList;
    const T = TRK, hw = T.W / 2, bales = [], chevrons = [], q = {}, p = {};
    const bale = (s, side, off) => {
      trackPoint(s, p);
      const x = p.x - p.tz * side * off, z = p.z + p.tx * side * off;
      // (the inside of a tight turn folds the offset line back over the road - leave those out)
      if (trackQuery(x, z, q).d < off - 0.35) return;
      bales.push({ x, z, rot: Math.atan2(-p.tz, p.tx) - Math.PI / 2 });      // (the Mower Track's convention: box along rot + 90 deg)
    };
    if (T.kind === 'mow') {
      const nB = Math.round(T.L / 1.25);
      for (let k = 0; k < nB; k++) { const s = k * T.L / nB; for (const side of [-1, 1]) bale(s, side, hw + 0.55); }
    } else {
      // corners: runs of the centre line tighter than 45 m; boards from just before the tightest point, on the outside
      const n = T.n, tight = (k) => Math.abs(T.R[k]) < 45;
      let k0 = 0; while (tight(k0) && k0 < n) k0++;
      for (let c = 0; c < n; c++) {
        const k = (k0 + c) % n;
        if (!tight(k) || tight((k - 1 + n) % n)) continue;
        let e = k, m = k, len = 0;
        while (tight(e) && len < n) { if (Math.abs(T.R[e]) < Math.abs(T.R[m])) m = e; e = (e + 1) % n; len++; }
        const out = T.R[m] > 0 ? 1 : -1;            // turning left -> the outside is on the right
        const sM = T.s[m], nC = Math.abs(T.R[m]) < 20 ? 4 : 3;
        for (let b = 0; b < nC; b++) {
          trackPoint(sM - 14 + b * 9, p);
          const off = hw + 2.4, x = p.x - p.tz * out * off, z = p.z + p.tx * out * off;
          if (trackQuery(x, z, q).d < off - 0.5) continue;
          // (the board faces the traffic coming at it; its arrow points the way the road goes)
          chevrons.push({ x, z, rot: Math.atan2(-p.tx, -p.tz), dir: -out });
        }
        if (Math.abs(T.R[m]) < 18) for (let s = sM - 16; s <= sM + 16; s += 1.3) bale(s, out, hw + 1.5);
      }
    }
    trackPoint(0, p);
    const aw = hw + (T.kind === 'mow' ? 1.3 : 2.2);
    const arch = { x: p.x, z: p.z, tx: p.tx, tz: p.tz, legs: [[p.x - p.tz * aw, p.z + p.tx * aw], [p.x + p.tz * aw, p.z - p.tx * aw]], w: 2 * aw };
    // (the mower course's bleachers: back from the outside of the start straight)
    const stands = T.kind === 'mow' ? { x: 10, z0: -38, z1: 8, d: 9 } : null;
    // an offroad course: marker stakes down both edges every ~16 m (tall whip flags across the dunes, every ~20 m,
    // side to side), and a JUMP sign 45 m before each jump, on the right
    const stakes = [], signs = [];
    if (T.kind === 'offroad') {
      const dun = T.biome === 'dunes', step = dun ? 20 : 16, off = hw + (dun ? 1.8 : 1.1);
      for (let k = 0, s = 20; s < T.L - 12; s += step, k++) {
        for (const side of dun ? [k & 1 ? 1 : -1] : [-1, 1]) {
          trackPoint(s, p);
          const x = p.x - p.tz * side * off, z = p.z + p.tx * side * off;
          if (trackQuery(x, z, q).d < off - 0.4) continue;
          stakes.push({ x, z, side });
        }
      }
      for (const f of T.feats) {
        if (f.kind !== 'jump') continue;
        trackPoint(f.s - 45, p);
        const x = p.x - p.tz * (hw + 2.6), z = p.z + p.tx * (hw + 2.6);
        if (trackQuery(x, z, q).d < hw + 2) continue;
        signs.push({ x, y: terrainHeight(x, z), z, rot: Math.atan2(-p.tx, -p.tz), kind: 2 });
      }
    }
    trkPropList = { bales, chevrons, arch, stands, stakes, signs };
    return trkPropList;
  }
  function trackYump(s) {
    let h = 0;
    for (const y of TRK.yumps) { let ds = Math.abs(s - y.s); ds = Math.min(ds, TRK.L - ds); if (ds < y.hl) h += y.A * 0.5 * (1 + Math.cos(Math.PI * ds / y.hl)); }
    return h;
  }
  /** Where a run starts: on the centre line, 14 m behind the start / finish line, facing down the road */
  function trackSpawn() { const p = trackPoint(-14, {}); return { x: p.x, y: 0, z: p.z, tx: p.tx, tz: p.tz }; }
  // a rally stage's road runs over this smooth, big-scale ground (its grades and crests); the land either side has its
  // own hills and knolls on top, blended in from the verge
  function trackBase(x, z) {
    const st = TRK.steep;
    return nLow1(x * 0.001, z * 0.001) * (12 + 5 * st) + nLow2(x * 0.0042 + 11.3, z * 0.0042 - 7.1) * (2.1 + 0.6 * st)
      + nDet(x * 0.012 + 3.3, z * 0.012 - 9.1) * 0.75;
  }
  // ---------------------------------------------------------------- Offroad Racing: a course generated from a seed
  // A closed loop laid out from the race's settings and a seed: control points round a centre at wandering radii, a
  // smooth centre line through them (scaled to the length asked for) - drawn again while it turns tighter than the
  // setting allows or comes back too close to itself - started on its straightest stretch, heading -z from (0, 0). The
  // ground under it follows the terrain's own, smoothed and with its grades held to what a car can climb (cuttings and
  // fills where it can't), level across, with berms round the outside of the tighter corners; the jumps, whoops, mud
  // holes and sandy washes are built into it; either side it blends back into the land - dunes, forest hills, desert
  // with mesas off in the distance, a low wet bog, or mountainside. The same settings and seed give the same course
  // anywhere (that's what an online room shares, and what a course code is)
  const OFF_BIOMES = {
    //            name, road width (m), smoothing (+/- samples of 2 m), steepest grade, verge blend (m), crests rounded
    //            off (two passes of +/- that many samples)
    dunes: { name: 'Dunes', W: 12, sm: 6, grade: 0.3, verge: 15, round: 6 },
    forest: { name: 'Forest', W: 8, sm: 9, grade: 0.22, verge: 11, round: 9 },
    desert: { name: 'Desert', W: 11, sm: 12, grade: 0.16, verge: 12, round: 9 },
    mud: { name: 'Mud Bog', W: 9, sm: 12, grade: 0.12, verge: 10, round: 9 },
    mountain: { name: 'Mountain', W: 8, sm: 12, grade: 0.2, verge: 16, round: 12 },
  };
  // (the settings, each with its code letter: a course code is terrain-length laps corners width jumps whoops-seed)
  const OFF_OPTS = {
    biome: [['dunes', 'DUN'], ['forest', 'FOR'], ['desert', 'DES'], ['mud', 'MUD'], ['mountain', 'MTN']],
    len: [['short', 'S'], ['medium', 'M'], ['long', 'L']],
    laps: [[1, '1'], [2, '2'], [3, '3'], [5, '5'], [10, 'X']],
    twist: [['flowing', 'F'], ['mixed', 'M'], ['technical', 'T']],
    width: [['narrow', 'N'], ['normal', 'R'], ['wide', 'W']],
    jumps: [['none', '0'], ['some', '1'], ['lots', '2']],
    whoops: [['none', '0'], ['some', '1'], ['lots', '2']],
  };
  const OFF_DEFAULT = { biome: 'forest', len: 'medium', laps: 3, twist: 'mixed', width: 'normal', jumps: 'some', whoops: 'some', seed: 20262 };
  const OFF_LEN = { short: 2000, medium: 3500, long: 5500 };
  function offNormalize(c) {
    const o = Object.assign({}, OFF_DEFAULT);
    if (c) for (const k of Object.keys(OFF_OPTS)) if (OFF_OPTS[k].some((p) => p[0] === c[k])) o[k] = c[k];
    o.seed = c && Number.isFinite(+c.seed) ? Math.abs(Math.floor(+c.seed)) % 2147483647 : OFF_DEFAULT.seed;
    return o;
  }
  function offCode(c) {
    c = offNormalize(c);
    const L = (k) => OFF_OPTS[k].find((p) => p[0] === c[k])[1];
    return L('biome') + '-' + L('len') + L('laps') + L('twist') + L('width') + L('jumps') + L('whoops') + '-' + c.seed.toString(36).toUpperCase();
  }
  function offParse(code) {
    const m = /^([A-Z]{3})-([SML])([1235X])([FMT])([NRW])([012])([012])-([0-9A-Z]{1,7})$/.exec(String(code || '').trim().toUpperCase());
    if (!m) return null;
    const P = (k, v) => { const p = OFF_OPTS[k].find((q) => q[1] === v); return p ? p[0] : undefined; };
    const c = { biome: P('biome', m[1]), len: P('len', m[2]), laps: P('laps', m[3]), twist: P('twist', m[4]), width: P('width', m[5]), jumps: P('jumps', m[6]), whoops: P('whoops', m[7]), seed: parseInt(m[8], 36) };
    return c.biome ? offNormalize(c) : null;
  }
  let OFF = offNormalize(null);
  function setOffroad(c) { OFF = offNormalize(c); }
  // (the terrain's own ground: sampled somewhere of its own in the noise for each seed)
  let OFFX = 0, OFFZ = 0, OFFB = 'forest', OFFCX = 0, OFFCZ = 0, OFFRM = 1e4;
  function offNatural(x, z) {
    const X = x + OFFX, Z = z + OFFZ;
    if (OFFB === 'dunes') return duneHeight(X, Z);
    if (OFFB === 'desert') {
      let h = nLow1(X * 0.0007, Z * 0.0007) * 12 + nLow2(X * 0.0028 + 4.1, Z * 0.0028 - 8.3) * 3.2 + nHill(X * 0.009, Z * 0.009) * 0.9 + nDet(X * 0.03, Z * 0.03) * 0.35;
      // (mesas and buttes - flat tops, steep sides - only well out past the course)
      const far = smooth(OFFRM + 140, OFFRM + 460, Math.hypot(x - OFFCX, z - OFFCZ));
      if (far > 0) { const r = ridged(X * 0.0011, Z * 0.0011); h += far * (60 * smooth(0.5, 0.58, r) + 10 * r); }
      return h;
    }
    if (OFFB === 'mud') return nLow1(X * 0.0012, Z * 0.0012) * 3.5 + nLow2(X * 0.005 + 2.2, Z * 0.005 - 6.1) * 0.9 + nDet(X * 0.04, Z * 0.04) * 0.3;
    if (OFFB === 'mountain') { const r = ridged(X * 0.0011, Z * 0.0011); return nLow1(X * 0.0008, Z * 0.0008) * 40 + r * r * 90 + nHill(X * 0.004, Z * 0.004) * 9 + nDet(X * 0.03, Z * 0.03) * 1.2; }
    return nLow1(X * 0.001, Z * 0.001) * 14 + nLow2(X * 0.0042 + 11.3, Z * 0.0042 - 7.1) * 2.6
      + (nHill(X * 0.0031, Z * 0.0031) + 0.5 * nHill(X * 0.0071 + 3.1, Z * 0.0071 - 1.7)) * 12 + nDet(X * 0.028, Z * 0.028) + nDet(X * 0.085 + 5.2, Z * 0.085 - 3.3) * 0.25;
  }
  // a closed centripetal Catmull-Rom curve through P, a point every ~step (in P's units)
  function crLoop(P, step) {
    const n0 = P.length, out = [];
    for (let i = 0; i < n0; i++) {
      const p0 = P[(i - 1 + n0) % n0], p1 = P[i], p2 = P[(i + 1) % n0], p3 = P[(i + 2) % n0];
      const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-3;
      const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
      const m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let k = 0; k < m; k++) {
        const t = t1 + (t2 - t1) * k / m;
        const L = (a, b, ta, tb) => [(a[0] * (tb - t) + b[0] * (t - ta)) / (tb - ta), (a[1] * (tb - t) + b[1] * (t - ta)) / (tb - ta)];
        const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
        out.push(L(L(A1, A2, 0, t2), L(A2, A3, t1, t3), t1, t2));
      }
    }
    return out;
  }
  const loopLen = (Q) => { let L = 0; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; };
  // (resampled every d metres along it)
  function resampleLoop(Q, d) {
    const cum = [0];
    for (let i = 1; i <= Q.length; i++) { const a = Q[i - 1], b = Q[i % Q.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = cum[Q.length], n = Math.max(8, Math.round(L / d)), out = [];
    for (let k = 0, j = 0; k < n; k++) {
      const t = k * L / n;
      while (cum[j + 1] < t) j++;
      const a = Q[j], b = Q[(j + 1) % Q.length], f = (t - cum[j]) / (cum[j + 1] - cum[j] || 1);
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    return out;
  }
  // signed radius of curvature at each point of a closed line (over an ~8 m chord, + turning left)
  function loopRadii(Q, k4) {
    const n = Q.length, R = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = Q[(k - k4 + n) % n], b = Q[k], c = Q[(k + k4) % n];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) * Math.hypot(a[0] - c[0], a[1] - c[1]) / (2 * Math.abs(cr) + 1e-9);
      R[k] = cr > 0 ? -r : r;
    }
    return R;
  }
  // does the line come within `sep` of itself anywhere further than `gap` metres along it (it's sampled every 2 m)?
  function loopTooClose(Q, sep, gap) {
    const n = Q.length, cell = sep, grid = new Map(), key = (i, j) => (i + 4096) * 8192 + (j + 4096), gk = Math.round(gap / 2);
    for (let k = 0; k < n; k++) { const kk = key(Math.floor(Q[k][0] / cell), Math.floor(Q[k][1] / cell)); let l = grid.get(kk); if (!l) grid.set(kk, l = []); l.push(k); }
    for (let k = 0; k < n; k += 2) {
      const ci = Math.floor(Q[k][0] / cell), cj = Math.floor(Q[k][1] / cell);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const l = grid.get(key(i, j)); if (!l) continue;
        for (const m of l) {
          let ds = Math.abs(m - k); ds = Math.min(ds, n - ds);
          if (ds > gk && Math.hypot(Q[m][0] - Q[k][0], Q[m][1] - Q[k][1]) < sep) return true;
        }
      }
    }
    return false;
  }
  function offGenerate(cfg) {
    const B = OFF_BIOMES[cfg.biome], rnd = mulberry32((cfg.seed ^ 0x2545f491) + 7919 * (OFF_OPTS.biome.findIndex((p) => p[0] === cfg.biome) + 1));
    const Ltar = OFF_LEN[cfg.len], tw = ['flowing', 'mixed', 'technical'].indexOf(cfg.twist);
    const Wd = B.W * { narrow: 0.75, normal: 1, wide: 1.35 }[cfg.width], hw = Wd / 2;
    const sep = 2 * (hw + B.verge) + 8, Rmin = [28, 17, 11][tw];
    OFFB = cfg.biome; OFFX = (rnd() - 0.5) * 40000; OFFZ = (rnd() - 0.5) * 40000;
    let Q = null;
    for (let attempt = 0; attempt < 80 && !Q; attempt++) {
      // the control points: round the centre, the radius wandering; the twistier settings add kinks between them
      const N = [8, 11, 14][tw] + Math.floor(rnd() * 4), A = [0.26, 0.36, 0.44][tw], P = [];
      for (let i = 0; i < N; i++) {
        const a = (i + (rnd() - 0.5) * 0.55) / N * Math.PI * 2, r = 1 + A * (rnd() * 2 - 1);
        P.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      if (tw > 0) {
        for (let i = P.length - 1; i >= 0; i--) {
          if (rnd() > [0, 0.45, 0.8][tw]) continue;
          const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], k = (rnd() - 0.5) * [0, 0.5, 0.8][tw];
          P.splice(i + 1, 0, [(a[0] + b[0]) / 2 - dz * k, (a[1] + b[1]) / 2 + dx * k]);
        }
      }
      // (to the length asked for, then a point every 2 m)
      const sc = Ltar / loopLen(crLoop(P, 0.01));
      const L2 = resampleLoop(crLoop(P.map(([x, z]) => [x * sc, z * sc]), 1), 2);
      const R = loopRadii(L2, 4);
      let ok = true;
      for (let k = 0; k < L2.length && ok; k++) if (Math.abs(R[k]) < Rmin) ok = false;
      if (ok && loopTooClose(L2, sep, Math.max(120, 3 * sep))) ok = false;
      if (ok) Q = L2;
    }
    if (!Q) { Q = []; const n = Math.round(Ltar / 2), a = Ltar / (2 * Math.PI) * 1.25, b = Ltar / (2 * Math.PI) * 0.72; for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; Q.push([Math.cos(t) * a, Math.sin(t) * b]); } }
    if (rnd() < 0.5) Q.reverse();
    // the start: the middle of its straightest 80 m, then the whole thing turned and moved so that's (0, 0) heading -z
    const n = Q.length, R = loopRadii(Q, 4);
    let k0 = 0, best = -1;
    for (let k = 0; k < n; k += 2) { let mn = 1e9; for (let j = -20; j <= 20; j++) mn = Math.min(mn, Math.abs(R[(k + j + n) % n])); if (mn > best) { best = mn; k0 = k; } }
    const a = Q[(k0 - 2 + n) % n], b = Q[(k0 + 2) % n], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // (turned by -90 deg minus the heading there: its direction comes out (0, -1))
    const c = -(b[1] - a[1]) / tl, s = -(b[0] - a[0]) / tl, o = Q[k0], pts = [];
    for (let j = 0; j < n; j++) { const p = Q[(k0 + j) % n], dx = p[0] - o[0], dz = p[1] - o[1]; pts.push([dx * c - dz * s, dx * s + dz * c]); }
    pts[0] = [0, 0];
    const T = buildTrack({ W: Wd, kind: 'offroad', steep: 0, pts });
    T.biome = cfg.biome; T.B = B; T.cfg = cfg; T.code = offCode(cfg);
    // (how far the course reaches from its middle: the desert's mesas stay out past it)
    OFFCX = T.cx; OFFCZ = T.cz; OFFRM = 0;
    for (let k = 0; k < T.n; k++) OFFRM = Math.max(OFFRM, Math.hypot(T.x[k] - T.cx, T.z[k] - T.cz));
    offProfile(T, rnd);
    T.off = [OFFB, OFFX, OFFZ, OFFCX, OFFCZ, OFFRM];
    return T;
  }
  // the course's ground along its centre line: the land's own, smoothed and grade-limited, then the features built in
  function offProfile(T, rnd) {
    const n = T.n, B = T.B, cfg = T.cfg, ds = T.L / n;
    const avg = (src, M) => { const o = new Float64Array(n); let acc = 0; for (let j = -M; j <= M; j++) acc += src[(j + n) % n]; for (let k = 0; k < n; k++) { o[k] = acc / (2 * M + 1); acc += src[(k + M + 1) % n] - src[(k - M + n) % n]; } return o; };
    // (grades held to the steepest a car can climb: halfway between the highest such line under the ground - cuttings
    // through every crest - and the lowest over it - fills across every dip; each is a distance transform round the loop)
    const lim = (src) => {
      const g = B.grade * ds, U = Float64Array.from(src), D = Float64Array.from(src);
      for (let r = 0; r < 2; r++) {
        for (let k = 1; k < 2 * n; k++) { const i = k % n, p = (k - 1) % n; if (U[i] > U[p] + g) U[i] = U[p] + g; if (D[i] < D[p] - g) D[i] = D[p] - g; }
        for (let k = 2 * n - 2; k >= 0; k--) { const i = k % n, p = (k + 1) % n; if (U[i] > U[p] + g) U[i] = U[p] + g; if (D[i] < D[p] - g) D[i] = D[p] - g; }
      }
      const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = (U[i] + D[i]) / 2; return o;
    };
    // (where in the terrain's noise it goes: up the mountain and through the woods, the gentlest of a few tries - the
    // least digging and filling; the dunes, the desert's swells and the bog as they come)
    let best = null;
    for (let t = 0; t < (T.biome === 'mountain' ? 6 : T.biome === 'forest' ? 3 : 1); t++) {
      if (t) { OFFX = (rnd() - 0.5) * 40000; OFFZ = (rnd() - 0.5) * 40000; }
      const h = new Float64Array(n); for (let k = 0; k < n; k++) h[k] = offNatural(T.x[k], T.z[k]);
      // (then the crests and dips rounded off - a grade change spread over ~50-100 m, so a car stays on the ground over
      // the brows up to ~75-95 mph instead of leaving them at 40)
      const hb = avg(avg(lim(avg(h, B.sm)), B.round), B.round);
      let cost = 0; for (let k = 0; k < n; k++) cost += Math.abs(hb[k] - h[k]);
      if (!best || cost < best.cost) best = { cost, hb, ox: OFFX, oz: OFFZ };
    }
    OFFX = best.ox; OFFZ = best.oz; T.dig = best.cost / n;
    const hc = Float64Array.from(best.hb); T.hb = Float32Array.from(best.hb);
    const zone = new Uint8Array(n), used = new Uint8Array(n), feats = [];
    const iOf = (s) => ((Math.round(s / ds) % n) + n) % n;
    const free = (k, a, b) => { for (let j = a; j <= b; j++) if (used[(k + j + n) % n]) return false; return true; };
    const take = (k, a, b) => { for (let j = a; j <= b; j++) used[(k + j + n) % n] = 1; };
    take(0, -40, 40);                                   // (the start grid and the arch)
    const straight = (k, a, b, Rm) => { for (let j = a; j <= b; j++) if (Math.abs(T.R[(k + j + n) % n]) < Rm) return false; return true; };
    const pick = (count, a, b, Rm, place, ok) => {
      for (let tries = 0, maxT = count * 80; tries < maxT && count > 0; tries++) {
        const k = Math.floor(rnd() * n);
        if (!free(k, a - 20, b + 20) || !straight(k, a, b, Rm) || (ok && !ok(k))) continue;
        take(k, a - 20, b + 20); place(k); count--;
      }
    };
    // jumps: tabletops, and with "lots" kickers too - up a ramp, over the top (or off the lip), down a landing. Only on a
    // straight (a car flies straight on while a bend would carry on round under it) that runs level or downhill through
    // the landing - nothing rising to meet you - and the ground there's graded to an even slope first
    const level = (k) => { const a = T.hb[(k - 10 + n) % n], b = T.hb[k], c = T.hb[(k + 35) % n]; return c - b <= 0.35 && (c - a) / (45 * ds) >= -0.06; };
    const grade = (k) => {
      const a = hc[(k - 10 + n) % n], c = hc[(k + 35) % n];
      for (let j = -18; j <= 43; j++) { const i = (k + j + n) % n, lin = a + (c - a) * Math.min(1, Math.max(0, (j + 10) / 45)), w = j < -10 ? (j + 18) / 8 : j > 35 ? (43 - j) / 8 : 1; hc[i] += (lin - hc[i]) * Math.max(0, Math.min(1, w)); }
    };
    const nJ = cfg.jumps === 'none' ? 0 : Math.max(1, Math.floor(T.L / (cfg.jumps === 'lots' ? 380 : 750)));
    pick(nJ, -10, 35, cfg.jumps === 'lots' ? 120 : 180, (k) => {
      grade(k);
      // (a tabletop's face an even ~7-9 deg - a fast truck flies ~1 s and lands on the far side's down slope; a kicker
      // steepens to ~11-15 deg at its lip)
      const kick = cfg.jumps === 'lots' && rnd() < 0.45, A = kick ? 1.0 + rnd() * 0.3 : 1.2 + rnd() * 0.5;
      const Lu = kick ? 8 : 10, Lt = kick ? 0 : 8 + rnd() * 6, Ld = kick ? 20 : 16;
      for (let j = -2; j <= Math.ceil((Lu + Lt + Ld + 10) / ds); j++) {
        const u = j * ds, i = (k + j + n) % n;
        let y = 0;
        if (u < 0) y = 0; else if (u < Lu) y = A * Math.pow(u / Lu, kick ? 1.6 : 1.15);
        else if (u < Lu + Lt) y = A;
        else if (u < Lu + Lt + Ld) { const t = (u - Lu - Lt) / Ld; y = A * (1 - t) - 0.3 * t; }
        else if (u < Lu + Lt + Ld + 10) y = -0.3 * (1 - (u - Lu - Lt - Ld) / 10);
        hc[i] += y;
      }
      feats.push({ s: T.s[k], kind: 'jump' });
    }, level);
    // whoops: a run of rollers ~9 m apart, on gentle ground (not down a mountainside into a bend)
    const gentle = (k) => { for (let j = -5; j < 50; j++) if (Math.abs(T.hb[(k + j + 1) % n] - T.hb[(k + j + n) % n]) > 0.08 * ds) return false; return true; };
    const nW = cfg.whoops === 'none' ? 0 : Math.max(1, Math.floor(T.L / (cfg.whoops === 'lots' ? 650 : 1300)));
    pick(nW, 0, 45, 60, (k) => {
      const P = 9, nR = 5 + Math.floor(rnd() * 4), A = (T.biome === 'desert' ? 0.62 : 0.45) + rnd() * 0.15;
      for (let j = 0; j <= Math.round(nR * P / ds); j++) {
        const u = j * ds, f = Math.min(1, u / P, (nR * P - u) / P);
        hc[(k + j) % n] += A * Math.max(0, f) * (0.5 - 0.5 * Math.cos(2 * Math.PI * u / P));
      }
      feats.push({ s: T.s[k], kind: 'whoops' });
    }, gentle);
    // the terrain's own: mud holes in the dips through the woods; on the bog, firm dirt over the rises (mud everywhere
    // else); sandy washes across the desert course
    if (T.biome === 'forest' || T.biome === 'mud') {
      for (let k = 0; k < n; k++) {
        let lo = true, hi = true;
        for (let j = 8; j <= 20 && (lo || hi); j += 4) { const a = hc[(k - j + n) % n], b = hc[(k + j) % n]; if (hc[k] > a - 0.25 || hc[k] > b - 0.25) lo = false; if (hc[k] < a + 0.25 || hc[k] < b + 0.25) hi = false; }
        if (T.biome === 'forest' && lo && !used[k]) for (let j = -7; j <= 7; j++) zone[(k + j + n) % n] = 1;
        if (T.biome === 'mud' && hi) for (let j = -9; j <= 9; j++) zone[(k + j + n) % n] = 3;
      }
      if (T.biome === 'forest') for (let k = 0; k < n; k++) if (zone[k] === 1) hc[k] -= 0.22;
    }
    if (T.biome === 'desert') {
      for (let s = 220 + rnd() * 200; s < T.L - 120; s += 260 + rnd() * 260) {
        const k = iOf(s), half = 5 + Math.floor(rnd() * 5);
        if (!free(k, -half, half)) continue;
        for (let j = -half - 4; j <= half + 4; j++) { const i = (k + j + n) % n, t = Math.min(1, (half + 4 - Math.abs(j)) / 4); hc[i] -= 0.7 * t; if (Math.abs(j) <= half) zone[i] = 2; }
      }
    }
    T.hc = Float32Array.from(hc); T.zone = zone; T.feats = feats;
  }
  // the course's ground height s metres along it
  function offProfileAt(s) {
    const T = TRK, f = (((s % T.L) + T.L) % T.L) / T.L * T.n, i = Math.floor(f) % T.n, j = (i + 1) % T.n, u = f - Math.floor(f);
    return T.hc[i] + (T.hc[j] - T.hc[i]) * u;
  }
  const _ttq = {}, _ftq = {}, _gtq = {}, _ptq = {};

  // ---------------------------------------------------------------- road network
  // NS road i:  x = base + A1 sin(k1 z + p1) + A2 sin(k2 z + p2) + A3 sin(k3 z + p3)
  // EW road j:  z = (same form in x)
  const roadCache = new Map();
  function roadParams(axis, i) {
    const key = axis * 1000003 + i;
    let p = roadCache.get(key);
    if (p) return p;
    if (MAP === 'tarmac') {
      // dead-straight avenues on a grid
      p = new Float64Array(10);
      p[0] = i * TARMAC.AV;
      roadCache.set(key, p);
      return p;
    }
    if (STRAIGHT()) {
      // only NS road 0 exists (x = 0); everything else is parked far away
      p = new Float64Array(10);
      p[0] = axis === 0 && i === 0 ? 0 : 1e7 + i * S;
      roadCache.set(key, p);
      return p;
    }
    const r = mulberry32(hashInt(axis + 11, i, SEED));
    p = new Float64Array(10);
    const TAU = Math.PI * 2;
    p[0] = i * S + (r() - 0.5) * 200;
    p[1] = 40 + r() * 95;  p[2] = TAU / (950 + r() * 950);  p[3] = r() * TAU;
    p[4] = 6 + r() * 26;   p[5] = TAU / (320 + r() * 260);  p[6] = r() * TAU;
    p[7] = 1.5 + r() * 4;  p[8] = TAU / (150 + r() * 120);  p[9] = r() * TAU;
    roadCache.set(key, p);
    if (roadCache.size > 4000) roadCache.clear();
    return p;
  }
  function roadCenter(p, t) {
    return p[0] + p[1] * Math.sin(p[2] * t + p[3]) + p[4] * Math.sin(p[5] * t + p[6]) + p[7] * Math.sin(p[8] * t + p[9]);
  }
  function roadSlope(p, t) {
    return p[1] * p[2] * Math.cos(p[2] * t + p[3]) + p[4] * p[5] * Math.cos(p[5] * t + p[6]) + p[7] * p[8] * Math.cos(p[8] * t + p[9]);
  }

  /** Nearest road: d (unsigned dist), sd (signed lateral offset), axis 0=NS/1=EW, idx, slope,
   *  dOther (distance to nearest road of the other axis). */
  function roadInfo(x, z, out) {
    out = out || {};
    if (MAP === 'arena' || MAP === 'mowtrack' || MAP === 'ramps' || MAP === 'dunes' || TRK) { out.d = 1e4; out.sd = 1e4; out.axis = 0; out.idx = 0; out.slope = 0; out.dOther = 1e9; return out; }
    if (STRAIGHT()) { out.d = Math.abs(x); out.sd = x; out.axis = 0; out.idx = 0; out.slope = 0; out.dOther = 1e9; return out; }
    if (MAP === 'tarmac') {
      const A = TARMAC.AV, i = Math.round(x / A), j = Math.round(z / A), sx = x - i * A, sz = z - j * A;
      const ax = sx < 0 ? -sx : sx, az = sz < 0 ? -sz : sz;
      if (ax <= az) { out.d = ax; out.sd = sx; out.axis = 0; out.idx = i; out.slope = 0; out.dOther = az; }
      else { out.d = az; out.sd = sz; out.axis = 1; out.idx = j; out.slope = 0; out.dOther = ax; }
      return out;
    }
    let bestNS = 1e9, sdNS = 0, idxNS = 0, slNS = 0;
    const i0 = Math.floor(x / S);
    for (let i = i0; i <= i0 + 1; i++) {
      const p = roadParams(0, i);
      const s1 = p[2] * z + p[3], s2 = p[5] * z + p[6], s3 = p[8] * z + p[9];
      const c = p[0] + p[1] * Math.sin(s1) + p[4] * Math.sin(s2) + p[7] * Math.sin(s3);
      const sl = p[1] * p[2] * Math.cos(s1) + p[4] * p[5] * Math.cos(s2) + p[7] * p[8] * Math.cos(s3);
      const sd = (x - c) / Math.sqrt(1 + sl * sl);
      const ad = sd < 0 ? -sd : sd;
      if (ad < bestNS) { bestNS = ad; sdNS = sd; idxNS = i; slNS = sl; }
    }
    let bestEW = 1e9, sdEW = 0, idxEW = 0, slEW = 0;
    const j0 = Math.floor(z / S);
    for (let j = j0; j <= j0 + 1; j++) {
      const p = roadParams(1, j);
      const s1 = p[2] * x + p[3], s2 = p[5] * x + p[6], s3 = p[8] * x + p[9];
      const c = p[0] + p[1] * Math.sin(s1) + p[4] * Math.sin(s2) + p[7] * Math.sin(s3);
      const sl = p[1] * p[2] * Math.cos(s1) + p[4] * p[5] * Math.cos(s2) + p[7] * p[8] * Math.cos(s3);
      const sd = (z - c) / Math.sqrt(1 + sl * sl);
      const ad = sd < 0 ? -sd : sd;
      if (ad < bestEW) { bestEW = ad; sdEW = sd; idxEW = j; slEW = sl; }
    }
    if (bestNS <= bestEW) {
      out.d = bestNS; out.sd = sdNS; out.axis = 0; out.idx = idxNS; out.slope = slNS; out.dOther = bestEW;
    } else {
      out.d = bestEW; out.sd = sdEW; out.axis = 1; out.idx = idxEW; out.slope = slEW; out.dOther = bestNS;
    }
    return out;
  }

  /** Point on road (axis, idx) at along-coordinate t, plus unit tangent (pointing +t). */
  function roadPoint(axis, idx, t, out) {
    out = out || {};
    const p = roadParams(axis, idx);
    const c = roadCenter(p, t), sl = roadSlope(p, t);
    const L = Math.sqrt(1 + sl * sl);
    if (axis === 0) { out.x = c; out.z = t; out.tx = sl / L; out.tz = 1 / L; }
    else { out.x = t; out.z = c; out.tx = 1 / L; out.tz = sl / L; }
    out.y = lowHeight(out.x, out.z);
    return out;
  }

  /** Fill Float32Arrays (5 roads * 12 floats) for the terrain shader around (cx, cz). */
  function roadUniforms(cx, cz, outNS, outEW) {
    const i0 = Math.floor(cx / S) - 2, j0 = Math.floor(cz / S) - 2;
    for (let k = 0; k < 5; k++) {
      const a = roadParams(0, i0 + k), b = roadParams(1, j0 + k);
      const o = k * 12;
      for (const [arr, p] of [[outNS, a], [outEW, b]]) {
        arr[o] = p[0]; arr[o + 1] = p[1]; arr[o + 2] = p[2]; arr[o + 3] = p[3];
        arr[o + 4] = p[4]; arr[o + 5] = p[5]; arr[o + 6] = p[6]; arr[o + 7] = p[7];
        arr[o + 8] = p[8]; arr[o + 9] = p[9]; arr[o + 10] = 0; arr[o + 11] = 0;
      }
    }
  }

  // ---------------------------------------------------------------- jump ramps
  // Now and then a steel kicker sits in one lane of a straight, level stretch of country road, facing that lane's
  // traffic (the other lane stays clear). Along the travel direction u: a curved rise to a 1.3 m lip (~15 deg) over
  // 7.5 m, then a 9 m back slope, so it's drivable from both ends. It's part of the ground height, so the tyres,
  // suspension and body all feel it for real.
  const RAMP = { SEG: 600, W: 5.6, LUP: 7.5, LDN: 9, H: 1.3, EXP: 1.5, BEVEL: 1.2, SPAWN_X: 30, SPAWN_Z: 40 };
  const rampCache = new Map();
  // one guaranteed ramp ~450 m up the road from the spawn, in the spawn lane, so there's a jump right away
  let spawnRampV = undefined;
  function spawnRamp() {
    if (spawnRampV !== undefined) return spawnRampV;
    spawnRampV = null;
    // the game spawns on the nearest road to (30, 40) heading towards -z (see nearestRoadSpot)
    const ri = roadInfo(RAMP.SPAWN_X, RAMP.SPAWN_Z, {}), t0 = ri.axis === 0 ? RAMP.SPAWN_Z : RAMP.SPAWN_X;
    const p0 = roadPoint(ri.axis, ri.idx, t0, {});
    const dirT = p0.tz <= 0 ? 1 : -1;                        // +1: driving along +t heads towards -z
    const pt = {}, a = {}, b = {};
    let best = null, bestS = -2;
    for (let d = 350; d <= 900; d += 10) {                   // the straightest, most level spot 350-900 m up the road
      const t = t0 + dirT * d;
      roadPoint(ri.axis, ri.idx, t, pt); roadPoint(ri.axis, ri.idx, t - 60, a); roadPoint(ri.axis, ri.idx, t + 60, b);
      const c = roadPoint(ri.axis, ri.idx, t + dirT * 100, {});   // landing zone
      const st = a.tx * b.tx + a.tz * b.tz - Math.abs(b.y - a.y) / 60 - Math.max(0, c.y - pt.y) / 40 - d / 20000;
      if (st > bestS) { bestS = st; best = { t, x: pt.x, z: pt.z, tx: pt.tx, tz: pt.tz }; }
    }
    const fx = best.tx * dirT, fz = best.tz * dirT, rx = -fz, rz = fx, len = RAMP.LUP + RAMP.LDN;
    const mx = best.x + rx * C.LANE_W / 2, mz = best.z + rz * C.LANE_W / 2;
    spawnRampV = { x: mx - fx * len / 2, z: mz - fz * len / 2, fx, fz, rx, rz, len, axis: ri.axis, idx: ri.idx, t: best.t, dir: dirT, px: best.x, pz: best.z };
    return spawnRampV;
  }
  function mkRamp(mx, mz, fx, fz, extra) {       // ramp centred on (mx, mz), launching along (fx, fz)
    const len = RAMP.LUP + RAMP.LDN;
    return Object.assign({ x: mx - fx * len / 2, z: mz - fz * len / 2, fx, fz, rx: -fz, rz: fx, len, px: mx, pz: mz }, extra);
  }
  // All Road: loose kickers scattered over the lots pointing any which way, now and then one in an avenue lane (facing
  // that lane's traffic, with a JUMP sign 70 m before it), and one 370 m straight up the road from the spawn
  const TARMAC_SPAWN_RAMP = mkRamp(TARMAC.SPAWN_X, TARMAC.SPAWN_Z - 370, 0, -1, { axis: 0, idx: 0, t: TARMAC.SPAWN_Z - 370, dir: -1 });
  function tarmacRamps(cx, cz, list) {
    const A = TARMAC.AV, CH = C.CHUNK, x0 = cx * CH, z0 = cz * CH;
    const mine = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH;     // owned by the chunk holding its middle
    for (let bi = Math.floor(x0 / A) - 1; bi <= Math.floor((x0 + CH) / A); bi++) {
      for (let bj = Math.floor(z0 / A) - 1; bj <= Math.floor((z0 + CH) / A); bj++) {
        const h = hash01(bi, bj, 301), n = h < 0.3 ? 0 : h < 0.75 ? 1 : 2;
        for (let k = 0; k < n; k++) {
          // anywhere in the lot, well clear of the avenues (two: one in each half)
          const u = (k + 0.15 + 0.7 * hash01(bi * 7 + k, bj, 302)) / n, w = hash01(bi, bj * 7 + k, 303);
          const mx = bi * A + 30 + u * (A - 60), mz = bj * A + 30 + w * (A - 60);
          if (!mine(mx, mz)) continue;
          const a = hash01(bi * 3 + k, bj * 5, 304) * Math.PI * 2;
          list.push(mkRamp(mx, mz, Math.sin(a), Math.cos(a)));
        }
      }
    }
    for (let axis = 0; axis < 2; axis++) {
      const lo = axis === 0 ? x0 : z0, tlo = axis === 0 ? z0 : x0;
      for (let idx = Math.floor(lo / A); idx <= Math.floor((lo + CH) / A) + 1; idx++) {
        for (let k = Math.floor(tlo / A) - 1; k <= Math.floor((tlo + CH) / A); k++) {
          if (hash01(axis * 5 + 2, idx * 173 + k, 305) > 0.3) continue;
          const t = k * A + A / 2 + (hash01(axis, idx * 59 + k, 306) - 0.5) * 80;     // mid-block, clear of the crossings
          const dir = hash01(axis, idx * 61 + k, 307) < 0.5 ? -1 : 1;
          const lane = hash01(axis, idx * 67 + k, 308) < 0.5 ? C.LANE_W / 2 : C.LANE_W * 1.5;
          const fx = axis === 0 ? 0 : dir, fz = axis === 0 ? dir : 0;              // along +t (z / x) times dir
          const mx = (axis === 0 ? idx * A : t) - fz * lane, mz = (axis === 0 ? t : idx * A) + fx * lane;   // + right * lane
          if (!mine(mx, mz)) continue;
          if (Math.hypot(mx - TARMAC.SPAWN_X, mz - TARMAC.SPAWN_Z) < 450) continue;   // the spawn has its own
          list.push(mkRamp(mx, mz, fx, fz, { axis, idx, t, dir }));
        }
      }
    }
  }
  function rampsInChunk(cx, cz) {
    const key = cx * 100003 + cz;
    let list = rampCache.get(key);
    if (list) return list;
    list = [];
    if (MAP === 'country') {
      const CH = C.CHUNK, x0 = cx * CH, z0 = cz * CH, pt = {}, a = {}, b = {}, ri = {};
      for (let axis = 0; axis < 2; axis++) {
        const lo = axis === 0 ? x0 : z0, hi = lo + CH, tlo = axis === 0 ? z0 : x0, thi = tlo + CH;
        const iA = Math.floor((lo - 350) / S), iB = Math.floor((hi + 350) / S);
        for (let idx = iA; idx <= iB; idx++) {
          for (let k = Math.floor(tlo / RAMP.SEG) - 1; k <= Math.ceil(thi / RAMP.SEG); k++) {
            if (hash01(axis * 5 + 2, idx * 173 + k, 91) > 0.85) continue;
            // a few tries along the segment for a spot that's straight (little heading change over the run-up and
            // landing), fairly level, dry and clear of crossroads
            let t = 0, ok = false;
            for (let tr = 0; tr < 6 && !ok; tr++) {
              t = k * RAMP.SEG + 60 + hash01(axis, idx * 59 + k, 92 + tr) * (RAMP.SEG - 120);
              roadPoint(axis, idx, t, pt);
              roadPoint(axis, idx, t - 60, a); roadPoint(axis, idx, t + 60, b);
              if (a.tx * b.tx + a.tz * b.tz < 0.96 || a.tx * pt.tx + a.tz * pt.tz < 0.985 || b.tx * pt.tx + b.tz * pt.tz < 0.985) continue;
              if (Math.abs(b.y - a.y) > 6 || pt.y < C.WATER_LEVEL + 3) continue;
              roadInfo(pt.x, pt.z, ri);
              if (ri.axis !== axis || ri.idx !== idx || ri.dOther < 80) continue;
              ok = true;
            }
            if (!ok) continue;
            if (pt.x < x0 || pt.x >= x0 + CH || pt.z < z0 || pt.z >= z0 + CH) continue;       // owned by the chunk holding it
            if (Math.hypot(pt.x - RAMP.SPAWN_X, pt.z - RAMP.SPAWN_Z) < 350) continue;           // keep the spawn clear
            const dir = hash01(axis, idx * 61 + k, 93) < 0.5 ? -1 : 1;     // which lane, i.e. which way it launches
            const fx = pt.tx * dir, fz = pt.tz * dir, rx = -fz, rz = fx;     // right = forward x up
            const len = RAMP.LUP + RAMP.LDN;
            const mx = pt.x + rx * C.LANE_W / 2, mz = pt.z + rz * C.LANE_W / 2;   // centre of the lane
            list.push({ x: mx - fx * len / 2, z: mz - fz * len / 2, fx, fz, rx, rz, len, axis, idx, t, dir });
          }
        }
      }
    }
    else if (MAP === 'tarmac') tarmacRamps(cx, cz, list);
    const sr = MAP === 'country' ? spawnRamp() : MAP === 'tarmac' ? TARMAC_SPAWN_RAMP : null;
    if (sr && Math.floor(sr.px / C.CHUNK) === cx && Math.floor(sr.pz / C.CHUNK) === cz) list.push(sr);
    rampCache.set(key, list);
    if (rampCache.size > 800) rampCache.delete(rampCache.keys().next().value);
    return list;
  }
  const _near = [];
  function rampsNear(x, z) {
    const CH = C.CHUNK, cx = Math.floor(x / CH), cz = Math.floor(z / CH), m = 16;
    const fx = x - cx * CH, fz = z - cz * CH;
    const ax = fx < m ? -1 : 0, bx = fx > CH - m ? 1 : 0, az = fz < m ? -1 : 0, bz = fz > CH - m ? 1 : 0;
    if (!ax && !bx && !az && !bz) return rampsInChunk(cx, cz);
    _near.length = 0;
    for (let i = ax; i <= bx; i++) for (let j = az; j <= bz; j++) { const l = rampsInChunk(cx + i, cz + j); for (let k = 0; k < l.length; k++) _near.push(l[k]); }
    return _near;
  }
  /** Height of ramp r above the ground at (x,z) (0 = off it); its xz gradient goes to _rg. */
  const _rg = { x: 0, z: 0 };
  function rampHeight(r, x, z) {
    const dx = x - r.x, dz = z - r.z;
    const u = dx * r.fx + dz * r.fz;
    if (u <= 0 || u >= r.len) return 0;
    const v = dx * r.rx + dz * r.rz, av = v < 0 ? -v : v, hw = RAMP.W / 2;
    if (av >= hw) return 0;
    let h, dhdu;
    if (u < RAMP.LUP) { const s = u / RAMP.LUP; h = RAMP.H * Math.pow(s, RAMP.EXP); dhdu = RAMP.H * RAMP.EXP * Math.pow(s, RAMP.EXP - 1) / RAMP.LUP; }
    else { h = RAMP.H * (1 - (u - RAMP.LUP) / RAMP.LDN); dhdu = -RAMP.H / RAMP.LDN; }
    let side = 1, dside = 0;
    // wide, rounded side slopes (not walls): a car sliding into the side rides up it instead of being tripped
    if (av > hw - RAMP.BEVEL) { const q = (hw - av) / RAMP.BEVEL; side = q * q * (3 - 2 * q); dside = (v < 0 ? 1 : -1) * 6 * q * (1 - q) / RAMP.BEVEL; }
    const du = dhdu * side, dv = h * dside;
    _rg.x = du * r.fx + dv * r.rx; _rg.z = du * r.fz + dv * r.rz;
    return h * side;
  }

  // ---------------------------------------------------------------- monster truck arena ('arena')
  // A stadium floor covered in packed, watered clay: HW x HL (half sizes) with rounded corners (radius CR), a concrete
  // wall and debris fence all round (colliders), the stands beyond. Every obstacle is an exact height function (like the
  // jump ramps), added to the flat ground so the tyres, suspension and body feel it, and meshed from the same function.
  // The floor is 192 x 368 m, wall to wall:
  //   middle     - two big gap jumps in a row up the centre (a 30 deg kicker to a 3.6 m lip, a gap, a landing mound
  //                with a long downslope), and across the north end a tabletop half as big again
  //   east side  - a big tabletop (13 m faces up to a 4 m deck 16 m long: jump it, or land on the far face), a step-up
  //                in the south-east, a whoops lane along the north-east wall
  //   west side  - the car crush: a kicker, six junk cars side by side, a kicker back down (the cars flatten under
  //                load); a second tabletop in the south-west, a whoops lane along the wall, a step-up in the north-west
  //                (up a steep face onto a 2.8 m deck, off down a long ramp)
  //   south end  - moguls: three 1.2 m whoops across the floor
  //   corners    - banked up to 2.4 m against the wall, for sliding round
  const ARENA = { HW: 96, HL: 184, CR: 48, SPAWN_X: 0, SPAWN_Z: 108 };
  const CRUSH_X = -52;                      // the car-crush lane (x of the junk cars)
  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const dsstep = (a, b, x) => { const t = (x - a) / (b - a); return t <= 0 || t >= 1 ? 0 : 6 * t * (1 - t) / (b - a); };
  // signed distance to the wall line (negative inside the floor)
  function arenaSD(x, z) {
    const A = ARENA, qx = Math.abs(x) - (A.HW - A.CR), qz = Math.abs(z) - (A.HL - A.CR);
    const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0) - A.CR;
  }
  // obstacle profiles along their length u (metres): height and slope
  const PR = {
    // tabletop: power-curve faces (steepening to ~28 deg at the lips), flat deck
    table(u, o) { const L = 13, H = 4, T = 16, p = 1.7, E = 2 * L + T;
      if (u <= 0 || u >= E) { o.d = 0; return 0; }
      if (u < L) { const s = u / L; o.d = H * p * Math.pow(s, p - 1) / L; return H * Math.pow(s, p); }
      if (u > L + T) { const s = (E - u) / L; o.d = -H * p * Math.pow(s, p - 1) / L; return H * Math.pow(s, p); }
      o.d = 0; return H; },
    // car crush: a 1.3 m kicker, a rounded drop to the floor just before the cars, the cars (their own heights), and
    // the same kicker the other way
    crush(u, o) { const L = 7, H = 1.3, p = 1.6, D = 1.5, E = 29.4;
      const k = (w) => { if (w <= 0) return [0, 0]; if (w < L) { const s = w / L; return [H * Math.pow(s, p), H * p * Math.pow(s, p - 1) / L]; }
        if (w < L + D) { const s = (w - L) / D; return [H * (1 - s * s), -2 * H * s / D]; } return [0, 0]; };
      if (u <= 0 || u >= E) { o.d = 0; return 0; }
      if (u < E / 2) { const r = k(u); o.d = r[1]; return r[0]; }
      const r = k(E - u); o.d = -r[1]; return r[0]; },
    // the big gap jump: a kicker (11 m up to a 3.6 m lip, ~30 deg), a 5 m gap, then a landing mound - a steep near face,
    // a short deck and a long, gentle downslope to land on. Too slow and you case it into the mound
    gap(u, o) { const L = 11, H = 3.6, p = 1.8, D = 1.5, G = 5, F = 3, T = 2, B = 14, HL = 3.2;
      if (u <= 0 || u >= L + D + G + F + T + B) { o.d = 0; return 0; }
      if (u < L) { const s = u / L; o.d = H * p * Math.pow(s, p - 1) / L; return H * Math.pow(s, p); }
      if (u < L + D) { const s = (u - L) / D; o.d = -2 * H * s / D; return H * (1 - s * s); }
      let w = u - L - D - G;
      if (w < 0) { o.d = 0; return 0; }
      if (w < F) { o.d = HL * dsstep(0, F, w); return HL * sstep(0, F, w); }
      w -= F;
      if (w < T) { o.d = 0; return HL; }
      w -= T; o.d = -HL * dsstep(0, B, w); return HL * (1 - sstep(0, B, w)); },
    // step-up: a steep face up onto a deck, then a long ramp back down (jump off the deck or roll it)
    step(u, o) { const L = 8, H = 2.8, p = 1.6, T = 10, B = 14, E = L + T + B;
      if (u <= 0 || u >= E) { o.d = 0; return 0; }
      if (u < L) { const s = u / L; o.d = H * p * Math.pow(s, p - 1) / L; return H * Math.pow(s, p); }
      if (u < L + T) { o.d = 0; return H; }
      const w = u - L - T; o.d = -H * dsstep(0, B, w); return H * (1 - sstep(0, B, w)); },
    // a plain kicker (All Ramps): 9 m up to a 1.7 m lip, rounded off - land on the flat
    kick(u, o) { const L = 9, H = 1.7, p = 1.6, D = 1.4;
      if (u <= 0 || u >= L + D) { o.d = 0; return 0; }
      if (u < L) { const s = u / L; o.d = H * p * Math.pow(s, p - 1) / L; return H * Math.pow(s, p); }
      const s = (u - L) / D; o.d = -2 * H * s / D; return H * (1 - s * s); },
    // moguls: a row of whoops (three, or ob.n)
    mogul(u, o, ob) { const W = 7, H = 1.2, E = (ob.n || 3) * W;
      if (u <= 0 || u >= E) { o.d = 0; return 0; }
      const a = Math.PI * u / W, s = Math.sin(a); o.d = H * 2 * s * Math.cos(a) * Math.PI / W; return H * s * s; },
  };
  // obstacles: centre-line start (x0, z0), direction (fx, fz), length (x sc, the scale: 1.3 = a third longer and higher),
  // half width (flat part + falloff `bev`). The first gap / table / step / mogul of each kind is the one the tests use
  const GAP = { kind: 'gap', len: 36.5, hw: 7.5, bev: 3.5 }, TABLE = { kind: 'table', len: 42, hw: 10.5, bev: 6 }, STEP = { kind: 'step', len: 32, hw: 8, bev: 3.5 };
  const KICK = { kind: 'kick', len: 10.4, hw: 4.5, bev: 1.8 };
  const ob = (base, o) => Object.assign({}, base, o, { len: (o.len || base.len) * (o.sc || 1) });
  const LAYOUTS = {
    arena: [
      ob(GAP, { x0: 0, z0: -54, fx: 0, fz: -1 }),                                          // the big gap jump (north)
      ob(TABLE, { x0: 52, z0: -21, fx: 0, fz: 1 }),                                        // east tabletop
      { kind: 'crush', x0: CRUSH_X, z0: -14.7, fx: 0, fz: 1, len: 29.4, hw: 6.2, bev: 2.6 },
      ob(STEP, { x0: -56, z0: -84, fx: 0, fz: -1 }),                                       // north-west step-up
      { kind: 'mogul', x0: 0, z0: 126, fx: 0, fz: 1, len: 21, hw: 40, bev: 5 },           // south moguls
      { kind: 'mogul', n: 4, x0: 78, z0: -82, fx: 0, fz: -1, len: 28, hw: 6, bev: 2.5 },   // north-east whoops lane
      ob(GAP, { x0: 0, z0: 58, fx: 0, fz: -1 }),                                           // the first gap jump off the spawn
      ob(TABLE, { x0: -52, z0: 52, fx: 0, fz: 1 }),                                        // south-west tabletop
      ob(STEP, { x0: 56, z0: 60, fx: 0, fz: 1 }),                                          // south-east step-up
      { kind: 'mogul', n: 5, x0: -82, z0: -40, fx: 0, fz: 1, len: 35, hw: 6, bev: 2.5 },   // west whoops lane
      ob(TABLE, { x0: -30, z0: -140, fx: 1, fz: 0, sc: 1.4, hw: 12 }),                     // the big tabletop across the north end
    ],
  };
  // (bounding boxes for quick rejection, and for the renderer's meshes)
  function bbox(o) {
    const b = Object.assign({}, o), ex = [b.x0, b.x0 + b.fx * b.len], ez = [b.z0, b.z0 + b.fz * b.len], rx = -b.fz, rz = b.fx;
    b.minX = Math.min(...ex) - Math.abs(rx) * b.hw; b.maxX = Math.max(...ex) + Math.abs(rx) * b.hw;
    b.minZ = Math.min(...ez) - Math.abs(rz) * b.hw; b.maxZ = Math.max(...ez) + Math.abs(rz) * b.hw;
    return b;
  }
  const ARENA_OBS = LAYOUTS.arena.map(bbox);
  // junk cars on the crush lane: long axis across the lane, side by side along it. Each car carries a grid of dent depths
  // (metres, CNA x CNB nodes over its length and width) that the tyres push in wherever they bear on it - the surface
  // is the car's shape minus the (smoothly interpolated) dents, so the tyres leave real tracks and dents
  const CAR_L = 2.35, CAR_W = 0.92, CNA = 25, CNB = 11;
  const ARENA_CARS = [];
  const _cb = { h0: 0, hb: 0 };
  // the undamaged car: h0 = its height, hb = the body alone (hood / trunk / sills up to the belt line, no cabin)
  function carBase(c, a, b, o) {
    const aa = Math.abs(a), ab = Math.abs(b);
    if (aa >= CAR_L || ab >= CAR_W) { o.h0 = 0; o.hb = 0; return o; }
    const cab0 = -0.75 + 0.15 * c.shape, cab1 = 1.35;                        // windshield base .. rear window base
    const hb = 0.5 + 0.42 * (1 - sstep(1.85, CAR_L, aa));                   // bumpers low, hood / trunk / sills
    const hc = 0.45 * sstep(cab0, cab0 + 0.55, a) * (1 - sstep(cab1 - 0.5, cab1, a));
    const f = 1 - sstep(0.76, CAR_W, ab), gC = 1 - sstep(0.52, 0.74, ab);
    o.hb = hb * f; o.h0 = (hb + hc * gC) * f; return o;
  }
  for (let k = 0; k < 6; k++) {
    const c = { x: CRUSH_X, z: -4.75 + 1.9 * k, flip: k % 2 ? -1 : 1, hue: hash01(k, 7, 911), shape: hash01(k, 3, 912),
      dent: new Float32Array(CNA * CNB), h0: new Float32Array(CNA * CNB), hb: new Float32Array(CNA * CNB), ver: 0, level: 0, cab: 0, dd: 0, glassEv: 0, glassN: 0 };
    for (let ia = 0; ia < CNA; ia++) for (let ib = 0; ib < CNB; ib++) {
      carBase(c, -CAR_L + 2 * CAR_L * ia / (CNA - 1), -CAR_W + 2 * CAR_W * ib / (CNB - 1), _cb);
      c.h0[ia * CNB + ib] = _cb.h0; c.hb[ia * CNB + ib] = _cb.hb;
    }
    ARENA_CARS.push(c);
  }
  function carDent(c, a, b) {                   // interpolated dent depth at (a, b) in the car's own frame
    const fa = Math.min(CNA - 1.0001, Math.max(0, (a + CAR_L) / (2 * CAR_L) * (CNA - 1)));
    const fb = Math.min(CNB - 1.0001, Math.max(0, (b + CAR_W) / (2 * CAR_W) * (CNB - 1)));
    const ia = Math.floor(fa), ib = Math.floor(fb), ta = fa - ia, tb = fb - ib, d = c.dent, i0 = ia * CNB + ib;
    return (d[i0] * (1 - tb) + d[i0 + 1] * tb) * (1 - ta) + (d[i0 + CNB] * (1 - tb) + d[i0 + CNB + 1] * tb) * ta;
  }
  const _po = { d: 0 };
  function carHeight(c, x, z, g) {
    const a = (x - c.x) * c.flip, b = z - c.z;
    if (Math.abs(a) >= CAR_L || Math.abs(b) >= CAR_W) return 0;
    carBase(c, a, b, _cb);
    const h = Math.max(0, _cb.h0 - carDent(c, a, b));
    if (g) {                                                                  // gradient (numeric: it's only 12 small cars)
      const e = 0.03, hx = carHeight(c, x + e, z, null) - carHeight(c, x - e, z, null), hz = carHeight(c, x, z + e, null) - carHeight(c, x, z - e, null);
      g.x = hx / (2 * e); g.z = hz / (2 * e);
    }
    return h;
  }
  const _ag = { x: 0, z: 0 }, _cg = { x: 0, z: 0 }, _og = { x: 0, z: 0 };
  // one obstacle's height at (x, z) (0 off it), its gradient in _og
  function obHeight(ob, x, z) {
    if (x < ob.minX || x > ob.maxX || z < ob.minZ || z > ob.maxZ) return 0;
    const dx = x - ob.x0, dz = z - ob.z0, u = dx * ob.fx + dz * ob.fz, v = dx * -ob.fz + dz * ob.fx, av = Math.abs(v);
    if (av >= ob.hw) return 0;
    const sc = ob.sc || 1, p = PR[ob.kind](u / sc, _po, ob) * sc;
    if (p <= 0) return 0;
    const side = 1 - sstep(ob.hw - ob.bev, ob.hw, av), ds = -dsstep(ob.hw - ob.bev, ob.hw, av) * (v < 0 ? -1 : 1);
    const du = _po.d * side, dv = p * ds;                                     // along u and across (v axis = (-fz, fx))
    _og.x = du * ob.fx - dv * ob.fz; _og.z = du * ob.fz + dv * ob.fx;
    return p * side;
  }
  /** Height of the arena's obstacles above the flat floor at (x, z); gradient in _ag. (noCars: the dirt only - the
   *  renderer meshes the junk cars separately) */
  function arenaHeight(x, z, noCars) {
    const A = ARENA;
    let best = 0; _ag.x = 0; _ag.z = 0;
    if (Math.abs(x) > A.HW + 1 || Math.abs(z) > A.HL + 1) return 0;
    for (let i = 0; i < ARENA_OBS.length; i++) {
      const h = obHeight(ARENA_OBS[i], x, z);
      if (h > best) { best = h; _ag.x = _og.x; _ag.z = _og.z; }
    }
    // banked corners: the floor curls up against the wall (2.4 m), fading in and out along each corner's arc
    const cx = Math.abs(x) - (A.HW - A.CR), cz = Math.abs(z) - (A.HL - A.CR);
    if (cx > 0 && cz > 0) {
      const r = Math.sqrt(cx * cx + cz * cz), d = A.CR - r;                  // distance in from the wall
      if (d < 11 && r > 1e-3) {
        const ang = Math.atan2(cz, cx), m = Math.min(ang, Math.PI / 2 - ang), w = sstep(0, 0.35, m);
        const q = Math.max(0, 1 - Math.max(d, 0) / 11), h = 2.4 * q * q * w;
        if (h > best) {
          best = h;
          // slope: up towards the wall (dh/dr) and along the arc where it fades in / out (dh/dangle)
          const dr = 2.4 * w * 2 * q / 11 * (d > 0 ? 1 : 0), da = 2.4 * q * q * dsstep(0, 0.35, m) * (ang < Math.PI / 4 ? 1 : -1);
          const hcx = dr * cx / r - da * cz / (r * r), hcz = dr * cz / r + da * cx / (r * r);
          _ag.x = hcx * (x < 0 ? -1 : 1); _ag.z = hcz * (z < 0 ? -1 : 1);
        }
      }
    }
    // the junk cars
    if (!noCars && Math.abs(x - CRUSH_X) < CAR_L + 0.1 && Math.abs(z) < 6.5) {
      for (let i = 0; i < ARENA_CARS.length; i++) {
        const c = ARENA_CARS[i];
        if (Math.abs(z - c.z) >= CAR_W) continue;
        const h = carHeight(c, x, z, _cg);
        if (h > best) { best = h; _ag.x = _cg.x; _ag.z = _cg.z; }
      }
    }
    return best;
  }
  /** A tyre loaded with fz newtons at (x, z) bearing on a junk car: dents it under and around the tyre. How far depends
   *  on the load and on what's underneath - the roof and pillars fold at the first real weight (down to the belt line),
   *  the body (hood, trunk, doors) gives way gradually as the load climbs, to ~45 % of its height under a landing -
   *  and the sheet metal drags the area round the tyre down with it. The metal yields over a few tenths of a second,
   *  never springs back. Returns the car index if anything moved, else -1; the car's `dd` (depth crushed since the game
   *  last looked), `level` (how flat it is overall, 0-1) and `glassEv` (the cabin just caved in: glass) go with it. */
  function arenaCrush(x, z, fz, dt) {
    if (Math.abs(x - CRUSH_X) > CAR_L + 0.6 || Math.abs(z) > 6.8 || fz < 2500) return -1;
    const kBody = Math.max(0, Math.min(1, (fz - 6000) / 22000)), R = 0.95;
    let hit = -1;
    for (let i = 0; i < ARENA_CARS.length; i++) {
      const c = ARENA_CARS[i], a = (x - c.x) * c.flip, b = z - c.z;
      if (Math.abs(a) > CAR_L + 0.4 || Math.abs(b) > CAR_W + 0.4) continue;
      let moved = 0;
      const ia0 = Math.max(0, Math.floor((a - R + CAR_L) / (2 * CAR_L) * (CNA - 1))), ia1 = Math.min(CNA - 1, Math.ceil((a + R + CAR_L) / (2 * CAR_L) * (CNA - 1)));
      for (let ia = ia0; ia <= ia1; ia++) {
        const da = -CAR_L + 2 * CAR_L * ia / (CNA - 1) - a;
        for (let ib = 0; ib < CNB; ib++) {
          const db = -CAR_W + 2 * CAR_W * ib / (CNB - 1) - b, dist = Math.sqrt(da * da + db * db);
          if (dist >= R) continue;
          const k = ia * CNB + ib, h0 = c.h0[k];
          if (h0 < 0.03) continue;
          const hEq = Math.min(h0, c.hb[k] * (1 - 0.55 * kBody));
          const dT = (h0 - hEq) * (1 - sstep(0.3, R, dist));
          if (dT > c.dent[k] + 1e-4) { const inc = (dT - c.dent[k]) * Math.min(1, dt * 9); c.dent[k] += inc; moved += inc; }
        }
      }
      if (moved > 0) {
        c.ver++; c.dd += moved / 6; hit = i;
        let sum = 0, n = 0, cabD = 0, cabH = 0;
        for (let k = 0; k < CNA * CNB; k++) {
          if (c.h0[k] < 0.05) continue;
          sum += c.dent[k] / c.h0[k]; n++;
          const hc = c.h0[k] - c.hb[k];
          if (hc > 0.1) { cabD += Math.min(c.dent[k], hc); cabH += hc; }
        }
        c.level = n ? sum / n : 0; c.cab = cabH ? cabD / cabH : 0;
        // the pillars go together: once part of the roof has folded, the rest of it comes down with it
        if (c.cab > 0.2) {
          const kk = Math.min(1, (c.cab - 0.2) / 0.45) * 0.9, rate = Math.min(1, dt * 5);
          for (let k = 0; k < CNA * CNB; k++) {
            const hc = c.h0[k] - c.hb[k];
            if (hc > 0.04 && hc * kk > c.dent[k]) c.dent[k] += (hc * kk - c.dent[k]) * rate;
          }
        }
        // glass bursts as the cabin folds: the first windows go at a quarter caved, the rest at two thirds
        if (c.glassN === 0 && c.cab > 0.25) { c.glassN = 1; c.glassEv = 1; }
        else if (c.glassN === 1 && c.cab > 0.66) { c.glassN = 2; c.glassEv = 1; }
      }
    }
    return hit;
  }
  // ---------------------------------------------------------------- All Ramps ('ramps')
  // The whole world is groomed dirt, flat to the horizon and covered in jumps - no stadium, no walls. A 96 m grid of
  // cells, each with one dirt obstacle: the arena's gap jumps, tabletops, step-ups and moguls, or a plain kicker, a bit
  // bigger or smaller than the arena's (x0.75-1.3), pointing any of the four ways and jittered off the grid - every one
  // fits inside its cell, so the ground only ever looks at one. The spawn's cell is empty, with a gap jump dead ahead
  const RCELL = 96, RAMPS_SPAWN = { x: 48, z: 150 };
  const jumpCache = new Map();
  function jumpInCell(i, j) {
    const key = i * 100003 + j;
    let o = jumpCache.get(key);
    if (o !== undefined) return o;
    o = null;
    const spawnCell = i === 0 && j === 1, ahead = i === 0 && j === 0;
    if (!spawnCell && (ahead || hash01(i, j, 611) < 0.95)) {
      const r = hash01(i, j, 612), d = ahead ? 0 : Math.floor(hash01(i, j, 613) * 4);
      const base = ahead ? GAP : r < 0.27 ? TABLE : r < 0.5 ? GAP : r < 0.67 ? STEP : r < 0.84 ? KICK : null;
      const sc = ahead ? 1 : 0.75 + 0.55 * hash01(i, j, 614);
      let b;
      if (base) b = Object.assign({}, base, { sc, len: base.len * sc });
      else { const n = 3 + Math.floor(hash01(i, j, 615) * 3); b = { kind: 'mogul', n, len: n * 7, hw: 7 + 6 * hash01(i, j, 616), bev: 2.5 }; }
      b.fx = [0, 1, 0, -1][d]; b.fz = [-1, 0, 1, 0][d];
      const cx = (i + 0.5) * RCELL + (ahead ? 0 : (hash01(i, j, 617) - 0.5) * 10), cz = (j + 0.5) * RCELL + (ahead ? 0 : (hash01(i, j, 618) - 0.5) * 10);
      b.x0 = cx - b.fx * b.len / 2; b.z0 = cz - b.fz * b.len / 2;
      o = bbox(b);
    }
    jumpCache.set(key, o);
    if (jumpCache.size > 6000) jumpCache.delete(jumpCache.keys().next().value);
    return o;
  }
  /** The jumps whose middles lie in chunk (cx, cz) (for the renderer and the minimap). */
  function jumpsInChunk(cx, cz) {
    const CH = C.CHUNK, x0 = cx * CH, z0 = cz * CH, out = [];
    if (MAP !== 'ramps') return out;
    for (let i = Math.floor(x0 / RCELL); i <= Math.floor((x0 + CH - 1e-6) / RCELL); i++) {
      for (let j = Math.floor(z0 / RCELL); j <= Math.floor((z0 + CH - 1e-6) / RCELL); j++) {
        const o = jumpInCell(i, j); if (!o) continue;
        const mx = o.x0 + o.fx * o.len / 2, mz = o.z0 + o.fz * o.len / 2;
        if (mx >= x0 && mx < x0 + CH && mz >= z0 && mz < z0 + CH) out.push(o);
      }
    }
    return out;
  }
  /** Height of the jump at (x, z) above the flat dirt; gradient in g (if given) */
  function jumpHeight(x, z, g) {
    const o = jumpInCell(Math.floor(x / RCELL), Math.floor(z / RCELL)), h = o ? obHeight(o, x, z) : 0;
    if (g) { g.x = h > 0 ? _og.x : 0; g.z = h > 0 ? _og.z : 0; }
    return h;
  }

  function arenaResetCars() { for (const c of ARENA_CARS) { c.dent.fill(0); c.ver++; c.level = 0; c.cab = 0; c.dd = 0; c.glassEv = 0; c.glassN = 0; } }

  // ---------------------------------------------------------------- terrain height
  function lowHeight(x, z) {
    if (STRAIGHT() || MAP === 'tarmac' || MAP === 'arena' || MAP === 'mowtrack' || MAP === 'ramps' || MAP === 'dunes' || TRK) return 0;
    return nLow1(x * 0.00085, z * 0.00085) * 20 + nLow2(x * 0.0024 + 11.3, z * 0.0024 - 7.1) * 6;
  }
  function ridged(x, z) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      let n = 1 - Math.abs(nRidge(x * f, z * f));
      n *= n;
      sum += n * amp; norm += amp;
      amp *= 0.5; f *= 2.03;
    }
    return sum / norm;
  }
  const _ri = {};
  function terrainHeight(x, z, ri) {
    if (MAP === 'tarmac' || MAP === 'arena' || MAP === 'ramps') return 0;
    if (MAP === 'dunes') {
      // (the hardpan: dead flat at the swell's height in the middle of it, the dunes rising round it)
      const m = smooth(DUNES.CAMP_R, DUNES.CAMP_E, duneCampD(x, z)), h0 = duneSwell(0, 0);
      return m > 0 ? h0 + (duneHeight(x, z) - h0) * m : h0;
    }
    if (TRK) {
      if (TRK.kind === 'offroad') return offTerrain(x, z);
      if (TRK.kind === 'mow') {
        // (the windy mower course: a dead flat field like the oval's, rolling country well back from it)
        const d = Math.hypot(x - TRK.cx, (z - TRK.cz) * 0.8);
        if (d < 200) return 0;
        return smooth(200, 800, d) * ((nHill(x * 0.0022, z * 0.0022) + 0.6) * 24 + nDet(x * 0.02, z * 0.02) * 1.2);
      }
      // a rally stage: the road rides the smooth big-scale ground (flat across, whatever the grade); off the verge a shallow
      // ditch, then the land's own knolls and hills blend in over ~35 m - cuttings on one side, drops on the other
      // (level across: on the road the height is the ground's at the centre line, easing back into the ground's own over
      // 12 m of verge - a road cut along a slope instead of one tilted with it)
      const q = trackQuery(x, z, _ttq), d = q.d, hw = TRK.W / 2;
      let base = trackBase(x, z);
      if (d < hw + 12) { const bc = trackBase(q.px, q.pz) + trackYump(q.s); base = bc + (base - bc) * smooth(hw + 0.5, hw + 12, d); }
      if (d <= hw + 0.8) return base;
      const m = smooth(hw + 0.8, 36, d);
      const det = nDet(x * 0.028, z * 0.028) * 1.1 + nDet(x * 0.085 + 5.2, z * 0.085 - 3.3) * 0.28;
      const hills = (nHill(x * 0.0031, z * 0.0031) + 0.5 * nHill(x * 0.0071 + 3.1, z * 0.0071 - 1.7)) * (14 + 8 * TRK.steep);
      return base + m * (det + hills) - 0.3 * Math.exp(-Math.pow((d - hw - 2.3) / 1.2, 2));
    }
    if (MAP === 'mowtrack') {
      // dead flat round the field, rolling country well back from it
      const d = Math.hypot(x, z * 0.8);
      if (d < 200) return 0;
      return smooth(200, 800, d) * ((nHill(x * 0.0022, z * 0.0022) + 0.6) * 24 + nDet(x * 0.02, z * 0.02) * 1.2);
    }
    if (STRAIGHT()) {
      // dead flat around the strip, gentle hills far off for scenery
      const d = Math.abs(x);
      if (d < 160) return 0;
      const m = smooth(160, 900, d);
      return m * ((nHill(x * 0.0022, z * 0.0022) + 0.6) * 28 + nDet(x * 0.02, z * 0.02) * 1.5);
    }
    ri = ri || roadInfo(x, z, _ri);
    const d = ri.d;
    const h = lowHeight(x, z);
    if (d <= C.FLAT) return h;
    const m = smooth(C.FLAT, 40, d);
    const m2 = smooth(12, 110, d);
    const det = nDet(x * 0.028, z * 0.028) * 1.1 + nDet(x * 0.085 + 5.2, z * 0.085 - 3.3) * 0.28;
    const hills = (nHill(x * 0.0031, z * 0.0031) + 0.5 * nHill(x * 0.0071 + 3.1, z * 0.0071 - 1.7)) * 17;
    let mount = 0;
    const mm = smooth(90, 460, d);
    if (mm > 0) {
      const region = smooth(-0.1, 0.5, nRegion(x * 0.00021, z * 0.00021));
      if (region > 0) { const r = ridged(x * 0.00085, z * 0.00085); mount = r * r * 190 * region * mm; }
    }
    let lake = 0;
    const lm = smooth(45, 220, d);
    if (lm > 0) {
      const l = nLake(x * 0.00105, z * 0.00105);
      if (l > 0.3) lake = smooth(0.3, 0.72, l) * 60 * lm;
    }
    return h + m * det + m2 * hills + mount - lake;
  }

  // an offroad course: level across at its own ground, a berm up round the outside of each tighter corner, blending back
  // into the land over the verge
  function offTerrain(x, z) {
    const nat = offNatural(x, z), q = trackQuery(x, z, _ttq);
    if (q.i < 0) return nat;
    const T = TRK, hw = T.W / 2, d = q.d, hc = offProfileAt(q.s);
    let y = d <= hw + 0.5 ? hc : hc + (nat - hc) * smooth(hw + 0.5, hw + T.B.verge, d);
    const R = T.R[q.i];
    if (Math.abs(R) < 45 && q.sd * R > 0) {          // (the outside: right of the line on a left-hander)
      const b = 0.95 * Math.min(1, (45 - Math.abs(R)) / 25);
      y += b * smooth(hw - 2, hw + 0.8, d) * (1 - smooth(hw + 2.5, hw + 6, d));
    }
    return y;
  }

  // physics-grid height cache (LOD0 grid vertices)
  const gridCache = new Map();
  function gridHeight(ix, iz) {
    const key = (ix + 1048576) * 2097152 + (iz + 1048576);
    let h = gridCache.get(key);
    if (h === undefined) {
      h = terrainHeight(ix * C.GRID, iz * C.GRID);
      if (gridCache.size > 60000) gridCache.clear();
      gridCache.set(key, h);
    }
    return h;
  }

  const _gri = {};
  /** Ground query matching the LOD0 render mesh triangulation. */
  function ground(x, z, out) {
    const G = C.GRID;
    const gx = x / G, gz = z / G;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const ha = gridHeight(ix, iz), hb = gridHeight(ix + 1, iz), hc = gridHeight(ix, iz + 1), hd = gridHeight(ix + 1, iz + 1);
    let h, dx, dz;
    if (fx + fz <= 1) { h = ha + (hb - ha) * fx + (hc - ha) * fz; dx = (hb - ha) / G; dz = (hc - ha) / G; }
    else { h = hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz); dx = (hd - hc) / G; dz = (hd - hb) / G; }
    if (MAP === 'country' || MAP === 'tarmac') {
      const rs = rampsNear(x, z);
      for (let i = 0; i < rs.length; i++) {
        const rh = rampHeight(rs[i], x, z);
        if (rh > 0) { h += rh; dx += _rg.x; dz += _rg.z; break; }
      }
    } else if (MAP === 'arena') {
      const ah = arenaHeight(x, z);
      if (ah > 0) { h += ah; dx += _ag.x; dz += _ag.z; }
    } else if (MAP === 'ramps') {
      const jh = jumpHeight(x, z, null);
      if (jh > 0) { h += jh; dx += _og.x; dz += _og.z; }
    }
    const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    out.h = h; out.nx = -dx * il; out.ny = il; out.nz = -dz * il;
    if (MAP === 'tarmac') { out.roadD = 0; out.surface = PREP ? 5 : 0; return out; }   // All Road: it's all asphalt (prepped)
    if (MAP === 'mowtrack') { out.roadD = 1e4; out.surface = Math.abs(mowtD(x, z)) < MOWT.W / 2 ? 3 : 2; return out; }   // dirt oval, grass
    if (MAP === 'arena') { out.roadD = 1e4; out.surface = arenaSD(x, z) < 0 ? 3 : 0; return out; }   // clay floor, concrete outside
    if (MAP === 'ramps') { out.roadD = 1e4; out.surface = 3; return out; }   // All Ramps: groomed dirt everywhere
    if (MAP === 'dunes') { out.roadD = 1e4; out.surface = duneCampD(x, z) < DUNES.CAMP_R + 3 ? 3 : 6; return out; }   // sand, the packed hardpan
    if (TRK && TRK.kind === 'offroad') {
      // an offroad course: dunes all sand; the forest's dirt with mud holes in the dips; the desert's hardpack with sandy
      // washes across it, gravel at its edges, sand and gravel patches off it; the bog mud but for firm dirt over the
      // rises; the mountain's gravel, grass off it but gravel and scree on the steep bits
      const q = trackQuery(x, z, _gtq), d = q.d, hw = TRK.W / 2, b = TRK.biome, zn = q.i >= 0 ? TRK.zone[q.i] : 0, nz = nDet(x * 0.05 + 40, z * 0.05);
      out.roadD = d;
      if (d < hw + 0.4) out.surface = b === 'dunes' ? 6 : b === 'forest' ? (zn === 1 ? 4 : 3) : b === 'desert' ? (zn === 2 ? 6 : 3) : b === 'mud' ? (zn === 3 ? 3 : 4) : 1;
      else if (b === 'dunes') out.surface = 6;
      else if (b === 'desert') out.surface = d < hw + 2.5 ? 1 : nz > 0.35 ? 6 : nz < -0.4 ? 1 : 3;
      else if (b === 'mud') out.surface = d < hw + 2 || nz > 0.5 ? 4 : 2;
      else if (b === 'mountain') out.surface = 1 - out.ny > 0.25 || d < hw + 2 ? 1 : 2;
      else out.surface = d < hw + 1.5 || nz > 0.45 ? 3 : 2;
      return out;
    }
    if (TRK) {
      // rally stages: a gravel road (with a strip of loose stuff along its edges); the mower course: dirt. Grass or dirt off it
      const d = trackQuery(x, z, _gtq).d;
      out.roadD = d;
      out.surface = TRK.kind === 'mow' ? (d < TRK.W / 2 ? 3 : 2) : d < TRK.W / 2 + 0.6 ? 1 : nDet(x * 0.05 + 40, z * 0.05) > 0.45 ? 3 : 2;
      return out;
    }
    // surface
    const ri = roadInfo(x, z, _gri);
    out.roadD = ri.d;
    if (DRAGMAP() && Math.abs(x) < DRAG.HALF) out.surface = MAP === 'dirtdrag' ? 3 : 5;   // prepped drag strip / groomed dirt
    else if (h < C.WATER_LEVEL - 0.2) out.surface = 4;          // lake bed / water
    else if (ri.d < C.ROAD_HALF) out.surface = PREP ? 5 : 0;   // asphalt (prepped)
    else if (ri.d < C.SHOULDER) out.surface = 1;           // gravel shoulder
    else out.surface = (nDet(x * 0.05 + 40, z * 0.05) > 0.45) ? 3 : 2; // dirt / grass
    return out;
  }

  // ---------------------------------------------------------------- vegetation / props
  function forestDensity(x, z) {
    if (MAP === 'tarmac' || MAP === 'arena' || MAP === 'ramps' || MAP === 'dunes') return 0;
    if (MAP === 'mowtrack') return 0.7 * smooth(150, 330, Math.hypot(x, z)) * smooth(0.0, 0.5, nForest(x * 0.002, z * 0.002) + 0.3);
    if (TRK && TRK.kind === 'offroad') {
      // (woods right up to the course in the forest; pines up the mountain; a few trees about the bog; none in the sand)
      const b = TRK.biome;
      if (b === 'dunes' || b === 'desert') return 0;
      const X = x + OFFX, Z = z + OFFZ, f = nForest(X * 0.0016, Z * 0.0016) * 0.75 + nForest2(X * 0.0062, Z * 0.0062) * 0.35;
      const base = b === 'forest' ? 0.6 + 0.4 * smooth(-0.3, 0.3, f) : b === 'mountain' ? 0.2 + 0.55 * smooth(-0.2, 0.4, f) : 0.06 + 0.3 * smooth(0, 0.5, f);
      return base * smooth(TRK.W / 2 + 3, TRK.W / 2 + 9, trackQuery(x, z, _ftq).d);
    }
    if (TRK) {
      if (TRK.kind === 'mow') return 0.7 * smooth(150, 330, Math.hypot(x - TRK.cx, z - TRK.cz)) * smooth(0.0, 0.5, nForest(x * 0.002, z * 0.002) + 0.3);
      // rally stages: woods, with fields opening up on the fast one; the windy one is forest nearly all the way, right up
      // to a few metres off the verge
      const f = nForest(x * 0.0016, z * 0.0016) * 0.75 + nForest2(x * 0.0062, z * 0.0062) * 0.35;
      const base = TRK.steep ? 0.55 + 0.45 * smooth(-0.3, 0.3, f) : 0.15 + 0.85 * smooth(-0.3, 0.3, f);
      return base * smooth(TRK.W / 2 + 2.5, TRK.W / 2 + 9, trackQuery(x, z, _ftq).d);
    }
    if (STRAIGHT()) { const d = Math.abs(x) - (DRAGMAP() ? 25 : 0); return d < 40 ? 0 : 0.45 * smooth(40, 200, d) * smooth(0.0, 0.5, nForest(x * 0.002, z * 0.002) + 0.3); }
    const f = nForest(x * 0.0016, z * 0.0016) * 0.75 + nForest2(x * 0.0062, z * 0.0062) * 0.35;
    return smooth(0.02, 0.55, f);
  }

  const propCache = new Map();
  /** Deterministic props for chunk (cx, cz). Trees: [x,y,z,scale,rot,kind] (kind 0 pine,1 oak,2 birch).
   *  Colliders: circles {x,z,r} and boxes {x,z,hx,hz,c,s}. */
  function chunkProps(cx, cz) {
    const key = cx * 100003 + cz;
    let cp = propCache.get(key);
    if (cp) return cp;
    const CH = C.CHUNK, x0 = cx * CH, z0 = cz * CH;
    const trees = [], bushes = [], rocks = [], buildings = [], poles = [], signs = [], labels = [], lines = [], walls = [];
    const circles = [], boxes = [];
    const ri = {};
    if (MAP === 'arena' || MAP === 'ramps' || MAP === 'dunes') {
      if (MAP === 'arena') for (const b of arenaWalls()) if (b.x >= x0 && b.x < x0 + CH && b.z >= z0 && b.z < z0 + CH) boxes.push(b);
      cp = { trees: new Float32Array(0), bushes: new Float32Array(0), rocks: new Float32Array(0), buildings, poles, signs, labels, lines, walls, circles, boxes };
      propCache.set(key, cp);
      return cp;
    }
    if (TRK && TRK.kind === 'offroad') {
      // an offroad course: its furniture (corner boards, bales on the hairpins, the arch's legs, the jump signs), the
      // terrain's trees (none in the sand; saguaros dotted about the desert), bushes and rocks
      const T = TRK, hw = T.W / 2, tq = _ptq, TP = trackProps(), bm = T.biome, inC = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH;
      const chevrons = [], tr = [], rk = [], bu = [];
      for (const b of TP.bales) if (inC(b.x, b.z)) circles.push({ x: b.x, z: b.z, r: 0.6 });
      for (const c of TP.chevrons) if (inC(c.x, c.z)) { chevrons.push(c); circles.push({ x: c.x, z: c.z, r: 0.1 }); }
      for (const [lx, lz] of TP.arch.legs) if (inC(lx, lz)) circles.push({ x: lx, z: lz, r: 0.22 });
      for (const sg of TP.signs) if (inC(sg.x, sg.z)) { signs.push(sg); circles.push({ x: sg.x, z: sg.z, r: 0.06 }); }
      if (bm !== 'dunes' && bm !== 'desert') {
        const cell = 7, nc = CH / cell | 0;
        for (let a = 0; a < nc; a++) for (let b = 0; b < nc; b++) {
          const gx = cx * nc + a, gz = cz * nc + b, r1 = hash01(gx, gz, 1);
          const x = (a + 0.1 + 0.8 * hash01(gx, gz, 2)) * cell + x0, z = (b + 0.1 + 0.8 * hash01(gx, gz, 3)) * cell + z0;
          const dens = forestDensity(x, z);
          if (r1 > dens) continue;
          const d = trackQuery(x, z, tq).d;
          if (d < hw + 3 || (d < hw + 7 && r1 > dens * 0.5)) continue;
          const y = terrainHeight(x, z);
          if (bm === 'mountain' && y > 95 + 25 * hash01(gx, gz, 4)) continue;          // (the tree line)
          const sl = Math.max(Math.abs(terrainHeight(x + 2, z) - y), Math.abs(terrainHeight(x, z + 2) - y)) / 2; if (sl > 0.9) continue;
          const kn = nKind(x * 0.004, z * 0.004);
          const kind = bm === 'mountain' ? (kn > -0.55 ? 0 : 2) : bm === 'mud' ? (kn > 0.05 ? 1 : 2) : kn > 0.25 ? 0 : kn < -0.45 && hash01(gx, gz, 5) < 0.5 ? 2 : 1;
          const sc = 0.75 + hash01(gx, gz, 6) * 0.65;
          tr.push(x, y, z, sc, hash01(gx, gz, 7) * Math.PI * 2, kind);
          circles.push({ x, z, r: (kind === 0 ? 0.28 : kind === 2 ? 0.2 : 0.36) * sc });
        }
      }
      // (rocks, cacti, bushes: their chances per 11 m cell)
      const PR = { dunes: [0, 0, 0.025], forest: [0.05, 0, 0.33], desert: [0.07, 0.035, 0.2], mud: [0.015, 0, 0.38], mountain: [0.2, 0, 0.12] }[bm];
      const bcell = 11, nb = CH / bcell | 0;
      for (let a = 0; a < nb; a++) for (let b = 0; b < nb; b++) {
        const gx = cx * nb + a, gz = cz * nb + b;
        const x = (a + hash01(gx, gz, 21)) * bcell + x0, z = (b + hash01(gx, gz, 22)) * bcell + z0, r = hash01(gx, gz, 23);
        if (r >= PR[0] + PR[1] + PR[2]) continue;
        const d = trackQuery(x, z, tq).d;
        if (d < hw + 1.5) continue;
        const y = terrainHeight(x, z);
        if (r < PR[0]) {
          if (d < hw + 4) continue;
          const sz = (bm === 'mountain' ? 0.6 : 0.4) + hash01(gx, gz, 24) * (bm === 'mountain' ? 2.0 : 1.4);
          rk.push(x, y, z, sz, hash01(gx, gz, 25) * 6.283, hash01(gx, gz, 26));
          if (sz > 0.8) circles.push({ x, z, r: sz * 0.85 });
        } else if (r < PR[0] + PR[1]) {
          if (d < hw + 6) continue;
          const sc = 0.7 + hash01(gx, gz, 27) * 0.6;
          tr.push(x, y, z, sc, hash01(gx, gz, 28) * 6.283, 3);
          circles.push({ x, z, r: 0.3 * sc });
        } else bu.push(x, y, z, (bm === 'dunes' ? 0.35 : 0.6) + hash01(gx, gz, 27) * 0.9, hash01(gx, gz, 28) * 6.283, 0);
      }
      cp = { trees: new Float32Array(tr), bushes: new Float32Array(bu), rocks: new Float32Array(rk), buildings, poles, signs, labels, lines, walls, circles, boxes, chevrons };
      propCache.set(key, cp);
      if (propCache.size > 400) propCache.delete(propCache.keys().next().value);
      return cp;
    }
    if (TRK) {
      // the tracks: trees (not on the road or its verges), bushes and rocks, and the furniture - bales, corner boards, the
      // start arch's legs, the mower course's bleachers
      const T = TRK, hw = T.W / 2, tq = _ptq, TP = trackProps(), inC = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH;
      const chevrons = [];
      for (const b of TP.bales) if (inC(b.x, b.z)) circles.push({ x: b.x, z: b.z, r: 0.6 });
      for (const c of TP.chevrons) if (inC(c.x, c.z)) { chevrons.push(c); circles.push({ x: c.x, z: c.z, r: 0.1 }); }
      for (const [lx, lz] of TP.arch.legs) if (inC(lx, lz)) circles.push({ x: lx, z: lz, r: 0.22 });
      if (TP.stands) { const ST = TP.stands, sx = ST.x + ST.d / 2, sz = (ST.z0 + ST.z1) / 2; if (inC(sx, sz)) boxes.push({ x: sx, z: sz, hx: ST.d / 2, hz: (ST.z1 - ST.z0) / 2, c: 1, s: 0 }); }
      const tr = [], rk = [], bu = [], cell = T.kind === 'mow' ? 8 : 7, nc = CH / cell | 0;
      for (let a = 0; a < nc; a++) for (let b = 0; b < nc; b++) {
        const gx = cx * nc + a, gz = cz * nc + b, r1 = hash01(gx, gz, 1);
        const x = (a + 0.1 + 0.8 * hash01(gx, gz, 2)) * cell + x0, z = (b + 0.1 + 0.8 * hash01(gx, gz, 3)) * cell + z0;
        const dens = forestDensity(x, z);
        if (r1 > dens) continue;
        const d = trackQuery(x, z, tq).d;
        if (d < hw + 3 || (d < hw + 7 && r1 > dens * 0.5)) continue;
        const y = terrainHeight(x, z);
        if (T.kind !== 'mow') { const sl = Math.max(Math.abs(terrainHeight(x + 2, z) - y), Math.abs(terrainHeight(x, z + 2) - y)) / 2; if (sl > 0.9) continue; }
        const kn = nKind(x * 0.004, z * 0.004), kind = kn > 0.25 || (T.steep && kn > -0.1) ? 0 : kn < -0.45 && hash01(gx, gz, 5) < 0.5 ? 2 : 1, sc = 0.75 + hash01(gx, gz, 6) * 0.65;
        tr.push(x, y, z, sc, hash01(gx, gz, 7) * Math.PI * 2, kind);
        circles.push({ x, z, r: (kind === 0 ? 0.28 : kind === 2 ? 0.2 : 0.36) * sc });
      }
      if (T.kind !== 'mow') {
        const bcell = 11, nb = CH / bcell | 0;
        for (let a = 0; a < nb; a++) for (let b = 0; b < nb; b++) {
          const gx = cx * nb + a, gz = cz * nb + b;
          const x = (a + hash01(gx, gz, 21)) * bcell + x0, z = (b + hash01(gx, gz, 22)) * bcell + z0, r = hash01(gx, gz, 23);
          const d = trackQuery(x, z, tq).d;
          if (d < hw + 1.2) continue;
          const y = terrainHeight(x, z);
          if (r < 0.12 && d > hw + 4) {
            const sz = 0.4 + hash01(gx, gz, 24) * 1.4;
            rk.push(x, y, z, sz, hash01(gx, gz, 25) * 6.283, hash01(gx, gz, 26));
            if (sz > 0.8) circles.push({ x, z, r: sz * 0.85 });
          } else if (r < 0.4) bu.push(x, y, z, 0.6 + hash01(gx, gz, 27) * 0.9, hash01(gx, gz, 28) * 6.283, 0);
        }
      }
      cp = { trees: new Float32Array(tr), bushes: new Float32Array(bu), rocks: new Float32Array(rk), buildings, poles, signs, labels, lines, walls, circles, boxes, chevrons };
      propCache.set(key, cp);
      if (propCache.size > 400) propCache.delete(propCache.keys().next().value);
      return cp;
    }
    if (MAP === 'mowtrack') {
      // the bales (their colliders overlap into a wall), the start arch's legs, the bleachers, and woods well back
      for (const b of mowtrackBales()) if (b.x >= x0 && b.x < x0 + CH && b.z >= z0 && b.z < z0 + CH) circles.push({ x: b.x, z: b.z, r: 0.6 });
      for (const px of [MOWT.R - MOWT.W / 2 - 1.3, MOWT.R + MOWT.W / 2 + 1.3]) if (px >= x0 && px < x0 + CH && 0 >= z0 && 0 < z0 + CH) circles.push({ x: px, z: 0, r: 0.22 });
      const ST = MOWT.STANDS, sx = ST.x + ST.d / 2, sz = (ST.z0 + ST.z1) / 2;
      if (sx >= x0 && sx < x0 + CH && sz >= z0 && sz < z0 + CH) boxes.push({ x: sx, z: sz, hx: ST.d / 2, hz: (ST.z1 - ST.z0) / 2, c: 1, s: 0 });
      const tr = [], cell = 8, nc = CH / cell | 0;
      for (let a = 0; a < nc; a++) for (let b = 0; b < nc; b++) {
        const gx = cx * nc + a, gz = cz * nc + b, r1 = hash01(gx, gz, 1);
        const x = (a + 0.1 + 0.8 * hash01(gx, gz, 2)) * cell + x0, z = (b + 0.1 + 0.8 * hash01(gx, gz, 3)) * cell + z0;
        if (r1 > forestDensity(x, z)) continue;
        const kn = nKind(x * 0.004, z * 0.004), kind = kn > 0.25 ? 0 : kn < -0.45 && hash01(gx, gz, 5) < 0.5 ? 2 : 1, sc = 0.75 + hash01(gx, gz, 6) * 0.65;
        tr.push(x, terrainHeight(x, z), z, sc, hash01(gx, gz, 7) * Math.PI * 2, kind);
        circles.push({ x, z, r: (kind === 0 ? 0.28 : kind === 2 ? 0.2 : 0.36) * sc });
      }
      cp = { trees: new Float32Array(tr), bushes: new Float32Array(0), rocks: new Float32Array(0), buildings, poles, signs, labels, lines, walls, circles, boxes };
      propCache.set(key, cp);
      if (propCache.size > 400) propCache.delete(propCache.keys().next().value);
      return cp;
    }
    if (MAP === 'tarmac') {
      const A = TARMAC.AV, L = TARMAC.LAMP, lamps = [], pt = {};
      // street lights down both sides of every avenue (every 48 m, never in a crossing), arm out over the outer lane
      for (let axis = 0; axis < 2; axis++) {
        const lo = axis === 0 ? x0 : z0, tlo = axis === 0 ? z0 : x0;
        for (let idx = Math.floor(lo / A); idx <= Math.floor((lo + CH) / A) + 1; idx++) {
          for (let k = Math.floor(tlo / L) - 1; k <= Math.floor((tlo + CH) / L); k++) {
            const t = k * L + L / 2;
            for (const side of [-1, 1]) {
              const c = idx * A + side * TARMAC.LAMP_OFF, x = axis === 0 ? c : t, z = axis === 0 ? t : c;
              if (x < x0 || x >= x0 + CH || z < z0 || z >= z0 + CH) continue;
              // the arm (lamp local +x) points at the avenue's centre line
              const dx = axis === 0 ? -side : 0, dz = axis === 0 ? 0 : -side;
              lamps.push({ x, y: 0, z, rot: Math.atan2(-dz, dx) });
              circles.push({ x, z, r: 0.16 });
            }
          }
        }
      }
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const r of rampsInChunk(cx + i, cz + j)) {
          if (r.axis === undefined) continue;                 // loose lot ramps get no sign
          roadPoint(r.axis, r.idx, r.t - r.dir * 70, pt);
          const nx = -pt.tz * r.dir, nz = pt.tx * r.dir, x = pt.x + nx * 8.8, z = pt.z + nz * 8.8;
          if (x < x0 || x >= x0 + CH || z < z0 || z >= z0 + CH) continue;
          signs.push({ x, y: 0, z, rot: Math.atan2(-r.dir * pt.tx, -r.dir * pt.tz), kind: 2 });
          circles.push({ x, z, r: 0.08 });
        }
      }
      cp = { trees: new Float32Array(0), bushes: new Float32Array(0), rocks: new Float32Array(0), buildings, poles, signs, labels, lines, walls, circles, boxes, lamps };
      propCache.set(key, cp);
      if (propCache.size > 400) propCache.delete(propCache.keys().next().value);
      return cp;
    }

    // trees: jittered grid
    const cell = 7;
    const nc = CH / cell | 0;
    for (let a = 0; a < nc; a++) {
      for (let b = 0; b < nc; b++) {
        const gx = cx * nc + a, gz = cz * nc + b;
        const r1 = hash01(gx, gz, 1);
        const x = (a + 0.1 + 0.8 * hash01(gx, gz, 2)) * cell + x0;
        const z = (b + 0.1 + 0.8 * hash01(gx, gz, 3)) * cell + z0;
        const dens = 0.025 + 0.8 * forestDensity(x, z);
        if (r1 > dens) continue;
        roadInfo(x, z, ri);
        if (ri.d < 11) continue;
        if (ri.d < 18 && r1 > dens * 0.35) continue;
        const y = terrainHeight(x, z, ri);
        if (y < C.WATER_LEVEL + 1.2) continue;
        const alt = y + (hash01(gx, gz, 4) - 0.5) * 30;
        if (alt > C.TREE_LINE) continue;
        // slope check
        const ys = terrainHeight(x + 2, z), yz = terrainHeight(x, z + 2);
        const slope = Math.max(Math.abs(ys - y), Math.abs(yz - y)) / 2;
        if (slope > 0.9) continue;
        const kn = nKind(x * 0.004, z * 0.004);
        let kind = 1;
        if (alt > 55 || kn > 0.25) kind = 0;
        else if (kn < -0.45 && hash01(gx, gz, 5) < 0.5) kind = 2;
        const s = 0.75 + hash01(gx, gz, 6) * 0.65;
        trees.push(x, y, z, s, hash01(gx, gz, 7) * Math.PI * 2, kind);
        circles.push({ x, z, r: (kind === 0 ? 0.28 : kind === 2 ? 0.2 : 0.36) * s });
      }
    }
    // bushes & rocks
    const bcell = 11, nb = CH / bcell | 0;
    for (let a = 0; a < nb; a++) {
      for (let b = 0; b < nb; b++) {
        const gx = cx * nb + a, gz = cz * nb + b;
        const x = (a + hash01(gx, gz, 21)) * bcell + x0;
        const z = (b + hash01(gx, gz, 22)) * bcell + z0;
        const r = hash01(gx, gz, 23);
        roadInfo(x, z, ri);
        if (ri.d < 9) continue;
        const y = terrainHeight(x, z, ri);
        if (y < C.WATER_LEVEL + 0.5) continue;
        const mountain = smooth(25, 90, y);
        if (r < 0.10 + 0.25 * mountain) {
          const s = 0.4 + hash01(gx, gz, 24) * (1.2 + mountain * 1.6);
          rocks.push(x, y, z, s, hash01(gx, gz, 25) * 6.283, hash01(gx, gz, 26));
          if (s > 0.8) circles.push({ x, z, r: s * 0.85 });
        } else if (r < 0.34 && y < C.TREE_LINE) {
          const s = 0.6 + hash01(gx, gz, 27) * 0.9;
          bushes.push(x, y, z, s, hash01(gx, gz, 28) * 6.283, 0);
        }
      }
    }

    // road-side objects: buildings, poles, signs
    const pt = {};
    for (let axis = 0; axis < 2; axis++) {
      const lo = axis === 0 ? x0 : z0, hi = lo + CH;           // cross range
      const tlo = axis === 0 ? z0 : x0, thi = tlo + CH;        // along range
      const iA = Math.floor((lo - 350) / S), iB = Math.floor((hi + 350) / S);
      for (let idx = iA; idx <= iB; idx++) {
        if (STRAIGHT() && (axis !== 0 || idx !== 0)) continue;
        const hasPower = !DRAGMAP() && hash01(axis, idx, 51) < 0.6;
        const powerSide = hash01(axis, idx, 52) < 0.5 ? -1 : 1;
        // utility poles every 48 m
        if (hasPower) {
          const sp = 48;
          for (let k = Math.floor(tlo / sp) - 1; k <= Math.ceil(thi / sp) + 1; k++) {
            const t = k * sp;
            roadPoint(axis, idx, t, pt);
            const nx = -pt.tz * powerSide, nz = pt.tx * powerSide; // lateral normal (left/right)
            const x = pt.x + nx * 9.5, z = pt.z + nz * 9.5;
            if (x < x0 || x >= x0 + CH || z < z0 || z >= z0 + CH) continue;
            roadInfo(x, z, ri);
            if (ri.d < 8) continue;
            const y = terrainHeight(x, z, ri);
            if (y < C.WATER_LEVEL + 0.5) continue;
            // neighbour pole positions for wires
            const nextP = roadPoint(axis, idx, t + sp, {});
            const nnx = -nextP.tz * powerSide, nnz = nextP.tx * powerSide;
            const xn = nextP.x + nnx * 9.5, zn = nextP.z + nnz * 9.5;
            const rin = roadInfo(xn, zn, {});
            const yn = terrainHeight(xn, zn, rin);
            poles.push({ x, y, z, xn, yn, zn, rot: Math.atan2(pt.tx, pt.tz), wire: rin.d >= 8 && yn > C.WATER_LEVEL + 0.5 });
            circles.push({ x, z, r: 0.17 });
          }
        }
        // buildings: one candidate per 230 m segment
        const seg = 230;
        for (let k = Math.floor((tlo - 60) / seg); k <= Math.ceil((thi + 60) / seg); k++) {
          const rr = hash01(axis * 7 + 3, idx * 131 + k, 61);
          if (rr > 0.2 || STRAIGHT()) continue;
          const t = k * seg + 40 + hash01(axis, idx * 97 + k, 62) * 150;
          const side = hash01(axis, idx * 89 + k, 63) < 0.5 ? -1 : 1;
          roadPoint(axis, idx, t, pt);
          const nx = -pt.tz * side, nz = pt.tx * side;
          const off = 26 + hash01(axis, idx * 83 + k, 64) * 14;
          const x = pt.x + nx * off, z = pt.z + nz * off;
          if (x < x0 || x >= x0 + CH || z < z0 || z >= z0 + CH) continue;
          roadInfo(x, z, ri);
          if (ri.d < 18) continue;
          const y = terrainHeight(x, z, ri);
          if (y < C.WATER_LEVEL + 2) continue;
          const kind = hash01(axis, idx * 71 + k, 65) < 0.35 ? 1 : 0; // 1 = barn
          const w = kind ? 11 : 9 + hash01(axis, k, 66) * 3, dpt = kind ? 15 : 7.5 + hash01(axis, k, 67) * 2.5;
          // face the road: local +z points to road
          const rot = Math.atan2(-nx, -nz);
          const color = hash01(axis, idx * 67 + k, 68);
          buildings.push({ x, y, z, w, d: dpt, rot, kind, color });
          boxes.push({ x, z, hx: w / 2 + 0.2, hz: dpt / 2 + 0.2, c: Math.cos(rot), s: Math.sin(rot) });
          // mailbox / driveway sign by the road
        }
        // speed-limit & curve signs every ~600 m
        const sseg = DRAGMAP() ? 1e9 : 600;
        for (let k = Math.floor(tlo / sseg) - 1; k <= Math.ceil(thi / sseg) + 1; k++) {
          const t = k * sseg + 120;
          const side = (k & 1) ? 1 : -1;
          roadPoint(axis, idx, t, pt);
          const nx = -pt.tz * side, nz = pt.tx * side;
          const x = pt.x + nx * 7.2, z = pt.z + nz * 7.2;
          if (x < x0 || x >= x0 + CH || z < z0 || z >= z0 + CH) continue;
          roadInfo(x, z, ri);
          if (ri.d < 6.5 || ri.dOther < 14) continue;
          const y = terrainHeight(x, z, ri);
          // sign on the right of traffic moving along side*(+t): its face points back at that traffic
          signs.push({ x, y, z, rot: Math.atan2(-side * pt.tx, -side * pt.tz), kind: hash01(axis, idx * 7 + k, 71) < 0.5 ? 0 : 1 });
          circles.push({ x, z, r: 0.08 });
        }
      }
    }

    if (MAP === 'country') {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const r of rampsInChunk(cx + i, cz + j)) {
          roadPoint(r.axis, r.idx, r.t - r.dir * 70, pt);
          const nx = -pt.tz * r.dir, nz = pt.tx * r.dir;
          const x = pt.x + nx * 7.2, z = pt.z + nz * 7.2;
          if (x < x0 || x >= x0 + CH || z < z0 || z >= z0 + CH) continue;
          roadInfo(x, z, ri);
          if (ri.d < 6.5 || ri.dOther < 14) continue;
          signs.push({ x, y: terrainHeight(x, z, ri), z, rot: Math.atan2(-r.dir * pt.tx, -r.dir * pt.tz), kind: 2 });
          circles.push({ x, z, r: 0.08 });
        }
      }
    }
    if (DRAGMAP()) {
      for (const wx of [-DRAG.WALL, DRAG.WALL]) {
        if (wx < x0 || wx >= x0 + CH) continue;
        walls.push({ x: wx, z: z0 + CH / 2, len: CH });
        boxes.push({ x: wx, z: z0 + CH / 2, hx: 0.25, hz: CH / 2, c: 1, s: 0 });
      }
      for (let k = Math.floor(z0 / 90); k * 90 < z0 + CH; k++) {
        const z = k * 90 + 45;
        if (z < z0 || z >= z0 + CH) continue;
        for (const px of [-12.5, 12.5]) {
          if (px < x0 || px >= x0 + CH) continue;
          poles.push({ x: px, y: 0, z, xn: px, yn: 0, zn: z + 90, rot: 0, wire: false });
          circles.push({ x: px, z, r: 0.2 });
        }
      }
      for (const [dist, text] of DRAG_MARKS) {
        const z = -dist;
        if (dist === 0 || z < z0 || z >= z0 + CH) continue;
        for (const bx of [-10.6, 10.6]) if (bx >= x0 && bx < x0 + CH) { labels.push({ x: bx, y: 0, z, rot: 0, text, single: true }); circles.push({ x: bx, z, r: 0.15 }); }
      }
    }
    // drag strip markers on the straightaway: painted lines across the road + distance boards on the right
    if (MAP === 'straight' && x0 <= 0 && x0 + CH > 0) {
      for (const [dist, text] of DRAG_MARKS) {
        const z = -dist;
        if (z < z0 || z >= z0 + CH) continue;
        lines.push({ z, w: 2 * C.ROAD_HALF - 0.4, start: dist === 0 || dist === 402.336 });
        labels.push({ x: 8.5, y: 0, z, rot: 0, text });
        circles.push({ x: 8.5, z, r: 0.12 });
      }
    }
    cp = {
      trees: new Float32Array(trees), bushes: new Float32Array(bushes), rocks: new Float32Array(rocks),
      buildings, poles, signs, labels, lines, walls, circles, boxes,
    };
    propCache.set(key, cp);
    if (propCache.size > 400) {
      const first = propCache.keys().next().value;
      propCache.delete(first);
    }
    return cp;
  }

  /** Colliders within radius of (x,z). */
  function collidersNear(x, z, radius, outCircles, outBoxes) {
    outCircles.length = 0; outBoxes.length = 0;
    const CH = C.CHUNK;
    const ca = Math.floor((x - radius) / CH), cb = Math.floor((x + radius) / CH);
    const da = Math.floor((z - radius) / CH), db = Math.floor((z + radius) / CH);
    const r2 = (radius + 12) * (radius + 12);
    for (let cx = ca; cx <= cb; cx++) for (let cz = da; cz <= db; cz++) {
      const cp = chunkProps(cx, cz);
      for (const c of cp.circles) { const dx = c.x - x, dz = c.z - z; if (dx * dx + dz * dz < r2) outCircles.push(c); }
      for (const b of cp.boxes) { const dx = b.x - x, dz = b.z - z; if (dx * dx + dz * dz < r2 + 400) outBoxes.push(b); }
    }
  }

  // arena wall colliders: 3 m thick boxes just outside the wall line, in short pieces (the car only gathers colliders
  // whose centres are near it) - straight runs and each rounded corner cut into 8
  let wallBoxes = null;
  function arenaWalls() {
    if (wallBoxes) return wallBoxes;
    const A = ARENA, T = 3, pts = [], seg = (ax, az, bx, bz) => pts.push([ax, az, bx, bz]);
    const sx = A.HW - A.CR, sz = A.HL - A.CR;
    const run = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8)); for (let k = 0; k < n; k++) seg(ax + (bx - ax) * k / n, az + (bz - az) * k / n, ax + (bx - ax) * (k + 1) / n, az + (bz - az) * (k + 1) / n); };
    run(A.HW, -sz, A.HW, sz); run(-A.HW, sz, -A.HW, -sz); run(sx, A.HL, -sx, A.HL); run(-sx, -A.HL, sx, -A.HL);
    for (const [cx, cz, a0] of [[sx, sz, 0], [-sx, sz, Math.PI / 2], [-sx, -sz, Math.PI], [sx, -sz, 1.5 * Math.PI]]) {
      for (let k = 0; k < 8; k++) {
        const a = a0 + k * Math.PI / 16, b = a + Math.PI / 16;
        seg(cx + Math.cos(a) * A.CR, cz + Math.sin(a) * A.CR, cx + Math.cos(b) * A.CR, cz + Math.sin(b) * A.CR);
      }
    }
    wallBoxes = pts.map(([ax, az, bx, bz]) => {
      const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      let nx = dz, nz = -dx;                                        // outward normal (away from the middle)
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
      // box local z runs along the wall, local x across it: z axis = (s, c), x axis = (c, -s)
      return { x: mx + nx * T / 2, z: mz + nz * T / 2, hx: T / 2, hz: L / 2 + 0.3, c: dz, s: dx, wall: true };
    });
    return wallBoxes;
  }

  /** Spawn / reset point on the nearest road near (x,z), facing heading closest to `hint` (tx,tz). */
  function nearestRoadSpot(x, z, hintX, hintZ) {
    if (TRK) {
      // the tracks: back on the centre line at the nearest point, facing the way the course runs (off in the woods, more
      // than 40 m from it: the nearest point of the whole line)
      const q = trackQuery(x, z, {});
      let s = q.s;
      if (q.i < 0) { let best = 1e18; for (let i = 0; i < TRK.n; i++) { const d2 = (TRK.x[i] - x) ** 2 + (TRK.z[i] - z) ** 2; if (d2 < best) { best = d2; s = TRK.s[i]; } } }
      const p = trackPoint(s, {});
      return { x: p.x, z: p.z, y: ground(p.x, p.z, {}).h, tx: p.tx, tz: p.tz };
    }
    if (MAP === 'mowtrack') {
      // back on its wheels where it is, facing the hint - pulled off the bales onto the middle of the track if it's near them
      let tx = hintX || 0, tz = hintZ === undefined ? -1 : hintZ || 0;
      const l = Math.hypot(tx, tz);
      if (l < 0.05) { tx = 0; tz = -1; } else { tx /= l; tz /= l; }
      const d = mowtD(x, z), edge = MOWT.W / 2 + 0.55;
      if (Math.abs(Math.abs(d) - edge) < 2.2) {
        const zc = z < -MOWT.SL ? -MOWT.SL : z > MOWT.SL ? MOWT.SL : z, rr = Math.hypot(x, z - zc) || 1, k = MOWT.R / rr;
        if (Math.abs(d) < edge + 2.2) { x = x * k; z = zc + (z - zc) * k; }
      }
      return { x, z, y: 0, tx, tz };
    }
    if (MAP === 'arena') {
      // the stadium: back on its wheels right where it is, pulled in off the wall, facing the hint
      let tx = hintX || 0, tz = hintZ === undefined ? -1 : hintZ || 0;
      const l = Math.hypot(tx, tz);
      if (l < 0.05) { tx = 0; tz = -1; } else { tx /= l; tz /= l; }
      for (let it = 0; it < 4; it++) {
        const sd = arenaSD(x, z);
        if (sd < -4.5) break;
        const e = 0.1, gx = (arenaSD(x + e, z) - arenaSD(x - e, z)) / (2 * e), gz = (arenaSD(x, z + e) - arenaSD(x, z - e)) / (2 * e), gl = Math.hypot(gx, gz) || 1;
        x -= gx / gl * (sd + 4.6); z -= gz / gl * (sd + 4.6);
      }
      return { x, z, y: ground(x, z, {}).h, tx, tz };
    }
    if (MAP === 'ramps' || MAP === 'dunes') {
      // back on its wheels right where it is, facing the hint
      let tx = hintX || 0, tz = hintZ === undefined ? -1 : hintZ || 0;
      const l = Math.hypot(tx, tz);
      if (l < 0.05) { tx = 0; tz = -1; } else { tx /= l; tz /= l; }
      return { x, z, y: ground(x, z, {}).h, tx, tz };
    }
    if (MAP === 'tarmac') {
      // it's all road: put the car back on its wheels right where it is (nudged off a light pole), facing the hint
      let tx = hintX || 0, tz = hintZ === undefined ? -1 : hintZ || 0;
      const l = Math.hypot(tx, tz);
      if (l < 0.05) { tx = 0; tz = -1; } else { tx /= l; tz /= l; }
      const cs = [], bs = [];
      collidersNear(x, z, 3, cs, bs);
      for (const c of cs) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
        if (d < 3) { const k = (3 - d) / Math.max(d, 1e-3); x += (d > 1e-3 ? dx : 1) * k; z += dz * k; }
      }
      return { x, z, y: ground(x, z, {}).h, tx, tz };
    }
    const ri = roadInfo(x, z, {});
    const t = ri.axis === 0 ? z : x;
    const p = roadPoint(ri.axis, ri.idx, t, {});
    let tx = p.tx, tz = p.tz;
    if (hintX !== undefined && tx * hintX + tz * hintZ < 0) { tx = -tx; tz = -tz; }
    // Y-up, forward (tx,tz): right-hand vector = forward x up = (-tz, tx). Drive in the right lane.
    const px = p.x - tz * 1.8, pz = p.z + tx * 1.8;
    return { x: px, z: pz, y: ground(px, pz, {}).h, tx, tz };    // (on top of a ramp if you reset onto one)
  }

  function setMap(m) {
    PREP = m === 'prepcountry' || m === 'preptarmac';
    if (PREP) m = m === 'preptarmac' ? 'tarmac' : 'country';
    MAP = m === 'straight' || m === 'drag' || m === 'dirtdrag' || m === 'tarmac' || m === 'arena' || m === 'mowtrack' || m === 'ramps' || m === 'dunes' || m === 'offroad' || TRACK_DEFS[m] ? m : 'country';
    TRK = TRACK_DEFS[MAP] ? (trackCache[MAP] = trackCache[MAP] || buildTrack(TRACK_DEFS[MAP])) : null;
    // (an offroad race: its course from the settings - generated once per course code - and where it sits in the noise)
    if (MAP === 'offroad') { const k = 'off:' + offCode(OFF); TRK = trackCache[k] = trackCache[k] || offGenerate(OFF); [OFFB, OFFX, OFFZ, OFFCX, OFFCZ, OFFRM] = TRK.off; }
    trkPropList = null;
    jumpCache.clear();
    roadCache.clear(); gridCache.clear(); propCache.clear(); rampCache.clear(); spawnRampV = undefined;
  }
  const W = {
    setMap, get map() { return MAP; }, get prep() { return PREP; }, get track() { return TRK; },
    setOffroad, get offroad() { return OFF; }, offCode, offParse, offNormalize, OFF_BIOMES, OFF_OPTS, OFF_LEN, offNatural,
    // (the maps with lakes: the open country - none by the tracks, in the stadium, the desert or on the flat maps)
    get hasWater() { return MAP !== 'tarmac' && MAP !== 'arena' && MAP !== 'ramps' && MAP !== 'dunes' && !TRK; }, trackQuery, trackPoint, trackProps, trackSpawn, TRACK_DEFS, DRAG_MARKS, RAMPS_SPAWN, jumpsInChunk, jumpHeight, DRAG, TARMAC, MOWT, mowtD, mowtrackBales, DUNES,
    ARENA, ARENA_OBS, ARENA_CARS, CAR_L, CAR_W, arenaHeight, arenaSD, arenaCrush, arenaResetCars, arenaWalls, arenaCarHeight: (c, x, z) => carHeight(c, x, z, null),
    arenaCarDent: (c, x, z) => carDent(c, (x - c.x) * c.flip, z - c.z),
    C, smooth, hash01, hashInt, mulberry32, makeSimplex,
    roadParams, roadCenter, roadSlope, roadInfo, roadPoint, roadUniforms, RAMP, rampsInChunk, rampHeight,
    lowHeight, terrainHeight, gridHeight, ground, forestDensity,
    chunkProps, collidersNear, nearestRoadSpot,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.HCWorld = W;
})(typeof self !== 'undefined' ? self : this);
