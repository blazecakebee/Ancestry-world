// Settings: defaults, persistence, application, and the keybind matrix with conflict detection.
import { audio } from '../audio/audio.js';

export const THEMES = [
  { id: 'celestial', name: 'Celestial Glitter', desc: 'Gold & midnight' },
  { id: 'astral', name: 'Astral Void', desc: 'Deep violet space' },
  { id: 'parchment', name: 'Chronicle Parchment', desc: 'Warm paper & ink' },
  { id: 'canopy', name: 'Bio-Canopy Emerald', desc: 'Lush greens' },
  { id: 'cyber', name: 'Cyber-Orbital Cyan', desc: 'Neon teal' },
  { id: 'slate', name: 'High-Contrast Slate', desc: 'Maximum legibility' },
];

export const ACTIONS = {
  pause: { label: 'Pause / resume', group: 'Time' },
  speed1: { label: 'Speed 0.5x', group: 'Time' }, speed2: { label: 'Speed 1x', group: 'Time' }, speed3: { label: 'Speed 2x', group: 'Time' }, speed4: { label: 'Speed 3x', group: 'Time' }, speed5: { label: 'Speed 5x', group: 'Time' },
  panUp: { label: 'Pan up', group: 'Camera' }, panDown: { label: 'Pan down', group: 'Camera' }, panLeft: { label: 'Pan left', group: 'Camera' }, panRight: { label: 'Pan right', group: 'Camera' },
  zoomIn: { label: 'Zoom in', group: 'Camera' }, zoomOut: { label: 'Zoom out', group: 'Camera' }, home: { label: 'Jump to capital', group: 'Camera' },
  ovBorders: { label: 'Overlay: borders', group: 'Overlays' }, ovIdeology: { label: 'Overlay: ideology', group: 'Overlays' }, ovGlitter: { label: 'Overlay: Glitter devotion', group: 'Overlays' },
  ovTrade: { label: 'Overlay: trade routes', group: 'Overlays' }, ovWeather: { label: 'Overlay: weather', group: 'Overlays' }, ovWind: { label: 'Overlay: wind', group: 'Overlays' },
  ovTemp: { label: 'Overlay: temperature', group: 'Overlays' }, ovPressure: { label: 'Overlay: pressure', group: 'Overlays' }, ovHumidity: { label: 'Overlay: humidity', group: 'Overlays' }, ovRace: { label: 'Overlay: races', group: 'Overlays' },
  toolInspect: { label: 'Tool: inspect', group: 'Tools' }, toolPowers: { label: 'Open powers', group: 'Tools' }, toolBuild: { label: 'Tool: plan building', group: 'Tools' },
  nation: { label: 'Nation window', group: 'Windows' }, codex: { label: 'Codex', group: 'Windows' }, chat: { label: 'Chat', group: 'Windows' }, settings: { label: 'Settings', group: 'Windows' },
  release: { label: 'Release possessed citizen', group: 'Possession' }, possessAttack: { label: 'Possessed: act / attack', group: 'Possession' },
  pinSelected: { label: 'Pin / unpin selected citizen', group: 'Tools' }, cancel: { label: 'Cancel / close', group: 'Tools' },
};
export const DEFAULT_KEYS = {
  pause: 'Space', speed1: 'Digit1', speed2: 'Digit2', speed3: 'Digit3', speed4: 'Digit4', speed5: 'Digit5',
  panUp: 'KeyW', panDown: 'KeyS', panLeft: 'KeyA', panRight: 'KeyD', zoomIn: 'Equal', zoomOut: 'Minus', home: 'KeyH',
  ovBorders: 'F1', ovIdeology: 'F2', ovGlitter: 'F3', ovTrade: 'F4', ovWeather: 'F5', ovWind: 'F6', ovTemp: 'F7', ovPressure: 'F8', ovHumidity: 'F9', ovRace: 'F10',
  toolInspect: 'KeyQ', toolPowers: 'KeyG', toolBuild: 'KeyB', nation: 'KeyN', codex: 'KeyC', chat: 'Enter', settings: 'KeyO',
  release: 'KeyR', possessAttack: 'KeyF', pinSelected: 'KeyP', cancel: 'Escape',
};

export const DEFAULTS = {
  theme: 'celestial',
  uiScale: 100, textScale: 100, edgePad: 0,
  autoPause: { war: true, era: true, disaster: false, favoriteDeath: true },
  speeds: [0.5, 1, 2, 3, 5],
  autosaveMin: 5, autosaveSlots: 3,
  edgeScroll: false, panSens: 100, zoomSens: 100, zoomToCursor: true,
  feedFilters: { birth: true, death: true, social: true, war: true, peace: true, nation: true, era: true, disaster: true, weather: true, miracle: true, good: true, bad: true, break: false, faith: true, space: true, age: true, system: true, chat: true },
  tooltipDelay: 250, colorblind: 'none', shake: 100, flash: 100, particles: 100, bgFps: 15, pixelSnap: true,
  volume: { master: 80, music: 45, ambient: 60, ui: 70, miracles: 80, world: 70 },
  keys: { ...DEFAULT_KEYS }, streamerMode: false,
  characterStyle: 'lpc', musicSource: 'playlist', lastSeenVersion: '', cursorTrail: true, tutorialDone: false, playerName: '',
};

const KEY = 'aw.settings.v1';
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const merged = structuredClone(DEFAULTS);
  for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof merged[k] === 'object') Object.assign(merged[k], v);
    else merged[k] = v;
  }
  return merged;
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

export function applySettings(s) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.style.setProperty('--ui-scale', s.uiScale / 100);
  root.style.setProperty('--text-scale', s.textScale / 100);
  root.style.setProperty('--edge-pad', `${s.edgePad}px`);
  root.classList.toggle('streamer', !!s.streamerMode);
  root.classList.toggle('cb', s.colorblind !== 'none');
  for (const [ch, v] of Object.entries(s.volume)) audio.setVolume(ch, v / 100);
}

export function keyLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Equal', '=').replace('Minus', '-').replace('Escape', 'Esc').replace('Space', 'Space').replace('Arrow', '↑'.slice(0, 0));
}
/** Returns {action: [conflictingActions]} */
export function keyConflicts(keys) {
  const by = {}; for (const [a, k] of Object.entries(keys)) if (k) (by[k] ||= []).push(a);
  const out = {}; for (const list of Object.values(by)) if (list.length > 1) for (const a of list) out[a] = list.filter((x) => x !== a);
  return out;
}
