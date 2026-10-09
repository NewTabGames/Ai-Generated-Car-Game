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
    const Ltot = cum[raw.length], n = Math.round(Ltot / (def.step || 2)), T = { W: def.W, kind: def.kind, steep: def.steep, n, L: Ltot };
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
    } else if (T.kind !== 'uni') {
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
    const stands = T.kind === 'mow' ? { x: 10, z0: -38, z1: 8, d: 9 }
      : T.kind === 'uni' ? (T.uStands ? { x: T.uStands.side > 0 ? hw + 3 : -(hw + 9), z0: T.uStands.z0, z1: T.uStands.z1, d: 6, side: T.uStands.side } : null) : null;   // (the BMX track's: along the start straight, on its clear side)
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
  // (the terrain's own ground: sampled somewhere of its own in the noise for each seed - the noise turned and moved with
  // the course, so the ground under it is the same wherever its start ends up)
  let OFFX = 0, OFFZ = 0, OFFC = 1, OFFS = 0, OFFB = 'forest', OFFCX = 0, OFFCZ = 0, OFFRM = 1e4;
  function offNatural(x, z) {
    const X = x * OFFC + z * OFFS + OFFX, Z = -x * OFFS + z * OFFC + OFFZ;
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
  // the course's own ground along a closed line (n points ds apart, at xs / zs): the terrain's, smoothed, its grades held to
  // the steepest a car can climb - halfway between the highest such line under the ground (cuttings through every crest)
  // and the lowest over it (fills across every dip), each a distance transform round the loop - then the crests and dips
  // rounded off (a grade change spread over ~50-100 m, so a car stays on the ground over the brows up to ~75-95 mph
  // instead of leaving them at 40). Returns it and the natural ground
  const offAvg = (src, n, M) => { const o = new Float64Array(n); let acc = 0; for (let j = -M; j <= M; j++) acc += src[(j + n) % n]; for (let k = 0; k < n; k++) { o[k] = acc / (2 * M + 1); acc += src[(k + M + 1) % n] - src[(k - M + n) % n]; } return o; };
  function offLim(src, n, g) {
    const U = Float64Array.from(src), D = Float64Array.from(src);
    for (let r = 0; r < 2; r++) {
      for (let k = 1; k < 2 * n; k++) { const i = k % n, p = (k - 1) % n; if (U[i] > U[p] + g) U[i] = U[p] + g; if (D[i] < D[p] - g) D[i] = D[p] - g; }
      for (let k = 2 * n - 2; k >= 0; k--) { const i = k % n, p = (k + 1) % n; if (U[i] > U[p] + g) U[i] = U[p] + g; if (D[i] < D[p] - g) D[i] = D[p] - g; }
    }
    const m = new Float64Array(n); for (let i = 0; i < n; i++) m[i] = (U[i] + D[i]) / 2;
    return m;
  }
  function offBase(xs, zs, n, ds, B) {
    const h = new Float64Array(n); for (let k = 0; k < n; k++) h[k] = offNatural(xs[k], zs[k]);
    return { hb: offAvg(offAvg(offLim(offAvg(h, n, B.sm), n, B.grade * ds), n, B.round), n, B.round), h };
  }
  let T0dig = 0;
  function offGenerate(cfg) {
    const B = OFF_BIOMES[cfg.biome], rnd = mulberry32((cfg.seed ^ 0x2545f491) + 7919 * (OFF_OPTS.biome.findIndex((p) => p[0] === cfg.biome) + 1));
    const Ltar = OFF_LEN[cfg.len], tw = ['flowing', 'mixed', 'technical'].indexOf(cfg.twist);
    const Wd = B.W * { narrow: 0.75, normal: 1, wide: 1.35 }[cfg.width], hw = Wd / 2;
    const sep = 2 * (hw + B.verge) + 8, Rmin = [28, 17, 11][tw];
    OFFB = cfg.biome; OFFC = 1; OFFS = 0; OFFCX = 0; OFFCZ = 0; OFFRM = 1e4;
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
    // where in the terrain's noise it goes: up the mountain and through the woods, the gentlest of a few tries (the least
    // digging and filling); the dunes, the desert's swells and the bog as they come
    const n = Q.length, R = loopRadii(Q, 4), dsQ = loopLen(Q) / n, qx = Q.map((p) => p[0]), qz = Q.map((p) => p[1]);
    let bestN = null;
    for (let t = 0; t < (cfg.biome === 'mountain' ? 6 : cfg.biome === 'forest' ? 3 : 1); t++) {
      OFFX = (rnd() - 0.5) * 40000; OFFZ = (rnd() - 0.5) * 40000;
      const { hb, h } = offBase(qx, qz, n, dsQ, B);
      let cost = 0; for (let k = 0; k < n; k++) cost += Math.abs(hb[k] - h[k]);
      if (!bestN || cost < bestN.cost) bestN = { cost, hb, ox: OFFX, oz: OFFZ };
    }
    // the start: on a straight that's near level from the back of the grid to past the line (no more than 4% where there's
    // anywhere like that; offProfile levels a pad under the grid in any case) - then the whole thing turned and moved so that's (0, 0) heading -z, the noise with it
    const hq = bestN.hb;
    let k0 = 0, best = -1e9;
    for (let k = 0; k < n; k += 2) {
      let mn = 1e9, gr = 0;
      for (let j = -20; j <= 20; j++) mn = Math.min(mn, Math.abs(R[(k + j + n) % n]));
      for (let j = -36; j <= 10; j++) gr = Math.max(gr, Math.abs(hq[(k + j + 1 + n) % n] - hq[(k + j + n) % n]) / dsQ);
      // (a straight first - no tighter than ~90 m either side - then near level, then the straighter)
      const sc = (mn >= 90 ? 1000 : mn * 10) - 2000 * Math.max(0, gr - 0.04) + Math.min(mn, 400) / 4;
      if (sc > best) { best = sc; k0 = k; }
    }
    const a = Q[(k0 - 2 + n) % n], b = Q[(k0 + 2) % n], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // (turned by -90 deg minus the heading there: its direction comes out (0, -1))
    const c = -(b[1] - a[1]) / tl, s = -(b[0] - a[0]) / tl, o = Q[k0], pts = [];
    OFFC = c; OFFS = s; OFFX = bestN.ox + o[0]; OFFZ = bestN.oz + o[1]; T0dig = bestN.cost / n;
    for (let j = 0; j < n; j++) { const p = Q[(k0 + j) % n], dx = p[0] - o[0], dz = p[1] - o[1]; pts.push([dx * c - dz * s, dx * s + dz * c]); }
    pts[0] = [0, 0];
    const T = buildTrack({ W: Wd, kind: 'offroad', steep: 0, pts });
    T.biome = cfg.biome; T.B = B; T.cfg = cfg; T.code = offCode(cfg);
    // (how far the course reaches from its middle: the desert's mesas stay out past it)
    OFFCX = T.cx; OFFCZ = T.cz; OFFRM = 0;
    for (let k = 0; k < T.n; k++) OFFRM = Math.max(OFFRM, Math.hypot(T.x[k] - T.cx, T.z[k] - T.cz));
    offProfile(T, rnd);
    T.dig = T0dig;
    T.off = [OFFB, OFFX, OFFZ, OFFCX, OFFCZ, OFFRM, OFFC, OFFS];
    return T;
  }
  // the course's ground along its centre line: the land's own, smoothed and grade-limited, then the features built in
  function offProfile(T, rnd) {
    const n = T.n, B = T.B, cfg = T.cfg, ds = T.L / n;
    let { hb } = offBase(T.x, T.z, n, ds, B);
    // (the start: a pad under the grid and the line, no steeper than 4% from 72 m back to 20 m past it, eased into the
    // course over 50 m either side)
    { const a = hb[(n - 36) % n], b = hb[10 % n], L0 = 46 * ds, sl = Math.max(-0.04, Math.min(0.04, (b - a) / L0));
      let mean = 0; for (let j = -36; j <= 10; j++) mean += hb[(j + n) % n]; mean /= 47;
      for (let j = -61; j <= 35; j++) { const i = (j + n) % n, lin = mean + sl * (j + 13) * ds, w = j < -36 ? (j + 61) / 25 : j > 10 ? (35 - j) / 25 : 1, ww = w * w * (3 - 2 * w); hb[i] += (lin - hb[i]) * ww; }
      // (and where that meets ground already at the steepest a car climbs, the grades held to it again)
      hb = offAvg(offLim(hb, n, B.grade * ds * 0.97), n, 2); }
    const hc = Float64Array.from(hb); T.hb = Float32Array.from(hb);
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
        if (T.biome === 'forest' && lo && free(k, -9, 9)) for (let j = -7; j <= 7; j++) zone[(k + j + n) % n] = 1;
        if (T.biome === 'mud' && hi) for (let j = -9; j <= 9; j++) zone[(k + j + n) % n] = 3;
      }
      // (the forest's mud holes: dished ~0.2 m - eased in, not a step)
      if (T.biome === 'forest') { const z1 = offAvg(Float64Array.from(zone, (v) => (v === 1 ? 1 : 0)), n, 4); for (let k = 0; k < n; k++) hc[k] -= 0.22 * z1[k]; }
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
  // ---------------------------------------------------------------- Unicycle Racing: a BMX-style track from a seed
  // A BMX track in a field: straights side by side, joined end to end by 180 deg berms (banked turns), the last one
  // coming back round the outside of the berms and climbing to the start hill - the start gate on top, the start / finish
  // line at the gate, the first straight down its steep face. Rollers, rhythm sections, doubles, tabletops and step-ups
  // along the straights, red clay all over. Its shapes are too fine for the 2 m terrain grid, so its height is worked
  // out exactly (uniHeight - what the tyre rolls on) and drawn as its own fine mesh, the terrain sunk a little under it
  const UNI_OPTS = {
    ver: [['pedal', 'P'], ['improved', 'I'], ['jet', 'J']],
    size: [['bmx', 'B'], ['super', 'S']],
    len: [['short', 'S'], ['medium', 'M'], ['long', 'L']],
    laps: [[1, '1'], [2, '2'], [3, '3'], [5, '5']],
    jumps: [['small', 'S'], ['medium', 'M'], ['big', 'B']],
    rhythm: [['none', '0'], ['some', '1'], ['lots', '2']],
    bank: [['flat', 'F'], ['banked', 'B'], ['steep', 'S']],
    turns: [['flowing', 'F'], ['windy', 'W'], ['tight', 'T']],
  };
  const UNI_DEFAULT = { ver: 'pedal', size: 'bmx', len: 'medium', laps: 3, jumps: 'medium', rhythm: 'some', bank: 'banked', turns: 'windy', seed: 31415 };
  function uniNormalize(c) {
    const o = Object.assign({}, UNI_DEFAULT);
    if (c) for (const k of Object.keys(UNI_OPTS)) if (UNI_OPTS[k].some((p) => p[0] === c[k])) o[k] = c[k];
    o.seed = c && Number.isFinite(+c.seed) ? Math.abs(Math.floor(+c.seed)) % 2147483647 : UNI_DEFAULT.seed;
    return o;
  }
  function uniCode(c) {
    c = uniNormalize(c);
    const L = (k) => UNI_OPTS[k].find((p) => p[0] === c[k])[1];
    return 'UNI-' + L('ver') + L('size') + L('len') + L('laps') + L('jumps') + L('rhythm') + L('bank') + L('turns') + '-' + c.seed.toString(36).toUpperCase();
  }
  function uniParse(code) {
    // (codes from before the Turns setting have no letter for it)
    const m = /^UNI-([PIJ])([BS])([SML])([1235])([SMB])([012])([FBS])([FWT])?-([0-9A-Z]{1,7})$/.exec(String(code || '').trim().toUpperCase());
    if (!m) return null;
    const P = (k, v) => { const p = UNI_OPTS[k].find((q) => q[1] === v); return p ? p[0] : undefined; };
    return uniNormalize({ ver: P('ver', m[1]), size: P('size', m[2]), len: P('len', m[3]), laps: P('laps', m[4]), jumps: P('jumps', m[5]), rhythm: P('rhythm', m[6]), bank: P('bank', m[7]), turns: m[8] ? P('turns', m[8]) : 'windy', seed: parseInt(m[9], 36) });
  }
  let UNI = uniNormalize(null);
  function setUni(c) { UNI = uniNormalize(c); }
  // how the layout winds (the Turns setting): the grid's cell (an arm's width - a hairpin's diameter), how much the shape
  // grows out in arms (hairpins) rather than filling in, how far its corners are knocked off true, and how often the
  // longer straights get a bend or an S put in them (and how big)
  const UNI_TW = {
    flowing: { cell: 1.3, snake: 1.2, jit: 0.1, wig: 0.3, amp: 0.13 },
    windy: { cell: 1.12, snake: 3.5, jit: 0.15, wig: 0.5, amp: 0.17 },
    tight: { cell: 1, snake: 8, jit: 0.16, wig: 0.7, amp: 0.2 },
  };
  const UNI_LEN = { short: 330, medium: 440, long: 620 };
  // a BMX track's layout, laid out fresh from the seed: a random shape grown cell by cell on an uneven grid - out in arms
  // more than filling in, never with a hole or two cells touching only at a corner - and the track run round its edge
  // (so it can't cross itself, and the bits of it side by side are a cell apart). Its corners are knocked off true, the
  // longer straights get bends and S's put in them, then every corner is rounded off into an arc - a hairpin where two
  // come together - and the start straight (the shape's underside) kept long and dead straight for the start hill.
  // Returns the centre line from the gate round to it (heading -z from (0, 0)), its arcs, or null if this try won't do
  function uniLayout(rnd, cfg, K, Wd, Lneed, gateBack) {
    const TW = UNI_TW[cfg.turns] || UNI_TW.windy, c0 = 17 * K * TW.cell, Ltar = UNI_LEN[cfg.len] * K, Rmin = 7 * K, sep = Wd + 7;
    const GX = 8, GZ = 7, gx = [0], gz = [0];
    for (let i = 0; i < GX; i++) gx.push(gx[i] + c0 * (0.95 + rnd() * 0.7));
    for (let j = 0; j < GZ; j++) gz.push(gz[j] + c0 * (0.95 + rnd() * 0.7));
    const C = new Uint8Array(GX * GZ), at = (i, j) => i >= 0 && j >= 0 && i < GX && j < GZ && C[j * GX + i] === 1;
    // (the seed: four cells along the bottom - their underside is the start straight)
    const a0 = Math.floor(rnd() * (GX - 3));
    for (let i = a0; i < a0 + 4; i++) C[i] = 1;
    const perim = () => {
      let p = 0;
      for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) if (at(i, j)) {
        if (!at(i, j - 1)) p += gx[i + 1] - gx[i]; if (!at(i, j + 1)) p += gx[i + 1] - gx[i];
        if (!at(i - 1, j)) p += gz[j + 1] - gz[j]; if (!at(i + 1, j)) p += gz[j + 1] - gz[j];
      }
      return p;
    };
    const pinch = (i, j) => {
      for (let a = i - 1; a <= i; a++) for (let b = j - 1; b <= j; b++) {
        const p = at(a, b), q = at(a + 1, b), r = at(a, b + 1), s = at(a + 1, b + 1);
        if ((p && s && !q && !r) || (q && r && !p && !s)) return true;
      }
      return false;
    };
    // (a hole: an empty cell the outside can't reach)
    const holes = () => {
      const W2 = GX + 2, seen = new Uint8Array(W2 * (GZ + 2)), st = [0];
      let n = 0, empty = 0;
      seen[0] = 1;
      while (st.length) {
        const k = st.pop(), i = (k % W2) - 1, j = Math.floor(k / W2) - 1;
        if (i >= 0 && j >= 0 && i < GX && j < GZ) n++;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, jj = j + dj, kk = (jj + 1) * W2 + ii + 1;
          if (ii < -1 || jj < -1 || ii > GX || jj > GZ || at(ii, jj) || seen[kk]) continue;
          seen[kk] = 1; st.push(kk);
        }
      }
      for (let k = 0; k < GX * GZ; k++) if (!C[k]) empty++;
      return n !== empty;
    };
    while (perim() < Ltar / 0.9) {
      const cand = [], wt = [];
      let tot = 0;
      for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
        if (at(i, j)) continue;
        const nb = at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1);
        if (!nb) continue;
        C[j * GX + i] = 1;
        const bad = pinch(i, j) || holes();
        C[j * GX + i] = 0;
        if (bad) continue;
        const w = nb === 1 ? TW.snake : nb === 2 ? 1 : 0.2;
        cand.push(j * GX + i); wt.push(w); tot += w;
      }
      if (!cand.length) return null;
      let r = rnd() * tot, k = 0;
      while ((r -= wt[k]) > 0 && k < cand.length - 1) k++;
      C[cand[k]] = 1;
    }
    // its edge, the shape on the left: every grid corner along it, then just the corners where it turns
    const nxt = new Map(), key = (i, j) => i * 64 + j;
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) nxt.set(key(i, j), key(i + 1, j));
      if (!at(i + 1, j)) nxt.set(key(i + 1, j), key(i + 1, j + 1));
      if (!at(i, j + 1)) nxt.set(key(i + 1, j + 1), key(i, j + 1));
      if (!at(i - 1, j)) nxt.set(key(i, j + 1), key(i, j));
    }
    const loop = [];
    for (let v = key(a0, 0), g = 0; g < 4000; g++) { loop.push(v); v = nxt.get(v); if (v === key(a0, 0)) break; }
    let V = [];
    for (let k = 0; k < loop.length; k++) {
      const p = loop[(k - 1 + loop.length) % loop.length], c = loop[k], n = loop[(k + 1) % loop.length];
      const ci = Math.floor(c / 64), cj = c % 64, d1i = ci - Math.floor(p / 64), d1j = cj - (p % 64), d2i = Math.floor(n / 64) - ci, d2j = (n % 64) - cj;
      if (d1i !== d2i || d1j !== d2j) V.push({ x: gx[ci], z: gz[cj], b: cj === 0 });
    }
    // (the start straight: the longest run along the bottom)
    let k0 = -1, lb = 0;
    for (let k = 0; k < V.length; k++) { const a = V[k], b = V[(k + 1) % V.length]; if (a.b && b.b && b.x - a.x > lb) { lb = b.x - a.x; k0 = k; } }
    if (k0 < 0) return null;
    V = V.slice(k0).concat(V.slice(0, k0));
    // (the corners knocked off true - the start straight's two ends only along it)
    for (let k = 0; k < V.length; k++) {
      V[k].x += (rnd() - 0.5) * 2 * TW.jit * c0;
      if (k > 1) V[k].z += (rnd() - 0.5) * 2 * TW.jit * c0;
    }
    // (either way round)
    if (rnd() < 0.5) V = [V[1], V[0]].concat(V.slice(2).reverse());
    // the bends and S's in the longer straights - each kept clear of the rest of the track
    const segD = (px, pz, a, b) => {
      const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
    };
    const clear = (px, pz, ka, kb) => {
      for (let k = 0; k < V.length; k++) { if (k === ka || k === kb || (k + 1) % V.length === ka) continue; if (segD(px, pz, V[k], V[(k + 1) % V.length]) < sep + 3) return false; }
      return true;
    };
    for (let k = V.length - 1; k >= 1; k--) {
      const a = V[k], b = V[(k + 1) % V.length], l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l < 2.4 * c0 || rnd() > TW.wig) continue;
      const nq = l > 3.4 * c0 && rnd() < 0.5 ? 2 : 1, ux = (b.x - a.x) / l, uz = (b.z - a.z) / l, side = rnd() < 0.5 ? 1 : -1, add = [];
      for (let q = 1; q <= nq; q++) {
        const f = q / (nq + 1) + (rnd() - 0.5) * 0.14, off = (q % 2 ? side : -side) * TW.amp * l * (0.6 + 0.4 * rnd());
        let px = a.x + ux * l * f - uz * off, pz = a.z + uz * l * f + ux * off;
        if (!clear(px, pz, k, (k + 1) % V.length)) { px = a.x + ux * l * f + uz * off; pz = a.z + uz * l * f - ux * off; if (!clear(px, pz, k, (k + 1) % V.length)) { add.length = 0; break; } }
        add.push({ x: px, z: pz });
      }
      if (add.length) V.splice(k + 1, 0, ...add);
    }
    // every corner rounded off: an arc tangent to both its sides - tighter turns ~9-13 m (x the size), the gentle bends
    // far wider - shrunk to fit where corners come close (a hairpin: the two arcs meet), the start straight left long
    const m = V.length, dir = [], len = [], th = [], sg = [], r = [];
    for (let k = 0; k < m; k++) { const a = V[k], b = V[(k + 1) % m], l = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6; len.push(l); dir.push([(b.x - a.x) / l, (b.z - a.z) / l]); }
    for (let k = 0; k < m; k++) {
      const d1 = dir[(k - 1 + m) % m], d2 = dir[k], cr = d1[0] * d2[1] - d1[1] * d2[0], t = Math.atan2(Math.abs(cr), d1[0] * d2[0] + d1[1] * d2[1]);
      if (t > 2.6) return null;
      const rb = 9 * K * (1 + 0.45 * rnd());
      th.push(t); sg.push(cr >= 0 ? 1 : -1); r.push(t < 1.05 ? rb * (1.3 + 2.2 * (1.05 - t) / 1.05) : rb);
    }
    const tn = (k) => r[k] * Math.tan(th[k] / 2);
    for (let it = 0; it < 8; it++) for (let k = 0; k < m; k++) {
      // (and a few metres straight between turns that go opposite ways, for a berm's bank to swap sides)
      const b = (k + 1) % m, avail = len[k] - (k === 0 ? Lneed : 0) - (sg[k] !== sg[b] && th[k] > 0.6 && th[b] > 0.6 ? 4 * K : 0), need = tn(k) + tn(b);
      if (avail <= 0) return null;
      if (need > avail) { const f = avail / need; r[k] *= f; r[b] *= f; }
    }
    for (let k = 0; k < m; k++) if (r[k] < Rmin && th[k] > 0.05) return null;
    // the centre line, a point every metre: from the gate down the start straight, round every corner, back to the gate
    const P = [], arcs = [];
    let sAcc = 0;
    const push = (x, z) => { if (P.length) { const q = P[P.length - 1]; sAcc += Math.hypot(x - q[0], z - q[1]); } P.push([x, z]); };
    const line = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az))); for (let q = 0; q < n; q++) push(ax + (bx - ax) * q / n, az + (bz - az) * q / n); };
    const d0 = dir[0], A = [V[0].x + d0[0] * tn(0), V[0].z + d0[1] * tn(0)], Ls = len[0] - tn(0) - tn(1);
    const gs = gateBack + 0.3 * (Ls - Lneed), G = [A[0] + d0[0] * gs, A[1] + d0[1] * gs];
    let cur = G;
    for (let q = 1; q <= m; q++) {
      const k = q % m, d1 = dir[(k - 1 + m) % m], d2 = dir[k], t = tn(k), P1 = [V[k].x - d1[0] * t, V[k].z - d1[1] * t];
      line(cur[0], cur[1], P1[0], P1[1]);
      if (th[k] > 0.01) {
        const s = sg[k], cx = P1[0] - d1[1] * r[k] * s, cz = P1[1] + d1[0] * r[k] * s, a0 = Math.atan2(P1[1] - cz, P1[0] - cx), sw = s * th[k], n = Math.max(2, Math.ceil(th[k] * r[k]));
        const s0 = sAcc + Math.hypot(P1[0] - P[P.length - 1][0], P1[1] - P[P.length - 1][1]);
        for (let i = 0; i < n; i++) { const a = a0 + sw * i / n; push(cx + r[k] * Math.cos(a), cz + r[k] * Math.sin(a)); }
        arcs.push({ s0, s1: sAcc + r[k] * th[k] / n, th: th[k], r: r[k] });
      }
      cur = [V[k].x + d2[0] * t, V[k].z + d2[1] * t];
    }
    line(cur[0], cur[1], G[0], G[1]);
    sAcc += Math.hypot(G[0] - P[P.length - 1][0], G[1] - P[P.length - 1][1]);
    // (the bits side by side far enough apart)
    if (loopTooClose(resampleLoop(P, 2), sep, 40 * K)) return null;
    // (into the world: the gate at (0, 0), the start straight heading -z)
    const ph = -Math.PI / 2 - Math.atan2(d0[1], d0[0]), co = Math.cos(ph), si = Math.sin(ph);
    const pts = P.map(([x, z]) => [(x - G[0]) * co - (z - G[1]) * si, (x - G[0]) * si + (z - G[1]) * co]);
    pts[0] = [0, 0];
    return { pts, arcs, sAcc, first: arcs.length ? arcs[0].s0 : sAcc / 4, Ltar };
  }
  function uniGenerate(cfg) {
    const rnd = mulberry32((cfg.seed ^ 0x1b873593) + 104729);
    const K = cfg.size === 'super' ? 1.8 : 1, J = { small: 0.7, medium: 1, big: 1.35 }[cfg.jumps] * (cfg.size === 'super' ? 1.4 : 1);
    const Wd = cfg.size === 'super' ? 9 : 7, hw = Wd / 2;
    // the start hill: the gate on a level top (12 m back to the last turn's bank), its face down into the start straight
    const Hs = 3.6 * K, Lr = 16 * K, top = 12 * K, ramp = 7 * K, gateBack = top + ramp + 2, Lneed = gateBack + Lr + ramp + 5 * K;
    const Hb = { flat: 0, banked: 2.0, steep: 2.8 }[cfg.bank] * (K > 1 ? 1.4 : 1);
    let best = null;
    for (let attempt = 0; attempt < 120 && !(best && best.uIntr < 0.04); attempt++) {
      const lay = uniLayout(rnd, cfg, K, Wd, Lneed, gateBack);
      if (!lay) continue;
      const T = buildTrack({ W: Wd, kind: 'uni', steep: 0, pts: lay.pts, step: 1 });
      if (T.L < lay.Ltar * 0.78 || T.L > lay.Ltar * 1.3) continue;
      T.biome = 'uni'; T.cfg = cfg; T.code = uniCode(cfg); T.B = { name: 'BMX Track', verge: 8 };
      // (the same course measured two ways - my running total and the fitted line's - scaled into the line's)
      const kS = T.L / lay.sAcc;
      // the ground along it: the start hill - the gate on its level top, its steep face - then the field, and a gentle
      // climb back up to the gate over the last ~60 m
      const sTop = T.L - top, sClimb = sTop - 60 * K;
      T.uE = { Hs, Lr, sClimb, sTop, L: T.L };
      // the berms: the tighter turns (50 deg and more - a hairpin's two arcs one turn), bowls up to the outside, the
      // bigger the turn the higher (to ~2 m banked, ~2.8 m steep, x 1.4 Supercross); the gentle bends level
      const turns = [];
      for (const a of lay.arcs) {
        const s0 = a.s0 * kS, s1 = a.s1 * kS, iMid = Math.round((s0 + s1) / 2 / T.L * T.n) % T.n, dir = Math.sign(T.R[iMid]) || 1, last = turns[turns.length - 1];
        if (last && last.sg === dir && s0 - last.s1 < 3 * K) { last.s1 = s1; last.th += a.th; } else turns.push({ s0, s1, th: a.th, sg: dir });
      }
      // (eased in and out over 5.5 m for a right angle, 7 m for a hairpin - and no quicker than 2.5 m for every metre high)
      T.uTurns = turns.filter((t) => t.th > 0.87).map((t) => {
        const H = Hb * Math.min(1, 0.4 + 0.6 * (t.th - 0.87) / 1.4);
        return { s0: t.s0, s1: t.s1, H, sg: t.sg, ramp: Math.max((4 + 3 * Math.min(1, t.th / Math.PI)) * K, 2.5 * H), th: t.th };
      });
      // the features: rollers, rhythm sections, doubles, tabletops, step-ups - the jumps only where it runs straight, the
      // rollers on the gentlest bends too (one that pops you up mid-turn throws you wide); none in a berm, on the start
      // hill or up the climb back to it (a roller's face on top of the climb stalls a pedal unicycle)
      const feats = [], kinds = [['roller', 1], ['double', 1], ['table', 1.2], ['step', 0.8]];
      if (cfg.rhythm !== 'none') kinds.push(['rhythm', cfg.rhythm === 'lots' ? 3 : 1.2]);
      const wsum = kinds.reduce((a, k) => a + k[1], 0), zones = T.uTurns.map((b) => [b.s0 - b.ramp, b.s1 + b.ramp]);
      const minR = (a, b) => { let mr = 1e9; for (let s = a; s <= b; s += 1) mr = Math.min(mr, Math.abs(T.R[Math.min(T.n - 1, Math.max(0, Math.round(s / T.L * T.n)))])); return mr; };
      const end = sClimb - 8 * K;
      for (let pos = Lr + 8 * K; pos < end;) {
        let rr = rnd() * wsum, kind = kinds[0][0];
        for (const [k, w] of kinds) { if ((rr -= w) <= 0) { kind = k; break; } }
        const f = { kind, s: pos, h: 0, parts: [] };
        if (kind === 'roller') f.parts.push([0, 4.6 * K, 0.5 * J]);
        else if (kind === 'rhythm') { const n = 4 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) f.parts.push([k * 3.8 * K, 3.8 * K, 0.42 * J]); }
        else if (kind === 'double') { const h = 0.9 * J; f.parts.push([0, 5 * K, h], [8 * K, 5 * K, h]); }
        else if (kind === 'table') f.table = { up: 4.5 * K, top: (3 + rnd() * 2) * K, down: 5 * K, h: 1.0 * J };
        else f.table = { up: 4.5 * K, top: 5 * K, down: 7 * K, h: 1.1 * J, step: true };
        f.len = f.table ? f.table.up + f.table.top + f.table.down : Math.max(...f.parts.map((p) => p[0] + p[1]));
        const jump = kind === 'double' || kind === 'table' || kind === 'step';
        if (pos + f.len <= end && !zones.some(([z0, z1]) => pos + f.len + 1 > z0 && pos - 1 < z1) && minR(pos - 2 * K, pos + f.len + 2 * K) >= (jump ? 45 : 35) * K) {
          feats.push(f); pos += f.len + (4 + rnd() * 5) * K;
        } else pos += 1.5;
      }
      T.uFeats = feats;
      T.feats = feats.map((f) => ({ s: f.s, kind: f.kind === 'rhythm' ? 'whoops' : 'jump' }));
      // (a ground profile for the parts of the game that read one: the course's height down its middle)
      T.hc = new Float32Array(T.n); for (let k = 0; k < T.n; k++) T.hc[k] = uniElev(T, T.s[k]) + uniFeat(T, T.s[k]);
      T.hb = T.hc; T.zone = new Uint8Array(T.n); T.dig = 0;
      T.off = ['uni', 0, 0, T.cx, T.cz, 1e4, 1, 0];
      T.uR = 0; for (let k = 0; k < T.n; k++) T.uR = Math.max(T.uR, Math.hypot(T.x[k] - T.cx, T.z[k] - T.cz));
      // the grandstands: along the start straight past the foot of the hill, on whichever side's clear of the track
      const z0 = -Math.min(Lr + 50, lay.first * kS - 8), z1 = -(Lr + 4);
      T.uStands = null;
      if (z1 - z0 > 12) for (const side of [1, -1]) {
        const bx0 = side > 0 ? hw + 3 : -(hw + 9), bx1 = bx0 + 6;
        let ok = true;
        for (let k = 0; k < T.n && ok; k += 2) { const cx = Math.max(bx0, Math.min(bx1, T.x[k])), cz = Math.max(z0, Math.min(z1, T.z[k])); if (Math.hypot(T.x[k] - cx, T.z[k] - cz) < hw + 2) ok = false; }
        if (ok) { T.uStands = { side, z0, z1 }; break; }
      }
      // (the mounds of the bits of track side by side mustn't reach up onto each other: how far any does)
      const TR0 = TRK;
      TRK = T;
      let intr = 0;
      for (let i = 0; i < T.n; i += 2) for (const f of [-1, -0.5, 0, 0.5, 1]) {
        const lat = f * hw, x = T.x[i] - T.tz[i] * lat, z = T.z[i] + T.tx[i] * lat;
        intr = Math.max(intr, uniHeight(x, z) - uniPart(T, T.s[i], lat, Math.abs(lat), uniField(x, z)));
      }
      TRK = TR0;
      T.uIntr = intr;
      if (!best || intr < best.uIntr) best = T;
    }
    return best;
  }
  const uniSm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  // the base: the start hill's face down from the gate, the field, the climb back up, the level top
  function uniElev(T, s) {
    const E = T.uE; s = ((s % E.L) + E.L) % E.L;
    if (s < E.Lr) return E.Hs * (0.5 + 0.5 * Math.cos(Math.PI * s / E.Lr));
    if (s >= E.sTop) return E.Hs;
    if (s > E.sClimb) return E.Hs * uniSm((s - E.sClimb) / (E.sTop - E.sClimb));
    return 0;
  }
  // the features: a cosine hump for each roller (a rhythm section is a run of them), a double's two; a tabletop's face up,
  // its flat top and its landing down; a step-up's face up to a higher top and a long gentle way down
  function uniFeat(T, s) {
    const F = T.uFeats;
    let lo = 0, hi = F.length - 1, f = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (F[m].s <= s) { f = F[m]; lo = m + 1; } else hi = m - 1; }
    if (!f || s > f.s + f.len) return 0;
    const u = s - f.s;
    if (f.table) {
      const t = f.table;
      if (u < t.up) return t.h * uniSm(u / t.up);
      if (u < t.up + t.top) return t.h;
      return t.h * (1 - uniSm((u - t.up - t.top) / t.down));
    }
    for (const [a, l, h] of f.parts) if (u >= a && u <= a + l) return h * (0.5 - 0.5 * Math.cos(2 * Math.PI * (u - a) / l));
    return 0;
  }
  // the berm at s: how high its outside edge stands (t) and which way it faces (+1: a left-hander, its outside on the
  // right), eased in and out - the left-handers' and right-handers' netted off, so where an S's two berms overlap it
  // runs through level from one bank to the other, never a step
  function uniBank(T, s, out) {
    let p = 0, q = 0;
    for (const b of T.uTurns) {
      if (s < b.s0 - b.ramp || s > b.s1 + b.ramp) continue;
      const h = b.H * (s < b.s0 ? uniSm((s - b.s0 + b.ramp) / b.ramp) : s > b.s1 ? uniSm((b.s1 + b.ramp - s) / b.ramp) : 1);
      if (b.sg > 0) p = Math.max(p, h); else q = Math.max(q, h);
    }
    out.t = Math.abs(p - q); out.sg = p >= q ? 1 : -1;
    return out;
  }
  // the field: dead level round the track (60 m past its furthest), low rolling country well back from it
  function uniField(x, z) {
    const T = TRK, d = Math.hypot(x - T.cx, (z - T.cz) * 0.9), r0 = (T.uR || 100) + 60;
    return d < r0 ? 0 : smooth(r0, r0 + 360, d) * ((nHill(x * 0.0022, z * 0.0022) + 0.6) * 18 + nDet(x * 0.02, z * 0.02) * 1.2);
  }
  const _uq = { i: -1, d: 1e4, s: 0 }, _ub = { t: 0, sg: 1 }, UQN = 24, _ucD = new Float64Array(UQN), _ucK = new Float64Array(UQN), _ucS = new Float64Array(UQN), _ucL = new Float64Array(UQN), _ucUsed = new Float64Array(8);
  // one bit of the track's solid at a point (d m off its line, lat across it, + right): on the track the surface - level
  // across the straights, the berms' bowls up to the outside - and past its edges the mound it stands on sloping down to
  // the field, its foot wider the taller it stands
  function uniPart(T, s, sd, d, field) {
    const hw = T.W / 2, base = uniElev(T, s) + uniFeat(T, s), bk = uniBank(T, s, _ub), lat = sd * bk.sg;
    const top = (l) => { const u = (Math.max(-hw, Math.min(hw, l)) + hw) / T.W; return base + bk.t * u * u; };
    if (d <= hw) return top(lat);
    const e = top(lat), V = 1 + 1.3 * Math.max(0, e - field);
    return e + (field - e) * smooth(hw, hw + V, d);
  }
  /** The BMX track's surface height at (x, z). Where two bits of the track come close - a berm's back and the way home -
   *  their mounds meet as the higher of the two: each bit nearby (its own nearest point, further than 25 m along the
   *  track from the others') is worked out and the highest wins, so there's never a step where one hands over to the
   *  next. _uq holds the nearest point */
  function uniHeight(x, z) {
    const T = TRK, field = uniField(x, z), hw = T.W / 2, reach = hw + 9;
    _uq.i = -1; _uq.d = 1e4;
    const list = T.grid.get((Math.floor(x / TRK_CELL) + 32768) * 65536 + (Math.floor(z / TRK_CELL) + 32768));
    if (!list) return field;
    let nc = 0;
    for (let k = 0; k < list.length; k++) {
      const i = list[k], j = i + 1 === T.n ? 0 : i + 1, ax = T.x[i], az = T.z[i], dx = T.x[j] - ax, dz = T.z[j] - az;
      // (projected along the line's direction eased from one end of the segment to the other, not square to the segment:
      // the nearest point then slides smoothly round a bend instead of jumping ~0.5 m at each corner of the line on the
      // inside of it - which on the climb, a roller or a jump's face was a step of a few cm)
      const Ax = x - ax, Az = z - az, t0x = T.tx[i], t0z = T.tz[i], ex = T.tx[j] - t0x, ez = T.tz[j] - t0z;
      const a2 = -(dx * ex + dz * ez), a1 = Ax * ex + Az * ez - (dx * t0x + dz * t0z), a0 = Ax * t0x + Az * t0z, disc = a1 * a1 - 4 * a2 * a0;
      let t;
      if (disc >= 0 && a1 !== 0) { const qq = -0.5 * (a1 + (a1 < 0 ? -1 : 1) * Math.sqrt(disc)); t = a0 / qq; } else t = (Ax * dx + Az * dz) / (dx * dx + dz * dz);
      // (a segment the point's off the end of ranks behind the one it's beside, or its end - as near, measured straight -
      // would take turns with it and the point would hop along the line)
      const over = t < 0 ? -t : t > 1 ? t - 1 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz), kd = d + over;
      if (d > reach) continue;
      // (kept in order of distance, the nearest UQN)
      let m;
      if (nc < UQN) m = nc++;
      else { if (kd >= _ucK[UQN - 1]) continue; m = UQN - 1; }
      while (m > 0 && _ucK[m - 1] > kd) { _ucK[m] = _ucK[m - 1]; _ucD[m] = _ucD[m - 1]; _ucS[m] = _ucS[m - 1]; _ucL[m] = _ucL[m - 1]; m--; }
      const tx = t0x + ex * t, tz = t0z + ez * t, tl = Math.hypot(tx, tz) || 1;
      _ucK[m] = kd; _ucD[m] = d; _ucS[m] = T.s[i] + (T.s[i + 1] - T.s[i]) * t; _ucL[m] = ((x - px) * -tz + (z - pz) * tx) / tl;
    }
    if (!nc) return field;
    _uq.i = 1; _uq.d = _ucD[0]; _uq.s = _ucS[0]; _uq.sd = _ucL[0];
    let h = -1e9, nu = 0;
    for (let k = 0; k < nc && nu < 8; k++) {
      let near = false;
      for (let u = 0; u < nu; u++) { let ds = Math.abs(_ucS[k] - _ucUsed[u]); ds = Math.min(ds, T.L - ds); if (ds < 25) { near = true; break; } }
      if (near) continue;
      _ucUsed[nu++] = _ucS[k];
      h = Math.max(h, uniPart(T, _ucS[k], _ucL[k], _ucD[k], field));
    }
    return Math.max(h, field);
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
      // (the BMX track: its own fine mesh lies over the terrain's, which is sunk 0.3 m under it)
      if (TRK.kind === 'uni') { const h = uniHeight(x, z); return _uq.i >= 0 && _uq.d < TRK.W / 2 + 1 ? h - 0.3 : h; }
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
    if (TRK && TRK.kind === 'uni') {
      // the BMX track: its surface worked out exactly (the grid's 2 m is too coarse for a roller), the slope from either
      // side; red clay (dirt) on the track and its mounds, grass in the field
      const h = uniHeight(x, z), d = _uq.d, e = 0.12, dx = (uniHeight(x + e, z) - uniHeight(x - e, z)) / (2 * e), dz = (uniHeight(x, z + e) - uniHeight(x, z - e)) / (2 * e);
      const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      out.h = h; out.nx = -dx * il; out.ny = il; out.nz = -dz * il; out.roadD = d;
      out.surface = d < TRK.W / 2 + 3 || h > uniField(x, z) + 0.15 ? 3 : 2;
      return out;
    }
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
    if (TRK && TRK.kind === 'uni') {
      // (the BMX venue: mown grass round the track, trees about the field and woods beyond)
      const d = trackQuery(x, z, _ftq).d, f = nForest(x * 0.0016, z * 0.0016) * 0.75 + nForest2(x * 0.0062, z * 0.0062) * 0.35;
      return (0.12 + 0.5 * smooth(-0.2, 0.4, f)) * smooth(TRK.W / 2 + 14, TRK.W / 2 + 34, d) * (0.3 + 0.7 * smooth(TRK.uR + 10, TRK.uR + 120, Math.hypot(x - TRK.cx, z - TRK.cz)));
    }
    if (TRK && TRK.kind === 'offroad') {
      // (woods right up to the course in the forest; pines up the mountain; a few trees about the bog; none in the sand)
      const b = TRK.biome;
      if (b === 'dunes' || b === 'desert') return 0;
      const X = x * OFFC + z * OFFS + OFFX, Z = -x * OFFS + z * OFFC + OFFZ, f = nForest(X * 0.0016, Z * 0.0016) * 0.75 + nForest2(X * 0.0062, Z * 0.0062) * 0.35;
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
        if (T.kind !== 'mow' && T.kind !== 'uni') { const sl = Math.max(Math.abs(terrainHeight(x + 2, z) - y), Math.abs(terrainHeight(x, z + 2) - y)) / 2; if (sl > 0.9) continue; }
        const kn = nKind(x * 0.004, z * 0.004), kind = kn > 0.25 || (T.steep && kn > -0.1) ? 0 : kn < -0.45 && hash01(gx, gz, 5) < 0.5 ? 2 : 1, sc = 0.75 + hash01(gx, gz, 6) * 0.65;
        tr.push(x, y, z, sc, hash01(gx, gz, 7) * Math.PI * 2, kind);
        circles.push({ x, z, r: (kind === 0 ? 0.28 : kind === 2 ? 0.2 : 0.36) * sc });
      }
      if (T.kind !== 'mow' && T.kind !== 'uni') {
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
    MAP = m === 'straight' || m === 'drag' || m === 'dirtdrag' || m === 'tarmac' || m === 'arena' || m === 'mowtrack' || m === 'ramps' || m === 'dunes' || m === 'offroad' || m === 'uni' || TRACK_DEFS[m] ? m : 'country';
    TRK = TRACK_DEFS[MAP] ? (trackCache[MAP] = trackCache[MAP] || buildTrack(TRACK_DEFS[MAP])) : null;
    // (an offroad race: its course from the settings - generated once per course code - and where it sits in the noise)
    if (MAP === 'offroad') { const k = 'off:' + offCode(OFF); TRK = trackCache[k] = trackCache[k] || offGenerate(OFF); [OFFB, OFFX, OFFZ, OFFCX, OFFCZ, OFFRM, OFFC, OFFS] = TRK.off; }
    // (a unicycle race: its BMX track from the settings)
    if (MAP === 'uni') { const k = 'uni:' + uniCode(UNI); TRK = trackCache[k] = trackCache[k] || uniGenerate(UNI); }
    trkPropList = null;
    jumpCache.clear();
    roadCache.clear(); gridCache.clear(); propCache.clear(); rampCache.clear(); spawnRampV = undefined;
  }
  const W = {
    setMap, get map() { return MAP; }, get prep() { return PREP; }, get track() { return TRK; },
    setOffroad, get offroad() { return OFF; }, setUni, get uni() { return UNI; }, uniCode, uniParse, uniNormalize, UNI_OPTS, uniHeight, offCode, offParse, offNormalize, OFF_BIOMES, OFF_OPTS, OFF_LEN, offNatural,
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
