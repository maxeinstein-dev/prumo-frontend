// usage: node build-forecast.mjs <srcRoot>   -- bundles the REAL ForecastStrategyField (inside a small state harness) and the REAL
// ConfirmReceiptDialog (own entry, own output: out/forecast.mjs). The Radix select is replaced by a native one (stubs/SelectCombobox.tsx).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(here, '../..');
const esbuild = createRequire(path.join(FRONT, 'package.json'))('esbuild');
const srcRoot = path.resolve(process.argv[2] ?? path.join(FRONT, 'src'));
const posix = (p) => p.split(path.sep).join('/');

const entry = path.join(here, 'entry.forecast.tsx');
fs.writeFileSync(entry, `
import { createElement, StrictMode, act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ConfirmDialog from ${JSON.stringify(posix(path.join(srcRoot, 'components/ConfirmReceiptDialog.tsx')))};
import { ForecastStrategyField } from ${JSON.stringify(posix(path.join(srcRoot, 'components/transactions/ForecastStrategyField.tsx')))};
import * as Forecast from ${JSON.stringify(posix(path.join(srcRoot, 'utils/forecastStrategy.ts')))};

// What the recurrence form does with the field: it keeps the draft, validates it and sends the payload.
function ForecastHarness({ kind = 'INCOME', frequency = 'monthly', referenceMonth = '2026-11', showErrors = false, initial }) {
  const [draft, setDraft] = useState(initial ?? Forecast.emptyForecastDraft());
  return createElement('div', null,
    createElement(ForecastStrategyField, {
      draft, onChange: setDraft, kind, frequency, referenceMonth, showErrors,
      format: (cents) => 'R$ ' + (cents / 100).toFixed(2).replace('.', ','),
      lastExtra: createElement('label', null, createElement('input', { id: 'follow-last', type: 'checkbox' }), ' Acompanhar o último valor'),
    }),
    createElement('pre', { 'data-testid': 'payload' }, JSON.stringify(Forecast.forecastPayload(draft))),
    createElement('pre', { 'data-testid': 'check' }, JSON.stringify(Forecast.validateForecast(draft, frequency).errors)),
  );
}
export { createElement, StrictMode, act, createRoot, ConfirmDialog, ForecastHarness };
`);

const STUBS = { 'utils/format': 'format.ts', 'context/CurrencyContext': 'CurrencyContext.ts', 'components/SelectCombobox': 'SelectCombobox.tsx' };
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
  entryPoints: [entry], outfile: path.join(here, 'out', 'forecast.mjs'), bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
  jsx: 'automatic', nodePaths: [path.join(FRONT, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
  plugins: [stubPlugin], logLevel: 'warning', absWorkingDir: here,
});
console.log(`built forecast from ${srcRoot}`);
