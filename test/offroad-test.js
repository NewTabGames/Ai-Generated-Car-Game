// Off-road package: Pirelli P Zero vs BFGoodrich KO2 LT285/55R20 (+2 in lift) on each surface.
// 0-60, 60-0, skidpad grip, ride height and a rough dirt track (wheels on the ground, bottoming out).
// Then the More Cars' own packages (tractor R-2s, sand-drag paddles, full-depth monster lugs, kart knobbies, mower bar lugs).
const { Vehicle, CARS, TIRES: VEH_T } = require('../src/vehicle.js');
const SURF = [[0, 'asphalt'], [1, 'gravel'], [2, 'grass'], [3, 'dirt']];
const MPH = 2.23694;
function world(surf, bump) {
  return {
    C: { WATER_LEVEL: -1000 },
    ground(x, z, o) {
      o.surface = surf;
      if (!bump) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; return o; }
      const e = 0.05, h = bump(x, z), hx = (bump(x + e, z) - h) / e, hz = (bump(x, z + e) - h) / e, l = Math.hypot(hx, 1, hz);
      o.h = h; o.nx = -hx / l; o.ny = 1 / l; o.nz = -hz / l; return o;
    },
    collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; },
  };
}
function make(tire, surf, bump, car) {
  const v = new Vehicle(world(surf, bump), car ? Object.assign({}, CARS[car].spec) : undefined);
  if (tire === 'offroad') v.setTires('offroad', 'offroad');
  else if (car) v.setTires(v.spec.frontTire, v.spec.rearTire);
  v.reset(0, bump ? bump(0, 0) : 0, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 1;
  for (const w of v.wheels) w.temp = 55;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); }
  v.input.brake = 0;
  return v;
}
const dt = 1 / 120;
function zeroSixty(tire, surf, car) {
  const v = make(tire, surf, null, car);
  v.input.throttle = 1;
  for (let t = 0; t < 20; t += dt) { v.step(dt); if (v.forwardSpeed * MPH >= 60) return t; }
  return NaN;
}
function sixtyZero(tire, surf) {
  const v = make(tire, surf); v.tcMode = 3;
  for (let i = 0; i < 3000 && v.forwardSpeed * MPH < 61; i++) { v.input.throttle = 0.7; v.step(dt); }
  v.input.throttle = 0; v.input.brake = 1;
  const z0 = v.pz; let t = 0;
  for (; t < 15 && v.forwardSpeed > 0.3; t += dt) v.step(dt);
  return (z0 - v.pz) * 3.2808;   // feet
}
function skidpad(tire, surf) {
  // hold ~40 mph and wind on steering until it won't turn any tighter: best 1-s average lateral g
  const v = make(tire, surf); v.tcMode = 3;
  for (let i = 0; i < 3000 && v.forwardSpeed < 17.9; i++) { v.input.throttle = 0.6; v.step(dt); }
  const win = []; let best = 0;
  for (let t = 0; t < 10; t += dt) {
    v.input.steer = Math.min(0.7, t * 0.07);
    v.input.throttle = Math.max(0, Math.min(1, 0.3 + (17.9 - v.forwardSpeed) * 0.4));
    v.step(dt);
    win.push(Math.abs(v.gLat)); if (win.length > 120) win.shift();
    if (win.length === 120) best = Math.max(best, win.reduce((a, b) => a + b) / 120);
  }
  return best;
}
function ride(tire) {
  const v = make(tire, 0);
  for (let i = 0; i < 240; i++) v.step(dt);
  return { cg: v.py, belly: v.py + v.spec.bodyBottom, inertia: v.wheels[3].inertia };
}
function rough(tire) {
  // washboarded, rutted dirt track: 40 mph for 20 s
  const bump = (x, z) => 0.07 * Math.sin(z * 0.9) * Math.cos(x * 0.7) + 0.05 * Math.sin(z * 2.3 + x * 0.4) + 0.12 * Math.sin(z * 0.23);
  const v = make(tire, 3, bump); v.tcMode = 1;
  let air = 0, n = 0, hits = 0, lastImp = 0, acc = 0, prevVy = v.vy, dist0 = v.pz;
  for (let t = 0; t < 20; t += dt) {
    v.input.throttle = Math.max(0, Math.min(1, 0.4 + (17.9 - v.forwardSpeed) * 0.5));
    v.input.steer = -v.px * 0.02;   // stay on the line
    v.step(dt);
    const off = v.wheels.filter((w) => !w.contact).length; air += off; n += 4;
    if (v.events.impact > 0.3 && v.events.impact !== lastImp) hits++;
    lastImp = v.events.impact;
    acc += Math.abs(v.vy - prevVy) / dt; prevVy = v.vy;
  }
  return { air: 100 * air / n, hits, vert: acc * dt / 20 / 9.81, mph: v.forwardSpeed * MPH, dist: dist0 - v.pz };
}

