import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// "Ajustar saldo" (utils/adjustBalance.ts): the currency mask in integer cents, the reason that follows the date, the
// validation and the request body. ADJUST_BALANCE_MODULE points at a mutated copy for the bite-checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const A: Any = await import(pathToFileURL(process.env.ADJUST_BALANCE_MODULE || frontSrc('utils/adjustBalance.ts')).href);

const NOW = new Date(2026, 9, 6, 15, 30); // 06/10/2026
const money = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

console.log('\n[AB] ajustar saldo');

check('AB-a: the mask fills from the right in integer cents ("438902" is 4.389,02) and drops leading zeros', () => {
  assert.deepEqual(A.maskMoneyInput('438902'), { cents: 438902, display: 'R$ 4.389,02' });
  assert.deepEqual(A.maskMoneyInput('R$ 4.389,02'), { cents: 438902, display: 'R$ 4.389,02' }, 'its own output parses back to the same value');
  assert.deepEqual(A.maskMoneyInput('5'), { cents: 5, display: 'R$ 0,05' });
  assert.deepEqual(A.maskMoneyInput('R$ 0,005'), { cents: 5, display: 'R$ 0,05' });
  assert.deepEqual(A.maskMoneyInput('000'), { cents: 0, display: 'R$ 0,00' });
  assert.deepEqual(A.maskMoneyInput('123456789'), { cents: 123456789, display: 'R$ 1.234.567,89' });
});

check('AB-b: empty or letters-only is "nothing typed" (null), not zero', () => {
  assert.deepEqual(A.maskMoneyInput(''), { cents: null, display: '' });
  assert.deepEqual(A.maskMoneyInput('abc'), { cents: null, display: '' });
  assert.deepEqual(A.maskMoneyInput('-'), { cents: null, display: '-' });
});

check('AB-c: a minus sign anywhere makes it negative; "-0" stays zero', () => {
  assert.deepEqual(A.maskMoneyInput('-1000'), { cents: -1000, display: '-R$ 10,00' });
  assert.deepEqual(A.maskMoneyInput('1000-'), { cents: -1000, display: '-R$ 10,00' });
  assert.deepEqual(A.maskMoneyInput('-R$ 10,0'), { cents: -100, display: '-R$ 1,00' }, 'backspace on a negative value');
  assert.equal(A.maskMoneyInput('-0').cents, 0);
});

check('AB-d: more than 12 digits are cut (the server limit is far above), integer cents always', () => {
  const r = A.maskMoneyInput('1234567890123456');
  assert.equal(r.cents, 123456789012);
  assert.ok(Number.isInteger(r.cents));
  assert.equal(r.display, 'R$ 1.234.567.890,12');
});

check('AB-e: centsToMaskedText and reaisToCents round trip (4271.65 * 100 is 427164.99999999994 in floats)', () => {
  assert.equal(A.reaisToCents(4271.65), 427165);
  assert.equal(A.reaisToCents(4389.02), 438902);
  assert.equal(A.reaisToCents(-10.1), -1010);
  assert.equal(A.reaisToCents(0.29), 29, '0.29 * 100 is 28.999999999999996');
  assert.equal(A.reaisToCents(1.15), 115, '1.15 * 100 is 114.99999999999999');
  assert.equal(A.reaisToCents(-0.29), -29);
  assert.equal(A.reaisToCents(Number.NaN), 0);
  assert.equal(A.centsToMaskedText(438902), 'R$ 4.389,02');
  assert.equal(A.centsToMaskedText(-1), '-R$ 0,01');
});

