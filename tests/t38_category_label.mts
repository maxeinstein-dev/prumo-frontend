import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// Category label of a row (src/utils/categoryLabel.ts) and the default window of the cash flow. Invented data only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = await import(pathToFileURL(frontSrc(process.env.CATEGORY_LABEL_MODULE ?? 'utils/categoryLabel.ts')).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(frontSrc('utils/cashFlow.ts')).href);

const CUSTOM = [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'Casa Exemplo' }];
const TX = { categoryHEALTHCARE: 'Saúde traduzida' };

check('CL-a: a custom category shows its name, never the raw CUSTOM:<id>', () => {
  assert.equal(L.invoiceRowCategoryLabel('CUSTOM:aaaaaaaa-1111-4111-8111-111111111111', TX, CUSTOM), 'Casa Exemplo');
});

check('CL-b: a custom category that is not in the list (not loaded, removed) shows nothing, not its id', () => {
  assert.equal(L.invoiceRowCategoryLabel('CUSTOM:bbbbbbbb-2222-4222-8222-222222222222', TX, CUSTOM), '');
  assert.equal(L.invoiceRowCategoryLabel('CUSTOM:aaaaaaaa-1111-4111-8111-111111111111', TX, undefined), '');
  assert.equal(L.invoiceRowCategoryLabel('CUSTOM:aaaaaaaa-1111-4111-8111-111111111111', TX, []), '');
});

check('CL-c: a system category uses the translations it is given, else its built-in name; no category gives an empty label', () => {
  assert.equal(L.invoiceRowCategoryLabel('HEALTHCARE', TX, CUSTOM), 'Saúde traduzida');
  assert.equal(L.invoiceRowCategoryLabel('HEALTHCARE', undefined, CUSTOM), 'Saúde');
  assert.equal(L.invoiceRowCategoryLabel(undefined, TX, CUSTOM), '');
  assert.equal(L.invoiceRowCategoryLabel('', TX, CUSTOM), '');
});

check('CL-d: guard: the credit cards page labels its rows through invoiceRowCategoryLabel with the custom categories', () => {
  const src = readFileSync(frontSrc('pages/CreditCards.tsx'), 'utf8');
  assert.ok(src.includes('invoiceRowCategoryLabel(categoryName, t as unknown as Record<string, string>, customCategories)'));
  assert.ok(!/getCategoryDisplayName\(t\.categoryName/.test(src), 'the converter must not label the row with its own parameter as the translations');
});

check('CL-e: the cash flow opens on 30 days; an unknown period falls back to it', () => {
  assert.equal(C.DEFAULT_CASH_FLOW_DAYS, 30);
  assert.equal(C.normalizePeriod(undefined), 30);
  assert.equal(C.normalizePeriod(45), 30);
  assert.equal(C.normalizePeriod(90), 90);
});

summary();
