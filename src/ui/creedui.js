// The Creed panel inside the Nation window: ideals (memes), precepts, rituals, roles and certainty.
import { h, toast, bar } from './dom.js';
import { iconImg } from '../render/miscart.js';
import { MEMES, MEME, IMPACT, PRECEPTS, RITUALS, memeSlots, incompatible, approvalLabel, CREED_COSTS } from '../data/creed.js';
import { AXES } from '../data/society.js';
import { approval, creedMood, creedFx, hasCreed } from '../sim/creed.js';
import { fullName } from '../sim/pawn.js';

const add = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
const pips = (impact) => h('span', { class: 'pips', tip: `Impact: ${impact}` }, [0, 1, 2].map((i) => h('i', { class: i < (impact === 'high' ? 3 : impact === 'med' ? 2 : 1) ? 'on' : '' })));
const FXN = { research: 'research', work: 'work speed', mood: 'mood', glitter: 'Glitter', melee: 'melee', stability: 'stability', fertility: 'fertility', conscript: 'conscription' };
function fxText(fx) {
  const out = [];
  for (const [k, v] of Object.entries(fx)) if (v && FXN[k]) out.push(`${v > 0 ? '+' : '−'}${k === 'mood' || k === 'stability' ? Math.abs(Math.round(v * 10) / 10) : Math.abs(Math.round(v * 100)) + '%'} ${FXN[k]}`);
  return out.join(', ');
}
function certaintyWord(c, doubt) { return doubt ? 'In doubt' : c < 40 ? 'Wavering' : c < 65 ? 'Steady' : c < 85 ? 'Devout' : 'Unshakeable'; }

