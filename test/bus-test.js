// The tour coach (stock / tuned / race) and the derby bus (DT466 / 454 / blown 572, cowcatcher on and off): launch
// (0-30 / 60 / 100), the quarter mile, top speed after a minute, a stop from 50, keyboard turns (lateral g, roll, a wheel
// lifting, over?); the derby bus off an arena-sized kicker (2.5 m lip) - how hard it rebounds off the landing and how
// long it takes to settle (it pogoed: a rebound near the impact speed, seconds of bouncing)
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
function mk(id, key, cow) {
  const def = CARS[id].make(key), sp = JSON.parse(JSON.stringify(Object.assign({}, def.spec, cow === false ? CARS[id].cow.off : {})));
  const v = new Vehicle(flat, sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 0; for (const w of v.wheels) w.temp = 50;
  if (sp.turbo) v.spool = 0;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, def, sp };
}
const kbLim = (def, sp, s) => Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, s * s)) / sp.maxSteer);
let bad = 0;
for (const [id, key, cow] of [['coach', 'stock'], ['coach', 'tuned'], ['coach', 'race'], ['busderby', 'dt466'], ['busderby', 'bigblock'], ['busderby', 'blown'], ['busderby', 'dt466', false]]) {
  const out = [];
  { const { v } = mk(id, key, cow); const T = {}; let qm = null;
    for (let t = 0; t < 70; t += 1 / 120) {
      v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH;
      for (const m of [30, 60, 100]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(1);
      if (qm === null && -v.pz >= 402.3) qm = `${t.toFixed(1)} s @ ${s.toFixed(0)}`;
    }
    if (!isFinite(v.px)) bad++;
    out.push(`launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x).join(' · ')} · 1/4 ${qm} · at 70 s ${(v.forwardSpeed * MPH).toFixed(1)} mph (${v.gearLabel()} ${Math.round(v.rpm())} rpm)`); }
  { const { v } = mk(id, key, cow);
    for (let i = 0; i < 120 * 90 && v.forwardSpeed * MPH < 50; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0; for (; t < 30 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
    out.push(`50-0 ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft in ${t.toFixed(1)} s`); }
  const row = [];
  for (const mph of [20, 40, 60]) {
    const { v, def, sp } = mk(id, key, cow); for (let i = 0; i < 120 * 90 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 2) continue;
    let mxR = 0, over = false, aLat = 0, lift = 0;
    for (let t = 0; t < 5; t += 1 / 120) { v.input.throttle = 0.3; v.input.steer = kbLim(def, sp, v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2) over = true; aLat = v.forwardSpeed * -v.wy; if (v.wheels.some((w) => !w.contact)) lift += 1 / 120; }
    if (!isFinite(v.px)) bad++;
    row.push(`${mph}:${(aLat / 9.81).toFixed(2)}g r${(mxR * 57.3).toFixed(0)}${lift > 0.05 ? ' lift' + lift.toFixed(1) : ''}${over ? ' OVER' : ''}`);
  }
  out.push('kb turn ' + row.join(' · '));
  if (id === 'busderby') {
    const LIP = 2.5, ramp = { C: flat.C, collidersNear: flat.collidersNear, ground(x, z, o) { const d = -40 - z; o.h = d > 0 && d < 8 ? LIP * d / 8 : 0; o.nx = 0; o.ny = 1; o.nz = d > 0 && d < 8 ? LIP / 8 : 0;
      const n = Math.hypot(o.ny, o.nz); o.ny /= n; o.nz /= n; o.surface = 3; return o; } };
    const row2 = [];
    for (const mph of [30, 45]) {
      const { sp } = mk(id, key, cow), v = new Vehicle(ramp, sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
      v.running = true; v.park = false; v.gear = 3; v.tcMode = 3;
      for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
      const u = mph / MPH; v.vz = -u; for (const w of v.wheels) w.omega = u / w.radius; v.eOmega = u / sp.wheelRadius * sp.autoRatios[2] * sp.autoFinal;
      let air = false, tL = -1, vImp = 0, vUp = 0, last = 0;
      for (let t = 0; t < 30; t += 1 / 120) {
        const s2 = v.forwardSpeed * MPH; v.input.throttle = s2 < mph ? 1 : 0; v.step(1 / 120);
        const down = v.wheels.filter((w) => w.contact).length;
        if (v.pz < -48 && down === 0) air = true;
        if (air && tL < 0 && down >= 2) { tL = t; vImp = -v.vy; }
        if (tL >= 0) { vUp = Math.max(vUp, v.vy); if (Math.abs(v.vy) > 0.15 || Math.hypot(v.wx, v.wz) > 0.08) last = t - tL; if (t - tL > 4) break; }
      }
      if (!isFinite(v.px) || tL < 0 || vUp > 0.5 * vImp || last > 1.5) bad++;
      row2.push(`${mph} mph: rebound ${tL < 0 ? '-' : (100 * vUp / vImp).toFixed(0) + '%'} of a ${vImp.toFixed(1)} m/s landing, settled in ${last.toFixed(2)} s`);
    }
    out.push('off a 2.5 m kicker - ' + row2.join(' · '));
  }
  console.log(`== ${id}:${key}${cow === false ? ' (no cowcatcher)' : ''}\n  ` + out.join('\n  '));
}
if (bad) { console.log('FAIL: NaN or a bouncy landing'); process.exit(1); }
