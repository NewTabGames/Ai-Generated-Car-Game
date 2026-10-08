// Offroad Racing: drive generated courses for real - a simple driver (follows the centre line looking ahead, slows for
// the corners and the brows it sees coming, has less grip to turn with downhill, the air assist on) takes each vehicle
// round a lap of each terrain's course on the full physics and ground (berms, jumps, whoops, mud, sand, grades). Reports
// the lap time and average speed, the longest time in the air, the worst roll and pitch, and whether it got stuck (under
// 1 m/s for 6 s), went off (15 m+ from the line) or rolled over. The driver's speeds are set for the trophy truck (the
// default); other vehicles want gentler ones. Env: CARS (id[:option],...), BIOMES, LEN (short | medium | long), SEED,
// JUMPS, WHOOPS, AA=0 (air assist off), DEBUG (a trace of the last seconds before a failure)
const W = require('../src/worldgen.js');
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694, DT = 1 / 120;
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qw * v.qx - v.qy * v.qz))));
const up = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
function drive(id, key, biome) {
  W.setOffroad({ biome, len: process.env.LEN || 'short', twist: 'mixed', width: 'normal', jumps: process.env.JUMPS || 'some', whoops: process.env.WHOOPS || 'some', laps: 1, seed: +(process.env.SEED || 4242) });
  W.setMap('offroad');
  const T = W.track, def = CARS[id].make ? CARS[id].make(key) : CARS[id], sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle({ C: W.C, ground: W.ground, collidersNear: W.collidersNear }, sp);
  v.setTires(sp.frontTire, sp.rearTire);
  const st = W.trackSpawn(); v.reset(st.x, W.ground(st.x, st.z, {}).h, st.z, st.tx, st.tz);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 1; for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(DT); } v.input.brake = 0;
  const q = {}, p = {}, muG = { dunes: 3.6, forest: 4.5, desert: 4.5, mud: 3.4, mountain: 4.2 }[biome], vCap = { dunes: 28, forest: 31, desert: 40, mud: 24, mountain: 29 }[biome];
  const trace = [];
  let t = 0, s0 = null, dist = 0, prevS = null, air = 0, airMax = 0, mxR = 0, mxP = 0, slow = 0, stuck = false, off = false, over = false, sumV = 0;
  for (; t < 900; t += DT) {
    W.trackQuery(v.px, v.pz, q);
    if (q.i < 0 || q.d > 15) { off = true; break; }
    if (prevS === null) { prevS = q.s; s0 = q.s; } else { let ds = q.s - prevS; if (ds > T.L / 2) ds -= T.L; else if (ds < -T.L / 2) ds += T.L; dist += ds; prevS = q.s; }
    if (dist >= T.L) break;
    const spd = Math.hypot(v.vx, v.vz), la = 8 + spd * 0.8;
    // (the corner coming: the tightest radius over the next couple of seconds sets the speed)
    let Rmin = 1e4; for (let a = 5; a < 10 + spd * 2.2; a += 4) { W.trackPoint(q.s + a, p); Rmin = Math.min(Rmin, Math.abs(p.R)); }
    // (and the brows coming: over a crest of vertical radius Rv the car goes light past sqrt(g Rv))
    // (less grip to turn with going downhill - the brakes want some of it)
    const gr = (T.hc[(q.i + 6) % T.n] - T.hc[q.i]) / (6 * T.L / T.n);
    let vt = Math.min(vCap, Math.sqrt(muG * (1 + 2.5 * Math.min(0, gr)) * Rmin));
    for (let a = 6; a < 12 + spd * 1.5; a += 4) { const hp = (k) => { const ff = (((q.s + k) % T.L) + T.L) % T.L / T.L * T.n; return T.hc[Math.floor(ff) % T.n]; }; const kv = (hp(a - 8) - 2 * hp(a) + hp(a + 8)) / 64; if (kv < -1e-4) vt = Math.min(vt, Math.sqrt(9.81 / -kv)); }
    W.trackPoint(q.s + la, p);
    const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), rx = 1 - 2 * (v.qy * v.qy + v.qz * v.qz), rz = 2 * (v.qx * v.qz - v.qy * v.qw);
    const dx = p.x - v.px, dz = p.z - v.pz, alpha = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const delta = Math.atan(2 * sp.wheelbase * Math.sin(alpha) / la);
    const air0 = v.wheels.every((w) => !w.contact);
    v.input.steer = air0 ? 0 : Math.max(-1, Math.min(1, delta / sp.maxSteer));
    v.input.airAssist = process.env.AA !== '0';
    const e = vt - spd;
    v.input.throttle = Math.max(0, Math.min(1, 0.4 + e * 0.35)); v.input.brake = e < -2.5 ? Math.min(0.55, -e * 0.08) : 0;
    v.step(DT);
    sumV += spd;
    if (process.env.DEBUG && Math.round(t / DT) % 30 === 0) { const g = {}; W.ground(v.px, v.pz, g); trace.push(`s ${q.s.toFixed(0)} sd ${q.sd.toFixed(1)} v ${(spd * MPH).toFixed(0)} vt ${(vt * MPH).toFixed(0)} R ${Math.round(T.R[q.i])} surf ${g.surface} air ${v.wheels.filter((w) => !w.contact).length} steer ${v.input.steer.toFixed(2)} thr ${v.input.throttle.toFixed(1)} brk ${v.input.brake.toFixed(1)} gear ${v.gearLabel()}`); if (trace.length > 30) trace.shift(); }
    const inAir = v.wheels.every((w) => !w.contact); air = inAir ? air + DT : 0; airMax = Math.max(airMax, air);
    mxR = Math.max(mxR, Math.abs(rollOf(v))); mxP = Math.max(mxP, Math.abs(pitchOf(v)));
    if (up(v) < 0.1) { over = true; break; }
    slow = spd < 1 ? slow + DT : 0; if (slow > 6) { stuck = true; break; }
  }
  const lap = dist >= T.L;
  if (process.env.DEBUG && !lap) console.log('    ' + trace.join('\n    '));
  return `${W.offCode(W.offroad)} ${(T.L / 1000).toFixed(1)} km: ${lap ? 'lap ' + t.toFixed(1) + ' s, avg ' + (sumV / (t / DT) * MPH).toFixed(0) + ' mph' : 'NO LAP (' + Math.round(dist) + ' m in ' + t.toFixed(0) + ' s)'}`
    + ` · air max ${airMax.toFixed(2)} s · roll ${(mxR * 57.3).toFixed(0)} pitch ${(mxP * 57.3).toFixed(0)}${stuck ? ' STUCK' : ''}${off ? ' OFF' : ''}${over ? ' ROLLED' : ''}`;
}
const cars = (process.env.CARS || 'trophy:tt').split(',');
const biomes = (process.env.BIOMES || 'dunes,forest,desert,mud,mountain').split(',');
for (const c of cars) {
  const [id, key] = c.split(':');
  console.log('== ' + id + (key ? ':' + key : ''));
  for (const b of biomes) console.log('  ' + b.padEnd(9) + drive(id, key, b));
}
