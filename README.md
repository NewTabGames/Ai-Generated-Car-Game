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

- **AVENGER Monster Truck**: the same stadium truck underneath - chassis, blown 540, axles, shocks, 66 in tyres, 4WD and 4WS, every number - under the Avenger's body: a rounded hot-rod coupe in lime green with big round fenders over all four tyres, an oval chrome grille and round headlamps, dark glass, yellow-to-orange flames outlined in red licking back from the nose and forward off the tail, the name arched across the doors in flame letters over a wall of stickers, the zoomies out of the rear fenders. Its own card in More Cars; its home is the Monster Arena too.
- **Trophy Truck: Spec, Trophy Truck & Unlimited 4WD**: a Baja 1000-type desert racer - a fiberglass pickup body on a tube chassis with huge black fender flares, a grille full of stacked LED light bars behind a tube guard, a roof bar of spotlights, window nets, two spares and a chase light on the cage over the bed, 39 in desert tyres on black beadlocks with red rings. Its suspension is the point: ~27 in of travel on long A-arms up front and ~33 in on a 4-link at the back, ~1 Hz springs and bypass shocks, all drawn moving with the wheels. Held at 50-70 mph over 0.45 m whoops its body peaks at ~1 g and pitches +-3 deg with the bump stops never touched, where a Cybertruck or a rally car is thrown off them and flips. Spec (~525 hp LS): 0-60 ~5.5 s, ~125 mph; Trophy Truck (~900 hp, rear drive): 0-60 ~4.2 s, ~136 mph; Unlimited 4WD (~1,050 hp): 0-60 ~3.1 s, ~142 mph. Tyres (Esc → Drive → Tyres): the desert tyres, **sand paddles** (39 in paddles on the back, ribbed fronts - the dune buggy's sand tyres in the truck's size, with the same grip: 0-60 on soft sand in ~3.3 s against ~6.5 s on the desert tyres, and it climbs 35° faces) or 40 in mud-terrains.
- **Dune Buggy: 1600 VW, Built 2276 VW & LS3 V8 sand rail**: a VW sand rail - a red tube frame on a diamond-plate floor, a roll cage with two lamps on top, two high-back buckets, the battery on the nose, a VW beam front end on yellow coil-overs, trailing arms at the back, polished five-spokes, the engine hung out behind the transaxle (a flat-four with its fan shroud and a stinger exhaust, dual Webers on the built one, or an LS V8 with the radiator up on the cage). Stock 1600 (~60 hp): 0-60 ~10 s, ~80 mph; built 2276 (~150 hp): 0-60 ~4.8 s, ~110 mph; LS3 (~480 hp, long-travel arms, starts on Street stability control): 0-60 ~4.4 s, ~135 mph. Three sets of tyres (Esc → Drive → Tyres): the buggy tyres; **sand paddles** with ribbed sand fronts - made for the dunes: they scoop the sand for over 2 g of bite and ~0.7 g round a corner in it (the ribbed fronts knife in and steer), float over it, climb 35° faces, and skate on pavement (the LS3 keeps its nose down on wheelie control, off with TC Off); or **off-road knobbies** (27 in fronts, 31 in rears) - they bite in dirt, gravel, grass and mud and hold their own in sand. Picking it takes you to the **Sand Dunes**.
- **Touring Bagger: Stock 117, Race bagger & Turbo drag bagger**: a Street Glide-type touring bike - the batwing fairing on the forks with its twin LED headlamps, short smoked screen and the dash inside, the long tank, the stepped two-up seat, the 45-degree V-twin with its finned barrels, round air cleaner and primary cover, black pipes into a muffler under each hard saddlebag (red light strips in their backs), floorboards, a 19 in front on twin discs and an 18 in rear on a belt; the rider puts a foot down at a stop. You ride it like a bike: steer and it leans into the turn to the angle that balances it (~28 deg at the keyboard's limit, 0.58 g; the floorboards touch past ~32), stands itself back up out of the turn or under hard braking, and the front end turns about its raked steering head. The physics: the tyres are round in section (it rolls onto their shoulders as it leans), the ground pushes straight up at the contact patch, linked brakes keep the light rear from locking. Stock: 105 hp / 130 lb-ft, 0-60 ~4.0 s, 60-0 in ~135 ft, ~125 mph. Race bagger (King of the Baggers-type): ~190 hp, slicks, leans 50 deg, 0-60 ~3.2 s, ~160 mph. Turbo drag bagger: ~400 hp on 16 psi, a stretched swingarm, wheelie control, 0-60 ~3.1 s, ~180 mph.
- **Main Battle Tank: Governed, Ungoverned & 3,000 hp hot rod**: built like an M1A2 Abrams - ~62 t, a 1,500 hp gas turbine (it whines like one) through a 4-speed automatic with hydrostatic steering, seven dual road wheels a side on torsion bars, rubber-padded steel tracks that run at each track's own speed. It steers the way tanks do - the steering drives one track faster than the other (~30 deg/s at a crawl, gentler at speed) - and in NEUTRAL it pivots on the spot; backing up, it steers like a car. The turret turns (~40 deg/s, as a real one) to wherever the camera looks and the gun lifts with the view - drag the mouse to look round (the view button puts the camera back behind). The model: the long hull and shallow glacis, armoured skirts, the angular turret with its bustle rack, the commander in the cupola with a .50 cal, the loader's M240, the gunner's sight and the commander's viewer, smoke dischargers, the 120 mm gun with its thermal sleeve and fume extractor, three-tone camouflage (the paint picks the base tone). Governed: 0-20 mph in ~6 s, 42 mph; ungoverned ~55 mph; the hot rod 0-20 in 3 s, ~68 mph. Its off-road package takes the rubber pads off: bare steel grousers. No shooting.
- **Ram 1500 HEMI: 5.7 HEMI, Supercharged 5.7 & 6.2 Hellcat swap**: a 2019-24 Ram 1500 Rebel crew cab with the 5'7" box, built to its real dimensions (5.92 m long, 2.09 m wide, 1.99 m tall, 3.67 m wheelbase) - the long hood with the Rebel's power dome and its two vents, the Rebel grille (a honeycomb in a heavy black surround with the bar across it), slim LED headlamps (two projectors under a DRL strip that runs along the top and down the outer end), the black bumper wrapping round the body-colour fender corners with its fog lamps, lower grille, tow hooks and skid plate, the shoulder crease from the headlamps to the tail lamps, tinted glass with a black B-pillar, big black mirrors, black flares and running boards, a lined box with wheel tubs, vertical LED tail lamps, 33 in all-terrains on black six-spoke 18s; inside, the dash with the 12 in portrait screen, buckets and the rear bench. No badges, as with the other cars. 4x4 in 4-Auto, 8-speed TorqueFlite, air suspension. 5.7 HEMI (395 hp): 0-60 ~6 s, ~14.6 s quarter mile, 106 mph governed; supercharged 5.7 (~575 hp): 0-60 ~4.4 s, 120 mph; 6.2 Hellcat HEMI swap (~710 hp): 0-60 ~3.7 s, ~12.2 s quarter mile, 118 mph. 60-0 in ~135 ft. Off-road package: knobby off-road tyres.
- **ATV: 200 Sport, 450 race quad & Turbo drag quad**: a full-size sport quad - a black tube frame under red plastics (the pointed nose with its angular headlamp and black vents, front fenders sweeping back into the footwells, silver side panels, rear fenders), a long black seat, a tube front bumper with its marker lamps and a rear rack on the 200, double A-arms and red coil-overs at the front, a swingarm with one shock on a solid rear axle (no differential), the chain, the air-cooled single, a silver muffler on the right above the front of the rear tyre, heel guards, silver split-spoke 10 in alloys on knobbies. You ride it: the rider (a third of the weight) hangs off the inside of every turn - it's what keeps a quad, its CG ~0.6 m up on a ~0.9 m track, on four wheels; it pushes wide on pavement, the inside rear lifts, and turned hard enough it goes over. 200 Sport (~12 hp on a CVT: the revs hold at the power peak while the ratio walks up): 0-30 ~7 s, ~48 mph; 450 race quad (~47 hp, 5-speed, long-travel suspension, wider, nerf bars): 0-60 ~6 s, ~77 mph; Turbo drag quad (~140 hp on race fuel, the swingarm stretched 10 in, a wheelie bar, drag slicks): 0-60 ~3.6 s, ~11.5 s quarter mile, ~117 mph. Off-road package: sand paddles and ribbed fronts.
- **Diesel Dually: Stock 5.9, Built street truck & Pulling truck**: a 2nd-gen ('98-'02) one-ton Quad Cab long bed dually - the big-rig hood standing above the front fenders, the tall chrome crosshair grille, big clear headlamps with their two reflectors and the park / turn lamps under them, a chrome bumper, the front window's sill dropped at its leading corner, five amber cab lights, towing mirrors, the 8 ft box between the dually fenders, tall tail lamps, a chrome step bumper, polished 8-lug 16s with the domed front hubs and deep-dished rear duals. The 5.9 inline-six turbo diesel has its own sound: the injection knock (the clatter, loudest at idle), the turbo's whistle rising with the boost, and the compressor's flutter when you lift on the tuned trucks. Black smoke comes out of the stack as the fuel runs ahead of the air - floored before the turbo spools, and on a tuned truck under any real load - trailing back over the truck at speed. Stock (235 hp / 460 lb-ft, 4-speed auto, side exhaust ahead of the duals): 0-60 ~13 s, 100 mph governed; Built street truck (compound turbos, ~650 hp / 1,250 lb-ft, twin 6 in stacks in the bed, rear drive - it spins the duals): 0-60 ~6.8 s, ~135 mph; Pulling truck (triple turbos, ~1,600 hp / 2,400 lb-ft to 5,000 rpm, a short stack through the primer-grey hood, locked 4WD - it rolls coal): 0-60 ~4.4 s, ~160 mph. Off-road package: knobby off-road tyres.
- **Toyota Prius**: the 2nd-gen (2004-09) hybrid liftback built to its real dimensions (4.45 m long, 1.49 m tall, 2.70 m wheelbase) and its real shape - one arc from a short sloping hood into the long, steeply raked windshield, the roof peaking just behind the B-pillar and falling in a straight line over the hatch to the spoiler, where the tail is cut off near-vertical (the Kammback) with a second strip of glass in it; swept-back headlamps along the fender tops, a slot of a grille, the wide lower intake with the fog lamps, the small fixed window at the foot of each thick A-pillar, black B-pillars, the quarter window, tall wrap-round tail lamps, the mast aerial, 15 in ten-spoke alloys; inside, the display centred along the top of the dash and the joystick shifter. A new hybrid drive: the 1.5 L Atkinson four (76 hp) reaches the front wheels through the power-split CVT - it drones at ~5,000 rpm floored as the speed comes up under it - and the electric motor on the final drive adds its torque from a standstill, its power capped by the battery. 110 hp combined: 0-60 ~10 s, ~17.7 s quarter mile, 104 mph governed, 60-0 in ~130 ft on low-rolling-resistance tyres.
- **67**: a custom supercar whose body is the numerals 6 and 7, side on - the 6's bowl over the front wheels with its counter a black oval in the flank, its hook curling back into the roof, the 7's bar the rest of the roof and its stroke slanting down ahead of the rear wheels - satin-silver slabs with rounded edges, a smoked glass canopy between them, a recessed door panel, a carbon chassis (a low wedge of a nose with an LED blade, eyebrows over the wheels, the tail and diffuser), black ten-spokes round red calipers and a 1 m wing on two pairs of stalks. A 6.7 L twin-turbo V8 behind the seats (670 hp, 670 lb-ft), a 7-speed dual-clutch, rear drive: 0-60 ~3.1 s, ~10.9 s quarter mile, ~185 mph (the numerals are no shape for the wind).
- **Silver Bullet**: Sunbeam's 1930 land-speed car for Kaye Don - a long silver cigar with its nose drawn out low to a point, the wheels out in the wind behind aluminium discs, a curved fairing behind each front wheel and a long one down each side, the V12's exhaust stubs along the bonnet, a Union flag on the nose, the driver in a leather helmet and goggles far back behind a little aero screen, two tall fins on the tail. A 24 L V12 with two superchargers (~960 hp), three gears, Dunlop 37 x 7 tyres: built to beat 231 mph, it managed only 186 at Daytona in 1930 with its blowers misbehaving - here the engine runs as designed, ~0-100 in 10 s and ~230 mph (it lives on the Straightaway).
- **Cybertruck: Long Range RWD, All-Wheel Drive & Cyberbeast**: the stainless-steel wedge built to its real dimensions (5.68 m long, 3.81 m wheelbase, a 1.79 m peak) - flat brushed-stainless panels, the one-line profile from the nose's light bar over the hood and windscreen to the peak and down the vault to the tailgate, near-black frameless glass, trapezoid wheel openings with black flares, the light bar across the tail, the one big wiper, a squircle wheel and the big centre screen inside. Adaptive air suspension, four-wheel steering (the rears counter-steer up to 10 degrees at low speed), 35 in all-terrains on 20 in six-spoke wheels. RWD ~350 hp, 0-60 ~6.2 s; AWD ~600 hp, 0-60 4.1 s (both governed to 112 mph); Cyberbeast 845 hp, 0-60 2.6 s, an 11.2 s quarter mile, 130 mph.
- **Golf Carts: Standard, Street LSV, Hot Rod, Record, Jet & Mega Jet**: a standard two-seat electric cart (48 V, ~4 kW, governed to 19 mph, a bag rack with two golf bags); a street-legal LSV build (72 V AC, 35 mph, lights, windscreen, 12 in wheels); a hot rod (45 kW AC motor and a lithium pack, lowered, roof off, ~84 mph); and a record cart built like the 118 mph world-record holder - a Hayabusa 1,340 cc four behind the seats, ~120 mph; and a **Jet** cart - a surplus turbojet slung low behind the seats (590 lbf of thrust, 810 with its afterburner), nothing driving the wheels, ~3 s of spool lag (hold SPACE on the brakes, floor it, let go), a flame with shock diamonds, 0-60 ~4 s and ~185 mph. Its Fun-tab tunes grow the engine: Stage 2 is a slightly bigger turbojet (~1,100 lbf, ~213 mph), Unhinged a huge one with wings (~2,050 lbf, 0-60 in 1.6 s, ~270 mph). Built to stay straight flat out: its thrust runs through the centre of gravity, the rear tyres are wider than the fronts, the brakes are biased to the front and a low tail fin keeps its nose in the wind - keyboard lane changes at 170 mph slide it ~1°, and it won't spin or roll with every aid off, even over a crest flat out. The **Mega Jet** carries an engine half as big again as the Unhinged one (2.4 times the stock turbojet across): an afterburning fighter-trainer turbojet, ~3,300 lbf dry and ~4,600 lbf lit, in a slippery streamliner on a longer, wider 700 kg frame with half its weight on the nose and a big fin - **600 mph** stock (a quarter mile in 8.0 s at 302 mph from a standing idle), **~700 mph** on Stage 2 and **800 mph** on Unhinged. Its downforce stops growing past ~150 mph (enough to keep its grip, never enough to crush it onto its belly), and flat out it flies off crests for seconds and lands on its wheels; lane changes, hard steering and crests at every speed stay straight, even with every aid off. Every jet cart's engine sits on frame rails and a pylon now, and a grip tune lowers the whole cart, engine and all, so the thrust stays on the centre of gravity.
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

**Maps** (Esc → Drive → Map, or the title screen): Countryside (endless winding roads, hills, lakes) · All Road (the whole world is pavement: avenues, lots, skid pads, jump ramps) · **Prepped Countryside** and **Prepped All Road** (the same two with every road sprayed and rubbered in like a drag strip - sticky, and stickier still for warm drag radials and slicks) · Straightaway · Drag Strip · Dirt Drag · Monster Arena · All Ramps · Mower Track · **Windy Mower Track** (a ~750 m twisting dirt road course in a mown field, straw bales both sides) · **Rally Stage** (a 4 km loop of fast gravel through woods and fields - long sweepers, crests you fly over flat out, chevron boards at the tighter corners) · **Windy Rally Stage** (2.4 km of narrow, twisting gravel through dense forest in steeper hills, with four hairpins) · **Sand Dunes** (an endless sand sea: transverse dune ridges with long gentle windward faces up to a brink and steep slip faces down the far side, crests that wander and break into crescents, bowls between them, from a packed hardpan at the start; soft sand is its own surface - it eats street tyres, bogs skinny ones down and loses its bite on faces near its angle of repose, while paddles, big all-terrains and four-wheel drive go). The three new tracks are timed laps from a start / finish arch, best lap kept per car.

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
│   ├── bike.js             # Procedural touring bagger (batwing fairing, V-twin, bags, the front end turning about the raked steering head, the rider)
│   ├── tank.js             # Procedural main battle tank (hull, skirts, road wheels, tracks that run with the physics, the turret that follows the camera, camouflage shader)
│   ├── crushers.js         # Procedural Car Crushers 2 cars (couch, egg, banana, Blue Bird, GT-R widebody, microcar, porta potty, scooter, glass wedge), the Cybertruck, the Ram 1500, the Prius, the 67, the Silver Bullet and the diesel dually
│   ├── monster.js          # Procedural monster truck (tube chassis, 4-links and shocks that follow the suspension, 66 in tyres, see-through cab, livery; the WRECKONING pickup and the AVENGER coupe bodies)
│   ├── offroad.js          # Procedural trophy truck and dune buggy (long-travel arms, axles and shocks that follow the suspension, liveries)
│   ├── atv.js              # Procedural ATV (plastics, A-arms and shocks that follow the suspension, the bars turning on the raked column, the rider leaning into turns)
│   ├── fx.js               # Smoke, dust, skidmarks and flames (smoke/dust drawn to a screen-fill budget)
│   ├── game.js             # Core game loop, scene management, cameras, and menus
│   ├── hud.js              # Gauges, tachometer, minimap, and telemetry HUD
│   ├── input.js            # Keyboard, gamepad, and steering wheel input handling
│   ├── net.js              # Online rooms over Firebase (guest sign-in, Realtime Database), loaded only when you go online
│   ├── vehicle.js          # Vehicle dynamics, suspension, engine torque curves, transmission
│   ├── worldgen.js         # Procedural road network, elevation, terrain, the Monster Arena's jumps / crushable cars, the Mower Track, the rally stages and the windy mower course (closed-loop tracks), the Sand Dunes
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
node test/sand-test.js
node test/atv-diesel-test.js
node test/prius-67-bullet-test.js
```
