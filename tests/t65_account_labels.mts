import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P22 L1: contas de mesmo nome ganham o tipo no rótulo ("Banco X (cartão)", "Banco X (conta)"). Só dados inventados.
// ACCOUNT_LABELS_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.ACCOUNT_LABELS_MODULE || frontSrc('utils/accountLabels.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const A: any = await import(pathToFileURL(modPath).href);
const inboxPath = process.env.CAPTURE_INBOX_MODULE || frontSrc('utils/captureInbox.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I: any = await import(pathToFileURL(inboxPath).href);

console.log('\n[rótulo de contas de mesmo nome] utils/accountLabels.ts');

const labels = (accounts: unknown[]): Record<string, string> => Object.fromEntries(A.accountLabels(accounts));

check('unique names stay as they are', () => {
  assert.deepEqual(labels([
    { id: 'a', name: 'Banco X', type: 'CHECKING' },
    { id: 'b', name: 'Banco Y', type: 'CREDIT' },
  ]), { a: 'Banco X', b: 'Banco Y' });
});

check('same name, different types: the type goes in the label', () => {
  assert.deepEqual(labels([
    { id: 'a', name: 'Banco X', type: 'CHECKING' },
    { id: 'b', name: 'Banco X', type: 'CREDIT' },
    { id: 'c', name: 'Banco X', type: 'SAVINGS' },
    { id: 'd', name: 'Banco X', type: 'CASH' },
    { id: 'e', name: 'Banco X', type: 'INVESTMENT' },
  ]), {
    a: 'Banco X (conta)',
    b: 'Banco X (cartão)',
    c: 'Banco X (poupança)',
    d: 'Banco X (dinheiro)',
    e: 'Banco X (investimento)',
  });
});

check('the comparison ignores case, accents and outer spaces; the label keeps the name as typed', () => {
  assert.deepEqual(labels([
    { id: 'a', name: ' Banco Único ', type: 'CHECKING' },
    { id: 'b', name: 'banco unico', type: 'CREDIT' },
  ]), { a: 'Banco Único (conta)', b: 'banco unico (cartão)' });
});

check('same name and same type: numbered by creation order, whatever the order given', () => {
  assert.deepEqual(labels([
    { id: 'new', name: 'Banco X', type: 'CREDIT', createdAt: '2026-05-02T10:00:00.000Z' },
    { id: 'acc', name: 'Banco X', type: 'CHECKING', createdAt: '2026-01-01T10:00:00.000Z' },
    { id: 'old', name: 'Banco X', type: 'CREDIT', createdAt: '2026-01-02T10:00:00.000Z' },
  ]), { old: 'Banco X (cartão)', new: 'Banco X (cartão 2)', acc: 'Banco X (conta)' });
});

check('same name and same type with no creation date: numbered in the order given', () => {
  assert.deepEqual(labels([
    { id: 'a', name: 'Banco X', type: 'CREDIT' },
    { id: 'b', name: 'Banco X', type: 'CREDIT' },
  ]), { a: 'Banco X (cartão)', b: 'Banco X (cartão 2)' });
});

check('inactive accounts do not make an active one ambiguous and get no label', () => {
  assert.deepEqual(labels([
    { id: 'a', name: 'Banco X', type: 'CHECKING', isActive: true },
    { id: 'b', name: 'Banco X', type: 'CREDIT', isActive: false },
  ]), { a: 'Banco X' });
});

check('accountLabel: the label of one account; the plain name when it is not in the list', () => {
  const list = [
    { id: 'a', name: 'Banco X', type: 'CHECKING' },
    { id: 'b', name: 'Banco X', type: 'CREDIT' },
  ];
  assert.equal(A.accountLabel(list, 'b'), 'Banco X (cartão)');
  assert.equal(A.accountLabel(list, 'zz'), null);
});

check('captureAccountOptions: same-name account and card are told apart; a hidden investment does not add a suffix', () => {
  assert.deepEqual(I.captureAccountOptions([
    { id: 'a', name: 'Banco X', type: 'CHECKING', isActive: true },
    { id: 'b', name: 'Banco X', type: 'CREDIT', isActive: true },
    { id: 'c', name: 'Banco Y', type: 'CHECKING', isActive: true },
    { id: 'i', name: 'Banco Y', type: 'INVESTMENT', isActive: true },
  ]), [
    { value: 'a', label: 'Banco X (conta)' },
    { value: 'b', label: 'Banco X (cartão)' },
    { value: 'c', label: 'Banco Y' },
  ]);
});
