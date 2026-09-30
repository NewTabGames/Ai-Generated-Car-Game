// The Car Crushers 2 cars: ride height, launches and top speed against their targets (the game's top speeds; the
// GT-R's and the Blue Bird's real figures), cornering on a skid pad (grip or tip-over), braking, keyboard lane
// changes, and the Banana Car afloat on a lake. CC=couch,gtr,... picks which to run; id:engine runs an electric car
// with one of its petrol alternatives (mini:twinair, scooter:busa, razor:ls); golf:jet and golf:mega are the turbojet carts.
const { Vehicle, CARS } = require('../src/vehicle.js');
const MPH = 2.23694;
const flat = (surf, water) => ({ C: { WATER_LEVEL: water === undefined ? -1e4 : water }, ground(x, z, o) { o.h = water === undefined ? 0 : -3; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = water === undefined ? surf : 4; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } });
// the traction-control mode each starts on in the game
const TC = { couch: 2, bluebird: 2, scooter: 1 };
const TARGET = { hellcat: 199, couch: 190, eggrod: 142, banana: 85, bluebird: 301, gtr: 196, mini: 55, potty: 45, scooter: 119, razor: 142,
  'mini:twinair': 100, 'scooter:busa': 160, 'razor:ls': 165, golf: 19, 'golf:lsv': 35, 'golf:hot': 84, 'golf:busa': 119, 'golf:jet': 187, 'golf:mega': 342, rally: 116, 'rally:r2': 120, 'rally:gb': 140 };
const ALL = 'couch,eggrod,banana,bluebird,gtr,mini,potty,scooter,razor,mini:twinair,scooter:busa,razor:ls,golf,golf:lsv,golf:hot,golf:busa,golf:jet,golf:mega,rally,rally:r2,rally:gb';
const defOf = (key) => { const [id, eng] = key.split(':'); return eng ? CARS[id].make(eng) : CARS[id]; };
function mk(key, surf, water) {
  const id = key.split(':')[0];
  const v = new Vehicle(flat(surf || 0, water), defOf(key).spec);
  v.setTires(v.spec.frontTire, v.spec.rearTire);
  v.reset(0, water === undefined ? 0 : -3, 0, 0, -1); v.running = true; v.eOmega = v.spec.idleRpm / 9.549; v.park = false; v.gear = 1;
  if (v.spec.jet) v.jetN = v.spec.jet.idle;          // (a turbojet: lit and idling)
  v.tcMode = TC[id] !== undefined ? TC[id] : 1;
  for (const w of v.wheels) w.temp = 50;
  for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); }
  v.input.brake = 0;
  return v;
}
const upY = (v) => 1 - 2 * (v.qx * v.qx + v.qz * v.qz);
const slideDeg = (v) => { const fx = -2 * (v.qx * v.qz + v.qy * v.qw), fz = -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)), vv = Math.hypot(v.vx, v.vz);
  return vv > 3 ? Math.acos(Math.max(-1, Math.min(1, (v.vx * fx + v.vz * fz) / (vv * Math.hypot(fx, fz))))) * 57.3 : 0; };
