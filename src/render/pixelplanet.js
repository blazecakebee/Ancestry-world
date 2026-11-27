// Pixel moon / rocky-planet generator, ported from Deep-Fold's PixelPlanets (MIT, see assets/packs/pixelplanets).
// Ports the NoAtmosphere ground + Craters shaders to plain canvas code. Output is a small square canvas that is scaled up un-smoothed.
import { makeCanvas } from './pixel.js';

const fract = (x) => x - Math.floor(x);
const mod = (a, b) => a - b * Math.floor(a / b);
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

function mkNoise(size, seed) {
  const S = Math.round(size);
  const rand = (x, y) => fract(Math.sin(mod(x, S) * 12.9898 + mod(y, S) * 78.233) * 15.5453 * seed);
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = rand(ix, iy), b = rand(ix + 1, iy), c = rand(ix, iy + 1), d = rand(ix + 1, iy + 1);
    const cx = fx * fx * (3 - 2 * fx), cy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * cx + (c - a) * cy * (1 - cx) + (d - b) * cx * cy;
  };
  const fbm = (x, y, oct) => { let v = 0, sc = 0.5; for (let i = 0; i < oct; i++) { v += noise(x, y) * sc; x *= 2; y *= 2; sc *= 0.5; } return v; };
  return { rand, fbm };
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rot = (x, y, a) => { x -= 0.5; y -= 0.5; return [x * Math.cos(a) + y * Math.sin(a) + 0.5, -x * Math.sin(a) + y * Math.cos(a) + 0.5]; };
const sphere = (x, y) => { const cx = x * 2 - 1, cy = y * 2 - 1, z = Math.sqrt(Math.max(0, 1 - cx * cx - cy * cy)); return [(cx / (z + 1)) * 0.5 + 0.5, (cy / (z + 1)) * 0.5 + 0.5]; };

const MOON = { ground: [hex(0xa3a7c2), hex(0x4c6885), hex(0x3a3f5e)], crater: [hex(0x4c6885), hex(0x3a3f5e)] };

/** Render a moon. px = pixel resolution (e.g. 64), t = time in seconds, light = [x,y] in 0..1 toward the sun. */
export function renderMoon(canvas, px = 64, t = 0, light = [0.72, 0.26], seed = 1.012) {
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(px, px), d = img.data;
  const g = mkNoise(8, seed), cr = mkNoise(5, 4.517), cols = MOON.ground, ccol = MOON.crater;
  const dither = 2 / px, lb1 = 0.615, lb2 = 0.729, ts = 0.4;
  const circleNoise = (ux, uy) => {
    const iy = Math.floor(uy); ux += iy * 0.31; const fx = fract(ux), fy = fract(uy);
    const h = cr.rand(Math.floor(ux), iy), m = Math.hypot(fx - 0.25 - h * 0.5, fy - 0.25 - h * 0.5), r = h * 0.25;
    return smoothstep(r - 0.1 * r, r, m);
  };
  const crater = (ux, uy) => { let c = 1; for (let i = 0; i < 2; i++) c *= circleNoise(ux * 5 + (i + 1) + 10 + t * 0.001, uy * 5 + (i + 1) + 10); return 1 - c; };
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    let ux = Math.floor(i) / px, uy = Math.floor(j) / px;
    const dc = Math.hypot(ux - 0.5, uy - 0.5); if (dc > 0.49999) continue;
    let dl = Math.hypot(ux - light[0], uy - light[1]);
    const dith = mod(ux + (i + 0.5) / px * 0 + (j + 0.5) / px, 2 / px) <= 1 / px;
    const [rx, ry] = rot(ux, uy, 0), [sx, sy] = sphere(rx, ry);
    const f1 = g.fbm(sx, sy, 4);
    dl += g.fbm(sx * 8 + f1 + t * ts * 0.02, sy * 8 + f1, 4) * 0.3;
    let col = cols[0];
    if (dl > lb1) { col = cols[1]; if (dl < lb1 + dither && dith) col = cols[0]; }
    if (dl > lb2) { col = cols[2]; if (dl < lb2 + dither && dith) col = cols[1]; }
    // craters, lit/shaded like the original
    const c1 = crater(sx, sy), c2 = crater(sx + (light[0] - 0.5) * 0.03, sy + (light[1] - 0.5) * 0.03);
    if (c1 >= 0.5) { col = ccol[0]; const dl2 = Math.hypot(ux - light[0], uy - light[1]); if (c2 < c1 - (0.5 - dl2) * 2 || dl2 > 0.465) col = ccol[1]; }
    const k = (j * px + i) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return canvas;
}

let moonCv = null, moonT = -9;
/** Cached moon canvas, refreshed a few times a second. */
export function moonSprite(t) {
  if (!moonCv) moonCv = makeCanvas(64, 64);
  if (Math.abs(t - moonT) > 0.4 || moonT < 0) { renderMoon(moonCv, 64, t * 30); moonT = t; }
  return moonCv;
}
