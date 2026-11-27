// Every divine power must actually do something: cast each one on a prepared target and check that the world changed.
// Immediate effects are diffed from a snapshot taken right before the cast; weather & lasting powers are also checked
// after the world has run for a while (the change must persist, not be washed out by the next tick).
// deterministic: the sim and this test both draw on Math.random in places
{ let seed = 12345; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }
import { createWorld, placeBuilding } from '../src/sim/world.js';
import { Game } from '../src/sim/game.js';
import { POWERS } from '../src/data/powers.js';
import { F, B, BIOMES } from '../src/data/biomes.js';
import { injure, addDisease } from '../src/sim/health.js';
import { ensureRaiderNation } from '../src/sim/events.js';
import { createPawn } from '../src/sim/pawn.js';
import { cellAt } from '../src/world/atmosphere.js';
import { DAY_LEN } from '../src/core/time.js';

import { POWER_FX } from '../src/data/powerfx.js';
const only = process.argv[2] ? process.argv[2].split(',') : null;
let bad = 0; const fails = [];
// every power has its own look & sound
{ const seen = new Map(); for (const P of POWERS) { const f = POWER_FX[P.id]; if (!f) { bad++; fails.push(P.id + ' (no fx recipe)'); continue; } const k = [f.snd, f.p, f.vfx, f.spx].join('|'); if (seen.has(k)) { bad++; fails.push(`${P.id} shares fx with ${seen.get(k)}`); } seen.set(k, P.id); } }
const world = createWorld({ seed: 11, aiNations: 3 });
world.players.p1 = { id: 'p1', name: 'T', nationId: -1 };
const game = new Game(world);
const me = world.nations[game.command('p1', { type: 'claim' }).msg];
me.devotion = 1e6; me.era = 7; me.glitter = 1e7;
const W = world.W, t = world.tiles;
const cap = world.settlements[me.capitalId];
const run = (days) => { for (let k = 0; k < Math.round(days * DAY_LEN * 300); k++) game.step(1 / 300); };
run(0.5);
const mine = () => Object.values(world.pawns).filter((p) => !p.dead && p.nationId === me.id);
const near = (x, y, r) => Object.values(world.pawns).filter((p) => !p.dead && Math.hypot(p.x - x, p.y - y) <= r);
const idx = (x, y) => y * W + ((x % W) + W) % W;

// ---- targets ----
function ownLand(dx, dy) { return [cap.x + dx, cap.y + dy]; }
function findTile(pred, maxR = 60) { for (let r = 2; r < maxR; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) { if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue; const x = cap.x + ox, y = cap.y + oy; if (y < 3 || y > world.H - 4) continue; if (pred(idx(x, y), x, y)) return [x, y]; } return null; }
const wildLand = () => findTile((i, x, y) => { for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) { const j = idx(x + ox, y + oy); if (t.owner[j] !== -1 || BIOMES[t.biome[j]].water) return false; } return Object.values(world.pawns).every((p) => p.dead || Math.hypot(p.x - x, p.y - y) > 6); }, 120);
const water = () => findTile((i) => BIOMES[t.biome[i]].water && (t.owner[i] === -1 || t.owner[i] === me.id), 120);

/** Make a small test patch around (x,y): fields of growing crops, trees, berries, open ground. */
function prepPatch(x, y, r = 3) {
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    const i = idx(x + ox, y + oy); if (t.bld[i] >= 0 || BIOMES[t.biome[i]].water) continue;
    const k = (ox + 7 * oy + 100) % 4;
    t.feat[i] = k === 0 ? F.FARM : k === 1 ? F.TREE : k === 2 ? F.BERRY : F.NONE; if (k === 0) t.crop[i] = 90; world.dirty.add(i);
  }
}
function hurtAll(ps) { for (const p of ps) { injure(p, world.rng, 12, 'blunt'); for (const j of p.injuries) j.bleed = 0; p.brk = { type: 'sadWander', lvl: 'minor', until: world.time + 5 }; if (!p.diseases.length) addDisease(p, 'flu', 0.3); p.mood = 30; } }
function spawnBeast(x, y) { const id = world.nextId.animal++; world.animals[id] = { id, kind: 'slime_red', x, y, hp: 200, dead: false, facing: 1, vx: 0, vy: 0, t: 0 }; return id; }
function spawnFoes(x, y, n = 3) {
  const rn = ensureRaiderNation(world); rn.relations[me.id] = { state: 'war', opinion: -100, since: world.time }; me.relations[rn.id] = { state: 'war', opinion: -100, since: world.time };
  for (let k = 0; k < n; k++) { const p = createPawn(world.rng, { lang: 0, race: 'orc', nationId: rn.id, settlementId: -1, x: x + k * 0.4, y, age: 25 }); p.role = 'soldier'; p.raider = { sid: cap.id, until: world.time + 9 }; world.pawns[p.id] = p; }
}

