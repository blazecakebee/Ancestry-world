// Animals, flags, UI icons (from the hand-made icon maps), emotes, space objects.
import { PixBuf, rgba, C, shadeC, hexC, makeCanvas } from './pixel.js';
import { ICONS, ICON_PALETTE } from './iconmaps.js';

const cache = new Map();
const memo = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); } return v; };

// ---------- animals (side view, 2 walk frames) ----------
const ANIMAL_LOOK = {
  deer: { body: [168, 118, 72], belly: [226, 200, 160], w: 14, h: 7, leg: 6, neck: 5, antler: true },
  boar: { body: [96, 70, 56], belly: [120, 92, 72], w: 13, h: 7, leg: 3, neck: 1, tusk: true },
  wolf: { body: [130, 130, 136], belly: [196, 196, 200], w: 13, h: 6, leg: 5, neck: 2, tail: true },
  bear: { body: [100, 68, 46], belly: [120, 86, 60], w: 18, h: 10, leg: 5, neck: 1 },
  camel: { body: [200, 160, 104], belly: [220, 190, 140], w: 16, h: 7, leg: 9, neck: 7, hump: true },
  elephant: { body: [140, 140, 150], belly: [160, 160, 170], w: 22, h: 13, leg: 7, neck: 0, trunk: true },
  mammoth: { body: [120, 80, 56], belly: [140, 96, 66], w: 24, h: 14, leg: 7, neck: 0, trunk: true, fur: true },
  sheep: { body: [236, 232, 220], belly: [210, 206, 196], w: 12, h: 7, leg: 4, neck: 1, wool: true },
};
export function animalSprite(kind, frame, dead = false) {
  return memo(`a${kind}|${frame}|${dead}`, () => {
    const L = ANIMAL_LOOK[kind] || ANIMAL_LOOK.deer;
    const W = 36, H = 32, b = new PixBuf(W, H);
    const body = C(L.body), belly = C(L.belly), dark = shadeC(body, 0.7);
    const bx = 18 - L.w / 2, by = H - 2 - L.leg - L.h;
    for (const [lx, ph] of [[bx + 2, 0], [bx + 4, 1], [bx + L.w - 4, 1], [bx + L.w - 2, 0]]) { const lift = frame === ph ? 1 : 0; b.rect(lx, by + L.h - 1, 2, L.leg + 1 - lift, ph ? dark : body); }
    b.ellipse(bx + L.w / 2, by + L.h / 2, L.w / 2, L.h / 2, body);
    b.ellipse(bx + L.w / 2, by + L.h * 0.75, L.w / 2 - 2, L.h / 4, belly);
    if (L.wool) for (let k = 0; k < 10; k++) b.set(bx + 2 + (k * 5) % (L.w - 2), by + 1 + (k * 3) % (L.h - 2), rgba(250, 248, 240));
    if (L.fur) for (let x = bx; x < bx + L.w; x += 2) b.vline(x, by + L.h - 2, by + L.h + 2, dark);
    if (L.hump) b.ellipse(bx + L.w / 2, by, 4, 3, body);
    const hx = bx + L.w - 1, hy = by - L.neck + 1;
    if (L.neck) b.rect(hx - 2, hy, 3, L.neck + 2, body);
    b.ellipse(hx + 2, hy, kind === 'bear' ? 4 : 3, 3, body); b.set(hx + 3, hy - 1, rgba(20, 16, 16));
    if (L.antler) { const a = rgba(220, 200, 160); b.vline(hx + 1, hy - 7, hy - 3, a); b.set(hx, hy - 6, a); b.set(hx + 2, hy - 7, a); b.set(hx + 3, hy - 5, a); }
    if (L.tusk) b.set(hx + 5, hy + 2, rgba(250, 250, 240));
    if (L.trunk) { b.vline(hx + 5, hy, hy + L.h - 2, body); b.set(hx + 6, hy + L.h - 2, body); b.line(hx + 4, hy + 3, hx + 8, hy + 6, rgba(250, 246, 230)); }
    if (L.tail) b.line(bx, by + 1, bx - 4, by - 1, body);
    b.rect(hx + 1, hy - 4, 2, 2, body);
    b.outline(rgba(26, 20, 24), 0.25);
    if (dead) { const c = makeCanvas(W, H), x = c.getContext('2d'); x.translate(W / 2, H / 2); x.rotate(Math.PI / 2); x.drawImage(b.toCanvas(), -W / 2, -H / 2); return c; }
    return b.toCanvas();
  });
}

