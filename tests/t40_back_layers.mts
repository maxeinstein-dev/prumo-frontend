import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Botão voltar da casca móvel: pilha de camadas abertas (folhas, menus, modais) e troca de aba.
// Pure logic, invented route names only. BACK_LAYERS_MODULE points the suite at a mutated copy of utils/backLayers.ts.
const blPath = process.env.BACK_LAYERS_MODULE || frontSrc('utils/backLayers.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = await import(pathToFileURL(blPath).href);

console.log('\n[back layers] utils/backLayers.ts');

check('pushLayer: appends the layer on top and ignores a layer already open', () => {
  assert.deepEqual(L.pushLayer([], 'a'), ['a']);
  assert.deepEqual(L.pushLayer(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(L.pushLayer(['a', 'b'], 'a'), ['a', 'b']);
});

check('pushLayer does not mutate the stack it receives', () => {
  const stack = ['a'];
  L.pushLayer(stack, 'b');
  assert.deepEqual(stack, ['a']);
});

check('removeLayer: takes the layer out wherever it is, and is a no-op when absent', () => {
  assert.deepEqual(L.removeLayer(['a', 'b', 'c'], 'b'), ['a', 'c']);
  assert.deepEqual(L.removeLayer(['a'], 'a'), []);
  assert.deepEqual(L.removeLayer(['a'], 'z'), ['a']);
});

check('topLayer: the last layer opened, or null with none open', () => {
  assert.equal(L.topLayer([]), null);
  assert.equal(L.topLayer(['a', 'b']), 'b');
});

check('layerToClose: with layers open, the voltar closes the top one', () => {
  assert.equal(L.layerToClose(['a', 'b'], undefined), 'b');
  assert.equal(L.layerToClose(['a', 'b'], null), 'b');
});

check('layerToClose: when the popped entry is already the top layer, nothing is closed', () => {
  assert.equal(L.layerToClose(['a', 'b'], 'b'), null);
  assert.equal(L.layerToClose([], undefined), null);
});

check('layerToClose: a voltar that lands on a lower layer closes the top layer above it', () => {
  // [P, a, b] and the voltar pops from b to a: b is closed, a stays.
  assert.equal(L.layerToClose(['a', 'b'], 'a'), 'b');
});

check('historyBackOnClose: a layer closed by code pops its own entry only when that entry is still on top', () => {
  assert.equal(L.historyBackOnClose([], 'a', 'a'), true);
  assert.equal(L.historyBackOnClose(['a'], 'a', 'a'), false);
  assert.equal(L.historyBackOnClose([], 'b', 'a'), false);
  assert.equal(L.historyBackOnClose([], undefined, 'a'), false);
});

check('entryForOpen: a new layer replaces a stale layer entry on top (no leftover), pushes over a page entry, keeps its own', () => {
  assert.equal(L.entryForOpen([], 'b', 'a'), 'replace'); // stale: the closed sheet's entry is still current
  assert.equal(L.entryForOpen([], undefined, 'a'), 'push'); // a page entry
  assert.equal(L.entryForOpen(['a'], 'a', 'a'), 'keep'); // strict-mode remount: the entry is already ours
  assert.equal(L.entryForOpen(['a'], 'a', 'b'), 'push'); // another layer open below: a stacked entry on top
});

check('shellNavigation: tapping the tab you are already on does not add an entry', () => {
  assert.equal(L.shellNavigation('/app/transactions', '/app/transactions', false), 'stay');
  assert.equal(L.shellNavigation('/app/transactions', '/app/transactions', true), 'stay');
});

check('shellNavigation: a tab or "Mais" item with no sheet open pushes an entry, so voltar returns to the previous screen', () => {
  assert.equal(L.shellNavigation('/app', '/app/credit-cards', false), 'push');
});

check('shellNavigation: with a sheet open, the navigation replaces the sheet entry so no leftover stays in the history', () => {
  assert.equal(L.shellNavigation('/app', '/app/credit-cards', true), 'replace');
});

// Native back (Android): the WebView's canGoBack() is not trusted; the page decides from its own state.
check('backAction: with a layer open the back closes it, even on the first page', () => {
  assert.equal(L.backAction(['a'], 0), 'closeLayer');
  assert.equal(L.backAction(['a', 'b'], 3), 'closeLayer');
});

check('backAction: with no layer open and an earlier history entry, the back goes back', () => {
  assert.equal(L.backAction([], 2), 'historyBack');
});

check('backAction: first entry of the app with nothing open leaves the app', () => {
  assert.equal(L.backAction([], 0), 'exit');
  assert.equal(L.backAction([], null), 'exit');
  assert.equal(L.backAction([], undefined), 'exit');
});
