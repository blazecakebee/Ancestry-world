// Citizen behaviour: needs, comfort, mental breaks, inspirations and the job system.
// Jobs are picked by a utility score that mixes settlement needs, skills and passions —
// similar to RimWorld work priorities, but fully autonomous (you are a god, not a manager).
import { F, BIOMES } from '../data/biomes.js';
import { BUILDINGS } from '../data/buildings.js';
import { eraOf } from '../data/eras.js';
import { MENTAL_BREAKS, BREAK_LABELS } from '../data/society.js';
import { findPath, tileCost } from './pathfind.js';
import { addThought, setSituational, gainXp, skillFactor, workSpeed, moveSpeed, isChild, changeOpinion, opinion, fullName, computeFx } from './pawn.js';
import { needsTending, tend, isBleeding, MED_QUALITY, addDisease } from './health.js';
import { pawnAttack, ANIMALS } from './combat.js';
import { settlementBuildings, bCenter, pawnsNear, logEvent, emitFx } from './world.js';
import { tempAt, cellAt } from '../world/atmosphere.js';
import { ignite } from '../world/physics.js';
import { wrap, dist, dx, clamp } from '../core/util.js';

const tileIdx = (world, x, y) => Math.floor(y) * world.W + wrap(Math.floor(x), world.W);

// ---------- movement ----------
export function goTo(world, p, tx, ty, budget = 2500) {
  const path = findPath(world.tiles, p.x, p.y, tx, ty, budget);
  if (path === null) { p.path = null; return false; }
  p.path = path; p.pathI = 0;
  return true;
}
/** Move along the current path. Returns true when there is nothing left to walk. */
export function walk(world, p, dt) {
  if (!p.path || p.pathI >= p.path.length) { p.path = null; return true; }
  const W = world.W;
  const i = p.path[p.pathI];
  const tx = (i % W) + 0.5, ty = Math.floor(i / W) + 0.5;
  const ddx = dx(p.x, tx, W), ddy = ty - p.y, d = Math.hypot(ddx, ddy);
  const cost = tileCost(world.tiles, tileIdx(world, p.x, p.y)) || 1;
  const step = (moveSpeed(p) / cost) * dt;
  if (Math.abs(ddx) > 0.01) p.facing = ddx > 0 ? 1 : -1;
  p.moving = true;
  if (d <= step) { p.x = wrap(tx, W); p.y = ty; p.pathI++; }
  else { p.x = wrap(p.x + (ddx / d) * step, W); p.y += (ddy / d) * step; }
  return p.pathI >= p.path.length;
}
/** Long-distance travel: path toward a waypoint at most ~48 tiles ahead, with a re-path cooldown. */
export function marchToward(world, p, tx, ty, dt) {
  if (p.path && p.pathI < p.path.length) { walk(world, p, dt); return; }
  if ((p._repath = (p._repath || 0) - dt) > 0) return;
  p._repath = 0.05;
  const ddx = dx(p.x, tx, world.W), ddy = ty - p.y, d = Math.hypot(ddx, ddy);
  const k = Math.min(1, 48 / Math.max(d, 1));
  if (!goTo(world, p, p.x + ddx * k, p.y + ddy * k, 2500)) goTo(world, p, p.x + ddx * k * 0.5 + (Math.random() - 0.5) * 8, p.y + ddy * k * 0.5 + (Math.random() - 0.5) * 8, 1200);
  walk(world, p, dt);
}
const near = (world, p, x, y, r = 1.6) => dist(p.x, p.y, x, y, world.W) <= r;

