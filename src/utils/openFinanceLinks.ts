/**
 * Pure logic of Settings > Open Finance (P25 L4): which Prumo account each Pluggy account feeds. No React, so
 * tests/t70_open_finance_links.mts runs it under tsx (OPEN_FINANCE_LINKS_MODULE points it at a mutated copy).
 *
 * GET /open-finance/links answers the items (Meu Pluggy connections) with their Pluggy accounts and the saved link of
 * each; PUT /open-finance/links REPLACES every account link of the household. So the body is built from the whole
 * picture: the choices on screen, plus the links of items Pluggy could not read this time (their accounts are not on
 * screen, and a save must never drop them). Links to accounts Pluggy no longer lists, on an item it did read, are
 * dropped: that account is gone (e.g. the item was renewed with new ids).
 */
import { accountLabels } from './accountLabels';

export interface PluggyLinkAccount {
  id: string;
  itemId: string;
  /** 'BANK' | 'CREDIT' */
  type: string;
  subtype: string | null;
  name: string;
  marketingName: string | null;
  number: string | null;
  balance: number | null;
  currencyCode: string;
  /** Prumo account fed by this Pluggy account; null = ignored. */
  accountId: string | null;
}

export interface LinksItem {
  itemId: string;
  error: string | null;
  accounts: PluggyLinkAccount[];
  orphanLinks: Array<{ pluggyAccountId: string; accountId: string | null }>;
  /** Last successful daily import of this connection (ISO); null = not yet. */
  lastSyncAt?: string | null;
  /** Why the last import could not read it (e.g. expired authorization). */
  lastError?: string | null;
}

export interface PrumoAccount {
  id: string;
  name: string;
  type: string;
  isActive?: boolean;
  createdAt?: string | Date | null;
}

/** Pluggy account id -> Prumo account id, '' when ignored. Only the accounts shown on screen. */
export type LinksDraft = Record<string, string>;

export interface LinkInput {
  pluggyItemId: string;
  pluggyAccountId: string;
  accountId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function draftFromItems(items: readonly LinksItem[]): LinksDraft {
  const draft: LinksDraft = {};
  for (const item of items) for (const account of item.accounts) draft[account.id] = account.accountId ?? '';
  return draft;
}

export function isDraftChanged(draft: LinksDraft, items: readonly LinksItem[]): boolean {
  const saved = draftFromItems(items);
  return Object.keys(saved).some((id) => (draft[id] ?? '') !== saved[id]);
}

/** The Prumo accounts a Pluggy account may feed: a card only a credit card; a bank account any other active account. */
export function accountOptionsFor(
  account: Pick<PluggyLinkAccount, 'type'>,
  prumo: readonly PrumoAccount[],
): Array<{ value: string; label: string }> {
  const active = prumo.filter((a) => a.isActive !== false);
  const labels = accountLabels(active);
  const fits = active.filter((a) => (account.type === 'CREDIT' ? a.type === 'CREDIT' : a.type !== 'CREDIT'));
  return fits.map((a) => ({ value: a.id, label: labels.get(a.id) ?? a.name }));
}

/** Links of items Pluggy could not read this time: kept as they are by any save. */
function keptLinks(items: readonly LinksItem[]): LinkInput[] {
  return items
    .filter((item) => item.error !== null)
    .flatMap((item) =>
      item.orphanLinks
        .filter((link) => link.accountId)
        .map((link) => ({ pluggyItemId: item.itemId, pluggyAccountId: link.pluggyAccountId, accountId: link.accountId! })),
    );
}

export function buildLinksBody(draft: LinksDraft, items: readonly LinksItem[]): { links: LinkInput[] } {
  const chosen: LinkInput[] = [];
  for (const item of items) {
    for (const account of item.accounts) {
      const accountId = (draft[account.id] ?? '').trim();
      if (accountId) chosen.push({ pluggyItemId: item.itemId, pluggyAccountId: account.id, accountId });
    }
  }
  return { links: [...chosen, ...keptLinks(items)] };
}

/** The first Prumo account that would be fed by two Pluggy accounts (the server refuses it), or null. */
export function duplicateChoice(draft: LinksDraft, items: readonly LinksItem[]): string | null {
  const seen = new Set<string>();
  for (const link of buildLinksBody(draft, items).links) {
    if (seen.has(link.accountId)) return link.accountId;
    seen.add(link.accountId);
  }
  return null;
}

/** An item id pasted from the Meu Pluggy dashboard: a uuid, trimmed and lowercased; null when it is not one. */
export function normalizeItemId(text: string): string | null {
  const id = text.trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

/** Title of a connection: the bank's name from its accounts (the bank account's marketing name first). */
export function itemTitle(item: Pick<LinksItem, 'itemId' | 'accounts'>): string {
  const bank = item.accounts.find((a) => a.type === 'BANK') ?? item.accounts[0];
  const name = (bank?.marketingName || bank?.name || '').trim();
  return name || `Conexão ${item.itemId.slice(0, 8)}`;
}

/** "Conta final 00000-1" / "Cartão de crédito final 1234". */
export function pluggyAccountLabel(account: Pick<PluggyLinkAccount, 'type' | 'number'>): string {
  const kind = account.type === 'CREDIT' ? 'Cartão de crédito' : 'Conta';
  const number = (account.number ?? '').trim();
  return number ? `${kind} final ${number.slice(-8)}` : kind;
}
