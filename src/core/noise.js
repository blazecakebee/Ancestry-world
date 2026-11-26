// Seeded 3D Perlin noise. Sampling on a sphere gives seamless, wrap-around worlds.
import { RNG } from './rng.js';

export class Noise3 {
  constructor(seed) {
    const r = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    r.shuffle(p);
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static grad(h, x, y, z) {
    const g = h & 15, u = g < 8 ? x : y, v = g < 4 ? y : (g === 12 || g === 14 ? x : z);
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  }
  noise(x, y, z) {
    const P = this.perm;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = Noise3.fade(x), v = Noise3.fade(y), w = Noise3.fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    const g = Noise3.grad, l = (a, b, t) => a + t * (b - a);
    return l(l(l(g(P[AA], x, y, z), g(P[BA], x - 1, y, z), u), l(g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z), u), v),
      l(l(g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1), u), l(g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  fbm(x, y, z, oct = 5, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.noise(x * f, y * f, z * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  ridged(x, y, z, oct = 4) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(this.noise(x * f, y * f, z * f))); n += a; a *= 0.5; f *= 2.1; }
    return s / n;
  }
}
