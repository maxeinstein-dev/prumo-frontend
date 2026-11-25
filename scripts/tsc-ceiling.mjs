#!/usr/bin/env node
/* eslint-env node */

// Teto de erros de tipo: o tsc tem erros antigos conhecidos. Este script falha
// só se o número subir em relação a scripts/tsc-baseline.txt. Se cair, avisa
// para baixar o teto.

import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'tsc-baseline.txt');
const tscBin = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

const baseline = Number.parseInt(readFileSync(baselinePath, 'utf8').trim(), 10);
if (!Number.isInteger(baseline) || baseline < 0) {
  console.error(`tsc-ceiling: baseline inválido em ${baselinePath}`);
  process.exit(2);
}

const run = spawnSync(process.execPath, [tscBin, '--noEmit'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

if (run.error) {
  console.error(`tsc-ceiling: não consegui rodar o tsc: ${run.error.message}`);
  process.exit(2);
}

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const current = output.split(/\r?\n/).filter((line) => /error TS\d+/.test(line)).length;

if (run.status !== 0 && current === 0) {
  // tsc falhou sem reportar erro de tipo: quebra de configuração, não conta como teto.
  console.error(output);
  console.error('tsc-ceiling: tsc terminou com erro sem linhas "error TS"; verifique a saída acima.');
  process.exit(2);
}

console.log(`tsc-ceiling: erros de tipo agora: ${current}`);
console.log(`tsc-ceiling: teto (scripts/tsc-baseline.txt): ${baseline}`);

if (current > baseline) {
  console.error(
    `tsc-ceiling: FALHOU, o número de erros subiu de ${baseline} para ${current}. Corrija os novos erros ou, se for intencional, revise o teto com justificativa.`,
  );
  process.exit(1);
}

if (current < baseline) {
  console.warn(
    `tsc-ceiling: AVISO, o número caiu de ${baseline} para ${current}. Baixe o teto em scripts/tsc-baseline.txt para ${current} para travar o ganho.`,
  );
} else {
  console.log('tsc-ceiling: OK, sem aumento de erros.');
}
