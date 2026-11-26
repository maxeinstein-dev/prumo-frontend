import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// "Hoje" não congela com o app em segundo plano (lote rv14). Lógica pura de utils/currentDay.ts.
// CURRENT_DAY_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.CURRENT_DAY_MODULE || frontSrc('utils/currentDay.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D: any = await import(pathToFileURL(modPath).href);

console.log('\n[hoje] utils/currentDay.ts');

check('dayKeyOf: local day, zero padded', () => {
  assert.equal(D.dayKeyOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(D.dayKeyOf(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

check('refreshDay: the same day keeps the known value', () => {
  assert.equal(D.refreshDay('2026-11-25', new Date(2026, 10, 25, 18, 0)), '2026-11-25');
});

check('refreshDay: after days in the background it moves to the new day, across a month and a year', () => {
  assert.equal(D.refreshDay('2026-11-25', new Date(2026, 10, 28, 9, 0)), '2026-11-28');
  assert.equal(D.refreshDay('2026-11-30', new Date(2026, 11, 1, 8, 0)), '2026-12-01');
  assert.equal(D.refreshDay('2026-12-31', new Date(2027, 0, 1, 8, 0)), '2027-01-01');
});

check('monthOfDayKey: the month the rollover turns "current" into', () => {
  assert.equal(D.monthOfDayKey('2026-12-01'), '2026-12');
  assert.equal(D.monthOfDayKey(D.refreshDay('2026-11-30', new Date(2026, 11, 1))), '2026-12');
});
