// The RC monster truck (brushed 2S, brushless 3S, brushless 6S): launch (0-10 / 20 / 30 / 40 mph), top speed, a stop
// from 20, keyboard turns at 10 / 20 / 30 mph (lateral g, roll, rolled over?), a drive over a bumpy patch (does the
// tiny suspension stay settled?) and that nothing goes NaN
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const world = (bumps) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = bumps && z < -5 ? 0.012 * Math.sin(z * 9) * Math.sin(x * 7) : 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qw * v.qx - v.qy * v.qz))));
function mk(key, bumps) {
  const def = CARS.rc.make(key), sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle(world(bumps), sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.park = false; v.gear = 1; v.tcMode = +(process.env.TC || 3);
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, def, sp };
}
const kbLim = (def, sp, s) => Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, s * s)) / sp.maxSteer);
let bad = 0;
for (const key of ['brushed', 'bl3s', 'bl6s']) {
  const out = [];
  { const { v } = mk(key); const T = {}; let mxP = 0;
    for (let t = 0; t < 20; t += 1 / 120) {
      v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH;
      for (const m of [10, 20, 30, 40]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(2);
      mxP = Math.max(mxP, pitchOf(v));
    }
    if (!isFinite(v.px)) bad++;
    out.push(`launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x).join(' · ')} · top ${(v.forwardSpeed * MPH).toFixed(1)} mph (${Math.round(v.rpm())} rpm) · nose up max ${(mxP * 57.3).toFixed(0)} deg`); }
  { const { v } = mk(key);
    for (let i = 0; i < 120 * 20 && v.forwardSpeed * MPH < 20; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0; for (; t < 10 && v.forwardSpeed > 0.05; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
    out.push(`20-0 ${(Math.abs(v.pz - z0) * 3.281).toFixed(1)} ft in ${t.toFixed(2)} s`); }
  const row = [];
  for (const mph of [10, 20, 30]) {
    const { v, def, sp } = mk(key); for (let i = 0; i < 120 * 20 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 1) continue;
    let mxR = 0, over = false, aLat = 0;
    for (let t = 0; t < 3; t += 1 / 120) { v.input.throttle = 0.3; v.input.steer = kbLim(def, sp, v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2) over = true; aLat = v.forwardSpeed * -v.wy; }
    row.push(`${mph}:${(aLat / 9.81).toFixed(2)}g r${(mxR * 57.3).toFixed(0)}${over ? ' OVER' : ''}`);
  }
  out.push('kb turn ' + row.join(' · '));
  { const { v } = mk(key, true); let mxB = 0, n = 0;
    for (let t = 0; t < 6; t += 1 / 120) { v.input.throttle = 0.5; v.step(1 / 120); const b = Math.abs(v.wx) + Math.abs(v.wz); if (t > 1) { mxB = Math.max(mxB, b); n++; } }
    if (!isFinite(v.px) || !isFinite(v.vy)) bad++;
    out.push(`bumpy run: ${(v.forwardSpeed * MPH).toFixed(1)} mph, peak pitch/roll rate ${mxB.toFixed(1)} rad/s, ${isFinite(v.px) ? 'ok' : 'NaN'}`); }
  console.log(`== rc:${key}\n  ` + out.join('\n  '));
}
if (bad) { console.log('FAIL: NaN'); process.exit(1); }