// ---- snapshot / diff ----
function snap(x, y, r) {
  const o = {};
  o.nation = [me.stability, me.creed?.certainty, me.creed?.reformAt, me.champion].join('|');
  o.fields = cap.buildings.map((id) => world.buildings[id]).filter((b) => b && b.type === 'farm').map((b) => { let c = 0; for (let oy = 0; oy < b.h; oy++) for (let ox = 0; ox < b.w; ox++) c += t.crop[idx(b.x + ox, b.y + oy)]; return c; }).join(',');
  o.stock = JSON.stringify(cap.stock) + JSON.stringify(cap.until || {});
  const ps = near(x, y, r + 6);
  for (const p of mine()) ps.includes(p) || (p.id === world._tp && ps.push(p));
  o.pawns = ps.map((p) => [p.id, Math.round(p.mood), p.needs.food.toFixed(2), p.needs.rest.toFixed(2), p.needs.joy.toFixed(2), (p.needs.social ?? 0).toFixed(2), p.injuries.reduce((a, j) => a + j.sev, 0).toFixed(2), p.diseases.length, p.brk ? 1 : 0, Object.entries(p.buff).map(([k, v]) => k + (typeof v === 'number' ? v.toFixed(2) : v)).sort().join(','), p.thoughts.length, p.insp?.type, p.lover, JSON.stringify(p.tools || {}), p.role, p.traits.join(','), Object.values(p.skills).reduce((a, s) => a + s.xp + s.lvl * 1000, 0).toFixed(0), p.blood.toFixed(2), p.x.toFixed(1), p.y.toFixed(1)].join(':')).join(';');
  let tl = ''; for (let oy = -r - 2; oy <= r + 2; oy++) for (let ox = -r - 2; ox <= r + 2; ox++) { const i = idx(x + ox, y + oy); tl += `${t.feat[i]},${t.biome[i]},${t.height[i].toFixed(3)},${t.crop[i]},${t.fire[i]},${t.water[i].toFixed(2)},${t.pollution[i]},${t.featHp?.[i]}|`; }
  o.tiles = tl;
  const a = world.atmo, c = cellAt(a, x, y); o.atmo = [a.T[c], a.precip[c], a.cloud[c], a.snow[c], a.Hm[c], a.anomaly[c], (a.zones || []).length, a.overrides.length].map((v) => (+v).toFixed(3)).join('|');
  o.animals = Object.values(world.animals).filter((q) => !q.dead).map((q) => q.id + ':' + Math.round(q.hp)).join(',');
  o.misc = [world.fireActive.size, Object.keys(world.drops || {}).length, Object.values(world.drops || {}).reduce((a, d) => a + d.n, 0), me.techProg, Object.values(world.buildings).reduce((a, b) => a + (b.progress || 0), 0).toFixed(2), Object.values(world.animals).filter((q) => q.lure).length].join('|');
  return o;
}
const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

// ---- weather expectations: checked again after the world has run half a day ----
const LASTING = {
  rain: (a, c) => a.precip[c] > 0.08 && a.cloud[c] > 0.5,
  snowfall: (a, c) => a.snow[c] > 0.2 && a.T[c] < 0,
  sunbeam: (a, c) => a.cloud[c] < 0.1 && a.precip[c] < 0.02,
  frostnip: (a, c, b) => a.T[c] < b.T - 4,
  thaw: (a, c, b) => a.T[c] > b.T + 3 && a.snow[c] < 0.05,
  droughtnudge: (a, c) => a.precip[c] < 0.02 && a.cloud[c] < 0.15,
  heatwave: (a, c, b) => a.T[c] > b.T + 6,
  coldsnap: (a, c, b) => a.T[c] < b.T - 6,
  breeze: (a, c) => Math.hypot(a.U[c], a.V[c]) > 8,
};

