// High-speed stability: lane change & step-steer-release at 80/100/130 mph; reports yaw overshoot & settling.
const { Vehicle } = require('../src/vehicle.js');
const flat = { C:{WATER_LEVEL:-1000}, ground(x,z,o){o.h=0;o.nx=0;o.ny=1;o.nz=0;o.surface=0;return o;}, collidersNear(x,z,r,c,b){c.length=0;b.length=0;} };
function mk(v0, tc) {
  const v = new Vehicle(flat); v.reset(0,0,0,0,-1); v.running = true; v.eOmega = 3000/9.549; v.park=false; v.gear = 1; v.tcMode = tc;
  for (let i=0;i<120*60 && v.forwardSpeed < v0;i++){ v.input.throttle = 1; v.step(1/120); }
  return v;
}
function beta(v){ const m00 = 1-2*(v.qy*v.qy+v.qz*v.qz), m20 = 2*(v.qx*v.qz - v.qy*v.qw); return Math.atan2(v.vx*m00 + v.vz*m20, Math.abs(v.forwardSpeed))*57.3; }
for (const mph of [80, 100, 130]) {
  const v0 = mph / 2.237;
  // road-wheel angle for ~0.5 g at this speed (what a driver would use)
  const delta = Math.atan(2.946 * 4.9 / (v0*v0));
  const steer = delta / 0.545;
  for (const tc of [0, 3]) {
    const v = mk(v0, tc);
    let maxB = 0, maxR = 0, rEnd = 0, osc = 0, lastSign = 0;
    for (let t = 0; t < 6; t += 1/120) {
      // step steer for 1.5 s, then release to straight
      v.input.steer = t < 1.5 ? steer : 0;
      v.input.throttle = Math.max(0, Math.min(1, 0.35 + (v0 - v.forwardSpeed) * 0.2));
      v.step(1/120);
      const r = v.wy * 57.3;
      maxB = Math.max(maxB, Math.abs(beta(v))); maxR = Math.max(maxR, Math.abs(r));
      if (t > 1.5) { const sg = Math.sign(r); if (Math.abs(r) > 0.5 && sg !== lastSign) { osc++; lastSign = sg; } }
      rEnd = r;
    }
    // lane change: 1 Hz sine of same amplitude, 2 cycles
    const w = mk(v0, tc); let maxB2 = 0;
    for (let t = 0; t < 5; t += 1/120) {
      w.input.steer = t < 2 ? steer * 1.4 * Math.sin(2 * Math.PI * 0.8 * t) : 0;
      w.input.throttle = Math.max(0, Math.min(1, 0.35 + (v0 - w.forwardSpeed) * 0.2));
      w.step(1/120); maxB2 = Math.max(maxB2, Math.abs(beta(w)));
    }
    console.log(`${mph} mph TC${tc}: steer ${(delta*57.3).toFixed(2)}° road → peak yaw ${maxR.toFixed(1)}°/s, max β ${maxB.toFixed(2)}°, yaw sign flips after release ${osc}, final yaw ${rEnd.toFixed(2)}°/s | lane-change max β ${maxB2.toFixed(2)}°, heading drift ${(Math.atan2(w.vx, -w.vz)*57.3).toFixed(1)}°`);
  }
}