export function creedPanel(app, w, n, mine) {
  const root = h('div', { class: 'col creed' });
  if (!hasCreed(n)) { add(root, h('p', { class: 'muted' }, 'These people hold no shared creed.')); return root; }
  const c = n.creed, slots = memeSlots(n.era), now = w.time;
  const act = async (cmd) => { const r = await app.session.command({ type: 'creed', ...cmd }); if (!r.ok) toast(r.msg || 'Refused', { sound: 'error' }); else if (r.msg) toast(r.msg); };
  const leader = w.pawns[n.leaderId], guide = w.pawns[c.guideId];

  // --- certainty & roles
  add(root, h('div', { class: 'card col creed-head' },
    h('div', { class: 'row' }, h('b', { class: 'grow' }, `Certainty — ${certaintyWord(c.certainty, c.doubt)}`), h('span', { class: 'small muted' }, `${Math.round(c.certainty)}%`)),
    h('div', { class: 'bar certainty' + (c.doubt ? ' doubt' : '') }, h('i', { style: { width: `${c.certainty}%` } })),
    h('div', { class: 'tiny muted' }, c.doubt ? 'Doubt is spreading: mood and stability suffer. At zero the people split into a schism.' : 'The more sure the people are, the stronger their rituals. Rival creeds nearby wear it down; prophets, temples and precepts they approve of build it up.'),
    h('div', { class: 'row small', style: { flexWrap: 'wrap', gap: '14px' } },
      h('span', {}, iconImg('crown', 1, 'px-icon sm'), ' Leader: ', leader ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); app.hud.openPawn(leader.id); } }, fullName(leader)) : '—'),
      h('span', {}, iconImg('temple', 1, 'px-icon sm'), ' Moral Guide: ', guide ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); app.hud.openPawn(guide.id); } }, fullName(guide)) : h('span', { class: 'muted' }, 'none — a prophet will arise among the devout')),
      h('span', { class: 'muted' }, `Precept mood ${creedMood(n) >= 0 ? '+' : ''}${creedMood(n).toFixed(1)}`))));

  // --- ideals
  const held = c.memes.map((id) => MEME[id]).filter(Boolean);
  add(root, h('div', { class: 'row' }, h('b', { class: 'grow' }, `Ideals ${held.length}/${slots}`), h('span', { class: 'tiny muted' }, slots < 4 ? `A new slot opens in era ${slots === 2 ? 3 : 6}.` : 'All slots open.')));
  const reformWait = Math.ceil(c.reformAt - now);
  const grid = h('div', { class: 'meme-grid' });
  for (const m of held) {
    add(grid, h('div', { class: 'meme held' }, h('div', { class: 'row' }, iconImg(m.icon, 2, 'px-icon sm'), h('b', { class: 'grow' }, m.name), pips(m.impact)),
      h('div', { class: 'tiny' }, m.desc), h('div', { class: 'tiny muted' }, fxText(Object.fromEntries(Object.entries(m.fx).map(([k, v]) => [k, v * IMPACT[m.impact]])))),
      mine ? h('button', { class: 'btn sm', disabled: held.length <= 1 || reformWait > 0, tip: reformWait > 0 ? `Settling for ${reformWait} more days` : 'Let this ideal fade (−12 certainty)', onclick: () => act({ action: 'meme', op: 'remove', id: m.id }) }, 'Release') : null));
  }
  for (let i = held.length; i < slots; i++) add(grid, h('div', { class: 'meme empty' }, h('span', { class: 'muted small' }, 'Open ideal slot')));
  add(root, grid);
  if (mine) {
    add(root, h('div', { class: 'small muted' }, reformWait > 0 ? `Your people are still settling after the last change (${reformWait} days). Ideological Revelation ends this at once.` : `Taking up or releasing an ideal unsettles the people (−${CREED_COSTS.memeChange} certainty).`));
    const pool = MEMES.filter((m) => !c.memes.includes(m.id));
    const pg = h('div', { class: 'meme-grid small-cards' });
    for (const m of pool) {
      const clash = c.memes.find((x) => incompatible(x, m.id));
      const full = held.length >= slots;
      const why = clash ? `Clashes with ${MEME[clash].name}` : full ? 'No free slot' : reformWait > 0 ? `Settling (${reformWait}d)` : '';
      add(pg, h('div', { class: 'meme' + (why ? ' off' : '') }, h('div', { class: 'row' }, iconImg(m.icon, 2, 'px-icon sm'), h('b', { class: 'grow' }, m.name), pips(m.impact)),
        h('div', { class: 'tiny muted' }, m.desc),
        h('button', { class: 'btn sm', disabled: !!why, tip: why || 'Take up this ideal', onclick: () => act({ action: 'meme', op: 'add', id: m.id }) }, why ? why : 'Take up')));
    }
    add(root, h('details', { class: 'creed-more' }, h('summary', {}, `Other ideals (${pool.length})`), pg));
  }

  // --- precepts
  const pw = Math.ceil(c.preceptAt - now);
  add(root, h('div', { class: 'row' }, h('b', { class: 'grow' }, 'Precepts'), h('span', { class: 'tiny muted' }, mine ? (pw > 0 ? `Adjusting for ${pw} more days` : 'Rules your people live by. Each ideal likes some and hates others.') : '')));
  for (const P of PRECEPTS) {
    const cur = c.precepts[P.id] ?? 1;
    const ap = approvalLabel(approval(n, P.id, cur));
    add(root, h('div', { class: 'precept' }, h('span', { class: 'pname' }, P.name),
      h('div', { class: 'seg' }, P.options.map((o, i) => {
        const a = approvalLabel(approval(n, P.id, i));
        return h('button', { class: 'segb' + (i === cur ? ' on' : ''), disabled: !mine || (i !== cur && pw > 0), tip: `${o.desc}${fxText(o.fx) ? ' (' + fxText(o.fx) + ')' : ''} — your ideals find this ${a.label.toLowerCase()}`, onclick: () => act({ action: 'precept', issue: P.id, option: i }) }, o.label, h('i', { class: 'dotk', style: { background: a.col } }));
      })),
      h('span', { class: 'tag', style: { color: ap.col } }, ap.label)));
  }
  const fx = creedFx(n), ft = fxText(fx);
  add(root, h('div', { class: 'tiny muted' }, ft ? `Together the creed gives: ${ft}.` : 'The creed carries no bonuses right now.'));

  // --- rituals
  const rids = [...new Set(c.memes.map((m) => MEME[m]?.ritual).filter(Boolean))];
  add(root, h('b', {}, 'Rituals'));
  const last = c.last ? RITUALS[c.last.id] : null;
  if (last) add(root, h('div', { class: 'tiny muted' }, `Last: ${last.name} (${c.last.grade === 'ritualGreat' ? 'moving' : c.last.grade === 'ritualGood' ? 'good' : 'hollow'}), ${Math.max(0, Math.round(now - c.last.t))} days ago.`));
  for (const rid of rids) {
    const R = RITUALS[rid], at = c.ritual[rid] ?? now, left = Math.max(0, Math.ceil(at - now));
    add(root, h('div', { class: 'ritual card row' }, h('div', { class: 'col grow', style: { gap: '1px' } }, h('b', {}, R.name), h('span', { class: 'tiny muted' }, `${R.blurb} ${R.temple ? 'Better with a temple.' : ''}`)),
      h('span', { class: 'small muted' }, left > 0 ? `in ${left} d` : 'now'),
      mine ? h('button', { class: 'btn sm', disabled: at - now > R.every * 0.55, tip: 'Call the people together early', onclick: () => act({ action: 'ritual', id: rid }) }, 'Hold now') : null));
  }

  // --- tendencies (derived)
  add(root, h('b', {}, 'Tendencies'), h('div', { class: 'tiny muted' }, 'Where the people lean today. These follow the ideals.'));
  for (const ax of AXES) {
    const v = n.ideology[ax.id];
    add(root, h('div', { class: 'axis' }, h('span', { class: 'pole', tip: ax.negDesc }, ax.neg), h('div', { class: 'bar axisbar' }, h('i', { class: 'mid' }), h('i', { class: 'fill', style: { left: v < 0 ? `${50 + v / 2}%` : '50%', width: `${Math.abs(v) / 2}%` } })), h('span', { class: 'pole r', tip: ax.posDesc }, ax.pos)));
  }
  return root;
}
