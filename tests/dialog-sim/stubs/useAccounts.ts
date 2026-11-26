import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api';
// Same query options as the real hook (src/hooks/api/useAccounts.ts), minus auth; the fake server returns a NEW object every fetch.
export function useAccounts(params: { householdId: string }) {
  return useQuery({
    queryKey: ['accounts', params],
    queryFn: async () => JSON.parse(JSON.stringify((globalThis as any).__accountsPayload)),
    enabled: !!params.householdId,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

// Same request and invalidations as the real useAdjustAccountBalance (src/hooks/api/useAccounts.ts).
export function useAdjustAccountBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, ...data }: { accountId: string; newBalance: number; date?: string; reason?: string }) => {
      const response: any = await apiClient.post(`/accounts/${accountId}/adjust-balance`, data);
      return response.data!;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts', variables.accountId] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