// ---------- flags ----------
export const FLAG_PATTERNS = ['solid', 'bicolorH', 'bicolorV', 'tricolorV', 'tricolorH', 'cross', 'nordic', 'saltire', 'canton', 'chevron', 'diagonal', 'border', 'quartered',
  'stripes', 'stripesV', 'fess', 'pale', 'bend', 'pall', 'hoistTri', 'checker', 'diamond', 'disc', 'sunburst', 'bars', 'cantonCross', 'wedge', 'doubleBorder', 'halfDisc', 'gyron', 'triband2', 'frame'];
// geometric emblems are drawn from maths (sharp at any size); the rest reuse the hand-made 12x12 icon maps
const GEO = {
  circle: (x, y) => x * x + y * y < 0.8,
  ring: (x, y) => { const d = x * x + y * y; return d < 0.9 && d > 0.4; },
  crescent: (x, y) => x * x + y * y < 0.9 && (x - 0.38) * (x - 0.38) + y * y > 0.55,
  star5: (x, y) => { const r = Math.hypot(x, y), a = Math.atan2(x, -y); return r < 0.34 + 0.66 * Math.pow(Math.abs(Math.cos(2.5 * a)), 2.2); },
  star8: (x, y) => { const r = Math.hypot(x, y), a = Math.atan2(y, x); return r < 0.3 + 0.7 * Math.pow(Math.abs(Math.cos(4 * a)), 3); },
  diamondE: (x, y) => Math.abs(x) + Math.abs(y) < 0.95,
  plus: (x, y) => (Math.abs(x) < 0.26 && Math.abs(y) < 0.95) || (Math.abs(y) < 0.26 && Math.abs(x) < 0.95),
  triangle: (x, y) => y > -0.8 && y < 0.8 && Math.abs(x) < (y + 0.8) * 0.6,
  hexagon: (x, y) => Math.abs(y) < 0.85 && Math.abs(x) * 0.866 + Math.abs(y) * 0.5 < 0.85,
  sunrays: (x, y) => { const r = Math.hypot(x, y), a = Math.atan2(y, x); return r < 0.42 || (r < 0.98 && r > 0.55 && Math.cos(a * 8) > 0.35); },
  chevrons: (x, y) => { const t = Math.abs(x) * 0.9 + 0.5 - y; return Math.abs(((t * 3 % 2) + 2) % 2 - 1) < 0.35 && Math.abs(x) < 0.95 && y > -0.75 && y < 0.8; },
  bolt: (x, y) => { const u = x + 0.1, v = y; return (v > -0.95 && v < 0.05 && Math.abs(u + v * 0.35 + 0.1) < 0.28) || (v >= 0 && v < 0.95 && Math.abs(u + v * 0.35 - 0.25) < 0.28); },
  arrow: (x, y) => (Math.abs(x) < 0.17 && y > -0.2 && y < 0.95) || (y <= -0.2 && y > -0.95 && Math.abs(x) < (y + 0.95) * 0.9),
  ankh: (x, y) => (Math.abs(x) < 0.15 && y > -0.1 && y < 0.95) || (Math.abs(y - 0.25) < 0.15 && Math.abs(x) < 0.6) || (() => { const d = Math.hypot(x, (y + 0.45) * 1.15); return d < 0.52 && d > 0.28; })(),
  anchor: (x, y) => (Math.abs(x) < 0.12 && y > -0.7 && y < 0.8) || (Math.abs(y + 0.35) < 0.12 && Math.abs(x) < 0.4) || (Math.hypot(x, y + 0.75) < 0.2 && Math.hypot(x, y + 0.75) > 0.07) || (y > 0.3 && y < 0.85 && Math.abs(Math.hypot(x, y - 0.15) - 0.7) < 0.14),
  fleur: (x, y) => (Math.abs(x) < 0.13 && y > -0.9 && y < 0.8) || (Math.hypot(x * 0.8 - 0.42, y - 0.05) < 0.34 && x > 0.12) || (Math.hypot(x * 0.8 + 0.42, y - 0.05) < 0.34 && x < -0.12) || (y > 0.45 && y < 0.7 && Math.abs(x) < 0.55) || (y < -0.2 && Math.abs(x) < (y + 0.9) * 0.45),
  paw: (x, y) => Math.hypot(x, y - 0.35) < 0.5 || [[-0.6, -0.2], [-0.22, -0.55], [0.22, -0.55], [0.6, -0.2]].some(([a, b]) => Math.hypot(x - a, y - b) < 0.24),
  tower: (x, y) => (Math.abs(x) < 0.45 && y > -0.35 && y < 0.95) || (y <= -0.35 && y > -0.85 && Math.abs(x) < 0.6 && (Math.floor((x + 0.6) / 0.24) % 2 === 0)),
};
const GEO_NAMES = Object.keys(GEO);
const ICON_EMBLEMS = ['sun', 'moon', 'star', 'tree', 'mountain', 'eye', 'wave', 'crown', 'sword', 'wheat', 'glitter', 'skull', 'heart', 'dove', 'gem', 'shield', 'flask', 'hammer', 'temple', 'house', 'fire', 'storm', 'rain', 'wind', 'ring', 'trophy', 'rocket', 'bulb', 'book', 'scroll', 'sickle', 'cradle', 'hand'];
export const FLAG_EMBLEMS = ['none', ...ICON_EMBLEMS, ...GEO_NAMES];
export const FLAG_EMBLEM_POS = [['c', 'Centre'], ['h', 'Hoist'], ['t', 'Canton'], ['f', 'Fly']];
export const FLAG_EMBLEM_SIZE = [[0.6, 'Small'], [0.85, 'Medium'], [1.1, 'Large']];
const PAT = {
  bicolorH: (u, v) => v < 0.5 ? 0 : 1, bicolorV: (u, v) => u < 0.5 ? 0 : 1,
  tricolorV: (u) => (u < 1 / 3 ? 0 : u < 2 / 3 ? 1 : 2), tricolorH: (u, v) => (v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2),
  cross: (u, v) => Math.abs(u - 0.5) < 0.09 || Math.abs(v - 0.5) < 0.12 ? 1 : 0,
  nordic: (u, v) => Math.abs(u - 0.36) < 0.08 || Math.abs(v - 0.5) < 0.12 ? 1 : 0,
  saltire: (u, v) => Math.abs(u - v) < 0.12 || Math.abs(u - (1 - v)) < 0.12 ? 1 : 0,
  canton: (u, v) => u < 0.45 && v < 0.5 ? 1 : 0,
  chevron: (u, v) => u < 0.4 * (1 - Math.abs(v - 0.5) * 2) ? 1 : 0,
  diagonal: (u, v) => u + v < 1 ? 0 : 1,
  border: (u, v) => u < 0.1 || u > 0.9 || v < 0.14 || v > 0.86 ? 1 : 0,
  quartered: (u, v) => (u < 0.5) !== (v < 0.5) ? 1 : 0,
  stripes: (u, v) => Math.floor(v * 7) % 2 ? 1 : 0,
  stripesV: (u) => Math.floor(u * 7) % 2 ? 1 : 0,
  fess: (u, v) => Math.abs(v - 0.5) < 0.17 ? 1 : 0,
  pale: (u) => Math.abs(u - 0.5) < 0.17 ? 1 : 0,
  bend: (u, v) => Math.abs(u - v) < 0.14 ? 1 : 0,
  pall: (u, v) => (v > 0.5 && Math.abs(u - 0.5) < 0.1) || (v <= 0.5 && (Math.abs(u - 0.5 - (0.5 - v)) < 0.1 || Math.abs(u - 0.5 + (0.5 - v)) < 0.1)) ? 1 : 0,
  hoistTri: (u, v) => u < 0.5 * (1 - Math.abs(v - 0.5) * 2) * 1.6 ? 1 : 0,
  checker: (u, v) => (Math.floor(u * 6) + Math.floor(v * 4)) % 2 ? 1 : 0,
  diamond: (u, v) => Math.abs(u - 0.5) * 1.1 + Math.abs(v - 0.5) * 1.55 < 0.62 ? 1 : 0,
  disc: (u, v) => Math.hypot((u - 0.5) * 1.5, v - 0.5) < 0.34 ? 1 : 0,
  halfDisc: (u, v) => Math.hypot((u - 0.5) * 1.5, v - 1) < 0.62 ? 1 : 0,
  sunburst: (u, v) => Math.floor((Math.atan2(v - 0.5, (u - 0.5) * 1.5) + Math.PI) / (Math.PI * 2) * 16) % 2 ? 1 : 0,
  bars: (u, v) => Math.floor((u + v) * 7) % 2 ? 1 : 0,
  cantonCross: (u, v) => (u < 0.5 && v < 0.55) ? ((Math.abs(u - 0.25) < 0.05 || Math.abs(v - 0.275) < 0.07) ? 0 : 1) : 0,
  wedge: (u, v) => v > 0.5 ? (u < 1 - (v - 0.5) * 2 ? 1 : 0) : (u < 1 - (0.5 - v) * 2 ? 1 : 0),
  doubleBorder: (u, v) => { const e = Math.min(u * 0.66, (1 - u) * 0.66, v, 1 - v); return e < 0.07 || (e > 0.12 && e < 0.17) ? 1 : 0; },
  gyron: (u, v) => u < 0.5 && v > 0.5 && (u + (1 - v)) < 0.5 ? 1 : 0,
  triband2: (u, v) => v < 0.25 || v > 0.75 ? 1 : 0,
  frame: (u, v) => Math.min(u * 0.66, (1 - u) * 0.66, v, 1 - v) < 0.2 ? 1 : 0,
};
const needsC3 = (p) => p === 'tricolorV' || p === 'tricolorH';
/** Draw a flag at pixel size W x H (24x16 native). wave: 0..1 animation phase (0 = flat).
 *  flag: pattern, c1, c2, c3, emblem, ec; optional ep (position), es (size), eo (outline), em (mirror pattern) */
