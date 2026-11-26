// Bite-checks of the category dialogs: one mutant of the REAL sources per guard (a scratch copy of the frontend `src`),
// rebuilt and run through category-sim.mjs; the named scenario must fail. usage:  FRONTEND_DIR=<frontend> node bite-categories.mjs [filter]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(here, '../..');
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const MUTANTS = [
  // [name, file under src, from, to, scenario that must fail]
  ['merge-preview-not-latest-wins', 'components/categories/CategoryMergeDialog.tsx', 'if (seq !== requestSeq.current) return;\n        setPreview(result);', 'setPreview(result);', 'CM10'],
  ['merge-confirm-without-preview', 'components/categories/CategoryMergeDialog.tsx', 'disabled={merging || previewing || !previewReady || !target}', 'disabled={merging}', 'CM8'],
  ['merge-dialog-closable-while-merging', 'components/categories/CategoryMergeDialog.tsx', 'canClose={!merging}', 'canClose', 'CM11'],
  ['merge-404-keeps-stale-list', 'components/categories/CategoryMergeDialog.tsx', "void queryClient.invalidateQueries({ queryKey: ['categories'] });", 'void 0;', 'CM14'],
  ['delete-offered-when-used', 'components/categories/CategoryManager.tsx', 'const used = usageTotal(c.usage) > 0;', 'const used = false;', 'CM1'],
  ['viewer-can-edit', 'components/categories/CategoryManager.tsx', '{canEdit && (\n                      <>', '{true && (\n                      <>', 'CM2'],
  ['form-submit-despite-invalid-name', 'components/categories/CategoryFormDialog.tsx', 'disabled={saving || !check.ok || unchanged}', 'disabled={saving}', 'CM4'],
  ['form-closable-while-saving', 'components/categories/CategoryFormDialog.tsx', 'canClose={!saving}', 'canClose', 'CM13'],
  ['merge-hook-no-refetch', 'hooks/api/useCategories.ts', `(response as { data?: MergeCategoryResult }).data!;
    },
    onSettled: () => {
      void queryClient.invalidateQueries();`, `(response as { data?: MergeCategoryResult }).data!;
    },
    onSettled: () => {`, 'CM8'],
  ['rename-hook-no-refetch', 'hooks/api/useCategories.ts', `    onSettled: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Delete`, `    onSettled: () => {},
  });
}

/**
 * Delete`, 'CM6'],
  ['combobox-create-guard-removed', 'components/CategoryCombobox.tsx', 'if (!createOption || !apiType || creatingRef.current) return;', 'if (!createOption || !apiType) return;', 'CC3'],
  ['combobox-create-without-type', 'components/CategoryCombobox.tsx', 'allowCreate && apiType ? createOptionFor', 'allowCreate ? createOptionFor', 'CC2'],
  ['combobox-slug-shown', 'components/CategoryCombobox.tsx', 'return [...fromApi, ...created.filter(', 'return [...fromApi, ...[].filter(', 'CC1'],
];

const run = (variant, srcRoot) => spawnSync(process.execPath, ['category-sim.mjs'], {
  cwd: here, encoding: 'utf8', env: { ...process.env, FRONTEND_DIR: FRONT, SIM_VARIANT: variant, ...(srcRoot ? { SRC_OVERRIDE: srcRoot } : {}) },
});
const failures = (res) => [...res.stdout.matchAll(/FAIL (\w+)/g)].map((m) => m[1]);

const base = run('cat-base');
if (base.status !== 0) { console.log(base.stdout, base.stderr); console.log('unmutated simulation FAILED'); process.exit(1); }
let escaped = 0;
for (const [name, file, from, to, scenario] of MUTANTS) {
  if (filter && !filter.test(name)) continue;
  const original = fs.readFileSync(path.join(FRONT, 'src', file), 'utf8').split(String.fromCharCode(13)).join('');
  if (!original.includes(from)) { console.log(`MISSING  ${name}: pattern not found`); escaped += 1; continue; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catmut-'));
  const srcRoot = path.join(tmp, 'src');
  fs.cpSync(path.join(FRONT, 'src'), srcRoot, { recursive: true });
  fs.writeFileSync(path.join(srcRoot, file), original.replace(from, to));
  const res = run(`cat-${name}`.slice(0, 40), srcRoot);
  const failed = failures(res);
  const bit = scenario ? failed.includes(scenario) : failed.length > 0 || res.status !== 0;
  if (!bit) escaped += 1;
  console.log(`${bit ? 'bit    ' : 'ESCAPED'}  ${name}  -> ${failed.join(',') || (res.status !== 0 ? 'build/run error' : 'none')}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(path.join(here, 'out', `cat-${name}`.slice(0, 40) + '.mjs'), { force: true });
  fs.rmSync(path.join(here, `entry.cat-${name}`.slice(0, 46) + '.tsx'), { force: true });
}
fs.rmSync(path.join(here, 'out', 'cat-base.mjs'), { force: true });
fs.rmSync(path.join(here, 'entry.cat-base.tsx'), { force: true });
console.log(escaped === 0 ? 'all mutants killed' : `${escaped} escaped`);
process.exit(escaped === 0 ? 0 : 1);
