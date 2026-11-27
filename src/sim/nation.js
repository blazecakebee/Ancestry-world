// Nations & settlements: economy, building planner, births/deaths, era research, government,
// succession, glitter, territory growth, expansion, migration, exiles, rebellions and diplomacy.
import { BUILDINGS } from '../data/buildings.js';
import { ERAS, eraOf } from '../data/eras.js';
import { GOVERNMENTS, pickGovernment, AXES } from '../data/society.js';
import { BIOMES, F, B, isWater } from '../data/biomes.js';
import { createChild, createPawn, addThought, fullName, isChild, computeFx, opinion } from './pawn.js';
import { placeBuildingNear, settlementBuildings, claimTerritory, foundSettlement, foundNation, logEvent, emitFx, bCenter, releaseTerritory, removeBuilding } from './world.js';
import { tempAt } from '../world/atmosphere.js';
import { scaledCost } from './ai.js';
import { wrap, dist, clamp } from '../core/util.js';
import { nationName } from '../data/names.js';

export function nationPawns(world, n) { return Object.values(world.pawns).filter((p) => p.nationId === n.id && !p.dead); }

/** Called every sim tick for cheap per-nation multipliers. */
export function nationMults(world, n) {
  const gov = GOVERNMENTS.find((g) => g.id === n.government)?.fx || {};
  const age = world.age?.id;
  return {
    researchMult: (1 + (gov.research || 0) + Math.max(0, n.ideology.faith) / 160) * (age === 'wonders' ? 1.3 : 1),
    glitterMult: (1 + (gov.glitter || 0)) * (n.buffs?.glitterUntil > world.time ? 1.5 : 1),
    moodBonus: (gov.mood || 0) + (n.ideology.war > 40 ? 3 : 0) + (age === 'hope' ? 6 : age === 'despair' ? -6 : 0),
  };
}

// ---------------- daily-ish settlement update ----------------
export function stepSettlement(world, s, dt, rng) {
  const n = world.nations[s.nationId]; if (!n || n.dead) return;
  const pawns = s._pawns || [];
  s.pop = pawns.length;
  // spoilage (rations never spoil)
  const hot = tempAt(world.atmo, world.tiles, s.y * world.W + s.x) > 25 ? 1.6 : 1;
  s.stock.food = Math.max(0, s.stock.food - s.stock.food * 0.02 * hot * dt);
  s.stock.meals = Math.max(0, s.stock.meals - s.stock.meals * 0.04 * hot * dt);
  // storage cap
  const cap = settlementBuildings(world, s).reduce((a, b) => a + (BUILDINGS[b.type].fn.storage || 0), 0) + 80;
  for (const k of ['food', 'meals', 'rations', 'wood', 'stone']) s.stock[k] = Math.min(s.stock[k], cap * (k === 'rations' ? 1.5 : 1));
  // housing assignment
  if ((s._house = (s._house || 0) + dt) > 0.5) { s._house = 0; assignHomes(world, s, pawns); }
  // mood & passive glitter
  let moodSum = 0;
  const m = nationMults(world, n);
  for (const p of pawns) {
    moodSum += p.mood;
    const g = 0.5 * Math.max(0.05, 1 + (p.fx.glitter || 0)) * (p.mood / 50) * (1 - n.ideology.faith / 160) * m.glitterMult * (isChild(p) ? 0.3 : 1) * dt;
    n.glitter += g; n.devotion += g;
  }
  s.mood = pawns.length ? moodSum / pawns.length : 50;
  // passive research (curiosity of the people)
  n.research += pawns.length * 0.45 * dt * m.researchMult;
  // territory
  s.radius = 6 + Math.sqrt(s.pop) * 1.4 + (n.era * 0.4);
  if ((s._terr = (s._terr || 0) + dt) > 1) { s._terr = 0; claimTerritory(world, s); }
  // pollution from industry
  if (n.era >= 6 && n.ideology.nature < 30) {
    s.pollution = clamp(s.pollution + dt * (settlementBuildings(world, s, 'factory').length * 4 + 1) - (n.ideology.nature > 0 ? 3 * dt : 0), 0, 255);
    if (rng.chance(dt * 4)) { const i = (s.y + rng.int(-5, 5)) * world.W + wrap(s.x + rng.int(-5, 5), world.W); world.tiles.pollution[i] = Math.min(255, world.tiles.pollution[i] + s.pollution * 0.2); }
  }
  // crops grow
  growCrops(world, s, n, dt);
  // planner
  if (world.time - s.lastPlan > 0.25) { s.lastPlan = world.time; planBuildings(world, s, n, rng); }
  // births
  if ((s._birth = (s._birth || 0) + dt) > 0.2) { const span = s._birth; s._birth = 0; tryBirths(world, s, n, pawns, rng, span); }
}

