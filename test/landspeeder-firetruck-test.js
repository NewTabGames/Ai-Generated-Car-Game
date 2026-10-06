// The X-34 landspeeder and the jet fire truck.
// Landspeeder: it hovers (the repulsor pads loaded at its ride height), launch (0-60, top speed after 40 s), 60-0,
// full lock at 20-140 mph (it must settle into a steady turn - with the same hold front and back it spun, and with the
// pads close together it snaked - and not roll), whoops at 40-140 mph (it pitched into their rhythm and flipped on
// lightly damped pads), off a kicker and All Ramps' first jump (it mustn't nose over in the air), over a lake (the field rides the water: it mustn't sink or drown its turbines), reverse.
// Fire truck: launch and top speed on the J34, the afterburner lighting floored, 60-0, keyboard turns (no rollover
// on its tall box), reverse on the hydraulic motor, the arena's jumps with the gas held.
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const world = (wl, surf, ground) => ({ C: { WATER_LEVEL: wl }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; },
  ground: ground || ((x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf || 0; return o; }) });
const flat = world(-1e4, 0);
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qw * v.qx - v.qy * v.qz))));
function mk(id, w) {
  const sp = JSON.parse(JSON.stringify(CARS[id].spec));
  const v = new Vehicle(w || flat, sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.park = false; v.gear = 1; v.tcMode = 1; v.jetN = sp.jet.idle;
  for (let i = 0; i < 360; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, sp };
}
const upTo = (v, mph) => { for (let i = 0; i < 120 * 90 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); } };
let bad = 0;
const check = (ok, msg) => { if (!ok) { bad++; console.log('  FAIL: ' + msg); } };

console.log('== landspeeder');
{ const { v, sp } = mk('landspeeder');
  const loads = v.wheels.map((w) => w.Fz);
  console.log(`  at rest: CG ${v.py.toFixed(2)} m (ride height ${sp.cgHeight}), pad loads ${loads.map((f) => f.toFixed(0)).join('/')} N`);
  check(Math.abs(v.py - sp.cgHeight) < 0.03 && loads.every((f) => f > 500), 'not hovering at its ride height on all four pads');
  const T = {}; for (let t = 0; t < 40; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH; for (const m of [30, 60, 100]) if (T[m] === undefined && s >= m) T[m] = +t.toFixed(1); }
  const top = v.forwardSpeed * MPH;
  console.log(`  launch 0-30 ${T[30]} s · 0-60 ${T[60]} s · 0-100 ${T[100]} s · at 40 s ${top.toFixed(0)} mph`);
  check(T[60] < 8 && top > 140 && top < 170, 'launch / top speed off');
  check(isFinite(v.px), 'NaN'); }
{ const { v } = mk('landspeeder'); upTo(v, 60);
  const z0 = v.pz; let t = 0; for (; t < 20 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
  const ft = Math.abs(v.pz - z0) * 3.281; console.log(`  60-0 ${ft.toFixed(0)} ft in ${t.toFixed(1)} s`); check(ft < 230, '60-0 too long'); }
{ const row = [];
  for (const mph of [20, 50, 90, 140]) {
    const { v } = mk('landspeeder'); upTo(v, mph);
    let flip = false, mxR = 0, a = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 0.5; v.input.steer = 1; v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (t > 1.5 && v.wy > 0.02) flip = true; a = Math.hypot(v.vx, v.vz) * Math.abs(v.wy); }
    row.push(`${mph}:${(a / 9.81).toFixed(2)}g r${(mxR * 57.3).toFixed(0)}${flip ? ' SNAKE' : ''}`);
    check(!flip && a / 9.81 > 0.35 && a / 9.81 < 0.85 && mxR < 0.14 && isFinite(v.px), `full lock at ${mph} mph: not a steady turn`);
  }
  console.log('  full lock ' + row.join(' · ')); }
{ const row = [];
  for (const [A, L] of [[0.3, 15], [0.5, 25]]) for (const mph of [40, 100, 140]) {
    const wh = world(-1e4, 3, (x, z, o) => { const d = -z - 60, on = d > 0 && d < 400; o.h = on ? A * 0.5 * (1 - Math.cos(2 * Math.PI * d / L)) : 0;
      const dh = on ? A * Math.PI / L * Math.sin(2 * Math.PI * d / L) : 0, n = Math.hypot(1, dh); o.nx = 0; o.ny = 1 / n; o.nz = dh / n; o.surface = 3; return o; });
    const { v } = mk('landspeeder', wh), u = mph / MPH; v.vz = -u; for (const w of v.wheels) w.omega = u / w.radius; v.jetN = 1;
    let mxP = 0;
    for (let t = 0; t < 400 / u + 1; t += 1 / 120) { v.input.throttle = v.forwardSpeed * MPH < mph ? 1 : 0.2; v.step(1 / 120); if (-v.pz > 60) mxP = Math.max(mxP, Math.abs(pitchOf(v))); }
    row.push(`${A}/${L} m @${mph}: ${(mxP * 57.3).toFixed(0)}°`);
    check(mxP < 0.5 && isFinite(v.px) && v.forwardSpeed * MPH > mph * 0.8, `whoops ${A} m / ${L} m at ${mph} mph: pitched over or lost its speed`);
  }
  console.log('  whoops (pitch) ' + row.join(' · ')); }
{ const { v } = mk('landspeeder', world(0.5, 4));
  for (let t = 0; t < 10; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); }
  console.log(`  over a lake: CG ${v.py.toFixed(2)} m over the bed (the water 0.5 m up), ${(v.forwardSpeed * MPH).toFixed(0)} mph after 10 s, in water ${v.inWater}, running ${v.running}`);
  check(v.py > 1.2 && !v.inWater && v.running && v.forwardSpeed * MPH > 60, 'it sank into the lake'); }
