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

/** Ground decoration pools by tone: 'g' green, 'a' autumn/dry, 's' snow. */
export function nature(cat, tone, h) {
  const list = GA.man?.nature[cat]; if (!list) return null;
  const pool = list.filter((r) => r[5] === tone); if (!pool.length) return null;
  const r = pool[h % pool.length]; return rectOf(r[0], r.slice(1, 5));
}

// ---- trees: world size in px at zoom 1 (32px tiles). Anchor = bottom-centre of the trunk. ----
const TS = { tree1: 0.34, tree2: 0.34, tree3: 0.34, tree4: 0.34, birch1: 0.5, birch2: 0.5, birch3: 0.5, flowering_tree: 0.5, large_pine_tree: 0.36, weeping_willow1: 0.3, weeping_willow2: 0.3, weeping_willow3: 0.3, bonsai: 0.5 };
function whole(name, tone) { const e = g(name); const sc = TS[name] || 0.4; return e.ok ? { im: e.im, x: 0, y: 0, w: e.im.width, h: e.im.height, scale: sc, foot: 3 } : null; }
/** Pick a tree sprite for a tile. kind comes from the biome, h is a stable per-tile hash. Returns null when no Gandalf art fits (caller falls back). */
export function tree(kind, x, y, snowy, autumn = false) {
  if (!GA.ready) return null;
  const h = H(x, y), r = (h >>> 8) % 100;
  if (kind === 'oak') {
    if (snowy) return r < 70 ? whole('tree4') : pineOf('s', h);
    if (autumn && r < 55) return whole('tree3');
    if (r < 40) return whole('tree1'); if (r < 52) return whole('tree2'); if (r < 74) return whole(['birch1', 'birch2', 'birch3'][h % 3]);
    if (r < 86) return whole('flowering_tree'); if (r < 94) return whole('tree1'); return pineOf('g', h);
  }
  if (kind === 'pine') return pineOf(snowy ? 's' : (r < 65 ? 'g' : 'a'), h);
  if (kind === 'willow') return whole('weeping_willow' + (1 + (h % 3)));
  if (kind === 'jungle') return r < 70 ? whole('tree1') : whole('tree2');
  return null;
}
function pineOf(tone, h) {
  const list = (GA.man?.pines || []).filter((p) => (tone === 's' ? p[5] === 's' : p[5] === tone));
  if (!list.length) return null; const p = list[h % list.length], e = g(p[0]);
  return e.ok ? { im: e.im, x: p[1], y: p[2], w: p[3], h: p[4], scale: 0.42, foot: 2 } : null;
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
