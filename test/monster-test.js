// Monster truck: ride height, launches (dirt / asphalt), wheelies, top speed, turning circle with and without the rear
// steer, fishhooks (it must not roll in a plain hard turn), flat drops from 3-10 m, a stadium tabletop jump, climbing a
// car-height step, throttle / brake pitch in the air, and the GTA-style flip back onto its wheels.
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694, DEG = 57.2958;
// world from a height function hf(x, z) -> metres (normal by finite differences), one surface everywhere
function mkWorld(hf, surf) {
  const e = 0.05;
  return {
    C: { WATER_LEVEL: -1e4 },
    ground(x, z, o) {
      const h = hf(x, z), dx = (hf(x + e, z) - hf(x - e, z)) / (2 * e), dz = (hf(x, z + e) - hf(x, z - e)) / (2 * e);
      const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      o.h = h; o.nx = -dx * il; o.ny = il; o.nz = -dz * il; o.surface = surf; return o;
    },
    collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; },
  };
}
const flat = () => 0;
function mk(hf, surf, opts) {
  opts = opts || {};
  const v = new Vehicle(mkWorld(hf || flat, surf === undefined ? 3 : surf), Object.assign({}, CARS.monster.spec));
  v.setTires(v.spec.frontTire, v.spec.rearTire);
  v.reset(opts.x || 0, opts.y || 0, opts.z || 0, 0, -1);
  v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 3;
  if (!opts.noSettle) { for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0; }
  return v;
}
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, -2 * (v.qy * v.qz - v.qx * v.qw)))) * DEG;   // + nose up
const upY = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
const nan = (v) => !isFinite(v.px + v.py + v.pz + v.vx + v.vy + v.vz + v.qx + v.qw);

