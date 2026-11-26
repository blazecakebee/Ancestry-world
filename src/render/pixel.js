// Tiny pixel buffer used to paint every procedural sprite (characters, buildings, tiles, icons).
export const rgba = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const C = (arr, a = 255) => rgba(arr[0], arr[1], arr[2], a);
export const unpack = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
export const shadeC = (c, f) => { const [r, g, b, a] = unpack(c); return rgba(Math.min(255, r * f) | 0, Math.min(255, g * f) | 0, Math.min(255, b * f) | 0, a); };
export const mixC = (c1, c2, t) => { const a = unpack(c1), b = unpack(c2); return rgba((a[0] + (b[0] - a[0]) * t) | 0, (a[1] + (b[1] - a[1]) * t) | 0, (a[2] + (b[2] - a[2]) * t) | 0, (a[3] + (b[3] - a[3]) * t) | 0); };
export const hexC = (h, a = 255) => { h = h.replace('#', ''); return rgba(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a); };

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export class PixBuf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
  set(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && c) this.d[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  hline(x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  /** Paint over only already-opaque pixels (for shading clothes etc). */
  paintIf(x, y, c) { if (this.get(x, y)) this.set(x, y, c); }
  /** Dark outline around the silhouette (the chunky look of the reference art). */
  outline(col = rgba(24, 18, 30), tint = 0.25) {
    const { w, h, d } = this, out = new Uint32Array(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[y * w + x]) continue;
      let n = 0;
      if (x > 0 && d[y * w + x - 1]) n = d[y * w + x - 1]; else if (x < w - 1 && d[y * w + x + 1]) n = d[y * w + x + 1];
      else if (y > 0 && d[(y - 1) * w + x]) n = d[(y - 1) * w + x]; else if (y < h - 1 && d[(y + 1) * w + x]) n = d[(y + 1) * w + x];
      if (n) out[y * w + x] = mixC(col, shadeC(n, 0.5), tint);
    }
    this.d = out;
  }
  flipX() { const { w, h, d } = this, o = new Uint32Array(d.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + (w - 1 - x)] = d[y * w + x]; this.d = o; }
  blit(src, ox, oy) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.d[y * src.w + x]; if (c >>> 24) this.set(ox + x, oy + y, c); } }
  toCanvas(canvas = null, ox = 0, oy = 0) {
    canvas = canvas || makeCanvas(this.w, this.h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    ctx.putImageData(img, ox, oy);
    return canvas;
  }
}
