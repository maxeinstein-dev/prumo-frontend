import { useQuery } from '@tanstack/react-query';
export function useCategories(params: { householdId?: string | null }) {
  return useQuery({
    queryKey: ['categories', params],
    queryFn: async () => JSON.parse(JSON.stringify((globalThis as any).__categoriesPayload ?? [])),
    enabled: true,
  });
}
