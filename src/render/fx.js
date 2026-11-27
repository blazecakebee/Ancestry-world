// Particles & one-shot effects in world space (tile units). Rendered by the surface renderer.
import { iconCanvas } from './miscart.js';
import { spx } from './gandalf.js';
import { powerById } from '../data/powers.js';

/** Super Pixel Effects animation for a power: by id first, then by category. */
const SPX_BY_ID = { heal: 'spell_heal_001', cure: 'spell_heal_001', revive: 'spell_heal_001', inspire: 'round_sparkle_burst_001', harvest: 'round_sparkle_burst_002', tectonic: 'epic_explosion_001', lightning: 'lightning_strike_001', smite: 'lightning_burst_001', fireball: 'stylized_explosion_001', meteor: 'epic_explosion_002', plague: 'spell_poison_001', blight: 'status_poison_001' };
const SPX_BY_CAT = { nature: 'round_sparkle_burst_003', life: 'round_heart_burst_001', farm: 'round_light_burst_001', wild: 'round_light_burst_001', war: 'symmetrical_impact_001', curses: 'spell_death_001', world: 'scifi_spark_burst_001', divine: 'round_light_burst_001' };
export const spxForPower = (id) => { const P = powerById[id]; return SPX_BY_ID[id] || SPX_BY_CAT[P?.cat] || 'round_light_burst_001'; };

const POWER_COL = { inspire: '#ffe066', rain: '#7fc8ff', heal: '#ff7fa8', calm: '#b8f5ff', breeze: '#d8f5ff', omen: '#e0c0ff', harvest: '#ffd34d', revelation: '#c58cff', ore: '#ffe9a0', cure: '#9fffcf', valor: '#ff9a6a', fertility: '#ffb0d0', tectonic: '#c8a070', avatar: '#fff6b0', orbshield: '#7fe8ff', prophecy: '#ffe066' };

