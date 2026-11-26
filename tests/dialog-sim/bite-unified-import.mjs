// usage: node bite-unified-import.mjs [mutantNameFilter]
// Bite-checks of the unified import (hub, queues of invoices and statements, onboarding closing day): every mutant
// breaks ONE guard in a scratch copy made by mutate.mjs (mut-unified/<name>/src) and the named test must then FAIL,
// in the pure suite (../tu_unified_import.mts, with IMPORT_HUB_MODULE / IMPORT_QUEUE_MODULE / CARD_QUEUE_MODULE /
// STATEMENT_QUEUE_MODULE / ONBOARDING_SCHEMA_MODULE pointing at the mutated file) or in the dialog simulation
// (build + the filtered scenarios). `expect` is a substring of the name of the test that must fail.
// env: FRONTEND_DIR (frontend checkout or worktree under test), as for the other scripts of this folder.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const MUT = 'mut-unified';
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const HUB = 'utils/importHub.ts';
const QUEUE = 'utils/importQueue.ts';
const CARDQ = 'utils/cardOfxQueue.ts';
const STMTQ = 'utils/statementQueue.ts';
const SCHEMA = 'schemas/index.ts';
const ENV_OF = {
  [HUB]: 'IMPORT_HUB_MODULE', [QUEUE]: 'IMPORT_QUEUE_MODULE', [CARDQ]: 'CARD_QUEUE_MODULE', [STMTQ]: 'STATEMENT_QUEUE_MODULE',
  [SCHEMA]: 'ONBOARDING_SCHEMA_MODULE',
};
const CARD = 'components/ImportCardOfxDialog.tsx';
const STMT = 'components/ImportTransactionsDialog.tsx';
const HUBD = 'components/ImportHubDialog.tsx';
const MAXFIN = 'components/ImportMaxFinDialog.tsx';
const STEP5 = 'components/onboarding/steps/OnboardingStep5Accounts.tsx';

