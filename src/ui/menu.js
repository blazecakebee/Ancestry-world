// Main menu, New Globe, Multiplayer, Load World, Codex and Settings screens.
const add = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
import { h, modal, toast, tabs, esc } from './dom.js';
import { THEMES, ACTIONS, DEFAULT_KEYS, DEFAULTS, keyLabel, keyConflicts, saveSettings, applySettings } from './settings.js';
import { listSaves, loadSave, deleteSave } from './storage.js';
import { iconImg, flagCanvas, FLAG_PATTERNS, FLAG_EMBLEMS } from '../render/miscart.js';
import { TRAITS } from '../data/traits.js';
import { ERAS } from '../data/eras.js';
import { POWERS, TIERS } from '../data/powers.js';
import { GOVERNMENTS } from '../data/society.js';
import { RACES } from '../data/races.js';
import { BIOMES } from '../data/biomes.js';
import { WORLD_AGES } from '../sim/events.js';
import { LORE } from '../data/lore.js';
import { NATION_COLORS } from '../data/names.js';
import { audio, CHANNELS } from '../audio/audio.js';
import { LPC_CREDIT } from '../render/lpc.js';

export function showMainMenu(app) {
  const root = document.getElementById('menu');
  const q = LORE.quotes[Math.floor(Math.random() * LORE.quotes.length)];
  const item = (icon, label, sub, fn, primary) => h('button', { class: `btn ${primary ? 'primary' : ''}`, onclick: fn }, iconImg(icon), label, h('span', { class: 'sub' }, sub));
  root.replaceChildren(h('div', { class: 'brand' },
    h('div', { class: 'logo' }, 'Ancestry', h('br'), 'World'),
    h('div', { class: 'tagline' }, 'Guide a people from the first campfire to the stars. Watch every citizen live, love and dream — together with your friends.'),
    h('div', { class: 'menu-buttons' },
      item('globe', 'Singleplayer', 'New Globe', () => showNewGlobe(app, false), true),
      item('users', 'Multiplayer', 'Host or join', () => showMultiplayer(app)),
      item('load', 'Load World', 'Your saves', () => showLoad(app)),
      item('book', 'Lore & Trait Codex', 'Learn the world', () => showCodex()),
      item('settings', 'Settings', '20+ options', () => showSettings(app)),
    ),
    h('div', { class: 'quote' }, `“${q.text}” — ${q.by}`),
    h('div', { class: 'foot' }, 'v0.1 · Made with love for co-op god games. Press ', h('span', { class: 'kbd' }, 'F11'), ' for fullscreen.'),
  ));
  root.classList.remove('hidden');
}

