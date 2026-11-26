import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Início no celular (lote R5): lógica de apresentação da aba Início, abaixo de 768 px. Dados inventados.
// HOME_MOBILE_MODULE aponta para uma cópia alterada de utils/homeMobile.ts.
const hmPath = process.env.HOME_MOBILE_MODULE || frontSrc('utils/homeMobile.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const H: any = await import(pathToFileURL(hmPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const B: any = await import(pathToFileURL(frontSrc('utils/billsChecklist.ts')).href);

console.log('\n[início mobile] utils/homeMobile.ts');

const brl = (cents: number): string => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
const TODAY = '2026-11-11';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bill = (o: any = {}): any => ({
  key: 'k', kind: 'pending', source: 'pending', sourceId: 's', description: 'Luz', amountCents: 18740,
  date: '2026-11-11', dueDate: '2026-11-10', overdue: true, estimated: false, accountId: 'a', invoiceMonth: null, earlyDiscount: null, ...o,
});

// ---- sobra do mês ------------------------------------------------------------------------------------

check('monthLeftover: income minus expense in whole cents, with the share of the income that is left', () => {
  const l = H.monthLeftover(5000, 3500.1);
  assert.equal(l.cents, 149990);
  assert.equal(l.percentOfIncome, 30);
  assert.equal(l.tone, 'positive');
});

check('monthLeftover: no float drift (0.1 + 0.2 style sums)', () => {
  assert.equal(H.monthLeftover(0.3, 0.1).cents, 20);
  assert.equal(H.monthLeftover(1000.1, 0.2).cents, 99990);
});

check('monthLeftover: expenses above the income are negative and say so; no income gives no percentage', () => {
  const l = H.monthLeftover(1000, 1200.5);
  assert.equal(l.cents, -20050);
  assert.equal(l.tone, 'negative');
  assert.equal(H.monthLeftover(0, 300).percentOfIncome, null);
  assert.equal(H.monthLeftover(0, 0).tone, 'zero');
  assert.equal(H.monthLeftover(Number.NaN, undefined).cents, 0);
});

check('leftoverHint: a fact in words for each case, never advice', () => {
  assert.equal(H.leftoverHint(H.monthLeftover(5000, 3500), brl), '30% da receita do mês fica livre depois das despesas');
  assert.equal(H.leftoverHint(H.monthLeftover(1000, 1250), brl), 'As despesas passam da receita em R$ 250,00');
  assert.equal(H.leftoverHint(H.monthLeftover(0, 0), brl), 'Sem receita nem despesa lançadas no mês');
  assert.equal(H.leftoverHint(H.monthLeftover(0, 300), brl), 'Sem receita lançada no mês');
  for (const l of [H.monthLeftover(5000, 3500), H.monthLeftover(1000, 1250), H.monthLeftover(0, 300)]) {
    assert.doesNotMatch(H.leftoverHint(l, brl), /reduz|corte|sugir|recomend|economiz|deveria/i);
  }
});

// ---- contas mais usadas ------------------------------------------------------------------------------

check('accountUsage: counts the transactions of each account in the last 30 days, today included', () => {
  const tx = [
    { accountId: 'a', date: '2026-11-11T12:00:00.000Z' },
    { accountId: 'a', date: '2026-10-13' },
    { accountId: 'a', date: '2026-10-12' }, // 30 dias antes: fora
    { accountId: 'b', date: '2026-11-01' },
    { accountId: null, date: '2026-11-01' },
    { accountId: 'a', date: 'lixo' },
  ];
  const u = H.accountUsage(tx, TODAY);
  assert.equal(u.get('a'), 2);
  assert.equal(u.get('b'), 1);
  assert.equal(u.size, 2);
});

check('accountUsage: a transaction after today is not counted', () => {
  assert.equal(H.accountUsage([{ accountId: 'a', date: '2026-11-12' }], TODAY).size, 0);
});

const ACCS = [
  { id: 'a', name: 'Conta corrente', balance: 1000.5 },
  { id: 'b', name: 'Vale-alimentação', balance: 200 },
  { id: 'c', name: 'Poupança', balance: 5000 },
  { id: 'd', name: 'Carteira', balance: 30.25 },
];

check('balanceCells: up to three accounts all show, the most used first, then by name', () => {
  const usage = new Map([['b', 9], ['a', 4]]);
  const cells = H.balanceCells(ACCS.slice(0, 3), usage);
  assert.deepEqual(cells.map((c: { id: string }) => c.id), ['b', 'a', 'c']);
  assert.equal(cells.length, 3);
  assert.ok(cells.every((c: { kind: string }) => c.kind === 'account'));
});

check('balanceCells: ties in use fall back to the name, so the order never jumps between renders', () => {
  const cells = H.balanceCells(ACCS.slice(0, 3), new Map());
  assert.deepEqual(cells.map((c: { id: string }) => c.id), ['a', 'c', 'b']); // Conta corrente, Poupança, Vale-alimentação
});

check('balanceCells: with more than three, the two most used and "Mais N contas" with the sum of the others', () => {
  const usage = new Map([['b', 9], ['a', 4], ['c', 1]]);
  const cells = H.balanceCells(ACCS, usage);
  assert.equal(cells.length, 3);
  assert.deepEqual(cells.slice(0, 2).map((c: { id: string }) => c.id), ['b', 'a']);
  assert.deepEqual(cells[2], { kind: 'more', count: 2, cents: 503025 });
});

check('balanceCells: the sum of the rest is in cents without drift; negative balances count', () => {
  const cells = H.balanceCells(
    [
      { id: 'a', name: 'A', balance: 10 },
      { id: 'b', name: 'B', balance: 20 },
      { id: 'c', name: 'C', balance: 0.1 },
      { id: 'd', name: 'D', balance: 0.2 },
      { id: 'e', name: 'E', balance: -5 },
    ],
    new Map(),
  );
  assert.deepEqual(cells[2], { kind: 'more', count: 3, cents: -470 });
});

check('balanceCells: no accounts gives no cells', () => {
  assert.deepEqual(H.balanceCells([], new Map()), []);
});

// ---- situação da conta -------------------------------------------------------------------------------

check('billSituation: a single badge: Pendente until the due day, Atrasada when it passed unpaid, Paga when paid', () => {
  assert.deepEqual(H.billSituation(bill({ overdue: true })), { kind: 'overdue', label: 'Atrasada' });
  assert.deepEqual(H.billSituation(bill({ overdue: false })), { kind: 'pending', label: 'Pendente' });
  assert.deepEqual(H.billSituation(bill({ overdue: true }), true), { kind: 'paid', label: 'Paga' });
});

check('billDetail: the due day in words; an overdue one says since when; an invoice names its month', () => {
  assert.equal(H.billDetail(bill({ overdue: false, dueDate: '2026-11-15', date: '2026-11-15' })), 'Vence 15/11');
  assert.equal(H.billDetail(bill({ overdue: true, dueDate: '2026-11-10' })), 'Venceu 10/11');
  assert.equal(H.billDetail(bill({ kind: 'invoice', overdue: false, dueDate: '2026-11-12', date: '2026-11-12', invoiceMonth: '2026-11' })), 'Fatura 11/2026 · vence 12/11');
});

check('billAmountText: an estimated amount carries the ≈ in the text, not only the colour', () => {
  assert.equal(H.billAmountText(bill({ estimated: true, amountCents: 5000 }), brl), '≈ R$ 50,00');
  assert.equal(H.billAmountText(bill({ estimated: false, amountCents: 5000 }), brl), 'R$ 50,00');
});

check('billA11yName: bill, due day, situation and amount, in this order (the check box name)', () => {
  assert.equal(H.billA11yName(bill(), brl), 'Luz, vencimento 10/11, Atrasada, R$ 187,40');
  assert.equal(
    H.billA11yName(bill({ overdue: false, dueDate: '2026-11-15', date: '2026-11-15', estimated: true, description: 'Internet', amountCents: 9990 }), brl),
    'Internet, vencimento 15/11, Pendente, valor estimado R$ 99,90',
  );
  assert.equal(H.billA11yName(bill({ description: '' }), brl), 'Conta sem descrição, vencimento 10/11, Atrasada, R$ 187,40');
});

// ---- contas a pagar: ordem, contador, textos ----------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (o: any): any => ({ date: TODAY, description: 'x', amount: -10, source: 'pending', certainty: 'confirmed', overdue: false, originalDate: null, sourceId: 'id', accountId: 'a', invoiceMonth: null, ...o });

check('the list order is the checklist order: overdue first, then by due day (the Início reuses buildBills)', () => {
  const bills = B.buildBills(
    [
      ev({ date: '2026-11-20', description: 'Internet', sourceId: '1' }),
      ev({ date: TODAY, originalDate: '2026-11-05', overdue: true, description: 'Luz', sourceId: '2' }),
      ev({ date: '2026-11-15', description: 'Água', sourceId: '3' }),
    ],
    TODAY,
  );
  assert.deepEqual(bills.map((b: { description: string }) => b.description), ['Luz', 'Água', 'Internet']);
  assert.equal(H.billSituation(bills[0]).label, 'Atrasada');
  assert.equal(H.billSituation(bills[1]).label, 'Pendente');
});

check('billsHint: what is left to pay in the month, with the overdue count; all paid says so', () => {
  assert.deepEqual(H.billsHint([bill(), bill({ overdue: false }), bill({ overdue: false })], 'novembro'), { lead: 'falta pagar em novembro', overdue: '1 atrasada' });
  assert.deepEqual(H.billsHint([bill(), bill()], 'novembro'), { lead: 'falta pagar em novembro', overdue: '2 atrasadas' });
  assert.deepEqual(H.billsHint([bill({ overdue: false })], 'novembro'), { lead: 'falta pagar em novembro', overdue: null });
  assert.deepEqual(H.billsHint([], 'novembro'), { lead: 'Tudo pago em novembro', overdue: null });
});

check('paidCounterText: "N de M pagas"; nothing when there are no bills at all', () => {
  assert.equal(H.paidCounterText(1, 4), '1 de 4 pagas');
  assert.equal(H.paidCounterText(0, 0), '');
  assert.equal(H.paidCounterText(-2, 3), '0 de 3 pagas');
});

check('dayPillName: "Dia 10, 1 conta" and "Dia 10, 3 contas" (singular and plural)', () => {
  assert.equal(H.dayPillName('2026-11-10', 1), 'Dia 10, 1 conta');
  assert.equal(H.dayPillName('2026-11-10', 3), 'Dia 10, 3 contas');
});

check('overduePillName: counts the overdue bills, singular and plural', () => {
  assert.equal(H.overduePillName(1), 'Atrasadas, 1 conta');
  assert.equal(H.overduePillName(2), 'Atrasadas, 2 contas');
});

// ---- próxima fatura ----------------------------------------------------------------------------------

check('nextInvoice: the first invoice outflow, overdue first, then by day; income and other sources are ignored', () => {
  const inv = H.nextInvoice(
    [
      ev({ source: 'invoice', date: '2026-12-12', sourceId: 'c2', invoiceMonth: '2026-12', description: 'Cartão Coral', amount: -800 }),
      ev({ source: 'invoice', date: '2026-11-20', sourceId: 'c1', invoiceMonth: '2026-11', description: 'Cartão Azul', amount: -1234.56, certainty: 'expected' }),
      ev({ source: 'pending', date: '2026-11-12', description: 'Luz', amount: -5 }),
      ev({ source: 'invoice', date: '2026-11-13', sourceId: 'c3', amount: 50 }),
    ],
    TODAY,
  );
  assert.equal(inv.sourceId, 'c1');
  assert.equal(inv.description, 'Cartão Azul');
  assert.equal(inv.amountCents, 123456);
  assert.equal(inv.dueDate, '2026-11-20');
  assert.equal(inv.invoiceMonth, '2026-11');
  assert.equal(inv.estimated, false);
});

check('nextInvoice: an overdue invoice comes before a later one and uses its original due day', () => {
  const inv = H.nextInvoice(
    [
      ev({ source: 'invoice', date: '2026-11-15', sourceId: 'later', invoiceMonth: '2026-11', amount: -10 }),
      ev({ source: 'invoice', date: TODAY, overdue: true, originalDate: '2026-11-08', sourceId: 'old', invoiceMonth: '2026-10', amount: -20 }),
    ],
    TODAY,
  );
  assert.equal(inv.sourceId, 'old');
  assert.equal(inv.dueDate, '2026-11-08');
  assert.equal(inv.overdue, true);
});

check('nextInvoice: no invoice in the answer gives null; an estimated value is marked', () => {
  assert.equal(H.nextInvoice([ev({})], TODAY), null);
  assert.equal(H.nextInvoice([], TODAY), null);
  assert.equal(H.nextInvoice([ev({ source: 'invoice', amount: -9, certainty: 'estimated', sourceId: 'z' })], TODAY).estimated, true);
});

check('invoiceDueText: hoje, amanhã, a date, or "venceu" when it is past', () => {
  assert.equal(H.invoiceDueText('2026-11-11', TODAY), 'vence hoje');
  assert.equal(H.invoiceDueText('2026-11-12', TODAY), 'vence amanhã');
  assert.equal(H.invoiceDueText('2026-12-12', TODAY), 'vence 12/12');
  assert.equal(H.invoiceDueText('2026-11-08', TODAY), 'venceu 08/11');
  assert.equal(H.invoiceDueText('nope', TODAY), '');
});

// ---- faixas de aviso ---------------------------------------------------------------------------------

check('warningStrips: captures and a negative day show only when there is something to say', () => {
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null }), []);
  assert.deepEqual(H.warningStrips({ captures: Number.NaN, negativeDate: 'nope' }), []);
});

