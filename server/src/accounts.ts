// Comptes joueurs et sauvegardes en ligne (v1.1, D-173) : retrouver ses parties sur tous ses appareils.
// - Le mot de passe ne quitte jamais l'appareil : le jeu en dérive une clé (PBKDF2, 310 000 tours, sel propre au
//   compte) ; le serveur ne garde que l'empreinte SHA-256 de cette clé.
// - Un « Durable Object » par compte (nommé par l'e-mail) garde le compte et ses sauvegardes (compressées par le jeu).
// - Jeton de session signé (HMAC), valable un an, invalidé quand le mot de passe change.
// - Mot de passe oublié : un code à 6 chiffres envoyé par e-mail (Brevo), valable 30 minutes.

export interface AccountEnv {
  ACCOUNTS: DurableObjectNamespace;
  SESSION_SECRET: string;      // secret de signature des jetons (et des sels factices)
  BREVO_KEY?: string;          // clé de l'API d'envoi d'e-mails Brevo (mot de passe oublié)
  MAIL_FROM?: string;          // adresse d'expédition vérifiée chez Brevo
}

interface AccountData {
  email: string; salt: string; authHash: string; v: number; created: number;
  fails: number; lockUntil: number;
  reset?: { hash: string; exp: number; tries: number };
  resetLog: number[];
}
export interface SaveMeta { slot: string; savedAt: number; day: number; mode: string; label: string; size: number }

const SLOTS = ['auto', 'auto-chronique', '1', '2', '3'];
const MAX_SAVE = 1_500_000;          // octets de sauvegarde compressée (en base64)
const MAX_PROGRESS = 300_000;        // hauts faits et Panthéon, compressés (D-174)
const TOKEN_DAYS = 365;

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const sha256 = async (s: string) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
/** Comparaison en temps constant. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const validEmail = (e: string) => e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validKey = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9_-]{40,60}$/.test(k);

export async function makeToken(env: AccountEnv, email: string, v: number): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify({ e: email, v, x: Date.now() + TOKEN_DAYS * 86400_000 })));
  return `${body}.${await hmac(env.SESSION_SECRET, body)}`;
}
export async function readToken(env: AccountEnv, token: unknown): Promise<{ e: string; v: number } | null> {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !same(sig, await hmac(env.SESSION_SECRET, body))) return null;
  try {
    const t = JSON.parse(new TextDecoder().decode(fromB64u(body))) as { e: string; v: number; x: number };
    return t.x > Date.now() ? { e: t.e, v: t.v } : null;
  } catch { return null; }
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

/** Routes /account/* et /saves/* : vérifie l'entrée, puis confie la demande à l'objet du compte. */
export async function handleAccount(env: AccountEnv, path: string, data: Record<string, unknown>): Promise<Response> {
  let email = normEmail(data.email);
  if (path.startsWith('/saves/') || path === '/account/delete') {
    const t = await readToken(env, data.token);
    if (!t) return fail('Session expirée : reconnecte-toi.', 401);
    email = t.e;
    data.tokenV = t.v;
  } else if (!validEmail(email)) {
    return fail('Adresse e-mail invalide.');
  }
  // Compte inconnu : un sel factice mais stable, pour ne pas révéler quelles adresses ont un compte.
  if (path === '/account/salt') data.fakeSalt = (await hmac(env.SESSION_SECRET, `salt:${email}`)).slice(0, 22);
  const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(`acct:${email}`));
  return stub.fetch(`https://do${path}`, { method: 'POST', body: JSON.stringify({ ...data, email }) });
}

export class Account {
  constructor(private state: DurableObjectState, private env: AccountEnv) {}

  private get store() { return this.state.storage; }
  private acct() { return this.store.get<AccountData>('acct'); }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    const d = (await req.json()) as Record<string, unknown> & { email: string };
    const a = await this.acct();
    const now = Date.now();
    switch (path) {
      case '/account/salt':
        return json({ salt: a?.salt ?? d.fakeSalt });

      case '/account/register': {
        if (a) return fail('Un compte existe déjà avec cette adresse. Connecte-toi, ou utilise « Mot de passe oublié ».', 409);
        if (typeof d.salt !== 'string' || !/^[A-Za-z0-9_-]{16,40}$/.test(d.salt) || !validKey(d.authKey)) return fail('Données invalides.');
        const acct: AccountData = { email: d.email, salt: d.salt, authHash: await sha256(d.authKey), v: 1, created: now, fails: 0, lockUntil: 0, resetLog: [] };
        await this.store.put('acct', acct);
        return json({ token: await makeToken(this.env, d.email, acct.v), email: d.email });
      }

      case '/account/login': {
        if (!a || !validKey(d.authKey)) return fail('E-mail ou mot de passe incorrect.', 401);
        if (a.lockUntil > now) return fail(`Trop d'essais : réessaie dans ${Math.ceil((a.lockUntil - now) / 60_000)} minute(s).`, 429);
        if (!same(await sha256(d.authKey), a.authHash)) {
          a.fails += 1;
          if (a.fails >= 5) { a.lockUntil = now + 15 * 60_000; a.fails = 0; }
          await this.store.put('acct', a);
          return fail('E-mail ou mot de passe incorrect.', 401);
        }
        if (a.fails) { a.fails = 0; await this.store.put('acct', a); }
        return json({ token: await makeToken(this.env, a.email, a.v), email: a.email });
      }

      case '/account/reset/request': {
        // Toujours la même réponse, que le compte existe ou non.
        const ok = json({ ok: true });
        if (!a) return ok;
        a.resetLog = a.resetLog.filter((t) => t > now - 86400_000);
        if (a.resetLog.length >= 5 || (a.resetLog.length && now - a.resetLog[a.resetLog.length - 1] < 60_000)) return ok;
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
        a.reset = { hash: await sha256(`${a.email}:${code}`), exp: now + 30 * 60_000, tries: 0 };
        a.resetLog.push(now);
        await this.store.put('acct', a);
        const sent = await sendResetMail(this.env, a.email, code);
        return sent ? ok : fail("L'e-mail n'a pas pu être envoyé. Réessaie plus tard.", 502);
      }

      case '/account/reset/confirm': {
        const bad = fail('Code incorrect ou expiré.', 401);
        if (!a?.reset || a.reset.exp < now || a.reset.tries >= 5) return bad;
        if (!same(await sha256(`${a.email}:${String(d.code ?? '').trim()}`), a.reset.hash)) {
          a.reset.tries += 1;
          await this.store.put('acct', a);
          return bad;
        }
        if (typeof d.salt !== 'string' || !/^[A-Za-z0-9_-]{16,40}$/.test(d.salt) || !validKey(d.authKey)) return fail('Données invalides.');
        a.salt = d.salt; a.authHash = await sha256(d.authKey); a.v += 1; a.reset = undefined; a.fails = 0; a.lockUntil = 0;
        await this.store.put('acct', a);
        return json({ token: await makeToken(this.env, a.email, a.v), email: a.email });
      }
    }

