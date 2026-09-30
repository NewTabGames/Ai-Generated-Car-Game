// Sand (the Sand Dunes): on flat soft sand, 0-30 / 0-60 and the top speed it can hold; and from a standstill at the foot
// of a sand slope, the steepest it can climb (60 m up it within 25 s - a run-up's momentum won't carry it that far). The dune buggy on its three tyre sets
// (the paddles should run away from the rest), and a few others for scale. Env: TC (traction-control mode, default 1)
const { Vehicle, CARS, OFFROAD_PKG } = require('../src/vehicle.js');
const MPH = 2.23694;
// flat sand, then from z = 0 a slope rising at `deg` towards -z (eased in over the first 4 m)
const slope = (deg) => { const g = Math.tan(deg * Math.PI / 180);
  return { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) {
    const d = -z, e = 4, h = d <= 0 ? 0 : d < e ? g * d * d / (2 * e) : g * (d - e / 2), dh = d <= 0 ? 0 : d < e ? g * d / e : g, n = 1 / Math.hypot(1, dh);
    o.h = h; o.nx = 0; o.ny = n; o.nz = dh * n; o.surface = 6; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } }; };
function mk(id, key, pkg, world) {
  const def = CARS[id].make ? CARS[id].make(key) : CARS[id], sp = JSON.parse(JSON.stringify(def.spec));
  const v = new Vehicle(world, sp); v.setTransmission('auto'); const P = pkg ? OFFROAD_PKG(id, key, pkg) : { front: sp.frontTire || 'street', rear: sp.rearTire || 'street' };
  v.setTires(P.front, P.rear); v.reset(0, 0, 4, 0, -1);
  v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = +(process.env.TC || 1); for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return v;
}
function run(label, id, key, pkg) {
  const out = [];
  { const v = mk(id, key, pkg, slope(0)), T = {}; let t = 0;
    for (; t < 40; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH; for (const m of [30, 60]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(1); }
    out.push(`flat sand ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x + ' s').join(' · ') || '(no 30)'} · ${(v.forwardSpeed * MPH).toFixed(0)} mph after 40 s`); }
  let best = 0;
  for (const deg of [5, 10, 15, 20, 25, 30, 35, 40]) {
    const v = mk(id, key, pkg, slope(deg)); let ok = false;
    for (let t = 0; t < 25; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); if (-v.pz > 60) { ok = true; break; } }
    if (ok) best = deg; else break;
  }
  out.push(`pulls away up ${best ? best + ' deg' : 'nothing (not even 5 deg)'}`);
  console.log(`== ${label}: ` + out.join(' · '));
}
run('buggy 1600 · buggy tyres', 'buggy', 'vw', null);
run('buggy 1600 · sand paddles', 'buggy', 'vw', true);
run('buggy 1600 · off-road knobbies', 'buggy', 'vw', 'knobby');
run('buggy 2276 · sand paddles', 'buggy', 'built', true);
run('buggy LS3 · buggy tyres', 'buggy', 'ls', null);
run('buggy LS3 · sand paddles', 'buggy', 'ls', true);
run('trophy truck', 'trophy', 'tt', null);
run('monster truck', 'monster', undefined, null);
run('Ram 1500 · 5.7 HEMI', 'ram', 'hemi', null);
run('Hellcat · P Zero', 'hellcat', undefined, null);
run('Hellcat · KO2 package', 'hellcat', undefined, true);
