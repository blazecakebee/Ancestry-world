// In-game HUD: top bar, tools, power bar, event feed + co-op chat & players, and all inspector windows.
const add = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
import { h, toast, openWindow, getWindow, tabs, bar, modal, esc } from './dom.js';
import { iconImg, flagCanvas } from '../render/miscart.js';
import { POWERS, TIERS, powerById } from '../data/powers.js';
import { ERAS } from '../data/eras.js';
import { TRAITS } from '../data/traits.js';
import { SKILLS, THOUGHTS, AXES, GOVERNMENTS, BREAK_LABELS } from '../data/society.js';
import { BUILDINGS, BUILD_ORDER, buildingName, RESOURCES, RES_LABEL } from '../data/buildings.js';
import { RACES } from '../data/races.js';
import { PARTS, DISEASES } from '../sim/health.js';
import { relationLabel, fullName } from '../sim/pawn.js';
import { dateString } from '../sim/world.js';
import { WORLD_AGES } from '../sim/events.js';
import { STORM_NAMES, cellAt, tempAt } from '../world/atmosphere.js';
import { PERMS, tierOf } from '../sim/commands.js';
import { scaledCost } from '../sim/ai.js';
import { ANIMALS } from '../sim/combat.js';
import { fmtNum, clamp } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { showFlagEditor, showCodex, showSettings } from './menu.js';
import { LW, LH, LPC_BAND } from '../render/lpc.js';
import { PW, PH, DIR } from '../render/charpack.js';
import { saveSettings } from './settings.js';
import { FW, FH } from '../render/pawnart.js';

const RES_ICON = { food: 'food', meals: 'meals', rations: 'rations', wood: 'wood', stone: 'stone', metal: 'metal', cloth: 'cloth', medicine: 'medicine' };
const OVERLAYS = [['none', 'None', 'globe'], ['borders', 'Borders', 'flag'], ['ideology', 'Ideology', 'scroll'], ['glitter', 'Glitter devotion', 'glitter'], ['trade', 'Trade routes', 'map'], ['race', 'Races', 'users'], ['weather', 'Weather', 'storm'], ['wind', 'Wind', 'wind'], ['temperature', 'Temperature', 'sun'], ['pressure', 'Pressure', 'warning'], ['humidity', 'Humidity', 'rain'], ['pollution', 'Pollution', 'skull']];

const POWER_CATS = [['divine', 'Divine', 'glitter'], ['nature', 'Nature', 'tree'], ['life', 'Life', 'heart'], ['creatures', 'Creatures', 'dove'], ['war', 'War', 'sword'], ['curses', 'Curses', 'skull'], ['world', 'World', 'globe']];

// Which log entries are important enough for a notification card (everything else stays in the Chronicle only).
// Returns {sev: info|success|warning|danger, icon, title?} or null. `mine` = the event concerns my nation.
const SEV_ICON = { info: 'info', success: 'check', warning: 'warning', danger: 'skull' };
const DISASTER_RE = /drought|plague|epidemic|pandemic|famine|eruption|erupted|volcano|meteor|earthquake|quake|flood|tsunami|blizzard|wildfire|locust|blight|famine|cataclysm/i;
export function classifyEvent(e, ctx) {
  const t = e.text || '', { mine, myName, pinned } = ctx;
  const involves = mine || (myName && t.includes(myName));
  switch (e.cat) {
    case 'war':
      if (/raiding|marauders/.test(t)) return involves ? { sev: 'danger', icon: 'sword' } : null;
      if (/rebelled|independence/.test(t)) return involves || e.big ? { sev: 'danger', icon: 'flag' } : null;
      if (/declared war|conquered/.test(t)) return involves || e.big ? { sev: 'danger', icon: 'sword' } : null;
      if (/marches on|has withdrawn|been broken|joined the war/.test(t)) return involves ? { sev: /broken|withdrawn/.test(t) ? 'success' : 'warning', icon: 'sword' } : null;
      return null;
    case 'peace':
      if (/made peace|alliance/.test(t) && (involves || e.big)) return { sev: 'success', icon: 'dove' };
      if (/sues for peace/.test(t) && involves) return { sev: 'info', icon: 'dove' };
      return null;
    case 'nation':
      if (/collaps|fallen|has (fallen|dissolved|perished|vanished|ended|died out)|extinct/i.test(t) && (e.big || involves)) return { sev: 'danger', icon: 'flag' };
      if (/founded|to found|settled the wilds|patron deity/.test(t) && (e.big || involves)) return { sev: 'success', icon: 'flag' };
      if (/proposed/.test(t) && involves) return { sev: 'info', icon: 'users', title: t };
      if (/reformed/.test(t) && involves) return { sev: 'info', icon: 'scroll' };
      if (/now leads/.test(t) && involves) return { sev: 'info', icon: 'crown' };
      if (e.big && involves) return { sev: 'info', icon: 'flag' };
      return null;
    case 'era': return involves ? { sev: 'success', icon: 'research', title: t.split('!')[0] + '!' } : null;
    case 'age': return { sev: 'info', icon: 'globe', title: t.split('.')[0] };
    case 'disaster':
      if (e.severity === 'major' || DISASTER_RE.test(t)) return { sev: 'danger', icon: 'storm' };
      return null;
    case 'weather': return DISASTER_RE.test(t) ? { sev: 'warning', icon: 'storm' } : null;
    case 'death':
      if (pinned.has(e.pid)) return { sev: 'danger', icon: 'skull' };
      if (e.leader && involves) return { sev: 'danger', icon: 'crown' };
      return null;
    case 'space': return involves && e.big ? { sev: 'success', icon: 'rocket' } : null;
    case 'faith': return /Prophet/.test(t) && involves ? { sev: 'success', icon: 'star' } : null;
    case 'system': return /granted|revoked/.test(t) && ctx.player && t.endsWith(` ${ctx.player}.`) ? { sev: 'info', icon: 'lock' } : null;
    case 'request': return { sev: 'info', icon: 'users' };
    default: return null;
  }
}

const CHIP_GROUP = { birth: 'life', death: 'life', social: 'life', break: 'life', war: 'war', peace: 'war', disaster: 'world', weather: 'world', age: 'world', miracle: 'world', good: 'world', bad: 'world', space: 'world', nation: 'nation', era: 'nation', faith: 'nation' };

export class HUD {
  constructor(app) {
    this.app = app; this.root = document.getElementById('ui'); this.lastLog = 0; this.feedMine = false;
    this.build();
  }
  get w() { return this.app.session.world; }
  get me() { return this.app.session.myNation; }

