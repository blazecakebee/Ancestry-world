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
export const FLAG_PATTERNS = ['solid', 'bicolorH', 'bicolorV', 'tricolorV', 'tricolorH', 'cross', 'nordic', 'saltire', 'canton', 'chevron', 'diagonal', 'border', 'quartered'];
export const FLAG_EMBLEMS = ['none', 'sun', 'moon', 'star', 'tree', 'mountain', 'eye', 'wave', 'crown', 'sword', 'wheat', 'glitter', 'skull', 'heart'];
const EMB = { sun: 'sun', moon: 'moon', star: 'star', tree: 'tree', mountain: 'mountain', eye: 'eye', wave: 'wave', crown: 'crown', sword: 'sword', wheat: 'wheat', glitter: 'glitter', skull: 'skull', heart: 'heart' };
/** Draw a flag at pixel size W x H (24x16 native). wave: 0..1 animation phase (0 = flat). */
export function flagCanvas(flag, W = 24, H = 16, wave = 0) {
  if (!flag) flag = { pattern: 'solid', c1: '#888888', c2: '#444444', c3: '#ffffff', emblem: 'none', ec: '#ffffff' };
  const key = `fl${JSON.stringify(flag)}|${W}|${H}|${Math.round(wave * 4)}`;
  return memo(key, () => {
    const b = new PixBuf(W, H), c1 = hexC(flag.c1), c2 = hexC(flag.c2), c3 = hexC(flag.c3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H; let c = c1;
      switch (flag.pattern) {
        case 'bicolorH': c = v < 0.5 ? c1 : c2; break;
        case 'bicolorV': c = u < 0.5 ? c1 : c2; break;
        case 'tricolorV': c = u < 1 / 3 ? c1 : u < 2 / 3 ? c2 : c3; break;
        case 'tricolorH': c = v < 1 / 3 ? c1 : v < 2 / 3 ? c2 : c3; break;
        case 'cross': c = Math.abs(u - 0.5) < 0.09 || Math.abs(v - 0.5) < 0.12 ? c2 : c1; break;
        case 'nordic': c = Math.abs(u - 0.36) < 0.08 || Math.abs(v - 0.5) < 0.12 ? c2 : c1; break;
        case 'saltire': c = Math.abs(u - v) < 0.12 || Math.abs(u - (1 - v)) < 0.12 ? c2 : c1; break;
        case 'canton': c = u < 0.45 && v < 0.5 ? c2 : c1; break;
        case 'chevron': c = u < 0.4 * (1 - Math.abs(v - 0.5) * 2) ? c2 : c1; break;
        case 'diagonal': c = u + v < 1 ? c1 : c2; break;
        case 'border': c = u < 0.1 || u > 0.9 || v < 0.14 || v > 0.86 ? c2 : c1; break;
        case 'quartered': c = (u < 0.5) !== (v < 0.5) ? c2 : c1; break;
      }
      b.set(x, y, c);
    }
    if (flag.emblem && flag.emblem !== 'none' && ICONS[EMB[flag.emblem]]) {
      const ic = ICONS[EMB[flag.emblem]], ec = hexC(flag.ec || '#ffffff');
      const s = Math.max(1, Math.floor(H / 14)), ox = Math.floor(W / 2 - 6 * s), oy = Math.floor(H / 2 - 6 * s);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const ch = ic[y][x]; if (ch !== '.' && ch !== 'k') b.rect(ox + x * s, oy + y * s, s, s, ec); }
    }
    if (wave) { // simple cloth wave: shade columns
      for (let x = 0; x < W; x++) { const f = 1 + Math.sin(x / W * Math.PI * 2 + wave * Math.PI * 2) * 0.12; for (let y = 0; y < H; y++) { const c = b.d[y * W + x]; if (c) b.d[y * W + x] = shadeC(c, f); } }
    }
    return b.toCanvas();
  });
}

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
export function iconURL(name, scale = 2) {
  const k = name + scale; if (urlCache.has(k)) return urlCache.get(k);
  const u = iconCanvas(name, scale).toDataURL(); urlCache.set(k, u); return u;
}
export const iconHTML = (name, scale = 2, cls = 'px-icon') => `<img class="${cls}" src="${iconURL(name, scale)}" alt="" draggable="false">`;
export function iconImg(name, scale = 2, cls = 'px-icon') { const i = document.createElement('img'); i.className = cls; i.src = iconURL(name, scale); i.alt = ''; i.draggable = false; return i; }

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
