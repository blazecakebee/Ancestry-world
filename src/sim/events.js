// Storyteller (per-nation incidents), World Ages (planet-wide eras of fortune) and disasters.
import { CS, cellAt } from '../world/atmosphere.js';
import { ignite } from '../world/physics.js';
import { addDisease, injure } from './health.js';
import { createPawn, addThought, fullName } from './pawn.js';
import { logEvent, emitFx, settlementBuildings, pawnsNear, removeBuilding, bCenter } from './world.js';
import { startInspiration } from './ai.js';
import { BIOMES, B, F } from '../data/biomes.js';
import { wrap, dist, clamp } from '../core/util.js';
import { ANIMALS } from './combat.js';
import { rel } from './war.js';

export const WORLD_AGES = {
  hope:    { name: 'Age of Hope', desc: 'Spirits are high. +Mood, more births.', color: '#ffe9a6', temp: 0 },
  sun:     { name: 'Age of Sun', desc: 'A blazing sun. Hotter world, droughts.', color: '#ffb347', temp: 5 },
  dark:    { name: 'Age of Dark', desc: 'Long shadows. Predators grow bold.', color: '#5a5a8a', temp: -1 },
  tears:   { name: 'Age of Tears', desc: 'Endless rain and floods.', color: '#6fa8dc', temp: 0, wet: 1 },
  ice:     { name: 'Age of Ice', desc: 'Glaciers advance. Bitter cold.', color: '#bfe3ff', temp: -7 },
  ash:     { name: 'Age of Ash', desc: 'Volcanoes darken the skies.', color: '#8a7a72', temp: -3 },
  chaos:   { name: 'Age of Chaos', desc: 'Tempers flare. Wars and breakdowns multiply.', color: '#ff5a5a', temp: 0 },
  wonders: { name: 'Age of Wonders', desc: 'Genius flourishes. +Research, inspirations.', color: '#c58cff', temp: 0 },
  despair: { name: 'Age of Despair', desc: 'A heavy gloom settles over the world.', color: '#6b6b6b', temp: -1 },
};

export function stepWorldAge(world, dt, rng) {
  const a = world.age;
  if (world.time > a.until) {
    const keys = Object.keys(WORLD_AGES).filter((k) => k !== a.id);
    const id = rng.weighted(keys.map((k) => [k, k === 'hope' || k === 'wonders' ? 3 : k === 'chaos' || k === 'despair' ? 1.2 : 2]));
    world.age = { id, start: world.time, until: world.time + world.yearLen * rng.range(2, 4) };
    logEvent(world, 'age', `${WORLD_AGES[id].name} begins. ${WORLD_AGES[id].desc}`, { big: true });
    emitFx(world, { type: 'age', id });
  }
  const A = WORLD_AGES[world.age.id], at = world.atmo;
  if (A.temp) for (let c = 0; c < at.G; c++) at.anomaly[c] += (A.temp - at.anomaly[c]) * Math.min(1, dt * 0.2) * 0.2;
  if (A.wet) for (let c = 0; c < at.G; c++) at.Hm[c] *= 1 + dt * 0.3;
  if (world.age.id === 'ash' && rng.chance(dt * 0.3)) {
    const vol = []; for (let k = 0; k < 200; k++) { const i = rng.int(0, world.tiles.N - 1); if (world.tiles.biome[i] === B.VOLCANIC) { vol.push(i); break; } }
    if (vol.length) eruption(world, vol[0] % world.W, Math.floor(vol[0] / world.W), rng);
  }
}

