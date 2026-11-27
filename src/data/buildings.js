// Building catalog. Names change with the era; art is generated per era in render/buildart.js.
// cost: resources needed; work: construction effort; fn: what the building does.
export const BUILDINGS = {
  center:   { w: 2, h: 2, era: 0, cost: {}, work: 0, hp: 400, names: ['Tribal Fire', 'Long House', 'Chief Hall', 'Hall', 'Keep', 'Town Hall', 'City Hall', 'Capitol', 'Arcology Core', 'Orbital Command'], fn: { housing: 4, storage: 120, flag: true, warmth: true } },
  hut:      { w: 2, h: 2, era: 0, cost: { wood: 12 }, work: 60, hp: 120, names: ['Hide Hut', 'Mud House', 'Timber House', 'Stone House', 'Cottage', 'Townhouse', 'Tenement', 'Apartment', 'Habitat Pod', 'Hab Module'], fn: { housing: 5 } },
  campfire: { w: 1, h: 1, era: 0, cost: { wood: 4 }, work: 15, hp: 40, names: ['Campfire', 'Hearth', 'Hearth', 'Hearth', 'Hearth', 'Fireplace', 'Stove', 'Stove', 'Synth-cooker', 'Synth-cooker'], fn: { cook: 1, joy: 1, warmth: true } },
  storage:  { w: 2, h: 2, era: 0, cost: { wood: 10 }, work: 40, hp: 120, names: ['Food Cache', 'Granary', 'Granary', 'Storehouse', 'Storehouse', 'Warehouse', 'Warehouse', 'Depot', 'Matter Vault', 'Cargo Bay'], fn: { storage: 300 } },
  tailor:   { w: 2, h: 2, era: 0, cost: { wood: 10 }, work: 40, hp: 80, names: ['Tailor', 'Tailor', 'Weaver', 'Weaver', 'Clothier', 'Clothier', 'Garment Shop', 'Garment Shop', 'Fabricator', 'Fabricator'], fn: { craft: 1, tailor: true } },
  well:     { w: 2, h: 2, era: 1, cost: { stone: 12, wood: 4 }, work: 45, hp: 120, names: ['', 'Well', 'Well', 'Well', 'Well', 'Well', 'Water Pump', 'Water Tower', 'Water Tower', 'Water Tower'], fn: { joy: 1, water: true } },
  coop:     { w: 2, h: 2, era: 1, cost: { wood: 14 }, work: 50, hp: 90, names: ['', 'Chicken Coop', 'Chicken Coop', 'Henhouse', 'Henhouse', 'Poultry Barn', 'Poultry Farm', 'Poultry Farm', 'Protein Vat', 'Protein Vat'], fn: { eggs: 3 } },
  farm:     { w: 3, h: 3, era: 1, cost: {}, work: 30, hp: 60, field: true, names: ['Field', 'Field', 'Field', 'Field', 'Field', 'Farm', 'Farm', 'Agri-plot', 'Hydroponics', 'Hydroponics'], fn: { farm: true } },
  research: { w: 2, h: 2, era: 0, cost: { wood: 15 }, work: 70, hp: 100, names: ['Elder Fire', 'Story Circle', 'Scribe House', 'Academy', 'Monastery Library', 'University', 'Laboratory', 'Research Institute', 'Quantum Lab', 'Observatory'], fn: { research: 2 } },
  temple:   { w: 2, h: 2, era: 0, cost: { wood: 10, stone: 10 }, work: 90, hp: 160, names: ['Shrine Stones', 'Sun Shrine', 'Ziggurat', 'Temple', 'Cathedral', 'Basilica', 'Grand Church', 'Monument Hall', 'Light Spire', 'Star Chapel'], fn: { worship: 6, glitter: 1 } },
  healer:   { w: 2, h: 2, era: 0, cost: { wood: 14 }, work: 80, hp: 120, names: ["Healer's Tent", 'Herb Hut', "Physician's House", 'Valetudinarium', 'Infirmary', 'Hospital', 'Hospital', 'Medical Center', 'Med-Bay', 'Regen Clinic'], fn: { beds: 3, medicine: true } },
  workshop: { w: 2, h: 2, era: 1, cost: { wood: 14, stone: 6 }, work: 80, hp: 140, names: ['Knapping Site', 'Workshop', 'Forge', 'Smithy', 'Guild Hall', 'Workshop', 'Factory Shop', 'Assembly Plant', 'Fabricator', 'Fabricator'], fn: { craft: 1 } },
  kitchen:  { w: 2, h: 2, era: 1, cost: { wood: 10, stone: 4 }, work: 50, hp: 100, names: ['Smoke Rack', 'Kitchen', 'Bakery', 'Bakery', 'Kitchen', 'Kitchen', 'Cannery', 'Food Plant', 'Nutri-Synth', 'Galley'], fn: { cook: 2, rations: true } },
  barracks: { w: 2, h: 2, era: 2, cost: { wood: 12, stone: 14 }, work: 90, hp: 220, names: ['', '', 'Barracks', 'Garrison', 'Barracks', 'Barracks', 'Armory', 'Base', 'Mech Hangar', 'Marine Barracks'], fn: { housing: 3, train: true } },
  mine:     { w: 2, h: 2, era: 2, cost: { wood: 18 }, work: 90, hp: 140, names: ['', '', 'Pit Mine', 'Mine', 'Mine', 'Mine', 'Coal Mine', 'Deep Mine', 'Core Drill', 'Asteroid Rig'], fn: { mine: true } },
  market:   { w: 2, h: 2, era: 2, cost: { wood: 16 }, work: 60, hp: 100, names: ['', '', 'Bazaar', 'Forum', 'Market', 'Exchange', 'Department Store', 'Mall', 'Trade Hub', 'Trade Hub'], fn: { joy: 2, trade: true } },
  tavern:   { w: 2, h: 2, era: 3, cost: { wood: 16, stone: 4 }, work: 60, hp: 100, names: ['', '', '', 'Tavern', 'Tavern', 'Inn', 'Saloon', 'Cinema', 'Holo-Lounge', 'Zero-G Bar'], fn: { joy: 3 } },
  factory:  { w: 3, h: 3, era: 6, cost: { stone: 30, metal: 25 }, work: 160, hp: 300, names: ['', '', '', '', '', '', 'Factory', 'Factory', 'Nano-Forge', 'Nano-Forge'], fn: { craft: 3, pollution: 1 } },
  reactor:  { w: 3, h: 3, era: 7, cost: { stone: 40, metal: 40 }, work: 200, hp: 300, names: ['', '', '', '', '', '', '', 'Nuclear Plant', 'Fusion Reactor', 'Fusion Reactor'], fn: { power: 1, research: 2 } },
  shield:   { w: 2, h: 2, era: 8, cost: { metal: 40 }, work: 160, hp: 260, names: ['', '', '', '', '', '', '', '', 'Shield Pylon', 'Shield Pylon'], fn: { shield: true } },
  launch:   { w: 3, h: 3, era: 9, cost: { metal: 80, stone: 40 }, work: 300, hp: 400, names: ['', '', '', '', '', '', '', '', '', 'Launch Complex'], fn: { launch: true } },
};
export const BUILD_ORDER = ['center', 'hut', 'campfire', 'storage', 'research', 'temple', 'healer', 'tailor', 'farm', 'coop', 'well', 'workshop', 'kitchen', 'barracks', 'mine', 'market', 'tavern', 'factory', 'reactor', 'shield', 'launch'];
// Each people builds in its own style: elves grow and weave, orcs hew and fortify. Same function, their own names.
export const RACE_NAMES = {
  elf: { hut: ['Leaf Bower', 'Willow Lodge', 'Treehouse', 'Treehouse', 'Garden Manor', 'Garden Manor', 'Ivy Terrace', 'Canopy Tower', 'Bloom Pod', 'Star Bower'], center: ['Moonfire', 'Grove Hall', 'Grove Hall', 'Sylvan Court', 'Sylvan Court', 'Silver Court', 'Silver Court', 'Spire of Leaves', 'Living Arcology', 'Star Grove'], storage: ['Root Cellar', 'Seed Vault', 'Seed Vault', 'Leaf Granary', 'Leaf Granary', 'Garden Store', 'Garden Store', 'Bio-Vault', 'Bio-Vault', 'Seedship Hold'], temple: ['Moon Stones', 'Moon Grove', 'Star Shrine', 'Star Shrine', 'Moon Temple', 'Moon Temple', 'Hall of Stars', 'Hall of Stars', 'Starlight Spire', 'Star Chapel'], barracks: ['', '', 'Ranger Lodge', 'Ranger Lodge', 'Warden Hall', 'Warden Hall', 'Warden Hall', 'Sentinel Post', 'Sentinel Post', 'Sentinel Post'], research: ['Story Tree', 'Lore Circle', 'Scroll Grove', 'Academy of Leaves', 'Elder Library', 'Moon University', 'Moon University', 'Crystal Lab', 'Crystal Lab', 'Star Observatory'] },
  orc: { hut: ['Bone Hut', 'Mud Den', 'Log Den', 'Stone Den', 'War Lodge', 'War Lodge', 'Iron Barracks-Home', 'Bunker Home', 'Bunker Pod', 'Hab Bunker'], center: ['War Fire', 'Chieftain\'s Hut', 'Warlord Hall', 'Warlord Hall', 'Fortress Keep', 'Fortress Keep', 'Iron Citadel', 'Iron Citadel', 'War Arcology', 'Warship Command'], storage: ['Bone Pile', 'Loot Pit', 'Loot Pit', 'Plunder Hall', 'Plunder Hall', 'Warehouse', 'Iron Depot', 'Iron Depot', 'Vault', 'Cargo Bay'], temple: ['Skull Totem', 'Blood Shrine', 'Ancestor Pit', 'War Temple', 'War Temple', 'Ancestor Hall', 'Ancestor Hall', 'Monument of Blood', 'Spire of Fury', 'Star Altar'], barracks: ['', '', 'Fighting Pit', 'Fighting Pit', 'War Camp', 'War Camp', 'Arsenal', 'Arsenal', 'Mech Pit', 'Marine Pit'], research: ['Shaman Fire', 'Shaman Circle', 'Rune Hut', 'Rune Hall', 'Rune Hall', 'War College', 'War College', 'Iron Lab', 'Iron Lab', 'Sky Watch'] },
};
export const buildingName = (type, era, race) => { const n = RACE_NAMES[race]?.[type] || BUILDINGS[type].names; for (let e = era; e >= 0; e--) if (n[e]) return n[e]; for (let e = era; e >= 0; e--) if (BUILDINGS[type].names[e]) return BUILDINGS[type].names[e]; return type; };
export const RESOURCES = ['food', 'meals', 'rations', 'wood', 'stone', 'metal', 'cloth', 'medicine'];
export const RES_LABEL = { food: 'Raw food', meals: 'Meals', rations: 'Rations', wood: 'Wood', stone: 'Stone', metal: 'Metal', cloth: 'Cloth & hides', medicine: 'Medicine' };

