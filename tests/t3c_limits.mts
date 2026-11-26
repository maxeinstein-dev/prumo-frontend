import assert from 'node:assert/strict';
import { M, check, show } from './harness.mts';

console.log('\n[F4] limits: category name, month, file');

check('create names are clamped to 100 chars (select value and suggestion paths)', () => {
  const long = 'x'.repeat(150);
  const a = M.selectValueToTarget('create', long);
  const b = M.suggestionToTarget({ kind: 'create', name: 'y'.repeat(130), label: 'l' }, 'key');
  const c = M.suggestionToTarget({ kind: 'create', label: 'l' }, long);
  show('lengths', [a.name.length, b.name.length, c.name.length]);
  assert.deepEqual([a.name.length, b.name.length, c.name.length], [100, 100, 100]);
  assert.equal(M.selectValueToTarget('create', 'ok').name, 'ok');
});

check('clamp never leaves half a surrogate pair; an over-long saved create name is not valid', () => {
  const out = M.clampCategoryName('a'.repeat(99) + '\u{1F600}'); // 101 UTF-16 units
  show('clamped length', out.length);
  assert.equal(out.length, 99);
  assert.equal(M.clampCategoryName('b'.repeat(100)).length, 100);
  assert.equal(M.isCategoryTargetValid({ kind: 'create', name: 'z'.repeat(101) }, 'EXPENSE', 'k', new Set()), false);
  assert.equal(M.isCategoryTargetValid({ kind: 'create', name: 'z'.repeat(100) }, 'EXPENSE', 'k', new Set()), true);
});

check('parseMonthInput accepts only years 2000..2100 and months 1..12', () => {
  const inputs = ['1999-12', '2000-01', '2026-10', '2100-12', '2101-01', '2026-00', '2026-13', '0001-01', 'abc', ''];
  console.log(`       ${JSON.stringify(inputs.map((v) => [v, M.parseMonthInput(v)]))}`);
  assert.equal(M.parseMonthInput('1999-12'), null);
  assert.deepEqual(M.parseMonthInput('2000-01'), { year: 2000, month: 1 });
  assert.deepEqual(M.parseMonthInput('2100-12'), { year: 2100, month: 12 });
  for (const bad of ['2101-01', '2026-00', '2026-13', '0001-01', 'abc', '']) assert.equal(M.parseMonthInput(bad), null, bad);
});

check('validateMaxFinFile: 5 MB is the limit, only .csv and .xlsx', () => {
  const MB = 1024 * 1024;
  const over = M.validateMaxFinFile({ name: 'set.csv', size: 5 * MB + 1 });
  const big = M.validateMaxFinFile({ name: 'set.csv', size: 5.3 * MB });
  const wrong = M.validateMaxFinFile({ name: 'set.xls', size: 10 });
  show('messages', [over, big, wrong]);
  assert.equal(M.validateMaxFinFile({ name: 'set.csv', size: 5 * MB }), null);
  assert.equal(M.validateMaxFinFile({ name: 'SET.CSV', size: 100 }), null);
  assert.ok(over && over.includes('5,1 MB') && over.includes('O limite é 5 MB'), over ?? 'null');
  assert.ok(big && big.includes('5,3 MB') && big.toLowerCase().includes('grande'));
  assert.ok(wrong && wrong.includes('.csv') && wrong.includes('.xlsx'));
});
