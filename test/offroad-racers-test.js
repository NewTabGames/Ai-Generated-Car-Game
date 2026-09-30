// The trophy truck and the dune buggy, per version: launch, top speed, 60-0, keyboard turns on tarmac and dirt (roll-overs),
// and the whoops ride test - held at speed over desert whoops, how hard the body is shaken (the trophy truck should float
// where a road truck or a rally car gets thrown off them). Env: CARS, RIDE, A / L (whoops height / spacing), SPEEDS
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf || 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
// desert whoops: rollers A m tall every L m along z (from z = -20 on), dirt
const whoops = (A, L) => ({ C: { WATER_LEVEL: -1e4 }, ground(x, z, o) {
  const d = -z - RUN; let h = 0, dh = 0;
  if (d > 0) { const k = 2 * Math.PI / L; h = A * (1 - Math.cos(k * d)) / 2; dh = -A * k * Math.sin(k * d) / 2; }   // dh = dh/dz
  const n = 1 / Math.hypot(1, dh); o.h = h; o.nx = 0; o.ny = n; o.nz = -dh * n; o.surface = 3; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
const RUN = +(process.env.RUNUP || 500);
const yawOf = (v) => Math.atan2(-2 * (v.qx * v.qz + v.qy * v.qw), -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)));
const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qw * v.qx - v.qy * v.qz))));
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
const deg = (x) => (x * 57.3).toFixed(0);
function mk(id, key, world) {
  const def = CARS[id].make ? CARS[id].make(key) : CARS[id], sp = Object.assign(JSON.parse(JSON.stringify(def.spec)), id === "trophy" && process.env.SPEC ? JSON.parse(process.env.SPEC) : {});
  const v = new Vehicle(world || flat(), sp); v.setTires(sp.frontTire, sp.rearTire); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = +(process.env.TC || 1); for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(1 / 120); } v.input.brake = 0;
  return { v, def, sp };
}
const kbLim = (def, sp, s) => Math.min(1, Math.atan(sp.wheelbase * def.kbLat / Math.max(1, s * s)) / sp.maxSteer);
function run(id, key) {
  const out = [];
  { const { v } = mk(id, key); const T = {}; let t = 0;
    for (; t < 60; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); const s = v.forwardSpeed * MPH; for (const m of [30, 60, 100]) if (T[m] === undefined && s >= m) T[m] = t.toFixed(2); }
    out.push(`launch ${Object.entries(T).map(([k, x]) => '0-' + k + ' ' + x).join(' · ')} · top ${(v.forwardSpeed * MPH).toFixed(0)} mph (${v.gearLabel()} ${Math.round(v.rpm())} rpm)`); }
  { const { v } = mk(id, key); for (let i = 0; i < 120 * 30 && v.forwardSpeed * MPH < 60; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0; for (; t < 10 && v.forwardSpeed > 0.2; t += 1 / 120) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 120); }
    out.push(`60-0 ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft`); }
  // keyboard full turn at speed, 4 s: lateral g, max roll, rolled over?
  const row = [];
  for (const mph of [20, 40, 70]) for (const surf of [0, 3]) {
    const { v, def, sp } = mk(id, key, flat(surf)); for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
    if (v.forwardSpeed * MPH < mph - 3) continue;
    let mxR = 0, over = false, aLat = 0;
    for (let t = 0; t < 4; t += 1 / 120) { v.input.throttle = 0.5; v.input.steer = kbLim(def, sp, v.forwardSpeed); v.step(1 / 120); mxR = Math.max(mxR, Math.abs(rollOf(v))); if (Math.abs(rollOf(v)) > 1.2) over = true; aLat = v.forwardSpeed * -v.wy; }
    row.push(`${mph}${surf ? 'd' : 'a'}:${(aLat / 9.81).toFixed(2)}g roll${deg(mxR)}${over ? ' OVER' : ''}`);
  }
  out.push('kb turn ' + row.join(' · '));
  console.log(`== ${id}:${key}\n  ` + out.join('\n  '));
}
// whoops: held at a speed, steering straight; body vertical accel (the cup of water), pitch swing, did it stay upright
function ride(id, key, mph, A, L) {
  const { v, sp } = mk(id, key, whoops(A, L)); let t = 0, vyP = v.vy, sum = 0, n = 0, pk = 0, mxP = 0, mnP = 0, air = 0, over = false, y0 = yawOf(v);
  const vt = mph / MPH;
  let stops = 0;
  for (; t < 90 && -v.pz < RUN + 250; t += 1 / 120) {
    const e = vt - v.forwardSpeed; v.input.throttle = Math.max(0, Math.min(1, 0.3 + e * 0.5)); v.input.brake = e < -3 ? 0.3 : 0;
    let dy = yawOf(v) - y0; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    v.input.steer = Math.max(-1, Math.min(1, dy * 3 + v.px * 0.15 * -1 * 0 - v.px * 0.05));
    v.step(1 / 120);
    const ay = (v.vy - vyP) * 120; vyP = v.vy;
    if (-v.pz > RUN + 20) { for (const w of v.wheels) if (w.sRaw < w.sMin + 0.01) stops++; sum += ay * ay; n++; pk = Math.max(pk, Math.abs(ay)); const p = pitchOf(v); mxP = Math.max(mxP, p); mnP = Math.min(mnP, p); if (!v.wheels.some((w) => w.contact)) air++; }
    if (Math.abs(rollOf(v)) > 1.0 || Math.abs(pitchOf(v)) > 1.0) over = true;
  }
  return `${mph} mph: body ${(Math.sqrt(sum / Math.max(1, n)) / 9.81).toFixed(2)} g rms, peak ${(pk / 9.81).toFixed(1)} g · pitch ${deg(mnP)}..${deg(mxP)} · air ${(air / 120).toFixed(1)} s · stops ${stops}${over ? ' · CRASHED' : ''} · ${(v.forwardSpeed * MPH).toFixed(0)} mph at the end`;
}
const list = (process.env.CARS || 'trophy:spec,trophy:tt,trophy:awd,buggy:vw,buggy:built,buggy:ls').split(',');
for (const c of list) { const [id, key] = c.split(':'); if (!process.env.NORUN) run(id, key); }
if (!process.env.NORIDE) {
  const A = +(process.env.A || 0.45), L = +(process.env.L || 8);
  console.log(`== whoops ${A} m tall every ${L} m`);
  for (const c of (process.env.RIDE || 'trophy:tt,cyber:awd,rally:r4').split(',')) {
    const [id, key] = c.split(':');
    console.log(`  ${c}: ` + (process.env.SPEEDS || '30,50,70').split(',').map(Number).map((m) => ride(id, key, m, A, L)).join(' | '));
  }
}
