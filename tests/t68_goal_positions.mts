import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P21 L5: metas pela soma das posições. Lógica pura de utils/goalPositions.ts. Só dados inventados.
// GOAL_POSITIONS_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.GOAL_POSITIONS_MODULE || frontSrc('utils/goalPositions.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G: any = await import(pathToFileURL(modPath).href);

console.log('\n[metas das posições] utils/goalPositions.ts');

const plain = { targetAmount: 1000, currentAmount: 250 };
const fromPos = { targetAmount: 1000, currentAmount: 1153, fromPositions: true, positionsCount: 2, valueDate: '2026-11-05', estimated: true, noQuote: false };

check('goalProgress: o percentual pode passar de 100, a barra nunca', () => {
  assert.deepEqual(G.goalProgress(plain), { percent: 25, barPercent: 25 });
  assert.deepEqual(G.goalProgress(fromPos), { percent: 115.3, barPercent: 100 });
  assert.deepEqual(G.goalProgress({ targetAmount: 1000, currentAmount: 1000 }), { percent: 100, barPercent: 100 });
});

check('goalProgress: alvo zero ou valor negativo não quebram a barra', () => {
  assert.deepEqual(G.goalProgress({ targetAmount: 0, currentAmount: 10 }), { percent: 0, barPercent: 0 });
  assert.deepEqual(G.goalProgress({ targetAmount: 100, currentAmount: -5 }), { percent: 0, barPercent: 0 });
});

check('goalProgress: arredonda a um decimal sem ruído de ponto flutuante', () => {
  assert.equal(G.goalProgress({ targetAmount: 3, currentAmount: 1 }).percent, 33.3);
  assert.equal(G.goalProgress({ targetAmount: 0.3, currentAmount: 0.1 + 0.2 }).percent, 100);
});

check('isFromPositions: só quando a API disse que o valor vem das posições', () => {
  assert.equal(G.isFromPositions(fromPos), true);
  assert.equal(G.isFromPositions(plain), false);
  assert.equal(G.isFromPositions({ ...plain, fromPositions: false }), false);
  assert.equal(G.isFromPositions(null), false);
});

check('takesManualMoney: meta das posições não recebe "guardar", aporte nem valor guardado digitado', () => {
  assert.equal(G.takesManualMoney(plain), true);
  assert.equal(G.takesManualMoney(fromPos), false);
});

check('goalValueNotes: "estimado", "sem cotação" e a data do valor só nas metas das posições', () => {
  assert.deepEqual(G.goalValueNotes(fromPos), { estimated: true, noQuote: false, valueDate: '2026-11-05' });
  assert.deepEqual(G.goalValueNotes({ ...fromPos, noQuote: true }), { estimated: true, noQuote: true, valueDate: '2026-11-05' });
  assert.deepEqual(G.goalValueNotes({ ...fromPos, valueDate: null, estimated: false }), { estimated: false, noQuote: false, valueDate: null });
  assert.deepEqual(G.goalValueNotes({ ...plain, estimated: true, noQuote: true, valueDate: '2026-11-05' }), { estimated: false, noQuote: false, valueDate: null });
});

check('linkHidesStoredValue: ligar posição a meta com valor guardado esconde esse valor; meta vazia ou já das posições não avisa', () => {
  assert.equal(G.linkHidesStoredValue(plain), true);
  assert.equal(G.linkHidesStoredValue({ targetAmount: 1000, currentAmount: 0 }), false);
  assert.equal(G.linkHidesStoredValue({ targetAmount: 1000, currentAmount: 0.004 }), false);
  assert.equal(G.linkHidesStoredValue(fromPos), false);
  assert.equal(G.linkHidesStoredValue(null), false);
});

check('goalUpdateData: meta das posições nunca manda currentAmount (a API dá 400); meta comum só quando mudou', () => {
  const data = { name: 'Viagem', targetAmount: 2000, currentAmount: 1153 };
  assert.deepEqual(G.goalUpdateData(data, fromPos), { name: 'Viagem', targetAmount: 2000 });
  assert.deepEqual(G.goalUpdateData({ ...data, currentAmount: 999 }, fromPos), { name: 'Viagem', targetAmount: 2000 });
  assert.deepEqual(G.goalUpdateData({ ...data, currentAmount: 250 }, plain), { name: 'Viagem', targetAmount: 2000 });
  assert.deepEqual(G.goalUpdateData({ ...data, currentAmount: 300 }, plain), { name: 'Viagem', targetAmount: 2000, currentAmount: 300 });
});
