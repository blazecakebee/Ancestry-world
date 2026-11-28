// Free-time pastimes. Every person loves two or three of these and can't stand one, so in their own time each of
// them does something different: some fish off the shore, some dance at the fire, some wander off exploring.
// spot: where it happens · social: others nearby can join in (a gathering) · night: only after dark
// skill: what it slowly trains · act: how the character is animated (dance = hopping, spar = swinging, sit = still)
export const HOBBIES = {
  fishing:    { name: 'Fishing', icon: 'food', spot: 'shore', skill: 'animals', act: 'fish', desc: 'sits by the water with a line out' },
  music:      { name: 'Playing music', icon: 'love', spot: 'fire', skill: 'artistic', social: true, act: 'sit', desc: 'plays a tune by the fire' },
  dancing:    { name: 'Dancing', icon: 'heart', spot: 'fire', social: true, act: 'dance', desc: 'dances around the fire' },
  stories:    { name: 'Telling stories', icon: 'book', spot: 'fire', skill: 'social', social: true, act: 'sit', desc: 'tells old tales to whoever listens' },
  stargazing: { name: 'Stargazing', icon: 'moon', spot: 'open', skill: 'intellectual', night: true, act: 'sit', desc: 'lies back and watches the stars' },
  swimming:   { name: 'Swimming', icon: 'rain', spot: 'shore', act: 'swim', desc: 'goes for a swim' },
  prayer:     { name: 'Quiet prayer', icon: 'glitter', spot: 'temple', act: 'sit', desc: 'prays quietly at the shrine' },
  exploring:  { name: 'Exploring', icon: 'map', spot: 'far', act: 'walk', desc: 'wanders off to see what lies beyond' },
  games:      { name: 'Games', icon: 'crown', spot: 'fire', social: true, act: 'sit', desc: 'plays dice and stones with friends' },
  gardening:  { name: 'Gardening', icon: 'tree', spot: 'berry', skill: 'plants', act: 'work', desc: 'tends the wild berry bushes' },
  napping:    { name: 'Napping', icon: 'cloud', spot: 'tree', act: 'nap', desc: 'naps in the shade of a tree' },
  whittling:  { name: 'Whittling', icon: 'hammer', spot: 'home', skill: 'crafting', act: 'work', desc: 'whittles little wooden figures' },
  sparring:   { name: 'Sparring', icon: 'sword', spot: 'fire', skill: 'melee', social: true, act: 'spar', desc: 'spars with friends' },
  painting:   { name: 'Painting', icon: 'eye', spot: 'open', skill: 'artistic', act: 'work', desc: 'paints the view' },
};
export const HOBBY_IDS = Object.keys(HOBBIES);
// skills and traits nudge which pastimes someone is drawn to
export const HOBBY_BIAS = {
  animals: ['fishing'], artistic: ['music', 'painting', 'dancing'], social: ['stories', 'games', 'dancing'], intellectual: ['stargazing', 'stories'],
  plants: ['gardening'], crafting: ['whittling'], melee: ['sparring'], medical: ['gardening'],
  ascetic: ['prayer', 'stargazing'], kind: ['stories', 'music'], lazy: ['napping'], industrious: ['whittling', 'gardening'],
  nightOwl: ['stargazing'], brawler: ['sparring'], explorer: ['exploring'], adventurous: ['exploring', 'swimming'],
};

/** Give a person their loves and their dislike (stable per person; inherited leanings come from skills & traits). */
export function rollHobbies(p, rng) {
  const w = {}; for (const id of HOBBY_IDS) w[id] = 1;
  for (const [k, list] of Object.entries(HOBBY_BIAS)) {
    const sk = p.skills?.[k]; const v = sk ? sk.passion * 2 + sk.lvl * 0.15 : (p.traits || []).includes(k) ? 4 : 0;
    for (const h of list) w[h] += v;
  }
  const likes = [];
  const n = rng.chance(0.4) ? 3 : 2;
  while (likes.length < n) { const h = rng.weighted(HOBBY_IDS.filter((x) => !likes.includes(x)).map((x) => [x, w[x]])); likes.push(h); }
  const dislike = rng.pick(HOBBY_IDS.filter((x) => !likes.includes(x)));
  return { likes, dislike };
}
