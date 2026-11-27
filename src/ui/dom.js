// Small DOM toolkit: element builder, toasts, tooltips, draggable & resizable windows, UI sounds.
import { audio } from '../audio/audio.js';

// Let append/prepend/replaceChildren skip null/undefined/false, so optional UI parts never render as "null".
for (const m of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.filter((k) => k !== null && k !== undefined && k !== false)); };
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'tip') el.dataset.tip = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) { if (k === null || k === undefined || k === false) continue; el.append(k instanceof Node ? k : document.createTextNode(String(k))); }
  if (tag === 'input' && el.type === 'range') syncRange(el);
  return el;
}
/** Keep the --pct CSS variable (filled part of a slider track) in sync with the value. */
export function syncRange(el) {
  const min = +el.min || 0, max = el.max === '' ? 100 : +el.max, v = +el.value;
  el.style.setProperty('--pct', `${max > min ? ((v - min) / (max - min)) * 100 : 0}%`);
}
document.addEventListener('input', (e) => { if (e.target?.type === 'range') syncRange(e.target); }, true);

/** "2 hours ago" style relative time. */
export function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const u = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2629800, 'month'], [31557600, 'year']];
  let best = u[0];
  for (const x of u) if (s >= x[0]) best = x;
  const n = Math.max(1, Math.floor(s / best[0]));
  return `${n} ${best[1]}${n > 1 ? 's' : ''} ago`;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- UI sounds on every button ----------
export function wireUISounds(root = document) {
  root.addEventListener('pointerover', (e) => { const b = e.target.closest?.('.btn, .power, .card.pick, .tabs button, .swatch'); if (b && !b.contains(e.relatedTarget)) audio.play('hover'); });
  root.addEventListener('click', (e) => { const b = e.target.closest?.('.btn, .power, .card.pick, .tabs button, .swatch'); if (b) audio.play(b.classList.contains('danger') ? 'toggle' : 'click'); }, true);
}

// ---------- toasts ----------
let toastHost;
export function toast(text, opts = {}) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts' }); (document.getElementById('ui') || document.body).append(toastHost); }
  const el = h('div', { class: `toast glass ${opts.big ? 'big' : ''}` }, opts.icon ? (opts.icon instanceof Node ? opts.icon : h('span', { html: opts.icon })) : null, ' ', text);
  if (opts.color) el.style.borderColor = opts.color;
  toastHost.append(el);
  if (opts.sound !== false) audio.play(opts.sound || (opts.big ? 'notify' : 'chat'));
  setTimeout(() => { el.style.transition = 'opacity .4s, transform .4s'; el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; setTimeout(() => el.remove(), 450); }, opts.ms || (opts.big ? 4200 : 2600));
}

// ---------- tooltips (delay from settings) ----------
export function wireTooltips(getDelay) {
  let tip = null, timer = null, target = null;
  const hide = () => { clearTimeout(timer); tip?.remove(); tip = null; target = null; };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t === target) return;
    hide(); if (!t) return;
    target = t;
    timer = setTimeout(() => {
      tip = h('div', { class: 'tooltip glass', html: t.dataset.tip });
      document.body.append(tip);
      const r = t.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
      const tw = tip.offsetWidth * z, th = tip.offsetHeight * z;
      let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 8;
      if (y < 8) y = r.bottom + 8;
      x = Math.max(8, Math.min(innerWidth - tw - 8, x));
      tip.style.left = x / z + 'px'; tip.style.top = y / z + 'px';
    }, getDelay());
  });
  document.addEventListener('pointerdown', hide);
  document.addEventListener('pointerout', (e) => { if (target && !e.relatedTarget) hide(); });
  document.addEventListener('scroll', hide, true);
  setInterval(() => { if (target && !target.isConnected) hide(); }, 400);
}

// ---------- modals ----------
export function modal(title, body, { width, onClose, icon } = {}) {
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); audio.play('close'); onClose?.(); };
  const box = h('div', { class: 'modal glass', style: width ? { width } : null },
    h('header', {}, icon ? (icon instanceof Node ? icon : h('span', { html: icon })) : null, h('h2', {}, title), h('button', { class: 'btn icon ghost x', onclick: close, 'aria-label': 'Close', tip: 'Close' }, '✕')),
    body);
  back.append(box);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  audio.play('open');
  return { el: box, close };
}

// ---------- draggable / resizable windows ----------
const wins = new Map();
let zTop = 10;
const uiZoom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
/** Keep a window fully reachable inside the viewport (called on open and on resize). */
/** Move a new window into the free part of the screen: away from the HUD (toolbar, stores list, top bar, power bar,
 *  chronicle) and from other open windows. Tries a grid of spots and keeps the one with the least overlap. */
