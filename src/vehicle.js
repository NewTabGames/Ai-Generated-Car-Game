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
  // (looseKx / looseKy: per-surface factors on that, forwards / sideways - what a tread is built for: a gravel tyre's
  // small tight blocks bite best in gravel, a mud tyre's big open lugs in grass, dirt and mud)
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

    // ---- off-road packages for the More Cars (see OFFROAD_PKG). finalK: the package's matching final drive (a bigger
    // sprocket / ring gear) so a taller tyre doesn't just gear the vehicle up
    // Tractor: Firestone R-2 30.5L-32 "cane & rice" deep-lug tyres, uncut - lugs twice as deep as a farm R-1 and never
    // sharpened. Off the pavement they out-dig the cut pullers everywhere - they paddle through mud, dig into turf and
    // bite deeper into loose dirt (the pullers' sharpened bars only really win on a pull track's prepped strip); on
    // pavement the tall lugs squirm and thump. ~2 in taller, ~130 lb heavier. (They used to bite less than the stock
    // tyres on dirt and barely more on grass - "the off-road package is worse than the regular wheels")
    pullingR2: { name: 'Firestone R-2 30.5L-32 deep-lug', short: 'R-2 deep lugs', width: 0.78, radius: 0.915,
      muX: 0.95, muY: 0.8, loose: 3.2, looseY: 1.75, kappaPeak: 0.25, alphaPeak: 0.12, relaxX: 0.65, relaxY: 0.6,
      // (asphalt gravel grass dirt water/mud strip)
      looseKx: [1, 1.1, 1.75, 1.15, 2.2, 1], tcTargets: [0.26, 0.32, 0.4],
      B: 1.3, C: 1.35, E: -0.2, heatCap: 20000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.4,
      crr: [2.8, 1.3, 1.0, 1.1, 0.9, 2.8], massAdd: 60, inertiaAdd: 30, finalK: 0.915 / 0.87 },
    // ... and lugged fronts (R-1 bar tread instead of the smooth ribs) so it steers in the soft stuff. Still less side
    // grip than the rears, so it understeers rather than swapping ends
    tractorFrontLug: { name: '11L-15 lugged fronts', short: 'Lug fronts', width: 0.28, radius: 0.385,
      muX: 0.85, muY: 0.68, loose: 1.4, kappaPeak: 0.14, alphaPeak: 0.17, relaxX: 0.27, relaxY: 0.52,
      B: 1.6, C: 1.38, E: -0.2, heatCap: 5000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.02,
      crr: [1.6, 1.1, 1.0, 1.0, 1.0, 1.6], massAdd: 8, inertiaAdd: 0.6 },
    // Dragsters, sand-drag package: Skat-Trak-type paddle tyres - a smooth carcass with ~1.5 in rubber paddles across the
    // tread - and ribbed sand fronts. The paddles scoop the ground: enormous bite in sand, dirt and mud, next to none on
    // pavement or a prepped strip (they skate on their tips), and little side grip anywhere. No heat to speak of.
    // (they shovel the ground rather than grip it: the quickest sand pass is 2.16 s @ 156 mph in 300 ft, ~4 g)
    paddleTF: { name: 'Skat-Trak 36x17.5-16 paddle tyres', short: 'Paddles', width: 0.445, radius: 0.487,
      muX: 0.75, muY: 0.55, loose: 4.6, looseY: 1.4, looseKx: [1, 1.0, 0.85, 1.15, 1.0, 1], kappaPeak: 0.3, alphaPeak: 0.15, relaxX: 0.35, relaxY: 0.5,
      B: 1.5, C: 1.4, E: -0.2, heatCap: 30000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.0,
      crr: [1.6, 1.3, 1.2, 1.1, 1.0, 1.6], massAdd: 10, inertiaAdd: 0.5, finalK: 0.487 / 0.457 },
    paddleTA: { name: 'Skat-Trak 34.5x17-16 paddle tyres', short: 'Paddles', width: 0.43, radius: 0.468,
      muX: 0.75, muY: 0.55, loose: 4.6, looseY: 1.4, looseKx: [1, 1.0, 0.85, 1.15, 1.0, 1], kappaPeak: 0.3, alphaPeak: 0.15, relaxX: 0.35, relaxY: 0.5,
      B: 1.5, C: 1.4, E: -0.2, heatCap: 30000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.0,
      crr: [1.6, 1.3, 1.2, 1.1, 1.0, 1.6], massAdd: 9, inertiaAdd: 0.45, finalK: 0.468 / 0.438 },
    sandRib: { name: 'Ribbed sand fronts 24x6-12', short: 'Rib fronts', width: 0.15, radius: 0.3,
      muX: 0.95, muY: 0.9, loose: 1.3, kappaPeak: 0.1, alphaPeak: 0.11, relaxX: 0.16, relaxY: 0.34,
      B: 1.6, C: 1.38, E: -0.3, heatCap: 1500, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.002, prep: 1.0,
      crr: [0.8, 1, 1, 1, 1, 0.8], massAdd: 3, inertiaAdd: 0.08 },
    sandRibFC: { name: 'Ribbed sand fronts 26x7-15', short: 'Rib fronts', width: 0.17, radius: 0.33,
      muX: 1.0, muY: 0.85, loose: 1.3, kappaPeak: 0.1, alphaPeak: 0.11, relaxX: 0.16, relaxY: 0.34,
      B: 1.6, C: 1.38, E: -0.3, heatCap: 1500, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.002, prep: 1.0,
      crr: [0.8, 1, 1, 1, 1, 0.8], massAdd: 3, inertiaAdd: 0.1 },
    // Monster truck: the BKTs left full-depth (as moulded) instead of shaved and hand-cut for a stadium floor: ~1 in
    // more lug and ~100 lb more rubber each. More bite in mud, turf and loose dirt, about the same on the arena's
    // packed clay, less on pavement (the tall lugs squirm), and heavier to spin up
    monsterMud: { name: 'BKT 66x43.00-25 full-depth', short: 'Full-depth lugs', width: 1.09, radius: 0.858,
      muX: 0.92, muY: 0.8, loose: 2.0, looseY: 1.45, looseKx: [1, 1.08, 1.25, 1.06, 1.35, 1], kappaPeak: 0.24, alphaPeak: 0.21, relaxX: 0.6, relaxY: 0.9,
      B: 1.65, C: 1.45, E: -0.25, heatCap: 30000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.05,
      crr: [1.8, 1.25, 1.1, 1.1, 1.0, 1.8], massAdd: 45, inertiaAdd: 30, finalK: 0.858 / 0.838 },
    // Karts: knobby tyres on 6 in rims (12x5.00-6 front, 13x6.50-6 rear) with a bigger rear sprocket to match. About an
    // inch more ground clearance and more than twice the bite on dirt and grass - and a lot less grip on pavement,
    // where the knobs squirm and it slides like a rental on ice
    kartKnobF: { name: 'Knobby 12x5.00-6', short: 'Knobbies', width: 0.127, radius: 0.152,
      muX: 1.05, muY: 1.0, loose: 1.35, looseKx: [1, 1.05, 1.1, 1.15, 0.85, 1], kappaPeak: 0.12, alphaPeak: 0.13, relaxX: 0.09, relaxY: 0.13,
      B: 1.8, C: 1.3, E: -0.1, heatCap: 900, cold: 0.97, coldT: 10, warmT: 30, hotT: 110, overheat: 0.003, prep: 1.02,
      crr: [1.3, 1.2, 1.2, 1.1, 1, 1.3], massAdd: 1.5, inertiaAdd: 0.015 },
    kartKnobR: { name: 'Knobby 13x6.50-6', short: 'Knobbies', width: 0.165, radius: 0.165,
      muX: 1.02, muY: 0.98, loose: 1.35, looseKx: [1, 1.05, 1.1, 1.15, 0.85, 1], kappaPeak: 0.12, alphaPeak: 0.13, relaxX: 0.1, relaxY: 0.14,
      B: 1.8, C: 1.3, E: -0.1, heatCap: 1100, cold: 0.97, coldT: 10, warmT: 30, hotT: 110, overheat: 0.003, prep: 1.02,
      crr: [1.3, 1.2, 1.2, 1.1, 1, 1.3], massAdd: 2, inertiaAdd: 0.03, finalK: 0.165 / 0.14 },
    // Racing lawn mowers (no radius: each mower's own wheel sizes). B-Prepared: lawnmower turf tyres - the rules ban slicks
    // and kart tyres - a shallow rounded tread made not to tear up a lawn, run soft (~10 psi). Modest grip anywhere, at
    // home on grass. (The narrow fronts let go before the 10 in wide rears: equal grip both ends spun it in every corner)
    mowerTurfF: { name: 'Turf Saver 15x6.00-6', short: 'Turf tyres', width: 0.152,
      muX: 0.8, muY: 0.72, loose: 0.97, looseKx: [1, 1.0, 1.12, 1.0, 0.8, 1], kappaPeak: 0.12, alphaPeak: 0.14, relaxX: 0.12, relaxY: 0.2,
      B: 1.6, C: 1.38, E: -0.2, heatCap: 1500, cold: 0.97, coldT: 10, warmT: 30, hotT: 120, overheat: 0.002, prep: 1.02,
      crr: [1.3, 1.2, 1.1, 1.1, 1, 1.3] },
    mowerTurfR: { name: 'Turf Saver 20x10.00-8', short: 'Turf tyres', width: 0.254,
      muX: 0.9, muY: 0.86, loose: 1.12, looseKx: [1, 1.0, 1.12, 1.0, 0.8, 1], kappaPeak: 0.12, alphaPeak: 0.14, relaxX: 0.14, relaxY: 0.22,
      B: 1.6, C: 1.38, E: -0.2, heatCap: 2400, cold: 0.97, coldT: 10, warmT: 30, hotT: 120, overheat: 0.002, prep: 1.02,
      crr: [1.3, 1.2, 1.1, 1.1, 1, 1.3] },
    // Factory Experimental: go-kart dirt-oval tyres (allowed in FX) - a soft treaded compound that bites hard on clay and
    // grass; on smooth asphalt the tread blocks squirm
    mowerDirtF: { name: 'Kart dirt tyre 11x4.50-5', short: 'Kart dirt tyres', width: 0.115,
      muX: 0.98, muY: 0.94, loose: 1.36, looseKx: [1, 1.0, 1.0, 1.12, 0.8, 1], kappaPeak: 0.1, alphaPeak: 0.12, relaxX: 0.08, relaxY: 0.12,
      B: 1.7, C: 1.4, E: -0.2, heatCap: 500, cold: 0.9, coldT: 15, warmT: 40, hotT: 90, overheat: 0.004, prep: 1.05,
      crr: [1.1, 1.3, 1.3, 1.2, 1, 1.1] },
    mowerDirtR: { name: 'Kart dirt tyre 13x7.00-6', short: 'Kart dirt tyres', width: 0.178,
      muX: 1.0, muY: 0.94, loose: 1.36, looseKx: [1, 1.0, 1.0, 1.12, 0.8, 1], kappaPeak: 0.1, alphaPeak: 0.12, relaxX: 0.09, relaxY: 0.13,
      B: 1.7, C: 1.4, E: -0.2, heatCap: 700, cold: 0.9, coldT: 15, warmT: 40, hotT: 90, overheat: 0.004, prep: 1.05,
      crr: [1.1, 1.3, 1.3, 1.2, 1, 1.1] },
    // the land-speed mower: Formula-Student-type 18x7.5-10 racing slicks on 10 in wheels. Sticky on pavement once warm,
    // hopeless on grass
    mowerSlickF: { name: 'Racing slick 18x7.5-10', short: 'Racing slicks', width: 0.19,
      muX: 1.12, muY: 1.1, loose: 0.55, kappaPeak: 0.1, alphaPeak: 0.11, relaxX: 0.12, relaxY: 0.2,
      B: 1.8, C: 1.45, E: -0.25, heatCap: 900, cold: 0.86, coldT: 20, warmT: 50, hotT: 100, overheat: 0.004, prep: 1.1,
      crr: [0.9, 1.4, 1.5, 1.4, 1, 0.9] },
    mowerSlickR: { name: 'Racing slick 18x7.5-10', short: 'Racing slicks', width: 0.19,
      muX: 1.12, muY: 1.08, loose: 0.55, kappaPeak: 0.1, alphaPeak: 0.11, relaxX: 0.12, relaxY: 0.2,
      B: 1.8, C: 1.45, E: -0.25, heatCap: 900, cold: 0.86, coldT: 20, warmT: 50, hotT: 100, overheat: 0.004, prep: 1.1,
      crr: [0.9, 1.4, 1.5, 1.4, 1, 0.9] },
    // mowers' off-road package: ag bar-lug tyres (the chevron tread of a garden tractor that pulls a plough). They dig into
    // dirt and mud; on grass about the same as turf tyres (the bars tear it up), on pavement they squirm
    mowerBarF: { name: 'Bar-lug 16x6.50-8', short: 'Bar lugs', width: 0.165,
      muX: 0.78, muY: 0.68, loose: 1.3, looseKx: [1, 1.08, 0.85, 1.18, 1.45, 1], kappaPeak: 0.16, alphaPeak: 0.15, relaxX: 0.14, relaxY: 0.22,
      B: 1.5, C: 1.35, E: -0.15, heatCap: 2000, cold: 1, coldT: 0, warmT: 1, hotT: 150, overheat: 0.001, prep: 1.0,
      crr: [1.6, 1.3, 1.2, 1.1, 1, 1.6], massAdd: 1.5, inertiaAdd: 0.02 },
    mowerBarR: { name: 'Bar-lug 23x10.50-12', short: 'Bar lugs', width: 0.26,
      muX: 0.8, muY: 0.74, loose: 1.45, looseKx: [1, 1.08, 0.85, 1.18, 1.45, 1], kappaPeak: 0.16, alphaPeak: 0.15, relaxX: 0.16, relaxY: 0.24,
      B: 1.5, C: 1.35, E: -0.15, heatCap: 3000, cold: 1, coldT: 0, warmT: 1, hotT: 150, overheat: 0.001, prep: 1.0,
      crr: [1.6, 1.3, 1.2, 1.1, 1, 1.6], massAdd: 3, inertiaAdd: 0.06 },

    // ---- the Car Crushers 2 cars (no radius: each car's own wheel size)
    // Couch Car: 13 in R-compound race tyres tucked under the sofa - it needs every bit of bite for ~850 hp on 340 kg
    // (the softest street-legal compound, sticky from cold, and a wide flat peak: 850 hp on a 520 kg sofa needs every
    // bit of it - on the old R-compounds it lit them up in any gear and swapped ends when it did)
    couchF: { name: 'R-compound 20.0x7.5-13', short: 'R-comp 13 in', width: 0.2,
      muX: 1.45, muY: 1.3, loose: 0.8, kappaPeak: 0.11, alphaPeak: 0.13, relaxX: 0.14, relaxY: 0.26,
      B: 1.7, C: 1.42, E: -0.4, heatCap: 1500, cold: 0.95, coldT: 10, warmT: 35, hotT: 120, overheat: 0.003, prep: 1.15 },
    couchR: { name: 'R-compound 20.5x10.0-13', short: 'R-comp 13 in', width: 0.26,
      muX: 1.75, muY: 1.4, loose: 0.8, kappaPeak: 0.12, alphaPeak: 0.13, relaxX: 0.15, relaxY: 0.27,
      B: 1.7, C: 1.42, E: -0.4, heatCap: 1800, cold: 0.95, coldT: 10, warmT: 35, hotT: 120, overheat: 0.003, prep: 1.15 },
    // Banana Car: the F-150's all-season truck tyres
    truckAS: { name: 'P235/75R15 all-season', short: 'All-season', width: 0.235,
      muX: 1.05, muY: 0.92, loose: 1.1, kappaPeak: 0.12, alphaPeak: 0.15, relaxX: 0.2, relaxY: 0.45,
      B: 1.7, C: 1.35, E: -0.2, heatCap: 4000, cold: 0.97, coldT: 5, warmT: 30, hotT: 100, overheat: 0.003, prep: 1.02,
      crr: [1.1, 1, 1, 1, 1, 1.1] },
    // Blue Bird: Dunlop 37 x 7 land-speed tyres - thin treadless rubber on a cord carcass, built to spin at 300 mph, not to grip
    lsr37: { name: 'Dunlop 37 x 7 land-speed', short: 'Dunlop 37x7', width: 0.18,
      muX: 1.0, muY: 0.86, loose: 0.75, kappaPeak: 0.1, alphaPeak: 0.1, relaxX: 0.3, relaxY: 0.55,
      B: 1.6, C: 1.45, E: -0.25, heatCap: 6000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.05 },
    // Mini Dookie: skinny low-rolling-resistance eco tyres
    eco: { name: '145/70R15 eco', short: 'Eco tyres', width: 0.145,
      muX: 1.0, muY: 0.9, loose: 0.95, kappaPeak: 0.11, alphaPeak: 0.13, relaxX: 0.16, relaxY: 0.32,
      B: 1.8, C: 1.4, E: -0.2, heatCap: 2400, cold: 0.97, coldT: 5, warmT: 30, hotT: 100, overheat: 0.003, prep: 1.0,
      crr: [0.75, 1, 1, 1, 1, 0.75] },
    // Porta Potty and Turbo Scooter: 10 in pneumatic scooter / cart tyres
    tiny10: { name: '10 x 3.00 pneumatic', short: '10 in tyres', width: 0.076,
      muX: 0.9, muY: 0.82, loose: 0.95, kappaPeak: 0.11, alphaPeak: 0.13, relaxX: 0.08, relaxY: 0.14,
      B: 1.7, C: 1.4, E: -0.2, heatCap: 600, cold: 0.97, coldT: 5, warmT: 30, hotT: 100, overheat: 0.004, prep: 1.0,
      crr: [1.2, 1.2, 1.2, 1.1, 1, 1.2] },
    // Turbo Scooter 3000: soft-compound 10 in street-scooter tyres (at 215 kg it needs them to push against the wind)
    scooter10: { name: '10 x 3.00 soft street', short: 'Soft 10 in', width: 0.08,
      muX: 1.15, muY: 1.0, loose: 0.9, kappaPeak: 0.11, alphaPeak: 0.12, relaxX: 0.08, relaxY: 0.14,
      B: 1.7, C: 1.42, E: -0.2, heatCap: 600, cold: 0.93, coldT: 10, warmT: 40, hotT: 100, overheat: 0.004, prep: 1.05,
      crr: [1.1, 1.2, 1.2, 1.1, 1, 1.1] },
    // Razors Edge: golf-cart 18 x 8.50-8 tyres on the stretched cart chassis
    golf: { name: '18 x 8.50-8 cart tyre', short: 'Cart tyres', width: 0.215,
      muX: 0.95, muY: 0.86, loose: 1.05, kappaPeak: 0.11, alphaPeak: 0.14, relaxX: 0.14, relaxY: 0.26,
      B: 1.7, C: 1.38, E: -0.2, heatCap: 1600, cold: 0.97, coldT: 5, warmT: 30, hotT: 100, overheat: 0.004, prep: 1.0,
      crr: [1.1, 1.1, 1.05, 1.05, 1, 1.1] },
    // the jet golf cart: low-profile radials on 12 in wheels, wider and grippier at the back (the rear axle has to let go
    // after the front at 170 mph, or it would swap ends)
    jetF: { name: '205/40R12 cart radial', short: 'Cart radials', width: 0.205,
      muX: 1.1, muY: 0.98, loose: 0.95, kappaPeak: 0.11, alphaPeak: 0.12, relaxX: 0.14, relaxY: 0.28,
      B: 1.8, C: 1.4, E: -0.25, heatCap: 1800, cold: 0.97, coldT: 10, warmT: 40, hotT: 105, overheat: 0.003, prep: 1.0 },
    jetR: { name: '225/40R12 cart radial', short: 'Cart radials', width: 0.225,
      muX: 1.12, muY: 1.1, loose: 0.95, kappaPeak: 0.11, alphaPeak: 0.12, relaxX: 0.14, relaxY: 0.28,
      B: 1.8, C: 1.4, E: -0.25, heatCap: 2000, cold: 0.97, coldT: 10, warmT: 40, hotT: 105, overheat: 0.003, prep: 1.0 },
    // rally cars: gravel tyres - a tall, soft sidewall and a deep block tread that cuts into loose stuff; less than a
    // road tyre on tarmac, a lot more on gravel, dirt and grass
    // (on gravel - what they're made for - ~1.05 g round a corner; less in grass and mud, where the small tight blocks clog)
    rallyG: { name: '195/65R15 gravel rally', short: 'Gravel rally', width: 0.195,
      muX: 1.08, muY: 0.98, loose: 1.55, looseKx: [1, 1.12, 0.95, 1.05, 0.8, 1], looseKy: [1, 1.08, 0.92, 1.0, 0.8, 1], kappaPeak: 0.13, alphaPeak: 0.15, relaxX: 0.2, relaxY: 0.42,
      B: 1.6, C: 1.35, E: -0.1, heatCap: 3500, cold: 0.96, coldT: 5, warmT: 30, hotT: 110, overheat: 0.003, prep: 1.02,
      crr: [1.1, 1.05, 1.05, 1.05, 1, 1.1] },
    // the rally cars' off-road package: mud tyres - big open lugs that bite in grass, dirt and mud (~1 g in the grass, twice
    // the gravel tyre's grip in mud), about the same on gravel, a lot less on tarmac; heavier, and they bite at more slip
    rallyKnob: { name: '205/70R15 rally mud tyre', short: 'Rally mud', width: 0.205,
      muX: 0.9, muY: 0.85, loose: 1.7, looseKx: [1, 1.0, 1.15, 1.08, 1.3, 1], looseKy: [1, 0.95, 1.1, 1.02, 1.25, 1], kappaPeak: 0.15, alphaPeak: 0.16, relaxX: 0.22, relaxY: 0.45,
      B: 1.5, C: 1.35, E: -0.05, heatCap: 3500, cold: 0.96, coldT: 5, warmT: 30, hotT: 110, overheat: 0.003, prep: 1.0,
      crr: [1.3, 1.1, 1.1, 1.1, 1, 1.3], massAdd: 3, inertiaAdd: 0.15, lift: 0.02, tcTargets: [0.15, 0.18, 0.22] },
    // the Cybertruck's 35 in all-terrains on 20 in wheels: a road-biased AT tread - a truck tyre's grip on tarmac (~0.9 g
    // on 3 t), a lot more than a road tyre's in the loose stuff
    cyberAT: { name: 'Goodyear Wrangler Territory RT LT285/65R20', short: '35 in all-terrain', width: 0.285, radius: 0.44,
      muX: 1.3, muY: 1.06, loose: 1.5, kappaPeak: 0.12, alphaPeak: 0.13, relaxX: 0.2, relaxY: 0.42,
      B: 2.6, C: 1.3, E: -0.1, heatCap: 5000, cold: 0.95, coldT: 5, warmT: 35, hotT: 100, overheat: 0.004, prep: 1.02,
      crr: [1.2, 0.8, 0.8, 0.8, 0.85, 1.2] },
    // the touring bagger's tyres: a 130/60B19 front and a 180/55B18 rear, touring compound
    bikeF: { name: '130/60B19 touring front', short: 'Touring tyres', width: 0.13, radius: 0.335,
      muX: 1.18, muY: 1.12, loose: 1.0, kappaPeak: 0.12, alphaPeak: 0.1, relaxX: 0.15, relaxY: 0.3,
      B: 2.1, C: 1.4, E: -0.1, heatCap: 2200, cold: 0.95, coldT: 10, warmT: 40, hotT: 110, overheat: 0.003, prep: 1.0 },
    bikeR: { name: '180/55B18 touring rear', short: 'Touring tyres', width: 0.18, radius: 0.33,
      muX: 1.2, muY: 1.1, loose: 1.0, kappaPeak: 0.12, alphaPeak: 0.1, relaxX: 0.15, relaxY: 0.3,
      B: 2.1, C: 1.4, E: -0.1, heatCap: 2600, cold: 0.95, coldT: 10, warmT: 40, hotT: 110, overheat: 0.003, prep: 1.0 },
    // (the race bagger's: race slicks)
    bikeRaceF: { name: '120/70R17 race slick', short: 'Race slicks', width: 0.12, radius: 0.305,
      muX: 1.45, muY: 1.4, loose: 0.85, kappaPeak: 0.11, alphaPeak: 0.09, relaxX: 0.12, relaxY: 0.25,
      B: 2.2, C: 1.45, E: -0.15, heatCap: 1800, cold: 0.88, coldT: 20, warmT: 60, hotT: 120, overheat: 0.003, prep: 1.05 },
    bikeRaceR: { name: '200/60R17 race slick', short: 'Race slicks', width: 0.2, radius: 0.315,
      muX: 1.5, muY: 1.4, loose: 0.85, kappaPeak: 0.11, alphaPeak: 0.09, relaxX: 0.12, relaxY: 0.25,
      B: 2.2, C: 1.45, E: -0.15, heatCap: 2200, cold: 0.88, coldT: 20, warmT: 60, hotT: 120, overheat: 0.003, prep: 1.05 },
    // the trophy truck's: BFGoodrich Baja T/A KR3-type 39x13.5R17 desert racing tyres - a stiff 10-ply carcass, big
    // interlocking blocks: they hook on dirt and gravel nearly as well as on tarmac and shrug off rocks at 130 mph
    ttKR3: { name: '39x13.50R17 desert racing (Baja KR3-type)', short: '39 in desert', width: 0.343, radius: 0.495,
      muX: 1.12, muY: 1.0, loose: 1.62, looseKx: [1, 1.05, 0.95, 1.05, 0.85, 1], kappaPeak: 0.14, alphaPeak: 0.15, relaxX: 0.28, relaxY: 0.55,
      B: 1.8, C: 1.35, E: -0.1, heatCap: 9000, cold: 0.97, coldT: 5, warmT: 30, hotT: 120, overheat: 0.002, prep: 1.02,
      crr: [1.2, 1.1, 1.1, 1.05, 1.0, 1.2] },
    // (its off-road package: 40 in mud-terrains - open lugs for mud and grass, give-away grip on tarmac)
    ttMud: { name: '40x13.50R17 mud-terrain', short: '40 in mud', width: 0.343, radius: 0.508,
      muX: 0.98, muY: 0.86, loose: 1.9, looseKx: [1, 1.0, 1.1, 1.1, 1.25, 1], looseKy: [1, 0.95, 1.05, 1.05, 1.2, 1], kappaPeak: 0.16, alphaPeak: 0.17, relaxX: 0.3, relaxY: 0.58,
      B: 1.7, C: 1.32, E: -0.1, heatCap: 9000, cold: 0.97, coldT: 5, warmT: 30, hotT: 120, overheat: 0.002, prep: 1.0,
      crr: [1.35, 1.2, 1.2, 1.1, 1.0, 1.35], massAdd: 6, inertiaAdd: 0.6, finalK: 0.508 / 0.495 },
    // the dune buggy's: a narrow 5.60-15 up front, a fat 235/75R15 on the back (street / all-season - it's a VW)
    buggyF: { name: '5.60-15 bias front', short: 'Buggy tyres', width: 0.145, radius: 0.335,
      muX: 1.0, muY: 0.92, loose: 1.3, kappaPeak: 0.12, alphaPeak: 0.13, relaxX: 0.16, relaxY: 0.32,
      B: 1.9, C: 1.35, E: -0.1, heatCap: 1600, cold: 0.96, coldT: 5, warmT: 30, hotT: 110, overheat: 0.003, prep: 1.0,
      crr: [1.1, 1.05, 1.05, 1.05, 1, 1.1] },
    buggyR: { name: '235/75R15 rear', short: 'Buggy tyres', width: 0.235, radius: 0.367,
      muX: 1.05, muY: 0.98, loose: 1.4, kappaPeak: 0.12, alphaPeak: 0.13, relaxX: 0.18, relaxY: 0.36,
      B: 1.9, C: 1.35, E: -0.1, heatCap: 2400, cold: 0.96, coldT: 5, warmT: 30, hotT: 110, overheat: 0.003, prep: 1.0,
      crr: [1.1, 1.05, 1.05, 1.05, 1, 1.1] },
    // (its off-road package: sand paddles on the back, ribbed sand fronts - dune tyres)
    buggyPaddle: { name: '30x11-15 sand paddles', short: 'Sand paddles', width: 0.28, radius: 0.381,
      muX: 0.75, muY: 0.6, loose: 3.2, looseY: 1.35, looseKx: [1, 1.0, 0.85, 1.15, 1.0, 1], kappaPeak: 0.3, alphaPeak: 0.15, relaxX: 0.3, relaxY: 0.45,
      B: 1.5, C: 1.4, E: -0.2, heatCap: 8000, cold: 1, coldT: 0, warmT: 1, hotT: 200, overheat: 0.001, prep: 1.0,
      crr: [1.5, 1.25, 1.2, 1.1, 1.0, 1.5], massAdd: 3, inertiaAdd: 0.15, finalK: 0.381 / 0.367 },
    // the tank's tracks: rubber-padded steel, 635 mm wide - each 'wheel' is one end of a track's ground contact. A long,
    // stiff footprint (bites at little slip, no heat to speak of), grousers that dig into soft ground, and a tracked
    // vehicle's rolling resistance (~3.5 % on tarmac, a lot less than a tyre's in mud)
    track: { name: 'T-158 steel track, rubber pads', short: 'Steel tracks', width: 0.635, radius: 0.36,
      muX: 0.95, muY: 0.62, loose: 1.3, looseKx: [1, 1.15, 1.2, 1.2, 1.25, 1], looseKy: [1, 1.1, 1.15, 1.15, 1.2, 1], kappaPeak: 0.12, alphaPeak: 0.1, relaxX: 0.25, relaxY: 0.3,
      B: 2.2, C: 1.4, E: 0, heatCap: 1e6, cold: 1, coldT: 0, warmT: 1, hotT: 1000, overheat: 0, prep: 1.0,
      crr: [3, 1.2, 1.0, 1.0, 0.5, 3] },
    // (its off-road package: the rubber pads off - bare steel grousers dig into dirt, mud and grass, slide on tarmac)
    trackGrouser: { name: 'T-158 steel track, bare grousers', short: 'Steel grousers', width: 0.635, radius: 0.36,
      muX: 0.62, muY: 0.45, loose: 1.55, looseKx: [1, 1.2, 1.25, 1.25, 1.35, 1], looseKy: [1, 1.15, 1.2, 1.2, 1.3, 1], kappaPeak: 0.12, alphaPeak: 0.1, relaxX: 0.25, relaxY: 0.3,
      B: 2.2, C: 1.4, E: 0, heatCap: 1e6, cold: 1, coldT: 0, warmT: 1, hotT: 1000, overheat: 0, prep: 1.0,
      crr: [3, 1.2, 1.0, 1.0, 0.45, 3] },
    // their off-road package: knobbies in each car's own size, a touch of lift
    ccKnob: { name: 'Knobby off-road tyres', short: 'Knobbies', width: 0.16,
      muX: 1.0, muY: 0.88, loose: 1.45, looseKx: [1, 1.05, 1.1, 1.15, 0.9, 1], kappaPeak: 0.13, alphaPeak: 0.15, relaxX: 0.14, relaxY: 0.26,
      B: 1.8, C: 1.3, E: -0.1, heatCap: 1500, cold: 0.97, coldT: 5, warmT: 30, hotT: 110, overheat: 0.003, prep: 1.02,
      crr: [1.3, 1.2, 1.2, 1.1, 1, 1.3], massAdd: 2, inertiaAdd: 0.02, lift: 0.02 },
  };
  // the off-road package each vehicle gets (road cars: the KO2s + lift; the More Cars: what suits each of them)
  function OFFROAD_PKG(car, cls) {
    if (car === 'puller') return { front: 'tractorFrontLug', rear: 'pullingR2' };
    if (car === 'dragster') return cls === 'tad' ? { front: 'sandRib', rear: 'paddleTA' } : { front: cls === 'fc' ? 'sandRibFC' : 'sandRib', rear: 'paddleTF' };
    if (car === 'monster' || car === 'avenger') return { front: 'monsterMud', rear: 'monsterMud' };
    if (car === 'trophy') return { front: 'ttMud', rear: 'ttMud' };
    if (car === 'buggy') return { front: 'sandRib', rear: 'buggyPaddle' };
    if (car === 'kart') return { front: 'kartKnobF', rear: 'kartKnobR' };
    if (car === 'mower') return { front: 'mowerBarF', rear: 'mowerBarR' };
    if (car === 'rally') return { front: 'rallyKnob', rear: 'rallyKnob' };
    if (car === 'tank') return { front: 'trackGrouser', rear: 'trackGrouser' };
    if (car === 'bike') return { front: 'ccKnob', rear: 'ccKnob' };
    if (CARS[car] && CARS[car].cc) return { front: 'ccKnob', rear: 'ccKnob' };
    return { front: 'offroad', rear: 'offroad' };
  }
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
      const fk = this.finalK || 1;
      if (this.transType === 'auto') {
        if (g < 0) return -s.autoRev * s.autoFinal * fk;
        if (g === 0) return 0;
        return s.autoRatios[g - 1] * s.autoFinal * fk;
      }
      if (g < 0) return -s.manualRev * s.manualFinal * fk;
      if (g === 0) return 0;
      return s.manualRatios[g - 1] * s.manualFinal * fk;
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
    rpm() { return this.spec.jet ? (this.jetN || 0) * this.spec.jet.rpm100 : this.eOmega * RAD2RPM; }

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
      this.finalK = TIRES[s.rearTire].finalK || 1;
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
      if (this.spec.electric) { this.running = true; this.cranking = false; this.stalled = false; return; }
      if (this.running || this.cranking) return;
      this.cranking = true; this.crankT = 0; this.stalled = false;
    }
    stopEngine() { this.running = false; this.cranking = false; }

    // ------------------------------------------------------------------ main step
    // Air assist (the game turns it on for the monster truck): what an experienced driver's feet do over a jump. In the air
    // the gas spins the wheels up and rocks the nose up, the brake stops them and drops it (wheelGyro) - pinned for the
    // whole flight (a keyboard's W) it lands 50-70 deg nose up, and the rears touching down still spinning at twice
    // road speed kick it on over backwards. So: fade whichever pedal would rotate it past a landable attitude (looking a
    // few tenths of a second ahead), catch a nose that's way off, and feather the gas on touchdown until the rears
    // match the ground. Short of that the pedals are all yours (off: do your own flips)
    // It aims for the ground it's going to land on (the flight path traced ahead to where the tyres meet the dirt:
    // the far side of a gap jump or a tabletop slopes away, so it wants the nose down to match), a touch rear-first.
    // It works the pedals itself in the air - brake to drop the nose, gas to lift it - and on top of that a spotter's hand
    // (a game aid, like traction control): a light, capped nudge in pitch and roll towards that landing attitude
    // (_aaTorque) that steadies a truck that left a ramp crooked or twisting, but can't save one that's way over
    _airAssist(dt) {
      const inp = this.input, { qx, qy, qz, qw } = this;
      const pitch = Math.asin(clamp(-2 * (qy * qz - qx * qw), -1, 1)) * 57.2958;
      const rx = 1 - 2 * (qy * qy + qz * qz), ry = 2 * (qx * qy + qz * qw), rz = 2 * (qx * qz - qy * qw);
      const rate = (this.wx * rx + this.wy * ry + this.wz * rz) * 57.2958, ahead = pitch + 0.35 * rate;
      if (this.airborne) {
        this.aaGnd = 0; this.aaAir = (this.aaAir || 0) + dt;
        // where it comes down: the ballistic path against the ground, CG ~ ride height + droop above it at touchdown
        const s = this.spec, g = GRAV * (s.gravScale || 1), gnd = this._aaG || (this._aaG = {}), clear = s.cgHeight + 0.6 * s.travelDown;
        let tl = 3, nx = 0, ny = 1, nz = 0;
        for (let t = 0.05; t <= 3; t += 0.05) {
          const x = this.px + this.vx * t, z = this.pz + this.vz * t, y = this.py + this.vy * t - 0.5 * g * t * t;
          this.world.ground(x, z, gnd);
          if (y - gnd.h < clear) { tl = t; nx = gnd.nx; ny = gnd.ny; nz = gnd.nz; break; }
        }
        // the landing surface's slope along the truck's heading and across it -> target pitch (nose up +) and roll
        // (right side up +), with the nose 4 deg up of the slope so the rears touch first
        const fl = Math.hypot(rx, rz) || 1, fx = rz / fl, fz = -rx / fl;   // (forward, level: up x right)
        const ny1 = Math.max(0.3, ny);
        const tgtP = Math.atan(-(nx * fx + nz * fz) / ny1) * 57.2958 + 4, tgtR = Math.atan(-(nx * rx + nz * rz) / (ny1 * fl)) * 57.2958;
        this.aaTgtP = tgtP / 57.2958; this.aaTgtR = tgtR / 57.2958; this.aaTL = tl;
        const e = ahead - tgtP;
        if (inp.throttle > 0) inp.throttle *= clamp((16 - e) / 14, 0, 1);
        if (inp.brake > 0) inp.brake *= clamp((e + 12) / 10, 0, 1);
        // and the feet do the flying: stab the brake to bring a rising nose down, rev the wheels to lift a dropping one
        // (you hear it working) - from 8 deg off the landing attitude, all in by ~22
        this.aaAuto = 0;
        if (e > 8) { const b = clamp((e - 8) / 14, 0, 1); if (b > inp.brake) { inp.brake = b; this.aaAuto = -b; } }
        if (e < -8) { const t = clamp((-8 - e) / 14, 0, 1); if (t > inp.throttle) { inp.throttle = t; this.aaAuto = t; } }
      } else {
        this.aaAir = 0;
        if ((this.aaGnd = (this.aaGnd === undefined ? 9 : this.aaGnd) + dt) < 1.4) {
          // touchdown: feather the gas until the rears match the ground, and don't let it rear up over backwards off the
          // landing (a wheelie on the way out is fine; one still climbing past 25 deg isn't)
          const W = this.wheels, wr = 0.5 * (W[2].omega * W[2].radius + W[3].omega * W[3].radius), gs = Math.abs(this.forwardSpeed);
          if (this.aaGnd < 0.8 && pitch > 6 && wr > 1.25 * gs + 2) inp.throttle = Math.min(inp.throttle, 0.25);
          if (ahead > 25) inp.throttle = Math.min(inp.throttle, clamp((40 - ahead) / 15, 0, 1) * 0.5);
        }
      }
    }
    // (the air assist's nudge, per substep: PD on pitch and roll towards the landing attitude, capped at 0.5 rad/s^2 in
    // pitch and 1 in roll - a light hand: the pedals do most of the work - faded in over the first 0.2 s of a flight so it doesn't fight the take-off, and off once it's
    // past ~85 deg: a truck that rolled over on the ramp's edge before it left the ground is beyond saving)
    _aaTorque(m00, m10, m20, m02, m12, m22, m11) {
      const s = this.spec, fade = clamp(((this.aaAir || 0) - 0.08) / 0.2, 0, 1);
      if (fade <= 0 || m11 < 0.1 || this.aaTgtP === undefined) return null;
      const pitch = Math.asin(clamp(-m12, -1, 1)), roll = Math.asin(clamp(m10, -1, 1));
      const wP = this.wx * m00 + this.wy * m10 + this.wz * m20, wR = this.wx * m02 + this.wy * m12 + this.wz * m22;
      const A = 0.5 * fade, AR = 1.0 * fade, kp = 3.5, kd = 3;
      const aP = clamp(kp * (this.aaTgtP - pitch) - kd * wP, -A, A), aR = clamp(kp * (this.aaTgtR - roll) - kd * wR, -AR, AR);
      const tP = aP * s.Ipitch, tR = aR * s.Iroll;
      const T = this._aaT || (this._aaT = [0, 0, 0]);
      T[0] = m00 * tP + m02 * tR; T[1] = m10 * tP + m12 * tR; T[2] = m20 * tP + m22 * tR;
      return T;
    }
    step(dt) {
      this.acc += Math.min(dt, 0.1);
      const h = this.h;
      // gather obstacles once per frame
      const sp = Math.hypot(this.vx, this.vz);
      this.world.collidersNear(this.px, this.pz, 8 + sp * 0.12, this._circles, this._boxes);
      if (this.input.airAssist) this._airAssist(Math.min(dt, 0.1));
      // (wheelie control reads the nose-up pitch against the road, not the horizon: the slope under it along its heading)
      if (this.spec.wheelieCtl) {
        const g = this._wcG || (this._wcG = {}), { qx, qy, qz, qw } = this;
        this.world.ground(this.px, this.pz, g);
        const fx = -2 * (qx * qz + qy * qw), fz = -(1 - 2 * (qx * qx + qy * qy)), fl = Math.hypot(fx, fz) || 1;
        this.gndPitch = Math.atan(-(g.nx * fx + g.nz * fz) / (fl * Math.max(0.2, g.ny))) * 57.3;
      }
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
      // (a motorcycle: its steering tilts over with it, and a leaned bike's front wheel points further across the road
      // than the bars are turned - the wheel steered here about the leaned body is given back what the lean takes off
      // its angle on the ground)
      // It also steers itself into a fall: leaned further than the rider wants (braking hard in a turn, a bump), the front
      // wheel turns toward the lean and the turn stands it back up - the trail behind the steering axis, and how a bike
      // balances at all
      if (s.bike) {
        const vv = Math.max(2, Math.abs(vFwd)), err = (this.lean || 0) - (this.leanT || 0);
        this.steerSelf = clamp(s.bike.selfK * err * GRAV * s.wheelbase / (vv * vv), -0.2, 0.2) * Math.sign(vFwd || 1) * clamp((Math.abs(vFwd) - 1.5) / 2.5, 0, 1);
        dL = dR = Math.atan(Math.tan(d + this.steerSelf) / Math.max(0.35, Math.cos(this.lean || 0)));
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
        // (a motorcycle tyre is round in section - a torus, its crown radius half its width: leaned over, the wheel
        // touches down on its shoulder, lower and out to the side of the hub. rE: the hub's height over the road)
        const rho = s.bike ? Math.min(r * 0.5, w.tire.width / 2) : 0;
        const rEf = (nx, ny, nz) => { const na = nx * m00 + ny * m10 + nz * m20; return rho + (r - rho) * Math.sqrt(Math.max(0, 1 - na * na)); };
        if (s.tyreEnvelope) this._envelope(w, hx, hy, hz, dirX, dirY, dirZ, m00, m10, m20, m02, m12, m22, g);
        else {
          world.ground(hx, hz, g);
          let nx = g.nx, ny = g.ny, nz = g.nz;
          let ndd = -(nx * dirX + ny * dirY + nz * dirZ);
          let sl = 1e9;
          if (ndd > 0.2) {
            let hpN = (hy - g.h) * ny;
            sl = (hpN - (rho ? rEf(nx, ny, nz) : r)) / ndd;
            if (sl < w.sMax + 0.35) {
              const cx = hx + dirX * sl - nx * r, cz = hz + dirZ * sl - nz * r;
              world.ground(cx, cz, g);
              nx = g.nx; ny = g.ny; nz = g.nz;
              ndd = -(nx * dirX + ny * dirY + nz * dirZ);
              hpN = nx * (hx - cx) + ny * (hy - g.h) + nz * (hz - cz);
              sl = ndd > 0.2 ? (hpN - (rho ? rEf(nx, ny, nz) : r)) / ndd : 1e9;
            }
          }
          w.sRaw = sl;
          w.nx = nx; w.ny = ny; w.nz = nz; w.surface = g.surface; w.ndd = ndd;
          // (where it touches, from the end of the strut: down the wheel's own plane to the crown, then down to the road)
          if (rho) {
            const na = nx * m00 + ny * m10 + nz * m20, ux = na * m00 - nx, uy = na * m10 - ny, uz = na * m20 - nz, ul = (r - rho) / (Math.sqrt(ux * ux + uy * uy + uz * uz) || 1);
            w.cox = ux * ul - nx * rho; w.coy = uy * ul - ny * rho; w.coz = uz * ul - nz * rho;
          }
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
        if (s.tyreEnvelope || s.bike) {
          // (a motorcycle too: leaned over, its forks and shock are tilted - the ground still pushes straight up at the
          // tyre, and a spring pushing along the tilted strut mustn't hand it a sideways shove the tyres never made)
          // the whole contact force at the contact point: the spring sets its part along the strut, the links carry the
          // rest - so a tyre rolling into a step (a car's side, a ramp's toe) is pushed back by it, not just lifted
          const N = F / Math.max(0.35, w.ndd);
          w.Fz = N; fx = w.nx * N; fy = w.ny * N; fz = w.nz * N;
          // (a leaned motorcycle wheel touches down on its tyre's shoulder, out from under the hub)
          if (s.bike) { cx += w.cox; cy += w.coy; cz += w.coz; }
          else { cx -= w.nx * w.radius; cy -= w.ny * w.radius; cz -= w.nz * w.radius; }
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
      // ---------------- outriggers: small stabiliser casters on arms out to the sides (body-mounted). Clear of the
      // ground when it's level, they touch down once it leans a few degrees and hold it up there: a much wider base to
      // tip over, so it slides before it rolls. A caster swivels, so it pushes up and nothing else
      if (s.outriggers) {
        const o = s.outriggers, dr = s.cgDrop || 0;
        this.outriggerLoad = 0;
        for (const [lx, ly0, lz] of o.pts) {
          // (on the body: a tune that drops the CG inside it moves them up from the CG with everything else - left where
          // they were, a big grip tune had the casters holding the scooter's wheels off the road)
          const ly = ly0 + dr;
          const bx = px + m00 * lx + m01 * ly + m02 * lz, by = py + m10 * lx + m11 * ly + m12 * lz, bz = pz + m20 * lx + m21 * ly + m22 * lz;
          world.ground(bx, bz, g);
          const pen = g.h + o.r - by;
          if (pen > 0) {
            const rx = bx - px, rz = bz - pz, bvy = vy + (wz * rx - wx * rz);
            const F = clamp(o.k * pen - o.damp * bvy, 0, o.Fmax);
            Fy += F; Tx += -rz * F; Tz += rx * F;
            this.outriggerLoad += F;
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
        // (a motorcycle's: on its leaned tyre's shoulder)
        const cpx = w.hx + dirX * w.sRaw + (s.bike ? w.cox : -nx * r), cpy = w.hy + dirY * w.sRaw + (s.bike ? w.coy : -ny * r), cpz = w.hz + dirZ * w.sRaw + (s.bike ? w.coz : -nz * r);
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
          Fxt = (loose ? (ty.loose || ty.muY) * (ty.looseKx ? ty.looseKx[w.surface] : 1) : ty.muX) * f * sx; Fyt = -(loose ? (ty.looseY || ty.loose || ty.muY) * (ty.looseKy ? ty.looseKy[w.surface] : 1) : ty.muY) * f * sy;
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

      // ---------------- afloat (floats: the Banana Car): rear tyres turning in the water paddle it along - their push
      // on the hull, and the water's drag back on the tyres through the driveline
      if (s.floats && this.floatSub > 0.05) {
        const pw = s.floats.paddle, pmax = s.floats.paddleMax || 900;
        for (let i = 2; i < 4; i++) {
          const w = W[i];
          if (w.contact) continue;
          const F = clamp(pw * (w.omega * w.radius - vFwd) * Math.min(1, this.floatSub), -pmax, pmax);
          w.fx = F;
          Fx -= m02 * F; Fy -= m12 * F; Fz -= m22 * F;
        }
      }

      // ---------------- brakes
      this._brakes(h, speed);

      // ---------------- wheels & driveline
      let L0 = 0;
      if (s.wheelGyro) for (let i = 0; i < 4; i++) L0 += W[i].inertia * W[i].omega;
      if (s.tracks) this._drivelineTracks(h);
      else if (s.awd) this._driveline4(h);
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
        // tuned downforce: pushes the body down along its own up axis, squashing the tyres into the road (dfV: past this
        // speed it stops growing - the Mega Jet's 800 mph would otherwise crush it onto its belly)
        // and it fades as the car tilts, gone on its side or its roof - flying off a crest at 500+ mph, a car rolled half
        // over had its own 'down' holding it in the air as lift)
        const vd = s.dfV && vFwd > s.dfV ? s.dfV : vFwd, df = 0.5 * s.rho * s.ClA * vd * vd * (s.dfV ? Math.max(0, upY) : 1);
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

      // jet thrust: along the car's own axis, on the turbine's centre line (above the CG - it leans on the nose a little,
      // which is what keeps it from standing up on the rear axle like a wheelie car)
      if (s.jet && this.jetF > 0) {
        // (a grip tune lowers the whole cart, the engine with it: the thrust stays on the CG. Left where it was, above a
        // lowered CG, it tipped the nose down in the air - 5 rad/s over a crest at 500 mph, onto its roof)
        const T = this.jetF, ly = s.jet.y, lz = s.jet.z;
        const rx = m01 * ly + m02 * lz, ry = m11 * ly + m12 * lz, rz = m21 * ly + m22 * lz;
        const fx = -m02 * T, fy = -m12 * T, fz = -m22 * T;
        Fx += fx; Fy += fy; Fz += fz;
        Tx += ry * fz - rz * fy; Ty += rz * fx - rx * fz; Tz += rx * fy - ry * fx;
      }
      // a tail fin (fin: its height, how far behind the CG, side area x lift slope): the air hitting it side-on pushes it
      // back in line - weathervane stability that grows with speed and holds the nose straight when the tyres go light
      if (s.fin) {
        const f = s.fin, ly = f.y + (s.cgDrop || 0), lz = f.z;
        const rx = m01 * ly + m02 * lz, ry = m11 * ly + m12 * lz, rz = m21 * ly + m22 * lz;
        const ax = vx + wy * rz - wz * ry, ay = vy + wz * rx - wx * rz, az = vz + wx * ry - wy * rx;
        const F = -0.5 * s.rho * f.CyA * Math.sqrt(ax * ax + ay * ay + az * az) * (ax * m00 + ay * m10 + az * m20);
        const fx = m00 * F, fy = m10 * F, fz = m20 * F;
        Fx += fx; Fy += fy; Fz += fz;
        Tx += ry * fz - rz * fy; Ty += rz * fx - rx * fz; Tz += rx * fy - ry * fx;
      }

      // aerodynamic damping (aeroDamp: [roll, pitch, yaw], N m per rad/s per m/s): a flat-bottomed body rolling or pitching in
      // a 90 m/s airstream meets the air at an angle on the side going down and lifts it back - the rotation is damped in
      // proportion to speed. It's what lets the jet cart fly a crest level instead of drifting into a roll in the air
      if (s.aeroDamp) {
        const [kr, kp, ky] = s.aeroDamp;
        const wxB = wx * m00 + wy * m10 + wz * m20, wyB = wx * m01 + wy * m11 + wz * m21, wzB = wx * m02 + wy * m12 + wz * m22;
        const tbx = -kp * speed * wxB, tby = -ky * speed * wyB, tbz = -kr * speed * wzB;
        Tx += m00 * tbx + m01 * tby + m02 * tbz; Ty += m10 * tbx + m11 * tby + m12 * tbz; Tz += m20 * tbx + m21 * tby + m22 * tbz;
      }

      // a motorcycle (bike: each axle's two 'wheels' side by side under the tyre's centre line - no roll stiffness of its
      // own): the rider balances it. Rolling on, it's leaned into a turn to where gravity and the turn balance
      // (tan(lean) = speed x yaw rate / g, up to maxLean); at a walk it's held upright (feet down). The lean's error is
      // corrected with a roll torque about the bike's own length
      if (s.bike) {
        const Bk = s.bike, fX = -m02, fY = -m12, fZ = -m22;
        const lean = Math.asin(clamp(-m10, -1, 1)), rollRate = wx * fX + wy * fY + wz * fZ;          // (+ to the right)
        const v = Math.abs(vFwd), ramp = clamp((v - Bk.vMin) / 2.5, 0, 1);
        // (the turn the rider is steering - its yaw rate - and the one it's making, + to the right)
        const rK = vFwd * Math.tan(this.steerAngle + (this.steerSelf || 0)) / s.wheelbase, rR = -wy;
        const target = clamp(Math.atan2(vFwd * vFwd * Math.tan(this.steerAngle) / s.wheelbase, 9.81), -Bk.maxLean, Bk.maxLean) * ramp;
        this.leanT = (this.leanT || 0) + (target - (this.leanT || 0)) * Math.min(1, h / 0.06);
        const kp = Bk.kp * (1 + 2 * (1 - ramp)), kd = Bk.kd * (1 + (1 - ramp));
        const Tr = s.Iroll * (kp * (this.leanT - lean) - kd * rollRate);
        Tx += fX * Tr; Ty += fY * Tr; Tz += fZ * Tr;
        this.lean = lean;
        // and a bike's own straight-line stability (the trail behind its steering axis, and the rider): it yaws as its
        // steering says - a yaw nobody asked for, the back stepping out under hard braking with the back light, is held -
        // and a back axle sliding sideways off its path is brought back into line
        const hr = 1 / Math.max(0.2, Math.hypot(m00, m20)), vRh = (vx * m00 + vz * m20) * hr;
        const bR = Math.atan2(vRh - rR * s.cgToRear, Math.max(3, v)) * Math.sign(vFwd || 1);
        Ty += s.Iyaw * (Bk.yawK * (rR - rK) - Bk.alignK * bR) * ramp;
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

      // ---------------- air assist's nudge (see _airAssist)
      if (inp.airAssist && this.airborne) { const T = this._aaTorque(m00, m10, m20, m02, m12, m22, m11); if (T) { Tx += T[0]; Ty += T[1]; Tz += T[2]; } }

      // ---------------- water
      const wl0 = world.C.WATER_LEVEL;
      const sub = wl0 - (py - 0.25);
      if (s.floats) {
        // (floats) a sealed hull: buoyancy at ten points along its bottom from how deep each one sits, so it floats level
        // at its draft and rights itself; heave damping, the hull's drag through the water (a keel sideways), and the
        // front wheels acting as rudders. The engine breathes high up - it keeps running
        const fl = s.floats, N = 10, ly = fl.bottom - s.cgHeight + (s.cgDrop || 0), zc = s.wheelbase * (s.frontWeight - 0.5);
        const Aw = fl.len * 2 * fl.halfW * fl.fill, kA = 1000 * GRAV * Aw / N, draft = mass / (1000 * Aw);
        let dSum = 0;
        for (let k = 0; k < N; k++) {
          const lx = (k & 1 ? 1 : -1) * fl.halfW * 0.95, lz = ((k >> 1) / 4 - 0.5) * fl.len * 0.85 + zc;
          const rx = m00 * lx + m01 * ly + m02 * lz, ry = m10 * lx + m11 * ly + m12 * lz, rz = m20 * lx + m21 * ly + m22 * lz;
          const d = clamp(wl0 - (py + ry), 0, fl.depth);
          if (d <= 0) continue;
          dSum += d;
          const cvy = vy + (wz * rx - wx * rz);
          const F = kA * d - 900 * cvy * Math.min(1, d / 0.1);
          Fy += F; Tx -= rz * F; Tz += rx * F;
        }
        this.floatSub = dSum / (N * draft);
        const wet = Math.min(1, this.floatSub);
        this.inWater = wet;
        if (wet > 0) {
          const dF = -(220 * vFwd + 160 * vFwd * Math.abs(vFwd)) * wet, dS = -(2500 * vRight + 1200 * vRight * Math.abs(vRight)) * wet;
          Fx += -m02 * dF + m00 * dS; Fy += -m12 * dF + m10 * dS; Fz += -m22 * dF + m20 * dS;
          Tx -= 2500 * wx * wet; Ty -= 3000 * wy * wet; Tz -= 2500 * wz * wet;
          for (let i = 0; i < 2; i++) {
            const w = W[i];
            if (w.contact) continue;
            const sn = Math.sin(w.steer), cs = Math.cos(w.steer);
            let fx = m00 * sn - m02 * cs, fz = m20 * sn - m22 * cs;
            const fn = Math.hypot(fx, fz) || 1; fx /= fn; fz /= fn;
            const rx = w.hx - px, ry = w.hy - py, rz = w.hz - pz;
            const cvx = vx + (wy * rz - wz * ry), cvz = vz + (wx * ry - wy * rx);
            const F = -fl.rudder * (cvx * -fz + cvz * fx) * Math.max(Math.abs(cvx * fx + cvz * fz), 0.5) * wet;
            const Fxr = -fz * F, Fzr = fx * F;
            Fx += Fxr; Fz += Fzr;
            Tx += ry * Fzr; Ty += rz * Fxr - rx * Fzr; Tz -= ry * Fxr;
          }
        }
      } else if (sub > 0) {
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
      let vRear = okL && okR ? Math.max(vL, vR) : okL ? vL : vR;
      let vRearMin = okL && okR ? Math.min(vL, vR) : okL ? vL : vR;
      // (tcAxleMean - karts: a solid rear axle turns both wheels together, so in a turn the outside one always reads
      // fast. The axle's mean speed against the chassis' own speed is exact however hard it's turning or sliding)
      if (s.tcAxleMean && okL && okR) vRear = vRearMin = 0.5 * (vL + vR);
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
        // (and a tyre can bring its own: the puller's deep-lug off-road package bites at more slip than its cut pullers)
        const tgts = W[2].tire.tcTargets || s.tcTargets;
        let target = tgts ? tgts[this.tcMode] : Math.min(this.tcMode === 0 ? 0.06 : this.tcMode === 1 ? 0.11 : 0.17, peak);
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
      // (with the car in the air - fewer than three wheels down - the module holds off, as the real ones do: braking a
      // front wheel that's off the ground only lands it locked, and a crooked landing became a spin)
      const nDown = (W[0].contact ? 1 : 0) + (W[1].contact ? 1 : 0) + (W[2].contact ? 1 : 0) + (W[3].contact ? 1 : 0);
      if (this.tcMode <= 1 && !s.noESC && speed > 5 && !this.lineLockActive && vFwd > 3 && nDown >= 3) {
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
      if (s.jet) return this._jetEngine(h);
      let rpm = this.eOmega * RAD2RPM;
      // electric motor (electric): always live - no starter, no idle, no stall - with full torque from a standstill, and
      // the controller holds its top speed by fading the torque out instead of a fuel cut
      const EV = !!s.electric;
      if (EV) { this.running = true; this.cranking = false; this.stalled = false; }
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
      if (this.running && !EV) {
        this.idleFlare *= Math.exp(-h / 1.1);
        // cammed idle hunts a little: the tach needle dances +-30-40 rpm
        const tgt = s.idleRpm + this.idleFlare + 11 * Math.sin(this.time * 6.9) + 6 * Math.sin(this.time * 2.3 + 1.1);
        const e = tgt - rpm;
        this.idleI = clamp(this.idleI + e * h * 0.00015, 0, 0.22);
        const idleThr = clamp(e * 0.0009 + this.idleI, 0, 0.4);
        if (thr < idleThr) thr = idleThr;
      }
      // rev limiter (fuel cut with hysteresis); the Fun tab can remove it
      if (EV) this.fuelCut = false;
      else if (rpm > s.limiterRpm && !s.noLimiter) this.fuelCut = true;
      else if (rpm < s.limiterRpm - 230 || s.noLimiter) this.fuelCut = false;
      // launch control / TransBrake: hold rpm with spark cut, keep the throttle open so boost is ready (Torque Reserve)
      // (launchLimiter: a starting-line rev limiter that works whatever the traction-control setting)
      const launchCut = this.launchHold && (this.tcMode < 3 || s.launchLimiter) ? clamp((this.launchRpm - rpm) / 150, 0, 1) : 1;
      if (s.govSpeed) {
        const v = this.forwardSpeed;
        if (v > s.govSpeed) this.govT += h; else if (v < s.govSpeed - 1.5) this.govT = 0;
        if (this.govT > s.govGrace) thr *= clamp((s.govSpeed - v) / 1.2 + 0.3, 0, 1);
      }
      // mechanical governor (rental karts): the flyweights close the throttle progressively as the revs near the governed
      // speed, so it holds a steady top speed instead of banging off a rev limiter
      if (s.governorRpm) thr = Math.min(thr, clamp((s.governorRpm - rpm) / s.governorBand, 0, 1));
      if (EV && !s.noLimiter) thr *= clamp((s.limiterRpm - rpm) / 250, 0, 1);
      if (this.fuelCut || !this.running) thr = 0;
      // throttle-body / manifold lag
      const tau = thr > this.thrEff ? 0.065 : 0.045;
      this.thrEff += (thr - this.thrEff) * Math.min(1, h / tau);
      let Twot = curveAt(s.torqueCurve, rpm / (s.rpmStretch || 1)) * LBFT * (s.torqueScale || 1) - windage(s, rpm);
      // turbocharger (turbo): the torque curve is the engine on full boost, but the turbine takes a moment to spool -
      // boost follows the throttle and the exhaust flow (rpm) with a lag, and the torque climbs with it from its
      // off-boost base (on the launch limiter the throttle is held open, so it spools up on the line)
      if (s.turbo) {
        const tb = s.turbo, flow = clamp((rpm - tb.rpm0) / (tb.rpm1 - tb.rpm0), 0, 1);
        const tgt = this.thrEff * flow * (this.running ? 1 : 0), sp0 = this.spool || 0;
        this.spool = sp0 + (tgt - sp0) * Math.min(1, h / (tgt > sp0 ? tb.lag : tb.lag * 0.4));
        Twot *= tb.base + (1 - tb.base) * this.spool;
      }
      const Tf = (s.fricA + s.fricB * rpm / 1000) * Math.tanh(this.eOmega / 4);
      // ignition timing on the hit (nitro dragsters): the crew chief pulls timing for the first second of the run and
      // brings it back in on the timers as the car gathers speed and the tyres can take it
      let retard = 1;
      if (s.launchRetard) { const x = clamp(this.dcT / s.launchRetard[1], 0, 1); retard = s.launchRetard[0] + (1 - s.launchRetard[0]) * x * x * (3 - 2 * x); }
      // wheelie control (wheelieCtl: the nose-up pitch in degrees where it starts - a game aid like traction control, off
      // with TC Off): the motor controller reads the pitch and its rate and trims the torque as the nose comes up, so
      // the scooter launches with its front skimming the road instead of pogoing on its anti-tip wheels
      if (s.wheelieCtl && this.tcMode < 3) {
        const { qx, qy, qz, qw } = this, m12 = 2 * (qy * qz - qx * qw);
        const m00 = 1 - 2 * (qy * qy + qz * qz), m10 = 2 * (qx * qy + qz * qw), m20 = 2 * (qx * qz - qy * qw);
        const ahead = (Math.asin(clamp(-m12, -1, 1)) + 0.12 * (this.wx * m00 + this.wy * m10 + this.wz * m20)) * 57.3 - (this.gndPitch || 0);
        const tgt = clamp(1 - (ahead - s.wheelieCtl) / 4, 0.1, 1), wc0 = this.wcCut === undefined ? 1 : this.wcCut;
        this.wcCut = wc0 + (tgt - wc0) * Math.min(1, h / 0.03);
      } else this.wcCut = 1;
      let Te = (this.running && !this.fuelCut) ? this.thrEff * Twot * retard * this.tcCut * this.escCut * shiftCut * launchCut * this.wcCut - (1 - this.thrEff) * Tf : -Tf;
      if (this.cranking) Te += s.starterTorque * Math.max(0, 1 - rpm / 380);
      // nitrous (Fun tab): a fixed horsepower shot on top, while the button is held at wide-open throttle
      this.nosActive = !!(inp.nos && s.nosHp > 0 && this.running && !this.fuelCut && thr > 0.6 && rpm > 1500 && this.gear !== 0 && !this.launchHold);
      if (this.nosActive) Te += s.nosHp * 745.7 / Math.max(this.eOmega, 260) * this.tcCut * this.escCut * shiftCut;
      this.Te = Te;
      // supercharger boost (for gauge & whine). A roots / screw blower moves a fixed volume per turn - near full boost
      // from low revs; a centrifugal one (centrifugal: the supercharged kart's) builds it with the square of its speed
      const bShape = s.centrifugal ? Math.pow(clamp(rpm / s.redlineRpm, 0, 1), 2) : Math.pow(clamp((rpm - 900) / 3600, 0, 1), 0.65);
      const bTgt = s.boostMax * this.thrEff * bShape * (this.running ? 1 : 0);
      if (s.turbo) this.boost = s.boostMax * this.spool;
      else this.boost += (bTgt - this.boost) * Math.min(1, h / 0.12);
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
      if (this.running && rpm < 330 && this.locked && this.gear !== 0 && !EV) {
        this.running = false; this.stalled = true;
      }
    }

    // jet (the jet golf cart): a small turbojet behind the seats. The throttle sets the spool (N1: the compressor's speed as
    // a fraction of its 100 %) and the turbine chases it - lazily off idle, where it has to get the air moving (~3 s idle to
    // full), quicker coming down. Thrust climbs steeply with the spool (~3 % of full at idle, which the brakes hold) and
    // falls off a little as the air rams in faster. Floored with the spool past 96 % the afterburner lights (jet.ab more
    // thrust, a third of a second to catch). The starter spins it to ~20 % and it lights off. It drives no wheels: the cart
    // rolls free. Reverse is the cart's old 48 V motor, clutched to the back axle in R only (the turbine idles in P and R).
    // Stability control can pull the fuel back as well as brake a wheel (the thrust follows as it spools down)
    _jetEngine(h) {
      const s = this.spec, J = s.jet, inp = this.input;
      let N = this.jetN || 0;
      if (this.cranking) {
        this.crankT += h;
        if (this.crankT > 1.8 && N > 0.18) { this.cranking = false; this.running = true; }
        else if (this.crankT > 5) this.cranking = false;
      }
      this.stalled = false; this.fuelCut = false; this.boost = 0; this.nosActive = false;
      const cmd = this.running && this.gear > 0 && !this.park ? clamp(inp.throttle, 0, 1) * this.escCut : 0;
      const tgt = this.cranking ? 0.22 : this.running ? J.idle + (1 - J.idle) * cmd : 0;
      const e = tgt - N, rate = e > 0 ? (this.running ? 0.05 + 0.42 * N * N : 0.14) : this.running ? 0.5 : 0.09;
      N += clamp(e * 5 * h, -rate * h, rate * h);
      this.jetN = N;
      const x = Math.pow(clamp((N - 0.2) / 0.8, 0, 1.05), 2.2);
      // (not while it's held on the brakes at the line: a big tune's afterburner out-pushes any tyres - it lights on the release)
      const abOn = this.running && cmd > 0.97 && N > 0.96 && !this.launchHold ? 1 : 0, ab0 = this.jetAB || 0;
      this.jetAB = ab0 + (abOn - ab0) * Math.min(1, h / (abOn ? 0.35 : 0.1));
      this.jetF = J.thrust * (s.torqueScale || 1) * x * (1 + J.ab * this.jetAB) * Math.max(0.5, 1 - J.ram * Math.max(0, this.forwardSpeed));
      this.thrEff = clamp(x, 0, 1);
      if (this.gear < 0 && !this.park && this.running) {
        const t = clamp(inp.throttle, 0, 1) * clamp((J.revRpm - Math.abs(this.eOmega) * RAD2RPM) / 250, 0, 1);
        this.Te = t * J.revTq - 0.4 * Math.tanh(this.eOmega / 4);
      } else { this.Te = 0; this.eOmega = 0; }
    }

    // ------------------------------------------------------------------ driveline
    _coupling(slip) {
      // returns 0 none, 1 fluid (torque converter), 2 friction (clutch / lockup) with this._cap
      // (slip: engine speed minus the clutch's output side, rad/s)
      const s = this.spec;
      if (this.gear === 0 || this.park || this.revHoldActive || this.launchHold) return 0;
      if (s.jet && this.gear > 0) return 0;                  // (the jet cart: nothing drives the wheels going forwards)
      if (s.dragClutch) { this._cap = this._dcCap(slip || 0); return this._cap > 1 ? 2 : 0; }
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
    // muSlip (kart clutches): the linings grip harder the faster they slide (the rising friction curve clutch materials
    // are made with, so they don't judder). Pulling away, the big slip holds the engine a little lower; as the kart
    // catches up the grip eases and the revs climb into the lock-up - not one flat note all the way
    _dcCap(slip) {
      const c = this.spec.dragClutch, we = this.eOmega;
      const e = clamp((we * RAD2RPM - c.rpm0) / (c.rpm1 - c.rpm0), 0, 1);
      let cap = e * e * (3 - 2 * e) * (curveAt(c.base, this.dcT) + c.kc * we * we);
      if (c.muSlip) cap *= 1 + c.muSlip * Math.tanh(Math.abs(slip) / c.slipRef);
      if (this.gear < 0) cap = Math.min(cap, c.rev || 400);          // backing up on the reverser: just a nudge
      // (engineTc: traction control is the engine ECU's - it trims the torque and leaves the clutch alone. Backing the
      // clutch off too bogged the supercharged kart down at 5,000 rpm, below the blower's boost)
      return this.spec.engineTc ? cap : cap * this.tcCut;
    }

    _transLogic(h, wc) {
      const s = this.spec, inp = this.input;
      this.revHoldActive = !!inp.revHold;
      const standing = Math.abs(this.forwardSpeed) < 2.5;
      if (inp.handbrake > 0.5 && this.gear !== 0 && !this.park && (this.launchHold || standing) && !s.electric) this.launchHold = true;
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

    // tracked (the tank): each track is one thing - its two 'wheels' (the ends of its ground contact) turn together. The
    // engine drives both tracks through the transmission and an open differential, as a car's axle; the steering unit
    // (hydrostatic, off the engine) pushes the tracks apart in speed - the steer input asks for a difference, tracks.dv
    // m/s at a crawl, fading to dvMin of it by vFade - so it turns by driving one track faster than the other, and pivots
    // in place (the tracks counter-rotate) with no drive at all. Backing up it steers the way a car does
    _drivelineTracks(h) {
      const s = this.spec, W = this.wheels, T = s.tracks, inp = this.input;
      const road = (w) => -w.fx * w.radius + (w.contact ? w.rrT : 0);
      const v = this.forwardSpeed, r = W[2].radius, dir = this.gear < 0 || v < -0.5 ? -1 : 1;
      const dvMax = T.dv * clamp(1 - Math.abs(v) / T.vFade, T.dvMin, 1);
      const want = dir * clamp(inp.steer || 0, -1, 1) * dvMax / r;         // (left minus right, rad/s: + turns right)
      const Tst = this.running ? clamp(T.kp * (want - (W[2].omega - W[3].omega)), -T.tMax, T.tMax) : 0;
      this.trackSteerT = Tst;
      this._driveline(h, road(W[2]) + road(W[0]) + Tst, road(W[3]) + road(W[1]) - Tst, W[2].brakeT + W[0].brakeT, W[3].brakeT + W[1].brakeT);
      W[0].omega = W[2].omega; W[1].omega = W[3].omega;
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
      const mode = this._coupling(this.eOmega - wc0 * G);
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
      // (an electric motor turns backwards with its wheels - rolling back in D, a wheel dragged backwards by the tyre -
      // and pushes against it; pinning it at 0 while the wheels ran backwards locked the driveline in a tug of war)
      if (this.eOmega < 0 && !s.electric && !s.jet) this.eOmega = 0;   // (a jet cart's reverse is an electric motor: it turns either way)
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
      // (fwd: front-wheel drive through this driveline - all of it to the fronts, the rears on no diff at all)
      const lkR = s.fwd ? 0 : s.lsdPreload + lt, lkF = (s.lsdPreloadF || s.lsdPreload) + lt, lkC = s.fwd ? 0 : (s.centerPreload || 2 * s.lsdPreload) + 2 * lt;
      const tR = -lkR * Math.tanh((W[2].omega - W[3].omega) / 2.5), tF = -lkF * Math.tanh((W[0].omega - W[1].omega) / 2.5);
      const tC = -lkC * Math.tanh((W[0].omega + W[1].omega - W[2].omega - W[3].omega) / 5);
      Ti[0] = tF + tC / 2; Ti[1] = -tF + tC / 2; Ti[2] = tR - tC / 2; Ti[3] = -tR - tC / 2;
      // (awdFront: the front axle's share of the drive - a rear-biased road-car system sends most of it to the back
      // and lets the centre coupling pass more forward when the rears slip)
      const fF = s.awdFront !== undefined ? s.awdFront : 0.5, SH = this._sh4 || (this._sh4 = [0, 0, 0, 0]);
      SH[0] = SH[1] = fF / 2; SH[2] = SH[3] = (1 - fF) / 2;
      const mode = this._coupling(this.eOmega - wc0 * G);
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
        for (let i = 0; i < 4; i++) W[i].omega += h * (SH[i] * Tin + Ti[i] + T[i]) / W[i].inertia;
        this.lastTin = Tin;
      } else {
        const cap = this._cap, Itot = Isum + Ie * G * G;
        if (this.locked) {
          const wcDot = (G * eff * (Te - Ie * wc0 * Gdot) + Tsum) / Itot;
          const Treq = Te - Ie * G * wcDot - Ie * wc0 * Gdot;
          if (Math.abs(Treq) > cap) this.locked = false;
          else {
            const Tl = s.awdFront !== undefined ? G * eff * Treq : 0;     // (the locked carrier shares by inertia; re-split it)
            for (let i = 0; i < 4; i++) W[i].omega += h * wcDot + h * (T[i] + Ti[i] - W[i].inertia * Tsum / Isum + (Tl ? (SH[i] - W[i].inertia / Isum) * Tl : 0)) / W[i].inertia;
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
          for (let i = 0; i < 4; i++) { W[i].omega += h * (SH[i] * Tin + Ti[i] + T[i]) / W[i].inertia; wc1 += W[i].inertia * W[i].omega; }
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
      if (this.locked && G !== 0 && s.awdFront !== undefined) {
        // (a road car's diffs, awdFront: each brake works on its own wheel - only the part common to all four, and the
        // parking pawl, goes through the driveline with the engine on it. Pooled, the stability control's brake on one
        // front wheel braked all four and spun the car it was trying to straighten)
        let bMin = Infinity, wc = 0;
        for (let i = 0; i < 4; i++) { bMin = Math.min(bMin, W[i].brakeT); wc += W[i].inertia * W[i].omega; }
        wc /= Isum;
        const wcB = brakeClamp(wc, 4 * (bMin + pk), Isum + Ie * G * G, h);
        let wm = 0;
        for (let i = 0; i < 4; i++) { W[i].omega = brakeClamp(W[i].omega + wcB - wc, W[i].brakeT - bMin, W[i].inertia, h); wm += W[i].inertia * W[i].omega; }
        this.eOmega = wm / Isum * G;
      } else if (this.locked && G !== 0) {
        let wc = 0, Tb = 0;
        for (let i = 0; i < 4; i++) { wc += W[i].inertia * W[i].omega; Tb += W[i].brakeT + pk; }
        wc /= Isum;
        const wcB = brakeClamp(wc, Tb, Isum + Ie * G * G, h);
        for (let i = 0; i < 4; i++) W[i].omega += wcB - wc;
        this.eOmega = wcB * G;
      } else for (let i = 0; i < 4; i++) W[i].omega = brakeClamp(W[i].omega, W[i].brakeT + pk, W[i].inertia, h);
      // (an electric motor turns backwards with its wheels - rolling back in D, a wheel dragged backwards by the tyre -
      // and pushes against it; pinning it at 0 while the wheels ran backwards locked the driveline in a tug of war)
      if (this.eOmega < 0 && !s.electric && !s.jet) this.eOmega = 0;   // (a jet cart's reverse is an electric motor: it turns either way)
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
    // online play: a bump another player's game worked out - world impulse (jx, 0, jz) at the world point (cx, cz)
    pushAt(jx, jz, cx, cz) {
      const { qx, qy, qz, qw } = this;
      this._applyImpulse(jx, jz, cx - this.px, 0, cz - this.pz, 1 - 2 * (qy * qy + qz * qz), 2 * (qx * qz - qy * qw), 2 * (qx * qz + qy * qw), 1 - 2 * (qx * qx + qy * qy));
      const dv = Math.hypot(jx, jz) / this.spec.mass;
      if (dv > this.events.impact) { this.events.impact = dv; this.events.impactX = cx; this.events.impactZ = cz; }
    }
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

    _resolveContact(nx, nz, pen, cx, cz, m00, m20, m02, m22, ob) {
      // n points from the car towards the obstacle (horizontal). contact point (cx, cz) at bumper height
      // (ob with vx / vz / m: another car - online play - moving, with its own mass: the impulse is worked out on the speed
      // between the two, shared by their masses, and each car only pushes itself out of half the overlap; the other
      // player's game does the other half)
      const s = this.spec, mv = ob && ob.m;
      const rx = cx - this.px, ry = 0.0, rz = cz - this.pz;
      const cvx = this.vx + (this.wy * rz - this.wz * ry) - (mv ? ob.vx : 0), cvz = this.vz + (this.wx * ry - this.wy * rx) - (mv ? ob.vz : 0);
      const vn = cvx * nx + cvz * nz;
      // positional correction
      this.px -= nx * pen * (mv ? 0.45 : 0.9); this.pz -= nz * pen * (mv ? 0.45 : 0.9);
      if (vn <= 0) return;
      // effective mass (yaw dominated). The impulse turns the body about the world's vertical, and that's its yaw axis
      // only while it's upright: on its side or its roof the same push turns it about its roll or pitch axis, and
      // counting on the (bigger) yaw inertia there made every wall contact hand back more spin than it took - a truck
      // tumbling against the arena wall spun itself up to 80 rad/s and was flung away at 300 mph
      const m10 = 2 * (this.qx * this.qy + this.qz * this.qw), m11 = 1 - 2 * (this.qx * this.qx + this.qz * this.qz), m12 = 2 * (this.qy * this.qz - this.qx * this.qw);
      const iIy = m10 * m10 / s.Ipitch + m11 * m11 / s.Iyaw + m12 * m12 / s.Iroll;
      const rxn = rx * nz - rz * nx;
      const k = 1 / s.mass + rxn * rxn * iIy + (mv ? 1 / ob.m : 0);
      const j = (1 + 0.15) * vn / k;
      let jx = -nx * j, jz = -nz * j;
      // friction along tangent
      const tx = -nz, tz = nx;
      const vt = cvx * tx + cvz * tz;
      const rxt = rx * tz - rz * tx;
      const kt = 1 / s.mass + rxt * rxt * iIy + (mv ? 1 / ob.m : 0);
      // (ob.mu: a slippery obstacle - online play's invisible walls, which you slide along instead of grinding to a stop)
      const mu = ob && ob.mu !== undefined ? ob.mu : 0.45, jt = clamp(-vt / kt, -mu * j, mu * j);
      jx += tx * jt; jz += tz * jt;
      this._applyImpulse(jx, jz, rx, ry, rz, m00, m20, m02, m22);
      // (another player's car: the impulse is kept on it, for the game to send them their share - and from here on it's
      // taken to be moving off with that share, so the next steps don't hit it again for the same bump)
      if (mv) { ob.jx = (ob.jx || 0) + jx; ob.jz = (ob.jz || 0) + jz; ob.cx = cx; ob.cz = cz; ob.vx -= jx / ob.m; ob.vz -= jz / ob.m; }
      const dv = j / s.mass;
      if (dv > this.events.impact) { this.events.impact = dv; this.events.impactX = cx; this.events.impactZ = cz; }
      // big hits stall/damage nothing, but they do upset the chassis a little
      if (dv > 6) { this.wx += (Math.random() - 0.5) * 0.3; this.wz += (Math.random() - 0.5) * 0.3; }
    }

    // our footprint (centre cx, cz; right rX, rZ; back bX, bZ; half sizes hw, hl) against another car's box: the axis of
    // least overlap of the four is the contact normal (from us towards it); the contact point is midway between the two
    // boxes' nearest points along it - the middle of a face when a face meets it square (no made-up spin from a corner)
    _carBox(b, cx, cz, rX, rZ, bX, bZ, hw, hl, m00, m20, m02, m22) {
      const dx = b.x - cx, dz = b.z - cz, ux = b.c, uz = -b.s, wx = b.s, wz = b.c;
      const AX = [rX, bX, ux, wx], AZ = [rZ, bZ, uz, wz];
      let best = 1e9, nx = 0, nz = 0;
      for (let k = 0; k < 4; k++) {
        const ax = AX[k], az = AZ[k];
        const ra = hw * Math.abs(rX * ax + rZ * az) + hl * Math.abs(bX * ax + bZ * az);
        const rb = b.hx * Math.abs(ux * ax + uz * az) + b.hz * Math.abs(wx * ax + wz * az);
        const d = dx * ax + dz * az, o = ra + rb - Math.abs(d);
        if (o <= 0) return;
        if (o < best) { best = o; const sg = d >= 0 ? 1 : -1; nx = ax * sg; nz = az * sg; }
      }
      const pick = (v) => (Math.abs(v) < 0.25 ? 0 : Math.sign(v));
      const r1 = pick(rX * nx + rZ * nz), b1 = pick(bX * nx + bZ * nz), u2 = pick(-(ux * nx + uz * nz)), w2 = pick(-(wx * nx + wz * nz));
      const px = 0.5 * (cx + r1 * hw * rX + b1 * hl * bX + b.x + u2 * b.hx * ux + w2 * b.hz * wx);
      const pz = 0.5 * (cz + r1 * hw * rZ + b1 * hl * bZ + b.z + u2 * b.hx * uz + w2 * b.hz * wz);
      this._resolveContact(nx, nz, Math.min(best, 0.5), px, pz, m00, m20, m02, m22, b);
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
        // (another player's car: two boxes the same size meet corner-on-edge, and the corner test read a rear-end hit as a
        // sliver of sideways overlap - the hit car never moved. Separating axes instead: the real direction and depth)
        if (b.m) { this._carBox(b, cx, cz, rX, rZ, bX, bZ, hw, hl, m00, m20, m02, m22); continue; }
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
        if (best) this._resolveContact(best[0], best[1], Math.min(best[2], 0.5), best[3], best[4], m00, m20, m02, m22, b);
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
  // the AVENGER: the same stadium truck underneath - chassis, engine, axles, tyres, every number - under its own body
  CARS.avenger = Object.assign({}, CARS.monster, { car: 'AVENGER', spec: Object.assign(JSON.parse(JSON.stringify(CARS.monster.spec)), { name: 'Monster Truck "AVENGER"' }) });
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
    // traction control (not on a real kart - a game aid): slip from the rear axle's mean speed against the chassis' speed.
    // The steered fronts scrub and slide on grass and read slow, and the outside rear always reads fast in a turn -
    // measured against those it saw wheelspin in every corner and cut the power to nothing
    tcRefBody: true, tcAxleMean: true,
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
      idleRpm: 1500, limiterRpm: 4200, redlineRpm: 3800, governorRpm: 3900, governorBand: 350, engineInertia: 0.03, fricA: 1.2, fricB: 0.8, starterTorque: 8,
      torqueCurve: [[0, 12], [1000, 16], [1500, 17.5], [2000, 18.8], [2500, 19.5], [3000, 19.3], [3500, 18.5], [3800, 17.8], [4000, 16], [4500, 10]],
      autoRatios: [1.0], autoRev: 1.0, autoFinal: 4.0, launchRpm: 2600,
      dragClutch: { rpm0: 1800, rpm1: 2600, kc: 0.0005, rev: 20, base: [[0, 25]], muSlip: 0.3, slipRef: 90 },
      CdA: 0.55, bodyPts: kartPts(0.33, 0.42),
    } },
    // TaG 125 (IAME X30-type): a water-cooled 125 cc 2-stroke single, ~30 hp at ~14,000, 16,000 rpm limiter, touch-and-go
    // electric start, centrifugal clutch straight to the axle sprocket, rear brakes only, 158 kg with the driver. ~75 mph
    tag: { name: 'TaG 125 Kart', short: 'TaG 125', car: 'X30', hp: 30, tq: 14.4, spec: {
      mass: 158, Ipitch: 28, Iyaw: 36, Iroll: 12, cgHeight: 0.3, wheelbase: 1.04, frontWeight: 0.42,
      trackF: 1.12, trackR: 1.38, wheelRadius: 0.14, wheelRadiusF: 0.127, wheelRadiusR: 0.14, wheelInertiaF: 0.02, wheelInertiaR: 0.05,
      frontTire: 'kartF', rearTire: 'kartR', brakeTorqueF: 0, brakeTorqueR: 180,
      idleRpm: 2800, limiterRpm: 16000, redlineRpm: 15500, engineInertia: 0.006, fricA: 0.8, fricB: 0.25, starterTorque: 4,
      // (IAME: 30 hp, 19.5 Nm peak - the pipe comes on hard from ~9,000)
      torqueCurve: [[0, 2], [4000, 5], [6000, 7.6], [8000, 10.4], [9500, 13.0], [10500, 14.3], [11500, 13.6], [12500, 12.5], [13500, 11.5],
        [14500, 10.3], [15500, 8.9], [16500, 7.1], [17500, 4]],
      autoRatios: [1.0], autoRev: 1.0, autoFinal: 7.0, launchRpm: 6000,
      // (the centrifugal clutch must start to move the kart by 4,000 rpm and be fully in at 6,000 - IAME's rules - so it
      // pulls away down around 5-6,000, off the pipe, and the revs climb with the speed from ~25 mph)
      dragClutch: { rpm0: 3800, rpm1: 6000, kc: 0.000022, rev: 6, base: [[0, 2]], muSlip: 0.2, slipRef: 220 },
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
      dragClutch: { rpm0: 6000, rpm1: 9000, kc: 0.00003, rev: 10, base: [[0, 14]], muSlip: 0.25, slipRef: 220 },
      CdA: 0.45, bodyPts: kartPts(0.3, 0.42),
    } },
    // Supercharged: a 998 cc supercharged superbike four (H2-type: a centrifugal blower spun ~9x crank, up to ~2.4 bar
    // absolute) behind the seat of a stretched sprint chassis, the bike's 6-speed dog box on a quickshifter, a chain to
    // the axle, big brakes all round. ~200 hp without the bike's ram air, 245 kg with the driver: it's traction-limited
    // in the first three gears. Geared for ~135 mph (14,000 rpm in top)
    sc: { name: 'Supercharged Kart', short: 'Supercharged', car: 'H2 998', hp: 200, tq: 100, spec: {
      mass: 245, Ipitch: 52, Iyaw: 64, Iroll: 16, cgHeight: 0.3, wheelbase: 1.25, frontWeight: 0.42,
      trackF: 1.18, trackR: 1.42, wheelRadius: 0.14, wheelRadiusF: 0.127, wheelRadiusR: 0.14, wheelInertiaF: 0.022, wheelInertiaR: 0.055,
      frontTire: 'kartF', rearTire: 'kartR', brakeTorqueF: 170, brakeTorqueR: 230,
      idleRpm: 1200, limiterRpm: 14000, redlineRpm: 13600, shiftRpm: 13400, engineInertia: 0.03, fricA: 3, fricB: 1.6, starterTorque: 25,
      // (lb-ft: 100 lb-ft / 136 Nm at 10,500, ~200 hp from 10,500 to 12,500 - the blower keeps it pulling to the limiter)
      torqueCurve: [[0, 30], [2000, 40], [4000, 52], [6000, 70], [8000, 87], [9500, 97], [10500, 100], [11500, 92], [12500, 82],
        [13500, 72], [14500, 60], [15500, 40]],
      boostMax: 20, centrifugal: true, engineTc: true, thrExp: 1.3,
      // (the bike's gearbox and 1.551 primary, then a 1.61 chain: 2.5 overall before the box)
      autoRatios: [3.188, 2.526, 2.045, 1.727, 1.524, 1.36], autoRev: 3.188, autoFinal: 2.5, shiftTimeWOT: 0.05, shiftTimePart: 0.09, shiftCutDepth: 0.4,
      launchRpm: 7000,
      // (the bike's wet clutch, worked by an automatic clutch: it bites from 3,500 and holds 136 Nm from ~6,000)
      dragClutch: { rpm0: 3500, rpm1: 6500, kc: 0.00025, rev: 30, base: [[0, 60]], muSlip: 0.25, slipRef: 220 },
      // (the engine sits low, tight behind the seat on a superkart-length 1.25 m wheelbase, and the driver well forward:
      // 42 % on the front. Even so 200 hp pulls ~1.5 g, close to where the front lifts, so like the drag karts it has
      // a short wheelie bar with two small wheels behind the axle to catch it)
      wheelieBar: { len: 0.72, clr: 0.065, halfW: 0.24, r: 0.03, k: 150000, damp: 3500, Fmax: 6000 },
      CdA: 0.5, bodyRear: 1.02,
    } },
  };
  // (the supercharged kart's longer frame and the engine hanging out behind the seat)
  CARS.kart.classes.sc.spec.bodyPts = kartPts(0.3, 0.42).concat([[-0.32, 0.22 - 0.3, 1.02 - 0.08], [0.32, 0.22 - 0.3, 1.02 - 0.08], [0, 0.66 - 0.3, 0.62 - 0.08]]);
  CARS.kart.make = function (key) {
    const k = key in CARS.kart.classes ? key : 'tag', c = CARS.kart.classes[k];
    return { name: c.name, short: c.short, cls: k, car: c.car, hp: c.hp, tq: c.tq,
      spec: Object.assign({}, CARS.kart.spec, c.spec, { name: c.name + ' "' + c.car + '"' }) };
  };
  // Racing lawn mowers (USLMRA-type classes): blades out, a cutting deck still hung underneath, the driver on a real mower
  // seat. The race classes have no suspension - the soft tyres and the seat are it. (A lawn tractor's front axle pivots on
  // a centre pin; modelled free, all the roll resistance sat at the back, the inside rear lifted at ~0.6 g and it spun
  // in every corner - it's taken as shimmed solid, as racers do.) High seats and narrow tracks: push too hard and they tip.
  // CARS.mower.make(key): a B-Prepared racing lawn tractor, a Factory Experimental single, a land-speed record mower.
  const mowerPts = (cg, fw, wb, pts) => pts.map(([x, y, z]) => [x, y - cg, z + wb * (fw - 0.5)]);
  const mowerBox = (pts) => [-1, 1].map((sx) => pts.map(([x, y, z]) => [sx * x, y, z])).flat();
  CARS.mower = { name: 'Racing Mower', short: 'Mower', more: true, spec: {
    name: 'Racing Mower', Fz0: 900, loadSens: 0.1,
    noABS: true, noESC: true, noLockup: true, noCoastBlip: true, blipMax: 0.2, boostMax: 0, rearToe: 0,
    dampKnee: 0.3, bumpStopK: 400000, fzMax: 30000, handbrakeTorque: 150,
    // (traction control is a game aid here: slip from the solid rear axle's mean speed against the body's)
    tcRefBody: true, tcAxleMean: true,
    bodyK: 80000, bodyC: 4000, bodyMu: 0.5,
  } };
  CARS.mower.classes = {
    // B-Prepared: a full-size garden tractor on its stamped-steel frame and factory body, the deck hung empty underneath,
    // an 810 cc OHV V-twin built inside (cams, billet flywheel, big carb, open pipes: ~38 hp where it made 20), the
    // mower's own 5-speed transaxle (and its diff) re-geared through bigger pulleys, a foot clutch (worked for you),
    // motorcycle discs on the rear axle (and small ones up front - rear-only it stopped at 0.37 g), turf tyres. 265 kg
    // with the driver; ~80 mph flat out
    bp: { name: 'B-Prepared Racing Mower', short: 'B-Prepared', car: 'BP 810', hp: 38, tq: 36, spec: {
      mass: 265, Ipitch: 80, Iyaw: 92, Iroll: 32, cgHeight: 0.42, wheelbase: 1.22, frontWeight: 0.44,
      trackF: 0.82, trackR: 0.78, wheelRadius: 0.254, wheelRadiusF: 0.19, wheelRadiusR: 0.254, wheelInertiaF: 0.08, wheelInertiaR: 0.25,
      frontTire: 'mowerTurfF', rearTire: 'mowerTurfR', brakeTorqueF: 70, brakeTorqueR: 150,
      springF: 38000, springR: 48000, dampBumpF: 700, dampRebF: 700, dampBumpR: 900, dampRebR: 900,
      arbF: 0, arbR: 0, travelUp: 0.035, travelDown: 0.02, suspS0: 0.05,
      maxSteer: 0.62, steerRate: 3.5, steerRatio: 9, ackermann: 0.6,
      lsdPreload: 15, lsdRamp: 0.1, driveEff: 0.85,
      idleRpm: 1400, limiterRpm: 6800, redlineRpm: 6500, shiftRpm: 6400, engineInertia: 0.06, fricA: 1.5, fricB: 0.9, starterTorque: 10,
      torqueCurve: [[0, 14], [1500, 22], [2500, 28], [3500, 33], [4500, 36], [5500, 35], [6000, 33], [6500, 30], [7000, 25], [7500, 18]],
      autoRatios: [3.0, 2.0, 1.5, 1.2, 1.0], autoRev: 3.0, autoFinal: 4.9, shiftTimeWOT: 0.3, shiftTimePart: 0.4, shiftCutDepth: 0.2,
      launchRpm: 3200,
      dragClutch: { rpm0: 1900, rpm1: 3200, kc: 0.00045, rev: 12, base: [[0, 20]], muSlip: 0.2, slipRef: 150 },
      CdA: 0.75,
      bodyHalfW: 0.52, bodyFront: -1.07, bodyRear: 0.78, bodyBottom: -0.34, bodyTop: 1.03,
      bodyPts: mowerPts(0.42, 0.44, 1.22, mowerBox([[0.35, 0.28, -1.0], [0.3, 0.62, -0.95], [0.3, 0.72, -0.35], [0.52, 0.12, -0.45], [0.52, 0.12, 0.25],
        [0.5, 0.6, 0.6], [0.35, 0.3, 0.85], [0.25, 1.2, 0.3]]).concat([[0, 0.95, 0.45], [0, 0.95, -0.35], [0, 1.45, 0.25]])),
    } },
    // Factory Experimental (single): a hand-built tube chassis under a lawn tractor's hood and fenders, the deck a shell, a
    // 459 cc OHV single built to the limit on pump gas (~34 hp at 7,400), a centrifugal clutch, a 3-speed box and a chain
    // to a solid axle, go-kart dirt tyres, a pinned front axle, hydraulic brakes all round. 205 kg (the 450 lb minimum)
    // with the driver; ~88 mph
    fx: { name: 'FX Racing Mower', short: 'FX single', car: 'FXS 459', hp: 34, tq: 26.5, spec: {
      mass: 205, Ipitch: 55, Iyaw: 66, Iroll: 20, cgHeight: 0.36, wheelbase: 1.22, frontWeight: 0.42,
      trackF: 0.86, trackR: 0.82, wheelRadius: 0.165, wheelRadiusF: 0.14, wheelRadiusR: 0.165, wheelInertiaF: 0.03, wheelInertiaR: 0.07,
      frontTire: 'mowerDirtF', rearTire: 'mowerDirtR', brakeTorqueF: 110, brakeTorqueR: 160,
      springF: 50000, springR: 60000, dampBumpF: 650, dampRebF: 650, dampBumpR: 850, dampRebR: 850,
      arbF: 0, arbR: 0, travelUp: 0.02, travelDown: 0.015, suspS0: 0.05,
      maxSteer: 0.5, steerRate: 4, steerRatio: 7, ackermann: 0.6,
      lsdPreload: 8, lsdRamp: 0.02, driveEff: 0.92,
      idleRpm: 1600, limiterRpm: 8000, redlineRpm: 7700, shiftRpm: 7700, engineInertia: 0.035, fricA: 1.0, fricB: 0.5, starterTorque: 6,
      torqueCurve: [[0, 10], [2000, 16], [3000, 20], [4000, 23.5], [5000, 25.8], [6000, 26.5], [7000, 25], [7400, 24], [8000, 20], [8500, 14]],
      autoRatios: [2.1, 1.45, 1.0], autoRev: 2.1, autoFinal: 3.44, shiftTimeWOT: 0.12, shiftTimePart: 0.2, shiftCutDepth: 0.3,
      launchRpm: 4200,
      dragClutch: { rpm0: 2800, rpm1: 4200, kc: 0.00023, rev: 10, base: [[0, 10]], muSlip: 0.2, slipRef: 180 },
      CdA: 0.55,
      bodyHalfW: 0.5, bodyFront: -1.0, bodyRear: 0.8, bodyBottom: -0.3, bodyTop: 0.98,
      bodyPts: mowerPts(0.36, 0.42, 1.22, mowerBox([[0.32, 0.22, -0.98], [0.28, 0.52, -0.9], [0.28, 0.6, -0.35], [0.5, 0.1, -0.4], [0.5, 0.1, 0.25],
        [0.48, 0.45, 0.6], [0.35, 0.22, 0.85], [0.24, 1.08, 0.3]]).concat([[0, 0.8, 0.45], [0, 0.85, -0.3], [0, 1.33, 0.25]])),
    } },
    // Land-speed record mower (built like the 150 mph record holders): a lawn tractor's body in carbon over a T45 steel
    // tube frame, a 999 cc superbike four (~189 hp at 13,000, 116 Nm) with its 6-speed and a quickshifter on paddles,
    // 18x7.5-10 racing slicks, short-travel suspension, big discs all round. ~140 kg + the rider; 0-100 mph in ~6.3 s
    // (the record), ~150 mph
    rec: { name: 'Land-Speed Record Mower', short: 'Record', car: '1000 SUPERBIKE', hp: 189, tq: 85.6, spec: {
      mass: 225, Ipitch: 75, Iyaw: 95, Iroll: 26, cgHeight: 0.42, wheelbase: 1.38, frontWeight: 0.42,
      trackF: 1.12, trackR: 1.16, wheelRadius: 0.229, wheelRadiusF: 0.229, wheelRadiusR: 0.229, wheelInertiaF: 0.12, wheelInertiaR: 0.14,
      frontTire: 'mowerSlickF', rearTire: 'mowerSlickR', brakeTorqueF: 260, brakeTorqueR: 260,
      springF: 30000, springR: 36000, dampBumpF: 1400, dampRebF: 1800, dampBumpR: 1700, dampRebR: 2200,
      arbF: 3000, arbR: 2000, travelUp: 0.05, travelDown: 0.04, suspS0: 0.1,
      maxSteer: 0.42, steerRate: 3, steerRatio: 10, ackermann: 0.5,
      lsdPreload: 20, lsdRamp: 0.1, driveEff: 0.9,
      idleRpm: 1300, limiterRpm: 13400, redlineRpm: 13000, shiftRpm: 12900, engineInertia: 0.03, fricA: 3, fricB: 1.6, starterTorque: 25,
      torqueCurve: [[0, 25], [3000, 45], [5000, 58], [7000, 68], [9000, 78], [11000, 85.6], [12000, 82], [13000, 76.5], [13500, 72], [14000, 64],
        [15000, 40]],
      // (the bike's 6-speed through its 1.717 primary and the chain: 3.98 overall before the box - ~79 mph in 1st, ~150 in 6th)
      autoRatios: [2.286, 1.778, 1.5, 1.333, 1.214, 1.138], autoRev: 2.286, autoFinal: 3.98, shiftTimeWOT: 0.05, shiftTimePart: 0.09, shiftCutDepth: 0.4,
      launchRpm: 7000, engineTc: true, thrExp: 1.3,
      dragClutch: { rpm0: 3500, rpm1: 7000, kc: 0.00012, rev: 30, base: [[0, 50]], muSlip: 0.25, slipRef: 220 },
      CdA: 0.58,
      bodyHalfW: 0.66, bodyFront: -1.4, bodyRear: 1.2, bodyBottom: -0.34, bodyTop: 1.0,
      bodyPts: mowerPts(0.42, 0.42, 1.38, mowerBox([[0.4, 0.2, -1.3], [0.36, 0.6, -1.2], [0.36, 0.72, -0.45], [0.62, 0.12, -0.5], [0.62, 0.12, 0.35],
        [0.62, 0.55, 0.7], [0.45, 0.3, 1.25], [0.25, 1.15, 0.35]]).concat([[0, 0.95, 0.5], [0, 0.95, -0.4], [0, 1.42, 0.3]])),
    } },
  };
  CARS.mower.make = function (key) {
    const k = key in CARS.mower.classes ? key : 'bp', c = CARS.mower.classes[k];
    return { name: c.name, short: c.short, cls: k, car: c.car, hp: c.hp, tq: c.tq,
      spec: Object.assign({}, CARS.mower.spec, c.spec, { name: c.name + ' "' + c.car + '"' }) };
  };
  // ------------------------------------------------------------------ Car Crushers 2 cars
  // Nine vehicles from the Roblox game Car Crushers 2, each built the way it would have to be for real to do what it does
  // in the game (its top speed and weight there) and left to the real physics: the couch is twitchy, the scooter and
  // the porta potty tip over in a turn, the Blue Bird needs miles to reach 300 mph. Plain CARS entries (cc: true) - the
  // game lists them with the Challengers. (ccPts: model space - ground under the wheelbase centre, forward -z - to CG frame)
  const ccPts = (cg, fw, wb, pts) => pts.map(([x, y, z]) => [x, y - cg, z + wb * (fw - 0.5)]);
  // a box's corners and mid-edges (both sides), for the body / roll-over contacts
  const ccBox = (hw, y0, y1, z0, z1) => [-1, 1].map((sx) => [[hw, y0, z0], [hw, y0, z1], [hw, y1, z0], [hw, y1, z1], [hw, y0, (z0 + z1) / 2], [hw, y1, (z0 + z1) / 2],
    [hw, (y0 + y1) / 2, z0], [hw, (y0 + y1) / 2, z1]].map(([x, y, z]) => [sx * x, y, z])).flat();
  // (an electric motor: always coupled, whichever way it turns - it used to let go below 0 rpm, so a car rolling back
  // at all, off a bump or on a slope, had its motor disconnected: it couldn't drive forwards again, only creep back)
  const EV_CLUTCH = { rpm0: -1e6, rpm1: -1e6 + 1, kc: 0, base: [[0, 6000]], rev: 6000 };
  // an electric motor's torque curve: constant torque to its base speed, constant power past it (lb-ft)
  const evCurve = (Nm, kW, maxRpm) => {
    const base = kW * 1000 / Nm * 30 / Math.PI, c = [[0, Nm / LBFT], [base, Nm / LBFT]];
    for (let r = Math.ceil(base / 1000) * 1000; r <= maxRpm + 1000; r += 1000) if (r > base) c.push([r, kW * 1000 / (r * Math.PI / 30) / LBFT]);
    return c;
  };
  // Couch Car: a three-seat leather sofa on a hidden tube chassis, four 13 in wheels tucked under it, a 1.6 L turbo triple
  // built like a drag engine (~850 hp on 40 psi and E85) under the seat with its three pipes out of the right arm, a
  // sequential 5-speed with a quickshifter and a locked diff. ~190 mph (the game's figure) is where 850 hp runs out
  // against a sofa's drag - which at that speed is over its own weight: the game's 300 kg couch could never push it
  // (its rear tyres just spin at ~150); with the engine, frame and driver it's 520 kg. On a 1.3 m wheelbase it is as
  // twitchy as it sounds
  CARS.couch = { name: 'Couch Car', short: 'Couch Car', car: '1.6 TURBO TRIPLE', hp: 850, tq: 600, cc: true, kbLat: 9, spec: {
    name: 'Couch Car',
    mass: 520, Ipitch: 75, Iyaw: 160, Iroll: 135, cgHeight: 0.38, wheelbase: 1.3, frontWeight: 0.5,
    trackF: 1.6, trackR: 1.6, wheelRadius: 0.254, wheelInertiaF: 0.3, wheelInertiaR: 0.4,
    frontTire: 'couchF', rearTire: 'couchR', Fz0: 1200, loadSens: 0.1,
    springF: 45000, springR: 52000, dampBumpF: 1500, dampRebF: 2100, dampBumpR: 1700, dampRebR: 2400,
    arbF: 9000, arbR: 4500, travelUp: 0.05, travelDown: 0.05, suspS0: 0.12, rearToe: 0.002,
    brakeTorqueF: 650, brakeTorqueR: 450, handbrakeTorque: 500, noABS: true, noESC: true,
    maxSteer: 0.45, steerRate: 4.5, steerRatio: 12, ackermann: 0.6,
    idleRpm: 1000, limiterRpm: 8600, redlineRpm: 8300, shiftRpm: 8300, engineInertia: 0.1, fricA: 8, fricB: 3, starterTorque: 40,
    torqueCurve: [[0, 90], [1000, 110], [2000, 170], [3000, 300], [4000, 450], [5000, 560], [6000, 600], [7000, 595], [7800, 572], [8500, 520], [9500, 380]],
    turbo: { lag: 0.45, base: 0.3, rpm0: 2200, rpm1: 5000 }, boostMax: 40,
    autoRatios: [2.6, 1.85, 1.42, 1.15, 0.96], autoRev: 2.6, autoFinal: 2.56, shiftTimeWOT: 0.06, shiftTimePart: 0.1, shiftCutDepth: 0.6,
    launchRpm: 5500, engineTc: true, noCoastBlip: true, blipMax: 0.3, wheelieCtl: 1,
    dragClutch: { rpm0: 3000, rpm1: 5600, kc: 0, base: [[0, 1400]], muSlip: 0.2, slipRef: 200, rev: 400 },
    lsdPreload: 250, lsdRamp: 0.3, driveEff: 0.9,
    CdA: 1.18,
    bodyHalfW: 1.0, bodyFront: -0.9, bodyRear: 0.6, bodyBottom: -0.25, bodyTop: 0.55,
    bodyPts: ccPts(0.38, 0.5, 1.3, ccBox(1.0, 0.14, 0.95, -0.72, 0.45).concat([[0, 0.14, -0.1], [0, 0.95, 0.4]])),
  } };
  // Egg Rod: the Mork & Mindy egg car as a hot rod - a fibreglass egg for a cockpit, a 350 small-block (~360 hp) behind
  // it on an open frame, a TH350 3-speed automatic, posi rear, fat rear tyres on copper wheels and a big rear wing.
  // 1,450 kg; ~142 mph flat out in top
  CARS.eggrod = { name: 'Egg Rod', short: 'Egg Rod', car: '350 SMALL-BLOCK', hp: 360, tq: 390, cc: true, spec: {
    name: 'Egg Rod',
    mass: 1450, Ipitch: 1500, Iyaw: 1650, Iroll: 420, cgHeight: 0.5, wheelbase: 2.5, frontWeight: 0.42,
    trackF: 1.5, trackR: 1.56, wheelRadius: 0.35, wheelRadiusF: 0.31, wheelRadiusR: 0.35, wheelInertiaF: 1.1, wheelInertiaR: 1.8,
    frontTire: 'street', rearTire: 'street',
    springF: 38000, springR: 44000, dampBumpF: 2800, dampRebF: 4200, dampBumpR: 3200, dampRebR: 4800,
    arbF: 20000, arbR: 8000, travelUp: 0.08, travelDown: 0.1, suspS0: 0.28,
    brakeTorqueF: 1800, brakeTorqueR: 1000, handbrakeTorque: 1500, noABS: true, noESC: true,
    maxSteer: 0.55, steerRate: 4.5, steerRatio: 15,
    idleRpm: 800, limiterRpm: 6000, redlineRpm: 5800, shiftRpm: 5700, engineInertia: 0.25, fricA: 22, fricB: 14, starterTorque: 150,
    torqueCurve: [[0, 200], [1000, 280], [2000, 340], [3000, 375], [4000, 390], [4500, 388], [5000, 375], [5500, 344], [6000, 300], [6500, 240], [7000, 180]],
    boostMax: 0,
    autoRatios: [2.52, 1.52, 1.0], autoRev: 2.07, autoFinal: 2.8, tcK: 0.0068, tcStall: 2.0, noLockup: true,
    lsdPreload: 120, lsdRamp: 0.35, driveEff: 0.86,
    CdA: 0.95, wings: [{ y: 1.25, z: 1.25, ClA: 0.45, CdA: 0.12 }],
    bodyHalfW: 0.85, bodyFront: -2.15, bodyRear: 1.35, bodyBottom: -0.3, bodyTop: 0.95,
  } };
  // Banana Car: the Big Banana Car - a fibreglass banana on a 1993 Ford F-150's frame, the truck's 5.0 L V8 (185 hp) and
  // 4-speed automatic, five seats in a row. ~85 mph. And, as in the game, it floats: the sealed hull displaces its
  // weight with ~0.4 m of draft and the spinning rear tyres paddle it along (the fronts steer it like rudders)
  CARS.banana = { name: 'Banana Car', short: 'Banana Car', car: '5.0 V8 · F-150', hp: 185, tq: 270, cc: true, kbLat: 7, spec: {
    name: 'Banana Car',
    mass: 1730, Ipitch: 3600, Iyaw: 3800, Iroll: 520, cgHeight: 0.72, wheelbase: 3.0, frontWeight: 0.5,
    trackF: 1.63, trackR: 1.66, wheelRadius: 0.369, wheelInertiaF: 1.5, wheelInertiaR: 1.7,
    frontTire: 'truckAS', rearTire: 'truckAS',
    springF: 45000, springR: 52000, dampBumpF: 3200, dampRebF: 4800, dampBumpR: 3600, dampRebR: 5400,
    arbF: 15000, arbR: 4000, travelUp: 0.09, travelDown: 0.12, suspS0: 0.3,
    brakeTorqueF: 2200, brakeTorqueR: 1300, handbrakeTorque: 1800,
    maxSteer: 0.6, steerRate: 4, steerRatio: 17,
    idleRpm: 650, limiterRpm: 4700, redlineRpm: 4500, shiftRpm: 4400, engineInertia: 0.3, fricA: 20, fricB: 12, starterTorque: 150,
    torqueCurve: [[0, 170], [800, 210], [1500, 250], [2400, 270], [3000, 265], [3800, 256], [4200, 235], [4600, 205], [5000, 170]],
    boostMax: 0,
    autoRatios: [2.4, 1.47, 1.0, 0.67], autoRev: 2.0, autoFinal: 3.55, tcK: 0.008, tcStall: 2.1, lockupTorque: 600,
    lsdPreload: 20, lsdRamp: 0.1, driveEff: 0.85, govSpeed: 85 / 2.23694, govGrace: 0.5,
    CdA: 1.35,
    floats: { bottom: 0.32, depth: 0.95, len: 5.4, halfW: 0.58, fill: 0.72, paddle: 240, paddleMax: 900, rudder: 180 },
    bodyHalfW: 0.8, bodyFront: -2.9, bodyRear: 3.3, bodyBottom: -0.4, bodyTop: 0.6,
    bodyPts: ccPts(0.72, 0.5, 3.0, ccBox(0.62, 0.3, 1.3, -2.9, 2.2).concat(ccBox(0.3, 0.9, 1.8, 2.2, 3.4)).concat([[0, 1.1, -3.35], [0, 2.05, 3.55]])),
  } };
  // Blue Bird: Campbell's 1935 Campbell-Napier-Railton Blue Bird - a 36.7 L supercharged Rolls-Royce R V12 (2,350 hp at
  // 3,200 rpm, the Schneider Trophy seaplane engine), a 3-speed gearbox, twin rear wheels, Dunlop 37 x 7 tyres, ~5 t.
  // It did 301.129 mph at Bonneville on 3 September 1935 - the first car past 300. It needs miles to get there, steers
  // like a ship and stops like one (drums all round)
  CARS.bluebird = { name: 'Blue Bird', short: 'Blue Bird', car: 'ROLLS-ROYCE R V12', hp: 2350, tq: 3860, cc: true, spec: {
    name: 'Blue Bird',
    mass: 4900, Ipitch: 19000, Iyaw: 20000, Iroll: 1500, cgHeight: 0.62, wheelbase: 4.17, frontWeight: 0.5,
    trackF: 1.6, trackR: 1.55, wheelRadius: 0.47, wheelInertiaF: 6, wheelInertiaR: 12,
    frontTire: 'lsr37', rearTire: 'lsr37', Fz0: 12000,
    springF: 220000, springR: 240000, dampBumpF: 14000, dampRebF: 18000, dampBumpR: 16000, dampRebR: 20000,
    arbF: 0, arbR: 0, travelUp: 0.06, travelDown: 0.06, suspS0: 0.15, rearToe: 0,
    brakeTorqueF: 5000, brakeTorqueR: 4200, handbrakeTorque: 4000, noABS: true, noESC: true,
    maxSteer: 0.16, steerRate: 1.2, steerRatio: 30, ackermann: 0.3,
    idleRpm: 600, limiterRpm: 3450, redlineRpm: 3300, shiftRpm: 3250, engineInertia: 4.0, fricA: 150, fricB: 60, starterTorque: 1500,
    torqueCurve: [[0, 1500], [800, 2000], [1500, 2800], [2000, 3300], [2500, 3700], [2900, 3900], [3200, 3857], [3400, 3650], [3700, 3200]],
    centrifugal: true, boostMax: 18,
    autoRatios: [2.4, 1.55, 1.0], autoRev: 2.4, autoFinal: 1.17, shiftTimeWOT: 0.5, shiftTimePart: 0.6, shiftCutDepth: 0.6,
    launchRpm: 1600, noCoastBlip: true, blipMax: 0.2,
    dragClutch: { rpm0: 1300, rpm1: 2800, kc: 0, base: [[0, 7500]], muSlip: 0.15, slipRef: 60, rev: 3000 },
    lsdPreload: 400, lsdRamp: 0.2, driveEff: 0.9,
    CdA: 0.93,
    bodyHalfW: 0.8, bodyFront: -3.6, bodyRear: 4.6, bodyBottom: -0.42, bodyTop: 0.72,
    bodyPts: ccPts(0.62, 0.5, 4.17, ccBox(0.55, 0.2, 1.1, -3.9, 3.2).concat(ccBox(0.25, 0.4, 1.9, 3.2, 4.3)).concat([[0, 1.3, 0.8], [0, 0.6, -4.4]])),
  } };
  // Nissan GT-R (R35), in the Liberty Walk widebody the game's car wears: the 2017 car's VR38DETT 3.8 L twin-turbo V6
  // (565 hp at 6,800, 467 lb-ft from 3,300 to 5,800), the GR6 6-speed dual-clutch, ATTESA E-TS all-wheel drive
  // (rear-biased; a clutch sends up to half to the front), 1,752 kg. Bolt-on overfenders, wider track, air ride, a GT
  // wing. 0-60 ~2.9 s with launch control, ~196 mph
  CARS.gtr = { name: 'Nissan GT-R (R35) Liberty Walk', short: 'Nissan GTR', car: 'VR38DETT', hp: 565, tq: 467, cc: true, spec: {
    name: 'Nissan GT-R (R35) Liberty Walk',
    mass: 1830, Ipitch: 2500, Iyaw: 2750, Iroll: 600, cgHeight: 0.47, wheelbase: 2.78, frontWeight: 0.54,
    trackF: 1.66, trackR: 1.68, wheelRadius: 0.354, wheelInertiaF: 1.5, wheelInertiaR: 1.7,
    frontTire: 'street', rearTire: 'street',
    springF: 68000, springR: 64000, dampBumpF: 3800, dampRebF: 6000, dampBumpR: 3700, dampRebR: 5800,
    arbF: 36000, arbR: 21000, travelUp: 0.06, travelDown: 0.09, suspS0: 0.25,
    brakeTorqueF: 4400, brakeTorqueR: 2600, handbrakeTorque: 2500,
    maxSteer: 0.56, steerRate: 5, steerRatio: 16,
    idleRpm: 750, limiterRpm: 7100, redlineRpm: 7000, shiftRpm: 6900, engineInertia: 0.22, fricA: 26, fricB: 18, starterTorque: 170,
    torqueCurve: [[0, 170], [1000, 230], [2000, 330], [2800, 430], [3300, 467], [5800, 467], [6400, 452], [6800, 436], [7100, 410], [7500, 360]],
    turbo: { lag: 0.25, base: 0.5, rpm0: 1500, rpm1: 3000 }, boostMax: 13,
    autoRatios: [4.056, 2.301, 1.595, 1.248, 1.001, 0.796], autoRev: 3.383, autoFinal: 3.7, shiftTimeWOT: 0.15, shiftTimePart: 0.25, shiftCutDepth: 0.3,
    launchRpm: 4000, engineTc: true, tcRefBody: true,
    dragClutch: { rpm0: 2400, rpm1: 4400, kc: 0, base: [[0, 1100]], muSlip: 0.15, slipRef: 150, rev: 500 },
    awd: true, awdFront: 0.25, lsdPreload: 180, lsdPreloadF: 50, centerPreload: 700, lsdRamp: 0.25, driveEff: 0.87,
    CdA: 0.64, ClA: 0.15,
    bodyHalfW: 1.0, bodyFront: -2.28, bodyRear: 2.43, bodyBottom: -0.33, bodyTop: 0.86,
  } };
  // Mini Dookie: the game's Pamingo Mini (the Fiat Pongo concept) - a one-seat electric city pod, a 15 kW / 60 Nm motor
  // through a single 9:1 reduction, skinny eco tyres. 670 kg; ~55 mph and in no hurry getting there
  CARS.mini = { name: 'Mini Dookie', short: 'Mini Dookie', car: '15 kW ELECTRIC', hp: 20, tq: 44, cc: true, kbLat: 7, spec: {
    name: 'Mini Dookie',
    mass: 670, Ipitch: 420, Iyaw: 450, Iroll: 180, cgHeight: 0.52, wheelbase: 1.7, frontWeight: 0.5,
    trackF: 1.2, trackR: 1.2, wheelRadius: 0.28, wheelInertiaF: 0.5, wheelInertiaR: 0.55,
    frontTire: 'eco', rearTire: 'eco',
    springF: 22000, springR: 24000, dampBumpF: 1500, dampRebF: 2200, dampBumpR: 1600, dampRebR: 2400,
    arbF: 8000, arbR: 0, travelUp: 0.07, travelDown: 0.08, suspS0: 0.2,
    brakeTorqueF: 900, brakeTorqueR: 500, handbrakeTorque: 700, noESC: true,
    maxSteer: 0.62, steerRate: 4, steerRatio: 14,
    electric: true, idleRpm: 0, limiterRpm: 8000, redlineRpm: 8000, shiftRpm: 9000, engineInertia: 0.02, fricA: 1, fricB: 0.8, starterTorque: 0,
    torqueCurve: evCurve(60, 15, 8000), boostMax: 0, popScale: 0,
    autoRatios: [1], autoRev: 1, autoFinal: 9.0, engineTc: true, noCoastBlip: true,
    dragClutch: EV_CLUTCH, lsdPreload: 5, lsdRamp: 0, driveEff: 0.92,
    CdA: 0.72,
    bodyHalfW: 0.66, bodyFront: -1.3, bodyRear: 1.2, bodyBottom: -0.3, bodyTop: 1.1,
    bodyPts: ccPts(0.52, 0.5, 1.7, ccBox(0.66, 0.2, 1.62, -1.25, 1.15)),
  } };
  // Porta Potty: a 2.3 m portable toilet (PolyJohn PJP3-type) on a go-kart frame - four 10 in wheels under its base, a
  // 670 cc V-twin (~22 hp) and a torque-converter drive behind the seat, the driver on the throne with the door open.
  // ~290 kg with the driver, and the centre of gravity at hip height on a 1 m track: take a turn at speed and it goes over
  CARS.potty = { name: 'Porta Potty', short: 'Porta Potty', car: '670 cc V-TWIN', hp: 22, tq: 34, cc: true, kbLat: 5, spec: {
    name: 'Porta Potty',
    mass: 290, Ipitch: 110, Iyaw: 60, Iroll: 105, cgHeight: 0.64, wheelbase: 0.95, frontWeight: 0.5,
    trackF: 1.0, trackR: 1.0, wheelRadius: 0.13, wheelInertiaF: 0.03, wheelInertiaR: 0.04,
    frontTire: 'tiny10', rearTire: 'tiny10', Fz0: 900, loadSens: 0.1,
    springF: 30000, springR: 30000, dampBumpF: 900, dampRebF: 900, dampBumpR: 900, dampRebR: 900,
    arbF: 0, arbR: 0, travelUp: 0.03, travelDown: 0.02, suspS0: 0.05, rearToe: 0,
    brakeTorqueF: 60, brakeTorqueR: 90, handbrakeTorque: 120, noABS: true, noESC: true,
    maxSteer: 0.5, steerRate: 3.5, steerRatio: 8, ackermann: 0.6,
    idleRpm: 1200, limiterRpm: 4200, redlineRpm: 4000, shiftRpm: 3900, engineInertia: 0.05, fricA: 1.5, fricB: 0.9, starterTorque: 10,
    torqueCurve: [[0, 20], [1500, 28], [2500, 34], [3000, 34], [3600, 32], [4000, 29], [4400, 24], [4800, 18]], boostMax: 0,
    autoRatios: [2.4, 1.55, 1.0], autoRev: 2.4, autoFinal: 2.75, shiftTimeWOT: 0.35, shiftTimePart: 0.45, shiftCutDepth: 0.2,
    launchRpm: 2600, noCoastBlip: true, blipMax: 0.2,
    dragClutch: { rpm0: 1800, rpm1: 2800, kc: 0.0002, rev: 15, base: [[0, 8]], muSlip: 0.2, slipRef: 150 },
    lsdPreload: 8, lsdRamp: 0.02, driveEff: 0.85,
    CdA: 2.3, bodyK: 80000, bodyC: 4000, bodyMu: 0.5,
    bodyHalfW: 0.56, bodyFront: -0.6, bodyRear: 0.6, bodyBottom: -0.5, bodyTop: 1.7,
    bodyPts: ccPts(0.64, 0.5, 0.95, ccBox(0.56, 0.1, 2.36, -0.6, 0.6).concat([[0, 2.42, 0]])),
  } };
  // Turbo Scooter 3000: a four-wheel mobility scooter (Shoprider Venturer-type) with its 1 hp motor thrown away for a
  // 100 kW axial-flux motor and a lithium pack - 220 Nm straight to the rear axle through a 2.42:1 belt, 10 in tyres, the
  // basket still on the front and the battery pack low in the deck. 215 kg with the rider; ~119 mph. The motor
  // controller's wheelie control and the anti-tip wheels at the back stop it looping over on the launch. Sideways, the
  // rider sits high on a narrow track: on its wheels alone it went over at 0.4 g, in any real turn. So it has a
  // wide-track kit (the wheels on long stub axles, 0.83 m apart) that keeps all four down to ~0.75 g, and a stabiliser
  // caster on an arm out each side, 1.5 m apart and an inch off the ground: past that it leans a few degrees onto the
  // outside one and the tyres slide before it can roll
  CARS.scooter = { name: 'Turbo Scooter 3000', short: 'Turbo Scooter', car: '100 kW ELECTRIC', hp: 134, tq: 162, cc: true, kbLat: 7, spec: {
    name: 'Turbo Scooter 3000',
    mass: 215, Ipitch: 45, Iyaw: 36, Iroll: 30, cgHeight: 0.57, wheelbase: 1.1, frontWeight: 0.48,
    trackF: 0.8, trackR: 0.86, wheelRadius: 0.13, wheelInertiaF: 0.02, wheelInertiaR: 0.04,
    frontTire: 'scooter10', rearTire: 'scooter10', Fz0: 900, loadSens: 0.1,
    springF: 30000, springR: 30000, dampBumpF: 900, dampRebF: 1100, dampBumpR: 1100, dampRebR: 1300,
    arbF: 12000, arbR: 0, travelUp: 0.03, travelDown: 0.03, suspS0: 0.06, rearToe: 0.004,
    // (and a yaw-rate stability control in the motor controller, braking a wheel: on so short a wheelbase a quick
    // flick of the wheel otherwise swaps its ends)
    brakeTorqueF: 80, brakeTorqueR: 100, handbrakeTorque: 100, noABS: true,
    maxSteer: 0.6, steerRate: 3, steerRatio: 5, ackermann: 0.6,
    electric: true, idleRpm: 0, limiterRpm: 10000, redlineRpm: 10000, shiftRpm: 11000, engineInertia: 0.03, fricA: 1, fricB: 1.6, starterTorque: 0,
    torqueCurve: evCurve(220, 100, 10000), boostMax: 0, popScale: 0,
    autoRatios: [1], autoRev: 1, autoFinal: 2.42, engineTc: true, noCoastBlip: true,
    dragClutch: EV_CLUTCH, lsdPreload: 6, lsdRamp: 0, driveEff: 0.92,
    wheelieBar: { len: 0.32, clr: 0.08, halfW: 0.18, r: 0.04, k: 150000, damp: 5000, Fmax: 5000 }, wheelieCtl: 1,
    // (the casters: 4 in wheels, 0.74 m out each side beside the CG, their bottoms 3 cm off the ground)
    outriggers: { pts: ccPts(0.57, 0.48, 1.1, [[-0.74, 0.08, 0.05], [0.74, 0.08, 0.05]]), r: 0.05, k: 160000, damp: 4000, Fmax: 7000 },
    CdA: 0.68, bodyK: 60000, bodyC: 3000, bodyMu: 0.5,
    bodyHalfW: 0.32, bodyFront: -0.95, bodyRear: 0.6, bodyBottom: -0.5, bodyTop: 0.9,
    bodyPts: ccPts(0.57, 0.48, 1.1, ccBox(0.3, 0.1, 0.45, -0.8, 0.64).concat(ccBox(0.25, 0.55, 1.35, 0.0, 0.45))
      .concat([[0, 1.55, 0.35], [0, 1.0, -0.6], [0, 0.5, -0.9]])),
  } };
  // Razors Edge: the game's Halloween special after the Lo Res Car - a golf cart's chassis under a long faceted body of
  // black glass panels edged in neon. Here: a stretched cart frame with a 110 kW / 250 Nm motor through a 4.95:1
  // reduction, 18 x 8.50-8 cart tyres, two seats. 530 kg with the driver; ~142 mph, the glass wedge cleaving the air
  CARS.razor = { name: 'Razors Edge', short: 'Razors Edge', car: '110 kW ELECTRIC', hp: 148, tq: 184, cc: true, kbLat: 7, spec: {
    name: 'Razors Edge',
    mass: 530, Ipitch: 520, Iyaw: 600, Iroll: 110, cgHeight: 0.42, wheelbase: 2.3, frontWeight: 0.45,
    trackF: 1.12, trackR: 1.12, wheelRadius: 0.26, wheelInertiaF: 0.3, wheelInertiaR: 0.35,
    frontTire: 'golf', rearTire: 'golf',
    springF: 20000, springR: 24000, dampBumpF: 1200, dampRebF: 1700, dampBumpR: 1400, dampRebR: 2000,
    arbF: 12000, arbR: 0, travelUp: 0.06, travelDown: 0.06, suspS0: 0.15, rearToe: 0.004,
    // (a yaw-rate stability control, braking a wheel: on the short cart frame, power in a turn swaps its ends)
    brakeTorqueF: 350, brakeTorqueR: 300, handbrakeTorque: 400, noABS: true,
    maxSteer: 0.55, steerRate: 4, steerRatio: 14,
    electric: true, idleRpm: 0, limiterRpm: 12000, redlineRpm: 12000, shiftRpm: 13000, engineInertia: 0.04, fricA: 1, fricB: 1.5, starterTorque: 0,
    torqueCurve: evCurve(250, 110, 12000), boostMax: 0, popScale: 0,
    autoRatios: [1], autoRev: 1, autoFinal: 4.95, engineTc: true, noCoastBlip: true,
    dragClutch: EV_CLUTCH, lsdPreload: 10, lsdRamp: 0.05, driveEff: 0.92,
    CdA: 0.5,
    bodyHalfW: 0.8, bodyFront: -2.3, bodyRear: 2.3, bodyBottom: -0.28, bodyTop: 0.85,
    bodyPts: ccPts(0.42, 0.45, 2.3, ccBox(0.84, 0.16, 0.5, -1.4, 1.5).concat([[0, 0.55, -2.4], [0, 1.0, 2.3], [0, 1.2, 0.3], [-0.55, 1.12, 0.5], [0.55, 1.12, 0.5], [-0.6, 1.04, 2.3], [0.6, 1.04, 2.3]])),
  } };
  // Cybertruck: the stainless-steel wedge - a 3.81 m wheelbase, 35 in all-terrains on 20 in wheels, air suspension,
  // four-wheel steering (the rears up to 10 degrees against the fronts at low speed, a touch with them at speed) on a
  // steer-by-wire rack, Cd ~0.34. Three versions (CARS.cyber.make): the base is the All-Wheel Drive - two motors, ~600 hp,
  // 3,000 kg (6,603 lb), 0-60 in 4.1 s, governed to 112 mph
  CARS.cyber = { name: 'Cybertruck', short: 'Cybertruck', car: 'DUAL MOTOR AWD', hp: 600, tq: 590, cc: true, kbLat: 6, spec: {
    name: 'Cybertruck',
    mass: 3000, Ipitch: 7200, Iyaw: 7800, Iroll: 1500, cgHeight: 0.72, wheelbase: 3.807, frontWeight: 0.5,
    trackF: 1.72, trackR: 1.72, wheelRadius: 0.44, wheelInertiaF: 3.2, wheelInertiaR: 3.2,
    frontTire: 'cyberAT', rearTire: 'cyberAT',
    springF: 95000, springR: 100000, dampBumpF: 6500, dampRebF: 9500, dampBumpR: 6800, dampRebR: 10000,
    arbF: 62000, arbR: 38000, travelUp: 0.1, travelDown: 0.12, suspS0: 0.3,
    brakeTorqueF: 7000, brakeTorqueR: 4600, handbrakeTorque: 3500,
    maxSteer: 0.6, steerRate: 5, steerRatio: 11, rearSteerMax: 0.175,
    electric: true, idleRpm: 0, limiterRpm: 12150, redlineRpm: 12150, shiftRpm: 13000, engineInertia: 0.1, fricA: 3, fricB: 2, starterTorque: 0,
    torqueCurve: evCurve(900, 447, 12800), boostMax: 0, popScale: 0,
    autoRatios: [1], autoRev: 1, autoFinal: 11.0, engineTc: true, noCoastBlip: true,
    dragClutch: EV_CLUTCH, awd: true, awdFront: 0.45, lsdPreload: 40, lsdPreloadF: 30, centerPreload: 300, lsdRamp: 0.1, driveEff: 0.92,
    CdA: 1.07,
    bodyHalfW: 1.01, bodyFront: -2.85, bodyRear: 2.84, bodyBottom: -0.33, bodyTop: 1.07,
  } };
  // Touring bagger, built like a Street Glide: a 117 ci (1,923 cc) 45-degree V-twin, 105 hp at 5,020 and 130 lb-ft at
  // 3,500, a 6-speed and a belt, the batwing fairing on the forks, hard saddlebags; 1,625 mm wheelbase, a 19 in front and
  // an 18 in rear, 368 kg wet + a 90 kg rider. A motorcycle in a four-wheel world: each axle's two 'wheels' sit side by
  // side under the tyre (half the load each, the rear pair locked together), and the rider balances it (bike: leaned
  // into turns, held up at a stop). Its floorboards touch down past ~32 degrees, as the real one's do.
  // Three versions (CARS.bike.make): stock, a King of the Baggers race bike, a turbo drag bagger
  CARS.bike = { name: 'Touring Bagger', short: 'Bagger', car: '117 CI V-TWIN', hp: 105, tq: 130, cc: true, kbLat: 5.8, spec: {
    name: 'Touring Bagger',
    mass: 458, Ipitch: 190, Iyaw: 200, Iroll: 45, cgHeight: 0.66, wheelbase: 1.625, frontWeight: 0.46,
    trackF: 0.02, trackR: 0.02, wheelRadius: 0.33, wheelRadiusF: 0.335, wheelRadiusR: 0.33, wheelInertiaF: 0.28, wheelInertiaR: 0.38,
    frontTire: 'bikeF', rearTire: 'bikeR', Fz0: 1100, loadSens: 0.08,
    springF: 14000, springR: 20000, dampBumpF: 800, dampRebF: 1200, dampBumpR: 1000, dampRebR: 1500,
    arbF: 0, arbR: 0, travelUp: 0.1, travelDown: 0.09, suspS0: 0.2,
    brakeTorqueF: 600, brakeTorqueR: 110, handbrakeTorque: 300, noESC: true,
    maxSteer: 0.55, steerRate: 4, steerRatio: 1, ackermann: 0, rearToe: 0,
    bike: { kp: 160, kd: 35, vMin: 1.5, maxLean: 0.56, yawK: 30, alignK: 20, selfK: 1 },
    idleRpm: 950, limiterRpm: 5650, redlineRpm: 5500, shiftRpm: 5400, engineInertia: 0.09, fricA: 8, fricB: 5, starterTorque: 60,
    torqueCurve: [[0, 60], [1000, 100], [2000, 118], [3000, 128], [3500, 130], [4000, 128], [4500, 122], [5000, 112], [5500, 100], [6000, 85]],
    boostMax: 0, popScale: 0.6,
    autoRatios: [3.34, 2.31, 1.72, 1.39, 1.19, 1.0], autoRev: 3.34, autoFinal: 2.875, shiftTimeWOT: 0.15, shiftTimePart: 0.25, shiftCutDepth: 0.5,
    launchRpm: 2200, engineTc: true,
    dragClutch: { rpm0: 1100, rpm1: 2100, kc: 0, base: [[0, 260]], muSlip: 0.2, slipRef: 200, rev: 100 },
    lsdPreload: 400, lsdRamp: 0, driveEff: 0.9,
    CdA: 0.62,
    bodyHalfW: 0.47, bodyFront: -1.3, bodyRear: 1.25, bodyBottom: -0.54, bodyTop: 0.95,
    // (the floorboards and the bags' bottom corners: where it touches down leaned over)
    bodyPts: ccPts(0.66, 0.46, 1.625, [[-0.36, 0.26, -0.35], [0.36, 0.26, -0.35], [-0.36, 0.26, -0.05], [0.36, 0.26, -0.05], [-0.46, 0.36, 0.5], [0.46, 0.36, 0.5], [-0.46, 0.36, 1.05], [0.46, 0.36, 1.05],
      [0, 0.12, 0], [0, 1.45, -0.9], [0, 1.6, 0.1], [0, 0.9, 1.1]]),
  } };
  // Main battle tank, built like an M1A2 Abrams: ~62 t, a 1,500 hp gas turbine (3,950 lb-ft at its output shaft), a
  // 4-speed automatic cross-drive transmission with a torque converter and hydrostatic steering, seven dual road wheels a
  // side on torsion bars, rubber-padded steel tracks 635 mm wide ~4.2 m apart on the ground. It steers as tanks do
  // (tracks: one track driven faster than the other) and pivots in place; no ABS or stability control. Three versions
  // (CARS.tank.make): governed to 42 mph, the governor off (~58 mph), and a hot-rodded 3,000 hp turbine (~71 mph)
  CARS.tank = { name: 'Main Battle Tank', short: 'Tank', car: '1,500 HP TURBINE', hp: 1500, tq: 3950, cc: true, kbLat: 50, spec: {
    name: 'Main Battle Tank',
    // (wheelbase: the two 'wheels' of a track stand in for 4.2 m of ground contact under even pressure - a turn has to
    // scrub it sideways, and its resistance acts a quarter of the length out, not at the ends: at +-1.2 m they carry
    // the load and resist a turn as the whole track does)
    mass: 62000, Ipitch: 330000, Iyaw: 380000, Iroll: 95000, cgHeight: 1.15, wheelbase: 2.4, frontWeight: 0.5,
    trackF: 2.95, trackR: 2.95, wheelRadius: 0.36, wheelInertiaF: 1, wheelInertiaR: 450,
    frontTire: 'track', rearTire: 'track', Fz0: 150000, loadSens: 0.04,
    springF: 1.6e6, springR: 1.6e6, dampBumpF: 110000, dampRebF: 150000, dampBumpR: 110000, dampRebR: 150000,
    arbF: 0, arbR: 0, travelUp: 0.2, travelDown: 0.18, suspS0: 0.45, bumpStopK: 8e6, fzMax: 1.5e6,
    brakeTorqueF: 36000, brakeTorqueR: 36000, handbrakeTorque: 40000, noABS: true, noESC: true,
    maxSteer: 1e-4, steerRate: 1, steerRatio: 1, ackermann: 0, rearToe: 0,
    tracks: { dv: 2.4, dvMin: 0.3, vFade: 22, kp: 150000, tMax: 220000 },
    idleRpm: 1300, limiterRpm: 3000, redlineRpm: 3000, shiftRpm: 2950, engineInertia: 3, fricA: 60, fricB: 40, starterTorque: 900,
    torqueCurve: [[0, 3500], [1000, 3950], [1500, 3800], [2000, 3500], [2500, 3150], [3000, 2626], [3300, 2000]],
    boostMax: 0, popScale: 0,
    autoRatios: [3.9, 2.45, 1.72, 1.4], autoRev: 3.9, autoFinal: 4.3, tcK: 0.15, tcStall: 2.1, lockupTorque: 9000,
    shiftTimeWOT: 0.6, shiftTimePart: 0.8, launchRpm: 1800, engineTc: false,
    lsdPreload: 0, lsdRamp: 0, driveEff: 0.75,
    CdA: 6.4,
    bodyHalfW: 1.83, bodyFront: -3.95, bodyRear: 3.95, bodyBottom: -0.67, bodyTop: 1.25,
  } };
  // The electric cars' petrol alternatives. CARS[id].engines: { key: entry overrides + spec overrides }; the stock
  // (electric) car is 'ev'; label names it. CARS[id].make(key) -> a CARS-style entry with that engine in (the game
  // restarts to swap)
  const ICE = { electric: false, popScale: 1, noCoastBlip: false };
  // (baseKey / baseLabel: the stock one's key and name; an alternative with ev: true is another electric one)
  function ccEngines(id, alts, baseKey, baseLabel) {
    const base = CARS[id], bk = baseKey || 'ev';
    base.engines = Object.assign({ [bk]: { label: baseLabel || 'Electric' } }, alts);
    base.make = (key) => {
      const a = alts[key];
      if (!a) return Object.assign({}, base, { engine: bk });
      return Object.assign({}, base, a, { engine: key, spec: Object.assign({}, base.spec, a.ev || !base.spec.electric ? {} : ICE, a.spec) });
    };
  }
  // Mini Dookie with the Fiat 0.9 TwinAir turbo twin (the Pongo was a Fiat): 85 hp at 5,500, 145 Nm at 1,900, mounted
  // across under the rear floor behind the seat like a Smart's, into a 5-speed automated manual (Dualogic-type: a
  // robot works the clutch and shifts, slowly). ~100 mph
  ccEngines('mini', {
    twinair: { label: '0.9 TwinAir', car: '0.9 TWINAIR TURBO', hp: 85, tq: 107, spec: {
      idleRpm: 850, limiterRpm: 6300, redlineRpm: 6000, shiftRpm: 5800, engineInertia: 0.09, fricA: 7, fricB: 4, starterTorque: 60,
      // (lb-ft: the little turbo gives 107 lb-ft from 1,900 to 3,500)
      torqueCurve: [[0, 40], [1000, 62], [1500, 88], [1900, 107], [3500, 107], [4500, 97], [5500, 81], [6000, 72], [6500, 56]],
      turbo: { lag: 0.35, base: 0.55, rpm0: 1300, rpm1: 2100 }, boostMax: 14,
      autoRatios: [3.91, 2.16, 1.48, 1.12, 0.92], autoRev: 3.73, autoFinal: 4.0, shiftTimeWOT: 0.4, shiftTimePart: 0.55, shiftCutDepth: 1,
      launchRpm: 2200, engineTc: false,
      dragClutch: { rpm0: 1250, rpm1: 2300, kc: 0, base: [[0, 260]], muSlip: 0.15, slipRef: 150, rev: 200 },
      lsdPreload: 5, driveEff: 0.9, mass: 670,
    } },
  });
  // Turbo Scooter 3000 with the name made literal: a Suzuki Hayabusa 1,340 cc four with a turbo on ~10 psi, ~260 hp at
  // 10,000, 206 Nm at 7,500, sitting bare where the rear shell was, crank across the frame, the bike's 6-speed on a
  // quickshifter and a chain to the rear axle. 250 kg with the rider, more of it at the back. ~160 mph - on 10 in
  // wheels spinning 5,000 rpm
  ccEngines('scooter', {
    busa: { label: 'Turbo Hayabusa', car: 'TURBO HAYABUSA', hp: 260, tq: 152, spec: {
      mass: 250, Ipitch: 52, Iyaw: 42, Iroll: 34, frontWeight: 0.43,
      idleRpm: 1200, limiterRpm: 11500, redlineRpm: 11000, shiftRpm: 10800, engineInertia: 0.04, fricA: 4, fricB: 2, starterTorque: 25,
      torqueCurve: [[0, 45], [2000, 60], [3000, 75], [4000, 100], [5000, 125], [6000, 145], [7500, 152], [9000, 147], [10000, 137], [10800, 120], [11500, 95], [12500, 60]],
      turbo: { lag: 0.3, base: 0.55, rpm0: 4000, rpm1: 7000 }, boostMax: 10, thrExp: 1.3,
      // (the bike's gears; its 1.596 primary and the chain make 1.9 overall before them)
      autoRatios: [2.615, 1.937, 1.526, 1.285, 1.136, 1.043], autoRev: 2.615, autoFinal: 1.9, shiftTimeWOT: 0.05, shiftTimePart: 0.09, shiftCutDepth: 0.4,
      launchRpm: 6500, engineTc: true,
      dragClutch: { rpm0: 3000, rpm1: 6000, kc: 0, rev: 60, base: [[0, 360]], muSlip: 0.25, slipRef: 220 },
      outriggers: { pts: ccPts(0.57, 0.43, 1.1, [[-0.74, 0.08, 0.05], [0.74, 0.08, 0.05]]), r: 0.05, k: 160000, damp: 4000, Fmax: 7000 },
      bodyPts: ccPts(0.57, 0.43, 1.1, ccBox(0.3, 0.1, 0.45, -0.8, 0.64).concat(ccBox(0.25, 0.55, 1.35, 0.0, 0.45))
        .concat([[0, 1.55, 0.35], [0, 1.0, -0.6], [0, 0.5, -0.9], [-0.26, 0.62, 0.72], [0.26, 0.62, 0.72]])),
    } },
  });
  // Razors Edge with the golf-cart builder's favourite: a junkyard 5.3 L LS V8 (285 hp at 5,200, 325 lb-ft at 4,000)
  // behind the bench, a 4L60E 4-speed automatic and a 9-inch rear axle with 3.08 gears. 690 kg; traction-limited on
  // cart tyres below ~70 mph, ~165 mph at the limiter in top
  ccEngines('razor', {
    ls: { label: '5.3 LS V8', car: '5.3 LS V8', hp: 285, tq: 325, spec: {
      mass: 690, Ipitch: 640, Iyaw: 740, Iroll: 130, frontWeight: 0.4,
      idleRpm: 700, limiterRpm: 6000, redlineRpm: 5800, shiftRpm: 5700, engineInertia: 0.2, fricA: 20, fricB: 12, starterTorque: 150,
      torqueCurve: [[0, 200], [1000, 250], [2000, 290], [3000, 312], [4000, 325], [4800, 318], [5200, 288], [5800, 250], [6200, 215], [6800, 170]],
      boostMax: 0,
      autoRatios: [3.06, 1.63, 1.0, 0.7], autoRev: 2.29, autoFinal: 3.08, tcK: 0.0072, tcStall: 2.0, lockupTorque: 700,
      launchRpm: 2400, engineTc: false, dragClutch: undefined,
      lsdPreload: 60, lsdRamp: 0.2, driveEff: 0.86,
    } },
  });
  // ---------------------------------------------------------------- golf carts
  // A standard electric golf cart (Club Car / E-Z-GO type): steel frame, a 48 V series-wound motor (~4 kW) on a 12.44:1
  // rear axle, 18 x 8.50-8 tyres, leaf springs, drum brakes on the rears only, a speed governor at the course's 19 mph;
  // 380 kg with the driver. Then three more powerful ones (CARS.golf.make(key)):
  //   lsv  - a street-legal LSV build: a 72 V AC motor and controller (12 kW), 35 mph, 12 in wheels, lights and mirrors
  //   hot  - a hot rod: lowered, no roof, a 45 kW / 160 Nm AC motor and a lithium pack, fat 22 in tyres, ~84 mph
  //   busa - the record cart, built like the 118 mph world-record holder: a Suzuki Hayabusa 1,340 cc four (~190 hp) behind
  //          the seat, its 6-speed on a quickshifter, a chain to the axle, a stretched and lowered frame, wheelie bar
  //   jet / mega - turbojet carts (thrust, no driven wheels): a drone turbojet, and a fighter-trainer one with an afterburner
  CARS.golf = { name: 'Golf Cart', short: 'Golf Cart', car: '48 V ELECTRIC', hp: 5, tq: 18, cc: true, kbLat: 5, spec: {
    name: 'Golf Cart',
    mass: 380, Ipitch: 180, Iyaw: 220, Iroll: 60, cgHeight: 0.58, wheelbase: 1.65, frontWeight: 0.42,
    trackF: 0.88, trackR: 0.98, wheelRadius: 0.229, wheelInertiaF: 0.25, wheelInertiaR: 0.3,
    frontTire: 'golf', rearTire: 'golf', Fz0: 1200, loadSens: 0.1,
    springF: 18000, springR: 22000, dampBumpF: 900, dampRebF: 1300, dampBumpR: 1100, dampRebR: 1600,
    arbF: 4000, arbR: 0, travelUp: 0.06, travelDown: 0.07, suspS0: 0.12, rearToe: 0.002,
    brakeTorqueF: 0, brakeTorqueR: 380, handbrakeTorque: 380, noABS: true, noESC: true,
    maxSteer: 0.6, steerRate: 3.5, steerRatio: 12, ackermann: 0.7,
    electric: true, idleRpm: 0, limiterRpm: 4500, redlineRpm: 4500, shiftRpm: 5000, engineInertia: 0.02, fricA: 1.5, fricB: 1, starterTorque: 0,
    torqueCurve: evCurve(25, 4, 4500), boostMax: 0, popScale: 0,
    autoRatios: [1], autoRev: 1, autoFinal: 12.44, engineTc: true, noCoastBlip: true,
    dragClutch: EV_CLUTCH, lsdPreload: 2, lsdRamp: 0, driveEff: 0.9,
    CdA: 0.9,
    bodyHalfW: 0.6, bodyFront: -1.2, bodyRear: 1.25, bodyBottom: -0.4, bodyTop: 1.3,
    bodyPts: ccPts(0.58, 0.42, 1.65, ccBox(0.6, 0.15, 0.75, -1.2, 1.25).concat([[-0.6, 1.9, -0.55], [0.6, 1.9, -0.55], [-0.6, 1.9, 1.0], [0.6, 1.9, 1.0]])),
  } };
  ccEngines('golf', {
    lsv: { label: 'Street LSV', car: '72 V AC', hp: 16, tq: 52, ev: true, spec: {
      mass: 420, Ipitch: 195, Iyaw: 240, wheelRadius: 0.28, wheelInertiaF: 0.3, wheelInertiaR: 0.36,
      brakeTorqueF: 300, brakeTorqueR: 420,
      limiterRpm: 6000, redlineRpm: 6000, shiftRpm: 6500, torqueCurve: evCurve(70, 12, 6000), autoFinal: 11.2,
    } },
    hot: { label: 'Hot Rod', car: '45 kW AC', hp: 60, tq: 118, ev: true, kbLat: 7, spec: {
      mass: 440, Ipitch: 190, Iyaw: 250, Iroll: 58, cgHeight: 0.46, wheelRadius: 0.265, wheelInertiaF: 0.32, wheelInertiaR: 0.45, trackF: 1.0, trackR: 1.1,
      springF: 26000, springR: 32000, travelUp: 0.05, travelDown: 0.05, arbF: 9000, arbR: 3000,
      brakeTorqueF: 600, brakeTorqueR: 700, handbrakeTorque: 700, noESC: false,
      limiterRpm: 8000, redlineRpm: 8000, shiftRpm: 8500, engineInertia: 0.03, torqueCurve: evCurve(160, 45, 8000), autoFinal: 5.8,
      lsdPreload: 20, CdA: 0.72,
      bodyPts: ccPts(0.46, 0.42, 1.65, ccBox(0.62, 0.12, 0.75, -1.2, 1.25).concat([[0, 1.3, 0.5]])),
    } },
    busa: { label: 'Record (Hayabusa)', car: 'HAYABUSA 1340', hp: 190, tq: 111, kbLat: 7, spec: {
      mass: 500, Ipitch: 330, Iyaw: 380, Iroll: 62, cgHeight: 0.42, wheelbase: 2.1, frontWeight: 0.4, trackF: 1.05, trackR: 1.15,
      wheelRadius: 0.29, wheelRadiusF: 0.26, wheelRadiusR: 0.29, wheelInertiaF: 0.3, wheelInertiaR: 0.6,
      springF: 30000, springR: 38000, dampBumpF: 1500, dampRebF: 2200, dampBumpR: 1800, dampRebR: 2600, travelUp: 0.05, travelDown: 0.05, arbF: 12000, arbR: 5000,
      brakeTorqueF: 900, brakeTorqueR: 900, handbrakeTorque: 900, noESC: false,
      idleRpm: 1200, limiterRpm: 11500, redlineRpm: 11000, shiftRpm: 10800, engineInertia: 0.04, fricA: 4, fricB: 2, starterTorque: 25,
      // (lb-ft: the Hayabusa's 150 Nm at 7,000, ~190 hp at 9,700)
      torqueCurve: [[0, 45], [2000, 60], [3000, 72], [4000, 85], [5000, 98], [6000, 106], [7000, 111], [8000, 109], [9000, 105], [9700, 103], [10500, 94], [11500, 78], [12500, 55]],
      boostMax: 0, thrExp: 1.3,
      autoRatios: [2.615, 1.937, 1.526, 1.285, 1.136, 1.043], autoRev: 2.615, autoFinal: 5.95, shiftTimeWOT: 0.05, shiftTimePart: 0.09, shiftCutDepth: 0.4,
      launchRpm: 6500, engineTc: true, tcRefBody: true,
      dragClutch: { rpm0: 3000, rpm1: 6000, kc: 0, rev: 60, base: [[0, 330]], muSlip: 0.25, slipRef: 220 },
      lsdPreload: 60, lsdRamp: 0.2, driveEff: 0.88, popScale: 1,
      wheelieBar: { len: 0.55, clr: 0.08, halfW: 0.3, r: 0.04, k: 150000, damp: 5000, Fmax: 9000 }, wheelieCtl: 2,
      CdA: 0.7,
      bodyHalfW: 0.62, bodyFront: -1.5, bodyRear: 1.5, bodyBottom: -0.3, bodyTop: 0.8,
      bodyPts: ccPts(0.42, 0.4, 2.1, ccBox(0.62, 0.12, 0.7, -1.45, 1.5).concat([[0, 1.25, 0.6]])),
    } },
    // jet - a turbojet cart for the drag shows: a surplus target-drone turbojet (~2.6 kN / 590 lbf dry, ~3.6 kN / 810 lbf
    // with its homebuilt afterburner) slung low behind the seats, a stretched, lowered, wider frame, low-profile radials,
    // four-wheel discs with ABS, a nose cone and a tail fin. 480 kg with the driver and fuel. ~0-60 in 4 s, ~185 mph.
    // Stable flat out: the thrust line runs only 8 cm above the CG (mounted high, 0.5 m up, full thrust levered ~700 N off
    // the rear tyres - nothing pushes through the wheels to load them back up, as it does in a car - and a lane change at
    // 60 mph swapped ends), the rear tyres are wider and grippier than the fronts, the brakes are biased 70 % to the front
    // (a jet is still pushing for a second after you lift), and the fin keeps its nose in the wind
    jet: { label: 'Jet', car: 'TURBOJET 810 LBF', hp: 0, tq: 0, kbLat: 4.5, spec: {
      mass: 480, Ipitch: 380, Iyaw: 440, Iroll: 72, cgHeight: 0.44, wheelbase: 2.3, frontWeight: 0.47, trackF: 1.14, trackR: 1.22,
      wheelRadius: 0.27, wheelRadiusF: 0.26, wheelRadiusR: 0.27, wheelInertiaF: 0.28, wheelInertiaR: 0.32,
      frontTire: 'jetF', rearTire: 'jetR', Fz0: 1500,
      springF: 30000, springR: 34000, dampBumpF: 1700, dampRebF: 2500, dampBumpR: 1900, dampRebR: 2800, travelUp: 0.05, travelDown: 0.05,
      arbF: 14000, arbR: 5000, rearToe: 0.004,
      brakeTorqueF: 1300, brakeTorqueR: 550, handbrakeTorque: 700, noABS: false, noESC: false,
      maxSteer: 0.5, steerRate: 3, steerRatio: 14,
      electric: false, idleRpm: 3600, limiterRpm: 10500, redlineRpm: 10000, shiftRpm: 10500, engineInertia: 0.02, fricA: 0.3, fricB: 0, starterTorque: 0,
      torqueCurve: [[0, 0], [20000, 0]], boostMax: 0, popScale: 0,
      autoRatios: [1], autoRev: 2.2, autoFinal: 12.44, noCoastBlip: true, engineTc: true,
      dragClutch: EV_CLUTCH, lsdPreload: 2, lsdRamp: 0, driveEff: 0.9,
      jet: { thrust: 2600, ab: 0.4, idle: 0.36, rpm100: 10000, ram: 0.0025, y: 0, z: 1.2, revTq: 22, revRpm: 4000 },
      fin: { y: 0.2, z: 1.6, CyA: 0.3 }, aeroDamp: [0.6, 2.4, 0],
      CdA: 0.66, ClA: 0.22,
      bodyHalfW: 0.64, bodyFront: -1.75, bodyRear: 1.95, bodyBottom: -0.28, bodyTop: 1.0,
      bodyPts: ccPts(0.44, 0.47, 2.3, ccBox(0.64, 0.12, 0.8, -1.75, 1.95).concat([[0, 1.45, 1.5], [0, 1.05, 0.9]])),
    } },
    // mega - the jet cart with an engine half as big again as the Unhinged one (2.4 times the stock engine across): an
    // afterburning fighter-trainer turbojet, ~3,300 lbf dry and ~4,600 lbf lit (thrust goes with the intake's area, so
    // 2.25 times the Unhinged tune's). 700 kg with it and its fuel. The frame is longer and wider, the thrust line still
    // runs through the CG, half its weight is on the nose, a big fin rides on the afterburner can (it and the body's
    // yaw damping keep it straight when a 7 g shove meets a hard turn), and a slippery streamliner shell is held down by
    // the air - ~1,800 lb from 150 mph up and no more (dfV), or at 600 mph it squashed itself onto its belly and dragged.
    // Its thrust falls off less with speed than the drone engine's (an afterburner near Mach 1 holds its thrust) - 0-60 in
    // 0.8 s once it's spooled, 0-400 in ~8 s, 600 mph (Stage 2 ~700, Unhinged 800 with their tunes in game.js)
    mega: { label: 'Mega Jet', car: 'TURBOJET 4,600 LBF', hp: 0, tq: 0, kbLat: 4.5, spec: {
      mass: 700, Ipitch: 640, Iyaw: 760, Iroll: 100, cgHeight: 0.46, wheelbase: 2.55, frontWeight: 0.5, trackF: 1.22, trackR: 1.32,
      wheelRadius: 0.27, wheelRadiusF: 0.26, wheelRadiusR: 0.27, wheelInertiaF: 0.28, wheelInertiaR: 0.32,
      frontTire: 'jetF', rearTire: 'jetR', Fz0: 2100,
      springF: 46000, springR: 52000, dampBumpF: 2500, dampRebF: 3700, dampBumpR: 2800, dampRebR: 4100, travelUp: 0.05, travelDown: 0.05,
      arbF: 21000, arbR: 7500, rearToe: 0.004,
      brakeTorqueF: 2100, brakeTorqueR: 850, handbrakeTorque: 1100, noABS: false, noESC: false,
      maxSteer: 0.5, steerRate: 3, steerRatio: 14,
      electric: false, idleRpm: 3600, limiterRpm: 10500, redlineRpm: 10000, shiftRpm: 10500, engineInertia: 0.02, fricA: 0.3, fricB: 0, starterTorque: 0,
      torqueCurve: [[0, 0], [20000, 0]], boostMax: 0, popScale: 0,
      autoRatios: [1], autoRev: 2.2, autoFinal: 12.44, noCoastBlip: true, engineTc: true,
      dragClutch: EV_CLUTCH, lsdPreload: 2, lsdRamp: 0, driveEff: 0.9,
      jet: { thrust: 14600, ab: 0.4, idle: 0.36, rpm100: 10000, ram: 0.0008, y: 0, z: 1.4, revTq: 34, revRpm: 4000, size: 2.37 },
      fin: { y: 0.3, z: 2.1, CyA: 1.3 }, aeroDamp: [1.2, 4, 1.2],
      CdA: 0.36, ClA: 3.0, dfV: 70,
      bodyHalfW: 0.68, bodyFront: -1.85, bodyRear: 2.9, bodyBottom: -0.28, bodyTop: 1.25,
      bodyPts: ccPts(0.46, 0.47, 2.55, ccBox(0.68, 0.12, 0.8, -1.85, 2.9).concat([[0, 1.7, 1.7], [0, 1.2, 0.9]])),
    } },
  }, 'std', 'Standard');
  // ---------------------------------------------------------------- rally cars
  // Three power levels of a gravel rally hatch (roll cage, sequential dog box, hydraulic handbrake, gravel tyres, two up):
  //   r4 - Rally4: front-wheel drive, a 1.2 L turbo triple on a 30 mm restrictor (208 hp, 290 Nm), 5-speed sequential,
  //        a plated front diff; 1,240 kg with the crew
  //   r2 - Rally2: four-wheel drive (no centre diff, plated front and rear), a 1.6 L turbo four on a 32 mm restrictor
  //        (290 hp, 420 Nm), 5-speed sequential; 1,390 kg with the crew
  //   gb - Group B: the 1986 monsters - mid-engined, four-wheel drive with a rear-biased centre diff, a twin-charged
  //        1.8 L four at ~530 hp, heavy turbo lag and an anti-lag that bangs and spits on every lift; 1,150 kg
  CARS.rally = { name: 'Rally Car', short: 'Rally Car', car: '1.2 TURBO TRIPLE', hp: 208, tq: 214, cc: true, kbLat: 8, spec: {
    name: 'Rally Car',
    mass: 1240, Ipitch: 1500, Iyaw: 1700, Iroll: 420, cgHeight: 0.5, wheelbase: 2.55, frontWeight: 0.6,
    trackF: 1.52, trackR: 1.5, wheelRadius: 0.317, wheelInertiaF: 0.9, wheelInertiaR: 0.9,
    frontTire: 'rallyG', rearTire: 'rallyG',
    springF: 42000, springR: 36000, dampBumpF: 3200, dampRebF: 5000, dampBumpR: 2800, dampRebR: 4400,
    arbF: 16000, arbR: 9000, travelUp: 0.11, travelDown: 0.13, suspS0: 0.3,
    // (no ABS; the stability control - which the real ones don't have - is there in Street and Sport, off in Track / Off)
    brakeTorqueF: 2600, brakeTorqueR: 1300, handbrakeTorque: 2600, noABS: true,
    maxSteer: 0.6, steerRate: 6, steerRatio: 11,
    idleRpm: 1100, limiterRpm: 6800, redlineRpm: 6600, shiftRpm: 6500, engineInertia: 0.12, fricA: 12, fricB: 7, starterTorque: 120,
    // (lb-ft: 214 lb-ft / 290 Nm from 3,000, 208 hp at 5,500)
    torqueCurve: [[0, 70], [1500, 140], [2500, 200], [3000, 214], [4500, 214], [5500, 199], [6200, 172], [6800, 135], [7400, 100]],
    turbo: { lag: 0.25, base: 0.5, rpm0: 1500, rpm1: 2800 }, boostMax: 22, popScale: 3,
    autoRatios: [2.92, 2.05, 1.6, 1.3, 1.08], autoRev: 2.92, autoFinal: 4.02, shiftTimeWOT: 0.06, shiftTimePart: 0.1, shiftCutDepth: 0.5,
    // (traction control, where it's on, lets the gravel tyres spin up to where they bite best, ~13-20 %)
    launchRpm: 4500, engineTc: true, tcRefBody: true, noCoastBlip: false, tcTargets: [0.13, 0.16, 0.2],
    dragClutch: { rpm0: 2200, rpm1: 4200, kc: 0, base: [[0, 650]], muSlip: 0.15, slipRef: 150, rev: 400 },
    awd: true, awdFront: 1, fwd: true, lsdPreload: 0, lsdPreloadF: 160, lsdRamp: 0.45, driveEff: 0.9,
    CdA: 0.78, ClA: 0.25,
    bodyHalfW: 0.88, bodyFront: -2.0, bodyRear: 2.0, bodyBottom: -0.3, bodyTop: 0.95,
  } };
  ccEngines('rally', {
    r2: { label: 'Rally2', car: '1.6 TURBO FOUR', hp: 290, tq: 310, spec: {
      mass: 1390, Ipitch: 1650, Iyaw: 1900, Iroll: 470, frontWeight: 0.58, trackF: 1.6, trackR: 1.6,
      springF: 46000, springR: 44000, arbF: 17000, arbR: 13000,
      brakeTorqueF: 2900, brakeTorqueR: 1800,
      idleRpm: 1100, limiterRpm: 7200, redlineRpm: 7000, shiftRpm: 6900,
      // (lb-ft: 310 lb-ft / 420 Nm from 3,500 to 4,500, 290 hp at 5,500)
      torqueCurve: [[0, 90], [1500, 180], [2500, 280], [3500, 310], [4500, 310], [5500, 277], [6500, 222], [7200, 180], [7800, 140]],
      turbo: { lag: 0.22, base: 0.5, rpm0: 1600, rpm1: 3000 }, boostMax: 24, popScale: 3.5,
      autoRatios: [2.73, 1.94, 1.52, 1.24, 1.03], autoRev: 2.73, autoFinal: 4.25,
      dragClutch: { rpm0: 2300, rpm1: 4300, kc: 0, base: [[0, 900]], muSlip: 0.15, slipRef: 150, rev: 500 },
      awdFront: 0.5, fwd: false, lsdPreload: 150, lsdPreloadF: 120, centerPreload: 2500, lsdRamp: 0.45,
      CdA: 0.8, ClA: 0.35, bodyHalfW: 0.92,
    } },
    gb: { label: 'Group B', car: '1.8 TWIN-CHARGED', hp: 530, tq: 361, spec: {
      mass: 1150, Ipitch: 1250, Iyaw: 1500, Iroll: 400, cgHeight: 0.47, wheelbase: 2.44, frontWeight: 0.42, trackF: 1.52, trackR: 1.56,
      springF: 44000, springR: 52000, arbF: 22000, arbR: 8000, rearToe: 0.003,
      brakeTorqueF: 2700, brakeTorqueR: 2000,
      idleRpm: 1200, limiterRpm: 8600, redlineRpm: 8400, shiftRpm: 8200, engineInertia: 0.13,
      // (lb-ft: 361 lb-ft / 490 Nm at 5,000, ~530 hp at 8,000 - once the big turbo's awake)
      torqueCurve: [[0, 90], [2000, 180], [3000, 280], [4000, 345], [5000, 361], [6000, 356], [7000, 350], [8000, 348], [8600, 320], [9200, 260]],
      turbo: { lag: 0.45, base: 0.38, rpm0: 3000, rpm1: 5200 }, boostMax: 28, popScale: 5,
      autoRatios: [2.3, 1.7, 1.33, 1.1, 0.93], autoRev: 2.3, autoFinal: 4.89,
      launchRpm: 5500,
      dragClutch: { rpm0: 2800, rpm1: 5000, kc: 0, base: [[0, 1000]], muSlip: 0.15, slipRef: 150, rev: 500 },
      awdFront: 0.45, fwd: false, lsdPreload: 160, lsdPreloadF: 100, centerPreload: 500, lsdRamp: 0.45,
      CdA: 0.82, ClA: 0.45, bodyHalfW: 0.93, bodyFront: -1.95, bodyRear: 1.95,
    } },
  }, 'r4', 'Rally4');
  // the bagger's other two: a King of the Baggers race bike - a 131 ci race motor (~190 hp), race suspension with the
  // clearance to lean 50 degrees, slicks, 370 kg with the rider - and a turbo drag bagger: ~400 hp, a stretched swingarm,
  // wheelie control
  ccEngines('bike', {
    race: { label: 'Race bagger', car: '131 CI RACE V-TWIN', hp: 190, tq: 155, kbLat: 9, spec: {
      mass: 370, Ipitch: 150, Iyaw: 160, Iroll: 36, cgHeight: 0.68, frontWeight: 0.48,
      frontTire: 'bikeRaceF', rearTire: 'bikeRaceR', wheelRadiusF: 0.305, wheelRadiusR: 0.315, wheelRadius: 0.315, Fz0: 950,
      springF: 16000, springR: 22000, dampBumpF: 950, dampRebF: 1400, dampBumpR: 1150, dampRebR: 1700, travelDown: 0.1,
      brakeTorqueF: 530, brakeTorqueR: 100,
      bike: { kp: 170, kd: 35, vMin: 1.5, maxLean: 0.87, yawK: 30, alignK: 20, selfK: 1 },
      idleRpm: 1100, limiterRpm: 7600, redlineRpm: 7400, shiftRpm: 7300, engineInertia: 0.07,
      torqueCurve: [[0, 80], [2000, 140], [3000, 152], [4500, 155], [5500, 154], [6500, 150], [7000, 140], [7600, 120], [8000, 100]],
      autoRatios: [2.9, 2.1, 1.65, 1.36, 1.17, 1.0], autoRev: 2.9, autoFinal: 2.7, shiftTimeWOT: 0.05, shiftTimePart: 0.12, shiftCutDepth: 0.4,
      dragClutch: { rpm0: 1500, rpm1: 3000, kc: 0, base: [[0, 330]], muSlip: 0.2, slipRef: 200, rev: 100 }, wheelieCtl: 2,
      CdA: 0.5,
      bodyPts: ccPts(0.68, 0.48, 1.625, [[-0.3, 0.42, -0.3], [0.3, 0.42, -0.3], [-0.4, 0.5, 0.6], [0.4, 0.5, 0.6], [0, 0.14, 0], [0, 1.4, -0.9], [0, 1.55, 0.1], [0, 0.9, 1.1]]),
    } },
    turbo: { label: 'Turbo drag bagger', car: 'TURBO V-TWIN', hp: 400, tq: 280, kbLat: 5.8, spec: {
      mass: 430, wheelbase: 1.85, frontWeight: 0.42, Ipitch: 240,
      idleRpm: 1000, limiterRpm: 7000, redlineRpm: 6800, shiftRpm: 6700,
      torqueCurve: [[0, 80], [2000, 150], [3000, 230], [4000, 275], [5000, 280], [6000, 265], [6800, 240], [7200, 200]],
      turbo: { lag: 0.35, base: 0.5, rpm0: 2200, rpm1: 3800 }, boostMax: 16,
      autoRatios: [2.9, 2.0, 1.55, 1.28, 1.12, 1.0], autoRev: 2.9, autoFinal: 2.4, shiftTimeWOT: 0.06, shiftTimePart: 0.12, shiftCutDepth: 0.4,
      dragClutch: { rpm0: 3300, rpm1: 4800, kc: 0, base: [[0, 560]], muSlip: 0.2, slipRef: 200, rev: 100 }, wheelieCtl: 2,
      rearTire: 'bikeRaceR', CdA: 0.6,
    } },
  }, 'stock', 'Stock 117');

  // Trophy truck, built like a Baja 1000 Trophy Truck: a chromoly tube chassis under a fiberglass pickup body, ~900 hp
  // big-block V8 behind the front axle, a 3-speed Turbo 400 automatic, 39 in desert tyres, and the whole point of it:
  // ~27 in of front wheel travel on long A-arms and ~33 in at the back on a 4-link, soft springs (~1 Hz) and bypass
  // shocks that are soft through the middle of the stroke and harden toward the end - the body floats over whoops and
  // rocks at 100 mph while the wheels do the work. ~2,900 kg, 3.3 m wheelbase, 2.2 m track.
  // Three versions (CARS.trophy.make): a Spec (sealed ~525 hp LS), the Trophy Truck, and an unlimited 4WD.
  const ttPts = (cg, fw) => ccPts(cg, fw, 3.3, [...ccBox(1.08, 0.72, 1.55, -2.85, 2.7), [-0.95, 2.05, -0.3], [0.95, 2.05, -0.3], [-0.95, 2.05, 0.75], [0.95, 2.05, 0.75],
    [0, 0.62, -1.2], [0, 0.62, 1.2]]);
  CARS.trophy = { name: 'Trophy Truck', short: 'Trophy Truck', car: '9.0 L V8', hp: 900, tq: 850, cc: true, kbLat: 7, spec: {
    name: 'Trophy Truck',
    mass: 2900, Ipitch: 4800, Iyaw: 5200, Iroll: 1150, cgHeight: 0.86, wheelbase: 3.3, frontWeight: 0.52,
    trackF: 2.2, trackR: 2.2, wheelRadius: 0.495, wheelInertiaF: 6, wheelInertiaR: 6,
    frontTire: 'ttKR3', rearTire: 'ttKR3', Fz0: 7000, loadSens: 0.08,
    // (~1 Hz springs; bypass shocks: soft mid-stroke, the last 45 % of the bump stroke stiffening hard; hydraulic stops)
    springF: 25000, springR: 23000, dampBumpF: 6500, dampRebF: 10000, dampBumpR: 6500, dampRebR: 10000, dampKnee: 0.45,
    arbF: 6000, arbR: 2500, travelUp: 0.4, travelDown: 0.38, suspS0: 0.5, bumpStopK: 900000, fzMax: 220000,
    suspProg: { x0: 0.55, k: 4, damp: 4 },
    brakeTorqueF: 4600, brakeTorqueR: 3000, handbrakeTorque: 3200, noABS: true,
    maxSteer: 0.55, steerRate: 3, steerRatio: 14, ackermann: 0.6,
    idleRpm: 1000, limiterRpm: 7200, redlineRpm: 7000, shiftRpm: 6900, engineInertia: 0.28, fricA: 30, fricB: 20, starterTorque: 260,
    // (lb-ft: 850 at 5,000, ~900 hp at 6,500)
    torqueCurve: [[0, 380], [1000, 560], [2000, 690], [3000, 780], [4000, 830], [5000, 850], [6000, 810], [6500, 727], [7000, 640], [7500, 520]],
    boostMax: 0, popScale: 1,
    // Turbo 400 3-speed behind a ~3,500 rpm converter, no lockup
    autoRatios: [2.48, 1.48, 1.0], autoRev: 2.08, autoFinal: 5.9, shiftTimeWOT: 0.18, shiftTimePart: 0.3, shiftCutDepth: 0.3,
    noLockup: true, tcK: 0.0086, tcCouple: 0.88, tcStall: 2.0, driveEff: 0.88,
    lsdPreload: 900, lsdRamp: 0.4, launchRpm: 3000, engineTc: true, tcRefBody: true, noCoastBlip: true, blipMax: 0.3,
    CdA: 1.6,
    bodyHalfW: 1.1, bodyFront: -2.85, bodyRear: 2.7, bodyBottom: -0.14, bodyTop: 1.2, bodyPts: ttPts(0.86, 0.52),
    tyreEnvelope: true, wheelGyro: true,
  } };
  ccEngines('trophy', {
    spec: { label: 'Trophy Truck Spec', car: '6.2 L LS V8', hp: 525, tq: 500, spec: {
      mass: 2800, idleRpm: 900, limiterRpm: 6600, redlineRpm: 6400, shiftRpm: 6300, engineInertia: 0.2, fricA: 22, fricB: 15,
      torqueCurve: [[0, 250], [1000, 360], [2000, 430], [3000, 470], [4000, 490], [4600, 500], [5500, 480], [6000, 455], [6500, 410], [7000, 350]],
      tcK: 0.0068, lsdPreload: 700,
    } },
    awd: { label: 'Unlimited 4WD', car: '9.4 L V8 · 4WD', hp: 1050, tq: 960, spec: {
      mass: 3080, Ipitch: 5000, Iyaw: 5400, frontWeight: 0.54, wheelInertiaF: 6.5,
      torqueCurve: [[0, 430], [1000, 640], [2000, 790], [3000, 890], [4000, 945], [5000, 960], [6000, 925], [6500, 850], [7000, 740], [7500, 600]],
      tcK: 0.0095, autoFinal: 5.7,
      awd: true, awdFront: 0.42, fwd: false, lsdPreload: 700, lsdPreloadF: 350, centerPreload: 1500, lsdRamp: 0.4,
      bodyPts: ttPts(0.86, 0.54),
    } },
  }, 'tt', 'Trophy Truck');

  // Dune buggy: a VW-based sand rail - a tube frame on a diamond-plate floor, two high-back buckets, a VW beam front end on
  // coil-over shocks, swing-axle rear, the engine hung out behind the seats over the transaxle. ~560 kg with its driver,
  // 38/62 front/rear. Three versions (CARS.buggy.make): a stock 1600, a built 2276 on dual Webers, and an LS V8 swap
  const bgPts = (cg, fw, wb) => ccPts(cg, fw, wb, [...ccBox(0.72, 0.28, 1.45, -1.85, 1.6), [-0.5, 1.62, -0.45], [0.5, 1.62, -0.45], [-0.55, 1.6, 0.35], [0.55, 1.6, 0.35], [0, 0.22, 0]]);
  CARS.buggy = { name: 'Dune Buggy', short: 'Dune Buggy', car: '1600 VW FLAT FOUR', hp: 60, tq: 82, cc: true, kbLat: 7, spec: {
    name: 'Dune Buggy',
    mass: 560, Ipitch: 290, Iyaw: 330, Iroll: 120, cgHeight: 0.5, wheelbase: 2.3, frontWeight: 0.38,
    trackF: 1.42, trackR: 1.5, wheelRadius: 0.367, wheelRadiusF: 0.335, wheelRadiusR: 0.367, wheelInertiaF: 0.7, wheelInertiaR: 1.1,
    frontTire: 'buggyF', rearTire: 'buggyR', Fz0: 1500, loadSens: 0.1,
    springF: 5600, springR: 9800, dampBumpF: 650, dampRebF: 950, dampBumpR: 950, dampRebR: 1400, dampKnee: 0.4,
    arbF: 0, arbR: 0, travelUp: 0.16, travelDown: 0.14, suspS0: 0.25,
    brakeTorqueF: 650, brakeTorqueR: 520, handbrakeTorque: 700, noABS: true,
    maxSteer: 0.6, steerRate: 4, steerRatio: 12, ackermann: 0.5,
    idleRpm: 850, limiterRpm: 5000, redlineRpm: 4800, shiftRpm: 4600, engineInertia: 0.08, fricA: 6, fricB: 4, starterTorque: 60,
    // (lb-ft: 82 at 3,000, ~60 hp at 4,400)
    torqueCurve: [[0, 40], [1000, 62], [2000, 74], [3000, 82], [3500, 81], [4000, 76], [4400, 71], [5000, 60], [5500, 48]],
    boostMax: 0, popScale: 0.5,
    // the VW 4-speed transaxle (3.80 / 2.06 / 1.26 / 0.89, 4.375 ring and pinion), shifted for you
    autoRatios: [3.8, 2.06, 1.26, 0.89], autoRev: 3.88, autoFinal: 4.375, shiftTimeWOT: 0.35, shiftTimePart: 0.45, shiftCutDepth: 1,
    launchRpm: 2200, engineTc: true,
    dragClutch: { rpm0: 1100, rpm1: 2100, kc: 0, base: [[0, 180]], muSlip: 0.15, slipRef: 150, rev: 150 },
    lsdPreload: 20, lsdRamp: 0, driveEff: 0.92,
    CdA: 1.05,
    bodyHalfW: 0.78, bodyFront: -1.85, bodyRear: 1.6, bodyBottom: -0.22, bodyTop: 1.12, bodyPts: bgPts(0.5, 0.38, 2.3),
  } };
  ccEngines('buggy', {
    built: { label: 'Built 2276 VW', car: '2276 VW · DUAL WEBERS', hp: 150, tq: 150, spec: {
      mass: 575, idleRpm: 950, limiterRpm: 6500, redlineRpm: 6300, shiftRpm: 6100, engineInertia: 0.085, fricA: 8, fricB: 5,
      torqueCurve: [[0, 70], [1000, 95], [2000, 120], [3000, 138], [4200, 150], [5000, 145], [5800, 136], [6300, 118], [6800, 95]],
      autoFinal: 4.125, shiftTimeWOT: 0.3,
      dragClutch: { rpm0: 1300, rpm1: 2600, kc: 0, base: [[0, 280]], muSlip: 0.15, slipRef: 150, rev: 200 },
      lsdPreload: 60, brakeTorqueF: 800, brakeTorqueR: 600,
    } },
    ls: { label: 'LS3 V8 sand rail', car: '6.2 L LS3 V8', hp: 480, tq: 475, spec: {
      mass: 790, Ipitch: 380, Iyaw: 430, Iroll: 150, cgHeight: 0.52, frontWeight: 0.36,
      // (long-travel arms: ~19 in at the back)
      springF: 7200, springR: 14500, dampBumpF: 900, dampRebF: 1400, dampBumpR: 1500, dampRebR: 2200, travelUp: 0.26, travelDown: 0.22, suspS0: 0.34,
      idleRpm: 800, limiterRpm: 6600, redlineRpm: 6400, shiftRpm: 6300, engineInertia: 0.16, fricA: 20, fricB: 14, starterTorque: 180,
      torqueCurve: [[0, 250], [1000, 330], [2000, 400], [3000, 440], [4000, 465], [4700, 475], [5500, 450], [5900, 427], [6400, 380], [6800, 330]],
      // (a 4-speed sequential race transaxle)
      autoRatios: [2.93, 1.94, 1.39, 1.03], autoRev: 3.0, autoFinal: 3.89, shiftTimeWOT: 0.12, shiftTimePart: 0.2, shiftCutDepth: 0.5,
      dragClutch: { rpm0: 1400, rpm1: 2800, kc: 0, base: [[0, 900]], muSlip: 0.15, slipRef: 150, rev: 500 },
      lsdPreload: 250, lsdRamp: 0.3, brakeTorqueF: 1300, brakeTorqueR: 1100, handbrakeTorque: 1100,
      bodyPts: bgPts(0.52, 0.36, 2.3),
    } },
  }, 'vw', '1600 VW');
  // the tank's other two: the governor off (the same turbine geared taller, ~58 mph) and a hot-rodded 3,000 hp turbine
  ccEngines('tank', {
    ungov: { label: 'Ungoverned', car: '1,500 HP TURBINE', spec: { autoFinal: 3.15 } },
    hot: { label: '3,000 hp hot rod', car: '3,000 HP TURBINE', hp: 3000, tq: 7900, spec: {
      torqueCurve: [[0, 7000], [1000, 7900], [1500, 7600], [2000, 7000], [2500, 6300], [3000, 5252], [3300, 4000]], autoFinal: 2.55, tcK: 0.3, lockupTorque: 18000,
    } },
  }, 'gov', 'Governed');
  // the Cybertruck's other two: the Long Range RWD - one motor at the back, ~350 hp, 2,850 kg, 0-60 ~6.2 s, 112 mph -
  // and the Cyberbeast - three motors (one front, two at the back), 845 hp, 3,104 kg, 0-60 2.6 s, 130 mph
  ccEngines('cyber', {
    rwd: { label: 'Long Range RWD', car: 'SINGLE MOTOR RWD', hp: 350, tq: 360, ev: true, spec: {
      mass: 2850, frontWeight: 0.49, awd: false, torqueCurve: evCurve(600, 275, 12800), lsdPreload: 60, lsdRamp: 0.15,
    } },
    beast: { label: 'Cyberbeast', car: 'TRI MOTOR AWD', hp: 845, tq: 930, ev: true, spec: {
      mass: 3104, torqueCurve: evCurve(1500, 630, 14800), limiterRpm: 14100, redlineRpm: 14100, awdFront: 0.4, lsdPreload: 60,
    } },
  }, 'awd', 'All-Wheel Drive');
  // Fun-tab tuning: rebuild spec s from the stock spec b and the tune t (shared by the game and the tests)
  function tuneSpec(s, b, t) {
    // (an electric motor has no boost, idle, nitrous, exhaust or launch rpm: those settings leave it alone)
    const EVb = !!b.electric;
    const pr = EVb ? 1 : (1 + t.boost / 14.7) / (1 + b.boostMax / 14.7);          // supercharger pressure ratio vs stock
    s.torqueScale = (b.torqueScale || 1) * t.power * pr;
    s.boostMax = EVb ? 0 : t.boost; s.rpmStretch = t.stretch;
    s.limiterRpm = t.limiter; s.redlineRpm = t.limiter - (b.limiterRpm - b.redlineRpm);
    s.noLimiter = !!t.nolimit;          // (the slider value still sets the redline and the automatic's shift points)

    if (b.shiftRpm) s.shiftRpm = t.limiter - (b.limiterRpm - b.shiftRpm);
    s.idleRpm = EVb ? b.idleRpm : t.idle; s.engineInertia = b.engineInertia * t.inertia;
    s.nosHp = EVb ? 0 : t.nos; s.popScale = EVb ? 0 : t.pops;
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
    // (the tuned downforce - lb at 150 mph - on top of what the car is built with: rally cars, the jet cart)
    s.gripScale = t.grip; s.ClA = (b.ClA || 0) + t.downforce * 4.448 / (0.5 * 1.225 * 67.06 * 67.06);
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
      if (c.slipRef) s.dragClutch.slipRef = c.slipRef * st;
    }
    // (a governed rental kart: the rev-limit slider moves the governor with it; no limiter = no governor)
    if (b.governorRpm) s.governorRpm = t.nolimit ? undefined : b.governorRpm + t.limiter - b.limiterRpm;
    s.dragScale = t.drag;
    s.lockupTorque = b.lockupTorque * Math.max(1, cap);
    s.clutchTorque = b.clutchTorque * Math.max(1, cap);
    s.lsdPreload = b.lsdPreload * Math.max(1, Math.sqrt(tr));
    return s;
  }
  const API = { Vehicle, SPEC, TIRES, CARS, MF, curveAt, RAD2RPM, RPM2RAD, LBFT, tuneSpec, windage, OFFROAD_PKG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.HCVehicle = API;
})(typeof self !== 'undefined' ? self : this);
