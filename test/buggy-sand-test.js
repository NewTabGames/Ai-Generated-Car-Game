// The dune buggy in sand: steady turns, lane changes and lifting off mid-turn at 20 / 35 / 50 mph, steered like a wheel
// (straight to an angle, no correcting) on each engine and tyre set, in Track (traction control, no ESC) and Off - how far
// the tail slides out (the body's slip angle) and whether it spins (past ~70 deg). With ESC off it used to swap ends at
// the least excuse (a light, short tail-heavy chassis, the rear letting go before the front); now nothing spins in Track,
// and in Off only the 480 hp LS on the wrong tyres for sand. Env: VERS, PKGS (false,true,knobby), TCS (2,3), SLOPE (deg of
// cross-slope), SPEC (json override), TIRE (json overrides per tyre id)
const { Vehicle, CARS, OFFROAD_PKG, TIRES } = require('../src/vehicle.js');
if (process.env.TIRE && TIRES) { const o = JSON.parse(process.env.TIRE); for (const k of Object.keys(o)) { Object.assign(TIRES[k], o[k]); if (o[k].sandKy !== undefined) TIRES[k].looseKy[6] = o[k].sandKy; if (o[k].sandKx !== undefined) TIRES[k].looseKx[6] = o[k].sandKx; } }
const MPH = 2.23694, DT = 1 / 120;
const slopeDeg = +(process.env.SLOPE || 0), g = Math.tan(slopeDeg * Math.PI / 180);
const world = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { const n = 1 / Math.hypot(1, g); o.h = -g * x; o.nx = g * n; o.ny = n; o.nz = 0; o.surface = 6; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
const head = (v) => [-2 * (v.qx * v.qz + v.qy * v.qw), -(1 - 2 * (v.qx * v.qx + v.qy * v.qy))];
const betaOf = (v) => { const [fx, fz] = head(v), sp = Math.hypot(v.vx, v.vz); if (sp < 2) return 0; const c = (v.vx * fx + v.vz * fz) / sp; return Math.acos(Math.max(-1, Math.min(1, c))); };
const rollOf = (v) => Math.asin(Math.max(-1, Math.min(1, 2 * (v.qx * v.qy + v.qz * v.qw))));
function mk(ver, pkg) {
  const def = CARS.buggy.make(ver), sp = Object.assign(JSON.parse(JSON.stringify(def.spec)), process.env.SPEC ? JSON.parse(process.env.SPEC) : {});
  const v = new Vehicle(world, sp); v.setTransmission('auto');
  const P = pkg === 'false' ? { front: sp.frontTire, rear: sp.rearTire } : OFFROAD_PKG('buggy', ver, pkg === 'knobby' ? 'knobby' : undefined);
  v.setTires(P.front, P.rear); v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = sp.idleRpm / 9.549; v.park = false; v.gear = 1; v.tcMode = TCM; for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 240; i++) { v.input.brake = 1; v.step(DT); } v.input.brake = 0;
  return v;
}
// up to speed in a straight line (held there), then the manoeuvre
function upTo(v, mph) {
  for (let i = 0; i < 120 * 40; i++) { const e = mph / MPH - v.forwardSpeed; v.input.throttle = Math.max(0, Math.min(1, 0.4 + e)); v.input.steer = 0; v.step(DT); if (Math.abs(e) < 0.3 && i > 240) break; }
  return v.forwardSpeed * MPH > mph - 3;
}
function manoeuvre(ver, pkg, mph, kind, steer, thr) {
  const v = mk(ver, pkg); if (!upTo(v, mph)) return null;
  let mx = 0, spun = false, rolled = false, t = 0;
  const yaw0 = Math.atan2(head(v)[0], head(v)[1]);
  for (; t < 4; t += DT) {
    let s = 0, th = thr;
    if (kind === 'turn') s = steer;
    else if (kind === 'lane') s = t < 0.6 ? steer : t < 1.2 ? -steer : 0;
    else if (kind === 'lift') { s = steer; th = t < 1.5 ? thr : 0; }
    v.input.steer = s; v.input.throttle = th; v.input.brake = 0; v.step(DT);
    const b = betaOf(v); mx = Math.max(mx, b); if (b > 1.2) spun = true; if (Math.abs(rollOf(v)) > 1.2) rolled = true;
  }
  return { mx: mx * 57.3, spun, rolled };
}
const vers = (process.env.VERS || 'vw,built,ls').split(','), pkgs = (process.env.PKGS || 'false,true,knobby').split(',');
let TCM = 2, bad = 0;
for (const tc of (process.env.TCS || '2,3').split(',').map(Number)) for (const ver of vers) for (const pkg of pkgs) {
  TCM = tc;
  const rows = []; let spins = 0, n = 0, worst = 0;
  for (const mph of [20, 35, 50]) {
    const cells = [];
    for (const [kind, steer, thr] of [['turn', 0.25, 1], ['turn', 0.5, 1], ['turn', 1, 1], ['turn', 0.5, 0.5], ['lane', 0.3, 1], ['lane', 0.6, 1], ['lift', 0.5, 1]]) {
      const r = manoeuvre(ver, pkg, mph, kind, steer, thr); if (!r) { cells.push('-'); continue; }
      n++; if (r.spun) spins++; worst = Math.max(worst, r.mx);
      cells.push(`${kind[0]}${steer}${thr < 1 ? 'h' : ''}:${r.mx.toFixed(0)}${r.spun ? 'S' : ''}${r.rolled ? 'R' : ''}`);
    }
    rows.push(`${mph}mph ${cells.join(' ')}`);
  }
  // (allowed: the LS with everything off on tyres that aren't paddles - a few of its power slides at 20 mph on the paddles)
  const ok = tc < 3 ? spins === 0 : ver !== 'ls' ? spins === 0 : pkg !== 'true' || spins <= 6;
  if (!ok) bad++;
  console.log(`== ${['Street', 'Sport', 'Track', 'Off'][tc]} ${ver} tyres ${pkg === 'false' ? 'buggy' : pkg === 'true' ? 'paddles' : 'knobby'}${slopeDeg ? ' slope ' + slopeDeg : ''}: ${spins}/${n} spun, worst slide ${worst.toFixed(0)} deg${ok ? '' : ' <<'}\n   ` + rows.join('\n   '));
}
console.log(bad ? `${bad} PROBLEMS` : 'all ok');
