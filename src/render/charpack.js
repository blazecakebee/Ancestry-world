// Character pack: hand-drawn 4-direction characters, re-dressed procedurally per citizen.
// Each citizen gets a base sprite matched to them, then we edit it:
//   - recolour skin & hair to their genes (exotic green/blue skins become human tones)
//   - re-dye clothing to their era's outfit, swap armor materials by era
//   - reshape the body (heavier, more muscular, bust for women) and dress bare base bodies
//   - add role gear (crowns, hoods, lab coats & ties, helmets, visors) and held tools/weapons
// Animation frames (idle, walk, work, fight) and ragdoll parts are generated from the edited sprite.
import { PixBuf, rgba, unpack, shadeC, mixC, hexC, C, makeCanvas } from './pixel.js';
import { SKIN, HAIR, outfitFor } from './pawnart.js';

export const PACK = { ready: false, meta: null, atlasData: null, maskData: null, aw: 0 };
const CLS = { SKIN: 1, HAIR: 2, CLOTH: 3, METAL: 4, INK: 5 };
export const PW = 48, PH = 54; // cell size
export const PFRAMES = 10; // per direction: idle0, idle1, walk0-3, work0-1, fight0-1
export const DIR = { BACK: 0, LEFT: 1, FRONT: 2, RIGHT: 3 };

export async function loadCharacterPack(base = new URL('../../assets/packs/characters/', import.meta.url).href) {
  try {
    const meta = await (await fetch(base + 'meta.json')).json();
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base + src; });
    const [atlas, mask] = await Promise.all([load('atlas.png'), load('mask.png')]);
    const read = (img) => { const c = makeCanvas(img.width, img.height), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    PACK.atlasData = new Uint32Array(read(atlas).buffer);
    PACK.maskData = read(mask);
    PACK.aw = atlas.width; PACK.meta = meta; PACK.ready = true;
    indexChars();
    return true;
  } catch (e) { console.info('[charpack] no character pack found, using procedural characters'); return false; }
}

let pools = null;
const RACE_OF = (c) => {
  const [r, g, b] = c.skin, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / 255 / (1 - Math.abs(2 * l - 1) || 1);
  let h = 0; if (mx !== mn) { h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = (h * 60 + 360) % 360; }
  if (s < 0.12 || (h >= 50 && h < 70)) return 'masked'; // knights, golden helms, skeletons
  if (h >= 70 && h < 170) return 'orc';
  if (h >= 170 && h < 300) return 'elf';
  return 'human';
};
function indexChars() {
  const cs = PACK.meta.chars.filter((c) => !c.bare);
  for (const c of cs) {
    c.race = RACE_OF(c);
    // how much bare skin shows on the torso (front view)
    const { cls } = cellBuf(c.cell, DIR.FRONT), h = c.bottom - c.top, y0 = c.top + Math.round(h * 0.42), y1 = c.top + Math.round(h * 0.68);
    let sk = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = c.cx - 6; x <= c.cx + 6; x++) { const k = cls[y * PW + x]; if (k && k !== CLS.INK) { n++; if (k === CLS.SKIN) sk++; } }
    c.shirtless = n > 0 && sk / n > 0.4;
  }
  const face = (c) => (c.faceSkin ?? 1) >= 0.45 && c.race !== 'masked';
  pools = {};
  for (const r of ['human', 'elf', 'orc']) {
    const rc = cs.filter((c) => c.race === r);
    const dressed = rc.filter((c) => !c.shirtless);
    pools[r] = { soldier: dressed.filter((c) => c.armor || c.helmet), long: dressed.filter((c) => c.longHair && !c.armor && face(c)), short: dressed.filter((c) => !c.longHair && !c.armor && face(c)), any: dressed.filter(face), caveman: rc.filter((c) => c.shirtless && !c.longHair && face(c)) };
  }
  pools.masked = cs.filter((c) => c.race === 'masked' && (c.armor || c.helmet));
}
/** Deterministically match a citizen to a base character of their race, preferring a similar skin tone. */
export function charFor(p) {
  const R = pools[p.race] || pools.human;
  let pool = p.role === 'soldier' ? (R.soldier.length >= 4 ? R.soldier : R.soldier.concat(pools.masked)) : p.sex === 'f' ? R.long : R.short;
  if (p.sex === 'm' && p.role !== 'soldier' && (p.gearEra ?? 0) === 0 && R.caveman.length >= 6 && ((p.id * 7) % 3 === 0)) pool = R.caveman;
  if (pool.length < 6) pool = R.any.length ? R.any : pools.human.any;
  let h = (p.id * 2654435761) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  if (p.race === 'human' || !p.race) { // choose among the closest skin tones to the citizen's genes
    const target = 0.9 - (p.look.skin / 9) * 0.55;
    const sorted = pool.slice().sort((a, b) => Math.abs(a.skinL - target) - Math.abs(b.skinL - target));
    pool = sorted.slice(0, Math.max(12, Math.floor(sorted.length / 5)));
  }
  return pool[h % pool.length];
}

