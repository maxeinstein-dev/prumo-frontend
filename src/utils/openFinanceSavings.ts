/**
 * Pure logic of the savings ("cofrinhos") part of Settings > Open Finance (P25 L2c) and of the sync line of each
 * connection. No React, so tests/t73_open_finance_savings.mts runs it under tsx (OPEN_FINANCE_SAVINGS_MODULE points
 * it at a mutated copy).
 *
 * GET /open-finance/savings answers the register; PUT replaces it whole. Each savings: name, other names it had
 * (aliases), whether it is Prumo money, and an approximate balance with its day (both or neither). The balance keeps
 * itself up to date with the named moves; it only splits the daily yield of the savings.
 */
import { formatCaptureDateTime } from './captureInbox';

export interface SavingsServer {
  name: string;
  aliases: string[];
  inPrumo: boolean;
  approxCents: number | null;
  asOf: string | null;
}

export interface SavingsRow {
  name: string;
  /** Comma separated. */
  aliases: string;
  inPrumo: boolean;
  /** Reais with comma ("512,30"); '' = unknown. */
  balance: string;
  /** 'YYYY-MM-DD'; '' = unknown. */
  asOf: string;
}

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function centsToText(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** "38.250,75" / "512,30" / "512.3" -> reais; null when it is not a number. */
function parseReais(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100) / 100;
}

const splitAliases = (text: string): string[] => [...new Set(text.split(',').map((a) => a.trim()).filter(Boolean))];

export function draftFromSavings(savings: readonly SavingsServer[]): SavingsRow[] {
  return savings.map((s) => ({
    name: s.name,
    aliases: s.aliases.join(', '),
    inPrumo: s.inPrumo,
    balance: s.approxCents === null ? '' : centsToText(s.approxCents),
    asOf: s.asOf ?? '',
  }));
}

export function isSavingsChanged(rows: readonly SavingsRow[], savings: readonly SavingsServer[]): boolean {
  return JSON.stringify(buildSavingsBody(rows)) !== JSON.stringify(buildSavingsBody(draftFromSavings(savings)));
}

/** First problem that would make the server refuse the list (or mislead the yield split), in Portuguese; null = fine. */
export function savingsError(rows: readonly SavingsRow[]): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.name.trim()) return 'Todo cofrinho precisa de um nome.';
    const hasBalance = row.balance.trim() !== '';
    const hasDay = row.asOf.trim() !== '';
    if (hasBalance && !hasDay) return `Informe a data do saldo de "${row.name.trim()}".`;
    if (hasDay && !hasBalance) return `Informe o saldo de "${row.name.trim()}" naquela data.`;
    if (hasBalance && parseReais(row.balance) === null) return `O saldo de "${row.name.trim()}" não é um valor válido.`;
    for (const name of [row.name, ...splitAliases(row.aliases)]) {
      const key = fold(name);
      if (seen.has(key)) return `O nome "${name.trim()}" está repetido.`;
      seen.add(key);
    }
  }
  return null;
}

export function buildSavingsBody(rows: readonly SavingsRow[]) {
  return {
    savings: rows.map((row) => {
      const balance = parseReais(row.balance);
      const asOf = row.asOf.trim();
      return {
        name: row.name.trim(),
        aliases: splitAliases(row.aliases),
        inPrumo: row.inPrumo,
        approxBalance: balance !== null && asOf ? balance : null,
        balanceAsOf: balance !== null && asOf ? asOf : null,
      };
    }),
  };
}

/** The sync line of a connection on the screen. */
export function syncText(item: { lastSyncAt: string | null; lastError: string | null }): string {
  return item.lastSyncAt ? `Lido pela importação em ${formatCaptureDateTime(item.lastSyncAt)}` : 'Ainda não lido pela importação diária';
}
