// Creed (ideology) system: memes, precepts, certainty, rituals, commands.
import { createWorld } from '../src/sim/world.js';
import { Game } from '../src/sim/game.js';
import { MEMES, MEME, PRECEPTS, memeSlots, incompatible } from '../src/data/creed.js';
import { creedFx, creedMood, approval } from '../src/sim/creed.js';

let bad = 0; const check = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) bad++; };
const world = createWorld({ seed: 77, aiNations: 5 });
world.players.p1 = { id: 'p1', name: 'T', nationId: -1 };
const game = new Game(world);
const r = game.command('p1', { type: 'claim' });
const me = world.nations[r.msg];
check(me.creed && me.creed.memes.length >= 1 && me.creed.memes.length <= memeSlots(me.era), `player nation has ${me.creed.memes.length} memes: ${me.creed.memes}`);
for (const n of Object.values(world.nations)) if (n.creed) for (const a of n.creed.memes) for (const b of n.creed.memes) check(!incompatible(a, b), `no incompatible pair in ${n.name}`);
// add/remove validation
const free = MEMES.find((m) => !me.creed.memes.includes(m.id) && !me.creed.memes.some((x) => incompatible(x, m.id)));
const clash = MEMES.find((m) => me.creed.memes.some((x) => incompatible(x, m.id)));
let res = game.command('p1', { type: 'creed', action: 'meme', op: 'add', id: clash.id });
check(!res.ok, 'incompatible meme refused: ' + res.msg);
if (me.creed.memes.length < memeSlots(me.era)) { res = game.command('p1', { type: 'creed', action: 'meme', op: 'add', id: free.id }); check(res.ok, 'compatible meme added: ' + res.msg); res = game.command('p1', { type: 'creed', action: 'meme', op: 'remove', id: free.id }); check(!res.ok, 'second reform refused during cooldown'); }
res = game.command('p1', { type: 'creed', action: 'precept', issue: 'war', option: 0 }); check(res.ok, 'precept changed: ' + res.msg);
res = game.command('p1', { type: 'creed', action: 'precept', issue: 'toil', option: 2 }); check(!res.ok, 'precept cooldown');
// revelation lifts cooldowns + raises certainty
me.glitter = 999; me.devotion = 9999; me.creed.certainty = 20;
res = game.command('p1', { type: 'power', power: 'revelation' }); check(res.ok && me.creed.certainty >= 50 && me.creed.reformAt === 0, 'revelation: ' + (res.msg || 'ok') + ' certainty ' + me.creed.certainty);
// run 4 years
let rituals = 0, schisms = 0;
const old = world.log.length;
for (let d = 0; d < 48; d++) for (let k = 0; k < 300; k++) game.step(1 / 300);
for (const e of world.log) { if (/held the/.test(e.text)) rituals++; if (/schism/i.test(e.text)) schisms++; }
const nations = Object.values(world.nations).filter((n) => !n.dead && n.creed);
check(nations.every((n) => n.creed.certainty >= 0 && n.creed.certainty <= 100), 'certainty bounded');
check(nations.some((n) => n.creed.last), 'at least one ritual was held');
check(nations.every((n) => Object.keys(n.ideologyTarget).length === 5), 'axis targets derived');
const fx = creedFx(me); check(Number.isFinite(creedMood(me)) && Object.values(fx).every(Number.isFinite), 'fx finite');
console.log('rituals logged for player:', rituals, 'schisms:', schisms);
console.log(nations.map((n) => `${n.name}: ${n.creed.memes.join('+')} cert ${n.creed.certainty.toFixed(0)}`).join('\n'));
if (bad) { console.log(bad + ' failures'); process.exit(1); }
console.log('creed ok');