check('AB-f: dates: valid calendar days only, dd/mm/yyyy without a timezone shift, last day of the previous year', () => {
  assert.equal(A.isValidIsoDate('2025-12-31'), true);
  assert.equal(A.isValidIsoDate('2024-02-29'), true);
  for (const bad of ['2025-02-30', '2025-13-01', '31/12/2025', '2025-1-1', '', '2025-12-31T00:00:00Z']) assert.equal(A.isValidIsoDate(bad), false, bad);
  assert.equal(A.formatIsoDate('2025-12-31'), '31/12/2025');
  assert.equal(A.lastDayOfPreviousYear(NOW), '2025-12-31');
  assert.equal(A.lastDayOfPreviousYear(new Date(2027, 0, 1)), '2026-12-31');
  assert.equal(A.todayIsoDate(new Date(2026, 0, 1, 0, 5)), '2026-01-01', 'local time, not UTC');
  assert.equal(A.todayIsoDate(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

check('AB-g: the reason is "Saldo inicial" for a date before the current year, "Ajuste de saldo" otherwise', () => {
  assert.equal(A.defaultAdjustReason('2025-12-31', NOW), 'Saldo inicial');
  assert.equal(A.defaultAdjustReason('2020-03-01', NOW), 'Saldo inicial');
  assert.equal(A.defaultAdjustReason('2026-01-01', NOW), 'Ajuste de saldo', 'the first day of this year is already this year');
  assert.equal(A.defaultAdjustReason('2026-10-06', NOW), 'Ajuste de saldo');
  assert.equal(A.defaultAdjustReason('', NOW), 'Ajuste de saldo');
  assert.equal(A.defaultAdjustReason('2025-02-30', NOW), 'Ajuste de saldo', 'an impossible day is not an opening balance');
});

check('AB-h: validation: target required, zero difference refused, date required / real / not in the future', () => {
  const ok = { currentCents: 427165, targetCents: 438902, date: '2025-12-31', reason: 'Saldo inicial' };
  assert.deepEqual(A.validateAdjust(ok, NOW), { ok: true, differenceCents: 11737, errors: {} });
  assert.equal(A.validateAdjust({ ...ok, targetCents: null }, NOW).errors.target, 'Informe o saldo correto da conta.');
  assert.equal(A.validateAdjust({ ...ok, targetCents: null }, NOW).differenceCents, null);
  const same = A.validateAdjust({ ...ok, targetCents: 427165 }, NOW);
  assert.equal(same.ok, false);
  assert.equal(same.differenceCents, 0);
  assert.match(same.errors.target, /não há o que ajustar/);
  assert.equal(A.validateAdjust({ ...ok, date: '' }, NOW).errors.date, 'Informe a data do ajuste.');
  assert.equal(A.validateAdjust({ ...ok, date: '2025-02-30' }, NOW).errors.date, 'Data inválida.');
  assert.equal(A.validateAdjust({ ...ok, date: '2026-10-07' }, NOW).errors.date, 'A data não pode ser no futuro.');
  assert.equal(A.validateAdjust({ ...ok, date: '2026-10-06' }, NOW).ok, true, 'today is allowed');
  assert.equal(A.validateAdjust({ ...ok, reason: 'x'.repeat(256) }, NOW).ok, false);
  assert.equal(A.validateAdjust({ ...ok, reason: 'x'.repeat(255) }, NOW).ok, true);
  assert.equal(A.validateAdjust({ ...ok, reason: ' '.repeat(300) }, NOW).ok, true, 'blank reason is trimmed and defaulted');
});

check('AB-i: a negative target and a lower balance give a negative difference', () => {
  const r = A.validateAdjust({ currentCents: 1000, targetCents: -500, date: '2026-10-06', reason: '' }, NOW);
  assert.equal(r.differenceCents, -1500);
  assert.equal(r.ok, true);
});

check('AB-j: the request body: wire number = cents / 100, date as typed, trimmed reason, default reason when blank', () => {
  const base = { currentCents: 427165, targetCents: 438902, date: '2025-12-31', reason: '  Saldo inicial ' };
  assert.deepEqual(A.buildAdjustBody(base, NOW), { newBalance: 4389.02, date: '2025-12-31', reason: 'Saldo inicial' });
  assert.deepEqual(A.buildAdjustBody({ ...base, reason: '   ' }, NOW), { newBalance: 4389.02, date: '2025-12-31', reason: 'Saldo inicial' });
  assert.deepEqual(A.buildAdjustBody({ ...base, date: '2026-10-06', reason: '' }, NOW), { newBalance: 4389.02, date: '2026-10-06', reason: 'Ajuste de saldo' });
  assert.deepEqual(A.buildAdjustBody({ ...base, targetCents: -5 }, NOW), { newBalance: -0.05, date: '2025-12-31', reason: 'Saldo inicial' });
  assert.equal(Math.round(A.buildAdjustBody(base, NOW).newBalance * 100), 438902);
});

check('AB-k: no body for anything that does not validate', () => {
  const base = { currentCents: 427165, targetCents: 438902, date: '2025-12-31', reason: '' };
  assert.equal(A.buildAdjustBody({ ...base, targetCents: null }, NOW), null);
  assert.equal(A.buildAdjustBody({ ...base, targetCents: 427165 }, NOW), null, 'nothing to adjust');
  assert.equal(A.buildAdjustBody({ ...base, date: '2026-10-07' }, NOW), null);
  assert.equal(A.buildAdjustBody({ ...base, date: '' }, NOW), null);
});

check('AB-l: the sentence names the entry: income for a higher target, expense for a lower one', () => {
  assert.equal(A.describeAdjustment(11737, money), 'uma entrada de R$ 117.37');
  assert.equal(A.describeAdjustment(-1000, money), 'uma saída de R$ 10.00');
});