// ---------- New Globe ----------
export function showNewGlobe(app, multiplayer) {
  const s = app.settings;
  const st = { name: randomWorldName(), seed: (Math.random() * 1e9) | 0, size: 'normal', ai: 6, player: s.playerName || 'Deity', tribe: '', race: 'human', color: NATION_COLORS[0], maxPlayers: 6, peacefulAI: false, hostOnlySpeed: false };
  const body = h('div', { class: 'col' });
  const render = () => {
    body.replaceChildren(
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, 'World name', h('input', { type: 'text', value: st.name, oninput: (e) => (st.name = e.target.value) })),
        h('label', { class: 'field' }, 'Seed', h('div', { class: 'row' }, h('input', { type: 'number', value: st.seed, class: 'grow', oninput: (e) => (st.seed = +e.target.value) }), h('button', { class: 'btn icon', tip: 'Random seed', onclick: () => { st.seed = (Math.random() * 1e9) | 0; render(); } }, '🎲'))),
        h('label', { class: 'field' }, 'Your deity name', h('input', { type: 'text', value: st.player, maxlength: 24, oninput: (e) => (st.player = e.target.value) })),
        h('label', { class: 'field' }, 'Tribe name (optional)', h('input', { type: 'text', value: st.tribe, placeholder: 'Generated if empty', maxlength: 32, oninput: (e) => (st.tribe = e.target.value) })),
      ),
      h('div', { class: 'field small muted' }, 'Planet size'),
      h('div', { class: 'grid-3' }, [['small', 'Small', '384 × 192 · quick games'], ['normal', 'Normal', '512 × 256 · recommended'], ['large', 'Large', '768 × 384 · epic, heavier']].map(([id, n, d]) =>
        h('div', { class: `card pick ${st.size === id ? 'on' : ''}`, onclick: () => { st.size = id; render(); } }, h('div', { class: 'bold' }, n), h('div', { class: 'tiny muted' }, d)))),
      h('div', { class: 'field small muted' }, 'Your people'),
      h('div', { class: 'grid-3' }, Object.entries(RACES).map(([id, r]) =>
        h('div', { class: `card pick ${st.race === id ? 'on' : ''}`, onclick: () => { st.race = id; render(); } }, h('div', { class: 'row' }, h('span', { class: 'dot', style: { background: r.color } }), h('b', {}, r.name)), h('div', { class: 'tiny muted', style: { marginTop: '6px' } }, r.desc)))),
      h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, 'Nation colour'), NATION_COLORS.map((c) => h('div', { class: `swatch ${st.color === c ? 'on' : ''}`, style: { background: c }, onclick: () => { st.color = c; render(); } }))),
      h('label', { class: 'field' }, `AI nations at start: ${st.ai}`, h('input', { type: 'range', min: 2, max: 12, value: st.ai, oninput: (e) => { st.ai = +e.target.value; e.target.previousSibling.textContent = `AI nations at start: ${st.ai}`; } })),
      multiplayer ? h('div', { class: 'card col' },
        h('b', {}, 'Co-op options'),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: st.peacefulAI, onchange: (e) => (st.peacefulAI = e.target.checked) }), 'AI nations never declare war on players'),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: st.hostOnlySpeed, onchange: (e) => (st.hostOnlySpeed = e.target.checked) }), 'Only the host can change the shared world speed'),
        h('label', { class: 'field' }, `Max players: ${st.maxPlayers}`, h('input', { type: 'range', min: 2, max: 8, value: st.maxPlayers, oninput: (e) => { st.maxPlayers = +e.target.value; e.target.previousSibling.textContent = `Max players: ${st.maxPlayers}`; } })),
      ) : null,
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '6px' } },
        h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => { m.close(); s.playerName = st.player; saveSettings(s); app.newWorld({ ...st, multiplayer }); } }, iconImg('globe'), multiplayer ? 'Create & host world' : 'Create world')),
    );
  };
  render();
  const m = modal(multiplayer ? 'Host a co-op world' : 'New Globe', body, { icon: iconImg('globe') });
}
const randomWorldName = () => ['Verdance', 'Old Ember', 'Hearthmoor', 'Tidewake', 'Solace', 'Kindlemark', 'Duskvale', 'Aurelia', 'Mosswhisper', 'Starfall'][Math.floor(Math.random() * 10)];

// ---------- Multiplayer ----------
export function showMultiplayer(app) {
  const s = app.settings;
  let name = s.playerName || 'Friend', code = '';
  const body = h('div', { class: 'col' },
    h('p', { class: 'muted small' }, 'Play together on one shared planet. The host runs the world; everyone shares the same clock. You can only use powers on a friend\'s nation if they grant you permission.'),
    h('div', { class: 'grid-2' },
      h('div', { class: 'card col' }, h('h3', {}, 'Host'), h('p', { class: 'small muted' }, 'Create a new world and invite friends with a code.'), h('button', { class: 'btn primary', onclick: () => { m.close(); showNewGlobe(app, true); } }, iconImg('globe'), 'Host new world'),
        h('button', { class: 'btn', onclick: () => { m.close(); showLoad(app, true); } }, iconImg('load'), 'Host a saved world')),
      h('div', { class: 'card col' }, h('h3', {}, 'Join a friend'),
        h('label', { class: 'field' }, 'Your name', h('input', { type: 'text', value: name, maxlength: 24, oninput: (e) => (name = e.target.value) })),
        h('label', { class: 'field' }, 'Invite code', h('input', { type: 'text', placeholder: 'ABC123', maxlength: 6, class: 'secret', style: { textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 800 }, oninput: (e) => (code = e.target.value.toUpperCase()) })),
        h('button', { class: 'btn primary', onclick: async () => { if (code.length < 6) return toast('Enter the 6-character invite code', { sound: 'error' }); s.playerName = name; saveSettings(s); m.close(); app.joinWorld(code, name); } }, iconImg('users'), 'Join world'))),
    h('p', { class: 'tiny muted' }, 'Co-op is peer-to-peer: share the code and friends anywhere can join — even from the GitHub Pages link. Keep the host\'s tab open. Turn on Stream-Safe mode in Settings to hide codes on screen.'),
  );
  const m = modal('Multiplayer', body, { icon: iconImg('users') });
}

