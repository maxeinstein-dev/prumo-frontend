// usage: node bite-workbook.mjs [mutantNameFilter]
// Bite-checks of the workbook (.xlsx) flow and of the credits rule: every mutant breaks ONE guard in a scratch copy
// of the importer files (mut/<name>/src, same files as mutate.mjs) and the named test must then FAIL, in the pure
// suite (../run.mts, through MAXFIN_MODULE / MAXFIN_WORKBOOK_MODULE) or in the dialog simulation (build + scenarios).
// `survives: true` marks a guard the simulation cannot observe (documented, not a failure of this script).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// FRONTEND_DIR overrides the default sibling checkout (e.g. a git worktree).
const REPO_SRC = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR, 'src') : path.resolve(here, '../../src');
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const FILES = [
  'components/ImportMaxFinDialog.tsx', 'hooks/api/useImportMaxFin.ts', 'utils/maxfinPayload.ts', 'utils/maxfinWorkbook.ts', 'lib/enums.ts',
  // phase 3 (card invoice .ofx): the bundle also carries the card dialog and the generic import that hands over to it
  'components/ImportCardOfxDialog.tsx', 'hooks/api/useImportCardOfx.ts', 'utils/cardOfx.ts', 'components/ImportTransactionsDialog.tsx',
  'hooks/api/useImportTransactions.ts',
];
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const WB = 'utils/maxfinWorkbook.ts';
const PAY = 'utils/maxfinPayload.ts';
const DLG = 'components/ImportMaxFinDialog.tsx';
const HOOK = 'hooks/api/useImportMaxFin.ts';

