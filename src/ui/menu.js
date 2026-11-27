// Main menu, New Globe, Multiplayer, Load World, Codex and Settings screens.
const add = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
import { h, modal, toast, tabs, esc, colorWheel, timeAgo } from './dom.js';
import { THEMES, ACTIONS, DEFAULT_KEYS, DEFAULTS, keyLabel, keyConflicts, saveSettings, applySettings } from './settings.js';
import { listSaves, loadSave, deleteSave, saveWorld } from './storage.js';
import { cloud, signIn, signOut, listCloud, pushSave, pullSave, deleteCloud, GOOGLE_CLIENT_ID } from './cloud.js';
import { iconImg, flagCanvas, FLAG_PATTERNS, FLAG_EMBLEMS, FLAG_EMBLEM_POS, FLAG_EMBLEM_SIZE } from '../render/miscart.js';
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
import { GCHAR_CREDIT } from '../render/gchar.js';
import { CHANGELOG, CURRENT_VERSION } from '../data/changelog.js';

export function showMainMenu(app) {
  const root = document.getElementById('menu');
  const item = (icon, label, sub, fn, primary) => h('button', { class: `btn ${primary ? 'primary' : ''}`, onclick: fn }, iconImg(icon), label, h('span', { class: 'sub' }, sub));
  // Continue: most recent save (autosave or manual); hidden when there are none.
  const cont = h('button', { class: 'btn primary continue hidden' });
  listSaves().then((saves) => {
    const sv = saves[0]; if (!sv || !cont.isConnected) return;
    const m = sv.meta || {};
    cont.replaceChildren(iconImg('play'), h('span', { class: 'ct' }, h('b', {}, 'Continue'), h('small', {}, `${m.name || 'Your world'}${m.nation ? ' · ' + m.nation : ''}`)), h('span', { class: 'sub' }, `${timeAgo(m.savedAt || Date.now())}${m.auto ? ' · autosave' : ''}`));
    cont.onclick = async () => { cont.disabled = true; try { const r = await loadSave(sv.id); app.loadWorld(r.data, false); } catch (e) { cont.disabled = false; toast('Could not load that save', { sound: 'error' }); } };
    cont.classList.remove('hidden'); root.querySelector('.menu-buttons .btn:not(.continue)')?.classList.remove('primary');
  }).catch(() => {});
  root.replaceChildren(h('div', { class: 'brand' },
    h('div', { class: 'logo' }, 'Ancestry', h('br'), 'World'),
    (() => { const words = 'When everything is wrong, being hopeful is a rebellion.'.split(' ');
      return h('div', { class: 'hero-quote', 'aria-label': 'When everything is wrong, being hopeful is a rebellion.' },
        h('span', { class: 'q-mark', 'aria-hidden': 'true' }, '“'),
        h('span', { class: 'q-text', 'aria-hidden': 'true' }, words.map((w, i) => h('span', { class: `q-w ${i >= words.length - 3 ? 'hot' : ''}`, style: { animationDelay: `${0.45 + i * 0.17}s` } }, w + (i < words.length - 1 ? '\u00a0' : '')))),
        h('span', { class: 'q-mark close', 'aria-hidden': 'true' }, '”'),
        h('span', { class: 'q-rule', 'aria-hidden': 'true' }),
        h('span', { class: 'q-by' }, '— Control, “I’m Not Coming Back”')); })(),
    h('div', { class: 'menu-buttons' },
      h('div', { class: 'mgroup g1' }, cont, item('globe', 'Singleplayer', 'New Globe', () => showNewGlobe(app, false), true)),
      h('div', { class: 'mgroup g2' },
      item('multiplayer', 'Multiplayer', 'Host or join', () => showMultiplayer(app)),
      item('load', 'Load World', 'Your saves', () => showLoad(app)),
      (() => { const b = item('cloud', 'Cloud Saves', cloud.user ? cloud.user.name : 'Sign in with Google', () => showCloud(app)); cloud.onChange(() => { if (b.isConnected) b.querySelector('.sub').textContent = cloud.user ? cloud.user.name : 'Sign in with Google'; }); return b; })()),
      h('div', { class: 'mgroup g3' },
      item('book', 'Codex', 'Lore & traits', () => showCodex()),
      item('settings', 'Settings', '20+ options', () => showSettings(app)),
      (() => { const unseen = app.settings.lastSeenVersion !== CURRENT_VERSION; const b = item('scroll', "What's New", unseen ? `v${CURRENT_VERSION} · new!` : `v${CURRENT_VERSION}`, () => { showChangelog(app); b.querySelector('.sub').textContent = `v${CURRENT_VERSION}`; b.classList.remove('has-new'); }); if (unseen) b.classList.add('has-new'); return b; })()),
    ),
    h('div', { class: 'foot' }, `v${CURRENT_VERSION} · Made with love for co-op god games. Press `, h('span', { class: 'kbd' }, 'F11'), ' for fullscreen.'),
  ));
  root.classList.remove('hidden');
}

