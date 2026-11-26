import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Captures inbox (web): src/utils/captureInbox.ts (drafts, the confirm body, the completeness rule, accounts, badge) and
// src/utils/captureRules.ts (the account rules body of PUT /captures/account-rules). Invented data only. The dates are built
// with the local-time constructor, so the expected days hold in any time zone.
const inboxPath = process.env.CAPTURE_INBOX_MODULE || frontSrc('utils/captureInbox.ts');
const rulesPath = process.env.CAPTURE_RULES_MODULE || frontSrc('utils/captureRules.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I: any = await import(pathToFileURL(inboxPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = await import(pathToFileURL(rulesPath).href);

const ACC = '6f1c2a3e-0000-4000-8000-000000000001';
const CARD = '6f1c2a3e-0000-4000-8000-000000000002';
const CAT_CUSTOM = 'CUSTOM:6f1c2a3e-0000-4000-8000-000000000003';
const NU = 'com.nu.production';
const MP = 'com.mercadopago.wallet';
const ALLOWED_BODY_KEYS = ['accountId', 'amount', 'categoryName', 'date', 'description', 'paid', 'type'];

// The notification "posted" at 14:03 on 9 Nov 2026, device time.
const POSTED = new Date(2026, 10, 9, 14, 3).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function suggestion(over: Record<string, any> = {}): any {
  return { type: 'EXPENSE', accountId: CARD, categoryName: 'FOOD', amount: 42.5, description: 'Padaria Exemplo', date: POSTED, ...over };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function draft(over: Record<string, any> = {}): any {
  return { type: 'EXPENSE', accountId: ACC, categoryName: 'FOOD', amount: 10, description: '', date: '2026-11-09', ...over };
}

console.log('\n[captures inbox] utils/captureInbox.ts');

check('localDayKey: the local calendar day of an instant; null for a non-date', () => {
  assert.equal(I.localDayKey(new Date(2026, 10, 9, 23, 30).toISOString()), '2026-11-09');
  assert.equal(I.localDayKey(new Date(2026, 0, 1, 0, 5).toISOString()), '2026-01-01');
  assert.equal(I.localDayKey('nope'), null);
  assert.equal(I.localDayKey(null), null);
  assert.equal(I.localDayKey(''), null);
});

check('formatCaptureDateTime: dd/MM/yyyy HH:mm in the device zone; empty for a non-date', () => {
  assert.equal(I.formatCaptureDateTime(POSTED), '09/11/2026 14:03');
  assert.equal(I.formatCaptureDateTime(new Date(2026, 2, 5, 7, 9).toISOString()), '05/03/2026 07:09');
  assert.equal(I.formatCaptureDateTime('x'), '');
  assert.equal(I.formatCaptureDateTime(undefined), '');
});

check('appLabel: the two apps by package, an unknown package as it is', () => {
  assert.equal(I.appLabel(NU), 'Nubank');
  assert.equal(I.appLabel(MP), 'Mercado Pago');
  assert.equal(I.appLabel('com.other.app'), 'com.other.app');
});

check('draftFromSuggestion: copies the suggestion, the day is the local day of the capture', () => {
  const d = I.draftFromSuggestion(suggestion(), '2000-01-01');
  assert.deepEqual(d, { type: 'EXPENSE', accountId: CARD, categoryName: 'FOOD', amount: 42.5, description: 'Padaria Exemplo', date: '2026-11-09' });
});

check('draftFromSuggestion: nulls become empty fields; a date that does not parse takes today', () => {
  const empty = { type: null, accountId: null, categoryName: null, amount: null, description: null, date: 'bad' };
  assert.deepEqual(I.draftFromSuggestion(empty, '2026-11-10'), {
    type: null, accountId: '', categoryName: '', amount: null, description: '', date: '2026-11-10',
  });
});

check('buildConfirmBody: a complete draft gives exactly the confirm keys, paid true, no description when blank', () => {
  const r = I.buildConfirmBody(draft());
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, { type: 'EXPENSE', accountId: ACC, categoryName: 'FOOD', amount: 10, date: '2026-11-09', paid: true });
  assert.equal('description' in r.body, false);
});

check('buildConfirmBody: only the keys the backend accepts; never sourceRef, isSplit, notes or installments', () => {
  const r = I.buildConfirmBody(draft({ description: '  Mercado Exemplo  ', type: 'INCOME', categoryName: CAT_CUSTOM }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.body).sort(), [...ALLOWED_BODY_KEYS].sort());
  for (const key of Object.keys(r.body)) assert.ok(ALLOWED_BODY_KEYS.includes(key), `unexpected key ${key}`);
  assert.equal(r.body.description, 'Mercado Exemplo');
  assert.equal(r.body.type, 'INCOME');
  assert.equal(r.body.categoryName, CAT_CUSTOM);
});

check('buildConfirmBody: the amount is rounded to cents', () => {
  const r = I.buildConfirmBody(draft({ amount: 12.3456 }));
  assert.equal(r.ok, true);
  assert.equal(r.body.amount, 12.35);
});

check('buildConfirmBody: the description is cut at 255 characters', () => {
  const r = I.buildConfirmBody(draft({ description: 'a'.repeat(300) }));
  assert.equal(r.body.description.length, 255);
});

check('buildConfirmBody: reports every missing field, in a stable order', () => {
  const r = I.buildConfirmBody(draft({ type: null, accountId: '', categoryName: '', amount: null, date: '' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['type', 'accountId', 'categoryName', 'amount', 'date']);
});

check('buildConfirmBody: amount must be positive after cents (zero, negative, NaN, below half a cent)', () => {
  for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 0.001, null]) {
    const r = I.buildConfirmBody(draft({ amount }));
    assert.equal(r.ok, false, String(amount));
    assert.deepEqual(r.missing, ['amount'], String(amount));
  }
});

check('buildConfirmBody: a date that is not YYYY-MM-DD is missing', () => {
  for (const date of ['2026-1-9', '09/11/2026', '2026-11-09T00:00:00Z']) {
    assert.deepEqual(I.buildConfirmBody(draft({ date })).missing, ['date'], date);
  }
});

check('isSuggestionComplete: complete with type, account, category and amount (description optional)', () => {
  assert.equal(I.isSuggestionComplete(suggestion()), true);
  assert.equal(I.isSuggestionComplete(suggestion({ description: null })), true);
});

check('isSuggestionComplete: any missing piece means the form opens instead of a one-tap confirm', () => {
  assert.equal(I.isSuggestionComplete(suggestion({ type: null })), false);
  assert.equal(I.isSuggestionComplete(suggestion({ accountId: null })), false);
  assert.equal(I.isSuggestionComplete(suggestion({ categoryName: null })), false);
  assert.equal(I.isSuggestionComplete(suggestion({ amount: null })), false);
  assert.equal(I.isSuggestionComplete(suggestion({ amount: 0 })), false);
  assert.equal(I.isSuggestionComplete(suggestion({ date: 'bad' })), false);
});

check('isSuggestionComplete: the state of today (no parser yet, only the date) is not complete', () => {
  const bare = { type: null, accountId: null, categoryName: null, amount: null, description: null, date: POSTED };
  assert.equal(I.isSuggestionComplete(bare), false);
});

check('captureAccountOptions: active accounts that are not investments, in the order given', () => {
  const options = I.captureAccountOptions([
    { id: ACC, name: 'Conta Exemplo', type: 'CHECKING', isActive: true },
    { id: 'inv', name: 'Corretora Exemplo', type: 'INVESTMENT', isActive: true },
    { id: 'old', name: 'Conta antiga', type: 'SAVINGS', isActive: false },
    { id: CARD, name: 'Cartão Exemplo', type: 'CREDIT' },
  ]);
  assert.deepEqual(options, [
    { value: ACC, label: 'Conta Exemplo' },
    { value: CARD, label: 'Cartão Exemplo' },
  ]);
});

check('dateFromDayKey: local midnight of the day; null for a key that is not a real day', () => {
  const d = I.dateFromDayKey('2026-11-09');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 9);
  assert.equal(d.getHours(), 0);
  for (const bad of ['2026-02-30', '2026-13-01', '09/11/2026', '2026-1-9', '']) {
    assert.equal(I.dateFromDayKey(bad), null, bad);
  }
});