const MUTANTS = [
  // ---- pure logic ------------------------------------------------------------------------------------------
  { name: 'p-plan-unsorted', suite: 'pure', rel: WB, old: 'return ka < kb ? -1 : ka > kb ? 1 : 0;', neu: 'return 0;',
    expect: 'steps go oldest first' },
  { name: 'p-plan-float-income', suite: 'pure', rel: WB, old: 'totals.incomeCents += toCents(row.amount);', neu: 'totals.incomeCents += row.amount * 100;',
    expect: 'every row is added in integer cents' },
  { name: 'p-plan-empty-month-step', suite: 'pure', rel: WB, old: 'if (built.rowsSent.length === 0) {', neu: 'if (false) {',
    expect: 'steps go oldest first' },
  { name: 'p-blocker-refresh-late', suite: 'pure', rel: WB,
    old: "  if (needsRefresh) return { code: 'needs-refresh', message: 'Atualize a pré-visualização antes de confirmar de novo.' };\n  if (!plan || plan.months.length === 0) return { code: 'none-selected', message: 'Marque ao menos um mês.' };",
    neu: "  if (!plan || plan.months.length === 0) return { code: 'none-selected', message: 'Marque ao menos um mês.' };\n  if (needsRefresh) return { code: 'needs-refresh', message: 'Atualize a pré-visualização antes de confirmar de novo.' };",
    expect: 'needs-refresh comes first' },
  { name: 'p-blocker-limit-whole-workbook', suite: 'pure', rel: WB,
    old: 'const over = plan.steps.find((step) => step.totals.count > MAXFIN_MAX_ROWS);',
    neu: 'const over = plan.totals.rows > MAXFIN_MAX_ROWS ? plan.steps[0] : undefined;',
    expect: 'the 500-row limit is per month' },
  { name: 'p-selection-forgets', suite: 'pure', rel: WB,
    old: 'next[id] = reconcileSelection(prevRows[id] ?? [], prevSelection[id] ?? {}, month.rows);', neu: 'next[id] = reconcileSelection([], {}, month.rows);',
    expect: 'a re-preview keeps the choices' },
  { name: 'p-options-unsorted', suite: 'pure', rel: WB, old: 'months: sortMonthKeys(merged.months ?? []),', neu: 'months: [...(merged.months ?? [])],',
    expect: 'nextWorkbookOptions: every contract field explicit' },
  { name: 'p-summary-no-failed-month', suite: 'pure', rel: WB, old: '} else if (failure && index === results.length) {', neu: '} else if (false) {',
    expect: 'failure on the second month' },
  { name: 'p-invoice-gross', suite: 'pure', rel: PAY,
    old: "    if (row.type === 'INCOME') refundCents += toCents(row.amount);\n    else purchaseCents += toCents(row.amount);",
    neu: '    purchaseCents += toCents(row.amount);',
    expect: 'refund smaller than the purchases' },
  { name: 'p-invoice-reason', suite: 'pure', rel: PAY,
    old: 'accountProblem ?? (rowCount === 0 ? INVOICE_REASON.noCardRows : INVOICE_REASON.creditsCover)', neu: 'accountProblem ?? INVOICE_REASON.noCardRows',
    expect: 'refund equal to the purchases' },
  { name: 'p-file-xlsx-refused', suite: 'pure', rel: PAY, old: "if (lower.endsWith('.xlsx')) return 'xlsx';", neu: '',
    expect: 'maxfinFileKind' },
  // ---- dialog ----------------------------------------------------------------------------------------------
  { name: 'd-wb-no-latest-wins', suite: 'dialog', filter: '^W4b', rel: DLG,
    old: "      const data = await workbookMutation.mutateAsync({ accounts: accountIds, options: opts, file });\n      if (!isCurrent()) return 'stale';",
    neu: '      const data = await workbookMutation.mutateAsync({ accounts: accountIds, options: opts, file });',
    expect: 'W4b' },
  { name: 'd-wb-implicit-options', suite: 'dialog', filter: '^W[23] ', rel: DLG,
    old: '    const outcome = await runWorkbookPreview(next);', neu: '    const outcome = await runWorkbookPreview(patch);',
    expect: 'W2' },
  { name: 'd-wb-refresh-without-options', suite: 'dialog', filter: '^W6', rel: DLG,
    old: '    await runWorkbookPreview(nextWorkbookOptions(workbook.options));', neu: '    await runWorkbookPreview();',
    expect: 'W6' },
  { name: 'd-wb-continue-after-failure', suite: 'dialog', filter: '^W6', rel: DLG,
    old: '          if (isLive()) setConfirmError(message);\n          return;', neu: '          if (isLive()) setConfirmError(message);\n          continue;',
    expect: 'W6' },
  { name: 'd-wb-no-needs-refresh', suite: 'dialog', filter: '^W6', rel: DLG,
    old: 'const workbookBlocker = workbook ? workbookConfirmBlocker(plan, confirmError !== null) : null;',
    neu: 'const workbookBlocker = workbook ? workbookConfirmBlocker(plan, false) : null;',
    expect: 'W6' },
  { name: 'd-wb-invoice-column-when-stale', suite: 'dialog', filter: '^W6', rel: DLG,
    old: '{!stale && <th className={TH_CLS}>Fatura</th>}', neu: '{<th className={TH_CLS}>Fatura</th>}',
    expect: 'W6' },
  { name: 'd-wb-invoice-notice-when-stale', suite: 'dialog', filter: '^W6', rel: DLG,
    old: '{!stale && <InvoiceNotice preview={month.preview}', neu: '{<InvoiceNotice preview={month.preview}',
    expect: 'W6' },
  { name: 'd-wb-ignores-unmount', suite: 'dialog', filter: '^W10', rel: DLG,
    old: '        if (!isLive()) {\n          // The dialog went away mid-run', neu: '        if (false) {\n          // The dialog went away mid-run',
    expect: 'W10' },
  { name: 'd-wb-no-arm-guard', suite: 'dialog', filter: '^W7', rel: DLG,
    old: '      if (Date.now() - armedAtRef.current < ARM_GUARD_MS) return;\n    }\n    setArmed(false);\n    const steps = plan.steps;',
    neu: '    }\n    setArmed(false);\n    const steps = plan.steps;',
    expect: 'W7' },
  { name: 'd-wb-last-month-untickable', suite: 'dialog', filter: '^W2', rel: DLG,
    old: 'disabled={disabled || lastOne}', neu: 'disabled={disabled}',
    expect: 'W2' },
  { name: 'd-wb-steps-newest-first', suite: 'dialog', filter: '^W5', rel: DLG,
    old: '    const steps = plan.steps;', neu: '    const steps = [...plan.steps].reverse();',
    expect: 'W5' },
  { name: 'd-credit-marker', suite: 'dialog', filter: '^N1', rel: DLG,
    old: '{reversed === \'credit\' && <Chip tone="green" title="Valor negativo na planilha: lançado como crédito">crédito</Chip>}', neu: '',
    expect: 'N1' },
  { name: 'd-sheet-source-label', suite: 'dialog', filter: '^N2', rel: HOOK,
    old: "    case 'sheet':\n      return 'pelo nome da aba';\n", neu: '',
    expect: 'N2' },
  // The run-level flag is defensive: React never renders between two months (the next request starts in the same
  // microtask chain), so isPending alone already blocks closing in every observable state. Expected to survive.
  { name: 'd-wb-close-guard-pending-only', suite: 'dialog', filter: '^W5', rel: DLG,
    old: '    if (!isConfirming && !runningRef.current) onClose();', neu: '    if (!isConfirming) onClose();',
    expect: 'W5', survives: true },
];

