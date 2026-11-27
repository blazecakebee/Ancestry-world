// Skills, ideology axes, governments, needs and thoughts.

export const SKILLS = [
  { id: 'melee', name: 'Melee' }, { id: 'shooting', name: 'Shooting' }, { id: 'construction', name: 'Construction' },
  { id: 'mining', name: 'Mining' }, { id: 'cooking', name: 'Cooking' }, { id: 'plants', name: 'Plants' },
  { id: 'animals', name: 'Animals' }, { id: 'crafting', name: 'Crafting' }, { id: 'artistic', name: 'Artistic' },
  { id: 'medical', name: 'Medical' }, { id: 'social', name: 'Social' }, { id: 'intellectual', name: 'Intellectual' },
];
export const PASSION_XP = [0.35, 1.0, 1.5]; // none, interested, burning
export const SKILL_XP_PER_LEVEL = (lvl) => 1000 + lvl * 1000;

// Ideology axes: value in [-100, 100]. Negative = first pole, positive = second pole.
export const AXES = [
  { id: 'faith', neg: 'Spiritual', pos: 'Rationalist', negDesc: '+Glitter from worship', posDesc: '+Research, -Glitter' },
  { id: 'war', neg: 'Militarist', pos: 'Pacifist', negDesc: 'Stronger armies, expansion by conquest', posDesc: '+Happiness, fewer wars' },
  { id: 'society', neg: 'Collectivist', pos: 'Individualist', negDesc: 'Shared food & stability', posDesc: '+Work speed, +Inspirations' },
  { id: 'nature', neg: 'Industrialist', pos: 'Eco-Steward', negDesc: '+Production, pollution', posDesc: 'Lush land, +Fertility' },
  { id: 'reach', neg: 'Expansionist', pos: 'Isolationist', negDesc: 'Found new settlements faster', posDesc: '+Stability, defensive bonus' },
];

// Governments. `era` = earliest era id; `when(n)` picks the natural fit when reforming.
export const GOVERNMENTS = [
  { id: 'tribal', name: 'Tribal Council', era: 0, succession: 'Elders choose', fx: { stability: 5 } },
  { id: 'chiefdom', name: 'Chiefdom', era: 0, succession: 'Strongest warrior', fx: { melee: 0.1 } },
  { id: 'absMonarchy', name: 'Absolute Monarchy', era: 2, succession: 'Hereditary (eldest child)', fx: { stability: 10, mood: -3 } },
  { id: 'theocracy', name: 'Theocracy', era: 1, succession: 'Chosen by the clergy', fx: { glitter: 0.4, research: -0.1 } },
  { id: 'oligarchy', name: 'Oligarchy', era: 3, succession: 'Wealthiest families', fx: { work: 0.1, mood: -4 } },
  { id: 'constMonarchy', name: 'Constitutional Monarchy', era: 5, succession: 'Hereditary, parliament rules', fx: { stability: 8, mood: 3 } },
  { id: 'republic', name: 'Democratic Republic', era: 5, succession: 'Elections', fx: { mood: 6, research: 0.1 } },
  { id: 'technocracy', name: 'Technocracy', era: 7, succession: 'Most accomplished scientist', fx: { research: 0.35 } },
  { id: 'commune', name: 'Collectivist Commune', era: 6, succession: 'Council vote', fx: { stability: 6, work: 0.05 } },
  { id: 'stellar', name: 'Stellar Empire', era: 9, succession: 'Imperial heir', fx: { stability: 12, melee: 0.15, research: 0.15 } },
];

export function pickGovernment(n) {
  const a = n.ideology, era = n.era;
  const ok = (id) => GOVERNMENTS.find((g) => g.id === id).era <= era;
  if (era >= 9 && a.reach < 20) return 'stellar';
  if (a.faith < -55 && ok('theocracy')) return 'theocracy';
  if (a.faith > 50 && ok('technocracy')) return 'technocracy';
  if (a.society < -50 && ok('commune')) return 'commune';
  if (a.society > 30 && ok('republic')) return 'republic';
  if (a.war < -40 && ok('absMonarchy')) return 'absMonarchy';
  if (ok('constMonarchy') && a.society > 0) return 'constMonarchy';
  if (ok('oligarchy') && a.nature < -30) return 'oligarchy';
  if (ok('absMonarchy')) return 'absMonarchy';
  return a.war < 0 ? 'chiefdom' : 'tribal';
}

