// Layered characters from the Universal LPC Spritesheet (CC-BY-SA 3.0 / GPL 3.0, see assets/packs/lpc/AUTHORS.txt).
// Each citizen is assembled from layers chosen by race, sex, genes, era and role, giving real
// walk / slash / hurt animations in four directions. Only light procedural touches are added on top
// (modern weapons for eras the LPC set doesn't cover, a few accents).
import { makeCanvas, PixBuf, rgba } from './pixel.js';

const BASE = new URL('../../assets/packs/lpc/', import.meta.url).href;
export const LPC = { ready: false, files: null, has: (p) => LPC.files?.has(p) };
export const LW = 48, LH = 60, LX = 8, LY = 4; // crop window inside each 64x64 LPC frame
export const LROW = { walk: 0, slash: 4, hurt: 8 }; // row offsets in our compact sheet (dir added for walk/slash)
const SRC_ROW = { walk: 8, slash: 12, hurt: 20 };
const COLS = { walk: 9, slash: 6, hurt: 6 };
export const LPC_BAND = { top: 10, headEnd: 26, hipY: 42, bottom: 58, cx: 24 };

const imgs = new Map();
function img(path) {
  let e = imgs.get(path);
  if (!e) { e = { im: new Image(), ok: false, failed: false }; e.im.onload = () => { e.ok = true; }; e.im.onerror = () => { e.failed = true; }; e.im.src = BASE + encodeURI(path); imgs.set(path, e); }
  return e;
}

export async function loadLPC() {
  try {
    const list = await (await fetch(BASE + 'manifest.json')).json();
    LPC.files = new Set(list); LPC.ready = true;
    // warm the most common bodies
    for (const s of ['male', 'female']) for (const t of ['light', 'tanned', 'tanned2', 'dark', 'dark2', 'orc', 'darkelf']) if (LPC.has(`body/${s}/${t}.png`)) img(`body/${s}/${t}.png`);
    return true;
  } catch { console.info('[lpc] no LPC pack found'); return false; }
}

const H = (p, salt = 0) => { let h = (p.id * 2654435761 + salt * 40503) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return h; };
const pick = (p, arr, salt) => arr[H(p, salt) % arr.length];
const first = (...paths) => paths.find((x) => x && LPC.has(x)) || null;

const F_HAIR = ['bangslong', 'bangslong2', 'bangsshort', 'bunches', 'loose', 'pixie', 'ponytail', 'ponytail2', 'princess', 'shoulderl', 'shoulderr', 'swoop', 'unkempt'];
const M_HAIR = ['bangs', 'bedhead', 'long', 'longhawk', 'messy1', 'messy2', 'mohawk', 'page', 'parted', 'shorthawk'];
// gene hair colour index -> LPC colour names (female set is richer than male)
const F_COL = [['raven', 'black'], ['brunette', 'brunette2'], ['brown'], ['ruby-red'], ['redhead'], ['blonde', 'light-blonde'], ['white-blonde', 'white'], ['gray'], ['blue', 'blue2'], ['pink', 'pink2'], ['green', 'green2']];
const M_COL = [['raven'], ['brunette'], ['brunette'], ['redhead'], ['redhead'], ['blonde'], ['white-blonde'], ['white-blonde'], ['blue'], ['pink'], ['green']];
const EYES = ['blue', 'green', 'brown', 'orange', 'gray', 'yellow'];

function tone(p) {
  const s = p.look.skin;
  if (p.race === 'orc') return (p.id % 7 === 0) ? 'red_orc' : 'orc';
  if (p.race === 'elf') return s >= 5 ? 'darkelf2' : 'darkelf'; // lavender-skinned elves, matching the world's art
  return s <= 1 ? 'light' : s <= 3 ? 'tanned' : s <= 5 ? 'tanned2' : s <= 7 ? 'dark' : 'dark2';
}