function cellBuf(cell, dir) {
  const m = PACK.meta, col = cell % m.cols, row = Math.floor(cell / m.cols);
  const ox = col * PW, oy = (dir * m.rowsPerDir + row) * PH;
  const b = new PixBuf(PW, PH), cls = new Uint8Array(PW * PH);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = (oy + y) * PACK.aw + ox + x;
    b.d[y * PW + x] = PACK.atlasData[i];
    cls[y * PW + x] = Math.round(PACK.maskData[i * 4] / 40);
  }
  return { b, cls };
}

const lum = (c) => { const [r, g, b] = unpack(c); return 0.299 * r + 0.587 * g + 0.114 * b; };
const tint = (c, target, baseL) => { const f = Math.max(0.25, Math.min(1.6, lum(c) / Math.max(20, baseL))); return shadeC(target, f); };

/** Produce the (lightly) edited base sprite for one direction. Skin & hair stay as drawn. */
function editSprite(p, ch, dir, era, nationColor) {
  const { b, cls } = cellBuf(ch.cell, dir);
  const o = outfitFor(p, era, nationColor);
  const top = ch.top, bot = ch.bottom, h = bot - top;
  const headEnd = top + Math.round(h * 0.40), hipY = top + Math.round(h * 0.70);
  let cs = 0, cn = 0;
  for (let i = 0; i < cls.length; i++) if (cls[i] === CLS.CLOTH) { cs += lum(b.d[i]); cn++; }
  const clothL = cn ? cs / cn : 120;
  // gentle era tint on clothing (strong only for lab coats & space suits)
  const strong = o.over === 'labcoat' || o.over === 'spacesuit' || o.over === 'bodysuit';
  const amount = strong ? 0.75 : era <= 1 ? 0 : era >= 6 ? 0.3 : 0.18;
  if (amount > 0) for (let y = headEnd; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; if (cls[i] !== CLS.CLOTH || !b.d[i]) continue;
    let col = y < hipY ? o.top : (o.bot || o.top);
    if (o.over === 'labcoat') col = y < hipY + 6 ? rgba(244, 246, 248) : col;
    b.d[i] = mixC(b.d[i], tint(b.d[i], col, clothL), y < hipY || strong ? amount : amount * 0.6);
  }
  // Stone Age folk wrap themselves in hides
  if (era === 0 && p.role !== 'soldier') {
    const fur = rgba(128, 92, 58), furD = rgba(96, 66, 40);
    for (let y = hipY - 2; y < hipY + 3; y++) for (let x = 0; x < PW; x++) { const i = y * PW + x; if (b.d[i] && cls[i] !== CLS.INK && cls[i] !== CLS.SKIN && Math.abs(x - ch.cx) < 8) b.d[i] = (x + y) % 3 ? fur : furD; }
  }
  reshape(b, p, ch, dir, headEnd, hipY);
  accessories(b, p, ch, dir, o, era, headEnd, hipY);
  return b;
}