const MUTANTS = [
  // ---- pure: detection and ordering (utils/importHub.ts) -------------------------------------------------------
  { name: 'p-ofx-always-card', suite: 'pure', rel: HUB, old: "  return /CCSTMTRS|CREDITCARDMSGSRSV1/i.test(text);", neu: '  return text.length >= 0;',
    expect: '.ofx: CCSTMTRS or CREDITCARDMSGSRSV1' },
  { name: 'p-sheet-without-total', suite: 'pure', rel: HUB,
    old: "    if (rows.slice(header + 1).filter((cells) => isTotalCell(cells[1] ?? '')).length >= SHEET_MIN_TOTAL_ROWS) return true;", neu: '    return true;',
    expect: '.csv: monthly sheet when column B' },
  { name: 'p-total-before-header', suite: 'pure', rel: HUB,
    old: "    if (rows.slice(header + 1).filter((cells) => isTotalCell(cells[1] ?? '')).length >= SHEET_MIN_TOTAL_ROWS) return true;",
    neu: "    if (rows.filter((cells) => isTotalCell(cells[1] ?? '')).length >= SHEET_MIN_TOTAL_ROWS) return true;", expect: 'csv sniff: header accent-insensitive' },
  { name: 'p-header-window', suite: 'pure', rel: HUB, old: 'const HEADER_SCAN_ROWS = 40;', neu: 'const HEADER_SCAN_ROWS = 4000;', expect: 'csv sniff: header accent-insensitive' },
  { name: 'p-utf8-cut', suite: 'pure', rel: HUB, old: 'bytes.length - incompleteUtf8Tail(bytes)));', neu: 'bytes.length - 0));', expect: 'decodeSniffBytes' },
  { name: 'p-cp1252-fallback', suite: 'pure', rel: HUB, old: "{ fatal: true }", neu: "{ fatal: false }", expect: 'decodeSniffBytes' },
  { name: 'p-name-before-header', suite: 'pure', rel: HUB, old: "  if (head !== null && importExtension(name) === 'ofx') {", neu: '  if (false) {', expect: 'periodStartOf: the OFX header wins' },
  { name: 'p-newest-first', suite: 'pure', rel: HUB, old: 'return da < db ? -1 : 1;', neu: 'return da < db ? 1 : -1;', expect: 'orderByPeriod' },
  { name: 'p-undated-first', suite: 'pure', rel: HUB, old: 'if (da === null && db !== null) return 1;', neu: 'if (da === null && db !== null) return -1;', expect: 'orderByPeriod' },
  { name: 'p-mixed-allowed', suite: 'pure', rel: HUB, old: '  if (kinds.length > 1) {', neu: '  if (false) {', expect: 'checkHubSelection: mixed kinds' },
  { name: 'p-several-sheets', suite: 'pure', rel: HUB, old: "  if ((kind === 'sheet' || kind === 'workbook') && entries.length > 1) {", neu: '  if (false) {',
    expect: 'sheet/workbook are one file at a time' },
  { name: 'p-file-problem-ignored', suite: 'pure', rel: HUB, old: '  const broken = entries.find((entry) => entry.problem);', neu: '  const broken = undefined as { name: string; problem: string } | undefined;',
    expect: 'a file with a problem blocks' },
  { name: 'p-impossible-date', suite: 'pure', rel: HUB, old: '  if (day > last) return null;', neu: '', expect: 'dateFromFileName' },
  { name: 'p-month-from-full-date', suite: 'pure', rel: HUB, old: '(\\d{2})(?![-_.]?\\d)/', neu: '(\\d{2})(?!\\d)/', expect: 'dateFromFileName' },
  { name: 'p-only-fitting-account', suite: 'pure', rel: HUB, old: "  return fitting.length === 1 ? fitting[0].id : '';", neu: "  return fitting[0]?.id ?? '';", expect: 'destination: the preferred account' },
  // ---- pure: queue (utils/importQueue.ts) ----------------------------------------------------------------------
  { name: 'q-complete-failed', suite: 'pure', rel: QUEUE,
    old: "export function completeCurrent(state: QueueState, note: string | null): QueueState {\n  const item = currentItem(state);\n  if (!item || item.status !== 'pending') return state;",
    neu: "export function completeCurrent(state: QueueState, note: string | null): QueueState {\n  const item = currentItem(state);\n  if (!item) return state;",
    expect: 'a failed file stays on screen, blocked' },
  { name: 'q-skip-pending-only', suite: 'pure', rel: QUEUE, old: "  if (!item || (item.status !== 'pending' && item.status !== 'failed')) return state;",
    neu: "  if (!item || item.status !== 'pending') return state;", expect: 'skipCurrent: from pending or failed' },
  { name: 'q-following-includes-current', suite: 'pure', rel: QUEUE, old: "  return state.items.slice(state.index + 1).filter((item) => item.status === 'pending').length;",
    neu: "  return state.items.slice(state.index).filter((item) => item.status === 'pending').length;", expect: 'remainingCount / followingCount' },
  { name: 'q-keeps-going-after-stop', suite: 'pure', rel: QUEUE,
    old: "    options.onProgress?.(state);\n    return { state, stop: { index, name: item.name, reason: outcome.reason } };",
    neu: "    options.onProgress?.(state);\n    state = skipCurrent(state);\n    continue;", expect: 'stops at the first file that cannot proceed' },
  { name: 'q-spins-on-refused', suite: 'pure', rel: QUEUE, old: '      if (next.index === state.index) {', neu: '      if (false) {', expect: 'the loop never asks twice' },
  { name: 'q-walks-over-failed', suite: 'pure', rel: QUEUE, old: "    if (item.status === 'failed') {", neu: '    if (false) {', expect: 'a confirm that failed (written) blocks the file' },
  { name: 'q-written-not-failed', suite: 'pure', rel: QUEUE, old: '    if (outcome.written) state = failCurrent(state, outcome.reason);', neu: '', expect: 'a confirm that failed (written) blocks the file' },
  { name: 'q-exception-crashes', suite: 'pure', rel: QUEUE,
    old: "      outcome = { ok: false, reason: err instanceof Error && err.message ? err.message : 'Erro inesperado.', written: false };",
    neu: '      throw err;', expect: 'an exception in a step is a stop' },
  { name: 'q-ignores-should-stop', suite: 'pure', rel: QUEUE, old: '    if (options.shouldStop?.()) return { state, stop: null };', neu: '', expect: 'shouldStop ends the loop' },
  { name: 'q-uptodate-counts-as-done', suite: 'pure', rel: QUEUE,
    old: "'upToDate' in outcome ? markUpToDateCurrent(state, outcome.note) : completeCurrent(state, outcome.note)", neu: 'completeCurrent(state, outcome.note)',
    expect: 'a file with nothing to import is left out' },
  { name: 'q-uptodate-over-failed', suite: 'pure', rel: QUEUE,
    old: "export function markUpToDateCurrent(state: QueueState, note: string | null = null): QueueState {\n  const item = currentItem(state);\n  if (!item || item.status !== 'pending') return state;",
    neu: "export function markUpToDateCurrent(state: QueueState, note: string | null = null): QueueState {\n  const item = currentItem(state);\n  if (!item) return state;",
    expect: 'markUpToDateCurrent' },
  // ---- pure: card and statement defaults, closing day (cardOfxQueue.ts, statementQueue.ts) ----------------------------
  { name: 'c-selects-ambiguous', suite: 'pure', rel: CARDQ,
    old: '  const selection = reconcileGroupSelection([], {}, groups);', neu: '  const selection = Object.fromEntries(groups.map((g) => [g.proposal.group, g.sendable]));',
    expect: 'planCardDefaultApply: sends only the groups the server marks' },
  { name: 'c-source-not-required', suite: 'pure', rel: CARDQ, old: '  if (apply && paymentNeedsSource(payment) && !options.sourceAccountId) {', neu: '  if (false) {',
    expect: 'planCardDefaultApply: the payment to create needs the queue source' },
  { name: 'c-blocker-ignored', suite: 'pure', rel: CARDQ, old: "  if (blocker) return { ok: false, code: blocker.code === 'nothing-to-do' ? 'nothing-to-do' : 'blocker', reason: blocker.message };", neu: '',
    expect: 'planCardDefaultApply: nothing to apply' },
  { name: 'c-nothing-to-do-is-a-blocker', suite: 'pure', rel: CARDQ, old: "code: blocker.code === 'nothing-to-do' ? 'nothing-to-do' : 'blocker'", neu: "code: 'blocker'",
    expect: 'planCardDefaultApply: nothing to apply' },
  { name: 'c-closing-warning-always-listed', suite: 'pure', rel: CARDQ, old: '  return noticeShown ? warnings.filter((w) => !isClosingDayServerWarning(w)) : [...warnings];', neu: '  return [...warnings];',
    expect: 'visibleCardWarnings' },
  { name: 'c-closing-day-zero', suite: 'pure', rel: CARDQ,
    old: "!(typeof account.closingDay === 'number' && account.closingDay >= 1 && account.closingDay <= 31)", neu: '!(account.closingDay != null)', expect: 'lacksClosingDay' },
  { name: 's-sends-duplicates', suite: 'pure', rel: STMTQ, old: '.filter((row) => !row.duplicate)', neu: '', expect: 'statementConfirmRows' },
  { name: 's-empty-file-goes', suite: 'pure', rel: STMTQ, old: "  if (preview.rows.length === 0) return { ok: false, code: 'empty', reason: STATEMENT_EMPTY_FILE };", neu: '', expect: 'planStatementDefaultApply' },
  // ---- pure: onboarding schema ---------------------------------------------------------------------------------
  { name: 'o-max-day', suite: 'pure', rel: SCHEMA, old: '      z.number().int().min(1, t.dueDayMin).max(31, t.dueDayMax).optional(),\n    ),',
    neu: '      z.number().int().min(1, t.dueDayMin).max(99, t.dueDayMax).optional(),\n    ),', expect: 'closingDay outside 1..31' },
  { name: 'o-min-day', suite: 'pure', rel: SCHEMA, old: '      z.number().int().min(1, t.dueDayMin).max(31, t.dueDayMax).optional(),\n    ),',
    neu: '      z.number().int().min(0, t.dueDayMin).max(31, t.dueDayMax).optional(),\n    ),', expect: 'closingDay outside 1..31' },
  { name: 'o-limit-nan', suite: 'pure', rel: SCHEMA, old: '    creditLimit: z.preprocess(\n      emptyToUndefined,', neu: '    creditLimit: z.preprocess(\n      (v) => v,',
    expect: 'creditLimit and dueDay are optional too' },
  { name: 'o-dueday-nan', suite: 'pure', rel: SCHEMA, old: 'dueDay: z.preprocess(emptyToUndefined, z.number()', neu: 'dueDay: z.preprocess((v) => v, z.number()',
    expect: 'creditLimit and dueDay are optional too' },
  { name: 'o-limit-zero', suite: 'pure', rel: SCHEMA, old: '      z.number().positive(t.limitMustBePositive).optional().transform((val) => val !== undefined',
    neu: '      z.number().min(0).optional().transform((val) => val !== undefined', expect: 'creditLimit and dueDay still refuse' },
  { name: 'o-nan-not-empty', suite: 'pure', rel: SCHEMA, old: "(typeof val === 'number' && Number.isNaN(val))", neu: 'false', expect: 'closingDay is optional' },
  { name: 'o-integer-only', suite: 'pure', rel: SCHEMA, old: '      z.number().int().min(1, t.dueDayMin).max(31, t.dueDayMax).optional(),\n    ),',
    neu: '      z.number().min(1, t.dueDayMin).max(31, t.dueDayMax).optional(),\n    ),', expect: 'closingDay outside 1..31' },

  // ---- dialogs (simulation) ------------------------------------------------------------------------------------
  { name: 'd-card-esc-while-applying', suite: 'dialog', rel: CARD, old: "if (e.key === 'Escape' && !confirmingRef.current && !applyingRef.current) onClose();",
    neu: "if (e.key === 'Escape' && !confirmingRef.current) onClose();", filter: '^Q9', expect: 'Q9' },
  { name: 'd-card-backdrop-while-applying', suite: 'dialog', rel: CARD, old: 'if (!confirmingRef.current && !isConfirming && !applyingRef.current) onClose();',
    neu: 'if (!confirmingRef.current && !isConfirming) onClose();', filter: '^Q9', expect: 'Q9' },
  { name: 'd-card-x-while-applying', suite: 'dialog', rel: CARD, old: 'onClick={requestClose} disabled={isConfirming || applying} aria-label="Fechar modal"',
    neu: 'onClick={requestClose} disabled={isConfirming} aria-label="Fechar modal"', filter: '^Q9', expect: 'Q9' },
  { name: 'd-card-next-before-confirm', suite: 'dialog', rel: CARD, old: '      const data = await confirmMutation.mutateAsync(built.payload);',
    neu: '      if (queue) startFile(queue.index + 1);\n      const data = await confirmMutation.mutateAsync(built.payload);', filter: '^Q(1|2) ', expect: 'Q' },
  { name: 'd-card-failure-not-marked', suite: 'dialog', rel: CARD,
    old: "        if (queue) setQueue(failCurrent(queue, getErrorMessage(err, 'Não foi possível confirmar a importação.')));", neu: '', filter: '^Q4 ', expect: 'Q4' },
  { name: 'd-card-refresh-keeps-failed', suite: 'dialog', rel: CARD,
    old: "    if (outcome === 'ok') setQueue((current) => (current ? retryCurrent(current) : current));", neu: '', filter: '^Q4 ', expect: 'Q4' },
  { name: 'd-card-apply-without-source', suite: 'dialog', rel: CARD,
    old: '{ sourceAccountId: queueSourceRef.current, savedChoices: loadSavedCategoryChoices(data.householdId || householdId) },',
    neu: "{ sourceAccountId: '', savedChoices: loadSavedCategoryChoices(data.householdId || householdId) },", filter: '^Q5 ', expect: 'Q5' },
  { name: 'd-card-stopped-file-refetched', suite: 'dialog', rel: CARD, old: 'startFile(run.state.index, got && got.index === run.state.index ? got.data : undefined);',
    neu: 'startFile(run.state.index, undefined);', filter: '^Q5b', expect: 'Q5b' },
  { name: 'd-card-no-continue-label', suite: 'dialog', rel: CARD, old: "confirmLabel={queue && followingCount(queue) > 0 ? 'Confirmar e continuar' : undefined}",
    neu: 'confirmLabel={undefined}', filter: '^Q1 ', expect: 'Q1' },
  { name: 'd-card-nothing-to-do-stops', suite: 'dialog', rel: CARD, old: "if (plan.code === 'nothing-to-do') return { ok: true, upToDate: true,", neu: "if (false) return { ok: true, upToDate: true,",
    filter: '^Q6 ', expect: 'Q6' },
  { name: 'd-card-apply-never-loops', suite: 'dialog', rel: CARD, old: '        if (thenApply && !isQueueFinished(next)) {', neu: '        if (false) {', filter: '^Q5 ', expect: 'Q5' },
  { name: 'd-card-duplicate-warning-listed', suite: 'dialog', rel: CARD, old: '{visibleCardWarnings(preview.warnings, showClosingNotice).map(', neu: '{preview.warnings.map(',
    filter: '^Q10', expect: 'Q10' },
  { name: 'd-card-no-closing-notice', suite: 'dialog', rel: CARD, old: 'const showClosingNotice = lacksClosingDay(cardAccount) && !result && !queueFinished;',
    neu: 'const showClosingNotice = false;', filter: '^Q10', expect: 'Q10' },
  { name: 'd-card-source-not-prefilled', suite: 'dialog', rel: CARD,
    old: '    choice.sourceAccountId || !queueSourceRef.current ? choice : { ...choice, sourceAccountId: queueSourceRef.current };', neu: '    choice;',
    filter: '^Q5c', expect: 'Q5c' },
  { name: 'd-card-apply-over-blocker', suite: 'dialog', rel: CARD, old: 'disabled={queueBusy || !built || blocker !== null}', neu: 'disabled={queueBusy || !built}', filter: '^Q(4|5) ', expect: 'Q' },
  { name: 'd-stmt-esc-while-applying', suite: 'dialog', rel: STMT, old: "if (e.key === 'Escape' && !confirmingRef.current && !applyingRef.current) onClose();",
    neu: "if (e.key === 'Escape' && !confirmingRef.current) onClose();", filter: '^S4', expect: 'S4' },
  { name: 'd-stmt-backdrop-while-applying', suite: 'dialog', rel: STMT, old: 'if (!confirmingRef.current && !isConfirming && !applyingRef.current) onClose();',
    neu: 'if (!confirmingRef.current && !isConfirming) onClose();', filter: '^S4', expect: 'S4' },
  { name: 'd-stmt-failure-not-blocking', suite: 'dialog', rel: STMT, old: '        setConfirmError(message);\n        setQueue(failCurrent(queue, message));',
    neu: '', filter: '^S3', expect: 'S3' },
  { name: 'd-stmt-nothing-new-stops', suite: 'dialog', rel: STMT, old: "        if (plan.code === 'nothing-new') return { ok: true, upToDate: true, note: plan.reason };",
    neu: "        if (false) return { ok: true, upToDate: true, note: plan.reason };", filter: '^S2', expect: 'S2' },
  { name: 'd-stmt-apply-over-failed', suite: 'dialog', rel: STMT, old: 'disabled={queueBusy || !preview || newCount === 0 || confirmError !== null}',
    neu: 'disabled={queueBusy || !preview || newCount === 0}', filter: '^S(3|2c)', expect: 'S' },
  { name: 'd-stmt-apply-never-loops', suite: 'dialog', rel: STMT, old: '        if (thenApply && !isQueueFinished(next)) {', neu: '        if (false) {', filter: '^S2 ', expect: 'S2' },
  { name: 'd-stmt-single-keeps-open', suite: 'dialog', rel: STMT, old: '      if (queue && !single) {', neu: '      if (queue) {', filter: '^S5', expect: 'S5' },
  { name: 'd-hub-no-sniff', suite: 'dialog', rel: HUBD, old: 'const detected = detectImportKind(file.name, head) ?? ', neu: 'const detected = detectImportKind(file.name, null) ?? ', filter: '^H1 ', expect: 'H1' },
  { name: 'd-hub-no-override', suite: 'dialog', rel: HUBD, old: 'entry.override ?? entry.detected;', neu: 'entry.detected;', filter: '^H2 ', expect: 'H2' },
  { name: 'd-hub-continue-when-mixed', suite: 'dialog', rel: HUBD, old: 'const canContinue = check.ok && !destProblem', neu: 'const canContinue = !destProblem', filter: '^H3 ', expect: 'H3' },
  { name: 'd-hub-not-ordered', suite: 'dialog', rel: HUBD, old: "orderByPeriod(rows.map((r) => ({ ...r, periodStart: r.entry.periodStart }))) : rows;", neu: 'rows : rows;',
    filter: '^H(5|11) ', expect: 'H' },
  { name: 'd-hub-card-not-preselected', suite: 'dialog', rel: HUBD, old: 'defaultDestination(kind, accounts, defaultAccountId);', neu: 'defaultDestination(kind, accounts, null);', filter: '^H4 ', expect: 'H4' },
  { name: 'd-hub-single-as-queue', suite: 'dialog', rel: HUBD, old: 'return run.files.length === 1 ? (', neu: 'return run.files.length === 99 ? (', filter: '^H4 ', expect: 'H4' },
  { name: 'd-hub-sheet-not-autostarted', suite: 'dialog', rel: MAXFIN, old: '    autoStartRef.current = !!handedFile &&', neu: '    autoStartRef.current = false && !!handedFile &&', filter: '^H(7|8) ', expect: 'H' },
  { name: 'd-onb-no-closing-input', suite: 'dialog', rel: STEP5, old: "{...accountForm.register('closingDay', { valueAsNumber: true })}", neu: '', filter: '^O3', expect: 'O3' },
  { name: 'd-onb-no-hint', suite: 'dialog', rel: STEP5, old: '{t.closingDayHint}', neu: '', filter: '^O1', expect: 'O1' },

  // ---- round 1 of the review ---------------------------------------------------------------------------------------
  { name: 'p-total-is-a-prefix', suite: 'pure', rel: HUB, old: "export const isTotalCell = (cell: string): boolean => /^total\\s*:?$/.test(normalizeLabel(cell));",
    neu: "export const isTotalCell = (cell: string): boolean => normalizeLabel(cell).startsWith('total');", expect: 'bank csv with "Total' },
  { name: 'p-one-total-is-a-sheet', suite: 'pure', rel: HUB, old: 'export const SHEET_MIN_TOTAL_ROWS = 3;', neu: 'export const SHEET_MIN_TOTAL_ROWS = 1;', expect: 'bank csv with "Total' },
  { name: 'p-ofx-read-head-only', suite: 'pure', rel: HUB, old: "    return { read: 'full', note: null };", neu: "    return { read: 'head', note: null };", expect: 'an .ofx is read whole' },
  { name: 'p-big-ofx-read', suite: 'pure', rel: HUB, old: '    if (size > CARD_OFX_MAX_FILE_BYTES) {', neu: '    if (false) {', expect: 'over 5 MB is not read' },
  { name: 'p-unreadable-is-statement', suite: 'pure', rel: HUB, old: "if (ext === 'ofx') return text !== null ? (isCardOfxText(text) ? 'card' : 'statement') : null;",
    neu: "if (ext === 'ofx') return text !== null ? (isCardOfxText(text) ? 'card' : 'statement') : 'statement';", expect: '.ofx: CCSTMTRS or CREDITCARDMSGSRSV1' },
  { name: 'p-unknown-kind-ignored', suite: 'pure', rel: HUB, old: '  if (unknown) return {', neu: '  if (false) return {', expect: 'an .ofx over 5 MB is not read' },
  { name: 's-empty-is-up-to-date', suite: 'pure', rel: STMTQ, old: "return { ok: false, code: 'empty', reason: STATEMENT_EMPTY_FILE };", neu: "return { ok: false, code: 'nothing-new', reason: STATEMENT_EMPTY_FILE };",
    expect: 'planStatementDefaultApply' },
  { name: 'o-card-fields-always-checked', suite: 'pure', rel: SCHEMA, old: '.accountType === AccountType.CREDIT) return val;', neu: '.accountType === AccountType.CREDIT || true) return val;',
    expect: 'the card fields only count for a credit card' },
  { name: 'd-hub-ofx-head-only', suite: 'dialog', rel: HUBD, old: "const slice = read === 'full' ? file.slice(0) : file.slice(0, SNIFF_BYTES);", neu: 'const slice = file.slice(0, SNIFF_BYTES);', filter: '^H15', expect: 'H15' },
  { name: 'd-hub-unreadable-is-statement', suite: 'dialog', rel: HUBD, old: 'const { kind: detected, note } = classifyFile(file, text);',
    neu: "const { kind: detectedRaw, note } = classifyFile(file, text);\n        const detected = detectedRaw ?? 'statement';", filter: '^H16', expect: 'H16' },
  { name: 'd-card-source-not-copied', suite: 'dialog', rel: CARD, old: 'if (queue && patch.sourceAccountId && !queueSourceRef.current) {', neu: 'if (false) {', filter: '^Q5e', expect: 'Q5e' },
  { name: 'd-card-source-replaces-queue', suite: 'dialog', rel: CARD, old: 'if (queue && patch.sourceAccountId && !queueSourceRef.current) {', neu: 'if (queue && patch.sourceAccountId) {', filter: '^Q5f', expect: 'Q5f' },
  { name: 'd-card-repreviews-failed-file', suite: 'dialog', rel: CARD, old: 'startFile(run.state.index, adopt, adopt !== undefined);', neu: 'startFile(run.state.index, adopt, true);', filter: '^Q7', expect: 'Q7' },
  { name: 'd-stmt-repreviews-failed-file', suite: 'dialog', rel: STMT, old: 'startFile(run.state.index, adopt, adopt !== undefined);', neu: 'startFile(run.state.index, adopt, true);', filter: '^S2b', expect: 'S2b' },
  { name: 'd-stmt-empty-is-up-to-date', suite: 'dialog', rel: STMT, old: "if (plan.code === 'nothing-new') return", neu: 'if (true) return', filter: '^S2b', expect: 'S2b' },
  { name: 'd-onb-errors-not-cleared', suite: 'dialog', rel: STEP5, old: "if (watchedAccountType !== AccountType.CREDIT) clearErrors(['creditLimit', 'dueDay', 'closingDay']);", neu: '', filter: '^O7', expect: 'O7' },
];