/** Ordered list of LPC layer paths for this citizen. */
export function recipe(p, era, role) {
  const sx = p.sex === 'f' ? 'female' : 'male', f = p.sex === 'f';
  const t = tone(p), L = [];
  const add = (...paths) => { const x = first(...paths); if (x) L.push(x); return x; };
  const color = (list, salt) => pick(p, list, salt);
  const SH = ['white', 'brown', 'maroon', 'teal'];
  const soldier = role === 'soldier', prophet = role === 'prophet', leader = role === 'leader', doctor = role === 'doctor';
  // behind the body
  if (leader && era <= 5) add(f ? `behind_body/cape/normal/female/cape_${color(['red', 'blue', 'maroon', 'lavender', 'yellow'], 1)}.png` : `torso/back/cape/normal/female/cape_${color(['red', 'blue', 'maroon', 'black'], 1)}.png`);
  if (soldier && (era === 1 || era === 2)) add('behind_body/equipment/quiver.png');
  // body & face
  add(`body/${sx}/${t}.png`, `body/${sx}/light.png`);
  if (p.race !== 'orc') {
    const nose = ['buttonnose', 'straightnose', 'bignose'][p.look.nose % 3];
    const nt = t === 'darkelf' && f ? 'darkelf' : t;
    add(`body/${sx}/nose/${nose}_${nt}.png`);
  }
  if (p.race === 'elf') add(`body/${sx}/ears/elvenears_${t === 'darkelf' && f ? 'darkelf1' : t}.png`, `body/${sx}/ears/elvenears_light.png`);
  add(`body/${sx}/eyes/${p.race === 'orc' ? color(['red', 'yellow', 'orange'], 2) : p.race === 'elf' ? color(['purple', 'blue', 'green'], 2) : EYES[p.look.eyes % EYES.length]}.png`);

  // ---- clothing by era & role ----
  const legs = (c) => add(`legs/pants/${sx}/${c}_pants_${sx}.png`);
  const shoes = (c) => add(`feet/shoes/${sx}/${c}_shoes_${sx}.png`);
  const longsleeve = (c) => add(`torso/shirts/longsleeve/male/${c}_longsleeve.png`);
  const tunicF = (c) => add(`torso/tunics/female/${c}_tunic.png`);
  const sleevelessF = (c, pirate) => add(`torso/shirts/sleeveless/female/${c}_${pirate ? 'pirate' : 'sleeveless'}.png`);
  const belt = (k) => add(k === 'leather' ? `belt/leather/${sx}/leather_${sx}.png` : `belt/cloth/${sx}/white_cloth_${sx}.png`, `belt/leather/${sx}/leather_${sx}.png`);
  const top = (c) => (f ? (era % 2 ? tunicF(c) : sleevelessF(c, era >= 5)) : longsleeve(c));
  let hideHair = false, weapon = null;
  if (soldier) {
    if (era <= 1) { add(`torso/leather/chest_${sx}.png`); add(`legs/skirt/male/robe_skirt_male.png`); weapon = 'spear'; }
    else if (era === 2) { add(`torso/leather/chest_${sx}.png`); add(`torso/leather/shoulders_${sx}.png`); legs('red'); add(`head/caps/${sx}/leather_cap_${sx}.png`); weapon = 'spear'; hideHair = true; }
    else if (era === 3) { add(`torso/chain/mail_${sx}.png`); legs('red'); add(`feet/armor/${sx}/metal_boots_${sx}.png`); add(`head/helms/${sx}/chainhat_${sx}.png`); weapon = 'spear'; hideHair = true; }
    else if (era === 4) { add(`torso/plate/chest_${sx}.png`); add(`torso/plate/arms_${sx}.png`); add(`legs/armor/${sx}/metal_pants_${sx}.png`); add(`feet/armor/${sx}/metal_boots_${sx}.png`); add(`hands/gloves/${sx}/metal_gloves_${sx}.png`); add(`head/helms/${sx}/metal_helm_${sx}.png`); weapon = 'dagger'; hideHair = true; }
    else if (era === 5) { add(`torso/chain/tabard/jacket_${sx}.png`); legs('white'); shoes('black'); weapon = 'dagger'; }
    else if (era === 6 || era === 7) { longsleeve(era === 6 ? 'maroon' : 'brown'); if (f) tunicF(era === 6 ? 'maroon' : 'brown'); add(`torso/leather/chest_${sx}.png`); legs(era === 6 ? 'red' : 'teal'); shoes('black'); add(`head/helms/${sx}/chainhat_${sx}.png`); hideHair = true; }
    else { add(`torso/gold/chest_${sx}.png`); add(`torso/gold/arms_${sx}.png`); add(`legs/armor/${sx}/golden_greaves_${sx}.png`); add(`feet/armor/${sx}/golden_boots_${sx}.png`); add(`hands/gloves/${sx}/golden_gloves_${sx}.png`); add(`head/helms/${sx}/golden_helm_${sx}.png`); hideHair = true; }
  } else if (prophet) {
    if (f) add(`torso/robes_female_no_th-sh/${color(['white', 'light gray', 'purple'], 3)}.png`);
    else { longsleeve('white'); add('legs/skirt/male/robe_skirt_male.png'); }
    belt('cloth');
    if (era >= 1) { add(`head/hoods/${sx}/cloth_hood_${sx}.png`); hideHair = true; }
  } else if (doctor && era >= 5) {
    if (f) { tunicF('white'); legs('white'); } else { longsleeve('white'); legs('white'); add('formal_male_no_th-sh/tie.png'); }
    shoes('black');
  } else if (era === 0) {
    if (f) { add('torso/shirts/sleeveless/female/brown_sleeveless.png'); add('legs/skirt/female/robe_skirt_female_incomplete.png'); }
    else add('legs/skirt/male/robe_skirt_male.png');
    add(`belt/leather/${sx}/leather_${sx}.png`);
  } else if (era === 1) {
    if (f) tunicF(color(['brown', 'white'], 4)); else longsleeve('brown');
    add(f ? 'legs/skirt/female/robe_skirt_female_incomplete.png' : 'legs/skirt/male/robe_skirt_male.png');
    belt('leather'); add(f ? `feet/slippers_female/${color(['brown', 'black'], 5)}.png` : null);
  } else if (era <= 3) {
    if (f) { tunicF(color(['white', 'teal', 'maroon'], 6)); add(`accessories/necklaces_female_ no_th-sh/${era === 2 ? 'bronze' : 'iron'}.png`); add(`feet/slippers_female/${color(['brown', 'white'], 5)}.png`); }
    else { longsleeve(color(['white', 'teal', 'maroon'], 6)); era === 2 ? add('legs/skirt/male/robe_skirt_male.png') : legs(color(['teal', 'red'], 7)); shoes('brown'); }
    belt('leather');
  } else if (era === 4) {
    if (f) { add('torso/dress_female/underdress.png'); add(color(['torso/dress_female/dress_w_sash_female.png', 'torso/dress_female/overskirt.png'], 8)); add(`feet/slippers_female/${color(['brown', 'black'], 5)}.png`); }
    else { longsleeve(color(SH, 6)); legs(color(['teal', 'red', 'magenta'], 7)); shoes(color(['brown', 'black', 'maroon'], 9)); belt('leather'); }
  } else if (era <= 6) {
    if (f) { add('torso/dress_female/underdress.png'); add('torso/dress_female/blue_vest.png'); add('feet/slippers_female/black.png'); }
    else { add('formal_male_no_th-sh/pants.png') || legs('teal'); add('formal_male_no_th-sh/shirt.png'); add(era === 6 ? 'formal_male_no_th-sh/vest.png' : null); add(color(['formal_male_no_th-sh/bowtie.png', 'formal_male_no_th-sh/tie.png'], 10)); shoes('black'); }
  } else if (era === 7) {
    top(color(SH, 6)); legs(color(['teal', 'white', 'red', 'magenta'], 7)); shoes(color(['black', 'brown', 'maroon'], 9));
  } else {
    if (f) tunicF('white'); else longsleeve('white');
    legs('white'); add(f ? 'feet/slippers_female/white.png' : 'feet/shoes/male/black_shoes_male.png');
    add(`hands/bracers/${sx}/${f ? 'white_cloth_bracers' : 'leather_bracers_male'}.png`);
  }
  if (leader) { if (f) add(`head/tiaras_female/${era <= 2 ? 'bronze' : era <= 5 ? 'gold' : 'silver'}.png`); else add(`accessories/necklaces_female_ no_th-sh/gold.png`); }
  // hair
  if (!hideHair) {
    const gray = p.age > 58;
    if (f) {
      const style = F_HAIR[(p.look.hairStyle * 7 + (p.id % 5)) % F_HAIR.length];
      const cols = gray ? ['gray', 'white'] : F_COL[p.look.hairColor % F_COL.length];
      add(`hair/female/${style}/${pick(p, cols, 11)}.png`, `hair/female/${style}/brown.png`);
    } else if (p.look.hairStyle !== 0) {
      const style = M_HAIR[(p.look.hairStyle * 5 + (p.id % 3)) % M_HAIR.length];
      const cols = gray ? ['white-blonde'] : M_COL[p.look.hairColor % M_COL.length];
      add(`hair/male/${style}/${pick(p, cols, 11)}.png`, `hair/male/${style}/brunette.png`);
    }
  }
  if (!soldier && p.age >= 14 && era >= 2 && era <= 4 && !f && H(p, 12) % 9 === 0) add(`head/bandanas/male/red.png`);
  // weapon (slash animations use right-hand weapons)
  if (soldier && weapon === 'spear') add(`weapons/right hand/${sx}/spear_${sx}.png`);
  if (soldier && weapon === 'dagger') add(`weapons/right hand/${sx}/dagger_${sx}.png`);
  if (prophet) add(`weapons/right hand/${sx}/woodwand_${sx}.png`);
  return { layers: L, modernWeapon: soldier && era >= 5 ? (era >= 8 ? 'plasma' : era >= 6 ? 'rifle' : 'musket') : null };
}

