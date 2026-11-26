// Shared helpers. Everything in src/core, src/data, src/world and src/sim is DOM-free
// so the simulation can run headless in Node for tests.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const wrap = (v, n) => ((v % n) + n) % n;

/** Shortest signed horizontal delta on a wrap-around map of width W. */
export function dx(a, b, W) { let d = b - a; if (d > W / 2) d -= W; else if (d < -W / 2) d += W; return d; }
export function dist(ax, ay, bx, by, W) { const x = dx(ax, bx, W), y = by - ay; return Math.hypot(x, y); }

export class EventBus {
  constructor() { this.h = new Map(); }
  on(ev, fn) { if (!this.h.has(ev)) this.h.set(ev, new Set()); this.h.get(ev).add(fn); return () => this.h.get(ev).delete(fn); }
  emit(ev, data) { const s = this.h.get(ev); if (s) for (const fn of s) fn(data); const all = this.h.get('*'); if (all) for (const fn of all) fn(ev, data); }
}

export function fmtNum(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
export const rgbStr = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
export const shade = (c, f) => [clamp(Math.round(c[0] * f), 0, 255), clamp(Math.round(c[1] * f), 0, 255), clamp(Math.round(c[2] * f), 0, 255)];
export const mix = (a, b, t) => [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
export const hex = (s) => { s = s.replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
