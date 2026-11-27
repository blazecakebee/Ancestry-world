// Goods on the ground and in the stores.
//  - s.items   : itemised store of a settlement ({ beef: 12, wheat: 30, ... }).
//  - s.stock   : category totals the economy reasons about (food, wood, ...). syncItems keeps both in step, so older code
//                that spends s.stock.food directly still draws real items out of the store.
//  - world.drops: items lying on the ground (from possessed harvests, animals killed in the wild, felled trees, ruins...).
//                Haulers carry them to the nearest store.
import { ITEMS, CATS, CAT_DEFAULT, itemCat } from '../data/items.js';
import { DAY_LEN } from '../core/time.js';
import { dist } from '../core/util.js';

export function ensureItems(s) {
  if (!s.items) { s.items = {}; for (const c of CATS) if (s.stock[c] > 0) s.items[CAT_DEFAULT[c]] = s.stock[c]; }
  return s.items;
}
/** Put n units of an item in a settlement's store. */
export function addItem(s, id, n) {
  if (!(n > 0)) return; ensureItems(s);
  const c = itemCat(id);
  s.items[id] = (s.items[id] || 0) + n;
  s.stock[c] = (s.stock[c] || 0) + n;
}
/** Take up to n units of a category, drawing from the most plentiful items first. Returns [[item, amount], ...]. */
export function takeCat(s, cat, n) {
  ensureItems(s); const out = [];
  let left = Math.min(n, s.stock[cat] || 0);
  if (left <= 0) return out;
  const ids = Object.keys(s.items).filter((k) => itemCat(k) === cat && s.items[k] > 0).sort((a, b) => s.items[b] - s.items[a]);
  for (const id of ids) {
    if (left <= 1e-6) break;
    const k = Math.min(left, s.items[id]); s.items[id] -= k; left -= k; out.push([id, k]);
    if (s.items[id] <= 1e-6) delete s.items[id];
  }
  const got = out.reduce((a, [, k]) => a + k, 0);
  s.stock[cat] = Math.max(0, (s.stock[cat] || 0) - got);
  return out;
}
/** Reconcile the itemised store with the category totals (after code that edits s.stock directly). */
export function syncItems(s) {
  ensureItems(s);
  const sum = {};
  for (const [id, v] of Object.entries(s.items)) { if (!(v > 1e-6)) { delete s.items[id]; continue; } const c = itemCat(id); sum[c] = (sum[c] || 0) + v; }
  for (const c of CATS) {
    const want = Math.max(0, s.stock[c] || 0), have = sum[c] || 0, d = want - have;
    if (d > 0.01) s.items[CAT_DEFAULT[c]] = (s.items[CAT_DEFAULT[c]] || 0) + d;
    else if (d < -0.01) {
      let left = -d;
      const ids = Object.keys(s.items).filter((k) => itemCat(k) === c).sort((a, b) => s.items[b] - s.items[a]);
      for (const id of ids) { const k = Math.min(left, s.items[id]); s.items[id] -= k; left -= k; if (s.items[id] <= 1e-6) delete s.items[id]; if (left <= 1e-6) break; }
    }
  }
}
/** Top items of a store, largest first: [[id, amount], ...] */
export const topItems = (s, k = 6) => Object.entries(ensureItems(s)).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, k);

// ---------- ground drops ----------
export function dropItem(world, id, n, x, y) {
  if (!(n > 0) || !ITEMS[id]) return null;
  world.drops ||= {}; world.nextId.drop ||= 1;
  for (const d of Object.values(world.drops)) if (d.item === id && Math.abs(d.x - x) < 0.9 && Math.abs(d.y - y) < 0.9 && !d.claim) { d.n += n; d.t = world.time; return d; }
  const d = { id: world.nextId.drop++, item: id, n, x: x + (world.rng.next() - 0.5) * 0.5, y: y + (world.rng.next() - 0.5) * 0.4, t: world.time };
  world.drops[d.id] = d; return d;
}
/** Drops rot (food) or weather away (everything else) if nobody fetches them. */
export function stepDrops(world) {
  if (!world.drops) return;
  for (const d of Object.values(world.drops)) {
    const life = (itemCat(d.item) === 'food' || itemCat(d.item) === 'meals' ? 3 : 8) * DAY_LEN;
    if (world.time - d.t > life) delete world.drops[d.id];
    if (d.claim && !world.pawns[d.claim]?.job) d.claim = 0;
  }
}
/** Nearest unclaimed drop within r tiles of (x, y). */
export function nearestDrop(world, x, y, r) {
  let best = null, bd = r;
  for (const d of Object.values(world.drops || {})) { if (d.claim) continue; const dd = dist(d.x, d.y, x, y, world.W); if (dd < bd) { bd = dd; best = d; } }
  return best;
}
