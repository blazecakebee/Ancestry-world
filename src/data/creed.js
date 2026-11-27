// Creed: a nation's ideology, in the spirit of RimWorld's Ideoligion.
//   memes     the core ideals (2-4 depending on era). Some pairs are incompatible. Each has an impact level.
//   precepts  rules on six issues. Each option is approved or hated by the memes, which moves mood and certainty.
//   rituals   gatherings the people hold on their own; they raise mood and certainty when they go well.
//   roles     the Leader and the Moral Guide (a prophet) shape how good the rituals are.
//   certainty how sure the people are of their creed. Low certainty brings doubt, then a schism.
// The five legacy axes (faith, war, society, nature, reach) are DERIVED from the memes so older systems still work.

export const IMPACT = { low: 0.6, med: 1, high: 1.5 };

export const CREED_MAX = 4;
export const memeSlots = (era) => (era >= 6 ? 4 : era >= 3 ? 3 : 2);

// axes: push toward a pole at medium impact. fx: nation-wide modifiers at medium impact.
// pref / avoid: the option index of each precept issue this meme likes / hates.
export const MEMES = [
  { id: 'spiritual', name: 'Spiritual', icon: 'glitter', impact: 'high', axes: { faith: -60 }, fx: { glitter: 0.1 }, pref: { dead: 0, know: 1 }, avoid: { dead: 2 }, ritual: 'sermon', incompat: ['rationalist'], desc: 'The divine is everywhere. Worship runs deep and temples glow brighter.' },
  { id: 'rationalist', name: 'Rationalist', icon: 'book', impact: 'high', axes: { faith: 60 }, fx: { research: 0.08, glitter: -0.04 }, pref: { know: 0 }, avoid: { know: 2 }, ritual: 'debate', incompat: ['spiritual'], desc: 'Truth is found by asking. Research speeds up, devotion cools.' },
  { id: 'militarist', name: 'Militarist', icon: 'sword', impact: 'high', axes: { war: -60 }, fx: { melee: 0.08, conscript: 0.05 }, pref: { war: 0 }, avoid: { war: 2 }, ritual: 'parade', incompat: ['pacifist'], desc: 'Strength is virtue. Larger, stronger armies.' },
  { id: 'pacifist', name: 'Pacifist', icon: 'dove', impact: 'high', axes: { war: 60 }, fx: { mood: 2, conscript: -0.04 }, pref: { war: 2 }, avoid: { war: 0 }, ritual: 'peacefair', incompat: ['militarist'], desc: 'Life is precious. Happier people and fewer wars.' },
  { id: 'collectivist', name: 'Collectivist', icon: 'flag', impact: 'med', axes: { society: -60 }, fx: { stability: 3 }, pref: { toil: 0, out: 1 }, avoid: { toil: 2 }, ritual: 'commons', incompat: ['individualist'], desc: 'The tribe is one body. Shared food and a steadier nation.' },
  { id: 'individualist', name: 'Individualist', icon: 'hand', impact: 'med', axes: { society: 60 }, fx: { work: 0.05 }, pref: { toil: 1, out: 0 }, avoid: { out: 2 }, ritual: 'moot', incompat: ['collectivist'], desc: 'Every voice counts. Faster work, more inspiration.' },
  { id: 'industrialist', name: 'Industrialist', icon: 'stone', impact: 'med', axes: { nature: -60 }, fx: { work: 0.06 }, pref: { land: 0, toil: 0 }, avoid: { land: 2 }, ritual: 'greatwork', incompat: ['stewardship'], desc: 'The land is a workshop. More production, more smoke.' },
  { id: 'stewardship', name: 'Stewardship', icon: 'wheat', impact: 'med', axes: { nature: 60 }, fx: { fertility: 0.06 }, pref: { land: 2 }, avoid: { land: 0 }, ritual: 'planting', incompat: ['industrialist'], desc: 'We are guests here. Lush land and kinder harvests.' },
  { id: 'expansionist', name: 'Expansionist', icon: 'globe', impact: 'med', axes: { reach: -60 }, fx: {}, pref: { out: 0 }, avoid: { out: 2 }, ritual: 'founding', incompat: ['isolationist'], desc: 'Beyond the hills is home. New settlements come faster.' },
  { id: 'isolationist', name: 'Isolationist', icon: 'shield', impact: 'med', axes: { reach: 60 }, fx: { stability: 2 }, pref: { out: 2 }, avoid: { out: 0 }, ritual: 'vigil', incompat: ['expansionist'], desc: 'Keep what we have. Steadier borders, sturdier defence.' },
  { id: 'ancestral', name: 'Ancestral', icon: 'scroll', impact: 'med', axes: { faith: -20 }, fx: { glitter: 0.05, stability: 2 }, pref: { dead: 0 }, avoid: { dead: 2 }, ritual: 'memorial', incompat: ['progress'], desc: 'The dead watch over us. Memorials bind the people together.' },
  { id: 'bounty', name: 'Bounty', icon: 'wheat', impact: 'low', axes: { society: -15 }, fx: { mood: 2 }, pref: { toil: 2 }, avoid: { toil: 0 }, ritual: 'feast', incompat: [], desc: 'A full table is a holy thing. Feasts lift every heart.' },
  { id: 'tradition', name: 'Tradition', icon: 'scroll', impact: 'med', axes: {}, fx: { stability: 3, research: -0.06 }, pref: { know: 1, dead: 0 }, avoid: { know: 0 }, ritual: 'elders', incompat: ['progress'], desc: 'As it was, so it shall be. Steady, but slow to learn.' },
  { id: 'progress', name: 'Progress', icon: 'rocket', impact: 'med', axes: { faith: 15 }, fx: { research: 0.08 }, pref: { know: 0, out: 0 }, avoid: { know: 2 }, ritual: 'exhibit', incompat: ['tradition', 'ancestral'], desc: 'Tomorrow will be better. Faster discovery, less stability.' },
];
export const MEME = Object.fromEntries(MEMES.map((m) => [m.id, m]));
export const incompatible = (a, b) => !!(MEME[a]?.incompat.includes(b) || MEME[b]?.incompat.includes(a));

