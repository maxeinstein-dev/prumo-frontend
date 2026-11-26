import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Theme by device (lote R0): with no choice made on this device the theme follows the system; a choice made on
// this device wins. Invented data only. THEME_CHOICE_MODULE points the suite at a mutated copy of utils/themeChoice.ts.
const tcPath = process.env.THEME_CHOICE_MODULE || frontSrc('utils/themeChoice.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(tcPath).href);

console.log('\n[theme choice] utils/themeChoice.ts');

check('no choice on this device: the system decides, light or dark, whatever is saved', () => {
  assert.equal(T.resolveTheme({ chosen: false, saved: 'dark', systemDark: false }), 'light');
  assert.equal(T.resolveTheme({ chosen: false, saved: 'light', systemDark: true }), 'dark');
  assert.equal(T.resolveTheme({ chosen: false, saved: null, systemDark: true }), 'dark');
  assert.equal(T.resolveTheme({ chosen: false, saved: null, systemDark: false }), 'light');
});

check('a choice made on this device wins over the system', () => {
  assert.equal(T.resolveTheme({ chosen: true, saved: 'dark', systemDark: false }), 'dark');
  assert.equal(T.resolveTheme({ chosen: true, saved: 'light', systemDark: true }), 'light');
});

check('a chosen flag without a valid saved value falls back to the system', () => {
  assert.equal(T.resolveTheme({ chosen: true, saved: null, systemDark: true }), 'dark');
  assert.equal(T.resolveTheme({ chosen: true, saved: 'blue', systemDark: false }), 'light');
});

check('followsSystem is the negation of chosen', () => {
  assert.equal(T.followsSystem(false), true);
  assert.equal(T.followsSystem(true), false);
});

export {};
