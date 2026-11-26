import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Mensagens de rede em português (lote rv14). Lógica pura de utils/networkMessages.ts.
// NETWORK_MESSAGES_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.NETWORK_MESSAGES_MODULE || frontSrc('utils/networkMessages.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const N: any = await import(pathToFileURL(modPath).href);

console.log('\n[mensagens de rede] utils/networkMessages.ts');

check('timeout (code or message) says the server may be waking up', () => {
  const a = N.networkErrorMessage({ code: 'ECONNABORTED', message: 'x' });
  const b = N.networkErrorMessage({ message: 'timeout of 60000ms exceeded' });
  assert.equal(a, b);
  assert.match(a, /demorou a responder/);
  assert.match(a, /acordando/);
});

check('connection failure says there is no connection to the server', () => {
  assert.equal(N.networkErrorMessage({ code: 'ERR_NETWORK', message: 'Network Error' }), 'Sem conexão com o servidor.');
  assert.equal(N.networkErrorMessage({ code: 'ECONNREFUSED' }), 'Sem conexão com o servidor.');
  assert.equal(N.networkErrorMessage({ message: 'Network Error' }), 'Sem conexão com o servidor.');
});

check('anything else without an answer has its own text, and no message is English', () => {
  const other = N.networkErrorMessage({ code: 'EOTHER', message: 'boom' });
  assert.match(other, /não respondeu/);
  for (const m of [other, N.NETWORK_TIMEOUT_MESSAGE, N.NETWORK_UNREACHABLE_MESSAGE]) {
    assert.doesNotMatch(m, /Network error|Unable|Request|server took/i);
  }
});

check('httpErrorMessage: 5xx names the server error with the status; other statuses have a generic text', () => {
  assert.equal(N.httpErrorMessage(500), 'Erro no servidor (500).');
  assert.equal(N.httpErrorMessage(503), 'Erro no servidor (503).');
  assert.match(N.httpErrorMessage(404), /erro 404/);
  assert.doesNotMatch(N.httpErrorMessage(404), /HTTP/);
});