  build() {
    const app = this.app;
    this.root.replaceChildren();
    // ---- top bar ----
    this.nationPill = h('div', { class: 'glass pill nation-pill', onclick: () => this.me && this.openNation(this.me.id), tip: 'Your nation — click for laws, diplomacy, permissions & flag' });
    this.glitterEl = h('div', { class: 'stat glitter-count' }); this.popEl = h('div', { class: 'stat' }); this.eraEl = h('div', { class: 'stat', style: { minWidth: '150px' } });
    this.clockEl = h('div', { class: 'stat clock' }); this.ageEl = h('div', { class: 'chip' }); this.weatherEl = h('div', { class: 'stat' });
    this.speedBtns = this.app.settings.speeds.map((v, i) => h('button', { class: 'btn', onclick: () => app.setSpeed(v), tip: `Speed ${v}x <span class="kbd">${i + 1}</span>` }, `${v}x`));
    this.pauseBtn = h('button', { class: 'btn', onclick: () => app.togglePause(), tip: 'Pause / resume <span class="kbd">Space</span> — shared by everyone in co-op' }, iconImg('pause', 2, 'px-icon sm'));
    this.root.append(h('div', { class: 'hud-top' },
      this.nationPill,
      h('div', { class: 'glass pill', tip: 'Glitter: earned when your people admire and worship you. Spend it on powers. Lifetime devotion unlocks higher tiers.' }, iconImg('glitter'), this.glitterEl),
      h('div', { class: 'glass pill', tip: 'Population of your nation' }, iconImg('pop'), this.popEl),
      h('div', { class: 'glass pill', tip: 'Era & research progress toward the next age' }, iconImg('research'), this.eraEl),
      h('div', { class: 'grow' }),
      h('div', { class: 'glass pill' }, this.weatherEl),
      h('div', { class: 'glass pill' }, this.clockEl, this.ageEl),
      h('div', { class: 'glass speed-group' }, this.pauseBtn, ...this.speedBtns),
      h('button', { class: 'glass btn icon', onclick: () => app.openMenu(), tip: 'Menu' }, iconImg('settings')),
    ));
    // ---- left tools (icon + label, collapsible) ----
    this.toolBtns = {};
    const tool = (id, icon, label, kbd, tip, fn) => (this.toolBtns[id] = h('button', { class: 'btn tool', 'data-tool': id, onclick: fn, tip, 'aria-label': label }, iconImg(icon), h('span', { class: 'lbl' }, label), kbd ? h('span', { class: 'kbd' }, kbd) : null));
    this.chevBtn = h('button', { class: 'tool-chev', onclick: () => this.setToolbarCollapsed(!app.settings.toolbarCollapsed), tip: 'Collapse / expand the toolbar labels' });
    this.toolbar = h('div', { class: 'glass hud-left' }, this.chevBtn,
      h('div', { class: 'tool-list' },
        tool('inspect', 'inspect', 'Inspect', 'Q', 'Inspect <span class="kbd">Q</span><br>Click citizens, buildings & settlements', () => app.setTool('inspect')),
        tool('build', 'plan', 'Plan', 'B', 'Plan a building <span class="kbd">B</span><br>Your people will build it', () => this.openBuildMenu()),
        tool('possess', 'possess', 'Possess', 'F', 'Possess a citizen<br>Select one of your people, then take control (WASD to move, F to act, R to release)', () => app.possessSelected()),
        tool('overlay', 'map', 'Layers', 'F1', 'Map overlays <span class="kbd">F1–F10</span>', () => this.toggleOverlayMenu()),
        h('div', { class: 'sep' }),
        tool('nation', 'flag', 'Nation', 'N', 'Nation <span class="kbd">N</span>', () => this.me && this.openNation(this.me.id)),
        tool('space', 'rocket', 'Space', '', 'Offworld & space', () => this.openSpace()),
        tool('codex', 'book', 'Codex', 'C', 'Codex <span class="kbd">C</span>', () => showCodex()),
        tool('save', 'save', 'Save', '', 'Save world', () => app.save()),
        tool('help', 'info', 'Tutorial', '', 'Tutorial', () => app.tutorial?.start(true))));
    this.root.append(this.toolbar);
    this.setToolbarCollapsed(!!app.settings.toolbarCollapsed, false);
    // ---- powers dock ----
    this.powerBar = h('div', { class: 'glass powerbar' });
    this.modeChip = h('div', { class: 'glass mode-chip hidden' });
    this.root.append(h('div', { class: 'hud-bottom' }, this.powerBar), this.modeChip);
    this.buildPowers();
    // ---- right: players + notifications ----
    this.playersEl = h('div', { class: 'glass players' });
    this.notifEl = h('div', { class: 'notifs' });
    this.root.append(h('div', { class: 'hud-right' }, this.playersEl, this.notifEl));
    // ---- bottom-left: chronicle ----
    this.buildChronicle();
    this.rebuildFeed();
  }

  setToolbarCollapsed(v, persist = true) {
    this.toolbar.classList.toggle('collapsed', v);
    this.chevBtn.textContent = v ? '›' : '‹';
    this.chevBtn.setAttribute('aria-label', v ? 'Expand toolbar' : 'Collapse toolbar');
    document.documentElement.style.setProperty('--toolbar-w', v ? '54px' : '158px');
    if (persist) { this.app.settings.toolbarCollapsed = v; saveSettings(this.app.settings); }
  }

