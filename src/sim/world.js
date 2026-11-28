// World state: creation, lookups, territory, building placement, spatial hashing.
import { RNG } from '../core/rng.js';
import { initCreed } from './creed.js';
import { initTechs } from './tech.js';
import { generateWorld, findStartSites, tileLatLon } from '../world/worldgen.js';
import { createAtmosphere } from '../world/atmosphere.js';
import { BIOMES, F, B, isWater } from '../data/biomes.js';
import { BUILDINGS, buildCost } from '../data/buildings.js';
import { createPawn, computeFx } from './pawn.js';
import { nationName, settlementName, LANG_COUNT, NATION_COLORS } from '../data/names.js';
import { wrap, dist } from '../core/util.js';
import { RACES, RACE_IDS } from '../data/races.js';

// Time: world.time is counted in sim units (one unit = DAY_SECONDS real seconds at 1x). A calendar day (one sunrise to the
// next) lasts DAY_LEN units, so people get several hours of useful work between nights. A year is 12 calendar days.
import { DAY_LEN, YEAR_LEN } from '../core/time.js';
export { DAY_LEN, YEAR_LEN };
export const DAY_SECONDS = 30; // real seconds per in-game day at 1x speed

export function createWorld({ seed, name = 'New Globe', W, H, aiNations = 5, players = [], founders = 2 } = {}) {
  seed = seed >>> 0 || ((Math.random() * 2 ** 31) | 0);
  const tiles = generateWorld(seed, W, H);
  const world = {
    version: 1, name, seed, W: tiles.W, H: tiles.H, time: DAY_LEN * 0.3, yearLen: YEAR_LEN, tick: 0, speed: 1, paused: false,
    tiles, atmo: createAtmosphere(tiles),
    nations: {}, settlements: {}, buildings: {}, pawns: {}, animals: {}, corpses: [],
    nextId: { nation: 1, settlement: 1, building: 1, animal: 1, event: 1, drop: 1 }, drops: {},
    players: {}, waterActive: new Set(), fireActive: new Set(), dirty: new Set(),
    age: { id: 'hope', start: 0, until: YEAR_LEN * 3 }, space: [], log: [], fx: [], rng: new RNG(seed ^ 0x51f0),
    hot: new Set(), cameraHints: {}, settings: { founders },
  };
  const sites = findStartSites(tiles, Math.max(players.length, 1) + aiNations + 2, seed);
  world.freeSites = sites.slice();
  if (tiles.meta && name !== 'menu') logEvent(world, 'nation', `A ${tiles.meta.archetype} takes shape beneath the clouds.`);
  for (let k = 0; k < aiNations; k++) {
    const site = takeSite(world); if (!site) break;
    foundNation(world, site, { ai: true, pop: founders });
  }
  return world;
}

export function takeSite(world) {
  while (world.freeSites.length) {
    const s = world.freeSites.shift();
    const i = s.y * world.W + s.x;
    if (world.tiles.owner[i] === -1) return s;
  }
  // fallback: random habitable land far from others
  const rng = world.rng;
  for (let tries = 0; tries < 3000; tries++) {
    const x = rng.int(0, world.W - 1), y = rng.int((world.H * 0.18) | 0, (world.H * 0.82) | 0), i = y * world.W + x;
    const b = world.tiles.biome[i];
    if (isWater(b) || b === B.ICE || b === B.PEAK || b === B.MOUNTAIN || world.tiles.owner[i] !== -1) continue;
    if (Object.values(world.settlements).every((s) => dist(s.x, s.y, x, y, world.W) > 30)) return { x, y };
  }
  return null;
}

