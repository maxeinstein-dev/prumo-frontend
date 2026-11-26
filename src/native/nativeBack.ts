import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToastContext } from '../context/ToastContext';
import { EXIT_CONFIRM_MS, HOME_PATH, backAction, type BackAction } from '../utils/backLayers';

/**
 * The page's side of the Android back button. MainActivity asks `window.__prumoNativeBack()` (through the bridge's
 * eval) what to do: the page closes its layer, goes back in its own history, goes to Início, or, on Início, shows
 * "toque de novo para sair" and answers 'exit' only to a second back within EXIT_CONFIRM_MS. The rules are in
 * utils/backLayers.ts (backAction). The WebView's canGoBack() is not consulted.
 */

export const EXIT_CONFIRM_TEXT = 'Toque em voltar de novo para sair';

type NativeBackWindow = Window & {
  __prumoNativeBack?: () => BackAction;
};

// Set by useNativeBackBridge() inside the router and the toasts; until then these fall back to plain browser calls.
let goHome: () => void = () => window.location.assign(HOME_PATH);
let showExitNotice: () => void = () => undefined;
let lastExitPromptAt: number | null = null;

/** Installs the function MainActivity calls. `openLayers` returns the layers open now (see hooks/useBackLayer.ts). */
export function installNativeBack(openLayers: () => readonly string[]): void {
  if (typeof window === 'undefined') return;
  (window as NativeBackWindow).__prumoNativeBack = () => {
    const index = (window.history.state as { idx?: unknown } | null)?.idx;
    const now = Date.now();
    const action = backAction(
      openLayers(),
      typeof index === 'number' ? index : null,
      window.location.pathname,
      now,
      lastExitPromptAt,
    );
    if (action === 'confirmExit') {
      lastExitPromptAt = now;
      showExitNotice();
    } else {
      lastExitPromptAt = null;
      if (action === 'goHome') goHome();
      else if (action !== 'exit') window.history.back();
    }
    return action;
  };
}

/**
 * Lets the back button reach Início through the router (replacing the screen) and show the "toque de novo para sair"
 * notice through the app's toasts. Call it once, inside the router and the ToastProvider.
 */
export function useNativeBackBridge(): void {
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  useEffect(() => {
    goHome = () => navigate(HOME_PATH, { replace: true });
  }, [navigate]);
  useEffect(() => {
    showExitNotice = () => showToast(EXIT_CONFIRM_TEXT, 'info', EXIT_CONFIRM_MS);
  }, [showToast]);
}
