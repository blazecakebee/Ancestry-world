// Runtime access to the Gandalf Hardcore environment pack (trees, foliage, props, campfires, pets, slimes) plus
// the Pixel Fire / smoke strips and Super Pixel Effects sheets. Everything is optional: until an image has loaded
// (or when the pack is missing) every getter returns null and the renderer falls back to its procedural art.
// Art: GandalfHardcore (assets/packs/gandalf), Pixel Fire pack + Super Pixel Effects Gigapack (assets/packs/fx).
const GBASE = new URL('../../assets/packs/gandalf/', import.meta.url);
const FBASE = new URL('../../assets/packs/fx/', import.meta.url);
export const GA = { ready: false, man: null, version: 0 };
const cache = new Map();

function load(url) {
  let e = cache.get(url);
  if (!e) { e = { im: new Image(), ok: false, failed: false }; e.im.onload = () => { e.ok = true; }; e.im.onerror = () => { e.failed = true; }; e.im.src = url; cache.set(url, e); }
  return e;
}
const g = (name) => load(new URL(name + '.png', GBASE).href);
const f = (name) => load(new URL(name + '.png', FBASE).href);
const waitFor = (es) => new Promise((res) => { const t = () => (es.every((e) => e.ok || e.failed) ? res() : setTimeout(t, 40)); t(); });
const H = (a, b = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
export const hash2 = H;

export async function loadGandalf() {
  try {
    GA.man = await (await fetch(new URL('manifest.json', GBASE).href)).json();
    const names = [...Object.keys(GA.man.sheets), 'pet_dog', 'pet_cat', 'pet_fox', 'pet_wisp', 'slime_green', 'slime_blue', 'slime_red'];
    await waitFor(names.map(g));
    // fire strips + smoke are warmed lazily, a handful now so the first campfire isn't blank
    await waitFor([f('fire_red_4_1'), f('fire_yellow_4_1'), f('smoke_dark_1'), f('smoke_light_1')]);
    GA.ready = true; GA.version++;
    return true;
  } catch (e) { console.info('[gandalf] pack not found, using procedural art'); return false; }
}

/** A rect inside one of the sheets: {im,x,y,w,h} or null while loading. */
function rectOf(sheet, r) { const e = g(sheet); return e.ok ? { im: e.im, x: r[0], y: r[1], w: r[2], h: r[3] } : null; }
export function prop(key) { const fr = GA.man?.frames[key]; return fr ? rectOf(fr[0], fr.slice(1)) : null; }

// Entries in the pack's decor lists that are not ground cover: the clothesline (pile #2) and a pumpkin (tuft #24). Never scatter them.
const NATURE_BAD = { pile: new Set([2]), tuft: new Set([24]), rock: new Set([3]) };
/** Ground decoration pools by tone: 'g' green, 'a' autumn/dry, 's' snow. */
export function nature(cat, tone, h) {
  const list = GA.man?.nature[cat]; if (!list) return null;
  const bad = NATURE_BAD[cat]; const pool = list.filter((r, i) => r[5] === tone && r[4] >= 3 && r[3] >= 3 && !(bad && bad.has(i))); if (!pool.length) return null; // skip the 1px-tall sliver sprites (they showed up as stray dark dashes)
  const r = pool[h % pool.length]; return rectOf(r[0], r.slice(1, 5));
}

// ---- trees: world size in px at zoom 1 (32px tiles). Anchor = bottom-centre of the trunk. ----
const TS = { tree1: 0.34, tree2: 0.34, tree3: 0.34, tree4: 0.34, birch1: 0.5, birch2: 0.5, birch3: 0.5, flowering_tree: 0.5, large_pine_tree: 0.36, weeping_willow1: 0.3, weeping_willow2: 0.3, weeping_willow3: 0.3, bonsai: 0.5 };
function whole(name, tone) { const e = g(name); const sc = TS[name] || 0.4; return e.ok ? { im: e.im, x: 0, y: 0, w: e.im.width, h: e.im.height, scale: sc, foot: 3 } : null; }
// ---- recoloured variants: every tree kind except the base oak/pine is one of the existing sprites with its colours shifted ----
const TINT = new Map();
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; if (!s) { const v = Math.round(l * 255); return [v, v, v]; } const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)]; }
/** Copy of a sprite rect with hue/saturation/lightness adjusted: rec = {h: degrees, s: x, l: x, trunk: keep brown trunks as they are}. */
function tinted(key, src, rec) {
  if (!src) return null;
  let e = TINT.get(key); if (e) return e;
  const cv = document.createElement('canvas'); cv.width = src.w; cv.height = src.h; const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(src.im, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h);
  const id = cx.getImageData(0, 0, src.w, src.h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
    if (rec.trunk !== false && s < 0.5 && h > 5 && h < 50 && l < 0.45) continue; // leave brown trunks/branches alone
    const [r, g, b] = hsl2rgb(h + (rec.h || 0), Math.min(1, s * (rec.s ?? 1)), Math.min(1, l * (rec.l ?? 1)));
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  cx.putImageData(id, 0, 0);
  e = { im: cv, x: 0, y: 0, w: src.w, h: src.h, scale: src.scale, foot: src.foot };
  TINT.set(key, e); return e;
}
// kind -> [base sprites, recolour, scale multiplier]
const VARIANTS = {
  acacia:   [['tree1', 'tree2'], { h: -44, s: 0.8, l: 1.12 }, 0.9],
  jungle:   [['tree1', 'tree2'], { h: 12, s: 1.25, l: 0.88 }, 1.1],
  palm:     [['weeping_willow1', 'weeping_willow2', 'weeping_willow3'], { h: -18, s: 1.3, l: 1.2 }, 0.9],
  mangrove: [['weeping_willow2', 'weeping_willow3'], { h: -8, s: 0.9, l: 0.9 }, 0.95],
  cactus:   [['tree4'], { h: 28, s: 0.55, l: 1.05 }, 0.7],
  dead:     [['tree4', 'tree3'], { h: -100, s: 0.12, l: 0.7 }, 0.85],
  autumn:   [['tree1', 'tree2', 'tree3'], { h: -86, s: 1.3, l: 1.12 }, 1],
  cherry:   [['flowering_tree'], { h: 232, s: 0.7, l: 1.5 }, 1],
  redwood:  [['tree2', 'tree1'], { h: 8, s: 0.9, l: 0.7 }, 1.25],
  frost:    [['tree4'], { h: 70, s: 0.5, l: 1.35 }, 1],
  crimson:  [['tree2', 'flowering_tree'], { h: 170, s: 1.1, l: 0.95 }, 1],
  glow:     [['weeping_willow1', 'tree3'], { h: 72, s: 1.1, l: 1.1 }, 0.95],
  ash:      [['tree3', 'tree4'], { h: -90, s: 0.12, l: 0.62 }, 0.85],
};
function variantTree(kind, h) {
  const v = VARIANTS[kind]; if (!v) return null;
  const name = v[0][h % v[0].length], base = whole(name); if (!base) return null;
  base.scale *= v[2];
  return tinted(kind + '|' + name, base, v[1]) && { ...tinted(kind + '|' + name, base, v[1]), scale: base.scale };
}
/** Pick a tree sprite for a tile. kind comes from the biome, h is a stable per-tile hash. Returns null only while art is loading. */
export function tree(kind, x, y, snowy, autumn = false) {
  if (!GA.ready) return null;
  const h = H(x, y), r = (h >>> 8) % 100;
  if (snowy && kind !== 'pine' && kind !== 'oak') { const t = variantTree('frost', h); if (t) return t; }
  if (kind === 'oak') {
    if (snowy) return r < 70 ? whole('tree4') : pineOf('s', h);
    if (autumn && r < 55) return whole('tree3');
    if (r < 40) return whole('tree1'); if (r < 52) return whole('tree2'); if (r < 74) return whole(['birch1', 'birch2', 'birch3'][h % 3]);
    if (r < 86) return whole('flowering_tree'); if (r < 94) return whole('tree1'); return pineOf('g', h);
  }
  if (kind === 'pine') return pineOf(snowy ? 's' : (r < 65 ? 'g' : 'a'), h);
  if (kind === 'willow') return whole('weeping_willow' + (1 + (h % 3)));
  return variantTree(kind, h) || whole('tree1');
}
// The pine sheet also holds loose trunk pieces and stumps next to each pine; those were showing up as "half trees".
// Keep only the biggest connected blob of each pine rect.
const PINE_CLEAN = new Map();
function cleanPine(key, e, p) {
  let c = PINE_CLEAN.get(key); if (c) return c;
  const w = p[3], h = p[4], cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(e.im, p[1], p[2], w, h, 0, 0, w, h);
  const id = cx.getImageData(0, 0, w, h), d = id.data, lab = new Int32Array(w * h), sizes = [0];
  for (let i = 0; i < w * h; i++) {
    if (lab[i] || d[i * 4 + 3] < 8) continue;
    const L = sizes.length; sizes.push(0); const st = [i]; lab[i] = L;
    while (st.length) {
      const q = st.pop(); sizes[L]++; const qx = q % w, qy = (q / w) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = qx + ox, ny = qy + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx; if (!lab[n] && d[n * 4 + 3] >= 8) { lab[n] = L; st.push(n); }
      }
    }
  }
  let best = 1; for (let L = 2; L < sizes.length; L++) if (sizes[L] > sizes[best]) best = L;
  for (let i = 0; i < w * h; i++) if (lab[i] !== best) d[i * 4 + 3] = 0;
  cx.putImageData(id, 0, 0);
  c = { im: cv, x: 0, y: 0, w, h, scale: 0.42, foot: 2 }; PINE_CLEAN.set(key, c); return c;
}
function pineOf(tone, h) {
  const list = (GA.man?.pines || []).filter((p) => (tone === 's' ? p[5] === 's' : p[5] === tone));
  if (!list.length) return null; const p = list[h % list.length], e = g(p[0]);
  return e.ok ? cleanPine(p.join(','), e, p) : null;
}

