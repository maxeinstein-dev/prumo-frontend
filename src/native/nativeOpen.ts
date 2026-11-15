import { useEffect } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { CaptureReader, isNativeApp } from './captureReader';
import { routeForOpenRequest } from '../utils/nativeOpen';

/**
 * Opens the screen a tap on a native notice asked for (P01 D3). The native side keeps the request until it is taken:
 * on a cold start it is taken when this mounts; with the app already open, the "openRequest" event says a new one came.
 */
export function useNativeOpenRequests(navigate: (to: string) => void): void {
  useEffect(() => {
    if (!isNativeApp()) return;
    let active = true;
    const take = () => {
      void CaptureReader.takeOpenRequest()
        .then((answer) => {
          const route = routeForOpenRequest(answer);
          if (active && route) navigate(route);
        })
        .catch(() => undefined);
    };
    take();
    let handle: PluginListenerHandle | null = null;
    void CaptureReader.addListener('openRequest', take)
      .then((h) => {
        if (active) handle = h;
        else void h.remove();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      void handle?.remove();
    };
  }, [navigate]);
}
