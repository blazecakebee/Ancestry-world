// Procedural audio: every sound is synthesized with WebAudio (no files needed).
// Channels: master, music (era music), ambient (weather/space), ui, miracles, world (citizens, combat, building).
export const CHANNELS = ['master', 'music', 'ambient', 'ui', 'miracles', 'world'];

class AudioEngine {
  constructor() { this.ctx = null; this.bus = {}; this.vol = { master: 0.8, music: 0.45, ambient: 0.45, ui: 0.6, miracles: 0.6, world: 0.55 }; this.last = {}; this.musicOn = false; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    const master = this.ctx.createGain(); master.connect(this.ctx.destination); this.bus.master = master;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.connect(master);
    for (const c of CHANNELS.slice(1)) { const g = this.ctx.createGain(); g.connect(comp); this.bus[c] = g; }
    // shared reverb for a cozy space
    this.verb = this.ctx.createConvolver(); this.verb.buffer = this.impulse(1.6); const vg = this.ctx.createGain(); vg.gain.value = 0.25; this.verb.connect(vg); vg.connect(comp);
    this.noise = this.noiseBuffer();
    this.applyVolumes();
    this.startAmbient();
  }
  setVolume(ch, v) { this.vol[ch] = v; this.applyVolumes(); }
  applyVolumes() { if (!this.ctx) return; for (const c of CHANNELS) if (this.bus[c]) this.bus[c].gain.value = c === 'master' ? this.vol.master : this.vol[c]; }
  impulse(sec) { const n = this.ctx.sampleRate * sec, b = this.ctx.createBuffer(2, n, this.ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5); } return b; }
  noiseBuffer() { const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }

  // ---- primitives ----
  tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.3, ch = 'ui', attack = 0.005, delay = 0, verb = 0, pan = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); let node = g; if (p) { p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.bus[ch]); if (verb) { const vs = c.createGain(); vs.gain.value = verb; node.connect(vs); vs.connect(this.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  burst({ dur = 0.2, vol = 0.3, ch = 'world', filter = 'bandpass', f = 1200, f2 = null, q = 1, delay = 0, verb = 0, pan = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter(); fl.type = filter; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g);
    let node = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.bus[ch]); if (verb) { const vs = c.createGain(); vs.gain.value = verb; node.connect(vs); vs.connect(this.verb); }
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  throttle(key, ms) { const now = performance.now(); if (this.last[key] && now - this.last[key] < ms) return false; this.last[key] = now; return true; }

  /** Play a named effect. opts: { vol (0..1 distance attenuation), pan (-1..1) }. */
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const v = opts.vol ?? 1, pan = opts.pan ?? 0;
    if (v < 0.02) return;
    const T = (o) => this.tone({ ...o, vol: (o.vol ?? 0.3) * v, pan }), N = (o) => this.burst({ ...o, vol: (o.vol ?? 0.3) * v, pan });
    switch (name) {
      // ---- UI ----
      case 'hover': if (this.throttle('hover', 40)) T({ f: 1800, f2: 2200, type: 'triangle', dur: 0.04, vol: 0.05 }); break;
      case 'click': T({ f: 660, f2: 990, type: 'triangle', dur: 0.07, vol: 0.18 }); T({ f: 1320, type: 'sine', dur: 0.05, vol: 0.06, delay: 0.02 }); break;
      case 'toggle': T({ f: 520, f2: 780, type: 'square', dur: 0.06, vol: 0.07 }); break;
      case 'open': T({ f: 420, f2: 840, type: 'triangle', dur: 0.14, vol: 0.14 }); T({ f: 1260, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.05 }); break;
      case 'close': T({ f: 760, f2: 380, type: 'triangle', dur: 0.12, vol: 0.12 }); break;
      case 'error': T({ f: 220, f2: 160, type: 'square', dur: 0.18, vol: 0.12 }); T({ f: 200, f2: 140, type: 'square', dur: 0.18, vol: 0.1, delay: 0.1 }); break;
      case 'confirm': [523, 659, 784].forEach((f, i) => T({ f, type: 'triangle', dur: 0.18, vol: 0.14, delay: i * 0.06 })); break;
      case 'notify': T({ f: 880, type: 'sine', dur: 0.2, vol: 0.12, verb: 0.3 }); T({ f: 1175, type: 'sine', dur: 0.25, vol: 0.1, delay: 0.09, verb: 0.3 }); break;
      case 'alert': [740, 554, 740].forEach((f, i) => T({ f, type: 'square', dur: 0.12, vol: 0.09, delay: i * 0.13 })); break;
      case 'chat': T({ f: 1046, type: 'sine', dur: 0.08, vol: 0.1 }); T({ f: 1568, type: 'sine', dur: 0.1, vol: 0.08, delay: 0.06 }); break;
      case 'glitter': for (let i = 0; i < 5; i++) T({ f: 1800 + Math.random() * 1600, type: 'sine', dur: 0.12, vol: 0.05, delay: i * 0.035, ch: 'miracles', verb: 0.5 }); break;
      // ---- miracles ----
      case 'power': {
        const p = opts.power;
        [392, 523, 659, 784, 1046].forEach((f, i) => T({ f, type: 'sine', dur: 0.6, vol: 0.1, delay: i * 0.05, ch: 'miracles', verb: 0.7 }));
        if (p === 'rain' || p === 'breeze') N({ dur: 1.4, vol: 0.07, ch: 'miracles', filter: 'lowpass', f: 500, f2: 1500, verb: 0.3 });
        if (p === 'tectonic') { N({ dur: 1.6, vol: 0.5, ch: 'miracles', filter: 'lowpass', f: 120, f2: 60, q: 0.7 }); T({ f: 55, f2: 30, type: 'sawtooth', dur: 1.4, vol: 0.25, ch: 'miracles' }); }
        if (p === 'heal' || p === 'cure' || p === 'calm') [1046, 1318, 1568].forEach((f, i) => T({ f, type: 'triangle', dur: 0.8, vol: 0.07, delay: 0.2 + i * 0.1, ch: 'miracles', verb: 0.8 }));
        if (p === 'avatar' || p === 'prophecy' || p === 'orbshield') [261, 329, 392, 523].forEach((f) => T({ f, type: 'sawtooth', dur: 1.6, vol: 0.05, attack: 0.3, ch: 'miracles', verb: 0.9 }));
        break;
      }
      // ---- world ----
      case 'chop': if (this.throttle('chop', 70)) { N({ dur: 0.08, vol: 0.22, f: 900, q: 3 }); T({ f: 180, f2: 120, type: 'triangle', dur: 0.08, vol: 0.12, ch: 'world' }); } break;
      case 'mine': if (this.throttle('mine', 70)) { T({ f: 2400, f2: 1800, type: 'square', dur: 0.05, vol: 0.06, ch: 'world' }); N({ dur: 0.06, vol: 0.12, f: 3000, q: 4 }); } break;
      case 'hammer': if (this.throttle('hammer', 90)) { T({ f: 320, f2: 220, type: 'square', dur: 0.06, vol: 0.08, ch: 'world' }); N({ dur: 0.05, vol: 0.12, f: 1500, q: 2 }); } break;
      case 'hit': if (this.throttle('hit', 50)) { N({ dur: 0.1, vol: 0.28, f: 700, f2: 300, q: 1.5 }); T({ f: 140, f2: 70, type: 'sine', dur: 0.12, vol: 0.2, ch: 'world' }); } break;
      case 'clang': if (this.throttle('clang', 60)) { T({ f: 1900 + Math.random() * 300, type: 'square', dur: 0.12, vol: 0.06, ch: 'world', verb: 0.3 }); T({ f: 2650, type: 'sine', dur: 0.25, vol: 0.05, ch: 'world', verb: 0.3 }); } break;
      case 'shot': if (this.throttle('shot', 60)) { N({ dur: 0.22, vol: 0.4, filter: 'lowpass', f: 2500, f2: 300 }); T({ f: 90, f2: 40, type: 'sine', dur: 0.15, vol: 0.3, ch: 'world' }); } break;
      case 'laser': if (this.throttle('shot', 60)) T({ f: 1800, f2: 200, type: 'sawtooth', dur: 0.18, vol: 0.08, ch: 'world' }); break;
      case 'arrow': if (this.throttle('arrow', 60)) N({ dur: 0.18, vol: 0.12, f: 2200, f2: 800, q: 6 }); break;
      case 'death': T({ f: 330, f2: 110, type: 'triangle', dur: 0.4, vol: 0.12, ch: 'world', verb: 0.3 }); N({ dur: 0.15, vol: 0.15, filter: 'lowpass', f: 400, delay: 0.25 }); break;
      case 'thud': if (this.throttle('thud', 80)) { T({ f: 110, f2: 50, type: 'sine', dur: 0.18, vol: 0.25, ch: 'world' }); N({ dur: 0.1, vol: 0.12, filter: 'lowpass', f: 500 }); } break;
      case 'birth': [784, 988, 1175, 1568].forEach((f, i) => T({ f, type: 'sine', dur: 0.35, vol: 0.07, delay: i * 0.09, ch: 'world', verb: 0.6 })); break;
      case 'built': [392, 494, 587].forEach((f, i) => T({ f, type: 'triangle', dur: 0.2, vol: 0.1, delay: i * 0.07, ch: 'world' })); N({ dur: 0.25, vol: 0.12, f: 900 }); break;
      case 'era': [262, 330, 392, 523, 659, 784, 1046].forEach((f, i) => T({ f, type: i % 2 ? 'triangle' : 'sawtooth', dur: 0.9, vol: 0.06, delay: i * 0.11, ch: 'miracles', verb: 0.8 })); break;
      case 'horn': T({ f: 147, type: 'sawtooth', dur: 1.2, vol: 0.12, attack: 0.15, ch: 'world', verb: 0.6 }); T({ f: 220, type: 'sawtooth', dur: 1.0, vol: 0.08, attack: 0.15, delay: 0.3, ch: 'world', verb: 0.6 }); break;
      case 'thunder': if (!this.throttle('thunder', 3500)) break; N({ dur: 2.6, vol: 0.2, ch: 'ambient', filter: 'lowpass', f: 220, f2: 50, q: 0.5, verb: 0.5 }); break;
      case 'boom': N({ dur: 1.6, vol: 0.7, ch: 'world', filter: 'lowpass', f: 400, f2: 40, q: 0.4, verb: 0.5 }); T({ f: 60, f2: 25, type: 'sine', dur: 1.2, vol: 0.5, ch: 'world' }); break;
      case 'quake': N({ dur: 2.5, vol: 0.5, ch: 'world', filter: 'lowpass', f: 90, f2: 40, q: 0.4 }); break;
      case 'fire': if (this.throttle('fire', 300)) for (let i = 0; i < 4; i++) N({ dur: 0.05, vol: 0.02, f: 2000 + Math.random() * 1200, q: 4, delay: Math.random() * 0.3, ch: 'ambient' }); break;
      case 'splash': if (!this.throttle('splash', 250)) break; N({ dur: 0.3, vol: 0.05, f: 900, f2: 350, q: 0.7, filter: 'lowpass' }); break;
      case 'launch': N({ dur: 4, vol: 0.5, ch: 'world', filter: 'lowpass', f: 200, f2: 900, q: 0.6, verb: 0.4 }); break;
      case 'step': if (this.throttle('step', 140)) N({ dur: 0.04, vol: 0.05, filter: 'lowpass', f: 700 }); break;
    }
  }

  // ---- ambience (wind, rain, ocean, space hum): continuous loops whose gains follow the scene ----
  startAmbient() {
    const c = this.ctx;
    const loop = (filterType, f, q) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.bus.ambient); s.start(); return { g, fl }; };
    this.amb = { wind: loop('bandpass', 500, 0.6), rain: loop('bandpass', 1900, 0.35), ocean: loop('lowpass', 400, 0.5), crowd: loop('bandpass', 900, 2), space: null };
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = 55; og.gain.value = 0; o.connect(og); og.connect(this.bus.ambient); o.start(); this.amb.space = { g: og, o };
  }
  setAmbient({ wind = 0, rain = 0, ocean = 0, crowd = 0, space = 0 }) {
    if (!this.amb) return;
    const t = this.ctx.currentTime, set = (k, v) => this.amb[k].g.gain.setTargetAtTime(v, t, 0.6);
    set('wind', Math.min(0.07, wind * 0.2)); set('rain', Math.min(0.045, rain * 0.16)); set('ocean', Math.min(0.04, ocean * 0.2)); set('crowd', Math.min(0.02, crowd * 0.3)); set('space', Math.min(0.025, space * 0.4));
    this.amb.wind.fl.frequency.setTargetAtTime(300 + wind * 1400, t, 1);
  }

  // ---- generative era music ----
  startMusic(getEra) {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true; this.getEra = getEra;
    const SCALES = { drums: [0, 3, 5, 7, 10], lyre: [0, 2, 4, 7, 9], lute: [0, 2, 3, 5, 7, 8, 10], piano: [0, 2, 4, 5, 7, 9, 11], synth: [0, 3, 5, 7, 10, 12], cosmic: [0, 2, 4, 6, 7, 9, 11] };
    const STYLE = ['drums', 'drums', 'lyre', 'lyre', 'lute', 'lute', 'piano', 'synth', 'synth', 'cosmic'];
    let step = 0;
    const tick = () => {
      if (!this.musicOn) return;
      const era = Math.max(0, Math.min(9, this.getEra?.() ?? 0)), style = STYLE[era], sc = SCALES[style];
      const root = [110, 110, 130.8, 130.8, 146.8, 146.8, 130.8, 110, 98, 87.3][era];
      const beat = style === 'synth' ? 0.32 : style === 'cosmic' ? 0.6 : 0.42;
      const wave = { drums: 'triangle', lyre: 'triangle', lute: 'triangle', piano: 'sine', synth: 'square', cosmic: 'sine' }[style];
      if (step % 8 === 0) this.tone({ f: root, type: 'sine', dur: beat * 7, vol: 0.06, attack: 0.4, ch: 'music', verb: 0.5 });
      if (step % 16 === 8) this.tone({ f: root * 1.5, type: 'sine', dur: beat * 7, vol: 0.04, attack: 0.4, ch: 'music', verb: 0.5 });
      if (Math.random() < (style === 'cosmic' ? 0.35 : 0.55)) {
        const deg = sc[Math.floor(Math.random() * sc.length)], oct = Math.random() < 0.3 ? 4 : 2;
        this.tone({ f: root * oct * Math.pow(2, deg / 12), type: wave, dur: beat * (Math.random() < 0.3 ? 2.5 : 1.2), vol: style === 'synth' ? 0.025 : 0.05, ch: 'music', verb: 0.6, attack: style === 'cosmic' ? 0.2 : 0.01 });
      }
      if (style === 'drums' && step % 2 === 0) this.burst({ dur: 0.12, vol: step % 8 === 0 ? 0.16 : 0.07, ch: 'music', filter: 'lowpass', f: 180 });
      if (style === 'synth' && step % 4 === 2) this.burst({ dur: 0.05, vol: 0.04, ch: 'music', filter: 'highpass', f: 6000 });
      step++;
      this.musicTimer = setTimeout(tick, beat * 1000);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }
}