export function foundNation(world, site, { ai = true, ownerId = null, name, color, pop = 9, race } = {}) {
  const rng = world.rng;
  const id = world.nextId.nation++;
  const lang = rng.int(0, LANG_COUNT - 1);
  const used = new Set(Object.values(world.nations).map((n) => n.color));
  const ax = () => Math.round(rng.gauss(0, 35));
  race = race || rng.weighted(RACE_IDS.map((r) => [r, RACES[r].weight]));
  const n = {
    id, name: name || nationName(rng, lang), color: color || NATION_COLORS.find((c) => !used.has(c)) || NATION_COLORS[id % NATION_COLORS.length],
    lang, ai, ownerId, race, era: 0, research: 0, glitter: 25, devotion: 0, stability: 60,
    ideology: { faith: ax(), war: ax(), society: ax(), nature: ax(), reach: ax() }, ideologyTarget: null,
    government: 'tribal', leaderId: -1, capitalId: -1, flag: defaultFlag(rng, color), flagSet: false,
    laws: { rations: 'normal', focus: 'balanced', conscription: 0.15 },
    relations: {}, perms: {}, cooldowns: {}, proposals: [], founded: world.time, dead: false,
    stats: { births: 0, deaths: 0, kills: 0, peak: 0, miracles: 0 }, warWeary: 0, champion: -1, achievements: [],
  };
  for (const [k, v] of Object.entries(RACES[race].ideo)) n.ideology[k] = Math.max(-100, Math.min(100, n.ideology[k] + v));
  world.nations[id] = n;
  initCreed(world, n, rng);
  initTechs(n);
  const s = foundSettlement(world, n, site.x, site.y, true);
  // starting tribe
  const [lat] = tileLatLon(site.x, site.y, world.W, world.H);
  const region = Math.max(0, 1 - Math.abs(lat) / 1.1); // equatorial peoples skew darker skin tones
  const fam = [];
  for (let k = 0; k < pop; k++) {
    const p = createPawn(rng, { lang, race, nationId: id, settlementId: s.id, x: site.x + rng.range(-2, 2), y: site.y + rng.range(-2, 2), age: pop <= 2 ? rng.range(19, 26) : k < 2 ? rng.range(30, 45) : k < 7 ? rng.range(18, 34) : rng.range(6, 14), region, sex: k < 6 || pop <= 2 ? (k % 2 ? 'f' : 'm') : undefined, era: 0 });
    world.pawns[p.id] = p; fam.push(p);
  }
  // founders can always have children: a two-person start must never be a dead end
  for (const p of fam) if (p.age >= 16 && p.traits.includes('infertile')) { p.traits = p.traits.filter((t) => t !== 'infertile'); computeFx(p); }
  // pair up a few couples
  const men = fam.filter((p) => p.sex === 'm' && p.age > 18), women = fam.filter((p) => p.sex === 'f' && p.age > 18);
  for (let k = 0; k < Math.min(men.length, women.length, 3); k++) { men[k].spouse = women[k].id; women[k].spouse = men[k].id; men[k].rel[women[k].id] = 70; women[k].rel[men[k].id] = 70; women[k].family = men[k].family; }
  if (fam.length) n.leaderId = fam.reduce((a, b) => ((b.age > 18 && (b.skills.social.lvl + (b.traits.includes('charismatic') ? 5 : 0)) > (a.skills.social.lvl + (a.traits.includes('charismatic') ? 5 : 0))) ? b : a)).id;
  return n;
}

export function defaultFlag(rng, color) {
  return { pattern: rng.pick(['solid', 'bicolorH', 'bicolorV', 'tricolorV', 'cross', 'canton', 'chevron', 'saltire', 'nordic', 'stripes', 'fess', 'pale', 'pall', 'checker', 'disc', 'sunburst', 'wedge', 'frame']),
    c1: color || '#e8c547', c2: rng.pick(['#1b1f3a', '#f4f1e8', '#8b1e2d', '#1f5f3a', '#2a4d8f']), c3: rng.pick(['#f4f1e8', '#e8c547', '#111111']),
    emblem: rng.pick(['sun', 'moon', 'star', 'tree', 'mountain', 'eye', 'wave', 'crown', 'dove', 'shield', 'star5', 'star8', 'crescent', 'sunrays', 'anchor', 'fleur', 'none']), ec: '#f8e7a0', ep: 'c', es: 0.85, eo: 0, em: 0 };
}

