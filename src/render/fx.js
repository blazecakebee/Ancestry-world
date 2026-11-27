// Particles & one-shot effects in world space (tile units). Rendered by the surface renderer.
import { iconCanvas } from './miscart.js';
import { spx } from './gandalf.js';
import { powerById } from '../data/powers.js';
import { POWER_FX } from '../data/powerfx.js';

// Tiny pixel glyphs (5x5) for themed particles.
const G = {
  heart: ['01010', '11111', '11111', '01110', '00100'], star: ['00100', '01110', '11111', '01110', '01010'], note: ['00110', '00101', '00100', '11100', '11100'],
  leaf: ['00011', '00111', '01110', '11100', '10000'], drop: ['00100', '01110', '01110', '11111', '01110'], flake: ['10101', '01110', '11111', '01110', '10101'],
  plus: ['00100', '00100', '11111', '00100', '00100'], z: ['11111', '00010', '00100', '01000', '11111'], hex: ['01110', '10001', '10001', '10001', '01110'],
  bulb: ['01110', '11111', '11111', '01110', '00100'], eye: ['00000', '01110', '11011', '01110', '00000'], crown: ['10101', '11111', '11111', '11111', '00000'],
  skull: ['01110', '11111', '10101', '11111', '01010'], bug: ['10001', '01110', '11111', '01110', '10001'], paw: ['10101', '00000', '01110', '11111', '01110'],
  feather: ['00001', '00011', '00110', '01100', '11000'], sword: ['00001', '00010', '10100', '01000', '10100'], rune: ['11100', '10100', '11111', '00101', '00111'],
  fish: ['00000', '10110', '11111', '10110', '00000'], swirl: ['01110', '10001', '10101', '10011', '01100'], log: ['00000', '11111', '11111', '11111', '00000'],
  dot: ['00000', '01110', '01110', '01110', '00000'], dove: ['00000', '11011', '01110', '00100', '00000'], banner: ['11111', '11111', '11110', '10000', '10000'],
};
// Particle presets: [colours, glyph|null, motion, count]. motion: burst | rise | fall | swirl | ring | pillar | drift
const PRESETS = {
  bulbs: [['#ffe066', '#fff6b0'], 'bulb', 'rise', 10], eyes: [['#e0c0ff', '#ffffff'], 'eye', 'swirl', 10], glow: [['#fff6c0', '#ffe9a0', '#ffffff'], null, 'rise', 40],
  notes: [['#ffd8a0', '#ffffff', '#ffb0e8'], 'note', 'rise', 14], notes2: [['#e8d0a0', '#c8b070'], 'note', 'ring', 12], embers: [['#ff8a3c', '#ffd34d', '#ff4a1a'], null, 'rise', 50],
  planks: [['#c89a5a', '#a8774c'], 'log', 'burst', 14], runes: [['#d58cff', '#a8e0ff', '#ffffff'], 'rune', 'swirl', 14], shards: [['#c9d2dc', '#ffffff', '#8a97a8'], 'sword', 'burst', 12],
  pillar: [['#fff2a8', '#ffffff'], null, 'pillar', 60], crowns: [['#ffd34d', '#fff6b0'], 'crown', 'rise', 10], stars: [['#ffffff', '#ffe066', '#ffd0f0'], 'star', 'burst', 22],
  drops: [['#7fc8ff', '#b8e4ff', '#ffffff'], 'drop', 'fall', 40], leaves: [['#62c46a', '#8fe39a', '#3f9a4a'], 'leaf', 'drift', 24], leaves2: [['#2f8a3a', '#4fb35a', '#9fe08a'], 'leaf', 'burst', 30],
  petals: [['#ff9ad0', '#ffd0e8', '#ffffff'], 'leaf', 'drift', 30], flakes: [['#ffffff', '#dff3ff'], 'flake', 'fall', 40], rays: [['#fff0a0', '#ffffff'], null, 'pillar', 40],
  frost: [['#a8dcff', '#ffffff', '#dff3ff'], 'flake', 'ring', 24], steam: [['#e8eef4', '#ffffff'], null, 'rise', 30], sparks: [['#fff6b0', '#ffffff', '#a8c8ff'], null, 'burst', 50],
  prism: [['#ff6a6a', '#ffb347', '#ffe066', '#6fe07a', '#6fb8ff', '#b88aff'], 'star', 'swirl', 24], grain: [['#ffd34d', '#e8b84a'], 'dot', 'burst', 30], dust: [['#c8a878', '#a88a5a', '#e0d0b0'], null, 'ring', 50],
  seeds: [['#a07a3a', '#d9a63a', '#6a8a3a'], 'dot', 'fall', 30], bubbles: [['#7fd0b0', '#c8f0e0'], 'hex', 'rise', 16], logs: [['#a8774c', '#d9b07a', '#6e4a2a'], 'log', 'fall', 12],
  hearts: [['#ff6a8a', '#ffb0c0', '#ffffff'], 'heart', 'rise', 14], hearts2: [['#ff3a5a', '#ff8aa0'], 'heart', 'burst', 18], doves: [['#ffffff', '#e8f4ff'], 'dove', 'rise', 10],
  hexes: [['#7fb8ff', '#c8e4ff'], 'hex', 'ring', 16], hexes2: [['#7fe8ff', '#ffffff'], 'hex', 'swirl', 24], streaks: [['#ffe9a0', '#ffffff'], null, 'drift', 40],
  herbs: [['#46c7a8', '#9fffcf', '#2f8a6a'], 'leaf', 'rise', 20], zzz: [['#c8d0ff', '#ffffff'], 'z', 'rise', 10], bubbles2: [['#9fffcf', '#ffffff'], 'dot', 'rise', 24],
  plus: [['#ff9ab8', '#ffffff'], 'plus', 'rise', 14], food: [['#ffb347', '#e8484d', '#ffd34d'], 'dot', 'fall', 24], bread: [['#e8c08a', '#ffe0b0', '#c8945a'], 'log', 'fall', 20],
  paws: [['#c8a070', '#8a6a4a'], 'paw', 'ring', 8], wool: [['#ffffff', '#f2eee2', '#e0dccc'], null, 'fall', 30], grassbits: [['#8fe39a', '#62c46a'], null, 'burst', 30],
  mud: [['#8a6a4a', '#6e4a2a'], null, 'burst', 30], pebbles: [['#a7a9b3', '#6e7380', '#d0d2da'], 'dot', 'burst', 20], feathers: [['#ffffff', '#e0a060'], 'feather', 'drift', 14],
  feathers2: [['#9cc8a8', '#ffffff', '#3f6a4a'], 'feather', 'drift', 14], fish: [['#6fc8ff', '#c0e8ff', '#ff9a6a'], 'fish', 'burst', 10], goo: [['#62e06a', '#a8ff9a'], 'dot', 'burst', 20],
  goo2: [['#5fa8ff', '#b8dcff'], 'dot', 'burst', 20], goo3: [['#ff5a5a', '#ffaaaa'], 'dot', 'burst', 20], motes: [['#bff0ff', '#ffffff', '#7fffd0'], null, 'swirl', 30],
  meat: [['#d0603c', '#e8a080'], 'dot', 'fall', 14], swords: [['#ff9a6a', '#ffffff'], 'sword', 'rise', 10], banners: [['#ffd34d', '#ff7a4a'], 'banner', 'rise', 8],
  shadow: [['#4a3a6a', '#8a6aaa', '#20182a'], null, 'swirl', 40], rings: [['#d0d8ff', '#ffffff'], null, 'ring', 60], flames: [['#ff6a1a', '#ffb347', '#ffe066'], null, 'rise', 60],
  ash: [['#6a6a5a', '#8a7a3a', '#3a3a30'], null, 'fall', 40], bugs: [['#a8a040', '#6a6a20'], 'bug', 'swirl', 24], skulls: [['#d8d0e8', '#8a6aaa'], 'skull', 'rise', 8],
  miasma: [['#7ab050', '#4a7a30', '#b0e080'], null, 'swirl', 40], heat: [['#ff9a4a', '#ffd34d'], null, 'rise', 40], acid: [['#b0e050', '#e0ff80'], 'drop', 'fall', 40],
  swirl: [['#c04a6a', '#ff9ab8'], 'swirl', 'swirl', 12], gems: [['#ffe9a0', '#7fe8ff', '#ff9ad0'], 'star', 'burst', 20], sand: [['#e8d890', '#c8b870'], null, 'burst', 40],
};

