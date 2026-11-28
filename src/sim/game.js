// The authoritative simulation loop (runs on the host / in singleplayer).
// One fixed tick = 1/300 of a day. Real time -> world time via the shared speed setting,
// so in co-op every player sees the same clock: the host's.
import { stepAtmosphere } from '../world/atmosphere.js';
import { stepWater, stepFire, CHUNK } from '../world/physics.js';
import { stepPawn, goTo, walk, marchToward } from './ai.js';
import { stepHealth } from './health.js';
import { addThought, fullName, computeFx, relationLabel, isChild, AGE } from './pawn.js';
import { stepSettlement, stepNation, spawnNomads } from './nation.js';
import { stepDiplomacy, stepWarfare } from './war.js';
import { stepAnimals } from './animals.js';
import { stepStoryteller, stepWorldAge, handleWorldEvents } from './events.js';
import { applyCommand, refreshBuffs } from './commands.js';
import { buildSpatial, logEvent, emitFx, pawnsNear, DAY_SECONDS } from './world.js';
import { pawnAttack } from './combat.js';
import { stepDrops, dropItem } from './items.js';
import { DAY_LEN } from '../core/time.js';
import { dist, wrap } from '../core/util.js';
import { BIOMES, F } from '../data/biomes.js';
import { nationMults } from './nation.js';

export const TICK = 1 / 300;

export class Game {
  constructor(world) {
    this.world = world;
    this.rng = world.rng;
    this.acc = 0;
    this.events = [];
    this.listeners = new Set();
  }
  /** Advance by real seconds. Returns ticks simulated. */
  update(realDt, budgetTicks = 90) {
    const w = this.world;
    if (w.paused) return 0;
    this.acc += (realDt * w.speed) / DAY_SECONDS;
    let n = 0;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    while (this.acc >= TICK && n < budgetTicks) { this.step(TICK); this.acc -= TICK; n++; if (t0 && (n & 3) === 0 && performance.now() - t0 > 40) break; } // never freeze a frame
    if (this.acc > TICK * budgetTicks) this.acc = 0; // drop backlog if the machine can't keep up
    return n;
  }
  command(pid, cmd) { return applyCommand(this.world, pid, cmd, this.rng); }

