// Headless performance validation of the Hellcat model against published figures.
// Run: node test/sim-test.js
const { Vehicle, RAD2RPM } = require('../src/vehicle.js');

const flatWorld = {
  C: { WATER_LEVEL: -1000 },
  ground(x, z, out) { out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0; out.surface = 0; return out; },
  collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; },
};

function mk(opts = {}) {
  const v = new Vehicle(flatWorld);
  if (opts.trans) v.setTransmission(opts.trans);
  if (opts.drag) v.setTires(null, 'drag');
  v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = 720 / RAD2RPM;
  v.tcMode = opts.tc !== undefined ? opts.tc : 1;
  if (v.transType === 'auto') { v.park = false; v.gear = 1; } else { v.gear = 1; }
  // settle
  for (let i = 0; i < 200; i++) { v.input.brake = 1; v.step(1 / 100); }
  v.input.brake = 0;
  if (opts.warm) for (const w of v.wheels) if (!w.front) w.temp = opts.warm;
  return v;
}
const MPH = 2.23694;

function dragRun(label, opts) {
  const v = mk(opts);
  let t = 0, t60 = null, t100 = null, tq = null, trap = null, t30 = null;
  let maxG = 0;
  const dt = 1 / 120;
  let dist = 0;
  let shifts = [];
  let lastGear = v.gear;
  while (t < 40) {
    v.input.throttle = 1;
    if (opts.trans === 'manual' && v.rpm() > 6120 && v.gear < 6 && v.shiftTimer <= 0) v.shiftUp();
    v.step(dt); t += dt;
    const sp = v.forwardSpeed;
    dist += sp * dt;
    maxG = Math.max(maxG, v.gLong);
    if (v.gear !== lastGear) { shifts.push(`${lastGear}->${v.gear}@${(sp * MPH).toFixed(0)}mph/${t.toFixed(2)}s`); lastGear = v.gear; }
    if (!t30 && sp * MPH >= 30) t30 = t;
    if (!t60 && sp * MPH >= 60) t60 = t;
    if (!t100 && sp * MPH >= 100) t100 = t;
    if (!tq && dist >= 402.336) { tq = t; trap = sp * MPH; }
  }
  // top speed
  let vmax = 0;
  for (let i = 0; i < 120 * 60; i++) { v.input.throttle = 1; if (opts.trans === 'manual' && v.rpm() > 6120 && v.gear < 6) v.shiftUp(); v.step(dt); vmax = Math.max(vmax, v.forwardSpeed); }
  console.log(`${label}: 0-30 ${t30 && t30.toFixed(2)}s  0-60 ${t60 && t60.toFixed(2)}s  0-100 ${t100 && t100.toFixed(2)}s  1/4 ${tq && tq.toFixed(2)}s @ ${trap && trap.toFixed(1)} mph  top ${(vmax * MPH).toFixed(1)} mph (gear ${v.gear}, ${v.rpm().toFixed(0)} rpm)  peak ${maxG.toFixed(2)} g`);
  console.log('   shifts: ' + shifts.slice(0, 9).join('  '));
}

function brakeTest() {
  const v = mk({ tc: 1 });
  const dt = 1 / 120;
  // accelerate to 60+
  while (v.forwardSpeed * MPH < 62) { v.input.throttle = 1; v.step(dt); }
  v.input.throttle = 0;
  while (v.forwardSpeed * MPH > 60) v.step(dt);
  let dist = 0, t = 0, pk = 0;
  v.input.brake = 1;
  while (v.forwardSpeed > 0.05 && t < 10) { v.step(dt); t += dt; dist += v.forwardSpeed * dt; pk = Math.min(pk, v.gLong); }
  console.log(`60-0 braking (ABS): ${(dist * 3.28084).toFixed(0)} ft in ${t.toFixed(2)} s, peak ${pk.toFixed(2)} g   [real: ~107-112 ft]`);
}

function skidpad() {
  // steer controller holds a 61 m (200 ft) diameter circle, increase speed until it can't
  const v = mk({ tc: 3 });
  const dt = 1 / 120, R = 30.5;
  let best = 0;
  let targetV = 10;
  for (let t = 0; t < 90; t += dt) {
    const sp = v.forwardSpeed;
    const yawRate = v.wy;
    // desired yaw rate for circle to the left: sp/R
    const want = sp / R;
    const err = want - yawRate;
    v.input.steer = Math.max(-1, Math.min(1, (v.input.steer || 0) - err * 0.4 * dt * 60 * 0.05 - 0.0));
    // speed control
    targetV += dt * 0.12;
    v.input.throttle = Math.max(0, Math.min(1, (targetV - sp) * 0.5));
    v.step(dt);
    const lat = Math.abs(v.gLat);
    if (t > 10 && Math.abs(err) < 0.03) best = Math.max(best, lat);
  }
  console.log(`skidpad (200 ft): max steady lateral ${best.toFixed(2)} g   [real: 0.91-0.93 g]`);
}

