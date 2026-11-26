import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, checkAsync, frontSrc } from './harness.mts';

// Generic statement import (.ofx / .csv): the pure rules of utils/importStatement.ts, namely how long a confirm may take,
// why a line of the file was left out and what the user is told when a confirm fails. Invented data only.
// IMPORT_STATEMENT_MODULE points at a mutated copy of the module for the bite-checks.
const modPath = process.env.IMPORT_STATEMENT_MODULE || frontSrc('utils/importStatement.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IS: any = await import(pathToFileURL(modPath).href);

console.log('\n[generic import] utils/importStatement.ts');

check('confirmTimeoutMs: 30 s plus 100 ms per row, at most 5 minutes', () => {
  assert.equal(IS.confirmTimeoutMs(0), 30_000);
  assert.equal(IS.confirmTimeoutMs(1), 30_100);
  assert.equal(IS.confirmTimeoutMs(400), 70_000);
  assert.equal(IS.confirmTimeoutMs(1500), 180_000, '1500 rows wait 180 s, the server needs about 40 s for them');
  assert.equal(IS.confirmTimeoutMs(2700), 300_000);
  assert.equal(IS.confirmTimeoutMs(100_000), 300_000, 'never more than 5 minutes');
});

check('confirmTimeoutMs: a count that is not a positive number is the base wait', () => {
  for (const value of [Number.NaN, -5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(IS.confirmTimeoutMs(value), 30_000, String(value));
  }
  assert.equal(IS.confirmTimeoutMs(2.9), 30_200, 'a fraction of a row is not a row');
});

check('skippedReasonText: every reason the server sends has its own text, an unknown one a generic text', () => {
  const reasons = ['invalid-date', 'invalid-amount', 'ambiguous-amount', 'column-count'];
  const texts = reasons.map((reason) => IS.skippedReasonText(reason));
  assert.ok(texts.every((text: string) => text.length > 0));
  assert.equal(new Set(texts).size, reasons.length, 'four reasons, four different texts');
  assert.match(IS.skippedReasonText('ambiguous-amount'), /1\.234/, 'the ambiguous amount says what is ambiguous');
  assert.equal(IS.skippedReasonText('something-new'), 'não foi possível ler');
});

check('skippedLineLabel: a CSV has lines, an OFX has entries', () => {
  assert.equal(IS.skippedLineLabel(7, 'extrato.csv'), 'Linha 7');
  assert.equal(IS.skippedLineLabel(7, 'EXTRATO.OFX'), 'Lançamento 7');
  assert.equal(IS.skippedLineLabel(7, null), 'Linha 7');
  assert.equal(IS.skippedLineLabel(7), 'Linha 7');
});

check('skippedSummary: singular and plural', () => {
  assert.equal(IS.skippedSummary(1), '1 linha do arquivo foi ignorada');
  assert.equal(IS.skippedSummary(3), '3 linhas do arquivo foram ignoradas');
});

check('confirmFailureMessage: a timeout says the import may still be running and never "0 importadas"', () => {
  const messages = [
    new Error('Network error: Request timeout - server took too long to respond'),
    new Error('timeout of 30000ms exceeded'),
  ].map((err) => IS.confirmFailureMessage(err));
  for (const message of messages) {
    assert.equal(message, IS.IMPORT_TIMEOUT_MESSAGE);
    assert.match(message, /pode ainda estar em andamento/);
    assert.match(message, /ignora o que já entrou/);
    assert.doesNotMatch(message, /\b0\b.*importad|nenhuma.*importad/i);
  }
});

check('confirmFailureMessage: 409 means another import of the account is running; other errors keep their text', () => {
  assert.equal(IS.confirmFailureMessage(Object.assign(new Error('An import is already running for this account.'), { status: 409 })), IS.IMPORT_BUSY_MESSAGE);
  assert.match(IS.IMPORT_BUSY_MESSAGE, /em andamento nesta conta/);
  assert.equal(IS.confirmFailureMessage(Object.assign(new Error('Conta não encontrada'), { status: 404 })), 'Conta não encontrada');
  assert.equal(IS.confirmFailureMessage(new Error('')), 'Não foi possível confirmar a importação.');
  assert.equal(IS.confirmFailureMessage(null), 'Não foi possível confirmar a importação.');
  assert.equal(IS.confirmFailureMessage('x', 'outro texto'), 'outro texto');
});

// ---- The real axios client (utils/api.ts, bundled like t24 does) lets one request choose its own timeout ------------------

const frontDir = process.env.FRONTEND_DIR || fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(frontDir + '/package.json');
const esbuild = require('esbuild');
const memory = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, String(v)), removeItem: (k: string) => memory.delete(k), clear: () => memory.clear() },
  window: { location: { pathname: '/app', assign: () => undefined } },
});
const dir = mkdtempSync(join(tmpdir(), 'fe-generic-import-'));
const out = join(dir, 'bundle.mjs');
await esbuild.build({
  stdin: { contents: `export * as api from ${JSON.stringify(frontSrc('utils/api.ts'))};`, resolveDir: frontDir, loader: 'ts' },
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
const { api }: any = await import(pathToFileURL(out).href);
const timeouts: Array<number | undefined> = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
api.axiosInstance.defaults.adapter = async (config: any) => {
  timeouts.push(config.timeout);
  return { status: 200, data: { success: true, data: { imported: 1 } }, headers: {}, config, statusText: 'OK' };
};

await checkAsync('apiClient.post: a request can ask for its own timeout, and one that does not keeps the shared 30 s', async () => {
  timeouts.length = 0;
  await api.apiClient.post('/transactions/import/confirm', { accountId: 'a', rows: [] }, { timeout: 180_000 });
  await api.apiClient.post('/transactions/import/confirm', { accountId: 'a', rows: [] });
  assert.deepEqual(timeouts, [180_000, 30_000]);
});