function topUp() {
  for (const p of mine()) { p.injuries = []; p.diseases = []; p.blood = 1; p.pain = 0; p.downed = false; p.brk = null; }
  while (mine().length < 10) { const p = createPawn(world.rng, { lang: me.lang, race: me.race || 'human', nationId: me.id, settlementId: cap.id, x: cap.x + Math.random() * 3, y: cap.y + Math.random() * 3, age: 25 }); world.pawns[p.id] = p; }
}
const results = [];
for (const P of POWERS) {
  if (only && !only.includes(P.id)) continue;
  topUp(); world.atmo.zones = []; world.atmo.anomaly.fill(0);
  me.cooldowns = {}; me.glitter = 1e7;
  let cmd = { type: 'power', power: P.id }, x = cap.x + 4, y = cap.y + 3;
  const adult = mine().find((p) => p.age >= 20 && !p.downed) || mine()[0];
  if (P.target === 'pawn') { cmd.pid = adult.id; world._tp = adult.id; x = Math.floor(adult.x); y = Math.floor(adult.y); hurtAll([adult]); }
  else if (P.target === 'settlement') { cmd.sid = cap.id; x = cap.x; y = cap.y; hurtAll(mine().slice(0, 3)); cap.stock.food = Math.max(cap.stock.food, 60); for (const p of mine().slice(0, 2)) p.role = 'soldier'; }
  else if (P.target === 'self') { x = cap.x; y = cap.y; }
  else {
    let pt = ownLand(4, 3);
    if (['fishshoal', 'isle', 'tsunami'].includes(P.id)) pt = water() || pt;
    if (['meteor', 'meteorshower'].includes(P.id)) pt = wildLand() || pt;
    [x, y] = pt; cmd.x = x + 0.5; cmd.y = y + 0.5;
    if (P.id === 'oasis') { const i = idx(x, y); t.biome[i] = B.DESERT; t.feat[i] = F.NONE; for (let k = 1; k < 3; k++) t.biome[idx(x + k, y)] = B.DESERT; }
    if (['spring', 'oasis'].includes(P.id)) { const i = idx(x, y); t.feat[i] = F.NONE; t.water[i] = 0; }
    if (!['fishshoal', 'isle', 'tsunami', 'meteor', 'meteorshower'].includes(P.id)) prepPatch(x, y, Math.min(4, P.radius || 2));
    if (['smite', 'wrath', 'firearrows', 'lightning'].includes(P.id)) spawnBeast(x + 0.5, y + 0.5);
    if (['thunderclap', 'dread', 'smite', 'wrath', 'firearrows'].includes(P.id)) spawnFoes(x + 0.5, y + 0.5);
    for (const p of mine().slice(0, 3)) { p.x = x + 0.5 + Math.random(); p.y = y + 0.5; p.rx = p.x; p.ry = p.y; p.job = null; }
    hurtAll(near(x, y, (P.radius || 2) + 1).filter((p) => p.nationId === me.id));
    if (['snowfall', 'thaw'].includes(P.id)) { const a = world.atmo, c = cellAt(a, x, y); if (P.id === 'thaw') a.snow[c] = 0.8; }
    if (P.id === 'blesscrops' || P.id === 'harvest') for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const i = idx(x + ox, y + oy); if (t.feat[i] === F.FARM) t.crop[i] = 60; }
  }
  if (P.id === 'prophecy') { adult.age = 30; }
  if (P.id === 'matchmaker') for (const p of mine()) { p.lover = -1; p.spouse = -1; }
  if (P.id === 'toolgift') for (const p of mine()) { p.tools = {}; p.work = 'miner'; }
  if (P.id === 'builders') { placeBuilding(world, cap, 'hut', cap.x + 6, cap.y - 6, false); }
  if (P.id === 'seeds') { let b = null; for (let k = 0; k < 400 && !b; k++) b = placeBuilding(world, cap, 'farm', cap.x - 20 + (k % 20) * 2, cap.y - 20 + Math.floor(k / 20) * 2, false); if (b) { b.built = true; b.progress = 1; for (let oy = 0; oy < b.h; oy++) for (let ox = 0; ox < b.w; ox++) { const i = idx(b.x + ox, b.y + oy); t.feat[i] = F.FARM; t.crop[i] = 0; } } }
  if (P.id === 'lure') for (let k = 0; k < 3; k++) { const id = world.nextId.animal++; world.animals[id] = { id, kind: 'cow', x: x + 15 + k, y: y + 4, hp: 80, dead: false, facing: 1, vx: 0, vy: 0, t: 0 }; }
  const a = world.atmo, c = cellAt(a, x, y);
  const base = { T: a.T[c], precip: a.precip[c], cloud: a.cloud[c], snow: a.snow[c] };
  const before = snap(x, y, P.radius || 2);
  const r = game.command('p1', cmd);
  if (!r.ok) { results.push([P.id, 'REFUSED', r.msg, 'cap', cap.id, !!world.settlements[cap.id], me.capitalId, JSON.stringify(cmd)]); bad++; fails.push(P.id); continue; }
  const now = diff(before, snap(x, y, P.radius || 2));
  let lasting = '';
  if (LASTING[P.id]) {
    // compare against the same cell in a control world? we instead check an absolute outcome after half a day
    run(0.5);
    const okL = LASTING[P.id](a, c, base);
    lasting = okL ? 'lasting ok' : `LASTING FAIL T${a.T[c].toFixed(1)} (was ${base.T.toFixed(1)}) p${a.precip[c].toFixed(2)} cl${a.cloud[c].toFixed(2)} sn${a.snow[c].toFixed(2)}`;
    if (!okL) { bad++; fails.push(P.id); }
  }
  if (!now.length) { bad++; fails.push(P.id); }
  results.push([P.id, now.length ? 'changed: ' + now.join(',') : 'NO EFFECT', lasting, process.env.DBG ? 'pop ' + mine().length + (me.dead ? ' DEAD' : '') + ' ' + Object.values(world.pawns).filter((p) => p.nationId === me.id && p.dead).map((p) => p.deathCause).join('/') : '']);
  run(0.02);
}
for (const r of results) console.log(r.join('  '));
if (bad) { console.log(`${bad} failures: ${fails.join(', ')}`); process.exit(1); }
console.log('powers ok');
