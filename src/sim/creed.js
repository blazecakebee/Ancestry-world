// Creed simulation: memes, precepts, certainty, rituals, conversion and schisms. See data/creed.js.
import { MEMES, MEME, IMPACT, PRECEPTS, PRECEPT, RITUALS, memeSlots, incompatible, CREED_COSTS } from '../data/creed.js';
import { AXES } from '../data/society.js';
import { addThought, fullName } from './pawn.js';
import { logEvent, settlementBuildings } from './world.js';
import { dist, clamp } from '../core/util.js';

const FX_KEYS = ['research', 'work', 'mood', 'glitter', 'melee', 'stability', 'fertility', 'conscript'];

export function hasCreed(n) { return !!(n && n.creed && Array.isArray(n.creed.memes)); }

/** Sum of all meme and precept modifiers (cached on the nation, never saved). */
export function creedFx(n) {
  const fx = {}; for (const k of FX_KEYS) fx[k] = 0;
  if (!hasCreed(n)) return fx;
  const sig = n.creed.memes.join(',') + '|' + PRECEPTS.map((p) => n.creed.precepts[p.id] ?? 1).join('');
  if (n._cfx && n._cfxSig === sig) return n._cfx;
  for (const id of n.creed.memes) { const m = MEME[id]; if (!m) continue; const w = IMPACT[m.impact]; for (const [k, v] of Object.entries(m.fx)) fx[k] = (fx[k] || 0) + v * w; }
  for (const p of PRECEPTS) { const o = p.options[n.creed.precepts[p.id] ?? 1]; if (o) for (const [k, v] of Object.entries(o.fx)) fx[k] = (fx[k] || 0) + v; }
  n._cfx = fx; n._cfxSig = sig;
  return fx;
}

/** How much the nation's memes like the option currently chosen for an issue (about -3..3). */
export function approval(n, issue, opt = n.creed.precepts[issue] ?? 1) {
  let a = 0;
  for (const id of n.creed.memes) { const m = MEME[id]; if (!m) continue; const w = IMPACT[m.impact]; if (m.pref[issue] === opt) a += w; if (m.avoid[issue] === opt) a -= w; }
  return a;
}
export function creedMood(n) {
  if (!hasCreed(n)) return 0;
  let s = 0; for (const p of PRECEPTS) s += clamp(approval(n, p.id), -2, 2);
  return clamp(s * 0.9, -6, 6);
}

/** The legacy five axes are the sum of what each meme pushes toward. */
export function creedTargets(n) {
  const t = { faith: 0, war: 0, society: 0, nature: 0, reach: 0 };
  for (const id of n.creed.memes) { const m = MEME[id]; if (!m) continue; for (const [k, v] of Object.entries(m.axes)) t[k] = clamp(t[k] + v * IMPACT[m.impact], -100, 100); }
  for (const k in t) t[k] = Math.round(t[k]);
  return t;
}
function retarget(n) { n.ideologyTarget = creedTargets(n); }

function bestPrecepts(n, rng) {
  const out = {};
  for (const p of PRECEPTS) {
    let best = [], bv = -99;
    for (let o = 0; o < p.options.length; o++) { const a = approval(n, p.id, o) + (o === 1 ? 0.05 : 0); if (a > bv + 1e-6) { bv = a; best = [o]; } else if (Math.abs(a - bv) < 1e-6) best.push(o); }
    out[p.id] = best[rng.int(0, best.length - 1)];
  }
  return out;
}
function canAdd(n, id) { return !n.creed.memes.includes(id) && !n.creed.memes.some((m) => incompatible(m, id)); }
function scheduleRituals(world, n, rng) {
  n.creed.ritual = n.creed.ritual || {};
  for (const id of n.creed.memes) { const r = RITUALS[MEME[id]?.ritual]; if (r && n.creed.ritual[MEME[id].ritual] === undefined) n.creed.ritual[MEME[id].ritual] = world.time + rng.range(1, r.every); }
}

