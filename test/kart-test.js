// Karts (rental / TaG 125 / KZ shifter): ride height, launches, top speed, steady-state cornering grip on a skid pad,
// braking, hard turns (they must slide, never tip) and quick lane changes at speed (no spins with sane steering).
// Clutch: where it pulls away and locks up (the TaG's must be fully in by 6,000 rpm - IAME's rules).
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
function mk(key, surf) {
  const def = CARS.kart.make(key), v = new Vehicle(flat(surf || 0), def.spec);
  v.setTires(v.spec.frontTire, v.spec.rearTire);
  v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 3;
  for (const w of v.wheels) w.temp = 55;                  // warmed up
  for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); }
  v.input.brake = 0;
  return v;
}
const upY = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
for (const key of ['rental', 'tag', 'kz']) {
  const def = CARS.kart.make(key);
  console.log(`== ${def.name} (${def.hp} hp, ${def.spec.mass} kg with driver)`);
  { const v = mk(key); for (let i = 0; i < 240; i++) v.step(1 / 120);
    console.log(`  static: CG ${v.py.toFixed(3)} m (spec ${v.spec.cgHeight}) · loads ${v.wheels.map((w) => Math.round(w.Fz)).join('/')} N · ${Math.round(v.rpm())} rpm idle`); }
  { const v = mk(key); let t30 = null, t60 = null, nan = false, r1 = 0, lock = null, cutT = 0;
    for (let t = 0; t < 25; t += 1 / 240) {
      v.input.throttle = 1; v.step(1 / 240);
      if (!isFinite(v.px + v.vz)) { nan = true; break; }
      const s = v.forwardSpeed * MPH; if (t30 === null && s >= 30) t30 = t; if (t60 === null && s >= 60) t60 = t;
      if (t < 1) r1 = v.rpm();
      if (lock === null && v.locked && s > 1) lock = [s, v.rpm()];
      if (v.fuelCut) cutT += 1 / 240;
    }
    console.log(`  launch: 0-30 ${t30 ? t30.toFixed(2) : '--'} s · 0-60 ${t60 ? t60.toFixed(2) : '--'} s · top ${Math.round(v.forwardSpeed * MPH)} mph at ${Math.round(v.rpm())} rpm in ${v.gearLabel()}${nan ? ' NaN!' : ''}`);
    // (a centrifugal clutch slips at a near-steady rpm until the kart catches up; the rental is governed, not cut)
    console.log(`  clutch: pulls away at ${Math.round(r1)} rpm, locks up at ${lock ? Math.round(lock[0]) + ' mph / ' + Math.round(lock[1]) + ' rpm' : '--'} · rev limiter cut ${cutT.toFixed(1)} s of 25`); }
  // skid pad: hold a circle with steering, find the most lateral g it can keep
  { let best = 0;
    for (const mph of [15, 20, 25, 30, 35]) for (const st of [0.35, 0.55]) {
      const v = mk(key); for (let i = 0; i < 120 * 20 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
      let gl = 0, n = 0, spun = false;
      for (let t = 0; t < 5; t += 1 / 120) {
        const err = mph / MPH - v.forwardSpeed; v.input.throttle = Math.max(0, Math.min(1, 0.4 + err * 0.5)); v.input.steer = st; v.step(1 / 120);
        if (t > 3) { gl += Math.abs(v.gLat); n++; }
        const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz);
        if (vv > 3 && Math.acos(Math.max(-1, Math.min(1, (v.vx * fx + v.vz * fz) / (vv * Math.hypot(fx, fz))))) > 0.6) spun = true;
      }
      if (!spun) best = Math.max(best, gl / n);
    }
    console.log(`  skid pad: up to ${best.toFixed(2)} g held`); }
  // braking from 40 mph
  { const v = mk(key); for (let i = 0; i < 120 * 20 && v.forwardSpeed * MPH < 40; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0; for (; t < 10 && v.forwardSpeed > 0.3; t += 1 / 240) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 240); }
    console.log(`  40-0 mph: ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft in ${t.toFixed(2)} s (${(40 / MPH / t / 9.81).toFixed(2)} g avg)`); }
  // fishhooks and lane changes
  { let rolled = 0, spins = 0, worst = 0, maxLean = 0;
    for (const mph of [20, 35, 50]) for (const pat of ['hook', 'lane']) {
      const v = mk(key); for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
      if (v.forwardSpeed * MPH < mph - 3) continue;
      const kbLimit = (sp) => { sp = Math.abs(sp); return sp < 1 ? 1 : Math.min(1, (Math.atan(2.946 * 10 / (sp * sp)) + 0.02) / 0.545); };
      let kb = 0, maxB = 0;
      for (let t = 0; t < 4; t += 1 / 120) {
        const dir = pat === 'hook' ? (t < 1 ? 1 : -1) : (t < 0.6 ? 1 : t < 1.2 ? -1 : 0);
        kb += Math.sign(dir - kb) * Math.min(Math.abs(dir - kb), 2.6 * 2.2 / 120);
        v.input.steer = pat === 'hook' ? dir : kb * kbLimit(v.forwardSpeed); v.input.throttle = 0.5; v.step(1 / 120);
        maxLean = Math.max(maxLean, Math.acos(Math.max(-1, Math.min(1, upY(v)))) * 57.3);
        const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz);
        if (vv > 3) maxB = Math.max(maxB, Math.acos(Math.max(-1, Math.min(1, (v.vx * fx + v.vz * fz) / (vv * Math.hypot(fx, fz))))) * 57.3);
      }
      if (upY(v) < 0.3) rolled++;
      if (pat === 'lane') { worst = Math.max(worst, maxB); if (maxB > 45) spins++; }
    }
    console.log(`  full-lock fishhooks: ${rolled ? rolled + ' ROLLED' : 'never tipped'} (max lean ${maxLean.toFixed(0)}°) · keyboard lane changes 20-50 mph: ${spins} spins, worst slide ${worst.toFixed(0)}°`); }
}
