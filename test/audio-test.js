// Offline render of the engine synth: level/pitch sanity + WAV preview (test/preview.wav)
const fs = require('fs');
const { SYNTH_SRC } = require('../src/audio.js').HCAudio;
const CarSynth = new Function(SYNTH_SRC + '\nreturn CarSynth;')();
const sr = 48000, s = new CarSynth(sr);
const out = [];
function seg(label, secs, p, ev) {
  s.set(p);
  const n = 256, L = new Float32Array(n), R = new Float32Array(n);
  let sum = 0, pk = 0, cnt = 0, nan = false, lo = 0, lp1 = 0, lp2 = 0;
  const buf = [], aLo = 1 - Math.exp(-2 * Math.PI * 150 / sr);
  for (let i = 0; i < secs * sr / n; i++) {
    if (ev && i % 40 === 0) s.event({ t: ev });
    s.set(typeof p === 'function' ? p(i * n / sr) : p);
    s.render(L, R, n);
    for (let j = 0; j < n; j++) { const v = L[j]; if (!isFinite(v)) nan = true; sum += v * v; pk = Math.max(pk, Math.abs(v)); cnt++; out.push(L[j], R[j]); buf.push(L[j]); lp1 += aLo * (v - lp1); lp2 += aLo * (lp1 - lp2); lo += lp2 * lp2; }
  }
  // crude pitch: autocorrelation over last 0.25s in 25..600 Hz
  const w = buf.slice(-12000); let best = 0, bl = 0;
  for (let lag = Math.floor(sr / 600); lag < sr / 25; lag++) { let c = 0; for (let k = 0; k + lag < w.length; k += 2) c += w[k] * w[k + lag]; if (c > best) { best = c; bl = lag; } }
  console.log(`${label.padEnd(26)} rms ${Math.sqrt(sum / cnt).toFixed(3)} peak ${pk.toFixed(2)} ${nan ? 'NaN!' : ''} period-f ${(sr / bl).toFixed(0)} Hz  <150 Hz ${(100 * lo / Math.max(1e-12, sum)).toFixed(0)} %`);
}
const base = { run: 1, vol: 0.8, engVol: 1, fxVol: 1 };
seg('idle 720', 2, { ...base, rpm: 720, load: 0.05, thr: 0, boost: 0 });
seg('rev 3000 light', 1.5, { ...base, rpm: 3000, load: 0.3, thr: 0.3, boost: 2 });
seg('WOT 5500 boost', 2, { ...base, rpm: 5500, load: 1, thr: 1, boost: 11.5 });
seg('limiter 6200 (cut)', 1, (t) => ({ ...base, rpm: 6150 + 50 * Math.sin(t * 60), load: 1, thr: 1, boost: 11, cut: Math.sin(t * 2 * Math.PI * 14) > 0 ? 1 : 0 }));
seg('overrun 4500 pops', 1.5, { ...base, rpm: 4500, load: 0, thr: 0, boost: 0, cut: 0 }, 'pop');
seg('burnout squeal+spin', 2, { ...base, rpm: 5800, load: 0.9, thr: 1, boost: 10, squeal: 1, spin: 1, speed: 0 });
seg('cruise 70mph interior', 2, { ...base, rpm: 1700, load: 0.25, thr: 0.2, boost: 1, speed: 31, interior: 1, squeal: 0, spin: 0 });
seg('cruise 70mph int. KO2 hum', 2, { ...base, rpm: 1700, load: 0.25, thr: 0.2, boost: 1, speed: 31, interior: 1, squeal: 0, spin: 0, hum: 1 });
seg('coast 40mph ext. KO2 hum', 2, { ...base, rpm: 1200, load: 0.02, thr: 0, boost: 0, speed: 18, interior: 0, squeal: 0, spin: 0, hum: 1 });
seg('coast 40mph ext. P Zero', 2, { ...base, rpm: 1200, load: 0.02, thr: 0, boost: 0, speed: 18, interior: 0, squeal: 0, spin: 0, hum: 0 });
// Mopar Drag Pak: 354 Whipple race engine with open headers (race: 1)
const dp = { ...base, race: 1, rpmRef: 8800, boostRef: 24, whine: 1.7, squeal: 0, spin: 0, interior: 0, speed: 0 };
seg('DRAG PAK idle 1150', 2, { ...dp, rpm: 1150, load: 0.06, thr: 0, boost: 0 });
seg('DRAG PAK transbrake 4200', 1.5, { ...dp, rpm: 4200, load: 0.5, thr: 1, boost: 22 });
seg('DRAG PAK WOT 8800', 2, { ...dp, rpm: 8800, load: 1, thr: 1, boost: 24, speed: 60 });
seg('DRAG PAK cockpit WOT 8000', 1.5, { ...dp, rpm: 8000, load: 1, thr: 1, boost: 24, speed: 60, interior: 1 });
// Modified pulling tractor: four blown methanol HEMIs / two supercharged V12 aircraft engines, open zoomies, open cockpit
const q4 = { ...base, nEng: 4, cyl: 8, race: 1, rpmRef: 8400, boostRef: 38, whine: 1.4, fmul: 0.62, deep: 1, loud: 1, open: 1, whK: 0.19, whPure: 0, squeal: 0, spin: 0, interior: 0, speed: 0 };
seg('PULLER 4xHEMI idle 1300', 2, { ...q4, rpm: 1300, load: 0.06, thr: 0, boost: 0 });
seg('PULLER 4xHEMI rev 4500', 1.5, { ...q4, rpm: 4500, load: 0.6, thr: 1, boost: 20 });
seg('PULLER 4xHEMI WOT 8200', 2, { ...q4, rpm: 8200, load: 1, thr: 1, boost: 38, speed: 20 });
seg('PULLER 4xHEMI cockpit WOT', 1.5, { ...q4, rpm: 7800, load: 1, thr: 1, boost: 38, speed: 20, interior: 1 });
const v12 = { ...base, nEng: 2, cyl: 12, race: 0.5, rpmRef: 3700, boostRef: 35, whine: 1.2, fmul: 0.5, deep: 1, loud: 1, open: 1, whK: 2.0, whPure: 1, squeal: 0, spin: 0, interior: 0, speed: 0 };
seg('PULLER 2xV12 idle 750', 2, { ...v12, rpm: 750, load: 0.06, thr: 0, boost: 0 });
seg('PULLER 2xV12 rev 2200', 1.5, { ...v12, rpm: 2200, load: 0.6, thr: 1, boost: 15 });
seg('PULLER 2xV12 WOT 3700', 2, { ...v12, rpm: 3700, load: 1, thr: 1, boost: 35, speed: 20 });
// dragsters: one open-header blown HEMI right behind the driver - Top Fuel on nitro (ragged, loud, deep), Top Alcohol
const tf = { ...base, nEng: 1, cyl: 8, race: 1, rpmRef: 8400, boostRef: 58, whine: 1.1, fmul: 0.8, deep: 0.7, loud: 1, open: 1, whK: 0.19, whPure: 0, rough: 0.9, squeal: 0, spin: 0, interior: 0, speed: 0 };
seg('TOP FUEL idle 2000', 2, { ...tf, rpm: 2000, load: 0.06, thr: 0, boost: 0 });
seg('TOP FUEL clutch in 4500', 1.5, { ...tf, rpm: 4500, load: 0.5, thr: 1, boost: 30 });
seg('TOP FUEL WOT 8000', 2, { ...tf, rpm: 8000, load: 1, thr: 1, boost: 58, speed: 100 });
seg('TOP FUEL cockpit WOT 8000', 1.5, { ...tf, rpm: 8000, load: 1, thr: 1, boost: 58, speed: 100, interior: 1 });
const ta = { ...tf, rpmRef: 9400, boostRef: 42, whine: 1.3, fmul: 0.9, deep: 0.35, loud: 0.8, rough: 0.35 };
seg('TOP ALCOHOL idle 1600', 2, { ...ta, rpm: 1600, load: 0.06, thr: 0, boost: 0 });
seg('TOP ALCOHOL WOT 9300', 2, { ...ta, rpm: 9300, load: 1, thr: 1, boost: 42, speed: 90 });
// write wav
const N = out.length, bufW = Buffer.alloc(44 + N * 2);
bufW.write('RIFF', 0); bufW.writeUInt32LE(36 + N * 2, 4); bufW.write('WAVEfmt ', 8); bufW.writeUInt32LE(16, 16); bufW.writeUInt16LE(1, 20); bufW.writeUInt16LE(2, 22);
bufW.writeUInt32LE(sr, 24); bufW.writeUInt32LE(sr * 4, 28); bufW.writeUInt16LE(4, 32); bufW.writeUInt16LE(16, 34); bufW.write('data', 36); bufW.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) bufW.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[i] * 32767))), 44 + i * 2);
fs.writeFileSync(__dirname + '/preview.wav', bufW);
console.log('wrote test/preview.wav', (N / 2 / sr).toFixed(1), 's');
