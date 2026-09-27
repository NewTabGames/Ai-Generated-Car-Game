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
- **Monster Truck**: 12,000 lb, ~1,500 hp supercharged methanol 540, 66 in hand-cut tyres, 30 in of suspension travel, four-wheel drive with lockers and four-wheel steering (auto / crab / manual rear steer). The wheels' spin steers it in the air: gas lifts the nose, brake drops it. Picking it takes you to the **Monster Arena** map: a stadium with a big gap jump, a tabletop, whoops, banked corners and a pile of junk cars that really crush, with freestyle tricks (big air, flips, wheelies, nose wheelies, donuts, crushes) scored on the video boards.

- **Go-Karts: Rental, TaG 125 & KZ Shifter**: No suspension, a solid rear axle and slicks. A slow, forgiving 4-stroke rental kart behind a wraparound bumper; a 30 hp, 16,000 rpm TaG 125 race kart on a centrifugal clutch; and a 48 hp KZ shifter with a 6-speed sequential box and brakes on all four wheels (0-60 in ~4 s, ~95 mph).

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
│   ├── kart.js             # Procedural go-karts (rental with wraparound bumper, TaG 125 and KZ shifter race karts)
│   ├── monster.js          # Procedural monster truck (tube chassis, 4-links and shocks that follow the suspension, 66 in tyres, livery)
│   ├── fx.js               # Smoke, skidmarks, tire marks, and particles
│   ├── game.js             # Core game loop, scene management, cameras, and menus
│   ├── hud.js              # Gauges, tachometer, minimap, and telemetry HUD
│   ├── input.js            # Keyboard, gamepad, and steering wheel input handling
│   ├── vehicle.js          # Vehicle dynamics, suspension, engine torque curves, transmission
│   ├── worldgen.js         # Procedural road network, elevation, terrain, and the Monster Arena's jumps / crushable cars
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
node test/puller-test.js
node test/sim-test.js
node test/audio-test.js
```
