// Ancestry World — app bootstrap, game loop, input, possession, power targeting, audio & autosave.
import { loadSettings, saveSettings, applySettings } from './ui/settings.js';
import { h, toast, modal, wireUISounds, wireTooltips, closeAllWindows, colorWheel } from './ui/dom.js';
import { initCursor, setCursor, setCursorTint } from './ui/cursor.js';
import { showMainMenu, showFlagEditor, showSettings, showCodex, showChangelog } from './ui/menu.js';
import { HUD } from './ui/hud.js';
import { Tutorial } from './ui/tutorial.js';
import { autosave, saveWorld } from './ui/storage.js';
import { autoPush } from './ui/cloud.js';
import { Renderer } from './render/renderer.js';
import { loadLPC } from './render/lpc.js';
import { loadCharacterPack } from './render/charpack.js';
import { iconImg } from './render/miscart.js';
import { audio } from './audio/audio.js';
import { createWorld } from './sim/world.js';
import { canPlace, placeCheck } from './sim/world.js';
import { Session } from './net/session.js';
import { serializeWorld, deserializeWorld } from './net/serialize.js';
import { powerById } from './data/powers.js';
import { BUILDINGS, buildCost, buildingName } from './data/buildings.js';
import { RACES } from './data/races.js';
import { ERAS } from './data/eras.js';
import { NATION_COLORS } from './data/names.js';
import { cellAt } from './world/atmosphere.js';
import { BIOMES } from './data/biomes.js';
import { wrap, clamp, dist } from './core/util.js';
const wdx = (a, b, W) => { let d = b - a; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
import { dateString } from './sim/world.js';
import { CURRENT_VERSION } from './data/changelog.js';

const SIZES = { small: [512, 256], normal: [768, 384], large: [1024, 512], huge: [1536, 768] };

class App {
  async boot() {
    this.settings = loadSettings(); applySettings(this.settings);
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas, this.settings);
    initCursor(() => this.settings.cursorTrail);
    wireUISounds(); wireTooltips(() => this.settings.tooltipDelay);
    addEventListener('resize', () => this.renderer.resize());
    const unlock = () => { audio.init(); audio.setMusicSource(this.settings.musicSource, () => this.session?.myNation?.era ?? 0, (t) => this.session && toast(`♪ Now playing: ${t.title}`, { sound: false, ms: 2600 })); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    this.bindInput();
    this.initBackground();
    this.setLoading('Waking the gods…', 0.2);
    await Promise.all([loadLPC(), loadCharacterPack()]);
    this.setLoading('Shaping a world…', 0.6);
    await new Promise((r) => setTimeout(r, 20));
    this.menuWorld();
    this.setLoading(null);
    showMainMenu(this);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  setLoading(text, p = 0) {
    const el = document.getElementById('loading');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.querySelector('.msg').textContent = text; el.querySelector('.bar i').style.width = `${p * 100}%`;
  }
  onSettingsChanged() { this.renderer.sheets.clear(); this.renderer.lastSheet?.clear(); this.renderer.refreshOwner?.(); this.hud?.buildPowers(); audio.setMusicSource(this.settings.musicSource); }

  // ---------- menu background ----------
  menuWorld() {
    const w = createWorld({ seed: (Math.random() * 1e9) | 0, name: 'menu', W: 256, H: 128, aiNations: 5 });
    this.menuSession = Session.single(w, 'menu');
    for (let i = 0; i < 300; i++) this.menuSession.game.step(1 / 300);
    this.renderer.attach(w); this.renderer.menuMode = true;
    this.renderer.cam.zoom = this.renderer.cam.tz = 1.35; this.renderer.cam.lat0 = 0.3;
    this.session = null;
  }

  // ---------- starting games ----------
  async newWorld(o) {
    this.setLoading('Raising continents…', 0.3);
    await new Promise((r) => setTimeout(r, 30));
    const [W, H] = SIZES[o.size] || SIZES.normal;
    const world = createWorld({ seed: o.seed, name: o.name || 'New Globe', W, H, aiNations: o.ai, founders: o.founders ?? 2 });
    world.settings = { ...world.settings, peacefulAI: o.peacefulAI, hostOnlySpeed: o.hostOnlySpeed };
    this.setLoading('Lighting the first fires…', 0.7);
    let session;
    try { session = o.multiplayer ? await Session.host(world, o.player, { maxPlayers: o.maxPlayers }) : Session.single(world, o.player); }
    catch (e) { this.setLoading(null); toast(e.message, { sound: 'error', ms: 5000 }); return; }
    const r = await session.command({ type: 'claim', race: o.race, color: o.color, name: o.tribe || undefined });
    if (!r.ok) toast(r.msg, { sound: 'error' });
    this.startGame(session);
  }
  async joinWorld(code, name) {
    this.setLoading('Travelling to your friend\'s world…', 0.4);
    try { const s = await Session.join(code, name); this.startGame(s); if (!s.myNation) setTimeout(() => this.chooseTribe(), 400); }
    catch (e) { this.setLoading(null); toast(e.message, { sound: 'error', ms: 5000 }); }
  }
  async loadWorld(data, asHost) {
    this.setLoading('Restoring your world…', 0.5);
    await new Promise((r) => setTimeout(r, 20));
    try {
      const world = deserializeWorld(data);
      const name = this.settings.playerName || 'Deity';
      const session = asHost ? await Session.host(world, name) : Session.single(world, name);
      this.startGame(session);
      if (!session.myNation) setTimeout(() => this.chooseTribe(), 400);
    } catch (e) { console.error(e); this.setLoading(null); toast('Could not load that world: ' + e.message, { sound: 'error', ms: 5000 }); }
  }
  startGame(session) {
    document.getElementById('menu').classList.add('hidden');
    closeAllWindows();
    this.session = session; this.menuSession = null;
    this.renderer.menuMode = false;
    this.renderer.attach(session.world);
    session.on('tiles', (set) => this.renderer.invalidate(set));
    session.on('disconnected', (msg) => { toast(msg, { big: true, sound: 'alert' }); setTimeout(() => this.quitToMenu(), 1500); });
    this.tool = 'inspect'; this.setArmed(null); this.selection = null; this.autosaveT = 0; this.lastAutosave = Date.now();
    this.hud = new HUD(this);
    this.tutorial = new Tutorial(this);
    this.renderer.onFxHook = (e) => this.fxSound(e);
    const n = session.myNation;
    const cap = n && session.world.settlements[n.capitalId];
    if (cap) this.renderer.focus(cap.x, cap.y, 40); else this.renderer.focus(session.world.W / 2, session.world.H / 2, 2);
    this.setLoading(null);
    audio.play('era');
    this.onTutorialDone = () => { const nn = this.session?.myNation; if (nn && !nn.flagSet && !(this.session.mode === 'client' && nn.flag)) showFlagEditor(this, nn, { first: true }); };
    if (!this.tutorial.start()) this.onTutorialDone();
  }
  quitToMenu() {
    this.session?.close(); closeAllWindows();
    document.getElementById('ui').replaceChildren(); this.hud = null;
    this.menuWorld(); showMainMenu(this);
  }
  openMenu() {
    const m = modal('Paused menu', h('div', { class: 'col' },
      h('button', { class: 'btn', onclick: () => { m.close(); } }, iconImg('play'), 'Resume'),
      h('button', { class: 'btn', onclick: () => { m.close(); this.save(); } }, iconImg('save'), 'Save world'),
      h('button', { class: 'btn', onclick: () => { m.close(); this.exportSave(); } }, iconImg('load'), 'Export save file'),
      h('button', { class: 'btn', onclick: () => { m.close(); showSettings(this); } }, iconImg('settings'), 'Settings'),
      h('button', { class: 'btn', onclick: () => { m.close(); showCodex(); } }, iconImg('book'), 'Codex'),
      h('button', { class: 'btn', onclick: () => { m.close(); showChangelog(this); } }, iconImg('scroll'), "What's New"),
      h('button', { class: 'btn danger', onclick: async () => { m.close(); if (this.session.mode !== 'client') await this.save(true); this.quitToMenu(); } }, iconImg('close'), this.session.mode === 'client' ? 'Leave world' : 'Save & quit to menu')), { icon: iconImg('settings'), width: '360px' });
  }
  chooseTribe() {
    const w = this.session.world;
    let race = 'human', color = NATION_COLORS.find((c) => !Object.values(w.nations).some((n) => !n.dead && n.color === c)) || NATION_COLORS[1];
    const body = h('div', { class: 'col' });
    const wheel = colorWheel({ value: color, onChange: (c) => { color = c; } });
    const render = () => body.replaceChildren(
      h('p', { class: 'muted' }, 'Every deity needs a people. Found a brand-new tribe on free land, or adopt one of the AI tribes that has no patron yet.'),
      h('div', { class: 'grid-3' }, Object.entries(RACES).map(([id, r]) => h('div', { class: `card pick ${race === id ? 'on' : ''}`, onclick: () => { race = id; render(); } }, h('b', {}, r.name), h('div', { class: 'tiny muted' }, r.desc)))),
      h('div', { class: 'small muted' }, 'Your colour on the map'), wheel,
      h('button', { class: 'btn primary', onclick: async () => { const r = await this.session.command({ type: 'claim', race, color }); if (r.ok) { m.close(); this.afterClaim(); } else toast(r.msg, { sound: 'error' }); } }, iconImg('globe'), 'Found a new tribe'),
      h('h3', {}, 'Or adopt an AI tribe'),
      ...Object.values(w.nations).filter((n) => !n.dead && !n.ownerId && !n.raider).slice(0, 12).map((n) => h('div', { class: 'card row' }, h('span', { class: 'dot', style: { background: n.color } }), h('b', { class: 'grow' }, n.name), h('span', { class: 'small muted' }, `${RACES[n.race || 'human'].name} · ${ERAS[n.era].name}`), h('button', { class: 'btn sm', onclick: async () => { const r = await this.session.command({ type: 'claim', nationId: n.id }); if (r.ok) { m.close(); this.afterClaim(); } else toast(r.msg, { sound: 'error' }); } }, 'Adopt'))));
    render();
    const m = modal('Choose your people', body, { icon: iconImg('users'), width: '640px' });
  }
  afterClaim() {
    setTimeout(() => { const n = this.session.myNation; const cap = n && this.session.world.settlements[n.capitalId]; if (cap) this.renderer.focus(cap.x, cap.y, 40); this.hud?.buildPowers(); if (n && !n.flagSet) showFlagEditor(this, n, { first: true }); }, 400);
  }

  // ---------- save ----------
  saveMeta() {
    const w = this.session.world, n = this.session.myNation;
    return { name: w.name, nation: n?.name, era: n?.era ?? 0, year: dateString(w.time).year, pop: n ? Object.values(w.pawns).filter((p) => p.nationId === n.id && !p.dead).length : 0, thumb: this.renderer.thumbnail() };
  }
  async save(quiet = false) {
    if (!this.session || this.session.mode === 'client') return toast('Only the host can save a co-op world.', { sound: 'error' });
    try { const key = `save:${this.session.world.seed}:${this.session.world.name}`, data = serializeWorld(this.session.world), meta = this.saveMeta(); await saveWorld(key, data, meta); if (!quiet) toast('World saved', { sound: 'confirm' }); autoPush(key, data, { ...meta, thumb: undefined, savedAt: Date.now() }, this.settings.cloudAuto); }
    catch (e) { console.error(e); toast('Save failed: ' + e.message, { sound: 'error' }); }
  }
  exportSave() {
    if (this.session.mode === 'client') return;
    const blob = new Blob([JSON.stringify(serializeWorld(this.session.world))], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${this.session.world.name.replace(/\W+/g, '_')}.awsave`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- autosave ----------
  tickAutosave(dt) {
    const every = this.settings.autosaveEvery;
    if (!every || this.session.mode === 'client') return; // only the host / single player autosaves
    this.autosaveT += dt;
    if (this.autosaveT >= every * 60) this.doAutosave();
  }
  async doAutosave(reason = 'timer') {
    const s = this.session;
    if (!s || s.mode === 'client' || !this.settings.autosaveEvery || this._autosaving) return;
    if (reason !== 'timer' && Date.now() - (this.lastAutosave || 0) < 15000) return;
    this.autosaveT = 0; this._autosaving = true; this.lastAutosave = Date.now();
    try {
      const w = s.world;
      const data = serializeWorld(w), meta = this.saveMeta();
      await autosave(`${w.seed}`, data, meta, this.settings.autosaveSlots);
      autoPush(`auto:${w.seed}`, data, { ...meta, thumb: undefined, auto: true, savedAt: Date.now() }, this.settings.cloudAuto);
      if (reason === 'timer') this.autosaveIndicator();
    } catch (e) { console.warn('autosave failed', e); }
    this._autosaving = false;
  }
  autosaveIndicator() {
    if (!this._autoInd) { this._autoInd = h('div', { class: 'autosave-ind glass' }, '✓ Autosaved'); document.body.append(this._autoInd); }
    const el = this._autoInd; el.classList.add('show'); clearTimeout(this._autoIndT);
    this._autoIndT = setTimeout(() => el.classList.remove('show'), 1500);
  }

  // ---------- update banner ----------
  async checkVersion() {
    try {
      const r = await fetch('version.json?' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json())?.version;
      if (!v || typeof v !== 'string' || v === CURRENT_VERSION || v === this._bannerDismissed) return;
      this.showUpdateBanner(v);
    } catch (e) { /* offline or dev server: ignore */ }
  }
  // A plain reload can keep serving the old files from the HTTP cache; refresh them all first, then reload.
  async reloadFresh(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    try {
      const r = await fetch('version.json?' + Date.now(), { cache: 'no-store' });
      const files = (await r.json())?.files || [];
      await Promise.all([...files, 'version.json'].map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
    } catch (e) { /* fall through to a normal reload */ }
    location.reload();
  }
  showUpdateBanner(v) {
    if (this._banner) { if (this._banner.dataset.v === v) return; this._banner.remove(); }
    const b = h('div', { class: 'update-banner glass', role: 'alert', 'data-v': v },
      iconImg('star', 2, 'px-icon sm'), h('span', {}, `New update is out (v${v}) — please reload`),
      h('button', { class: 'btn sm primary', onclick: (e) => this.reloadFresh(e.currentTarget) }, 'Reload'),
      h('button', { class: 'btn sm ghost icon', 'aria-label': 'Dismiss for this session', tip: 'Dismiss for this session', onclick: () => { this._bannerDismissed = v; b.remove(); this._banner = null; } }, '✕'));
    document.body.append(b); this._banner = b;
  }
  initBackground() {
    this.checkVersion();
    setInterval(() => this.checkVersion(), 120000);
    addEventListener('focus', () => this.checkVersion());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.doAutosave('hidden'); else this.checkVersion(); });
    addEventListener('pagehide', () => this.doAutosave('unload'));
    addEventListener('beforeunload', () => this.doAutosave('unload'));
  }

  // ---------- commands from UI ----------
  setSpeed(v) { this.session?.command({ type: 'speed', speed: v, paused: false }).then((r) => !r.ok && toast(r.msg, { sound: 'error' })); }
  togglePause() { const w = this.session?.world; if (w) this.session.command({ type: 'speed', paused: !w.paused }).then((r) => !r.ok && toast(r.msg, { sound: 'error' })); }
  /** Single place where the armed power changes: keeps the cursor tint and the renderer's radius brush in step. */
  setArmed(id) {
    this.armed = id || null;
    const P = id ? powerById[id] : null;
    try { setCursorTint(P ? P.color || '#ffd34d' : null); } catch (e) { /* cursor module optional */ }
    this.renderer.brush = P ? { radius: P.radius || 2, color: P.color || '#ffd34d', power: P.id } : null;
  }
  setTool(t) { this.tool = t; this.setArmed(null); this.renderer.ghost = null; this.renderer.powerPreview = null; setCursor(t === 'build' ? 'build' : 'pointer'); this.updateModeChip(); }
  setOverlay(id) { this.renderer.overlay = this.renderer.overlay === id ? 'none' : id; audio.play('toggle'); if (id === 'borders') this.renderer.settings.alwaysBorders = this.renderer.overlay === 'borders'; }
  armPower(id) {
    const P = powerById[id], n = this.session?.myNation; if (!P || !n) return;
    if (this.armed === id) { this.setTool('inspect'); return; }
    if (P.target === 'self') return this.castSelf(P);
    this.tool = 'power'; this.setArmed(id); setCursor('target'); this.updateModeChip();
  }
  async castSelf(P) {
    const r = await this.session.command({ type: 'power', power: P.id });
    if (!r.ok) toast(r.msg, { sound: 'error' });
  }
  startPlacing(type) { this.tool = 'build'; this.buildType = type; setCursor('build'); this.updateModeChip(); }
  /** Move the person held by the divine hand so they dangle under the cursor (host applies; throttled for co-op). */
  grabTo(d, sx, sy) {
    const r = this.renderer, s = r.cam.zoom / 32, pos = r.screenToWorld(sx, sy + 40 * s * 1.2); if (!pos) return;
    const now = performance.now(), g = d.grab;
    g.hist.push({ t: now, x: pos[0], y: pos[1] }); if (g.hist.length > 8) g.hist.shift();
    const p = this.session.world.pawns[g.pid]; if (p) { p.x = p.rx = pos[0]; p.y = p.ry = pos[1]; }
    if (now - g.last > 45) { g.last = now; this.session.command({ type: 'grabMove', x: pos[0], y: pos[1] }); }
  }
  possessSelected() { if (this.selection?.type === 'pawn') this.possess(this.selection.id); else toast('Select one of your citizens first (Inspect tool), then Possess.'); }
  setPossessMode(m) { this.possessMode = m; this.updateModeChip(); this._ctrlKey = null; audio.play('toggle'); }
  async possess(pid) { const r = await this.session.command({ type: 'possess', pid }); if (!r.ok) return toast(r.msg, { sound: 'error' }); this.possessed = pid; this.possessMode = this.possessMode || 'auto'; setCursor('possess'); this.renderer.cam.tz = Math.max(this.renderer.cam.tz, 56); audio.play('power', { power: 'calm' }); this.updateModeChip(); }
  async release() { await this.session.command({ type: 'release' }); this.possessed = null; setCursor('pointer'); this.updateModeChip(); }
  togglePin(id) { const pins = this.renderer.pins; pins.has(id) ? pins.delete(id) : pins.add(id); audio.play('toggle'); }
  focusPawn(id) { const p = this.session.world.pawns[id]; if (!p) return; this.follow = id; this.renderer.focus(p.x, p.y, Math.max(this.renderer.cam.tz, 48)); this.selection = { type: 'pawn', id }; this.renderer.selection = this.selection; }
  updateModeChip() {
    const chip = this.hud?.modeChip; if (!chip) return;
    let text = null;
    const w = this.session.world;
    if (this.possessed && w.pawns[this.possessed]) text = `Possessing ${w.pawns[this.possessed].name} — WASD move · 1-6 pick an action · F / click to use it · R release`;
    else if (this.tool === 'power' && this.armed) { const P = powerById[this.armed]; text = `${P.name}: click ${P.target === 'pawn' ? 'a citizen' : P.target === 'settlement' ? 'a settlement' : 'the land'}${P.id === 'tectonic' ? ' (Shift = lower)' : ''} · right-click to cancel`; }
    else if (this.tool === 'order') text = `Order: ${this.orderKind || 'chop'} — click the target · 1-6 change order · Esc to stop`;
    else if (this.tool === 'build') text = `Planning ${BUILDINGS[this.buildType] ? this.buildType : ''}: click inside your territory · right-click to cancel`;
    chip.classList.toggle('hidden', !text); if (text) chip.textContent = text;
    this.hud.setPossessBar?.(!!(this.possessed && w.pawns[this.possessed]), this.possessMode || 'auto', (m) => this.setPossessMode(m));
    this.hud.setOrderBar?.(this.tool === 'order' && !this.possessed, this.orderKind || 'chop', (k) => { this.orderKind = k; this.updateModeChip(); audio.play('toggle'); });
  }

  // ---------- events → sound, toasts, auto-pause ----------
  onLogEvent(e) {
    // Visible announcements are notification cards (hud.notify); here we only keep sound cues and smart auto-pause.
    const n = this.session.myNation, mine = n && e.nationId === n.id, ap = this.settings.autoPause;
    const pause = (why) => { if (this.session.mode === 'single' && !this.session.world.paused) { this.session.command({ type: 'speed', paused: true }); toast(`Auto-paused: ${why}`, { sound: 'alert' }); } };
    if (e.cat === 'era' && mine) { if (ap.era) pause('a new era'); }
    else if (e.cat === 'war' && e.big && n && (e.text.includes(n.name))) { if (ap.war && e.text.includes(`war on ${n.name}`)) pause('war declared'); }
    else if (e.cat === 'disaster' && mine && e.severity === 'major') { if (ap.disaster) pause('disaster'); }
    else if (e.cat === 'death' && this.renderer.pins.has(e.pid)) { if (ap.favoriteDeath) pause('a pinned citizen died'); }
    else if (e.cat === 'chat') audio.play('chat');
    else if (e.cat === 'birth' && mine) audio.play('birth', { vol: 0.5 });
  }
  fxSound(e) {
    const r = this.renderer, w = this.session?.world; if (!w) return;
    let vol = 1, pan = 0;
    if (e.x !== undefined || e.pid) {
      const p = e.pid ? w.pawns[e.pid] : null, x = p ? p.x : e.x, y = p ? p.y : e.y;
      if (x !== undefined) { const [sx, sy] = r.worldToScreen(x, y); const d = Math.hypot(sx - r.W / 2, sy - r.H / 2) / Math.max(r.W, r.H); vol = clamp(1.2 - d * 1.6, 0, 1) * (r.mode === 'surface' ? 1 : 0.35); pan = clamp((sx - r.W / 2) / (r.W / 2), -1, 1); }
    }
    const o = { vol, pan };
    switch (e.type) {
      case 'hit': audio.play((e.era ?? 0) >= 2 ? 'clang' : 'hit', o); break;
      case 'projectile': audio.play(e.era >= 8 ? 'laser' : e.era >= 5 ? 'shot' : 'arrow', o); break;
      case 'chip': audio.play(e.res === 'wood' ? 'chop' : e.res === 'food' ? 'step' : 'mine', { ...o, vol: o.vol * 0.6 }); break;
      case 'death': audio.play('death', o); break;
      case 'knock': audio.play('thud', o); break;
      case 'built': audio.play('built', o); break;
      case 'lightning': audio.play('thunder', { vol: Math.max(0.2, o.vol) * 0.7 }); break;
      case 'meteor': setTimeout(() => audio.play('boom', { vol: Math.max(0.4, o.vol) }), 800); break;
      case 'quake': case 'eruption': audio.play('quake', { vol: Math.max(0.4, o.vol) }); break;
      case 'power': if (!e.sub) audio.play('power', { power: e.power }); break;
      case 'glitter': if (o.vol > 0.3) audio.play('glitter', { vol: o.vol * 0.5 }); break;
      case 'launch': audio.play('launch', { vol: Math.max(0.3, o.vol) }); break;
      case 'emote': if (e.icon === 'baby') audio.play('birth', o); break;
    }
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.canvas, r = this.renderer;
    this.keys = new Set();
    let drag = null;
    const dpr = () => r.dpr;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.pow(1.0015, -e.deltaY * (this.settings.zoomSens / 100));
      r.zoomAt(f, e.clientX * dpr(), e.clientY * dpr());
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      audio.init();
      drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      cv.setPointerCapture(e.pointerId);
      // press and hold on a person to pick them up with the divine hand
      if (e.button === 0 && (this.tool === 'inspect' || this.tool === 'order') && r.mode === 'surface' && !this.possessed) {
        const hit = r.pick(e.clientX * dpr(), e.clientY * dpr());
        if (hit?.type === 'pawn') {
          const d0 = drag;
          clearTimeout(this._grabT);
          this._grabT = setTimeout(async () => {
            if (drag !== d0 || d0.moved > 6) return;
            const res = await this.session.command({ type: 'grab', pid: hit.id });
            if (!res.ok) { if (res.msg) toast(res.msg, { sound: 'error' }); return; }
            if (drag !== d0) { this.session.command({ type: 'drop', vx: 0, vy: 0 }); return; }
            d0.grab = { pid: hit.id, hist: [], last: 0 }; audio.play('click'); setCursor('hand');
            this.grabTo(d0, e.clientX * dpr(), e.clientY * dpr());
          }, 230);
        }
      }
    });
    cv.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX * dpr(), y: e.clientY * dpr() };
      if (drag?.grab) { this.grabTo(drag, e.clientX * dpr(), e.clientY * dpr()); drag.x = e.clientX; drag.y = e.clientY; return; }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 5 || drag.button !== 0) { r.pan(dx * dpr() * (this.settings.panSens / 100), dy * dpr() * (this.settings.panSens / 100)); this.follow = null; }
        drag.x = e.clientX; drag.y = e.clientY;
      }
      this.updateHover();
    });
    cv.addEventListener('pointerup', (e) => {
      const d = drag; drag = null; clearTimeout(this._grabT);
      if (d?.grab) { // let go: a quick flick throws them
        const h = d.grab.hist, now = performance.now(), a = h.find((q) => now - q.t < 140) || h[h.length - 1], b = h[h.length - 1];
        const dt = a && b ? Math.max(0.03, (b.t - a.t) / 1000) : 1, wx = a && b ? wdx(a.x, b.x, this.session.world.W) / dt : 0, wy = a && b ? (b.y - a.y) / dt : 0;
        this.session.command({ type: 'drop', vx: wx, vy: wy }); setCursor(this.tool === 'build' ? 'build' : 'pointer');
        return;
      }
      if (!d || d.moved > 6) return;
      if (e.button === 2) { this.setTool('inspect'); if (this.possessed) this.session.command({ type: 'ctrl', mx: 0, my: 0, act: 'once', mode: this.possessMode }); return; }
      if (e.button === 0) this.click(e.clientX * dpr(), e.clientY * dpr(), e.shiftKey);
    });
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (document.querySelector('.modal-back') && e.code !== 'Escape') return;
      this.keys.add(e.code);
      if (this.tool === 'order' && !this.possessed && /^Digit[1-6]$/.test(e.code)) { e.preventDefault(); this.orderKind = ['fight', 'chop', 'mine', 'hunt', 'deconstruct', 'destroy'][+e.code.slice(5) - 1]; this.updateModeChip(); return; }
      if (this.possessed && /^Digit[1-6]$/.test(e.code)) { e.preventDefault(); return this.setPossessMode(['auto', 'punch', 'swing', 'chop', 'mine', 'harvest'][+e.code.slice(5) - 1]); }
      const k = this.settings.keys, act = Object.keys(k).find((a) => k[a] === e.code);
      if (!act || !this.session) { if (e.code === 'Escape' && document.querySelector('.modal-back')) document.querySelector('.modal-back .x')?.click(); return; }
      if (['Space', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'].includes(e.code)) e.preventDefault();
      if (this.possessed && ['panUp', 'panDown', 'panLeft', 'panRight'].includes(act)) return;
      const ov = { ovBorders: 'borders', ovIdeology: 'ideology', ovGlitter: 'glitter', ovTrade: 'trade', ovWeather: 'weather', ovWind: 'wind', ovTemp: 'temperature', ovPressure: 'pressure', ovHumidity: 'humidity', ovRace: 'race' };
      if (ov[act]) return this.setOverlay(ov[act]);
      const sp = { speed1: 0, speed2: 1, speed3: 2, speed4: 3, speed5: 4 };
      if (act in sp) return this.setSpeed(this.settings.speeds[sp[act]]);
      switch (act) {
        case 'pause': return this.togglePause();
        case 'zoomIn': return r.zoomAt(1.25, r.W / 2, r.H / 2);
        case 'zoomOut': return r.zoomAt(0.8, r.W / 2, r.H / 2);
        case 'home': { const n = this.session.myNation, c = n && this.session.world.settlements[n.capitalId]; if (c) r.focus(c.x, c.y, 40); return; }
        case 'toolInspect': return this.setTool('inspect');
        case 'toolBuild': return this.hud.openBuildMenu();
        case 'toolPowers': return this.armPower('rain');
        case 'nation': return this.session.myNation && this.hud.openNation(this.session.myNation.id);
        case 'orders': return this.setTool(this.tool === 'order' ? 'inspect' : 'order');
        case 'research': return this.session.myNation && this.hud.openNation(this.session.myNation.id, 'research');
        case 'codex': return showCodex();
        case 'settings': return showSettings(this);
        case 'chat': e.preventDefault(); return this.hud.focusChat();
        case 'release': return this.possessed && this.release();
        case 'possessAttack': return this.possessed && this.session.command({ type: 'ctrl', ...this.moveVec(), act: 'once', mode: this.possessMode });
        case 'pinSelected': return this.selection?.type === 'pawn' && this.togglePin(this.selection.id);
        case 'cancel': return this.setTool('inspect');
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  moveVec() {
    const k = this.settings.keys, K = this.keys;
    return { mx: (K.has(k.panRight) || K.has('ArrowRight') ? 1 : 0) - (K.has(k.panLeft) || K.has('ArrowLeft') ? 1 : 0), my: (K.has(k.panDown) || K.has('ArrowDown') ? 1 : 0) - (K.has(k.panUp) || K.has('ArrowUp') ? 1 : 0) };
  }
  updateHover() {
    const r = this.renderer, w = this.session?.world; if (!w || !this.mouse) return;
    const pos = r.screenToWorld(this.mouse.x, this.mouse.y);
    r.ghost = null; r.powerPreview = null;
    if (!pos) return;
    const [x, y] = pos;
    if (this.tool === 'build' && this.buildType) {
      const def = BUILDINGS[this.buildType], x0 = Math.floor(x - def.w / 2 + 0.5), y0 = Math.floor(y - def.h / 2 + 0.5);
      const s = this.nearestOwnSettlement(x, y);
      const n = s ? w.nations[s.nationId] : this.session.myNation;
      const chk = s ? placeCheck(w, s, this.buildType, x0, y0) : { ok: false, reason: 'Build near one of your settlements.', bad: [], gap: [], clear: [] };
      const inRange = !!s && dist(x, y, s.x, s.y, w.W) <= s.radius + 4;
      if (s && !inRange && chk.ok) { chk.ok = false; chk.reason = 'Too far from the settlement.'; }
      r.ghost = { x: x0, y: y0, w: def.w, h: def.h, ok: chk.ok, chk, type: this.buildType, cost: buildCost(def, n?.era || 0), stock: s?.stock };
    }
    if (this.tool === 'power' && this.armed) {
      const P = powerById[this.armed]; const own = w.tiles.owner[Math.floor(clamp(y, 0, w.H - 1)) * w.W + Math.floor(wrap(x, w.W))];
      const n = this.session.myNation;
      const ok = own === -1 || own === n?.id || !w.nations[own]?.ownerId || !!w.nations[own]?.perms?.[this.session.pid]?.miracles;
      r.powerPreview = { x, y, r: P.radius || (P.target === 'settlement' ? 6 : 1), ok };
      setCursor(ok ? 'target' : 'deny');
    }
  }
  nearestOwnSettlement(x, y) {
    const w = this.session.world, pid = this.session.pid;
    let best = null, bd = 1e9;
    for (const s of Object.values(w.settlements)) { const n = w.nations[s.nationId]; if (!n || (n.ownerId !== pid && !n.perms?.[pid]?.plan)) continue; const d = dist(x, y, s.x, s.y, w.W); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  async click(sx, sy, shift) {
    const r = this.renderer, w = this.session?.world; if (!w) return;
    const hit = r.pick(sx, sy); if (!hit) return;
    const pos = r.screenToWorld(sx, sy);
    if (this.tool === 'order' && pos) {
      const res = await this.session.command({ type: 'order', kind: this.orderKind || 'chop', x: pos[0], y: pos[1] });
      toast(res.ok ? res.msg : res.msg || 'Nobody can do that.', { sound: res.ok ? 'click' : 'error' });
      return;
    }
    if (this.tool === 'power' && this.armed) {
      const P = powerById[this.armed];
      const cmd = { type: 'power', power: P.id };
      if (P.target === 'pawn') { if (hit.type !== 'pawn') return toast('Click a citizen', { sound: 'error' }); cmd.pid = hit.id; }
      else if (P.target === 'settlement') {
        let sid = hit.type === 'settlement' ? hit.id : hit.type === 'building' ? hit.sid : null;
        if (!sid && pos) { let bd = 1e9; for (const s of Object.values(w.settlements)) { const d = dist(pos[0], pos[1], s.x, s.y, w.W); if (d < s.radius + 3 && d < bd) { bd = d; sid = s.id; } } }
        if (!sid) return toast('Click on a settlement', { sound: 'error' });
        cmd.sid = sid;
      } else { cmd.x = pos[0]; cmd.y = pos[1]; cmd.lower = shift; const n = this.session.myNation, cap = n && w.settlements[n.capitalId]; if (cap) cmd.angle = Math.atan2(pos[1] - cap.y, pos[0] - cap.x); }
      const res = await this.session.command(cmd);
      if (!res.ok) toast(res.msg, { sound: 'error' });
      else if (!this.keys.has('ShiftLeft') || P.id === 'tectonic') this.setTool('inspect');
      return;
    }
    if (this.tool === 'build' && this.buildType && r.ghost) {
      const s = this.nearestOwnSettlement(pos[0], pos[1]);
      if (!s) return toast('Plan buildings inside your territory', { sound: 'error' });
      const res = await this.session.command({ type: 'plan', sid: s.id, building: this.buildType, x: r.ghost.x, y: r.ghost.y });
      if (!res.ok) toast(res.msg, { sound: 'error' }); else { audio.play('hammer'); toast('Planned — your people will build it'); if (!this.keys.has('ShiftLeft')) this.setTool('inspect'); }
      return;
    }
    if (this.possessed) { // attack / interact with what was clicked
      const target = hit.type === 'pawn' && hit.id !== this.possessed ? hit.id : null;
      this.session.command({ type: 'ctrl', ...this.moveVec(), act: 'once', mode: this.possessMode, targetPawn: target });
      return;
    }
    this.selection = hit; r.selection = hit;
    if (hit.type === 'pawn') this.hud.openPawn(hit.id);
    else if (hit.type === 'building') this.hud.openBuilding(hit.id);
    else if (hit.type === 'settlement') { this.hud.openSettlement(hit.id); if (r.mode !== 'surface') r.focus(w.settlements[hit.id].x, w.settlements[hit.id].y, Math.max(r.cam.tz * 2.5, 14)); }
    else if (hit.type === 'animal') this.hud.openAnimal(hit.id);
    else if (hit.type === 'tile' && r.mode !== 'surface') { r.focus(hit.x, hit.y, Math.min(r.cam.tz * 3, 40)); }
  }

  // ---------- loop ----------
  loop(t) {
    const realDt = Math.min(0.25, (t - this.last) / 1000), rawDt = Math.min(0.1, realDt); // sim keeps up through slow frames; visuals stay smooth
    const hidden = document.hidden || !document.hasFocus();
    if (hidden && t - this.last < 1000 / this.settings.bgFps) { requestAnimationFrame((tt) => this.loop(tt)); return; }
    this.last = t;
    const r = this.renderer;
    if (this.menuSession) {
      this.menuSession.game.update(rawDt * 6);
      r.cam.x = wrap(r.cam.x + rawDt * 6, this.menuSession.world.W);
      r.frame(rawDt);
    } else if (this.session) {
      const s = this.session, w = s.world;
      // camera: keyboard pan / follow / possession
      if (this.possessed) {
        const p = w.pawns[this.possessed];
        if (!p || p.dead || (p.possessedBy && p.possessedBy !== s.pid)) { this.possessed = null; setCursor('pointer'); this.updateModeChip(); }
        else {
          const mv = this.moveVec(), act = this.keys.has(this.settings.keys.possessAttack) ? 'hold' : null, key = `${mv.mx},${mv.my},${act},${this.possessMode}`;
          if (key !== this._ctrlKey || t - (this._ctrlT || 0) > 400) { this._ctrlKey = key; this._ctrlT = t; s.command({ type: 'ctrl', ...mv, act, mode: this.possessMode }); }
          r.cam.x = p.rx ?? p.x; r.cam.y = p.ry ?? p.y;
        }
      } else {
        const mv = this.moveVec(), sp = (700 / r.cam.zoom) * rawDt * (this.settings.panSens / 100);
        if (mv.mx || mv.my) { r.cam.x = wrap(r.cam.x + mv.mx * sp, w.W); r.cam.y = clamp(r.cam.y + mv.my * sp, 0, w.H); r.cam.lat0 = clamp(Math.PI / 2 - (r.cam.y / w.H) * Math.PI, -1.2, 1.2); this.follow = null; }
        if (this.settings.edgeScroll && this.mouse && !hidden) {
          const m = 18 * r.dpr, ex = this.mouse.x < m ? -1 : this.mouse.x > r.W - m ? 1 : 0, ey = this.mouse.y < m ? -1 : this.mouse.y > r.H - m ? 1 : 0;
          if (ex || ey) { r.cam.x = wrap(r.cam.x + ex * sp, w.W); r.cam.y = clamp(r.cam.y + ey * sp, 0, w.H); }
        }
        if (this.follow) { const p = w.pawns[this.follow]; if (p) { r.cam.x = p.rx ?? p.x; r.cam.y = p.ry ?? p.y; } else this.follow = null; }
      }
      s.camera(r.cam.x, r.cam.y, r.cam.zoom);
      s.update(realDt);
      r.frame(rawDt, s);
      if (t - (this._hudT || 0) > 250) { this._hudT = t; this.hud?.update(); this.updateModeChip(); this.ambient(); }
      this.tickAutosave(rawDt);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }
  ambient() {
    const r = this.renderer, w = this.session.world, a = w.atmo, c = cellAt(a, r.cam.x, r.cam.y);
    const surf = r.mode === 'surface', ws = Math.hypot(a.U[c], a.V[c]);
    const ti = Math.floor(clamp(r.cam.y, 0, w.H - 1)) * w.W + Math.floor(wrap(r.cam.x, w.W));
    const nearSettle = surf && Object.values(w.settlements).some((s) => dist(s.x, s.y, r.cam.x, r.cam.y, w.W) < s.radius + 6);
    audio.setAmbient({ wind: (ws / 30) * (surf ? 1 : 0.5), rain: surf ? a.precip[c] * 0.8 : 0, ocean: surf && BIOMES[w.tiles.biome[ti]].water ? 0.2 : 0, crowd: nearSettle ? 0.06 : 0, space: r.mode === 'globe' ? 0.06 : 0 });
    if (surf && w.fireActive.size && Math.random() < 0.3) audio.play('fire', { vol: 0.4 });
  }
}

const app = new App();
window.__app = app; // handy for debugging in the console
app.boot();