// ---------- New Globe ----------
export function showNewGlobe(app, multiplayer) {
  const s = app.settings;
  const st = { name: randomWorldName(), seed: (Math.random() * 1e9) | 0, size: 'normal', ai: 6, player: s.playerName || 'Deity', tribe: '', race: 'human', color: NATION_COLORS[0], maxPlayers: 6, peacefulAI: false, hostOnlySpeed: false };
  const body = h('div', { class: 'col' });
  const wheel = colorWheel({ value: st.color, onChange: (c) => { st.color = c; } });
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
      h('div', { class: 'field small muted' }, 'Nation colour'), wheel,
      h('label', { class: 'field' }, h('span', {}, `AI nations at start: ${st.ai}`), h('input', { type: 'range', min: 2, max: 12, value: st.ai, oninput: (e) => { st.ai = +e.target.value; e.target.previousElementSibling.textContent = `AI nations at start: ${st.ai}`; } })),
      multiplayer ? h('div', { class: 'card col' },
        h('b', {}, 'Co-op options'),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: st.peacefulAI, onchange: (e) => (st.peacefulAI = e.target.checked) }), 'AI nations never declare war on players'),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: st.hostOnlySpeed, onchange: (e) => (st.hostOnlySpeed = e.target.checked) }), 'Only the host can change the shared world speed'),
        h('label', { class: 'field' }, h('span', {}, `Max players: ${st.maxPlayers}`), h('input', { type: 'range', min: 2, max: 8, value: st.maxPlayers, oninput: (e) => { st.maxPlayers = +e.target.value; e.target.previousElementSibling.textContent = `Max players: ${st.maxPlayers}`; } })),
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
        h('button', { class: 'btn primary', onclick: async () => { if (code.length < 6) return toast('Enter the 6-character invite code', { sound: 'error' }); s.playerName = name; saveSettings(s); m.close(); app.joinWorld(code, name); } }, iconImg('multiplayer'), 'Join world'))),
    h('p', { class: 'tiny muted' }, 'Co-op is peer-to-peer: share the code and friends anywhere can join — even from the GitHub Pages link. Keep the host\'s tab open. Turn on Stream-Safe mode in Settings to hide codes on screen.'),
  );
  const m = modal('Multiplayer', body, { icon: iconImg('multiplayer') });
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
      h('div', { class: 'row' }, fileIn, h('button', { class: 'btn', onclick: () => fileIn.click() }, iconImg('load'), 'Import save file…'), h('button', { class: 'btn', onclick: () => { m.close(); showCloud(app, asHost); } }, iconImg('cloud'), 'Cloud saves…')),
    );
  };
  refresh();
}

