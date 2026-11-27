// Economy UI: the plan menu (building previews, purpose, stats, costs), the stores panel (every item you own, with
// icons), the building inspector (materials still needed) and the research tree.
import { h, modal, openWindow, bar, toast } from './dom.js';
import { iconImg } from '../render/miscart.js';
import { BUILDINGS, BUILD_ORDER, BUILD_DESC, buildingName, buildCost } from '../data/buildings.js';
import { ERAS } from '../data/eras.js';
import { TECHS, TECH, techsOfEra, CAP_NEEDS, BUILD_TECH } from '../data/tech.js';
import { ITEMS, CATS, CAT_LABEL, CAT_DEFAULT, itemName, itemCat } from '../data/items.js';
import { techOpen, canBuildType } from '../sim/tech.js';
import { remainingCost } from '../sim/ai.js';
import { WORKS } from '../sim/ai.js';
import { buildingSprite, ROOF_PAD } from '../render/buildart.js';
import { mfName, mfSprite, itemUrl } from '../render/mfarm.js';
import * as GAN from '../render/gandalf.js';
import { cropFrame } from '../render/farm.js';
import { fmtNum } from '../core/util.js';

const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)); return el; };
export const itemIcon = (id, px = 20) => h('img', { src: itemUrl(id), class: 'item-ic', width: px, height: px, alt: itemName(id), tip: itemName(id) });
export const catIcon = (cat, px = 20) => itemIcon(CAT_DEFAULT[cat], px);

function trim(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
/** A small canvas showing what a building looks like for this nation (race colours, era). */
export function buildingPreview(type, era, nation, size = 96) {
  const def = BUILDINGS[type], race = nation?.race || 'human';
  const c = document.createElement('canvas'); c.width = size; c.height = size; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  if (type === 'farm') { // a little field of ripe crops
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const f = cropFrame([0, 3, 1, 7, 4, 0, 2, 3, 14][j * 3 + i], 4, true); x.fillStyle = '#6b4a2a'; x.fillRect(8 + i * 27, 14 + j * 25, 26, 24); if (f) x.drawImage(f.im, f.x, f.y, f.w, f.h, 8 + i * 27, 12 + j * 25, 26, 26); }
    return c;
  }
  let src = mfSprite(mfName(type, era, 0), race), r = null;
  if (!src && (type === 'hut' && era <= 1 || type === 'center' && era === 0 || type === 'healer' && era <= 2)) { const t = GAN.sheetRect(type === 'center' ? 'large_tent' : 'small_tent'); if (t) src = t.im; }
  if (src && type === 'healer' && era <= 2) { // cross + medkit, like in the world
    const k = Math.min((size - 6) / src.width, (size - 6) / src.height), w = src.width * k, hgt = src.height * k, x0 = (size - w) / 2, y0 = size - 3 - hgt;
    x.drawImage(src, x0, y0, w, hgt); const cx = size / 2, cy = y0 + hgt * 0.45, cs = 3;
    x.fillStyle = '#fff'; x.fillRect(cx - cs * 2.6, cy - cs * 2.6, cs * 5.2, cs * 5.2); x.fillStyle = '#d8282f'; x.fillRect(cx - cs * 0.8, cy - cs * 2.1, cs * 1.6, cs * 4.2); x.fillRect(cx - cs * 2.1, cy - cs * 0.8, cs * 4.2, cs * 1.6);
    const mk = new Image(); mk.src = itemUrl('medicine'); mk.onload = () => x.drawImage(mk, size - 30, size - 28, 24, 24);
    return c;
  }
  if (!src && (type === 'campfire' || (type === 'research' && era === 0))) { const f = GAN.campfireFrame(0, false); if (f) { src = f.im; r = [f.x, f.y, 32, 32]; } }
  if (!src) { src = buildingSprite(type, era, def.w, def.h, nation?.color || '#e8c547', 0); r = trim(src); }
  const [sx0, sy0, sw, sh] = r || [0, 0, src.width, src.height];
  const k = Math.min((size - 6) / sw, (size - 6) / sh);
  x.drawImage(src, sx0, sy0, sw, sh, Math.round((size - sw * k) / 2), Math.round(size - 3 - sh * k), sw * k, sh * k);
  return c;
}
function statsOf(type) {
  const f = BUILDINGS[type].fn, s = [];
  if (f.housing) s.push(['house', `Sleeps ${f.housing}`]); if (f.storage) s.push(['house', `Stores ${f.storage}`]); if (f.cook) s.push(['meals', `Cooking ×${f.cook}`]);
  if (f.research) s.push(['research', `Research ×${f.research}`]); if (f.worship) s.push(['glitter', 'Worship']); if (f.beds) s.push(['medicine', `${f.beds} beds`]);
  if (f.craft) s.push(['hammer', 'Crafting']); if (f.tailor) s.push(['cloth', 'Clothes']); if (f.eggs) s.push(['food', `${f.eggs} eggs/day`]); if (f.farm) s.push(['wheat', 'Crops']);
  if (f.train) s.push(['sword', 'Soldiers']); if (f.mine) s.push(['metal', 'Endless ore']); if (f.joy) s.push(['heart', `Joy +${f.joy}`]); if (f.pollution) s.push(['warning', 'Pollutes']);
  if (f.shield) s.push(['shield', 'Shield']); if (f.launch) s.push(['rocket', 'Launches']); if (f.power) s.push(['bulb', 'Power']);
  s.push(['hammer', `${BUILDINGS[type].work} work`]);
  return s;
}
const costRow = (cost, stock) => h('div', { class: 'cost-row' }, Object.keys(cost).length ? Object.entries(cost).map(([r, v]) => h('span', { class: `cost ${(stock?.[r] || 0) >= v ? 'ok' : 'short'}`, tip: `${CAT_LABEL[r]}: need ${v}, have ${Math.floor(stock?.[r] || 0)}` }, catIcon(r, 18), `${v}`)) : h('span', { class: 'tiny muted' }, 'Free'));