// ---- ride height
{
  const v = mk(null, 3);
  for (let i = 0; i < 360; i++) v.step(1 / 120);
  const W = v.wheels, fz = W.map((w) => w.Fz), sum = fz.reduce((a, b) => a + b, 0);
  console.log(`static: CG ${v.py.toFixed(3)} m up (spec 1.26) · sag F ${((W[0].sFree - W[0].s0) * 39.37).toFixed(1)} in / R ${((W[2].sFree - W[2].s0) * 39.37).toFixed(1)} in `
    + `· travel ${((v.spec.travelUp + v.spec.travelDown) * 39.37).toFixed(0)} in · loads ${fz.map((f) => (f / 1000).toFixed(1)).join('/')} kN = ${(sum / 9.81).toFixed(0)} kg of ${v.spec.mass}`);
}
// ---- launches
for (const surf of [3, 0]) {
  const v = mk(null, surf);
  let t30 = null, t60 = null, maxP = 0, fAir = 0, peakG = 0;
  for (let t = 0; t < 14; t += 1 / 240) {
    v.input.throttle = 1; v.step(1 / 240);
    const s = v.forwardSpeed * MPH;
    if (t30 === null && s >= 30) t30 = t; if (t60 === null && s >= 60) t60 = t;
    maxP = Math.max(maxP, pitchOf(v)); peakG = Math.max(peakG, v.gLong);
    if (!v.wheels[0].contact && !v.wheels[1].contact) fAir += 1 / 240;
  }
  console.log(`launch on ${surf === 3 ? 'dirt   ' : 'asphalt'} (TC off): 0-30 ${t30 ? t30.toFixed(2) : '--'} s · 0-60 ${t60 ? t60.toFixed(2) : '--'} s · peak ${peakG.toFixed(2)} g · nose up ${maxP.toFixed(0)}° · fronts up ${fAir.toFixed(2)} s · ${Math.round(v.forwardSpeed * MPH)} mph @ 14 s in ${v.gearLabel()}${nan(v) ? ' NaN!' : ''}`);
}
// ---- top speed
{
  const v = mk(null, 3);
  for (let i = 0; i < 120 * 45; i++) { v.input.throttle = 1; v.step(1 / 120); }
  console.log(`top speed on dirt: ${Math.round(v.forwardSpeed * MPH)} mph at ${Math.round(v.rpm())} rpm in ${v.gearLabel()}`);
}
// ---- wheelie from a roll: floor it at 10 mph on dirt (does it stand up - and does it go over backwards?)
{
  const res = [];
  for (const tc of [3, 2]) {
    const v = mk(null, 3); v.tcMode = tc;
    for (let i = 0; i < 1200 && v.forwardSpeed * MPH < 10; i++) { v.input.throttle = 0.4; v.step(1 / 120); }
    let maxP = 0, air = 0, over = false;
    for (let t = 0; t < 3; t += 1 / 240) { v.input.throttle = 1; v.step(1 / 240); const p = pitchOf(v); maxP = Math.max(maxP, p); if (!v.wheels[0].contact && !v.wheels[1].contact) air += 1 / 240; if (upY(v) < 0) over = true; }
    res.push(`${tc === 3 ? 'TC off' : 'Track'}: nose up ${maxP.toFixed(0)}°, fronts up ${air.toFixed(2)} s${over ? ', WENT OVER' : ''}`);
  }
  console.log('wheelie (floor it at 10 mph on dirt): ' + res.join(' · '));
}
// ---- turning circle at walking pace: fronts only vs rear counter-steer
{
  const res = [];
  for (const rs of [0, -1, 1]) {
    const v = mk(null, 3);
    let pts = [];
    for (let t = 0; t < 14; t += 1 / 120) {
      v.input.steer = 1; v.input.rearSteer = rs; v.input.throttle = v.forwardSpeed < 2.2 ? 0.25 : 0; v.step(1 / 120);
      if (t > 6) pts.push([v.px, v.pz]);
    }
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const R = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length;
    res.push(`${rs === 0 ? 'fronts only' : rs < 0 ? 'rear counter-steer' : 'crab (rear same way)'} ${rs > 0 ? 'drifts sideways' : 'R ' + R.toFixed(1) + ' m'}`);
  }
  console.log('turning at ~5 mph, full lock: ' + res.join(' · '));
}
// ---- fishhooks: must slide, not roll
{
  const out = [];
  for (const surf of [3, 0]) for (const mph of [20, 30, 40]) for (const rs of [0, -1]) {
    const v = mk(null, surf); let minUp = 1, maxLean = 0;
    for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    for (let i = 0; i < 120 * 4; i++) {
      const st = i < 120 * 1.2 ? 1 : -1; v.input.throttle = 0.3; v.input.steer = st; v.input.rearSteer = rs * st * Math.max(0, 1 - v.forwardSpeed / 15);
      v.step(1 / 120); minUp = Math.min(minUp, upY(v));
    }
    maxLean = Math.acos(Math.max(-1, Math.min(1, minUp))) * DEG;
    out.push(`${surf === 3 ? 'dirt' : 'asph'} ${mph}${rs ? ' 4WS' : ''}: ${minUp < 0.2 ? 'ROLLED' : maxLean.toFixed(0) + '°'}`);
  }
  console.log('fishhooks (full lock, max lean): ' + out.join(' · '));
}
// ---- flat drops
{
  const out = [];
  for (const hgt of [3, 6, 10]) {
    const v = mk(null, 3, { y: hgt, noSettle: true });
    let peakFz = 0, peakG = 0, body = 0, bounce = 0, landed = false, tl = 0, maxS = 0;
    for (let t = 0; t < 4; t += 1 / 1000) {
      v.step(1 / 1000);
      const f = v.wheels.reduce((a, w) => a + w.Fz, 0);
      peakFz = Math.max(peakFz, f); peakG = Math.max(peakG, f / (v.spec.mass * 9.81));
      if (v.bodyContact) body++;
      if (!landed && v.wheels.some((w) => w.contact)) { landed = true; tl = t; }
      if (landed && t > tl + 0.3) bounce = Math.max(bounce, v.py - 1.26);
      maxS = Math.max(maxS, ...v.wheels.map((w) => (w.s0 - w.sRaw) / v.spec.travelUp));
    }
    out.push(`${hgt} m: peak ${peakG.toFixed(1)} g, stroke used ${(maxS * 100).toFixed(0)} %, body hit ${body} ms, rebound ${bounce.toFixed(2)} m${nan(v) ? ' NaN!' : ''}`);
  }
  console.log('flat drops: ' + out.join(' · '));
}
// ---- a stadium tabletop: 13 m faces to 4 m, 16 m top (along -z, starting 60 m ahead)
{
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const table = (x, z) => { const u = -z - 60; if (u < 0 || u > 42) return 0; const h = u < 13 ? 4 * Math.pow(ss(0, 13, u), 1.0) * (u / 13) ** 0.6 : u < 29 ? 4 : 4 * ss(42, 29, u); return h * ss(9, 6, Math.abs(x)); };
  const out = [];
  for (const mph of [25, 32, 40]) {
    const v = mk(table, 3); let air = 0, maxH = 0, peakG = 0, minUp = 1, landX = null, wasAir = false, hard = 0;
    for (let t = 0; t < 16; t += 1 / 240) {
      const sp = v.forwardSpeed * MPH;
      v.input.throttle = -v.pz < 55 ? (sp < mph ? 1 : 0.35) : (v.airborne ? 0 : 0.25);
      v.step(1 / 240);
      if (v.airborne) { air += 1 / 240; maxH = Math.max(maxH, v.py - 1.26); wasAir = true; }
      else if (wasAir && landX === null) landX = -v.pz - 60;
      if (!v.airborne) { const f = v.wheels.reduce((a, w) => a + w.Fz, 0) / (v.spec.mass * 9.81); peakG = Math.max(peakG, f); }
      minUp = Math.min(minUp, upY(v)); if (v.bodyContact) hard++;
      if (-v.pz > 150) break;
    }
    out.push(`${mph} mph: air ${air.toFixed(2)} s, ${maxH.toFixed(1)} m up, lands ${landX === null ? '--' : landX.toFixed(0)} m past the toe, ${peakG.toFixed(1)} g, ${minUp < 0.2 ? 'CRASHED' : 'upright'}${hard ? ', body hit' : ''}`);
  }
  console.log('tabletop jump: ' + out.join(' · '));
}
// ---- a car-height step: 1.0 m block 4 m deep (straight on, at a crawl and at speed)
{
  const block = (x, z) => (-z > 20 && -z < 24 ? 1.0 : 0);
  const out = [];
  for (const mph of [4, 12, 25]) {
    const v = mk(block, 3); let top = false, minG = 0, stuck = false;
    for (let t = 0; t < 10; t += 1 / 240) {
      v.input.throttle = v.forwardSpeed * MPH < mph ? 1 : 0.3;
      v.step(1 / 240); minG = Math.min(minG, v.gLong);
      if (!top && v.wheels[2].contact && -v.wheels[2].hz > 20.5 && -v.wheels[2].hz < 23.5 && v.wheels[2].hy > 1.7) top = true;
      if (-v.pz > 40) break;
    }
    stuck = -v.pz < 30;
    out.push(`${mph} mph: ${top ? 'climbs over' : stuck ? 'STUCK' : 'over?'} (worst decel ${(-minG).toFixed(1)} g)`);
  }
  console.log('1 m step (car side): ' + out.join(' · '));
}
// ---- in the air: gas lifts the nose, brake drops it
{
  const out = [];
  for (const [lab, thr, brk, spin] of [['coast', 0, 0, 30], ['gas', 1, 0, 0], ['brake', 0, 1, 40]]) {
    const v = mk(null, 3, { y: 30, noSettle: true });
    for (const w of v.wheels) w.omega = spin;
    let p0 = pitchOf(v);
    for (let t = 0; t < 1.0; t += 1 / 240) { v.input.throttle = thr; v.input.brake = brk; v.step(1 / 240); }
    out.push(`${lab}: ${(pitchOf(v) - p0).toFixed(0)}° in 1 s`);
  }
  console.log('in the air (pitch change, + nose up): ' + out.join(' · '));
}
// ---- GTA-style flip back over: on its roof / on its side, steer held
{
  const out = [];
  for (const [lab, rot] of [['roof', Math.PI], ['side', Math.PI / 2]]) {
    for (const flip of [false, true]) {
      const v = mk(null, 3, { noSettle: true });
      // roll it about its own length and drop it from a little up
      v.qx = 0; v.qy = 0; v.qz = Math.sin(rot / 2); v.qw = Math.cos(rot / 2); v.py = rot > 3 ? 2.6 : 2.2;
      for (let i = 0; i < 360; i++) v.step(1 / 120);      // settle where it lies
      let tUp = null;
      for (let t = 0; t < 8; t += 1 / 120) { v.input.flipAssist = flip; v.input.steer = t < 6 ? 1 : 0; v.step(1 / 120); if (tUp === null && upY(v) > 0.9 && t > 0.2) tUp = t; }
      out.push(`${lab}${flip ? ' + flip' : ' no assist'}: ${upY(v) > 0.9 ? 'on its wheels' + (tUp !== null ? ' in ' + tUp.toFixed(1) + ' s' : '') : 'still over (up ' + upY(v).toFixed(2) + ')'}`);
    }
  }
  // (and the Hellcat)
  {
    const v = new Vehicle(mkWorld(flat, 0)); v.setTires('street', 'street'); v.reset(0, 0, 0, 0, -1);
    v.qz = 1; v.qw = 0; v.py = 1.4; for (let i = 0; i < 240; i++) v.step(1 / 120);
    let tUp = null;
    for (let t = 0; t < 6; t += 1 / 120) { v.input.flipAssist = true; v.input.steer = -1; v.step(1 / 120); if (tUp === null && upY(v) > 0.9) tUp = t; }
    out.push(`Hellcat roof + flip: ${upY(v) > 0.9 ? 'on its wheels in ' + tUp.toFixed(1) + ' s' : 'still over'}`);
  }
  console.log('flip back over: ' + out.join(' · '));
}
// ---- the stadium itself (worldgen's arena: real obstacles, junk cars that crush, walls)
{
  const WG = require('../src/worldgen.js');
  WG.setMap('arena');
  const run = (x, z, tx, tz, mph, secs, onStep) => {
    const v = new Vehicle(WG, Object.assign({}, CARS.monster.spec));
    v.setTires('monster', 'monster'); v.reset(x, WG.ground(x, z, {}).h, z, tx, tz);
    v.running = true; v.eOmega = 115; v.park = false; v.gear = 1; v.tcMode = 3;
    let maxG = 0, air = 0, minUp = 1, pitchRot = 0, peakH = 0; const g = {};
    for (let t = 0; t < secs; t += 1 / 240) {
      v.input.throttle = v.airborne ? 0 : v.forwardSpeed * MPH < mph ? 1 : 0.25;
      v.step(1 / 240);
      if (onStep) onStep(v);
      for (const w of v.wheels) if (w.contact) WG.arenaCrush(w.cpx, w.cpz, w.Fz, 1 / 240);
      const bh = v.bodyHits || []; for (let i = 0; i < bh.length; i += 3) WG.arenaCrush(bh[i], bh[i + 1], bh[i + 2], 1 / 240);
      const f = v.wheels.reduce((a, w) => a + w.Fz, 0) / (v.spec.mass * 9.81); if (!v.airborne) maxG = Math.max(maxG, f);
      if (v.airborne) { air += 1 / 240; pitchRot += (v.wx * (1 - 2 * (v.qy * v.qy + v.qz * v.qz)) + v.wy * 2 * (v.qx * v.qy + v.qz * v.qw) + v.wz * 2 * (v.qx * v.qz - v.qy * v.qw)) / 240; }
      peakH = Math.max(peakH, v.py - WG.ground(v.px, v.pz, g).h - 1.26);
      minUp = Math.min(minUp, upY(v));
    }
    return { v, maxG, air, minUp, pitchRot: pitchRot * DEG, peakH };
  };
  WG.arenaResetCars();
  const CX = WG.ARENA_CARS[0].x;
  const c = run(CX, -32, 0, 1, 11, 9);
  const crushed = WG.ARENA_CARS.filter((k) => k.cab > 0.4 || k.level > 0.2).length, lv = WG.ARENA_CARS.map((k) => Math.round(k.level * 100) + '%').join(' '), cab = WG.ARENA_CARS.map((k) => Math.round(k.cab * 100) + '%').join(' ');
  console.log(`arena car crush @ 11 mph: ${crushed}/6 cars crushed (flat ${lv}; roofs caved ${cab}), peak ${c.maxG.toFixed(1)} g, air ${c.air.toFixed(2)} s, ${c.minUp < 0.2 ? 'ROLLED' : 'upright'}, ends at z ${c.v.pz.toFixed(0)}${nan(c.v) ? ' NaN!' : ''}`);
  // (the tabletop from the south end - the whoops lane is in the way from the north)
  const TB = WG.ARENA_OBS.find((o) => o.kind === 'table');
  for (const mph of [28, 34, 40]) {
    const r = run(TB.x0, 52, 0, -1, mph, 7);
    console.log(`arena tabletop @ ${mph} mph: air ${r.air.toFixed(2)} s, ${r.peakH.toFixed(1)} m above the ground, landing ${r.maxG.toFixed(1)} g, ${r.minUp < 0.2 ? 'CRASHED' : 'upright'}, ends at z ${r.v.pz.toFixed(0)}`);
  }
  for (const mph of [24, 29, 34, 40]) {
    const r = run(0, 34, 0, -1, mph, 7);
    console.log(`arena big gap jump @ ${mph} mph: air ${r.air.toFixed(2)} s, rotated ${r.pitchRot.toFixed(0)}° (nose up +), ${r.peakH.toFixed(1)} m up, landing ${r.maxG.toFixed(1)} g, ${r.minUp < 0.2 ? 'CRASHED' : 'upright'}, ends at z ${r.v.pz.toFixed(0)}`);
  }
  { const r = run(0, 40, 0, 1, 20, 6); console.log(`arena moguls @ 20 mph: air ${r.air.toFixed(2)} s, peak ${r.maxG.toFixed(1)} g, ${r.minUp < 0.2 ? 'ROLLED' : 'upright'}, ends at z ${r.v.pz.toFixed(0)}`); }
  { const r = run(-28, -20, 0, -1, 24, 7); console.log(`arena step-up @ 24 mph: air ${r.air.toFixed(2)} s, ${r.peakH.toFixed(1)} m up, landing ${r.maxG.toFixed(1)} g, ${r.minUp < 0.2 ? 'CRASHED' : 'upright'}, ends at z ${r.v.pz.toFixed(0)}`); }
  { const r = run(39, -20, 0, -1, 22, 6); console.log(`arena whoops lane @ 22 mph: air ${r.air.toFixed(2)} s, peak ${r.maxG.toFixed(1)} g, ${r.minUp < 0.2 ? 'ROLLED' : 'upright'}, ends at z ${r.v.pz.toFixed(0)}`); }
  // air assist: the gas held all the way over a jump and floored on landing (a keyboard's W). Off, it lands 50-70 deg nose
  // up and the still-spinning rears kick it over backwards; on, it eases off in the air and lands on its wheels
  const held = (x, z, tz, mph, aa) => {
    const v = new Vehicle(WG, Object.assign({}, CARS.monster.spec));
    v.setTires('monster', 'monster'); v.reset(x, WG.ground(x, z, {}).h, z, 0, tz);
    v.running = true; v.eOmega = 115; v.park = false; v.gear = 1; v.tcMode = 3; v.input.airAssist = aa;
    let flew = 0, landT = null, minUp = 1, tdP = 0;
    for (let t = 0; t < 9; t += 1 / 240) {
      if (v.airborne) { flew += 1 / 240; v.input.throttle = 1; } else if (flew > 0.3) { if (landT === null) { landT = t; tdP = Math.asin(-2 * (v.qy * v.qz - v.qx * v.qw)) * 57.3; } v.input.throttle = 1; } else v.input.throttle = v.forwardSpeed * MPH < mph ? 1 : 0.25;
      v.step(1 / 240);
      if (landT !== null) { minUp = Math.min(minUp, upY(v)); if (t - landT > 1.5) break; }
    }
    // (on: also the pitch it touched down at - it aims a few degrees nose up of the landing slope)
    return landT === null ? 'no jump' : minUp < 0.3 ? 'FLIPPED' : aa ? `landed ${tdP > 0 ? '+' : ''}${tdP.toFixed(0)} deg` : 'landed';
  };
  for (const [name, x, z, tz, sp] of [['gap jump', 0, 34, -1, [28, 34, 40]], ['tabletop', TB.x0, 52, -1, [28, 34, 40]], ['step-up', -28, -16, -1, [24, 30]]]) {
    console.log(`air assist, gas held over the ${name} @ ${sp.join(' / ')} mph: off ${sp.map((m) => held(x, z, tz, m, false)).join(' / ')} · on ${sp.map((m) => held(x, z, tz, m, true)).join(' / ')}`);
  }
  { let maxX = 0; const r = run(12, 34, 1, 0, 30, 5, (v) => { maxX = Math.max(maxX, v.px); }); console.log(`arena wall @ 30 mph: furthest x ${maxX.toFixed(1)} (wall line at ${WG.ARENA.HW}), ${r.minUp < 0.2 ? "rolled" : "upright"}, glanced off and running along it at ${Math.abs(r.v.forwardSpeed * MPH).toFixed(0)} mph`); }
}
