// Pure logic of the Investimentos page (P21 L5): positions of an investment account, their marks ("estimado", "sem
// cotação"), grouping by goal, the bodies of the forms and the Portuguese text of the API errors. The numbers come from
// GET /investments/accounts/:id/positions already calculated (value, result, cash balance, totals): nothing here
// recomputes a position value. The only sum done here is the subtotal of a group ("Sem meta"), in whole cents.
// Contract: specs/planos/P21-contrato-api.md.
import { isValidIsoDate, reaisToCents } from './adjustBalance';

export type PositionKind = 'STOCK_EXCHANGE' | 'FIXED_INCOME';
export type Indexer = 'CDI' | 'IPCA' | 'SELIC' | 'PREFIXED';
export type MovementType = 'OPENING' | 'BUY' | 'SELL' | 'INCOME';
export type ValueMark = 'MARKET' | 'NO_QUOTE' | 'ANCHOR' | 'ESTIMATED' | 'CLOSED';

export const INDEXERS: readonly Indexer[] = ['CDI', 'IPCA', 'SELIC', 'PREFIXED'];

export interface Position {
  id: string;
  accountId: string;
  savingsGoalId: string | null;
  kind: PositionKind;
  ticker: string | null;
  name: string;
  indexer: Indexer | null;
  rate: number | null;
  maturityDate: string | null;
  anchor: { amount: number; date: string } | null;
  closedAt: string | null;
  quantity: number | null;
  avgPrice: number | null;
  costAmount: number;
  incomeLast12Months: number;
  createdAt?: string;
  // L2: market value
  currentValue: number;
  result: number;
  valueDate: string | null;
  valueMark: ValueMark;
  estimated: boolean;
  noQuote: boolean;
  ratesCarried: boolean;
  ratesMissing: boolean;
  lastQuote: { price: number; date: string } | null;
}

export interface Movement {
  id: string;
  positionId: string;
  type: MovementType;
  date: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  notes: string | null;
  sourceRef: string | null;
  createdAt: string;
}

export interface PositionDetail extends Position {
  movements: Movement[];
}

export interface PositionsSummary {
  accountId: string;
  accountName: string;
  accountBalance: number;
  cashBalance: number;
  positionsCost: number;
  totalAtCost: number;
  valuedAt: string;
  positionsValue: number;
  positionsResult: number;
  totalValue: number;
  hasEstimates: boolean;
  hasNoQuote: boolean;
}

export interface AccountPositions {
  summary: PositionsSummary;
  positions: Position[];
}

/** The part of a goal (GET /savings-goals) the page needs. */
export interface GoalRef {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remaining?: number;
  /** The value already comes from linked positions (the stored amount is hidden). */
  fromPositions?: boolean;
}

const POSITIONS_BASE = '/app/investments';

/** '/app/investments', '/app/investments/:accountId' or '/app/investments/:accountId/:positionId'. */
export function investmentsPath(accountId?: string, positionId?: string): string {
  if (!accountId) return POSITIONS_BASE;
  return positionId ? `${POSITIONS_BASE}/${accountId}/${positionId}` : `${POSITIONS_BASE}/${accountId}`;
}

/* ---------- display ---------- */

/** A quantity with up to 6 decimals, pt-BR, no trailing zeros: 11, 0,333333, 1.234,5. A dash when there is none. */
export function formatQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(Number(quantity.toFixed(6)));
}

const rateNumber = (rate: number): string => String(Math.round(rate * 10000) / 10000).replace('.', ',');

/** '100% do CDI', '100% da Selic', 'IPCA + 6,5% a.a.', 'Prefixado 12% a.a.'; empty without an indexer. */
export function indexerText(indexer: Indexer | null | undefined, rate: number | null | undefined): string {
  if (!indexer || rate === null || rate === undefined) return '';
  const r = rateNumber(rate);
  switch (indexer) {
    case 'CDI':
      return `${r}% do CDI`;
    case 'SELIC':
      return `${r}% da Selic`;
    case 'IPCA':
      return `IPCA + ${r}% a.a.`;
    case 'PREFIXED':
      return `Prefixado ${r}% a.a.`;
    default:
      return '';
  }
}

