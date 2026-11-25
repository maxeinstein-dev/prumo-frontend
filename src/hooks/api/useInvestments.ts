import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../utils/api';
import type { AccountPositions, Movement, PositionDetail } from '../../utils/investments';

// Investments (P21 L5): the positions of an investment account and their movements. Read: any member; write: editor.
// The numbers (value, result, cash balance, totals) come from the server already calculated. Contract:
// specs/planos/P21-contrato-api.md.

const KEY = ['investments'] as const;

const fetchPositions = async (accountId: string): Promise<AccountPositions> => {
  const response = await apiClient.get<AccountPositions>(`/investments/accounts/${accountId}/positions`, { includeClosed: true });
  if (!response.data) throw new Error('Empty positions response');
  return response.data;
};

/** The positions of an account (open and closed) and its summary. */
export function useAccountPositions(accountId: string | undefined) {
  const { currentUser } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'positions', accountId ?? null],
    enabled: !!currentUser && !!accountId,
    queryFn: () => fetchPositions(accountId as string),
    refetchOnWindowFocus: false,
  });
}

/**
 * Which investment accounts already have positions (the Patrimônio line of those goes to the Investimentos page and
 * does not take a typed value). An account whose request failed counts as "no positions": it stays as it is today.
 */
export function useAccountsWithPositions(accountIds: readonly string[]) {
  const { currentUser } = useAuth();
  const results = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: [...KEY, 'positions', id],
      enabled: !!currentUser,
      queryFn: () => fetchPositions(id),
      refetchOnWindowFocus: false,
    })),
  });
  const withPositions = new Set<string>();
  let pending = false;
  results.forEach((r, i) => {
    if (r.isLoading) pending = true;
    else if (r.data && r.data.positions.length > 0) withPositions.add(accountIds[i]!);
  });
  return { withPositions, pending };
}

/** One position with its movements, newest first. */
export function usePositionDetail(positionId: string | undefined) {
  const { currentUser } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'position', positionId ?? null],
    enabled: !!currentUser && !!positionId,
    queryFn: async (): Promise<PositionDetail> => {
      const response = await apiClient.get<PositionDetail>(`/investments/positions/${positionId}`);
      if (!response.data) throw new Error('Empty position response');
      return response.data;
    },
    refetchOnWindowFocus: false,
  });
}

/** What changes with a position: the investments, the net worth (['dashboard']) and the goals fed by positions. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['savings-goals'] });
  };
}

export function useCreatePosition(accountId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<PositionDetail> => {
      const response = await apiClient.post<PositionDetail>(`/investments/accounts/${accountId}/positions`, body);
      return response.data!;
    },
    onSuccess: refresh,
  });
}

/** PATCH of a position: name, goal link, close/reopen, the anchor value. */
export function useUpdatePosition(positionId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<PositionDetail> => {
      const response = await apiClient.patch<PositionDetail>(`/investments/positions/${positionId}`, body);
      return response.data!;
    },
    onSuccess: refresh,
  });
}

export function useCreateMovement(positionId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<{ movement: Movement }> => {
      const response = await apiClient.post<{ movement: Movement }>(`/investments/positions/${positionId}/movements`, body);
      return response.data!;
    },
    onSuccess: refresh,
  });
}

export function useDeleteMovement(positionId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (movementId: string): Promise<void> => {
      await apiClient.delete(`/investments/positions/${positionId}/movements/${movementId}`);
    },
    onSuccess: refresh,
  });
}
