// Citizens ("pawns"): appearance genetics, traits, skills, needs, thoughts and mood.
import { TRAITS, BIRTH_TRAITS } from '../data/traits.js';
import { SKILLS, THOUGHTS, PASSION_XP, SKILL_XP_PER_LEVEL } from '../data/society.js';
import { personName, familyName } from '../data/names.js';
import { clamp } from '../core/util.js';
import { RACES } from '../data/races.js';
import { DAY_LEN } from '../core/time.js';

export const SKIN_TONES = 10, HAIR_COLORS = 11, EYE_COLORS = 6;
export const HAIR_STYLES_M = [0, 1, 2, 3, 4, 9, 10, 2, 3, 13];
export const HAIR_STYLES_F = [5, 6, 7, 8, 9, 11, 12, 6, 5, 14];
export const AGE = { CHILD: 14, ELDER: 60 };

export function randomLook(rng, sex, region = 0.5) {
  const skinBias = clamp(region * SKIN_TONES + rng.gauss(0, 2), 0, SKIN_TONES - 1);
  const look = {
    skin: Math.round(skinBias),
    hairColor: rng.weighted([[0, 6], [1, 6], [2, 5], [3, 2], [4, 1.5], [5, 2], [6, 0.6]]),
    hairStyle: rng.pick(sex === 'f' ? HAIR_STYLES_F : HAIR_STYLES_M),
    beard: sex === 'm' ? rng.weighted([[0, 5], [1, 2], [2, 1.5], [3, 2], [4, 1]]) : 0,
    eyes: rng.int(0, EYE_COLORS - 1),
    fat: clamp(rng.gauss(0.28, 0.22), 0, 1),
    muscle: clamp(rng.gauss(sex === 'm' ? 0.45 : 0.3, 0.22), 0, 1),
    height: clamp(rng.gauss(sex === 'm' ? 1.03 : 0.97, 0.05), 0.86, 1.14),
    chest: sex === 'f' ? clamp(rng.gauss(0.55, 0.25), 0.1, 1) : 0,
    face: rng.int(0, 2), nose: rng.int(0, 2), brow: rng.int(0, 2),
    glasses: rng.chance(0.12), freckles: rng.chance(0.12),
  };
  if (look.skin >= 6) look.hairColor = rng.weighted([[0, 8], [1, 3], [2, 1]]);
  return look;
}

function inheritLook(rng, sex, a, b) {
  const pick = (k) => (rng.chance(0.5) ? a.look[k] : b.look[k]);
  const avg = (k, sd) => clamp((a.look[k] + b.look[k]) / 2 + rng.gauss(0, sd), 0, 1);
  return {
    skin: clamp(Math.round((a.look.skin + b.look.skin) / 2 + rng.gauss(0, 0.8)), 0, SKIN_TONES - 1),
    hairColor: rng.chance(0.05) ? rng.int(0, 6) : pick('hairColor'),
    hairStyle: rng.pick(sex === 'f' ? HAIR_STYLES_F : HAIR_STYLES_M),
    beard: sex === 'm' ? rng.weighted([[0, 5], [1, 2], [2, 1.5], [3, 2], [4, 1]]) : 0,
    eyes: pick('eyes'), fat: avg('fat', 0.15), muscle: avg('muscle', 0.15),
    height: clamp((a.look.height + b.look.height) / 2 + rng.gauss(sex === 'm' ? 0.03 : -0.03, 0.04), 0.86, 1.14),
    chest: sex === 'f' ? clamp((a.look.chest + b.look.chest) / 2 + rng.gauss(0.15, 0.2), 0.1, 1) : 0,
    face: pick('face'), nose: pick('nose'), brow: pick('brow'), glasses: rng.chance(0.1), freckles: pick('freckles'),
  };
}

