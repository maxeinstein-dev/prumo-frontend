import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../utils/api';
import { buildLinksBody, type LinksDraft, type LinksItem } from '../../utils/openFinanceLinks';

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
