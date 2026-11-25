/**
 * Pure rule of "the load failed" for the screens that still read the lists from the API: a failed request with
 * nothing to show is a failure, not an empty list ("nenhum lançamento", zero). A failed background refetch that still
 * has the data it had keeps showing that data (react-query keeps `data` across a failed refetch). No React and no
 * imports, so tools/fe-tests/t62_load_failure.mts runs it under tsx (LOAD_FAILURE_MODULE points it at a mutated copy).
 */

/** What the rule reads of a react-query result. */
export interface LoadState {
  isError: boolean;
  data?: unknown;
}

/** True when the request failed and there is no data to show in its place. */
export function isLoadFailure(state: LoadState): boolean {
  return state.isError && (state.data === undefined || state.data === null);
}

/** True when any of the requests failed with nothing to show. */
export function anyLoadFailure(states: LoadState[]): boolean {
  return states.some(isLoadFailure);
}

/** The message every screen shows in place of an empty state when the load failed. */
export const LOAD_FAILURE_MESSAGE = 'Não foi possível carregar os dados.';
export const LOAD_FAILURE_RETRY = 'Tentar de novo';
