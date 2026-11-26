// Building catalog. Names change with the era; art is generated per era in render/buildart.js.
// cost: resources needed; work: construction effort; fn: what the building does.
export const BUILDINGS = {
  center:   { w: 2, h: 2, era: 0, cost: {}, work: 0, hp: 400, names: ['Tribal Fire', 'Long House', 'Chief Hall', 'Hall', 'Keep', 'Town Hall', 'City Hall', 'Capitol', 'Arcology Core', 'Orbital Command'], fn: { housing: 4, storage: 120, flag: true, warmth: true } },
  hut:      { w: 2, h: 2, era: 0, cost: { wood: 12 }, work: 60, hp: 120, names: ['Hide Hut', 'Mud House', 'Timber House', 'Stone House', 'Cottage', 'Townhouse', 'Tenement', 'Apartment', 'Habitat Pod', 'Hab Module'], fn: { housing: 5 } },
  campfire: { w: 1, h: 1, era: 0, cost: { wood: 4 }, work: 15, hp: 40, names: ['Campfire', 'Hearth', 'Hearth', 'Hearth', 'Hearth', 'Fireplace', 'Stove', 'Stove', 'Synth-cooker', 'Synth-cooker'], fn: { cook: 1, joy: 1, warmth: true } },
  storage:  { w: 2, h: 2, era: 0, cost: { wood: 10 }, work: 40, hp: 120, names: ['Food Cache', 'Granary', 'Granary', 'Storehouse', 'Storehouse', 'Warehouse', 'Warehouse', 'Depot', 'Matter Vault', 'Cargo Bay'], fn: { storage: 300 } },
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
export const BUILD_ORDER = ['center', 'hut', 'campfire', 'storage', 'research', 'temple', 'healer', 'farm', 'workshop', 'kitchen', 'barracks', 'mine', 'market', 'tavern', 'factory', 'reactor', 'shield', 'launch'];
export const buildingName = (type, era) => { const n = BUILDINGS[type].names; for (let e = era; e >= 0; e--) if (n[e]) return n[e]; return type; };
export const RESOURCES = ['food', 'meals', 'rations', 'wood', 'stone', 'metal', 'cloth', 'medicine'];
export const RES_LABEL = { food: 'Raw food', meals: 'Meals', rations: 'Rations', wood: 'Wood', stone: 'Stone', metal: 'Metal', cloth: 'Cloth & hides', medicine: 'Medicine' };
