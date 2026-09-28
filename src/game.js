/* Hellcat Drive — main: wires world, physics, model, audio, input, HUD, menus and cameras together. */
(async function () {
  'use strict';
  const W = window.HCWorld, VEH = window.HCVehicle, AUD = window.HCAudio, INP = window.HCInput;
  const CAR = window.HCCarModel, WR = window.HCWorldRender, FX = window.HCFx, HUDM = window.HCHud, PULL = window.HCPuller, DRAGM = window.HCDragster, MON = window.HCMonster, KRT = window.HCKart;
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const MPH = 2.23694;

  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  } catch (e) {
    $('padstatus').innerHTML = '<b style="color:#f55">Could not load the 3D engine (three.js) from cdn.jsdelivr.net — an internet connection is required.</b>';
    $('startBtn').disabled = true;
    return;
  }

  // ------------------------------------------------------------------ settings
  const DEFAULTS = {
    car: 'hellcat', fuel: 'e85', tree: 'pro', rollout: true, pullerEng: 'hemi4', dragClass: 'tf', kartClass: 'tag',
    trans: 'auto', rearTire: 'street', dpRear: 'etdrag', offroad: {}, tcMode: 0, ver: 2, abs: true, paint: 'TorRed', time: 'day', units: 'mph',
    viewDist: 1700, treeDensity: 1, shadows: true, resScale: 1, fov: 66, seatY: 0, seatZ: 0, chaseFov: 62, showHud: true, showInputs: true, showPerf: true,
    map: 'country', rsMode: 'auto', airAssist: true, vol: 0.8, engVol: 1, fxVol: 1, camMode: 0, cockpitWheel: 'match', wheelDeg: 180, clutchPedal: false, arcadeReverse: true, cockpitHud: false,
  };
  let S;
  try { S = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('hc_settings')) || {}); } catch (e) { S = Object.assign({}, DEFAULTS); }
  if (S.ver !== DEFAULTS.ver) { S.tcMode = DEFAULTS.tcMode; S.ver = DEFAULTS.ver; }
  const saveS = () => { try { localStorage.setItem('hc_settings', JSON.stringify(S)); } catch (e) { /* storage unavailable */ } };

  // ------------------------------------------------------------------ renderer / scene
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(S.chaseFov, 1, 0.1, 6000);
  function resize() {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * S.resScale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  W.setMap(S.map);
  const world = WR.create(THREE, scene, W, { viewDist: S.viewDist, treeDensity: S.treeDensity, shadows: S.shadows });
  world.setTime(S.time, renderer);

  // ------------------------------------------------------------------ vehicle
  // "More cars" (the tractor, and whatever joins it) build their entry from their options, e.g. the engine package
  const PULLER = S.car === 'puller', DRAGSTER = S.car === 'dragster', MONSTER = S.car === 'monster', KART = S.car === 'kart';
  const BIG = PULLER || DRAGSTER || MONSTER || KART;     // race engines: their own sound set-up, rumble and shake
  const CARDEF = PULLER ? VEH.CARS.puller.make(S.pullerEng) : DRAGSTER ? VEH.CARS.dragster.make(S.dragClass) : MONSTER ? VEH.CARS.monster
    : KART ? VEH.CARS.kart.make(S.kartClass)
    : (VEH.CARS[S.car] && !VEH.CARS[S.car].more ? VEH.CARS[S.car] : VEH.CARS.hellcat);
  const DEMON = S.car === 'demon', DRAGPAK = S.car === 'dragpak';
  const NITRO = DRAGSTER && CARDEF.cls !== 'tad', FUNNY = DRAGSTER && CARDEF.cls === 'fc';   // (Top Fuel and the Funny Car burn nitro)
  const FIXED = DEMON || DRAGPAK || PULLER || DRAGSTER || MONSTER || KART;   // factory-fixed driveline and tyres
  // chase camera: distance / height scale (the tractor is 7 m long and 2.4 m tall; a dragster is 9 m long with its
  // wing 2.2 m up, so the camera sits further back and higher to see over it)
  // (the monster truck is 12 ft tall and 12.5 ft wide: further back and well up)
  // (a kart is 6 ft long and sits a foot off the ground: in close and low)
  const CAMK = PULLER ? 1.65 : FUNNY ? 1.15 : DRAGSTER ? 1.3 : MONSTER ? 1.55 : KART ? 0.55 : 1, CAMH = PULLER ? 1.65 : FUNNY ? 1.2 : DRAGSTER ? 1.45 : MONSTER ? 2.05 : KART ? 0.55 : 1;
  const FINISH = CARDEF.finishFt === 1000 ? 1000 : 1320;   // Top Fuel races to 1,000 ft
  const carSpec = Object.assign({}, CARDEF.spec);
  if (DEMON && S.fuel === 'e10') carSpec.torqueScale = (carSpec.torqueScale || 1) * 0.865;
  const veh = new VEH.Vehicle({ C: W.C, ground: W.ground, collidersNear: W.collidersNear }, carSpec);
  veh.setTransmission(FIXED ? 'auto' : S.trans);
  // off-road package, saved per car: KO2 all-terrains + lift on the road cars; each of the More Cars gets its own
  const OFFROAD = () => !!(S.offroad && S.offroad[S.car]);
  const PKG = VEH.OFFROAD_PKG(S.car, CARDEF.cls);
  const PKG_UI = PULLER ? ['R-2 deep lugs', 'R-2 deep lugs + lug fronts', 'Firestone R-2 30.5L-32 "cane & rice" rears left uncut (lugs twice as deep as a farm tyre, never sharpened) and lugged 11L-15 fronts. '
      + 'They paddle through mud and dig into turf, and it steers in the soft stuff · the sharpened pullers bite harder on hard-packed clay, and on pavement the tall lugs squirm and thump. ~2 in taller (re-geared to match), ~130 lb heavier each']
    : DRAGSTER ? ['Sand-drag paddles', 'Paddles + rib fronts', 'The sand-drag setup: paddle tyres (a smooth carcass with ~1.5 in rubber paddles across the tread) and ribbed sand fronts. The paddles shovel the ground - huge bite on dirt and gravel '
      + '(the quickest sand dragster does 300 ft in 2.16 s @ 156 mph) - but next to none on pavement or a prepped strip, and little side grip anywhere. Try the Dirt Drag map']
    : MONSTER ? ['Full-depth lugs', 'Full-depth lugs', 'The BKTs left full-depth, as moulded, instead of shaved and hand-cut for a stadium floor: ~1 in more lug and ~100 lb more rubber each. '
      + 'More grip in mud, turf and loose dirt (it corners harder off the pavement), about the same bite on the arena clay, less on pavement, and a touch slower to spin up']
    : KART ? ['Knobbies', 'Knobbies + sprocket', 'Knobby off-road tyres on 6 in rims (12x5.00-6 front, 13x6.50-6 rear) with a bigger rear sprocket to match: an inch more ground clearance and three times the grip '
      + 'on dirt and grass - and a lot less on pavement, where the knobs squirm and it slides']
    : ['KO2 all-terrains · 2" lift', 'KO2 all-terrains + 2" lift', 'BFGoodrich All-Terrain T/A KO2 LT285/55R20 on all four corners (32 in tall, ~70 lb each)' + (DRAGPAK ? ' on 20 in wheels' : '') + ' + 2 in lift and extra droop. '
      + 'Far more bite on dirt, gravel and grass, more ground clearance and gentle, catchable slides · on pavement: close to the street tyres with a little less grip, tread hum, and taller effective gearing'];
  const tireF = () => (OFFROAD() ? PKG.front : FIXED ? carSpec.frontTire : 'street');
  const tireR = () => (OFFROAD() ? PKG.rear : DRAGPAK ? (S.dpRear || 'etdrag') : FIXED ? carSpec.rearTire : S.rearTire);
  veh.setTires(tireF(), tireR());
  veh.tcMode = S.tcMode; veh.absOn = S.abs;
  const DRAGMAP = S.map === 'drag' || S.map === 'dirtdrag', DIRTSTRIP = S.map === 'dirtdrag', ARENAMAP = S.map === 'arena';
  const spawn = DRAGMAP ? { x: W.DRAG.LANE, y: 0, z: W.DRAG.SPAWN_Z, tx: 0, tz: -1 }
    : ARENAMAP ? W.nearestRoadSpot(W.ARENA.SPAWN_X, W.ARENA.SPAWN_Z, 0, -1)
    : S.map === 'straight' ? W.nearestRoadSpot(0, 0, 0, -1) : S.map === 'tarmac' ? W.nearestRoadSpot(W.TARMAC.SPAWN_X, W.TARMAC.SPAWN_Z, 0, -1)
    : W.nearestRoadSpot(30, 40, 0, -1);
  veh.reset(spawn.x, spawn.y, spawn.z, spawn.tx, spawn.tz);
  const sp = veh.spec;

  // ------------------------------------------------------------------ Fun tab: live tuning (saved per car)
  const STOCK = JSON.parse(JSON.stringify(veh.spec));
  const tuneDefaults = () => ({
    power: 1, boost: STOCK.boostMax, stretch: 1, limiter: STOCK.limiterRpm, nolimit: false, idle: STOCK.idleRpm, inertia: 1, nos: 0, pops: 1, whine: 1,
    finalAuto: STOCK.autoFinal, finalManual: STOCK.manualFinal, shiftTime: STOCK.shiftTimeWOT || 0.22, launch: STOCK.launchRpm || 4000, gov: true,
    mass: STOCK.mass, grip: 1, downforce: 0, drag: 1, brakes: 1, stiff: 1, steer: 1, gravity: 1, smoke: 1,
  });
  S.tune = S.tune || {};
  const TKEY = PULLER ? 'puller_' + CARDEF.engine : DRAGSTER ? 'dragster_' + CARDEF.cls : KART ? 'kart_' + CARDEF.cls : S.car;
  const tune = Object.assign(tuneDefaults(), S.tune[TKEY] || {});
  S.tune[TKEY] = tune;
  function applyTune() {
    VEH.tuneSpec(veh.spec, STOCK, tune);
    veh.launchRpm = tune.launch;
    veh.applySpec();
  }
  applyTune();
  // peak figures for the readout, scaled to the car's rated numbers
  function peakFigures(s) {
    let hp = 0, tq = 0;
    for (let r = 800; r <= s.limiterRpm; r += 50) {
      const lbft = VEH.curveAt(s.torqueCurve, r / (s.rpmStretch || 1)) * (s.torqueScale || 1) - VEH.windage(s, r) / VEH.LBFT;
      tq = Math.max(tq, lbft); hp = Math.max(hp, lbft * r / 5252);
    }
    return { hp, tq };
  }
  const STOCK_PEAK = peakFigures(STOCK);
  // headless quarter-mile run with the current tune (same physics, flat track)
  function simulateQuarter() {
    const surf = DIRTSTRIP ? 3 : DRAGMAP ? 5 : 0;
    const flat = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
    const v = new VEH.Vehicle(flat, JSON.parse(JSON.stringify(veh.spec)));
    v.setTransmission(veh.transType); v.setTires(veh.spec.frontTire, veh.spec.rearTire); v.applySpec();
    v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = veh.spec.idleRpm / VEH.RAD2RPM; v.park = false; v.gear = 1; v.tcMode = veh.tcMode; v.launchRpm = veh.launchRpm;
    for (let i = 0; i < 60; i++) { v.input.brake = 1; v.step(1 / 60); }
    v.input.brake = 0;
    for (const w of v.wheels) if (!w.front) w.temp = 75;
    v.input.handbrake = 1; v.input.throttle = 1;
    for (let i = 0; i < 150; i++) v.step(1 / 120);
    v.input.handbrake = 0;
    const dt = 1 / 120, z0 = v.pz, MPHc = 2.23694, res = {};
    let t = 0, tStart = null, prevD = 0, trapT = {};
    const marks = [[18.288, 'ft60'], [201.168, 'e8'], [304.8, 'k1'], [402.336, 'q']];
    for (; t < 30; t += dt) {
      if (v.transType === 'manual' && (v.rpm() > v.spec.limiterRpm - 150 || (v.farLimiter() && v.upshiftGain(v.rpm()) >= 1)) && v.gear > 0 && v.gear < v.nGears && v.shiftTimer <= 0) v.shiftUp();
      v.step(dt);
      const moved = z0 - v.pz;
      if (tStart === null && moved >= 0.3048) tStart = t;
      if (tStart === null) continue;
      const d = moved - 0.3048, cross = (m) => (t - dt) + dt * (m - prevD) / Math.max(1e-6, d - prevD);
      for (const [m, k] of marks) {
        if (trapT[k] === undefined && d >= m - 20.117) trapT[k] = cross(m - 20.117);
        if (res[k] === undefined && d >= m) { const tc = cross(m); res[k] = tc - tStart; res[k + 'mph'] = 20.117 / (tc - trapT[k]) * MPHc; }
      }
      if (res.z60 === undefined && v.forwardSpeed * MPHc >= 60) res.z60 = t - tStart;
      prevD = d;
      if (res.q !== undefined) break;
    }
    if (res.q === undefined) return 'Did not reach the ¼ mile in 30 s — too much wheelspin or not enough power.';
    const k1 = `1,000 ft ${res.k1.toFixed(3)} s @ ${res.k1mph.toFixed(1)} mph`;
    return `${surf === 5 ? 'Prepped strip' : surf === 3 ? 'Dirt strip' : 'Street asphalt'}: 60 ft ${res.ft60.toFixed(3)} s · 0-60 ${res.z60 ? res.z60.toFixed(2) : '--'} s · ⅛ ${res.e8.toFixed(3)} s @ ${res.e8mph.toFixed(1)} mph · `
      + (FINISH === 1000 ? `<b>${k1}</b> · ¼ ${res.q.toFixed(3)} s @ ${res.qmph.toFixed(1)} mph` : (DRAGSTER ? k1 + ' · ' : '') + `<b>¼ ${res.q.toFixed(3)} s @ ${res.qmph.toFixed(1)} mph</b>`);
  }
  const TUNE_PRESETS = {
    stock: () => tuneDefaults(),
    stage2: () => Object.assign(tuneDefaults(), { power: 1.2, boost: STOCK.boostMax + 3, limiter: STOCK.limiterRpm + 300, inertia: 0.85, grip: 1.1, shiftTime: (STOCK.shiftTimeWOT || 0.22) * 0.8, pops: 1.5 }),
    unhinged: () => Object.assign(tuneDefaults(), { power: 1.9, boost: STOCK.boostMax + 10, stretch: 1.2, limiter: STOCK.limiterRpm + 1500, inertia: 0.7, grip: 1.5, downforce: 1200,
      gov: false, nos: 300, pops: 3, whine: 1.6, smoke: 2, shiftTime: 0.1, brakes: 1.6, stiff: 1.3,
      finalAuto: STOCK.autoFinal * 0.88, finalManual: STOCK.manualFinal * 0.88 }),     // taller gearing for all that power
    moon: () => Object.assign(tuneDefaults(), { gravity: 0.17, smoke: 2 }),
  };
  const carOpts = { variant: DRAGPAK ? 'dragpak' : DEMON ? 'demon' : 'hellcat', paint: S.paint, cgHeight: sp.cgHeight, zOff: (sp.cgToRear - sp.cgToFront) / 2, cgToFront: sp.cgToFront, cgToRear: sp.cgToRear, trackF: sp.trackF, trackR: sp.trackR };
  const car = PULLER ? PULL.build(THREE, Object.assign(carOpts, { engine: CARDEF.engine })) : DRAGSTER ? DRAGM.build(THREE, Object.assign(carOpts, { cls: CARDEF.cls }))
    : MONSTER ? MON.build(THREE, carOpts) : KART ? KRT.build(THREE, Object.assign(carOpts, { cls: CARDEF.cls })) : CAR.build(THREE, carOpts);
  scene.add(car.root);
  car.setTires(tireF(), tireR()); car.setTransmission(veh.transType);

  const smoke = new FX.Particles(THREE, scene, 2800);
  smoke.setCamera(camera);
  const skids = new FX.Skids(THREE, scene, 9000);
  const SOIL = [null, [0.3, 0.27, 0.22], [0.2, 0.19, 0.09], [0.27, 0.19, 0.11]];   // rut colours: gravel, grass (torn turf), dirt
  const flames = new FX.Flames(THREE, car.root, car.exhaustTips);
  const audio = new AUD.CarAudio();
  const input = new INP.Input();
  const hud = new HUDM.HUD(W); hud.units = S.units;
  const perf = new HUDM.PerfTimers(); perf.rollout = S.rollout;

  // ------------------------------------------------------------------ state
  const G = { started: false, paused: true, menu: false, lightsOn: false, horn: false, arcadeT: 0, time: 0, rearMan: 0, flipHintT: 0, lastEv: { shift: 0, backfire: 0, grind: 0 }, emitAcc: [0, 0, 0, 0], rumbleT: 0, loadDone: false, shake: 0 };
  const cam = { mode: S.camMode | 0, fwd: new THREE.Vector3(0, 0, -1), off: new THREE.Vector3(), yS: 0, vyS: 0, orbitYaw: 0, orbitPitch: 0, orbitT: 0, dragging: false, headYaw: 0, head: new THREE.Vector3(), zoom: 1, init: false };
  const TC_NAMES = ['STREET', 'SPORT', 'TRACK', 'OFF'];
  const RS_NAMES = { auto: 'AUTO (counter-steer)', crab: 'CRAB', manual: 'MANUAL (, and .)', front: 'FRONT ONLY' };
  const VIEW_NAMES = ['CHASE CAM', 'FAR CHASE CAM', 'COCKPIT'];

  // ------------------------------------------------------------------ helpers
  const tmpG = { h: 0, nx: 0, ny: 1, nz: 0, surface: 0 };
  const groundH = (x, z) => { W.ground(x, z, tmpG); return tmpG.h; };
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Euler();
  function carAxes() {
    const { qx, qy, qz, qw } = veh;
    return {
      fx: -2 * (qx * qz + qy * qw), fy: -2 * (qy * qz - qx * qw), fz: -(1 - 2 * (qx * qx + qy * qy)),
      rx: 1 - 2 * (qy * qy + qz * qz), ry: 2 * (qx * qy + qz * qw), rz: 2 * (qx * qz - qy * qw),
      ux: 2 * (qx * qy - qz * qw), uy: 1 - 2 * (qx * qx + qz * qz), uz: 2 * (qy * qz + qx * qw),
    };
  }
  function resetCar() {
    const a = carAxes();
    const spot = DRAGMAP ? spawn : W.nearestRoadSpot(veh.px, veh.pz, a.fx, a.fz);
    const keepRunning = veh.running;
    veh.reset(spot.x, spot.y, spot.z, spot.tx, spot.tz);
    veh.running = keepRunning;
    if (!keepRunning) veh.startEngine();
    if (veh.transType === 'auto') { veh.park = false; veh.gear = 1; }
    skids.last = [null, null, null, null];
    cam.init = false;
    hud.toast(DIRTSTRIP ? 'Back behind the line' : DRAGMAP ? 'Back to the burnout box' : ARENAMAP ? 'Back on its wheels' : 'Car reset');
    if (DRAGMAP) dragReset();
  }
  function applyVehicleSettings() {
    veh.tcMode = S.tcMode; veh.absOn = S.abs;
    if (!FIXED && veh.transType !== S.trans) { veh.setTransmission(S.trans); car.setTransmission(S.trans); }
    veh.setTires(tireF(), tireR()); car.setTires(tireF(), tireR());
    perf.rollout = S.rollout;
    car.setPaint(S.paint);
    hud.units = S.units;
  }

  // ------------------------------------------------------------------ title / loading
  const loadBar = document.querySelector('#loadbar i');
  $('startBtn').addEventListener('click', startGame);
  for (const b of document.querySelectorAll('#mapPick button')) {
    b.classList.toggle('on', b.dataset.map === S.map);
    b.addEventListener('click', () => { if (b.dataset.map !== S.map) { S.map = b.dataset.map; saveS(); location.reload(); } });
  }
  window.addEventListener('keydown', (e) => { if (!G.started && (e.code === 'Enter' || e.code === 'Space') && G.loadDone) startGame(); });
  async function startGame() {
    if (G.started) return;
    G.started = true;
    $('startBtn').textContent = 'Starting…';
    try { await audio.init(); audio.resume(); } catch (e) { console.warn('audio init failed', e); }
    $('title').classList.add('hidden');
    $('hud').classList.toggle('hidden', !S.showHud);
    G.paused = false;
    veh.startEngine();
    cam.init = false;
    if (PULLER) setTimeout(() => hud.hint('Pulling tractor: shift up (E) for DRIVE, hold SPACE and floor it, let go of SPACE to dump the clutch. On dirt it stands up on its weight bar — lift to steer! Ease into the throttle in turns.', 9), 1600);
    else if (DRAGSTER) setTimeout(() => hud.hint(CARDEF.short + ' dragster: shift up (E) for DRIVE. Burnout: hold B and floor it (it rolls — no front brakes). Stage, hold SPACE (clutch pedal) and floor it, let go on green. '
      + (DRAGMAP ? 'The chutes pop by themselves past the ' + (FINISH === 1000 ? '1,000 ft' : '¼ mile') + ' line (F pulls them).' : 'It lives on the Drag Strip map (Esc → Drive → Map).'), 11), 1600);
    else if (KART) setTimeout(() => hud.hint('Go-kart: shift up (E) for DRIVE and floor it. No suspension and a solid rear axle: brake in a straight line, turn in smoothly, let it roll through the corner.'
      + (CARDEF.cls === 'kz' ? ' KZ shifter: 6 gears - E / Q or the paddles (M holds it in manual).' : CARDEF.cls === 'tag' ? ' The clutch is fully in by 6,000 rpm, so it pulls away off the pipe - it comes alive past ~9,000.' : ''), 10), 1600);
    else if (MONSTER) setTimeout(() => hud.hint('Monster truck: shift up (E) for DRIVE. All four wheels drive AND steer: G cycles the rear steering (AUTO / CRAB / MANUAL with , and .). '
      + 'In the air, GAS lifts the nose and BRAKE drops it (air assist keeps it landable - turn it off in Esc → Drive for flips). Rolled it? Steer left or right to flip it back over.'
      + (ARENAMAP ? '' : ' Its home is the Monster Arena map (Esc → Drive → Map).'), 12), 1600);
    else if (ARENAMAP) setTimeout(() => hud.hint('Monster Arena: the big gap jump straight ahead with a step-up (left) and a whoops lane (right) either side of it, the car crush and the tabletop halfway down the sides, whoops behind you. Tricks score on the big screens. (The monster truck lives here: Esc → More cars.)', 11), 1600);
    else if (DIRTSTRIP) setTimeout(() => hud.hint('Dirt drag strip: no burnout here. Creep up to stage, hold SPACE + floor it, let go of SPACE on green. Slicks skate on dirt — all-terrains and pulling tyres dig in.', 9), 1600);
    else if (DRAGMAP) setTimeout(() => hud.hint('Burnout in the box (hold B, or brake + throttle), then creep up to stage. Hold SPACE + floor it — let go of SPACE on green!', 9), 1600);
    else setTimeout(() => hud.hint(veh.transType === 'auto' ? 'In PARK — throttle revs the engine. Shift up (E / right paddle) for DRIVE.' : 'In NEUTRAL — throttle revs the engine. Shift up (E / right paddle) for 1st gear.', 6), 1600);
    if (input.needsSetup()) setTimeout(() => hud.hint('Wheel detected without a standard mapping — press Esc → Controls → Wheel setup', 8), 8000);
  }
  document.addEventListener('pointerdown', () => { if (audio.ready) audio.resume(); });
  // no engine droning from a background tab
  document.addEventListener('visibilitychange', () => {
    if (!audio.ready) return;
    if (document.hidden) audio.suspend(); else audio.resume();
  });
  document.addEventListener('keydown', () => { if (audio.ready) audio.resume(); });

  // ------------------------------------------------------------------ mouse orbit / zoom
  canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) { cam.dragging = true; cam.lx = e.clientX; cam.ly = e.clientY; } });
  window.addEventListener('pointerup', () => { cam.dragging = false; cam.orbitT = 1.2; });
  window.addEventListener('pointermove', (e) => {
    if (!cam.dragging) return;
    cam.orbitYaw -= (e.clientX - cam.lx) * 0.006; cam.orbitPitch = clamp(cam.orbitPitch + (e.clientY - cam.ly) * 0.004, -0.5, 0.9);
    cam.lx = e.clientX; cam.ly = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => { cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.6, 2.2); }, { passive: true });

  // ------------------------------------------------------------------ menu
  const TABS = ['Drive', 'Fun', 'Controls', 'Graphics', 'Audio', 'Help'];
  let curTab = 'Drive';
  function openMenu(v) {
    G.menu = v;
    $('menu').classList.toggle('hidden', !v);
    G.paused = v || !G.started;
    if (v) input.stopRumble();              // (paused: no vibration left running under the menu)
    if (audio.ready) audio.master.gain.setTargetAtTime(v ? 0.25 : 1, audio.ctx.currentTime, 0.1);
    if (v) renderMenu();
  }
  $('mResume').addEventListener('click', () => openMenu(false));
  // "More cars": everything beyond the three Challengers. One entry per vehicle; options (e.g. engine packages) are
  // picked right on its card. Add a vehicle here (plus its CARS entry / model) and it shows up in the panel.
  const MORE_CARS = [
    { id: 'puller', name: 'MODIFIED PULLING TRACTOR', paint: 'B5 Blue',
      sub: 'Up to 9,900 hp · 30.5L-32 cut pulling tyres · weight bar · wheelies · open cockpit',
      desc: 'A European "Modified 3.6 t" class tractor puller: tube frame, no suspension, slider clutch into a 3-speed planetary box, spool, and a weight bar that catches it when the front comes up — which, on dirt, it will. Deafening.',
      btn: 'PULLING TRACTOR', tc: 2, optKey: 'pullerEng', options: [
        ['hemi4', '4× blown HEMI', 'Four 500 ci methanol HEMIs with 14-71 blowers · 9,900 hp · 8,600 rpm · zoomie headers'],
        ['v12', '2× Allison V12', 'Two 28 L WWII-fighter V-1710s, supercharged · 6,400 hp · 10,400 lb-ft · 4,000 rpm'],
      ] },
    { id: 'dragster', name: 'DRAGSTERS', paint: 'Pitch Black',
      sub: 'Top Fuel & Top Alcohol rails and a nitro Funny Car · supercharged HEMIs · 36 in slicks that grow at speed · twin chutes · 5 g launches',
      desc: 'A 25 ft chromoly rail with a blown HEMI right behind your helmet - or the Funny Car: the same engine in front of you under a carbon body, on a wheelbase half as long. No gearbox to speak of: a multi-disc clutch slips by design for most of the run while the timers bring it in, the slicks grow inches taller at speed and the wing pins it down. Rear brakes only — the chutes do the stopping. Best on the Drag Strip map.',
      btn: 'DRAGSTER', tc: 2, optKey: 'dragClass', options: [
        ['tf', 'Top Fuel', '11,000 hp nitromethane HEMI · direct drive · 1,000 ft in ~3.64 s @ 335+ mph · 0-100 mph in 0.8 s', 'Pitch Black'],
        ['fc', 'Funny Car', 'The same 11,000 hp nitro HEMI under a carbon flip-top body · 125 in wheelbase · wheelie bars · 1,000 ft in ~3.88 s @ 330 mph', 'TorRed'],
        ['tad', 'Top Alcohol', '3,900 hp blown methanol HEMI · 2-speed · ¼ mile in ~5.2 s @ 275 mph', 'Frostbite'],
      ] },
    { id: 'kart', name: 'GO-KARTS', paint: 'B5 Blue',
      sub: 'Rental, TaG 125 and KZ shifter karts · 2-stroke screamers to 16,000 rpm · no suspension, solid rear axle · 1.3 g in the corners',
      desc: 'A tube frame a few inches off the ground, an engine beside the seat driving the rear axle by chain, direct steering and slicks the size of dinner plates. No suspension and no differential - the frame flexes, the inside rear tyre lifts, and you feel every ripple. The rental kart is slow and forgiving behind its wraparound bumper; the TaG 125 is a proper race kart; the KZ shifter is a 48 hp, 6-speed rocket that brakes on all four wheels.',
      btn: 'GO-KART', tc: 3, optKey: 'kartClass', options: [
        ['rental', 'Rental kart', '390 cc 4-stroke · ~13 hp · centrifugal clutch · wraparound bumper · hard tyres · ~31 mph', 'Go Mango'],
        ['tag', 'TaG 125', 'X30-type 125 cc 2-stroke · ~30 hp at 13,000 · centrifugal clutch · 158 kg · ~74 mph', 'B5 Blue'],
        ['kz', 'KZ shifter', '125 cc 2-stroke · ~48 hp · 6-speed sequential · 4-wheel brakes · 0-60 in ~4 s · ~95 mph', 'TorRed'],
      ] },
    { id: 'monster', name: 'MONSTER TRUCK', paint: 'Go Mango', map: 'arena',
      sub: '12,000 lb · 1,500 hp blown 540 · 66 in tyres · 30 in of travel · 4-wheel drive & 4-wheel steering · its own stadium',
      desc: 'Built to the stadium freestyle spec: a chromoly tube chassis under a fiberglass body, the driver strapped in the middle, a supercharged methanol big-block behind them, planetary axles on nitrogen shocks with 30 inches of travel, and 66-inch tyres the crew hand-cuts into paddles. Both axles steer. It comes with the Monster Arena: a big gap jump, a tabletop, whoops and a pile of junk cars that really crush. Gas lifts the nose in the air, the brake drops it.',
      btn: 'MONSTER TRUCK', tc: 3 },
  ];
  const MORE_IDS = MORE_CARS.map((m) => m.id);
  function pickCar(id, opt) {
    const m = MORE_CARS.find((x) => x.id === id);
    if (id === S.car && (!m || !opt || S[m.optKey] === opt)) { $('moreCars').classList.add('hidden'); return; }
    const o = m && opt && m.options ? m.options.find((x) => x[0] === opt) : null;
    if (m && ((id !== S.car && m.paint) || (o && o[3] && S[m.optKey] !== opt))) S.paint = (o && o[3]) || m.paint;
    // the tractor and the dragsters start on Track traction control (on the road, throttle in a turn would otherwise
    // just swap ends - the real ones have none: switch it Off for the raw thing); the car you came from gets its setting back
    const wasMore = MORE_IDS.includes(S.car);
    if (id !== S.car) {
      if (m && m.tc !== undefined) { if (!wasMore) S.tcModePrev = S.tcMode; S.tcMode = m.tc; }
      else if (!m && wasMore && S.tcModePrev !== undefined) S.tcMode = S.tcModePrev;
    }
    // (a car with a home map takes you there; the map you came from comes back when you leave it)
    if (id !== S.car) {
      const from = MORE_CARS.find((x) => x.id === S.car);
      if (m && m.map && S.map !== m.map) { S.mapPrev = S.map; S.map = m.map; }
      else if (from && from.map && S.map === from.map && S.mapPrev) S.map = S.mapPrev;
    }
    S.car = id;
    if (m && opt) S[m.optKey] = opt;
    if (S.car === 'dragpak') S.paint = 'White Knuckle';   // the livery is designed around the standard white
    saveS(); location.reload();
  }
  function wireCarPick(root) {
    for (const b of root.querySelectorAll('button[data-car]')) {
      b.classList.toggle('on', b.dataset.car === S.car);
      b.addEventListener('click', () => pickCar(b.dataset.car));
    }
    const more = root.querySelector('button[data-more]');
    if (more) {
      const cur = MORE_CARS.find((m) => m.id === S.car);
      more.classList.toggle('on', !!cur);
      if (cur) more.innerHTML = `<b>${cur.btn || cur.name}</b><span>${cur.options ? (cur.options.find((o) => o[0] === S[cur.optKey]) || cur.options[0])[1] + ' · ' : ''}more cars…</span>`;
      more.addEventListener('click', () => openMoreCars());
    }
  }
  function openMoreCars() {
    const list = $('moreList'); list.innerHTML = '';
    for (const m of MORE_CARS) {
      const on = S.car === m.id;
      const card = el(`<div class="morecard ${on ? 'on' : ''}"><div class="mhead"><b>${m.name}</b>${on ? '<em>DRIVING</em>' : ''}</div><span class="msub">${m.sub}</span><p>${m.desc}</p><div class="mopts"></div></div>`);
      const opts = card.querySelector('.mopts');
      for (const [key, label, note] of (m.options || [[null, 'Drive it', '']])) {   // (+ an optional paint per option)
        const sel = on && (!key || S[m.optKey] === key);
        const b = el(`<button class="mopt ${sel ? 'on' : ''}"><b>${label}</b><span>${note}</span></button>`);
        b.addEventListener('click', () => pickCar(m.id, key));
        opts.appendChild(b);
      }
      list.appendChild(card);
    }
    list.appendChild(el('<div class="moresoon">More vehicles will land here.</div>'));
    $('moreCars').classList.remove('hidden');
  }
  $('moreClose').addEventListener('click', () => $('moreCars').classList.add('hidden'));
  wireCarPick($('carPick')); wireCarPick($('carPickTitle'));
  void MORE_IDS;
  $('mReset').addEventListener('click', () => { resetCar(); openMenu(false); });
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function row(label, sub, control) {
    const r = el(`<div class="row"><div><label>${label}</label>${sub ? `<small>${sub}</small>` : ''}</div></div>`);
    r.appendChild(control); return r;
  }
  function seg(options, cur, onPick) {
    const d = el('<div class="seg"></div>');
    for (const [val, lab] of options) {
      const b = el(`<button class="${val === cur ? 'on' : ''}">${lab}</button>`);
      b.addEventListener('click', () => { onPick(val); saveS(); renderMenu(); });
      d.appendChild(b);
    }
    return d;
  }
  function slider(min, max, step, val, fmt, onChange) {
    const d = el('<div style="display:flex;align-items:center;gap:8px"></div>');
    const i = el(`<input type="range" min="${min}" max="${max}" step="${step}" value="${val}">`);
    const v = el(`<span class="val">${fmt(val)}</span>`);
    i.addEventListener('input', () => { const x = parseFloat(i.value); v.textContent = fmt(x); onChange(x); });
    i.addEventListener('change', () => { saveS(); input.saveSettings(); });
    d.appendChild(i); d.appendChild(v); return d;
  }
  function renderFun(add) {
    const onT = (k) => (x) => { tune[k] = x; applyTune(); stats(); };
    const T = (k, label, sub, min, max, step, fmt) => add(row(label, sub, slider(min, max, step, tune[k], fmt, onT(k))));
    const sect = (t) => add(el(`<div class="sect">${t}</div>`));
    const statsEl = el('<div class="tunestats"></div>');
    function stats() {
      const e10 = DEMON && S.fuel === 'e10', ratedHp = e10 ? 900 : CARDEF.hp, ratedTq = e10 ? 810 : CARDEF.tq;
      const p = peakFigures(veh.spec), hp = ratedHp * p.hp / STOCK_PEAK.hp, tq = ratedTq * p.tq / STOCK_PEAK.tq, lb = tune.mass * 2.20462;
      statsEl.innerHTML = `<b>${Math.round(hp).toLocaleString()} hp</b> · ${Math.round(tq).toLocaleString()} lb-ft · ${Math.round(lb).toLocaleString()} lb · ${(lb / hp).toFixed(2)} lb/hp` +
        (tune.nos ? ` · +${tune.nos} hp nitrous` : '') + (tune.gravity !== 1 ? ` · ${tune.gravity.toFixed(2)} g` : '');
    }
    add(row('Tune the ' + CARDEF.name, 'Everything applies instantly and is saved for this car. The dash, tach and sound follow along.', statsEl));
    stats();
    add(row('Presets', '', seg([['stock', 'Stock'], ['stage2', 'Stage 2'], ['unhinged', 'Unhinged'], ['moon', 'Moon gravity']], null, (v) => {
      Object.assign(tune, TUNE_PRESETS[v]()); applyTune();
    })));
    const simOut = el('<span class="simout">Runs your tune down a virtual ¼ mile with a launch-control start</span>');
    const simBtn = el('<button class="btn">Simulate ¼ mile</button>');
    simBtn.addEventListener('click', () => { simOut.textContent = 'Running…'; setTimeout(() => { simOut.innerHTML = simulateQuarter(); }, 30); });
    const simWrap = el('<div class="simwrap"></div>'); simWrap.appendChild(simBtn); simWrap.appendChild(simOut);
    add(simWrap);
    const k = (x) => Math.round(x).toLocaleString();
    sect('Engine');
    T('power', 'Engine power', 'Multiplies the whole torque curve (heads, cam, tune…)', 0.5, 3, 0.05, (x) => Math.round(x * 100) + '%');
    T('boost', 'Supercharger boost', 'More pressure = more torque everywhere (stock ' + STOCK.boostMax + ' psi)', 0, Math.max(45, Math.ceil(STOCK.boostMax * 1.5)), 0.5, (x) => x.toFixed(1) + ' psi');
    T('stretch', 'Cam / powerband', 'Moves the whole powerband up or down the rev range — pair it with the rev limiter', 0.7, 5, 0.05, (x) => k(peakRpm(x)) + ' pk');
    T('limiter', 'Rev limiter', tune.nolimit ? 'Limiter removed: this is now just the redline and the automatic\'s shift point' : 'Automatic shift points follow it', 3500, 30000, 100, (x) => k(x));
    add(row('Limiter', 'Unlimited: no fuel cut at all — in manual (or M mode) the engine revs until its own friction and windage stop it',
      seg([[false, 'On'], [true, 'Unlimited']], !!tune.nolimit, (v) => { tune.nolimit = v; applyTune(); })));
    // a sky-high limiter only matters if the engine makes power up there: one click moves the powerband peak up to it
    const matchBtn = el('<button class="btn">Match cam to limiter</button>');
    matchBtn.addEventListener('click', () => {
      // powerband peak just under the limiter, and the final drive scaled with it so each gear still covers the
      // same road speeds (a 30,000 rpm engine on stock gearing would bog in every gear)
      const st = clamp(Math.round(0.93 * tune.limiter / peakRpm(1) * 20) / 20, 0.7, 5);
      tune.stretch = st; tune.finalAuto = +(STOCK.autoFinal * st).toFixed(2); tune.finalManual = +(STOCK.manualFinal * st).toFixed(2);
      applyTune(); saveS(); renderMenu();
    });
    const matchWrap = el('<div class="simwrap"></div>'); matchWrap.appendChild(matchBtn);
    matchWrap.appendChild(el('<span class="simout">Moves the powerband peak to just under the limiter and gears the car to suit, so the engine really pulls (and the automatic really revs) up there</span>'));
    add(matchWrap);
    T('idle', 'Idle speed', 'Higher idle = lumpier, choppier cam sound', 500, 2000, 10, (x) => k(x));
    T('inertia', 'Flywheel / rotating mass', 'Lighter revs faster (and bogs easier)', 0.3, 2, 0.05, (x) => x.toFixed(2) + '×');
    T('nos', 'Nitrous shot', 'Hold N (or a mapped wheel button) at full throttle', 0, 1000, 25, (x) => x ? '+' + x + ' hp' : 'off');
    sect('Drivetrain');
    if (veh.transType === 'auto') {
      T('finalAuto', 'Final drive ratio', 'Higher = harder launch, lower top speed (stock ' + STOCK.autoFinal + ')', 1.8, 25, 0.01, (x) => x.toFixed(2));
      T('shiftTime', 'Shift speed', 'How long each automatic upshift takes at full throttle', 0.05, 0.5, 0.01, (x) => Math.round(x * 1000) + ' ms');
    } else T('finalManual', 'Final drive ratio', 'Higher = harder launch, lower top speed (stock ' + STOCK.manualFinal + ')', 1.8, 25, 0.01, (x) => x.toFixed(2));
    T('launch', 'Launch / TransBrake rpm', 'Where the engine is held while you hold SPACE at a stop', 1000, 9000, 100, (x) => k(x));
    if (STOCK.govSpeed) add(row('Top speed governor', 'The Demon 170 is limited to 149 mph on its drag radials', seg([[true, 'On'], [false, 'Removed']], tune.gov, (v) => { tune.gov = v; applyTune(); })));
    sect('Chassis');
    T('mass', 'Weight', 'Springs and dampers are rescaled so it still rides right', 600, Math.max(3200, Math.round(STOCK.mass * 1.6)), 5, (x) => k(x * 2.20462) + ' lb');
    T('grip', 'Tyre grip', 'Multiplies every tyre, on every surface', 0.4, 2.5, 0.05, (x) => Math.round(x * 100) + '%');
    T('downforce', 'Downforce', 'Pounds of downforce at 150 mph (grows with speed²)', 0, 3000, 50, (x) => x ? k(x) + ' lb' : 'none');
    T('drag', 'Aero drag', 'Lower = higher top speed', 0.3, 2, 0.05, (x) => Math.round(x * 100) + '%');
    T('brakes', 'Brake power', '', 0.3, 3, 0.05, (x) => Math.round(x * 100) + '%');
    T('stiff', 'Suspension stiffness', 'Springs, dampers and anti-roll bars together', 0.5, 2.5, 0.05, (x) => Math.round(x * 100) + '%');
    T('steer', 'Steering lock', '', 0.6, 1.6, 0.05, (x) => Math.round(x * 100) + '%');
    sect('Just for fun');
    T('gravity', 'Gravity', 'Earth = 1 g, Moon = 0.17 g, Jupiter = 2.5 g', 0.1, 2.5, 0.01, (x) => x.toFixed(2) + ' g');
    T('pops', 'Pops & bangs', 'Overrun crackles and backfire flames', 0, 6, 0.25, (x) => x ? x.toFixed(2) + '×' : 'off');
    T('whine', 'Supercharger whine', '', 0, 3, 0.05, (x) => Math.round(x * 100) + '%');
    T('smoke', 'Tyre smoke', '', 0, 4, 0.1, (x) => Math.round(x * 100) + '%');
  }
  function peakRpm(stretch) {
    let best = 0, at = 0;
    const end = STOCK.torqueCurve[STOCK.torqueCurve.length - 1][0] * stretch;   // within the designed powerband
    for (let r = 800; r <= end; r += 50) { const hp = VEH.curveAt(STOCK.torqueCurve, r / stretch) * r; if (hp > best) { best = hp; at = r; } }
    return at;
  }
  function renderMenu() {
    const tabs = $('tabs'); tabs.innerHTML = '';
    for (const t of TABS) { const b = el(`<button class="${t === curTab ? 'on' : ''}">${t}</button>`); b.addEventListener('click', () => { curTab = t; renderMenu(); }); tabs.appendChild(b); }
    const body = $('tabbody'); body.innerHTML = '';
    const add = (n) => body.appendChild(n);
    if (curTab === 'Drive') {
      if (DEMON) {
        add(row('Fuel', 'E85: 1,025 hp / 945 lb-ft (calibrated to the NHRA 8.91 s @ 151 mph pass) · 91-octane E10: 900 hp / 810 lb-ft (restarts)',
          seg([['e85', 'E85 — 1,025 hp'], ['e10', '91 octane — 900 hp']], S.fuel, (v) => { if (v !== S.fuel) { S.fuel = v; saveS(); location.reload(); } })));
        add(row('TransBrake 2.0', 'Hold SPACE (handbrake button) at the line, floor it, release SPACE to launch. 8HP90 auto · MT ET Street R 315/50R17 drag radials · governed to 149 mph', el('<span></span>')));
      }
      if (PULLER) {
        add(row('Modified pulling tractor', '3.6 t · ' + CARDEF.hp.toLocaleString() + ' hp · 30.5L-32 cut pulling tyres · slider clutch + 3-speed planetary · spool · no suspension, no ABS / ESC. Hold SPACE on the line, floor it, let go to dump the clutch.', el('<span></span>')));
        add(row('Engines', 'Swapping engines restarts the game (each package keeps its own Fun-tab tune)',
          seg(VEH.CARS.puller.make && Object.entries(VEH.CARS.puller.engines).map(([k, e]) => [k, e.short]), CARDEF.engine, (v) => { if (v !== CARDEF.engine) { S.pullerEng = v; saveS(); location.reload(); } })));
        add(row('Weight bar', 'On dirt, gravel or a prepped strip it stands up on its weight bar (the front wheels in the air — you can\'t steer). Lift off to set it down. On pavement the pulling tyres just spin.', el('<span></span>')));
        add(row('Staying straight', 'Traction control on Track (the default) keeps the tyres hooked so it stays straight at speed. Off is the real thing: floor it in a turn on pavement and it swaps ends.', el('<span></span>')));
      }
      if (DRAGSTER) {
        add(row(CARDEF.name, FUNNY
          ? 'The Top Fuel engine ahead of the driver under a one-piece carbon flip-top body · 125 in wheelbase, 2,600 lb · 6-disc slipper clutch into a 3.20 rear end · wheelie bars (it stands up on the hit) · rear brakes + two chutes · races to 1,000 ft'
          : NITRO ? '500 ci HEMI on 90 % nitromethane, 14-71 blower at 58 psi, ~11,000 hp · no gearbox: 6-disc slipper clutch into a 3.20 rear end · 36x17.5 slicks · 2,330 lb · rear brakes + two chutes · races to 1,000 ft'
          : '526 ci blown methanol HEMI, ~3,900 hp · 5-disc clutch into a 2-speed planetary box · 34.5x17 slicks · 2,050 lb · rear brakes + two chutes · races the full ¼ mile', el('<span></span>')));
        add(row('Class', 'Switching restarts the game (each class keeps its own Fun-tab tune)',
          seg(Object.entries(VEH.CARS.dragster.classes).map(([k, c]) => [k, c.short]), CARDEF.cls, (v) => {
            if (v !== CARDEF.cls) { const o = MORE_CARS.find((x) => x.id === 'dragster').options.find((x) => x[0] === v); if (o && o[3]) S.paint = o[3]; S.dragClass = v; saveS(); location.reload(); }
          })));
        add(row('Making a pass', 'Burnout: hold B and floor it — no front brakes, so it rolls forward spinning its wet slicks (that\'s the heat they need). Back up (X / reverse, it creeps). Stage, hold SPACE (clutch pedal in) and floor it, let go of SPACE on green. The clutch slips by design — the engine sits near 7,000 rpm and climbs as the clutch locks up. Lift at the finish; the chutes pop by themselves (F pulls them).', el('<span></span>')));
        add(row('Staying straight', 'Traction control on Track (the default) plays crew chief: it backs off the clutch and timing when the slicks start to spin. Off is the real thing — on plain asphalt it goes up in smoke and swaps ends.', el('<span></span>')));
      }
      if (KART) {
        add(row(CARDEF.name, CARDEF.cls === 'kz' ? '125 cc 2-stroke single, ~48 hp at 13,500, 14,500 limiter · 6-speed sequential (E / Q, paddles) · brakes on all four wheels · 175 kg with the driver · slicks'
          : CARDEF.cls === 'tag' ? 'Water-cooled 125 cc 2-stroke single, ~30 hp at 13,000, 19.5 Nm, 16,000 limiter · centrifugal clutch straight to the axle · rear brake only · 158 kg with the driver · slicks'
          : '390 cc 4-stroke single, ~13 hp, governed · centrifugal clutch · one rear disc · hard long-life tyres · 235 kg with the driver', el('<span></span>')));
        add(row('Class', 'Switching restarts the game (each class keeps its own Fun-tab tune)',
          seg(Object.entries(VEH.CARS.kart.classes).map(([k, c]) => [k, c.short]), CARDEF.cls, (v) => {
            if (v !== CARDEF.cls) { const o = MORE_CARS.find((x) => x.id === 'kart').options.find((x) => x[0] === v); if (o && o[3]) S.paint = o[3]; S.kartClass = v; saveS(); location.reload(); }
          })));
        add(row('Driving a kart', 'No suspension, no differential: the tyres and the flexing frame do everything. Brake in a straight line (the rear-braked karts lock up easily), turn in smoothly and carry the speed - scrubbing the fronts or sliding the rear costs time. Slicks need a lap to warm up.', el('<span></span>')));
      }
      if (MONSTER) {
        add(row('Monster truck', '12,000 lb · supercharged 540 ci methanol big-block, ~1,500 hp · 2-speed race automatic · locked transfer case, planetary axles with lockers - all four wheels always driven · 66x43.00-25 hand-cut tyres · 30 in of travel · no traction control, no ABS', el('<span></span>')));
        add(row('Rear steering (G)', 'AUTO: the rears counter-steer at low speed for tight turns and straighten out as you go faster · CRAB: they follow the fronts, so it slides sideways · MANUAL: the real thing - hold , or . to swing them, they stay where you leave them · FRONT: rears locked straight',
          seg([['auto', 'Auto'], ['crab', 'Crab'], ['manual', 'Manual'], ['front', 'Front only']], S.rsMode, (v) => { S.rsMode = v; G.rearMan = 0; })));
        add(row('In the air', 'The tyres weigh 645 lb each: spin them up with the GAS and the truck rocks back (nose up); stab the BRAKE and it pitches nose down. Lift off the gas to fly level. Land on the down slopes.', el('<span></span>')));
        add(row('Air assist', 'On: like a seasoned driver’s feet plus a spotter - it looks ahead to the slope you’ll land on, eases off the gas (or brake) before the truck rotates past it, catches a nose that’s way off, gently levels the truck in pitch and roll while it flies, and feathers the gas as you touch down (spinning rears would kick it over backwards). Holding the gas over a jump no longer flips it; a truck that rolled over on a ramp’s edge before it took off is still a crash. Off: all yours - backflips, front flips and crashes',
          seg([[true, 'On'], [false, 'Off (do your own flips)']], S.airAssist !== false, (v) => { S.airAssist = v; })));
      }
      if (ARENAMAP) {
        const clr = el('<button class="btn small ghost">New run (score to 0)</button>');
        clr.addEventListener('click', () => { FS.score = 0; FS.best = 0; FS.last = ''; arenaScreen(true); hud.toast('Freestyle score reset'); });
        add(row('Freestyle', 'Big air, flips, wheelies, nose wheelies, donuts and crushed cars all score on the big screens · the junk cars are replaced once they\'re all flat', clr));
      }
      if (DRAGPAK) {
        add(row('Mopar Drag Pak (race car)', 'Supercharged 354 HEMI · race 3-speed auto, non-lockup converter · spool · wheelie bars · no ABS / ESC. Hold SPACE on the line (TransBrake), floor it, release SPACE to launch.', el('<span></span>')));
        if (!OFFROAD()) add(row('Rear tyres', 'Slicks: fatter footprint, more grip (~7.5 s) · Radials: the 9-inch tyre NHRA Factory Stock requires (~7.7 s) · both need heat', seg([['etdrag', 'MT ET Drag 29.5x10.5 slicks'], ['etdragpro', 'MT ET Drag Pro 30x9 radials']], S.dpRear || 'etdrag', (v) => { S.dpRear = v; applyVehicleSettings(); })));
        add(row('Parachute', 'F (or map a wheel button) pulls the 10 ft chute above ~10 mph · it deploys by itself past the drag-strip finish line · press again when stopped to repack', el('<span></span>')));
      }
      if (!FIXED) add(row('Transmission', 'TorqueFlite 8HP90 8-speed automatic with paddles, or Tremec TR-6060 6-speed manual', seg([['auto', '8-speed auto'], ['manual', '6-speed manual']], S.trans, (v) => { S.trans = v; applyVehicleSettings(); })));
      if (!FIXED) add(row('Manual clutch', input.hasClutchPedal ? 'Use your clutch pedal (can stall!) or let the car work the clutch for you' : 'Map a clutch pedal in Controls → Wheel setup to use it', seg([[false, 'Auto-clutch'], [true, 'Clutch pedal']], S.clutchPedal, (v) => { S.clutchPedal = v; })));
      add(row('Off-road package', PKG_UI[2], seg([[false, 'Off'], [true, PKG_UI[1]]], OFFROAD(), (v) => {
        S.offroad = Object.assign({}, S.offroad, { [S.car]: v }); applyVehicleSettings();
      })));
      if (!FIXED && !OFFROAD()) add(row('Rear tyres', 'Drag radials: huge launch grip once warm (do a burnout!), soft sidewall, less cornering grip, slick when cold', seg([['street', 'Pirelli P Zero 275/40ZR20'], ['drag', 'Nitto NT555R II 315/35R20 drag radials']], S.rearTire, (v) => { S.rearTire = v; applyVehicleSettings(); })));
      add(row(DRAGPAK || PULLER || DRAGSTER || MONSTER ? 'Traction control' + (DRAGPAK ? ' (Holley EFI)' : DRAGSTER ? ' (clutch management)' : '') : 'Drive mode (ESC / traction)', DRAGPAK ? 'Timing-based wheel-speed traction management — Street: most intervention · Track: least · Off: all on you (no ESC on a race car)' : 'Street: full nannies · Sport: some slip · Track: TC only, ESC off · Off: everything off', seg(TC_NAMES.map((n, i) => [i, n]), S.tcMode, (v) => { S.tcMode = v; applyVehicleSettings(); })));
      if (!sp.noABS) add(row('ABS', '', seg([[true, 'On'], [false, 'Off']], S.abs, (v) => { S.abs = v; applyVehicleSettings(); })));
      const sw = el('<div class="swatches"></div>');
      for (const [name, hex] of Object.entries(CAR.PAINTS)) {
        const b = el(`<div class="sw ${name === S.paint ? 'on' : ''}" title="${name}" style="background:#${hex.toString(16).padStart(6, '0')}"></div>`);
        b.addEventListener('click', () => { S.paint = name; car.setPaint(name); saveS(); renderMenu(); });
        sw.appendChild(b);
      }
      add(row('Paint', S.paint, sw));
      add(row('Map', 'Countryside: endless roads · All Road: the whole world is pavement, drive anywhere · Straightaway: flat straight road · Drag Strip: prepped strip with a Christmas tree & timing · Dirt Drag: the same on groomed dirt · Monster Arena: a stadium of dirt jumps and junk cars (restarts)',
        seg([['country', 'Countryside'], ['tarmac', 'All Road'], ['straight', 'Straightaway'], ['drag', 'Drag Strip'], ['dirtdrag', 'Dirt Drag'], ['arena', 'Monster Arena']], S.map, (v) => { if (v !== S.map) { S.map = v; saveS(); location.reload(); } })));
      add(row('0-60 / ¼-mile timers', '1-ft rollout is how magazines & the NHRA time runs (their 0-60 figures use it)',
        seg([[true, '1-ft rollout'], [false, 'From standstill']], S.rollout, (v) => { S.rollout = v; perf.rollout = v; })));
      if (DRAGMAP) add(row('Christmas tree', 'Pro: all ambers, green 0.4 s later · Sportsman: ambers 0.5 s apart',
        seg([['pro', 'Pro .400'], ['sportsman', 'Sportsman .500']], S.tree, (v) => { S.tree = v; })));
      add(row('Time of day', '', seg([['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']], S.time, (v) => { S.time = v; world.setTime(v, renderer); })));
      add(row('Units', '', seg([['mph', 'MPH'], ['kmh', 'KM/H']], S.units, (v) => { S.units = v; hud.units = v; })));
      add(row('View', 'Also: C key or your wheel\'s MODE/camera button', seg(VIEW_NAMES.map((n, i) => [i, n]), cam.mode, (v) => { cam.mode = v; S.camMode = v; cam.init = false; })));
      const clr = el('<button class="btn small ghost">Clear best times</button>');
      clr.addEventListener('click', () => { perf.clearBest(); hud.toast('Best times cleared'); });
      add(row('Performance timers', 'Stop fully, then launch — 0-60, 0-100, ¼ mile, 60-0 braking are timed automatically', clr));
    } else if (curTab === 'Fun') {
      renderFun(add);
    } else if (curTab === 'Controls') {
      renderControls(add);
    } else if (curTab === 'Graphics') {
      add(row('View distance', '', slider(900, 2600, 100, S.viewDist, (v) => v + ' m', (v) => { S.viewDist = v; world.setQuality({ viewDist: v }); })));
      add(row('Tree density', 'Applies to newly loaded areas', slider(0.2, 1, 0.1, S.treeDensity, (v) => Math.round(v * 100) + '%', (v) => { S.treeDensity = v; world.setQuality({ treeDensity: v }); world.rebuildAll(); })));
      add(row('Shadows', '', seg([[true, 'On'], [false, 'Off']], S.shadows, (v) => { S.shadows = v; world.setQuality({ shadows: v }); })));
      add(row('Resolution scale', 'Lower = faster', slider(0.5, 1, 0.05, S.resScale, (v) => Math.round(v * 100) + '%', (v) => { S.resScale = v; resize(); })));
      add(row('Cockpit field of view', '', slider(50, 95, 1, S.fov, (v) => v + '°', (v) => { S.fov = v; })));
      add(row('Seat height (cockpit)', 'Raise to see more of the gauges over the wheel', slider(-0.12, 0.12, 0.005, S.seatY, (v) => (v * 100).toFixed(1) + ' cm', (v) => { S.seatY = v; })));
      add(row('Seat fore / aft (cockpit)', 'Negative = closer to the wheel', slider(-0.15, 0.15, 0.005, S.seatZ, (v) => (v * 100).toFixed(1) + ' cm', (v) => { S.seatZ = v; })));
      add(row('Chase field of view', '', slider(45, 85, 1, S.chaseFov, (v) => v + '°', (v) => { S.chaseFov = v; })));
      add(row('HUD', '', seg([[true, 'Show'], [false, 'Hide']], S.showHud, (v) => { S.showHud = v; $('hud').classList.toggle('hidden', !v); })));
      add(row('Pedal / steering bars', '', seg([[true, 'Show'], [false, 'Hide']], S.showInputs, (v) => { S.showInputs = v; })));
      add(row('Gauges in cockpit view', 'The real dash works — the big HUD gauge is hidden by default in the cockpit', seg([[false, 'Dash only'], [true, 'Dash + HUD']], S.cockpitHud, (v) => { S.cockpitHud = v; })));
    } else if (curTab === 'Audio') {
      add(row('Master volume', '', slider(0, 1, 0.05, S.vol, (v) => Math.round(v * 100) + '%', (v) => { S.vol = v; })));
      add(row('Engine & supercharger', '', slider(0, 1.5, 0.05, S.engVol, (v) => Math.round(v * 100) + '%', (v) => { S.engVol = v; })));
      add(row('Tyres, wind & road', '', slider(0, 1.5, 0.05, S.fxVol, (v) => Math.round(v * 100) + '%', (v) => { S.fxVol = v; })));
    } else {
      add(el(`<div class="help">
<h3>Burnout (line lock)</h3><p>Stop. Hold <kbd>B</kbd> (or your mapped Line Lock button) — the front brakes lock and the rears are free. Floor the throttle. Traction control is disabled while line lock is held. Release B to launch. Warm drag radials grip far better.</p>
<h3>Rolled over?</h3><p>On its roof or its side and nearly stopped: steer left or right (keys or wheel) and it rolls back over onto its wheels, GTA style. <kbd>Backspace</kbd> also puts it back on its wheels.</p>
<h3>Rev it</h3><p>In <b>P</b>ark or <b>N</b>eutral the throttle revs the engine freely. While driving, hold <kbd>R</kbd> (or your Rev button) to put the car in neutral and rev with the pedal — let go to drop it back in gear (neutral drop = instant wheelspin).</p>
<h3>Drag launch</h3><p>Track or Sport mode, warm tyres, hold the brake, bring the throttle up, release the brake and floor it. The 0–60 / ¼-mile timers start automatically from a stop. Real Hellcat: 3.6 s / 11.8 s @ 125 mph on P Zeros.</p>
<h3>Shifting</h3><p>Automatic: <kbd>E</kbd>/<kbd>Q</kbd> or paddles for manual override (M-mode, press <kbd>M</kbd> to return to D). Keyboard: hold <kbd>S</kbd> at a stop to reverse. Manual: auto-clutch by default; map a clutch pedal to do it yourself.</p>
<h3>Keyboard</h3><table class="keys">
<tr><td>Throttle / brake / steer</td><td><kbd>W</kbd> <kbd>S</kbd> <kbd>A</kbd> <kbd>D</kbd> or arrows</td></tr>
<tr><td>Shift up / down</td><td><kbd>E</kbd> / <kbd>Q</kbd></td></tr>
<tr><td>Hold: neutral rev</td><td><kbd>R</kbd></td></tr><tr><td>Hold: line lock (burnout)</td><td><kbd>B</kbd></td></tr>
<tr><td>Handbrake</td><td><kbd>Space</kbd></td></tr><tr><td>Clutch (manual)</td><td><kbd>Z</kbd></td></tr>
<tr><td>Change view (chase / far / cockpit)</td><td><kbd>C</kbd></td></tr><tr><td>Look back</td><td><kbd>V</kbd></td></tr>
<tr><td>Drive mode Street/Sport/Track/Off</td><td><kbd>T</kbd></td></tr><tr><td>Reverse / Park</td><td><kbd>X</kbd> / <kbd>P</kbd></td></tr>
<tr><td>Auto ↔ manual shifting (D/M)</td><td><kbd>M</kbd></td></tr><tr><td>Engine start/stop</td><td><kbd>I</kbd></td></tr>
<tr><td>Horn / headlights</td><td><kbd>H</kbd> / <kbd>L</kbd></td></tr><tr><td>Monster truck rear steer: mode / manual</td><td><kbd>G</kbd> / <kbd>,</kbd> <kbd>.</kbd></td></tr><tr><td>Parachute (Drag Pak, dragsters)</td><td><kbd>F</kbd></td></tr><tr><td>Nitrous (set a shot in Esc → Fun)</td><td><kbd>N</kbd></td></tr><tr><td>Reset to road</td><td><kbd>Backspace</kbd></td></tr>
<tr><td>Menu</td><td><kbd>Esc</kbd></td></tr><tr><td>Orbit camera / zoom</td><td>drag mouse / wheel</td></tr></table>
<h3>PXN V3 Pro</h3><p>Set the wheel to PC mode. In X-input mode it works out of the box (wheel = steering, RT/LT = pedals, RB/LB = paddles). In D-input mode, or to use the clutch pedal / shifter / MODE button, open <b>Controls → Run wheel setup</b> and follow the prompts. The V3 Pro turns 180°, so steering is speed-sensitive by default — adjust it in Controls. Rumble uses the wheel's vibration motors when the browser supports it.</p>
</div>`));
    }
  }
  let monitorTimer = null;
  function renderControls(add) {
    const pads = input.pads();
    const prof = input.activeProfile();
    const devs = pads.length ? pads.map((p) => `${p.id} <span style="color:#9aa0a8">(${p.mapping || 'non-standard'})</span>`).join('<br>') : 'No wheel / gamepad seen yet — press a button on it.';
    add(row('Detected devices', devs, el('<span></span>')));
    add(row('Active mapping', prof ? (prof.auto ? 'Automatic (standard / X-input layout)' : 'Custom (from wheel setup)') : 'None', el('<span></span>')));
    const wz = el('<div style="display:flex;gap:8px"></div>');
    const b1 = el('<button class="btn small">Run wheel setup</button>'); b1.addEventListener('click', () => startWizard());
    const b2 = el('<button class="btn small ghost">Clear custom mapping</button>'); b2.addEventListener('click', () => { delete input.bindings.custom; input.saveBindings(); renderMenu(); });
    wz.appendChild(b1); wz.appendChild(b2);
    add(row('Wheel setup wizard', 'Detects your steering axis, pedals, paddles and buttons (e.g. MODE for the camera)', wz));
    const mon = el(`<div><div id="monitor">
      <span>Steering</span><div class="mbar center"><i id="mS"></i></div><span id="mSv"></span>
      <span>Throttle</span><div class="mbar"><i id="mT"></i></div><span id="mTv"></span>
      <span>Brake</span><div class="mbar"><i id="mB"></i></div><span id="mBv"></span>
      <span>Clutch</span><div class="mbar"><i id="mC"></i></div><span id="mCv"></span>
      <span>Buttons</span><span id="mBtn" style="grid-column: span 2; color:#9aa0a8">—</span></div></div>`);
    add(row('Live input', 'Raw values after calibration', mon));
    clearInterval(monitorTimer);
    monitorTimer = setInterval(() => {
      if (!G.menu || curTab !== 'Controls') { clearInterval(monitorTimer); return; }
      input.poll(0.016, 0);
      const r = input.raw, st = input.state;
      const set = (id, v, center) => { const e = $(id); if (!e) return; if (center) e.style.left = (50 + v * 50) + '%'; else e.style.width = (v * 100) + '%'; };
      set('mS', input.source === 'wheel' ? r.steer : st.steer, true); set('mT', st.throttle); set('mB', st.brake); set('mC', st.clutch);
      if ($('mSv')) { $('mSv').textContent = (input.source === 'wheel' ? r.steer : st.steer).toFixed(2); $('mTv').textContent = st.throttle.toFixed(2); $('mBv').textContent = st.brake.toFixed(2); $('mCv').textContent = st.clutch.toFixed(2); }
      const held = [];
      for (const p of input.pads()) p.buttons.forEach((b, i) => { if ((b.value || 0) > 0.5 || b.pressed) held.push('B' + i); });
      const acts = Object.entries(input.actions).filter(([, v]) => v).map(([k]) => k);
      if ($('mBtn')) $('mBtn').textContent = (held.join(' ') || '—') + (acts.length ? '  →  ' + acts.join(', ') : '');
    }, 50);
    const st = input.settings;
    const sv = (k) => (v) => { st[k] = v; };
    add(row('Speed-sensitive steering', 'Reduces lock at speed — important for a 180° wheel (0 = none, 1 = only usable angles)', slider(0, 1, 0.05, st.steerSpeedSens, (v) => v.toFixed(2), sv('steerSpeedSens'))));
    add(row('Steering linearity', '1 = linear, >1 = finer control near centre', slider(0.6, 2.2, 0.05, st.steerGamma, (v) => v.toFixed(2), sv('steerGamma'))));
    add(row('Steering range used', 'Fraction of your wheel\'s rotation that gives full lock', slider(0.4, 1, 0.05, st.steerRange, (v) => Math.round(v * 100) + '%', sv('steerRange'))));
    add(row('Steering deadzone', '', slider(0, 0.15, 0.005, st.steerDeadzone, (v) => (v * 100).toFixed(1) + '%', sv('steerDeadzone'))));
    add(row('Throttle curve', '', slider(0.6, 2.5, 0.05, st.throttleGamma, (v) => v.toFixed(2), sv('throttleGamma'))));
    add(row('Brake curve', '', slider(0.6, 2.5, 0.05, st.brakeGamma, (v) => v.toFixed(2), sv('brakeGamma'))));
    add(row('Pedal deadzone', '', slider(0, 0.2, 0.01, st.pedalDeadzone, (v) => Math.round(v * 100) + '%', sv('pedalDeadzone'))));
    add(row('Cockpit steering wheel', 'Match your physical wheel\'s rotation, or the real car\'s 2.5 turns lock-to-lock', seg([['match', 'Match my wheel'], ['real', 'Real (900°)']], S.cockpitWheel, (v) => { S.cockpitWheel = v; })));
    add(row('My wheel rotation', 'PXN V3 Pro = 180°', slider(180, 1080, 90, S.wheelDeg, (v) => v + '°', (v) => { S.wheelDeg = v; })));
    add(row('Wheel vibration (rumble)', '', seg([[true, 'On'], [false, 'Off']], st.rumble, (v) => { st.rumble = v; input.saveSettings(); })));
    add(row('Keyboard steering speed', '', slider(1, 5, 0.1, st.kbSteerSpeed, (v) => v.toFixed(1), sv('kbSteerSpeed'))));
    add(row('Keyboard countersteer assist', '', seg([[true, 'On'], [false, 'Off']], st.kbCountersteer, (v) => { st.kbCountersteer = v; input.saveSettings(); })));
    add(row('Keyboard arcade reverse', 'Hold S at a stop to reverse; W/S swap while reversing', seg([[true, 'On'], [false, 'Off']], S.arcadeReverse, (v) => { S.arcadeReverse = v; })));
  }

  // ------------------------------------------------------------------ wheel setup wizard
  const WZ = {};
  const BUTTON_STEPS = [
    ['shiftUp', 'SHIFT UP', 'Pull the RIGHT paddle (or your upshift button)'],
    ['shiftDown', 'SHIFT DOWN', 'Pull the LEFT paddle'],
    ['camera', 'CHANGE VIEW', 'Press the button you want for the camera (e.g. MODE)'],
    ['rev', 'NEUTRAL REV (hold)', 'Button you\'ll hold to rev in neutral'],
    ['lineLock', 'LINE LOCK (hold)', 'Button you\'ll hold for burnouts'],
    ['handbrake', 'HANDBRAKE', 'Handbrake button'],
    ['pause', 'MENU', 'Button to open this menu (e.g. START / MENU)'],
    ['reset', 'RESET CAR', 'Button to put the car back on the road'],
    ['tcMode', 'DRIVE MODE', 'Cycle Street / Sport / Track / Off'],
    ['lookBack', 'LOOK BACK', ''], ['horn', 'HORN', ''], ['reverse', 'REVERSE', 'Toggle R ↔ D'],
    ['engine', 'ENGINE START/STOP', ''], ['lights', 'HEADLIGHTS', ''], ['autoManual', 'AUTO ↔ MANUAL SHIFTING', ''],
    ['rearMode', 'REAR STEER MODE', 'Monster truck: cycle AUTO / CRAB / MANUAL / FRONT'], ['rearLeft', 'REAR STEER LEFT (hold)', 'Monster truck, manual rear steer'], ['rearRight', 'REAR STEER RIGHT (hold)', ''],
  ];
  function startWizard() {
    openMenu(false); G.paused = true; input.stopRumble();
    $('wizard').classList.remove('hidden');
    input.wizard = true;
    WZ.step = 0; WZ.prof = { name: 'custom', buttons: {} }; WZ.base = input.snapshot(); WZ.hold = 0; WZ.found = null; WZ.waitRelease = false;
    WZ.steps = ['center', 'right', 'left', 'throttle', 'brake', 'clutch', ...BUTTON_STEPS.map((b) => 'btn:' + b[0])];
    wzRender();
  }
  function wzEnd(save) {
    input.wizard = null;
    $('wizard').classList.add('hidden');
    if (save) {
      input.bindings.custom = WZ.prof; input.saveBindings();
      input.axisMoved = {}; input.axisInit = {};
      hud.toast('Wheel mapping saved');
    }
    openMenu(true); curTab = 'Controls'; renderMenu();
  }
  $('wzBack').addEventListener('click', () => wzEnd(false));
  $('wzSkip').addEventListener('click', () => wzAdvance(true));
  $('wzNext').addEventListener('click', () => wzAdvance(false));
  function excludeSet() {
    const s = new Set();
    for (const k of ['steer', 'throttle', 'brake', 'clutch']) { const b = WZ.prof[k]; if (b) s.add(b.pad + '|' + b.type + '|' + b.index); }
    for (const list of Object.values(WZ.prof.buttons)) for (const b of list) s.add(b.pad + '|' + b.type + '|' + b.index);
    return s;
  }
  function wzRender() {
    const k = WZ.steps[WZ.step];
    $('wzStep').textContent = `Wheel setup · step ${WZ.step + 1} of ${WZ.steps.length}`;
    document.querySelector('#wizprog i').style.width = (WZ.step / WZ.steps.length * 100) + '%';
    $('wzSkip').style.display = ['center', 'right', 'left', 'throttle', 'brake'].includes(k) ? 'none' : '';
    $('wzNext').style.display = k === 'center' ? '' : 'none';
    $('wzDetect').textContent = '';
    const T = $('wzTitle'), Sb = $('wzSub');
    if (k === 'center') { T.textContent = 'Centre the wheel, feet off the pedals'; Sb.textContent = input.pads().length ? 'Devices: ' + input.pads().map((p) => p.id).join(', ') : 'No device seen yet — press any button on your wheel first.'; }
    else if (k === 'right') { T.textContent = 'Turn the wheel fully RIGHT and hold'; Sb.textContent = ''; }
    else if (k === 'left') { T.textContent = 'Now turn it fully LEFT and hold'; Sb.textContent = ''; }
    else if (k === 'throttle') { T.textContent = 'Press the THROTTLE pedal all the way'; Sb.textContent = 'Hold it until it is detected, then release'; }
    else if (k === 'brake') { T.textContent = 'Press the BRAKE pedal all the way'; Sb.textContent = 'Hold it until it is detected, then release'; }
    else if (k === 'clutch') { T.textContent = 'Press the CLUTCH pedal (optional)'; Sb.textContent = 'Skip if you only have two pedals'; }
    else { const b = BUTTON_STEPS.find((x) => 'btn:' + x[0] === k); T.textContent = 'Press: ' + b[1]; Sb.textContent = (b[2] || '') + ' — or Skip'; }
  }
  function wzAdvance(skip) {
    const k = WZ.steps[WZ.step];
    if (k === 'center') { WZ.base = input.snapshot(); if (!input.pads().length) { $('wzDetect').textContent = 'No wheel detected yet — press a button on it, then Next.'; return; } }
    if (skip && k === 'clutch') WZ.prof.clutch = null;
    WZ.step++; WZ.hold = 0; WZ.found = null; WZ.waitRelease = k !== 'center' && k !== 'right';
    if (WZ.step >= WZ.steps.length) { wzEnd(true); return; }
    wzRender();
  }
  function wzTick(dt) {
    if (!input.wizard) return;
    const k = WZ.steps[WZ.step];
    if (k === 'center') return;
    if (WZ.waitRelease) {
      // everything back near baseline before the next detection
      const ch = input.detectChange(WZ.base, null);
      if (!ch || ch.d < 0.25) WZ.waitRelease = false;
      else { $('wzDetect').textContent = 'Release…'; return; }
    }
    let ex = excludeSet();
    if (k === 'left' && WZ.prof.steer) ex = null;
    let ch = input.detectChange(WZ.base, ex);
    if (k === 'left' && WZ.prof.steer) {
      const s = WZ.prof.steer; const p = input.padById(s.pad);
      ch = p ? { pad: s.pad, type: 'axis', index: s.index, v: p.axes[s.index], d: Math.abs(p.axes[s.index] - s.center) } : null;
      if (ch && Math.sign(ch.v - s.center) === Math.sign(s.max - s.center)) ch = null;
    }
    if (k.startsWith('btn:') && ch && ch.type === 'axis' && ch.d < 0.5) ch = null;
    if (ch && ch.d > (k.startsWith('btn:') ? 0.4 : 0.5)) {
      WZ.hold += dt;
      $('wzDetect').textContent = `Detected ${ch.type} ${ch.index} (${ch.v.toFixed(2)}) — hold…`;
      if (WZ.hold > 0.45) {
        if (k === 'right') WZ.prof.steer = { pad: ch.pad, type: 'axis', index: ch.index, center: ch.rest, max: ch.v, min: ch.rest - (ch.v - ch.rest) };
        else if (k === 'left') WZ.prof.steer.min = ch.v;
        else if (k === 'throttle' || k === 'brake' || k === 'clutch') WZ.prof[k] = { pad: ch.pad, type: ch.type, index: ch.index, rest: ch.rest, full: ch.v };
        else {
          const act = k.slice(4);
          WZ.prof.buttons[act] = ch.type === 'button' ? [{ pad: ch.pad, type: 'button', index: ch.index }] : [{ pad: ch.pad, type: 'axis', index: ch.index, dir: Math.sign(ch.v - ch.rest), thr: ch.rest + (ch.v - ch.rest) * 0.6 }];
        }
        $('wzDetect').textContent = '✓ ' + (k === 'right' || k === 'left' ? 'Steering' : k) + ' → ' + ch.type + ' ' + ch.index;
        wzAdvance(false);
        WZ.waitRelease = true;
      }
    } else { WZ.hold = 0; if (!$('wzDetect').textContent.startsWith('✓')) $('wzDetect').textContent = 'Waiting for input…'; }
  }

  // ------------------------------------------------------------------ per-frame: controls
  function handleControls(dt) {
    const st = input.state, P = input.pressed, A = input.actions;
    if (P.pause) { if (input.wizard) return; if (!G.started) return; openMenu(!G.menu); }
    if (G.menu || !G.started || input.wizard) return;
    if (P.camera) { cam.mode = (cam.mode + 1) % 3; S.camMode = cam.mode; saveS(); cam.init = false; hud.toast(VIEW_NAMES[cam.mode], 1.2); }
    if (P.shiftUp) veh.shiftUp();
    if (P.shiftDown) veh.shiftDown();
    if (P.reverse) veh.selectReverse();
    if (P.park) veh.selectPark();
    if (P.tcMode) { S.tcMode = veh.tcMode = (veh.tcMode + 1) % 4; saveS(); hud.toast('Drive mode: ' + TC_NAMES[veh.tcMode]); }
    if (P.reset) resetCar();
    if (P.chute && sp.chuteCdA) {
      const was = veh.chuteOut;
      veh.toggleChute();
      const cs = DRAGSTER ? 'CHUTES' : 'CHUTE';
      hud.toast(!was ? (veh.chuteOut ? cs + ' OUT' : 'Chute: need some speed first') : (veh.chuteOut ? 'Stop first to repack the ' + cs.toLowerCase() : cs.charAt(0) + cs.slice(1).toLowerCase() + ' repacked'), 1.2);
    }
    if (P.engine) { if (veh.running) { veh.stopEngine(); hud.toast('Engine off'); } else veh.startEngine(); }
    if (P.lights) { G.lightsOn = !G.lightsOn; hud.toast(G.lightsOn ? 'Headlights on' : 'Headlights off', 1); }
    if (P.autoManual) {
      if (veh.transType === 'auto') { veh.setAutoMode(!veh.autoManual); hud.toast(veh.autoManual ? 'Manual shifting (M)' : 'Automatic (D)', 1.2); }
    }
    if (P.lineLock) hud.hint(DRAGSTER ? (Math.abs(veh.forwardSpeed) < 3 ? 'BURNOUT — wet slicks. Floor it (it rolls: no front brakes)!' : 'Burnout only arms below ~7 mph')
      : Math.abs(veh.forwardSpeed) < 3 ? 'LINE LOCK — front brakes held. Floor it!' : 'Line lock only arms below ~7 mph', 2.5);
    if (P.rev) hud.hint('NEUTRAL — rev it! Release to drop it in gear.', 2);
    if (P.handbrake && Math.abs(veh.forwardSpeed) < 2.5 && veh.gear !== 0 && !veh.park) hud.hint(DRAGSTER ? 'CLUTCH IN — floor it, let go of SPACE to launch' : 'LAUNCH CONTROL — rev it, then let go of the handbrake to launch', 3);
    if (MONSTER) {
      if (P.rearMode) { const M4 = ['auto', 'crab', 'manual', 'front']; S.rsMode = M4[(M4.indexOf(S.rsMode) + 1) % 4]; G.rearMan = 0; saveS(); hud.toast('Rear steering: ' + RS_NAMES[S.rsMode], 1.4); }
      const v = Math.abs(veh.forwardSpeed), stv = input.state.steer, man = (A.rearRight ? 1 : 0) - (A.rearLeft ? 1 : 0);
      let rs = 0;
      if (S.rsMode === 'auto') rs = -stv * clamp(1 - (v - 5) / 10, 0, 1);          // counter-steer, gone by ~34 mph
      else if (S.rsMode === 'crab') rs = stv * clamp(1 - (v - 8) / 14, 0.25, 1);
      else if (S.rsMode === 'manual') { G.rearMan = clamp(G.rearMan + man * dt * 1.1, -1, 1); rs = G.rearMan; }
      if (S.rsMode !== 'manual' && man) rs = clamp(rs + man, -1, 1);                // (the switch works in any mode)
      veh.input.rearSteer = rs;
    }
    // GTA-style flip: steering rolls a car that's on its roof or side back onto its wheels
    veh.input.flipAssist = true;
    // (monster truck) air assist: eases off whichever pedal would over-rotate it in the air, feathers the gas on landing
    veh.input.airAssist = MONSTER && S.airAssist !== false;
    veh.input.revHold = !!A.rev;
    veh.input.nos = !!A.nos;
    veh.input.lineLock = !!A.lineLock;
    G.horn = !!A.horn; G.lookBack = !!A.lookBack;
    let thr = st.throttle, brk = st.brake;
    // arcade reverse for keyboard + automatic
    if (input.source === 'keyboard' && veh.transType === 'auto' && S.arcadeReverse && !veh.park) {
      const v = veh.forwardSpeed;
      if (veh.gear > 0) {
        if (Math.abs(v) < 0.5 && brk > 0.5 && thr < 0.02 && !input.kb('throttle')) { G.arcadeT += dt; if (G.arcadeT > 0.5) { veh.selectReverse(); G.arcadeT = 0; } } else G.arcadeT = 0;
      } else if (veh.gear < 0) {
        const kbT = thr, kbB = brk; thr = kbB; brk = kbT;
        if (Math.abs(v) < 0.5 && kbT > 0.5 && kbB < 0.05) { G.arcadeT += dt; if (G.arcadeT > 0.35) { veh.selectDrive(); G.arcadeT = 0; } } else G.arcadeT = 0;
      }
    }
    veh.input.steer = st.steer; veh.input.throttle = thr; veh.input.brake = brk;
    veh.input.clutch = st.clutch; veh.input.handbrake = st.handbrake;
    veh.useClutchPedal = veh.transType === 'manual' && S.clutchPedal && input.hasClutchPedal;
  }

  // ------------------------------------------------------------------ per-frame: effects
  function tachMax() {
    G.peakRpm = Math.max(G.peakRpm || 0, veh.rpm());
    const top = sp.noLimiter ? Math.max(sp.limiterRpm, G.peakRpm * 1.08) : sp.limiterRpm;
    return Math.max(7000, Math.ceil((top + 400) / 1000) * 1000);
  }
  function effects(dt) {
    const a = carAxes();
    const speed = Math.hypot(veh.vx, veh.vy, veh.vz);
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i];
      if (!w.contact) { skids.break(i); continue; }
      const slip = w.slipSpeed;
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      let fx = a.fx * cs + a.rx * sn, fz = a.fz * cs + a.rz * sn; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      let rate = 0, alpha = 0, shade = 0, size = 0.55, grow = 2.0, life = 3, up = 0;
      // marks and smoke only from a tyre past its grip peak (spinning, sliding, locked): w.rho is the slip over the
      // peak slip. A gripping tyre always creeps a little, and that creep in m/s grows with speed, so slip speed alone
      // laid rubber on every hard (but tidy) acceleration
      const past = clamp((w.rho - 1.0) / 1.5, 0, 1);
      if (w.surface === 0 || w.surface === 5) {
        const heat = clamp((w.temp - 40) / 55, 0.25, 1);
        const amt = clamp((slip - 3.2) / 11, 0, 1) * heat * clamp(w.Fz / 2500, 0, 1) * clamp((w.rho - 0.9) / 0.6, 0, 1);
        rate = amt * 150; alpha = 0.22 + 0.4 * amt; grow = 1.4 + 2.2 * amt; life = 2.4 + 2.5 * amt;
        const sk = past * clamp((slip - 1.2) / 5, 0, 1) * clamp(w.Fz / 3500, 0.2, 1);
        skids.add(i, w.cpx, w.cpz, fx, fz, w.tire.width, sk, groundH);
        // spinning on the spot (burnout / launch): rubber piles up where the tyre sits
        if (slip > 5 && w.rho > 2 && Math.abs(veh.forwardSpeed) < 4) skids.patch(i, w.cpx, w.cpz, fx, fz, w.tire.width, clamp((slip - 5) / 10, 0.35, 1) * clamp(w.Fz / 3000, 0.3, 1), groundH, dt);
      } else if (w.surface !== 4) {
        const amt = clamp((slip - 1.0) / 7 + (w.surface === 2 ? 0.25 : 1) * clamp((speed - 6) / 50, 0, 0.6), 0, 1);
        // a tyre spinning hard in loose ground throws a rooster tail of it, darker for dirt
        const roost = clamp((slip - 4) / 12, 0, 1) * clamp(w.Fz / 5000, 0.3, 1.5);
        rate = amt * 45 + roost * 140; alpha = 0.08 + 0.2 * amt + 0.16 * roost; shade = w.surface === 3 ? 1.25 : 1;
        size = 0.45 + 0.4 * roost; grow = 1.2 + 1.6 * roost; life = 1.6 + amt + roost; up = roost * 3;
        // loose ground: a spinning or sliding tyre digs a soil-coloured rut
        const rut = past * clamp((slip - 2) / 5, 0, 1) * clamp(w.Fz / 3500, 0.2, 1) * 0.6;
        skids.add(i, w.cpx, w.cpz, fx, fz, w.tire.width * 1.1, rut, groundH, SOIL[w.surface]);
      } else skids.break(i);
      if (MONSTER) { rate *= 1.5; size *= 2.1; grow *= 1.4; up *= 1.5; }   // 43 in wide paddle tyres throw a lot of dirt
      // (a cloud already filling the screen many times over gets its new puffs fewer but denser: same look, a
      // fraction of the pixels to draw)
      const bud = smoke.budget;
      if (bud < 1) alpha = Math.min(0.85, 1 - Math.pow(1 - alpha, 1 / Math.max(0.35, bud)));
      G.emitAcc[i] += rate * dt * tune.smoke * bud;
      if (G.emitAcc[i] >= 1) smoke.setGround(groundH(w.cpx, w.cpz));
      while (G.emitAcc[i] >= 1) {
        G.emitAcc[i] -= 1;
        const back = w.omega * w.radius - (veh.vx * fx + veh.vz * fz);
        smoke.emit(w.cpx + (Math.random() - 0.5) * 0.3, w.cpy + 0.15 + Math.random() * 0.1, w.cpz + (Math.random() - 0.5) * 0.3,
          veh.vx * 0.3 - fx * clamp(back, -15, 15) * 0.18 + (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * (0.8 + up), veh.vz * 0.3 - fz * clamp(back, -15, 15) * 0.18 + (Math.random() - 0.5) * 1.2,
          size * (0.8 + Math.random() * 0.4), grow, life * (0.7 + Math.random() * 0.6), alpha, shade);
      }
    }
    // nitro burns in the pipes: a Top Fuel engine under power lights all eight zoomies (alcohol burns nearly invisible)
    if (DRAGSTER) flames.burn(veh.running && !veh.fuelCut ? clamp(veh.thrEff * veh.tcCut * (veh.rpm() - 3000) / 4500, 0, 1) * (NITRO ? 1 : 0.35) : 0);
    // (the smoke's fill budget follows the frame rate while the smoke is what's filling the screen: a slower GPU
    // draws fewer of the nearest puffs one by one and more of them as the flat veil)
    if (smoke.coverageAll > 0.6 * smoke.fill && G.fps) smoke.fill = clamp(smoke.fill * (G.fps < 50 ? 1 - dt * 0.8 : G.fps > 57 ? 1 + dt * 0.3 : 1), 4, 24);
    smoke.update(dt, 1.3, 0.5);
    smoke.setLight(world.sun.color, world.sun.intensity, world.preset === 'night' ? 0.08 : world.preset === 'sunset' ? 0.42 : 0.55);
    flames.update(dt);
  }

  // ------------------------------------------------------------------ per-frame: car visuals
  function updateCarVisual(dt) {
    car.root.position.set(veh.px, veh.py, veh.pz);
    car.root.quaternion.set(veh.qx, veh.qy, veh.qz, veh.qw);
    // a grip tune drops the CG inside the body: draw the body (and wheels) where they really are around it
    const cd = sp.cgDrop || 0;
    if (cd) car.root.position.add((G._cdv || (G._cdv = new THREE.Vector3())).set(0, cd, 0).applyQuaternion(car.root.quaternion));
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i], vw = car.wheels[i];
      vw.corner.position.set(w.mx, w.my - cd - w.s, w.mz);
      vw.corner.rotation.y = -w.steer;
      const sp_ = w.spin % (Math.PI * 2);
      vw.spin.rotation.x = vw.left ? sp_ : -sp_;
      // (monster truck) a landing that drives the wheel past the end of the suspension's travel flattens the tyre
      // and a 16 psi tyre deflects with its load all the time (~2 in at rest, several on a landing): the hub is drawn that
      // much lower and the tyre flattened by it, so the contact patch stays exactly where the physics has it
      if (vw.squash) {
        const pen = w.contact ? clamp(w.s - w.sRaw, 0, 0.3) : 0, d = w.contact ? clamp(w.Fz / 260000, 0, 0.16) : 0, rt = vw.rt || w.radius;
        const ease = (a, b) => a + (b - a) * Math.min(1, dt * (b > a ? 60 : 10));
        vw.dd = ease(vw.dd || 0, d); vw.sq = ease(vw.sq || 0, pen + d);
        vw.corner.position.y -= vw.dd;
        vw.squash.scale.set(1 + vw.sq * 0.45, 1 - vw.sq / (2 * rt), 1 + vw.sq * 0.3); vw.squash.position.y = vw.sq / 2;
      }
      // slicks thrown taller (and narrower) at speed
      if (vw.tyre && vw.growMax && w.tire.grow) vw.tyre.morphTargetInfluences[0] = clamp((w.radius / w.tire.radius - 1) / vw.growMax, 0, 1);
      // tell the smoke where this tyre is, so puffs fade into it instead of slicing through it
      vw.corner.getWorldPosition(_v); _v2.set(1, 0, 0).applyQuaternion(vw.corner.getWorldQuaternion(_q));
      smoke.setWheel(i, _v, _v2, w.radius, (w.tire.width || 0.3) / 2 + 0.02);
    }
    if (car.afterWheels) car.afterWheels();
    const wheelDeg = S.cockpitWheel === 'real' ? veh.steerAngle * sp.steerRatio : (input.source === 'wheel' ? input.raw.steer * S.wheelDeg / 2 * Math.PI / 180 : veh.steerAngle / sp.maxSteer * S.wheelDeg / 2 * Math.PI / 180);
    car.steerWheel.rotation.z = -wheelDeg;
    car.setChute(veh.chuteOut, veh.chuteInfl || 0, veh.chuteT || 0);
    const night = world.preset === 'night';
    car.setLights({ brake: veh.input.brake > 0.04 || veh.lineLockActive, reverse: veh.gear < 0 && !veh.park, headlights: G.lightsOn || night, night });
    G.dashT = (G.dashT || 0) + dt;
    if (G.dashT > (cam.mode === 2 ? 1 / 40 : 1 / 8)) {
      G.dashT = 0;
      const tel = telemetry();
      car.drawCluster(tel);
      G.scrT = (G.scrT || 0) + 1;
      if (G.scrT % 4 === 0) car.drawScreen(tel);
    }
  }
  function telemetry() {
    const d = new Date();
    return {
      rpm: veh.rpm(), speedMph: Math.abs(veh.forwardSpeed) * MPH, gear: veh.gearLabel(), boost: veh.boost, boostMax: sp.boostMax, redline: sp.redlineRpm, mode: TC_NAMES[veh.tcMode],
      tc: veh.tcActive, abs: veh.absActive, lineLock: veh.lineLockActive, running: veh.running || veh.cranking, shift: veh.rpm() > (sp.shiftRpm || sp.redlineRpm) - 300,
      maxRpm: tachMax(),
      shiftNow: veh.rpm() > (sp.shiftRpm || sp.redlineRpm) - 350 && veh.gear > 0, launch: veh.launchHold, chute: veh.chuteOut, brakeP: veh.input.brake * 1100 + (veh.launchHold ? 900 : 0),
      oil: veh.running ? Math.min(95, 22 + veh.rpm() * 0.0085) : 0, water: 176 + 14 * clamp(veh.thrEff, 0, 1), afr: veh.running ? (veh.thrEff > 0.6 ? 11.4 : 13.6) + Math.sin(G.time * 3) * 0.1 : 0,
      volts: veh.running ? 13.9 : 12.4, lastEt: DRAGMAP && DR.sp && DR.sp['s' + FINISH] ? DR.sp['s' + FINISH].toFixed(3) + ' @ ' + DR.sp['m' + FINISH].toFixed(1) : null,
      rearSteer: sp.rearSteerMax ? (veh.rearSteerAngle || 0) / sp.rearSteerMax : 0, rsMode: MONSTER ? S.rsMode.toUpperCase() : '',
      gLat: veh.gLat, gLong: veh.gLong, clock: d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'),
      t60: perf.last.t60 !== undefined ? perf.last.t60.toFixed(2) + ' s' : null, t100: perf.last.t100 !== undefined ? perf.last.t100.toFixed(2) + ' s' : null,
      tq: perf.last.tq !== undefined ? perf.last.tq.toFixed(2) + ' s' : null, brk: perf.last.b60 !== undefined ? perf.last.b60.toFixed(0) + ' ft' : null,
    };
  }

  // ------------------------------------------------------------------ per-frame: camera
  const camQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), pitchQ = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  function updateCamera(dt) {
    const a = carAxes();
    const speed = veh.forwardSpeed;
    if (!cam.dragging && cam.orbitT > 0) cam.orbitT -= dt;
    if (!cam.dragging && cam.orbitT <= 0) { cam.orbitYaw *= Math.exp(-dt * 3); cam.orbitPitch *= Math.exp(-dt * 3); }
    if (cam.mode === 2) {
      camera.near = 0.02;
      // head: g-force lean + look into corners
      // (a dragster's 5 g shoves your head a little further back into the rest)
      const tx = clamp(-veh.gLat * 0.025, -0.05, 0.05), tz = clamp(veh.gLong * 0.02, -0.04, DRAGSTER ? 0.08 : 0.04);
      cam.head.x += (tx - cam.head.x) * Math.min(1, dt * 6); cam.head.z += (tz - cam.head.z) * Math.min(1, dt * 6);
      cam.head.y = (veh.fuelCut ? (Math.random() - 0.5) * 0.004 : 0) + (Math.random() - 0.5) * 0.0015 * clamp(Math.abs(speed) / 60, 0, 1);
      // tractor: sitting on the frame right behind the engines, everything shakes
      if (PULLER && veh.running) { const sh = 0.0025 + 0.007 * clamp(veh.thrEff, 0, 1); cam.head.y += (Math.random() - 0.5) * sh; cam.head.x += (Math.random() - 0.5) * sh * 0.5; }
      // dragster: the engine is bolted to the frame right behind your seat - and 5 g shoves your head back
      if (DRAGSTER && veh.running) {
        const sh = 0.002 + (NITRO ? 0.009 : 0.005) * clamp(veh.thrEff, 0, 1) + 0.002 * clamp(veh.gLong / 4, 0, 1);
        cam.head.y += (Math.random() - 0.5) * sh; cam.head.x += (Math.random() - 0.5) * sh * 0.6;
      }
      const hy = (G.lookBack ? Math.PI * 0.92 : -veh.steerAngle * 0.4);
      cam.headYaw += (hy - cam.headYaw) * Math.min(1, dt * 5);
      _v.copy(car.eye).add(cam.head); _v.y += S.seatY; _v.z += S.seatZ;
      car.root.localToWorld(_v);
      camera.position.copy(_v);
      yawQ.setFromAxisAngle(Y, cam.headYaw + cam.orbitYaw);
      pitchQ.setFromAxisAngle(X, (KART ? -0.17 : -0.1) - cam.orbitPitch * 0.8);
      camQ.copy(car.root.quaternion).multiply(yawQ).multiply(pitchQ);
      camera.quaternion.copy(camQ);
      camera.fov = S.fov;
    } else {
      camera.near = 0.1;
      const far = cam.mode === 1;
      const dist = (far ? 10.5 : 6.4) * CAMK * cam.zoom + clamp(Math.abs(speed) * 0.012, 0, 1.2);
      const height = (far ? 3.3 : 1.95) * CAMH * (0.75 + 0.25 * cam.zoom);
      // heading smoothing (flat forward)
      let fx = a.fx, fz = a.fz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      if (speed < -3) { fx = -fx; fz = -fz; }
      if (!cam.init) { cam.fwd.set(fx, 0, fz); cam.yS = veh.py; cam.vyS = veh.vy; cam.init = true; }
      const k = 1 - Math.exp(-dt * (3.5 + Math.min(4, Math.abs(speed) * 0.08)));
      cam.fwd.x += (fx - cam.fwd.x) * k; cam.fwd.z += (fz - cam.fwd.z) * k; cam.fwd.y = 0; cam.fwd.normalize();
      // height: follow the car's climb rate (low-passed, so bumps don't shake it) and close what's left gently. A plain
      // lag hung the camera 20-50 cm above / below the car over every crest and dip at speed - with a kart's camera only
      // a metre up, the whole view bobbed
      cam.vyS += (veh.vy - cam.vyS) * (1 - Math.exp(-dt * 9.4));
      cam.yS += cam.vyS * dt + (veh.py - cam.yS) * (1 - Math.exp(-dt * 4));
      const dir = _v2.copy(cam.fwd);
      if (G.lookBack) dir.negate();
      dir.applyAxisAngle(Y, cam.orbitYaw);
      const hgt = height + cam.orbitPitch * 4;
      camera.position.set(veh.px - dir.x * dist, cam.yS + hgt, veh.pz - dir.z * dist);
      const gh = groundH(camera.position.x, camera.position.z) + 0.6;
      if (camera.position.y < gh) camera.position.y = gh;
      _v.set(veh.px + dir.x * 2.2 * (DRAGSTER ? 1.6 : 1), cam.yS + (far ? 0.9 : 0.75) * CAMH, veh.pz + dir.z * 2.2 * (DRAGSTER ? 1.6 : 1));
      camera.lookAt(_v);
      if (BIG && veh.running) { const sh = (DRAGSTER ? 0.003 : MONSTER || KART ? 0.002 : 0.004) + (NITRO ? 0.016 : MONSTER ? 0.006 : KART ? 0.004 : 0.012) * clamp(veh.thrEff, 0, 1) * clamp(veh.rpm() / sp.limiterRpm, 0.3, 1); camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh; }
      camera.fov = S.chaseFov + clamp(Math.abs(speed) * 0.09, 0, 13);
    }
    if (G.shake > 0) { G.shake -= dt; camera.position.x += (Math.random() - 0.5) * G.shake * 0.3; camera.position.y += (Math.random() - 0.5) * G.shake * 0.3; }
    camera.updateProjectionMatrix();
    car.setInteriorVisible(true, cam.mode === 2);
  }

  // ------------------------------------------------------------------ per-frame: audio & rumble & hud
  // engine sound set-up: the Challengers are one V8; the tractor is several engines, deep and brutally loud, in an
  // open cockpit (the V12s' gear-driven centrifugal blowers scream instead of whining)
  // (dragsters: one open-header blown HEMI a few feet behind your head - nitro is a ragged, crackling, earth-shaking
  // roar with a lumpy, misfiring idle; methanol a little cleaner and higher-revving)
  // (karts: singles - a 4-stroke thumper for the rental, 2-strokes that ring to 14-16,000 through tiny expansion chambers)
  const ENG_SND = KART ? (CARDEF.cls === 'rental' ? { nEng: 1, cyl: 1, fmul: 1.5, deep: 0, loud: 0.15, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 3800, race: 0.3, rough: 0.35 }
      : CARDEF.cls === 'kz' ? { nEng: 1, cyl: 2, fmul: 2.2, deep: 0, loud: 0.45, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 13500, race: 1, rough: 0.15, pipe: [9000, 11500] }
      : { nEng: 1, cyl: 2, fmul: 2.4, deep: 0, loud: 0.3, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 15000, race: 1, rough: 0.15, pipe: [8500, 11000] })
    : MONSTER ? { nEng: 1, cyl: 8, fmul: 0.85, deep: 0.55, loud: 0.9, open: 1, whK: 0.19, whPure: 0, whine: 1.9, rpmRef: 7000, race: 1, rough: 0.3 }
    : DRAGSTER ? (NITRO ? { nEng: 1, cyl: 8, fmul: 0.8, deep: 0.7, loud: 1, open: 1, whK: 0.19, whPure: 0, whine: 1.1, rpmRef: 8400, race: 1, rough: 0.9 }
    : { nEng: 1, cyl: 8, fmul: 0.9, deep: 0.35, loud: 0.8, open: 1, whK: 0.19, whPure: 0, whine: 1.3, rpmRef: 9400, race: 1, rough: 0.35 })
    : !PULLER ? { nEng: 1, cyl: 8, fmul: 1, deep: 0, loud: 0, open: 0, whK: 0.19, whPure: 0 }
    : CARDEF.engine === 'v12' ? { nEng: 2, cyl: 12, fmul: 0.5, deep: 1, loud: 1, open: 1, whK: 2.0, whPure: 1, whine: 1.2, rpmRef: 3700, race: 0.5 }
    : { nEng: 4, cyl: 8, fmul: 0.62, deep: 1, loud: 1, open: 1, whK: 0.19, whPure: 0, whine: 1.4, rpmRef: 8400, race: 1 };
  function audioUpdate() {
    if (!audio.ready) return;
    let squeal = veh.squeal || 0, spin = 0, pitch = 0.5;
    for (const w of veh.wheels) {
      if (!w.contact || w.surface !== 0) continue;
      if (!w.front && w.slipSpeed > 4) spin = Math.max(spin, clamp((w.slipSpeed - 4) / 14, 0, 1));
      pitch = Math.max(pitch, clamp(w.slipSpeed / 25, 0, 1));
    }
    squeal = Math.max(squeal, spin * 0.9);
    const rw = veh.wheels[2];
    const speed = Math.hypot(veh.vx, veh.vy, veh.vz);
    audio.update({
      rpm: veh.rpm(), load: veh.running ? clamp(veh.thrEff * veh.tcCut * veh.escCut * (veh.shiftCut || 1), 0, 1) : 0, thr: veh.input.throttle,
      cut: veh.fuelCut ? 1 : 0, boost: veh.boost, run: veh.running ? 1 : 0, crank: veh.cranking ? 1 : 0,
      squeal, sqPitch: pitch, spin, speed, surf: rw.contact ? rw.surface : 0, interior: cam.mode === 2 ? 1 : 0,
      horn: G.horn ? 1 : 0, vol: S.vol, engVol: S.engVol, fxVol: S.fxVol, rough: ENG_SND.rough || 0, whine: (BIG ? ENG_SND.whine : DRAGPAK ? 1.7 : DEMON ? 1.45 : 1) * tune.whine,
      rpmRef: (BIG ? ENG_SND.rpmRef : DRAGPAK ? 8800 : 6200) * clamp(sp.limiterRpm / STOCK.limiterRpm, 0.7, 2), hum: OFFROAD() && !BIG ? 1 : 0,
      boostRef: Math.max(BIG ? STOCK.boostMax : DRAGPAK ? 24 : 11.6, sp.boostMax), race: BIG ? ENG_SND.race : DRAGPAK ? 1 : 0,
      nEng: ENG_SND.nEng, cyl: ENG_SND.cyl, fmul: ENG_SND.fmul, deep: ENG_SND.deep, loud: ENG_SND.loud, open: ENG_SND.open, whK: ENG_SND.whK, whPure: ENG_SND.whPure,
      pipe: ENG_SND.pipe ? clamp((veh.rpm() - ENG_SND.pipe[0]) / (ENG_SND.pipe[1] - ENG_SND.pipe[0]), 0, 1) : 0,
    });
  }
  function processEvents() {
    const ev = veh.events, L = G.lastEv;
    if (ev.shift !== L.shift) { L.shift = ev.shift; audio.event('shift'); input.rumble(0.35, 0.2, 90); }
    if (ev.backfire !== L.backfire) { L.backfire = ev.backfire; audio.event('pop', 0.8 + Math.random() * 0.4); flames.pop(1); }
    if (ev.grind !== L.grind) { L.grind = ev.grind; audio.event('grind'); hud.toast('Clutch!', 0.8); }
    if (ev.impact > 1.2) {
      audio.event('impact', clamp(ev.impact / 5, 0.3, 2.5));
      input.rumble(1, 1, 280); G.shake = clamp(ev.impact / 12, 0.1, 0.6);
    }
    ev.impact = 0;
  }
  function rumble(dt) {
    G.rumbleT -= dt;
    if (G.rumbleT > 0) return;
    G.rumbleT = 0.1;
    let strong = 0, weak = 0;
    for (const w of veh.wheels) if (w.contact) {
      strong = Math.max(strong, clamp((w.slipSpeed - 2) / 20, 0, 0.6));
      if (w.surface > 0) weak = Math.max(weak, clamp(Math.abs(veh.forwardSpeed) / 30, 0, 0.5));
    }
    if (veh.fuelCut) strong = Math.max(strong, 0.45);
    weak += clamp(veh.rpm() / 6200, 0, 1) * 0.08 * (veh.running ? 1 : 0);
    if (BIG && veh.running) { weak = Math.max(weak, 0.25 + 0.35 * clamp(veh.thrEff, 0, 1)); strong = Math.max(strong, 0.3 * clamp(veh.thrEff, 0, 1) + (DRAGSTER ? 0.4 * clamp(veh.gLong / 4, 0, 1) : 0)); }
    if (strong > 0.02 || weak > 0.05) input.rumble(strong, weak, 120);
  }
  function hudUpdate(dt) {
    hud.tick(dt);
    const speed = veh.forwardSpeed;
    const events = perf.update(dt, speed, veh.input.throttle, veh.input.brake);
    for (const e of events) hud.toast(e, 3);
    const inCockpit = cam.mode === 2;
    const showGauge = S.showHud && (!inCockpit || S.cockpitHud);
    $('gauge').style.display = showGauge ? '' : 'none';
    $('gmeter').style.display = showGauge ? '' : 'none';
    $('inputs').style.display = S.showInputs ? '' : 'none';
    const cs = $('cockpitSpeed');
    cs.classList.toggle('hidden', showGauge || !S.showHud);
    if (!showGauge) cs.textContent = Math.round(hud.spd(speed)) + (S.units === 'kmh' ? ' km/h' : ' mph') + '  ·  ' + veh.gearLabel();
    if (showGauge) {
      hud.drawGauge({ rpm: veh.rpm(), speed, gear: veh.gearLabel(), boost: veh.boost, boostMax: sp.boostMax, redline: sp.redlineRpm, maxRpm: tachMax(), fuelCut: veh.fuelCut, shiftLight: veh.rpm() > (sp.shiftRpm || sp.redlineRpm) - 300 && veh.gear > 0, tireTemps: veh.wheels.map((w) => w.temp) });
      if (hud.frame % 2 === 0) hud.drawG(veh.gLat, veh.gLong);
    }
    if (hud.frame % 3 === 0) {
      const a = carAxes();
      hud.drawMinimap(veh.px, veh.pz, -Math.PI / 2 - Math.atan2(a.fz, a.fx));
    }
    if (hud.frame % 10 === 0) hud.setPerf(perf);
    hud.setInputs(veh.input.throttle, veh.input.brake, input.state.clutch, input.source === 'wheel' ? input.raw.steer : input.state.steer);
    const chips = [
      { html: `<b>${TC_NAMES[veh.tcMode]}</b> mode` },
      { html: '<b>' + CARDEF.short + '</b>' + (DEMON ? ' · ' + (S.fuel === 'e10' ? '91 oct' : 'E85') : DRAGPAK ? ' · race gas' : MONSTER || KART ? ' · ' + CARDEF.car : PULLER ? ' · ' + VEH.CARS.puller.engines[CARDEF.engine].short : DRAGSTER ? (NITRO ? ' · nitro' : ' · methanol') : '') },
      { html: KART ? (CARDEF.cls === 'kz' ? '6-speed sequential · chain drive' : 'Centrifugal clutch · chain drive') : MONSTER ? '2-speed · 4x4 · lockers' : PULLER ? 'Slider clutch · 3-speed planetary' : DRAGSTER ? (NITRO ? 'Direct drive · 6-disc clutch' : '2-speed · 5-disc clutch') : veh.transType === 'auto' ? (DRAGPAK ? '3-speed race auto' : '8HP90 auto') : 'TR-6060 manual' + (veh.useClutchPedal ? ' · pedal' : '') },
      { html: OFFROAD() ? PKG_UI[0] : KART ? (CARDEF.cls === 'rental' ? 'Hard rental tyres' : 'Kart slicks') : MONSTER ? '66x43.00-25 paddles' : PULLER ? '30.5L-32 pulling tyres' : DRAGSTER ? (NITRO ? '36x17.5 slicks' : '34.5x17 slicks') : veh.spec.rearTire === 'drag' ? 'Drag radials' : veh.spec.rearTire === 'etstreet' ? 'ET Street R' : veh.spec.rearTire === 'etdragpro' ? 'ET Drag Pro' : veh.spec.rearTire === 'etdrag' ? 'ET Drag slicks' : 'P Zero' },
      { html: input.source === 'wheel' ? 'Wheel' : 'Keyboard' },
    ];
    if (MONSTER) chips.push({ html: '4WS <b>' + S.rsMode.toUpperCase() + '</b>' });
    if (ARENAMAP) chips.push({ html: 'FREESTYLE <b>' + Math.round(FS.score).toLocaleString() + '</b>' });
    if (veh.flipping) chips.push({ html: 'FLIPPING OVER', cls: 'alert' });
    if (veh.tcActive) chips.push({ html: 'TC', cls: 'warn' });
    if (veh.escActive) chips.push({ html: 'ESC', cls: 'warn' });
    if (veh.absActive) chips.push({ html: 'ABS', cls: 'warn' });
    if (veh.lineLockActive) chips.push({ html: DRAGSTER ? 'BURNOUT' : veh.brakeStand ? 'BRAKE STAND' : 'LINE LOCK', cls: 'alert' });
    if (veh.revHoldActive) chips.push({ html: 'NEUTRAL REV', cls: 'alert' });
    if (veh.launchHold) chips.push({ html: PULLER || DRAGSTER ? 'CLUTCH IN' : FIXED ? 'TRANSBRAKE' : 'LAUNCH CONTROL', cls: 'alert' });
    if (PULLER && veh.wheelieBarLoad > 500) chips.push({ html: 'ON THE BAR', cls: 'alert' });
    if (veh.chuteOut) chips.push({ html: DRAGSTER ? 'CHUTES' : 'CHUTE', cls: 'warn' });
    if (veh.nosActive) chips.push({ html: 'NITROUS', cls: 'alert' });
    if (!veh.running && !veh.cranking) chips.push({ html: veh.stalled ? 'STALLED — press I' : 'ENGINE OFF — press I', cls: 'alert' });
    if (veh.inWater > 0.3) chips.push({ html: 'IN THE LAKE — Backspace to reset', cls: 'alert' });
    if (!S.abs && !sp.noABS) chips.push({ html: 'ABS OFF', cls: 'warn' });
    hud.setChips(chips);
  }

  // ------------------------------------------------------------------ drag strip timing (NHRA style)
  // Beams at tyre height: pre-stage 7 in behind the start line, stage on it. The ET clock starts when the front tyre
  // leaves the stage beam (~1 ft of rollout); splits when the leading edge crosses 60/330/660/1000/1320 ft.
  const HC = 0.152;   // half-chord of the tyre at beam height
  const MARKS = [[18.288, 's60'], [100.584, 's330'], [201.168, 's660'], [304.8, 's1000'], [402.336, 's1320']];
  const DR = { state: 'idle', t: 0, stagedT: 0, treeT: 0, greenT: null, startT: null, rt: null, red: false, sp: {}, trapT: {}, lastD: -1, lastT: 0, side: 1 };
  const slipEl = $('slip'), treeEl = $('dtree');
  function dragReset() { Object.assign(DR, { state: 'idle', stagedT: 0, greenT: null, startT: null, rt: null, red: false, sp: {}, trapT: {}, lastD: -1 }); showSlip(false); }
  function showSlip(v) { slipEl.classList.toggle('hidden', !v); }
  function renderSlip() {
    const f = (x, d) => (x === undefined || x === null ? '—' : x.toFixed(d === undefined ? 3 : d));
    const r = DR.sp;
    slipEl.innerHTML = `<h4>${CARDEF.short.toUpperCase()} · TIME SLIP</h4><table>
      <tr><td>R/T</td><td class="${DR.red ? 'red' : ''}">${DR.rt === null ? '—' : (DR.red ? 'RED ' : '') + DR.rt.toFixed(3)}</td></tr>
      <tr><td>60'</td><td>${f(r.s60)}</td></tr><tr><td>330'</td><td>${f(r.s330)}</td></tr>
      <tr><td>1/8 ET</td><td>${f(r.s660)}</td></tr><tr><td>1/8 MPH</td><td>${f(r.m660, 2)}</td></tr>
      ${FINISH === 1000 ? `<tr class="big"><td>1000' ET</td><td>${f(r.s1000)}</td></tr><tr class="big"><td>1000' MPH</td><td>${f(r.m1000, 2)}</td></tr>`
        : `<tr><td>1000'</td><td>${f(r.s1000)}</td></tr>
      <tr class="big"><td>1/4 ET</td><td>${f(r.s1320)}</td></tr><tr class="big"><td>1/4 MPH</td><td>${f(r.m1320, 2)}</td></tr>`}</table>`;
  }
  function setTreeHUD(st) {
    for (const k of ['pre', 'stage', 'a1', 'a2', 'a3', 'green', 'red']) treeEl.querySelector('.' + k).classList.toggle('on', !!st[k]);
  }
  function dragUpdate(dt) {
    if (!DRAGMAP || !world.drag) return;
    DR.t += dt;
    const f0 = veh.wheels[0], f1 = veh.wheels[1];
    // (front hubs, not the tyres' contact points: those freeze where the tyre left the ground, so a car carrying its
    // front wheels off the line - Funny Car, Drag Pak on its bars - started the clock late and read a bogus 60 ft)
    const cpz = (f0.hz + f1.hz) / 2, cpx = (f0.hx + f1.hx) / 2;
    const lead = cpz - HC, trail = cpz + HC;
    const side = cpx >= 0 ? 1 : -1;
    const inLane = Math.abs(Math.abs(cpx) - W.DRAG.LANE) < 2.6;
    const pre = inLane && lead < 0.178 && trail > 0.178 - 0.35;
    const staged = inLane && lead < 0.02 && lead > -0.3;
    const v = Math.abs(veh.forwardSpeed);
    const tree = { pre, stage: staged };
    const pro = S.tree !== 'sportsman';
    if (DR.state === 'idle' || DR.state === 'done') {
      if (DR.state === 'done' && lead > 1) { dragReset(); }
      if (DR.state === 'idle') {
        if (staged && v < 0.3) DR.stagedT += dt; else DR.stagedT = 0;
        if (DR.stagedT > 1.0) { DR.state = 'tree'; DR.treeT = DR.t; DR.side = side; DR.sp = {}; DR.trapT = {}; DR.red = false; DR.rt = null; renderSlip(); showSlip(true); }
      }
    }
    if (DR.state === 'tree' || DR.state === 'run') {
      const since = DR.t - DR.treeT, greenAt = pro ? 0.4 : 1.5;
      tree.a1 = pro ? since >= 0 && since < greenAt : since >= 0 && since < 0.5;
      tree.a2 = pro ? tree.a1 : since >= 0.5 && since < 1.0;
      tree.a3 = pro ? tree.a1 : since >= 1.0 && since < 1.5;
      if (since >= greenAt && DR.greenT === null && !DR.red) DR.greenT = DR.treeT + greenAt;
      tree.green = DR.greenT !== null && !DR.red;
      tree.red = DR.red;
      if (DR.state === 'tree') {
        if (trail < 0) {   // left the stage beam: start the ET clock
          DR.startT = DR.t; DR.state = 'run';
          if (DR.greenT === null) { DR.red = true; DR.rt = DR.t - (DR.treeT + greenAt); hud.toast('RED LIGHT', 1.5); }
          else DR.rt = DR.t - DR.greenT;
          DR.lastD = -(lead); DR.lastT = DR.t;
          renderSlip();
        } else if (lead > 0.3) dragReset();   // backed out of stage
      }
    }
    if (DR.state === 'run') {
      const d = -lead, T = DR.t;
      for (const [m, key] of MARKS) {
        const trapStart = m - 20.117;
        if (DR.trapT[key] === undefined && DR.lastD < trapStart && d >= trapStart) DR.trapT[key] = DR.lastT + (trapStart - DR.lastD) / Math.max(1e-6, d - DR.lastD) * (T - DR.lastT);
        if (DR.sp[key] === undefined && DR.lastD < m && d >= m) {
          const tc = DR.lastT + (m - DR.lastD) / Math.max(1e-6, d - DR.lastD) * (T - DR.lastT);
          DR.sp[key] = tc - DR.startT;
          if (key === 's660' || key === 's1000' || key === 's1320') DR.sp['m' + key.slice(1)] = 66 / (tc - DR.trapT[key]) * 0.681818;
          renderSlip();
          if (key === 's' + FINISH) {
            DR.state = 'done';
            const et = DR.sp['s' + FINISH], mph = DR.sp['m' + FINISH];
            if (sp.chuteCdA && !veh.chuteOut && veh.forwardSpeed * MPH > 100) { veh.toggleChute(); hud.hint(DRAGSTER ? 'CHUTES!' : 'CHUTE!', 1.5); }
            world.drag.setBoard(et, mph, DR.rt);
            hud.toast(`${et.toFixed(3)} s @ ${mph.toFixed(2)} mph`, 4);
            if (perf.rec(FINISH === 1000 ? 'et1000' : 'et', et, true)) hud.hint(FINISH === 1000 ? 'NEW BEST 1,000 FT ET!' : 'NEW BEST ¼ MILE ET!', 3);
          }
        }
      }
      DR.lastD = d; DR.lastT = T;
      if (DR.state === 'run' && T - DR.startT > 3 && v < 1) { DR.state = 'done'; }
    }
    if (DR.state !== 'idle') tree.pre = tree.pre || DR.state === 'tree';
    world.drag.setTree(DR.side = (DR.state === 'idle' ? side : DR.side), tree);
    const showTree = DR.state === 'tree' || (DR.state === 'run' && DR.t - DR.startT < 2) || (DR.state === 'idle' && (pre || staged || (inLane && lead < 3 && lead > -0.5)));
    treeEl.classList.toggle('hidden', !showTree);
    if (showTree) {
      setTreeHUD(Object.assign({}, tree, { a1: tree.a1, a2: tree.a2, a3: tree.a3 }));
      treeEl.querySelector('.dist').textContent = DR.state === 'idle' ? (staged ? 'STAGED' : lead > 0 ? (lead * 3.28084).toFixed(1) + ' ft to stage' : 'too deep — back up') : '';
    }
  }

  // ------------------------------------------------------------------ flipped over: tell them how to get back up
  function flipHint(dt) {
    G.flipHintT -= dt;
    const up = 1 - 2 * (veh.qx * veh.qx + veh.qz * veh.qz);
    if (up < 0.35 && Math.hypot(veh.vx, veh.vy, veh.vz) < 3 && !veh.flipping && G.flipHintT <= 0 && G.started) {
      hud.hint('ROLLED IT! Steer left or right to flip it back over (or Backspace)', 3.5); G.flipHintT = 9;
    }
  }

  // ------------------------------------------------------------------ Monster Arena: car crush + freestyle scoring
  // Tricks are read off the physics: big air (time, height), flips / barrel rolls / 360s (rotation in the air, body
  // axes), wheelies (rears down, fronts up), nose wheelies (the other way round; a moonwalk if it's rolling backwards),
  // donuts (spinning in place), crushed junk cars. A landing that ends on its roof or side scores nothing.
  const FS = { score: 0, best: 0, last: '', air: 0, maxH: 0, rot: [0, 0, 0], land: -1, wh: 0, nw: 0, nwBack: false, don: 0, donQ: 0, crushed: new Set(), scrT: 0, pend: null, sky: false };
  function trick(text, pts) {
    FS.score += pts; FS.last = text;
    hud.toast(`${text}  +${Math.round(pts).toLocaleString()}`, 2.6);
    arenaScreen(true, text, pts);
  }
  function arenaScreen(now, text, pts) {
    if (!world.arena) return;
    FS.scrT -= now ? 99 : 0;
    if (FS.scrT > 0) return;
    FS.scrT = 0.5;
    const mph = Math.round(Math.abs(veh.forwardSpeed) * (S.units === 'kmh' ? 3.6 : MPH)) + (S.units === 'kmh' ? ' KM/H' : ' MPH');
    world.arena.setScreen({ title: CARDEF.car || CARDEF.short.toUpperCase(), big: Math.round(FS.score).toLocaleString(), color: text ? '#a6ff1c' : '#ffffff',
      sub: text ? text + '  +' + Math.round(pts).toLocaleString() : FS.last || 'FREESTYLE', foot: mph + '  ·  ' + (FS.pend ? 'IN THE AIR' : 'SCORE') });
  }
  function arenaUpdate(dt) {
    if (!ARENAMAP) return;
    const Wh = veh.wheels;
    // junk cars dent under the tyres - and under the chassis, which rides over the roofs between the tyre tracks
    const crushAt = (x, z, f) => {
      const k = W.arenaCrush(x, z, f, dt);
      if (k < 0) return;
      const c = W.ARENA_CARS[k], gy = groundH(x, z);
      if (c.glassEv) {                                        // the cabin caves in: glass everywhere
        c.glassEv = 0;
        if (world.arena) world.arena.burst(c.x, Math.max(gy, 0.6) + 0.2, c.z, c.glassN > 1 ? 30 : 45);
        audio.event('glass', 1); audio.event('crunch', 1.2); input.rumble(0.9, 0.7, 220); G.shake = Math.max(G.shake, 0.18);
      }
      if (c.dd > 0.05) {                                      // metal folding: a crunch, a puff of rust and dirt
        audio.event('crunch', clamp(c.dd * 2.5, 0.35, 1.3)); input.rumble(0.55, 0.45, 110);
        for (let q = 0; q < 3; q++) smoke.emit(x + (Math.random() - 0.5) * 0.8, gy + 0.15, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5, 0.45, 1.8, 1.2, 0.22, 1.2);
        c.dd = 0;
      }
      if (!FS.crushed.has(k) && (c.cab > 0.4 || c.level > 0.2)) { FS.crushed.add(k); trick('CAR CRUSH', 150); G.shake = Math.max(G.shake, 0.15); }
    };
    for (const w of Wh) if (w.contact) crushAt(w.cpx, w.cpz, w.Fz);
    const bh = veh.bodyHits || [];
    for (let i = 0; i < bh.length; i += 3) crushAt(bh[i], bh[i + 1], bh[i + 2]);
    if (world.arena) world.arena.update(dt);
    // fresh cars once they're all flat and the truck is well clear of the pile
    if (FS.crushed.size === W.ARENA_CARS.length && Math.hypot(veh.px - W.ARENA_CARS[0].x, veh.pz) > 30) { W.arenaResetCars(); FS.crushed.clear(); hud.toast('The crew hauls in fresh junk cars', 2.5); }
    // body axes
    const { qx, qy, qz, qw } = veh;
    const ax = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw)];            // right
    const ay = [2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)];            // up
    const af = [-2 * (qx * qz + qy * qw), -2 * (qy * qz - qx * qw), -(1 - 2 * (qx * qx + qy * qy))];       // forward
    const wv = [veh.wx, veh.wy, veh.wz], dot = (a) => a[0] * wv[0] + a[1] * wv[1] + a[2] * wv[2];
    const air = veh.airborne, up = ay[1], v = Math.hypot(veh.vx, veh.vz);
    if (air) {
      FS.air += dt; FS.maxH = Math.max(FS.maxH, veh.py - groundH(veh.px, veh.pz) - sp.cgHeight);
      FS.rot[0] += dot(ax) * dt; FS.rot[1] += dot(af) * dt; FS.rot[2] += dot(ay) * dt;
      if (FS.air > 0.4) FS.pend = true;
    } else if (FS.air > 0) {
      if (FS.air > 0.45) FS.land = 1.2;
      else { FS.air = 0; FS.maxH = 0; FS.rot = [0, 0, 0]; FS.pend = null; }
    }
    // judge a landing a moment later: still on its wheels?
    if (FS.land > 0 && !air) {
      FS.land -= dt;
      if (up < 0.3) { hud.toast('CRASH!  No score', 2); FS.land = -1; FS.air = 0; FS.maxH = 0; FS.rot = [0, 0, 0]; FS.pend = null; FS.last = 'CRASH'; arenaScreen(true); }
      else if (FS.land <= 0) {
        const parts = []; let pts = 0;
        const p = FS.rot[0] * 57.3, r = FS.rot[1] * 57.3, y = FS.rot[2] * 57.3;
        const nP = Math.floor((Math.abs(p) + 60) / 360), nR = Math.floor((Math.abs(r) + 60) / 360), nY = Math.floor((Math.abs(y) + 45) / 360);
        if (nP) { parts.push((nP > 1 ? nP + '× ' : '') + (p > 0 ? 'BACKFLIP' : 'FRONT FLIP')); pts += 1500 * nP; }
        if (nR) { parts.push((nR > 1 ? nR + '× ' : '') + 'BARREL ROLL'); pts += 1200 * nR; }
        if (nY) { parts.push(nY * 360 + ' SPIN'); pts += 600 * nY; }
        if (FS.air > 1.0 || parts.length) { parts.unshift(`${FS.air > 1.6 ? 'HUGE AIR' : 'BIG AIR'} ${FS.air.toFixed(1)} s`); pts += FS.air * 120 + Math.max(0, FS.maxH) * 25; }
        else if (FS.air > 0.45) { parts.unshift('AIR ' + FS.air.toFixed(1) + ' s'); pts += FS.air * 60; }
        if (parts.length) trick(parts.join(' + '), pts);
        FS.land = -1; FS.air = 0; FS.maxH = 0; FS.rot = [0, 0, 0]; FS.pend = null;
      }
    }
    // two-wheel skills
    const fOn = Wh[0].contact || Wh[1].contact, rOn = Wh[2].contact || Wh[3].contact;
    const pitch = Math.asin(clamp(af[1], -1, 1)) * 57.3;
    if (!air && rOn && !fOn && up > 0.2) { FS.wh += dt; if (pitch > 60) FS.sky = true; }
    else if (FS.wh > 0) { if (FS.wh > 0.9 && up > 0.3) trick(`${FS.sky ? 'SKY WHEELIE' : 'WHEELIE'} ${FS.wh.toFixed(1)} s`, FS.wh * (FS.sky ? 260 : 160)); FS.wh = 0; FS.sky = false; }
    if (!air && fOn && !rOn && up > 0.2) { FS.nw += dt; if (veh.forwardSpeed < -0.5) FS.nwBack = true; }
    else if (FS.nw > 0) { if (FS.nw > 0.6 && up > 0.3) trick(`${FS.nwBack ? 'MOONWALK' : 'NOSE WHEELIE'} ${FS.nw.toFixed(1)} s`, FS.nw * (FS.nwBack ? 320 : 240)); FS.nw = 0; FS.nwBack = false; }
    // donuts: spinning in place on the ground
    const yawR = dot(ay);
    if (!air && Math.abs(yawR) > 1.4 && v > 1.5 && up > 0.6) { FS.don += yawR * dt; FS.donQ = 0; }
    else if (FS.don !== 0) {
      FS.donQ += dt;
      if (FS.donQ > 0.6) { const n = Math.floor(Math.abs(FS.don) / (2 * Math.PI)); if (n >= 1) trick(n > 1 ? `DONUTS ×${n}` : 'DONUT', 250 * n); FS.don = 0; FS.donQ = 0; }
    }
    if (G.started) arenaScreen(false);
  }

  // ------------------------------------------------------------------ attract camera (before start)
  function attractCamera(t) {
    const r = 7.5 * CAMK, ang = t * 0.15;
    camera.position.set(veh.px + Math.cos(ang) * r, veh.py + 1.2 * CAMH, veh.pz + Math.sin(ang) * r);
    const gh = groundH(camera.position.x, camera.position.z) + 0.6;
    if (camera.position.y < gh) camera.position.y = gh;
    camera.lookAt(veh.px, veh.py + 0.1, veh.pz);
    camera.fov = 45; camera.near = 0.1; camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ main loop
  let last = performance.now(), worldT = 0, fpsT = 0, frames = 0;
  window.__hc = { veh, input, world, car, camera, scene, renderer, S, G, W, perf, audio, cam, THREE, smoke };
  function loop(now) {
    requestAnimationFrame(loop);
    frame(now);
  }
  // manual stepping hook (automated testing while the tab is hidden)
  window.__hc.frame = (ms) => { const n = Math.max(1, Math.round((ms || 16.7) / 16.7)); for (let i = 0; i < n; i++) frame(last + 16.7); };
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    G.time += dt;
    input.poll(dt, veh.forwardSpeed, (() => { const a = carAxes(); const vr = veh.vx * a.rx + veh.vz * a.rz, vf = veh.vx * a.fx + veh.vz * a.fz; return Math.abs(vf) > 3 ? clamp(Math.atan2(vr, Math.abs(vf)), -0.5, 0.5) : 0; })());
    wzTick(dt);
    handleControls(dt);
    if (!G.paused) {
      veh.step(dt);
      processEvents();
      dragUpdate(dt);
      arenaUpdate(dt);
      flipHint(dt);
      effects(dt);
      rumble(dt);
    }
    updateCarVisual(dt);
    if (G.started) updateCamera(dt); else attractCamera(G.time);
    worldT -= dt;
    if (worldT <= 0) { world.update(camera.position); worldT = 0.2; }
    const left = world.processJobs(G.loadDone ? 5 : 26);
    if (!G.loadDone) {
      const ready = world.readyAround(veh.px, veh.pz, 420);
      const total = Math.max(1, world.chunks.size);
      loadBar.style.width = Math.round(100 * (1 - Math.min(1, left / (total * 1.6)))) + '%';
      if (ready) { G.loadDone = true; loadBar.style.width = '100%'; $('startBtn').textContent = 'Start engine'; }
    }
    world.frame(dt, camera, car.root.position);
    if (G.started) { audioUpdate(); hudUpdate(dt); }
    // title screen pad status
    if (!G.started && (frames & 15) === 0) {
      const pads = input.pads();
      $('padstatus').innerHTML = pads.length
        ? 'Detected: <b>' + pads.map((p) => p.id.replace(/\(.*?\)/g, '').trim()).join(', ') + '</b> — ' + (input.activeProfile() ? (input.activeProfile().auto ? 'ready (X-input layout)' : 'ready (custom mapping)') : 'open Esc → Controls → Run wheel setup after starting')
        : 'Wheel users: press any button on your wheel so the browser can see it.';
      if (!G.loadDone) $('startBtn').textContent = 'Generating world…';
    }
    // no tyre smoke in the cockpit view (it filled the cabin on burnouts); still shown from the chase cams
    smoke.mesh.visible = !(G.started && cam.mode === 2);
    // live mirrors in the cockpit: one mirror per frame, round-robin
    if (G.started && cam.mode === 2 && car.mirrors.length && !G.debugCam) {
      const m = car.mirrors[frames % car.mirrors.length];
      m.mesh.visible = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(m.rt); renderer.render(scene, m.cam); renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = true;
      m.mesh.visible = true;
    }
    renderer.render(scene, G.debugCam || camera);
    frames++; fpsT += dt;
    if (fpsT > 1) { G.fps = frames / fpsT; frames = 0; fpsT = 0; }
  }
  $('startBtn').textContent = 'Generating world…';
  requestAnimationFrame(loop);
})();