function assignHomes(world, s, pawns) {
  const homes = settlementBuildings(world, s).filter((b) => BUILDINGS[b.type].fn.housing);
  const used = new Map();
  for (const p of pawns) if (p.home >= 0 && world.buildings[p.home]?.sid === s.id) used.set(p.home, (used.get(p.home) || 0) + 1); else p.home = -1;
  for (const p of pawns) {
    if (p.home >= 0) continue;
    const sp = p.spouse >= 0 ? world.pawns[p.spouse] : null;
    const pref = sp?.home >= 0 ? world.buildings[sp.home] : (p.parents.map((id) => world.pawns[id]).find((q) => q && q.home >= 0)?.home ?? -1);
    const prefB = typeof pref === 'object' ? pref : world.buildings[pref];
    const fits = (b) => (used.get(b.id) || 0) < BUILDINGS[b.type].fn.housing * (1 + b.era * 0.15);
    const h = prefB && fits(prefB) ? prefB : homes.find(fits);
    if (h) { p.home = h.id; used.set(h.id, (used.get(h.id) || 0) + 1); }
  }
  s.housing = homes.reduce((a, b) => a + Math.floor(BUILDINGS[b.type].fn.housing * (1 + b.era * 0.15)), 0);
}

function growCrops(world, s, n, dt) {
  const t = world.tiles, W = world.W;
  const harvest = s.until.harvest > world.time;
  const eco = 1 + Math.max(0, n.ideology.nature) / 200;
  for (const b of settlementBuildings(world, s, 'farm')) {
    const ci = (b.y + 1) * W + wrap(b.x + 1, W);
    const T = tempAt(world.atmo, t, ci);
    const indoor = n.era >= 8;
    const tf = indoor ? 1 : T < 0 ? -1 : T < 6 ? 0.3 : T > 38 ? 0.3 : 1;
    for (let oy = 0; oy < b.h; oy++) for (let ox = 0; ox < b.w; ox++) {
      const i = (b.y + oy) * W + wrap(b.x + ox, W);
      if (t.feat[i] !== F.FARM || t.crop[i] === 0) continue;
      if (tf < 0) { if (Math.random() < dt * 0.6) { t.crop[i] = 0; world.dirty.add(i); } continue; } // frost kills
      const wet = t.water[i] > 0.6 ? -0.5 : 1; // drowned crops
      const fert = Math.max(0.15, BIOMES[t.biome[i]].fert) * (indoor ? 1.2 : 1);
      const g = harvest ? 255 : dt * 120 * fert * tf * eco * wet * (1 + n.era * 0.08);
      const v = clamp(t.crop[i] + g, 0, 255);
      if (Math.floor(v / 40) !== Math.floor(t.crop[i] / 40)) world.dirty.add(i);
      t.crop[i] = v;
      if (v >= 255) { t.feat[i] = F.CROP_READY; world.dirty.add(i); }
    }
  }
  if (harvest) s.until.harvest = 0;
}

