// Headless end-to-end check of the OIDC login flow against the dev stack.
// Drives: /auth/login -> Keycloak login form -> /auth/callback -> /api/me.
//
//   node scripts/dev-login-test.mjs [username] [password]
//
// Requires the dev stack running: Keycloak (:8080), jmail-api (:4000), vite (:5173).

const BASE = process.env.WEB_BASE ?? 'http://localhost:5173';
const username = process.argv[2] ?? 'alice';
const password = process.argv[3] ?? 'password';

// Minimal cookie jar keyed by name (everything is on localhost in dev).
const jar = new Map();
function storeCookies(res) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === '' || value === 'deleted') jar.delete(name);
    else jar.set(name, value);
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function go(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });
  storeCookies(res);
  return res;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// 1. Start login -> redirect to Keycloak.
const login = await go(`${BASE}/auth/login`);
if (login.status !== 302) fail(`/auth/login expected 302, got ${login.status}`);
const authorizeUrl = login.headers.get('location');
if (!authorizeUrl?.includes('/protocol/openid-connect/auth')) fail(`bad authorize url: ${authorizeUrl}`);

// 2. Load the Keycloak login form.
const formPage = await go(authorizeUrl);
const html = await formPage.text();
const action = html.match(/action="([^"]*login-actions\/authenticate[^"]*)"/)?.[1]?.replace(/&amp;/g, '&');
if (!action) fail('could not find Keycloak login form action');

// 3. Submit credentials -> redirect back to the app callback.
const submit = await go(action, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ username, password, credentialId: '' }).toString(),
});
if (submit.status !== 302) fail(`login submit expected 302 (got ${submit.status}) — check credentials`);
const callbackUrl = submit.headers.get('location');
if (!callbackUrl?.includes('/auth/callback')) fail(`unexpected post-login redirect: ${callbackUrl}`);

// 4. Hit the callback -> session established, redirect to the app.
const callback = await go(callbackUrl);
if (callback.status !== 302) fail(`/auth/callback expected 302 (got ${callback.status})`);

// 5. Confirm the session.
const me = await go(`${BASE}/api/me`);
const body = await me.json();
if (!body.user) fail(`/api/me returned no user: ${JSON.stringify(body)}`);

console.log('PASS — logged in as:', JSON.stringify(body.user));