  buildPowers() {
    const n = this.me, app = this.app;
    const tier = n ? tierOf(n) : 1;
    this.powerEls = {};
    const catOf = (p) => (POWER_CATS.some((c) => c[0] === p.cat) ? p.cat : 'divine');
    let cat = app.settings.powerCat;
    if (!POWER_CATS.some((c) => c[0] === cat)) cat = 'divine';
    const counts = {}; for (const p of POWERS) counts[catOf(p)] = (counts[catOf(p)] || 0) + 1;
    // hide empty categories (but always keep the selected one valid)
    const cats = POWER_CATS.filter((c) => counts[c[0]]);
    if (!cats.some((c) => c[0] === cat)) cat = cats[0]?.[0] || 'divine';
    const tabsEl = h('div', { class: 'dock-tabs', role: 'tablist' }, cats.map(([id, label, icon]) =>
      h('button', { class: `dock-tab ${id === cat ? 'on' : ''}`, role: 'tab', onclick: () => { if (app.settings.powerCat === id) return; app.settings.powerCat = id; saveSettings(app.settings); this.buildPowers(); }, tip: `${label} powers (${counts[id]})` }, iconImg(icon, 2, 'px-icon sm'), h('span', {}, label))));
    const kids = [];
    let lastTier = 0;
    for (const T of TIERS) {
      const list = POWERS.filter((x) => x.tier === T.tier && catOf(x) === cat);
      if (!list.length) continue;
      if (lastTier) kids.push(h('div', { class: 'tier-sep' }));
      lastTier = T.tier;
      for (const p of list) {
        const el = h('div', { class: `power ${tier < p.tier ? 'locked' : ''}`, onclick: () => this.app.armPower(p.id), tip: `<b>${p.name}</b> <span class="muted">· Tier ${p.tier}</span><br>${p.desc}<br><span style="color:var(--accent)">✦ ${p.cost} Glitter</span> · ${p.cd} day cooldown${p.minEra ? `<br>Requires ${ERAS[p.minEra].name}` : ''}${tier < p.tier ? `<br><i>Unlocks at ${T.devotion} lifetime devotion</i>` : ''}` },
          iconImg(p.icon), h('span', { class: 'cost' }, p.cost), tier < p.tier ? h('span', { class: 'lock' }, '🔒') : null, h('div', { class: 'cd' }));
        if (p.color) el.style.setProperty('--pc', p.color);
        this.powerEls[p.id] = el; kids.push(el);
      }
    }
    const row = h('div', { class: 'power-row' }, kids);
    row.addEventListener('wheel', (e) => { if (e.deltaY && !e.deltaX) { row.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    this.powerBar.replaceChildren(tabsEl, row);
    this.tierShown = tier;
  }

  setHTML(el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; } }

  // ---------- periodic refresh ----------
  update() {
    const w = this.w, app = this.app, n = this.me;
    const d = dateString(w.time), cx = app.renderer.cam.x, lt = ((w.time + cx / w.W - 0.5) % 1 + 1) % 1, hr = Math.floor(lt * 24);
    this.setHTML(this.clockEl, `<b>Year ${d.year}</b><span>${d.season} · Day ${d.day} · ${String(hr).padStart(2, '0')}:${String(Math.floor((lt * 24 % 1) * 60 / 15) * 15).padStart(2, '0')} ${hr >= 6 && hr < 19 ? '☀' : '☾'}</span>`);
    const age = WORLD_AGES[w.age?.id]; this.ageEl.textContent = age ? age.name : ''; if (age) { this.ageEl.style.color = age.color; this.ageEl.dataset.tip = age.desc; }
    if (this._paused !== w.paused) { this._paused = w.paused; this.pauseBtn.replaceChildren(iconImg(w.paused ? 'play' : 'pause', 2, 'px-icon sm')); } this.pauseBtn.classList.toggle('active', w.paused);
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', !w.paused && Math.abs(w.speed - app.settings.speeds[i]) < 0.01));
    const cam = app.renderer.cam, a = w.atmo, ci = cellAt(a, cam.x, cam.y);
    const T = tempAt(a, w.tiles, Math.floor(clamp(cam.y, 0, w.H - 1)) * w.W + Math.floor(cam.x));
    this.setHTML(this.weatherEl, `<b>${Math.round(T)}°C · ${STORM_NAMES[a.storm[ci]]}</b><span>wind ${Math.round(Math.hypot(a.U[ci], a.V[ci]))} · ${app.renderer.mode}</span>`);
    if (n) {
      const pop = (n._pawns?.length) ?? Object.values(w.pawns).filter((p) => p.nationId === n.id && !p.dead).length;
      this.setHTML(this.popEl, `<b>${pop}</b><span>${RACES[n.race || 'human'].name}</span>`);
      const tier = tierOf(n), next = TIERS[tier];
      this.setHTML(this.glitterEl, `<b>${fmtNum(n.glitter)}</b><span>Tier ${tier}${next ? ` · ${fmtNum(n.devotion)}/${next.devotion}` : ' · max'}</span>`);
      const nx = ERAS[n.era + 1];
      this.setHTML(this.eraEl, `<b>${ERAS[n.era].name}</b><span>${nx ? `${Math.floor((n.research / nx.cost) * 100)}% to ${nx.name}` : 'Final era'}</span>`);
      { const k = n.id + '|' + n.name + '|' + n.government + '|' + JSON.stringify(n.flag); if (k !== this._pillKey) { this._pillKey = k; this.nationPill.replaceChildren(flagCanvas(n.flag, 24, 16), h('div', { class: 'stat' }, h('b', {}, n.name), h('span', {}, GOVERNMENTS.find((g) => g.id === n.government)?.name || ''))); } }
      if (tier !== this.tierShown) { this.buildPowers(); this.notify({ title: `Devotion deepens: Tier ${tier} powers unlocked!`, sev: 'success', icon: 'glitter', sound: 'era' }); }
      for (const p of POWERS) {
        const el = this.powerEls[p.id]; if (!el) continue;
        const cd = (n.cooldowns[p.id] || 0) - w.time;
        el.querySelector('.cd').style.setProperty('--cd', cd > 0 ? `${(cd / p.cd) * 100}%` : '0%');
        el.classList.toggle('armed', app.armed === p.id);
        el.style.opacity = tier >= p.tier && n.glitter < p.cost ? 0.6 : '';
      }
    } else {
      if (this._pillKey !== 'none') { this._pillKey = 'none'; this.nationPill.replaceChildren(h('div', { class: 'stat' }, h('b', {}, 'No nation'), h('span', {}, 'Click to choose a tribe'))); this.nationPill.onclick = () => app.chooseTribe(); }
    }
    this.updatePlayers();
    this.updateFeed();
    for (const [id, b] of Object.entries(this.toolBtns)) b.classList.toggle('active', app.tool === id);
    if (this.chatBox) this.chatBox.classList.toggle('hidden', app.session.mode === 'single');
    // live windows
    const now = performance.now();
    if (now - (this._winT || 0) > 450) { this._winT = now; for (const id of ['pawn', 'settlement', 'nation', 'building', 'space']) getWindow(id)?.update(); }
  }

  updatePlayers() {
    const w = this.w, app = this.app;
    if (app.session.mode === 'single') { this.playersEl.classList.add('hidden'); return; }
    this.playersEl.classList.remove('hidden');
    const ps = Object.values(w.players);
    const key = JSON.stringify(ps.map((p) => [p.id, p.online, p.nationId, w.nations[p.nationId]?.name])) + app.settings.streamerMode;
    if (key === this._plKey) return; this._plKey = key;
    this.playersEl.replaceChildren(
      h('div', { class: 'row' }, iconImg('multiplayer', 2, 'px-icon sm'), h('b', {}, 'Co-op world'), h('div', { class: 'grow' }), app.session.code ? h('span', { class: 'invite', tip: 'Invite code — share it with friends', onclick: () => { navigator.clipboard?.writeText(app.session.code); toast('Invite code copied'); } }, app.session.code) : null),
      ...ps.map((p) => { const n = w.nations[p.nationId]; return h('div', { class: 'p' }, h('span', { class: 'dot', style: { background: p.online ? 'var(--good)' : 'var(--muted)' } }), h('b', {}, p.name), p.id === w.hostId ? h('span', { class: 'chip' }, 'host') : null, h('span', { class: 'muted small grow', style: { textAlign: 'right' } }, n ? n.name : 'choosing…')); }));
  }

  // ---------- chronicle (small docked feed) ----------
  buildChronicle() {
    const app = this.app;
    this.feedList = h('div', { class: 'list' });
    this.unread = 0; this.chipOff = this.chipOff || new Set();
    this.chatIn = h('input', { type: 'text', placeholder: 'Say something…', maxlength: 200, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.value.trim()) { app.session.command({ type: 'chat', text: e.target.value }); e.target.value = ''; } if (e.key === 'Escape') e.target.blur(); } });
    this.chatBox = h('div', { class: 'chatbox' }, this.chatIn);
    this.mineBtn = h('button', { class: `chip-btn ${this.feedMine ? 'on' : ''}`, onclick: () => { this.feedMine = !this.feedMine; this.mineBtn.classList.toggle('on', this.feedMine); this.rebuildFeed(); }, tip: 'Only show events about my nation' }, 'Mine');
    const chip = (id, label, tip) => h('button', { class: `chip-btn ${this.chipOff.has(id) ? '' : 'on'}`, tip, onclick: (e) => { this.chipOff.has(id) ? this.chipOff.delete(id) : this.chipOff.add(id); e.currentTarget.classList.toggle('on', !this.chipOff.has(id)); this.rebuildFeed(); } }, label);
    this.unreadEl = h('span', { class: 'unread hidden' });
    this.lastLineEl = h('span', { class: 'last-line' }, 'Chronicle');
    const collapseBtn = h('button', { class: 'btn sm ghost icon', onclick: () => this.setChronicleCollapsed(true), tip: 'Minimise the Chronicle', 'aria-label': 'Minimise' }, '▾');
    this.feedFull = h('div', { class: 'glass feed chronicle' },
      h('div', { class: 'head' }, iconImg('scroll', 2, 'px-icon sm'), h('b', {}, 'Chronicle'), h('div', { class: 'grow' }), h('button', { class: 'btn sm ghost icon', onclick: () => showSettings(app, 'gameplay'), tip: 'Feed filters in Settings', 'aria-label': 'Feed filters' }, iconImg('settings', 2, 'px-icon sm')), collapseBtn),
      h('div', { class: 'chips' }, this.mineBtn, chip('life', 'People', 'Births, deaths, family & social'), chip('war', 'War', 'War & peace'), chip('world', 'World', 'Disasters, weather, ages & miracles'), chip('nation', 'Nation', 'Nations, eras & faith')),
      this.feedList, this.chatBox);
    this.feedPill = h('button', { class: 'glass chronicle-pill', onclick: () => this.setChronicleCollapsed(false), tip: 'Open the Chronicle' }, iconImg('scroll', 2, 'px-icon sm'), this.lastLineEl, this.unreadEl);
    this.root.append(this.feedFull, this.feedPill);
    this.setChronicleCollapsed(this.chronicleIsCollapsed(), false);
  }
  chronicleIsCollapsed() { const v = this.app.settings.chronicleCollapsed; return v === null || v === undefined ? innerWidth < 1100 || innerHeight < 640 : !!v; }
  setChronicleCollapsed(v, persist = true) {
    this.feedFull.classList.toggle('hidden', v); this.feedPill.classList.toggle('hidden', !v);
    if (!v) { this.unread = 0; this.updateUnread(); }
    if (persist) { this.app.settings.chronicleCollapsed = v; saveSettings(this.app.settings); }
    this._chronCollapsed = v;
  }
  updateUnread() { this.unreadEl.textContent = this.unread > 99 ? '99+' : String(this.unread); this.unreadEl.classList.toggle('hidden', !this.unread); }
  focusChat() { if (this.app.session.mode === 'single') return; this.setChronicleCollapsed(false, false); this.chatIn.focus(); }

