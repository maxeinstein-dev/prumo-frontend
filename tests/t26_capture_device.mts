import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, checkAsync, frontSrc } from './harness.mts';

// Android capture reader screen: the plugin wrapper (src/utils/captureDevice.ts) driven by a fake plugin, and the screen
// texts (src/utils/captureTexts.ts + the i18n files). Invented data only; the real plugin is Kotlin and runs on the phone.
const devicePath = process.env.CAPTURE_DEVICE_MODULE || frontSrc('utils/captureDevice.ts');
const textsPath = process.env.CAPTURE_TEXTS_MODULE || frontSrc('utils/captureTexts.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D: any = await import(pathToFileURL(devicePath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(textsPath).href);

const TOKEN = 'rdt_' + 'A'.repeat(43);
const API = 'https://recta-api.example.test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakePlugin(over: Record<string, any> = {}): any {
  const calls: Array<[string, unknown]> = [];
  const base = {
    calls,
    configure: async (o: unknown) => { calls.push(['configure', o]); },
    clearLink: async () => { calls.push(['clearLink', null]); },
    getLinkState: async () => ({ linked: true, apiUrl: API, deviceId: 'dev-1', secureStorageAvailable: true }),
    getNotificationAccessState: async () => ({ enabled: true }),
    getBatteryState: async () => ({ ignoringOptimizations: true }),
    getQueueState: async () => ({
      pending: 0, sent: 3, rejected: 0, lastSentAt: 1_700_000_000_000, lastError: null, lastErrorCode: null, lastErrorAt: null, authBlocked: false,
    }),
  };
  return { ...base, ...over };
}

console.log('\n[capture reader] utils/captureDevice.ts');

check('normalizeApiUrl: https only, no credentials/query/fragment, no trailing slash', () => {
  assert.equal(D.normalizeApiUrl('https://recta-api.example.test/'), 'https://recta-api.example.test');
  assert.equal(D.normalizeApiUrl('  https://recta-api.example.test  '), 'https://recta-api.example.test');
  assert.equal(D.normalizeApiUrl('https://h.example.test:8443/api/'), 'https://h.example.test:8443/api');
  for (const bad of ['http://recta-api.example.test', 'ftp://x.example.test', 'https://u:p@h.example.test', 'https://h.example.test?x=1', 'https://h.example.test#f', 'nope', '', '   ', null, undefined]) {
    assert.equal(D.normalizeApiUrl(bad), null, String(bad));
  }
});

check('createDeviceBody: trimmed name (max 100) with a fallback, householdId only when given', () => {
  assert.deepEqual(D.createDeviceBody('  Celular   Exemplo ', 'hh-1'), { name: 'Celular Exemplo', householdId: 'hh-1' });
  assert.deepEqual(D.createDeviceBody('Celular Exemplo'), { name: 'Celular Exemplo' });
  assert.deepEqual(D.createDeviceBody('', null), { name: 'Android' });
  assert.deepEqual(D.createDeviceBody(undefined, undefined), { name: 'Android' });
  assert.equal(D.createDeviceBody('x'.repeat(300)).name.length, 100);
});

check('parseCreatedDevice reads { data: { id, token } } and refuses anything else', () => {
  assert.deepEqual(D.parseCreatedDevice({ success: true, data: { id: 'dev-1', token: TOKEN, name: 'x' } }), { id: 'dev-1', token: TOKEN });
  for (const bad of [null, {}, { data: {} }, { data: { id: 'dev-1' } }, { data: { token: TOKEN } }, { data: { id: 'dev-1', token: 'eyJhbGciOiJIUzI1NiJ9.e30.x' } }, { data: { id: '', token: TOKEN } }]) {
    assert.throws(() => D.parseCreatedDevice(bad), (e: Error) => e.name === 'CaptureLinkError');
  }
});

await checkAsync('linkDevice hands the normalized URL, the token and the device id to the plugin', async () => {
  const plugin = fakePlugin();
  await D.linkDevice(plugin, { apiBaseUrl: API + '/', token: TOKEN, deviceId: 'dev-1' });
  assert.deepEqual(plugin.calls, [['configure', { apiUrl: API, token: TOKEN, deviceId: 'dev-1' }]]);
});