// ---------- Cloud saves (Google Drive app folder) ----------
const googleG = () => { const c = document.createElement('canvas'); c.width = c.height = 18; const x = c.getContext('2d'); x.lineWidth = 3.2; x.lineCap = 'butt';
  [['#ea4335', -0.75, 0.0], ['#fbbc05', 0.0, 0.62], ['#34a853', 0.62, 1.38], ['#4285f4', 1.38, 2.0]].forEach(([col, a, b]) => { x.strokeStyle = col; x.beginPath(); x.arc(9, 9, 6.2, Math.PI * a, Math.PI * b); x.stroke(); });
  x.fillStyle = '#4285f4'; x.fillRect(9, 7.4, 6.8, 3.2); c.style.verticalAlign = 'middle'; return c; };
export async function showCloud(app, asHost = false) {
  const body = h('div', { class: 'col' });
  const m = modal('Cloud saves', body, { icon: iconImg('cloud'), width: '720px' });
  let busy = '', files = null, err = '';
  const run = async (label, fn) => { busy = label; err = ''; render(); try { await fn(); } catch (e) { err = e.message || String(e); } busy = ''; render(); };
  const loadList = () => run('Reading your cloud saves…', async () => { files = await listCloud(); });
  const render = () => {
    if (!cloud.supported) { body.replaceChildren(h('p', { class: 'muted' }, 'Google sign-in needs the game to be opened from a web address (https://… or http://localhost), not from a file.')); return; }
    if (!cloud.user) {
      body.replaceChildren(
        h('p', {}, 'Sign in with Google to keep your worlds in the cloud and pick them up on any device. Saves go into a hidden, private folder in your own Google Drive that only Ancestry World can see — nothing else in your Drive is touched.'),
        err ? h('p', { class: 'warn' }, err) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', disabled: !!busy, onclick: () => run('Opening Google…', async () => { await signIn(); files = await listCloud(); }) }, googleG(), busy || ' Sign in with Google')),
        h('p', { class: 'tiny muted' }, 'Tip: if the Google window is blocked, allow pop-ups for this page and try again.'));
      return;
    }
    const u = cloud.user;
    const locals = [];
    body.replaceChildren(
      h('div', { class: 'row' }, u.picture ? h('img', { src: u.picture, alt: '', referrerpolicy: 'no-referrer', style: { width: '36px', height: '36px', borderRadius: '50%' } }) : null,
        h('div', { class: 'col grow', style: { gap: '1px' } }, h('b', {}, u.name), h('span', { class: 'tiny muted' }, u.email)),
        h('button', { class: 'btn sm', onclick: () => { signOut(); files = null; render(); } }, 'Sign out')),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: app.settings.cloudAuto !== false, onchange: (e) => { app.settings.cloudAuto = e.target.checked; saveSettings(app.settings); } }), ' Sync automatically — every save and autosave is also copied to the cloud'),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', disabled: !!busy, onclick: loadList }, 'Refresh'),
        h('button', { class: 'btn sm primary', disabled: !!busy, tip: 'Upload your newest local save of each world', onclick: () => run('Uploading…', async () => {
          const all = await listSaves(), seen = new Set();
          for (const sv of all) { const k = sv.id.startsWith('auto:') ? sv.id.split(':').slice(0, 2).join(':') : sv.id; if (seen.has(k)) continue; seen.add(k); const r = await loadSave(sv.id); await pushSave(k, r.data, sv.meta); }
          files = await listCloud(); toast(`Uploaded ${seen.size} world${seen.size === 1 ? '' : 's'} to the cloud`, { sound: 'confirm' });
        }) }, 'Upload my local saves'),
        busy ? h('span', { class: 'small muted' }, busy) : null),
      err ? h('p', { class: 'warn' }, err) : null,
      files === null ? h('div', { class: 'spinner' }) : files.length === 0 ? h('p', { class: 'muted' }, 'No cloud saves yet. Save a world (or press “Upload my local saves”) and it will appear here.') : null,
      ...(files || []).map((f) => { const p = f.appProperties || {}; return h('div', { class: 'card save-card' }, h('div'),
        h('div', { class: 'col', style: { gap: '2px' } }, h('b', {}, p.name || f.name, p.auto ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, 'Autosave') : null),
          h('span', { class: 'small muted' }, `${p.nation || ''}${p.year ? ' · Year ' + p.year : ''}${p.era !== undefined && p.era !== '' ? ' · ' + (ERAS[+p.era]?.name || '') : ''}${p.pop ? ' · pop ' + p.pop : ''}`),
          h('span', { class: 'tiny muted' }, 'Cloud · ' + new Date(f.modifiedTime).toLocaleString())),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary sm', disabled: !!busy, onclick: () => run('Downloading…', async () => { const data = await pullSave(f.id); m.close(); app.loadWorld(data, asHost); }) }, asHost ? 'Host' : 'Load'),
          h('button', { class: 'btn sm', disabled: !!busy, tip: 'Keep a copy on this device', onclick: () => run('Copying…', async () => { const data = await pullSave(f.id); await saveWorld('cloud:' + (p.key || f.id), data, { name: p.name, nation: p.nation, year: +p.year || 0, era: +p.era || 0, pop: +p.pop || 0, auto: !!p.auto }); toast('Copied to this device', { sound: 'confirm' }); }) }, 'Save here'),
          h('button', { class: 'btn danger sm', tip: 'Delete from the cloud', disabled: !!busy, onclick: () => { if (confirm('Delete this cloud save permanently?')) run('Deleting…', async () => { await deleteCloud(f.id); files = await listCloud(); }); } }, '🗑'))); }),
    );
  };
  render();
  if (cloud.user) loadList();
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
    if (tab === 'credits') add(content, h('p', {}, LPC_CREDIT), h('p', {}, GCHAR_CREDIT), h('p', {}, 'Farm animals and crops: "Modern Farm" by LimeZu (limezu.itch.io). Moon & planet shading: PixelPlanets by Deep-Fold (MIT, deep-fold.itch.io).'), h('p', {}, 'Music: "8 Bit Videogame Music No Copyright" by Lofi Elephant — youtube.com/@lofielephant (free to use with attribution).'), h('p', { class: 'small muted' }, 'Full author list: assets/packs/lpc/AUTHORS.txt. Optional alternate character pack built from a Kaggle pixel-characters dataset (local only). Terrain, buildings, animals, icons, effects, music and sound are procedurally generated.'));
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
  const section = (title, icon, ...rows) => h('section', { class: 'set-section' }, h('h4', {}, iconImg(icon, 2, 'px-icon sm'), title), h('div', { class: 'set-card' }, ...rows));
  const rowOf = (label, desc, control, extra) => h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('b', {}, label), desc ? h('small', {}, desc) : null), control, extra);
  const range = (label, key, min, max, step = 1, fmt = (v) => v, obj = s, desc = '') => {
    const pill = h('span', { class: 'val-pill' }, fmt(obj[key]));
    const input = h('input', { type: 'range', min, max, step, value: obj[key], 'aria-label': label, oninput: (e) => { obj[key] = +e.target.value; pill.textContent = fmt(obj[key]); commit(); } });
    const n = Math.min(6, Math.floor((max - min) / step) + 1);
    return rowOf(label, desc, h('div', { class: 'rng' }, input, h('div', { class: 'ticks' }, Array.from({ length: n }, () => h('i')))), pill);
  };
  const check = (label, key, obj = s, desc = '') => h('label', { class: 'set-row check' }, h('div', { class: 'set-label' }, h('b', {}, label), desc ? h('small', {}, desc) : null), h('input', { type: 'checkbox', checked: !!obj[key], onchange: (e) => { obj[key] = e.target.checked; commit(); } }));
  const select = (label, key, opts, desc = '', num = false) => rowOf(label, desc, h('select', { onchange: (e) => { s[key] = num ? +e.target.value : e.target.value; commit(); } }, opts.map(([v, l]) => h('option', { value: v, selected: s[key] === v }, l))));
  const render = () => {
    const c = h('div', { class: 'col' });
    if (tab === 'display') add(c,
      section('Theme', 'star', h('div', { class: 'grid-3' }, THEMES.map((t) => h('div', { class: `card pick ${s.theme === t.id ? 'on' : ''}`, onclick: () => { s.theme = t.id; commit(); render(); } }, h('b', {}, t.name), h('div', { class: 'tiny muted' }, t.desc))))),
      section('Interface', 'settings',
        range('Master UI scale', 'uiScale', 75, 150, 5, (v) => v + '%', s, 'Scales every panel, window and button'),
        range('Text & tooltip size', 'textScale', 80, 140, 5, (v) => v + '%', s, 'Make text easier to read'),
        range('Ultrawide HUD edge padding', 'edgePad', 0, 600, 10, (v) => v + 'px', s, 'Pull the HUD in from the screen edges')),
      section('Effects', 'storm',
        range('Screen shake', 'shake', 0, 100, 5, (v) => v + '%', s, 'Quakes, meteors and explosions'),
        range('Flash intensity', 'flash', 0, 100, 5, (v) => v + '%', s, 'Lightning and bright effects'),
        range('Particles & weather density', 'particles', 0, 150, 10, (v) => v + '%', s, 'Rain, snow, dust and sparkles')),
      section('Art & accessibility', 'eye',
        select('Character art', 'characterStyle', [['lpc', 'Gandalf layered characters (animated, default)'], ['lpc_old', 'LPC layered characters (classic)'], ['pack', 'Pixel character pack'], ['procedural', 'Procedural (era outfits & body types)']]),
        select('Colour-blind palette', 'colorblind', [['none', 'Off'], ['deuteranopia', 'Deuteranopia'], ['protanopia', 'Protanopia'], ['tritanopia', 'Tritanopia']]),
        check('Pixel-grid snapping & crisp scaling', 'pixelSnap'), check('Glitter cursor trail', 'cursorTrail')));
    if (tab === 'gameplay') add(c,
      section('Smart auto-pause', 'pause', h('div', { class: 'grid-2' }, check('War declared on me', 'war', s.autoPause), check('New era reached', 'era', s.autoPause), check('Major disasters', 'disaster', s.autoPause), check('Pinned citizen dies', 'favoriteDeath', s.autoPause))),
      section('Time', 'fast', rowOf('Speed presets', 'Hotkeys 1–5', h('div', { class: 'row' }, s.speeds.map((v, i) => h('input', { type: 'number', min: 0.25, max: 10, step: 0.25, value: v, style: { width: '64px' }, onchange: (e) => { s.speeds[i] = Math.max(0.25, Math.min(10, +e.target.value)); commit(); } }))))),
      section('Saving', 'save',
        select('Autosave', 'autosaveEvery', [[1, 'Every minute'], [2, 'Every 2 minutes'], [5, 'Every 5 minutes'], [10, 'Every 10 minutes'], [0, 'Off']], 'Also saves when you switch tabs or close the page (host only in co-op)', true),
        range('Rolling autosave slots', 'autosaveSlots', 1, 10, 1, (v) => v, s, 'How many autosaves to keep per world')),
      section('Performance & help', 'gear',
        range('Tooltip hover delay', 'tooltipDelay', 0, 1000, 50, (v) => v + 'ms'),
        range('Background FPS limit', 'bgFps', 1, 60, 1, (v) => v + ' fps', s, 'When the tab is unfocused')),
      section('Chronicle filters', 'scroll', h('div', { class: 'grid-3' }, Object.keys(s.feedFilters).map((k) => check(k[0].toUpperCase() + k.slice(1), k, s.feedFilters)))));
    if (tab === 'camera') add(c, section('Camera', 'map', check('Edge scrolling', 'edgeScroll'), range('Pan sensitivity', 'panSens', 25, 250, 5, (v) => v + '%'), range('Zoom sensitivity', 'zoomSens', 25, 250, 5, (v) => v + '%'), check('Zoom toward cursor (surface → globe → space)', 'zoomToCursor')));
    if (tab === 'audio') add(c,
      section('Music', 'volume', select('Music', 'musicSource', [['playlist', 'Soundtrack (8-bit lofi by Lofi Elephant)'], ['generative', 'Generative era music'], ['off', 'Off']]), h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => audio.nextTrack() }, '⏭ Next track'), h('button', { class: 'btn sm', onclick: () => { audio.init(); audio.play('power', { power: 'heal' }); } }, '▶ Test sound'))),
      section('Volume', 'volume', ...CHANNELS.map((ch) => range({ master: 'Master', music: 'Era music', ambient: 'Ambient weather & space', ui: 'Interface', miracles: 'Miracles', world: 'World & citizens' }[ch], ch, 0, 100, 1, (v) => v + '%', s.volume))));
    if (tab === 'controls') {
      const conf = keyConflicts(s.keys);
      const groups = {}; for (const [a, d] of Object.entries(ACTIONS)) (groups[d.group] ||= []).push([a, d]);
      add(c, h('div', { class: 'row' }, h('span', { class: 'small muted grow' }, 'Click a key, then press the new key. Esc clears. Conflicts are shown in red.'), h('button', { class: 'btn sm', onclick: () => { s.keys = { ...DEFAULT_KEYS }; commit(); render(); } }, 'Reset all')));
      for (const [g, list] of Object.entries(groups)) add(c, section(g, 'gear', ...list.map(([a, d]) => h('div', { class: 'keyrow' }, h('span', {}, d.label, conf[a] ? h('span', { class: 'tiny', style: { color: 'var(--bad)', marginLeft: '6px' } }, `conflicts with ${conf[a].map((x) => ACTIONS[x].label).join(', ')}`) : null),
        h('button', { class: `btn sm ${conf[a] ? 'conflict' : ''}`, onclick: (e) => { const b = e.currentTarget; b.textContent = 'Press a key…'; const fn = (ev) => { ev.preventDefault(); ev.stopPropagation(); s.keys[a] = ev.code === 'Escape' ? '' : ev.code; removeEventListener('keydown', fn, true); commit(); render(); }; addEventListener('keydown', fn, true); } }, keyLabel(s.keys[a]))))));
    }
    if (tab === 'privacy') add(c, section('Privacy & help', 'lock', check('Stream / friend-safe mode', 'streamerMode', s, 'Hide invite codes & lobby info on screen'), h('button', { class: 'btn sm', onclick: () => { s.tutorialDone = false; commit(); toast('The tutorial will play next time you enter a world.'); } }, 'Replay tutorial')));
    body.replaceChildren(tabs([['display', 'Display'], ['gameplay', 'Gameplay'], ['camera', 'Camera'], ['audio', 'Audio'], ['controls', 'Controls'], ['privacy', 'Privacy & help']], tab, (t) => { tab = t; render(); }), c);
  };
  render();
  modal('Settings', body, { icon: iconImg('settings'), width: '780px' });
}