console.log('Hellcat, 8-speed auto, Sport mode');
for (const tire of ['street', 'offroad']) {
  const r = ride(tire);
  console.log(`\n${tire === 'street' ? 'P Zero 275/40ZR20 (stock)' : 'KO2 LT285/55R20 + 2 in lift'}  | CG ${(r.cg * 39.37).toFixed(1)} in, belly ${(r.belly * 39.37).toFixed(1)} in off the ground | rear wheel+tyre inertia ${r.inertia.toFixed(1)} kg m²`);
  for (const [s, name] of SURF) {
    const z = zeroSixty(tire, s), b = sixtyZero(tire, s), g = skidpad(tire, s);
    console.log(`  ${name.padEnd(8)} 0-60 ${isNaN(z) ? '  -- ' : z.toFixed(2)} s | 60-0 ${b.toFixed(0).padStart(4)} ft | skidpad ${g.toFixed(2)} g`);
  }
  const rg = rough(tire);
  console.log(`  rough dirt @40 mph: wheels off the ground ${rg.air.toFixed(1)} % of the time, ${rg.hits} body/bump-stop impacts, avg vertical jolt ${rg.vert.toFixed(2)} g, ${rg.mph.toFixed(0)} mph at the end`);
}
console.log('\nDemon 170 on KO2s (E85): 0-60 asphalt ' + zeroSixty('offroad', 0, 'demon').toFixed(2) + ' s, dirt ' + zeroSixty('offroad', 3, 'demon').toFixed(2)
  + ' s  | factory ET Street R: asphalt ' + zeroSixty(null, 0, 'demon').toFixed(2) + ' s, dirt ' + zeroSixty(null, 3, 'demon').toFixed(2) + ' s');
console.log('Drag Pak on KO2s: 0-60 asphalt ' + zeroSixty('offroad', 0, 'dragpak').toFixed(2) + ' s, dirt ' + zeroSixty('offroad', 3, 'dragpak').toFixed(2)
  + ' s  | ET Drag slicks: asphalt ' + zeroSixty(null, 0, 'dragpak').toFixed(2) + ' s, dirt ' + zeroSixty(null, 3, 'dragpak').toFixed(2) + ' s');