function countB(world, s, type) { return s.buildings.reduce((a, id) => a + (world.buildings[id]?.type === type ? 1 : 0), 0); }

function planBuildings(world, s, n, rng) {
  // one AI construction project at a time (player-planned ones are extra)
  const pending = s.buildings.map((id) => world.buildings[id]).filter((b) => b && !b.built && !b.byPlayer);
  for (const b of pending) if (!b.paid && world.time - (b.placedAt ?? world.time) > 3) removeBuilding(world, b, false); // abandon stalled plans
  if (pending.some((b) => world.buildings[b.id])) return;
  const pop = s.pop, era = n.era, a = n.ideology;
  const want = [];
  const housing = s.housing || 0;
  if (housing < pop + 3) want.push(['hut', 10]);
  if (countB(world, s, 'campfire') < 1 && era < 6) want.push(['campfire', 9]);
  if (countB(world, s, 'storage') < 1 + Math.floor(pop / 25)) want.push(['storage', 7]);
  if (countB(world, s, 'research') < 1 + Math.floor(pop / 18)) want.push(['research', 6 + (a.faith > 0 ? 2 : 0)]);
  if (countB(world, s, 'temple') < 1 + Math.floor(pop / 26)) want.push(['temple', 5 + (a.faith < 0 ? 3 : 0)]);
  if (countB(world, s, 'healer') < 1 + Math.floor(pop / 22)) want.push(['healer', 6]);
  if (era >= 1 && countB(world, s, 'farm') < Math.ceil(pop / 5)) want.push(['farm', 9]);
  if (era >= 1 && countB(world, s, 'workshop') < 1 + Math.floor(pop / 30)) want.push(['workshop', 5]);
  if (era >= 1 && countB(world, s, 'kitchen') < 1 + Math.floor(pop / 30)) want.push(['kitchen', 5]);
  if (era >= 2 && countB(world, s, 'barracks') < (a.war < -20 ? 2 : 1) && pop > 12) want.push(['barracks', 3 + (a.war < 0 ? 3 : 0)]);
  if (era >= 2 && countB(world, s, 'mine') < 1 && pop > 10) want.push(['mine', 4]);
  if (era >= 2 && countB(world, s, 'market') < 1 && pop > 15) want.push(['market', 3]);
  if (era >= 3 && countB(world, s, 'tavern') < 1 && pop > 20) want.push(['tavern', 3]);
  if (era >= 6 && countB(world, s, 'factory') < 1 && a.nature < 40 && pop > 20) want.push(['factory', 4]);
  if (era >= 7 && countB(world, s, 'reactor') < 1 && s.capital) want.push(['reactor', 4]);
  if (era >= 8 && countB(world, s, 'shield') < 1) want.push(['shield', 4]);
  if (era >= 9 && countB(world, s, 'launch') < 1 && s.capital) want.push(['launch', 6]);
  if (!want.length) return;
  // only start what we can afford; remember what we're short of so gatherers go get it
  const affordable = want.filter(([t]) => Object.entries(scaledCost(BUILDINGS[t], era)).every(([r, v]) => (s.stock[r] || 0) >= v));
  const top = want.reduce((a, b) => (b[1] > a[1] ? b : a));
  s.need = {}; for (const [r, v] of Object.entries(scaledCost(BUILDINGS[top[0]], era))) if ((s.stock[r] || 0) < v) s.need[r] = v - (s.stock[r] || 0);
  if (!affordable.length) return;
  const type = rng.weighted(affordable);
  const b = placeBuildingNear(world, s, type, s.x, s.y, false, Math.max(8, Math.floor(s.radius) + 4));
  if (b) { b.era = era; b.placedAt = world.time; }
}

