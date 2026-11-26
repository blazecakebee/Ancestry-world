// Divine powers. Never overwhelming — a patron deity nudges, it doesn't rule.
// Powers only ever affect YOUR nation's land/people, unowned wilds, or a nation that has
// explicitly granted you the "miracles" permission. Enforced in sim/commands.js.
// target: 'tile' | 'pawn' | 'settlement' | 'self'. cd = cooldown in in-game days. devotion = lifetime Glitter needed.
export const TIERS = [
  { tier: 1, name: 'Whispers', devotion: 0 },
  { tier: 2, name: 'Wonders', devotion: 450 },
  { tier: 3, name: 'Miracles', devotion: 2600 },
];

export const POWERS = [
  // Tier 1
  { id: 'inspire', name: 'Inspire Idea', tier: 1, cost: 18, cd: 2, target: 'pawn', icon: 'bulb', desc: 'Grant a citizen an inspiration: a work frenzy, a research breakthrough or creative brilliance.' },
  { id: 'rain', name: 'Fertile Rain', tier: 1, cost: 22, cd: 3, target: 'tile', radius: 8, icon: 'rain', desc: 'Summon a gentle rain cloud. Waters crops, douses fires, soothes drought.' },
  { id: 'heal', name: 'Minor Healing', tier: 1, cost: 15, cd: 1, target: 'pawn', icon: 'heart', desc: 'Close wounds and stop bleeding on one citizen. Does not cure disease.' },
  { id: 'calm', name: 'Calm Mind', tier: 1, cost: 12, cd: 1, target: 'pawn', icon: 'dove', desc: 'End a mental break and grant a moment of peace.' },
  { id: 'breeze', name: 'Guiding Breeze', tier: 1, cost: 10, cd: 1, target: 'tile', radius: 14, icon: 'wind', desc: 'Turn the local winds for a day — steer storms and wildfires.' },
  { id: 'omen', name: 'Omen of Unity', tier: 1, cost: 25, cd: 4, target: 'settlement', icon: 'eye', desc: 'A sign in the sky. +Mood and +stability for a settlement.' },
  // Tier 2
  { id: 'harvest', name: 'Golden Harvest', tier: 2, cost: 70, cd: 8, target: 'settlement', icon: 'wheat', desc: 'All fields of a settlement ripen at once.' },
  { id: 'revelation', name: 'Ideological Revelation', tier: 2, cost: 90, cd: 10, target: 'self', icon: 'scroll', desc: 'Push one ideological axis of your nation by 12 points.' },
  { id: 'ore', name: 'Ore Blessing', tier: 2, cost: 80, cd: 8, target: 'tile', radius: 2, icon: 'gem', desc: 'Raise a vein of blessed ore from the earth.' },
  { id: 'cure', name: 'Ward of Purity', tier: 2, cost: 75, cd: 8, target: 'settlement', icon: 'flask', desc: 'Cure diseases and infections across a settlement.' },
  { id: 'valor', name: 'Blessing of Valor', tier: 2, cost: 60, cd: 6, target: 'settlement', icon: 'sword', desc: 'Soldiers of a settlement fight with divine courage for 2 days.' },
  { id: 'fertility', name: 'Blessing of Bloodlines', tier: 2, cost: 85, cd: 12, target: 'settlement', icon: 'cradle', desc: 'Couples in a settlement are far more likely to have children for 3 days.' },
  // Tier 3
  { id: 'tectonic', name: 'Tectonic Sculpting', tier: 3, cost: 260, cd: 20, target: 'tile', radius: 3, icon: 'mountain', desc: 'Raise land from the sea or lower hills into valleys. Shift-click to lower.' },
  { id: 'avatar', name: 'Divine Avatar', tier: 3, cost: 320, cd: 30, target: 'pawn', icon: 'crown', desc: 'Make one citizen your Champion: stronger, tougher, beloved. One at a time.' },
  { id: 'orbshield', name: 'Orbital Shielding', tier: 3, cost: 380, cd: 30, target: 'settlement', minEra: 7, icon: 'shield', desc: 'Shield a settlement from meteors, storms and bombardment for 6 days.' },
  { id: 'prophecy', name: 'Prophecy', tier: 3, cost: 240, cd: 24, target: 'pawn', icon: 'star', desc: 'Call a devout citizen to become a Prophet whose sermons spread faith.' },
];
export const powerById = Object.fromEntries(POWERS.map((p) => [p.id, p]));
