// Compte joueur et sauvegardes en ligne (v1.1, D-173) : une partie commencée sur le téléphone se retrouve sur le PC.
// Le compte est facultatif. Connecté, chaque sauvegarde locale part en ligne peu après ; à l'ouverture, l'appareil
// reprend la version la plus récente de chaque emplacement. Si une partie a avancé des deux côtés depuis la dernière
// synchronisation, le joueur choisit laquelle garder.
import serviceConfig from '../push.json';
import type { GameState } from '../sim/types';
import { compatible, getSlot, listSaves, markSynced, onSaved, saveSlot, SLOTS, slotLabel, type SaveEntry, type Slot } from './saves';

export interface Session { email: string; token: string }
export interface CloudMeta { slot: Slot; savedAt: number; day: number; mode: string; label: string; size: number }
export interface Conflict { slot: Slot; local: SaveEntry; cloud: CloudMeta }

const URL_ = serviceConfig.url;
const ITERATIONS = 310_000;
const listeners = new Set<() => void>();
let conflicts: Conflict[] = [];
let status: { text: string; error?: boolean } = { text: '' };
const timers = new Map<Slot, ReturnType<typeof setTimeout>>();

export const cloudReady = () => !!URL_;
export const onCloudChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((l) => l());
export const getConflicts = () => conflicts;
export const syncStatus = () => status;
const setStatus = (text: string, error = false) => { status = { text, error }; emit(); };

export function session(): Session | null {
  try { return JSON.parse(localStorage.getItem('account') ?? 'null') as Session | null; } catch { return null; }
}
function setSession(s: Session | null): void {
  try { if (s) localStorage.setItem('account', JSON.stringify(s)); else localStorage.removeItem('account'); } catch { /* stockage indisponible */ }
  emit();
}

// ---------- Appels au service ----------

async function api<T>(path: string, body: Record<string, unknown>, keepalive = false): Promise<T> {
  let r: Response;
  try {
    r = await fetch(URL_ + path, { method: 'POST', body: JSON.stringify(body), keepalive });
  } catch {
    throw new Error('Pas de connexion au service : vérifie ta connexion internet.');
  }
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* réponse vide */ }
  if (r.status === 401 && path.startsWith('/saves/')) setSession(null);
  if (r.status === 409 && data.conflict) return data as T;
  if (!r.ok) throw new Error(String(data.error ?? `Le service a répondu ${r.status}.`));
  return data as T;
}

// ---------- Mot de passe : jamais envoyé, seulement une clé qui en dérive ----------

const b64u = (b: ArrayBuffer | Uint8Array) => {
  const bytes = new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b));
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64u(salt), iterations: ITERATIONS }, base, 256);
  return b64u(bits);
}
const newSalt = () => b64u(crypto.getRandomValues(new Uint8Array(16)));

export const passwordProblem = (pw: string) => (pw.length < 8 ? 'Le mot de passe doit faire au moins 8 caractères.' : null);

export async function register(email: string, password: string): Promise<void> {
  const salt = newSalt();
  const r = await api<{ token: string; email: string }>('/account/register', { email, salt, authKey: await deriveKey(password, salt) });
  setSession({ email: r.email, token: r.token });
  await reconcile();
}

export async function login(email: string, password: string): Promise<void> {
  const { salt } = await api<{ salt: string }>('/account/salt', { email });
  const r = await api<{ token: string; email: string }>('/account/login', { email, authKey: await deriveKey(password, salt) });
  setSession({ email: r.email, token: r.token });
  await reconcile();
}

export const requestReset = (email: string) => api('/account/reset/request', { email });

export async function confirmReset(email: string, code: string, password: string): Promise<void> {
  const salt = newSalt();
  const r = await api<{ token: string; email: string }>('/account/reset/confirm', { email, code, salt, authKey: await deriveKey(password, salt) });
  setSession({ email: r.email, token: r.token });
  await reconcile();
}

export function logout(): void {
  setSession(null);
  conflicts = [];
  setStatus('');
}

// ---------- Sauvegardes compressées ----------

