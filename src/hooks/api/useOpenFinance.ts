import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../utils/api';
import { buildLinksBody, type LinksDraft, type LinksItem } from '../../utils/openFinanceLinks';
import { buildSavingsBody, type SavingsRow, type SavingsServer } from '../../utils/openFinanceSavings';
import type { BalanceGap } from '../../utils/homeMobile';
import type { PortfolioCheck } from '../../utils/openFinancePortfolio';

/** The envelope apiClient returns is the response body: { success, data }. */
const bodyOf = <T>(response: unknown): { data?: T } => (response ?? {}) as { data?: T };

const withHousehold = (path: string, householdId: string | undefined): string =>
  householdId ? `${path}${path.includes('?') ? '&' : '?'}householdId=${encodeURIComponent(householdId)}` : path;

const linksKey = (householdId: string | undefined) => ['open-finance', 'links', householdId ?? null];

/**
 * GET /open-finance/links: the Meu Pluggy connections with their accounts and links. It asks Pluggy (one token, one
 * listing per connection), so it is read once per visit to the screen, not on focus.
 */
export function useOpenFinanceLinks(householdId: string | undefined) {
  const { currentUser } = useAuth();
  return useQuery({
    queryKey: linksKey(householdId),
    enabled: !!currentUser && !!householdId,
    queryFn: async () => {
      const body = bodyOf<{ items: LinksItem[] }>(await apiClient.get('/open-finance/links', { householdId }));
      return body.data?.items ?? [];
    },
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** PUT /open-finance/links: replaces every account link (body from buildLinksBody, which keeps unread connections). */
export function useSaveOpenFinanceLinks(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { draft: LinksDraft; items: LinksItem[] }) => {
      await apiClient.put(withHousehold('/open-finance/links', householdId), buildLinksBody(input.draft, input.items));
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['open-finance'] }),
  });
}

/** POST /open-finance/items: register a connection id copied from the Meu Pluggy dashboard. */
export function useAddOpenFinanceItem(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      await apiClient.post(withHousehold('/open-finance/items', householdId), { itemId });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['open-finance'] }),
  });
}

/** PUT /open-finance/items/:itemId: the connection got a new id after renewing the authorization (links are kept). */
export function useReplaceOpenFinanceItem(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; newItemId: string }) => {
      await apiClient.put(withHousehold(`/open-finance/items/${encodeURIComponent(input.itemId)}`, householdId), {
        newItemId: input.newItemId,
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['open-finance'] }),
  });
}

/** DELETE /open-finance/items/:itemId: stop reading a connection (its account links go with it). */
export function useRemoveOpenFinanceItem(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      await apiClient.delete(withHousehold(`/open-finance/items/${encodeURIComponent(itemId)}`, householdId));
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['open-finance'] }),
  });
}

const savingsKey = (householdId: string | undefined) => ['open-finance', 'savings', householdId ?? null];

/** GET /open-finance/savings: the savings (cofrinhos) register. Reads only the database (no Pluggy call). */
export function useOpenFinanceSavings(householdId: string | undefined) {
  const { currentUser } = useAuth();
  return useQuery({
    queryKey: savingsKey(householdId),
    enabled: !!currentUser && !!householdId,
    queryFn: async () => {
      const body = bodyOf<{ savings: SavingsServer[] }>(await apiClient.get('/open-finance/savings', { householdId }));
      return body.data?.savings ?? [];
    },
    refetchOnWindowFocus: false,
  });
}

/** PUT /open-finance/savings: replaces the whole register; answers it as saved. */
export function useSaveOpenFinanceSavings(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: SavingsRow[]) => {
      const response = await apiClient.put(withHousehold('/open-finance/savings', householdId), buildSavingsBody(rows));
      return bodyOf<{ savings: SavingsServer[] }>(response).data?.savings ?? [];
    },
    onSuccess: (savings) => queryClient.setQueryData(savingsKey(householdId), savings),
  });
}

/** GET /open-finance/balances: the bank balance of the last import against each linked account (database only). */
export function useOpenFinanceBalances(householdId: string | undefined) {
  const { currentUser } = useAuth();
  return useQuery({
    queryKey: ['open-finance', 'balances', householdId ?? null],
    enabled: !!currentUser && !!householdId,
    queryFn: async () => {
      const body = bodyOf<{ balances: BalanceGap[] }>(await apiClient.get('/open-finance/balances', { householdId }));
      return body.data?.balances ?? [];
    },
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * GET /open-finance/investments: the broker portfolio from Open Finance against P21 (P25 L5). It asks Pluggy, which
 * updates once a day, so the answer is kept for 12 hours instead of asking on every visit.
 */
export function useOpenFinancePortfolio(householdId: string | undefined) {
  const { currentUser } = useAuth();
  return useQuery({
    queryKey: ['open-finance', 'investments', householdId ?? null],
    enabled: !!currentUser && !!householdId,
    queryFn: async () => {
      const body = bodyOf<{ accounts: PortfolioCheck[] }>(await apiClient.get('/open-finance/investments', { householdId }));
      return body.data?.accounts ?? [];
    },
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
