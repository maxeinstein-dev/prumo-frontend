// Gaps A/B/C of the card OFX import: scenarios of the REAL CardOfxReviewDialog ("Revisar lançamentos sem comprovante") against
// review-fake.mjs wired through stubs/api.ts (`fake.review`), and of the closing / merge / reason chips of the REAL
// ImportCardOfxDialog. Registered by scenarios.mjs (names RQ* and CL*). Every name and amount is invented.
import assert from 'node:assert/strict';
import { createReviewServer, HttpError } from './review-fake.mjs';

export function registerReviewScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click }) {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ACCOUNTS = [
    { id: 'acc-main', householdId: 'h1', name: 'Conta Principal', type: 'CHECKING', isActive: true },
    { id: 'acc-card', householdId: 'h1', name: 'Nubank', type: 'CREDIT', isActive: true },
    { id: 'acc-card2', householdId: 'h1', name: 'Outro Cartão', type: 'CREDIT', isActive: true },
    { id: 'acc-savings', householdId: 'h1', name: 'Poupança', type: 'SAVINGS', isActive: true },
    { id: 'acc-old', householdId: 'h1', name: 'Conta Antiga', type: 'CHECKING', isActive: false },
  ];
  const ROWS = [
    { id: 'r-a', description: 'Camiseta Loja Alfa', amount: 80, type: 'EXPENSE', date: '2026-08-10', monthKey: '2026-08', categoryName: 'CUSTOM:cat-roupas' },
    { id: 'r-b', description: 'Corrida de app', amount: 22.5, type: 'EXPENSE', date: '2026-08-12', monthKey: '2026-08', categoryName: 'TRANSPORTATION' },
    { id: 'r-c', description: 'Seguro anual', amount: 140, type: 'EXPENSE', date: '2026-09-05', monthKey: '2026-09', blocked: true },
    { id: 'r-d', description: 'Estorno Loja Beta', amount: 30, type: 'INCOME', date: '2026-09-08', monthKey: '2026-09', categoryName: 'CUSTOM:cat-apagada' },
    { id: 'r-e', description: 'Padaria da esquina', amount: 12.4, type: 'EXPENSE', date: '2026-09-09', monthKey: '2026-09', anchored: false },
  ];
  const newServer = (o = {}) => createReviewServer({ cardId: 'acc-card', rows: o.rows ?? ROWS, accounts: ACCOUNTS });

  // ---- mount ---------------------------------------------------------------------------------------------------------
  let current = null;
  async function resetWorld() {
    document.body.innerHTML = '<div id="root"></div>';
    w.localStorage.clear();
    fake.calls = [];
    for (const key of ['preview', 'workbook', 'confirm', 'cardPreview', 'cardConfirm', 'statementPreview', 'people', 'recurring', 'review']) fake[key] = null;
    globalThis.__toasts = [];
    globalThis.__defaultHousehold = 'h1';
    globalThis.__household = undefined;
    globalThis.__accountsPayload = { accounts: clone(ACCOUNTS), totals: [] };
    globalThis.__categoriesPayload = [{ id: 'cat-roupas', name: 'Roupas e acessórios', type: 'EXPENSE', isSystem: false }];
  }
  async function mountWith(render, { strict = false, server = null } = {}) {
    await resetWorld();
    if (server) fake.review = (method, url, payload) => server.handle(method, url, payload);
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    const counters = { closed: 0 };
    const tree = () => {
      const el = B.createElement(B.QueryClientProvider, { client: qc }, render(() => { counters.closed += 1; }));
      return strict ? B.createElement(B.StrictMode, null, el) : el;
    };
    await B.act(async () => { root.render(tree()); });
    await flush(30);
    current = { root, qc, counters };
    return current;
  }
  async function mountReview(server, o = {}) {
    return mountWith((onClose) => B.createElement(B.ReviewDialog, { open: true, onClose, accountId: 'acc-card', householdId: 'h1' }), { ...o, server });
  }
  async function unmount() {
    if (!current) return;
    const { root } = current;
    current = null;
    await B.act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
  const rs = (name, fn) => scenario(name, async () => { try { await fn(); } finally { await unmount(); } });

  // ---- DOM helpers ---------------------------------------------------------------------------------------------------
  const byLabel = (selector, label) => all(selector).find((e) => e.getAttribute('aria-label') === label);
  const rowEl = (id) => document.querySelector(`tr[data-review-row="${id}"]`);
  const DESC = Object.fromEntries(ROWS.map((r) => [r.id, r.description]));
  const actionSel = (id) => byLabel('select', `Ação para ${DESC[id]}`);
  const targetSel = (id) => byLabel('select', `Conta de destino para ${DESC[id]}`);
  const optionTexts = (sel) => [...sel.options].map((o) => o.textContent);
  async function choose(el, value) {
    assert.ok(el, 'select missing');
    await B.act(async () => { el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); });
    await flush(10);
  }
  async function pressEscape() {
    await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush(5);
  }
  const calls = (method) => fake.calls.filter((c) => c.kind === 'review' && (!method || c.method === method));
  const applyBtn = () => btn(/^Aplicar decisões$/);
  const confirmPanel = () => document.querySelector('[role="alertdialog"]');
  const confirmBtn = () => confirmPanel() && [...confirmPanel().querySelectorAll('button')].find((b) => /^(Confirmar|Aplicando…)$/.test(b.textContent.trim()));
  const blockerText = () => document.getElementById('card-review-blocker')?.textContent ?? null;
  const sectionOf = (re) => all('section').find((s) => re.test(s.querySelector('h4')?.textContent ?? ''));
  const toasts = () => globalThis.__toasts ?? [];
  const dialogEl = () => document.querySelector('[role="dialog"]');
  const headline = () => document.querySelector('p[role="status"]')?.textContent ?? null;

  // ---- RQ: review queue ----------------------------------------------------------------------------------------------

  rs('RQ1 opening reads the queue once (account, limit, view), lists the rows by month with totals, and writes nothing', async () => {
    const server = newServer();
    await mountReview(server);
    assert.equal(calls('GET').length, 1);
    assert.deepEqual(calls('GET')[0].payload, { accountId: 'acc-card', view: 'queue', limit: 200 });
    assert.equal(calls('POST').length, 0, 'opening applies nothing');
    assert.equal(headline(), '5 lançamentos sem comprovante (R$ 224.90 no total).'.replace('224.90', '224.90'));
    assert.ok(sectionOf(/^Fatura de agosto\/2026 \(2\)$/), 'August section with its count');
    assert.ok(sectionOf(/^Fatura de setembro\/2026 \(3\)$/));
    assert.match(sectionOf(/agosto/).textContent, /Total R\$ 102\.50/);
    assert.match(sectionOf(/setembro/).textContent, /Total R\$ 122\.40/);
    assert.ok(rowEl('r-a').textContent.includes('Roupas e acessórios'), 'CUSTOM:<id> shows the name of the category');
    assert.match(rowEl('r-d').textContent, /\+R\$ 30\.00/, 'a credit is shown as such');
    assert.match(dialogEl().textContent, /Seguro anual/);
    assert.deepEqual(optionTexts(actionSel('r-a')), ['Sem ação', 'Manter sem comprovante', 'Mover para outra conta', 'Excluir']);
    assert.equal(actionSel('r-a').value, 'none');
    assert.ok(applyBtn().disabled, 'no decision: nothing to apply');
    assert.equal(blockerText(), 'Escolha uma ação para ao menos um lançamento.');
  });

  rs('RQ2 a blocked row only offers "Manter sem comprovante" and says why', async () => {
    await mountReview(newServer());
    assert.deepEqual(optionTexts(actionSel('r-c')), ['Sem ação', 'Manter sem comprovante']);
    assert.ok(rowEl('r-c').textContent.includes('bloqueado: só manter'));
    assert.equal(rowEl('r-a').textContent.includes('bloqueado'), false);
  });

  rs('RQ3 decisions are applied only after a confirmation that lists them; then the request, the answer and a fresh list', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(actionSel('r-a'), 'move');
    assert.ok(applyBtn().disabled, 'a move without a destination cannot go');
    assert.equal(blockerText(), 'Escolha a conta de destino.');
    assert.deepEqual(optionTexts(targetSel('r-a')), ['Selecione a conta', 'Conta Principal', 'Poupança'], 'no card, no inactive account');
    await choose(targetSel('r-a'), 'acc-main');
    await choose(actionSel('r-d'), 'delete');
    await choose(actionSel('r-c'), 'keep');
    assert.ok(!applyBtn().disabled);
    assert.equal(blockerText(), null);
    await click(applyBtn());
    assert.equal(calls('POST').length, 0, 'the click only opens the confirmation');
    const panel = confirmPanel();
    assert.ok(panel, 'confirmation panel');
    assert.match(panel.textContent, /Confirmar 3 decisões\?/);
    assert.match(panel.textContent, /Manter sem comprovante: 1 lançamento\./);
    assert.match(panel.textContent, /Mover para outra conta: 1 lançamento \(Conta Principal: 1\)\./);
    assert.match(panel.textContent, /Excluir: 1 lançamento \(R\$ -30\.00 no total\)\./);
    assert.match(panel.textContent, /Importar a planilha de novo pode trazer a linha de volta/);
    await click([...panel.querySelectorAll('button')].find((b) => b.textContent === 'Voltar'));
    assert.equal(confirmPanel(), null, 'Voltar closes the confirmation, nothing was sent');
    assert.equal(calls('POST').length, 0);
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    assert.equal(calls('POST').length, 1);
    assert.deepEqual(calls('POST')[0].payload, {
      accountId: 'acc-card',
      actions: [
        { transactionId: 'r-a', action: 'move', targetAccountId: 'acc-main' },
        { transactionId: 'r-c', action: 'keep' },
        { transactionId: 'r-d', action: 'delete' },
      ],
    });
    assert.deepEqual(server.state.moved, [{ id: 'r-a', to: 'acc-main' }]);
    assert.equal(calls('GET').length, 2, 'the list is read again after the answer');
    assert.equal(rowEl('r-a'), null);
    assert.equal(rowEl('r-d'), null);
    assert.equal(rowEl('r-c'), null, 'a kept row leaves the queue');
    assert.ok(rowEl('r-b') && rowEl('r-e'));
    assert.match(document.querySelector('#card-review-summary-title').textContent, /Resultado: 3 feitos/);
    assert.deepEqual(toasts().at(-1), ['success', 'Revisão: 3 feitos.']);
    assert.equal(headline(), '2 lançamentos sem comprovante (R$ 34.90 no total).');
  });

  rs('RQ4 bulk: "Marcar todos" fills the decisions, leaves the blocked row out and says so; nothing is sent', async () => {
    await mountReview(newServer());
    await choose(document.getElementById('card-review-bulk-action'), 'delete');
    await click(btn(/^Marcar todos$/));
    assert.equal(actionSel('r-a').value, 'delete');
    assert.equal(actionSel('r-d').value, 'delete');
    assert.equal(actionSel('r-c').value, 'none', 'blocked rows never take delete');
    assert.match(bodyText(), /1 lançamento bloqueado ficou de fora: só aceitam “Manter sem comprovante”\./);
    assert.equal(calls('POST').length, 0);
    await choose(document.getElementById('card-review-bulk-action'), 'keep');
    await click(btn(/^Marcar todos$/));
    assert.equal(actionSel('r-c').value, 'keep');
    assert.doesNotMatch(bodyText(), /bloqueado ficou de fora/);
    await click(applyBtn());
    assert.match(confirmPanel().textContent, /Confirmar 5 decisões\?/);
    await click(btn(/^Limpar decisões$/));
    assert.equal(actionSel('r-a').value, 'none');
    assert.equal(confirmPanel(), null, 'changing decisions closes the confirmation');
  });

  rs('RQ5 bulk move needs a destination first and then sends it for every row', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(document.getElementById('card-review-bulk-action'), 'move');
    assert.ok(btn(/^Marcar todos$/).disabled, 'no destination yet');
    await choose(document.getElementById('card-review-bulk-target'), 'acc-savings');
    await click(btn(/^Marcar todos$/));
    assert.equal(targetSel('r-a').value, 'acc-savings');
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    const sent = calls('POST')[0].payload.actions;
    assert.deepEqual(sent.map((a) => [a.transactionId, a.action, a.targetAccountId]), [
      ['r-a', 'move', 'acc-savings'], ['r-b', 'move', 'acc-savings'], ['r-d', 'move', 'acc-savings'], ['r-e', 'move', 'acc-savings'],
    ]);
  });

  rs('RQ6 an answer with done, skipped, blocked and failed rows is shown row by row; the failed decision stays to try again', async () => {
    const server = newServer();
    await mountReview(server);
    for (const id of ['r-a', 'r-b', 'r-d', 'r-e']) await choose(actionSel(id), 'delete');
    server.failRow('r-b', 'P2034');
    server.changeUnderfoot('r-d', { status: 'gone' }); // handled somewhere else after the list was read
    server.changeUnderfoot('r-e', { blocked: true }); // got a share meanwhile
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    const summary = document.querySelector('#card-review-summary-title').textContent;
    assert.equal(summary, 'Resultado: 1 feito, 1 já tratado (nada a fazer), 1 bloqueado, 1 com falha');
    assert.deepEqual(toasts().at(-1), ['error', 'Revisão: 1 feito, 1 já tratado (nada a fazer), 1 bloqueado, 1 com falha.']);
    const failed = rowEl('r-b');
    assert.ok(failed, 'the failed row is still listed');
    assert.ok(failed.textContent.includes('falhou: erro inesperado ao aplicar'), 'the reason of the failure is next to the row, in words');
    assert.ok(!dialogEl().textContent.includes('P2034'), 'the code of the server is never shown');
    assert.equal(actionSel('r-b').value, 'delete', 'its decision stays, to be tried again');
    assert.ok(rowEl('r-e').textContent.includes('bloqueado: só manter'), 'the list read again knows it is blocked now');
    assert.ok(rowEl('r-e').textContent.includes('bloqueado: tem divisão com pessoas, acerto, recorrência ou anexo'), 'and the answer said so next to it, in words');
    assert.ok(!dialogEl().textContent.includes('has-shares'), 'no slug anywhere');
    assert.equal(actionSel('r-e').value, 'none', 'a refused decision is not kept');
    assert.equal(rowEl('r-a'), null);
    assert.equal(rowEl('r-d'), null);
    assert.match(dialogEl().textContent, /Corrida de app: falhou \(Erro inesperado ao aplicar\)/);
    assert.ok(!applyBtn().disabled, 'the failed decision can be applied again');
  });

  rs('RQ7 an answer that lacks a row, or whose totals disagree with its rows, is not trusted', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(actionSel('r-a'), 'keep');
    await choose(actionSel('r-b'), 'keep');
    server.overrideNext = () => ({
      results: [{ transactionId: 'r-a', action: 'keep', status: 'done' }], done: 2, skipped: 0, blocked: 0, failed: 0, warnings: [],
    });
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    const text = dialogEl().textContent;
    assert.match(text, /Resultado: 1 feito, 1 sem resposta do servidor/);
    assert.match(text, /1 decisão não teve resposta do servidor: não se sabe se foi aplicada/);
    assert.match(text, /Os totais do servidor não batem com o resultado de cada lançamento/);
  });

  rs('RQ8 the warnings of the server about deleted rows are shown as they came', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(actionSel('r-e'), 'delete');
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    assert.match(dialogEl().textContent, /A planilha traz a linha "Padaria da esquina" de volta: não havia linha do mesmo mês amarrada ao OFX/);
  });

  rs('RQ9 a failed request keeps the decisions, blocks a new apply until the list is read again, then goes on', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(actionSel('r-a'), 'keep');
    server.failNext('post', 500, 'Falha no servidor');
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    assert.match(dialogEl().textContent, /Falha no servidor\. Algumas podem ter sido aplicadas\. Atualize a lista antes de aplicar de novo/);
    assert.equal(toasts().at(-1)[0], 'error');
    assert.equal(actionSel('r-a').value, 'keep', 'the decision survives');
    assert.ok(applyBtn().disabled, 'a stale list is not applied again');
    assert.match(blockerText(), /Atualize a lista antes de aplicar de novo/);
    assert.equal(calls('GET').length, 1, 'the list is not read again on its own after a failure: it may be what failed');
    await click(btn(/^Atualizar lista$/));
    await flush(20);
    assert.equal(calls('GET').length, 2);
    assert.ok(!applyBtn().disabled);
    assert.equal(blockerText(), null);
    assert.equal(actionSel('r-a').value, 'keep');
  });

  rs('RQ10 a list that cannot be read after an apply leaves the screen stale: apply is blocked and the error says so', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(actionSel('r-a'), 'keep');
    await choose(actionSel('r-b'), 'keep');
    await choose(actionSel('r-e'), 'keep');
    server.failRow('r-e', 'boom'); // its decision stays after the answer, so only the stale list can hold the apply back
    await click(applyBtn());
    server.failNext('get', 500, 'Lista indisponível');
    await click(confirmBtn());
    await flush(30);
    assert.match(dialogEl().textContent, /Lista indisponível/);
    assert.match(dialogEl().textContent, /Resultado: 2 feitos, 1 com falha/, 'the answer of the apply is still shown');
    assert.ok(applyBtn().disabled, 'the list on screen is stale: nothing is applied over it');
    assert.match(blockerText(), /Atualize a lista antes de aplicar de novo/);
    await click(btn(/^Tentar de novo$/));
    await flush(20);
    assert.equal(rowEl('r-a'), null);
    assert.ok(rowEl('r-e'));
  });

  rs('RQ11 closing is blocked while the apply is in flight (Escape, X, Fechar, backdrop); a second click sends one request only', async () => {
    const server = newServer();
    const { counters } = await mountReview(server);
    await choose(actionSel('r-a'), 'keep');
    const gate = server.hold('post');
    await click(applyBtn());
    await click(confirmBtn());
    await click(confirmBtn());
    assert.equal(calls('POST').length, 1, 'one request for two clicks');
    await pressEscape();
    await click(byLabel('button', 'Fechar modal'));
    await click(btn(/^Fechar$/));
    await click(all('div[aria-hidden="true"]').find((d) => d.className.includes('bg-black/40')));
    assert.equal(counters.closed, 0, 'nothing closes the dialog while the request is in flight');
    assert.ok(byLabel('button', 'Fechar modal').disabled);
    gate.release();
    await flush(30);
    await pressEscape();
    assert.equal(counters.closed, 1, 'Escape closes it once the request is over');
  });

  rs('RQ12 "Ver mantidos" lists the kept rows (view=kept) and "Desfazer" sends one unkeep; the row is back in the queue', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(actionSel('r-b'), 'keep');
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    await click(btn(/^Ver mantidos$/));
    await flush(20);
    assert.deepEqual(calls('GET').at(-1).payload, { accountId: 'acc-card', view: 'kept', limit: 200 });
    assert.equal(headline(), '1 lançamento mantido sem comprovante (R$ 22.50 no total).');
    assert.equal(document.querySelector('[data-review-row] select'), null, 'no decisions in the kept view');
    assert.equal(document.getElementById('card-review-bulk-action'), null);
    assert.equal(document.querySelector('[role="status"]').textContent.includes('Corrida de app'), false);
    const undo = byLabel('button', 'Desfazer: Corrida de app');
    assert.ok(undo);
    await click(undo);
    await flush(30);
    const post = calls('POST').at(-1).payload;
    assert.deepEqual(post, { accountId: 'acc-card', actions: [{ transactionId: 'r-b', action: 'unkeep' }] });
    assert.equal(server.state.rows.find((r) => r.id === 'r-b').status, 'queue');
    assert.equal(headline(), 'Nenhum lançamento mantido sem comprovante.');
    await click(btn(/^Ver pendentes$/));
    await flush(20);
    assert.ok(rowEl('r-b'), 'back in the queue');
  });

  rs('RQ13 latest wins: a slow read of the queue never overwrites the kept view that was asked after it', async () => {
    const server = newServer({ rows: [...ROWS, { id: 'r-k', description: 'Linha mantida antes', amount: 9, type: 'EXPENSE', date: '2026-08-02', monthKey: '2026-08', status: 'kept' }] });
    const slow = server.hold('get');
    await mountReview(server); // the first read (queue) is held
    assert.equal(calls('GET').length, 1);
    // the second read answers at once: the user switched to the kept rows while the first was in flight
    await click(btn(/^Ver mantidos$/));
    await flush(20);
    assert.equal(headline(), '1 lançamento mantido sem comprovante (R$ 9.00 no total).');
    slow.release();
    await flush(30);
    assert.equal(headline(), '1 lançamento mantido sem comprovante (R$ 9.00 no total).', 'the late answer of the first read is dropped');
    assert.ok(byLabel('button', 'Desfazer: Linha mantida antes'));
    assert.equal(rowEl('r-a'), null);
  });

  rs('RQ14 the month filter reads one month and keeps its options; a queue cut at the limit says so', async () => {
    const many = Array.from({ length: 3 }, (_, i) => ({ id: `r-x${i}`, description: `Item ${i}`, amount: 5, type: 'EXPENSE', date: `2026-10-0${i + 1}`, monthKey: '2026-10' }));
    const server = newServer({ rows: [...ROWS, ...many] });
    await mountReview(server);
    const filter = all('select').find((s) => [...s.options].some((o) => o.textContent === 'Todos'));
    assert.deepEqual(optionTexts(filter), ['Todos', 'agosto/2026', 'setembro/2026', 'outubro/2026']);
    await choose(filter, '2026-09');
    assert.deepEqual(calls('GET').at(-1).payload, { accountId: 'acc-card', view: 'queue', limit: 200, monthKey: '2026-09' });
    assert.equal(rowEl('r-a'), null);
    assert.ok(rowEl('r-c'));
    assert.equal(optionTexts(all('select').find((s) => [...s.options].some((o) => o.textContent === 'Todos'))).length, 4, 'the options stay');
  });

  rs('RQ15 a destination refused by the server (400) wrote nothing: the message says so and the list needs no refresh', async () => {
    const server = newServer();
    await mountReview(server);
    await choose(actionSel('r-a'), 'move');
    await choose(targetSel('r-a'), 'acc-main');
    await choose(actionSel('r-b'), 'keep');
    // the account was deactivated after the screen was opened
    server.state.accounts.find((a) => a.id === 'acc-main').isActive = false;
    await click(applyBtn());
    await click(confirmBtn());
    await flush(30);
    assert.match(dialogEl().textContent, /Conta de destino inválida\. Nenhuma decisão foi aplicada\./);
    assert.doesNotMatch(dialogEl().textContent, /Algumas podem ter sido aplicadas/);
    assert.equal(server.state.rows.find((r) => r.id === 'r-b').status, 'queue', 'nothing was written, not even the keep');
    assert.ok(!applyBtn().disabled, 'a refusal changes nothing on screen: the user fixes the destination and goes on');
    assert.equal(actionSel('r-a').value, 'move');
  });

  rs('RQ18 a queue cut at the limit says so; one request carries at most 200 actions and the rest is read again afterwards', async () => {
    const many = Array.from({ length: 205 }, (_, i) => ({
      id: `r-m${String(i).padStart(3, '0')}`, description: `Compra ${i}`, amount: 1, type: 'EXPENSE', date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, monthKey: '2026-10',
    }));
    const server = newServer({ rows: many });
    await mountReview(server);
    assert.equal(all('tr[data-review-row]').length, 200);
    assert.equal(headline(), '205 lançamentos sem comprovante (R$ 205.00 no total).');
    assert.match(dialogEl().textContent, /A lista mostra os primeiros 200; o resto aparece depois que estes forem tratados\./);
    await click(btn(/^Marcar todos$/));
    await click(applyBtn());
    await click(confirmBtn());
    await flush(40);
    assert.equal(calls('POST')[0].payload.actions.length, 200);
    assert.equal(all('tr[data-review-row]').length, 5, 'the five that did not fit come in after the first 200 are settled');
    assert.equal(headline(), '5 lançamentos sem comprovante (R$ 5.00 no total).');
    assert.doesNotMatch(dialogEl().textContent, /A lista mostra os primeiros/);
  });

  rs('RQ16 an empty queue says so and offers no decisions', async () => {
    await mountReview(newServer({ rows: [] }));
    assert.equal(headline(), 'Nenhum lançamento sem comprovante.');
    assert.match(bodyText(), /Tudo certo: nenhum lançamento da planilha ficou sem linha no OFX\./);
    assert.equal(applyBtn(), undefined);
  });

  rs('RQ17 a read error shows the message and lets the user try again', async () => {
    const server = newServer();
    server.failNext('get', 500, 'Servidor fora do ar');
    await mountReview(server);
    assert.match(dialogEl().textContent, /Servidor fora do ar/);
    await click(btn(/^Tentar de novo$/));
    await flush(20);
    assert.ok(rowEl('r-a'));
    assert.doesNotMatch(dialogEl().textContent, /Servidor fora do ar/);
  });

  // ---- CL: closing, merge and reason chips in the card import dialog ---------------------------------------------------

  const PERIOD = { start: '2026-09-02', end: '2026-10-02' };
  function makePreview({ mergeDefault = false, withClosing = true } = {}) {
    let k = 0;
    const L = (memo, amount, o = {}) => {
      k += 1;
      return { ref: `ofx:C${k}:${String(k).padStart(8, '0')}`, fitid: `C${k}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo, merchant: memo, installment: null, status: 'proposed', group: null, ...o };
    };
    const T = (id, description, amount, date, o = {}) => ({ transactionId: id, description, amount, type: 'EXPENSE', date, sourceRef: `maxfin:2026-10:credit:${id}`, ...o });
    const P = (group, kind, lines, o = {}) => {
      for (const l of lines) l.group = group;
      return { group, kind, refs: lines.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, absorbed: [], reason: null, counterpart: null, result: null, futureInstallments: 0, ...o };
    };
    const padaria = L('Padaria Sol', 25.9, { date: '2026-09-03' });
    const livraria = L('Livraria Gama', 45.5, { date: '2026-09-15' });
    const eletro = L('Eletro Delta', 300, { date: '2026-09-20' });
    const shopee = L('Shopee Loja Alfa', 91.3, { date: '2026-09-12' });
    const farm = [L('Farmacia Kappa', 30), L('Farmacia Kappa', 20)];
    const mercado = L('Mercado Zeta', 60, { status: 'reconciled', date: '2026-09-05' });
    const eletroOld = T('t-eletro-old', 'Eletro Delta 1/3', 299, '2026-09-21');
    const proposals = [
      P('g-pad', 'enrich-exact', [padaria], { target: T('t-pad', 'Padaria', 25.9, '2026-09-03'), result: { date: '2026-09-03', description: 'Padaria Sol', notesAppend: null } }),
      P('g-liv', 'create', [livraria]),
      P('g-ele', 'create', [eletro], { defaultSelected: false, reason: 'sheet-residue', counterpart: eletroOld }),
      P('g-merge', 'enrich-merge', [shopee], {
        defaultSelected: mergeDefault, reason: mergeDefault ? null : 'mixed-categories',
        target: T('t-sh1', 'Shoppe - Cabide', 36.86, '2026-09-11'), absorbed: [T('t-sh2', 'Shoppe - Frascos', 54.44, '2026-09-11')],
        result: { date: '2026-09-12', description: 'Shopee Loja Alfa', notesAppend: 'Planilha (soma de 2 linhas): Shoppe - Frascos 54,44' },
      }),
      P('g-farm', 'enrich-sum', farm, {
        defaultSelected: false, ambiguous: true, reason: 'ambiguous', target: T('t-farm', 'Farmácia 50', 50, '2026-09-10'),
        result: { date: '2026-09-10', description: 'Farmácia 50', notesAppend: null },
      }),
    ];
    // by hand: OFX 522.70 + farmácia 50 = 572.70?? no: the ambiguous pair is part of the OFX
    const lines = [padaria, livraria, eletro, shopee, ...farm, mercado];
    const ofx = 25.9 + 45.5 + 300 + 91.3 + 50 + 60; // 572.70
    // card at the default: pad 25.90 + merge rows 91.30 (unticked: both stay) + liv 45.50 + mercado 60 + eletroOld 299 + stream 39.90 + farmácia 50 (unticked, stays)
    const recorded = mergeDefault ? 25.9 + 91.3 + 45.5 + 60 + 299 + 39.9 + 50 : 25.9 + 36.86 + 54.44 + 45.5 + 60 + 299 + 39.9 + 50;
    const delta = Math.round((ofx - recorded - 10) * 100) / 100; // a manual card row (10.00) that the statement does not explain
    const closing = {
      periodStart: PERIOD.start, periodEnd: PERIOD.end, endInclusive: false, ofxTotal: ofx, recordedTotal: Math.round((recorded + 10) * 100) / 100, delta,
      components: { uncreated: 300, heldMatches: 0, sheetOnlyInPeriod: 338.9, foreignInPeriod: 10, advancePayments: 0, residual: 0 },
      sheetOnlyOutsidePeriod: 12.5, explained: true,
    };
    // held matches of the unticked ambiguous sum: 50 (lines) - 50 (the row that stands) = 0; the delta must then be
    // uncreated - sheetOnly = 300 - 338.90 = -38.90 -> recorded = 572.70 + 38.90 = 611.60
    return {
      accountId: 'acc-card', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement', period: PERIOD, ofxTotal: ofx,
      lines, proposals, sheetOnly: [eletroOld, T('t-stream', 'Assinatura Streaming', 39.9, '2026-09-15')], payment: null,
      ...(withClosing ? { closing } : {}), categoryMap: [
        { key: 'Livraria Gama', type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'default', label: 'Padrão' } },
        { key: 'Eletro Delta', type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'default', label: 'Padrão' } },
      ],
      totals: { lines: lines.length, reconciled: 1, proposals: proposals.length, create: 2, sheetOnly: 2 }, warnings: [],
    };
  }
  const OKC = { enriched: 2, absorbedRows: 1, consumedFutures: 0, created: 1, futureInstallments: 0, reversalsImported: 0, payment: null, skipped: 0, createdCategories: [], warnings: [] };

  async function mountCard(preview, { confirmData = OKC } = {}) {
    await resetWorld();
    fake.cardPreview = () => Promise.resolve({ data: { data: clone(preview) } });
    fake.cardConfirm = async () => ({ data: confirmData });
    fake.review = null;
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    const counters = { closed: 0 };
    const file = new w.File(['OFXHEADER:100\n<OFX></OFX>'], 'fatura-outubro.ofx', { type: 'application/x-ofx' });
    await B.act(async () => {
      root.render(B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.CardDialog, {
        open: true, onClose: () => { counters.closed += 1; }, accountId: 'acc-card', householdId: 'h1', initialFile: file,
      })));
    });
    await flush(40);
    current = { root, qc, counters };
    return current;
  }
  const box = (label) => all('input[type=checkbox]').find((i) => i.getAttribute('aria-label') === label);
  async function toggle(el) { assert.ok(el, 'checkbox missing'); await B.act(async () => { el.click(); }); await flush(10); }
  const closingPanel = () => sectionOf(/^Fechamento da fatura$/);
  const closingRow = (key) => closingPanel()?.querySelector(`[data-closing-row="${key}"]`)?.textContent ?? null;
  const basis = () => closingPanel()?.querySelector('[data-closing-basis]')?.textContent ?? null;
  const chipsIn = (el) => [...el.querySelectorAll('span')].map((s) => s.textContent);
  const LIV = 'Importar nova: Livraria Gama';
  const ELE = 'Importar nova: Eletro Delta';
  const MERGE = 'Somar 2 lançamentos da planilha e enriquecer com o OFX: Shoppe - Cabide';

  rs('CL1 the closing panel shows the server numbers for the default selection, with their explanation', async () => {
    await mountCard(makePreview());
    const panel = closingPanel();
    assert.ok(panel, 'Fechamento da fatura');
    assert.equal(basis(), 'com a seleção padrão do servidor');
    assert.match(panel.textContent, /O cartão fica R\$ 48\.90 a mais que o total do OFX\./);
    assert.match(panel.textContent, /Total do OFXR\$ 572\.70/);
    assert.match(panel.textContent, /No cartão após importarR\$ 621\.60/);
    assert.match(panel.textContent, /Diferença \(OFX − cartão\)−R\$ 48\.90/);
    assert.match(panel.textContent, /Período 2026-09-02 a 2026-10-02 \(o último dia pertence à próxima fatura\)\./);
    assert.equal(closingRow('uncreated'), 'Compras do OFX não importadas+R$ 300.00');
    assert.equal(closingRow('sheetOnlyInPeriod'), 'Planilha sem par dentro do período−R$ 338.90');
    assert.equal(closingRow('foreignInPeriod'), 'Outros lançamentos do cartão no período−R$ 10.00');
    assert.equal(closingRow('heldMatches'), null, 'a zero component is not listed');
    assert.match(closingRow('residual'), /Resto sem explicação.*R\$ 0\.00/);
    assert.ok(chipsIn(panel).includes('explicada'));
    assert.match(panel.textContent, /Informativo: R\$ 12\.50 de linhas da planilha sem par, datadas fora do período/);
    assert.equal(headerOf('Total no Prumo após importar'), 'R$ 621.60R$ 48.90 a mais que o OFX', 'the header total and difference come from the closing, not from the estimate of the client (which cannot see the manual row)');
  });
  const headerOf = (label) => all('dt').find((dt) => dt.textContent === label)?.nextElementSibling?.textContent ?? null;

  rs('CL2 the closing follows the ticks: untick a new purchase, tick the other, go back to the default', async () => {
    await mountCard(makePreview());
    await toggle(box(LIV));
    assert.equal(basis(), 'recalculado com a sua seleção (1 proposta diferente do padrão do servidor)');
    assert.match(closingPanel().textContent, /O cartão fica R\$ 3\.40 a mais que o total do OFX\./);
    assert.equal(closingRow('uncreated'), 'Compras do OFX não importadas+R$ 345.50');
    assert.match(closingPanel().textContent, /No cartão após importarR\$ 576\.10/);
    await toggle(box(ELE));
    assert.match(basis(), /2 propostas diferentes/);
    assert.match(closingPanel().textContent, /O cartão fica R\$ 303\.40 a mais/);
    assert.equal(closingRow('uncreated'), 'Compras do OFX não importadas+R$ 45.50', 'only the purchase left unticked is missing from the card');
    await toggle(box(LIV));
    await toggle(box(ELE));
    assert.equal(basis(), 'com a seleção padrão do servidor', 'back to the default: the server numbers again');
    assert.match(closingPanel().textContent, /O cartão fica R\$ 48\.90 a mais/);
  });

  rs('CL3 a proposal the calculation cannot cover keeps the server value, labelled as the default selection', async () => {
    const preview = makePreview();
    preview.proposals.push({ group: 'g-new-kind', kind: 'teleport', refs: [preview.lines[0].ref], defaultSelected: true, ambiguous: false, target: null, absorbed: [], reason: null, counterpart: null, result: null, futureInstallments: 0 });
    await mountCard(preview);
    assert.ok(bodyText().includes('Tipo de proposta desconhecido') && !bodyText().includes('teleport'), 'an unknown kind is said in words, never as its slug');
    assert.match(basis(), /^com a seleção padrão do servidor \(não recalculado/);
    assert.match(closingPanel().textContent, /O cartão fica R\$ 48\.90 a mais/);
    await toggle(box(LIV));
    assert.match(basis(), /^com a seleção padrão do servidor \(não recalculado/, 'still the server value after another tick');
    assert.match(closingPanel().textContent, /O cartão fica R\$ 48\.90 a mais/);
  });

  rs('CL4 an older server without closing: no panel, and the header keeps the estimate of the client', async () => {
    await mountCard(makePreview({ withClosing: false }));
    assert.equal(closingPanel(), undefined);
    assert.match(headerOf('Total no Prumo após importar'), /^R\$ \d+\.\d\d/);
    assert.ok(box(LIV), 'the rest of the preview is there');
  });

  rs('CL5 a merge: "Soma de 2 lançamentos da planilha", the row that stays and the absorbed one, and it is sent when ticked', async () => {
    await mountCard(makePreview());
    const row = box(MERGE).closest('tr');
    assert.ok(row, 'merge row with its checkbox label');
    assert.equal(box(MERGE).checked, false, 'the server leaves it unticked here');
    assert.ok(chipsIn(row).includes('mesclagem'));
    assert.ok(row.textContent.includes('Soma de 2 lançamentos da planilha'));
    assert.ok(row.textContent.includes('Shoppe - Cabide') && row.textContent.includes('Shoppe - Frascos'));
    assert.equal(row.querySelectorAll('[data-absorbed]').length, 1);
    assert.ok(row.querySelector('[data-absorbed="t-sh2"]').textContent.includes('absorvido e apagado'));
    assert.match(row.textContent, /1 lançamento absorvido será apagado; a descrição e o valor dele ficam nas notas da linha que permanece\./);
    assert.ok(row.textContent.includes('Notas: + Planilha (soma de 2 linhas): Shoppe - Frascos 54,44'));
    await toggle(box(MERGE));
    const confirm = btn(/^Confirmar importação$/);
    await click(confirm);
    await flush(30);
    const sent = fake.calls.find((c) => c.kind === 'card-confirm').payload;
    assert.deepEqual(sent.selectedGroups, ['g-pad', 'g-liv', 'g-merge']);
  });

  rs('CL6 reason chips on the unticked proposals: sheet-residue with the counterpart amount, mixed categories, ambiguous once', async () => {
    await mountCard(makePreview());
    const news = box(ELE).closest('tr');
    assert.ok(chipsIn(news).includes('parecida com a planilha: R$ 299.00'), chipsIn(news).join('|'));
    const chip = [...news.querySelectorAll('span')].find((s) => s.textContent.startsWith('parecida'));
    assert.match(chip.getAttribute('title'), /Eletro Delta 1\/3 · 2026-09-21 · R\$ 299\.00/);
    const merge = box(MERGE).closest('tr');
    assert.ok(chipsIn(merge).includes('categorias diferentes'));
    const farm = box('Enriquecer com o OFX: Farmácia 50').closest('tr');
    assert.equal(chipsIn(farm).filter((c) => c === 'ambígua').length, 1, 'ambiguous is shown once, not twice');
    assert.equal(chipsIn(box(LIV).closest('tr')).includes('parecida com a planilha: R$ 299.00'), false, 'a ticked proposal has no reason chip');
  });

  rs('CL7 the result lists the absorbed rows; from it the review opens on top, Escape closes only the review', async () => {
    const server = newServer();
    const { counters } = await mountCard(makePreview({ mergeDefault: true }));
    fake.review = (method, url, payload) => server.handle(method, url, payload);
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    assert.match(bodyText(), /1 lançamento da planilha absorvido e apagado em uma mesclagem/);
    assert.match(globalThis.__toasts.at(-1)[1], /1 lançamento absorvido/);
    const open = btn(/^Revisar lançamentos sem comprovante$/);
    assert.ok(open, 'the result offers the review');
    await click(open);
    await flush(20);
    assert.equal(calls('GET').length, 1);
    assert.deepEqual(calls('GET')[0].payload, { accountId: 'acc-card', view: 'queue', limit: 200 });
    assert.ok(document.getElementById('card-review-title'), 'the review dialog is open');
    await pressEscape();
    assert.equal(counters.closed, 0, 'Escape belongs to the review dialog on top');
    assert.equal(document.getElementById('card-review-title'), null, 'the review closed');
    assert.ok(btn(/^Revisar lançamentos sem comprovante$/), 'the result is still there');
    await pressEscape();
    assert.equal(counters.closed, 1, 'the next Escape closes the import dialog');
  });

  rs('CL8 the queue summary offers the review too', async () => {
    await resetWorld();
    const preview = makePreview({ mergeDefault: true });
    fake.cardPreview = () => Promise.resolve({ data: { data: clone(preview) } });
    fake.cardConfirm = async () => ({ data: OKC });
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    const files = [new w.File(['x'], 'fatura-a.ofx', { type: 'application/x-ofx' }), new w.File(['x'], 'fatura-b.ofx', { type: 'application/x-ofx' })];
    await B.act(async () => {
      root.render(B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.CardDialog, { open: true, onClose: () => {}, accountId: 'acc-card', householdId: 'h1', files })));
    });
    await flush(40);
    current = { root, qc, counters: { closed: 0 } };
    for (let i = 0; i < 2; i += 1) {
      await click(btn(/^Confirmar (importação|e continuar)$/));
      await flush(30);
    }
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /1 lançamento absorvido|2 lançamentos absorvidos/);
    const server = newServer();
    fake.review = (method, url, payload) => server.handle(method, url, payload);
    await click(btn(/^Revisar lançamentos sem comprovante$/));
    await flush(20);
    assert.ok(document.getElementById('card-review-title'), 'the review opens from the queue summary');
    assert.equal(calls('GET').length, 1);
  });

  rs('RQ19 category chips in words: system name in Portuguese, custom by name, "Categoria" for an unknown id or key', async () => {
    await mountReview(newServer({ rows: [...ROWS, { id: 'r-z', description: 'Linha com chave nova', amount: 3, type: 'EXPENSE', date: '2026-09-20', monthKey: '2026-09', categoryName: 'NEW_SYSTEM_KEY' }] }));
    const chips = (id) => [...rowEl(id).querySelectorAll('span')].map((s) => s.textContent);
    assert.ok(chips('r-a').includes('Roupas e acessórios'));
    assert.ok(chips('r-b').includes('Transporte'), 'TRANSPORTATION reads Transporte');
    assert.ok(chips('r-d').includes('Categoria'), 'a custom category that is not known falls back');
    assert.ok(chips('r-z').includes('Categoria'), 'an unknown system key is not shown as a slug');
    assert.ok(!dialogEl().textContent.includes('CUSTOM:') && !dialogEl().textContent.includes('NEW_SYSTEM_KEY') && !dialogEl().textContent.includes('TRANSPORTATION'));
  });

  rs('RQ20 the Valor columns line up across months, and the confirmation scrolls into view when it opens', async () => {
    const scrolled = [];
    const proto = w.HTMLElement.prototype;
    const original = proto.scrollIntoView;
    proto.scrollIntoView = function scrollIntoView(arg) { scrolled.push([this.getAttribute('role'), arg]); };
    try {
      await mountReview(newServer());
      const tables = all('table');
      assert.equal(tables.length, 2);
      const widths = tables.map((t) => [...t.querySelectorAll('col')].map((c) => c.className).join('|'));
      assert.equal(widths[0], widths[1], 'same column widths in every month');
      assert.ok(tables.every((t) => t.className.includes('table-fixed')), 'fixed layout: the widths are not content-driven');
      await choose(actionSel('r-a'), 'keep');
      assert.equal(scrolled.length, 0);
      await click(applyBtn());
      assert.deepEqual(scrolled.map(([role]) => role), ['alertdialog'], 'the confirmation panel is brought into view');
    } finally {
      if (original) proto.scrollIntoView = original; else delete proto.scrollIntoView;
    }
  });

  rs('CL9 near / neighbour / group: headline, old and new amount with the difference, month of the row, reasons in words, closing follows', async () => {
    const preview = makePreview();
    const bank = preview.lines;
    const mk = (memo, amount, date, o = {}) => ({ ref: `ofx:N${memo.length}${amount}:0000000${amount % 10}`, fitid: `N${memo.length}${amount}`, date, amount, type: 'EXPENSE', kind: 'purchase', memo, merchant: memo, installment: null, status: 'proposed', group: null, ...o });
    const near = mk('Loja Nove', 10.03, '2026-09-14');
    const weak = mk('Loja Dez', 15, '2026-09-18');
    const neigh = mk('Padaria Velha', 33, '2026-09-04');
    const g1 = mk('Cafe Central', 30, '2026-09-16');
    const g2 = mk('Cafe Central', 20, '2026-09-17');
    const T = (id, description, amount, date, o = {}) => ({ transactionId: id, description, amount, type: 'EXPENSE', date, sourceRef: `maxfin:2026-10:credit:${id}`, ...o });
    const P = (group, kind, lines, o) => { for (const l of lines) l.group = group; return { group, kind, refs: lines.map((l) => l.ref), defaultSelected: true, ambiguous: false, absorbed: [], reason: null, counterpart: null, futureInstallments: 0, ...o }; };
    preview.lines = [...bank, near, weak, neigh, g1, g2];
    preview.proposals = [
      ...preview.proposals,
      P('g-near', 'enrich-near', [near], { target: T('t-near', 'Loja 9', 10, '2026-09-14'), result: { date: '2026-09-14', description: 'Loja Nove', notesAppend: null } }),
      P('g-weak', 'enrich-near', [weak], { defaultSelected: false, reason: 'near-amount', target: T('t-weak', 'Loja 10', 15.02, '2026-09-18'), result: { date: '2026-09-18', description: 'Loja Dez', notesAppend: null } }),
      P('g-neigh', 'enrich-neighbour', [neigh], { defaultSelected: false, reason: 'neighbour-month-not-imported', target: T('t-neigh', 'Padaria Antiga', 33, '2026-08-30', { sourceRef: 'maxfin:2026-09:credit:7' }), result: { date: '2026-09-04', description: 'Padaria Velha', notesAppend: null } }),
      P('g-group', 'enrich-group', [g1, g2], { defaultSelected: false, reason: 'pool-too-large', target: T('t-cafe', 'Cafés', 50, '2026-09-16'), result: { date: '2026-09-16', description: 'Cafe Central', notesAppend: null } }),
    ];
    await mountCard(preview);
    const nearRow = box('Enriquecer com o OFX: Loja 9').closest('tr');
    assert.ok(nearRow.textContent.includes('Valor próximo: a planilha passa a ter o valor do banco'));
    assert.equal(nearRow.querySelector('[data-near-change]').textContent, 'R$ 10.00 → R$ 10.03 (+3 centavos)');
    assert.ok(chipsIn(nearRow).includes('valor próximo'));
    const weakRow = box('Enriquecer com o OFX: Loja 10').closest('tr');
    assert.ok(chipsIn(weakRow).includes('valor próximo, sem sinal forte'));
    assert.equal(weakRow.querySelector('[data-near-change]').textContent, 'R$ 15.02 → R$ 15.00 (−2 centavos)');
    const neighRow = box('Enriquecer com o OFX: Padaria Antiga').closest('tr');
    assert.ok(neighRow.textContent.includes('Compra do mês vizinho'));
    assert.ok(neighRow.textContent.includes('Linha da planilha de setembro/2026.'));
    assert.ok(chipsIn(neighRow).includes('mês vizinho'));
    assert.ok(chipsIn(neighRow).includes('fatura do mês vizinho ainda não importada'));
    const groupRow = box('Enriquecer com o OFX: Cafés').closest('tr');
    assert.ok(groupRow.textContent.includes('Soma por comerciante'));
    assert.ok(chipsIn(groupRow).includes('por comerciante') && chipsIn(groupRow).includes('muitas compras do comerciante'));
    for (const slug of ['enrich-', 'neighbour-', 'pool-too-large', 'near-amount']) assert.ok(!document.body.textContent.includes(slug), `no slug: ${slug}`);
    // closing: ticking the held near-amount (15.02 -> 15.00) lowers the card by 2 cents; it is sent when ticked
    const before = closingPanel().textContent.match(/No cartão após importar(R\$ [\d.]+)/)[1];
    await toggle(box('Enriquecer com o OFX: Loja 10'));
    assert.match(basis(), /1 proposta diferente/);
    const after = closingPanel().textContent.match(/No cartão após importar(R\$ [\d.]+)/)[1];
    assert.equal(Math.round((parseFloat(before.slice(3)) - parseFloat(after.slice(3))) * 100), 2);
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    assert.ok(fake.calls.find((c) => c.kind === 'card-confirm').payload.selectedGroups.includes('g-weak'));
  });

  rs('CL10 the residual says "explicada" only when no cent is left; the cents that remain are named', async () => {
    const preview = makePreview();
    preview.closing.components.residual = 0.03;
    preview.closing.delta = Math.round((preview.closing.delta + 0.03) * 100) / 100;
    await mountCard(preview);
    const panel = closingPanel();
    assert.ok(chipsIn(panel).includes('dentro da tolerância: restam R$ 0.03'), chipsIn(panel).join('|'));
    assert.ok(!chipsIn(panel).includes('explicada'));
    assert.match(panel.textContent, /exceto R\$ 0\.03 \(arredondamento do banco, dentro da tolerância de 5 centavos\)/);
  });

  rs('CL11 the "novas" table has a heading', async () => {
    await mountCard(makePreview());
    const news = sectionOf(/^Novas \(2\)$/);
    assert.ok([...news.querySelectorAll('th')].some((th) => th.textContent === 'Compra do OFX (será criada)'));
  });
  // ---- advance payments (backend a8de11c): a "Pagamento recebido" that is not the previous invoice's payment becomes a credit ----
  const money2 = (v) => Math.round(v * 100) / 100;
  function withAdvance() {
    const preview = makePreview();
    const P = (group, kind, lines, o) => { for (const l of lines) l.group = group; return { group, kind, refs: lines.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, absorbed: [], reason: null, counterpart: null, result: null, futureInstallments: 0, ...o }; };
    const pay = (memo, amount, date, k) => ({ ref: `ofx:P${k}:0000000${k}`, fitid: `P${k}`, date, amount, type: 'INCOME', kind: 'payment', memo, merchant: memo, installment: null, status: 'proposed', group: null });
    const a1 = pay('Pagamento recebido A', 100, '2026-09-14', 1);
    const a2 = pay('Pagamento recebido B', 40.5, '2026-09-28', 2);
    const credit = { transactionId: 't-credito', description: 'Pagamento recebido', amount: 40.52, type: 'INCOME', date: '2026-09-28', sourceRef: 'maxfin:2026-10:credit:99' };
    preview.lines = [...preview.lines, a1, a2];
    preview.proposals = [
      ...preview.proposals,
      P('g-adv1', 'advance-payment', [a1], {}),
      P('g-adv2', 'advance-payment', [a2], { defaultSelected: false, reason: 'sheet-credit-near', counterpart: credit }),
    ];
    preview.sheetOnly = [...preview.sheetOnly, credit];
    // by hand, at the default: the credit of A (-100.00) joins the card and is an advance payment (+100.00 of the delta); the left-over
    // sheet credit (-40.52) stays in the card and is "sheet without a pair" (it lowers that component by 40.52)
    const c = preview.closing;
    c.recordedTotal = money2(c.recordedTotal - 100 - 40.52);
    c.delta = money2(c.delta + 100 + 40.52);
    c.components.advancePayments = -100;
    c.components.sheetOnlyInPeriod = money2(c.components.sheetOnlyInPeriod - 40.52);
    return preview;
  }
  const ADV_A = 'Registrar pagamento antecipado como crédito no cartão: Pagamento recebido A';
  const ADV_B = 'Registrar pagamento antecipado como crédito no cartão: Pagamento recebido B';
  const recordedText = () => closingPanel().textContent.match(/No cartão após importar(R\$ [\d.]+)/)[1];

  rs('CL12 advance payments: own section, plain text, amount and bank date, ticked as the server says, counterpart shown', async () => {
    await mountCard(withAdvance());
    const sec = sectionOf(/^Pagamentos antecipados a registrar \(2\)$/);
    assert.ok(sec, 'section of the advance payments');
    assert.ok(sec.textContent.includes('vira um crédito no cartão, na data do banco'));
    assert.deepEqual([...sec.querySelectorAll('th')].map((th) => th.textContent), ['', 'Pagamento no OFX', 'Como fica']);
    assert.equal(box(ADV_A).checked, true);
    assert.equal(box(ADV_B).checked, false, 'held back by the server');
    const rowA = box(ADV_A).closest('tr');
    assert.ok(rowA.textContent.includes('Pagamento antecipado de fatura: vira um crédito no cartão'));
    assert.ok(rowA.textContent.includes('Crédito de R$ 100.00 no cartão, na data do banco (2026-09-14)'));
    assert.ok(rowA.textContent.includes('2026-09-14') && rowA.textContent.includes('+R$ 100.00'));
    const rowB = box(ADV_B).closest('tr');
    assert.ok(chipsIn(rowB).includes('parece o crédito que já está na planilha'), chipsIn(rowB).join('|'));
    assert.equal(rowB.querySelector('[data-counterpart]').textContent, 'Crédito na planilha: Pagamento recebido · 2026-09-28 · +R$ 40.52');
    assert.equal(chipsIn(rowA).includes('parece o crédito que já está na planilha'), false);
    assert.equal(sectionOf(/^Pagamentos antecipados \(/), undefined, 'the lines are not repeated in the information box');
    for (const slug of ['advance-payment', 'sheet-credit-near']) assert.ok(!document.body.textContent.includes(slug), `no slug: ${slug}`);
    assert.ok(bodyText().includes('1 pagamento antecipado a registrar'), 'the footer counts what will be recorded');
  });

  rs('CL13 advance payments: the closing follows the ticks; the credits are sent and counted in the result', async () => {
    await mountCard(withAdvance(), { confirmData: { ...OKC, advancePayments: 2 } });
    assert.equal(basis(), 'com a seleção padrão do servidor');
    assert.match(closingPanel().textContent, /O cartão fica R\$ 91\.62 a menos que o total do OFX\./);
    assert.match(closingRow('advancePayments'), /Créditos de pagamentos antecipados\+R\$ 100\.00/);
    assert.equal(recordedText(), 'R$ 481.08');
    await toggle(box(ADV_B));
    assert.match(basis(), /1 proposta diferente/);
    assert.equal(recordedText(), 'R$ 440.58', 'the 40.50 credit joins the card');
    assert.match(closingPanel().textContent, /O cartão fica R\$ 132\.12 a menos/);
    assert.match(closingRow('advancePayments'), /\+R\$ 140\.50/);
    assert.ok(bodyText().includes('2 pagamentos antecipados a registrar'));
    await toggle(box(ADV_A));
    await toggle(box(ADV_A));
    assert.equal(recordedText(), 'R$ 440.58');
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    const sent = fake.calls.find((c) => c.kind === 'card-confirm').payload;
    assert.ok(sent.selectedGroups.includes('g-adv1') && sent.selectedGroups.includes('g-adv2'));
    assert.equal(sent.categoryMap.length, 1, 'the advance payments add nothing to the category map');
    assert.ok(bodyText().includes('2 pagamentos antecipados registrados'), 'the result lists them');
    assert.match(globalThis.__toasts.at(-1)[1], /2 pagamentos antecipados registrados/);
  });

  rs('CL14 advance payments: unticked ones are not sent and take nothing from the closing; a changed purchase shows its counterpart', async () => {
    const preview = withAdvance();
    const old = { transactionId: 't-oficina-old', description: 'Oficina Horizonte', amount: 305.4, type: 'EXPENSE', date: '2026-09-19', sourceRef: 'maxfin:2026-09:credit:5' };
    const buy = { ref: 'ofx:Q1:00000001', fitid: 'Q1', date: '2026-09-18', amount: 310.4, type: 'EXPENSE', kind: 'purchase', memo: 'Oficina Horizonte', merchant: 'Oficina Horizonte', installment: null, status: 'proposed', group: 'g-chg' };
    preview.lines = [...preview.lines, buy];
    preview.proposals = [...preview.proposals, { group: 'g-chg', kind: 'create', refs: [buy.ref], defaultSelected: false, ambiguous: false, target: null, absorbed: [], reason: 'changed-in-statement', counterpart: old, result: null, futureInstallments: 0 }];
    preview.ofxTotal = money2(preview.ofxTotal + 310.4);
    preview.closing.ofxTotal = money2(preview.closing.ofxTotal + 310.4);
    preview.closing.delta = money2(preview.closing.delta + 310.4);
    preview.closing.components.uncreated = money2(preview.closing.components.uncreated + 310.4);
    await mountCard(preview);
    const row = box('Importar nova: Oficina Horizonte').closest('tr');
    assert.ok(chipsIn(row).includes('a compra mudou neste arquivo: confira antes de importar'), chipsIn(row).join('|'));
    assert.equal(row.querySelector('[data-counterpart]').textContent, 'Já registrada: Oficina Horizonte · 2026-09-19 · R$ 305.40');
    assert.equal(box('Importar nova: Oficina Horizonte').checked, false);
    assert.ok(!document.body.textContent.includes('changed-in-statement'));
    const before = recordedText();
    await toggle(box(ADV_A));
    assert.equal(Math.round((parseFloat(recordedText().slice(3)) - parseFloat(before.slice(3))) * 100), 10000, 'unticking the credit removes it from the card');
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    const sent = fake.calls.find((c) => c.kind === 'card-confirm').payload;
    assert.ok(!sent.selectedGroups.includes('g-adv1') && !sent.selectedGroups.includes('g-adv2') && !sent.selectedGroups.includes('g-chg'));
  });
  rs('CL15 the ledgerBalance of the preview goes back in the confirm (also the queue); without one the field is not sent', async () => {
    const withBalance = withAdvance();
    withBalance.ledgerBalance = 321.4;
    await mountCard(withBalance);
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    const sent = fake.calls.find((c) => c.kind === 'card-confirm').payload;
    assert.equal(sent.ledgerBalance, 321.4);
    const none = withAdvance();
    none.ledgerBalance = null;
    await mountCard(none);
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    const sent2 = fake.calls.filter((c) => c.kind === 'card-confirm').at(-1).payload;
    assert.equal('ledgerBalance' in sent2, false);
    // queue: "confirm this and apply the default to the rest" builds its payloads from the plan of each file
    await resetWorld();
    const queued = withAdvance();
    queued.ledgerBalance = 77.7;
    fake.cardPreview = () => Promise.resolve({ data: { data: clone(queued) } });
    fake.cardConfirm = async () => ({ data: OKC });
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    const files = [new w.File(['x'], 'fatura-a.ofx', { type: 'application/x-ofx' }), new w.File(['x'], 'fatura-b.ofx', { type: 'application/x-ofx' })];
    await B.act(async () => {
      root.render(B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.CardDialog, { open: true, onClose: () => {}, accountId: 'acc-card', householdId: 'h1', files })));
    });
    await flush(40);
    current = { root, qc, counters: { closed: 0 } };
    await click(btn(/^Confirmar esta e aplicar o padrão nas restantes/));
    await flush(60);
    const confirms = fake.calls.filter((c) => c.kind === 'card-confirm').slice(-2);
    assert.equal(confirms.length, 2);
    assert.ok(confirms.every((c) => c.payload.ledgerBalance === 77.7), 'every file of the queue echoes its balance');
  });

  rs('CL16 held advance payments: changed in the statement (with the existing credit) and "payment-ambiguous", in plain words', async () => {
    const preview = withAdvance();
    const credit = { transactionId: 't-cred-old', description: 'Pagamento recebido', amount: 90, type: 'INCOME', date: '2026-09-14', sourceRef: 'maxfin:2026-09:credit:3' };
    const mk = (k, memo, amount, date) => ({ ref: `ofx:R${k}:0000000${k}`, fitid: `R${k}`, date, amount, type: 'INCOME', kind: 'payment', memo, merchant: memo, installment: null, status: 'proposed', group: `g-r${k}` });
    const l1 = mk(1, 'Pagamento recebido C', 95, '2026-09-14');
    const l2 = mk(2, 'Pagamento recebido D', 60, '2026-09-20');
    const base = { kind: 'advance-payment', defaultSelected: false, ambiguous: false, target: null, absorbed: [], result: null, futureInstallments: 0 };
    preview.lines = [...preview.lines, l1, l2];
    preview.proposals = [...preview.proposals,
      { ...base, group: 'g-r1', refs: [l1.ref], reason: 'changed-in-statement', counterpart: credit },
      { ...base, group: 'g-r2', refs: [l2.ref], reason: 'payment-ambiguous', counterpart: null }];
    await mountCard(preview);
    const label = (m) => `Registrar pagamento antecipado como crédito no cartão: ${m}`;
    assert.equal(box(label('Pagamento recebido C')).checked, false);
    assert.equal(box(label('Pagamento recebido D')).checked, false);
    const r1 = box(label('Pagamento recebido C')).closest('tr');
    assert.ok(chipsIn(r1).includes('o pagamento antecipado mudou neste arquivo: confira antes de importar'), chipsIn(r1).join('|'));
    assert.equal(r1.querySelector('[data-counterpart]').textContent, 'Já registrada: Pagamento recebido · 2026-09-14 · +R$ 90.00');
    const r2 = box(label('Pagamento recebido D')).closest('tr');
    assert.ok(chipsIn(r2).includes('não deu para saber qual é o pagamento principal da fatura: confira antes de importar'), chipsIn(r2).join('|'));
    assert.equal(r2.querySelector('[data-counterpart]'), null);
    for (const slug of ['payment-ambiguous', 'changed-in-statement']) assert.ok(!document.body.textContent.includes(slug), `no slug: ${slug}`);
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    const sent = fake.calls.find((c) => c.kind === 'card-confirm').payload;
    assert.ok(!sent.selectedGroups.includes('g-r1') && !sent.selectedGroups.includes('g-r2'));
  });
  rs('CL17 paymentLineRef: the payment line of the preview goes back in the confirm and in the queue; without a payment it is not sent; "Reabra a prévia" is said in the result', async () => {
    const withPayment = withAdvance();
    withPayment.payment = { ref: 'ofx:PAY:00000001', amount: 900, date: '2026-09-09', invoiceMonthKey: '2026-09', recorded: null, proposal: 'ok' };
    withPayment.lines = [...withPayment.lines, { ref: 'ofx:PAY:00000001', fitid: 'PAY', date: '2026-09-09', amount: 900, type: 'INCOME', kind: 'payment', memo: 'Pagamento recebido', merchant: 'Pagamento recebido', installment: null, status: 'payment', group: null }];
    const reopen = ['Esta fatura tem mais de um "Pagamento recebido" e o pedido não trouxe o saldo: o pagamento e os antecipados não foram aplicados. Reabra a prévia.'];
    await mountCard(withPayment, { confirmData: { ...OKC, warnings: reopen } });
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    const sent = fake.calls.find((c) => c.kind === 'card-confirm').payload;
    assert.equal(sent.paymentLineRef, 'ofx:PAY:00000001');
    assert.ok(bodyText().includes('O pagamento da fatura anterior e os pagamentos antecipados não foram aplicados: reabra a prévia.'));
    assert.ok(bodyText().includes('Reabra a prévia.'), 'the server warning is listed as well');
    assert.match(globalThis.__toasts.at(-1)[1], /pagamentos não aplicados: reabra a prévia/);
    const noPayment = withAdvance();
    noPayment.payment = null;
    await mountCard(noPayment);
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    assert.equal('paymentLineRef' in fake.calls.filter((c) => c.kind === 'card-confirm').at(-1).payload, false);
    await resetWorld();
    fake.cardPreview = () => Promise.resolve({ data: { data: clone(withPayment) } });
    fake.cardConfirm = async () => ({ data: OKC });
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    const files = [new w.File(['x'], 'fatura-a.ofx', { type: 'application/x-ofx' }), new w.File(['x'], 'fatura-b.ofx', { type: 'application/x-ofx' })];
    await B.act(async () => {
      root.render(B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.CardDialog, { open: true, onClose: () => {}, accountId: 'acc-card', householdId: 'h1', files })));
    });
    await flush(40);
    current = { root, qc, counters: { closed: 0 } };
    await click(btn(/^Confirmar esta e aplicar o padrão nas restantes/));
    await flush(60);
    const confirms = fake.calls.filter((c) => c.kind === 'card-confirm').slice(-2);
    assert.equal(confirms.length, 2);
    assert.ok(confirms.every((c) => c.payload.paymentLineRef === 'ofx:PAY:00000001'), 'every file of the queue echoes its payment line');
  });
}
