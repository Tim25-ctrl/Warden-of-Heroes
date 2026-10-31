// Mise en ligne du service de notifications (à lancer une fois, après « wrangler login ») :
// 1. crée les clés VAPID (gardées dans server/.vapid.json, jamais commitées) ;
// 2. publie le service sur Cloudflare Workers ;
// 3. lui donne ses clés (secrets Cloudflare) ;
// 4. écrit l'adresse du service et la clé publique dans src/push.json, que le jeu lit.
// Usage : npm run push:setup   (ou, si l'adresse n'a pas pu être lue : npm run push:setup -- --url https://…workers.dev)
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const keysFile = join(here, '.vapid.json');
const configFile = join(here, '..', 'src', 'push.json');

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// 1. Clés VAPID
let keys;
if (existsSync(keysFile)) {
  keys = JSON.parse(readFileSync(keysFile, 'utf8'));
  console.log('Clés VAPID existantes réutilisées.');
} else {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  keys = { publicKey: b64u(pub), privateJwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d } };
  writeFileSync(keysFile, JSON.stringify(keys, null, 2));
  console.log('Clés VAPID créées (server/.vapid.json).');
}
// Secret des jetons de session des comptes (D-173), gardé avec les clés.
if (!keys.sessionSecret) {
  keys.sessionSecret = b64u(randomBytes(32));
  writeFileSync(keysFile, JSON.stringify(keys, null, 2));
  console.log('Secret des comptes créé.');
}

// 2. Publication (la sortie est affichée et relue pour trouver l'adresse du service)
const argUrl = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
let url = argUrl;
if (!url) {
  console.log('\nPublication sur Cloudflare…');
  const out = await new Promise((resolve) => {
    let text = '';
    const p = spawn('npx', ['wrangler', 'deploy'], { cwd: here, shell: true, stdio: ['inherit', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => { process.stdout.write(d); text += d; });
    p.on('close', (code) => resolve(code === 0 ? text : null));
  });
  if (out === null) { console.error('\nLa publication a échoué (voir le message ci-dessus).'); process.exit(1); }
  url = /https:\/\/[a-z0-9.-]+\.workers\.dev/i.exec(out)?.[0] ?? null;
  if (!url) { console.error("\nPublié, mais l'adresse n'a pas été trouvée. Relance avec : npm run push:setup -- --url https://…workers.dev"); process.exit(1); }
}

// 3. Secrets
const secretsFile = join(here, '.secrets.tmp.json');
writeFileSync(secretsFile, JSON.stringify({ VAPID_PUBLIC: keys.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(keys.privateJwk), SESSION_SECRET: keys.sessionSecret }));
const sec = spawnSync('npx', ['wrangler', 'secret', 'bulk', '.secrets.tmp.json'], { cwd: here, shell: true, stdio: 'inherit' });
unlinkSync(secretsFile);
if (sec.status !== 0) { console.error('\nLes clés n\'ont pas pu être envoyées à Cloudflare.'); process.exit(1); }

// 4. Configuration du jeu
writeFileSync(configFile, JSON.stringify({ url, publicKey: keys.publicKey }, null, 2) + '\n');
console.log(`\nService en ligne : ${url}\nConfiguration du jeu écrite dans src/push.json. Il reste à commiter et pousser.`);