// Thought (memory) definitions: mood value and duration in days. stack = max stacks.
export const THOUGHTS = {
  ateRaw: { label: 'Ate raw food', mood: -7, days: 1 },
  ateMeal: { label: 'Ate a cooked meal', mood: 3, days: 1 },
  ateFine: { label: 'Ate a fine meal', mood: 6, days: 1 },
  ateRation: { label: 'Ate preserved rations', mood: -2, days: 1 },
  hungry: { label: 'Hungry', mood: -6, days: 0.2, situational: true },
  starving: { label: 'Starving', mood: -20, days: 0.2, situational: true },
  tired: { label: 'Exhausted', mood: -8, days: 0.2, situational: true },
  sleptOutside: { label: 'Slept outside', mood: -4, days: 1 },
  sleptHome: { label: 'Slept in a home', mood: 2, days: 1 },
  homeless: { label: 'No home', mood: -6, days: 0.2, situational: true },
  pain: { label: 'In pain', mood: -10, days: 0.2, situational: true },
  sick: { label: 'Feeling sick', mood: -6, days: 0.2, situational: true },
  cold: { label: 'Freezing', mood: -8, days: 0.2, situational: true },
  hot: { label: 'Overheated', mood: -6, days: 0.2, situational: true },
  rain: { label: 'Soaked in rain', mood: -2, days: 0.2, situational: true },
  bored: { label: 'Bored', mood: -5, days: 0.2, situational: true },
  chat: { label: 'Had a nice chat', mood: 3, days: 0.5, stack: 3 },
  insulted: { label: 'Was insulted', mood: -5, days: 1, stack: 3 },
  deepTalk: { label: 'Deep conversation', mood: 6, days: 1 },
  friendDied: { label: 'A friend died', mood: -12, days: 6 },
  familyDied: { label: 'Family member died', mood: -20, days: 10 },
  sawDeath: { label: 'Witnessed a death', mood: -5, days: 2, stack: 3 },
  newLover: { label: 'New love', mood: 10, days: 6 },
  married: { label: 'Got married', mood: 20, days: 10 },
  newChild: { label: 'Had a child', mood: 14, days: 8 },
  breakup: { label: 'Heartbroken', mood: -12, days: 6 },
  miracle: { label: 'Witnessed a miracle', mood: 8, days: 3 },
  worshipped: { label: 'Prayed at the temple', mood: 4, days: 1 },
  festival: { label: 'Enjoyed a festival', mood: 12, days: 3 },
  aurora: { label: 'Saw the aurora', mood: 8, days: 1 },
  eclipse: { label: 'Unsettled by the eclipse', mood: -4, days: 1 },
  atWar: { label: 'Nation at war', mood: -4, days: 0.2, situational: true },
  warLust: { label: 'Glorious war!', mood: 6, days: 0.2, situational: true },
  peaceRestless: { label: 'Restless in peace', mood: -4, days: 0.2, situational: true },
  tended: { label: 'Was cared for', mood: 3, days: 1 },
  hospital: { label: 'Recovering in hospital', mood: 2, days: 0.2, situational: true },
  smog: { label: 'Choking smog', mood: -5, days: 0.2, situational: true },
  ritualGreat: { label: 'A moving ritual', mood: 8, days: 2 },
  ritualGood: { label: 'Took part in a ritual', mood: 4, days: 2 },
  ritualPoor: { label: 'A hollow ritual', mood: -3, days: 1 },
  schism: { label: 'Faith was shaken', mood: -5, days: 2 },
  prophetSermon: { label: 'Heard a sermon', mood: 5, days: 2 },
  rationsStrict: { label: 'Strict rationing', mood: -6, days: 0.2, situational: true },
  rationsGenerous: { label: 'Generous rations', mood: 4, days: 0.2, situational: true },
  nightOwlDay: { label: 'Awake in daylight', mood: -6, days: 0.2, situational: true },
  nightOwlNight: { label: 'Night owl at night', mood: 8, days: 0.2, situational: true },
  shieldSafe: { label: 'Under the orbital shield', mood: 3, days: 0.2, situational: true },
  catharsis: { label: 'Catharsis', mood: 30, days: 2.5 },
  greedyPoor: { label: 'Wants a nicer home', mood: -5, days: 0.2, situational: true },
};

export const MENTAL_BREAKS = {
  minor: ['sadWander', 'foodBinge', 'hideInRoom'],
  major: ['tantrum', 'sadWander', 'insultSpree'],
  extreme: ['berserk', 'fireStarting', 'runWild'],
};
export const BREAK_LABELS = {
  sadWander: 'Sad wandering', foodBinge: 'Food binge', hideInRoom: 'Hiding at home', tantrum: 'Tantrum',
  insultSpree: 'Insulting spree', berserk: 'Berserk!', fireStarting: 'Fire-starting spree', runWild: 'Ran wild',
};
export const INSPIRATIONS = { work: 'Frenzy of work', research: 'Inspired research', craft: 'Inspired creativity', sermon: 'Divine vision' };
