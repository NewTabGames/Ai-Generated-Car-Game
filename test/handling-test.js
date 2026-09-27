// Handling stability: step-steer at speed, sideslip & yaw response; lift-off & power-on in a corner.
const { Vehicle } = require('../src/vehicle.js');
const flat = { C:{WATER_LEVEL:-1000}, ground(x,z,o){o.h=0;o.nx=0;o.ny=1;o.nz=0;o.surface=0;return o;}, collidersNear(x,z,r,c,b){c.length=0;b.length=0;} };
function run(label, v0, steer, tc, thrFn, secs) {
  const v = new Vehicle(flat); v.reset(0,0,0,0,-1); v.running = true; v.eOmega = 2000/9.549; v.park=false; v.gear = 1; v.tcMode = tc;
  // bring to speed with cruise
  for (let i=0;i<6000 && v.forwardSpeed < v0;i++){ v.input.throttle = 0.6; v.step(1/120); }
  let maxBeta = 0, out = [];
  for (let t=0; t<secs; t+=1/120) {
    const sp = v.forwardSpeed;
    v.input.steer = steer; v.input.throttle = thrFn(t, sp, v0);
    v.step(1/120);
    const m00 = 1-2*(v.qy*v.qy+v.qz*v.qz), m20 = 2*(v.qx*v.qz - v.qy*v.qw);
    const vr = v.vx*m00 + v.vz*m20; const beta = Math.atan2(vr, Math.abs(v.forwardSpeed))*57.3;
    maxBeta = Math.max(maxBeta, Math.abs(beta));
    if (Math.abs(t*120 % 60) < 1) out.push(`${t.toFixed(1)}s v=${(v.forwardSpeed*2.237).toFixed(0)} β=${beta.toFixed(1)}° r=${(v.wy*57.3).toFixed(1)}°/s gLat=${v.gLat.toFixed(2)}`);
  }
  console.log(`${label}: max sideslip ${maxBeta.toFixed(1)}°`); console.log('   ' + out.slice(0,8).join(' | '));
}
const hold = (t, sp, v0) => Math.max(0, Math.min(1, 0.25 + (v0 - sp) * 0.3));
run('60mph step steer 3deg (road wheel 0.1 of lock) Street', 27, 0.1, 0, hold, 4);
run('60mph step steer 3deg Sport', 27, 0.1, 1, hold, 4);
run('60mph step steer 6deg (0.2) TC off', 27, 0.2, 3, hold, 4);
run('60mph 15deg keyboard-ish (0.48) TC off', 27, 0.48, 3, hold, 4);
run('30mph 0.35 lock, floor it at 1s, Sport', 13.4, 0.35, 1, (t) => t > 1 ? 1 : 0.2, 4);
run('30mph 0.35 lock, floor it at 1s, TC off', 13.4, 0.35, 3, (t) => t > 1 ? 1 : 0.2, 4);
run('50mph 0.15 lock, lift-off at 1s, TC off', 22, 0.15, 3, (t, sp, v0) => t > 1 ? 0 : hold(t, sp, v0), 4);