check('captureBadgeText: nothing for zero, the number, 99+ above 99', () => {
  assert.equal(I.captureBadgeText(0), '');
  assert.equal(I.captureBadgeText(-1), '');
  assert.equal(I.captureBadgeText(Number.NaN), '');
  assert.equal(I.captureBadgeText(3), '3');
  assert.equal(I.captureBadgeText(99), '99');
  assert.equal(I.captureBadgeText(100), '99+');
});

console.log('\n[captures inbox] utils/captureRules.ts');

check('shownRulePairs: each app with each kind, in screen order (10 rows)', () => {
  const pairs = R.shownRulePairs();
  assert.equal(pairs.length, 10);
  assert.deepEqual(pairs[0], { package: NU, kind: 'CARD_PURCHASE' });
  assert.deepEqual(pairs[4], { package: NU, kind: 'SAVINGS_MOVE' });
  assert.deepEqual(pairs[5], { package: MP, kind: 'CARD_PURCHASE' });
});

check('draftFromRules: every shown pair is in the draft; a rule fills its pair; unknown rules stay out of the draft', () => {
  const draft = R.draftFromRules([
    { package: NU, kind: 'CARD_PURCHASE', accountId: CARD },
    { package: 'com.other.app', kind: 'PIX_IN', accountId: ACC },
  ]);
  assert.equal(Object.keys(draft).length, 10);
  assert.equal(draft[R.ruleKey(NU, 'CARD_PURCHASE')], CARD);
  assert.equal(draft[R.ruleKey(NU, 'PIX_OUT')], '');
  assert.equal(R.ruleKey('com.other.app', 'PIX_IN') in draft, false);
});

