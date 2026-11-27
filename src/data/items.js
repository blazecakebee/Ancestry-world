// Items: every harvest, hunt and craft produces named goods. Each item belongs to one resource category (the totals the
// economy reasons about: food, meals, rations, wood, stone, metal, cloth, medicine). Icons are Modern Farm art
// (assets/packs/mfarm/items/<id>.png) or an atlas icon name for the few goods that pack has no picture for.
import { B } from './biomes.js';
import { TOOL_KINDS, TOOL_MATS, toolId, toolName } from './tools.js';

export const CATS = ['food', 'meals', 'rations', 'wood', 'stone', 'metal', 'cloth', 'medicine', 'tools'];
export const CAT_LABEL = { food: 'Raw food', meals: 'Meals', rations: 'Rations', wood: 'Wood', stone: 'Stone', metal: 'Metal', cloth: 'Cloth & hides', medicine: 'Medicine', tools: 'Tools & weapons' };

// id: [name, category, value per unit (how much of the category one unit is worth)]
export const ITEMS = {
  wood: ['Logs', 'wood'], planks: ['Planks', 'wood'],
  stone: ['Stone', 'stone'],
  copper: ['Copper ore', 'metal'], iron: ['Iron ore', 'metal'], gold: ['Gold', 'metal'],
  beef: ['Red meat', 'food'], poultry: ['Poultry', 'food'], egg: ['Eggs', 'food'], fish: ['Fish', 'food'], fish2: ['Reef fish', 'food'],
  berries: ['Berries', 'food'], grapes: ['Grapes', 'food'], apple: ['Apples', 'food'], banana: ['Bananas', 'food'], lemon: ['Lemons', 'food'],
  wheat: ['Wheat', 'food'], carrot: ['Carrots', 'food'], cabbage: ['Cabbage', 'food'], corn: ['Corn', 'food'], pumpkin: ['Pumpkins', 'food'],
  onion: ['Onions', 'food'], turnip: ['Turnips', 'food'], tomato: ['Tomatoes', 'food'], radish: ['Radishes', 'food'], cauliflower: ['Cauliflower', 'food'],
  pepper: ['Chili peppers', 'food'], watermelon: ['Watermelons', 'food'], zucchini: ['Zucchini', 'food'], pineapple: ['Pineapples', 'food'],
  pricklypear: ['Prickly pears', 'food'], coffee: ['Coffee beans', 'food'],
  meal: ['Cooked meals', 'meals'], bread: ['Bread', 'meals'], pastry: ['Pastries', 'meals'], roast: ['Roast fowl', 'meals'], cheese: ['Cheese', 'meals'],
  ration: ['Preserved rations', 'rations'],
  hide: ['Hides', 'cloth'], wool: ['Wool', 'cloth'], cotton: ['Cotton', 'cloth'], cloth: ['Woven cloth', 'cloth'],
  medicine: ['Medicine', 'medicine'],
};
for (const k of Object.keys(TOOL_KINDS)) for (const m of Object.keys(TOOL_MATS)) ITEMS[toolId(k, m)] = [toolName(k, m), 'tools'];
export const itemName = (id) => ITEMS[id]?.[0] || id;
export const itemCat = (id) => ITEMS[id]?.[1] || id;
/** Atlas icon fallback for items without Modern Farm art. */
export const ITEM_ATLAS = { medicine: 'medicine' };
/** The generic item a category falls back to when old code adds to a category total directly. */
export const CAT_DEFAULT = { food: 'berries', meals: 'meal', rations: 'ration', wood: 'wood', stone: 'stone', metal: 'copper', cloth: 'hide', medicine: 'medicine', tools: 'axe_wood' };

// What hunting / butchering each creature gives: [meat item, meat amount, extra item, extra amount]
export const ANIMAL_DROPS = {
  cow: ['beef', 14, 'hide', 5], horse: ['beef', 11, 'hide', 4], sheep: ['beef', 6, 'wool', 6], goat: ['beef', 7, 'hide', 3],
  pig: ['beef', 10, 'hide', 2], chicken: ['poultry', 3, 'egg', 2], duck: ['poultry', 3, 'egg', 1], rabbit: ['beef', 2, 'hide', 1],
  fox: ['beef', 3, 'hide', 2], dog: ['beef', 2, 'hide', 1], cat: ['beef', 1, 'hide', 1],
};

// Farm crops, matching the Modern Farm crop sheet rows (render/farm.js CROP sheet order).
export const CROPS = ['wheat', 'carrot', 'cabbage', 'corn', 'pumpkin', 'onion', 'turnip', 'tomato', 'radish', 'cauliflower', 'pepper', 'grapes', 'watermelon', 'zucchini', 'cotton', 'pineapple', 'pricklypear', 'coffee'];
// crop pools by climate (indices into CROPS); wheat and carrots grow nearly everywhere
const POOL = {
  cold: [0, 0, 1, 2, 5, 6, 6, 8, 9, 2],
  temperate: [0, 0, 0, 1, 1, 2, 3, 4, 5, 7, 9, 11, 13, 14],
  warm: [0, 3, 3, 4, 7, 7, 10, 11, 12, 13, 14, 15, 17],
  dry: [0, 3, 10, 12, 14, 16, 16, 15],
};
const climate = (b) => (b === B.TUNDRA || b === B.TAIGA || b === B.MOUNTAIN ? 'cold' : b === B.DESERT || b === B.SAVANNA || b === B.BADLANDS || b === B.STEPPE || b === B.SALTFLAT ? 'dry'
  : b === B.JUNGLE || b === B.SWAMP || b === B.MANGROVE || b === B.BEACH ? 'warm' : 'temperate');
const hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Crop sheet index grown on a farm tile: one crop per 2x2 patch, picked from what suits the climate. */
export function cropKindAt(world, i) {
  const W = world.W, x = i % W, y = (i / W) | 0, b = world.tiles.biome[i];
  const pool = POOL[climate(b)] || POOL.temperate;
  return pool[Math.floor(hash(x >> 1, y >> 1) * pool.length)];
}
/** Wild plants: what a berry bush gives in this biome. */
export const wildFruit = (b) => (b === B.JUNGLE || b === B.MANGROVE ? 'banana' : b === B.SAVANNA || b === B.DESERT ? 'pricklypear' : b === B.AUTUMN ? 'apple' : b === B.FOREST ? 'berries' : 'berries');
