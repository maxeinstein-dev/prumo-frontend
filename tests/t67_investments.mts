import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P21 L5: página Investimentos. Lógica pura de utils/investments.ts. Só dados inventados (TEST11, ABCD3, CDB Exemplo).
// INVESTMENTS_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.INVESTMENTS_MODULE || frontSrc('utils/investments.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I: any = await import(pathToFileURL(modPath).href);

console.log('\n[investimentos] utils/investments.ts');

const stock = (over = {}) => ({
  id: 'p-stock', accountId: 'acc', savingsGoalId: null, kind: 'STOCK_EXCHANGE', ticker: 'TEST11', name: 'Fundo Exemplo',
  indexer: null, rate: null, maturityDate: null, anchor: null, closedAt: null, quantity: 11, avgPrice: 10.09, costAmount: 111,
  incomeLast12Months: 8.5, currentValue: 123.4, result: 12.4, valueDate: '2026-11-06', valueMark: 'MARKET', estimated: false,
  noQuote: false, ratesCarried: false, ratesMissing: false, lastQuote: { price: 11.22, date: '2026-11-06' }, ...over,
});
const fixed = (over = {}) => ({
  id: 'p-fixed', accountId: 'acc', savingsGoalId: null, kind: 'FIXED_INCOME', ticker: null, name: 'CDB Exemplo',
  indexer: 'CDI', rate: 100, maturityDate: '2027-06-30', anchor: null, closedAt: null, quantity: null, avgPrice: null,
  costAmount: 500, incomeLast12Months: 0, currentValue: 512.34, result: 12.34, valueDate: '2026-11-25', valueMark: 'ESTIMATED',
  estimated: true, noQuote: false, ratesCarried: false, ratesMissing: false, lastQuote: null, ...over,
});

check('formatQuantity: até 6 casas, sem zeros sobrando, vírgula e milhar do pt-BR', () => {
  assert.equal(I.formatQuantity(11), '11');
  assert.equal(I.formatQuantity(0.333333), '0,333333');
  assert.equal(I.formatQuantity(10.5), '10,5');
  assert.equal(I.formatQuantity(1234.5), '1.234,5');
  assert.equal(I.formatQuantity(2.1234567), '2,123457');
  assert.equal(I.formatQuantity(0.1 + 0.2), '0,3');
  assert.equal(I.formatQuantity(0), '0');
  assert.equal(I.formatQuantity(null), '—');
  assert.equal(I.formatQuantity(undefined), '—');
});

check('indexerText: percentual do índice (CDI, Selic) e taxa ao ano (IPCA, prefixado)', () => {
  assert.equal(I.indexerText('CDI', 100), '100% do CDI');
  assert.equal(I.indexerText('CDI', 91.5), '91,5% do CDI');
  assert.equal(I.indexerText('SELIC', 100), '100% da Selic');
  assert.equal(I.indexerText('IPCA', 6.5), 'IPCA + 6,5% a.a.');
  assert.equal(I.indexerText('PREFIXED', 12), 'Prefixado 12% a.a.');
  assert.equal(I.indexerText(null, null), '');
});

check('positionMarks: "sem cotação" na bolsa, "estimado" na renda fixa, aviso de taxa repetida ou ausente', () => {
  assert.deepEqual(I.positionMarks(stock()), []);
  assert.deepEqual(I.positionMarks(stock({ noQuote: true, valueMark: 'NO_QUOTE', lastQuote: null, valueDate: null })), ['noQuote']);
  assert.deepEqual(I.positionMarks(fixed()), ['estimated']);
  assert.deepEqual(I.positionMarks(fixed({ ratesCarried: true })), ['estimated', 'ratesCarried']);
  assert.deepEqual(I.positionMarks(fixed({ ratesMissing: true })), ['estimated', 'ratesMissing']);
});

check('positionMarks: valor informado (âncora no dia) e posição encerrada não levam marca', () => {
  assert.deepEqual(I.positionMarks(fixed({ valueMark: 'ANCHOR', estimated: false })), []);
  assert.deepEqual(I.positionMarks(fixed({ valueMark: 'CLOSED', estimated: true, currentValue: 0 })), []);
});