// ---------- Load ----------
export async function showLoad(app, asHost = false) {
  const body = h('div', { class: 'col' }, h('div', { class: 'spinner' }));
  const m = modal(asHost ? 'Host a saved world' : 'Load World', body, { icon: iconImg('load'), width: '760px' });
  const refresh = async () => {
    let saves = [];
    try { saves = await listSaves(); } catch (e) { body.replaceChildren(h('p', {}, 'Saves are unavailable in this browser.')); return; }
    const fileIn = h('input', { type: 'file', accept: '.json,.awsave', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const data = JSON.parse(await f.text()); m.close(); app.loadWorld(data, asHost); } catch { toast('That file is not a valid save', { sound: 'error' }); } } });
    body.replaceChildren(
      saves.length ? null : h('p', { class: 'muted' }, 'No saves yet — your worlds autosave as you play.'),
      ...saves.map((sv) => h('div', { class: 'card save-card' },
        sv.meta.thumb ? h('img', { src: sv.meta.thumb, alt: '' }) : h('div'),
        h('div', { class: 'col', style: { gap: '2px' } }, h('b', {}, sv.meta.name || sv.id, sv.meta.auto ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, 'Autosave') : null),
          h('span', { class: 'small muted' }, `${sv.meta.nation || ''} · Year ${sv.meta.year ?? '?'} · ${ERAS[sv.meta.era ?? 0]?.name || ''} · pop ${sv.meta.pop ?? '?'}`),
          h('span', { class: 'tiny muted' }, new Date(sv.meta.savedAt).toLocaleString())),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary sm', onclick: async () => { const r = await loadSave(sv.id); m.close(); app.loadWorld(r.data, asHost); } }, asHost ? 'Host' : 'Load'),
          h('button', { class: 'btn danger sm', tip: 'Delete save', onclick: async () => { if (confirm('Delete this save permanently?')) { await deleteSave(sv.id); refresh(); } } }, '🗑')))),
      h('div', { class: 'row' }, fileIn, h('button', { class: 'btn', onclick: () => fileIn.click() }, iconImg('load'), 'Import save file…')),
    );
  };
  refresh();
}

// ---------- Codex ----------
export function showCodex(tab = 'lore') {
  const body = h('div');
  const render = () => {
    const content = h('div', { class: 'col' });
    if (tab === 'lore') add(content, ...LORE.intro.split('\n\n').map((p) => h('p', {}, p)), h('h3', {}, 'A deity\'s guide'), ...LORE.deityGuide.map((g) => h('div', { class: 'card' }, h('b', {}, g.title), h('p', { class: 'small', style: { margin: '6px 0 0' } }, g.text))), h('h3', {}, 'Sayings of the world'), ...LORE.quotes.slice(0, 12).map((q) => h('div', { class: 'quote small' }, `“${q.text}” — ${q.by}`)));
    if (tab === 'eras') add(content, ...ERAS.map((e) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', {}, `${e.id + 1}. ${e.name}`), h('span', { class: 'chip' }, e.short), h('span', { class: 'chip grow', style: { justifyContent: 'flex-end', border: 0, background: 'none' } }, e.cost ? `${e.cost.toLocaleString()} research` : 'Start')), h('p', { class: 'small', style: { margin: '6px 0' } }, LORE.eras[e.key] || e.blurb), h('div', { class: 'tiny muted' }, `Weapons: ${e.weapon.name} · Medicine: ${e.med} · Food: ${e.meal}, ${e.ration}`))));
    if (tab === 'traits') {
      const cats = {}; for (const [id, t] of Object.entries(TRAITS)) (cats[t.cat] ||= []).push([id, t]);
      for (const [c, list] of Object.entries(cats)) add(content, h('h3', { style: { textTransform: 'capitalize' } }, c), h('div', { class: 'grid-2' }, list.map(([id, t]) => h('div', { class: 'card' }, h('span', { class: 'trait', style: { color: t.color, borderColor: t.color } }, t.name), h('p', { class: 'small', style: { margin: '6px 0 0' } }, t.desc)))));
    }
    if (tab === 'races') add(content, ...Object.values(RACES).map((r) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'dot', style: { background: r.color } }), h('b', {}, r.name)), h('p', { class: 'small' }, r.desc), h('div', { class: 'tiny muted' }, Object.entries(r.fx).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' · ')))));
    if (tab === 'powers') for (const T of TIERS) add(content, h('h3', {}, `Tier ${T.tier} — ${T.name}`, h('span', { class: 'muted small' }, ` (devotion ${T.devotion}+)`)), h('div', { class: 'grid-2' }, POWERS.filter((p) => p.tier === T.tier).map((p) => h('div', { class: 'card' }, h('div', { class: 'row' }, iconImg(p.icon), h('b', {}, p.name), h('span', { class: 'chip', style: { marginLeft: 'auto' } }, `✦ ${p.cost}`)), h('p', { class: 'small', style: { margin: '6px 0 0' } }, p.desc)))));
    if (tab === 'gov') add(content, ...GOVERNMENTS.map((g) => h('div', { class: 'card' }, h('b', {}, g.name), h('span', { class: 'chip', style: { marginLeft: '8px' } }, `from ${ERAS[g.era].name}`), h('p', { class: 'small' }, LORE.governments[g.id] || ''), h('div', { class: 'tiny muted' }, `Succession: ${g.succession}`))));
    if (tab === 'ages') add(content, ...Object.entries(WORLD_AGES).map(([id, a]) => h('div', { class: 'card' }, h('b', { style: { color: a.color } }, a.name), h('p', { class: 'small' }, LORE.ages[id] || a.desc), h('div', { class: 'tiny muted' }, a.desc))));
    if (tab === 'biomes') add(content, h('div', { class: 'grid-2' }, BIOMES.map((b) => h('div', { class: 'card row' }, h('span', { class: 'dot', style: { background: `rgb(${b.color})`, width: '18px', height: '18px', borderRadius: '6px' } }), h('div', {}, h('b', {}, b.name), h('div', { class: 'tiny muted' }, LORE.biomes[b.key] || ''))))));
    if (tab === 'credits') add(content, h('p', {}, LPC_CREDIT), h('p', {}, 'Music: "8 Bit Videogame Music No Copyright" by Lofi Elephant — youtube.com/@lofielephant (free to use with attribution).'), h('p', { class: 'small muted' }, 'Full author list: assets/packs/lpc/AUTHORS.txt. Optional alternate character pack built from a Kaggle pixel-characters dataset (local only). Terrain, buildings, animals, icons, effects, music and sound are procedurally generated.'));
    body.replaceChildren(tabs([['lore', 'Lore'], ['eras', 'Eras'], ['traits', 'Traits'], ['races', 'Races'], ['powers', 'Powers'], ['gov', 'Governments'], ['ages', 'World Ages'], ['biomes', 'Biomes'], ['credits', 'Credits']], tab, (t) => { tab = t; render(); }), content);
  };
  render();
  modal('Lore & Trait Codex', body, { icon: iconImg('book'), width: '820px' });
}

