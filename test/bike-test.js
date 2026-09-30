// the touring bagger: standing, launch, top speed, leaned turns (lean vs the balance angle), slalom, braking, a U-turn
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
const deg = (x) => (x * 57.3).toFixed(0);
for (const ver of (process.env.VERS || 'stock,race,turbo').split(',')) {
  const def = CARS.bike.make(ver), sp = def.spec;
  const mk = () => { const v = new Vehicle(flat, JSON.parse(JSON.stringify(sp))); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 1; for (const w of v.wheels) w.temp = 50; for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0; return v; };
  const kbLim = (v) => Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, v * v)) / sp.maxSteer);
  const out = [`== ${def.label || 'Stock 117'} (${sp.mass} kg)`];
  { const v = mk(); let mx = 0; for (let i = 0; i < 600; i++) { v.step(1 / 120); mx = Math.max(mx, Math.abs(v.lean || 0)); } out.push(`  standing 5 s: CG ${v.py.toFixed(2)} · loads ${v.wheels.map((w) => Math.round(w.Fz)).join('/')} N · max lean ${deg(mx)} deg`); }
  { const v = mk(), T = {}; let pitch = 1e9;
    for (let t = 0; t < 60; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH; for (const m of [30, 60, 100, 150]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(2); pitch = Math.min(pitch, v.wheels[0].Fz + v.wheels[1].Fz); }
    out.push(`  launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x).join(' · ')} · top ${(v.forwardSpeed * MPH).toFixed(0)} mph · min front load ${Math.round(pitch)} N`);
  }
  { const v = mk(); for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < 60; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const d0 = v.pz; let tb = 0, minR = 1e9; for (; tb < 10 && v.forwardSpeed > 0.2; tb += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); minR = Math.min(minR, v.wheels[2].Fz); }
    out.push(`  60-0: ${(Math.abs(v.pz - d0) * 3.281).toFixed(0)} ft in ${tb.toFixed(2)} s · min rear load ${Math.round(minR)} N · lean ${deg(v.lean || 0)}`); }
  // keyboard-style full steer at speed, held 4 s: the lean it settles at vs the balance angle
  const row = [];
  for (const mph of [10, 25, 45, 70, 95]) {
    const v = mk(); for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 3) continue;
    let mxL = 0, fell = false, bal = 0, scrape = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 0.35; v.input.steer = kbLim(v.forwardSpeed); v.step(1 / 120);
      mxL = Math.max(mxL, Math.abs(v.lean)); if (Math.abs(v.lean) > 1.2) fell = true; bal = Math.atan(v.forwardSpeed * -v.wy / 9.81); scrape = Math.max(scrape, v.bodyContact || 0); }
    row.push(`${mph}:lean${deg(v.lean)}(bal${deg(bal)},max${deg(mxL)})${fell ? ' FELL' : ''}${scrape ? ' scrape' : ''}`);
  }
  out.push(`  full kb turn: ${row.join(' · ')}`);
  // slalom at 45 mph: steer left/right each 1.2 s
  { const v = mk(); for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < 45; i++) { v.input.throttle = 1; v.step(1 / 120); }
    let mx = 0, fell = false; for (let t = 0; t < 8; t += 1 / 120) { v.input.throttle = 0.4; v.input.steer = (Math.floor(t / 1.2) % 2 ? -1 : 1) * kbLim(v.forwardSpeed); v.step(1 / 120); mx = Math.max(mx, Math.abs(v.lean)); if (Math.abs(v.lean) > 1.2) fell = true; }
    out.push(`  slalom 45 mph: max lean ${deg(mx)}${fell ? ' FELL' : ''} · ${(v.forwardSpeed * MPH).toFixed(0)} mph after`); }
  // hard on the brakes straight out of a fast turn (still leaned a little): it must stay upright and straight
  { const v = mk(); let t = 0;
    for (; t < 40 && v.forwardSpeed * MPH < 100; t += 1 / 120) { v.input.throttle = 1; v.input.steer = t > 3 ? kbLim(v.forwardSpeed) : 0; v.step(1 / 120); }
    for (let k = 0; k < 180; k++) { v.input.throttle = 0; v.input.steer = 0; v.step(1 / 120); }
    const v0 = v.forwardSpeed; let mx = 0, tb = 0, yaw = 0; for (; tb < 10 && v.forwardSpeed > 0.3; tb += 1 / 120) { v.input.brake = 1; v.step(1 / 120); mx = Math.max(mx, Math.abs(v.lean)); yaw += -v.wy / 120; }
    out.push(`  brake from ${(v0 * MPH).toFixed(0)} mph out of a turn: stopped in ${tb.toFixed(1)} s · max lean ${deg(mx)} · heading change ${deg(yaw)} deg`); }
  // U-turn at ~6 mph, full lock
  { const v = mk(); for (let i = 0; i < 120 * 10 && v.forwardSpeed * MPH < 6; i++) { v.input.throttle = 0.3; v.step(1 / 120); }
    let yaw = 0, fell = false; for (let t = 0; t < 6; t += 1 / 120) { v.input.throttle = 0.12; v.input.steer = 1; v.step(1 / 120); yaw += -v.wy / 120; if (Math.abs(v.lean) > 1.2) fell = true; }
    out.push(`  U-turn ~6 mph full lock: ${deg(yaw)} deg in 6 s · lean ${deg(v.lean)}${fell ? ' FELL' : ''}`); }
  console.log(out.join('\n'));
}