export function placeFree(el, prefX, prefY) {
  const z = uiZoom(), vw = innerWidth / z, vh = innerHeight / z, M = 8;
  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.left / z, y: r.top / z, w: r.width / z, h: r.height / z }; };
  const obstacles = [...document.querySelectorAll('.hud-left, .stores, .hud-top, .powerbar, .feed, .players, .possess-bar, .order-bar')].filter((e) => e.offsetParent && !e.classList.contains('closed-hidden')).map(rect)
    .concat([...wins.values()].filter((o) => o.el !== el).map((o) => rect(o.el)));
  // the free box between the fixed HUD pieces
  const top = Math.max(M, ...[...document.querySelectorAll('.hud-top')].map((e) => rect(e).y + rect(e).h + 6));
  let w = el.offsetWidth, h = el.offsetHeight;
  if (h > vh - top - M) { h = vh - top - M; el.style.height = h + 'px'; }
  if (w > vw - 2 * M) { w = vw - 2 * M; el.style.width = w + 'px'; }
  const over = (x, y) => obstacles.reduce((a, o) => a + Math.max(0, Math.min(x + w, o.x + o.w) - Math.max(x, o.x)) * Math.max(0, Math.min(y + h, o.y + o.h) - Math.max(y, o.y)), 0);
  let best = null, bs = Infinity;
  const xs = [], ys = [];
  for (let x = M; x <= vw - w - M; x += 24) xs.push(x); xs.push(Math.max(M, vw - w - M));
  for (let y = top; y <= vh - h - M; y += 24) ys.push(y); ys.push(Math.max(top, vh - h - M));
  for (const x of xs) for (const y of ys) {
    const sc = over(x, y) * 1000 + Math.hypot(x - prefX, y - prefY);
    if (sc < bs) { bs = sc; best = [x, y]; }
  }
  if (best) { el.style.left = best[0] + 'px'; el.style.top = best[1] + 'px'; }
}
export function clampToViewport(el) {
  const z = uiZoom(), vw = innerWidth / z, vh = innerHeight / z, M = 8;
  const w = Math.min(el.offsetWidth, vw - 2 * M), hh = Math.min(el.offsetHeight, vh - 2 * M);
  if (el.offsetWidth > w) el.style.width = w + 'px';
  if (el.offsetHeight > hh) el.style.height = hh + 'px';
  el.style.left = Math.max(M, Math.min(vw - w - M, el.offsetLeft)) + 'px';
  el.style.top = Math.max(M, Math.min(vh - hh - M, el.offsetTop)) + 'px';
}
addEventListener('resize', () => { for (const w of wins.values()) clampToViewport(w.el); });
export function openWindow(id, title, render, { x, y, w = 380, h: ht = 480, icon, onClose } = {}) {
  let win = wins.get(id);
  if (win) { win.render = render; win.setTitle(title); win.update(); win.focus(); return win; }
  const host = document.getElementById('ui');
  const titleEl = h('div', { class: 'title' }, title);
  const body = h('div', { class: 'body' });
  const el = h('div', { class: 'win glass', style: { left: (x ?? (innerWidth / 2 - w / 2)) + 'px', top: (y ?? 90) + 'px', width: w + 'px', height: ht + 'px' } },
    h('div', { class: 'titlebar' }, icon ? (icon instanceof Node ? icon : h('span', { html: icon })) : null, titleEl, h('button', { class: 'btn icon ghost sm', tip: 'Close', onclick: () => win.close() }, '✕')),
    body);
  host.append(el);
  placeFree(el, x ?? (innerWidth / 2 - w / 2), y ?? 90);
  clampToViewport(el);
  win = {
    id, el, body, render,
    setTitle: (t) => { titleEl.textContent = t; },
    update() {
      try {
        const scroll = body.scrollTop; const out = win.render(body, win);
        if (out instanceof Node) {
          // only touch the DOM when something actually changed: stops flicker and keeps tooltips/hover alive
          let sig = out.outerHTML || '';
          for (const c of out.querySelectorAll?.('canvas') || []) { try { const u = c.toDataURL(); sig += '|' + u.length + u.slice(-48); } catch (e) { sig += '|c'; } }
          if (sig !== win._sig || !body.firstChild) { win._sig = sig; body.replaceChildren(out); }
        }
        body.scrollTop = scroll;
      } catch (e) { console.error(e); }
    },
    focus() { el.style.zIndex = ++zTop; for (const o of wins.values()) o.el.classList.toggle('focused', o === win); },
    close() { el.remove(); wins.delete(id); audio.play('close'); onClose?.(); },
  };
  wins.set(id, win);
  // drag
  const bar = el.querySelector('.titlebar');
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    win.focus();
    const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
    const mv = (ev) => { el.style.left = Math.max(0, Math.min(innerWidth / z - Math.min(el.offsetWidth, 120), ox + (ev.clientX - sx) / z)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight / z - 40, oy + (ev.clientY - sy) / z)) + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  el.addEventListener('pointerdown', () => win.focus());
  win.update(); win.focus();
  audio.play('open');
  return win;
}
export const getWindow = (id) => wins.get(id);
export const allWindows = () => [...wins.values()];
export function closeAllWindows() { for (const w of [...wins.values()]) w.close(); }

