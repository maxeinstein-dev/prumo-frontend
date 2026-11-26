// usage: node bite-queue-nothing.mjs [mutantNameFilter]
// Bite-checks of "a file with nothing to apply never stalls a queue" (card invoices and statements), the phase labels of
// the queue, the deferred invalidation and the shared preview request: every mutant breaks ONE guard in a scratch copy made
// by mutate.mjs (mut-queue/<name>/src) and the named test must then FAIL, in the pure suite (../t14_queue_nothing.mts
// with IMPORT_QUEUE_MODULE / CARD_QUEUE_MODULE / STATEMENT_QUEUE_MODULE pointing at the mutated file) or in the dialog
// simulation (build + the filtered scenarios).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const MUT = 'mut-queue';
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const IQ = 'utils/importQueue.ts';
const CQ = 'utils/cardOfxQueue.ts';
const SQ = 'utils/statementQueue.ts';
const PANEL = 'components/ImportQueuePanel.tsx';
const CDLG = 'components/ImportCardOfxDialog.tsx';
const SDLG = 'components/ImportTransactionsDialog.tsx';
const HOOK = 'hooks/api/useImportCardOfx.ts';
const ENV = { [IQ]: 'IMPORT_QUEUE_MODULE', [CQ]: 'CARD_QUEUE_MODULE', [SQ]: 'STATEMENT_QUEUE_MODULE' };

