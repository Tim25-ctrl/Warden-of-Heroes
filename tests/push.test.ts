// Service de notifications (v1.1, D-168) : le message chiffré par le serveur se déchiffre comme dans un navigateur
// (RFC 8291), et le jeton VAPID est bien signé (RFC 8292).
import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync, randomBytes, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encrypt, vapidAuth } from '../server/src/webpush';

const b64u = (b: Buffer) => b.toString('base64url');

describe('service de notifications', () => {
  it('chiffre un message que le navigateur sait lire', async () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = randomBytes(16);
    const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };
    const body = Buffer.from(await encrypt(sub, new TextEncoder().encode('{"title":"Assaut"}')));
    const salt = body.subarray(0, 16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const cipher = body.subarray(21 + idlen);
    const shared = ua.computeSecret(asPublic);
    const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(cipher.subarray(cipher.length - 16));
    const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
    expect(plain[plain.length - 1]).toBe(2);
    expect(plain.subarray(0, -1).toString()).toBe('{"title":"Assaut"}');
  });

  it('signe un jeton VAPID valide', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' });
    const env = { VAPID_PUBLIC: 'k', VAPID_PRIVATE_JWK: JSON.stringify(jwk), VAPID_SUBJECT: 'https://example.org', ORIGINS: '' } as never;
    const h = await vapidAuth(env, 'https://fcm.googleapis.com/fcm/send/xyz');
    const jwt = /t=([^,]+)/.exec(h)![1];
    const [head, payload, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString()).aud).toBe('https://fcm.googleapis.com');
    const ok = verify('sha256', Buffer.from(`${head}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });
});
