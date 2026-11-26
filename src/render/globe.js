// Pixel-art orthographic globe + outer-space layer (stars, sun, moon, satellites, stations, arks).
import { makeCanvas } from './pixel.js';
import { sunPosition } from '../world/atmosphere.js';
import { spaceSprite } from './miscart.js';

export class Globe {
  constructor() { this.D = 0; this.lat0 = 99; this.canvas = null; this.stars = null; }
  ensure(D, lat0) {
    if (D === this.D && Math.abs(lat0 - this.lat0) < 0.004) return;
    this.D = D; this.lat0 = lat0;
    this.canvas = makeCanvas(D, D); this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(D, D); this.buf = new Uint32Array(this.img.data.buffer);
    const N = D * D; this.lat = new Float32Array(N); this.dlon = new Float32Array(N); this.limb = new Float32Array(N); this.inside = new Uint8Array(N);
    const sl = Math.sin(lat0), cl = Math.cos(lat0), r = D / 2;
    for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
      const x = (i + 0.5 - r) / r, y = -(j + 0.5 - r) / r, rho = Math.hypot(x, y), k = j * D + i;
      if (rho > 1) continue;
      const c = Math.asin(Math.min(1, rho)), sc = Math.sin(c), cc = Math.cos(c);
      this.inside[k] = 1;
      this.lat[k] = rho < 1e-9 ? lat0 : Math.asin(cc * sl + (y * sc * cl) / rho);
      this.dlon[k] = Math.atan2(x * sc, rho * cc * cl - y * sc * sl);
      this.limb[k] = Math.sqrt(1 - rho * rho);
    }
  }
  /** Render the planet. mapBuf: Uint32 W*H colours. Returns the canvas (D x D). */
  render(world, mapBuf, ownerBuf, lon0, lat0, D, opts = {}) {
    this.ensure(D, lat0);
    const { W, H, atmo } = world, buf = this.buf, N = D * D;
    const sun = sunPosition(world.time, world.yearLen);
    const ssl = Math.sin(sun.lat), csl = Math.cos(sun.lat);
    const showClouds = opts.clouds !== false, borders = opts.borders;
    const GW = atmo.GW, GH = atmo.GH;
    for (let k = 0; k < N; k++) {
      if (!this.inside[k]) { buf[k] = 0; continue; }
      const lat = this.lat[k];
      let lon = lon0 + this.dlon[k];
      lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const tx = Math.min(W - 1, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * W)), ty = Math.min(H - 1, Math.max(0, Math.floor(((Math.PI / 2 - lat) / Math.PI) * H)));
      const ti = ty * W + tx;
      let c = mapBuf[ti];
      let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
      if (borders && ownerBuf) { const o = ownerBuf[ti]; if (o >>> 24) { const a = (o >>> 24) / 255 * 0.8; r += (((o) & 255) - r) * a; g += (((o >>> 8) & 255) - g) * a; b += (((o >>> 16) & 255) - b) * a; } }
      // clouds
      if (showClouds) {
        const ci = Math.min(GH - 1, Math.floor(ty / 8)) * GW + Math.floor(tx / 8);
        const cl = atmo.cloud[ci] * 0.85 + (atmo.storm[ci] === 3 ? 0.3 : 0);
        if (cl > 0.05) { const a = Math.min(0.9, cl); r += (245 - r) * a; g += (248 - g) * a; b += (252 - b) * a; }
        const sn = atmo.snow[ci]; if (sn > 0.1 && c !== mapBuf[0] - 1) { const a = sn * 0.6; r += (240 - r) * a; g += (244 - g) * a; b += (250 - b) * a; }
      }
      // day / night + city lights
      const cz = Math.sin(lat) * ssl + Math.cos(lat) * csl * Math.cos(lon - sun.lon);
      const day = Math.max(0, Math.min(1, cz * 3 + 0.35));
      const limb = 0.55 + 0.45 * this.limb[k];
      let f = (0.22 + 0.78 * day) * limb;
      r *= f; g *= f; b *= f * (1 + (1 - day) * 0.25);
      if (day < 0.5 && ownerBuf && (ownerBuf[ti] & 0x1)) { const L = (1 - day * 2) * 0.8; r += 255 * L * 0.9; g += 200 * L * 0.8; b += 90 * L * 0.4; }
      buf[k] = (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
    }
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
  starfield(w, h) {
    if (this.stars && this.stars.width === w && this.stars.height === h) return this.stars;
    const c = makeCanvas(w, h), x = c.getContext('2d');
    const g = x.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#0d1230'); g.addColorStop(1, '#03040c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (w * h) / 900; i++) { const b = rnd(); x.fillStyle = b > 0.97 ? '#ffe9b0' : b > 0.9 ? '#b8d0ff' : `rgba(255,255,255,${0.3 + rnd() * 0.6})`; const z = rnd() > 0.96 ? 2 : 1; x.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), z, z); }
    for (let k = 0; k < 3; k++) { const cx = rnd() * w, cy = rnd() * h, rr = 120 + rnd() * 200, gg = x.createRadialGradient(cx, cy, 0, cx, cy, rr); gg.addColorStop(0, ['rgba(120,80,200,0.10)', 'rgba(60,120,200,0.09)', 'rgba(200,90,140,0.07)'][k]); gg.addColorStop(1, 'transparent'); x.fillStyle = gg; x.fillRect(0, 0, w, h); }
    this.stars = c; return c;
  }
  /** Draw orbiting objects (behind = true for the far side pass). */
  drawOrbiters(ctx, world, cx, cy, R, behind) {
    const t = world.time;
    // moon
    const ma = (t / 27) * Math.PI * 2, mx = Math.cos(ma) * R * 2.6, my = Math.sin(ma) * R * 0.5, mBehind = Math.sin(ma) < 0;
    if (mBehind === behind) {
      const mr = Math.max(3, R * 0.27);
      ctx.fillStyle = '#c9c6bd'; ctx.beginPath(); ctx.arc(cx + mx, cy + my, mr, 0, 7); ctx.fill();
      ctx.fillStyle = '#a9a69d'; for (const [ox, oy, rr] of [[-0.3, -0.2, 0.25], [0.35, 0.25, 0.18], [0.1, 0.45, 0.12]]) { ctx.beginPath(); ctx.arc(cx + mx + ox * mr, cy + my + oy * mr, rr * mr, 0, 7); ctx.fill(); }
      const bases = world.space.filter((o) => o.type === 'moonbase').length;
      for (let k = 0; k < bases; k++) { ctx.fillStyle = '#fff2a8'; ctx.fillRect(cx + mx - mr * 0.4 + k * mr * 0.5, cy + my + mr * 0.1, 2, 2); }
    }
    for (const o of world.space) {
      if (o.type === 'moonbase') continue;
      const sp = o.type === 'ark' ? 0 : 1 / (o.orbit * o.orbit);
      let a = o.phase + t * sp * 2.2, r = R * o.orbit;
      if (o.type === 'ark') { r = R * (1.6 + (t - o.launched) * 0.4); a = o.phase; }
      const x = Math.cos(a) * r, y = Math.sin(a) * r * (0.25 + o.incl * 0.3);
      if ((Math.sin(a) < 0) !== behind) continue;
      if (o.type === 'ark' && r > R * 12) continue;
      const img = spaceSprite(o.type), s = Math.max(1, Math.round(R / 120));
      ctx.drawImage(img, Math.round(cx + x - 8 * s), Math.round(cy + y - 8 * s), 16 * s, 16 * s);
    }
  }
}