/** Build a creed from the nation's starting leanings (also migrates saves that only had the five sliders). */
export function initCreed(world, n, rng) {
  const a = n.ideology || { faith: 0, war: 0, society: 0, nature: 0, reach: 0 };
  const score = (m) => {
    let s = 0, pushes = 0;
    for (const [k, v] of Object.entries(m.axes)) { s += (a[k] || 0) * Math.sign(v); pushes++; }
    return pushes ? s + rng.gauss(0, 14) : rng.range(0, 28);
  };
  const ranked = MEMES.map((m) => [m, score(m)]).sort((x, y) => y[1] - x[1]);
  const slots = memeSlots(n.era || 0);
  n.creed = { memes: [], precepts: {}, certainty: Math.round(rng.range(55, 75)), ritual: {}, last: null, guideId: -1, reformAt: 0, preceptAt: 0, doubt: false };
  for (const [m] of ranked) { if (n.creed.memes.length >= slots) break; if (canAdd(n, m.id)) n.creed.memes.push(m.id); }
  n.creed.precepts = bestPrecepts(n, rng);
  scheduleRituals(world, n, rng);
  retarget(n);
  for (const k of Object.keys(n.ideologyTarget)) n.ideology[k] = n.ideologyTarget[k];
  return n.creed;
}
export function ensureCreed(world, n, rng) { if (!hasCreed(n) && !n.raider) initCreed(world, n, rng); return n.creed; }

function guideOf(world, n, pawns) {
  let best = null, bs = -1;
  for (const p of pawns) if (p.role === 'prophet') { const s = (p.skills.social?.lvl || 0) + (p.skills.intellectual?.lvl || 0) * 0.5 + p.age * 0.01; if (s > bs) { bs = s; best = p; } }
  return best;
}

function neighbours(world, n) {
  const cap = world.settlements[n.capitalId]; const out = [];
  if (!cap) return out;
  for (const o of Object.values(world.nations)) {
    if (o.id === n.id || o.dead || o.raider || !hasCreed(o)) continue;
    const oc = world.settlements[o.capitalId]; if (!oc) continue;
    if (dist(cap.x, cap.y, oc.x, oc.y, world.W) < 90) out.push(o);
  }
  return out;
}

function memeNames(ids) { return ids.map((i) => MEME[i].name).join(', ') || 'none'; }

function adopt(world, n, id, rng, why) {
  const c = n.creed;
  // swap out anything incompatible
  for (const m of [...c.memes]) if (incompatible(m, id)) c.memes.splice(c.memes.indexOf(m), 1);
  const slots = memeSlots(n.era);
  while (c.memes.length >= slots) c.memes.splice(rng.int(0, c.memes.length - 1), 1);
  c.memes.push(id);
  retarget(n); scheduleRituals(world, n, rng);
  if (n.ai) c.precepts = bestPrecepts(n, rng);
}

function schism(world, n, pawns, rng) {
  const c = n.creed;
  const before = [...c.memes];
  if (c.memes.length > 1) c.memes.splice(rng.int(0, c.memes.length - 1), 1);
  const pool = MEMES.filter((m) => canAdd(n, m.id));
  if (pool.length && c.memes.length < memeSlots(n.era)) { const m = rng.pick(pool); adopt(world, n, m.id, rng, 'schism'); }
  c.certainty = 45; c.doubt = false; c.reformAt = world.time + CREED_COSTS.memeCooldown * 0.5;
  retarget(n);
  if (n.ai) c.precepts = bestPrecepts(n, rng);
  for (const p of pawns) addThought(p, 'schism', world.time);
  logEvent(world, 'faith', `A schism splits ${n.name}: doubt overcame the creed (${memeNames(before)}) and the people now follow ${memeNames(c.memes)}.`, { nationId: n.id, big: !!n.ownerId });
}

