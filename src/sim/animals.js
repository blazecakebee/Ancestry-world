// Wildlife: herds graze, predators hunt the lonely, megafauna roam the Stone Age.
import { ANIMALS, animalAttack } from './combat.js';
import { tileCost } from './pathfind.js';
import { pawnsNear, emitFx } from './world.js';
import { wrap, dist, dx } from '../core/util.js';
import { CHUNK } from '../world/physics.js';
import { ANIMAL_DROPS } from '../data/items.js';
import { dropItem } from './items.js';

// ---- wildlife population ----
const CELL = 8;                       // spatial cell (tiles) used for mate and crowding checks
const SLICE = 10;                     // animals away from people and cameras update once every SLICE ticks
const lifeOf = (A) => 40 + 22 * (A.size || 1);          // days; a game year is 12 days
const MATURE = 6, BREED_CD = 5;                          // days to adulthood / between litters
const spawnable = (world, i) => world.tiles.owner[i] === -1 && tileCost(world.tiles, i) > 0 && !world.tiles.river[i];
const NATURAL = Object.entries(ANIMALS).filter(([, a]) => a.biomes.length);

function landCount(world) {
  if (world._land) return world._land;
  let n = 0; const t = world.tiles; for (let i = 0; i < t.biome.length; i++) if (tileCost(t, i) > 0) n++;
  return (world._land = n);
}
/** How many wild animals the planet should hold (about one herd per ~250 land tiles, capped so huge planets stay fast). */
export const wildTarget = (world) => Math.min(1400, Math.round(landCount(world) / 650 * 3.4));

function pickKind(biome, rng) {
  let tot = 0; for (const [, a] of NATURAL) if (a.biomes.includes(biome)) tot += a.w;
  if (!tot) return null; let r = rng.next() * tot;
  for (const [k, a] of NATURAL) if (a.biomes.includes(biome)) { r -= a.w; if (r <= 0) return k; }
  return null;
}
function addAnimal(world, rng, kind, x, y, age) {
  const A = ANIMALS[kind], id = world.nextId.animal++;
  world.animals[id] = { id, kind, x, y, hp: A.hp, dead: false, facing: rng.chance(0.5) ? 1 : -1, vx: 0, vy: 0, t: rng.next() * 3, age: age ?? rng.range(MATURE, lifeOf(A) * 0.6), bcd: rng.range(0, BREED_CD * 2.4) };
  const kc = world._kc || (world._kc = {}); kc[kind] = (kc[kind] || 0) + 1;
  return id;
}
/** Drop one herd on a random free tile. Returns the number of animals made. */
export function spawnHerd(world, rng, tries = 30) {
  const W = world.W, H = world.H, t = world.tiles;
  for (let k = 0; k < tries; k++) {
    const x = rng.int(0, W - 1), y = rng.int(2, H - 3), i = y * W + x;
    if (!spawnable(world, i)) continue;
    const kind = pickKind(t.biome[i], rng); if (!kind) continue;
    if ((world._kc?.[kind] || 0) > wildTarget(world) * (ANIMALS[kind].predator ? 0.06 : 0.17)) continue; // no single species floods the map
    const A = ANIMALS[kind], n = rng.int(A.herd[0], A.herd[1]);
    for (let j = 0; j < n; j++) {
      const ax = wrap(x + rng.range(-2, 2), W), ay = Math.min(H - 2, Math.max(1, y + rng.range(-2, 2)));
      if (spawnable(world, Math.floor(ay) * W + Math.floor(ax)) && A.biomes.includes(t.biome[Math.floor(ay) * W + Math.floor(ax)])) addAnimal(world, rng, kind, ax, ay);
    }
    return n;
  }
  return 0;
}
/** Fill the world with wildlife (new worlds, and old saves that have none). */
export function seedWildlife(world, rng, count = Math.round(wildTarget(world) * 0.7)) {
  world._kc = {}; for (const a of Object.values(world.animals)) world._kc[a.kind] = (world._kc[a.kind] || 0) + 1;
  let made = 0; for (let guard = 0; made < count && guard < count * 6; guard++) made += spawnHerd(world, rng, 12);
  return made;
}

