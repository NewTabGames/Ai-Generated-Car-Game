// Resetting on a slope: the car is put down tilted to the ground under its wheels, at its ride height - not level with
// its uphill wheels buried, which fired it up into the air. On a plane tilted 10 / 20 / 30 deg, every few vehicles put
// down facing up it, across it and at 45 deg, held on the brakes: how high it rises above where it was put (and how fast
// it's thrown upwards) in the 2 s after, and whether it ends up on its wheels. Env: CARS (id[:option],...)
const { Vehicle, CARS } = require('../src/vehicle.js');
const DT = 1 / 120;
const plane = (deg, dir) => {
  const g = Math.tan(deg * Math.PI / 180), ux = Math.cos(dir), uz = Math.sin(dir);
  return { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { const n = 1 / Math.hypot(1, g); o.h = g * (x * ux + z * uz); o.nx = -g * ux * n; o.ny = n; o.nz = -g * uz * n; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
};
let bad = 0;
for (const c of (process.env.CARS || 'hellcat,buggy:vw,monster,tank:gov,bike:stock,unicycle:pedal,dragster:tf,kart:rental').split(',')) {
  const [id, key] = c.split(':'), def = CARS[id].make ? CARS[id].make(key) : CARS[id], rows = [];
  for (const deg of [10, 20, 30]) for (const [name, hd] of [['up', 0], ['across', Math.PI / 2], ['45', Math.PI / 4]]) {
    const W = plane(deg, 0), sp = JSON.parse(JSON.stringify(def.spec)), v = new Vehicle(W, sp);
    v.setTires(sp.frontTire, sp.rearTire);
    // (facing hd from up the slope: the slope rises along +x)
    const tx = Math.cos(hd), tz = Math.sin(hd);
    v.reset(0, W.ground(0, 0, {}).h, 0, tx, tz);
    const y0 = v.py;
    let rise = 0, vyMax = 0;
    for (let t = 0; t < 2; t += DT) { v.input.brake = 1; v.input.handbrake = 1; v.step(DT); rise = Math.max(rise, v.py - y0); vyMax = Math.max(vyMax, v.vy); }
    const up = 1 - 2 * (v.qx * v.qx + v.qz * v.qz), upright = up > 0.5;
    const fail = rise > 0.12 || vyMax > 0.8 || !upright;
    if (fail) bad++;
    rows.push(`${deg}deg ${name}: rise ${(rise * 100).toFixed(0)} cm, up ${vyMax.toFixed(2)} m/s${upright ? '' : ' NOT UPRIGHT'}${fail ? ' <<' : ''}`);
  }
  console.log(`== ${c}\n  ` + rows.join('\n  '));
}
console.log(bad ? `${bad} PROBLEMS` : 'all ok');
