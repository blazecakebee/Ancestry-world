// Main renderer. Seamless zoom: Surface (individual citizens) -> Regional map -> Planetary globe -> Outer space.
import { BIOMES, B, F } from '../data/biomes.js';
import { BUILDINGS } from '../data/buildings.js';
import { groundTile, treeSprite, featureSprite, farmTile, roadTile, TS, biomeColor } from './tileart.js';
import { buildingSprite, scaffold, ROOF_PAD } from './buildart.js';
import { animalSprite, flagCanvas, iconCanvas } from './miscart.js';
import { pawnSheet, FW, FH } from './pawnart.js';
import { PACK, packSheet, PW, PH, DIR } from './charpack.js';
import { Ragdoll } from './ragdoll.js';
import { LPC, lpcSheet, LW, LH, LROW, LPC_BAND } from './lpc.js';
import { FX } from './fx.js';
import { Globe } from './globe.js';
import { makeCanvas } from './pixel.js';
import { sunPosition, windAt, cellAt, CS, STORM, tempAt } from '../world/atmosphere.js';
import { tileLatLon } from '../world/worldgen.js';
import { wrap, clamp, dx as wdx, hex, lerp } from '../core/util.js';
import { hash2 } from '../core/rng.js';
import { RACES } from '../data/races.js';

