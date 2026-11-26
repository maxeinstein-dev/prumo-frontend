// usage: node build-confirm.mjs <srcRoot>   -- bundles the REAL ConfirmReceiptDialog (own entry, own output: out/confirm.mjs).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(here, '../..');
const esbuild = createRequire(path.join(FRONT, 'package.json'))('esbuild');
const srcRoot = path.resolve(process.argv[2] ?? path.join(FRONT, 'src'));
const posix = (p) => p.split(path.sep).join('/');

const entry = path.join(here, 'entry.confirm.tsx');
fs.writeFileSync(entry, `
import { createElement, StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import ConfirmDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/ConfirmReceiptDialog.tsx')))};
import * as ConfirmLogic from ${JSON.stringify(posix(path.join(srcRoot, 'utils/confirmReceipt.ts')))};
export { createElement, StrictMode, act, createRoot, ConfirmDialog, ConfirmLogic };
`);

const STUBS = { 'utils/format': 'format.ts', 'context/CurrencyContext': 'CurrencyContext.ts' };
const stubPlugin = {
  name: 'stubs',
  setup(build) {
    build.onResolve({ filter: /^\./ }, (args) => {
      if (!args.importer) return null;
      const rel = posix(path.relative(srcRoot, path.resolve(path.dirname(args.importer), args.path)));
      return rel in STUBS ? { path: path.join(here, 'stubs', STUBS[rel]) } : null;
    });
  },
};
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
await esbuild.build({
  entryPoints: [entry], outfile: path.join(here, 'out', 'confirm.mjs'), bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
  jsx: 'automatic', nodePaths: [path.join(FRONT, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
  plugins: [stubPlugin], logLevel: 'warning', absWorkingDir: here,
});
console.log(`built confirm from ${srcRoot}`);
