/* Hellcat Drive — real-time procedural audio.
   Source-filter engine model: every cylinder firing (HEMI firing order 1-8-4-3-6-5-7-2, cross-plane crank)
   injects a pressure pulse into a per-bank exhaust resonator bank -> uneven per-bank pulse spacing gives
   the V8 burble, pulse rate gives the pitch, fixed formants give the Hellcat's timbre.
   Plus: twin-screw supercharger whine, intake roar, overrun crackles, rev-limiter stutter, tyre squeal,
   burnout roar, wind, road/gravel noise, starter, shift clunks, impacts, horn.
   Multi-engine mode (pulling tractor): up to 4 V8s or V12s geared onto one crankline, each with its own firing
   sequence and exhaust, fired a few degrees apart so they hit like one enormous engine; deeper, longer exhaust pulses,
   a sub-bass layer and a hotter output stage for sheer volume.
   Runs inside an AudioWorklet (falls back to ScriptProcessor). */
(function (root) {
  'use strict';

  const SYNTH_SRC = String.raw`
class CarSynth {
  constructor(sr) {
    this.sr = sr;
    this.tgt = { rpm: 0, load: 0, thr: 0, cut: 0, boost: 0, run: 0, crank: 0, squeal: 0, sqPitch: 0.5, spin: 0,
      speed: 0, surf: 0, interior: 0, horn: 0, vol: 0.8, engVol: 1, fxVol: 1, rough: 0, whine: 1,
      rpmRef: 6200, boostRef: 11.6, race: 0, hum: 0,   // race: 0 street exhaust, 1 open-header race engine (big cam, no mufflers)
      // nEng engines of cyl cylinders; fmul scales the exhaust formants (big engines, big pipes = lower); deep adds
      // longer pulses + sub-bass; loud drives the output stage harder; open: open cockpit (no cabin muffling);
      // whK: supercharger whine Hz per rpm, whPure 1 = a centrifugal blower's clean scream instead of a roots whine
      nEng: 1, cyl: 8, fmul: 1, deep: 0, loud: 0, open: 0, whK: 0.19, whPure: 0,
      pipe: 0 };   // (2-strokes) 0 off the pipe .. 1 in the expansion chamber's tuned band
    this.cur = Object.assign({}, this.tgt);
    this.seed = 22222;
    this.ca = 0; this.fi = 0;
    this.order = [1, 8, 4, 3, 6, 5, 7, 2];
    // per-engine crank phase (deg): geared together a few degrees apart, so the pulses bunch up instead of
    // interleaving - several engines sound like one colossal one, not a buzzing 32-cylinder
    this.phase = [0, 23, 41, 64];
    this.cylAmp = new Float64Array(48);
    for (let i = 0; i < 48; i++) this.cylAmp[i] = 0.86 + 0.28 * this.rnd();
    this.weakIdx = [2, 2, 2, 2]; this.strongIdx = [5, 5, 5, 5]; this.patLeft = [0, 0, 0, 0];
    this.evA = new Float64Array(48); this.evE = new Int8Array(48); this.evK = new Int8Array(48); this.evB = new Int8Array(48); this.nev = 0;
    this.env = new Float64Array(8); this.slow = new Float64Array(8);
    this.bank = []; this.panL = new Float64Array(8); this.panR = new Float64Array(8);
    this.tuneBanks(1, 1);
    this.newCycle();
    this.whPh2 = 0; this.whPh3 = 0; this.prevRpm = 0; this.revUp = 0;
    this.hiss = this.bp(2500, 3);
    this.subLP = 0; this.subLP2 = 0;
    this.intake = this.bp(420, 1.3);
    this.whBP = this.bp(1000, 9);
    this.sq1 = this.bp(900, 16); this.sq2 = this.bp(1380, 20); this.sq3 = this.bp(2200, 12);
    this.grav = this.bp(2600, 1.5);
    this.hum1 = this.bp(420, 5); this.hum2 = this.bp(850, 7);
    this.clank = this.bp(1250, 14);
    this.lpInt = 0; this.lpIntR = 0; this.brown = 0; this.brown2 = 0; this.windLP = 0; this.windLP2 = 0; this.roarLP = 0;
    this.whPh = 0; this.stPh = 0; this.hornPh1 = 0; this.hornPh2 = 0; this.lfo = 0; this.sqDrift = 0;
    this.hpL = [0, 0]; this.hpR = [0, 0];
    this.pops = []; this.crack = 0; this.boom = 0; this.boomPh = 0;
    this.clunk = 0; this.clunkPh = 0; this.grind = 0; this.imp = 0; this.impLP = 0; this.impRing = 0;
    this.t = 0; this.cnt = 0; this.lastSet = 0; this.alive = 0; this.roarLP1 = 0; this.roarLP2 = 0; this.bodyLP = 0;
  }
  rnd() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
  bp(f, Q) { const o = { b0: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 }; this.setBP(o, f, Q); return o; }
  setBP(o, f, Q) {
    const w = 2 * Math.PI * Math.min(f, this.sr * 0.45) / this.sr, al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    o.b0 = al / a0; o.a1 = -2 * Math.cos(w) / a0; o.a2 = (1 - al) / a0;
  }
  run(o, x) {
    const y = o.b0 * (x - o.x2) - o.a1 * o.y1 - o.a2 * o.y2;
    o.x2 = o.x1; o.x1 = x; o.y2 = o.y1; o.y1 = y; return y;
  }
  // exhaust resonator banks: one pair (left / right bank) per engine, each engine's headers a little different
  tuneBanks(nE, fm) {
    const fL = [56, 116, 245, 540, 1180], fR = [60, 123, 262, 575, 1260], q = [1.05, 1.7, 2.3, 2.1, 1.5];
    for (let e = 0; e < nE; e++) {
      const d = fm * (1 + (nE > 1 ? 0.045 * (e - (nE - 1) / 2) : 0));
      // stereo: engines side by side (V12 pair: left / right; four: left / right pairs), banks spread a little more
      const side = nE === 1 ? 0 : (e & 1 ? 1 : -1);
      for (let b = 0; b < 2; b++) {
        const f = b ? fR : fL, i = e * 2 + b;
        if (!this.bank[i]) this.bank[i] = f.map((x, r) => this.bp(x * d, q[r]));
        else for (let r = 0; r < 5; r++) this.setBP(this.bank[i][r], f[r] * d, q[r]);
        const pan = Math.max(-1, Math.min(1, 0.5 * side + (b ? 0.22 : -0.22)));
        this.panL[i] = Math.sqrt(0.5 * (1 - pan)) * 1.25; this.panR[i] = Math.sqrt(0.5 * (1 + pan)) * 1.25;
      }
    }
    this.nESet = nE; this.fmSet = fm;
  }
  newCycle() {
    const c = this.cur, race = c.race || 0, idleN = Math.max(0, 1 - c.rpm / (2300 + 1500 * race));
    // (singles: a 4-stroke fires once per 720 deg, a 2-stroke every turn - cyl 1 / cyl 2)
    const nE = this.nESet || 1, nc = c.cyl === 12 ? 12 : c.cyl === 1 ? 1 : c.cyl === 2 ? 2 : 8, sp = 720 / nc;
    // lopey cam: timing scatter at idle, and a weak/strong firing pattern that repeats for a few cycles (the chop)
    const lope = (3 + 6 * idleN) * (1 + 1.2 * race);
    let n = 0;
    for (let e = 0; e < nE; e++) {
      if (--this.patLeft[e] <= 0) {
        this.patLeft[e] = 3 + Math.floor(this.rnd() * 4);
        this.weakIdx[e] = Math.floor(this.rnd() * nc);
        this.strongIdx[e] = (this.weakIdx[e] + 3 + Math.floor(this.rnd() * 3)) % nc;
      }
      const ph = nE > 1 ? this.phase[e] : 0;
      for (let k = 0; k < nc; k++) {
        let a = k * sp + ph + (this.rnd() - 0.5) * lope;
        if (a < 0) a = 0; else if (a >= 720) a -= 720;
        // (kept sorted by crank angle: insertion)
        let j = n++;
        while (j > 0 && this.evA[j - 1] > a) { this.evA[j] = this.evA[j - 1]; this.evE[j] = this.evE[j - 1]; this.evK[j] = this.evK[j - 1]; this.evB[j] = this.evB[j - 1]; j--; }
        // V8: cross-plane, banks by cylinder number (uneven per-bank spacing = the burble); V12: banks alternate evenly
        this.evA[j] = a; this.evE[j] = e; this.evK[j] = k; this.evB[j] = nc === 12 || nc <= 2 ? (k & 1) : ((this.order[k] & 1) ? 0 : 1);
      }
    }
    this.nev = n;
  }
  set(p) { for (const k in p) this.tgt[k] = p[k]; this.lastSet = this.t; }
  event(e) {
    if (e.t === 'pop') {
      const n = 1 + Math.floor(this.rnd() * 3);
      for (let i = 0; i < n; i++) this.pops.push({ d: Math.floor(this.rnd() * 0.09 * this.sr), a: (0.6 + this.rnd() * 0.8) * (e.v || 1) });
    } else if (e.t === 'shift') { this.clunk = 1; this.clunkPh = 0; }
    else if (e.t === 'grind') { this.grind = 1; }
    else if (e.t === 'impact') { this.imp = Math.min(2.5, (e.v || 1)); this.impRing = this.imp * 0.4; }
    else if (e.t === 'crunch') { this.crunch = Math.min(1.6, (this.crunch || 0) + (e.v || 1)); this.crThump = Math.min(1.2, (e.v || 1)); }
    else if (e.t === 'glass') { this.glass = Math.min(1.5, (this.glass || 0) + (e.v || 1)); }
  }
  fire(i) {
    const c = this.cur, e = this.evE[i], k = this.evK[i];
    let a;
    if (c.run > 0.5) {
      a = 0.38 + 0.62 * Math.pow(c.load, 0.85);
      if (c.cut > 0.5) a *= 0.04;
    } else if (c.crank > 0.5) a = 0.1;
    else a = 0.05 * Math.min(1, c.rpm / 300);
    const smoothN = Math.min(1, c.rpm / 5000);
    const race = c.race || 0, idleN = Math.max(0, 1 - c.rpm / (2300 + 1500 * race));
    if (k === this.weakIdx[e]) a *= 1 - 0.3 * idleN * (1 + 0.8 * race);
    else if (k === this.strongIdx[e]) a *= 1 + 0.25 * idleN * (1 + 0.8 * race);
    // (a 2-stroke single fires the same cylinder every turn: no cylinder-to-cylinder pattern)
    a *= (1 + (this.cylAmp[e * 12 + (c.cyl === 2 ? 0 : k)] - 1) * (1 - 0.75 * smoothN)) * (1 + (this.rnd() - 0.5) * (0.18 - 0.1 * smoothN + 0.25 * c.rough));
    if (c.cyl === 1 || c.cyl === 2) {
      // a single has one exhaust: every pulse goes down the same pipe (through both resonator banks, for width).
      // Handing alternate pulses to the two banks made a 2-stroke warble at half its firing rate, like a twin
      const hA = a * 0.62;
      this.env[0] += hA; this.env[1] += hA; this.slow[0] += hA * 0.55; this.slow[1] += hA * 0.55;
    } else {
      const bi = e * 2 + this.evB[i];
      this.env[bi] += a;
      this.slow[bi] += a * 0.55;
    }
  }
  render(L, R, n) {
    const c = this.cur, t = this.tgt, sr = this.sr;
    // rpm glides (~55 ms) like a heavy crank + flywheel; load a touch quicker so throttle stabs still bark
    const kr = 1 - Math.exp(-n / (sr * 0.055)), kf = 1 - Math.exp(-n / (sr * 0.035)), ks = 1 - Math.exp(-n / (sr * 0.06));
    for (const key in t) {
      if (key === 'cut' || key === 'horn' || key === 'run' || key === 'crank' || key === 'nEng' || key === 'cyl' || key === 'fmul' || key === 'open' || key === 'whPure') c[key] = t[key];
      else c[key] += (t[key] - c[key]) * (key === 'rpm' ? kr : key === 'load' ? kf : ks);
    }
    const nE = Math.max(1, Math.min(4, c.nEng | 0 || 1));
    if (nE !== this.nESet || (c.fmul || 1) !== this.fmSet) this.tuneBanks(nE, c.fmul || 1);
    const nB = nE * 2, deep = c.deep || 0, loud = c.loud || 0;
    const rpm = Math.max(0, c.rpm), rpmN = Math.min(1.2, rpm / (c.rpmRef || 6200)), load = c.load, race = c.race || 0;
    const dca = rpm * 6 / sr;
    // big-bore engines: longer, fatter exhaust pulses (more low end)
    const eDecay = Math.exp(-1 / (sr * (0.0019 - 0.0008 * rpmN) * (1 + 0.9 * deep))), sDecay = Math.exp(-1 / (sr * 0.007 * (1 + 0.6 * deep)));
    const bright = 0.25 + 0.95 * load * Math.min(1, rpm / 4800);
    const g = [(3.1 - 0.7 * rpmN) * (1 + 0.7 * deep), 2.1 * (1 + 0.35 * deep), 1.15 + 0.2 * race, 0.3 + 0.55 * bright + 0.4 * race * bright, 0.06 + 0.3 * bright + 0.28 * race * bright];
    // (2-strokes) coming on the pipe: in the expansion chamber's tuned band the returning pressure wave rams the charge
    // back in - the note hardens into a bright, ringing scream and gets louder; below it the engine burbles, soft and hollow
    const pp = c.cyl === 2 ? Math.min(1, Math.max(0, c.pipe || 0)) : -1;
    if (pp >= 0) { g[0] *= 1.3 - 0.5 * pp; g[1] *= 1.1 - 0.2 * pp; g[3] *= 0.65 + 0.95 * pp; g[4] *= 0.5 + 1.5 * pp; }
    const bodyOrd = c.cyl === 12 ? 6 : c.cyl === 1 ? 1 : c.cyl === 2 ? 2 : 4;   // firing order per bank (V8 bank: 2/rev, V12 bank: 3/rev; singles 1 or 2 per cycle)
    const aSub = 1 - Math.exp(-2 * Math.PI * 85 / sr);
    const rasp = 0.12 + 0.4 * load * rpmN + race * (0.22 + 0.45 * load * rpmN) + (pp > 0 ? 0.25 * pp * load : 0);   // open headers crackle
    // tonal crank-order body (firing order 4, plus orders 2 and 1 for the cross-plane lope) and a load roar
    const bodyAmp = (c.run > 0.5 ? 0.05 + 0.1 * load : 0) * c.engVol * (1 + 1.5 * deep);
    const roarAmp = (c.run > 0.5 ? 0.02 + 0.16 * load * Math.pow(rpmN, 0.8) : 0) * c.engVol;
    const aRoar = 1 - Math.exp(-2 * Math.PI * (160 + rpm * 0.1) / sr);
    let engGain = (c.run > 0.5 ? 0.5 + 0.5 * load : 0.3) * (0.62 + 0.38 * rpmN) * c.engVol * 0.55 * (1 + 0.3 * race) * (1 + loud * (0.1 + 0.9 * load)) / Math.sqrt(nE);
    if (pp >= 0) engGain *= 0.82 + 0.4 * pp * (0.4 + 0.6 * load);
    const interior = c.open ? 0 : c.interior;
    // open cockpit: you sit right behind the engines, nothing in between
    if (c.open && c.interior > 0.5) engGain *= 1.2;
    // a stripped race car has no sound deadening: far less muffling inside
    const aInt = 1 - Math.exp(-2 * Math.PI * (interior > 0.5 ? 850 + 900 * race : 2900 + 1500 * race) / sr);
    // IHI 2.4L twin-screw supercharger: rotor speed = 2.36 x crank, 3-lobe mesh -> 0.118*rpm Hz fundamental.
    // Always a faint whine at idle, loud under boost and on every rev-up as the rotors spin up.
    const boostN = Math.min(1, c.boost / (c.boostRef || 11.6));
    const dRpm = (rpm - this.prevRpm) / (n / sr); this.prevRpm = rpm;
    this.revUp += (Math.min(1, Math.max(0, dRpm / 9000)) - this.revUp) * (dRpm > 0 ? 0.25 : 0.06);
    const whF = rpm * (c.whK || 0.19) + 20, whPure = c.whPure > 0.5;
    const whAmp = c.run > 0.5 ? (0.009 + 0.085 * Math.pow(boostN, 1.2) + 0.05 * this.revUp) * (0.3 + 0.7 * rpmN) * (interior > 0.5 ? 1.6 : 1) * c.engVol * c.whine : 0;
    this.setBP(this.whBP, whPure ? whF : whF * 2, whPure ? 14 : 7);
    this.setBP(this.hiss, 2600 + rpm * 0.45, 2.5);
    this.setBP(this.intake, 280 + rpm * 0.09, 1.2);
    const intakeAmp = (interior > 0.5 ? 0.16 : 0.07) * c.thr * rpmN * (c.run > 0.5 ? 1 : 0) * c.engVol;
    // tyres
    this.sqDrift += (this.rnd() - 0.5) * 0.08; this.sqDrift *= 0.97;
    const sqF = 760 + 380 * c.sqPitch + 60 * this.sqDrift;
    this.setBP(this.sq1, sqF, 16); this.setBP(this.sq2, sqF * 1.53, 20); this.setBP(this.sq3, sqF * 2.45, 10);
    const sqAmp = Math.pow(Math.min(1, c.squeal), 1.25) * 0.55 * c.fxVol;
    const spin = Math.min(1, c.spin);
    const spd = c.speed;
    const roadAmp = Math.min(1.3, spd / 45) * (c.surf === 0 ? 0.10 : c.surf === 1 ? 0.24 : 0.2) * c.fxVol * (interior > 0.5 ? 1.25 : 0.8);
    // all-terrain tread blocks slapping the pavement: a howl that rises with road speed (~64 mm block pitch),
    // wobbling once per wheel turn; mostly drowned out on dirt
    const hard = c.surf < 0.5 || c.surf > 4.5;
    const humAmp = (c.hum || 0) * (hard ? 1 : 0.3) * Math.min(1, Math.pow(spd / 28, 1.5)) * 0.9 * c.fxVol * (interior > 0.5 ? 1.2 : 0.75);
    if (humAmp > 1e-4) { const hf = 40 + spd * 15.6; this.setBP(this.hum1, hf, 5); this.setBP(this.hum2, hf * 2.03, 7); }
    const gravelRate = c.surf === 1 || c.surf === 3 ? Math.min(0.02, spd * 0.0009) : c.surf === 2 ? spd * 0.00015 : 0;
    const windAmp = Math.min(1.4, Math.pow(spd / 75, 2)) * 0.28 * c.fxVol * (interior > 0.5 ? 0.55 : 1);
    const aWind = 1 - Math.exp(-2 * Math.PI * (180 + spd * 22) / sr);
    // watchdog: if the game loop stops feeding us (tab hidden, hitch), fade out instead of droning on one note
    const aliveTgt = this.t - this.lastSet < 0.3 ? 1 : 0;
    const vol = c.vol;
    for (let i = 0; i < n; i++) {
      this.alive += (aliveTgt - this.alive) * 0.0005;
      // ---- crank & firing
      if (dca > 0) {
        this.ca += dca;
        while (this.fi < this.nev && this.ca >= this.evA[this.fi]) { this.fire(this.fi); this.fi++; }
        if (this.ca >= 720) { this.ca -= 720; this.fi = 0; this.newCycle(); }
      }
      // ---- pops / backfires
      if (this.pops.length) {
        for (let p = this.pops.length - 1; p >= 0; p--) {
          const po = this.pops[p];
          if (--po.d <= 0) {
            for (let b = 0; b < nB; b++) this.env[b] += 2.2 * po.a;
            this.crack += 1.4 * po.a; this.boom += po.a; this.boomPh = 0;
            this.pops.splice(p, 1);
          }
        }
      }
      const w1 = this.rnd() * 2 - 1, w2 = this.rnd() * 2 - 1;
      let eL = 0, eR = 0;
      for (let b = 0; b < nB; b++) {
        const ex = this.env[b] * (1 + rasp * 1.1 * ((b & 1) ? w2 : w1)) + this.slow[b] * 0.6;
        this.env[b] *= eDecay; this.slow[b] *= sDecay;
        const rs = this.bank[b];
        let y = ex * 0.35;
        for (let r = 0; r < 5; r++) y += g[r] * this.run(rs[r], ex);
        if (nB === 2) { if (b) eR = y; else eL = y; } else { eL += y * this.panL[b]; eR += y * this.panR[b]; }
      }
      let oL, oR;
      if (nB === 2) { oL = (eL + 0.6 * eR) * engGain; oR = (eR + 0.6 * eL) * engGain; } else { oL = eL * engGain; oR = eR * engGain; }
      {
        const th = this.ca * Math.PI / 360;   // crank angle in radians (ca runs 0-720 deg per cycle)
        // (the lope orders: once per cycle - two turns on a 4-stroke, one on a 2-stroke, which has no half order)
        const tl = c.cyl === 2 ? 2 * th : th;
        const body = (Math.sin(bodyOrd * th) * 0.55 + Math.sin(2 * tl + 0.7) * 0.3 * (1 + deep) + Math.sin(tl + 1.9) * 0.16 * (1 + 2 * deep)) * bodyAmp;
        this.bodyLP += 0.25 * (body - this.bodyLP);
        this.roarLP1 += aRoar * (w1 - this.roarLP1); this.roarLP2 += aRoar * (this.roarLP1 - this.roarLP2);
        const roar = this.roarLP2 * roarAmp * 4 * (0.65 + 0.35 * Math.sin(4 * th));
        oL += this.bodyLP + roar; oR += this.bodyLP + roar * 0.95;
        // sub-bass: the low end you feel in your chest (two-pole low-pass of the exhaust, added back)
        if (deep > 0) {
          this.subLP += aSub * ((oL + oR) * 0.5 - this.subLP); this.subLP2 += aSub * (this.subLP - this.subLP2);
          const sub = this.subLP2 * deep * 2.2 * (0.4 + 0.6 * load);
          oL += sub; oR += sub;
        }
      }
      // crack & boom from pops (not load-scaled)
      if (this.crack > 1e-4) {
        const cr = this.crack * w1; this.crack *= 0.9975;
        this.boomPh += 2 * Math.PI * 55 / sr;
        const bm = this.boom * Math.sin(this.boomPh); this.boom *= 0.9992;
        const s = (cr * 0.35 + bm * 0.5) * c.engVol;
        oL += s; oR += s;
      }
      // interior muffling of exhaust
      this.lpInt += aInt * (oL - this.lpInt); this.lpIntR += aInt * (oR - this.lpIntR);
      oL = this.lpInt; oR = this.lpIntR;
      // supercharger whine + intake
      this.whPh += 2 * Math.PI * whF / sr; if (this.whPh > 6.283185307) this.whPh -= 6.283185307;
      const wh = (whPure ? Math.sin(this.whPh) + 0.22 * Math.sin(2 * this.whPh)
        : 0.3 * Math.sin(this.whPh) + 0.85 * Math.sin(2 * this.whPh) + 0.5 * Math.sin(3 * this.whPh) + 0.18 * Math.sin(4 * this.whPh)) * whAmp
        + this.run(this.whBP, w1) * whAmp * 0.9 + this.run(this.hiss, w2) * whAmp * 0.25 * boostN;
      const ik = this.run(this.intake, w2) * intakeAmp;
      oL += wh + ik; oR += wh + ik;
      // starter motor
      if (c.crank > 0.5) {
        this.stPh += 2 * Math.PI * 1150 / sr;
        const st = (Math.sin(this.stPh) * 0.05 + w1 * 0.03) * (0.6 + 0.4 * Math.sin(this.t * 2 * Math.PI * 13));
        oL += st; oR += st;
      }
      // tyres
      if (sqAmp > 1e-4 || spin > 1e-3) {
        const chatter = 1 + 0.35 * Math.sin(this.t * 2 * Math.PI * (18 + 10 * spin));
        const sq = (this.run(this.sq1, w1) + 0.7 * this.run(this.sq2, w2) + 0.3 * this.run(this.sq3, w1)) * sqAmp * chatter;
        this.roarLP += 0.12 * (w2 - this.roarLP);
        const roar = this.roarLP * spin * 0.5 * c.fxVol;
        oL += sq + roar; oR += sq * 0.9 + roar;
      }
      // road & gravel
      this.brown = this.brown * 0.996 + w1 * 0.02; this.brown2 = this.brown2 * 0.985 + w2 * 0.03;
      let rd = (this.brown * 1.6 + this.brown2 * 0.5) * roadAmp;
      if (gravelRate > 0 && this.rnd() < gravelRate) this.grav.x1 += 1.5 + this.rnd() * 2;
      rd += this.run(this.grav, 0) * 0.18 * c.fxVol;
      if (humAmp > 1e-4) rd += (this.run(this.hum1, w1) + 0.45 * this.run(this.hum2, w2)) * humAmp * (1 + 0.3 * Math.sin(this.t * 2 * Math.PI * (spd * 0.4 + 0.3)));
      // wind
      this.windLP += aWind * (w2 - this.windLP); this.windLP2 += aWind * (this.windLP - this.windLP2);
      const wd = this.windLP2 * windAmp * 3;
      oL += rd + wd; oR += rd + wd * 0.95;
      // horn (two-tone)
      if (c.horn > 0.5) {
        this.hornPh1 += 405 / sr; this.hornPh2 += 492 / sr;
        const h = ((this.hornPh1 % 1) < 0.5 ? 1 : -1) * 0.07 + ((this.hornPh2 % 1) < 0.5 ? 1 : -1) * 0.06;
        oL += h; oR += h;
      }
      // shift clunk, gear grind, impacts
      if (this.clunk > 1e-3) {
        this.clunkPh += 2 * Math.PI * 62 / sr;
        const s = (Math.sin(this.clunkPh) * 0.22 + w1 * 0.04) * this.clunk * c.fxVol; this.clunk *= 0.9985;
        oL += s; oR += s;
      }
      if (this.grind > 1e-3) {
        const s = this.run(this.clank, w1) * this.grind * 0.9 * (0.5 + 0.5 * Math.sin(this.t * 2 * Math.PI * 70)) * c.fxVol; this.grind *= 0.99985;
        oL += s; oR += s;
      }
      // crumpling sheet metal: a dense run of random crackles through a mid band with a dull thump under it
      if (this.crunch > 1e-3) {
        if (!this.crk) { this.crk = this.bp(1500, 2.5); this.crk2 = this.bp(420, 1.5); }
        const tick = this.rnd() < 0.05 * this.crunch ? (this.rnd() - 0.5) * 7 : 0;
        const s = (this.run(this.crk, tick + w1 * 0.25 * this.crunch) * 0.55 + this.run(this.crk2, w2 * this.crThump) * 0.5) * this.crunch * c.fxVol;
        this.crunch *= 0.99992; this.crThump *= 0.9997;
        oL += s; oR += s;
      }
      // breaking glass: sparse bright tinkles, high up
      if (this.glass > 1e-3) {
        if (!this.gls) this.gls = this.bp(5200, 5);
        const tick = this.rnd() < 0.012 * this.glass ? (this.rnd() - 0.5) * 9 : 0;
        const s = this.run(this.gls, tick + w2 * 0.06 * this.glass) * this.glass * 0.6 * c.fxVol; this.glass *= 0.99991;
        oL += s * 0.9; oR += s;
      }
      if (this.imp > 1e-3) {
        this.impLP += 0.08 * (w1 - this.impLP);
        const s = (this.impLP * 1.2 + this.run(this.clank, w2 * this.impRing)) * this.imp * c.fxVol; this.imp *= 0.9993; this.impRing *= 0.9996;
        oL += s; oR += s;
      }
      // DC block & soft clip
      const hl = oL - this.hpL[0] + 0.9975 * this.hpL[1]; this.hpL[0] = oL; this.hpL[1] = hl;
      const hr = oR - this.hpR[0] + 0.9975 * this.hpR[1]; this.hpR[0] = oR; this.hpR[1] = hr;
      const drive = vol * 1.1 * (1 + 0.45 * loud);
      L[i] = Math.tanh(hl * drive) * 0.92 * this.alive;
      R[i] = Math.tanh(hr * drive) * 0.92 * this.alive;
      this.t += 1 / sr;
    }
  }
}
`;

  const WORKLET_SRC = SYNTH_SRC + String.raw`
class HellcatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.s = new CarSynth(sampleRate);
    this.port.onmessage = (e) => { const d = e.data; if (d.t === 'p') this.s.set(d.p); else this.s.event(d); };
  }
  process(inputs, outputs) {
    const o = outputs[0];
    this.s.render(o[0], o[1] || o[0], o[0].length);
    return true;
  }
}
registerProcessor('hellcat-synth', HellcatProcessor);
`;

  class CarAudio {
    constructor() { this.ready = false; this.params = {}; }
    async init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      let ok = false;
      if (this.ctx.audioWorklet && window.isSecureContext !== false) {
        try {
          const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
          await this.ctx.audioWorklet.addModule(url);
          this.node = new AudioWorkletNode(this.ctx, 'hellcat-synth', { numberOfInputs: 0, outputChannelCount: [2] });
          this.send = (m) => this.node.port.postMessage(m);
          ok = true;
        } catch (e) { console.warn('AudioWorklet unavailable, falling back', e); }
      }
      if (!ok) {
        const CarSynth = new Function(SYNTH_SRC + '\nreturn CarSynth;')();
        const synth = new CarSynth(this.ctx.sampleRate);
        const sp = this.ctx.createScriptProcessor(1024, 0, 2);
        sp.onaudioprocess = (ev) => { const b = ev.outputBuffer; synth.render(b.getChannelData(0), b.getChannelData(1), b.length); };
        this.node = sp;
        this.send = (m) => { if (m.t === 'p') synth.set(m.p); else synth.event(m); };
      }
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -8; this.comp.knee.value = 8; this.comp.ratio.value = 3;
      this.comp.attack.value = 0.004; this.comp.release.value = 0.15;
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.node.connect(this.comp).connect(this.master).connect(this.ctx.destination);
      this.ready = true;
    }
    resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
    update(p) { if (this.ready) this.send({ t: 'p', p }); }
    event(t, v) { if (this.ready) this.send({ t, v }); }
  }

  root.HCAudio = { CarAudio, SYNTH_SRC };
})(typeof self !== 'undefined' ? self : this);