export function flagCanvas(flag, W = 24, H = 16, wave = 0) {
  if (!flag) flag = { pattern: 'solid', c1: '#888888', c2: '#444444', c3: '#ffffff', emblem: 'none', ec: '#ffffff' };
  const key = `fl${JSON.stringify(flag)}|${W}|${H}|${Math.round(wave * 4)}`;
  return memo(key, () => {
    const b = new PixBuf(W, H), cols = [hexC(flag.c1), hexC(flag.c2), hexC(flag.c3)], pf = PAT[flag.pattern];
    const flip = flag.em ? 1 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let u = (x + 0.5) / W; const v = (y + 0.5) / H; if (flip) u = 1 - u;
      b.set(x, y, pf ? cols[pf(u, v)] || cols[0] : cols[0]);
    }
    const em = flag.emblem;
    if (em && em !== 'none') {
      const geo = GEO[em], ic = !geo && ICONS[em];
      if (geo || ic) {
        const ec = hexC(flag.ec || '#ffffff'), sz = Math.max(0.4, Math.min(1.3, +flag.es || 0.85));
        const pos = flag.ep || 'c', k = pos === 't' ? 0.55 : 1;
        const half = H * 0.5 * sz * k, cx = pos === 'h' ? W * 0.27 : pos === 't' ? W * 0.24 : pos === 'f' ? W * 0.73 : W / 2, cy = pos === 't' ? H * 0.27 : H / 2;
        const mask = new Uint8Array(W * H);
        const x0 = Math.max(0, Math.floor(cx - half)), x1 = Math.min(W - 1, Math.ceil(cx + half)), y0 = Math.max(0, Math.floor(cy - half)), y1 = Math.min(H - 1, Math.ceil(cy + half));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = (x + 0.5 - cx) / half, py = (y + 0.5 - cy) / half; let on = false;
          if (geo) on = geo(px, py);
          else { const ix = Math.floor((px + 1) * 6), iy = Math.floor((py + 1) * 6); if (ix >= 0 && ix < 12 && iy >= 0 && iy < 12) { const ch = ic[iy][ix]; on = ch !== '.' && ch !== 'k'; } }
          if (on) mask[y * W + x] = 1;
        }
        if (flag.eo) { const dk = rgba(18, 18, 28); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!mask[y * W + x] && ((x > 0 && mask[y * W + x - 1]) || (x < W - 1 && mask[y * W + x + 1]) || (y > 0 && mask[(y - 1) * W + x]) || (y < H - 1 && mask[(y + 1) * W + x]))) b.set(x, y, dk); }
        for (let i = 0; i < W * H; i++) if (mask[i]) b.set(i % W, (i / W) | 0, ec);
      }
    }
    if (wave) { // simple cloth wave: shade columns
      for (let x = 0; x < W; x++) { const f = 1 + Math.sin(x / W * Math.PI * 2 + wave * Math.PI * 2) * 0.12; for (let y = 0; y < H; y++) { const c = b.d[y * W + x]; if (c) b.d[y * W + x] = shadeC(c, f); } }
    }
    return b.toCanvas();
  });
}
export { needsC3 };

