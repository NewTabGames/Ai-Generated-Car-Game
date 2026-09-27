// Small steering corrections at speed (driver weaving within a lane) — must never spin the car.
const { Vehicle } = require('../src/vehicle.js');
const flat = { C: { WATER_LEVEL: -1000 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
const lim = (v, a, s) => Math.min(1, (Math.atan(2.946 * a / (v * v)) + s) / 0.545);
function run(label, mph, tc, rear, amp, freq, thr) {
  const v = new Vehicle(flat); v.setTires('street', rear); v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = 2500 / 9.549; v.park = false; v.gear = 1; v.tcMode = tc;
  const v0 = mph / 2.237;
  for (let i = 0; i < 120 * 40 && v.forwardSpeed < v0; i++) { v.input.throttle = 0.7; v.step(1 / 120); }
  let maxB = 0;
  for (let t = 0; t < 8; t += 1 / 120) {
    // keyboard-style: +-amp of the speed-limited lock, square-ish taps
    const raw = Math.sin(2 * Math.PI * freq * t) > 0 ? amp : -amp;
    v.input.steer = raw * lim(v.forwardSpeed, 10, 0.02);
    v.input.throttle = thr;
    v.step(1 / 120);
    const m00 = 1 - 2 * (v.qy * v.qy + v.qz * v.qz), m20 = 2 * (v.qx * v.qz - v.qy * v.qw);
    maxB = Math.max(maxB, Math.abs(Math.atan2(v.vx * m00 + v.vz * m20, Math.abs(v.forwardSpeed)) * 57.3));
  }
  console.log(`${label.padEnd(44)} max sideslip ${maxB.toFixed(1).padStart(5)}°  ${maxB > 20 ? 'SPUN' : maxB > 8 ? 'sliding' : 'ok'}`);
}
for (const rear of ['street', 'drag']) for (const tc of [0, 2, 3]) for (const mph of [40, 70]) {
  run(`${rear} ${['STREET', 'SPORT', 'TRACK', 'OFF'][tc]} ${mph}mph taps 40% @0.7Hz thr .5`, mph, tc, rear, 0.4, 0.7, 0.5);
  run(`${rear} ${['STREET', 'SPORT', 'TRACK', 'OFF'][tc]} ${mph}mph taps 100% @0.5Hz thr .8`, mph, tc, rear, 1.0, 0.5, 0.8);
}

// wheel users: +-15 deg corrections on a 180 deg wheel (speed-sensitive ratio as in input.js)
function wheelRun(label, mph, tc, rear) {
  const v = new Vehicle(flat); v.setTires('street', rear); v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = 2500 / 9.549; v.park = false; v.gear = 1; v.tcMode = tc;
  const v0 = mph / 2.237;
  for (let i = 0; i < 120 * 40 && v.forwardSpeed < v0; i++) { v.input.throttle = 0.7; v.step(1 / 120); }
  let maxB = 0;
  for (let t = 0; t < 8; t += 1 / 120) {
    const wheelDeg = 15 * Math.sin(2 * Math.PI * 0.6 * t);
    let n = wheelDeg / 90; n = Math.sign(n) * Math.pow(Math.abs(n), 1.15);
    const vs = Math.abs(v.forwardSpeed) / 11;
    v.input.steer = n / (1 + vs * Math.sqrt(vs));
    v.input.throttle = 0.5; v.step(1 / 120);
    const m00 = 1 - 2 * (v.qy * v.qy + v.qz * v.qz), m20 = 2 * (v.qx * v.qz - v.qy * v.qw);
    maxB = Math.max(maxB, Math.abs(Math.atan2(v.vx * m00 + v.vz * m20, Math.abs(v.forwardSpeed)) * 57.3));
  }
  console.log(`${label.padEnd(44)} max sideslip ${maxB.toFixed(1).padStart(5)}°  ${maxB > 20 ? 'SPUN' : maxB > 8 ? 'sliding' : 'ok'}`);
}
for (const rear of ['street', 'drag']) for (const mph of [40, 70, 110]) wheelRun(`WHEEL +-15deg ${rear} TRACK ${mph}mph thr .5`, mph, 2, rear);