function performRitual(world, n, pawns, rid, rng) {
  const R = RITUALS[rid], c = n.creed;
  const guide = guideOf(world, n, pawns);
  let temples = 0;
  for (const s of Object.values(world.settlements)) if (s.nationId === n.id) temples += settlementBuildings(world, s, 'temple').length;
  const q = c.certainty / 100 * 0.45 + (guide ? 0.25 : 0) + (R.temple ? Math.min(0.2, temples * 0.1) : 0.1) + (world.pawns[n.leaderId] ? 0.05 : 0) + rng.next() * 0.3;
  const grade = q >= 0.75 ? 'ritualGreat' : q >= 0.42 ? 'ritualGood' : 'ritualPoor';
  for (const p of pawns) if (p.age >= 6) addThought(p, grade, world.time);
  c.certainty = clamp(c.certainty + (grade === 'ritualGreat' ? 4 : grade === 'ritualGood' ? 2 : -2), 0, 100);
  if (grade === 'ritualGreat' && n.ownerId) n.glitter += 2;
  c.last = { id: rid, grade, t: world.time };
  if (n.ownerId) logEvent(world, 'faith', `${n.name} held the ${R.name}${grade === 'ritualGreat' ? ' — a moving, joyous gathering.' : grade === 'ritualGood' ? '.' : ' — it fell flat.'}`, { nationId: n.id });
}

/** Called each nation step. dt in days. */
export function stepCreed(world, n, pawns, dt, rng) {
  if (n.raider) return;
  const c = ensureCreed(world, n, rng); if (!c) return;
  // slots grow with the eras: the nation may take on another ideal
  if (n.ai && c.memes.length < memeSlots(n.era) && rng.chance(dt * 0.2)) { const pool = MEMES.filter((m) => canAdd(n, m.id)); if (pool.length) adopt(world, n, rng.pick(pool).id, rng, 'grew'); }
  // fluid: AI creeds slowly evolve
  if (n.ai && rng.chance(dt * 0.012)) { const pool = MEMES.filter((m) => canAdd(n, m.id) && !c.memes.includes(m.id)); if (pool.length) adopt(world, n, rng.pick(pool).id, rng, 'evolved'); }
  if (!c.memes.length) { const pool = MEMES.filter((m) => canAdd(n, m.id)); if (pool.length) adopt(world, n, rng.pick(pool).id, rng); }
  // roles
  const guide = guideOf(world, n, pawns); c.guideId = guide ? guide.id : -1;
  // certainty
  let temples = 0;
  for (const s of Object.values(world.settlements)) if (s.nationId === n.id) temples += settlementBuildings(world, s, 'temple').length;
  const prophets = pawns.filter((p) => p.role === 'prophet').length;
  const avgMood = pawns.length ? pawns.reduce((a, p) => a + p.mood, 0) / pawns.length : 50;
  let d = creedMood(n) * 0.25 + Math.min(1.2, prophets * 0.6) + Math.min(0.6, temples * 0.15) + (n.stability - 50) * 0.01 - (avgMood < 35 ? 0.3 : 0) - (c.certainty - 58) * 0.045;
  // other creeds press on ours when we are doubtful
  const nb = neighbours(world, n);
  let pressure = 0;
  for (const o of nb) { const shared = o.creed.memes.filter((m) => c.memes.includes(m)).length; if (!shared && o.creed.certainty > c.certainty) pressure += 0.2; }
  d -= Math.min(0.6, pressure);
  c.certainty = clamp(c.certainty + d * dt, 0, 100);
  c.doubt = c.doubt ? c.certainty < 35 : c.certainty < 22;
  // conversion: a doubting people may take up a neighbour's ideal
  if (c.certainty < 40 && nb.length && rng.chance(dt * 0.07)) {
    const o = nb.filter((x) => x.creed.certainty > c.certainty + 10).sort((a, b) => b.creed.certainty - a.creed.certainty)[0];
    if (o) {
      const pool = o.creed.memes.filter((m) => !c.memes.includes(m));
      if (pool.length) {
        const id = rng.pick(pool);
        adopt(world, n, id, rng, 'convert'); c.certainty = Math.min(100, c.certainty + 12);
        logEvent(world, 'faith', `Under the influence of ${o.name}, the people of ${n.name} take up the ideal of ${MEME[id].name}.`, { nationId: n.id, big: !!n.ownerId });
      }
    }
  }
  if (c.certainty <= 0.5) schism(world, n, pawns, rng);
  // rituals
  if (pawns.length >= 4) for (const id of [...new Set(c.memes.map((m) => MEME[m].ritual))]) {
    const at = c.ritual[id]; if (at === undefined) { c.ritual[id] = world.time + rng.range(2, RITUALS[id].every); continue; }
    if (world.time >= at) { performRitual(world, n, pawns, id, rng); c.ritual[id] = world.time + RITUALS[id].every * rng.range(0.85, 1.2); }
  }
}

