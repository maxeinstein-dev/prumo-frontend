import assert from 'node:assert/strict';
import { M, check, mkRow, show } from './harness.mts';

console.log('\n[F2] row statuses: sendable / default selection');

const TABLE: Array<[string, boolean, boolean]> = [
  // status, sendable, ticked by default
  ['new', true, true],
  ['duplicate', false, false],
  ['changed', true, false],
  ['replaces-future', true, true],
  ['legacy-duplicate', true, false],
  ['brand-new-status', false, false],
  ['', false, false],
];
const observed: Record<string, [boolean, boolean]> = {};
for (const [status, sendable, ticked] of TABLE) {
  check(`status "${status}": isSendableStatus=${sendable}, defaultRowSelected=${ticked}`, () => {
    observed[status] = [M.isSendableStatus(status), M.defaultRowSelected(status)];
    assert.equal(M.isSendableStatus(status), sendable);
    assert.equal(M.defaultRowSelected(status), ticked);
  });
}
console.log(`       observed [sendable, default]: ${JSON.stringify(observed)}`);

const rows = TABLE.map(([status]) => mkRow({ description: `row-${status || 'empty'}`, status }));
const k = (r: unknown) => M.rowKey(r);

check('"Selecionar todas as novas" (defaultRowSelected over the rows) takes new + replaces-future only', () => {
  const picked = rows.filter((r) => M.defaultRowSelected(r.status)).map((r) => r.status);
  show('picked', picked);
  assert.deepEqual(picked, ['new', 'replaces-future']);
});

check('reconcileSelection: default selection of a fresh preview', () => {
  const sel = M.reconcileSelection([], {}, rows);
  const ticked = rows.filter((r) => sel[k(r)]).map((r) => r.status);
  show('ticked', ticked);
  assert.deepEqual(ticked, ['new', 'replaces-future']);
});

check('reconcileSelection never ticks duplicate / unknown, even when they were ticked before', () => {
  const prevSelected = Object.fromEntries(rows.map((r) => [k(r), true]));
  const sel = M.reconcileSelection(rows, prevSelected, rows);
  const ticked = rows.filter((r) => sel[k(r)]).map((r) => r.status);
  show('ticked (all were true before)', ticked);
  assert.deepEqual(ticked, ['new', 'changed', 'replaces-future', 'legacy-duplicate']);
});

check('reconcileSelection: status change resets to the default, unchanged status keeps the choice', () => {
  const a = mkRow({ status: 'changed' });
  const b = mkRow({ status: 'new' });
  const prevSelected = { [k(a)]: true, [k(b)]: false };
  const next = [{ ...a, status: 'new' }, { ...b }];
  const sel = M.reconcileSelection([a, b], prevSelected, next);
  show('after', [sel[k(a)], sel[k(b)]]);
  assert.equal(sel[k(a)], true); // changed -> new: default (true), not the old choice
  assert.equal(sel[k(b)], false); // unchanged status: user choice (false) kept
  const duplicateNow = M.reconcileSelection([a], { [k(a)]: true }, [{ ...a, status: 'duplicate' }]);
  assert.equal(duplicateNow[k(a)], false);
});

check('selectRowsToSend drops duplicate / unknown rows even when forced to true', () => {
  const forced = Object.fromEntries(rows.map((r) => [k(r), true]));
  const sent = M.selectRowsToSend(rows, forced).map((r: { status: string }) => r.status);
  show('sent', sent);
  assert.deepEqual(sent, ['new', 'changed', 'replaces-future', 'legacy-duplicate']);
  assert.deepEqual(M.selectRowsToSend(rows, {}), []);
});

check('countByStatus counts every status, unknown ones apart', () => {
  const counts = M.countByStatus(rows);
  show('counts', counts);
  assert.deepEqual(counts, { new: 1, duplicate: 1, changed: 1, replacesFuture: 1, legacyDuplicate: 1, matchesRecurring: 0, unknown: 2 });
});

check('toConfirmRow adds replace only for changed / replaces-future', () => {
  const flags = rows.map((r) => ['replace' in M.toConfirmRow(r) ? M.toConfirmRow(r).replace : undefined, r.status]);
  show('[replace, status]', flags);
  for (const r of rows) {
    const out = M.toConfirmRow(r);
    assert.equal('replace' in out, r.status === 'changed' || r.status === 'replaces-future');
  }
});

check('countLabel singular and plural forms', () => {
  assert.equal(M.countLabel(1, 'nova', 'novas'), '1 nova');
  assert.equal(M.countLabel(0, 'nova', 'novas'), '0 novas');
  assert.equal(M.countLabel(2, 'duplicada', 'duplicadas'), '2 duplicadas');
  assert.equal(M.countLabel(1, 'alterada', 'alteradas'), '1 alterada');
});
