// Main renderer. Seamless zoom: Surface (individual citizens) -> Regional map -> Planetary globe -> Outer space.
import { BIOMES, B, F } from '../data/biomes.js';
import { BUILDINGS } from '../data/buildings.js';
import { groundTile, mountainSprite, featureSprite, farmTile, roadTile, TS, biomeColor } from './tileart.js';
import { buildingSprite, scaffold, ROOF_PAD } from './buildart.js';
import { animalSprite, flagCanvas, iconCanvas } from './miscart.js';
import { pawnSheet, FW, FH } from './pawnart.js';
import { PACK, packSheet, PW, PH, DIR } from './charpack.js';
import { Ragdoll } from './ragdoll.js';
import { LPC, lpcSheet, LW, LH, LROW, LPC_BAND } from './lpc.js';
import { GCH, gcharSheet, loadGChar, GW, GH, GFOOT, GTOP, GROW } from './gchar.js';
import * as GAN from './gandalf.js';
import { loadFarm, farmFrame, cropFrame } from './farm.js';
// which Modern Farm crop (row in crops.png) a field draws: staples common, exotics rare
const CROP_POOL = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
import { FX } from './fx.js';
import { Globe, drawFarPlanets } from './globe.js';
import { makeCanvas } from './pixel.js';
import { sunPosition, windAt, cellAt, CS, STORM, tempAt } from '../world/atmosphere.js';
import { tileLatLon } from '../world/worldgen.js';
import { wrap, clamp, dx as wdx, hex, lerp } from '../core/util.js';
import { hash2 } from '../core/rng.js';
import { RACES } from '../data/races.js';
import { ANIMALS } from '../sim/combat.js';
import { dateString } from '../sim/world.js';

const CH = 16; // chunk size in tiles
const ZOOM = { MIN: 0.35, MAX: 112, SURFACE: 10, GLOBE: 1.6, GLOBE_FULL: 1.15 };
const TREE_KIND = Object.fromEntries(BIOMES.filter((b) => b.tk).map((b) => [b.id, b.tk]));

