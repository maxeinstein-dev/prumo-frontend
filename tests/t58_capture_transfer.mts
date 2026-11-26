import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P16 (15/11/2026): Pix entre contas próprias como uma transferência, e a captura repetida. Lógica pura de
// utils/captureTransfer.ts. Dados inventados. CAPTURE_TRANSFER_MODULE aponta para uma cópia alterada (sabotagem).
const modPath = process.env.CAPTURE_TRANSFER_MODULE || frontSrc('utils/captureTransfer.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(modPath).href);

console.log('\n[transferência entre contas] utils/captureTransfer.ts');

const MP_ACC = 'acc-mp';
const NU_ACC = 'acc-nu';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const item = (o: any = {}): any => ({
  id: 'out-1', package: 'com.mercadopago.wallet', title: 'Seu Pix foi enviado', text: 'O Pix de R$ 10.00 foi feito para MARIA.',
  postedAt: '2026-11-15T13:01:00.000Z', status: 'PENDING', parsed: { kind: 'PIX_OUT', amountCents: 1000 }, transactionId: null,
  suggestion: { type: 'EXPENSE', accountId: MP_ACC, categoryName: null, amount: 10, description: 'MARIA', date: '2026-11-15T13:01:00.000Z' },
  transferPair: { captureId: 'in-1', side: 'out', partnerAccountId: NU_ACC },
  ...o,
});
const incoming = (o: object = {}) => item({
  id: 'in-1', package: 'com.nu.production', parsed: { kind: 'PIX_IN', amountCents: 1000, warning: 'POSSIBLE_OWN_TRANSFER' },
  suggestion: { type: 'INCOME', accountId: NU_ACC, categoryName: null, amount: 10, description: 'Transferência recebida', date: '2026-11-15T13:01:30.000Z' },
  transferPair: { captureId: 'out-1', side: 'in', partnerAccountId: MP_ACC },
  ...o,
});

check('transferPairOf: the pair the server sent, or null for anything malformed', () => {
  assert.deepEqual(S.transferPairOf(item()), { captureId: 'in-1', side: 'out', partnerAccountId: NU_ACC });
  assert.equal(S.transferPairOf(item({ transferPair: null })), null);
  assert.equal(S.transferPairOf(item({ transferPair: undefined })), null);
  assert.equal(S.transferPairOf(item({ transferPair: { captureId: 'x', side: 'sideways', partnerAccountId: null } })), null);
  assert.equal(S.transferPairOf(item({ status: 'DISMISSED' })), null);
});

check('transferAccounts: from the outflow side to the income side, whichever side the card is', () => {
  assert.deepEqual(S.transferAccounts(item()), { fromAccountId: MP_ACC, toAccountId: NU_ACC });
  assert.deepEqual(S.transferAccounts(incoming()), { fromAccountId: MP_ACC, toAccountId: NU_ACC });
  assert.deepEqual(S.transferAccounts(item({ suggestion: { ...item().suggestion, accountId: null } })), { fromAccountId: null, toAccountId: NU_ACC });
});

check('transferBody: the body of POST /captures/transfer, with the out and in ids in their places and the local day', () => {
  const result = S.transferBody(incoming(), { fromAccountId: MP_ACC, toAccountId: NU_ACC });
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, { outCaptureId: 'out-1', inCaptureId: 'in-1', fromAccountId: MP_ACC, toAccountId: NU_ACC, amount: 10, date: '2026-11-15' });
  assert.deepEqual(Object.keys(result.body).sort(), ['amount', 'date', 'fromAccountId', 'inCaptureId', 'outCaptureId', 'toAccountId']);
});

check('transferBody: says what is missing: an account, the same account twice, or the amount', () => {
  assert.deepEqual(S.transferBody(item(), { fromAccountId: null, toAccountId: NU_ACC }), { ok: false, missing: ['from'] });
  assert.deepEqual(S.transferBody(item(), { fromAccountId: '', toAccountId: '' }), { ok: false, missing: ['from', 'to'] });
  assert.deepEqual(S.transferBody(item(), { fromAccountId: MP_ACC, toAccountId: MP_ACC }), { ok: false, missing: ['same'] });
  assert.deepEqual(S.transferBody(item({ suggestion: { ...item().suggestion, amount: null } }), { fromAccountId: MP_ACC, toAccountId: NU_ACC }), { ok: false, missing: ['amount'] });
  assert.deepEqual(S.transferBody(item({ transferPair: null }), { fromAccountId: MP_ACC, toAccountId: NU_ACC }), { ok: false, missing: ['pair'] });
});

check('hiddenPairSides: the income side is hidden when its outflow is on the list too, so the pair shows once', () => {
  assert.deepEqual([...S.hiddenPairSides([item(), incoming()])], ['in-1']);
  assert.deepEqual([...S.hiddenPairSides([incoming()])], []);
  assert.deepEqual([...S.hiddenPairSides([item(), incoming({ transferPair: null })])], []);
});

check('duplicateNote: why a capture was dismissed as the repeat of another notification of the same Pix', () => {
  assert.match(S.duplicateNote(item({ status: 'DISMISSED', parsed: { kind: 'WALLET_PIX_OUT', amountCents: 1000, duplicateOf: 'x' } })), /repetid/i);
  assert.equal(S.duplicateNote(item({ status: 'DISMISSED', parsed: { kind: 'PIX_OUT', amountCents: 1000 } })), null);
  assert.equal(S.duplicateNote(item({ status: 'DISMISSED', parsed: null })), null);
});