function rollTraits(rng, parents) {
  const out = [];
  const groups = new Set();
  const add = (id) => { const t = TRAITS[id]; if (!t || out.includes(id) || (t.group && groups.has(t.group))) return; out.push(id); if (t.group) groups.add(t.group); };
  if (parents) for (const par of parents) for (const id of par.traits) if (!TRAITS[id].acquired && rng.chance(TRAITS[id].inherit)) add(id);
  const n = rng.weighted([[1, 3], [2, 5], [3, 3], [4, 1]]);
  let guard = 0;
  while (out.length < n && guard++ < 40) add(rng.weighted(BIRTH_TRAITS.map((t) => [t, TRAITS[t].w])));
  return out;
}

export function computeFx(p) {
  const fx = {};
  for (const id of p.traits) for (const [k, v] of Object.entries(TRAITS[id].fx)) fx[k] = (fx[k] || 0) + v;
  for (const [k, v] of Object.entries(RACES[p.race || 'human'].fx)) fx[k] = (fx[k] || 0) + v;
  p.fx = fx;
  return fx;
}

let nextPawnId = 1;
export const setNextPawnId = (n) => { nextPawnId = n; };
export const getNextPawnId = () => nextPawnId;

export function createPawn(rng, o) {
  const sex = o.sex || (rng.chance(0.5) ? 'm' : 'f');
  const parents = o.parents || null;
  const look = parents ? inheritLook(rng, sex, parents[0], parents[1]) : randomLook(rng, sex, o.region ?? 0.5);
  const skills = {};
  for (const s of SKILLS) {
    const base = o.age < AGE.CHILD ? 0 : clamp(Math.round(rng.gauss(o.age > 25 ? 4 : 2.5, 2.5)), 0, 12);
    skills[s.id] = { lvl: base, xp: 0, passion: rng.weighted([[0, 8], [1, 3], [2, 1]]) };
  }
  const p = {
    id: nextPawnId++, name: personName(rng, o.lang ?? 0), family: o.family || familyName(rng, o.lang ?? 0),
    sex, race: o.race || (parents ? parents[rng.int(0, 1)].race : 'human') || 'human', age: o.age ?? rng.range(16, 45), nationId: o.nationId ?? -1, settlementId: o.settlementId ?? -1,
    parents: parents ? parents.map((q) => q.id) : [], children: [], spouse: -1, lover: -1, rel: {},
    look, traits: rollTraits(rng, parents), skills,
    needs: { food: rng.range(0.6, 1), rest: rng.range(0.6, 1), joy: rng.range(0.5, 1), social: rng.range(0.5, 1) },
    mood: 55, moodTarget: 55, thoughts: [],
    hp: 100, injuries: [], diseases: [], blood: 1, pain: 0, downed: false, dead: false, deathCause: null,
    x: o.x ?? 0, y: o.y ?? 0, path: null, job: null, state: 'idle', facing: 1, anim: rng.next() * 10,
    carry: null, home: -1, bedIn: -1, role: 'citizen', kills: 0, gearEra: o.era ?? 0,
    brk: null, insp: null, possessedBy: null, lifespan: 0, xpMult: 1, buff: {},
  };
  computeFx(p);
  p.lifespan = clamp(rng.gauss(72, 9), 50, 95) + (p.fx.lifespan || 0);
  if (rng.chance(0.03) && !p.traits.includes('starBlessed') && o.allowRare !== false) { p.traits.push('starBlessed'); computeFx(p); }
  return p;
}

export function createChild(rng, mother, father, lang) {
  const c = createPawn(rng, { parents: [mother, father], age: 0, lang, family: rng.chance(0.75) ? father.family : mother.family,
    nationId: mother.nationId, settlementId: mother.settlementId, x: mother.x, y: mother.y, era: mother.gearEra });
  mother.children.push(c.id); father.children.push(c.id);
  return c;
}

export const fullName = (p) => `${p.name} ${p.family}`;
export const isChild = (p) => p.age < AGE.CHILD;
export const maxHp = (p) => 100 * (1 + (p.fx.hp || 0)) * (isChild(p) ? 0.6 : 1) * (p.age > AGE.ELDER ? 0.85 : 1);

