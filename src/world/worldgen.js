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

// Each world rolls its own character from the seed, so no two planets feel alike: how much land, how big and ragged the
// continents are, how tall the mountains, how warm and wet the climate, where the thermal equator sits and how far the ice reaches.
const ARCHETYPES = [
  { id: 'scattered', name: 'Scattered Continents', w: 3, land: [0.32, 0.42], cf: [0.95, 1.35], detail: [0.3, 0.5], ridge: [1.6, 2.8], temp: [-2, 3], moist: [-0.1, 0.1], isl: [0.3, 0.9] },
  { id: 'super', name: 'Supercontinent', w: 1.4, land: [0.38, 0.5], cf: [0.55, 0.78], detail: [0.25, 0.42], ridge: [1.8, 3.2], temp: [-1, 4], moist: [-0.15, 0.05], isl: [0.1, 0.5] },
  { id: 'archipelago', name: 'Archipelago World', w: 2, land: [0.26, 0.34], cf: [1.8, 2.5], detail: [0.4, 0.6], ridge: [1.0, 2.0], temp: [0, 5], moist: [0.0, 0.2], isl: [1.2, 2.0] },
  { id: 'water', name: 'Waterworld', w: 0.8, land: [0.16, 0.22], cf: [1.5, 2.1], detail: [0.4, 0.6], ridge: [0.8, 1.8], temp: [0, 4], moist: [0.05, 0.25], isl: [1.2, 2.0] },
  { id: 'highland', name: 'Highlands', w: 1.4, land: [0.35, 0.44], cf: [0.9, 1.3], detail: [0.3, 0.45], ridge: [3.3, 4.5], temp: [-3, 1], moist: [-0.05, 0.1], isl: [0.2, 0.6] },
  { id: 'iceage', name: 'Ice Age', w: 1.1, land: [0.3, 0.42], cf: [0.9, 1.3], detail: [0.3, 0.5], ridge: [1.8, 3.0], temp: [-10, -6], moist: [-0.1, 0.05], isl: [0.2, 0.6], cap: [0.925, 0.955] },
  { id: 'hothouse', name: 'Hothouse', w: 1.1, land: [0.3, 0.42], cf: [0.9, 1.4], detail: [0.3, 0.5], ridge: [1.4, 2.4], temp: [6, 10], moist: [0.1, 0.3], isl: [0.5, 1.2], cap: [0.994, 1.01] },
  { id: 'dust', name: 'Dust World', w: 1.1, land: [0.36, 0.48], cf: [0.8, 1.2], detail: [0.3, 0.5], ridge: [1.6, 2.8], temp: [2, 7], moist: [-0.38, -0.22], isl: [0.2, 0.6] },
  { id: 'verdant', name: 'Verdant World', w: 1.1, land: [0.34, 0.44], cf: [0.95, 1.4], detail: [0.3, 0.5], ridge: [1.4, 2.6], temp: [1, 5], moist: [0.22, 0.38], isl: [0.4, 1.0] },
  { id: 'fire', name: 'Ring of Fire', w: 1, land: [0.3, 0.4], cf: [1.1, 1.6], detail: [0.35, 0.5], ridge: [2.8, 4.0], temp: [-1, 3], moist: [-0.05, 0.1], isl: [1.2, 1.9], volc: [4, 9] },
];
function rollWorld(seed, opts) {
  const r = new RNG(seed ^ 0xa11ce5);
  const pick = r.weighted(ARCHETYPES.map((a) => [a, a.w]));
  const arch = (opts.archetype && ARCHETYPES.find((a) => a.id === opts.archetype)) || pick;
  const u = (rg) => r.range(rg[0], rg[1]);
  return {
    archetype: arch.name, archId: arch.id,
    land: opts.landFraction ?? u(arch.land), cf: u(arch.cf), detail: u(arch.detail), ridge: u(arch.ridge), ridgeFreq: r.range(1.6, 2.6),
    warp: r.range(0.14, 0.34), temp: u(arch.temp), moist: u(arch.moist), tilt: r.range(-0.3, 0.3), moistFreq: r.range(2.0, 3.2),
    isl: u(arch.isl), islLat: r.range(-0.75, 0.75), islWidth: r.range(0.25, 0.5),
    capN: (arch.cap ? u(arch.cap) : r.range(0.972, 0.999)), capS: (arch.cap ? u(arch.cap) : r.range(0.972, 0.999)),
    volc: arch.volc ? Math.round(u(arch.volc)) : r.int(0, 4), lakes: r.int(0, 30), flatBias: r.range(0, 1),
    bloom: r.range(-0.12, 0.25), fen: r.range(-0.12, 0.2), autumn: r.range(-0.1, 0.2), steppe: r.range(-0.15, 0.2),
  };
}

