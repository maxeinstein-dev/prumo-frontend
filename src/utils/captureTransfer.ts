/**
 * Pure logic of a Pix between two accounts of the user in the captures inbox (P16, decided on 15/11/2026): the server
 * pairs an outflow capture with an own-income capture (GET /captures `transferPair`) and POST /captures/transfer confirms
 * both as one transfer, never an income plus an expense. Also the note of a capture dismissed as the repeat of another
 * notification of the same Pix. No React and no imports, so tools/fe-tests/t58_capture_transfer.mts runs it under tsx
 * (CAPTURE_TRANSFER_MODULE points it at a mutated copy).
 */

export interface TransferPair {
  /** The other capture of the pair. */
  captureId: string;
  /** Which side this capture is. */
  side: 'out' | 'in';
  /** The account the other capture's draft would take. */
  partnerAccountId: string | null;
}

/** The fields of a capture this module reads (a CaptureItem has them all). */
export interface TransferCaptureLike {
  id: string;
  status: string;
  postedAt: string;
  parsed: unknown;
  suggestion: { accountId: string | null; amount: number | null };
  transferPair?: unknown;
}

export interface TransferAccounts {
  fromAccountId: string | null;
  toAccountId: string | null;
}

export interface TransferBody {
  outCaptureId: string;
  inCaptureId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
}

export type TransferMissing = 'pair' | 'from' | 'to' | 'same' | 'amount';

/** The pair of a pending capture, as the server sent it; null when there is none or it is malformed. */
export function transferPairOf(item: TransferCaptureLike): TransferPair | null {
  if (item.status !== 'PENDING') return null;
  const pair = item.transferPair as Partial<TransferPair> | null | undefined;
  if (!pair || typeof pair !== 'object') return null;
  if (typeof pair.captureId !== 'string' || !pair.captureId || (pair.side !== 'out' && pair.side !== 'in')) return null;
  return { captureId: pair.captureId, side: pair.side, partnerAccountId: typeof pair.partnerAccountId === 'string' ? pair.partnerAccountId : null };
}

/** From the outflow's account to the income's account, whichever side `item` is. */
export function transferAccounts(item: TransferCaptureLike): TransferAccounts {
  const pair = transferPairOf(item);
  const own = item.suggestion.accountId ?? null;
  if (!pair) return { fromAccountId: null, toAccountId: null };
  return pair.side === 'out'
    ? { fromAccountId: own, toAccountId: pair.partnerAccountId }
    : { fromAccountId: pair.partnerAccountId, toAccountId: own };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of an instant in the device's zone (the same rule as captureInbox.localDayKey). */
function localDay(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The body of POST /captures/transfer, or what is still missing. Exactly the keys the server takes. */
export function transferBody(item: TransferCaptureLike, accounts: TransferAccounts):
  { ok: true; body: TransferBody } | { ok: false; missing: TransferMissing[] } {
  const pair = transferPairOf(item);
  if (!pair) return { ok: false, missing: ['pair'] };
  const missing: TransferMissing[] = [];
  if (!accounts.fromAccountId) missing.push('from');
  if (!accounts.toAccountId) missing.push('to');
  if (missing.length === 0 && accounts.fromAccountId === accounts.toAccountId) missing.push('same');
  const amount = item.suggestion.amount;
  if (missing.length === 0 && !(typeof amount === 'number' && amount > 0)) missing.push('amount');
  const date = localDay(item.postedAt);
  if (missing.length > 0 || !date) return { ok: false, missing: missing.length > 0 ? missing : ['amount'] };
  const [outCaptureId, inCaptureId] = pair.side === 'out' ? [item.id, pair.captureId] : [pair.captureId, item.id];
  return {
    ok: true,
    body: { outCaptureId, inCaptureId, fromAccountId: accounts.fromAccountId!, toAccountId: accounts.toAccountId!, amount: amount!, date },
  };
}

/** The income sides to hide because their outflow is on the same list: the pair shows once, on the outflow. */
export function hiddenPairSides(items: readonly TransferCaptureLike[]): Set<string> {
  const ids = new Set(items.map((i) => i.id));
  const hidden = new Set<string>();
  for (const item of items) {
    const pair = transferPairOf(item);
    if (pair?.side === 'in' && ids.has(pair.captureId)) hidden.add(item.id);
  }
  return hidden;
}

/** Why a capture was dismissed as the repeat of another notification of the same Pix; null otherwise. */
export function duplicateNote(item: Pick<TransferCaptureLike, 'parsed'>): string | null {
  const parsed = item.parsed as { duplicateOf?: unknown } | null | undefined;
  return parsed && typeof parsed === 'object' && typeof parsed.duplicateOf === 'string' && parsed.duplicateOf
    ? 'Repetida: o mesmo Pix já chegou por outra notificação. Restaure só se for outro Pix.'
    : null;
}
