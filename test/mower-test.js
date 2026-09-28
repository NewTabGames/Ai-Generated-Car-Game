// Racing mowers (B-Prepared / FX single / land-speed record): ride height, launches, top speed, cornering grip on a skid
// pad (asphalt and grass), braking, and hard turns - keyboard lane changes must not tip them over or spin them; a
// full-lock fishhook on pavement may lift a wheel (a real lawn tractor would), and the record mower's 0-100 is the record.
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
// (no traction control on the race mowers - they have none - but the record mower starts on TRACK, like the game)
const TC = { bp: 3, fx: 3, rec: 2 };
function mk(key, surf) {
  const def = CARS.mower.make(key), v = new Vehicle(flat(surf || 0), def.spec);
  v.setTires(v.spec.frontTire, v.spec.rearTire);
  v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = TC[key];
  for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); }
  v.input.brake = 0;
  return v;
}
const upY = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
const slideDeg = (v) => { const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz);
  return vv > 3 ? Math.acos(Math.max(-1, Math.min(1, (v.vx * fx + v.vz * fz) / (vv * Math.hypot(fx, fz))))) * 57.3 : 0; };
for (const key of (process.env.MOWERS || 'bp,fx,rec').split(',')) {
  const def = CARS.mower.make(key);
  console.log(`== ${def.name} (${def.hp} hp, ${def.spec.mass} kg with driver)`);
  { const v = mk(key); for (let i = 0; i < 240; i++) v.step(1 / 120);
    console.log(`  static: CG ${v.py.toFixed(3)} m (spec ${v.spec.cgHeight}) · loads ${v.wheels.map((w) => Math.round(w.Fz)).join('/')} N · ${Math.round(v.rpm())} rpm idle`); }
  for (const surf of [0, 2]) {
    const v = mk(key, surf); const T = {}; let nan = false;
    for (let t = 0; t < 30; t += 1 / 240) {
      v.input.throttle = 1; v.step(1 / 240);
      if (!isFinite(v.px + v.vz)) { nan = true; break; }
      const s = v.forwardSpeed * MPH; for (const m of [30, 60, 100]) if (T[m] === undefined && s >= m) T[m] = t;
    }
    console.log(`  launch on ${surf ? 'grass' : 'asphalt'}: ` + [30, 60, 100].filter((m) => T[m] !== undefined).map((m) => `0-${m} ${T[m].toFixed(2)} s`).join(' · ')
      + ` · top ${Math.round(v.forwardSpeed * MPH)} mph at ${Math.round(v.rpm())} rpm in ${v.gearLabel()}${nan ? ' NaN!' : ''}`);
  }
  // skid pad: hold a circle, the most lateral g it keeps without spinning or tipping
  for (const surf of [0, 2]) {
    let best = 0, tipped = 0;
    for (const mph of [15, 20, 25, 30, 35]) for (const st of [0.35, 0.55, 0.8]) {
      const v = mk(key, surf); for (let i = 0; i < 120 * 20 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
      let gl = 0, n = 0, spun = false;
      for (let t = 0; t < 5; t += 1 / 120) {
        const err = mph / MPH - v.forwardSpeed; v.input.throttle = Math.max(0, Math.min(1, 0.35 + err * 0.5)); v.input.steer = st; v.step(1 / 120);
        if (t > 3) { gl += Math.abs(v.gLat); n++; }
        if (slideDeg(v) > 35) spun = true;
      }
      if (upY(v) < 0.5) { tipped++; continue; }
      if (!spun) best = Math.max(best, gl / n);
    }
    console.log(`  skid pad (${surf ? 'grass' : 'asphalt'}): up to ${best.toFixed(2)} g held${tipped ? ` · ${tipped} of 15 TIPPED` : ''}`);
  }
  { const v = mk(key); for (let i = 0; i < 120 * 20 && v.forwardSpeed * MPH < 40; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0; for (; t < 10 && v.forwardSpeed > 0.3; t += 1 / 240) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 240); }
    console.log(`  40-0 mph: ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft in ${t.toFixed(2)} s (${(40 / MPH / t / 9.81).toFixed(2)} g avg)`); }
  // full-lock fishhooks and keyboard lane changes, on asphalt and grass
  for (const surf of [0, 2]) {
    let rolled = 0, spins = 0, worst = 0, maxLean = 0, hooks = 0, lifted = 0;
    const speeds = key === 'rec' ? [20, 50, 80, 110] : [15, 30, 45];
    for (const mph of speeds) for (const pat of ['hook', 'lane']) {
      const v = mk(key, surf); for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
      if (v.forwardSpeed * MPH < mph - 3) continue;
      const kbLimit = (sp) => { sp = Math.abs(sp); return sp < 1 ? 1 : Math.min(1, (Math.atan(2.946 * 10 / (sp * sp)) + 0.02) / 0.545); };
      let kb = 0, maxB = 0, lift = false;
      for (let t = 0; t < 4; t += 1 / 120) {
        const dir = pat === 'hook' ? (t < 1 ? 1 : -1) : (t < 0.6 ? 1 : t < 1.2 ? -1 : 0);
        kb += Math.sign(dir - kb) * Math.min(Math.abs(dir - kb), 2.6 * 2.2 / 120);
        v.input.steer = pat === 'hook' ? dir : kb * kbLimit(v.forwardSpeed); v.input.throttle = 0.5; v.step(1 / 120);
        maxLean = Math.max(maxLean, Math.acos(Math.max(-1, Math.min(1, upY(v)))) * 57.3);
        if (v.wheels.some((w) => !w.contact)) lift = true;
        maxB = Math.max(maxB, slideDeg(v));
      }
      if (upY(v) < 0.3) { if (pat === 'hook') hooks++; else rolled++; }
      if (lift) lifted++;
      if (pat === 'lane') { worst = Math.max(worst, maxB); if (maxB > 45) spins++; }
    }
    console.log(`  ${surf ? 'grass  ' : 'asphalt'}: keyboard lane changes ${speeds[0]}-${speeds[speeds.length - 1]} mph: ${rolled ? rolled + ' ROLLED, ' : ''}${spins} spins, worst slide ${worst.toFixed(0)}° · full-lock fishhooks: ${hooks ? hooks + ' tipped over' : 'stayed on its wheels'} (max lean ${maxLean.toFixed(0)}°, a wheel lifted in ${lifted})`);
  }
}