check('warningStrips: the captures strip counts them, singular and plural, and goes to the Extrato', () => {
  const [one] = H.warningStrips({ captures: 1, negativeDate: null });
  assert.equal(one.id, 'captures');
  assert.equal(one.title, '1 captura a confirmar');
  assert.equal(one.to, '/app/transactions');
  assert.equal(H.warningStrips({ captures: 3, negativeDate: null })[0].title, '3 capturas a confirmar');
});

check('warningStrips: the negative strip states the first negative day (a fact) and goes to the Fluxo', () => {
  const [neg] = H.warningStrips({ captures: 0, negativeDate: '2026-11-15' });
  assert.equal(neg.id, 'negative');
  assert.equal(neg.title, 'A conta fica negativa em 15/11');
  assert.equal(neg.to, '/app/cash-flow');
  assert.doesNotMatch(`${neg.title} ${neg.subtitle}`, /adiar|antecipar|resolve|pague|reduz|corte|sugir|recomend/i);
});

check('warningStrips: captures come first, then the negative day', () => {
  assert.deepEqual(H.warningStrips({ captures: 2, negativeDate: '2026-11-15' }).map((s: { id: string }) => s.id), ['captures', 'negative']);
});

// ---- sobra PREVISTA do mês (R5, revisão) ---------------------------------------------------------------

