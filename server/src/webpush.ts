// Web Push sans bibliothèque (v1.1, D-168) : chiffrement du message (RFC 8291) et signature VAPID (RFC 8292),
// avec la seule WebCrypto (Cloudflare Workers, navigateurs, Node). Testé dans tests/push.test.ts.

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }
export interface VapidKeys { VAPID_PUBLIC: string; VAPID_PRIVATE_JWK: string; VAPID_SUBJECT: string }
type Bytes = Uint8Array<ArrayBuffer>;


const enc = new TextEncoder();
const utf8 = (s: string): Bytes => new Uint8Array(enc.encode(s));

function b64uDecode(s: string): Bytes {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function b64uEncode(buf: ArrayBuffer | Bytes): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Chiffre le message pour ce navigateur (contenu « aes128gcm », un seul enregistrement). */
export async function encrypt(sub: PushSub, payload: Bytes): Promise<Bytes> {
  const uaPublic = b64uDecode(sub.keys.p256dh);
  const authSecret = b64uDecode(sub.keys.auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as never, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** Jeton VAPID signé (ES256) pour le service de notification du navigateur. */
export async function vapidAuth(env: VapidKeys, endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64uEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64uEncode(utf8(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${env.VAPID_PUBLIC}`;
}

export async function sendPush(env: VapidKeys, sub: PushSub, a: { title: string; body: string; tag?: string; urgent?: boolean }): Promise<Response> {
  const payload = utf8(JSON.stringify({ title: a.title, body: a.body, tag: a.tag }));
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 3600),
      Urgency: a.urgent ? 'high' : 'normal',
    },
    body: await encrypt(sub, payload),
  });
}
