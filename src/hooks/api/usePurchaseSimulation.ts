import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../utils/api';
import type { PurchaseSimulation, SimulationRequestBody } from '../../utils/purchaseSimulation';

/**
 * Simulates an installment purchase (POST /dashboard/purchase-simulation). It only reads on the server: nothing is saved,
 * so no query is invalidated.
 */
export function usePurchaseSimulation() {
  return useMutation({
    mutationFn: async (body: SimulationRequestBody): Promise<PurchaseSimulation> => {
      const response = await apiClient.post<PurchaseSimulation>('/dashboard/purchase-simulation', body);
      if (!response.data) throw new Error('Empty simulation response');
      return response.data;
    },
  });
}
