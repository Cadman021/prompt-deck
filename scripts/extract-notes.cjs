// scripts/extract-notes.cjs
// Extracts the CHANGELOG section for a version tag (e.g. `v1.4.0` -> `1.4.0`)
// so GitHub release notes always match the changelog. Falls back to a static
// line when the section is missing. Usage: node scripts/extract-notes.cjs v1.4.0
const fs = require('fs');
const path = require('path');

const tag = (process.argv[2] || '').replace(/^v/, '');
const file = path.join(__dirname, '..', 'CHANGELOG.md');
const text = fs.readFileSync(file, 'utf8');

const lines = text.split('\n');
const start = lines.findIndex(
  (l) => l.trim() === `## [${tag}]` || l.trim().startsWith(`## [${tag}] `)
);
if (start < 0) {
  console.log(
    `See the assets below to download and install this version. Refer to CHANGELOG for details.`
  );
  process.exit(0);
}
const body = [];
for (let i = start + 1; i < lines.length; i++) {
  if (/^## \[/.test(lines[i].trim())) break;
  body.push(lines[i]);
}
const out = body.join('\n').trim();
console.log(
  out ||
    'See the assets below to download and install this version. Refer to CHANGELOG for details.'
);