/** The plan menu: one card per building with its look, purpose, stats and costs. */
export function openBuildMenu(hud) {
  const app = hud.app, n = hud.me; if (!n) return toast('Choose a tribe first', { sound: 'error' });
  const s = hud.w.settlements[n.capitalId] || Object.values(hud.w.settlements).find((x) => x.nationId === n.id);
  const body = h('div', { class: 'plan-grid' }, BUILD_ORDER.filter((t) => t !== 'center').map((t) => {
    const def = BUILDINGS[t], ok = canBuildType(n, t), cost = buildCost(def, n.era), afford = Object.entries(cost).every(([r, v]) => (s?.stock[r] || 0) >= v);
    const why = ok ? null : def.era > n.era ? `Unlocks in the ${ERAS[def.era].name}` : `Research ${TECH[BUILD_TECH[t]]?.name}`;
    return h('div', { class: `plan-card ${ok ? 'pick' : 'locked'}`, onclick: () => { if (!ok) return; m.close(); app.startPlacing(t); } },
      h('div', { class: 'plan-pic' }, buildingPreview(t, Math.max(n.era, def.era), n, 92)),
      h('div', { class: 'plan-info' },
        h('div', { class: 'row' }, h('b', { class: 'grow' }, buildingName(t, Math.max(n.era, def.era), n.race)), h('span', { class: 'tiny muted' }, `${def.w}×${def.h}`)),
        h('div', { class: 'small' }, BUILD_DESC[t] || ''),
        h('div', { class: 'stat-chips' }, statsOf(t).map(([ic, txt]) => h('span', { class: 'chip tiny' }, iconImg(ic, 1, 'px-icon xs'), txt))),
        why ? h('div', { class: 'tiny lock' }, iconImg('lock', 1, 'px-icon xs'), why) : h('div', { class: 'row' }, costRow(cost, s?.stock), !afford ? h('span', { class: 'tiny muted' }, 'gather first') : null)));
  }));
  const m = modal('Plan a building', h('div', { class: 'col' }, h('p', { class: 'small muted' }, 'Pick a building, then click inside your territory. Builders carry the materials to the site first (you\'ll see what is still missing above it), then build.'), body), { icon: iconImg('plan'), width: 'min(900px, 94vw)' });
}