export function foundSettlement(world, nation, x, y, capital = false) {
  const rng = world.rng;
  const id = world.nextId.settlement++;
  const s = { id, nationId: nation.id, name: settlementName(rng, nation.lang), x: Math.floor(x), y: Math.floor(y), founded: world.time,
    // a new people start with next to nothing: a few handfuls of berries, everything else they gather themselves
    stock: { food: 8, meals: 0, rations: 0, wood: 0, stone: 0, metal: 0, cloth: 0, medicine: 0 },
    items: { berries: 8 },
    radius: 7, plans: [], buildings: [], until: {}, pollution: 0, pop: 0, capital, lastPlan: 0, mood: 50 };
  world.settlements[id] = s;
  if (capital) nation.capitalId = id;
  const c = placeBuilding(world, s, 'center', s.x - 1, s.y - 1, true) || placeBuildingNear(world, s, 'center', s.x, s.y, true);
  if (c) { c.progress = 1; c.built = true; }
  claimTerritory(world, s);
  if (Object.keys(world.settlements).length > 1) world.log.push({ id: world.nextId.event++, t: world.time, cat: 'nation', nationId: nation.id, text: `${nation.name} founded ${s.name}.`, x: s.x, y: s.y });
  return s;
}

/** Hash noise for ragged, natural-looking borders. */
const bnoise = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smoothN = (x, y) => { const s = 5, x0 = Math.floor(x / s), y0 = Math.floor(y / s), fx = x / s - x0, fy = y / s - y0; const a = bnoise(x0, y0), b = bnoise(x0 + 1, y0), c = bnoise(x0, y0 + 1), d = bnoise(x0 + 1, y0 + 1); return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy; };
/**
 * A settlement's land grows steadily outward into unclaimed country (its "reach"), with ragged borders that
 * follow the lie of the land: it pushes further over plains than over hills and stops at the sea.
 * Land already held by another people is never taken here (that is what wars are for).
 */
export function claimTerritory(world, s) {
  const t = world.tiles, { W, H } = world;
  const R = Math.max(s.radius, s.reach || 0), r = Math.ceil(R * 1.25);
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    const y = s.y + oy; if (y < 0 || y >= H) continue;
    const x = wrap(s.x + ox, W), i = y * W + x;
    if (t.owner[i] !== -1) continue;
    const d = Math.sqrt(ox * ox + oy * oy);
    if (d > s.radius) {
      if (isWater(t.biome[i])) continue;
      const rough = BIOMES[t.biome[i]].cost || 9; // hills and swamps slow the spread
      if (d > R * (0.78 + smoothN(x, y) * 0.44) / Math.max(1, Math.sqrt(rough))) continue;
    }
    t.owner[i] = s.nationId; world.dirty.add(i);
  }
}

export function releaseTerritory(world, nationId, newOwner = -1) {
  const t = world.tiles;
  for (let i = 0; i < t.N; i++) if (t.owner[i] === nationId) { t.owner[i] = newOwner; world.dirty.add(i); }
}

/** Obstacles a crew clears before building: they are felled / broken up first, not bulldozed. */
export const OBSTACLE = new Set([F.TREE, F.ROCK, F.ORE, F.GOLD, F.BERRY, F.STUMP, F.RUBBLE].filter((v) => v !== undefined));
/**
 * Where can a building go? Every building needs its footprint plus a one-tile gap all round free of other buildings
 * (fields may sit side by side). Trees, rocks and bushes are fine: the builders clear them first.
 * Returns { ok, reason, bad: [tiles], gap: [tiles], clear: [tiles] } for the placement preview.
 */
