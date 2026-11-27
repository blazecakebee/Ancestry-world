// Every player action is a command. Singleplayer and multiplayer use the same path:
// the host validates each command against ownership and granted permissions, then applies it.
// This is what guarantees nobody can interfere with a friend's nation without their consent.
import { giveOrder } from './orders.js';
import { addItem, takeCat, dropItem } from './items.js';
import { wantedTools } from './tools.js';
import { TOOL_MATS } from '../data/tools.js';
import { DAY_LEN } from '../core/time.js';
import { canBuildType, techCommand } from './tech.js';
import { TECH, BUILD_TECH } from '../data/tech.js';
import { powerById, TIERS } from '../data/powers.js';
import { BUILDINGS } from '../data/buildings.js';
import { AXES } from '../data/society.js';
import { B, BIOMES, F } from '../data/biomes.js';
import { startInspiration, POSSESS_MODES } from './ai.js';
import { addThought, computeFx, fullName, gainXp } from './pawn.js';
import { DISEASES, addDisease, injure } from './health.js';
import { makeProphet } from './nation.js';
import { creedCommand } from './creed.js';
import { ANIMALS } from './combat.js';
import { tileCost } from './pathfind.js';
import { ignite } from '../world/physics.js';
import { meteor } from './events.js';
import { SKILLS } from '../data/society.js';
import { canPlace, placeBuilding, removeBuilding, foundNation, takeSite, logEvent, emitFx, settlementBuildings, bCenter } from './world.js';
import { rel, setWar, setPeace, setAlliance } from './war.js';
import { CS, cellAt } from '../world/atmosphere.js';
import { wrap, dist, clamp } from '../core/util.js';

export const PERMS = { miracles: 'Use miracles on my land & people', plan: 'Plan buildings in my settlements', control: 'Possess my citizens' };

export function playerNation(world, pid) { const pl = world.players[pid]; return pl ? world.nations[pl.nationId] : null; }

/** Can player `pid` affect nation `nid` with permission `perm`? Unowned wilds (nid -1) are open to all. */
export function allowed(world, pid, nid, perm) {
  if (nid === -1 || nid === undefined) return perm === 'miracles';
  const n = world.nations[nid]; if (!n) return false;
  if (n.ownerId === pid) return true;
  return !!n.perms?.[pid]?.[perm];
}
export const tierOf = (n) => TIERS.reduce((t, x) => (n.devotion >= x.devotion ? x.tier : t), 1);

