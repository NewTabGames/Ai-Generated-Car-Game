// The tank (tracks: skid steer): launch, top speed, pivot, turns at speed, braking, reverse steering - per version
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf || 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const yawDeg = (v) => { const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)); return Math.atan2(fx, -fz) * 57.3; };
const slide = (v) => { const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz); return vv > 1 ? Math.abs(Math.atan2(v.vx * fz - v.vz * fx, v.vx * fx + v.vz * fz) * 57.3) : 0; };
const upY = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
for (const ver of (process.env.VERS || 'gov,ungov,hot').split(',')) {
  const def = CARS.tank.make(ver), sp = def.spec;
  const mk = (surf) => { const v = new Vehicle(flat(surf), JSON.parse(JSON.stringify(sp))); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 3; for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0; return v; };
  const out = [`== ${def.label || 'Governed'} (${sp.mass} kg)`];
  { const v = mk(); out.push(`  static CG ${v.py.toFixed(2)} loads ${v.wheels.map((w) => Math.round(w.Fz / 1000)).join('/')} kN`); }
  { const v = mk(), T = {}; let gears = [];
    for (let t = 0; t < 90; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH; for (const m of [10, 20, 30, 40, 50, 60, 70]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(1); if (gears[gears.length - 1] !== v.gear) gears.push(v.gear); }
    out.push(`  launch: ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x + 's').join(' · ')} · top ${(v.forwardSpeed * MPH).toFixed(1)} mph · gears ${gears.join('>')} · ${Math.round(v.rpm())} rpm`);
    const vt = v.forwardSpeed; let tb = 0, d0 = v.pz; for (; tb < 30 && v.forwardSpeed > 0.3; tb += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
    out.push(`  braking from ${(vt * MPH).toFixed(0)} mph: ${tb.toFixed(1)} s, ${(Math.abs(v.pz - d0) * 3.281).toFixed(0)} ft (${(vt / tb / 9.81).toFixed(2)} g)`); }
  // pivot in place, in D and in N
  for (const g of [1, 0]) { const v = mk(); v.gear = g; const y0 = yawDeg(v); let yaw = 0, prev = y0, drift = 0;
    for (let t = 0; t < 5; t += 1 / 120) { v.input.steer = 1; v.input.throttle = 0; v.step(1 / 120); const y = yawDeg(v); let d = y - prev; if (d > 180) d -= 360; if (d < -180) d += 360; yaw += d; prev = y; }
    drift = Math.hypot(v.px, v.pz); out.push(`  pivot (${g ? 'D' : 'N'}, full right 5 s): ${yaw.toFixed(0)} deg (${(yaw / 5).toFixed(0)} deg/s) · drift ${drift.toFixed(2)} m · up ${upY(v).toFixed(2)}`); }
  // turns at speed: full lock held 4 s under full throttle
  const row = [];
  for (const mph of [10, 20, 30, 40, 55, 70]) {
    const v = mk(); for (let i = 0; i < 120 * 90 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 2) continue;
    let mx = 0, minUp = 1, yaw = 0, prev = yawDeg(v), aLat = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.steer = 1; v.input.throttle = 0.6; v.step(1 / 120); mx = Math.max(mx, slide(v)); minUp = Math.min(minUp, upY(v)); const y = yawDeg(v); let d = y - prev; if (d > 180) d -= 360; if (d < -180) d += 360; yaw += d; prev = y; }
    row.push(`${mph}:${(yaw / 4).toFixed(0)}deg/s slide${mx.toFixed(0)}${minUp < 0.5 ? ' ROLL' : ''}`);
  }
  out.push(`  full turns: ${row.join(' · ')}`);
  // reverse: back up at ~5 mph and steer right - car-like (the nose swings left)
  { const v = mk(); v.gear = -1; let yaw = 0, prev = yawDeg(v);
    for (let t = 0; t < 6; t += 1 / 120) { v.input.throttle = 0.6; v.input.steer = t > 2 ? 1 : 0; v.step(1 / 120); if (t > 2) { const y = yawDeg(v); let d = y - prev; if (d > 180) d -= 360; if (d < -180) d += 360; yaw += d; } prev = yawDeg(v); }
    out.push(`  reverse ${(v.forwardSpeed * MPH).toFixed(1)} mph, steer right 4 s: yaw ${yaw.toFixed(0)} deg (car-like: negative)`); }
  // grass launch
  { const v = mk(1); for (let t = 0; t < 10; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); } out.push(`  grass: ${(v.forwardSpeed * MPH).toFixed(1)} mph after 10 s`); }
  console.log(out.join('\n'));
}
