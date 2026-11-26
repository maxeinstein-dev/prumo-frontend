// Bite-checks of the forecast strategies: one mutant per guard, built from a scratch copy of the frontend src; the named scenario (dialog-sim) or
// the named check of the pure suite (t22) must FAIL on the mutant. usage: FRONTEND_DIR=<frontend> BACKEND_DIR=<backend> [TSX_CLI=<tsx/dist/cli.mjs>] node bite-forecast.mjs [nameFilter]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(process.env.FRONTEND_DIR ?? path.join(here, '../..'));
const BACK = process.env.BACKEND_DIR ? path.resolve(process.env.BACKEND_DIR) : '';
const TSX_CLI = process.env.TSX_CLI ?? path.resolve(BACK || '.', 'node_modules/tsx/dist/cli.mjs');
const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bite-forecast-'));
const copy = path.join(tmp, 'src');
fs.cpSync(path.join(FRONT, 'src'), copy, { recursive: true });
// utils/calculations.ts needs date-fns: the scratch copy sees the checkout's node_modules through a junction (removed with unlink, never recursively)
fs.symlinkSync(path.join(FRONT, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');

const BD = 'utils/businessDays.ts';
const FS = 'utils/forecastStrategy.ts';
const CR = 'utils/confirmReceipt.ts';
const CALC = 'utils/calculations.ts';
const FIELD = 'components/transactions/ForecastStrategyField.tsx';
const DIALOG = 'components/ConfirmReceiptDialog.tsx';

// kind 'pure': the suite t22 must print a FAIL line that matches `expect`; 'sim': the jsdom scenarios must.
const MUTANTS = [
  // calendar
  { kind: 'pure', name: 'cal-black-awareness-always', file: BD, from: 'const FIRST_YEAR_BLACK_AWARENESS = 2024;', to: 'const FIRST_YEAR_BLACK_AWARENESS = 1900;', expect: /20\/11 is a national holiday only from 2024/ },
  { kind: 'pure', name: 'cal-no-good-friday', file: BD, from: 'off.add(keyOf(shift(easter, -2))); // Good Friday', to: '', expect: /other months of 2026|moves with Easter/ },
  { kind: 'pure', name: 'cal-carnival-off-by-one', file: BD, from: "off.add(keyOf(shift(easter, -48)));", to: "off.add(keyOf(shift(easter, -49)));", expect: /other months of 2026|parity/ },
  { kind: 'pure', name: 'cal-corpus-christi-plus-59', file: BD, from: "off.add(keyOf(shift(easter, 60)));", to: "off.add(keyOf(shift(easter, 59)));", expect: /other months of 2026|parity/ },
  { kind: 'pure', name: 'cal-easter-gauss-off', file: BD, from: 'const d = Math.floor(b / 4);', to: 'const d = Math.floor(b / 3);', expect: /Easter/ },
  { kind: 'pure', name: 'cal-no-non-working-days', file: BD, from: 'off.add(`${pad(year, 4)}-${entry}`);', to: '', expect: /dias sem vale/ },
  { kind: 'pure', name: 'cal-weekend-counts', file: BD, from: 'if (weekday !== 0 && weekday !== 6 && !off.has(keyOf(date))) count += 1;', to: 'if (weekday !== 0 && !off.has(keyOf(date))) count += 1;', expect: /reference data|parity/ },
  // the twin of expectedAmountFor
  { kind: 'pure', name: 'twin-income-takes-max', file: FS, from: "kind === 'INCOME' ? Math.min(...used) : Math.max(...used)", to: "kind === 'INCOME' ? Math.max(...used) : Math.min(...used)", expect: /CONSERVATIVE income|CONSERVATIVE expense|parity|expectedAmountFor/ },
  { kind: 'pure', name: 'twin-window-defaults-swapped', file: FS, from: "return kind === 'INCOME' ? DEFAULT_WINDOW.INCOME : DEFAULT_WINDOW.EXPENSE;", to: "return kind === 'INCOME' ? DEFAULT_WINDOW.EXPENSE : DEFAULT_WINDOW.INCOME;", expect: /CONSERVATIVE income|CONSERVATIVE expense|parity/ },
  { kind: 'pure', name: 'twin-margin-not-clamped', file: FS, from: 'const counted = Math.max(0, businessDays - safety);', to: 'const counted = businessDays - safety;', expect: /margin discounts days|parity/ },
  { kind: 'pure', name: 'twin-float-money', file: FS, from: 'amount: centsToReais(reaisToCents(rate) * counted),', to: 'amount: rate * counted,', expect: /without drift|every strategy/ },
  { kind: 'pure', name: 'twin-fixed-adopts-history', file: FS, from: 'return { amount: fields.amount, strategy };\n}', to: "return { amount: strategy === 'FIXED' && history.length ? history[0].amount : fields.amount, strategy };\n}", expect: /LAST and FIXED|parity/ },
  { kind: 'pure', name: 'twin-unknown-strategy-not-last', file: FS, from: ": 'LAST';\n\nexport function windowOf", to: ": 'FIXED';\n\nexport function windowOf", expect: /unknown strategy|expectedAmountFor|older server|explanation of an occurrence/ },
  { kind: 'pure', name: 'twin-no-rate-no-fallback', file: FS, from: 'if (rate === null || rate === undefined || !(rate > 0) || !isMonthKey(referenceMonth)) return fallback;', to: 'if (rate === null || rate === undefined || !isMonthKey(referenceMonth)) return fallback;', expect: /without a rate|parity/ },
  { kind: 'pure', name: 'twin-conservative-ignores-window', file: FS, from: 'history.slice(0, window).map', to: 'history.map', expect: /SMALLEST of the last 6|parity|N per recurrence/ },
  // form draft
  { kind: 'pure', name: 'draft-window-zero-allowed', file: FS, from: 'if (!(n >= 1 && n <= MAX_WINDOW)) errors.window', to: 'if (!(n >= 0 && n <= MAX_WINDOW)) errors.window', expect: /validation checks only/ },
  { kind: 'pure', name: 'draft-invalid-day-accepted', file: FS, from: 'if (key && isValidNonWorkingDay(key)) days.add(key);', to: 'if (key) days.add(key);', expect: /"dias sem vale" typed/ },
  { kind: 'pure', name: 'draft-payload-keeps-stale-values', file: FS, from: "const perDay = draft.strategy === 'PER_BUSINESS_DAY';\n  const optional", to: "const perDay = true;\n  const optional", expect: /request fields/ },
  { kind: 'pure', name: 'draft-per-day-any-frequency', file: FS, from: "if (frequency.toLowerCase() !== 'monthly') errors.frequency", to: "if (false) errors.frequency", expect: /validation checks only/ },
  { kind: 'pure', name: 'draft-reference-amount-zero', file: FS, from: 'return forecast > 0 ? forecast : rate;', to: 'return forecast;', expect: /amount stored on a per-day/ },
  // implied days and the notes of the confirmation
  { kind: 'pure', name: 'implied-days-unrounded', file: FS, from: 'return Math.round((receivedCents * 100) / rateCents) / 100;', to: 'return receivedCents / rateCents;', expect: /implied days/ },
  { kind: 'pure', name: 'implied-days-loose-tolerance', file: FS, from: 'if (Math.abs(days - countedDays) < 0.005)', to: 'if (Math.abs(days - countedDays) < 1)', expect: /the note under the amount/ },
  { kind: 'pure', name: 'implied-days-same-advice-both-ways', file: FS, from: 'const advice = days < countedDays', to: 'const advice = true', expect: /the note under the amount/ },
  { kind: 'pure', name: 'note-fixed-silent', file: FS, from: "return 'a previsão dos próximos meses continua o valor fixo';", to: 'return null;', expect: /difference hint/ },
  { kind: 'pure', name: 'hint-ignores-strategy', file: CR, from: "const note = confirmedValueNote(strategy);", to: "const note = null;", expect: /difference hint/ },
  { kind: 'pure', name: 'explanation-conservative-guesses-today', file: FS, from: "todayCents: detail.strategy === 'CONSERVATIVE' ? null : reaisToCents(detail.amount)", to: 'todayCents: reaisToCents(detail.amount)', expect: /the explanation of an occurrence/ },
  { kind: 'pure', name: 'explanation-last-explained', file: FS, from: "normalizeStrategy(recurrence.forecastStrategy) === 'LAST') return null;", to: "normalizeStrategy(recurrence.forecastStrategy) === 'NONE') return null;", expect: /the explanation of an occurrence/ },
  // month views
  { kind: 'pure', name: 'calc-projects-registered-amount', file: CALC, all: true, from: "amount: projectedOccurrenceAmount(recurring, recurring.type === TransactionType.INCOME ? 'INCOME' : 'EXPENSE', currentDate, recurring.competenceOffsetMonths),", to: 'amount: recurring.amount,', expect: /per-day recurrence projects|reference month is the month|conservative: the server/ },
  { kind: 'pure', name: 'projected-ignores-offset', file: FS, from: 'const referenceMonth = nextReferenceMonth(occurrenceDate, offsetMonths);', to: 'const referenceMonth = nextReferenceMonth(occurrenceDate, 0);', expect: /reference month is the month of the occurrence/ },
  { kind: 'pure', name: 'projected-conservative-any-month', file: FS, from: "server.referenceMonth === referenceMonth ? server.amount : recurrence.amount", to: "server ? server.amount : recurrence.amount", expect: /conservative: the server forecast/ },
  // the field and the dialog (jsdom)
  { kind: 'sim', name: 'field-follow-last-in-every-mode', file: FIELD, from: "{draft.strategy === 'LAST' && lastExtra}", to: '{lastExtra}', expect: /FS2/ },
  { kind: 'sim', name: 'field-strategy-change-ignored', file: FIELD, from: 'onValueChange={(value) => set({ strategy: value as ForecastStrategy })}', to: 'onValueChange={() => set({})}', expect: /FS2|FS3|FS4/ },
  { kind: 'sim', name: 'field-rate-error-at-once', file: FIELD, from: 'const rateError = showErrors ? check.errors.dailyRate : undefined;', to: 'const rateError = check.errors.dailyRate;', expect: /FS6/ },
  { kind: 'sim', name: 'field-rate-cleared-by-extra-digit', file: FIELD, from: 'if (masked.cents === null && /\\d/.test(e.target.value)) return;', to: '', expect: /FS9/ },
  { kind: 'sim', name: 'field-window-default-swapped', file: FIELD, from: "`Padrão: ${kind === 'INCOME' ? DEFAULT_WINDOW.INCOME : DEFAULT_WINDOW.EXPENSE}`", to: "`Padrão: ${kind === 'INCOME' ? DEFAULT_WINDOW.EXPENSE : DEFAULT_WINDOW.INCOME}`", expect: /FS3/ },
  { kind: 'sim', name: 'field-preview-without-month', file: FIELD, from: "Previsão{referenceMonth ? ` de ${monthLabel(referenceMonth)}` : ''}:", to: 'Previsão:', expect: /FS4|FS5|FS8/ },
  { kind: 'sim', name: 'field-window-keeps-letters', file: FIELD, from: "set({ windowText: e.target.value.replace(/\\D/g, '').slice(0, 2) })", to: 'set({ windowText: e.target.value })', expect: /FS3/ },
  { kind: 'sim', name: 'field-carnival-ignored', file: FIELD, from: 'onChange={(e) => set({ carnival: e.target.checked })}', to: 'onChange={() => set({})}', expect: /FS5/ },
  { kind: 'sim', name: 'dialog-no-how-line', file: DIALOG, from: '{explanation && (\n            <p', to: '{false && (\n            <p', expect: /FS10|FS13|FS15|FS16/ },
  { kind: 'sim', name: 'dialog-no-days-note', file: DIALOG, from: '{daysNote && (', to: '{false && (', expect: /FS10|FS11|FS13/ },
  { kind: 'sim', name: 'dialog-no-suggestion', file: DIALOG, from: '{daysNote?.suggestion && (', to: '{false && (', expect: /FS11|FS13|FS14/ },
  { kind: 'sim', name: 'dialog-hint-ignores-strategy', file: DIALOG, from: 'followsLastAmount, format, explanation?.strategy)', to: 'followsLastAmount, format)', expect: /FS11|FS15|FS16/ },
  { kind: 'sim', name: 'dialog-todays-configuration-null-as-zero', file: DIALOG, from: 'explanation.todayCents !== null && explanation.todayCents !== expectedCents ?', to: 'explanation.todayCents !== expectedCents ?', expect: /FS16/ },
  { kind: 'sim', name: 'dialog-no-todays-configuration', file: DIALOG, from: '{explanation.todayCents !== null && explanation.todayCents !== expectedCents ?', to: '{false ?', expect: /FS13/ },
  { kind: 'sim', name: 'dialog-days-note-for-every-strategy', file: DIALOG, from: 'const daysNote = explanation?.perDay', to: 'const daysNote = explanation', expect: /FS15|FS16/ },
];

let bad = 0;
for (const m of MUTANTS) {
  if (only && !only.test(m.name)) continue;
  const target = path.join(copy, m.file);
  const original = fs.readFileSync(target, 'utf8');
  const source = original.replace(/\r\n/g, '\n');
  const count = source.split(m.from).length - 1;
  if (m.all ? count < 1 : count !== 1) { console.log(`SKIP ${m.name}: pattern found ${count} times`); bad += 1; continue; }
  fs.writeFileSync(target, m.all ? source.split(m.from).join(m.to) : source.replace(m.from, () => m.to));
  let out = '';
  try {
    if (m.kind === 'pure') {
      out = execFileSync('node', [TSX_CLI, 'run-forecast.mts'], { cwd: path.resolve(here, '..'), env: { ...process.env, FRONTEND_DIR: tmp, BACKEND_DIR: BACK }, stdio: 'pipe' }).toString();
    } else {
      execFileSync('node', ['build-forecast.mjs', copy], { cwd: here, env: { ...process.env, FRONTEND_DIR: FRONT }, stdio: 'pipe' });
      out = execFileSync('node', ['forecast-scenarios.mjs'], { cwd: here, env: process.env, stdio: 'pipe' }).toString();
    }
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const caught = out.split('\n').some((l) => l.includes('FAIL') && m.expect.test(l));
  console.log(`${caught ? 'CAUGHT' : 'MISSED'} ${m.name}${caught ? '' : '\n' + out.split('\n').filter((l) => /FAIL|rror/.test(l)).slice(0, 4).join('\n')}`);
  if (!caught) bad += 1;
  fs.writeFileSync(target, original);
}
fs.unlinkSync(path.join(tmp, 'node_modules'));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
