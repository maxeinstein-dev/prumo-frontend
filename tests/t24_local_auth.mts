import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, checkAsync, frontSrc } from './harness.mts';

// Local sign-in hardening (AUTH_MODE=local): session rules in utils/localSession.ts, and the real axios client in
// utils/api.ts bundled with esbuild (the frontend has no test runner) and driven through a fake adapter. Invented data only.
// FRONTEND_DIR points at the frontend checkout under test (its node_modules provides esbuild and axios); default: the sibling checkout.
// LOCAL_SESSION_MODULE / LOCAL_API_SRC point at mutated copies for the bite-checks.
const frontDir = process.env.FRONTEND_DIR || fileURLToPath(new URL('..', import.meta.url));
const sessionPath = process.env.LOCAL_SESSION_MODULE || frontSrc('utils/localSession.ts');

console.log('\n[local auth] utils/localSession.ts, utils/api.ts, config/authMode.ts');

const require = createRequire(frontDir + '/package.json');
const esbuild = require('esbuild');

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const storage = new MemoryStorage();
const assigned: string[] = [];
const win = { location: { pathname: '/app', assign: (url: string) => assigned.push(url) } };
Object.assign(globalThis, { localStorage: storage, window: win });

const dir = mkdtempSync(join(tmpdir(), 'fe-local-auth-'));
const entry = [
  `export * as session from ${JSON.stringify(sessionPath)};`,
  `export * as authMode from ${JSON.stringify(frontSrc('config/authMode.ts'))};`,
  `export * as api from ${JSON.stringify(process.env.LOCAL_API_SRC || frontSrc('utils/api.ts'))};`,
  `export { AxiosError } from 'axios';`,
].join('\n');
const out = join(dir, 'bundle.mjs');
await esbuild.build({
  stdin: { contents: entry, resolveDir: frontDir, loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: out,
  logLevel: 'silent',
  nodePaths: [frontDir + '/node_modules'],
  define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: 'http://api.test' }) },
  plugins: [
    {
      name: 'stub-firebase',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setup(b: any) {
        b.onResolve({ filter: /config\/firebase$/ }, () => ({ path: 'firebase-stub', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `export const getFirebaseAuth = () => ({ currentUser: { getIdToken: async () => 'firebase-id-token' } });`,
          loader: 'js',
        }));
      },
    },
  ],
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const B: any = await import(pathToFileURL(out).href);
const { session, authMode, api, AxiosError } = B;

const reset = (mode: string | null, token: string | null) => {
  storage.clear();
  assigned.length = 0;
  win.location.pathname = '/app';
  authMode.clearAuthModeCache();
  if (mode) storage.setItem('recta_auth_mode', mode);
  if (token) storage.setItem('recta_token', token);
  storage.setItem('recta_user', JSON.stringify({ id: 'u1', email: 'a@example.com' }));
};

// The axios client with a scripted server: records the Authorization header of each request.
const seen: Array<string | undefined> = [];
let answer: { status: number; data?: unknown } = { status: 200, data: { success: true } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
api.axiosInstance.defaults.adapter = async (config: any) => {
  const auth = typeof config.headers.get === 'function' ? config.headers.get('Authorization') : config.headers.Authorization;
  seen.push(auth);
  if (answer.status >= 400) {
    throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, {}, { status: answer.status, data: answer.data ?? {}, config, headers: {}, statusText: '' });
  }
  return { status: answer.status, data: answer.data, headers: {}, config, statusText: 'OK' };
};
const call = async () => {
  seen.length = 0;
  try {
    await api.apiClient.get('/x');
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, status: (e as { status?: number }).status };
  }
};

check('localAuthErrorCode: 401 credentials, 429 rate limit, 403 closed registration, 409 taken, 400 invalid input, else unknown', () => {
  const c = session.localAuthErrorCode;
  assert.deepEqual([401, 429, 403, 409, 400, 500, 0].map(c), [
    'invalid-credentials',
    'rate-limited',
    'registration-closed',
    'email-taken',
    'invalid-input',
    'unknown',
    'unknown',
  ]);
});

check('LocalAuthError carries the code and is an Error', () => {
  const e = new session.LocalAuthError('rate-limited', 'x');
  assert.ok(e instanceof Error);
  assert.equal(e.code, 'rate-limited');
});

check('parseAuthConfig: mode and registrationEnabled; an old backend without the flag counts as open; false closes; junk is null', () => {
  const p = session.parseAuthConfig;
  assert.deepEqual(p({ data: { authMode: 'local', registrationEnabled: false } }), { authMode: 'local', registrationEnabled: false });
  assert.deepEqual(p({ data: { authMode: 'local' } }), { authMode: 'local', registrationEnabled: true });
  assert.deepEqual(p({ data: { authMode: 'firebase', registrationEnabled: true } }), { authMode: 'firebase', registrationEnabled: true });
  for (const junk of [null, undefined, {}, { data: {} }, { data: { authMode: 'ldap' } }, 'x']) assert.equal(p(junk), null);
});

check('tokenSourceFor: only local mode uses the local token', () => {
  assert.equal(session.tokenSourceFor('local'), 'local');
  assert.equal(session.tokenSourceFor('firebase'), 'firebase');
  assert.equal(session.tokenSourceFor(null), 'firebase');
});

