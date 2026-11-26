// usage: node bite-recurring.mjs [mutantNameFilter]
// Bite-checks of phase 5 (recurring detection, follow-last, matches-recurring): every mutant breaks ONE guard in a
// scratch copy made by mutate.mjs (mut/<name>/src) and the named test must then FAIL, in the pure suites (../run.mts with
// RECURRING_DETECT_MODULE / RECURRING_FOLLOW_MODULE / MAXFIN_MODULE / MAXFIN_WORKBOOK_MODULE pointing at the mutated
// files) or in the dialog simulation (build + the filtered scenarios).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const DET = 'utils/recurringDetect.ts';
const FOL = 'utils/recurringFollow.ts';
const PAY = 'utils/maxfinPayload.ts';
const WB = 'utils/maxfinWorkbook.ts';
const DLG = 'components/DetectRecurringDialog.tsx';
const HOOK = 'hooks/api/useDetectRecurring.ts';
const IMP = 'components/ImportMaxFinDialog.tsx';
const UI = 'components/people/ui.tsx';

const ENV = { [DET]: 'RECURRING_DETECT_MODULE', [FOL]: 'RECURRING_FOLLOW_MODULE', [PAY]: 'MAXFIN_MODULE', [WB]: 'MAXFIN_WORKBOOK_MODULE' };

