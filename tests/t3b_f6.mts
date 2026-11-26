import assert from 'node:assert/strict';
import { CUSTOMS, M, check, mkEntry, show } from './harness.mts';

console.log('\n[F6] server suggestions validated like saved / in-session choices');

const known = new Set(['cat-pets']);
const customIds = { INCOME: new Set<string>(), EXPENSE: known };
// Option values the select renders for an entry (same construction as the dialog).
const optionValues = (type: string, key: string, customs: Set<string>): Set<string> =>
  new Set([...M.systemCategoryNames(type).map((n: string) => `system:${n}`), ...[...customs].map((id) => `custom:${id}`), ...(key ? ['create'] : []), 'default']);
const custom = (id: string) => ({ kind: 'custom', categoryId: id, label: 'Pets' });

check('suggestion custom:<unknown> with a key -> create named after the key', () => {
  const r = M.resolveCategoryChoices([mkEntry('Pets', { suggestion: custom('ghost-id') })], {}, {}, customIds);
  show('resolved', r);
  assert.deepEqual(r[M.categoryChoiceKey('EXPENSE', 'Pets')], { kind: 'create', name: 'Pets' });
});

check('suggestion custom:<unknown> with an empty key -> default', () => {
  const r = M.resolveCategoryChoices([mkEntry('', { suggestion: custom('ghost-id') })], {}, {}, customIds);
  show('resolved', r);
  assert.deepEqual(r[M.categoryChoiceKey('EXPENSE', '')], { kind: 'default' });
});

check('suggestion custom:<known> stays custom; unknown system name -> default', () => {
  const ok = M.resolveCategoryChoices([mkEntry('Pets', { suggestion: custom('cat-pets') })], {}, {}, customIds);
  assert.deepEqual(Object.values(ok)[0], { kind: 'custom', categoryId: 'cat-pets' });
  const bad = { kind: 'system', categoryName: 'NOT_A_CATEGORY', label: 'x' };
  const sys = M.resolveCategoryChoices([mkEntry('Pets', { suggestion: bad })], {}, {}, customIds);
  assert.deepEqual(Object.values(sys)[0], { kind: 'default' });
});

check('custom suggestion is checked per type (an EXPENSE custom id is unknown for INCOME)', () => {
  const r = M.resolveCategoryChoices([mkEntry('Pets', { type: 'INCOME', suggestion: custom('cat-pets') })], {}, {}, customIds);
  assert.deepEqual(Object.values(r)[0], { kind: 'create', name: 'Pets' });
});

check('precedence: in-session > saved > suggestion; invalid ones are skipped', () => {
  const e = mkEntry('Pets', { suggestion: { kind: 'system', categoryName: 'FOOD', label: 'x' } });
  const key = M.categoryChoiceKey('EXPENSE', 'Pets');
  const sessionOk = { [key]: { kind: 'system', categoryName: 'FUEL' } };
  const savedOk = { [key]: { kind: 'system', categoryName: 'HOUSING' } };
  const bad = { [key]: { kind: 'custom', categoryId: 'deleted' } };
  assert.deepEqual(M.resolveCategoryChoices([e], sessionOk, savedOk, customIds)[key], { kind: 'system', categoryName: 'FUEL' });
  assert.deepEqual(M.resolveCategoryChoices([e], {}, savedOk, customIds)[key], { kind: 'system', categoryName: 'HOUSING' });
  assert.deepEqual(M.resolveCategoryChoices([e], bad, savedOk, customIds)[key], { kind: 'system', categoryName: 'HOUSING' });
  assert.deepEqual(M.resolveCategoryChoices([e], bad, bad, customIds)[key], { kind: 'system', categoryName: 'FOOD' });
});

check('only the normalized key is read: a choice under the raw spelling is ignored', () => {
  const e = mkEntry('Saúde', { suggestion: { kind: 'default', label: 'x' } });
  const want = { kind: 'system', categoryName: 'HEALTHCARE' };
  const raw = { 'EXPENSE|Saúde': want };
  const normalized = { 'EXPENSE|saude': want };
  assert.notDeepEqual(M.resolveCategoryChoices([e], {}, raw, customIds)['EXPENSE|saude'], want);
  assert.deepEqual(M.resolveCategoryChoices([e], {}, normalized, customIds)['EXPENSE|saude'], want);
});

check('every resolved target has a matching <select> option (hostile suggestions, both types)', () => {
  const sugg = [custom('ghost'), custom('cat-pets'), { kind: 'system', categoryName: 'ZZZ' }, { kind: 'system', categoryName: 'FOOD' },
    { kind: 'create', name: 'x'.repeat(300) }, { kind: 'create' }, { kind: 'custom' }, { kind: 'weird' }, { kind: 'default' }];
  let checked = 0;
  for (const s of sugg) {
    for (const type of ['INCOME', 'EXPENSE']) {
      for (const key of ['', 'Pets']) {
        const e = mkEntry(key, { type, suggestion: { label: 'l', ...s } });
        const value = M.targetToSelectValue(Object.values(M.resolveCategoryChoices([e], {}, {}, customIds))[0]);
        const opts = optionValues(type, key, type === 'EXPENSE' ? known : new Set());
        assert.ok(opts.has(value), `${type}|${key}|${JSON.stringify(s)} -> ${value}`);
        checked += 1;
      }
    }
  }
  show('entries checked', checked);
});

check('effectiveCategoryTarget: a stale in-session custom choice gives way to the validated suggestion', () => {
  const e = mkEntry('Pets', { suggestion: custom('ghost') });
  const choices = { [M.categoryChoiceKey('EXPENSE', 'Pets')]: { kind: 'custom', categoryId: 'was-deleted' } };
  assert.deepEqual(M.effectiveCategoryTarget(e, choices, CUSTOMS), { kind: 'create', name: 'Pets' });
});
