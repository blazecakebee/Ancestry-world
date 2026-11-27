// Personal kits: each person owns at most one tool of each kind (p.tools[kind] = { m: material, u: uses left }).
// Tools are crafted at a crafting bench into the settlement's store, picked up by whoever needs them, sped up the work
// they are for and break after enough use. p.toolOut is the tool in hand right now (drawn by the renderer).
import { TOOL_KINDS, TOOL_MATS, MAT_ORDER, TOOL_ORDER, BARE, WORK_TOOLS, toolId, parseTool, toolName } from '../data/tools.js';
import { addItem, takeCat } from './items.js';
import { emitFx } from './world.js';

const rankOf = (t) => (t ? TOOL_MATS[t.m]?.rank || 0 : 0);

/** Work-speed factor for a job that uses `kind` (also marks the tool as the one in hand). */
export function toolSpeed(p, kind) {
  const t = p.tools?.[kind];
  if (p.toolOut !== kind) p.toolOut = kind;
  return t ? TOOL_MATS[t.m].speed : BARE[kind];
}
/** Sword damage factor for a blow. */
export function swordDmg(p) { const t = p.tools?.sword; return t ? TOOL_MATS[t.m].dmg : 1; }

/** Use up a bit of a tool; it breaks when worn out. */
export function wearTool(world, p, kind, amt = 1) {
  const t = p.tools?.[kind]; if (!t) return;
  t.u -= amt;
  if (t.u <= 0) {
    delete p.tools[kind]; if (p.toolOut === kind) p.toolOut = null;
    emitFx(world, { type: 'emote', pid: p.id, icon: 'warning' });
  }
}

/** The tool kinds this person should carry. */
export function wantedTools(p) {
  if (p.age < 14) return [];
  const w = p.role === 'soldier' ? WORK_TOOLS.soldier : WORK_TOOLS[p.work] || [];
  return w;
}

/** Best tool in the store that is an upgrade over what `p` carries: [itemId] or null. */
export function upgradeFor(p, s) {
  if (!s?.items) return null;
  for (const kind of wantedTools(p)) {
    const cur = rankOf(p.tools?.[kind]);
    let best = null, br = cur;
    for (const m of MAT_ORDER) { const id = toolId(kind, m); if ((s.items[id] || 0) >= 1 && TOOL_MATS[m].rank > br) { br = TOOL_MATS[m].rank; best = id; } }
    if (best) return best;
  }
  return null;
}

/** Pick up a tool from the store; the old one goes back on the shelf. */
export function equipTool(p, s, id) {
  const t = parseTool(id); if (!t || !((s.items[id] || 0) >= 1)) return false;
  s.items[id] -= 1; s.stock.tools = Math.max(0, (s.stock.tools || 0) - 1); if (s.items[id] <= 1e-6) delete s.items[id];
  p.tools ||= {};
  const old = p.tools[t.kind];
  if (old && old.u > TOOL_MATS[old.m].uses * 0.25) addItem(s, toolId(t.kind, old.m), 1);
  p.tools[t.kind] = { m: t.mat, u: TOOL_MATS[t.mat].uses };
  return true;
}

const matKnown = (n, m) => !TOOL_MATS[m].tech || n.techs?.[TOOL_MATS[m].tech];
const have = (s, item, k) => (item === 'wood' || item === 'stone' ? (s.stock[item] || 0) : (s.items?.[item] || 0)) >= k;
const canAfford = (s, m) => Object.entries(TOOL_MATS[m].cost).every(([it, k]) => have(s, it, k));

/** What the bench should make next for this settlement: { kind, mat } or null. */
export function craftChoice(world, s, n, pawns) {
  const shelf = (kind, minRank) => MAT_ORDER.some((m) => TOOL_MATS[m].rank >= minRank && (s.items?.[toolId(kind, m)] || 0) >= 1);
  // best material we can make right now
  const mats = MAT_ORDER.filter((m) => matKnown(n, m) && canAfford(s, m)).sort((a, b) => TOOL_MATS[b].rank - TOOL_MATS[a].rank);
  if (!mats.length) return null;
  const top = mats[0], topRank = TOOL_MATS[top].rank;
  // count who needs what: missing first, then upgrades
  const need = {};
  for (const p of pawns) for (const [i, kind] of wantedTools(p).entries()) {
    const r = rankOf(p.tools?.[kind]);
    if (r >= topRank || shelf(kind, Math.max(r + 1, 1))) continue;
    need[kind] = (need[kind] || 0) + (r === 0 ? 3 : 1) + (i === 0 ? 1 : 0);
  }
  const kind = TOOL_ORDER.filter((k) => need[k]).sort((a, b) => need[b] - need[a])[0];
  if (!kind) return null;
  // gold is for show: only when iron is short
  const mat = top === 'gold' && mats.includes('iron') ? 'iron' : top;
  return { kind, mat };
}

/** Spend the materials and put the finished tool on the shelf. */
export function craftTool(world, s, kind, mat) {
  if (!canAfford(s, mat)) return false;
  for (const [it, k] of Object.entries(TOOL_MATS[mat].cost)) {
    if (it === 'wood' || it === 'stone') takeCat(s, it, k);
    else { s.items[it] -= k; s.stock.metal = Math.max(0, (s.stock.metal || 0) - k); if (s.items[it] <= 1e-6) delete s.items[it]; }
  }
  addItem(s, toolId(kind, mat), 1);
  return toolName(kind, mat);
}

/** Starting kits when an older save is loaded: nothing (people craft their own). */
export function ensureKit(p) { p.tools ||= {}; }
export { TOOL_KINDS };
