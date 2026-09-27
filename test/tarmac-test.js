// All Road map: asphalt everywhere, flat except the ramps, ramps / lights clear of each other, the spawn jump works,
// and a reset leaves the car where it is.
const W = require('../src/worldgen.js');
const { Vehicle, CARS } = require('../src/vehicle.js');
W.setMap('tarmac');
const g = {};
let bad = 0, onRamp = 0, n = 0;
for (let k = 0; k < 200000; k++) {
  const x = (Math.random() - 0.5) * 20000, z = (Math.random() - 0.5) * 20000;
  W.ground(x, z, g); n++;
  if (g.surface !== 0) bad++;
  if (g.h > 1e-9) onRamp++; else if (Math.abs(g.h) > 1e-9 || g.ny < 0.999999) bad++;
}
console.log(`ground: ${n} samples, ${bad} not flat asphalt, ${(onRamp / n * 100).toFixed(3)} % on a ramp`);
// ramps and lights over a 5 x 5 km area
const ramps = [], lamps = [];
for (let cx = -10; cx < 10; cx++) for (let cz = -10; cz < 10; cz++) { ramps.push(...W.rampsInChunk(cx, cz)); lamps.push(...W.chunkProps(cx, cz).lamps); }
let close = 0, rampLamp = 0;
for (let i = 0; i < ramps.length; i++) for (let j = i + 1; j < ramps.length; j++) if (Math.hypot(ramps[i].px - ramps[j].px, ramps[i].pz - ramps[j].pz) < 20) close++;
// clearance from each light pole to the ramp's footprint (a len x W rectangle)
for (const r of ramps) for (const l of lamps) {
  const dx = l.x - r.x, dz = l.z - r.z, u = dx * r.fx + dz * r.fz, w = dx * r.rx + dz * r.rz;
  const cu = Math.max(0, Math.min(r.len, u)), cw = Math.max(-W.RAMP.W / 2, Math.min(W.RAMP.W / 2, w));
  if (Math.hypot(u - cu, w - cw) < 1.0) rampLamp++;
}
console.log(`${ramps.length} ramps (${ramps.filter((r) => r.axis !== undefined).length} in avenue lanes), ${lamps.length} street lights; ramp pairs < 20 m apart: ${close}; lights within 1 m of a ramp: ${rampLamp}`);
// spawn run: floor it up the avenue and over the spawn jump
const sp = W.nearestRoadSpot(W.TARMAC.SPAWN_X, W.TARMAC.SPAWN_Z, 0, -1);
const world = { C: W.C, ground: W.ground, collidersNear: W.collidersNear };
const v = new Vehicle(world, Object.assign({}, CARS.hellcat.spec));
v.setTransmission('auto'); v.setTires('street', 'street');
v.reset(sp.x, sp.y, sp.z, sp.tx, sp.tz); v.running = true; v.eOmega = 1500 / 9.549; v.park = false; v.gear = 1; v.tcMode = 1;
let air = 0, maxAir = 0, maxY = 0, nan = false;
for (let t = 0; t < 14; t += 1 / 120) {
  v.input.throttle = v.pz > -250 ? 1 : 0.6; v.step(1 / 120);
  if (!isFinite(v.px + v.py + v.pz)) { nan = true; break; }
  const up = v.wheels.every((w) => !w.contact); air = up ? air + 1 / 120 : 0; maxAir = Math.max(maxAir, air); maxY = Math.max(maxY, v.py);
}
const u = 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
console.log(`spawn jump: longest airtime ${maxAir.toFixed(2)} s, peak CG ${maxY.toFixed(2)} m, ended at z ${v.pz.toFixed(0)} ${(Math.abs(v.forwardSpeed) * 2.23694).toFixed(0)} mph, ${u > 0.9 ? 'upright' : 'NOT upright'}${nan ? ', NaN!' : ''}`);
const rs = W.nearestRoadSpot(123.4, -456.7, 0.6, 0.8);
console.log(`reset in place: (${rs.x.toFixed(1)}, ${rs.z.toFixed(1)}) heading (${rs.tx.toFixed(2)}, ${rs.tz.toFixed(2)})`);
const ok = !bad && !close && !rampLamp && maxAir > 0.4 && u > 0.9 && !nan && Math.abs(rs.x - 123.4) < 0.01;
console.log(ok ? 'PASS' : 'FAIL');
