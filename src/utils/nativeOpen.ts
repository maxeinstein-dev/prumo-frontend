/**
 * P01 D3: a tap on the local notice "Compra de R$ X capturada: confirmar?" opens the app with a target the native side
 * keeps for the page (CaptureReader.takeOpenRequest). Only known targets map to a route, so nothing the native side
 * passes can send the page to an arbitrary address. Pure: covered by Recta/tools/fe-tests/t55_native_open.mts.
 */
const ROUTES: Readonly<Record<string, string>> = { captures: '/app/captures' };

export function routeForNativeOpen(target: unknown): string | null {
  if (typeof target !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(ROUTES, target) ? ROUTES[target] : null;
}

/** The answer of CaptureReader.takeOpenRequest(): `{ target }`. */
export function routeForOpenRequest(answer: unknown): string | null {
  if (!answer || typeof answer !== 'object') return null;
  return routeForNativeOpen((answer as { target?: unknown }).target);
}
