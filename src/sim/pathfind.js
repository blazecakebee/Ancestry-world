// A* on the wrap-around tile grid with a node budget. Shallow water and rivers are wadeable (slow).
import { BIOMES, F } from '../data/biomes.js';
import { wrap } from '../core/util.js';

class Heap {
  constructor() { this.a = []; this.p = []; }
  push(v, pr) { const a = this.a, p = this.p; a.push(v); p.push(pr); let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= pr) break; a[i] = a[j]; p[i] = p[j]; i = j; } a[i] = v; p[i] = pr; }
  pop() { const a = this.a, p = this.p, top = a[0], lv = a.pop(), lp = p.pop(); if (a.length) { let i = 0; const n = a.length;
      while (true) { let l = 2 * i + 1, r = l + 1, m = i, mp = lp; if (l < n && p[l] < mp) { m = l; mp = p[l]; } if (r < n && p[r] < mp) { m = r; mp = p[r]; } if (m === i) break; a[i] = a[m]; p[i] = p[m]; i = m; }
      a[i] = lv; p[i] = lp; } return top; }
  get size() { return this.a.length; }
}

/** boat: 0 = on foot only, 1 = canoes (lakes & seas, slowish), 2 = sailing ships (fast). */
export function tileCost(t, i, boat = 0) {
  const bm = BIOMES[t.biome[i]];
  if (boat && bm.water) return boat >= 2 ? 0.7 : 1.15; // paddle or sail across open water
  let c = bm.cost;
  if (t.river[i]) c = Math.max(c, 3);
  if (c === 0) return 0;
  if (t.feat[i] === F.TREE) c += 0.6;
  if (t.feat[i] === F.ROAD) c *= 0.5;
  if (t.water[i] > 0.4) c += 2;
  return c;
}

const gScore = new Map();
const came = new Map();
export function findPath(t, sx, sy, gx, gy, maxNodes = 2500, boat = 0) {
  const { W, H } = t;
  sx = wrap(Math.floor(sx), W); sy = Math.floor(sy); gx = wrap(Math.floor(gx), W); gy = Math.floor(gy);
  const start = sy * W + sx, goal = gy * W + gx;
  if (start === goal) return [];
  if (tileCost(t, goal, boat) === 0) return null;
  const h = (i) => { const x = i % W, y = (i / W) | 0; let d = Math.abs(x - gx); if (d > W / 2) d = W - d; return (d + Math.abs(y - gy)) * 0.95; };
  gScore.clear(); came.clear();
  const open = new Heap(); open.push(start, h(start)); gScore.set(start, 0);
  let n = 0, best = start, bestH = h(start);
  while (open.size && n++ < maxNodes) {
    const cur = open.pop();
    if (cur === goal) { best = cur; break; }
    const cx = cur % W, cy = (cur / W) | 0, g = gScore.get(cur);
    for (let k = 0; k < 8; k++) {
      const ox = [1, -1, 0, 0, 1, 1, -1, -1][k], oy = [0, 0, 1, -1, 1, -1, 1, -1][k];
      const ny = cy + oy; if (ny < 0 || ny >= H) continue;
      const nb = ny * W + wrap(cx + ox, W);
      const c = tileCost(t, nb, boat); if (c === 0) continue;
      if (k >= 4 && (tileCost(t, cy * W + wrap(cx + ox, W), boat) === 0 || tileCost(t, ny * W + cx, boat) === 0)) continue; // no corner cutting
      const ng = g + c * (k >= 4 ? 1.414 : 1);
      if (ng < (gScore.get(nb) ?? Infinity)) {
        gScore.set(nb, ng); came.set(nb, cur);
        const hh = h(nb); open.push(nb, ng + hh);
        if (hh < bestH) { bestH = hh; best = nb; }
      }
    }
  }
  if (best === start) return null;
  const path = []; let c = best;
  while (c !== start && c !== undefined) { path.push(c); c = came.get(c); }
  path.reverse();
  return path; // list of tile indices (may end short of goal if budget ran out)
}
