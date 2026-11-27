// Planetary atmosphere simulation (inspired by RimWorld's "Atmosphere Overhaul").
// A coarse grid of air cells carries temperature, pressure, humidity and wind.
//  - The sun heats cells by latitude, season and time of day; land swings more than sea.
//  - Warm air -> low pressure; wind flows down the pressure gradient, bent by the Coriolis force.
//  - Heat and moisture are advected (carried) by the wind. Oceans and jungles evaporate.
//  - Saturated air condenses into cloud and precipitation; mountains force uplift (orographic rain).
//  - Emergent storms: thunderstorms, tropical cyclones (rotating vortices), blizzards, dust storms.
import { clamp, wrap } from '../core/util.js';
import { DAY_LEN } from '../core/time.js';
import { BIOMES, B } from '../data/biomes.js';

export const STORM = { NONE: 0, RAIN: 1, THUNDER: 2, CYCLONE: 3, BLIZZARD: 4, DUST: 5, SNOW: 6 };
export const STORM_NAMES = ['Clear', 'Rain', 'Thunderstorm', 'Cyclone', 'Blizzard', 'Dust storm', 'Snowfall'];
export const CS = 8; // tiles per air cell

const sat = (T) => 0.12 * Math.exp(0.065 * T); // saturation humidity (abstract units)

export function createAtmosphere(tiles) {
  const GW = Math.ceil(tiles.W / CS), GH = Math.ceil(tiles.H / CS), G = GW * GH;
  const a = {
    GW, GH, G,
    T: new Float32Array(G), P: new Float32Array(G), Hm: new Float32Array(G), U: new Float32Array(G), V: new Float32Array(G),
    snow: new Float32Array(G), cloud: new Float32Array(G), precip: new Float32Array(G), storm: new Uint8Array(G), anomaly: new Float32Array(G),
    base: new Float32Array(G), land: new Float32Array(G), elev: new Float32Array(G), evap: new Float32Array(G), dry: new Float32Array(G), lat: new Float32Array(G),
    vortices: [], overrides: [], t2: new Float32Array(G), h2: new Float32Array(G), nextVortexId: 1,
  };
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const c = gy * GW + gx; let sb = 0, sl = 0, se = 0, sv = 0, sd = 0, n = 0;
    for (let y = gy * CS; y < Math.min(tiles.H, gy * CS + CS); y++) for (let x = gx * CS; x < Math.min(tiles.W, gx * CS + CS); x++) {
      const i = y * tiles.W + x, b = tiles.biome[i], bm = BIOMES[b];
      sb += tiles.baseTemp[i]; n++;
      if (!bm.water) { sl++; se += Math.max(0, tiles.height[i]); }
      sv += bm.water ? 1 : b === B.JUNGLE || b === B.SWAMP ? 0.55 : b === B.FOREST ? 0.3 : 0.1;
      if (b === B.DESERT || b === B.VOLCANIC) sd++;
    }
    a.base[c] = sb / n; a.land[c] = sl / n; a.elev[c] = sl ? se / sl : 0; a.evap[c] = sv / n; a.dry[c] = sd / n;
    a.lat[c] = Math.PI / 2 - ((gy + 0.5) / GH) * Math.PI;
    a.T[c] = a.base[c]; a.Hm[c] = sat(a.base[c]) * (0.4 + 0.4 * a.evap[c]);
  }
  return a;
}

/** Sun position: returns subsolar latitude and longitude (radians) for a given world time in days. */
export function sunPosition(time, yearLen) {
  const yearFrac = (time / yearLen) % 1;
  const decl = 0.41 * Math.sin(2 * Math.PI * (yearFrac - 0.25)); // ~23.4 degrees
  const lon = Math.PI - 2 * Math.PI * ((time / DAY_LEN) % 1); // noon sweeps westward
  return { lat: decl, lon: ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI };
}

