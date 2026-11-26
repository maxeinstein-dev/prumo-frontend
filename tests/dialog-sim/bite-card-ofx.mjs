// usage: node bite-card-ofx.mjs [mutantNameFilter]
// Bite-checks of the card invoice (.ofx) import (phase 3): every mutant breaks ONE guard in a scratch copy made by
// mutate.mjs (mut/<name>/src) and the named test must then FAIL, in the pure suite (../run.mts with CARD_OFX_MODULE
// pointing at the mutated utils/cardOfx.ts) or in the dialog simulation (build + the filtered scenarios).
// `survives: true` marks a guard the simulation cannot observe (documented, not a failure of this script).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const LOGIC = 'utils/cardOfx.ts';
const DLG = 'components/ImportCardOfxDialog.tsx';
const HOOK = 'hooks/api/useImportCardOfx.ts';
const GENERIC = 'components/ImportTransactionsDialog.tsx';

const MUTANTS = [
  // ---- pure logic ------------------------------------------------------------------------------------------
  { name: 'p-refresh-late', suite: 'pure', rel: LOGIC,
    old: "  if (needsRefresh) return { code: 'needs-refresh', message: 'Atualize a pré-visualização antes de confirmar de novo.' };\n  if (!built) return { code: 'none-selected', message: 'Selecione ao menos uma proposta.' };",
    neu: "  if (!built) return { code: 'none-selected', message: 'Selecione ao menos uma proposta.' };\n  if (built.selected.length === 0 && built.payload.payment?.apply !== true) return { code: 'none-selected', message: '-' };\n  if (needsRefresh) return { code: 'needs-refresh', message: 'Atualize a pré-visualização antes de confirmar de novo.' };",
    expect: 'needs-refresh comes first' },
  { name: 'p-default-ambiguous', suite: 'pure', rel: LOGIC,
    old: 'return group.sendable && group.proposal.defaultSelected === true && group.proposal.ambiguous !== true;',
    neu: 'return group.sendable && group.proposal.defaultSelected === true;',
    expect: 'defaults: what the server marks' },
  { name: 'p-bulk-ambiguous', suite: 'pure', rel: LOGIC,
    old: 'for (const group of groups) if (group.sendable && group.proposal.ambiguous !== true) next[group.proposal.group] = true;',
    neu: 'for (const group of groups) if (group.sendable) next[group.proposal.group] = true;',
    expect: 'bulk ticks skip ambiguous' },
  { name: 'p-selection-forgets', suite: 'pure', rel: LOGIC,
    old: '    next[id] = keep ? prevSelection[id] === true : defaultGroupSelected(group);', neu: '    next[id] = defaultGroupSelected(group);',
    expect: 'a re-run keeps the choice' },
  { name: 'p-unknown-kind-sendable', suite: 'pure', rel: LOGIC,
    old: "      sendable: section !== 'other' && !!proposal.group && lines.length > 0 && missingRefs.length === 0 && !repeated,",
    neu: '      sendable: !!proposal.group && lines.length > 0 && missingRefs.length === 0 && !repeated,',
    expect: 'an unknown kind, a missing ref' },
  { name: 'p-missing-ref-sendable', suite: 'pure', rel: LOGIC,
    old: "      sendable: section !== 'other' && !!proposal.group && lines.length > 0 && missingRefs.length === 0 && !repeated,",
    neu: "      sendable: section !== 'other' && !!proposal.group && lines.length > 0 && !repeated,",
    expect: 'an unknown kind, a missing ref' },
  { name: 'p-repeated-id-sendable', suite: 'pure', rel: LOGIC,
    old: "      sendable: section !== 'other' && !!proposal.group && lines.length > 0 && missingRefs.length === 0 && !repeated,",
    neu: "      sendable: section !== 'other' && !!proposal.group && lines.length > 0 && missingRefs.length === 0,",
    expect: 'an unknown kind, a missing ref' },
  { name: 'rv-lines-sorted', suite: 'pure', rel: LOGIC, old: '    lines: preview.lines.map(toConfirmLine),',
    neu: '    lines: [...preview.lines].sort((a, b) => (a.ref < b.ref ? -1 : 1)).map(toConfirmLine),', expect: 'RV4' },
  { name: 'rv-lines-sorted-dlg', suite: 'dialog', filter: '^RV-S4', rel: LOGIC, old: '    lines: preview.lines.map(toConfirmLine),',
    neu: '    lines: [...preview.lines].sort((a, b) => (a.ref < b.ref ? -1 : 1)).map(toConfirmLine),', expect: 'RV-S4' },
  { name: 'rv-future-ticked-stored-amount', suite: 'pure', rel: LOGIC,
    old: '        const written = consumed && ticked ? group.lines.find((line) => line.type === target.type)?.amount : undefined;',
    neu: '        const written = undefined as number | undefined;',
    expect: 'RV2' },
  { name: 'rv-future-outside-period-counts', suite: 'pure', rel: LOGIC,
    old: '        if (consumed && !ticked && !(target.date >= preview.period.start && target.date <= preview.period.end)) continue;\n', neu: '',
    expect: 'RV3' },
  { name: 'rv-future-period-open-end', suite: 'pure', rel: LOGIC,
    old: 'target.date >= preview.period.start && target.date <= preview.period.end', neu: 'target.date >= preview.period.start && target.date < preview.period.end',
    expect: 'RV3' },
  { name: 'rv-inactive-source-offered', suite: 'pure', rel: LOGIC,
    old: '  return accounts.filter((a) => a.type !== AccountType.CREDIT && a.isActive !== false);', neu: '  return accounts.filter((a) => a.type !== AccountType.CREDIT);',
    expect: 'inactive accounts' },
  { name: 'rv-confirm-while-refreshing', suite: 'dialog', filter: '^RV-S5', rel: DLG,
    old: 'onClick={onConfirm} disabled={busy || blocker !== null}', neu: 'onClick={onConfirm} disabled={isConfirming || blocker !== null}', expect: 'RV-S5' },
  { name: 'rv-adjust-select-hidden', suite: 'dialog', filter: '^RV-S2', rel: DLG,
    old: '          {needsSource && choice.apply && (', neu: "          {payment.proposal === 'create' && choice.apply && (", expect: 'RV-S2' },
  { name: 'rv-household-from-prop', suite: 'dialog', filter: '^RV-S6', rel: DLG,
    old: '    saveCategoryChoices(preview?.householdId || householdId, { [key]: target });', neu: '    saveCategoryChoices(householdId, { [key]: target });', expect: 'RV-S6' },
  { name: 'rv-no-latest-wins-across-close', suite: 'dialog', filter: '^RV-S8', rel: DLG,
    old: '    return () => {\n      seqRef.current += 1;\n    };\n  }, [open, initialFile]);', neu: '  }, [open, initialFile]);',
    expect: 'RV-S8' },
  { name: 'p-lines-raw', suite: 'pure', rel: LOGIC, old: '    lines: preview.lines.map(toConfirmLine),', neu: '    lines: preview.lines,',
    expect: 'every line is echoed' },
  { name: 'p-category-all-merchants', suite: 'pure', rel: LOGIC,
    old: '    .filter((entry) => used.has(categoryChoiceKey(entry.type, entry.key)))\n', neu: '',
    expect: 'categoryMap: only the merchants' },
  { name: 'p-payment-source-on-adjust', suite: 'pure', rel: LOGIC,
    old: '  return paymentNeedsSource(payment) ? { apply: true, sourceAccountId: choice.sourceAccountId } : { apply: true };',
    neu: '  return { apply: true, sourceAccountId: choice.sourceAccountId };',
    expect: 'payment decision' },
  { name: 'p-adjust-without-source-asks-nothing', suite: 'pure', rel: LOGIC,
    old: "  return payment?.proposal === 'adjust' && !payment.recorded?.sourceAccountId;", neu: '  return false;',
    expect: 'RV1' },
  { name: 'p-payment-source-unchecked', suite: 'pure', rel: LOGIC,
    old: '  const paymentProblem = paymentNeedsSource(payment) && paymentChoice.apply',
    neu: '  const paymentProblem = false && paymentChoice.apply',
    expect: 'payment create: the source account is required' },
  { name: 'rv-problem-only-for-create', suite: 'pure', rel: LOGIC,
    old: '  const paymentProblem = paymentNeedsSource(payment) && paymentChoice.apply',
    neu: "  const paymentProblem = payment?.proposal === 'create' && paymentChoice.apply",
    expect: 'RV1' },
  { name: 'p-payment-source-card', suite: 'pure', rel: LOGIC,
    old: '  if (account.type === AccountType.CREDIT) return PAYMENT_SOURCE_PROBLEM.isCard;\n', neu: '',
    expect: 'payment create: the source account is required' },
  { name: 'p-float-cents', suite: 'pure', rel: LOGIC,
    old: "  return type === 'INCOME' ? -toCents(amount) : toCents(amount);", neu: "  return type === 'INCOME' ? -amount * 100 : amount * 100;",
    expect: 'integer cents' },
  { name: 'p-recta-ticked-targets-only', suite: 'pure', rel: LOGIC,
    old: "    if (group.section === 'matched' || group.section === 'futures') {",
    neu: "    if ((group.section === 'matched' || group.section === 'futures') && isGroupSelected(selection, group)) {",
    expect: 'OFX total vs Recta' },
  { name: 'p-recta-counts-payments', suite: 'pure', rel: LOGIC, old: '    if (group.hasPayment) continue;\n', neu: '',
    expect: 'OFX total vs Recta' },
  { name: 'p-no-conflict', suite: 'pure', rel: LOGIC,
    old: '    else if (owner !== id) {\n      conflicts.add(owner);\n      conflicts.add(id);\n    }', neu: '    else if (owner !== id) {\n    }',
    expect: 'two ticked groups' },
  { name: 'p-handoff-any-account', suite: 'pure', rel: LOGIC,
    old: '  return accountType === AccountType.CREDIT && isOfxFileName(fileName);', neu: '  return isOfxFileName(fileName);',
    expect: 'isCardOfxHandoff' },
  { name: 'p-notice-always', suite: 'pure', rel: LOGIC,
    old: '  if (!sections.created.some((group) => group.sendable && group.proposal.defaultSelected !== true)) return null;',
    neu: '  if (sections.created.length === 0) return null;',
    expect: 'newLinesNotice' },
  { name: 'p-file-limit', suite: 'pure', rel: LOGIC, old: '  if (file.size > CARD_OFX_MAX_FILE_BYTES) {', neu: '  if (file.size > CARD_OFX_MAX_FILE_BYTES + 1) {',
    expect: 'validateCardOfxFile' },
  { name: 'p-line-limit', suite: 'pure', rel: LOGIC, old: '  if (lineCount > CARD_OFX_MAX_LINES) {', neu: '  if (lineCount > CARD_OFX_MAX_LINES + 5) {',
    expect: 'more than 1000 lines' },
  // ---- dialog ----------------------------------------------------------------------------------------------
  { name: 'd-no-latest-wins', suite: 'dialog', filter: '^K5', rel: DLG,
    old: "      const data = await previewMutation.mutateAsync({ accountId, options: opts, file: target });\n      if (!isCurrent()) return 'stale';",
    neu: '      const data = await previewMutation.mutateAsync({ accountId, options: opts, file: target });',
    expect: 'K5' },
  { name: 'd-month-locked-while-refreshing', suite: 'dialog', filter: '^K5', rel: DLG,
    old: '                monthDisabled={isConfirming}', neu: '                monthDisabled={busy}',
    expect: 'K5' },
  { name: 'd-refresh-drops-override', suite: 'dialog', filter: '^K5', rel: DLG,
    old: '    await runPreview(file, monthOverride ? { monthOverride } : undefined);', neu: '    await runPreview(file);',
    expect: 'K5' },
  { name: 'd-no-needs-refresh', suite: 'dialog', filter: '^K4', rel: DLG,
    old: '  const blocker = preview ? cardOfxConfirmBlocker(built, confirmError !== null) : null;',
    neu: '  const blocker = preview ? cardOfxConfirmBlocker(built, false) : null;',
    expect: 'K4' },
  { name: 'd-failed-refresh-unblocks', suite: 'dialog', filter: '^K4', rel: DLG,
    old: "      if (!isCurrent()) return 'stale';\n      showError(getErrorMessage(err, 'Não foi possível pré-visualizar a fatura.'));",
    neu: "      if (!isCurrent()) return 'stale';\n      setConfirmError(null);\n      showError(getErrorMessage(err, 'Não foi possível pré-visualizar a fatura.'));",
    expect: 'K4' },
  { name: 'd-promise-when-stale', suite: 'dialog', filter: '^K4', rel: DLG,
    old: '          {promise && !stale && <p className={MUTED_CLS}>{promise}</p>}', neu: '          {promise && <p className={MUTED_CLS}>{promise}</p>}',
    expect: 'K4' },
  { name: 'd-confirm-ignores-blocker', suite: 'dialog', filter: '^K3', rel: DLG,
    old: '<button type="button" onClick={onConfirm} disabled={busy || blocker !== null} title={blocker?.message}',
    neu: '<button type="button" onClick={onConfirm} disabled={busy} title={blocker?.message}',
    expect: 'K3' },
  { name: 'd-cards-can-pay', suite: 'dialog', filter: '^K3', rel: DLG,
    old: '  const sources = paymentSourceAccounts(accounts);', neu: '  const sources = accounts;',
    expect: 'K3' },
  { name: 'd-esc-mid-confirm', suite: 'dialog', filter: '^K7', rel: DLG,
    old: "      if (e.key === 'Escape' && !confirmingRef.current) onClose();", neu: "      if (e.key === 'Escape') onClose();",
    expect: 'K7' },
  { name: 'd-backdrop-mid-confirm', suite: 'dialog', filter: '^K7', rel: DLG,
    old: '    if (!confirmingRef.current && !isConfirming) onClose();', neu: '    onClose();',
    expect: 'K7' },
  { name: 'd-no-new-lines-notice', suite: 'dialog', filter: '^K9', rel: DLG,
    old: '                  {notice && <NewLinesNoticeBox notice={notice} currency={baseCurrency} />}\n', neu: '',
    expect: 'K9' },
  { name: 'd-no-bulk-new', suite: 'dialog', filter: '^K9', rel: DLG,
    old: "                  bulk={{ selectAll: 'Marcar todas as novas', clear: 'Desmarcar todas as novas' }}>", neu: '                  >',
    expect: 'K9' },
  { name: 'd-no-advance-payments', suite: 'dialog', filter: '^K8', rel: DLG,
    old: '                <AdvancePayments lines={sections.advancePayments} paired={sections.pairedAdvancePayments} currency={baseCurrency} />\n', neu: '',
    expect: 'K8' },
  // The synchronous ref only matters between the click and React's re-render; the button is disabled from the
  // first render with isPending, so the simulation cannot click twice in between. Expected to survive.
  { name: 'd-confirm-ref-guard', suite: 'dialog', filter: '^K7', rel: DLG,
    old: '    if (!built || blocker || isConfirming || confirmingRef.current) return;', neu: '    if (!built || blocker || isConfirming) return;',
    expect: 'K7', survives: true },
  // ---- hook ------------------------------------------------------------------------------------------------
  { name: 'h-invalidate-on-success-only', suite: 'dialog', filter: '^K10', rel: HOOK,
    old: '    onSettled: () => {\n      // The card invoice lives under', neu: '    onSuccess: () => {\n      // The card invoice lives under',
    expect: 'K10' },
  { name: 'h-invoice-not-invalidated', suite: 'dialog', filter: '^K10', rel: HOOK,
    old: "      queryClient.invalidateQueries({ queryKey: ['transactions'] });\n", neu: '',
    expect: 'K10' },
  { name: 'h-preview-without-account', suite: 'dialog', filter: '^K1 ', rel: HOOK,
    old: "      formData.append('accountId', accountId);\n", neu: '',
    expect: 'K1' },
  // ---- generic import hand-off -----------------------------------------------------------------------------
  { name: 'g-no-handoff', suite: 'dialog', filter: '^K6', rel: GENERIC,
    old: '    if (account && isCardOfxHandoff(account.type, file.name)) {', neu: '    if (account && false) {',
    expect: 'K6' },
  { name: 'g-esc-stays-armed', suite: 'dialog', filter: '^K6', rel: GENERIC,
    old: '    if (!open || cardOfx) return;', neu: '    if (!open) return;',
    expect: 'K6' },
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

function runPure(src) {
  return spawnSync(process.execPath, [TSX_CLI, 'run.mts'], {
    cwd: FE_TESTS, encoding: 'utf8', env: { ...process.env, CARD_OFX_MODULE: path.join(src, LOGIC) },
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
