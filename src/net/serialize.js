// Save files and network snapshots.
import { generateWorld } from '../world/worldgen.js';
import { createAtmosphere } from '../world/atmosphere.js';
import { RNG } from '../core/rng.js';
import { YEAR_LEN } from '../core/time.js';
import { setNextPawnId, getNextPawnId } from '../sim/pawn.js';

const TILE_ARRAYS = ['height', 'biome', 'feat', 'featHp', 'river', 'owner', 'bld', 'crop', 'water', 'burnt', 'fire', 'pollution'];
const ATMO_ARRAYS = ['T', 'P', 'Hm', 'U', 'V', 'cloud', 'precip', 'storm', 'anomaly', 'snow'];

const b64 = (ta) => {
  const u8 = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (str, Type) => {
  let u8;
  if (typeof Buffer !== 'undefined') u8 = new Uint8Array(Buffer.from(str, 'base64'));
  else { const s = atob(str); u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); }
  return new Type(u8.buffer);
};

const strip = (o) => { const c = {}; for (const [k, v] of Object.entries(o)) if (k[0] !== '_') c[k] = v; return c; };
const mapStrip = (m) => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = strip(v); return o; };

/** Full save (JSON-safe). */
export function serializeWorld(world) {
  const t = world.tiles, a = world.atmo;
  return {
    format: 'ancestry-world-save', version: 1, savedAt: Date.now(),
    meta: { name: world.name, seed: world.seed, W: world.W, H: world.H, time: world.time, speed: world.speed, nextPawnId: getNextPawnId() },
    nextId: world.nextId, players: world.players, age: world.age, space: world.space, log: world.log.slice(-150),
    nations: mapStrip(world.nations), settlements: mapStrip(world.settlements), buildings: mapStrip(world.buildings),
    pawns: mapStrip(world.pawns), animals: mapStrip(world.animals), squads: mapStrip(world.squads || {}), raiderNationId: world.raiderNationId || null,
    settings: world.settings || {}, hostId: world.hostId, rngState: world.rng.s,
    tiles: Object.fromEntries(TILE_ARRAYS.map((k) => [k, b64(t[k])])),
    atmo: { ...Object.fromEntries(ATMO_ARRAYS.map((k) => [k, b64(a[k])])), vortices: a.vortices, overrides: a.overrides, zones: (a.zones || []).map(({ _cells, ...z }) => z) },
    waterActive: [...world.waterActive], fireActive: [...world.fireActive], drops: world.drops || {},
  };
}

export function deserializeWorld(s) {
  const m = s.meta;
  const tiles = generateWorld(m.seed, m.W, m.H);
  const types = { height: Float32Array, biome: Uint8Array, feat: Uint8Array, featHp: Uint8Array, river: Uint8Array, owner: Int16Array, bld: Int32Array, crop: Uint8Array, water: Float32Array, burnt: Uint8Array, fire: Uint8Array, pollution: Uint8Array };
  for (const k of TILE_ARRAYS) if (s.tiles[k]) tiles[k] = unb64(s.tiles[k], types[k]);
  const atmo = createAtmosphere(tiles);
  const at = { T: Float32Array, P: Float32Array, Hm: Float32Array, U: Float32Array, V: Float32Array, cloud: Float32Array, precip: Float32Array, storm: Uint8Array, anomaly: Float32Array, snow: Float32Array };
  for (const k of ATMO_ARRAYS) if (s.atmo[k]) atmo[k] = unb64(s.atmo[k], at[k]);
  atmo.vortices = s.atmo.vortices || []; atmo.overrides = s.atmo.overrides || []; atmo.zones = s.atmo.zones || [];
  setNextPawnId(m.nextPawnId || 1 + Math.max(0, ...Object.keys(s.pawns).map(Number)));
  const world = {
    version: 1, name: m.name, seed: m.seed, W: m.W, H: m.H, time: m.time, yearLen: YEAR_LEN, tick: 0, speed: m.speed || 1, paused: false,
    tiles, atmo, nations: s.nations, settlements: s.settlements, buildings: s.buildings, pawns: s.pawns, animals: s.animals || {}, squads: s.squads || {},
    nextId: s.nextId, players: s.players || {}, age: s.age, space: s.space || [], log: s.log || [], fx: [], rng: new RNG(s.rngState || m.seed),
    waterActive: new Set(s.waterActive || []), fireActive: new Set(s.fireActive || []), dirty: new Set(), hot: new Set(), cameraHints: {}, drops: s.drops || {},
    settings: s.settings || {}, hostId: s.hostId, raiderNationId: s.raiderNationId, freeSites: [],
  };
  for (const n of Object.values(world.nations)) { n.proposals = n.proposals || []; n.perms = n.perms || {}; }
  return world;
}