// ---------- Settings ----------
export function showSettings(app, tab = 'display') {
  const s = app.settings;
  const body = h('div');
  const commit = () => { saveSettings(s); applySettings(s); app.onSettingsChanged?.(); };
  const range = (label, key, min, max, step = 1, fmt = (v) => v, obj = s) => h('div', { class: 'settings-grid', style: { gridTemplateColumns: '200px 1fr 64px' } }, h('span', {}, label), h('input', { type: 'range', min, max, step, value: obj[key], oninput: (e) => { obj[key] = +e.target.value; e.target.nextSibling.textContent = fmt(obj[key]); commit(); } }), h('span', { class: 'small muted' }, fmt(obj[key])));
  const check = (label, key, obj = s) => h('label', { class: 'row', style: { padding: '4px 0' } }, h('input', { type: 'checkbox', checked: !!obj[key], onchange: (e) => { obj[key] = e.target.checked; commit(); } }), label);
  const select = (label, key, opts) => h('div', { class: 'settings-grid' }, h('span', {}, label), h('select', { onchange: (e) => { s[key] = e.target.value; commit(); } }, opts.map(([v, l]) => h('option', { value: v, selected: s[key] === v }, l))));
  const render = () => {
    const c = h('div', { class: 'col' });
    if (tab === 'display') add(c, 
      h('div', { class: 'small muted' }, 'Theme'),
      h('div', { class: 'grid-3' }, THEMES.map((t) => h('div', { class: `card pick ${s.theme === t.id ? 'on' : ''}`, onclick: () => { s.theme = t.id; commit(); render(); } }, h('b', {}, t.name), h('div', { class: 'tiny muted' }, t.desc)))),
      range('Master UI scale', 'uiScale', 75, 150, 5, (v) => v + '%'),
      range('Text & tooltip size', 'textScale', 80, 140, 5, (v) => v + '%'),
      range('Ultrawide HUD edge padding', 'edgePad', 0, 600, 10, (v) => v + 'px'),
      select('Character art', 'characterStyle', [['lpc', 'LPC layered characters (animated)'], ['pack', 'Pixel character pack'], ['procedural', 'Procedural (era outfits & body types)']]),
      select('Colour-blind palette', 'colorblind', [['none', 'Off'], ['deuteranopia', 'Deuteranopia'], ['protanopia', 'Protanopia'], ['tritanopia', 'Tritanopia']]),
      range('Screen shake intensity', 'shake', 0, 100, 5, (v) => v + '%'), range('Flash intensity', 'flash', 0, 100, 5, (v) => v + '%'),
      range('Particle & weather density', 'particles', 0, 150, 10, (v) => v + '%'),
      check('Pixel-grid snapping & crisp scaling', 'pixelSnap'), check('Glitter cursor trail', 'cursorTrail'));
    if (tab === 'gameplay') add(c, 
      h('b', {}, 'Smart auto-pause'), h('div', { class: 'grid-2' }, check('When war is declared on me', 'war', s.autoPause), check('When my people enter a new era', 'era', s.autoPause), check('On major disasters', 'disaster', s.autoPause), check('When a pinned citizen dies', 'favoriteDeath', s.autoPause)),
      h('b', {}, 'Simulation speed presets (hotkeys 1–5)'), h('div', { class: 'row' }, s.speeds.map((v, i) => h('input', { type: 'number', min: 0.25, max: 10, step: 0.25, value: v, style: { width: '72px' }, onchange: (e) => { s.speeds[i] = Math.max(0.25, Math.min(10, +e.target.value)); commit(); } }))),
      range('Autosave every', 'autosaveMin', 1, 15, 1, (v) => v + ' min'), range('Rolling autosave slots', 'autosaveSlots', 1, 10, 1, (v) => v),
      range('Tooltip hover delay', 'tooltipDelay', 0, 1000, 50, (v) => v + 'ms'),
      range('Background FPS limit (unfocused)', 'bgFps', 1, 60, 1, (v) => v + ' fps'),
      h('b', {}, 'Event feed filters'), h('div', { class: 'grid-3' }, Object.keys(s.feedFilters).map((k) => check(k[0].toUpperCase() + k.slice(1), k, s.feedFilters))));
    if (tab === 'camera') add(c, check('Edge scrolling', 'edgeScroll'), range('Pan sensitivity', 'panSens', 25, 250, 5, (v) => v + '%'), range('Zoom sensitivity', 'zoomSens', 25, 250, 5, (v) => v + '%'), check('Zoom toward cursor (surface → globe → space)', 'zoomToCursor'));
    if (tab === 'audio') add(c, select('Music', 'musicSource', [['playlist', 'Soundtrack (8-bit lofi by Lofi Elephant)'], ['generative', 'Generative era music'], ['off', 'Off']]), h('button', { class: 'btn sm', onclick: () => audio.nextTrack() }, '⏭ Next track'),...CHANNELS.map((ch) => range({ master: 'Master', music: 'Era music', ambient: 'Ambient weather & space', ui: 'Interface', miracles: 'Miracles', world: 'World & citizens' }[ch], ch, 0, 100, 1, (v) => v + '%', s.volume)), h('button', { class: 'btn sm', onclick: () => { audio.init(); audio.play('power', { power: 'heal' }); } }, '▶ Test sound'));
    if (tab === 'controls') {
      const conf = keyConflicts(s.keys);
      const groups = {}; for (const [a, d] of Object.entries(ACTIONS)) (groups[d.group] ||= []).push([a, d]);
      add(c, h('div', { class: 'row' }, h('span', { class: 'small muted grow' }, 'Click a key, then press the new key. Esc clears. Conflicts are shown in red.'), h('button', { class: 'btn sm', onclick: () => { s.keys = { ...DEFAULT_KEYS }; commit(); render(); } }, 'Reset all')));
      for (const [g, list] of Object.entries(groups)) add(c, h('b', {}, g), ...list.map(([a, d]) => h('div', { class: 'keyrow' }, h('span', {}, d.label, conf[a] ? h('span', { class: 'tiny', style: { color: 'var(--bad)', marginLeft: '6px' } }, `conflicts with ${conf[a].map((x) => ACTIONS[x].label).join(', ')}`) : null),
        h('button', { class: `btn sm ${conf[a] ? 'conflict' : ''}`, onclick: (e) => { const b = e.currentTarget; b.textContent = 'Press a key…'; const fn = (ev) => { ev.preventDefault(); ev.stopPropagation(); s.keys[a] = ev.code === 'Escape' ? '' : ev.code; removeEventListener('keydown', fn, true); commit(); render(); }; addEventListener('keydown', fn, true); } }, keyLabel(s.keys[a])))));
    }
    if (tab === 'privacy') add(c, check('Stream / friend-safe mode (hide invite codes & lobby info on screen)', 'streamerMode'), h('p', { class: 'small muted' }, 'Invite codes are blurred in the lobby and HUD while enabled.'), h('button', { class: 'btn sm', onclick: () => { s.tutorialDone = false; commit(); toast('The tutorial will play next time you enter a world.'); } }, 'Replay tutorial'));
    body.replaceChildren(tabs([['display', 'Display'], ['gameplay', 'Gameplay'], ['camera', 'Camera'], ['audio', 'Audio'], ['controls', 'Controls'], ['privacy', 'Privacy & help']], tab, (t) => { tab = t; render(); }), c);
  };
  render();
  modal('Settings', body, { icon: iconImg('settings'), width: '780px' });
}

