import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Botão voltar (lote RB): o app só sai pelo voltar na tela Início, com dois toques (o primeiro avisa "toque de novo
// para sair"). Fora dela, sem camada aberta e sem tela anterior
// no histórico (o app abriu direto no Extrato, por exemplo), o voltar leva ao Início em vez de fechar o app.
// Pure logic, invented paths only. BACK_LAYERS_MODULE points the suite at a mutated copy of utils/backLayers.ts.
const blPath = process.env.BACK_LAYERS_MODULE || frontSrc('utils/backLayers.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = await import(pathToFileURL(blPath).href);

console.log('\n[back home] utils/backLayers.ts: exit only on Início, with two backs');

if (L.HOME_PATH === undefined) {
  check('HOME_PATH exists in utils/backLayers.ts', () => assert.fail('HOME_PATH is missing: the back-to-home logic is gone'));
} else {
  check('HOME_PATH is the Início of the mobile shell', () => {
    assert.equal(L.HOME_PATH, '/app');
  });

  check('backAction: on Início with nothing open, the first back asks to confirm instead of leaving', () => {
    assert.equal(L.backAction([], 0, '/app'), 'confirmExit');
    assert.equal(L.backAction([], null, '/app'), 'confirmExit');
    assert.equal(L.backAction([], 0, '/app/'), 'confirmExit');
    assert.equal(L.backAction([], 0, '/app', 10_000, null), 'confirmExit');
  });

  check('backAction: on Início the earlier tabs in the history are not walked back; the back asks to confirm', () => {
    // Início -> Extrato -> Cartões -> Início: the back on Início does not return to Cartões.
    assert.equal(L.backAction([], 3, '/app'), 'confirmExit');
  });

  check('backAction: a second back on Início within EXIT_CONFIRM_MS leaves the app', () => {
    assert.equal(L.EXIT_CONFIRM_MS, 2000);
    assert.equal(L.backAction([], 0, '/app', 10_000, 9_000), 'exit');
    assert.equal(L.backAction([], 3, '/app', 10_000, 8_001), 'exit');
  });

  check('backAction: a second back after the window (or exactly at it) asks again', () => {
    assert.equal(L.backAction([], 0, '/app', 10_000, 8_000), 'confirmExit');
    assert.equal(L.backAction([], 0, '/app', 10_000, 2_000), 'confirmExit');
  });

  check('backAction: a prompt time in the future (clock moved back) does not leave', () => {
    assert.equal(L.backAction([], 0, '/app', 10_000, 12_000), 'confirmExit');
  });

  check('backAction: a recent prompt does not make another screen leave the app', () => {
    assert.equal(L.backAction([], 0, '/app/transactions', 10_000, 9_500), 'goHome');
    assert.equal(L.backAction([], 2, '/app/transactions', 10_000, 9_500), 'historyBack');
  });

  check('backAction: first entry on another shell screen goes to Início instead of leaving', () => {
    assert.equal(L.backAction([], 0, '/app/transactions'), 'goHome');
    assert.equal(L.backAction([], null, '/app/credit-cards'), 'goHome');
    assert.equal(L.backAction([], undefined, '/app/income/simulator'), 'goHome');
  });

  check('backAction: a layer open still closes first, on any screen', () => {
    assert.equal(L.backAction(['sheet'], 0, '/app/transactions'), 'closeLayer');
    assert.equal(L.backAction(['sheet'], 0, '/app'), 'closeLayer');
    assert.equal(L.backAction(['sheet'], 0, '/app', 10_000, 9_500), 'closeLayer');
  });

  check('backAction: an earlier history entry still goes back on the other screens', () => {
    assert.equal(L.backAction([], 2, '/app/transactions'), 'historyBack');
    assert.equal(L.backAction([], 1, '/app/credit-cards'), 'historyBack');
  });

  check('backAction: outside the shell (login, landing) the first entry leaves the app, with no confirmation', () => {
    assert.equal(L.backAction([], 0, '/login'), 'exit');
    assert.equal(L.backAction([], 0, '/'), 'exit');
    assert.equal(L.backAction([], 0, '/apples'), 'exit');
    assert.equal(L.backAction([], 2, '/login'), 'historyBack');
  });

  check('backAction: without a path the old rule holds (exit on the first entry)', () => {
    assert.equal(L.backAction([], 0), 'exit');
  });
}
