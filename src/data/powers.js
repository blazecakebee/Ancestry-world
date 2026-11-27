// Divine powers. Never overwhelming — a patron deity nudges, it doesn't rule.
// Powers only ever affect YOUR nation's land/people, unowned wilds, or a nation that has
// explicitly granted you the "miracles" permission. Enforced in sim/commands.js.
// target: 'tile' | 'pawn' | 'settlement' | 'self'. cd = cooldown in in-game days. devotion = lifetime Glitter needed.
// cat: palette tab ('divine'|'nature'|'life'|'farm'|'wild'|'war'|'curses'|'world'); color: cursor tint + radius preview;
// radius: brush size in tiles (pawn = 1, settlement/self = 0); icon: iconmaps key, or 'va:<stem>' skill-icon key.
export const TIERS = [
  { tier: 1, name: 'Whispers', devotion: 0 },
  { tier: 2, name: 'Wonders', devotion: 450 },
  { tier: 3, name: 'Miracles', devotion: 2600 },
];

// Existing powers (kept verbatim in behaviour; gained cat/color/radius).
const CORE = [
  // Tier 1
  { id: 'inspire', name: 'Inspire Idea', tier: 1, cost: 18, cd: 2, target: 'pawn', cat: 'divine', color: '#ffe066', radius: 1, icon: 'bulb', desc: 'Grant a citizen an inspiration: a work frenzy, a research breakthrough or creative brilliance.' },
  { id: 'rain', name: 'Fertile Rain', tier: 1, cost: 22, cd: 3, target: 'tile', cat: 'nature', color: '#7fc8ff', radius: 8, icon: 'rain', desc: 'Summon a gentle rain cloud. Waters crops, douses fires, soothes drought.' },
  { id: 'heal', name: 'Minor Healing', tier: 1, cost: 15, cd: 1, target: 'pawn', cat: 'life', color: '#ff7fa8', radius: 1, icon: 'heart', desc: 'Close wounds and stop bleeding on one citizen. Does not cure disease.' },
  { id: 'calm', name: 'Calm Mind', tier: 1, cost: 12, cd: 1, target: 'pawn', cat: 'life', color: '#b8f5ff', radius: 1, icon: 'dove', desc: 'End a mental break and grant a moment of peace.' },
  { id: 'breeze', name: 'Guiding Breeze', tier: 1, cost: 10, cd: 1, target: 'tile', cat: 'nature', color: '#d8f5ff', radius: 14, icon: 'wind', desc: 'Turn the local winds for a day — steer storms and wildfires.' },
  { id: 'omen', name: 'Omen of Unity', tier: 1, cost: 25, cd: 4, target: 'settlement', cat: 'divine', color: '#e0c0ff', radius: 0, icon: 'eye', desc: 'A sign in the sky. +Mood and +stability for a settlement.' },
  // Tier 2
  { id: 'harvest', name: 'Golden Harvest', tier: 2, cost: 70, cd: 8, target: 'settlement', cat: 'nature', color: '#ffd34d', radius: 0, icon: 'wheat', desc: 'All fields of a settlement ripen at once.' },
  { id: 'revelation', name: 'Ideological Revelation', tier: 2, cost: 90, cd: 10, target: 'self', cat: 'divine', color: '#c58cff', radius: 0, icon: 'scroll', desc: 'Restore your people\'s certainty in their creed (+30) and let them reform ideals and precepts at once.' },
  { id: 'ore', name: 'Ore Blessing', tier: 2, cost: 80, cd: 8, target: 'tile', cat: 'world', color: '#ffe9a0', radius: 2, icon: 'gem', desc: 'Raise a vein of blessed ore from the earth.' },
  { id: 'cure', name: 'Ward of Purity', tier: 2, cost: 75, cd: 8, target: 'settlement', cat: 'life', color: '#9fffcf', radius: 0, icon: 'flask', desc: 'Cure diseases and infections across a settlement.' },
  { id: 'valor', name: 'Blessing of Valor', tier: 2, cost: 60, cd: 6, target: 'settlement', cat: 'war', color: '#ff9a6a', radius: 0, icon: 'sword', desc: 'Soldiers of a settlement fight with divine courage for 2 days.' },
  { id: 'fertility', name: 'Blessing of Bloodlines', tier: 2, cost: 85, cd: 12, target: 'settlement', cat: 'life', color: '#ffb0d0', radius: 0, icon: 'cradle', desc: 'Couples in a settlement are far more likely to have children for 3 days.' },
  // Tier 3
  { id: 'tectonic', name: 'Tectonic Sculpting', tier: 3, cost: 260, cd: 20, target: 'tile', cat: 'world', color: '#c8a070', radius: 3, icon: 'mountain', desc: 'Raise land from the sea or lower hills into valleys. Shift-click to lower.' },
  { id: 'avatar', name: 'Divine Avatar', tier: 3, cost: 320, cd: 30, target: 'pawn', cat: 'divine', color: '#fff6b0', radius: 1, icon: 'crown', desc: 'Make one citizen your Champion: stronger, tougher, beloved. One at a time.' },
  { id: 'orbshield', name: 'Orbital Shielding', tier: 3, cost: 380, cd: 30, target: 'settlement', minEra: 7, cat: 'war', color: '#7fe8ff', radius: 0, icon: 'shield', desc: 'Shield a settlement from meteors, storms and bombardment for 6 days.' },
  { id: 'prophecy', name: 'Prophecy', tier: 3, cost: 240, cd: 24, target: 'pawn', cat: 'divine', color: '#ffe066', radius: 1, icon: 'star', desc: 'Call a devout citizen to become a Prophet whose sermons spread faith.' },
];