// ---- thoughts & mood ----
export function addThought(p, id, now, mult = 1) {
  const d = THOUGHTS[id]; if (!d) return;
  if (p.traits.includes('psychopath') && (id === 'friendDied' || id === 'sawDeath' || id === 'familyDied')) return;
  const existing = p.thoughts.filter((t) => t.id === id);
  const span = d.days * DAY_LEN; // memories last calendar days
  if (existing.length >= (d.stack || 1)) { existing[0].until = now + span; return; }
  p.thoughts.push({ id, until: now + span, m: mult });
}
export function setSituational(p, id, on, now) {
  const i = p.thoughts.findIndex((t) => t.id === id);
  if (on && i < 0) p.thoughts.push({ id, until: now + THOUGHTS[id].days, m: 1 });
  else if (on) p.thoughts[i].until = now + THOUGHTS[id].days;
  else if (!on && i >= 0) p.thoughts.splice(i, 1);
}
export function updateMood(p, now, dt, nationMood = 0) {
  p.thoughts = p.thoughts.filter((t) => t.until > now);
  let m = 45 + (p.fx.mood || 0) + nationMood;
  for (const t of p.thoughts) m += THOUGHTS[t.id].mood * (t.m || 1);
  p.moodTarget = clamp(m, 0, 100);
  if (p.state === 'sleep' || p.downed) return;
  const rate = p.moodTarget > p.mood ? 12 : 8; // per in-game "hour" (RimWorld style)
  p.mood += clamp(p.moodTarget - p.mood, -rate * 24 * dt, rate * 24 * dt);
}

// ---- skills ----
export function gainXp(p, skill, amount) {
  const s = p.skills[skill]; if (!s) return;
  s.xp += amount * PASSION_XP[s.passion] * (1 + (p.fx.learn || 0));
  while (s.lvl < 20 && s.xp >= SKILL_XP_PER_LEVEL(s.lvl)) { s.xp -= SKILL_XP_PER_LEVEL(s.lvl); s.lvl++; }
}
export const skillFactor = (p, skill) => 0.55 + p.skills[skill].lvl * 0.065;
export const workSpeed = (p) => Math.max(0.2, 1 + (p.fx.work || 0) + (p.insp?.type === 'work' ? 1 : 0) + (p.buff.blessedUntil ? 0.15 : 0)) * (isChild(p) ? 0.4 : p.age > 70 ? 0.7 : 1);
export const moveSpeed = (p) => {
  let s = 46 * (1 + (p.fx.speed || 0));
  if (p.pain > 0.3) s *= 0.75;
  if (isChild(p)) s *= 0.8;
  if (p.age > 70) s *= 0.75;
  return s * (p.look.height || 1);
};

// ---- relationships ----
export function opinion(p, q) { return p.rel[q.id] || 0; }
export function changeOpinion(p, q, d) {
  p.rel[q.id] = clamp((p.rel[q.id] || 0) + d, -100, 100);
  const keys = Object.keys(p.rel);
  if (keys.length > 24) { // keep the strongest bonds only
    keys.sort((a, b) => Math.abs(p.rel[a]) - Math.abs(p.rel[b]));
    for (let i = 0; i < keys.length - 24; i++) if (+keys[i] !== p.spouse && +keys[i] !== p.lover) delete p.rel[keys[i]];
  }
}

export function relationLabel(p, q) {
  if (p.spouse === q.id) return 'Spouse';
  if (p.lover === q.id) return 'Lover';
  if (p.parents.includes(q.id)) return q.sex === 'f' ? 'Mother' : 'Father';
  if (p.children.includes(q.id)) return q.sex === 'f' ? 'Daughter' : 'Son';
  if (p.parents.length && p.parents.some((id) => q.parents.includes(id))) return q.sex === 'f' ? 'Sister' : 'Brother';
  const o = opinion(p, q);
  return o > 50 ? 'Close friend' : o > 20 ? 'Friend' : o < -40 ? 'Rival' : o < -15 ? 'Disliked' : 'Acquaintance';
}
