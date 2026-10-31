// Alertes avec le jeu fermé, en mode Chronique (GDD 7.7.2, 8.7 ; v1.1, D-166, D-168, D-169).
// Deux façons de les recevoir :
// - « push » : de vraies notifications du jeu (Web Push), envoyées à leur heure par notre petit service Cloudflare ;
// - « ntfy » : l'appli gratuite ntfy, abonnée à un sujet propre au joueur (solution de secours, sans notre service).
// À la fermeture, le jeu programme les faits de sa pré-simulation. Quand il n'a plus d'alerte à offrir (le nombre
// maximal est atteint, ou la pré-simulation s'arrête), la guilde se met en pause à ce moment-là, jusqu'au retour du
// joueur : rien d'important ne se passe sans qu'il ait été prévenu. Rouvert plus d'une minute, le jeu annule tout.
import pushConfig from '../push.json';
import type { ForecastItem } from '../worker/sim.worker';
import { getPrefs, NOTIF_LABELS, notifCategory, setPrefs, type NotifCat } from './prefs';

export type AlertMode = 'off' | 'push' | 'ntfy';

const NTFY = 'https://ntfy.sh';
const MIN_DELAY_MS = 15_000;      // ntfy refuse les délais de moins de 10 s
const CLEAR_AFTER_MS = 60_000;    // jeu rouvert plus d'une minute : on annule ce qui était programmé
/** Horizon de la pré-simulation et nombre d'alertes au plus, selon le moyen (ntfy garde 3 jours au plus). */
export const ALERT_LIMITS: Record<Exclude<AlertMode, 'off'>, { hours: number; max: number }> = { push: { hours: 168, max: 10 }, ntfy: { hours: 72, max: 6 } };
const TAGS: Record<NotifCat, string> = { mort: 'skull', faillite: 'moneybag', crise: 'crossed_swords', decision: 'scroll', depart: 'door', sceau: 'crown' };

interface Planned { cat: NotifCat | 'pause'; at: number; tick: number; title: string; body: string; urgent: boolean }
interface Sent { mode: AlertMode; hash: string; sids: { sid: string; at: number }[]; cleared: boolean }

let forecast: { base: number; baseAt: number; hours: number; items: ForecastItem[] } | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const plain = (t: string) => t.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1');
const gameUrl = () => location.origin + location.pathname;

export const pushReady = () => !!pushConfig.url && !!pushConfig.publicKey;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** Le moyen choisi, s'il est utilisable sur cet appareil. */
export function alertMode(): AlertMode {
  const p = getPrefs();
  if (p.alerts === 'push' && pushReady() && p.pushSub) return 'push';
  if (p.alerts === 'ntfy' && p.ntfyTopic) return 'ntfy';
  return 'off';
}
export const alertsActive = () => alertMode() !== 'off';

