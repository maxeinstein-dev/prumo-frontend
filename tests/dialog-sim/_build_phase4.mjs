// usage: node build.mjs <variant> <srcRoot>   (srcRoot = absolute path of a `src` dir: the repo's or a mutated copy)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// FRONTEND_DIR overrides the default sibling checkout (e.g. a git worktree).
const FRONT = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(here, '../..');
const req = createRequire(path.join(FRONT, 'package.json'));
const esbuild = req('esbuild');

const [variant, srcRootArg] = process.argv.slice(2);
if (!variant || !srcRootArg) throw new Error('usage: node build.mjs <variant> <srcRoot>');
const srcRoot = path.resolve(srcRootArg);
const posix = (p) => p.split(path.sep).join('/');

const STUBS = {
  'hooks/api/useAccounts': 'useAccounts.ts',
  'hooks/api/useCategories': 'useCategories.ts',
  'hooks/api/useTransactions': 'useTransactions.ts',
  'hooks/useDefaultHousehold': 'useDefaultHousehold.ts',
  'context/ToastContext': 'ToastContext.ts',
  'context/CurrencyContext': 'CurrencyContext.ts',
  'context/I18nContext': 'I18nContext.ts',
  'utils/format': 'format.ts',
  'utils/api': 'api.ts',
};

// A srcRoot (e.g. a worktree of another branch) may lack some of the files the entry imports: those imports and their
// exports are dropped, and the scenarios of that part check `B.<Export>` before registering.
function dropMissingImports(source) {
  const dropped = [];
  const kept = source.split('\n').filter((line) => {
    const m = /^import (?:\* as )?(\w+) from "([^"]+)";$/.exec(line);
    if (m && m[2].startsWith(posix(srcRoot)) && !fs.existsSync(m[2])) {
      dropped.push(m[1]);
      return false;
    }
    return true;
  });
  return kept
    .map((line) => line.replace(/^export \{(.*)\};$/, (_all, names) =>
      `export { ${names.split(',').map((n) => n.trim()).filter((n) => !dropped.includes(n)).join(', ')} };`))
    .join('\n');
}

const entryPath = path.join(here, `entry.${variant}.tsx`);
fs.writeFileSync(entryPath, dropMissingImports(`
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/ImportMaxFinDialog.tsx')))};
import * as Hook from ${JSON.stringify(posix(path.join(srcRoot, 'hooks/api/useImportMaxFin.ts')))};
import * as Payload from ${JSON.stringify(posix(path.join(srcRoot, 'utils/maxfinPayload.ts')))};
import CardDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/ImportCardOfxDialog.tsx')))};
import StatementDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/ImportTransactionsDialog.tsx')))};
import * as CardLogic from ${JSON.stringify(posix(path.join(srcRoot, 'utils/cardOfx.ts')))};
import DivideDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/people/DivideTransactionDialog.tsx')))};
import SettlementDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/people/SettlementDialog.tsx')))};
import OrganizeDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/people/OrganizeSharesDialog.tsx')))};
import PeoplePage from ${JSON.stringify(posix(path.join(srcRoot, 'pages/People.tsx')))};
import PersonDetail from ${JSON.stringify(posix(path.join(srcRoot, 'components/people/PersonDetail.tsx')))};
import PersonFormDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/people/PersonFormDialog.tsx')))};
import * as PeopleHook from ${JSON.stringify(posix(path.join(srcRoot, 'hooks/api/usePeople.ts')))};
import * as PeopleLogic from ${JSON.stringify(posix(path.join(srcRoot, 'utils/people.ts')))};
import * as OrganizeLogic from ${JSON.stringify(posix(path.join(srcRoot, 'utils/organizeShares.ts')))};
export { createElement, StrictMode, createRoot, act, QueryClient, QueryClientProvider, Dialog, Hook, Payload, CardDialog, StatementDialog, CardLogic, DivideDialog, SettlementDialog, OrganizeDialog, PeoplePage, PersonDetail, PersonFormDialog, PeopleHook, PeopleLogic, OrganizeLogic };
`));

const stubPlugin = {
  name: 'stubs',
  setup(build) {
    build.onResolve({ filter: /^\./ }, (args) => {
      if (!args.importer) return null;
      const abs = posix(path.resolve(path.dirname(args.importer), args.path));
      const rel = posix(path.relative(srcRoot, abs));
      if (rel in STUBS) return { path: path.join(here, 'stubs', STUBS[rel]) };
      return null;
    });
  },
};

fs.mkdirSync(path.join(here, 'out'), { recursive: true });
await esbuild.build({
  entryPoints: [entryPath],
  outfile: path.join(here, 'out', `${variant}.mjs`),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  nodePaths: [path.join(FRONT, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
  plugins: [stubPlugin],
  logLevel: 'warning',
  absWorkingDir: here,
});
console.log(`built ${variant} from ${srcRoot}`);