/** 32x32 ground art for rocks, ore, gold and berry bushes, built from the pack's own rocks/bushes so they match the trees. */
const FEAT_ART = new Map();
export function featureArt(kind, variant, extra, tone) {
  if (!GA.ready) return null;
  const key = `${kind}|${variant}|${extra}|${tone}`; let c = FEAT_ART.get(key); if (c) return c;
  const ROCK_OK = new Set([0, 1, 2, 4, 5, 6, 7, 8, 9]); // the pack's 'rock' list also holds a pumpkin, a snow mound and some bushes
  const pickFrom = (cat, min) => { const l = (GA.man?.nature[cat] || []).filter((r, i) => r[5] === tone && r[3] >= min && (cat !== 'rock' || ROCK_OK.has(i))); return l.length ? l[variant % l.length] : null; };
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingEnabled = false;
  const put = (r, maxW, bx, by) => { const e = g(r[0]); if (!e.ok) return false; const w = r[3], h = r[4], k = Math.min(1, maxW / w), dw = Math.round(w * k), dh = Math.round(h * k); cx.drawImage(e.im, r[1], r[2], w, h, Math.round(bx - dw / 2), Math.round(by - dh), dw, dh); return true; };
  let ok = false, rr = (n) => ((variant * 2654435761 + n * 40503) >>> 0) % 1000 / 1000;
  if (kind === 'bush') {
    const r = pickFrom('bush', 20); if (!r) return null; ok = put(r, 31, 16, 27);
    if (ok) { // fruit: little bright dots sitting on the leaves
      const id = cx.getImageData(0, 0, 32, 32), d = id.data, cols = [[222, 44, 72], [128, 64, 204], [245, 150, 50], [235, 70, 120]], n = 8 + Math.min(4, extra | 0) * 2;
      for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
        const x = 2 + Math.floor(rr(tries * 2 + 1) * 28), y = 12 + Math.floor(rr(tries * 2 + 2) * 16);
        if (d[(y * 32 + x) * 4 + 3] < 200 || d[(y * 32 + x + 1) * 4 + 3] < 200) continue;
        const col = cols[(variant + k) % cols.length]; k++;
        cx.fillStyle = `rgb(${col})`; cx.fillRect(x, y, 2, 2); cx.fillStyle = 'rgba(255,255,255,0.55)'; cx.fillRect(x, y, 1, 1);
      }
    }
  } else {
    const r = pickFrom('rock', 19); if (!r) return null; ok = put(r, 30, 16, 27);
    if (ok && variant % 3 === 2) { const r2 = pickFrom('rock', 19); if (r2) put(r2, 18, 24, 29); }
    if (ok && kind !== 'rock') { // ore flecks on the stone
      const gold = kind === 'gold', id = cx.getImageData(0, 0, 32, 32), d = id.data, cols = gold ? [[255, 220, 80], [255, 246, 170]] : extra ? [[220, 120, 60], [240, 160, 90]] : [[200, 120, 70], [120, 200, 230]];
      for (let k = 0, tries = 0; k < 9 && tries < 200; tries++) {
        const x = 3 + Math.floor(rr(tries * 3 + 1) * 26), y = 14 + Math.floor(rr(tries * 3 + 2) * 14);
        if (d[(y * 32 + x) * 4 + 3] < 200) continue; k++;
        cx.fillStyle = `rgb(${cols[k % 2]})`; cx.fillRect(x, y, 2, 2);
      }
    }
  }
  if (!ok) return null;
  FEAT_ART.set(key, cv); return cv;
}

