// LimeZu "Modern Farm" buildings, props and item icons (assets/packs/mfarm). Buildings are recoloured per race:
// elves get green-teal roofs, orcs get soot-dark timber, humans keep the warm originals.
const BASE = new URL('../../assets/packs/mfarm/', import.meta.url).href;
export const MF = { ready: false };
const imgs = new Map();
function load(path) {
  let e = imgs.get(path);
  if (!e) { e = { im: new Image(), ok: false }; e.im.onload = () => { e.ok = true; MF.ver = (MF.ver || 0) + 1; }; e.im.src = BASE + path; imgs.set(path, e); }
  return e;
}
export const BLD_FILES = ['barn_small', 'house1', 'house2', 'hayloft', 'silo', 'silo2', 'stable', 'coop', 'henhouse', 'canopy', 'canopy_tools', 'canopy_small', 'market', 'market2', 'market3', 'oven', 'woodwork', 'tailor', 'diy', 'well', 'cheese', 'scarecrow', 'doghouse', 'crate', 'crate2', 'sacks', 'boards', 'logs', 'boxes', 'hay', 'bale', 'trough', 'manger', 'table', 'mannequin', 'pot', 'eggbox', 'milk', 'bucket', 'rock_big', 'trunk'];
export function loadMFarm() { for (const n of BLD_FILES) load(`bld/${n}.png`); MF.ready = true; }
/** Settlement street furniture by era band: farmyard clutter, then carts and flowers, then lamps, benches and kiosks. */
export const DECOR = [
  ['bld:hay', 'bld:sacks', 'bld:logs', 'bld:crate', 'bld:boxes', 'bld:trough', 'bld:bale'],
  ['me:p_cart', 'me:p_cart2', 'me:p_barrels', 'me:p_vase', 'me:p_woodbench', 'bld:sacks', 'bld:crate', 'me:p_pierbarrel'],
  ['me:p_flowerbench', 'me:p_vase', 'me:p_vase2', 'me:p_cart', 'me:p_flowerbush', 'me:p_woodbench', 'me:p_barrels'],
  ['me:p_lamp', 'me:p_bench', 'me:p_hydrant', 'me:p_mailbox', 'me:p_trash', 'me:p_flowerbush', 'me:p_phone', 'me:p_pole'],
  ['me:p_lamp2', 'me:p_bench', 'me:p_ev', 'me:p_solar', 'me:p_info', 'me:p_drink', 'me:p_flowerbush2', 'me:p_trash'],
];
export const decorBand = (era) => (era <= 1 ? 0 : era <= 3 ? 1 : era <= 5 ? 2 : era <= 7 ? 3 : 4);
export function decorSprite(key) { const [src, n] = key.split(':'); const e = load(src === 'me' ? `../mext/${n}.png` : `bld/${n}.png`); return e.ok ? e.im : null; }

/** Item icon image (32x32), or null while loading / missing. */
export function itemImage(id) { const e = load(`items/${id}.png`); return e.ok ? e.im : null; }
export const itemUrl = (id) => `${BASE}items/${id}.png`;

