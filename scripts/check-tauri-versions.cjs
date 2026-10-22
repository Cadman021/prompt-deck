// scripts/check-tauri-versions.js
// Release gate: every Tauri npm package must share its major.minor with the
// matching Rust crate, otherwise `tauri build` hard-fails.
//
// npm and cargo updates arrive as separate Dependabot PRs, so this runs in
// .github/workflows/release.yml (not ci.yml) — gating every PR would block
// both halves forever while still letting GitHub merge them in any order.
//
// Reads lockfiles only (no install needed):
//   node scripts/check-tauri-versions.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const npmLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const cargoLock = fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.lock'), 'utf8');

const npmVer = (pkg) => npmLock.packages?.[`node_modules/${pkg}`]?.version;

const cargoVer = (name) => {
  const m = cargoLock.match(new RegExp(`name = "${name}"\nversion = "([^"]+)"`));
  return m && m[1];
};

const pairs = [
  ['tauri', '@tauri-apps/api'],
  ['tauri-plugin-updater', '@tauri-apps/plugin-updater'],
  ['tauri-plugin-process', '@tauri-apps/plugin-process'],
  ['tauri-plugin-sql', '@tauri-apps/plugin-sql'],
  ['tauri-plugin-opener', '@tauri-apps/plugin-opener'],
];

const minor = (v) => v.split('.').slice(0, 2).join('.');
let failed = false;
for (const [crate, pkg] of pairs) {
  const c = cargoVer(crate);
  const n = npmVer(pkg);
  if (!c || !n) {
    console.log(`SKIP  ${crate} (cargo=${c} npm=${n}) — package missing from lockfiles`);
    continue;
  }
  const ok = minor(c) === minor(n);
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${crate} ${c} vs ${pkg} ${n}`);
}

if (failed) {
  console.error('\nTauri npm/Rust version mismatch — merge the matching update PR first.');
  process.exit(1);
}
console.log('\nAll Tauri pairs aligned.');
