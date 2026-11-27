// Headless simulation test: run several in-game years and check the world stays sane.
import { createWorld } from '../src/sim/world.js';
import { Game } from '../src/sim/game.js';
import { ERAS } from '../src/data/eras.js';

const days = +(process.argv[2] || 24);
const t0 = performance.now();
const world = createWorld({ seed: 4242, aiNations: 5 });
world.players.p1 = { id: 'p1', name: 'Tester', nationId: -1 };
const game = new Game(world);
const r = game.command('p1', { type: 'claim' });
if (!r.ok) throw new Error('claim failed: ' + r.msg);
console.log('world gen ms', (performance.now() - t0) | 0);
const me = world.nations[r.msg];
const t1 = performance.now();
let ticks = 0;
for (let d = 0; d < days; d++) {
  for (let k = 0; k < 300; k++) { game.step(1 / 300); ticks++; }
  if (d % 4 === 3) {
    const alive = Object.values(world.pawns).filter((p) => !p.dead);
    const nations = Object.values(world.nations).filter((n) => !n.dead && !n.raider);
    console.log(`day ${d + 1} pop=${alive.length} nations=${nations.length} settlements=${Object.keys(world.settlements).length} buildings=${Object.keys(world.buildings).length} | mine: era=${ERAS[me.era].name} glitter=${me.glitter.toFixed(0)} rp=${me.research.toFixed(0)} pop=${alive.filter(p=>p.nationId===me.id).length}`);
  }
}
const ms = performance.now() - t1;
console.log(`sim ${ticks} ticks in ${ms | 0}ms => ${(ms / ticks).toFixed(2)} ms/tick`);
// command checks
const s = Object.values(world.settlements).find((x) => x.nationId === me.id);
const pawn = Object.values(world.pawns).find((p) => p.nationId === me.id && !p.dead);
me.glitter = 1000; me.devotion = 5000;
for (const c of [
  { type: 'power', power: 'heal', pid: pawn.id }, { type: 'power', power: 'harvest', sid: s.id },
  { type: 'power', power: 'rain', x: s.x, y: s.y }, { type: 'possess', pid: pawn.id }, { type: 'ctrl', mx: 1, my: 0 }, { type: 'release' },
]) { const res = game.command('p1', c); console.log(c.type, c.power || '', res.ok ? 'ok' : 'FAIL ' + res.msg); }

// every divine power must apply through applyCommand without throwing (success or a graceful refusal)
{
  const { POWERS } = await import('../src/data/powers.js');
  const home = Object.values(world.settlements).find((x) => x.nationId === me.id) || s;
  const foe = Object.values(world.nations).find((n) => !n.dead && n.id !== me.id && !n.raider);
  me.devotion = 1e6; let applied = 0, refused = 0;
  for (const P of POWERS) {
    if (!P.cat || !P.color || P.radius === undefined || !P.icon) throw new Error('power missing cat/color/radius/icon: ' + P.id);
    me.glitter = 5000; me.cooldowns = {}; me.era = Math.max(me.era, 7);
    const p0 = Object.values(world.pawns).find((p) => p.nationId === me.id && !p.dead) || pawn;
    const cmd = { type: 'power', power: P.id, x: Math.floor(home.x + 2), y: Math.floor(home.y + 2), pid: p0.id, sid: home.id, axis: 'faith', dir: 1, angle: 1 };
    let res; try { res = game.command('p1', cmd); } catch (e) { throw new Error(`power ${P.id} threw: ${e.stack}`); }
    res.ok ? applied++ : refused++;
    for (let k = 0; k < 30; k++) game.step(1 / 300); // effects must also survive some ticks
  }
  // wild-land variants (spawns, nature, curses) at a distant unowned spot
  let wx = 0, wy = 0;
  outer: for (let y = 20; y < world.H - 20; y += 3) for (let x = 0; x < world.W; x += 3) { const i = y * world.W + x; if (world.tiles.owner[i] === -1 && world.tiles.biome[i] === 4) { wx = x; wy = y; break outer; } }
  for (const P of POWERS.filter((q) => q.target === 'tile')) { me.glitter = 5000; me.cooldowns = {}; const r = game.command('p1', { type: 'power', power: P.id, x: wx, y: wy }); r.ok ? applied++ : refused++; for (let k = 0; k < 20; k++) game.step(1 / 300); }
  console.log(`powers: ${POWERS.length} defined, ${applied} applied, ${refused} refused gracefully`);
  if (!applied) throw new Error('no power applied');
  if (POWERS.length < 46) throw new Error('expected >= 46 powers');
  const spawned = Object.values(world.animals).filter((a) => a.patron === me.id).length; console.log('summoned animals alive:', spawned);
}
// permission check: power on another nation's land must fail
const other = Object.values(world.settlements).find((x) => x.nationId !== me.id);
const res = game.command('p1', { type: 'power', power: 'omen', sid: other.id });
console.log('power on foreign land blocked:', !res.ok, '-', res.msg);
const cats = {}; for (const e of world.log) cats[e.cat] = (cats[e.cat] || 0) + 1; console.log('log cats', cats);
console.log(world.log.slice(-12).map((e) => e.text).join('\n'));