  passes(e) {
    const f = this.app.settings.feedFilters;
    if (f[e.cat] === false) return false;
    const g = CHIP_GROUP[e.cat];
    if (g && this.chipOff.has(g)) return false;
    if (this.feedMine && this.me && e.nationId !== this.me.id && e.cat !== 'chat' && e.cat !== 'age') return false;
    return true;
  }
  feedItem(e) {
    const w = this.w, d = dateString(e.t);
    return h('div', { class: `item c-${e.cat} ${e.big ? 'big' : ''}`, onclick: () => this.flyTo(e) },
      h('span', {}, e.text), h('span', { class: 'when' }, `Y${d.year} ${d.season.slice(0, 2)}`));
  }
  flyTo(e) { const w = this.w; if (e.pid && w.pawns[e.pid]) this.app.focusPawn(e.pid); else if (e.x !== undefined) this.app.renderer.focus(e.x, e.y, Math.max(this.app.renderer.cam.tz, 24)); }
  rebuildFeed() { const w = this.w; this.feedList.replaceChildren(...w.log.filter((e) => this.passes(e)).slice(-60).reverse().map((e) => this.feedItem(e))); this.lastLog = w.log.length ? w.log[w.log.length - 1].id : 0; }
  updateFeed() {
    const w = this.w, fresh = w.log.filter((e) => e.id > this.lastLog);
    if (!fresh.length) return;
    this.lastLog = fresh[fresh.length - 1].id;
    const n = this.me, ctx = { myName: n?.name, pinned: this.app.renderer.pins, player: w.players?.[this.app.session.pid]?.name };
    for (const e of fresh) {
      this.app.onLogEvent(e);
      const cls = classifyEvent(e, { ...ctx, mine: !!n && e.nationId === n.id });
      if (cls) this.notify({ title: cls.title || e.text, sev: cls.sev, icon: cls.icon, x: e.x, y: e.y, pid: e.pid });
      if (!this.passes(e)) continue;
      this.feedList.prepend(this.feedItem(e));
      this.lastLineEl.textContent = e.text;
      if (this._chronCollapsed) { this.unread++; this.updateUnread(); }
    }
    while (this.feedList.children.length > 80) this.feedList.lastChild.remove();
  }

  // ---------- notification cards ----------
  notify({ title, sev = 'info', icon, x, y, pid, sound }) {
    if (!this.notifEl) return;
    const MAX = 5, MS = 7000;
    while (this.notifEl.children.length >= MAX) this.notifEl.firstChild.dispatchEvent(new Event('dismiss'));
    const clickable = pid !== undefined || x !== undefined;
    const card = h('div', { class: `notif sev-${sev} ${clickable ? 'go' : ''}`, role: 'status' },
      iconImg(icon || SEV_ICON[sev], 2, 'px-icon sm'), h('span', { class: 'ttl', title }, title),
      h('button', { class: 'x', 'aria-label': 'Dismiss', onclick: (ev) => { ev.stopPropagation(); card.dispatchEvent(new Event('dismiss')); } }, '✕'));
    let timer = null, left = MS, started = 0, gone = false;
    const start = () => { started = performance.now(); timer = setTimeout(() => card.dispatchEvent(new Event('dismiss')), left); };
    const stop = () => { clearTimeout(timer); left = Math.max(2500, left - (performance.now() - started)); };
    card.addEventListener('dismiss', () => { if (gone) return; gone = true; clearTimeout(timer); card.classList.add('out'); setTimeout(() => card.remove(), 220); card.style.pointerEvents = 'none'; });
    card.addEventListener('pointerenter', stop); card.addEventListener('pointerleave', () => { if (!gone) start(); });
    if (clickable) card.addEventListener('click', () => { this.flyTo({ pid, x, y }); });
    this.notifEl.append(card); start();
    audio.play(sound || (sev === 'danger' ? 'alert' : sev === 'success' ? 'notify' : 'chat'));
  }