// ---- the More Cars' own off-road packages (OFFROAD_PKG): stock vs package on each surface
// tractor: R-2 deep lugs + lugged fronts · dragsters: sand-drag paddles + rib fronts · monster: full-depth lugs · karts: knobbies
{
  const { OFFROAD_PKG } = require('../src/vehicle.js');
  const TC = { puller: 2, dragster: 2, monster: 3, kart: 3, mower: 3 };
  const upY = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
  const pitch = (v) => Math.asin(Math.max(-1, Math.min(1, -2 * (v.qy * v.qz - v.qx * v.qw)))) * 180 / Math.PI;
  const mkM = (car, cls, pkg, surf) => {
    const def = car === 'monster' ? { spec: CARS.monster.spec } : CARS[car].make(cls);
    const v = new Vehicle(world(surf), Object.assign({}, def.spec)), P = OFFROAD_PKG(car, cls);
    v.setTires(pkg ? P.front : v.spec.frontTire, pkg ? P.rear : v.spec.rearTire);
    v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = TC[car];
    for (const w of v.wheels) w.temp = car === 'dragster' ? 85 : 55;
    for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); }
    v.input.brake = 0;
    return v;
  };
  const launchM = (car, cls, pkg, surf) => {
    const v = mkM(car, cls, pkg, surf), h = 1 / 240;
    if (car === 'dragster' || car === 'puller') { v.input.handbrake = 1; v.input.throttle = 1; for (let i = 0; i < 360; i++) v.step(h); v.input.handbrake = 0; }
    const z0 = v.pz, goal = car === 'kart' && cls === 'rental' ? 25 : car === 'dragster' ? 1e9 : 60;
    let tg = null, t300 = null, maxP = 0, minUp = 1;
    for (let t = 0; t < 25 && (tg === null || (car === 'dragster' && t300 === null)); t += h) {
      v.input.throttle = 1; v.step(h);
      const s = v.forwardSpeed * MPH, d = (z0 - v.pz) * 3.2808;
      if (tg === null && s >= goal) tg = t; if (t300 === null && d >= 300) t300 = [t, s];
      maxP = Math.max(maxP, pitch(v)); minUp = Math.min(minUp, upY(v));
    }
    return (car === 'dragster' ? (t300 ? `300 ft ${t300[0].toFixed(2)} s @ ${t300[1].toFixed(0)}` : '300 ft --') : `0-${goal} ${tg === null ? ' -- ' : tg.toFixed(2)} s`)
      + (maxP > 15 ? ` (nose up ${maxP.toFixed(0)}°)` : '') + (minUp < 0.3 ? ' FLIPPED' : '');
  };
  const padM = (car, cls, pkg, surf) => {
    let best = 0, spun = 0;
    for (const mph of car === 'puller' ? [8, 14] : [12, 22]) for (const st of [0.35, 0.6]) {
      const v = mkM(car, cls, pkg, surf);
      for (let i = 0; i < 3600 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 0.8; v.step(1 / 120); }
      let gl = 0, n = 0, bad = false;
      for (let t = 0; t < 6; t += 1 / 120) {
        v.input.throttle = Math.max(0, Math.min(1, 0.3 + (mph / MPH - v.forwardSpeed) * 0.4)); v.input.steer = st; v.step(1 / 120);
        if (t > 3) { gl += Math.abs(v.gLat); n++; }
        const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz);
        if (upY(v) < 0.5 || (vv > 3 && Math.acos(Math.max(-1, Math.min(1, (v.vx * fx + v.vz * fz) / (vv * Math.hypot(fx, fz))))) > 0.7)) bad = true;
      }
      if (bad) spun++; else best = Math.max(best, gl / n);
    }
    return `${best.toFixed(2)} g${spun ? ' (' + spun + ' spun)' : ''}`;
  };
  console.log('\nMore Cars: stock vs their off-road package (0-60 / 300 ft from a stop · steady circle grip)');
  for (const [car, cls] of [['puller', 'hemi4'], ['dragster', 'tf'], ['dragster', 'fc'], ['monster'], ['kart', 'rental'], ['kart', 'tag'], ['kart', 'kz'], ['mower', 'bp'], ['mower', 'fx']]) {
    const P = OFFROAD_PKG(car, cls);
    console.log(`${car}${cls ? ' ' + cls : ''} - package ${VEH_T[P.front].short} / ${VEH_T[P.rear].short}`);
    for (const pkg of [false, true]) {
      console.log(`  ${pkg ? 'package' : 'stock  '}  ` + [[0, 'asphalt'], [2, 'grass'], [3, 'dirt']].map(([s, n]) => `${n}: ${launchM(car, cls, pkg, s)}, ${padM(car, cls, pkg, s)}`).join(' | '));
    }
  }
}
