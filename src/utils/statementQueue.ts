/**
 * Bank statements imported as a queue: what a confirm sends for a preview and whether "apply the default to the
 * rest" can go on with it. Pure, like cardOfxQueue.ts.
 */
import { countLabel } from './maxfinPayload';
import type { ConfirmImportRow, ImportPreview } from '../hooks/api/useImportTransactions';

/**
 * Every row of the preview goes in, duplicates included. The server finds the rows already on the account by occurrence
 * (the Nth identical row is a duplicate only when the account holds N) and skips them, and it only counts like the
 * preview when it sees the same list: sending just the "new" rows made it count over a subset, so three identical rows
 * in the file with one on the account imported 1 instead of 2.
 */
export function statementConfirmRows(preview: Pick<ImportPreview, 'rows'>): ConfirmImportRow[] {
  return preview.rows.map(({ date, description, amount, type }) => ({ date, description, amount, type }));
}

/** How many rows of the preview are not on the account yet (what a confirm will import). */
export function statementNewCount(preview: Pick<ImportPreview, 'rows'>): number {
  return preview.rows.filter((row) => !row.duplicate).length;
}

export const STATEMENT_EMPTY_FILE = 'Nenhuma transação encontrada no arquivo.';
export const STATEMENT_NOTHING_NEW = 'Nenhuma transação nova neste arquivo: todas as linhas já estão no Prumo.';

export type StatementDefaultPlan =
  | { ok: true; rows: ConfirmImportRow[]; newCount: number }
  /** Every row is already in Prumo: nothing to import (left out). */
  | { ok: false; code: 'nothing-new'; reason: string }
  /** No row at all: the file is empty or could not be parsed (stops the loop). */
  | { ok: false; code: 'empty'; reason: string };

/** The default for a statement is to import what is new. A file with only duplicates is up to date; one with no rows at all is an error. */
export function planStatementDefaultApply(preview: Pick<ImportPreview, 'rows'>): StatementDefaultPlan {
  if (preview.rows.length === 0) return { ok: false, code: 'empty', reason: STATEMENT_EMPTY_FILE };
  const newCount = statementNewCount(preview);
  if (newCount === 0) return { ok: false, code: 'nothing-new', reason: STATEMENT_NOTHING_NEW };
  return { ok: true, rows: statementConfirmRows(preview), newCount };
}

export const STATEMENT_NOTHING_NEW_NOTE = 'Este arquivo não tem novidades: todas as linhas já estão no Prumo.';
export const STATEMENT_NOTHING_NEW_QUEUE_NOTE = 'Sem novidades: nada a importar';

export interface StatementQueueControls {
  canContinue: boolean;
  applyRestEnabled: boolean;
  note: string | null;
  blockerText: string | null;
}

/**
 * What the buttons of the statement queue do for the file on screen. A file whose rows are all in Prumo never stalls the
 * queue: "Continuar para o próximo" and "aplicar o padrão nas restantes" stay available. A file with no row at all (empty,
 * unparseable) or a failed confirm keeps them disabled, with the reason as text.
 */
export function statementQueueControls(input: {
  busy: boolean;
  preview: Pick<ImportPreview, 'rows'> | null;
  confirmError: string | null;
}): StatementQueueControls {
  if (input.busy || !input.preview) return { canContinue: false, applyRestEnabled: false, note: null, blockerText: null };
  if (input.confirmError !== null) {
    return { canContinue: false, applyRestEnabled: false, note: null, blockerText: 'Atualize a pré-visualização antes de confirmar de novo.' };
  }
  const plan = planStatementDefaultApply(input.preview);
  if (plan.ok) return { canContinue: false, applyRestEnabled: true, note: null, blockerText: null };
  if (plan.code === 'nothing-new') return { canContinue: true, applyRestEnabled: true, note: STATEMENT_NOTHING_NEW_NOTE, blockerText: null };
  return { canContinue: false, applyRestEnabled: false, note: null, blockerText: plan.reason };
}

/** "3 transações importadas" for the progress list. */
export function statementImportNote(imported: number): string {
  return countLabel(imported, 'transação importada', 'transações importadas');
}