export function tabs(names, current, onPick) {
  return h('div', { class: 'tabs' }, names.map(([id, label]) => h('button', { class: id === current ? 'on' : '', onclick: () => onPick(id) }, label)));
}
export function bar(v, cls = '') { return h('div', { class: `bar ${cls}` }, h('i', { style: { width: `${Math.max(0, Math.min(100, v * 100))}%` } })); }


// ---------- colour wheel ----------
export const COLOR_PRESETS = ['#e8c547', '#4fb0ff', '#ff6b6b', '#7ee081', '#c58cff', '#ff9f43', '#4ee6d4', '#f4f1e8'];
function hsv2rgb(hh, ss, vv) {
  const f = (n) => { const k = (n + hh / 60) % 6; return vv - vv * ss * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, mx ? d / mx : 0, mx];
}
const toHex = ([r, g, b]) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
const parseHex = (x) => { const m = /^#?([0-9a-f]{6})$/i.exec((x || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
/** One simple colour control: HSV wheel (hue = angle, saturation = radius) + brightness slider + hex box + presets.
 *  Returns an element with .setValue(hex) / .getValue(). */
export function colorWheel({ value = '#e8c547', onChange } = {}) {
  const SIZE = 148, R = SIZE / 2;
  let [H, S, V] = rgb2hsv(...(parseHex(value) || [232, 197, 71]));
  const cv = h('canvas', { width: SIZE, height: SIZE, class: 'cw-canvas' });
  const ctx = cv.getContext('2d');
  const knob = h('div', { class: 'cw-knob' });
  const wheelBox = h('div', { class: 'cw-wheel' }, cv, knob);
  const chip = h('div', { class: 'cw-chip' });
  const hex = h('input', { type: 'text', class: 'cw-hex', maxlength: 7, spellcheck: 'false', 'aria-label': 'Hex colour' });
  const vSlider = h('input', { type: 'range', min: 0, max: 100, value: Math.round(V * 100), class: 'cw-v', 'aria-label': 'Brightness' });
  const draw = () => {
    const img = ctx.createImageData(SIZE, SIZE), d = img.data;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R, r = Math.hypot(dx, dy), i = (y * SIZE + x) * 4;
      if (r > R) continue;
      const [rr, gg, bb] = hsv2rgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, Math.min(1, r / (R - 1)), V);
      d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = r > R - 1 ? Math.max(0, (R - r) * 255) : 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  const current = () => toHex(hsv2rgb(H, S, V));
  const paint = (emit, redrawWheel = true) => {
    const c = current();
    if (redrawWheel) draw();
    const a = (H * Math.PI) / 180;
    knob.style.left = `${R + Math.cos(a) * S * (R - 1)}px`; knob.style.top = `${R + Math.sin(a) * S * (R - 1)}px`;
    knob.style.background = c; chip.style.background = c;
    if (document.activeElement !== hex) hex.value = c;
    vSlider.value = Math.round(V * 100); syncRange(vSlider);
    vSlider.style.setProperty('--cw-top', toHex(hsv2rgb(H, S, 1)));
    if (emit) onChange?.(c);
  };
  const pick = (e) => {
    const r = cv.getBoundingClientRect(), sc = SIZE / r.width;
    const dx = (e.clientX - r.left) * sc - R, dy = (e.clientY - r.top) * sc - R;
    H = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360; S = Math.min(1, Math.hypot(dx, dy) / (R - 1));
    if (V < 0.05) V = 0.6;
    paint(true, false);
  };
  wheelBox.addEventListener('pointerdown', (e) => { wheelBox.setPointerCapture(e.pointerId); wheelBox._drag = true; pick(e); });
  wheelBox.addEventListener('pointermove', (e) => { if (wheelBox._drag) pick(e); });
  wheelBox.addEventListener('pointerup', () => { wheelBox._drag = false; });
  vSlider.addEventListener('input', () => { V = +vSlider.value / 100; paint(true); });
  hex.addEventListener('input', () => { const rgb = parseHex(hex.value); if (rgb) { [H, S, V] = rgb2hsv(...rgb); paint(true); } hex.classList.toggle('bad', !rgb); });
  hex.addEventListener('keydown', (e) => e.stopPropagation());
  hex.addEventListener('blur', () => { hex.classList.remove('bad'); hex.value = current(); });
  const presets = h('div', { class: 'cw-presets' }, COLOR_PRESETS.map((c) => h('button', { type: 'button', class: 'swatch', style: { background: c }, 'aria-label': c, onclick: () => { [H, S, V] = rgb2hsv(...parseHex(c)); paint(true); } })));
  const el = h('div', { class: 'colorwheel' },
    wheelBox,
    h('div', { class: 'cw-side' },
      h('div', { class: 'cw-row' }, chip, hex),
      h('div', { class: 'cw-label' }, 'Brightness'), vSlider,
      h('div', { class: 'cw-label' }, 'Quick picks'), presets));
  el.setValue = (v) => { const rgb = parseHex(v); if (!rgb) return; [H, S, V] = rgb2hsv(...rgb); paint(false); };
  el.getValue = current;
  paint(false);
  return el;
}