check('forecastPlan: a past month needs no projection; the current one asks 30 days; a future one the shortest period that reaches its end', () => {
  assert.deepEqual(H.forecastPlan(TODAY, '2026-10'), { kind: 'past' });
  assert.deepEqual(H.forecastPlan(TODAY, '2026-11'), { kind: 'flow', days: 30 });
  assert.deepEqual(H.forecastPlan(TODAY, '2026-12'), { kind: 'flow', days: 60 }); // 31/12 está a 49 dias
  assert.deepEqual(H.forecastPlan(TODAY, '2027-01'), { kind: 'flow', days: 90 }); // 31/01 está a 80 dias
});

check('forecastPlan: a month the 90 days do not reach is beyond; a bad key is treated as beyond, never a crash', () => {
  assert.deepEqual(H.forecastPlan(TODAY, '2027-02'), { kind: 'beyond' }); // 28/02 está a 108 dias
  assert.deepEqual(H.forecastPlan(TODAY, 'nope'), { kind: 'beyond' });
});

const PE = (o: object) => ev(o);

check('projectedLeftover: current month adds the recurrence, payroll and invoice events still to come; income adds, expense subtracts', () => {
  const r = H.projectedLeftover({
    income: 1000,
    expense: 400,
    today: TODAY,
    monthKey: '2026-11',
    events: [
      PE({ source: 'recurrence', date: '2026-11-20', amount: -100 }),
      PE({ source: 'recurrence', date: '2026-11-22', amount: 50 }),
      PE({ source: 'payroll', date: '2026-11-25', amount: 8400 }),
      PE({ source: 'invoice', date: '2026-11-28', amount: -500.5 }),
    ],
  });
  assert.equal(r.reach, 'forecast');
  assert.equal(r.addedIncomeCents, 845000);
  assert.equal(r.addedExpenseCents, 60050);
  assert.equal(r.leftover.cents, 100000 - 40000 + 845000 - 60050);
  assert.equal(r.leftover.incomeCents, 945000);
});

