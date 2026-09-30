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
- **Monster Truck**: 12,000 lb, ~1,500 hp supercharged methanol 540, 66 in hand-cut tyres, 30 in of suspension travel, four-wheel drive with lockers and four-wheel steering (auto / crab / manual rear steer). The wheels' spin steers it in the air: gas lifts the nose, brake drops it - and an optional air assist (on by default) aims it at the slope it's about to land on and works the pedals for you - it brakes the wheels to drop a rising nose and revs them to lift a falling one, eases off whichever pedal would over-rotate it and adds a light levelling nudge - so holding the gas over a jump doesn't flip it. The fiberglass pickup body has real window openings (you see the driver in the cage), a scooped hood, a chrome grille and headlights, flares, an open bed with rails and a tailgate. Picking it takes you to the **Monster Arena** map: a 192 x 368 m stadium floor with two big gap jumps, three tabletops (one half as big again), two step-ups, three sets of whoops, banked corners and a pile of junk cars that really crush, with freestyle tricks (big air, flips, wheelies, nose wheelies, donuts, crushes) scored on the video boards. **All Ramps** has no stadium at all: the whole world is groomed dirt, flat to the horizon and covered in jumps (gap jumps, tabletops, step-ups, kickers and whoops, big and small, facing every way), and tricks score there too.

