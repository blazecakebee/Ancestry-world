// Citizen behaviour: needs, comfort, mental breaks, inspirations and the job system.
// Jobs are picked by a utility score that mixes settlement needs, skills and passions —
// similar to RimWorld work priorities, but fully autonomous (you are a god, not a manager).
import { F, BIOMES } from '../data/biomes.js';
import { BUILDINGS, buildCost } from '../data/buildings.js';
import { eraOf } from '../data/eras.js';
import { MENTAL_BREAKS, BREAK_LABELS } from '../data/society.js';
import { findPath, tileCost } from './pathfind.js';
import { addThought, setSituational, gainXp, skillFactor, workSpeed, moveSpeed, isChild, changeOpinion, opinion, fullName, computeFx } from './pawn.js';
import { needsTending, tend, isBleeding, MED_QUALITY, addDisease } from './health.js';
import { pawnAttack, ANIMALS } from './combat.js';
import { settlementBuildings, bCenter, pawnsNear, logEvent, emitFx, removeBuilding } from './world.js';
import { doDismantle } from './orders.js';
import { tempAt, cellAt } from '../world/atmosphere.js';
import { ignite } from '../world/physics.js';
import { wrap, dist, dx, clamp } from '../core/util.js';
import { DAY_LEN } from '../core/time.js';
import { addItem, takeCat, dropItem, nearestDrop } from './items.js';
import { toolSpeed, wearTool, upgradeFor, equipTool, craftChoice, craftTool } from './tools.js';
/** Which tool a map feature is worked with. */
const featTool = (f) => (f === F.TREE ? 'axe' : f === F.ROCK || f === F.ORE || f === F.GOLD ? 'pickaxe' : 'sickle');
import { CROPS, ANIMAL_DROPS, cropKindAt, wildFruit, itemCat } from '../data/items.js';

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
  const step = (moveSpeed(p) / cost) * dt * (1 + (world.nations[p.nationId]?.techFx?.move || 0));
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
  const cd = dt / DAY_LEN; // needs follow the calendar day, not the work clock
  p.needs.food = clamp(p.needs.food - hungerRate * 1.15 * cd, 0, 1);
  p.needs.rest = clamp(p.needs.rest + (p.state === 'sleep' ? 2.9 : -1.0) * cd, 0, 1);
  p.needs.joy = clamp(p.needs.joy - 0.7 * cd, 0, 1);
  p.needs.social = clamp(p.needs.social - 0.75 * cd, 0, 1);
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
  else if (!isChild(p) && (p._mb = (p._mb || 0) + dt) > 0.1 * DAY_LEN) { // break risk is judged a few times per calendar day
    p._mb = 0;
    const off = p.fx.breakOff || 0;
    const lvl = p.mood < 5 + off ? 'extreme' : p.mood < 20 + off ? 'major' : p.mood < 35 + off ? 'minor' : null;
    if (lvl && rng.chance({ minor: 0.04, major: 0.07, extreme: 0.11 }[lvl])) return startBreak(world, p, lvl, rng);
    if (!p.insp && p.mood > 80 && rng.chance(0.004)) startInspiration(world, p, rng.pick(['work', 'research', 'craft']));
  }
  if (p.insp && p.insp.until < now) p.insp = null;

  if (p.job && !['sleep', 'eat', 'patient', 'fight', 'doctor', 'firefight'].includes(p.job.type) && ((p.needs.food < 0.12 && foodAvailable(s?.stock || {})) || p.needs.rest < 0.06)) { p.job = null; p.path = null; }
  if (!p.job) p.job = chooseJob(world, p, ctx);
  if (p.job) doJob(world, p, dt, ctx);
}