  // ---------- overlays & build menu ----------
  toggleOverlayMenu() {
    if (this.overlayMenu) { this.overlayMenu.remove(); this.overlayMenu = null; return; }
    const r = this.app.renderer;
    this.overlayMenu = h('div', { class: 'glass overlay-menu' }, OVERLAYS.map(([id, label, icon]) => h('button', { class: `btn sm ${r.overlay === id ? 'active' : ''}`, style: { justifyContent: 'flex-start' }, onclick: () => { this.app.setOverlay(id); this.toggleOverlayMenu(); } }, iconImg(icon, 2, 'px-icon sm'), label)));
    this.root.append(this.overlayMenu);
  }
  openBuildMenu() {
    const n = this.me; if (!n) return toast('Choose a tribe first', { sound: 'error' });
    const body = h('div', { class: 'grid-2' }, BUILD_ORDER.filter((t) => t !== 'center').map((t) => {
      const def = BUILDINGS[t], ok = def.era <= n.era;
      const cost = scaledCost(def, n.era);
      return h('div', { class: `card ${ok ? 'pick' : ''}`, style: { opacity: ok ? 1 : 0.4 }, onclick: () => { if (!ok) return; m.close(); this.app.startPlacing(t); } },
        h('b', {}, buildingName(t, n.era)), h('div', { class: 'tiny muted' }, ok ? `${def.w}×${def.h} · ${Object.entries(cost).map(([r, v]) => `${v} ${r}`).join(', ') || 'free'}` : `Unlocks in the ${ERAS[def.era].name}`),
        h('div', { class: 'tiny', style: { marginTop: '4px' } }, describeBuilding(t)));
    }));
    const m = modal('Plan a building', h('div', { class: 'col' }, h('p', { class: 'small muted' }, 'Choose a building, then click inside your territory to place the plan. Your citizens gather materials and build it themselves. Right-click or Esc to cancel.'), body), { icon: iconImg('plan'), width: '640px' });
  }