check('valueDateInfo: cotação na bolsa, estimativa e valor informado na renda fixa; nada sem cotação', () => {
  assert.deepEqual(I.valueDateInfo(stock()), { kind: 'quote', date: '2026-11-06' });
  assert.equal(I.valueDateInfo(stock({ noQuote: true, valueMark: 'NO_QUOTE', lastQuote: null, valueDate: null })), null);
  assert.deepEqual(I.valueDateInfo(fixed()), { kind: 'estimate', date: '2026-11-25' });
  assert.deepEqual(I.valueDateInfo(fixed({ valueMark: 'ANCHOR', estimated: false })), { kind: 'anchor', date: '2026-11-25' });
  assert.equal(I.valueDateInfo(fixed({ valueMark: 'CLOSED' })), null);
});

check('shortDate: DD/MM sem deslocar o dia por fuso', () => {
  assert.equal(I.shortDate('2026-11-06'), '06/11');
  assert.equal(I.shortDate('2026-01-01'), '01/01');
  assert.equal(I.shortDate('lixo'), 'lixo');
});

check('resultTone: ganho, perda e zero', () => {
  assert.equal(I.resultTone(12.4), 'up');
  assert.equal(I.resultTone(-0.01), 'down');
  assert.equal(I.resultTone(0), 'flat');
  assert.equal(I.resultTone(null), 'flat');
});

check('splitPositions: abertas e encerradas, na ordem recebida', () => {
  const closed = stock({ id: 'c', closedAt: '2026-11-20' });
  const r = I.splitPositions([stock(), closed, fixed()]);
  assert.deepEqual(r.open.map((p: { id: string }) => p.id), ['p-stock', 'p-fixed']);
  assert.deepEqual(r.closed.map((p: { id: string }) => p.id), ['c']);
});

const GOALS = [
  { id: 'g-trip', name: 'Viagem', targetAmount: 1000, currentAmount: 623.74, remaining: 376.26 },
  { id: 'g-a', name: 'Antecipar', targetAmount: 500, currentAmount: 0 },
];

check('groupByGoal: um grupo por meta (por nome), "Sem meta" por último, cada posição no seu', () => {
  const groups = I.groupByGoal(
    [stock({ id: 's1', savingsGoalId: 'g-trip' }), fixed({ id: 'f1' }), fixed({ id: 'f2', savingsGoalId: 'g-trip' }), stock({ id: 's2', ticker: 'ABCD3', savingsGoalId: 'g-a' })],
    GOALS,
  );
  assert.deepEqual(groups.map((g: { key: string }) => g.key), ['g-a', 'g-trip', 'none']);
  assert.deepEqual(groups[1].positions.map((p: { id: string }) => p.id), ['s1', 'f2']);
  assert.deepEqual(groups[2].positions.map((p: { id: string }) => p.id), ['f1']);
  assert.equal(groups[2].goalId, null);
});

check('groupByGoal: meta mostra alvo, valor e restante do que a API mandou; restante nunca negativo', () => {
  const [g] = I.groupByGoal([stock({ savingsGoalId: 'g-trip' })], GOALS);
  assert.equal(g.goalName, 'Viagem');
  assert.equal(g.target, 1000);
  assert.equal(g.current, 623.74);
  assert.equal(g.remaining, 376.26);
  const [over] = I.groupByGoal([stock({ savingsGoalId: 'g-x' })], [{ id: 'g-x', name: 'Passou', targetAmount: 100, currentAmount: 115 }]);
  assert.equal(over.remaining, 0);
});

check('groupByGoal: o valor do grupo soma o valor atual das posições em centavos', () => {
  const [g] = I.groupByGoal([stock({ currentValue: 0.1 }), fixed({ currentValue: 0.2 })], []);
  assert.equal(g.valueTotal, 0.3);
});

check('groupByGoal: posição ligada a uma meta que a lista não trouxe vira grupo marcado, não some nem cai em "Sem meta"', () => {
  const groups = I.groupByGoal([stock({ savingsGoalId: 'g-gone' })], GOALS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].goalMissing, true);
  assert.equal(groups[0].goalId, 'g-gone');
  assert.equal(groups[0].goalName, null);
});

