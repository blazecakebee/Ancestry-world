// Layered pixel characters from the GandalfHardcore character pack. Layers are pre-packed into compact 8x4 sheets of
// 64x56 cells (10 x 7) by tools/build_assets.py:  0 idle(5)  1 walk(8)  2 run(8)  3 jump(4)  4 flail(4)  5 attack(6)  6 death(10, last = lying).
// Races are kept: humans use the 5 skin tones, elves get elven ears on a light skin, orcs use the orc skin set.
// The art is a single side view (facing right): the renderer mirrors it for left/up movement.
import { WORK_TOOLS, handArt } from '../data/tools.js';
const BASE = new URL('../../assets/packs/gchar/', import.meta.url);
export const GCH = { ready: false, man: null };
export const GW = 64, GH = 56, GFOOT = 55, GTOP = 8;       // cell size, y of the feet, y of the top of the head
export const GROW = { idle: 0, walk: 1, run: 2, jump: 3, flail: 4, attack: 5, death: 6 }, GFRAMES = { idle: 5, walk: 8, run: 8, jump: 4, flail: 4, attack: 6, death: 10 };
export const GCOLS = 10, GROWS = 7;
/** Body bands of a standing frame, for ragdolls (head top incl. hats, neck, hips, feet, centre x). */
export const GBAND = { top: 3, headEnd: 23, hipY: 40, bottom: 55, cx: 32 };
const imgs = new Map();
function img(path) {
  let e = imgs.get(path);
  if (!e) { e = { im: new Image(), ok: false, failed: false }; e.im.onload = () => { e.ok = true; }; e.im.onerror = () => { e.failed = true; }; e.im.src = new URL(path, BASE).href; imgs.set(path, e); }
  return e;
}
export async function loadGChar() {
  try { GCH.man = (await (await fetch(new URL('manifest.json', BASE).href)).json()).layers; GCH.ready = true; for (const s of ['m', 'f']) for (const n of GCH.man.skin[s].slice(0, 5)) img(`skin/${s}_${n}.png`); return true; }
  catch { console.info('[gchar] character pack not found'); return false; }
}

