/**
 * P21 L7: a draft read from an XP notification (a dividend or a dividend reinvestment) becomes an investment movement
 * through POST /captures/:id/confirm-investment, never a transaction. Pure logic; the contract is in
 * specs/planos/P21-contrato-api.md (section L6). Covered by tests/t70_capture_investment.mts.
 */

export type InvestmentMovementType = 'INCOME' | 'BUY';

/** `suggestion.investment` of GET /captures (only on XP drafts). */
export interface CaptureInvestment {
  movementType: InvestmentMovementType;
  ticker: string;
  amount: number;
  /** YYYY-MM-DD, the day of the notification in Brasília time. */
  date: string;
  /** BUY only: the server's suggestion (amount ÷ last quote, rounded, at least 1); null without a quote. */
  quantity: number | null;
  quote: { price: number; date: string } | null;
  /** Open stock positions of this ticker in the household (empty: offer to create one). */
  positions: Array<{ id: string; accountId: string; name: string }>;
  pairedNotice: { captureId: string; amount: number; announcedDate: string } | null;
}

/** What the dialog edits. `target` is `position:<id>`, `new:<accountId>` or '' (not chosen yet). */
export interface InvestmentDraft {
  target: string;
  amountText: string;
  date: string;
  quantityText: string;
}

export type InvestmentField = 'target' | 'amount' | 'date' | 'quantity';

export interface ConfirmInvestmentBody {
  positionId?: string;
  newPosition?: { accountId: string };
  date: string;
  amount: number;
  quantity?: number;
}

interface WithSuggestion {
  suggestion?: { investment?: CaptureInvestment | null } | null;
}

export function investmentOf(item: WithSuggestion): CaptureInvestment | null {
  return item.suggestion?.investment ?? null;
}

export function isInvestmentDraft(item: WithSuggestion): boolean {
  return investmentOf(item) !== null;
}

export function investmentTitle(investment: CaptureInvestment): string {
  return investment.movementType === 'INCOME' ? `Provento de ${investment.ticker}` : `Reinvestimento em ${investment.ticker}`;
}

/** 7.77 -> "7,77" (the field is typed the Brazilian way). */
function amountToText(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

/**
 * "1.234,50", "1234,5", "7.77" -> a number with at most `maxDecimals` places; null when it is not a positive number in
 * that shape. A dot followed by exactly three digits is a thousands separator, otherwise it is the decimal mark.
 */
export function parseDecimal(text: string, maxDecimals: number): number | null {
  const raw = text.trim().replace(/\s/g, '');
  if (raw === '') return null;
  let normalized: string;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, '');
  else normalized = raw;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const decimals = normalized.split('.')[1]?.length ?? 0;
  if (decimals > maxDecimals) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface InvestmentAccountOption {
  id: string;
  name: string;
}

/** The only position, or a new one in the only investment account; otherwise the user chooses. */
export function defaultInvestmentDraft(investment: CaptureInvestment, accounts: InvestmentAccountOption[]): InvestmentDraft {
  let target = '';
  if (investment.positions.length === 1) target = `position:${investment.positions[0]!.id}`;
  else if (investment.positions.length === 0 && accounts.length === 1) target = `new:${accounts[0]!.id}`;
  const quantityText =
    investment.movementType === 'BUY' && investment.quantity !== null ? String(investment.quantity).replace('.', ',') : '';
  return { target, amountText: amountToText(investment.amount), date: investment.date, quantityText };
}

export function targetOptions(
  investment: CaptureInvestment,
  accounts: InvestmentAccountOption[],
): Array<{ value: string; label: string }> {
  return [
    ...investment.positions.map((position) => ({ value: `position:${position.id}`, label: `${position.name} (posição existente)` })),
    ...accounts.map((account) => ({ value: `new:${account.id}`, label: `Nova posição ${investment.ticker} em ${account.name}` })),
  ];
}

export function validateInvestmentDraft(
  draft: InvestmentDraft,
  investment: CaptureInvestment,
  today: string,
): { ok: boolean; errors: Partial<Record<InvestmentField, string>> } {
  const errors: Partial<Record<InvestmentField, string>> = {};
  if (!/^(position|new):.+/.test(draft.target)) errors.target = 'Escolha a posição ou onde criar uma.';
  if (parseDecimal(draft.amountText, 2) === null) errors.amount = 'Informe um valor maior que zero, com até 2 casas.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = 'Informe a data.';
  else if (draft.date > today) errors.date = 'A data não pode ser futura.';
  if (investment.movementType === 'BUY' && parseDecimal(draft.quantityText, 6) === null) {
    errors.quantity = 'Informe a quantidade comprada (maior que zero, até 6 casas).';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** The strict body of POST /captures/:id/confirm-investment, or null while the draft is invalid. */
export function buildConfirmInvestmentBody(
  draft: InvestmentDraft,
  investment: CaptureInvestment,
  today: string,
): ConfirmInvestmentBody | null {
  if (!validateInvestmentDraft(draft, investment, today).ok) return null;
  const [kind, id] = [draft.target.slice(0, draft.target.indexOf(':')), draft.target.slice(draft.target.indexOf(':') + 1)];
  const body: ConfirmInvestmentBody =
    kind === 'position'
      ? { positionId: id, date: draft.date, amount: parseDecimal(draft.amountText, 2)! }
      : { newPosition: { accountId: id }, date: draft.date, amount: parseDecimal(draft.amountText, 2)! };
  if (investment.movementType === 'BUY') body.quantity = parseDecimal(draft.quantityText, 6)!;
  return body;
}

/** A failed confirm, in Portuguese. `target` says whether the draft asked to create a position. */
export function confirmInvestmentError(status: number | undefined, target: 'position' | 'other'): string {
  if (status === 409 && target === 'position') {
    return 'Já existe uma posição aberta desse ativo nessa conta. Escolha a posição existente.';
  }
  if (status === 409) return 'Esta captura já foi confirmada ou descartada. Atualize a lista.';
  if (status === 400 || status === 404) return 'A confirmação não foi aceita. Confira a posição, o valor e a data.';
  return 'Não foi possível confirmar agora. Tente de novo.';
}

/** "Apagada em 25/01/2027", in Brasília time; '' for a date that cannot be read. */
export function studyExpiresText(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `Apagada em ${day}`;
}
