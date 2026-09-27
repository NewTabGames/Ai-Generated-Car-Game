// Mopar Drag Pak: TransBrake passes on a prepped strip. Real NHRA Factory Stock Showdown Drag Paks run
// 7.7-7.9 s @ 175-180 mph in class trim; records 7.558 s and 186.10 mph. Then a parachute stop from the top end.
// Run: node test/dragpak-test.js
const { Vehicle, CARS, RAD2RPM } = require('../src/vehicle.js');
const mkWorld = (surface) => ({ C: { WATER_LEVEL: -1000 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surface; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const MPH = 2.23694;

const OVER = JSON.parse(process.argv[2] || '{}');   // e.g. node test/dragpak-test.js '{"torqueScale":1.1}'
function mk(surface, over) {
  const v = new Vehicle(mkWorld(surface), Object.assign({}, CARS.dragpak.spec, OVER, over || {}));
  if (OVER.prep) v.wheels.forEach((w) => { if (!w.front) w.tire = Object.assign({}, w.tire, { prep: OVER.prep }); });
  v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = 1200 / RAD2RPM; v.park = false; v.gear = 1;
  for (let i = 0; i < 60; i++) { v.input.brake = 1; v.step(1 / 60); }
  v.input.brake = 0;
  return v;
}
const pitchDeg = (v) => Math.asin(Math.max(-1, Math.min(1, -2 * (v.qy * v.qz - v.qx * v.qw)))) * 180 / Math.PI;

function run(label, { surface = 5, tc = 2, launchRpm, warm = 85, over, chute = false }) {
  const v = mk(surface, over);
  v.tcMode = tc;
  if (launchRpm) v.launchRpm = launchRpm;
  for (const w of v.wheels) if (!w.front) w.temp = warm;
  v.input.handbrake = 1; v.input.throttle = 1;
  for (let i = 0; i < 180; i++) v.step(1 / 120);
  const launchSeen = v.rpm(), boostSeen = v.boost;
  v.input.handbrake = 0;
  const dt = 1 / 240, z0 = v.pz;
  let t = 0, tStart = null, prevD = 0, peakG = 0, maxPitch = 0, maxBar = 0, maxRpm = 0, lastGear = v.gear, t60 = null;
  const shifts = [], res = {}, trapStart = {};
  const marks = [[18.288, '60ft'], [100.584, '330ft'], [201.168, '1/8'], [304.8, '1000ft'], [402.336, '1/4']];
  for (; t < 20; t += dt) {
    v.step(dt);
    const moved = z0 - v.pz;
    if (tStart === null && moved >= 0.3048) tStart = t;
    if (tStart !== null) {
      const dist = moved - 0.3048;
      // interpolated beam crossings (the trap is the time over the last 66 ft before each mark)
      const cross = (m) => (t - dt) + dt * (m - prevD) / Math.max(1e-6, dist - prevD);
      for (const [m, name] of marks) {
        if (trapStart[name] === undefined && dist >= m - 20.117) trapStart[name] = cross(m - 20.117);
        if (res[name] === undefined && dist >= m) { const tc = cross(m); res[name] = tc - tStart; res[name + 'mph'] = 20.117 / (tc - trapStart[name]) * MPH; }
      }
      prevD = dist;
      if (t60 === null && v.forwardSpeed * MPH >= 60) t60 = t - tStart;
    }
    if (v.gear !== lastGear) { shifts.push(`${lastGear}-${v.gear} ${(v.forwardSpeed * MPH).toFixed(0)}mph/${Math.round(maxRpm)}`); lastGear = v.gear; maxRpm = 0; }
    maxRpm = Math.max(maxRpm, v.rpm());
    peakG = Math.max(peakG, v.gLong); maxPitch = Math.max(maxPitch, pitchDeg(v)); maxBar = Math.max(maxBar, v.wheelieBarLoad || 0);
    if (res['1/4mph'] !== undefined) break;
  }
  const f = (x) => (x === undefined ? '--' : x.toFixed(3));
  console.log(`${label.padEnd(34)} launch ${launchSeen.toFixed(0)}rpm ${boostSeen.toFixed(0)}psi | 60ft ${f(res['60ft'])} 330 ${f(res['330ft'])} 1/8 ${f(res['1/8'])}@${(res['1/8mph'] || 0).toFixed(1)} 1000 ${f(res['1000ft'])} 1/4 ${f(res['1/4'])}@${(res['1/4mph'] || 0).toFixed(1)}`);
  console.log(`${''.padEnd(34)} 0-60 ${f(t60)} | peak ${peakG.toFixed(2)} g | nose-up ${maxPitch.toFixed(1)}° | bar load ${Math.round(maxBar)} N | shifts ${shifts.join(', ')} | 3rd top ${Math.round(maxRpm)} rpm | rear ${v.wheels[2].temp.toFixed(0)}C`);
  if (chute) {
    // lift, pull the chute, no brakes: how hard does it pull and where does it get down to 60 mph
    v.input.throttle = 0;
    const v0 = v.forwardSpeed; v.toggleChute();
    let peak = 0, d = 0, tt = 0, to60 = null;
    for (; tt < 20 && v.forwardSpeed > 5; tt += dt) {
      v.step(dt); d += v.forwardSpeed * dt;
      peak = Math.min(peak, v.gLong);
      if (to60 === null && v.forwardSpeed * MPH < 60) to60 = { t: tt, d };
    }
    console.log(`${''.padEnd(34)} chute from ${(v0 * MPH).toFixed(0)} mph: peak ${peak.toFixed(2)} g, down to 60 mph in ${to60 ? to60.t.toFixed(1) + ' s / ' + (to60.d * 3.28).toFixed(0) + ' ft' : '--'}`);
  }
}

for (const lr of [3500, 4200, 5000]) run(`Drag Pak prepped TRACK tb ${lr}`, { launchRpm: lr, chute: lr === 4200 });
run('Drag Pak prepped TC OFF', { tc: 3 });
run('Drag Pak prepped, cold tyres', { warm: 30 });
run('Drag Pak STREET asphalt TRACK', { surface: 0 });