// ---------- UI icons ----------
export function iconCanvas(name, scale = 2) {
  return memo(`i${name}|${scale}`, () => {
    const map = ICONS[name] || ICONS.info;
    const c = makeCanvas(12 * scale, 12 * scale), x = c.getContext('2d');
    for (let y = 0; y < 12; y++) for (let i = 0; i < 12; i++) { const col = ICON_PALETTE[map[y][i]]; if (col) { x.fillStyle = col; x.fillRect(i * scale, y * scale, scale, scale); } }
    return c;
  });
}
const urlCache = new Map();
const VA_BASE = typeof document !== 'undefined' ? new URL('../../assets/packs/verarc/', import.meta.url).href : '';
const RV_BASE = typeof document !== 'undefined' ? new URL('../../assets/packs/raven/', import.meta.url).href : '';
// Every interface icon name maps onto the newer Raven (rv:) art; unmapped names (pause/play/close/arrows…) stay as crisp hand-made glyphs.
export const UI_REMAP = { gem: 'rv:161' };
// Pixel Atlas (CC0) 16x16 outlined icons, preferred for every UI name it covers.
const ATLAS = new Set('multiplayer angry baby book bulb chat cloth cloud cradle crown dove eye fire flag flask food gear glitter globe hammer hand heart house info inspect load lock love map meals medicine metal moon mountain pin plan pop possess rain rations research ring rocket satellite save scroll settings shield shirt sickle skull star stone storm sun sword temple tree trophy unlock users volume warning wave wheat wind wood'.split(' '));
const AT_BASE = typeof document !== 'undefined' ? new URL('../../assets/packs/atlas/', import.meta.url).href : '';
const isVA = (n) => typeof n === 'string' && (n.startsWith('va:') || n.startsWith('rv:') || n.startsWith('at:'));
const vaURL = (n) => n.startsWith('at:') ? AT_BASE + n.slice(3) + '.png' : (n.startsWith('rv:') ? RV_BASE + n.slice(3) : VA_BASE + n.slice(3).replace(/[()]/g, '')) + '.png';
const resolve = (name) => (ATLAS.has(name) ? 'at:' + name : UI_REMAP[name] || name);
export function iconURL(name, scale = 2) {
  name = resolve(name);
  if (isVA(name)) return vaURL(name);
  const k = name + scale; if (urlCache.has(k)) return urlCache.get(k);
  const u = iconCanvas(name, scale).toDataURL(); urlCache.set(k, u); return u;
}
// remapped UI icons are 32px art shown in the same footprint the old 12px glyphs used (sm = 16px, normal = 32px; atlas icons are 16px art so they stay on whole pixels)
const remapPx = (scale, cls) => (/\bsm\b/.test(cls) ? 16 : 16 * Math.max(1, Math.round(scale)));
const vaStyle = (name, scale, cls) => (resolve(name) !== name && resolve(name).startsWith('at:') ? `width:${remapPx(scale, cls)}px;height:${remapPx(scale, cls)}px;image-rendering:pixelated` : UI_REMAP[name] ? `width:${remapPx(scale, cls)}px;height:${remapPx(scale, cls)}px;image-rendering:auto` : `width:${16 * scale}px;height:${16 * scale}px;image-rendering:pixelated`);
export const iconHTML = (name, scale = 2, cls = 'px-icon') => `<img class="${cls}" src="${iconURL(name, scale)}" alt="" draggable="false"${isVA(resolve(name)) ? ` style="${vaStyle(name, scale, cls)}"` : ''}>`;
export function iconImg(name, scale = 2, cls = 'px-icon') {
  const i = document.createElement('img'); i.className = cls; i.src = iconURL(name, scale);
  const rn = resolve(name), at = rn.startsWith('at:');
  if (isVA(rn)) { const px = at || UI_REMAP[name] ? remapPx(scale, cls) : 16 * scale; i.style.width = i.style.height = px + 'px'; i.style.imageRendering = !at && UI_REMAP[name] ? 'auto' : 'pixelated'; }
  i.alt = ''; i.draggable = false; return i;
}

