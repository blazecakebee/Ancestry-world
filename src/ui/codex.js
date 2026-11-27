// The Codex: a sidebar-driven reference. One section at a time, card based, searchable, every entry with an icon.
import { h, modal } from './dom.js';
import { iconImg } from '../render/miscart.js';
import { TRAITS } from '../data/traits.js';
import { ERAS } from '../data/eras.js';
import { POWERS, TIERS, POWER_CATS } from '../data/powers.js';
import { GOVERNMENTS } from '../data/society.js';
import { RACES } from '../data/races.js';
import { BIOMES } from '../data/biomes.js';
import { WORLD_AGES } from '../sim/events.js';
import { LORE } from '../data/lore.js';
import { fmtSpan } from '../core/time.js';
import { MEMES, PRECEPTS, RITUALS } from '../data/creed.js';
import { LPC_CREDIT } from '../render/lpc.js';
import { GCHAR_CREDIT } from '../render/gchar.js';

const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)); return el; };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const fxText = (fx) => Object.entries(fx || {}).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' · ');
const CAT_ICON = { divine: 'dove', nature: 'tree', life: 'heart', farm: 'wheat', wild: 'sickle', war: 'sword', curses: 'skull', world: 'mountain' };
const TRAIT_ICON = { mind: 'bulb', spirit: 'glitter', social: 'chat', body: 'heart', special: 'star', acquired: 'scroll' };

const SECTIONS = [
  ['lore', 'Welcome', 'book'], ['powers', 'Powers', 'glitter'], ['creed', 'Creeds', 'dove'], ['traits', 'Traits', 'users'],
  ['races', 'Races', 'house'], ['eras', 'Eras', 'research'], ['gov', 'Governments', 'crown'], ['ages', 'World Ages', 'storm'],
  ['biomes', 'Biomes', 'mountain'], ['credits', 'Credits', 'info'],
];

const chip = (text, cls = '') => h('span', { class: `chip ${cls}` }, text);
const head = (icon, title, sub) => h('div', { class: 'cx-head' }, iconImg(icon, 3), h('div', {}, h('h3', {}, title), sub ? h('p', { class: 'small muted' }, sub) : null));
const card = (icon, title, badge, body, extra = {}) => h('div', { class: 'cx-card', style: extra.color ? { '--cx': extra.color } : null },
  h('div', { class: 'cx-top' }, icon, h('b', {}, title), badge ? h('span', { class: 'cx-badge' }, badge) : null), body);
const pills = (items) => h('div', { class: 'cx-pills' }, items.filter(Boolean).map(([ic, t]) => h('span', { class: 'cx-pill' }, ic ? iconImg(ic, 1, 'px-icon xs') : null, t)));
const filterBar = (opts, cur, set) => h('div', { class: 'cx-filters' }, opts.map(([id, label, ic]) => h('button', { class: `cx-f ${cur === id ? 'on' : ''}`, onclick: () => set(id) }, ic ? iconImg(ic, 1, 'px-icon xs') : null, label)));

