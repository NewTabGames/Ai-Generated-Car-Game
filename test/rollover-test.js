// Rollover resistance on flat asphalt: hard steering at speed must slide / spin the car, never tip it over.
// Steering is fed the way the game does: keyboard (ramped, lock limited to ~1 g + a little slip, like src/input.js),
// the PXN wheel with speed-sensitive steering, and raw full lock (sensitivity switched off). Step + fishhook.
const { Vehicle, CARS, tuneSpec } = require('../src/vehicle.js');
const flat = { C: { WATER_LEVEL: -1000 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = 0; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
const dt = 1 / 120, MPH = 2.23694;
const kbLimit = (v) => { v = Math.abs(v); return v < 1 ? 1 : Math.min(1, (Math.atan(2.946 * 10 / (v * v)) + 0.02) / 0.545); };
const wheelLimit = (v) => { const vs = Math.abs(v) / 11; return 1 / (1 + vs * Math.sqrt(vs)); };
function make(cfg) {
  const v = new Vehicle(flat, cfg.car ? Object.assign({}, CARS[cfg.car].spec) : undefined);
  if (cfg.tire) v.setTires(cfg.tire, cfg.tire); else if (cfg.rear) v.setTires('street', cfg.rear); else if (cfg.car) v.setTires(v.spec.frontTire, v.spec.rearTire);
  if (cfg.tune) {
    const base = JSON.parse(JSON.stringify(v.spec));
    const t = Object.assign({ power: 1, boost: base.boostMax, stretch: 1, limiter: base.limiterRpm, idle: base.idleRpm, inertia: 1, nos: 0, pops: 1, whine: 1,
      finalAuto: base.autoFinal, finalManual: base.manualFinal, shiftTime: base.shiftTimeWOT || 0.22, launch: base.launchRpm || 4000, gov: true,
      mass: base.mass, grip: 1, downforce: 0, drag: 1, brakes: 1, stiff: 1, steer: 1, gravity: 1, smoke: 1 }, cfg.tune);
    tuneSpec(v.spec, base, t); v.applySpec();
  }
  v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = 2000 / 9.549; v.park = false; v.gear = 1; v.tcMode = cfg.tc === undefined ? 1 : cfg.tc;
  for (const w of v.wheels) w.temp = 60;
  return v;
}
const up = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
function run(cfg, mph, mode, pattern) {
  const v = make(cfg), tgt = mph / MPH;
  for (let i = 0; i < 9000 && v.forwardSpeed < tgt; i++) { v.input.throttle = 1; v.step(dt); }
  let kb = 0, maxRoll = 0, minUp = 1, maxLift = 0;
  for (let t = 0; t < 4; t += dt) {
    const dir = pattern === 'fishhook' ? (t < 0.9 ? 1 : -1) : 1;
    const sp = v.forwardSpeed;
    let steer;
    if (mode === 'keyboard') { kb += Math.sign(dir - kb) * Math.min(Math.abs(dir - kb), 2.6 * (1 - 0.55 * Math.min(1, sp / 45)) * (Math.sign(dir) !== Math.sign(kb) && kb ? 2.2 : 1) * dt); steer = kb * kbLimit(sp); }
    else if (mode === 'wheel') steer = dir * wheelLimit(sp);
    else steer = dir;                                    // raw full lock
    v.input.steer = steer; v.input.throttle = 0.35;
    v.step(dt);
    const u = up(v); minUp = Math.min(minUp, u);
    maxRoll = Math.max(maxRoll, Math.acos(Math.max(-1, Math.min(1, u))) * 57.3);
    maxLift = Math.max(maxLift, v.wheels.filter((w) => !w.contact).length);
    if (u < 0.2) break;
  }
  return { rolled: minUp < 0.2, maxRoll, maxLift };
}
const CFGS = [
  ['Hellcat P Zero', {}], ['Hellcat KO2 + lift', { tire: 'offroad' }], ['Hellcat drag radials', { tire: null, rear: 'drag' }],
  ['Demon 170', { car: 'demon' }], ['Demon KO2 + lift', { car: 'demon', tire: 'offroad' }],
  ['Drag Pak', { car: 'dragpak' }], ['Drag Pak KO2 + lift', { car: 'dragpak', tire: 'offroad' }],
  ['Hellcat Stage 2 (grip 1.1)', { tune: { grip: 1.1, power: 1.2 } }], ['Hellcat Unhinged (grip 1.5, df)', { tune: { grip: 1.5, downforce: 1200, stiff: 1.3, power: 1.9 } }],
  ['Hellcat KO2 Unhinged', { tire: 'offroad', tune: { grip: 1.5, downforce: 1200, stiff: 1.3, power: 1.9 } }],
  ['Hellcat max grip (2.5)', { tune: { grip: 2.5, downforce: 3000, power: 2 } }], ['Drag Pak max grip (2.5)', { car: 'dragpak', tune: { grip: 2.5 } }],
];
let fails = 0;
for (const [name, cfg] of CFGS) {
  const cells = [];
  for (const mode of ['keyboard', 'wheel', 'raw']) for (const pat of ['step', 'fishhook']) for (const mph of [40, 70, 100]) {
    const r = run(cfg, mph, mode, pat);
    if (r.rolled) { fails++; cells.push(`${mode}/${pat}/${mph}: ROLLED`); }
    else if (r.maxRoll > 12) cells.push(`${mode}/${pat}/${mph}: ${r.maxRoll.toFixed(0)}°${r.maxLift >= 2 ? ' 2 wheels up' : ''}`);
  }
  console.log(name.padEnd(34), cells.length ? cells.join(' | ') : 'all upright, body roll under 12°');
}
console.log(fails ? `\n${fails} rollovers` : '\nno rollovers');
