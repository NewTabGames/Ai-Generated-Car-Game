// Modified pulling tractor: launches on each surface (both engine packages), the wheelie onto the weight bar,
// idle creep against the brakes, top speed, a hard turn at speed (it must slide, not roll).
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const SURF = { 0: 'asphalt', 1: 'gravel', 2: 'grass', 3: 'dirt', 5: 'drag strip' };
function mk(key, surf) {
  const world = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
  const def = CARS.puller.make(key), v = new Vehicle(world, def.spec);
  v.setTires(v.spec.frontTire, v.spec.rearTire);
  v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 3;
  for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); }
  v.input.brake = 0;
  return v;
}
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, -2 * (v.qy * v.qz - v.qx * v.qw)))) * 57.3;
for (const key of ['hemi4', 'v12']) {
  console.log(`== ${CARS.puller.make(key).name}`);
  for (const surf of [3, 1, 2, 0, 5]) {
    const v = mk(key, surf);
    v.launchRpm = v.spec.launchRpm; v.input.handbrake = 1; v.input.throttle = 1;
    for (let i = 0; i < 180; i++) v.step(1 / 120);
    v.input.handbrake = 0;
    let t = 0, t60 = null, t100m = null, maxP = 0, air = 0, bar = 0, maxG = 0, nan = false; const z0 = v.pz;
    for (; t < 12; t += 1 / 240) {
      v.step(1 / 240);
      if (!isFinite(v.px + v.pz + v.py)) { nan = true; break; }
      maxP = Math.max(maxP, pitchOf(v)); maxG = Math.max(maxG, v.gLong); bar = Math.max(bar, v.wheelieBarLoad);
      if (!v.wheels[0].contact && !v.wheels[1].contact) air += 1 / 240;
      if (t60 === null && v.forwardSpeed * MPH >= 60) t60 = t;
      if (t100m === null && z0 - v.pz >= 100) t100m = t;
    }
    console.log(`  ${SURF[surf].padEnd(11)} 0-60 ${t60 ? t60.toFixed(2) + ' s' : '  --  '} · 100 m (a pull's length) ${t100m ? t100m.toFixed(2) : '--'} s · peak ${maxG.toFixed(2)} g · nose up ${maxP.toFixed(1)}° · fronts in the air ${air.toFixed(1)} s · bar ${Math.round(bar / 1000)} kN · ${Math.round(v.forwardSpeed * MPH)} mph @ 12 s${nan ? ' NaN!' : ''}`);
  }
  // idle in gear against the brakes: the slider clutch mustn't drag it
  { const v = mk(key, 0); v.input.brake = 0.5; for (let i = 0; i < 600; i++) v.step(1 / 120);
    console.log(`  idle in gear, half brake: ${(Math.abs(v.forwardSpeed) * MPH).toFixed(1)} mph after 5 s, ${Math.round(v.rpm())} rpm, running ${v.running}`); }
  // top speed
  { const v = mk(key, 0); for (let i = 0; i < 120 * 60; i++) { v.input.throttle = 1; v.step(1 / 120); }
    console.log(`  top speed (60 s flat out on asphalt): ${Math.round(v.forwardSpeed * MPH)} mph in ${v.gearLabel()} at ${Math.round(v.rpm())} rpm`); }
  // hard turns: must slide, not roll
  for (const surf of [0, 3]) for (const mph of [30, 50]) {
    const v = mk(key, surf); let minUp = 1;
    for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    for (let i = 0; i < 120 * 4; i++) { v.input.throttle = 0.3; v.input.steer = i < 120 * 1.2 ? 1 : -1; v.step(1 / 120); minUp = Math.min(minUp, 1 - 2 * (v.qx * v.qx + v.qz * v.qz)); }
    console.log(`  fishhook ${mph} mph on ${SURF[surf]}: ${minUp < 0.2 ? 'ROLLED' : 'upright (max lean ' + (Math.acos(minUp) * 57.3).toFixed(0) + '°)'}`);
  }
  // high-speed stability: lane changes / sweepers at 50-90 mph with keyboard-style steering must not spin it (coasting
  // and part throttle with TC off, flat out with TC on Track), and full throttle mustn't bounce it off its tyres
  {
    const kbLimit = (sp) => { sp = Math.abs(sp); return sp < 1 ? 1 : Math.min(1, (Math.atan(2.946 * 10 / (sp * sp)) + 0.02) / 0.545); };
    let spins = 0, worst = 0, runs = 0;
    for (const surf of [0, 3]) for (const mph of [50, 70, 90]) for (const [tc, a, thr, pat] of [[3, 0.3, 0, 'lane'], [3, 0.3, 0.3, 'lane'], [3, 0.3, 0.3, 'hold'], [2, 1, 1, 'lane'], [2, 1, 1, 'hold']]) {
      const v = mk(key, surf); v.tcMode = tc; runs++;
      for (let i = 0; i < 120 * 90 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = a; v.step(1 / 120); }
      let kb = 0, maxB = 0;
      for (let s = 0; s < 5; s += 1 / 120) {
        const dir = pat === 'lane' ? (s < 0.8 ? 1 : s < 1.6 ? -1 : 0) : 0.35, sp = v.forwardSpeed;
        kb += Math.sign(dir - kb) * Math.min(Math.abs(dir - kb), 2.6 * (1 - 0.55 * Math.min(1, sp / 45)) * (Math.sign(dir) !== Math.sign(kb) && kb ? 2.2 : 1) / 120);
        v.input.steer = kb * kbLimit(sp); v.input.throttle = thr; v.step(1 / 120);
        const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz);
        if (vv > 3) maxB = Math.max(maxB, Math.acos(Math.max(-1, Math.min(1, (v.vx * fx + v.vz * fz) / (vv * Math.hypot(fx, fz))))) * 57.3);
      }
      worst = Math.max(worst, maxB); if (maxB > 45) spins++;
    }
    console.log(`  high-speed lane changes / sweepers (${runs} runs, 50-90 mph, asphalt + dirt): ${spins} spins, worst slide ${worst.toFixed(0)}°`);
    const v = mk(key, 3); v.launchRpm = v.spec.launchRpm; v.input.handbrake = 1; v.input.throttle = 1;
    for (let i = 0; i < 180; i++) v.step(1 / 120);
    v.input.handbrake = 0; let off = 0, n = 0, vy = 0;
    for (let i = 0; i < 2400; i++) { v.step(1 / 240); n++; if (!v.wheels[2].contact || !v.wheels[3].contact) off++; vy = Math.max(vy, Math.abs(v.vy)); }
    console.log(`  full throttle on dirt: rear tyres off the ground ${(off / n * 100).toFixed(1)} % of the time, peak bounce ${vy.toFixed(2)} m/s`);
  }
  // it must stand up on the bar on dirt in every traction-control mode (TC holds its tyres near their own peak slip)
  {
    const res = [];
    for (const tc of [0, 1, 2, 3]) {
      const v = mk(key, 3); v.tcMode = tc; let air = 0, p = 0;
      for (let i = 0; i < 720; i++) { v.input.throttle = Math.min(1, i / 38); v.step(1 / 120); if (!v.wheels[0].contact && !v.wheels[1].contact) air += 1 / 120; p = Math.max(p, Math.asin(Math.max(-1, Math.min(1, -2 * (v.qy * v.qz - v.qx * v.qw)))) * 57.3); }
      res.push(`${['Street', 'Sport', 'Track', 'Off'][tc]} ${p.toFixed(0)}°/${air.toFixed(1)} s`);
    }
    console.log(`  wheelie on dirt by TC mode (nose up / fronts in the air): ${res.join(' · ')}`);
  }
  // braking to a stop in D: the engine must not rev up (no rev-match blips on the automatic's coast-downs)
  {
    let worst = 0;
    for (const surf of [0, 2, 3]) for (const brake of [0.2, 0.6, 1]) for (const tc of [0, 2, 3]) for (const mph of [30, 70]) {
      const v = mk(key, surf); v.tcMode = tc;
      for (let i = 0; i < 120 * 90 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 0.5; v.step(1 / 120); }
      for (let i = 0; i < 60; i++) { v.input.throttle = 0; v.step(1 / 120); }          // lift (any lift-off upshift happens here)
      let lo = 1e9;
      for (let i = 0; i < 120 * 15 && !(Math.abs(v.forwardSpeed) < 0.05 && i > 240); i++) {
        v.input.brake = brake; v.step(1 / 120);
        const r = v.rpm(); lo = Math.min(lo, r); worst = Math.max(worst, r - lo);
      }
    }
    console.log(`  braking to a stop (54 runs): biggest rev flare ${Math.round(worst)} rpm`);
  }
}