  step(dt) {
    const w = this.world, rng = this.rng;
    w.time += dt; w.tick++;
    const tick = w.tick;
    if (tick % 30 === 1) this.computeHot();
    buildSpatial(w);
    // index pawns by settlement / nation
    for (const s of Object.values(w.settlements)) s._pawns = [];
    for (const n of Object.values(w.nations)) n._pawns = [];
    for (const p of Object.values(w.pawns)) {
      if (p.dead) continue;
      const s = w.settlements[p.settlementId]; if (s) s._pawns.push(p);
      const n = w.nations[p.nationId]; if (n) n._pawns.push(p);
    }
    const events = this.events; events.length = 0; w.events = events;

    if (tick % 5 === 0) stepAtmosphere(w.atmo, w, dt * 5, rng, events);
    if (tick % 3 === 0) stepWater(w, dt * 3, w.hot);
    if (tick % 2 === 0) stepFire(w, dt * 2, rng, events);

    // pawns
    const mults = {};
    for (const n of Object.values(w.nations)) mults[n.id] = nationMults(w, n);
    for (const p of Object.values(w.pawns)) {
      if (p.dead) { if (w.time - p.diedAt > 1.5) delete w.pawns[p.id]; continue; }
      p.age += (dt / w.yearLen) * (p.age < 16 ? 3 : 1); // childhood passes quickly: children come of age in about five years
      const s = w.settlements[p.settlementId], n = w.nations[p.nationId];
      const ctx = { rng, s, n, inBed: p.bedIn >= 0, envStress: p._env, researchMult: mults[p.nationId]?.researchMult || 1, glitterMult: mults[p.nationId]?.glitterMult || 1 };
      if (tick % 3 === 0) {
        const cause = stepHealth(p, dt * 3, rng, ctx);
        if (ctx.recompute) computeFx(p);
        if (cause) { this.kill(p, cause); continue; }
        if (p.age > p.lifespan && rng.chance(dt * 3 * 0.5)) { this.kill(p, 'Old age'); continue; }
        // moods
        const nm = mults[p.nationId]?.moodBonus || 0;
        import_updateMood(p, w.time, dt * 3, nm);
      }
      if (tick % 30 === 0 && p.buff.fxOn) refreshBuffs(w, p); // expire/re-apply divine buffs (haste, ward, fervor...)
      if (p.carry) { // never lug a basket around forever: empty ones vanish, stale loads are set down for the haulers
        const amt = p.carry.amt + (p.carry.extra || []).reduce((a, e) => a + e[1], 0);
        if (!(amt > 0.01) && !p.carry.site) p.carry = null;
        else if (p.carry._t === undefined) p.carry._t = w.time;
        else if (w.time - p.carry._t > 1.5 * DAY_LEN || p.dead || p.raider) {
          const c = p.carry; p.carry = null;
          if (c.item) dropItem(w, c.item, c.amt, p.x, p.y);
          for (const [id, k] of c.extra || []) dropItem(w, id, k, p.x, p.y);
          if (c.hide) dropItem(w, 'hide', c.hide, p.x, p.y);
        }
      }
      if (p.heldBy) { if (p.dead || !w.players?.[p.heldBy]) p.heldBy = null; else { p.state = 'held'; p.moving = false; continue; } } // lifted by a deity's hand
      if (p.raider) { this.stepRaider(p, dt); continue; }
      if (!s && !p.possessedBy && !p.squad) { // homeless wanderer: rejoin nearest settlement of own nation
        const home = Object.values(w.settlements).find((x) => x.nationId === p.nationId);
        if (home) p.settlementId = home.id;
      }
      if (p.squad && !p.possessedBy && !p.downed) continue; // squads are driven by war.js
      stepPawn(w, p, dt, ctx);
      if (p.age >= AGE.CHILD && p.age - dt / w.yearLen < AGE.CHILD) logEvent(w, 'social', `${fullName(p)} came of age.`, { pid: p.id, nationId: p.nationId });
    }
    stepWarfare(w, dt, rng);
    stepAnimals(w, dt, rng, w.hot);

    for (const s of Object.values(w.settlements)) stepSettlement(w, s, dt, rng);
    if (tick % 10 === 0) for (const n of Object.values(w.nations)) if (!n.raider) stepNation(w, n, dt * 10, rng);
    if (tick % 30 === 0) stepDiplomacy(w, dt * 30, rng);
    if (tick % 10 === 0) { stepStoryteller(w, dt * 10, rng); stepWorldAge(w, dt * 10, rng); }
    if (tick % 60 === 0) {
      const living = Object.values(w.nations).filter((n) => !n.dead && !n.raider).length;
      if (living < (w.settings?.maxNations || 14) && rng.chance(dt * 60 * 0.08)) spawnNomads(w, rng);
    }
    if (tick % 15 === 0) this.regrow(dt * 15);
    if (tick % 60 === 0 && w.raiderNationId) { // marauders gone -> the raid is over
      const rid = w.raiderNationId;
      if (!Object.values(w.pawns).some((p) => p.nationId === rid && !p.dead)) for (const n of Object.values(w.nations)) if (n.relations[rid]?.state === 'war') n.relations[rid].state = 'peace';
    }
    if (tick % 30 === 0) stepDrops(w);
    handleWorldEvents(w, events, rng);
    if (w.fx.length > 400) w.fx.splice(0, w.fx.length - 400);
  }

