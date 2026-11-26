// Procedural buildings for every era (hide tents -> mud houses -> stone -> timber -> brick -> concrete -> arcologies -> habitat domes).
import { PixBuf, rgba, C, shadeC, mixC, hexC } from './pixel.js';
import { RNG } from '../core/rng.js';
import { ERAS } from '../data/eras.js';

export const ROOF_PAD = 40; // extra pixels above the footprint for roofs & spires
const cache = new Map();

export function buildingSprite(type, era, w, h, nationColor = '#e8c547', variant = 0) {
  const key = `${type}|${era}|${w}|${h}|${nationColor}|${variant % 3}`;
  let c = cache.get(key); if (c) return c;
  const W = w * 32, H = h * 32 + ROOF_PAD;
  const b = new PixBuf(W, H);
  const r = new RNG(variant * 31 + era * 7 + type.length);
  const pal = ERAS[Math.min(era, 9)].palette;
  const nc = hexC(nationColor);
  const wall = C(pal.wall), roof = C(pal.roof), trim = C(pal.trim);
  const base = H - 2; // ground line
  const front = Math.round(h * 32 * 0.62); // visible wall height
  const ink = rgba(26, 20, 32);

  const windows = (x0, x1, y0, y1, glass, rows = 1, step = 9) => {
    for (let rr = 0; rr < rows; rr++) for (let x = x0 + 3; x < x1 - 5; x += step) { const y = y0 + 4 + rr * 9; if (y + 5 > y1) break; b.rect(x, y, 4, 5, glass); b.set(x, y, shadeC(glass, 1.4)); b.hline(x - 1, x + 4, y + 5, trim); }
  };
  const door = (cx, h2 = 10, col = rgba(70, 46, 30)) => { b.rect(cx - 3, base - h2, 6, h2, col); b.set(cx + 1, base - h2 / 2, rgba(230, 200, 90)); };
  const gable = (x0, x1, yTop, peak, col, overhang = 2) => {
    const cx = (x0 + x1) / 2;
    for (let y = yTop - peak; y <= yTop; y++) { const t = (y - (yTop - peak)) / peak; const hw = t * ((x1 - x0) / 2 + overhang); for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) b.set(x, y, (x + y) % 4 === 0 ? shadeC(col, 0.85) : x < cx ? col : shadeC(col, 0.9)); }
    b.hline(x0 - overhang, x1 + overhang, yTop, shadeC(col, 0.7));
  };
  const box = (x0, x1, y0, col) => { b.rect(x0, y0, x1 - x0, base - y0 + 1, col); b.vline(x0, y0, base, shadeC(col, 0.8)); b.hline(x0, x1 - 1, base, shadeC(col, 0.7)); };
  const sign = (x, y, kind) => {
    if (kind === 'cross') { b.rect(x, y, 9, 9, rgba(250, 250, 250)); b.rect(x + 3, y + 1, 3, 7, rgba(220, 40, 50)); b.rect(x + 1, y + 3, 7, 3, rgba(220, 40, 50)); }
    if (kind === 'book') { b.rect(x, y, 9, 6, rgba(240, 232, 210)); b.vline(x + 4, y, y + 5, rgba(120, 90, 60)); b.hline(x, x + 8, y + 6, rgba(120, 60, 50)); }
    if (kind === 'star') { for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0], [0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) b.set(x + dx, y + dy, rgba(255, 220, 90)); }
    if (kind === 'mug') { b.rect(x, y, 5, 6, rgba(230, 180, 70)); b.vline(x + 5, y + 1, y + 4, rgba(200, 150, 50)); b.hline(x, x + 4, y, rgba(250, 250, 250)); }
    if (kind === 'anvil') { b.rect(x, y + 2, 8, 3, rgba(70, 70, 78)); b.rect(x + 2, y + 5, 4, 3, rgba(60, 60, 66)); }
  };
  const banner = (x, y) => { b.vline(x, y - 4, y + 12, rgba(90, 70, 50)); b.rect(x + 1, y - 3, 6, 10, nc); b.set(x + 3, y + 7, nc); b.set(x + 2, y + 1, shadeC(nc, 1.3)); };
  const chimney = (x, y) => { b.rect(x, y, 4, 9, rgba(140, 80, 60)); b.hline(x - 1, x + 4, y, rgba(100, 60, 46)); };

  // ----- special types -----
  if (type === 'campfire') {
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.ellipse(W / 2 + Math.cos(a) * 7, base - 4 + Math.sin(a) * 3, 2, 2, rgba(120, 116, 110)); }
    b.line(W / 2 - 6, base - 3, W / 2 + 6, base - 6, rgba(110, 76, 48)); b.line(W / 2 - 6, base - 6, W / 2 + 6, base - 3, rgba(90, 62, 40));
    b.outline(); return finish(key, b);
  }
  if (type === 'shield') {
    b.rect(W / 2 - 4, base - 40, 8, 40, rgba(70, 80, 100)); b.vline(W / 2 - 4, base - 40, base, rgba(50, 58, 76)); b.ellipse(W / 2, base - 46, 7, 7, rgba(110, 240, 255)); b.ellipse(W / 2 - 2, base - 48, 3, 3, rgba(220, 255, 255));
    b.rect(W / 2 - 12, base - 6, 24, 6, rgba(90, 100, 120)); b.outline(); return finish(key, b);
  }
  if (type === 'launch') {
    b.rect(4, base - 8, W - 8, 8, rgba(110, 112, 120)); b.hline(4, W - 5, base - 8, rgba(150, 152, 160));
    const rx = W / 2; b.rect(rx - 5, base - 70, 10, 62, rgba(236, 238, 244)); b.vline(rx - 5, base - 70, base - 8, rgba(200, 204, 214));
    for (let y = 0; y < 10; y++) b.hline(rx - 5 + Math.floor(y / 2), rx + 4 - Math.floor(y / 2), base - 70 - y, rgba(220, 60, 60));
    b.rect(rx - 9, base - 22, 4, 14, rgba(200, 60, 60)); b.rect(rx + 5, base - 22, 4, 14, rgba(200, 60, 60)); b.rect(rx - 2, base - 50, 4, 4, nc);
    b.rect(rx + 14, base - 60, 4, 52, rgba(150, 120, 60)); for (let y = base - 58; y < base - 8; y += 6) b.hline(rx + 6, rx + 14, y, rgba(150, 120, 60));
    b.outline(); return finish(key, b, 34);
  }
  if (type === 'reactor') {
    for (let y = 0; y < 60; y++) { const t = y / 60, hw = 14 - Math.sin(t * Math.PI) * 4; b.hline(W * 0.3 - hw, W * 0.3 + hw, base - y, mixC(rgba(200, 200, 196), rgba(160, 160, 156), t)); }
    b.ellipse(W * 0.72, base - 14, 16, 16, era >= 8 ? rgba(210, 230, 240) : rgba(190, 196, 200)); b.rect(W * 0.72 - 16, base - 14, 32, 14, era >= 8 ? rgba(210, 230, 240) : rgba(190, 196, 200));
    if (era >= 8) b.ellipse(W * 0.72, base - 18, 5, 5, rgba(120, 240, 255));
    b.outline(); return finish(key, b, 20);
  }
  if (type === 'mine' && era < 8) {
    const hx = W / 2; b.rect(hx - 9, base - 12, 18, 12, rgba(60, 50, 44)); b.ellipse(hx, base - 12, 9, 6, rgba(60, 50, 44)); b.ellipse(hx, base - 9, 6, 6, rgba(20, 16, 16));
    const t = rgba(120, 86, 52); b.line(hx - 12, base, hx, base - 30, t); b.line(hx + 12, base, hx, base - 30, t); b.hline(hx - 7, hx + 7, base - 18, t); b.ellipse(hx, base - 30, 3, 3, rgba(80, 80, 86));
    b.rect(4, base - 6, 8, 6, rgba(110, 80, 50)); b.rect(5, base - 9, 6, 3, rgba(90, 90, 96));
    b.outline(); return finish(key, b);
  }

  // ----- dwellings by era -----
  const x0 = 3, x1 = W - 3;
  const top = base - front;
  if (era === 0) {
    const tent = type === 'temple' ? null : type === 'center' ? rgba(150, 112, 70) : rgba(156, 118, 76);
    if (type === 'temple') { for (let k = 0; k < 5; k++) { const x = 6 + k * ((W - 16) / 4); b.rect(x, base - 18 - (k % 2) * 6, 5, 18 + (k % 2) * 6, rgba(140, 136, 130)); b.vline(x, base - 18 - (k % 2) * 6, base, rgba(110, 106, 100)); } sign(W / 2, base - 30, 'star'); }
    else if (type === 'research' || type === 'center') {
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.ellipse(W / 2 + Math.cos(a) * 10, base - 6 + Math.sin(a) * 4, 2.5, 2, rgba(120, 116, 110)); }
      b.line(W / 2 - 7, base - 4, W / 2 + 7, base - 8, rgba(110, 76, 48)); b.line(W / 2 - 7, base - 8, W / 2 + 7, base - 4, rgba(90, 62, 40));
      if (type === 'center') { b.rect(W - 12, base - 34, 6, 34, rgba(130, 92, 56)); for (let y = base - 32; y < base - 4; y += 7) { b.rect(W - 13, y, 8, 4, r.pick([rgba(200, 60, 50), rgba(240, 200, 80), rgba(60, 120, 200)])); b.set(W - 11, y + 1, ink); b.set(W - 8, y + 1, ink); } }
      else { b.rect(W - 14, base - 16, 10, 12, rgba(140, 136, 128)); b.set(W - 11, base - 12, rgba(200, 60, 50)); b.line(W - 12, base - 8, W - 7, base - 13, rgba(200, 160, 60)); }
    } else {
      const cx = W / 2, hgt = Math.min(H - 6, front + 18);
      for (let y = 0; y < hgt; y++) { const hw = (y / hgt) * (W / 2 - 4); for (let x = -hw; x <= hw; x++) b.set(cx + x, base - hgt + y, (Math.floor(x + 100) % 6 < 1) ? shadeC(tent, 0.75) : x < 0 ? tent : shadeC(tent, 0.9)); }
      b.line(cx - 2, base - hgt - 4, cx + 2, base - hgt + 2, rgba(110, 80, 50)); b.line(cx + 3, base - hgt - 4, cx - 1, base - hgt + 2, rgba(110, 80, 50));
      for (let y = 0; y < 10; y++) b.hline(cx - y / 2.5, cx + y / 2.5, base - 10 + y, rgba(50, 34, 24));
      if (type === 'healer') { for (let k = 0; k < 3; k++) b.rect(6 + k * 4, base - 18, 2, 5, rgba(90, 160, 70)); sign(W - 13, base - 20, 'cross'); }
      if (type === 'storage') for (let k = 0; k < 3; k++) b.ellipse(8 + k * 8, base - 4, 3, 4, rgba(170, 130, 80));
    }
  } else if (era === 1) {
    box(x0, x1, top + 6, wall);
    b.ellipse(W / 2, top + 6, (x1 - x0) / 2 + 3, 14, roof);
    for (let k = 0; k < 14; k++) b.line(x0 + k * (W / 14), top + 2, x0 + k * (W / 14) - 2, top + 14, shadeC(roof, 0.8));
    b.rect(x0 - 2, top + 6, x1 - x0 + 5, base - top - front + 4 > 0 ? 0 : 0, roof);
    door(W / 2);
  } else if (era === 2) {
    box(x0, x1, top + 2, wall); b.hline(x0 - 1, x1, top + 2, shadeC(wall, 1.15)); b.rect(x0 - 1, top, x1 - x0 + 2, 3, shadeC(wall, 0.9));
    windows(x0, x1, top + 2, base - 12, rgba(40, 30, 30)); door(W / 2, 11, rgba(60, 40, 30));
    if (type === 'temple' || type === 'center') { for (let s = 0; s < 3; s++) b.rect(x0 + 4 + s * 4, top - 8 - s * 8, x1 - x0 - 8 - s * 8, 8, shadeC(wall, 1 - s * 0.06)); }
  } else if (era === 3) {
    box(x0, x1, top + 6, wall); gable(x0, x1, top + 6, 14, roof);
    windows(x0, x1, top + 6, base - 12, rgba(40, 36, 36)); door(W / 2);
    if (type === 'temple' || type === 'center') for (let x = x0 + 3; x < x1 - 2; x += 6) b.rect(x, top + 8, 3, base - top - 8, rgba(236, 232, 220));
  } else if (era === 4) {
    box(x0, x1, top + 8, rgba(232, 222, 200));
    for (let x = x0; x < x1; x += 7) b.vline(x, top + 8, base, rgba(96, 70, 48)); b.hline(x0, x1, top + 8, rgba(96, 70, 48)); b.hline(x0, x1, top + 18, rgba(96, 70, 48)); b.line(x0, base, x0 + 7, top + 18, rgba(96, 70, 48));
    gable(x0, x1, top + 8, 20, roof, 3); windows(x0, x1, top + 18, base - 10, rgba(250, 220, 140)); door(W / 2 + 4);
    if (type === 'temple') { b.rect(W / 2 - 4, top - 30, 8, 26, wall); for (let y = 0; y < 14; y++) b.hline(W / 2 - 4 + y / 3.5, W / 2 + 3 - y / 3.5, top - 30 - (14 - y), roof); sign(W / 2, top - 16, 'star'); }
    if (type === 'center') { b.rect(x0, top - 10, 8, base - top + 10, wall); b.rect(x1 - 8, top - 10, 8, base - top + 10, wall); for (const tx of [x0, x1 - 8]) for (let x = tx; x < tx + 8; x += 3) b.rect(x, top - 13, 2, 3, wall); }
  } else if (era <= 6) {
    const brick = era === 6 ? rgba(156, 84, 64) : rgba(200, 120, 84);
    box(x0, x1, top + 4, brick);
    for (let y = top + 6; y < base; y += 3) for (let x = x0 + ((y / 3) % 2) * 3; x < x1; x += 6) b.set(x, y, shadeC(brick, 0.82));
    gable(x0, x1, top + 4, era === 6 ? 10 : 16, era === 6 ? rgba(70, 72, 80) : rgba(190, 90, 60), 2);
    windows(x0, x1, top + 4, base - 11, era === 6 ? rgba(250, 210, 120) : rgba(160, 210, 240), 2);
    door(W / 2); if (era === 6) chimney(x1 - 10, top - 8);
    if (type === 'factory') { b.rect(x0, top - 6, x1 - x0, 6, rgba(90, 90, 96)); for (let x = x0; x < x1; x += 12) for (let y = 0; y < 8; y++) b.hline(x, x + y, top - 6 - 8 + y, rgba(110, 110, 118)); chimney(x0 + 6, top - 30); chimney(x0 + 16, top - 26); }
    if (type === 'temple') { b.rect(W / 2 - 5, top - 34, 10, 34, brick); for (let y = 0; y < 16; y++) b.hline(W / 2 - 5 + y / 3.2, W / 2 + 4 - y / 3.2, top - 50 + y, rgba(80, 100, 90)); sign(W / 2, top - 26, 'star'); }
  } else if (era === 7) {
    const conc = rgba(190, 192, 186);
    box(x0, x1, top - (type === 'hut' ? 12 : 6), conc); b.rect(x0 - 1, top - (type === 'hut' ? 14 : 8), x1 - x0 + 2, 3, rgba(150, 152, 148));
    windows(x0, x1, top - (type === 'hut' ? 12 : 6), base - 11, rgba(140, 200, 230), 4, 7); door(W / 2, 10, rgba(90, 110, 130));
    if (type === 'factory') { chimney(x0 + 6, top - 34); chimney(x0 + 18, top - 30); }
  } else if (era === 8) {
    const white = rgba(226, 236, 244), glass = rgba(80, 220, 240);
    const tall = type === 'hut' || type === 'center' ? 26 : 8;
    for (let y = top - tall; y <= base; y++) { const t = (y - (top - tall)) / (base - top + tall); const inset = t < 0.15 ? Math.round((0.15 - t) * 40) : 0; b.hline(x0 + inset, x1 - inset, y, white); }
    for (let y = top - tall + 8; y < base - 6; y += 7) b.hline(x0 + 3, x1 - 4, y, glass);
    b.vline(x0, top - tall + 4, base, rgba(190, 204, 216)); door(W / 2, 9, rgba(60, 200, 230));
  } else {
    const white = rgba(234, 236, 244), band = C(ERAS[9].palette.roof);
    b.ellipse(W / 2, base - 2, (x1 - x0) / 2, front + 8, white); b.rect(x0, base - 6, x1 - x0, 7, white);
    b.hline(x0 + 2, x1 - 3, base - front * 0.55, band); b.hline(x0 + 2, x1 - 3, base - front * 0.55 + 1, shadeC(band, 0.8));
    for (let x = x0 + 6; x < x1 - 6; x += 8) b.rect(x, base - front * 0.4, 4, 3, rgba(120, 220, 255));
    b.vline(W / 2, base - front - 18, base - front - 6, rgba(150, 150, 160)); b.set(W / 2, base - front - 19, rgba(255, 80, 80));
    door(W / 2, 8, rgba(90, 80, 140));
  }
  // type markers for later eras
  if (era >= 1) {
    const sy = base - Math.min(front - 4, 22);
    if (type === 'healer') sign(x1 - 12, sy, 'cross');
    if (type === 'research') sign(x0 + 4, sy, 'book');
    if (type === 'temple' && era > 4) sign(W / 2, sy - 6, 'star');
    if (type === 'tavern') sign(x1 - 8, sy, 'mug');
    if (type === 'workshop') sign(x0 - 1, base - 8, 'anvil');
    if (type === 'barracks') { banner(x0 + 2, sy - 6); banner(x1 - 9, sy - 6); }
    if (type === 'market') for (let x = x0; x < x1; x += 4) b.rect(x, sy - 2, 4, 4, (x / 4) % 2 ? rgba(240, 240, 236) : rgba(220, 70, 70));
    if (type === 'storage') { b.rect(x1 - 1, base - 7, 7, 7, rgba(160, 120, 70)); b.line(x1, base - 6, x1 + 5, base - 1, rgba(110, 80, 50)); }
    if (type === 'kitchen' && era < 8) chimney(x0 + 4, top - 6);
  }
  b.outline(ink, 0.25);
  return finish(key, b);
}
function finish(key, b) { const c = b.toCanvas(); cache.set(key, c); return c; }

/** Scaffolding drawn over buildings under construction. */
export function scaffold(w, h) {
  const key = `scaf${w}|${h}`; let c = cache.get(key); if (c) return c;
  const W = w * 32, H = h * 32 + ROOF_PAD, b = new PixBuf(W, H), wood = rgba(170, 126, 76), woodD = rgba(120, 86, 52), base = H - 2;
  for (let x = 2; x < W; x += 10) b.vline(x, base - h * 20 - 6, base, wood);
  for (let y = base - 2; y > base - h * 20 - 6; y -= 8) b.hline(2, W - 3, y, woodD);
  b.line(2, base, W - 3, base - h * 20, woodD);
  return finish(key, b);
}
