// Bundles viewer/index.html (+ the before/after car models) into a single HellcatViewer.html. Run: node build-viewer.js
const fs = require('fs'), path = require('path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'viewer', 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, (m, file) => {
  const js = fs.readFileSync(path.join(root, 'viewer', file), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(file + ' contains a closing script tag');
  return `<script>/* ${file} */\n${js}\n</script>`;
});
const out = path.join(root, 'HellcatViewer.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