  // ---------- inspectors ----------
  portrait(p, scale = 3) {
    const r = this.app.renderer, sh = r.sheetFor(p);
    const c = document.createElement('canvas'); c.width = 34 * scale; c.height = 34 * scale;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    if (sh?.g) x.drawImage(sh.sheet, 16, 5, 34, 34, 0, 0, 34 * scale, 34 * scale);
    else if (sh?.lpc) x.drawImage(sh.sheet, 7, (2) * LH + LPC_BAND.top - 4, 34, 34, 0, 0, 34 * scale, 34 * scale);
    else if (sh?.pack) x.drawImage(sh.sheet, 7, DIR.FRONT * PH + sh.ch.top - 2, 34, 34, 0, 0, 34 * scale, 34 * scale);
    else if (sh) x.drawImage(sh.sheet, -1, 2, 34, 34, 0, 0, 34 * scale, 34 * scale);
    return c;
  }
  openPawn(id) {
    let tab = 'overview';
    const app = this.app;
    app.session.watch([id]);
    openWindow('pawn', 'Citizen', (body, win) => {
      const w = this.w, p = w.pawns[id];
      if (!p) return h('p', { class: 'muted' }, 'This citizen is no longer in the world.');
      win.setTitle(fullName(p));
      const n = w.nations[p.nationId], s = w.settlements[p.settlementId];
      const mine = n && (n.ownerId === app.session.pid || n.perms?.[app.session.pid]?.control);
      const head = h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '12px' } },
        h('div', { class: 'portrait' }, this.portrait(p)),
        h('div', { class: 'col', style: { gap: '4px', flex: 1 } },
          h('h3', {}, fullName(p), p.dead ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, '✝ ' + (p.deathCause || 'deceased')) : null),
          h('div', { class: 'small muted' }, `${RACES[p.race || 'human'].adj} ${p.sex === 'f' ? 'woman' : 'man'} · ${Math.floor(p.age)} years · ${p.role}`),
          h('div', { class: 'small' }, n ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.openNation(n.id); } }, n.name) : 'Wanderer', s ? ` · ${s.name}` : ''),
          h('div', { class: 'small', style: { color: 'var(--accent)' } }, activity(p)),
          h('div', { class: 'row wrap', style: { marginTop: '4px' } },
            mine && !p.dead ? (p.possessedBy === app.session.pid ? h('button', { class: 'btn sm active', onclick: () => app.release() }, iconImg('possess', 2, 'px-icon sm'), 'Release') : h('button', { class: 'btn sm primary', onclick: () => app.possess(p.id) }, iconImg('possess', 2, 'px-icon sm'), 'Possess')) : null,
            h('button', { class: `btn sm ${app.renderer.pins.has(p.id) ? 'active' : ''}`, onclick: () => app.togglePin(p.id), tip: 'Pin: show a marker over them and alert on death' }, iconImg('pin', 2, 'px-icon sm'), app.renderer.pins.has(p.id) ? 'Pinned' : 'Pin'),
            h('button', { class: 'btn sm', onclick: () => app.focusPawn(p.id) }, iconImg('eye', 2, 'px-icon sm'), 'Follow'))));
      const content = h('div', { class: 'col' });
      if (tab === 'overview') {
        add(content, 
          h('div', { class: 'row' }, h('b', {}, 'Mood'), h('div', { class: 'grow' }, bar(p.mood / 100, p.mood < 30 ? 'bad' : p.mood > 65 ? 'good' : 'warn')), h('span', { class: 'small' }, Math.round(p.mood))),
          p.brk ? h('div', { class: 'chip', style: { color: 'var(--bad)' } }, 'Mental break: ', BREAK_LABELS[p.brk.type] || p.brk.type) : null,
          p.insp ? h('div', { class: 'chip', style: { color: 'var(--accent)' } }, 'Inspired!') : null,
          h('div', { class: 'grid-2' }, ['food', 'rest', 'joy', 'social'].map((k) => h('div', {}, h('div', { class: 'tiny muted', style: { textTransform: 'capitalize' } }, k === 'food' ? 'Hunger' : k), bar(p.needs?.[k] ?? 0.5, (p.needs?.[k] ?? 1) < 0.25 ? 'bad' : '')))),
          h('b', {}, 'Traits'), h('div', {}, (p.traits || []).map((t) => TRAITS[t] && h('span', { class: 'trait', style: { color: TRAITS[t].color, borderColor: TRAITS[t].color }, tip: TRAITS[t].desc }, TRAITS[t].name))),
          h('b', {}, 'Thoughts'), h('div', {}, (p.thoughts || []).slice(0, 14).map((t) => THOUGHTS[t.id] && h('div', { class: 'thought' }, h('span', {}, THOUGHTS[t.id].label), h('b', { class: THOUGHTS[t.id].mood >= 0 ? 'pos' : 'neg' }, (THOUGHTS[t.id].mood >= 0 ? '+' : '') + Math.round(THOUGHTS[t.id].mood * (t.m || 1))))), !(p.thoughts || []).length ? h('div', { class: 'small muted' }, 'Nothing much on their mind.') : null),
        );
      }
      if (tab === 'skills') add(content, ...SKILLS.map((sk) => { const v = p.skills?.[sk.id] || { lvl: 0, passion: 0 }; return h('div', { class: 'skill' }, h('span', {}, sk.name), h('span', { class: 'flame' }, v.passion === 2 ? '🔥🔥' : v.passion === 1 ? '🔥' : ''), bar(v.lvl / 20), h('b', {}, v.lvl)); }));
      if (tab === 'health') {
        add(content, h('div', { class: 'row' }, h('b', {}, 'Health'), h('div', { class: 'grow' }, bar((p.hp || 0) / 100, p.hp < 40 ? 'bad' : 'good')), h('span', { class: 'small' }, Math.round(p.hp))),
          h('div', { class: 'grid-2 small' }, h('div', {}, 'Blood ', bar(p.blood ?? 1, (p.blood ?? 1) < 0.6 ? 'bad' : '')), h('div', {}, 'Pain ', bar(p.pain || 0, 'warn'))),
          p.downed ? h('div', { class: 'chip', style: { color: 'var(--bad)' } }, 'Downed — needs a doctor') : null,
          h('b', {}, 'Injuries'), ...(p.injuries || []).map((j) => h('div', { class: 'thought' }, h('span', {}, `${PARTS[j.part]} — ${j.kind}${j.bleed > 0 && !j.tq ? ' (bleeding)' : ''}`), h('span', { class: j.tq ? 'pos' : 'neg' }, j.tq ? `tended ${Math.round(j.tq * 100)}%` : 'untended'))), !(p.injuries || []).length ? h('div', { class: 'small muted' }, 'No injuries.') : null,
          h('b', {}, 'Diseases'), ...(p.diseases || []).map((d) => h('div', { class: 'col', style: { gap: '3px' } }, h('div', { class: 'small' }, DISEASES[d.id]?.name || d.id, d.tended ? ' · treated' : ''), h('div', { class: 'grid-2 tiny' }, h('div', {}, 'Severity', bar(d.sev, 'bad')), h('div', {}, 'Immunity', bar(d.imm || 0, 'good'))))), !(p.diseases || []).length ? h('div', { class: 'small muted' }, 'Healthy.') : null);
      }
      if (tab === 'social') {
        const fam = [...(p.parents || []), p.spouse, p.lover, ...(p.children || [])].filter((x) => x >= 0 && w.pawns[x]);
        const rel = Object.entries(p.rel || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 16);
        const link = (q) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.openPawn(q.id); } }, fullName(q));
        add(content, h('b', {}, 'Family'), ...fam.map((id) => { const q = w.pawns[id]; return h('div', { class: 'thought' }, link(q), h('span', { class: 'muted' }, relationLabel(p, q) + (q.dead ? ' ✝' : ''))); }), !fam.length ? h('div', { class: 'small muted' }, 'No living family nearby.') : null,
          h('b', {}, 'Relationships'), ...rel.map(([id, op]) => { const q = w.pawns[id]; return q ? h('div', { class: 'thought' }, link(q), h('span', { class: op >= 0 ? 'pos' : 'neg' }, `${relationLabel(p, q)} (${op > 0 ? '+' : ''}${Math.round(op)})`)) : null; }));
      }
      if (tab === 'gear') { const e = ERAS[p.gearEra ?? 0]; add(content, h('div', { class: 'kv' }, h('dt', {}, 'Outfit era'), h('dd', {}, e.name), h('dt', {}, 'Weapon'), h('dd', {}, e.weapon.name), h('dt', {}, 'Armor'), h('dd', {}, `${Math.round(e.armor * 100)}%`), h('dt', {}, 'Insulation'), h('dd', {}, `comfortable down to ~${Math.round(16 - e.insul * 42)}°C`), h('dt', {}, 'Kills'), h('dd', {}, p.kills || 0))); }
      return h('div', { class: 'col' }, head, tabs([['overview', 'Overview'], ['skills', 'Skills'], ['health', 'Health'], ['social', 'Social'], ['gear', 'Gear']], tab, (t) => { tab = t; win.update(); }), content);
    }, { x: innerWidth - 790, y: 90, w: 420, h: 560, icon: iconImg('inspect'), onClose: () => app.session.watch([]) });
  }

  openSettlement(id) {
    const app = this.app;
    openWindow('settlement', 'Settlement', (body, win) => {
      const w = this.w, s = w.settlements[id];
      if (!s) return h('p', { class: 'muted' }, 'This settlement is gone.');
      const n = w.nations[s.nationId]; win.setTitle(s.name);
      const canPlan = n && (n.ownerId === app.session.pid || n.perms?.[app.session.pid]?.plan);
      const blds = s.buildings.map((bid) => w.buildings[bid]).filter(Boolean);
      const pawns = Object.values(w.pawns).filter((p) => p.settlementId === s.id && !p.dead);
      return h('div', { class: 'col' },
        h('div', { class: 'row' }, n?.flag ? flagCanvas(n.flag, 24, 16) : null, h('div', { class: 'col', style: { gap: '2px' } }, h('h3', {}, s.name, s.capital ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, 'Capital') : null), h('span', { class: 'small muted' }, `${n?.name || ''} · ${RACES[n?.race || 'human'].name} · ${ERAS[n?.era || 0].name}`))),
        h('div', { class: 'grid-3' }, h('div', { class: 'card center' }, h('b', {}, pawns.length), h('div', { class: 'tiny muted' }, 'citizens')), h('div', { class: 'card center' }, h('b', {}, s.housing ?? '?'), h('div', { class: 'tiny muted' }, 'beds')), h('div', { class: 'card center' }, h('b', {}, Math.round(s.mood || 50)), h('div', { class: 'tiny muted' }, 'avg mood'))),
        h('b', {}, 'Stores'), h('div', { class: 'grid-2' }, RESOURCES.map((r) => h('div', { class: 'row small' }, iconImg(RES_ICON[r], 2, 'px-icon sm'), h('span', { class: 'grow' }, RES_LABEL[r]), h('b', {}, fmtNum(s.stock[r] || 0))))),
        s.until?.shield > w.time ? h('div', { class: 'chip', style: { color: 'var(--info)' } }, 'Under divine shield') : null,
        h('div', { class: 'row' }, h('b', { class: 'grow' }, 'Buildings'), canPlan ? h('button', { class: 'btn sm primary', onclick: () => this.openBuildMenu() }, iconImg('plan', 2, 'px-icon sm'), 'Plan') : null),
        h('div', {}, blds.map((b) => h('div', { class: 'thought', style: { cursor: 'pointer' }, onclick: () => app.renderer.focus(b.x + b.w / 2, b.y + b.h / 2, Math.max(app.renderer.cam.tz, 40)) }, h('span', {}, buildingName(b.type, b.era ?? 0)), h('span', { class: b.built ? 'muted' : 'neg' }, b.built ? '' : `building ${Math.round(b.progress * 100)}%`)))),
        h('b', {}, 'People'), h('div', { class: 'row wrap' }, pawns.slice(0, 60).map((p) => h('button', { class: 'btn sm', onclick: () => this.openPawn(p.id) }, p.name))),
      );
    }, { x: innerWidth - 790, y: 90, w: 420, h: 560, icon: iconImg('house') });
  }

  openBuilding(id) {
    const w = this.w, b = w.buildings[id]; if (!b) return;
    this.openSettlement(b.sid);
  }

  openAnimal(id) {
    const a = this.w.animals[id]; if (!a) return;
    const A = ANIMALS[a.kind];
    toast(`${A.name}${a.dead ? ' (dead)' : ''} · ${A.predator ? 'predator' : 'wild'} · ${Math.max(0, Math.round(a.hp ?? A.hp))} hp`);
  }

  openNation(id) {
    let tab = 'overview';
    const app = this.app;
    openWindow('nation', 'Nation', (body, win) => {
      const w = this.w, n = w.nations[id];
      if (!n) return h('p', {}, 'Gone.');
      win.setTitle(n.name);
      const mine = n.ownerId === app.session.pid;
      const pawns = Object.values(w.pawns).filter((p) => p.nationId === n.id && !p.dead);
      const leader = w.pawns[n.leaderId];
      const owner = n.ownerId ? w.players[n.ownerId] : null;
      const content = h('div', { class: 'col' });
      if (tab === 'overview') {
        const nx = ERAS[n.era + 1], tier = tierOf(n), nt = TIERS[tier];
        add(content, 
          h('div', { class: 'row' }, (() => { const c = flagCanvas(n.flag, 48, 32); c.style.width = '96px'; c.style.height = '64px'; c.style.imageRendering = 'pixelated'; c.style.borderRadius = '6px'; return c; })(),
            h('div', { class: 'col', style: { gap: '3px' } }, h('h3', {}, n.name), h('span', { class: 'small muted' }, `${RACES[n.race || 'human'].name} · ${GOVERNMENTS.find((g) => g.id === n.government)?.name}`), h('span', { class: 'small' }, owner ? `Patron deity: ${owner.name}` : 'Guided by fate (AI)'), mine ? h('button', { class: 'btn sm', onclick: () => showFlagEditor(app, n) }, iconImg('flag', 2, 'px-icon sm'), 'Edit flag & name') : null)),
          h('div', { class: 'kv' }, h('dt', {}, 'Leader'), h('dd', {}, leader ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.openPawn(leader.id); } }, fullName(leader)) : '—'), h('dt', {}, 'Population'), h('dd', {}, pawns.length), h('dt', {}, 'Settlements'), h('dd', {}, Object.values(w.settlements).filter((s) => s.nationId === n.id).length), h('dt', {}, 'Stability'), h('dd', {}, bar(n.stability / 100, n.stability < 30 ? 'bad' : 'good'))),
          h('b', {}, `Era: ${ERAS[n.era].name}`), nx ? h('div', {}, bar(n.research / nx.cost), h('div', { class: 'tiny muted' }, `${fmtNum(n.research)} / ${fmtNum(nx.cost)} research → ${nx.name}`)) : h('div', { class: 'small muted' }, 'Your people have reached the stars.'),
          mine ? h('div', {}, h('b', {}, `Devotion tier ${tier}`), nt ? bar(n.devotion / nt.devotion) : null, h('div', { class: 'tiny muted' }, nt ? `${fmtNum(n.devotion)} / ${nt.devotion} lifetime Glitter to unlock ${nt.name}` : 'All powers unlocked')) : null,
          h('div', { class: 'small muted' }, `Births ${n.stats.births} · Deaths ${n.stats.deaths} · Miracles ${n.stats.miracles}`),
        );
      }
      if (tab === 'will') {
        add(content, h('p', { class: 'small muted' }, mine ? 'Set the direction your people\'s beliefs drift toward. Prophets speed it up; Ideological Revelation pushes it instantly.' : 'Their beliefs.'));
        for (const ax of AXES) {
          const v = n.ideology[ax.id], t = n.ideologyTarget?.[ax.id] ?? v;
          add(content, h('div', { class: 'axis' }, h('span', { class: 'pole', tip: ax.negDesc }, ax.neg), h('div', { class: 'col', style: { gap: '2px' } },
            h('div', { class: 'bar' }, h('i', { style: { width: `${(v + 100) / 2}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' } })),
            mine ? h('input', { type: 'range', min: -100, max: 100, value: Math.round(t), onchange: (e) => app.session.command({ type: 'ideologyTarget', target: { [ax.id]: +e.target.value } }) }) : null), h('span', { class: 'pole r', tip: ax.posDesc }, ax.pos)));
        }
        if (mine) add(content, h('b', {}, 'Decrees'),
          h('div', { class: 'settings-grid' }, h('span', {}, 'Food rations'), h('select', { onchange: (e) => app.session.command({ type: 'decree', key: 'rations', value: e.target.value }) }, [['strict', 'Strict (save food, unhappy)'], ['normal', 'Normal'], ['generous', 'Generous (happy, hungry stores)']].map(([v, l]) => h('option', { value: v, selected: n.laws.rations === v }, l))),
            h('span', {}, 'National focus'), h('select', { onchange: (e) => app.session.command({ type: 'decree', key: 'focus', value: e.target.value }) }, [['balanced', 'Balanced'], ['food', 'Food & farming'], ['science', 'Science'], ['faith', 'Faith & worship'], ['military', 'Military'], ['build', 'Construction']].map(([v, l]) => h('option', { value: v, selected: n.laws.focus === v }, l))),
            h('span', {}, `Conscription ${Math.round(n.laws.conscription * 100)}%`), h('input', { type: 'range', min: 2, max: 50, value: Math.round(n.laws.conscription * 100), onchange: (e) => app.session.command({ type: 'decree', key: 'conscription', value: e.target.value / 100 }) }),
            h('span', {}, 'Allow raids on enemies'), h('input', { type: 'checkbox', checked: n.laws.raids !== false, onchange: (e) => app.session.command({ type: 'decree', key: 'raids', value: e.target.checked }) })));
      }
      if (tab === 'diplo') {
        const me = this.me;
        if (me && me.proposals?.length && mine) add(content, h('b', {}, 'Proposals'), ...me.proposals.map((pr) => { const o = w.nations[pr.from]; return h('div', { class: 'card row' }, h('span', { class: 'grow' }, `${o?.name} proposes ${pr.kind}`), h('button', { class: 'btn sm primary', onclick: () => app.session.command({ type: 'answer', from: pr.from, kind: pr.kind, accept: true }) }, 'Accept'), h('button', { class: 'btn sm', onclick: () => app.session.command({ type: 'answer', from: pr.from, kind: pr.kind, accept: false }) }, 'Decline')); }));
        add(content, h('b', {}, 'Nations of the world'));
        for (const o of Object.values(w.nations)) {
          if (o.dead || o.id === n.id || o.raider) continue;
          const r = n.relations[o.id] || { state: 'peace', opinion: 0 };
          const act = mine ? h('div', { class: 'row' },
            r.state === 'war' ? h('button', { class: 'btn sm', onclick: () => cmd({ type: 'diplo', to: o.id, action: 'peace' }) }, 'Offer peace') : h('button', { class: 'btn sm danger', onclick: () => { if (confirm(`Declare war on ${o.name}? Your armies will fight theirs. (Divine powers never affect another player's nation without permission.)`)) cmd({ type: 'diplo', to: o.id, action: 'war' }); } }, 'War'),
            r.state === 'ally' ? h('button', { class: 'btn sm', onclick: () => cmd({ type: 'diplo', to: o.id, action: 'breakAlliance' }) }, 'End alliance') : r.state !== 'war' ? h('button', { class: 'btn sm', onclick: () => cmd({ type: 'diplo', to: o.id, action: 'alliance' }) }, 'Ally') : null,
            h('button', { class: 'btn sm', tip: 'Send 20 food from your capital', onclick: () => cmd({ type: 'diplo', to: o.id, action: 'gift', res: 'food', amount: 20 }) }, 'Gift')) : null;
          add(content, h('div', { class: 'card col', style: { gap: '6px' } }, h('div', { class: 'row' }, h('span', { class: 'dot', style: { background: o.color } }), h('b', { class: 'grow', style: { cursor: 'pointer' }, onclick: () => this.openNation(o.id) }, o.name), o.ownerId ? h('span', { class: 'chip' }, '★ ' + (w.players[o.ownerId]?.name || 'player')) : null, h('span', { class: `chip`, style: { color: r.state === 'war' ? 'var(--bad)' : r.state === 'ally' ? 'var(--good)' : '' } }, r.state), h('span', { class: `small ${r.opinion >= 0 ? 'pos' : 'neg'}` }, Math.round(r.opinion))), act));
        }
      }
      if (tab === 'perms' && mine) {
        const others = Object.values(w.players).filter((p) => p.id !== app.session.pid);
        add(content, h('p', { class: 'small muted' }, 'Nobody can use powers on your people, plan buildings in your cities or possess your citizens unless you allow it here. War between nations is fought by mortals only.'));
        if (!others.length) add(content, h('p', { class: 'muted' }, 'No other players in this world yet.'));
        for (const pl of others) add(content, h('div', { class: 'card col' }, h('b', {}, pl.name), ...Object.entries(PERMS).map(([k, label]) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!n.perms?.[pl.id]?.[k], onchange: (e) => app.session.command({ type: 'perm', player: pl.id, key: k, value: e.target.checked }) }), label))));
      }
      const cmd = async (c) => { const r = await app.session.command(c); if (!r.ok) toast(r.msg || 'Refused', { sound: 'error' }); else if (r.msg) toast(r.msg); };
      const tabList = [['overview', 'Overview'], ['will', mine ? 'Divine Will' : 'Beliefs'], ['diplo', 'Diplomacy']];
      if (mine && app.session.mode !== 'single') tabList.push(['perms', 'Permissions']);
      return h('div', { class: 'col' }, tabs(tabList, tab, (t) => { tab = t; win.update(); }), content);
    }, { x: 90, y: 90, w: 440, h: 600, icon: iconImg('flag') });
  }

  openSpace() {
    openWindow('space', 'Offworld', () => {
      const w = this.w, me = this.me;
      const objs = w.space;
      const label = { satellite: 'Satellite', station: 'Orbital station', moonbase: 'Lunar mining base', ark: 'Colony ark' };
      return h('div', { class: 'col' },
        h('p', { class: 'small muted' }, 'Zoom all the way out to see orbit. Nations in the Atomic era launch satellites; Offworld nations with a Launch Complex build stations, moon bases and colony arks.'),
        objs.length ? objs.map((o) => h('div', { class: 'thought' }, h('span', {}, label[o.type] || o.type), h('span', { class: 'muted' }, w.nations[o.nationId]?.name || '?'))) : h('p', { class: 'muted' }, 'Nothing in orbit yet.'),
        me && me.era < 7 ? h('div', { class: 'small' }, `Your people need the Atomic era (${ERAS[7].cost.toLocaleString()} research) to reach orbit.`) : null,
        h('button', { class: 'btn', onclick: () => { this.app.renderer.cam.tz = 0.5; } }, iconImg('globe', 2, 'px-icon sm'), 'View from orbit'));
    }, { x: 90, y: 120, w: 360, h: 380, icon: iconImg('rocket') });
  }
}

