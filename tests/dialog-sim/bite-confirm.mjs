// Bite-checks of the confirm-receipt dialog: one mutant per guard, built from a scratch copy of the frontend src; the named scenario
// (or pure suite) must FAIL on the mutant. usage: FRONTEND_DIR=<frontend> node bite-confirm.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(process.env.FRONTEND_DIR ?? path.join(here, '../..'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bite-confirm-'));
const copy = path.join(tmp, 'src');
fs.cpSync(path.join(FRONT, 'src'), copy, { recursive: true });

const MUTANTS = [
  { name: 'always-send-amount', file: 'utils/confirmReceipt.ts', from: 'if (check.amountCents !== expectedCents) {', to: 'if (true) {', expect: /CF4/ },
  { name: 'no-double-submit-guard', file: 'components/ConfirmReceiptDialog.tsx', from: 'if (!transaction || savingRef.current) return;', to: 'if (!transaction) return;', expect: /CF6|CF13/ },
  { name: '409-raw-message', file: 'utils/confirmReceipt.ts', from: "updateFailureMessage(err, 'Não foi possível confirmar.')", to: "(err instanceof Error ? err.message : 'x')", expect: /CF7/ },
  { name: 'prefill-expected-date', file: 'utils/confirmReceipt.ts', from: "dateKey: expectedKey && expectedKey > todayKey ? expectedKey : todayKey,", to: 'dateKey: expectedKey,', expect: /CF1/ },
  { name: 'hint-ignores-follow', file: 'utils/confirmReceipt.ts', from: 'return followsLast ?', to: 'return true ?', expect: /CF5/ },
  { name: 'accept-zero-amount', file: 'utils/confirmReceipt.ts', from: 'masked.cents === null || masked.cents <= 0', to: 'masked.cents === null', expect: /CF10/ },
  { name: 'close-while-saving', file: 'components/ConfirmReceiptDialog.tsx', from: 'canClose={!saving}', to: 'canClose', expect: /CF6/ },
  { name: 'no-pin-on-month-change', file: 'utils/confirmReceipt.ts', from: 'if (kept) patch.competenceMonth = kept;', to: '', expect: /CF15/ },
  { name: 'stale-answer-closes', file: 'components/ConfirmReceiptDialog.tsx', from: 'if (opening === openingRef.current && mountedRef.current) {\n        onConfirmed', to: 'if (mountedRef.current) {\n        onConfirmed', expect: /CF12/ },
];

let bad = 0;
for (const m of MUTANTS) {
  const target = path.join(copy, m.file);
  const original = fs.readFileSync(target, 'utf8');
  const source = original.replace(/\r\n/g, '\n');
  if (!source.includes(m.from)) { console.log(`SKIP ${m.name}: pattern not found`); bad += 1; continue; }
  fs.writeFileSync(target, source.replace(m.from, m.to));
  let out = '';
  try {
    execFileSync('node', ['build-confirm.mjs', copy], { cwd: here, env: { ...process.env, FRONTEND_DIR: FRONT }, stdio: 'pipe' });
    out = execFileSync('node', ['confirm-scenarios.mjs'], { cwd: here, env: process.env, stdio: 'pipe' }).toString();
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const caught = out.split('\n').some((l) => l.includes('FAIL') && m.expect.test(l));
  console.log(`${caught ? 'CAUGHT' : 'MISSED'} ${m.name}`);
  if (!caught) bad += 1;
  fs.writeFileSync(target, original);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