// ---------- per-tick update ----------
export function stepPawn(world, p, dt, ctx) {
  const { rng, s, n } = ctx;
  p.moving = false;
  if (p.attackAnim) p.attackAnim = Math.max(0, p.attackAnim - dt * 40);
  const now = world.time;
  const era = n ? n.era : 0;

  // --- needs ---
  const hungerRate = 0.85 * (1 + (p.fx.hunger || 0)) * (isChild(p) ? 0.7 : 1);
  p.needs.food = clamp(p.needs.food - hungerRate * dt, 0, 1);
  p.needs.rest = clamp(p.needs.rest + (p.state === 'sleep' ? 2.6 : -1.0) * dt, 0, 1);
  p.needs.joy = clamp(p.needs.joy - 0.5 * dt, 0, 1);
  p.needs.social = clamp(p.needs.social - 0.55 * dt, 0, 1);
  if (p.needs.food <= 0 && rng.chance(dt * 2)) p.blood = Math.max(0.3, p.blood - 0.05); // malnutrition

  // --- situational thoughts (refresh ~4x/day) ---
  if ((p._sit = (p._sit || 0) + dt) > 0.25) {
    p._sit = 0;
    const i = tileIdx(world, p.x, p.y), T = tempAt(world.atmo, world.tiles, i);
    const insul = eraOf(p.gearEra).insul + (p.state === 'sleep' && p.home >= 0 ? 0.35 : 0);
    const minC = 16 - insul * 42, maxC = 31 + insul * 8;
    const c = cellAt(world.atmo, p.x, p.y), precip = world.atmo.precip[c];
    setSituational(p, 'hungry', p.needs.food < 0.25 && p.needs.food > 0, now);
    setSituational(p, 'starving', p.needs.food <= 0, now);
    setSituational(p, 'tired', p.needs.rest < 0.15, now);
    setSituational(p, 'bored', p.needs.joy < 0.15, now);
    setSituational(p, 'pain', p.pain > 0.15, now);
    setSituational(p, 'sick', p.diseases.length > 0, now);
    setSituational(p, 'cold', T < minC, now);
    setSituational(p, 'hot', T > maxC, now);
    setSituational(p, 'rain', precip > 0.12 && T > 0 && p.state !== 'sleep', now);
    setSituational(p, 'homeless', p.home < 0 && !isChild(p), now);
    setSituational(p, 'hospital', p.bedIn >= 0, now);
    setSituational(p, 'rationsStrict', n?.laws.rations === 'strict', now);
    setSituational(p, 'rationsGenerous', n?.laws.rations === 'generous', now);
    setSituational(p, 'smog', world.tiles.pollution[i] > 60, now);
    setSituational(p, 'shieldSafe', s && s.until.shield > now, now);
    const atWar = n && Object.entries(n.relations).some(([id, r]) => r.state === 'war' && !world.nations[id]?.raider);
    const bt = p.traits.includes('bloodthirsty');
    setSituational(p, 'atWar', atWar && !bt, now);
    setSituational(p, 'warLust', atWar && bt, now);
    setSituational(p, 'peaceRestless', !atWar && bt, now);
    if (p.traits.includes('nightOwl')) {
      const lt = localTime(world, p.x);
      const night = lt < 0.25 || lt > 0.85;
      setSituational(p, 'nightOwlNight', night, now); setSituational(p, 'nightOwlDay', !night && p.state !== 'sleep', now);
    }
    if (p.traits.includes('greedy')) setSituational(p, 'greedyPoor', p.home < 0 || (world.buildings[p.home]?.era ?? 0) < era - 1, now);
    // environmental illness
    const warm = s && dist(p.x, p.y, s.x, s.y, world.W) < 5 ? 10 : 0; // fires & halls keep people warm
    const env = { hypothermia: T + warm < minC - 16 ? 0.3 : -0.6, heatstroke: T > maxC + 10 ? 0.3 : -0.6 };
    p._env = env;
    if (env.hypothermia > 0 && p.state !== 'sleep') addDisease(p, 'hypothermia', 0.02);
    if (env.heatstroke > 0) addDisease(p, 'heatstroke', 0.02);
    if (world.tiles.pollution[i] > 120 && rng.chance(0.02)) addDisease(p, 'smogLung', 0.05);
    // gusts can knock people over
    const wu = world.atmo.U[c], wv = world.atmo.V[c], ws = Math.hypot(wu, wv);
    if (ws > 24 && p.state !== 'sleep' && rng.chance(0.08 * (ws - 24) / 10)) {
      emitFx(world, { type: 'knock', pid: p.id, ix: wu * 0.25, iy: -2 - ws * 0.05, gust: true });
      p.stunUntil = now + 0.02;
    }
  }

  if (p.downed) { p.state = 'downed'; p.path = null; if (p.job && p.job.type !== 'patient') p.job = null; return; }
  if (p.stunUntil > now) { p.state = 'downed'; return; }
  if (p.possessedBy) return stepPossessed(world, p, dt, ctx);

  // --- mental state ---
  if (p.brk) { if (p.brk.until < now) endBreak(world, p); else return stepBreak(world, p, dt, ctx); }
  else if (!isChild(p) && (p._mb = (p._mb || 0) + dt) > 0.1) {
    p._mb = 0;
    const off = p.fx.breakOff || 0;
    const lvl = p.mood < 5 + off ? 'extreme' : p.mood < 20 + off ? 'major' : p.mood < 35 + off ? 'minor' : null;
    if (lvl && rng.chance({ minor: 0.05, major: 0.08, extreme: 0.12 }[lvl])) return startBreak(world, p, lvl, rng);
    if (!p.insp && p.mood > 80 && rng.chance(0.004)) startInspiration(world, p, rng.pick(['work', 'research', 'craft']));
  }
  if (p.insp && p.insp.until < now) p.insp = null;

  if (p.job && !['sleep', 'eat', 'patient', 'fight', 'doctor', 'firefight'].includes(p.job.type) && ((p.needs.food < 0.12 && foodAvailable(s?.stock || {})) || p.needs.rest < 0.06)) { p.job = null; p.path = null; }
  if (!p.job) p.job = chooseJob(world, p, ctx);
  if (p.job) doJob(world, p, dt, ctx);
}

export const localTime = (world, x) => (world.time + (x / world.W) - 0.5 + 10) % 1;

// ---------- mental breaks ----------
function startBreak(world, p, lvl, rng) {
  let opts = MENTAL_BREAKS[lvl].slice();
  if (lvl === 'extreme' && !p.traits.includes('pyromaniac')) opts = opts.filter((o) => o !== 'fireStarting');
  if (p.traits.includes('pyromaniac') && lvl !== 'minor') opts.push('fireStarting', 'fireStarting');
  if (p.traits.includes('gourmand') && lvl === 'minor') opts.push('foodBinge', 'foodBinge');
  if (p.traits.includes('pacifist')) opts = opts.filter((o) => o !== 'berserk');
  const type = rng.pick(opts);
  p.brk = { type, lvl, until: world.time + rng.range(0.25, 0.7) };
  p.job = null; p.path = null;
  logEvent(world, 'break', `${fullName(p)}: ${BREAK_LABELS[type]}`, { pid: p.id, nationId: p.nationId, x: p.x, y: p.y, severity: lvl });
  emitFx(world, { type: 'emote', pid: p.id, icon: 'storm' });
}
function endBreak(world, p) {
  p.brk = null; p.job = null;
  addThought(p, 'catharsis', world.time);
}
function stepBreak(world, p, dt, ctx) {
  const { rng } = ctx;
  p.state = 'break';
  const b = p.brk;
  if (b.type === 'berserk') {
    const victims = pawnsNear(world, p.x, p.y, 8).filter((q) => q !== p && !q.dead && !q.downed);
    const v = victims[0];
    if (v) { if (!near(world, p, v.x, v.y, 1.2)) { if (!p.path) goTo(world, p, v.x, v.y, 300); walk(world, p, dt); } else if ((p._atk = (p._atk || 0) - dt) <= 0) { p._atk = 0.02; pawnAttack(world, p, v, rng); } }
    return;
  }
  if (b.type === 'fireStarting' && rng.chance(dt * 6)) {
    const i = tileIdx(world, p.x + rng.range(-3, 3), p.y + rng.range(-3, 3));
    if (ignite(world, i, 120)) logEvent(world, 'disaster', `${fullName(p)} started a fire!`, { x: p.x, y: p.y, nationId: p.nationId });
  }
  if (b.type === 'foodBinge' && ctx.s && rng.chance(dt * 10)) { const st = ctx.s.stock; if (st.meals > 0) st.meals--; else if (st.food > 0) st.food--; p.needs.food = 1; }
  if (b.type === 'insultSpree') {
    const q = pawnsNear(world, p.x, p.y, 3).find((q) => q !== p && !q.dead);
    if (q && rng.chance(dt * 8)) { addThought(q, 'insulted', world.time); changeOpinion(q, p, -8); emitFx(world, { type: 'emote', pid: p.id, icon: 'angry' }); }
  }
  if (b.type === 'hideInRoom' && p.home >= 0 && world.buildings[p.home]) {
    const [hx, hy] = bCenter(world.buildings[p.home]);
    if (!near(world, p, hx, hy, 1)) { if (!p.path) goTo(world, p, hx, hy); walk(world, p, dt); }
    return;
  }
  // wander (sad / run wild)
  if (!p.path || walk(world, p, dt)) {
    const r = b.type === 'runWild' ? 14 : 5;
    goTo(world, p, p.x + rng.range(-r, r), p.y + rng.range(-r, r), 400);
  }
}