export function stepAnimals(world, dt, rng, hotChunks) {
  const W = world.W, t = world.tiles;
  if (!world._akinds) { world._akinds = true; for (const a of Object.values(world.animals)) if (!ANIMALS[a.kind]) delete world.animals[a.id]; } // kinds retired in v0.7
  if (!world._seeded) { world._seeded = true; const have = Object.keys(world.animals).length, want = wildTarget(world); if (have < want * 0.3) seedWildlife(world, rng, Math.round(want * 0.7) - have); }
  const tick = world._atick = ((world._atick || 0) + 1) % 1e9, CW = Math.ceil(W / CHUNK);
  // rebuild the crowding grid now and then: animals per kind per cell, for mates and carrying capacity
  if (!world._agrid || tick % 12 === 0) {
    const grid = new Map(); for (const a of Object.values(world.animals)) { if (a.dead) continue; const key = a.kind + '|' + Math.floor(a.x / CELL) + ',' + Math.floor(a.y / CELL); (grid.get(key) || grid.set(key, []).get(key)).push(a); }
    world._agrid = grid; world._kc = {}; for (const a of Object.values(world.animals)) world._kc[a.kind] = (world._kc[a.kind] || 0) + 1;
  }
  const all = Object.values(world.animals), total = all.length, cap = wildTarget(world) * 1.25;
  // a trickle of migrants refills regions that were hunted out (the whole map, not only near people)
  if (total < cap * 0.9 && rng.chance(dt * 18)) spawnHerd(world, rng, 8);
  const dayDt = dt;
  for (const a of all) {
    const A = ANIMALS[a.kind];
    // animals far from any settlement or camera only get a turn every SLICE ticks (with a longer step)
    let dt = dayDt;
    if (!a.patron && !a.angry && !hotChunks.has(Math.floor(a.y / CHUNK) * CW + Math.floor(a.x / CHUNK))) { if ((a.id + tick) % SLICE) continue; dt = dayDt * SLICE; }
    if (a.age === undefined) a.age = rng.range(MATURE, lifeOf(A) * 0.5);
    if (!a.dead) {
      a.age += dt;
      if (a.age > lifeOf(A) * (0.85 + (a.id % 7) * 0.05) && !a.patron) { delete world.animals[a.id]; continue; } // old age
      a.baby = a.age < MATURE ? 1 : 0;
      if (!a.patron && !a.baby && !A.glitter && A.biomes.length) {
        a.bcd = (a.bcd ?? 0) - dt;
        if (a.bcd <= 0 && total < cap && rng.chance(dt * 1.5)) tryBreed(world, rng, a, A, t);
      }
    }
    if (a.dead) { // an unclaimed carcass is butchered by nature: meat and hide fall where it lies (near people), then it's gone
      a.rot = (a.rot || 0) + dt;
      if (a.rot > 0.8) { const dr = ANIMAL_DROPS[a.kind]; if (dr && hotChunks.has(Math.floor(a.y / CHUNK) * CW + Math.floor(a.x / CHUNK))) { dropItem(world, dr[0], Math.ceil(dr[1] * 0.6), a.x, a.y); if (dr[3]) dropItem(world, dr[2], dr[3], a.x + 0.3, a.y); } delete world.animals[a.id]; }
      continue;
    }
    if (a.hp <= 0) {
      a.dead = true; world.fx.push({ type: 'animalDeath', aid: a.id, t: world.time });
      // spirits and slimes leave a little glitter for whoever's people felled them (player nations only)
      const killer = A.glitter && a.lastAttacker ? world.pawns[a.lastAttacker] : null, kn = killer && world.nations[killer.nationId];
      if (kn && kn.ownerId) { kn.glitter += A.glitter; emitFx(world, { type: 'glitter', x: a.x, y: a.y - 0.5, amount: Math.ceil(A.glitter) }); }
      continue;
    }
    a.moving = false;
    // hunt / defend
    let target = a.angry ? world.pawns[a.angry] : null;
    if (target && (target.dead || dist(a.x, a.y, target.x, target.y, W) > 14)) { a.angry = null; target = null; }
    if (!target && A.predator && rng.chance(dt * 0.35)) {
      const prey = pawnsNear(world, a.x, a.y, 8).filter((p) => !p.dead && p.nationId !== a.patron && !((world.nations[p.nationId]?._pawns?.length ?? 99) < 5)); // wild predators leave a tiny founding band alone until it has 5 people // summoned beasts spare their patron's people
      if (prey.length === 1 || (prey.length && prey.length < 3 && rng.chance(0.3))) { a.angry = prey[0].id; target = prey[0]; }
    }
    if (target) {
      const d = dist(a.x, a.y, target.x, target.y, W);
      if (d > 1.1) move(world, a, dx(a.x, target.x, W) / d, (target.y - a.y) / d, A.speed * 1.2 * dt);
      else if ((a._atk = (a._atk || 0) - dt) <= 0) { a._atk = 0.04; animalAttack(world, a, target, rng); if (target.downed && A.predator) a.angry = null; }
      continue;
    }
    // flee from people
    const near = pawnsNear(world, a.x, a.y, 4)[0];
    if (near && !A.predator && !A.friendly) { const d = Math.max(0.1, dist(a.x, a.y, near.x, near.y, W)); move(world, a, -dx(a.x, near.x, W) / d, -(near.y - a.y) / d, A.speed * dt); continue; }
    // graze & wander
    a.t -= dt;
    if (a.t <= 0) { a.t = rng.range(0.05, 0.25); const ang = rng.next() * Math.PI * 2; a.vx = rng.chance(0.4) ? 0 : Math.cos(ang); a.vy = rng.chance(0.4) ? 0 : Math.sin(ang); }
    if (a.vx || a.vy) move(world, a, a.vx, a.vy, A.speed * 0.35 * dt);
    if (A.glitter && !a.patron && rng.chance(dt * 0.4)) emitFx(world, { type: 'glitter', x: a.x, y: a.y - 0.6, amount: 0 }); // wisps and slimes shimmer
  }
}