/** Super Pixel Effects animation for a power: by id first, then by category. */
const SPX_BY_ID = { heal: 'spell_heal_001', cure: 'spell_heal_001', revive: 'spell_heal_001', inspire: 'round_sparkle_burst_001', harvest: 'round_sparkle_burst_002', tectonic: 'epic_explosion_001', lightning: 'lightning_strike_001', smite: 'lightning_burst_001', fireball: 'stylized_explosion_001', meteor: 'epic_explosion_002', plague: 'spell_poison_001', blight: 'status_poison_001' };
const SPX_BY_CAT = { nature: 'round_sparkle_burst_003', life: 'round_heart_burst_001', farm: 'round_light_burst_001', wild: 'round_light_burst_001', war: 'symmetrical_impact_001', curses: 'spell_death_001', world: 'scifi_spark_burst_001', divine: 'round_light_burst_001' };
export const spxForPower = (id) => { const P = powerById[id]; return SPX_BY_ID[id] || SPX_BY_CAT[P?.cat] || 'round_light_burst_001'; };

const POWER_COL = { inspire: '#ffe066', rain: '#7fc8ff', heal: '#ff7fa8', calm: '#b8f5ff', breeze: '#d8f5ff', omen: '#e0c0ff', harvest: '#ffd34d', revelation: '#c58cff', ore: '#ffe9a0', cure: '#9fffcf', valor: '#ff9a6a', fertility: '#ffb0d0', tectonic: '#c8a070', avatar: '#fff6b0', orbshield: '#7fe8ff', prophecy: '#ffe066' };