const H = (p, salt = 0) => { let h = (Math.imul(p.id | 0, 2654435761) + Math.imul(salt, 40503)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; return (h ^ (h >>> 13)) >>> 0; };
const has = (cat, s, n) => GCH.man?.[cat]?.[s]?.includes(n);
const COL = ['blue', 'green', 'orange', 'purple', 'red'];
/** The held-item art for this person's tool in hand (or their main trade tool), or null. */
export function heldArt(p) {
  const kit = p.tools; if (!kit) return null;
  let k = p.toolOut && kit[p.toolOut] ? p.toolOut : null;
  if (!k) k = (p.role === 'soldier' && kit.sword ? 'sword' : (WORK_TOOLS[p.work] || []).find((q) => kit[q])) || null;
  return k ? handArt(k, kit[k].m) : null;
}

/** Ordered layer file list (back to front) for one citizen. */
export function gRecipe(p, era, role, nationColor) {
  const s = p.sex === 'f' ? 'f' : 'm', f = s === 'f', L = [];
  const add = (cat, name) => { if (name && has(cat, s, name)) { L.push(`${cat}/${s}_${name}.png`); return true; } return false; };
  const pick = (arr, salt) => arr[H(p, salt) % arr.length];
  const anyOfCat = (cat, cands, salt) => { const ok = cands.filter((c) => has(cat, s, c)); return ok.length ? ok[H(p, salt) % ok.length] : null; };
  const child = p.age < 14, soldier = role === 'soldier', prophet = role === 'prophet', leader = role === 'leader', doctor = role === 'doctor';
  const skinN = 1 + Math.min(4, Math.floor(((p.look?.skin ?? 3) / 8) * 5));
  // --- back layer (behind the body)
  if (leader && !child) add('back', 'cape_' + pick(COL, 1));
  else if (p.role === 'trader' || p.nomad) add('back', 'small_backpack');
  // --- body by race
  if (p.race === 'orc') add('skin', 'orc'); else add('skin', 'skin' + skinN);
  if (p.race === 'elf') add('ears', 'elf' + skinN);
  // --- clothing: mix and match tops, bottoms, footwear and accessories, each picked on its own and recoloured per person
  const hue = (salt, spread = 1) => { const v = H(p, salt) % 9; return v < 3 ? '' : `#hue-rotate(${((v - 5) * 22 * spread) | 0}deg)`; };
  // white linen gets dyed: earthy tones early, brighter dyes later
  const dye = (salt) => { const v = H(p, salt); if (v % 5 === 0) return ''; const hh = era <= 1 ? [10, 25, 35, 60, 80][v % 5] : (v >> 3) % 360; return `#sepia(1) saturate(${era <= 1 ? 1.4 : 2.6}) hue-rotate(${hh - 35}deg) brightness(${(0.72 + ((v >> 11) % 20) / 100).toFixed(2)})`; };
  const addD = (cat, name, salt) => { if (name && has(cat, s, name)) { L.push(`${cat}/${s}_${name}.png${dye(salt)}`); return true; } return false; };
  const addH = (cat, name, salt) => { if (name && has(cat, s, name)) { L.push(`${cat}/${s}_${name}.png${hue(salt)}`); return true; } return false; };
  const anyOf = (cands, salt) => { const ok = cands.filter((c) => has('cloth', s, c)); return ok.length ? ok[H(p, salt) % ok.length] : null; };
  const C6 = ['blue', 'green', 'orange', 'purple', 'red'];
  if (!f) {
    const pants = anyOf(['c_pants', ...C6.map((c) => `c_${c}_pants`)], 21);
    const shirts = anyOf(['c_shirt', 'c_shirt_v2', 'c_shirt_v2', ...C6.map((c) => `c_${c}_shirt_v2`)], 22);
    const under = anyOf(['c_underwear', ...C6.map((c) => `c_${c}_underwear`), 'c_skyblue_underwear'], 23);
    if (era <= 0) { if (H(p, 24) % 3 === 0) addH('cloth', under, 31); else addH('cloth', pants, 31); if (H(p, 25) % 3 === 0) addD('cloth', 'c_shirt', 37); }
    else if (soldier && era >= 2) { add('cloth', 'chainmail'); addH('cloth', pants, 31); add('cloth', 'c_boots'); }
    else if (leader && era >= 2) { add('cloth', 'c_purple_shirt_v2'); add('cloth', 'split_hose'); add('cloth', 'c_boots'); }
    else {
      if (shirts === 'c_shirt' || shirts === 'c_shirt_v2') addD('cloth', shirts, 37); else addH('cloth', shirts, 32);
      if (era >= 3 && H(p, 26) % 7 === 0) add('cloth', 'split_hose'); else addH('cloth', pants, 31);
      const feet = H(p, 27) % 4; if (era >= 1 && feet > 0) add('cloth', era >= 3 && feet >= 2 ? 'c_boots' : 'c_shoes');
    }
  } else {
    const tops0 = C6.map((c) => `${c}_bodice`);
    const tops1 = [...C6.map((c) => `${c}_bodice_mid_sleeves`), ...C6.map((c) => `${c}_bodice`), 'c_corset', ...C6.map((c) => `c_${c}_corset`)];
    const tops2 = [...C6.map((c) => `${c}_corset_long_sleeves`), ...C6.map((c) => `${c}_corset_v2_long_sleeves`), ...C6.map((c) => `${c}_bodice_long_sleeves`), 'corset_long_sleeves', 'corset_v2_long_sleeves', ...C6.map((c) => `c_${c}_corset_v2`), 'c_corset_v2'];
    const skirt = H(p, 28) % 2 ? 'c_skirt' : 'short_skirt';
    if (era <= 0) { addH('cloth', anyOf(tops0, 22), 32); addD('cloth', skirt, 38); }
    else if (soldier) { add('cloth', 'armored_corset'); add('cloth', 'c_skirt'); add('cloth', 'c_boots'); }
    else if (leader) add('cloth', era >= 2 ? 'queen_dress' : 'long_dress_purple');
    else if (era >= 2 && H(p, 29) % 3 === 0) { // a dress
      const dr = H(p, 30) % 9; add('cloth', dr === 0 ? 'blue_dress' : dr === 1 && era >= 4 ? 'fancy_blue_dress' : 'long_dress_' + C6[H(p, 5) % 5]);
      if (H(p, 27) % 2) add('cloth', 'c_boots');
    } else {
      addH('cloth', anyOf(era === 1 ? tops1 : tops2, 22), 32); addD('cloth', skirt, 38);
      const legs = H(p, 27) % 6;
      if (legs === 1) addH('cloth', anyOf(['c_socks', ...C6.map((c) => `c_${c}_socks`), 'c_skyblue_socks'], 33), 34);
      else if (legs === 2 && era >= 2) add('cloth', anyOf(['brown_thigh_high_boots', 'black_thigh_high_boots', 'red_thigh_high_boots'], 35));
      else if (legs >= 3 && era >= 1) add('cloth', 'c_boots');
    }
  }
  // --- hair (the pack ships one colour per style, so the style pool is split by the citizen's gene colour)
  const hairs = GCH.man?.hair?.[s] || [];
  // every style in every colour: the style is picked from the whole pool, then recoloured to the person's hair gene
  if (hairs.length && !(p.look?.bald)) {
    const style = hairs[((p.look?.hairStyle ?? 0) * 7 + H(p, 6)) % hairs.length];
    let hc = p.look?.hairColor ?? 2;
    if (p.age > 72 || (p.age > 55 && H(p, 13) % 3 === 0)) hc = H(p, 14) % 2 ? 7 : 6; // greying with age
    if (has('hair', s, style)) L.push(`hair/${s}_${style}.png#HAIR${hc}`);
  }
  // --- headgear
  if (!child) {
    const caps = f ? ['farming_hat_f', 'female_hat1', 'female_hat2', 'female_hat3', 'female_hat4', 'female_hat5', ...C6.filter((c) => c !== 'red').map((c) => `female_${c}_cap`), 'female_red_cap']
      : ['farming_hat_m', 'male_hat1', 'male_hat2', 'male_hat3', 'male_hat4', 'male_hat5', 'male_hat6', 'male_hat7', 'male_hat8', 'male_hat9', 'male_hat10', ...C6.map((c) => `male_${c}_cap`)];
    if (soldier && era >= 2) add('hat', p.race === 'orc' ? 'viking_helmet_with_horns' : 'guard_helmet');
    else if (soldier && p.race === 'orc') add('hat', 'viking_helmet');
    else if (prophet) add('hat', f ? 'headdress' : 'chaperon');
    else if (doctor && f) add('hat', 'witch_hat');
    else if (p.work === 'miner' && era >= 3) add('hat', f ? 'female_mining_helmet' : 'male_mining_helmet');
    else if (H(p, 7) % 3 === 0 && era >= 1) add('hat', caps[H(p, 8) % caps.length]);
  }
  // --- back & face extras: packs, lanterns, tribal paint
  if (!child && !leader) {
    const b = H(p, 11) % 12;
    // back items are drawn behind the body (first in the list), never over it
    const back = b === 0 && era >= 1 && p.role !== 'trader' && !p.nomad ? 'small_backpack' : null;
    if (back && has('back', s, back)) L.unshift(`back/${s}_${back}.png`);
    if (era <= 1 && H(p, 12) % 6 === 0) add('mask', f ? 'blue_face_paint' : 'bandit_scarf');
  }
  // --- in hand: the tool they are using right now from their own kit; soldiers fall back to the armoury's weapon
  const ha = heldArt(p);
  if (ha && !child) add('hand', ha);
  else if (soldier && !child) { const tier = era <= 1 ? 'wooden' : era <= 2 ? 'bronze' : era <= 7 ? 'iron' : 'diamond'; add('hand', era <= 0 ? 'stick' : `${tier}_sword`); }
  else if (f && !child && H(p, 9) % 4 === 0) add('hand', 'basket');
  else if (!f && !child && H(p, 9) % 9 === 0 && era <= 1) add('hand', 'stick');
  if (p.race !== 'orc' && !child && era >= 2 && H(p, 10) % 7 === 0) add('arms', f ? anyOfCat('arms', ['opera_gloves', ...C6.map((c) => `opera_gloves_${c}`), 'opera_gloves_brown'], 36) : anyOfCat('arms', ['gloves', ...C6.map((c) => `glove_${c}`), 'glove_white'], 36));
  return L;
}

// Hair dye: the pack draws each style in one colour; we re-shade it to any natural (or rare fantasy) colour by keeping
// each pixel's lightness relative to the style's average and painting it in the target colour. Cached per style+colour.
const HAIR_RGB = [[34, 26, 24], [66, 44, 30], [112, 70, 40], [138, 62, 36], [214, 112, 52], [226, 188, 104], [236, 228, 206], [160, 158, 156], [84, 124, 236], [236, 104, 176], [92, 206, 146]];
const dyed = new Map();
function dyedHair(e, hc) {
  const key = e.im.src + '|' + hc; let c = dyed.get(key); if (c) return c;
  const rgb = HAIR_RGB[hc] || HAIR_RGB[2];
  c = document.createElement('canvas'); c.width = e.im.naturalWidth; c.height = e.im.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(e.im, 0, 0);
  try {
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    let sum = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 40) { const l = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11; if (l > 40) { sum += l; n++; } }
    const mean = n ? sum / n : 128;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] === 0) continue;
      const l = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11;
      if (l < 40) { a[i] = rgb[0] * 0.3; a[i + 1] = rgb[1] * 0.3; a[i + 2] = rgb[2] * 0.3; continue; } // keep the dark outline
      const k = Math.pow(l / mean, 1.15);
      a[i] = Math.min(255, rgb[0] * k + 6); a[i + 1] = Math.min(255, rgb[1] * k + 4); a[i + 2] = Math.min(255, rgb[2] * k + 4);
    }
    x.putImageData(d, 0, 0);
  } catch { /* tainted canvas: keep the original colour */ }
  dyed.set(key, c); return c;
}
/** Composite sheet (640x392 canvas) or null while layer images are still loading. */
export function gcharSheet(p, era, role, nationColor) {
  if (!GCH.ready) return null;
  const rec = gRecipe(p, era, role, nationColor).map((r) => { const [path, f] = r.split('#'); return { e: img(path), f: f || '' }; });
  if (rec.some((r) => !r.e.ok && !r.e.failed)) return null;
  const c = document.createElement('canvas'); c.width = GW * GCOLS; c.height = GH * GROWS;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  for (const r of rec) if (r.e.ok) {
    if (r.f.startsWith('HAIR')) { x.filter = 'none'; x.drawImage(dyedHair(r.e, +r.f.slice(4)), 0, 0); continue; }
    x.filter = r.f || 'none'; x.drawImage(r.e.im, 0, 0);
  }
  x.filter = 'none';
  return c;
}
export const GCHAR_CREDIT = 'Characters, trees, foliage & props: GandalfHardcore asset packs. Fire: Pixel Fire pack. Effects: Super Pixel Effects Gigapack (Untied Games). Skill icons: VerArc Stash.';
