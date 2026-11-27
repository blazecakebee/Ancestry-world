// A short, friendly spotlight tutorial (replayable from the HUD or Settings).
import { h } from './dom.js';
import { saveSettings } from './settings.js';
import { audio } from '../audio/audio.js';

const STEPS = [
  { title: 'Welcome, little god ✦', text: (a) => `You are the Patron Deity of <b>${a.session.myNation?.name || 'your people'}</b>. You don't command them — you inspire, protect and guide them from the first campfire to the stars.` },
  { title: 'Look around', text: () => 'Scroll to zoom from a single citizen, out to the map, to the whole planet and even orbit. Drag or use <span class="kbd">WASD</span> to pan.' },
  { target: '.hud-left [data-tool=inspect]', title: 'Meet your people', text: () => 'With the Inspect tool, click any citizen. Every person has a name, family, traits, skills, needs, moods and a body that can be hurt or healed.' },
  { target: '.glitter-count', title: 'Glitter', text: () => 'Your power comes from devotion. When your people are happy and worship at temples, Glitter flows in. Lifetime devotion unlocks stronger tiers of miracles.' },
  { target: '.powerbar', title: 'Miracles', text: () => 'Pick a power, then click your land or a citizen. Try <b>Fertile Rain</b> on your fields, or <b>Minor Healing</b> on someone hurt. Powers never work on a friend\'s nation without their permission.' },
  { target: '.nation-pill', title: 'Creed & Will', text: () => 'Open your nation to shape its creed (ideals, precepts, rituals), set rations and focus, design your flag, handle diplomacy and — in co-op — grant friends permissions.' },
  { target: '.hud-left [data-tool=possess]', title: 'Walk among them', text: () => 'Select one of your citizens and <b>Possess</b> them: move with WASD, act with <span class="kbd">F</span> (chop, mine, harvest, fight) and release with <span class="kbd">R</span>.' },
  { target: '.speed-group', title: 'Time', text: (a) => a.session.mode === 'single' ? 'Pause with <span class="kbd">Space</span> and change speed with <span class="kbd">1</span>–<span class="kbd">5</span>. Your civilization grows slowly — eras take years.' : 'In co-op the clock is shared: everyone sees the same time, and speed/pause affect the whole world.' },
  { target: '.chronicle:not(.hidden), .chronicle-pill:not(.hidden)', title: 'The Chronicle', text: () => 'Births, deaths, wars, eras and miracles appear in this small feed (minimise it any time). Big events pop up as cards on the right. Click an entry to fly to it.' },
  { title: 'Go gently', text: () => 'That\'s it! Watch, nudge, and let your ancestors write their story. The Codex (<span class="kbd">C</span>) explains every trait, era and power.' },
];

export class Tutorial {
  constructor(app) { this.app = app; this.i = 0; this.el = null; this.ring = null; }
  start(force = false) {
    if (!force && this.app.settings.tutorialDone) return false;
    this.i = 0; this.show(); return true;
  }
  close(done = true) {
    this.el?.remove(); this.ring?.remove(); this.el = this.ring = null; if (this._rs) window.removeEventListener('resize', this._rs);
    if (done) { this.app.settings.tutorialDone = true; saveSettings(this.app.settings); this.app.onTutorialDone?.(); }
  }
  /** Position the card next to the target but always fully inside the viewport. */
  place(target) {
    if (!this.el) return;
    const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    const vw = innerWidth / z, vh = innerHeight / z, M = 12;
    const tw = this.el.offsetWidth || 340, th = this.el.offsetHeight || 200;
    let x, y;
    this.ring?.remove(); this.ring = null;
    if (target) {
      const r = target.getBoundingClientRect();
      this.ring = h('div', { class: 'tut-ring', style: { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' } });
      document.body.append(this.ring);
      x = r.left / z + r.width / z / 2 - tw / 2;
      y = r.bottom / z + 14;
      if (y + th > vh - M) y = r.top / z - th - 14;   // not enough room below -> above
      if (y < M) y = Math.min(vh - th - M, Math.max(M, r.top / z + 8)); // neither fits -> overlap safely
    } else { x = vw / 2 - tw / 2; y = vh * 0.3; }
    x = Math.max(M, Math.min(vw - tw - M, x)); y = Math.max(M, Math.min(vh - th - M, y));
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', maxWidth: `min(360px, ${vw - 2 * M}px)` });
  }
  show() {
    const s = STEPS[this.i]; if (!s) return this.close();
    this.el?.remove(); this.ring?.remove();
    audio.play('open');
    const next = () => { this.i++; this.show(); }, back = () => { this.i = Math.max(0, this.i - 1); this.show(); };
    this.el = h('div', { class: 'tut glass' },
      h('div', { class: 'step' }, `Step ${this.i + 1} of ${STEPS.length}`),
      h('h3', {}, s.title), h('p', { html: s.text(this.app) }),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onclick: () => this.close() }, 'Skip'), h('div', { class: 'grow' }), this.i ? h('button', { class: 'btn sm', onclick: back }, 'Back') : null, h('button', { class: 'btn primary sm', onclick: next }, this.i === STEPS.length - 1 ? 'Begin' : 'Next')));
    document.getElementById('ui').append(this.el);
    const target = s.target && document.querySelector(s.target);
    this.place(target);
    this._rs = this._rs || (() => this.place(this.i >= 0 && STEPS[this.i]?.target ? document.querySelector(STEPS[this.i].target) : null));
    window.removeEventListener('resize', this._rs); window.addEventListener('resize', this._rs);
  }
}
