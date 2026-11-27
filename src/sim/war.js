// Diplomacy and warfare. AI nations form opinions from borders, ideology and incidents; they ally,
// declare wars, raid and conquer. Player nations only go to war when their deity chooses to.
import { AXES } from '../data/society.js';
import { pawnAttack } from './combat.js';
import { goTo, walk, marchToward } from './ai.js';
import { logEvent, emitFx, pawnsNear, settlementBuildings, bCenter } from './world.js';
import { addThought, fullName } from './pawn.js';
import { dist, clamp } from '../core/util.js';
import { eraOf } from '../data/eras.js';

export function rel(n, otherId) {
  if (!n.relations[otherId]) n.relations[otherId] = { state: 'peace', opinion: 0, since: 0 };
  return n.relations[otherId];
}

export function setWar(world, a, b, why = '') {
  rel(a, b.id).state = 'war'; rel(b, a.id).state = 'war';
  rel(a, b.id).since = rel(b, a.id).since = world.time;
  // break alliances with the enemy and drag allies in
  logEvent(world, 'war', `${a.name} declared war on ${b.name}${why ? ' — ' + why : ''}!`, { nationId: a.id, big: true });
  for (const n of Object.values(world.nations)) {
    if (n.dead || n === a || n === b) continue;
    if (rel(n, b.id).state === 'ally' && n.ai && rel(n, a.id).state !== 'ally') { rel(n, a.id).state = 'war'; rel(a, n.id).state = 'war'; logEvent(world, 'war', `${n.name} joined the war to defend its ally ${b.name}.`, { nationId: n.id }); }
  }
}
export function setPeace(world, a, b) {
  rel(a, b.id).state = 'peace'; rel(b, a.id).state = 'peace';
  rel(a, b.id).opinion = Math.max(rel(a, b.id).opinion, -20); rel(b, a.id).opinion = Math.max(rel(b, a.id).opinion, -20);
  a.warWeary = 0; b.warWeary = 0;
  for (const sq of Object.values(world.squads || {})) if ((sq.nationId === a.id && sq.targetNation === b.id) || (sq.nationId === b.id && sq.targetNation === a.id)) disband(world, sq);
  logEvent(world, 'peace', `${a.name} and ${b.name} made peace.`, { nationId: a.id, big: true });
}
export function setAlliance(world, a, b) {
  rel(a, b.id).state = 'ally'; rel(b, a.id).state = 'ally';
  logEvent(world, 'peace', `${a.name} and ${b.name} formed an alliance.`, { nationId: a.id, big: true });
}

function borderContact(world, a, b) {
  for (const sa of Object.values(world.settlements)) if (sa.nationId === a.id)
    for (const sb of Object.values(world.settlements)) if (sb.nationId === b.id && dist(sa.x, sa.y, sb.x, sb.y, world.W) < sa.radius + sb.radius + 10) return true;
  return false;
}

/** Daily diplomacy for all nations. */
export function stepDiplomacy(world, dt, rng) {
  const ns = Object.values(world.nations).filter((n) => !n.dead);
  const chaos = world.age?.id === 'chaos' ? 2 : 1;
  for (const a of ns) for (const b of ns) {
    if (a === b) continue;
    const r = rel(a, b.id);
    if (r.state !== 'war' && !borderContact(world, a, b) && r.opinion > -10) { r.opinion += (0 - r.opinion) * 0.05 * dt; continue; }
    const ideoDiff = AXES.reduce((s, ax) => s + Math.abs(a.ideology[ax.id] - b.ideology[ax.id]), 0) / AXES.length; // 0..200
    const target = 30 - ideoDiff * 0.6 - (borderContact(world, a, b) ? 15 * chaos : 0) + (a.ideology.war > 30 ? 15 : 0) - (a.ideology.war < -30 ? 10 : 0);
    r.opinion = clamp(r.opinion + (target - r.opinion) * 0.08 * dt + rng.range(-1, 1) * dt * 4, -100, 100);
    if (!a.ai) continue; // players decide their own wars and treaties
    if (r.state === 'peace' && r.opinion < -55 && a.ideology.war < 10 && a.era >= 0 && rng.chance(0.08 * dt * chaos)) {
      const myPow = (a._pawns || []).filter((p) => p.role === 'soldier').length, theirPow = (b._pawns || []).filter((p) => p.role === 'soldier').length;
      if (myPow >= theirPow * 0.8 && !(b.ownerId && world.settings?.peacefulAI)) setWar(world, a, b, rng.pick(['border disputes', 'an insulted envoy', 'heresy', 'stolen cattle', 'a royal grudge', 'ancient grievances']));
    } else if (r.state === 'war') {
      a.warWeary += dt * 0.5;
      if (a.warWeary > 10 && b.ai && rng.chance(0.08 * dt)) setPeace(world, a, b);
      else if (a.warWeary > 14 && !b.ai) { if (!b.proposals.some((p) => p.from === a.id && p.kind === 'peace')) { b.proposals.push({ from: a.id, kind: 'peace', t: world.time }); logEvent(world, 'peace', `${a.name} sues for peace with ${b.name}.`, { nationId: b.id }); } }
    } else if (r.state === 'peace' && r.opinion > 65 && rel(b, a.id).opinion > 55 && b.ai && rng.chance(0.04 * dt)) setAlliance(world, a, b);
  }
}

