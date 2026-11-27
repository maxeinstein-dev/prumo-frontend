/**
 * Card check (P25, card lot): the card bills the bank lists through Open Finance against the Prumo invoice with the
 * same due day (GET /open-finance/cards). A closed bill that differs by more than R$ 1 warns; the bank limit is shown
 * only as information, because the bank changes it over time.
 */

export interface CardBillLine {
  /** 'YYYY-MM-DD' */
  dueDate: string;
  /** Prumo invoice month ('YYYY-MM'); null when no Prumo invoice has that due day. */
  month: string | null;
  bankCents: number;
  prumoCents: number | null;
  /** bank - Prumo, in cents. */
  diffCents: number | null;
  state: string | null;
}

export type CardCheck =
  | { prumoAccountId: string; accountName: string; blocked: string }
  | {
      prumoAccountId: string;
      accountName: string;
      blocked: null;
      card: {
        bankBalanceCents: number | null;
        prumoBalanceCents: number | null;
        bankLimitCents: number | null;
        bankAvailableCents: number | null;
        prumoLimitCents: number | null;
        closeDate: string | null;
        dueDate: string | null;
      };
      bills: CardBillLine[];
    };

/** Differences up to R$ 1 are rounding of the bank, not a missing purchase. */
export const CARD_TOLERANCE_CENTS = 100;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "R$ 1.234,56" without the sign (the text says more or less). */
export function brlCents(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

const dayMonth = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** "Fatura de novembro", or the due day when Prumo has no invoice with it. */
export function billLabel(line: CardBillLine): string {
  if (!line.month) return `Fatura de vencimento ${dayMonth(line.dueDate)}`;
  return `Fatura de ${MONTHS[Number(line.month.slice(5, 7)) - 1] ?? line.month}`;
}

const isMismatch = (line: CardBillLine) => line.diffCents !== null && Math.abs(line.diffCents) > CARD_TOLERANCE_CENTS;

/** The bills that differ from Prumo by more than R$ 1, newest first. A blocked connection has none. */
export function cardMismatches(check: CardCheck): CardBillLine[] {
  if (check.blocked !== null) return [];
  return [...check.bills].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).filter(isMismatch);
}

/** "o banco tem R$ 10,00 a mais que o Prumo" */
export function billDiffText(diffCents: number): string {
  return `o banco tem ${brlCents(diffCents)} a ${diffCents > 0 ? 'mais' : 'menos'} que o Prumo`;
}

export interface CardBillRow {
  label: string;
  note: string;
  bankCents: number;
  prumoCents: number | null;
  alert: boolean;
}

/** The rows of the Cartões section: one per bill, newest first. */
export function cardBillRows(check: CardCheck): CardBillRow[] {
  if (check.blocked !== null) return [];
  return [...check.bills]
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .map((line) => {
      let note: string;
      if (line.diffCents === null) note = 'Sem fatura no Prumo com esse vencimento';
      else if (line.diffCents === 0) note = `Vence ${dayMonth(line.dueDate)} · igual ao banco`;
      else note = `Vence ${dayMonth(line.dueDate)} · ${brlCents(line.diffCents)} a ${line.diffCents > 0 ? 'mais' : 'menos'} no banco`;
      return { label: billLabel(line), note, bankCents: line.bankCents, prumoCents: line.prumoCents, alert: isMismatch(line) };
    });
}

/** The bank limit and what is available there; null when the bank does not say. Information only. */
export function cardLimitInfo(check: CardCheck): { limitCents: number; availableCents: number | null } | null {
  if (check.blocked !== null || !check.card || check.card.bankLimitCents === null || check.card.bankLimitCents === undefined) return null;
  return { limitCents: check.card.bankLimitCents, availableCents: check.card.bankAvailableCents ?? null };
}