/** Floating list of everything in your capital's stores, grouped by kind. */
export class StoresPanel {
  constructor(hud) {
    this.hud = hud; this.open = hud.app.settings.storesOpen !== false;
    this.list = h('div', { class: 'stores-list' });
    this.head = h('button', { class: 'stores-head', onclick: () => { this.open = !this.open; hud.app.settings.storesOpen = this.open; this.key = ''; this.update(); } }, itemIcon('boxes', 20), h('b', { class: 'grow' }, 'Stores'), h('span', { class: 'chev' }, '▾'));
    this.el = h('div', { class: 'glass stores' }, this.head, this.list);
    this.key = '';
  }
  update() {
    const w = this.hud.w, n = this.hud.me; this.el.classList.toggle('closed', !this.open);
    if (!n) { this.el.style.display = 'none'; return; } this.el.style.display = '';
    const s = w.settlements[this.hud.storeSid] || w.settlements[n.capitalId] || Object.values(w.settlements).find((x) => x.nationId === n.id);
    if (!s || !this.open) { this.list.replaceChildren(); this.key = ''; return; }
    const items = Object.entries(s.items || {}).filter(([, v]) => v >= 1);
    const key = s.id + '|' + items.map(([k, v]) => k + Math.floor(v)).join(',');
    if (key === this.key) return; this.key = key;
    const groups = {}; for (const [id, v] of items) (groups[itemCat(id)] ||= []).push([id, v]);
    this.list.replaceChildren(h('div', { class: 'tiny muted stores-where' }, s.name),
      ...CATS.filter((c) => groups[c]).map((c) => h('div', { class: 'stores-grp' },
        h('div', { class: 'stores-cat' }, h('span', { class: 'grow' }, CAT_LABEL[c]), h('b', {}, fmtNum(s.stock[c] || 0))),
        ...groups[c].sort((a, b) => b[1] - a[1]).map(([id, v]) => h('div', { class: 'stores-row', tip: itemName(id) }, itemIcon(id, 20), h('span', { class: 'grow' }, itemName(id)), h('b', {}, Math.floor(v)))))),
      items.length ? null : h('div', { class: 'tiny muted' }, 'Empty'));
  }
}

/** Building inspector: look, purpose, construction status and what it still needs. */
export function openBuildingWindow(hud, id) {
  const app = hud.app;
  openWindow('building', 'Building', (body, win) => {
    const w = hud.w, b = w.buildings[id]; if (!b) return h('p', { class: 'muted' }, 'This building is gone.');
    const s = w.settlements[b.sid], n = s ? w.nations[s.nationId] : null, name = buildingName(b.type, b.era ?? 0, n?.race);
    win.setTitle(name);
    const left = remainingCost(b), need = b.need || {};
    return h('div', { class: 'col' },
      h('div', { class: 'row' }, buildingPreview(b.type, b.era ?? 0, n, 84), h('div', { class: 'col', style: { gap: '4px' } }, h('h3', {}, name), h('span', { class: 'small muted' }, `${s?.name || ''} · ${ERAS[b.era ?? 0].name}`), h('span', { class: 'small' }, BUILD_DESC[b.type] || ''))),
      h('div', { class: 'stat-chips' }, statsOf(b.type).map(([ic, txt]) => h('span', { class: 'chip tiny' }, iconImg(ic, 1, 'px-icon xs'), txt))),
      b.built ? h('div', { class: 'small' }, `Condition ${Math.round(b.hp)} hp`) : h('div', { class: 'col' },
        h('b', {}, b.paid ? `Under construction — ${Math.round(b.progress * 100)}%` : 'Waiting for materials'), bar(b.paid ? b.progress : 0),
        Object.keys(need).length ? h('div', { class: 'col' }, h('span', { class: 'tiny muted' }, 'Materials delivered to the site:'),
          ...Object.entries(need).map(([r, v]) => h('div', { class: 'row small' }, catIcon(r, 20), h('span', { class: 'grow' }, CAT_LABEL[r]), h('b', { class: left[r] ? 'neg' : 'pos' }, `${Math.floor(b.have?.[r] || 0)} / ${v}`)))) : null,
        Object.keys(left).length ? h('div', { class: 'tiny muted' }, Object.keys(left).some((r) => (s?.stock[r] || 0) < left[r]) ? 'Your stores are short — gatherers will fetch more.' : 'Builders are carrying it over.') : null),
      s ? h('button', { class: 'btn sm', onclick: () => hud.openSettlement(s.id) }, iconImg('house', 2, 'px-icon sm'), 'Settlement') : null);
  }, { x: innerWidth - 430, y: 110, w: 380, h: 440, icon: iconImg('house') });
}

