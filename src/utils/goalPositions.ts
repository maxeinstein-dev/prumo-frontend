// Pure logic of the goals that take their value from investment positions (P21 L5; backend L4). When a goal has at least
// one open position linked, the server answers `fromPositions: true` and `currentAmount` is the sum of the positions: the
// goal cannot take "guardar" or a manual amount (the API answers 400), the bar never passes 100% (the text may), and the
// value may be an estimate. Contract: specs/planos/P21-contrato-api.md, section L4.
import { reaisToCents } from './adjustBalance';

/** What of a goal these rules read. */
export interface GoalValueFields {
  targetAmount: number;
  currentAmount: number;
  fromPositions?: boolean;
  positionsCount?: number;
  valueDate?: string | null;
  estimated?: boolean;
  noQuote?: boolean;
}

export function isFromPositions(goal: Pick<GoalValueFields, 'fromPositions'> | null | undefined): boolean {
  return goal?.fromPositions === true;
}

/** The percent (it can pass 100) and the width of the bar (never above 100), from whole cents. */
export function goalProgress(goal: Pick<GoalValueFields, 'targetAmount' | 'currentAmount'>): { percent: number; barPercent: number } {
  const target = reaisToCents(goal.targetAmount);
  const current = reaisToCents(goal.currentAmount);
  if (target <= 0 || current <= 0) return { percent: 0, barPercent: 0 };
  const percent = Math.round((current * 1000) / target) / 10;
  return { percent, barPercent: Math.min(100, percent) };
}

/** A goal that is not moved by the positions takes "guardar", contributions and a typed kept amount. */
export function takesManualMoney(goal: Pick<GoalValueFields, 'fromPositions'>): boolean {
  return !isFromPositions(goal);
}

/** The marks next to the value of a goal that comes from positions ("estimado", "sem cotação", "valores de DD/MM"). */
export function goalValueNotes(goal: Pick<GoalValueFields, 'fromPositions' | 'estimated' | 'noQuote' | 'valueDate'>): {
  estimated: boolean;
  noQuote: boolean;
  valueDate: string | null;
} {
  if (!isFromPositions(goal)) return { estimated: false, noQuote: false, valueDate: null };
  return { estimated: goal.estimated === true, noQuote: goal.noQuote === true, valueDate: goal.valueDate ?? null };
}

/** True when linking a position to this goal hides a kept amount it already has (it stays in the database, unused). */
export function linkHidesStoredValue(goal: Pick<GoalValueFields, 'fromPositions' | 'currentAmount'> | null | undefined): boolean {
  if (!goal || isFromPositions(goal)) return false;
  return reaisToCents(goal.currentAmount) > 0;
}

/**
 * The body of the goal update: the kept amount goes only when the user changed it, and never for a goal that comes from
 * positions (the API refuses it with 400). So saving the form of such a goal (a new name, a new target) works.
 */
export function goalUpdateData<T extends { currentAmount?: number }>(data: T, goal: Pick<GoalValueFields, 'fromPositions' | 'currentAmount'>): Omit<T, 'currentAmount'> & { currentAmount?: number } {
  const { currentAmount, ...rest } = data;
  if (isFromPositions(goal)) return rest;
  const changed = typeof currentAmount === 'number' && reaisToCents(currentAmount) !== reaisToCents(goal.currentAmount || 0);
  return changed ? { ...rest, currentAmount } : rest;
}