export type PositionMark = 'estimated' | 'noQuote' | 'ratesCarried' | 'ratesMissing';

const isClosed = (p: Pick<Position, 'closedAt' | 'valueMark'>): boolean => !!p.closedAt || p.valueMark === 'CLOSED';

/** The marks the screen shows next to a value: "sem cotação" (bolsa), "estimado" (renda fixa) and the rate warnings. */
export function positionMarks(p: Pick<Position, 'closedAt' | 'valueMark' | 'estimated' | 'noQuote' | 'ratesCarried' | 'ratesMissing'>): PositionMark[] {
  if (isClosed(p)) return [];
  const marks: PositionMark[] = [];
  if (p.noQuote) marks.push('noQuote');
  if (p.estimated) marks.push('estimated');
  if (p.ratesCarried) marks.push('ratesCarried');
  if (p.ratesMissing) marks.push('ratesMissing');
  return marks;
}

export interface ValueDateInfo {
  kind: 'quote' | 'estimate' | 'anchor';
  date: string;
}

/** Which date the value refers to and what it is: the quote day (bolsa), the estimate day or the informed value. */
export function valueDateInfo(p: Pick<Position, 'kind' | 'closedAt' | 'valueMark' | 'valueDate' | 'lastQuote'>): ValueDateInfo | null {
  if (isClosed(p)) return null;
  if (p.kind === 'STOCK_EXCHANGE') return p.lastQuote ? { kind: 'quote', date: p.lastQuote.date } : null;
  if (!p.valueDate) return null;
  return { kind: p.valueMark === 'ANCHOR' ? 'anchor' : 'estimate', date: p.valueDate };
}

