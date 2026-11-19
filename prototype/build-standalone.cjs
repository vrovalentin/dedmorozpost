// Optional convenience export: node prototype/build-standalone.cjs
// No installation, server or external resources are needed to play this file.
const fs = require('node:fs');
const path = require('node:path');
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>' + fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8') + '</style>');
for (const file of ['content.js', 'engine.js', 'app.js']) {
  html = html.replace('<script src="' + file + '" defer></script>', () => '');
  html = html.replace('</body>', () => '<script>\n' + fs.readFileSync(path.join(__dirname, file), 'utf8') + '\n</script>\n</body>');
}
html = html.replace('../art/snowman/snowman-128.webp', () => 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, '../art/snowman/snowman-128.webp')).toString('base64'));
const output = path.join(__dirname, 'play.html');
fs.writeFileSync(output, html);
console.log('Ready: prototype/play.html (' + Buffer.byteLength(html) + ' bytes)');
