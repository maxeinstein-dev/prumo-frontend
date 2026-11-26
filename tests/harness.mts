import { fileURLToPath, pathToFileURL } from 'node:url';
import { outcome, pendingReason } from './pending.mjs';

// FRONTEND_DIR (absolute path of another checkout) overrides this repository's src.
export const frontSrc = (rel: string): string =>
  process.env.FRONTEND_DIR
    ? fileURLToPath(pathToFileURL(process.env.FRONTEND_DIR + '/src/' + rel))
    : fileURLToPath(new URL('../src/' + rel, import.meta.url));

export const modPath =
  process.env.MAXFIN_MODULE || frontSrc('utils/maxfinPayload.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod: any = await import(pathToFileURL(modPath).href);
// The module has no invoiceForSelection (the dialog derives the invoice from the rows it sends): test-only wrapper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const M: any = {
  ...mod,
  invoiceForSelection: (rows: unknown, selected: unknown, options: unknown, ctx: unknown) =>
    mod.invoiceForRows(mod.selectRowsToSend(rows, selected), options, ctx),
};

let passed = 0;
let pendingCount = 0;
const failures: string[] = [];

/** One result, with tests/pending.json applied: a pending test that fails is "pend"; one that passes is a failure. */
function record(name: string, error: Error | null): void {
  const result = outcome(name, error === null);
  if (result === 'ok') {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else if (result === 'pend') {
    pendingCount += 1;
    console.log(`  pend ${name}\n       ${pendingReason(name)}`);
  } else if (result === 'pending-passed') {
    failures.push(name);
    console.log(`  FAIL ${name}\n       passes now: remove it from tests/pending.json`);
  } else {
    failures.push(name);
    const msg = String(error!.message).split('\n').slice(0, 8).join('\n       ');
    console.log(`  FAIL ${name}\n       ${msg}`);
  }
}

export function check(name: string, fn: () => void): void {
  try {
    fn();
    record(name, null);
  } catch (e) {
    record(name, e as Error);
  }
}

export async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    record(name, null);
  } catch (e) {
    record(name, e as Error);
  }
}

export function show(label: string, value: unknown): void {
  console.log(`       ${label}: ${JSON.stringify(value)}`);
}

export function summary(): void {
  console.log(`\nmodule: ${modPath}`);
  console.log(`${passed} passed, ${failures.length} failed, ${pendingCount} pending (tests/pending.json)`);
  if (failures.length > 0) {
    console.log(`Failed: ${failures.join(' | ')}`);
    process.exitCode = 1;
  }
}

// ---- Fixtures ---------------------------------------------------------------------------------------------

let line = 1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mkRow(o: Record<string, any> = {}): any {
  line += 1;
  return {
    sourceLine: line, sourceRef: `ref-${line}`, section: 'credit', accountId: 'acc-card', type: 'EXPENSE', description: 'Item',
    categoryKey: 'Outros', amount: 10, planned: null, realized: null, paid: true, date: '2026-09-05', notes: null, flag: null,
    installment: null, futureInstallments: 0, shareHint: null, status: 'new', statusDetail: null, existingTransactionId: null, ...o,
  };
}

export const ACCOUNTS = [
  { id: 'acc-main', type: 'CHECKING' },
  { id: 'acc-card', type: 'CREDIT' },
  { id: 'acc-card2', type: 'CREDIT' },
];
export const CUSTOMS = { INCOME: new Set<string>(), EXPENSE: new Set<string>(['cat-pets']) };
export const CLOSED = { closedMonth: true, payInvoice: true, generateFutureInstallments: false };
export const OPEN = { closedMonth: false, payInvoice: false, generateFutureInstallments: true };
export const INV_CTX = { sourceAccountId: 'acc-main', creditAccountId: 'acc-card', accounts: ACCOUNTS, hasInvoice: true };
export const CONFIRM_CTX = { accounts: ACCOUNTS, customIdsByType: CUSTOMS };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mkEntry(key: string, o: Record<string, any> = {}): any {
  return { key, type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'default', label: 'Padrão' }, ...o };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mkPreview(rows: any[], o: Record<string, any> = {}): any {
  return {
    month: { year: 2026, month: 9 }, monthKey: '2026-09', monthSource: 'title', householdId: 'h1',
    accounts: { income: 'acc-main', bills: 'acc-main', credit: 'acc-card', debit: 'acc-main' },
    options: CLOSED, sections: [], rows, skipped: [], categoryMap: [],
    invoice: {
      creditAccountId: 'acc-card', sourceAccountId: 'acc-main', month: '2026-09', paymentDate: '2026-10-10',
      amount: 0, dueDay: 10, closingDay: 3, willPay: true,
    },
    warnings: [], totals: { rows: rows.length, new: 0, duplicate: 0, changed: 0, legacyDuplicate: 0, skipped: 0 }, ...o,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultSelection = (rows: any[]): Record<string, boolean> => M.reconcileSelection([], {}, rows);