async function pack(state: GameState): Promise<string> {
  const stream = new Blob([JSON.stringify(state)]).stream().pipeThrough(new CompressionStream('gzip'));
  return b64u(await new Response(stream).arrayBuffer());
}
async function unpack(data: string): Promise<GameState> {
  const stream = new Blob([fromB64u(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as GameState;
}

function labelOf(e: SaveEntry): string {
  const s = e.state;
  return `${slotLabel(e)} · graine ${s.seed}${s.scenario && s.scenario !== 'standard' ? ` · ${s.scenario}` : ''}`;
}

/** Envoie un emplacement en ligne. force : écrase la version en ligne même si elle a changé ailleurs. */
async function upload(e: SaveEntry, force = false): Promise<void> {
  const s = session();
  if (!s) return;
  const data = await pack(e.state);
  // Page qui se ferme : une requête « keepalive » survit à la fermeture, si elle reste sous 64 Ko.
  const keepalive = document.visibilityState === 'hidden' && data.length < 60_000;
  const r = await api<{ ok?: boolean; conflict?: CloudMeta }>('/saves/put', {
    token: s.token, slot: e.slot, savedAt: e.savedAt, base: e.syncedAt ?? null, force,
    day: e.day, mode: e.state.mode, label: labelOf(e), data,
  }, keepalive);
  if (r.conflict) {
    conflicts = [...conflicts.filter((c) => c.slot !== e.slot), { slot: e.slot, local: e, cloud: { ...r.conflict, slot: e.slot } }];
    setStatus('Une partie a avancé sur un autre appareil : choisis laquelle garder.', true);
    return;
  }
  await markSynced(e.slot, e.savedAt);
}

async function download(meta: CloudMeta): Promise<void> {
  const s = session();
  if (!s) return;
  const r = await api<{ meta: CloudMeta; data: string }>('/saves/get', { token: s.token, slot: meta.slot });
  const state = await unpack(r.data);
  if (!compatible(state)) return;
  await saveSlot(meta.slot, state, { savedAt: r.meta.savedAt, syncedAt: r.meta.savedAt });
}

/**
 * Remet d'accord cet appareil et le compte, emplacement par emplacement : la version la plus récente gagne ; si les
 * deux ont changé depuis la dernière synchronisation, c'est un conflit que le joueur tranche.
 */
export async function reconcile(): Promise<void> {
  const s = session();
  if (!s || !cloudReady()) return;
  setStatus('Synchronisation…');
  try {
    const { saves } = await api<{ saves: CloudMeta[] }>('/saves/list', { token: s.token });
    const local = await listSaves();
    const found: Conflict[] = [];
    let moved = 0;
    for (const slot of SLOTS) {
      const L = local.find((e) => e.slot === slot);
      const C = saves.find((m) => m.slot === slot);
      if (!L && !C) continue;
      if (L && !compatible(L.state)) continue;
      if (!C) { await upload(L!); moved++; continue; }
      if (!L) { await download(C); moved++; continue; }
      if (C.savedAt === L.savedAt) { if (L.syncedAt !== C.savedAt) await markSynced(slot, L.savedAt); continue; }
      const cloudChanged = C.savedAt !== L.syncedAt;
      const localChanged = L.savedAt !== L.syncedAt;
      if (cloudChanged && localChanged) found.push({ slot, local: L, cloud: C });
      else if (cloudChanged) { await download(C); moved++; }
      else { await upload(L); moved++; }
    }
    conflicts = found;
    setStatus(found.length ? 'Une partie a avancé sur deux appareils : choisis laquelle garder.' : moved ? 'Parties synchronisées.' : 'Parties à jour.', found.length > 0);
  } catch (e) {
    setStatus((e as Error).message, true);
  }
}

/** Le joueur tranche un conflit. */
export async function resolveConflict(slot: Slot, keep: 'local' | 'cloud'): Promise<void> {
  const c = conflicts.find((x) => x.slot === slot);
  if (!c) return;
  try {
    if (keep === 'local') {
      const e = await getSlot(slot);
      if (e) await upload(e, true);
    } else {
      await download(c.cloud);
    }
    conflicts = conflicts.filter((x) => x.slot !== slot);
    setStatus(conflicts.length ? status.text : 'Parties à jour.');
  } catch (e) {
    setStatus((e as Error).message, true);
  }
}

// Chaque sauvegarde locale part en ligne quelques secondes plus tard (les sauvegardes rapprochées n'en font qu'une).
onSaved((e) => {
  if (!session() || !cloudReady() || !compatible(e.state)) return;
  const t = timers.get(e.slot);
  if (t) clearTimeout(t);
  timers.set(e.slot, setTimeout(async () => {
    timers.delete(e.slot);
    try {
      const cur = await getSlot(e.slot);
      if (cur) { await upload(cur); if (!conflicts.length) setStatus(`Partie envoyée en ligne à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`); }
    } catch (err) { setStatus((err as Error).message, true); }
  }, document.visibilityState === 'hidden' ? 0 : 5000));
});
