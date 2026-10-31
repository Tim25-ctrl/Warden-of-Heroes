// Sauvegardes dans le navigateur (IndexedDB) et export / import de fichier (GDD 8.5).
import { MIN_SAVE_VERSION, SAVE_VERSION } from '../sim/engine';
import type { GameState } from '../sim/types';
import { emptyMeta, PANTHEON_MAX, type Meta } from './progress';
export { PANTHEON_MAX, type Meta, type PantheonEntry } from './progress';

/** Une sauvegarde d'une version précédente du jeu ne peut pas être reprise. */
export const compatible = (state: GameState | undefined) => !!state && state.version >= MIN_SAVE_VERSION && state.version <= SAVE_VERSION;
export const INCOMPATIBLE = "Sauvegarde d'une version précédente du jeu : elle ne peut plus être chargée.";

export type Slot = 'auto' | 'auto-chronique' | '1' | '2' | '3';

/** Les deux modes ont des sauvegardes automatiques séparées (0.5). */
export const autoSlot = (state: GameState): Slot => (state.mode === 'chronique' ? 'auto-chronique' : 'auto');
export const slotLabel = (e: SaveEntry) => (e.slot === 'auto' ? 'Sauvegarde automatique' : e.slot === 'auto-chronique' ? 'Partie Chronique (en direct)' : `Emplacement ${e.slot}`)
  + (e.slot.startsWith('auto') || !e.state?.mode ? '' : e.state.mode === 'chronique' ? ' · Chronique' : '');
export interface SaveEntry {
  slot: Slot; savedAt: number; day: number; state: GameState;
  syncedAt?: number;   // compte (D-173) : date de la version en ligne dont celle-ci descend
}
export const SLOTS: Slot[] = ['auto', 'auto-chronique', '1', '2', '3'];

/** Prévenu après chaque sauvegarde locale (la synchronisation en ligne s'y abonne). */
let saveListener: ((e: SaveEntry) => void) | null = null;
export function onSaved(fn: (e: SaveEntry) => void): void { saveListener = fn; }

const DB = 'siege-de-guilde';
const STORE = 'saves';
const META = 'meta';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSlot(slot: Slot, state: GameState, from?: { savedAt: number; syncedAt: number }): Promise<void> {
  try {
    const db = await open();
    // La date de synchronisation suit la sauvegarde locale tant qu'une version en ligne ne la remplace pas.
    const prev = from ? undefined : await getSlot(slot);
    const entry: SaveEntry = {
      slot, savedAt: from?.savedAt ?? Date.now(), day: Math.floor(state.tick / 24) + 1, state,
      syncedAt: from?.syncedAt ?? prev?.syncedAt,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (!from) saveListener?.(entry);
  } catch (err) {
    console.warn('Sauvegarde impossible', err);
  }
}

export async function getSlot(slot: Slot): Promise<SaveEntry | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(slot);
      req.onsuccess = () => resolve(req.result as SaveEntry | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch { return undefined; }
}

/** Note que la sauvegarde locale de cet emplacement est identique à la version en ligne. */
export async function markSynced(slot: Slot, savedAt: number): Promise<void> {
  const e = await getSlot(slot);
  if (!e || e.savedAt !== savedAt) return;
  e.syncedAt = savedAt;
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(e);
  } catch { /* stockage indisponible */ }
}

export async function listSaves(): Promise<SaveEntry[]> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as SaveEntry[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export function exportFile(state: GameState): void {
  const blob = new Blob([JSON.stringify({ format: 'siege-de-guilde', version: state.version, state })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guilde-jour-${Math.floor(state.tick / 24) + 1}.guilde`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importFile(file: File): Promise<GameState> {
  const data = JSON.parse(await file.text());
  if (data?.format !== 'siege-de-guilde' || !data.state?.adventurers) throw new Error('Fichier de sauvegarde invalide');
  if (!compatible(data.state)) throw new Error(INCOMPATIBLE);
  return data.state as GameState;
}

// ---------- Méta-progression : hauts faits et Panthéon, conservés d'une partie à l'autre (6.3, 6.7) ----------

/** Prévenus quand la méta change ; fromCloud : version venue du compte (D-174). */
const metaListeners = new Set<(m: Meta, fromCloud: boolean) => void>();
export function onMetaSaved(fn: (m: Meta, fromCloud: boolean) => void): () => void { metaListeners.add(fn); return () => { metaListeners.delete(fn); }; }

export async function loadMeta(): Promise<Meta> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(META, 'readonly').objectStore(META).get('meta');
      req.onsuccess = () => resolve((req.result as Meta) ?? emptyMeta());
      req.onerror = () => resolve(emptyMeta());
    });
  } catch {
    return emptyMeta();
  }
}

export async function saveMeta(meta: Meta, fromCloud = false): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META, 'readwrite');
      tx.objectStore(META).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Méta-progression impossible à enregistrer', err);
    return;
  }
  metaListeners.forEach((l) => l(meta, fromCloud));
}

/** Reporte dans la méta les hauts faits et les héros gagnés dans la partie en cours. */
export async function syncMeta(state: GameState): Promise<Meta> {
  const meta = await loadMeta();
  const game = `Graine ${state.seed}`;
  const gone = new Set(meta.removed ?? []);
  let changed = false;
  for (const id of Object.keys(state.legend?.achievements ?? {})) {
    if (!meta.achievements[id]) { meta.achievements[id] = { date: Date.now(), game }; changed = true; }
  }
  for (const l of state.legend?.legends ?? []) {
    const key = `${state.seed}:${l.id}`;
    if (gone.has(key)) continue;                             // retiré par le joueur, peut-être sur un autre appareil
    const existing = meta.pantheon.find((e) => e.key === key);
    if (existing) {
      if (existing.level !== l.level || existing.reason !== l.reason) { existing.level = l.level; existing.reason = l.reason; changed = true; }
      continue;
    }
    if (meta.pantheon.length >= PANTHEON_MAX) continue;      // plein : le joueur choisit qui retirer (écran Charte)
    meta.pantheon.push({ key, name: l.name, classe: l.classe, level: l.level, reason: l.reason, guild: game, date: Date.now(), chosen: l.chosen });
    changed = true;
  }
  if (changed) await saveMeta(meta);
  return meta;
}

export async function removeFromPantheon(key: string): Promise<Meta> {
  const meta = await loadMeta();
  meta.pantheon = meta.pantheon.filter((e) => e.key !== key);
  meta.removed = [...new Set([...(meta.removed ?? []), key])];
  await saveMeta(meta);
  return meta;
}
