/**
 * Presentation logic of the purchase simulator (P20, lote L2). Pure: no React, so tools/fe-tests/t59_purchase_simulation.mts
 * runs it under tsx (PURCHASE_SIMULATION_MODULE points it at a mutated copy).
 *
 * Every number comes from the server (POST /dashboard/purchase-simulation); nothing here recalculates the months. This file
 * only builds the request from what was typed and writes the sentences about the answer. The texts are in Portuguese
 * like the other screens built on a plain texts file (the other locales read the same words).
 */

/* ---------- contract (see specs/planos/P20-simulador-de-compra-parcelada.md) ---------- */

export interface SimulationMonth {
  month: string;
  committed: number;
  committedPosted: number;
  committedForecast: number;
  postedByCategory: Record<string, number>;
  newInstallment: number;
  total: number;
  expectedIncome: number;
  leftover: number;
  leftoverWithoutPurchase: number;
}

export interface SimulationBudgetOverrun {
  month: string;
  scope: 'GENERAL' | 'CATEGORY';
  categoryName: string;
  limit: number;
  projected: number;
  withoutPurchase: number;
}

export interface PurchaseSimulation {
  firstMonth: string;
  installments: number[];
  months: SimulationMonth[];
  hasExpectedIncome: boolean;
  tightest: { month: string; leftover: number; leftoverWithoutPurchase: number } | null;
  budgetOverruns: SimulationBudgetOverrun[];
  averageExpense: { months: number; amount: number };
}

export interface SimulationRequestBody {
  householdId: string;
  totalAmount: number;
  installments: number;
  accountId?: string;
  categoryName?: string;
  firstMonth?: string;
}

export const MAX_INSTALLMENTS = 24;
export const INSTALLMENT_SHORTCUTS = [3, 6, 10, 12] as const;

/* ---------- the request ---------- */

/**
 * The amount as typed ("1.234,56", "1234,56", "1234.56", "R$ 100") in reais with at most 2 decimals; null when it is empty,
 * zero, negative or not a number.
 */
export function parseAmountText(text: string): number | null {
  const cleaned = text.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!cleaned || !/^\d[\d.,]*$/.test(cleaned)) return null;
  let normalized: string;
  if (cleaned.includes(',')) {
    // Brazilian: dots are thousands, the comma is the decimal separator (only one allowed)
    if (cleaned.indexOf(',') !== cleaned.lastIndexOf(',')) return null;
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if ((cleaned.match(/\./g) ?? []).length > 1 || /^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, ''); // 1.200 or 1.234.567: thousands
  } else {
    normalized = cleaned;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) return null; // more than 2 decimals
  return cents / 100;
}

export interface SimulatorForm {
  amount: string;
  installments: number | string;
  accountId?: string;
  categoryName?: string;
  firstMonth?: string;
}

export type SimulationRequestResult =
  | { ok: true; body: SimulationRequestBody }
  | { ok: false; error: 'amount' | 'installments' | 'tooSmall' };

/** The request body from the form; only what was filled is sent, so the server decides the defaults. */
export function simulationRequest(form: SimulatorForm, householdId: string): SimulationRequestResult {
  const totalAmount = parseAmountText(form.amount);
  if (totalAmount === null) return { ok: false, error: 'amount' };
  const installments = typeof form.installments === 'number' ? form.installments : Number(String(form.installments).trim());
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) return { ok: false, error: 'installments' };
  if (Math.round(totalAmount * 100) < installments) return { ok: false, error: 'tooSmall' };
  const body: SimulationRequestBody = { householdId, totalAmount, installments };
  if (form.accountId) body.accountId = form.accountId;
  if (form.categoryName) body.categoryName = form.categoryName;
  if (form.firstMonth) body.firstMonth = form.firstMonth;
  return { ok: true, body };
}

/* ---------- the answer ---------- */

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'dez/2026' for '2026-12'. */
export function monthLabel(month: string): string {
  return `${MONTHS_PT[Number(month.slice(5, 7)) - 1] ?? month.slice(5, 7)}/${month.slice(0, 4)}`;
}

export interface SimulationRow extends SimulationMonth {
  label: string;
  /** The month holds an installment of the new purchase. */
  hasInstallment: boolean;
  /** The purchase takes a budget (the general one or the category's) above its limit in this month. */
  overBudget: boolean;
  leftoverNegative: boolean;
}

/** The table rows, one per month, as the server sent them. */
export function simulationRows(sim: PurchaseSimulation): SimulationRow[] {
  const over = new Set(sim.budgetOverruns.map((o) => o.month));
  return sim.months.map((m) => ({
    ...m,
    label: monthLabel(m.month),
    hasInstallment: m.newInstallment > 0,
    overBudget: over.has(m.month),
    leftoverNegative: m.leftover < 0,
  }));
}

export interface SimulationSummary {
  /** "O mês mais apertado é ..."; null without an installment month. */
  tightest: string | null;
  /** The income is an estimate; says so, or says there was none. */
  incomeNote: string;
  /** One line per month that breaks a budget. */
  overruns: string[];
  /** The average of the last months against the tightest month; null when there is no average yet. */
  average: string | null;
}

const abs = (n: number): number => Math.abs(n);

/** The sentences about the answer. `money` formats a value in reais. */
export function simulationSummary(sim: PurchaseSimulation, money: (value: number) => string): SimulationSummary {
  const t = sim.tightest;
  const tightest = t
    ? `O mês mais apertado é ${monthLabel(t.month)}: ${t.leftover < 0 ? `faltam ${money(abs(t.leftover))}` : `sobra ${money(t.leftover)}`} (sem a compra seria ${money(t.leftoverWithoutPurchase)}).`
    : null;

  const incomeNote = sim.hasExpectedIncome
    ? 'A receita é uma estimativa: soma as entradas recorrentes cadastradas, não o que vai de fato entrar.'
    : 'Nenhuma receita prevista nesses meses: a sobra mostrada é só o negativo do que já está comprometido mais a compra.';

  const overruns = sim.budgetOverruns.map((o) => {
    const what = o.scope === 'GENERAL' ? 'o orçamento geral' : `o orçamento de ${o.categoryName}`;
    return `${monthLabel(o.month)} estoura ${what}: ${money(o.projected)} para um limite de ${money(o.limit)} (sem a compra seria ${money(o.withoutPurchase)}).`;
  });

  let average: string | null = null;
  const avg = sim.averageExpense;
  const row = t ? sim.months.find((m) => m.month === t.month) : undefined;
  if (avg.amount > 0 && row) {
    const diff = Math.round((row.total - avg.amount) * 100) / 100;
    const relation = diff === 0 ? 'fica igual à média' : `fica ${money(abs(diff))} ${diff > 0 ? 'acima' : 'abaixo'}`;
    average = `Média de despesa dos últimos ${avg.months} meses: ${money(avg.amount)}. Com a compra, ${monthLabel(row.month)} ${relation}.`;
  }
  return { tightest, incomeNote, overruns, average };
}

/** The messages for a refused form. */
export const SIMULATOR_ERRORS = {
  amount: 'Informe o valor da compra.',
  installments: `Informe de 1 a ${MAX_INSTALLMENTS} parcelas.`,
  tooSmall: 'O valor é pequeno demais para essa quantidade de parcelas.',
} as const;
