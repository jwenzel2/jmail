// Debug helper: decrypts the most recent stored access token, decodes its JWT
// claims, and calls Keycloak's userinfo endpoint to see what Dovecot would get.
import { createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from '../apps/api/node_modules/pg/lib/index.js';

const envFile = process.argv[2] || new URL('../.env', import.meta.url);
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

function decrypt(payload, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const { rows } = await pool.query(
  'select access_token_enc from oauth_tokens order by updated_at desc limit 1',
);
await pool.end();
if (!rows[0]) {
  console.error('no tokens stored');
  process.exit(1);
}
const token = decrypt(rows[0].access_token_enc, env.TOKEN_ENCRYPTION_KEY);
const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
console.log('JWT header:', { alg: header.alg, kid: header.kid });
console.log('JWT claims keys:', Object.keys(claims).join(', '));
console.log('  iss:', claims.iss, '| azp:', claims.azp, '| aud:', claims.aud);
console.log('  email:', claims.email, '| preferred_username:', claims.preferred_username);
console.log('  expires:', new Date(claims.exp * 1000).toISOString());

const userinfoUrl = `${env.OIDC_ISSUER_URL}/protocol/openid-connect/userinfo`;
const res = await fetch(userinfoUrl, { headers: { authorization: `Bearer ${token}` } });
console.log('userinfo status:', res.status);
console.log('userinfo body:', await res.text());

const introspectionClientId = process.env.INTROSPECTION_CLIENT_ID;
const introspectionClientSecret = process.env.INTROSPECTION_CLIENT_SECRET;
if (introspectionClientId && introspectionClientSecret) {
  const introspectionUrl = `${env.OIDC_ISSUER_URL}/protocol/openid-connect/token/introspect`;
  const auth = Buffer.from(`${introspectionClientId}:${introspectionClientSecret}`).toString(
    'base64',
  );
  const introspection = await fetch(introspectionUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ token }),
  });
  console.log('introspection status:', introspection.status);
  console.log('introspection body:', await introspection.text());
}
