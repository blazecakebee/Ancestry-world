// A Session wraps one running world: singleplayer, co-op host, or co-op client.
// Host & singleplayer run the authoritative Game; clients mirror it from snapshots.
// The world clock (time, speed, pause) is the host's, so every player shares one timeline.
import { EventBus } from '../core/util.js';
import { Game } from '../sim/game.js';
import { generateWorld } from '../world/worldgen.js';
import { createAtmosphere } from '../world/atmosphere.js';
import { RNG } from '../core/rng.js';
import { pawnCard, pawnFast, pawnDetail, tileRecord, applyTileRecord, atmoPacket, applyAtmo, applyFast, mapStrip, strip } from './serialize.js';
import { computeFx } from '../sim/pawn.js';
import { PeerSocket } from './peersocket.js';

export function playerToken() {
  try { let t = localStorage.getItem('aw.token'); if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('aw.token', t); } return t; }
  catch { return Math.random().toString(36).slice(2); }
}
const wsURL = (url) => url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
// Peer-to-peer (PeerJS/WebRTC) by default — works from GitHub Pages. Pass a url, or open the game with ?relay, to use server/server.js instead.
const useRelay = (url) => !!url || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('relay'));
const openSocket = (url) => (useRelay(url) ? new WebSocket(wsURL(url)) : new PeerSocket());

export class Session extends EventBus {
  constructor(mode) { super(); this.mode = mode; this.pending = new Map(); this.cmdSeq = 1; this.snapTimer = 0; this.snapN = 0; this.peers = new Map(); this.modified = new Set(); this.pendingTiles = new Set(); }

  // ---------- factories ----------
  static single(world, name = 'You') {
    const s = new Session('single');
    s.pid = 'u_' + playerToken().slice(0, 10); s.attachWorld(world);
    world.hostId = s.pid; world.players[s.pid] = world.players[s.pid] || { id: s.pid, name, nationId: -1, online: true, color: '#ffd34d' };
    world.players[s.pid].name = name; world.players[s.pid].online = true;
    return s;
  }
  static host(world, name, { url, maxPlayers = 8 } = {}) {
    const s = Session.single(world, name); s.mode = 'host';
    return new Promise((resolve, reject) => {
      const ws = openSocket(url); s.ws = ws;
      ws.onerror = (e) => reject(new Error(useRelay(url) ? 'Could not reach the multiplayer server. Start it with "npm start".' : 'Could not open a co-op room: ' + (e?.message || e?.type || 'network error')));
      ws.onmessage = (ev) => { try { s.onHostMsg(JSON.parse(ev.data), resolve); } catch (e) { console.error('[host]', e); } };
      ws.onopen = () => ws.send(JSON.stringify({ t: 'host', name: world.name, maxPlayers }));
      ws.onclose = () => s.emit('disconnected', 'Lost connection to the multiplayer server.');
    });
  }
  static join(code, name, { url } = {}) {
    const s = new Session('client');
    return new Promise((resolve, reject) => {
      const ws = openSocket(url); s.ws = ws; s.name = name;
      ws.onerror = (e) => reject(new Error('Could not connect: ' + (e?.message || e?.type || 'network error')));
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', code, name }));
      ws.onmessage = (ev) => { try { s.onClientMsg(JSON.parse(ev.data), resolve, reject); } catch (e) { console.error('[client]', e); reject(e); } };
      ws.onclose = () => s.emit('disconnected', 'Disconnected from the host.');
    });
  }

  attachWorld(world) { this.world = world; if (this.mode !== 'client') this.game = new Game(world); }
  get me() { return this.world.players[this.pid]; }
  get myNation() { const p = this.me; return p ? this.world.nations[p.nationId] : null; }

