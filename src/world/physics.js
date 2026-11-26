// Surface water flow and wildfire. Both run only on "hot" chunks (near settlements and
// player cameras) so a whole planet stays cheap while the places you look at feel alive.
import { BIOMES, F, B } from '../data/biomes.js';
import { cellAt, windAt, tempAt } from './atmosphere.js';
import { wrap } from '../core/util.js';

export const CHUNK = 32;

function neighbors4(i, W, H) {
  const x = i % W, y = (i / W) | 0;
  return [y * W + wrap(x + 1, W), y * W + wrap(x - 1, W), y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
}

/** Rain fills low ground, water runs downhill, pools, soaks in and evaporates. Floods hurt crops and huts. */
export function stepWater(world, dt, hotChunks) {
  const t = world.tiles, a = world.atmo, { W, H } = t;
  const act = world.waterActive;
  // rain input (hot chunks only), plus river overflow during heavy rain
  for (const ck of hotChunks) {
    const cx = ck % Math.ceil(W / CHUNK), cy = Math.floor(ck / Math.ceil(W / CHUNK));
    for (let s = 0; s < 24; s++) { // stochastic sampling keeps cost flat
      const x = cx * CHUNK + ((Math.random() * CHUNK) | 0), y = cy * CHUNK + ((Math.random() * CHUNK) | 0);
      if (y >= H) continue;
      const i = y * W + wrap(x, W), b = t.biome[i];
      if (BIOMES[b].water) continue;
      const p = a.precip[cellAt(a, x, y)];
      if (p < 0.08 || tempAt(a, t, i) < 0) continue;
      const add = p * dt * (t.river[i] ? 18 : 9);
      t.water[i] += add; act.add(i);
    }
  }
  const out = [];
  for (const i of act) {
    let w = t.water[i];
    if (w <= 0.005) { t.water[i] = 0; out.push(i); continue; }
    const lvl = t.height[i] * 12 + w;
    let moved = 0;
    for (const j of neighbors4(i, W, H)) {
      if (j < 0) continue;
      const bj = BIOMES[t.biome[j]];
      if (bj.water) { const d = Math.min(w - moved, w * 0.5 * dt * 20); moved += d; continue; } // drains into sea/lake
      const lj = t.height[j] * 12 + t.water[j];
      if (lvl > lj + 0.01) {
        const d = Math.min((lvl - lj) * 0.25, (w - moved) * 0.25) * Math.min(1, dt * 30);
        if (d > 0) { t.water[j] += d; moved += d; act.add(j); }
      }
    }
    w -= moved;
    const temp = tempAt(a, t, i);
    w -= dt * (0.25 + Math.max(0, temp) * 0.03) * (t.feat[i] === F.ROCK ? 0.3 : 1); // soak + evaporate
    t.water[i] = Math.max(0, w);
    if (t.water[i] <= 0.005) { t.water[i] = 0; out.push(i); }
  }
  for (const i of out) act.delete(i);
  if (act.size > 60000) { // safety valve for extreme storms
    let k = 0; for (const i of act) { if (k++ % 2) { t.water[i] = 0; act.delete(i); } }
  }
}

const fuelOf = (t, i) => {
  const f = t.feat[i];
  if (f === F.TREE) return 1;
  if (f === F.BUILDING) return 0.7;
  if (f === F.FARM || f === F.CROP_READY || f === F.BERRY) return 0.6;
  if (t.burnt[i]) return 0;
  const b = t.biome[i];
  if (b === B.PLAINS || b === B.SAVANNA) return 0.22;
  if (b === B.FOREST || b === B.TAIGA || b === B.JUNGLE) return 0.35;
  return 0;
};

export function ignite(world, i, intensity = 120) {
  const t = world.tiles;
  if (BIOMES[t.biome[i]].water || t.water[i] > 0.3) return false;
  if (fuelOf(t, i) <= 0) return false;
  t.fire[i] = Math.max(t.fire[i], intensity); world.fireActive.add(i); world.dirty.add(i);
  return true;
}

/** Fire spreads downwind through fuel, is quenched by rain and standing water. Returns burnt buildings. */
export function stepFire(world, dt, rng, events) {
  const t = world.tiles, a = world.atmo, { W, H } = t;
  const out = [];
  for (const i of world.fireActive) {
    const x = i % W, y = (i / W) | 0;
    const c = cellAt(a, x, y);
    let f = t.fire[i];
    const rain = a.precip[c] + (t.water[i] > 0.1 ? 1 : 0) + a.snow[c] * 0.5;
    f += (fuelOf(t, i) * 60 - rain * 260 - 18) * dt * 4;
    // consume fuel
    if (rng.chance(dt * 3)) {
      if (t.feat[i] === F.TREE || t.feat[i] === F.BERRY) { if (t.featHp[i] > 1) t.featHp[i]--; else { t.feat[i] = F.STUMP; t.featHp[i] = 0; } world.dirty.add(i); }
      else if (t.feat[i] === F.FARM || t.feat[i] === F.CROP_READY) { t.feat[i] = F.NONE; t.crop[i] = 0; world.dirty.add(i); }
      else if (t.feat[i] === F.BUILDING) events.push({ type: 'buildingBurn', i, dmg: 12 });
      else { t.burnt[i] = 255; world.dirty.add(i); } // ground cover consumed
    }
    // spread, biased downwind
    const [u, v] = windAt(a, x, y);
    const ws = Math.hypot(u, v) + 0.01;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ny = y + oy; if (ny < 0 || ny >= H) continue;
      const j = ny * W + wrap(x + ox, W);
      if (t.fire[j] > 0) continue;
      const along = (ox * u + oy * v) / (ws * Math.hypot(ox, oy));
      const p = fuelOf(t, j) * (f / 255) * dt * 1.6 * (1 + Math.max(0, along) * Math.min(ws / 6, 4)) * (1 - Math.min(1, rain));
      if (p > 0 && rng.chance(p)) ignite(world, j, 90);
    }
    t.fire[i] = Math.max(0, Math.min(255, f));
    if (t.fire[i] <= 0) { out.push(i); world.dirty.add(i); }
  }
  for (const i of out) world.fireActive.delete(i);
}
