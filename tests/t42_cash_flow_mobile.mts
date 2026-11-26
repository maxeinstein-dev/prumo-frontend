import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Fluxo no celular (lote R4): o aviso só de fatos (primeiro dia negativo, pior dia com quanto falta, dia em que volta
// ao positivo) e o cabeçalho do dia. Dados inventados. CASH_FLOW_MOBILE_MODULE aponta para uma cópia alterada do módulo.
const cfmPath = process.env.CASH_FLOW_MOBILE_MODULE || frontSrc('utils/cashFlowMobile.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M: any = await import(pathToFileURL(cfmPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(frontSrc('utils/cashFlowTexts.ts')).href);

console.log('\n[fluxo mobile] utils/cashFlowMobile.ts');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pt = (date: string, balance: number): any => ({ date, balance, net: 0, hasEvents: false });
// Valor formatado de mentira, só para o teste ver qual número entrou no texto.
const fmt = (v: number): string => `R$ ${v.toFixed(2).replace('.', ',')}`;
const text = (line: { key: string; vars: Record<string, string> }): string => T.cashFlowText(undefined, line.key, line.vars);

// Saldo que fica negativo no dia 15, pior no dia 20 (faltam 953,55) e volta ao positivo no dia 30.
const RETURNS = [
  pt('2026-11-10', 100),
  pt('2026-11-14', 80),
  pt('2026-11-15', -51.65),
  pt('2026-11-18', -300),
  pt('2026-11-20', -953.55),
  pt('2026-11-25', -100),
  pt('2026-11-30', 200),
];

// ---- o que é fato --------------------------------------------------------------------------------------

check('cashFlowWarningFacts: no warning when the balance never goes below zero (zero is not negative)', () => {
  assert.equal(M.cashFlowWarningFacts([pt('2026-11-10', 10), pt('2026-11-11', 0), pt('2026-11-12', 5)]), null);
  assert.equal(M.cashFlowWarningFacts([]), null);
});

check('cashFlowWarningFacts: first negative day, worst day with the amount short, and the day it is positive again', () => {
  const f = M.cashFlowWarningFacts(RETURNS);
  assert.equal(f.negativeDate, '2026-11-15');
  assert.equal(f.worstDate, '2026-11-20');
  assert.equal(f.missing, 953.55);
  assert.equal(f.backDate, '2026-11-30');
  assert.equal(f.endDate, '2026-11-30');
});

check('cashFlowWarningFacts: stays negative to the end of the period, so there is no day it comes back', () => {
  const f = M.cashFlowWarningFacts([pt('2026-11-10', 50), pt('2026-11-11', -20), pt('2026-11-12', -70)]);
  assert.equal(f.negativeDate, '2026-11-11');
  assert.equal(f.worstDate, '2026-11-12');
  assert.equal(f.missing, 70);
  assert.equal(f.backDate, null);
  assert.equal(f.endDate, '2026-11-12');
});

check('cashFlowWarningFacts: back to zero counts as back to positive (the rule of the projection: balance >= 0)', () => {
  const f = M.cashFlowWarningFacts([pt('2026-11-10', -5), pt('2026-11-11', -10), pt('2026-11-12', 0)]);
  assert.equal(f.backDate, '2026-11-12');
});

check('cashFlowWarningFacts: the back day is the first one after the worst day, not an earlier positive day', () => {
  const f = M.cashFlowWarningFacts([
    pt('2026-11-10', -5),
    pt('2026-11-11', 40),
    pt('2026-11-12', -200),
    pt('2026-11-13', -10),
    pt('2026-11-14', 300),
  ]);
  assert.equal(f.negativeDate, '2026-11-10');
  assert.equal(f.worstDate, '2026-11-12');
  assert.equal(f.backDate, '2026-11-14');
});

check('cashFlowWarningFacts: a tie for the worst balance names the earliest day', () => {
  const f = M.cashFlowWarningFacts([pt('2026-11-11', -20), pt('2026-11-12', 5), pt('2026-11-13', -20), pt('2026-11-14', 9)]);
  assert.equal(f.worstDate, '2026-11-11');
});

check('cashFlowWarningFacts: the amount short is in whole cents, with no float noise', () => {
  const f = M.cashFlowWarningFacts([pt('2026-11-10', -(0.1 + 0.2))]);
  assert.equal(f.missing, 0.3);
});

// ---- as frases do aviso --------------------------------------------------------------------------------

check('cashFlowWarningLines: the three facts in order, with the dates and the amount short', () => {
  const lines = M.cashFlowWarningLines(M.cashFlowWarningFacts(RETURNS), fmt);
  assert.deepEqual(lines, [
    { key: 'cashFlowWarnNegativeFrom', vars: { date: '15/11' } },
    { key: 'cashFlowWarnWorst', vars: { date: '20/11', amount: 'R$ 953,55' } },
    { key: 'cashFlowWarnBackPositive', vars: { date: '30/11' } },
  ]);
});

check('cashFlowWarningLines: when it stays negative, the last line says so, with the last day of the period', () => {
  const lines = M.cashFlowWarningLines(M.cashFlowWarningFacts([pt('2026-11-11', -20), pt('2026-11-12', -70)]), fmt);
  assert.deepEqual(lines.map((l: { key: string }) => l.key), ['cashFlowWarnNegativeFrom', 'cashFlowWarnWorst', 'cashFlowWarnStaysNegative']);
  assert.deepEqual(lines[2].vars, { date: '12/11' });
});

check('cashFlowWarningLines: no facts, no lines', () => {
  assert.deepEqual(M.cashFlowWarningLines(null, fmt), []);
});

check('the Portuguese sentences of the warning, as the screen shows them', () => {
  assert.equal(text({ key: 'cashFlowWarnNegativeFrom', vars: { date: '15/11' } }), 'A conta fica negativa em 15/11.');
  assert.equal(text({ key: 'cashFlowWarnWorst', vars: { date: '20/11', amount: 'R$ 953,55' } }), 'O pior dia é 20/11, quando faltam R$ 953,55.');
  assert.equal(text({ key: 'cashFlowWarnBackPositive', vars: { date: '30/11' } }), 'O saldo volta ao positivo em 30/11.');
  assert.equal(text({ key: 'cashFlowWarnStaysNegative', vars: { date: '30/11' } }), 'O saldo não volta ao positivo até 30/11.');
});

check('the warning gives facts only: no sentence of the warning suggests a way out', () => {
  const all = ['cashFlowWarnNegativeFrom', 'cashFlowWarnWorst', 'cashFlowWarnBackPositive', 'cashFlowWarnStaysNegative'];
  for (const key of all) {
    assert.doesNotMatch(T.CASH_FLOW_TEXTS_PT[key], /adiar|antecipar|resolve|pague|reduz|corte|sugir|recomend/i, key);
  }
});

// ---- cabeçalho do dia ----------------------------------------------------------------------------------

check('dayHeadingLabel: today reads "Hoje, dd/mm"; any other day its weekday in Portuguese, capitalised', () => {
  assert.equal(M.dayHeadingLabel('2026-11-10', '2026-11-10', 'Hoje'), 'Hoje, 10/11');
  assert.equal(M.dayHeadingLabel('2026-11-15', '2026-11-10', 'Hoje'), 'Dom, 15/11');
  assert.equal(M.dayHeadingLabel('2026-11-20', '2026-11-10', 'Hoje'), 'Sex, 20/11');
  assert.equal(M.dayHeadingLabel('2026-11-30', '2026-11-10', 'Hoje'), 'Seg, 30/11');
});

check('dayHeadingLabel: a day that is not a day key gives an empty label, never "NaN"', () => {
  assert.equal(M.dayHeadingLabel('nope', '2026-11-10', 'Hoje'), '');
});
