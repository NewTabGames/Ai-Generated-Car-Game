// The ATV and the diesel dually, per version: launch (0-30 / 60 / 100, the quarter mile), top speed, 60-0 (30-0 for the
// 200 quad), keyboard turns on tarmac and dirt (lateral g, roll, wheel lift, roll-overs), a wheel-on-the-limit step
// steer, and the diesel's spool / soot figures. Env: CARS (id:key,...), TC (0-3)
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf || 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qw * v.qx - v.qy * v.qz))));
const deg = (x) => (x * 57.3).toFixed(0);
function mk(id, key, world) {
  const def = CARS[id].make(key), sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle(world || flat(), sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = +(process.env.TC || 1); for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, def, sp };
}
const kbLim = (def, sp, s) => Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, s * s)) / sp.maxSteer);
function run(id, key) {
  const out = [];
  { const { v } = mk(id, key); const T = {}; let t = 0, qm = null, mxP = 0, mxB = 0, sootT = 0, rpm30 = 0;
    for (; t < 60; t += 1 / 120) {
      v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH;
      for (const m of [30, 60, 100]) if (T[m] === undefined && s >= m) { T[m] = t.toFixed(2); if (m === 30) rpm30 = Math.round(v.rpm()); }
      if (qm === null && -v.pz >= 402.3) qm = `${t.toFixed(2)} s @ ${s.toFixed(0)}`;
      mxP = Math.max(mxP, -pitchOf(v)); mxB = Math.max(mxB, v.wheelieBarLoad || 0);
      if (v.spec.turbo) sootT += Math.max(0, v.thrEff - (v.spool || 0)) / 120;
    }
    out.push(`launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x).join(' · ')} · 1/4 ${qm} · top ${(v.forwardSpeed * MPH).toFixed(0)} mph (${v.gearLabel()} ${Math.round(v.rpm())} rpm) · rpm at 30 ${rpm30} · nose up ${deg(mxP)} deg${mxB ? ' · bar ' + mxB.toFixed(0) + ' N' : ''}${v.spec.turbo ? ' · lag-soot ' + sootT.toFixed(2) : ''}`); }
  { const { v } = mk(id, key); const top = id === 'atv' && key === 'sport' ? 30 : 60;
    for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < top; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0, lock = 0; for (; t < 10 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); if (v.wheels.some((w) => Math.abs(w.omega) < 0.5)) lock++; }
    out.push(`${top}-0 ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft${lock ? ' (a wheel locked ' + (lock / 120).toFixed(1) + ' s)' : ''}`); }
  // keyboard full turn at speed, 4 s: lateral g, max roll, a wheel off the ground, rolled over?
  const row = [];
  for (const mph of [15, 25, 40, 60]) for (const surf of [0, 3]) {
    const { v, def, sp } = mk(id, key, flat(surf)); for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 3) continue;
    let mxR = 0, over = false, aLat = 0, lift = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 0.4; v.input.steer = kbLim(def, sp, v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2) over = true; aLat = v.forwardSpeed * -v.wy; if (v.wheels.some((w) => !w.contact)) lift += 1 / 120; }
    row.push(`${mph}${surf ? 'd' : 'a'}:${(aLat / 9.81).toFixed(2)}g r${deg(mxR)}${lift > 0.05 ? ' lift' + lift.toFixed(1) : ''}${over ? ' OVER' : ''}`);
  }
  out.push('kb turn ' + row.join(' · '));
  // full lock with a wheel (no keyboard limit), 3 s, tarmac: does it go over?
  const row2 = [];
  for (const mph of [15, 25, 35, 50]) {
    const { v } = mk(id, key); for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 3) continue;
    let mxR = 0, over = false, aMax = 0;
    for (let t = 0; t < 3; t += 1 / 120) { v.input.throttle = 0.3; v.input.steer = Math.min(1, t * 3); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2) over = true; aMax = Math.max(aMax, Math.abs(v.forwardSpeed * v.wy)); }
    row2.push(`${mph}:${(aMax / 9.81).toFixed(2)}g r${deg(mxR)}${over ? ' OVER' : ''}`);
  }
  out.push('full lock ' + row2.join(' · '));
  console.log(`== ${id}:${key}\n  ` + out.join('\n  '));
}
const list = (process.env.CARS || 'atv:sport,atv:race,atv:turbo,diesel:stock,diesel:built,diesel:pull').split(',');
for (const c of list) { const [id, key] = c.split(':'); run(id, key); }