check('groupByGoal: dentro do grupo, bolsa antes de renda fixa e por ticker/nome', () => {
  const [g] = I.groupByGoal([fixed({ id: 'f' }), stock({ id: 'b', ticker: 'TEST11' }), stock({ id: 'a', ticker: 'ABCD3' })], []);
  assert.deepEqual(g.positions.map((p: { id: string }) => p.id), ['a', 'b', 'f']);
});

check('groupByGoal: sem posições, sem grupos', () => {
  assert.deepEqual(I.groupByGoal([], GOALS), []);
});

check('parseDecimal: vírgula ou ponto, milhar com ponto, limite de casas, sem lixo', () => {
  assert.equal(I.parseDecimal('10', 6), 10);
  assert.equal(I.parseDecimal(' 10,5 ', 6), 10.5);
  assert.equal(I.parseDecimal('10.5', 6), 10.5);
  assert.equal(I.parseDecimal('1.234,5', 6), 1234.5);
  assert.equal(I.parseDecimal('1.000.000', 6), 1000000);
  assert.equal(I.parseDecimal('0,333333', 6), 0.333333);
  assert.equal(I.parseDecimal('0', 6), 0);
  assert.equal(I.parseDecimal('', 6), null);
  assert.equal(I.parseDecimal('abc', 6), null);
  assert.equal(I.parseDecimal('-1', 6), null);
  assert.equal(I.parseDecimal('1e3', 6), null);
  assert.equal(I.parseDecimal('0x10', 6), null);
  assert.equal(I.parseDecimal('1,2345678', 6), null);
  assert.equal(I.parseDecimal('1,234', 2), null);
});

const TODAY = '2026-11-25';
const STOCK_FORM = { kind: 'STOCK_EXCHANGE', ticker: ' test11 ', name: 'Fundo Exemplo', savingsGoalId: '', indexer: 'CDI', rateText: '', maturityDate: '', openingDate: '2026-10-01', openingQuantityText: '10', openingPriceText: '10,5', openingCents: null };
const FIXED_FORM = { kind: 'FIXED_INCOME', ticker: '', name: ' CDB Exemplo ', savingsGoalId: 'g-trip', indexer: 'CDI', rateText: '100', maturityDate: '2027-06-30', openingDate: '2026-10-01', openingQuantityText: '', openingPriceText: '', openingCents: 50000 };

check('newPositionBody (bolsa): ticker em maiúsculas, abertura com quantidade e preço, meta vazia fica de fora', () => {
  assert.deepEqual(I.newPositionBody(STOCK_FORM, TODAY), {
    ok: true,
    body: { kind: 'STOCK_EXCHANGE', ticker: 'TEST11', name: 'Fundo Exemplo', opening: { date: '2026-10-01', quantity: 10, unitPrice: 10.5 } },
  });
});

check('newPositionBody (bolsa): sem nome o nome é o ticker; com meta ela vai junto', () => {
  const r = I.newPositionBody({ ...STOCK_FORM, name: ' ', savingsGoalId: 'g-trip' }, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.body.name, 'TEST11');
  assert.equal(r.body.savingsGoalId, 'g-trip');
});

check('newPositionBody (bolsa): campos de renda fixa nunca vão no corpo; sem saldo inicial não manda opening', () => {
  const r = I.newPositionBody({ ...STOCK_FORM, openingQuantityText: '', openingPriceText: '' }, TODAY);
  assert.equal(r.ok, true);
  assert.equal('opening' in r.body, false);
  for (const k of ['indexer', 'rate', 'maturityDate', 'anchor']) assert.equal(k in r.body, false, k);
});