await checkAsync('linkDevice refuses a cleartext URL or a malformed token before calling the plugin', async () => {
  const plugin = fakePlugin();
  await assert.rejects(() => D.linkDevice(plugin, { apiBaseUrl: 'http://recta-api.example.test', token: TOKEN, deviceId: 'd' }), (e: Error & { code?: string }) => e.code === 'invalid-api-url');
  await assert.rejects(() => D.linkDevice(plugin, { apiBaseUrl: undefined, token: TOKEN, deviceId: 'd' }), (e: Error & { code?: string }) => e.code === 'invalid-api-url');
  await assert.rejects(() => D.linkDevice(plugin, { apiBaseUrl: API, token: 'eyJ.jwt.value', deviceId: 'd' }), (e: Error & { code?: string }) => e.code === 'invalid-token');
  assert.deepEqual(plugin.calls, []);
});

await checkAsync('linkDevice: a plugin failure becomes plugin-failed and the message never carries the token', async () => {
  const plugin = fakePlugin({ configure: async () => { throw new Error(`boom ${TOKEN}`); } });
  await assert.rejects(
    () => D.linkDevice(plugin, { apiBaseUrl: API, token: TOKEN, deviceId: 'd' }),
    (e: Error & { code?: string }) => e.code === 'plugin-failed' && !e.message.includes(TOKEN) && !String(e.stack).includes('boom'),
  );
});

await checkAsync('unlinkDevice asks the plugin to clear the link', async () => {
  const plugin = fakePlugin();
  await D.unlinkDevice(plugin);
  assert.deepEqual(plugin.calls, [['clearLink', null]]);
});

await checkAsync('readDiagnostics: one failing call leaves only its field unknown', async () => {
  const plugin = fakePlugin({ getBatteryState: async () => { throw new Error('x'); } });
  const snap = await D.readDiagnostics(plugin);
  assert.equal(snap.batteryUnrestricted, null);
  assert.equal(snap.accessEnabled, true);
  assert.equal(snap.link.linked, true);
  assert.equal(snap.queue.sent, 3);
});

await checkAsync('readDiagnostics: every call failing gives an all-unknown snapshot', async () => {
  const fail = async () => { throw new Error('no plugin'); };
  const snap = await D.readDiagnostics({ getLinkState: fail, getNotificationAccessState: fail, getBatteryState: fail, getQueueState: fail });
  assert.deepEqual(snap, { link: null, accessEnabled: null, batteryUnrestricted: null, queue: null });
  assert.deepEqual(D.evaluateHealth(snap), [{ code: 'plugin-unavailable', level: 'error' }]);
});

check('normalizeQueue fills the optional fields and floors bad counts to 0', () => {
  assert.deepEqual(D.normalizeQueue({ pending: 2, sent: -1, rejected: NaN }), {
    pending: 2, sent: 0, rejected: 0, lastSentAt: null, lastError: null, lastErrorCode: null, lastErrorAt: null, authBlocked: false,
  });
  assert.equal(D.normalizeQueue(null), null);
});

const healthy = () => ({
  link: { linked: true, apiUrl: API, deviceId: 'd', secureStorageAvailable: true },
  accessEnabled: true,
  batteryUnrestricted: true,
  queue: D.normalizeQueue({ pending: 0, sent: 1, rejected: 0 }),
});

check('evaluateHealth: a healthy phone has no issue and status ok', () => {
  const issues = D.evaluateHealth(healthy());
  assert.deepEqual(issues, []);
  assert.equal(D.overallStatus(issues), 'ok');
});

check('evaluateHealth: access off and not linked are errors (nothing is captured or sent)', () => {
  const snap = { ...healthy(), accessEnabled: false, link: { linked: false, apiUrl: null, deviceId: null, secureStorageAvailable: true } };
  const issues = D.evaluateHealth(snap);
  assert.deepEqual(issues.map((i: { code: string }) => i.code), ['access-off', 'not-linked']);
  assert.equal(D.overallStatus(issues), 'error');
});