/** Animated grid frames (campfire, torch, cooking area, wheat...). */
export function gridFrame(sheet, index) {
  const gr = GA.man?.grid[sheet]; const e = g(sheet); if (!gr || !e.ok) return null;
  const [fw, fh, n] = gr; const cols = Math.max(1, Math.floor(e.im.width / fw)); const i = ((index % n) + n) % n;
  return { im: e.im, x: (i % cols) * fw, y: Math.floor(i / cols) * fh, w: fw, h: fh };
}
export function gridCount(sheet) { return GA.man?.grid[sheet]?.[2] || 0; }
export function campfireFrame(t, food = false) { const e = g(food ? 'campfire_with_food_sheet' : 'campfire_sheet'); if (!e.ok) return null; return { im: e.im, x: (Math.floor(t * 9) % 5) * 32, y: 0, w: 32, h: 32 }; }

// ---- fire / smoke strips: 8 frames of 32x48 (fire), smoke sheets of equal square-ish frames ----
const FIRE_STYLES = ['4_1', '4_2', '5_1', '5_2', '6_1', '6_2', '7_1', '7_2'];
export function fireFrame(color, style, t) {
  const e = f(`fire_${color}_${FIRE_STYLES[((style % 8) + 8) % 8]}`); if (!e.ok) return null;
  const n = Math.max(1, Math.floor(e.im.width / 32)); return { im: e.im, x: (Math.floor(t * 12) % n) * 32, y: 0, w: 32, h: Math.min(48, e.im.height) };
}
export function smokeSheet(kind, n) { const e = f(`smoke_${kind}_${((n % 5) + 5) % 5 + 1}`); return e.ok ? e : null; }

