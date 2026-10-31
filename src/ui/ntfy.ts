// Notifications avec le jeu fermé, en mode Chronique (GDD 7.7.2, 8.7 ; v1.1, D-166).
// Pas de serveur à nous : le service gratuit ntfy.sh garde des messages programmés (3 jours au plus) et les envoie
// à l'appli ntfy du téléphone, abonnée à un sujet propre à ce joueur. À la fermeture, le jeu programme les faits de la
// pré-simulation des 48 h ; s'il reste ouvert plus d'une minute, il les annule (le joueur voit tout lui-même).
import type { ForecastItem } from '../worker/sim.worker';
import { getPrefs, NOTIF_LABELS, notifCategory, setPrefs, type NotifCat } from './prefs';

const SERVER = 'https://ntfy.sh';
const MAX_SCHEDULED = 6;          // messages programmés au plus à chaque fermeture (limites du service gratuit)
const MIN_DELAY_MS = 15_000;      // ntfy refuse les délais de moins de 10 s
const CLEAR_AFTER_MS = 60_000;    // jeu rouvert plus d'une minute : on annule ce qui était programmé
const TAGS: Record<NotifCat, string> = { mort: 'skull', faillite: 'moneybag', crise: 'crossed_swords', decision: 'scroll', depart: 'door', sceau: 'crown' };

interface Sent { hash: string; sids: { sid: string; at: number }[]; cleared: boolean }

let forecast: ForecastItem[] = [];
let chronique = false;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const plain = (t: string) => t.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1');
const gameUrl = () => location.origin + location.pathname;

function readSent(): Sent {
  try { return JSON.parse(localStorage.getItem('ntfy-sent') ?? '') as Sent; } catch { return { hash: '', sids: [], cleared: true }; }
}
function writeSent(v: Sent): void {
  try { localStorage.setItem('ntfy-sent', JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

/** Un sujet au hasard, difficile à deviner : il sert de mot de passe (ntfy.sh est public). */
export function newTopic(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return 'woh-' + Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

export const ntfyActive = () => { const p = getPrefs(); return p.ntfy && !!p.ntfyTopic; };

/** Active les notifications avec le jeu fermé : crée le sujet au besoin. */
export function enableNtfy(on: boolean): void {
  const p = getPrefs();
  setPrefs({ ntfy: on, ntfyTopic: p.ntfyTopic || newTopic() });
  if (!on) clearScheduled();
}

/** Les faits à venir à notifier, dans l'ordre, filtrés par les catégories choisies. */
function upcoming(now: number): { cat: NotifCat; at: number; text: string; lvl: string }[] {
  const prefs = getPrefs();
  const out: { cat: NotifCat; at: number; text: string; lvl: string }[] = [];
  for (const e of forecast) {
    const cat = notifCategory(e.text, e.lvl);
    if (!cat || !prefs.notif[cat] || e.at < now + MIN_DELAY_MS) continue;
    out.push({ cat, at: e.at, text: plain(e.text), lvl: e.lvl });
  }
  return out.slice(0, MAX_SCHEDULED);
}

function publish(body: Record<string, unknown>): void {
  const data = JSON.stringify({ topic: getPrefs().ntfyTopic, title: 'Warden of Heroes', click: gameUrl(), ...body });
  // sendBeacon part même si la page se ferme ; sinon, une requête simple qui survit à la fermeture.
  if (!navigator.sendBeacon?.(SERVER + '/', new Blob([data], { type: 'text/plain' }))) {
    void fetch(SERVER + '/', { method: 'POST', body: data, keepalive: true }).catch(() => undefined);
  }
}

function cancel(sid: string): void {
  void fetch(`${SERVER}/${getPrefs().ntfyTopic}/${sid}/delete`, { keepalive: true }).catch(() => undefined);
}

/** À la fermeture (page en arrière-plan) : programme les notifications des 48 h à venir. */
function onHidden(): void {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  if (!chronique || !ntfyActive()) return;
  const now = Date.now();
  const items = upcoming(now);
  const hash = JSON.stringify(items.map((i) => [i.cat, i.at, i.text]));
  const sent = readSent();
  if (sent.hash === hash && !sent.cleared) return;      // déjà programmé tel quel
  const sids = items.map((it, i) => {
    const sid = `s${i}`;
    publish({
      message: it.text, title: NOTIF_LABELS[it.cat], tags: [TAGS[it.cat]], priority: it.lvl === 'critique' ? 4 : 3,
      delay: String(Math.floor(it.at / 1000)), sequence_id: sid,
    });
    return { sid, at: it.at };
  });
  // Les emplacements de la fois précédente qui ne servent plus sont annulés.
  for (const old of sent.sids) if (!sids.some((x) => x.sid === old.sid) && old.at > now) cancel(old.sid);
  writeSent({ hash, sids, cleared: false });
}

/** Annule tout ce qui est programmé et encore à venir. */
function clearScheduled(): void {
  const sent = readSent();
  const now = Date.now();
  for (const x of sent.sids) if (x.at > now) cancel(x.sid);
  writeSent({ hash: '', sids: [], cleared: true });
}

function onVisible(): void {
  if (clearTimer) clearTimeout(clearTimer);
  if (readSent().cleared) return;
  clearTimer = setTimeout(() => { clearTimer = null; if (document.visibilityState === 'visible') clearScheduled(); }, CLEAR_AFTER_MS);
}

/** Message d'essai, envoyé tout de suite. */
export function testNtfy(): void {
  publish({ message: 'Les notifications de la guilde arrivent bien sur cet appareil.', tags: ['crossed_swords'] });
}

/** Nouvelle pré-simulation reçue du worker. */
export function setForecast(items: ForecastItem[], isChronique: boolean): void {
  forecast = items;
  chronique = isChronique;
}

/** Lien d'abonnement : ouvre le sujet dans l'appli ntfy (ou sur le site). */
export const subscribeUrl = () => `${SERVER}/${getPrefs().ntfyTopic}`;

document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? onHidden() : onVisible()));
window.addEventListener('pagehide', onHidden);
