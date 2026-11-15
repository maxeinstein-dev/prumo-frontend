/**
 * Pure logic of "pull to refresh" on the phone (asked for by the user on 15/11/2026): the page of the mobile shell
 * scrolls inside its own <main> with overscroll-contain, so neither the app nor the phone's browser offers it. No React
 * and no imports, so tools/fe-tests/t60_pull_to_refresh.mts runs it under tsx (PULL_TO_REFRESH_MODULE points it at a
 * mutated copy).
 *
 * One refresh at a time: a pull released while a refresh is running does nothing, and the refresh itself keeps the
 * requests already in flight instead of firing them again (react-query's cancelRefetch: false), so repeated pulls never
 * pile requests on the API.
 */

/** How far (after resistance) the page must be pulled before a release refreshes it, in px. */
export const PULL_THRESHOLD = 64;
/** The indicator never goes further than this, however far the finger goes, in px. */
export const MAX_PULL = 96;
/** The finger moves twice as far as the indicator: the pull feels heavy, as in the usual apps. */
const RESISTANCE = 0.5;

export interface PullStart {
  x: number;
  y: number;
  /** scrollTop of the page when the finger touched it: a pull only starts at the very top. */
  scrollTop: number;
}

export interface PullPoint {
  x: number;
  y: number;
}

export type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing';

/** Distance of the indicator for a finger at `now`; 0 when the page was not at the top, the move goes up or sideways. */
export function pullDistance(start: PullStart, now: PullPoint): number {
  if (start.scrollTop > 0) return 0;
  const dy = now.y - start.y;
  const dx = Math.abs(now.x - start.x);
  if (dy <= 0 || dx > dy) return 0;
  return Math.min(MAX_PULL, Math.round(dy * RESISTANCE));
}

export function pullPhase(distance: number, refreshing: boolean): PullPhase {
  if (refreshing) return 'refreshing';
  if (distance >= PULL_THRESHOLD) return 'ready';
  return distance > 0 ? 'pulling' : 'idle';
}

export function pullLabel(phase: PullPhase): string {
  if (phase === 'pulling') return 'Puxe para atualizar';
  if (phase === 'ready') return 'Solte para atualizar';
  if (phase === 'refreshing') return 'Atualizando…';
  return '';
}

/** A release refreshes only past the threshold and never while a refresh is still running. */
export function releaseRefreshes(distance: number, refreshing: boolean): boolean {
  return !refreshing && distance >= PULL_THRESHOLD;
}
