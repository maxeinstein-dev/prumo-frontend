// Bite-checks of utils/categoryManager.ts: one mutant per guard; t20_categories must fail for each (and pass unmutated).
// Usage: FRONTEND_DIR=<frontend checkout> node bite-categories.mjs   (TSX=<path to tsx cli.mjs>, default: the backend's)
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const front = process.env.FRONTEND_DIR ?? resolve(here, '..');
const tsx = process.env.TSX ?? resolve(here, '../node_modules/tsx/dist/cli.mjs');
const original = readFileSync(resolve(front, 'src/utils/categoryManager.ts'), 'utf8').split('\r\n').join('\n');
const scratch = resolve(here, 'mut-categories');
mkdirSync(scratch, { recursive: true });

const run = (file) => spawnSync(process.execPath, [tsx, 'run-categories.mts'], {
  cwd: here, encoding: 'utf8', env: { ...process.env, FRONTEND_DIR: front, ...(file ? { CATEGORY_MANAGER_MODULE: file } : {}) },
});

const MUTANTS = [
  ['no-nfd', String.raw`name.normalize('NFD').replace(/\p{M}/gu, '')`, 'name', 'normalizeCategoryName ignores'],
  ['no-collapse-spaces', String.raw`.replace(/\s+/g, ' ').trim().toLowerCase()`, ".trim().toLowerCase()", 'normalizeCategoryName ignores'],
  ['source-as-target', "c.type === source.type && c.id !== source.id &&", 'c.type === source.type &&', 'mergeTargets'],
  ['other-type-target', "c.type === source.type && c.id !== source.id &&", 'c.id !== source.id &&', 'mergeTargets'],
  ['markers-as-target', "c.id !== source.id && c.id !== 'TRANSFER' && c.id !== 'ALLOCATION');\n  const custom", "c.id !== source.id);\n  const custom", 'mergeTargets'],
  ['system-source', 'if (source.isSystem) return [];', '', 'mergeTargets'],
  ['preview-always', "preview ? '?preview=true' : ''", "'?preview=true'", 'buildMergeRequest'],
  ['custom-by-name', "{ targetCategoryId: target.id } : { targetSystemName: target.id }", "{ targetSystemName: target.id } : { targetCategoryId: target.id }", 'buildMergeRequest'],
  ['usage-ignores-budgets', 'usage.transactions + usage.recurringTransactions + usage.budgets : 0', 'usage.transactions + usage.recurringTransactions : 0', 'usageTotal'],
  ['rename-clash-with-self', 'c.id !== ignoreId &&', '', 'ignores the category itself'],
  ['clash-ignores-system', 'normalizeCategoryName(c.isSystem ? systemLabel(c) : c.name) === wanted', 'normalizeCategoryName(c.name) === wanted', 'validateCategoryName'],
  ['clash-ignores-type', 'c.type === type && c.id !== ignoreId', 'c.id !== ignoreId', 'validateCategoryName'],
  ['create-offered-on-match', 'if (options.some((o) => o.value !== \'\' && normalizeCategoryName(o.display) === wanted)) return null;', '', 'createOptionFor'],
  ['create-untrimmed', String.raw`const name = search.replace(/\s+/g, ' ').trim();` + "\n  if (!name || name.length > MAX_CATEGORY_NAME) return null;", "const name = search;\n  if (!name.trim() || name.length > MAX_CATEGORY_NAME) return null;", 'createOptionFor'],
  ['slug-leaks', "case 'CATEGORY_NAME_TAKEN':\n      return 'Já existe", "case 'CATEGORY_NAME_TAKEN':\n      return 'CATEGORY_NAME_TAKEN: já existe", 'categoryFailureMessage'],
  ['patch-always-name', 'if (next.name !== original.name) patch.name = next.name;', 'patch.name = next.name;', 'buildUpdatePatch'],
  ['sentence-no-budgets', "const budgets = counts.budgets + counts.budgetsCombined;\n  const parts", "const budgets = 0;\n  const parts", 'mergePreviewSentence'],
  ['custom-after-system', 'return [...sort(custom), ...sort(system)];', 'return [...sort(system), ...sort(custom)];', 'mergeTargets'],
];

const base = run(null);
if (base.status !== 0) { console.log(base.stdout, base.stderr); console.log('unmutated suite FAILED'); process.exit(1); }
let escaped = 0;
for (const [name, from, to, expectIn] of MUTANTS) {
  if (!original.includes(from)) { console.log(`MISSING  ${name}: pattern not found`); escaped += 1; continue; }
  const file = resolve(scratch, `${name}.ts`);
  writeFileSync(file, original.replace(from, to));
  const res = run(file);
  const failed = [...res.stdout.matchAll(/FAIL (.*)/g)].map((m) => m[1]);
  const bit = res.status !== 0 && failed.some((f) => f.includes(expectIn));
  if (!bit) escaped += 1;
  console.log(`${bit ? 'bit    ' : 'ESCAPED'}  ${name}  ${failed.length ? '-> ' + failed[0].slice(0, 70) : ''}`);
}
rmSync(scratch, { recursive: true, force: true });
console.log(escaped === 0 ? `all ${MUTANTS.length} mutants killed` : `${escaped} escaped`);
process.exit(escaped === 0 ? 0 : 1);