check('projectedLeftover: pending events are not added again (they are already in the month summary)', () => {
  const r = H.projectedLeftover({ income: 0, expense: 300, today: TODAY, monthKey: '2026-11', events: [PE({ source: 'pending', date: '2026-11-20', amount: -300 })] });
  assert.equal(r.addedExpenseCents, 0);
  assert.equal(r.leftover.cents, -30000);
});

check('projectedLeftover: an event of another month is ignored', () => {
  const r = H.projectedLeftover({
    income: 0,
    expense: 0,
    today: TODAY,
    monthKey: '2026-11',
    events: [PE({ source: 'recurrence', date: '2026-12-05', amount: -250 }), PE({ source: 'payroll', date: '2026-12-05', amount: 8400 })],
  });
  assert.equal(r.addedIncomeCents + r.addedExpenseCents, 0);
});

check('projectedLeftover: a future month adds only its own events, from a projection that reaches its end', () => {
  const r = H.projectedLeftover({
    income: 0,
    expense: 0,
    today: TODAY,
    monthKey: '2026-12',
    events: [PE({ source: 'recurrence', date: '2026-11-20', amount: -999 }), PE({ source: 'recurrence', date: '2026-12-10', amount: -250 }), PE({ source: 'payroll', date: '2026-12-05', amount: 8400 })],
  });
  assert.equal(r.reach, 'forecast');
  assert.equal(r.leftover.cents, 840000 - 25000);
});

