// Procedural names. Each nation gets a "language" (syllable set) so names feel cultural (WorldBox onomastics).
const SYL_SETS = [
  { on: ['ka', 'ra', 'to', 'mi', 'na', 'shi', 'ko', 'ha', 'yu', 'ri', 'sa', 'ta'], fin: ['n', '', 'ru', 'ko', 'ma', 'ki'] },
  { on: ['bra', 'dor', 'gun', 'thar', 'hel', 'vig', 'ul', 'ing', 'sva', 'bjor', 'ey', 'fen'], fin: ['d', 'r', 'ga', 'ric', 'mund', 'a'] },
  { on: ['ae', 'li', 'la', 'ri', 'syl', 'tha', 'ely', 'nae', 'fi', 'el', 'ira', 'van'], fin: ['ra', 'el', 'is', 'wyn', 'ae', 'iel'] },
  { on: ['zu', 'ma', 'ko', 'ba', 'nde', 'lu', 'ka', 'si', 'mbe', 'ta', 'wa', 'ju'], fin: ['ni', 'la', 'mba', 'ri', 'go', 'e'] },
  { on: ['xo', 'qua', 'tl', 'ix', 'po', 'ca', 'yo', 'mo', 'te', 'chi', 'hu', 'ze'], fin: ['tl', 'ca', 'lo', 'mec', 'xi', 'a'] },
  { on: ['al', 'ha', 'zar', 'mir', 'ka', 'sa', 'fa', 'ri', 'da', 'na', 'ja', 'yas'], fin: ['im', 'a', 'ad', 'id', 'ra', 'un'] },
  { on: ['vo', 'sla', 'mir', 'ra', 'do', 'bo', 'ni', 'ka', 'lya', 'zo', 've', 'gor'], fin: ['v', 'a', 'slav', 'ko', 'na', 'mir'] },
  { on: ['ca', 'lo', 'me', 'ri', 'sa', 'vi', 'to', 'ma', 'ce', 'li', 'fa', 'no'], fin: ['o', 'a', 'us', 'ia', 'ius', 'e'] },
];
export const LANG_COUNT = SYL_SETS.length;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function makeName(rng, lang, parts = 2) {
  const S = SYL_SETS[lang % SYL_SETS.length];
  let s = '';
  for (let i = 0; i < parts; i++) s += rng.pick(S.on);
  return cap(s + rng.pick(S.fin));
}
export const personName = (rng, lang) => makeName(rng, lang, rng.chance(0.6) ? 1 : 2);
export const familyName = (rng, lang) => makeName(rng, lang, 2);
export function settlementName(rng, lang) {
  const base = makeName(rng, lang, rng.chance(0.5) ? 1 : 2);
  return rng.chance(0.25) ? base + rng.pick([' Ford', ' Hollow', 'hold', 'stead', ' Rock', ' Falls', 'mere', ' Point']) : base;
}
export function nationName(rng, lang) {
  const base = makeName(rng, lang, 2);
  return rng.pick([`${base}`, `${base} Folk`, `Tribe of ${base}`, `${base} Clan`, `People of ${base}`]);
}
export const NATION_COLORS = ['#e8c547', '#4fb0ff', '#ff6b6b', '#7ee081', '#c58cff', '#ff9f43', '#4ee6d4', '#ff7ac8', '#b0e05a', '#e0e0e0', '#8f9bff', '#d6a86c'];
