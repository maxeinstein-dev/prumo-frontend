/**
 * Bank statement import (.ofx / .csv) rules that do not depend on the browser: how long a confirm may take, why a line
 * of the file was left out and what to tell the user when a confirm fails. Pure, like statementQueue.ts, so
 * tools/fe-tests can exercise it on its own (t25_generic_import.mts).
 */

/** The shared client gives up after 30 s; a big confirm needs more because the server saves about 25 ms per new row. */
export const CONFIRM_BASE_TIMEOUT_MS = 30_000;
export const CONFIRM_PER_ROW_MS = 100;
export const CONFIRM_MAX_TIMEOUT_MS = 5 * 60_000;

/** How long to wait for the confirm of `rowCount` rows: 30 s plus 100 ms per row, at most 5 minutes. */
export function confirmTimeoutMs(rowCount: number): number {
  const rows = Number.isFinite(rowCount) && rowCount > 0 ? Math.floor(rowCount) : 0;
  return Math.min(CONFIRM_BASE_TIMEOUT_MS + CONFIRM_PER_ROW_MS * rows, CONFIRM_MAX_TIMEOUT_MS);
}

export type ImportSkippedReason = 'invalid-date' | 'invalid-amount' | 'ambiguous-amount' | 'column-count';

/** Why a line of the file was left out, in words for the user. */
export function skippedReasonText(reason: string): string {
  switch (reason) {
    case 'invalid-date':
      return 'data inválida';
    case 'invalid-amount':
      return 'valor inválido';
    case 'ambiguous-amount':
      return 'valor ambíguo: 1.234 pode ser 1,234 ou 1234 (escreva 1.234,00 ou 1234,00)';
    case 'column-count':
      return 'número de colunas diferente do esperado';
    default:
      return 'não foi possível ler';
  }
}

/** "Linha 7" for a CSV, "Lançamento 7" for an OFX (the server counts the entries of the OFX in order). */
export function skippedLineLabel(line: number, fileName?: string | null): string {
  return fileName?.toLowerCase().endsWith('.ofx') ? `Lançamento ${line}` : `Linha ${line}`;
}

/** "2 linhas do arquivo foram ignoradas" (the list shows the reason of each one). */
export function skippedSummary(count: number): string {
  return count === 1 ? '1 linha do arquivo foi ignorada' : `${count} linhas do arquivo foram ignoradas`;
}

export const IMPORT_BUSY_MESSAGE =
  'Já existe uma importação em andamento nesta conta. Espere ela terminar e pré-visualize o arquivo de novo.';

export const IMPORT_TIMEOUT_MESSAGE =
  'A importação demorou mais do que o tempo de espera e pode ainda estar em andamento no servidor. ' +
  'Confira as transações antes de tentar de novo; enviar o mesmo arquivo outra vez ignora o que já entrou.';

/**
 * What to tell the user when a confirm fails. A timeout does not mean nothing was imported (the server keeps going),
 * so it never reads as "0 importadas"; a 409 means another import of the account is running.
 */
export function confirmFailureMessage(err: unknown, fallback = 'Não foi possível confirmar a importação.'): string {
  const failure = err as { status?: number; message?: string } | null | undefined;
  if (failure?.status === 409) return IMPORT_BUSY_MESSAGE;
  if (/timeout/i.test(failure?.message ?? '')) return IMPORT_TIMEOUT_MESSAGE;
  return failure?.message ? failure.message : fallback;
}