// --- raw physical events from atmosphere/fire systems ---
export function handleWorldEvents(world, events, rng) {
  for (const e of events) {
    if (e.type === 'lightning') {
      emitFx(world, { type: 'lightning', x: e.x, y: e.y });
      const i = e.y * world.W + wrap(e.x, world.W);
      const s = Object.values(world.settlements).find((s) => s.until.shield > world.time && dist(s.x, s.y, e.x, e.y, world.W) < s.radius + 2);
      if (s) continue;
      if (rng.chance(0.5)) ignite(world, i, 180);
      for (const p of pawnsNear(world, e.x, e.y, 1.5)) { injure(p, rng, 30, 'burn'); emitFx(world, { type: 'knock', pid: p.id, ix: rng.range(-4, 4), iy: -6 }); logEvent(world, 'disaster', `${fullName(p)} was struck by lightning!`, { pid: p.id, nationId: p.nationId, x: e.x, y: e.y }); }
    } else if (e.type === 'cyclone') {
      logEvent(world, 'weather', 'A tropical cyclone is forming over the ocean.', { x: e.x, y: e.y });
    } else if (e.type === 'buildingBurn' || e.type === 'razed') {
      const i = e.i ?? (Math.floor(e.y) * world.W + wrap(Math.floor(e.x), world.W));
      const b = world.buildings[world.tiles.bld[i]];
      if (e.type === 'razed') { ignite(world, i, 200); continue; }
      if (b) { b.hp -= e.dmg; if (b.hp <= 0 && b.type !== 'center') { const s = world.settlements[b.sid]; logEvent(world, 'disaster', `${s ? s.name + "'s " : ''}${b.type} burned down.`, { x: b.x, y: b.y, nationId: s?.nationId }); removeBuilding(world, b); } }
    }
  }
}

// --- the storyteller ---
const EVENTS = [
  // [id, weight(n, s, world) -> number]
  ['wanderer', (n) => 3],
  ['trader', (n) => (n.era >= 1 ? 3 : 1)],
  ['festival', (n, s) => (s.mood > 45 ? 2 : 0.5)],
  ['aurora', (n, s, w) => (Math.abs(s.y / w.H - 0.5) > 0.3 ? 2 : 0.3)],
  ['herd', (n) => (n.era < 4 ? 2 : 0.5)],
  ['bountiful', (n) => 1.5],
  ['artist', (n) => (n.era >= 5 ? 1.5 : 0.3)],
  ['flu', (n) => 1.5],
  ['plague', (n) => (n.era >= 2 && n.era <= 5 ? 1.8 : n.era > 6 ? 0.2 : 0.4)],
  ['malaria', (n, s, w) => ([B.JUNGLE, B.SWAMP].includes(w.tiles.biome[s.y * w.W + s.x]) ? 2 : 0)],
  ['blight', (n) => (n.era >= 1 ? 1.4 : 0)],
  ['heatwave', (n) => 1.2],
  ['coldsnap', (n) => 1.2],
  ['drought', (n) => 1],
  ['eclipse', (n) => 0.8],
  ['meteor', (n) => 0.7],
  ['earthquake', (n, s, w) => (nearBiome(w, s, [B.MOUNTAIN, B.VOLCANIC], 20) ? 1.4 : 0.2)],
  ['eruption', (n, s, w) => (nearBiome(w, s, [B.VOLCANIC], 24) ? 1 : 0)],
  ['raiders', (n, s, w) => (w.time < w.yearLen * 1.5 ? 0 : s.pop > 12 ? 1.6 : 0.3)],
  ['manhunters', (n) => 1],
  ['smog', (n) => (n.era >= 6 && n.ideology.nature < 0 ? 1.5 : 0)],
  ['strike', (n) => (n.era >= 6 ? 0.8 : 0)],
  ['reactor', (n) => (n.era >= 7 ? 0.6 : 0)],
  ['solarflare', (n) => (n.era >= 7 ? 0.8 : 0)],
  ['aiawakening', (n) => (n.era >= 8 ? 0.6 : 0)],
  ['debris', (n) => (n.era >= 9 ? 0.8 : 0)],
];
function nearBiome(world, s, biomes, r) {
  for (let k = 0; k < 60; k++) { const x = s.x + Math.round((Math.random() * 2 - 1) * r), y = clamp(s.y + Math.round((Math.random() * 2 - 1) * r), 0, world.H - 1); if (biomes.includes(world.tiles.biome[y * world.W + wrap(x, world.W)])) return true; }
  return false;
}

export function stepStoryteller(world, dt, rng) {
  for (const n of Object.values(world.nations)) {
    if (n.dead || n.raider) continue;
    n._story = (n._story ?? rng.range(2, 4)) - dt;
    if (n._story > 0) continue;
    n._story = rng.range(2.5, 5.5) * (world.settings?.eventRate ? 1 / world.settings.eventRate : 1);
    const ss = Object.values(world.settlements).filter((s) => s.nationId === n.id);
    if (!ss.length) continue;
    const s = rng.pick(ss);
    const choices = EVENTS.map(([id, w]) => [id, w(n, s, world)]).filter((e) => e[1] > 0);
    fireEvent(world, rng.weighted(choices), n, s, rng);
  }
}