/** YYYY-MM-DD to DD/MM without any timezone shift. */
export function shortDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}` : value;
}

export function resultTone(result: number | null | undefined): 'up' | 'down' | 'flat' {
  if (typeof result !== 'number' || !Number.isFinite(result) || result === 0) return 'flat';
  return result > 0 ? 'up' : 'down';
}

export function splitPositions<T extends { closedAt: string | null }>(positions: readonly T[]): { open: T[]; closed: T[] } {
  return { open: positions.filter((p) => !p.closedAt), closed: positions.filter((p) => !!p.closedAt) };
}

/* ---------- grouping by goal ---------- */

export interface PositionGroup {
  /** The goal id, or 'none' for the positions without a goal. */
  key: string;
  goalId: string | null;
  goalName: string | null;
  /** The position points to a goal the goals list did not bring (deleted, or the list failed). */
  goalMissing: boolean;
  target: number | null;
  current: number | null;
  remaining: number | null;
  positions: Position[];
  /** Sum of the current value of the positions of the group. */
  valueTotal: number;
}

const byText = (a: string, b: string): number => a.localeCompare(b, 'pt-BR');
const labelOf = (p: Position): string => p.ticker ?? p.name;

function sortPositions(list: Position[]): Position[] {
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'STOCK_EXCHANGE' ? -1 : 1;
    return byText(labelOf(a), labelOf(b));
  });
}

/** The positions grouped by goal: goals by name, goals the list lacks next, "Sem meta" last. Empty groups are not listed. */
export function groupByGoal(positions: readonly Position[], goals: readonly GoalRef[]): PositionGroup[] {
  const byGoal = new Map<string, Position[]>();
  const none: Position[] = [];
  for (const p of positions) {
    if (!p.savingsGoalId) none.push(p);
    else byGoal.set(p.savingsGoalId, [...(byGoal.get(p.savingsGoalId) ?? []), p]);
  }
  const total = (list: Position[]): number => list.reduce((sum, p) => sum + reaisToCents(p.currentValue ?? 0), 0) / 100;

  const known: PositionGroup[] = [];
  const missing: PositionGroup[] = [];
  for (const [goalId, list] of byGoal) {
    const goal = goals.find((g) => g.id === goalId);
    if (goal) {
      const remaining = typeof goal.remaining === 'number' && Number.isFinite(goal.remaining)
        ? goal.remaining
        : Math.max(0, reaisToCents(goal.targetAmount) - reaisToCents(goal.currentAmount)) / 100;
      known.push({
        key: goalId, goalId, goalName: goal.name, goalMissing: false, target: goal.targetAmount, current: goal.currentAmount, remaining,
        positions: sortPositions(list), valueTotal: total(list),
      });
    } else {
      missing.push({
        key: goalId, goalId, goalName: null, goalMissing: true, target: null, current: null, remaining: null,
        positions: sortPositions(list), valueTotal: total(list),
      });
    }
  }
  known.sort((a, b) => byText(a.goalName ?? '', b.goalName ?? ''));
  missing.sort((a, b) => byText(a.key, b.key));
  const groups = [...known, ...missing];
  if (none.length > 0) {
    groups.push({
      key: 'none', goalId: null, goalName: null, goalMissing: false, target: null, current: null, remaining: null,
      positions: sortPositions(none), valueTotal: total(none),
    });
  }
  return groups;
}

/* ---------- accounts ---------- */

/** The investment account the page shows (by id, or the first one) and the choices. `account` is null when there is none. */
export function pickInvestmentAccount<T extends { id: string; type: string; isActive: boolean }>(
  accounts: readonly T[],
  accountId: string | undefined,
): { account: T | null; options: T[] } {
  const options = accounts.filter((a) => a.type === 'INVESTMENT' && a.isActive);
  const account = accountId ? (options.find((a) => a.id === accountId) ?? null) : (options[0] ?? null);
  return { account, options };
}

/** True when the account already has positions (open or closed): its value comes from them, not from a typed value. */
export function hasPositions(list: { positions: readonly unknown[] } | null | undefined): boolean {
  return !!list && list.positions.length > 0;
}

/** The accounts that still take a typed market value (the ones without positions). */
export function valuationAccounts<T extends { id: string }>(accounts: readonly T[], withPositions: ReadonlySet<string>): T[] {
  return accounts.filter((a) => !withPositions.has(a.id));
}

/* ---------- forms ---------- */

/** Up to [maxDecimals] decimals, comma or dot; dots are thousands separators when there is a comma or more than one dot. */
export function parseDecimal(text: string, maxDecimals: number): number | null {
  let s = text.trim();
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length >= 2) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const decimals = s.split('.')[1]?.length ?? 0;
  if (decimals > maxDecimals) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type FormError =
  | 'ticker'
  | 'name'
  | 'indexer'
  | 'rate'
  | 'date'
  | 'future'
  | 'quantity'
  | 'price'
  | 'priceOrAmount'
  | 'amount'
  | 'notes';

export type FormErrors<K extends string> = Partial<Record<K, FormError>>;
export type FormResult<B, K extends string> = { ok: true; body: B } | { ok: false; errors: FormErrors<K> };

const MAX_NOTES = 255;
const TICKER_RE = /^[A-Z0-9]{1,12}$/;

export interface NewPositionForm {
  kind: PositionKind;
  ticker: string;
  name: string;
  /** '' = no goal. */
  savingsGoalId: string;
  indexer: string;
  rateText: string;
  maturityDate: string;
  openingDate: string;
  openingQuantityText: string;
  openingPriceText: string;
  /** Fixed income: the applied value typed in cents; null = no opening balance. */
  openingCents: number | null;
}

export type NewPositionField =
  | 'ticker'
  | 'name'
  | 'indexer'
  | 'rate'
  | 'maturityDate'
  | 'openingDate'
  | 'openingQuantity'
  | 'openingPrice'
  | 'openingAmount';

function dateError(date: string, today: string): FormError | null {
  if (!isValidIsoDate(date)) return 'date';
  return date > today ? 'future' : null;
}

/** The body of POST /investments/accounts/:id/positions from the form, or what is wrong with it. */
export function newPositionBody(form: NewPositionForm, today: string): FormResult<Record<string, unknown>, NewPositionField> {
  const errors: FormErrors<NewPositionField> = {};
  const body: Record<string, unknown> = { kind: form.kind };
  if (form.savingsGoalId) body.savingsGoalId = form.savingsGoalId;

  if (form.kind === 'STOCK_EXCHANGE') {
    const ticker = form.ticker.trim().toUpperCase();
    if (!TICKER_RE.test(ticker)) errors.ticker = 'ticker';
    body.ticker = ticker;
    body.name = form.name.trim() || ticker;
    const qtyText = form.openingQuantityText.trim();
    const priceText = form.openingPriceText.trim();
    if (qtyText || priceText) {
      const quantity = parseDecimal(qtyText, 6);
      const unitPrice = parseDecimal(priceText, 6);
      if (quantity === null || quantity <= 0) errors.openingQuantity = 'quantity';
      if (unitPrice === null || unitPrice <= 0) errors.openingPrice = 'price';
      const dErr = dateError(form.openingDate, today);
      if (dErr) errors.openingDate = dErr;
      if (!errors.openingQuantity && !errors.openingPrice && !errors.openingDate) {
        body.opening = { date: form.openingDate, quantity, unitPrice };
      }
    }
  } else {
    const name = form.name.trim();
    if (!name) errors.name = 'name';
    body.name = name;
    if (!(INDEXERS as readonly string[]).includes(form.indexer)) errors.indexer = 'indexer';
    body.indexer = form.indexer;
    const rate = parseDecimal(form.rateText, 4);
    if (rate === null || rate <= 0) errors.rate = 'rate';
    body.rate = rate;
    if (form.maturityDate.trim()) {
      if (!isValidIsoDate(form.maturityDate)) errors.maturityDate = 'date';
      else body.maturityDate = form.maturityDate;
    }
    if (form.openingCents !== null) {
      if (form.openingCents <= 0) errors.openingAmount = 'amount';
      const dErr = dateError(form.openingDate, today);
      if (dErr) errors.openingDate = dErr;
      if (!errors.openingAmount && !errors.openingDate) body.opening = { date: form.openingDate, amount: form.openingCents / 100 };
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, body };
}

export interface MovementForm {
  type: MovementType;
  date: string;
  quantityText: string;
  priceText: string;
  /** The total typed in cents; null = not typed. */
  amountCents: number | null;
  notes: string;
}

export type MovementField = 'date' | 'quantity' | 'price' | 'amount' | 'notes';

/**
 * The body of POST /investments/positions/:id/movements. Bolsa buy/sell: quantity and the total or the unit price (the
 * total wins, as in the server). Provento and fixed income: only the amount; quantity and price are never sent (the API
 * answers 400 for them in fixed income and ignores them in a provento).
 */
export function movementBody(kind: PositionKind, form: MovementForm, today: string): FormResult<Record<string, unknown>, MovementField> {
  const errors: FormErrors<MovementField> = {};
  const body: Record<string, unknown> = { type: form.type, date: form.date };
  const dErr = dateError(form.date, today);
  if (dErr) errors.date = dErr;

  const hasAmount = form.amountCents !== null && form.amountCents > 0;
  if (kind === 'STOCK_EXCHANGE' && form.type !== 'INCOME') {
    const quantity = parseDecimal(form.quantityText, 6);
    if (quantity === null || quantity <= 0) errors.quantity = 'quantity';
    else body.quantity = quantity;
    const unitPrice = parseDecimal(form.priceText, 6);
    if (hasAmount) body.amount = (form.amountCents as number) / 100;
    else if (unitPrice !== null && unitPrice > 0) body.unitPrice = unitPrice;
    else errors.price = 'priceOrAmount';
  } else if (hasAmount) {
    body.amount = (form.amountCents as number) / 100;
  } else {
    errors.amount = 'amount';
  }

  const notes = form.notes.trim();
  if (notes.length > MAX_NOTES) errors.notes = 'notes';
  else if (notes) body.notes = notes;
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, body };
}

/** The body of PATCH .../positions/:id that informs the value seen in the broker on a day (the new anchor of the estimate). */
export function anchorBody(form: { date: string; cents: number | null }, today: string): FormResult<{ anchor: { amount: number; date: string } }, 'date' | 'amount'> {
  const errors: FormErrors<'date' | 'amount'> = {};
  const dErr = dateError(form.date, today);
  if (dErr) errors.date = dErr;
  if (form.cents === null || form.cents <= 0) errors.amount = 'amount';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { anchor: { amount: (form.cents as number) / 100, date: form.date } } };
}

export const clearAnchorBody = (): { anchor: null } => ({ anchor: null });
export const goalLinkBody = (goalId: string | null | undefined): { savingsGoalId: string | null } => ({ savingsGoalId: goalId ? goalId : null });
export const closeBody = (): { closed: true } => ({ closed: true });
export const reopenBody = (): { closed: false } => ({ closed: false });

/* ---------- movements ---------- */

export function movementTypeOptions(kind: PositionKind): Array<{ value: MovementType; label: string }> {
  return kind === 'STOCK_EXCHANGE'
    ? [
        { value: 'BUY', label: 'Compra' },
        { value: 'SELL', label: 'Venda' },
        { value: 'INCOME', label: 'Provento' },
      ]
    : [
        { value: 'BUY', label: 'Aplicação' },
        { value: 'SELL', label: 'Resgate' },
      ];
}

export function movementTypeLabel(kind: PositionKind, type: MovementType): string {
  if (type === 'OPENING') return 'Saldo inicial';
  if (type === 'INCOME') return 'Provento';
  if (kind === 'FIXED_INCOME') return type === 'BUY' ? 'Aplicação' : 'Resgate';
  return type === 'BUY' ? 'Compra' : 'Venda';
}

/** What the movement does to the cash balance of the broker: a purchase takes money out, a sale or provento puts it in. */
export function movementEffect(type: MovementType): 'in' | 'out' | 'none' {
  if (type === 'BUY') return 'out';
  if (type === 'SELL' || type === 'INCOME') return 'in';
  return 'none';
}

/* ---------- API errors ---------- */

export type ErrorContext = 'close' | 'deleteMovement' | 'movement' | 'createPosition' | 'link' | 'anchor' | 'generic';

export const CLOSE_REFUSED_TEXT =
  'Não dá para encerrar: a posição ainda tem cotas ou valor aplicado. Venda ou resgate tudo antes (lance a venda ou o resgate) e encerre depois.';
const DELETE_REFUSED_TEXT =
  'Não dá para apagar este movimento: uma venda posterior ficaria sem as cotas que a sustentam. Apague ou ajuste a venda primeiro.';

/** The text of an API error in Portuguese, by status and by what the user was doing. Never the server's English text. */
export function investmentErrorText(context: ErrorContext, err: { status?: number; message?: string }): string {
  const message = err.message ?? '';
  const status = err.status;
  if (status === undefined) return message || 'Não foi possível concluir. Tente de novo em instantes.';
  if (status === 403) return 'Só quem é editor da casa pode alterar investimentos.';
  if (status === 404) return 'Não foi encontrado: a conta, a posição, o movimento ou a meta pode ter sido apagado. Atualize a página.';
  if (status === 409) {
    if (context === 'createPosition') return 'Já existe uma posição aberta com este código na conta.';
    if (context === 'movement') return 'Este movimento já foi registrado.';
    return 'Este registro já existe.';
  }
  if (status === 400) {
    if (context === 'close') return CLOSE_REFUSED_TEXT;
    if (context === 'deleteMovement') return DELETE_REFUSED_TEXT;
    if (/sell more|more than|exceed|insufficient/i.test(message)) return 'A venda é maior do que a quantidade que a posição tem.';
    if (/closed/i.test(message)) return 'Esta posição está encerrada: reabra para lançar movimentos.';
    if (/inactive/i.test(message)) return 'A conta está inativa: reative a conta para mexer nos investimentos.';
    if (/future/i.test(message)) return 'A data não pode ser futura.';
    return 'O servidor recusou os dados. Confira os campos e tente de novo.';
  }
  if (status >= 500) return 'Erro no servidor. Tente de novo em instantes.';
  return message || 'Não foi possível concluir. Tente de novo em instantes.';
}

/** The status and message of an error thrown by the API client (utils/api.ts); empty for anything else. */
export function apiErrorParts(err: unknown): { status?: number; message?: string } {
  if (!(err instanceof Error)) return {};
  const status = (err as Error & { status?: unknown }).status;
  return { status: typeof status === 'number' ? status : undefined, message: err.message };
}
