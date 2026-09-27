// Bundles index.html + src/*.js into a single self-contained HellcatDrive.html (three.js still loads from the CDN).
// Run: node build.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="(src\/[^"]+\.js)"><\/script>/g, (m, file) => {
  const js = fs.readFileSync(path.join(root, file), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(file + ' contains a closing script tag');
  return `<script>/* ${file} */\n${js}\n</script>`;
});
const out = path.join(root, 'HellcatDrive.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