export function startInspiration(world, p, type) {
  p.insp = { type, until: world.time + 3 };
  logEvent(world, 'good', `${fullName(p)} is inspired: ${type === 'research' ? 'a flash of insight' : type === 'craft' ? 'creative brilliance' : 'a frenzy of work'}!`, { pid: p.id, nationId: p.nationId });
  emitFx(world, { type: 'emote', pid: p.id, icon: 'bulb' });
}

// ---------- possession (direct control by a player) ----------
function stepPossessed(world, p, dt, ctx) {
  const c = p.ctrl || {};
  p.job = null;
  if (c.sleep) { p.state = 'sleep'; return; }
  const mx = c.mx || 0, my = c.my || 0;
  if (mx || my) {
    const len = Math.hypot(mx, my), sp = moveSpeed(p) * 1.15 * dt;
    const nx = wrap(p.x + (mx / len) * sp, world.W), ny = clamp(p.y + (my / len) * sp, 0.5, world.H - 0.5);
    if (tileCost(world.tiles, tileIdx(world, nx, ny)) > 0) { p.x = nx; p.y = ny; }
    else if (tileCost(world.tiles, tileIdx(world, nx, p.y)) > 0) p.x = nx;
    else if (tileCost(world.tiles, tileIdx(world, p.x, ny)) > 0) p.y = ny;
    if (mx) p.facing = mx > 0 ? 1 : -1;
    p.moving = true; p.state = 'walk';
  } else p.state = 'idle';
  if (c.act && (p._atk = (p._atk || 0) - dt) <= 0) {
    p._atk = 0.025;
    const fx = p.x + p.facing * 0.9, fy = p.y;
    // attack nearest hostile creature or (explicitly targeted) pawn
    const target = c.targetPawn ? world.pawns[c.targetPawn] : null;
    const animal = Object.values(world.animals).find((a) => dist(a.x, a.y, fx, fy, world.W) < 1.6);
    if (target && !target.dead) pawnAttack(world, p, target, ctx.rng);
    else if (animal) pawnAttack(world, p, animal, ctx.rng);
    else { // interact with the tile ahead: chop, mine, harvest
      const i = tileIdx(world, fx, fy), t = world.tiles;
      if ([F.TREE, F.ROCK, F.ORE, F.BERRY, F.CROP_READY, F.GOLD].includes(t.feat[i])) { harvestTile(world, p, i, ctx, 1); p.attackAnim = 1; p.state = 'work'; }
    }
    if (c.act === 'once') c.act = null;
  }
}