// ---- Super Pixel Effects (15 fps) ----
export function spx(name) {
  const d = GA.man?.spx['spx_' + name]; if (!d) return null; const e = f('spx_' + name); if (!e.ok) return null;
  return { im: e.im, frames: d.frames, fps: 15 };
}
export function spxNames() { return Object.keys(GA.man?.spx || {}).map((k) => k.slice(4)); }
export function warmSpx(names) { for (const n of names) f('spx_' + n); }
export const ceSheet = (n) => { const e = f('ce_' + n); return e.ok ? e.im : null; };

// ---- pets / slimes (32x32 frames) ----
export function petFrame(kind, t, moving) {
  const map = { dog: 'pet_dog', cat: 'pet_cat', fox: 'pet_fox', wisp: 'pet_wisp', slime_green: 'slime_green', slime_blue: 'slime_blue', slime_red: 'slime_red' };
  const name = map[kind]; if (!name) return null; const e = g(name); if (!e.ok) return null;
  const cols = Math.floor(e.im.width / 32), rows = Math.floor(e.im.height / 32);
  let row = 0, n = cols;
  if (kind.startsWith('slime')) { row = moving ? 1 : 0; n = moving ? 8 : 5; } else if (kind !== 'wisp') { row = moving ? 1 : 0; n = moving ? 6 : 5; } else n = cols;
  row = Math.min(row, rows - 1);
  return { im: e.im, x: (Math.floor(t * 8) % n) * 32, y: row * 32, w: 32, h: 32 };
}
export const sunSprite = () => { const e = g('sun'); return e.ok ? e.im : null; };
export const cloudSprite = (i) => { const e = g(['cloud4', 'cloud5', 'cloud6'][i % 3]); return e.ok ? e.im : null; };

/** Whole-sheet rect (e.g. 'large_tent'). */
export function sheetRect(name) { const e = g(name); return e.ok ? { im: e.im, x: 0, y: 0, w: e.im.width, h: e.im.height } : null; }
