// Small DOM toolkit: element builder, toasts, tooltips, draggable & resizable windows, UI sounds.
import { audio } from '../audio/audio.js';

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
  return el;
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
  win = {
    id, el, body, render,
    setTitle: (t) => { titleEl.textContent = t; },
    update() { try { const scroll = body.scrollTop; const out = win.render(body, win); if (out instanceof Node) { body.replaceChildren(out); } body.scrollTop = scroll; } catch (e) { console.error(e); } },
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
    const mv = (ev) => { el.style.left = Math.max(-el.offsetWidth + 60, Math.min(innerWidth / z - 60, ox + (ev.clientX - sx) / z)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight / z - 40, oy + (ev.clientY - sy) / z)) + 'px'; };
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