// off a 28 deg kicker floored and coasting: the pads still on the ramp throw the nose down as the fronts leave it, and
// with nothing in the air to answer that (the thrust 5 cm above the CG only added to it) it nosed over 70-90 deg at 63
// mph, landed on its nose and rolled - the field's stabilisers (airLevel) level it for the landing
{ const ang = 28 * Math.PI / 180, row = [];
  const kick = world(-1e4, 3, (x, z, o) => { const d = -z - 60, on = d > 0 && d < 6; o.h = on ? d * Math.tan(ang) : 0; o.nx = 0; o.ny = on ? Math.cos(ang) : 1; o.nz = on ? Math.sin(ang) : 0; o.surface = 3; return o; });
  for (const [mph, gas] of [[45, 1], [63, 1], [63, 0]]) {
    const { v } = mk('landspeeder', kick), u = mph / MPH; v.vz = -u; for (const w of v.wheels) w.omega = u / w.radius; v.jetN = 1;
    let flew = 0, landP = null, minUp = 1;
    for (let t = 0; t < 10; t += 1 / 240) {
      v.input.throttle = v.airborne ? gas : (v.forwardSpeed * MPH < mph ? 1 : 0.3); v.step(1 / 240);
      if (v.airborne) flew += 1 / 240; else if (flew > 0.3 && landP === null) landP = pitchOf(v) * 57.3;
      if (landP !== null) minUp = Math.min(minUp, 1 - 2 * (v.qx * v.qx + v.qz * v.qz));
    }
    row.push(`${mph} mph ${gas ? 'floored' : 'coasting'}: ${landP === null ? 'no jump' : minUp < 0.3 ? 'ROLLED' : (landP > 0 ? '+' : '') + landP.toFixed(0) + '°'}`);
    check(landP !== null && minUp >= 0.3 && Math.abs(landP) < 30 && isFinite(v.px), `kicker at ${mph} mph ${gas ? 'floored' : 'coasting'}: nosed over`);
  }
  console.log('  off a 28° kicker (landing pitch) ' + row.join(' · ')); }
// and All Ramps' gap jump dead ahead of the spawn (where it was found), floored and coasting, up to its top speed -
// judged on the first landing (any faster and it lands on the next cell's jump)
{ const WG = require('../src/worldgen.js'); WG.setMap('ramps');
  const S = WG.RAMPS_SPAWN, row = [];
  for (const [mph, gas] of [[45, 1], [63, 1], [100, 1], [130, 1], [45, 0], [63, 0], [100, 0]]) {
    const sp = JSON.parse(JSON.stringify(CARS.landspeeder.spec)), v = new Vehicle(WG, sp); v.setTires(sp.frontTire, sp.rearTire);
    v.reset(S.x, WG.ground(S.x, S.z, {}).h, S.z, 0, -1); v.running = true; v.park = false; v.gear = 1; v.tcMode = 1; v.jetN = 1;
    v.vz = -mph / MPH; for (const w of v.wheels) w.omega = mph / MPH / w.radius;
    let flew = 0, landT = null, landP = null, minUp = 1;
    for (let t = 0; t < 14; t += 1 / 240) {
      v.input.throttle = flew > 0 ? gas : v.forwardSpeed * MPH < mph ? 1 : 0.3; v.step(1 / 240);
      if (v.airborne) flew += 1 / 240; else if (flew > 0.3 && landT === null) { landT = t; landP = pitchOf(v) * 57.3; }
      if (landT !== null) { minUp = Math.min(minUp, 1 - 2 * (v.qx * v.qx + v.qz * v.qz)); if (t - landT > 1) break; }
    }
    row.push(`${mph} ${gas ? 'floored' : 'coasting'}: ${landT === null ? 'no jump' : minUp < 0.3 ? 'ROLLED' : (landP > 0 ? '+' : '') + landP.toFixed(0) + '°'}`);
    check(landT !== null && minUp >= 0.3 && Math.abs(landP) < 30 && isFinite(v.px), `All Ramps' spawn jump at ${mph} mph ${gas ? 'floored' : 'coasting'}: nosed over`);
  }
  console.log('  All Ramps spawn jump (landing pitch) ' + row.join(' · ')); }
{ const { v } = mk('landspeeder'); v.gear = -1; for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); }
  console.log(`  reverse 4 s: ${(v.forwardSpeed * MPH).toFixed(1)} mph`); check(v.forwardSpeed * MPH < -5, 'no reverse'); }