// ---------- space ----------
export function spaceSprite(type) {
  return memo(`sp${type}`, () => {
    const b = new PixBuf(16, 16), w = rgba(220, 224, 234), g = rgba(120, 200, 255), d = rgba(90, 96, 110);
    if (type === 'satellite') { b.rect(6, 6, 4, 4, w); b.rect(1, 7, 4, 2, g); b.rect(11, 7, 4, 2, g); b.set(8, 4, d); }
    else if (type === 'station') { b.rect(3, 7, 10, 2, w); b.rect(7, 2, 2, 12, w); b.rect(0, 5, 3, 6, g); b.rect(13, 5, 3, 6, g); b.ellipse(8, 8, 2, 2, rgba(255, 220, 120)); }
    else if (type === 'ark') { b.rect(2, 6, 11, 4, w); b.rect(13, 7, 2, 2, rgba(255, 160, 60)); b.rect(1, 7, 1, 2, rgba(120, 240, 255)); b.rect(5, 4, 4, 2, d); b.rect(5, 10, 4, 2, d); }
    else { b.ellipse(8, 9, 4, 3, w); b.rect(5, 9, 6, 3, w); b.set(8, 5, rgba(255, 80, 80)); }
    b.outline(rgba(10, 10, 20), 0.2);
    return b.toCanvas();
  });
}
