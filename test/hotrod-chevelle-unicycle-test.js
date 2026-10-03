// The hot rod, the Chevelle and the unicycle (pedal, improved pedal and jet): launch (0-30 / 60 / 100, the quarter mile), top speed, a
// stop from 60 (30 / 10 for the unicycle), keyboard turns (lateral g, roll, a wheel lifting, over?) and - the unicycle -
// how far it pitches and leans, riding, braking and turning. Env: CARS (id[:key],...), TC (0-3)
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf || 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qw * v.qx - v.qy * v.qz))));
const deg = (x) => (x * 57.3).toFixed(0);
function mk(id, key, world) {
  const def = CARS[id].make ? CARS[id].make(key) : CARS[id], sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle(world || flat(), sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = +(process.env.TC || 0); for (const w of v.wheels) w.temp = 50;
  if (sp.jet) { v.jetN = sp.jet.idle; }
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, def, sp };
}
const kbLim = (def, sp, s) => !def.kbLat ? 1 : Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, s * s)) / sp.maxSteer);
function run(id, key) {
  const out = [], UNI = id === 'unicycle';
  { const { v } = mk(id, key); const T = {}; let t = 0, qm = null, mxP = 0, mxR = 0;
    for (; t < 60; t += 1 / 120) {
      v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH;
      for (const m of UNI ? [5, 10, 30, 60] : [30, 60, 100]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(1);
      if (qm === null && -v.pz >= 402.3) qm = `${t.toFixed(2)} s @ ${s.toFixed(0)}`;
      mxP = Math.max(mxP, Math.abs(pitchOf(v))); mxR = Math.max(mxR, Math.abs(rollOf(v)));
    }
    out.push(`launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x).join(' · ')} · 1/4 ${qm} · top ${(v.forwardSpeed * MPH).toFixed(1)} mph (${v.gearLabel()} ${Math.round(v.rpm())} rpm) · pitch max ${deg(mxP)} roll max ${deg(mxR)}`); }
  { const { v } = mk(id, key); const from = UNI ? (key === 'jet' ? 30 : 10) : 60;
    for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < from; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0, mxP = 0; for (; t < 20 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); mxP = Math.max(mxP, Math.abs(pitchOf(v))); }
    out.push(`${from}-0 ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft in ${t.toFixed(1)} s · pitch max ${deg(mxP)}`); }
  const row = [];
  for (const mph of UNI ? (key === 'jet' ? [8, 30, 60] : [5, 10]) : [30, 50, 80]) {
    const { v, def, sp } = mk(id, key); for (let i = 0; i < 120 * 60 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 2) continue;
    let mxR = 0, over = false, aLat = 0, lift = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = UNI && key !== 'jet' ? 0.6 : 0.3; v.input.steer = kbLim(def, sp, v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2 || Math.abs(pitchOf(v)) > 1.0) over = true; aLat = v.forwardSpeed * -v.wy; if (!UNI && v.wheels.some((w) => !w.contact)) lift += 1 / 120; }
    row.push(`${mph}:${(aLat / 9.81).toFixed(2)}g r${deg(mxR)}${lift > 0.05 ? ' lift' + lift.toFixed(1) : ''}${over ? ' OVER' : ''}`);
  }
  out.push('kb turn ' + row.join(' · '));
  if (UNI) {
    // full lock at speed (a wheel's full turn, no keyboard limit) - the physics holds it to what the rider can ride
    const { v } = mk(id, key); for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < (key === 'jet' ? 50 : 10); i++) { v.input.throttle = 1; v.step(1 / 120); }
    let mxR = 0, over = false, aMax = 0;
    for (let t = 0; t < 3; t += 1 / 120) { v.input.throttle = 0.5; v.input.steer = 1; v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); aMax = Math.max(aMax, Math.abs(v.forwardSpeed * v.wy)); if (Math.abs(rollOf(v)) > 1.2 || Math.abs(pitchOf(v)) > 1.0) over = true; }
    out.push(`full lock at ${(v.forwardSpeed * MPH).toFixed(0)} mph: ${(aMax / 9.81).toFixed(2)} g, lean ${deg(mxR)}${over ? ' OVER' : ''}`);
  }
  console.log(`== ${id}${key ? ':' + key : ''}\n  ` + out.join('\n  '));
}
for (const c of (process.env.CARS || 'hotrod,chevelle,unicycle:pedal,unicycle:improved,unicycle:jet').split(',')) { const [id, key] = c.split(':'); run(id, key); }
