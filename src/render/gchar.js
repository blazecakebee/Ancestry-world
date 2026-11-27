// Layered pixel characters from the GandalfHardcore character pack. Layers are pre-packed into compact 8x4 sheets of
// 64x56 cells by tools/build_assets.py:  row0 idle(5)  row1 walk(8)  row2 attack(6)  row3 col0 = lying down.
// Races are kept: humans use the 5 skin tones, elves get elven ears on a light skin, orcs use the orc skin set.
// The art is a single side view (facing right): the renderer mirrors it for left/up movement.
const BASE = new URL('../../assets/packs/gchar/', import.meta.url);
export const GCH = { ready: false, man: null };
export const GW = 64, GH = 56, GFOOT = 55, GTOP = 8;       // cell size, y of the feet, y of the top of the head
export const GROW = { idle: 0, walk: 1, attack: 2, down: 3 }, GFRAMES = { idle: 5, walk: 8, attack: 6 };
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

/** Ordered layer file list (back to front) for one citizen. */
export function gRecipe(p, era, role, nationColor) {
  const s = p.sex === 'f' ? 'f' : 'm', f = s === 'f', L = [];
  const add = (cat, name) => { if (name && has(cat, s, name)) { L.push(`${cat}/${s}_${name}.png`); return true; } return false; };
  const pick = (arr, salt) => arr[H(p, salt) % arr.length];
  const child = p.age < 14, soldier = role === 'soldier', prophet = role === 'prophet', leader = role === 'leader', doctor = role === 'doctor';
  const skinN = 1 + Math.min(4, Math.floor(((p.look?.skin ?? 3) / 8) * 5));
  // --- back layer (behind the body)
  if (leader && !child) add('back', 'cape_' + pick(COL, 1));
  else if (p.role === 'trader' || p.nomad) add('back', 'small_backpack');
  // --- body by race
  if (p.race === 'orc') add('skin', 'orc'); else add('skin', 'skin' + skinN);
  if (p.race === 'elf') add('ears', 'elf' + skinN);
  // --- clothing by era
  const sh = pick(COL, 2), tone = pick(COL, 3);
  if (!f) {
    if (era <= 0) { add('cloth', 'c_pants'); }
    else if (era === 1) { add('cloth', 'c_shirt'); add('cloth', 'c_pants'); }
    else {
      if (soldier && era >= 2) { add('cloth', 'chainmail'); add('cloth', 'c_pants'); }
      else if (leader) { add('cloth', 'c_purple_shirt_v2'); add('cloth', 'split_hose'); }
      else { add('cloth', has('cloth', 'm', `c_${sh}_shirt_v2`) ? `c_${sh}_shirt_v2` : 'c_shirt_v2'); add('cloth', has('cloth', 'm', `c_${tone}_pants`) ? `c_${tone}_pants` : 'c_pants'); }
      add('cloth', era >= 3 ? 'c_boots' : 'c_shoes');
    }
  } else {
    if (era <= 0) { add('cloth', pick(['orange_bodice', 'green_bodice', 'red_bodice'], 4)); add('cloth', 'short_skirt'); }
    else if (era === 1) { add('cloth', `${tone}_bodice_mid_sleeves`) || add('cloth', 'c_corset'); add('cloth', 'c_skirt'); }
    else if (soldier) { add('cloth', 'armored_corset'); add('cloth', 'c_skirt'); add('cloth', 'c_boots'); }
    else if (leader) add('cloth', 'queen_dress');
    else if (era <= 4) { add('cloth', 'long_dress_' + (['blue', 'green', 'orange', 'purple', 'red'][H(p, 5) % 5])); add('cloth', 'c_boots'); }
    else { add('cloth', `${tone}_corset_long_sleeves`) || add('cloth', 'c_corset'); add('cloth', 'c_skirt'); add('cloth', 'c_boots'); }
  }
  // --- hair (the pack ships one colour per style, so the style pool is split by the citizen's gene colour)
  const hairs = GCH.man?.hair?.[s] || [];
  if (hairs.length && !(p.look?.bald)) { const gi = (p.look?.hairStyle ?? 0) * 5 + (p.look?.hairColor ?? 0) * 7 + H(p, 6) % 3; add('hair', hairs[gi % hairs.length]); }
  // --- headgear
  if (!child) {
    if (soldier && era >= 2) add('hat', p.race === 'orc' ? 'viking_helmet_with_horns' : 'guard_helmet');
    else if (soldier && p.race === 'orc') add('hat', 'viking_helmet');
    else if (prophet) add('hat', f ? 'headdress' : 'chaperon');
    else if (doctor && f) add('hat', 'witch_hat');
    else if (H(p, 7) % 5 === 0 && era >= 1) add('hat', f ? pick(['farming_hat_f', 'female_hat1', 'female_hat2', 'female_hat3'], 8) : pick(['farming_hat_m', 'male_hat1', 'male_hat2', 'male_hat3', 'male_blue_cap', 'male_red_cap'], 8));
  }
  // --- gloves for the well-off, held item by role / era (metal tier follows the era)
  const tier = era <= 1 ? 'wooden' : era <= 2 ? 'bronze' : era <= 7 ? 'iron' : 'diamond';
  // best skill decides the tool they carry: stable over a life, so sheets are not rebuilt every job change
  let best = '', bl = 7; for (const k of ['plants', 'mining', 'construction']) { const v = p.skills?.[k]?.lvl ?? 0; if (v > bl) { bl = v; best = k; } }
  if (soldier && !child) add('hand', era <= 0 ? 'stick' : `${tier}_sword`);
  else if (!child && best === 'plants') add('hand', f ? 'hoe_f' : 'hoe_m');
  else if (!child && best === 'construction') add('hand', `${tier}_axe`);
  else if (!child && best === 'mining') add('hand', `${tier}_pickaxe`);
  else if (f && !child && H(p, 9) % 4 === 0) add('hand', 'basket');
  if (p.race !== 'orc' && !child && era >= 5 && H(p, 10) % 6 === 0) add('arms', f ? 'opera_gloves' : 'gloves');
  return L;
}

/** Composite sheet (512x224 canvas) or null while layer images are still loading. */
export function gcharSheet(p, era, role, nationColor) {
  if (!GCH.ready) return null;
  const layers = gRecipe(p, era, role, nationColor).map(img);
  if (layers.some((e) => !e.ok && !e.failed)) return null;
  const c = document.createElement('canvas'); c.width = GW * 8; c.height = GH * 4;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  for (const e of layers) if (e.ok) x.drawImage(e.im, 0, 0);
  return c;
}
export const GCHAR_CREDIT = 'Characters, trees, foliage & props: GandalfHardcore asset packs. Fire: Pixel Fire pack. Effects: Super Pixel Effects Gigapack (Untied Games). Skill icons: VerArc Stash.';
