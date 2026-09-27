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
  const STRAIGHT = () => MAP === 'straight' || DRAGMAP();
  // drag strip layout (metres): prepped half-width, wall centre, lane centre, lane edge line
  const DRAG = { HALF: 8.3, WALL: 9.0, LANE: 3.1, EDGE: 6.2, SPAWN_Z: 14 };
  // drag strip distances from the start line (z = 0, racing towards -z), metres
  const DRAG_MARKS = [[0, 'START'], [18.288, '60 FT'], [100.584, '330 FT'], [201.168, '1/8 MILE'], [304.8, '1000 FT'], [402.336, '1/4 MILE']];
  // 'tarmac' (All Road): the whole world is pavement - dead flat asphalt to the horizon with a grid of painted 4-lane
  // avenues every AV metres (lanes 3.6 m, edge lines at 7.2 m, avenue paving to 8.4 m), street lights down both sides,
  // and every block between them a different lot (painted by the terrain shader). Physics: asphalt everywhere.
  const TARMAC = { AV: 240, EDGE: 7.2, PAVE: 8.4, LAMP: 48, LAMP_OFF: 9.6, LAMP_REACH: 3.4, SPAWN_X: 1.8, SPAWN_Z: 40 };

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
    if (MAP === 'arena') { out.d = 1e4; out.sd = 1e4; out.axis = 0; out.idx = 0; out.slope = 0; out.dOther = 1e9; return out; }
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
  // jump ramps), added to the flat ground so the tyres, suspension and body feel it, and meshed from the same function:
  // The floor is 96 x 184 m (a big domed stadium's, wall to wall):
  //   east side  - a big tabletop: 13 m faces up to a 4 m deck 16 m long (jump it, or land on the far face)
  //   west side  - the car crush: a kicker, six junk cars side by side, a kicker back down. The cars flatten under load
  //   north end  - the big gap jump: a 30 deg kicker to a 3.6 m lip, a gap, a landing mound with a long downslope;
  //                beside it a step-up (north-west: up a steep face onto a 2.8 m deck, off down a long ramp) and a
  //                whoops lane (north-east, along the wall: four 1.2 m rollers)
  //   south end  - moguls: three 1.2 m whoops across the floor
  //   corners    - banked up to 2.4 m against the wall, for sliding round
  const ARENA = { HW: 48, HL: 92, CR: 24, SPAWN_X: 0, SPAWN_Z: 44 };
  const CRUSH_X = -26;                      // the car-crush lane (x of the junk cars)
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
    // moguls: a row of whoops (three, or ob.n)
    mogul(u, o, ob) { const W = 7, H = 1.2, E = (ob.n || 3) * W;
      if (u <= 0 || u >= E) { o.d = 0; return 0; }
      const a = Math.PI * u / W, s = Math.sin(a); o.d = H * 2 * s * Math.cos(a) * Math.PI / W; return H * s * s; },
  };
  // obstacles: centre-line start (x0, z0), direction (fx, fz), length, half width (flat part + falloff `bev`)
  const ARENA_OBS = [
    { kind: 'table', x0: 26, z0: -21, fx: 0, fz: 1, len: 42, hw: 10.5, bev: 6 },
    { kind: 'crush', x0: CRUSH_X, z0: -14.7, fx: 0, fz: 1, len: 29.4, hw: 6.2, bev: 2.6 },
    { kind: 'gap', x0: 0, z0: -18, fx: 0, fz: -1, len: 36.5, hw: 7.5, bev: 3.5 },
    { kind: 'mogul', x0: 0, z0: 58, fx: 0, fz: 1, len: 21, hw: 26, bev: 5 },
    { kind: 'step', x0: -28, z0: -34, fx: 0, fz: -1, len: 32, hw: 8, bev: 3.5 },
    { kind: 'mogul', n: 4, x0: 39, z0: -34, fx: 0, fz: -1, len: 28, hw: 6, bev: 2.5 },   // (clear of the tabletop's run-out)
  ];
  for (const ob of ARENA_OBS) {             // bounding boxes for quick rejection (and for the renderer's meshes)
    const ex = [ob.x0, ob.x0 + ob.fx * ob.len], ez = [ob.z0, ob.z0 + ob.fz * ob.len], rx = -ob.fz, rz = ob.fx;
    ob.minX = Math.min(...ex) - Math.abs(rx) * ob.hw; ob.maxX = Math.max(...ex) + Math.abs(rx) * ob.hw;
    ob.minZ = Math.min(...ez) - Math.abs(rz) * ob.hw; ob.maxZ = Math.max(...ez) + Math.abs(rz) * ob.hw;
  }
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
  const _ag = { x: 0, z: 0 }, _cg = { x: 0, z: 0 };
  /** Height of the arena's obstacles above the flat floor at (x, z); gradient in _ag. (noCars: the dirt only - the
   *  renderer meshes the junk cars separately) */
  function arenaHeight(x, z, noCars) {
    const A = ARENA;
    let best = 0; _ag.x = 0; _ag.z = 0;
    if (Math.abs(x) > A.HW + 1 || Math.abs(z) > A.HL + 1) return 0;
    for (let i = 0; i < ARENA_OBS.length; i++) {
      const ob = ARENA_OBS[i];
      if (x < ob.minX || x > ob.maxX || z < ob.minZ || z > ob.maxZ) continue;
      const dx = x - ob.x0, dz = z - ob.z0, u = dx * ob.fx + dz * ob.fz, v = dx * -ob.fz + dz * ob.fx, av = Math.abs(v);
      if (av >= ob.hw) continue;
      const p = PR[ob.kind](u, _po, ob);
      if (p <= 0) continue;
      const side = 1 - sstep(ob.hw - ob.bev, ob.hw, av), ds = -dsstep(ob.hw - ob.bev, ob.hw, av) * (v < 0 ? -1 : 1);
      const h = p * side;
      if (h > best) {
        best = h;
        const du = _po.d * side, dv = p * ds;                                 // along u and across (v axis = (-fz, fx))
        _ag.x = du * ob.fx - dv * ob.fz; _ag.z = du * ob.fz + dv * ob.fx;
      }
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
  function arenaResetCars() { for (const c of ARENA_CARS) { c.dent.fill(0); c.ver++; c.level = 0; c.cab = 0; c.dd = 0; c.glassEv = 0; c.glassN = 0; } }

  // ---------------------------------------------------------------- terrain height
  function lowHeight(x, z) {
    if (STRAIGHT() || MAP === 'tarmac' || MAP === 'arena') return 0;
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
    if (MAP === 'tarmac' || MAP === 'arena') return 0;
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
    }
    const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    out.h = h; out.nx = -dx * il; out.ny = il; out.nz = -dz * il;
    if (MAP === 'tarmac') { out.roadD = 0; out.surface = 0; return out; }   // All Road: it's all asphalt
    if (MAP === 'arena') { out.roadD = 1e4; out.surface = arenaSD(x, z) < 0 ? 3 : 0; return out; }   // clay floor, concrete outside
    // surface
    const ri = roadInfo(x, z, _gri);
    out.roadD = ri.d;
    if (DRAGMAP() && Math.abs(x) < DRAG.HALF) out.surface = MAP === 'dirtdrag' ? 3 : 5;   // prepped drag strip / groomed dirt
    else if (h < C.WATER_LEVEL - 0.2) out.surface = 4;          // lake bed / water
    else if (ri.d < C.ROAD_HALF) out.surface = 0;          // asphalt
    else if (ri.d < C.SHOULDER) out.surface = 1;           // gravel shoulder
    else out.surface = (nDet(x * 0.05 + 40, z * 0.05) > 0.45) ? 3 : 2; // dirt / grass
    return out;
  }

  // ---------------------------------------------------------------- vegetation / props
  function forestDensity(x, z) {
    if (MAP === 'tarmac' || MAP === 'arena') return 0;
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
    if (MAP === 'arena') {
      for (const b of arenaWalls()) if (b.x >= x0 && b.x < x0 + CH && b.z >= z0 && b.z < z0 + CH) boxes.push(b);
      cp = { trees: new Float32Array(0), bushes: new Float32Array(0), rocks: new Float32Array(0), buildings, poles, signs, labels, lines, walls, circles, boxes };
      propCache.set(key, cp);
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
    MAP = m === 'straight' || m === 'drag' || m === 'dirtdrag' || m === 'tarmac' || m === 'arena' ? m : 'country';
    roadCache.clear(); gridCache.clear(); propCache.clear(); rampCache.clear(); spawnRampV = undefined;
  }
  const W = {
    setMap, get map() { return MAP; }, DRAG_MARKS, DRAG, TARMAC,
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