function tryBirths(world, s, n, pawns, rng, span) {
  const housing = s.housing || 0;
  if (pawns.length >= housing + 2) return;
  const fert = s.until.fertility > world.time ? 4 : 1;
  for (const f of pawns) {
    if (f.sex !== 'f' || f.age < 18 || f.age > 44 || f.spouse < 0 || (f.fx.fertility || 0) <= -1) continue;
    const m = world.pawns[f.spouse];
    if (!m || m.dead || m.sex !== 'm' || (m.fx.fertility || 0) <= -1 || m.settlementId !== s.id) continue;
    const young = f.children.filter((id) => world.pawns[id] && world.pawns[id].age < 2).length;
    if (young) continue;
    const chance = 0.1 * (1 + (f.fx.fertility || 0) + (m.fx.fertility || 0) * 0.5) * fert * (s.mood / 55) * (world.age?.id === 'hope' ? 1.3 : 1) * span * 5;
    if (!rng.chance(chance)) continue;
    const c = createChild(rng, f, m, n.lang);
    c.gearEra = n.era;
    world.pawns[c.id] = c;
    n.stats.births++;
    addThought(f, 'newChild', world.time); addThought(m, 'newChild', world.time);
    logEvent(world, 'birth', `${fullName(c)} was born to ${f.name} and ${m.name}.`, { pid: c.id, nationId: n.id, x: f.x, y: f.y });
    emitFx(world, { type: 'emote', pid: f.id, icon: 'baby' });
    if (pawns.length + 1 >= housing + 2) break;
  }
}

// ---------------- nation-level daily update ----------------
export function stepNation(world, n, dt, rng) {
  if (n.dead) return;
  const pawns = n._pawns || [];
  n.stats.peak = Math.max(n.stats.peak, pawns.length);
  if (!pawns.length) return killNation(world, n, 'faded away');
  // a patron's quiet blessing: a tiny trickle of glitter (more with temples), far below real worship income
  if (n.ownerId) {
    let temples = 0;
    for (const s of Object.values(world.settlements)) if (s.nationId === n.id) temples += settlementBuildings(world, s, 'temple').length;
    n.glitter += Math.min(0.09, 0.04 + temples * 0.005) * dt;
  }
  // era research
  const next = ERAS[n.era + 1];
  if (next && n.research >= next.cost) {
    n.era++;
    logEvent(world, 'era', `${n.name} entered the ${next.name}! ${next.blurb}`, { nationId: n.id, big: true });
    emitFx(world, { type: 'era', nationId: n.id, era: n.era });
    const g = pickGovernment(n);
    if (g !== n.government && n.ai) reform(world, n, g);
  }
  // ideology drifts toward the deity's will (players) or randomly (AI)
  if (n.ideologyTarget) {
    const prophets = pawns.filter((p) => p.role === 'prophet').length;
    for (const ax of AXES) { const tv = n.ideologyTarget[ax.id]; if (tv === undefined) continue; const d = tv - n.ideology[ax.id]; n.ideology[ax.id] += clamp(d, -1, 1) * dt * (0.8 + prophets * 0.5); }
  } else if (n.ai && rng.chance(dt * 0.3)) { const ax = rng.pick(AXES).id; n.ideology[ax] = clamp(n.ideology[ax] + rng.range(-6, 6), -100, 100); }
  // leadership
  if (!world.pawns[n.leaderId] || world.pawns[n.leaderId].dead) succession(world, n, rng);
  // stability
  const avgMood = pawns.reduce((a, p) => a + p.mood, 0) / pawns.length;
  const gov = GOVERNMENTS.find((g) => g.id === n.government)?.fx || {};
  n.stability = clamp(n.stability + ((avgMood - 40) * 0.08 + (gov.stability || 0) * 0.05 + (n.ideology.reach > 30 ? 0.3 : 0) - n.warWeary * 0.02) * dt, 0, 100);
  if (n.ai && rng.chance(dt * 0.05)) { const g = pickGovernment(n); if (g !== n.government) reform(world, n, g); }
  // roles: soldiers & prophets
  if ((n._roles = (n._roles || 0) + dt) > 1) { n._roles = 0; assignRoles(world, n, pawns, rng); }
  // expansion, migration, exile, rebellion
  if ((n._exp = (n._exp || 0) + dt) > 1) { n._exp = 0; expansion(world, n, pawns, rng); unrest(world, n, pawns, rng, avgMood); }
  // space program
  spaceProgram(world, n, rng, dt);
}