const MUTANTS = [
  // ---- pure --------------------------------------------------------------------------------------------------
  { name: 'q-nothing-cannot-continue', suite: 'pure', rel: CQ, old: "return { canContinue: true, applyRestEnabled: true, note: CARD_RECONCILED_NOTE, blockerText: null };", neu: "return { canContinue: false, applyRestEnabled: true, note: CARD_RECONCILED_NOTE, blockerText: null };", expect: 'QN-a' },
  { name: 'q-nothing-apply-rest-disabled', suite: 'pure', rel: CQ, old: "return { canContinue: true, applyRestEnabled: true, note: CARD_RECONCILED_NOTE, blockerText: null };", neu: "return { canContinue: true, applyRestEnabled: false, note: CARD_RECONCILED_NOTE, blockerText: null };", expect: 'QN-a' },
  { name: 'q-nothing-no-note', suite: 'pure', rel: CQ, old: "return { canContinue: true, applyRestEnabled: true, note: CARD_RECONCILED_NOTE, blockerText: null };", neu: "return { canContinue: true, applyRestEnabled: true, note: null, blockerText: null };", expect: 'QN-a' },
  { name: 'q-any-blocker-continues', suite: 'pure', rel: CQ, old: "if (input.blocker.code === 'nothing-to-do') return", neu: "if (input.blocker.code.length > 0) return", expect: 'QN-a' },
  { name: 'q-blocker-text-lost', suite: 'pure', rel: CQ, old: "return { canContinue: false, applyRestEnabled: false, note: null, blockerText: input.blocker.message };", neu: "return { canContinue: false, applyRestEnabled: false, note: null, blockerText: null };", expect: 'QN-a' },
  { name: 'q-other-blocker-leaves-apply-enabled', suite: 'pure', rel: CQ, old: "return { canContinue: false, applyRestEnabled: false, note: null, blockerText: input.blocker.message };", neu: "return { canContinue: false, applyRestEnabled: true, note: null, blockerText: input.blocker.message };", expect: 'QN-a' },
  { name: 'q-busy-ignored', suite: 'pure', rel: CQ, old: 'if (input.busy || !input.hasBuilt) return', neu: 'if (!input.hasBuilt) return', expect: 'QN-b' },
  { name: 'q-defer-single', suite: 'pure', rel: CQ, old: 'queueLength > 1;', neu: 'queueLength >= 1;', expect: 'QN-g' },
  { name: 's-nothing-new-stalls', suite: 'pure', rel: SQ, old: "if (plan.code === 'nothing-new') return { canContinue: true, applyRestEnabled: true,", neu: "if (plan.code === 'nothing-new') return { canContinue: false, applyRestEnabled: true,", expect: 'QN-c' },
  { name: 's-empty-continues', suite: 'pure', rel: SQ, old: "if (plan.code === 'nothing-new') return", neu: "if (plan.code === 'nothing-new' || plan.code === 'empty') return", expect: 'QN-c' },
  { name: 's-confirm-error-ignored', suite: 'pure', rel: SQ, old: 'if (input.confirmError !== null) {', neu: 'if (false) {', expect: 'QN-c' },
  { name: 's-blocker-text-lost', suite: 'pure', rel: SQ, old: "return { canContinue: false, applyRestEnabled: false, note: null, blockerText: plan.reason };", neu: "return { canContinue: false, applyRestEnabled: false, note: null, blockerText: null };", expect: 'QN-c' },
  { name: 'p-ready-is-loading', suite: 'pure', rel: IQ, old: "  if (!input.hasPreview) return 'idle';\n  return input.nothingToApply ? 'reconciled' : 'ready';", neu: "  if (!input.hasPreview) return 'idle';\n  return 'loading';", expect: 'QN-d' },
  { name: 'p-reconciled-is-ready', suite: 'pure', rel: IQ, old: "return input.nothingToApply ? 'reconciled' : 'ready';", neu: "return 'ready';", expect: 'QN-d' },
  { name: 'p-idle-is-loading', suite: 'pure', rel: IQ, old: "if (!input.hasPreview) return 'idle';", neu: "if (!input.hasPreview) return 'loading';", expect: 'QN-d' },
  { name: 'p-text-ready', suite: 'pure', rel: IQ, old: "ready: 'Pronta para revisar',", neu: "ready: 'Em análise',", expect: 'QN-d' },
  { name: 'm-up-to-date-as-skipped', suite: 'pure', rel: IQ, old: "return { ...withItem(state, state.index, { status: 'uptodate', note }), index: state.index + 1 };", neu: "return { ...withItem(state, state.index, { status: 'skipped', note }), index: state.index + 1 };", expect: 'QN-e' },
  { name: 'm-failed-can-be-up-to-date', suite: 'pure', rel: IQ, old: "export function markUpToDateCurrent(state: QueueState, note: string | null = null): QueueState {\n  const item = currentItem(state);\n  if (!item || item.status !== 'pending') return state;", neu: "export function markUpToDateCurrent(state: QueueState, note: string | null = null): QueueState {\n  const item = currentItem(state);\n  if (!item) return state;", expect: 'QN-e' },
  // ---- card dialog -------------------------------------------------------------------------------------------
  { name: 'cd-continue-counts-as-skipped', suite: 'dialog', filter: '^QN1$|^QN1 ', rel: CDLG, old: 'moveQueueTo(markUpToDateCurrent(queue, CARD_RECONCILED_QUEUE_NOTE));', neu: 'moveQueueTo(skipCurrent(queue));', expect: 'QN1' },
  { name: 'cd-summary-noun', suite: 'dialog', filter: '^QN1 ', rel: CDLG, old: "uptodate: ['já conciliada', 'já conciliadas']", neu: "uptodate: ['já importada', 'já importadas']", expect: 'QN1' },
  { name: 'cd-continue-button-missing', suite: 'dialog', filter: '^QN1 ', rel: CDLG, old: '{queueControls?.canContinue && (', neu: '{false && (', expect: 'QN1' },
  { name: 'cd-note-hidden', suite: 'dialog', filter: '^QN1 ', rel: CDLG, old: '{queueControls?.note && <p', neu: '{false && <p', expect: 'QN1' },
  { name: 'cd-apply-rest-disabled-for-reconciled', suite: 'dialog', filter: '^QN2', rel: CDLG, old: 'disabled={!queueControls?.applyRestEnabled}', neu: 'disabled={!queueControls?.applyRestEnabled || blocker !== null}', expect: 'QN2' },
  { name: 'cd-apply-rest-no-loop', suite: 'dialog', filter: '^QN2', rel: CDLG, old: '    setQueue(next);\n    await runDefaultsLoop(next);\n  };\n\n  /**\n   * For the files after', neu: '    setQueue(next);\n  };\n\n  /**\n   * For the files after', expect: 'QN2' },
  { name: 'cd-apply-rest-uses-confirm', suite: 'dialog', filter: '^QN2', rel: CDLG, old: "onClick={() => (blocker?.code === 'nothing-to-do' ? void handleApplyRestFromReconciled() : void handleConfirm(true))}", neu: 'onClick={() => void handleConfirm(true)}', expect: 'QN2' },
  { name: 'cd-blocker-text-hidden', suite: 'dialog', filter: '^QN7', rel: CDLG, old: '{queueControls?.blockerText && <p', neu: '{false && <p', expect: 'QN7' },
  { name: 'cd-phase-always-loading', suite: 'dialog', filter: '^QN5', rel: CDLG, old: 'previewing: isPreviewing || applying, confirming: isConfirming, hasPreview: !!preview && !!built,', neu: 'previewing: true, confirming: isConfirming, hasPreview: !!preview && !!built,', expect: 'QN5' },
  { name: 'cd-defer-never', suite: 'dialog', filter: '^QN9', rel: CDLG, old: 'deferInvalidation(queue !== null && shouldDeferInvalidation(queue.items.length));', neu: 'deferInvalidation(false);', expect: 'QN9' },
  { name: 'cd-no-flush-at-end', suite: 'dialog', filter: '^QN9', rel: CDLG, old: 'if (queueIsFinished) flushInvalidations();', neu: '', expect: 'QN9' },
  { name: 'cd-loop-stop-no-flush', suite: 'dialog', filter: '^QN14', rel: CDLG, old: '      flushInvalidations();\n      if (mountedRef.current) setApplying(false);', neu: '      if (mountedRef.current) setApplying(false);', expect: 'QN14' },
  // ---- panel --------------------------------------------------------------------------------------------------
  { name: 'pn-no-spinner', suite: 'dialog', filter: '^QN5', rel: PANEL, old: "if (phase === 'loading' || phase === 'confirming') return <Loader2 className={`${tone} animate-spin`} aria-hidden=\"true\" />;", neu: "if (phase === 'loading' || phase === 'confirming') return <CircleDot className={tone} aria-hidden=\"true\" />;", expect: 'QN5' },
  { name: 'pn-spinner-when-ready', suite: 'dialog', filter: '^QN5', rel: PANEL, old: "if (phase === 'ready') return <CircleDot className={tone} aria-hidden=\"true\" />;", neu: "if (phase === 'ready') return <Loader2 className={`${tone} animate-spin`} aria-hidden=\"true\" />;", expect: 'QN5' },
  // ---- hook ---------------------------------------------------------------------------------------------------
  { name: 'h-failed-confirm-deferred', suite: 'dialog', filter: '^QN10', rel: HOOK, old: 'if (deferRef.current && !error) pendingRef.current = true;', neu: 'if (deferRef.current) pendingRef.current = true;', expect: 'QN10' },
  { name: 'h-preview-not-shared', suite: 'dialog', filter: '^QN12', rel: HOOK, old: '  if (shared) return shared;\n', neu: '', expect: 'QN12' },
  { name: 'h-preview-shared-forever', suite: 'dialog', filter: '^QN13', rel: HOOK, old: 'requestCardOfxPreview(params).finally(() => inFlightPreviews.delete(key));', neu: 'requestCardOfxPreview(params);', expect: 'QN13' },
  // ---- statement dialog ----------------------------------------------------------------------------------------
  { name: 'sd-continue-button-missing', suite: 'dialog', filter: '^QN20', rel: SDLG, old: '{queueControls.canContinue && (\n                    <button type="button" onClick={handleContinueNothingNew}', neu: '{false && (\n                    <button type="button" onClick={handleContinueNothingNew}', expect: 'QN20' },
  { name: 'sd-apply-rest-uses-confirm', suite: 'dialog', filter: '^QN21', rel: SDLG, old: 'onClick={() => (queueControls.canContinue ? void handleApplyRestFromNothingNew() : void handleConfirm(true))}', neu: 'onClick={() => void handleConfirm(true)}', expect: 'QN21' },
  { name: 'sd-blocker-text-hidden', suite: 'dialog', filter: '^QN22', rel: SDLG, old: '{queueControls.blockerText && <p', neu: '{false && <p', expect: 'QN22' },
  { name: 'sd-phase-text', suite: 'dialog', filter: '^QN23', rel: SDLG, old: "phaseText={{ ready: 'Pronto para revisar', reconciled: 'Sem novidades' }}", neu: '', expect: 'QN23' },
  { name: 'sd-nothing-new-note-as-skipped', suite: 'dialog', filter: '^QN20', rel: SDLG, old: 'moveQueueTo(markUpToDateCurrent(queue, STATEMENT_NOTHING_NEW_QUEUE_NOTE));', neu: 'moveQueueTo(skipCurrent(queue));', expect: 'QN20' },
];

