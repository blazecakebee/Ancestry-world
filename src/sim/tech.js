// Research tree progress. Research points (n.research, earned at studies, by curiosity, from miracles...) flow into the
// tech a nation is focused on. Finishing an era's capstone moves the nation into the next era.
import { TECHS, TECH, techsOfEra, capOf, CAP_NEEDS, BUILD_TECH } from '../data/tech.js';
import { BUILDINGS } from '../data/buildings.js';
import { ERAS } from '../data/eras.js';

/** Make sure a nation has tech state; nations already past an era (old saves, nomads) know everything before it. */
export function initTechs(n) {
  if (!n.techs) n.techs = {};
  for (const t of TECHS) if (t.era < n.era) n.techs[t.id] = 1;
  if (n._resSeen === undefined) n._resSeen = n.research || 0;
  n.techProg ||= 0;
  recomputeTechFx(n);
}
export function recomputeTechFx(n) {
  const fx = {};
  for (const id of Object.keys(n.techs || {})) { const t = TECH[id]; if (!t) continue; for (const [k, v] of Object.entries(t.fx)) fx[k] = (fx[k] || 0) + v; }
  n.techFx = fx;
}
export const hasTech = (n, id) => !!n.techs?.[id];
/** Can this tech be researched now? */
export function techOpen(n, t) {
  if (typeof t === 'string') t = TECH[t];
  if (!t || n.techs?.[t.id] || t.era > n.era) return false;
  if (t.cap) return techsOfEra(t.era).filter((x) => !x.cap && n.techs?.[x.id]).length >= CAP_NEEDS;
  return true;
}
export const openTechs = (n) => TECHS.filter((t) => techOpen(n, t));
/** Is a building type available to this nation (era and tech)? */
export function canBuildType(n, type) {
  const def = BUILDINGS[type]; if (!def || def.era > n.era) return false;
  const need = BUILD_TECH[type]; return !need || hasTech(n, need);
}
/** Default pick: capstone when open, else the cheapest open tech (AI nations lean on their ideals). */
export function autoPick(n) {
  const open = openTechs(n); if (!open.length) return null;
  const cap = open.find((t) => t.cap); if (cap) return cap.id;
  return open.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0].id;
}
/** Called from stepNation. Returns the finished tech (or null). */
export function stepTech(world, n) {
  if (!n.techs) initTechs(n);
  const delta = (n.research || 0) - (n._resSeen || 0); n._resSeen = n.research || 0;
  if (!n.techCur || !techOpen(n, n.techCur)) { n.techCur = autoPick(n); }
  if (!n.techCur) return null;
  n.techProg = Math.max(0, (n.techProg || 0) + delta);
  const t = TECH[n.techCur];
  if (n.techProg < t.cost) return null;
  n.techProg -= t.cost; n.techs[t.id] = 1; recomputeTechFx(n);
  if (t.cap && n.era === t.era && ERAS[n.era + 1]) n.era = t.era + 1;
  n.techCur = n.ownerId && n.techQueue?.length ? n.techQueue.shift() : null;
  return t;
}
export function techCommand(world, n, cmd) {
  const t = TECH[cmd.id];
  if (!t) return 'Unknown technology.';
  if (n.techs?.[t.id]) return 'Already known.';
  if (!techOpen(n, t)) return t.cap ? `Needs ${CAP_NEEDS} other ${ERAS[t.era].name} technologies first.` : 'Not reachable yet.';
  if (n.techCur !== t.id) { n.techProg = Math.floor((n.techProg || 0) * 0.5); n.techCur = t.id; } // switching focus loses half the partial work
  return null;
}
