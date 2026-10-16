// The Sandcrawler: 1,200 t on four steering track units - static loads; 0-30 km/h and its governed top speed on tarmac
// and sand; braking; full-lock turns at 5 / 15 / 30 km/h (the turning circle, the speed it holds, how far it leans); from
// a standstill at the foot of a sand slope, how steep it climbs; parked across a slope, how steep it stands; and across
// the real Sand Dunes from the spawn - straight, then turning - the ground it covers and whether it ever stops for good
// (it used to stand on two corners on the twisted sand with the other two units spinning in the air)
const W = require('../src/worldgen.js');
const { Vehicle, CARS } = require('../src/vehicle.js');
const DT = 1 / 120, KMH = 3.6;
const sp0 = CARS.sandcrawler.spec;
const plane = (deg, surf, side) => { const g = Math.tan(deg * Math.PI / 180); return { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) {
  if (side) { const n = 1 / Math.hypot(1, g); o.h = g * x; o.nx = -g * n; o.ny = n; o.nz = 0; }
  else { const d = -z, e = 6, dh = d <= 0 ? 0 : d < e ? g * d / e : g, m = 1 / Math.hypot(1, dh); o.h = d <= 0 ? 0 : d < e ? g * d * d / (2 * e) : g * (d - e / 2); o.nx = 0; o.ny = m; o.nz = dh * m; }
  o.surface = surf; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } }; };
