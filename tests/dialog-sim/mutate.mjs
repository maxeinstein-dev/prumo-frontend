// usage: node mutate.mjs <name> <relativeFileUnderSrc> <oldSnippet> <newSnippet>
// Copies the files the dialog bundle needs from the (read-only) repo into mut/<name>/src and applies ONE exact-text replacement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// FRONTEND_DIR overrides the default sibling checkout (e.g. a git worktree).
const REPO_SRC = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR, 'src') : path.resolve(here, '../../src');
const [name, rel, oldS, newS] = process.argv.slice(2);
if (!name || !rel || oldS === undefined || newS === undefined) throw new Error('usage: node mutate.mjs <name> <rel> <old> <new>');

const FILES = [
  'components/ImportMaxFinDialog.tsx', 'hooks/api/useImportMaxFin.ts', 'utils/maxfinPayload.ts', 'utils/maxfinWorkbook.ts', 'lib/enums.ts',
  // phase 3 (card invoice .ofx): the bundle also carries the card dialog and the generic import that hands over to it
  'components/ImportCardOfxDialog.tsx', 'hooks/api/useImportCardOfx.ts', 'utils/cardOfx.ts', 'components/ImportTransactionsDialog.tsx',
  'hooks/api/useImportTransactions.ts',
  // phase 4 (people and shared expenses)
  'components/people/ui.tsx', 'components/people/DivideTransactionDialog.tsx', 'components/people/SettlementDialog.tsx',
  'components/people/OrganizeSharesDialog.tsx', 'components/people/PersonDetail.tsx', 'components/people/PersonFormDialog.tsx',
  'hooks/api/usePeople.ts', 'utils/people.ts', 'utils/organizeShares.ts', 'pages/People.tsx', 'components/PageHeader.tsx', 'components/PageButton.tsx',
  // unified import (hub, queues, onboarding closing day)
  'components/ImportHubDialog.tsx', 'components/ImportQueuePanel.tsx', 'utils/importHub.ts', 'utils/importQueue.ts', 'utils/cardOfxQueue.ts',
  'utils/statementQueue.ts', 'schemas/index.ts', 'utils/sanitize.ts', 'utils/currency.ts', 'utils/accountBalance.ts', 'types/index.ts',
  'components/SelectCombobox.tsx', 'components/onboarding/steps/OnboardingStep5Accounts.tsx',
  // phase 5 (recurring detection and follow-last)
  'components/DetectRecurringDialog.tsx', 'hooks/api/useDetectRecurring.ts', 'utils/recurringDetect.ts', 'utils/recurringFollow.ts',
  // gaps A/B/C of the card OFX import (closing, merges, review queue)
  'components/CardOfxReviewDialog.tsx', 'hooks/api/useCardOfxReview.ts', 'utils/cardOfxReview.ts', 'utils/cardOfxClosing.ts',
  'utils/transactionConflict.ts', 'utils/closingDay.ts', 'hooks/useClosingDayAutoFill.ts',
  // Ajustar saldo
  'components/accounts/AdjustBalanceDialog.tsx', 'utils/adjustBalance.ts',
];
// MUT_DIR keeps parallel bite-check scripts from deleting each other's scratch copies (default: mut).
const MUT = process.env.MUT_DIR || 'mut';
const dest = path.join(here, MUT, name, 'src');
fs.rmSync(path.join(here, MUT, name), { recursive: true, force: true });
for (const f of FILES) {
  // A checkout of another branch may lack some of the files (e.g. no people feature): the bundle drops those imports.
  if (!fs.existsSync(path.join(REPO_SRC, f))) continue;
  fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
  fs.copyFileSync(path.join(REPO_SRC, f), path.join(dest, f));
}
const target = path.join(dest, rel);
// The checkout may be CRLF (core.autocrlf): snippets are written with LF.
const text = fs.readFileSync(target, 'utf8').split('\r\n').join('\n');
const count = text.split(oldS).length - 1;
if (count !== 1) throw new Error(`pattern must occur exactly once in ${rel}, found ${count}: ${oldS}`);
fs.writeFileSync(target, text.replace(oldS, () => newS));
console.log(`mutant ${name}: 1 replacement in ${rel}`);
