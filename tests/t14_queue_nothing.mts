import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, checkAsync, frontSrc } from './harness.mts';

// A file with nothing to apply never stalls a queue (card invoices and statements). IMPORT_QUEUE_MODULE, CARD_QUEUE_MODULE
// and STATEMENT_QUEUE_MODULE point at mutated copies for the bite-checks.
const load = async (env: string | undefined, rel: string) => import(pathToFileURL(env || frontSrc(rel)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const Q: Any = await load(process.env.IMPORT_QUEUE_MODULE, 'utils/importQueue.ts');
const CQ: Any = await load(process.env.CARD_QUEUE_MODULE, 'utils/cardOfxQueue.ts');
const SQ: Any = await load(process.env.STATEMENT_QUEUE_MODULE, 'utils/statementQueue.ts');

console.log('\n[QN] queues and files with nothing to apply');

const NOTHING = { code: 'nothing-to-do', message: 'Nada a importar: não há proposta nem pagamento a aplicar.' };
const SEL = { code: 'none-selected', message: 'Selecione ao menos uma proposta.' };
const NONE = { canContinue: false, applyRestEnabled: false, note: null, blockerText: null };

check('QN-a: card queue controls: nothing to apply continues; the other blockers stay disabled with their text', () => {
  assert.deepEqual(CQ.cardQueueControls({ busy: false, hasBuilt: true, blocker: null }), { canContinue: false, applyRestEnabled: true, note: null, blockerText: null });
  assert.deepEqual(CQ.cardQueueControls({ busy: false, hasBuilt: true, blocker: NOTHING }), {
    canContinue: true, applyRestEnabled: true, note: 'Esta fatura já está conciliada: nada a importar.', blockerText: null,
  });
  for (const code of ['needs-refresh', 'too-many', 'none-selected', 'conflict', 'payment-source']) {
    const c = CQ.cardQueueControls({ busy: false, hasBuilt: true, blocker: { code, message: `msg ${code}` } });
    assert.deepEqual(c, { canContinue: false, applyRestEnabled: false, note: null, blockerText: `msg ${code}` }, code);
  }
  assert.equal(CQ.cardQueueControls({ busy: false, hasBuilt: true, blocker: SEL }).blockerText, 'Selecione ao menos uma proposta.');
});

check('QN-b: nothing is offered while a request is in flight or before the preview is on screen', () => {
  assert.deepEqual(CQ.cardQueueControls({ busy: true, hasBuilt: true, blocker: NOTHING }), NONE);
  assert.deepEqual(CQ.cardQueueControls({ busy: true, hasBuilt: true, blocker: null }), NONE);
  assert.deepEqual(CQ.cardQueueControls({ busy: false, hasBuilt: false, blocker: NOTHING }), NONE);
});

check('QN-c: statement queue controls: all rows in Prumo continues; no row at all, or a failed confirm, stays disabled with the reason', () => {
  const row = (duplicate: boolean) => ({ date: '2026-09-01', description: 'x', amount: 1, type: 'EXPENSE', duplicate });
  const ok = SQ.statementQueueControls({ busy: false, preview: { rows: [row(false), row(true)] }, confirmError: null });
  assert.deepEqual(ok, { canContinue: false, applyRestEnabled: true, note: null, blockerText: null });
  const dup = SQ.statementQueueControls({ busy: false, preview: { rows: [row(true), row(true)] }, confirmError: null });
  assert.deepEqual(dup, { canContinue: true, applyRestEnabled: true, note: 'Este arquivo não tem novidades: todas as linhas já estão no Prumo.', blockerText: null });
  const empty = SQ.statementQueueControls({ busy: false, preview: { rows: [] }, confirmError: null });
  assert.deepEqual(empty, { canContinue: false, applyRestEnabled: false, note: null, blockerText: 'Nenhuma transação encontrada no arquivo.' });
  const failed = SQ.statementQueueControls({ busy: false, preview: { rows: [row(true)] }, confirmError: 'x' });
  assert.equal(failed.canContinue, false);
  assert.equal(failed.applyRestEnabled, false);
  assert.equal(failed.blockerText, 'Atualize a pré-visualização antes de confirmar de novo.');
  assert.deepEqual(SQ.statementQueueControls({ busy: true, preview: { rows: [row(true)] }, confirmError: null }), NONE);
  assert.deepEqual(SQ.statementQueueControls({ busy: false, preview: null, confirmError: null }), NONE);
});

check('QN-d: the phase of the file on screen: "Em análise" only while a request is in flight', () => {
  const p = (o: Record<string, boolean>) => Q.currentPhase({ previewing: false, confirming: false, hasPreview: false, nothingToApply: false, ...o });
  assert.equal(p({ previewing: true }), 'loading');
  assert.equal(p({ previewing: true, hasPreview: true }), 'loading', 'a refresh in flight is loading again');
  assert.equal(p({ confirming: true, hasPreview: true }), 'confirming');
  assert.equal(p({ hasPreview: true }), 'ready');
  assert.equal(p({ hasPreview: true, nothingToApply: true }), 'reconciled');
  assert.equal(p({}), 'idle', 'no preview and no request: it failed or has not started');
  assert.equal(p({ nothingToApply: true }), 'idle', 'nothing is known without a preview');
  assert.deepEqual(Q.CURRENT_PHASE_TEXT, { loading: 'Em análise', confirming: 'Importando', ready: 'Pronta para revisar', reconciled: 'Já conciliada', idle: 'Aguardando' });
});

check('QN-e: a queue of 3 whose first file has nothing to apply: it is left out ("uptodate"), not skipped, and the next one comes up', () => {
  let s = Q.createQueue(['a', 'b', 'c']);
  s = Q.markUpToDateCurrent(s, 'nota');
  assert.equal(s.index, 1);
  assert.equal(s.items[0].status, 'uptodate');
  assert.equal(s.items[0].note, 'nota');
  assert.equal(Q.canConfirmCurrent(s), true);
  s = Q.completeCurrent(s, 'x');
  s = Q.completeCurrent(s, 'y');
  assert.equal(Q.isQueueFinished(s), true);
  assert.deepEqual(Q.queueTotals(s), { done: 2, skipped: 0, uptodate: 1, failed: 0, pending: 0 });
  const nouns = { done: ['importada', 'importadas'], skipped: ['pulada', 'puladas'], uptodate: ['já conciliada', 'já conciliadas'], failed: ['f', 'f'] };
  assert.equal(Q.queueSummaryLine(s, nouns), '2 importadas, 1 já conciliada');
  const failedFirst = Q.failCurrent(Q.createQueue(['a', 'b']), 'erro');
  assert.equal(Q.markUpToDateCurrent(failedFirst, null), failedFirst, 'a file that failed is not "up to date"');
});

await checkAsync('QN-f: apply-to-rest continues from a queue whose first file was left out as up to date', async () => {
  const order: number[] = [];
  const start = Q.markUpToDateCurrent(Q.createQueue(['a', 'b', 'c']), 'ok');
  const run = await Q.applyDefaultsToRemaining(start, async (index: number) => {
    order.push(index);
    return index === 2 ? { ok: true, upToDate: true, note: 'nada' } : { ok: true, note: 'feito' };
  });
  assert.deepEqual(order, [1, 2]);
  assert.equal(run.stop, null);
  assert.deepEqual(Q.queueTotals(run.state), { done: 1, skipped: 0, uptodate: 2, failed: 0, pending: 0 });
});

check('QN-g: the confirms of a queue of several invoices refresh once at the end; one invoice refreshes at once', () => {
  assert.equal(CQ.shouldDeferInvalidation(1), false);
  assert.equal(CQ.shouldDeferInvalidation(0), false);
  assert.equal(CQ.shouldDeferInvalidation(2), true);
  assert.equal(CQ.shouldDeferInvalidation(10), true);
});

check('QN-h: texts of the queue notes', () => {
  assert.equal(SQ.STATEMENT_NOTHING_NEW_QUEUE_NOTE, 'Sem novidades: nada a importar');
  assert.equal(CQ.CARD_RECONCILED_QUEUE_NOTE, 'Já conciliada: nada a importar');
});