// New powers. Land/people effects only ever touch your own nation, permitted nations, or unowned wilds (see sim/commands.js).
const NEW = [
  // ---- Nature ----
  { id: 'sprout', name: 'Sprout Grove', tier: 1, cost: 14, cd: 1, target: 'tile', cat: 'nature', color: '#62c46a', radius: 3, icon: 'va:thorn_vine_spell', desc: 'Young trees spring up on open ground nearby.' },
  { id: 'bloom', name: 'Wildflower Bloom', tier: 1, cost: 14, cd: 1, target: 'tile', cat: 'nature', color: '#ff9ad0', radius: 4, icon: 'va:buff_3', desc: 'Berry bushes and flowers bloom; nearby citizens are cheered.' },
  { id: 'snowfall', name: 'Call Snow', tier: 1, cost: 20, cd: 3, target: 'tile', cat: 'nature', color: '#dff3ff', radius: 8, icon: 'va:ice_spell', desc: 'Chill the air and gather snow clouds. Douses fires.' },
  { id: 'sunbeam', name: 'Parting Clouds', tier: 1, cost: 16, cd: 2, target: 'tile', cat: 'nature', color: '#fff0a0', radius: 8, icon: 'va:blinding_light_spell', desc: 'Clear the sky and warm the land a little.' },
  { id: 'frostnip', name: 'Frost Nip', tier: 1, cost: 14, cd: 2, target: 'tile', cat: 'nature', color: '#a8dcff', radius: 8, icon: 'rv:26', desc: 'A sharp local cold snap.' },
  { id: 'thaw', name: 'Gentle Thaw', tier: 1, cost: 14, cd: 2, target: 'tile', cat: 'nature', color: '#ffc27a', radius: 8, icon: 'va:fire_spell', desc: 'Warm the air and melt snow.' },
  { id: 'lightrod', name: 'Lightning Rod', tier: 1, cost: 18, cd: 3, target: 'tile', cat: 'nature', color: '#fff6b0', radius: 4, icon: 'va:lightning_spell', desc: 'For 3 days lightning nearby is drawn harmlessly to this spot.' },
  { id: 'spring', name: 'Spring of Fresh Water', tier: 2, cost: 40, cd: 6, target: 'tile', cat: 'nature', color: '#5fb8ff', radius: 2, icon: 'va:water_spell', desc: 'A freshwater pool bubbles up from the ground, ringed with berries.' },
  { id: 'uplift', name: 'Rising Ground', tier: 2, cost: 50, cd: 6, target: 'tile', cat: 'nature', color: '#b89868', radius: 2, icon: 'va:fortify_spell', desc: 'Raise the land a little. Shift-click to lower it.' },
  { id: 'fertilesoil', name: 'Fertile Soil', tier: 2, cost: 45, cd: 6, target: 'tile', cat: 'nature', color: '#8bd04a', radius: 3, icon: 'rv:22', desc: 'Poor ground turns richer: desert to savanna, savanna and tundra to plains.' },
  // ---- Life ----
  { id: 'blesscrops', name: 'Bless the Crops', tier: 1, cost: 18, cd: 2, target: 'tile', cat: 'life', color: '#ffe066', radius: 5, icon: 'va:buff_1', desc: 'Growing crops in the area surge toward ripeness.' },
  { id: 'masscalm', name: 'Mass Calm', tier: 1, cost: 22, cd: 2, target: 'tile', cat: 'life', color: '#b8f5ff', radius: 6, icon: 'va:counterspell', desc: 'End mental breaks of everyone nearby.' },
  { id: 'ward', name: 'Protective Ward', tier: 1, cost: 16, cd: 2, target: 'pawn', cat: 'life', color: '#9fd0ff', radius: 1, icon: 'va:divine_protection_spell', desc: 'One citizen takes 35% less damage for 2 days.' },
  { id: 'haste', name: 'Gift of Speed', tier: 1, cost: 14, cd: 1, target: 'pawn', cat: 'life', color: '#ffe9a0', radius: 1, icon: 'va:frenzy_spell_(critical_booster)', desc: 'One citizen moves 35% faster for a day and a half.' },
  { id: 'mend', name: 'Mend Wounds', tier: 2, cost: 45, cd: 5, target: 'tile', cat: 'life', color: '#ff9ab8', radius: 5, icon: 'va:healing_spell', desc: 'Halve the wounds and slow the bleeding of everyone nearby.' },
  { id: 'lessons', name: 'Spark of Learning', tier: 2, cost: 40, cd: 4, target: 'pawn', cat: 'life', color: '#ffe066', radius: 1, icon: 'rv:289', desc: 'A citizen gains skill experience and learns faster for 2 days.' },
  { id: 'cleanse', name: 'Cleansing Light', tier: 2, cost: 40, cd: 4, target: 'pawn', cat: 'life', color: '#9fffcf', radius: 1, icon: 'rv:121', desc: 'Cure all diseases of a single citizen.' },
  { id: 'sanctuary', name: 'Sanctuary Light', tier: 2, cost: 55, cd: 6, target: 'tile', cat: 'life', color: '#fff6c0', radius: 5, icon: 'rv:665', desc: 'A calm glow rests everyone nearby, eases wounds and shields them briefly.' },
  { id: 'feast', name: 'Divine Feast', tier: 2, cost: 60, cd: 8, target: 'settlement', cat: 'life', color: '#ffb347', radius: 0, icon: 'rv:494', desc: 'Fine meals appear in a settlement; everyone eats well.' },
  // ---- Creatures ----
  { id: 'dog', name: 'Faithful Hounds', tier: 1, cost: 10, cd: 1, target: 'tile', cat: 'wild', color: '#c8a070', radius: 3, icon: 'va:buff_11', desc: 'One or two friendly dogs appear.' },
  { id: 'cat', name: 'Hearth Cats', tier: 1, cost: 8, cd: 1, target: 'tile', cat: 'wild', color: '#e8b070', radius: 3, icon: 'rv:363', desc: 'One or two friendly cats appear.' },
  { id: 'sheepflock', name: 'Flock of Sheep', tier: 1, cost: 16, cd: 2, target: 'tile', cat: 'farm', color: '#f0f0e0', radius: 3, icon: 'va:buff_12', desc: 'Three to five sheep appear.' },
  { id: 'fishshoal', name: 'Shoal of Fish', tier: 1, cost: 14, cd: 2, target: 'tile', cat: 'wild', color: '#6fc8ff', radius: 2, icon: 'rv:361', desc: 'Call fish to water near one of your settlements; the catch fills its larders.' },
  { id: 'slime_green', name: 'Green Slime', tier: 1, cost: 12, cd: 1, target: 'tile', cat: 'wild', color: '#62e06a', radius: 3, icon: 'rv:675', desc: 'Harmless-ish green slimes. Fight back only if attacked.' },
  { id: 'slime_blue', name: 'Blue Slime', tier: 1, cost: 12, cd: 1, target: 'tile', cat: 'wild', color: '#5fa8ff', radius: 3, icon: 'rv:596', desc: 'Calm blue slimes that shimmer in the sun.' },
  { id: 'cows', name: 'Herd of Cows', tier: 1, cost: 20, cd: 3, target: 'tile', cat: 'farm', color: '#e8e8e0', radius: 3, icon: 'va:buff_6', desc: 'Two or three gentle cows wander in.' },
  { id: 'pigs', name: 'Sounder of Pigs', tier: 1, cost: 16, cd: 2, target: 'tile', cat: 'farm', color: '#f0a0b0', radius: 3, icon: 'va:buff_5', desc: 'A few pigs snuffle into view.' },
  { id: 'goats', name: 'Mountain Goats', tier: 1, cost: 16, cd: 2, target: 'tile', cat: 'farm', color: '#d8d0c0', radius: 3, icon: 'va:buff_4', desc: 'Sure-footed goats appear.' },
  { id: 'chickens', name: 'Flock of Chickens', tier: 1, cost: 12, cd: 2, target: 'tile', cat: 'farm', color: '#e0a060', radius: 3, icon: 'rv:521', desc: 'Four to seven chickens scatter about.' },
  { id: 'rabbits', name: 'Warren of Rabbits', tier: 1, cost: 12, cd: 2, target: 'tile', cat: 'farm', color: '#b0a090', radius: 3, icon: 'va:buff_14', desc: 'Rabbits bound out of the grass.' },
  { id: 'ducks', name: 'Paddling of Ducks', tier: 1, cost: 12, cd: 2, target: 'tile', cat: 'farm', color: '#9cc8a8', radius: 3, icon: 'va:buff_7', desc: 'Three to six ducks waddle out, quacking.' },
  { id: 'horses', name: 'Wild Horses', tier: 2, cost: 26, cd: 3, target: 'tile', cat: 'farm', color: '#b08050', radius: 3, icon: 'rv:45', desc: 'Two to four horses gallop in.' },
  { id: 'fox', name: 'Cunning Foxes', tier: 2, cost: 14, cd: 2, target: 'tile', cat: 'wild', color: '#ff8a40', radius: 3, icon: 'va:buff_13', desc: 'One or two skittish foxes.' },
  { id: 'slime_red', name: 'Red Slime', tier: 2, cost: 22, cd: 2, target: 'tile', cat: 'wild', color: '#ff5a5a', radius: 3, icon: 'rv:129', desc: 'Warm, stubborn red slimes. Hit back a little harder when attacked.' },
  { id: 'wisp', name: 'Wisp Spirit', tier: 2, cost: 35, cd: 4, target: 'tile', cat: 'wild', color: '#bff0ff', radius: 3, icon: 'va:mana_replenish', desc: 'A drifting wisp that sheds glitter on those who catch it.' },
  // ---- War ----
  { id: 'fervor', name: 'Battle Fervor', tier: 2, cost: 50, cd: 5, target: 'tile', cat: 'war', color: '#ff7a4a', radius: 5, icon: 'rv:156', desc: 'Everyone nearby fights harder for a day and a half.' },
  { id: 'aegis', name: 'Aegis Ward', tier: 2, cost: 55, cd: 6, target: 'tile', cat: 'war', color: '#7fb8ff', radius: 4, icon: 'rv:597', desc: 'Everyone nearby takes 35% less damage for a day and a half.' },
  { id: 'rally', name: 'Rallying Cry', tier: 2, cost: 45, cd: 5, target: 'settlement', cat: 'war', color: '#ffd34d', radius: 0, icon: 'rv:43', desc: 'Soldiers of a settlement recover, calm and hurry for a day.' },
  { id: 'smite', name: 'Smite', tier: 2, cost: 40, cd: 4, target: 'tile', cat: 'war', color: '#fff6b0', radius: 2, icon: 'rv:672', desc: 'A bolt strikes beasts and enemies at war with you. Spares everyone else.' },
  { id: 'firearrows', name: 'Rain of Fire Arrows', tier: 2, cost: 55, cd: 6, target: 'tile', cat: 'war', color: '#ff9a3a', radius: 3, icon: 'rv:403', desc: 'A few burning arrows fall on beasts and enemies, and may kindle brush.' },
  { id: 'dread', name: 'Dread', tier: 2, cost: 45, cd: 5, target: 'tile', cat: 'war', color: '#8a6aaa', radius: 7, icon: 'va:debuff_4', desc: 'Raiders and enemies at war with you (if permitted) lose heart for a day.' },
  // ---- Curses (weak, wild or permitted land only) ----
  { id: 'droughtnudge', name: 'Dry Spell', tier: 1, cost: 16, cd: 3, target: 'tile', cat: 'curses', color: '#e0b060', radius: 8, icon: 'va:debuff_2', desc: 'Nudge the local weather toward drought.' },
  { id: 'blightpatch', name: 'Blight Patch', tier: 2, cost: 40, cd: 5, target: 'tile', cat: 'curses', color: '#8a7a3a', radius: 3, icon: 'va:debuff_1', desc: 'Crops, trees and berries wither in a small patch.' },
  { id: 'locusts', name: 'Locust Swarm', tier: 2, cost: 45, cd: 6, target: 'tile', cat: 'curses', color: '#a8a040', radius: 4, icon: 'va:debuff_6', desc: 'Locusts strip crops and berries in the area.' },
  { id: 'terror', name: 'Night Terror', tier: 2, cost: 40, cd: 4, target: 'tile', cat: 'curses', color: '#6a4a8a', radius: 5, icon: 'va:debuff_8', desc: 'A few nearby people flee in fear.' },
  { id: 'plagueseed', name: 'Seed of Plague', tier: 2, cost: 50, cd: 6, target: 'tile', cat: 'curses', color: '#7ab050', radius: 4, icon: 'rv:459', desc: 'Up to three nearby people fall ill with flu.' },
  { id: 'famine', name: 'Lean Season', tier: 2, cost: 55, cd: 8, target: 'settlement', cat: 'curses', color: '#a08060', radius: 0, icon: 'va:debuff_10', desc: 'A settlement loses a fifth of its food stores.' },
  // ---- World ----
  { id: 'aurora', name: 'Aurora', tier: 2, cost: 35, cd: 5, target: 'self', cat: 'world', color: '#7fffd0', radius: 0, icon: 'rv:20', desc: 'Lights dance over your nation: everyone is uplifted.' },
  { id: 'meteorshower', name: 'Meteor Shower', tier: 3, cost: 300, cd: 24, target: 'tile', cat: 'world', color: '#ff8a4a', radius: 8, icon: 'va:fire_spell_2', desc: 'A few small meteors strike wild ground, leaving craters and ore.' },
];