export function stepAtmosphere(a, world, dt, rng, events) {
  const { GW, GH, G } = a;
  const sun = sunPosition(world.time, world.yearLen);
  const yearFrac = (world.time / world.yearLen) % 1;
  const seasonAmp = Math.sin(2 * Math.PI * (yearFrac - 0.25));
  const cell = (gx, gy) => clamp(gy, 0, GH - 1) * GW + wrap(gx, GW);

  // zonal mean temperature per row (pressure reference)
  const rowMean = new Float32Array(GH);
  for (let gy = 0; gy < GH; gy++) { let s = 0; for (let gx = 0; gx < GW; gx++) s += a.T[gy * GW + gx]; rowMean[gy] = s / GW; }

  // 1) radiative heating & pressure
  for (let gy = 0; gy < GH; gy++) {
    const lat = a.lat[gy * GW];
    const season = 9 * Math.sign(lat) * Math.pow(Math.abs(Math.sin(lat)), 0.8) * seasonAmp;
    for (let gx = 0; gx < GW; gx++) {
      const c = gy * GW + gx;
      const lon = ((gx + 0.5) / GW) * 2 * Math.PI - Math.PI;
      // cosine of solar zenith -> day/night swing (land swings more)
      const cz = Math.sin(lat) * Math.sin(sun.lat) + Math.cos(lat) * Math.cos(sun.lat) * Math.cos(lon - sun.lon);
      const diurnal = (cz > 0 ? cz * 5 : -4) * (0.35 + 0.65 * a.land[c]);
      const target = a.base[c] + season * (0.5 + 0.5 * a.land[c]) + diurnal + a.anomaly[c];
      a.T[c] += (target - a.T[c]) * Math.min(1, dt * 3);
      const Pt = -(a.T[c] - rowMean[gy]) * 0.9 + a.elev[c] * -2;
      a.P[c] += (Pt - a.P[c]) * Math.min(1, dt * 4);
      a.anomaly[c] *= Math.max(0, 1 - dt * 0.15); // events fade
    }
  }
  // vortices (cyclones) carve deep lows
  for (const v of a.vortices) {
    const r = v.r;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const d = Math.hypot(ox, oy); if (d > r) continue;
      const c = cell(Math.round(v.x) + ox, Math.round(v.y) + oy);
      a.P[c] -= v.strength * (1 - d / r) * dt * 6;
    }
  }

  // 2) wind: prevailing bands + pressure gradient + Coriolis + friction
  for (let gy = 0; gy < GH; gy++) {
    const lat = a.lat[gy * GW], latDeg = Math.abs(lat * 57.3), ns = Math.sign(lat) || 1;
    const u0 = latDeg < 30 ? -5 : latDeg < 60 ? 6 : -3; // trades, westerlies, polar easterlies
    const v0 = latDeg < 30 ? 1.5 * ns : latDeg < 60 ? -1 * ns : 1 * ns; // + = southward (screen y)
    const f = 1.4 * Math.sin(lat);
    for (let gx = 0; gx < GW; gx++) {
      const c = gy * GW + gx;
      const gxP = a.P[cell(gx + 1, gy)] - a.P[cell(gx - 1, gy)];
      const gyP = a.P[cell(gx, gy + 1)] - a.P[cell(gx, gy - 1)];
      let u = a.U[c], v = a.V[c];
      u += (-gxP * 2.2 - f * v) * dt * 4;
      v += (-gyP * 2.2 + f * u) * dt * 4;
      const fric = 1.2 + a.land[c] * 1.5 + a.elev[c] * 3;
      u += (u0 - u) * Math.min(1, fric * dt);
      v += (v0 - v) * Math.min(1, fric * dt);
      a.U[c] = clamp(u, -45, 45); a.V[c] = clamp(v, -45, 45);
    }
  }
  // vortex rotation (counter-clockwise in the north, clockwise in the south)
  for (const v of a.vortices) {
    const r = v.r + 2;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const d = Math.hypot(ox, oy); if (d < 0.5 || d > r) continue;
      const c = cell(Math.round(v.x) + ox, Math.round(v.y) + oy);
      const spin = v.strength * 7 * (d < 1.5 ? d / 1.5 : (r - d) / (r - 1.5)) * (v.y < GH / 2 ? 1 : -1);
      a.U[c] += (oy / d) * spin * dt * 6; a.V[c] += (-ox / d) * spin * dt * 6;
    }
  }
  // divine wind overrides (Guiding Breeze)
  a.overrides = a.overrides.filter((o) => o.until > world.time);
  for (const o of a.overrides) {
    const gx0 = Math.floor(o.x / CS), gy0 = Math.floor(o.y / CS), r = Math.ceil(o.r / CS);
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const c = cell(gx0 + ox, gy0 + oy);
      a.U[c] += (o.u - a.U[c]) * Math.min(1, dt * 8); a.V[c] += (o.v - a.V[c]) * Math.min(1, dt * 8);
    }
  }

  // 3) semi-Lagrangian advection of heat & moisture
  const k = 0.05; // cells per day per wind unit
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const c = gy * GW + gx;
    const sx = gx - a.U[c] * k * dt * 10, sy = clamp(gy - a.V[c] * k * dt * 10, 0, GH - 1);
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const c00 = cell(x0, y0), c10 = cell(x0 + 1, y0), c01 = cell(x0, y0 + 1), c11 = cell(x0 + 1, y0 + 1);
    const bil = (A) => (A[c00] * (1 - fx) + A[c10] * fx) * (1 - fy) + (A[c01] * (1 - fx) + A[c11] * fx) * fy;
    a.t2[c] = bil(a.T); a.h2[c] = bil(a.Hm);
  }
  a.T.set(a.t2); a.Hm.set(a.h2);

  // 4) evaporation, condensation, precipitation, storms
  for (let c = 0; c < G; c++) {
    const gx = c % GW, gy = (c / GW) | 0;
    const T = a.T[c], s = sat(T);
    a.Hm[c] += Math.max(0, s * 0.9 - a.Hm[c]) * a.evap[c] * dt * 1.6;
    // convergence & orographic uplift lower the condensation point
    const div = (a.U[cell(gx + 1, gy)] - a.U[cell(gx - 1, gy)] + a.V[cell(gx, gy + 1)] - a.V[cell(gx, gy - 1)]) * 0.5;
    const lift = clamp(-div * 0.03 + a.elev[c] * 0.6 - a.P[c] * 0.015, -0.2, 0.55);
    const thresh = s * (1 - lift);
    let pr = 0;
    if (a.Hm[c] > thresh) { pr = (a.Hm[c] - thresh) * Math.min(1, dt * 5); a.Hm[c] -= pr; a.T[c] += pr * 6; }
    a.precip[c] += (pr / Math.max(dt, 1e-4) * 0.4 - a.precip[c]) * Math.min(1, dt * 6);
    a.cloud[c] += (clamp(a.Hm[c] / s, 0, 1.4) * 0.8 + a.precip[c] * 2 - 0.65 - a.cloud[c]) * Math.min(1, dt * 4);
    a.cloud[c] = clamp(a.cloud[c], 0, 1);

    const wind = Math.hypot(a.U[c], a.V[c]), p = a.precip[c];
    let st = STORM.NONE;
    if (a.dry[c] > 0.4 && wind > 13 && p < 0.05) st = STORM.DUST;
    else if (p > 0.05) {
      if (T < -1) st = wind > 16 ? STORM.BLIZZARD : STORM.SNOW;
      else st = p > 0.32 && T > 14 ? STORM.THUNDER : STORM.RAIN;
    }
    a.storm[c] = st;
    if (p > 0.04 && T < 0) a.snow[c] = Math.min(1, a.snow[c] + p * dt * 3);
    else if (T > 1) a.snow[c] = Math.max(0, a.snow[c] - (T - 1) * dt * 0.12);
  }
  for (const v of a.vortices) { const c = cell(Math.round(v.x), Math.round(v.y)); for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const cc = cell(Math.round(v.x) + ox, Math.round(v.y) + oy); if (a.T[cc] > -1) a.storm[cc] = STORM.CYCLONE; } a.precip[c] = Math.max(a.precip[c], 0.6); }

  // 5) cyclone lifecycle: spawn over warm tropical ocean, drift with steering winds, die over land/cold
  if (a.vortices.length < 3 && rng.chance(dt * 0.12)) {
    for (let tries = 0; tries < 20; tries++) {
      const c = rng.int(0, G - 1), latDeg = Math.abs(a.lat[c] * 57.3);
      if (a.land[c] < 0.1 && a.T[c] > 24 && latDeg > 6 && latDeg < 28) {
        const v = { id: a.nextVortexId++, x: c % GW, y: (c / GW) | 0, strength: 0.4, r: 3, life: rng.range(4, 9), age: 0 };
        a.vortices.push(v); events.push({ type: 'cyclone', x: v.x * CS, y: v.y * CS }); break;
      }
    }
  }
  for (const v of a.vortices) {
    const c = cell(Math.round(v.x), Math.round(v.y));
    v.x = wrap(v.x + a.U[c] * k * dt * 6, GW); v.y = clamp(v.y + (a.V[c] * k * 6 - Math.sign(GH / 2 - v.y) * 0.4) * dt, 1, GH - 2);
    v.age += dt;
    const warm = a.land[c] < 0.3 && a.T[c] > 22;
    v.strength = clamp(v.strength + (warm ? 0.35 : -0.6) * dt, 0, 1.6);
    v.r = 2 + Math.round(v.strength * 2);
  }
  a.vortices = a.vortices.filter((v) => v.age < v.life && v.strength > 0.05);

  // 6) lightning & gusts
  for (let c = 0; c < G; c++) {
    if ((a.storm[c] === STORM.THUNDER || a.storm[c] === STORM.CYCLONE) && rng.chance(dt * 0.12)) {
      const x = (c % GW) * CS + rng.int(0, CS - 1), y = ((c / GW) | 0) * CS + rng.int(0, CS - 1);
      events.push({ type: 'lightning', x, y });
    }
  }
}

/** Sample wind (bilinear) at a tile position. Returns [u, v]. */
export function windAt(a, x, y) {
  const gx = x / CS - 0.5, gy = clamp(y / CS - 0.5, 0, a.GH - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const cell = (cx, cy) => clamp(cy, 0, a.GH - 1) * a.GW + wrap(cx, a.GW);
  const c00 = cell(x0, y0), c10 = cell(x0 + 1, y0), c01 = cell(x0, y0 + 1), c11 = cell(x0 + 1, y0 + 1);
  const bil = (A) => (A[c00] * (1 - fx) + A[c10] * fx) * (1 - fy) + (A[c01] * (1 - fx) + A[c11] * fx) * fy;
  return [bil(a.U), bil(a.V)];
}
export const cellAt = (a, x, y) => clamp(Math.floor(y / CS), 0, a.GH - 1) * a.GW + wrap(Math.floor(x / CS), a.GW);
/** Local temperature at a tile in °C. */
export function tempAt(a, tiles, i) {
  const x = i % tiles.W, y = (i / tiles.W) | 0, c = cellAt(a, x, y);
  return tiles.baseTemp[i] + (a.T[c] - a.base[c]);
}
