// Fetches an OIDC provider's JWKS and writes each signing key as a PEM into
// Dovecot's local-validation key-dict layout: <out>/shared/<azp>/<alg>/<kid>.
//
//   node scripts/dev-jwks-to-keys.mjs <issuerUrl> <outDir>
import { createPublicKey } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const issuer = process.argv[2];
const outDir = process.argv[3];
if (!issuer || !outDir) {
  console.error('usage: dev-jwks-to-keys.mjs <issuerUrl> <outDir>');
  process.exit(1);
}

const res = await fetch(`${issuer}/protocol/openid-connect/certs`);
const { keys } = await res.json();

let n = 0;
for (const jwk of keys) {
  if (jwk.use && jwk.use !== 'sig') continue;
  const alg = jwk.alg || 'RS256';
  const pem = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  // Dovecot's oauth2 looks up dict key `shared/<azp>/<alg>/<kid>`, and the
  // fs:posix dict strips the `shared/` namespace — so the file lives at
  // <prefix>/<azp>/<alg>/<kid>. azp is the client id; also write a "default"
  // fallback copy.
  for (const azp of ['jmail', 'default']) {
    const dir = `${outDir}/${azp}/${alg}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${jwk.kid}`, pem);
    n++;
  }
}
console.log(`wrote ${n} key file(s) for ${keys.length} JWK(s)`);