function makeMutant({ name, rel, old, neu }) {
  const out = spawnSync(process.execPath, ['mutate.mjs', name, rel, old, neu], { cwd: here, encoding: 'utf8', env: { ...process.env, MUT_DIR: MUT } });
  if (out.status !== 0) throw new Error(`${name}: mutate.mjs failed\n${out.stdout}${out.stderr}`);
  return path.join(here, MUT, name, 'src');
}

function cleanup(name) {
  fs.rmSync(path.join(here, MUT, name), { recursive: true, force: true });
  fs.rmSync(path.join(here, 'out', `${name}.mjs`), { force: true });
  fs.rmSync(path.join(here, `entry.${name}.tsx`), { force: true });
}

function runPure(src, rel) {
  return spawnSync(process.execPath, [TSX_CLI, 't14_queue_nothing.mts'], {
    cwd: FE_TESTS, encoding: 'utf8', env: { ...process.env, [ENV[rel]]: path.join(src, rel) },
  });
}

function runDialog(name, src, nameFilter) {
  const build = spawnSync(process.execPath, ['build.mjs', name, src], { cwd: here, encoding: 'utf8' });
  if (build.status !== 0) return build;
  return spawnSync(process.execPath, ['scenarios.mjs', name, nameFilter], { cwd: here, encoding: 'utf8' });
}

