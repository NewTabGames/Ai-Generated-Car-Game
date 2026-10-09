// Unicycle Racing's BMX tracks: every size x length x turns x jumps x banking, a few seeds - how long the loop is, its
// tightest turn, how many berms, how close it comes to itself (and that no bit's mound reaches up onto the track beside it), the start hill (the gate's height, its level top - every slot on the gate the same
// height - its steepest pitch), the features down the straights, the berms' bank, that the surface has no steps (sampled
// on a 0.25 m grid over the track and its mounds), what's under the tyres, and
// that the grandstands are clear of it and that a course code round-trips. Env: SEEDS (default 3)
const W = require('../src/worldgen.js');
const SEEDS = +(process.env.SEEDS || 3);
let bad = 0;
for (const size of ['bmx', 'super']) for (const len of ['short', 'medium', 'long']) for (const jumps of ['small', 'big']) for (const bank of ['flat', 'steep']) for (const turns of ['flowing', 'windy', 'tight']) {
  const rows = [];
  for (let k = 0; k < SEEDS; k++) {
    const cfg = { ver: 'pedal', size, len, laps: 3, jumps, rhythm: 'lots', bank, turns, seed: 500 + k * 7717 };
    const code = W.uniCode(cfg), back = W.uniParse(code);
    if (!back || W.uniCode(back) !== code) { console.log('CODE ROUND TRIP FAILED', code); bad++; }
    const t0 = Date.now(); W.setUni(cfg); W.setMap('uni'); const T = W.track, ms = Date.now() - t0;
    let rmin = 1e9, close = 1e9;
    for (let i = 0; i < T.n; i++) rmin = Math.min(rmin, Math.abs(T.R[i]));
    for (let i = 0; i < T.n; i += 2) for (let j = 0; j < T.n; j += 2) { let ds = Math.abs(T.s[i] - T.s[j]); ds = Math.min(ds, T.L - ds); if (ds > 60) close = Math.min(close, Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j])); }
    // (the gate: its height, and the 8 slots across it level)
    const g = {}, hw = T.W / 2, slots = [];
    for (let s2 = 0; s2 < 8; s2++) { const lat = (s2 - 3.5) * Math.min(0.85, (T.W - 1) / 8), p = W.trackPoint(-2, {}); W.ground(p.x - p.tz * lat, p.z + p.tx * lat, g); slots.push(g.h); }
    const gateH = slots[0], gateSpread = Math.max(...slots) - Math.min(...slots);
    let face = 0; for (let s2 = 0; s2 < T.uE.Lr + 4; s2 += 0.5) { const a = W.trackPoint(s2, {}), b = W.trackPoint(s2 + 0.5, {}); face = Math.max(face, (W.ground(a.x, a.z, g).h - W.ground(b.x, b.z, {}).h) / 0.5); }
    // (no steps: neighbouring 0.25 m samples over the track and 6 m either side - on the track no more than a steep slope
    // apart, ~50 deg; down the mounds' sides ~60 deg; and no break - a jump still there 8 mm apart - on the track at all, nor more
    // than a few cm out on the mounds: deep in the inside of a tight turn, about as far out as its radius, where the
    // nearest bit of the line can flip from one side of the turn to the other)
    let step = 0, at = '', moundS = 0, brk = 0, atB = '', brkM = 0;
    for (let i = 0; i < T.n; i += 3) {
      for (let lat = -hw - 6; lat <= hw + 6; lat += 0.25) {
        const x = T.x[i] - T.tz[i] * lat, z = T.z[i] + T.tx[i] * lat, h0 = W.uniHeight(x, z), on = Math.abs(lat) <= hw;
        for (const [dx, dz] of [[0.25, 0], [0, 0.25]]) {
          const h1 = W.uniHeight(x + dx, z + dz), d = Math.abs(h1 - h0);
          if (on && d > step) { step = d; at = `s ${Math.round(T.s[i])} lat ${lat.toFixed(1)}`; }
          if (!on) moundS = Math.max(moundS, d);
          if (d > 0.08) {
            // (halved and halved again down to ~8 mm, following the bigger half: a slope or a crease shrinks away, a break doesn't)
            let ax = x, az = z, ha = h0, hb = h1, sx = dx, sz = dz;
            for (let q = 0; q < 5; q++) { sx /= 2; sz /= 2; const hm = W.uniHeight(ax + sx, az + sz); if (Math.abs(hm - ha) >= Math.abs(hb - hm)) hb = hm; else { ax += sx; az += sz; ha = hm; } }
            const g = Math.abs(hb - ha);
            if (!on) brkM = Math.max(brkM, g); else if (g > 0.02 && g > brk) { brk = g; atB = `s ${Math.round(T.s[i])} lat ${lat.toFixed(1)}`; }
          }
        }
      }
    }
    // (the grandstands: clear of every bit of the track)
    const ST = W.trackProps().stands; let standHit = false;
    if (ST) for (let i = 0; i < T.n; i++) { const cx = Math.max(ST.x, Math.min(ST.x + ST.d, T.x[i])), cz = Math.max(ST.z0, Math.min(ST.z1, T.z[i])); if (Math.hypot(T.x[i] - cx, T.z[i] - cz) < hw + 1) standHit = true; }
    const kinds = {}; for (const f of T.uFeats) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    const bankMax = T.uTurns.length ? Math.max(...T.uTurns.map((b) => b.H)) : 0;
    const why = [ms > 2000 && 'SLOW', gateSpread > 0.05 && 'GATE NOT LEVEL', face > 0.75 && 'FACE TOO STEEP', step > 0.3 && 'TOO STEEP ' + at, moundS > 0.45 && 'MOUND TOO STEEP', brk > 0 && 'STEP ' + atB, brkM > 0.15 && 'MOUND STEP', close < T.W + 7 && 'TOO CLOSE', T.uIntr > 0.05 && 'MOUNDS ON THE TRACK', standHit && 'STANDS ON THE TRACK'].filter(Boolean);
    if (why.length) bad++;
    rows.push(`${code} ${ms}ms L ${Math.round(T.L)} Rmin ${rmin.toFixed(1)} close ${close.toFixed(0)} turns ${T.uTurns.length} gate ${gateH.toFixed(1)} m (level ±${gateSpread.toFixed(2)}) face ${(face * 100).toFixed(0)}% berms ${bankMax.toFixed(1)} m steepest ${step.toFixed(2)} (mounds ${moundS.toFixed(2)}, breaks ${brkM.toFixed(2)}) ${Object.entries(kinds).map(([a, b]) => a + ' ' + b).join(' ')}${why.length ? ' PROBLEM: ' + why.join(', ') : ''}`);
  }
  console.log(`== ${size} ${len} ${turns} jumps ${jumps} bank ${bank}\n  ` + rows.join('\n  '));
}
console.log(bad ? `${bad} PROBLEMS` : 'all ok');
