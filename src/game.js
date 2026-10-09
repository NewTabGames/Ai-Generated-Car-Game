/* Hellcat Drive — main: wires world, physics, model, audio, input, HUD, menus and cameras together. */
(async function () {
  'use strict';
  const W = window.HCWorld, VEH = window.HCVehicle, AUD = window.HCAudio, INP = window.HCInput;
  const CAR = window.HCCarModel, WR = window.HCWorldRender, FX = window.HCFx, HUDM = window.HCHud, PULL = window.HCPuller, DRAGM = window.HCDragster, MON = window.HCMonster, KRT = window.HCKart, MOW = window.HCMower, CRU = window.HCCrushers, TANKM = window.HCTank, BIKEM = window.HCBike, OFFR = window.HCOffroad, ATVM = window.HCAtv, UNIM = window.HCUnicycle;
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
    car: 'hellcat', fuel: 'e85', tree: 'pro', rollout: true, pullerEng: 'hemi4', dragClass: 'tf', kartClass: 'tag', mowerClass: 'bp',
    miniEng: 'ev', scooterEng: 'ev', razorEng: 'ev', golfEng: 'std', rallyEng: 'r4', cyberEng: 'awd', tankEng: 'gov', bikeEng: 'stock', trophyEng: 'tt', buggyEng: 'vw', ramEng: 'hemi', atvEng: 'sport', dieselEng: 'stock', uniEng: 'pedal', sbirdEng: 'c440', rcEng: 'bl3s', coachEng: 'stock', derbyEng: 'dt466', busCow: true,
    trans: 'auto', rearTire: 'street', dpRear: 'etdrag', offroad: {}, tcMode: 0, ver: 2, abs: true, paint: 'TorRed', time: 'day', units: 'mph',
    viewDist: 1700, treeDensity: 1, shadows: true, resScale: 1, fov: 66, seatY: 0, seatZ: 0, chaseFov: 62, showHud: true, showInputs: true, showPerf: true,
    map: 'country', rsMode: 'auto', airAssist: true, vol: 0.8, engVol: 1, fxVol: 1, camMode: 0, cockpitWheel: 'match', wheelDeg: 180, clutchPedal: false, arcadeReverse: true, cockpitHud: false,
  };
  let S;
  try { S = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('hc_settings')) || {}); } catch (e) { S = Object.assign({}, DEFAULTS); }
  if (S.ver !== DEFAULTS.ver) { S.tcMode = DEFAULTS.tcMode; S.ver = DEFAULTS.ver; }
  const saveS = () => { try { localStorage.setItem('hc_settings', JSON.stringify(S)); } catch (e) { /* storage unavailable */ } };
  // (the game modes' generated race tracks - Offroad Racing's courses and Unicycle Racing's BMX tracks: where their
  // settings are kept, their course codes)
  const GMODES = {
    offroad: { key: 'offCfg', draft: 'offDraft', set: W.setOffroad, cfg: () => W.offroad, code: W.offCode, parse: W.offParse, norm: W.offNormalize, name: 'Offroad Race', what: 'offroad course' },
    uni: { key: 'uniCfg', draft: 'uniDraft', set: W.setUni, cfg: () => W.uni, code: W.uniCode, parse: W.uniParse, norm: W.uniNormalize, name: 'Unicycle Racing', what: 'BMX track' },
  };
  // (Unicycle Racing: everyone on a unicycle - the version the race was set up with - your own vehicle kept for after;
  // anywhere else, it comes back)
  if (S.map === 'uni') {
    // (a guest in a room has their own car kept already - netOwn - so it's only yours when you're not one)
    if (S.car !== 'unicycle' && !S.netOwn && !S.carBeforeUni) S.carBeforeUni = { car: S.car, uniEng: S.uniEng, tcMode: S.tcMode };
    S.car = 'unicycle'; S.uniEng = W.uniNormalize(S.uniCfg || null).ver;
  } else if (S.carBeforeUni && !S.netOwn) { Object.assign(S, S.carBeforeUni); delete S.carBeforeUni; }

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

  // (an offroad race, a unicycle race: its track from the settings - the room's, online)
  if (GMODES[S.map]) GMODES[S.map].set(S[GMODES[S.map].key] || null);
  W.setMap(S.map);
  const world = WR.create(THREE, scene, W, { viewDist: S.viewDist, treeDensity: S.treeDensity, shadows: S.shadows });
  world.setTime(S.time, renderer);

  // ------------------------------------------------------------------ vehicle
  // "More cars" (the tractor, and whatever joins it) build their entry from their options, e.g. the engine package
  // The Car Crushers 2 cars: a More Cars card each. Per car: its card title / button, paint, the traction-control
  // mode it starts on (tc) and home map (map) where it has them, chase-camera scale [distance, height], the start hint,
  // the Drive-tab line, the HUD's gearbox / tyre chips and its engine sound (see ENG_SND). The electric ones have petrol
  // alternatives: optKey / options as the More cars' (a button each on the card) and eng: per engine, what it changes
  const CC_CARS = {
    golf: { btn: 'GOLF CART', sub: 'A standard 19 mph cart, a street LSV, an electric hot rod, a 120 mph Hayabusa record cart and two jet carts', paint: 'White Knuckle', cam: [0.72, 0.95],
      hint: 'Golf cart: shift up (E) for DRIVE - a standard 48 V cart, governed to 19 mph, with drum brakes on the back wheels only. The quicker ones are on its More Cars card (or Esc → Drive → Version).',
      info: 'A standard two-seat electric golf cart (Club Car / E-Z-GO type) · 48 V series-wound motor, ~4 kW, through a 12.44:1 rear axle · 18 x 8.50-8 tyres, leaf springs, drum brakes on the rears · a bag rack with two golf bags · 380 kg with the driver · governed to 19 mph',
      trans: 'Electric · forward / reverse', tyres: 'Cart tyres',
      snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.12, whPure: 0, whine: 2.4, rpmRef: 4500, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 },
      optKey: 'golfEng', optLabel: 'Version', options: [
        ['std', 'Standard', '48 V, ~4 kW · governed to 19 mph · a bag rack with two golf bags', 'White Knuckle'],
        ['lsv', 'Street LSV', 'A 72 V AC motor, 12 kW · 35 mph · 12 in wheels, windscreen, lights and mirrors', 'Pitch Black'],
        ['hot', 'Hot Rod', 'A 45 kW / 160 Nm AC motor and a lithium pack · lowered, roof off, a roll hoop · 0-60 ~6 s · ~84 mph', 'Plum Crazy', 1],
        ['busa', 'Record (Hayabusa)', 'Built like the 118 mph world-record cart: a Hayabusa 1,340 cc four behind the seats, a 6-speed on a quickshifter · 0-60 ~4.8 s · ~120 mph', 'Go Mango', 1],
        ['jet', 'Jet', 'A surplus turbojet slung low behind the seats · 590 lbf of thrust, 810 with the afterburner · no driven wheels · 0-60 ~4 s · ~185 mph · built to stay straight flat out', 'B5 Blue', 1],
        ['mega', 'Mega Jet', 'An afterburning fighter-trainer turbojet, half as big again as the Unhinged jet, in a streamliner · 3,300 lbf dry, 4,600 lit · 0-60 in 0.8 s once spooled · 600 mph (Stage 2 700, Unhinged 800) · built to stay straight flat out', 'TorRed', 1],
      ],
      eng: {
        lsv: { hint: 'Golf cart (Street LSV): shift up (E) for DRIVE - a 72 V AC conversion, 12 kW, 35 mph, with brakes on all four wheels, lights, mirrors and a windscreen.',
          info: 'A street-legal low-speed-vehicle build of the cart · 72 V AC motor and controller, 12 kW / 70 Nm · 12 in alloy wheels on low-profile tyres · four-wheel brakes, headlights, mirrors, windscreen · 420 kg · 35 mph',
          trans: 'Electric · single speed', snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.1, whPure: 0, whine: 3, rpmRef: 6000, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 } },
        hot: { hint: 'Golf cart (Hot Rod): shift up (E) for DRIVE - a 45 kW AC motor on a lithium pack in a lowered cart with the roof off: 0-60 in ~6 s and ~84 mph. Stability control is on (Sport).',
          info: 'A hot-rodded cart · 45 kW / 160 Nm AC motor, a lithium pack under the seats, a 5.8:1 axle · lowered, roof off, a chrome roll hoop, two racing buckets · fat tyres on 13 in deep-dish wheels, four-wheel discs · 440 kg · 0-60 ~6 s, ~84 mph',
          trans: 'Electric · single speed', tyres: 'Street tyres', snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.09, whPure: 1, whine: 3.4, rpmRef: 8000, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 } },
        jet: { hint: 'Jet golf cart: shift up (E) for DRIVE. The throttle spools a turbojet, and it takes ~3 s to wind up from idle - so at a stop hold SPACE (the brakes), floor it, and let go once it howls - the afterburner lights as you go. Nothing drives the wheels: it rolls free (brake early - it keeps pushing for a second after you lift), and in R the cart\'s old electric motor backs it up. Stability control is on (Sport).',
          info: 'A jet-powered cart for the drag-strip shows: a surplus target-drone turbojet (~590 lbf of thrust dry, ~810 lbf with a homebuilt afterburner) slung low behind the seats so its thrust runs through the centre of gravity, a stretched, lowered and widened frame, 12 in wheels on low-profile radials (wider at the back), four-wheel discs with ABS, a nose cone and a tail fin · 480 kg · 0-60 ~4 s, ~185 mph',
          trans: 'Jet thrust · electric reverse', tyres: 'Cart radials', snd: { jet: 1, nEng: 1, cyl: 8, ev: 0, whK: 0.3, whPure: 1, whine: 1, rpmRef: 10000, open: 1, fmul: 1, deep: 0, loud: 0.6, race: 0 } },
        mega: { hint: 'Mega Jet golf cart: shift up (E) for DRIVE. The throttle spools an afterburning fighter-trainer turbojet (~3 s from idle) - hold SPACE (the brakes), floor it and let go as it howls: the brakes only hold it about halfway up the spool, and then it drags the locked tyres. The afterburner lights as you go - 0-60 in under a second. Nothing drives the wheels; reverse (R) is an electric motor. Stability control is on (Sport).',
          info: 'The jet cart with an engine half as big again as the Unhinged one - 2.4 times the stock turbojet across: an afterburning fighter-trainer turbojet, ~3,300 lbf of thrust dry and ~4,600 lbf lit, on a longer, wider frame with the thrust through the centre of gravity, half its weight on the nose, a big fin on the afterburner can and a slippery streamliner body held down (~1,800 lb from 150 mph up - no more, so it never crushes itself onto its belly) · 700 kg · 0-60 in 0.8 s once spooled, 0-400 in ~8 s, 600 mph - Stage 2 ~700 mph, Unhinged 800 mph. Flat out it flies off crests for seconds and lands on its wheels',
          trans: 'Jet thrust · electric reverse', tyres: 'Cart radials', cam: [1.3, 1.75],          // (the chase camera back and up: over the engine and its fin)
          snd: { jet: 1, nEng: 1, cyl: 8, ev: 0, whK: 0.3, whPure: 1, whine: 1, rpmRef: 10000, open: 1, fmul: 1, deep: 0, loud: 0.8, race: 0 } },
        busa: { hint: 'Golf cart (Record): shift up (E) for DRIVE and floor it - a Hayabusa 1,340 cc four behind the seats, ~190 hp through the bike\'s 6-speed (E / Q or the paddles), a stretched, lowered frame and a wheelie bar. The real one did 118.76 mph. Stability control is on (Sport).',
          info: 'Built like the world\'s fastest golf cart (118.76 mph): a stretched, lowered cart frame with a Suzuki Hayabusa 1,340 cc inline-four (~190 hp at 9,700) bare behind the seats, the bike\'s 6-speed on a quickshifter, a chain to the rear axle, a wheelie bar · slicks · 500 kg · 0-60 ~4.8 s, ~120 mph',
          trans: '6-speed sequential · quickshifter', tyres: 'Cart slicks', snd: { nEng: 1, cyl: 4, fmul: 1.5, deep: 0, loud: 0.5, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 11000, race: 0.9, rough: 0.06 } },
      } },
    rally: { btn: 'RALLY CAR', sub: 'Rally4, Rally2 and Group B · gravel tyres, sequential boxes · 208-530 hp · its own gravel stages', paint: 'B5 Blue', cam: [1.0, 1.0], map: 'rally',
      hint: 'Rally4: shift up (E) for DRIVE - front-wheel drive, a 1.2 turbo triple with 208 hp and a 5-speed sequential that flat-shifts (E / Q or the paddles). SPACE is the hydraulic handbrake for the hairpins. Its home is the gravel of the Rally Stage (and the Windy Rally Stage: Esc → Drive → Map).',
      info: 'A Rally4 hatch · front-wheel drive, a plated front diff · 1.2 L turbo triple on a 30 mm restrictor, 208 hp at 5,500, 290 Nm · 5-speed sequential dog box · long-travel dampers, hydraulic handbrake, roll cage · 195/65R15 gravel tyres · 1,240 kg with the crew · 0-60 ~6 s',
      trans: '5-speed sequential · FWD', tyres: 'Gravel rally tyres',
      snd: { nEng: 1, cyl: 3, fmul: 1.25, deep: 0.05, loud: 0.45, open: 0, whK: 0.45, whPure: 1, whine: 0.9, rpmRef: 6600, race: 0.8, rough: 0.12, surge: 1 },
      optKey: 'rallyEng', optLabel: 'Class', options: [
        ['r4', 'Rally4', 'Front-wheel drive · a 1.2 turbo triple, 208 hp · 5-speed sequential · 1,240 kg · 0-60 ~6 s', 'B5 Blue'],
        ['r2', 'Rally2', 'Four-wheel drive · a 1.6 turbo four, 290 hp · 5-speed sequential · 1,390 kg · 0-60 ~4 s', 'White Knuckle'],
        ['gb', 'Group B', 'The 1986 monsters: mid-engined, four-wheel drive, a twin-charged 1.8 four at ~530 hp and an anti-lag that bangs on every lift · 0-60 ~3 s', 'TorRed'],
      ],
      eng: {
        r2: { hint: 'Rally2: shift up (E) for DRIVE - four-wheel drive, a 1.6 turbo four with 290 hp, a 5-speed sequential (E / Q or the paddles). SPACE is the hydraulic handbrake. Launch: hold SPACE, floor it, let go.',
          info: 'A Rally2 car · four-wheel drive with no centre diff, plated front and rear diffs · 1.6 L turbo four on a 32 mm restrictor, 290 hp at 5,500, 420 Nm · 5-speed sequential · long-travel dampers, hydraulic handbrake, roll cage · gravel tyres · 1,390 kg with the crew · 0-60 ~4 s',
          trans: '5-speed sequential · 4WD', snd: { nEng: 1, cyl: 4, fmul: 1.3, deep: 0.05, loud: 0.55, open: 0, whK: 0.42, whPure: 1, whine: 1.0, rpmRef: 7000, race: 0.85, rough: 0.1, surge: 1 } },
        gb: { hint: 'Group B: shift up (E) for DRIVE - mid-engined, four-wheel drive, ~530 hp from a twin-charged 1.8. The turbo takes a moment to wake up, then it goes; the anti-lag bangs on every lift. Launch: hold SPACE, floor it, let go. Traction control Off is the real thing.',
          info: 'A 1986 Group B car · the engine behind the seats, four-wheel drive with a rear-biased centre diff · twin-charged 1.8 L four, ~530 hp at 8,000, 490 Nm, big turbo lag, anti-lag · 5-speed · a huge wing · gravel tyres · 1,150 kg with the crew · 0-60 ~3 s',
          trans: '5-speed · 4WD', snd: { nEng: 1, cyl: 4, fmul: 1.15, deep: 0.1, loud: 0.8, open: 0, whK: 0.5, whPure: 1, whine: 1.3, rpmRef: 8400, race: 1, rough: 0.12, surge: 1 } },
      } },
    couch: { btn: 'COUCH CAR', sub: '850 hp turbo triple · 190 mph sofa', paint: 'Saddle', tc: 2, cam: [0.75, 0.85],
      hint: 'Couch Car: shift up (E) for DRIVE and floor it - an 850 hp turbo triple under the cushions and a 5-speed sequential (E / Q or the paddles). The turbo needs a moment to spool: hold SPACE, floor it and let go for a launch-control start. Traction control is on Track, and wheelie control keeps the front down - and on its short wheelbase it is twitchy at speed.',
      info: 'A three-seat leather sofa on a hidden tube chassis · 1.6 L turbo triple built like a drag engine, ~850 hp on 40 psi and E85, its three pipes out of the right arm · 5-speed sequential with a quickshifter, locked diff · 13 in R-compound tyres in the softest compound, sticky from cold · wheelie control · 520 kg with the driver · 0-60 ~2.8 s, ~190 mph',
      trans: '5-speed sequential · quickshifter', tyres: 'R-compound 13 in',
      snd: { nEng: 1, cyl: 3, fmul: 1.3, deep: 0.15, loud: 0.5, open: 1, whK: 0.42, whPure: 1, whine: 1.4, rpmRef: 8300, race: 1, rough: 0.15, surge: 1 } },
    eggrod: { btn: 'EGG ROD', sub: '350 small-block hot rod · 142 mph', paint: 'White Knuckle', cam: [0.95, 0.95],
      hint: 'Egg Rod: shift up (E) for DRIVE and floor it - a 350 small-block behind the egg, a 3-speed automatic, fat rear tyres and a big wing. No stability control on a hot rod: ease into the throttle out of a turn.',
      info: 'The Mork & Mindy egg car as a hot rod · 350 cu in small-block V8, ~360 hp · TH350 3-speed automatic, posi rear · street tyres on copper wheels, a rear wing · 1,450 kg · 0-60 ~4.4 s, ~142 mph',
      trans: '3-speed automatic', tyres: 'Street tyres',
      snd: { nEng: 1, cyl: 8, fmul: 1.02, deep: 0.2, loud: 0.3, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5800, race: 0.7, rough: 0.25 } },
    banana: { btn: 'BANANA CAR', sub: 'F-150 5.0 V8 · floats · 85 mph', paint: 'Buttercup', cam: [1.25, 1.1],
      hint: 'Banana Car: shift up (E) for DRIVE - a 1993 F-150 under the fibreglass: 185 hp, four speeds, 85 mph. And it floats: drive into a lake and the rear tyres paddle it along while the fronts steer like rudders.',
      info: 'The Big Banana Car · a fibreglass banana on a 1993 Ford F-150 frame · 5.0 L V8, 185 hp · 4-speed automatic · five seats · 1,730 kg · governed to 85 mph · amphibious, as in the game: the sealed hull floats with ~0.4 m of draft and the spinning rear tyres paddle it at ~6 mph',
      trans: '4-speed automatic', tyres: 'All-season tyres',
      snd: { nEng: 1, cyl: 8, fmul: 1.0, deep: 0.1, loud: 0, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 4500, race: 0, rough: 0.05 } },
    bluebird: { btn: 'BLUE BIRD', sub: '2,350 hp Rolls-Royce V12 · 300 mph', paint: 'Bluebird', tc: 2, map: 'straight', cam: [1.35, 0.95],
      hint: 'Blue Bird: shift up (E) for DRIVE - a 36.7 L supercharged Rolls-Royce V12, 2,350 hp, three gears. In 1935 it needed Bonneville\'s whole course to reach 301 mph: give it miles, keep the wheel still (it steers like a ship) and brake early.',
      info: 'Campbell\'s 1935 Campbell-Napier-Railton Blue Bird · 36.7 L supercharged Rolls-Royce R V12, 2,350 hp at 3,200 rpm · 3-speed gearbox, twin rear wheels · Dunlop 37 x 7 tyres · ~4.9 t · 301.129 mph at Bonneville on 3 September 1935, the first car over 300',
      trans: '3-speed · multi-plate clutch', tyres: 'Dunlop 37 x 7',
      snd: { nEng: 1, cyl: 12, fmul: 0.55, deep: 0.9, loud: 1, open: 1, whK: 0.9, whPure: 1, whine: 1.0, rpmRef: 3300, race: 0.8, rough: 0.2 } },
    gtr: { btn: 'NISSAN GTR', sub: '565 hp twin-turbo V6 · AWD · 196 mph', paint: 'TorRed', cam: [1.0, 1.0],
      hint: 'Nissan GTR: shift up (E) for DRIVE - a 565 hp twin-turbo V6, a 6-speed dual-clutch (E / Q or the paddles to shift yourself) and all-wheel drive. Launch control: hold SPACE, floor it, let go.',
      info: 'Nissan GT-R (R35) in a Liberty Walk widebody · VR38DETT 3.8 L twin-turbo V6, 565 hp at 6,800, 467 lb-ft · GR6 6-speed dual-clutch · ATTESA E-TS all-wheel drive, rear-biased · 1,752 kg · 0-60 ~3.5 s floored, ~196 mph',
      trans: '6-speed dual-clutch · AWD', tyres: 'Summer tyres',
      snd: { nEng: 1, cyl: 6, fmul: 1.2, deep: 0, loud: 0.15, open: 0, whK: 0.55, whPure: 1, whine: 0.7, rpmRef: 7000, race: 0.35, rough: 0.05 } },
    mini: { btn: 'MINI DOOKIE', sub: '15 kW electric city pod · 55 mph', paint: 'Bronze Yellow', cam: [0.8, 1.0],
      hint: 'Mini Dookie: shift up (E) for DRIVE - an electric one-seat city pod: 20 hp, one gear, 55 mph and in no hurry getting there. Silent at a standstill; lift off and it regenerates.',
      info: 'The game\'s Pamingo Mini (the Fiat Pongo concept) · 15 kW / 60 Nm electric motor, a single 9:1 reduction · 145/70R15 eco tyres · 670 kg · ~55 mph',
      trans: 'Electric · single speed', tyres: 'Eco tyres',
      snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.067, whPure: 0, whine: 3.2, rpmRef: 8000, open: 0, fmul: 1, deep: 0, loud: 0, race: 0 },
      optKey: 'miniEng', options: [
        ['ev', 'Electric', '15 kW / 60 Nm motor · single speed · ~55 mph'],
        ['twinair', '0.9 TwinAir', 'Fiat\'s 0.9 L turbo two-cylinder under the rear floor · 85 hp · 5-speed automated manual · 0-60 ~7 s · ~105 mph'],
      ],
      eng: { twinair: {
        hint: 'Mini Dookie (0.9 TwinAir): shift up (E) for DRIVE - Fiat\'s little turbo two-cylinder under the rear floor, 85 hp, and a 5-speed automated manual (E / Q to shift yourself) that takes its time over every shift. ~105 mph.',
        info: 'The game\'s Pamingo Mini with a petrol engine: the Fiat 0.9 TwinAir turbo two-cylinder, 85 hp at 5,500, 145 Nm at 1,900, mounted across under the rear floor behind the seat · 5-speed automated manual (a robot works the clutch) · 145/70R15 eco tyres · 670 kg · 0-60 ~7 s, ~105 mph',
        trans: '5-speed automated manual',
        snd: { nEng: 1, cyl: 2, vt: 180, fmul: 1.35, deep: 0, loud: 0.1, open: 0, whK: 0.5, whPure: 1, whine: 0.45, rpmRef: 6000, race: 0.1, rough: 0.2 } } } },
    potty: { btn: 'PORTA POTTY', sub: '22 hp V-twin toilet · 45 mph', paint: 'Potty Blue', cam: [0.75, 1.25],
      hint: 'Porta Potty: shift up (E) for DRIVE and floor it - a 22 hp V-twin under the throne, 45 mph flat out. The centre of gravity is at hip height on a 1 m track: take a turn quickly and over it goes (once it has stopped, steer left or right to flip it back).',
      info: 'A portable toilet (PolyJohn PJP3-type, 2.3 m tall) on a go-kart frame, the door open · 670 cc V-twin, 22 hp, under the seat · torque-converter drive · 10 in wheels · 290 kg with the driver · ~45 mph · tips over at ~0.75 g',
      trans: 'Torque converter', tyres: '10 in tyres',
      snd: { nEng: 1, cyl: 2, vt: 90, fmul: 1.25, deep: 0.05, loud: 0.2, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 4000, race: 0.5, rough: 0.35 } },
    scooter: { btn: 'TURBO SCOOTER 3000', sub: '100 kW mobility scooter · 119 mph', paint: 'Crimson', tc: 1, cam: [0.6, 0.95],
      hint: 'Turbo Scooter 3000: shift up (E) for DRIVE - a mobility scooter with a 100 kW motor, ~119 mph. Wheelie control and the anti-tip wheels stop it looping over on the launch; the wide-track kit and a stabiliser wheel out each side keep it upright in a turn - it leans onto one and slides instead. Stability control is on (Sport).',
      info: 'A four-wheel mobility scooter (Shoprider Venturer-type) with its 1 hp motor swapped for a 100 kW axial-flux motor and a lithium pack · 220 Nm through a 2.42:1 belt · soft 10 in tyres on a wide-track kit, a stabiliser wheel on an arm out each side · 215 kg with the rider · 0-60 ~3.4 s, ~119 mph · wheelie control (off with TC Off), anti-tip wheels, stability control',
      trans: 'Electric · direct drive', tyres: 'Soft 10 in tyres',
      snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.167, whPure: 1, whine: 3.5, rpmRef: 10000, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 },
      optKey: 'scooterEng', options: [
        ['ev', 'Electric', '100 kW / 220 Nm motor · direct drive · 0-60 ~3.4 s · ~119 mph'],
        ['busa', 'Turbo Hayabusa', 'Suzuki Hayabusa 1,340 cc four with a turbo, where the rear shell was · ~260 hp · 6-speed + quickshifter · ~150 mph'],
      ],
      eng: { busa: {
        hint: 'Turbo Scooter 3000 (Turbo Hayabusa): shift up (E) for DRIVE and floor it - a Hayabusa four with a turbo bolted where the rear shell was, ~260 hp, the bike\'s 6-speed on a quickshifter (E / Q or the paddles). Wheelie control holds the front down; the outriggers catch it in a hard turn. ~150 mph on 10 in wheels.',
        info: 'The mobility scooter with its rear shell thrown away for a Suzuki Hayabusa 1,340 cc inline-four and a turbo on ~10 psi: ~260 hp at 10,000, 206 Nm at 7,500 · the bike\'s 6-speed with a quickshifter, chain to the rear axle · wide-track kit, side stabiliser wheels, anti-tip wheels · soft 10 in tyres · 250 kg with the rider · 0-60 ~4.2 s, ~150 mph',
        trans: '6-speed sequential · quickshifter',
        snd: { nEng: 1, cyl: 4, fmul: 1.5, deep: 0, loud: 0.5, open: 1, whK: 0.5, whPure: 1, whine: 1.3, rpmRef: 11000, race: 0.85, rough: 0.07, surge: 1 } } } },
    razor: { btn: 'RAZORS EDGE', sub: '110 kW electric glass wedge · 142 mph', paint: 'Go Mango', cam: [1.0, 0.95],
      hint: 'Razors Edge: shift up (E) for DRIVE - a golf cart under a wedge of smoked glass, 110 kW electric, ~142 mph. The paint colour is its neon (Esc → Drive → Paint).',
      info: 'The game\'s Halloween special after the Lo Res Car: a golf-cart chassis under a faceted body of smoked glass edged in neon, a graveyard on its flanks · 110 kW / 250 Nm electric motor, a single 4.95:1 reduction · 18 x 8.50-8 cart tyres · 530 kg · 0-60 ~4.4 s, ~142 mph',
      trans: 'Electric · single speed', tyres: 'Cart tyres',
      snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.1, whPure: 0, whine: 3.4, rpmRef: 12000, open: 0, fmul: 1, deep: 0, loud: 0, race: 0 },
      optKey: 'razorEng', options: [
        ['ev', 'Electric', '110 kW / 250 Nm motor · single speed · 0-60 ~4.4 s · ~142 mph'],
        ['ls', '5.3 LS V8', 'A junkyard 5.3 L LS V8 behind the bench · 285 hp · 4-speed automatic · 0-60 ~4.2 s · ~165 mph'],
      ],
      eng: { ls: {
        hint: 'Razors Edge (5.3 LS V8): shift up (E) for DRIVE - a junkyard 5.3 L LS V8 behind the bench, 285 hp through a 4-speed automatic. Below ~70 mph it will light up the cart tyres: squeeze the throttle. ~165 mph.',
        info: 'The glass wedge on its golf-cart frame with the cart builder\'s favourite swap: a junkyard 5.3 L LS V8, 285 hp at 5,200, 325 lb-ft at 4,000, behind the bench · 4L60E 4-speed automatic, a 9-inch rear axle on 3.08 gears · 18 x 8.50-8 cart tyres · 690 kg · 0-60 ~4.2 s, ~165 mph',
        trans: '4-speed automatic',
        snd: { nEng: 1, cyl: 8, fmul: 1.05, deep: 0.1, loud: 0.3, open: 0, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5800, race: 0.55, rough: 0.12 } } } },
    trophy: { btn: 'TROPHY TRUCK', sub: 'A Baja 1000-type desert racer · ~900 hp V8 · 27-33 in of wheel travel on bypass shocks · 39 in desert tyres · floats over whoops at 80 mph · Spec, Trophy Truck and an unlimited 4WD', paint: 'TorRed', tc: 1, cam: [1.35, 1.45],
      hint: 'Trophy Truck: shift up (E) for DRIVE - a ~900 hp V8 through a 3-speed automatic, 0-60 in ~4.2 s, ~136 mph. Its suspension is the point: ~27 in of travel up front and ~33 in at the back on bypass shocks - take it off the road and flat out over the rough stuff (the Rally Stage, the country hills, the arena whoops): the wheels do the work and the body just floats.',
      info: 'Built like a Baja 1000 Trophy Truck: a chromoly tube chassis under a fiberglass pickup body · ~900 hp, 850 lb-ft big-block V8 · Turbo 400 3-speed automatic, locked rear · long-travel A-arms (~27 in) and a 4-link solid axle (~33 in) on coil-overs and bypass shocks - soft in mid-stroke, stiff at the end · 39x13.5R17 desert tyres on beadlocks · ~2,900 kg, 3.3 m wheelbase, 2.2 m track · 0-60 ~4.2 s, ~136 mph',
      trans: '3-speed automatic · locked rear', tyres: '39 in desert tyres',
      snd: { nEng: 1, cyl: 8, fmul: 0.95, deep: 0.35, loud: 0.8, open: 1, whK: 0.19, whPure: 0, whine: 0.3, rpmRef: 7000, race: 0.9, rough: 0.2 },
      optKey: 'trophyEng', optLabel: 'Version', options: [
        ['spec', 'Trophy Truck Spec', 'The spec class: a sealed ~525 hp LS V8, the same long-travel suspension · 0-60 ~5.5 s · ~125 mph'],
        ['tt', 'Trophy Truck', '~900 hp big-block V8 · rear drive · 0-60 ~4.2 s · ~136 mph'],
        ['awd', 'Unlimited 4WD', '~1,050 hp and all-wheel drive · 0-60 ~3.1 s · ~142 mph'],
      ],
      eng: {
        spec: { hint: 'Trophy Truck Spec: shift up (E) for DRIVE - the spec class: a sealed ~525 hp LS V8, 0-60 in ~5.5 s, ~125 mph, and the same long-travel suspension - flat out over the rough stuff, the body just floats.',
          info: 'The Trophy Truck Spec class: the same tube chassis, long-travel suspension (~27 / 33 in) and 39 in desert tyres with a sealed ~525 hp, 500 lb-ft 6.2 L LS V8 · 3-speed automatic · ~2,800 kg · 0-60 ~5.5 s, ~125 mph',
          snd: { nEng: 1, cyl: 8, fmul: 1.05, deep: 0.2, loud: 0.6, open: 1, whK: 0.19, whPure: 0, whine: 0.2, rpmRef: 6500, race: 0.7, rough: 0.15 } },
        awd: { hint: 'Unlimited 4WD trophy truck: shift up (E) for DRIVE - ~1,050 hp to all four wheels, 0-60 in ~3.1 s, ~142 mph, on ~30 in of wheel travel - it pulls out of the corners and over the whoops like nothing else.',
          info: 'An unlimited 4WD trophy truck (the new breed): ~1,050 hp, 960 lb-ft V8 · 3-speed automatic, all-wheel drive with a centre diff · long-travel suspension (~27 / 33 in), 39 in desert tyres · ~3,080 kg · 0-60 ~3.1 s, ~142 mph',
          trans: '3-speed automatic · 4WD',
          snd: { nEng: 1, cyl: 8, fmul: 0.92, deep: 0.4, loud: 0.9, open: 1, whK: 0.19, whPure: 0, whine: 0.4, rpmRef: 7000, race: 1, rough: 0.2 } },
      } },
    buggy: { btn: 'DUNE BUGGY', sub: 'A VW sand rail · tube frame, diamond-plate floor, two buckets and a roll cage · a 1600 VW, a built 2276 on dual Webers, or an LS V8 · sand paddles or off-road knobbies · its own sand dunes', paint: 'Crimson', tc: 1, cam: [0.95, 1.05], map: 'dunes',
      hint: 'Dune Buggy: shift up (E) for DRIVE - a stock 1600 VW flat-four, ~60 hp through the VW 4-speed (it shifts for you, or E / Q), 560 kg, ~80 mph. Light, rear-engined and loose on its skinny fronts - it slides in the dirt. Tyres (Esc → Drive): sand paddles for the dunes, or off-road knobbies.',
      info: 'A VW-based sand rail: a chromoly tube frame on a diamond-plate floor, a roll cage with two lamps, two high-back buckets, the battery on the nose · 1600 cc VW flat-four (dual-port), ~60 hp, 82 lb-ft · VW 4-speed transaxle · VW beam front end on coil-overs, trailing arms at the back · 5.60-15 fronts, 235/75R15 rears on polished five-spokes · ~560 kg with the driver, 38 / 62 · 0-60 ~10 s, ~80 mph',
      trans: 'VW 4-speed', tyres: 'Buggy tyres',
      snd: { nEng: 1, cyl: 4, fmul: 1.25, deep: 0.1, loud: 0.35, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5000, race: 0.3, rough: 0.35 },
      optKey: 'buggyEng', optLabel: 'Engine', options: [
        ['vw', '1600 VW', 'Stock 1600 flat-four · ~60 hp · VW 4-speed · 0-60 ~10 s · ~80 mph'],
        ['built', 'Built 2276 VW', 'A 2276 cc stroker on dual Webers · ~150 hp · 0-60 ~4.8 s · ~110 mph'],
        // (5th: it starts on STREET stability control - 480 hp in 790 kg on street tyres swaps ends at any real throttle)
        ['ls', 'LS3 V8 sand rail', 'A 6.2 L LS3 V8, ~480 hp · sequential 4-speed · long-travel arms · 0-60 ~4.4 s · ~135 mph', undefined, 0],
      ],
      eng: {
        built: { hint: 'Dune Buggy (built 2276 VW): shift up (E) for DRIVE - a stroked VW on dual Webers, ~150 hp in a 575 kg buggy: 0-60 in ~4.8 s, ~110 mph. Rear-engined and light - it slides in the dirt.',
          info: 'The sand rail with a built VW: a 2276 cc stroker on dual Weber 48s, ~150 hp at 5,800, 150 lb-ft · VW 4-speed (4.125 ring and pinion) · ~575 kg · 0-60 ~4.8 s, ~110 mph',
          snd: { nEng: 1, cyl: 4, fmul: 1.15, deep: 0.15, loud: 0.6, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 6300, race: 0.7, rough: 0.3 } },
        ls: { hint: 'LS3 V8 sand rail: shift up (E) for DRIVE - ~480 hp in 790 kg, a sequential 4-speed, long-travel arms: 0-60 in ~4.4 s (it spins its street tyres), ~135 mph. It starts on STREET stability control - switch it off for the full, sideways thing.',
          info: 'A long-travel sand rail with an LS swap: a 6.2 L LS3 V8, ~480 hp, 475 lb-ft, the radiator up on the cage · 4-speed sequential race transaxle · long-travel trailing arms (~19 in at the back) · ~790 kg · 0-60 ~4.4 s, ~135 mph',
          trans: '4-speed sequential',
          snd: { nEng: 1, cyl: 8, fmul: 1.05, deep: 0.25, loud: 0.7, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 6500, race: 0.8, rough: 0.2 } },
      } },
    bike: { btn: 'TOURING BAGGER', sub: 'A Street Glide-type touring bike · 117 ci V-twin · batwing fairing, hard bags · leans into the turns · stock, a 190 hp race bagger and a 400 hp turbo drag bagger', paint: 'Smoke Show', tc: 1, cam: [0.95, 1.25],
      hint: 'Touring Bagger: shift up (E) for DRIVE - a 117 ci V-twin, 105 hp and 130 lb-ft through a 6-speed (it shifts for you, or E / Q). You ride it like a bike: steer and it leans into the turn, and a foot goes down when you stop. Lean it too far and the floorboards scrape. ~125 mph.',
      info: 'Built like a Street Glide: a 117 ci (1,923 cc) 45-degree V-twin, 105 hp at 5,020, 130 lb-ft at 3,500 · a 6-speed and a belt final drive · the batwing fairing on the forks with its short smoked screen and LED headlamp · hard saddlebags, floorboards, black pipes · 130/60B19 front, 180/55B18 rear · 368 kg wet + the rider · leans ~32 degrees before the floorboards touch · 0-60 ~4.0 s, ~125 mph',
      trans: '6-speed · belt drive', tyres: 'Touring tyres',
      snd: { nEng: 1, cyl: 2, vt: 45, fmul: 1.3, deep: 0.35, loud: 0.55, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5500, race: 0.4, rough: 0.45 },
      optKey: 'bikeEng', optLabel: 'Version', options: [
        ['stock', 'Stock 117', '117 ci V-twin · 105 hp / 130 lb-ft · 6-speed · 0-60 ~4.0 s · ~125 mph'],
        ['race', 'Race bagger', 'A King of the Baggers-type race bike · 131 ci, ~190 hp · race suspension, slicks, leans 50 degrees · 0-60 ~3.2 s · ~160 mph'],
        ['turbo', 'Turbo drag bagger', 'A turbocharged V-twin, ~400 hp · stretched swingarm, wheelie control · 0-60 ~3.1 s · ~180 mph'],
      ],
      eng: {
        race: { hint: 'Race bagger: shift up (E) for DRIVE - a 131 ci race V-twin, ~190 hp, on slicks with race suspension: it leans 50 degrees before anything touches. Squeeze the throttle out of the turns. ~160 mph.',
          info: 'A King of the Baggers-type race bagger: the bags and the fairing kept, a 131 ci race motor (~190 hp, 155 lb-ft), a quickshifter, race forks and shocks for the clearance to lean 50 degrees, 17 in wheels on race slicks, big brakes · ~370 kg with the rider · 0-60 ~3.2 s, ~160 mph',
          trans: '6-speed · quickshifter', tyres: 'Race slicks',
          snd: { nEng: 1, cyl: 2, vt: 45, fmul: 1.2, deep: 0.25, loud: 0.8, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 7400, race: 0.8, rough: 0.35 } },
        turbo: { hint: 'Turbo drag bagger: shift up (E) for DRIVE - a turbocharged V-twin, ~400 hp, a stretched swingarm and wheelie control to keep the front down. It launches on boost; hold on. 0-60 in ~3.1 s, ~180 mph.',
          info: 'A turbo drag bagger: the V-twin with a turbo hung off the right side on 16 psi, ~400 hp and 280 lb-ft · a stretched swingarm (1.85 m wheelbase), a drag slick on the back, wheelie control · ~430 kg with the rider · 0-60 ~3.1 s, ~180 mph',
          trans: '6-speed · air shifter', tyres: 'Touring front · drag slick rear',
          snd: { nEng: 1, cyl: 2, vt: 45, fmul: 1.25, deep: 0.3, loud: 0.85, open: 1, whK: 0.5, whPure: 1, whine: 1.1, rpmRef: 6800, race: 0.7, rough: 0.35 } },
      } },
    tank: { btn: 'MAIN BATTLE TANK', sub: 'A 62 t Abrams-type tank · 1,500 hp gas turbine · steers on its tracks, pivots in place · the turret follows where you look · governed, ungoverned and a 3,000 hp hot rod', paint: 'Sand', tc: 3, cam: [2.1, 2.0],
      hint: 'Main battle tank (governed): shift up (E) for DRIVE - a 1,500 hp gas turbine, 42 mph. It steers on its tracks: steer and one track runs faster than the other; at a stop in NEUTRAL it pivots on the spot. The turret and gun follow the camera - drag the mouse to look round (the view button puts the camera back behind). No shooting.',
      info: 'Built like an M1A2 Abrams: ~62 t · a 1,500 hp gas turbine, 3,950 lb-ft at its output shaft · a 4-speed automatic cross-drive transmission with a torque converter and hydrostatic steering · seven dual road wheels a side on torsion bars, rubber-padded steel tracks 635 mm wide · the 120 mm gun, the commander\'s .50 cal, the loader\'s M240 · 0-20 mph in ~6 s, governed to 42 mph',
      trans: 'Turbine · 4-speed automatic · skid steer', tyres: 'Steel tracks',
      snd: { jet: 1, nEng: 1, cyl: 8, ev: 0, whK: 0.35, whPure: 1, whine: 1.3, rpmRef: 3000, open: 1, fmul: 1, deep: 0.5, loud: 0.9, race: 0 },
      optKey: 'tankEng', optLabel: 'Version', options: [
        ['gov', 'Governed', 'As it serves: the turbine governed to 42 mph · 0-20 mph in ~6 s'],
        ['ungov', 'Ungoverned', 'The governor off and the final drive taller · ~55 mph'],
        ['hot', '3,000 hp hot rod', 'A turbine turned up to 3,000 hp · 0-20 mph in 3 s · ~68 mph'],
      ],
      eng: {
        ungov: { hint: 'Main battle tank (ungoverned): shift up (E) for DRIVE - the governor off and taller gearing, ~55 mph. It steers on its tracks and pivots in NEUTRAL. The turret follows the camera - drag the mouse to look round.' },
        hot: { hint: 'Main battle tank (3,000 hp hot rod): shift up (E) for DRIVE - the turbine turned up to 3,000 hp: 0-20 in 3 s and ~68 mph in 62 t. It steers on its tracks and pivots in NEUTRAL. The turret follows the camera - drag the mouse to look round.',
          info: 'The Abrams-type tank with its gas turbine turned up to 3,000 hp (7,900 lb-ft at the output shaft) and geared taller · ~62 t · 0-20 mph in ~3 s, ~68 mph', snd: { jet: 1, nEng: 1, cyl: 8, ev: 0, whK: 0.35, whPure: 1, whine: 1.5, rpmRef: 3000, open: 1, fmul: 1, deep: 0.6, loud: 1, race: 0 } },
      } },
    ram: { btn: 'RAM 1500 HEMI', sub: 'The Rebel: crew cab, 5.7 HEMI V8, 8-speed, 4x4 on 33 in all-terrains, air suspension · the 5.7 HEMI, a supercharged 5.7 or a 6.2 Hellcat HEMI swap', paint: 'Diamond Black', tc: 0, cam: [1.2, 1.25], road: true,
      hint: 'Ram 1500 Rebel: shift up (E) for DRIVE - the 5.7 HEMI V8, 395 hp through an 8-speed automatic, 4x4 in 4-Auto: 0-60 in ~6 s, governed at 106 mph. A big truck on air suspension and all-terrains - brake early, it weighs 5,500 lb.',
      info: 'Ram 1500 Rebel (2019-24): crew cab, 5\'7" box · 5.7 L HEMI V8 with eTorque, 395 hp at 5,600, 410 lb-ft at 3,950 · 8-speed TorqueFlite automatic, 3.92 axles, on-demand 4WD (4-Auto) · 4-corner air suspension · 275/70R18 all-terrains (33 in) on black 18 in wheels · 5.92 m long, 3.67 m wheelbase · ~2,550 kg · 0-60 ~6 s, 106 mph governed',
      trans: '8-speed auto · 4x4', tyres: '33 in all-terrain',
      snd: { nEng: 1, cyl: 8, fmul: 1.0, deep: 0.3, loud: 0.5, open: 0.3, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5800, race: 0.2, rough: 0.1 },
      optKey: 'ramEng', optLabel: 'Engine', options: [
        ['hemi', '5.7 HEMI', 'The Rebel\'s 5.7 HEMI V8 · 395 hp · 410 lb-ft · 0-60 ~6 s · 106 mph governed'],
        ['blown', 'Supercharged 5.7', 'A bolt-on blower kit on the 5.7 HEMI · ~575 hp · 0-60 ~4.4 s · 120 mph'],
        ['hellcat', '6.2 Hellcat swap', 'The Hellcat\'s 6.2 supercharged HEMI · ~710 hp · 650 lb-ft · 0-60 ~3.7 s · 118 mph'],
      ],
      eng: {
        blown: { hint: 'Ram 1500 Rebel, supercharged 5.7 HEMI: shift up (E) for DRIVE - a bolt-on blower kit, ~575 hp, the 8-speed and 4x4: 0-60 in ~4.4 s, 120 mph. It whines.',
          info: 'The Rebel with a supercharger kit on its 5.7 HEMI (~8 psi): ~575 hp, 540 lb-ft · 8-speed TorqueFlite, 4-Auto · ~2,580 kg · 0-60 ~4.4 s, 120 mph',
          snd: { nEng: 1, cyl: 8, fmul: 1.0, deep: 0.35, loud: 0.65, open: 0.5, whK: 0.19, whPure: 0.4, whine: 1.2, rpmRef: 5800, race: 0.35, rough: 0.1 } },
        hellcat: { hint: 'Ram 1500 Rebel, 6.2 Hellcat HEMI swap: shift up (E) for DRIVE - the Hellcat\'s supercharged 6.2, ~710 hp and 650 lb-ft through the 8-speed to all four wheels: 0-60 in ~3.7 s, 118 mph. Stability control is on (Street) - it\'ll light up the rears.',
          info: 'The Rebel with the Hellcat\'s supercharged 6.2 HEMI: ~710 hp, 650 lb-ft · 2.4 L blower, 11.6 psi · 8-speed TorqueFlite, 4-Auto · ~2,590 kg · 0-60 ~3.7 s, 118 mph',
          snd: { nEng: 1, cyl: 8, fmul: 0.97, deep: 0.35, loud: 0.8, open: 0.8, whK: 0.19, whPure: 0.5, whine: 1.6, rpmRef: 6200, race: 0.5, rough: 0.1 } },
      } },
    cyber: { btn: 'CYBERTRUCK', sub: 'The stainless-steel electric pickup · Long Range RWD, All-Wheel Drive and the 845 hp Cyberbeast · 35 in all-terrains, four-wheel steering', paint: 'Stainless', tc: 1, cam: [1.25, 1.3],
      hint: 'Cybertruck (All-Wheel Drive): shift up (E) for DRIVE - two motors, ~600 hp, 0-60 in 4.1 s, governed to 112 mph. The rear wheels steer too: against the fronts at low speed (a tight turn for 5.7 m of truck), a touch with them at speed. Stability control is on (Sport).',
      info: 'The stainless-steel wedge: flat unpainted panels, a light bar across the nose and the tail, frameless glass, the vault over the bed · two motors, ~600 hp, all-wheel drive · adaptive air suspension, four-wheel steering (the rears up to 10 degrees), steer-by-wire · 35 in all-terrains on 20 in wheels · 5.68 m long, 3.81 m wheelbase · 3,000 kg (6,603 lb) · 0-60 4.1 s, 112 mph',
      trans: 'Electric · single speed · AWD', tyres: '35 in all-terrain',
      snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.07, whPure: 1, whine: 2.2, rpmRef: 12000, open: 0, fmul: 1, deep: 0, loud: 0, race: 0 },
      optKey: 'cyberEng', optLabel: 'Version', options: [
        ['rwd', 'Long Range RWD', 'One motor at the back · ~350 hp · 0-60 ~6.2 s · 112 mph · 2,850 kg'],
        ['awd', 'All-Wheel Drive', 'Two motors · ~600 hp · 0-60 4.1 s · 112 mph · 3,000 kg'],
        ['beast', 'Cyberbeast', 'Three motors · 845 hp · 0-60 2.6 s · an 11.2 s quarter mile · 130 mph · 3,104 kg'],
      ],
      eng: {
        rwd: { hint: 'Cybertruck (Long Range RWD): shift up (E) for DRIVE - one motor at the back, ~350 hp, 0-60 in ~6.2 s, 112 mph. The rear wheels steer too. Stability control is on (Sport).',
          info: 'The stainless-steel wedge with one motor, driving the back wheels · ~350 hp · adaptive air suspension, four-wheel steering, steer-by-wire · 35 in all-terrains on 20 in wheels · 2,850 kg · 0-60 ~6.2 s, 112 mph',
          trans: 'Electric · single speed · RWD' },
        beast: { hint: 'Cyberbeast: shift up (E) for DRIVE - three motors, 845 hp, 0-60 in 2.6 s and 130 mph, in a 3.1 t stainless pickup. The rear wheels steer too. Stability control is on (Sport).',
          info: 'The stainless-steel wedge with three motors - one at the front, two at the back - 845 hp, all-wheel drive · adaptive air suspension, four-wheel steering, steer-by-wire · 35 in all-terrains on 20 in wheels · 3,104 kg (6,843 lb) · 0-60 2.6 s, an 11.2 s quarter mile, 130 mph',
          trans: 'Electric · single speed · tri-motor AWD', snd: { nEng: 1, cyl: 8, ev: 1, whK: 0.08, whPure: 1, whine: 2.7, rpmRef: 14000, open: 0, fmul: 1, deep: 0, loud: 0, race: 0 } },
      } },
    atv: { btn: 'ATV', sub: 'A sport quad · a 200 cc on a CVT, a 450 race quad or a 140 hp turbo drag quad · knobbies (or sand paddles) · you ride it: lean into the turns', paint: 'Crimson', tc: 1, cam: [0.62, 0.78],
      hint: 'ATV (200 Sport): shift up (E) for DRIVE - an air-cooled 200 cc single on a CVT: twist and go, ~48 mph. A solid rear axle and a high seat: it pushes wide in a turn and the inside rear lifts - the rider hangs off the inside to keep it down, but turn hard enough on pavement and it will go over. Tyres (Esc → Drive): sand paddles for the dunes.',
      info: 'A full-size sport quad: a steel frame under red plastics, a tube front bumper, a rear rack · 200 cc air-cooled 4-stroke single, ~12 hp · CVT automatic with reverse, a chain to a solid rear axle · double A-arms and a swingarm on red coil-overs · 21x7-10 / 22x10-10 knobbies on 10 in alloys · ~195 kg + the rider · 0-30 ~7 s, ~48 mph',
      trans: 'CVT automatic', tyres: 'ATV knobbies',
      snd: { nEng: 1, cyl: 1, fmul: 1.45, deep: 0, loud: 0.3, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 8000, race: 0.35, rough: 0.35 },
      optKey: 'atvEng', optLabel: 'Version', options: [
        ['sport', '200 Sport', 'Air-cooled 200 cc single, ~12 hp · CVT · front bumper and rear rack · 0-30 ~7 s · ~48 mph'],
        ['race', '450 race quad', 'A 449 cc race single, ~47 hp · 5-speed · long-travel race suspension, a wider stance · 0-60 ~6 s · ~77 mph'],
        // (5th: it starts on STREET traction control)
        ['turbo', 'Turbo drag quad', 'The 450 turbocharged on race fuel, ~140 hp · a stretched swingarm, a wheelie bar, drag slicks · 0-60 ~3.6 s · ~117 mph', undefined, 0],
      ],
      eng: {
        race: { hint: 'ATV (450 race quad): shift up (E) for DRIVE - a 449 cc race single, ~47 hp through a 5-speed (it shifts for you, or E / Q): 0-60 in ~6 s, ~77 mph. A wider stance and long-travel race suspension - it corners flat, and it will wheelie in first.',
          info: 'A 450 race quad: a 449 cc DOHC single, ~47 hp at 9,000, 30 lb-ft · 5-speed, a manual clutch worked for you, a chain to a solid axle · long-travel A-arms and a swingarm on piggyback shocks (~9 / 10 in), a wider stance, nerf bars · 21x7-10 / 20x11-9 knobbies · ~185 kg + the rider · 0-60 ~6 s, ~77 mph',
          trans: '5-speed', tyres: 'ATV knobbies',
          snd: { nEng: 1, cyl: 1, fmul: 1.25, deep: 0.1, loud: 0.65, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 10500, race: 0.9, rough: 0.3 } },
        turbo: { hint: 'ATV (turbo drag quad): shift up (E) for DRIVE - the 450 turbocharged on race fuel, ~140 hp, a swingarm stretched 10 in with a wheelie bar, drag slicks: 0-60 in ~3.6 s, ~117 mph. Hold SPACE to stage it on the boost. The slicks are hopeless in the dirt - fit the sand paddles (Esc → Drive) for that. Traction control starts on Street.',
          info: 'A turbo drag quad: the 450 single with a turbo on race fuel, ~140 hp at 9,500, 78 lb-ft · 5-speed with an air shifter · the swingarm stretched 10 in, a wheelie bar, lowered · 21x7-10 front, 21x11-8 drag slicks · ~205 kg + the rider · 0-60 ~3.6 s, 1/4 mile ~11.5 s, ~117 mph',
          trans: '5-speed · air shifter', tyres: 'Knobby fronts · drag slick rears',
          snd: { nEng: 1, cyl: 1, fmul: 1.2, deep: 0.15, loud: 0.8, open: 1, whK: 0.19, whPure: 1, whine: 1.3, rpmRef: 10500, race: 1, rough: 0.3, turbo: 1, surge: 1 } },
      } },
    diesel: { btn: 'DIESEL DUALLY', sub: 'A 2nd-gen one-ton Quad Cab dually · 5.9 inline-six turbo diesel · stock, a built street truck or the pulling truck - black smoke out of the stack', paint: 'Patriot Blue', tc: 0, cam: [1.25, 1.3], road: true,
      hint: 'Diesel Dually (stock 5.9): shift up (E) for DRIVE - the inline-six turbo diesel, 235 hp and 460 lb-ft through a 4-speed automatic, ~3,300 kg on duals. It pulls from nothing and runs out of breath at 3,000; floor it from low revs and it puffs smoke until the turbo spools. 0-60 ~13 s, governed at 100 mph.',
      info: 'A 2nd-gen (1998-2002) one-ton Quad Cab long bed 4x4 dually: the big-rig hood, the crosshair grille, cab lights, towing mirrors, an 8 ft box between the dually fenders · 5.9 L inline-six turbo diesel (24-valve), 235 hp at 2,700, 460 lb-ft at 1,600 · 4-speed automatic, 4.10 axles, 2-Hi · LT235/85R16s, duals at the back, on polished 16 in wheels · 6.34 m long, 3.92 m wheelbase · ~3,300 kg · 0-60 ~13 s, 100 mph governed',
      trans: '4-speed auto · 2WD', tyres: 'LT highway · duals', soot: 0.35,
      snd: { nEng: 1, cyl: 6, fmul: 0.82, deep: 0.45, loud: 0.45, open: 0.2, whK: 0.19, whPure: 1, whine: 0.9, rpmRef: 3200, race: 0.15, rough: 0.2, turbo: 1, diesel: 1 },
      optKey: 'dieselEng', optLabel: 'Version', options: [
        ['stock', 'Stock 5.9', 'The 5.9 inline-six turbo diesel, 235 hp / 460 lb-ft · 4-speed auto · 0-60 ~13 s · 100 mph governed'],
        ['built', 'Built street truck', 'Compound turbos, injectors and a tune, ~650 hp / 1,250 lb-ft · built transmission · twin stacks in the bed, black smoke · 0-60 ~6.8 s · ~135 mph', undefined, 1],
        ['pull', 'Pulling truck', 'Triple turbos, ~1,600 hp / 2,400 lb-ft · a stack through the hood · 4WD · 0-60 ~4.4 s · rolls coal', undefined, 1],
      ],
      eng: {
        built: { hint: 'Diesel Dually (built street truck): shift up (E) for DRIVE - compound turbos, injectors and a tune, ~650 hp and 1,250 lb-ft, rear drive on duals: it rolls black smoke out of the twin bed stacks every time you floor it, and spins the duals if you let it. 0-60 ~6.8 s, ~135 mph. Stability control starts on Sport.',
          info: 'The dually built for the street: the 5.9 with compound turbos (~60 psi), big injectors and a tune - ~650 hp at 3,600, 1,250 lb-ft at 2,400 · a built 4-speed automatic and converter, 3.54 axles, 2WD · twin 6 in stacks in the bed · ~3,270 kg · 0-60 ~6.8 s, ~135 mph',
          trans: '4-speed auto (built) · 2WD', soot: 1.0,
          snd: { nEng: 1, cyl: 6, fmul: 0.78, deep: 0.6, loud: 0.75, open: 0.8, whK: 0.19, whPure: 1, whine: 1.5, rpmRef: 3800, race: 0.45, rough: 0.25, turbo: 1, diesel: 0.85, surge: 1 } },
        pull: { hint: 'Diesel Dually (pulling truck): shift up (E) for DRIVE - a billet-head 5.9 on triple turbos, ~1,600 hp and 2,400 lb-ft to 5,000 rpm, locked in 4WD - and a stack through the hood that rolls coal. 0-60 ~4.4 s, ~160 mph. Try the Dirt Drag strip. Stability control starts on Sport.',
          info: 'A street-diesel-class pulling truck: a billet-head 5.9 on triple turbos (~110 psi), ~1,600 hp at 4,200, 2,400 lb-ft at 3,400, to 5,000 rpm · a built 4-speed automatic, locked 4WD · a 5 in stack straight up through the (primer-grey) hood, the hitch · ~3,350 kg · 0-60 ~4.4 s, ~160 mph',
          trans: '4-speed auto (built) · 4WD', soot: 1.7,
          snd: { nEng: 1, cyl: 6, fmul: 0.74, deep: 0.8, loud: 1, open: 1, whK: 0.19, whPure: 1, whine: 2.1, rpmRef: 5000, race: 0.75, rough: 0.3, turbo: 1, diesel: 0.7, surge: 1 } },
      } },
    prius: { btn: 'TOYOTA PRIUS', sub: 'The 2nd-gen (2004-09) hybrid liftback · a 1.5 L Atkinson four and an electric motor, 110 hp together · power-split eCVT · front-wheel drive', paint: 'Magnetic Gray', tc: 0, cam: [1.0, 1.02], road: true,
      hint: 'Toyota Prius: shift up (E) for DRIVE - the electric motor pulls it away on its own torque while the 1.5 L four starts up, then the engine drones at ~5,000 rpm floored as the speed comes up under it (no gears: the power-split drive is a CVT). 0-60 in ~10 s, governed at 104 mph. Low-rolling-resistance tyres: brake early, it lets go gently.',
      info: 'Toyota Prius (XW20, 2004-09): the five-door liftback with the arched roof and the cut-off tail · 1.5 L 1NZ-FXE Atkinson-cycle four, 76 hp at 5,000, 82 lb-ft at 4,200, and a 50 kW (67 hp), 400 Nm motor on the final drive - 110 hp combined, the battery giving ~21 kW · power-split hybrid drive (an eCVT), front-wheel drive · 185/65R15 low-rolling-resistance tyres on 15 in alloys · Cd 0.26 · 4.45 m long, 2.70 m wheelbase · ~1,390 kg · 0-60 ~10 s, 104 mph governed',
      trans: 'Power-split hybrid (eCVT) · FWD', tyres: '185/65R15 low-rolling-resistance',
      snd: { nEng: 1, cyl: 4, fmul: 1.12, deep: 0, loud: 0.15, open: 0, whK: 0.6, whPure: 1, whine: 0.5, rpmRef: 5200, race: 0, rough: 0.12 } },
    sixseven: { btn: '67', sub: 'A custom supercar shaped like the numerals 6 and 7 · a 6.7 L twin-turbo V8, 670 hp and 670 lb-ft · 7-speed dual-clutch · rear drive · a big wing', paint: 'Liquid Silver', tc: 0, cam: [1.05, 1.15], road: true,
      hint: '67: shift up (E) for DRIVE - a 6.7 L twin-turbo V8 behind the seats, 670 hp and 670 lb-ft through a 7-speed dual-clutch to the back wheels: 0-60 in ~3 s. Launch control: hold SPACE, floor it, let go. The numerals are no shape for the wind - it tops out near 185 mph. Stability control is on (Street).',
      info: 'A custom supercar whose body is the numerals 6 and 7, side on - the 6 over the front wheels, its counter a black oval in the flank, its hook curling back into the roof; the 7\'s bar the rest of the roof, its stroke slanting down ahead of the rear wheels - satin silver over a carbon chassis, a smoked canopy between the numerals, a wing on two pairs of stalks · 6.7 L twin-turbo V8, 670 hp from 5,250 to 6,400, 670 lb-ft from 3,000 · 7-speed dual-clutch, rear drive · 20 in black ten-spokes round red calipers · ~1,670 kg · 0-60 ~3.1 s, ~185 mph',
      trans: '7-speed dual-clutch · RWD', tyres: '275/40ZR20 performance',
      snd: { nEng: 1, cyl: 8, fmul: 0.95, deep: 0.35, loud: 0.85, open: 0.6, whK: 0.19, whPure: 1, whine: 1.3, rpmRef: 7200, race: 0.6, rough: 0.1, turbo: 1, surge: 1 } },
    silverbullet: { btn: 'SILVER BULLET', sub: 'Sunbeam\'s 1930 land-speed car · a 24 L V12 with two superchargers, ~960 hp · built to beat 231 mph', paint: 'Racing Silver', tc: 2, map: 'straight', cam: [1.35, 0.95],
      hint: 'Silver Bullet: shift up (E) for DRIVE - a 24 L V12 with two superchargers, ~960 hp, three gears, on 37 in tyres no wider than a hand. Built in 1930 to beat 231 mph; its blowers never ran right and it managed 186 at Daytona - here the engine runs as designed, ~230 mph. Give it room, keep the wheel still (it steers like a ship) and brake early.',
      info: 'Sunbeam\'s 1930 land-speed car for Kaye Don: a long silver cigar with a pointed nose, the wheels out in the wind behind aluminium discs, a fairing down each side between them, the cockpit far back, two tall fins on the tail · 24 L V12 with two superchargers, ~960 hp at 3,300 rpm, ~1,700 lb-ft · 3-speed gearbox to the rear wheels · Dunlop 37 x 7 tyres · ~8.5 m long, ~2.4 t · built to beat 231 mph; at Daytona in March 1930 it managed 186',
      trans: '3-speed · multi-plate clutch', tyres: 'Dunlop 37 x 7',
      snd: { nEng: 1, cyl: 12, fmul: 0.6, deep: 0.85, loud: 1, open: 1, whK: 0.9, whPure: 1, whine: 0.9, rpmRef: 3500, race: 0.8, rough: 0.25 } },
    hotrod: { btn: 'HOT ROD', sub: 'A chopped 1934 Ford five-window coupe · a blown 540 big-block out in the open, zoomie headers · ~900 hp · 3-speed automatic · fat street tyres', paint: 'Crimson', tc: 0, cam: [1.0, 1.0],
      hint: 'Hot Rod: shift up (E) for DRIVE - a 540 ci big-block under an 8-71 blower, ~900 hp through a 3-speed automatic and a 3,500 rpm converter, straight out of the zoomies. It lights the rear tyres up in any gear: squeeze it on, or let traction control (Street) do it for you. Hold SPACE, floor it and let go to launch off the converter.',
      info: 'A chopped 1934 Ford five-window coupe, fenderless up front: a 540 ci big-block Chevy under a polished 8-71 blower and two four-barrels, ~900 hp at 6,200, 820 lb-ft at 4,500 on pump gas, zoomie headers (a pipe from every port, swept down and back) · TH400 3-speed automatic behind a 3,500 rpm converter, a 9-inch rear on 3.89s · a dropped front axle on a transverse leaf · polished wheels, 225/70R15 fronts, 33x16.5-15 street tyres at the back · ~1,330 kg · 0-60 ~3.9 s, ~11.2 s quarter mile, ~150 mph',
      trans: '3-speed auto (TH400)', tyres: '33x16.5-15 street · 225/70R15 fronts',
      snd: { nEng: 1, cyl: 8, fmul: 0.92, deep: 0.55, loud: 1, open: 1, whK: 0.19, whPure: 0, whine: 1.7, rpmRef: 6800, race: 0.9, rough: 0.3 } },
    chevelle: { btn: 'CHEVELLE SS', sub: 'A 1970 Chevelle SS 454 sport coupe · the LS6 454, 450 hp, 500 lb-ft · Turbo 400 3-speed · black with red stripes', paint: 'Pitch Black', tc: 0, cam: [1.08, 1.0], road: true,
      hint: 'Chevelle SS: shift up (E) for DRIVE - the LS6 454, 450 hp and 500 lb-ft through a Turbo Hydra-Matic 400 and a posi rear on 3.77s: 0-60 in ~5.5 s, a ~13.7 s quarter mile. No ABS, no stability control in 1970 - traction control is the game\'s (Street), and it\'ll go up in smoke without it.',
      info: '1970 Chevrolet Chevelle SS 454 sport coupe: the long hood with the cowl-induction bulge, the full-width grille with its quad headlamps and the bar across, a chrome bumper wrapping the corners with the parking lamps in it, the semi-fastback roof with its sail panels and black vinyl top, the rear wheels under the coke-bottle hips, tail lamps in the rear bumper, red stripes over the hood and the deck, a red interior · LS6 454 V8, 450 hp at 5,600, 500 lb-ft at 3,600 · TH400 3-speed automatic, 12-bolt posi on 3.77s · 17 in five-spokes on redline radials · 5.01 m long, 2.85 m wheelbase · ~1,830 kg · 0-60 ~5.4 s, ~13.8 s quarter mile, ~130 mph',
      trans: '3-speed auto (TH400)', tyres: 'Redline radials',
      snd: { nEng: 1, cyl: 8, fmul: 0.9, deep: 0.5, loud: 0.75, open: 0.5, whK: 0.19, whPure: 0, whine: 0, rpmRef: 6000, race: 0.35, rough: 0.15 } },
    superbird: { btn: 'SUPERBIRD', sub: 'The 1970 Plymouth Superbird · the nose cone and the wing NASCAR banned · a 440 four-barrel, the 440 Six Barrel or the 426 Hemi · TorqueFlite 3-speed', paint: 'Vitamin C', tc: 0, cam: [1.12, 1.05], road: true,
      hint: 'Superbird: shift up (E) for DRIVE - the 440 Super Commando, 375 hp and 480 lb-ft through a TorqueFlite 3-speed and a Sure-Grip on 3.23s: 0-60 in ~6 s, a ~14.7 s quarter. Bias-belted tyres and no ABS - it was built for Talladega, not for corners. The nose and the wing hold it down the faster it goes. Lights (L) swing the headlamp doors up.',
      info: '1970 Plymouth Superbird: a Road Runner with the aero package that won Petty and the others 8 races in 1970 - the pointed nose cone 19 in out ahead of the fenders with the headlamps hidden behind flip-up doors, the reverse scoops on the front fenders, the flush back window under a black vinyl top, the wing up on two swept uprights over the deck, PLYMOUTH in script down the quarters and the Road Runner on the uprights · 440 Super Commando V8, 375 hp at 4,600, 480 lb-ft at 3,200 · 727 TorqueFlite 3-speed, 8 3/4 Sure-Grip on 3.23s · F70-14 Polyglas on Rallye wheels · 5.62 m long, 2.95 m wheelbase · ~1,800 kg · 0-60 ~6.3 s, ~14.7 s quarter mile, ~125 mph',
      trans: '3-speed auto (TorqueFlite)', tyres: 'F70-14 Polyglas GT',
      snd: { nEng: 1, cyl: 8, fmul: 0.9, deep: 0.5, loud: 0.75, open: 0.5, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5600, race: 0.35, rough: 0.15 },
      optKey: 'sbirdEng', optLabel: 'Engine', options: [
        ['c440', '440 Super Commando', 'The 440 four-barrel · 375 hp · 480 lb-ft · 3.23s · 0-60 ~6.3 s · ~125 mph'],
        ['six', '440 Six Barrel', 'Three two-barrels on the 440 · 390 hp · 490 lb-ft · 3.55s · 0-60 ~6.3 s · ~14.6 s quarter'],
        ['hemi', '426 Hemi', 'The Street Hemi, two four-barrels · 425 hp · 490 lb-ft · 3.55s · ~14.5 s quarter at 107 mph · ~130 mph'],
      ],
      eng: {
        six: { hint: 'Superbird, 440 Six Barrel: shift up (E) for DRIVE - three Holley two-barrels on the 440, 390 hp and 490 lb-ft, the TorqueFlite and 3.55s: it pulls harder off the line and runs out of revs sooner. The outer two carbs open when you floor it.',
          info: 'The Superbird with the 440 Six Barrel: three Holley two-barrels on an Edelbrock aluminium manifold, 390 hp at 4,700, 490 lb-ft at 3,200 · 727 TorqueFlite, Sure-Grip on 3.55s · ~1,800 kg · 0-60 ~6.3 s, ~14.6 s quarter mile',
          snd: { nEng: 1, cyl: 8, fmul: 0.9, deep: 0.5, loud: 0.8, open: 0.55, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5900, race: 0.4, rough: 0.15 } },
        hemi: { hint: 'Superbird, 426 Hemi: shift up (E) for DRIVE - the Street Hemi, two Carter four-barrels, 425 hp at 5,000 and 490 lb-ft, revving to 6,500 through the TorqueFlite and 3.55s: a ~14.5 s quarter at 107 mph on bias-belted tyres. 135 of them were built.',
          info: 'The Superbird with the 426 Street Hemi: hemispherical heads, two Carter AFB four-barrels, 425 hp at 5,000, 490 lb-ft at 4,000 · 727 TorqueFlite with a 2,300 rpm converter, Sure-Grip on 3.55s · ~1,830 kg · 0-60 ~6.3 s, ~14.5 s quarter mile at 107 mph, ~130 mph',
          snd: { nEng: 1, cyl: 8, fmul: 0.88, deep: 0.55, loud: 0.9, open: 0.7, whK: 0.19, whPure: 0, whine: 0, rpmRef: 6400, race: 0.55, rough: 0.2 } },
      } },
    rc: { btn: 'RC TRUCK', sub: 'A 1/10 4WD monster-truck RC car · brushed 2S, brushless 3S or a 6S speed-run build · drive it on the real roads - or from the little driver\'s seat (C)', paint: 'Bay Blue', tc: 1, cam: [0.17, 0.18], scale: 0.12, noPkg: true,
      hint: 'RC truck (Brushless 3S): shift up (E) for DRIVE - a 3,200 kV brushless on a 3S LiPo, 4WD: 0-30 in ~1.7 s, ~45 mph, at the size of a shoebox. It turns like a kart and rolls over like an RC truck: its gyro and the stability control are on (Sport, T for Off) - the steering is scaled to the speed, like a transmitter\'s dual rate. Slicks or knobbies: Esc → Drive → Tyres. Press C for the view from the cab.',
      info: 'A 1/10-scale 4WD monster-truck basher like the Sandstorm: a blue polycarbonate pickup shell with a black hood, the white flash and SAND STORM on the quarters, tinted glass, a big rear wing; a plastic tub chassis with front and rear bumpers (LED lamps up front), A-arms, dogbones and four oil-filled coil-overs that work with the wheels; 150 mm chevron tyres on blue beadlock wheels; gear diffs front and rear on a centre slipper · a 3660 3,200 kV brushless on 3S (11.1 V), ~0.9 kW, 12.5:1 overall · 0.47 m long, 0.37 m wide · 2.6 kg · 0-30 ~1.7 s, ~45 mph · a tiny cab inside with two seats, the dash, a wheel and a 1/12 driver',
      trans: 'Single speed · 4WD', tyres: '150 mm RC knobbies',
      tyreOpts: [['rcKnob', 'Knobbies', '150 mm RC knobbies'], ['rcSlick', 'Belted slicks', '150 mm belted slicks']],
      tyreNote: 'Knobbies: tall chevron blocks - they dig into dirt, grass and sand and grip pavement about like a road tyre · Belted slicks: smooth, soft and belted for speed runs - a lot more grip on pavement, they skate on anything loose',
      snd: { nEng: 1, cyl: 1, ev: 1, rc: 1, whK: 0.0333, whPure: 1, whine: 1, rpmRef: 35500, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 },
      optKey: 'rcEng', optLabel: 'Power', options: [
        ['brushed', 'Brushed 2S', 'The ready-to-run motor: a 550 can on 2S, ~180 W · 0-20 ~1.2 s · ~27 mph'],
        ['bl3s', 'Brushless 3S', 'A 3,200 kV brushless on 3S, ~0.9 kW · 0-30 ~1.7 s · ~45 mph'],
        ['bl6s', 'Brushless 6S', 'A 4074 2,050 kV on 6S, ~2.5 kW, speed-run gearing · 0-40 ~2.4 s · ~62 mph'],
      ],
      eng: {
        brushed: { hint: 'RC truck (Brushed 2S): shift up (E) for DRIVE - the ready-to-run brushed 550 motor on a 2S pack, ~180 W through the same 4WD: ~27 mph, gentle enough to learn it on. The gyro and the stability control are on (Sport, T for Off). C for the view from the cab.',
          info: 'The RC truck with its stock brushed motor: a 550-size can on 2S (7.4 V), ~20,000 rpm, ~180 W, 12:1 overall · 2.35 kg · 0-20 ~1.2 s, ~27 mph',
          trans: 'Single speed · 4WD', snd: { nEng: 1, cyl: 1, ev: 1, rc: 2, whK: 0.05, whPure: 1, whine: 1, rpmRef: 20000, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 } },
        bl6s: { hint: 'RC truck (Brushless 6S): shift up (E) for DRIVE - a 4074 2,050 kV brushless on 6S, ~2.5 kW in a 3.4 kg truck: ~62 mph. Feed the throttle in - its gyro catches the tail, but with the stability control off (T) the gyro is off too: it spins the wheels at any speed and swaps ends in a turn. C for the view from the cab.',
          info: 'The RC truck built for speed runs: a 4074 2,050 kV brushless on 6S (22.2 V), ~45,500 rpm, ~2.5 kW, 11.5:1 overall, stiffer springs · 3.4 kg · 0-40 ~2.4 s, ~62 mph',
          trans: 'Single speed · 4WD', snd: { nEng: 1, cyl: 1, ev: 1, rc: 1, whK: 0.0333, whPure: 1, whine: 1.15, rpmRef: 45500, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 } },
      } },
    coach: { btn: 'TOUR COACH', sub: 'A 45 ft three-axle motorcoach · 12 L turbo diesel, Allison 6-speed · stock and governed, an X15 swap with a tune, or a 1,500 hp race coach', paint: 'Alpine White', tc: 0, cam: [2.2, 1.9], road: true, noPkg: true, soot: 0.35,
      hint: 'Tour coach: shift up (E) for DRIVE - 18 t and 410 hp: 0-60 in ~36 s, governed at 75 mph. It takes the whole road to turn (a 7.7 m wheelbase - swing wide), and the air brakes need room. The tag axle behind the drive axle scrubs in tight turns.',
      info: 'A 45 ft motorcoach of the MCI J4500 kind: 13.84 m long, 2.59 m wide, 3.5 m tall · the white body with the black glass band, the front cap over the big two-piece windshield with the fleet number, rabbit-ear mirrors, the entry door, baggage bays, the D&F Travel brush-stroke swoosh · a steer axle, the drive axle on duals and a tag axle, all on polished aluminium wheels · 12 L inline-six turbo diesel at the back, 410 hp, 1,450 lb-ft · Allison 6-speed automatic, 3.58 gears · air suspension, air brakes with ABS · ~18 t loaded · 0-60 ~36 s, governed at 75 mph',
      trans: '6-speed auto (Allison)', tyres: '315/80R22.5',
      snd: { nEng: 1, cyl: 6, fmul: 0.7, deep: 0.5, loud: 0.45, open: 0.2, whK: 0.19, whPure: 1, whine: 1.0, rpmRef: 2100, race: 0.1, rough: 0.2, turbo: 1, diesel: 0.75 },
      optKey: 'coachEng', optLabel: 'Engine', options: [
        ['stock', 'Stock 410 hp', 'The 12 L turbo diesel, 410 hp, 1,450 lb-ft · 6-speed auto · 0-60 ~36 s · governed at 75 mph'],
        ['tuned', 'X15 swap + tune', 'A 15 L swapped in and turned up, 605 hp, 2,050 lb-ft · the governor off · 0-60 ~27 s · ~95 mph'],
        ['race', 'Race coach', 'A built 15 L on compound turbos, 1,500 hp, 3,900 lb-ft · 0-60 ~13 s · ~135 mph - in an 18 t coach'],
      ],
      eng: {
        tuned: { hint: 'Tour coach, X15 swap: shift up (E) for DRIVE - a 15 L in the back turned up to 605 hp and 2,050 lb-ft, the governor off: 0-60 in ~27 s and ~95 mph. Still 18 t: brake early, turn wide.',
          info: 'The coach with a 15 L inline-six swapped in and tuned - 605 hp, 2,050 lb-ft - taller 3.36 gears and the speed governor off · ~18.3 t · 0-60 ~27 s, ~95 mph', soot: 0.8,
          snd: { nEng: 1, cyl: 6, fmul: 0.68, deep: 0.6, loud: 0.65, open: 0.35, whK: 0.19, whPure: 1, whine: 1.3, rpmRef: 2100, race: 0.25, rough: 0.2, turbo: 1, diesel: 0.65 } },
        race: { hint: 'Race coach: shift up (E) for DRIVE - a built 15 L on compound turbos, 1,500 hp and 3,900 lb-ft through the Allison: 0-60 in ~13 s, ~135 mph, in 18 t of coach. It rolls coal off the line. Leave a LOT of room to stop.',
          info: 'The coach built to race: a 15 L inline-six on compound turbos (~80 psi), 1,500 hp, 3,900 lb-ft, revving to 2,800 · a built Allison, 3.08 gears, a locked rear diff, bigger brakes · ~18.5 t · 0-60 ~13 s, 1/4 mile ~20 s at 81 mph, ~135 mph', soot: 1.4,
          snd: { nEng: 1, cyl: 6, fmul: 0.66, deep: 0.75, loud: 0.95, open: 0.6, whK: 0.19, whPure: 1, whine: 1.9, rpmRef: 2800, race: 0.7, rough: 0.25, turbo: 1, diesel: 0.55, surge: 1 } },
      } },
    busderby: { btn: 'DERBY BUS', sub: 'A school bus stripped for the demolition derby · graffiti, the glass out, a cage · the DT466 diesel, a 454 big-block or a blown 572 · the cowcatcher on or off · its own arena', paint: 'Bus Yellow', tc: 3, cam: [1.75, 1.6], map: 'arena', noPkg: true, soot: 0.5,
      toggle: { key: 'busCow', label: 'Cowcatcher', on: 'Bolted on', off: 'Off', note: 'A welded V-plow of bars off the front bumper: 350 kg on the nose, and it reaches 0.8 m further - it takes the hits and shoves the junk aside' },
      hint: 'Derby bus: shift up (E) for DRIVE - the stock DT466 diesel, 210 hp in 7.8 t: 0-60 in ~40 s, ~68 mph. Traction control is off - it\'s a derby. Hit things with the cowcatcher (Esc → Drive to take it off). It brought you to the arena: the junk cars are there to be crushed.',
      info: 'A conventional school bus (an International 3800 kind: the hood out front, a 5.6 m wheelbase) stripped for the demolition derby: every pane knocked out, a mesh over the windshield, most of the seats pulled, a roll cage round the driver, the crew\'s graffiti sprayed all over the faded yellow - GFP 95, Dave, Lawn, Nick 69 - orange steel wheels, duals at the back · the cowcatcher: a welded V of steel bars off the bumper · the DT466 diesel, 210 hp, 520 lb-ft · Allison 5-speed, 5.29 gears · ~7.8 t · 0-60 ~40 s, ~68 mph',
      trans: '5-speed auto (Allison)', tyres: '11R22.5 recaps',
      snd: { nEng: 1, cyl: 6, fmul: 0.78, deep: 0.35, loud: 0.6, open: 0.7, whK: 0.19, whPure: 1, whine: 0.8, rpmRef: 2800, race: 0.3, rough: 0.3, turbo: 1, diesel: 0.9 },
      optKey: 'derbyEng', optLabel: 'Engine', options: [
        ['dt466', 'DT466 diesel', 'The stock 7.6 L inline-six diesel, 210 hp, 520 lb-ft · 5-speed auto · 0-60 ~40 s · ~68 mph'],
        ['bigblock', '454 big-block', 'A junkyard 454 big-block gas V8, 390 hp, 500 lb-ft, open headers · 0-60 ~20 s · ~89 mph'],
        ['blown', 'Blown 572', 'A 572 big-block under a roots blower, 900 hp, 850 lb-ft · 0-60 ~11 s · ~114 mph - it smokes the duals'],
      ],
      eng: {
        bigblock: { hint: 'Derby bus, 454 big-block: shift up (E) for DRIVE - a junkyard 454 gas V8 on open headers, 390 hp: 0-60 in ~20 s, ~89 mph. Traction control is off. The cowcatcher comes off in Esc → Drive.',
          info: 'The derby bus with a 454 big-block gas V8 swapped in: 390 hp, 500 lb-ft, open headers out the side · the 5-speed on 4.33s · ~7.55 t · 0-60 ~20 s, ~89 mph', soot: 0,
          snd: { nEng: 1, cyl: 8, fmul: 0.86, deep: 0.5, loud: 0.85, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 5200, race: 0.75, rough: 0.35 } },
        blown: { hint: 'Derby bus, blown 572: shift up (E) for DRIVE - a 572 big-block under a roots blower, 900 hp: 0-60 in ~11 s, ~114 mph, and it lights up the duals in the first three gears. Traction control is off.',
          info: 'The derby bus with a blown 572 big-block: a roots blower, 900 hp, 850 lb-ft · a locked rear, bigger brakes, 4.10s · ~7.6 t · 0-60 ~11 s, 1/4 mile ~17.8 s at 81 mph, ~114 mph', soot: 0,
          snd: { nEng: 1, cyl: 8, fmul: 0.84, deep: 0.6, loud: 1, open: 1, whK: 0.19, whPure: 0, whine: 1.6, rpmRef: 6000, race: 1, rough: 0.35 } },
      } },
    landspeeder: { btn: 'LANDSPEEDER', sub: 'Luke\'s X-34 · it floats half a metre up on its repulsors, no wheels · three turbines push it · ~155 mph', paint: 'Landspeeder Brown', tc: 1, cam: [0.95, 0.95], noPkg: true, road: true,
      hint: 'Landspeeder: shift up (E) for DRIVE and open the throttle - the three turbines on the back spool up in a second and push it along on its repulsors, half a metre off the ground: no wheels, so it carves and slides the same over tarmac, dirt, sand and water. ~0.5 g off the line, ~155 mph flat out. The repulsors brake it (S) and back it up (R). It floats over the bumps - and drops off a crest like anything else.',
      info: 'The X-34 landspeeder, Luke\'s: a long low body with a blunt rounded nose and a flat deck, a long chrome grille down each flank in its recess, two vents behind it, a slot in the nose; a clear bubble far back over the two seats; three turbines on the back - two low on stalks off the corners (the left one\'s cowling long gone, its bare engine showing), one up on a swept pylon on the centre line - their intakes forward round red lips, the fans inside turning with the spool; the pilot on the right. Dusty tan-brown under a dark red stripe, sand-scoured to grey primer and to bare metal round the nose, a grille across the nose · repulsorlift: ~0.5 m off the ground, the same hold on any surface and over water · three turbines, ~2,600 N (585 lbf) between them · 2.95 m long (3.5 m over the turbines), 1.7 m wide · ~470 kg with the pilot · 0-60 ~6 s, ~155 mph',
      trans: 'Repulsorlift · turbine thrust', tyres: 'Repulsor field',
      snd: { jet: 1, nEng: 1, cyl: 8, ev: 0, whK: 0.3, whPure: 1, whine: 1.5, rpmRef: 10000, open: 1, fmul: 1.6, deep: 0, loud: 0.3, race: 0 } },
    firetruck: { btn: 'JET FIRE TRUCK', sub: 'ABLAZE - ALL STAR FIRE DEPT\'s monster fire truck · a J34 turbojet in the box, ~4,900 lbf with the afterburner and a flame out of the back · 66 in flotation tyres, four-wheel steer · ~135 mph', paint: 'Fire Engine Red', tc: 3, cam: [1.5, 1.85], map: 'arena',
      hint: 'Jet fire truck: shift up (E) for DRIVE and open the throttle - the J34 in the box spools up in a couple of seconds and shoves; floor it and the afterburner lights, a long flame out of the tailpipe. Nothing drives the wheels: it rolls on them and brakes and steers with them - G cycles the rear steering (AUTO / CRAB / MANUAL with , and .). 0-60 ~11 s, ~135 mph, so brake early: it\'s 13,000 lb. R backs it up on a hydraulic motor.',
      info: 'ABLAZE, the All Star Monster Truck Tour\'s jet-powered, flame-throwing monster fire truck: a cab-forward fire engine\'s cab - the big two-pane windshield, ALLSTAR on the doors, a gold Maltese cross, the light bar - an open crew step, and the tall red box with its ribbed hose-bed band, the ABLAZE flame logo and ALL STAR FIRE DEPT. in gold leaf, a red ladder rack and a polished hood at the back; a Westinghouse J34 turbojet with an afterburner lies in the box, its grey tailpipe a metre out of the back · ~3,400 lbf dry, ~4,900 lbf lit · the monster truck\'s chassis on a 3.3 m wheelbase: 4-link, nitrogen shocks with yellow coils, planetary axles, four-wheel steer, 66 in flotation tyres on plain grey steel wheels · nothing drives the wheels forwards; a hydraulic motor backs it up · ~13,000 lb · 0-60 ~11 s, ~135 mph',
      trans: 'Jet thrust · hydraulic reverse · 4WS', tyres: '66 in flotation tyres',
      snd: { jet: 1, nEng: 1, cyl: 8, ev: 0, whK: 0.3, whPure: 1, whine: 0.9, rpmRef: 10000, open: 1, fmul: 0.9, deep: 0.5, loud: 1, race: 0 } },
    unicycle: { btn: 'UNICYCLE', sub: 'A 24 in unicycle and its rider · pedal it (~14 mph), pedal a geared-hub one (~35 mph) or strap a jet engine behind the saddle (~85 mph) · lean into the turns', paint: 'Pitch Black', tc: 0, cam: [0.55, 0.85],
      hint: 'Unicycle: shift up (E) for DRIVE and pedal (the gas) - the cranks are on the hub, no gears: ~14 mph flat out. The rider keeps it balanced, leaning into the turns; it can\'t brake or turn hard (back-pedalling, ~0.25 g). R goes backwards.',
      info: 'A 24 in unicycle: a silver rim on 36 spokes, a 24 x 2.125 tyre, a black frame, the saddle with its yellow bumpers, cranks straight on the hub and platform pedals · the rider is the engine (~70 Nm at the cranks from a standstill, ~540 W at 100 rpm) and the balance - fore and aft over the one wheel, leaning into the turns · 81 kg with the rider · 0-10 mph ~2.3 s, ~14 mph',
      trans: 'Direct drive (no gears)', tyres: '24 x 2.125',
      snd: { nEng: 1, cyl: 1, ev: 1, whK: 0.1, whPure: 1, whine: 0, rpmRef: 200, open: 1, fmul: 1, deep: 0, loud: 0, race: 0 },
      optKey: 'uniEng', optLabel: 'Version', options: [
        ['pedal', 'Pedal', 'Leg power: ~0.7 hp · no gears · ~14 mph'],
        ['improved', 'Improved pedal', 'A geared hub (the wheel turns 3.3 times a pedal stroke) and a sprinter\'s legs, ~2 hp · 0-30 ~12 s · ~35 mph'],
        ['jet', 'Jet unicycle', 'A model-jet turbojet behind the saddle, 124 lbf of thrust · 0-60 ~9 s · ~85 mph'],
      ],
      eng: {
        improved: { hint: 'Improved pedal unicycle: shift up (E) for DRIVE and pedal (the gas) - a geared hub turns the wheel 3.3 times for every turn of the cranks, and the rider is a track sprinter: 0-30 in ~12 s, ~35 mph. It takes a while to wind up; the rider keeps it balanced, leaning into the turns, and only the legs brake it.',
          info: 'The 24 in unicycle with a geared hub - the wheel turns 3.3 times to the cranks\' once, a Schlumpf-type hub geared far past any real one - clipless pedals and a track sprinter tucked down on it (~1.6 kW at 130 rpm, ~160 Nm off the line) · 80 kg with the rider · 0-30 ~12 s, ~35 mph',
          trans: 'Geared hub, 3.3:1 overdrive' },
        jet: { hint: 'Jet unicycle: shift up (E) for DRIVE and open the throttle - a model-aircraft turbojet on a rack behind the saddle, 124 lbf of thrust. It takes a couple of seconds to spool, then shoves: 0-60 in ~9 s, ~85 mph on a bicycle tyre. Turns are held to what the rider can lean into; the legs are the only brake. R pedals backwards.',
          info: 'The 24 in unicycle with a model-aircraft-class turbojet strapped on a rack behind the saddle (~550 N, 124 lbf), a fuel tank under it, its thrust line through the rider\'s centre of gravity; the rider in a helmet and goggles · no brake but the legs · 95 kg · 0-60 ~9 s, ~84 mph',
          trans: 'Jet thrust · pedals for reverse',
          snd: { jet: 1, nEng: 1, cyl: 8, ev: 0, whK: 0.3, whPure: 1, whine: 1.2, rpmRef: 10000, open: 1, fmul: 1.4, deep: 0, loud: 0.5, race: 0 } },
      } },
  };
  // (CCD: the car's entry with its engine's changes over it)
  const CC = !!CC_CARS[S.car], CCD = CC ? Object.assign({}, CC_CARS[S.car], (CC_CARS[S.car].eng || {})[S[CC_CARS[S.car].optKey]] || {}) : null;
  const PULLER = S.car === 'puller', DRAGSTER = S.car === 'dragster', MONSTER = S.car === 'monster' || S.car === 'avenger' || S.car === 'firetruck', KART = S.car === 'kart', MOWER = S.car === 'mower';
  const BIG = PULLER || DRAGSTER || MONSTER || KART || MOWER || CC;     // race engines: their own sound set-up, rumble and shake
  const ROADCC = CC && !!CCD.road;                                        // (...but a road car among them - the Ram - doesn't shake)
  const CARDEF = PULLER ? VEH.CARS.puller.make(S.pullerEng) : DRAGSTER ? VEH.CARS.dragster.make(S.dragClass) : MONSTER ? VEH.CARS[S.car]
    : KART ? VEH.CARS.kart.make(S.kartClass) : MOWER ? VEH.CARS.mower.make(S.mowerClass)
    : CC && VEH.CARS[S.car].make ? VEH.CARS[S.car].make(S[CCD.optKey])
    : (VEH.CARS[S.car] && !VEH.CARS[S.car].more ? VEH.CARS[S.car] : VEH.CARS.hellcat);
  const DEMON = S.car === 'demon', DRAGPAK = S.car === 'dragpak';
  const NITRO = DRAGSTER && CARDEF.cls !== 'tad', FUNNY = DRAGSTER && CARDEF.cls === 'fc';   // (Top Fuel and the Funny Car burn nitro)
  const FIXED = DEMON || DRAGPAK || PULLER || DRAGSTER || MONSTER || KART || MOWER || CC;   // factory-fixed driveline and tyres
  // chase camera: distance / height scale (the tractor is 7 m long and 2.4 m tall; a dragster is 9 m long with its
  // wing 2.2 m up, so the camera sits further back and higher to see over it)
  // (the monster truck is 12 ft tall and 12.5 ft wide: further back and well up)
  // (a kart is 6 ft long and sits a foot off the ground: in close and low)
  // (a racing mower is 7 ft long with its driver sitting up 4 ft off the ground)
  const CAMK = CC ? CCD.cam[0] : PULLER ? 1.65 : FUNNY ? 1.15 : DRAGSTER ? 1.3 : MONSTER ? 1.55 : KART ? 0.55 : MOWER ? 0.68 : 1, CAMH = CC ? CCD.cam[1] : PULLER ? 1.65 : FUNNY ? 1.2 : DRAGSTER ? 1.45 : MONSTER ? 2.05 : KART ? 0.55 : MOWER ? 0.8 : 1;
  // (MINI: a scale model's size against a real car - the RC truck's 0.12: the chase camera's minimums, the cockpit's head
  // movement and near plane, and the smoke and dust come down with it)
  const MINI = CC && CCD.scale ? CCD.scale : 1;
  const FINISH = CARDEF.finishFt === 1000 ? 1000 : 1320;   // Top Fuel races to 1,000 ft
  const carSpec = Object.assign({}, CARDEF.spec);
  // (a car's on/off fitting - the derby bus's cowcatcher: its spec changes when it's off)
  if (CC && CCD.toggle && S[CCD.toggle.key] === false && VEH.CARS[S.car].cow) Object.assign(carSpec, VEH.CARS[S.car].cow.off);
  if (DEMON && S.fuel === 'e10') carSpec.torqueScale = (carSpec.torqueScale || 1) * 0.865;
  const veh = new VEH.Vehicle({ C: W.C, ground: W.ground, collidersNear: W.collidersNear }, carSpec);
  veh.setTransmission(FIXED ? 'auto' : S.trans);
  // off-road package, saved per car: KO2 all-terrains + lift on the road cars; each of the More Cars gets its own
  // (the dune buggy has two packages: its dune tyres - true - or off-road knobbies - 'knobby')
  const OFFROAD = () => !(CC && CCD.noPkg) && !!(S.offroad && S.offroad[S.car]);
  // (the trophy truck too: its mud-terrains - true - or sand paddles - 'paddle')
  const PKG_KIND = () => { const v = S.offroad && S.offroad[S.car]; return typeof v === 'string' ? v : null; };
  const pkg = () => VEH.OFFROAD_PKG(S.car, CARDEF.cls, PKG_KIND());
  const PKG_UI = PULLER ? ['R-2 deep lugs', 'R-2 deep lugs + lug fronts', 'Firestone R-2 30.5L-32 "cane & rice" rears left uncut (lugs twice as deep as a farm tyre, never sharpened) and lugged 11L-15 fronts. '
      + 'Off the pavement they out-dig the cut pullers everywhere - they paddle through mud, dig into turf and bite deeper into loose dirt (traction control lets them spin up to where they bite), and it steers in the soft stuff · on pavement the tall lugs squirm and thump. ~2 in taller (re-geared to match), ~130 lb heavier each']
    : DRAGSTER ? ['Sand-drag paddles', 'Paddles + rib fronts', 'The sand-drag setup: paddle tyres (a smooth carcass with ~1.5 in rubber paddles across the tread) and ribbed sand fronts. The paddles shovel the ground - huge bite on dirt and gravel '
      + '(the quickest sand dragster does 300 ft in 2.16 s @ 156 mph) - but next to none on pavement or a prepped strip, and little side grip anywhere. Try the Dirt Drag map']
    : MONSTER ? ['Full-depth lugs', 'Full-depth lugs', 'The BKTs left full-depth, as moulded, instead of shaved and hand-cut for a stadium floor: ~1 in more lug and ~100 lb more rubber each. '
      + 'More grip in mud, turf and loose dirt (it corners harder off the pavement), about the same bite on the arena clay, less on pavement, and a touch slower to spin up']
    : KART ? ['Knobbies', 'Knobbies + sprocket', 'Knobby off-road tyres on 6 in rims (12x5.00-6 front, 13x6.50-6 rear) with a bigger rear sprocket to match: an inch more ground clearance and three times the grip '
      + 'on dirt and grass - and a lot less on pavement, where the knobs squirm and it slides']
    : S.car === 'trophy' ? ['40 in mud-terrains', '40 in mud-terrains', '40x13.5R17 mud-terrains in place of the desert tyres: open lugs that dig into mud and grass, a touch more height, less grip on tarmac and a bit less in the gravel']
    : S.car === 'buggy' ? ['Sand paddles', 'Sand paddles + rib fronts', 'Dune tyres: paddles on the back (rubber scoops across a smooth carcass - huge bite in sand, dirt and mud, next to none on pavement) and ribbed sand fronts']
    : S.car === 'atv' ? ['Sand paddles', 'Sand paddles + rib fronts', 'ATV dune tyres: paddles on the back (rubber scoops across a smooth carcass - huge bite in sand, dirt and mud, next to none on pavement) and ribbed sand fronts that steer in the sand. Take it to the Sand Dunes']
    : S.car === 'bike' ? ['Knobbies', 'Dual-sport knobbies', 'Dual-sport knobby tyres: they bite in dirt, gravel and grass where the touring tyres just slide, and give up a lot of grip (and lean) on pavement']
    : S.car === 'tank' ? ['Steel grousers', 'Bare steel grousers', 'The rubber pads off the track shoes: bare steel grousers dig into dirt, mud and grass for more bite, and slide on pavement (and chew it up)']
    : S.car === 'rally' ? ['Mud tyres', 'Rally mud tyres', 'Rally mud tyres (205/70R15): big, open knobs that bite in grass, dirt and mud - ~1 g round a corner in the grass against ~0.75 g on the gravel tyres, '
      + 'and nearly twice the grip in mud - about the same on gravel, where the gravel tyres are made for it, and a lot less on tarmac. Heavier, and a touch of lift']
    : CC ? ['Knobbies', 'Knobby tyres', 'Knobby off-road tyres in the car\'s own size and a touch of lift: far more bite on dirt, gravel and grass, a lot less on pavement, where the knobs squirm']
    : MOWER ? ['Bar lugs', 'Bar-lug tyres', 'Ag bar-lug tyres (the chevron tread of a garden tractor that pulls a plough) in place of the race tyres: they dig into dirt and mud, '
      + 'grip about the same on grass (the bars tear it up) and squirm on pavement']
    : ['KO2 all-terrains · 2" lift', 'KO2 all-terrains + 2" lift', 'BFGoodrich All-Terrain T/A KO2 LT285/55R20 on all four corners (32 in tall, ~70 lb each)' + (DRAGPAK ? ' on 20 in wheels' : '') + ' + 2 in lift and extra droop. '
      + 'Far more bite on dirt, gravel and grass, more ground clearance and gentle, catchable slides · on pavement: close to the street tyres with a little less grip, tread hum, and taller effective gearing'];
  // (a Car Crushers car with a choice of tyres - the RC truck's knobbies or slicks: S.ccTyre[car], the first the stock ones)
  const ccTyre = () => (CC && CCD.tyreOpts && S.ccTyre && CCD.tyreOpts.find((t) => t[0] === S.ccTyre[S.car])) || null;
  const tireF = () => (OFFROAD() ? pkg().front : FIXED ? (ccTyre() ? ccTyre()[0] : carSpec.frontTire) : 'street');
  const tireR = () => (OFFROAD() ? pkg().rear : DRAGPAK ? (S.dpRear || 'etdrag') : FIXED ? (ccTyre() ? ccTyre()[0] : carSpec.rearTire) : S.rearTire);
  veh.setTires(tireF(), tireR());
  veh.tcMode = S.tcMode; veh.absOn = S.abs;
  const DRAGMAP = S.map === 'drag' || S.map === 'dirtdrag', DIRTSTRIP = S.map === 'dirtdrag', ARENAMAP = S.map === 'arena', MOWTRACK = S.map === 'mowtrack';
  const RAMPSMAP = S.map === 'ramps', FREESTYLE = ARENAMAP || RAMPSMAP;   // (All Ramps: tricks score there too)
  const DUNESMAP = S.map === 'dunes';
  // (the game modes: a generated track - Offroad Racing's course, Unicycle Racing's BMX track - raced in laps, against the
  // clock or the room)
  const OFFMODE = !!GMODES[S.map], UNIMODE = S.map === 'uni', GM = GMODES[S.map] || null;
  // (the closed-loop tracks: the Rally Stage, the Windy Rally Stage and the Windy Mower Track)
  const TRKMAP = !!W.track, MOWCOURSE = MOWTRACK || S.map === 'mowwind';
  // (online, the two rally stages and the two mower tracks are race courses - points, walls, the 30 s reset: the course's
  // centre line, points every ~2 m - the track's own, or the Mower Track's oval)
  const COURSE_MAPS = ['rallywind', 'rally', 'mowwind', 'mowtrack', 'offroad', 'uni'], COURSE = COURSE_MAPS.includes(S.map);
  function ovalLine() {
    const M = W.MOWT, r = M.R, L = 4 * M.SL + 2 * Math.PI * r, n = Math.round(L / 2), x = new Float64Array(n), z = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      // (from the start / finish line - z = 0 on the front straight - up the straight, round the far turn and back)
      let t = (k * L / n + M.SL) % L;
      if (t < 2 * M.SL) { x[k] = r; z[k] = M.SL - t; }
      else if ((t -= 2 * M.SL) < Math.PI * r) { const a = t / r; x[k] = r * Math.cos(a); z[k] = -M.SL - r * Math.sin(a); }
      else if ((t -= Math.PI * r) < 2 * M.SL) { x[k] = -r; z[k] = -M.SL + t; }
      else { t -= 2 * M.SL; const a = Math.PI + t / r; x[k] = r * Math.cos(a); z[k] = M.SL - r * Math.sin(a); }
    }
    const T = { n, L, W: M.W, x, z, s: new Float64Array(n + 1), tx: new Float64Array(n), tz: new Float64Array(n), R: new Float64Array(n) };
    for (let k = 0; k <= n; k++) T.s[k] = k * L / n;
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n, dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz) || 1;
      T.tx[k] = dx / l; T.tz[k] = dz / l;
      T.R[k] = Math.abs(z[k]) > M.SL + 0.01 ? r : 1e4;         // (+: turning left - it's run anticlockwise)
    }
    return T;
  }
  const CRS_T = COURSE ? W.track || ovalLine() : null;
  function coursePoint(s, o) {
    const T = CRS_T, L = T.L;
    s = ((s % L) + L) % L;
    const f = s / L * T.n, i = Math.floor(f) % T.n, j = (i + 1) % T.n, u = f - Math.floor(f);
    const tx = T.tx[i] * (1 - u) + T.tx[j] * u, tz = T.tz[i] * (1 - u) + T.tz[j] * u, tl = Math.hypot(tx, tz) || 1;
    o.x = T.x[i] + (T.x[j] - T.x[i]) * u; o.z = T.z[i] + (T.z[j] - T.z[i]) * u; o.tx = tx / tl; o.tz = tz / tl;
    return o;
  }
  // a start-grid slot behind the line (k 0..7: two across, rows 10 m apart; on the BMX track's gate, eight across it)
  function gridSpot(k) {
    if (UNIMODE) {
      const p = coursePoint(-1.6 - 2.4 * Math.floor(k / 8), {}), lat = ((k % 8) - 3.5) * Math.min(0.85, (CRS_T.W - 1) / 8);
      const x = p.x - p.tz * lat, z = p.z + p.tx * lat;
      return { x, y: W.ground(x, z, {}).h, z, tx: p.tx, tz: p.tz };
    }
    const p = coursePoint(-10 - 10 * (k >> 1), {}), lat = (k & 1 ? 1 : -1) * Math.min(2, CRS_T.W / 2 - 1.3);
    const x = p.x - p.tz * lat, z = p.z + p.tx * lat;
    return { x, y: W.ground(x, z, {}).h, z, tx: p.tx, tz: p.tz };
  }
  const DUNES_HINT = 'Sand Dunes: an endless sea of sand. The wind blows the way you face at the start - head that way and you climb the long, gentle faces and go over the brinks, the steep slip faces drop away on the far side (coming back, you climb those). Sand eats street tyres and bogs skinny ones down: paddles (the dune buggy\'s dune tyres), big all-terrains and four-wheel drive are the way to go.';
  const TRACK_HINT = { rally: 'Rally Stage: 4 km of fast gravel through the woods - long sweepers, crests you fly over flat out, chevron boards on the outside of the tighter corners. Laps are timed at the start / finish arch.',
    rallywind: 'Windy Rally Stage: 2.4 km of narrow, twisting gravel through dense forest - esses, kinks and four hairpins (SPACE is the handbrake). Laps are timed at the start / finish arch.',
    mowwind: 'Windy Mower Track: a twisting dirt road course cut into a mown field, straw bales both sides, turns every which way. Laps are timed at the start / finish arch.' };
  if (UNIMODE) {
    const T = W.track, U = W.uni;
    TRACK_HINT.uni = 'Unicycle Racing: a ' + Math.round(T.L) + ' m BMX track, ' + U.laps + (U.laps > 1 ? ' laps' : ' lap') + ' - down the start hill when the gate drops, over the rollers, doubles and tabletops, round the berms'
      + (U.bank === 'flat' ? '' : ' (lean into them high up the bowl - the bank carries you round faster)') + '. The countdown starts by itself; Backspace puts you back on the track. Esc → Modes for a new track.';
  } else if (OFFMODE) {
    const T = W.track, O = W.offroad, J = T.feats.filter((f) => f.kind === 'jump').length;
    TRACK_HINT.offroad = 'Offroad Race · ' + T.B.name + ': ' + (T.L / 1000).toFixed(1) + ' km, ' + O.laps + (O.laps > 1 ? ' laps' : ' lap') + ' - follow the marker stakes' + (O.biome === 'dunes' ? ' (the orange flags)' : '')
      + (J ? ', ' + J + ' jump' + (J > 1 ? 's' : '') + ' (a JUMP sign before each)' : '') + '. The countdown starts by itself; Backspace puts you back on the course. Esc → Modes for a new course.';
  }
  const spawn = S.netRoom && COURSE ? gridSpot(Math.floor(Math.random() * 8))        // (back in a room: somewhere on the grid)
    : DRAGMAP ? { x: W.DRAG.LANE, y: 0, z: W.DRAG.SPAWN_Z, tx: 0, tz: -1 }
    : ARENAMAP ? W.nearestRoadSpot(W.ARENA.SPAWN_X, W.ARENA.SPAWN_Z, 0, -1)
    : RAMPSMAP ? { x: W.RAMPS_SPAWN.x, y: 0, z: W.RAMPS_SPAWN.z, tx: 0, tz: -1 }
    : MOWTRACK ? { x: W.MOWT.SPAWN_X, y: 0, z: W.MOWT.SPAWN_Z, tx: 0, tz: -1 }
    : DUNESMAP ? { x: W.DUNES.SPAWN_X, y: W.ground(W.DUNES.SPAWN_X, W.DUNES.SPAWN_Z, {}).h, z: W.DUNES.SPAWN_Z, tx: 1, tz: 0 }
    : OFFMODE ? gridSpot(0) : TRKMAP ? W.trackSpawn()
    : S.map === 'straight' ? W.nearestRoadSpot(0, 0, 0, -1) : W.map === 'tarmac' ? W.nearestRoadSpot(W.TARMAC.SPAWN_X, W.TARMAC.SPAWN_Z, 0, -1)
    : W.nearestRoadSpot(30, 40, 0, -1);
  veh.reset(spawn.x, spawn.y, spawn.z, spawn.tx, spawn.tz);
  // (an offroad race's grid isn't always dead level - the car's put down level, so let it settle onto its wheels before
  // the title shows it sitting there)
  if (OFFMODE) { veh.input.brake = 1; for (let i = 0; i < 180; i++) veh.step(1 / 120); veh.input.brake = 0; }
  const sp = veh.spec;

  // ------------------------------------------------------------------ Fun tab: live tuning (saved per car)
  const STOCK = JSON.parse(JSON.stringify(veh.spec));
  const JET = !!STOCK.jet;                      // (the jet golf cart: thrust, no driven wheels)
  const HOVER = !!STOCK.hover;                  // (the landspeeder: repulsors for wheels)
  const tuneDefaults = () => ({
    power: 1, boost: STOCK.boostMax, stretch: 1, limiter: STOCK.limiterRpm, nolimit: false, idle: STOCK.idleRpm, inertia: 1, nos: 0, pops: STOCK.popScale !== undefined ? STOCK.popScale : 1, whine: 1,
    finalAuto: STOCK.autoFinal, finalManual: STOCK.manualFinal, shiftTime: STOCK.shiftTimeWOT || 0.22, launch: STOCK.launchRpm || 4000, gov: true,
    mass: STOCK.mass, grip: 1, downforce: 0, drag: 1, brakes: 1, stiff: 1, steer: 1, gravity: 1, smoke: 1,
  });
  S.tune = S.tune || {};
  const TKEY = PULLER ? 'puller_' + CARDEF.engine : DRAGSTER ? 'dragster_' + CARDEF.cls : KART ? 'kart_' + CARDEF.cls : MOWER ? 'mower_' + CARDEF.cls
    : CC && CARDEF.engine && CARDEF.engine !== 'ev' ? S.car + '_' + CARDEF.engine : S.car;
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
    const surf = DIRTSTRIP ? 3 : DRAGMAP || W.prep ? 5 : 0;
    const flat = { C: { WATER_LEVEL: -1e4 }, ground(x, z, o) { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surface = surf; return o; }, collidersNear(x, z, r, c, b) { c.length = 0; b.length = 0; } };
    const v = new VEH.Vehicle(flat, JSON.parse(JSON.stringify(veh.spec)));
    v.setTransmission(veh.transType); v.setTires(veh.spec.frontTire, veh.spec.rearTire); v.applySpec();
    v.reset(0, 0, 0, 0, -1); v.running = true; v.eOmega = veh.spec.idleRpm / VEH.RAD2RPM; v.park = false; v.gear = 1; v.tcMode = veh.tcMode; v.launchRpm = veh.launchRpm;
    if (v.spec.jet) v.jetN = v.spec.jet.idle;
    for (let i = 0; i < 60; i++) { v.input.brake = 1; v.step(1 / 60); }
    v.input.brake = 0;
    for (const w of v.wheels) if (!w.front) w.temp = 75;
    v.input.handbrake = 1; v.input.throttle = 1;
    for (let i = 0; i < (v.spec.jet ? 440 : 150); i++) v.step(1 / 120);        // (a jet: ~3.5 s to spool up against the brakes)
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
  // (the jet cart: thrust is all there is to turn up - Stage 2 a slightly bigger engine, Unhinged a much bigger one
  // and the wings to keep 270 mph on the ground; the engine on the cart grows with the thrust setting)
  if (JET) {
    TUNE_PRESETS.stage2 = () => Object.assign(tuneDefaults(), { power: 1.35, grip: 1.1, brakes: 1.2, whine: 1.2 });
    TUNE_PRESETS.unhinged = () => Object.assign(tuneDefaults(), { power: 2.5, grip: 1.5, downforce: 2500, brakes: 1.6, stiff: 1.3, whine: 1.6, smoke: 2 });
    // (the Mega Jet, a streamliner: 600 mph stock, Stage 2 ~700 (a touch sleeker), Unhinged 800 - its wings cost drag)
    // (the landspeeder: no wings - downforce would only press its pads into the ground)
    if (HOVER) {
      TUNE_PRESETS.stage2 = () => Object.assign(tuneDefaults(), { power: 1.35, grip: 1.1, brakes: 1.2, whine: 1.2 });
      TUNE_PRESETS.unhinged = () => Object.assign(tuneDefaults(), { power: 2.2, grip: 1.35, brakes: 1.5, whine: 1.5, smoke: 2 });
    }
    if (STOCK.jet.size > 2 && !MONSTER) {      // (the Mega Jet - not the fire truck's J34, as big but no streamliner)
      TUNE_PRESETS.stage2 = () => Object.assign(tuneDefaults(), { power: 1.35, grip: 1.1, brakes: 1.2, whine: 1.2, drag: 0.95 });
      TUNE_PRESETS.unhinged = () => Object.assign(tuneDefaults(), { power: 2.5, grip: 1.5, downforce: 2500, drag: 1.27, brakes: 1.6, stiff: 1.3, whine: 1.6, smoke: 2 });
    }
  }
  const jetSize = () => clamp(Math.sqrt(tune.power), 0.75, 1.8) * ((STOCK.jet && STOCK.jet.size) || 1);   // (engine diameter against stock: airflow ~ area)
  // the model for any vehicle, from its id, its CARS entry and its (constructed) spec - the other players' cars in online
  // play are built by the same
  function buildModel(id, def, s, paint) {
    const o = { variant: id === 'dragpak' ? 'dragpak' : id === 'demon' ? 'demon' : 'hellcat', paint, cgHeight: s.cgHeight, zOff: (s.cgToRear - s.cgToFront) / 2, cgToFront: s.cgToFront, cgToRear: s.cgToRear, trackF: s.trackF, trackR: s.trackR };
    if (id === 'tank') return TANKM.build(THREE, Object.assign(o, { wheelRadius: s.wheelRadius }));
    if (id === 'trophy' || id === 'buggy') return OFFR.build(THREE, Object.assign(o, { car: id, engine: def.engine, wheelRadiusF: s.wheelRadiusF || s.wheelRadius, wheelRadiusR: s.wheelRadiusR || s.wheelRadius }));
    if (id === 'atv') return ATVM.build(THREE, Object.assign(o, { engine: def.engine || 'sport', wheelRadiusF: s.wheelRadiusF, wheelRadiusR: s.wheelRadiusR }));
    if (id === 'unicycle') return UNIM.build(THREE, Object.assign(o, { engine: def.engine || 'pedal', wheelRadiusF: s.wheelRadiusF || s.wheelRadius }));
    if (id === 'bike') return BIKEM.build(THREE, Object.assign(o, { engine: def.engine || 'stock', wheelRadiusF: s.wheelRadiusF, wheelRadiusR: s.wheelRadiusR }));
    return id === 'puller' ? PULL.build(THREE, Object.assign(o, { engine: def.engine })) : id === 'dragster' ? DRAGM.build(THREE, Object.assign(o, { cls: def.cls }))
      : id === 'monster' || id === 'avenger' || id === 'firetruck' ? MON.build(THREE, Object.assign(o, { body: id })) : id === 'kart' ? KRT.build(THREE, Object.assign(o, { cls: def.cls }))
      : id === 'mower' ? MOW.build(THREE, Object.assign(o, { cls: def.cls, wheelRadiusF: s.wheelRadiusF, wheelRadiusR: s.wheelRadiusR }))
      : CC_CARS[id] ? CRU.build(THREE, Object.assign(o, { car: id, engine: def.engine || 'ev', wheelRadiusF: s.wheelRadiusF || s.wheelRadius, wheelRadiusR: s.wheelRadiusR || s.wheelRadius, cow: id !== S.car || S.busCow !== false })) : CAR.build(THREE, o);
  }
  // (a vehicle's CARS entry from its id and option key - engine, class or version)
  function defOf(id, opt) {
    const C = VEH.CARS;
    if (id === 'puller') return C.puller.make(opt || 'hemi4');
    if (id === 'dragster') return C.dragster.make(opt || 'tf');
    if (id === 'kart') return C.kart.make(opt || 'tag');
    if (id === 'mower') return C.mower.make(opt || 'bp');
    if (id === 'monster' || id === 'avenger') return C[id];
    if (C[id] && C[id].make) return C[id].make(opt || undefined);
    return C[id] && !C[id].more ? C[id] : C.hellcat;
  }
  // every pair of tyres the game can put on a vehicle (with that option): its own, the off-road package in each of its
  // kinds, a Car Crushers car's tyre options, the Hellcat's drag radials, the Drag Pak's rears. test/tyre-look-test.js
  // builds every vehicle's model and checks each pair is drawn differently - a menu that offers tyres lists them here
  function tyreChoices(id, opt) {
    const def = defOf(id, opt), cc = CC_CARS[id], out = [];
    const add = (f, r) => { if (!out.some((o) => o[0] === f && o[1] === r)) out.push([f, r]); };
    const f0 = def.spec.frontTire || VEH.SPEC.frontTire, r0 = def.spec.rearTire || VEH.SPEC.rearTire;
    add(f0, r0);
    if (id === 'hellcat') add('street', 'drag');
    if (id === 'dragpak') { add(f0, 'etdrag'); add(f0, 'etdragpro'); }
    if (cc && cc.tyreOpts) for (const t of cc.tyreOpts) add(t[0], t[0]);
    if (!(cc && cc.noPkg)) for (const k of id === 'trophy' ? [null, 'paddle'] : id === 'buggy' ? [null, 'knobby'] : [null]) { const p = VEH.OFFROAD_PKG(id, def.cls, k); add(p.front, p.rear); }
    return out;
  }
  const car = buildModel(S.car, CARDEF, sp, S.paint);
  scene.add(car.root);
  car.setTires(tireF(), tireR()); car.setTransmission(veh.transType);

  const smoke = new FX.Particles(THREE, scene, 2800);
  smoke.setCamera(camera);
  const skids = new FX.Skids(THREE, scene, 9000);
  const SOIL = [null, [0.3, 0.27, 0.22], [0.2, 0.19, 0.09], [0.27, 0.19, 0.11], null, null, [0.44, 0.32, 0.18]];   // rut colours: gravel, grass (torn turf), dirt, sand
  const flames = new FX.Flames(THREE, car.root, car.exhaustTips);
  const audio = new AUD.CarAudio();
  const input = new INP.Input();
  // (keyboard steering: a car that tips over well short of 1 g - the scooter, the porta potty - is steered to its own limit)
  if (CC && CARDEF.kbLat) input.kbGeom = { wb: sp.wheelbase, maxSteer: sp.maxSteer, aLat: CARDEF.kbLat };
  input.rawSteer = !!sp.steerAScale;           // (the RC truck and the unicycle scale their own lock with speed: the keys and the stick go in raw)
  // (...a held key still turns only as hard as kbAScale, m/s^2 - the unicycle's rider can't lean past ~0.35 g - but at a
  // walking pace, where both limits are past full lock, it still gets the whole lock: the cut is the ratio of the two)
  if (sp.steerAScale && sp.kbAScale) input.rawKb = { wb: sp.wheelbase, maxSteer: sp.maxSteer, a: sp.kbAScale, A: sp.steerAScale };
  const hud = new HUDM.HUD(W); hud.units = S.units;
  const perf = new HUDM.PerfTimers(); perf.rollout = S.rollout;

  // ------------------------------------------------------------------ state
  const G = { started: false, paused: true, menu: false, lightsOn: false, horn: false, arcadeT: 0, time: 0, rearMan: 0, flipHintT: 0, lastEv: { shift: 0, backfire: 0, grind: 0 }, emitAcc: [0, 0, 0, 0], rumbleT: 0, loadDone: false, shake: 0,
    smk: [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]] };
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
  // (the car put down at a spot: on its wheels, the engine kept running, the camera caught up)
  function putCar(spot) {
    const keepRunning = veh.running;
    veh.reset(spot.x, spot.y, spot.z, spot.tx, spot.tz);
    veh.running = keepRunning;
    if (!keepRunning) veh.startEngine();
    if (veh.transType === 'auto') { veh.park = false; veh.gear = 1; }
    skids.last = [null, null, null, null];
    cam.init = false;
  }
  function resetCar(auto) {
    // racing online: once every 30 s, back on the centre line where you are on the course (auto: thrown off the course -
    // that one's free)
    if (RACE.on) {
      if (raceHolding()) return;
      if (!auto) {
        const wait = resetWait() - (performance.now() - RACE.resetT) / 1000;
        if (wait > 0) { hud.toast('Reset in ' + Math.ceil(wait) + ' s', 1.2); return; }
        RACE.resetT = performance.now(); raceLost();
      }
      putCar(raceSpot()); RACE.hayOn.clear(); LAP.armed = false;
      hud.toast(auto ? 'Back on the course' : 'Back on the track');
      return;
    }
    const a = carAxes();
    const spot = DRAGMAP ? spawn : W.nearestRoadSpot(veh.px, veh.pz, a.fx, a.fz);
    putCar(spot);
    hud.toast(DIRTSTRIP ? 'Back behind the line' : DRAGMAP ? 'Back to the burnout box' : FREESTYLE ? 'Back on its wheels' : MOWTRACK || TRKMAP ? 'Back on the track' : 'Car reset');
    if (MOWTRACK || TRKMAP) LAP.armed = false;            // (a reset doesn't count as a lap)
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
    b.addEventListener('click', () => { if (b.dataset.map !== S.map) { if (mapLocked()) return; S.map = b.dataset.map; saveS(); location.reload(); } });
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
      + (CARDEF.cls === 'kz' ? ' KZ shifter: 6 gears - E / Q or the paddles (M holds it in manual).' : CARDEF.cls === 'tag' ? ' The clutch is fully in by 6,000 rpm, so it pulls away off the pipe - it comes alive past ~9,000.'
        : CARDEF.cls === 'sc' ? ' Supercharged: 200 hp through 6 gears (E / Q or the paddles). Traction control is on Track - with it Off, any real throttle lights up the slicks.' : ''), 10), 1600);
    else if (MOWER) setTimeout(() => hud.hint('Racing mower: shift up (E) for DRIVE and floor it - blades out, racing number on. '
      + (CARDEF.cls === 'bp' ? 'A real garden tractor on turf tyres: turn in gently and let it slide. '
        : CARDEF.cls === 'fx' ? 'Tube chassis, 34 hp single, kart dirt tyres: it digs in on grass and dirt. '
          : 'A 189 hp superbike engine and racing slicks: 0-100 in ~6.3 s, ~150 mph, 6 gears (E / Q or the paddles). Keep it on the pavement - slicks are hopeless on grass and dirt. ')
      + (CARDEF.cls === 'rec' ? (S.map === 'straight' ? 'The Straightaway is its record strip: see how close to 150 you get.' : 'Its record strip is the Straightaway map (Esc → Drive → Map).')
        : MOWTRACK ? 'Laps are timed at the start / finish arch - left turns, anticlockwise.' : MOWCOURSE ? 'Laps are timed at the start / finish arch.' : 'Its home is the Mower Track map (Esc → Drive → Map); the Windy Mower Track twists.'), 11), 1600);
    else if (CC) setTimeout(() => hud.hint(CCD.hint + (CCD.map && S.map !== CCD.map && !(CCD.map === 'rally' && S.map === 'rallywind') ? ' Its home is the ' + (MAP_NAMES[CCD.map] || CCD.map) + ' map (Esc → Drive → Map).' : TRKMAP ? ' ' + TRACK_HINT[S.map] : DUNESMAP ? ' ' + DUNES_HINT : ''), 14), 1600);
    else if (MONSTER) setTimeout(() => hud.hint('Monster truck: shift up (E) for DRIVE. All four wheels drive AND steer: G cycles the rear steering (AUTO / CRAB / MANUAL with , and .). '
      + 'In the air, GAS lifts the nose and BRAKE drops it (air assist keeps it landable - turn it off in Esc → Drive for flips). Rolled it? Steer left or right to flip it back over.'
      + (FREESTYLE ? '' : ' Its home is the Monster Arena map (Esc → Drive → Map); All Ramps is nothing but jumps.'), 12), 1600);
    else if (TRKMAP) setTimeout(() => hud.hint(TRACK_HINT[S.map], 10), 1600);
    else if (DUNESMAP) setTimeout(() => hud.hint(DUNES_HINT, 12), 1600);
    else if (MOWTRACK) setTimeout(() => hud.hint('Mower Track: a 1/5-mile dirt oval in a mown field, straw bales for walls, left turns. Laps are timed at the start / finish arch; the gap on the outside of the front straight leads out to the field. (The racing mowers live here: Esc → More cars.)', 10), 1600);
    else if (RAMPSMAP) setTimeout(() => hud.hint('All Ramps: the whole world is groomed dirt covered in jumps - gap jumps, tabletops, step-ups, kickers and whoops, big and small, every which way, for ever. The first gap jump is dead ahead. Big air, flips and wheelies score.', 11), 1600);
    else if (ARENAMAP) setTimeout(() => hud.hint('Monster Arena: two big gap jumps straight ahead up the middle and a giant tabletop across the far end; tabletops and step-ups either side, the car crush on the left, whoops lanes along the walls and behind you. Tricks score on the big screens. (The monster truck lives here: Esc → More cars.)', 11), 1600);
    else if (DIRTSTRIP) setTimeout(() => hud.hint('Dirt drag strip: no burnout here. Creep up to stage, hold SPACE + floor it, let go of SPACE on green. Slicks skate on dirt — all-terrains and pulling tyres dig in.', 9), 1600);
    else if (DRAGMAP) setTimeout(() => hud.hint('Burnout in the box (hold B, or brake + throttle), then creep up to stage. Hold SPACE + floor it — let go of SPACE on green!', 9), 1600);
    else if (W.prep) setTimeout(() => hud.hint('Prepped roads: every road is sprayed and rubbered in like a drag strip - sticky, and stickier still for drag radials and slicks once they\'re warm (do a burnout: hold B). The grass and gravel aren\'t prepped.', 10), 1600);
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
  window.addEventListener('pointerup', () => { cam.dragging = false; cam.orbitT = TANK ? Infinity : 1.2; });
  window.addEventListener('pointermove', (e) => {
    if (!cam.dragging) return;
    cam.orbitYaw -= (e.clientX - cam.lx) * 0.006; cam.orbitPitch = clamp(cam.orbitPitch + (e.clientY - cam.ly) * 0.004, -0.5, 0.9);
    cam.lx = e.clientX; cam.ly = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => { cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.6, 2.2); }, { passive: true });

  // ------------------------------------------------------------------ menu
  const TABS = ['Drive', 'Modes', 'Fun', 'Online', 'Controls', 'Graphics', 'Audio', 'Help'];
  const MAP_NAMES = { country: 'Countryside', tarmac: 'All Road', prepcountry: 'Prepped Countryside', preptarmac: 'Prepped All Road', straight: 'Straightaway', drag: 'Drag Strip',
    dirtdrag: 'Dirt Drag', arena: 'Monster Arena', ramps: 'All Ramps', mowtrack: 'Mower Track', mowwind: 'Windy Mower Track', rally: 'Rally Stage', rallywind: 'Windy Rally Stage', dunes: 'Sand Dunes', offroad: 'Offroad Race', uni: 'Unicycle Racing' };
  let curTab = 'Drive';
  function openMenu(v) {
    G.menu = v;
    $('menu').classList.toggle('hidden', !v);
    G.paused = v || !G.started || !$('raceRes').classList.contains('hidden');
    if (v && OFFMODE && !inRoom() && raceHolding()) RACE.go = 0;
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
      sub: 'Rental, TaG 125, KZ shifter and a 200 hp supercharged kart · 2-strokes to 16,000 rpm · no suspension, solid rear axle · 1.3 g in the corners',
      desc: 'A tube frame a few inches off the ground, an engine beside the seat driving the rear axle by chain, direct steering and slicks the size of dinner plates. No suspension and no differential - the frame flexes, the inside rear tyre lifts, and you feel every ripple. The rental kart is slow and forgiving behind its wraparound bumper; the TaG 125 is a proper race kart; the KZ shifter is a 48 hp, 6-speed rocket that brakes on all four wheels. The supercharged kart has a 998 cc supercharged superbike engine behind the seat - 200 hp and a blower whistle in something that weighs 540 lb with you in it.',
      btn: 'GO-KART', tc: 3, optKey: 'kartClass', options: [
        ['rental', 'Rental kart', '390 cc 4-stroke · ~13 hp · centrifugal clutch · wraparound bumper · hard tyres · ~31 mph', 'Go Mango'],
        ['tag', 'TaG 125', 'X30-type 125 cc 2-stroke · ~30 hp at 13,000 · centrifugal clutch · 158 kg · ~74 mph', 'B5 Blue'],
        ['kz', 'KZ shifter', '125 cc 2-stroke · ~48 hp · 6-speed sequential · 4-wheel brakes · 0-60 in ~4 s · ~95 mph', 'TorRed'],
        // (5th: the traction-control mode it starts on - 200 hp on kart slicks spins them at any real throttle)
        ['sc', 'Supercharged', '998 cc supercharged superbike four · ~200 hp · 6-speed + quickshifter · wheelie bar · 0-60 in ~2.4 s · ~132 mph', 'Plum Crazy', 2],
      ] },
    { id: 'mower', name: 'RACING MOWERS', paint: 'Sublime', map: 'mowtrack',
      sub: 'B-Prepared garden tractor, FX single and a 150 mph land-speed record mower · blades out, deck on · turf, kart dirt and slick tyres',
      desc: 'Lawn mower racing, built to the US association\'s classes. The B-Prepared is a real garden tractor on its factory frame and body with the V-twin built inside to ~38 hp, the mower\'s own 5-speed transaxle re-geared, turf tyres and the deck still hung underneath - ~80 mph, sliding on turf tyres. The FX is a tube chassis under a tractor hood: a 459 cc single on pump gas, a centrifugal clutch and kart dirt tyres, ~88 mph. The record mower is built like the 150 mph land-speed holders: a superbike four, a quickshifter and racing slicks - 0-100 mph in ~6.3 s.',
      btn: 'RACING MOWER', tc: 3, optKey: 'mowerClass', options: [
        ['bp', 'B-Prepared', 'Garden tractor · built 810 cc V-twin · ~38 hp · 5-speed transaxle · turf tyres · 265 kg · ~80 mph', 'Sublime'],
        ['fx', 'FX single', 'Tube chassis · 459 cc single · ~34 hp · centrifugal clutch, 3-speed · kart dirt tyres · 205 kg · ~88 mph', 'B5 Blue'],
        // (5th: its traction-control mode; 6th: its home map - a record run wants a long straight, and slicks hate dirt)
        ['rec', 'Record mower', '999 cc superbike four · 189 hp · 6-speed + quickshifter · racing slicks · 0-100 mph in ~6.3 s · ~150 mph', 'TorRed', 2, 'straight'],
      ] },
    { id: 'monster', name: 'MONSTER TRUCK', paint: 'Go Mango', map: 'arena',
      sub: '12,000 lb · 1,500 hp blown 540 · 66 in tyres · 30 in of travel · 4-wheel drive & 4-wheel steering · its own stadium',
      desc: 'Built to the stadium freestyle spec: a chromoly tube chassis under a fiberglass body, the driver strapped in the middle, a supercharged methanol big-block behind them, planetary axles on nitrogen shocks with 30 inches of travel, and 66-inch tyres the crew hand-cuts into paddles. Both axles steer. It comes with the Monster Arena: a big gap jump, a tabletop, whoops and a pile of junk cars that really crush. Gas lifts the nose in the air, the brake drops it.',
      btn: 'MONSTER TRUCK', tc: 3 },
    { id: 'avenger', name: 'AVENGER MONSTER TRUCK', paint: 'Avenger Green', map: 'arena',
      sub: 'The same 12,000 lb stadium truck - 1,500 hp blown 540, 66 in tyres, 30 in of travel, 4WD and 4WS - in the lime-green Avenger body with its flames',
      desc: 'The Avenger: a rounded hot-rod coupe body in lime green, yellow-to-orange flames licking back from the nose outlined in red, the name across the doors, a wall of stickers under it, dark windows, the zoomies out of the rear fenders - on the same chassis, engine, axles, shocks and tyres as the other truck, so it drives the same.',
      btn: 'AVENGER', tc: 3 },
    // (the Car Crushers 2 cars, a card each - see CC_CARS)
    ...Object.entries(CC_CARS).map(([id, c]) => ({ id, name: c.btn, btn: c.btn, paint: c.paint, tc: c.tc, map: c.map, sub: c.sub, desc: c.info, optKey: c.optKey, options: c.options, toggle: c.toggle })),
  ];
  const MORE_IDS = MORE_CARS.map((m) => m.id);
  function pickCar(id, opt) {
    if (carLocked()) { $('moreCars').classList.add('hidden'); return; }
    if (S.map === 'uni' && id !== 'unicycle') { hud.toast('Unicycle Racing: everyone rides a unicycle - Esc → Modes to pick the version, or leave the race', 3.5); $('moreCars').classList.add('hidden'); return; }
    const m = MORE_CARS.find((x) => x.id === id);
    if (id === S.car && (!m || !opt || S[m.optKey] === opt)) { $('moreCars').classList.add('hidden'); return; }
    const o = m && opt && m.options ? m.options.find((x) => x[0] === opt) : null;
    if (m && ((id !== S.car && m.paint) || (o && o[3] && S[m.optKey] !== opt))) S.paint = (o && o[3]) || m.paint;
    // the tractor and the dragsters start on Track traction control (on the road, throttle in a turn would otherwise
    // just swap ends - the real ones have none: switch it Off for the raw thing); the car you came from gets its setting back
    // (a car that sets its own mode keeps the one you had in tcModePrev, and a car that doesn't gets it back)
    const fromM = MORE_CARS.find((x) => x.id === S.car), fromTc = !!(fromM && fromM.tc !== undefined);
    if (id !== S.car) {
      if (m && m.tc !== undefined) { if (!fromTc) S.tcModePrev = S.tcMode; S.tcMode = m.tc; }
      else if (fromTc && S.tcModePrev !== undefined) S.tcMode = S.tcModePrev;
    }
    // (an option can start on its own traction-control mode; switching away from it goes back to the vehicle's)
    if (m && o && (id !== S.car || S[m.optKey] !== opt)) S.tcMode = o[4] !== undefined ? o[4] : m.tc !== undefined ? m.tc : S.tcMode;
    // (a car with a home map takes you there; the map you came from comes back when you leave it. An option can have its
    // own home - 6th entry - e.g. the record mower's is the Straightaway, not the mowers' dirt oval)
    {
      const homeOf = (mm, key) => { if (!mm) return null; const oo = key && mm.options ? mm.options.find((x) => x[0] === key) : null; return (oo && oo[5]) || mm.map || null; };
      const from = MORE_CARS.find((x) => x.id === S.car);
      const homeNew = homeOf(m, opt || (m && S[m.optKey])), homeOld = homeOf(from, from && S[from.optKey]);
      // (All Ramps is a monster truck's home too, the windy course a mower's, the windy stage a rally car's)
      const atHome = (h) => S.map === h || (h === 'arena' && S.map === 'ramps') || (h === 'mowtrack' && S.map === 'mowwind') || (h === 'rally' && S.map === 'rallywind');
      if (inRoom() || GMODES[S.map]) { /* online: the host picks the map; racing a game mode, you stay on its track */ } else if (homeNew && !atHome(homeNew)) { if (!homeOld || !atHome(homeOld)) S.mapPrev = S.map; S.map = homeNew; }
      else if (!homeNew && homeOld && atHome(homeOld) && S.mapPrev) S.map = S.mapPrev;
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
      more.addEventListener('click', () => { if (!carLocked()) openMoreCars(); });
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
      // (an on/off fitting - the derby bus's cowcatcher: flip it here; driving that car, it restarts with it changed)
      if (m.toggle) {
        const T = m.toggle, tg = el('<div class="mopts"></div>');
        for (const [val, lab] of [[true, T.on], [false, T.off]]) {
          const b = el(`<button class="mopt ${S[T.key] !== false === val ? 'on' : ''}"><b>${T.label}: ${lab}</b><span>${val ? T.note : 'The plain bumper'}</span></button>`);
          b.addEventListener('click', () => { if (carLocked()) return; S[T.key] = val; saveS(); if (S.car === m.id) location.reload(); else openMoreCars(); });
          tg.appendChild(b);
        }
        card.appendChild(tg);
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
    if (carLocked(true)) {
      add(row('<span style="color:#7fb4ff">Online: the host\'s tune</span>', 'Everyone in the room drives the host\'s car with the host\'s Fun-tab tune - it changes when they change it. '
        + 'Your own tune for this car is kept, and comes back when you leave the room.', el('<span></span>')));
      return;
    }
    const onT = (k) => (x) => { tune[k] = x; applyTune(); stats(); };
    const T = (k, label, sub, min, max, step, fmt) => add(row(label, sub, slider(min, max, step, tune[k], fmt, onT(k))));
    const sect = (t) => add(el(`<div class="sect">${t}</div>`));
    const statsEl = el('<div class="tunestats"></div>');
    function stats() {
      const e10 = DEMON && S.fuel === 'e10', ratedHp = e10 ? 900 : CARDEF.hp, ratedTq = e10 ? 810 : CARDEF.tq;
      const p = peakFigures(veh.spec), hp = ratedHp * p.hp / STOCK_PEAK.hp, tq = ratedTq * p.tq / STOCK_PEAK.tq, lb = tune.mass * 2.20462;
      if (JET) { const lbf = veh.spec.jet.thrust * (veh.spec.torqueScale || 1) / 4.448; statsEl.innerHTML = `<b>${Math.round(lbf)} lbf</b> of thrust · ` + (veh.spec.jet.ab ? `${Math.round(lbf * (1 + veh.spec.jet.ab))} lbf with the afterburner · ` : '') + `${Math.round(lb).toLocaleString()} lb` + (tune.gravity !== 1 ? ` · ${tune.gravity.toFixed(2)} g` : ''); return; }
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
    // (an electric car: a motor, not an engine - no boost, idle, nitrous, exhaust, launch rpm or gears to shift)
    // (a jet: thrust, and that's all - no revs, gears, boost or exhaust to tune)
    const EVT = !!STOCK.electric || JET;
    sect(JET ? 'Jet' : EVT ? 'Motor' : 'Engine');
    T('power', JET ? 'Thrust' : EVT ? 'Motor power' : 'Engine power', JET ? 'Multiplies the turbojet\'s thrust, dry and with the afterburner' : EVT ? 'Multiplies the motor\'s torque (a bigger inverter and pack)' : 'Multiplies the whole torque curve (heads, cam, tune…)', 0.5, 3, 0.05, (x) => Math.round(x * 100) + '%');
    if (!JET) {
    if (!EVT) T('boost', 'Supercharger boost', 'More pressure = more torque everywhere (stock ' + STOCK.boostMax + ' psi)', 0, Math.max(45, Math.ceil(STOCK.boostMax * 1.5)), 0.5, (x) => x.toFixed(1) + ' psi');
    T('stretch', EVT ? 'Base speed' : 'Cam / powerband', EVT ? 'Moves where the motor goes from full torque to full power — pair it with the speed limit' : 'Moves the whole powerband up or down the rev range — pair it with the rev limiter', 0.7, 5, 0.05, (x) => k(peakRpm(x)) + ' pk');
    T('limiter', EVT ? 'Motor speed limit' : 'Rev limiter', EVT ? (tune.nolimit ? 'Limit removed: the motor pulls until the wind and its own losses stop it' : 'The controller fades the torque out as the motor reaches it')
      : tune.nolimit ? 'Limiter removed: this is now just the redline and the automatic\'s shift point' : 'Automatic shift points follow it', 3500, 30000, 100, (x) => k(x));
    add(row(EVT ? 'Speed limit' : 'Limiter', EVT ? 'Unlimited: the controller never fades the torque' : 'Unlimited: no fuel cut at all — in manual (or M mode) the engine revs until its own friction and windage stop it',
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
    matchWrap.appendChild(el('<span class="simout">' + (EVT ? 'Moves the base speed up to suit the speed limit and gears the car to match, so the motor really pulls up there'
      : 'Moves the powerband peak to just under the limiter and gears the car to suit, so the engine really pulls (and the automatic really revs) up there') + '</span>'));
    add(matchWrap);
    }
    if (!EVT) T('idle', 'Idle speed', 'Higher idle = lumpier, choppier cam sound', 500, 2000, 10, (x) => k(x));
    if (!JET) T('inertia', EVT ? 'Rotor inertia' : 'Flywheel / rotating mass', 'Lighter revs faster (and bogs easier)', 0.3, 2, 0.05, (x) => x.toFixed(2) + '×');
    if (!EVT) {
      T('nos', 'Nitrous shot', 'Extra horsepower while it sprays: at full throttle, above 1,500 rpm, in gear (traction control still has the last word)', 0, 1000, 25, (x) => x ? '+' + x + ' hp' : 'off');
      add(row('Nitrous fires', 'Armed: the shot goes in whenever you floor it (a wide-open-throttle switch, like a real kit - works with any wheel) · On the button: only while N or a mapped wheel button is held',
        seg([['wot', 'Armed — floor it'], ['hold', 'On the button']], tune.nosArm === 'hold' ? 'hold' : 'wot', (v) => { tune.nosArm = v; })));
    }
    if (!JET) sect('Drivetrain');
    if (JET) { /* (nothing drives the wheels) */ } else if (veh.transType === 'auto') {
      T('finalAuto', EVT ? 'Reduction gear' : 'Final drive ratio', 'Higher = harder launch, lower top speed (stock ' + STOCK.autoFinal + ')', 1.8, 25, 0.01, (x) => x.toFixed(2));
      if (!EVT) T('shiftTime', 'Shift speed', 'How long each automatic upshift takes at full throttle', 0.05, 0.5, 0.01, (x) => Math.round(x * 1000) + ' ms');
    } else T('finalManual', 'Final drive ratio', 'Higher = harder launch, lower top speed (stock ' + STOCK.manualFinal + ')', 1.8, 25, 0.01, (x) => x.toFixed(2));
    if (!EVT) T('launch', 'Launch / TransBrake rpm', 'Where the engine is held while you hold SPACE at a stop', 1000, 9000, 100, (x) => k(x));
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
    if (!EVT) T('pops', 'Pops & bangs', 'Overrun crackles and backfire flames', 0, 6, 0.25, (x) => x ? x.toFixed(2) + '×' : 'off');
    T('whine', JET ? 'Turbine whine' : EVT ? 'Motor whine' : 'Supercharger whine', '', 0, 3, 0.05, (x) => Math.round(x * 100) + '%');
    T('smoke', 'Tyre smoke', '', 0, 4, 0.1, (x) => Math.round(x * 100) + '%');
  }
  function peakRpm(stretch) {
    let best = 0, at = 0;
    const end = STOCK.torqueCurve[STOCK.torqueCurve.length - 1][0] * stretch;   // within the designed powerband
    for (let r = 800; r <= end; r += 50) { const hp = VEH.curveAt(STOCK.torqueCurve, r / stretch) * r; if (hp > best) { best = hp; at = r; } }
    return at;
  }
  function renderMenu() {
    // (online, in someone else's room: the car buttons are the host's to press)
    $('carPick').classList.toggle('locked', carLocked(true));
    const tabs = $('tabs'); tabs.innerHTML = '';
    for (const t of TABS) { const b = el(`<button class="${t === curTab ? 'on' : ''}">${t}</button>`); b.addEventListener('click', () => { curTab = t; renderMenu(); }); tabs.appendChild(b); }
    const body = $('tabbody'); body.innerHTML = '';
    const add = (n) => body.appendChild(n);
    if (curTab === 'Drive') {
      if (carLocked(true)) add(row('<span style="color:#7fb4ff">Online: the host\'s car</span>', 'Everyone in the room drives the car the host picked, set up their way - its '
        + 'version, tyres, transmission, package and Fun-tab tune. Your paint, driver aids and controls are still yours. Leaving the room puts you back in your own car.', el('<span></span>')));
      if (DEMON) {
        add(row('Fuel', 'E85: 1,025 hp / 945 lb-ft (calibrated to the NHRA 8.91 s @ 151 mph pass) · 91-octane E10: 900 hp / 810 lb-ft (restarts)',
          seg([['e85', 'E85 — 1,025 hp'], ['e10', '91 octane — 900 hp']], S.fuel, (v) => { if (v !== S.fuel) { if (carLocked()) return; S.fuel = v; saveS(); location.reload(); } })));
        add(row('TransBrake 2.0', 'Hold SPACE (handbrake button) at the line, floor it, release SPACE to launch. 8HP90 auto · MT ET Street R 315/50R17 drag radials · governed to 149 mph', el('<span></span>')));
      }
      if (PULLER) {
        add(row('Modified pulling tractor', '3.6 t · ' + CARDEF.hp.toLocaleString() + ' hp · 30.5L-32 cut pulling tyres · slider clutch + 3-speed planetary · spool · no suspension, no ABS / ESC. Hold SPACE on the line, floor it, let go to dump the clutch.', el('<span></span>')));
        add(row('Engines', 'Swapping engines restarts the game (each package keeps its own Fun-tab tune)',
          seg(VEH.CARS.puller.make && Object.entries(VEH.CARS.puller.engines).map(([k, e]) => [k, e.short]), CARDEF.engine, (v) => { if (v !== CARDEF.engine) { if (carLocked()) return; S.pullerEng = v; saveS(); location.reload(); } })));
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
            if (v !== CARDEF.cls) { if (carLocked()) return; const o = MORE_CARS.find((x) => x.id === 'dragster').options.find((x) => x[0] === v); if (o && o[3]) S.paint = o[3]; S.dragClass = v; saveS(); location.reload(); }
          })));
        add(row('Making a pass', 'Burnout: hold B and floor it — no front brakes, so it rolls forward spinning its wet slicks (that\'s the heat they need). Back up (X / reverse, it creeps). Stage, hold SPACE (clutch pedal in) and floor it, let go of SPACE on green. The clutch slips by design — the engine sits near 7,000 rpm and climbs as the clutch locks up. Lift at the finish; the chutes pop by themselves (F pulls them).', el('<span></span>')));
        add(row('Staying straight', 'Traction control on Track (the default) plays crew chief: it backs off the clutch and timing when the slicks start to spin. Off is the real thing — on plain asphalt it goes up in smoke and swaps ends.', el('<span></span>')));
      }
      if (KART) {
        add(row(CARDEF.name, CARDEF.cls === 'sc' ? '998 cc supercharged inline-four (H2-type centrifugal blower, ~20 psi), ~200 hp at 11,000, 14,000 limiter · 6-speed dog box with a quickshifter (E / Q, paddles) · auto clutch · wheelie bar · brakes on all four wheels · 245 kg with the driver · slicks · starts on Track traction control'
          : CARDEF.cls === 'kz' ? '125 cc 2-stroke single, ~48 hp at 13,500, 14,500 limiter · 6-speed sequential (E / Q, paddles) · brakes on all four wheels · 175 kg with the driver · slicks'
          : CARDEF.cls === 'tag' ? 'Water-cooled 125 cc 2-stroke single, ~30 hp at 13,000, 19.5 Nm, 16,000 limiter · centrifugal clutch straight to the axle · rear brake only · 158 kg with the driver · slicks'
          : '390 cc 4-stroke single, ~13 hp, governed · centrifugal clutch · one rear disc · hard long-life tyres · 235 kg with the driver', el('<span></span>')));
        add(row('Class', 'Switching restarts the game (each class keeps its own Fun-tab tune)',
          seg(Object.entries(VEH.CARS.kart.classes).map(([k, c]) => [k, c.short]), CARDEF.cls, (v) => { if (v !== CARDEF.cls) pickCar('kart', v); })));
        add(row('Driving a kart', 'No suspension, no differential: the tyres and the flexing frame do everything. Brake in a straight line (the rear-braked karts lock up easily), turn in smoothly and carry the speed - scrubbing the fronts or sliding the rear costs time. Slicks need a lap to warm up.', el('<span></span>')));
      }
      if (MOWER) {
        add(row(CARDEF.name, CARDEF.cls === 'rec' ? '999 cc superbike inline-four, ~189 hp at 13,000, 116 Nm · 6-speed with a quickshifter (E / Q, paddles) · 18x7.5-10 racing slicks on 10 in wheels · short-travel suspension · ~225 kg with the rider · starts on Track traction control'
          : CARDEF.cls === 'fx' ? '459 cc OHV single built on pump gas, ~34 hp at 7,400 · centrifugal clutch, 3-speed box, chain to a solid axle · go-kart dirt tyres · no suspension, pinned front axle · hydraulic brakes · 205 kg with the driver'
            : 'Garden tractor, stamped-steel frame · 810 cc OHV V-twin built inside, ~38 hp at 6,000 · the mower\'s 5-speed transaxle re-geared · foot clutch (worked for you) · turf tyres · no suspension · 265 kg with the driver', el('<span></span>')));
        add(row('Class', 'Switching restarts the game (each class keeps its own Fun-tab tune)',
          seg(Object.entries(VEH.CARS.mower.classes).map(([k, c]) => [k, c.short]), CARDEF.cls, (v) => { if (v !== CARDEF.cls) pickCar('mower', v); })));
        add(row('Driving a racing mower', 'No suspension: the soft tyres and the seat are it. The driver sits high on a narrow track - on level ground the tyres slide before it tips, but a side slope or a bump taken sideways can put it over. Turn in smoothly, lift to tighten the line, and lean on the throttle out of the turn. Real races run on grass and dirt ovals.', el('<span></span>')));
      }
      if (CC) add(row(CARDEF.name, CCD.info, el('<span></span>')));
      if (CC && CCD.options) add(row(CCD.optLabel || 'Engine', (CCD.optLabel ? 'Switching' : 'Swapping engines') + ' restarts the game (each keeps its own Fun-tab tune)',
        seg(CCD.options.map((o) => [o[0], o[1]]), CARDEF.engine || 'ev', (v) => { if (v !== (CARDEF.engine || 'ev')) pickCar(S.car, v); })));
      if (CC && CCD.tyreOpts) add(row('Tyres', CCD.tyreNote, seg(CCD.tyreOpts.map((t) => [t[0], t[1]]), ccTyre() ? ccTyre()[0] : CCD.tyreOpts[0][0], (v) => {
        if (carLocked()) return;
        S.ccTyre = Object.assign({}, S.ccTyre, { [S.car]: v }); applyVehicleSettings();
      })));
      if (CC && CCD.toggle) add(row(CCD.toggle.label, CCD.toggle.note + ' · changing it restarts the game',
        seg([[true, CCD.toggle.on], [false, CCD.toggle.off]], S[CCD.toggle.key] !== false, (v) => { if (carLocked() || v === (S[CCD.toggle.key] !== false)) return; S[CCD.toggle.key] = v; saveS(); location.reload(); })));
      if (MONSTER) {
        if (!CC) add(row('Monster truck', '12,000 lb · supercharged 540 ci methanol big-block, ~1,500 hp · 2-speed race automatic · locked transfer case, planetary axles with lockers - all four wheels always driven · 66x43.00-25 hand-cut tyres · 30 in of travel · no traction control, no ABS', el('<span></span>')));
        add(row('Rear steering (G)', 'AUTO: the rears counter-steer at low speed for tight turns and straighten out as you go faster · CRAB: they follow the fronts, so it slides sideways · MANUAL: the real thing - hold , or . to swing them, they stay where you leave them · FRONT: rears locked straight',
          seg([['auto', 'Auto'], ['crab', 'Crab'], ['manual', 'Manual'], ['front', 'Front only']], S.rsMode, (v) => { S.rsMode = v; G.rearMan = 0; })));
        if (CC) add(row('In the air', 'Nothing drives the tyres, so the GAS does nothing to them in the air - the jet pushes along the truck as it flies; stab the BRAKE and the stopping tyres pitch it nose down. Land on the down slopes.', el('<span></span>')));
        else add(row('In the air', 'The tyres weigh 645 lb each: spin them up with the GAS and the truck rocks back (nose up); stab the BRAKE and it pitches nose down. Lift off the gas to fly level. Land on the down slopes.', el('<span></span>')));
        add(row('Air assist', 'On: like a seasoned driver’s feet plus a spotter - it looks ahead to the slope you’ll land on, eases off the gas (or brake) before the truck rotates past it, catches a nose that’s way off, gently levels the truck in pitch and roll while it flies, and feathers the gas as you touch down (spinning rears would kick it over backwards). Holding the gas over a jump no longer flips it; a truck that rolled over on a ramp’s edge before it took off is still a crash. Off: all yours - backflips, front flips and crashes',
          seg([[true, 'On'], [false, 'Off (do your own flips)']], S.airAssist !== false, (v) => { S.airAssist = v; })));
      }
      if (FREESTYLE) {
        const clr = el('<button class="btn small ghost">New run (score to 0)</button>');
        clr.addEventListener('click', () => { FS.score = 0; FS.best = 0; FS.last = ''; arenaScreen(true); hud.toast('Freestyle score reset'); });
        add(row('Freestyle', RAMPSMAP ? 'Big air, flips, wheelies, nose wheelies and donuts all score' : 'Big air, flips, wheelies, nose wheelies, donuts and crushed cars all score on the big screens · the junk cars are replaced once they\'re all flat', clr));
      }
      if (DRAGPAK) {
        add(row('Mopar Drag Pak (race car)', 'Supercharged 354 HEMI · race 3-speed auto, non-lockup converter · spool · wheelie bars · no ABS / ESC. Hold SPACE on the line (TransBrake), floor it, release SPACE to launch.', el('<span></span>')));
        if (!OFFROAD()) add(row('Rear tyres', 'Slicks: fatter footprint, more grip (~7.5 s) · Radials: the 9-inch tyre NHRA Factory Stock requires (~7.7 s) · both need heat', seg([['etdrag', 'MT ET Drag 29.5x10.5 slicks'], ['etdragpro', 'MT ET Drag Pro 30x9 radials']], S.dpRear || 'etdrag', (v) => { if (carLocked()) return; S.dpRear = v; applyVehicleSettings(); })));
        add(row('Parachute', 'F (or map a wheel button) pulls the 10 ft chute above ~10 mph · it deploys by itself past the drag-strip finish line · press again when stopped to repack', el('<span></span>')));
      }
      if (!FIXED) add(row('Transmission', 'TorqueFlite 8HP90 8-speed automatic with paddles, or Tremec TR-6060 6-speed manual', seg([['auto', '8-speed auto'], ['manual', '6-speed manual']], S.trans, (v) => { if (carLocked()) return; S.trans = v; applyVehicleSettings(); })));
      if (!FIXED) add(row('Manual clutch', input.hasClutchPedal ? 'Use your clutch pedal (can stall!) or let the car work the clutch for you' : 'Map a clutch pedal in Controls → Wheel setup to use it', seg([[false, 'Auto-clutch'], [true, 'Clutch pedal']], S.clutchPedal, (v) => { S.clutchPedal = v; })));
      if (S.car === 'buggy') add(row('Tyres', 'Buggy tyres: a narrow bias front, a fat street-tread rear · Sand paddles: rubber scoops across a smooth rear carcass and ribbed fronts - made for the dunes: '
        + 'huge bite in sand (and dirt and mud), they float over it, next to none on pavement · Off-road knobbies: 27 in fronts, 31 in rears - they bite in dirt, gravel, grass and mud and hold their own in sand, less grip on pavement',
        seg([[false, 'Buggy tyres'], [true, 'Sand paddles'], ['knobby', 'Off-road knobbies']], (S.offroad && S.offroad.buggy) || false, (v) => {
          if (carLocked()) return;
          S.offroad = Object.assign({}, S.offroad, { buggy: v }); applyVehicleSettings();
        })));
      else if (S.car === 'trophy') add(row('Tyres', 'Desert tyres: 39 in, interlocking blocks - made for the rough stuff at speed · Sand paddles: 39 in paddles on the back, ribbed fronts - '
        + 'the dune buggy\'s sand tyres in the truck\'s size: huge bite in sand (and dirt and mud), they float over it, next to none on pavement · Mud-terrains: 40 in, open lugs for mud and grass',
        seg([[false, 'Desert tyres'], ['paddle', 'Sand paddles'], [true, '40 in mud-terrains']], (S.offroad && S.offroad.trophy) || false, (v) => {
          if (carLocked()) return;
          S.offroad = Object.assign({}, S.offroad, { trophy: v }); applyVehicleSettings();
        })));
      else if (!(CC && CCD.noPkg)) add(row('Off-road package', PKG_UI[2], seg([[false, 'Off'], [true, PKG_UI[1]]], OFFROAD(), (v) => {
        if (carLocked()) return;
        S.offroad = Object.assign({}, S.offroad, { [S.car]: v }); applyVehicleSettings();
      })));
      if (!FIXED && !OFFROAD()) add(row('Rear tyres', 'Drag radials: huge launch grip once warm (do a burnout!), soft sidewall, less cornering grip, slick when cold', seg([['street', 'Pirelli P Zero 275/40ZR20'], ['drag', 'Nitto NT555R II 315/35R20 drag radials']], S.rearTire, (v) => { if (carLocked()) return; S.rearTire = v; applyVehicleSettings(); })));
      add(row(DRAGPAK || PULLER || DRAGSTER || MONSTER ? 'Traction control' + (DRAGPAK ? ' (Holley EFI)' : DRAGSTER ? ' (clutch management)' : '') : 'Drive mode (ESC / traction)', DRAGPAK ? 'Timing-based wheel-speed traction management — Street: most intervention · Track: least · Off: all on you (no ESC on a race car)' : 'Street: full nannies · Sport: some slip · Track: TC only, ESC off · Off: everything off', seg(TC_NAMES.map((n, i) => [i, n]), S.tcMode, (v) => { S.tcMode = v; applyVehicleSettings(); })));
      if (!sp.noABS) add(row('ABS', '', seg([[true, 'On'], [false, 'Off']], S.abs, (v) => { S.abs = v; applyVehicleSettings(); })));
      const sw = el('<div class="swatches"></div>');
      for (const [name, hex] of Object.entries(CAR.PAINTS)) {
        const b = el(`<div class="sw ${name === S.paint ? 'on' : ''}" title="${name}" style="background:#${hex.toString(16).padStart(6, '0')}"></div>`);
        b.addEventListener('click', () => { S.paint = name; car.setPaint(name); saveS(); renderMenu(); netProfileSync(); });
        sw.appendChild(b);
      }
      add(row('Paint', S.paint, sw));
      add(row('Map', 'Countryside: endless roads · All Road: the whole world is pavement, drive anywhere · Prepped: the same two with every road prepped like a drag strip (sticky, rubbered in) · Straightaway: flat straight road · Drag Strip: prepped strip with a Christmas tree & timing · Dirt Drag: the same on groomed dirt · Monster Arena: a stadium of dirt jumps and junk cars · All Ramps: the whole world is dirt covered in jumps (restarts)',
        seg(Object.entries(MAP_NAMES), S.map, (v) => { if (v !== S.map) { if (mapLocked()) return; S.map = v; saveS(); location.reload(); } })));
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
    } else if (curTab === 'Modes') {
      renderModes(add);
    } else if (curTab === 'Fun') {
      renderFun(add);
    } else if (curTab === 'Controls') {
      renderControls(add);
    } else if (curTab === 'Graphics') {
      add(row('View distance', '', slider(900, 2600, 100, S.viewDist, (v) => v + ' m', (v) => { S.viewDist = v; world.setQuality({ viewDist: v }); })));
      add(row('Tree density', 'Applies to newly loaded areas', slider(0.2, 1, 0.1, S.treeDensity, (v) => Math.round(v * 100) + '%', (v) => { S.treeDensity = v; world.setQuality({ treeDensity: v }); world.rebuildAll(); })));
      add(row('Shadows', '', seg([[true, 'On'], [false, 'Off']], S.shadows, (v) => { S.shadows = v; world.setQuality({ shadows: v }); })));
      add(row('Tyre smoke & dust', 'Small: just a few little puffs at the tyres - no big drift smoke or dirt clouds to block the view (the other players\' cars too)',
        seg([['full', 'Full'], ['small', 'Small']], S.dust || 'full', (v) => { S.dust = v; })));
      add(row('Resolution scale', 'Lower = faster', slider(0.5, 1, 0.05, S.resScale, (v) => Math.round(v * 100) + '%', (v) => { S.resScale = v; resize(); })));
      add(row('Cockpit field of view', '', slider(50, 95, 1, S.fov, (v) => v + '°', (v) => { S.fov = v; })));
      add(row('Seat height (cockpit)', 'Raise to see more of the gauges over the wheel', slider(-0.12, 0.12, 0.005, S.seatY, (v) => (v * 100).toFixed(1) + ' cm', (v) => { S.seatY = v; })));
      add(row('Seat fore / aft (cockpit)', 'Negative = closer to the wheel', slider(-0.15, 0.15, 0.005, S.seatZ, (v) => (v * 100).toFixed(1) + ' cm', (v) => { S.seatZ = v; })));
      add(row('Chase field of view', '', slider(45, 85, 1, S.chaseFov, (v) => v + '°', (v) => { S.chaseFov = v; })));
      add(row('HUD', '', seg([[true, 'Show'], [false, 'Hide']], S.showHud, (v) => { S.showHud = v; $('hud').classList.toggle('hidden', !v); })));
      add(row('Pedal / steering bars', '', seg([[true, 'Show'], [false, 'Hide']], S.showInputs, (v) => { S.showInputs = v; })));
      add(row('Gauges in cockpit view', 'The real dash works — the big HUD gauge is hidden by default in the cockpit', seg([[false, 'Dash only'], [true, 'Dash + HUD']], S.cockpitHud, (v) => { S.cockpitHud = v; })));
    } else if (curTab === 'Online') {
      renderOnline(add);
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
    if (P.camera) { cam.mode = (cam.mode + 1) % 3; S.camMode = cam.mode; saveS(); cam.init = false; hud.toast(VIEW_NAMES[cam.mode], 1.2); if (TANK) { cam.orbitYaw = 0; cam.orbitPitch = 0; } }
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
    } else if (sp.rearSteerMax) {
      // (the Cybertruck: the rears steer against the fronts at low speed for a tight turn, and a touch with them at speed)
      const v = Math.abs(veh.forwardSpeed), stv = input.state.steer;
      veh.input.rearSteer = -stv * clamp(1 - (v - 4) / 12, 0, 1) + stv * 0.15 * clamp((v - 18) / 12, 0, 1);
    }
    // GTA-style flip: steering rolls a car that's on its roof or side back onto its wheels
    veh.input.flipAssist = true;
    // (monster truck) air assist: eases off whichever pedal would over-rotate it in the air, feathers the gas on landing
    // (racing offroad, every vehicle gets it - the jumps and brows are meant to be raced over)
    veh.input.airAssist = (MONSTER || OFFMODE) && S.airAssist !== false;
    veh.input.revHold = !!A.rev;
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
    // nitrous: an armed kit fires off its wide-open-throttle switch - floor it (that's how the real ones work, and a wheel
    // with no spare button gets it too); on the button it only sprays while N / a mapped button is held
    veh.input.nos = !!A.nos || (tune.nos > 0 && tune.nosArm !== 'hold' && thr > 0.95);
    veh.useClutchPedal = veh.transType === 'manual' && S.clutchPedal && input.hasClutchPedal;
  }

  // ------------------------------------------------------------------ per-frame: effects
  function tachMax() {
    G.peakRpm = Math.max(G.peakRpm || 0, veh.rpm());
    const top = sp.noLimiter ? Math.max(sp.limiterRpm, G.peakRpm * 1.08) : sp.limiterRpm;
    return Math.max(7000, Math.ceil((top + 400) / 1000) * 1000);
  }
  // (Graphics → Tyre smoke & dust: Small keeps a few little puffs at the tyres - no drift smoke or dirt clouds to see through)
  const DUST_SMALL = { rate: 0.35, alpha: 0.3, size: 0.4, grow: 0.9, life: 0.9, up: 0.6 };
  function effects(dt) {
    const a = carAxes();
    const speed = Math.hypot(veh.vx, veh.vy, veh.vz);
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i];
      G.smk[i][0] = 0;
      if (!w.contact) { skids.break(i); continue; }
      const slip = w.slipSpeed;
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      let fx = a.fx * cs + a.rx * sn, fz = a.fz * cs + a.rz * sn; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      let rate = 0, alpha = 0, shade = 0, size = 0.55, grow = 2.0, life = 3, up = 0;
      // marks and smoke only from a tyre past its grip peak (spinning, sliding, locked): w.rho is the slip over the
      // peak slip. A gripping tyre always creeps a little, and that creep in m/s grows with speed, so slip speed alone
      // laid rubber on every hard (but tidy) acceleration
      const past = clamp((w.rho - 1.0) / 1.5, 0, 1);
      if (HOVER) {
        // (a repulsor: no rubber, no ruts - its wash blows the loose ground up from under it, more the faster it goes and
        // the harder the turbines push; a mist off water)
        skids.break(i);
        if (w.surface !== 0 && w.surface !== 5) {
          const amt = clamp(speed / 30, 0, 1) * 0.7 + 0.3 * clamp(veh.thrEff, 0, 1);
          rate = amt * (w.surface === 4 ? 40 : 26); alpha = 0.06 + 0.12 * amt; shade = w.surface === 4 ? 0 : w.surface === 3 ? 1.25 : w.surface === 6 ? 0.55 : 1;
          size = 0.5 + 0.4 * amt; grow = 1.6 + amt; life = 1.2 + amt; up = 0.6;
        }
      } else if (w.surface === 0 || w.surface === 5) {
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
        rate = amt * 45 + roost * 140; alpha = 0.08 + 0.2 * amt + 0.16 * roost; shade = w.surface === 3 ? 1.25 : w.surface === 6 ? 0.55 : 1;
        size = 0.45 + 0.4 * roost; grow = 1.2 + 1.6 * roost; life = 1.6 + amt + roost; up = roost * 3;
        // loose ground: a spinning or sliding tyre digs a soil-coloured rut
        const rut = past * clamp((slip - 2) / 5, 0, 1) * clamp(w.Fz / 3500, 0.2, 1) * 0.6;
        skids.add(i, w.cpx, w.cpz, fx, fz, w.tire.width * 1.1, rut, groundH, SOIL[w.surface]);
      } else skids.break(i);
      if (MONSTER) { rate *= 1.5; size *= 2.1; grow *= 1.4; up *= 1.5; }   // 43 in wide paddle tyres throw a lot of dirt
      if (MINI < 1) { const k = Math.sqrt(MINI); rate *= 3 * k; size *= k * 0.6; grow *= k; up *= k; }   // (a scale model's: little puffs)
      { const m = G.smk[i]; m[0] = rate * tune.smoke; m[1] = alpha; m[2] = size; m[3] = shade; m[4] = grow; m[5] = life; m[6] = up; }
      if (S.dust === 'small') { rate *= DUST_SMALL.rate; alpha = Math.min(alpha, DUST_SMALL.alpha); size = Math.min(size, DUST_SMALL.size); grow = Math.min(grow, DUST_SMALL.grow); life = Math.min(life, DUST_SMALL.life); up = Math.min(up, DUST_SMALL.up); }
      // (a cloud already filling the screen many times over gets its new puffs fewer but denser: same look, a
      // fraction of the pixels to draw)
      const bud = smoke.budget;
      if (bud < 1) alpha = Math.min(0.85, 1 - Math.pow(1 - alpha, 1 / Math.max(0.35, bud)));
      G.emitAcc[i] += rate * dt * tune.smoke * bud;
      if (G.emitAcc[i] >= 1) smoke.setGround(groundH(w.cpx, w.cpz));
      while (G.emitAcc[i] >= 1) {
        G.emitAcc[i] -= 1;
        const back = w.omega * w.radius - (veh.vx * fx + veh.vz * fz);
        smoke.emit(w.cpx + (Math.random() - 0.5) * 0.3 * MINI, w.cpy + (0.15 + Math.random() * 0.1) * MINI, w.cpz + (Math.random() - 0.5) * 0.3 * MINI,
          veh.vx * 0.3 - fx * clamp(back, -15, 15) * 0.18 + (Math.random() - 0.5) * 1.2 * MINI, (0.4 + Math.random() * (0.8 + up)) * Math.sqrt(MINI), veh.vz * 0.3 - fz * clamp(back, -15, 15) * 0.18 + (Math.random() - 0.5) * 1.2 * MINI,
          size * (0.8 + Math.random() * 0.4), grow, life * (0.7 + Math.random() * 0.6), alpha, shade);
      }
    }
    // nitro burns in the pipes: a Top Fuel engine under power lights all eight zoomies (alcohol burns nearly invisible)
    if (DRAGSTER) flames.burn(veh.running && !veh.fuelCut ? clamp(veh.thrEff * veh.tcCut * (veh.rpm() - 3000) / 4500, 0, 1) * (NITRO ? 1 : 0.35) : 0);
    if (car.sootTips && car.sootTips.length) soot(dt);
    // (the smoke's fill budget follows the frame rate while the smoke is what's filling the screen: a slower GPU
    // draws fewer of the nearest puffs one by one and more of them as the flat veil)
    if (smoke.coverageAll > 0.6 * smoke.fill && G.fps) smoke.fill = clamp(smoke.fill * (G.fps < 50 ? 1 - dt * 0.8 : G.fps > 57 ? 1 + dt * 0.3 : 1), 4, 24);
    smoke.update(dt, 1.3, 0.5);
    smoke.setLight(world.sun.color, world.sun.intensity, world.preset === 'night' ? 0.08 : world.preset === 'sunset' ? 0.42 : 0.55);
    flames.update(dt);
  }

  // ------------------------------------------------------------------ a diesel's soot: black out of the stack as the fuel
  // runs ahead of the air - floored before the turbo has spooled, and on a tuned truck (CCD.soot: how rich the tune
  // runs) under any real load. It leaves the stack at the exhaust's speed on top of the truck's own, so at speed it
  // trails back over the bed; a little grey haze at idle
  const _sv = new THREE.Vector3(), _sd = new THREE.Vector3();
  function soot(dt) {
    if (!veh.running) return;
    // (soot: 0 - the derby bus's gas big-blocks - is none at all, not the default)
    const K = CCD.soot !== undefined ? CCD.soot : 0.3, thr = clamp(veh.thrEff, 0, 1), lag = Math.max(0, thr - (veh.spool || 0));
    if (!K) return;
    const amt = clamp((1.7 * lag + 0.3 * thr * thr * clamp(veh.rpm() / sp.redlineRpm + 0.3, 0, 1.2)) * K, 0, 2.4);
    const idle = K > 0.5 ? 0.04 : 0.015;
    G.sootAcc = (G.sootAcc || 0) + dt * (amt > 0.02 ? 6 + 45 * Math.min(1.6, amt) : 3) * smoke.budget * tune.smoke;
    if (G.sootAcc < 1) return;
    const a = Math.max(amt, idle), m = car.root.matrixWorld;
    smoke.setGround(groundH(car.root.position.x, car.root.position.z));
    while (G.sootAcc >= 1) {
      G.sootAcc -= 1;
      for (const st of car.sootTips) {
        _sv.copy(st.p).applyMatrix4(m); _sd.copy(st.d).transformDirection(m);
        const v0 = 1.5 + 5 * thr * Math.min(1, 0.3 + a);
        smoke.emit(_sv.x + (Math.random() - 0.5) * 0.06, _sv.y + (Math.random() - 0.5) * 0.06, _sv.z + (Math.random() - 0.5) * 0.06,
          veh.vx + _sd.x * v0 + (Math.random() - 0.5) * 0.8, veh.vy + _sd.y * v0 + Math.random() * 0.5, veh.vz + _sd.z * v0 + (Math.random() - 0.5) * 0.8,
          0.22 + 0.16 * Math.min(1.5, a), 1.0 + 1.4 * Math.min(1.6, a), (2 + 2.4 * Math.min(1.5, a)) * (0.8 + Math.random() * 0.4), clamp(0.16 + 0.32 * a, 0, 0.72), -clamp(0.3 + 0.55 * a, 0, 1));
      }
    }
  }

  // ------------------------------------------------------------------ the tank's turret: it turns to wherever the camera
  // looks (drag the mouse to look round) at a real turret's ~40 deg/s, and the gun lifts with the view (-9 to +20 deg)
  const TANK = S.car === 'tank', BIKE = S.car === 'bike' || S.car === 'unicycle', _Z = new THREE.Vector3(0, 0, 1);
  const TUR = { yaw: 0, elev: 0 }, _tq = new THREE.Quaternion(), _td = new THREE.Vector3();
  function turretFollow(dt) {
    _td.set(0, 0, -1).applyQuaternion(camera.quaternion).applyQuaternion(_tq.set(veh.qx, veh.qy, veh.qz, veh.qw).invert());
    const want = Math.atan2(-_td.x, -_td.z), eWant = clamp(Math.asin(clamp(_td.y, -1, 1)) + 0.16, -0.16, 0.35);
    let d = want - TUR.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    TUR.yaw += clamp(d, -0.7 * dt, 0.7 * dt); TUR.elev += clamp(eWant - TUR.elev, -0.45 * dt, 0.45 * dt);
    car.setTurret(TUR.yaw, TUR.elev);
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
      smoke.setWheel(i, _v, _v2, HOVER ? 0 : w.radius, (w.tire.width || 0.3) / 2 + 0.02);    // (no tyre for a repulsor's wash to fade into)
    }
    if (TANK) turretFollow(dt);
    if (car.afterWheels) car.afterWheels();
    if (car.setRider) car.setRider(veh.forwardSpeed, veh);
    if (car.setJet) { car.setJetSize(jetSize()); car.setJet(veh.jetN || 0, veh.jetAB || 0, veh.thrEff || 0, dt); }
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
      camera.near = 0.02 * Math.max(MINI, 0.2);
      // head: g-force lean + look into corners
      // (a dragster's 5 g shoves your head a little further back into the rest)
      const tx = clamp(-veh.gLat * 0.025, -0.05, 0.05), tz = clamp(veh.gLong * 0.02, -0.04, DRAGSTER ? 0.08 : 0.04);
      cam.head.x += (tx * MINI - cam.head.x) * Math.min(1, dt * 6); cam.head.z += (tz * MINI - cam.head.z) * Math.min(1, dt * 6);
      cam.head.y = ((veh.fuelCut ? (Math.random() - 0.5) * 0.004 : 0) + (Math.random() - 0.5) * 0.0015 * clamp(Math.abs(speed) / 60, 0, 1)) * MINI;
      // tractor: sitting on the frame right behind the engines, everything shakes
      if (PULLER && veh.running) { const sh = 0.0025 + 0.007 * clamp(veh.thrEff, 0, 1); cam.head.y += (Math.random() - 0.5) * sh; cam.head.x += (Math.random() - 0.5) * sh * 0.5; }
      // dragster: the engine is bolted to the frame right behind your seat - and 5 g shoves your head back
      if (DRAGSTER && veh.running) {
        const sh = 0.002 + (NITRO ? 0.009 : 0.005) * clamp(veh.thrEff, 0, 1) + 0.002 * clamp(veh.gLong / 4, 0, 1);
        cam.head.y += (Math.random() - 0.5) * sh; cam.head.x += (Math.random() - 0.5) * sh * 0.6;
      }
      const hy = (G.lookBack ? Math.PI * 0.92 : -veh.steerAngle * 0.4);
      cam.headYaw += (hy - cam.headYaw) * Math.min(1, dt * 5);
      _v.copy(car.eye).add(cam.head); _v.y += S.seatY * MINI; _v.z += S.seatZ * MINI;
      car.root.localToWorld(_v);
      camera.position.copy(_v);
      yawQ.setFromAxisAngle(Y, cam.headYaw + cam.orbitYaw);
      pitchQ.setFromAxisAngle(X, (KART ? -0.17 : BIKE ? -0.2 : S.car === 'atv' ? -0.42 : -0.1) - cam.orbitPitch * 0.8);
      camQ.copy(car.root.quaternion).multiply(yawQ).multiply(pitchQ);
      // (a rider's head stays half upright as the bike leans under it)
      if (BIKE) camQ.multiply(yawQ.setFromAxisAngle(_Z, (veh.lean || 0) * 0.5));
      camera.quaternion.copy(camQ);
      camera.fov = S.fov;
    } else {
      camera.near = 0.1 * Math.max(MINI, 0.3);
      const far = cam.mode === 1;
      const dist = (far ? 10.5 : 6.4) * CAMK * cam.zoom + clamp(Math.abs(speed) * 0.012, 0, 1.2) * MINI;
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
      const gh = groundH(camera.position.x, camera.position.z) + 0.6 * Math.max(MINI, 0.25);
      if (camera.position.y < gh) camera.position.y = gh;
      _v.set(veh.px + dir.x * 2.2 * MINI * (DRAGSTER ? 1.6 : 1), cam.yS + (far ? 0.9 : 0.75) * CAMH, veh.pz + dir.z * 2.2 * MINI * (DRAGSTER ? 1.6 : 1));
      camera.lookAt(_v);
      if (BIG && !ROADCC && veh.running && !ENG_SND.ev) { const sh = (DRAGSTER ? 0.003 : MONSTER || KART || MOWER ? 0.002 : 0.004) + (NITRO ? 0.016 : MONSTER ? 0.006 : KART || MOWER ? 0.004 : 0.012) * clamp(veh.thrEff, 0, 1) * clamp(veh.rpm() / sp.limiterRpm, 0.3, 1); camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh; }
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
  // (the supercharged kart: a 4-into-1 superbike four, and the centrifugal blower's whistle - its impeller turns ~9.3x
  // crank, ~2.2 kHz at the limiter - with the surge chirp when you lift at boost)
  // (mowers: a 90 deg V-twin on open pipes, a big single, a superbike four through its end can)
  // the engine sound's set-up for any vehicle (the other players' cars' too)
  function engSndFor(id, def) {
    const cc = CC_CARS[id], ccd = cc ? Object.assign({}, cc, (cc.eng || {})[def.engine] || {}) : null;
    return cc ? ccd.snd : id === 'mower' ? (def.cls === 'bp' ? { nEng: 1, cyl: 2, vt: 90, fmul: 1.15, deep: 0.15, loud: 0.3, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 6500, race: 0.9, rough: 0.3 }
      : def.cls === 'fx' ? { nEng: 1, cyl: 1, fmul: 1.3, deep: 0.05, loud: 0.3, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 7700, race: 1, rough: 0.3 }
        : { nEng: 1, cyl: 4, fmul: 1.5, deep: 0, loud: 0.5, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 13000, race: 0.9, rough: 0.06 })
    : id === 'kart' ? (def.cls === 'rental' ? { nEng: 1, cyl: 1, fmul: 1.5, deep: 0, loud: 0.15, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 3800, race: 0.3, rough: 0.35 }
      : def.cls === 'sc' ? { nEng: 1, cyl: 4, fmul: 1.6, deep: 0, loud: 0.45, open: 1, whK: 0.155, whPure: 1, whine: 1.5, rpmRef: 13000, race: 0.8, rough: 0.08, surge: 1 }
      : def.cls === 'kz' ? { nEng: 1, cyl: 2, fmul: 2.2, deep: 0, loud: 0.45, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 13500, race: 1, rough: 0.15, pipe: [9000, 11500] }
      : { nEng: 1, cyl: 2, fmul: 2.4, deep: 0, loud: 0.3, open: 1, whK: 0.19, whPure: 0, whine: 0, rpmRef: 15000, race: 1, rough: 0.15, pipe: [8500, 11000] })
    : id === 'monster' || id === 'avenger' ? { nEng: 1, cyl: 8, fmul: 0.85, deep: 0.55, loud: 0.9, open: 1, whK: 0.19, whPure: 0, whine: 1.9, rpmRef: 7000, race: 1, rough: 0.3 }
    : id === 'dragster' ? (def.cls !== 'tad' ? { nEng: 1, cyl: 8, fmul: 0.8, deep: 0.7, loud: 1, open: 1, whK: 0.19, whPure: 0, whine: 1.1, rpmRef: 8400, race: 1, rough: 0.9 }
    : { nEng: 1, cyl: 8, fmul: 0.9, deep: 0.35, loud: 0.8, open: 1, whK: 0.19, whPure: 0, whine: 1.3, rpmRef: 9400, race: 1, rough: 0.35 })
    : id !== 'puller' ? { nEng: 1, cyl: 8, fmul: 1, deep: 0, loud: 0, open: 0, whK: 0.19, whPure: 0 }
    : def.engine === 'v12' ? { nEng: 2, cyl: 12, fmul: 0.5, deep: 1, loud: 1, open: 1, whK: 2.0, whPure: 1, whine: 1.2, rpmRef: 3700, race: 0.5 }
    : { nEng: 4, cyl: 8, fmul: 0.62, deep: 1, loud: 1, open: 1, whK: 0.19, whPure: 0, whine: 1.4, rpmRef: 8400, race: 1 };
  }
  const ENG_SND = engSndFor(S.car, CARDEF);
  function audioUpdate() {
    if (!audio.ready) return;
    let squeal = veh.squeal || 0, spin = 0, pitch = 0.5;
    for (const w of veh.wheels) {
      if (!w.contact || w.surface !== 0) continue;
      if (!w.front && w.slipSpeed > 4) spin = Math.max(spin, clamp((w.slipSpeed - 4) / 14, 0, 1));
      pitch = Math.max(pitch, clamp(w.slipSpeed / 25, 0, 1));
    }
    squeal = Math.max(squeal, spin * 0.9);
    if (HOVER) { squeal = 0; spin = 0; }        // (repulsors: nothing to squeal)
    const rw = veh.wheels[2];
    const speed = Math.hypot(veh.vx, veh.vy, veh.vz);
    audio.update({
      rpm: veh.rpm(), load: veh.running ? clamp(veh.thrEff * veh.tcCut * veh.escCut * (veh.shiftCut || 1), 0, 1) : 0, thr: veh.input.throttle,
      cut: veh.fuelCut ? 1 : 0, boost: veh.boost, run: veh.running ? 1 : 0, crank: veh.cranking ? 1 : 0,
      squeal, sqPitch: pitch, spin, speed, surf: rw.contact ? rw.surface : 0, interior: cam.mode === 2 ? 1 : 0,
      horn: G.horn ? 1 : 0, vol: S.vol, engVol: S.engVol, fxVol: S.fxVol, rough: ENG_SND.rough || 0, whine: (BIG ? ENG_SND.whine : DRAGPAK ? 1.7 : DEMON ? 1.45 : 1) * tune.whine,
      rpmRef: (BIG ? ENG_SND.rpmRef : DRAGPAK ? 8800 : 6200) * clamp(sp.limiterRpm / STOCK.limiterRpm, 0.7, 2), hum: (OFFROAD() && !BIG) || ENG_SND.rc ? 1 : 0,
      boostRef: Math.max(BIG ? STOCK.boostMax : DRAGPAK ? 24 : 11.6, sp.boostMax), race: BIG ? ENG_SND.race : DRAGPAK ? 1 : 0,
      nEng: ENG_SND.nEng, cyl: ENG_SND.cyl, fmul: ENG_SND.fmul, deep: ENG_SND.deep, loud: ENG_SND.loud, open: ENG_SND.open, whK: ENG_SND.whK, whPure: ENG_SND.whPure,
      pipe: ENG_SND.pipe ? clamp((veh.rpm() - ENG_SND.pipe[0]) / (ENG_SND.pipe[1] - ENG_SND.pipe[0]), 0, 1) : 0,
      vt: ENG_SND.vt || 0, surge: ENG_SND.surge || 0, ev: ENG_SND.ev || 0,
      jet: ENG_SND.jet || 0, ab: veh.jetAB || 0, nos: veh.nosActive ? 1 : 0, jsz: JET ? jetSize() : 1,
      turbo: ENG_SND.turbo || 0, diesel: ENG_SND.diesel || 0, rc: ENG_SND.rc || 0, road: HOVER ? 0.3 : 1,
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
    for (const w of veh.wheels) if (w.contact && !HOVER) {
      strong = Math.max(strong, clamp((w.slipSpeed - 2) / 20, 0, 0.6));
      if (w.surface > 0) weak = Math.max(weak, clamp(Math.abs(veh.forwardSpeed) / 30, 0, 0.5));
    }
    if (veh.fuelCut) strong = Math.max(strong, 0.45);
    weak += clamp(veh.rpm() / 6200, 0, 1) * 0.08 * (veh.running ? 1 : 0);
    if (BIG && !ROADCC && veh.running && !ENG_SND.ev) { weak = Math.max(weak, 0.25 + 0.35 * clamp(veh.thrEff, 0, 1)); strong = Math.max(strong, 0.3 * clamp(veh.thrEff, 0, 1) + (DRAGSTER ? 0.4 * clamp(veh.gLong / 4, 0, 1) : 0)); }
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
    $('gmeter').style.display = showGauge && !RACE.on ? '' : 'none';
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
      { html: '<b>' + CARDEF.short + '</b>' + (DEMON ? ' · ' + (S.fuel === 'e10' ? '91 oct' : 'E85') : DRAGPAK ? ' · race gas' : MONSTER || KART || MOWER || CC ? ' · ' + CARDEF.car : PULLER ? ' · ' + VEH.CARS.puller.engines[CARDEF.engine].short : DRAGSTER ? (NITRO ? ' · nitro' : ' · methanol') : '') },
      { html: CC ? CCD.trans : MOWER ? (CARDEF.cls === 'bp' ? '5-speed transaxle · foot clutch' : CARDEF.cls === 'fx' ? 'Centrifugal clutch · 3-speed · chain' : '6-speed + quickshifter · chain')
        : KART ? (CARDEF.cls === 'kz' ? '6-speed sequential · chain drive' : CARDEF.cls === 'sc' ? '6-speed + quickshifter · chain drive' : 'Centrifugal clutch · chain drive') : MONSTER ? '2-speed · 4x4 · lockers' : PULLER ? 'Slider clutch · 3-speed planetary' : DRAGSTER ? (NITRO ? 'Direct drive · 6-disc clutch' : '2-speed · 5-disc clutch') : veh.transType === 'auto' ? (DRAGPAK ? '3-speed race auto' : '8HP90 auto') : 'TR-6060 manual' + (veh.useClutchPedal ? ' · pedal' : '') },
      { html: OFFROAD() ? (PKG_KIND() === 'knobby' ? 'Off-road knobbies' : PKG_KIND() === 'paddle' ? 'Sand paddles' : PKG_UI[0]) : CC ? (ccTyre() ? ccTyre()[2] : CCD.tyres) : MOWER ? (CARDEF.cls === 'bp' ? 'Turf tyres' : CARDEF.cls === 'fx' ? 'Kart dirt tyres' : 'Racing slicks') : KART ? (CARDEF.cls === 'rental' ? 'Hard rental tyres' : 'Kart slicks') : MONSTER ? '66x43.00-25 paddles' : PULLER ? '30.5L-32 pulling tyres' : DRAGSTER ? (NITRO ? '36x17.5 slicks' : '34.5x17 slicks') : veh.spec.rearTire === 'drag' ? 'Drag radials' : veh.spec.rearTire === 'etstreet' ? 'ET Street R' : veh.spec.rearTire === 'etdragpro' ? 'ET Drag Pro' : veh.spec.rearTire === 'etdrag' ? 'ET Drag slicks' : 'P Zero' },
      { html: input.source === 'wheel' ? 'Wheel' : 'Keyboard' },
    ];
    if (MONSTER) chips.push({ html: '4WS <b>' + S.rsMode.toUpperCase() + '</b>' });
    if (FREESTYLE) chips.push({ html: 'FREESTYLE <b>' + Math.round(FS.score).toLocaleString() + '</b>' });
    if (MOWTRACK && LAP.armed) chips.push({ html: 'LAP ' + (LAP.n + 1) + ' <b>' + (veh.time - LAP.t0).toFixed(1) + '</b>' + (S.mowBest && S.mowBest[TKEY] ? ' · best ' + S.mowBest[TKEY].toFixed(2) : '') });
    if (TRKMAP && LAP.armed) { const b = S.lapBest && S.lapBest[S.map] && S.lapBest[S.map][TKEY]; chips.push({ html: 'LAP ' + (LAP.n + 1) + ' <b>' + (veh.time - LAP.t0).toFixed(1) + '</b>' + (b ? ' · best ' + lapFmt(b) : '') }); }
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
    raceHud(dt);
    if (ONLINE.net && ONLINE.net.code) chips.push({ html: 'ONLINE <b>' + ONLINE.net.code + '</b> · ' + (ONLINE.ghosts.size + 1) + (ONLINE.ghosts.size ? ' drivers' : ' (waiting for friends)') });
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
  // ------------------------------------------------------------------ Mower Track lap timer
  // A lap counts when the car crosses the start / finish line (z = 0 on the front straight) heading up the straight, having
  // been round the far turn since the last time; the first crossing starts the clock. Best laps are kept per vehicle / class
  const LAP = { armed: false, far: false, t0: 0, n: 0, last: 0, prevZ: null, prevS: null, cp: 0 };
  // (the closed-loop tracks: the line is the start of the course's own centre line - a lap counts crossing it going the right
  // way having passed a third and two thirds of the way round, in that order, since the last crossing)
  const lapFmt = (t) => t >= 60 ? Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0') : t.toFixed(2);
  function trackLap() {
    const T = W.track, q = LAP.q || (LAP.q = {});
    W.trackQuery(veh.px, veh.pz, q);
    if (q.i < 0 || q.d > T.W / 2 + 8) { LAP.prevS = null; return; }       // (off in the scenery)
    const s = q.s, L = T.L;
    if (s > 0.3 * L && s < 0.45 * L && !LAP.cp) LAP.cp = 1;
    if (s > 0.6 * L && s < 0.75 * L && LAP.cp === 1) LAP.cp = 2;
    if (LAP.prevS !== null && LAP.prevS > L - 40 && s < 40 && veh.vx * q.tx + veh.vz * q.tz > 0) {
      const now = veh.time;
      if (LAP.armed && LAP.cp === 2) {
        const t = now - LAP.t0; LAP.n++; LAP.last = t;
        S.lapBest = S.lapBest || {}; const B = S.lapBest[S.map] = S.lapBest[S.map] || {};
        const best = B[TKEY], pb = !best || t < best;
        if (pb) { B[TKEY] = t; saveS(); }
        hud.toast(`Lap ${LAP.n}: ${lapFmt(t)}${pb ? (best ? ' · NEW BEST' : '') : ' · best ' + lapFmt(best)}`, 3);
      } else if (!LAP.armed) hud.toast('Lap timing on - go!', 1.6);
      LAP.armed = true; LAP.cp = 0; LAP.t0 = now;
    }
    LAP.prevS = s;
  }
  function lapUpdate() {
    if (TRKMAP && G.started && !OFFMODE) return trackLap();
    if (!MOWTRACK || !G.started) return;
    const M = W.MOWT, z = veh.pz, onStraight = Math.abs(veh.px - M.R) < M.W / 2 + 1;
    if (z < -M.SL - M.R * 0.6) LAP.far = true;
    if (LAP.prevZ !== null && LAP.prevZ > 0 && z <= 0 && onStraight && veh.vz < 0) {
      const now = veh.time;                                 // (physics time: the menu doesn't run the clock)
      if (LAP.armed && LAP.far) {
        const t = now - LAP.t0; LAP.n++; LAP.last = t;
        S.mowBest = S.mowBest || {};
        const best = S.mowBest[TKEY], pb = !best || t < best;
        if (pb) { S.mowBest[TKEY] = t; saveS(); }
        hud.toast(`Lap ${LAP.n}: ${t.toFixed(2)} s${pb ? (best ? ' · NEW BEST' : '') : ' · best ' + best.toFixed(2)}`, 3);
      } else if (!LAP.armed) hud.toast('Lap timing on - go!', 1.6);
      LAP.armed = true; LAP.far = false; LAP.t0 = now;
    }
    LAP.prevZ = z;
  }
  function arenaUpdate(dt) {
    if (!FREESTYLE) return;
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
    if (ARENAMAP) {
      for (const w of Wh) if (w.contact) crushAt(w.cpx, w.cpz, w.Fz);
      const bh = veh.bodyHits || [];
      for (let i = 0; i < bh.length; i += 3) crushAt(bh[i], bh[i + 1], bh[i + 2]);
    }
    if (world.arena) world.arena.update(dt);
    // fresh cars once they're all flat and the truck is well clear of the pile
    if (ARENAMAP && FS.crushed.size === W.ARENA_CARS.length && Math.hypot(veh.px - W.ARENA_CARS[0].x, veh.pz) > 30) { W.arenaResetCars(); FS.crushed.clear(); hud.toast('The crew hauls in fresh junk cars', 2.5); }
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
  // ------------------------------------------------------------------ online play (net.js)
  // One of you hosts a room (a 5-letter code), the others join it; everyone drives their own car (any car) on the host's
  // map. Each game runs its own car and sends its pose ~10 times a second; the others' cars are drawn from those, ~130 ms
  // behind real time so there's always a pose either side to blend between (a little ahead of the last one on a
  // hiccup). They're solid - you can bump them (each game pushes its own car out) - their engines play from where they
  // are, and their names float over them
  const ONLINE = { net: null, ghosts: new Map(), pending: {}, sendT: 0, profT: 0, lastProf: '', boxes: [], busy: false, status: '', err: '', reloading: false,
    hostMap: S.map, carT: 0, lastCar: '', hitOut: {}, lastPub: 0 };
  const NET_DELAY = 130, NET_SEND = 0.1, VOICES = 4;
  if (!S.netName) { S.netName = 'Driver ' + Math.floor(100 + Math.random() * 900); saveS(); }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inRoom = () => !!(ONLINE.net && ONLINE.net.code);
  // (in a room the host picks the car too: the others can't change it, or its setup)
  function carLocked(silent) {
    if (!inRoom() || ONLINE.net.isHost) return false;
    if (!silent) hud.toast('Online: the host picks the car', 2.5);
    return true;
  }
  // the host's car and its setup, as it goes out with the room: the car, its version / class / engine, the Demon's
  // fuel, the transmission, the tyres, the off-road package and the Fun-tab tune (no undefined: the database won't take it)
  function carSetup() {
    const m = MORE_CARS.find((x) => x.id === S.car);
    return JSON.parse(JSON.stringify({ c: S.car, o: m && m.optKey ? S[m.optKey] || '' : '', fuel: S.fuel, trans: S.trans, rear: S.rearTire, dp: S.dpRear || 'etdrag', off: (S.offroad && S.offroad[S.car]) || false, tune }));
  }
  // (a joiner's own car, kept while they drive the host's, back when they leave)
  const OWN_KEYS = ['car', 'fuel', 'trans', 'rearTire', 'dpRear', 'offroad', 'tcMode'].concat(MORE_CARS.filter((m) => m.optKey).map((m) => m.optKey));
  function ownCarKeep() { if (!S.netOwn) S.netOwn = JSON.parse(JSON.stringify(OWN_KEYS.reduce((o, k) => { o[k] = S[k]; return o; }, {}))); }
  // (the host's tune goes on the car live; your own tune for it stays saved as it was)
  let tuneOwnKept = false;
  function hostTune(t) {
    if (!t) return;
    if (!tuneOwnKept) { tuneOwnKept = true; S.tune[TKEY] = JSON.parse(JSON.stringify(tune)); }
    Object.assign(tune, tuneDefaults(), t); applyTune();
  }
  function ownCarBack() {
    const own = S.netOwn;
    if (tuneOwnKept) { Object.assign(tune, tuneDefaults(), S.tune[TKEY]); S.tune[TKEY] = tune; tuneOwnKept = false; applyTune(); }
    if (!own) return;
    delete S.netOwn;
    const m = MORE_CARS.find((x) => x.id === own.car), k = m && m.optKey;
    const restart = own.car !== S.car || (k && own[k] && own[k] !== S[k]) || (own.car === 'demon' && own.fuel !== S.fuel);
    for (const key of OWN_KEYS) if (own[key] !== undefined) S[key] = own[key];
    saveS();
    if (restart) { hud.toast('Back in your own car…', 2.5); setTimeout(() => location.reload(), 900); }
    else { applyVehicleSettings(); veh.tcMode = S.tcMode; }
  }
  // a joiner follows the host: their course, and their car set up their way. Changes that need a restart (the course,
  // the car, its version, the Demon's fuel) reload the game - it rejoins by itself; the rest goes on live
  function followHost(m) {
    if (!inRoom() || !m) return;
    let why = '';
    if (ONLINE.net.isHost) {
      const oc = OFFMODE ? OFF_CODE : null;
      // (the host's map is the room's - and course; not while this page is on its way to a new one)
      if (!ONLINE.reloading && ((m.map && m.map !== S.map) || (OFFMODE && m.off !== oc))) ONLINE.net.setMap(S.map, oc);
    } else {
      if (m.map && m.map !== S.map) { S.map = m.map; why = 'the ' + (MAP_NAMES[m.map] || m.map); }
      // (an offroad race: the host's course, from its code)
      if (GMODES[m.map] && m.off && m.off !== (OFFMODE && W.map === m.map ? OFF_CODE : '')) { const c = GMODES[m.map].parse(m.off); if (c) { S[GMODES[m.map].key] = c; if (!why) why = 'the host\'s ' + GMODES[m.map].what; } }
      const cs = m.car;
      if (cs && cs.c && (VEH.CARS[cs.c] || MORE_IDS.includes(cs.c))) {
        ownCarKeep();
        const mm = MORE_CARS.find((x) => x.id === cs.c), k = mm && mm.optKey;
        const restart = cs.c !== S.car || (k && cs.o && S[k] !== cs.o) || (cs.c === 'demon' && cs.fuel && S.fuel !== cs.fuel);
        if (restart) {
          // (a car that starts on its own traction-control mode starts on it here too)
          const o = mm && mm.options ? mm.options.find((x) => x[0] === cs.o) : null;
          S.tcMode = o && o[4] !== undefined ? o[4] : mm && mm.tc !== undefined ? mm.tc : S.tcMode;
        }
        S.car = cs.c; if (k && cs.o) S[k] = cs.o;
        if (cs.fuel) S.fuel = cs.fuel;
        if (cs.trans) S.trans = cs.trans;
        if (cs.rear) S.rearTire = cs.rear;
        if (cs.dp) S.dpRear = cs.dp;
        S.offroad = Object.assign({}, S.offroad, { [cs.c]: typeof cs.off === 'string' ? cs.off : !!cs.off });
        if (restart) why = (why ? why + ' and ' : '') + 'the host\'s ' + carLabel(cs.c, cs.o);
        else if (!why && !ONLINE.reloading) { hostTune(cs.tune); applyVehicleSettings(); if (G.menu) renderMenu(); }
      }
    }
    if (!why) return;
    saveS();
    if (ONLINE.reloading) return;
    ONLINE.reloading = true;
    hud.toast('Following the host: loading ' + why + '…', 3);
    setTimeout(() => location.reload(), 900);
  }
  // (in a room the host picks the map)
  function mapLocked() {
    if (!inRoom() || ONLINE.net.isHost) return false;
    hud.toast('Online: the host picks the map', 2.5);
    return true;
  }
  const optOf = () => CARDEF.engine || CARDEF.cls || '';
  function carLabel(id, opt) {
    const m = MORE_CARS.find((x) => x.id === id), o = m && m.options ? m.options.find((x) => x[0] === opt) : null;
    const d = VEH.CARS[id];
    return (m ? m.btn || m.name : d ? d.short || d.name : id) + (o ? ' ' + o[1] : '');
  }
  function netProfile() {
    return { n: String(S.netName || 'Driver').slice(0, 16), c: S.car, o: optOf(), p: S.paint, tf: tireF(), tr: tireR(), js: JET ? +jetSize().toFixed(2) : 1, cd: +(sp.cgDrop || 0).toFixed(3) };
  }
  // (paint, tyres, a tune that grows the jet: sent when they change)
  function netProfileSync() {
    if (!inRoom()) return;
    const p = netProfile(), k = JSON.stringify(p);
    if (k !== ONLINE.lastProf) { ONLINE.lastProf = k; ONLINE.net.setProfile(p); }
  }
  const netErr = (e) => {
    const m = String((e && e.message) || e);
    return /permission|denied/i.test(m) ? 'Firebase refused it - have the database rules been published?'
      : /admin-restricted|operation-not-allowed/i.test(m) ? 'Anonymous sign-in is off in the Firebase project (Authentication → Sign-in method)'
        : /network|fetch|import|load/i.test(m) ? 'Could not reach Firebase - check your internet connection' : m;
  };
  function netCreate() {
    if (ONLINE.net) return ONLINE.net;
    ONLINE.net = window.HCNet.create({
      onStatus: (m) => { ONLINE.status = m; if (G.menu && curTab === 'Online') renderMenu(); netTitle(); },
      onMeta: (m) => { raceMeta(m); followHost(m); },
      onRoomGone: () => { hud.toast('The room has closed', 3); onlineLeave(); },
      onPlayer: (uid, prof) => ghostProfile(uid, prof),
      onLeave: (uid) => ghostRemove(uid, true),
      onState: (uid, st) => {
        if (!Array.isArray(st)) return;
        const g = ONLINE.ghosts.get(uid);
        if (!g) { ONLINE.pending[uid] = st; return; }
        const sn = g.snaps;
        if (sn.length && st[0] <= sn[sn.length - 1][0]) return;             // (out of order)
        sn.push(st); if (sn.length > 30) sn.splice(0, sn.length - 30);
        hitsIn(g, st);
      },
    });
    return ONLINE.net;
  }
  async function onlineHost() {
    if (ONLINE.busy) return;
    ONLINE.busy = true; ONLINE.err = ''; renderOnlineIfOpen();
    try {
      const net = netCreate(), map = MAP_NAMES[ONLINE.hostMap] ? ONLINE.hostMap : S.map;
      await net.hostRoom(map, netProfile(), modeCode(map));
      ONLINE.lastProf = JSON.stringify(netProfile());
      S.netRoom = net.code; saveS();
      if (map !== S.map) {
        // (not on it yet: load it - the room's rejoined after the reload)
        ONLINE.reloading = true; S.map = map; saveS();
        hud.toast('Room ' + net.code + ' is open - loading the ' + MAP_NAMES[map] + '…', 4);
        setTimeout(() => location.reload(), 1200);
      } else hud.toast('Room ' + net.code + ' is open - give your friends the code', 5);
    } catch (e) { ONLINE.err = netErr(e); console.warn(e); }
    ONLINE.busy = false; renderOnlineIfOpen(); netTitle();
  }
  async function onlineJoin(code, auto) {
    if (ONLINE.busy) return;
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(code)) { ONLINE.err = 'Room codes are 5 letters / numbers'; renderOnlineIfOpen(); return; }
    ONLINE.busy = true; ONLINE.err = ''; renderOnlineIfOpen();
    try {
      const net = netCreate();
      const meta = await net.joinRoom(code, netProfile());
      ONLINE.lastProf = JSON.stringify(netProfile());
      S.netRoom = net.code; saveS();
      followHost(meta);
      if (!auto && !ONLINE.reloading) hud.toast('Joined room ' + net.code, 3);
    } catch (e) {
      ONLINE.err = netErr(e); console.warn(e);
      if (auto) { S.netRoom = null; saveS(); hud.toast('Couldn\'t rejoin room ' + code + ': ' + ONLINE.err, 5); }
    }
    ONLINE.busy = false; renderOnlineIfOpen(); netTitle();
  }
  async function onlineLeave() {
    S.netRoom = null; saveS(); RACE.go = null; RACE.hold = null; ONLINE.lastCar = '';
    for (const uid of [...ONLINE.ghosts.keys()]) ghostRemove(uid, false);
    if (ONLINE.net) { try { await ONLINE.net.leaveRoom(); } catch (e) { /* offline */ } }
    ownCarBack();
    renderOnlineIfOpen(); netTitle();
  }
  function renderOnlineIfOpen() { if (G.menu && curTab === 'Online') renderMenu(); }

  // ---- the other players' cars
  const TIRE_OK = (t) => (t && VEH.TIRES[t] ? t : null);
  function setTag(g, name) {
    g.name = name;
    if (g.tag) { scene.remove(g.tag); g.tag.material.map.dispose(); g.tag.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    x.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    const w = Math.min(250, x.measureText(name).width + 30);
    x.fillStyle = 'rgba(10,10,12,0.7)'; x.fillRect(128 - w / 2, 10, w, 46);
    x.fillStyle = '#e8313a'; x.fillRect(128 - w / 2, 52, w, 4);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    spr.scale.set(2.6, 0.65, 1); spr.renderOrder = 20; spr.visible = false; scene.add(spr);
    g.tag = spr;
  }
  function disposeTree(o) {
    o.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mt of mats) { if (mt.map) mt.map.dispose(); mt.dispose(); }
    });
  }
  function ghostProfile(uid, prof) {
    if (!prof || typeof prof !== 'object') return;
    prof.n = String(prof.n || 'Driver').slice(0, 16);
    let g = ONLINE.ghosts.get(uid);
    const key = [prof.c, prof.o, prof.tf, prof.tr].join('|');
    if (g && g.key === key) {
      if (g.prof.p !== prof.p) g.model.setPaint(prof.p);
      if (g.model.setJetSize) g.model.setJetSize(prof.js || 1);
      if (g.name !== prof.n) setTag(g, prof.n);
      g.prof = prof;
      renderOnlineIfOpen();
      return;
    }
    const snaps = g ? g.snaps : ONLINE.pending[uid] ? [ONLINE.pending[uid]] : [];
    delete ONLINE.pending[uid];
    if (g) ghostRemove(uid, false); else hud.toast(prof.n + ' joined', 3);
    try {
      const def = defOf(prof.c, prof.o);
      const gv = new VEH.Vehicle({ C: W.C, ground: W.ground, collidersNear: (x, z, r, c, b) => { c.length = 0; b.length = 0; } }, Object.assign({}, def.spec));
      const tf = TIRE_OK(prof.tf) || gv.spec.frontTire, tr = TIRE_OK(prof.tr) || gv.spec.rearTire;
      gv.setTires(tf, tr);
      const model = buildModel(prof.c, def, gv.spec, prof.p);
      model.setTires(tf, tr); model.setPaint(prof.p);
      if (model.setInteriorVisible) model.setInteriorVisible(true, false);
      if (model.setJetSize) model.setJetSize(prof.js || 1);
      // (no headlight spot lights on the others' cars: a light joining the scene recompiles every material - a hitch)
      const lights = []; model.root.traverse((o) => { if (o.isLight) lights.push(o); });
      for (const l of lights) l.parent.remove(l);
      if (Array.isArray(model.headlights)) model.headlights.length = 0;
      model.root.visible = false;
      scene.add(model.root);
      const flm = new FX.Flames(THREE, model.root, model.exhaustTips || []);
      g = { uid, prof, key, def, gv, model, flm, snaps, spin: [0, 0, 0, 0], ev: null, voice: null, hitIn: null, hitQ: [], localHitT: 0, softT: 0, snd: engSndFor(prof.c, def), emit: [0, 0, 0, 0], big: !!CC_CARS[prof.c] || ['puller', 'dragster', 'monster', 'avenger', 'kart', 'mower'].includes(prof.c), dist: 1e9, box: null };
      setTag(g, prof.n);
      ONLINE.ghosts.set(uid, g);
    } catch (e) { console.warn('could not build the other car', prof, e); }
    renderOnlineIfOpen();
  }
  function ghostRemove(uid, announce) {
    const g = ONLINE.ghosts.get(uid);
    if (!g) return;
    ONLINE.ghosts.delete(uid);
    scene.remove(g.model.root); disposeTree(g.model.root);
    if (g.tag) { scene.remove(g.tag); g.tag.material.map.dispose(); g.tag.material.dispose(); }
    if (g.voice) g.voice.remove();
    if (announce) hud.toast(g.prof.n + ' left', 3);
    renderOnlineIfOpen();
  }

  // ---- the pose we send: [t, x, y, z, qx, qy, qz, qw, vx, vy, vz, steer, rearSteer, s0-3, omega0-3, rpm, load, throttle,
  // boost, flags, shifts, pops, jetN, afterburner, chute, points, bumps given { uid: [impulse x, z (running totals), contact
  // x, z, when] } or 0, (when there's smoke: 7 numbers a wheel)]
  const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000, r4 = (x) => Math.round(x * 1e4) / 1e4;
  function netState() {
    const fl = (veh.input.brake > 0.04 || veh.lineLockActive ? 1 : 0) | (veh.gear < 0 && !veh.park ? 2 : 0) | (G.lightsOn || world.preset === 'night' ? 4 : 0)
      | (veh.running ? 8 : 0) | (G.horn ? 16 : 0) | (veh.nosActive ? 32 : 0) | (veh.cranking ? 64 : 0) | (veh.fuelCut ? 128 : 0);
    const load = veh.running ? clamp(veh.thrEff * veh.tcCut * veh.escCut * (veh.shiftCut || 1), 0, 1) : 0;
    const a = [Math.round(ONLINE.net.serverNow()), r2(veh.px), r2(veh.py), r2(veh.pz), r4(veh.qx), r4(veh.qy), r4(veh.qz), r4(veh.qw), r2(veh.vx), r2(veh.vy), r2(veh.vz),
      r3(veh.steerAngle), r3(veh.rearSteerAngle || 0)];
    for (const w of veh.wheels) a.push(r3(w.s));
    for (const w of veh.wheels) a.push(Math.round(w.omega * 10) / 10);
    a.push(Math.round(veh.rpm()), r2(load), r2(veh.input.throttle), Math.round(veh.boost * 10) / 10, fl, veh.events.shift, veh.events.backfire, r2(veh.jetN || 0), r2(veh.jetAB || 0), r2(veh.chuteInfl || 0),
      Math.round(RACE.pts), Object.keys(ONLINE.hitOut).length ? ONLINE.hitOut : 0);
    if (G.smk.some((m) => m[0] > 0.5)) for (const m of G.smk) a.push(Math.round(m[0]), r2(m[1]), r2(m[2]), r2(m[3]), r2(m[4]), r2(m[5]), r2(m[6]));
    return a;
  }

  // ---- bumps between cars. Each game moves only its own car, and a car that hits another is stopped against it in its own
  // game before the other game ever sees it arrive - so the car that was hit never got pushed. Now whichever game works
  // a bump out sends the other car its share (equal and opposite, at the contact point) with its state: running totals
  // per car, so a lost or merged update loses nothing. The other game gives it to its car when the hit shows on its
  // screen (the same ~130 ms behind as the cars), unless it worked the same bump out itself (then it's already had it)
  function hitsOut() {
    for (const b of ONLINE.boxes) {
      if (!b.jx && !b.jz) continue;
      const g = ONLINE.ghosts.get(b.uid);
      // (and till their car shows it moving off, it only keeps us out of it - one bump, one push)
      if (g) { g.localHitT = 0.4; g.softT = Math.max(g.softT, 0.35); }
      const h = ONLINE.hitOut[b.uid] || (ONLINE.hitOut[b.uid] = [0, 0, 0, 0, 0]);
      h[0] = r2(h[0] - b.jx); h[1] = r2(h[1] - b.jz); h[2] = r2(b.cx); h[3] = r2(b.cz); h[4] = Math.round(ONLINE.net.serverNow());
      if (performance.now() - ONLINE.lastPub > 40) ONLINE.sendT = 0;       // (out now, not at the next tick)
    }
  }
  function hitsIn(g, st) {
    const e = st[32] && typeof st[32] === 'object' ? st[32][ONLINE.net.uid] : null;
    if (!e) { if (!g.hitIn) g.hitIn = [0, 0]; return; }
    if (!g.hitIn) { g.hitIn = [e[0], e[1]]; return; }          // (first sight: what came before isn't ours to feel)
    const dx = e[0] - g.hitIn[0], dz = e[1] - g.hitIn[1];
    g.hitIn = [e[0], e[1]];
    if (dx || dz) g.hitQ.push([dx, dz, e[2], e[3], e[4]]);
  }
  function hitsApply(g, dt) {
    g.localHitT -= dt; g.softT -= dt;
    const now = ONLINE.net.serverNow() - NET_DELAY;
    while (g.hitQ.length && g.hitQ[0][4] <= now) {
      const [jx, jz, cx, cz] = g.hitQ.shift();
      if (g.localHitT > 0) continue;
      veh.pushAt(jx, jz, cx, cz);
      g.softT = 0.4;           // (and its box just keeps them apart for a moment - no second push for the same bump)
    }
  }

  // ---- every frame: send ours, draw theirs
  const _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion(), _gv = new THREE.Vector3(), _gu = new THREE.Vector3();
  function onlineTick(dt) {
    if (inRoom()) hitsOut();
    if (inRoom()) {
      ONLINE.sendT -= dt;
      if (ONLINE.sendT <= 0 && G.started) { ONLINE.sendT = NET_SEND; ONLINE.lastPub = performance.now(); ONLINE.net.publish(netState()); }
      ONLINE.profT -= dt;
      if (ONLINE.profT <= 0) { ONLINE.profT = 2; netProfileSync(); }
      ONLINE.carT -= dt;
      if (ONLINE.carT <= 0 && ONLINE.net.isHost) {
        ONLINE.carT = 1;
        const cs = carSetup(), k = JSON.stringify(cs);
        if (k !== ONLINE.lastCar) { ONLINE.lastCar = k; ONLINE.net.setCar(cs); }
      }
    }
    ONLINE.boxes.length = 0;
    hud.mmPlayers = null;
    if (!ONLINE.ghosts.size) return;
    const now = ONLINE.net.serverNow() - NET_DELAY, night = world.preset === 'night', dots = [];
    const cp = camera.position;
    for (const g of ONLINE.ghosts.values()) {
      const sn = g.snaps;
      if (!sn.length) { g.model.root.visible = false; g.tag.visible = false; continue; }
      while (sn.length > 2 && sn[1][0] <= now) sn.shift();
      let A = sn[0], B = sn.length > 1 ? sn[1] : null, u = 0, ext = 0;
      if (B && now >= B[0]) { A = B; B = null; }
      if (B) u = clamp((now - A[0]) / Math.max(1, B[0] - A[0]), 0, 1);
      else ext = clamp((now - A[0]) / 1000, 0, 0.35);
      const L = (k) => (B ? A[k] + (B[k] - A[k]) * u : A[k]), N = B || A;
      const x = L(1) + A[8] * ext, y = L(2) + A[9] * ext, z = L(3) + A[10] * ext;
      _gq.set(A[4], A[5], A[6], A[7]).normalize();
      if (B) _gq.slerp(_gq2.set(B[4], B[5], B[6], B[7]).normalize(), u);
      const m = g.model, gv = g.gv, cd = g.prof.cd || 0;
      hitsApply(g, dt);
      m.root.visible = true;
      m.root.position.set(x, y, z); m.root.quaternion.copy(_gq);
      if (cd) m.root.position.add(_gv.set(0, cd, 0).applyQuaternion(_gq));
      const steer = L(11), rs = L(12);
      for (let i = 0; i < 4; i++) {
        const w = gv.wheels[i], vw = m.wheels[i];
        if (!vw) continue;
        vw.corner.position.set(w.mx, w.my - L(13 + i), w.mz);
        vw.corner.rotation.y = -(i < 2 ? steer : rs);
        g.spin[i] = (g.spin[i] + L(17 + i) * dt) % (Math.PI * 2);
        vw.spin.rotation.x = vw.left ? g.spin[i] : -g.spin[i];
      }
      if (m.afterWheels) m.afterWheels();
      if (m.setRider) m.setRider(Math.hypot(A[8], A[10]));
      if (m.steerWheel) m.steerWheel.rotation.z = -steer * (gv.spec.steerRatio || 14);
      const fl = N[25] | 0;
      m.setLights({ brake: !!(fl & 1), reverse: !!(fl & 2), headlights: !!(fl & 4), night });
      if (m.setChute) m.setChute(L(30) > 0.01, L(30), 1);
      if (m.setJet) m.setJet(L(28), L(29), L(22), dt);
      // pops and gear changes since the last pose
      if (!g.ev) g.ev = [N[26], N[27]];
      if (N[27] > g.ev[1]) { g.flm.pop(1); if (g.voice) g.voice.event('pop', 0.9); }
      if (N[26] > g.ev[0] && g.voice) g.voice.event('shift');
      g.ev[0] = N[26]; g.ev[1] = N[27];
      g.flm.update(dt);
      // the name over it
      const top = (gv.spec.bodyTop || 1) + 1.0;
      g.dist = Math.hypot(x - cp.x, y - cp.y, z - cp.z);
      g.tag.visible = g.dist < 450 && G.started;
      g.tag.position.set(x, y + top, z);
      g.tag.scale.set(2.6, 0.65, 1).multiplyScalar(1 + clamp((g.dist - 30) / 200, 0, 1.5));
      // solid: a box on its footprint, moving with it (only when it's at our height - you can jump over one)
      const fx = -2 * (_gq.x * _gq.z + _gq.y * _gq.w), fz = -(1 - 2 * (_gq.x * _gq.x + _gq.y * _gq.y)), fln = Math.hypot(fx, fz) || 1;
      if (Math.abs(y - veh.py) < 2.5) {
        const zc = (gv.spec.bodyFront + gv.spec.bodyRear) / 2;
        const soft = g.softT > 0;
        ONLINE.boxes.push({ x: x - fx / fln * zc, z: z - fz / fln * zc, hx: gv.spec.bodyHalfW, hz: (gv.spec.bodyRear - gv.spec.bodyFront) / 2, c: fz / fln, s: fx / fln,
          vx: soft ? veh.vx : L(8), vz: soft ? veh.vz : L(10), m: gv.spec.mass, ghost: true, uid: g.uid });
      }
      dots.push({ x, z });
      // its tyre smoke
      if (N.length > 33 && G.started) {
        const bud = smoke.budget;
        for (let i = 0; i < 4; i++) {
          const k = 33 + i * 7, small = S.dust === 'small', rate = N[k] * (small ? DUST_SMALL.rate : 1);
          if (!(rate > 0.5)) continue;
          g.emit[i] += rate * dt * bud;
          if (g.emit[i] < 1) continue;
          m.wheels[i].corner.getWorldPosition(_gv);
          // (a landspeeder's wash over a lake comes off the water, not the bed)
          const gy = gv.spec.hover && W.hasWater ? Math.max(groundH(_gv.x, _gv.z), W.C.WATER_LEVEL) : groundH(_gv.x, _gv.z); smoke.setGround(gy);
          while (g.emit[i] >= 1) {
            g.emit[i] -= 1;
            smoke.emit(_gv.x + (Math.random() - 0.5) * 0.3, gy + 0.15 + Math.random() * 0.1, _gv.z + (Math.random() - 0.5) * 0.3,
              A[8] * 0.3 + (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * (0.8 + (small ? Math.min(N[k + 6], DUST_SMALL.up) : N[k + 6])), A[10] * 0.3 + (Math.random() - 0.5) * 1.2,
              (small ? Math.min(N[k + 2], DUST_SMALL.size) : N[k + 2]) * (0.8 + Math.random() * 0.4), small ? Math.min(N[k + 4], DUST_SMALL.grow) : N[k + 4],
              (small ? Math.min(N[k + 5], DUST_SMALL.life) : N[k + 5]) * (0.7 + Math.random() * 0.6), small ? Math.min(N[k + 1], DUST_SMALL.alpha) : N[k + 1], N[k + 3]);
          }
        }
      }
      g.st = { rpm: L(21), load: L(22), thr: L(23), boost: L(24), fl, ab: L(29), sq: N.length > 33 ? clamp(Math.max(N[33], N[40], N[47], N[54]) / 120, 0, 1) : 0 };
    }
    hud.mmPlayers = dots;
    // their engines: the nearest few get a voice of their own, placed where the car is
    if (audio.ready) {
      const f = _gv.set(0, 0, -1).applyQuaternion(camera.quaternion), up = _gu.set(0, 1, 0).applyQuaternion(camera.quaternion);
      audio.setListener(cp.x, cp.y, cp.z, f.x, f.y, f.z, up.x, up.y, up.z);
      const near = [...ONLINE.ghosts.values()].filter((g) => g.st && g.model.root.visible && g.dist < 400).sort((a, b) => a.dist - b.dist).slice(0, VOICES);
      for (const g of ONLINE.ghosts.values()) {
        if (!near.includes(g)) { if (g.voice) { g.voice.remove(); g.voice = null; } continue; }
        if (!g.voice) g.voice = audio.addVoice();
        if (!g.voice) continue;
        const p = g.model.root.position; g.voice.at(p.x, p.y, p.z);
        g.voice.update(voiceParams(g));
      }
    }
  }
  function voiceParams(g) {
    const st = g.st, snd = g.snd, id = g.prof.c, dp = id === 'dragpak', dm = id === 'demon', bm = g.gv.spec.boostMax || 0;
    return { rpm: st.rpm, load: st.load, thr: st.thr, cut: st.fl & 128 ? 1 : 0, boost: st.boost, run: st.fl & 8 ? 1 : 0, crank: st.fl & 64 ? 1 : 0,
      // (a landspeeder's dust isn't tyre smoke: no squeal from it)
      squeal: g.gv.spec.hover ? 0 : st.sq, sqPitch: 0.5, spin: g.gv.spec.hover ? 0 : st.sq * 0.8, speed: 0, surf: 0, interior: 0, horn: st.fl & 16 ? 1 : 0, vol: S.vol, engVol: S.engVol, fxVol: S.fxVol * 0.7,
      rough: snd.rough || 0, whine: g.big ? snd.whine : dp ? 1.7 : dm ? 1.45 : 1, rpmRef: g.big ? snd.rpmRef : dp ? 8800 : 6200, hum: 0,
      boostRef: Math.max(g.big ? bm : dp ? 24 : 11.6, bm), race: g.big ? snd.race : dp ? 1 : 0,
      nEng: snd.nEng, cyl: snd.cyl, fmul: snd.fmul, deep: snd.deep, loud: snd.loud, open: snd.open, whK: snd.whK, whPure: snd.whPure,
      pipe: snd.pipe ? clamp((st.rpm - snd.pipe[0]) / (snd.pipe[1] - snd.pipe[0]), 0, 1) : 0, vt: snd.vt || 0, surge: snd.surge || 0, ev: snd.ev || 0,
      jet: snd.jet || 0, ab: st.ab, nos: st.fl & 32 ? 1 : 0, jsz: g.prof.js || 1, turbo: snd.turbo || 0, diesel: snd.diesel || 0, road: g.gv.spec.hover ? 0.3 : 1 };
  }
  // ---- racing in a room: points, invisible walls, a reset every 30 s
  // Points come for ground covered along the course: on the road, 1 a metre times a streak that builds the longer you
  // stay on it (+0.1 every 40 m, up to x3); off it, a quarter of that and the streak's gone. Going backwards earns
  // nothing, and the metres you gave up have to be made up again before any more come. Hitting a straw bale costs 100
  // (and the streak). Invisible walls a few metres off the road (just behind the bales on the mower tracks) follow your
  // own bit of the course, so there's no cutting across to another bit of it: the car's place on the course is followed
  // along the centre line from where it was - never jumping to whichever bit is nearest - so a shortcut can't count
  const RACE = { on: false, i: -1, s: 0, sd: 0, px: 0, pz: 0, tx: 0, tz: -1, prevS: null, debt: 0, pts: 0, streak: 1, streakM: 0, road: true,
    hayT: 0, hayOn: new Set(), flash: '', flashT: 0, resetT: -1e9, walls: [], go: null, hold: null, cd: '', goT: 0, saveT: 0, boardT: 0, savedP: -1,
    wR: 0, wL: 0, bumpT: 0 };
  const RESET_WAIT = 30, HAY_PTS = 100, STREAK_M = 40, STREAK_MAX = 3, OFF_RATE = 0.25;
  // (an offroad race: a reset whenever you like racing alone, every 10 s in a room)
  const resetWait = () => OFFMODE ? (inRoom() ? 10 : 0) : RESET_WAIT;
  const raceNow = () => (inRoom() ? ONLINE.net.serverNow() : Date.now());
  // (the walls: this far from the centre line - 10 m past the road's edge on the rally stages, well into the trees; 6 m
  // on the mower tracks, well behind the bales. Far enough out that going off costs you - the trees, the grass, a quarter
  // of the points - instead of being a guard rail to bounce along; still no way through to another bit of the course)
  const RACE_WD = CRS_T ? CRS_T.W / 2 + (CRS_T.kind === 'rally' ? 10 : CRS_T.kind === 'offroad' ? 12 : CRS_T.kind === 'uni' ? 4 : 6) : 0;
  function raceTrack(x, z) {
    const T = CRS_T, n = T.n, X = T.x, Z = T.z;
    const d2 = (k) => (X[k] - x) * (X[k] - x) + (Z[k] - z) * (Z[k] - z);
    let i = RACE.i;
    if (i < 0) { let b = 1e18; for (let k = 0; k < n; k++) { const d = d2(k); if (d < b) { b = d; i = k; } } }
    else {
      // (downhill along the line from last time: it follows the car round, and never jumps to another bit of the course -
      // at most ~24 m a frame, so a car that somehow jumps is left behind, off the course, and put back)
      let d = d2(i);
      for (let it = 0; it < 12; it++) {
        const a = i + 1 === n ? 0 : i + 1, b = i === 0 ? n - 1 : i - 1, da = d2(a), db = d2(b);
        if (da < d) { i = a; d = da; } else if (db < d) { i = b; d = db; } else break;
      }
    }
    RACE.i = i;
    // the nearest point on the segments either side of it
    let best = 1e18;
    for (const a of [i === 0 ? n - 1 : i - 1, i]) {
      const b = a + 1 === n ? 0 : a + 1, dx = X[b] - X[a], dz = Z[b] - Z[a];
      let t = ((x - X[a]) * dx + (z - Z[a]) * dz) / (dx * dx + dz * dz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = X[a] + dx * t, pz = Z[a] + dz * t, e = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (e >= best) continue;
      best = e;
      const tx = T.tx[a] * (1 - t) + T.tx[b] * t, tz = T.tz[a] * (1 - t) + T.tz[b] * t, l = Math.hypot(tx, tz) || 1;
      RACE.px = px; RACE.pz = pz; RACE.tx = tx / l; RACE.tz = tz / l; RACE.s = T.s[a] + (T.s[a + 1] - T.s[a]) * t;
    }
    RACE.sd = (x - RACE.px) * -RACE.tz + (z - RACE.pz) * RACE.tx;
  }
  // the walls either side, for the next physics step: 10 m thick, 60 m long, lined up with the course where the car is
  // (the inside of a tight turn: closer in, short of the turn's middle). They grip what scrapes them (mu 0.8)
  function raceWalls() {
    const R = CRS_T.R[RACE.i] || 1e4, inner = Math.max(CRS_T.W / 2 + 1.5, Math.min(RACE_WD, Math.abs(R) - 3)), tx = RACE.tx, tz = RACE.tz, HX = 5;
    RACE.walls.length = 0;
    for (const side of [1, -1]) {                       // (+1: on the right)
      const w = (side > 0 ? R < 0 : R > 0) ? inner : RACE_WD, o = w + HX;
      if (side > 0) RACE.wR = w; else RACE.wL = w;
      RACE.walls.push({ x: RACE.px - tz * side * o, z: RACE.pz + tx * side * o, hx: HX, hz: 30, c: tz, s: tx, mu: 0.8, wall: true });
    }
  }
  // touching a wall is rough going - no riding along it: the speed bleeds off fast and the car's thrown about (hops,
  // kicks in roll, pitch and yaw every ~0.2 s), the streak's gone
  function raceBump(dt) {
    RACE.bumpT -= dt;
    const a = carAxes(), fl = Math.hypot(a.fx, a.fz) || 1, rl = Math.hypot(a.rx, a.rz) || 1;
    const fX = a.fx / fl, fZ = a.fz / fl, rX = a.rx / rl, rZ = a.rz / rl;
    const zc = 0.5 * (sp.bodyFront + sp.bodyRear), hl = 0.5 * (sp.bodyRear - sp.bodyFront), hw = sp.bodyHalfW;
    const cx = veh.px - fX * zc, cz = veh.pz - fZ * zc;
    let mx = -1e9, mn = 1e9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = cx + rX * hw * sx + fX * hl * sz, z = cz + rZ * hw * sx + fZ * hl * sz;
      const lat = (x - RACE.px) * -RACE.tz + (z - RACE.pz) * RACE.tx;
      if (lat > mx) mx = lat; if (lat < mn) mn = lat;
    }
    if (mx < RACE.wR - 0.15 && mn > -RACE.wL + 0.15) return;
    const v = Math.hypot(veh.vx, veh.vz), k = Math.exp(-1.6 * dt);
    veh.vx *= k; veh.vz *= k;
    raceLost();
    if (RACE.bumpT > 0 || v < 2) return;
    RACE.bumpT = 0.12 + Math.random() * 0.16;
    const f = Math.min(1, v / 15);
    veh.vy += (0.5 + Math.random() * 0.8) * f;
    veh.wx += (Math.random() - 0.5) * 1.2 * f; veh.wz += (Math.random() - 0.5) * 1.2 * f; veh.wy += (Math.random() - 0.5) * 0.7 * f;
    G.shake = Math.max(G.shake, 0.2 + 0.2 * f); input.rumble(0.9, 0.9, 110);
    if (audio.ready) audio.event('impact', 0.4 + 0.8 * f);
    raceFlash('Off the course - hit the wall', 1.5);
  }
  // back on the course: the centre line where you are on it, facing the way it runs
  const raceSpot = () => ({ x: RACE.px, y: groundH(RACE.px, RACE.pz), z: RACE.pz, tx: RACE.tx, tz: RACE.tz });
  function raceLost() { RACE.streak = 1; RACE.streakM = 0; }
  function raceFlash(t, secs) { RACE.flash = t; RACE.flashT = secs || 2; }
  // (the course's straw bales, in 8 m cells, for the hay penalty)
  let HAY = null;
  function hayCells() {
    if (HAY) return HAY;
    HAY = new Map();
    const list = S.map === 'mowtrack' ? W.mowtrackBales() : W.trackProps().bales;
    list.forEach((b, k) => { const key = (Math.floor(b.x / 8) + 4096) * 8192 + Math.floor(b.z / 8) + 4096; let l = HAY.get(key); if (!l) HAY.set(key, l = []); l.push([k, b.x, b.z]); });
    return HAY;
  }
  function raceHay(dt) {
    RACE.hayT -= dt;
    const a = carAxes(), fl = Math.hypot(a.fx, a.fz) || 1, rl = Math.hypot(a.rx, a.rz) || 1;
    const fX = a.fx / fl, fZ = a.fz / fl, rX = a.rx / rl, rZ = a.rz / rl;
    // (the body's footprint, as the physics has it: the bales' colliders are 0.6 m round)
    const zc = 0.5 * (sp.bodyFront + sp.bodyRear), hl = 0.5 * (sp.bodyRear - sp.bodyFront), hw = sp.bodyHalfW, R = 0.6 + 0.08;
    const cx = veh.px - fX * zc, cz = veh.pz - fZ * zc, H = hayCells(), on = new Set();
    const i0 = Math.floor(cx / 8), j0 = Math.floor(cz / 8);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
      const l = H.get((i + 4096) * 8192 + j + 4096);
      if (!l) continue;
      for (const [k, bx, bz] of l) {
        const dx = bx - cx, dz = bz - cz, lx = dx * rX + dz * rZ, lz = -(dx * fX + dz * fZ);
        const ex = lx - clamp(lx, -hw, hw), ez = lz - clamp(lz, -hl, hl);
        if (ex * ex + ez * ez < R * R) on.add(k);
      }
    }
    let hit = false;
    for (const k of on) if (!RACE.hayOn.has(k)) hit = true;
    RACE.hayOn = on;
    if (hit && RACE.hayT <= 0 && Math.hypot(veh.vx, veh.vz) > 1) {
      RACE.hayT = 1.5;
      RACE.pts = Math.max(0, RACE.pts - HAY_PTS); raceLost();
      raceFlash('−' + HAY_PTS + ' · hit the hay', 2);
    }
  }
  function raceUpdate(dt) {
    const on = COURSE && (inRoom() || OFFMODE) && G.started;
    if (!on) { RACE.on = false; RACE.i = -1; RACE.prevS = null; RACE.walls.length = 0; return; }
    RACE.on = true;
    RACE.flashT -= dt;
    if (raceHold()) return;
    const was = RACE.i >= 0 ? [RACE.i, RACE.px, RACE.pz, RACE.tx, RACE.tz, RACE.s] : null;
    raceTrack(veh.px, veh.pz);
    // out past the walls (joined from off in the scenery, or somehow over them): back on the course - where it was on it
    // before (a car that jumped gains nothing from it)
    if (Math.abs(RACE.sd) > RACE_WD + 3) {
      if (was) [RACE.i, RACE.px, RACE.pz, RACE.tx, RACE.tz, RACE.s] = was;
      resetCar(true); return;
    }
    raceWalls();
    raceBump(dt);
    if (OFFMODE) { offProgress(dt); return; }
    // on the road: the car's middle inside the road's edge (a wheel or two off still counts)
    const T = CRS_T, onRoad = Math.abs(RACE.sd) < T.W / 2 + 0.5;
    if (!onRoad && RACE.road) raceLost();
    RACE.road = onRoad;
    if (RACE.prevS !== null) {
      let ds = RACE.s - RACE.prevS;
      if (ds > T.L / 2) ds -= T.L; else if (ds < -T.L / 2) ds += T.L;
      if (ds < 0) RACE.debt -= ds;
      else if (ds > 0) {
        const pay = Math.min(ds, RACE.debt); RACE.debt -= pay; ds -= pay;
        if (ds > 0 && onRoad) {
          RACE.pts += ds * RACE.streak; RACE.streakM += ds;
          while (RACE.streakM >= STREAK_M) { RACE.streakM -= STREAK_M; RACE.streak = Math.min(STREAK_MAX, Math.round(RACE.streak * 10 + 1) / 10); }
        } else if (ds > 0) RACE.pts += ds * OFF_RATE;
      }
    }
    RACE.prevS = RACE.s;
    raceHay(dt);
    // (kept through a reload - a new car, the host's map - for this room and round)
    RACE.saveT -= dt;
    if (RACE.saveT <= 0) { RACE.saveT = 3; raceSave(); }
  }
  function raceSave() {
    if (!inRoom() || OFFMODE || RACE.go === null || Math.round(RACE.pts) === RACE.savedP) return;
    RACE.savedP = Math.round(RACE.pts);
    // (per tab, like the guest sign-in - two tabs are two players)
    try { sessionStorage.setItem('hc_netPts', JSON.stringify({ code: ONLINE.net.code, r: RACE.go, p: RACE.savedP })); } catch (e) { /* storage unavailable */ }
  }
  window.addEventListener('pagehide', raceSave);
  $('raceStartBtn').addEventListener('click', () => { if (inRoom() && ONLINE.net.isHost) ONLINE.net.startRace(); });
  // the race: meta.go is when it starts (server time) - 0 while the room waits for the host to start one. Each start is a
  // new race: everyone back on the start grid with 0 points, held there (engine free to rev) till GO
  function raceMeta(m) {
    const go = m.go || 0;
    if (RACE.go === go) return;
    const first = RACE.go === null; RACE.go = go;
    if (first && go && ONLINE.net.serverNow() >= go) {
      // (back after a reload in a race that's on: the points you had in it)
      let k = null; try { k = JSON.parse(sessionStorage.getItem('hc_netPts')); } catch (e) { /* storage unavailable */ }
      RACE.pts = !OFFMODE && k && k.code === ONLINE.net.code && k.r === go ? k.p : 0;
      RACE.savedP = Math.round(RACE.pts);
      return;
    }
    RACE.pts = 0; RACE.debt = 0; RACE.resetT = -1e9; RACE.savedP = -1; raceLost(); raceSave();
    if (OFFMODE) offReset();
    if (COURSE && G.started) raceGrid();
  }
  function raceGrid() {
    const ids = [ONLINE.net.uid].concat([...ONLINE.ghosts.keys()]).sort();
    putCar(gridSpot(ids.indexOf(ONLINE.net.uid) % 8));
    RACE.i = -1; RACE.prevS = null; RACE.hold = null; RACE.hayOn.clear(); LAP.armed = false;
  }
  const raceHolding = () => RACE.on && (!RACE.go || raceNow() < RACE.go);
  // (every frame of the hold: pinned where it stands - it can rev, in park / neutral, but not move; at GO, into drive)
  function raceHold() {
    if (raceHolding()) {
      if (!RACE.hold) { RACE.hold = { x: veh.px, z: veh.pz }; if (UNIMODE) world.uniGate(false); }
      veh.px = RACE.hold.x; veh.pz = RACE.hold.z; veh.vx = 0; veh.vz = 0; veh.wy = 0;
      if (sp.jet) { if (veh.park || veh.gear < 1) veh.selectDrive(); }      // (a jet spools up in drive - its throttle does nothing in park)
      else if (veh.transType === 'auto') veh.park = true;
      else if (veh.gear !== 0 && veh.pendingGear === null) veh._beginShift(0);
      RACE.prevS = null; RACE.i = -1;
      return true;
    }
    if (RACE.hold) { RACE.hold = null; veh.selectDrive(); RACE.goT = 1.2; if (OFFMODE) offGo(); if (UNIMODE) world.uniGate(true); }
    else if (OFFMODE && RACE.go && ORACE.goAt !== RACE.go && !ORACE.fin) {
      // (an offroad race this car missed the start of - it joined late, or its tab was away: off the grid now, its clock
      // running since GO)
      raceGrid(); veh.selectDrive(); offGo();
      ORACE.t0 = ORACE.lapT0 = veh.time - Math.max(0, raceNow() - RACE.go) / 1000;
    }
    if (OFFMODE && RACE.go) ORACE.goAt = RACE.go;
    return false;
  }
  // (the countdown's beeps: a short low one for 3, 2, 1 and a long high one for GO)
  function raceBeep(hi) {
    if (!audio.ready) return;
    const c = audio.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime, d = hi ? 0.6 : 0.18;
    o.type = 'square'; o.frequency.value = hi ? 1320 : 660;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * S.vol * S.fxVol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(audio.master); o.start(t); o.stop(t + d + 0.05);
  }
  // ---- the HUD: the points board (top right) and the reset timer (bottom left, over the map)
  function raceHud(dt) {
    const bd = $('netBoard'), rc = $('resetCd'), cd = $('raceCd'), RW = resetWait();
    bd.classList.toggle('hidden', !RACE.on); rc.classList.toggle('hidden', !RACE.on || !RW);
    $('perf').style.display = RACE.on ? 'none' : '';
    // the start: waiting for the host (who gets the Start button), then 3, 2, 1, GO. Racing offroad alone the countdown
    // runs by itself (and starts over if the menu comes up before GO); finished in a room, your place and time
    let big = '', sub = '', btn = false;
    if (RACE.on) {
      if (OFFMODE && !inRoom() && !RACE.go && !G.paused && !ORACE.fin) RACE.go = Date.now() + 4300;
      const left = RACE.go ? RACE.go - raceNow() : Infinity, host = inRoom() && ONLINE.net.isHost;
      if (OFFMODE && inRoom() && ORACE.fin && (ORACE.finT > 0 || host)) {
        big = 'FINISHED · P' + offStandings().place; btn = host;
        sub = lapFmt(ORACE.fin) + (host ? ' - start the next race when everyone\'s in (or Esc → Online)' : ' - wait for the host to start the next one');
      } else if (!RACE.go) {
        big = inRoom() ? 'ON THE GRID' : '';
        sub = host ? 'Start the race when everyone\'s here (or Esc → Online) - you can rev meanwhile' : inRoom() ? 'Waiting for the host to start the race - you can rev meanwhile' : '';
        btn = host;
      } else if (left > 3000) { big = 'GET READY'; sub = OFFMODE ? W.track.B.name + ' · ' + (UNIMODE ? Math.round(W.track.L) + ' m' : (W.track.L / 1000).toFixed(1) + ' km') + ' · ' + OFF_LAPS + (OFF_LAPS > 1 ? ' laps' : ' lap') : 'The race starts in a moment'; }
      else if (left > 0) big = String(Math.ceil(left / 1000));
      else if (RACE.goT > 0) big = 'GO!';
    }
    RACE.goT -= dt; ORACE.finT -= dt;
    if (big !== RACE.cd) {
      if (/^[123]$/.test(big)) raceBeep(false); else if (big === 'GO!') raceBeep(true);
      RACE.cd = big;
      cd.classList.toggle('hidden', !big);
      cd.querySelector('.cdBig').textContent = big;
      cd.querySelector('.cdBig').className = 'cdBig' + (/^[123]$/.test(big) ? ' num' : big === 'GO!' ? ' go' : '');
    }
    cd.querySelector('.cdSub').textContent = sub;
    cd.querySelector('button').classList.toggle('hidden', !btn);
    cd.querySelector('button').textContent = OFFMODE && ORACE.fin ? 'Start the next race' : 'Start race';
    if (!RACE.on) return;
    const wait = RW - (performance.now() - RACE.resetT) / 1000;
    rc.classList.toggle('ready', wait <= 0);
    rc.firstElementChild.textContent = wait > 0 ? 'Reset in ' + Math.ceil(wait) + ' s' : 'Reset ready · Backspace';
    rc.querySelector('i').style.width = (wait > 0 && RW ? 100 * (1 - wait / RW) : 100).toFixed(1) + '%';
    RACE.boardT -= dt;
    if (RACE.boardT > 0) return;
    RACE.boardT = 0.2;
    if (OFFMODE) { offBoard(); return; }
    $('nbPts').textContent = Math.round(RACE.pts).toLocaleString();
    const mul = $('nbMul');
    mul.textContent = RACE.road ? '×' + RACE.streak.toFixed(1) : '×' + OFF_RATE;
    mul.className = RACE.road ? '' : 'off';
    const st = $('nbSt');
    st.textContent = RACE.flashT > 0 ? RACE.flash : RACE.road ? (RACE.streak < STREAK_MAX ? 'On the road · streak building' : 'On the road · max streak') : 'Off the road · ¼ points';
    st.className = RACE.flashT > 0 ? 'hay' : RACE.road ? '' : 'off';
    const list = [{ n: S.netName, p: RACE.pts, me: true }];
    for (const g of ONLINE.ghosts.values()) { const L = g.snaps[g.snaps.length - 1]; list.push({ n: g.prof.n, p: L && L.length > 31 ? L[31] : 0 }); }
    list.sort((a, b) => b.p - a.p);
    $('nbList').innerHTML = list.length < 2 ? '<div><span>Waiting for friends…</span></div>'
      : list.map((e, k) => `<div class="${e.me ? 'me' : ''}"><span>${k + 1}. ${esc(e.n)}</span><span>${Math.round(e.p).toLocaleString()}</span></div>`).join('');
  }
  // ---- Offroad Racing: laps of a generated course, timed from GO. Progress is the course tracker's distance along the
  // line - the one the walls follow - so going backwards (or round the walls) gains nothing: a lap counts once you've
  // covered the course's length again since the last. Alone it's you against the clock, a personal best per course and
  // car; in a room it's everyone in the host's car, placed by laps and ground covered, then by finishing time
  const OFF_LAPS = OFFMODE ? GM.cfg().laps : 0, OFF_CODE = OFFMODE ? GM.code(GM.cfg()) : '';
  const ORACE = { on: false, t0: 0, dist: 0, debt: 0, prevS: null, lap: 0, lapT0: 0, laps: [], fin: 0, finT: 0, wrongT: 0, place: 0, goAt: null };
  const offKey = () => OFF_CODE + '|' + TKEY;
  const offCfgNow = () => (S.map === 'offroad' ? W.offroad : W.offNormalize(S.offCfg || null));
  // (a mode's track as it stands - the one loaded, or the settings it'll be generated from - and its code)
  const modeCode = (map) => (GMODES[map] ? GMODES[map].code(map === S.map ? GMODES[map].cfg() : GMODES[map].norm(S[GMODES[map].key] || null)) : null);
  const offSeed = () => 1 + Math.floor(Math.random() * 2147483000);
  function offReset() {
    Object.assign(ORACE, { on: false, t0: 0, dist: 0, debt: 0, prevS: null, lap: 0, lapT0: 0, laps: [], fin: 0, finT: 0, wrongT: 0, place: 0 });
    $('raceRes').classList.add('hidden');
  }
  function offGo() { offReset(); ORACE.on = true; ORACE.t0 = veh.time; ORACE.lapT0 = veh.time; }
  // (what goes out with the car: metres covered racing, minus the finishing time in hundredths once finished)
  const offPub = () => (ORACE.fin ? -Math.round(ORACE.fin * 100) : ORACE.on ? Math.max(0, Math.round(ORACE.dist)) : 0);
  const offCmp = (a, b) => ((a.p < 0) !== (b.p < 0) ? (a.p < 0 ? -1 : 1) : b.p - a.p);
  function offStandings() {
    const me = { n: S.netName, p: offPub(), me: true }, list = [me];
    for (const g of ONLINE.ghosts.values()) { const L = g.snaps[g.snaps.length - 1]; list.push({ n: g.prof.n, p: L && L.length > 31 ? L[31] : 0 }); }
    list.sort(offCmp);
    return { list, place: list.indexOf(me) + 1 };
  }
  function offProgress(dt) {
    if (ORACE.on && !ORACE.fin) {
      const L = CRS_T.L;
      if (ORACE.prevS === null) { ORACE.dist = RACE.s > L / 2 ? RACE.s - L : RACE.s; ORACE.prevS = RACE.s; }
      else {
        let ds = RACE.s - ORACE.prevS;
        if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;
        ORACE.prevS = RACE.s;
        if (ds < 0) ORACE.debt -= ds;
        else { const pay = Math.min(ds, ORACE.debt); ORACE.debt -= pay; ORACE.dist += ds - pay; }
      }
      ORACE.wrongT = veh.vx * RACE.tx + veh.vz * RACE.tz < -2 ? ORACE.wrongT + dt : 0;
      while (!ORACE.fin && ORACE.dist >= (ORACE.lap + 1) * L) {
        const t = veh.time - ORACE.lapT0; ORACE.laps.push(t); ORACE.lap++; ORACE.lapT0 = veh.time;
        if (ORACE.lap >= OFF_LAPS) offFinish();
        else { const b = Math.min(...ORACE.laps); hud.toast(`Lap ${ORACE.lap}: ${lapFmt(t)}${ORACE.lap > 1 && t <= b ? ' · fastest yet' : ''} - lap ${ORACE.lap + 1} of ${OFF_LAPS}`, 3); }
      }
    }
    RACE.pts = offPub();
  }
  function offFinish() {
    ORACE.fin = veh.time - ORACE.t0;
    const best = Math.min(...ORACE.laps), key = offKey();
    S.offPB = S.offPB || {};
    const prev = S.offPB[key] ? Object.assign({}, S.offPB[key]) : null, isPB = !prev || ORACE.fin < prev.t;
    S.offPB[key] = { t: isPB ? ORACE.fin : prev.t, lap: prev ? Math.min(prev.lap, best) : best, d: Date.now() };
    const keys = Object.keys(S.offPB);
    if (keys.length > 300) { keys.sort((a, b) => S.offPB[a].d - S.offPB[b].d); for (const k of keys.slice(0, keys.length - 300)) delete S.offPB[k]; }
    saveS();
    RACE.pts = offPub();
    if (inRoom()) { ORACE.place = offStandings().place; ORACE.finT = 8; if (audio.ready) raceBeep(true); }
    else offResults(isPB, prev, best);
  }
  // (racing alone, at the flag: the time, every lap, the personal best - and what next)
  function offResults(isPB, prev, best) {
    const d = prev ? ORACE.fin - prev.t : 0;
    $('raceRes').querySelector('h2').innerHTML = UNIMODE ? 'UNICYCLE <span>RACE</span>' : 'OFFROAD <span>RACE</span>';
    $('rrBody').innerHTML = `<div class="rrTime">${lapFmt(ORACE.fin)}</div>
      <div class="rrSub ${isPB ? 'pb' : ''}">${isPB ? (prev ? 'New personal best · was ' + lapFmt(prev.t) : 'Your first time round this course') : 'Personal best ' + lapFmt(prev.t) + ' · ' + (d >= 0 ? '+' : '') + d.toFixed(2)}</div>
      <div class="rrLaps">${ORACE.laps.map((t, k) => `<div class="${t === best ? 'best' : ''}"><span>Lap ${k + 1}</span><span>${lapFmt(t)}</span></div>`).join('')}</div>
      <div class="rrMeta">${esc(W.track.B.name)} · ${UNIMODE ? Math.round(W.track.L) + ' m' : (W.track.L / 1000).toFixed(1) + ' km'} × ${OFF_LAPS} · ${esc(carLabel(S.car, optOf()))}<br>Course code <b>${OFF_CODE}</b> - share it to race the same course</div>
      <div class="rrBtns"><button class="btn small" data-a="again">Race again</button><button class="btn small" data-a="new">New course</button><button class="btn small ghost" data-a="set">Change settings</button><button class="btn small ghost" data-a="roam">Free roam</button></div>`;
    for (const b of $('rrBody').querySelectorAll('button')) b.addEventListener('click', () => offAction(b.dataset.a));
    $('raceRes').classList.remove('hidden');
    G.paused = true;
    if (audio.ready) { raceBeep(true); audio.master.gain.setTargetAtTime(0.35, audio.ctx.currentTime, 0.2); }
  }
  function offAction(a) {
    $('raceRes').classList.add('hidden');
    if (audio.ready) audio.master.gain.setTargetAtTime(1, audio.ctx.currentTime, 0.1);
    if (a === 'again') offRestart();
    else if (a === 'new') offApply(Object.assign({}, GM.cfg(), { seed: offSeed() }), S.map);
    else if (a === 'set') { curTab = 'Modes'; openMenu(true); }
    else if (a === 'roam') offLeave();
  }
  // back on the grid, the clock reset, the countdown again (racing alone - a room's host starts it for everyone)
  function offRestart() {
    if (inRoom()) { if (ONLINE.net.isHost) ONLINE.net.startRace(); else hud.toast('The host starts the races', 2); return; }
    offReset(); putCar(gridSpot(0));
    RACE.i = -1; RACE.prevS = null; RACE.hold = null; RACE.go = 0; RACE.resetT = -1e9;
    G.paused = G.menu || !G.started;
  }
  // (a track to race: these settings for that mode - the room follows its host onto it. A unicycle race puts everyone on
  // a unicycle, the version it's set up with)
  function offApply(cfg, mode) {
    if (mapLocked()) return;
    mode = GMODES[mode] ? mode : 'offroad';
    const M = GMODES[mode]; cfg = M.norm(cfg);
    if (!GMODES[S.map]) S.mapPrev = S.map;
    if (mode === 'uni') { if (S.map !== 'uni' && S.car !== 'unicycle' && !S.netOwn) S.carBeforeUni = { car: S.car, uniEng: S.uniEng, tcMode: S.tcMode }; S.car = 'unicycle'; S.uniEng = cfg.ver; }
    S[M.key] = cfg; S[M.draft] = Object.assign({}, cfg); S.map = mode; S.reopenModes = false; saveS();
    if (inRoom()) { ONLINE.reloading = true; ONLINE.net.setMap(mode, M.code(cfg)); }
    hud.toast('Generating the ' + M.what + ' - ' + M.code(cfg) + '…', 3);
    setTimeout(() => location.reload(), 300);
  }
  function offLeave() {
    if (mapLocked()) return;
    S.map = S.mapPrev && !GMODES[S.mapPrev] ? S.mapPrev : 'country'; saveS();
    if (inRoom()) { ONLINE.reloading = true; ONLINE.net.setMap(S.map, null); }
    location.reload();
  }
  function offBoard() {
    const L = CRS_T.L, t = ORACE.fin || (ORACE.on ? veh.time - ORACE.t0 : 0), { list, place } = offStandings(), multi = inRoom() && list.length > 1;
    $('nbPts').textContent = multi ? 'P' + place + ' / ' + list.length : lapFmt(t);
    const mul = $('nbMul'); mul.textContent = ORACE.fin ? 'FINISHED' : 'LAP ' + Math.min(OFF_LAPS, ORACE.lap + 1) + '/' + OFF_LAPS; mul.className = '';
    const st = $('nbSt'), last = ORACE.laps[ORACE.laps.length - 1], best = ORACE.laps.length ? Math.min(...ORACE.laps) : 0, pb = S.offPB && S.offPB[offKey()];
    let msg, cls = '';
    if (ORACE.on && !ORACE.fin && ORACE.wrongT > 1) { msg = 'Wrong way!'; cls = 'hay'; }
    else if (RACE.flashT > 0) { msg = RACE.flash; cls = 'hay'; }
    else if (multi) msg = lapFmt(t) + (last ? ' · last lap ' + lapFmt(last) : '');
    else msg = last ? 'Last ' + lapFmt(last) + ' · best ' + lapFmt(best) : pb ? 'Your best here ' + lapFmt(pb.t) : W.track.B.name + ' · ' + (UNIMODE ? Math.round(L) + ' m' : (L / 1000).toFixed(1) + ' km');
    st.textContent = msg; st.className = cls;
    $('nbList').innerHTML = multi
      ? list.map((e, k) => `<div class="${e.me ? 'me' : ''}"><span>${k + 1}. ${esc(e.n)}</span><span>${e.p < 0 ? lapFmt(-e.p / 100) : 'Lap ' + Math.min(OFF_LAPS, Math.floor(Math.max(0, e.p) / L) + 1)}</span></div>`).join('')
      : inRoom() ? '<div><span>Waiting for friends…</span></div>'
        : ORACE.laps.map((x, k) => `<div class="${x === best ? 'me' : ''}"><span>Lap ${k + 1}</span><span>${lapFmt(x)}</span></div>`).slice(-5).join('')
          + (pb ? `<div><span>Personal best</span><span>${lapFmt(pb.t)}</span></div>` : '');
  }

  // ---- Game modes: Offroad Racing's settings - the Modes tab, and the title's Game modes. Changes are a draft till you
  // generate a course from them
  const MODE_D = { d: W.offNormalize(S.offDraft || S.offCfg || null), mode: GMODES[S.map] ? S.map : S.modeTab === 'uni' ? 'uni' : 'offroad' };
  const UNI_D = { d: W.uniNormalize(S.uniDraft || S.uniCfg || null) };
  // (a course code typed in: either kind - it takes you to its mode)
  const parseAnyCode = (t) => { const c = W.offParse(t); if (c) return [c, 'offroad']; const u = W.uniParse(t); return u ? [u, 'uni'] : null; };
  const BIOME_TXT = {
    dunes: 'Sand from horizon to horizon, the course flagged over the dunes - up the long faces and off the brinks. Paddles, big tyres and four-wheel drive',
    forest: 'A dirt trail through the woods over rolling hills, berms round the corners, mud holes in the dips',
    desert: 'Fast hardpack across open desert - whoops, sandy washes to cross, saguaros, mesas on the horizon',
    mud: 'A low, wet bog: mud most of the way, firmer dirt over the rises - grip is everything',
    mountain: 'Gravel up and down the mountainside: cuttings and drops, pines below the tree line, snow up top',
  };
  const BIOME_CARS = { dunes: ['buggy', 'trophy', 'atv', 'monster'], forest: ['rally', 'trophy', 'atv', 'buggy'], desert: ['trophy', 'buggy', 'atv', 'ram'], mud: ['monster', 'tank', 'trophy', 'diesel'], mountain: ['rally', 'trophy', 'atv', 'ram'] };
  function renderModes(add) {
    add(row('Game mode', '', seg([['offroad', 'Offroad Racing'], ['uni', 'Unicycle Racing']], MODE_D.mode, (v) => { MODE_D.mode = v; S.modeTab = v; renderModesOverlay(); })));
    if (MODE_D.mode === 'uni') { renderUniModes(add); return; }
    const D = MODE_D.d, guest = inRoom() && !ONLINE.net.isHost;
    const set = (k) => (v) => { D[k] = v; S.offDraft = Object.assign({}, D); renderModesOverlay(); };
    const sg = (opts, k) => seg(opts, D[k], set(k));
    add(row('<b style="font-size:16px;letter-spacing:0.06em;font-style:italic">OFFROAD RACING</b>', 'A new offroad course generated for every race, on the kind of land you pick, laid out the way you set it here. '
      + 'Race it in laps against the clock - or online, against the room: everyone in the host\'s car and tune.'
      + (S.map === 'offroad' ? '<br>Racing now: <b class="modecode">' + OFF_CODE + '</b> · ' + W.track.B.name + ' · ' + (W.track.L / 1000).toFixed(1) + ' km × ' + OFF_LAPS : ''), el('<span></span>')));
    if (guest) {
      add(row('Online', 'The host picks the course and the car - you\'re racing ' + (OFFMODE ? '<b class="modecode">' + OFF_CODE + '</b>' : 'their map') + ' in their ' + esc(carLabel(S.car, optOf())), el('<span></span>')));
      return;
    }
    add(el('<div class="sect">Terrain</div>'));
    add(row('Map type', BIOME_TXT[D.biome], sg(W.OFF_OPTS.biome.map(([k]) => [k, W.OFF_BIOMES[k].name]), 'biome')));
    add(el('<div class="sect">Course</div>'));
    add(row('Length', 'Round the loop once', sg([['short', 'Short · 2 km'], ['medium', 'Medium · 3.5 km'], ['long', 'Long · 5.5 km']], 'len')));
    add(row('Laps', '', sg([[1, '1'], [2, '2'], [3, '3'], [5, '5'], [10, '10']], 'laps')));
    add(row('Corners', 'Flowing: fast sweepers · Mixed · Technical: tight turns, esses and hairpins', sg([['flowing', 'Flowing'], ['mixed', 'Mixed'], ['technical', 'Technical']], 'twist')));
    add(row('Width', '', sg([['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']], 'width')));
    add(row('Jumps', 'Tabletops built into the straighter bits (kickers too, with Lots) - a JUMP sign before each', sg([['none', 'None'], ['some', 'Some'], ['lots', 'Lots']], 'jumps')));
    add(row('Whoops', 'Runs of rollers ~9 m apart: skim them flat out, or get bucked', sg([['none', 'None'], ['some', 'Some'], ['lots', 'Lots']], 'whoops')));
    add(el('<div class="sect">Car</div>'));
    const ty = VEH.TIRES[tireR()], hp = Math.round((CARDEF.hp || 0) * (tune.power || 1));
    const pickB = el('<button class="btn small ghost">Pick a car</button>');
    pickB.addEventListener('click', () => { if (carLocked()) return; S.reopenModes = !G.started; saveS(); openMoreCars(); });
    add(row(esc(carLabel(S.car, optOf())), (hp ? '~' + hp.toLocaleString() + ' hp · ' : '') + Math.round(tune.mass * 2.20462).toLocaleString() + ' lb' + (ty ? ' · ' + esc(ty.short || ty.name) : '') + (OFFROAD() ? ' (off-road package)' : '')
      + (inRoom() ? ' · everyone in the room races it' : ''), pickB));
    add(row('Good on ' + W.OFF_BIOMES[D.biome].name.toLowerCase(), 'Built for it - or give anything a go (the Drive tab has the off-road tyre packages)',
      seg(BIOME_CARS[D.biome].map((id) => [id, carLabel(id)]), S.car, (id) => { if (id !== S.car && !carLocked()) { S.reopenModes = !G.started; saveS(); pickCar(id); } })));
    const tuneB = el('<button class="btn small ghost">Tune it</button>');
    tuneB.addEventListener('click', () => { $('modes').classList.add('hidden'); curTab = 'Fun'; openMenu(true); });
    add(row('Setup', 'Power, weight, grip, gearing, suspension... on the Fun tab, saved for this car' + (inRoom() ? ' - the room races your tune' : ''), tuneB));
    add(row('Air assist', 'Over the jumps and brows: it eases the gas or brake in the air and nudges the car level for the slope it\'ll land on, like a seasoned driver - Off and you fly it yourself',
      seg([[true, 'On'], [false, 'Off']], S.airAssist !== false, (v) => { S.airAssist = v; renderModesOverlay(); })));
    add(el('<div class="sect">Race</div>'));
    const go = el('<button class="btn">Generate a new course &amp; race</button>');
    go.addEventListener('click', () => offApply(Object.assign({}, D, { seed: offSeed() }), 'offroad'));
    add(row('New course', 'A fresh random course with these settings' + (inRoom() ? ' - everyone in the room comes with you' : ''), go));
    if (S.map === 'offroad') {
      const same = ['biome', 'len', 'twist', 'width', 'jumps', 'whoops'].every((k) => D[k] === W.offroad[k]);
      const again = el(`<button class="btn small">${same && D.laps === W.offroad.laps ? 'Restart this race' : 'Race this course with these laps'}</button>`);
      again.addEventListener('click', () => {
        if (D.laps !== W.offroad.laps) { offApply(Object.assign({}, W.offroad, { laps: D.laps })); return; }
        offRestart(); $('modes').classList.add('hidden'); openMenu(false);
      });
      const leave = el('<button class="btn small ghost">Leave - free roam</button>');
      leave.addEventListener('click', () => offLeave());
      const w = el('<div style="display:flex;gap:8px"></div>'); w.appendChild(again); w.appendChild(leave);
      const pb = S.offPB && S.offPB[offKey()];
      add(row('This course', '<b class="modecode">' + OFF_CODE + '</b>' + (pb ? ' · your best ' + lapFmt(pb.t) + ' (lap ' + lapFmt(pb.lap) + ')' : '') + (same ? '' : ' · the settings above make a different course - generate one to race them'), w));
    }
    const code = el('<input type="text" maxlength="20" placeholder="FOR-M3MR11-XXXX" style="width:170px;background:rgba(255,255,255,0.06);border:1px solid var(--line);color:var(--txt);padding:7px 10px;font-size:13px;border-radius:3px;text-transform:uppercase;letter-spacing:0.08em">');
    const load = el('<button class="btn small ghost">Race it</button>');
    const doLoad = () => { const c = parseAnyCode(code.value); if (!c) { hud.toast('That isn\'t a course code - they look like FOR-M3MR11-1A2B3C or UNI-PBM3M1B-1A2B3', 3); return; } offApply(c[0], c[1]); };
    load.addEventListener('click', doLoad);
    code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doLoad(); });
    const cw = el('<div style="display:flex;gap:8px;align-items:center"></div>'); cw.appendChild(code); cw.appendChild(load);
    add(row('Course code', 'Every course has one (on the results and here): type a friend\'s in to race the very same course', cw));
  }
  // Unicycle Racing's settings: the unicycle everyone rides, the BMX track's size, length, laps, jumps, rhythm sections
  // and berms
  function renderUniModes(add) {
    const D = UNI_D.d, guest = inRoom() && !ONLINE.net.isHost, here = UNIMODE;
    const set = (k) => (v) => { D[k] = v; S.uniDraft = Object.assign({}, D); renderModesOverlay(); };
    const sg = (opts, k) => seg(opts, D[k], set(k));
    add(row('<b style="font-size:16px;letter-spacing:0.06em;font-style:italic">UNICYCLE RACING</b>', 'BMX on one wheel: a new BMX-style track generated for every race - the start hill and its gate, berms, rollers, rhythm sections, doubles, tabletops - and everyone on unicycles. '
      + 'Race it in laps against the clock, or online against the room: the host picks the track and the unicycle.'
      + (here ? '<br>Racing now: <b class="modecode">' + OFF_CODE + '</b> · ' + Math.round(W.track.L) + ' m × ' + OFF_LAPS : ''), el('<span></span>')));
    if (guest) {
      add(row('Online', 'The host picks the track and the unicycle - you\'re racing ' + (here ? '<b class="modecode">' + OFF_CODE + '</b>' : 'their map') + ' on their ' + esc(carLabel(S.car, optOf())), el('<span></span>')));
      return;
    }
    add(el('<div class="sect">Unicycle</div>'));
    add(row('Everyone rides', 'Pedal: legs only, ~14 mph · Improved: a geared hub and a sprinter, ~35 mph · Jet: a model turbojet behind the saddle, ~85 mph - give it the Supercross size',
      seg([['pedal', 'Pedal'], ['improved', 'Improved pedal'], ['jet', 'Jet']], D.ver, (v) => { if (v === 'jet' && D.ver !== 'jet') D.size = 'super'; set('ver')(v); })));   // (the jet's too quick for a BMX-size track: onto Supercross - it can go back)
    add(el('<div class="sect">Track</div>'));
    add(row('Size', 'BMX: a tight track for pedal power · Supercross: everything ~1.8 × as big, for the faster unicycles', sg([['bmx', 'BMX'], ['super', 'Supercross']], 'size')));
    add(row('Length', 'Short and medium: four straights and three berms · long: six and five', sg([['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']], 'len')));
    add(row('Laps', '', sg([[1, '1'], [2, '2'], [3, '3'], [5, '5']], 'laps')));
    add(row('Jumps', 'How big the doubles, tabletops and step-ups are', sg([['small', 'Small'], ['medium', 'Medium'], ['big', 'Big']], 'jumps')));
    add(row('Rhythm sections', 'Runs of little rollers one after another', sg([['none', 'None'], ['some', 'Some'], ['lots', 'Lots']], 'rhythm')));
    add(row('Berms', 'Flat turns, or banked bowls - ride up into them and they carry you round faster (Steep: more so)', sg([['flat', 'Flat'], ['banked', 'Banked'], ['steep', 'Steep']], 'bank')));
    add(row('Air assist', 'Over the jumps: it keeps the unicycle level in the air for the landing - Off and you fly it yourself',
      seg([[true, 'On'], [false, 'Off']], S.airAssist !== false, (v) => { S.airAssist = v; renderModesOverlay(); })));
    add(el('<div class="sect">Race</div>'));
    const go = el('<button class="btn">Generate a new track &amp; race</button>');
    go.addEventListener('click', () => offApply(Object.assign({}, D, { seed: offSeed() }), 'uni'));
    add(row('New track', 'A fresh random BMX track with these settings' + (inRoom() ? ' - everyone in the room comes with you, on that unicycle' : ''), go));
    if (here) {
      const U = W.uni, same = ['ver', 'size', 'len', 'jumps', 'rhythm', 'bank'].every((k) => D[k] === U[k]);
      const again = el(`<button class="btn small">${same && D.laps === U.laps ? 'Restart this race' : 'Race this track with these laps'}</button>`);
      again.addEventListener('click', () => {
        if (D.laps !== U.laps) { offApply(Object.assign({}, U, { laps: D.laps }), 'uni'); return; }
        offRestart(); $('modes').classList.add('hidden'); openMenu(false);
      });
      const leave = el('<button class="btn small ghost">Leave - free roam</button>');
      leave.addEventListener('click', () => offLeave());
      const w = el('<div style="display:flex;gap:8px"></div>'); w.appendChild(again); w.appendChild(leave);
      const pb = S.offPB && S.offPB[offKey()];
      add(row('This track', '<b class="modecode">' + OFF_CODE + '</b>' + (pb ? ' · your best ' + lapFmt(pb.t) + ' (lap ' + lapFmt(pb.lap) + ')' : '') + (same ? '' : ' · the settings above make a different track - generate one to race them'), w));
    }
    const code = el('<input type="text" maxlength="20" placeholder="UNI-PBM3M1B-XXXX" style="width:170px;background:rgba(255,255,255,0.06);border:1px solid var(--line);color:var(--txt);padding:7px 10px;font-size:13px;border-radius:3px;text-transform:uppercase;letter-spacing:0.08em">');
    const load = el('<button class="btn small ghost">Race it</button>');
    const doLoad = () => { const c = parseAnyCode(code.value); if (!c) { hud.toast('That isn\'t a track code - they look like UNI-PBM3M1B-1A2B3', 3); return; } offApply(c[0], c[1]); };
    load.addEventListener('click', doLoad);
    code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doLoad(); });
    const cw = el('<div style="display:flex;gap:8px;align-items:center"></div>'); cw.appendChild(code); cw.appendChild(load);
    add(row('Track code', 'Every track has one (on the results and here): type a friend\'s in to race the very same track', cw));
  }
  function renderModesOverlay() {
    if ($('modes').classList.contains('hidden')) return;
    const b = $('modesBody'); b.innerHTML = '';
    renderModes((nd) => b.appendChild(nd));
  }
  function openModes() { $('modes').classList.remove('hidden'); renderModesOverlay(); }
  $('modesClose').addEventListener('click', () => $('modes').classList.add('hidden'));
  $('modesBtn').addEventListener('click', () => { if (G.loadDone || true) openModes(); });
  $('moreClose').addEventListener('click', () => { if (S.reopenModes) { S.reopenModes = false; saveS(); } });
  // (the title: what's loaded - and back to Game modes after a car was picked from it)
  if (OFFMODE) {
    const pb = S.offPB && S.offPB[offKey()];
    $('modeTitle').textContent = (UNIMODE ? 'Unicycle Racing · BMX track · ' + Math.round(W.track.L) + ' m' : 'Offroad Race · ' + W.track.B.name + ' · ' + (W.track.L / 1000).toFixed(1) + ' km') + ' × ' + OFF_LAPS + ' · course ' + OFF_CODE + (pb ? ' · your best ' + lapFmt(pb.t) : '') + ' - Start engine to race';
  }
  if (S.reopenModes) { S.reopenModes = false; saveS(); if (!S.netRoom) setTimeout(openModes, 200); }

  // (the others' cars are solid - our car's obstacle list gets their footprints - and so are the course's walls)
  veh.world.collidersNear = (x, z, r, c, b) => {
    W.collidersNear(x, z, r, c, b);
    for (const bx of ONLINE.boxes) { const dx = bx.x - x, dz = bx.z - z; if (dx * dx + dz * dz < (r + 8) * (r + 8)) b.push(bx); }
    for (const w of RACE.walls) b.push(w);
  };

  // ---- the Online tab
  function renderOnline(add) {
    const net = ONLINE.net, on = inRoom(), maps = Object.entries(MAP_NAMES);
    add(row('Online play', 'Drive with your friends: one of you hosts a room and shares its code, the others join it. Everyone drives the host\'s car, set up the host\'s way, on the host\'s map - any map. '
      + 'Needs an internet connection.' + (ONLINE.status ? ' · <b>' + esc(ONLINE.status) + '</b>' : ''), el('<span></span>')));
    add(row('Racing for points', 'On the race courses - the Windy Rally Stage, the Rally Stage, the Windy Mower Track and the Mower Track: points for ground covered along the course, on the road 1 a metre times a streak that builds the longer you stay on it (up to ×' + STREAK_MAX + '); '
      + 'off the road a quarter, and the streak\'s gone. Hitting a straw bale costs ' + HAY_PTS + '. Invisible walls well off the road stop shortcuts, '
      + 'and you can reset (Backspace) once every ' + RESET_WAIT + ' s. Everyone waits on the start grid till the host starts the race.', el('<span></span>')));
    add(row('Offroad Racing · Unicycle Racing', 'Host on the Offroad Race or Unicycle Racing map and everyone races the track you set up in Game modes (Esc → Modes) - offroad in your car and tune, BMX on the unicycle you picked: laps, places by ground covered, then by finishing time. '
      + 'A reset back onto the track every 10 s.', el('<span></span>')));
    const inp = (ph, v, max, w) => el(`<input type="text" maxlength="${max}" placeholder="${ph}" value="${esc(v)}" style="width:${w}px;background:rgba(255,255,255,0.06);border:1px solid var(--line);color:var(--txt);padding:7px 10px;font-size:14px;border-radius:3px">`);
    const name = inp('Your name', S.netName, 16, 170);
    name.addEventListener('change', () => { const v = name.value.trim().slice(0, 16); if (v) { S.netName = v; saveS(); netProfileSync(); } });
    add(row('Your name', 'Shown over your car', name));
    const carNow = el(`<b style="font-size:13px">${esc(carLabel(S.car, optOf()))}</b>`);
    if (!on) add(row('Car', 'Hosting? Everyone in your room drives the car you\'re in now, set up your way - its version, tyres, transmission, off-road package and Fun-tab tune', carNow));
    else if (net.isHost) add(row('Car', 'Everyone drives the car you\'re in, set up your way (version, tyres, transmission, package, Fun-tab tune). Change any of it and they follow', carNow));
    else add(row('Car', 'Picked by the host, set up their way - everyone drives the same car. Leaving the room puts you back in your own', carNow));
    if (!on) {
      add(row('Map', 'For a room you host (the race courses score points; the Offroad Race is a race)', seg(maps, ONLINE.hostMap, (v) => { ONLINE.hostMap = v; })));
      if (GMODES[ONLINE.hostMap]) { const b = el('<button class="btn small ghost">Set it up</button>'); b.addEventListener('click', () => { MODE_D.mode = ONLINE.hostMap; curTab = 'Modes'; renderMenu(); }); add(row(ONLINE.hostMap === 'uni' ? 'Track' : 'Course', 'From your Game modes settings: <b class="modecode">' + modeCode(ONLINE.hostMap) + '</b>', b)); }
      const hb = el('<button class="btn small">Host a game</button>');
      hb.addEventListener('click', () => onlineHost());
      add(row('Host', 'Opens a room on that map (loading it if you\'re not on it) and gives you its code to share', hb));
      const code = inp('CODE', '', 5, 90); code.style.textTransform = 'uppercase'; code.style.letterSpacing = '0.15em';
      const jb = el('<button class="btn small">Join</button>');
      jb.addEventListener('click', () => onlineJoin(code.value));
      code.addEventListener('keydown', (e) => { if (e.key === 'Enter') onlineJoin(code.value); });
      const w = el('<div style="display:flex;gap:8px;align-items:center"></div>'); w.appendChild(code); w.appendChild(jb);
      add(row('Join a friend', 'Type the 5-letter code they give you', w));
    } else {
      add(row('Room code', net.isHost ? 'You\'re the host: the map and car you pick are everyone\'s. Give your friends this code.' : 'The host picks the map and the car.',
        el(`<b style="font-size:28px;letter-spacing:0.2em;color:#fff">${esc(net.code)}</b>`)));
      if (net.isHost) {
        add(row('Map', 'Everyone follows you to it', seg(maps, S.map, (v) => { if (v !== S.map) { S.map = v; saveS(); location.reload(); } })));
        if (OFFMODE) { const b = el('<button class="btn small ghost">Change it</button>'); b.addEventListener('click', () => { MODE_D.mode = S.map; curTab = 'Modes'; renderMenu(); }); add(row(UNIMODE ? 'Track' : 'Course', '<b class="modecode">' + OFF_CODE + '</b> · ' + W.track.B.name + ' · ' + (UNIMODE ? Math.round(W.track.L) + ' m' : (W.track.L / 1000).toFixed(1) + ' km') + ' × ' + OFF_LAPS, b)); }
        if (COURSE) {
          const rb = el('<button class="btn small">Start race</button>');
          rb.addEventListener('click', () => { net.startRace(); openMenu(false); });
          add(row('Start race', 'Everyone back on the start grid with 0 points, a 3 s countdown (engines can rev), then GO - everyone\'s put in drive', rb));
        }
      }
      const pts = (p) => OFFMODE ? (p < 0 ? 'finished <b>' + lapFmt(-p / 100) + '</b>' : 'lap ' + Math.min(OFF_LAPS, Math.floor(Math.max(0, p || 0) / CRS_T.L) + 1)) : '<b>' + Math.round(p || 0).toLocaleString() + '</b> pts';
      const list = [`<b>${esc(S.netName)}</b> (you) · ${esc(carLabel(S.car, optOf()))} · ${pts(RACE.pts)}`]
        .concat([...ONLINE.ghosts.values()].map((g) => { const L = g.snaps[g.snaps.length - 1]; return `${esc(g.prof.n)} · ${esc(carLabel(g.prof.c, g.prof.o))} · ${pts(L && L.length > 31 ? L[31] : 0)}`; }));
      add(row('Drivers', list.length + ' in the room', el('<div style="text-align:right;font-size:13px;line-height:1.7">' + list.join('<br>') + '</div>')));
      const lb = el('<button class="btn small ghost">Leave the room</button>');
      lb.addEventListener('click', () => onlineLeave());
      add(row('', '', lb));
    }
    if (ONLINE.busy) add(row('Working…', '', el('<span></span>')));
    if (ONLINE.err) add(row('<span style="color:#ff6b6b">Couldn\'t do that</span>', esc(ONLINE.err), el('<span></span>')));
  }
  // ---- the title screen: Play online (start, then the Online tab), and the room it's in / rejoining
  function netTitle() {
    const t = $('netTitle'); if (!t) return;
    t.textContent = inRoom() ? 'Online · room ' + ONLINE.net.code + (ONLINE.net.isHost ? ' (you host)' : '') : S.netRoom ? 'Rejoining room ' + S.netRoom + '…' : '';
  }
  $('onlineBtn').addEventListener('click', async () => {
    if (!G.loadDone) return;
    await startGame();
    curTab = 'Online'; openMenu(true);
  });
  netTitle();
  // (back in the room you were in after a reload - a new car, the host's map)
  if (S.netRoom) onlineJoin(S.netRoom, true);

  window.__hc = { veh, input, world, car, camera, scene, renderer, S, G, W, perf, audio, cam, THREE, smoke, ONLINE, RACE, ORACE, offApply, offRestart, openModes, onlineHost, onlineLeave };
  // (for the tests: every vehicle id and its options, and the builders the game itself uses - see tyreChoices)
  Object.assign(window.__hc, { VEH, buildModel, defOf, tyreChoices, carIds: ['hellcat', 'demon', 'dragpak', ...MORE_IDS],
    optionsOf: (id) => { const m = MORE_CARS.find((x) => x.id === id); return m && m.options ? m.options.map((o) => o[0]) : [undefined]; } });
  function loop(now) {
    requestAnimationFrame(loop);
    frame(now);
  }
  // manual stepping hook (automated testing while the tab is hidden)
  window.__hc.frame = (ms) => { const n = Math.max(1, Math.round((ms || 16.7) / 16.7)); for (let i = 0; i < n; i++) frame(last + 16.7); };
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    G.time += dt;
    // (the keyboard countersteer help is for a car's slides: a bike balances itself)
    input.poll(dt, veh.forwardSpeed, BIKE ? undefined : (() => { const a = carAxes(); const vr = veh.vx * a.rx + veh.vz * a.rz, vf = veh.vx * a.fx + veh.vz * a.fz; return Math.abs(vf) > 3 ? clamp(Math.atan2(vr, Math.abs(vf)), -0.5, 0.5) : 0; })());
    wzTick(dt);
    handleControls(dt);
    if (!G.paused) {
      veh.step(dt);
      processEvents();
      dragUpdate(dt);
      arenaUpdate(dt);
      lapUpdate();
      raceUpdate(dt);
      flipHint(dt);
      effects(dt);
      rumble(dt);
    }
    updateCarVisual(dt);
    onlineTick(dt);
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
    // no tyre smoke in the cockpit view (it filled the cabin on burnouts); still shown from the chase cams. A diesel's
    // smoke is the point of it, though: in its cockpit the smoke stays, only the puffs right round your head (in the cab)
    // fading out - you see the stack's soot roll up past the windshield and trail off in the mirrors
    const SOOTCAB = G.started && cam.mode === 2 && !!(car.sootTips && car.sootTips.length) && !(CC && CCD.soot === 0);
    smoke.mesh.visible = !(G.started && cam.mode === 2) || SOOTCAB;
    smoke.setNear(SOOTCAB ? 1.5 : 0);
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