// which sprite a building wears, by type and era 0..9 (null = keep the procedural / Gandalf art). Names with 'me:' come from
// LimeZu "Modern Exteriors": towns grow from tents and barns into Victorian streets, then offices, malls and condos.
// A list picks per building (variety on the same street).
const PICK = {
  center: [null, 'barn_small', 'barn_small', 'house2', 'me:palace', 'me:palace', 'me:clocktower', 'me:office1', 'me:office2', 'me:condo6'],
  hut: [null, null, 'barn_small', 'house1', ['house1', 'house2'], ['me:victorian5', 'me:victorian1', 'me:victorian4'], ['me:terraced1', 'me:terraced4', 'me:terraced2'], ['me:onestory', 'me:country', 'me:japanese'], ['me:modern', 'me:villa'], ['me:condo9', 'me:condo4', 'me:condo3']],
  storage: ['canopy_tools', 'canopy_tools', 'canopy_tools', 'hayloft', 'hayloft', 'hayloft', 'silo', 'me:hardware', 'me:hangar', 'me:hangar'],
  kitchen: [null, 'oven', 'oven', 'oven', 'oven', 'oven', 'me:coffee', 'me:coffee', 'me:mushroom', 'me:mushroom'],
  workshop: [null, 'woodwork', 'woodwork', 'woodwork', 'woodwork', 'diy', 'diy', 'me:hardware', 'me:hardware', 'me:hardware'],
  tailor: ['tailor', 'tailor', 'tailor', 'tailor', 'tailor', 'tailor', 'me:postoffice', 'me:postoffice', 'me:postoffice', 'me:postoffice'],
  market: [null, null, 'market', 'market2', 'me:marketmed', 'me:marketmed', 'me:marketbig', 'me:mall', 'me:mall', 'me:mall'],
  well: [null, 'well', 'well', 'well', 'well', 'me:windmill', 'me:windmill', 'me:fountain2', 'me:fountain2', 'me:fountain2'],
  coop: [null, 'coop', 'coop', 'henhouse', 'coop', 'henhouse', 'me:greenhouse', 'me:greenhouse', 'me:greenhouse', 'me:greenhouse'],
  tavern: [null, null, 'house1', 'house1', 'house1', 'house2', 'me:coffee', 'me:hotel', 'me:mushroom', 'me:mushroom'],
  barracks: [null, null, 'me:tent_mil', 'me:tent_mil', 'stable', 'stable', 'me:dorm', 'me:police', 'me:bunker', 'me:bunker'],
  healer: [null, null, null, null, null, null, 'me:hospital', 'me:hospital', 'me:hospital', 'me:hospital'],
  temple: ['me:statue_brown', 'me:statue_brown', 'me:statue_grey', 'me:statue_grey', 'me:statue_angel', 'me:chapel', 'me:chapel', 'me:fountain3', 'me:fountain3', 'me:fountain3'],
  research: [null, null, null, null, null, 'me:school', 'me:school', 'me:school', 'me:radiotower', 'me:radiotower'],
  factory: [null, null, null, null, null, null, 'me:powerhouse', 'me:powerhouse', 'me:powerhouse', 'me:powerhouse'],
  reactor: [null, null, null, null, null, null, null, 'me:powerhouse', 'me:turbine', 'me:turbine'],
  shield: [null, null, null, null, null, null, null, null, 'me:radiotower', 'me:radiotower'],
  launch: [null, null, null, null, null, null, null, null, null, 'me:helipad'],
};
/** Animated sprites: name -> frame count (frames laid out left to right). */
export const MF_FRAMES = { 'me:fountain2': 4, 'me:fountain3': 4, 'me:windmill': 4 };
/** Sprite name for a building, or null. */
export function mfName(type, era, variant = 0) {
  const row = PICK[type]; if (!row) return null;
  let n = row[Math.min(era, row.length - 1)];
  if (Array.isArray(n)) n = n[Math.abs(variant) % n.length];
  if (n === 'house1' && type === 'hut' && variant % 3 === 2 && era === 3) return 'barn_small';
  return n;
}
const tinted = new Map();
/** Race-coloured canvas of a sprite (cached). */
export function mfSprite(name, race = 'human') {
  if (!name) return null;
  const e = load(name.startsWith('me:') ? `../mext/${name.slice(3)}.png` : `bld/${name}.png`); if (!e.ok) return null;
  const key = name + '|' + race; let c = tinted.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = e.im.width; c.height = e.im.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(e.im, 0, 0);
  if (race === 'elf' || race === 'orc') {
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
      if (dd < 0.01) continue;
      const s = dd / (1 - Math.abs(2 * l - 1) + 1e-6);
      let hh = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; hh *= 60; if (hh < 0) hh += 360;
      let H2 = hh, S2 = s, L2 = l;
      if (race === 'elf' && (hh < 22 || hh > 330) && s > 0.35) { H2 = (hh + 160) % 360; S2 = s * 0.75; L2 = Math.min(1, l * 1.05); } // red roofs -> teal
      else if (race === 'elf' && hh >= 22 && hh < 50 && s > 0.3) { H2 = hh + 12; S2 = s * 0.7; L2 = Math.min(1, l * 1.08); } // pale golden wood
      if (race === 'orc') { S2 = s * 0.45; L2 = l * 0.68; if ((hh < 22 || hh > 330) && s > 0.35) { H2 = 0; S2 = 0.55; L2 = l * 0.6; } }
      const C2 = (1 - Math.abs(2 * L2 - 1)) * Math.min(1, S2), X2 = C2 * (1 - Math.abs((H2 / 60) % 2 - 1)), m = L2 - C2 / 2;
      const [r1, g1, b1] = H2 < 60 ? [C2, X2, 0] : H2 < 120 ? [X2, C2, 0] : H2 < 180 ? [0, C2, X2] : H2 < 240 ? [0, X2, C2] : H2 < 300 ? [X2, 0, C2] : [C2, 0, X2];
      d[i] = (r1 + m) * 255; d[i + 1] = (g1 + m) * 255; d[i + 2] = (b1 + m) * 255;
    }
    x.putImageData(id, 0, 0);
  }
  tinted.set(key, c); return c;
}
export const MF_CREDIT = 'Buildings, crops, farm animals and item icons: "Modern Farm" by LimeZu (limezu.itch.io).';
