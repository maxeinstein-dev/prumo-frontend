/**
 * P19: default split of a recurrence and the one-tap split of a new expense. Pure functions: the form, the pills and
 * what is sent. The amounts themselves are computed by the server (one place for the money arithmetic).
 */

/** One person of the default split of a recurrence, as the server answers it. */
export interface DefaultShare {
  personId: string;
  personName: string;
  /** Percent of the real occurrence amount, or null when `amount` is set. */
  percent: number | null;
  /** Fixed reais, or null when `percent` is set. */
  amount: number | null;
}

/** What the recurrence form edits: one person and a percent. */
export interface DefaultSplitDraft {
  personId: string;
  /** As typed ("50", "33,33"); empty with a person = 100%. */
  percent: string;
  /** False when the stored split has more than one person or a fixed amount: the form shows it and keeps it. */
  editable: boolean;
}

export type DefaultSharesToSend =
  | { ok: true; value: Array<{ personId: string; percent: number }> | null | undefined }
  | { ok: false; error: 'percent' };

export function draftFromDefaultShares(shares: readonly DefaultShare[] | undefined | null): DefaultSplitDraft {
  if (!shares || shares.length === 0) return { personId: '', percent: '', editable: true };
  const [only] = shares;
  if (shares.length > 1 || only!.percent == null) return { personId: only!.personId, percent: '', editable: false };
  return { personId: only!.personId, percent: String(only!.percent).replace('.', ','), editable: true };
}

/** "50" / "33,33" -> number with at most 2 decimals in (0, 100]; null when it is not one. */
function parsePercent(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value > 0 && value <= 100 ? value : null;
}

/**
 * The `defaultShares` field of the create/update body: a list replaces the split, null clears it, undefined leaves it
 * alone (and is not sent). Only expenses carry a split; a stored one is cleared when the recurrence is an income.
 */
export function defaultSharesToSend(draft: DefaultSplitDraft, stored: readonly DefaultShare[] | undefined | null, isExpense: boolean): DefaultSharesToSend {
  const hadSplit = (stored?.length ?? 0) > 0;
  if (!draft.editable) return { ok: true, value: undefined };
  if (!isExpense || !draft.personId) return { ok: true, value: hadSplit ? null : undefined };
  if (!draft.percent.trim()) return { ok: true, value: [{ personId: draft.personId, percent: 100 }] };
  const percent = parsePercent(draft.percent);
  if (percent === null) return { ok: false, error: 'percent' };
  return { ok: true, value: [{ personId: draft.personId, percent }] };
}

function reais(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** One line for the list of recurrences ("É de Mãe", "Ana 50%"); null when there is no split. */
export function defaultSplitSummary(shares: readonly DefaultShare[] | undefined | null): string | null {
  if (!shares || shares.length === 0) return null;
  if (shares.length === 1 && shares[0]!.percent === 100) return `É de ${shares[0]!.personName}`;
  return shares
    .map((s) => (s.percent != null ? `${s.personName} ${String(s.percent).replace('.', ',')}%` : `${s.personName} ${reais(s.amount ?? 0)}`))
    .join(', ');
}

// ---- One-tap split of a new expense (capture confirm, add sheet) -------------------------------------------------

export type QuickSplit = 'mine' | 'half' | 'theirs';

export interface QuickSplitPerson {
  id: string;
  name: string;
  isActive: boolean;
}

/** The person the pills offer: the last one used when still active, else the first active one; null when none. */
export function quickSplitPerson<P extends QuickSplitPerson>(people: readonly P[], lastPersonId: string | null | undefined): P | null {
  const active = people.filter((p) => p.isActive);
  return active.find((p) => p.id === lastPersonId) ?? active[0] ?? null;
}

export function quickSplitLabel(choice: QuickSplit, person: { name: string } | null): string {
  if (choice === 'mine' || !person) return 'Só meu';
  return choice === 'half' ? `Metade com ${person.name}` : `É de ${person.name}`;
}

export interface QuickSplitBody {
  strategy: 'equal' | 'percent';
  entries: Array<{ personId: string; percent?: number }>;
}

/** The split sent with the expense (POST /captures/:id/confirm `shares`, or PUT shares after the add sheet). */
export function quickSplitBody(choice: QuickSplit, person: { id: string } | null, type: string): QuickSplitBody | undefined {
  if (choice === 'mine' || !person || type !== 'EXPENSE') return undefined;
  if (choice === 'half') return { strategy: 'equal', entries: [{ personId: person.id }] };
  return { strategy: 'percent', entries: [{ personId: person.id, percent: 100 }] };
}

const LAST_PERSON_KEY = 'recta.quickSplit.lastPerson';

interface SmallStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SmallStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The last person a split was made with on this device (a convenience: null when storage is blocked). */
export function readLastSplitPerson(storage: SmallStorage | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(LAST_PERSON_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastSplitPerson(personId: string, storage: SmallStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(LAST_PERSON_KEY, personId);
  } catch {
    // blocked storage: the pills fall back to the first active person
  }
}
