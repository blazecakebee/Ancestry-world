// Every player action is a command. Singleplayer and multiplayer use the same path:
// the host validates each command against ownership and granted permissions, then applies it.
// This is what guarantees nobody can interfere with a friend's nation without their consent.
import { powerById, TIERS } from '../data/powers.js';
import { BUILDINGS } from '../data/buildings.js';
import { AXES } from '../data/society.js';
import { B, BIOMES, F } from '../data/biomes.js';
import { startInspiration } from './ai.js';
import { addThought, computeFx, fullName } from './pawn.js';
import { DISEASES } from './health.js';
import { makeProphet } from './nation.js';
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
        n = foundNation(world, site, { ai: false, ownerId: pid, color: cmd.color, name: cmd.name, race: ['human', 'elf', 'orc'].includes(cmd.race) ? cmd.race : undefined });
      }
      n.ideologyTarget = { ...n.ideology };
      world.players[pid].nationId = n.id;
      logEvent(world, 'nation', `${world.players[pid].name} became the patron deity of ${n.name}.`, { nationId: n.id, big: true });
      return ok(n.id);
    }
    case 'power': return castPower(world, pid, me, cmd, rng);
    case 'plan': {
      const s = world.settlements[cmd.sid]; if (!s) return fail('No settlement.');
      if (!allowed(world, pid, s.nationId, 'plan')) return fail("You don't have permission to plan here.");
      const def = BUILDINGS[cmd.building]; const n = world.nations[s.nationId];
      if (!def || def.era > n.era || cmd.building === 'center') return fail('Not available in this era.');
      if (dist(cmd.x, cmd.y, s.x, s.y, world.W) > s.radius + 4) return fail('Too far from the settlement.');
      if (!canPlace(world, s, cmd.building, cmd.x, cmd.y)) return fail('Cannot build there.');
      const b = placeBuilding(world, s, cmd.building, cmd.x, cmd.y); b.byPlayer = true; b.era = n.era;
      return ok();
    }
    case 'cancelPlan': {
      const b = world.buildings[cmd.bid]; if (!b || b.built) return fail();
      const s = world.settlements[b.sid];
      if (!allowed(world, pid, s?.nationId, 'plan')) return fail('Not permitted.');
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
    case 'ideologyTarget': {
      if (!me) return fail();
      me.ideologyTarget = me.ideologyTarget || { ...me.ideology };
      for (const ax of AXES) if (cmd.target?.[ax.id] !== undefined) me.ideologyTarget[ax.id] = clamp(+cmd.target[ax.id], -100, 100);
      return ok();
    }
    case 'flag': {
      if (!me) return fail();
      const f = cmd.flag || {}; const hex = (c) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ffffff');
      me.flag = { pattern: String(f.pattern).slice(0, 16), c1: hex(f.c1), c2: hex(f.c2), c3: hex(f.c3), emblem: String(f.emblem).slice(0, 16), ec: hex(f.ec) };
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
    case 'release': { for (const q of Object.values(world.pawns)) if (q.possessedBy === pid) { q.possessedBy = null; q.ctrl = null; } return ok(); }
    case 'ctrl': {
      const p = Object.values(world.pawns).find((q) => q.possessedBy === pid); if (!p) return fail();
      p.ctrl = { mx: clamp(+cmd.mx || 0, -1, 1), my: clamp(+cmd.my || 0, -1, 1), act: cmd.act === 'hold' || cmd.act === 'once' ? cmd.act : null, targetPawn: cmd.targetPawn | 0 || null, sleep: !!cmd.sleep };
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
  } else nid = me.id;
  if (P.target !== 'tile' && !allowed(world, pid, nid, 'miracles')) return fail(nid > 0 ? `${world.nations[nid]?.name} has not permitted your miracles.` : 'Not permitted.');

  const s = P.target === 'settlement' ? target : null;
  const witnesses = (x, y, r = 10) => Object.values(world.pawns).filter((p) => !p.dead && dist(p.x, p.y, x, y, world.W) < r);
  switch (P.id) {
    case 'inspire': startInspiration(world, target, cmd.kind || rng.pick(['work', 'research', 'craft'])); break;
    case 'rain': {
      const a = world.atmo, c = cellAt(a, tx, ty), gx = c % a.GW, gy = Math.floor(c / a.GW);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const y = clamp(gy + oy, 0, a.GH - 1); const cc = y * a.GW + wrap(gx + ox, a.GW); a.Hm[cc] *= 3; a.T[cc] -= 2; }
      for (const i of [...world.fireActive]) if (dist(i % world.W, Math.floor(i / world.W), tx, ty, world.W) < P.radius) world.tiles.fire[i] = Math.min(world.tiles.fire[i], 20);
      break;
    }
    case 'heal': for (const j of target.injuries) { j.sev *= 0.35; j.bleed = 0; j.tq = Math.max(j.tq, 0.8); } target.blood = Math.max(target.blood, 0.7); break;
    case 'calm': target.brk = null; addThought(target, 'miracle', now); target.mood = Math.max(target.mood, 40); break;
    case 'breeze': { const ang = +cmd.angle || 0; world.atmo.overrides.push({ x: tx, y: ty, r: P.radius, u: Math.cos(ang) * 14, v: Math.sin(ang) * 14, until: now + 1 }); break; }
    case 'omen': for (const p of s._pawns || []) addThought(p, 'miracle', now); world.nations[s.nationId].stability = Math.min(100, world.nations[s.nationId].stability + 10); break;
    case 'harvest': s.until.harvest = now + 0.1; break;
    case 'revelation': { const ax = AXES.find((a) => a.id === cmd.axis); if (!ax) return fail('Choose an axis.'); me.ideology[ax.id] = clamp(me.ideology[ax.id] + (cmd.dir < 0 ? -12 : 12), -100, 100); break; }
    case 'ore': {
      let k = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { if (ox * ox + oy * oy > 5) continue; const i = clamp(ty + oy, 0, world.H - 1) * world.W + wrap(tx + ox, world.W); if (!BIOMES[world.tiles.biome[i]].water && world.tiles.feat[i] !== F.BUILDING && world.tiles.feat[i] !== F.FARM) { world.tiles.feat[i] = F.GOLD; world.tiles.featHp[i] = 10; world.dirty.add(i); k++; } }
      if (!k) return fail('No room for ore there.');
      break;
    }
    case 'cure': for (const p of s._pawns || []) { p.diseases = p.diseases.filter((d) => DISEASES[d.id].env); addThought(p, 'miracle', now); } break;
    case 'valor': for (const p of s._pawns || []) if (p.role === 'soldier') p.buff.valorUntil = now + 2; break;
    case 'fertility': s.until.fertility = now + 3; break;
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
    case 'orbshield': s.until.shield = now + 6; break;
    case 'prophecy': if (target.age < 18) return fail('Too young to preach.'); makeProphet(world, target); break;
  }
  me.glitter -= P.cost; me.cooldowns[P.id] = now + P.cd; me.stats.miracles++;
  for (const p of witnesses(tx, ty, 10)) if (p.nationId === nid || nid === -1) { addThought(p, 'miracle', now); me.devotion += 0.4; }
  const who = target && target.name ? (target.family ? fullName(target) : target.name) : null;
  logEvent(world, 'miracle', `${world.players[pid]?.name || me.name}'s ${P.name}${who ? ' upon ' + who : ''}.`, { nationId: me.id, x: tx, y: ty, power: P.id });
  emitFx(world, { type: 'power', power: P.id, x: tx, y: ty, r: P.radius || (s ? s.radius : 1.5), nationId: me.id, pid: target?.look ? target.id : undefined });
  return { ok: true };
}