export function showCodex(tab = 'lore') {
  let q = '', sub = 'all';
  const nav = h('nav', { class: 'cx-nav' });
  const pane = h('div', { class: 'cx-pane' });
  const search = h('input', { type: 'search', class: 'cx-search', placeholder: 'Search this section…', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } });
  const match = (...txt) => !q || txt.join(' ').toLowerCase().includes(q);

  const sections = {
    lore() {
      const out = h('div', { class: 'col' });
      add(out, head('book', 'The Deity\'s Handbook', 'How to be a gentle god.'),
        h('div', { class: 'cx-intro' }, ...LORE.intro.split('\n\n').map((p) => h('p', {}, p))),
        h('div', { class: 'cx-grid' }, LORE.deityGuide.filter((g) => match(g.title, g.text)).map((g) => card(iconImg(GUIDE_ICON[g.title] || 'info', 2), g.title, null, h('p', { class: 'small' }, g.text)))),
        h('h4', { class: 'cx-sub' }, 'Sayings of the world'),
        h('div', { class: 'cx-quotes' }, LORE.quotes.slice(0, 8).map((x) => h('blockquote', {}, `“${x.text}”`, h('cite', {}, x.by)))));
      return out;
    },
    powers() {
      const out = h('div', { class: 'col' });
      add(out, head('glitter', 'Powers', `${POWERS.length} miracles, each costing Glitter and resting for a cooldown. Higher tiers unlock with lifetime devotion.`),
        filterBar([['all', 'All', 'star'], ...POWER_CATS.map(([id, n]) => [id, n, CAT_ICON[id]])], sub, (v) => { sub = v; draw(); }));
      for (const T of TIERS) {
        const list = POWERS.filter((p) => p.tier === T.tier && (sub === 'all' || p.cat === sub) && match(p.name, p.desc, p.cat));
        if (!list.length) continue;
        add(out, h('h4', { class: 'cx-sub' }, `Tier ${T.tier} · ${T.name}`, h('span', { class: 'muted small' }, T.devotion ? ` — needs ${T.devotion} devotion` : ' — from the start')),
          h('div', { class: 'cx-grid' }, list.map((p) => card(iconImg(p.icon, 2), p.name, `✦ ${p.cost}`, h('div', {}, h('p', { class: 'small' }, p.desc),
            pills([[null, cap(p.cat)], [null, `${fmtSpan(p.cd)} rest`], [null, p.target === 'tile' ? `brush ${p.radius}` : p.target], p.minEra ? [null, `era ${p.minEra}+`] : null])), { color: p.color }))));
      }
      if (out.querySelectorAll('.cx-card').length === 0) add(out, h('p', { class: 'muted' }, 'No powers match.'));
      return out;
    },
    creed() {
      const out = h('div', { class: 'col' });
      add(out, head('dove', 'Creeds', 'A nation\'s ideals, precepts and rites. Nudge them, never command them.'),
        h('h4', { class: 'cx-sub' }, 'Ideals'),
        h('div', { class: 'cx-grid' }, MEMES.filter((m) => match(m.name, m.desc)).map((m) => card(iconImg(m.icon || 'star', 2), m.name, m.impact, h('div', {}, h('p', { class: 'small' }, m.desc),
          pills([m.fx && Object.keys(m.fx).length ? [null, fxText(m.fx)] : null, m.ritual && RITUALS[m.ritual] ? ['scroll', RITUALS[m.ritual].name] : null]))))),
        h('h4', { class: 'cx-sub' }, 'Precepts'),
        h('div', { class: 'cx-grid' }, PRECEPTS.filter((p) => match(p.name, p.options.map((o) => o.label + o.desc).join(' '))).map((p) => card(iconImg('scroll', 2), p.name, null,
          h('ul', { class: 'cx-opts' }, p.options.map((o) => h('li', {}, h('b', {}, o.label), h('span', { class: 'small muted' }, ` — ${o.desc}`))))))),
        h('h4', { class: 'cx-sub' }, 'Rituals'),
        h('div', { class: 'cx-grid' }, Object.values(RITUALS).filter((r) => match(r.name, r.blurb)).map((r) => card(iconImg(r.temple ? 'temple' : 'trophy', 2), r.name, `every ~${r.every}d`, h('p', { class: 'small' }, r.blurb)))));
      return out;
    },
    traits() {
      const cats = {}; for (const t of Object.values(TRAITS)) (cats[t.cat] ||= []).push(t);
      const out = h('div', { class: 'col' });
      add(out, head('users', 'Traits', 'What makes each citizen who they are. Some are inherited, some earned.'),
        filterBar([['all', 'All', 'star'], ...Object.keys(cats).map((c) => [c, cap(c), TRAIT_ICON[c]])], sub, (v) => { sub = v; draw(); }));
      for (const [c, list] of Object.entries(cats)) {
        if (sub !== 'all' && sub !== c) continue;
        const l = list.filter((t) => match(t.name, t.desc));
        if (!l.length) continue;
        add(out, h('h4', { class: 'cx-sub' }, iconImg(TRAIT_ICON[c] || 'star', 1, 'px-icon xs'), cap(c)),
          h('div', { class: 'cx-grid' }, l.map((t) => card(h('span', { class: 'cx-dot', style: { background: t.color } }), t.name, null, h('div', {}, h('p', { class: 'small' }, t.desc), pills([[null, fxText(t.fx)]])), { color: t.color }))));
      }
      return out;
    },
    races() {
      return add(h('div', { class: 'col' }), head('house', 'Races', 'Three peoples share the world, each with gifts of its own.'),
        h('div', { class: 'cx-grid' }, Object.values(RACES).filter((r) => match(r.name, r.desc)).map((r) => card(h('span', { class: 'cx-dot', style: { background: r.color } }), r.name, null, h('div', {}, h('p', { class: 'small' }, r.desc), pills([[null, fxText(r.fx)]])), { color: r.color }))));
    },
    eras() {
      return add(h('div', { class: 'col' }), head('research', 'Eras', 'From flint to starships. Each age brings new tools, medicine and meals.'),
        h('div', { class: 'cx-timeline' }, ERAS.filter((e) => match(e.name, e.short, e.blurb)).map((e) => h('div', { class: 'cx-era' }, h('div', { class: 'cx-num' }, e.id + 1),
          h('div', { class: 'cx-body' }, h('div', { class: 'cx-top' }, h('b', {}, e.name), h('span', { class: 'cx-badge' }, e.short), h('span', { class: 'cx-badge' }, e.cost ? `${e.cost.toLocaleString()} research` : 'start')),
            h('p', { class: 'small' }, LORE.eras[e.key] || e.blurb), pills([['sword', e.weapon.name], ['medicine', e.med], ['meals', e.meal], ['rations', e.ration]]))))));
    },
    gov() {
      return add(h('div', { class: 'col' }), head('crown', 'Governments', 'How a nation chooses who leads it.'),
        h('div', { class: 'cx-grid' }, GOVERNMENTS.filter((g) => match(g.name, LORE.governments?.[g.id])).map((g) => card(iconImg('crown', 2), g.name, `from ${ERAS[g.era].name}`, h('div', {}, h('p', { class: 'small' }, LORE.governments?.[g.id] || ''), pills([[null, `Succession: ${g.succession}`], g.fx && Object.keys(g.fx).length ? [null, fxText(g.fx)] : null]))))));
    },
    ages() {
      return add(h('div', { class: 'col' }), head('storm', 'World Ages', 'The sky\'s moods: some bless, some test.'),
        h('div', { class: 'cx-grid' }, Object.entries(WORLD_AGES).filter(([id, a]) => match(a.name, a.desc)).map(([id, a]) => card(iconImg('storm', 2), a.name, null, h('div', {}, h('p', { class: 'small' }, LORE.ages[id] || a.desc), h('p', { class: 'tiny muted' }, a.desc)), { color: a.color }))));
    },
    biomes() {
      return add(h('div', { class: 'col' }), head('mountain', 'Biomes', `${BIOMES.length} kinds of land. Terrain shapes who thrives where.`),
        h('div', { class: 'cx-grid' }, BIOMES.filter((b) => match(b.name, LORE.biomes[b.key])).map((b) => card(h('span', { class: 'cx-dot big', style: { background: `rgb(${b.color})` } }), b.name, null, h('p', { class: 'small' }, LORE.biomes[b.key] || '')))));
    },
    credits() {
      return add(h('div', { class: 'col' }), head('info', 'Credits'), h('div', { class: 'cx-intro' },
        h('p', {}, LPC_CREDIT), h('p', {}, GCHAR_CREDIT),
        h('p', {}, 'Farm animals, crops, farm buildings and item icons: "Modern Farm" by LimeZu. Town buildings, statues, fountains and street furniture: "Modern Exteriors" by LimeZu (limezu.itch.io). Civilization Book and paper menus: "Paper UI System" by Humble Gift. Moon & planet shading: PixelPlanets by Deep-Fold (MIT, deep-fold.itch.io).'),
        h('p', {}, 'Music: "8 Bit Videogame Music No Copyright" by Lofi Elephant — youtube.com/@lofielephant (free to use with attribution).'),
        h('p', { class: 'small muted' }, 'Full author list: assets/packs/lpc/AUTHORS.txt. Terrain, buildings, animals, icons, effects, music and sound are procedurally generated.')));
    },
  };
  const GUIDE_ICON = { 'Glitter and Devotion': 'glitter', 'Temples and Prophets': 'temple', 'Creed & Will': 'dove', Possession: 'possess', 'Permissions in Co-op': 'lock', Flags: 'flag', 'Rations and Decrees': 'rations', 'World Ages': 'storm' };

  const draw = () => {
    nav.replaceChildren(...SECTIONS.map(([id, label, ic]) => h('button', { class: `cx-n ${tab === id ? 'on' : ''}`, onclick: () => { tab = id; q = ''; sub = 'all'; search.value = ''; draw(); pane.scrollTop = 0; } }, iconImg(ic, 2, 'px-icon sm'), h('span', {}, label))));
    search.style.display = tab === 'lore' || tab === 'credits' ? 'none' : '';
    const body = sections[tab]();
    pane.replaceChildren(body);
  };
  const right = h('div', { class: 'cx-right' }, search, pane);
  draw();
  modal('Codex', h('div', { class: 'cx' }, nav, right), { icon: iconImg('book'), width: 'min(1040px, 95vw)' }).el.classList.add('book-modal');
}