export function fireEvent(world, id, n, s, rng) {
  const L = (cat, text, extra = {}) => logEvent(world, cat, text, { nationId: n.id, x: s.x, y: s.y, ...extra });
  const pawns = s._pawns || [];
  const at = world.atmo, c0 = cellAt(at, s.x, s.y);
  const regional = (fn, r = 2) => { const gx = c0 % at.GW, gy = Math.floor(c0 / at.GW); for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) { const y = gy + oy; if (y < 0 || y >= at.GH) continue; fn(y * at.GW + wrap(gx + ox, at.GW)); } };
  switch (id) {
    case 'wanderer': {
      const p = createPawn(rng, { lang: n.lang, race: rng.chance(0.75) ? n.race : rng.pick(['human', 'elf', 'orc']), nationId: n.id, settlementId: s.id, x: s.x + rng.range(-8, 8), y: s.y + rng.range(-8, 8), era: Math.max(0, n.era - rng.int(0, 1)), region: rng.next() });
      world.pawns[p.id] = p;
      return L('good', `${fullName(p)}, a wanderer, has joined ${s.name}.`, { pid: p.id });
    }
    case 'trader': {
      const give = rng.pick(['metal', 'cloth', 'medicine', 'stone']), take = s.stock.food > s.stock.wood ? 'food' : 'wood';
      const amt = Math.min(20, Math.floor(s.stock[take] * 0.3));
      if (amt < 4) return;
      s.stock[take] -= amt; s.stock[give] += Math.round(amt * 0.8);
      for (const p of pawns) addThought(p, 'chat', world.time);
      return L('good', `A trade caravan visited ${s.name}, trading ${amt} ${take} for ${Math.round(amt * 0.8)} ${give}.`);
    }
    case 'festival': for (const p of pawns) addThought(p, 'festival', world.time); return L('good', `${s.name} holds a joyous festival!`);
    case 'aurora': for (const p of pawns) addThought(p, 'aurora', world.time); emitFx(world, { type: 'aurora', x: s.x, y: s.y }); return L('good', `A shimmering aurora dances above ${s.name}.`);
    case 'herd': {
      const kinds = Object.keys(ANIMALS).filter((k) => !ANIMALS[k].predator);
      const kind = rng.pick(kinds);
      for (let k = 0; k < 8; k++) { const id = world.nextId.animal++; world.animals[id] = { id, kind, x: s.x + 15 + rng.range(-3, 3), y: s.y + rng.range(-3, 3), hp: ANIMALS[kind].hp, facing: -1, t: 0 }; }
      return L('good', `A herd of ${ANIMALS[kind].name.toLowerCase()} migrates past ${s.name}.`);
    }
    case 'bountiful': s.stock.food += 20 + pawns.length; return L('good', `Wild fruit is abundant around ${s.name}.`);
    case 'artist': { const p = rng.pick(pawns.filter((p) => p.age > 16)); if (p) startInspiration(world, p, 'craft'); return; }
    case 'flu': case 'plague': case 'malaria': {
      const hit = pawns.filter((p) => rng.chance(id === 'plague' ? 0.35 : 0.25) && rng.chance(1 - (p.fx.immunity || 0) * 0.6));
      for (const p of hit) addDisease(p, id, 0.05);
      if (hit.length) L('bad', `${id === 'plague' ? 'Plague' : id === 'flu' ? 'Flu' : 'Malaria'} has broken out in ${s.name} (${hit.length} sick).`, { severity: id === 'plague' ? 'major' : 'minor' });
      return;
    }
    case 'blight': {
      let k = 0; for (const b of settlementBuildings(world, s, 'farm')) for (let oy = 0; oy < b.h; oy++) for (let ox = 0; ox < b.w; ox++) { const i = (b.y + oy) * world.W + wrap(b.x + ox, world.W); if (world.tiles.crop[i] > 0 && rng.chance(0.6)) { world.tiles.crop[i] = 0; world.tiles.feat[i] = F.FARM; world.dirty.add(i); k++; } }
      if (k) L('bad', `Blight withered ${k} plots of crops in ${s.name}.`);
      return;
    }
    case 'heatwave': regional((c) => { at.anomaly[c] += 14; }); return L('weather', `A heat wave scorches the lands around ${s.name}.`);
    case 'coldsnap': regional((c) => { at.anomaly[c] -= 16; }); return L('weather', `A cold snap grips ${s.name}.`);
    case 'drought': regional((c) => { at.Hm[c] *= 0.2; at.anomaly[c] += 5; }, 3); return L('weather', `Drought: the rains have failed around ${s.name}.`);
    case 'eclipse': for (const p of pawns) addThought(p, 'eclipse', world.time); emitFx(world, { type: 'eclipse' }); return L('weather', 'A solar eclipse darkens the sky.');
    case 'meteor': return meteor(world, s.x + rng.int(-s.radius - 6, s.radius + 6), s.y + rng.int(-s.radius - 6, s.radius + 6), rng, n);
    case 'debris': for (let k = 0; k < 3; k++) meteor(world, s.x + rng.int(-20, 20), s.y + rng.int(-20, 20), rng, n, 0.5); return L('bad', 'Orbital debris rains down from the sky!');
    case 'earthquake': {
      emitFx(world, { type: 'quake', x: s.x, y: s.y, mag: rng.range(0.5, 1) });
      let k = 0; for (const b of settlementBuildings(world, s)) if (rng.chance(0.25)) { b.hp -= 60; k++; if (b.hp <= 0 && b.type !== 'center') removeBuilding(world, b); }
      for (const p of pawns) if (rng.chance(0.25)) emitFx(world, { type: 'knock', pid: p.id, ix: rng.range(-3, 3), iy: -3 });
      return L('disaster', `An earthquake shook ${s.name}! ${k} buildings damaged.`, { severity: 'major' });
    }
    case 'eruption': {
      for (let k = 0; k < 400; k++) { const x = s.x + rng.int(-24, 24), y = clamp(s.y + rng.int(-24, 24), 0, world.H - 1); const i = y * world.W + wrap(x, world.W); if (world.tiles.biome[i] === B.VOLCANIC) return eruption(world, x, y, rng); }
      return;
    }
    case 'raiders': return spawnRaiders(world, n, s, rng);
    case 'manhunters': {
      const kind = rng.pick(['wolf', 'bear', 'boar']);
      const cnt = Math.min(8, 2 + Math.floor(pawns.length / 6));
      const target = rng.pick(pawns); if (!target) return;
      for (let k = 0; k < cnt; k++) { const id = world.nextId.animal++; world.animals[id] = { id, kind, x: s.x + s.radius + 6 + rng.range(-2, 2), y: s.y + rng.range(-3, 3), hp: ANIMALS[kind].hp, facing: -1, t: 0, angry: rng.pick(pawns).id }; }
      return L('bad', `A pack of ${cnt} maddened ${{ wolf: 'wolves', bear: 'bears', boar: 'boars' }[kind]} is attacking ${s.name}!`, { severity: 'major' });
    }
    case 'smog': s.pollution = Math.min(255, s.pollution + 80); return L('bad', `Choking smog blankets ${s.name}.`);
    case 'strike': for (const p of pawns.filter((p) => p.mood < 50)) { p.brk = { type: 'sadWander', lvl: 'minor', until: world.time + 0.6 }; } return L('bad', `Workers in ${s.name} have gone on strike!`);
    case 'reactor': { const r = settlementBuildings(world, s, 'reactor')[0]; if (!r) return; for (let k = 0; k < 30; k++) { const i = (r.y + rng.int(-8, 8)) * world.W + wrap(r.x + rng.int(-8, 8), world.W); world.tiles.pollution[i] = 255; } return L('disaster', `A reactor scare in ${s.name} leaked radiation!`, { severity: 'major' }); }
    case 'solarflare': n.research = Math.max(0, n.research - 300); emitFx(world, { type: 'flare' }); return L('bad', 'A solar flare fried electronics. Research data lost.');
    case 'aiawakening': {
      if (rng.chance(0.6)) { n.research += 1500; return L('good', `An artificial mind awakened in ${s.name} and shared its insights.`); }
      for (const p of pawns.slice(0, 3)) injure(p, rng, 15, 'blunt');
      return L('bad', `A rogue AI in ${s.name} turned the machines against their makers!`, { severity: 'major' });
    }
  }
}

