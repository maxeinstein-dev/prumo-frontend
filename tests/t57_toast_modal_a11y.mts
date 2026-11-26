import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, frontSrc } from './harness.mts';

// Guarda de código-fonte: toast cabe em 360 px e o modal "Ver detalhes" é um diálogo.
const read = (rel: string): string => readFileSync(frontSrc(rel), 'utf8');

console.log('\n[toast + modal a11y] ToastContainer.tsx, TransactionModal.tsx');

check('toast: largura descontada das duas margens de 16 px (não w-full colado em right-4)', () => {
  const src = read('components/ToastContainer.tsx');
  const cls = /className="(fixed[^"]*)"/.exec(src)?.[1] ?? '';
  assert.ok(cls.includes('right-4'), 'mantém a margem direita de 16 px');
  assert.ok(!/(^|\s)w-full(\s|$)/.test(cls), 'w-full passa da borda esquerda em 360 px: ' + cls);
  assert.ok(cls.includes('w-[calc(100%-2rem)]'), 'largura = 100% menos 2 x 16 px: ' + cls);
  assert.ok(cls.includes('max-w-sm'), 'computador continua limitado a max-w-sm');
});

check('toast: o topo continua abaixo da barra de status (safe-area-inset-top)', () => {
  assert.ok(read('components/ToastContainer.tsx').includes('env(safe-area-inset-top'));
});

check('modal: o painel tem role="dialog", aria-modal e aria-labelledby apontando para o título', () => {
  const modal = read('components/TransactionModal.tsx');
  assert.ok(/role="dialog"/.test(modal), 'role="dialog"');
  assert.ok(/aria-modal="true"/.test(modal), 'aria-modal="true"');
  const id = /aria-labelledby="([^"]+)"/.exec(modal)?.[1];
  assert.ok(id, 'aria-labelledby');
  assert.ok(modal.includes(`titleId="${id}"`), 'título recebe o mesmo id');
  assert.ok(read('components/transactions/TransactionModalHeader.tsx').includes('id={titleId}'), 'h3 usa o id');
});

check('modal: continua usando useBackLayer', () => {
  assert.ok(/useBackLayer\(true, onClose\)/.test(read('components/TransactionModal.tsx')));
});
