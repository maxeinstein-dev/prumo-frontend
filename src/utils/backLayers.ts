/**
 * Pure logic of the Android back button in the mobile shell: which layers (sheets, menus, modals) are open, which one
 * the back closes, and how a layer's own history entry is added or removed. No React and no imports, so
 * tools/fe-tests/t40_back_layers.mts runs it under tsx (BACK_LAYERS_MODULE points it at a mutated copy).
 *
 * Each open layer owns one history entry, marked with `history.state.prumoLayer = id`. The back button pops that entry
 * (the WebView goes back), and the popstate closes the layer on top. A layer closed by code pops its own entry with
 * history.back(), so the history does not keep leftovers.
 */

export const LAYER_STATE_KEY = 'prumoLayer';

/** Início, the only screen where the back button leaves the app. */
export const HOME_PATH = '/app';

/** The layers open now, oldest first. Adds `id` on top; an id already open is not added twice. */
export function pushLayer(stack: readonly string[], id: string): string[] {
  return stack.includes(id) ? [...stack] : [...stack, id];
}

/** The layers without `id`. */
export function removeLayer(stack: readonly string[], id: string): string[] {
  return stack.filter((layer) => layer !== id);
}

/** The layer on top, or null when none is open. */
export function topLayer(stack: readonly string[]): string | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * The layer a popstate closes: the top one, unless the entry the history landed on (`poppedLayer`) already is that
 * top layer's entry. Null when nothing has to close.
 */
export function layerToClose(stack: readonly string[], poppedLayer: string | null | undefined): string | null {
  const top = topLayer(stack);
  if (top === null) return null;
  return poppedLayer === top ? null : top;
}

/**
 * Whether a layer closed by code should pop its own entry: only when that entry is the current one (`stateLayer`)
 * and no other layer still claims it. Otherwise (the entry is gone, or a navigation already moved on) nothing is popped.
 */
export function historyBackOnClose(
  stack: readonly string[],
  stateLayer: string | null | undefined,
  id: string,
): boolean {
  return stateLayer === id && !stack.includes(id);
}

/**
 * How a layer opening writes its entry: 'keep' when the current entry is already its own (a remount), 'replace' when
 * the current entry is a stale layer entry (a sheet that just closed in the same tick), 'push' otherwise.
 */
export function entryForOpen(
  stack: readonly string[],
  stateLayer: string | null | undefined,
  id: string,
): 'keep' | 'replace' | 'push' {
  if (stateLayer === id) return 'keep';
  if (stateLayer && !stack.includes(stateLayer)) return 'replace';
  return 'push';
}

export type ShellNavigation = 'stay' | 'push' | 'replace';

/**
 * How a tab or "Mais" item navigates. The tab you are on adds nothing. With a sheet open, the navigation replaces the
 * sheet's entry, so voltar goes back to the screen before the sheet. Otherwise it pushes, so voltar returns to the
 * previous screen.
 */
export function shellNavigation(currentPath: string, targetPath: string, sheetOpen: boolean): ShellNavigation {
  if (currentPath === targetPath) return 'stay';
  return sheetOpen ? 'replace' : 'push';
}

export type BackAction = 'closeLayer' | 'historyBack' | 'goHome' | 'confirmExit' | 'exit';

/** How long after the "toque de novo para sair" notice a second back on Início leaves the app. */
export const EXIT_CONFIRM_MS = 2000;

/** Whether `pathname` is Início (`/app` or `/app/`). */
export function isHome(pathname: string | null | undefined): boolean {
  return pathname === HOME_PATH || pathname === HOME_PATH + '/';
}

/** Whether `pathname` is a screen of the app other than Início (`/app/...`). Início itself (`/app`, `/app/`) is not. */
export function isScreenOffHome(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false;
  return pathname.startsWith(HOME_PATH + '/') && pathname.length > HOME_PATH.length + 1;
}

/**
 * What the Android back button does, decided by the page: close the layer on top, go back in the history, go to
 * Início, ask to confirm leaving, or leave the app. `historyIndex` is react-router's `history.state.idx` (0 on the first
 * entry of the app).
 *
 * - A layer open (sheet, menu, modal) closes first, on any screen.
 * - On Início the app leaves with two backs: the first one shows "toque de novo para sair" ('confirmExit') and a second
 *   one within EXIT_CONFIRM_MS of it (`lastExitPromptAt`, same clock as `now`) leaves. The tabs visited before are not
 *   walked back, as is usual on Android.
 * - On another screen of the app the back goes back in the history; with no earlier entry it goes to Início.
 * - Outside the app (login, landing) the first entry leaves at once.
 *
 * The WebView's own canGoBack() is not used: the page knows its own entries.
 */
export function backAction(
  stack: readonly string[],
  historyIndex: number | null | undefined,
  pathname?: string | null,
  now?: number,
  lastExitPromptAt?: number | null,
): BackAction {
  if (stack.length > 0) return 'closeLayer';
  if (isHome(pathname)) {
    const elapsed =
      typeof now === 'number' && typeof lastExitPromptAt === 'number' ? now - lastExitPromptAt : Number.NaN;
    return elapsed >= 0 && elapsed < EXIT_CONFIRM_MS ? 'exit' : 'confirmExit';
  }
  if (typeof historyIndex === 'number' && historyIndex > 0) return 'historyBack';
  if (isScreenOffHome(pathname)) return 'goHome';
  return 'exit';
}