console.log('== firetruck');
{ const { v } = mk('firetruck');
  const T = {}; let ab = 0; for (let t = 0; t < 60; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); ab = Math.max(ab, v.jetAB || 0); const s = v.forwardSpeed * MPH; for (const m of [30, 60, 100]) if (T[m] === undefined && s >= m) T[m] = +t.toFixed(1); }
  const top = v.forwardSpeed * MPH;
  console.log(`  launch 0-30 ${T[30]} s · 0-60 ${T[60]} s · 0-100 ${T[100]} s · at 60 s ${top.toFixed(0)} mph · afterburner ${ab.toFixed(2)}`);
  check(T[60] < 14 && top > 120 && top < 155 && ab > 0.9 && isFinite(v.px), 'launch / top speed / afterburner off'); }
{ const { v } = mk('firetruck'); upTo(v, 60);
  const z0 = v.pz; let t = 0; for (; t < 20 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
  const ft = Math.abs(v.pz - z0) * 3.281; console.log(`  60-0 ${ft.toFixed(0)} ft in ${t.toFixed(1)} s`); check(ft < 300, '60-0 too long'); }
{ const row = [];
  for (const mph of [15, 30, 60]) {
    const { v, sp } = mk('firetruck'); upTo(v, mph);
    const kb = (s) => Math.min(1, Math.atan(sp.wheelbase * CARS.firetruck.kbLat / Math.max(1, s * s)) / sp.maxSteer);
    let mxR = 0, a = 0; for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 0.4; v.input.steer = kb(v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); a = v.forwardSpeed * Math.abs(v.wy); }
    row.push(`${mph}:${(a / 9.81).toFixed(2)}g r${(mxR * 57.3).toFixed(0)}`);
    check(mxR < 0.4 && isFinite(v.px), `kb turn at ${mph} mph: rolled`);
  }
  console.log('  kb turn ' + row.join(' · ')); }
{ const { v } = mk('firetruck'); v.gear = -1; for (let t = 0; t < 5; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); }
  console.log(`  reverse 5 s: ${(v.forwardSpeed * MPH).toFixed(1)} mph`); check(v.forwardSpeed * MPH < -5, 'no reverse'); }
// the arena's big gap jump and tabletop with the gas held and air assist on (the monster test's check): the jet's gas
// can't fly it - the assist once cut the jet over every jump and it nosed over and flipped at 34 mph
{ const WG = require('../src/worldgen.js'); WG.setMap('arena');
  const TB = WG.ARENA_OBS.find((o) => o.kind === 'table'), GP = WG.ARENA_OBS.find((o) => o.kind === 'gap'), row = [];
  for (const [name, x, z, mphs] of [['gap', GP.x0, GP.z0 + 52, [28, 34, 40]], ['table', TB.x0, TB.z0 + TB.len + 31, [28, 34, 40]]]) for (const mph of mphs) {
    const sp = JSON.parse(JSON.stringify(CARS.firetruck.spec)), v = new Vehicle(WG, sp); v.setTires(sp.frontTire, sp.rearTire);
    v.reset(x, WG.ground(x, z, {}).h, z, 0, -1); v.running = true; v.park = false; v.gear = 1; v.tcMode = 3; v.input.airAssist = true; v.jetN = 1;
    v.vz = -mph / MPH; for (const w of v.wheels) w.omega = mph / MPH / w.radius;
    let flew = 0, landT = null, minUp = 1, tdP = 0;
    for (let t = 0; t < 9; t += 1 / 240) {
      v.input.throttle = v.airborne || flew > 0.3 ? 1 : v.forwardSpeed * MPH < mph ? 1 : 0.25; if (v.airborne) flew += 1 / 240;
      v.step(1 / 240);
      if (!v.airborne && flew > 0.3 && landT === null) { landT = t; tdP = Math.asin(-2 * (v.qy * v.qz - v.qx * v.qw)) * 57.3; }
      if (landT !== null) { minUp = Math.min(minUp, 1 - 2 * (v.qx * v.qx + v.qz * v.qz)); if (t - landT > 1.5) break; }
    }
    row.push(`${name}@${mph}: ${landT === null ? 'no jump' : minUp < 0.3 ? 'FLIPPED' : (tdP > 0 ? '+' : '') + tdP.toFixed(0) + '°'}`);
    check(landT !== null && minUp >= 0.3 && isFinite(v.px), `${name} jump at ${mph} mph with the gas held: flipped`);
  }
  console.log('  arena jumps, gas held, air assist: ' + row.join(' · ')); }

if (bad) { console.log(`FAIL: ${bad} check(s)`); process.exit(1); }
console.log('ok');