/** Player command: { action: 'meme', op: 'add'|'remove', id } | { action: 'precept', issue, option } | { action: 'ritual', id } */
export function creedCommand(world, me, cmd, rng) {
  const fail = (msg) => ({ ok: false, msg }), ok = (msg) => ({ ok: true, msg });
  if (!me) return fail('You have no nation.');
  const c = ensureCreed(world, me, rng); if (!c) return fail('Your people have no creed yet.');
  const now = world.time;
  if (cmd.action === 'meme') {
    const m = MEME[cmd.id]; if (!m) return fail('Unknown ideal.');
    if (now < c.reformAt) return fail(`Your people are still settling. Wait ${Math.ceil(c.reformAt - now)} more days.`);
    if (cmd.op === 'remove') {
      if (!c.memes.includes(m.id)) return fail('Your people do not hold that ideal.');
      if (c.memes.length <= 1) return fail('A people needs at least one ideal.');
      c.memes.splice(c.memes.indexOf(m.id), 1);
    } else {
      if (c.memes.includes(m.id)) return fail('Already held.');
      if (c.memes.length >= memeSlots(me.era)) return fail('No room for another ideal yet. Remove one, or reach a later era.');
      const clash = c.memes.find((x) => incompatible(x, m.id)); if (clash) return fail(`${m.name} cannot live beside ${MEME[clash].name}.`);
      c.memes.push(m.id);
    }
    c.certainty = clamp(c.certainty - CREED_COSTS.memeChange, 0, 100);
    c.reformAt = now + CREED_COSTS.memeCooldown;
    retarget(me); scheduleRituals(world, me, rng);
    return ok(cmd.op === 'remove' ? `${m.name} fades from your people's creed.` : `${m.name} takes root. The people are unsettled for a while.`);
  }
  if (cmd.action === 'precept') {
    const P = PRECEPT[cmd.issue]; if (!P) return fail('Unknown precept.');
    const o = cmd.option | 0; if (o < 0 || o >= P.options.length) return fail('Unknown option.');
    if ((c.precepts[P.id] ?? 1) === o) return ok();
    if (now < c.preceptAt) return fail(`Your people are still adjusting. Wait ${Math.ceil(c.preceptAt - now)} more days.`);
    c.precepts[P.id] = o; c.certainty = clamp(c.certainty - CREED_COSTS.preceptChange, 0, 100); c.preceptAt = now + CREED_COSTS.preceptCooldown;
    return ok(`"${P.options[o].label}" becomes law.`);
  }
  if (cmd.action === 'ritual') {
    const rid = MEME[c.memes.find((m) => MEME[m].ritual === cmd.id)]?.ritual; if (!rid) return fail('Your creed has no such ritual.');
    const at = c.ritual[rid] ?? now; const R = RITUALS[rid];
    if (at - now > R.every * 0.55) return fail(`Too soon. The people are not yet ready for another ${R.name}.`);
    c.ritual[rid] = now - 0.001; // performed on the next step
    return ok(`The people begin preparing the ${R.name}.`);
  }
  return fail('Unknown creed action.');
}

/** An exile faction keeps most of the parent creed but breaks with one ideal. */
export function forkCreed(world, parent, child, rng) {
  if (!hasCreed(parent)) return;
  const c = JSON.parse(JSON.stringify(parent.creed));
  child.creed = c; child._cfx = null;
  c.certainty = 60; c.reformAt = 0; c.preceptAt = 0; c.last = null; c.guideId = -1; c.ritual = {};
  if (c.memes.length > 1) c.memes.splice(rng.int(0, c.memes.length - 1), 1);
  const pool = MEMES.filter((m) => canAdd(child, m.id));
  if (pool.length && c.memes.length < memeSlots(child.era || 0)) c.memes.push(rng.pick(pool).id);
  c.precepts = bestPrecepts(child, rng);
  scheduleRituals(world, child, rng);
  retarget(child);
  for (const k of Object.keys(child.ideologyTarget)) child.ideology[k] = child.ideologyTarget[k];
}
