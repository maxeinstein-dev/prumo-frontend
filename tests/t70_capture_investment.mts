import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P21 L7: an XP draft (suggestion.investment) becomes an investment movement through POST /captures/:id/confirm-investment,
// never a transaction. Pure logic of utils/captureInvestment.ts. CAPTURE_INVESTMENT_MODULE points at a mutated copy.
// Tickers, amounts and ids are invented.
const modPath = process.env.CAPTURE_INVESTMENT_MODULE || frontSrc('utils/captureInvestment.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I: any = await import(pathToFileURL(modPath).href);

console.log('\n[XP drafts] utils/captureInvestment.ts');

const TODAY = '2026-11-26';
const income = {
  movementType: 'INCOME', ticker: 'TEST11', amount: 7.77, date: '2026-11-24', quantity: null, quote: null,
  positions: [{ id: 'pos-1', accountId: 'acc-inv', name: 'Fundo Exemplo' }], pairedNotice: null,
};
const buy = {
  movementType: 'BUY', ticker: 'TEST11', amount: 12.34, date: '2026-11-24', quantity: 4,
  quote: { price: 3.5, date: '2026-11-23' }, positions: [{ id: 'pos-1', accountId: 'acc-inv', name: 'Fundo Exemplo' }],
  pairedNotice: { captureId: 'cap-n', amount: 20.5, announcedDate: '2026-11-24' },
};
const capture = (investment: unknown) => ({ id: 'cap-1', package: 'br.com.xp.carteira', suggestion: { type: null, investment } });
const ACCOUNTS = [{ id: 'acc-inv', name: 'Corretora Exemplo' }];

check('investmentOf: only an XP draft has one; any other capture gives null', () => {
  assert.deepEqual(I.investmentOf(capture(income)), income);
  assert.equal(I.investmentOf({ id: 'c', package: 'com.nu.production', suggestion: { type: 'EXPENSE' } }), null);
  assert.equal(I.investmentOf({ id: 'c', package: 'br.com.xp.carteira', suggestion: { type: null, investment: null } }), null);
  assert.equal(I.isInvestmentDraft(capture(buy)), true);
  assert.equal(I.isInvestmentDraft({ id: 'c', suggestion: {} }), false);
});

check('investmentTitle: a dividend and a reinvestment read differently, with the ticker', () => {
  assert.equal(I.investmentTitle(income), 'Provento de TEST11');
  assert.equal(I.investmentTitle(buy), 'Reinvestimento em TEST11');
});

check('defaultInvestmentDraft: the only open position is picked; amount, date and the suggested quantity come filled', () => {
  assert.deepEqual(I.defaultInvestmentDraft(income, ACCOUNTS), {
    target: 'position:pos-1', amountText: '7,77', date: '2026-11-24', quantityText: '',
  });
  assert.deepEqual(I.defaultInvestmentDraft(buy, ACCOUNTS), {
    target: 'position:pos-1', amountText: '12,34', date: '2026-11-24', quantityText: '4',
  });
});

check('defaultInvestmentDraft: no position and one investment account = create it there; two positions or accounts = choose', () => {
  assert.equal(I.defaultInvestmentDraft({ ...income, positions: [] }, ACCOUNTS).target, 'new:acc-inv');
  assert.equal(I.defaultInvestmentDraft({ ...income, positions: [] }, [...ACCOUNTS, { id: 'acc-2', name: 'Outra' }]).target, '');
  assert.equal(I.defaultInvestmentDraft({ ...income, positions: [] }, []).target, '');
  const two = [{ id: 'pos-1', accountId: 'acc-inv', name: 'A' }, { id: 'pos-2', accountId: 'acc-2', name: 'B' }];
  assert.equal(I.defaultInvestmentDraft({ ...income, positions: two }, ACCOUNTS).target, '');
  assert.equal(I.defaultInvestmentDraft({ ...buy, quantity: null }, ACCOUNTS).quantityText, '', 'no quote: no suggested quantity');
});

check('targetOptions: open positions first, then "create in <account>" for each investment account', () => {
  assert.deepEqual(I.targetOptions(buy, ACCOUNTS), [
    { value: 'position:pos-1', label: 'Fundo Exemplo (posição existente)' },
    { value: 'new:acc-inv', label: 'Nova posição TEST11 em Corretora Exemplo' },
  ]);
});

check('validate: a dividend needs a target, an amount > 0 with up to 2 decimals and a day that is not in the future', () => {
  const ok = I.validateInvestmentDraft({ target: 'position:pos-1', amountText: '7,77', date: '2026-11-24', quantityText: '' }, income, TODAY);
  assert.deepEqual(ok, { ok: true, errors: {} });
  const bad = I.validateInvestmentDraft({ target: '', amountText: '0', date: '2026-11-27', quantityText: '' }, income, TODAY);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['amount', 'date', 'target']);
  assert.equal(I.validateInvestmentDraft({ target: 'position:pos-1', amountText: '7,777', date: TODAY, quantityText: '' }, income, TODAY).errors.amount !== undefined, true);
  assert.equal(I.validateInvestmentDraft({ target: 'position:pos-1', amountText: '7,77', date: '', quantityText: '' }, income, TODAY).errors.date !== undefined, true);
});

