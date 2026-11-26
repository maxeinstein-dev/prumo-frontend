import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Arrastar para atualizar (pedido do usuário em 15/11/2026). Lógica pura de utils/pullToRefresh.ts.
// PULL_TO_REFRESH_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.PULL_TO_REFRESH_MODULE || frontSrc('utils/pullToRefresh.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(modPath).href);

console.log('\n[arrastar para atualizar] utils/pullToRefresh.ts');

const start = (o: object = {}) => ({ x: 100, y: 200, scrollTop: 0, ...o });

check('pullDistance: only a downward pull that starts at the top of the page counts, with resistance', () => {
  assert.equal(S.pullDistance(start(), { x: 100, y: 300 }), 50);
  assert.equal(S.pullDistance(start(), { x: 100, y: 150 }), 0);
  assert.equal(S.pullDistance(start({ scrollTop: 1 }), { x: 100, y: 400 }), 0);
});

check('pullDistance: never goes past the maximum, however far the finger goes', () => {
  assert.equal(S.pullDistance(start(), { x: 100, y: 2000 }), S.MAX_PULL);
});

check('pullDistance: a sideways swipe (a carousel, a list of pills) is not a pull', () => {
  assert.equal(S.pullDistance(start(), { x: 300, y: 300 }), 0);
  assert.equal(S.pullDistance(start(), { x: 140, y: 300 }), 50);
});

check('pullPhase: idle, pulling, ready to release past the threshold, and refreshing', () => {
  assert.equal(S.pullPhase(0, false), 'idle');
  assert.equal(S.pullPhase(S.PULL_THRESHOLD - 1, false), 'pulling');
  assert.equal(S.pullPhase(S.PULL_THRESHOLD, false), 'ready');
  assert.equal(S.pullPhase(0, true), 'refreshing');
  assert.equal(S.pullPhase(S.PULL_THRESHOLD + 10, true), 'refreshing');
});

check('pullLabel: what the indicator says in each phase', () => {
  assert.equal(S.pullLabel('pulling'), 'Puxe para atualizar');
  assert.equal(S.pullLabel('ready'), 'Solte para atualizar');
  assert.equal(S.pullLabel('refreshing'), 'Atualizando…');
  assert.equal(S.pullLabel('idle'), '');
});

check('releaseRefreshes: only a release past the threshold refreshes, and never twice at once', () => {
  assert.equal(S.releaseRefreshes(S.PULL_THRESHOLD, false), true);
  assert.equal(S.releaseRefreshes(S.PULL_THRESHOLD - 1, false), false);
  assert.equal(S.releaseRefreshes(S.MAX_PULL, true), false);
});