check('projectedLeftover: a past month shows only what was posted, whatever the events say', () => {
  const r = H.projectedLeftover({ income: 100, expense: 40, today: TODAY, monthKey: '2026-10', events: [PE({ source: 'recurrence', date: '2026-10-20', amount: -500 })] });
  assert.equal(r.reach, 'past');
  assert.equal(r.leftover.cents, 6000);
  assert.equal(r.addedExpenseCents, 0);
});

check('projectedLeftover: a month beyond the 90 days shows only the posted amount and says so', () => {
  const r = H.projectedLeftover({ income: 100, expense: 40, today: TODAY, monthKey: '2027-02', events: [PE({ source: 'recurrence', date: '2027-02-10', amount: -500 })] });
  assert.equal(r.reach, 'beyond');
  assert.equal(r.leftover.cents, 6000);
});

check('projectedLeftover: no events (or none loaded yet) is the posted amount, with no float drift', () => {
  const r = H.projectedLeftover({ income: 0.3, expense: 0.1, today: TODAY, monthKey: '2026-11', events: [] });
  assert.equal(r.leftover.cents, 20);
});

check('leftoverTitle and leftoverNote: Saldo previsto when it includes what is to come; Sobra lançada when it cannot; facts only', () => {
  assert.equal(H.leftoverTitle('forecast'), 'Saldo previsto');
  assert.equal(H.leftoverTitle('past'), 'Sobra do mês');
  assert.equal(H.leftoverTitle('beyond'), 'Sobra lançada');
  assert.equal(H.leftoverNote('past', 'outubro', 0, 0, brl), null);
  assert.equal(H.leftoverNote('beyond', 'fevereiro de 2027', 0, 0, brl), 'A previsão não alcança fevereiro de 2027; o valor mostra só o que já foi lançado.');
  assert.equal(H.leftoverNote('forecast', 'novembro', 845000, 60050, brl), 'Inclui R$ 8450,00 de receitas e R$ 600,50 de despesas que ainda vão vencer em novembro');
  assert.equal(H.leftoverNote('forecast', 'novembro', 0, 60050, brl), 'Inclui R$ 600,50 de despesas que ainda vão vencer em novembro');
  assert.equal(H.leftoverNote('forecast', 'novembro', 0, 0, brl), 'Nada mais a vencer em novembro no fluxo de caixa');
});

// ---- linha "Guardar" (aporte de meta) no fluxo compartilhado ---------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SP: any = await import(pathToFileURL(frontSrc('utils/savingsGoalsPlan.ts')).href);

check('billName: a reserve line reads "Guardar: <meta>" (no double prefix); other lines keep their own description', () => {
  assert.equal(H.billName(bill({ kind: 'reserve', description: 'Viagem' })), 'Guardar: Viagem');
  assert.equal(H.billName(bill({ kind: 'reserve', description: 'Guardar: Viagem' })), 'Guardar: Viagem');
  assert.equal(H.billName(bill({ kind: 'reserve', description: '' })), SP.reserveText('', null));
  assert.equal(H.billName(bill({ description: 'Luz' })), 'Luz');
  assert.equal(H.billName(bill({ description: '' })), 'Conta sem descrição');
});

check('billA11yName: a reserve line is named by its "Guardar: …" text, with due day, situation and amount', () => {
  assert.equal(
    H.billA11yName(bill({ kind: 'reserve', description: 'Viagem', overdue: false, dueDate: '2026-11-20', date: '2026-11-20', amountCents: 60000 }), brl),
    'Guardar: Viagem, vencimento 20/11, Pendente, R$ 600,00',
  );
});

check('billAction: a reserve line is marked as done by the reserve action, dated on the line day (the Início reuses it)', () => {
  const a = B.billAction({ kind: 'reserve', sourceId: 'goal-1', dueDate: '2026-11-10', date: TODAY, estimated: false });
  assert.deepEqual(a, { type: 'reserve', goalId: 'goal-1', date: TODAY });
});

check('projectedLeftover: a reserve line is not added: the contribution is no entry and does not change the leftover', () => {
  const r = H.projectedLeftover({ income: 100, expense: 40, today: TODAY, monthKey: '2026-11', events: [PE({ source: 'reserve', date: '2026-11-20', amount: -600 })] });
  assert.equal(r.addedExpenseCents, 0);
  assert.equal(r.leftover.cents, 6000);
});