check('newPositionBody (bolsa): ticker vazio ou com símbolo, quantidade ou preço faltando, data futura', () => {
  assert.deepEqual(I.newPositionBody({ ...STOCK_FORM, ticker: '' }, TODAY), { ok: false, errors: { ticker: 'ticker' } });
  assert.deepEqual(I.newPositionBody({ ...STOCK_FORM, ticker: 'TE$T' }, TODAY), { ok: false, errors: { ticker: 'ticker' } });
  assert.deepEqual(I.newPositionBody({ ...STOCK_FORM, openingPriceText: '' }, TODAY), { ok: false, errors: { openingPrice: 'price' } });
  assert.deepEqual(I.newPositionBody({ ...STOCK_FORM, openingQuantityText: '', openingPriceText: '10' }, TODAY), { ok: false, errors: { openingQuantity: 'quantity' } });
  assert.deepEqual(I.newPositionBody({ ...STOCK_FORM, openingQuantityText: '0' }, TODAY), { ok: false, errors: { openingQuantity: 'quantity' } });
  assert.deepEqual(I.newPositionBody({ ...STOCK_FORM, openingDate: '2026-12-01' }, TODAY), { ok: false, errors: { openingDate: 'future' } });
  assert.deepEqual(I.newPositionBody({ ...STOCK_FORM, openingDate: '2026-02-30' }, TODAY), { ok: false, errors: { openingDate: 'date' } });
});

check('newPositionBody (renda fixa): nome, indexador, taxa, vencimento e saldo inicial só com valor', () => {
  assert.deepEqual(I.newPositionBody(FIXED_FORM, TODAY), {
    ok: true,
    body: {
      kind: 'FIXED_INCOME', name: 'CDB Exemplo', savingsGoalId: 'g-trip', indexer: 'CDI', rate: 100, maturityDate: '2027-06-30',
      opening: { date: '2026-10-01', amount: 500 },
    },
  });
});

check('newPositionBody (renda fixa): nunca manda ticker, quantidade nem preço; vencimento vazio fica de fora', () => {
  const r = I.newPositionBody({ ...FIXED_FORM, ticker: 'TEST11', openingQuantityText: '3', openingPriceText: '9', maturityDate: '' }, TODAY);
  assert.equal(r.ok, true);
  assert.equal('ticker' in r.body, false);
  assert.equal('maturityDate' in r.body, false);
  assert.deepEqual(Object.keys(r.body.opening).sort(), ['amount', 'date']);
});

check('newPositionBody (renda fixa): nome, taxa e vencimento inválidos, valor zero', () => {
  assert.deepEqual(I.newPositionBody({ ...FIXED_FORM, name: ' ' }, TODAY), { ok: false, errors: { name: 'name' } });
  assert.deepEqual(I.newPositionBody({ ...FIXED_FORM, rateText: '' }, TODAY), { ok: false, errors: { rate: 'rate' } });
  assert.deepEqual(I.newPositionBody({ ...FIXED_FORM, rateText: '0' }, TODAY), { ok: false, errors: { rate: 'rate' } });
  assert.deepEqual(I.newPositionBody({ ...FIXED_FORM, indexer: 'XYZ' }, TODAY), { ok: false, errors: { indexer: 'indexer' } });
  assert.deepEqual(I.newPositionBody({ ...FIXED_FORM, maturityDate: '2027-13-01' }, TODAY), { ok: false, errors: { maturityDate: 'date' } });
  assert.deepEqual(I.newPositionBody({ ...FIXED_FORM, openingCents: 0 }, TODAY), { ok: false, errors: { openingAmount: 'amount' } });
});

check('newPositionBody: taxa com vírgula (91,5) vira número', () => {
  const r = I.newPositionBody({ ...FIXED_FORM, rateText: '91,5' }, TODAY);
  assert.equal(r.body.rate, 91.5);
});

const MOVE = { type: 'BUY', date: '2026-11-25', quantityText: '1', priceText: '11', amountCents: null, notes: '' };

