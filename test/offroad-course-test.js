// Offroad Racing courses: every terrain x length x corners, a few seeds each - how long generating takes, the course's
// length against the target, its tightest corner, how close it comes to itself (other than along it), the steepest grade
// on it, the jumps / whoops built in, the surfaces on it, and that the same settings give the same course (the course
// code round-trips). Env: SEEDS (default 4)
const W = require('../src/worldgen.js');
const SEEDS = +(process.env.SEEDS || 4);
const surfName = ['asphalt', 'gravel', 'grass', 'dirt', 'mud', 'prepped', 'sand'];
let bad = 0;
for (const biome of Object.keys(W.OFF_BIOMES)) for (const len of ['short', 'medium', 'long']) for (const twist of ['flowing', 'mixed', 'technical']) {
  const rows = [];
  for (let k = 0; k < SEEDS; k++) {
    const cfg = { biome, len, twist, laps: 3, width: 'normal', jumps: 'lots', whoops: 'some', seed: 1000 + k * 7919 };
    const code = W.offCode(cfg), back = W.offParse(code);
    if (!back || W.offCode(back) !== code) { console.log('CODE ROUND TRIP FAILED', code); bad++; }
    const t0 = Date.now(); W.setOffroad(cfg); W.setMap('offroad'); const T = W.track, ms = Date.now() - t0;
    let rmin = 1e9, grade = 0, gradeB = 0, close = 1e9;
    for (let i = 0; i < T.n; i++) { rmin = Math.min(rmin, Math.abs(T.R[i])); const j = (i + 1) % T.n; grade = Math.max(grade, Math.abs(T.hc[j] - T.hc[i]) / (T.L / T.n)); gradeB = Math.max(gradeB, Math.abs(T.hb[j] - T.hb[i]) / (T.L / T.n)); }
    for (let i = 0; i < T.n; i += 3) for (let j = 0; j < T.n; j += 3) { let ds = Math.abs(T.s[i] - T.s[j]); ds = Math.min(ds, T.L - ds); if (ds > 150) close = Math.min(close, Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j])); }
    // (surfaces down the middle of the course)
    const sc = {}, g = {}; for (let i = 0; i < T.n; i += 5) { W.ground(T.x[i], T.z[i], g); sc[surfName[g.surface]] = (sc[surfName[g.surface]] || 0) + 1; }
    const st = W.trackSpawn(), st0 = Math.hypot(st.x, st.z - 14) < 1.5 && st.tz < -0.98;
    const J = T.feats.filter((f) => f.kind === 'jump').length, Wh = T.feats.filter((f) => f.kind === 'whoops').length;
    if (ms > 2500 || Math.abs(T.L / W.OFF_LEN[len] - 1) > 0.05 || !st0 || gradeB > W.OFF_BIOMES[biome].grade + 0.005) bad++;
    rows.push(`${code} ${ms}ms L ${Math.round(T.L)} Rmin ${rmin.toFixed(0)} close ${close.toFixed(0)} grade ${(gradeB * 100).toFixed(0)}% (${(grade * 100).toFixed(0)}% w/ jumps) dig ${T.dig.toFixed(1)} m J${J} W${Wh} ${Object.entries(sc).map(([a, b]) => a + ' ' + Math.round(100 * b / (T.n / 5)) + '%').join(' ')}${st0 ? '' : ' START?'}`);
  }
  console.log(`== ${biome} ${len} ${twist}\n  ` + rows.join('\n  '));
}
// (deterministic: the same code twice gives the same course)
{ const c = W.offParse('DES-M3TW21-ABC12'); W.setOffroad(c); W.setMap('country'); W.setMap('offroad'); const a = Array.from(W.track.hc.slice(0, 50)).join(); W.setMap('country');
  W.setOffroad(W.offParse('DES-M3TW21-ABC12')); W.setMap('offroad'); if (Array.from(W.track.hc.slice(0, 50)).join() !== a) { console.log('NOT DETERMINISTIC'); bad++; } }
console.log(bad ? `${bad} PROBLEMS` : 'all ok');