check('buildRulesBody: the draft rules for shown pairs, blank ones left out, sorted by package then kind', () => {
  const draft = R.draftFromRules([]);
  draft[R.ruleKey(MP, 'PIX_IN')] = ACC;
  draft[R.ruleKey(NU, 'PIX_OUT')] = ACC;
  draft[R.ruleKey(NU, 'CARD_PURCHASE')] = CARD;
  assert.deepEqual(R.buildRulesBody(draft, []), {
    rules: [
      { package: MP, kind: 'PIX_IN', accountId: ACC },
      { package: NU, kind: 'CARD_PURCHASE', accountId: CARD },
      { package: NU, kind: 'PIX_OUT', accountId: ACC },
    ].sort((a, b) => a.package.localeCompare(b.package) || a.kind.localeCompare(b.kind)),
  });
});

check('buildRulesBody: a rule the screen does not show is sent back unchanged (PUT replaces all)', () => {
  const server = [
    { package: 'com.other.app', kind: 'PIX_IN', accountId: ACC },
    { package: NU, kind: 'CARD_PURCHASE', accountId: CARD },
  ];
  const draft = R.draftFromRules(server);
  const body = R.buildRulesBody(draft, server);
  // Sorted by package: "com.nu.production" comes before "com.other.app".
  assert.deepEqual(body.rules, [
    { package: NU, kind: 'CARD_PURCHASE', accountId: CARD },
    { package: 'com.other.app', kind: 'PIX_IN', accountId: ACC },
  ]);
});

check('buildRulesBody: clearing a shown rule removes it; no duplicate (package, kind) in the body', () => {
  const server = [{ package: NU, kind: 'CARD_PURCHASE', accountId: CARD }];
  const draft = R.draftFromRules(server);
  draft[R.ruleKey(NU, 'CARD_PURCHASE')] = '';
  assert.deepEqual(R.buildRulesBody(draft, server).rules, []);

  const again = R.draftFromRules(server);
  const rules = R.buildRulesBody(again, server).rules;
  const keys = rules.map((r: { package: string; kind: string }) => `${r.package}|${r.kind}`);
  assert.equal(new Set(keys).size, keys.length);
});

check('buildRulesBody: the body has only package, kind and accountId, and the account id is trimmed', () => {
  const draft = R.draftFromRules([]);
  draft[R.ruleKey(NU, 'PIX_IN')] = `  ${ACC}  `;
  const rules = R.buildRulesBody(draft, [{ package: NU, kind: 'PIX_IN', accountId: ACC, extra: 'x' }]).rules;
  assert.deepEqual(rules, [{ package: NU, kind: 'PIX_IN', accountId: ACC }]);
});

check('isRulesDraftChanged: false when the draft matches the server, true for an edit or a clear', () => {
  const server = [{ package: NU, kind: 'CARD_PURCHASE', accountId: CARD }];
  assert.equal(R.isRulesDraftChanged(R.draftFromRules(server), server), false);
  const edited = R.draftFromRules(server);
  edited[R.ruleKey(NU, 'PIX_IN')] = ACC;
  assert.equal(R.isRulesDraftChanged(edited, server), true);
  const cleared = R.draftFromRules(server);
  cleared[R.ruleKey(NU, 'CARD_PURCHASE')] = '';
  assert.equal(R.isRulesDraftChanged(cleared, server), true);
});