const CH = 16; // chunk size in tiles
const ZOOM = { MIN: 0.35, MAX: 112, SURFACE: 10, GLOBE: 1.6, GLOBE_FULL: 1.15 };
const TREE_KIND = { [B.FOREST]: 'oak', [B.PLAINS]: 'oak', [B.TAIGA]: 'pine', [B.TUNDRA]: 'pine', [B.MOUNTAIN]: 'pine', [B.JUNGLE]: 'jungle', [B.ARCHIPELAGO]: 'palm', [B.BEACH]: 'palm', [B.SAVANNA]: 'acacia', [B.SWAMP]: 'willow', [B.DESERT]: 'cactus', [B.VOLCANIC]: 'dead' };

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
  worldToScreen = (x, y) => {
    const c = this.cam, W = this.world.W;
    const ddx = wdx(c.x, x, W);
    return [this.W / 2 + ddx * c.zoom, this.H / 2 + (y - c.y) * c.zoom];
  };
  screenToWorld(sx, sy) {
    const c = this.cam;
    if (this.mode === 'globe') return this.globePick(sx, sy);
    return [wrap(c.x + (sx - this.W / 2) / c.zoom, this.world.W), c.y + (sy - this.H / 2) / c.zoom];
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
    c.tz = clamp(c.tz * factor, ZOOM.MIN, ZOOM.MAX);
    if (before) { const nz = c.tz; c.x = wrap(before[0] - (sx - this.W / 2) / nz, this.world.W); c.y = clamp(before[1] - (sy - this.H / 2) / nz, 0, this.world.H); c.zoom = nz; }
  }
  pan(dxPx, dyPx) {
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
      // biome blending: speckle neighbour colours along edges
      if (!BIOMES[b].water) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + oy; if (ny < 0 || ny >= w.H) continue;
        const nb = t.biome[ny * W + wrap(x + ox, W)];
        if (nb === b) continue;
        if (BIOMES[nb].water) { ctx.fillStyle = 'rgba(240,226,180,0.55)'; }
        else { const [r, g, bb] = biomeColor(nb); ctx.fillStyle = `rgb(${r},${g},${bb})`; }
        const s = px / 16;
        for (let k = 0; k < 6; k++) { const along = Math.floor(hash2(x * 7 + k, y * 3 + ox + oy * 5) * 15) * s, depth = Math.floor(hash2(x + k, y * 11 + k) * 3) * s;
          const rx = ox === 1 ? (px - s - depth) : ox === -1 ? depth : along, ry = oy === 1 ? (px - s - depth) : oy === -1 ? depth : along;
          ctx.fillRect(tx * px + rx, ty * px + ry, s * 2, s * 2); }
      } else for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // shoreline foam
        const ny = y + oy; if (ny < 0 || ny >= w.H) continue;
        if (!BIOMES[t.biome[ny * W + wrap(x + ox, W)]].water) { ctx.fillStyle = 'rgba(230,244,255,0.55)'; const s = px / 16; for (let k = 0; k < 5; k++) { const a = Math.floor(hash2(x * 13 + k, y) * 15) * s; ctx.fillRect(tx * px + (ox === 1 ? px - 2 * s : ox === -1 ? 0 : a), ty * px + (oy === 1 ? px - 2 * s : oy === -1 ? 0 : a), s * 2, s); } }
      }
      if (t.river[i]) { ctx.fillStyle = '#4c8fcf'; ctx.fillRect(tx * px + px * 0.2, ty * px, px * 0.6, px); ctx.fillRect(tx * px, ty * px + px * 0.2, px, px * 0.6); ctx.fillStyle = '#7fb9e8'; ctx.fillRect(tx * px + px * 0.35, ty * px + px * 0.35, px * 0.12, px * 0.12); }
      const f = t.feat[i];
      const owner = t.owner[i] >= 0 ? w.nations[t.owner[i]] : null;
      if (f === F.FARM || f === F.CROP_READY) ctx.drawImage(farmTile(f === F.CROP_READY ? 4 : t.crop[i] === 0 ? 0 : Math.min(3, 1 + Math.floor(t.crop[i] / 85)), owner?.era ?? 1), tx * px, ty * px, px, px);
      else if (f === F.ROAD) ctx.drawImage(roadTile(owner?.era ?? 0), tx * px, ty * px, px, px);
      else if (f === F.ROCK || f === F.ORE || f === F.GOLD || f === F.BERRY || f === F.STUMP || f === F.RUBBLE || f === F.CRATER) ctx.drawImage(featureSprite(f, variant, f === F.BERRY ? Math.min(4, t.featHp[i]) : 0), tx * px, ty * px, px, px);
      if (t.burnt[i]) { ctx.fillStyle = `rgba(30,24,22,${t.burnt[i] / 255 * 0.65})`; ctx.fillRect(tx * px, ty * px, px, px); }
      if (t.pollution[i] > 40) { ctx.fillStyle = `rgba(90,80,40,${Math.min(0.4, t.pollution[i] / 500)})`; ctx.fillRect(tx * px, ty * px, px, px); }
    }
    c.dirty = false; c.ready = true;
  }

  // ---------- frame ----------
  frame(dt, local) {
    const w = this.world; if (!w) return;
    this.time += dt;
    this.chunkBudget = 6;
    const c = this.cam;
    c.zoom += (c.tz - c.zoom) * Math.min(1, dt * 12);
    if (Math.abs(c.tz - c.zoom) < 0.001) c.zoom = c.tz;
    // consume simulation fx
    for (const e of w.fx) { if (e.t > this.fxSeen || (e._seq && e._seq > (this.fxSeq || 0))) this.onFx(e); }
    if (w.fx.length) { this.fxSeen = w.fx[w.fx.length - 1].t; this.fxSeq = w.fx[w.fx.length - 1]._seq; }
    this.fx.step(dt);
    if (this.mapDirty) { this.mapCtx.putImageData(this.mapImg, 0, 0); this.mapDirty = false; }
    if (this.ownerDirty && (this.time - (this._ownT || 0) > 0.5)) { this.refreshOwner(); this.ownerDirty = false; this._ownT = this.time; }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const shake = this.fx.shake;
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const mode = this.mode;
    if (this.menuMode) { this.drawSpace(ctx); return; }
    if (mode === 'surface') this.drawSurface(ctx, dt, local);
    else if (mode === 'regional') this.drawRegional(ctx, 1);
    else this.drawSpace(ctx);
    // crossfade regional <-> globe
    if (c.zoom < ZOOM.GLOBE * 1.6 && c.zoom >= ZOOM.GLOBE) { ctx.globalAlpha = 1 - (c.zoom - ZOOM.GLOBE) / (ZOOM.GLOBE * 0.6); this.drawSpace(ctx, true); ctx.globalAlpha = 1; }
    if (c.zoom < ZOOM.SURFACE * 1.3 && c.zoom >= ZOOM.SURFACE) { ctx.globalAlpha = 1 - (c.zoom - ZOOM.SURFACE) / (ZOOM.SURFACE * 0.3); this.drawRegional(ctx, 1, true); ctx.globalAlpha = 1; }
    if (this.fx.flash > 0) { ctx.fillStyle = `rgba(255,255,240,${this.fx.flash * ((this.settings.flash ?? 100) / 100) * 0.6})`; ctx.fillRect(-20, -20, this.W + 40, this.H + 40); }
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
    const useLpc = LPC.ready && style === 'lpc';
    const usePack = !useLpc && PACK.ready && style !== 'procedural';
    const key = `${p.id}|${era}|${p.role}|${col}|${useLpc ? 'L' : usePack ? 'P' : 'R'}|${p.age < 14 ? 'c' : p.age > 58 ? 'o' : 'a'}|${p.race}`;
    let e = this.sheets.get(key);
    if (e) { e.used = this.time; return e; }
    if (this.sheetBudget-- <= 0) return this.lastSheet?.get(p.id) || null;
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
      if (BIOMES[b].water && T >= 14) { ctx.globalAlpha = 0.5; ctx.drawImage(groundTile(b, (x * 7 + y) & 3, frame), sx, sy, T + 0.5, T + 0.5); ctx.globalAlpha = 1; continue; }
      if (t.water[i] > 0.04) { ctx.fillStyle = `rgba(70,140,210,${Math.min(0.75, t.water[i] * 0.6)})`; ctx.fillRect(sx, sy, T + 0.5, T + 0.5); if (Math.sin(this.time * 3 + x + y * 2) > 0.85) { ctx.fillStyle = 'rgba(200,230,255,0.5)'; ctx.fillRect(sx + T * 0.3, sy + T * 0.5, T * 0.3, Math.max(1, T / 16)); } }
      const sn = a.snow[cellAt(a, x, y)];
      if (sn > 0.15 && !BIOMES[b].water && b !== B.ICE && b !== B.PEAK) { ctx.fillStyle = `rgba(244,248,255,${Math.min(0.8, sn * 0.9)})`; ctx.fillRect(sx, sy, T + 0.5, T + 0.5); }
    }
    // territory borders
    if (this.overlay === 'borders' || this.settings.alwaysBorders) this.drawBorders(ctx, tx0, tx1, ty0, ty1);

    // ---- y-sorted sprites ----
    const list = [];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * W + wrap(x, W);
      if (t.feat[i] === F.TREE) list.push({ y: y + 0.95, k: 0, x, ty: y, i });
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
    list.sort((A, Bv) => A.y - Bv.y);
    const s = T / 32;
    for (const e of list) {
      if (e.k === 0) { // tree
        const i = e.i, b = t.biome[i], kind = TREE_KIND[b] || 'oak', variant = (e.x * 3 + e.ty) & 1;
        const snowy = a.snow[cellAt(a, e.x, e.ty)] > 0.3 || b === B.TUNDRA;
        const img = treeSprite(kind, variant, snowy);
        const [sx, sy] = this.worldToScreen(e.x, e.ty);
        const sway = Math.sin(this.time * 1.5 + e.x * 0.7 + e.ty) * windAt(a, e.x, e.ty)[0] * 0.02 * s;
        ctx.save(); ctx.translate(Math.round(sx + T / 2), Math.round(sy + T)); ctx.transform(1, 0, sway * 0.4, 1, 0, 0);
        ctx.drawImage(img, -16 * s, -46 * s, 32 * s, 48 * s); ctx.restore();
      } else if (e.k === 1) this.drawBuilding(ctx, e.b, s);
      else if (e.k === 2) { const an = e.a, [sx, sy] = this.worldToScreen(an.x, an.y), img = animalSprite(an.kind, an.moving ? Math.floor(this.time * 6) % 2 : 0, an.dead); ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); if (an.facing < 0) ctx.scale(-1, 1); ctx.drawImage(img, -18 * s, -30 * s, 36 * s, 32 * s); ctx.restore(); }
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
    const [sx, sy] = this.worldToScreen(b.x, b.y + b.h);
    const Wd = b.w * 32 * s, Hd = (b.h * 32 + ROOF_PAD) * s;
    if (!b.built) {
      const prog = clamp(b.progress, 0, 1), vis = Math.floor((b.h * 32 + ROOF_PAD) * prog);
      ctx.globalAlpha = 0.35; ctx.drawImage(img, sx, sy - Hd, Wd, Hd); ctx.globalAlpha = 1;
      if (vis > 0) ctx.drawImage(img, 0, img.height - vis, img.width, vis, sx, sy - vis * s, Wd, vis * s);
      ctx.drawImage(scaffold(b.w, b.h), sx, sy - Hd, Wd, Hd);
    } else ctx.drawImage(img, Math.round(sx), Math.round(sy - Hd), Wd, Hd);
    if (b.type === 'campfire' || (b.type === 'center' && (b.era ?? 0) === 0) || (b.type === 'research' && (b.era ?? 0) === 0)) this.drawFlame(ctx, sx + Wd / 2, sy - 6 * s, s * (b.type === 'campfire' ? 1 : 1.3));
    if (b.type === 'center' && n?.flagSet !== false && n?.flag) { // flagpole with the nation's banner
      const fx = sx + Wd - 6 * s, fy = sy - Hd + 2 * s;
      ctx.fillStyle = '#5a4632'; ctx.fillRect(fx, fy, Math.max(1, 2 * s), Hd * 0.75);
      const f = flagCanvas(n.flag, 24, 16, (this.time * 0.8) % 1);
      ctx.drawImage(f, fx + 2 * s, fy + 1 * s, 24 * s * 0.8, 16 * s * 0.8);
    }
    if ((b.type === 'kitchen' || b.type === 'factory' || (b.era >= 6 && b.type === 'hut')) && b.built && Math.random() < 0.06) this.fx.add({ x: b.x + b.w * 0.3, y: b.y + 0.2, z: 1.8, vx: windAt(w.atmo, b.x, b.y)[0] * 0.05, vy: 0, vz: 0.6, life: 2.4, age: 0, col: b.type === 'factory' ? '#555' : '#ccc', size: 2, grav: -0.1, kind: 'puff' });
    if (set && set.until?.shield > w.time && b.type === 'center') { ctx.strokeStyle = 'rgba(127,232,240,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx + Wd / 2, sy, set.radius * this.cam.zoom, set.radius * this.cam.zoom * 0.6, 0, Math.PI, 0); ctx.stroke(); }
  }
  drawFlame(ctx, x, y, s) {
    const t = this.time * 10;
    for (let k = 0; k < 5; k++) { const h = (6 + Math.sin(t + k * 1.7) * 3) * s, wv = 3 * s; ctx.fillStyle = k < 2 ? '#ff6a1a' : k < 4 ? '#ffb347' : '#fff2a8'; ctx.fillRect(x - wv + k * s * 1.2 - 2 * s, y - h, wv * (k < 4 ? 1 : 0.6), h); }
  }
  drawFire(ctx, x, y, f, s) {
    const [sx, sy] = this.worldToScreen(x, y), T = this.cam.zoom;
    const n = 2 + Math.floor(f / 80);
    for (let k = 0; k < n; k++) this.drawFlame(ctx, sx + T * (0.25 + 0.5 * hash2(x + k, y)), sy + T * (0.6 + 0.3 * hash2(y, x + k)), s * (0.8 + f / 300));
    if (Math.random() < 0.25) { const [u, v] = windAt(this.world.atmo, x, y); this.fx.add({ x: x + 0.5, y: y + 0.5, z: 1.5, vx: u * 0.08, vy: v * 0.04, vz: 1, life: 2.5, age: 0, col: Math.random() < 0.5 ? '#3a3330' : '#5a5250', size: 2.5, grav: -0.2, kind: 'puff' }); }
  }

  drawPawn(ctx, p, s, dt) {
    const w = this.world, [sx, sy] = this.worldToScreen(p.rx, p.ry);
    const rd = this.ragdolls.get(p.id);
    const sh = this.sheetFor(p);
    const scale = (p.age < 14 ? 0.55 + (p.age / 14) * 0.4 : 1) * (1 + (p.fx?.size || 0)) * (p.look?.height || 1);
    const S = s * scale;
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
    if (sh.lpc) {
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
    if (lying && !sh.lpc) { ctx.rotate(-Math.PI / 2); ctx.translate(-4 * S, -fw / 2 * S + 8 * S); }
    if (!sh.pack && !sh.lpc && (p.facing || 1) < 0) ctx.scale(-1, 1);
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
    if (dark < 0.03) return;
    if (!this.nightCanvas || this.nightCanvas.width !== this.W || this.nightCanvas.height !== this.H) { this.nightCanvas = makeCanvas(this.W, this.H); this.nightCtx = this.nightCanvas.getContext('2d'); }
    const nc = this.nightCtx;
    nc.globalCompositeOperation = 'source-over';
    // multiply tint: deep blue night that keeps colours readable
    const tr = Math.round(255 - (255 - 70) * dark / 0.62), tg = Math.round(255 - (255 - 86) * dark / 0.62), tb = Math.round(255 - (255 - 160) * dark / 0.62);
    nc.clearRect(0, 0, this.W, this.H); nc.fillStyle = `rgb(${tr},${tg},${tb})`; nc.fillRect(0, 0, this.W, this.H);
    nc.globalCompositeOperation = 'destination-out';
    const T = c.zoom;
    const light = (x, y, r, a = 1) => { const [sx, sy] = this.worldToScreen(x, y); const g = nc.createRadialGradient(sx, sy, 0, sx, sy, r * T); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); nc.fillStyle = g; nc.fillRect(sx - r * T, sy - r * T, r * T * 2, r * T * 2); };
    for (const e of list) {
      if (e.k === 1 && e.b.built) { const b = e.b; const r = b.type === 'campfire' ? 4 : b.type === 'center' ? 5 : (b.era >= 6 ? 3.5 : 2.2); light(b.x + b.w / 2, b.y + b.h * 0.7, r, b.type === 'campfire' || b.type === 'center' ? 0.95 : 0.7); }
      if (e.k === 4) light(e.x + 0.5, e.ty + 0.5, 3, 0.9);
    }
    for (const r of this.fx.rings) light(r.x, r.y, 6, 0.8);
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
    if (this.powerPreview) { const pp = this.powerPreview, [sx, sy] = this.worldToScreen(pp.x, pp.y); ctx.strokeStyle = pp.ok ? 'rgba(255,211,77,0.9)' : 'rgba(232,72,77,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(0.6, pp.r) * T, Math.max(0.6, pp.r) * T * 0.7, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
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
    const sx0 = this.W / 2 - c.x * T, sy0 = this.H / 2 - c.y * T;
    ctx.imageSmoothingEnabled = false;
    for (let k = -1; k <= 1; k++) {
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
      for (let k = -1; k <= 1; k++) ctx.drawImage(this.cloudCanvas, sx0 + k * W * T - CS * T / 2, sy0 - CS * T / 2, a.GW * CS * T, a.GH * CS * T);
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
  drawSpace(ctx, overlay = false) {
    const w = this.world, c = this.cam;
    if (!overlay) ctx.drawImage(this.globe.starfield(this.W, this.H), 0, 0);
    const R = this.globeRadius(), CX = this.W / 2 + (this.menuMode ? this.W * 0.17 : 0);
    const pxScale = Math.max(1, Math.round(R / 160));
    const D = clamp(Math.round((R * 2) / pxScale), 48, 420);
    const lon0 = ((c.x + 0.5) / w.W) * 2 * Math.PI - Math.PI;
    if (!overlay) {
      // sun glow
      const g = ctx.createRadialGradient(this.W * 0.85, this.H * 0.15, 0, this.W * 0.85, this.H * 0.15, this.W * 0.3);
      g.addColorStop(0, 'rgba(255,240,200,0.35)'); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
      this.globe.drawOrbiters(ctx, w, CX, this.H / 2, R, true);
    }
    // atmosphere halo
    const halo = ctx.createRadialGradient(CX, this.H / 2, R * 0.92, CX, this.H / 2, R * 1.12);
    halo.addColorStop(0, 'rgba(120,190,255,0.55)'); halo.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(CX, this.H / 2, R * 1.12, 0, 7); ctx.fill();
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