function mk(world, x, z, tx, tz) {
  const sp = JSON.parse(JSON.stringify(sp0)), v = new Vehicle(world, sp);
  v.setTires(sp.frontTire, sp.rearTire); v.reset(x || 0, world.ground(x || 0, z || 0, {}).h, z || 0, tx || 0, tz === undefined ? -1 : tz);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = 3;
  for (let i = 0; i < 480; i++) { v.input.brake = 1; v.step(DT); } v.input.brake = 0;
  return v;
}
const upY = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
// (the game's own rear steering for it: the back pair counter to the front at a crawl, easing off from 4 m/s)
const rearFor = (v, st) => -st * Math.max(0, Math.min(1, 1 - (v.forwardSpeed - 4) / 12));
let bad = 0;
const out = [`== Sandcrawler (${sp0.mass / 1000} t)`];
{ const v = mk(plane(0, 0)); out.push(`  static: loads ${v.wheels.map((w) => (w.Fz / 1e6).toFixed(2)).join(' / ')} MN · CG ${v.py.toFixed(2)} m`); }
for (const [surf, name] of [[0, 'tarmac'], [6, 'sand']]) {
  const v = mk(plane(0, surf)), T = {};
  for (let t = 0; t < 60; t += DT) { v.input.throttle = 1; v.step(DT); for (const m of [10, 20, 30]) if (T[m] === undefined && v.forwardSpeed * KMH >= m - 0.2) T[m] = t.toFixed(1); }
  const top = v.forwardSpeed * KMH;
  const v0 = v.forwardSpeed; let tb = 0; for (; tb < 30 && v.forwardSpeed > 0.2; tb += DT) { v.input.throttle = 0; v.input.brake = 1; v.step(DT); }
  if (top < 29 || top > 31.5) bad++;
  out.push(`  ${name}: ${Object.entries(T).map(([k, t]) => '0-' + k + ' km/h ' + t + ' s').join(' · ')} · top ${top.toFixed(1)} km/h (${(top / 1.609).toFixed(1)} mph) · brakes ${(v0 / tb / 9.81).toFixed(2)} g`);
}
{ const row = [];
  for (const kmh of [5, 15, 30]) {
    const v = mk(plane(0, 6)); for (let i = 0; i < 120 * 40 && v.forwardSpeed * KMH < kmh; i++) { v.input.throttle = 1; v.step(DT); }
    let R = 0, n = 0, vv = 0, up = 1;
    for (let t = 0; t < 20; t += DT) { const e = kmh / KMH - v.forwardSpeed; v.input.throttle = Math.max(0, Math.min(1, 0.3 + e)); v.input.steer = 1; v.input.rearSteer = rearFor(v, 1); v.step(DT); up = Math.min(up, upY(v)); if (t > 10) { R += Math.hypot(v.vx, v.vz) / Math.max(1e-3, Math.abs(v.wy)); vv += v.forwardSpeed; n++; } }
    const held = vv / n * KMH;
    if (held < kmh * 0.85 || up < 0.9) bad++;
    row.push(`${kmh}: circle ${(R / n).toFixed(1)} m at ${held.toFixed(1)} km/h, lean ${(Math.acos(Math.min(1, up)) * 57.3).toFixed(1)} deg`);
  }
  out.push('  full lock: ' + row.join(' · '));
  // (left and right alike: steering left takes it left, round the same circle - the four-wheel geometry once took the
  // turn's sign twice and steering left went right)
  const side = [];
  for (const st of [-1, 1]) {
    const v = mk(plane(0, 6)); for (let i = 0; i < 120 * 40 && v.forwardSpeed * KMH < 10; i++) { v.input.throttle = 1; v.step(DT); }
    const x0 = v.px; let R = 0, n = 0;
    for (let t = 0; t < 12; t += DT) { const e = 10 / KMH - v.forwardSpeed; v.input.throttle = Math.max(0, Math.min(1, 0.3 + e)); v.input.steer = st; v.input.rearSteer = rearFor(v, st); v.step(DT); if (t > 6) { R += Math.hypot(v.vx, v.vz) / Math.max(1e-3, Math.abs(v.wy)); n++; } }
    side.push({ st, went: Math.sign(v.px - x0), R: R / n });
  }
  const ok = side.every((q) => q.went === q.st) && Math.abs(side[0].R - side[1].R) < 0.1 * side[1].R;
  if (!ok) bad++;
  out.push('  steering: ' + side.map((q) => (q.st < 0 ? 'left' : 'right') + ' goes ' + (q.went < 0 ? 'left' : 'right') + ' round ' + q.R.toFixed(1) + ' m').join(' · ') + (ok ? '' : ' WRONG'));
}
{ let best = 0;
  for (const deg of [5, 10, 12, 15, 18, 20]) { const v = mk(plane(deg, 6), 0, 30); let ok = false; for (let t = 0; t < 50; t += DT) { v.input.throttle = 1; v.step(DT); if (-v.pz > 40) { ok = true; break; } } if (ok) best = deg; else break; }
  if (best < 15) bad++;
  out.push(`  sand slopes: climbs ${best} deg from a standstill (40 m up it)`);
}
{ let stands = 0;
  for (const deg of [15, 25, 30, 35]) { const v = mk(plane(deg, 6, true)); for (let t = 0; t < 4; t += DT) { v.input.brake = 1; v.step(DT); } if (upY(v) > Math.cos((deg + 10) * Math.PI / 180)) stands = deg; else break; }
  if (stands < 30) bad++;
  out.push(`  across a slope: stands at ${stands} deg`);
}
W.setMap('dunes');
{ const row = [];
  for (const [straight, steer] of [[14, 1], [14, -1], [30, 1], [5, 1], [60, 0.5]]) {
    const v = mk({ C: W.C, ground: W.ground, collidersNear: W.collidersNear }, W.DUNES.SPAWN_X, W.DUNES.SPAWN_Z, 1, 0);
    let dist = 0, px = v.px, pz = v.pz, stopped = 0, run = 0, over = false;
    for (let t = 0; t < straight + 30; t += DT) {
      const st = t > straight ? steer : 0; v.input.throttle = 1; v.input.steer = st; v.input.rearSteer = rearFor(v, st); v.step(DT);
      dist += Math.hypot(v.px - px, v.pz - pz); px = v.px; pz = v.pz;
      run = Math.abs(v.forwardSpeed) < 0.3 ? run + DT : 0; stopped = Math.max(stopped, run);
      if (upY(v) < 0.3) over = true;
    }
    if (stopped > 4 || over) bad++;
    row.push(`${straight} s + ${steer}: ${dist.toFixed(0)} m${stopped > 1 ? ', stopped ' + stopped.toFixed(1) + ' s' : ''}${over ? ' OVER' : ''}`);
  }
  out.push('  the Sand Dunes: ' + row.join(' · '));
}
console.log(out.join('\n'));
console.log(bad ? `${bad} PROBLEMS` : 'all ok');
