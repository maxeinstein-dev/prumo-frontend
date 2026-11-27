import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P25 L2c: the savings ("cofrinhos") part of Settings > Open Finance (src/utils/openFinanceSavings.ts), the sync line
// of each connection, and the "Open Finance" label of its drafts in the captures box. Invented names and values only.
const S_PATH = process.env.OPEN_FINANCE_SAVINGS_MODULE || frontSrc('utils/openFinanceSavings.ts');
const I_PATH = process.env.CAPTURE_INBOX_MODULE || frontSrc('utils/captureInbox.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(S_PATH).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I: any = await import(pathToFileURL(I_PATH).href);

const SERVER = [
  { name: 'Cofrinho Azul', aliases: ['Reserva Antiga'], inPrumo: true, approxCents: 51230, asOf: '2026-11-27' },
  { name: 'Cofrinho Pai', aliases: [], inPrumo: false, approxCents: null, asOf: null },
];

console.log('\n[open finance savings] utils/openFinanceSavings.ts, captureInbox appLabel');

check('appLabel: Open Finance drafts show as "Open Finance"', () => {
  assert.equal(I.appLabel('open-finance'), 'Open Finance');
});

check('draftFromSavings: rows the screen edits (aliases joined, balance in reais with comma, empty when unknown)', () => {
  assert.deepEqual(S.draftFromSavings(SERVER), [
    { name: 'Cofrinho Azul', aliases: 'Reserva Antiga', inPrumo: true, balance: '512,30', asOf: '2026-11-27' },
    { name: 'Cofrinho Pai', aliases: '', inPrumo: false, balance: '', asOf: '' },
  ]);
});

check('buildSavingsBody: back to the PUT body (aliases split, balance in reais, empty = null)', () => {
  const rows = [
    { name: ' Cofrinho Azul ', aliases: 'Reserva Antiga, , Outro Nome ', inPrumo: true, balance: '38.250,75', asOf: '2026-11-26' },
    { name: 'Cofrinho Pai', aliases: '', inPrumo: false, balance: '', asOf: '' },
  ];
  assert.deepEqual(S.buildSavingsBody(rows), {
    savings: [
      { name: 'Cofrinho Azul', aliases: ['Reserva Antiga', 'Outro Nome'], inPrumo: true, approxBalance: 38250.75, balanceAsOf: '2026-11-26' },
      { name: 'Cofrinho Pai', aliases: [], inPrumo: false, approxBalance: null, balanceAsOf: null },
    ],
  });
});

check('savingsError: blocks an empty name, a balance without its day (or the day alone), a bad number and a repeated name', () => {
  const ok = { name: 'A', aliases: '', inPrumo: true, balance: '', asOf: '' };
  assert.equal(S.savingsError([ok]), null);
  assert.match(S.savingsError([{ ...ok, name: '  ' }]), /nome/i);
  assert.match(S.savingsError([{ ...ok, balance: '10,00' }]), /data/i);
  assert.match(S.savingsError([{ ...ok, asOf: '2026-11-27' }]), /saldo/i);
  assert.match(S.savingsError([{ ...ok, balance: 'dez', asOf: '2026-11-27' }]), /saldo/i);
  assert.match(S.savingsError([ok, { ...ok, name: 'B', aliases: 'á' }]), /repetido/i);
});

check('isSavingsChanged: false for what the server has, true after an edit', () => {
  const draft = S.draftFromSavings(SERVER);
  assert.equal(S.isSavingsChanged(draft, SERVER), false);
  assert.equal(S.isSavingsChanged([{ ...draft[0], balance: '500,00' }, draft[1]], SERVER), true);
  assert.equal(S.isSavingsChanged([draft[0]], SERVER), true);
});

check('syncText: when the import last read the connection, or that it has not yet', () => {
  const at = new Date(2026, 10, 28, 10, 5).toISOString();
  assert.equal(S.syncText({ lastSyncAt: at, lastError: null }), 'Lido pela importação em 28/11/2026 10:05');
  assert.equal(S.syncText({ lastSyncAt: null, lastError: null }), 'Ainda não lido pela importação diária');
});