function reform(world, n, g) {
  const old = GOVERNMENTS.find((x) => x.id === n.government)?.name;
  n.government = g;
  const nu = GOVERNMENTS.find((x) => x.id === g).name;
  logEvent(world, 'nation', `${n.name} reformed from ${old} into a ${nu}.`, { nationId: n.id });
}

function succession(world, n, rng) {
  const pawns = (n._pawns || []).filter((p) => p.age >= 16);
  if (!pawns.length) return;
  const old = world.pawns[n.leaderId];
  let heir = null;
  const score = (p, f) => pawns.reduce((a, b) => (f(b) > f(a) ? b : a));
  switch (n.government) {
    case 'absMonarchy': case 'constMonarchy': case 'stellar':
      heir = old ? old.children.map((id) => world.pawns[id]).filter((c) => c && !c.dead && c.age >= 14).sort((a, b) => b.age - a.age)[0] : null; break;
    case 'theocracy': heir = score(null, (p) => (p.fx.glitter || 0) * 10 + p.skills.social.lvl); break;
    case 'technocracy': heir = score(null, (p) => p.skills.intellectual.lvl + (p.fx.research || 0) * 10); break;
    case 'chiefdom': heir = score(null, (p) => p.skills.melee.lvl + (p.fx.melee || 0) * 10 + (p.traits.includes('giant') ? 5 : 0)); break;
    default: heir = score(null, (p) => p.skills.social.lvl + (p.fx.social || 0) * 10 + (p.traits.includes('charismatic') ? 5 : 0) + p.age * 0.05);
  }
  heir = heir || pawns[0];
  n.leaderId = heir.id;
  logEvent(world, 'nation', `${fullName(heir)} now leads ${n.name}.`, { nationId: n.id, pid: heir.id });
}

function assignRoles(world, n, pawns, rng) {
  const adults = pawns.filter((p) => p.age >= 16 && p.age < 60);
  const atWar = Object.values(n.relations).some((r) => r.state === 'war');
  const ratio = clamp(n.laws.conscription + (n.ideology.war < -30 ? 0.08 : 0) + (atWar ? 0.12 : 0) - (n.ideology.war > 40 ? 0.08 : 0), 0.04, 0.5);
  const wantSoldiers = n.era >= 1 ? Math.round(adults.length * ratio) : Math.round(adults.length * ratio * 0.5);
  const soldiers = adults.filter((p) => p.role === 'soldier');
  if (soldiers.length < wantSoldiers) {
    const cands = adults.filter((p) => p.role === 'citizen' && !p.traits.includes('pacifist')).sort((a, b) => (b.skills.melee.lvl + b.skills.shooting.lvl + (b.fx.violence || 0) * 4) - (a.skills.melee.lvl + a.skills.shooting.lvl + (a.fx.violence || 0) * 4));
    for (const p of cands.slice(0, wantSoldiers - soldiers.length)) p.role = 'soldier';
  } else if (soldiers.length > wantSoldiers + 1) for (const p of soldiers.slice(wantSoldiers)) if (!p.squad) p.role = 'citizen';
  // natural prophets arise among zealots in spiritual nations
  if (n.ideology.faith < -40 && !pawns.some((p) => p.role === 'prophet') && rng.chance(0.15)) {
    const z = pawns.find((p) => p.traits.includes('zealot') && p.age > 20);
    if (z) makeProphet(world, z);
  }
}
export function makeProphet(world, p) {
  p.role = 'prophet'; if (!p.traits.includes('prophet')) p.traits.push('prophet'); computeFx(p);
  logEvent(world, 'faith', `${fullName(p)} hears the voice of their god and becomes a Prophet.`, { pid: p.id, nationId: p.nationId });
}

