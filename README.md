# Hellcat Drive — AI-Generated 3D Car Game

An advanced, browser-based 3D car driving and motorsport simulation built with **Three.js** and **Web Audio API**.

[![Play Online](https://img.shields.io/badge/Play_Online-GitHub_Pages-brightgreen?style=for-the-badge&logo=github)](https://newtabgames.github.io/Ai-Generated-Car-Game/)

---

## 🎮 Play & Run

### 🌐 Play Live in Browser
**[Launch Game on GitHub Pages](https://newtabgames.github.io/Ai-Generated-Car-Game/)**

### Option 1: Run Locally via Web Server
To run the modular development build:
```bash
# Using Node.js http-server or npx
npx serve .

# Or using Python
python -m http.server 8000
```
Then open `http://localhost:8000/index.html` in your browser.

### Option 2: Self-Contained Standalone Build
Open `HellcatDrive.html` directly in any modern WebGL-supported browser (Chrome, Edge, Firefox, Safari).

---

## 🏎️ Vehicles & Classes

- **Dodge Challenger SRT Hellcat**: Supercharged 6.2L HEMI, customizable colors, street & drag tire compounds, switchable TC/ESC modes.
- **SRT Demon & Mopar Drag Pak**: High-output drag packages with transbrake, line lock, and drag radials.
- **Dragsters: Top Fuel, Nitro Funny Car & Top Alcohol**: Up to 11,000 HP nitro-burning beasts with functional deceleration parachutes and multi-stage clutch management; the Funny Car rides its wheelie bars off the line under a carbon flip-top body.
- **Modified Pulling Tractor**: Multi-engine setups (4x Blown HEMIs or twin supercharged V12 aircraft engines) built for tractor pulling sled competitions.
- **Monster Truck**: 12,000 lb, ~1,500 hp supercharged methanol 540, 66 in hand-cut tyres, 30 in of suspension travel, four-wheel drive with lockers and four-wheel steering (auto / crab / manual rear steer). The wheels' spin steers it in the air: gas lifts the nose, brake drops it - and an optional air assist (on by default) aims it at the slope it's about to land on, eases off whichever pedal would over-rotate it and gently levels it in pitch and roll, so holding the gas over a jump doesn't flip it. The fiberglass pickup body has real window openings (you see the driver in the cage), a scooped hood, a chrome grille and headlights, flares, an open bed with rails and a tailgate. Picking it takes you to the **Monster Arena** map: a 96 x 184 m stadium floor with a big gap jump, a tabletop, a step-up, two sets of whoops, banked corners and a pile of junk cars that really crush, with freestyle tricks (big air, flips, wheelies, nose wheelies, donuts, crushes) scored on the video boards.

- **Go-Karts: Rental, TaG 125, KZ Shifter & Supercharged**: No suspension, a solid rear axle and slicks. A slow, forgiving 4-stroke rental kart behind a wraparound bumper; a 30 hp, 16,000 rpm TaG 125 race kart on a centrifugal clutch (fully in by 6,000 rpm like the real X30's, so it pulls away off the pipe and screams once it comes on it); the rental is governed to ~31 mph; a 48 hp KZ shifter with a 6-speed sequential box and brakes on all four wheels (0-60 in ~4 s, ~95 mph); and a supercharged kart - a 998 cc supercharged superbike four (H2-type centrifugal blower, ~20 psi, ~200 hp) behind the seat of a stretched chassis with a quickshift 6-speed and a wheelie bar: 0-60 in ~2.4 s, ~132 mph, the blower's whistle and its surge chirp when you lift. It starts on Track traction control; Off lights up the slicks at any real throttle.

- **Racing Mowers: B-Prepared, FX & Record**: lawn mower racing, built to the US association's classes - blades out, the deck still hung underneath, numbers on all four sides. The B-Prepared is a real garden tractor on its factory frame with the 810 cc V-twin built inside (~38 hp), the mower's own 5-speed transaxle re-geared, turf tyres and no suspension (~80 mph, 0.6 g on pavement, it slides on grass); the FX is a tube chassis under a tractor hood with a 459 cc single on pump gas, a centrifugal clutch, a 3-speed box and kart dirt tyres (~88 mph); the record mower is built like the 150 mph land-speed holders - a 189 hp superbike four with a quickshifter on racing slicks, 0-100 mph in ~6.3 s (its home is the Straightaway). The race mowers take you to the **Mower Track** map: a 1/5-mile dirt oval in a freshly striped, mown field, straw bales for walls, a start / finish arch, bleachers and a lap timer that keeps your best lap per mower. New synth sounds for the V-twin (the potato-potato), the big single and the superbike four.

- **From Car Crushers 2** (in More Cars, a card each): nine of the Roblox game's vehicles, each built the way it would have to be for real to do what it does in the game (its top speed there), and left to the real physics:
  - **Couch Car** - a three-seat leather sofa on hidden 13 in wheels with a 1.6 L turbo triple built like a drag engine (~850 hp) under the cushions, its three pipes out of the right arm: 0-60 ~3.2 s, ~190 mph, and twitchy on its short wheelbase.
  - **Egg Rod** - the Mork & Mindy egg car as a hot rod: a 350 small-block behind the egg, a 3-speed automatic, a big wing, ~142 mph.
  - **Banana Car** - the Big Banana Car on its 1993 F-150 (5.0 V8, 4-speed auto, 85 mph). As in the game it floats: drive into a lake and the rear tyres paddle it along.
  - **Blue Bird** - Campbell's 1935 streamliner: a 36.7 L supercharged Rolls-Royce V12 (2,350 hp), 3 gears, twin rear wheels - ~301 mph if you give it miles (it lives on the Straightaway).
  - **Nissan GTR** - an R35 in a Liberty Walk widebody: the real 565 hp twin-turbo V6, 6-speed dual-clutch and rear-biased all-wheel drive, 0-60 ~3.5 s floored, ~196 mph.
  - **Mini Dookie** - the game's Pamingo Mini: a one-seat electric city pod, 15 kW, ~55 mph.
  - **Porta Potty** - a portable toilet on a go-kart frame, a 22 hp V-twin under the throne, the door open, ~45 mph - and it tips over if you take a turn quickly.
  - **Turbo Scooter 3000** - a mobility scooter with a 100 kW motor: 0-60 ~4.4 s, ~119 mph, wheelie control and anti-tip wheels - and it tips over at 0.4 g, so straight lines only.
  - **Razors Edge** - a golf cart under a faceted wedge of smoked glass edged in neon (the paint colour), a graveyard on its flanks: 110 kW electric, ~142 mph.

  New physics for them: electric motors (full torque from standstill, no idle or stall, regen, a speed limit that fades the torque), turbo lag, a rear-biased AWD split, a floating hull; new synth sounds: an inline triple, an even-fire V6, and electric-motor whine.

**Off-road package** (Esc → Drive, every vehicle): the Challengers get BFGoodrich KO2 all-terrains + a 2 in lift; the pulling tractor R-2 deep-lug rears and lugged fronts; the dragsters a sand-drag setup (paddle tyres + ribbed fronts - try the Dirt Drag map); the monster truck full-depth (uncut) lugs; the karts knobbies with a matching sprocket; the mowers ag bar-lug tyres; the Car Crushers cars knobbies in their own sizes. Each trades pavement grip for bite in the dirt, grass and mud.

Rolled over? Every vehicle flips back GTA-style: when it's on its roof or side and nearly stopped, steer left or right and it rolls back onto its wheels.

---

## 🕹️ Controls

### Keyboard Controls
| Action | Primary Key | Secondary Key |
|---|---|---|
| **Throttle / Accelerate** | `W` | `Up Arrow` |
| **Brake / Reverse** | `S` | `Down Arrow` |
| **Steering** | `A` / `D` | `Left` / `Right Arrow` |
| **Handbrake** | `Space` | — |
| **Shift Up (Manual)** | `E` | `Right Shift` |
| **Shift Down (Manual)** | `Q` | `Right Ctrl` |
| **Clutch** | `Z` | — |
| **Neutral Rev** | Hold `R` | — |
| **Line Lock (Burnout)** | Hold `B` | — |
| **Parachute (Dragsters)** | `F` | — |
| **Rear Steer Mode (Monster Truck)** | `G` | — |
| **Rear Steer Left / Right (Monster Truck)** | Hold `,` / `.` | — |
| **Flip Back Over** | Steer left / right while on the roof or side | — |
| **Camera View** | `C` | — |
| **Look Back** | `V` | — |
| **Drive Mode (TC / ESC)** | `T` | — |
| **Headlights** | `L` | — |
| **Reverse (R ↔ D)** | `X` | — |
| **Auto ↔ Manual Shift** | `M` | — |
| **Engine Start / Stop** | `I` | — |
| **Reset Car to Road** | `Backspace` | — |
| **Menu / Pause** | `Escape` | — |

### Gamepad & Steering Wheel Support
Supports standard controllers (Xbox, PlayStation) and PC racing wheels (PXN, Logitech, Thrustmaster) via the Gamepad API. An in-game configuration wizard detects axes and buttons for steering, pedals, and shifter setups.

---

## 🛠️ Project Structure

```
├── index.html              # Main game entry point (modular)
├── HellcatDrive.html       # Single-file bundled distribution
├── build.js                # Bundler script (inlines src/*.js into HellcatDrive.html)
├── HellcatViewer.html      # 3D Vehicle inspector & model comparison tool
├── build-viewer.js         # Bundler script for vehicle viewer
├── src/                    # Game source modules
│   ├── audio.js            # Real-time procedural engine synth & tire FX
│   ├── carmodel.js         # Procedural 3D car mesh generation & materials
│   ├── dragster.js         # Procedural Top Fuel / Top Alcohol dragster models (body, engine, wing, chutes, growing slicks)
│   ├── puller.js           # Procedural pulling-tractor models (4× HEMI / 2× Allison V12, weight bar)
│   ├── kart.js             # Procedural go-karts (rental with wraparound bumper, TaG 125, KZ shifter and the supercharged kart)
│   ├── mower.js            # Procedural racing mowers (garden tractor, FX tube chassis, record mower; driver, deck, tyres)
│   ├── crushers.js         # Procedural Car Crushers 2 cars (couch, egg, banana, Blue Bird, GT-R widebody, microcar, porta potty, scooter, glass wedge)
│   ├── monster.js          # Procedural monster truck (tube chassis, 4-links and shocks that follow the suspension, 66 in tyres, see-through cab, livery)
│   ├── fx.js               # Smoke, dust, skidmarks and flames (smoke/dust drawn to a screen-fill budget)
│   ├── game.js             # Core game loop, scene management, cameras, and menus
│   ├── hud.js              # Gauges, tachometer, minimap, and telemetry HUD
│   ├── input.js            # Keyboard, gamepad, and steering wheel input handling
│   ├── vehicle.js          # Vehicle dynamics, suspension, engine torque curves, transmission
│   ├── worldgen.js         # Procedural road network, elevation, terrain, the Monster Arena's jumps / crushable cars, the Mower Track
│   └── worldrender.js      # Three.js world rendering, lighting, and foliage instancing
├── test/                   # Physics benchmarks and audio sanity tests
└── viewer/                 # Standalone vehicle model viewer files
```

---

## 📦 Building

To re-bundle the source files into the standalone HTML distributions:

```bash
# Bundle main game
node build.js

# Bundle 3D vehicle viewer
node build-viewer.js
```

---

## 🧪 Testing

Simulation benchmarks and synthetic audio tests can be executed via Node.js:

```bash
node test/dragster-test.js
node test/monster-test.js
node test/kart-test.js
node test/mower-test.js
node test/cc-test.js
node test/puller-test.js
node test/sim-test.js
node test/audio-test.js
```
