import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Leitor de notificações (P01, lote D1c): src/utils/captureReading.ts. What the screen shows of a reading (amount in
// reais as the server sent it, type, merchant, suggested account, card ending, warning), the one-tap confirm body
// (value, type and account filled; the category falls back to "Outras despesas/receitas" because the server never
// suggests one), the reparse summary and the card-ending rules (draft, validation, PUT body).
// CAPTURE_READING_MODULE points at a mutated copy. Invented data only.
const R: any = await import(
  pathToFileURL(process.env.CAPTURE_READING_MODULE || frontSrc('utils/captureReading.ts')).href
);

const NU = 'com.nu.production';
const MP = 'com.mercadopago.wallet';

function suggestion(over: Record<string, unknown> = {}): any {
  return {
    type: 'EXPENSE', accountId: 'acc-1', categoryName: null, amount: 42.9, description: 'Padaria inventada',
    date: '2026-11-10T15:30:00.000Z', cardLast4: '1234', warning: null, ...over,
  };
}

function item(over: Record<string, unknown> = {}, sug: Record<string, unknown> = {}): any {
  return {
    id: 'cap-1', package: NU, title: 'Compra no crédito aprovada', text: 'texto inventado', postedAt: '2026-11-10T15:30:00.000Z',
    status: 'PENDING', transactionId: null,
    parsed: { kind: 'CARD_PURCHASE', amountCents: 4290, merchant: 'PADARIA INVENTADA', method: 'CREDIT', cardLast4: '1234', installments: null },
    suggestion: suggestion(sug), ...over,
  };
}

check('CR-a: the reading shows the server amount in reais as it came (never recomputed from the cents)', () => {
  // Server and parsed disagree on purpose: the screen must show the suggestion, not cents/100 of its own.
  const r = R.readingOf(item({ parsed: { amountCents: 1 } }, { amount: 42.9 }));
  assert.equal(r.amount, 42.9);
  assert.equal(R.readingOf(item({}, { amount: null })).amount, null);
});

check('CR-b: merchant only from the reading (a description is not a merchant); the title falls back to the description; card ending only when 4 digits', () => {
  assert.equal(R.readingOf(item()).merchant, 'PADARIA INVENTADA');
  assert.equal(R.readingOf(item()).title, 'PADARIA INVENTADA');
  assert.equal(R.readingOf(item({ parsed: null })).merchant, null);
  assert.equal(R.readingOf(item({ parsed: null })).title, 'Padaria inventada');
  assert.equal(R.readingOf(item({ parsed: { merchant: null } }, { description: 'Depósito via Pix' })).merchant, null);
  assert.equal(R.readingOf(item({ parsed: null }, { description: null })).title, null);
  assert.equal(R.readingOf(item()).cardLast4, '1234');
  assert.equal(R.readingOf(item({}, { cardLast4: '12a4' })).cardLast4, null);
  assert.equal(R.readingOf(item({}, { cardLast4: undefined })).cardLast4, null);
});

check('CR-c: the method and installments come from the reading; anything of the wrong shape is dropped', () => {
  assert.equal(R.readingOf(item()).method, 'CREDIT');
  assert.equal(R.readingOf(item({ parsed: { method: 42 } })).method, null);
  assert.equal(R.readingOf(item({ parsed: { installments: 3 } })).installments, 3);
  assert.equal(R.readingOf(item({ parsed: { installments: 0 } })).installments, null);
  assert.equal(R.readingOf(item({ parsed: 'x' })).installments, null);
});

check('CR-d: the only warning is POSSIBLE_OWN_TRANSFER, with its text; an unknown one is not shown', () => {
  assert.equal(R.readingOf(item({}, { warning: 'POSSIBLE_OWN_TRANSFER' })).warning, 'POSSIBLE_OWN_TRANSFER');
  assert.equal(R.warningText('POSSIBLE_OWN_TRANSFER'), 'Pode ser transferência entre suas contas');
  assert.equal(R.readingOf(item({}, { warning: 'SOMETHING_ELSE' })).warning, null);
  assert.equal(R.warningText(null), null);
});

check('CR-e: one tap when value, type and account are there; the category falls back by type', () => {
  const expense = R.oneTapConfirmBody(suggestion(), '2026-11-13');
  assert.equal(expense.ok, true);
  assert.equal(expense.body.categoryName, 'OTHER_EXPENSES');
  assert.equal(expense.body.amount, 42.9);
  assert.equal(expense.body.accountId, 'acc-1');
  assert.equal(expense.body.type, 'EXPENSE');
  assert.equal(expense.body.paid, true);
  const income = R.oneTapConfirmBody(suggestion({ type: 'INCOME', warning: 'POSSIBLE_OWN_TRANSFER' }), '2026-11-13');
  assert.equal(income.ok, true);
  assert.equal(income.body.categoryName, 'OTHER_INCOME');
  // A suggested category is kept.
  assert.equal(R.oneTapConfirmBody(suggestion({ categoryName: 'FOOD' }), '2026-11-13').body.categoryName, 'FOOD');
});

check('CR-f: the one-tap body has only the keys the server takes (no cardLast4, warning, installments)', () => {
  const r = R.oneTapConfirmBody(suggestion(), '2026-11-13');
  const allowed = new Set(['type', 'accountId', 'categoryName', 'amount', 'description', 'date', 'paid']);
  for (const key of Object.keys(r.body)) assert.ok(allowed.has(key), `unexpected key ${key}`);
});

check('CR-g: missing value, type or account means the form opens (no one tap)', () => {
  assert.equal(R.oneTapConfirmBody(suggestion({ type: null }), '2026-11-13').ok, false);
  assert.equal(R.oneTapConfirmBody(suggestion({ accountId: null }), '2026-11-13').ok, false);
  assert.equal(R.oneTapConfirmBody(suggestion({ amount: null }), '2026-11-13').ok, false);
  assert.equal(R.oneTapConfirmBody(suggestion({ amount: 0 }), '2026-11-13').ok, false);
  assert.equal(R.canConfirmInOneTap(suggestion()), true);
  assert.equal(R.canConfirmInOneTap(suggestion({ accountId: null })), false);
});

check('CR-h: the reparse summary says what happened; a second run with nothing new says so', () => {
  const text = R.reparseSummary({ scanned: 8, updated: 6, understood: 4, dismissed: 1, notUnderstood: 1, parserVersion: 4 });
  assert.match(text, /6 de 8/);
  assert.match(text, /4 entendidas/);
  assert.match(text, /1 aviso descartado/);
  assert.match(text, /1 não entendida/);
  assert.equal(
    R.reparseSummary({ scanned: 0, updated: 0, understood: 0, dismissed: 0, notUnderstood: 0, parserVersion: 4 }),
    'Nada para reprocessar: tudo já foi lido pela versão 4 do leitor.',
  );
});

check('CR-i: card rules draft starts from the server and the body is sorted, trimmed and only the known keys', () => {
  const server = [
    { package: NU, cardLast4: '9876', accountId: 'acc-2', id: 'x', householdId: 'h' },
    { package: MP, cardLast4: '1111', accountId: 'acc-3' },
  ];
  const draft = R.cardRulesDraft(server);
  assert.equal(draft.length, 2);
  assert.deepEqual(Object.keys(draft[0]).sort(), ['accountId', 'cardLast4', 'package']);
  const body = R.buildCardRulesBody([...draft, { package: NU, cardLast4: ' 1234 ', accountId: 'acc-1' }]);
  assert.deepEqual(body, {
    rules: [
      { package: MP, cardLast4: '1111', accountId: 'acc-3' },
      { package: NU, cardLast4: '1234', accountId: 'acc-1' },
      { package: NU, cardLast4: '9876', accountId: 'acc-2' },
    ],
  });
});

check('CR-j: card rules validation: four digits, an account, no repeated ending in the same app, at most 100', () => {
  assert.deepEqual(R.cardRulesErrors([{ package: NU, cardLast4: '1234', accountId: 'acc-1' }]), []);
  assert.deepEqual(R.cardRulesErrors([{ package: NU, cardLast4: '123', accountId: 'acc-1' }]), [{ index: 0, error: 'digits' }]);
  assert.deepEqual(R.cardRulesErrors([{ package: NU, cardLast4: '12345', accountId: 'acc-1' }]), [{ index: 0, error: 'digits' }]);
  assert.deepEqual(R.cardRulesErrors([{ package: NU, cardLast4: '1234', accountId: '' }]), [{ index: 0, error: 'account' }]);
  assert.deepEqual(
    R.cardRulesErrors([
      { package: NU, cardLast4: '1234', accountId: 'acc-1' },
      { package: NU, cardLast4: '1234', accountId: 'acc-2' },
      { package: MP, cardLast4: '1234', accountId: 'acc-2' },
    ]),
    [{ index: 1, error: 'duplicate' }],
  );
  const many = Array.from({ length: 101 }, (_, i) => ({ package: NU, cardLast4: String(1000 + i), accountId: 'acc-1' }));
  assert.deepEqual(R.cardRulesErrors(many), [{ index: 100, error: 'tooMany' }]);
});

check('CR-k: the draft changed only when the body differs from the server', () => {
  const server = [{ package: NU, cardLast4: '9876', accountId: 'acc-2' }];
  assert.equal(R.isCardRulesChanged(R.cardRulesDraft(server), server), false);
  assert.equal(R.isCardRulesChanged([{ package: NU, cardLast4: '9876', accountId: 'acc-1' }], server), true);
  assert.equal(R.isCardRulesChanged([], server), true);
});

check('CR-l: a notice (kind IGNORE, discarded by the server) is told apart from a text the reader did not understand', () => {
  assert.equal(R.readingOf(item({ status: 'DISMISSED', parsed: { kind: 'IGNORE' } }, { type: null, accountId: null, amount: null, description: null })).notice, true);
  assert.equal(R.readingOf(item({ parsed: null })).notice, false);
  assert.equal(R.readingOf(item()).notice, false);
});
