// Dragsters: passes on a prepped strip, calibrated to real time slips.
//   Top Fuel (1,000 ft): ~0.82 s 60 ft, ~2.2 s 330 ft, ~2.95 s @ ~295 mph at the 660, ~3.7 s @ ~330 mph at 1,000 ft
//   Funny Car (1,000 ft): ~0.86 s 60 ft, ~3.05 s @ ~280 mph at the 660, ~3.87 s @ ~332 mph (rides its wheelie bars on the hit)
//   Top Alcohol (1/4 mile): ~0.95 s 60 ft, ~3.3 s @ ~220 mph at the 1/8, ~5.2 s @ ~275 mph
// plus: the chute stop, street asphalt (up in smoke), cold tyres, the front end on the hit, top-end stability.
// Run: node test/dragster-test.js [tf|tad] ['{"spec overrides"}']
const { Vehicle, CARS, RAD2RPM } = require('../src/vehicle.js');
const mkWorld = (surface) => ({ C: { WATER_LEVEL: -1000 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surface; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const MPH = 2.23694;
const ONLY = process.argv[2] && !process.argv[2].startsWith('{') ? process.argv[2] : null;
const OVER = JSON.parse(process.argv.find((a) => a.startsWith('{')) || '{}');

function mk(cls, surface, over) {
  const def = CARS.dragster.make(cls);
  const v = new Vehicle(mkWorld(surface), Object.assign({}, def.spec, OVER, over || {}));
  v.setTires(v.spec.frontTire, v.spec.rearTire);
  if (OVER.tire) v.wheels.forEach((w) => { if (!w.front) w.tire = Object.assign({}, w.tire, OVER.tire); });
  v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / RAD2RPM; v.park = false; v.gear = 1;
  for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); }
  v.input.brake = 0;
  return v;
}
const pitchDeg = (v) => Math.asin(Math.max(-1, Math.min(1, -2 * (v.qy * v.qz - v.qx * v.qw)))) * 180 / Math.PI;

function run(cls, label, { surface = 5, tc = 2, launchRpm, warm = 85, over, chute = false, noSpace = false }) {
  const v = mk(cls, surface, over);
  v.tcMode = tc;
  if (launchRpm) v.launchRpm = launchRpm;
  for (const w of v.wheels) if (!w.front) w.temp = warm;
  if (!noSpace) { v.input.handbrake = 1; v.input.throttle = 1; for (let i = 0; i < 180; i++) v.step(1 / 120); }
  const launchSeen = v.rpm();
  v.input.handbrake = 0; v.input.throttle = 1;
  const dt = 1 / 240, z0 = v.pz;
  let t = 0, tStart = null, prevD = 0, peakG = 0, maxPitch = 0, air = 0, lockT = null, maxRpm = 0, minRpm = 1e9, maxSlip = 0, lastGear = v.gear, maxBar = 0, barT = 0;
  const shifts = [], res = {}, trapStart = {}, rpmAt = {};
  const marks = [[18.288, '60'], [100.584, '330'], [201.168, '660'], [304.8, '1000'], [402.336, '1320']];
  for (; t < 12; t += dt) {
    v.step(dt);
    const moved = z0 - v.pz;
    if (tStart === null && moved >= 0.3048) tStart = t;
    if (tStart !== null) {
      const dist = moved - 0.3048;
      const cross = (m) => (t - dt) + dt * (m - prevD) / Math.max(1e-6, dist - prevD);
      for (const [m, name] of marks) {
        if (trapStart[name] === undefined && dist >= m - 20.117) trapStart[name] = cross(m - 20.117);
        if (res[name] === undefined && dist >= m) { const tc_ = cross(m); res[name] = tc_ - tStart; res[name + 'mph'] = 20.117 / (tc_ - trapStart[name]) * MPH; rpmAt[name] = v.rpm(); }
      }
      prevD = dist;
      if (res['60'] === undefined || res['1000'] === undefined) {
        peakG = Math.max(peakG, v.gLong); maxPitch = Math.max(maxPitch, pitchDeg(v)); maxBar = Math.max(maxBar, v.wheelieBarLoad || 0); if (v.wheelieBarLoad > 100) barT += dt;
        if (!v.wheels[0].contact && !v.wheels[1].contact) air += dt;
        maxRpm = Math.max(maxRpm, v.rpm()); if (t > 0.2) minRpm = Math.min(minRpm, v.rpm());
        const vr = 0.5 * (v.wheels[2].omega * v.wheels[2].radius + v.wheels[3].omega * v.wheels[3].radius);
        if (v.forwardSpeed > 3) maxSlip = Math.max(maxSlip, vr / v.forwardSpeed - 1);
      }
    }
    if (lockT === null && v.locked && t > 0.3) lockT = t;
    if (v.gear !== lastGear) { shifts.push(`${lastGear}-${v.gear} @${(v.forwardSpeed * MPH).toFixed(0)}mph ${t.toFixed(2)}s`); lastGear = v.gear; }
    if (res['1320mph'] !== undefined) break;
  }
  const f = (x, d) => (x === undefined ? '--' : x.toFixed(d === undefined ? 3 : d));
  console.log(`${label.padEnd(30)} launch ${launchSeen.toFixed(0)} | 60' ${f(res['60'])} 330' ${f(res['330'])} 660' ${f(res['660'])}@${f(res['660mph'], 1)} 1000' ${f(res['1000'])}@${f(res['1000mph'], 1)} 1320' ${f(res['1320'])}@${f(res['1320mph'], 1)}`);
  console.log(`${''.padEnd(30)} peak ${peakG.toFixed(2)} g | nose up ${maxPitch.toFixed(1)}° fronts off ${air.toFixed(2)} s${v.spec.wheelieBar ? ` bars ${barT.toFixed(2)} s / ${Math.round(maxBar)} N` : ''} | rpm ${Math.round(minRpm)}-${Math.round(maxRpm)}, ${Math.round(rpmAt['1000'] || 0)} at 1000' | clutch locks ${lockT ? lockT.toFixed(2) + ' s' : 'never'} | slip max ${(maxSlip * 100).toFixed(0)} % | tyre ${(v.wheels[2].radius / v.wheels[2].tire.radius * 36).toFixed(1)} in (36 in static)${shifts.length ? ' | ' + shifts.join(', ') : ''} | rear ${v.wheels[2].temp.toFixed(0)}C`);
  if (chute) {
    v.input.throttle = 0;
    const v0 = v.forwardSpeed; v.toggleChute();
    let peak = 0, d = 0, tt = 0, to60 = null, maxP = 0, minP = 0;
    for (; tt < 30 && v.forwardSpeed > 3; tt += dt) {
      v.input.brake = v.forwardSpeed * MPH < 150 ? 0.6 : 0;
      v.step(dt); d += v.forwardSpeed * dt;
      peak = Math.min(peak, v.gLong); maxP = Math.max(maxP, pitchDeg(v)); minP = Math.min(minP, pitchDeg(v));
      if (to60 === null && v.forwardSpeed * MPH < 60) to60 = { t: tt, d };
    }
    console.log(`${''.padEnd(30)} chutes from ${(v0 * MPH).toFixed(0)} mph (brakes under 150): peak ${peak.toFixed(2)} g, 60 mph after ${to60 ? to60.t.toFixed(1) + ' s / ' + (to60.d * 3.28).toFixed(0) + ' ft' : '--'}, stopped after ${(d * 3.28).toFixed(0)} ft, pitch ${minP.toFixed(1)}..${maxP.toFixed(1)}°`);
  }
  return v;
}

for (const cls of ['tf', 'fc', 'tad']) {
  if (ONLY && ONLY !== cls) continue;
  const d = CARS.dragster.make(cls);
  console.log(`== ${d.name}`);
  run(cls, 'prepped, TC Track', { chute: true });
  run(cls, 'prepped, TC Street', { tc: 0 });
  run(cls, 'prepped, TC Off', { tc: 3 });
  run(cls, 'prepped, floored from a stop', { noSpace: true });
  run(cls, 'prepped, cold tyres', { warm: 30 });
  run(cls, 'street asphalt, TC Track', { surface: 0 });
  run(cls, 'street asphalt, TC Off', { surface: 0, tc: 3 });
  handling(cls);
}

// driving it: idle in gear, creeping, the turning circle, lane changes on the road and a correction at 300 mph
function handling(cls) {
  const heading = (v) => Math.atan2(-2 * (v.qx * v.qz + v.qy * v.qw), -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)));
  const slide = (v) => {
    const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz);
    return vv > 3 ? Math.acos(Math.max(-1, Math.min(1, (v.vx * fx + v.vz * fz) / (vv * Math.hypot(fx, fz))))) * 57.3 : 0;
  };
  { const v = mk(cls, 0); v.input.brake = 0; for (let i = 0; i < 600; i++) v.step(1 / 120);
    const v2 = mk(cls, 0); v2.idleFlare = 1250; for (let i = 0; i < 240; i++) v2.step(1 / 120);
    console.log(`  idle in D, no pedals: ${(v.forwardSpeed * MPH).toFixed(1)} mph after 5 s (${Math.round(v.rpm())} rpm) · on the post-start flare: ${(v2.forwardSpeed * MPH).toFixed(1)} mph after 2 s`); }
  { const v = mk(cls, 0); let mph = 0; for (let i = 0; i < 1200; i++) { v.input.throttle = 0.2; v.step(1 / 120); } mph = v.forwardSpeed * MPH;
    const v2 = mk(cls, 0); v2.selectReverse(); for (let i = 0; i < 480; i++) { v2.input.throttle = 1; v2.step(1 / 120); }
    console.log(`  20 % throttle for 10 s: ${mph.toFixed(0)} mph (${Math.round(v.rpm())} rpm) · reverser, floored 4 s: ${(v2.forwardSpeed * MPH).toFixed(1)} mph`); }
  { // burnout: B held (wet tyres), floored for 2.5 s from a stop on the strip, then lift and roll to a stop
    const v = mk(cls, 5); for (const w of v.wheels) if (!w.front) w.temp = 30;
    let maxSlip = 0, maxG = 0; const z0 = v.pz;
    for (let i = 0; i < 300; i++) { v.input.lineLock = true; v.input.throttle = 1; v.step(1 / 120); maxSlip = Math.max(maxSlip, v.wheels[2].slipSpeed); maxG = Math.max(maxG, v.gLong); }
    const mph = v.forwardSpeed * MPH;
    v.input.lineLock = false; v.input.throttle = 0;
    for (let i = 0; i < 1200 && v.forwardSpeed > 0.2; i++) { v.input.brake = 0.5; v.step(1 / 120); }
    console.log(`  burnout (B + floored 2.5 s): tyres spinning ${(maxSlip * MPH).toFixed(0)} mph over the ground, car at ${mph.toFixed(0)} mph (${maxG.toFixed(2)} g), stopped ${((z0 - v.pz) * 3.28).toFixed(0)} ft out, rears ${v.wheels[2].temp.toFixed(0)}C`);
  }
  { // turning circle at walking pace
    const v = mk(cls, 0); let minX = 1e9, maxX = -1e9;
    for (let i = 0; i < 120 * 40; i++) { v.input.steer = 1; v.input.throttle = v.forwardSpeed * MPH < 8 ? 0.18 : 0; v.step(1 / 120); if (i > 120 * 5) { minX = Math.min(minX, v.px); maxX = Math.max(maxX, v.px); } }
    console.log(`  turning circle at ~8 mph: ${((maxX - minX) * 3.28).toFixed(0)} ft across`); }
  { // keyboard lane changes on asphalt at 60-120 mph: coasting (TC Off and Track), part and full throttle on Track (the
    // default). With TC Off, throttle on street asphalt lights the slicks and it swaps ends - that one is on you
    let spins = 0, worst = 0, runs = 0;
    for (const mph of [60, 90, 120]) for (const [thr, tc] of [[0, 3], [0, 2], [0.4, 2], [1, 2]]) {
      // (get up to speed on Track so the slicks aren't already on fire, then switch to the mode under test)
      const v = mk(cls, 0); v.tcMode = 2; runs++;
      for (let i = 0; i < 120 * 60 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 0.6; v.step(1 / 120); }
      v.tcMode = tc;
      let kb = 0, m = 0;
      for (let s = 0; s < 4; s += 1 / 120) {
        const dir = s < 0.7 ? 1 : s < 1.4 ? -1 : 0;
        kb += Math.sign(dir - kb) * Math.min(Math.abs(dir - kb), 2.6 / 120);
        const sp = Math.abs(v.forwardSpeed), lim = sp < 1 ? 1 : Math.min(1, (Math.atan(2.946 * 10 / (sp * sp)) + 0.02) / 0.545);
        v.input.steer = kb * lim; v.input.throttle = thr; v.step(1 / 120); m = Math.max(m, slide(v));
      }
      worst = Math.max(worst, m); if (m > 45) spins++;
    }
    console.log(`  lane changes on asphalt (${runs} runs, 60-120 mph, coasting / TC Track on throttle): ${spins} spins, worst slide ${worst.toFixed(0)}°`);
  }
  { // a steering correction at ~300 mph on the strip: small, damped heading change, no drama
    const v = mk(cls, 5); for (const w of v.wheels) if (!w.front) w.temp = 85;
    for (let i = 0; i < 120 * 20 && v.forwardSpeed * MPH < 280; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const h0 = heading(v); let m = 0, dh = 0;
    for (let i = 0; i < 240; i++) { v.input.throttle = 1; v.input.steer = i < 30 ? 0.06 : 0; v.step(1 / 240); m = Math.max(m, slide(v)); let d = heading(v) - h0; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; dh = Math.max(dh, Math.abs(d) * 57.3); }
    console.log(`  6 % steer blip for 1/8 s at ${(v.forwardSpeed * MPH).toFixed(0)} mph: heading change ${dh.toFixed(2)}°, worst slide ${m.toFixed(1)}°`);
  }
}