check('shouldEndLocalSession: 401, local mode and a stored token, all three', () => {
  const s = session.shouldEndLocalSession;
  assert.equal(s(401, 'local', 'jwt'), true);
  assert.equal(s(401, 'local', null), false);
  assert.equal(s(401, 'firebase', 'jwt'), false);
  assert.equal(s(401, null, 'jwt'), false);
  for (const status of [400, 403, 404, 429, 500, undefined]) assert.equal(s(status, 'local', 'jwt'), false);
});

check('endExpiredLocalSession: forgets token and user, goes to /login once, not from /login', () => {
  reset('local', 'jwt');
  session.endExpiredLocalSession();
  assert.equal(storage.getItem('recta_token'), null);
  assert.equal(storage.getItem('recta_user'), null);
  assert.deepEqual(assigned, ['/login']);
  assigned.length = 0;
  win.location.pathname = '/login';
  session.endExpiredLocalSession();
  assert.deepEqual(assigned, []);
});

await checkAsync('client in local mode sends the stored local JWT', async () => {
  reset('local', 'local-jwt');
  answer = { status: 200, data: { success: true } };
  assert.equal((await call()).ok, true);
  assert.deepEqual(seen, ['Bearer local-jwt']);
});

await checkAsync('client in firebase mode ignores a forgotten local token and sends the Firebase ID token', async () => {
  reset('firebase', 'forgotten-jwt');
  assert.equal((await call()).ok, true);
  assert.deepEqual(seen, ['Bearer firebase-id-token']);
});

await checkAsync('local mode without a token sends no Authorization header', async () => {
  reset('local', null);
  assert.equal((await call()).ok, true);
  assert.deepEqual(seen, [undefined]);
});

await checkAsync('401 in local mode with a stored token clears the session and goes to /login, and the caller still gets the error', async () => {
  reset('local', 'expired-jwt');
  answer = { status: 401, data: { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } } };
  const r = await call();
  assert.deepEqual(r, { ok: false, status: 401 });
  assert.equal(storage.getItem('recta_token'), null);
  assert.equal(storage.getItem('recta_user'), null);
  assert.deepEqual(assigned, ['/login']);
});

await checkAsync('401 in firebase mode does not touch a stored local token or navigate', async () => {
  reset('firebase', 'jwt');
  answer = { status: 401, data: {} };
  await call();
  assert.equal(storage.getItem('recta_token'), 'jwt');
  assert.deepEqual(assigned, []);
});

await checkAsync('other errors in local mode (403, 404, 429, 500) keep the session', async () => {
  for (const status of [403, 404, 429, 500]) {
    reset('local', 'jwt');
    answer = { status, data: {} };
    await call();
    assert.equal(storage.getItem('recta_token'), 'jwt', `status ${status}`);
    assert.deepEqual(assigned, [], `status ${status}`);
  }
});

await checkAsync('fetchAuthConfig remembers registrationEnabled=false, and an older backend without the flag stays open', async () => {
  const realFetch = globalThis.fetch;
  try {
    for (const [body, expected] of [
      [{ success: true, data: { authMode: 'local', firebaseWebApiKey: null, registrationEnabled: false } }, false],
      [{ success: true, data: { authMode: 'local', firebaseWebApiKey: null } }, true],
    ] as const) {
      authMode.clearAuthModeCache();
      globalThis.fetch = (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
      assert.equal(await authMode.fetchAuthConfig(), 'local');
      assert.equal(authMode.getRegistrationEnabled(), expected);
    }
    // clearing the cache forgets a closed registration too
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ data: { authMode: 'local', registrationEnabled: false } }) })) as unknown as typeof fetch;
    authMode.clearAuthModeCache();
    await authMode.fetchAuthConfig();
    assert.equal(authMode.getRegistrationEnabled(), false);
    authMode.clearAuthModeCache();
    assert.equal(authMode.getRegistrationEnabled(), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

check('isRegistrationOpen: only a local backend that says false closes sign-up', () => {
  const o = session.isRegistrationOpen;
  assert.equal(o('local', false), false);
  assert.equal(o('local', true), true);
  assert.equal(o('local', undefined), true);
  assert.equal(o('firebase', false), true);
  assert.equal(o(undefined, false), true);
});

check('wantsSignupForm: ?action=signup opens the sign-up form only while registration is open', () => {
  const w = session.wantsSignupForm;
  assert.equal(w('signup', true), true);
  assert.equal(w('signup', false), false);
  assert.equal(w('login', true), false);
  assert.equal(w(null, true), false);
});

await checkAsync('every failure the login page can show has a non-empty message in all 8 languages', async () => {
  const { readFileSync } = await import('node:fs');
  const keys = Object.values(session.LOCAL_AUTH_MESSAGE_KEY) as string[];
  for (const loc of ['pt-BR', 'en-US', 'es-ES', 'fr-FR', 'ja-JP', 'ru-RU', 'zh-CN', 'ar-SA']) {
    const json = JSON.parse(readFileSync(frontSrc(`i18n/${loc}.json`), 'utf8'));
    for (const key of keys) assert.ok(typeof json[key] === 'string' && json[key].trim() !== '', `${loc}: ${key}`);
  }
});

check('the six failure codes map to six distinct messages', () => {
  const map = session.LOCAL_AUTH_MESSAGE_KEY;
  assert.deepEqual(Object.keys(map).sort(), ['email-taken', 'invalid-credentials', 'invalid-input', 'rate-limited', 'registration-closed', 'unknown']);
  assert.equal(new Set(Object.values(map)).size, 6);
});
