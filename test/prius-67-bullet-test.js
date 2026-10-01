// The Prius, the 67 and the Silver Bullet: launch (0-30 / 60 / 100 / 200, the quarter mile), top speed (and the revs it
// gets there at), 60-0, keyboard turns on tarmac (lateral g, roll, a wheel lifting), and the Prius's split between the
// engine and the motor. Env: CARS (id,...), TC (0-3)
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf || 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const deg = (x) => (x * 57.3).toFixed(0);
function mk(id, world) {
  const def = CARS[id].make ? CARS[id].make() : CARS[id], sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle(world || flat(), sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = +(process.env.TC || 0); for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, def, sp };
}
const kbLim = (def, sp, s) => !def.kbLat ? 1 : Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, s * s)) / sp.maxSteer);
function run(id) {
  const out = [];
  { const { v } = mk(id); const T = {}, R = {}; let t = 0, qm = null, mT = 0, mE = 0;
    for (; t < 90; t += 1 / 120) {
      v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH;
      for (const m of [30, 60, 100, 150, 200]) if (T[m] === undefined && s >= m) { T[m] = t.toFixed(1); R[m] = Math.round(v.rpm()); }
      if (qm === null && -v.pz >= 402.3) qm = `${t.toFixed(2)} s @ ${s.toFixed(0)}`;
      if (v.spec.hybrid && s > 15 && s < 45) { mT += Math.abs(v.motorT || 0) * v.spec.hybrid.ratio; mE += Math.abs(v.lastTin || 0); }
    }
    out.push(`launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x + ` (${R[k]})`).join(' · ')} · 1/4 ${qm} · top ${(v.forwardSpeed * MPH).toFixed(0)} mph (${v.gearLabel()} ${Math.round(v.rpm())} rpm)`
      + (v.spec.hybrid ? ` · 15-45 mph: motor ${(100 * mT / (mT + mE)).toFixed(0)} % of the drive` : '')); }
  { const { v } = mk(id);
    for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < 60; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0; for (; t < 10 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
    out.push(`60-0 ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft`); }
  const row = [];
  for (const mph of [30, 50, 80]) {
    const { v, def, sp } = mk(id); for (let i = 0; i < 120 * 60 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 3) continue;
    let mxR = 0, over = false, aLat = 0, lift = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 0.3; v.input.steer = kbLim(def, sp, v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2) over = true; aLat = v.forwardSpeed * -v.wy; if (v.wheels.some((w) => !w.contact)) lift += 1 / 120; }
    row.push(`${mph}:${(aLat / 9.81).toFixed(2)}g r${deg(mxR)}${lift > 0.05 ? ' lift' + lift.toFixed(1) : ''}${over ? ' OVER' : ''}`);
  }
  out.push('kb turn ' + row.join(' · '));
  console.log(`== ${id}\n  ` + out.join('\n  '));
}
for (const id of (process.env.CARS || 'prius,sixseven,silverbullet').split(',')) run(id);
