/**
 * Messages the user sees (toast) when a request does not get an answer or the server answers with an error and no
 * message of its own. The hosted backend sleeps and can take up to a minute to wake, so the timeout text says so.
 * No React and no imports, so tools/fe-tests/t63_network_messages.mts runs it under tsx (NETWORK_MESSAGES_MODULE
 * points it at a mutated copy).
 */

export const NETWORK_TIMEOUT_MESSAGE = 'O servidor demorou a responder. Ele pode estar acordando; tente de novo em instantes.';
export const NETWORK_UNREACHABLE_MESSAGE = 'Sem conexão com o servidor.';
export const NETWORK_NO_RESPONSE_MESSAGE = 'O servidor não respondeu. Tente de novo em instantes.';

/** The text for a request that got no response, from the axios error code and message. */
export function networkErrorMessage(error: { code?: string; message?: string }): string {
  const isTimeout = error.code === 'ECONNABORTED' || !!error.message?.includes('timeout');
  if (isTimeout) return NETWORK_TIMEOUT_MESSAGE;
  const isConnectionError =
    error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || !!error.message?.includes('Network Error');
  return isConnectionError ? NETWORK_UNREACHABLE_MESSAGE : NETWORK_NO_RESPONSE_MESSAGE;
}

/** The text for an error status the server answered without a message of its own. */
export function httpErrorMessage(status: number): string {
  if (status >= 500) return `Erro no servidor (${status}).`;
  return `Não foi possível concluir a ação (erro ${status}).`;
}
