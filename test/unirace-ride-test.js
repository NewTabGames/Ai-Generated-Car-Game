// Unicycle Racing: ride generated BMX tracks for real - a simple rider (follows the centre line looking ahead, slows for
// the turns it sees coming - faster through a banked berm than a flat one - the air assist on) takes each unicycle round
// a lap on the full physics and the track's exact surface (the start hill, rollers, doubles, tabletops, berms). Reports
// the lap time and average speed, the longest time in the air, the worst lean and pitch, the fastest it took a berm, and
// whether it fell (over 70 deg of lean or 55 of pitch), went off the track (8 m+ from the line) or got stuck.
// Env: VERS (pedal,improved,jet), TURNS (flowing | windy | tight), SIZE (bmx | super - default bmx, super for the jet, as the game sets it), LEN, BANK, JUMPS, SEED, AA=0, DEBUG
const W = require('../src/worldgen.js');
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694, DT = 1 / 120;
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qw * v.qx - v.qy * v.qz))));
function ride(ver, bank) {
  W.setUni({ ver, size: process.env.SIZE || (ver === 'jet' ? 'super' : 'bmx'), len: process.env.LEN || 'medium', laps: 1, jumps: process.env.JUMPS || 'medium', rhythm: 'some', bank, turns: process.env.TURNS || 'windy', seed: +(process.env.SEED || 777) });
  W.setMap('uni');
  const T = W.track, def = CARS.unicycle.make(ver), sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle({ C: W.C, ground: W.ground, collidersNear: W.collidersNear }, sp);
  v.setTires(sp.frontTire, sp.rearTire);
  const p0 = W.trackPoint(-2, {}); v.reset(p0.x, W.ground(p0.x, p0.z, {}).h, p0.z, p0.tx, p0.tz);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 1;
  if (sp.jet) v.jetN = sp.jet.idle;
  for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(DT); } v.input.brake = 0;
  const q = {}, p = {}, g = {}, trace = [];
  let kU = 1, sdPrev = 0, t = 0, prevS = null, dist = 0, air = 0, airMax = 0, mxR = 0, mxP = 0, slow = 0, stuck = false, off = false, fell = false, sumV = 0, bermV = 0;
  for (; t < 400; t += DT) {
    W.trackQuery(v.px, v.pz, q);
    if (q.i < 0 || q.d > 8) { off = true; break; }
    if (prevS === null) prevS = q.s; else { let ds = q.s - prevS; if (ds > T.L / 2) ds -= T.L; else if (ds < -T.L / 2) ds += T.L; dist += ds; prevS = q.s; }
    if (dist >= T.L) break;
    const spd = Math.hypot(v.vx, v.vz), la = 4 + spd * 0.6;
    // (the turns coming: on a berm the bowl carries it - the bank's slope halfway up it, g x that more grip - and the
    // speed now that still slows to each in time, braking ~0.25 g, the time in the air not counting)
    let vt = 1e3;
    for (let a = 2; a < 12 + spd * 3.5; a += 2) {
      W.trackPoint(q.s + a, p);
      const bermH = (T.uTurns.find((b) => q.s + a > b.s0 - 2 && q.s + a < b.s1 + 2) || {}).H || 0;
      const vc = Math.sqrt((sp.steerAScale * 0.72 + 9.81 * bermH / T.W) * Math.abs(p.R));
      vt = Math.min(vt, Math.sqrt(vc * vc + 2 * 2.5 * Math.max(0, a - 4 - spd * 0.8)));
    }
    W.trackPoint(q.s + la, p);
    const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), rx = 1 - 2 * (v.qy * v.qy + v.qz * v.qz), rz = 2 * (v.qx * v.qz - v.qy * v.qw);
    const dx = p.x - v.px, dz = p.z - v.pz, alpha = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const delta = Math.atan(2 * sp.wheelbase * Math.sin(alpha) / la), f = Math.min(1, Math.atan(sp.wheelbase * sp.steerAScale / Math.max(0.25, spd * spd)) / sp.maxSteer);
    const inAir = v.wheels.every((w) => !w.contact);
    v.input.steer = inAir ? 0 : Math.max(-1, Math.min(1, delta / (sp.maxSteer * f)));
    v.input.airAssist = process.env.AA !== '0';
    // (running wide at full lock - the jet's thrust up a climb pushes it on - it backs off till the line comes back)
    const wide = Math.abs(v.input.steer) > 0.98 && Math.abs(q.sd) > Math.abs(sdPrev) && Math.abs(q.sd) > 0.5; sdPrev = q.sd;
    kU = wide ? Math.max(0.6, kU - DT * 0.4) : Math.min(1, kU + DT * 0.2); vt *= kU;
    const e = vt - spd;
    // (easing off as it comes up to the speed it wants - half a jet's thrust is a lot)
    v.input.throttle = Math.max(0, Math.min(1, 0.25 + e * 0.5)); v.input.brake = e < -1 ? Math.min(1, -e * 0.3) : 0;
    v.step(DT);
    sumV += spd;
    if (T.uTurns.some((b) => q.s > b.s0 && q.s < b.s1)) bermV = Math.max(bermV, spd);
    air = inAir ? air + DT : 0; airMax = Math.max(airMax, air);
    const r = Math.abs(rollOf(v)), pt = Math.abs(pitchOf(v)); mxR = Math.max(mxR, r); mxP = Math.max(mxP, pt);
    if (process.env.DEBUG && Math.round(t / DT) % 15 === 0) { W.ground(v.px, v.pz, g); trace.push(`s ${q.s.toFixed(1)} sd ${q.sd.toFixed(2)} v ${(spd * MPH).toFixed(1)} vt ${(vt * MPH).toFixed(1)} R ${Math.round(T.R[Math.min(T.n - 1, Math.round(q.s))])} h ${g.h.toFixed(2)} air ${inAir ? 1 : 0} roll ${(r * 57.3).toFixed(0)} pitch ${(pt * 57.3).toFixed(0)} steer ${v.input.steer.toFixed(2)}`); if (trace.length > 24) trace.shift(); }
    if (r > 1.22 || pt > 0.96) { fell = true; break; }
    slow = spd < 0.4 ? slow + DT : 0; if (slow > 6) { stuck = true; break; }
  }
  const lap = dist >= T.L;
  if (process.env.DEBUG && !lap) console.log('    ' + trace.join('\n    '));
  return `${W.uniCode(W.uni)} ${Math.round(T.L)} m: ${lap ? 'lap ' + t.toFixed(1) + ' s, avg ' + (sumV / (t / DT) * MPH).toFixed(1) + ' mph' : 'NO LAP (' + Math.round(dist) + ' m in ' + t.toFixed(0) + ' s)'}`
    + ` · berms up to ${(bermV * MPH).toFixed(0)} mph · air max ${airMax.toFixed(2)} s · lean ${(mxR * 57.3).toFixed(0)} pitch ${(mxP * 57.3).toFixed(0)}${stuck ? ' STUCK' : ''}${off ? ' OFF' : ''}${fell ? ' FELL' : ''}`;
}
for (const ver of (process.env.VERS || 'pedal,improved,jet').split(',')) {
  console.log('== ' + ver);
  for (const bank of (process.env.BANK || 'flat,banked,steep').split(',')) console.log('  ' + bank.padEnd(7) + ride(ver, bank));
}