// ---- v0.6 additions: inspired by the classic god-sim toolbox, tuned for a patron who nudges. Costs sit between the old
// tiers (T1 ~10-30, T2 ~45-140, T3 ~240-330); heavier powers have long cooldowns. All obey the same permission rules.
const MORE = [
  // ---- Divine ----
  { id: 'benediction', name: 'Benediction', tier: 1, cost: 20, cd: 3, target: 'pawn', cat: 'divine', color: '#fff0b0', radius: 1, icon: 'rv:670', desc: 'A warm blessing: lifts one citizen\'s mood, ends a mental break and eases their weariness.' },
  { id: 'tongues', name: 'Gift of Tongues', tier: 1, cost: 24, cd: 4, target: 'settlement', cat: 'divine', color: '#ffd8a0', radius: 0, icon: 'at:chat', desc: 'Neighbours talk freely for a day: everyone in a settlement has a deep conversation.' },
  { id: 'consecrate', name: 'Consecration', tier: 2, cost: 70, cd: 8, target: 'settlement', cat: 'divine', color: '#e8d0ff', radius: 0, icon: 'at:temple', desc: 'Hallow a settlement: +stability, +creed certainty, and everyone feels the sermon.' },
  { id: 'unity', name: 'Great Awakening', tier: 3, cost: 240, cd: 15, target: 'self', cat: 'divine', color: '#ffe9ff', radius: 0, icon: 'va:buff_8', desc: 'Your whole nation is uplifted: mood, stability and certainty all surge.' },
  // ---- Nature ----
  { id: 'grove', name: 'Grove of Life', tier: 1, cost: 26, cd: 3, target: 'tile', cat: 'nature', color: '#4fb35a', radius: 4, icon: 'at:tree', desc: 'A dense stand of trees rises on fertile open ground.' },
  { id: 'rainbow', name: 'Rainbow', tier: 1, cost: 20, cd: 4, target: 'tile', cat: 'nature', color: '#ffd0f0', radius: 8, icon: 'at:cloud', desc: 'A rainbow arcs overhead. Everyone nearby feels hopeful.' },
  { id: 'wetland', name: 'Wetland', tier: 2, cost: 45, cd: 5, target: 'tile', cat: 'nature', color: '#5a9a6a', radius: 3, icon: 'va:buff_2', desc: 'Low ground softens into marsh, rich in life but hard to cross.' },
  { id: 'oasis', name: 'Oasis', tier: 2, cost: 60, cd: 6, target: 'tile', cat: 'nature', color: '#5fe0c0', radius: 2, icon: 'rv:668', desc: 'A spring and palms rise from dry land (deserts, steppe, savanna).' },
  // ---- Life ----
  { id: 'vigor', name: 'Vigor', tier: 1, cost: 16, cd: 3, target: 'pawn', cat: 'life', color: '#ffc27f', radius: 1, icon: 'rv:441', desc: 'One citizen is fed, rested and quick on their feet for half a day.' },
  { id: 'muse', name: 'Muse', tier: 1, cost: 22, cd: 4, target: 'pawn', cat: 'life', color: '#ffb0e8', radius: 1, icon: 'rv:296', desc: 'A flash of artistry: creative inspiration and artistic skill.' },
  { id: 'manna', name: 'Manna', tier: 2, cost: 55, cd: 6, target: 'settlement', cat: 'life', color: '#fff0c0', radius: 0, icon: 'at:rations', desc: 'Bread falls from the sky: a generous gift of food to a settlement.' },
  // ---- Wild ----
  // ---- War ----
  { id: 'warhorn', name: 'War Horn', tier: 1, cost: 28, cd: 4, target: 'tile', cat: 'war', color: '#ffb060', radius: 6, icon: 'rv:126', desc: 'A horn call: allies nearby move faster and fight harder for a short while.' },
  { id: 'thunderclap', name: 'Thunderclap', tier: 2, cost: 55, cd: 5, target: 'tile', cat: 'war', color: '#d0d8ff', radius: 3, icon: 'rv:178', desc: 'A deafening crack knocks back and unnerves enemies at war with you.' },
  { id: 'wrath', name: 'Holy Wrath', tier: 2, cost: 70, cd: 8, target: 'tile', cat: 'war', color: '#ff6a5a', radius: 3, icon: 'at:angry', desc: 'Heavenly fire scorches beasts and enemies at war with you. Spares everyone else.' },
  // ---- Curses (weak, wild or permitted land only) ----
  { id: 'nightmares', name: 'Nightmares', tier: 1, cost: 26, cd: 3, target: 'pawn', cat: 'curses', color: '#5a4a8a', radius: 1, icon: 'at:moon', desc: 'One citizen is haunted: mood plunges and they hide away.' },
  { id: 'lightning', name: 'Lightning Strike', tier: 1, cost: 28, cd: 2, target: 'tile', cat: 'curses', color: '#fff6a0', radius: 1, icon: 'at:warning', desc: 'A bolt from the blue: burns whoever stands there and may start a fire.' },
  { id: 'heatwave', name: 'Heat Wave', tier: 2, cost: 55, cd: 5, target: 'tile', cat: 'curses', color: '#ff9a4a', radius: 8, icon: 'at:sun', desc: 'Scorching heat settles over the region; snow melts, people wilt.' },
  { id: 'coldsnap', name: 'Cold Snap', tier: 2, cost: 55, cd: 5, target: 'tile', cat: 'curses', color: '#9ad0ff', radius: 8, icon: 'va:debuff_11', desc: 'A bitter freeze sweeps the region.' },
  { id: 'wildfire', name: 'Wildfire', tier: 2, cost: 70, cd: 6, target: 'tile', cat: 'curses', color: '#ff7a3a', radius: 3, icon: 'rv:81', desc: 'Set a patch of ground alight. The wind decides the rest.' },
  { id: 'acidrain', name: 'Acid Rain', tier: 2, cost: 80, cd: 8, target: 'tile', cat: 'curses', color: '#b0e050', radius: 3, icon: 'va:debuff_12', desc: 'Corrosive rain kills crops and trees, fouls the soil and burns the unsheltered.' },
  { id: 'madness', name: 'Madness', tier: 2, cost: 65, cd: 6, target: 'pawn', cat: 'curses', color: '#c04a6a', radius: 1, icon: 'va:debuff_14', desc: 'One citizen goes berserk for a short while.' },
  // ---- World ----
  { id: 'isle', name: 'Raise Island', tier: 2, cost: 90, cd: 6, target: 'tile', cat: 'world', color: '#e8d890', radius: 3, icon: 'rv:41', desc: 'Lift a small island from the shallows or open sea.' },
  { id: 'flood', name: 'Flood', tier: 2, cost: 65, cd: 6, target: 'tile', cat: 'world', color: '#5aa0e0', radius: 3, icon: 'at:storm', desc: 'Water spills over low ground, drowning crops and fields.' },
  { id: 'earthquake', name: 'Earthquake', tier: 2, cost: 120, cd: 9, target: 'tile', cat: 'world', color: '#b08a60', radius: 4, icon: 'rv:210', desc: 'The ground shakes: some buildings fall, rubble litters the land, people are hurt.' },
  { id: 'meteor', name: 'Meteor', tier: 2, cost: 140, cd: 8, target: 'tile', cat: 'world', color: '#ff8a4a', radius: 2, icon: 'rv:386', desc: 'One rock from the heavens. Needs clear ground with nobody nearby who has not permitted it.' },
  { id: 'tsunami', name: 'Tsunami', tier: 3, cost: 280, cd: 16, target: 'tile', cat: 'world', color: '#4a8ad8', radius: 5, icon: 'at:wave', desc: 'A great wave floods the nearby low coast. Needs open water close by.' },
  { id: 'volcano', name: 'Volcano', tier: 3, cost: 330, cd: 20, target: 'tile', cat: 'world', color: '#ff5a2a', radius: 3, icon: 'at:fire', desc: 'A volcano bursts through the ground, scorching the land around it into ashlands.' },
];

for (const P of [...CORE, ...NEW, ...MORE]) if (P.target === 'tile' && P.radius >= 2) P.radius = Math.round(P.radius * 1.35); // bigger brushes: miracles should feel like miracles
export const POWERS = [...CORE, ...NEW, ...MORE].sort((a, b) => a.tier - b.tier);
export const POWER_CATS = [
  ['divine', 'Divine'], ['nature', 'Nature'], ['life', 'Life'], ['farm', 'Farm'], ['wild', 'Wild'], ['war', 'War'], ['curses', 'Curses'], ['world', 'World'],
];
export const powerById = Object.fromEntries(POWERS.map((p) => [p.id, p]));