- **Go-Karts: Rental, TaG 125, KZ Shifter & Supercharged**: No suspension, a solid rear axle and slicks. A slow, forgiving 4-stroke rental kart behind a wraparound bumper; a 30 hp, 16,000 rpm TaG 125 race kart on a centrifugal clutch (fully in by 6,000 rpm like the real X30's, so it pulls away off the pipe and screams once it comes on it); the rental is governed to ~31 mph; a 48 hp KZ shifter with a 6-speed sequential box and brakes on all four wheels (0-60 in ~4 s, ~95 mph); and a supercharged kart - a 998 cc supercharged superbike four (H2-type centrifugal blower, ~20 psi, ~200 hp) behind the seat of a stretched chassis with a quickshift 6-speed and a wheelie bar: 0-60 in ~2.4 s, ~132 mph, the blower's whistle and its surge chirp when you lift. It starts on Track traction control; Off lights up the slicks at any real throttle.

- **Golf Carts: Standard, Street LSV, Hot Rod & Record**: a standard two-seat electric cart (48 V, ~4 kW, governed to 19 mph, a bag rack with two golf bags); a street-legal LSV build (72 V AC, 35 mph, lights, windscreen, 12 in wheels); a hot rod (45 kW AC motor and a lithium pack, lowered, roof off, ~84 mph); and a record cart built like the 118 mph world-record holder - a Hayabusa 1,340 cc four behind the seats, ~120 mph; and a **Jet** cart - a surplus turbojet slung low behind the seats (590 lbf of thrust, 810 with its afterburner), nothing driving the wheels, ~3 s of spool lag (hold SPACE on the brakes, floor it, let go), a flame with shock diamonds, 0-60 ~4 s and ~185 mph. Its Fun-tab tunes grow the engine: Stage 2 is a slightly bigger turbojet (~1,100 lbf, ~213 mph), Unhinged a huge one with wings (~2,050 lbf, 0-60 in 1.6 s, ~270 mph). Built to stay straight flat out: its thrust runs through the centre of gravity, the rear tyres are wider than the fronts, the brakes are biased to the front and a low tail fin keeps its nose in the wind - keyboard lane changes at 170 mph slide it ~1°, and it won't spin or roll with every aid off, even over a crest flat out.
- **Rally Cars: Rally4, Rally2 & Group B**: a gravel rally hatch at three power levels - Rally4 (front-wheel drive, 1.2 turbo triple, 208 hp), Rally2 (four-wheel drive, 1.6 turbo four, 290 hp) and Group B (mid-engined, four-wheel drive, twin-charged 1.8, ~530 hp, anti-lag bangs, 0-60 ~3 s). Sequential boxes, hydraulic handbrakes, gravel tyres (block tread, ~1.05 g round a gravel corner) on flat-faced six-spoke rally wheels with the brakes behind them, a light pod, mud flaps, the cage and both crew inside. Their off-road package is a set of rally mud tyres: big open knobs, ~1 g in the grass and nearly twice the grip in mud, less on tarmac. Picking one takes you to the **Rally Stage**.
- **Racing Mowers: B-Prepared, FX & Record**: lawn mower racing, built to the US association's classes - blades out, the deck still hung underneath, numbers on all four sides. The B-Prepared is a real garden tractor on its factory frame with the 810 cc V-twin built inside (~38 hp), the mower's own 5-speed transaxle re-geared, turf tyres and no suspension (~80 mph, 0.6 g on pavement, it slides on grass); the FX is a tube chassis under a tractor hood with a 459 cc single on pump gas, a centrifugal clutch, a 3-speed box and kart dirt tyres (~88 mph); the record mower is built like the 150 mph land-speed holders - a 189 hp superbike four with a quickshifter on racing slicks, 0-100 mph in ~6.3 s (its home is the Straightaway). The race mowers take you to the **Mower Track** map: a 1/5-mile dirt oval in a freshly striped, mown field, straw bales for walls, a start / finish arch, bleachers and a lap timer that keeps your best lap per mower. New synth sounds for the V-twin (the potato-potato), the big single and the superbike four.

- **From Car Crushers 2** (in More Cars, a card each): nine of the Roblox game's vehicles, each built the way it would have to be for real to do what it does in the game (its top speed there), and left to the real physics:
  - **Couch Car** - a three-seat leather sofa on hidden 13 in wheels with a 1.6 L turbo triple built like a drag engine (~850 hp) under the cushions, its three pipes out of the right arm: the softest R-compound tyres (sticky from cold) and wheelie control, 0-60 ~2.8 s, ~190 mph, and twitchy on its short wheelbase.
  - **Egg Rod** - the Mork & Mindy egg car as a hot rod: a 350 small-block behind the egg, a 3-speed automatic, a big wing, ~142 mph.
  - **Banana Car** - the Big Banana Car on its 1993 F-150 (5.0 V8, 4-speed auto, 85 mph). As in the game it floats: drive into a lake and the rear tyres paddle it along.
  - **Blue Bird** - Campbell's 1935 streamliner: a 36.7 L supercharged Rolls-Royce V12 (2,350 hp), 3 gears, twin rear wheels - ~301 mph if you give it miles (it lives on the Straightaway).
  - **Nissan GTR** - an R35 in a Liberty Walk widebody, slammed on air: riveted overfenders, a carbon hood with vents, swept LED headlamps, a carbon splitter and canards, a ducktail and GT wing, black concave wheels round big brakes. The real 565 hp twin-turbo V6, 6-speed dual-clutch and rear-biased all-wheel drive, 0-60 ~3.5 s floored, ~196 mph.
  - **Mini Dookie** - the game's Pamingo Mini: a one-seat electric city pod, 15 kW, ~55 mph. Or with Fiat's 0.9 TwinAir turbo twin under the rear floor: 85 hp, a 5-speed automated manual, ~105 mph.
  - **Porta Potty** - a portable toilet on a go-kart frame, a 22 hp V-twin under the throne, the door open, ~45 mph - and it tips over if you take a turn quickly.
  - **Turbo Scooter 3000** - a mobility scooter with a 100 kW motor: 0-60 ~3.4 s, ~119 mph, wheelie control and anti-tip wheels, a wide-track kit, a stabiliser wheel out each side and stability control - in a hard turn it leans onto the outside one and slides instead of rolling over. Or the name made literal: a Suzuki Hayabusa four with a turbo bolted where the rear shell was, ~260 hp, a 6-speed on a quickshifter, ~150 mph.
  - **Razors Edge** - a golf cart under a faceted wedge of black glass edged in glowing neon (the paint colour), a knife-edge prow, a graveyard on its flanks: 110 kW electric, ~142 mph. Or a junkyard 5.3 L LS V8 behind the bench, 285 hp and a 4-speed automatic, ~165 mph.

  New physics for them: electric motors (full torque from standstill, no idle or stall, regen, a speed limit that fades the torque), turbo lag, a rear-biased AWD split, a floating hull, stabiliser outriggers; new synth sounds: an inline triple, an even-fire V6, and electric-motor whine. The electric ones have a petrol engine to swap in (Esc → Drive → Engine, or on their More Cars card), and their Fun tab tunes the motor (power, base speed, speed limit, rotor inertia, reduction gear).

**Off-road package** (Esc → Drive, every vehicle): the Challengers get BFGoodrich KO2 all-terrains + a 2 in lift; the pulling tractor R-2 deep-lug rears and lugged fronts (quicker than its cut pullers on grass, dirt and mud); the dragsters a sand-drag setup (paddle tyres + ribbed fronts - try the Dirt Drag map); the monster truck full-depth (uncut) lugs; the karts knobbies with a matching sprocket; the mowers ag bar-lug tyres; the Car Crushers cars knobbies in their own sizes (the rally cars mud tyres). Each trades pavement grip for bite in the dirt, grass and mud.

Rolled over? Every vehicle flips back GTA-style: when it's on its roof or side and nearly stopped, steer left or right and it rolls back onto its wheels.

**Maps** (Esc → Drive → Map, or the title screen): Countryside (endless winding roads, hills, lakes) · All Road (the whole world is pavement: avenues, lots, skid pads, jump ramps) · **Prepped Countryside** and **Prepped All Road** (the same two with every road sprayed and rubbered in like a drag strip - sticky, and stickier still for warm drag radials and slicks) · Straightaway · Drag Strip · Dirt Drag · Monster Arena · All Ramps · Mower Track · **Windy Mower Track** (a ~750 m twisting dirt road course in a mown field, straw bales both sides) · **Rally Stage** (a 4 km loop of fast gravel through woods and fields - long sweepers, crests you fly over flat out, chevron boards at the tighter corners) · **Windy Rally Stage** (2.4 km of narrow, twisting gravel through dense forest in steeper hills, with four hairpins). The three new tracks are timed laps from a start / finish arch, best lap kept per car.

**Nitrous** (Fun tab): set a shot and it's armed - it fires whenever you floor it, like a real kit's wide-open-throttle switch (so it works on any wheel), or switch it to fire only while `N` / a mapped button is held. You hear the solenoids hiss and the engine hit harder while it sprays.

---

## 🌐 Online Racing

**Play online** on the title screen (or Esc → Online): one player hosts a room and gets a 5-letter code, friends type it in to join. Needs an internet connection; it runs on Firebase (anonymous guest sign-in, a Realtime Database), and the single-player game never touches the network.

- **The host sets everything:** the map (any map) and the car, set up their way (version / class / engine, fuel, transmission, tyres, off-road package and the whole Fun-tab tune). Everyone drives that exact car; when the host changes any of it, everyone follows (a new car or map reloads and rejoins by itself). Your paint, driver aids and controls stay yours, your own car and tune are kept, and leaving the room puts you back in them.
- **Race courses** - the Windy Rally Stage, the Rally Stage, the Windy Mower Track and the Mower Track - are where the racing happens:
  - **Start:** everyone waits on the start grid (engines free to rev) till the host presses **Start race**; then 3, 2, 1, GO and everyone's dropped into drive. Each start is a new race: everyone back on the grid with 0 points.
  - **Points** for ground covered along the course: on the road 1 point a metre, times a streak that builds the longer you stay on it (+0.1 every 40 m, up to ×3). Off the road it's a quarter of that and the streak's gone. Hitting a straw bale costs 100 and the streak. Driving backwards earns nothing, and what you gave up has to be made up first. The board (top right) ranks everyone.
  - **No shortcuts:** invisible walls run well off the road (10 m past the edge on the rally stages, 6 m on the mower tracks) and follow your own bit of the course, so you can't cut across to another bit of it. They're no guard rail: touching one throws the car about and bleeds its speed away. A car that ends up past them is put back where it was.
  - **Reset** (Backspace) once every 30 s - the timer's over the minimap, bottom left.
- The others' cars are solid: a bump is shared by weight, and whichever game sees it sends the other car its share, so the car that's hit gets shoved. Their engines play from where they are, and their names float over them.
- **Graphics → Tyre smoke & dust → Small** keeps a few little puffs at the tyres - no big drift smoke or dirt clouds to see through (the other players' cars too).

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
| **Nitrous (when set to the button)** | Hold `N` | — |
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
│   ├── net.js              # Online rooms over Firebase (guest sign-in, Realtime Database), loaded only when you go online
│   ├── vehicle.js          # Vehicle dynamics, suspension, engine torque curves, transmission
│   ├── worldgen.js         # Procedural road network, elevation, terrain, the Monster Arena's jumps / crushable cars, the Mower Track, the rally stages and the windy mower course (closed-loop tracks)
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
