import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P01 D3: tapping the local notice "Compra de R$ X capturada: confirmar?" opens the app with a target the native side
// hands to the page (CaptureReader.takeOpenRequest). src/utils/nativeOpen.ts maps it to a route: only known targets,
// so nothing the native side passes can send the page to an arbitrary address. NATIVE_OPEN_MODULE points at a mutated copy.
const modPath = process.env.NATIVE_OPEN_MODULE || frontSrc('utils/nativeOpen.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const N: any = await import(pathToFileURL(modPath).href);

console.log('\nnative open (P01 D3)');

check('NO-a the capture box target opens the capture box', () => {
  assert.equal(N.routeForNativeOpen('captures'), '/app/captures');
});

check('NO-b anything else opens nothing', () => {
  for (const value of [null, undefined, '', 'CAPTURES', ' captures', '/app/captures', 'https://example.com', 'javascript:alert(1)', 'toString', 'constructor', 42, {}, ['captures']]) {
    assert.equal(N.routeForNativeOpen(value), null, String(value));
  }
});

check('NO-c the answer of the plugin is read by its target field', () => {
  assert.equal(N.routeForOpenRequest({ target: 'captures' }), '/app/captures');
  assert.equal(N.routeForOpenRequest({ target: null }), null);
  assert.equal(N.routeForOpenRequest(null), null);
  assert.equal(N.routeForOpenRequest(undefined), null);
  assert.equal(N.routeForOpenRequest('captures'), null);
});
