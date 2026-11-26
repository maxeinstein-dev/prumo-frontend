import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P19: default split of a recurrence ("Dividir com": person and percent) and the one-tap split of the capture and the
// add sheet ("Só meu", "Metade com <pessoa>", "É de <pessoa>"). src/utils/defaultSplit.ts holds the pure part: what the
// form sends, the pills and the body of the split. DEFAULT_SPLIT_MODULE points at a mutated copy. Invented data only.
const modPath = process.env.DEFAULT_SPLIT_MODULE || frontSrc('utils/defaultSplit.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D: any = await import(pathToFileURL(modPath).href);

console.log('\ndefault split (P19)');

const MAE = { id: 'p-mae', name: 'Mae Teste', isActive: true };
const ANA = { id: 'p-ana', name: 'Ana Teste', isActive: true };
const OLD = { id: 'p-old', name: 'Pessoa Inativa', isActive: false };

check('DS-a the form opens with the stored split of one person by percent', () => {
  assert.deepEqual(D.draftFromDefaultShares([{ personId: MAE.id, personName: MAE.name, percent: 100, amount: null }]), { personId: MAE.id, percent: '100', editable: true });
  assert.deepEqual(D.draftFromDefaultShares([]), { personId: '', percent: '', editable: true });
  assert.deepEqual(D.draftFromDefaultShares(undefined), { personId: '', percent: '', editable: true });
});

check('DS-b a split the form cannot show (two people, fixed amount) is kept as it is', () => {
  const two = [
    { personId: MAE.id, personName: MAE.name, percent: 30, amount: null },
    { personId: ANA.id, personName: ANA.name, percent: 30, amount: null },
  ];
  assert.equal(D.draftFromDefaultShares(two).editable, false);
  assert.equal(D.draftFromDefaultShares([{ personId: ANA.id, personName: ANA.name, percent: null, amount: 50 }]).editable, false);
  assert.deepEqual(D.defaultSharesToSend(D.draftFromDefaultShares(two), two, true), { ok: true, value: undefined });
});

check('DS-c what the form sends: a person and a percent (comma accepted)', () => {
  assert.deepEqual(D.defaultSharesToSend({ personId: ANA.id, percent: '50', editable: true }, [], true), { ok: true, value: [{ personId: ANA.id, percent: 50 }] });
  assert.deepEqual(D.defaultSharesToSend({ personId: ANA.id, percent: '33,33', editable: true }, [], true), { ok: true, value: [{ personId: ANA.id, percent: 33.33 }] });
  // No percent typed with a person chosen means the whole bill is theirs ("É de")
  assert.deepEqual(D.defaultSharesToSend({ personId: MAE.id, percent: '', editable: true }, [], true), { ok: true, value: [{ personId: MAE.id, percent: 100 }] });
});

check('DS-d removing the person clears a stored split; with nothing stored nothing is sent', () => {
  const stored = [{ personId: MAE.id, personName: MAE.name, percent: 100, amount: null }];
  assert.deepEqual(D.defaultSharesToSend({ personId: '', percent: '', editable: true }, stored, true), { ok: true, value: null });
  assert.deepEqual(D.defaultSharesToSend({ personId: '', percent: '', editable: true }, [], true), { ok: true, value: undefined });
});

check('DS-l an edit that does not touch the split sends nothing for it (a person deactivated since must not block the edit)', () => {
  const stored = [{ personId: MAE.id, personName: MAE.name, percent: 100, amount: null }];
  assert.deepEqual(D.defaultSharesToSend(D.draftFromDefaultShares(stored), stored, true), { ok: true, value: undefined });
  // Empty percent means 100: the same as stored
  assert.deepEqual(D.defaultSharesToSend({ personId: MAE.id, percent: '', editable: true }, stored, true), { ok: true, value: undefined });
  const half = [{ personId: ANA.id, personName: ANA.name, percent: 33.5, amount: null }];
  assert.deepEqual(D.defaultSharesToSend({ personId: ANA.id, percent: '33,50', editable: true }, half, true), { ok: true, value: undefined });
  // A change of person or percent is sent
  assert.deepEqual(D.defaultSharesToSend({ personId: ANA.id, percent: '100', editable: true }, stored, true), { ok: true, value: [{ personId: ANA.id, percent: 100 }] });
  assert.deepEqual(D.defaultSharesToSend({ personId: MAE.id, percent: '50', editable: true }, stored, true), { ok: true, value: [{ personId: MAE.id, percent: 50 }] });
});

check('DS-e an income never carries a default split (a stored one is cleared)', () => {
  const stored = [{ personId: MAE.id, personName: MAE.name, percent: 100, amount: null }];
  assert.deepEqual(D.defaultSharesToSend({ personId: MAE.id, percent: '100', editable: true }, stored, false), { ok: true, value: null });
  assert.deepEqual(D.defaultSharesToSend({ personId: MAE.id, percent: '100', editable: true }, [], false), { ok: true, value: undefined });
});

check('DS-f a bad percent is refused before sending', () => {
  for (const percent of ['0', '-5', '100,01', '101', 'abc', '33,333']) {
    assert.deepEqual(D.defaultSharesToSend({ personId: ANA.id, percent, editable: true }, [], true), { ok: false, error: 'percent' }, percent);
  }
});

check('DS-g the list shows who takes a part', () => {
  assert.equal(D.defaultSplitSummary([{ personId: MAE.id, personName: MAE.name, percent: 100, amount: null }]), 'É de Mae Teste');
  assert.equal(D.defaultSplitSummary([{ personId: ANA.id, personName: ANA.name, percent: 50, amount: null }]), 'Ana Teste 50%');
  assert.equal(D.defaultSplitSummary([{ personId: ANA.id, personName: ANA.name, percent: null, amount: 104.5 }]), 'Ana Teste R$ 104,50');
  assert.equal(D.defaultSplitSummary([
    { personId: MAE.id, personName: MAE.name, percent: 30, amount: null },
    { personId: ANA.id, personName: ANA.name, percent: 20, amount: null },
  ]), 'Mae Teste 30%, Ana Teste 20%');
  assert.equal(D.defaultSplitSummary([]), null);
  assert.equal(D.defaultSplitSummary(undefined), null);
});

check('DS-h the pills use the last person used, else the first active one', () => {
  assert.equal(D.quickSplitPerson([MAE, ANA], ANA.id)?.id, ANA.id);
  assert.equal(D.quickSplitPerson([MAE, ANA], 'p-gone')?.id, MAE.id);
  assert.equal(D.quickSplitPerson([OLD, ANA], null)?.id, ANA.id);
  assert.equal(D.quickSplitPerson([OLD, ANA], OLD.id)?.id, ANA.id);
  assert.equal(D.quickSplitPerson([OLD], null), null);
  assert.equal(D.quickSplitPerson([], null), null);
});

check('DS-i the labels of the pills', () => {
  assert.equal(D.quickSplitLabel('mine', ANA), 'Só meu');
  assert.equal(D.quickSplitLabel('half', ANA), 'Metade com Ana Teste');
  assert.equal(D.quickSplitLabel('theirs', MAE), 'É de Mae Teste');
});

check('DS-j the split each pill sends (only for an expense)', () => {
  assert.equal(D.quickSplitBody('mine', ANA, 'EXPENSE'), undefined);
  assert.deepEqual(D.quickSplitBody('half', ANA, 'EXPENSE'), { strategy: 'equal', entries: [{ personId: ANA.id }] });
  assert.deepEqual(D.quickSplitBody('theirs', MAE, 'EXPENSE'), { strategy: 'percent', entries: [{ personId: MAE.id, percent: 100 }] });
  assert.equal(D.quickSplitBody('half', ANA, 'INCOME'), undefined);
  assert.equal(D.quickSplitBody('half', null, 'EXPENSE'), undefined);
});

check('DS-k the last person is remembered, and a broken storage never breaks the form', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  assert.equal(D.readLastSplitPerson(storage), null);
  D.writeLastSplitPerson(ANA.id, storage);
  assert.equal(D.readLastSplitPerson(storage), ANA.id);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(D.readLastSplitPerson(broken), null);
  assert.doesNotThrow(() => D.writeLastSplitPerson(ANA.id, broken));
});