export function meteor(world, x, y, rng, n = null, scale = 1) {
  y = clamp(Math.floor(y), 2, world.H - 3); x = wrap(Math.floor(x), world.W);
  const shielded = Object.values(world.settlements).find((s) => (s.until.shield > world.time) && dist(s.x, s.y, x, y, world.W) < s.radius + 3);
  emitFx(world, { type: 'meteor', x, y, scale, shielded: !!shielded });
  if (shielded) return logEvent(world, 'good', `${shielded.name}'s divine shield deflected a meteor!`, { x, y, nationId: shielded.nationId });
  const r = Math.round(2 * scale) + 1;
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    if (ox * ox + oy * oy > r * r) continue;
    const yy = y + oy; if (yy < 0 || yy >= world.H) continue;
    const i = yy * world.W + wrap(x + ox, world.W);
    if (BIOMES[world.tiles.biome[i]].water) continue;
    const b = world.buildings[world.tiles.bld[i]];
    if (b && b.type !== 'center') removeBuilding(world, b);
    world.tiles.feat[i] = ox * ox + oy * oy <= 1 ? F.CRATER : rng.chance(0.4) ? F.ORE : F.RUBBLE; world.tiles.featHp[i] = 8; world.dirty.add(i);
    if (rng.chance(0.4)) ignite(world, i, 200);
  }
  for (const p of pawnsNear(world, x, y, r + 3)) { const d = dist(p.x, p.y, x, y, world.W); injure(p, rng, Math.max(4, 45 - d * 9) * scale, 'burn'); emitFx(world, { type: 'knock', pid: p.id, ix: (p.x - x) * 3, iy: -7 }); }
  logEvent(world, 'disaster', 'A meteor struck the earth!', { x, y, nationId: n?.id, severity: 'major' });
}