/** Materials a building of this type needs at an era. Later eras swap wood for stone, then metal. */
export function buildCost(def, era) {
  if (typeof def === 'string') def = BUILDINGS[def];
  const out = {}; const m = 1 + era * 0.12;
  for (const [r, v] of Object.entries(def.cost)) out[r] = Math.round(v * m);
  if (era >= 4 && out.wood) { out.stone = (out.stone || 0) + Math.round(out.wood * 0.5); out.wood = Math.round(out.wood * 0.5); }
  if (era >= 6 && out.stone) { out.metal = (out.metal || 0) + Math.round(out.stone * 0.25); }
  return out;
}

/** What each building is for (plan menu and inspector). */
export const BUILD_DESC = {
  center: 'The heart of the settlement: houses a few people, stores goods and flies your flag.',
  hut: 'A home. Families sleep here and wake up rested; without one people sleep in the cold.',
  campfire: 'Cook meals over the fire. People gather here to warm up and talk.',
  storage: 'Holds goods. Every harvest, hunt and craft is carried here, and you can see the stock piled up.',
  research: 'Scholars study here, earning research for your tech tree.',
  temple: 'Worship earns Glitter for your powers. Priests preach here.',
  healer: 'Hospital beds for the sick and wounded; doctors brew medicine.',
  tailor: 'Sew hides, wool and cotton into clothes. Needs Hide Tailoring.',
  farm: 'A field of crops suited to the climate: wheat, carrots, corn, tomatoes, cotton and more.',
  coop: 'Hens lay eggs every day, a steady trickle of food.',
  well: 'Clean water and a place to linger. Lifts spirits nearby.',
  workshop: 'Crafters make tools, gear and medicine.',
  kitchen: 'Cooks make meals and long-lasting rations.',
  barracks: 'Trains and houses soldiers.',
  mine: 'Miners dig stone, copper, iron and the odd nugget of gold here, without running out.',
  market: 'Trade and leisure. People relax here.',
  tavern: 'Drink, song and gossip. A big boost to joy.',
  factory: 'Industrial crafting at scale. Pollutes.',
  reactor: 'Power and research.',
  shield: 'Projects an energy shield over the settlement.',
  launch: 'Sends ships to orbit and beyond.',
};
