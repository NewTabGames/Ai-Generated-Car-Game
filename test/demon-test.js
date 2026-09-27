// Demon 170 drag runs: TransBrake launch on a prepped strip vs street asphalt.
// NHRA-style timing: clock starts after 1 ft of rollout; splits at 60 ft, 330 ft, 1/8, 1000 ft, 1/4 (trap = last 66 ft).
const { Vehicle, CARS, RAD2RPM } = require('../src/vehicle.js');
const mkWorld = (surface) => ({ C: { WATER_LEVEL: -1000 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surface; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const MPH = 2.23694;

function run(label, { car = 'demon', surface = 5, tc = 2, launchRpm, warm = 80, fuel = 1, brakeStand = false }) {
  const cs = CARS[car].spec; const v = new Vehicle(mkWorld(surface), Object.assign({}, cs, { torqueScale: (cs.torqueScale || 1) * fuel }));
  v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = 800 / RAD2RPM; v.park = false; v.gear = 1; v.tcMode = tc;
  if (launchRpm) v.launchRpm = launchRpm;
  for (let i = 0; i < 60; i++) { v.input.brake = 1; v.step(1 / 60); }
  v.input.brake = 0;
  for (const w of v.wheels) if (!w.front) w.temp = warm;
  // stage on the transbrake (handbrake launch hold) and bring it up
  if (brakeStand) { v.input.brake = 1; v.input.throttle = 1; } else { v.input.handbrake = 1; v.input.throttle = 1; }
  for (let i = 0; i < 150; i++) v.step(1 / 120);
  const launchRpmSeen = v.rpm();
  v.input.handbrake = 0; v.input.brake = 0;
  const dt = 1 / 240;
  let t = 0, z0 = v.pz, tStart = null, dist = 0, prevD = 0, peakG = 0, t60 = null;
  const marks = [[18.288, '60ft'], [100.584, '330ft'], [201.168, '1/8'], [304.8, '1000ft'], [402.336, '1/4']];
  const res = {}; let trapStart = {};
  for (; t < 20; t += dt) {
    v.step(dt);
    const moved = z0 - v.pz;
    if (tStart === null && moved >= 0.3048) tStart = t;
    if (tStart !== null) {
      dist = moved - 0.3048;
      for (const [m, name] of marks) {
        if (res[name] === undefined && dist >= m) res[name] = (t - tStart) - (dist - m) / Math.max(0.1, v.forwardSpeed);
        if (trapStart[name] === undefined && dist >= m - 20.117) trapStart[name] = t;
        if (res[name] !== undefined && res[name + 'mph'] === undefined) res[name + 'mph'] = 20.117 / (t - trapStart[name]) * MPH;
      }
      if (t60 === null && v.forwardSpeed * MPH >= 60) t60 = t - tStart;
    }
    peakG = Math.max(peakG, v.gLong);
    prevD = dist;
    if (res['1/4'] !== undefined && res['1/4mph'] !== undefined) break;
  }
  const f = (x) => (x === undefined ? '--' : x.toFixed(3));
  console.log(`${label.padEnd(40)} launch ${launchRpmSeen.toFixed(0)}rpm | 60ft ${f(res['60ft'])} 330 ${f(res['330ft'])} 1/8 ${f(res['1/8'])}@${(res['1/8mph'] || 0).toFixed(1)} 1000 ${f(res['1000ft'])} 1/4 ${f(res['1/4'])}@${(res['1/4mph'] || 0).toFixed(1)} | 0-60 ${f(t60)} (1-ft rollout) | peak ${peakG.toFixed(2)} g | rear ${v.wheels[2].temp.toFixed(0)}C`);
}
for (const lr of [1600, 2000, 2500]) run(`Demon prepped TRACK transbrake ${lr}`, { launchRpm: lr });
run('Demon prepped TC OFF transbrake 2300', { tc: 3, launchRpm: 2300 });
run('Demon prepped SPORT transbrake', { tc: 1 });
run('Demon prepped TRACK brake-stand', { brakeStand: true });
run('Demon STREET asphalt TRACK transbrake', { surface: 0 });
run('Demon prepped TRACK, E10 (900 hp)', { fuel: 0.865 });
run('Demon prepped, cold tyres', { warm: 30 });
run('Hellcat prepped TRACK (P Zero)', { car: 'hellcat' });
run('Hellcat street TRACK (P Zero)', { car: 'hellcat', surface: 0 });
