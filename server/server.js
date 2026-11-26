// Ancestry World — static file server + lightweight multiplayer relay.
//
// Model: the HOST's browser runs the authoritative simulation. This server only
// matches players into rooms by invite code and relays messages:
//   client -> host : commands (validated by host against nation permissions)
//   host -> client : snapshots / welcome packets
// Run:  npm install && npm start   (default port 8080, or PORT env / --port N)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const argPort = process.argv.indexOf('--port');
const PORT = Number(process.env.PORT || (argPort > -1 ? process.argv[argPort + 1] : 8080));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
};
const STATIC_DIRS = ['', 'src', 'styles', 'assets', 'docs', ...(process.env.AW_TEST ? ['tests'] : [])];

const server = http.createServer((req, res) => {
  try {
    let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/') url = '/index.html';
    if (url === '/health') { res.writeHead(200); return res.end('ok'); }
    const file = path.normalize(path.join(ROOT, url));
    const rel = path.relative(ROOT, file);
    const top = rel.split(path.sep)[0];
    if (rel.startsWith('..') || (!STATIC_DIRS.includes(top) && rel !== 'index.html')) {
      res.writeHead(404); return res.end('not found');
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  } catch { res.writeHead(400); res.end('bad request'); }
});

// ---------- Rooms ----------
const rooms = new Map(); // code -> { host, clients: Map<id, ws>, name, maxPlayers }
let nextId = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c;
  do { c = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 * 1024, perMessageDeflate: { threshold: 1024 } });

wss.on('connection', (ws) => {
  ws.id = 'p' + (nextId++);
  ws.room = null; ws.isHost = false;
  ws.msgBudget = 120; // simple rate limiting: refills each second
  const refill = setInterval(() => { ws.msgBudget = Math.min(240, ws.msgBudget + 120); }, 1000);
  send(ws, { t: 'hello', id: ws.id });

  ws.on('message', (raw) => {
    if (--ws.msgBudget < 0) return; // drop spam
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'host') {
      if (ws.room) return;
      const code = makeCode();
      rooms.set(code, { host: ws, clients: new Map(), name: String(m.name || 'World').slice(0, 40), maxPlayers: Math.min(8, Math.max(2, m.maxPlayers | 0 || 8)) });
      ws.room = code; ws.isHost = true;
      return send(ws, { t: 'hosted', code, id: ws.id });
    }
    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', msg: 'No world found with that invite code.' });
      if (room.clients.size + 1 >= room.maxPlayers) return send(ws, { t: 'error', msg: 'That world is full.' });
      ws.room = code; room.clients.set(ws.id, ws);
      send(ws, { t: 'joined', code, id: ws.id, worldName: room.name });
      return send(room.host, { t: 'peerJoin', from: ws.id, name: String(m.name || 'Friend').slice(0, 24) });
    }
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    if (ws.isHost) {
      // host -> one client or all clients
      const payload = JSON.stringify(m.payload ?? {});
      if (m.to === '*') for (const c of room.clients.values()) send(c, payload);
      else send(room.clients.get(m.to), payload);
    } else {
      // client -> host, stamped with sender id (host never trusts a client-supplied id)
      send(room.host, { t: 'peerMsg', from: ws.id, payload: m.payload });
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    if (ws.isHost) {
      for (const c of room.clients.values()) send(c, { t: 'hostLeft' });
      rooms.delete(ws.room);
    } else {
      room.clients.delete(ws.id);
      send(room.host, { t: 'peerLeave', from: ws.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n  ✦ Ancestry World running at http://localhost:${PORT}\n    Friends on your network can join via http://<your-ip>:${PORT}\n`);
});
export { server, wss, rooms };
