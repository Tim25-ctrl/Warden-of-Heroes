// Service en ligne de Warden of Heroes : notifications (GDD 7.7.2, 8.7 ; v1.1, D-168) et comptes joueurs avec
// sauvegardes en ligne (D-173, voir accounts.ts).
// Le jeu, en mode Chronique, envoie à la fermeture la liste des alertes des jours à venir ; ce petit serveur les garde
// et envoie chacune à son heure, en vraie notification du jeu (Web Push), puis les oublie. Il ne connaît ni la partie,
// ni le joueur : seulement un identifiant tiré au hasard, l'abonnement aux notifications du navigateur et cette liste.
// Hébergement : Cloudflare Workers (offre gratuite). Un « Durable Object » par joueur, avec un réveil (alarm) à
// l'heure de la prochaine alerte.

export interface Env extends AccountEnv {
  ALERTS: DurableObjectNamespace;
  VAPID_PUBLIC: string;        // clé publique VAPID (base64url, 65 octets), aussi connue du jeu
  VAPID_PRIVATE_JWK: string;   // clé privée VAPID au format JWK (secret)
  VAPID_SUBJECT: string;       // contact exigé par les services de notification (mailto: ou https:)
  ORIGINS: string;             // origines autorisées, séparées par des virgules
}

import { sendPush, type PushSub } from './webpush';
import { handleAccount, type AccountEnv } from './accounts';
export { Account } from './accounts';
interface Alert { at: number; title: string; body: string; tag?: string; urgent?: boolean }

const MAX_ALERTS = 12;
const MAX_HORIZON_MS = 8 * 24 * 3600_000;

// ---------- Point d'entrée ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ORIGINS.split(',').map((o) => o.trim()).includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors: Record<string, string> = allowed
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : {};
    const reply = (status: number, text = '') => new Response(text, { status, headers: cors });
    if (req.method === 'OPTIONS') return reply(204);
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/') return reply(200, 'Warden of Heroes : service de notifications et de comptes.');
    if (req.method !== 'POST') return reply(405);
    if (!allowed) return reply(403);
    const big = url.pathname === '/saves/put';
    if ((Number(req.headers.get('Content-Length')) || 0) > (big ? 2_000_000 : 16_000)) return reply(413);
    if (url.pathname.startsWith('/account/') || url.pathname.startsWith('/saves/')) {
      let body: Record<string, unknown>;
      try { body = JSON.parse(await req.text()); } catch { return reply(400, 'JSON invalide'); }
      if (!body || typeof body !== 'object') return reply(400, 'JSON invalide');
      return withCors(await handleAccount(env, url.pathname, body), cors);
    }

    let data: { id?: string; sub?: PushSub; alerts?: Alert[] };
    try { data = JSON.parse(await req.text()); } catch { return reply(400, 'JSON invalide'); }

    if (url.pathname === '/test') {
      if (!validSub(data.sub)) return reply(400, 'abonnement invalide');
      const r = await sendPush(env, data.sub, { title: 'Warden of Heroes', body: 'Les notifications de la guilde arrivent bien sur cet appareil.', tag: 'essai' });
      return reply(r.ok ? 200 : 502, String(r.status));
    }
    if (!data.id || !/^[a-z0-9-]{8,64}$/.test(data.id)) return reply(400, 'identifiant invalide');
    const stub = env.ALERTS.get(env.ALERTS.idFromName(data.id));
    if (url.pathname === '/cancel') return withCors(await stub.fetch('https://do/cancel', { method: 'POST' }), cors);
    if (url.pathname === '/schedule') {
      if (!validSub(data.sub) || !Array.isArray(data.alerts)) return reply(400, 'données invalides');
      const now = Date.now();
      const alerts = data.alerts
        .filter((a) => typeof a.at === 'number' && a.at > now - 60_000 && a.at < now + MAX_HORIZON_MS && typeof a.title === 'string' && typeof a.body === 'string')
        .slice(0, MAX_ALERTS)
        .map((a) => ({ at: a.at, title: a.title.slice(0, 120), body: a.body.slice(0, 600), tag: a.tag?.slice(0, 40), urgent: !!a.urgent }));
      return withCors(await stub.fetch('https://do/schedule', { method: 'POST', body: JSON.stringify({ sub: data.sub, alerts }) }), cors);
    }
    return reply(404);
  },
};

function withCors(r: Response, cors: Record<string, string>): Response {
  return new Response(r.body, { status: r.status, headers: cors });
}

function validSub(s: unknown): s is PushSub {
  const x = s as PushSub;
  return !!x && typeof x.endpoint === 'string' && /^https:\/\//.test(x.endpoint) && x.endpoint.length < 1000
    && typeof x.keys?.p256dh === 'string' && typeof x.keys?.auth === 'string';
}

// ---------- Un joueur : sa liste d'alertes et son réveil ----------

export class Alerts {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const op = new URL(req.url).pathname;
    if (op === '/cancel') {
      await this.state.storage.deleteAll();
      await this.state.storage.deleteAlarm();
      return new Response('ok');
    }
    const { sub, alerts } = (await req.json()) as { sub: PushSub; alerts: Alert[] };
    alerts.sort((a, b) => a.at - b.at);
    await this.state.storage.put({ sub, alerts });
    if (alerts.length) await this.state.storage.setAlarm(alerts[0].at);
    else await this.state.storage.deleteAlarm();
    return new Response('ok');
  }

  async alarm(): Promise<void> {
    const sub = await this.state.storage.get<PushSub>('sub');
    const alerts = (await this.state.storage.get<Alert[]>('alerts')) ?? [];
    if (!sub) return;
    const now = Date.now();
    const due = alerts.filter((a) => a.at <= now + 5_000);
    const rest = alerts.filter((a) => a.at > now + 5_000);
    for (const a of due) {
      const r = await sendPush(this.env, sub, a);
      // Abonnement expiré ou retiré par le joueur : on oublie tout.
      if (r.status === 404 || r.status === 410) { await this.state.storage.deleteAll(); return; }
    }
    if (rest.length) {
      await this.state.storage.put('alerts', rest);
      await this.state.storage.setAlarm(rest[0].at);
    } else {
      await this.state.storage.deleteAll();
    }
  }
}