/** Two adults of a kind close together, room in the neighbourhood and a fitting biome: a litter is born. */
function tryBreed(world, rng, a, A, t) {
  const bi = t.biome[Math.floor(a.y) * world.W + Math.floor(a.x)]; if (!A.biomes.includes(bi)) { a.bcd = 2; return; }
  const cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL); let mate = null, crowd = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const l = world._agrid.get(a.kind + '|' + wrap(cx + ox, Math.ceil(world.W / CELL)) + ',' + (cy + oy)); if (!l) continue;
    crowd += l.length;
    if (!mate) for (const o of l) if (o !== a && !o.dead && !o.baby && o.age >= MATURE && !o.patron && dist(a.x, a.y, o.x, o.y, world.W) < 4) { mate = o; break; }
  }
  if (!mate || crowd > (A.size > 1.5 ? 4 : A.predator ? 5 : 12)) { a.bcd = 1.5; return; }
  a.bcd = BREED_CD * rng.range(0.8, 1.3); mate.bcd = Math.max(mate.bcd ?? 0, 2);
  const n = Math.min(A.litter, rng.int(1, A.litter));
  for (let k = 0; k < n; k++) { const x = wrap(a.x + rng.range(-0.8, 0.8), world.W), y = Math.min(world.H - 2, Math.max(1, a.y + rng.range(-0.8, 0.8))); if (spawnable(world, Math.floor(y) * world.W + Math.floor(x))) { const id = addAnimal(world, rng, a.kind, x, y, 0); world.animals[id].baby = 1; } }
}

function move(world, a, ux, uy, step) {
  const nx = wrap(a.x + ux * step, world.W), ny = Math.min(world.H - 1, Math.max(1, a.y + uy * step));
  const i = Math.floor(ny) * world.W + Math.floor(nx);
  const A = ANIMALS[a.kind], own = world.tiles.owner[i], cost = tileCost(world.tiles, i);
  // wild beasts keep to unowned land; summoned ones may also roam their patron's land; spirits and birds go anywhere on land
  if (cost > 0 && (own === -1 || a.angry || A.float || (a.patron && own === a.patron))) { a.x = nx; a.y = ny; a.moving = true; }
  else { a.vx = -a.vx; a.vy = -a.vy; }
  if (ux) a.facing = ux > 0 ? 1 : -1;
}
