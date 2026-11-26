import { useQuery } from '@tanstack/react-query';
// Stand-in for hooks/api/useTransactions (the real one pulls the auth context). The settlement dialog only lists
// candidates: `globalThis.__transactionsFor(params)` answers like the server ({ data: Transaction[], pagination }).
export function useTransactions(params: { householdId?: string; type?: string; search?: string; limit?: number }) {
  return useQuery({
    queryKey: ['transactions', 'list', params],
    enabled: !!params.householdId,
    staleTime: 0,
    queryFn: async () => {
      const g = globalThis as any;
      g.__fake.calls.push({ kind: 'transactions-list', params });
      return JSON.parse(JSON.stringify(g.__transactionsFor ? g.__transactionsFor(params) : { data: [], pagination: { nextCursor: null, hasMore: false } }));
    },
  });
}
