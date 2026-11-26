import assert from 'node:assert/strict';
import { CONFIRM_CTX, CUSTOMS, M, check, defaultSelection, mkPreview, mkRow, show } from './harness.mts';
import { built, lazerChanged, k, preview, selected } from './fx2.mts';

console.log('\n[F5/F4] category map for the rows sent, blocker');

check('categoryMap carries only entries referenced by rows being sent (spelling variants meet)', () => {
  const keys = built.payload.categoryMap.map((e: { key: string; type: string }) => `${e.type}|${e.key}`);
  show('categoryMap keys', keys);
  // row "saude" meets entry "Saúde"; row "SALÁRIO " (INCOME) meets INCOME "Salário"; Lazer and EXPENSE|Salário are unused
  assert.deepEqual([...keys].sort(), ['EXPENSE|Saúde', 'INCOME|Freela', 'INCOME|Salário'].sort());
});

check('an unused create target is not sent; once a row uses the key it goes with it', () => {
  const kinds = built.payload.categoryMap.map((e: { target: { kind: string } }) => e.target.kind);
  assert.ok(!kinds.includes('create'), JSON.stringify(built.payload.categoryMap));
  const withLazer = M.buildConfirmPayload(preview, { ...selected, [k(lazerChanged)]: true }, {}, CONFIRM_CTX);
  const lazer = withLazer.payload.categoryMap.find((e: { key: string }) => e.key === 'Lazer');
  show('Lazer entry once a Lazer row is sent', lazer);
  assert.deepEqual(lazer.target, { kind: 'create', name: 'Lazer' });
});

check('spelling variant Saúde vs saude share one key; the stored choice is used for the entry', () => {
  assert.equal(M.categoryChoiceKey('EXPENSE', 'Saúde'), M.categoryChoiceKey('EXPENSE', 'saude'));
  assert.equal(M.categoryChoiceKey('EXPENSE', 'Saúde'), 'EXPENSE|saude');
  assert.equal(M.categoryChoiceKey('EXPENSE', 'Saúde  '), 'EXPENSE|saude');
  assert.notEqual(M.categoryChoiceKey('INCOME', 'Saúde'), M.categoryChoiceKey('EXPENSE', 'Saúde'));
  const choices = { [M.categoryChoiceKey('EXPENSE', 'saude')]: { kind: 'system', categoryName: 'PHARMACY' } };
  const b = M.buildConfirmPayload(preview, selected, choices, CONFIRM_CTX);
  const e = b.payload.categoryMap.find((x: { key: string }) => x.key === 'Saúde');
  show('Saúde target', e.target);
  assert.deepEqual(e.target, { kind: 'system', categoryName: 'PHARMACY' });
});

check('categoryMapForRows: two spellings in the rows reach a single entry, sent once', () => {
  const rows = [mkRow({ categoryKey: 'Saúde' }), mkRow({ categoryKey: 'saude' }), mkRow({ categoryKey: 'SAUDE ' })];
  const map = M.categoryMapForRows({ categoryMap: preview.categoryMap }, {}, rows, CUSTOMS);
  show('map', map.map((e: { key: string; type: string }) => `${e.type}|${e.key}`));
  assert.equal(map.length, 1);
  assert.equal(map[0].key, 'Saúde');
  assert.equal(M.categoryMapForRows({ categoryMap: preview.categoryMap }, {}, [], CUSTOMS).length, 0);
});

check('a custom choice that no longer exists falls back to the (valid) suggestion', () => {
  const choices = { [M.categoryChoiceKey('EXPENSE', 'Saúde')]: { kind: 'custom', categoryId: 'deleted-cat' } };
  const b = M.buildConfirmPayload(preview, selected, choices, CONFIRM_CTX);
  const e = b.payload.categoryMap.find((x: { key: string }) => x.key === 'Saúde');
  show('stale custom choice ->', e.target);
  assert.deepEqual(e.target, { kind: 'system', categoryName: 'HEALTHCARE' });
});

check('confirmBlocker: none selected / 500 ok / 501 blocked with a readable reason', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => mkRow({ section: 'debit', accountId: 'acc-main', description: `Linha ${i}`, amount: 1 }));
  const build = (n: number) => {
    const r = many(n);
    return M.buildConfirmPayload(mkPreview(r), defaultSelection(r), {}, CONFIRM_CTX);
  };
  assert.equal(M.confirmBlocker(M.buildConfirmPayload(mkPreview(many(3)), {}, {}, CONFIRM_CTX), false).code, 'none-selected');
  assert.equal(M.confirmBlocker(build(500), false), null);
  const b501 = M.confirmBlocker(build(501), false);
  show('501 rows', b501);
  assert.equal(b501.code, 'too-many');
  assert.ok(b501.message.includes('no máximo 500 linhas por vez: desmarque algumas'));
  assert.equal(M.confirmBlocker(built, false), null);
});
