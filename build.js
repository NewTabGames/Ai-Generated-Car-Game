// Bundles index.html + src/*.js into a single self-contained HellcatDrive.html (three.js still loads from the CDN).
// Also stamps index.html's script tags with a hash of each file (src/x.js?v=...), so after a push a refresh fetches the
// changed files instead of running copies the browser cached (GitHub Pages lets browsers keep them for 10 minutes).
// Run: node build.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const TAG = /<script src="(src\/[^"?]+\.js)(?:\?v=[0-9a-f]+)?"><\/script>/g;
const idxPath = path.join(root, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
const stamped = html.replace(TAG, (m, file) => `<script src="${file}?v=${crypto.createHash('sha1').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 10)}"></script>`);
if (stamped !== html) { fs.writeFileSync(idxPath, stamped); html = stamped; }
html = html.replace(TAG, (m, file) => {
  const js = fs.readFileSync(path.join(root, file), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(file + ' contains a closing script tag');
  return `<script>/* ${file} */\n${js}\n</script>`;
});
const out = path.join(root, 'HellcatDrive.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