export class FX {
  constructor() { this.parts = []; this.rings = []; this.bolts = []; this.emotes = []; this.meteors = []; this.projectiles = []; this.anims = []; this.texts = []; this.shake = 0; this.flash = 0; this.max = 2500; }
  add(p) { if (this.parts.length < this.max) this.parts.push(p); }
  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 2) * (0.4 + Math.random());
      this.add({ x, y, z: opts.z ?? 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: (opts.up || 2) * (0.5 + Math.random()), life: (opts.life || 0.8) * (0.6 + Math.random() * 0.6), age: 0, col: Array.isArray(opts.col) ? opts.col[i % opts.col.length] : opts.col, size: opts.size || 1, grav: opts.grav ?? 6, kind: opts.kind || 'dot' });
    }
  }
  /** React to a simulation fx event. Returns ragdoll requests for the renderer. */
  handle(e, settings) {
    const shake = (settings?.shake ?? 100) / 100;
    switch (e.type) {
      case 'hit': this.burst(e.x, e.y, 5, { col: e.blood ? ['#c8283a', '#8e1a28'] : '#ddd', speed: 2.5, up: 2, life: 0.5 }); break;
      case 'chip': this.burst(e.x, e.y, 4, { col: e.res === 'wood' ? ['#a8774c', '#d9b07a'] : e.res === 'stone' ? ['#b8bcc8', '#6e7380'] : e.res === 'metal' ? ['#ffd34d', '#c0c4cc'] : ['#62c46a', '#e8484d'], speed: 1.6, up: 2.5, life: 0.5 }); break;
      case 'glitter': this.burst(e.x, e.y, 3 + (e.amount || 1), { col: ['#ffd34d', '#fff6b0', '#ffffff'], speed: 0.6, up: 1.6, grav: -0.8, life: 1.4, kind: 'spark' }); break;
      case 'steam': this.burst(e.x, e.y, 4, { col: '#e8eef4', speed: 0.5, up: 1.5, grav: -1, life: 1.2, size: 2, kind: 'puff' }); break;
      case 'built': this.burst(e.x, e.y, 18, { col: ['#e8d8b0', '#ffffff', '#ffd34d'], speed: 3, up: 3, life: 0.8, kind: 'puff' }); break;
      case 'lightning': this.bolts.push({ x: e.x + 0.5, y: e.y + 0.5, age: 0, life: 0.35, seed: Math.random() }); { const now = performance.now(); if (now - (this._lf || 0) > 6000) { this._lf = now; this.flash = Math.max(this.flash, 0.16 * Math.min(1, shake)); } } this.burst(e.x + 0.5, e.y + 0.5, 10, { col: ['#fff6b0', '#ffffff'], speed: 4, up: 3, life: 0.4, kind: 'spark' }); break;
      case 'meteor': this.meteors.push({ x: e.x + 0.5, y: e.y + 0.5, age: 0, life: 1.2, scale: e.scale || 1, shielded: e.shielded }); break;
      case 'quake': this.shake = Math.max(this.shake, (e.mag || 0.6) * 14 * shake); break;
      case 'eruption': this.burst(e.x, e.y, 60, { col: ['#ff6a1a', '#ffb347', '#4a3a36'], speed: 4, up: 8, life: 1.8, size: 2 }); this.shake = Math.max(this.shake, 10 * shake); break;
      case 'projectile': this.projectiles.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, age: 0, life: 0.18, era: e.era }); break;
      case 'emote': this.emotes.push({ pid: e.pid, icon: e.icon, age: 0, life: 1.6 }); break;
      case 'power': {
        const col = powerById[e.power]?.color || POWER_COL[e.power] || '#ffd34d', an = spx(spxForPower(e.power));
        if (an) this.anims.push({ x: e.x, y: e.y, an, age: 0, life: an.frames.length / an.fps, sc: Math.max(1.5, Math.min(5, (e.r || 2) * 0.9)) });
        this.rings.push({ x: e.x, y: e.y, r: e.r || 2, age: 0, life: 1.4, col });
        this.burst(e.x, e.y, 40, { col: [col, '#ffffff', '#ffd34d'], speed: 2.5, up: 4, grav: -0.5, life: 1.8, kind: 'spark' });
        if (e.power === 'tectonic') this.shake = Math.max(this.shake, 8 * shake);
        this.flash = Math.max(this.flash, 0.05 * Math.min(1, shake));
        break;
      }
      case 'era': this.texts.push({ text: e.label || 'A new era dawns', age: 0, life: 4, nationId: e.nationId, big: true }); break;
      case 'founded': case 'conquest': this.rings.push({ x: e.x, y: e.y, r: 8, age: 0, life: 2, col: e.type === 'conquest' ? '#ff5a5a' : '#ffd34d' }); break;
      case 'launch': this.burst(e.x, e.y - 2, 50, { col: ['#ffffff', '#ffb347', '#ff6a1a'], speed: 1.5, up: 12, grav: 2, life: 2.2, size: 2, kind: 'puff' }); break;
      case 'aurora': this.texts.push({ aurora: true, age: 0, life: 6 }); break;
      case 'flare': this.flash = Math.max(this.flash, 0.5 * shake); break;
    }
  }
  step(dt) {
    for (const p of this.parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.grav * dt; p.z += p.vz * dt; if (p.z < 0 && p.grav > 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; } }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const k of ['rings', 'bolts', 'emotes', 'meteors', 'projectiles', 'anims', 'texts']) { for (const e of this[k]) e.age += dt; this[k] = this[k].filter((e) => e.age < e.life); }
    this.shake *= Math.pow(0.02, dt); if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 1.8);
  }
  /** ctx is set up so that worldToScreen(x,y) maps tiles -> px. */
  draw(ctx, cam, ws) {
    const T = cam.zoom;
    for (const p of this.parts) {
      const [sx, sy] = ws(p.x, p.y); const a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.col;
      const s = Math.max(1, Math.round(T / 16 * p.size * (p.kind === 'puff' ? 1 + p.age * 2 : 1)));
      if (p.kind === 'spark' && Math.random() < 0.3) ctx.fillRect(sx - s, sy - p.z * T, s * 3, s / 1.5);
      ctx.fillRect(Math.round(sx), Math.round(sy - p.z * T * 0.5), s, s);
    }
    ctx.globalAlpha = 1;
    for (const a of this.anims) {
      const [sx, sy] = ws(a.x, a.y), fr = a.an.frames[Math.min(a.an.frames.length - 1, Math.floor(a.age * a.an.fps))], z = a.sc * T / 16;
      ctx.imageSmoothingEnabled = false; ctx.drawImage(a.an.im, fr[0], fr[1], fr[2], fr[3], Math.round(sx - fr[2] * z / 2), Math.round(sy - fr[3] * z * 0.7), fr[2] * z, fr[3] * z);
    }
    for (const r of this.rings) {
      const [sx, sy] = ws(r.x, r.y), t = r.age / r.life;
      ctx.strokeStyle = r.col; ctx.globalAlpha = 1 - t; ctx.lineWidth = Math.max(2, T / 8);
      ctx.beginPath(); ctx.ellipse(sx, sy, r.r * T * (0.3 + t), r.r * T * 0.5 * (0.3 + t), 0, 0, Math.PI * 2); ctx.stroke();
      const g = ctx.createRadialGradient(sx, sy - T * 2, 0, sx, sy - T * 2, T * 3);
      g.addColorStop(0, r.col); g.addColorStop(1, 'transparent');
      ctx.globalAlpha = (1 - t) * 0.5; ctx.fillStyle = g; ctx.fillRect(sx - T * 3, sy - T * 5, T * 6, T * 6);
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) {
      const [sx, sy] = ws(b.x, b.y);
      ctx.strokeStyle = `rgba(255,250,210,${1 - b.age / b.life})`; ctx.lineWidth = Math.max(2, T / 10);
      ctx.beginPath(); let x = sx, y = sy - 900; ctx.moveTo(x, y);
      let r = b.seed * 1000;
      while (y < sy) { r = (r * 9301 + 49297) % 233280; x += (r / 233280 - 0.5) * T * 1.5; y += T * 0.8; ctx.lineTo(x, Math.min(y, sy)); }
      ctx.stroke();
    }
    for (const m of this.meteors) {
      const t = m.age / m.life, [sx, sy] = ws(m.x, m.y);
      if (t < 0.7) {
        const k = t / 0.7, mx = sx + (1 - k) * 400, my = sy - (1 - k) * 700;
        ctx.strokeStyle = 'rgba(255,170,80,0.7)'; ctx.lineWidth = T * 0.4 * m.scale; ctx.beginPath(); ctx.moveTo(mx + 60, my - 100); ctx.lineTo(mx, my); ctx.stroke();
        ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(mx, my, T * 0.35 * m.scale, 0, 7); ctx.fill();
        if (m.shielded && k > 0.85) { ctx.strokeStyle = 'rgba(127,232,240,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, T * 6, Math.PI, 0); ctx.stroke(); }
      } else if (!m.done) { m.done = true; if (!m.shielded) { this.burst(m.x, m.y, 50, { col: ['#ff6a1a', '#ffd34d', '#4a3a36', '#ffffff'], speed: 5, up: 6, life: 1.4, size: 2 }); this.shake = Math.max(this.shake, 12); this.flash = 0.2; } }
    }
    for (const pr of this.projectiles) {
      const t = pr.age / pr.life, [ax, ay] = ws(pr.x, pr.y), [bx, by] = ws(pr.tx, pr.ty);
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t - Math.sin(t * Math.PI) * (pr.era < 5 ? T * 0.8 : 0);
      ctx.fillStyle = pr.era >= 8 ? '#7fe8f0' : pr.era >= 5 ? '#fff6b0' : '#8a6a4a';
      ctx.fillRect(x - 1, y - 1, Math.max(2, T / 12), Math.max(2, T / 12));
    }
  }
  drawEmote(ctx, e, sx, sy, T) {
    const t = e.age / e.life, s = Math.max(1, Math.round(T / 16));
    const ic = iconCanvas(e.icon in ICON_ALIAS ? ICON_ALIAS[e.icon] : e.icon, s);
    const bob = Math.sin(e.age * 6) * 2;
    ctx.globalAlpha = t > 0.8 ? (1 - t) * 5 : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const w = ic.width + 6;
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - ic.height - 10 + bob, w, ic.height + 6, 4); ctx.fill();
    ctx.drawImage(ic, sx - ic.width / 2, sy - ic.height - 7 + bob);
    ctx.globalAlpha = 1;
  }
}
const ICON_ALIAS = { baby: 'baby', storm: 'storm', angry: 'angry', love: 'love', ring: 'ring', chat: 'chat', chat2: 'chat2', heart: 'heart', bulb: 'bulb', shirt: 'shirt' };