// ---------- job selection ----------
const W8 = (v) => Math.max(0, v);
export function chooseJob(world, p, ctx) {
  const { rng, s, n } = ctx;
  const now = world.time;
  if (!s) return { type: 'wander', until: now + 0.2 };
  const st = s.stock;
  const lt = localTime(world, s.x);
  const night = p.traits.includes('nightOwl') ? (lt > 0.35 && lt < 0.7) : (lt < 0.22 || lt > 0.9);

  // patients go to bed
  if ((needsTending(p) || p.pain > 0.2 || p.diseases.some((d) => d.sev > 0.25)) && p.hp < 95) {
    const bed = findBed(world, s, p);
    if (bed) return { type: 'patient', bid: bed.id };
  }
  if (p.needs.food < 0.3 && foodAvailable(st)) return { type: 'eat' };
  if (p.needs.food < 0.2) { const i = findFeature(world, p, [F.BERRY], 14, rng); if (i >= 0) return { type: 'gather', i, forage: true }; }
  if (p.needs.rest < 0.12 || (night && p.needs.rest < 0.7)) return { type: 'sleep' };

  if (isChild(p)) {
    if (p.needs.joy < 0.6 || rng.chance(0.5)) return { type: 'play', until: now + 0.15 };
    return { type: 'learn', until: now + 0.2 };
  }
  // soldiers in a raid squad
  if (p.squad) { const sq = world.squads?.[p.squad]; if (sq) return { type: 'raid', squad: p.squad }; p.squad = null; }

  // emergencies: fire and wounded neighbours
  if (!p.traits.includes('pyromaniac')) {
    for (const fi of world.fireActive) { const fx = fi % world.W, fy = (fi / world.W) | 0; if (dist(fx, fy, s.x, s.y, world.W) < s.radius + 3 && dist(fx, fy, p.x, p.y, world.W) < 18) return { type: 'firefight', i: fi }; }
  }
  const patient = findPatient(world, s, p);
  if (patient && (p.skills.medical.lvl >= 3 || p.skills.medical.passion > 0 || isBleeding(patient))) return { type: 'doctor', pid: patient.id };

  if (p.needs.joy < 0.35 || (p.thoughts.some((t) => t.id === 'cold') && rng.chance(0.6))) return pickJoy(world, p, s, n, rng);
  if (p.needs.social < 0.3 || rng.chance(0.04)) { const q = pawnsNear(world, p.x, p.y, 12).find((q) => q !== p && !q.dead && !q.downed && q.state !== 'sleep' && !q.brk); if (q) return { type: 'chat', pid: q.id, until: now + 0.08 }; }
  if (p.role === 'prophet' && rng.chance(0.5)) { const t = settlementBuildings(world, s, 'temple')[0]; if (t) return { type: 'preach', bid: t.id, until: now + 0.4 }; }

  // ---- work: weighted by need, skill and passion ----
  const opts = [];
  const pop = s.pop || 1;
  const focus = n.laws.focus;
  const pref = (skill) => (0.5 + p.skills[skill].lvl * 0.06 + p.skills[skill].passion * 0.35);
  const site = s.buildings.map((id) => world.buildings[id]).find((b) => b && !b.built && !BUILDINGS[b.type].field);
  if (site) opts.push([{ type: 'build', bid: site.id }, 3 * pref('construction') * (focus === 'build' ? 2 : 1)]);
  const fields = settlementBuildings(world, s, 'farm', false);
  if (fields.length) {
    const unbuilt = fields.find((f) => !f.built);
    if (unbuilt) opts.push([{ type: 'build', bid: unbuilt.id }, 1.5 * pref('plants')]);
    const fi = findFarmWork(world, fields, rng);
    if (fi) opts.push([{ type: 'farm', i: fi.i, sow: fi.sow }, (fi.sow ? 2 : 4.5) * pref('plants') * (focus === 'food' ? 2 : 1)]);
  }
  const foodDays = (st.food + st.meals + st.rations) / pop;
  opts.push([{ type: 'hunt' }, (W8(8 - foodDays) * 0.45 + (n.era <= 1 ? 0.5 : 0.1)) * pref('animals')]);
  if (foodDays < 10) opts.push([{ type: 'fish' }, (W8(10 - foodDays) * 0.4 + 0.3) * pref('animals')]);
  opts.push([{ type: 'gatherFeat', feats: [F.BERRY], res: 'food' }, (W8(8 - foodDays) * 0.6 + (n.era === 0 ? 0.8 : 0.1)) * pref('plants')]);
  const cookers = settlementBuildings(world, s).filter((b) => BUILDINGS[b.type].fn.cook);
  if (cookers.length && st.food > 2 && st.meals < pop * 2.5) opts.push([{ type: 'cook', bid: rng.pick(cookers).id }, 2.2 * pref('cooking')]);
  const kitchens = settlementBuildings(world, s, 'kitchen');
  if (kitchens.length && st.food > pop * 3 && st.rations < pop * 6) opts.push([{ type: 'cook', bid: kitchens[0].id, rations: true }, 1.4 * pref('cooking')]);
  const wantWood = 40 + pop * 2 - st.wood + (s.need?.wood || 0) * 2, wantStone = (n.era >= 1 ? 30 : 10) + pop - st.stone + (s.need?.stone || 0) * 2;
  if (wantWood > 0) opts.push([{ type: 'gatherFeat', feats: [F.TREE], res: 'wood' }, Math.min(3, wantWood / 20) * pref('construction') + 0.2]);
  if (wantStone > 0) opts.push([{ type: 'gatherFeat', feats: [F.ROCK], res: 'stone' }, Math.min(2.5, wantStone / 20) * pref('mining') + 0.1]);
  if ((n.era >= 2 && st.metal < 20 + pop) || s.need?.metal) opts.push([{ type: 'gatherFeat', feats: [F.ORE, F.GOLD], res: 'metal' }, 1.2 * pref('mining')]);
  const labs = settlementBuildings(world, s, 'research');
  if (labs.length) opts.push([{ type: 'research', bid: rng.pick(labs).id, until: now + 0.35 }, (1.6 + (p.fx.research || 0) * 2) * pref('intellectual') * (focus === 'science' ? 2.2 : 1) * (1 + n.ideology.faith / 200)]);
  const temples = settlementBuildings(world, s, 'temple');
  if (temples.length) opts.push([{ type: 'worship', bid: rng.pick(temples).id, until: now + 0.2 }, (0.8 + (p.fx.glitter || 0)) * (1 - n.ideology.faith / 150) * (focus === 'faith' ? 2.2 : 1)]);
  const shops = settlementBuildings(world, s).filter((b) => BUILDINGS[b.type].fn.craft);
  if (shops.length && (p.gearEra < n.era || st.medicine < pop * 0.5 || st.cloth > 10)) opts.push([{ type: 'craft', bid: rng.pick(shops).id, until: now + 0.3 }, 1.6 * pref('crafting')]);
  const healers = settlementBuildings(world, s, 'healer');
  if (healers.length && st.medicine < pop * 0.4 && st.food > 6) opts.push([{ type: 'brew', bid: healers[0].id, until: now + 0.25 }, 0.8 * pref('medical')]);
  if (p.role === 'soldier') opts.push([{ type: 'patrol', until: now + 0.25 }, 1.2 * (focus === 'military' ? 2 : 1)]);
  opts.push([{ type: 'wander', until: now + 0.1 }, 0.15]);

  return rng.weighted(opts);
}

function pickJoy(world, p, s, n, rng) {
  const spots = settlementBuildings(world, s).filter((b) => BUILDINGS[b.type].fn.joy || b.type === 'temple' || b.type === 'center');
  if (!spots.length) return { type: 'wander', until: world.time + 0.1, joy: true };
  return { type: 'relax', bid: rng.pick(spots).id, until: world.time + 0.18 };
}

