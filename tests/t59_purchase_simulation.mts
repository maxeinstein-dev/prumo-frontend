import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P20 L2: simulador de compra parcelada. Lógica pura de utils/purchaseSimulation.ts (a conta é do servidor; aqui só
// montar o pedido e escrever o que veio). Dados inventados. PURCHASE_SIMULATION_MODULE aponta para uma cópia alterada.
const modPath = process.env.PURCHASE_SIMULATION_MODULE || frontSrc('utils/purchaseSimulation.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(modPath).href);

console.log('\n[t59] simulador de compra parcelada');

const money = (v: number): string => `R$ ${v.toFixed(2).replace('.', ',')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const month = (o: any): any => ({ month: '2026-12', committed: 1000, committedPosted: 1000, committedForecast: 0, postedByCategory: {}, newInstallment: 100, total: 1100, expectedIncome: 5000, leftover: 3900, leftoverWithoutPurchase: 4000, ...o });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sim = (o: any = {}): any => ({
  firstMonth: '2026-12',
  installments: [100],
  months: [month({ month: '2026-11', newInstallment: 0, total: 1000, leftover: 4000 }), month({})],
  hasExpectedIncome: true,
  tightest: { month: '2026-12', leftover: 3900, leftoverWithoutPurchase: 4000 },
  budgetOverruns: [],
  averageExpense: { months: 6, amount: 1200 },
  ...o,
});

check('amount text: Brazilian and plain formats, to cents; zero, negative and junk are refused', () => {
  assert.equal(S.parseAmountText('1.234,56'), 1234.56);
  assert.equal(S.parseAmountText('1234,5'), 1234.5);
  assert.equal(S.parseAmountText('1234.56'), 1234.56);
  assert.equal(S.parseAmountText('R$ 100'), 100);
  assert.equal(S.parseAmountText('1.200'), 1200);
  assert.equal(S.parseAmountText('0,10'), 0.1);
  for (const bad of ['', '  ', '0', '-5', 'abc', '1,234,56', '10,999']) assert.equal(S.parseAmountText(bad), null, bad);
});

check('request: sends only what was filled, the installments as a whole number', () => {
  const r = S.simulationRequest({ amount: '1.200,00', installments: '12', accountId: '', categoryName: '', firstMonth: '' }, 'hh-1');
  assert.deepEqual(r, { ok: true, body: { householdId: 'hh-1', totalAmount: 1200, installments: 12 } });
  const full = S.simulationRequest({ amount: '600', installments: 3, accountId: 'acc-1', categoryName: 'ELECTRONICS', firstMonth: '2027-01' }, 'hh-1');
  assert.deepEqual(full, { ok: true, body: { householdId: 'hh-1', totalAmount: 600, installments: 3, accountId: 'acc-1', categoryName: 'ELECTRONICS', firstMonth: '2027-01' } });
});

check('request: refuses a missing amount, 0 and 25 installments, and an amount below a cent per installment', () => {
  assert.deepEqual(S.simulationRequest({ amount: '', installments: 12 }, 'hh'), { ok: false, error: 'amount' });
  assert.deepEqual(S.simulationRequest({ amount: '100', installments: 0 }, 'hh'), { ok: false, error: 'installments' });
  assert.deepEqual(S.simulationRequest({ amount: '100', installments: 25 }, 'hh'), { ok: false, error: 'installments' });
  assert.deepEqual(S.simulationRequest({ amount: '100', installments: 2.5 }, 'hh'), { ok: false, error: 'installments' });
  assert.deepEqual(S.simulationRequest({ amount: '0,05', installments: 6 }, 'hh'), { ok: false, error: 'tooSmall' });
  assert.equal(S.simulationRequest({ amount: '100', installments: 24 }, 'hh').ok, true);
  assert.equal(S.simulationRequest({ amount: '100', installments: 1 }, 'hh').ok, true);
});

check('month label: short month and year, crossing the year', () => {
  assert.equal(S.monthLabel('2026-12'), 'dez/2026');
  assert.equal(S.monthLabel('2027-01'), 'jan/2027');
  assert.equal(S.monthLabel('2026-03'), 'mar/2026');
});

check('the shortcuts are 3, 6, 10 and 12', () => {
  assert.deepEqual([...S.INSTALLMENT_SHORTCUTS], [3, 6, 10, 12]);
});

check('rows: the month with the new installment is marked, and a month that breaks a budget is red', () => {
  const rows = S.simulationRows(sim({ budgetOverruns: [{ month: '2026-12', scope: 'GENERAL', categoryName: 'GENERAL', limit: 1050, projected: 1100, withoutPurchase: 1000 }] }));
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].hasInstallment, rows[1].hasInstallment], [false, true]);
  assert.deepEqual([rows[0].overBudget, rows[1].overBudget], [false, true]);
  assert.equal(rows[1].label, 'dez/2026');
  assert.equal(rows[1].leftoverNegative, false);
});

check('rows: a negative leftover is flagged on its own, apart from the budget', () => {
  const rows = S.simulationRows(sim({ months: [month({ leftover: -50 })] }));
  assert.equal(rows[0].leftoverNegative, true);
  assert.equal(rows[0].overBudget, false);
});

check('tightest sentence: the month, the leftover and what it would be without the purchase', () => {
  const s = S.simulationSummary(sim(), money);
  assert.equal(s.tightest, 'O mês mais apertado é dez/2026: sobra R$ 3900,00 (sem a compra seria R$ 4000,00).');
});

check('tightest sentence: a negative leftover says it is missing, not that it is left', () => {
  const s = S.simulationSummary(sim({ tightest: { month: '2026-12', leftover: -250.5, leftoverWithoutPurchase: 100 } }), money);
  assert.equal(s.tightest, 'O mês mais apertado é dez/2026: faltam R$ 250,50 (sem a compra seria R$ 100,00).');
});

check('income note: says it is an estimate, and without income says none was found', () => {
  const none = S.simulationSummary(sim({ hasExpectedIncome: false }), money);
  assert.match(none.incomeNote, /Nenhuma receita prevista/);
  const ok = S.simulationSummary(sim(), money);
  assert.match(ok.incomeNote, /estimativa/i);
});

check('budget overruns, one line each, saying what it would be without the purchase', () => {
  const s = S.simulationSummary(sim({
    budgetOverruns: [
      { month: '2026-12', scope: 'GENERAL', categoryName: 'GENERAL', limit: 2000, projected: 2200, withoutPurchase: 1800 },
      { month: '2027-01', scope: 'CATEGORY', categoryName: 'Eletrônicos', limit: 700, projected: 800, withoutPurchase: 300 },
    ],
  }), money);
  assert.equal(s.overruns.length, 2);
  assert.match(s.overruns[0], /dez\/2026.*orçamento geral.*R\$ 2200,00.*R\$ 2000,00.*sem a compra.*R\$ 1800,00/);
  assert.match(s.overruns[1], /jan\/2027.*Eletrônicos.*R\$ 800,00.*R\$ 700,00/);
  assert.deepEqual(S.simulationSummary(sim(), money).overruns, []);
});

check('average: the average of the last 6 months and the tightest total against it', () => {
  const s = S.simulationSummary(sim({ months: [month({ total: 1500 })] }), money);
  assert.equal(s.average, 'Média de despesa dos últimos 6 meses: R$ 1200,00. Com a compra, dez/2026 fica R$ 300,00 acima.');
  const below = S.simulationSummary(sim({ months: [month({ total: 1100 })] }), money);
  assert.match(below.average, /R\$ 100,00 abaixo/);
  const none = S.simulationSummary(sim({ averageExpense: { months: 6, amount: 0 } }), money);
  assert.equal(none.average, null);
});

check('no tightest month: no sentence', () => {
  assert.equal(S.simulationSummary(sim({ tightest: null }), money).tightest, null);
});

check('request: my part of a purchase that will be split goes as ownSharePercent; empty or 100 sends nothing', () => {
  const base = { amount: '600', installments: 3 };
  assert.deepEqual(S.simulationRequest({ ...base, ownShare: '50' }, 'hh').body, { householdId: 'hh', totalAmount: 600, installments: 3, ownSharePercent: 50 });
  assert.equal(S.simulationRequest({ ...base, ownShare: '33,33' }, 'hh').body.ownSharePercent, 33.33);
  assert.equal('ownSharePercent' in S.simulationRequest({ ...base, ownShare: '' }, 'hh').body, false);
  assert.equal('ownSharePercent' in S.simulationRequest({ ...base, ownShare: '100' }, 'hh').body, false);
  for (const bad of ['0', '101', '33,333', 'metade', '-10']) {
    assert.deepEqual(S.simulationRequest({ ...base, ownShare: bad }, 'hh'), { ok: false, error: 'ownShare' }, bad);
  }
  assert.ok(S.SIMULATOR_ERRORS.ownShare);
});

check('summary: a split purchase says only my part counts; a whole one says nothing', () => {
  assert.equal(S.simulationSummary(sim({ ownSharePercent: 100 }), money).share, null);
  assert.equal(S.simulationSummary(sim({}), money).share, null, 'an older answer without the field');
  assert.match(S.simulationSummary(sim({ ownSharePercent: 50 }), money).share, /só a sua parte \(50%\)/i);
});

check('budget overruns name the category as the screens do, never the internal CUSTOM:<id>', () => {
  const over = { month: '2026-12', scope: 'CATEGORY', categoryName: 'CUSTOM:abc', limit: 500, projected: 600, withoutPurchase: 400 };
  const lines = S.simulationSummary(sim({ budgetOverruns: [over] }), money, (name: string) => (name === 'CUSTOM:abc' ? 'Casa' : name)).overruns;
  assert.match(lines[0], /orçamento de Casa/);
  const unnamed = S.simulationSummary(sim({ budgetOverruns: [over] }), money, () => '').overruns;
  assert.ok(!unnamed[0].includes('CUSTOM:'), unnamed[0]);
});