const MUTANTS = [
  // ---- utils/recurringDetect.ts (t11) ---------------------------------------------------------------------------
  { name: 'r-default-ignores-server-mark', suite: 'pure', rel: DET, old: 'selected[c.id] = c.defaultSelected === true;', neu: 'selected[c.id] = true;', expect: 'defaultDraft' },
  { name: 'r-kind-bulk-touches-all', suite: 'pure', rel: DET, old: "for (const c of candidates) if ((kind === 'bill') === isBill(c)) next[c.id] = selected;", neu: 'for (const c of candidates) next[c.id] = selected;', expect: 'setKindSelected' },
  { name: 'r-reconcile-forgets', suite: 'pure', rel: DET, old: 'selected[c.id] = known && c.id in prev.selected ? prev.selected[c.id] : fresh.selected[c.id];', neu: 'selected[c.id] = fresh.selected[c.id];', expect: 'reconcileDraft' },
  { name: 'r-day-32', suite: 'pure', rel: DET, old: 'if (n >= 1 && n <= 31) day = n;', neu: 'if (n >= 1 && n <= 32) day = n;', expect: 'day of the month' },
  { name: 'r-day-0', suite: 'pure', rel: DET, old: 'if (n >= 1 && n <= 31) day = n;', neu: 'if (n >= 0 && n <= 31) day = n;', expect: 'day of the month' },
  { name: 'r-amount-zero-allowed', suite: 'pure', rel: DET, old: 'else if (parsed <= 0) errors.amount', neu: 'else if (parsed < 0) errors.amount', expect: 'amount: integer cents' },
  { name: 'r-description-long-allowed', suite: 'pure', rel: DET, old: 'else if (trimmed.length > MAX_DESCRIPTION)', neu: 'else if (trimmed.length > 5000)', expect: 'description: trimmed' },
  { name: 'r-follow-default-off', suite: 'pure', rel: DET, old: 'return candidate.followLastAmount !== false;', neu: 'return candidate.followLastAmount === true;', expect: 'followLast: default on' },
  { name: 'r-payload-all-fields', suite: 'pure', rel: DET, old: 'if (r.adjusted.amount && r.amountCents !== null) item.amount', neu: 'if (r.amountCents !== null) item.amount', expect: 'payload: only the ticked' },
  { name: 'r-payload-unticked-sent', suite: 'pure', rel: DET, old: '.filter((r) => r.selected);', neu: '.filter(() => true);', expect: 'payload: only the ticked' },
  { name: 'r-payload-follow-always', suite: 'pure', rel: DET, old: 'if (r.adjusted.followLast) item.followLastAmount = r.followLast;', neu: 'item.followLastAmount = r.followLast;', expect: 'payload: only the ticked' },
  { name: 'r-payload-description-untrimmed', suite: 'pure', rel: DET, old: 'item.description = r.description.trim();', neu: 'item.description = r.description;', expect: 'payload: only the ticked' },
  { name: 'r-payload-params-dropped', suite: 'pure', rel: DET, old: '...(params.minMonths !== undefined && { minMonths: params.minMonths }),', neu: '', expect: 'detection parameters are echoed' },
  { name: 'r-total-uses-suggestion', suite: 'pure', rel: DET, old: 'totals.monthlyCents += r.amountCents ?? 0;', neu: 'totals.monthlyCents += reaisToCents(r.candidate.amount);', expect: 'totals: count by kind' },
  { name: 'r-errors-ignored', suite: 'pure', rel: DET, old: 'return !!(item.errors.amount || item.errors.day || item.errors.description);', neu: 'return false;', expect: 'detectBlocker' },
  { name: 'r-refresh-ignored', suite: 'pure', rel: DET, old: 'if (state.needsRefresh) return', neu: 'if (false) return', expect: 'detectBlocker' },
  { name: 'r-applying-ignored', suite: 'pure', rel: DET, old: 'if (state.applying) return', neu: 'if (false) return', expect: 'detectBlocker' },
  { name: 'r-none-selected-ignored', suite: 'pure', rel: DET, old: 'if (!built || built.totals.count === 0) return', neu: 'if (!built) return', expect: 'detectBlocker' },
  { name: 'r-4xx-partial', suite: 'pure', rel: DET, old: 'if (status !== undefined && status >= 400 && status < 500) return', neu: 'if (false) return', expect: 'failure text' },
  { name: 'r-skipped-zero-listed', suite: 'pure', rel: DET, old: 'if (n && n > 0) lines.push', neu: 'if (n !== undefined) lines.push', expect: 'empty state' },
  { name: 'r-range-always', suite: 'pure', rel: DET, old: 'return min === max ? null :', neu: 'return', expect: 'display texts' },
  // ---- utils/recurringFollow.ts (t12) ---------------------------------------------------------------------------
  { name: 'f-hint-for-older', suite: 'pure', rel: FOL, old: 'if (key && key <= limit && key > own) return false;', neu: '', expect: 'hint: not for an older occurrence' },
  { name: 'f-hint-no-window', suite: 'pure', rel: FOL, old: 'if (own > limit) return false;', neu: '', expect: 'hint: the window is today + 31 days' },
  { name: 'f-hint-window-off-by-one', suite: 'pure', rel: FOL, old: 'if (own > limit) return false;', neu: 'if (own >= limit) return false;', expect: 'hint: the window is today + 31 days' },
  { name: 'f-hint-ignores-flag', suite: 'pure', rel: FOL, old: 'if (!recurrence || recurrence.followLastAmount !== true) return null;', neu: 'if (!recurrence) return null;', expect: 'hint: not when the recurrence' },
  { name: 'f-hint-other-recurrence-counts', suite: 'pure', rel: FOL, old: ' || other.recurringTransactionId !== recurrenceId) continue;', neu: ') continue;', expect: 'OTHER recurrences' },
  { name: 'f-hint-no-coverage', suite: 'pure', rel: FOL, old: 'if (own < keys.reduce((min, k) => (k < min ? k : min), keys[0])) return false;', neu: '', expect: 'older than everything' },
  { name: 'f-hint-empty-known', suite: 'pure', rel: FOL, old: 'if (keys.length === 0) return false;', neu: '', expect: 'older than everything' },
  { name: 'f-notice-unvalidated', suite: 'pure', rel: FOL, old: "if (!notice || typeof notice.id !== 'string' || !notice.id) return null;", neu: 'if (!notice) return null;', expect: 'update notice' },
  { name: 'f-notice-wrong-text', suite: 'pure', rel: FOL, old: 'return `Recorrência atualizada para ${text}`;', neu: 'return `Recorrência criada para ${text}`;', expect: 'update notice' },
  { name: 'f-last-date-ignored', suite: 'pure', rel: FOL, old: 'if (recurrence.lastOccurrenceDate !== undefined) {', neu: 'if (false) {', expect: 'hint with lastOccurrenceDate: the edited' },
  { name: 'f-last-date-older-ok', suite: 'pure', rel: FOL, old: 'own >= last ?', neu: 'own >= last || own < last ?', expect: 'hint with lastOccurrenceDate: the edited' },
  { name: 'f-last-date-no-window', suite: 'pure', rel: FOL, old: 'own <= addDaysKey(today, LATEST_WINDOW_DAYS) && own >= last', neu: 'own >= last', expect: 'hint with lastOccurrenceDate: null' },
  { name: 'f-last-date-null-hints', suite: 'pure', rel: FOL, old: 'return own && last && own <=', neu: 'return own && own <=', expect: 'hint with lastOccurrenceDate: null' },
  { name: 'f-no-fallback', suite: 'pure', rel: FOL, old: '  return isLatestOccurrence(tx, known, today) ? FOLLOW_LAST_HINT : null;', neu: '  return null;', expect: 'an absent field falls back' },
  { name: 'f-amount-changed-floats', suite: 'pure', rel: FOL, old: 'return cents(stored) !== cents(edited);', neu: 'return stored !== edited;', expect: 'amountChanged' },
  { name: 'm-detail-no-amounts', suite: 'pure', rel: PAY, old: "if (row.status !== 'matches-recurring' || typeof row.existingAmount", neu: "if (true || typeof row.existingAmount", expect: 'rowDetailText' },
  { name: 'm-detail-any-status', suite: 'pure', rel: PAY, old: "row.status !== 'matches-recurring' || typeof row.existingAmount", neu: "typeof row.existingAmount", expect: 'rowDetailText' },
  { name: 'i-detail-not-rendered', suite: 'dialog', filter: '^MR5', rel: IMP, old: '{showDetail && <p className={`mt-0.5 text-[11px] leading-snug ${MUTED_CLS}`}>{detail}</p>}', neu: '{showDetail && <p className={`mt-0.5 text-[11px] leading-snug ${MUTED_CLS}`}>{row.statusDetail}</p>}', expect: 'MR5' },
  { name: 'd-apply-while-detecting', suite: 'dialog', filter: '^DR23', rel: DLG, old: 'disabled={busy || detecting || blocker !== null}', neu: 'disabled={busy || blocker !== null}', expect: 'DR23' },
  // ---- matches-recurring in the importer (t12) ---------------------------------------------------------------
  { name: 'm-not-ticked-by-default', suite: 'pure', rel: PAY, old: "status === 'new' || status === 'replaces-future' || status === 'matches-recurring';", neu: "status === 'new' || status === 'replaces-future';", expect: 'matches-recurring is sendable and ticked by default' },
  { name: 'm-not-sendable', suite: 'pure', rel: PAY, old: "'legacy-duplicate', 'matches-recurring'];", neu: "'legacy-duplicate'];", expect: 'matches-recurring is sendable and ticked by default' },
  { name: 'm-no-replace-flag', suite: 'pure', rel: PAY, old: "return status === 'changed' || status === 'replaces-future' || status === 'matches-recurring';", neu: "return status === 'changed' || status === 'replaces-future';", expect: 'payload: matches-recurring rows go with replace:true' },
  { name: 'm-recurring-count-missing', suite: 'pure', rel: PAY, old: "    if (row.status === 'matches-recurring') recurring += 1;", neu: '', expect: 'replacements (the armed confirm count)' },
  { name: 'm-count-bucket-missing', suite: 'pure', rel: PAY, old: "      case 'matches-recurring':\n        counts.matchesRecurring += 1;\n        break;\n", neu: '', expect: 'countByStatus: matches-recurring' },
  { name: 'm-summary-no-assumed', suite: 'pure', rel: PAY, old: "if (assumed > 0) parts.push(`assumiu ${countLabel(assumed, 'recorrente', 'recorrentes')}`);", neu: '', expect: 'result summary' },
  { name: 'm-review-for-assumed', suite: 'pure', rel: PAY, old: 'return (result.warnings?.length ?? 0) > 0 || result.skipped > 0 ||', neu: 'return (result.assumedRecurring ?? 0) > 0 || (result.warnings?.length ?? 0) > 0 || result.skipped > 0 ||', expect: 'result summary' },
  { name: 'w-recurring-total-missing', suite: 'pure', rel: WB, old: '    totals.recurring += built.totals.recurring;\n', neu: '', expect: 'workbook: totals add' },
  { name: 'w-assumed-dropped', suite: 'pure', rel: WB, old: '      summary.totals.assumedRecurring += result.assumedRecurring ?? 0;\n', neu: '', expect: 'workbook: totals add' },
  { name: 'w-toast-no-assumed', suite: 'pure', rel: WB, old: "  if (totals.assumedRecurring > 0) parts.push(`assumiu ${countLabel(totals.assumedRecurring, 'recorrente', 'recorrentes')}`);\n", neu: '', expect: 'workbook: totals add' },
  { name: 'i-no-recurring-badge', suite: 'dialog', filter: '^MR1', rel: IMP, old: "  'matches-recurring': { label: 'Recorrente', tone: 'blue' },\n", neu: '', expect: 'MR1' },
  { name: 'i-detail-hidden', suite: 'dialog', filter: '^MR1', rel: IMP, old: "['changed', 'replaces-future', 'legacy-duplicate', 'matches-recurring'];", neu: "['changed', 'replaces-future', 'legacy-duplicate'];", expect: 'MR1' },
  { name: 'i-no-count-chip', suite: 'dialog', filter: '^MR1', rel: IMP, old: '{counts.matchesRecurring > 0 && (\n            <Chip tone="blue">', neu: '{false && (\n            <Chip tone="blue">', expect: 'MR1' },
  { name: 'i-footer-no-recurring-line', suite: 'dialog', filter: '^MR[13]', rel: IMP, old: "{totals.recurring > 0 && <> ({countLabel(totals.recurring, 'assume uma recorrente', 'assumem recorrentes')})</>}\n            </p>\n          )}\n          {totals.invoice.willPay", neu: "</p>\n          )}\n          {totals.invoice.willPay", expect: 'MR' },
  // ---- the dialog (DR) ------------------------------------------------------------------------------------------
  { name: 'd-closes-while-applying', suite: 'dialog', filter: '^DR13', rel: DLG, old: 'canClose={!applying} titleId="detect-recurring-title"', neu: 'canClose titleId="detect-recurring-title"', expect: 'DR13' },
  { name: 'd-stale-detection-wins', suite: 'dialog', filter: '^DR12', rel: DLG, old: 'const isCurrent = () => mountedRef.current && run === seqRef.current;', neu: 'const isCurrent = () => mountedRef.current;', expect: 'DR12' },
  { name: 'd-double-apply', suite: 'dialog', filter: '^DR14', rel: DLG, old: 'blocker || applying || detecting || applyingRef.current) return;', neu: 'blocker || applying || detecting) return;', expect: 'DR14' },
  { name: 'd-not-blocked-after-failure', suite: 'dialog', filter: '^DR10', rel: DLG, old: 'needsRefresh: applyError !== null,', neu: 'needsRefresh: false,', expect: 'DR10' },
  { name: 'd-redetect-forgets-choices', suite: 'dialog', filter: '^DR10', rel: DLG, old: '(prev ? reconcileDraft(current, prev, next) : defaultDraft(next))', neu: 'defaultDraft(next)', expect: 'DR10' },
  { name: 'd-viewer-can-apply', suite: 'dialog', filter: '^DR15', rel: DLG, old: '                {canWrite && (\n                  <button type="button" onClick={() => void handleApply()}', neu: '                {(\n                  <button type="button" onClick={() => void handleApply()}', expect: 'DR15' },
  { name: 'd-viewer-can-edit', suite: 'dialog', filter: '^DR15', rel: DLG, old: '            {canWrite ? (\n              <>\n                <input type="text" inputMode="decimal"', neu: '            {true ? (\n              <>\n                <input type="text" inputMode="decimal"', expect: 'DR15' },
  { name: 'd-viewer-can-select', suite: 'dialog', filter: '^DR15', rel: DLG, old: '          {canWrite && (\n            <td className="px-3 py-2 align-top">', neu: '          {true && (\n            <td className="px-3 py-2 align-top">', expect: 'DR15' },
  { name: 'd-empty-reasons-hidden', suite: 'dialog', filter: '^DR16', rel: DLG, old: '          {reasons.length > 0 && (\n            <div>', neu: '          {false && (\n            <div>', expect: 'DR16' },
  { name: 'd-hook-invalidate-success-only', suite: 'dialog', filter: '^DR10', rel: HOOK, old: '    onSettled: () => {', neu: '    onSuccess: () => {', expect: 'DR10' },
  { name: 'd-hook-no-transactions-invalidate', suite: 'dialog', filter: '^DR7', rel: HOOK, old: "      queryClient.invalidateQueries({ queryKey: ['transactions'] });\n", neu: '', expect: 'DR7' },
  { name: 'd-hook-no-recurring-invalidate', suite: 'dialog', filter: '^DR7', rel: HOOK, old: "      queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] });\n", neu: '', expect: 'DR7' },
  { name: 'd-examples-always-open', suite: 'dialog', filter: '^DR3', rel: DLG, old: '        {open && (\n          <tr id={`${rowId}-examples`}', neu: '        {true && (\n          <tr id={`${rowId}-examples`}', expect: 'DR3' },
  { name: 'd-esc-closes-anyway', suite: 'dialog', filter: '^DR13', rel: UI, old: 'if (canCloseRef.current) onCloseRef.current();', neu: 'onCloseRef.current();', expect: 'DR13' },
];