export function applyCommand(world, pid, cmd, rng) {
  const me = playerNation(world, pid);
  const fail = (msg) => ({ ok: false, msg });
  const ok = (msg) => ({ ok: true, msg });
  switch (cmd.type) {
    case 'speed': {
      if (world.settings?.hostOnlySpeed && pid !== world.hostId) return fail('Only the host can change speed in this world.');
      if (typeof cmd.paused === 'boolean') world.paused = cmd.paused;
      if (cmd.speed) world.speed = clamp(+cmd.speed, 0.25, 10);
      logEvent(world, 'system', `${world.players[pid]?.name || 'Someone'} ${world.paused ? 'paused the world' : `set speed to ${world.speed}x`}.`);
      return ok();
    }
    case 'claim': { // join as a deity: found a new tribe or adopt an unowned AI tribe
      if (me && !me.dead) return fail('You already watch over a nation.');
      let n;
      if (cmd.nationId) {
        n = world.nations[cmd.nationId];
        if (!n || n.dead || n.ownerId || n.raider) return fail('That tribe cannot be adopted.');
        n.ownerId = pid; n.ai = false;
      } else {
        const site = cmd.x !== undefined ? { x: cmd.x, y: cmd.y } : takeSite(world);
        if (!site) return fail('No free land remains.');
        n = foundNation(world, site, { ai: false, ownerId: pid, color: cmd.color, name: cmd.name, pop: world.settings?.founders ?? 9, race: ['human', 'elf', 'orc'].includes(cmd.race) ? cmd.race : undefined /* 'random' → rolled */ });
      }
      world.players[pid].nationId = n.id;
      logEvent(world, 'nation', `${world.players[pid].name} became the patron deity of ${n.name}.`, { nationId: n.id, big: true });
      return ok(n.id);
    }
    case 'power': return castPower(world, pid, me, cmd, rng);
    case 'plan': {
      const s = world.settlements[cmd.sid]; if (!s) return fail('No settlement.');
      if (!allowed(world, pid, s.nationId, 'plan')) return fail("You don't have permission to plan here.");
      const def = BUILDINGS[cmd.building]; const n = world.nations[s.nationId];
      if (!def || cmd.building === 'center') return fail('Not available.');
      if (!canBuildType(n, cmd.building)) return fail(def.era > n.era ? 'Not available in this era.' : `Needs ${TECH[BUILD_TECH[cmd.building]]?.name || 'research'} first.`);
      if (dist(cmd.x, cmd.y, s.x, s.y, world.W) > s.radius + 4) return fail('Too far from the settlement.');
      if (!canPlace(world, s, cmd.building, cmd.x, cmd.y)) return fail('Cannot build there.');
      const b = placeBuilding(world, s, cmd.building, cmd.x, cmd.y); b.byPlayer = true; b.era = n.era;
      return ok();
    }
    case 'cancelPlan': {
      const b = world.buildings[cmd.bid]; if (!b || b.built) return fail();
      const s = world.settlements[b.sid];
      if (!allowed(world, pid, s?.nationId, 'plan')) return fail('Not permitted.');
      if (s) for (const [r, v] of Object.entries(b.have || {})) s.stock[r] = (s.stock[r] || 0) + v; // delivered materials go back to the store
      removeBuilding(world, b, false);
      return ok();
    }
    case 'decree': {
      if (!me) return fail();
      const v = cmd.value;
      if (cmd.key === 'rations' && ['strict', 'normal', 'generous'].includes(v)) me.laws.rations = v;
      else if (cmd.key === 'focus' && ['balanced', 'food', 'science', 'faith', 'military', 'build'].includes(v)) me.laws.focus = v;
      else if (cmd.key === 'conscription') me.laws.conscription = clamp(+v, 0.02, 0.5);
      else if (cmd.key === 'raids') me.laws.raids = !!v;
      else return fail();
      return ok();
    }
    case 'order': { if (!me) return fail('You have no people.'); const r = giveOrder(world, me, cmd); return r.err ? fail(r.err) : ok(r.msg); }
    case 'creed': return creedCommand(world, me, cmd, rng);
    case 'tech': { if (!me) return fail('You have no people.'); const e = techCommand(world, me, cmd); return e ? fail(e) : ok(); }
    case 'flag': {
      if (!me) return fail();
      const f = cmd.flag || {}; const hex = (c) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ffffff');
      me.flag = { pattern: String(f.pattern).slice(0, 16), c1: hex(f.c1), c2: hex(f.c2), c3: hex(f.c3), emblem: String(f.emblem).slice(0, 16), ec: hex(f.ec), ep: ['c', 'h', 't', 'f'].includes(f.ep) ? f.ep : 'c', es: clamp(+f.es || 0.85, 0.4, 1.3), eo: f.eo ? 1 : 0, em: f.em ? 1 : 0 };
      me.flagSet = true;
      if (cmd.name) me.name = String(cmd.name).slice(0, 32);
      if (cmd.color) me.color = hex(cmd.color);
      logEvent(world, 'nation', `${me.name} raised a new banner.`, { nationId: me.id });
      return ok();
    }
    case 'rename': {
      if (cmd.sid) { const s = world.settlements[cmd.sid]; if (!s || !allowed(world, pid, s.nationId, 'plan') || world.nations[s.nationId].ownerId !== pid) return fail(); s.name = String(cmd.name).slice(0, 28); }
      return ok();
    }
    case 'perm': {
      if (!me || !PERMS[cmd.key] || !world.players[cmd.player]) return fail();
      me.perms[cmd.player] = me.perms[cmd.player] || {};
      me.perms[cmd.player][cmd.key] = !!cmd.value;
      logEvent(world, 'system', `${me.name} ${cmd.value ? 'granted' : 'revoked'} "${PERMS[cmd.key]}" ${cmd.value ? 'to' : 'from'} ${world.players[cmd.player].name}.`, { nationId: me.id });
      if (!cmd.value && cmd.key === 'control') for (const p of Object.values(world.pawns)) if (p.nationId === me.id && p.possessedBy === cmd.player) p.possessedBy = null;
      return ok();
    }
    case 'diplo': {
      if (!me) return fail();
      const other = world.nations[cmd.to]; if (!other || other.dead || other === me) return fail();
      const r = rel(me, other.id);
      if (cmd.action === 'war') { if (r.state === 'war') return fail(); setWar(world, me, other, `by the will of ${world.players[pid].name}`); return ok(); }
      if (cmd.action === 'breakAlliance') { if (r.state !== 'ally') return fail(); r.state = 'peace'; rel(other, me.id).state = 'peace'; logEvent(world, 'nation', `${me.name} ended its alliance with ${other.name}.`); return ok(); }
      if (['peace', 'alliance'].includes(cmd.action)) {
        if (cmd.action === 'peace' && r.state !== 'war') return fail('Not at war.');
        if (other.ai) { // AI decides on the spot
          const o = rel(other, me.id).opinion + (cmd.action === 'peace' ? other.warWeary * 4 : 0);
          const yes = cmd.action === 'peace' ? o > -40 || other.warWeary > 6 : o > 40;
          if (!yes) return fail(`${other.name} refused.`);
          cmd.action === 'peace' ? setPeace(world, me, other) : setAlliance(world, me, other);
          return ok();
        }
        other.proposals = other.proposals.filter((p) => !(p.from === me.id && p.kind === cmd.action));
        other.proposals.push({ from: me.id, kind: cmd.action, t: world.time });
        logEvent(world, 'nation', `${me.name} proposed ${cmd.action === 'peace' ? 'peace' : 'an alliance'} to ${other.name}.`, { nationId: other.id });
        return ok('Proposal sent.');
      }
      if (cmd.action === 'gift') {
        const res = cmd.res, amt = Math.floor(+cmd.amount || 0);
        const from = world.settlements[me.capitalId], to = world.settlements[other.capitalId];
        if (!from || !to || !(res in from.stock) || amt <= 0 || from.stock[res] < amt) return fail('Not enough to give.');
        from.stock[res] -= amt; to.stock[res] += amt; rel(other, me.id).opinion = clamp(rel(other, me.id).opinion + amt * 0.4, -100, 100);
        logEvent(world, 'peace', `${me.name} sent ${amt} ${res} to ${other.name}.`, { nationId: other.id });
        return ok();
      }
      return fail();
    }
    case 'answer': {
      if (!me) return fail();
      const i = me.proposals.findIndex((p) => p.from === cmd.from && p.kind === cmd.kind); if (i < 0) return fail();
      const [prop] = me.proposals.splice(i, 1);
      const other = world.nations[prop.from]; if (!other) return fail();
      if (cmd.accept) { prop.kind === 'peace' ? setPeace(world, me, other) : setAlliance(world, me, other); }
      else logEvent(world, 'nation', `${me.name} declined ${other.name}'s ${prop.kind} proposal.`);
      return ok();
    }
    case 'possess': {
      const p = world.pawns[cmd.pid]; if (!p || p.dead) return fail();
      if (!allowed(world, pid, p.nationId, 'control')) return fail("You can only possess your own people (or a friend's, with permission).");
      if (p.possessedBy && p.possessedBy !== pid) return fail('Someone else is controlling them.');
      for (const q of Object.values(world.pawns)) if (q.possessedBy === pid) { q.possessedBy = null; q.ctrl = null; }
      p.possessedBy = pid; p.ctrl = {}; p.job = null; p.path = null; p.brk = null;
      return ok();
    }
    case 'grab': { // pick a person up with the divine hand
      const p = world.pawns[cmd.pid]; if (!p || p.dead) return fail();
      const n = world.nations[p.nationId];
      if (n && n.ownerId && !allowed(world, pid, p.nationId, 'control')) return fail('You can only pick up your own people (or a friend\'s, with permission).');
      if (p.heldBy && p.heldBy !== pid) return fail('Someone else is holding them.');
      for (const q of Object.values(world.pawns)) if (q.heldBy === pid) q.heldBy = null;
      p.heldBy = pid; p.job = null; p.path = null; p.state = 'held';
      return ok();
    }
    case 'grabMove': {
      const p = Object.values(world.pawns).find((q) => q.heldBy === pid); if (!p) return fail();
      const x = +cmd.x, y = +cmd.y; if (!Number.isFinite(x) || !Number.isFinite(y)) return fail();
      p.x = ((x % world.W) + world.W) % world.W; p.y = clamp(y, 1, world.H - 2); p.rx = p.x; p.ry = p.y;
      return ok();
    }
    case 'drop': {
      const p = Object.values(world.pawns).find((q) => q.heldBy === pid); if (!p) return fail();
      p.heldBy = null; p.state = 'idle';
      const vx = clamp(+cmd.vx || 0, -60, 60), vy = clamp(+cmd.vy || 0, -60, 60), sp = Math.hypot(vx, vy);
      if (sp > 6) { // thrown!
        p.x = ((p.x + vx * 0.12) % world.W + world.W) % world.W; p.y = clamp(p.y + vy * 0.12, 1, world.H - 2);
        if (sp > 14) injure(p, rng, Math.min(40, (sp - 14) * 1.6), 'blunt');
        addThought(p, 'thrown', world.time, 1);
        emitFx(world, { type: 'knock', pid: p.id, ix: vx * 0.35, iy: -3 - sp * 0.12 });
      } else emitFx(world, { type: 'knock', pid: p.id, ix: vx * 0.2, iy: -1.2 });
      return ok();
    }
    case 'release': { for (const q of Object.values(world.pawns)) if (q.possessedBy === pid) { q.possessedBy = null; q.ctrl = null; } return ok(); }
    case 'ctrl': {
      const p = Object.values(world.pawns).find((q) => q.possessedBy === pid); if (!p) return fail();
      p.ctrl = { mx: clamp(+cmd.mx || 0, -1, 1), my: clamp(+cmd.my || 0, -1, 1), act: cmd.act === 'hold' || cmd.act === 'once' ? cmd.act : null, mode: POSSESS_MODES.includes(cmd.mode) ? cmd.mode : 'auto', targetPawn: cmd.targetPawn | 0 || null, sleep: !!cmd.sleep };
      return ok();
    }
    case 'chat': {
      const text = String(cmd.text || '').slice(0, 200).trim(); if (!text) return fail();
      logEvent(world, 'chat', `${world.players[pid]?.name}: ${text}`, { player: pid });
      return ok();
    }
  }
  return fail('Unknown command');
}

