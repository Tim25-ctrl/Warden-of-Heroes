// Préférences de l'interface, propres à cet appareil (GDD 7.5.11) : taille du texte, notifications, consultation.
export type NotifCat = 'mort' | 'faillite' | 'crise' | 'decision' | 'depart' | 'sceau';
export const NOTIF_LABELS: Record<NotifCat, string> = {
  mort: "Mort d'un aventurier", faillite: 'Faillite imminente', crise: 'Assaut ou crise', decision: 'Décision en attente',
  depart: 'Aventurier sur le départ', sceau: 'Nouveau sceau',
};

export interface Prefs { textSize: number; notif: Record<NotifCat, boolean>; consultation: boolean }

const DEFAULTS: Prefs = {
  textSize: 100,
  notif: { mort: true, faillite: true, crise: true, decision: true, depart: true, sceau: true },
  consultation: false,
};

let prefs: Prefs = load();

function load(): Prefs {
  try {
    const raw = localStorage.getItem('prefs');
    if (raw) { const p = JSON.parse(raw) as Partial<Prefs>; return { ...DEFAULTS, ...p, notif: { ...DEFAULTS.notif, ...(p.notif ?? {}) } }; }
  } catch { /* stockage indisponible */ }
  return { ...DEFAULTS, notif: { ...DEFAULTS.notif } };
}

export const getPrefs = () => prefs;

export function setPrefs(p: Partial<Prefs>): void {
  prefs = { ...prefs, ...p, notif: { ...prefs.notif, ...(p.notif ?? {}) } };
  try { localStorage.setItem('prefs', JSON.stringify(prefs)); } catch { /* stockage indisponible */ }
  applyTextSize();
}

/** Taille du texte réglable (7.10). */
export function applyTextSize(): void {
  document.documentElement.style.fontSize = `${prefs.textSize}%`;
}

// ---------- Notifications locales (7.7.2, 8.7) ----------

/** Range un fait du journal dans une catégorie de notification, ou null. */
export function notifCategory(text: string, lvl: string): NotifCat | null {
  if (/est mort/.test(text)) return 'mort';
  if (/endettée|saisit le siège|Saisie dans/.test(text)) return 'faillite';
  if (/héraut royal appose/.test(text)) return 'sceau';
  if (/Décision attendue/.test(text)) return 'decision';
  if (/annonce son départ|envisage de partir|quitte la guilde/.test(text)) return 'depart';
  if (lvl === 'critique' && /Assaut|Vague|Épidémie|dragon|guerre|Guerre|Émeute/.test(text)) return 'crise';
  return null;
}

export async function askNotificationPermission(): Promise<NotificationPermission | 'indisponible'> {
  if (!('Notification' in window)) return 'indisponible';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/** Envoie une notification système si le joueur l'a permise et que le jeu n'est pas au premier plan. */
export async function notify(cat: NotifCat, text: string): Promise<void> {
  if (!prefs.notif[cat] || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;      // au premier plan, les messages éphémères suffisent
  const body = text.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1');
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification('Siège de Guilde', { body, icon: 'icons/icon-192.png', tag: cat });
    else new Notification('Siège de Guilde', { body, icon: 'icons/icon-192.png', tag: cat });
  } catch { /* notification refusée par le navigateur */ }
}