// ---------- Flag editor (used after founding a settlement) ----------
export function showFlagEditor(app, nation, { first = false } = {}) {
  const f = { ...(nation.flag || { pattern: 'solid', c1: nation.color, c2: '#1b1f3a', c3: '#ffffff', emblem: 'star', ec: '#ffffff' }) };
  let name = nation.name, editing = 'c1';
  const preview = h('div', { class: 'center' });
  const body = h('div', { class: 'col' });
  // one wheel; the chips below choose which colour it edits (primary doubles as the map colour)
  const wheel = colorWheel({ value: f[editing], onChange: (c) => { f[editing] = c; paintLive(); } });
  const chipsEl = h('div', { class: 'row wrap' });
  const chipList = () => [['c1', 'Primary'], ['c2', 'Secondary'], ...(String(f.pattern).startsWith('tricolor') ? [['c3', 'Third']] : []), ['ec', 'Emblem']];
  const paintChips = () => { if (!chipList().some(([k]) => k === editing)) { editing = 'c1'; wheel.setValue(f.c1); } chipsEl.replaceChildren(...chipList().map(([k, label]) => h('button', { type: 'button', class: `color-chip ${editing === k ? 'on' : ''}`, onclick: () => { editing = k; wheel.setValue(f[k]); paintChips(); } }, h('span', { class: 'sw', style: { background: f[k] } }), label))); };
  const drawPreview = () => { const big = flagCanvas(f, 96, 64); big.style.width = '240px'; big.style.height = '160px'; big.style.imageRendering = 'pixelated'; big.style.borderRadius = '10px'; big.style.boxShadow = 'var(--shadow)'; preview.replaceChildren(big); };
  let t = 0;
  const paintLive = () => { paintChips(); cancelAnimationFrame(t); t = requestAnimationFrame(() => { drawPreview(); patterns.forEach(([p, holder]) => { const c = flagCanvas({ ...f, pattern: p, emblem: 'none' }, 24, 16); c.style.width = '48px'; c.style.height = '32px'; c.style.imageRendering = 'pixelated'; holder.replaceChildren(c); }); }); };
  const patterns = [];
  const render = () => {
    patterns.length = 0; drawPreview(); paintChips();
    body.replaceChildren(
      first ? h('p', { class: 'muted' }, 'Your people have built their first settlement. Raise a banner they can rally beneath!') : null,
      h('div', { class: 'flag-top' }, preview, h('div', { class: 'col grow' }, h('div', { class: 'small muted' }, 'Pick a colour to edit, then use the wheel'), chipsEl, wheel)),
      h('label', { class: 'field' }, 'Nation name', h('input', { type: 'text', value: name, maxlength: 32, oninput: (e) => (name = e.target.value) })),
      h('div', { class: 'small muted' }, 'Pattern'), h('div', { class: 'row wrap' }, FLAG_PATTERNS.map((p) => { const holder = h('div'); patterns.push([p, holder]); const c = flagCanvas({ ...f, pattern: p, emblem: 'none' }, 24, 16); c.style.width = '48px'; c.style.height = '32px'; c.style.imageRendering = 'pixelated'; holder.append(c); return h('div', { class: `card pick ${f.pattern === p ? 'on' : ''}`, style: { padding: '5px' }, onclick: () => { f.pattern = p; render(); } }, holder); })),
      h('div', { class: 'small muted' }, 'Emblem'),
      h('div', { class: 'row wrap emblem-grid', style: { maxHeight: '178px', overflowY: 'auto', padding: '2px' } }, FLAG_EMBLEMS.map((e) => { const c = flagCanvas({ pattern: 'solid', c1: '#262a3a', c2: '#262a3a', c3: '#262a3a', emblem: e, ec: e === 'none' ? '#262a3a' : f.ec, es: 0.95, ep: 'c' }, 20, 16); c.style.width = '40px'; c.style.height = '32px'; c.style.imageRendering = 'pixelated'; c.style.borderRadius = '4px'; return h('div', { class: `card pick ${f.emblem === e ? 'on' : ''}`, title: e === 'none' ? 'No emblem' : e, style: { padding: '3px', position: 'relative' }, onclick: () => { f.emblem = e; render(); } }, c, e === 'none' ? h('span', { class: 'tiny', style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center' } }, 'None') : null); })),
      h('div', { class: 'row wrap', style: { alignItems: 'center' } },
        h('span', { class: 'small muted' }, 'Position'), ...FLAG_EMBLEM_POS.map(([k, l]) => h('button', { type: 'button', class: `btn sm ${(f.ep || 'c') === k ? 'active' : ''}`, onclick: () => { f.ep = k; render(); } }, l)),
        h('span', { class: 'small muted', style: { marginLeft: '8px' } }, 'Size'), ...FLAG_EMBLEM_SIZE.map(([k, l]) => h('button', { type: 'button', class: `btn sm ${Math.abs((f.es || 0.85) - k) < 0.05 ? 'active' : ''}`, onclick: () => { f.es = k; render(); } }, l))),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: `btn sm ${f.eo ? 'active' : ''}`, onclick: () => { f.eo = f.eo ? 0 : 1; render(); } }, 'Emblem outline'),
        h('button', { type: 'button', class: `btn sm ${f.em ? 'active' : ''}`, onclick: () => { f.em = f.em ? 0 : 1; render(); } }, 'Mirror pattern'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { const r = (a) => a[Math.floor(Math.random() * a.length)], hx = () => '#' + [0, 0, 0].map(() => Math.floor(40 + Math.random() * 190).toString(16).padStart(2, '0')).join(''); f.pattern = r(FLAG_PATTERNS); f.emblem = r(FLAG_EMBLEMS.slice(1)); f.c2 = hx(); f.c3 = hx(); f.ec = r(['#ffffff', '#f8e7a0', '#111111', hx()]); f.ep = r(['c', 'c', 'h', 'f']); f.es = r([0.6, 0.85, 1.1]); f.eo = Math.random() < 0.4 ? 1 : 0; f.em = Math.random() < 0.3 ? 1 : 0; wheel.setValue(f[editing]); render(); } }, 'Surprise me')),
      h('div', { class: 'tiny muted' }, 'The primary colour is also your colour on the map.'),
      h('div', { class: 'row sticky-foot', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn primary', onclick: async () => { const r = await app.session.command({ type: 'flag', flag: f, name, color: f.c1 }); if (r.ok) { toast('Your banner flies high!', { sound: 'confirm' }); m.close(); } else toast(r.msg || 'Could not set flag', { sound: 'error' }); } }, iconImg('flag'), 'Raise banner')),
    );
  };
  render();
  const m = modal(first ? 'Design your flag' : 'Flag & identity', body, { icon: iconImg('flag'), width: '680px' });
}

// ---------- Update log ----------
const TAG = { new: ['New', 'var(--good)'], improved: ['Improved', 'var(--info)'], fixed: ['Fixed', 'var(--accent-2)'], balance: ['Balance', 'var(--warn)'] };
export function showChangelog(app) {
  let filter = 'all';
  const body = h('div', { class: 'col' });
  const render = () => {
    const list = h('div', { class: 'col' });
    for (const [i, v] of CHANGELOG.entries()) {
      const notes = v.notes.filter(([t]) => filter === 'all' || t === filter);
      if (!notes.length) continue;
      add(list, h('div', { class: 'card col', style: { gap: '6px' } },
        h('div', { class: 'row' }, h('b', { style: { fontSize: '1.1em' } }, `v${v.version}`), h('span', {}, v.title), i === 0 ? h('span', { class: 'chip', style: { color: 'var(--accent)' } }, 'Latest') : null, h('span', { class: 'tiny muted', style: { marginLeft: 'auto' } }, new Date(v.date + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))),
        ...notes.map(([t, text]) => h('div', { class: 'row small', style: { alignItems: 'flex-start' } }, h('span', { class: 'chip', style: { color: TAG[t][1], minWidth: '76px', justifyContent: 'center', flex: 'none' } }, TAG[t][0]), h('span', { style: { lineHeight: 1.45 } }, text)))));
    }
    if (!list.children.length) add(list, h('p', { class: 'muted' }, 'Nothing in this category yet.'));
    body.replaceChildren(tabs([['all', 'All'], ['new', 'New'], ['improved', 'Improved'], ['fixed', 'Fixed'], ['balance', 'Balance']], filter, (f) => { filter = f; render(); }), list);
  };
  render();
  app.settings.lastSeenVersion = CURRENT_VERSION; saveSettings(app.settings);
  modal("What's New", body, { icon: iconImg('scroll'), width: '720px' });
}
