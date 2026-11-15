import { useEffect, useRef, useState, type RefObject } from 'react';
import { pullDistance, pullPhase, releaseRefreshes, type PullPhase, type PullStart } from '../utils/pullToRefresh';

/**
 * Pull to refresh on a scrolling element (the <main> of the mobile shell). The rules are in utils/pullToRefresh.ts: a
 * pull starts only at the top, sideways swipes are left to carousels and pills, and a release past the threshold calls
 * `onRefresh` once; while it runs, other pulls are ignored. Touch only: a mouse never pulls.
 */
export function usePullToRefresh(ref: RefObject<HTMLElement | null>, onRefresh: () => Promise<unknown>) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<PullStart | null>(null);
  const current = useRef(0);
  const busy = useRef(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      start.current = { x: t.clientX, y: t.clientY, scrollTop: el.scrollTop };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const t = e.touches[0]!;
      const d = pullDistance(start.current, { x: t.clientX, y: t.clientY });
      current.current = d;
      setDistance(d);
      // While the page is being pulled, the browser must not also scroll or bounce it.
      if (d > 0 && e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      const d = current.current;
      start.current = null;
      current.current = 0;
      setDistance(0);
      if (!releaseRefreshes(d, busy.current)) return;
      busy.current = true;
      setRefreshing(true);
      void Promise.resolve()
        .then(() => refresh.current())
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
          setRefreshing(false);
        });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref]);

  const phase: PullPhase = pullPhase(distance, refreshing);
  return { distance, phase };
}
