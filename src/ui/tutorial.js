// A short, friendly spotlight tutorial (replayable from the HUD or Settings).
import { h } from './dom.js';
import { saveSettings } from './settings.js';
import { audio } from '../audio/audio.js';

const STEPS = [
  { title: 'Welcome, little god ✦', text: (a) => `You are the Patron Deity of <b>${a.session.myNation?.name || 'your people'}</b>. You don't command them — you inspire, protect and guide them from the first campfire to the stars.` },
  { title: 'Look around', text: () => 'Scroll to zoom from a single citizen, out to the map, to the whole planet and even orbit. Drag or use <span class="kbd">WASD</span> to pan.' },
  { target: '.hud-left .btn:first-child', title: 'Meet your people', text: () => 'With the Inspect tool, click any citizen. Every person has a name, family, traits, skills, needs, moods and a body that can be hurt or healed.' },
  { target: '.glitter-count', title: 'Glitter', text: () => 'Your power comes from devotion. When your people are happy and worship at temples, Glitter flows in. Lifetime devotion unlocks stronger tiers of miracles.' },
  { target: '.powerbar', title: 'Miracles', text: () => 'Pick a power, then click your land or a citizen. Try <b>Fertile Rain</b> on your fields, or <b>Minor Healing</b> on someone hurt. Powers never work on a friend\'s nation without their permission.' },
  { target: '.nation-pill', title: 'Divine Will', text: () => 'Open your nation to steer ideology, set rations and focus, design your flag, handle diplomacy and — in co-op — grant friends permissions.' },
  { target: '.hud-left .btn:nth-child(3)', title: 'Walk among them', text: () => 'Select one of your citizens and <b>Possess</b> them: move with WASD, act with <span class="kbd">F</span> (chop, mine, harvest, fight) and release with <span class="kbd">R</span>.' },
  { target: '.speed-group', title: 'Time', text: (a) => a.session.mode === 'single' ? 'Pause with <span class="kbd">Space</span> and change speed with <span class="kbd">1</span>–<span class="kbd">5</span>. Your civilization grows slowly — eras take years.' : 'In co-op the clock is shared: everyone sees the same time, and speed/pause affect the whole world.' },
  { target: '.feed', title: 'The Chronicle', text: () => 'Births, deaths, wars, eras and miracles appear here. Click an entry to fly to it. Type below to chat with friends.' },
  { title: 'Go gently', text: () => 'That\'s it! Watch, nudge, and let your ancestors write their story. The Codex (<span class="kbd">C</span>) explains every trait, era and power.' },
];

export class Tutorial {
  constructor(app) { this.app = app; this.i = 0; this.el = null; this.ring = null; }
  start(force = false) {
    if (!force && this.app.settings.tutorialDone) return false;
    this.i = 0; this.show(); return true;
  }
  close(done = true) {
    this.el?.remove(); this.ring?.remove(); this.el = this.ring = null;
    if (done) { this.app.settings.tutorialDone = true; saveSettings(this.app.settings); this.app.onTutorialDone?.(); }
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
    const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    if (target) {
      const r = target.getBoundingClientRect();
      this.ring = h('div', { class: 'tut-ring', style: { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' } });
      document.body.append(this.ring);
      let x = r.left / z, y = r.bottom / z + 14;
      if (y + 220 > innerHeight / z) y = r.top / z - 230;
      x = Math.max(12, Math.min(innerWidth / z - 360, x));
      Object.assign(this.el.style, { left: x + 'px', top: y + 'px' });
    } else Object.assign(this.el.style, { left: `calc(50% - 170px)`, top: '32%' });
  }
}