check('validate: a reinvestment needs a quantity > 0 (up to 6 decimals); a dividend never takes one', () => {
  const base = { target: 'position:pos-1', amountText: '12,34', date: '2026-11-24' };
  assert.equal(I.validateInvestmentDraft({ ...base, quantityText: '' }, buy, TODAY).errors.quantity !== undefined, true);
  assert.equal(I.validateInvestmentDraft({ ...base, quantityText: '0' }, buy, TODAY).errors.quantity !== undefined, true);
  assert.equal(I.validateInvestmentDraft({ ...base, quantityText: '1,1234567' }, buy, TODAY).errors.quantity !== undefined, true);
  assert.equal(I.validateInvestmentDraft({ ...base, quantityText: '3,5' }, buy, TODAY).ok, true);
  assert.equal(I.validateInvestmentDraft({ ...base, quantityText: '4' }, income, TODAY).ok, true, 'the field is ignored for a dividend');
});

check('buildConfirmInvestmentBody: exactly the fields the strict schema takes (position, dividend: no quantity)', () => {
  assert.deepEqual(
    I.buildConfirmInvestmentBody({ target: 'position:pos-1', amountText: '7,77', date: '2026-11-24', quantityText: '9' }, income, TODAY),
    { positionId: 'pos-1', date: '2026-11-24', amount: 7.77 },
  );
});

check('buildConfirmInvestmentBody: a reinvestment carries the quantity; a new position goes as newPosition with the account', () => {
  assert.deepEqual(
    I.buildConfirmInvestmentBody({ target: 'position:pos-1', amountText: '1.234,50', date: '2026-11-24', quantityText: '3,5' }, buy, TODAY),
    { positionId: 'pos-1', date: '2026-11-24', amount: 1234.5, quantity: 3.5 },
  );
  assert.deepEqual(
    I.buildConfirmInvestmentBody({ target: 'new:acc-inv', amountText: '12,34', date: '2026-11-24', quantityText: '4' }, buy, TODAY),
    { newPosition: { accountId: 'acc-inv' }, date: '2026-11-24', amount: 12.34, quantity: 4 },
  );
  assert.equal(I.buildConfirmInvestmentBody({ target: '', amountText: '12,34', date: '2026-11-24', quantityText: '4' }, buy, TODAY), null, 'invalid: no body');
});

check('confirmInvestmentError: the server answers in Portuguese for the cases the contract names', () => {
  assert.match(I.confirmInvestmentError(409, 'position'), /já existe uma posição aberta/i);
  assert.match(I.confirmInvestmentError(409, 'other'), /já foi/i);
  assert.match(I.confirmInvestmentError(400, 'x'), /não foi aceita/i);
  assert.match(I.confirmInvestmentError(500, 'x'), /tente de novo/i);
});

check('studyExpiresText: the day a study notification is deleted, in dd/MM/yyyy', () => {
  assert.equal(I.studyExpiresText('2027-01-25T13:00:00.000Z'), 'Apagada em 25/01/2027');
  assert.equal(I.studyExpiresText('lixo'), '');
});

const INBOX: any = await import(pathToFileURL(frontSrc('utils/captureInbox.ts')).href); // eslint-disable-line @typescript-eslint/no-explicit-any

check('appLabel: XP has a label but no account rules (the rules screen stays app by kind for the banks only)', () => {
  assert.equal(INBOX.appLabel('br.com.xp.carteira'), 'XP');
  assert.equal(INBOX.CAPTURE_APPS.some((app: { package: string }) => app.package === 'br.com.xp.carteira'), false);
  assert.equal(INBOX.appLabel('com.desconhecido'), 'com.desconhecido');
});