/** The research tree: one column per era, click a technology to focus your scholars on it. */
export function researchPanel(app, w, n, mine) {
  const root = h('div', { class: 'col' });
  const cur = TECH[n.techCur];
  add(root, h('div', { class: 'card research-now' },
    h('div', { class: 'row' }, iconImg('research', 2), h('div', { class: 'col grow', style: { gap: '3px' } },
      h('b', {}, cur ? `Researching: ${cur.name}` : 'Nothing to research'),
      cur ? bar((n.techProg || 0) / cur.cost) : null,
      h('span', { class: 'tiny muted' }, cur ? `${fmtNum(n.techProg || 0)} / ${fmtNum(cur.cost)} — ${cur.desc}` : ''))),
    mine ? h('div', { class: 'tiny muted' }, 'Click any open technology to focus on it (switching keeps half the progress). Finish four of an era\'s techs, then its capstone, to enter the next era.') : null));
  const eras = ERAS.map((e) => e.id);
  const tree = h('div', { class: 'tech-tree' });
  for (const e of eras) {
    const list = techsOfEra(e), done = list.filter((t) => n.techs?.[t.id]).length;
    add(tree, h('div', { class: `tech-col ${e === n.era ? 'now' : e < n.era ? 'past' : 'future'}` },
      h('div', { class: 'tech-era' }, h('b', {}, ERAS[e].name), h('span', { class: 'tiny muted' }, `${done}/${list.length}`)),
      ...list.map((t) => {
        const known = !!n.techs?.[t.id], open = techOpen(n, t), on = n.techCur === t.id;
        const lockMsg = t.cap ? `Needs ${CAP_NEEDS} other ${ERAS[t.era].name} techs` : `Reach the ${ERAS[t.era].name}`;
        return h('div', { class: `tech ${known ? 'known' : open ? 'open' : 'locked'} ${on ? 'on' : ''} ${t.cap ? 'cap' : ''}`,
          tip: `<b>${t.name}</b>${t.cap ? ' · <i>era capstone</i>' : ''}<br>${t.desc}<br><span class="muted">${fmtNum(t.cost)} research</span>${!known && !open ? `<br><i>${lockMsg}</i>` : ''}`,
          onclick: () => { if (!mine || known || !open) return; app.session.command({ type: 'tech', id: t.id }).then((r) => { if (!r.ok) toast(r.msg, { sound: 'error' }); else toast(`Scholars now study ${t.name}`); }); } },
          itemOrIcon(t.icon), h('div', { class: 'tech-txt' }, h('span', { class: 'tech-name' }, t.name), h('span', { class: 'tiny muted' }, known ? 'Known' : on ? `${Math.floor(((n.techProg || 0) / t.cost) * 100)}%` : fmtNum(t.cost))));
      })));
  }
  add(root, tree);
  return root;
}
const itemOrIcon = (ic) => (ITEMS[ic] ? itemIcon(ic, 22) : iconImg(ic, 2, 'px-icon sm'));
export const workName = (p) => WORKS[p.work]?.name || '—';

// ---------- the Civilization Book (Paper UI) ----------
import { flagCanvas } from '../render/miscart.js';
import { RACES } from '../data/races.js';
import { GOVERNMENTS } from '../data/society.js';
import { TIERS } from '../data/powers.js';
import { tierOf } from '../sim/commands.js';
import { topItems } from '../sim/items.js';
import { dateString } from '../sim/world.js';