export class FX {
  constructor() { this.parts = []; this.rings = []; this.bolts = []; this.emotes = []; this.meteors = []; this.projectiles = []; this.anims = []; this.texts = []; this.extras = []; this.shake = 0; this.flash = 0; this.max = 2500; }
  add(p) { if (this.parts.length < this.max) this.parts.push(p); }
  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 2) * (0.4 + Math.random());
      this.add({ x, y, z: opts.z ?? 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: (opts.up || 2) * (0.5 + Math.random()), life: (opts.life || 0.8) * (0.6 + Math.random() * 0.6), age: 0, col: Array.isArray(opts.col) ? opts.col[i % opts.col.length] : opts.col, size: opts.size || 1, grav: opts.grav ?? 6, kind: opts.kind || 'dot' });
    }
  }
  /** A power's themed particles (see PRESETS). */
  preset(name, x, y, R, col) {
    const [cols0, g, motion, n0] = PRESETS[name] || PRESETS.glow, n = Math.round(n0 * Math.min(2.2, 0.7 + R * 0.12)), cols = [...cols0, col];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Math.max(1, R * 0.8), c = cols[i % cols.length];
      const p = { x: x + Math.cos(a) * rr * (motion === 'burst' ? 0.2 : 1), y: y + Math.sin(a) * rr * 0.6 * (motion === 'burst' ? 0.2 : 1), z: 0.5, vx: 0, vy: 0, vz: 0, grav: 0, life: 1.6 + Math.random() * 0.8, age: -Math.random() * 0.25, col: c, size: g ? 1 : 1.2, kind: g ? 'glyph' : 'spark', g };
      if (motion === 'burst') { const sp = 2 + Math.random() * 2.5; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.5; p.vz = 3 + Math.random() * 3; p.grav = 6; }
      else if (motion === 'rise') { p.vz = 0.8 + Math.random() * 1.2; p.vx = (Math.random() - 0.5) * 0.4; }
      else if (motion === 'fall') { p.z = 4 + Math.random() * 3; p.vz = -(1.5 + Math.random() * 2); p.vx = (Math.random() - 0.5) * 0.6; p.grav = 0.5; }
      else if (motion === 'swirl') { p.orbit = { cx: x, cy: y, r: rr + 0.3, a, w: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random()) }; p.vz = 0.6; }
      else if (motion === 'ring') { const sp = 1.5 + Math.random(); p.x = x; p.y = y; p.vx = Math.cos(a) * sp * R * 0.35; p.vy = Math.sin(a) * sp * R * 0.2; p.vz = 0.4; p.z = 0.2; }
      else if (motion === 'pillar') { p.x = x + (Math.random() - 0.5) * 0.8; p.y = y + (Math.random() - 0.5) * 0.4; p.vz = 3 + Math.random() * 4; p.z = Math.random(); }
      else if (motion === 'drift') { p.vx = 1.5 + Math.random() * 1.5; p.vy = (Math.random() - 0.5) * 0.4; p.vz = 0.3 + Math.random() * 0.6; p.x -= R * 0.5; }
      this.add(p);
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
        const P = powerById[e.power], pf = POWER_FX[e.power] || {}, col = P?.color || POWER_COL[e.power] || '#ffd34d';
        const an = spx(pf.spx || spxForPower(e.power)), R = e.r || 2;
        if (an) this.anims.push({ x: e.x, y: e.y, an, age: 0, life: an.frames.length / an.fps, sc: Math.max(1.2, Math.min(2.6, 0.9 + R * 0.25)) });
        if (e.sub) { this.preset('embers', e.x, e.y, 1, col); break; }
        this.rings.push({ x: e.x, y: e.y, r: R, age: 0, life: 1.4, col });
        this.preset(pf.vfx || 'glow', e.x, e.y, R, col);
        const x = pf.extra;
        if (x === 'bolt') this.bolts.push({ x: e.x, y: e.y, age: 0, life: 0.4, seed: Math.random() });
        if (x === 'quake') this.shake = Math.max(this.shake, 9 * shake);
        if (x === 'skyflash') this.flash = Math.max(this.flash, 0.22 * Math.min(1, shake));
        if (x === 'beam' || x === 'rays' || x === 'rainbow' || x === 'cloud' || x === 'dome') this.extras.push({ kind: x, x: e.x, y: e.y, r: R, col, age: 0, life: x === 'dome' ? 3 : x === 'rainbow' ? 4 : 2.4 });
        this.flash = Math.max(this.flash, 0.04 * Math.min(1, shake));
        break;
      }
      case 'era': this.texts.push({ text: e.label || 'A new era dawns', age: 0, life: 4, nationId: e.nationId, big: true }); break;
      case 'order': this.rings.push({ x: e.x, y: e.y, r: 1.6, age: 0, life: 0.9, col: e.kind === 'fight' || e.kind === 'destroy' ? '#ff5a5a' : e.kind === 'hunt' ? '#ffb347' : '#8fe39a' }); break;
      case 'founded': case 'conquest': this.rings.push({ x: e.x, y: e.y, r: 8, age: 0, life: 2, col: e.type === 'conquest' ? '#ff5a5a' : '#ffd34d' }); break;
      case 'launch': this.burst(e.x, e.y - 2, 50, { col: ['#ffffff', '#ffb347', '#ff6a1a'], speed: 1.5, up: 12, grav: 2, life: 2.2, size: 2, kind: 'puff' }); break;
      case 'aurora': this.texts.push({ aurora: true, age: 0, life: 6 }); break;
      case 'flare': this.flash = Math.max(this.flash, 0.5 * shake); break;
    }
  }
  step(dt) {
    for (const p of this.parts) { if (p.orbit) { p.orbit.a += p.orbit.w * dt; p.x = p.orbit.cx + Math.cos(p.orbit.a) * p.orbit.r; p.y = p.orbit.cy + Math.sin(p.orbit.a) * p.orbit.r * 0.55; } p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.grav * dt; p.z += p.vz * dt; if (p.z < 0 && p.grav > 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; } }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const k of ['rings', 'bolts', 'emotes', 'meteors', 'projectiles', 'anims', 'texts', 'extras']) { for (const e of this[k]) e.age += dt; this[k] = this[k].filter((e) => e.age < e.life); }
    this.shake *= Math.pow(0.02, dt); if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 1.8);
  }
  /** ctx is set up so that worldToScreen(x,y) maps tiles -> px. */
  draw(ctx, cam, ws) {
    const T = cam.zoom;
    for (const p of this.parts) {
      if (p.age < 0) continue;
      const [sx, sy] = ws(p.x, p.y); const a = 1 - p.age / p.life;
      if (p.kind === 'glyph') {
        const gl = G[p.g], px = Math.max(1, Math.round(T / 18)), ox = Math.round(sx - 2.5 * px), oy = Math.round(sy - p.z * T * 0.5 - 2.5 * px);
        ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.6)); ctx.fillStyle = p.col;
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (gl[r][c] === '1') ctx.fillRect(ox + c * px, oy + r * px, px, px);
        continue;
      }
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
    for (const x of this.extras) this.drawExtra(ctx, x, ws, T);
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
  /** One-shot set pieces: a pillar of light, sun rays, a rainbow, a dark cloud, a shield dome. */
  drawExtra(ctx, x, ws, T) {
    const [sx, sy] = ws(x.x, x.y), t = x.age / x.life, fade = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
    ctx.save();
    if (x.kind === 'beam') {
      const w = T * 1.4, g = ctx.createLinearGradient(sx - w, 0, sx + w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, x.col); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.55 * fade; ctx.fillStyle = g; ctx.fillRect(sx - w, sy - T * 30, w * 2, T * 30);
      ctx.globalAlpha = 0.8 * fade; ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - T * 0.15, sy - T * 30, T * 0.3, T * 30);
    } else if (x.kind === 'rays') {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 7; k++) { const off = (k - 3) * x.r * T * 0.28, w = T * (0.6 + (k % 3) * 0.3); ctx.globalAlpha = 0.16 * fade * (0.6 + 0.4 * Math.sin(x.age * 3 + k)); ctx.fillStyle = x.col;
        ctx.beginPath(); ctx.moveTo(sx + off - w + T * 6, sy - T * 22); ctx.lineTo(sx + off + w + T * 6, sy - T * 22); ctx.lineTo(sx + off + w * 2, sy); ctx.lineTo(sx + off - w * 2, sy); ctx.fill(); }
    } else if (x.kind === 'rainbow') {
      const R = x.r * T * 0.9, cols = ['#ff5a5a', '#ffa64a', '#ffe066', '#6fe07a', '#5fa8ff', '#9a7aff'];
      ctx.lineWidth = Math.max(2, T * 0.35); ctx.globalAlpha = 0.6 * fade;
      cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(sx, sy, R - i * ctx.lineWidth, Math.PI, 0); ctx.stroke(); });
    } else if (x.kind === 'cloud') {
      ctx.globalAlpha = 0.55 * fade; ctx.fillStyle = x.col === '#b0e050' ? '#5a6a3a' : '#5a6070';
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(sx + (k - 2.5) * T * x.r * 0.25, sy - T * 7 + Math.sin(k * 2) * T * 0.6, T * x.r * 0.28, T * 1.2, 0, 0, 7); ctx.fill(); }
    } else if (x.kind === 'dome') {
      ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = x.col; ctx.lineWidth = Math.max(2, T / 8); const R = Math.max(4, x.r) * T;
      ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.8, 0, Math.PI, 0); ctx.stroke(); ctx.globalAlpha = 0.08 * fade; ctx.fillStyle = x.col; ctx.fill();
    }
    ctx.restore();
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
