/**
 * Labels for account pickers. Two active accounts with the same name (a bank account and its credit card, usually)
 * are told apart by their type: "Banco X (conta)" and "Banco X (cartão)". Same name and same type: the creation
 * order is added ("Banco X (cartão 2)"). A name that is unique among the active accounts stays as it is.
 */
export interface LabelAccount {
  id?: string;
  name: string;
  type: string;
  isActive?: boolean;
  createdAt?: string | Date | null;
}

const TYPE_WORDS: Record<string, string> = {
  CHECKING: 'conta',
  CREDIT: 'cartão',
  SAVINGS: 'poupança',
  CASH: 'dinheiro',
  INVESTMENT: 'investimento',
};

const nameKey = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const typeWord = (type: string): string => TYPE_WORDS[type] ?? type.toLowerCase();

const createdTime = (account: LabelAccount): number => {
  const time = account.createdAt ? new Date(account.createdAt).getTime() : NaN;
  return Number.isFinite(time) ? time : Infinity;
};

/** id -> label of every active account in the list (inactive ones are ignored and get no label). */
export function accountLabels(accounts: ReadonlyArray<LabelAccount>): Map<string, string> {
  const active = accounts.filter((account) => account.id && account.isActive !== false);
  const byName = new Map<string, LabelAccount[]>();
  for (const account of active) {
    const key = nameKey(account.name);
    byName.set(key, [...(byName.get(key) ?? []), account]);
  }

  const labels = new Map<string, string>();
  for (const account of active) {
    const name = account.name.trim();
    const sameName = byName.get(nameKey(account.name))!;
    if (sameName.length === 1) {
      labels.set(account.id!, name);
      continue;
    }
    // Stable sort: accounts with no creation date keep the order given, after the dated ones.
    const sameType = sameName
      .filter((other) => other.type === account.type)
      .sort((a, b) => createdTime(a) - createdTime(b));
    const position = sameType.indexOf(account) + 1;
    labels.set(account.id!, `${name} (${typeWord(account.type)}${position > 1 ? ` ${position}` : ''})`);
  }
  return labels;
}

/** The label of one account of the list, or null when it is not there (or is inactive). */
export function accountLabel(accounts: ReadonlyArray<LabelAccount>, id: string): string | null {
  return accountLabels(accounts).get(id) ?? null;
}