check('movementBody (bolsa, compra): quantidade e preço; com valor total manda o valor e deixa o preço de fora', () => {
  assert.deepEqual(I.movementBody('STOCK_EXCHANGE', MOVE, TODAY), { ok: true, body: { type: 'BUY', date: '2026-11-25', quantity: 1, unitPrice: 11 } });
  assert.deepEqual(
    I.movementBody('STOCK_EXCHANGE', { ...MOVE, priceText: '11', amountCents: 1100 }, TODAY),
    { ok: true, body: { type: 'BUY', date: '2026-11-25', quantity: 1, amount: 11 } },
  );
  assert.deepEqual(
    I.movementBody('STOCK_EXCHANGE', { ...MOVE, type: 'SELL', quantityText: '0,5', priceText: '' , amountCents: 551 }, TODAY),
    { ok: true, body: { type: 'SELL', date: '2026-11-25', quantity: 0.5, amount: 5.51 } },
  );
});

check('movementBody (bolsa): compra sem quantidade, sem preço nem valor, ou com quantidade zero é recusada', () => {
  assert.deepEqual(I.movementBody('STOCK_EXCHANGE', { ...MOVE, quantityText: '' }, TODAY), { ok: false, errors: { quantity: 'quantity' } });
  assert.deepEqual(I.movementBody('STOCK_EXCHANGE', { ...MOVE, quantityText: '0' }, TODAY), { ok: false, errors: { quantity: 'quantity' } });
  assert.deepEqual(I.movementBody('STOCK_EXCHANGE', { ...MOVE, priceText: '' }, TODAY), { ok: false, errors: { price: 'priceOrAmount' } });
  assert.deepEqual(I.movementBody('STOCK_EXCHANGE', { ...MOVE, priceText: 'abc' }, TODAY), { ok: false, errors: { price: 'priceOrAmount' } });
});

check('movementBody (bolsa, provento): só valor; quantidade e preço digitados não vão no corpo', () => {
  assert.deepEqual(
    I.movementBody('STOCK_EXCHANGE', { ...MOVE, type: 'INCOME', quantityText: '5', priceText: '2', amountCents: 850 }, TODAY),
    { ok: true, body: { type: 'INCOME', date: '2026-11-25', amount: 8.5 } },
  );
  assert.deepEqual(I.movementBody('STOCK_EXCHANGE', { ...MOVE, type: 'INCOME', amountCents: null }, TODAY), { ok: false, errors: { amount: 'amount' } });
  assert.deepEqual(I.movementBody('STOCK_EXCHANGE', { ...MOVE, type: 'INCOME', amountCents: 0 }, TODAY), { ok: false, errors: { amount: 'amount' } });
});

check('movementBody (renda fixa): só valor em qualquer tipo; quantidade e preço nunca vão (a API dá 400)', () => {
  assert.deepEqual(
    I.movementBody('FIXED_INCOME', { ...MOVE, type: 'SELL', quantityText: '3', priceText: '9', amountCents: 20000 }, TODAY),
    { ok: true, body: { type: 'SELL', date: '2026-11-25', amount: 200 } },
  );
  assert.deepEqual(I.movementBody('FIXED_INCOME', { ...MOVE, amountCents: null }, TODAY), { ok: false, errors: { amount: 'amount' } });
});

check('movementBody: data inválida, futura; observação aparada, vazia some, passa de 255 recusa', () => {
  assert.deepEqual(I.movementBody('FIXED_INCOME', { ...MOVE, amountCents: 100, date: '' }, TODAY), { ok: false, errors: { date: 'date' } });
  assert.deepEqual(I.movementBody('FIXED_INCOME', { ...MOVE, amountCents: 100, date: '2026-11-26' }, TODAY), { ok: false, errors: { date: 'future' } });
  assert.deepEqual(I.movementBody('FIXED_INCOME', { ...MOVE, amountCents: 100, notes: '  reforço  ' }, TODAY), { ok: true, body: { type: 'BUY', date: '2026-11-25', amount: 1, notes: 'reforço' } });
  assert.deepEqual(I.movementBody('FIXED_INCOME', { ...MOVE, amountCents: 100, notes: 'x'.repeat(256) }, TODAY), { ok: false, errors: { notes: 'notes' } });
});

check('movementBody: reúne todos os erros, não só o primeiro', () => {
  const r = I.movementBody('STOCK_EXCHANGE', { ...MOVE, date: '2026-11-26', quantityText: '', priceText: '' }, TODAY);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['date', 'price', 'quantity']);
});