// ---------------- expansion / migration / exiles ----------------
function goodLand(world, x, y) {
  const t = world.tiles, i = y * world.W + wrap(x, world.W), b = t.biome[i];
  return !isWater(b) && ![B.ICE, B.PEAK, B.MOUNTAIN, B.VOLCANIC].includes(b) && t.owner[i] === -1 && !t.river[i];
}
function findNewSite(world, x0, y0, rMin, rMax, rng) {
  for (let k = 0; k < 80; k++) {
    const a = rng.next() * Math.PI * 2, r = rng.range(rMin, rMax);
    const x = wrap(Math.round(x0 + Math.cos(a) * r), world.W), y = Math.round(y0 + Math.sin(a) * r);
    if (y < world.H * 0.08 || y > world.H * 0.92) continue;
    let ok = 0; for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) if (goodLand(world, x + ox, y + oy)) ok++;
    if (ok >= 40 && Object.values(world.settlements).every((s) => dist(s.x, s.y, x, y, world.W) > 16)) return { x, y };
  }
  return null;
}
function moveGroup(world, group, s, n) {
  for (const p of group) { p.settlementId = s.id; p.nationId = n.id; p.home = -1; p.job = null; p.path = null; p.squad = null; if (p.role === 'soldier') p.role = 'citizen'; p.x = s.x + (Math.random() * 4 - 2); p.y = s.y + (Math.random() * 4 - 2); }
}
function familyOf(world, p) {
  const g = [p];
  const sp = world.pawns[p.spouse]; if (sp && !sp.dead && sp.settlementId === p.settlementId) g.push(sp);
  for (const id of p.children) { const c = world.pawns[id]; if (c && !c.dead && c.age < 16 && c.settlementId === p.settlementId) g.push(c); }
  return g;
}

function expansion(world, n, pawns, rng) {
  const settlements = Object.values(world.settlements).filter((s) => s.nationId === n.id);
  const crowded = settlements.find((s) => s.pop > 26 + n.era * 3);
  const expChance = 0.25 * (1 - n.ideology.reach / 120);
  if (crowded && rng.chance(expChance) && settlements.length < 2 + n.era * 2) {
    const site = findNewSite(world, crowded.x, crowded.y, 18, 42, rng);
    if (!site) return;
    const settlers = [];
    for (const p of crowded._pawns || []) { if (settlers.length >= 7) break; if (p.age > 16 && p.age < 45 && !settlers.includes(p) && p.id !== n.leaderId) for (const q of familyOf(world, p)) if (!settlers.includes(q)) settlers.push(q); }
    if (settlers.length < 3) return;
    const s = foundSettlement(world, n, site.x, site.y);
    s.stock = { food: 25, meals: 6, rations: 4, wood: 25, stone: 5, metal: 0, cloth: 3, medicine: 2 };
    crowded.stock.food = Math.max(0, crowded.stock.food - 25);
    moveGroup(world, settlers, s, n);
    emitFx(world, { type: 'founded', x: s.x, y: s.y, nationId: n.id });
  }
}

