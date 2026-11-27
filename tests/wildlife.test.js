// Wildlife: the planet is seeded across the map, species vary, animals breed and the population stays bounded.
import { createWorld } from '../src/sim/world.js';
import { Game } from '../src/sim/game.js';
import { wildTarget } from '../src/sim/animals.js';
import { ANIMALS } from '../src/sim/combat.js';
const FARM = ['cow', 'sheep', 'dog', 'cat', 'horse', 'pig', 'goat', 'chicken', 'rabbit', 'duck'];
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) bad++; };
for (const [k, A] of Object.entries(ANIMALS)) if (A.art && !FARM.includes(A.art)) ok(false, `${k} art ${A.art} is not a farm sprite`);
const world = createWorld({ seed: 99, aiNations: 4 });
world.players.p1 = { id: 'p1', name: 'T', nationId: -1 };
const game = new Game(world); game.command('p1', { type: 'claim' });
for (let k = 0; k < 40; k++) game.step(1 / 300);
const kinds = new Set(Object.values(world.animals).map((a) => a.kind));
ok(Object.keys(world.animals).length > wildTarget(world) * 0.5, `seeded ${Object.keys(world.animals).length} animals (target ${wildTarget(world)})`);
ok(kinds.size >= 6, `${kinds.size} species present`);
// spread: animals should appear in every quadrant of the map, not just near settlements
const quad = new Set(Object.values(world.animals).map((a) => (a.x < world.W / 2 ? 0 : 1) + (a.y < world.H / 2 ? 0 : 2)));
ok(quad.size === 4, 'animals in all four map quadrants');
const before = Object.keys(world.animals).length;
let born = 0; for (let d = 0; d < 14; d++) { for (let k = 0; k < 300; k++) game.step(1 / 300); born += Object.values(world.animals).filter((a) => a.baby).length > 0 ? 1 : 0; }
ok(born > 0, 'young are born');
const after = Object.keys(world.animals).length;
ok(after <= wildTarget(world) * 1.4 && after > before * 0.5, `population bounded (${before} -> ${after})`);
if (bad) process.exit(1); console.log('wildlife ok');