/** Compose the compact sheet (9 cols x 9 rows of 48x60). Returns null until all layers have loaded. */
export function lpcSheet(p, era, role) {
  const { layers, modernWeapon } = recipe(p, era, role);
  const loaded = layers.map(img);
  if (loaded.some((e) => !e.ok && !e.failed)) return null;
  const c = makeCanvas(LW * 9, LH * 9), x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const copy = (group, srcRow, dstRow) => {
    for (let col = 0; col < COLS[group]; col++) for (const e of loaded) if (e.ok) x.drawImage(e.im, col * 64 + LX, srcRow * 64 + LY, LW, LH, col * LW, dstRow * LH, LW, LH);
  };
  for (let d = 0; d < 4; d++) { copy('walk', SRC_ROW.walk + d, LROW.walk + d); copy('slash', SRC_ROW.slash + d, LROW.slash + d); }
  copy('hurt', SRC_ROW.hurt, LROW.hurt);
  if (modernWeapon) overlayModernWeapon(x, modernWeapon);
  return c;
}

// Firearms & plasma lances for eras the LPC set doesn't cover: drawn into the hand on every frame.
function overlayModernWeapon(x, kind) {
  const col = { musket: ['#84603a', '#3a3438'], rifle: ['#3a3438', '#22201f'], plasma: ['#c8d8ec', '#58f0ff'] }[kind];
  const hand = [[30, 40], [18, 41], [32, 40], [33, 41]]; // approx right-hand position per direction (back, left, front, right) in crop space
  for (let row = 0; row < 8; row++) {
    const d = row % 4; if (d === 0) continue;
    for (let colI = 0; colI < (row < 4 ? 9 : 6); colI++) {
      const [hx, hy] = hand[d], ox = colI * LW, oy = row * LH;
      const dirx = d === 1 ? -1 : 1, swing = row >= 4 ? Math.sin(colI / 5 * Math.PI) * 4 : 0;
      x.fillStyle = col[0];
      if (d === 2) x.fillRect(ox + hx - 1, oy + hy - 8 - swing, 2, 12);
      else x.fillRect(ox + hx + (dirx < 0 ? -12 : 0), oy + hy - 1 - swing, 12, 2);
      x.fillStyle = col[1];
      if (d === 2) x.fillRect(ox + hx - 1, oy + hy - 10 - swing, 2, 2); else x.fillRect(ox + hx + (dirx < 0 ? -13 : 11), oy + hy - 2 - swing, 2, 2);
    }
  }
}

export const LPC_CREDIT = 'Character art: Universal LPC Spritesheet (Liberated Pixel Cup contributors, CC-BY-SA 3.0 / GPL 3.0). See assets/packs/lpc/AUTHORS.txt.';