const results = [];
for (const mutant of MUTANTS) {
  if (mutant.skip) continue;
  if (filter && !filter.test(mutant.name)) continue;
  const src = makeMutant(mutant);
  const out = mutant.suite === 'pure' ? runPure(src, mutant.rel) : runDialog(mutant.name, src, mutant.filter);
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const failLines = text.split('\n').filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  // t13 alone does not set the exit code (only run.mts calls summary()): for the pure suite the FAIL lines decide.
  const bit = (mutant.suite === 'pure' || out.status !== 0) && failLines.some((l) => l.includes(mutant.expect));
  const verdict = bit ? (mutant.survives ? 'BIT (unexpected)' : 'bit') : mutant.survives ? 'survived (expected)' : 'SURVIVED';
  results.push({ name: mutant.name, verdict, fails: failLines.length });
  console.log(`${verdict.padEnd(20)} ${mutant.name}  (${failLines.length} failing: ${failLines.slice(0, 3).join(' | ').slice(0, 200)})`);
  if (!bit && !mutant.survives) console.log(text.split('\n').slice(-12).join('\n'));
  cleanup(mutant.name);
}
fs.rmSync(path.join(here, MUT), { recursive: true, force: true });
const bad = results.filter((r) => r.verdict === 'SURVIVED' || r.verdict === 'BIT (unexpected)');
console.log(`\n${results.length} mutants: ${results.filter((r) => r.verdict === 'bit').length} bit, `
  + `${results.filter((r) => r.verdict === 'survived (expected)').length} survived as documented, ${bad.length} unexpected`);
process.exit(bad.length ? 1 : 0);