function unrest(world, n, pawns, rng, avgMood) {
  // --- migration: individuals seek happier, better-fed places (even in other nations) ---
  for (const p of pawns) {
    if (p.age < 16 || p.id === n.leaderId || p.possessedBy || !rng.chance(0.04)) continue;
    const s = world.settlements[p.settlementId];
    if (!s || p.mood > 32) continue;
    let best = null, bs = 0;
    for (const o of Object.values(world.settlements)) {
      if (o === s || !o.pop) continue;
      const on = world.nations[o.nationId]; if (!on || on.dead) continue;
      if (on.id !== n.id && n.relations[on.id]?.state === 'war') continue;
      const d = dist(o.x, o.y, s.x, s.y, world.W); if (d > 90) continue;
      const align = AXES.reduce((a, ax) => a - Math.abs(on.ideology[ax.id] - n.ideology[ax.id]) / 200, 0);
      const score = (o.mood - s.mood) + (o.stock.food + o.stock.meals) / Math.max(1, o.pop) * 2 - d * 0.1 + align * 5 + (on.id === n.id ? 4 : 0);
      if (score > bs + 8) { bs = score; best = o; }
    }
    if (best) {
      const fam = familyOf(world, p), on = world.nations[best.nationId];
      moveGroup(world, fam, best, on);
      logEvent(world, 'social', `${fullName(p)}${fam.length > 1 ? ` and family (${fam.length})` : ''} migrated from ${s.name} to ${best.name}${on.id !== n.id ? ` in ${on.name}` : ''}.`, { pid: p.id, nationId: on.id, x: best.x, y: best.y });
    }
  }
  // --- exiles: a discontented faction flees to found its own AI-run community ---
  if (pawns.length > 14 && rng.chance(avgMood < 38 ? 0.12 : n.stability < 30 ? 0.08 : 0.012)) {
    const leader = pawns.filter((p) => p.age > 20 && p.id !== n.leaderId && (p.traits.includes('ambitious') || p.traits.includes('charismatic') || p.traits.includes('zealot') || p.mood < 30)).sort((a, b) => a.mood - b.mood)[0];
    if (!leader) return;
    const home = world.settlements[leader.settlementId];
    const site = findNewSite(world, home.x, home.y, 24, 70, rng);
    if (!site) return;
    const followers = [];
    for (const p of (home._pawns || [])) {
      if (followers.length >= 12) break;
      if (p.id === n.leaderId || p.possessedBy || followers.includes(p)) continue;
      if (p === leader || p.mood < 40 || opinion(p, leader) > 25) for (const q of familyOf(world, p)) if (!followers.includes(q)) followers.push(q);
    }
    if (followers.length < 4) return;
    const exile = foundNation(world, site, { ai: true, pop: 0, race: leader.race });
    exile.name = rng.chance(0.5) ? `Free ${nationName(world.rng, n.lang).replace(/^(Tribe of |People of )/, '')}` : `${leader.family} Exiles`;
    exile.lang = n.lang; exile.era = n.era; exile.research = n.research * 0.85;
    for (const ax of AXES) exile.ideology[ax.id] = clamp(n.ideology[ax.id] + rng.range(-50, 50), -100, 100);
    const es = world.settlements[exile.capitalId];
    es.stock.food += 20;
    moveGroup(world, followers, es, exile);
    exile.leaderId = leader.id;
    exile.relations[n.id] = { state: 'peace', opinion: -30, since: world.time };
    n.relations[exile.id] = { state: 'peace', opinion: -20, since: world.time };
    logEvent(world, 'nation', `${fullName(leader)} led ${followers.length} discontented souls out of ${home.name} to found ${exile.name}!`, { nationId: exile.id, x: es.x, y: es.y, big: true });
    emitFx(world, { type: 'founded', x: es.x, y: es.y, nationId: exile.id });
  }
  // --- rebellion: a whole far-flung settlement secedes ---
  if (n.stability < 18 && rng.chance(0.06)) {
    const ss = Object.values(world.settlements).filter((s) => s.nationId === n.id && !s.capital && s.pop > 6);
    const s = ss.sort((a, b) => a.mood - b.mood)[0];
    if (s) {
      const reb = foundNation(world, { x: s.x, y: s.y }, { ai: true, pop: 0, race: n.race });
      // the dummy capital created by foundNation is replaced by the seceding city
      const dummy = world.settlements[reb.capitalId];
      for (const id of dummy.buildings.slice()) removeBuilding(world, world.buildings[id], false);
      delete world.settlements[dummy.id];
      s.nationId = reb.id; s.capital = true; reb.capitalId = s.id; reb.era = n.era; reb.research = n.research; reb.lang = n.lang;
      for (const p of s._pawns || []) p.nationId = reb.id;
      for (let i = 0; i < world.tiles.N; i++) if (world.tiles.owner[i] === n.id && dist(i % world.W, (i / world.W) | 0, s.x, s.y, world.W) <= s.radius + 1) { world.tiles.owner[i] = reb.id; world.dirty.add(i); }
      reb.relations[n.id] = { state: 'war', opinion: -80, since: world.time }; n.relations[reb.id] = { state: 'war', opinion: -80, since: world.time };
      logEvent(world, 'war', `${s.name} rebelled against ${n.name} and declared independence as ${reb.name}!`, { nationId: reb.id, x: s.x, y: s.y, big: true });
    }
  }
}