/** Hold the sky over an area for a while (see world/atmosphere.js applyZones); also drives the zone visuals. */
function zone(world, kind, x, y, r, days, extra = {}) {
  const a = world.atmo; a.zones ||= [];
  a.zones = a.zones.filter((z) => !(z.kind === kind && dist(z.x, z.y, x, y, world.W) < r)); // recasting refreshes, never stacks
  a.zones.push({ kind, x: x + 0.5, y: y + 0.5, r, until: world.time + days * DAY_LEN, since: world.time, ...extra });
}
export { zone };
function castPower(world, pid, me, cmd, rng) {
  const P = powerById[cmd.power];
  const fail = (msg) => ({ ok: false, msg });
  if (!P || !me) return fail('No such power.');
  if (tierOf(me) < P.tier) return fail(`Requires devotion tier ${P.tier}.`);
  if (P.minEra && me.era < P.minEra) return fail('Your people are not advanced enough.');
  if (me.glitter < P.cost) return fail('Not enough Glitter.');
  if ((me.cooldowns[P.id] || 0) > world.time) return fail(`Recharging (${(me.cooldowns[P.id] - world.time).toFixed(1)} days).`);
  const now = world.time;
  let target = null, tx = cmd.x, ty = cmd.y, nid = -1;
  if (P.target === 'pawn') { target = world.pawns[cmd.pid]; if (!target || target.dead) return fail('Choose a living citizen.'); nid = target.nationId; tx = target.x; ty = target.y; }
  else if (P.target === 'settlement') { target = world.settlements[cmd.sid]; if (!target) return fail('Choose a settlement.'); nid = target.nationId; tx = target.x; ty = target.y; }
  else if (P.target === 'tile') {
    if (!(ty >= 0 && ty < world.H)) return fail();
    tx = wrap(Math.floor(tx), world.W); ty = Math.floor(ty);
    // all tiles in the radius must be ours, permitted, or wild
    const r = P.radius || 0, seen = new Set();
    for (let oy = -r; oy <= r; oy += Math.max(1, r)) for (let ox = -r; ox <= r; ox += Math.max(1, r)) { const y = clamp(ty + oy, 0, world.H - 1); seen.add(world.tiles.owner[y * world.W + wrap(tx + ox, world.W)]); }
    for (const o of seen) if (!allowed(world, pid, o, 'miracles')) return fail(`That land belongs to ${world.nations[o]?.name}. Divine powers need their permission.`);
  } else {
    nid = me.id;
    const cap = world.settlements[me.capitalId]; if (cap) { tx = cap.x; ty = cap.y; } // 'self' powers are centred on the capital
  }
  if (P.target !== 'tile' && !allowed(world, pid, nid, 'miracles')) return fail(nid > 0 ? `${world.nations[nid]?.name} has not permitted your miracles.` : 'Not permitted.');

  const s = P.target === 'settlement' ? target : null;
  const witnesses = (x, y, r = 10) => Object.values(world.pawns).filter((p) => !p.dead && dist(p.x, p.y, x, y, world.W) < r);
  switch (P.id) {
    case 'inspire': startInspiration(world, target, cmd.kind || rng.pick(['work', 'research', 'craft'])); break;
    case 'rain': { // a rain cloud settles over the area for a day and a half: waters crops, douses fires, fills puddles
      zone(world, 'rain', tx, ty, P.radius, 1.5); for (const p of witnesses(tx, ty, P.radius)) if (p.nationId === me.id) addThought(p, 'rainBlessing', now);
      for (let oy = -P.radius; oy <= P.radius; oy++) for (let ox = -P.radius; ox <= P.radius; ox++) { if (ox * ox + oy * oy > P.radius * P.radius) continue; const y = clamp(ty + oy, 0, world.H - 1), i = y * world.W + wrap(tx + ox, world.W); const t = world.tiles; if (t.feat[i] === F.FARM && t.crop[i] > 0) { t.crop[i] = Math.min(254, t.crop[i] + 40); world.dirty.add(i); } if (!BIOMES[t.biome[i]].water && t.bld[i] < 0 && Math.random() < 0.12) { t.water[i] = Math.max(t.water[i], 0.25); world.waterActive.add(i); } }
      for (const i of [...world.fireActive]) if (dist(i % world.W, Math.floor(i / world.W), tx, ty, world.W) < P.radius) world.tiles.fire[i] = 0;
      break;
    }
    case 'heal': target.injuries = target.injuries.filter((j) => j.scar).map((j) => ({ ...j, sev: 0, bleed: 0 })); target.blood = 1; target.pain = 0; target.downed = false; addThought(target, 'tended', now); emitFx(world, { type: 'emote', pid: target.id, icon: 'heart' }); break;
    case 'calm': target.brk = null; addThought(target, 'miracle', now); target.mood = Math.max(target.mood, 40); break;
    case 'breeze': { const ang = +cmd.angle || 0; world.atmo.overrides.push({ x: tx, y: ty, r: P.radius, u: Math.cos(ang) * 18, v: Math.sin(ang) * 18, until: now + DAY_LEN }); zone(world, 'wind', tx, ty, P.radius, 1, { ang }); break; }
    case 'omen': for (const p of s._pawns || []) { addThought(p, 'miracle', now); p.mood = Math.min(100, p.mood + 8); } world.nations[s.nationId].stability = Math.min(100, world.nations[s.nationId].stability + 15); break;
    case 'harvest': s.until.harvest = now + 0.1; break;
    case 'revelation': { if (!me.creed) return fail('Your people have no creed yet.'); me.creed.certainty = clamp(me.creed.certainty + 30, 0, 100); me.creed.reformAt = 0; me.creed.preceptAt = 0; for (const p of me._pawns || []) addThought(p, 'miracle', now); break; }
    case 'ore': {
      let k = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { if (ox * ox + oy * oy > 5) continue; const i = clamp(ty + oy, 0, world.H - 1) * world.W + wrap(tx + ox, world.W); if (!BIOMES[world.tiles.biome[i]].water && world.tiles.feat[i] !== F.BUILDING && world.tiles.feat[i] !== F.FARM) { world.tiles.feat[i] = F.GOLD; world.tiles.featHp[i] = 10; world.dirty.add(i); k++; } }
      if (!k) return fail('No room for ore there.');
      break;
    }
    case 'cure': for (const p of s._pawns || []) { p.diseases = p.diseases.filter((d) => DISEASES[d.id].env); addThought(p, 'miracle', now); } break;
    case 'valor': for (const p of s._pawns || []) if (p.role === 'soldier') p.buff.valorUntil = now + 2 * DAY_LEN; break;
    case 'fertility': s.until.fertility = now + 3 * DAY_LEN; break;
    case 'tectonic': {
      const lower = !!cmd.lower;
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
        const d2 = ox * ox + oy * oy; if (d2 > 9) continue;
        const y = clamp(ty + oy, 1, world.H - 2), i = y * world.W + wrap(tx + ox, world.W), t = world.tiles;
        if (t.bld[i] >= 0) continue;
        const delta = (lower ? -1 : 1) * 0.18 * (1 - d2 / 12);
        t.height[i] = clamp(t.height[i] + delta, -1, 1);
        const T = t.baseTemp[i];
        if (t.height[i] < -0.02) { t.biome[i] = t.height[i] < -0.1 ? B.OCEAN : B.SHALLOW; t.feat[i] = F.NONE; t.river[i] = 0; }
        else if (t.height[i] > 0.5) t.biome[i] = T < 0 ? B.PEAK : B.MOUNTAIN;
        else if (t.height[i] > 0.38) t.biome[i] = B.MOUNTAIN;
        else if (BIOMES[t.biome[i]].water || t.biome[i] === B.MOUNTAIN) t.biome[i] = T > 18 ? B.SAVANNA : T > 3 ? B.PLAINS : B.TUNDRA;
        world.dirty.add(i);
      }
      emitFx(world, { type: 'quake', x: tx, y: ty, mag: 0.6 });
      break;
    }
    case 'avatar': {
      const old = world.pawns[me.champion];
      if (old) { old.traits = old.traits.filter((t) => t !== 'champion'); old.buff.championUntil = 0; computeFx(old); }
      target.traits = target.traits.filter((t) => t !== 'champion'); target.traits.push('champion'); target.buff.championUntil = 1; computeFx(target);
      target.injuries = []; target.blood = 1; me.champion = target.id;
      break;
    }
    case 'orbshield': s.until.shield = now + 6 * DAY_LEN; break;
    case 'prophecy': if (target.age < 18) return fail('Too young to preach.'); makeProphet(world, target); break;
    default: { const err = miracle({ world, pid, me, rng, P, tx, ty, target, s, now, cmd }); if (err) return fail(err); }
  }
  me.glitter -= P.cost; me.cooldowns[P.id] = now + P.cd; me.stats.miracles++;
  for (const p of witnesses(tx, ty, 10)) if (p.nationId === nid || nid === -1) { addThought(p, 'miracle', now); me.devotion += 0.4; }
  const who = target && target.name ? (target.family ? fullName(target) : target.name) : null;
  logEvent(world, 'miracle', `${world.players[pid]?.name || me.name}'s ${P.name}${who ? ' upon ' + who : ''}.`, { nationId: me.id, x: tx, y: ty, power: P.id });
  emitFx(world, { type: 'power', power: P.id, x: tx, y: ty, r: P.target === 'settlement' ? s.radius : P.radius || 1.5, color: P.color, nationId: me.id, pid: target?.look ? target.id : undefined });
  return { ok: true };
}