export function describeBuilding(t) {
  const f = BUILDINGS[t].fn;
  const parts = [];
  if (f.housing) parts.push(`houses ${f.housing}`); if (f.storage) parts.push('stores goods'); if (f.cook) parts.push('cooking'); if (f.rations) parts.push('preserved rations');
  if (f.research) parts.push('research'); if (f.worship) parts.push('worship → Glitter'); if (f.beds) parts.push(`${f.beds} hospital beds`); if (f.craft) parts.push('crafts gear & medicine');
  if (f.farm) parts.push('crops'); if (f.train) parts.push('soldiers'); if (f.mine) parts.push('mining'); if (f.joy) parts.push('recreation'); if (f.pollution) parts.push('pollutes');
  if (f.shield) parts.push('energy shield'); if (f.launch) parts.push('space launches'); if (f.power) parts.push('power & research');
  return parts.join(' · ');
}

function activity(p) {
  if (p.dead) return 'Resting in peace';
  if (p.possessedBy) return 'Possessed by a deity';
  if (p.brk) return BREAK_LABELS[p.brk.type] || 'Mental break';
  if (p.downed) return 'Downed';
  const j = p.job?.type;
  const map = { sleep: 'Sleeping', eat: 'Eating', gather: 'Foraging', gatherFeat: 'Gathering', farm: 'Farming', hunt: 'Hunting', cook: 'Cooking', build: 'Building', research: 'Researching', worship: 'Worshipping', relax: 'Relaxing', craft: 'Crafting', brew: 'Brewing medicine', chat: 'Chatting', doctor: 'Tending the sick', patient: 'Recovering in bed', firefight: 'Fighting a fire', fish: 'Fishing', patrol: 'On patrol', fight: 'Fighting!', raid: 'Marching to war', play: 'Playing', learn: 'Learning', wander: 'Wandering', preach: 'Preaching' };
  return map[j] || (p.state === 'walk' ? 'Walking' : 'Idle');
}
