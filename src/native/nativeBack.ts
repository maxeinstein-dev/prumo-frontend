import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HOME_PATH, backAction, type BackAction } from '../utils/backLayers';

/**
 * The page's side of the Android back button. MainActivity asks `window.__rectaNativeBack()` (through the bridge's
 * eval) what to do: the page closes its layer, goes back in its own history, or goes to Início, and answers 'exit'
 * only on Início (or outside the app, like the login) with nothing to go back to. The WebView's canGoBack() is not
 * consulted.
 */

type NativeBackWindow = Window & {
  __rectaNativeBack?: () => BackAction;
};

// Set by useNativeBackHome() inside the router; until then 'goHome' falls back to a full load of Início.
let goHome: () => void = () => window.location.assign(HOME_PATH);

/** Installs the function MainActivity calls. `openLayers` returns the layers open now (see hooks/useBackLayer.ts). */
export function installNativeBack(openLayers: () => readonly string[]): void {
  if (typeof window === 'undefined') return;
  (window as NativeBackWindow).__rectaNativeBack = () => {
    const index = (window.history.state as { idx?: unknown } | null)?.idx;
    const action = backAction(openLayers(), typeof index === 'number' ? index : null, window.location.pathname);
    if (action === 'goHome') goHome();
    else if (action !== 'exit') window.history.back();
    return action;
  };
}

/** Lets the back button reach Início through the router (replacing the screen, so the next back leaves the app). */
export function useNativeBackHome(): void {
  const navigate = useNavigate();
  useEffect(() => {
    goHome = () => navigate(HOME_PATH, { replace: true });
  }, [navigate]);
}
