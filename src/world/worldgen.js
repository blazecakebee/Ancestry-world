// Procedural globe generator. The map is an equirectangular W x H grid that wraps east-west.
// Every tile is sampled from 3D noise on the unit sphere, so continents are seamless and
// poles are not stretched artifacts. Deterministic for a given seed (multiplayer clients
// regenerate the same world from the seed and only receive tile diffs).
import { Noise3 } from '../core/noise.js';
import { RNG } from '../core/rng.js';
import { B, BIOMES, F, isWater } from '../data/biomes.js';
import { clamp } from '../core/util.js';

export const DEFAULT_W = 512, DEFAULT_H = 256;

export function tileLatLon(x, y, W, H) {
  const lat = Math.PI / 2 - ((y + 0.5) / H) * Math.PI; // +north at top
  const lon = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
  return [lat, lon];
}

export function generateWorld(seed, W = DEFAULT_W, H = DEFAULT_H, opts = {}) {
  const N = W * H;
  const rng = new RNG(seed);
  const nH = new Noise3(seed ^ 0x1234), nM = new Noise3(seed ^ 0x5678), nR = new Noise3(seed ^ 0x9abc), nC = new Noise3(seed ^ 0xdef0), nI = new Noise3(seed ^ 0x2468);
  const landFrac = opts.landFraction ?? 0.36;

  const height = new Float32Array(N), moist = new Float32Array(N), baseTemp = new Float32Array(N);
  const biome = new Uint8Array(N), feat = new Uint8Array(N), featHp = new Uint8Array(N), river = new Uint8Array(N);
  const owner = new Int16Array(N).fill(-1), bld = new Int32Array(N).fill(-1), crop = new Uint8Array(N);
  const water = new Float32Array(N), burnt = new Uint8Array(N), fire = new Uint8Array(N), snow = new Uint8Array(N), pollution = new Uint8Array(N);
  const rift = new Float32Array(N);

  // 1) Elevation from layered noise on the sphere
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [lat, lon] = tileLatLon(x, y, W, H);
      const cx = Math.cos(lat) * Math.cos(lon), cy = Math.sin(lat), cz = Math.cos(lat) * Math.sin(lon);
      const cont = nC.fbm(cx * 1.1 + 7, cy * 1.1, cz * 1.1, 4); // continent mask
      const detail = nH.fbm(cx * 3 + 3, cy * 3, cz * 3, 6);
      const ridge = nR.ridged(cx * 2.2, cy * 2.2, cz * 2.2, 5);
      let h = cont * 1.25 + detail * 0.55 + Math.max(0, ridge - 0.62) * 1.4 * (cont > -0.05 ? 1 : 0.3);
      // tropical archipelagos: island noise in warm oceans
      const isl = nI.fbm(cx * 9, cy * 9, cz * 9, 3);
      if (Math.abs(lat) < 0.5 && isl > 0.33) h += (isl - 0.33) * 1.6;
      const i = y * W + x;
      height[i] = h;
      rift[i] = ridge;
      moist[i] = nM.fbm(cx * 2.5 + 11, cy * 2.5, cz * 2.5, 5);
    }
  }
  // 2) Normalize so `landFrac` of tiles are above sea level (0)
  const sorted = Float32Array.from(height).sort();
  const sea = sorted[Math.floor(N * (1 - landFrac))];
  const top = sorted[N - 1];
  const bottom = sorted[0];
  for (let i = 0; i < N; i++) {
    const h = height[i];
    height[i] = h >= sea ? (h - sea) / (top - sea) : -((sea - h) / (sea - bottom)); // land 0..1, sea -1..0
  }

  // 3) Distance to ocean (for moisture) via multi-source BFS
  const distSea = new Int16Array(N).fill(-1);
  const q = new Int32Array(N); let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (height[i] < 0) { distSea[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const i = q[qh++], x = i % W, y = (i / W) | 0, d = distSea[i];
    if (d > 60) continue;
    const nb = [y * W + ((x + 1) % W), y * W + ((x - 1 + W) % W), y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of nb) if (j >= 0 && distSea[j] < 0) { distSea[j] = d + 1; q[qt++] = j; }
  }

  // 4) Temperature & moisture -> biome
  for (let y = 0; y < H; y++) {
    const [lat] = tileLatLon(0, y, W, H);
    const latF = Math.abs(Math.sin(lat));
    for (let x = 0; x < W; x++) {
      const i = y * W + x, h = height[i];
      let t = 29 - 45 * Math.pow(latF, 2.2) - Math.max(0, h) * 30;
      baseTemp[i] = t;
      const ds = distSea[i] < 0 ? 60 : distSea[i];
      // Hadley-cell dryness around 25-30 degrees, wet tropics
      const latDeg = Math.abs(lat * 180 / Math.PI);
      const belt = latDeg < 12 ? 0.35 : latDeg < 35 ? -0.25 * Math.sin((latDeg - 12) / 23 * Math.PI) : latDeg < 65 ? 0.12 : -0.05;
      let m = moist[i] * 1.1 + belt + 0.18 - ds * 0.008;
      moist[i] = clamp(m, -1, 1.2);

      let b;
      if (h < 0) {
        if (h < -0.45) b = B.DEEP; else if (h < -0.08) b = B.OCEAN; else b = B.SHALLOW;
        if (latF > 0.99) b = B.ICE; // sea ice
      } else {
        const r = rift[i];
        if (latF > 0.975 || t < -16) b = B.ICE;
        else if (h > 0.62) b = t < -2 ? B.PEAK : B.MOUNTAIN;
        else if (h > 0.45) b = t < -6 ? B.PEAK : B.MOUNTAIN;
        else if (r > 0.9 && h > 0.12 && moist[i] < 0.4) b = B.VOLCANIC;
        else if (h < 0.025 && distSea[i] <= 2) b = t > 8 ? B.BEACH : B.TUNDRA;
        else if (t < -6) b = B.TUNDRA;
        else if (t < 3) b = m > 0.05 ? B.TAIGA : B.TUNDRA;
        else if (t < 17) b = m > 0.5 ? B.SWAMP : m > 0.15 ? B.FOREST : m > -0.25 ? B.PLAINS : B.DESERT;
        else b = m > 0.45 ? B.JUNGLE : m > 0.1 ? (h < 0.06 && m > 0.62 ? B.SWAMP : B.SAVANNA) : m > -0.15 ? B.SAVANNA : B.DESERT;
        // small tropical islands
        if (b !== B.BEACH && Math.abs(lat) < 0.5 && distSea[i] <= 4 && countLand(height, i, W, H, 5) < 14 && t > 15) b = B.ARCHIPELAGO;
      }
      biome[i] = b;
    }
  }

  // 5) Inland lakes in basins
  for (let i = 0; i < N; i++) {
    if (height[i] > 0 && height[i] < 0.12 && moist[i] > 0.55 && distSea[i] > 6 && biome[i] !== B.ICE) {
      biome[i] = B.LAKE; height[i] = -0.02;
    }
  }

  // 6) Rivers: trace downhill from wet highlands
  const riverRng = rng.fork(7);
  for (let k = 0; k < Math.floor(N / 900); k++) {
    let i = riverRng.int(0, N - 1);
    if (height[i] < 0.35 || moist[i] < 0.1 || biome[i] === B.ICE) continue;
    for (let steps = 0; steps < 400; steps++) {
      river[i] = 1;
      const x = i % W, y = (i / W) | 0;
      let best = -1, bh = height[i];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + oy; if (ny < 0 || ny >= H) continue;
        const j = ny * W + ((x + ox + W) % W);
        const hj = height[j] + (river[j] ? -0.01 : 0);
        if (hj < bh) { bh = hj; best = j; }
      }
      if (best < 0) { if (height[i] > 0) { biome[i] = B.LAKE; } break; }
      i = best;
      if (height[i] < 0 || isWater(biome[i])) break;
      height[i] = Math.max(0.001, height[i] - 0.004); // carve
    }
  }

  // 7) Features: trees, rocks, ore, berries
  const fr = rng.fork(11);
  for (let i = 0; i < N; i++) {
    const bm = BIOMES[biome[i]];
    if (bm.water || river[i]) continue;
    const r = fr.next();
    let acc = 0;
    if (r < (acc += bm.tree || 0)) { feat[i] = F.TREE; featHp[i] = fr.int(3, 6); }
    else if (r < (acc += bm.rock || 0)) { feat[i] = F.ROCK; featHp[i] = fr.int(4, 10); }
    else if (r < (acc += bm.ore || 0)) { feat[i] = F.ORE; featHp[i] = fr.int(6, 14); }
    else if (r < (acc += bm.berry || 0)) { feat[i] = F.BERRY; featHp[i] = fr.int(3, 6); }
  }

  return { W, H, N, seed, height, moist, baseTemp, biome, feat, featHp, river, owner, bld, crop, water, burnt, fire, snow, pollution, distSea };
}