const foodAvailable = (st) => st.meals >= 1 || st.rations >= 1 || st.food >= 1;
function findBed(world, s, p) {
  for (const b of settlementBuildings(world, s, 'healer')) {
    b.patients = (b.patients || []).filter((id) => world.pawns[id] && !world.pawns[id].dead && world.pawns[id].bedIn === b.id);
    if (b.patients.includes(p.id) || b.patients.length < BUILDINGS.healer.fn.beds + Math.floor(b.era / 3)) return b;
  }
  return null;
}
function findPatient(world, s, doc) {
  let best = null, bd = 1e9;
  for (const q of pawnsNear(world, doc.x, doc.y, s.radius + 6)) {
    if (q === doc || q.dead || q.settlementId !== s.id || !needsTending(q)) continue;
    if (q.tendedBy && q.tendedBy !== doc.id && world.pawns[q.tendedBy]?.job?.pid === q.id) continue;
    const d = dist(q.x, q.y, doc.x, doc.y, world.W) - (isBleeding(q) ? 20 : 0) - (q.downed ? 10 : 0);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function findFeature(world, p, feats, r, rng) {
  const t = world.tiles, W = world.W;
  let best = -1, bd = 1e9;
  for (let k = 0; k < 60; k++) {
    const x = Math.floor(p.x + rng.range(-r, r)), y = Math.floor(p.y + rng.range(-r, r));
    if (y < 0 || y >= world.H) continue;
    const i = y * W + wrap(x, W);
    if (!feats.includes(t.feat[i])) continue;
    if (t.owner[i] !== -1 && t.owner[i] !== p.nationId) continue;
    const d = dist(p.x, p.y, x, y, W);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function findShore(world, p, rng) {
  const t = world.tiles, W = world.W;
  for (let k = 0; k < 80; k++) {
    const x = Math.floor(p.x + rng.range(-14, 14)), y = Math.floor(p.y + rng.range(-14, 14));
    if (y < 1 || y >= world.H - 1) continue;
    const i = y * W + wrap(x, W);
    if (BIOMES[t.biome[i]].water || t.feat[i] === F.BUILDING) continue;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + oy) * W + wrap(x + ox, W); if (BIOMES[t.biome[j]].water || t.river[j]) return i; }
  }
  return -1;
}
function findFarmWork(world, fields, rng) {
  const t = world.tiles, W = world.W;
  for (let k = 0; k < 6; k++) {
    const f = rng.pick(fields); if (!f.built) continue;
    for (let j = 0; j < 4; j++) {
      const i = (f.y + rng.int(0, f.h - 1)) * W + wrap(f.x + rng.int(0, f.w - 1), W);
      if (t.feat[i] === F.CROP_READY) return { i, sow: false };
      if (t.feat[i] === F.FARM && t.crop[i] === 0) return { i, sow: true };
    }
  }
  return null;
}

// ---------- job execution ----------
function arriveAt(world, p, x, y, dt, r = 1.2, budget) {
  if (near(world, p, x, y, r)) { p.path = null; return true; }
  if (!p.path) { if (!goTo(world, p, x, y, budget)) { p.job = null; return false; } }
  p.state = 'walk';
  if (walk(world, p, dt) && !near(world, p, x, y, r + 0.6)) { if (!goTo(world, p, x, y, budget)) p.job = null; }
  return false;
}

function harvestTile(world, p, i, ctx, mult = 1) {
  const t = world.tiles, f = t.feat[i], s = ctx.s;
  const n = ctx.n;
  const res = f === F.TREE ? 'wood' : f === F.ROCK ? 'stone' : f === F.ORE || f === F.GOLD ? 'metal' : f === F.BERRY ? 'food' : f === F.CROP_READY ? 'food' : null;
  if (!res) return;
  const skill = res === 'wood' ? 'construction' : res === 'food' ? 'plants' : 'mining';
  let amt = res === 'wood' ? 4 : res === 'stone' ? 3 : res === 'metal' ? (f === F.GOLD ? 6 : 2) : f === F.CROP_READY ? 6 : 6;
  amt = Math.round(amt * skillFactor(p, skill) * mult * (n && n.ideology.nature < -40 && res !== 'food' ? 1.25 : 1));
  if (f === F.ORE && n && n.era < 2) { amt = 1; } // stone tools barely chip ore
  gainXp(p, skill, 60);
  if (f === F.CROP_READY) { t.feat[i] = F.FARM; t.crop[i] = 0; }
  else if (t.featHp[i] > 1) t.featHp[i]--;
  else { t.feat[i] = f === F.TREE ? F.STUMP : F.NONE; t.featHp[i] = 0; if (n && n.ideology.nature < -20) t.pollution[i] = Math.min(255, t.pollution[i] + 4); }
  world.dirty.add(i);
  p.carry = { res, amt: (p.carry?.res === res ? p.carry.amt : 0) + amt };
  if (res === 'stone' && ctx.rng.chance(0.06)) p.carry.flint = true;
  emitFx(world, { type: 'chip', x: (i % world.W) + 0.5, y: Math.floor(i / world.W) + 0.5, res });
  if (p.possessedBy && s) { s.stock[res] += p.carry.amt; p.carry = null; } // possessed: deposit instantly
}

function deliver(world, p, dt, ctx) {
  const { s } = ctx;
  const store = settlementBuildings(world, s, 'storage')[0] || world.buildings[s.buildings[0]] || null;
  const [x, y] = store ? bCenter(store) : [s.x, s.y];
  if (!arriveAt(world, p, x, y, dt, 1.8)) return false;
  s.stock[p.carry.res] = (s.stock[p.carry.res] || 0) + p.carry.amt;
  if (p.carry.hide) s.stock.cloth += p.carry.hide;
  p.carry = null;
  return true;
}

export function doJob(world, p, dt, ctx) {
  const j = p.job, { s, n, rng } = ctx, now = world.time, t = world.tiles, W = world.W;
  if (p.carry && j.type !== 'gather' && j.type !== 'gatherFeat' && j.type !== 'hunt' && j.type !== 'fish') { if (deliver(world, p, dt, ctx)) p.job = null; return; }
  const done = () => { p.job = null; p.state = 'idle'; };
  switch (j.type) {
    case 'wander': {
      p.state = 'walk';
      if (!p.path || walk(world, p, dt)) { if (now > j.until) return done(); goTo(world, p, s ? s.x + rng.range(-s.radius * 0.7, s.radius * 0.7) : p.x + rng.range(-4, 4), s ? s.y + rng.range(-s.radius * 0.7, s.radius * 0.7) : p.y + rng.range(-4, 4), 400); }
      if (j.joy) p.needs.joy = Math.min(1, p.needs.joy + dt * 0.5);
      return;
    }
    case 'play': case 'learn': {
      p.state = 'walk';
      if (!p.path || walk(world, p, dt)) { if (now > j.until) return done(); goTo(world, p, s.x + rng.range(-4, 4), s.y + rng.range(-4, 4), 300); }
      if (j.type === 'play') p.needs.joy = Math.min(1, p.needs.joy + dt * 2); else gainXp(p, rng.pick(['intellectual', 'social', 'artistic', 'crafting']), 30 * dt * 10);
      p.needs.social = Math.min(1, p.needs.social + dt);
      return;
    }
    case 'eat': {
      const store = settlementBuildings(world, s, 'storage')[0] || world.buildings[s.buildings[0]];
      const [x, y] = store ? bCenter(store) : [s.x, s.y];
      if (!arriveAt(world, p, x, y, dt, 1.8)) return;
      p.state = 'eat';
      j.t = (j.t || 0) + dt; if (j.t < 0.03) return;
      const st = s.stock, portion = n.laws.rations === 'strict' ? 0.7 : n.laws.rations === 'generous' ? 1.3 : 1;
      if (st.meals >= portion) { st.meals -= portion; p.needs.food = Math.min(1, p.needs.food + 0.9 * Math.min(1.1, portion + 0.1)); addThought(p, rng.chance(0.15 + p.skills.cooking.lvl * 0.01) ? 'ateFine' : 'ateMeal', now); }
      else if (st.rations >= portion) { st.rations -= portion; p.needs.food = Math.min(1, p.needs.food + 0.85 * portion); if (!p.traits.includes('ascetic')) addThought(p, 'ateRation', now); }
      else if (st.food >= portion) { st.food -= portion; p.needs.food = Math.min(1, p.needs.food + 0.7 * portion); if (!p.traits.includes('ascetic')) addThought(p, 'ateRaw', now); }
      return done();
    }
    case 'sleep': {
      const home = p.home >= 0 ? world.buildings[p.home] : null;
      if (home && home.built) { const [x, y] = bCenter(home); if (!arriveAt(world, p, x, y, dt, 1)) return; }
      p.state = 'sleep';
      if (p.needs.rest >= 0.99 || (p.needs.food < 0.12 && foodAvailable(s.stock))) { addThought(p, home ? 'sleptHome' : 'sleptOutside', now); return done(); }
      return;
    }
    case 'patient': {
      const b = world.buildings[j.bid]; if (!b) return done();
      const [x, y] = bCenter(b);
      if (p.bedIn !== b.id) { if (!arriveAt(world, p, x, y, dt, 1)) return; p.bedIn = b.id; b.patients = b.patients || []; if (!b.patients.includes(p.id)) b.patients.push(p.id); }
      p.state = 'sleep';
      if (!needsTending(p) && p.pain < 0.1 && p.diseases.every((d) => d.sev < 0.15) && p.hp > 90) { p.bedIn = -1; b.patients = b.patients.filter((id) => id !== p.id); return done(); }
      return;
    }
    case 'doctor': {
      const q = world.pawns[j.pid]; if (!q || q.dead || !needsTending(q)) return done();
      q.tendedBy = p.id;
      if (!arriveAt(world, p, q.x, q.y, dt, 1.1)) return;
      p.state = 'work'; p.facing = dx(p.x, q.x, W) >= 0 ? 1 : -1;
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'medical');
      if (j.t < 0.05) return;
      const useMed = s.stock.medicine >= 1;
      if (useMed) s.stock.medicine--;
      const quality = tend(q, p, useMed ? MED_QUALITY[n.era] : 0, q.bedIn >= 0);
      gainXp(p, 'medical', 300);
      addThought(q, 'tended', now);
      changeOpinion(q, p, 6);
      emitFx(world, { type: 'emote', pid: q.id, icon: 'heart' });
      if (quality > 0.9) logEvent(world, 'good', `${fullName(p)} performed masterful surgery on ${fullName(q)}.`, { pid: p.id, nationId: p.nationId });
      return done();
    }
    case 'gather': case 'gatherFeat': {
      if (p.carry && p.carry.amt >= 8) { if (deliver(world, p, dt, ctx)) return done(); return; }
      if (j.i === undefined || !(j.feats || [F.BERRY, F.TREE, F.ROCK, F.ORE]).includes(t.feat[j.i])) {
        if (j.found) { if (p.carry) { j.i = undefined; if (deliver(world, p, dt, ctx)) done(); return; } return done(); }
        j.i = findFeature(world, p, j.feats || [F.BERRY], 18, rng); j.found = true;
        if (j.i < 0) { j.i = findFeature(world, p, j.feats || [F.BERRY], 34, rng); if (j.i < 0) return done(); }
      }
      const x = (j.i % W) + 0.5, y = Math.floor(j.i / W) + 0.5;
      if (!arriveAt(world, p, x, y, dt, 1.3)) return;
      p.state = 'work'; p.facing = dx(p.x, x, W) >= 0 ? 1 : -1;
      j.t = (j.t || 0) + dt * workSpeed(p) * (n.era >= 1 ? 1.2 : 1);
      if (j.t < 0.025) return;
      j.t = 0;
      harvestTile(world, p, j.i, ctx);
      if (j.forage && p.carry) { p.needs.food = Math.min(1, p.needs.food + 0.35); p.carry.amt = Math.max(0, p.carry.amt - 1); return done(); }
      return;
    }
    case 'farm': {
      const x = (j.i % W) + 0.5, y = Math.floor(j.i / W) + 0.5;
      if (!arriveAt(world, p, x, y, dt, 1.0)) return;
      p.state = 'work';
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'plants');
      if (j.t < (j.sow ? 0.015 : 0.02)) return;
      if (j.sow && t.feat[j.i] === F.FARM && t.crop[j.i] === 0) { t.crop[j.i] = 1; world.dirty.add(j.i); gainXp(p, 'plants', 40); }
      else if (!j.sow && t.feat[j.i] === F.CROP_READY) { harvestTile(world, p, j.i, ctx); }
      return done();
    }
    case 'hunt': {
      if (p.carry) { if (deliver(world, p, dt, ctx)) return done(); return; }
      let a = j.aid ? world.animals[j.aid] : null;
      if (!a) {
        let bd = 30;
        for (const an of Object.values(world.animals)) { const d = dist(an.x, an.y, p.x, p.y, W); if (d < bd && !ANIMALS[an.kind].noHunt && !(ANIMALS[an.kind].size > 1.8 && n.era < 1 && !p.squad)) { bd = d; a = an; } }
        if (!a) return done();
        j.aid = a.id;
      }
      if (a.dead) { // butcher
        if (!arriveAt(world, p, a.x, a.y, dt, 1.2)) return;
        p.carry = { res: 'food', amt: ANIMALS[a.kind].meat, hide: ANIMALS[a.kind].hide };
        delete world.animals[a.id]; gainXp(p, 'animals', 200);
        return;
      }
      const w = eraOf(p.gearEra).weapon;
      const rng2 = w.ranged ? Math.min(w.range, 6) : 1.2;
      if (dist(a.x, a.y, p.x, p.y, W) > rng2) { if (!p.path || (j.re = (j.re || 0) + dt) > 0.05) { j.re = 0; goTo(world, p, a.x, a.y, 600); } p.state = 'walk'; walk(world, p, dt); return; }
      p.path = null; p.state = 'fight';
      if ((p._atk = (p._atk || 0) - dt) <= 0) { p._atk = 0.03; const keep = p.role; if (w.ranged) p.role = 'soldier'; pawnAttack(world, p, a, rng); p.role = keep; gainXp(p, 'animals', 20); }
      return;
    }
    case 'fish': {
      if (p.carry) { if (deliver(world, p, dt, ctx)) return done(); return; }
      if (j.i === undefined) { j.i = findShore(world, p, rng); if (j.i < 0) return done(); }
      const x = (j.i % W) + 0.5, y = Math.floor(j.i / W) + 0.5;
      if (!arriveAt(world, p, x, y, dt, 1.0)) return;
      p.state = 'work';
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'animals') * (n.era >= 2 ? 1.4 : 1);
      if (j.t > 0.05) { j.t = 0; gainXp(p, 'animals', 60); if (rng.chance(0.75)) { p.carry = { res: 'food', amt: (p.carry?.amt || 0) + 3 + (n.era >= 2 ? 1 : 0) }; emitFx(world, { type: 'chip', x, y, res: 'food' }); } if ((j.n = (j.n || 0) + 1) >= 3) j.done = true; }
      if (j.done && p.carry) return;
      if (j.done) return done();
      return;
    }
    case 'cook': {
      const b = world.buildings[j.bid]; if (!b) return done();
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x, y, dt, 1.6)) return;
      p.state = 'work';
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'cooking') * (BUILDINGS[b.type].fn.cook || 1);
      if (j.t < 0.03) return;
      j.t = 0;
      const batch = Math.min(s.stock.food, 4);
      if (batch < 1) return done();
      s.stock.food -= batch;
      if (j.rations) s.stock.rations += batch; else s.stock.meals += batch * (rng.chance(0.03 * (10 - p.skills.cooking.lvl) / 10) ? 0 : 1); // poor cooks waste some
      gainXp(p, 'cooking', 120);
      if ((j.n = (j.n || 0) + 1) >= 3) return done();
      return;
    }
    case 'build': {
      const b = world.buildings[j.bid]; if (!b || b.built) return done();
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x, y, dt, Math.max(b.w, b.h) / 2 + 0.8)) return;
      const def = BUILDINGS[b.type];
      if (!b.paid) {
        const cost = scaledCost(def, b.era);
        for (const [r, v] of Object.entries(cost)) if ((s.stock[r] || 0) < v) { j.waitFor = r; return done(); }
        for (const [r, v] of Object.entries(cost)) s.stock[r] -= v;
        b.paid = true;
      }
      p.state = 'work';
      b.progress += (dt * workSpeed(p) * skillFactor(p, 'construction') * 100) / Math.max(10, def.work * (1 + b.era * 0.15));
      gainXp(p, 'construction', 30);
      if (rng.chance(dt * 20)) emitFx(world, { type: 'chip', x, y, res: 'wood' });
      if (b.progress >= 1) {
        b.progress = 1; b.built = true; b.hp = def.hp * (1 + b.era * 0.25);
        if (def.field) for (let oy = 0; oy < b.h; oy++) for (let ox = 0; ox < b.w; ox++) { const i = (b.y + oy) * W + wrap(b.x + ox, W); t.crop[i] = 0; world.dirty.add(i); }
        emitFx(world, { type: 'built', x, y, bid: b.id });
        return done();
      }
      return;
    }
    case 'research': case 'worship': case 'relax': case 'craft': case 'brew': case 'preach': {
      const b = world.buildings[j.bid]; if (!b || !b.built) return done();
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x + rng.range(-0.6, 0.6), y + 0.8, dt, 1.8)) return;
      p.state = j.type === 'relax' || j.type === 'worship' || j.type === 'preach' ? 'idle' : 'work';
      const ws = workSpeed(p);
      if (j.type === 'research') {
        const rp = dt * 16 * ws * skillFactor(p, 'intellectual') * (1 + (p.fx.research || 0)) * (p.insp?.type === 'research' ? 3 : 1) * (BUILDINGS.research.fn.research / 2);
        n.research += rp * ctx.researchMult; gainXp(p, 'intellectual', 80 * dt * 10);
      } else if (j.type === 'worship') {
        const g = dt * 4 * Math.max(0.1, 1 + (p.fx.glitter || 0)) * (1 - n.ideology.faith / 140) * ctx.glitterMult;
        n.glitter += g; n.devotion += g; p.needs.joy = Math.min(1, p.needs.joy + dt * 1.2);
        if (rng.chance(dt * 2)) addThought(p, 'worshipped', now);
        if (rng.chance(dt * 4)) emitFx(world, { type: 'glitter', x, y: y - 1, amount: 1, nationId: n.id });
      } else if (j.type === 'preach') {
        const g = dt * 8 * ctx.glitterMult; n.glitter += g; n.devotion += g;
        for (const q of pawnsNear(world, x, y, 6)) if (q !== p && rng.chance(dt * 3)) addThought(q, 'prophetSermon', now);
        if (rng.chance(dt * 6)) emitFx(world, { type: 'glitter', x, y: y - 1.2, amount: 3, nationId: n.id });
      } else if (j.type === 'relax') {
        p.needs.joy = Math.min(1, p.needs.joy + dt * 2.2); p.needs.social = Math.min(1, p.needs.social + dt * 0.8);
      } else if (j.type === 'craft') {
        j.t = (j.t || 0) + dt * ws * skillFactor(p, 'crafting') * (BUILDINGS[b.type].fn.craft || 1) * (p.insp?.type === 'craft' ? 2.5 : 1);
        if (j.t > 0.08) {
          j.t = 0; gainXp(p, 'crafting', 200);
          // re-equip someone with the nation's current era gear, or make medicine / cloth goods
          const target = Object.values(world.pawns).find((q) => q.settlementId === s.id && !q.dead && q.gearEra < n.era);
          const metalNeed = n.era >= 2 ? 2 : 0;
          if (target && s.stock.cloth >= 1 && s.stock.metal >= metalNeed) { s.stock.cloth -= 1; s.stock.metal -= metalNeed; target.gearEra = n.era; emitFx(world, { type: 'emote', pid: target.id, icon: 'shirt' }); }
          else if (s.stock.cloth >= 2 && s.stock.medicine < (s.pop || 1)) { s.stock.cloth -= 1; s.stock.medicine += 1; }
        }
      } else if (j.type === 'brew') {
        j.t = (j.t || 0) + dt * ws * skillFactor(p, 'medical');
        if (j.t > 0.06 && s.stock.food >= 2) { j.t = 0; s.stock.food -= 2; s.stock.medicine += 1; gainXp(p, 'medical', 120); }
      }
      if (now > j.until) done();
      return;
    }
    case 'chat': {
      const q = world.pawns[j.pid]; if (!q || q.dead) return done();
      if (!arriveAt(world, p, q.x, q.y, dt, 1.3, 400)) return;
      p.state = 'idle'; p.facing = dx(p.x, q.x, W) >= 0 ? 1 : -1;
      if (!j.spoke) { j.spoke = true; socialInteraction(world, p, q, rng); }
      p.needs.social = Math.min(1, p.needs.social + dt * 3);
      if (now > j.until) done();
      return;
    }
    case 'firefight': {
      if (!t.fire[j.i]) return done();
      const x = (j.i % W) + 0.5, y = Math.floor(j.i / W) + 0.5;
      if (!arriveAt(world, p, x, y, dt, 1.5)) return;
      p.state = 'work';
      t.fire[j.i] = Math.max(0, t.fire[j.i] - dt * 900 * workSpeed(p));
      if (rng.chance(dt * 4)) emitFx(world, { type: 'steam', x, y });
      if (rng.chance(dt * 1.5)) { const inj = { part: rng.int(1, 5), kind: 'burn', sev: 3, bleed: 0, tq: 0, inf: 0 }; p.injuries.push(inj); }
      if (t.fire[j.i] <= 0) { world.dirty.add(j.i); done(); }
      return;
    }
    case 'patrol': {
      p.state = 'walk';
      const threat = pawnsNear(world, p.x, p.y, 10).find((q) => !q.dead && !q.downed && q.nationId !== p.nationId && world.nations[p.nationId]?.relations[q.nationId]?.state === 'war');
      if (threat) { p.job = { type: 'fight', pid: threat.id }; return; }
      if (!p.path || walk(world, p, dt)) { if (now > j.until) return done(); goTo(world, p, s.x + rng.range(-s.radius, s.radius), s.y + rng.range(-s.radius, s.radius), 500); }
      return;
    }
    case 'fight': {
      const q = world.pawns[j.pid]; if (!q || q.dead || q.downed) return done();
      const w = eraOf(p.gearEra).weapon, reach = p.role === 'soldier' && w.ranged ? w.range * 0.8 : 1.2;
      if (dist(p.x, p.y, q.x, q.y, W) > reach) { if (!p.path || (j.re = (j.re || 0) + dt) > 0.04) { j.re = 0; goTo(world, p, q.x, q.y, 500); } p.state = 'walk'; walk(world, p, dt); return; }
      p.path = null; p.state = 'fight';
      if ((p._atk = (p._atk || 0) - dt) <= 0) { p._atk = 0.025 * (p.fx.speed ? 1 - p.fx.speed * 0.5 : 1); pawnAttack(world, p, q, rng); }
      return;
    }
    case 'raid': return; // handled by war.js squad logic
    default: return done();
  }
}