// Precept issues. Option index 0..2. fx at face value.
export const PRECEPTS = [
  { id: 'war', name: 'War & Valor', options: [
    { label: 'Glory in battle', fx: { melee: 0.1, conscript: 0.05 }, desc: 'Fighters are honoured. Bigger, bolder armies.' },
    { label: 'Only just wars', fx: {}, desc: 'War is a last resort.' },
    { label: 'Blood is shame', fx: { mood: 2, conscript: -0.04, melee: -0.05 }, desc: 'Violence is abhorred. Fewer soldiers, calmer minds.' } ] },
  { id: 'toil', name: 'Labour', options: [
    { label: 'Toil is sacred', fx: { work: 0.08, mood: -2 }, desc: 'Work is virtue. Faster work, weary hearts.' },
    { label: 'Work and rest', fx: {}, desc: 'A little of both.' },
    { label: 'Rest is holy', fx: { mood: 3, work: -0.06 }, desc: 'Leisure is honoured. Happier, slower.' } ] },
  { id: 'land', name: 'The Land', options: [
    { label: 'Bend the land', fx: { work: 0.04, fertility: -0.05 }, desc: 'Cut, dig, build. Quick returns, thinner soil.' },
    { label: 'Use with care', fx: {}, desc: 'Take what is needed.' },
    { label: 'Tend the wild', fx: { fertility: 0.08, work: -0.03 }, desc: 'The wild comes first. Richer soil, slower building.' } ] },
  { id: 'dead', name: 'The Dead', options: [
    { label: 'Honour ancestors', fx: { glitter: 0.08, stability: 2 }, desc: 'Graves are tended and names remembered.' },
    { label: 'Quiet burial', fx: {}, desc: 'The dead are laid to rest simply.' },
    { label: 'Let them rest', fx: { research: 0.04, glitter: -0.05 }, desc: 'The living come first. Less grief, less devotion.' } ] },
  { id: 'out', name: 'Strangers', options: [
    { label: 'Open hands', fx: { research: 0.04, stability: -1 }, desc: 'Visitors are welcome. Ideas flow in.' },
    { label: 'Wary welcome', fx: {}, desc: 'Guests are watched.' },
    { label: 'Closed gates', fx: { stability: 3, research: -0.05 }, desc: 'Outsiders are shunned. Steadier, narrower.' } ] },
  { id: 'know', name: 'Learning', options: [
    { label: 'Questions are holy', fx: { research: 0.1, glitter: -0.04 }, desc: 'Doubt drives discovery.' },
    { label: 'Teach the old ways', fx: {}, desc: 'Knowledge is passed down.' },
    { label: 'Doubt is sin', fx: { stability: 2, research: -0.08, glitter: 0.04 }, desc: 'Faith over reason.' } ] },
];
export const PRECEPT = Object.fromEntries(PRECEPTS.map((p) => [p.id, p]));

export const APPROVAL = [[2, 'Cherished', '#8be28b'], [1, 'Preferred', '#b8e08b'], [0, 'Neutral', '#9aa0b4'], [-1, 'Disliked', '#e8b06a'], [-99, 'Abhorrent', '#e86a6a']];
export function approvalLabel(a) { for (const [min, label, col] of APPROVAL) if (a >= min) return { label, col }; return { label: 'Abhorrent', col: '#e86a6a' }; }

// Rituals: interval in days (a year is 12 days). mood thought is applied to every citizen.
export const RITUALS = {
  sermon: { name: 'Great Sermon', every: 9, blurb: 'The prophet preaches to the whole people.', temple: true },
  debate: { name: 'Open Debate', every: 10, blurb: 'Scholars argue before the people.' },
  parade: { name: 'Victory Parade', every: 9, blurb: 'The army marches and the crowds cheer.' },
  peacefair: { name: 'Peace Fair', every: 10, blurb: 'Markets, music and gifts between neighbours.' },
  commons: { name: 'Shared Table', every: 8, blurb: 'Everyone eats from the same pot.' },
  moot: { name: 'Folk Moot', every: 10, blurb: 'Every voice is heard in the open air.' },
  greatwork: { name: 'Great Work', every: 11, blurb: 'The whole nation raises something together.' },
  planting: { name: 'Planting Rite', every: 9, blurb: 'Seeds are sown with song.' },
  founding: { name: 'Founding Day', every: 12, blurb: 'The people remember where they came from, and where they are going.' },
  vigil: { name: 'Quiet Vigil', every: 10, blurb: 'The people keep the hearth and the watch.' },
  memorial: { name: 'Remembrance', every: 9, blurb: 'The names of the dead are spoken aloud.', temple: true },
  feast: { name: 'Harvest Feast', every: 8, blurb: 'A huge meal, shared and celebrated.' },
  elders: { name: "Elders' Tales", every: 10, blurb: 'The old tell the stories of the old days.' },
  exhibit: { name: 'Grand Exhibition', every: 11, blurb: 'Inventors show their newest marvels.' },
};

export const CREED_COSTS = { memeChange: 12, memeCooldown: 12, preceptChange: 5, preceptCooldown: 4 };
