import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P22 L3: "Parcelada em" na confirmação da captura. Lógica pura de utils/captureInstallments.ts. Só dados inventados.
// CAPTURE_INSTALLMENTS_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.CAPTURE_INSTALLMENTS_MODULE || frontSrc('utils/captureInstallments.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = await import(pathToFileURL(modPath).href);

console.log('\n[captura parcelada] utils/captureInstallments.ts');

const BODY = { type: 'EXPENSE', accountId: 'card', categoryName: 'SHOPPING', amount: 100, date: '2026-03-10', paid: true };

check('installmentsAllowed: only an expense on a credit card', () => {
  assert.equal(P.installmentsAllowed('EXPENSE', 'CREDIT'), true);
  assert.equal(P.installmentsAllowed('INCOME', 'CREDIT'), false);
  assert.equal(P.installmentsAllowed('EXPENSE', 'CHECKING'), false);
  assert.equal(P.installmentsAllowed(null, 'CREDIT'), false);
  assert.equal(P.installmentsAllowed('EXPENSE', undefined), false);
});

check('installmentOptions: à vista, then 2x to 24x', () => {
  const options = P.installmentOptions();
  assert.equal(options.length, 24);
  assert.deepEqual(options[0], { value: '1', label: 'À vista' });
  assert.deepEqual(options[1], { value: '2', label: '2x' });
  assert.deepEqual(options[23], { value: '24', label: '24x' });
});

check('splitCents: equal parts in cents, the leftover cents in the first (the server rule)', () => {
  assert.deepEqual(P.splitCents(10000, 3), [3334, 3333, 3333]);
  assert.deepEqual(P.splitCents(10000, 7), [1432, 1428, 1428, 1428, 1428, 1428, 1428]);
  assert.deepEqual(P.splitCents(9000, 3), [3000, 3000, 3000]);
});

check('installmentHint: says the value of each part, and of the first when it differs', () => {
  assert.equal(P.installmentHint(100, 3, null), '3x: a primeira de R$ 33,34 e as outras de R$ 33,33');
  assert.equal(P.installmentHint(90, 3, null), '3x de R$ 30,00');
  assert.equal(P.installmentHint(100, 3, 35.5), '3x de R$ 35,50 (total R$ 106,50)');
  assert.equal(P.installmentHint(100, 1, null), null);
  assert.equal(P.installmentHint(null, 3, null), null);
});

check('withInstallments: à vista or not allowed leaves the body as it was', () => {
  assert.deepEqual(P.withInstallments(BODY, { count: 1, accountType: 'CREDIT', installmentAmount: null }), { ok: true, body: BODY });
  assert.deepEqual(P.withInstallments(BODY, { count: 3, accountType: 'CHECKING', installmentAmount: null }), { ok: true, body: BODY });
  assert.deepEqual(P.withInstallments({ ...BODY, type: 'INCOME' }, { count: 3, accountType: 'CREDIT', installmentAmount: null }), { ok: true, body: { ...BODY, type: 'INCOME' } });
});

check('withInstallments: 2x or more sends installments; the amount stays the total', () => {
  assert.deepEqual(P.withInstallments(BODY, { count: 3, accountType: 'CREDIT', installmentAmount: null }), { ok: true, body: { ...BODY, installments: 3 } });
});

check('withInstallments: a corrected part value goes as installmentAmount, in cents precision', () => {
  assert.deepEqual(
    P.withInstallments(BODY, { count: 3, accountType: 'CREDIT', installmentAmount: 33.333 }),
    { ok: true, body: { ...BODY, installments: 3, installmentAmount: 33.33 } },
  );
});

check('withInstallments: refuses a total too small to split and a part value of zero', () => {
  assert.deepEqual(P.withInstallments({ ...BODY, amount: 0.02 }, { count: 3, accountType: 'CREDIT', installmentAmount: null }), { ok: false, reason: 'tooSmall' });
  assert.deepEqual(P.withInstallments(BODY, { count: 3, accountType: 'CREDIT', installmentAmount: 0.001 }), { ok: false, reason: 'partAmount' });
});

check('withInstallments: never sends more than 24 parts', () => {
  assert.deepEqual(P.withInstallments(BODY, { count: 30, accountType: 'CREDIT', installmentAmount: null }), { ok: true, body: { ...BODY, installments: 24 } });
});
