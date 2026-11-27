// Peer-to-peer co-op over WebRTC (PeerJS), so friends can play straight from GitHub Pages with no server.
// It mimics the small WebSocket surface the Session uses (readyState, send(string), onopen/onmessage/onerror/onclose)
// and speaks the same messages as server/server.js, so the rest of the netcode doesn't care which transport is used.
// ?peerhost=localhost&peerport=9000 points at your own PeerJS server (same convention as Fading Ink / Nectar's End).
const PREFIX = 'ancestry-world-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

let libPromise = null;
export function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  return libPromise ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href; s.onload = res; s.onerror = () => rej(new Error('Could not load PeerJS')); document.head.append(s); });
}
function peerOpts() {
  const q = new URLSearchParams(location.search); const o = { debug: 0 };
  if (q.get('peerhost')) Object.assign(o, { host: q.get('peerhost'), port: +q.get('peerport') || 9000, path: q.get('peerpath') || '/', secure: location.protocol === 'https:' });
  return o;
}

export class PeerSocket {
  constructor() { this.readyState = 0; this.conns = new Map(); this.seq = 1; setTimeout(async () => { try { await loadPeerLib(); this.readyState = 1; this.onopen?.(); } catch (e) { this.onerror?.(e); } }, 0); }
  emit(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  send(str) {
    const m = JSON.parse(str);
    if (m.t === 'host') return this.host(m);
    if (m.t === 'join') return this.join(m);
    if (m.t === 'relay') { // host -> one guest or everyone
      if (m.to === '*') { for (const c of this.conns.values()) if (c.open) c.send(m.payload); }
      else { const c = this.conns.get(m.to); if (c?.open) c.send(m.payload); }
      return;
    }
    if (m.t === 'msg' && this.conn?.open) this.conn.send(m.payload); // guest -> host
  }
  host({ maxPlayers = 8 }) {
    this.maxPlayers = maxPlayers;
    const tryOpen = (attempt = 0) => {
      const code = makeCode();
      const peer = new window.Peer(PREFIX + code, peerOpts()); this.peer = peer;
      peer.on('open', () => this.emit({ t: 'hosted', code, id: 'host' }));
      peer.on('error', (e) => { if (e.type === 'unavailable-id' && attempt < 5) { peer.destroy(); tryOpen(attempt + 1); } else if (e.type !== 'peer-unavailable') this.onerror?.(e); });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch {} }); // keep the room code alive if the broker hiccups
      peer.on('connection', (conn) => {
        const id = 'g' + this.seq++;
        conn.on('open', () => {
          if (this.conns.size + 1 >= this.maxPlayers) { conn.send({ t: 'error', msg: 'That world is full.' }); setTimeout(() => conn.close(), 300); return; }
          this.conns.set(id, conn);
          this.emit({ t: 'peerJoin', from: id, name: String(conn.metadata?.name || 'Friend').slice(0, 24) });
        });
        conn.on('data', (d) => this.emit({ t: 'peerMsg', from: id, payload: d }));
        const gone = () => { if (this.conns.delete(id)) this.emit({ t: 'peerLeave', from: id }); };
        conn.on('close', gone); conn.on('error', gone);
      });
    };
    tryOpen();
  }
  join({ code, name }) {
    code = String(code || '').toUpperCase().trim();
    const peer = new window.Peer(undefined, peerOpts()); this.peer = peer;
    let opened = false;
    const fail = (msg) => { if (!opened) this.emit({ t: 'error', msg }); };
    peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'No world found with that invite code (is the host still online?).' : 'Could not connect: ' + (e.message || e.type)));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, metadata: { name } }); this.conn = conn;
      const timer = setTimeout(() => fail('Could not reach that world. Check the code and that the host has it open.'), 15000);
      conn.on('open', () => { opened = true; clearTimeout(timer); this.emit({ t: 'joined', code, id: peer.id }); });
      conn.on('data', (d) => { if (d && typeof d === 'object') this.emit(d); });
      conn.on('close', () => { if (opened) this.emit({ t: 'hostLeft' }); });
    });
  }
  close() { this.readyState = 3; try { this.peer?.destroy(); } catch {} this.onclose?.(); }
}
