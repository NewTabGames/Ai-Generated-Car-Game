/* Hellcat Drive — vehicle dynamics.
   2019+ Dodge Challenger SRT Hellcat: 6.2L supercharged HEMI (717 hp @ 6000, 656 lb-ft @ 4800, 6200 rpm),
   ZF 8HP90 8-speed auto w/ torque converter  or  Tremec TR6060 6-speed manual, clutch-type LSD.

   Rigid body (6 DOF) at 1 kHz, raycast suspension with ARBs and bump stops, combined-slip
   magic-formula tyres with relaxation lengths, load sensitivity and tyre temperature,
   full driveline (engine inertia, clutch / torque converter + lockup, gearbox, LSD, brakes),
   ABS / TC / ESC, line lock, launch-able neutral drops, rev limiter, stalls.

   Body frame: +X right, +Y up, +Z back (forward is -Z). Origin at centre of gravity.
   UMD: window.HCVehicle / module.exports. */
(function (root) {
  'use strict';
  const GRAV = 9.81, LBFT = 1.3558179, RAD2RPM = 30 / Math.PI, RPM2RAD = Math.PI / 30;

  const SPEC = {
    name: 'Dodge Challenger SRT Hellcat',
    // Figures from the 2023 Stellantis Challenger/Challenger SRT specification sheet
    mass: 2085,                         // 4,422 lb curb (auto) + driver
    Ipitch: 4400, Iyaw: 4800, Iroll: 950,
    cgHeight: 0.53, wheelbase: 2.946, frontWeight: 0.57,     // 116.0 in, 57/43
    trackF: 1.625, trackR: 1.618,                            // 64.0 / 63.7 in
    wheelRadius: 0.357,                 // 275/40ZR20 P Zero: 718 revs/mile rolling radius
    wheelInertiaF: 1.6, wheelInertiaR: 2.0,
    // suspension (wheel rates)
    springF: 62000, springR: 55000,
    dampBumpF: 3900, dampRebF: 6200, dampBumpR: 3600, dampRebR: 5800,
    arbF: 41000, arbR: 10500,          // 34 mm front / 19 mm rear hollow bars
    travelUp: 0.085, travelDown: 0.11, bumpStopK: 260000, suspS0: 0.30,
    // tyres: per-axle compounds, see TIRES
    loadSens: 0.11, Fz0: 5200,
    frontTire: 'street', rearTire: 'street',
    //          asphalt gravel grass dirt water prepped-strip
    surfMu:   [1.00, 0.68, 0.58, 0.64, 0.30, 1.00],
    surfCrr:  [0.012, 0.030, 0.055, 0.045, 0.25, 0.011],
    // brakes: Brembo 6-piston / 400x34 mm two-piece front, 4-piston / 350x28 mm rear
    brakeTorqueF: 4300, brakeTorqueR: 2250, handbrakeTorque: 3400,
    // steering
    maxSteer: 0.545, steerRate: 5.0, ackermann: 0.6,      // 14.4:1, 2.5 turns lock-to-lock -> 31.3 deg
    steerRatio: 14.4, steerLockDeg: 450, rearToe: 0.0044,     // 0.25 deg rear toe-in per side
    // engine
    // 6.2L supercharged HEMI Hellcat: 717 bhp @ 6000, 656 lb-ft @ 4800, max engine speed 6200
    idleRpm: 720, limiterRpm: 6200, redlineRpm: 6200, engineInertia: 0.48,
    fricA: 30, fricB: 24, starterTorque: 190,
    torqueCurve: [[0, 200], [500, 280], [1000, 360], [1500, 440], [2000, 505], [2500, 560], [3000, 600],
      [3500, 628], [4000, 645], [4500, 654], [4800, 656], [5000, 655], [5500, 646], [6000, 628],
      [6200, 606], [6500, 560], [7000, 450], [8000, 300]],
    boostMax: 11.6,
    // driveline
    // TorqueFlite 8HP90 (2.62 final)  /  Tremec TR-6060 w/ 258 mm twin-disc clutch (3.70 final)
    autoRatios: [4.71, 3.14, 2.10, 1.67, 1.29, 1.00, 0.84, 0.67], autoRev: 3.32, autoFinal: 2.62,
    manualRatios: [2.26, 1.58, 1.19, 1.00, 0.77, 0.63], manualRev: 2.90, manualFinal: 3.70,
    driveEff: 0.88, clutchTorque: 1300, lockupTorque: 1650, tcK: 0.0103, tcStall: 2.05,
    lsdPreload: 90, lsdRamp: 0.42,
    // aero
    CdA: 0.917, rho: 1.225,             // Cd 0.382 x 2.4 m^2
    // body collision box (CG frame)
    bodyHalfW: 0.965, bodyFront: -2.25, bodyRear: 2.78, bodyBottom: -0.37, bodyTop: 0.91,
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function curveAt(c, x) {
    if (x <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
      if (x <= c[i][0]) { const a = c[i - 1], b = c[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    }
    return c[c.length - 1][1];
  }
  // Tyre compounds. B/C/E shape a normalised combined-slip magic formula with its peak at rho = 1.
  // loose: friction on gravel / grass / dirt / mud (x surfMu) in both directions. Loose ground shears before the rubber
  // lets go, so a sticky compound's extra grip is wasted there and the tread's bite decides: all-terrains dig in, slicks skate.
  const TIRES = {
    street: { name: 'Pirelli P Zero 275/40ZR20', short: 'P Zero', width: 0.275,
      muX: 1.46, muY: 1.17, loose: 1.0, kappaPeak: 0.11, alphaPeak: 0.125, relaxX: 0.16, relaxY: 0.36,
      B: 1.82, C: 1.42, E: -0.25, heatCap: 3600, cold: 0.965, coldT: 20, warmT: 55, hotT: 110, overheat: 0.003, prep: 1.1 },
    // street-legal drag radial: huge straight-line bite once hot, soft sidewall, falls off hard when spun
    drag: { name: 'Nitto NT555R II 315/35R20 drag radial', short: 'Drag radial', width: 0.315,
      muX: 1.95, muY: 1.12, loose: 0.87, kappaPeak: 0.15, alphaPeak: 0.13, relaxX: 0.2, relaxY: 0.36,
      B: 1.7, C: 1.45, E: -0.254, heatCap: 2500, cold: 0.72, coldT: 25, warmT: 70, hotT: 100, overheat: 0.0045, prep: 1.3 },
    // Demon 170: Mickey Thompson ET Street R 315/50R17 rear drag radials (factory), skinny 245/55R18 fronts
    etstreet: { name: 'Mickey Thompson ET Street R 315/50R17', short: 'ET Street R', width: 0.315,
      muX: 2.0, muY: 1.1, loose: 0.87, kappaPeak: 0.15, alphaPeak: 0.13, relaxX: 0.2, relaxY: 0.36,
      B: 1.7, C: 1.45, E: -0.254, heatCap: 2300, cold: 0.7, coldT: 25, warmT: 65, hotT: 105, overheat: 0.0045, prep: 1.34 },
    // Drag Pak: Mickey Thompson ET Drag Pro 30.0x9.0R15 radial slicks on 15x10 double-beadlocks, ET Front 27.5x4.0-17 runners.
    // A race radial on a prepped, VHT'd strip bites like nothing street legal - but it is narrow and useless when cold.
    etdragpro: { name: 'Mickey Thompson ET Drag Pro 30.0x9.0R15', short: 'ET Drag Pro', width: 0.24,
      muX: 2.2, muY: 1.1, loose: 0.73, kappaPeak: 0.14, alphaPeak: 0.14, relaxX: 0.22, relaxY: 0.4,
      B: 1.7, C: 1.45, E: -0.254, heatCap: 1900, cold: 0.62, coldT: 25, warmT: 70, hotT: 110, overheat: 0.004, prep: 1.52 },
    // 29.5x10.5-15 bias-ply drag slick: fatter footprint, softer sidewall, peaks at a little more slip than the radial
    etdrag: { name: 'Mickey Thompson ET Drag 29.5/10.5-15', short: 'ET Drag slick', width: 0.29, radius: 0.3747,
      muX: 2.45, muY: 1.2, loose: 0.64, kappaPeak: 0.16, alphaPeak: 0.15, relaxX: 0.24, relaxY: 0.45,
      B: 1.65, C: 1.45, E: -0.25, heatCap: 2200, cold: 0.6, coldT: 25, warmT: 65, hotT: 105, overheat: 0.004, prep: 1.6 },
    runner: { name: 'Mickey Thompson ET Front 27.5x4.0-17', short: 'ET Front', width: 0.1,
      muX: 1.0, muY: 0.8, loose: 0.77, kappaPeak: 0.1, alphaPeak: 0.1, relaxX: 0.16, relaxY: 0.42,
      B: 1.6, C: 1.38, E: -0.3, heatCap: 1500, cold: 0.95, coldT: 20, warmT: 45, hotT: 100, overheat: 0.004, prep: 1.0 },
    skinny: { name: '245/55R18 front', short: 'Skinny front', width: 0.245,
      muX: 1.28, muY: 1.02, loose: 0.95, kappaPeak: 0.11, alphaPeak: 0.12, relaxX: 0.16, relaxY: 0.34,
      B: 1.82, C: 1.42, E: -0.25, heatCap: 3000, cold: 0.95, coldT: 20, warmT: 50, hotT: 105, overheat: 0.003, prep: 1.05 },
    // Off-road package: BFGoodrich All-Terrain T/A KO2 LT285/55R20 (32.3 in, ~70 lb each vs ~28 lb for a P Zero) + 2 in lift.
    // Interlocking blocks bite into loose ground; on pavement it matches the street tyre's grip with a touch slower
    // response, and a rounded peak that slides progressively
    // (C 1.25: ~92 % of peak when sliding vs ~79 % for the P Zero). Also: more rolling drag on tarmac, less on dirt.
    offroad: { name: 'BFGoodrich All-Terrain T/A KO2 LT285/55R20', short: 'KO2 all-terrain', width: 0.285, radius: 0.4,
      muX: 1.45, muY: 1.16, loose: 1.55, kappaPeak: 0.12, alphaPeak: 0.13, relaxX: 0.17, relaxY: 0.38,
      B: 2.91, C: 1.25, E: -0.1, heatCap: 4200, cold: 0.95, coldT: 5, warmT: 35, hotT: 95, overheat: 0.005, prep: 1.02,
      crr: [1.25, 0.75, 0.75, 0.75, 0.85, 1.25], inertiaAdd: 1.6, massAdd: 15, lift: 0.05, droop: 0.03,
      // package: 40 mm wheel spacers a side and heavier anti-roll bars, so the lifted car stays planted
      trackAdd: 0.08, arbK: 1.3 },
    // Pulling tractor: Firestone 30.5L-32 cut pulling tyres. The tall bars are sharpened to dig in: enormous bite in dirt,
    // peak traction at 20-30 % slip, but they slide sideways (looseY) and only have so-so grip on pavement.
    // No temperature to speak of (cold = 1).
    pulling: { name: 'Firestone 30.5L-32 cut pulling tyres', short: '30.5L-32 pullers', width: 0.78, radius: 0.87,
      muX: 1.15, muY: 0.92, loose: 2.8, looseY: 1.4, kappaPeak: 0.22, alphaPeak: 0.11, relaxX: 0.6, relaxY: 0.55,
    // forward bite per surface on top of loose (asphalt gravel grass dirt water strip): the bars dig through turf into the
    // soil under it - grass is where they hook best of all
    looseKx: [1, 1.05, 1.5, 1, 1.3, 1],
      B: 1.3, C: 1.35, E: -0.2, heatCap: 20000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.7,
      crr: [2.2, 1.2, 1.0, 1.0, 1.0, 2.2] },
    // ribbed steering tyres on the tractor's front axle
    tractorFront: { name: '9.5L-15 ribbed steering tyres', short: 'Rib fronts', width: 0.22, radius: 0.37,
      muX: 0.9, muY: 0.72, loose: 1.05, kappaPeak: 0.12, alphaPeak: 0.17, relaxX: 0.25, relaxY: 0.5,
      B: 1.7, C: 1.4, E: -0.2, heatCap: 5000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.05,
      crr: [1.3, 1.0, 1.0, 1.0, 1.0, 1.3] },
    // Top Fuel: Goodyear 36.0x17.5-16 drag slicks at ~7 psi. The softest rubber there is: on a VHT-prepped, rubbered-in
    // strip it holds 5 g on the hit (the soft sidewall wrinkles and winds up), on plain asphalt it's a smoke machine,
    // and it needs the burnout's heat. grow: the tyre is thrown outwards at speed, ~5 in taller at 330 mph
    tfslick: { name: 'Goodyear 36.0x17.5-16 drag slicks', short: 'TF slicks', width: 0.445, radius: 0.457,
      muX: 2.3, muY: 1.25, loose: 0.6, kappaPeak: 0.16, alphaPeak: 0.16, relaxX: 0.3, relaxY: 0.5,
      B: 1.65, C: 1.45, E: -0.25, heatCap: 4200, cold: 0.6, coldT: 25, warmT: 70, hotT: 125, overheat: 0.004, prep: 2.1, grow: 0.22 },
    // Top Alcohol: 34.5x17 slicks, a touch smaller and harder
    tadslick: { name: '34.5x17.0-16 drag slicks', short: 'TA slicks', width: 0.43, radius: 0.438,
      muX: 2.25, muY: 1.22, loose: 0.6, kappaPeak: 0.16, alphaPeak: 0.16, relaxX: 0.3, relaxY: 0.5,
      B: 1.65, C: 1.45, E: -0.25, heatCap: 3800, cold: 0.62, coldT: 25, warmT: 65, hotT: 120, overheat: 0.004, prep: 1.95, grow: 0.11 },
    // Funny Car front runners: taller and wider than a dragster's (the car is heavier and steers more). Still skinny, so
    // they give up first in a turn (a spooled rear scrubs away a lot of the slicks' cornering grip; with fronts any
    // grippier the short car swapped ends in lane changes)
    fcfront: { name: '25.0x4.5-15 front runners', short: 'FC fronts', width: 0.114, radius: 0.318,
      muX: 1.05, muY: 0.8, loose: 0.8, kappaPeak: 0.1, alphaPeak: 0.1, relaxX: 0.16, relaxY: 0.34,
      B: 1.6, C: 1.38, E: -0.3, heatCap: 1400, cold: 0.95, coldT: 20, warmT: 45, hotT: 110, overheat: 0.004, prep: 1.0,
      crr: [0.7, 1, 1, 1, 1, 0.7] },
    // dragster front runners: 22.5 in tall, 2.5 in wide, 90 psi - they only have to roll and point the car
    dragfront: { name: '22.5x2.5-17 front runners', short: 'Front runners', width: 0.064, radius: 0.286,
      muX: 1.0, muY: 0.95, loose: 0.75, kappaPeak: 0.1, alphaPeak: 0.09, relaxX: 0.14, relaxY: 0.3,
      B: 1.6, C: 1.38, E: -0.3, heatCap: 900, cold: 0.95, coldT: 20, warmT: 45, hotT: 110, overheat: 0.004, prep: 1.0,
      crr: [0.6, 1, 1, 1, 1, 0.6] },
    // Monster truck: BKT 66x43.00-25 flotation tyres (66 in tall, 43 in wide, ~645 lb each) at ~16 psi, the tread
    // hand-cut by the crew into deep paddles. They dig into the arena's clay and hook harder than any street tyre
    // (enough to stand the truck on its rear wheels), slide a long way sideways before they let go, and are only so-so
    // on pavement. No temperature to speak of.
    // Karts: 5 in rims, tiny stiff tyres - 11x7.10-5 rears, 10x4.50-5 fronts. Racing slicks (TaG / KZ) are soft and bite
    // hard once warm (a kart pulls 2 g on a rubbered-in track) but warm up and fade fast; rental karts run hard,
    // long-life compounds. Useless on dirt and grass.
    kartR: { name: 'Racing slick 11x7.10-5', short: 'Kart slicks', width: 0.18, radius: 0.14,
      muX: 1.7, muY: 1.65, loose: 0.55, kappaPeak: 0.08, alphaPeak: 0.1, relaxX: 0.08, relaxY: 0.12,
      B: 1.8, C: 1.45, E: -0.25, heatCap: 420, cold: 0.84, coldT: 20, warmT: 45, hotT: 80, overheat: 0.006, prep: 1.15,
      crr: [0.9, 1.5, 1.6, 1.5, 1, 0.9] },
    kartF: { name: 'Racing slick 10x4.50-5', short: 'Kart slicks', width: 0.115, radius: 0.127,
      muX: 1.6, muY: 1.62, loose: 0.55, kappaPeak: 0.08, alphaPeak: 0.1, relaxX: 0.07, relaxY: 0.1,
      B: 1.8, C: 1.45, E: -0.25, heatCap: 300, cold: 0.84, coldT: 20, warmT: 45, hotT: 80, overheat: 0.006, prep: 1.15,
      crr: [0.9, 1.5, 1.6, 1.5, 1, 0.9] },
    kartRentR: { name: 'Rental hard compound 11x7.10-5', short: 'Rental tyres', width: 0.18, radius: 0.14,
      muX: 1.25, muY: 1.2, loose: 0.6, kappaPeak: 0.09, alphaPeak: 0.11, relaxX: 0.08, relaxY: 0.12,
      B: 1.75, C: 1.4, E: -0.25, heatCap: 900, cold: 0.95, coldT: 15, warmT: 35, hotT: 110, overheat: 0.003, prep: 1.08,
      crr: [1, 1.5, 1.6, 1.5, 1, 1] },
    kartRentF: { name: 'Rental hard compound 10x4.50-5', short: 'Rental tyres', width: 0.115, radius: 0.127,
      muX: 1.2, muY: 1.18, loose: 0.6, kappaPeak: 0.09, alphaPeak: 0.11, relaxX: 0.07, relaxY: 0.1,
      B: 1.75, C: 1.4, E: -0.25, heatCap: 650, cold: 0.95, coldT: 15, warmT: 35, hotT: 110, overheat: 0.003, prep: 1.08,
      crr: [1, 1.5, 1.6, 1.5, 1, 1] },
    monster: { name: 'BKT 66x43.00-25 hand-cut', short: 'BKT 66x43', width: 1.09, radius: 0.838,
      muX: 1.0, muY: 0.88, loose: 1.95, looseY: 1.3, looseKx: [1, 1, 1.08, 1.08, 1.1, 1], kappaPeak: 0.22, alphaPeak: 0.2, relaxX: 0.55, relaxY: 0.85,
      B: 1.65, C: 1.45, E: -0.25, heatCap: 30000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.1,
      crr: [1.5, 1.2, 1.1, 1.1, 1.0, 1.5] },
  };
  function MF(rho, t) {
    const bx = t.B * rho;
    return Math.sin(t.C * Math.atan(bx - t.E * (bx - Math.atan(bx))));
  }
  function brakeClamp(omega, T, I, h) {
    const d = T * h / I;
    if (omega > d) return omega - d;
    if (omega < -d) return omega + d;
    return 0;
  }
  // past the end of the (stretched) torque curve, pumping + windage losses grow with rpm^2: an engine with the
  // limiter raised to 30,000 - or removed - keeps pulling, but tops out on its own instead of running away (N m)
  function windage(s, rpm) {
    const c = s.torqueCurve, rEnd = c[c.length - 1][0] * (s.rpmStretch || 1);
    return rpm > rEnd ? 0.6 * Math.pow((rpm - rEnd) / 1000, 2) : 0;
  }
  function tempGrip(T, t) {
    if (T < t.warmT) return t.cold + (1 - t.cold) * clamp((T - t.coldT) / (t.warmT - t.coldT), 0, 1);
    if (T < t.hotT) return 1.0;
    return Math.max(0.7, 1.0 - (T - t.hotT) * t.overheat);
  }

  class Vehicle {
    constructor(world, spec) {
      this.world = world;
      const s = this.spec = Object.assign({}, SPEC, spec || {});
      s.cgToFront = s.wheelbase * (1 - s.frontWeight);
      s.cgToRear = s.wheelbase * s.frontWeight;
      this.h = 1 / 1000;
      this.acc = 0;
      this._g = { h: 0, nx: 0, ny: 1, nz: 0, surface: 0 };
      this._circles = []; this._boxes = [];
      this.wheels = [];
      for (let i = 0; i < 4; i++) {
        const front = i < 2, left = (i & 1) === 0;
        const track = front ? s.trackF : s.trackR;
        const staticLoad = s.mass * GRAV * (front ? s.frontWeight : 1 - s.frontWeight) / 2;
        const k = front ? s.springF : s.springR;
        const wr = (front ? s.wheelRadiusF : s.wheelRadiusR) || s.wheelRadius;
        const yC = wr - s.cgHeight;
        this.wheels.push({
          front, left, mx: (left ? -1 : 1) * track / 2, my: yC + s.suspS0, mz: front ? -s.cgToFront : s.cgToRear,
          s0: s.suspS0, sMin: s.suspS0 - s.travelUp, sMax: s.suspS0 + s.travelDown,
          sFree: s.suspS0 + staticLoad / k, k,
          cb: front ? s.dampBumpF : s.dampBumpR, cr: front ? s.dampRebF : s.dampRebR,
          radius: wr, inertia: front ? s.wheelInertiaF : s.wheelInertiaR,
          omega: 0, spin: 0, kappa: 0, tanA: 0, sRaw: s.suspS0, s: s.suspS0, contact: false,
          Fz: 0, fx: 0, fy: 0, nx: 0, ny: 1, nz: 0, surface: 0, temp: 32, abs: 1, steer: 0,
          slipSpeed: 0, rho: 0, comp: 0, hx: 0, hy: 0, hz: 0, cpx: 0, cpy: 0, cpz: 0,
          escBrake: 0, brakeT: 0, rrT: 0, tire: TIRES[front ? s.frontTire : s.rearTire],
        });
      }
      this._base = { mass: s.mass, Ipitch: s.Ipitch, Iyaw: s.Iyaw, Iroll: s.Iroll };
      this.setTires();   // apply per-tyre rolling radius, weight and lift
      this.input = { steer: 0, throttle: 0, brake: 0, clutch: 0, handbrake: 0, lineLock: false, revHold: false };
      this.transType = 'auto';
      this.useClutchPedal = false;
      this.tcMode = 1;        // 0 Street, 1 Sport, 2 Track, 3 Off  (Hellcat ESC/TC modes)
      this.absOn = true;
      this.events = { shift: 0, backfire: 0, impact: 0, grind: 0, impactX: 0, impactZ: 0 };
      this.reset(0, 0, 0, 0, -1);
    }

    reset(x, y, z, tx, tz) {
      const s = this.spec;
      // yaw so that forward (-Z local) -> (tx, tz)
      const th = Math.atan2(-tx, -tz);
      this.qx = 0; this.qy = Math.sin(th / 2); this.qz = 0; this.qw = Math.cos(th / 2);
      this.px = x; this.py = y + s.cgHeight - (s.cgDrop || 0) + 0.02; this.pz = z;
      this.vx = this.vy = this.vz = 0; this.wx = this.wy = this.wz = 0;
      for (const w of this.wheels) { w.omega = 0; w.kappa = 0; w.tanA = 0; w.abs = 1; w.s = w.s0; }
      this.steerAngle = 0; this.rearSteerAngle = 0; this.bodyContact = 0; this.flipping = false;
      this.eOmega = this.eOmega || 0;
      if (this.running === undefined) { this.running = false; this.eOmega = 0; }
      this.cranking = false; this.crankT = 0;
      this.thrEff = 0; this.fuelCut = false; this.idleI = 0.05; this.idleFlare = 0;
      this.Te = 0; this.boost = 0;
      this.gear = this.transType === 'auto' ? 1 : 0;
      this.park = this.transType === 'auto';
      this.autoManual = false; this.manualTimer = 0; this.sinceUpshift = 9; this.kickArm = false;
      this.shiftTimer = 0; this.shiftPhase = 0; this.pendingGear = null; this.shiftCooldown = 0;
      this.locked = false; this.lockupEng = 0; this.clutchEng = 0; this.lastTin = 0;
      this.tcCut = 1; this.tcI = 0; this.escCut = 1; this.tcActive = false; this.absActive = false; this.escActive = false;
      this.lineLockActive = false;
      this.revHoldActive = false;
      this.launchHold = false; this.launchRpm = this.spec.launchRpm || 4000; this.govT = 0; this.shiftDur = 0.2; this.shiftCut = 1;
      this.chuteOut = false; this.chuteT = 0; this.chuteInfl = 0; this.wheelieBarLoad = 0; this.dcT = 0;
      this.shiftFromG = 0; this.shiftIsDown = false; this.blip = false; this._gPrev = 0;
      this.popTimer = 0; this.lastThr = 0; this.overrunT = 0;
      this.stalled = false;
      this.inWater = 0;
      this.time = 0;
      this.avx = 0; this.avz = 0; this.ay = 0; this.gLong = 0; this.gLat = 0;
      this._pvx = 0; this._pvy = 0; this._pvz = 0;
      this.odometer = this.odometer || 0;
      this.airborne = false;
    }

    // ------------------------------------------------------------------ transmission control
    ratioOf(g) {
      const s = this.spec;
      if (this.transType === 'auto') {
        if (g < 0) return -s.autoRev * s.autoFinal;
        if (g === 0) return 0;
        return s.autoRatios[g - 1] * s.autoFinal;
      }
      if (g < 0) return -s.manualRev * s.manualFinal;
      if (g === 0) return 0;
      return s.manualRatios[g - 1] * s.manualFinal;
    }
    get nGears() { return this.transType === 'auto' ? this.spec.autoRatios.length : this.spec.manualRatios.length; }
    get forwardSpeed() {
      const m02 = 2 * (this.qx * this.qz + this.qy * this.qw), m12 = 2 * (this.qy * this.qz - this.qx * this.qw), m22 = 1 - 2 * (this.qx * this.qx + this.qy * this.qy);
      return -(this.vx * m02 + this.vy * m12 + this.vz * m22);
    }
    carrierOmega() { return 0.5 * (this.wheels[2].omega + this.wheels[3].omega); }
    // gearbox ratio including the inertia phase of an automatic shift: after a short fill (torque) phase the
    // oncoming clutch slips the ratio smoothly from the old gear to the new one, instead of snapping
    _gEff() {
      const G = this.ratioOf(this.gear);
      if (this.transType !== 'auto' || this.shiftTimer <= 0 || !this.shiftFromG || this.gear < 1) return G;
      const p = 1 - this.shiftTimer / this.shiftDur, a = 0.12;
      const x = clamp((p - a) / (0.9 - a), 0, 1), e = x * x * (3 - 2 * x);
      return this.shiftFromG + (G - this.shiftFromG) * e;
    }
    rpm() { return this.eOmega * RAD2RPM; }

    gearLabel() {
      if (this.revHoldActive) return 'N';
      if (this.transType === 'auto') {
        if (this.park) return 'P';
        if (this.gear < 0) return 'R';
        if (this.gear === 0) return 'N';
        if (this.nGears === 1) return 'D';          // direct drive (Top Fuel): forward / reverse, no gearbox
        return (this.autoManual ? 'M' : 'D') + this.gear;
      }
      if (this.gear < 0) return 'R';
      if (this.gear === 0) return 'N';
      return String(this.gear);
    }

    setTires(front, rear) {
      const s = this.spec;
      if (front) s.frontTire = front;
      if (rear) s.rearTire = rear;
      let extra = 0;
      for (const w of this.wheels) {
        const ty = w.tire = TIRES[w.front ? s.frontTire : s.rearTire];
        if (w.radius0 === undefined) w.radius0 = w.radius;
        w.radius = ty.radius || w.radius0;
        // heavy tyres are harder to spin up / stop; a package lift hangs the wheel lower on the same hard point
        w.inertia = (w.front ? s.wheelInertiaF : s.wheelInertiaR) + (ty.inertiaAdd || 0);
        if (w.mx0 === undefined) w.mx0 = w.mx;
        w.mx = w.mx0 + Math.sign(w.mx0) * (ty.trackAdd || 0) / 2;
        w.s0 = s.suspS0 + (ty.lift || 0);
        w.sMin = w.s0 - s.travelUp; w.sMax = w.s0 + s.travelDown + (ty.droop || 0);
        extra += ty.massAdd || 0;
      }
      this.tireMass = extra;
      this.applySpec();
    }

    setTransmission(type) {
      if (type === this.transType) return;
      this.transType = type;
      this.gear = type === 'auto' ? 1 : 0;
      this.park = false; this.autoManual = false; this.locked = false;
      this.shiftTimer = 0; this.pendingGear = null; this.shiftFromG = 0; this.blip = false;
    }

    _beginShift(newGear) {
      if (newGear === this.gear && !this.park) return;
      this.events.shift++;
      this.locked = false;
      if (this.transType === 'auto') {
        const oldGear = this.gear, thr = this.input.throttle;
        if (newGear > this.gear) this.sinceUpshift = 0;
        // forward-to-forward shifts glide the ratio (and so the revs) from the old gear to the new one
        this.shiftFromG = !this.park && oldGear >= 1 && newGear >= 1 ? this._gEff() : 0;
        this.shiftIsDown = newGear < oldGear;
        this.gear = newGear; this.park = false;
        // 8HP90 shift times: upshifts ~0.22 s flat out / ~0.34 s cruising; downshifts ~0.3 s on the paddle,
        // ~0.36 s kickdown (+ per extra gear skipped), ~0.5 s when coasting down
        const skip = Math.max(0, Math.abs(newGear - oldGear) - 1);
        this.shiftDur = !this.shiftIsDown ? (thr > 0.8 ? (this.spec.shiftTimeWOT || 0.22) : (this.spec.shiftTimePart || 0.34))
          : this.autoManual ? 0.3 + 0.05 * skip : thr > 0.5 ? 0.36 + 0.06 * skip : 0.5 + 0.08 * skip;
        // rev-matching throttle blip on paddle downshifts, and on coast-downs in Sport / Track
        // (a race box - the tractor - never blips on its own coming down: only when you pull the paddle)
        this.blip = this.shiftIsDown && oldGear >= 1 && thr < 0.5 && (this.autoManual || (this.tcMode >= 1 && !this.spec.noCoastBlip));
        this.tccOpenAtShift = this.lockupEng < 0.05 && this.shiftIsDown;
        this.shiftTimer = this.shiftDur; this.shiftDir = 0; this.lockupEng = Math.min(this.lockupEng, newGear >= 2 && this.gear >= 1 ? 0.35 : 0);
      } else {
        if (this.useClutchPedal) {
          if (newGear !== 0 && this.input.clutch < 0.55 && this.clutchEng > 0.35 && this.gear !== 0) {
            this.events.grind++;
            return;
          }
          this.gear = newGear;
        } else {
          this.pendingGear = newGear;
          this.shiftIsDown = newGear > 0 && this.gear > 0 && newGear < this.gear;
          // downshifts take longer: clutch in, blip the revs up to the lower gear, then let the clutch out
          this.manualDur = this.shiftIsDown ? 0.42 : 0.30;
          this.shiftTimer = this.manualDur; this.shiftPhase = 0;
        }
      }
      this.shiftCooldown = 0.35;
    }

    shiftUp() {
      const v = this.forwardSpeed;
      if (this.transType === 'auto') {
        if (this.park) { this.park = false; this._beginShift(1); this.autoManual = false; return; }
        if (this.gear < 0) { this._beginShift(v < 2 ? 1 : 0); this.autoManual = false; return; }
        if (this.gear === 0) { this._beginShift(1); this.autoManual = false; return; }
        if (!this.autoManual) { this.autoManual = true; }
        this.manualTimer = 0;
        if (this.gear < this.nGears) this._beginShift(this.gear + 1);
        return;
      }
      const g = this.pendingGear !== null ? this.pendingGear : this.gear;
      if (g < 0) this._beginShift(0);
      else if (g < 6) this._beginShift(g + 1);
    }
    shiftDown() {
      const v = this.forwardSpeed;
      if (this.transType === 'auto') {
        if (this.park) return;
        if (this.gear === 0) { if (v < 2) this._beginShift(-1); return; }
        if (this.gear < 0) return;
        if (this.gear === 1) { if (Math.abs(v) < 1.5) { this._beginShift(-1); this.autoManual = false; } return; }
        // over-rev protection
        const rpmLower = Math.abs(this.carrierOmega() * this.ratioOf(this.gear - 1)) * RAD2RPM;
        if (rpmLower > this.spec.limiterRpm - 150) return;
        if (!this.autoManual) this.autoManual = true;
        this.manualTimer = 0;
        this._beginShift(this.gear - 1);
        return;
      }
      const g = this.pendingGear !== null ? this.pendingGear : this.gear;
      if (g > 1) {
        const rpmLower = Math.abs(this.carrierOmega() * this.ratioOf(g - 1)) * RAD2RPM;
        if (rpmLower > this.spec.limiterRpm + 300) return; // money-shift protection
        this._beginShift(g - 1);
      } else if (g === 1) this._beginShift(0);
      else if (g === 0 && Math.abs(v) < 2) this._beginShift(-1);
    }
    selectReverse() {
      const v = this.forwardSpeed;
      if (Math.abs(v) > 2.5) return;
      if (this.gear < 0) { this._beginShift(this.transType === 'auto' ? 1 : 0); this.autoManual = false; }
      else this._beginShift(-1);
      this.park = false;
    }
    selectDrive() {
      if (this.transType === 'auto') { this.park = false; this.autoManual = false; if (this.gear < 1) this._beginShift(1); }
      else if (this.gear <= 0) this._beginShift(1);
    }
    selectPark() {
      if (this.transType !== 'auto') { this._beginShift(0); return; }
      if (Math.abs(this.forwardSpeed) < 1.2) { this.park = true; this.gear = 1; this.locked = false; this.autoManual = false; }
    }
    setAutoMode(manual) { if (this.transType === 'auto') { this.autoManual = manual; this.manualTimer = 0; } }

    // wheel torque in the next gear vs this one at the same road speed, from the WOT torque curve (+ windage losses)
    upshiftGain(rpm) {
      const s = this.spec;
      if (this.gear < 1 || this.gear >= this.nGears) return 0;
      const T = (r) => curveAt(s.torqueCurve, r / (s.rpmStretch || 1)) * LBFT * (s.torqueScale || 1) - windage(s, r);
      const g0 = Math.abs(this.ratioOf(this.gear)), g1 = Math.abs(this.ratioOf(this.gear + 1)), t0 = T(rpm);
      return t0 <= 0 ? 9 : T(rpm * g1 / g0) * g1 / (t0 * g0);
    }
    farLimiter() {   // limiter set above the end of the powerband (Fun tab)
      const s = this.spec, c = s.torqueCurve;
      return s.limiterRpm > c[c.length - 1][0] * (s.rpmStretch || 1) + 500;
    }

    // re-derive everything the constructor baked in from the spec (after live tuning: weight, springs, gravity)
    applySpec() {
      const s = this.spec, b = this._base, mr = s.mass / b.mass;
      s.Ipitch = b.Ipitch * mr; s.Iyaw = b.Iyaw * mr; s.Iroll = b.Iroll * mr;
      this._bodyPts = null;
      for (const w of this.wheels) {
        if (w.my0 === undefined) w.my0 = w.my;
        w.my = w.my0 + (s.cgDrop || 0);   // a lower CG = hard points (and body) higher above it
        w.k = w.front ? s.springF : s.springR;
        w.cb = w.front ? s.dampBumpF : s.dampBumpR; w.cr = w.front ? s.dampRebF : s.dampRebR;
        const staticLoad = (s.mass + (this.tireMass || 0)) * GRAV * (s.gravScale || 1) * (w.front ? s.frontWeight : 1 - s.frontWeight) / 2;
        w.sFree = w.s0 + staticLoad / w.k;   // keeps the ride height whatever the weight / gravity
      }
    }

    // pull the chute (once); pressing again at a standstill repacks it
    toggleChute() {
      if (!this.spec.chuteCdA) return false;
      if (!this.chuteOut) { if (Math.abs(this.forwardSpeed) > 4) { this.chuteOut = true; this.chuteT = 0; return true; } return false; }
      if (Math.abs(this.forwardSpeed) < 1.5) { this.chuteOut = false; this.chuteT = 0; this.chuteInfl = 0; }
      return false;
    }

    startEngine() {
      if (this.running || this.cranking) return;
      this.cranking = true; this.crankT = 0; this.stalled = false;
    }
    stopEngine() { this.running = false; this.cranking = false; }

    // ------------------------------------------------------------------ main step
    step(dt) {
      this.acc += Math.min(dt, 0.1);
      const h = this.h;
      // gather obstacles once per frame
      const sp = Math.hypot(this.vx, this.vz);
      this.world.collidersNear(this.px, this.pz, 8 + sp * 0.12, this._circles, this._boxes);
      let n = 0;
      while (this.acc >= h && n < 110) { this.substep(h); this.acc -= h; n++; }
      if (n === 110) this.acc = 0;
      // frame-level telemetry
      const fdt = n * h;
      if (fdt > 0) {
        const ax = (this.vx - this._pvx) / fdt, ay = (this.vy - this._pvy) / fdt, az = (this.vz - this._pvz) / fdt;
        this._pvx = this.vx; this._pvy = this.vy; this._pvz = this.vz;
        const m00 = 1 - 2 * (this.qy * this.qy + this.qz * this.qz), m10 = 2 * (this.qx * this.qy + this.qz * this.qw), m20 = 2 * (this.qx * this.qz - this.qy * this.qw);
        const m02 = 2 * (this.qx * this.qz + this.qy * this.qw), m12 = 2 * (this.qy * this.qz - this.qx * this.qw), m22 = 1 - 2 * (this.qx * this.qx + this.qy * this.qy);
        const gl = -(ax * m02 + ay * m12 + az * m22) / GRAV, gt = (ax * m00 + ay * m10 + az * m20) / GRAV;
        const k = Math.min(1, fdt * 12);
        this.gLong += (gl - this.gLong) * k; this.gLat += (gt - this.gLat) * k;
      }
    }

    substep(h) {
      const s = this.spec, inp = this.input, W = this.wheels, world = this.world;
      this.time += h;
      const qx = this.qx, qy = this.qy, qz = this.qz, qw = this.qw;
      const m00 = 1 - 2 * (qy * qy + qz * qz), m01 = 2 * (qx * qy - qz * qw), m02 = 2 * (qx * qz + qy * qw);
      const m10 = 2 * (qx * qy + qz * qw), m11 = 1 - 2 * (qx * qx + qz * qz), m12 = 2 * (qy * qz - qx * qw);
      const m20 = 2 * (qx * qz - qy * qw), m21 = 2 * (qy * qz + qx * qw), m22 = 1 - 2 * (qx * qx + qy * qy);
      const mass = s.mass + (this.tireMass || 0);
      let Fx = 0, Fy = -mass * GRAV * (s.gravScale || 1), Fz = 0, Tx = 0, Ty = 0, Tz = 0;
      const px = this.px, py = this.py, pz = this.pz;
      const vx = this.vx, vy = this.vy, vz = this.vz;
      const wx = this.wx, wy = this.wy, wz = this.wz;
      const upX = m01, upY = m11, upZ = m21;
      const vFwd = -(vx * m02 + vy * m12 + vz * m22);
      const vRight = vx * m00 + vy * m10 + vz * m20;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

      // ---------------- steering rack + Ackermann
      const target = clamp(inp.steer || 0, -1, 1) * s.maxSteer;   // (|| 0: a NaN input must never poison the state)
      const mr = s.steerRate * h;
      this.steerAngle += clamp(target - this.steerAngle, -mr, mr);
      const d = this.steerAngle;
      let dL = d, dR = d;
      if (Math.abs(d) > 1e-4) {
        const ad = Math.abs(d), sg = d > 0 ? 1 : -1;
        const R = s.wheelbase / Math.tan(ad);
        const inner = Math.atan(s.wheelbase / Math.max(0.5, R - s.trackF / 2));
        const outer = Math.atan(s.wheelbase / (R + s.trackF / 2));
        const aIn = ad + (inner - ad) * s.ackermann, aOut = ad + (outer - ad) * s.ackermann;
        if (d > 0) { dR = aIn * sg; dL = aOut * sg; } else { dL = aIn * sg; dR = aOut * sg; }
      }
      W[0].steer = dL; W[1].steer = dR; W[2].steer = s.rearToe; W[3].steer = -s.rearToe;   // static rear toe-in
      // four-wheel steering (monster truck): the rear axle has its own hydraulic ram on its own switch (+ = pointing right)
      if (s.rearSteerMax) {
        const rt = clamp(inp.rearSteer || 0, -1, 1) * s.rearSteerMax, ra = this.rearSteerAngle || 0;
        this.rearSteerAngle = ra + clamp(rt - ra, -mr, mr);
        W[2].steer += this.rearSteerAngle; W[3].steer += this.rearSteerAngle;
      }

      // ---------------- tyre growth: a big low-pressure slick is flung outwards as it spins up (taller, narrower),
      // which gears the car up at the top end
      for (let i = 0; i < 4; i++) {
        const w = W[i], gr = w.tire.grow;
        if (!gr) continue;
        const r0 = w.tire.radius || w.radius0, u = w.omega * r0 / 150;
        w.radius = r0 * (1 + gr * Math.min(1.4, u * u));
      }

      // ---------------- suspension geometry
      const g = this._g;
      const dirX = -upX, dirY = -upY, dirZ = -upZ;
      let anyContact = false;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        const hx = px + m00 * w.mx + m01 * w.my + m02 * w.mz;
        const hy = py + m10 * w.mx + m11 * w.my + m12 * w.mz;
        const hz = pz + m20 * w.mx + m21 * w.my + m22 * w.mz;
        w.hx = hx; w.hy = hy; w.hz = hz;
        const r = w.radius;
        if (s.tyreEnvelope) this._envelope(w, hx, hy, hz, dirX, dirY, dirZ, m00, m10, m20, m02, m12, m22, g);
        else {
          world.ground(hx, hz, g);
          let nx = g.nx, ny = g.ny, nz = g.nz;
          let ndd = -(nx * dirX + ny * dirY + nz * dirZ);
          let sl = 1e9;
          if (ndd > 0.2) {
            let hpN = (hy - g.h) * ny;
            sl = (hpN - r) / ndd;
            if (sl < w.sMax + 0.35) {
              const cx = hx + dirX * sl - nx * r, cz = hz + dirZ * sl - nz * r;
              world.ground(cx, cz, g);
              nx = g.nx; ny = g.ny; nz = g.nz;
              ndd = -(nx * dirX + ny * dirY + nz * dirZ);
              hpN = nx * (hx - cx) + ny * (hy - g.h) + nz * (hz - cz);
              sl = ndd > 0.2 ? (hpN - r) / ndd : 1e9;
            }
          }
          w.sRaw = sl;
          w.nx = nx; w.ny = ny; w.nz = nz; w.surface = g.surface; w.ndd = ndd;
        }
        const sl = w.sRaw, nx = w.nx, ny = w.ny, nz = w.nz, ndd = w.ndd;
        if (sl < w.sMax) {
          w.contact = true; anyContact = true;
          w.s = sl < w.sMin ? w.sMin : sl;
          // compression speed from hard-point velocity
          const rx = hx - px, ry = hy - py, rz = hz - pz;
          const hvx = vx + (wy * rz - wz * ry), hvy = vy + (wz * rx - wx * rz), hvz = vz + (wx * ry - wy * rx);
          w.comp = -(nx * hvx + ny * hvy + nz * hvz) / ndd;
          if (s.tyreEnvelope) w.comp = clamp(w.comp, -8, 8);    // (the carcass gives before the shocks see a spike)
        } else {
          w.contact = false; w.s = w.sMax; w.comp = 0;
        }
      }
      this.airborne = !anyContact;

      // ---------------- suspension forces (spring, damper, bump stop, anti-roll bars)
      const xFL = W[0].s0 - W[0].s, xFR = W[1].s0 - W[1].s, xRL = W[2].s0 - W[2].s, xRR = W[3].s0 - W[3].s;
      const aF = s.arbF * (W[0].tire.arbK || 1), aR = s.arbR * (W[2].tire.arbK || 1);
      const arb = [aF * (xFL - xFR), aF * (xFR - xFL), aR * (xRL - xRR), aR * (xRR - xRL)];
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        if (!w.contact) { w.Fz = 0; continue; }
        const c = w.comp;
        const cc = c > 0 ? w.cb : w.cr;
        const ac = Math.abs(c);
        const kn = s.dampKnee || 0.13;      // (blow-off: above the knee the damper only adds 45 %)
        let Fd = ac < kn ? cc * c : Math.sign(c) * cc * (kn + (ac - kn) * 0.45);
        // (suspProg - nitrogen shocks: the gas spring rises steeply deep in the stroke and the bypass tubes close off, so
        // the damping climbs too - the last few inches soak up a landing that would otherwise slam the bump stops)
        let progF = 0;
        if (s.suspProg) {
          const P = s.suspProg, e = ((w.s0 - w.sRaw) / s.travelUp - P.x0) / (1 - P.x0);
          if (e > 0) { Fd *= 1 + P.damp * Math.min(1, e); progF = w.k * s.travelUp * P.k * Math.min(e, 1.6) * Math.min(e, 1.6); }
        }
        let F = w.k * (w.sFree - w.sRaw) + Fd + arb[i] + progF;
        if (w.sRaw < w.sMin) F += s.bumpStopK * (w.sMin - w.sRaw) + 2500 * Math.max(0, c);
        // anti-squat: the rear links' angle turns part of the tyre's drive force into lift on the body at the axle
        // (and the same push down on the tyre). 100 % = no squat at all. Drag cars run more: the body is thrown up on
        // the hit, the tyres are planted, and the nose comes up
        if (!w.front && s.antiSquat && w.fx > 0) F += s.antiSquat * w.fx * s.cgHeight / s.wheelbase;
        if (F < 0) F = 0; if (F > (s.fzMax || 70000)) F = s.fzMax || 70000;
        w.Fz = F;
        // apply along body up at the wheel centre
        let cx = w.hx + dirX * w.s, cy = w.hy + dirY * w.s, cz = w.hz + dirZ * w.s;
        let fx = upX * F, fy = upY * F, fz = upZ * F;
        if (s.tyreEnvelope) {
          // the whole contact force at the contact point: the spring sets its part along the strut, the links carry the
          // rest - so a tyre rolling into a step (a car's side, a ramp's toe) is pushed back by it, not just lifted
          const N = F / Math.max(0.35, w.ndd);
          w.Fz = N; fx = w.nx * N; fy = w.ny * N; fz = w.nz * N;
          cx -= w.nx * w.radius; cy -= w.ny * w.radius; cz -= w.nz * w.radius;
        }
        Fx += fx; Fy += fy; Fz += fz;
        const rx = cx - px, ry = cy - py, rz = cz - pz;
        Tx += ry * fz - rz * fy; Ty += rz * fx - rx * fz; Tz += rx * fy - ry * fx;
      }

      // ---------------- wheelie bars: two small wheels behind the rear axle stop the car rotating over on launch
      if (s.wheelieBar) {
        // axle-mounted: they hang off the rear axle housing (not the body), so squat doesn't drop them
        const wb = s.wheelieBar;
        this.wheelieBarLoad = 0;
        for (let i = 2; i < 4; i++) {
          const w = W[i];
          const cx0 = w.hx + dirX * w.s, cy0 = w.hy + dirY * w.s, cz0 = w.hz + dirZ * w.s;
          const lx = Math.sign(w.mx) * wb.halfW - w.mx, ly = wb.clr - w.radius, lz = wb.len;
          const bx = cx0 + m00 * lx + m01 * ly + m02 * lz, by = cy0 + m10 * lx + m11 * ly + m12 * lz, bz = cz0 + m20 * lx + m21 * ly + m22 * lz;
          world.ground(bx, bz, g);
          const pen = g.h + (wb.r || 0.058) - by;            // 4.5" bar wheels (a puller's weight bar: skid pads)
          if (pen > 0) {
            const rx = bx - px, ry = by - py, rz = bz - pz;
            const bvy = vy + (wz * rx - wx * rz), kb = (wb.Fmax || 60000) / 60000;
            const F = wb.damp ? clamp((wb.k || kb * 300000) * pen - wb.damp * bvy, 0, wb.Fmax)
              : Math.min(wb.Fmax || 60000, kb * (300000 * pen + 14000 * Math.max(0, -bvy)));
            Fy += F; Tx += -rz * F; Tz += rx * F;
            this.wheelieBarLoad += F;
          }
        }
      }
      // ---------------- parachute: spring-launched, inflates in ~0.4 s, drag ~ q * CdA pulling at the rear bumper
      if (s.chuteCdA) {
        if (this.chuteOut) {
          this.chuteT += h;
          const infl = clamp((this.chuteT - 0.22) / 0.4, 0, 1);
          this.chuteInfl = infl * infl * (3 - 2 * infl) * clamp((speed - 2) / 6, 0, 1);
          const q = 0.5 * s.rho * s.chuteCdA * this.chuteInfl * speed;
          if (q > 0) {
            const lz = s.chuteZ !== undefined ? s.chuteZ : s.bodyRear, ly = (s.chuteY !== undefined ? s.chuteY : 0.58) - s.cgHeight + (s.cgDrop || 0);
            const rx = m01 * ly + m02 * lz, ry = m11 * ly + m12 * lz, rz = m21 * ly + m22 * lz;
            const cfx = -q * vx, cfy = -q * vy * 0.3, cfz = -q * vz;
            Fx += cfx; Fy += cfy; Fz += cfz;
            Tx += ry * cfz - rz * cfy; Ty += rz * cfx - rx * cfz; Tz += rx * cfy - ry * cfx;
          }
        } else this.chuteInfl = 0;
      }

      // ---------------- engine + driver aids (need wheel speeds before tyre update)
      this._aids(h, speed, vFwd, vRight, upX, upY, upZ);
      this._engine(h);

      // ---------------- tyres
      let squeal = 0;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        const r = w.radius;
        if (!w.contact || w.Fz <= 0) {
          // (rrT too: a wheel touching with no load would otherwise hand the driveline an undefined torque -> NaN car)
          w.fx = 0; w.fy = 0; w.slipSpeed = 0; w.rho = 0; w.rrT = 0;
          w.kappa *= 0.98; w.tanA *= 0.98;
          continue;
        }
        const nx = w.nx, ny = w.ny, nz = w.nz;
        const ty = w.tire, Lx = ty.relaxX, Ly = ty.relaxY;
        const sn = Math.sin(w.steer), cs = Math.cos(w.steer);
        let fx = m00 * sn - m02 * cs, fy = m10 * sn - m12 * cs, fz = m20 * sn - m22 * cs;
        const dn = fx * nx + fy * ny + fz * nz;
        fx -= nx * dn; fy -= ny * dn; fz -= nz * dn;
        const fl = 1 / Math.sqrt(fx * fx + fy * fy + fz * fz); fx *= fl; fy *= fl; fz *= fl;
        const lx = fy * nz - fz * ny, ly = fz * nx - fx * nz, lz = fx * ny - fy * nx;
        // contact point
        const cpx = w.hx + dirX * w.sRaw - nx * r, cpy = w.hy + dirY * w.sRaw - ny * r, cpz = w.hz + dirZ * w.sRaw - nz * r;
        w.cpx = cpx; w.cpy = cpy; w.cpz = cpz;
        const rx = cpx - px, ry = cpy - py, rz = cpz - pz;
        const cvx = vx + (wy * rz - wz * ry), cvy = vy + (wz * rx - wx * rz), cvz = vz + (wx * ry - wy * rx);
        const vxw = cvx * fx + cvy * fy + cvz * fz;
        const vyw = cvx * lx + cvy * ly + cvz * lz;
        const avx = Math.abs(vxw);
        const slipVel = w.omega * r - vxw;
        // relaxation-length slip states (implicit decay)
        w.kappa = (w.kappa + h * slipVel / Lx) / (1 + h * avx / Lx);
        w.tanA = (w.tanA + h * vyw / Ly) / (1 + h * avx / Ly);
        if (w.kappa > 40) w.kappa = 40; else if (w.kappa < -40) w.kappa = -40;
        if (w.tanA > 40) w.tanA = 40; else if (w.tanA < -40) w.tanA = -40;
        // low-speed damping. Its stiffness against wheel speed scales with grip x load; cap the loop gain
        // (h * dFx/dω * r / I) so a very grippy tyre on a light wheel can't chatter the wheel numerically
        // (a tuned 250 % grip car used to lock its tyres in a fight and sit at walking pace)
        const fade = avx < 4 ? 1 - avx / 4 : 0;
        let kd = fade * 0.03 / Lx;
        if (kd > 0) {
          const kpE = ty.kappaPeak * Math.pow(clamp(w.Fz / s.Fz0, 0.35, 2.5), 0.2);
          const muE = (w.surface >= 1 && w.surface <= 4 ? (ty.loose || ty.muY) * (ty.looseKx ? ty.looseKx[w.surface] : 1) : ty.muX) * s.surfMu[w.surface] * (w.surface === 5 ? ty.prep : 1) * tempGrip(w.temp, ty) * (s.gripScale || 1);
          const gain = muE * w.Fz * ty.B * ty.C * kd / kpE * h * r * r / w.inertia;
          const cap = s.tireDampCap || 3;
          if (gain > cap) kd *= cap / gain;
        }
        const kE = w.kappa + kd * slipVel;
        const tE = w.tanA + fade * 0.045 * vyw / Ly;
        const loadR = clamp(w.Fz / s.Fz0, 0.35, 2.5);
        const sx = kE / (ty.kappaPeak * Math.pow(loadR, 0.2)), sy = tE / (ty.alphaPeak * Math.pow(loadR, 0.55));
        const rho = Math.sqrt(sx * sx + sy * sy);
        w.rho = rho; w.syN = sy;
        const Fzn = w.Fz;
        const loadF = clamp(1 - s.loadSens * (Fzn / s.Fz0 - 1), 0.72, 1.18);
        // burnout in a dragster (no front brakes to hold it): the slicks come out of the water box wet and spin up
        const wet = s.burnoutWet && this.lineLockActive && !w.front ? s.burnoutWet : 1;
        const mu = s.surfMu[w.surface] * (w.surface === 5 ? ty.prep : 1) * loadF * tempGrip(w.temp, ty) * (s.gripScale || 1) * wet;
        const loose = w.surface >= 1 && w.surface <= 4;
        let Fxt = 0, Fyt = 0;
        if (rho > 1e-7) {
          const f = mu * Fzn * MF(rho, ty) / rho;
          Fxt = (loose ? (ty.loose || ty.muY) * (ty.looseKx ? ty.looseKx[w.surface] : 1) : ty.muX) * f * sx; Fyt = -(loose ? (ty.looseY || ty.loose || ty.muY) : ty.muY) * f * sy;
        }
        w.fx = Fxt; w.fy = Fyt;
        const tfx = fx * Fxt + lx * Fyt, tfy = fy * Fxt + ly * Fyt, tfz = fz * Fxt + lz * Fyt;
        Fx += tfx; Fy += tfy; Fz += tfz;
        Tx += ry * tfz - rz * tfy; Ty += rz * tfx - rx * tfz; Tz += rx * tfy - ry * tfx;
        // slip speed & tyre temperature
        const ss = Math.sqrt(slipVel * slipVel + vyw * vyw);
        w.slipSpeed = ss;
        const Ft = Math.sqrt(Fxt * Fxt + Fyt * Fyt);
        const heat = (0.55 * Ft * ss + 0.03 * Fzn * avx) * (wet < 1 ? 0.12 : 1);     // (the water carries most of it away)
        const cool = (w.temp - 25) * (22 + 9 * avx);
        w.temp += h * (heat - cool) / ty.heatCap;
        if (w.surface === 0 && rho > 0.8) squeal = Math.max(squeal, Math.min(1, (rho - 0.8) / 1.2) * Math.min(1, Fzn / 3000));
        // rolling resistance torque (applied below)
        w.rrT = -s.surfCrr[w.surface] * (ty.crr ? ty.crr[w.surface] : 1) * Fzn * r * clamp(w.omega * r / 0.4, -1, 1);
      }
      this.squeal = squeal;

      // ---------------- brakes
      this._brakes(h, speed);

      // ---------------- wheels & driveline
      let L0 = 0;
      if (s.wheelGyro) for (let i = 0; i < 4; i++) L0 += W[i].inertia * W[i].omega;
      if (s.awd) this._driveline4(h);
      else {
        for (let i = 0; i < 2; i++) {
          const w = W[i];
          w.omega += h * (-w.fx * w.radius + (w.rrT || 0)) / w.inertia;
          w.omega = brakeClamp(w.omega, w.brakeT, w.inertia, h);
        }
        const wl = W[2], wr = W[3];
        this._driveline(h, -wl.fx * wl.radius + (wl.contact ? wl.rrT : 0), -wr.fx * wr.radius + (wr.contact ? wr.rrT : 0), wl.brakeT, wr.brakeT);
      }
      if (s.wheelGyro) {
        // (wheelGyro) the wheels' spin is angular momentum the body has to trade: spinning them up rocks the body the
        // other way (nose up), braking them pitches it nose down. With four 290 kg tyres that's how a monster truck
        // driver steers a jump in the air - gas to lift the nose, a stab of brake to drop it
        let L1 = 0; for (let i = 0; i < 4; i++) L1 += W[i].inertia * W[i].omega;
        const Tg = (L1 - L0) / h;
        Tx += m00 * Tg; Ty += m10 * Tg; Tz += m20 * Tg;
      }
      for (let i = 0; i < 4; i++) W[i].spin += W[i].omega * h;

      // ---------------- aero
      if (s.ClA) {
        // tuned downforce: pushes the body down along its own up axis, squashing the tyres into the road
        const df = 0.5 * s.rho * s.ClA * vFwd * vFwd;
        Fx -= upX * df; Fy -= upY * df; Fz -= upZ * df;
      }
      const q = 0.5 * s.rho * s.CdA * speed;
      Fx -= q * vx; Fy -= q * vy; Fz -= q * vz;
      // wings (dragsters): downforce and drag where the wing really is. The big rear wing sits behind the rear axle and
      // high up, so it loads the rear tyres by more than its own downforce and lifts the nose; the nose wing holds it down
      if (s.wings) {
        for (let k = 0; k < s.wings.length; k++) {
          const wg = s.wings[k], ly = wg.y + (s.cgDrop || 0), lz = wg.z;
          const rx = m01 * ly + m02 * lz, ry = m11 * ly + m12 * lz, rz = m21 * ly + m22 * lz;
          const df = vFwd > 0 ? 0.5 * s.rho * wg.ClA * vFwd * vFwd : 0, qd = 0.5 * s.rho * wg.CdA * (s.dragScale || 1) * speed;
          const fx = -upX * df - qd * vx, fy = -upY * df - qd * vy, fz = -upZ * df - qd * vz;
          Fx += fx; Fy += fy; Fz += fz;
          Tx += ry * fz - rz * fy; Ty += rz * fx - rx * fz; Tz += rx * fy - ry * fx;
        }
      }

      // ---------------- body / ground penalty contacts (roll-overs, bottoming out)
      this._bodyGround(m00, m01, m02, m10, m11, m12, m20, m21, m22, (fx, fy, fz, rx, ry, rz) => {
        Fx += fx; Fy += fy; Fz += fz;
        Tx += ry * fz - rz * fy; Ty += rz * fx - rx * fz; Tz += rx * fy - ry * fx;
      });

      // ---------------- flip back over, GTA style (the game switches it on): on its roof or its side and nearly
      // stopped, steering left / right rolls the car about its own length back onto its wheels
      // A controlled roll: it turns the way back up (the player picks the way when it's flat on its roof) at a rate that
      // eases off as it comes upright, so it drops back onto its wheels instead of rolling on over the other side.
      {
        const st = clamp(inp.steer || 0, -1, 1), a = Math.abs(st);
        const start = inp.flipAssist && a > 0.15 && m11 < 0.5 && speed < 4 && (this.bodyContact > 0 || anyContact);
        if (!this.flipping && start) { this.flipping = true; this.flipDir = Math.abs(m10) > 0.3 ? Math.sign(m10) : Math.sign(st); }
        if (this.flipping && (!inp.flipAssist || a < 0.1 || m11 > 0.95 || speed > 12)) this.flipping = false;
        if (this.flipping) {
          if (Math.abs(m10) > 0.3) this.flipDir = Math.sign(m10);      // (right side up -> roll right, and vice versa)
          const ax = -m02, ay = -m12, az = -m22;                // roll axis: the car's own forward
          const wRoll = this.wx * ax + this.wy * ay + this.wz * az;
          const ang = Math.acos(clamp(m11, -1, 1));               // how far from upright
          const wT = this.flipDir * Math.min(1.7, 0.35 + 1.1 * ang);
          const lever = Math.max(s.bodyHalfW, (s.trackF + s.trackR) / 4, s.bodyTop || 0);
          const Tmax = 1.8 * mass * GRAV * (s.gravScale || 1) * lever;
          const T = clamp((wT - wRoll) / 1.7, -1, 1) * Tmax * Math.min(1, (a - 0.1) / 0.35);
          Tx += ax * T; Ty += ay * T; Tz += az * T;
          // (and hold its heading and pitch still while it goes over)
          const wy = this.wy - wRoll * ay, wP = (this.wx * m00 + this.wy * m10 + this.wz * m20);
          Ty -= wy * s.Iyaw * 3; Tx -= m00 * wP * s.Ipitch * 3; Ty -= m10 * wP * s.Ipitch * 3; Tz -= m20 * wP * s.Ipitch * 3;
        }
      }

      // ---------------- water
      const wl0 = world.C.WATER_LEVEL;
      const sub = wl0 - (py - 0.25);
      if (sub > 0) {
        const depth = Math.min(sub, 1.4);
        this.inWater = depth;
        Fy += mass * GRAV * 0.5 * depth;
        const dmp = 900 + 2600 * depth;
        Fx -= dmp * vx; Fy -= dmp * 2 * vy; Fz -= dmp * vz;
        if (depth > 0.55 && this.running) { this.running = false; this.stalled = true; }
      } else this.inWater = 0;

      // ---------------- integrate rigid body
      const im = 1 / mass;
      this.vx += h * Fx * im; this.vy += h * Fy * im; this.vz += h * Fz * im;
      const tlx = m00 * Tx + m10 * Ty + m20 * Tz;
      const tly = m01 * Tx + m11 * Ty + m21 * Tz;
      const tlz = m02 * Tx + m12 * Ty + m22 * Tz;
      const alx = tlx / s.Ipitch, aly = tly / s.Iyaw, alz = tlz / s.Iroll;
      this.wx += h * (m00 * alx + m01 * aly + m02 * alz);
      this.wy += h * (m10 * alx + m11 * aly + m12 * alz);
      this.wz += h * (m20 * alx + m21 * aly + m22 * alz);

      // obstacles (velocity-level impulses)
      if (this._circles.length || this._boxes.length) this._obstacles(m00, m20, m02, m22);

      this.px += h * this.vx; this.py += h * this.vy; this.pz += h * this.vz;
      const ox = this.wx, oy = this.wy, oz = this.wz;
      let nqx = qx + 0.5 * h * (ox * qw + oy * qz - oz * qy);
      let nqy = qy + 0.5 * h * (oy * qw + oz * qx - ox * qz);
      let nqz = qz + 0.5 * h * (oz * qw + ox * qy - oy * qx);
      let nqw = qw - 0.5 * h * (ox * qx + oy * qy + oz * qz);
      const ql = 1 / Math.sqrt(nqx * nqx + nqy * nqy + nqz * nqz + nqw * nqw);
      this.qx = nqx * ql; this.qy = nqy * ql; this.qz = nqz * ql; this.qw = nqw * ql;
      this.odometer += speed * h;
    }

    // ------------------------------------------------------------------ big-tyre contact (tyreEnvelope)
    // Instead of one ray down from the hub, the lower half of the tyre is tested against the ground: points round the
    // tread in the wheel plane plus both shoulders. A 66 in tyre then rolls up onto a step, a car's side or a sharp ramp
    // toe as it meets it, instead of the hub snapping up when it passes over the edge. Gives the suspension length, the
    // contact normal (from the contact point towards the hub) and the surface, like the ray does.
    _envelope(w, hx, hy, hz, dirX, dirY, dirZ, m00, m10, m20, m02, m12, m22, g) {
      const world = this.world, r = w.radius, ky = -dirY;
      if (ky < 0.2) { w.sRaw = 1e9; w.nx = 0; w.ny = 1; w.nz = 0; w.ndd = 1; return; }     // wheels up: no contact
      const E = Vehicle.ENV, S = this._envS || (this._envS = new Float64Array(E.n));
      const sn = Math.sin(w.steer), cs = Math.cos(w.steer);
      const fX = m00 * sn - m02 * cs, fY = m10 * sn - m12 * cs, fZ = m20 * sn - m22 * cs;   // wheel heading
      const aX = m00 * cs + m02 * sn, aY = m10 * cs + m12 * sn, aZ = m20 * cs + m22 * sn;   // axle
      const sE = w.sRaw < w.sMin ? w.sMin : w.sRaw > w.sMax ? w.sMax : w.sRaw;
      const cx0 = hx + dirX * sE, cz0 = hz + dirZ * sE;
      let best = 1e9, bj = -1, bth = 0, bs = 0, gx = 0, gy = 1, gz = 0;
      // (each point's clearance is measured along the ground's own normal there and turned into strut travel, like the
      // single ray does - measured straight up, a steep face read several times too much compression and flung the truck)
      const cy0 = hy + dirY * sE;
      for (let j = 0; j < E.n; j++) {                     // round the tread
        const k1 = E.sin[j] * r, k2 = E.cos[j] * r;
        const ox = k1 * fX + k2 * dirX, oy = k1 * fY + k2 * dirY, oz = k1 * fZ + k2 * dirZ;
        world.ground(cx0 + ox, cz0 + oz, g);
        const nd = -(dirX * g.nx + dirY * g.ny + dirZ * g.nz);
        const sl = S[j] = sE + (cy0 + oy - g.h) * g.ny / (nd > 0.2 ? nd : 0.2);
        if (sl < best) { best = sl; bj = j; bth = E.th[j]; bs = g.surface; gx = g.nx; gy = g.ny; gz = g.nz; }
      }
      const lw = (w.tire.width || 0.3) * 0.42, rs = r - 0.06;
      for (let side = -1; side <= 1; side += 2) for (let j = E.mid - 1; j <= E.mid + 1; j++) {    // both shoulders
        const k1 = E.sin[j] * rs, k2 = E.cos[j] * rs, l = side * lw;
        const ox = k1 * fX + k2 * dirX + l * aX, oy = k1 * fY + k2 * dirY + l * aY, oz = k1 * fZ + k2 * dirZ + l * aZ;
        world.ground(cx0 + ox, cz0 + oz, g);
        const nd = -(dirX * g.nx + dirY * g.ny + dirZ * g.nz);
        const sl = sE + (cy0 + oy - g.h) * g.ny / (nd > 0.2 ? nd : 0.2);
        if (sl < best - 0.004) { best = sl; bj = -1; bth = E.th[j]; bs = g.surface; gx = g.nx; gy = g.ny; gz = g.nz; }
      }
      // round the tread: a parabola through the lowest sample and its neighbours finds the true contact angle, so the
      // normal turns smoothly as the tyre rolls over a crest or into a dip
      if (bj > 0 && bj < E.n - 1) {
        const a = S[bj - 1], b = S[bj], c = S[bj + 1], den = a - 2 * b + c;
        if (den > 1e-9) { const o = clamp(0.5 * (a - c) / den, -0.5, 0.5); bth += o * E.dth; best = Math.min(b, b - 0.25 * (a - c) * o); }
      }
      const ps = Math.sin(bth), pc = Math.cos(bth);
      let nx = -(ps * fX + pc * dirX), ny = -(ps * fY + pc * dirY), nz = -(ps * fZ + pc * dirZ);
      const la = gx * aX + gy * aY + gz * aZ;            // + the ground's slope across the tyre
      nx += la * aX; ny += la * aY; nz += la * aZ;
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      w.nx = nx * nl; w.ny = ny * nl; w.nz = nz * nl;
      w.sRaw = best; w.surface = bs;
      w.ndd = Math.max(0.35, -(w.nx * dirX + w.ny * dirY + w.nz * dirZ));
    }

    // ------------------------------------------------------------------ driver aids: TC, ESC, line lock
    _aids(h, speed, vFwd, vRight, upX, upY, upZ) {
      const s = this.spec, inp = this.input, W = this.wheels;
      // line lock: arm only near standstill, stays while button held
      // line lock: the button, or a brake-stand (both pedals at a stop) -> fronts held, rears free, TC off
      const brakeStand = inp.throttle > 0.35 && inp.brake > 0.35 && this.gear !== 0 && !this.park && !this.revHoldActive;
      if (inp.lineLock || brakeStand) { if (this.lineLockActive || Math.abs(vFwd) < 3) this.lineLockActive = true; }
      else this.lineLockActive = false;
      this.brakeStand = brakeStand && this.lineLockActive && !inp.lineLock;
      // TC — wheel-speed based like the real module: driven vs undriven wheel speeds
      // (a front wheel that's off the ground - a wheelie, a jump - stops tracking the road: the module falls back on its
      // accelerometer-fused speed estimate for it instead of reading the whole launch as wheelspin and cutting the power)
      // A wheel that has just landed is still spinning at its airborne speed, so it's only trusted after 60 ms back down.
      const fzMinF = 0.08 * s.mass * GRAV * s.frontWeight / 2;
      for (let i = 0; i < 2; i++) W[i].tcT = W[i].contact && W[i].Fz > fzMinF ? (W[i].tcT || 0) + h : 0;
      // (tcRefBody: a dragster's skinny fronts skip and hover on the hit, so its module only uses the car's own speed)
      const vF0 = W[0].tcT > 0.06 && !s.tcRefBody ? W[0].omega * W[0].radius : vFwd;
      const vF1 = W[1].tcT > 0.06 && !s.tcRefBody ? W[1].omega * W[1].radius : vFwd;
      const vRef = 0.5 * (vF0 + vF1);
      // rough-road detection: a rear wheel skipping off a bump spins up faster than any tyre on the ground could, so the
      // module drops it from the slip estimate (and holds its state while both are in the air) instead of cutting on every bump
      const fzMin = 0.2 * s.mass * GRAV * (1 - s.frontWeight) / 2;
      const okL = W[2].contact && W[2].Fz > fzMin, okR = W[3].contact && W[3].Fz > fzMin;
      const vL = W[2].omega * W[2].radius, vR = W[3].omega * W[3].radius;
      const vRear = okL && okR ? Math.max(vL, vR) : okL ? vL : vR;
      const vRearMin = okL && okR ? Math.min(vL, vR) : okL ? vL : vR;
      const tcOn = this.tcMode < 3 && !this.lineLockActive && this.gear !== 0;
      if (tcOn && !okL && !okR) { /* both rears unloaded: hold */ }
      else if (tcOn) {
        const den = Math.max(Math.abs(vRef), 3.5);
        const slip = this.gear > 0 ? (vRear - Math.max(vRef, 0)) / den : (Math.min(vRef, 0) - vRearMin) / den;
        // slip target per mode, but never past the driven tyre's grip peak: regulating on the far side of the peak is
        // unstable (more slip = less grip, the wheel runs away), which made the cut hunt and the car stutter
        const peak = W[2].tire.kappaPeak * (s.tcPeakK || [0.6, 0.9, 1.0][this.tcMode] || 1);
        // (tcTargets: tyres that bite at a lot more slip - the tractor's pulling tyres peak at ~22 % - get targets near
        // their own peak in every mode, instead of a road tyre's 6-17 % that would starve them)
        let target = s.tcTargets ? s.tcTargets[this.tcMode] : Math.min(this.tcMode === 0 ? 0.06 : this.tcMode === 1 ? 0.11 : 0.17, peak);
        // (tcCombined - dragsters: keep the driven tyres inside their friction circle. The more cornering load the rears
        // carry, the less wheelspin is allowed, so a hard-driven slick can't be pushed past its limit in a turn. Without
        // it, part throttle on street asphalt used all the rear grip and the short Funny Car swapped ends in a lane change)
        if (s.tcCombined) { const sy = Math.max(Math.abs(W[2].syN || 0), Math.abs(W[3].syN || 0)); target *= Math.sqrt(Math.max(0, 1 - sy * sy)); }
        const err = slip - target;
        // look-ahead: rear wheels accelerating away from the car (slip rising) -> start pulling torque early
        const dS = this.tcSlipPrev === undefined ? 0 : (slip - this.tcSlipPrev) / h;
        this.tcSlipPrev = slip;
        this.tcDs = (this.tcDs || 0) + (dS - (this.tcDs || 0)) * Math.min(1, h / 0.02);
        // (only on throttle with the rears already slipping - idle creep and wheel-speed jitter must not trigger it)
        const ahead = inp.throttle > 0.15 && slip > 0.4 * target ? (s.tcTd !== undefined ? s.tcTd : 0.035) * Math.max(0, this.tcDs) : 0;
        const errA = err + ahead;
        // PI controller on wheel slip -> spark/torque reduction; torque is pulled instantly and fed back in at a
        // limited rate like the real modules
        this.tcI = err > 0 ? Math.min(1, this.tcI + err * h * 7) : Math.max(0, this.tcI - h * (0.9 + 5 * -err));
        const req = clamp(1 - (errA > 0 ? errA * (s.tcKp || 2.0) : 0) - this.tcI, 0, 1);
        const rec = s.tcRecover || 6;
        this.tcCut = req < this.tcCut ? req : Math.min(req, this.tcCut + rec * h);
        this.tcActive = this.tcCut < 0.96 && inp.throttle > 0.05;
      } else { this.tcCut = 1; this.tcI = 0; this.tcActive = false; }
      // ESC (Street & Sport): yaw-rate control like the real module. Reference yaw rate from the steering
      // (bicycle model with ~1.4 deg/g understeer), capped at what the tyres can deliver; if the car rotates
      // more than asked (oversteer) cut torque and brake the outer front. Sideslip check catches slow drifts.
      W[0].escBrake = 0; W[1].escBrake = 0; this.escCut = 1; this.escActive = false;
      if (this.tcMode <= 1 && !s.noESC && speed > 5 && !this.lineLockActive && vFwd > 3) {
        const street = this.tcMode === 0;
        const yawRate = this.wx * upX + this.wy * upY + this.wz * upZ;          // + = rotating left
        const L = s.wheelbase, K = 0.0025;
        const rMax = 9.8 / vFwd;
        const rRef = clamp(-vFwd * Math.tan(this.steerAngle) / (L + K * vFwd * vFwd), -rMax, rMax);
        const beta = Math.atan2(vRight, Math.abs(vFwd));
        const margin = street ? 0.05 + 0.08 * Math.abs(rRef) : 0.14 + 0.2 * Math.abs(rRef);
        // oversteer: rotating further in the direction of rotation than the reference allows
        let eYaw = 0;
        if (yawRate > 0) eYaw = yawRate - Math.max(rRef, 0) - margin;
        else eYaw = -(yawRate - Math.min(rRef, 0)) - margin;
        const bThr = street ? 0.07 : 0.17;
        const eBeta = Math.abs(beta) - bThr;
        const e = Math.max(eYaw * 0.8, eBeta);
        if (e > 0) {
          const T = Math.min(3400, e * 30000);
          // rotating left too much (or tail out to the right: beta > 0) -> brake right front, and vice versa
          const dir = eYaw * 0.8 >= eBeta ? yawRate > 0 : beta > 0;
          if (dir) W[1].escBrake = T; else W[0].escBrake = T;
          this.escCut = Math.max(0.1, 1 - e * (street ? 9 : 6));
          this.escActive = true;
        }
      }
    }

    // ------------------------------------------------------------------ brakes & ABS
    _brakes(h, speed) {
      const s = this.spec, inp = this.input, W = this.wheels;
      const pedal = clamp(inp.brake, 0, 1);
      let absAny = false;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        const maxT = w.front ? s.brakeTorqueF : s.brakeTorqueR;
        let T;
        if (this.launchHold) {
          T = (w.front ? s.brakeTorqueF : s.brakeTorqueR) * 1.5;
        } else if (this.lineLockActive) {
          T = w.front ? s.brakeTorqueF * 1.2 : 0;
        } else {
          if (this.absOn && !s.noABS && pedal > 0.03 && speed > 2.2 && w.contact) {
            const kp = w.tire.kappaPeak;
            if (w.kappa < -kp * 1.35) { w.abs = Math.max(0.12, w.abs - h * 22); absAny = true; }
            else if (w.kappa > -kp * 0.85) w.abs = Math.min(1, w.abs + h * 7);
            else absAny = absAny || w.abs < 0.95;
          } else w.abs = Math.min(1, w.abs + h * 10);
          T = maxT * pedal * w.abs;
        }
        if (!w.front && !this.launchHold) T += s.handbrakeTorque * clamp(inp.handbrake, 0, 1);
        T += w.escBrake || 0;
        w.brakeT = T;
      }
      this.absActive = absAny;
    }

    // ------------------------------------------------------------------ engine
    _engine(h) {
      const s = this.spec, inp = this.input;
      let rpm = this.eOmega * RAD2RPM;
      // start / crank
      if (this.cranking) {
        this.crankT += h;
        if (this.crankT > 0.75 && rpm > 220) {
          this.cranking = false; this.running = true; this.idleFlare = 1250; this.idleI = 0.06;
        }
        if (this.crankT > 3) this.cranking = false;
      }
      let thr = clamp(inp.throttle, 0, 1);
      // progressive throttle linkage (mechanical injection: the butterflies open slowly at first, fully at the end)
      if (s.thrExp) thr = Math.pow(thr, s.thrExp);
      // shift strategies
      // torque management through the shift: a smooth spark-retard dip that recovers as the new gear takes up
      const shiftPh = this.shiftDur ? 1 - clamp(this.shiftTimer / this.shiftDur, 0, 1) : 1;
      const shifting = this.transType === 'auto' && this.shiftTimer > 0;
      const cutDepth = this.shiftIsDown ? 0.25 : (s.shiftCutDepth !== undefined ? s.shiftCutDepth : 0.5);
      const shiftCut = shifting && (!this.shiftIsDown || thr > 0.5) ? 1 - cutDepth * Math.sin(Math.PI * shiftPh) : 1;
      this.shiftCut = shiftCut;
      if (shifting && this.blip && this.running) {
        // ECU opens the throttle to spin the engine up to the lower gear's speed, then gets out of it
        const tgt = Math.abs(this.carrierOmega() * this.ratioOf(this.gear)) * 1.03;
        // (blipMax: a 10,000 hp engine only needs a crack of throttle to match the revs)
        const b = clamp((tgt - this.eOmega) * 0.012, 0, s.blipMax || 0.55) * (shiftPh < 0.85 ? 1 : 0);
        if (b > thr) thr = b;
      }
      if (this.transType === 'manual' && !this.useClutchPedal && this.shiftTimer > 0 && this.pendingGear !== null) {
        thr = 0; // lift during shift
      }
      if (this.transType === 'manual' && !this.useClutchPedal && this.shiftTimer > 0 && this.shiftIsDownBlip) {
        // auto rev-match blip towards target rpm
        const tgt = this.blipTarget;
        thr = clamp((tgt - this.eOmega) * 0.011, 0, 0.75);
      }
      // idle governor (PI) with post-start flare
      if (this.running) {
        this.idleFlare *= Math.exp(-h / 1.1);
        // cammed idle hunts a little: the tach needle dances +-30-40 rpm
        const tgt = s.idleRpm + this.idleFlare + 11 * Math.sin(this.time * 6.9) + 6 * Math.sin(this.time * 2.3 + 1.1);
        const e = tgt - rpm;
        this.idleI = clamp(this.idleI + e * h * 0.00015, 0, 0.22);
        const idleThr = clamp(e * 0.0009 + this.idleI, 0, 0.4);
        if (thr < idleThr) thr = idleThr;
      }
      // rev limiter (fuel cut with hysteresis); the Fun tab can remove it
      if (rpm > s.limiterRpm && !s.noLimiter) this.fuelCut = true;
      else if (rpm < s.limiterRpm - 230 || s.noLimiter) this.fuelCut = false;
      // launch control / TransBrake: hold rpm with spark cut, keep the throttle open so boost is ready (Torque Reserve)
      // (launchLimiter: a starting-line rev limiter that works whatever the traction-control setting)
      const launchCut = this.launchHold && (this.tcMode < 3 || s.launchLimiter) ? clamp((this.launchRpm - rpm) / 150, 0, 1) : 1;
      if (s.govSpeed) {
        const v = this.forwardSpeed;
        if (v > s.govSpeed) this.govT += h; else if (v < s.govSpeed - 1.5) this.govT = 0;
        if (this.govT > s.govGrace) thr *= clamp((s.govSpeed - v) / 1.2 + 0.3, 0, 1);
      }
      if (this.fuelCut || !this.running) thr = 0;
      // throttle-body / manifold lag
      const tau = thr > this.thrEff ? 0.065 : 0.045;
      this.thrEff += (thr - this.thrEff) * Math.min(1, h / tau);
      const Twot = curveAt(s.torqueCurve, rpm / (s.rpmStretch || 1)) * LBFT * (s.torqueScale || 1) - windage(s, rpm);
      const Tf = (s.fricA + s.fricB * rpm / 1000) * Math.tanh(this.eOmega / 4);
      // ignition timing on the hit (nitro dragsters): the crew chief pulls timing for the first second of the run and
      // brings it back in on the timers as the car gathers speed and the tyres can take it
      let retard = 1;
      if (s.launchRetard) { const x = clamp(this.dcT / s.launchRetard[1], 0, 1); retard = s.launchRetard[0] + (1 - s.launchRetard[0]) * x * x * (3 - 2 * x); }
      let Te = (this.running && !this.fuelCut) ? this.thrEff * Twot * retard * this.tcCut * this.escCut * shiftCut * launchCut - (1 - this.thrEff) * Tf : -Tf;
      if (this.cranking) Te += s.starterTorque * Math.max(0, 1 - rpm / 380);
      // nitrous (Fun tab): a fixed horsepower shot on top, while the button is held at wide-open throttle
      this.nosActive = !!(inp.nos && s.nosHp > 0 && this.running && !this.fuelCut && thr > 0.6 && rpm > 1500 && this.gear !== 0 && !this.launchHold);
      if (this.nosActive) Te += s.nosHp * 745.7 / Math.max(this.eOmega, 260) * this.tcCut * this.escCut * shiftCut;
      this.Te = Te;
      // supercharger boost (for gauge & whine)
      const bTgt = s.boostMax * this.thrEff * Math.pow(clamp((rpm - 900) / 3600, 0, 1), 0.65) * (this.running ? 1 : 0);
      this.boost += (bTgt - this.boost) * Math.min(1, h / 0.12);
      // overrun pops & crackles
      const dThr = this.lastThr - inp.throttle;
      if (dThr > 0.35 && rpm > 3000 && this.running) this.overrunT = 0.9 + Math.random() * 0.8;
      this.lastThr = inp.throttle;
      if (this.overrunT > 0) {
        this.overrunT -= h;
        if (inp.throttle > 0.3) this.overrunT = 0;
        else if (rpm > 1800 && Math.random() < h * 6 * (s.popScale !== undefined ? s.popScale : 1)) this.events.backfire++;
      }
      if (this.fuelCut && Math.random() < h * 2.5 * (s.popScale !== undefined ? s.popScale : 1)) this.events.backfire++;
      // stall detection
      if (this.running && rpm < 330 && this.locked && this.gear !== 0) {
        this.running = false; this.stalled = true;
      }
    }

    // ------------------------------------------------------------------ driveline
    _coupling() {
      // returns 0 none, 1 fluid (torque converter), 2 friction (clutch / lockup) with this._cap
      const s = this.spec;
      if (this.gear === 0 || this.park || this.revHoldActive || this.launchHold) return 0;
      if (s.dragClutch) { this._cap = this._dcCap(); return this._cap > 1 ? 2 : 0; }
      if (this.transType === 'auto') {
        if (this.lockupEng > 0.02 && !s.noLockup) { this._cap = s.lockupTorque * this.lockupEng; return 2; }
        return 1;
      }
      if (this.pendingGear !== null) return 0;
      this._cap = s.clutchTorque * this.clutchEng;
      return this._cap > 1 ? 2 : 0;
    }

    // multi-disc slipper clutch (dragsters). There's no gearbox to soak up the hit (Top Fuel is direct drive), so the
    // clutch slips by design for most of the run. Clamp = static pressure that the air timers step up over the run
    // (base, by seconds since the launch) + centrifugal counterweights (~ rpm^2). It only starts to grab above rpm0, so
    // the engine can idle in gear; traction control / clutch management backs the pressure off when the tyres spin
    _dcCap() {
      const c = this.spec.dragClutch, we = this.eOmega;
      const e = clamp((we * RAD2RPM - c.rpm0) / (c.rpm1 - c.rpm0), 0, 1);
      let cap = e * e * (3 - 2 * e) * (curveAt(c.base, this.dcT) + c.kc * we * we);
      if (this.gear < 0) cap = Math.min(cap, c.rev || 400);          // backing up on the reverser: just a nudge
      return cap * this.tcCut;
    }

    _transLogic(h, wc) {
      const s = this.spec, inp = this.input;
      this.revHoldActive = !!inp.revHold;
      const standing = Math.abs(this.forwardSpeed) < 2.5;
      if (inp.handbrake > 0.5 && this.gear !== 0 && !this.park && (this.launchHold || standing)) this.launchHold = true;
      else this.launchHold = false;
      // dragster clutch timers: start when the pedal comes out (SPACE released, or floored from a stop), reset at a stop
      if (s.dragClutch) {
        if (this.launchHold || this.gear <= 0 || this.park || (standing && inp.throttle < 0.2)) this.dcT = 0;
        else this.dcT += h;
      }
      if (this.shiftCooldown > 0) this.shiftCooldown -= h;
      const G = this.ratioOf(this.gear);
      const turbineRpm = Math.abs(wc * G) * RAD2RPM;
      if (this.transType === 'auto') {
        if (this.shiftTimer > 0) this.shiftTimer -= h;
        this.sinceUpshift += h;
        if (inp.throttle < 0.8) this.kickArm = true;
        // automatic shift schedule
        if (!this.park && this.gear >= 1 && !this.revHoldActive && !this.lineLockActive) {
          if (this.autoManual) {
            this.manualTimer += h;
            // M-mode protections: downshift before lugging below 1100 rpm
            if (turbineRpm < 1000 && this.gear > 1 && this.shiftTimer <= 0) this._beginShift(this.gear - 1);
          } else if (this.shiftTimer <= 0 && this.shiftCooldown <= 0) {
            const t = clamp(inp.throttle, 0, 1);
            const kick = t > 0.97 && this.kickArm;
            if (t > 0.97) this.kickArm = false;
            const shiftAt = s.shiftRpm || s.limiterRpm;
            // light-throttle shift points sit off the engine's idle: a race motor idling at 1,150 (Drag Pak) can't lug
            // along in top at 1,000 rpm like a street V8 - it was coasting in 3rd down to ~23 mph, dragged below idle
            const dBase = Math.max(1050, 1.35 * s.idleRpm), uBase = Math.max(1650, 1.57 * dBase);
            const up = uBase + (shiftAt - 130 - uBase) * Math.pow(t, 1.25);
            const down = dBase + 2900 * Math.pow(t, 1.6);
            // output-shaft based, but don't let converter slip bounce the engine off the limiter
            // with the converter slipping, shift on engine rpm before it sags against the limiter
            const engLimit = turbineRpm > 0.8 * up && this.eOmega * RAD2RPM > (s.shiftRpm || s.limiterRpm - 150);
            // limiter tuned far above the powerband: upshift as soon as the next gear puts more torque on the road,
            // instead of waiting for revs the engine can never reach under load (and sitting in 1st)
            const pays = t > 0.6 && turbineRpm > 2500 && this.farLimiter() && this.upshiftGain(turbineRpm) >= 1;
            if (this.gear < this.nGears && (turbineRpm > up || engLimit || pays) && this.sinceUpshift > 0.7) {
              const nextRpm = Math.abs(wc * this.ratioOf(this.gear + 1)) * RAD2RPM;
              if (nextRpm > 1150) this._beginShift(this.gear + 1);
            } else if (this.gear > 1 && turbineRpm < down && (this.sinceUpshift > 2.0 || turbineRpm < Math.max(720, 0.5 * dBase))) {
              // coasting / braking: skip gears if the car is slowing fast; floored: lowest gear that stays under 5600
              let g = this.gear - 1;
              const kdMax = s.shiftRpm ? 0.9 * s.shiftRpm : 5600;
              if (t > 0.9) while (g > 1 && Math.abs(wc * this.ratioOf(g - 1)) * RAD2RPM < kdMax) g--;
              else while (g > 1 && Math.abs(wc * this.ratioOf(g)) * RAD2RPM < down && Math.abs(wc * this.ratioOf(g - 1)) * RAD2RPM < 4500) g--;
              const lowerRpm = Math.abs(wc * this.ratioOf(g)) * RAD2RPM;
              if (lowerRpm < (s.shiftRpm ? s.shiftRpm - 300 : 5900)) this._beginShift(g);
            } else if (kick && this.gear > 1) {
              // kick-down: skip straight to the lowest gear that stays under 5600 rpm
              let g = this.gear;
              while (g > 1 && Math.abs(wc * this.ratioOf(g - 1)) * RAD2RPM < (s.shiftRpm ? 0.9 * s.shiftRpm : 5600)) g--;
              if (g !== this.gear) this._beginShift(g);
            }
          }
        }
        // torque-converter lockup clutch
        const wantLock = !s.noLockup && !this.park && this.gear !== 0 && !this.revHoldActive && !this.launchHold &&
          ((this.gear >= 2 && turbineRpm > 1150) ||
           // 1st: lock once past torque multiplication (speed ratio > 0.86) so the coupling phase doesn't bleed power
           (this.gear === 1 && turbineRpm > 2900 && (inp.throttle < 0.6 || turbineRpm > 0.86 * this.eOmega * RAD2RPM) && this.shiftTimer <= 0));
        const shP = this.shiftTimer > 0 ? 1 - this.shiftTimer / (this.shiftDur || 0.2) : 1;
        // mid-shift the converter clutch only eases in (from open it ramps up with the shift, so the revs swell instead of jumping)
        const lockTgt = wantLock ? (this.shiftTimer > 0 ? (this.tccOpenAtShift ? 0.25 * shP : 0.35 + 0.65 * shP) : 1) : 0;
        const rate = wantLock ? (inp.throttle > 0.6 ? 10 : 3.2) : 30;
        this.lockupEng += clamp(lockTgt - this.lockupEng, -rate * h, rate * h);
        if (!wantLock && this.lockupEng < 0.02) this.locked = false;
      } else {
        // manual gearbox
        if (this.useClutchPedal) {
          const c = clamp(inp.clutch, 0, 1);
          // pedal travel -> engagement with a bite point
          this.clutchEng = 1 - clamp((c - 0.12) / 0.62, 0, 1);
          this.clutchEng = this.clutchEng * this.clutchEng * (3 - 2 * this.clutchEng);
          if (this.stalled && c > 0.8 && !this.running && !this.cranking) this.startEngine();
        } else {
          let tgt;
          if (this.shiftTimer > 0) {
            this.shiftTimer -= h;
            const T = (this.manualDur || 0.30) - this.shiftTimer;
            if (T < 0.085) tgt = 0;
            else {
              if (this.pendingGear !== null) {
                this.gear = this.pendingGear; this.pendingGear = null;
                if (this.shiftIsDown) {
                  this.shiftIsDownBlip = true;
                }
              }
              if (this.shiftIsDownBlip) this.blipTarget = Math.abs(wc * this.ratioOf(this.gear)) * 1.02;
              tgt = this.shiftIsDown ? clamp((T - 0.22) / 0.18, 0, 1) : clamp((T - 0.085) / 0.2, 0, 1);
            }
            if (this.shiftTimer <= 0) this.shiftIsDownBlip = false;
          } else {
            const rpm = this.eOmega * RAD2RPM;
            if (this.gear === 0) tgt = 0;
            else if (turbineRpm > 1350) tgt = 1;
            else {
              // launch / creep: centrifugal-style engagement on engine rpm
              const e = clamp((rpm - 1000) / 1500, 0, 1);
              tgt = inp.throttle > 0.04 ? Math.pow(e, 1.3) : (turbineRpm > 900 ? 1 : 0);
            }
          }
          if (this.revHoldActive || this.launchHold) tgt = 0;
          const up = tgt > this.clutchEng ? 9 : 25;
          this.clutchEng += clamp(tgt - this.clutchEng, -up * h, up * h);
        }
        if (this.clutchEng < 0.02) this.locked = false;
      }
    }

    _driveline(h, TL, TR, TbL, TbR) {
      const s = this.spec, wl = this.wheels[2], wr = this.wheels[3];
      const Ir = wl.inertia, Ie = s.engineInertia, eff = s.driveEff;
      const wc0 = 0.5 * (wl.omega + wr.omega);
      this._transLogic(h, wc0);
      const G = this._gEff();
      const gliding = this.transType === 'auto' && this.shiftTimer > 0 && this.shiftFromG && this.gear >= 1;
      const Gdot = gliding && this._gPrev ? (G - this._gPrev) / h : 0;
      this._gPrev = G;
      const Te = this.Te;
      const lsdCap = s.lsdPreload + s.lsdRamp * Math.abs(this.lastTin);
      const dW = wl.omega - wr.omega;
      const Tb = -lsdCap * Math.tanh(dW / 2.5);
      const mode = this._coupling();
      if (mode !== 2) this.locked = false;

      if (mode === 0) {
        this.eOmega += h * Te / Ie;
        wl.omega += h * (TL + Tb) / Ir; wr.omega += h * (TR - Tb) / Ir;
        this.lastTin = 0;
      } else if (mode === 1) {
        const we = this.eOmega, wt = wc0 * G;
        // pump torque = K * we^2 * capacity(SR). Street converters: capacity falls linearly with speed ratio.
        // A race converter (tcCouple) holds full capacity to its coupling point, so it flashes to a high stall
        // yet only slips a few percent at the top end.
        let Tp = s.tcCouple ? s.tcK * we * we * Math.min(1, (1 - wt / Math.max(we, 1)) / (1 - s.tcCouple)) : s.tcK * we * (we - wt);
        if (s.tcCouple && we < 1) Tp = s.tcK * we * (we - wt);
        // multi-disc slider clutch (pulling tractors): counterweights clamp it harder as the revs rise, so it barely
        // drags at idle and locks solid under power
        if (s.tcEngage) Tp *= clamp((we * RAD2RPM - s.tcEngage[0]) / (s.tcEngage[1] - s.tcEngage[0]), 0.04, 1);
        if (Tp < 0) Tp *= 0.65;
        let TRr = 1;
        if (Tp > 0 && we > 1) {
          const SR = wt / we;
          TRr = SR < 0.85 ? s.tcStall - (s.tcStall - 1) * Math.max(0, SR) / 0.85 : 1;
        }
        this.eOmega += h * (Te - Tp) / Ie;
        const Tin = Tp * TRr * G * eff;
        wl.omega += h * (0.5 * Tin + Tb + TL) / Ir; wr.omega += h * (0.5 * Tin - Tb + TR) / Ir;
        this.lastTin = Tin;
      } else {
        const cap = this._cap;
        const Itot = 2 * Ir + Ie * G * G;
        if (this.locked) {
          // with the ratio changing, the clutch also has to spin the engine up (or soak its inertia on upshifts)
          const wcDot = (G * eff * (Te - Ie * wc0 * Gdot) + TL + TR) / Itot;
          const Treq = Te - Ie * G * wcDot - Ie * wc0 * Gdot;
          if (Math.abs(Treq) > cap) this.locked = false;
          else {
            const wc = wc0 + h * wcDot;
            const dWn = dW + h * (2 * Tb + TL - TR) / Ir;
            wl.omega = wc + 0.5 * dWn; wr.omega = wc - 0.5 * dWn;
            this.eOmega = wc * G;
            this.lastTin = G * eff * Treq;
          }
        }
        if (!this.locked) {
          const dE = this.eOmega - wc0 * G;
          const sg = dE > 0 ? 1 : dE < 0 ? -1 : 0;
          const Tcl = cap * sg;
          this.eOmega += h * (Te - Tcl) / Ie;
          const Tin = Tcl * G * eff;
          wl.omega += h * (0.5 * Tin + Tb + TL) / Ir; wr.omega += h * (0.5 * Tin - Tb + TR) / Ir;
          const wc1 = 0.5 * (wl.omega + wr.omega);
          const dE1 = this.eOmega - wc1 * G;
          if (cap > 0 && (dE1 === 0 || (dE1 > 0 ? 1 : -1) !== sg)) {
            const wcL = (2 * Ir * wc1 + Ie * G * this.eOmega) / Itot;
            const sh = wcL - wc1;
            wl.omega += sh; wr.omega += sh;
            this.eOmega = wcL * G;
            this.locked = true;
          }
          this.lastTin = Tin;
        }
      }
      // rear brakes (+ parking pawl)
      if (this.park) { TbL += 20000; TbR += 20000; }
      if (this.locked && G !== 0) {
        const Itot = 2 * Ir + Ie * G * G;
        const wc = 0.5 * (wl.omega + wr.omega);
        const wcB = brakeClamp(wc, TbL + TbR, Itot, h);
        wl.omega += wcB - wc; wr.omega += wcB - wc;
        this.eOmega = wcB * G;
      } else {
        wl.omega = brakeClamp(wl.omega, TbL, Ir, h);
        wr.omega = brakeClamp(wr.omega, TbR, Ir, h);
      }
      if (this.eOmega < 0) this.eOmega = 0;
      if (!this.running && !this.cranking && this.eOmega < 3 && !this.locked) this.eOmega *= 0.98;
    }

    // four-wheel drive (monster truck): a locked transfer case splits the gearbox output front / rear, lockers in both
    // axles. The engine / converter / clutch drives the carrier (the wheels' inertia-weighted mean speed); stiff,
    // torque-limited couplings - the lockers and the transfer case - pull the four wheels back together. Brakes on all four.
    _driveline4(h) {
      const s = this.spec, W = this.wheels, Ie = s.engineInertia, eff = s.driveEff;
      const T = this._T4 || (this._T4 = [0, 0, 0, 0]), Ti = this._Ti4 || (this._Ti4 = [0, 0, 0, 0]);
      let Isum = 0, wc0 = 0, Tsum = 0;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        T[i] = -w.fx * w.radius + (w.contact ? w.rrT : 0);
        Isum += w.inertia; wc0 += w.inertia * w.omega; Tsum += T[i];
      }
      wc0 /= Isum;
      this._transLogic(h, wc0);
      const G = this._gEff();
      const gliding = this.transType === 'auto' && this.shiftTimer > 0 && this.shiftFromG && this.gear >= 1;
      const Gdot = gliding && this._gPrev ? (G - this._gPrev) / h : 0;
      this._gPrev = G;
      const Te = this.Te, lt = s.lsdRamp * Math.abs(this.lastTin);
      const lkR = s.lsdPreload + lt, lkF = (s.lsdPreloadF || s.lsdPreload) + lt, lkC = (s.centerPreload || 2 * s.lsdPreload) + 2 * lt;
      const tR = -lkR * Math.tanh((W[2].omega - W[3].omega) / 2.5), tF = -lkF * Math.tanh((W[0].omega - W[1].omega) / 2.5);
      const tC = -lkC * Math.tanh((W[0].omega + W[1].omega - W[2].omega - W[3].omega) / 5);
      Ti[0] = tF + tC / 2; Ti[1] = -tF + tC / 2; Ti[2] = tR - tC / 2; Ti[3] = -tR - tC / 2;
      const mode = this._coupling();
      if (mode !== 2) this.locked = false;
      if (mode === 0) {
        this.eOmega += h * Te / Ie;
        for (let i = 0; i < 4; i++) W[i].omega += h * (T[i] + Ti[i]) / W[i].inertia;
        this.lastTin = 0;
      } else if (mode === 1) {
        const we = this.eOmega, wt = wc0 * G;
        let Tp = s.tcCouple ? s.tcK * we * we * Math.min(1, (1 - wt / Math.max(we, 1)) / (1 - s.tcCouple)) : s.tcK * we * (we - wt);
        if (s.tcCouple && we < 1) Tp = s.tcK * we * (we - wt);
        if (Tp < 0) Tp *= 0.65;
        let TRr = 1;
        if (Tp > 0 && we > 1) { const SR = wt / we; TRr = SR < 0.85 ? s.tcStall - (s.tcStall - 1) * Math.max(0, SR) / 0.85 : 1; }
        this.eOmega += h * (Te - Tp) / Ie;
        const Tin = Tp * TRr * G * eff;
        for (let i = 0; i < 4; i++) W[i].omega += h * (0.25 * Tin + Ti[i] + T[i]) / W[i].inertia;
        this.lastTin = Tin;
      } else {
        const cap = this._cap, Itot = Isum + Ie * G * G;
        if (this.locked) {
          const wcDot = (G * eff * (Te - Ie * wc0 * Gdot) + Tsum) / Itot;
          const Treq = Te - Ie * G * wcDot - Ie * wc0 * Gdot;
          if (Math.abs(Treq) > cap) this.locked = false;
          else {
            for (let i = 0; i < 4; i++) W[i].omega += h * wcDot + h * (T[i] + Ti[i] - W[i].inertia * Tsum / Isum) / W[i].inertia;
            this.eOmega = (wc0 + h * wcDot) * G;
            this.lastTin = G * eff * Treq;
          }
        }
        if (!this.locked) {
          const dE = this.eOmega - wc0 * G, sg = dE > 0 ? 1 : dE < 0 ? -1 : 0;
          const Tcl = cap * sg;
          this.eOmega += h * (Te - Tcl) / Ie;
          const Tin = Tcl * G * eff;
          let wc1 = 0;
          for (let i = 0; i < 4; i++) { W[i].omega += h * (0.25 * Tin + Ti[i] + T[i]) / W[i].inertia; wc1 += W[i].inertia * W[i].omega; }
          wc1 /= Isum;
          const dE1 = this.eOmega - wc1 * G;
          if (cap > 0 && (dE1 === 0 || (dE1 > 0 ? 1 : -1) !== sg)) {
            const wcL = (Isum * wc1 + Ie * G * this.eOmega) / Itot, sh = wcL - wc1;
            for (let i = 0; i < 4; i++) W[i].omega += sh;
            this.eOmega = wcL * G;
            this.locked = true;
          }
          this.lastTin = Tin;
        }
      }
      // brakes on all four corners (+ the parking pawl, through the lockers)
      const pk = this.park ? 20000 : 0;
      if (this.locked && G !== 0) {
        let wc = 0, Tb = 0;
        for (let i = 0; i < 4; i++) { wc += W[i].inertia * W[i].omega; Tb += W[i].brakeT + pk; }
        wc /= Isum;
        const wcB = brakeClamp(wc, Tb, Isum + Ie * G * G, h);
        for (let i = 0; i < 4; i++) W[i].omega += wcB - wc;
        this.eOmega = wcB * G;
      } else for (let i = 0; i < 4; i++) W[i].omega = brakeClamp(W[i].omega, W[i].brakeT + pk, W[i].inertia, h);
      if (this.eOmega < 0) this.eOmega = 0;
      if (!this.running && !this.cranking && this.eOmega < 3 && !this.locked) this.eOmega *= 0.98;
    }

    // ------------------------------------------------------------------ body vs ground (penalty)
    _bodyGround(m00, m01, m02, m10, m11, m12, m20, m21, m22, apply) {
      const s = this.spec, g = this._g;
      // (per car, and shifted up when a tune drops the CG inside the body)
      const P = this._bodyPts || (this._bodyPts = (() => {
        const hw = s.bodyHalfW, f = s.bodyFront, r = s.bodyRear, d = s.cgDrop || 0, b = s.bodyBottom + d, t = s.bodyTop + d;
        // (bodyPts: a vehicle shaped nothing like a car lists its own - the monster truck's tyres, body shell and roof)
        if (s.bodyPts) return s.bodyPts.map((p) => [p[0], p[1] + d, p[2]]);
        return [[-hw, b, f], [hw, b, f], [-hw, b, r], [hw, b, r], [0, b, 0.2],
          [-0.72, t, -0.3], [0.72, t, -0.3], [-0.72, t, 0.9], [0.72, t, 0.9],
          [-hw, 0.35 + d, f + 0.2], [hw, 0.35 + d, f + 0.2], [-hw, 0.35 + d, r - 0.2], [hw, 0.35 + d, r - 0.2], [-hw, 0.2 + d, 0.3], [hw, 0.2 + d, 0.3]];
      })());
      const bK = s.bodyK || 240000, bC = s.bodyC || 16000;
      let nC = 0;
      // (where the body is bearing on the ground and how hard - the arena's junk cars are crushed by it too)
      const hits = this.bodyHits || (this.bodyHits = []);
      if (this._bgFrame !== this.time) { this._bgFrame = this.time; hits.length = 0; }
      for (let i = 0; i < P.length; i++) {
        const lx = P[i][0], ly = P[i][1], lz = P[i][2];
        const rx = m00 * lx + m01 * ly + m02 * lz, ry = m10 * lx + m11 * ly + m12 * lz, rz = m20 * lx + m21 * ly + m22 * lz;
        const wx_ = this.px + rx, wy_ = this.py + ry, wz_ = this.pz + rz;
        this.world.ground(wx_, wz_, g);
        const pen = (g.h - wy_) * g.ny;
        if (pen <= 0) continue;
        nC++;
        const cvx = this.vx + (this.wy * rz - this.wz * ry), cvy = this.vy + (this.wz * rx - this.wx * rz), cvz = this.vz + (this.wx * ry - this.wy * rx);
        const vn = cvx * g.nx + cvy * g.ny + cvz * g.nz;
        let Fn = bK * Math.min(pen, 0.4) - bC * vn;
        if (Fn < 0) Fn = 0;
        // friction
        let tx = cvx - g.nx * vn, ty = cvy - g.ny * vn, tz = cvz - g.nz * vn;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        let fxx = g.nx * Fn, fyy = g.ny * Fn, fzz = g.nz * Fn;
        if (tl > 1e-4) {
          const Ff = Math.min((s.bodyMu || 0.55) * Fn, tl * 20000) / tl;
          fxx -= tx * Ff; fyy -= ty * Ff; fzz -= tz * Ff;
        }
        if (Fn > 30000 && vn < -3) this.events.impact = Math.max(this.events.impact, -vn * 0.5);
        if (hits.length < 36) hits.push(wx_, wz_, Fn);
        apply(fxx, fyy, fzz, rx, ry, rz);
      }
      this.bodyContact = nC;
    }

    // ------------------------------------------------------------------ static obstacles (trees, poles, rocks, buildings)
    _applyImpulse(jx, jz, rx, ry, rz, m00, m20, m02, m22) {
      // world impulse (jx, 0, jz) at offset r from CG
      const s = this.spec;
      this.vx += jx / s.mass; this.vz += jz / s.mass;
      // torque impulse = r x j
      const Tx = ry * jz, Ty = rz * jx - rx * jz, Tz = -ry * jx;
      const m01 = 2 * (this.qx * this.qy - this.qz * this.qw), m11 = 1 - 2 * (this.qx * this.qx + this.qz * this.qz), m21 = 2 * (this.qy * this.qz + this.qx * this.qw);
      const m10 = 2 * (this.qx * this.qy + this.qz * this.qw), m12 = 2 * (this.qy * this.qz - this.qx * this.qw);
      const tlx = m00 * Tx + m10 * Ty + m20 * Tz, tly = m01 * Tx + m11 * Ty + m21 * Tz, tlz = m02 * Tx + m12 * Ty + m22 * Tz;
      const alx = tlx / s.Ipitch, aly = tly / s.Iyaw, alz = tlz / s.Iroll;
      this.wx += m00 * alx + m01 * aly + m02 * alz;
      this.wy += m10 * alx + m11 * aly + m12 * alz;
      this.wz += m20 * alx + m21 * aly + m22 * alz;
    }

    _resolveContact(nx, nz, pen, cx, cz, m00, m20, m02, m22) {
      // n points from the car towards the obstacle (horizontal). contact point (cx, cz) at bumper height
      const s = this.spec;
      const rx = cx - this.px, ry = 0.0, rz = cz - this.pz;
      const cvx = this.vx + (this.wy * rz - this.wz * ry), cvz = this.vz + (this.wx * ry - this.wy * rx);
      const vn = cvx * nx + cvz * nz;
      // positional correction
      this.px -= nx * pen * 0.9; this.pz -= nz * pen * 0.9;
      if (vn <= 0) return;
      // effective mass (yaw dominated)
      const rxn = rx * nz - rz * nx;
      const k = 1 / s.mass + rxn * rxn / s.Iyaw;
      const j = (1 + 0.15) * vn / k;
      let jx = -nx * j, jz = -nz * j;
      // friction along tangent
      const tx = -nz, tz = nx;
      const vt = cvx * tx + cvz * tz;
      const rxt = rx * tz - rz * tx;
      const kt = 1 / s.mass + rxt * rxt / s.Iyaw;
      const jt = clamp(-vt / kt, -0.45 * j, 0.45 * j);
      jx += tx * jt; jz += tz * jt;
      this._applyImpulse(jx, jz, rx, ry, rz, m00, m20, m02, m22);
      const dv = j / s.mass;
      if (dv > this.events.impact) { this.events.impact = dv; this.events.impactX = cx; this.events.impactZ = cz; }
      // big hits stall/damage nothing, but they do upset the chassis a little
      if (dv > 6) { this.wx += (Math.random() - 0.5) * 0.3; this.wz += (Math.random() - 0.5) * 0.3; }
    }

    _obstacles(m00, m20, m02, m22) {
      const s = this.spec;
      // car footprint in XZ (yaw only)
      let rX = m00, rZ = m20; let l = Math.hypot(rX, rZ) || 1; rX /= l; rZ /= l;
      const lr = l;
      let bX = m02, bZ = m22; l = Math.hypot(bX, bZ) || 1; bX /= l; bZ /= l;
      // (the footprint is the body's shadow on the ground: a car stood up on its tail or rolled on its side covers less
      // ground - taken as the full box, a truck pitched up against a wall read metres of overlap and was flung away)
      const zc = 0.5 * (s.bodyFront + s.bodyRear) * l, hl = Math.max(0.5 * (s.bodyRear - s.bodyFront) * l, 0.5 * (s.bodyTop - s.bodyBottom) * Math.sqrt(Math.max(0, 1 - l * l))), hw = Math.max(s.bodyHalfW * lr, 0.5 * (s.bodyTop - s.bodyBottom) * Math.sqrt(Math.max(0, 1 - lr * lr)));
      const cx = this.px + bX * zc, cz = this.pz + bZ * zc;
      // skip when flying high over things
      for (const c of this._circles) {
        const dx = c.x - cx, dz = c.z - cz;
        const lx = dx * rX + dz * rZ, lz = dx * bX + dz * bZ;
        const qx = clamp(lx, -hw, hw), qz = clamp(lz, -hl, hl);
        const ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= c.r * c.r) continue;
        let nlx, nlz, pen;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nlx = ex / d; nlz = ez / d; pen = c.r - d; }
        else {
          const px_ = hw - Math.abs(lx), pz_ = hl - Math.abs(lz);
          if (px_ < pz_) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px_ + c.r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = pz_ + c.r; }
        }
        const nx = nlx * rX + nlz * bX, nz = nlx * rZ + nlz * bZ;
        const wpx = cx + qx * rX + qz * bX, wpz = cz + qx * rZ + qz * bZ;
        this._resolveContact(nx, nz, pen, wpx, wpz, m00, m20, m02, m22);
      }
      for (const b of this._boxes) {
        // car corners inside building box
        let best = null;
        for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
          const wx_ = cx + rX * hw * sx + bX * hl * sz, wz_ = cz + rZ * hw * sx + bZ * hl * sz;
          const dx = wx_ - b.x, dz = wz_ - b.z;
          const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
          const px_ = b.hx - Math.abs(lx), pz_ = b.hz - Math.abs(lz);
          if (px_ > 0 && pz_ > 0) {
            let nlx, nlz, pen;
            if (px_ < pz_) { nlx = -Math.sign(lx); nlz = 0; pen = px_; } else { nlx = 0; nlz = -Math.sign(lz); pen = pz_; }
            // local box axes -> world: x axis (c, -s), z axis (s, c)
            const nx = nlx * b.c + nlz * b.s, nz = -nlx * b.s + nlz * b.c;
            if (!best || pen > best[2]) best = [nx, nz, pen, wx_, wz_];
          }
        }
        // building corners inside the car
        for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
          const lxw = b.hx * sx, lzw = b.hz * sz;
          const wx_ = b.x + lxw * b.c + lzw * b.s, wz_ = b.z - lxw * b.s + lzw * b.c;
          const dx = wx_ - cx, dz = wz_ - cz;
          const lx = dx * rX + dz * rZ, lz = dx * bX + dz * bZ;
          const px_ = hw - Math.abs(lx), pz_ = hl - Math.abs(lz);
          if (px_ > 0 && pz_ > 0) {
            let nlx, nlz, pen;
            if (px_ < pz_) { nlx = Math.sign(lx); nlz = 0; pen = px_; } else { nlx = 0; nlz = Math.sign(lz); pen = pz_; }
            const nx = nlx * rX + nlz * bX, nz = nlx * rZ + nlz * bZ;
            if (!best || pen > best[2]) best = [nx, nz, pen, wx_, wz_];
          }
        }
        if (best) this._resolveContact(best[0], best[1], Math.min(best[2], 0.5), best[3], best[4], m00, m20, m02, m22);
      }
    }
  }

  // tyre-envelope sample angles round the tread (-80 .. +80 deg from straight down along the strut, + = ahead)
  Vehicle.ENV = (() => {
    const n = 9, dth = 20 * Math.PI / 180, th = [], sin = [], cos = [];
    for (let j = 0; j < n; j++) { const t = (j - 4) * dth; th.push(t); sin.push(Math.sin(t)); cos.push(Math.cos(t)); }
    return { n, mid: 4, dth, th, sin, cos };
  })();

  // Selectable cars. Spec entries override SPEC (the Hellcat).
  const CARS = {
    hellcat: { name: 'Challenger SRT Hellcat', short: 'Hellcat', hp: 717, tq: 656, spec: {} },
    // 2023 Challenger SRT Demon 170: 6.2L HEMI with 3.0L supercharger, 1,025 hp @ 6500 / 945 lb-ft @ 4200 on E85
    // (900 hp / 810 lb-ft on E10), 4,280 lb, MT ET Street R 315/50R17 rears, 245/55R18 fronts, TransBrake 2.0,
    // Drag Mode suspension, governed to 149 mph (drag radial rating). NHRA: 8.91 s @ 151.17 mph, 0-60 1.66 s.
    demon: { name: 'Challenger SRT Demon 170', short: 'Demon 170', hp: 1025, tq: 945, spec: {
      name: 'Dodge Challenger SRT Demon 170',
      mass: 2021, frontWeight: 0.57, wheelbase: 2.952, trackF: 1.66, trackR: 1.63, wheelRadius: 0.366,
      frontTire: 'skinny', rearTire: 'etstreet',
      springF: 58000, springR: 50000, dampRebF: 3000, dampBumpR: 4800,      // Drag Mode: front rises, rear squat controlled
      brakeTorqueF: 3000, brakeTorqueR: 1700,                                 // 320 mm single-piston sliding calipers
      idleRpm: 760, limiterRpm: 6700, redlineRpm: 6500, engineInertia: 0.52,
      torqueCurve: [[0, 300], [500, 380], [1000, 480], [1500, 620], [2000, 740], [2500, 830], [3000, 890], [3500, 925],
        [4200, 945], [4800, 935], [5500, 900], [6000, 868], [6500, 828], [6700, 790], [7000, 650], [8000, 400]],
      boostMax: 21.3, autoFinal: 3.09, tcK: 0.0125, tcStall: 2.2, lockupTorque: 2400, lsdPreload: 150, lsdRamp: 0.5,
      CdA: 0.995, govSpeed: 149 / 2.23694, govGrace: 1.0, launchRpm: 2000, transbrake: true, bodyHalfW: 0.995,
      // Drag Mode: the front shocks top out early (the spring still preloaded) and the rear links carry some
      // anti-squat, so the 2 g hit lifts the front tyres off the ground for a moment - the famous Demon launch
      antiSquat: 0.6, travelDown: 0.06,
      // E85 output is famously underrated: x1.11 (~1,140 hp at the crank) with a 90%-efficient driveline reproduces
      // the NHRA-certified 8.91 s @ 151.17 mph pass. The E10 option in the game scales this by 0.865 (900 hp rating).
      torqueScale: 1.11, driveEff: 0.9,
    } },
  };
  // Mopar Dodge Challenger Drag Pak (2021+, NHRA Factory Stock Showdown): 354 cu in (5.8 L) Gen III HEMI, forged,
  // 12.5:1, 3.0 L Whipple twin-screw, Holley Dominator EFI, idle-to-10,000 rpm. NHRA factors it at 630 hp; the real
  // figure is estimated north of 1,300 hp. Race 3-speed automatic (2.10 / 1.40 / 1.00) with TransBrake and a
  // non-lockup race converter, Strange 9-inch with spool and 40-spline axles, 4-link rear, Bilstein double-adjustables,
  // Strange Pro Series II brakes (no ABS / ESC), wheelie bars, 10 ft parachute, 4130 cage certified to 7.50 s.
  // NHRA FSS minimum weight 3,575 lb with driver. Class record 7.558 s, speed record 186.10 mph; typical 7.7-7.9 s @ 175-180.
  CARS.dragpak = { name: 'Challenger Mopar Drag Pak', short: 'Drag Pak', hp: 1350, tq: 910, spec: {
    name: 'Mopar Dodge Challenger Drag Pak',
    mass: 1622, Ipitch: 3450, Iyaw: 3800, Iroll: 760, cgHeight: 0.5, frontWeight: 0.54,
    wheelbase: 2.946, trackF: 1.625, trackR: 1.6,
    wheelRadius: 0.381, wheelRadiusF: 0.349, wheelRadiusR: 0.381, wheelInertiaF: 0.8, wheelInertiaR: 2.3,
    frontTire: 'runner', rearTire: 'etdrag',
    // drag set-up: soft, free-extending front so weight goes back. The skinny front runners have little side grip, so
    // it pushes (understeers) in corners the way real drag cars do - never snaps round at speed
    springF: 36000, springR: 50000, dampBumpF: 3400, dampRebF: 3400, dampBumpR: 5200, dampRebR: 5600,
    arbF: 28000, arbR: 10000, travelUp: 0.08, travelDown: 0.07,
    antiSquat: 0.5,        // 4-link with the instant centre set for a hard hit: the nose comes up onto the wheelie bars
    brakeTorqueF: 2500, brakeTorqueR: 1500, handbrakeTorque: 2000, noABS: true, noESC: true,
    maxSteer: 0.48, steerRatio: 16, rearToe: 0.0044,
    idleRpm: 1150, limiterRpm: 9600, redlineRpm: 9300, shiftRpm: 9100, engineInertia: 0.34, fricA: 36, fricB: 27, starterTorque: 260,
    torqueCurve: [[0, 260], [1000, 360], [2000, 470], [3000, 590], [4000, 710], [5000, 815], [6000, 880], [6500, 900],
      [7000, 908], [7500, 900], [8000, 880], [8500, 840], [9000, 785], [9500, 715], [10000, 600], [11000, 300]],
    boostMax: 24,
    autoRatios: [2.10, 1.40, 1.00], autoRev: 2.08, autoFinal: 4.10,
    shiftTimeWOT: 0.13, shiftTimePart: 0.2, shiftCutDepth: 0.18,       // race valve body: quick, firm shifts
    noLockup: true, tcK: 0.0022, tcCouple: 0.9, tcStall: 1.85, driveEff: 0.92,   // flashes to ~7,000 rpm
    lsdPreload: 400, lsdRamp: 0.5,                                  // spool (approximated as a very tight diff)
    CdA: 0.95, bodyHalfW: 0.965,
    launchRpm: 4200, transbrake: true,
    wheelieBar: { len: 1.45, clr: 0.16, halfW: 0.26 }, chuteCdA: 3.6,
    // x1.12 (~1,500 hp) on the class-legal 30x9 radials reproduces a well-driven FSS pass (~7.7 s @ 176 mph).
    // Game default: x1.18 on 29.5x10.5 slicks - a little more of everything
    torqueScale: 1.18,
  } };
  // Modified pulling tractor (European "Modified 3.6 t" class): a tube-frame tractor carrying several race / aircraft
  // engines, Firestone 30.5L-32 cut pulling tyres, no suspension (the tyres are the springs), a pivoting front axle
  // (no front roll stiffness), a 3-speed planetary box behind a slider clutch, a spool, and a weight bar with skid pads
  // 1.75 m behind the rear axle that catches it when the front comes up - which, with this much power, it does.
  // Two engine packages (see engines); pick one with CARS.puller.make(key).
  CARS.puller = { name: 'Modified Pulling Tractor', short: 'Puller', more: true, spec: {
    name: 'Modified Pulling Tractor',
    mass: 3600, Ipitch: 14000, Iyaw: 15500, Iroll: 2600, cgHeight: 0.95, wheelbase: 4.8, frontWeight: 0.29,
    trackF: 1.42, trackR: 1.76, wheelRadius: 0.87, wheelRadiusF: 0.37, wheelRadiusR: 0.87, wheelInertiaF: 3.5, wheelInertiaR: 115,
    frontTire: 'tractorFront', rearTire: 'pulling', Fz0: 11000, loadSens: 0.08,
    springF: 200000, springR: 420000, dampBumpF: 11000, dampRebF: 13000, dampBumpR: 30000, dampRebR: 36000, dampKnee: 0.6, fzMax: 160000,
    arbF: 0, arbR: 150000, travelUp: 0.05, travelDown: 0.04, bumpStopK: 2000000,
    brakeTorqueF: 300, brakeTorqueR: 9000, handbrakeTorque: 9000, noABS: true, noESC: true,
    maxSteer: 0.62, steerRate: 3.2, steerRatio: 20, ackermann: 0.9, rearToe: 0,
    lsdPreload: 8000, lsdRamp: 1, driveEff: 0.9, CdA: 3.6,
    bodyHalfW: 1.05, bodyFront: -4.5, bodyRear: 2.3, bodyBottom: -0.62, bodyTop: 1.45,
    transbrake: true, wheelieBar: { len: 1.75, clr: 0.34, halfW: 0.55, r: 0.09, Fmax: 160000, k: 500000, damp: 150000 }, thrExp: 1.8,
    noCoastBlip: true, blipMax: 0.08, tcTargets: [0.15, 0.17, 0.19],
    autoRatios: [1.9, 1.38, 1.0], autoRev: 1.9, shiftTimeWOT: 0.18, shiftTimePart: 0.3, shiftCutDepth: 0.25,
    tcCouple: 0.92, tcStall: 1.0,
  } };
  CARS.puller.engines = {
    // four 500 cu in aluminium HEMIs on methanol, each with a 14-71 roots blower and an injector hat, ~2,470 hp apiece,
    // coupled one behind the other through splitter boxes. Open zoomie headers.
    hemi4: { name: '4× supercharged 500 ci HEMI', short: '4× blown HEMI', tractor: 'BLOWN AWAY', hp: 9900, tq: 7280, spec: {
      idleRpm: 1300, limiterRpm: 8600, redlineRpm: 8400, shiftRpm: 8300, engineInertia: 1.3, fricA: 120, fricB: 100, starterTorque: 1000,
      torqueCurve: [[0, 1400], [1000, 2600], [2000, 3800], [3000, 4920], [4000, 5920], [5000, 6720], [6000, 7200], [6500, 7280],
        [7000, 7160], [7500, 6880], [8000, 6480], [8500, 5920], [9000, 5200], [10000, 3600]],
      boostMax: 38, autoFinal: 17.5, tcK: 0.033, tcEngage: [1500, 3500], lockupTorque: 16000, launchRpm: 4500,
    } },
    // two 28 L Allison V-1710 WWII fighter V12s, side by side, gear-driven superchargers, ~3,200 hp apiece at under
    // 4,000 rpm: colossal torque, slow-revving crankshafts, a bottomless drone
    v12: { name: '2× supercharged Allison V-1710 V12', short: '2× Allison V12', tractor: 'WARBIRD', hp: 6400, tq: 10400, spec: {
      idleRpm: 750, limiterRpm: 4000, redlineRpm: 3800, shiftRpm: 3750, engineInertia: 7, fricA: 170, fricB: 190, starterTorque: 2400,
      torqueCurve: [[0, 3000], [500, 4400], [1000, 6200], [1500, 8000], [2000, 9400], [2500, 10200], [2800, 10400], [3200, 10100],
        [3600, 9400], [4000, 8200], [4500, 6200], [5000, 4000]],
      boostMax: 35, autoFinal: 8.15, tcK: 0.23, tcEngage: [900, 1900], lockupTorque: 22000, launchRpm: 2200,
    } },
  };
  // the tractor with one engine package, as a CARS-style entry
  CARS.puller.make = function (key) {
    const e = CARS.puller.engines[key] || CARS.puller.engines.hemi4;
    return { name: 'Modified Pulling Tractor — ' + e.name, short: e.tractor, engine: key in CARS.puller.engines ? key : 'hemi4', hp: e.hp, tq: e.tq,
      spec: Object.assign({}, CARS.puller.spec, e.spec, { name: 'Modified Pulling Tractor "' + e.tractor + '"' }) };
  };
  // Rear-engine dragsters. A 300 in (TF) / 280 in (TA) chromoly tube chassis with no suspension (the tyres and the
  // flexing frame are the springs), the driver ahead of the engine, a supercharged 500-526 ci HEMI just ahead of a
  // spooled rear end, a multi-disc slipper clutch that slips for most of the run (the tune: static pressure stepped up by
  // air timers + centrifugal counterweights), a huge rear wing on struts behind the rear axle and a nose wing to hold
  // the front down, rear brakes only, two parachutes. Pick a class with CARS.dragster.make(key).
  CARS.dragster = { name: 'Dragster', short: 'Dragster', more: true, spec: {
    name: 'Dragster', Fz0: 5000, loadSens: 0.1,
    frontTire: 'dragfront', wheelInertiaF: 0.25,
    dampBumpF: 1500, dampRebF: 1500, dampBumpR: 6000, dampRebR: 6000,
    arbF: 0, arbR: 0, travelUp: 0.04, travelDown: 0.02, bumpStopK: 1500000,
    brakeTorqueF: 0, noABS: true, noESC: true,
    maxSteer: 0.3, steerRate: 2.2, steerRatio: 10, ackermann: 0.3, rearToe: 0,
    lsdPreload: 1500, lsdRamp: 0.7, driveEff: 0.95,       // spool
    noLockup: true, launchLimiter: true, launchRpm: 4500, thrExp: 1.3, noCoastBlip: true, blipMax: 0.05, tcRefBody: true, burnoutWet: 0.3, tcCombined: true,
    fricA: 70, fricB: 50,
  } };
  CARS.dragster.classes = {
    // Top Fuel: 500 ci HEMI on 90 % nitromethane, 14-71 roots blower at ~58 psi, ~11,000 hp, two 44 A magnetos, no
    // gearbox (a reverser + 3.20 rear end), 2,330 lb with driver, 300 in wheelbase. NHRA runs them 1,000 ft:
    // ~0.82 s 60 ft, ~2.95 s @ ~295 mph at the 660, ~3.7 s @ ~330 mph at 1,000 ft (record 3.62 s / 338 mph)
    tf: { name: 'Top Fuel Dragster', short: 'Top Fuel', car: 'NITRO HELLFIRE', hp: 11000, tq: 7420, finishFt: 1000, spec: {
      mass: 1057, Ipitch: 5200, Iyaw: 5400, Iroll: 170, cgHeight: 0.44, wheelbase: 7.62, frontWeight: 0.28,
      trackF: 0.86, trackR: 1.4, wheelRadius: 0.457, wheelRadiusF: 0.286, wheelRadiusR: 0.457, wheelInertiaR: 3.6,
      rearTire: 'tfslick', springF: 70000, springR: 300000,
      brakeTorqueR: 2600, handbrakeTorque: 2600,
      idleRpm: 2000, limiterRpm: 9000, redlineRpm: 8600, engineInertia: 0.55, starterTorque: 700,
      torqueCurve: [[0, 1200], [1000, 2300], [2000, 3400], [3000, 4500], [4000, 5450], [5000, 6300], [6000, 6950], [7000, 7350],
        [7500, 7420], [8000, 7300], [8500, 7000], [9000, 6400], [10000, 4800]],
      boostMax: 58, autoRatios: [1.0], autoRev: 1.0, autoFinal: 3.2,
      dragClutch: { rpm0: 3000, rpm1: 4500, kc: 0.00874, rev: 260,
        base: [[0, 2500], [1.0, 2800], [2.0, 3300], [3.0, 4200], [4.0, 6000]] },
      launchRetard: [0.7, 2.6],
      CdA: 1.0, wings: [{ ClA: 3.2, CdA: 0.8, z: 2.48, y: 1.31 }, { ClA: 0.75, CdA: 0.1, z: -5.99, y: -0.24 }],
      chuteCdA: 2.6, chuteZ: 3.25, chuteY: 0.85,
      bodyHalfW: 0.92, bodyFront: -6.44, bodyRear: 3.48, bodyBottom: -0.37, bodyTop: 1.46,
    } },
    // Nitro Funny Car: the Top Fuel engine and clutch in a 125 in wheelbase chassis under a one-piece carbon flip-top
    // body, the engine ahead of the driver, 2,600 lb. Short and heavy with the CG well forward of the rear axle... and
    // still it stands up on the hit, so it runs wheelie bars. The body and its big rear spoiler make the downforce.
    // 1,000 ft: ~0.86 s 60 ft, ~3.05 s @ ~280 mph at the 660, ~3.87 s @ ~332 mph (record 3.79 s / 341 mph)
    fc: { name: 'Nitro Funny Car', short: 'Funny Car', car: 'HEMI HAVOC', hp: 11000, tq: 7420, finishFt: 1000, spec: {
      mass: 1179, Ipitch: 1900, Iyaw: 2100, Iroll: 380, cgHeight: 0.39, wheelbase: 3.175, frontWeight: 0.45,
      trackF: 1.28, trackR: 1.4, wheelRadius: 0.457, wheelRadiusF: 0.318, wheelRadiusR: 0.457, wheelInertiaF: 0.45, wheelInertiaR: 3.6,
      frontTire: 'fcfront', rearTire: 'tfslick', springF: 90000, springR: 300000, dampBumpF: 2500, dampRebF: 2500, dampBumpR: 6500, dampRebR: 6500,
      brakeTorqueR: 2800, handbrakeTorque: 2800, maxSteer: 0.4, steerRate: 2.6,
      idleRpm: 2000, limiterRpm: 9000, redlineRpm: 8600, engineInertia: 0.55, starterTorque: 700,
      torqueCurve: [[0, 1200], [1000, 2300], [2000, 3400], [3000, 4500], [4000, 5450], [5000, 6300], [6000, 6950], [7000, 7350],
        [7500, 7420], [8000, 7300], [8500, 7000], [9000, 6400], [10000, 4800]],
      boostMax: 58, autoRatios: [1.0], autoRev: 1.0, autoFinal: 3.2,
      dragClutch: { rpm0: 3000, rpm1: 4500, kc: 0.00874, rev: 260,
        base: [[0, 2500], [1.0, 2800], [2.0, 3300], [3.0, 4200], [4.0, 6000]] },
      launchRetard: [0.66, 2.8],
      // (the low nose and splitter make real downforce: without it the front never comes back down at 4 g)
      CdA: 1.25, wings: [{ ClA: 2.6, CdA: 0.6, z: 1.93, y: 0.96 }, { ClA: 1.3, CdA: 0.05, z: -2.75, y: -0.19 }],
      wheelieBar: { len: 1.55, clr: 0.1, halfW: 0.28, r: 0.06, k: 400000, damp: 20000, Fmax: 40000 },
      chuteCdA: 2.6, chuteZ: 2.18, chuteY: 0.4,
      bodyHalfW: 0.98, bodyFront: -3.1, bodyRear: 2.05, bodyBottom: -0.29, bodyTop: 0.89,
    } },
    // Top Alcohol: 526 ci HEMI on methanol with a roots blower, ~3,900 hp, 2-speed planetary box behind a 5-disc clutch,
    // 2,050 lb, 280 in wheelbase, runs the full 1/4 mile: ~0.95 s 60 ft, ~5.2 s @ ~275 mph
    tad: { name: 'Top Alcohol Dragster', short: 'Top Alcohol', car: 'ALKY ROCKET', hp: 3900, tq: 2480, finishFt: 1320, spec: {
      mass: 930, Ipitch: 4000, Iyaw: 4200, Iroll: 150, cgHeight: 0.43, wheelbase: 7.11, frontWeight: 0.29,
      trackF: 0.84, trackR: 1.36, wheelRadius: 0.438, wheelRadiusF: 0.286, wheelRadiusR: 0.438, wheelInertiaR: 3.2,
      rearTire: 'tadslick', springF: 64000, springR: 270000,
      brakeTorqueR: 2300, handbrakeTorque: 2300,
      idleRpm: 1600, limiterRpm: 9900, redlineRpm: 9600, shiftRpm: 9400, engineInertia: 0.4, starterTorque: 500, fricA: 45, fricB: 32,
      torqueCurve: [[0, 500], [1000, 850], [2000, 1200], [3000, 1550], [4000, 1860], [5000, 2120], [6000, 2320], [7000, 2450],
        [7500, 2480], [8000, 2460], [8500, 2400], [9000, 2300], [9500, 2170], [10000, 2000], [11000, 1500]],
      boostMax: 42, autoRatios: [1.65, 1.0], autoRev: 1.65, autoFinal: 3.7, shiftTimeWOT: 0.08, shiftTimePart: 0.15, shiftCutDepth: 0.3,
      launchRpm: 5500,
      dragClutch: { rpm0: 3200, rpm1: 4800, kc: 0.0032, rev: 150,
        base: [[0, 900], [0.6, 1050], [1.2, 1400], [2.0, 2000], [3.0, 3000], [4.0, 4000]] },
      launchRetard: [0.7, 2.4],
      CdA: 0.85, wings: [{ ClA: 2.4, CdA: 0.55, z: 2.55, y: 1.15 }, { ClA: 0.42, CdA: 0.08, z: -5.55, y: -0.24 }],
      chuteCdA: 2.2, chuteZ: 3.05, chuteY: 0.8,
      bodyHalfW: 0.9, bodyFront: -6.0, bodyRear: 3.3, bodyBottom: -0.36, bodyTop: 1.3,
    } },
  };
  CARS.dragster.make = function (key) {
    const k = key in CARS.dragster.classes ? key : 'tf', c = CARS.dragster.classes[k];
    return { name: c.name, short: c.short, cls: k, car: c.car, hp: c.hp, tq: c.tq, finishFt: c.finishFt,
      spec: Object.assign({}, CARS.dragster.spec, c.spec, { name: c.name + ' "' + c.car + '"' }) };
  };
  // Monster truck, built to the stadium freestyle spec: 12,000 lb minimum, 12 ft tall and 12.5 ft wide, a chromoly tube
  // chassis under a fiberglass body, the driver strapped in the middle of it. A supercharged 540 ci methanol big-block
  // (~1,500 hp) sits behind the driver, into a 2-speed race automatic, a locked transfer case and planetary axles with
  // lockers - all four wheels always driven. 4-link suspension on nitrogen coil-overs and bypass shocks, ~30 in of
  // travel. Four-wheel steering: the fronts on the wheel, the rears on a thumb switch. 66 in BKT tyres, ~70 mph flat out.
  // No traction control, no ABS. Physics extras: all-wheel drive (_driveline4), tyre envelope contacts, progressive
  // shocks, wheel-spin gyro (throttle / brake steer it in the air), its own body contact points.
  // (body contact points: the tyres' sidewalls and tops, the body shell's edges, the cab roof, the chassis rails and the
  // blower - given as heights above the ground and lengths from the wheelbase centre, converted to the CG frame)
  const cgM = 1.26, fwM = 0.44, wbM = 3.45, zcM = wbM * (fwM - 0.5);   // CG height, front weight, wheelbase, CG z offset
  const P = (x, y, z) => [x, y - cgM, z + zcM];
  const mBody = [];
  for (const z0 of [-wbM / 2, wbM / 2]) for (const sx of [-1, 1]) mBody.push(P(sx * 1.88, 1.54, z0), P(sx * 1.88, 0.84, z0 - 0.72), P(sx * 1.88, 0.84, z0 + 0.72), P(sx * 1.36, 1.68, z0));
  for (const sx of [-1, 1]) {
    mBody.push(P(sx * 1.78, 1.6, -2.75), P(sx * 1.78, 1.6, 2.6), P(sx * 1.7, 2.48, -2.65), P(sx * 1.7, 2.48, 2.5),
      P(sx * 1.0, 3.5, -0.4), P(sx * 1.0, 3.5, 0.95), P(sx * 0.5, 0.9, -1.2), P(sx * 0.5, 0.9, 1.3));
  }
  mBody.push(P(0, 0.9, 0), P(0, 3.2, 1.75));
  CARS.monster = { name: 'Monster Truck', short: 'Monster Truck', more: true, hp: 1500, tq: 1300, car: 'WRECKONING', spec: {
    name: 'Monster Truck "WRECKONING"',
    mass: 5450, Ipitch: 10700, Iyaw: 10500, Iroll: 5900, cgHeight: cgM, wheelbase: wbM, frontWeight: fwM,
    trackF: 2.71, trackR: 2.71, wheelRadius: 0.838, wheelInertiaF: 160, wheelInertiaR: 160,
    frontTire: 'monster', rearTire: 'monster', Fz0: 13400, loadSens: 0.07,
    // 4-link on nitrogen shocks: soft, long travel (18 in bump / 12 in droop from ride height), the gas springs and
    // bypass tubes stiffen the last part of the stroke hard
    springF: 52000, springR: 66000, dampBumpF: 15000, dampRebF: 21000, dampBumpR: 17000, dampRebR: 24000, dampKnee: 0.5,
    arbF: 12000, arbR: 10000, travelUp: 0.45, travelDown: 0.3, suspS0: 0.6, bumpStopK: 3000000, fzMax: 600000,
    suspProg: { x0: 0.55, k: 6, damp: 2.5 },
    brakeTorqueF: 9000, brakeTorqueR: 9000, handbrakeTorque: 9000, noABS: true, noESC: true,
    maxSteer: 0.58, steerRate: 1.6, steerRatio: 12, ackermann: 0.5, rearToe: 0, rearSteerMax: 0.55,
    // supercharged 540 ci methanol big-block: ~1,500 hp @ 7,000, 1,300 lb-ft @ 5,000, roots blower at ~28 psi
    idleRpm: 1100, limiterRpm: 7400, redlineRpm: 7200, shiftRpm: 7000, engineInertia: 0.55, fricA: 60, fricB: 45, starterTorque: 450,
    torqueCurve: [[0, 480], [1000, 700], [2000, 900], [3000, 1080], [4000, 1230], [5000, 1300], [5500, 1292], [6000, 1258],
      [6500, 1210], [7000, 1130], [7500, 1010], [8000, 860], [9000, 500]],
    boostMax: 28,
    // 2-speed race automatic (1.76 / 1.00) behind a ~4,000 rpm race converter; transfer case + planetaries ~19.5:1
    autoRatios: [1.76, 1.0], autoRev: 1.76, autoFinal: 19.5, shiftTimeWOT: 0.15, shiftTimePart: 0.25, shiftCutDepth: 0.2,
    noLockup: true, tcK: 0.0095, tcCouple: 0.88, tcStall: 2.0, driveEff: 0.82,
    awd: true, lsdPreload: 9000, lsdPreloadF: 9000, centerPreload: 16000, lsdRamp: 0.15,
    launchRpm: 3500, transbrake: true, noCoastBlip: true, blipMax: 0.2, tcRefBody: true,
    CdA: 7.0,
    bodyHalfW: 1.9, bodyFront: -2.75 + zcM, bodyRear: 2.6 + zcM, bodyBottom: 0.9 - cgM, bodyTop: 3.5 - cgM, bodyPts: mBody,
    bodyK: 900000, bodyC: 60000, bodyMu: 0.6,
    tyreEnvelope: true, wheelGyro: true,
  } };
  // Karts. No suspension (the chassis flexes and the tyres are the springs), a solid rear axle (the inside rear tyre lifts
  // in a corner, so it's modelled as a loose coupling rather than a spool), direct steering, the driver sitting upright
  // on the floor tray. The engine sits beside the seat and drives the axle by chain. Pick a class with
  // CARS.kart.make(key): a 4-stroke rental kart, a 125 cc TaG kart (centrifugal clutch, direct drive) or a KZ shifter.
  const kartPts = (cg, fw) => {
    const P = (x, y, z) => [x, y - cg, z + 1.05 * (fw - 0.5)];
    return [P(-0.45, 0.12, -0.98), P(0.45, 0.12, -0.98), P(-0.68, 0.1, 0.82), P(0.68, 0.1, 0.82), P(-0.7, 0.1, 0), P(0.7, 0.1, 0),
      P(-0.6, 0.12, -0.55), P(0.6, 0.12, -0.55), P(0, 0.03, -0.3), P(0, 0.03, 0.4), P(0, 0.98, 0.1), P(-0.2, 0.75, 0.15), P(0.2, 0.75, 0.15)];
  };
  CARS.kart = { name: 'Kart', short: 'Kart', more: true, spec: {
    name: 'Kart', Fz0: 650, loadSens: 0.12,
    springF: 55000, springR: 65000, dampBumpF: 650, dampRebF: 650, dampBumpR: 850, dampRebR: 850, dampKnee: 0.3,
    arbF: 0, arbR: 0, travelUp: 0.02, travelDown: 0.015, suspS0: 0.05, bumpStopK: 400000, fzMax: 20000,
    noABS: true, noESC: true, maxSteer: 0.42, steerRate: 4.5, steerRatio: 5.5, ackermann: 0.7, rearToe: 0,
    // (the axle coupling stays gentle: with wheels this light a stiff one chatters at 1 kHz and scrubs the fronts away)
    lsdPreload: 8, lsdRamp: 0.02, driveEff: 0.95, noLockup: true, noCoastBlip: true, blipMax: 0.2, boostMax: 0,
    handbrakeTorque: 150, bodyHalfW: 0.7, bodyFront: -1.02, bodyRear: 0.84, bodyBottom: -0.27, bodyTop: 0.66,
    bodyK: 60000, bodyC: 3000, bodyMu: 0.5,
  } };
  CARS.kart.classes = {
    // rental: a Honda-type 390 cc 4-stroke single (~13 hp, governed to ~4,000 rpm), centrifugal clutch, one gear, a
    // heavy steel frame inside a full wraparound bumper, hard tyres, one rear disc. ~30-35 mph
    rental: { name: 'Rental Kart', short: 'Rental', car: 'RENTAL 42', hp: 13, tq: 20, spec: {
      mass: 235, Ipitch: 40, Iyaw: 52, Iroll: 16, cgHeight: 0.33, wheelbase: 1.07, frontWeight: 0.42,
      trackF: 1.12, trackR: 1.3, wheelRadius: 0.14, wheelRadiusF: 0.127, wheelRadiusR: 0.14, wheelInertiaF: 0.025, wheelInertiaR: 0.07,
      frontTire: 'kartRentF', rearTire: 'kartRentR', brakeTorqueF: 0, brakeTorqueR: 170,
      idleRpm: 1500, limiterRpm: 4000, redlineRpm: 3800, engineInertia: 0.03, fricA: 1.2, fricB: 0.8, starterTorque: 8,
      torqueCurve: [[0, 12], [1000, 16], [1500, 17.5], [2000, 18.8], [2500, 19.5], [3000, 19.3], [3500, 18.5], [3800, 17.8], [4000, 16], [4500, 10]],
      autoRatios: [1.0], autoRev: 1.0, autoFinal: 4.0, launchRpm: 2600,
      dragClutch: { rpm0: 1900, rpm1: 2800, kc: 0.0005, rev: 20, base: [[0, 25]] },
      CdA: 0.55, bodyPts: kartPts(0.33, 0.42),
    } },
    // TaG 125 (IAME X30-type): a water-cooled 125 cc 2-stroke single, ~30 hp at ~14,000, 16,000 rpm limiter, touch-and-go
    // electric start, centrifugal clutch straight to the axle sprocket, rear brakes only, 158 kg with the driver. ~75 mph
    tag: { name: 'TaG 125 Kart', short: 'TaG 125', car: 'X30', hp: 30, tq: 12.4, spec: {
      mass: 158, Ipitch: 28, Iyaw: 36, Iroll: 12, cgHeight: 0.3, wheelbase: 1.04, frontWeight: 0.42,
      trackF: 1.12, trackR: 1.38, wheelRadius: 0.14, wheelRadiusF: 0.127, wheelRadiusR: 0.14, wheelInertiaF: 0.02, wheelInertiaR: 0.05,
      frontTire: 'kartF', rearTire: 'kartR', brakeTorqueF: 0, brakeTorqueR: 180,
      idleRpm: 2800, limiterRpm: 16000, redlineRpm: 15500, engineInertia: 0.006, fricA: 0.8, fricB: 0.25, starterTorque: 4,
      torqueCurve: [[0, 2], [4000, 5], [6000, 7.5], [8000, 9.8], [10000, 11.6], [11500, 12.4], [13000, 12.0], [14000, 11.3], [15000, 10.2],
        [15750, 9.3], [16500, 7.5], [17500, 4]],
      autoRatios: [1.0], autoRev: 1.0, autoFinal: 7.0, launchRpm: 8000,
      // (the centrifugal clutch bites around 8,000: it slips on the launch with the engine up in its powerband)
      dragClutch: { rpm0: 6500, rpm1: 9500, kc: 0.000012, rev: 6, base: [[0, 6]] },
      CdA: 0.42, bodyPts: kartPts(0.3, 0.42),
    } },
    // KZ2 shifter: a 125 cc 2-stroke single with a 6-speed sequential box, ~48 hp at 13,500, brakes on all four wheels,
    // 175 kg with the driver. Clutchless upshifts in ~40 ms. 0-60 in ~3 s, ~90+ mph
    kz: { name: 'KZ2 Shifter Kart', short: 'KZ Shifter', car: 'KZ 125', hp: 48, tq: 20, spec: {
      mass: 175, Ipitch: 30, Iyaw: 38, Iroll: 13, cgHeight: 0.3, wheelbase: 1.05, frontWeight: 0.42,
      trackF: 1.14, trackR: 1.4, wheelRadius: 0.14, wheelRadiusF: 0.127, wheelRadiusR: 0.14, wheelInertiaF: 0.022, wheelInertiaR: 0.05,
      frontTire: 'kartF', rearTire: 'kartR', brakeTorqueF: 110, brakeTorqueR: 170,
      idleRpm: 2800, limiterRpm: 14500, redlineRpm: 14200, shiftRpm: 13900, engineInertia: 0.007, fricA: 1.0, fricB: 0.3, starterTorque: 4,
      torqueCurve: [[0, 3], [4000, 7], [6000, 10.5], [8000, 14], [10000, 17.5], [11500, 19.6], [12500, 20.0], [13500, 18.8], [14200, 17.2],
        [15000, 14], [16000, 9]],
      autoRatios: [2.0, 1.56, 1.29, 1.11, 1.0, 0.92], autoRev: 2.0, autoFinal: 5.3, shiftTimeWOT: 0.04, shiftTimePart: 0.08, shiftCutDepth: 0.45,
      launchRpm: 9000,
      dragClutch: { rpm0: 6000, rpm1: 9000, kc: 0.00003, rev: 10, base: [[0, 14]] },
      CdA: 0.45, bodyPts: kartPts(0.3, 0.42),
    } },
  };
  CARS.kart.make = function (key) {
    const k = key in CARS.kart.classes ? key : 'tag', c = CARS.kart.classes[k];
    return { name: c.name, short: c.short, cls: k, car: c.car, hp: c.hp, tq: c.tq,
      spec: Object.assign({}, CARS.kart.spec, c.spec, { name: c.name + ' "' + c.car + '"' }) };
  };
  // Fun-tab tuning: rebuild spec s from the stock spec b and the tune t (shared by the game and the tests)
  function tuneSpec(s, b, t) {
    const pr = (1 + t.boost / 14.7) / (1 + b.boostMax / 14.7);          // supercharger pressure ratio vs stock
    s.torqueScale = (b.torqueScale || 1) * t.power * pr;
    s.boostMax = t.boost; s.rpmStretch = t.stretch;
    s.limiterRpm = t.limiter; s.redlineRpm = t.limiter - (b.limiterRpm - b.redlineRpm);
    s.noLimiter = !!t.nolimit;          // (the slider value still sets the redline and the automatic's shift points)

    if (b.shiftRpm) s.shiftRpm = t.limiter - (b.limiterRpm - b.shiftRpm);
    s.idleRpm = t.idle; s.engineInertia = b.engineInertia * t.inertia;
    s.nosHp = t.nos; s.popScale = t.pops;
    s.autoFinal = t.finalAuto; s.manualFinal = t.finalManual;
    s.shiftTimeWOT = t.shiftTime; s.shiftTimePart = t.shiftTime * 1.55;
    s.launchRpm = t.launch;
    s.govSpeed = t.gov ? b.govSpeed : undefined;
    // weight: springs / bars / dampers follow it so the ride height and feel stay sane; stiffness on top
    const mr = t.mass / b.mass, dk = mr * Math.sqrt(t.stiff);
    s.mass = t.mass;
    s.springF = b.springF * t.stiff * mr; s.springR = b.springR * t.stiff * mr;
    s.arbF = b.arbF * t.stiff * mr; s.arbR = b.arbR * t.stiff * mr;
    s.dampBumpF = b.dampBumpF * dk; s.dampRebF = b.dampRebF * dk; s.dampBumpR = b.dampBumpR * dk; s.dampRebR = b.dampRebR * dk;
    s.gripScale = t.grip; s.ClA = t.downforce * 4.448 / (0.5 * 1.225 * 67.06 * 67.06);   // lb of downforce at 150 mph
    s.CdA = b.CdA * t.drag;
    s.brakeTorqueF = b.brakeTorqueF * t.brakes; s.brakeTorqueR = b.brakeTorqueR * t.brakes; s.handbrakeTorque = b.handbrakeTorque * t.brakes;
    s.maxSteer = b.maxSteer * t.steer;
    s.gravScale = t.gravity;
    // grip beyond what the stock stance can carry: a car built for that grip sits lower, so the CG drops inside the body
    // (it looks the same) to keep the tip-over threshold (half-track / CG height) ~30 % above the cornering force -
    // a tuned car slides or spins at the limit instead of barrel-rolling in every hard turn
    // (relative to stock: a tall vehicle - the tractor - isn't lowered just for having a tune applied)
    const trk = (b.trackF + b.trackR) / 2, hMax = trk / (2 * 1.3 * Math.max(1, t.grip));
    s.cgDrop = Math.max(0, b.cgHeight - hMax) - Math.max(0, b.cgHeight - trk / 2.6);
    // matched driveline: a builder picks a converter / lockup / clutch for the power. Scale the converter's capacity
    // with the torque (and the powerband's rpm), and the clutches with peak torque incl. nitrous, so the engine
    // keeps tracking road speed instead of flaring onto the limiter and droning at one pitch in every gear
    let peakHp = 0;
    for (let r = 1000; r <= b.limiterRpm; r += 100) peakHp = Math.max(peakHp, curveAt(b.torqueCurve, r) * (b.torqueScale || 1) * r / 5252);
    const tr = s.torqueScale / (b.torqueScale || 1), cap = tr * (1 + (t.nos || 0) / Math.max(1, peakHp));
    s.tcK = b.tcK * tr / (t.stretch * t.stretch);
    // a dragster's clutch is re-set for the power (and the powerband) the same way
    if (b.dragClutch) {
      const c = b.dragClutch, st = t.stretch;
      s.dragClutch = Object.assign({}, c, { base: c.base.map(([x, y]) => [x, y * tr]), kc: c.kc * tr / (st * st), rpm0: c.rpm0 * st, rpm1: c.rpm1 * st });
    }
    s.dragScale = t.drag;
    s.lockupTorque = b.lockupTorque * Math.max(1, cap);
    s.clutchTorque = b.clutchTorque * Math.max(1, cap);
    s.lsdPreload = b.lsdPreload * Math.max(1, Math.sqrt(tr));
    return s;
  }
  const API = { Vehicle, SPEC, TIRES, CARS, MF, curveAt, RAD2RPM, RPM2RAD, LBFT, tuneSpec, windage };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.HCVehicle = API;
})(typeof self !== 'undefined' ? self : this);
