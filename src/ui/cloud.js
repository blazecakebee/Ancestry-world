// Google sign-in + cloud saves. Saves live in the player's own Google Drive "app data" folder — a hidden, app-private area that
// only Ancestry World can read (scope drive.appdata). No server of ours is involved: the browser talks to Google directly.
// The OAuth client id below is public by design (it only identifies the app); it must have this site's origin listed as an
// "Authorised JavaScript origin" in Google Cloud Console, and the Google Drive API enabled.
export const GOOGLE_CLIENT_ID = '495350861856-po2fflgbanm08u81kpos6q7sl8bld6qf.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid profile email';
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const USER_KEY = 'aw-cloud-user';

let gsiPromise = null, client = null, token = null, expires = 0, waiting = null;
const listeners = new Set();
let user = null; try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { user = null; }
const emit = () => listeners.forEach((fn) => { try { fn(); } catch {} });

export const cloud = {
  /** Signed-in profile {name,email,picture} remembered between visits (the access token itself lasts ~1h and is kept in memory only). */
  get user() { return user; },
  get connected() { return !!token && Date.now() < expires; },
  get supported() { return typeof document !== 'undefined' && /^https?:$/.test(location.protocol); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

function loadGSI() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return (gsiPromise ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => { gsiPromise = null; rej(new Error('Could not reach Google (offline or blocked)')); };
    document.head.append(s);
  }));
}

/** Get a valid access token. interactive=true may open Google's sign-in/consent popup (needs a click); otherwise it only tries silently. */
export async function getToken(interactive = true) {
  if (token && Date.now() < expires - 30000) return token;
  await loadGSI();
  if (waiting) return waiting;
  return (waiting = new Promise((res, rej) => {
    const done = (fn, v) => { waiting = null; fn(v); };
    client ||= google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE,
      callback: (r) => { if (r.error) return client._rej(new Error(r.error_description || r.error)); token = r.access_token; expires = Date.now() + (+r.expires_in || 3600) * 1000; client._res(token); },
      error_callback: (e) => client._rej(new Error(e?.type === 'popup_closed' ? 'Sign-in window was closed' : e?.type === 'popup_failed_to_open' ? 'The sign-in popup was blocked' : e?.message || 'Sign-in failed')),
    });
    client._res = (v) => done(res, v); client._rej = (e) => done(rej, e);
    try { client.requestAccessToken({ prompt: interactive ? (user ? '' : 'select_account') : 'none', hint: user?.email }); } catch (e) { done(rej, e); }
  }));
}

async function gfetch(url, opts = {}, retry = true) {
  const t = await getToken(false).catch(() => getToken(true));
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  if (r.status === 401 && retry) { token = null; return gfetch(url, opts, false); }
  if (!r.ok) throw new Error(`Google Drive said ${r.status}`);
  return r;
}

export async function signIn() {
  await getToken(true);
  try {
    const p = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } })).json();
    user = { name: p.name || p.email || 'Google user', email: p.email || '', picture: p.picture || '' };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { user ||= { name: 'Google user', email: '', picture: '' }; }
  emit(); return user;
}
export function signOut() {
  try { if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token); } catch {}
  token = null; expires = 0; user = null; try { localStorage.removeItem(USER_KEY); } catch {}
  emit();
}

// ---- storage helpers ----
const gz = async (str) => (typeof CompressionStream === 'undefined' ? new Blob([str], { type: 'application/json' }) : new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).blob());
async function gunzip(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return new TextDecoder().decode(b);
}
const fileName = (key) => `aw-${String(key).replace(/[^\w.-]+/g, '_')}.json.gz`;
const small = (v) => String(v ?? '').slice(0, 60);

export async function listCloud() {
  const r = await gfetch(`${API}/files?spaces=appDataFolder&pageSize=100&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size,appProperties)`);
  return (await r.json()).files || [];
}
/** Create or overwrite the cloud copy of a save. key = a stable id (e.g. the local save id). meta = the save's list metadata. */
export async function pushSave(key, data, meta = {}) {
  const name = fileName(key);
  const existing = (await (await gfetch(`${API}/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${name}'`)}&fields=files(id)`)).json()).files?.[0];
  const props = { key: small(key), name: small(meta.name), nation: small(meta.nation), year: small(meta.year), era: small(meta.era), pop: small(meta.pop), auto: meta.auto ? '1' : '', savedAt: small(meta.savedAt || Date.now()) };
  const body = await gz(JSON.stringify(data));
  const bnd = 'aw' + Math.random().toString(36).slice(2);
  const metaPart = existing ? { appProperties: props } : { name, parents: ['appDataFolder'], appProperties: props };
  const form = new Blob([`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metaPart)}\r\n--${bnd}\r\nContent-Type: application/gzip\r\n\r\n`, body, `\r\n--${bnd}--`]);
  await gfetch(`${UPLOAD}/files${existing ? '/' + existing.id : ''}?uploadType=multipart`, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${bnd}` }, body: form });
}
export async function pullSave(fileId) {
  const r = await gfetch(`${API}/files/${fileId}?alt=media`);
  return JSON.parse(await gunzip(await r.arrayBuffer()));
}
export async function deleteCloud(fileId) { await gfetch(`${API}/files/${fileId}`, { method: 'DELETE' }); }

/** Fire-and-forget background sync used after local saves/autosaves. Never throws; stays quiet unless it has to ask for a reconnect. */
let warned = false;
export async function autoPush(key, data, meta, enabled) {
  if (!enabled || !user) return;
  try { await getToken(false); } catch { if (!warned) { warned = true; emit(); } return; }
  try { await pushSave(key, data, meta); warned = false; cloud.lastSync = Date.now(); emit(); } catch (e) { console.warn('cloud sync failed', e); }
}
export const needsReconnect = () => !!user && !cloud.connected;