/** Widen torso for heavier/muscular builds; add a bust for women. */
function reshape(b, p, ch, dir, headEnd, hipY) {
  const fat = p.look.fat || 0, mus = p.look.muscle || 0;
  const widen = (y0, y1, k) => {
    if (k <= 0) return;
    for (let y = Math.max(0, y0); y < Math.min(PH, y1); y++) {
      const row = b.d.slice(y * PW, y * PW + PW), cx = ch.cx;
      for (let x = 0; x < PW; x++) {
        let src;
        if (x < cx) src = x + k <= cx ? row[x + k] : row[cx];
        else src = x - k >= cx ? row[x - k] : row[cx];
        b.d[y * PW + x] = src;
      }
    }
  };
  const side = dir === DIR.LEFT || dir === DIR.RIGHT;
  if (fat > 0.6) widen(headEnd + 2, hipY + 1, 1); // heavier builds: one pixel wider through the middle
  if (p.sex === 'f' && (p.look.chest || 0) > 0.15 && p.age >= 14) {
    const cy = headEnd + 4 + Math.round((hipY - headEnd) * 0.12);
    if (dir === DIR.FRONT) {
      for (const s of [-1, 1]) { const x = ch.cx + s * 3 - (s < 0 ? 1 : 0); const i = (cy + 2) * PW + x; if (b.d[i]) b.d[i] = shadeC(b.d[i], 0.78); const j = cy * PW + x; if (b.d[j]) b.d[j] = shadeC(b.d[j], 1.12); }

    } else if (side && p.look.chest > 0.3) {
      const fwd = dir === DIR.RIGHT ? 1 : -1;
      for (let y = cy; y < cy + 3; y++) { // push the front edge out by one pixel
        let edge = -1;
        if (fwd > 0) { for (let x = PW - 2; x > 0; x--) if (b.d[y * PW + x]) { edge = x; break; } }
        else { for (let x = 1; x < PW - 1; x++) if (b.d[y * PW + x]) { edge = x; break; } }
        if (edge > 0) { b.d[y * PW + edge + fwd] = b.d[y * PW + edge]; b.d[y * PW + edge] = b.d[y * PW + edge - fwd] || b.d[y * PW + edge]; }
      }
    }
  }
}

function accessories(b, p, ch, dir, o, era, headEnd, hipY) {
  const top = ch.top, cx = ch.cx;
  const gold = rgba(240, 196, 60), red = rgba(210, 60, 80);
  if (o.hat === 'crown') { for (let x = -4; x < 4; x++) b.set(cx + x, top + 1, gold); for (const x of [-4, -1, 2]) b.set(cx + x, top, gold); if (dir === DIR.FRONT) b.set(cx - 1, top + 1, red); }
  if (o.hat === 'visor' && dir !== DIR.BACK) { const y = top + Math.round((headEnd - top) * 0.5); for (let x = -5; x < 5; x++) if (b.get(cx + x, y)) { b.set(cx + x, y, rgba(80, 230, 240)); b.set(cx + x, y + 1, rgba(50, 170, 200)); } }
  if (o.cape && dir === DIR.BACK) for (let y = headEnd + 1; y < hipY + 5; y++) for (let x = -6; x < 6; x++) if (b.get(cx + x, y)) b.set(cx + x, y, x === -6 ? shadeC(o.cape, 0.7) : o.cape);
  if ((o.over === 'labcoat' || o.over === 'suit') && dir === DIR.FRONT) { const tie = o.accent || rgba(60, 110, 200); for (let y = headEnd + 1; y < headEnd + 7; y++) { b.set(cx, y, tie); b.set(cx - 1, y, shadeC(tie, 0.8)); } }
  if (o.trim && (o.over === 'spacesuit' || o.over === 'bodysuit' || o.over === 'power') && dir !== DIR.BACK) { const y = headEnd + 4; for (let x = -7; x < 7; x++) if (b.get(cx + x, y)) b.set(cx + x, y, o.trim); }
}