function makeMutant({ name, rel, old, neu }) {
  const out = spawnSync(process.execPath, ['mutate.mjs', name, rel, old, neu], { cwd: here, encoding: 'utf8', env: { ...process.env, MUT_DIR: MUT } });
  if (out.status !== 0) throw new Error(`${name}: mutate.mjs failed\n${out.stdout}${out.stderr}`);
  const src = path.join(here, MUT, name, 'src');
  if (rel === SCHEMA) {
    // schemas/index.ts imports types from two context modules; under tsx the copy needs something to resolve.
    for (const f of ['context/I18nContext.ts', 'context/CurrencyContext.ts']) {
      fs.mkdirSync(path.dirname(path.join(src, f)), { recursive: true });
      fs.writeFileSync(path.join(src, f), 'export {};\n');
    }
  }
  return src;
}

function runPure(mutant, src) {
  // The scratch copy sits outside the frontend tree: its packages (zod) are found through NODE_PATH.
  const frontend = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(here, '../..');
  const env = { ...process.env, NODE_PATH: path.join(frontend, 'node_modules'), [ENV_OF[mutant.rel]]: path.join(src, mutant.rel) };
  return spawnSync(process.execPath, [TSX_CLI, 'tu_unified_import.mts'], { cwd: FE_TESTS, encoding: 'utf8', env, timeout: 120000 });
}

