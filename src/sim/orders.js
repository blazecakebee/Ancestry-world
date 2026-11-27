// Orders: the patron can point at something and tell their own people to deal with it. Orders only ever use the
// caster's own citizens, and may only target wild things, their own buildings, or nations they are at war with
// (or raiders) — never another player's people without a war.
import { F, BIOMES } from '../data/biomes.js';
import { BUILDINGS, buildCost } from '../data/buildings.js';
import { ANIMALS } from './combat.js';
import { isChild, fullName } from './pawn.js';
import { dist, wrap } from '../core/util.js';
import { emitFx } from './world.js';

export const ORDER_KINDS = ['fight', 'chop', 'mine', 'hunt', 'deconstruct', 'destroy'];
const SQUAD = { fight: 4, chop: 2, mine: 2, hunt: 2, deconstruct: 2, destroy: 3 };
const SKILL = { fight: 'melee', chop: 'construction', mine: 'mining', hunt: 'animals', deconstruct: 'construction', destroy: 'construction' };
const hostile = (world, me, nid) => nid === -1 || world.nations[nid]?.raider || me.relations[nid]?.state === 'war';

/** Pick citizens for an order: the closest able adults, preferring those skilled at the task. */
function crew(world, me, x, y, kind) {
  const ppl = Object.values(world.pawns).filter((p) => p.nationId === me.id && !p.dead && !p.downed && !isChild(p) && !p.possessedBy && !p.squad && p.job?.type !== 'patient');
  const sk = SKILL[kind];
  ppl.sort((a, b) => (dist(a.x, a.y, x, y, world.W) - a.skills[sk].lvl * 2) - (dist(b.x, b.y, x, y, world.W) - b.skills[sk].lvl * 2));
  return ppl.filter((p) => dist(p.x, p.y, x, y, world.W) < 90).slice(0, SQUAD[kind]);
}

export function giveOrder(world, me, cmd) {
  const kind = cmd.kind; if (!ORDER_KINDS.includes(kind)) return { err: 'Unknown order.' };
  const x = +cmd.x, y = +cmd.y, W = world.W, t = world.tiles;
  let job = null, label = '';
  if (kind === 'chop' || kind === 'mine') {
    const feats = kind === 'chop' ? [F.TREE] : [F.ROCK, F.ORE, F.GOLD];
    let i = -1, bd = 2.2;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const yy = Math.floor(y) + oy; if (yy < 0 || yy >= world.H) continue; const j = yy * W + wrap(Math.floor(x) + ox, W); if (!feats.includes(t.feat[j])) continue; const d = Math.hypot(ox, oy); if (d < bd) { bd = d; i = j; } }
    if (i < 0) return { err: kind === 'chop' ? 'No tree there to chop.' : 'No rock or ore there to mine.' };
    if (t.owner[i] !== -1 && t.owner[i] !== me.id) return { err: 'That belongs to another nation.' };
    job = { type: 'gatherFeat', feats, res: kind === 'chop' ? 'wood' : (t.feat[i] === F.ROCK ? 'stone' : 'metal'), i, found: true, order: true, vein: kind === 'mine' ? 8 : 3, ox: x, oy: y };
    label = kind === 'chop' ? 'Chop those trees' : 'Mine that out';
  } else if (kind === 'hunt') {
    let a = null, bd = 2.5;
    for (const an of Object.values(world.animals)) { const d = dist(an.x, an.y, x, y, W); if (d < bd && !an.dead) { bd = d; a = an; } }
    if (!a) return { err: 'No animal there.' };
    if (a.patron && a.patron !== me.id) return { err: 'That creature is under another deity\'s care.' };
    job = { type: 'hunt', aid: a.id, order: true }; label = `Hunt the ${ANIMALS[a.kind]?.name || a.kind}`;
  } else if (kind === 'fight') {
    let q = null, bd = 2.5;
    for (const p of Object.values(world.pawns)) { const d = dist(p.x, p.y, x, y, W); if (d < bd && !p.dead && p.nationId !== me.id) { bd = d; q = p; } }
    if (!q) { // fight a beast instead
      let a = null, ad = 2.5; for (const an of Object.values(world.animals)) { const d = dist(an.x, an.y, x, y, W); if (d < ad && !an.dead) { ad = d; a = an; } }
      if (!a) return { err: 'Nobody there to fight.' };
      job = { type: 'hunt', aid: a.id, order: true }; label = 'Attack!';
    } else {
      if (!hostile(world, me, q.nationId)) return { err: `You are not at war with ${world.nations[q.nationId]?.name || 'them'}.` };
      job = { type: 'fight', pid: q.id, order: true }; label = `Attack ${fullName(q)}`;
    }
  } else { // deconstruct / destroy a building
    const bid = t.bld[Math.floor(y) * W + wrap(Math.floor(x), W)], b = world.buildings[bid];
    if (!b) return { err: 'No building there.' };
    const s = world.settlements[b.sid], owner = s?.nationId;
    if (owner === me.id) { if (b.type === 'center') return { err: 'You cannot tear down your town centre.' }; }
    else if (kind === 'deconstruct' || !hostile(world, me, owner)) return { err: kind === 'deconstruct' ? 'You can only deconstruct your own buildings.' : 'You can only destroy your own buildings or those of nations at war with you.' };
    b.order = kind;
    job = { type: 'dismantle', bid: b.id, refund: kind === 'deconstruct', order: true };
    label = kind === 'deconstruct' ? 'Deconstruct it (materials come back)' : 'Destroy it';
  }
  const team = crew(world, me, x, y, kind);
  if (!team.length) return { err: 'None of your people can do that right now.' };
  for (const p of team) { p.job = { ...job }; p.path = null; p.brk = null; }
  emitFx(world, { type: 'order', x, y, kind });
  return { msg: `${label} — ${team.map((p) => p.name).join(', ')} on it.` };
}