function sh0g(r, p) { return r.sheets.size >= 0 && GCH.ready && ((r.settings.characterStyle || 'lpc') === 'lpc' || r.settings.characterStyle === 'gandalf'); }
function loadGandalf0(r) { GAN.loadGandalf().then((ok) => { if (ok) r.chunks.clear(); }); }

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.settings = settings;
    this.cam = { x: 0, y: 0, zoom: 2, tz: 2, lat0: 0.25, vx: 0, vy: 0 };
    this.chunks = new Map(); this.fx = new FX(); this.globe = new Globe(); this.ragdolls = new Map();
    this.time = 0; this.overlay = 'none'; this.hover = null; this.selection = null; this.pins = new Set();
    this.ghost = null; // building placement preview
    this.powerPreview = null;
    this.sheets = new Map();
    this.weatherParts = [];
    this.dpr = 1;
    this.resize();
    loadGandalf0(this); loadGChar(); setTimeout(() => { try { GAN.warmSpx(['round_light_burst_001', 'round_sparkle_burst_001', 'round_sparkle_burst_002', 'round_sparkle_burst_003', 'round_heart_burst_001', 'spell_heal_001', 'symmetrical_impact_001', 'spell_death_001', 'scifi_spark_burst_001', 'epic_explosion_001', 'epic_explosion_002', 'lightning_strike_001', 'lightning_burst_001', 'stylized_explosion_001', 'spell_poison_001']); } catch (e) { /* optional */ } }, 4000); loadFarm(() => this.chunks.clear());
  }
  attach(world) {
    this.world = world;
    this.chunks.clear(); this.ragdolls.clear(); this.sheets.clear();
    const { W, H } = world;
    this.mapCanvas = makeCanvas(W, H); this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapImg = this.mapCtx.createImageData(W, H); this.mapBuf = new Uint32Array(this.mapImg.data.buffer);
    this.ownCanvas = makeCanvas(W, H); this.ownCtx = this.ownCanvas.getContext('2d');
    this.ownImg = this.ownCtx.createImageData(W, H); this.ownBuf = new Uint32Array(this.ownImg.data.buffer);
    this.cloudCanvas = makeCanvas(world.atmo.GW, world.atmo.GH); this.cloudCtx = this.cloudCanvas.getContext('2d');
    for (let i = 0; i < world.tiles.N; i++) this.mapPixel(i);
    this.refreshOwner(true);
    this.mapCtx.putImageData(this.mapImg, 0, 0);
    this.fxSeen = world.fx.length ? world.fx[world.fx.length - 1].t : 0;
  }
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.W = this.canvas.width; this.H = this.canvas.height;
  }

  // ---------- coordinates ----------
  get mode() { const z = this.cam.zoom; return z >= ZOOM.SURFACE ? 'surface' : z >= ZOOM.GLOBE ? 'regional' : 'globe'; }
  /** Horizontal centre used by the flat regional map. Once the whole map fits on screen it is shown once, centred, instead of repeating. */
  viewX() {
    const c = this.cam, W = this.world.W;
    if (c.zoom >= ZOOM.SURFACE) return c.x;
    const fit = this.W / W, u = clamp((c.zoom - fit * 0.85) / (fit * 0.2), 0, 1), f = 1 - u * u * (3 - 2 * u);
    return f > 0 ? wrap(c.x + wdx(c.x, W / 2, W) * f, W) : c.x;
  }
  worldToScreen = (x, y) => {
    const c = this.cam, W = this.world.W;
    const ddx = wdx(this.viewX(), x, W);
    return [this.W / 2 + ddx * c.zoom, this.H / 2 + (y - c.y) * c.zoom];
  };
  screenToWorld(sx, sy) {
    const c = this.cam;
    if (this.mode === 'globe') return this.globePick(sx, sy);
    return [wrap(this.viewX() + (sx - this.W / 2) / c.zoom, this.world.W), c.y + (sy - this.H / 2) / c.zoom];
  }
  globeRadius() { return this.menuMode ? Math.min(this.W, this.H) * 0.3 : this.cam.zoom * this.world.H * 0.42; }
  globePick(sx, sy) {
    const R = this.globeRadius(), x = (sx - this.W / 2) / R, y = -(sy - this.H / 2) / R, rho = Math.hypot(x, y);
    if (rho > 1) return null;
    const c = Math.asin(rho), lat0 = this.cam.lat0, lon0 = ((this.cam.x + 0.5) / this.world.W) * 2 * Math.PI - Math.PI;
    const lat = rho < 1e-9 ? lat0 : Math.asin(Math.cos(c) * Math.sin(lat0) + (y * Math.sin(c) * Math.cos(lat0)) / rho);
    const lon = lon0 + Math.atan2(x * Math.sin(c), rho * Math.cos(c) * Math.cos(lat0) - y * Math.sin(c) * Math.sin(lat0));
    return [wrap(((lon + Math.PI) / (2 * Math.PI)) * this.world.W, this.world.W), clamp(((Math.PI / 2 - lat) / Math.PI) * this.world.H, 0, this.world.H - 1)];
  }
  zoomAt(factor, sx, sy) {
    const c = this.cam, before = this.mode !== 'globe' && this.settings.zoomToCursor ? this.screenToWorld(sx, sy) : null;
    if (factor < 1 && c.tz < ZOOM.SURFACE * 1.2 && !this.menuMode) factor = Math.pow(factor, 0.55); // the last stretch out to the planet takes more scrolling
    c.tz = clamp(c.tz * factor, ZOOM.MIN, ZOOM.MAX);
    c.anchor = before ? { wx: before[0], wy: before[1], sx, sy } : null;
  }
  pan(dxPx, dyPx) {
    this.cam.anchor = null;
    const c = this.cam;
    if (this.mode === 'globe') { const R = this.globeRadius(); c.x = wrap(c.x - dxPx / R * (this.world.W / (2 * Math.PI)), this.world.W); c.lat0 = clamp(c.lat0 + dyPx / R, -1.2, 1.2); c.y = clamp(((Math.PI / 2 - c.lat0) / Math.PI) * this.world.H, 0, this.world.H); return; }
    c.x = wrap(c.x - dxPx / c.zoom, this.world.W); c.y = clamp(c.y - dyPx / c.zoom, 0, this.world.H);
    c.lat0 = clamp(Math.PI / 2 - (c.y / this.world.H) * Math.PI, -1.2, 1.2);
  }
  focus(x, y, zoom) { this.cam.x = wrap(x, this.world.W); this.cam.y = y; if (zoom) this.cam.tz = zoom; this.cam.lat0 = clamp(Math.PI / 2 - (y / this.world.H) * Math.PI, -1.2, 1.2); }

  // ---------- map textures ----------
  mapPixel(i) {
    const t = this.world.tiles, b = t.biome[i];
    let [r, g, bl] = biomeColor(b);
    const h = t.height[i];
    if (BIOMES[b].water) { const d = clamp(-h, 0, 1); r *= 1 - d * 0.35; g *= 1 - d * 0.3; bl *= 1 - d * 0.15; }
    else {
      const W = this.world.W, x = i % W, hw = t.height[(i - x) + wrap(x - 1, W)];
      const sh = clamp(1 + (h - hw) * 6 + h * 0.15, 0.75, 1.25); r *= sh; g *= sh; bl *= sh;
      const f = t.feat[i];
      if (f === F.TREE) { r *= 0.78; g *= 0.86; bl *= 0.78; }
      else if (f === F.FARM || f === F.CROP_READY) { r = 170; g = 140; bl = 80; }
      else if (f === F.BUILDING) { r = 150; g = 120; bl = 100; }
      else if (f === F.ROAD) { r = 160; g = 130; bl = 96; }
      if (t.river[i]) { r = 70; g = 140; bl = 200; }
      if (t.burnt[i]) { r *= 0.5; g *= 0.45; bl *= 0.42; }
    }
    this.mapBuf[i] = (255 << 24) | (clamp(bl | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255);
  }
  refreshOwner(full = false) {
    const w = this.world, t = w.tiles, { W, H } = w, buf = this.ownBuf;
    const colors = {};
    for (const n of Object.values(w.nations)) { const c = hex(this.paletteColor(n.color)); colors[n.id] = c; }
    for (let i = 0; i < t.N; i++) {
      const o = t.owner[i];
      if (o < 0 || !colors[o]) { buf[i] = 0; continue; }
      const x = i % W, y = (i / W) | 0;
      const edge = (y > 0 && t.owner[i - W] !== o) || (y < H - 1 && t.owner[i + W] !== o) || t.owner[y * W + wrap(x - 1, W)] !== o || t.owner[y * W + wrap(x + 1, W)] !== o;
      const [r, g, b] = colors[o], a = edge ? 235 : 70;
      const light = t.feat[i] === F.BUILDING ? 1 : 0;
      buf[i] = (a << 24) | (b << 16) | (g << 8) | ((r & 0xfe) | light);
    }
    this.ownCtx.putImageData(this.ownImg, 0, 0);
  }
  paletteColor(c) {
    const cb = this.settings.colorblind;
    if (!cb || cb === 'none') return c;
    const SAFE = { deuteranopia: ['#0072b2', '#e69f00', '#56b4e9', '#f0e442', '#cc79a7', '#d55e00', '#ffffff', '#999999', '#009e73', '#000000'], protanopia: ['#0072b2', '#f0e442', '#56b4e9', '#e69f00', '#cc79a7', '#ffffff', '#999999', '#d55e00'], tritanopia: ['#d55e00', '#009e73', '#cc79a7', '#ffffff', '#999999', '#e69f00', '#56b4e9'] }[cb];
    let h = 0; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return SAFE[h % SAFE.length];
  }
  /** Mark changed tiles (from simulation or network). */
  invalidate(tiles) {
    let owner = false;
    for (const i of tiles) {
      this.mapPixel(i);
      const W = this.world.W, x = i % W, y = (i / W) | 0;
      for (const ck of [`${Math.floor(x / CH)},${Math.floor(y / CH)}`]) { for (const lod of [0, 1]) { const c = this.chunks.get(ck + ',' + lod); if (c) c.dirty = true; } }
      owner = true;
    }
    if (tiles.size || tiles.length) { this.mapDirty = true; if (owner) this.ownerDirty = true; }
  }

  // ---------- chunk rendering ----------
  getChunk(cx, cy, lod) {
    const key = `${cx},${cy},${lod}`;
    let c = this.chunks.get(key);
    if (c && !c.dirty) { c.used = this.time; return c; }
    if (!c) { const px = lod ? 16 : 32; c = { canvas: makeCanvas(CH * px, CH * px), dirty: true, used: this.time, lod }; this.chunks.set(key, c); }
    if (this.chunkBudget-- <= 0) return c.ready ? c : null;
    this.renderChunk(c, cx, cy, lod);
    return c;
  }
  renderChunk(c, cx, cy, lod) {
    const ctx = c.canvas.getContext('2d'), w = this.world, t = w.tiles, W = w.W, px = lod ? 16 : 32;
    ctx.imageSmoothingEnabled = false;
    for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
      const x = cx * CH + tx, y = cy * CH + ty;
      if (y < 0 || y >= w.H) { ctx.fillStyle = '#000'; ctx.fillRect(tx * px, ty * px, px, px); continue; }
      const i = y * W + wrap(x, W), b = t.biome[i];
      const variant = Math.floor(hash2(x, y) * 4);
      ctx.drawImage(groundTile(b, variant, 0), tx * px, ty * px, px, px);
      this.blendCoast(ctx, t, W, w.H, x, y, tx, ty, px, b);
      if (!BIOMES[b].water) this.blendLand(ctx, t, W, w.H, x, y, tx, ty, px, b, variant);
      if (!BIOMES[b].water) this.shadeRelief(ctx, t, W, w.H, x, y, tx, ty, px, b);
      if (t.river[i]) { ctx.fillStyle = '#4c8fcf'; ctx.fillRect(tx * px + px * 0.2, ty * px, px * 0.6, px); ctx.fillRect(tx * px, ty * px + px * 0.2, px, px * 0.6); ctx.fillStyle = '#7fb9e8'; ctx.fillRect(tx * px + px * 0.35, ty * px + px * 0.35, px * 0.12, px * 0.12); }
      const f = t.feat[i];
      const owner = t.owner[i] >= 0 ? w.nations[t.owner[i]] : null;
      if (f === F.FARM || f === F.CROP_READY) ctx.drawImage(farmTile(f === F.CROP_READY ? 4 : t.crop[i] === 0 ? 0 : Math.min(3, 1 + Math.floor(t.crop[i] / 85)), owner?.era ?? 1), tx * px, ty * px, px, px);
      else if (f === F.ROAD) ctx.drawImage(roadTile(owner?.era ?? 0), tx * px, ty * px, px, px);
      else if (f === F.ROCK || f === F.ORE || f === F.GOLD || f === F.BERRY || f === F.STUMP || f === F.RUBBLE || f === F.CRATER) ctx.drawImage(featureSprite(f, variant, f === F.BERRY ? Math.min(4, t.featHp[i]) : 0), tx * px, ty * px, px, px);
      if ((f === F.FARM || f === F.CROP_READY) && !lod) {
        const st = f === F.CROP_READY ? 4 : t.crop[i] === 0 ? 0 : Math.min(3, 1 + Math.floor(t.crop[i] / 85)), kind = CROP_POOL[Math.floor(hash2(x >> 1, y >> 1) * CROP_POOL.length)], cf = cropFrame(kind, st);
        if (cf) for (let k = 0; k < 4; k++) { const c2 = cf.h > 32 && ty === 0 && !(k >> 1) ? cropFrame(kind, st, true) : cf, dw = px * 0.64, dh = dw * c2.h / 32; ctx.drawImage(c2.im, c2.x, c2.y, 32, c2.h, tx * px + (k & 1) * px * 0.5 - px * 0.07, ty * px + (k >> 1) * px * 0.5 - px * 0.12 + dw - dh, dw, dh); }
      }
      if (t.burnt[i]) { ctx.fillStyle = `rgba(30,24,22,${t.burnt[i] / 255 * 0.65})`; ctx.fillRect(tx * px, ty * px, px, px); }
      if (t.pollution[i] > 40) { ctx.fillStyle = `rgba(90,80,40,${Math.min(0.4, t.pollution[i] / 500)})`; ctx.fillRect(tx * px, ty * px, px, px); }
    }
    if (!lod && GAN.GA.ready) this.decorateChunk(ctx, cx, cy, px);
    c.dirty = false; c.ready = true;
  }
  /** Rounded, organic coastlines: land/water is a smooth field (bilinear between tile centres, weighted by how far each tile sits above or below sea level),
   *  so convex corners get cut, concave corners fill in and the shore reads as a curve instead of a staircase. A thin sand and foam fringe follows the line. */
  blendCoast(ctx, t, W, H, x, y, tx, ty, px, b) {
    const isW = !!BIOMES[b].water;
    // quick reject: only tiles touching the opposite class need work
    let mixed = false;
    for (let oy = -1; oy <= 1 && !mixed; oy++) for (let ox = -1; ox <= 1; ox++) {
      const yy = y + oy; if (yy < 0 || yy >= H) continue;
      if (!!BIOMES[t.biome[yy * W + wrap(x + ox, W)]].water !== isW) { mixed = true; break; }
    }
    if (!mixed) return;
    const L = (xx, yy) => { yy = yy < 0 ? 0 : yy >= H ? H - 1 : yy; const i = yy * W + wrap(xx, W), wt = !!BIOMES[t.biome[i]].water, m = Math.min(1, 0.4 + Math.abs(t.height[i]) * 9); return wt ? -m : m; };
    const S = px >= 32 ? 16 : 8, sz = px / S;
    const near = (u, v, wantWater) => { // nearest tile of the wanted class around this tile, by distance from the cell
      let best = -1, bd = 9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const yy = y + oy; if (yy < 0 || yy >= H) continue;
        const nb = t.biome[yy * W + wrap(x + ox, W)]; if (!!BIOMES[nb].water !== wantWater) continue;
        const d = Math.hypot(u - (ox + 0.5), v - (oy + 0.5)); if (d < bd) { bd = d; best = nb; }
      }
      return best;
    };
    const c00 = [L(x - 1, y - 1), L(x, y - 1), L(x + 1, y - 1)], c10 = [L(x - 1, y), L(x, y), L(x + 1, y)], c20 = [L(x - 1, y + 1), L(x, y + 1), L(x + 1, y + 1)];
    const grid = [c00, c10, c20];
    const field = (u, v) => { // u,v in tile units, tile centre at (0.5,0.5) -> grid index 1
      const gx = u + 0.5, gy = v + 0.5, x0 = Math.min(1, Math.max(0, Math.floor(gx))), y0 = Math.min(1, Math.max(0, Math.floor(gy)));
      const fx = gx - x0, fy = gy - y0;
      return (grid[y0][x0] * (1 - fx) + grid[y0][x0 + 1] * fx) * (1 - fy) + (grid[y0 + 1][x0] * (1 - fx) + grid[y0 + 1][x0 + 1] * fx) * fy;
    };
    const variant = Math.floor(hash2(x, y) * 4);
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (sx + 0.5) / S, v = (sy + 0.5) / S, gx = x * S + sx, gy = y * S + sy;
      const f = field(u, v) + (hash2(gx, gy) - 0.5) * 0.16 + (hash2(gx >> 2, gy >> 2) - 0.5) * 0.12;
      const cellWater = f < 0;
      if (cellWater !== isW) {
        const nb = near(u, v, cellWater); if (nb < 0) continue;
        ctx.drawImage(groundTile(nb, variant, 0), sx * sz, sy * sz, sz, sz, tx * px + sx * sz, ty * px + sy * sz, sz, sz);
      }
      // fringe: damp sand on the land side, foam on the water side
      const af = Math.abs(f);
      if (af < 0.14) {
        if (cellWater) { ctx.fillStyle = `rgba(232,246,255,${0.62 - af * 3})`; } else { ctx.fillStyle = `rgba(238,222,172,${0.5 - af * 2.4})`; }
        ctx.fillRect(tx * px + sx * sz, ty * px + sy * sz, sz, sz);
      }
    }
  }
  /** Smooth, organic borders between neighbouring land biomes: each 1/8-tile cell votes between the nearby tiles' biomes with a little noise, and near-ties fade. */
  blendLand(ctx, t, W, H, x, y, tx, ty, px, b, variant) {
    let diff = false; const nbs = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const yy = y + oy; let nb = -1;
      if (yy >= 0 && yy < H) { nb = t.biome[yy * W + wrap(x + ox, W)]; if (BIOMES[nb].water) nb = -1; }
      nbs.push(nb); if (nb >= 0 && nb !== b) diff = true;
    }
    if (!diff) return;
    const S = 8, sz = px / S, sc = {};
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (sx + 0.5) / S, v = (sy + 0.5) / S, gx = x * S + sx, gy = y * S + sy;
      const nz = (hash2(gx, gy) - 0.5) * 0.5 + (hash2(gx >> 1, gy >> 1) - 0.5) * 0.35;
      for (const k in sc) delete sc[k];
      let k = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++, k++) {
        const nb = nbs[k]; if (nb < 0) continue;
        const d = Math.hypot(u - (ox + 0.5), v - (oy + 0.5)), wgt = Math.max(0, 1.3 - d);
        sc[nb] = (sc[nb] || 0) + wgt * wgt * (1 + nz);
      }
      let best = b, bs = -1, second = -1, ss = -1;
      for (const nb in sc) { const v2 = sc[nb]; if (v2 > bs) { second = best; ss = bs; bs = v2; best = +nb; } else if (v2 > ss) { ss = v2; second = +nb; } }
      if (best !== b) ctx.drawImage(groundTile(best, variant, 0), sx * sz, sy * sz, sz, sz, tx * px + sx * sz, ty * px + sy * sz, sz, sz);
      if (second >= 0 && second !== best && bs - ss < 0.1) { ctx.globalAlpha = 0.45; ctx.drawImage(groundTile(second, variant, 0), sx * sz, sy * sz, sz, sz, tx * px + sx * sz, ty * px + sy * sz, sz, sz); ctx.globalAlpha = 1; }
    }
  }
  /** Hill-shading so higher ground reads as higher: light from the north-west, plus a faint tint per elevation band. */
  shadeRelief(ctx, t, W, H, x, y, tx, ty, px, b) {
    const hAt = (xx, yy) => t.height[clamp(yy, 0, H - 1) * W + wrap(xx, W)];
    const h = hAt(x, y); if (h <= 0.02) return;
    const slope = (hAt(x - 1, y - 1) + hAt(x - 1, y) * 0.5 + hAt(x, y - 1) * 0.5) - (hAt(x + 1, y + 1) + hAt(x + 1, y) * 0.5 + hAt(x, y + 1) * 0.5);
    const a = clamp(slope * 2.2, -0.34, 0.34);
    if (a > 0.015) { ctx.fillStyle = `rgba(255,248,225,${a * 0.75})`; ctx.fillRect(tx * px, ty * px, px, px); }
    else if (a < -0.015) { ctx.fillStyle = `rgba(14,10,40,${-a * 0.85})`; ctx.fillRect(tx * px, ty * px, px, px); }
    if (h > 0.2) { ctx.fillStyle = `rgba(30,24,50,${Math.min(0.12, (h - 0.2) * 0.12)})`; ctx.fillRect(tx * px, ty * px, px, px); }
  }
  /** Scatter grass tufts, bushes, pebbles and boulders over open ground, tone chosen per biome. */
  decorateChunk(ctx, cx, cy, px) {
    const w = this.world, t = w.tiles, W = w.W, sc = px / 32;
    const TONE = { [B.PLAINS]: 'g', [B.FOREST]: 'g', [B.JUNGLE]: 'g', [B.SWAMP]: 'g', [B.SAVANNA]: 'a', [B.DESERT]: 'a', [B.BEACH]: 'a', [B.TAIGA]: 's', [B.TUNDRA]: 's', [B.MOUNTAIN]: 's',
      [B.STEPPE]: 'a', [B.BADLANDS]: 'a', [B.BLOSSOM]: 'g', [B.AUTUMN]: 'a', [B.RAINFOREST]: 'g', [B.MANGROVE]: 'g', [B.ALPINE]: 'g', [B.GLOWFEN]: 'g', [B.ASHLAND]: 's' };
    const DENS = { [B.PLAINS]: 1.1, [B.FOREST]: 1.3, [B.JUNGLE]: 1.8, [B.SWAMP]: 1.2, [B.SAVANNA]: 0.8, [B.DESERT]: 0.25, [B.BEACH]: 0.1, [B.TAIGA]: 0.7, [B.TUNDRA]: 0.4, [B.MOUNTAIN]: 0.3,
      [B.STEPPE]: 0.7, [B.BADLANDS]: 0.2, [B.BLOSSOM]: 1.2, [B.AUTUMN]: 1.2, [B.RAINFOREST]: 1.7, [B.MANGROVE]: 0.9, [B.ALPINE]: 0.9, [B.GLOWFEN]: 1.0, [B.ASHLAND]: 0.25 };
    for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
      const x = cx * CH + tx, y = cy * CH + ty; if (y < 0 || y >= w.H) continue;
      const i = y * W + wrap(x, W), b = t.biome[i], tone = TONE[b]; if (!tone || t.feat[i] || t.river[i] || t.burnt[i] > 120) continue;
      const n = Math.floor(DENS[b] * (0.6 + hash2(x * 5, y * 9) * 1.6));
      for (let k = 0; k < n; k++) {
        const h = Math.floor(hash2(x * 31 + k * 7, y * 17 + k) * 65536), r = (h % 100);
        const cat = r < 62 ? 'tuft' : r < 78 ? 'bush' : r < 92 ? 'rock' : r < 97 ? 'pile' : 'bigrock';
        if ((cat === 'bigrock' || cat === 'pile') && b !== B.MOUNTAIN && hash2(x, y * 3 + k) < 0.7) continue;
        const sp = GAN.nature(cat, tone, h >> 3); if (!sp) continue;
        const dx = ((h >> 4) % 100) / 100 * (px - sp.w * sc), dy = ((h >> 9) % 100) / 100 * (px - sp.h * sc * 0.5);
        // keep the whole sprite inside this chunk's canvas, otherwise big bushes get sliced in half at chunk edges
        const dw = sp.w * sc, dh = sp.h * sc, X = Math.min(CH * px - dw, tx * px + Math.max(0, dx)), Y = Math.min(CH * px - dh, ty * px + Math.max(0, dy) + dh * 0.3);
        ctx.drawImage(sp.im, sp.x, sp.y, sp.w, sp.h, Math.max(0, X), Math.max(0, Y), dw, dh);
      }
    }
  }

  // ---------- frame ----------
  frame(dt, local) {
    const w = this.world; if (!w) return;
    const adt = w.paused && !this.menuMode ? 0 : dt; // paused world = frozen animation (walk cycles, water, clouds, particles, ragdolls)
    this.time += adt; this.rtime = (this.rtime || 0) + dt;
    this.chunkBudget = 6;
    const c = this.cam;
    // zooming out toward the planet is deliberately slow and cinematic; zooming back in stays snappy
    const out = c.tz < c.zoom, rate = !out ? (c.zoom < ZOOM.GLOBE * 4 ? 5 : 9) : c.zoom >= ZOOM.SURFACE * 1.3 ? 9 : c.zoom > ZOOM.GLOBE * 4 ? 2.6 : 1.5;
    c.zoom += (c.tz - c.zoom) * Math.min(1, dt * rate);
    if (Math.abs(c.tz - c.zoom) < 0.001) c.zoom = c.tz;
    // planet reveal when the zoom reaches the full globe
    if (!this.menuMode) {
      const full = c.zoom <= ZOOM.GLOBE * 1.25;
      if (full && !this._globeFull) { this._globeFull = true; this.reveal = { t: 0 }; }
      else if (!full && c.zoom > ZOOM.GLOBE * 2) { this._globeFull = false; this.reveal = null; }
      if (this.reveal && (this.reveal.t += dt) > 5) this.reveal = null;
    }
    if (c.anchor && c.zoom >= ZOOM.GLOBE) { const a = c.anchor; c.x = wrap(a.wx - (a.sx - this.W / 2) / c.zoom, w.W); c.y = clamp(a.wy - (a.sy - this.H / 2) / c.zoom, 0, w.H); c.lat0 = clamp(Math.PI / 2 - (c.y / w.H) * Math.PI, -1.2, 1.2); if (c.zoom === c.tz) c.anchor = null; }
    // consume simulation fx
    for (const e of w.fx) { if (e.t > this.fxSeen || (e._seq && e._seq > (this.fxSeq || 0))) this.onFx(e); }
    if (w.fx.length) { this.fxSeen = w.fx[w.fx.length - 1].t; this.fxSeq = w.fx[w.fx.length - 1]._seq; }
    this.fx.step(adt);
    if (this.mapDirty) { this.mapCtx.putImageData(this.mapImg, 0, 0); this.mapDirty = false; }
    if (this.ownerDirty && (this.rtime - (this._ownT || 0) > 0.5)) { this.refreshOwner(); this.ownerDirty = false; this._ownT = this.rtime; }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const shake = this.fx.shake;
    if (shake && !(w.paused && !this.menuMode)) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const mode = this.mode;
    if (this.menuMode) { this.drawSpace(ctx); return; }
    const TB = ZOOM.GLOBE * 3.4, ga = this.menuMode ? 1 : c.zoom >= TB ? 0 : c.zoom <= ZOOM.GLOBE * 1.25 ? 1 : (() => { const u = (TB - c.zoom) / (TB - ZOOM.GLOBE * 1.25); return u * u * (3 - 2 * u); })();
    if (mode === 'surface') this.drawSurface(ctx, adt, local);
    else if (mode === 'regional') this.drawRegional(ctx, 1);
    else this.drawSpace(ctx, false, 1);
    // regional -> globe: the flat map bends into the sphere (same px-per-tile at the centre, then the sphere swells to its final size)
    if (mode === 'regional' && ga > 0) this.drawSpace(ctx, false, ga);
    if (c.zoom < ZOOM.SURFACE * 1.3 && c.zoom >= ZOOM.SURFACE) { ctx.globalAlpha = 1 - (c.zoom - ZOOM.SURFACE) / (ZOOM.SURFACE * 0.3); this.drawRegional(ctx, 1, true); ctx.globalAlpha = 1; }
    if (this.fx.flash > 0) { ctx.fillStyle = `rgba(255,255,240,${this.fx.flash * ((this.settings.flash ?? 100) / 100) * 0.4})`; ctx.fillRect(-20, -20, this.W + 40, this.H + 40); }
    // evict old chunks
    if (this.chunks.size > 260) { const arr = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used); for (let k = 0; k < 60; k++) this.chunks.delete(arr[k][0]); }
  }

  onFx(e) {
    this.onFxHook?.(e);
    if ((e.type === 'death' || e.type === 'knock') && e.pid) {
      const p = this.world.pawns[e.pid]; if (!p) return;
      this.startRagdoll(p, e.ix || 0, e.iy || 0, e.type === 'death');
      return;
    }
    if (e.type === 'era') { const n = this.world.nations[e.nationId]; e.label = `${n ? n.name : ''} — ${['Stone Age', 'Neolithic', 'Bronze Age', 'Iron Age', 'Medieval', 'Renaissance', 'Industrial', 'Atomic', 'Ultra-Tech', 'Offworld'][e.era]}`; }
    this.fx.handle(e, this.settings);
  }
  startRagdoll(p, ix, iy, dead) {
    const sh = this.sheetFor(p); if (!sh) return;
    const facing = p.facing || 1;
    let rd;
    if (sh.lpc) rd = new Ragdoll(sh.sheet, 0, (LROW.walk + DIR.FRONT) * LH, LW, LH, LPC_BAND, ix * 60, iy * 60 + 120, { dead, flip: 1 });
    else if (sh.pack) { const ch = sh.ch, h = ch.bottom - ch.top; rd = new Ragdoll(sh.sheet, 0, DIR.FRONT * PH, PW, PH, { top: ch.top, headEnd: ch.top + Math.round(h * 0.4), hipY: ch.top + Math.round(h * 0.7), bottom: ch.bottom, cx: ch.cx }, ix * 60, iy * 60 + 120, { dead, flip: 1 }); }
    else rd = new Ragdoll(sh.sheet, 0, 0, FW, FH, { top: 6, headEnd: 21, hipY: 33, bottom: 47, cx: 16 }, ix * 60, iy * 60 + 120, { dead, flip: facing });
    this.ragdolls.set(p.id, rd);
  }

  sheetFor(p) {
    const n = this.world.nations[p.nationId];
    const era = p.gearEra ?? n?.era ?? 0, col = n?.color || '#cccccc';
    const style = this.settings.characterStyle || 'lpc';
    const useG = GCH.ready && (style === 'lpc' || style === 'gandalf');
    const useLpc = !useG && LPC.ready && (style === 'lpc' || style === 'lpc_old');
    const usePack = !useLpc && PACK.ready && style !== 'procedural';
    const key = `${p.id}|${era}|${p.role}|${col}|${useG ? 'G' : useLpc ? 'L' : usePack ? 'P' : 'R'}|${p.age < 14 ? 'c' : p.age > 58 ? 'o' : 'a'}|${p.race}`;
    let e = this.sheets.get(key);
    if (e) { e.used = this.time; return e; }
    if (this.sheetBudget-- <= 0) return this.lastSheet?.get(p.id) || null;
    if (useG) {
      const c = gcharSheet(p, era, p.role, col);
      if (c) { e = { sheet: c, g: true, used: this.time }; this.sheets.set(key, e); (this.lastSheet ||= new Map()).set(p.id, e); this.trimSheets(); return e; }
      return this.lastSheet?.get(p.id) || { sheet: pawnSheet(p, era, col), pack: false };
    }
    if (useLpc) {
      const c = lpcSheet(p, era, p.role);
      if (c) { e = { sheet: c, lpc: true, used: this.time }; this.sheets.set(key, e); (this.lastSheet ||= new Map()).set(p.id, e); this.trimSheets(); return e; }
      // layers still loading: show the old sheet (or a quick fallback) without caching it
      return this.lastSheet?.get(p.id) || (PACK.ready ? { ...packSheet(p, era, col), pack: true } : { sheet: pawnSheet(p, era, col), pack: false });
    }
    if (usePack) { const r = packSheet(p, era, col); e = { sheet: r.sheet, ch: r.ch, pack: true, used: this.time }; }
    else e = { sheet: pawnSheet(p, era, col), pack: false, used: this.time };
    this.sheets.set(key, e); (this.lastSheet ||= new Map()).set(p.id, e);
    this.trimSheets();
    return e;
  }
  trimSheets() {
    const cap = this.settings.characterStyle === 'procedural' ? 1400 : 320;
    if (this.sheets.size > cap) { const arr = [...this.sheets.entries()].sort((a, b) => a[1].used - b[1].used); for (let k = 0; k < Math.floor(cap / 4); k++) { this.sheets.delete(arr[k][0]); } }
    if (this.lastSheet && this.lastSheet.size > cap * 2) this.lastSheet.clear();
  }

  // ---------- surface ----------
  drawSurface(ctx, dt, local) {
    const w = this.world, t = w.tiles, c = this.cam, T = c.zoom, W = w.W;
    const lod = T >= 22 ? 0 : 1;
    const x0 = c.x - this.W / 2 / T, y0 = c.y - this.H / 2 / T, x1 = c.x + this.W / 2 / T, y1 = c.y + this.H / 2 / T;
    ctx.fillStyle = '#0b0f1f'; ctx.fillRect(0, 0, this.W, this.H);
    // ground chunks
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) {
      if (cy < 0 || cy * CH >= w.H) continue;
      for (let cxx = Math.floor(x0 / CH); cxx <= Math.floor(x1 / CH); cxx++) {
        const wcx = wrap(cxx, Math.ceil(W / CH));
        const ch = this.getChunk(wcx, cy, lod);
        const sx = this.W / 2 + (cxx * CH - c.x) * T, sy = this.H / 2 + (cy * CH - c.y) * T;
        if (ch && ch.ready) ctx.drawImage(ch.canvas, Math.round(sx), Math.round(sy), Math.ceil(CH * T) + 1, Math.ceil(CH * T) + 1);
        else { ctx.drawImage(this.mapCanvas, wcx * CH, cy * CH, CH, CH, sx, sy, CH * T, CH * T); }
      }
    }
    const tx0 = Math.floor(x0) - 2, tx1 = Math.ceil(x1) + 2, ty0 = Math.max(0, Math.floor(y0) - 1), ty1 = Math.min(w.H - 1, Math.ceil(y1) + 3);
    const frame = Math.floor(this.time * 2) % 4;
    const a = w.atmo;
    // animated water, surface water, snow cover
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * W + wrap(x, W), b = t.biome[i];
      const sx = this.W / 2 + (x - c.x) * T, sy = this.H / 2 + (y - c.y) * T;
      if (BIOMES[b].water && T >= 14) { ctx.globalAlpha = 0.5; ctx.drawImage(groundTile(b, (x * 7 + y) & 3, frame), sx, sy, T + 0.5, T + 0.5); ctx.globalAlpha = 1; this.waterFX(ctx, x, y, i, b, sx, sy, T, W); continue; }
      if (t.water[i] > 0.04) { ctx.fillStyle = `rgba(70,140,210,${Math.min(0.75, t.water[i] * 0.6)})`; ctx.fillRect(sx, sy, T + 0.5, T + 0.5); if (Math.sin(this.time * 3 + x + y * 2) > 0.85) { ctx.fillStyle = 'rgba(200,230,255,0.5)'; ctx.fillRect(sx + T * 0.3, sy + T * 0.5, T * 0.3, Math.max(1, T / 16)); } }
      const sn = a.snow[cellAt(a, x, y)];
      if (sn > 0.15 && !BIOMES[b].water && b !== B.ICE && b !== B.PEAK) { ctx.fillStyle = `rgba(244,248,255,${Math.min(0.8, sn * 0.9)})`; ctx.fillRect(sx, sy, T + 0.5, T + 0.5); }
    }
    if (T >= 10) this.drawSea(ctx, dt, T, T / 32, c, tx0, tx1, ty0, ty1);
    // territory borders
    if (this.overlay === 'borders' || this.settings.alwaysBorders) this.drawBorders(ctx, tx0, tx1, ty0, ty1);

    // ---- y-sorted sprites ----
    const list = [];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * W + wrap(x, W), b = t.biome[i];
      if (t.feat[i] === F.TREE) list.push({ y: y + 0.95, k: 0, x, ty: y, i });
      else if ((b === B.MOUNTAIN || b === B.PEAK) && T >= 8 && (wrap(x, W) + y * 3) % 2 === 0 && hash2(x * 3 + 1, y * 7) < 0.45 && !t.river[i]) list.push({ y: y + 0.9, k: 5, x, ty: y, i, snowy: b === B.PEAK || t.height[i] > 0.7 });
      if (t.fire[i]) list.push({ y: y + 0.99, k: 4, x, ty: y, i });
    }
    const seenB = new Set();
    for (let y = ty0; y <= ty1 + 3; y++) for (let x = tx0 - 3; x <= tx1; x++) {
      if (y >= w.H) continue;
      const bid = t.bld[y * W + wrap(x, W)]; if (bid < 0 || seenB.has(bid)) continue;
      const b = w.buildings[bid]; if (!b || BUILDINGS[b.type].field) continue;
      seenB.add(bid); list.push({ y: b.y + b.h - 0.02, k: 1, b });
    }
    const inView = (px, py) => { const ddx = wdx(c.x, px, W); return Math.abs(ddx) < this.W / 2 / T + 2 && py > y0 - 2 && py < y1 + 3; };
    for (const an of Object.values(w.animals)) if (inView(an.x, an.y)) list.push({ y: an.y, k: 2, a: an });
    this.sheetBudget = 30;
    for (const p of Object.values(w.pawns)) {
      if (p.rx === undefined || Math.abs(wdx(p.rx, p.x, W)) > 6 || Math.abs(p.ry - p.y) > 6) { p.rx = p.x; p.ry = p.y; }
      const k = Math.min(1, dt * 14);
      const ddx = wdx(p.rx, p.x, W), ddy = p.y - p.ry;
      p.rx = wrap(p.rx + ddx * k, W); p.ry += ddy * k;
      if (Math.abs(ddx) + Math.abs(ddy) > 0.003) { p._dir = Math.abs(ddx) > Math.abs(ddy) * 0.8 ? (ddx < 0 ? DIR.LEFT : DIR.RIGHT) : (ddy < 0 ? DIR.BACK : DIR.FRONT); p._moving = this.time; }
      if (inView(p.rx, p.ry)) list.push({ y: p.ry, k: 3, p });
    }
    this._autumn = dateString(w.time).season === 'Autumn';
    list.sort((A, Bv) => A.y - Bv.y);
    const s = T / 32;
    for (const e of list) {
      if (e.k === 0) { // tree
        const i = e.i, b = t.biome[i], kind = TREE_KIND[b] || 'oak', variant = (e.x * 3 + e.ty) & 1;
        const snowy = a.snow[cellAt(a, e.x, e.ty)] > 0.3 || b === B.TUNDRA;
        const gt = GAN.tree(kind, e.x, e.ty, snowy, this._autumn);
        const [sx, sy] = this.worldToScreen(e.x, e.ty);
        const sway = Math.sin(this.time * 1.5 + e.x * 0.7 + e.ty) * windAt(a, e.x, e.ty)[0] * 0.02 * s;
        ctx.save(); ctx.translate(Math.round(sx + T / 2), Math.round(sy + T)); ctx.transform(1, 0, sway * 0.4, 1, 0, 0);
        if (gt) { const k = gt.scale * s; ctx.drawImage(gt.im, gt.x, gt.y, gt.w, gt.h, -gt.w * k / 2, -(gt.h - gt.foot) * k, gt.w * k, gt.h * k); }
        ctx.restore();
      } else if (e.k === 5) { // mountain peak
        const [sx, sy] = this.worldToScreen(e.x, e.ty), spr = mountainSprite((e.x * 5 + e.ty * 3) & 3, e.snowy), k = s * 1.05;
        ctx.drawImage(spr, Math.round(sx + T / 2 - 48 * k), Math.round(sy + T - 78 * k), 96 * k, 84 * k);
      } else if (e.k === 1) this.drawBuilding(ctx, e.b, s);
      else if (e.k === 2) {
        const an = e.a, [sx, sy] = this.worldToScreen(an.x, an.y), sz = s * 1.5 * (ANIMALS[an.kind]?.size > 1.3 ? 1.25 : 1);
        const ff = an.dead ? null : farmFrame(an.kind, an.id || 0, this.time + (an.id || 0) * 0.37, an.moving);
        const pf = ff || an.dead ? null : GAN.petFrame(an.kind, this.time + (an.id || 0) * 0.37, an.moving);
        ctx.save(); ctx.translate(Math.round(sx), Math.round(sy));
        if (an.facing < 0) ctx.scale(-1, 1);
        if (ff) { const K = { cow: 0.62, sheep: 0.85, dog: 0.62, cat: 0.8, horse: 0.62, pig: 0.8, goat: 0.8, chicken: 1.05, rabbit: 0.85, duck: 1.0 }[an.kind] || 0.7, k = s * K * (ANIMALS[an.kind]?.size > 1.3 ? 1.1 : 1) * 1.15;
          ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, -1 * sz, ff.w * k * 0.36, 2.6 * sz, 0, 0, 7); ctx.fill(); ctx.drawImage(ff.im, ff.x, ff.y, ff.w, ff.h, -ff.w * k / 2, -ff.h * k + 2 * k, ff.w * k, ff.h * k); }
        else if (pf) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, -1 * sz, 9 * sz, 2.5 * sz, 0, 0, 7); ctx.fill(); ctx.drawImage(pf.im, pf.x, pf.y, 32, 32, -16 * sz * 1.25, -30 * sz * 1.25, 32 * sz * 1.25, 32 * sz * 1.25); }
        else ctx.drawImage(animalSprite(an.kind, an.moving ? Math.floor(this.time * 6) % 2 : 0, an.dead), -18 * sz, -30 * sz, 36 * sz, 32 * sz);
        ctx.restore();
      }
      else if (e.k === 3) this.drawPawn(ctx, e.p, s, dt);
      else if (e.k === 4) this.drawFire(ctx, e.x, e.ty, t.fire[e.i], s);
    }
    this.fx.draw(ctx, c, this.worldToScreen);
    for (const em of this.fx.emotes) { const p = w.pawns[em.pid]; if (!p || p.rx === undefined) continue; const [sx, sy] = this.worldToScreen(p.rx, p.ry); this.fx.drawEmote(ctx, em, sx, sy - 46 * s, T); }
    this.drawWeather(ctx, dt);
    this.drawNight(ctx, tx0, tx1, ty0, ty1, list);
    this.drawSurfaceUI(ctx, s, local);
  }

  drawBorders(ctx, tx0, tx1, ty0, ty1) {
    const w = this.world, t = w.tiles, W = w.W, T = this.cam.zoom;
    ctx.lineWidth = Math.max(2, T / 10);
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * W + wrap(x, W), o = t.owner[i]; if (o < 0) continue;
      const n = w.nations[o]; if (!n) continue;
      const [sx, sy] = this.worldToScreen(x, y);
      ctx.strokeStyle = this.paletteColor(n.color);
      ctx.setLineDash([T / 4, T / 6]);
      ctx.beginPath();
      if (t.owner[y * W + wrap(x + 1, W)] !== o) { ctx.moveTo(sx + T, sy); ctx.lineTo(sx + T, sy + T); }
      if (y < w.H - 1 && t.owner[i + W] !== o) { ctx.moveTo(sx, sy + T); ctx.lineTo(sx + T, sy + T); }
      if (t.owner[y * W + wrap(x - 1, W)] !== o) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + T); }
      if (y > 0 && t.owner[i - W] !== o) { ctx.moveTo(sx, sy); ctx.lineTo(sx + T, sy); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawBuilding(ctx, b, s) {
    const w = this.world, set = w.settlements[b.sid], n = set ? w.nations[set.nationId] : null;
    const img = buildingSprite(b.type, b.era ?? n?.era ?? 0, b.w, b.h, n?.color || '#cccccc', b.id);
    let [sx, sy] = this.worldToScreen(b.x, b.y + b.h);
    const BS = 1.55, W0 = b.w * 32 * s;                       // buildings are drawn 55% larger than their footprint so they tower over citizens
    const Wd = W0 * BS, Hd = (b.h * 32 + ROOF_PAD) * s * BS; sx -= (Wd - W0) / 2;
    let own = false;
    if (!b.built) {
      const prog = clamp(b.progress, 0, 1), vis = Math.floor((b.h * 32 + ROOF_PAD) * prog);
      ctx.globalAlpha = 0.35; ctx.drawImage(img, sx, sy - Hd, Wd, Hd); ctx.globalAlpha = 1;
      if (vis > 0) ctx.drawImage(img, 0, img.height - vis, img.width, vis, sx, sy - vis * s * BS, Wd, vis * s * BS);
      ctx.drawImage(scaffold(b.w, b.h), sx, sy - Hd, Wd, Hd);
    } else {
      own = this.drawGBuilding(ctx, b, sx, sy, Wd, s);
      if (!own) ctx.drawImage(img, Math.round(sx), Math.round(sy - Hd), Wd, Hd);
      this.drawBuildingProps(ctx, b, sx, sy, Wd, s);
    }
    if (!own && (b.type === 'campfire' || (b.type === 'center' && (b.era ?? 0) === 0) || (b.type === 'research' && (b.era ?? 0) === 0))) this.drawFlame(ctx, sx + Wd / 2, sy - 6 * s, s * (b.type === 'campfire' ? 1 : 1.3));
    if (b.type === 'center' && n?.flagSet !== false && n?.flag) { // flagpole with the nation's banner
      const fx = sx + Wd - 6 * s, fy = sy - Hd + 2 * s;
      ctx.fillStyle = '#5a4632'; ctx.fillRect(fx, fy, Math.max(1, 2 * s), Hd * 0.75);
      const f = flagCanvas(n.flag, 24, 16, (this.time * 0.8) % 1);
      ctx.drawImage(f, fx + 2 * s, fy + 1 * s, 24 * s * 0.8, 16 * s * 0.8);
    }
    if (b.built && (b.type === 'kitchen' || b.type === 'factory' || (b.type === 'workshop' && (b.era ?? 0) >= 1) || (b.era >= 6 && b.type === 'hut'))) this.drawSmoke(ctx, sx + Wd * 0.72, sy - Hd * 0.82, s * (b.type === 'factory' ? 0.8 : 0.45), b.id, b.type === 'factory' ? 'dark' : 'light', 0.55, windAt(w.atmo, b.x, b.y)[0]);
    if (set && set.until?.shield > w.time && b.type === 'center') { ctx.strokeStyle = 'rgba(127,232,240,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx + Wd / 2, sy, set.radius * this.cam.zoom, set.radius * this.cam.zoom * 0.6, 0, Math.PI, 0); ctx.stroke(); }
  }
  /** Tents and campfires from the Gandalf pack replace the procedural early-era buildings. Returns true when it drew the whole building. */
  drawGBuilding(ctx, b, sx, sy, Wd, s) {
    if (!GAN.ready) return false;
    const era = b.era ?? 0, cx = sx + Wd / 2;
    if (b.type === 'campfire') { const fr = GAN.campfireFrame(this.time + b.id, (b.id & 1) === 1); if (!fr) return false; const k = s * 2.1; ctx.drawImage(fr.im, fr.x, fr.y, 32, 32, cx - 16 * k, sy - 30 * k, 32 * k, 32 * k); return true; }
    if ((b.type === 'hut' && era <= 1) || (b.type === 'center' && era === 0)) {
      const big = b.type === 'center' || b.id % 3 === 0, t = GAN.sheetRect(big ? 'large_tent' : 'small_tent'); if (!t) return false;
      const k = (Wd * (big ? 0.95 : 1.05)) / t.w; ctx.drawImage(t.im, 0, 0, t.w, t.h, Math.round(cx - t.w * k / 2), Math.round(sy - t.h * k + 4 * s), t.w * k, t.h * k);
      if (b.type === 'center') { const fr = GAN.campfireFrame(this.time, false); if (fr) { const kk = s * 1.7; ctx.drawImage(fr.im, fr.x, fr.y, 32, 32, sx + Wd * 0.12 - 16 * kk, sy + 2 * s - 30 * kk, 32 * kk, 32 * kk); } }
      return true;
    }
    return false;
  }
  drawProp(ctx, key, x, y, k) { const r = GAN.prop(key); if (!r) return; ctx.drawImage(r.im, r.x, r.y, r.w, r.h, Math.round(x - r.w * k / 2), Math.round(y - r.h * k), r.w * k, r.h * k); }
  drawBuildingProps(ctx, b, sx, sy, Wd, s) {
    if (!GAN.ready) return;
    const era = b.era ?? 0, y = sy + 3 * s, K = s * 1.15;
    const set = { storage: [['decor:barrels2', 0.06], ['decor:crate_wide', 0.9]], market: [['decor:table_set', 0.04], ['decor:basket_apples', 0.92]], tavern: [['decor:barrel', 0.04], ['decor:stool', 0.9]],
      temple: [['decor:statue', -0.02], ['decor:statue', 1.02]], workshop: [['decor:logpile', 0.02], ['decor:stump_axe', 0.93]], healer: [['decor:basket', 0.05], ['decor:bottles', 0.9]],
      barracks: [['decor:crates', 0.03], ['decor:barrel', 0.93]], mine: [['decor:crate_wide', 0.05]], research: [['decor:cauldron', 0.92]] }[b.type];
    if (set) for (const [k, fx] of set) this.drawProp(ctx, k, sx + Wd * fx, y, K);
    if (b.type === 'hut' && era >= 1 && b.id % 4 === 1) this.drawProp(ctx, 'decor:pumpkins', sx + Wd * 0.05, y, K * 0.9);
    if (b.type === 'kitchen') { const fr = GAN.gridFrame('cooking_area', Math.floor(this.time * 7)); if (fr) ctx.drawImage(fr.im, fr.x, fr.y, 64, 64, sx - 8 * s, sy - 60 * s * 1.1 + 4 * s, 64 * s * 1.1, 64 * s * 1.1); }
    if (b.type === 'workshop' && era >= 1) { const fr = GAN.gridFrame('furnace_and_sawmill', Math.floor(this.time * 6) % 6); if (fr) ctx.drawImage(fr.im, fr.x, fr.y, 64, 64, sx + Wd - 40 * s, sy - 58 * s * 1.15 + 4 * s, 64 * s * 1.15, 64 * s * 1.15); }
  }
  drawFlame(ctx, x, y, s, style = 0) {
    const fr = GAN.fireFrame(style % 2 ? 'red' : 'yellow', ((x * 0.07) | 0) + style, this.time + x * 0.011);
    if (fr) { const k = s * 0.8; ctx.drawImage(fr.im, fr.x, fr.y, fr.w, fr.h, x - fr.w * k / 2, y - fr.h * k + 3 * k, fr.w * k, fr.h * k); return; }
    const t = this.time * 10;
    for (let k = 0; k < 5; k++) { const h = (6 + Math.sin(t + k * 1.7) * 3) * s, wv = 3 * s; ctx.fillStyle = k < 2 ? '#ff6a1a' : k < 4 ? '#ffb347' : '#fff2a8'; ctx.fillRect(x - wv + k * s * 1.2 - 2 * s, y - h, wv * (k < 4 ? 1 : 0.6), h); }
  }
  /** Animated shoreline: depth wash, rolling foam fronts with lace, wet-sand darkening, wave glints and night sparkle. */
  waterFX(ctx, x, y, i, b, sx, sy, T, W) {
    const w = this.world, t = w.tiles, q = Math.max(1, T / 16), tm = this.time;
    // open-water glints (wind-driven crests)
    const gl = hash2(x * 3 + Math.floor(tm * 0.8 + x * 0.2), y * 5 + Math.floor(tm * 0.5));
    if (gl > 0.93 && b !== B.SHALLOW) { ctx.fillStyle = 'rgba(214,240,255,0.55)'; ctx.fillRect(sx + T * ((gl * 97) % 1) * 0.7, sy + T * ((gl * 53) % 1) * 0.8, T * 0.22, q); }
    let shore = false;
    for (let d = 0; d < 4; d++) {
      const ox = d === 0 ? 1 : d === 1 ? -1 : 0, oy = d === 2 ? 1 : d === 3 ? -1 : 0, ny = y + oy; if (ny < 0 || ny >= w.H) continue;
      const nb = t.biome[ny * W + wrap(x + ox, W)]; if (BIOMES[nb].water) continue;
      shore = true;
      const ph = tm * 0.85 + (x * 0.55 + y * 0.35) + d, u = (Math.sin(ph) + 1) / 2, depth = T * (0.1 + 0.38 * u);
      // shallow turquoise wash fading from the shore
      const wash = ctx.createLinearGradient(ox ? (ox > 0 ? sx + T : sx) : 0, oy ? (oy > 0 ? sy + T : sy) : 0, ox ? (ox > 0 ? sx + T - T * 0.7 : sx + T * 0.7) : 0, oy ? (oy > 0 ? sy + T - T * 0.7 : sy + T * 0.7) : 0);
      wash.addColorStop(0, 'rgba(120,226,214,0.42)'); wash.addColorStop(1, 'rgba(120,226,214,0)'); ctx.fillStyle = wash; ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
      // lace: broken foam pixels trailing the wave front
      for (let k = 0; k < 16; k++) {
        const hv = hash2(x * 17 + k + d * 5, y * 13 + Math.floor(tm * 1.4 + k)); if (hv < 0.4) continue;
        const off = Math.max(0, depth * (0.2 + hv) - q * 2), along = k * T / 16;
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * (1 - off / (depth + 1))})`;
        const rx = ox ? (ox > 0 ? sx + T - off - q : sx + off) : sx + along, ry = oy ? (oy > 0 ? sy + T - off - q : sy + off) : sy + along;
        ctx.fillRect(rx, ry, ox ? q : q * 2, oy ? q : q * 2);
      }
      // the wave front itself
      ctx.fillStyle = `rgba(255,255,255,${0.55 - u * 0.3})`;
      if (ox) ctx.fillRect(ox > 0 ? sx + T - depth - q : sx + depth, sy, q, T + 0.5); else ctx.fillRect(sx, oy > 0 ? sy + T - depth - q : sy + depth, T + 0.5, q);
    }
    if (!shore && b === B.SHALLOW && hash2(x + Math.floor(tm * 0.4), y) > 0.9) { ctx.fillStyle = 'rgba(170,240,230,0.35)'; ctx.fillRect(sx + T * 0.2, sy + T * 0.4, T * 0.4, q); }
  }
  /** Sea life (whales, dolphins, rays, jellyfish, fish shoals) and gulls drifting over the coast. */
  drawSea(ctx, dt, T, s, c, tx0, tx1, ty0, ty1) {
    const w = this.world, W = w.W, t = w.tiles, sea = (this.sea ||= []), tm = this.time;
    const isOcean = (x, y) => { if (y < 0 || y >= w.H) return false; const bb = t.biome[y * W + wrap(Math.floor(x), W)]; return bb <= B.SHALLOW; };
    if (sea.length < 14 && Math.random() < dt * 0.8) {
      const x = tx0 + Math.random() * (tx1 - tx0), y = ty0 + Math.random() * (ty1 - ty0);
      if (isOcean(x, y) && isOcean(x + 2, y) && isOcean(x - 2, y)) {
        const r = Math.random(), kind = r < 0.22 ? 'whale' : r < 0.45 ? 'dolphin' : r < 0.6 ? 'manta' : r < 0.74 ? 'jelly' : r < 0.9 ? 'fish' : 'gull';
        const a = Math.random() * 6.28, sp = { whale: 0.5, dolphin: 1.6, manta: 0.7, jelly: 0.15, fish: 1.1, gull: 1.8 }[kind];
        sea.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, age: 0, life: 9 + Math.random() * 8, ph: Math.random() * 6.28, id: Math.random() });
      }
    }
    for (let k = sea.length - 1; k >= 0; k--) {
      const o = sea[k]; o.age += dt; o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.age > o.life || (o.kind !== 'gull' && !isOcean(o.x, o.y))) { sea.splice(k, 1); continue; }
      const [sx, sy] = this.worldToScreen(o.x, o.y), fade = Math.min(1, o.age / 1.2, (o.life - o.age) / 1.2), dir = o.vx < 0 ? -1 : 1, U = T / 32;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(dir, 1);
      if (o.kind === 'whale') {
        const bob = Math.sin(tm * 0.8 + o.ph); ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = '#0a2038';
        ctx.beginPath(); ctx.ellipse(0, 0, 46 * U, 11 * U, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-40 * U, 0); ctx.lineTo(-66 * U, -12 * U - bob * 4 * U); ctx.lineTo(-62 * U, 10 * U + bob * 4 * U); ctx.fill();
        if (Math.sin(tm * 0.5 + o.ph) > 0.92) { ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = '#e8f6ff'; for (let q = 0; q < 6; q++) ctx.fillRect(18 * U + (Math.random() - 0.5) * 4 * U, -8 * U - q * 4 * U, 2 * U, 3 * U); }
      } else if (o.kind === 'dolphin') {
        const arc = (o.age * 0.9 + o.ph) % 3; if (arc < 1) { const h = Math.sin(arc * Math.PI) * 14 * U; ctx.globalAlpha = fade; ctx.fillStyle = '#8fa4bd'; ctx.beginPath(); ctx.ellipse(0, -h, 9 * U, 3.4 * U, -Math.cos(arc * Math.PI) * 0.7, 0, 7); ctx.fill(); ctx.fillStyle = '#e8eef6'; ctx.fillRect(-2 * U, -h + 1.5 * U, 5 * U, 1.5 * U); if (arc < 0.12 || arc > 0.88) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let q = 0; q < 5; q++) ctx.fillRect((q - 2) * 3 * U, -2 * U - (q % 2) * 2 * U, 2 * U, 2 * U); } }
      } else if (o.kind === 'manta') {
        const fl = Math.sin(tm * 2 + o.ph) * 3 * U; ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = '#10283f';
        ctx.beginPath(); ctx.moveTo(10 * U, 0); ctx.lineTo(-4 * U, -16 * U - fl); ctx.lineTo(-8 * U, 0); ctx.lineTo(-4 * U, 16 * U + fl); ctx.fill(); ctx.fillRect(-26 * U, -0.6 * U, 18 * U, 1.2 * U);
      } else if (o.kind === 'jelly') {
        const pu = 1 + Math.sin(tm * 3 + o.ph) * 0.15; ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = '#d9a8ff'; ctx.beginPath(); ctx.ellipse(0, 0, 6 * U * pu, 5 * U / pu, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(230,190,255,0.5)'; ctx.lineWidth = Math.max(1, U); for (let q = -2; q <= 2; q++) { ctx.beginPath(); ctx.moveTo(q * 2.4 * U, 0); ctx.lineTo(q * 2.4 * U + Math.sin(tm * 2 + q) * U, 8 * U); ctx.stroke(); }
      } else if (o.kind === 'fish') {
        ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = '#cfe6f0'; for (let q = 0; q < 9; q++) { const a = q * 2.4 + o.ph; ctx.fillRect(Math.cos(a) * 9 * U + Math.sin(tm * 2 + q) * 1.5 * U, Math.sin(a) * 5 * U, 2.4 * U, 1.2 * U); }
      } else { // gull: shadow + flapping wings
        const fl = Math.sin(tm * 9 + o.ph) * 3 * U; ctx.globalAlpha = 0.18 * fade; ctx.fillStyle = '#000'; ctx.fillRect(-4 * U, 12 * U, 8 * U, 2 * U);
        ctx.globalAlpha = fade; ctx.fillStyle = '#f4f6f8'; ctx.fillRect(-1 * U, -14 * U, 3 * U, 2 * U); ctx.fillRect(-7 * U, -14 * U - fl, 6 * U, 1.5 * U); ctx.fillRect(2 * U, -14 * U - fl, 6 * U, 1.5 * U); ctx.fillStyle = '#e8b04a'; ctx.fillRect(3 * U, -13 * U, 2 * U, 1 * U);
      }
      ctx.restore();
    }
  }
  drawFire(ctx, x, y, f, s) {
    const [sx, sy] = this.worldToScreen(x, y), T = this.cam.zoom, hv = hash2(x, y);
    const n = 1 + Math.floor(f / 110);
    for (let k = 0; k < n; k++) this.drawFlame(ctx, sx + T * (0.3 + 0.4 * hash2(x + k, y)), sy + T * (0.75 + 0.2 * hash2(y, x + k)), s * (0.75 + f / 260), k);
    // real smoke: a drifting plume sprite above roughly every third burning tile (wind-sheared), instead of grey squares
    if (f > 50 && hv < 0.4) this.drawSmoke(ctx, sx + T * 0.5, sy + T * 0.5, s * (0.55 + f / 500), x * 7 + y, 'dark', Math.min(0.85, 0.4 + f / 300), windAt(this.world.atmo, x, y)[0]);
  }
  /** Looping smoke plume from the Pixel Fire pack (8 frames). Anchored at its base. */
  drawSmoke(ctx, x, y, s, seed, kind = 'dark', alpha = 0.8, wind = 0) {
    const e = GAN.smokeSheet(kind, seed); if (!e) return;
    const fw = e.im.width / 8, fh = e.im.height, fr = (Math.floor(this.time * 7 + seed) % 8 + 8) % 8, k = s;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.transform(1, 0, Math.max(-0.6, Math.min(0.6, wind * 0.05)), 1, 0, 0);
    ctx.drawImage(e.im, fr * fw, 0, fw, fh, -fw * k / 2, -fh * k, fw * k, fh * k); ctx.restore();
  }

  drawPawn(ctx, p, s, dt) {
    const w = this.world, [sx, sy] = this.worldToScreen(p.rx, p.ry);
    const rd = this.ragdolls.get(p.id);
    const sh = this.sheetFor(p);
    const scale = (p.age < 14 ? 0.55 + (p.age / 14) * 0.4 : 1) * (1 + (p.fx?.size || 0)) * (p.look?.height || 1);
    const S = s * scale * (sh0g(this, p) ? 1.2 : 1);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 7 * S, 2.5 * S, 0, 0, 7); ctx.fill();
    if (!sh) return;
    if (rd) {
      if (!rd.step(dt)) this.ragdolls.delete(p.id);
      rd.draw(ctx, sx, sy, S);
      if (!p.dead && !rd.dead) return;
      if (p.dead) return;
    }
    const st = p.state, moving = this.time - (p._moving || 0) < 0.15;
    const dir = sh.pack ? (p._dir ?? DIR.FRONT) : 0;
    let f = 0;
    const at = this.time * 8 + (p.id % 7);
    if (st === 'fight' || p.attackAnim > 0) f = 8 + (Math.floor(at * 0.8) % 2);
    else if (st === 'work') f = 6 + (Math.floor(at * 0.7) % 2);
    else if (moving || st === 'walk') f = 2 + (Math.floor(at) % 4);
    else f = Math.floor(at / 6) % 2;
    const lying = st === 'sleep' || st === 'downed' || p.dead;
    let fw, fh, sxF, syF, footY, topY;
    if (sh.g) {
      fw = GW; fh = GH; footY = GFOOT + 1; topY = GTOP;
      if (lying) { sxF = 0; syF = GROW.down * GH; }
      else if (f >= 6) { sxF = (Math.floor(at * 0.9) % 6) * GW; syF = GROW.attack * GH; }
      else if (f >= 2) { sxF = (Math.floor(at * 1.4) % 8) * GW; syF = GROW.walk * GH; }
      else { sxF = (Math.floor(at / 4) % 5) * GW; syF = GROW.idle * GH; }
      if (p._dir === DIR.LEFT) p._gFlip = true; else if (p._dir === DIR.RIGHT) p._gFlip = false; else if (p._gFlip === undefined) p._gFlip = (p.facing || 1) < 0;
    } else if (sh.lpc) {
      const ldir = p._dir ?? DIR.FRONT;
      fw = LW; fh = LH; footY = LPC_BAND.bottom + 1; topY = LPC_BAND.top;
      if (lying) { sxF = 5 * LW; syF = LROW.hurt * LH; }
      else if (f >= 6) { sxF = (Math.floor(at * 0.9) % 6) * LW; syF = (LROW.slash + ldir) * LH; }
      else if (f >= 2) { sxF = (1 + (Math.floor(at * 1.1) % 8)) * LW; syF = (LROW.walk + ldir) * LH; }
      else { sxF = 0; syF = (LROW.walk + ldir) * LH; }
    } else {
      fw = sh.pack ? PW : FW; fh = sh.pack ? PH : FH; footY = sh.pack ? (sh.ch.bottom + 1) : FH; topY = sh.pack ? sh.ch.top : 6;
      sxF = (lying ? 0 : f) * fw; syF = sh.pack ? dir * PH : 0;
    }
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (lying && !sh.lpc && !sh.g) { ctx.rotate(-Math.PI / 2); ctx.translate(-4 * S, -fw / 2 * S + 8 * S); }
    if (sh.g ? p._gFlip : (!sh.pack && !sh.lpc && (p.facing || 1) < 0)) ctx.scale(-1, 1);
    if (p.possessedBy) { ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 8; }
    ctx.drawImage(sh.sheet, sxF, syF, fw, fh, -fw / 2 * S, -footY * S, fw * S, fh * S);
    ctx.restore();
    // indicators
    const headY = sy - (footY - topY) * S;
    if (p.brk) { ctx.fillStyle = '#ff5a5a'; ctx.font = `bold ${Math.max(10, 10 * s)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('!', sx, headY - 4); }
    const pinned = this.pins.has(p.id), selected = this.selection?.type === 'pawn' && this.selection.id === p.id;
    if ((p.hp < 92 || p.blood < 0.95) && !p.dead && (st === 'fight' || p.downed || selected)) { const hpw = 18 * s; ctx.fillStyle = '#1a1420'; ctx.fillRect(sx - hpw / 2, headY - 6, hpw, 3); ctx.fillStyle = p.hp > 50 ? '#62c46a' : '#e8484d'; ctx.fillRect(sx - hpw / 2, headY - 6, hpw * clamp(p.hp / 100, 0, 1), 3); }
    if (pinned || selected || this.cam.zoom > 70) {
      ctx.font = `600 ${Math.max(10, Math.min(14, 9 * s))}px system-ui`; ctx.textAlign = 'center';
      const label = p.name; const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(10,12,30,0.65)'; ctx.fillRect(sx - tw / 2 - 4, headY - 22, tw + 8, 15);
      ctx.fillStyle = selected ? '#ffd34d' : '#fff'; ctx.fillText(label, sx, headY - 11);
      if (pinned) { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(sx, headY - 26); ctx.lineTo(sx - 4, headY - 32); ctx.lineTo(sx + 4, headY - 32); ctx.fill(); }
    }
    if (selected) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 9 * S, 3.5 * S, 0, 0, 7); ctx.stroke(); }
  }

  drawWeather(ctx, dt) {
    const w = this.world, a = w.atmo, c = this.cam, T = c.zoom;
    const ci = cellAt(a, c.x, c.y), st = a.storm[ci], [u, v] = windAt(a, c.x, c.y);
    // cloud shadows
    const img = this.cloudCtx.createImageData(a.GW, a.GH), d = new Uint32Array(img.data.buffer);
    for (let k = 0; k < a.G; k++) { const al = Math.max(0, a.cloud[k] - 0.25) * 110; d[k] = (Math.min(120, al) << 24) | 0x1a1410; }
    this.cloudCtx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.55;
    const off = (this.time * u * 0.02) % 1;
    const sx = this.W / 2 - (c.x + off) * T - CS * T / 2, sy = this.H / 2 - c.y * T - CS * T / 2;
    ctx.drawImage(this.cloudCanvas, sx, sy, a.GW * CS * T, a.GH * CS * T);
    if (c.x < this.W / T) ctx.drawImage(this.cloudCanvas, sx - w.W * T, sy, a.GW * CS * T, a.GH * CS * T);
    if (c.x > w.W - this.W / T) ctx.drawImage(this.cloudCanvas, sx + w.W * T, sy, a.GW * CS * T, a.GH * CS * T);
    ctx.restore();
    // precipitation particles (screen space, blown by the wind)
    const temp = tempAt(a, w.tiles, Math.floor(c.y) * w.W + Math.floor(c.x));
    const density = (this.settings.particles ?? 100) / 100;
    let want = 0, kind = 'rain';
    if (st === STORM.RAIN) want = 140; else if (st === STORM.THUNDER || st === STORM.CYCLONE) want = 320; else if (st === STORM.SNOW) { want = 140; kind = 'snow'; } else if (st === STORM.BLIZZARD) { want = 360; kind = 'snow'; } else if (st === STORM.DUST) { want = 260; kind = 'dust'; }
    if (kind === 'rain' && temp < 0 && want) kind = 'snow';
    want = Math.floor(want * density * Math.min(1, a.precip[ci] * 3 + (kind === 'dust' ? 1 : 0.3)));
    const P = this.weatherParts;
    while (P.length < want) P.push({ x: Math.random() * this.W, y: Math.random() * this.H, z: 0.5 + Math.random(), k: kind });
    if (P.length > want) P.length = want;
    const wx = u * 6, wy = v * 3;
    ctx.lineWidth = 1;
    for (const p of P) {
      p.k = kind;
      const sp = kind === 'rain' ? 900 : kind === 'snow' ? 90 : 260;
      p.x += (wx * (kind === 'dust' ? 8 : 3) * p.z) * dt; p.y += (sp * p.z + wy) * dt * (kind === 'dust' ? 0.1 : 1);
      if (kind === 'snow') p.x += Math.sin(this.time * 2 + p.z * 10) * 20 * dt;
      if (p.y > this.H) { p.y = -10; p.x = Math.random() * this.W; } if (p.x > this.W) p.x -= this.W; if (p.x < 0) p.x += this.W;
      if (kind === 'rain') { ctx.strokeStyle = 'rgba(180,210,255,0.55)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - wx * 0.02, p.y - 14 * p.z); ctx.stroke(); }
      else if (kind === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(p.x, p.y, 2 * p.z, 2 * p.z); }
      else { ctx.fillStyle = 'rgba(210,170,110,0.5)'; ctx.fillRect(p.x, p.y, 3 * p.z, 1.5); }
    }
    if (kind === 'dust' && want) { ctx.fillStyle = 'rgba(200,160,100,0.25)'; ctx.fillRect(0, 0, this.W, this.H); }
    if ((st === STORM.THUNDER || st === STORM.CYCLONE) && want) { ctx.fillStyle = 'rgba(20,24,50,0.18)'; ctx.fillRect(0, 0, this.W, this.H); }
    // aurora
    for (const tx of this.fx.texts) if (tx.aurora) { const al = Math.sin((tx.age / tx.life) * Math.PI) * 0.35; const g = ctx.createLinearGradient(0, 0, 0, this.H * 0.5); g.addColorStop(0, `rgba(90,255,180,${al})`); g.addColorStop(0.5, `rgba(140,120,255,${al * 0.6})`); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H * 0.5); }
  }

  drawNight(ctx, tx0, tx1, ty0, ty1, list) {
    const w = this.world, c = this.cam;
    const [lat, lon] = tileLatLon(c.x, c.y, w.W, w.H), sun = sunPosition(w.time, w.yearLen);
    const cz = Math.sin(lat) * Math.sin(sun.lat) + Math.cos(lat) * Math.cos(sun.lat) * Math.cos(lon - sun.lon);
    let dark = clamp(0.62 - cz * 2.4, 0, 0.62);
    if (w.age?.id === 'dark') dark = Math.min(0.7, dark + 0.12);
    this.darkness = dark;
    // golden hour: warm low-sun wash around sunrise and sunset, fading to plain daylight and then to night
    const gold = Math.max(0, 1 - Math.abs(cz - 0.1) / 0.32) * (w.age?.id === 'dark' ? 0.4 : 1);
    if (gold > 0.02) { ctx.fillStyle = `rgba(255,140,56,${gold * 0.2})`; ctx.fillRect(0, 0, this.W, this.H); }
    if (dark < 0.03) return;
    if (!this.nightCanvas || this.nightCanvas.width !== this.W || this.nightCanvas.height !== this.H) { this.nightCanvas = makeCanvas(this.W, this.H); this.nightCtx = this.nightCanvas.getContext('2d'); }
    const nc = this.nightCtx;
    nc.globalCompositeOperation = 'source-over';
    // multiply tint: deep blue night that keeps colours readable
    const tr = Math.round(255 - (255 - 70) * dark / 0.62), tg = Math.round(255 - (255 - 86) * dark / 0.62), tb = Math.round(255 - (255 - 160) * dark / 0.62);
    nc.clearRect(0, 0, this.W, this.H); nc.fillStyle = `rgb(${tr},${tg},${tb})`; nc.fillRect(0, 0, this.W, this.H);
    nc.globalCompositeOperation = 'destination-out';
    const T = c.zoom;
    const fl = (x, y) => 1 + 0.07 * Math.sin(this.time * 11 + x * 3.1 + y * 1.7) + 0.04 * Math.sin(this.time * 23 + x);
    const light = (x, y, r, a = 1) => { r *= fl(x, y); const [sx, sy] = this.worldToScreen(x, y); const g = nc.createRadialGradient(sx, sy, 0, sx, sy, r * T); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); nc.fillStyle = g; nc.fillRect(sx - r * T, sy - r * T, r * T * 2, r * T * 2); };
    for (const e of list) {
      if (e.k === 1 && e.b.built) { const b = e.b; const r = b.type === 'campfire' ? 4 : b.type === 'center' ? 5 : (b.era >= 6 ? 3.5 : 2.2); light(b.x + b.w / 2, b.y + b.h * 0.7, r, b.type === 'campfire' || b.type === 'center' ? 0.95 : 0.7); }
      if (e.k === 4) light(e.x + 0.5, e.ty + 0.5, 3, 0.9);
    }
    for (const r of this.fx.rings) light(r.x, r.y, 6, 0.8);
    // people carry a little light after dark; wildfires and burning ground light their surroundings
    if (dark > 0.25) for (const e of list) if (e.k === 3 && !e.p.dead && e.p.state !== 'sleep') light(e.p.rx ?? e.p.x, (e.p.ry ?? e.p.y) - 0.4, 1.7, 0.5);
    { let n = 0; for (const fi of w.fireActive || []) { if (n++ > 80) break; const fx = fi % w.W, fy = (fi / w.W) | 0, d = wdx(c.x, fx, w.W); if (Math.abs(d) < this.W / 2 / T + 4 && Math.abs(fy - c.y) < this.H / 2 / T + 4) light(fx + 0.5, fy + 0.5, 3.2, 0.9); } }
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.nightCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    // warm glow
    ctx.globalCompositeOperation = 'lighter';
    for (const e of list) if ((e.k === 1 && (e.b.type === 'campfire' || (e.b.type === 'center' && e.b.era === 0))) || e.k === 4) {
      const [sx, sy] = e.k === 1 ? this.worldToScreen(e.b.x + e.b.w / 2, e.b.y + e.b.h * 0.8) : this.worldToScreen(e.x + 0.5, e.ty + 0.5);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, T * 3); g.addColorStop(0, `rgba(255,150,60,${0.35 * dark})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(sx - T * 3, sy - T * 3, T * 6, T * 6);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawSurfaceUI(ctx, s, local) {
    const c = this.cam, T = c.zoom, w = this.world;
    if (this.ghost) { // building placement preview
      const g = this.ghost, [sx, sy] = this.worldToScreen(g.x, g.y);
      ctx.fillStyle = g.ok ? 'rgba(98,196,106,0.35)' : 'rgba(232,72,77,0.35)'; ctx.fillRect(sx, sy, g.w * T, g.h * T);
      ctx.strokeStyle = g.ok ? '#62c46a' : '#e8484d'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, g.w * T, g.h * T);
    }
    if (this.powerPreview) { const pp = this.powerPreview, [sx, sy] = this.worldToScreen(pp.x, pp.y); const col = pp.ok ? (this.brush?.color || '#ffd34d') : '#e8484d', rr = Math.max(0.6, pp.r) * T; ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 0.12 + 0.05 * Math.sin(this.time * 4); ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.7, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -this.time * 12; ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.7, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // settlement names when zoomed out a bit
    if (T < 26) for (const st of Object.values(w.settlements)) { const [sx, sy] = this.worldToScreen(st.x, st.y - 3); if (sx < -100 || sx > this.W + 100 || sy < -50 || sy > this.H + 50) continue; this.label(ctx, st.name, sx, sy, w.nations[st.nationId]); }
  }
  label(ctx, text, sx, sy, n, size = 13) {
    ctx.font = `700 ${size}px system-ui`; ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(10,12,30,0.7)'; ctx.beginPath(); ctx.roundRect(sx - tw / 2 - 8, sy - size, tw + 16, size + 8, 6); ctx.fill();
    if (n) { ctx.fillStyle = this.paletteColor(n.color); ctx.fillRect(sx - tw / 2 - 8, sy - size, 3, size + 8); }
    ctx.fillStyle = '#fff'; ctx.fillText(text, sx, sy + 1);
  }

  // ---------- regional map ----------
  drawRegional(ctx, alpha = 1, overlayOnly = false) {
    const w = this.world, c = this.cam, T = c.zoom, W = w.W;
    if (!overlayOnly) { ctx.fillStyle = '#0b0f1f'; ctx.fillRect(0, 0, this.W, this.H); }
    const sy0 = this.H / 2 - c.y * T;
    ctx.imageSmoothingEnabled = false;
    const sx0 = this.W / 2 - this.viewX() * T, single = W * T <= this.W * 1.02 && T < ZOOM.SURFACE, ks = single ? [0] : [-1, 0, 1];
    for (const k of ks) {
      const sx = sx0 + k * W * T; if (sx > this.W || sx + W * T < 0) continue;
      ctx.drawImage(this.mapCanvas, sx, sy0, W * T, w.H * T);
      if (this.overlay !== 'weather' && this.overlay !== 'wind') ctx.drawImage(this.ownCanvas, sx, sy0, W * T, w.H * T);
      this.drawMapOverlay(ctx, sx, sy0, T);
    }
    // clouds
    if (this.settings.mapClouds !== false && this.overlay === 'none') {
      const a = w.atmo, img = this.cloudCtx.createImageData(a.GW, a.GH), d = new Uint32Array(img.data.buffer);
      for (let i = 0; i < a.G; i++) { const al = Math.max(0, a.cloud[i] - 0.2) * 255 * 0.8; d[i] = (Math.min(200, al | 0) << 24) | 0xfaf6f2; }
      this.cloudCtx.putImageData(img, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha *= 0.65;
      for (const k of ks) ctx.drawImage(this.cloudCanvas, sx0 + k * W * T - CS * T / 2, sy0 - CS * T / 2, a.GW * CS * T, a.GH * CS * T);
      ctx.restore();
      for (const v of a.vortices) { const [vx, vy] = this.worldToScreen(v.x * CS + CS / 2, v.y * CS + CS / 2); ctx.save(); ctx.translate(vx, vy); ctx.rotate(-this.time * 2 * (v.y < a.GH / 2 ? 1 : -1)); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, (v.r * CS * T) * 0.6, k * 2.1, k * 2.1 + 1.4); ctx.stroke(); } ctx.restore(); }
    }
    // settlements, armies
    for (const st of Object.values(w.settlements)) {
      const n = w.nations[st.nationId]; if (!n) continue;
      const [sx, sy] = this.worldToScreen(st.x, st.y);
      if (sx < -80 || sx > this.W + 80 || sy < -40 || sy > this.H + 40) continue;
      const r = Math.max(4, Math.min(10, 3 + Math.sqrt(st.pop || 1)));
      ctx.fillStyle = this.paletteColor(n.color); ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); ctx.stroke();
      if (st.capital) { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(sx, sy, r * 0.45, 0, 7); ctx.fill(); }
      if (n.flag && T > 2.5) ctx.drawImage(flagCanvas(n.flag, 24, 16), sx + r + 2, sy - 18, 21, 14);
      if (T > 2.2) this.label(ctx, st.name, sx, sy - r - 8, n, T > 5 ? 13 : 11);
    }
    for (const sq of Object.values(w.squads || {})) {
      const m = sq.members.map((id) => w.pawns[id]).filter(Boolean); if (!m.length) continue;
      const ax = m[0].x, ay = m[0].y, [sx, sy] = this.worldToScreen(ax, ay), n = w.nations[sq.nationId];
      ctx.drawImage(iconCanvas('sword', 2), sx - 12, sy - 12); ctx.fillStyle = this.paletteColor(n?.color || '#fff'); ctx.font = '700 11px system-ui'; ctx.fillText(m.length, sx + 14, sy + 4);
    }
    if (this.powerPreview) { const pp = this.powerPreview, [sx, sy] = this.worldToScreen(pp.x, pp.y); ctx.strokeStyle = pp.ok ? '#ffd34d' : '#e8484d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, Math.max(4, pp.r * T), 0, 7); ctx.stroke(); }
  }

  drawMapOverlay(ctx, sx, sy, T) {
    const w = this.world, a = w.atmo, mode = this.overlay;
    if (mode === 'none' || mode === 'borders') return;
    if (['weather', 'temperature', 'pressure', 'humidity', 'wind'].includes(mode)) {
      for (let gy = 0; gy < a.GH; gy++) for (let gx = 0; gx < a.GW; gx++) {
        const k = gy * a.GW + gx; let col = null;
        if (mode === 'temperature') { const tt = clamp((a.T[k] + 20) / 60, 0, 1); col = `rgba(${Math.round(255 * tt)},${Math.round(120 + 60 * Math.sin(tt * Math.PI))},${Math.round(255 * (1 - tt))},0.45)`; }
        if (mode === 'pressure') { const p = clamp(a.P[k] / 12, -1, 1); col = p < 0 ? `rgba(255,90,90,${-p * 0.5})` : `rgba(90,140,255,${p * 0.5})`; }
        if (mode === 'humidity') col = `rgba(60,160,255,${clamp(a.Hm[k] * 1.4, 0, 0.6)})`;
        if (mode === 'weather') { const st = a.storm[k]; col = [null, 'rgba(90,150,255,0.35)', 'rgba(150,90,255,0.5)', 'rgba(255,90,200,0.55)', 'rgba(220,240,255,0.6)', 'rgba(220,170,100,0.55)', 'rgba(240,250,255,0.45)'][st]; }
        if (col) { ctx.fillStyle = col; ctx.fillRect(sx + gx * CS * T, sy + gy * CS * T, CS * T + 1, CS * T + 1); }
        if (mode === 'wind' && (gx + gy) % 1 === 0) {
          const cx = sx + (gx + 0.5) * CS * T, cy = sy + (gy + 0.5) * CS * T, u = a.U[k], v = a.V[k], sp = Math.hypot(u, v), L = Math.min(CS * T * 0.45, sp * T * 0.35);
          ctx.strokeStyle = sp > 20 ? '#ff6b6b' : sp > 10 ? '#ffd34d' : '#e8f4ff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx - u / sp * L, cy - v / sp * L); ctx.lineTo(cx + u / sp * L, cy + v / sp * L); ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(cx + u / sp * L - 1.5, cy + v / sp * L - 1.5, 3, 3);
        }
      }
      return;
    }
    // nation-level overlays painted per settlement territory
    for (const st of Object.values(w.settlements)) {
      const n = w.nations[st.nationId]; if (!n) continue;
      let col = null;
      if (mode === 'ideology') { const i = n.ideology; col = `rgba(${clamp(128 - i.war, 0, 255)},${clamp(128 + i.nature, 0, 255)},${clamp(128 + i.faith, 0, 255)},0.55)`; }
      if (mode === 'glitter') col = `rgba(255,211,77,${clamp(n.devotion / 3000, 0.08, 0.7)})`;
      if (mode === 'race') col = RACES[n.race || 'human'].color + '99';
      if (mode === 'pollution') col = `rgba(120,100,40,${clamp(st.pollution / 200, 0, 0.7)})`;
      if (mode === 'trade') col = 'rgba(0,0,0,0)';
      if (!col) continue;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx + st.x * T, sy + st.y * T, st.radius * T, 0, 7); ctx.fill();
    }
    if (mode === 'trade') {
      const ss = Object.values(w.settlements);
      ctx.lineWidth = 2;
      for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) {
        const A = ss[i], Bs = ss[j], na = w.nations[A.nationId], nb = w.nations[Bs.nationId]; if (!na || !nb) continue;
        const same = A.nationId === Bs.nationId, r = na.relations[nb.id]?.state;
        if (!same && r !== 'ally') continue;
        const d = Math.hypot(A.x - Bs.x, A.y - Bs.y); if (d > 70) continue;
        ctx.strokeStyle = same ? 'rgba(255,211,77,0.7)' : 'rgba(127,232,240,0.8)'; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(sx + A.x * T, sy + A.y * T); ctx.lineTo(sx + Bs.x * T, sy + Bs.y * T); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  // ---------- globe & space ----------
  drawSpace(ctx, overlay = false, alpha = 1) {
    const w = this.world, c = this.cam;
    ctx.save(); ctx.globalAlpha = alpha;
    if (!overlay) ctx.drawImage(this.globe.starfield(this.W, this.H), 0, 0);
    let R = this.globeRadius();
    if (c.zoom > ZOOM.GLOBE && !this.menuMode) { const Rm = c.zoom * w.W / (2 * Math.PI), u = Math.min(1, (c.zoom - ZOOM.GLOBE) / (ZOOM.GLOBE * 2.4)), e = u * u * (3 - 2 * u); R = R + (Rm - R) * e; }
    const CX = this.W / 2;
    const pxScale = Math.max(1, Math.round(R / 160));
    const D = clamp(Math.round((R * 2) / pxScale), 48, 420);
    // planet reveal: when the zoom-out reaches the full globe the planet swings into view, spinning to a stop under a bloom of atmosphere
    const rv = !this.menuMode && this.reveal ? this.reveal.t : -1, ru = rv < 0 ? 1 : Math.min(1, rv / 2.6), re = 1 - Math.pow(1 - ru, 3);
    if (rv >= 0 && ru < 1) R *= 0.84 + 0.16 * re;
    const lon0 = ((c.x + 0.5) / w.W) * 2 * Math.PI - Math.PI + (rv >= 0 ? (1 - re) * 2.4 : 0);
    if (!overlay) {
      // sun glow
      const g = ctx.createRadialGradient(this.W * 0.85, this.H * 0.15, 0, this.W * 0.85, this.H * 0.15, this.W * 0.3);
      g.addColorStop(0, 'rgba(255,240,200,0.35)'); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
      drawFarPlanets(ctx, this.W, this.H, w.time);
      this.globe.drawOrbiters(ctx, w, CX, this.H / 2, R, true);
    }
    // atmosphere halo
    const halo = ctx.createRadialGradient(CX, this.H / 2, R * 0.92, CX, this.H / 2, R * 1.12);
    halo.addColorStop(0, 'rgba(120,190,255,0.55)'); halo.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(CX, this.H / 2, R * 1.12, 0, 7); ctx.fill();
    if (rv >= 0 && rv < 4) { // expanding bloom ring + soft glow while the planet arrives
      const k = Math.min(1, rv / 3), a = (1 - k) * (1 - k);
      const bloom = ctx.createRadialGradient(CX, this.H / 2, R * 0.95, CX, this.H / 2, R * (1.15 + 0.9 * k));
      bloom.addColorStop(0, `rgba(150,215,255,${0.5 * a})`); bloom.addColorStop(0.5, `rgba(110,170,255,${0.18 * a})`); bloom.addColorStop(1, 'rgba(110,170,255,0)');
      ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(CX, this.H / 2, R * (1.15 + 0.9 * k), 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(190,230,255,${0.55 * a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX, this.H / 2, R * (1.02 + 0.55 * k), 0, 7); ctx.stroke();
    }
    const img = this.globe.render(w, this.mapBuf, this.ownBuf, lon0, c.lat0, D, { borders: this.overlay !== 'weather', clouds: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, CX - R, this.H / 2 - R, R * 2, R * 2);
    if (!overlay) this.globe.drawOrbiters(ctx, w, CX, this.H / 2, R, false);
    // settlement markers on the visible hemisphere
    if (R > 120) for (const st of Object.values(w.settlements)) {
      const [lat, lon] = tileLatLon(st.x, st.y, w.W, w.H);
      const cosc = Math.sin(c.lat0) * Math.sin(lat) + Math.cos(c.lat0) * Math.cos(lat) * Math.cos(lon - lon0);
      if (cosc < 0.15) continue;
      const x = R * Math.cos(lat) * Math.sin(lon - lon0), y = R * (Math.cos(c.lat0) * Math.sin(lat) - Math.sin(c.lat0) * Math.cos(lat) * Math.cos(lon - lon0));
      const n = w.nations[st.nationId]; if (!n) continue;
      ctx.fillStyle = this.paletteColor(n.color); ctx.beginPath(); ctx.arc(CX + x, this.H / 2 - y, st.capital ? 4 : 3, 0, 7); ctx.fill();
      if (R > 260 && st.capital) { ctx.font = '600 11px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(n.name, CX + x, this.H / 2 - y - 8); }
    }
    if (rv >= 0 && rv < 5 && !overlay) { // title card: the world's name, fading in then out
      const a = Math.min(1, Math.max(0, (rv - 0.5) / 0.8)) * Math.min(1, Math.max(0, (5 - rv) / 1));
      if (a > 0) {
        const fs = Math.max(18, Math.min(34, this.H * 0.045)), ty = Math.min(this.H - 40, this.H / 2 + R * 1.12 + fs * 1.4);
        ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(120,190,255,0.9)'; ctx.shadowBlur = 14;
        ctx.font = `700 ${fs}px system-ui`; ctx.fillStyle = '#eaf6ff'; ctx.fillText(String(w.name || 'Planet').toUpperCase().split('').join('\u200A'), CX, ty);
        ctx.shadowBlur = 0; ctx.font = `500 ${Math.round(fs * 0.45)}px system-ui`; ctx.fillStyle = 'rgba(200,225,255,0.8)'; ctx.fillText('Drag to turn the planet · scroll in to return', CX, ty + fs * 0.85);
      }
    }
    ctx.restore();
  }

  /** Thumbnail of the world map for saves/menus. */
  thumbnail(wd = 192, ht = 96) { const cv = makeCanvas(wd, ht), x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(this.mapCanvas, 0, 0, wd, ht); x.drawImage(this.ownCanvas, 0, 0, wd, ht); return cv.toDataURL('image/png'); }

  // ---------- picking ----------
  pick(sx, sy) {
    const w = this.world; if (!w) return null;
    const mode = this.mode;
    const pos = this.screenToWorld(sx, sy); if (!pos) return null;
    const [x, y] = pos;
    if (mode === 'surface') {
      const s = this.cam.zoom / 32;
      let best = null, bd = 1e9;
      for (const p of Object.values(w.pawns)) {
        if (p.rx === undefined) continue;
        const [px, py] = this.worldToScreen(p.rx, p.ry);
        if (sx > px - 9 * s && sx < px + 9 * s && sy > py - 40 * s && sy < py + 2 * s) { const d = Math.abs(sx - px) + Math.abs(sy - py + 18 * s); if (d < bd) { bd = d; best = p; } }
      }
      if (best) return { type: 'pawn', id: best.id };
      const ti = Math.floor(y) * w.W + wrap(Math.floor(x), w.W);
      const bid = w.tiles.bld[ti];
      if (bid >= 0 && w.buildings[bid]) return { type: 'building', id: bid, sid: w.buildings[bid].sid };
      for (const an of Object.values(w.animals)) if (Math.abs(wdx(an.x, x, w.W)) < 0.8 && Math.abs(an.y - 0.4 - y) < 0.8) return { type: 'animal', id: an.id };
    }
    let best = null, bd = 1e9;
    for (const st of Object.values(w.settlements)) { const d = Math.hypot(wdx(st.x, x, w.W), st.y - y); if (d < Math.max(st.radius, mode === 'surface' ? 0 : 6 / this.cam.zoom * 4) && d < bd) { bd = d; best = st; } }
    if (best) return { type: 'settlement', id: best.id };
    return { type: 'tile', x: Math.floor(x), y: Math.floor(y) };
  }
}
export { ZOOM };
