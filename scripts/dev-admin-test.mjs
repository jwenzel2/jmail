// Verifies the admin + spam + agent integration end-to-end (uses SA stubs).
//   node scripts/dev-admin-test.mjs
import assert from 'node:assert';

const BASE = process.env.WEB_BASE ?? 'http://localhost:5173';
const jar = new Map();
function store(res) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(';');
    const i = pair.indexOf('=');
    const v = pair.slice(i + 1).trim();
    if (v && v !== 'deleted') jar.set(pair.slice(0, i).trim(), v);
    else jar.delete(pair.slice(0, i).trim());
  }
}
async function go(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { ...(init.headers ?? {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  store(res);
  return res;
}
const json = async (url, init) => {
  const r = await go(url, init);
  if (r.status !== 200) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
};
const send = (m, u, b) =>
  json(u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

// login as alice (admin)
const login = await go(`${BASE}/auth/login`);
const html = await (await go(login.headers.get('location'))).text();
const action = html
  .match(/action="([^"]*login-actions\/authenticate[^"]*)"/)[1]
  .replace(/&amp;/g, '&');
const submit = await go(action, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ username: 'alice', password: 'password', credentialId: '' }).toString(),
});
await go(submit.headers.get('location'));
const me = await json(`${BASE}/api/me`);
assert(me.user?.isAdmin, 'alice should be admin');
console.log('logged in as admin', me.user.email);

// agent health
const health = await json(`${BASE}/api/admin/agent/health`);
assert(health.ok && health.spamassassinVersion?.includes('stub'), 'agent health');
console.log('agent health:', health.spamassassinVersion);

// global config read + validate + apply
const cfg = await json(`${BASE}/api/admin/spam/config`);
assert(cfg.content.includes('required_score'), 'config read');
const lint = await send('POST', `${BASE}/api/admin/spam/config/validate`, { content: cfg.content });
assert(lint.ok, 'validate ok');
const newCfg = cfg.content + '\nwhitelist_from test@x.com\n';
const apply = await send('PUT', `${BASE}/api/admin/spam/config`, { content: newCfg });
assert(apply.ok, 'apply ok');
const cfg2 = await json(`${BASE}/api/admin/spam/config`);
assert(cfg2.content.includes('whitelist_from test@x.com'), 'config persisted');
console.log('global config validate/apply ok');

// user spam settings (bayes from stub) + lists round-trip
const settings = await json(`${BASE}/api/spam/settings`);
assert(settings.bayes.nSpam === 450 && settings.bayes.trained, 'bayes stats parsed');
await send('PUT', `${BASE}/api/spam/lists`, {
  entries: [{ pattern: 'friend@example.com', list: 'allow' }],
});
const settings2 = await json(`${BASE}/api/spam/settings`);
assert(
  settings2.entries.some((e) => e.pattern === 'friend@example.com' && e.list === 'allow'),
  'allow-list persisted',
);
console.log('user spam settings + lists ok (nSpam=%d)', settings.bayes.nSpam);

// branding admin -> public branding reflects change
const name = `Acme Mail ${Date.now()}`;
await send('PUT', `${BASE}/api/admin/branding`, { appName: name });
const branding = await json(`${BASE}/api/branding`);
assert(branding.appName === name, `branding not updated: ${branding.appName}`);
console.log('branding updated to:', branding.appName);

// audit log captured the admin actions
const audit = await json(`${BASE}/api/admin/audit`);
const actions = audit.entries.map((e) => e.action);
assert(actions.includes('branding.update') && actions.includes('spam.config.apply'), 'audit entries');
console.log('audit entries:', [...new Set(actions)].join(', '));

console.log('\nPASS — admin + spam + agent integration verified');
