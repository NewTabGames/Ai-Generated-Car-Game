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
│   ├── fx.js               # Smoke, skidmarks, tire marks, and particles
│   ├── game.js             # Core game loop, scene management, cameras, and menus
│   ├── hud.js              # Gauges, tachometer, minimap, and telemetry HUD
│   ├── input.js            # Keyboard, gamepad, and steering wheel input handling
│   ├── vehicle.js          # Vehicle dynamics, suspension, engine torque curves, transmission
│   ├── worldgen.js         # Procedural road network, elevation, and terrain generation
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
node test/puller-test.js
node test/sim-test.js
node test/audio-test.js
```