export const ribbon = (text, cls = '') => h('div', { class: `ribbon ${cls}` }, h('i', { class: 'rb-l' }), h('span', { class: 'rb-m' }, text), h('i', { class: 'rb-r' }));
/** Two-page spread: bookmarks across the top, the civilization on the left page, the chosen chapter on the right. */
const BOOK = { tab: null, t: 0, opened: 0 };
/** Paper "appear" animation (Humble Gift): a sheet of blank paper over the page dissolves to reveal the writing. */
const appear = (since) => { const el = since < 1300 ? h('div', { class: 'appear', style: { animationDelay: `-${Math.round(since)}ms` } }) : null; return el; };
export function bookSpread(tabList, tab, pick, left, title, right, openedAt = 0) {
  const now = performance.now();
  if (openedAt && openedAt !== BOOK.opened) { BOOK.opened = openedAt; BOOK.t = now; BOOK.tab = tab; BOOK.both = true; }
  if (tab !== BOOK.tab) { BOOK.tab = tab; BOOK.t = now; BOOK.both = false; }
  const since = now - BOOK.t;
  return h('div', { class: 'book' },
    h('div', { class: 'book-spread' },
      h('div', { class: 'page page-l' }, h('div', { class: 'page-in' }, left), BOOK.both ? appear(since) : null),
      h('div', { class: 'page page-r' },
        h('div', { class: 'book-marks' }, tabList.map(([id, label, ic]) => h('button', { class: `mark ${id === tab ? 'on' : ''}`, onclick: () => pick(id), tip: label }, iconImg(ic, 2, 'px-icon sm'), h('span', {}, label)))),
        h('div', { class: 'page-in' }, ribbon(title, 'sm'), right), appear(since))));
}
/** Left page: who these people are, at a glance. */
export function civPage(hud, w, n, pawns, leader, owner, mine) {
  const nx = ERAS[n.era + 1], tier = tierOf(n), nt = TIERS[tier], cur = TECH[n.techCur];
  const fc = flagCanvas(n.flag, 48, 32); fc.className = 'book-flag';
  const setts = Object.values(w.settlements).filter((s) => s.nationId === n.id);
  const cap = w.settlements[n.capitalId] || setts[0];
  const works = {}; for (const p of pawns) if (p.work && p.age >= 14) works[p.work] = (works[p.work] || 0) + 1;
  const kv = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
  return h('div', { class: 'col civ' },
    ribbon(n.name),
    h('div', { class: 'row civ-head' }, fc, h('div', { class: 'col', style: { gap: '2px' } },
      h('b', {}, `${RACES[n.race || 'human'].name} · ${GOVERNMENTS.find((g) => g.id === n.government)?.name || ''}`),
      h('span', { class: 'small muted' }, owner ? `Patron deity: ${owner.name}` : 'Guided by fate'),
      h('span', { class: 'small' }, ERAS[n.era].name, h('span', { class: 'muted' }, ` — ${ERAS[n.era].blurb}`)))),
    h('dl', { class: 'kv book-kv' },
      kv('Leader', leader ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); hud.openPawn(leader.id); } }, leader.name + ' ' + leader.family) : '—'),
      kv('People', `${pawns.length} in ${setts.length} settlement${setts.length === 1 ? '' : 's'}`),
      kv('Stability', `${Math.round(n.stability)}%`),
      kv('Mood', `${Math.round(pawns.reduce((a, p) => a + p.mood, 0) / Math.max(1, pawns.length))}`)),
    h('div', { class: 'book-sec' }, h('b', {}, 'Research'), cur ? [bar((n.techProg || 0) / cur.cost), h('div', { class: 'tiny muted' }, `${cur.name} · ${fmtNum(n.techProg || 0)}/${fmtNum(cur.cost)} · ${Object.keys(n.techs || {}).length} techs known`)] : h('div', { class: 'tiny muted' }, nx ? 'Choose a technology' : 'Every discovery made')),
    mine ? h('div', { class: 'book-sec' }, h('b', {}, `Devotion · Tier ${tier}`), nt ? bar(n.devotion / nt.devotion) : null, h('div', { class: 'tiny muted' }, nt ? `${fmtNum(n.devotion)} / ${nt.devotion} lifetime Glitter to unlock ${nt.name}` : 'All powers unlocked')) : null,
    cap ? h('div', { class: 'book-sec' }, h('b', {}, `Stores of ${cap.name}`), h('div', { class: 'book-items' }, topItems(cap, 10).map(([id, v]) => h('span', { class: 'book-item', tip: itemName(id) }, itemIcon(id, 22), Math.floor(v))))) : null,
    Object.keys(works).length ? h('div', { class: 'book-sec' }, h('b', {}, 'Trades'), h('div', { class: 'book-items' }, Object.entries(works).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('span', { class: 'book-item', tip: WORKS[k]?.desc }, iconImg(WORKS[k]?.icon || 'hammer', 2, 'px-icon sm'), `${v} ${WORKS[k]?.name || k}${v > 1 ? 's' : ''}`)))) : null,
    h('div', { class: 'book-sec' }, h('b', {}, 'Settlements'), ...setts.map((s) => h('a', { href: '#', class: 'row small', onclick: (e) => { e.preventDefault(); hud.openSettlement(s.id); } }, iconImg('house', 1, 'px-icon xs'), h('span', { class: 'grow' }, s.name + (s.capital ? ' ★' : '')), h('span', { class: 'muted' }, `${s.pop || 0} people`)))),
    h('div', { class: 'tiny muted' }, `Births ${n.stats.births} · Deaths ${n.stats.deaths} · Miracles ${n.stats.miracles}`));
}
/** Right page (first chapter): recent history of this people. */
export function chroniclePage(w, n, pawns) {
  const ev = w.log.filter((e) => e.nationId === n.id).slice(-24).reverse();
  return h('div', { class: 'col chronicle-page' }, ev.length ? ev.map((e) => { const d = dateString(e.t); return h('div', { class: 'chron-row' }, h('span', { class: 'tiny muted' }, `Y${d.year} ${d.season.slice(0, 2)} ${d.day}`), h('span', { class: 'small' }, e.text)); }) : h('p', { class: 'muted small' }, 'Nothing has been written yet.'));
}