check('anchorBody: valor informado numa data (não pode ser zero nem futuro) ou apagar com null', () => {
  assert.deepEqual(I.anchorBody({ date: '2026-11-20', cents: 51234 }, TODAY), { ok: true, body: { anchor: { amount: 512.34, date: '2026-11-20' } } });
  assert.deepEqual(I.anchorBody({ date: '2026-11-20', cents: 0 }, TODAY), { ok: false, errors: { amount: 'amount' } });
  assert.deepEqual(I.anchorBody({ date: '2026-11-20', cents: null }, TODAY), { ok: false, errors: { amount: 'amount' } });
  assert.deepEqual(I.anchorBody({ date: '2026-11-26', cents: 100 }, TODAY), { ok: false, errors: { date: 'future' } });
  assert.deepEqual(I.anchorBody({ date: 'x', cents: 100 }, TODAY), { ok: false, errors: { date: 'date' } });
  assert.deepEqual(I.clearAnchorBody(), { anchor: null });
});

check('corpos de ligar/desligar meta e de encerrar posição', () => {
  assert.deepEqual(I.goalLinkBody('g-trip'), { savingsGoalId: 'g-trip' });
  assert.deepEqual(I.goalLinkBody(''), { savingsGoalId: null });
  assert.deepEqual(I.goalLinkBody(null), { savingsGoalId: null });
  assert.deepEqual(I.closeBody(), { closed: true });
});

check('movementTypeOptions: compra/venda/provento na bolsa; aplicação/resgate na renda fixa', () => {
  assert.deepEqual(I.movementTypeOptions('STOCK_EXCHANGE'), [
    { value: 'BUY', label: 'Compra' }, { value: 'SELL', label: 'Venda' }, { value: 'INCOME', label: 'Provento' },
  ]);
  assert.deepEqual(I.movementTypeOptions('FIXED_INCOME'), [
    { value: 'BUY', label: 'Aplicação' }, { value: 'SELL', label: 'Resgate' },
  ]);
  assert.equal(I.movementTypeLabel('STOCK_EXCHANGE', 'OPENING'), 'Saldo inicial');
  assert.equal(I.movementTypeLabel('FIXED_INCOME', 'SELL'), 'Resgate');
  assert.equal(I.movementTypeLabel('STOCK_EXCHANGE', 'INCOME'), 'Provento');
});

check('movementEffect: compra tira dinheiro da corretora, venda e provento põem, saldo inicial não mexe', () => {
  assert.equal(I.movementEffect('BUY'), 'out');
  assert.equal(I.movementEffect('SELL'), 'in');
  assert.equal(I.movementEffect('INCOME'), 'in');
  assert.equal(I.movementEffect('OPENING'), 'none');
});

check('investmentErrorText: encerrar com cotas ou valor aplicado explica que é preciso vender ou resgatar tudo', () => {
  const text = I.investmentErrorText('close', { status: 400, message: 'qualquer texto em inglês' });
  assert.match(text, /vend/i);
  assert.match(text, /resgat/i);
  assert.doesNotMatch(text, /inglês/);
});

check('investmentErrorText: apagar movimento que sustenta uma venda posterior', () => {
  const text = I.investmentErrorText('deleteMovement', { status: 400, message: 'Deleting this movement would leave a later sale without the holding it needs' });
  assert.match(text, /venda posterior/i);
});

check('investmentErrorText: venda acima do que há, posição encerrada, conta inativa', () => {
  assert.match(I.investmentErrorText('movement', { status: 400, message: 'Cannot sell more than the position holds' }), /maior do que/i);
  assert.match(I.investmentErrorText('movement', { status: 400, message: 'Position is closed' }), /encerrada/i);
  assert.match(I.investmentErrorText('createPosition', { status: 400, message: 'Account is inactive' }), /inativa/i);
});

check('investmentErrorText: 409 de ticker repetido e de movimento repetido', () => {
  assert.match(I.investmentErrorText('createPosition', { status: 409, message: 'Open position with the same ticker' }), /já existe/i);
  assert.match(I.investmentErrorText('movement', { status: 409, message: 'sourceRef' }), /já foi registrado/i);
});