  // ---------- commands ----------
  command(cmd) {
    if (this.mode !== 'client') { const r = this.game.command(this.pid, cmd); this.emit('cmd', { cmd, r }); return Promise.resolve(r); }
    const id = this.cmdSeq++;
    this.send({ t: 'cmd', id, cmd });
    return new Promise((res) => { this.pending.set(id, res); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); res({ ok: false, msg: 'The host did not respond.' }); } }, 8000); });
  }
  send(payload) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(this.mode === 'client' ? { t: 'msg', payload } : payload)); }
  watch(ids) { if (this.mode === 'client') this.send({ t: 'watch', ids }); }
  camera(x, y, zoom) {
    if (this.mode === 'client') { if ((this._camT = (this._camT || 0) + 1) % 30 === 0) this.send({ t: 'camera', x, y, zoom }); }
    else this.world.cameraHints[this.pid] = { x, y, zoom };
  }

  // ---------- per-frame ----------
  update(dt) {
    const w = this.world; if (!w) return;
    if (this.mode !== 'client') {
      this.game.update(dt, this.ticksBudget || 90);
      if (w.dirty.size) {
        const d = w.dirty; w.dirty = new Set();
        for (const i of d) { this.modified.add(i); this.pendingTiles.add(i); }
        this.emit('tiles', d);
      }
      if (this.mode === 'host' && this.peers.size) { this.snapTimer += dt; if (this.snapTimer >= 0.2) { this.snapTimer = 0; this.broadcast(); } }
    }
  }

  // ---------- host side ----------
  onHostMsg(m, resolveReady) {
    if (m.t === 'hosted') { this.code = m.code; resolveReady?.(this); this.emit('hosted', m.code); return; }
    if (m.t === 'peerJoin') { this.peers.set(m.from, { pid: null, name: m.name, seen: new Set(), watch: [], logId: 0, fxT: this.world.time }); return; }
    if (m.t === 'peerLeave') {
      const peer = this.peers.get(m.from); this.peers.delete(m.from);
      if (peer?.pid && this.world.players[peer.pid]) { this.world.players[peer.pid].online = false; this.game.command(peer.pid, { type: 'release' }); this.emit('players'); this.world.log.push({ id: this.world.nextId.event++, t: this.world.time, cat: 'system', text: `${peer.name} left the world.` }); }
      return;
    }
    if (m.t !== 'peerMsg') return;
    const peer = this.peers.get(m.from); if (!peer) return;
    const p = m.payload || {};
    if (p.t === 'auth') {
      const pid = 'u_' + String(p.token || m.from).slice(0, 10);
      if (pid === this.pid) peer.pid = pid + '_2'; else peer.pid = pid;
      const w = this.world;
      w.players[peer.pid] = w.players[peer.pid] || { id: peer.pid, name: String(p.name || peer.name).slice(0, 24), nationId: -1, color: '#4fb0ff' };
      w.players[peer.pid].online = true; w.players[peer.pid].name = String(p.name || peer.name).slice(0, 24);
      w.log.push({ id: w.nextId.event++, t: w.time, cat: 'system', text: `${w.players[peer.pid].name} joined the world.` });
      this.sendTo(m.from, this.welcome(peer));
      this.emit('players');
      return;
    }
    if (!peer.pid) return;
    if (p.t === 'cmd') { const r = this.game.command(peer.pid, p.cmd || {}); this.sendTo(m.from, { t: 'cmdResult', id: p.id, r }); if (p.cmd?.type === 'claim') this.emit('players'); return; }
    if (p.t === 'watch') { peer.watch = (p.ids || []).slice(0, 8).map(Number); return; }
    if (p.t === 'camera') { this.world.cameraHints[peer.pid] = { x: +p.x, y: +p.y, zoom: +p.zoom }; return; }
  }
  sendTo(to, payload) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'relay', to, payload })); }
  welcome(peer) {
    const w = this.world;
    const pawns = {}; for (const p of Object.values(w.pawns)) { pawns[p.id] = pawnDetail(p); peer.seen.add(p.id); }
    peer.logId = w.nextId.event; peer.fxT = w.time;
    return {
      t: 'welcome', pid: peer.pid, seed: w.seed, W: w.W, H: w.H, name: w.name,
      tiles: [...this.modified].map((i) => tileRecord(w.tiles, i)),
      state: this.slowState(), pawns, animals: mapStrip(w.animals), atmo: atmoPacket(w.atmo), log: w.log.slice(-60),
      time: w.time, speed: w.speed, paused: w.paused, age: w.age, settings: w.settings || {}, hostId: this.pid,
    };
  }
  slowState() {
    const w = this.world;
    return { nations: mapStrip(w.nations), settlements: mapStrip(w.settlements), buildings: mapStrip(w.buildings), players: w.players, space: w.space, squads: mapStrip(w.squads || {}) };
  }
  /** Animals a player can plausibly see (their camera plus a margin); wildlife is plentiful, so never ship the whole planet. */
  animalsFor(pid) {
    const w = this.world, h = w.cameraHints?.[pid], out = [];
    if (!h || h.zoom < 1.6) return out;                     // globe / far map view: no individual animals are drawn
    const R = Math.min(120, 40 + 2400 / Math.max(6, h.zoom));
    for (const a of Object.values(w.animals)) {
      if (Math.abs(a.y - h.y) > R) continue; let d = Math.abs(a.x - h.x); if (d > w.W / 2) d = w.W - d; if (d > R) continue;
      out.push([a.id, a.kind, Math.round(a.x * 100), Math.round(a.y * 100), a.facing, a.dead ? 1 : 0, a.moving ? 1 : 0, a.baby ? 1 : 0]);
    }
    return out;
  }
  broadcast() {
    const w = this.world; this.snapN++;
    const ids = new Set(Object.keys(w.pawns).map(Number));
    const gone = this.prevIds ? [...this.prevIds].filter((id) => !ids.has(id)) : [];
    this.prevIds = ids;
    const tiles = [...this.pendingTiles].map((i) => tileRecord(w.tiles, i)); this.pendingTiles.clear();
    const water = this.snapN % 5 === 0 ? [...w.waterActive].slice(0, 4000).map((i) => [i, Math.round(w.tiles.water[i] * 100)]) : null;
    const fire = [...w.fireActive].slice(0, 3000).map((i) => [i, w.tiles.fire[i]]);
    const common = { t: 'snap', time: w.time, speed: w.speed, paused: w.paused, age: w.age, fast: Object.values(w.pawns).map(pawnFast), gone, tiles, water, fire,
      animals: null };
    if (this.snapN % 5 === 0) Object.assign(common, this.slowState());
    if (this.snapN % 10 === 0) common.atmo = atmoPacket(w.atmo);
    const all = Object.values(w.pawns);
    for (const [wsId, peer] of this.peers) {
      if (!peer.pid) continue;
      const cards = [];
      for (const p of all) if (!peer.seen.has(p.id)) { cards.push(pawnCard(p)); peer.seen.add(p.id); }
      const rot = all.filter((p, i) => i % 10 === this.snapN % 10).map(pawnCard);
      const details = peer.watch.map((id) => w.pawns[id]).filter(Boolean).map(pawnDetail);
      const log = w.log.filter((e) => e.id >= peer.logId); if (log.length) peer.logId = log[log.length - 1].id + 1;
      const fx = w.fx.filter((e) => e.t > peer.fxT); if (fx.length) peer.fxT = fx[fx.length - 1].t;
      this.sendTo(wsId, { ...common, animals: this.animalsFor(peer.pid), cards: cards.concat(rot), details, log, fx });
    }
  }

  // ---------- client side ----------
  onClientMsg(m, resolve, reject) {
    if (m.t === 'hello') return;
    if (m.t === 'error') { reject?.(new Error(m.msg)); return; }
    if (m.t === 'joined') { this.code = m.code; this.send({ t: 'auth', token: playerToken(), name: this.name }); return; }
    if (m.t === 'hostLeft') { this.emit('disconnected', 'The host closed the world.'); return; }
    if (m.t === 'welcome') { this.buildMirror(m); resolve?.(this); return; }
    if (m.t === 'cmdResult') { const r = this.pending.get(m.id); if (r) { this.pending.delete(m.id); r(m.r); this.emit('cmd', { r: m.r }); } return; }
    if (m.t === 'snap') this.applySnap(m);
  }
  buildMirror(m) {
    const tiles = generateWorld(m.seed, m.W, m.H);
    for (const r of m.tiles) applyTileRecord(tiles, r);
    const atmo = createAtmosphere(tiles); applyAtmo(atmo, m.atmo);
    const w = { version: 1, name: m.name, seed: m.seed, W: m.W, H: m.H, time: m.time, yearLen: 12, tick: 0, speed: m.speed, paused: m.paused, tiles, atmo,
      nations: {}, settlements: {}, buildings: {}, pawns: m.pawns, animals: m.animals || {}, squads: {}, players: {}, space: [], log: m.log || [], fx: [], age: m.age,
      nextId: {}, rng: new RNG(1), waterActive: new Set(), fireActive: new Set(), dirty: new Set(), hot: new Set(), cameraHints: {}, settings: m.settings, hostId: m.hostId };
    Object.assign(w, m.state);
    for (const p of Object.values(w.pawns)) if (!p.fx) computeFx(p);
    this.pid = m.pid; this.world = w;
  }
  applySnap(m) {
    const w = this.world;
    w.time = m.time; w.speed = m.speed; w.paused = m.paused; w.age = m.age;
    for (const c of m.cards || []) { const p = w.pawns[c.id]; if (p) Object.assign(p, c); else w.pawns[c.id] = { ...c, needs: {}, thoughts: [], injuries: [], diseases: [], skills: {}, rel: {}, buff: {}, x: 0, y: 0, hp: 100, blood: 1, pain: 0 }; }
    for (const d of m.details || []) w.pawns[d.id] = Object.assign(w.pawns[d.id] || {}, d);
    applyFast(w, m.fast || []);
    for (const id of m.gone || []) delete w.pawns[id];
    const changed = new Set();
    for (const r of m.tiles || []) changed.add(applyTileRecord(w.tiles, r));
    if (m.water) { for (const i of w.waterActive) w.tiles.water[i] = 0; w.waterActive = new Set(); for (const [i, v] of m.water) { w.tiles.water[i] = v / 100; w.waterActive.add(i); } }
    if (m.fire) { for (const i of w.fireActive) w.tiles.fire[i] = 0; w.fireActive = new Set(); for (const [i, v] of m.fire) { w.tiles.fire[i] = v; w.fireActive.add(i); } }
    if (m.animals) { const next = {}; for (const r of m.animals) { const a = w.animals[r[0]] || { id: r[0] }; a.kind = r[1]; a.x = r[2] / 100; a.y = r[3] / 100; a.facing = r[4]; a.dead = !!r[5]; a.moving = !!r[6]; a.baby = r[7] || 0; next[r[0]] = a; } w.animals = next; }
    for (const k of ['nations', 'settlements', 'buildings', 'players', 'space', 'squads']) if (m[k]) w[k] = m[k];
    if (m.atmo) applyAtmo(w.atmo, m.atmo);
    if (m.log?.length) { w.log.push(...m.log); if (w.log.length > 300) w.log.splice(0, w.log.length - 300); }
    if (m.fx?.length) w.fx.push(...m.fx); if (w.fx.length > 400) w.fx.splice(0, w.fx.length - 400);
    if (changed.size) this.emit('tiles', changed);
    this.emit('snap');
  }
  close() { try { this.ws?.close(); } catch {} }
}