export function placeCheck(world, s, type, x0, y0, ignoreOwner = false) {
  const t = world.tiles, def = BUILDINGS[type], { W, H } = world;
  const out = { ok: true, reason: '', bad: [], gap: [], clear: [] };
  const fail = (i, why) => { out.ok = false; out.bad.push(i); out.reason ||= why; };
  for (let oy = 0; oy < def.h; oy++) for (let ox = 0; ox < def.w; ox++) {
    const y = y0 + oy; if (y < 1 || y >= H - 1) { out.ok = false; out.reason ||= 'Too close to the edge of the world.'; continue; }
    const i = y * W + wrap(x0 + ox, W), b = t.biome[i];
    if (isWater(b) || t.river[i]) { fail(i, 'Cannot build on water.'); continue; }
    if (b === B.PEAK) { fail(i, 'Too steep: mountain peaks.'); continue; }
    if (t.feat[i] === F.BUILDING || t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY || t.bld[i] >= 0) { fail(i, 'Something is already built here.'); continue; }
    if (!ignoreOwner && t.owner[i] !== s.nationId && t.owner[i] !== -1) { fail(i, 'That land belongs to another people.'); continue; }
    if (def.field && BIOMES[b].fert < 0.12 && world.nations[s.nationId].era < 8) { fail(i, 'The soil is too poor for a field.'); continue; }
    if (OBSTACLE.has(t.feat[i])) out.clear.push(i);
  }
  // breathing room: no other building directly beside it
  for (let oy = -1; oy <= def.h; oy++) for (let ox = -1; ox <= def.w; ox++) {
    if (oy >= 0 && oy < def.h && ox >= 0 && ox < def.w) continue;
    const y = y0 + oy; if (y < 0 || y >= H) continue;
    const i = y * W + wrap(x0 + ox, W), id = t.bld[i]; if (id < 0) continue;
    const other = world.buildings[id]; if (def.field && other && BUILDINGS[other.type]?.field) continue;
    out.gap.push(i); out.ok = false; out.reason ||= 'Needs a free tile of space around it: too close to another building.';
  }
  return out;
}
export function canPlace(world, s, type, x0, y0, ignoreOwner = false) { return placeCheck(world, s, type, x0, y0, ignoreOwner).ok; }

export function placeBuilding(world, s, type, x0, y0, force = false) {
  if (!force && !canPlace(world, s, type, x0, y0)) return null;
  const t = world.tiles, def = BUILDINGS[type], { W } = world;
  const id = world.nextId.building++;
  const b = { id, type, x: wrap(x0, W), y: y0, w: def.w, h: def.h, sid: s.id, progress: 0, built: false, hp: def.hp, paid: false, era: world.nations[s.nationId].era, have: {} };
  b.need = buildCost(def, b.era); if (!Object.keys(b.need).length) b.paid = true;
  world.buildings[id] = b; s.buildings.push(id);
  for (let oy = 0; oy < def.h; oy++) for (let ox = 0; ox < def.w; ox++) {
    const i = (y0 + oy) * W + wrap(x0 + ox, W);
    t.bld[i] = id; t.crop[i] = 0;
    if (force || !OBSTACLE.has(t.feat[i])) { t.feat[i] = def.field ? F.FARM : F.BUILDING; t.featHp[i] = 0; } // trees & rocks stay until the builders clear them
    if (t.owner[i] === -1) t.owner[i] = s.nationId;
    world.dirty.add(i);
  }
  return b;
}