// ---------- Flag editor (used after founding a settlement) ----------
export function showFlagEditor(app, nation, { first = false } = {}) {
  const f = { ...(nation.flag || { pattern: 'solid', c1: nation.color, c2: '#1b1f3a', c3: '#ffffff', emblem: 'star', ec: '#ffffff' }) };
  let name = nation.name, color = nation.color;
  const COLORS = ['#e8c547', '#4fb0ff', '#ff6b6b', '#7ee081', '#c58cff', '#ff9f43', '#4ee6d4', '#ff7ac8', '#f4f1e8', '#1b1f3a', '#8b1e2d', '#1f5f3a', '#2a4d8f', '#111111', '#a5481f', '#ffffff'];
  const preview = h('div', { class: 'center' });
  const body = h('div', { class: 'col' });
  const render = () => {
    const big = flagCanvas(f, 96, 64); big.style.width = '288px'; big.style.height = '192px'; big.style.imageRendering = 'pixelated'; big.style.borderRadius = '10px'; big.style.boxShadow = 'var(--shadow)';
    preview.replaceChildren(big);
    const colorRow = (key, label) => h('div', { class: 'row wrap' }, h('span', { class: 'small muted', style: { width: '80px' } }, label), COLORS.map((c) => h('div', { class: `swatch ${f[key] === c ? 'on' : ''}`, style: { background: c }, onclick: () => { f[key] = c; render(); } })));
    body.replaceChildren(
      first ? h('p', { class: 'muted' }, 'Your people have built their first settlement. Raise a banner they can rally beneath!') : null,
      preview,
      h('label', { class: 'field' }, 'Nation name', h('input', { type: 'text', value: name, maxlength: 32, oninput: (e) => (name = e.target.value) })),
      h('div', { class: 'small muted' }, 'Pattern'), h('div', { class: 'row wrap' }, FLAG_PATTERNS.map((p) => { const c = flagCanvas({ ...f, pattern: p, emblem: 'none' }, 24, 16); c.style.width = '48px'; c.style.height = '32px'; c.style.imageRendering = 'pixelated'; return h('div', { class: `card pick ${f.pattern === p ? 'on' : ''}`, style: { padding: '5px' }, onclick: () => { f.pattern = p; render(); } }, c); })),
      h('div', { class: 'small muted' }, 'Emblem'), h('div', { class: 'row wrap' }, FLAG_EMBLEMS.map((e) => h('button', { class: `btn sm ${f.emblem === e ? 'active' : ''}`, onclick: () => { f.emblem = e; render(); } }, e === 'none' ? 'None' : iconImg(e, 2, 'px-icon sm')))),
      colorRow('c1', 'Field'), colorRow('c2', 'Second'), colorRow('c3', 'Third'), colorRow('ec', 'Emblem'),
      h('div', { class: 'row wrap' }, h('span', { class: 'small muted', style: { width: '80px' } }, 'Map colour'), NATION_COLORS.map((c) => h('div', { class: `swatch ${color === c ? 'on' : ''}`, style: { background: c }, onclick: () => { color = c; render(); } }))),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: async () => { const r = await app.session.command({ type: 'flag', flag: f, name, color }); if (r.ok) { toast('Your banner flies high!', { sound: 'confirm' }); m.close(); } else toast(r.msg || 'Could not set flag', { sound: 'error' }); } }, iconImg('flag'), 'Raise banner')),
    );
  };
  render();
  const m = modal(first ? 'Design your flag' : 'Flag & identity', body, { icon: iconImg('flag'), width: '640px' });
}