// ---- soundtrack playlist (assets/music, by Lofi Elephant — attribution in Codex credits & README) ----
AudioEngine.prototype.startPlaylist = async function (onTrack) {
  if (!this.ctx || this.playlistOn) return;
  this.playlistOn = true; this.onTrack = onTrack;
  if (!this.playlist) {
    try { const base = new URL('../../assets/music/', import.meta.url).href; const pl = await (await fetch(base + 'playlist.json')).json(); this.playlist = pl.tracks.map((t) => ({ ...t, url: base + t.file })); }
    catch { this.playlistOn = false; return this.startMusic(this.getEra || (() => 0)); }
  }
  if (!this.musicEl) {
    this.musicEl = new Audio(); this.musicEl.crossOrigin = 'anonymous'; this.musicEl.preload = 'auto';
    const src = this.ctx.createMediaElementSource(this.musicEl); this.musicGain = this.ctx.createGain(); src.connect(this.musicGain); this.musicGain.connect(this.bus.music);
    this.musicEl.addEventListener('ended', () => this.nextTrack());
  }
  this.order = this.order || this.playlist.map((_, i) => i).sort(() => Math.random() - 0.5);
  this.trackI = this.trackI ?? -1;
  this.nextTrack();
};
AudioEngine.prototype.nextTrack = function () {
  if (!this.playlistOn || !this.playlist?.length) return;
  this.trackI = (this.trackI + 1) % this.order.length;
  const t = this.playlist[this.order[this.trackI]];
  this.musicEl.src = t.url;
  this.musicGain.gain.setValueAtTime(0, this.ctx.currentTime); this.musicGain.gain.linearRampToValueAtTime(0.9, this.ctx.currentTime + 3);
  this.musicEl.play().catch(() => {});
  this.onTrack?.(t);
};
AudioEngine.prototype.stopPlaylist = function () { this.playlistOn = false; try { this.musicEl?.pause(); } catch {} };
AudioEngine.prototype.setMusicSource = function (src, getEra, onTrack) {
  this.getEra = getEra || this.getEra;
  if (src === 'off') { this.stopPlaylist(); this.stopMusic(); return; }
  if (src === 'generative') { this.stopPlaylist(); this.startMusic(this.getEra); }
  else { this.stopMusic(); this.startPlaylist(onTrack); }
};

export const audio = new AudioEngine();