export function placeBuildingNear(world, s, type, cx, cy, force = false, maxR = 22) {
  const def = BUILDINGS[type];
  const rng = world.rng;
  const t = world.tiles;
  let best = null, bestScore = -Infinity;
  for (let r = def.field ? 3 : 2; r <= maxR; r++) {
    for (let k = 0; k < 10 + r * 2; k++) {
      const ang = rng.next() * Math.PI * 2;
      const x0 = Math.round(cx + Math.cos(ang) * r - def.w / 2), y0 = Math.round(cy + Math.sin(ang) * r - def.h / 2);
      if (!canPlace(world, s, type, x0, y0)) continue;
      // the gap is enforced by canPlace; prefer spots that need little clearing
      let crowd = placeCheck(world, s, type, x0, y0).clear.length * 0.6;
      for (let oy = -1; oy <= def.h; oy++) for (let ox = -1; ox <= def.w; ox++) { const y = y0 + oy; if (y < 0 || y >= world.H) continue; const i = y * world.W + wrap(x0 + ox, world.W); if (t.feat[i] === F.BUILDING) crowd++; }
      let score = -r * 1.5 - crowd * (def.field ? 0.5 : 4);
      if (def.field) { const i = (y0 + 1) * world.W + wrap(x0 + 1, world.W); score += BIOMES[t.biome[i]].fert * 12; }
      if (score > bestScore) { bestScore = score; best = [x0, y0]; }
    }
    if (best && r > (def.field ? 6 : 4)) break;
  }
  if (!best) return null;
  return placeBuilding(world, s, type, best[0], best[1], force);
}

export function removeBuilding(world, b, rubble = true) {
  const t = world.tiles, s = world.settlements[b.sid];
  for (let oy = 0; oy < b.h; oy++) for (let ox = 0; ox < b.w; ox++) {
    const i = (b.y + oy) * world.W + wrap(b.x + ox, world.W);
    if (t.bld[i] === b.id) { t.bld[i] = -1; t.feat[i] = rubble && !BUILDINGS[b.type].field ? F.RUBBLE : F.NONE; t.crop[i] = 0; world.dirty.add(i); }
  }
  delete world.buildings[b.id];
  if (s) s.buildings = s.buildings.filter((id) => id !== b.id);
}

export function settlementBuildings(world, s, type = null, builtOnly = true) {
  const out = [];
  for (const id of s.buildings) { const b = world.buildings[id]; if (b && (!type || b.type === type) && (!builtOnly || b.built)) out.push(b); }
  return out;
}
export const bCenter = (b) => [b.x + b.w / 2, b.y + b.h / 2];

/** Spatial hash for fast neighbour queries (rebuilt each tick). */
export function buildSpatial(world) {
  const grid = new Map(), cs = 8, GW = Math.ceil(world.W / cs);
  for (const p of Object.values(world.pawns)) {
    if (p.dead) continue;
    const k = Math.floor(p.y / cs) * GW + Math.floor(wrap(p.x, world.W) / cs);
    let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(p);
  }
  world._grid = grid; world._gcs = cs; world._gw = GW;
}
export function pawnsNear(world, x, y, r) {
  const cs = world._gcs, GW = world._gw, out = [];
  const r2 = Math.ceil(r / cs);
  const cx = Math.floor(wrap(x, world.W) / cs), cy = Math.floor(y / cs);
  for (let oy = -r2; oy <= r2; oy++) for (let ox = -r2; ox <= r2; ox++) {
    const a = world._grid.get((cy + oy) * GW + wrap(cx + ox, GW)); if (!a) continue;
    for (const p of a) if (dist(x, y, p.x, p.y, world.W) <= r) out.push(p);
  }
  return out;
}

export function logEvent(world, cat, text, extra = {}) {
  const e = { id: world.nextId.event++, t: world.time, cat, text, ...extra };
  world.log.push(e);
  if (world.log.length > 300) world.log.splice(0, world.log.length - 300);
  return e;
}
export function emitFx(world, fx) { world.fx.push({ ...fx, t: world.time }); }

export function dateString(time, yearLen = YEAR_LEN) {
  const year = Math.floor(time / yearLen) + 1;
  const days = time / DAY_LEN, perYear = yearLen / DAY_LEN, doy = days % perYear;
  const season = ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(doy / (perYear / 4))];
  const day = Math.floor(doy % (perYear / 4)) + 1;
  return { year, season, day, hour: Math.floor((days % 1) * 24), minute: Math.floor(((days * 24) % 1) * 60) };
}