export const localTime = (world, x) => (world.time / DAY_LEN + (x / world.W) - 0.5 + 10) % 1;

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
export const POSSESS_MODES = ['auto', 'punch', 'swing', 'chop', 'mine', 'harvest'];
const REACH = [[0.9, 0], [0.4, 0], [1.4, 0], [0.9, 0.9], [0.9, -0.9], [0, 0.9], [0, -0.9]];
/** First tile with one of `feats` in reach of the possessed pawn (in front first). */
function featInReach(world, p, feats) {
  for (const [ox, oy] of REACH) {
    const x = wrap(p.x + ox * p.facing, world.W), y = clamp(p.y + oy, 0, world.H - 1), i = tileIdx(world, x, y);
    if (feats.includes(world.tiles.feat[i])) return i;
  }
  return -1;
}
/** A possessed person may only strike or befriend wild creatures, raiders and AI tribes: never their own people or another deity's. */
function mayTouchPawn(world, p, q) {
  if (!q || q.dead || q === p || q.nationId === p.nationId) return false;
  const n = world.nations[q.nationId];
  return !(n && n.ownerId && n.ownerId !== p.possessedBy);
}
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
  if (!c.act || (p._atk = (p._atk || 0) - dt) > 0) return;
  const mode = POSSESS_MODES.includes(c.mode) ? c.mode : 'auto';
  p._atk = mode === 'swing' ? 0.04 : 0.025;
  const fx = p.x + p.facing * 0.9, fy = p.y;
  const clicked = c.targetPawn ? world.pawns[c.targetPawn] : null;
  const animalsNear = () => Object.values(world.animals).filter((a) => !a.dead && !ANIMALS[a.kind]?.noHunt && dist(a.x, a.y, fx, fy, world.W) < 1.6);
  const gather = (feats, tool) => {
    const i = featInReach(world, p, feats); if (i < 0) return false;
    const tk = featTool(world.tiles.feat[i]); harvestTile(world, p, i, ctx, 1); wearTool(world, p, tk, 0.5); p.toolOut = tk; p.attackAnim = 1; p.state = 'work'; p.tool = tool; return true;
  };
  const fight = () => {
    const pawn = mayTouchPawn(world, p, clicked) ? clicked : null, animal = animalsNear()[0];
    if (pawn) return pawnAttack(world, p, pawn, ctx.rng, mode === 'punch' ? { fists: true } : mode === 'swing' ? { melee: true } : {});
    if (animal) return pawnAttack(world, p, animal, ctx.rng, mode === 'punch' ? { fists: true } : mode === 'swing' ? { melee: true } : {});
    return false;
  };
  switch (mode) {
    case 'punch': // quick, weak bare-handed jab at one target
      if (!fight()) { p.attackAnim = 1; p.state = 'fight'; }
      break;
    case 'swing': { // slower weapon sweep that can catch several creatures at once
      const hits = animalsNear().slice(0, 3);
      if (mayTouchPawn(world, p, clicked)) pawnAttack(world, p, clicked, ctx.rng, { melee: true });
      for (const a of hits) pawnAttack(world, p, a, ctx.rng, { melee: true });
      p.attackAnim = 1; p.state = 'fight';
      break;
    }
    case 'chop': gather([F.TREE], 'axe'); break;
    case 'mine': gather([F.ROCK, F.ORE, F.GOLD], 'pick'); break;
    case 'harvest': gather([F.BERRY, F.CROP_READY], 'hand'); break;
    default: { // auto: fight what is there, else work the tile ahead
      if (!fight()) { const i = featInReach(world, p, [F.TREE, F.ROCK, F.ORE, F.BERRY, F.CROP_READY, F.GOLD]); if (i >= 0) { harvestTile(world, p, i, ctx, 1); p.attackAnim = 1; p.state = 'work'; } }
    }
  }
  if (c.act === 'once') c.act = null;
}