// ---------------- network snapshots ----------------
const STATE_CODE = { idle: 0, walk: 1, work: 2, fight: 3, sleep: 4, eat: 5, downed: 6, dead: 7, break: 8, held: 9, flee: 10 };
const STATE_NAME = Object.fromEntries(Object.entries(STATE_CODE).map(([k, v]) => [v, k]));
export const CARD_KEYS = ['id', 'name', 'family', 'sex', 'race', 'age', 'look', 'nationId', 'settlementId', 'role', 'gearEra', 'traits', 'mood', 'possessedBy', 'parents', 'children', 'spouse', 'lover', 'lifespan', 'deathCause', 'dressed', 'work', 'tools', 'toolOut', 'likes', 'dislike', 'act'];

export function pawnCard(p) { const c = {}; for (const k of CARD_KEYS) c[k] = p[k]; c.fx = p.fx; return c; }
export function pawnFast(p) {
  const flags = (p.downed ? 1 : 0) | (p.dead ? 2 : 0) | (p.attackAnim > 0 ? 4 : 0) | (p.brk ? 8 : 0) | (p.possessedBy ? 16 : 0) | (p.facing < 0 ? 32 : 0) | (p.heldBy ? 64 : 0);
  return [p.id, Math.round(p.x * 100), Math.round(p.y * 100), STATE_CODE[p.state] ?? 0, flags, Math.round(p.hp), Math.round(p.mood), p.carry?.item || 0, p.work || 0];
}
export function pawnDetail(p) { return strip({ ...p, path: null }); }
export function tileRecord(t, i) { return [i, t.biome[i], t.feat[i], t.featHp[i], t.owner[i], t.bld[i], t.crop[i], t.fire[i], Math.round(t.water[i] * 100), t.burnt[i], Math.round(t.height[i] * 1000), t.river[i], t.pollution[i]]; }
export function applyTileRecord(t, r) {
  const i = r[0];
  t.biome[i] = r[1]; t.feat[i] = r[2]; t.featHp[i] = r[3]; t.owner[i] = r[4]; t.bld[i] = r[5]; t.crop[i] = r[6]; t.fire[i] = r[7]; t.water[i] = r[8] / 100; t.burnt[i] = r[9]; t.height[i] = r[10] / 1000; t.river[i] = r[11]; t.pollution[i] = r[12];
  return i;
}
export function atmoPacket(a) {
  const q = (arr, s) => Array.from(arr, (v) => Math.round(v * s));
  return { T: q(a.T, 10), P: q(a.P, 10), Hm: q(a.Hm, 1000), U: q(a.U, 10), V: q(a.V, 10), cloud: q(a.cloud, 100), precip: q(a.precip, 1000), storm: Array.from(a.storm), snow: q(a.snow, 100), anomaly: q(a.anomaly, 10), vortices: a.vortices, zones: (a.zones || []).map(({ _cells, ...z }) => z), overrides: a.overrides };
}
export function applyAtmo(a, pk) {
  const d = (k, s) => { const src = pk[k]; if (!src) return; for (let i = 0; i < src.length; i++) a[k][i] = src[i] / s; };
  d('T', 10); d('P', 10); d('Hm', 1000); d('U', 10); d('V', 10); d('cloud', 100); d('precip', 1000); d('snow', 100); d('anomaly', 10);
  if (pk.storm) a.storm.set(pk.storm);
  a.vortices = pk.vortices || []; if (pk.zones) a.zones = pk.zones; if (pk.overrides) a.overrides = pk.overrides;
}
export function applyFast(world, arr) {
  const seen = new Set();
  for (const r of arr) {
    const p = world.pawns[r[0]]; if (!p) continue;
    seen.add(r[0]);
    // remember how fast they were going, so the client can glide them between snapshots instead of hopping
    const nx = r[1] / 100, ny = r[2] / 100, now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (p._st !== undefined) { const dts = Math.max(0.03, (now - p._st) / 1000); let ddx = nx - p.x; if (ddx > world.W / 2) ddx -= world.W; if (ddx < -world.W / 2) ddx += world.W;
      const vx = ddx / dts, vy = (ny - p.y) / dts; const ok = Math.abs(vx) < 40 && Math.abs(vy) < 40; p._vx = ok ? vx : 0; p._vy = ok ? vy : 0; }
    p._st = now;
    p.x = nx; p.y = ny; p.state = STATE_NAME[r[3]] || 'idle';
    p.carry = r[7] ? { item: r[7] } : null; if (r[8]) p.work = r[8];
    p.downed = !!(r[4] & 1); p.dead = !!(r[4] & 2); p.attackAnim = r[4] & 4 ? 1 : 0; p.brk = r[4] & 8 ? (p.brk || { type: 'sadWander' }) : null; p.facing = r[4] & 32 ? -1 : 1; p.heldBy = r[4] & 64 ? (p.heldBy || 1) : null;
    p.hp = r[5]; p.mood = r[6];
  }
  return seen;
}
export { strip, mapStrip };