export function generateWorld(seed, W = DEFAULT_W, H = DEFAULT_H, opts = {}) {
  const N = W * H;
  const rng = new RNG(seed);
  const P = rollWorld(seed, opts);
  const nH = new Noise3(seed ^ 0x1234), nM = new Noise3(seed ^ 0x5678), nR = new Noise3(seed ^ 0x9abc), nC = new Noise3(seed ^ 0xdef0), nI = new Noise3(seed ^ 0x2468), nW = new Noise3(seed ^ 0x6b6b), nB = new Noise3(seed ^ 0x77aa), nS = new Noise3(seed ^ 0x3131), nP = new Noise3(seed ^ 0x5151);
  const landFrac = P.land;

  const height = new Float32Array(N), moist = new Float32Array(N), baseTemp = new Float32Array(N);
  const biome = new Uint8Array(N), feat = new Uint8Array(N), featHp = new Uint8Array(N), river = new Uint8Array(N);
  const owner = new Int16Array(N).fill(-1), bld = new Int32Array(N).fill(-1), crop = new Uint8Array(N);
  const water = new Float32Array(N), burnt = new Uint8Array(N), fire = new Uint8Array(N), snow = new Uint8Array(N), pollution = new Uint8Array(N);
  const rift = new Float32Array(N);
  // a random rotation of the sphere per world, so features do not sit at the same latitudes every time
  const rot = rng.fork(3), ra = rot.range(0, Math.PI * 2), rb = rot.range(-0.6, 0.6);
  const ca = Math.cos(ra), sa = Math.sin(ra), cb = Math.cos(rb), sb = Math.sin(rb);
  const spin = (x, y, z) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca; return [x1, y * cb - z1 * sb, y * sb + z1 * cb]; };

  // 1) Elevation from layered noise on the sphere
  const cfq = P.cf, wq = P.warp, mf = P.moistFreq;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [lat, lon] = tileLatLon(x, y, W, H);
      const cx0 = Math.cos(lat) * Math.cos(lon), cy0 = Math.sin(lat), cz0 = Math.cos(lat) * Math.sin(lon);
      const [cx, cy, cz] = spin(cx0, cy0, cz0);
      // domain warp: bends coastlines and ranges into believable, organic shapes instead of round noise blobs
      const ux = cx + nW.fbm(cx * 1.6 + 3, cy * 1.6, cz * 1.6, 3) * wq, uy = cy + nW.fbm(cx * 1.6, cy * 1.6 + 5, cz * 1.6, 3) * wq, uz = cz + nW.fbm(cx * 1.6, cy * 1.6 + 9, cz * 1.6 + 4, 3) * wq;
      const cont = nC.fbm(ux * cfq + 7, uy * cfq, uz * cfq, 4); // continent mask
      const detail = nH.fbm(ux * 3 + 3, uy * 3, uz * 3, 5);
      const ridge = nR.ridged(ux * P.ridgeFreq, uy * P.ridgeFreq, uz * P.ridgeFreq, 5);
      // mountain ranges grow along ridge lines in continental interiors, with foothills stepping down on both sides
      const inl = Math.min(1, Math.max(0, (cont + 0.02) / 0.3)), inland = inl * inl * (3 - 2 * inl);
      let h = cont * 1.3 + detail * P.detail + Math.max(0, ridge - 0.56) * P.ridge * inland + Math.max(0, ridge - 0.38) * 0.5 * inland;
      // island arcs: chains of small islands off the continents, plus a tropical archipelago belt at a random latitude
      const chain = nS.ridged(ux * 3.6, uy * 3.6, uz * 3.6, 4);
      if (cont < 0.12 && chain > 0.74 - P.isl * 0.04) h += (chain - 0.74 + P.isl * 0.04) * 2.2 * Math.min(1.5, P.isl);
      const isl = nI.fbm(cx * 9, cy * 9, cz * 9, 3);
      if (Math.abs(lat - P.islLat) < P.islWidth && isl > 0.42 - P.isl * 0.07) h += (isl - 0.42 + P.isl * 0.07) * 1.6;
      const i = y * W + x;
      height[i] = h;
      rift[i] = ridge;
      moist[i] = nM.fbm(cx * mf + 11, cy * mf, cz * mf, 5);
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
  // 2b) Gentle coast smoothing: blur only near sea level so shorelines become flowing curves (interiors keep their detail)
  for (let pass = 0; pass < 3; pass++) {
    const src = Float32Array.from(height);
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, h0 = src[i]; if (h0 > 0.1 || h0 < -0.1) continue;
      const xl = y * W + ((x + W - 1) % W), xr = y * W + ((x + 1) % W);
      const avg = (src[xl] + src[xr] + src[i - W] + src[i + W]) * 0.125 + (src[i - W - 1 + (x === 0 ? W : 0)] + src[i - W + 1 - (x === W - 1 ? W : 0)] + src[i + W - 1 + (x === 0 ? W : 0)] + src[i + W + 1 - (x === W - 1 ? W : 0)]) * 0.0625 + h0 * 0.25;
      height[i] = avg;
    }
  }
  // 2c) Tidy: majority filter on the land mask, then drop specks of land and fill specks of sea
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(height);
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (Math.abs(src[i]) > 0.06) continue;
      let l = 0; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && src[(y + oy) * W + ((x + ox + W) % W)] > 0) l++;
      if (src[i] > 0 && l <= 2) height[i] = -0.01; else if (src[i] <= 0 && l >= 6) height[i] = 0.01;
    }
  }
  {
    const minLand = P.isl > 1.1 ? 5 : 14, minSea = 6, seen = new Uint8Array(N), stack = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0]) continue; const landc = height[s0] > 0; seen[s0] = 1; stack.length = 0; stack.push(s0); const comp = [];
      while (stack.length) {
        const i = stack.pop(); comp.push(i); const x = i % W, y = (i / W) | 0;
        for (const j of [y * W + (x + 1) % W, y * W + (x - 1 + W) % W, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !seen[j] && (height[j] > 0) === landc) { seen[j] = 1; stack.push(j); }
        if (comp.length > 60) { /* big enough: keep scanning the rest cheaply */ }
      }
      if (landc && comp.length < minLand) for (const i of comp) height[i] = -0.01 - Math.abs(height[i]) * 0.5;
      else if (!landc && comp.length < minSea) { const y = (comp[0] / W) | 0; if (y > 2 && y < H - 3) for (const i of comp) height[i] = 0.01; }
    }
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
  const fl = P.flatBias, mtnLo = 0.62 - 0.035 * P.ridge, mtnHi = mtnLo + 0.17;
  for (let y = 0; y < H; y++) {
    const [lat] = tileLatLon(0, y, W, H);
    const latT = lat - P.tilt; // the thermal equator is not always the geographic one
    const latF = Math.abs(Math.sin(latT)), latG = Math.abs(Math.sin(lat));
    const capLat = lat >= 0 ? P.capN : P.capS;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, h = height[i];
      let t = 30 + P.temp - 45 * Math.pow(latF, 2.4) - Math.max(0, h) * 24;
      baseTemp[i] = t;
      const ds = distSea[i] < 0 ? 60 : distSea[i];
      // Hadley-cell dryness around 25-30 degrees, wet tropics
      const latDeg = Math.abs(latT * 180 / Math.PI);
      const belt = latDeg < 12 ? 0.35 : latDeg < 35 ? -0.25 * Math.sin((latDeg - 12) / 23 * Math.PI) : latDeg < 65 ? 0.12 : -0.05;
      let m = moist[i] * 1.1 + belt + 0.18 - ds * 0.008 + P.moist;
      moist[i] = clamp(m, -1, 1.2);

      const [lat2, lon2] = tileLatLon(x, y, W, H), bcx = Math.cos(lat2) * Math.cos(lon2), bcy = Math.sin(lat2), bcz = Math.cos(lat2) * Math.sin(lon2);
      const bn = nB.fbm(bcx * 3.2 + 5, bcy * 3.2, bcz * 3.2, 3); // patchiness: breaks big biome bands into believable regions
      const pn = nP.fbm(bcx * 4.4 + 2, bcy * 4.4, bcz * 4.4 + 1, 3); // second patch field for flats, fens and groves
      // the ice cap edge wanders instead of following a latitude line
      const capEdge = capLat + pn * 0.018;
      let b;
      if (h < 0) {
        if (h < -0.45) b = B.DEEP; else if (h < -0.08) b = B.OCEAN; else b = B.SHALLOW;
        if (latG > capEdge + 0.02) b = B.ICE; // sea ice
      } else {
        const r = rift[i];
        if (latG > capEdge || t < -21) b = B.ICE;
        else if (h > mtnHi) b = t < -2 ? B.PEAK : B.MOUNTAIN;
        else if (h > mtnLo) b = t < -6 ? B.PEAK : B.MOUNTAIN;
        else if (t > 19 && m > 0.2 && h < 0.05 && distSea[i] >= 1 && distSea[i] <= 3 && bn > -0.15) b = B.MANGROVE;
        else if (h < 0.025 && distSea[i] <= 2) b = t > 1 ? B.BEACH : B.TUNDRA;
        else if (t < -6) b = B.TUNDRA;
        else if (t < 3) b = m > -0.3 ? B.TAIGA : (bn > -P.steppe ? B.STEPPE : B.TUNDRA);
        else if (t < 17) {
          if (m > 0.5) b = bn > 0.18 - P.fen ? B.GLOWFEN : B.SWAMP;
          else if (m > 0.15) {
            if (h > 0.3 && t < 11) b = B.ALPINE;
            else if (m > 0.34 && ds <= 22 && t > 7 && bn > -0.1) b = B.RAINFOREST;
            else if (bn > 0.3 - P.bloom) b = B.BLOSSOM;
            else if (t < 10 && bn < -0.05 + P.autumn) b = B.AUTUMN;
            else b = B.FOREST;
          } else if (m > -0.25) b = h > 0.3 && t < 12 ? B.ALPINE : (m < -0.02 && t < 12 && bn > -0.1 - P.steppe ? B.STEPPE : B.PLAINS);
          else b = m < -0.3 && h < 0.1 && pn > 0.1 - fl * 0.25 ? B.SALTFLAT : B.DESERT;
        } else if (m > 0.34) b = B.JUNGLE;
        else if (m > 0.1) b = h < 0.06 && m > 0.62 ? B.SWAMP : B.SAVANNA;
        else if (m > -0.15) b = bn < -0.2 + P.steppe * 0.5 ? B.STEPPE : B.SAVANNA;
        else b = bn > 0.1 - P.steppe * 0.3 ? B.BADLANDS : (m < -0.35 && h < 0.1 && pn > 0.1 - fl * 0.25 ? B.SALTFLAT : B.DESERT);
        // small tropical islands
        if (b !== B.BEACH && distSea[i] <= 4 && countLand(height, i, W, H, 5) < 14 && t > 15) b = B.ARCHIPELAGO;
      }
      biome[i] = b;
    }
  }
  // 4a) Volcanoes: a per-world handful of cones on high ground, each with a scorched halo
  {
    const vr = rng.fork(21); let placed = 0;
    for (let tries = 0; tries < 6000 && placed < P.volc * Math.max(1, N / 131072); tries++) {
      const i = vr.int(0, N - 1), h = height[i], b = biome[i];
      if (h < 0.25 || b === B.ICE || BIOMES[b].water) continue;
      if (rift[i] < 0.55) continue;
      const x0 = i % W, y0 = (i / W) | 0, rad = vr.int(1, 2);
      for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) { if (ox * ox + oy * oy > rad * rad + 1) continue; const y = y0 + oy; if (y < 0 || y >= H) continue; const j = y * W + ((x0 + ox + W) % W); if (!BIOMES[biome[j]].water && biome[j] !== B.ICE) biome[j] = B.VOLCANIC; }
      placed++;
    }
  }

  // 4b) Smooth the biome map: lone tiles and thin speckles adopt their commonest neighbour, and ashlands spread around volcanic rifts
  for (let pass = 0; pass < 2; pass++) {
    const out = Uint8Array.from(biome);
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, b = biome[i]; if (BIOMES[b].water || b === B.VOLCANIC) continue;
      const cnt = {}; let same = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue; const nb = biome[(y + oy) * W + ((x + ox + W) % W)];
        if (nb === b) same++; else if (!BIOMES[nb].water) cnt[nb] = (cnt[nb] || 0) + 1;
      }
      if (same > 3) continue;
      let best = -1, bc = 3; for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; best = +k; }
      if (best >= 0) out[i] = best;
    }
    biome.set(out);
  }
  for (let i = 0; i < N; i++) {
    if (biome[i] !== B.VOLCANIC) continue;
    const x0 = i % W, y0 = (i / W) | 0;
    for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
      if (ox * ox + oy * oy > 18) continue; const y = y0 + oy; if (y < 0 || y >= H) continue;
      const j = y * W + ((x0 + ox + W) % W), bj = biome[j];
      if (BIOMES[bj].water || bj === B.VOLCANIC || bj === B.MOUNTAIN || bj === B.PEAK || bj === B.ICE) continue;
      if (((x0 + ox) * 7 + y * 13) % 5 < 4) biome[j] = B.ASHLAND;
    }
  }

  // 5) Inland lakes: a per-world number of noisy blobs in low inland basins, plus any very wet hollows
  {
    const lr = rng.fork(5); const want = Math.round(P.lakes * N / 131072 * (0.5 + Math.max(0, 0.5 + P.moist * 1.5)));
    let made = 0;
    for (let tries = 0; tries < 4000 && made < want; tries++) {
      const i = lr.int(0, N - 1), x0 = i % W, y0 = (i / W) | 0;
      if (height[i] <= 0.01 || height[i] > 0.22 || distSea[i] < 7 || [B.ICE, B.DESERT, B.VOLCANIC, B.MOUNTAIN, B.PEAK].includes(biome[i])) continue;
      const rad = lr.int(2, 5);
      for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
        const d = Math.hypot(ox, oy) + (lr.next() - 0.5) * 1.4; if (d > rad) continue; const y = y0 + oy; if (y < 1 || y >= H - 1) continue;
        const j = y * W + ((x0 + ox + W) % W); if (BIOMES[biome[j]].water || biome[j] === B.ICE) continue;
        biome[j] = B.LAKE; height[j] = -0.02;
      }
      made++;
    }
    for (let i = 0; i < N; i++) if (height[i] > 0 && height[i] < 0.12 && moist[i] > 0.55 && distSea[i] > 6 && biome[i] !== B.ICE && biome[i] !== B.VOLCANIC) { biome[i] = B.LAKE; height[i] = -0.02; }
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
  const TREE_DENSITY = 0.5;
  const fr = rng.fork(11);
  for (let i = 0; i < N; i++) {
    const bm = BIOMES[biome[i]];
    if (bm.water || river[i]) continue;
    const r = fr.next();
    let acc = 0;
    // trees: well under half the old density, and never crowding the tile above/left of them, so forests read as
    // groves with room between the trunks instead of one stacked carpet of canopies
    const crowded = (i % W > 0 && feat[i - 1] === F.TREE) || (i >= W && feat[i - W] === F.TREE) || (i >= W + 1 && feat[i - W - 1] === F.TREE);
    if (r < (acc += (bm.tree || 0) * TREE_DENSITY)) { if (!crowded || fr.next() < 0.12) { feat[i] = F.TREE; featHp[i] = fr.int(3, 6); } }
    else if (r < (acc += bm.rock || 0)) { feat[i] = F.ROCK; featHp[i] = fr.int(4, 10); }
    else if (r < (acc += bm.ore || 0)) { feat[i] = F.ORE; featHp[i] = fr.int(6, 14); }
    else if (r < (acc += bm.berry || 0)) { feat[i] = F.BERRY; featHp[i] = fr.int(3, 6); }
  }

  return { W, H, N, seed, height, moist, baseTemp, biome, feat, featHp, river, owner, bld, crop, water, burnt, fire, snow, pollution, distSea, meta: { archetype: P.archetype, temp: Math.round(P.temp), moist: +P.moist.toFixed(2), land: +P.land.toFixed(2), capN: +P.capN.toFixed(3), capS: +P.capS.toFixed(3), tilt: +P.tilt.toFixed(2) } };
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
  const good = [B.PLAINS, B.FOREST, B.SAVANNA, B.JUNGLE, B.TAIGA, B.ARCHIPELAGO, B.STEPPE, B.BLOSSOM, B.AUTUMN, B.RAINFOREST, B.ALPINE];
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