function readSent(): Sent {
  try { return JSON.parse(localStorage.getItem('alerts-sent') ?? '') as Sent; } catch { return { mode: 'off', hash: '', sids: [], cleared: true }; }
}
function writeSent(v: Sent): void {
  try { localStorage.setItem('alerts-sent', JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

/** Un identifiant au hasard, difficile à deviner (sujet ntfy, identifiant auprès de notre service). */
export function randomId(prefix: string): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

// ---------- Choix du moyen ----------

const b64uToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

/** Active les vraies notifications du jeu : permission, abonnement du navigateur, identifiant. Renvoie un message d'erreur, ou null. */
export async function enablePush(): Promise<string | null> {
  if (!pushReady()) return "Le service de notifications n'est pas encore en ligne.";
  if (!pushSupported()) return "Ce navigateur ne sait pas recevoir de notifications. Sur iPhone, ajoute d'abord le jeu à l'écran d'accueil (bouton Partager, « Sur l'écran d'accueil »), puis ouvre-le depuis là.";
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications refusées : autorise-les dans les réglages du navigateur pour ce site.';
  try {
    // Le service worker affiche les notifications ; il n'existe que dans la version en ligne du jeu.
    if (!(await navigator.serviceWorker.getRegistration())) return "Le jeu n'est pas installé dans ce navigateur (version de développement ?) : ouvre la version en ligne.";
    const reg = await navigator.serviceWorker.ready;   // l'abonnement demande un service worker actif
    const sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(pushConfig.publicKey) });
    const p = getPrefs();
    setPrefs({ alerts: 'push', pushSub: JSON.stringify(sub.toJSON()), pushId: p.pushId || randomId('p-') });
    return null;
  } catch (e) {
    return `L'abonnement a échoué : ${(e as Error).message}`;
  }
}

/**
 * Premier lancement (v1.1, D-171) : les notifications du jeu sont activées d'office. La demande d'autorisation
 * s'ouvre au premier bouton touché sur l'écran d'accueil (les navigateurs, Safari surtout, exigent un geste du
 * joueur), une seule fois. Si l'autorisation est déjà donnée, l'abonnement se fait sans rien demander.
 */
export function firstLaunchAlerts(onDone: () => void): void {
  let asked = false;
  try { asked = localStorage.getItem('alerts-asked') === '1'; localStorage.setItem('alerts-asked', '1'); } catch { /* stockage indisponible */ }
  if (asked || getPrefs().alerts !== 'off' || !pushReady() || !pushSupported() || Notification.permission === 'denied') return;
  // Appel direct, sans attente avant : la demande doit partir dans le geste du joueur.
  void enablePush().then((err) => { if (!err) onDone(); });
}

export function enableNtfy(): void {
  setPrefs({ alerts: 'ntfy', ntfyTopic: getPrefs().ntfyTopic || randomId('woh-') });
}

export function disableAlerts(): void {
  clearScheduled();
  setPrefs({ alerts: 'off' });
}

// ---------- Ce qui sera annoncé ----------

/**
 * Les alertes à programmer et le moment où la guilde se met en pause. Les faits des catégories choisies, dans l'ordre ;
 * au-delà du nombre maximal, la guilde s'arrête juste après la dernière alerte. Sinon, elle s'arrête au bout de
 * l'horizon de la pré-simulation, avec une dernière alerte pour le dire.
 */
export function plan(now = Date.now()): { alerts: Planned[]; pauseTick: number | null } {
  const mode = alertMode();
  if (mode === 'off' || !forecast) return { alerts: [], pauseTick: null };
  const lim = ALERT_LIMITS[mode];
  const prefs = getPrefs();
  const all: Planned[] = [];
  for (const e of forecast.items) {
    const cat = notifCategory(e.text, e.lvl);
    if (!cat || !prefs.notif[cat] || e.at < now + MIN_DELAY_MS) continue;
    all.push({ cat, at: e.at, tick: e.tick, title: NOTIF_LABELS[cat], body: plain(e.text), urgent: e.lvl === 'critique' });
  }
  if (all.length >= lim.max) {
    const alerts = all.slice(0, lim.max);
    const last = alerts[alerts.length - 1];
    last.body += ' La guilde se met en pause jusqu\'à ton retour.';
    return { alerts, pauseTick: last.tick };
  }
  const pauseTick = forecast.base + forecast.hours;
  const at = forecast.baseAt + forecast.hours * 3600_000;
  const days = Math.round(forecast.hours / 24);
  all.push({ cat: 'pause', at, tick: pauseTick, title: 'La guilde se met en pause', body: `${days} jours sans toi : la guilde s'arrête là et t'attend.`, urgent: false });
  return { alerts: all, pauseTick };
}

// ---------- Envoi ----------

function beacon(url: string, body: unknown): void {
  const data = JSON.stringify(body);
  // sendBeacon part même si la page se ferme ; sinon, une requête simple qui survit à la fermeture.
  if (!navigator.sendBeacon?.(url, new Blob([data], { type: 'text/plain' }))) {
    void fetch(url, { method: 'POST', body: data, keepalive: true }).catch(() => undefined);
  }
}

function sendPush(alerts: Planned[]): void {
  const p = getPrefs();
  beacon(`${pushConfig.url}/schedule`, {
    id: p.pushId, sub: JSON.parse(p.pushSub),
    alerts: alerts.map((a) => ({ at: a.at, title: a.title, body: a.body, tag: a.cat, urgent: a.urgent })),
  });
}

function sendNtfy(alerts: Planned[], prev: Sent): { sid: string; at: number }[] {
  const topic = getPrefs().ntfyTopic;
  const sids = alerts.map((a, i) => {
    const sid = `s${i}`;
    beacon(NTFY + '/', {
      topic, title: a.title, message: a.body, click: gameUrl(), tags: [a.cat === 'pause' ? 'zzz' : TAGS[a.cat]],
      priority: a.urgent ? 4 : 3, delay: String(Math.floor(a.at / 1000)), sequence_id: sid,
    });
    return { sid, at: a.at };
  });
  const now = Date.now();
  for (const old of prev.sids) if (prev.mode === 'ntfy' && !sids.some((x) => x.sid === old.sid) && old.at > now) cancelNtfy(old.sid);
  return sids;
}

function cancelNtfy(sid: string): void {
  void fetch(`${NTFY}/${getPrefs().ntfyTopic}/${sid}/delete`, { keepalive: true }).catch(() => undefined);
}

/**
 * À la fermeture (page en arrière-plan) : programme les alertes et renvoie l'heure de jeu où la guilde se mettra en
 * pause (null : pas d'alertes, la guilde vit jusqu'à 7 jours comme avant).
 */
export function away(): number | null {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  const mode = alertMode();
  if (mode === 'off') return null;
  const { alerts, pauseTick } = plan();
  const hash = JSON.stringify([mode, alerts.map((a) => [a.cat, a.at, a.body])]);
  const prev = readSent();
  if (prev.hash !== hash || prev.cleared) {
    const sids = mode === 'push' ? (sendPush(alerts), []) : sendNtfy(alerts, prev);
    writeSent({ mode, hash, sids, cleared: false });
  }
  return pauseTick;
}

/** Annule tout ce qui est programmé et encore à venir. */
function clearScheduled(): void {
  const sent = readSent();
  if (sent.cleared) return;
  const now = Date.now();
  if (sent.mode === 'ntfy') { for (const x of sent.sids) if (x.at > now) cancelNtfy(x.sid); }
  if (sent.mode === 'push' && pushReady()) beacon(`${pushConfig.url}/cancel`, { id: getPrefs().pushId });
  writeSent({ mode: 'off', hash: '', sids: [], cleared: true });
}

/** Au retour : si le jeu reste ouvert plus d'une minute, les alertes programmées sont annulées. */
export function back(): void {
  if (clearTimer) clearTimeout(clearTimer);
  if (readSent().cleared) return;
  clearTimer = setTimeout(() => { clearTimer = null; if (document.visibilityState === 'visible') clearScheduled(); }, CLEAR_AFTER_MS);
}

/** Message d'essai, envoyé tout de suite par le moyen choisi. */
export async function testAlert(): Promise<string> {
  const mode = alertMode();
  if (mode === 'ntfy') {
    beacon(NTFY + '/', { topic: getPrefs().ntfyTopic, title: 'Warden of Heroes', message: 'Les notifications de la guilde arrivent bien sur cet appareil.', tags: ['crossed_swords'] });
    return 'Essai envoyé : il doit arriver dans quelques secondes.';
  }
  if (mode === 'push') {
    try {
      const r = await fetch(`${pushConfig.url}/test`, { method: 'POST', body: JSON.stringify({ sub: JSON.parse(getPrefs().pushSub) }) });
      return r.ok ? 'Essai envoyé : la notification doit arriver dans quelques secondes.' : `Le service a répondu ${r.status}.`;
    } catch { return 'Le service de notifications ne répond pas.'; }
  }
  return 'Aucun moyen de notification choisi.';
}

/** Nouvelle pré-simulation reçue du worker. */
export function setForecast(base: number, baseAt: number, hours: number, items: ForecastItem[]): void {
  forecast = { base, baseAt, hours, items };
}

/** Horizon de pré-simulation demandé au worker (0 : pas de pré-simulation). */
export function forecastHours(): number {
  const m = alertMode();
  return m === 'off' ? 0 : ALERT_LIMITS[m].hours;
}

/** Lien du sujet ntfy (sur ordinateur, on peut s'y abonner dans le navigateur). */
export const ntfyUrl = () => `${NTFY}/${getPrefs().ntfyTopic}`;
