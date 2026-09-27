// Drag Pak road manners: it's a race car (narrow front runners, spool, no ESC/ABS) - but it must stay drivable.
// Step-steer release at speed, a moderate lane change, max lateral g, and 60-0 braking without ABS.
// Run: node test/dragpak-handling-test.js
const { Vehicle, CARS } = require('../src/vehicle.js');
const flat = { C: { WATER_LEVEL: -1000 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
const MPH = 2.23694;
function mk(v0, tc) {
  const v = new Vehicle(flat, CARS.dragpak.spec); v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = 3000 / 9.549; v.park = false; v.gear = 1; v.tcMode = tc;
  for (const w of v.wheels) w.temp = 60;
  for (let i = 0; i < 120 * 60 && v.forwardSpeed < v0; i++) { v.input.throttle = 0.7; v.step(1 / 120); }
  v.input.throttle = 0.3;
  return v;
}
const beta = (v) => { const m00 = 1 - 2 * (v.qy * v.qy + v.qz * v.qz), m20 = 2 * (v.qx * v.qz - v.qy * v.qw); return Math.atan2(v.vx * m00 + v.vz * m20, Math.abs(v.forwardSpeed)) * 57.3; };
for (const mph of [60, 100, 150]) {
  const v0 = mph / MPH, sp = CARS.dragpak.spec;
  const steer = Math.atan(sp.wheelbase * 4.9 / (v0 * v0)) / sp.maxSteer;   // ~0.5 g worth of steering
  for (const tc of [2, 3]) {
    let v = mk(v0, tc), maxB = 0, osc = 0, last = 0;
    for (let t = 0; t < 6; t += 1 / 120) {
      v.input.steer = t < 1.5 ? steer : 0;
      v.input.throttle = Math.max(0, Math.min(1, 0.3 + (v0 - v.forwardSpeed) * 0.2));
      v.step(1 / 120);
      const r = v.wy * 57.3; maxB = Math.max(maxB, Math.abs(beta(v)));
      if (t > 1.5 && Math.abs(r) > 0.5 && Math.sign(r) !== last) { osc++; last = Math.sign(r); }
    }
    const endYaw = v.wy * 57.3;
    v = mk(v0, tc); let maxB2 = 0;
    for (let t = 0; t < 5; t += 1 / 120) {
      v.input.steer = t < 2 ? steer * Math.sin(2 * Math.PI * 0.8 * t) : 0;
      v.input.throttle = Math.max(0, Math.min(1, 0.3 + (v0 - v.forwardSpeed) * 0.2));
      v.step(1 / 120); maxB2 = Math.max(maxB2, Math.abs(beta(v)));
    }
    console.log(`${mph} mph ${tc === 3 ? 'TC off' : 'Track '}: step-steer max β ${maxB.toFixed(2)}°, yaw sign flips ${osc}, end yaw ${endYaw.toFixed(2)}°/s | lane change max β ${maxB2.toFixed(2)}° ${maxB < 4 && maxB2 < 4 && Math.abs(endYaw) < 1 ? 'ok' : 'CHECK'}`);
  }
}
// max steady lateral g on a 200 ft skidpad
{
  const v = mk(30 / MPH, 2); let best = 0;
  for (let t = 0; t < 25; t += 1 / 120) {
    const r = 30.48, vs = Math.abs(v.forwardSpeed);
    v.input.steer = Math.min(1, Math.atan(2.946 / r) / 0.48 * 1.25);
    v.input.throttle = Math.max(0, Math.min(1, 0.25 + (Math.sqrt(0.95 * 9.81 * r) - vs) * 0.05 * (t / 25 + 0.5)));
    v.step(1 / 120);
    if (t > 8) best = Math.max(best, Math.abs(v.gLat));
  }
  console.log(`skidpad 200 ft: ~${best.toFixed(2)} g lateral (Hellcat 0.93 g)`);
}
// 60-0, no ABS: threshold braking at 0.8 pedal vs slamming it
for (const pedal of [0.6, 1]) {
  const v = mk(60 / MPH, 2); v.input.throttle = 0; let d = 0, t = 0, maxB = 0;
  while (v.forwardSpeed > 0.2 && t < 10) { v.input.brake = pedal; v.step(1 / 240); d += v.forwardSpeed / 240; t += 1 / 240; maxB = Math.max(maxB, Math.abs(beta(v))); }
  console.log(`60-0 brake ${pedal}: ${(d * 3.281).toFixed(0)} ft in ${t.toFixed(2)} s, max β ${maxB.toFixed(1)}°, locked rears: ${v.wheels[2].omega === 0}`);
}