export const scaledCost = (def, era) => {
  const out = {}; const m = 1 + era * 0.12;
  for (const [r, v] of Object.entries(def.cost)) out[r] = Math.round(v * m);
  // later eras swap wood for stone/metal
  if (era >= 4 && out.wood) { out.stone = (out.stone || 0) + Math.round(out.wood * 0.5); out.wood = Math.round(out.wood * 0.5); }
  if (era >= 6 && out.stone) { out.metal = (out.metal || 0) + Math.round(out.stone * 0.25); }
  return out;
};

// ---------- social ----------
export function socialInteraction(world, p, q, rng) {
  const now = world.time;
  const kindP = p.traits.includes('kind'), abrP = p.traits.includes('abrasive');
  const compat = 1 - Math.abs((p.look.face + p.look.brow) - (q.look.face + q.look.brow)) / 6 + ((q.fx.beauty || 0) * 0.15);
  const insult = !kindP && rng.chance(abrP ? 0.35 : p.traits.includes('paranoid') ? 0.15 : 0.06);
  if (insult) {
    addThought(q, 'insulted', now); changeOpinion(q, p, -8); emitFx(world, { type: 'emote', pid: p.id, icon: 'angry' });
    if (q.traits.includes('bloodthirsty') && rng.chance(0.15) && !q.brk) { q.job = { type: 'fight', pid: p.id }; q._socialFightUntil = now + 0.05; }
    return;
  }
  const deep = rng.chance(0.12 + (p.fx.social || 0) * 0.1);
  addThought(p, deep ? 'deepTalk' : 'chat', now); addThought(q, deep ? 'deepTalk' : 'chat', now);
  const d = (deep ? 6 : 3) * compat * (1 + (p.fx.social || 0));
  changeOpinion(p, q, d); changeOpinion(q, p, d);
  p.needs.social = Math.min(1, p.needs.social + 0.3); q.needs.social = Math.min(1, q.needs.social + 0.3);
  gainXp(p, 'social', 50);
  emitFx(world, { type: 'emote', pid: p.id, icon: deep ? 'chat2' : 'chat' });
  // romance
  const adult = (z) => z.age >= 18;
  if (adult(p) && adult(q) && p.spouse < 0 && q.spouse < 0 && p.lover < 0 && q.lover < 0 && opinion(p, q) > 22 && opinion(q, p) > 15 && Math.abs(p.age - q.age) < 15
      && !p.parents.some((id) => q.parents.includes(id)) && !p.parents.includes(q.id) && !q.parents.includes(p.id) && rng.chance(0.4)) {
    p.lover = q.id; q.lover = p.id; addThought(p, 'newLover', now); addThought(q, 'newLover', now);
    emitFx(world, { type: 'emote', pid: p.id, icon: 'love' }); emitFx(world, { type: 'emote', pid: q.id, icon: 'love' });
  } else if (p.lover === q.id && opinion(p, q) > 40 && rng.chance(0.3)) {
    p.spouse = q.id; q.spouse = p.id; p.lover = -1; q.lover = -1;
    addThought(p, 'married', now); addThought(q, 'married', now);
    if (q.sex === 'f' && p.sex === 'm') q.family = p.family; else if (p.sex === 'f' && q.sex === 'm') p.family = q.family;
    logEvent(world, 'social', `${fullName(p)} and ${fullName(q)} were married.`, { pid: p.id, nationId: p.nationId, x: p.x, y: p.y });
    emitFx(world, { type: 'emote', pid: p.id, icon: 'ring' });
  } else if (p.lover === q.id && opinion(p, q) < 0 && rng.chance(0.3)) {
    p.lover = -1; q.lover = -1; addThought(p, 'breakup', now); addThought(q, 'breakup', now);
  }
}
