// Tools & weapons: every person carries their own kit. Six kinds, each made in four materials at a crafting bench.
// A tool speeds up the work it is for and wears out with use; a sword makes blows (fights and hunts) hit harder.
// Items: `${kind}_${mat}` (category 'tools'); icons in assets/packs/mfarm/items, held art in assets/packs/gchar/hand.

export const TOOL_KINDS = {
  axe:     { name: 'Axe', desc: 'Fells trees much faster.' },
  pickaxe: { name: 'Pickaxe', desc: 'Breaks rock and digs ore much faster.' },
  sword:   { name: 'Sword', desc: 'Hits harder in fights and hunts.' },
  rod:     { name: 'Fishing rod', desc: 'Catches far more fish.' },
  shovel:  { name: 'Shovel', desc: 'Builds, digs and sows faster.' },
  sickle:  { name: 'Sickle', desc: 'Harvests crops and wild plants faster.' },
};
export const TOOL_ORDER = ['axe', 'pickaxe', 'sword', 'rod', 'shovel', 'sickle'];

// speed: work-speed multiplier · dmg: sword damage multiplier · uses: how much work before it breaks
// cost: items taken from the store (wood/stone are categories, iron/gold specific ores)
export const TOOL_MATS = {
  wood:  { name: 'Wooden', rank: 1, speed: 1.15, dmg: 1.1, uses: 30, cost: { wood: 3 } },
  stone: { name: 'Stone', rank: 2, speed: 1.35, dmg: 1.25, uses: 60, cost: { wood: 1, stone: 2 } },
  iron:  { name: 'Iron', rank: 3, speed: 1.7, dmg: 1.6, uses: 150, cost: { wood: 1, iron: 2 }, tech: 'ironworking' },
  gold:  { name: 'Golden', rank: 4, speed: 2.0, dmg: 1.45, uses: 50, cost: { wood: 1, gold: 2 }, tech: 'ironworking' },
};
export const MAT_ORDER = ['wood', 'stone', 'iron', 'gold'];
/** Working without the right tool. */
export const BARE = { axe: 0.7, pickaxe: 0.65, sword: 1, rod: 0.45, shovel: 0.8, sickle: 0.8 };

export const toolId = (kind, mat) => `${kind}_${mat}`;
export const parseTool = (id) => { const i = id.lastIndexOf('_'); const kind = id.slice(0, i), mat = id.slice(i + 1); return TOOL_KINDS[kind] && TOOL_MATS[mat] ? { kind, mat } : null; };
export const toolName = (kind, mat) => `${TOOL_MATS[mat].name} ${TOOL_KINDS[kind].name.toLowerCase()}`;

/** What each trade wants in its kit, most important first. */
export const WORK_TOOLS = { builder: ['axe', 'shovel'], farmer: ['sickle', 'shovel'], hunter: ['sword', 'rod'], miner: ['pickaxe'], soldier: ['sword'] };

/** Held-art name for the layered characters (hand/<sex>_<name>.png). */
export function handArt(kind, mat) {
  if (kind === 'rod') return 'rod';
  if (kind === 'sickle' || kind === 'shovel') return `${mat}_${kind}`;
  return `${mat === 'wood' ? 'wooden' : mat === 'gold' ? 'golden' : mat}_${kind}`;
}
