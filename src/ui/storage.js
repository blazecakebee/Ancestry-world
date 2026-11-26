// World saves in IndexedDB (large worlds don't fit in localStorage), with rolling autosave slots.
const DB = 'ancestry-world', STORE = 'saves';
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const st = t.objectStore(STORE); const out = fn(st); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); }

export async function saveWorld(id, data, meta) { return tx('readwrite', (st) => st.put({ id, data, meta: { ...meta, savedAt: Date.now() } })); }
export async function loadSave(id) { const r = await tx('readonly', (st) => st.get(id)); return r; }
export async function deleteSave(id) { return tx('readwrite', (st) => st.delete(id)); }
export async function listSaves() {
  const db = await open();
  return new Promise((res, rej) => { const out = []; const t = db.transaction(STORE, 'readonly'); const c = t.objectStore(STORE).openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ id: cur.value.id, meta: cur.value.meta }); cur.continue(); } else res(out.sort((a, b) => b.meta.savedAt - a.meta.savedAt)); }; c.onerror = () => rej(c.error); });
}
/** Rolling autosave: autosave-<world>-<n>, keeps `slots` newest. */
export async function autosave(worldKey, data, meta, slots) {
  const all = (await listSaves()).filter((s) => s.id.startsWith(`auto:${worldKey}:`));
  const n = (all.length ? Math.max(...all.map((s) => +s.id.split(':')[2])) : 0) + 1;
  await saveWorld(`auto:${worldKey}:${n}`, data, { ...meta, auto: true });
  const sorted = all.concat([{ id: `auto:${worldKey}:${n}` }]).sort((a, b) => +b.id.split(':')[2] - +a.id.split(':')[2]);
  for (const s of sorted.slice(slots)) await deleteSave(s.id);
}
