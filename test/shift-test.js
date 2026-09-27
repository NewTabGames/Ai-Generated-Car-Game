// How long the engine takes to move to the new gear's rpm on each kind of shift (and how hard the car lurches).
// Run: node test/shift-test.js
const { Vehicle, RAD2RPM } = require('../src/vehicle.js');

const flatWorld = {
  C: { WATER_LEVEL: -1000 },
  ground(x, z, out) { out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0; out.surface = 0; return out; },
  collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; },
};
const MPH = 2.23694, dt = 1 / 240;

function mk(tc) {
  const v = new Vehicle(flatWorld);
  v.reset(0, 0, 0, 0, -1);
  v.running = true; v.eOmega = 720 / RAD2RPM; v.tcMode = tc; v.park = false; v.gear = 1;
  for (let i = 0; i < 200; i++) { v.input.brake = 1; v.step(1 / 100); }
  v.input.brake = 0;
  return v;
}

// follow each gear change: time for the engine to cover 90 % of the way from the old gear's rpm to the new one's
function watch(v, label, drive, dur) {
  const out = [];
  let cur = null, lastGear = v.gear, t = 0, lastRpm = v.rpm(), lastG = v.gLong;
  while (t < dur) {
    drive(v, t);
    v.step(dt); t += dt;
    const rpm = v.rpm(), wc = Math.abs(v.carrierOmega());
    if (v.gear !== lastGear && lastGear >= 1 && v.gear >= 1) {
      if (cur) out.push(cur);
      cur = { from: lastGear, to: v.gear, t0: t, mph: v.forwardSpeed * MPH, r0: rpm, t90: null, maxRate: 0, jerk: 0, peakThr: 0 };
    }
    lastGear = v.gear;
    if (cur && t - cur.t0 < 1.2) {
      const oldS = wc * v.ratioOf(cur.from) * RAD2RPM, newS = wc * v.ratioOf(cur.to) * RAD2RPM;
      const prog = (rpm - oldS) / (newS - oldS || 1);
      if (cur.t90 === null && prog > 0.9) cur.t90 = t - cur.t0;
      cur.maxRate = Math.max(cur.maxRate, Math.abs(rpm - lastRpm) / dt);
      cur.jerk = Math.max(cur.jerk, Math.abs(v.gLong - lastG) / dt);
      cur.peakThr = Math.max(cur.peakThr, v.thrEff);
    }
    lastRpm = rpm; lastG = v.gLong;
  }
  if (cur) out.push(cur);
  console.log(label);
  for (const s of out) console.log(`   ${s.from}->${s.to} @${s.mph.toFixed(0).padStart(3)} mph  ${Math.round(s.r0).toString().padStart(4)} rpm  90% in ${s.t90 === null ? '  -  ' : (s.t90 * 1000).toFixed(0).padStart(4) + ' ms'}  max ${Math.round(s.maxRate / 1000).toString().padStart(3)}k rpm/s  jerk ${s.jerk.toFixed(1)} g/s  thr ${s.peakThr.toFixed(2)}`);
  return out;
}

// A: part-throttle cruise up to ~75 mph, then coast / light braking down to a stop (auto, Street)
let v = mk(0);
watch(v, 'A. part-throttle upshifts (30%) then coast + light brake (Street)', (v, t) => {
  if (t < 22 && v.forwardSpeed * MPH < 75) { v.input.throttle = 0.3; v.input.brake = 0; }
  else { v.input.throttle = 0; v.input.brake = t > 26 ? 0.18 : 0; }
}, 45);

// B: WOT pull
v = mk(1);
watch(v, 'B. full-throttle upshifts (Sport)', (v) => { v.input.throttle = 1; }, 14);

// C: kickdown from cruise
v = mk(1);
watch(v, 'C. cruise 50 mph then floor it (kickdown)', (v, t) => {
  if (t < 14) v.input.throttle = v.forwardSpeed * MPH < 50 ? 0.35 : 0.12; else v.input.throttle = 1;
}, 17);

// D: paddle downshifts under braking (Sport)
v = mk(1);
let paddles = 0;
watch(v, 'D. paddle downshifts while braking from 80 mph (Sport)', (v, t) => {
  if (t < 16 && v.forwardSpeed * MPH < 80) { v.input.throttle = 0.6; v.input.brake = 0; return; }
  if (!v._tBrake) v._tBrake = t;
  v.input.throttle = 0; v.input.brake = 0.3;
  const k = Math.floor((t - v._tBrake) / 0.9);
  if (k > paddles && v.gear > 2) { paddles = k; v.shiftDown(); }
}, 24);

// E: 6-speed manual (auto-clutch) downshifts with the rev-match blip
v = mk(1); v.setTransmission('manual'); v.gear = 1;
let lifts = 0;
watch(v, 'E. manual auto-clutch: upshift to 4th, then paddle down 4-3-2 while braking', (v, t) => {
  if (t < 12 && v.gear < 4) { v.input.throttle = 0.7; if (v.rpm() > 4500 && v.shiftTimer <= 0) v.shiftUp(); return; }
  if (!v._tB) v._tB = t;
  v.input.throttle = 0; v.input.brake = 0.25;
  const k = Math.floor((t - v._tB) / 1.0);
  if (k > lifts && v.gear > 2) { lifts = k; v.shiftDown(); }
}, 16);
