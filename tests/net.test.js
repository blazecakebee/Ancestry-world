// Co-op integration test: real relay server + host session + client session (Node 22 has a global WebSocket).
import { spawn } from 'node:child_process';
import { createWorld } from '../src/sim/world.js';
import { Session } from '../src/net/session.js';

const PORT = 8123, url = `ws://localhost:${PORT}/ws`;
const srv = spawn(process.execPath, ['server/server.js', '--port', String(PORT)], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); srv.kill(); process.exit(1); } console.log('ok -', m); };

try {
  await sleep(1200); console.log("server up");
  const world = createWorld({ seed: 99, aiNations: 4, W: 384, H: 192 }); console.log('world ready');
  const host = await Session.host(world, 'Hosty', { url });
  assert(host.code && host.code.length === 6, `host got invite code ${host.code}`);
  const r1 = await host.command({ type: 'claim', race: 'orc' });
  assert(r1.ok, 'host claimed a tribe');
  // pump the host simulation in the background like a game loop
  let running = true;
  (async () => { while (running) { host.update(0.05); await sleep(16); } })();

  const client = await Session.join(host.code, 'Friendo', { url, token: 'friendtoken01' });
  assert(client.world && client.world.W === 384, 'client built mirror world from seed');
  const tileMatch = [...host.modified].slice(0, 200).every((i) => client.world.tiles.owner[i] === world.tiles.owner[i]);
  assert(tileMatch, 'client tiles match host (owner diffs applied)');
  const r2 = await client.command({ type: 'claim', race: 'elf' });
  assert(r2.ok, 'client claimed their own tribe via the host');
  await sleep(1200);
  assert(Math.abs(client.world.time - world.time) < 0.05, `shared clock: host ${world.time.toFixed(3)} vs client ${client.world.time.toFixed(3)}`);
  const hostNation = host.myNation;
  const hostSettlement = Object.values(world.settlements).find((s) => s.nationId === hostNation.id);
  const clientNation = world.nations[world.players[client.pid].nationId];
  clientNation.glitter = 999; clientNation.devotion = 9999;
  const denied = await client.command({ type: 'power', power: 'omen', sid: hostSettlement.id });
  assert(!denied.ok, `client blocked from miracles on host's nation ("${denied.msg}")`);
  const deniedPossess = await client.command({ type: 'possess', pid: Object.values(world.pawns).find((p) => p.nationId === hostNation.id).id });
  assert(!deniedPossess.ok, 'client blocked from possessing host citizens');
  await host.command({ type: 'perm', player: client.pid, key: 'miracles', value: true });
  const allowed = await client.command({ type: 'power', power: 'omen', sid: hostSettlement.id });
  assert(allowed.ok, 'after the host grants permission, the miracle works');
  const sp = await client.command({ type: 'speed', speed: 3 });
  assert(sp.ok && world.speed === 3, 'client changed the shared world speed');
  await sleep(800);
  assert(client.world.speed === 3, 'speed change reached the client');
  const pc = Object.keys(client.world.pawns).length, ph = Object.keys(world.pawns).length;
  assert(Math.abs(pc - ph) <= 3, `pawns mirrored (${pc} client / ${ph} host)`);
  await client.command({ type: 'chat', text: 'hello from the client' });
  await sleep(1200); console.log("server up");
  assert(world.log.some((e) => e.cat === 'chat' && e.text.includes('hello')) && client.world.log.some((e) => e.text.includes('hello')), 'chat relayed to everyone');
  // ---- rejoining keeps everything: same browser token, or (new browser) the same name ----
  const myNationId = world.players[client.pid].nationId;
  await client.command({ type: 'flag', flag: { pattern: 'solid', c1: '#ff0000', c2: '#00ff00', c3: '#0000ff', emblem: 'star', ec: '#ffffff', ep: 'c' }, name: 'Friendlanders' });
  client.close(); await sleep(1500);
  assert(world.players[client.pid].online === false, 'host marked the friend offline');
  const again = await Session.join(host.code, 'Friendo', { url, token: 'friendtoken01' });
  await sleep(400);
  assert(again.pid === client.pid && again.myNation?.id === myNationId && again.myNation?.flagSet, 'rejoining (same browser) gives back the same people, flag and all');
  again.close(); await sleep(1500);
  const fresh = await Session.join(host.code, 'Friendo', { url, token: 'otherbrowser9' });
  await sleep(400);
  assert(fresh.myNation?.id === myNationId && fresh.myNation?.name === 'Friendlanders', 'rejoining from a new browser under the same name finds the old seat');
  fresh.close();
  running = false; host.close();
  console.log('\nAll co-op checks passed.');
} finally { srv.kill(); }
process.exit(0);