const ITEM = { 0: 'spear', 1: 'spear', 2: 'sword', 3: 'sword', 4: 'sword', 5: 'musket', 6: 'rifle', 7: 'rifle', 8: 'plasma', 9: 'plasma' };
function drawHeld(b, item, x, y, dir, phase) {
  const wood = rgba(132, 92, 56), stone = rgba(150, 150, 156), metal = rgba(196, 200, 210), dark = rgba(50, 50, 56), glow = rgba(80, 240, 255), gold = rgba(230, 190, 70);
  const f = dir === DIR.LEFT ? -1 : 1;
  const spec = { spear: [11, wood, stone], axe: [6, wood, stone], pick: [6, wood, metal], sword: [8, metal, gold], musket: [12, wood, dark], rifle: [10, dark, dark], plasma: [9, rgba(200, 220, 240), glow], staff: [12, wood, gold], hammer: [6, wood, metal] }[item];
  if (!spec) return;
  const [len, col, head] = spec;
  for (let k = 0; k < len; k++) {
    let px, py;
    if (phase === 'up') { px = x + f * Math.round(k * 0.35); py = y - k; }
    else if (phase === 'fwd') { px = x + f * k; py = y - 1; }
    else { px = x; py = y - len + 3 + k; }
    b.set(px, py, k === len - 1 || k === len - 2 ? head : col);
  }
}

/** Build the 4 x 10 animation sheet for a citizen. */
export function packSheet(p, era, nationColor) {
  const ch = charFor(p);
  const sheet = makeCanvas(PW * PFRAMES, PH * 4);
  const parts = [];
  for (let dir = 0; dir < 4; dir++) {
    const base = editSprite(p, ch, dir, era, nationColor);
    const top = ch.top, bot = ch.bottom, h = bot - top, hipY = top + Math.round(h * 0.7), headEnd = top + Math.round(h * 0.4);
    const handX = dir === DIR.LEFT ? ch.cx - 6 : dir === DIR.RIGHT ? ch.cx + 6 : ch.cx + 8, handY = hipY - 2;
    const soldierItem = p.role === 'soldier' ? ITEM[era] : p.role === 'prophet' ? 'staff' : null;
    for (let f = 0; f < PFRAMES; f++) {
      const fb = new PixBuf(PW, PH);
      let bob = 0, legShift = 0, item = soldierItem, phase = 'down';
      if (f === 1) bob = 1;
      if (f >= 2 && f <= 5) { bob = f % 2; legShift = [1, 0, -1, 0][f - 2]; }
      if (f === 6 || f === 7) { item = soldierItem || (p.job === 'mine' ? 'pick' : 'axe'); phase = f === 6 ? 'up' : 'down'; bob = f === 7 ? 1 : 0; }
      if (f === 8 || f === 9) { item = ITEM[era]; phase = f === 9 ? 'fwd' : 'down'; }
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        const c = base.d[y * PW + x]; if (!c) continue;
        let ny = y, nx = x;
        if (y < hipY) ny = y + bob;
        else if (legShift) { // stepping: one leg lifts, the other plants
          const leftLeg = x < ch.cx;
          if (dir === DIR.LEFT || dir === DIR.RIGHT) nx = x + (leftLeg ? legShift : -legShift);
          else if ((leftLeg && legShift > 0) || (!leftLeg && legShift < 0)) ny = y - (y > bot - 3 ? 1 : 0);
        }
        fb.set(nx, ny, c);
      }
      if (item && dir !== DIR.BACK) drawHeld(fb, item, handX, handY + bob, dir, phase);
      if (item && dir === DIR.BACK) drawHeld(fb, item, ch.cx + 7, handY + bob, DIR.RIGHT, phase === 'fwd' ? 'down' : phase);
      fb.toCanvas(sheet, f * PW, dir * PH);
    }
    if (dir === DIR.FRONT) parts.push(base, headEnd, hipY);
  }
  return { sheet, ch, parts: { base: parts[0], headEnd: parts[1], hipY: parts[2] } };
}

/** Ragdoll parts from the front view: head, torso, legs. */
export function packRagdollParts(entry) {
  const { base, headEnd, hipY } = entry.parts, ch = entry.ch;
  const slice = (y0, y1) => { const b = new PixBuf(PW, y1 - y0); for (let y = y0; y < y1; y++) for (let x = 0; x < PW; x++) b.d[(y - y0) * PW + x] = base.d[y * PW + x]; return b.toCanvas(); };
  return { head: { c: slice(ch.top - 2, headEnd + 1), ax: ch.cx, ay: headEnd + 1 - (ch.top - 2) }, torso: { c: slice(headEnd + 1, hipY + 1), ax: ch.cx, ay: 0 }, legs: { c: slice(hipY + 1, ch.bottom + 1), ax: ch.cx, ay: 0 }, scale: 1 };
}