/** Job: take a building apart. Own buildings may be refunded (half their materials fall as items); enemy ones are just wrecked. */
export function doDismantle(world, p, dt, ctx, arriveAt, bCenter, removeBuilding, dropItem, workSpeed, skillFactor) {
  const j = p.job, b = world.buildings[j.bid];
  if (!b) { p.job = null; return; }
  const [x, y] = bCenter(b);
  if (!arriveAt(world, p, x, y, dt, Math.max(b.w, b.h) / 2 + 0.9)) return;
  p.state = 'work'; p.attackAnim = 1;
  const def = BUILDINGS[b.type], maxHp = def.hp * (1 + (b.era || 0) * 0.25);
  b.hp = Math.min(b.hp ?? maxHp, maxHp) - dt * workSpeed(p) * skillFactor(p, 'construction') * 900;
  if (ctx.rng.chance(dt * 25)) emitFx(world, { type: 'chip', x, y, res: 'stone' });
  if (b.hp > 0) return;
  if (j.refund) { // half the materials come back as goods on the ground, hauled home by anyone free
    const cost = b.built ? buildCost(def, b.era || 0) : (b.have || {});
    const CAT_ITEM = { wood: 'wood', stone: 'stone', metal: 'copper', cloth: 'cloth' };
    for (const [r, v] of Object.entries(cost)) { const n = Math.floor(v * (b.built ? 0.5 : 1)); if (n > 0 && CAT_ITEM[r]) dropItem(world, CAT_ITEM[r], n, x + (ctx.rng.next() - 0.5), y + 0.5); }
  }
  for (const q of Object.values(world.pawns)) if (q.home === b.id) q.home = -1;
  removeBuilding(world, b, !j.refund);
  emitFx(world, { type: 'quake', x, y, mag: 0.2 });
  for (const q of Object.values(world.pawns)) if (q.job?.type === 'dismantle' && q.job.bid === j.bid) q.job = null;
}
