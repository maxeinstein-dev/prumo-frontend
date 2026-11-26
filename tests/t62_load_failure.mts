import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Erro de carregamento não é "vazio" (lote rv14). Lógica pura de utils/loadFailure.ts.
// LOAD_FAILURE_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.LOAD_FAILURE_MODULE || frontSrc('utils/loadFailure.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = await import(pathToFileURL(modPath).href);

console.log('\n[erro de carregamento] utils/loadFailure.ts');

check('isLoadFailure: error with no data is a failure, not an empty list', () => {
  assert.equal(L.isLoadFailure({ isError: true, data: undefined }), true);
  assert.equal(L.isLoadFailure({ isError: true, data: null }), true);
});

check('isLoadFailure: a failed refetch that still has data keeps showing the data', () => {
  assert.equal(L.isLoadFailure({ isError: true, data: [] }), false);
  assert.equal(L.isLoadFailure({ isError: true, data: { data: [] } }), false);
});

check('isLoadFailure: no error is never a failure, even with no data yet', () => {
  assert.equal(L.isLoadFailure({ isError: false, data: undefined }), false);
  assert.equal(L.isLoadFailure({ isError: false, data: [1] }), false);
});

check('anyLoadFailure: one failed request is enough; none is not', () => {
  assert.equal(L.anyLoadFailure([{ isError: false, data: [] }, { isError: true }]), true);
  assert.equal(L.anyLoadFailure([{ isError: false, data: [] }, { isError: true, data: [] }]), false);
  assert.equal(L.anyLoadFailure([]), false);
});

check('the message and the retry label are in Portuguese', () => {
  assert.equal(L.LOAD_FAILURE_RETRY, 'Tentar de novo');
  assert.match(L.LOAD_FAILURE_MESSAGE, /Não foi possível carregar/);
});
