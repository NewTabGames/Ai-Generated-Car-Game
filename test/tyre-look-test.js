// Every vehicle, every tyre choice the game offers it: the model has to look different on each one. The Touring
// Bagger's and the unicycle's knobbies were once drawn as their road tyres - the models ignored the choice. This loads
// the game in headless Chromium, takes its own list of vehicles (window.__hc.carIds - the title screen's cars and every
// More Cars card, so a new vehicle is covered the day it's added) and, for each with each of its options, builds the
// model the way online play builds the others' cars, puts every pair of tyres from the game's tyreChoices() on it and
// compares what's drawn (the visible meshes, their geometry, materials and textures, and where they sit). Two
// different pairs drawn the same fails.
//
// Needs Playwright and its Chromium (npm i -D playwright && npx playwright install chromium, or NODE_PATH pointing at
// an install); without it the test says so and exits 0. Three.js comes from the CDN the game uses, or from
// THREE_MODULE=/path/to/three.module.js (or an installed three package) when offline.
// node test/tyre-look-test.js            ONLY=bike,unicycle node test/tyre-look-test.js
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('SKIP: tyre-look-test needs Playwright (npm i -D playwright && npx playwright install chromium)'); process.exit(0);
}
const ROOT = path.join(__dirname, '..');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
let threeLocal = process.env.THREE_MODULE || null;
if (!threeLocal) try { threeLocal = require.resolve('three/build/three.module.js'); } catch (e) { /* the CDN, then */ }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  if (threeLocal) await page.route(THREE_URL, (r) => r.fulfill({ path: threeLocal, contentType: 'text/javascript' }));
  await page.route(/firebase|gstatic/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.__hc && window.__hc.tyreChoices, null, { timeout: 180000 });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const ids = (await page.evaluate(() => window.__hc.carIds)).filter((id) => !only || only.includes(id));
  let bad = 0, checked = 0;
  for (const id of ids) {
    const rows = await page.evaluate((id) => {
      const h = window.__hc, out = [];
      // (what's drawn: each visible mesh, its geometry, its material and texture, and its place - a tyre swapped by
      // visibility, geometry, material, texture or scale shows)
      const mats = (m) => (Array.isArray(m) ? m : [m]).map((x) => x.id + '.' + (x.map ? x.map.id : '-')).join('+');
      const sig = (root) => {
        root.updateMatrixWorld(true); const v = [];
        root.traverseVisible((o) => { if (o.isMesh) v.push(o.id + ':' + o.geometry.id + ':' + mats(o.material) + ':' + Array.from(o.matrixWorld.elements, (x) => x.toFixed(3)).join(',')); });
        return v.join('|');
      };
      for (const opt of h.optionsOf(id)) {
        const label = id + (opt ? ':' + opt : '');
        try {
          const choices = h.tyreChoices(id, opt);
          if (choices.length < 2) { out.push({ label, n: choices.length }); continue; }
          const def = h.defOf(id, opt);
          const gv = new h.VEH.Vehicle({ C: h.W.C, ground: h.W.ground, collidersNear: (x, z, r, c, b) => { c.length = 0; b.length = 0; } }, Object.assign({}, def.spec));
          const model = h.buildModel(id, def, gv.spec);
          const looks = choices.map(([f, r]) => { model.setTires(f, r); return sig(model.root); });
          const same = [];
          for (let a = 0; a < choices.length; a++) for (let b = a + 1; b < choices.length; b++) if (looks[a] === looks[b]) same.push(choices[a].join('/') + ' = ' + choices[b].join('/'));
          out.push({ label, n: choices.length, choices: choices.map((c) => c.join('/')), same });
        } catch (e) { out.push({ label, err: String(e && e.stack || e).split('\n').slice(0, 2).join(' ') }); }
      }
      return out;
    }, id);
    for (const r of rows) {
      if (r.err) { bad++; console.log(`  ${r.label.padEnd(22)} ERROR ${r.err}`); continue; }
      if (!r.choices) continue;
      checked++;
      if (r.same.length) { bad++; console.log(`  ${r.label.padEnd(22)} SAME LOOK: ${r.same.join(' · ')}`); }
      else console.log(`  ${r.label.padEnd(22)} ok - ${r.n} tyre choices, each drawn differently (${r.choices.join(' · ')})`);
    }
  }
  if (errs.length) { bad++; console.log('page errors: ' + errs.slice(0, 5).join(' | ')); }
  console.log(`${checked} vehicle versions with a tyre choice checked`);
  await browser.close(); server.close();
  if (bad) { console.log('FAIL: a tyre choice the model doesn\'t draw (see above)'); process.exit(1); }
})().catch((e) => { console.log('FAIL: ' + e.message); server.close(); process.exit(1); });
