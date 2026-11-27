// Regenerates CHANGELOG.md from src/data/changelog.js:  node tools/changelog-md.mjs
import { writeFileSync } from 'node:fs';
import { CHANGELOG } from '../src/data/changelog.js';
const label = { new: 'New', improved: 'Improved', fixed: 'Fixed', balance: 'Balance' };
let md = '# Ancestry World — Update Log\n\nAlso available in-game: **Main menu → What\'s New**.\n';
for (const v of CHANGELOG) {
  md += `\n## v${v.version} — ${v.title} (${v.date})\n\n`;
  for (const [t, text] of v.notes) md += `- **${label[t]}:** ${text}\n`;
}
writeFileSync(new URL('../CHANGELOG.md', import.meta.url), md);
// version.json also lists every file the page loads, so the in-game Reload button can refresh the browser's HTTP cache first
// (GitHub Pages caches files for ~10 minutes, which made a plain reload keep serving the old version).
import { readdirSync, statSync } from 'node:fs';
const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = ['index.html', 'styles/main.css'];
const walk = (d) => { for (const f of readdirSync(root + d)) { const rel = d + '/' + f; if (statSync(root + rel).isDirectory()) walk(rel); else if (rel.endsWith('.js')) files.push(rel); } };
walk('src');
writeFileSync(new URL('../version.json', import.meta.url), JSON.stringify({ version: CHANGELOG[0].version, files }) + '\n');
console.log('CHANGELOG.md + version.json written');
