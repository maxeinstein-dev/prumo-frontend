/**
 * P22: "Parcelada em" when a capture is confirmed. The notification never says whether a card purchase was split, so
 * the user picks it. The amount stays the TOTAL of the purchase; the server (captures.schema.ts, confirmCaptureSchema,
 * and capture-installments.ts) splits it in cents with the leftover cents in the first part, or uses the part value the
 * user corrected (installmentAmount). Only an expense on a credit card can be split. No React and no imports, so
 * tools/fe-tests/t66_capture_installments.mts runs it under tsx.
 */

export const INSTALLMENTS_MAX = 24;

export function installmentsAllowed(type: string | null | undefined, accountType: string | null | undefined): boolean {
  return type === 'EXPENSE' && accountType === 'CREDIT';
}

/** "À vista", "2x" ... "24x" (value = the number of parts). */
export function installmentOptions(): Array<{ value: string; label: string }> {
  return Array.from({ length: INSTALLMENTS_MAX }, (_, i) => ({
    value: String(i + 1),
    label: i === 0 ? 'À vista' : `${i + 1}x`,
  }));
}

/** The parts of a total in cents: equal, the leftover cents in the first (the same rule as the server). */
export function splitCents(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const parts = Array.from({ length: count }, () => base);
  parts[0] = base + (totalCents - base * count);
  return parts;
}

const toCents = (value: number): number => Math.round(value * 100);

const brl = (cents: number): string => {
  const integer = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${integer},${String(cents % 100).padStart(2, '0')}`;
};

/** What the form shows under the field: the value of each part. Null when there is nothing to split. */
export function installmentHint(total: number | null, count: number, partAmount: number | null): string | null {
  if (count < 2 || total === null || !(total > 0)) return null;
  if (partAmount !== null && toCents(partAmount) > 0) {
    const part = toCents(partAmount);
    return `${count}x de ${brl(part)} (total ${brl(part * count)})`;
  }
  const [first, rest] = splitCents(toCents(total), count);
  return first === rest
    ? `${count}x de ${brl(rest!)}`
    : `${count}x: a primeira de ${brl(first!)} e as outras de ${brl(rest!)}`;
}

export type InstallmentsResult<B> = { ok: true; body: B } | { ok: false; reason: 'tooSmall' | 'partAmount' };

/**
 * The confirm body with the parts, when the purchase was split. À vista, an income or an account that is not a credit
 * card leave the body as it was (the server refuses installments there). `installmentAmount` is sent only when the user
 * corrected the part value; empty means the server's equal split.
 */
export function withInstallments<B extends { type: string; amount: number }>(
  body: B,
  options: { count: number; accountType: string | null | undefined; installmentAmount: number | null },
): InstallmentsResult<B & { installments?: number; installmentAmount?: number }> {
  const count = Math.min(Math.floor(options.count), INSTALLMENTS_MAX);
  if (count < 2 || !installmentsAllowed(body.type, options.accountType)) return { ok: true, body };
  if (toCents(body.amount) < count) return { ok: false, reason: 'tooSmall' };
  if (options.installmentAmount === null) return { ok: true, body: { ...body, installments: count } };
  const part = toCents(options.installmentAmount);
  if (part <= 0) return { ok: false, reason: 'partAmount' };
  return { ok: true, body: { ...body, installments: count, installmentAmount: part / 100 } };
}
