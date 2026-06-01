// End-to-end check of the webmail path against the dev stack:
// logs in (OIDC), sends a message to self over SMTP (XOAUTH2), then reads it
// back over IMAP (XOAUTH2) through the jmail API.
//
//   node scripts/dev-mail-test.mjs [username] [password] [emailDomain]

const BASE = process.env.WEB_BASE ?? 'http://localhost:5173';
const username = process.argv[2] ?? 'alice';
const password = process.argv[3] ?? 'password';
const email = `${username}@${process.argv[4] ?? 'example.com'}`;

const jar = new Map();
function store(res) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === '' || value === 'deleted') jar.delete(name);
    else jar.set(name, value);
  }
}
function cookies() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function go(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { ...(init.headers ?? {}), cookie: cookies() },
  });
  store(res);
  return res;
}
function fail(m) {
  console.error(`FAIL: ${m}`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. Login via Keycloak ---
const login = await go(`${BASE}/auth/login`);
const authorizeUrl = login.headers.get('location');
if (!authorizeUrl) fail('no authorize redirect');
const html = await (await go(authorizeUrl)).text();
const action = html
  .match(/action="([^"]*login-actions\/authenticate[^"]*)"/)?.[1]
  ?.replace(/&amp;/g, '&');
if (!action) fail('no login form');
const submit = await go(action, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ username, password, credentialId: '' }).toString(),
});
const cb = submit.headers.get('location');
if (!cb?.includes('/auth/callback')) fail(`login failed: ${submit.status}`);
await go(cb);
const me = await (await go(`${BASE}/api/me`)).json();
if (!me.user) fail('not authenticated');
console.log('logged in as', me.user.email);

// --- 2. Folders ---
const folders = await (await go(`${BASE}/api/mail/folders`)).json();
if (!Array.isArray(folders) || !folders.some((f) => f.role === 'inbox')) {
  fail(`folders look wrong: ${JSON.stringify(folders)}`);
}
console.log('folders:', folders.map((f) => f.path).join(', '));

// --- 3. Send a message to self ---
const marker = `jmail-test-${Date.now()}`;
const sendRes = await go(`${BASE}/api/mail/send`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ to: [email], subject: marker, text: `Body ${marker}` }),
});
if (sendRes.status !== 200) fail(`send failed: ${sendRes.status} ${await sendRes.text()}`);
console.log('sent message with subject', marker);

// --- 4. Poll INBOX for the delivered message ---
let found = null;
for (let i = 0; i < 20; i++) {
  await sleep(1500);
  const list = await (
    await go(`${BASE}/api/mail/messages?folder=INBOX&page=1&pageSize=20`)
  ).json();
  found = (list.messages ?? []).find((m) => m.subject === marker);
  if (found) break;
}
if (!found) fail('message not delivered to INBOX within timeout');
console.log('delivered to INBOX, uid', found.uid);

// --- 5. Read it back ---
const detail = await (await go(`${BASE}/api/mail/message/INBOX/${found.uid}`)).json();
if (!detail || !(detail.text ?? '').includes(marker)) {
  fail(`message body mismatch: ${JSON.stringify(detail).slice(0, 200)}`);
}
console.log('PASS — sent and read message end-to-end via XOAUTH2');