function countLand(height, i, W, H, r) {
  const x0 = i % W, y0 = (i / W) | 0; let c = 0;
  for (let oy = -r; oy <= r; oy += 2) for (let ox = -r; ox <= r; ox += 2) {
    const y = y0 + oy; if (y < 0 || y >= H) continue;
    if (height[y * W + ((x0 + ox + W) % W)] > 0) c++;
  }
  return c;
}

/** Choose well-spread habitable start positions. */
export function findStartSites(tiles, count, seed) {
  const { W, H, biome, river } = tiles;
  const rng = new RNG(seed ^ 0xabcdef);
  const good = [B.PLAINS, B.FOREST, B.SAVANNA, B.JUNGLE, B.TAIGA, B.ARCHIPELAGO];
  const cands = [];
  for (let tries = 0; tries < 20000 && cands.length < 400; tries++) {
    const x = rng.int(0, W - 1), y = rng.int(Math.floor(H * 0.15), Math.floor(H * 0.85));
    const i = y * W + x;
    if (!good.includes(biome[i])) continue;
    // score: habitable neighborhood + fresh water nearby
    let land = 0, waterNear = 0;
    for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
      const yy = y + oy; if (yy < 0 || yy >= H) continue;
      const j = yy * W + ((x + ox + W) % W);
      if (good.includes(biome[j])) land++;
      if (river[j] || biome[j] === B.LAKE || biome[j] === B.SHALLOW) waterNear++;
    }
    if (land < 55) continue;
    cands.push({ x, y, score: land + Math.min(waterNear, 8) * 3 });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = [];
  const minD = Math.min(W, H) * 0.28;
  for (const c of cands) {
    if (out.every((o) => Math.hypot(Math.min(Math.abs(o.x - c.x), W - Math.abs(o.x - c.x)), o.y - c.y) > minD)) out.push(c);
    if (out.length >= count) break;
  }
  // fall back to closer spacing if needed
  for (const c of cands) { if (out.length >= count) break; if (!out.includes(c)) out.push(c); }
  return out;
}
