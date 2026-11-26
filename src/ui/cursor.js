// Custom pixel-art mouse cursors (generated, no files) + optional glitter trail.
import { PixBuf, rgba } from '../render/pixel.js';

const K = rgba(26, 20, 32), W = rgba(255, 250, 235), G = rgba(255, 211, 77), GD = rgba(201, 149, 42), C = rgba(127, 232, 240), R = rgba(232, 72, 77);
const MAPS = {
  pointer: { hot: [1, 1], rows: [
    'K...........', 'KK..........', 'KWK.........', 'KWWK........', 'KWWWK.......', 'KWWWWK......', 'KWWWWWK.....', 'KWWWWWWK....', 'KWWWGGGGK...', 'KWWGKKKKK...', 'KWGK........', 'KGK.........', 'KK..........'] },
  hand: { hot: [5, 1], rows: [
    '....KK......', '...KWWK.....', '...KWWK.....', '...KWWKKK...', '...KWWKWWKK.', '.KKKWWKWWKWK', 'KWWKWWWWWKWK', 'KWWWWWWWWWWK', '.KWWWWWWWWWK', '.KWWWWWWWWK.', '..KGGGGGGGK.', '..KGGGGGGK..', '...KKKKKK...'] },
  target: { hot: [6, 6], rows: [
    '.....KK.....', '.....GG.....', '...KKGGKK...', '..KG....GK..', '..G..KK..G..', 'KGG.KGGK.GGK', 'KGG.KGGK.GGK', '..G..KK..G..', '..KG....GK..', '...KKGGKK...', '.....GG.....', '.....KK.....'] },
  build: { hot: [2, 2], rows: [
    'KKKKK.......', 'KGGGGK......', 'KGGGGKK.....', 'KGGKKWWK....', '.KKKWWWWK...', '....KWWWWK..', '.....KWWWWK.', '......KWWWWK', '.......KWWK.', '........KK..', '............', '............'] },
  possess: { hot: [6, 6], rows: [
    '...KKKKKK...', '..KCCCCCCK..', '.KCWWWWWWCK.', 'KCWWKKKKWWCK', 'KCWKCCCCKWCK', 'KCWKCKKCKWCK', 'KCWKCCCCKWCK', 'KCWWKKKKWWCK', '.KCWWWWWWCK.', '..KCCCCCCK..', '...KKKKKK...', '............'] },
  deny: { hot: [6, 6], rows: [
    '...KKKKKK...', '..KRRRRRRK..', '.KRRK..KRRK.', 'KRRRRK..KRRK', 'KRK.RRK..KRK', 'KRK..RRK.KRK', 'KRK..KRRKKRK', 'KRK...KRRKRK', 'KRRK...KRRRK', '.KRRK..KRRK.', '..KRRRRRRK..', '...KKKKKK...'] },
};
const PAL = { K, W, G, C, R, '.': 0 };
const urls = {};
function build(name, scale = 2) {
  const m = MAPS[name], b = new PixBuf(12, m.rows.length);
  m.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PAL[ch]) b.set(x, y, PAL[ch]); }));
  const c = document.createElement('canvas'); c.width = 12 * scale; c.height = m.rows.length * scale;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(b.toCanvas(), 0, 0, c.width, c.height);
  return `url(${c.toDataURL()}) ${m.hot[0] * scale} ${m.hot[1] * scale}, auto`;
}
export function setCursor(name) {
  if (!urls[name]) urls[name] = build(name);
  document.body.style.setProperty('--cursor', urls[name]);
  document.documentElement.style.setProperty('--cursor-hand', urls.hand || (urls.hand = build('hand')));
}
export function initCursor(getTrail) {
  setCursor('pointer');
  const style = document.createElement('style');
  style.textContent = `.btn, .power, .card.pick, .tabs button, .swatch, .feed .item, .nation-pill, select, input[type=range], input[type=checkbox] { cursor: ${urls.hand || (urls.hand = build('hand'))}; }`;
  document.head.append(style);
  // glitter trail
  const cv = document.createElement('canvas'); cv.id = 'cursor-trail'; document.body.append(cv);
  const ctx = cv.getContext('2d'); const parts = [];
  const resize = () => { cv.width = innerWidth; cv.height = innerHeight; }; resize(); addEventListener('resize', resize);
  let lx = 0, ly = 0;
  addEventListener('pointermove', (e) => { if (!getTrail()) return; const d = Math.hypot(e.clientX - lx, e.clientY - ly); if (d > 6) { lx = e.clientX; ly = e.clientY; parts.push({ x: lx, y: ly, a: 1, vy: -0.3 - Math.random() * 0.4, vx: (Math.random() - 0.5) * 0.6, c: Math.random() < 0.5 ? '#ffd34d' : '#fff6d0' }); } });
  const loop = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) { p.a -= 0.035; p.x += p.vx; p.y += p.vy; ctx.globalAlpha = Math.max(0, p.a); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 2, 2); if (p.a > 0.6) { ctx.fillRect(p.x - 2, p.y, 1, 1); ctx.fillRect(p.x + 3, p.y, 1, 1); } }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].a <= 0) parts.splice(i, 1);
    if (parts.length > 120) parts.splice(0, parts.length - 120);
    requestAnimationFrame(loop);
  };
  loop();
}
