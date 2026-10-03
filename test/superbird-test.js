// The Superbird's three engines (440 four-barrel, 440 Six Barrel, 426 Hemi): launch (0-30 / 60 / 100, the quarter mile),
// top speed, a stop from 60, keyboard turns - and what the nose and the wing push down at 60 / 100 / 150 mph
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
function mk(key) {
  const def = CARS.superbird.make(key), sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle(flat, sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = +(process.env.TC || 0); for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, def, sp };
}
const kbLim = (def, sp, s) => Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, s * s)) / sp.maxSteer);
for (const key of ['c440', 'six', 'hemi']) {
  const out = [];
  { const { v } = mk(key); const T = {}; let qm = null;
    for (let t = 0; t < 60; t += 1 / 120) {
      v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH;
      for (const m of [30, 60, 100]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(1);
      if (qm === null && -v.pz >= 402.3) qm = `${t.toFixed(2)} s @ ${s.toFixed(0)}`;
    }
    out.push(`launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x).join(' · ')} · 1/4 ${qm} · top ${(v.forwardSpeed * MPH).toFixed(1)} mph (${v.gearLabel()} ${Math.round(v.rpm())} rpm)`); }
  { const { v } = mk(key);
    for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < 60; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0; for (; t < 20 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
    out.push(`60-0 ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft in ${t.toFixed(1)} s`); }
  const row = [];
  for (const mph of [30, 50, 80]) {
    const { v, def, sp } = mk(key); for (let i = 0; i < 120 * 60 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    let mxR = 0, over = false, aLat = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 0.3; v.input.steer = kbLim(def, sp, v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2) over = true; aLat = v.forwardSpeed * -v.wy; }
    row.push(`${mph}:${(aLat / 9.81).toFixed(2)}g r${(mxR * 57.3).toFixed(0)}${over ? ' OVER' : ''}`);
  }
  out.push('kb turn ' + row.join(' · '));
  { const sp = CARS.superbird.make(key).spec, q = (mph) => 0.5 * 1.225 * Math.pow(mph / MPH, 2);
    out.push('downforce ' + [60, 100, 150].map((m) => `${m} mph ${Math.round(sp.wings.reduce((a, w) => a + w.ClA, 0) * q(m) / 4.448)} lb`).join(' · ')); }
  console.log(`== superbird:${key}\n  ` + out.join('\n  '));
}