// ---------------------------------------------------------------------------------------------
// Transient pawn buffs. A buff is `p.buff.<name>Until` (world time) plus a fx delta table; computeFx() is re-run with the
// active deltas layered on top, so existing systems (move speed, damage, injure, learning) pick them up with no changes.
const BUFFS = {
  haste: { speed: 0.35 }, ward: { dmgTaken: -0.35 }, fervor: { melee: 0.3, ranged: 0.2 },
  scholar: { learn: 0.6 }, dread: { melee: -0.25, ranged: -0.25, speed: -0.1 }, diligent: { work: 0.3 },
};
export function refreshBuffs(world, p) {
  computeFx(p);
  let any = false;
  for (const [id, delta] of Object.entries(BUFFS)) {
    const until = p.buff[id + 'Until'];
    if (!until) continue;
    if (until <= world.time) { delete p.buff[id + 'Until']; continue; }
    any = true;
    for (const [k, v] of Object.entries(delta)) p.fx[k] = (p.fx[k] || 0) + v;
  }
  p.buff.fxOn = any;
}
function grantBuff(world, p, id, days) { p.buff[id + 'Until'] = world.time + days * DAY_LEN; /* power durations are calendar days */ p.buff.fxOn = true; refreshBuffs(world, p); }

// Animals summoned by creature powers: id -> [kind, min, max]. They belong to the caster's nation (`patron`):
// predators spare its people and they may roam its land.
const SPAWNS = {
  dog: ['dog', 2, 3], cat: ['cat', 2, 3], sheepflock: ['sheep', 4, 7], horses: ['horse', 3, 5],
  cows: ['cow', 3, 5], pigs: ['pig', 3, 5], goats: ['goat', 3, 5], chickens: ['chicken', 5, 9], rabbits: ['rabbit', 4, 8], ducks: ['duck', 4, 8], fox: ['fox', 2, 3], wisp: ['wisp', 1, 3],
  slime_green: ['slime_green', 2, 4], slime_blue: ['slime_blue', 2, 4], slime_red: ['slime_red', 1, 3],
};