check('investmentErrorText: 403 pede papel de editor; 404 diz que sumiu; sem status usa a mensagem de rede', () => {
  assert.match(I.investmentErrorText('movement', { status: 403, message: 'Forbidden' }), /editor/i);
  assert.match(I.investmentErrorText('link', { status: 404, message: 'Savings goal not found' }), /não existe|não foi encontrad/i);
  assert.equal(I.investmentErrorText('movement', { message: 'Sem conexão com o servidor.' }), 'Sem conexão com o servidor.');
  assert.match(I.investmentErrorText('movement', {}), /tente de novo/i);
});

check('investmentErrorText: 400 desconhecido nunca devolve o texto em inglês do servidor', () => {
  const text = I.investmentErrorText('movement', { status: 400, message: 'Some brand new english validation' });
  assert.doesNotMatch(text, /english/i);
  assert.match(text, /confira/i);
});

check('pickInvestmentAccount: só ativa do tipo INVESTMENT; sem id a primeira; id que não existe dá null', () => {
  const accounts = [
    { id: 'a', name: 'Conta', type: 'CHECKING', isActive: true },
    { id: 'b', name: 'Corretora Exemplo', type: 'INVESTMENT', isActive: true },
    { id: 'c', name: 'Corretora Velha', type: 'INVESTMENT', isActive: false },
    { id: 'd', name: 'Outra Corretora', type: 'INVESTMENT', isActive: true },
  ];
  assert.equal(I.pickInvestmentAccount(accounts, undefined).account.id, 'b');
  assert.deepEqual(I.pickInvestmentAccount(accounts, undefined).options.map((a: { id: string }) => a.id), ['b', 'd']);
  assert.equal(I.pickInvestmentAccount(accounts, 'd').account.id, 'd');
  assert.equal(I.pickInvestmentAccount(accounts, 'a').account, null);
  assert.equal(I.pickInvestmentAccount(accounts, 'c').account, null);
  assert.equal(I.pickInvestmentAccount([], undefined).account, null);
});

check('hasPositions: a conta leva à página nova quando tem posição (aberta ou encerrada)', () => {
  assert.equal(I.hasPositions({ positions: [stock()] }), true);
  assert.equal(I.hasPositions({ positions: [stock({ closedAt: '2026-11-20' })] }), true);
  assert.equal(I.hasPositions({ positions: [] }), false);
  assert.equal(I.hasPositions(undefined), false);
  assert.equal(I.hasPositions(null), false);
});

check('valuationAccounts: o formulário de valor digitado só lista as contas sem posição', () => {
  const accounts = [{ id: 'b', name: 'Corretora Exemplo' }, { id: 'd', name: 'Outra Corretora' }];
  assert.deepEqual(I.valuationAccounts(accounts, new Set(['b'])).map((a: { id: string }) => a.id), ['d']);
  assert.deepEqual(I.valuationAccounts(accounts, new Set()).map((a: { id: string }) => a.id), ['b', 'd']);
  assert.deepEqual(I.valuationAccounts(accounts, new Set(['b', 'd'])), []);
});

check('investmentsPath: rota da página, da conta e da posição', () => {
  assert.equal(I.investmentsPath(), '/app/investments');
  assert.equal(I.investmentsPath('acc-1'), '/app/investments/acc-1');
  assert.equal(I.investmentsPath('acc-1', 'pos-1'), '/app/investments/acc-1/pos-1');
});

check('apiErrorParts: status e mensagem do erro do cliente da API; qualquer outra coisa vira vazio', () => {
  const err = Object.assign(new Error('Position is closed'), { status: 400 });
  assert.deepEqual(I.apiErrorParts(err), { status: 400, message: 'Position is closed' });
  assert.deepEqual(I.apiErrorParts(new Error('Sem conexão com o servidor.')), { status: undefined, message: 'Sem conexão com o servidor.' });
  assert.deepEqual(I.apiErrorParts('texto'), {});
  assert.deepEqual(I.apiErrorParts(null), {});
  assert.deepEqual(I.apiErrorParts({ status: '400' }), {});
});
