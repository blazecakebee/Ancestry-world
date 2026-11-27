// The research tree. Each era has five ordinary technologies and one capstone. A nation enters the next era when it
// finishes that era's capstone, which needs at least three of the era's other techs first. Research points flow into
// whichever tech the nation is focused on (players choose; AI nations pick for themselves).
// fx keys: food / wood / stone / metal / cloth (extra yield when gathering that resource), mine (mine output), research,
// glitter, build (construction speed), cook (cooking speed), mood (flat mood), heal (tending quality), move (walk speed).
import { ERAS } from './eras.js';

const T = (id, era, name, icon, desc, fx = {}, extra = {}) => ({ id, era, name, icon, desc, fx, ...extra });
export const TECHS = [
  // ---- Stone Age
  T('firekeeping', 0, 'Firekeeping', 'fire', 'Steady hearths: cooking is faster and nights are warmer.', { cook: 0.25, mood: 1 }),
  T('foraging', 0, 'Foraging Lore', 'berries', 'Which roots and berries are safe. +20% wild food.', { food: 0.2 }),
  T('knapping', 0, 'Stone Knapping', 'stone', 'Sharp flint tools. +25% stone, +15% wood.', { stone: 0.25, wood: 0.15 }),
  T('tailoring', 0, 'Hide Tailoring', 'hide', 'Sew hides into clothing. Everyone makes themselves an outfit. Unlocks the Tailor.', { cloth: 0.2 }, { flag: 'tailoring' }),
  T('tracking', 0, 'Animal Tracking', 'beef', 'Read the tracks of game. Hunters bring back more.', { food: 0.1 }),
  T('agriculture', 0, 'Agriculture', 'wheat', 'Sow seeds and harvest fields. Leads into the Neolithic.', {}, { cap: true }),
  // ---- Neolithic
  T('pottery', 1, 'Pottery', 'meals', 'Jars to cook and store in. Unlocks the Kitchen; cooking +20%.', { cook: 0.2 }),
  T('weaving', 1, 'Weaving', 'wool', 'Looms turn wool and cotton into cloth. +30% cloth.', { cloth: 0.3 }),
  T('herbalism', 1, 'Herbalism', 'medicine', 'Poultices and herbs. Better tending.', { heal: 0.15 }),
  T('domestication', 1, 'Domestication', 'egg', 'Tame herds near home. +15% food.', { food: 0.15 }),
  T('masonry', 1, 'Masonry', 'stone', 'Dressed stone. +25% stone, building +10%.', { stone: 0.25, build: 0.1 }),
  T('smelting', 1, 'Copper Smelting', 'copper', 'Melt ore into metal. Leads into the Bronze Age.', { metal: 0.2 }, { cap: true }),
  // ---- Bronze Age
  T('writing', 2, 'Writing', 'book', 'Records outlast memory. +15% research.', { research: 0.15 }),
  T('bronzetools', 2, 'Bronze Tools', 'copper', 'Sturdier axes and picks. +20% wood and stone.', { wood: 0.2, stone: 0.2 }),
  T('mining', 2, 'Shaft Mining', 'iron', 'Dig deep for ore. Unlocks the Mine; mines +30%.', { mine: 0.3, metal: 0.15 }),
  T('trade', 2, 'Trade Routes', 'gold', 'Merchants and markets. Unlocks the Market.', { glitter: 0.1, mood: 1 }),
  T('drill', 2, 'Military Drill', 'shield', 'Trained soldiers. Unlocks the Barracks.', {}),
  T('ironworking', 2, 'Iron Working', 'iron', 'Forge iron. Leads into the Iron Age.', { metal: 0.2 }, { cap: true }),
  // ---- Iron Age
  T('roads', 3, 'Roads', 'map', 'Paved ways. People walk faster.', { move: 0.1 }),
  T('currency', 3, 'Coinage', 'gold', 'Coins ease every exchange. +15% Glitter.', { glitter: 0.15 }),
  T('aqueducts', 3, 'Aqueducts', 'flask', 'Clean water. Better health and mood.', { heal: 0.1, mood: 2 }),
  T('ironplow', 3, 'Iron Plow', 'wheat', 'Deeper furrows. +20% crops.', { food: 0.2 }),
  T('philosophy', 3, 'Philosophy', 'bulb', 'Schools of thought. +15% research. Unlocks the Tavern.', { research: 0.15 }),
  T('feudalism', 3, 'Feudalism', 'crown', 'Lords, vassals and castles. Leads into the Medieval era.', { build: 0.1 }, { cap: true }),
  // ---- Medieval
  T('rotation', 4, 'Crop Rotation', 'cabbage', 'Fields rest in turn. +20% crops.', { food: 0.2 }),
  T('guilds', 4, 'Guilds', 'hammer', 'Master builders. Construction +20%.', { build: 0.2 }),
  T('cathedrals', 4, 'Cathedrals', 'temple', 'Soaring faith. +20% Glitter.', { glitter: 0.2 }),
  T('brewing', 4, 'Brewing', 'meals', 'Ale and inns. +2 mood.', { mood: 2 }),
  T('armor', 4, 'Plate Armor', 'shield', 'Knights in steel. Tougher soldiers.', { metal: 0.1 }),
  T('printing', 4, 'Printing Press', 'scroll', 'Books for all. Leads into the Renaissance.', { research: 0.1 }, { cap: true }),
  // ---- Renaissance
  T('anatomy', 5, 'Anatomy', 'heart', 'How the body works. Much better tending.', { heal: 0.2 }),
  T('banking', 5, 'Banking', 'gold', 'Credit and ledgers. +15% Glitter.', { glitter: 0.15 }),
  T('astronomy', 5, 'Astronomy', 'star', 'Charting the heavens. +20% research.', { research: 0.2 }),
  T('gunpowder', 5, 'Gunpowder', 'fire', 'Muskets and cannon.', { mine: 0.2 }),
  T('navigation', 5, 'Navigation', 'map', 'Compass and sail. +10% food from the sea, faster travel.', { food: 0.1, move: 0.05 }),
  T('steam', 5, 'Steam Power', 'gear', 'Engines that never tire. Leads into the Industrial era.', { build: 0.1 }, { cap: true }),
  // ---- Industrial
  T('factories', 6, 'Factories', 'hammer', 'Assembly lines. Unlocks the Factory; construction +15%.', { build: 0.15 }),
  T('railways', 6, 'Railways', 'map', 'Rails across the land. Faster travel.', { move: 0.1 }),
  T('vaccines', 6, 'Vaccines', 'flask', 'Disease in retreat.', { heal: 0.2 }),
  T('massprod', 6, 'Mass Production', 'gear', 'Cheap goods for all. +20% wood, stone and metal.', { wood: 0.2, stone: 0.2, metal: 0.2 }),
  T('electricity', 6, 'Electricity', 'bulb', 'Light and power. +20% research.', { research: 0.2 }),
  T('fission', 6, 'Nuclear Fission', 'warning', 'Splitting the atom. Leads into the Atomic era.', {}, { cap: true }),
  // ---- Atomic
  T('computers', 7, 'Computers', 'gear', 'Machines that think in numbers. +25% research.', { research: 0.25 }),
  T('greenrev', 7, 'Green Revolution', 'corn', 'Fertilisers and new strains. +30% crops.', { food: 0.3 }),
  T('rocketry', 7, 'Rocketry', 'star', 'Reach for orbit.', { build: 0.1 }),
  T('antibiotics', 7, 'Antibiotics', 'medicine', 'Infections cured.', { heal: 0.2 }),
  T('plastics', 7, 'Plastics', 'cloth', 'Light, cheap materials. +25% cloth.', { cloth: 0.25 }),
  T('fusion', 7, 'Fusion Power', 'sun', 'A star in a bottle. Leads into the Ultra-Tech era.', { research: 0.1 }, { cap: true }),
  // ---- Ultra-Tech
  T('shields', 8, 'Energy Shields', 'shield', 'Unlocks the Shield Pylon.', {}),
  T('arcology', 8, 'Arcologies', 'house', 'Cities in a single tower. +3 mood.', { mood: 3 }),
  T('ai', 8, 'Artificial Minds', 'bulb', 'Thinking machines. +30% research.', { research: 0.3 }),
  T('nanomed', 8, 'Nano-medicine', 'heart', 'Machines that heal.', { heal: 0.3 }),
  T('synthfood', 8, 'Synthetic Food', 'meals', 'Food from air and light. +30% food.', { food: 0.3 }),
  T('starflight', 8, 'Interstellar Travel', 'globe', 'Ships for the void. Leads into the Offworld era.', {}, { cap: true }),
  // ---- Offworld
  T('orbital', 9, 'Orbital Stations', 'globe', 'Homes above the sky. +2 mood.', { mood: 2 }),
  T('terraforming', 9, 'Terraforming', 'tree', 'Remake dead worlds. +20% food and wood.', { food: 0.2, wood: 0.2 }),
  T('lunarmining', 9, 'Lunar Mining', 'iron', 'Ore from the moon. +40% metal.', { metal: 0.4, mine: 0.4 }),
  T('cryo', 9, 'Cryosleep', 'moon', 'Sleep across the stars.', { heal: 0.1 }),
  T('warpgate', 9, 'Warp Theory', 'star', 'Fold space. +30% research.', { research: 0.3 }),
  T('ark', 9, 'Colony Ark', 'flag', 'The great ship that carries your people to a new world. The final achievement.', {}, { cap: true }),
];
export const TECH = Object.fromEntries(TECHS.map((t) => [t.id, t]));
// cost: the era's share of the old era research costs (ordinary 14% each, capstone 30%)
const span = (e) => (ERAS[e + 1] ? ERAS[e + 1].cost - ERAS[e].cost : 12000);
for (const t of TECHS) t.cost = Math.round(span(t.era) * (t.cap ? 0.3 : 0.14));
export const techsOfEra = (e) => TECHS.filter((t) => t.era === e);
export const capOf = (e) => TECHS.find((t) => t.era === e && t.cap);
export const CAP_NEEDS = 4; // ordinary techs of the era required before its capstone
// buildings gated behind a tech (in addition to their era)
export const BUILD_TECH = { coop: 'domestication', tailor: 'tailoring', farm: 'agriculture', kitchen: 'pottery', mine: 'mining', market: 'trade', barracks: 'drill', tavern: 'philosophy', factory: 'factories', shield: 'shields', launch: 'orbital' };