// ---------- job selection ----------
const W8 = (v) => Math.max(0, v);
/** Professions: each adult specialises in the trade of their best skill (passion counts extra). */
export const WORKS = {
  builder: { name: 'Builder', skill: 'construction', icon: 'hammer', desc: 'Hauls materials to sites, builds, fells trees.' },
  farmer: { name: 'Farmer', skill: 'plants', icon: 'wheat', desc: 'Sows and harvests fields, forages wild plants.' },
  hunter: { name: 'Hunter', skill: 'animals', icon: 'sword', desc: 'Hunts game and fishes.' },
  miner: { name: 'Miner', skill: 'mining', icon: 'mountain', desc: 'Quarries stone and digs ore.' },
  cook: { name: 'Cook', skill: 'cooking', icon: 'meals', desc: 'Turns raw food into meals and rations.' },
  crafter: { name: 'Crafter', skill: 'crafting', icon: 'cloth', desc: 'Tailors clothes, makes gear and goods.' },
  scholar: { name: 'Scholar', skill: 'intellectual', icon: 'book', desc: 'Researches at the study.' },
  doctor: { name: 'Doctor', skill: 'medical', icon: 'medicine', desc: 'Tends the sick and brews medicine.' },
  priest: { name: 'Priest', skill: 'social', icon: 'dove', desc: 'Leads worship for Glitter.' },
};
const ALT = { melee: 'hunter', shooting: 'hunter', artistic: 'crafter' };
export function bestWork(p) {
  let best = 'builder', bv = -1;
  for (const [id, w] of Object.entries(WORKS)) { const sk = p.skills[w.skill]; const v = sk.lvl + sk.passion * 3; if (v > bv) { bv = v; best = id; } }
  for (const [sk, id] of Object.entries(ALT)) { const v = p.skills[sk].lvl + p.skills[sk].passion * 3 - 1; if (v > bv) { bv = v; best = id; } }
  return best;
}
const workScore = (p, id) => { const sk = p.skills[WORKS[id].skill]; return sk.lvl + sk.passion * 3; };
/** Give every adult a profession; make sure the trades the settlement needs have at least one person. */
export function assignWorks(world, s, n, pawns) {
  const adults = pawns.filter((p) => !isChild(p) && p.role !== 'soldier');
  const count = {};
  for (const p of adults) { if (!p.work || !WORKS[p.work]) p.work = bestWork(p); count[p.work] = (count[p.work] || 0) + 1; }
  if (adults.length < 3) return;
  const has = (t) => settlementBuildings(world, s, t).length > 0;
  const need = ['builder', 'hunter'];
  if (has('farm')) need.push('farmer');
  if (settlementBuildings(world, s).some((b) => BUILDINGS[b.type].fn.cook)) need.push('cook');
  if (has('research')) need.push('scholar');
  if (adults.length >= 6 && has('healer')) need.push('doctor');
  if (has('mine') || n.era >= 1) need.push('miner');
  if (n.techs?.tailoring && adults.length >= 5) need.push('crafter');
  for (const w of need) {
    if (count[w]) continue;
    const donor = Object.entries(count).filter(([k, c]) => c > 1).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!donor) break;
    const pick = adults.filter((p) => p.work === donor).sort((a, b) => workScore(b, w) - workScore(a, w))[0];
    if (pick) { pick.work = w; count[donor]--; count[w] = 1; }
  }
}
export function chooseJob(world, p, ctx) {
  const { rng, s, n } = ctx;
  const now = world.time;
  if (!s) return { type: 'wander', until: now + 0.2 };
  if (p.carry && !p.carry.site) return { type: 'deliver' }; // empty your basket at the store before anything else
  { const up = upgradeFor(p, s); if (up) return { type: 'equip', item: up }; } // grab a better tool for your trade off the shelf
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

  // ---- work: each adult has a profession (their best skill) and sticks to it; others help only when it's urgent ----
  const opts = [];
  const pop = s.pop || 1;
  const focus = n.laws.focus;
  const job = p.work || bestWork(p);
  const pref = (skill) => (0.5 + p.skills[skill].lvl * 0.06 + p.skills[skill].passion * 0.35);
  const as = (work, w) => w * (work === job ? 7 : 0.45);          // a specialist strongly prefers their own trade
  const add = (o, work, w) => { if (w > 0) opts.push([o, as(work, w)]); };
  // haul anything lying around, and dress yourself once tailoring is known
  const drop = nearestDrop(world, p.x, p.y, s.radius + 10);
  if (drop) opts.push([{ type: 'haul', did: drop.id }, 2.2 + (job === 'hauler' ? 4 : 0)]);
  if (n.techs?.tailoring && (p.gearEra < n.era || !p.dressed) && (st.cloth || 0) >= (n.era >= 2 ? 2 : 1)) {
    const tb = settlementBuildings(world, s, 'tailor')[0] || settlementBuildings(world, s, 'workshop')[0];
    opts.push([{ type: 'tailor', bid: tb?.id ?? null }, job === 'crafter' ? 9 : 5]);
  }
  // the crafting bench: make tools and weapons for whoever lacks them (crafters first; anyone when nobody else can)
  {
    const bench = settlementBuildings(world, s, 'bench')[0] || settlementBuildings(world, s, 'workshop')[0];
    if (bench && p.age >= 14) {
      if (!s._craft || now - s._craft.t > 0.4) s._craft = { t: now, c: craftChoice(world, s, n, Object.values(world.pawns).filter((q) => q.settlementId === s.id && !q.dead)) };
      if (s._craft.c) opts.push([{ type: 'toolcraft', bid: bench.id }, job === 'crafter' ? 10 : 2.4]);
    }
  }
  // construction: deliver materials, then build
  const sites = s.buildings.map((id) => world.buildings[id]).filter((b) => b && !b.built && !BUILDINGS[b.type].field);
  for (const site of sites.slice(0, 3)) {
    const left = remainingCost(site), r = Object.keys(left).find((k) => (st[k] || 0) >= 1);
    if (r) add({ type: 'supply', bid: site.id, res: r }, 'builder', 3.2 * (focus === 'build' ? 2 : 1) * (site.byPlayer ? 1.6 : 1));
    else if (!Object.keys(left).length) add({ type: 'build', bid: site.id }, 'builder', 3.5 * pref('construction') * (focus === 'build' ? 2 : 1) * (site.byPlayer ? 1.6 : 1));
  }
  const fields = settlementBuildings(world, s, 'farm', false);
  if (fields.length) {
    const unbuilt = fields.find((f) => !f.built);
    if (unbuilt) add({ type: 'build', bid: unbuilt.id }, 'farmer', 2 * pref('plants'));
    const fi = findFarmWork(world, fields, rng);
    if (fi) add({ type: 'farm', i: fi.i, sow: fi.sow }, 'farmer', (fi.sow ? 2.5 : 4.5) * pref('plants') * (focus === 'food' ? 2 : 1));
  }
  const foodDays = (st.food + st.meals + st.rations) / pop;
  const hungry = foodDays < 3; // everyone pitches in for food when stores run dry
  const urgent = (w) => (hungry ? w * 4 : w);
  add({ type: 'hunt' }, 'hunter', urgent(W8(10 - foodDays) * 0.5 + 0.8) * pref('animals'));
  if (foodDays < 14) add({ type: 'fish' }, 'hunter', urgent(W8(14 - foodDays) * 0.4 + 0.4) * pref('animals'));
  add({ type: 'gatherFeat', feats: [F.BERRY], res: 'food' }, 'farmer', urgent(W8(10 - foodDays) * 0.6 + (n.era === 0 ? 1 : 0.2)) * pref('plants'));
  const cookers = settlementBuildings(world, s).filter((b) => BUILDINGS[b.type].fn.cook);
  if (cookers.length && st.food > 2 && st.meals < pop * 3) add({ type: 'cook', bid: rng.pick(cookers).id }, 'cook', 2.6 * pref('cooking'));
  const kitchens = settlementBuildings(world, s, 'kitchen');
  if (kitchens.length && st.food > pop * 3 && st.rations < pop * 6) add({ type: 'cook', bid: kitchens[0].id, rations: true }, 'cook', 1.6 * pref('cooking'));
  const wantWood = 40 + pop * 2 - st.wood + (s.need?.wood || 0) * 2, wantStone = (n.era >= 1 ? 30 : 12) + pop - st.stone + (s.need?.stone || 0) * 2;
  if (wantWood > 0) add({ type: 'gatherFeat', feats: [F.TREE], res: 'wood' }, 'builder', Math.min(3, wantWood / 20) * pref('construction') + 0.3);
  const mines = settlementBuildings(world, s, 'mine');
  if (mines.length && (wantStone > 0 || st.metal < 30 + pop * 2)) add({ type: 'mine', bid: rng.pick(mines).id }, 'miner', 3 * pref('mining'));
  if (wantStone > 0) add({ type: 'gatherFeat', feats: [F.ROCK], res: 'stone' }, 'miner', Math.min(2.5, wantStone / 20) * pref('mining') + 0.2);
  if ((n.era >= 1 && st.metal < 20 + pop) || s.need?.metal) add({ type: 'gatherFeat', feats: [F.ORE, F.GOLD], res: 'metal' }, 'miner', 1.4 * pref('mining'));
  const labs = settlementBuildings(world, s, 'research');
  if (labs.length) add({ type: 'research', bid: rng.pick(labs).id, until: now + 0.6 }, 'scholar', (1.8 + (p.fx.research || 0) * 2) * pref('intellectual') * (focus === 'science' ? 2.2 : 1) * (1 + n.ideology.faith / 200));
  const temples = settlementBuildings(world, s, 'temple');
  if (temples.length) add({ type: 'worship', bid: rng.pick(temples).id, until: now + 0.4 }, 'priest', (1 + (p.fx.glitter || 0)) * (1 - n.ideology.faith / 150) * (focus === 'faith' ? 2.2 : 1));
  const shops = settlementBuildings(world, s).filter((b) => BUILDINGS[b.type].fn.craft);
  if (shops.length && (st.medicine < pop * 0.5 || st.cloth > 10 || p.gearEra < n.era)) add({ type: 'craft', bid: rng.pick(shops).id, until: now + 0.5 }, 'crafter', 1.8 * pref('crafting'));
  const healers = settlementBuildings(world, s, 'healer');
  if (healers.length && st.medicine < pop * 0.4 && st.food > 6) add({ type: 'brew', bid: healers[0].id, until: now + 0.4 }, 'doctor', 1.2 * pref('medical'));
  if (p.role === 'soldier') opts.push([{ type: 'patrol', until: now + 0.4 }, 1.2 * (focus === 'military' ? 2 : 1)]);
  opts.push([{ type: 'wander', until: now + 0.15 }, 0.12]);

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

/** The item a tile feature yields. */
export function tileItem(world, i, era = 0) {
  const t = world.tiles, f = t.feat[i];
  if (f === F.TREE) return 'wood';
  if (f === F.ROCK) return 'stone';
  if (f === F.GOLD) return 'gold';
  if (f === F.ORE) return era >= 3 ? 'iron' : 'copper';
  if (f === F.BERRY) return wildFruit(t.biome[i]);
  if (f === F.CROP_READY) return CROPS[cropKindAt(world, i)];
  return null;
}
function harvestTile(world, p, i, ctx, mult = 1) {
  const t = world.tiles, f = t.feat[i], s = ctx.s;
  const n = ctx.n;
  const item = tileItem(world, i, n?.era || 0); if (!item) return;
  const res = itemCat(item);
  const skill = res === 'wood' ? 'construction' : f === F.BERRY || f === F.CROP_READY ? 'plants' : 'mining';
  let amt = f === F.TREE ? 4 : f === F.ROCK ? 3 : f === F.GOLD ? 3 : f === F.ORE ? 2 : f === F.CROP_READY ? 6 : 5;
  amt = Math.round(amt * skillFactor(p, skill) * mult * (n && n.ideology.nature < -40 && res !== 'food' ? 1.25 : 1) * (1 + (n?.techFx?.[res] || 0)));
  if (f === F.ORE && n && n.era < 1 && !n.techFx?.metal) { amt = 1; } // stone tools barely chip ore until copper working
  amt = Math.max(1, amt);
  gainXp(p, skill, 60);
  if (f === F.CROP_READY) { t.feat[i] = F.FARM; t.crop[i] = 0; }
  else if (t.featHp[i] > 1) t.featHp[i]--;
  else { t.feat[i] = f === F.TREE ? F.STUMP : F.NONE; t.featHp[i] = 0; if (n && n.ideology.nature < -20) t.pollution[i] = Math.min(255, t.pollution[i] + 4); }
  world.dirty.add(i);
  const x = (i % world.W) + 0.5, y = Math.floor(i / world.W) + 0.5;
  emitFx(world, { type: 'chip', x, y, res, item });
  if (p.possessedBy) { dropItem(world, item, amt, x, y + 0.3); return; } // possessed: it falls at your feet; haulers fetch it
  if (p.carry && p.carry.item && p.carry.item !== item) { const ex = (p.carry.extra ||= []), e = ex.find((z) => z[0] === item); if (e) e[1] += amt; else ex.push([item, amt]); }
  else p.carry = { res, item, amt: (p.carry?.item === item ? p.carry.amt : 0) + amt, extra: p.carry?.extra };
  if (res === 'stone' && ctx.rng.chance(0.06)) p.carry.flint = true;
}

const carried = (p) => (p.carry ? p.carry.amt + (p.carry.extra || []).reduce((a, e) => a + e[1], 0) : 0);
function deliver(world, p, dt, ctx) {
  const { s } = ctx;
  const store = settlementBuildings(world, s, 'storage')[0] || world.buildings[s.buildings[0]] || null;
  const [x, y] = store ? bCenter(store) : [s.x, s.y];
  if (!arriveAt(world, p, x, y, dt, 1.8)) return false;
  const c = p.carry;
  if (c.item) addItem(s, c.item, c.amt); else s.stock[c.res] = (s.stock[c.res] || 0) + c.amt;
  for (const [id, k] of c.extra || []) addItem(s, id, k);
  if (c.hide) addItem(s, 'hide', c.hide);
  p.carry = null;
  return true;
}

export function doJob(world, p, dt, ctx) {
  const j = p.job, { s, n, rng } = ctx, now = world.time, t = world.tiles, W = world.W;
  if (p.carry && j.type !== 'gather' && j.type !== 'gatherFeat' && j.type !== 'hunt' && j.type !== 'fish' && j.type !== 'supply' && j.type !== 'haul') { if (deliver(world, p, dt, ctx)) p.job = null; return; }
  const done = () => { p.job = null; p.state = 'idle'; };
  switch (j.type) {
    case 'deliver': return done();
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
      const quality = tend(q, p, (useMed ? MED_QUALITY[n.era] : 0) + (n.techFx?.heal || 0), q.bedIn >= 0);
      gainXp(p, 'medical', 300);
      addThought(q, 'tended', now);
      changeOpinion(q, p, 6);
      emitFx(world, { type: 'emote', pid: q.id, icon: 'heart' });
      if (quality > 0.9) logEvent(world, 'good', `${fullName(p)} performed masterful surgery on ${fullName(q)}.`, { pid: p.id, nationId: p.nationId });
      return done();
    }
    case 'gather': case 'gatherFeat': {
      if (p.carry && carried(p) >= 8) { if (deliver(world, p, dt, ctx)) { if (j.vein > 0) { j.i = undefined; return; } return done(); } return; }
      if (j.i === undefined || !(j.feats || [F.BERRY, F.TREE, F.ROCK, F.ORE]).includes(t.feat[j.i])) {
        if (j.found && j.vein > 0) { // ordered to work a whole vein / grove: move on to the next one nearby
          let bi = -1, bd = 9;
          for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) { const yy = Math.floor(j.oy) + oy; if (yy < 0 || yy >= world.H) continue; const k = yy * W + (((Math.floor(j.ox) + ox) % W) + W) % W; if (!j.feats.includes(t.feat[k]) || (t.owner[k] !== -1 && t.owner[k] !== n.id)) continue; const d = ox * ox + oy * oy; if (d < bd) { bd = d; bi = k; } }
          if (bi >= 0) { j.vein--; j.i = bi; }
        }
        if (j.vein !== undefined && j.i !== undefined && j.feats.includes(t.feat[j.i])) { /* keep going */ }
        else if (j.found) { if (p.carry) { j.i = undefined; if (deliver(world, p, dt, ctx)) done(); return; } return done(); }
        else {
          j.i = findFeature(world, p, j.feats || [F.BERRY], 18, rng); j.found = true;
          if (j.i < 0) { j.i = findFeature(world, p, j.feats || [F.BERRY], 34, rng); if (j.i < 0) return done(); }
        }
      }
      const x = (j.i % W) + 0.5, y = Math.floor(j.i / W) + 0.5;
      if (!arriveAt(world, p, x, y, dt, 1.3)) return;
      p.state = 'work'; p.facing = dx(p.x, x, W) >= 0 ? 1 : -1;
      const tk = featTool(t.feat[j.i]);
      j.t = (j.t || 0) + dt * workSpeed(p) * (n.era >= 1 ? 1.2 : 1) * toolSpeed(p, tk);
      if (j.t < 0.025) return;
      j.t = 0;
      harvestTile(world, p, j.i, ctx); wearTool(world, p, tk);
      if (j.forage && p.carry) { p.needs.food = Math.min(1, p.needs.food + 0.35); p.carry.amt = Math.max(0, p.carry.amt - 1); return done(); }
      return;
    }
    case 'farm': {
      const x = (j.i % W) + 0.5, y = Math.floor(j.i / W) + 0.5;
      if (!arriveAt(world, p, x, y, dt, 1.0)) return;
      p.state = 'work';
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'plants') * toolSpeed(p, j.sow ? 'shovel' : 'sickle');
      if (j.t < (j.sow ? 0.015 : 0.02)) return;
      wearTool(world, p, j.sow ? 'shovel' : 'sickle', 0.5);
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
        const dr = ANIMAL_DROPS[a.kind] || ['beef', ANIMALS[a.kind].meat, 'hide', ANIMALS[a.kind].hide];
        p.carry = { res: 'food', item: dr[0], amt: Math.round(dr[1] * (1 + (n.techFx?.food || 0))), extra: dr[3] ? [[dr[2], Math.round(dr[3] * (1 + (n.techFx?.cloth || 0)))]] : [] };
        emitFx(world, { type: 'chip', x: a.x, y: a.y, res: 'food', item: dr[0] });
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
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'animals') * (n.era >= 2 ? 1.4 : 1) * toolSpeed(p, 'rod');
      if (j.t > 0.05) { j.t = 0; gainXp(p, 'animals', 60); wearTool(world, p, 'rod'); if (rng.chance(0.75)) { const fi = p.carry?.item || (rng.chance(0.3) ? 'fish2' : 'fish'); p.carry = { res: 'food', item: fi, amt: (p.carry?.amt || 0) + 3 + (n.era >= 2 ? 1 : 0) }; emitFx(world, { type: 'chip', x, y, res: 'food', item: fi }); } if ((j.n = (j.n || 0) + 1) >= 3) j.done = true; }
      if (j.done && p.carry) return;
      if (j.done) return done();
      return;
    }
    case 'cook': {
      const b = world.buildings[j.bid]; if (!b) return done();
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x, y, dt, 1.6)) return;
      p.state = 'work';
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'cooking') * (BUILDINGS[b.type].fn.cook || 1) * (1 + (n.techFx?.cook || 0));
      if (j.t < 0.03) return;
      j.t = 0;
      if ((s.stock.food || 0) < 1) return done();
      const used = takeCat(s, 'food', 4), batch = used.reduce((a2, [, k]) => a2 + k, 0), main = used[0]?.[0];
      const dish = j.rations ? 'ration' : main === 'wheat' || main === 'corn' ? 'bread' : main === 'poultry' || main === 'egg' ? 'roast' : main === 'berries' || main === 'apple' || main === 'grapes' ? 'pastry' : 'meal';
      if (j.rations) addItem(s, 'ration', batch); else if (!rng.chance(0.03 * (10 - p.skills.cooking.lvl) / 10)) addItem(s, dish, batch); // poor cooks waste some
      emitFx(world, { type: 'chip', x, y, res: j.rations ? 'rations' : 'meals', item: dish });
      gainXp(p, 'cooking', 120);
      if ((j.n = (j.n || 0) + 1) >= 3) return done();
      return;
    }
    case 'build': {
      const b = world.buildings[j.bid]; if (!b || b.built) return done();
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x, y, dt, Math.max(b.w, b.h) / 2 + 0.8)) return;
      const def = BUILDINGS[b.type];
      if (!b.paid) { // materials must be carried to the site first
        const left = remainingCost(b);
        const r = Object.keys(left).find((k) => (s.stock[k] || 0) >= 1);
        if (r) { p.job = { type: 'supply', bid: b.id, res: r }; return; }
        if (Object.keys(left).length) { j.waitFor = Object.keys(left)[0]; return done(); }
        b.paid = true;
      }
      p.state = 'work';
      const bp = (dt * workSpeed(p) * skillFactor(p, 'construction') * (1 + (n.techFx?.build || 0)) * toolSpeed(p, 'shovel') * 100) / Math.max(10, def.work * (1 + b.era * 0.15));
      b.progress += bp; wearTool(world, p, 'shovel', bp * 12);
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
    case 'dismantle': return doDismantle(world, p, dt, ctx, arriveAt, bCenter, removeBuilding, dropItem, workSpeed, skillFactor);
    case 'supply': { // fetch materials from the store and carry them to a construction site
      const b = world.buildings[j.bid]; if (!b || b.built) { if (p.carry) { if (deliver(world, p, dt, ctx)) done(); return; } return done(); }
      if (!p.carry) {
        const store = storeOf(world, s), [sx, sy] = store ? bCenter(store) : [s.x, s.y];
        if (!arriveAt(world, p, sx, sy, dt, 1.8)) return;
        const need = remainingCost(b)[j.res] || 0; if (need <= 0) return done();
        const got = takeCat(s, j.res, Math.min(need, 8 + Math.floor(p.skills.construction.lvl / 2)));
        const amt = got.reduce((a2, [, k]) => a2 + k, 0); if (amt <= 0) return done();
        p.carry = { res: j.res, item: got[0][0], amt, extra: got.slice(1), site: b.id };
        return;
      }
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x, y, dt, Math.max(b.w, b.h) / 2 + 0.8)) return;
      b.have ||= {}; b.have[p.carry.res] = (b.have[p.carry.res] || 0) + carried(p);
      emitFx(world, { type: 'chip', x, y, res: p.carry.res, item: p.carry.item });
      p.carry = null;
      if (!Object.keys(remainingCost(b)).length) { b.paid = true; p.job = { type: 'build', bid: b.id }; return; }
      return done();
    }
    case 'haul': { // bring something lying on the ground into the store
      const d = world.drops?.[j.did];
      if (!p.carry) {
        if (!d) return done();
        d.claim = p.id;
        if (!arriveAt(world, p, d.x, d.y, dt, 0.9)) return;
        const k = Math.min(d.n, 14); d.n -= k; if (d.n <= 0.01) delete world.drops[d.id]; else d.claim = 0;
        p.carry = { res: itemCat(d.item), item: d.item, amt: k };
        return;
      }
      if (deliver(world, p, dt, ctx)) done();
      return;
    }
    case 'mine': { // dig stone and ore out of a mine: endless, but slow without skill
      const b = world.buildings[j.bid]; if (!b || !b.built) return done();
      if (p.carry && carried(p) >= 10) { if (deliver(world, p, dt, ctx)) done(); return; }
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x, y + 0.6, dt, 1.6)) return;
      p.state = 'work'; p.tool = 'pick';
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'mining') * (1 + (n.techFx?.mine || 0)) * toolSpeed(p, 'pickaxe');
      if (j.t < 0.05) return;
      j.t = 0; gainXp(p, 'mining', 90); wearTool(world, p, 'pickaxe');
      const r = rng.next(), item = r < 0.05 + n.era * 0.005 ? 'gold' : r < 0.45 ? (n.era >= 3 ? 'iron' : 'copper') : 'stone';
      const amt = item === 'gold' ? 1 : 2 + Math.floor(p.skills.mining.lvl / 5);
      if (p.carry?.item === item) p.carry.amt += amt; else if (p.carry) { const ex = (p.carry.extra ||= []), e = ex.find((z) => z[0] === item); if (e) e[1] += amt; else ex.push([item, amt]); } else p.carry = { res: itemCat(item), item, amt };
      emitFx(world, { type: 'chip', x, y, res: itemCat(item), item });
      return;
    }
    case 'equip': { // fetch a tool from the store
      const store = settlementBuildings(world, s, 'storage')[0] || world.buildings[s.buildings[0]];
      const [x, y] = store ? bCenter(store) : [s.x, s.y];
      if (!arriveAt(world, p, x, y, dt, 1.8)) return;
      if (equipTool(p, s, j.item)) emitFx(world, { type: 'emote', pid: p.id, icon: 'hammer' });
      return done();
    }
    case 'toolcraft': { // make a tool at the crafting bench
      const b = world.buildings[j.bid]; if (!b || !b.built) return done();
      const [x, y] = bCenter(b);
      if (!arriveAt(world, p, x + rng.range(-0.5, 0.5), y + 0.8, dt, 1.8)) return;
      p.state = 'work'; p.toolOut = null;
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'crafting') * (BUILDINGS[b.type].fn.craft || 1);
      if (j.t < 0.07) return;
      const c = s._craft?.c || craftChoice(world, s, n, Object.values(world.pawns).filter((q) => q.settlementId === s.id && !q.dead));
      s._craft = null;
      if (c) { const made = craftTool(world, s, c.kind, c.mat); if (made) { gainXp(p, 'crafting', 220); emitFx(world, { type: 'chip', x, y, res: 'tools', item: `${c.kind}_${c.mat}` }); } }
      return done();
    }
    case 'tailor': { // sew a new outfit for yourself (or a child) from cloth, hides or wool
      const b = j.bid != null ? world.buildings[j.bid] : null, [x, y] = b ? bCenter(b) : [s.x, s.y];
      if (!arriveAt(world, p, x + rng.range(-0.5, 0.5), y + 0.8, dt, 1.8)) return;
      p.state = 'work';
      j.t = (j.t || 0) + dt * workSpeed(p) * skillFactor(p, 'crafting');
      if (j.t < 0.06) return;
      const who = world.pawns[j.pid] || p, cost = n.era >= 2 ? 2 : 1;
      if ((s.stock.cloth || 0) < cost) return done();
      takeCat(s, 'cloth', cost); who.gearEra = n.era; who.dressed = true; gainXp(p, 'crafting', 150);
      addThought(who, 'newClothes', now); emitFx(world, { type: 'emote', pid: who.id, icon: 'shirt' });
      return done();
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

/** What a construction site still needs delivered, by category. */
export function remainingCost(b) {
  const need = b.need || {}, have = b.have || {}, out = {};
  for (const [r, v] of Object.entries(need)) { const d = v - (have[r] || 0); if (d > 0.01) out[r] = Math.ceil(d); }
  return out;
}
export const storeOf = (world, s) => settlementBuildings(world, s, 'storage')[0] || world.buildings[s.buildings[0]] || null;
export const scaledCost = (def, era) => buildCost(def, era);

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
