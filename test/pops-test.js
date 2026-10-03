// Overrun pops after a lift off full throttle, whatever the release: a keyboard key (1 to 0 in one frame), a pedal eased
// off over 0.15 s, a trigger over 0.4 s - at 40-50 mph in the Hellcat, the Superbird and the hot rod. (Before: only the key.)
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
let bad = 0;
for (const id of ['hellcat', 'superbird', 'hotrod']) {
  const row = [];
  for (const rel of [0, 0.15, 0.4]) {
    const def = CARS[id], sp = JSON.parse(JSON.stringify(def.spec)), v = new Vehicle(flat, sp);
    v.setTires(v.spec.frontTire, v.spec.rearTire); v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 1;
    const fr = 1 / 60;
    for (let i = 0; i < 60 * 30 && v.forwardSpeed * MPH < 40; i++) { v.input.throttle = 0.35; v.step(fr); }
    for (let i = 0; i < 60; i++) { v.input.throttle = 1; v.step(fr); }                    // a second flat out
    const b0 = v.events.backfire, rpm = Math.round(v.rpm());
    for (let t = 0; t < 2; t += fr) { v.input.throttle = rel ? Math.max(0, 1 - t / rel) : 0; v.step(fr); }
    const pops = v.events.backfire - b0;
    if (!pops) bad++;
    row.push(`release ${rel ? rel + ' s' : 'instant'}: ${pops} pops (${rpm} rpm, ${(v.forwardSpeed * MPH).toFixed(0)} mph)`);
  }
  console.log(`== ${id}\n  ` + row.join('\n  '));
}
if (bad) { console.log('FAIL: a lift with no pops'); process.exit(1); }