    // ---------- Sauvegardes (jeton déjà vérifié) ----------
    if (!a || a.v !== d.tokenV) return fail('Session expirée : reconnecte-toi.', 401);
    // Suppression du compte (D-174) : jeton et mot de passe, puis tout est effacé.
    if (path === '/account/delete') {
      if (!validKey(d.authKey) || !same(await sha256(d.authKey), a.authHash)) return fail('Mot de passe incorrect.', 401);
      await this.store.deleteAll();
      return json({ ok: true });
    }
    const slot = String(d.slot ?? '');
    switch (path) {
      case '/saves/list': {
        const metas = await this.store.list<SaveMeta>({ prefix: 'meta:' });
        return json({ saves: [...metas.values()] });
      }
      case '/saves/get': {
        if (!SLOTS.includes(slot)) return fail('Emplacement inconnu.');
        const meta = await this.store.get<SaveMeta>(`meta:${slot}`);
        const data = await this.store.get<string>(`save:${slot}`);
        return meta && data ? json({ meta, data }) : fail('Aucune sauvegarde ici.', 404);
      }
      case '/saves/put': {
        if (!SLOTS.includes(slot) || typeof d.data !== 'string' || d.data.length > MAX_SAVE || typeof d.savedAt !== 'number') return fail('Sauvegarde invalide.');
        const cur = await this.store.get<SaveMeta>(`meta:${slot}`);
        // Écrite ailleurs depuis la dernière synchronisation de cet appareil : on ne l'écrase pas sans accord.
        if (cur && !d.force && cur.savedAt !== d.base && cur.savedAt !== d.savedAt) return json({ conflict: cur }, 409);
        const meta: SaveMeta = {
          slot, savedAt: d.savedAt, day: Number(d.day) || 0, mode: String(d.mode ?? '').slice(0, 20),
          label: String(d.label ?? '').slice(0, 120), size: d.data.length,
        };
        await this.store.put({ [`meta:${slot}`]: meta, [`save:${slot}`]: d.data });
        return json({ ok: true, meta });
      }
      // Hauts faits et Panthéon (D-174) : un seul bloc, que les appareils fusionnent. rev change à chaque écriture ;
      // un appareil qui écrit sans avoir vu la dernière version reçoit celle-ci pour fusionner à nouveau.
      case '/saves/progress/get': {
        const p = await this.store.get<{ data: string; rev: number }>('progress');
        return json(p ?? { data: null, rev: 0 });
      }
      case '/saves/progress/put': {
        if (typeof d.data !== 'string' || d.data.length > MAX_PROGRESS || typeof d.base !== 'number') return fail('Données invalides.');
        const cur = (await this.store.get<{ data: string; rev: number }>('progress')) ?? { data: null, rev: 0 };
        if (cur.rev !== d.base) return json({ conflict: true, data: cur.data, rev: cur.rev }, 409);
        const rev = cur.rev + 1;
        await this.store.put('progress', { data: d.data, rev });
        return json({ ok: true, rev });
      }
      case '/saves/delete': {
        await this.store.delete([`meta:${slot}`, `save:${slot}`]);
        return json({ ok: true });
      }
    }
    return fail('Inconnu.', 404);
  }
}

async function sendResetMail(env: AccountEnv, to: string, code: string): Promise<boolean> {
  if (!env.BREVO_KEY || !env.MAIL_FROM) return false;
  const text = `Bonjour,\n\nVoici ton code pour choisir un nouveau mot de passe dans Warden of Heroes : ${code}\n\nIl est valable 30 minutes. Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.\n\nLe vieux Gaspard`;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: env.MAIL_FROM, name: 'Warden of Heroes' }, to: [{ email: to }],
      subject: `Ton code Warden of Heroes : ${code}`, textContent: text,
    }),
  });
  return r.ok;
}
