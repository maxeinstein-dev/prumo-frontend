import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Mobile shell (lote R0): tab and "Mais" mapping, header screen, Extrato badge text, month arithmetic.
// Invented data only. MOBILE_SHELL_MODULE points the suite at a mutated copy of utils/mobileShell.ts.
const msPath = process.env.MOBILE_SHELL_MODULE || frontSrc('utils/mobileShell.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(msPath).href);

console.log('\n[mobile shell] utils/mobileShell.ts');

check('five tabs in order: Início, Fluxo, Cartões, Extrato, Casa, with the routes of the spec', () => {
  assert.deepEqual(
    S.SHELL_TABS.map((t: { label: string; path: string }) => [t.label, t.path]),
    [
      ['Início', '/app'],
      ['Fluxo', '/app/cash-flow'],
      ['Cartões', '/app/credit-cards'],
      ['Extrato', '/app/transactions'],
      ['Casa', '/app/people'],
    ],
  );
});

check('tabForPath: each tab route is its own tab; sub-routes keep the tab; /app/people is Casa', () => {
  assert.equal(S.tabForPath('/app'), 'home');
  assert.equal(S.tabForPath('/app/cash-flow'), 'cashFlow');
  assert.equal(S.tabForPath('/app/credit-cards'), 'creditCards');
  assert.equal(S.tabForPath('/app/transactions'), 'transactions');
  assert.equal(S.tabForPath('/app/people'), 'house');
  assert.equal(S.tabForPath('/app/income/abc'), null);
});

check('Mais routes have no active tab, and the "Mais" items are the non-tab routes of the spec', () => {
  for (const p of ['/app/accounts', '/app/recurring', '/app/budgets', '/app/goals', '/app/income', '/app/reports', '/app/captures', '/app/settings']) {
    assert.equal(S.tabForPath(p), null, p);
  }
  assert.deepEqual(
    S.MORE_ITEMS.map((m: { screen: string }) => m.screen),
    ['accounts', 'recurring', 'budgets', 'goals', 'people', 'income', 'reports', 'captures', 'settings'],
  );
});

check('moreItemForPath: a tab route opens no "Mais" item; a Mais route opens its own; sub-routes count', () => {
  assert.equal(S.moreItemForPath('/app/transactions'), null);
  assert.equal(S.moreItemForPath('/app/accounts')?.screen, 'accounts');
  assert.equal(S.moreItemForPath('/app/income/simulator')?.screen, 'income');
  assert.equal(S.moreItemForPath('/app/settings')?.screen, 'settings');
});

check('screenForPath: prefix must end at a segment (/app/transactionsX is not the transactions screen)', () => {
  assert.equal(S.screenForPath('/app/transactionsX'), null);
  assert.equal(S.screenForPath('/app/transactions/123'), 'transactions');
  assert.equal(S.screenForPath('/app/income/simulator'), 'income');
  assert.equal(S.screenForPath('/elsewhere'), null);
});

check('the month selector is declared by the Extrato (lote R1) and by the Cartões (lote R3); the other screens wait for their lotes', () => {
  assert.equal(S.usesMonthSelector('transactions'), true);
  assert.equal(S.usesMonthSelector('creditCards'), true);
  assert.equal(S.usesMonthSelector('home'), true);
  for (const s of ['people', 'cashFlow', 'accounts']) {
    assert.equal(S.usesMonthSelector(s), false, s);
  }
  assert.equal(S.usesMonthSelector(null), false);
});

check('extratoTabName: plain name at zero; singular and plural with the count', () => {
  assert.equal(S.extratoTabName(0), 'Extrato');
  assert.equal(S.extratoTabName(-3), 'Extrato');
  assert.equal(S.extratoTabName(1), 'Extrato, 1 captura esperando confirmação');
  assert.equal(S.extratoTabName(4), 'Extrato, 4 capturas esperando confirmação');
});

check('extratoBadgeText: empty at zero, capped at 99+', () => {
  assert.equal(S.extratoBadgeText(0), '');
  assert.equal(S.extratoBadgeText(7), '7');
  assert.equal(S.extratoBadgeText(99), '99');
  assert.equal(S.extratoBadgeText(100), '99+');
});

check('shiftMonthKey: across the year boundary both ways, and with a multi-month jump', () => {
  assert.equal(S.shiftMonthKey('2026-11', 1), '2026-12');
  assert.equal(S.shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(S.shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(S.shiftMonthKey('2026-03', -14), '2025-01');
  assert.equal(S.shiftMonthKey('2026-11', 0), '2026-11');
});

check('monthKeyOf uses the local calendar month, zero-padded', () => {
  assert.equal(S.monthKeyOf(new Date(2026, 0, 5)), '2026-01');
  assert.equal(S.monthKeyOf(new Date(2026, 10, 30)), '2026-11');
});

check('headerTitleFor: each tab route titles the header with the tab label (Extrato, not Transações)', () => {
  for (const tab of S.SHELL_TABS) {
    assert.equal(S.headerTitleFor(tab.path), tab.label, tab.path);
  }
  assert.equal(S.headerTitleFor('/app/transactions/123'), 'Extrato');
  assert.equal(S.headerTitleFor('/app/accounts'), null);
});

check('monthLabelPt: lowercase month name and year', () => {
  assert.equal(S.monthLabelPt('2026-11'), 'novembro de 2026');
  assert.equal(S.monthLabelPt('2027-03'), 'março de 2027');
});