function runDialog(mutant, src) {
  const name = `bite-ui-${mutant.name}`.slice(0, 60);
  const build = spawnSync(process.execPath, ['build.mjs', name, src], { cwd: here, encoding: 'utf8' });
  if (build.status !== 0) return { status: 99, stdout: build.stdout, stderr: build.stderr, cleanup: name };
  const run = spawnSync(process.execPath, ['scenarios.mjs', name, mutant.filter], { cwd: here, encoding: 'utf8', timeout: 180000 });
  return { ...run, cleanup: name };
}

const results = [];
for (const mutant of MUTANTS) {
  if (filter && !filter.test(mutant.name)) continue;
  const src = makeMutant(mutant);
  const out = mutant.suite === 'pure' ? runPure(mutant, src) : runDialog(mutant, src);
  const text = `${out.stdout}${out.stderr}`;
  const failLines = text.split('\n').filter((l) => /^\s*FAIL /.test(l)).map((l) => l.replace(/^\s*FAIL /, ''));
  // A suite that hangs because of the mutant (an endless loop) is caught too, but says so.
  if (out.error?.code === 'ETIMEDOUT') failLines.push(`TIMEOUT: the suite hung (${mutant.expect})`);
  const bit = failLines.some((l) => l.includes(mutant.expect));
  results.push({ name: mutant.name, bit });
  console.log(`${bit ? 'bit     ' : 'SURVIVED'} ${mutant.name}  (${failLines.length} failing: ${failLines.slice(0, 2).join(' | ').slice(0, 200)})`);
  if (!bit) console.log(text.split('\n').slice(-14).join('\n'));
  if (out.cleanup) fs.rmSync(path.join(here, 'out', `${out.cleanup}.mjs`), { force: true });
  fs.rmSync(path.join(here, `entry.${out.cleanup ?? ''}.tsx`), { force: true });
  fs.rmSync(path.join(here, MUT, mutant.name), { recursive: true, force: true });
}
fs.rmSync(path.join(here, MUT), { recursive: true, force: true });
const survivors = results.filter((r) => !r.bit);
console.log(`\n${results.length} mutants: ${results.length - survivors.length} bit, ${survivors.length} survived`);
if (survivors.length > 0) process.exitCode = 1;