function burnout() {
  const v = mk({ tc: 1 });
  const dt = 1 / 120;
  v.input.lineLock = true; v.input.brake = 1;
  for (let i = 0; i < 30; i++) v.step(dt);
  v.input.brake = 0; v.input.throttle = 1;
  let t = 0;
  for (; t < 6; t += dt) v.step(dt);
  const w = v.wheels;
  console.log(`line-lock burnout 6s: car speed ${(v.forwardSpeed * MPH).toFixed(1)} mph, rear wheel ${(w[2].omega * w[2].radius * MPH).toFixed(0)} mph, rpm ${v.rpm().toFixed(0)}, gear ${v.gearLabel()}, rear tyre temp ${w[2].temp.toFixed(0)}C, slip ${w[2].slipSpeed.toFixed(1)} m/s`);
  v.input.lineLock = false; v.input.throttle = 0;
  for (let i = 0; i < 240; i++) v.step(dt);
}

function revTest() {
  const v = mk({ tc: 1 });
  const dt = 1 / 240;
  v.input.revHold = true; v.input.throttle = 1;
  let maxR = 0, cuts = 0, prev = false, t = 0, t5 = null;
  for (; t < 3; t += dt) { v.step(dt); maxR = Math.max(maxR, v.rpm()); if (v.fuelCut && !prev) cuts++; prev = v.fuelCut; if (!t5 && v.rpm() > 5000) t5 = t; }
  console.log(`neutral rev: idle->5000 in ${t5 && t5.toFixed(2)}s, max ${maxR.toFixed(0)} rpm, limiter bounces ${cuts} in 3s, speed ${(v.forwardSpeed * MPH).toFixed(2)} mph`);
  v.input.throttle = 0;
  let tIdle = 0;
  for (; tIdle < 4; tIdle += dt) { v.step(dt); if (v.rpm() < 900) break; }
  console.log(`   throttle off: back under 900 rpm in ${tIdle.toFixed(2)} s`);
  // neutral drop
  v.input.throttle = 1;
  for (let i = 0; i < 240; i++) v.step(dt);
  v.input.revHold = false;
  let maxSpin = 0;
  for (let i = 0; i < 480; i++) { v.step(dt); maxSpin = Math.max(maxSpin, v.wheels[2].slipSpeed); }
  console.log(`   neutral drop: max rear slip ${maxSpin.toFixed(1)} m/s, after 2s ${(v.forwardSpeed * MPH).toFixed(1)} mph`);
}

function idleTest() {
  const v = mk({ tc: 1 });
  v.park = true;
  const dt = 1 / 60;
  for (let i = 0; i < 600; i++) v.step(dt);
  console.log(`idle in P 10s: rpm ${v.rpm().toFixed(0)}, drift ${Math.hypot(v.px, v.pz).toFixed(4)} m, vel ${Math.hypot(v.vx, v.vy, v.vz).toFixed(4)}, y ${v.py.toFixed(3)}`);
  v.park = false; v.gear = 1;
  for (let i = 0; i < 600; i++) v.step(dt);
  console.log(`creep in D (no brake) 10s: ${(v.forwardSpeed * MPH).toFixed(1)} mph, rpm ${v.rpm().toFixed(0)}`);
  v.input.brake = 0.4;
  for (let i = 0; i < 300; i++) v.step(dt);
  console.log(`hold with brake 5s: ${(v.forwardSpeed * MPH).toFixed(2)} mph, rpm ${v.rpm().toFixed(0)}`);
}

function manualLaunch() {
  const v = mk({ trans: 'manual', tc: 1 });
  v.gear = 1;
  const dt = 1 / 120;
  let t = 0, t60 = null;
  for (; t < 10; t += dt) { v.input.throttle = 1; if (v.rpm() > 6120 && v.gear < 6 && v.shiftTimer <= 0) v.shiftUp(); v.step(dt); if (!t60 && v.forwardSpeed * MPH > 60) t60 = t; }
  console.log(`manual 0-60 (auto-clutch): ${t60 && t60.toFixed(2)} s`);
}

const t0 = Date.now();
dragRun('AUTO  TC sport', { tc: 1 });
dragRun('AUTO  TC street', { tc: 0 });
dragRun('AUTO  Track    ', { tc: 2 });
dragRun('AUTO  TC off  ', { tc: 3 });
dragRun('AUTO  Sport, DRAG RADIALS cold', { tc: 1, drag: true });
dragRun('AUTO  Sport, DRAG RADIALS hot (after burnout)', { tc: 1, drag: true, warm: 85 });
dragRun('MANUAL TC sport', { tc: 1, trans: 'manual' });
brakeTest();
skidpad();
burnout();
revTest();
idleTest();
manualLaunch();
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s wall)`);