// ---------------- squads & raids ----------------
export function stepWarfare(world, dt, rng) {
  world.squads = world.squads || {};
  // form raids
  for (const n of Object.values(world.nations)) {
    if (n.dead) continue;
    for (const [oid, r] of Object.entries(n.relations)) {
      if (r.state !== 'war') continue;
      const enemy = world.nations[oid]; if (!enemy || enemy.dead) continue;
      const busy = Object.values(world.squads).some((s) => s.nationId === n.id);
      if (busy || !rng.chance(dt * (n.ai ? 0.35 : n.laws.raids === false ? 0 : 0.3))) continue;
      const home = Object.values(world.settlements).filter((s) => s.nationId === n.id).sort((a, b) => b.pop - a.pop)[0];
      const targets = Object.values(world.settlements).filter((s) => s.nationId === enemy.id);
      if (!home || !targets.length) continue;
      const tgt = targets.sort((a, b) => dist(a.x, a.y, home.x, home.y, world.W) - dist(b.x, b.y, home.x, home.y, world.W))[0];
      if (dist(tgt.x, tgt.y, home.x, home.y, world.W) > 140) continue;
      const members = (home._pawns || []).filter((p) => p.role === 'soldier' && !p.downed && !p.possessedBy && p.age >= 16);
      if (members.length < 3) continue;
      const id = world.nextId.event++;
      world.squads[id] = { id, nationId: n.id, targetNation: enemy.id, targetSid: tgt.id, homeSid: home.id, members: members.map((p) => p.id), started: world.time, stage: 'march' };
      for (const p of members) { p.squad = id; p.job = { type: 'raid', squad: id }; p.path = null; }
      logEvent(world, 'war', `An army of ${members.length} from ${home.name} (${n.name}) marches on ${tgt.name}!`, { nationId: n.id, x: home.x, y: home.y, targetNation: enemy.id });
    }
  }
  for (const sq of Object.values(world.squads)) stepSquad(world, sq, dt, rng);
  // defenders respond to nearby enemies
  for (const p of Object.values(world.pawns)) {
    if (p.dead || p.downed || p.possessedBy || p.squad || p.brk) continue;
    if (p.job?.type === 'fight') continue;
    if (p.role !== 'soldier' && !(p.age >= 16 && p.traits.includes('bloodthirsty'))) continue;
    if ((p._scan = (p._scan || 0) + dt) < 0.03) continue;
    p._scan = 0;
    const n = world.nations[p.nationId]; if (!n) continue;
    const foe = pawnsNear(world, p.x, p.y, 12).find((q) => !q.dead && !q.downed && rel(n, q.nationId).state === 'war');
    if (foe) { p.job = { type: 'fight', pid: foe.id }; p.path = null; }
  }
}

function disband(world, sq) {
  for (const id of sq.members) { const p = world.pawns[id]; if (p) { p.squad = null; p.job = null; } }
  delete world.squads[sq.id];
}