for (const key of (process.env.CC || ALL).split(',')) {
  const def = defOf(key), sp = def.spec, top = TARGET[key];
  console.log(`== ${def.name}${def.engine && def.engine !== 'ev' ? ' · ' + def.car : ''} (${def.hp} hp, ${sp.mass} kg) · target ~${top} mph`);
  { const v = mk(key); for (let i = 0; i < 240; i++) v.step(1 / 120);
    console.log(`  static: CG ${v.py.toFixed(3)} m (spec ${sp.cgHeight}) · loads ${v.wheels.map((w) => Math.round(w.Fz)).join('/')} N · ${Math.round(v.rpm())} rpm idle`); }
  // launch + top speed on asphalt (the Blue Bird gets the long run it needs)
  { const v = mk(key), T = {}; let nan = false, maxUp = 0, pitch = 0, qT;
    const z0 = v.pz, tMax = key === 'bluebird' ? 150 : 70;
    for (let t = 0; t < tMax; t += 1 / 240) {
      v.input.throttle = 1; v.step(1 / 240);
      if (!isFinite(v.px + v.vz)) { nan = true; break; }
      const s = v.forwardSpeed * MPH; for (const m of [30, 60, 100, 150, 200, 250, 300]) if (T[m] === undefined && s >= m) T[m] = t;
      if (qT === undefined && z0 - v.pz >= 402.3) qT = [t, s];
      pitch = Math.max(pitch, Math.asin(Math.max(-1, Math.min(1, -2 * (v.qy * v.qz - v.qx * v.qw)))) * 57.3);
      maxUp = Math.max(maxUp, 1 - upY(v));
    }
    console.log('  launch: ' + [30, 60, 100, 150, 200, 250, 300].filter((m) => T[m] !== undefined).map((m) => `0-${m} ${T[m].toFixed(2)} s`).join(' · ')
      + (qT ? ` · ¼ mile ${qT[0].toFixed(2)} s @ ${qT[1].toFixed(0)}` : '')
      + ` · top ${(v.forwardSpeed * MPH).toFixed(1)} mph at ${Math.round(v.rpm())} rpm in ${v.gearLabel()} · max nose-up ${pitch.toFixed(1)}°${upY(v) < 0.5 ? ' FLIPPED' : ''}${nan ? ' NaN!' : ''}`);
  }
  // skid pad on asphalt: the most lateral g held without spinning, and whether it tips instead
  { let best = 0, tipped = 0, runs = 0; const tipAt = [];
    for (const mph of [15, 25, 35, 50]) for (const st of [0.25, 0.45, 0.7]) {
      const v = mk(key); for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
      if (v.forwardSpeed * MPH < mph - 3) continue;
      runs++;
      let gl = 0, n = 0, spun = false, gMax = 0;
      for (let t = 0; t < 5; t += 1 / 120) {
        const err = mph / MPH - v.forwardSpeed; v.input.throttle = Math.max(0, Math.min(1, 0.3 + err * 0.4)); v.input.steer = st; v.step(1 / 120);
        if (upY(v) > 0.8) gMax = Math.max(gMax, Math.abs(v.gLat));
        if (t > 3) { gl += Math.abs(v.gLat); n++; }
        if (slideDeg(v) > 35) spun = true;
      }
      if (upY(v) < 0.5) { tipped++; tipAt.push(`${mph} mph (${gMax.toFixed(2)} g)`); continue; }
      if (!spun) best = Math.max(best, gl / n);
    }
    console.log(`  skid pad: up to ${best.toFixed(2)} g held${tipped ? ` · TIPPED in ${tipped} of ${runs}: ${tipAt.slice(0, 3).join(', ')}` : ''}`);
  }
  // braking
  { const vb = key === 'potty' || key === 'mini' ? 40 : 60, v = mk(key); for (let i = 0; i < 120 * 40 && v.forwardSpeed * MPH < vb; i++) { v.input.throttle = 1; v.step(1 / 120); }
    const z0 = v.pz; let t = 0, flip = false; for (; t < 15 && v.forwardSpeed > 0.3; t += 1 / 240) { v.input.throttle = 0; v.input.brake = 1; v.step(1 / 240); if (upY(v) < 0.5) flip = true; }
    console.log(`  ${vb}-0 mph: ${(Math.abs(v.pz - z0) * 3.281).toFixed(0)} ft in ${t.toFixed(2)} s (${(vb / MPH / t / 9.81).toFixed(2)} g avg)${flip ? ' FLIPPED' : ''}`); }
  // keyboard lane changes (the game's speed-limited keyboard steering)
  { let rolled = 0, spins = 0, worst = 0, maxLean = 0, n = 0; const per = [];
    const speeds = top > 150 ? [30, 60, 100, 140] : top > 100 ? [20, 45, 70, 100] : top > 60 ? [20, 40, 60, 80] : [15, 25, 35, 45];
    for (const mph of speeds) {
      const v = mk(key); for (let i = 0; i < 120 * 60 && v.forwardSpeed * MPH < mph; i++) { v.input.throttle = 1; v.step(1 / 120); }
      if (v.forwardSpeed * MPH < mph - 3) continue;
      n++;
      // (the game's keyboard limit: the car's own lateral-g target where it has one - kbLat - else the Challenger's)
      const kbLimit = (s) => { s = Math.abs(s); return s < 1 ? 1 : def.kbLat ? Math.min(1, (Math.atan(sp.wheelbase * def.kbLat / (s * s)) + 0.02 * Math.min(1, Math.max(0, (def.kbLat - 3) / 7)) * sp.wheelbase / 2.946) / sp.maxSteer)
        : Math.min(1, (Math.atan(2.946 * 10 / (s * s)) + 0.02) / 0.545); };
      let kb = 0, maxB = 0;
      for (let t = 0; t < 4; t += 1 / 120) {
        const dir = t < 0.6 ? 1 : t < 1.2 ? -1 : 0;
        kb += Math.sign(dir - kb) * Math.min(Math.abs(dir - kb), 2.6 * 2.2 / 120);
        v.input.steer = kb * kbLimit(v.forwardSpeed); v.input.throttle = 0.5; v.step(1 / 120);
        maxLean = Math.max(maxLean, Math.acos(Math.max(-1, Math.min(1, upY(v)))) * 57.3);
        maxB = Math.max(maxB, slideDeg(v));
      }
      if (upY(v) < 0.3) rolled++;
      worst = Math.max(worst, maxB); if (maxB > 45) spins++;
      per.push(`${mph}:${upY(v) < 0.3 ? "R" : maxB.toFixed(0)}`);
    }
    console.log(`  keyboard lane changes ${speeds.join('/')} mph: ${rolled ? rolled + ' ROLLED, ' : ''}${spins} spins, worst slide ${worst.toFixed(0)}°, max lean ${maxLean.toFixed(0)}° (${n} runs: ${per.join(" ")})`);
  }
  if (key === 'banana') {
    // afloat: dropped into 3 m of water - its draft, and how fast the paddling tyres push it, and that it turns
    const v = mk(key, 0, 0); let t = 0;
    for (; t < 6; t += 1 / 120) { v.input.throttle = 0; v.step(1 / 120); }
    const draft = 0 - (v.py - v.spec.cgHeight + v.spec.floats.bottom);
    for (; t < 30; t += 1 / 120) { v.input.throttle = 1; v.step(1 / 120); }
    const spd = v.forwardSpeed * MPH, h0 = Math.atan2(-2 * (v.qx * v.qz + v.qy * v.qw), -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)));
    for (let k = 0; k < 120 * 6; k++) { v.input.throttle = 1; v.input.steer = 1; v.step(1 / 120); }
    const h1 = Math.atan2(-2 * (v.qx * v.qz + v.qy * v.qw), -(1 - 2 * (v.qx * v.qx + v.qy * v.qy)));
    console.log(`  afloat: draft ${draft.toFixed(2)} m (hull bottom below the surface) · ${spd.toFixed(1)} mph paddling at ${Math.round(v.rpm())} rpm · turned ${(((h1 - h0) * 57.3 + 540) % 360 - 180).toFixed(0)}° in 6 s on full lock · upright ${upY(v).toFixed(2)} · ${v.running ? 'engine running' : 'STALLED'}`);
  }
}
// the off-road package (knobbies in each car's own size): 0-30 on grass and dirt, stock vs package
{
  const { OFFROAD_PKG } = require('../src/vehicle.js');
  console.log('\nOff-road package (knobbies): 0-30 mph stock -> package');
  for (const key of (process.env.CC || ALL).split(',')) {
    const id = key.split(':')[0], P = OFFROAD_PKG(id), out = [];
    for (const [surf, name] of [[0, 'asphalt'], [2, 'grass'], [3, 'dirt']]) {
      const r = [];
      for (const pkg of [false, true]) {
        const v = new Vehicle(flat(surf), defOf(key).spec);
        v.setTires(pkg ? P.front : v.spec.frontTire, pkg ? P.rear : v.spec.rearTire);
        v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = (v.spec.idleRpm || 0) / 9.549; v.park = false; v.gear = 1; v.tcMode = TC[id] !== undefined ? TC[id] : 1;
        for (let i = 0; i < 120; i++) { v.input.brake = 1; v.step(1 / 120); }
        v.input.brake = 0;
        let t = 0, nan = false;
        for (; t < 20 && v.forwardSpeed * MPH < 30; t += 1 / 240) { v.input.throttle = 1; v.step(1 / 240); if (!isFinite(v.px + v.vz)) { nan = true; break; } }
        r.push(nan ? 'NaN!' : t >= 20 ? '--' : t.toFixed(2));
      }
      out.push(`${name} ${r[0]} -> ${r[1]} s`);
    }
    console.log(`  ${(key.includes(':') ? defOf(key).short + ' ' + defOf(key).engines[key.split(':')[1]].label : CARS[key].short).padEnd(28)} ${out.join(' · ')}`);
  }
}
