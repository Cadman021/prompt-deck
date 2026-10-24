// scripts/copy-font-licenses.cjs
// Ships the OFL notices with the build.
//
// Inter, JetBrains Mono and Vazirmatn are bundled under the SIL Open Font
// License 1.1, which requires the licence to travel with the font. The font
// files are copied into `dist/assets/` by Vite, but their LICENSE files are
// not (they are not imported by any module), so an installer built from `dist`
// shipped the fonts without the notice. This copies them into
// `dist/fonts-licenses/` after the build.
//
// Runs from `npm run build`; silently skips a missing package rather than
// failing the build.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'fonts-licenses');

const FAMILIES = ['inter', 'jetbrains-mono', 'vazirmatn'];

if (!fs.existsSync(dist)) {
  console.log('copy-font-licenses: no dist/ yet, skipping');
  process.exit(0);
}

fs.mkdirSync(out, { recursive: true });
let copied = 0;
for (const family of FAMILIES) {
  const src = path.join(root, 'node_modules', '@fontsource-variable', family, 'LICENSE');
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(out, `${family}-OFL.txt`));
  copied += 1;
}

// Also ship the human-readable index so the licence folder is self-explaining.
const index = path.join(root, 'THIRD_PARTY_NOTICES.md');
if (fs.existsSync(index)) {
  fs.copyFileSync(index, path.join(out, 'THIRD_PARTY_NOTICES.md'));
}

console.log(`copy-font-licenses: ${copied} font licence(s) written to dist/fonts-licenses/`);