function stepSquad(world, sq, dt, rng) {
  const n = world.nations[sq.nationId], enemy = world.nations[sq.targetNation], tgt = world.settlements[sq.targetSid];
  sq.members = sq.members.filter((id) => world.pawns[id] && !world.pawns[id].dead);
  if (!n || n.dead || !tgt || tgt.nationId !== sq.targetNation || rel(n, sq.targetNation).state !== 'war') return disband(world, sq);
  const fit = sq.members.map((id) => world.pawns[id]).filter((p) => !p.downed);
  if (fit.length === 0 || world.time - sq.started > 12) {
    logEvent(world, 'war', `The raid on ${tgt.name} has ${fit.length ? 'withdrawn' : 'been broken'}.`, { nationId: n.id });
    return disband(world, sq);
  }
  const defenders = (tgt._pawns || []).filter((p) => !p.dead && !p.downed && p.age >= 16 && (p.role === 'soldier' || p.traits.includes('bloodthirsty') || p.possessedBy));
  for (const p of fit) {
    if (p.possessedBy || p.heldBy) continue;
    p.state = 'walk';
    const w = eraOf(p.gearEra).weapon, reach = w.ranged ? w.range * 0.8 : 1.2;
    const foes = pawnsNear(world, p.x, p.y, 10).filter((q) => !q.dead && !q.downed && q.nationId === sq.targetNation);
    const foe = foes.sort((a, b) => (b.role === 'soldier') - (a.role === 'soldier'))[0];
    if (foe) {
      if (dist(p.x, p.y, foe.x, foe.y, world.W) > reach) { if (!p.path || rng.chance(dt * 30)) { if ((p._repath = (p._repath || 0) - dt) <= 0) { p._repath = 0.02; goTo(world, p, foe.x, foe.y, 600); } } walk(world, p, dt); }
      else { p.path = null; p.state = 'fight'; if ((p._atk = (p._atk || 0) - dt) <= 0) { p._atk = 0.025; if (pawnAttack(world, p, foe, rng) && (foe.downed || foe.hp < 10)) { p.kills++; if (p.kills >= 3 && !p.traits.includes('veteran')) { p.traits.push('veteran'); } } } }
      continue;
    }
    // march toward the target's centre
    if (dist(p.x, p.y, tgt.x, tgt.y, world.W) > 3) marchToward(world, p, tgt.x + rng.range(-1, 1), tgt.y + rng.range(-1, 1), dt);
    else if (p.traits.includes('bloodthirsty') || p.traits.includes('pyromaniac')) { // raze
      if (rng.chance(dt * 0.5)) { const b = settlementBuildings(world, tgt).find((b) => b.type !== 'center'); if (b) { const [bx, by] = bCenter(b); world.events?.push({ type: 'razed', x: bx, y: by }); } }
    }
  }
  // conquest when the attackers hold the centre with no defenders standing
  const atCentre = fit.filter((p) => dist(p.x, p.y, tgt.x, tgt.y, world.W) < 5).length;
  if (atCentre >= Math.max(2, fit.length * 0.5) && defenders.length === 0) {
    sq.hold = (sq.hold || 0) + dt;
    if (sq.hold > 0.6) conquer(world, tgt, n, enemy, rng), disband(world, sq);
  } else sq.hold = 0;
}

export function conquer(world, s, winner, loser, rng) {
  s.nationId = winner.id; s.capital = false;
  for (const p of s._pawns || []) { p.nationId = winner.id; if (p.role === 'soldier') p.role = 'citizen'; addThought(p, 'friendDied', world.time, 0.7); }
  for (let i = 0; i < world.tiles.N; i++) if (world.tiles.owner[i] === loser.id && dist(i % world.W, (i / world.W) | 0, s.x, s.y, world.W) <= s.radius + 1) { world.tiles.owner[i] = winner.id; world.dirty.add(i); }
  winner.stats.kills++;
  logEvent(world, 'war', `${winner.name} conquered ${s.name} from ${loser.name}!`, { nationId: winner.id, x: s.x, y: s.y, big: true });
  emitFx(world, { type: 'conquest', x: s.x, y: s.y, nationId: winner.id });
  if (loser.capitalId === s.id) {
    const other = Object.values(world.settlements).find((o) => o.nationId === loser.id);
    if (other) { loser.capitalId = other.id; other.capital = true; }
  }
}