function makeMutant({ name, rel, old, neu }) {
  const dest = path.join(here, 'mut', name, 'src');
  fs.rmSync(path.join(here, 'mut', name), { recursive: true, force: true });
  for (const f of FILES) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(path.join(REPO_SRC, f), path.join(dest, f));
  }
  const target = path.join(dest, rel);
  const text = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  const count = text.split(old).length - 1;
  if (count !== 1) throw new Error(`${name}: pattern must occur exactly once in ${rel}, found ${count}`);
  fs.writeFileSync(target, text.replace(old, () => neu));
  return dest;
}

function cleanup(name) {
  fs.rmSync(path.join(here, 'mut', name), { recursive: true, force: true });
  fs.rmSync(path.join(here, 'out', `${name}.mjs`), { force: true });
  fs.rmSync(path.join(here, `entry.${name}.tsx`), { force: true });
}

function runPure(src) {
  return spawnSync(process.execPath, [TSX_CLI, 'run.mts'], {
    cwd: FE_TESTS, encoding: 'utf8',
    env: { ...process.env, MAXFIN_MODULE: path.join(src, PAY), MAXFIN_WORKBOOK_MODULE: path.join(src, WB) },
  });
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
  const out = mutant.suite === 'pure' ? runPure(src) : runDialog(mutant.name, src, mutant.filter);
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const failLines = text.split('\n').filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  const bit = out.status !== 0 && failLines.some((l) => l.includes(mutant.expect));
  const verdict = bit ? (mutant.survives ? 'BIT (unexpected)' : 'bit') : mutant.survives ? 'survived (expected)' : 'SURVIVED';
  results.push({ name: mutant.name, verdict, fails: failLines.length });
  console.log(`${verdict.padEnd(20)} ${mutant.name}  (${failLines.length} failing: ${failLines.slice(0, 3).join(' | ').slice(0, 220)})`);
  if (!bit && !mutant.survives) console.log(text.split('\n').slice(-12).join('\n'));
  cleanup(mutant.name);
}
fs.rmSync(path.join(here, 'mut'), { recursive: true, force: true });
const bad = results.filter((r) => r.verdict === 'SURVIVED' || r.verdict === 'BIT (unexpected)');
console.log(`\n${results.length} mutants: ${results.filter((r) => r.verdict === 'bit').length} bit, `
  + `${results.filter((r) => r.verdict === 'survived (expected)').length} survived as documented, ${bad.length} unexpected`);
process.exit(bad.length ? 1 : 0);