  computeHot() {
    const w = this.world, CW = Math.ceil(w.W / CHUNK);
    w.hot = new Set();
    const add = (x, y, r = 1) => { const cx = Math.floor(wrap(x, w.W) / CHUNK), cy = Math.floor(y / CHUNK); for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) { const yy = cy + oy; if (yy < 0 || yy * CHUNK >= w.H) continue; w.hot.add(yy * CW + wrap(cx + ox, CW)); } };
    for (const s of Object.values(w.settlements)) add(s.x, s.y, s.radius > 16 ? 1 : 0);
    for (const h of Object.values(w.cameraHints || {})) if (h && h.zoom > 6) add(h.x, h.y, 1);
  }

  /** Nature reclaims: stumps sprout, bushes and trees spread into wild land near people. */
  regrow(dt) {
    const w = this.world, t = w.tiles, rng = this.rng, CW = Math.ceil(w.W / CHUNK);
    for (const ck of w.hot) {
      for (let k = 0; k < 6; k++) {
        const x = (ck % CW) * CHUNK + rng.int(0, CHUNK - 1), y = Math.floor(ck / CW) * CHUNK + rng.int(0, CHUNK - 1);
        if (y >= w.H) continue;
        const i = y * w.W + wrap(x, w.W), bm = BIOMES[t.biome[i]];
        const eco = t.owner[i] >= 0 ? 1 + Math.max(0, w.nations[t.owner[i]]?.ideology.nature || 0) / 100 : 1.5;
        if (t.feat[i] === F.STUMP && rng.chance(dt * 0.8 * eco)) { t.feat[i] = F.TREE; t.featHp[i] = 3; w.dirty.add(i); }
        else if (t.feat[i] === F.NONE && !bm.water && t.bld[i] < 0 && rng.chance(dt * 1.2 * eco)) {
          const r = rng.next();
          if (r < (bm.berry || 0) * 2) { t.feat[i] = F.BERRY; t.featHp[i] = 4; w.dirty.add(i); }
          else if (t.owner[i] < 0) {
            let nb = 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const yy = y + oy; if (yy >= 0 && yy < w.H && t.feat[yy * w.W + wrap(x + ox, w.W)] === F.TREE) nb++; }
            const crowd = [[1, 1], [-1, -1], [1, -1], [-1, 1]].some(([ox, oy]) => { const yy = y + oy; return yy >= 0 && yy < w.H && t.feat[yy * w.W + wrap(x + ox, w.W)] === F.TREE; });
            if (nb <= 2 && !crowd && r < (bm.tree || 0) * nb * 0.05) { t.feat[i] = F.TREE; t.featHp[i] = 3; w.dirty.add(i); } // forests spread slowly and keep gaps
          }
        } else if (t.feat[i] === F.BERRY && t.featHp[i] < 6 && rng.chance(dt * 2)) t.featHp[i]++;
        if (t.burnt[i] > 0) { t.burnt[i] = Math.max(0, t.burnt[i] - Math.ceil(dt * 120 * eco)); if (!t.burnt[i]) w.dirty.add(i); }
        if (t.pollution[i] > 0) t.pollution[i] = Math.max(0, t.pollution[i] - Math.ceil(dt * 20 * eco));
      }
    }
  }

  kill(p, cause) {
    const w = this.world;
    p.dead = true; p.diedAt = w.time; p.deathCause = cause; p.state = 'dead'; p.possessedBy = null; p.job = null;
    const n = w.nations[p.nationId]; if (n) n.stats.deaths++;
    emitFx(w, { type: 'death', pid: p.id, x: p.x, y: p.y, ix: (Math.random() - 0.5) * 3, iy: -2 });
    if (p.bedIn >= 0 && w.buildings[p.bedIn]) w.buildings[p.bedIn].patients = (w.buildings[p.bedIn].patients || []).filter((id) => id !== p.id);
    // relationships grieve
    for (const q of pawnsNear(w, p.x, p.y, 10)) if (q !== p && !q.dead) addThought(q, 'sawDeath', w.time);
    for (const [id, op] of Object.entries(p.rel)) {
      const q = w.pawns[id]; if (!q || q.dead) continue;
      const lbl = relationLabel(q, p);
      if (['Spouse', 'Mother', 'Father', 'Son', 'Daughter', 'Brother', 'Sister', 'Lover'].includes(lbl)) addThought(q, 'familyDied', w.time);
      else if ((q.rel[p.id] || 0) > 25) addThought(q, 'friendDied', w.time);
    }
    for (const id of [...p.children, ...p.parents]) { const q = w.pawns[id]; if (q && !q.dead) addThought(q, 'familyDied', w.time); }
    const sp = w.pawns[p.spouse]; if (sp) { sp.spouse = -1; }
    const lv = w.pawns[p.lover]; if (lv) lv.lover = -1;
    if (!p.raider) logEvent(w, 'death', `${fullName(p)} died (${cause}) aged ${Math.floor(p.age)}.`, { pid: p.id, nationId: p.nationId, x: p.x, y: p.y, leader: n?.leaderId === p.id });
  }

  stepRaider(p, dt) {
    const w = this.world, rng = this.rng, s = w.settlements[p.raider.sid];
    if (p.downed) return;
    if (!s || w.time > p.raider.until) { // retreat, then vanish
      p.state = 'walk'; marchToward(w, p, p.x + (p.x > (s?.x ?? 0) ? 30 : -30), p.y, dt);
      if (w.time > p.raider.until + 0.6) { delete w.pawns[p.id]; }
      return;
    }
    const foe = pawnsNear(w, p.x, p.y, 9).find((q) => !q.dead && !q.downed && q.nationId !== p.nationId);
    if (foe) {
      if (dist(p.x, p.y, foe.x, foe.y, w.W) > 1.2) { if ((p._repath = (p._repath || 0) - dt) <= 0) { p._repath = 0.02; goTo(w, p, foe.x, foe.y, 400); } p.state = 'walk'; walk(w, p, dt); }
      else { p.state = 'fight'; p.path = null; if ((p._atk = (p._atk || 0) - dt) <= 0) { p._atk = 0.03; pawnAttack(w, p, foe, rng); } }
      return;
    }
    if (dist(p.x, p.y, s.x, s.y, w.W) > 2.5) { p.state = 'walk'; marchToward(w, p, s.x, s.y, dt); }
    else if (rng.chance(dt * 4)) { const k = Math.min(3, s.stock.food); s.stock.food -= k; if (rng.chance(0.2)) w.events.push({ type: 'razed', x: s.x + rng.range(-4, 4), y: s.y + rng.range(-4, 4) }); }
  }
}

// small indirection so the import cycle stays clean
import { updateMood as import_updateMood } from './pawn.js';
