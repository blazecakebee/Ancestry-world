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
writeFileSync(new URL('../version.json', import.meta.url), JSON.stringify({ version: CHANGELOG[0].version }) + '\n');
console.log('CHANGELOG.md + version.json written');