check('evaluateHealth: a revoked token (authBlocked or code AUTH) is an error', () => {
  for (const queue of [D.normalizeQueue({ pending: 4, authBlocked: true }), D.normalizeQueue({ pending: 4, lastErrorCode: 'AUTH' })]) {
    const issues = D.evaluateHealth({ ...healthy(), queue });
    assert.deepEqual(issues, [{ code: 'auth-revoked', level: 'error' }]);
    assert.equal(D.overallStatus(issues), 'error');
  }
});

check('evaluateHealth: battery optimization, failing sends and rejected rows are attention only', () => {
  const snap = {
    ...healthy(),
    batteryUnrestricted: false,
    queue: D.normalizeQueue({ pending: 2, rejected: 1, lastErrorCode: 'RETRY', lastError: 'HTTP 503' }),
  };
  const issues = D.evaluateHealth(snap);
  assert.deepEqual(issues.map((i: { code: string }) => i.code), ['battery-restricted', 'send-failing', 'rejected-rows']);
  assert.equal(D.overallStatus(issues), 'attention');
});

check('evaluateHealth: a retry error with nothing pending is not reported (the queue already drained)', () => {
  const issues = D.evaluateHealth({ ...healthy(), queue: D.normalizeQueue({ pending: 0, lastErrorCode: 'RETRY' }) });
  assert.deepEqual(issues, []);
});

check('evaluateHealth: errors come before attention; unavailable secure storage is an error', () => {
  const snap = {
    ...healthy(),
    batteryUnrestricted: false,
    link: { linked: true, apiUrl: API, deviceId: 'd', secureStorageAvailable: false },
  };
  assert.deepEqual(D.evaluateHealth(snap).map((i: { code: string }) => i.code), ['secure-storage', 'battery-restricted']);
});

check('formatCaptureTime: dd/MM/yyyy HH:mm, or null without a time', () => {
  const d = new Date(2026, 10, 9, 14, 5);
  assert.equal(D.formatCaptureTime(d.getTime()), '09/11/2026 14:05');
  assert.equal(D.formatCaptureTime(null), null);
  assert.equal(D.formatCaptureTime(undefined), null);
  assert.equal(D.formatCaptureTime(NaN), null);
});

console.log('\n[capture reader] utils/captureTexts.ts and the i18n files');

check('captureText: locale text first, Portuguese default when the locale lacks the key', () => {
  assert.equal(T.captureText({ captureSendNow: 'Send now' }, 'captureSendNow'), 'Send now');
  assert.equal(T.captureText({}, 'captureSendNow'), T.CAPTURE_TEXTS_PT.captureSendNow);
  assert.equal(T.captureText({ captureSendNow: '' }, 'captureSendNow'), T.CAPTURE_TEXTS_PT.captureSendNow);
  assert.equal(T.captureText(undefined, 'captureSendNow'), T.CAPTURE_TEXTS_PT.captureSendNow);
});

check('pt-BR.json has every capture text, equal to the default; en-US.json has every key too', () => {
  const pt = JSON.parse(readFileSync(frontSrc('i18n/pt-BR.json'), 'utf8'));
  const en = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'));
  for (const [key, value] of Object.entries(T.CAPTURE_TEXTS_PT)) {
    assert.equal(pt[key], value, `pt-BR ${key}`);
    assert.equal(typeof en[key], 'string', `en-US ${key}`);
    assert.ok(en[key].length > 0, `en-US ${key} empty`);
  }
});

check('every health issue code has a text key', () => {
  for (const code of ['plugin-unavailable', 'secure-storage', 'not-linked', 'access-off', 'auth-revoked', 'battery-restricted', 'send-failing', 'rejected-rows']) {
    const key = 'captureIssue' + code.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    // The component maps codes to keys explicitly; the names follow this pattern except where noted.
    const exceptions: Record<string, string> = { captureIssueAuthRevoked: 'captureIssueAuth', captureIssueBatteryRestricted: 'captureIssueBattery', captureIssueSendFailing: 'captureIssueSendFailing', captureIssueRejectedRows: 'captureIssueRejected' };
    assert.ok(T.CAPTURE_TEXTS_PT[exceptions[key] ?? key], `${code} -> ${exceptions[key] ?? key}`);
  }
});
