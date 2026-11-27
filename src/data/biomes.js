// Biome table. Index = biome id stored in tiles.biome.
export const B = {
  DEEP: 0, OCEAN: 1, SHALLOW: 2, BEACH: 3, PLAINS: 4, FOREST: 5, TAIGA: 6, TUNDRA: 7, ICE: 8,
  DESERT: 9, SAVANNA: 10, JUNGLE: 11, SWAMP: 12, MOUNTAIN: 13, PEAK: 14, VOLCANIC: 15, LAKE: 16, ARCHIPELAGO: 17,
  STEPPE: 18, BADLANDS: 19, BLOSSOM: 20, AUTUMN: 21, RAINFOREST: 22, MANGROVE: 23, SALTFLAT: 24, ALPINE: 25, ASHLAND: 26, GLOWFEN: 27,
};

// cost: movement cost (0 = impassable on foot), fert: crop fertility, tree: tree density, tk: tree kind
export const BIOMES = [
  { id: 0, key: 'deep', name: 'Abyssal Ocean', color: [22, 46, 96], cost: 0, fert: 0, water: true },
  { id: 1, key: 'ocean', name: 'Ocean', color: [32, 72, 138], cost: 0, fert: 0, water: true },
  { id: 2, key: 'shallow', name: 'Coastal Shallows', color: [52, 120, 178], cost: 4, fert: 0, water: true, wade: true },
  { id: 3, key: 'beach', name: 'Beach', color: [222, 204, 150], cost: 1.3, fert: 0.25, tree: 0.03, tk: 'palm', rock: 0.01 },
  { id: 4, key: 'plains', name: 'Temperate Plains', color: [118, 170, 74], cost: 1, fert: 1.0, tree: 0.05, tk: 'oak', rock: 0.01, berry: 0.035, ore: 0.002 },
  { id: 5, key: 'forest', name: 'Temperate Forest', color: [62, 128, 58], cost: 1.4, fert: 0.8, tree: 0.42, tk: 'oak', rock: 0.01, berry: 0.045, ore: 0.003 },
  { id: 6, key: 'taiga', name: 'Taiga', color: [64, 108, 82], cost: 1.5, fert: 0.45, tree: 0.38, tk: 'pine', rock: 0.03, berry: 0.01, ore: 0.005 },
  { id: 7, key: 'tundra', name: 'Tundra', color: [150, 160, 140], cost: 1.4, fert: 0.15, tree: 0.02, tk: 'pine', rock: 0.04, ore: 0.004 },
  { id: 8, key: 'ice', name: 'Polar Ice', color: [228, 238, 246], cost: 2.2, fert: 0, rock: 0.01 },
  { id: 9, key: 'desert', name: 'Desert', color: [226, 192, 118], cost: 1.6, fert: 0.08, tree: 0.012, tk: 'cactus', rock: 0.03, ore: 0.004 },
  { id: 10, key: 'savanna', name: 'Savanna', color: [182, 176, 86], cost: 1.1, fert: 0.6, tree: 0.04, tk: 'acacia', rock: 0.02, berry: 0.01, ore: 0.002 },
  { id: 11, key: 'jungle', name: 'Monsoon Jungle', color: [44, 140, 64], cost: 1.9, fert: 1.1, tree: 0.55, tk: 'jungle', rock: 0.01, berry: 0.05, ore: 0.002 },
  { id: 12, key: 'swamp', name: 'Swamp', color: [80, 106, 70], cost: 2.4, fert: 0.6, tree: 0.2, tk: 'willow', berry: 0.02 },
  { id: 13, key: 'mountain', name: 'Mountains', color: [122, 112, 104], cost: 3, fert: 0.05, tree: 0.04, tk: 'pine', rock: 0.25, ore: 0.05 },
  { id: 14, key: 'peak', name: 'Snow Peaks', color: [236, 236, 242], cost: 4.5, fert: 0, rock: 0.15, ore: 0.03 },
  { id: 15, key: 'volcanic', name: 'Volcanic Rift', color: [70, 48, 46], cost: 2.4, fert: 0.3, tree: 0.01, tk: 'dead', rock: 0.18, ore: 0.08 },
  { id: 16, key: 'lake', name: 'Freshwater Lake', color: [64, 134, 190], cost: 0, fert: 0, water: true, fresh: true },
  { id: 17, key: 'archipelago', name: 'Tropical Isle', color: [140, 196, 96], cost: 1.1, fert: 0.8, tree: 0.2, tk: 'palm', berry: 0.04 },
  { id: 18, key: 'steppe', name: 'Steppe', color: [176, 164, 98], cost: 1.05, fert: 0.5, tree: 0.012, tk: 'acacia', rock: 0.02, berry: 0.01, ore: 0.002 },
  { id: 19, key: 'badlands', name: 'Red Badlands', color: [190, 110, 70], cost: 1.8, fert: 0.06, tree: 0.008, tk: 'cactus', rock: 0.14, ore: 0.025 },
  { id: 20, key: 'blossom', name: 'Blossom Grove', color: [132, 176, 98], cost: 1.1, fert: 0.95, tree: 0.3, tk: 'cherry', rock: 0.005, berry: 0.06, ore: 0.001 },
  { id: 21, key: 'autumn', name: 'Autumn Woods', color: [142, 116, 58], cost: 1.35, fert: 0.7, tree: 0.4, tk: 'autumn', rock: 0.012, berry: 0.04, ore: 0.003 },
  { id: 22, key: 'rainforest', name: 'Temperate Rainforest', color: [40, 104, 76], cost: 1.9, fert: 1.0, tree: 0.5, tk: 'redwood', rock: 0.01, berry: 0.04, ore: 0.002 },
  { id: 23, key: 'mangrove', name: 'Mangrove Coast', color: [74, 122, 88], cost: 2.2, fert: 0.5, tree: 0.3, tk: 'mangrove', berry: 0.02 },
  { id: 24, key: 'saltflat', name: 'Salt Flats', color: [228, 228, 216], cost: 1.3, fert: 0, rock: 0.012, ore: 0.012 },
  { id: 25, key: 'alpine', name: 'Alpine Meadow', color: [122, 164, 112], cost: 1.7, fert: 0.4, tree: 0.06, tk: 'pine', rock: 0.06, berry: 0.02, ore: 0.012 },
  { id: 26, key: 'ashland', name: 'Ashlands', color: [98, 92, 88], cost: 1.5, fert: 0.2, tree: 0.02, tk: 'ash', rock: 0.1, ore: 0.04 },
  { id: 27, key: 'glowfen', name: 'Glowcap Fen', color: [62, 90, 112], cost: 2.2, fert: 0.55, tree: 0.18, tk: 'glow', berry: 0.05 },
];

export const isWater = (b) => BIOMES[b].water === true;
export const isLand = (b) => !BIOMES[b].water;

// Tile features (tiles.feat)
export const F = {
  NONE: 0, TREE: 1, ROCK: 2, ORE: 3, BERRY: 4, FARM: 5, BUILDING: 6, RUBBLE: 7, ROAD: 8, CRATER: 9, GOLD: 10, STUMP: 11, CROP_READY: 12,
};
export const FEATURE_NAMES = ['Open ground', 'Trees', 'Boulders', 'Ore vein', 'Berry bushes', 'Farmland', 'Structure', 'Rubble', 'Road', 'Crater', 'Blessed ore', 'Stump', 'Ripe crops'];
