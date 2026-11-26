// usage: node bite-adjust.mjs [mutantNameFilter]
// Bite-checks of "Ajustar saldo" (utils/adjustBalance.ts and components/accounts/AdjustBalanceDialog.tsx): every mutant
// breaks ONE guard in a scratch copy made by mutate.mjs (mut-adjust/<name>/src) and the named test must then FAIL, in the pure
// suite (../t19_adjust_balance.mts with ADJUST_BALANCE_MODULE pointing at the mutated file) or in the dialog simulation
// (build + the filtered AJ scenarios). A mutant marked `survives` documents a guard that another layer also covers.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const MUT = 'mut-adjust';
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const LOGIC = 'utils/adjustBalance.ts';
const DLG = 'components/accounts/AdjustBalanceDialog.tsx';
const ENV = { [LOGIC]: 'ADJUST_BALANCE_MODULE' };

const MUTANTS = [
  // ---- pure --------------------------------------------------------------------------------------------------
  { name: 'mask-negative-zero', suite: 'pure', rel: LOGIC, old: 'cents: negative && abs !== 0 ? -abs : abs', neu: 'cents: negative ? -abs : abs', expect: 'AB-c' },
  { name: 'mask-digits-uncapped', suite: 'pure', rel: LOGIC, old: '.slice(0, MAX_ADJUST_DIGITS);', neu: ';', expect: 'AB-d' },
  { name: 'mask-empty-is-zero', suite: 'pure', rel: LOGIC, old: "if (!digits) return { cents: null, display: negative ? '-' : '' };", neu: "if (!digits) return { cents: 0, display: negative ? '-' : '' };", expect: 'AB-b' },
  { name: 'mask-no-thousands', suite: 'pure', rel: LOGIC, old: ".replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.')", neu: '', expect: 'AB-a' },
  { name: 'reais-truncates', suite: 'pure', rel: LOGIC, old: 'Math.round(value * 100 + (value < 0 ? -1e-6 : 1e-6))', neu: 'Math.trunc(value * 100)', expect: 'AB-e' },
  { name: 'date-accepts-impossible-day', suite: 'pure', rel: LOGIC, old: 'return parsed.getFullYear() === y && parsed.getMonth() === mo - 1 && parsed.getDate() === d;', neu: 'return true;', expect: 'AB-f' },
  { name: 'today-in-utc', suite: 'pure', rel: LOGIC, old: "return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;", neu: 'return now.toISOString().slice(0, 10);', expect: 'AB-f' },
  { name: 'previous-year-is-this-year', suite: 'pure', rel: LOGIC, old: 'return `${now.getFullYear() - 1}-12-31`;', neu: 'return `${now.getFullYear()}-12-31`;', expect: 'AB-f' },
  { name: 'reason-first-day-is-opening', suite: 'pure', rel: LOGIC, old: 'date < `${now.getFullYear()}-01-01`', neu: 'date <= `${now.getFullYear()}-01-01`', expect: 'AB-g' },
  { name: 'reason-always-adjust', suite: 'pure', rel: LOGIC, old: '? OPENING_BALANCE_REASON : DEFAULT_ADJUST_REASON', neu: '? DEFAULT_ADJUST_REASON : DEFAULT_ADJUST_REASON', expect: 'AB-g' },
  { name: 'validate-allows-zero-difference', suite: 'pure', rel: LOGIC, old: 'else if (differenceCents === 0) errors.target', neu: 'else if (false) errors.target', expect: 'AB-h' },
  { name: 'validate-allows-future', suite: 'pure', rel: LOGIC, old: 'else if (input.date > todayIsoDate(now)) errors.date', neu: 'else if (false) errors.date', expect: 'AB-h' },
  { name: 'validate-today-is-future', suite: 'pure', rel: LOGIC, old: 'input.date > todayIsoDate(now)', neu: 'input.date >= todayIsoDate(now)', expect: 'AB-h' },
  { name: 'validate-reason-unbounded', suite: 'pure', rel: LOGIC, old: 'if (input.reason.trim().length > MAX_REASON_LENGTH)', neu: 'if (false)', expect: 'AB-h' },
  { name: 'difference-sign-flipped', suite: 'pure', rel: LOGIC, old: 'input.targetCents === null ? null : input.targetCents - input.currentCents', neu: 'input.targetCents === null ? null : input.currentCents - input.targetCents', expect: 'AB-h' },
  { name: 'body-cents-as-reais', suite: 'pure', rel: LOGIC, old: 'newBalance: input.targetCents / 100,', neu: 'newBalance: input.targetCents,', expect: 'AB-j' },
  { name: 'body-reason-not-defaulted', suite: 'pure', rel: LOGIC, old: 'reason: input.reason.trim() || defaultAdjustReason(input.date, now),', neu: 'reason: input.reason.trim(),', expect: 'AB-j' },
  { name: 'body-without-validation', suite: 'pure', rel: LOGIC, old: 'if (!validateAdjust(input, now).ok || input.targetCents === null) return null;', neu: 'if (input.targetCents === null) return null;', expect: 'AB-k' },
  { name: 'sentence-direction-flipped', suite: 'pure', rel: LOGIC, old: "differenceCents > 0 ? 'uma entrada' : 'uma saída'", neu: "differenceCents > 0 ? 'uma saída' : 'uma entrada'", expect: 'AB-l' },
  // ---- dialog ------------------------------------------------------------------------------------------------
  { name: 'dlg-ready-without-confirm', suite: 'dialog', filter: '^AJ2 ', rel: DLG, old: 'const ready = check.ok && confirmed && diff !== null;', neu: 'const ready = check.ok && diff !== null;', expect: 'AJ2' },
  { name: 'dlg-edit-keeps-confirmation', suite: 'dialog', filter: '^AJ8 ', rel: DLG, old: '    apply();\n    setConfirmed(false);', neu: '    apply();', expect: 'AJ8' },
  { name: 'dlg-date-keeps-confirmation', suite: 'dialog', filter: '^AJ8 ', rel: DLG, old: '  const handleDate = (value: string) => edit(() => {\n    setDate(value);\n    if (!reasonEditedRef.current) setReason(defaultAdjustReason(value));\n  });', neu: '  const handleDate = (value: string) => {\n    setDate(value);\n    if (!reasonEditedRef.current) setReason(defaultAdjustReason(value));\n  };', expect: 'AJ8' },
  { name: 'dlg-reason-overwritten', suite: 'dialog', filter: '^AJ3 ', rel: DLG, old: 'if (!reasonEditedRef.current) setReason(defaultAdjustReason(value));', neu: 'setReason(defaultAdjustReason(value));', expect: 'AJ3' },
  { name: 'dlg-reason-never-follows-date', suite: 'dialog', filter: '^AJ3 ', rel: DLG, old: 'if (!reasonEditedRef.current) setReason(defaultAdjustReason(value));', neu: '', expect: 'AJ3' },
  { name: 'dlg-closable-while-saving', suite: 'dialog', filter: '^AJ9 ', rel: DLG, old: 'canClose={!saving}', neu: 'canClose', expect: 'AJ9' },
  { name: 'dlg-cancel-enabled-while-saving', suite: 'dialog', filter: '^AJ9 ', rel: DLG, old: '<button type="button" onClick={onClose} disabled={saving} className={BTN_SECONDARY}>', neu: '<button type="button" onClick={onClose} className={BTN_SECONDARY}>', expect: 'AJ9' },
  { name: 'dlg-fields-not-locked-while-saving', suite: 'dialog', filter: '^AJ9 ', rel: DLG, old: 'value={target.display} disabled={saving}', neu: 'value={target.display}', expect: 'AJ9' },
  // The disabled button and the ref guard cover the same double submit: mutating both lets the second request through,
  // mutating only the ref guard leaves the disabled button doing the job.
  { name: 'dlg-double-submit-no-guards', suite: 'dialog', filter: '^AJ9 ', rel: DLG, old: 'if (!accountId || savingRef.current || !confirmed) return;', neu: 'if (!accountId || !confirmed) return;', extra: [['disabled={saving || !ready} className={BTN_PRIMARY}', 'disabled={!ready} className={BTN_PRIMARY}']], expect: 'AJ9' },
  { name: 'dlg-ref-guard-only', suite: 'dialog', filter: '^AJ9 ', rel: DLG, old: 'if (!accountId || savingRef.current || !confirmed) return;', neu: 'if (!accountId || !confirmed) return;', survives: true, expect: 'AJ9' },
  { name: 'dlg-stale-answer-closes-new-dialog', suite: 'dialog', filter: '^AJ12 ', rel: DLG, old: 'if (opening === openingRef.current && mountedRef.current) {\n        // Applied', neu: 'if (mountedRef.current) {\n        // Applied', expect: 'AJ12' },
  { name: 'dlg-date-not-capped', suite: 'dialog', filter: '^AJ7 ', rel: DLG, old: 'max={todayIsoDate()}', neu: '', expect: 'AJ7' },
  { name: 'dlg-reopen-keeps-target', suite: 'dialog', filter: '^AJ13 ', rel: DLG, old: "    setTargetText('');\n    setDate(today);", neu: '    setDate(today);', expect: 'AJ13' },
  { name: 'dlg-reopen-keeps-confirmation', suite: 'dialog', filter: '^AJ13 ', rel: DLG, old: '    setConfirmed(false);\n    setFormError(null);\n  }, [open, accountId]);', neu: '    setFormError(null);\n  }, [open, accountId]);', expect: 'AJ13' },
  { name: 'dlg-confirmation-kept-after-success', suite: 'dialog', filter: '^AJ14 ', rel: DLG, old: '        setConfirmed(false);\n        onClose();', neu: '        onClose();', expect: 'AJ14' },
  { name: 'dlg-body-rounds-balance', suite: 'dialog', filter: '^AJ4 ', rel: DLG, old: 'mutation.mutateAsync({ accountId, ...body })', neu: 'mutation.mutateAsync({ accountId, ...body, newBalance: Math.round(body.newBalance) })', expect: 'AJ4' },
  { name: 'dlg-same-balance-error-hidden', suite: 'dialog', filter: '^AJ6 ', rel: DLG, old: '{targetText && check.errors.target && <p', neu: '{false && <p', expect: 'AJ6' },
  { name: 'dlg-error-not-shown', suite: 'dialog', filter: '^AJ10 ', rel: DLG, old: '{formError && <p role="alert" className={ERROR_CLS}>{formError}</p>}', neu: '', expect: 'AJ10' },
  { name: 'dlg-no-toast-on-error', suite: 'dialog', filter: '^AJ10 ', rel: DLG, old: '      showError(message);', neu: '', expect: 'AJ10' },
  { name: 'dlg-null-adjustment-says-adjusted', suite: 'dialog', filter: '^AJ11 ', rel: DLG, old: 'success(result.adjustment && sentDiff !== null', neu: 'success(sentDiff !== null', expect: 'AJ11' },
];