// ---------------- nomads ----------------
export function spawnNomads(world, rng) {
  const site = findNewSite(world, rng.int(0, world.W), rng.int(world.H * 0.2, world.H * 0.8), 0, 30, rng);
  if (!site) return;
  const n = foundNation(world, site, { ai: true, pop: rng.int(5, 9) });
  // nomads start a little behind the average era
  const eras = Object.values(world.nations).filter((x) => !x.dead).map((x) => x.era);
  n.era = Math.max(0, Math.floor(eras.reduce((a, b) => a + b, 0) / eras.length) - 1);
  n.research = ERAS[n.era].cost;
  for (const p of Object.values(world.pawns)) if (p.nationId === n.id) p.gearEra = n.era;
  logEvent(world, 'nation', `A band of nomads settled the wilds and founded ${n.name}.`, { nationId: n.id, x: site.x, y: site.y });
}

export function killNation(world, n, why) {
  n.dead = true;
  for (const s of Object.values(world.settlements)) if (s.nationId === n.id) delete world.settlements[s.id];
  releaseTerritory(world, n.id);
  for (const b of Object.values(world.buildings)) if (!world.settlements[b.sid]) removeBuilding(world, b, true);
  logEvent(world, 'nation', `${n.name} has ${why}.`, { nationId: n.id, big: true });
}

// ---------------- space ----------------
function spaceProgram(world, n, rng, dt) {
  if (n.era < 7) return;
  const cap = world.settlements[n.capitalId]; if (!cap) return;
  const mine = world.space.filter((o) => o.nationId === n.id);
  const has = (type) => mine.filter((o) => o.type === type).length;
  const tryLaunch = (type, cost, chance, text) => {
    if (cap.stock.metal < cost || !rng.chance(chance * dt)) return false;
    cap.stock.metal -= cost;
    world.space.push({ id: world.nextId.event++, type, nationId: n.id, orbit: rng.range(1.15, 1.6), phase: rng.next() * Math.PI * 2, incl: rng.range(-0.5, 0.5), launched: world.time });
    logEvent(world, 'space', `${n.name} ${text}`, { nationId: n.id, big: type !== 'satellite' });
    emitFx(world, { type: 'launch', x: cap.x, y: cap.y, nationId: n.id });
    return true;
  };
  if (has('satellite') < 2 + n.era - 7) tryLaunch('satellite', 15, 0.25, 'launched a satellite into orbit.');
  if (n.era >= 9 && settlementBuildings(world, cap, 'launch').length) {
    if (!has('station')) tryLaunch('station', 60, 0.2, 'assembled an orbital station!');
    else if (has('moonbase') < 2) tryLaunch('moonbase', 80, 0.12, 'established a lunar mining base!');
    else if (!has('ark') && cap.stock.metal > 200) tryLaunch('ark', 200, 0.05, 'launched a deep-space colony ark toward the stars!');
  }
  for (const o of mine) if (o.type === 'moonbase') cap.stock.metal += dt * 2;
}