export function eruption(world, x, y, rng) {
  emitFx(world, { type: 'eruption', x, y });
  for (let k = 0; k < 14; k++) ignite(world, (clamp(y + rng.int(-6, 6), 0, world.H - 1)) * world.W + wrap(x + rng.int(-6, 6), world.W), 220);
  const at = world.atmo, c = cellAt(at, x, y);
  for (let k = -3; k <= 3; k++) { const cc = (c + k + at.G) % at.G; at.anomaly[cc] -= 4; }
  for (const p of pawnsNear(world, x, y, 8)) injure(p, rng, 20, 'burn');
  logEvent(world, 'disaster', 'A volcano erupted, raining fire and ash!', { x, y, severity: 'major' });
}

// --- raiders: a roaming hostile band that hits a settlement then leaves ---
export function ensureRaiderNation(world) {
  if (world.raiderNationId && world.nations[world.raiderNationId]) return world.nations[world.raiderNationId];
  const id = world.nextId.nation++;
  world.nations[id] = { id, name: 'Marauders', color: '#6b2a2a', lang: 0, ai: true, raider: true, era: 0, research: 0, glitter: 0, devotion: 0, stability: 50,
    ideology: { faith: 0, war: -100, society: 0, nature: 0, reach: -100 }, government: 'chiefdom', leaderId: -1, capitalId: -1, flag: null, flagSet: true,
    laws: { rations: 'normal', focus: 'military', conscription: 1 }, relations: {}, perms: {}, cooldowns: {}, proposals: [], dead: false, stats: { births: 0, deaths: 0, kills: 0, peak: 0, miracles: 0 }, warWeary: 0, achievements: [] };
  world.raiderNationId = id;
  return world.nations[id];
}
function spawnRaiders(world, n, s, rng) {
  const rn = ensureRaiderNation(world);
  rn.relations[n.id] = { state: 'war', opinion: -100, since: world.time };
  rel(n, rn.id).state = 'war';
  const cnt = Math.min(14, (n.era === 0 ? 1 : 2) + Math.floor((s.pop || 4) / (n.era === 0 ? 8 : 5)));
  const ang = rng.next() * Math.PI * 2;
  for (let k = 0; k < cnt; k++) {
    const p = createPawn(rng, { lang: rng.int(0, 7), race: rng.pick(['human', 'orc', 'orc', 'elf']), nationId: rn.id, settlementId: -1, x: s.x + Math.cos(ang) * (s.radius + 10) + rng.range(-2, 2), y: s.y + Math.sin(ang) * (s.radius + 10) + rng.range(-2, 2), age: rng.range(18, 40), era: Math.max(0, n.era - 1), region: rng.next() });
    p.role = 'soldier'; p.raider = { sid: s.id, until: world.time + 2.5 };
    world.pawns[p.id] = p;
  }
  logEvent(world, 'war', `${cnt} marauders are raiding ${s.name}!`, { nationId: n.id, x: s.x, y: s.y, severity: 'major' });
}