function makeMutant({ name, rel, old, neu }) {
  const out = spawnSync(process.execPath, ['mutate.mjs', name, rel, old, neu], { cwd: here, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`${name}: mutate.mjs failed\n${out.stdout}${out.stderr}`);
  return path.join(here, 'mut', name, 'src');
}

function cleanup(name) {
  fs.rmSync(path.join(here, 'mut', name), { recursive: true, force: true });
  fs.rmSync(path.join(here, 'out', `${name}.mjs`), { force: true });
  fs.rmSync(path.join(here, `entry.${name}.tsx`), { force: true });
}

function runPure(mutant, src) {
  const env = { ...process.env, [ENV[mutant.rel]]: path.join(src, mutant.rel) };
  return spawnSync(process.execPath, [TSX_CLI, 'run.mts'], { cwd: FE_TESTS, encoding: 'utf8', env });
}

function runDialog(name, src, nameFilter) {
  const build = spawnSync(process.execPath, ['build.mjs', name, src], { cwd: here, encoding: 'utf8' });
  if (build.status !== 0) return build;
  return spawnSync(process.execPath, ['scenarios.mjs', name, nameFilter], { cwd: here, encoding: 'utf8' });
}

const results = [];
for (const mutant of MUTANTS) {
  if (filter && !filter.test(mutant.name)) continue;
  const src = makeMutant(mutant);
  const out = mutant.suite === 'pure' ? runPure(mutant, src) : runDialog(mutant.name, src, mutant.filter);
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const failLines = text.split('\n').filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  const bit = out.status !== 0 && failLines.some((l) => l.includes(mutant.expect));
  const verdict = bit ? 'bit' : 'SURVIVED';
  results.push({ name: mutant.name, verdict });
  console.log(`${verdict.padEnd(10)} ${mutant.name}  (${failLines.length} failing: ${failLines.slice(0, 2).join(' | ').slice(0, 160)})`);
  if (!bit) console.log(text.split('\n').slice(-12).join('\n'));
  cleanup(mutant.name);
}
fs.rmSync(path.join(here, 'mut'), { recursive: true, force: true });
const bad = results.filter((r) => r.verdict !== 'bit');
console.log(`\n${results.length} mutants: ${results.length - bad.length} bit, ${bad.length} survived`);
process.exit(bad.length ? 1 : 0);
