#!/usr/bin/env node
/* Set the release number in both places the freshness check compares:
   frontend/js/config.js (what the browser runs) and frontend/version.json
   (what is deployed). Run before committing a frontend release.
     node tools/bump-build.js            -> YYYY-MM-DD.N, N bumped
*/
const fs = require('fs'), path = require('path');
const cfg = path.join(__dirname, '..', 'frontend', 'js', 'config.js');
const ver = path.join(__dirname, '..', 'frontend', 'version.json');
const src = fs.readFileSync(cfg, 'utf8');
const m = src.match(/export const BUILD = '([^']+)';/);
if (!m) { console.error('BUILD not found in config.js'); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const [d, n] = m[1].split('.');
const next = d === today ? `${today}.${Number(n || 0) + 1}` : `${today}.1`;
fs.writeFileSync(cfg, src.replace(m[0], `export const BUILD = '${next}';`));
fs.writeFileSync(ver, JSON.stringify({ build: next }) + '\n');
console.log(`build ${m[1]} -> ${next}`);