/** Effects of every non-original power. Returns an error string (nothing is spent) or null on success. */
function miracle({ world, pid, me, rng, P, tx, ty, target, s, now, cmd }) {
  const { W, H, tiles: t } = world, id = P.id, R = P.radius || 0;
  const permCache = new Map();
  const may = (o) => { let v = permCache.get(o); if (v === undefined) permCache.set(o, (v = allowed(world, pid, o, 'miracles'))); return v; };
  /** Visit land tiles within r that are ours, permitted or wild (per tile, not just the brush corners). */
  const each = (r, fn) => {
    let k = 0;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const d2 = ox * ox + oy * oy; if (d2 > r * r + 0.5) continue;
      const y = ty + oy; if (y < 1 || y >= H - 1) continue;
      const i = y * W + wrap(tx + ox, W);
      if (may(t.owner[i]) && fn(i, wrap(tx + ox, W), y, d2) !== false) k++;
    }
    return k;
  };
  const dry = (i) => !BIOMES[t.biome[i]].water && t.bld[i] < 0 && t.water[i] < 0.3;
  const open = (i) => dry(i) && (t.feat[i] === F.NONE || t.feat[i] === F.STUMP);
  const touch = (i) => world.dirty.add(i);
  const folk = (r) => Object.values(world.pawns).filter((p) => !p.dead && dist(p.x, p.y, tx, ty, W) <= r);
  const friends = (r) => folk(r).filter((p) => may(p.nationId)); // own people, permitted nations, wild folk
  /** Enemy raiders, or nations at war with us whose owner permits it. */
  const foes = (r) => folk(r).filter((p) => { const n = world.nations[p.nationId]; return n && n.id !== me.id && (n.raider || (rel(me, n.id).state === 'war' && may(n.id))); });
  /** Anyone a curse may touch: own people, permitted nations, or raiders. */
  const cursable = (r) => folk(r).filter((p) => may(p.nationId) || world.nations[p.nationId]?.raider);
  const beasts = (r) => Object.values(world.animals).filter((a) => !a.dead && a.patron !== me.id && dist(a.x, a.y, tx, ty, W) <= r);
  const cells = (fn, ring = 1) => { const a = world.atmo, c = cellAt(a, tx, ty), gx = c % a.GW, gy = Math.floor(c / a.GW); for (let oy = -ring; oy <= ring; oy++) for (let ox = -ring; ox <= ring; ox++) { const y = clamp(gy + oy, 0, a.GH - 1); fn(y * a.GW + wrap(gx + ox, a.GW), a); } };
  const douse = (r, to = 20) => { for (const i of [...world.fireActive]) if (dist(i % W, Math.floor(i / W), tx, ty, W) < r) t.fire[i] = Math.min(t.fire[i], to); };
  const pawns = (s && s._pawns) || (s ? Object.values(world.pawns).filter((p) => !p.dead && p.settlementId === s.id) : []);

  // creature summons share one path
  if (SPAWNS[id]) {
    const [kind, lo, hi] = SPAWNS[id], A = ANIMALS[kind], n = rng.int(lo, hi);
    const spots = [];
    each(R, (i) => { if (tileCost(t, i) > 0 && t.bld[i] < 0 && t.water[i] < 0.4) { spots.push(i); } return false; });
    if (!spots.length) return 'There is no room for creatures there.';
    for (let k = 0; k < n; k++) {
      const i = rng.pick(spots), aid = world.nextId.animal++;
      world.animals[aid] = { id: aid, kind, x: (i % W) + rng.range(0.2, 0.8), y: Math.floor(i / W) + rng.range(0.2, 0.8), hp: A.hp, dead: false, facing: rng.chance(0.5) ? 1 : -1, vx: 0, vy: 0, t: rng.next() * 3, patron: me.id };
    }
    return null;
  }

  switch (id) {
    // ---- nature ----
    case 'sprout': {
      const k = each(R, (i) => { const b = BIOMES[t.biome[i]]; if (!open(i) || !(b.fert > 0.15) || !rng.chance(0.75)) return false; t.feat[i] = F.TREE; t.featHp[i] = 3; touch(i); });
      return k ? null : 'No open ground for trees to sprout.';
    }
    case 'bloom': {
      each(R, (i) => { if (!open(i) || !(BIOMES[t.biome[i]].fert > 0.1) || !rng.chance(0.45)) return false; t.feat[i] = F.BERRY; t.featHp[i] = 6; touch(i); });
      for (const p of friends(R + 3)) p.needs.joy = Math.min(1, p.needs.joy + 0.35);
      break;
    }
    case 'snowfall': zone(world, 'snow', tx, ty, R, 1.5); douse(R, 0); break;
    case 'sunbeam': zone(world, 'clear', tx, ty, R, 2); for (const p of friends(R)) { addThought(p, 'sunnyBlessing', now); p.needs.joy = Math.min(1, p.needs.joy + 0.2); } break;
    case 'frostnip': zone(world, 'frost', tx, ty, R, 1); for (const p of cursable(R)) addThought(p, 'frostbitten', now); each(R, (i) => { if (t.water[i] > 0.05 && !BIOMES[t.biome[i]].water) { t.water[i] = 0; touch(i); } return false; }); douse(R, 0); break;
    case 'thaw': zone(world, 'thaw', tx, ty, R, 1); cells((c, a) => { a.snow[c] *= 0.2; }); for (const p of friends(R)) addThought(p, 'warmedUp', now); break;
    case 'lightrod': world.atmo.overrides.push({ x: tx, y: ty, r: R + 8, u: 0, v: 0, until: now + 3 * DAY_LEN, rod: true }); douse(R, 0); break;
    case 'spring': {
      const c = ty * W + tx;
      if (!dry(c) || t.biome[c] === B.MOUNTAIN || t.biome[c] === B.PEAK || !may(t.owner[c])) return 'A spring cannot rise there.';
      t.biome[c] = B.LAKE; t.feat[c] = F.NONE; t.river[c] = 0; t.water[c] = 1; world.waterActive.add(c); touch(c);
      each(R, (i, x, y, d2) => { if (d2 === 0 || !open(i) || !(BIOMES[t.biome[i]].fert > 0.1) || !rng.chance(0.35)) return false; t.feat[i] = F.BERRY; t.featHp[i] = 4; touch(i); });
      break;
    }
    case 'uplift': {
      const lower = !!cmd.lower;
      const k = each(R, (i, x, y, d2) => {
        if (t.bld[i] >= 0 || y < 2 || y > H - 3) return false;
        t.height[i] = clamp(t.height[i] + (lower ? -1 : 1) * 0.07 * (1 - d2 / (R * R + 2)), -1, 1);
        const T = t.baseTemp[i], h = t.height[i];
        if (h < -0.02) { t.biome[i] = h < -0.1 ? B.OCEAN : B.SHALLOW; t.feat[i] = F.NONE; t.river[i] = 0; }
        else if (h > 0.5) t.biome[i] = T < 0 ? B.PEAK : B.MOUNTAIN;
        else if (h > 0.38) t.biome[i] = B.MOUNTAIN;
        else if (BIOMES[t.biome[i]].water || t.biome[i] === B.MOUNTAIN) t.biome[i] = T > 18 ? B.SAVANNA : T > 3 ? B.PLAINS : B.TUNDRA;
        touch(i);
      });
      if (!k) return 'Nothing to reshape there.';
      emitFx(world, { type: 'quake', x: tx, y: ty, mag: 0.25 });
      break;
    }
    case 'fertilesoil': {
      const k = each(R, (i) => {
        if (!dry(i)) return false;
        const b = t.biome[i]; let hit = false;
        if (t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY) { if (t.crop[i] > 0) { t.crop[i] = Math.min(254, t.crop[i] + 70); hit = true; } }
        else if (b === B.DESERT || b === B.SALTFLAT) { t.biome[i] = B.SAVANNA; hit = true; }
        else if ((b === B.SAVANNA || b === B.TUNDRA || b === B.STEPPE || b === B.BADLANDS) && rng.chance(0.7)) { t.biome[i] = B.PLAINS; hit = true; }
        if (t.feat[i] === F.NONE && BIOMES[t.biome[i]].fert > 0.3 && rng.chance(0.3)) { t.feat[i] = F.BERRY; t.featHp[i] = 4; hit = true; }
        if (hit) touch(i);
        return hit;
      });
      return k ? null : 'The soil here cannot be improved.';
    }
    // ---- life ----
    case 'blesscrops': {
      const k = each(R, (i) => {
        if (t.feat[i] !== F.FARM || t.crop[i] === 0) return false;
        t.crop[i] = 255; if (t.crop[i] >= 255) t.feat[i] = F.CROP_READY; touch(i);
      });
      return k ? null : 'No growing crops there.';
    }
    case 'masscalm': for (const p of friends(R)) { p.brk = null; p.mood = Math.max(p.mood, 40); } break;
    case 'ward': grantBuff(world, target, 'ward', 2); break;
    case 'haste': grantBuff(world, target, 'haste', 1.5); break;
    case 'mend': for (const p of friends(R)) { for (const j of p.injuries) { j.sev *= 0.25; j.bleed = 0; j.tq = Math.max(j.tq, 0.5); } p.blood = Math.min(1, p.blood + 0.15); } break;
    case 'lessons': {
      const picks = SKILLS.map((k) => k.id); for (let k = 0; k < 3; k++) gainXp(target, picks.splice(rng.int(0, picks.length - 1), 1)[0], 260);
      grantBuff(world, target, 'scholar', 2);
      break;
    }
    case 'cleanse': target.diseases = target.diseases.filter((d) => DISEASES[d.id].env); break;
    case 'sanctuary': for (const p of friends(R)) { for (const j of p.injuries) j.sev *= 0.8; p.needs.rest = Math.min(1, p.needs.rest + 0.35); addThought(p, 'tended', now); grantBuff(world, p, 'ward', 0.5); } break;
    case 'feast': {
      addItem(s, 'roast', 10 + pawns.length * 2); addItem(s, 'bread', 10 + pawns.length); addItem(s, 'apple', 10);
      for (const p of pawns) { addThought(p, 'ateFine', now); p.needs.food = 1; }
      break;
    }
    // ---- creatures (fish are handled by the settlements that eat them) ----
    case 'fishshoal': {
      const c = ty * W + tx;
      if (!BIOMES[t.biome[c]].water) return 'Fish need water.';
      let best = null, bd = 30;
      for (const q of Object.values(world.settlements)) { const d = dist(q.x, q.y, tx, ty, W); if (q.nationId === me.id && d < bd) { bd = d; best = q; } }
      if (!best) return 'None of your settlements is close enough to reach the catch.';
      addItem(best, 'fish', 12 + Math.min(10, (best._pawns || []).length)); addItem(best, 'fish2', 6);
      for (let k = 0; k < 6; k++) emitFx(world, { type: 'steam', x: tx + rng.range(-R, R), y: ty + rng.range(-R, R) });
      break;
    }
    // ---- war ----
    case 'fervor': for (const p of friends(R)) grantBuff(world, p, 'fervor', 1.5); break;
    case 'aegis': for (const p of friends(R)) grantBuff(world, p, 'ward', 1.5); break;
    case 'rally': {
      for (const p of pawns) if (p.role === 'soldier') {
        p.brk = null; p.needs.rest = Math.min(1, p.needs.rest + 0.4); p.blood = Math.min(1, p.blood + 0.2);
        for (const j of p.injuries) j.sev *= 0.7;
        grantBuff(world, p, 'haste', 1); addThought(p, 'miracle', now);
      }
      break;
    }
    case 'smite': {
      const a = beasts(R + 0.2), f = foes(R);
      if (!a.length && !f.length) return 'No beasts or enemies there to smite.';
      for (const an of a) an.hp -= 68;
      for (const p of f) { injure(p, rng, 45, 'burn'); emitFx(world, { type: 'knock', pid: p.id, ix: rng.range(-3, 3), iy: -5 }); }
      emitFx(world, { type: 'lightning', x: tx, y: ty });
      break;
    }
    case 'firearrows': {
      const a = beasts(R + 1.5), f = foes(R + 1.5);
      for (let k = 0; k < 6; k++) {
        const x = tx + rng.range(-R, R), y = ty + rng.range(-R, R);
        emitFx(world, { type: 'projectile', x: x - 5, y: y - 8, tx: x, ty: y, era: 2 });
        emitFx(world, { type: 'hit', x, y: y - 0.4 });
        for (const an of a) if (dist(an.x, an.y, x, y, W) < 1.2) an.hp -= 21;
        for (const p of f) if (dist(p.x, p.y, x, y, W) < 1.2) injure(p, rng, 15, 'cut');
        const i = clamp(Math.floor(y), 1, H - 2) * W + wrap(Math.floor(x), W);
        if (may(t.owner[i]) && rng.chance(0.25)) ignite(world, i, 70);
      }
      break;
    }
    case 'dread': {
      const f = foes(R); if (!f.length) return 'No enemies at war with you are near.';
      for (const p of f) { grantBuff(world, p, 'dread', 1); addThought(p, 'insulted', now); }
      break;
    }
    // ---- curses (all weak; only wild land, your own, or permitted) ----
    case 'droughtnudge': zone(world, 'dry', tx, ty, R, 2); each(R, (i) => { if (t.water[i] > 0) { t.water[i] = 0; touch(i); } return false; }); break;
    case 'blightpatch': {
      const k = each(R, (i) => {
        const f = t.feat[i];
        if (f === F.FARM || f === F.CROP_READY) { t.crop[i] = 0; t.feat[i] = F.FARM; }
        else if (f === F.TREE) t.feat[i] = F.STUMP;
        else if (f === F.BERRY) t.feat[i] = F.NONE;
        else return false;
        touch(i);
      });
      return k ? null : 'Nothing there to wither.';
    }
    case 'locusts': {
      const k = each(R, (i) => {
        if (t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY) { t.crop[i] = Math.floor(t.crop[i] * 0.4); t.feat[i] = F.FARM; }
        else if (t.feat[i] === F.BERRY && rng.chance(0.5)) t.feat[i] = F.NONE;
        else return false;
        touch(i);
      });
      return k ? null : 'No crops or berries for the locusts.';
    }
    case 'terror': {
      const v = cursable(R).filter((p) => !p.downed).slice(0, 4);
      if (!v.length) return 'No one is near enough to terrify.';
      for (const p of v) { p.brk = { type: 'sadWander', lvl: 'minor', until: now + 0.4 }; addThought(p, 'insulted', now); }
      break;
    }
    case 'plagueseed': {
      const v = cursable(R).filter((p) => p.diseases.length === 0);
      if (!v.length) return 'No healthy victims nearby.';
      for (let k = 0; k < 3 && v.length; k++) addDisease(v.splice(rng.int(0, v.length - 1), 1)[0], 'flu', 0.05);
      break;
    }
    case 'famine': s.stock.food *= 0.8; s.stock.meals *= 0.8; break;
    // ---- world ----
    case 'aurora': {
      for (const p of Object.values(world.pawns)) if (!p.dead && p.nationId === me.id) { addThought(p, 'aurora', now); p.mood = Math.min(100, p.mood + 6); }
      emitFx(world, { type: 'aurora', x: tx, y: ty }); zone(world, 'aurora', tx, ty, 40, 1);
      break;
    }
    case 'meteorshower': {
      let hits = 0;
      for (let k = 0; k < 14 && hits < 3; k++) {
        const x = wrap(Math.floor(tx + rng.range(-R, R)), W), y = clamp(Math.floor(ty + rng.range(-R, R)), 3, H - 4);
        // impact point must be wild open ground with no foreign (or any) people nearby
        let clear = true;
        for (let oy = -2; oy <= 2 && clear; oy++) for (let ox = -2; ox <= 2; ox++) if (t.owner[(y + oy) * W + wrap(x + ox, W)] !== -1) { clear = false; break; }
        if (!clear || BIOMES[t.biome[y * W + x]].water) continue;
        if (Object.values(world.pawns).some((p) => !p.dead && dist(p.x, p.y, x, y, W) < 5 && !may(p.nationId))) continue;
        meteor(world, x, y, rng, me, 0.5); hits++;
      }
      if (!hits) return 'Meteors need open, unowned ground to fall on.';
      break;
    }

    // ---- v0.7.3 early-game gifts ----
    case 'timber': case 'stonegift': case 'wool': case 'bounty': {
      const c = ty * W + tx; if (BIOMES[t.biome[c]].water) return 'Choose dry land.';
      const gifts = { timber: [['wood', 12]], stonegift: [['stone', 10]], wool: [['wool', 6], ['hide', 4]], bounty: [['beef', 10], ['hide', 3]] }[id];
      for (const [item, n] of gifts) for (let k = 0; k < n; k += 3) dropItem(world, item, Math.min(3, n - k), tx + 0.5 + rng.range(-0.9, 0.9), ty + 0.5 + rng.range(-0.7, 0.7));
      break;
    }
    case 'herbs': {
      const c = ty * W + tx; if (BIOMES[t.biome[c]].water) return 'Herbs need soil.';
      dropItem(world, 'medicine', 4, tx + 0.5, ty + 0.5);
      for (const p of friends(R)) { for (const j of p.injuries) { j.sev *= 0.6; j.bleed *= 0.3; } addThought(p, 'tended', now); }
      each(R, (i) => { if (!open(i) || !rng.chance(0.25)) return false; t.feat[i] = F.BERRY; t.featHp[i] = 3; touch(i); });
      break;
    }
    case 'hearth': {
      const raw = Math.min(s.stock.food || 0, 14);
      if (raw >= 1) { const got = takeCat(s, 'food', raw); for (const [, k] of got) addItem(s, 'meal', k * 1.15); }
      for (const p of pawns) { addThought(p, 'hearthBlessed', now); p.needs.joy = Math.min(1, p.needs.joy + 0.25); p.thoughts = p.thoughts.filter((q) => q.id !== 'cold'); }
      for (const b of settlementBuildings(world, s)) if (b.type === 'campfire' || b.type === 'center') emitFx(world, { type: 'power', power: 'hearth', x: b.x + b.w / 2, y: b.y + b.h / 2, r: 1, sub: true });
      break;
    }
    case 'builders': {
      const sites = settlementBuildings(world, s, null, false).filter((b) => !b.built);
      if (!sites.length) return 'Nothing is being built there.';
      for (const b of sites) { b.progress = Math.min(0.99, (b.progress || 0) + 0.34); emitFx(world, { type: 'built', x: b.x + b.w / 2, y: b.y + b.h / 2 }); }
      for (const p of pawns) if (p.work === 'builder') grantBuff(world, p, 'haste', 0.5);
      break;
    }
    case 'lure': {
      let k = 0;
      for (const an of Object.values(world.animals)) if (!an.dead && !ANIMALS[an.kind]?.predator && dist(an.x, an.y, tx, ty, W) < 32) { an.lure = { x: tx + 0.5, y: ty + 0.5, until: now + DAY_LEN }; k++; }
      if (!k) return 'No beasts roam near enough to answer the call.';
      break;
    }
    case 'restful': for (const p of pawns) { p.needs.rest = 1; addThought(p, 'sleptWell', now); p.brk = null; } break;
    case 'wisdom': {
      const cur = TECH[me.techCur]; if (!cur) return 'Choose something to research first.';
      me.techProg = (me.techProg || 0) + cur.cost * 0.25; me.research = (me.research || 0) + cur.cost * 0.25;
      break;
    }
    case 'clearing': {
      const k = each(R, (i, x, y) => {
        const f = t.feat[i]; if (t.bld[i] >= 0) return false;
        if (f === F.TREE) dropItem(world, 'wood', 3, x + 0.5, y + 0.5);
        else if (f === F.ROCK) dropItem(world, 'stone', 3, x + 0.5, y + 0.5);
        else if (f === F.ORE) dropItem(world, 'copper', 2, x + 0.5, y + 0.5);
        else if (f !== F.STUMP && f !== F.RUBBLE) return false;
        t.feat[i] = F.NONE; touch(i);
      });
      return k ? null : 'Nothing there to clear.';
    }
    case 'matchmaker': {
      const single = friends(R).filter((p) => p.age >= 18 && p.spouse < 0 && p.lover < 0 && !p.raider);
      let pair = null;
      for (const a of single) { const b = single.find((q) => q !== a && q.sex !== a.sex && Math.abs(q.age - a.age) < 18 && !a.parents.some((x) => q.parents.includes(x))); if (b) { pair = [a, b]; break; } }
      if (!pair) return 'No two single adults here could fall for each other.';
      const [a, b] = pair; a.lover = b.id; b.lover = a.id;
      for (const p of pair) { addThought(p, 'kindred', now); addThought(p, 'newLover', now); emitFx(world, { type: 'emote', pid: p.id, icon: 'love' }); }
      break;
    }
    case 'toolgift': {
      let k = 0;
      for (const p of friends(R)) { if (p.age < 14) continue; p.tools ||= {}; const kind = wantedTools(p).find((q) => !p.tools[q]); if (!kind) continue; p.tools[kind] = { m: 'stone', u: TOOL_MATS.stone.uses }; p.toolOut = kind; addThought(p, 'giftedTool', now); emitFx(world, { type: 'emote', pid: p.id, icon: 'hammer' }); k++; }
      if (!k) return 'Everyone nearby already has the tools they need.';
      break;
    }
    case 'beacon': zone(world, 'beacon', tx, ty, R, 1.5); for (const p of friends(R)) { grantBuff(world, p, 'diligent', 1.5); addThought(p, 'guidingLight', now); } break;
    case 'seeds': {
      const fields = settlementBuildings(world, s, 'farm');
      let k = 0;
      for (const b of fields) for (let oy = 0; oy < b.h; oy++) for (let ox = 0; ox < b.w; ox++) { const i = (b.y + oy) * W + wrap(b.x + ox, W); if (t.feat[i] !== F.FARM) continue; t.crop[i] = Math.min(254, Math.max(t.crop[i], 1) + 110); touch(i); k++; }
      if (!k) return 'This settlement has no fields yet.';
      break;
    }
    // ---- v0.6 powers ----
    case 'benediction': target.mood = Math.min(100, target.mood + 20); target.brk = null; target.needs.rest = Math.min(1, target.needs.rest + 0.3); addThought(target, 'miracle', now); break;
    case 'tongues': for (const p of pawns) { addThought(p, 'deepTalk', now); p.needs.social = Math.min(1, (p.needs.social ?? 0.5) + 0.4); } break;
    case 'consecrate': {
      const n = world.nations[s.nationId];
      n.stability = Math.min(100, n.stability + 6); if (n.creed) n.creed.certainty = clamp(n.creed.certainty + 10, 0, 100);
      for (const p of pawns) addThought(p, 'prophetSermon', now);
      break;
    }
    case 'unity': {
      me.stability = Math.min(100, me.stability + 10); if (me.creed) me.creed.certainty = clamp(me.creed.certainty + 15, 0, 100);
      for (const p of Object.values(world.pawns)) if (!p.dead && p.nationId === me.id) { addThought(p, 'miracle', now); p.mood = Math.min(100, p.mood + 10); }
      emitFx(world, { type: 'aurora', x: tx, y: ty });
      break;
    }
    case 'grove': {
      const k = each(R, (i) => { if (!open(i) || !(BIOMES[t.biome[i]].fert > 0.15) || !rng.chance(0.8)) return false; t.feat[i] = F.TREE; t.featHp[i] = 4; touch(i); });
      return k ? null : 'No open fertile ground for a grove.';
    }
    case 'rainbow': zone(world, 'rainbow', tx, ty, R, 0.6); for (const p of friends(R)) { p.mood = Math.min(100, p.mood + 8); p.needs.joy = Math.min(1, p.needs.joy + 0.3); addThought(p, 'miracle', now); } break;
    case 'wetland': {
      const k = each(R, (i) => {
        const b = t.biome[i]; if (!dry(i) || t.height[i] > 0.3 || [B.MOUNTAIN, B.PEAK, B.ICE, B.VOLCANIC, B.BEACH, B.DESERT].includes(b) || !rng.chance(0.7)) return false;
        t.biome[i] = B.SWAMP; if (t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY) t.feat[i] = F.NONE; touch(i);
      });
      return k ? null : 'The ground there cannot become a wetland.';
    }
    case 'oasis': {
      const c = ty * W + tx;
      if (![B.DESERT, B.SALTFLAT, B.BADLANDS, B.SAVANNA, B.STEPPE].includes(t.biome[c]) || !may(t.owner[c]) || t.bld[c] >= 0) return 'An oasis needs open dry land.';
      t.biome[c] = B.LAKE; t.feat[c] = F.NONE; t.water[c] = 1; world.waterActive.add(c); touch(c);
      each(R, (i, x, y, d2) => {
        if (d2 === 0 || !dry(i) || [B.MOUNTAIN, B.PEAK, B.ICE].includes(t.biome[i])) return false;
        if (BIOMES[t.biome[i]].fert < 0.5 && !BIOMES[t.biome[i]].water) t.biome[i] = B.SAVANNA;
        if (open(i) && rng.chance(0.5)) { t.feat[i] = F.TREE; t.featHp[i] = 3; } touch(i);
      });
      break;
    }
    case 'vigor': target.needs.food = 1; target.needs.rest = Math.min(1, target.needs.rest + 0.5); grantBuff(world, target, 'haste', 0.5); break;
    case 'muse': startInspiration(world, target, 'craft'); gainXp(target, 'artistic', 220); break;
    case 'manna': {
      addItem(s, 'bread', 30 + pawns.length * 3); addItem(s, 'wheat', 30);
      for (const p of pawns) { p.needs.food = Math.max(p.needs.food, 0.8); addThought(p, 'ateMeal', now); }
      break;
    }
    case 'warhorn': for (const p of friends(R)) { grantBuff(world, p, 'haste', 1); grantBuff(world, p, 'fervor', 0.7); } break;
    case 'thunderclap': {
      const f = foes(R); if (!f.length) return 'No enemies at war with you are near.';
      for (const p of f) { injure(p, rng, 18, 'blunt'); grantBuff(world, p, 'dread', 0.6); emitFx(world, { type: 'knock', pid: p.id, ix: rng.range(-4, 4), iy: -6 }); }
      emitFx(world, { type: 'lightning', x: tx, y: ty });
      break;
    }
    case 'wrath': {
      const a = beasts(R + 0.3), f = foes(R);
      if (!a.length && !f.length) return 'No beasts or enemies there to scorch.';
      for (const an of a) an.hp -= 52;
      for (const p of f) injure(p, rng, 36, 'burn');
      each(R, (i) => { if (rng.chance(0.2)) ignite(world, i, 60); return false; });
      emitFx(world, { type: 'lightning', x: tx, y: ty });
      break;
    }
    case 'nightmares': target.mood = Math.max(0, target.mood - 25); target.brk = { type: 'hideInRoom', lvl: 'minor', until: now + 0.4 }; addThought(target, 'insulted', now); break;
    case 'lightning': {
      for (const p of cursable(R + 0.5)) { injure(p, rng, 42, 'burn'); emitFx(world, { type: 'knock', pid: p.id, ix: rng.range(-3, 3), iy: -5 }); }
      for (const an of beasts(R + 0.5)) an.hp -= 60;
      const i = ty * W + tx; if (may(t.owner[i]) && rng.chance(0.7)) ignite(world, i, 90);
      emitFx(world, { type: 'lightning', x: tx, y: ty });
      break;
    }
    case 'heatwave': zone(world, 'heat', tx, ty, R, 2); for (const p of cursable(R)) { p.needs.rest = Math.max(0, p.needs.rest - 0.25); addThought(p, 'heatStruck', now); } break;
    case 'coldsnap': zone(world, 'cold', tx, ty, R, 2); for (const p of cursable(R)) addThought(p, 'frostbitten', now); break;
    case 'wildfire': {
      const k = each(R, (i) => rng.chance(0.65) && ignite(world, i, 100));
      return k ? null : 'There is nothing there to burn.';
    }
    case 'acidrain': {
      let hit = 0;
      each(R, (i) => {
        const f = t.feat[i]; let h = false;
        if (f === F.FARM || f === F.CROP_READY) { t.crop[i] = 0; t.feat[i] = F.FARM; h = true; }
        else if (f === F.TREE && rng.chance(0.6)) { t.feat[i] = F.STUMP; h = true; }
        if (!BIOMES[t.biome[i]].water) { t.pollution[i] = Math.min(255, t.pollution[i] + 60); h = true; }
        if (h) { touch(i); hit++; }
        return h;
      });
      for (const p of cursable(R)) injure(p, rng, 9, 'burn');
      if (!hit) return 'The acid rain finds nothing to corrode.';
      break;
    }
    case 'madness': target.brk = { type: 'berserk', lvl: 'major', until: now + 0.3 }; addThought(target, 'insulted', now); break;
    case 'isle': {
      const c = ty * W + tx;
      if (!BIOMES[t.biome[c]].water || t.biome[c] === B.LAKE || t.biome[c] === B.ICE) return 'An island must rise from the sea.';
      const k = each(R, (i, x, y, d2) => {
        if (!BIOMES[t.biome[i]].water || t.biome[i] === B.LAKE || y < 3 || y > H - 4) return false;
        const rise = 0.04 + 0.06 * (1 - d2 / (R * R + 1));
        t.height[i] = Math.max(t.height[i], 0) + rise; t.river[i] = 0; t.feat[i] = F.NONE;
        const T = t.baseTemp[i];
        t.biome[i] = d2 >= (R - 1) * (R - 1) ? B.BEACH : T > 18 ? B.SAVANNA : T > 3 ? B.PLAINS : B.TUNDRA;
        touch(i);
      });
      if (!k) return 'No open water there.';
      emitFx(world, { type: 'quake', x: tx, y: ty, mag: 0.3 });
      break;
    }
    case 'flood': {
      const k = each(R, (i) => {
        if (BIOMES[t.biome[i]].water || t.bld[i] >= 0 || t.height[i] > 0.3) return false;
        t.water[i] = 1; world.waterActive.add(i);
        if (t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY) { t.crop[i] = Math.floor(t.crop[i] * 0.3); t.feat[i] = F.FARM; }
        touch(i);
      });
      return k ? null : 'There is no low ground to flood.';
    }
    case 'earthquake': {
      let hit = 0;
      each(R, (i, x, y, d2) => {
        const b = world.buildings[t.bld[i]];
        if (b && b.type !== 'center' && rng.chance(0.3 * (1 - d2 / (R * R + 2)))) { removeBuilding(world, b); hit++; }
        else if (!BIOMES[t.biome[i]].water && t.bld[i] < 0 && t.feat[i] === F.NONE && rng.chance(0.07)) { t.feat[i] = F.RUBBLE; t.featHp[i] = 0; touch(i); }
        return false;
      });
      for (const p of cursable(R)) if (rng.chance(0.6)) injure(p, rng, 18, 'blunt');
      emitFx(world, { type: 'quake', x: tx, y: ty, mag: 1 });
      break;
    }
    case 'meteor': {
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) { const y = clamp(ty + oy, 1, H - 2), i = y * W + wrap(tx + ox, W); if (!may(t.owner[i])) return 'The impact would fall on land you may not touch.'; }
      if (BIOMES[t.biome[ty * W + tx]].water) return 'Meteors need solid ground to strike.';
      if (Object.values(world.pawns).some((p) => !p.dead && dist(p.x, p.y, tx, ty, W) < 6 && !may(p.nationId))) return 'Someone who has not permitted it is too close to the impact.';
      meteor(world, tx, ty, rng, me, 1.15);
      break;
    }
    case 'tsunami': {
      let coast = false;
      for (let oy = -(R + 3); oy <= R + 3 && !coast; oy++) for (let ox = -(R + 3); ox <= R + 3; ox++) { const y = ty + oy; if (y < 0 || y >= H) continue; if (BIOMES[t.biome[y * W + wrap(tx + ox, W)]].water) { coast = true; break; } }
      if (!coast) return 'A tsunami needs open water nearby.';
      const k = each(R + 2, (i) => {
        if (BIOMES[t.biome[i]].water || t.height[i] > 0.22) return false;
        t.water[i] = 1; world.waterActive.add(i);
        const b = world.buildings[t.bld[i]]; if (b && b.type !== 'center' && t.height[i] < 0.1 && rng.chance(0.4)) removeBuilding(world, b);
        if (t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY) { t.feat[i] = F.NONE; t.crop[i] = 0; }
        else if (t.feat[i] === F.TREE && rng.chance(0.3)) t.feat[i] = F.STUMP;
        touch(i);
      });
      if (!k) return 'The shore there is too high for a wave to reach.';
      for (const p of cursable(R + 2)) if (t.height[Math.floor(p.y) * W + wrap(Math.floor(p.x), W)] < 0.15 && rng.chance(0.5)) injure(p, rng, 22, 'blunt');
      emitFx(world, { type: 'quake', x: tx, y: ty, mag: 0.8 });
      break;
    }
    case 'volcano': {
      const c = ty * W + tx;
      if (BIOMES[t.biome[c]].water || t.biome[c] === B.ICE || !may(t.owner[c])) return 'A volcano needs solid, permitted ground.';
      each(R, (i, x, y, d2) => {
        if (BIOMES[t.biome[i]].water || t.biome[i] === B.ICE) return false;
        const b = world.buildings[t.bld[i]]; if (b && b.type !== 'center') removeBuilding(world, b);
        if (t.feat[i] === F.TREE || t.feat[i] === F.BERRY || t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY) t.feat[i] = F.NONE;
        if (d2 <= 2) { t.biome[i] = B.VOLCANIC; t.height[i] = clamp(t.height[i] + 0.25, 0, 1); }
        else if (t.biome[i] !== B.MOUNTAIN && t.biome[i] !== B.PEAK && rng.chance(0.75)) t.biome[i] = B.ASHLAND;
        if (rng.chance(0.25)) ignite(world, i, 80);
        touch(i);
      });
      for (const p of cursable(R + 1)) injure(p, rng, 45, 'burn');
      emitFx(world, { type: 'quake', x: tx, y: ty, mag: 1 });
      break;
    }
    default: return 'Unknown power.';
  }
  return null;
}