function makeMutant({ name, rel, old, neu, extra = [] }) {
  const out = spawnSync(process.execPath, ['mutate.mjs', name, rel, old, neu], { cwd: here, encoding: 'utf8', env: { ...process.env, MUT_DIR: MUT } });
  if (out.status !== 0) throw new Error(`${name}: mutate.mjs failed\n${out.stdout}${out.stderr}`);
  const dest = path.join(here, MUT, name, 'src');
  // Further exact replacements in the same file (a mutant that must break two guards at once).
  for (const [o, n] of extra) {
    const file = path.join(dest, rel);
    const text = fs.readFileSync(file, 'utf8');
    if (text.split(o).length !== 2) throw new Error(`${name}: extra pattern must occur once: ${o}`);
    fs.writeFileSync(file, text.replace(o, () => n));
  }
  return dest;
}

function cleanup(name) {
  fs.rmSync(path.join(here, MUT, name), { recursive: true, force: true });
  fs.rmSync(path.join(here, 'out', `${name}.mjs`), { force: true });
  fs.rmSync(path.join(here, `entry.${name}.tsx`), { force: true });
}

function runPure(src, rel) {
  return spawnSync(process.execPath, [TSX_CLI, 't19_adjust_balance.mts'], {
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
  if (filter && !filter.test(mutant.name)) continue;
  const src = makeMutant(mutant);
  const out = mutant.suite === 'pure' ? runPure(src, mutant.rel) : runDialog(mutant.name, src, mutant.filter);
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const failLines = text.split('\n').filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  // t19 alone does not set the exit code (only run.mts calls summary()): for the pure suite the FAIL lines decide.
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
