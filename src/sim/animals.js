// Wildlife: herds graze, predators hunt the lonely, megafauna roam the Stone Age.
import { ANIMALS, animalAttack } from './combat.js';
import { tileCost } from './pathfind.js';
import { pawnsNear } from './world.js';
import { wrap, dist, dx } from '../core/util.js';
import { CHUNK } from '../world/physics.js';

export function stepAnimals(world, dt, rng, hotChunks) {
  const W = world.W, t = world.tiles;
  const all = Object.values(world.animals);
  // keep a population near hot chunks
  if (all.length < 40 + hotChunks.size * 2 && rng.chance(dt * 25) && hotChunks.size) {
    const ck = [...hotChunks][rng.int(0, hotChunks.size - 1)], CW = Math.ceil(W / CHUNK);
    const x = (ck % CW) * CHUNK + rng.int(0, CHUNK - 1), y = Math.floor(ck / CW) * CHUNK + rng.int(0, CHUNK - 1);
    if (y > 0 && y < world.H) {
      const i = y * W + wrap(x, W), b = t.biome[i];
      if (t.owner[i] === -1 && tileCost(t, i) > 0) {
        const eraMin = Math.min(...Object.values(world.nations).filter((n) => !n.dead).map((n) => n.era), 9);
        const kinds = Object.entries(ANIMALS).filter(([k, a]) => a.biomes.includes(b) && (!a.era0 || eraMin <= 1));
        if (kinds.length) {
          const [kind, A] = rng.pick(kinds);
          const herd = A.predator ? rng.int(1, 3) : rng.int(2, 5);
          for (let k = 0; k < herd; k++) { const id = world.nextId.animal++; world.animals[id] = { id, kind, x: x + rng.range(-1.5, 1.5), y: y + rng.range(-1.5, 1.5), hp: A.hp, dead: false, facing: 1, vx: 0, vy: 0, t: rng.next() * 5 }; }
        }
      }
    }
  }
  for (const a of all) {
    const A = ANIMALS[a.kind];
    if (a.dead) { a.rot = (a.rot || 0) + dt; if (a.rot > 3) delete world.animals[a.id]; continue; }
    if (a.hp <= 0) { a.dead = true; world.fx.push({ type: 'animalDeath', aid: a.id, t: world.time }); continue; }
    a.moving = false;
    // hunt / defend
    let target = a.angry ? world.pawns[a.angry] : null;
    if (target && (target.dead || dist(a.x, a.y, target.x, target.y, W) > 14)) { a.angry = null; target = null; }
    if (!target && A.predator && rng.chance(dt * 0.35)) {
      const prey = pawnsNear(world, a.x, a.y, 8).filter((p) => !p.dead);
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
    if (near && !A.predator) { const d = Math.max(0.1, dist(a.x, a.y, near.x, near.y, W)); move(world, a, -dx(a.x, near.x, W) / d, -(near.y - a.y) / d, A.speed * dt); continue; }
    // graze & wander
    a.t -= dt;
    if (a.t <= 0) { a.t = rng.range(0.05, 0.25); const ang = rng.next() * Math.PI * 2; a.vx = rng.chance(0.4) ? 0 : Math.cos(ang); a.vy = rng.chance(0.4) ? 0 : Math.sin(ang); }
    if (a.vx || a.vy) move(world, a, a.vx, a.vy, A.speed * 0.35 * dt);
    if (rng.chance(dt * 0.05)) { const ps = pawnsNear(world, a.x, a.y, 50); if (!ps.length && rng.chance(0.5)) delete world.animals[a.id]; } // despawn far from people
  }
}

function move(world, a, ux, uy, step) {
  const nx = wrap(a.x + ux * step, world.W), ny = Math.min(world.H - 1, Math.max(1, a.y + uy * step));
  const i = Math.floor(ny) * world.W + Math.floor(nx);
  if (tileCost(world.tiles, i) > 0 && world.tiles.owner[i] === -1 || tileCost(world.tiles, i) > 0 && a.angry) { a.x = nx; a.y = ny; a.moving = true; }
  else { a.vx = -a.vx; a.vy = -a.vy; }
  if (ux) a.facing = ux > 0 ? 1 : -1;
}
