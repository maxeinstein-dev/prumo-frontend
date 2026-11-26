// Phase 5: scenarios of the REAL "Detectar recorrentes" dialog (DetectRecurringDialog) against the fake of
// recurring-fake.mjs wired through stubs/api.ts (`fake.recurring`). Registered by scenarios.mjs (names DR*).
// Every name and amount is invented.
import assert from 'node:assert/strict';
import { createRecurringServer, EMPTY_SKIPPED } from './recurring-fake.mjs';

export function registerDetectScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click }) {
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ---- fixtures ----------------------------------------------------------------------------------------------------
  const cand = (id, description, o = {}) => ({
    id, accountId: 'acc-main', accountName: 'Conta Principal', description, categoryName: 'ENTERTAINMENT', amount: 100, medianAmount: 100, minAmount: 100, maxAmount: 100,
    dayOfMonth: 10, monthsSeen: 6, windowMonths: 12, lastMonth: '2026-09', kind: 'stable', confidence: 0.9, defaultSelected: true, followLastAmount: true,
    examples: [{ transactionId: `${id}-t1`, date: '2026-09-10', amount: 100, description }], ...o,
  });
  const STREAM = cand('c-stream', 'Streaming Alfa', {
    amount: 39.9, medianAmount: 39.9, minAmount: 39.9, maxAmount: 39.9, dayOfMonth: 5, monthsSeen: 10,
    examples: [
      { transactionId: 'e1', date: '2026-09-05', amount: 39.9, description: 'STREAMING ALFA 09' },
      { transactionId: 'e2', date: '2026-08-05', amount: 39.9, description: 'STREAMING ALFA 08' },
    ],
  });
  const GYM = cand('c-gym', 'Academia Beta', { amount: 120, dayOfMonth: 12, defaultSelected: false, confidence: 0.55 });
  const POWER = cand('c-power', 'Conta de energia', {
    kind: 'bill', amount: 187.43, minAmount: 150.1, maxAmount: 210, medianAmount: 180, dayOfMonth: 20, confidence: 0.7, monthsSeen: 9, accountName: 'Conta Casa',
  });
  const WATER = cand('c-water', 'Conta de agua', { kind: 'bill', amount: 64.5, dayOfMonth: 15, defaultSelected: false });
  const ALL = [STREAM, GYM, POWER, WATER];
  const SKIPPED = { alreadyRecurring: 2, installments: 1, sparse: 0, consumption: 7 };
  const newServer = (o = {}) => createRecurringServer({ candidates: o.candidates ?? ALL, skipped: o.skipped ?? SKIPPED });

  // ---- mount -------------------------------------------------------------------------------------------------------
  let current = null;
  async function mountDetect(server, { canWrite = true, strict = false, household = 'h1', seed = true } = {}) {
    document.body.innerHTML = '<div id="root"></div>';
    w.localStorage.clear();
    fake.calls = [];
    for (const key of ['preview', 'workbook', 'confirm', 'cardPreview', 'cardConfirm', 'statementPreview', 'people']) fake[key] = null;
    fake.recurring = (method, url, payload) => server.handle(method, url, payload);
    globalThis.__toasts = [];
    globalThis.__defaultHousehold = household;
    globalThis.__household = undefined;
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    if (seed) {
      qc.setQueryData(['recurring-transactions', { householdId: 'h1' }], []);
      qc.setQueryData(['transactions', 'list', { householdId: 'h1' }], []);
      qc.setQueryData(['people', 'balances', 'h1'], []);
    }
    const root = B.createRoot(document.getElementById('root'));
    const counters = { closed: 0 };
    const props = { open: true, canWrite, householdId: household };
    const tree = () => {
      const el = B.createElement(B.QueryClientProvider, { client: qc },
        B.createElement(B.DetectDialog, { open: props.open, onClose: () => { counters.closed += 1; }, householdId: props.householdId, canWrite: props.canWrite }));
      return strict ? B.createElement(B.StrictMode, null, el) : el;
    };
    await B.act(async () => { root.render(tree()); });
    await flush(30);
    current = {
      root, qc, counters, props,
      rerender: async () => { await B.act(async () => { root.render(tree()); }); await flush(10); },
    };
    return current;
  }
  async function unmount() {
    if (!current) return;
    const { root } = current;
    current = null;
    await B.act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
  const ds = (name, fn) => scenario(name, async () => {
    try { await fn(); } finally { await unmount(); }
  });

  // ---- DOM helpers --------------------------------------------------------------------------------------------------
  async function typeInto(el, value) {
    assert.ok(el, 'input missing');
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    await B.act(async () => { setter.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })); });
    await flush(5);
  }
  async function toggle(el) {
    assert.ok(el, 'checkbox missing');
    await B.act(async () => { el.click(); });
    await flush(10);
  }
  async function pressEscape() {
    await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush(5);
  }
  const byLabel = (selector, label) => all(selector).find((e) => e.getAttribute('aria-label') === label);
  const box = (label) => byLabel('input[type=checkbox]', label);
  const field = (label) => byLabel('input[type=text]', label);
  const rowOf = (id) => document.querySelector(`tr[data-candidate="${id}"]`);
  const calls = (kind) => fake.calls.filter((c) => c.kind === 'recurring' && c.url.endsWith(kind === 'apply' ? '/detect/apply' : '/detect'));
  const toasts = () => globalThis.__toasts ?? [];
  const backdrop = () => all('div[aria-hidden="true"]').find((d) => d.className.includes('bg-black/40'));
  const applyBtn = () => btn(/^(Criar \d+ recorrências?|Criar recorrências|Criando…)$/);
  const redetectBtn = () => btn(/^(Detectar de novo|Detectando…)$/);
  const summaryText = () => document.querySelector('[data-summary]')?.textContent ?? null;
  const blockerText = () => document.getElementById('detect-recurring-blocker')?.textContent ?? null;
  const ticks = () => Object.fromEntries(ALL.map((c) => [c.id, box(`Criar recorrência: ${c.description}`)?.checked ?? null]));
  const follow = (c) => box(`Acompanhar o último valor: ${c.description}`);
  const lastApply = () => calls('apply').at(-1)?.payload;

  // ---- scenarios ------------------------------------------------------------------------------------------------------

  ds('DR1 opening detects once with the household only; the table shows description, account, amount with range, day, months seen, kind, confidence', async () => {
    await mountDetect(newServer());
    assert.equal(calls('detect').length, 1);
    assert.deepEqual(calls('detect')[0].payload, { householdId: 'h1' });
    assert.equal(calls('apply').length, 0, 'opening creates nothing');
    const text = bodyText();
    assert.match(text, /Valor estável \(2\)/);
    assert.match(text, /Conta do mês \(2\)/);
    const stream = rowOf('c-stream').textContent;
    assert.match(stream, /Conta Principal/);
    assert.match(stream, /10 de 12/);
    assert.match(stream, /estável/);
    assert.match(stream, /90%/);
    assert.equal(field('Valor de Streaming Alfa').value, '39,90');
    assert.equal(field('Dia do mês de Streaming Alfa').value, '5');
    assert.equal(field('Descrição de Streaming Alfa').value, 'Streaming Alfa');
    assert.equal(rowOf('c-stream').querySelector('[data-range]'), null, 'no range when the amounts never varied');
    const power = rowOf('c-power');
    assert.match(power.textContent, /Conta Casa/);
    assert.match(power.textContent, /conta/);
    assert.equal(power.querySelector('[data-range]').textContent, 'R$ 150,10 a R$ 210,00');
    assert.equal(field('Valor de Conta de energia').value, '187,43');
    assert.match(bodyText(), /Ficaram de fora: 2 já são recorrências, 1 é parcela, 7 são consumo variável\./);
  });

  ds('DR2 the server marks are the default selection and the summary is built from the rows that would be sent', async () => {
    await mountDetect(newServer());
    assert.deepEqual(ticks(), { 'c-stream': true, 'c-gym': false, 'c-power': true, 'c-water': false });
    assert.match(summaryText(), /2 recorrências \(1 estável, 1 conta\) · R\$ 227\.33 por mês · 2 acompanham o último valor/);
    await toggle(box('Criar recorrência: Academia Beta'));
    assert.match(summaryText(), /3 recorrências \(2 estáveis, 1 conta\) · R\$ 347\.33 por mês/);
    assert.match(applyBtn().textContent, /^Criar 3 recorrências$/);
  });

  ds('DR3 examples expand per candidate (up to the ones the server sent), dates as dd/mm/yyyy', async () => {
    await mountDetect(newServer());
    assert.equal(document.querySelector('tr[data-examples]'), null);
    const open = byLabel('button', 'Ver exemplos de Streaming Alfa');
    assert.equal(open.getAttribute('aria-expanded'), 'false');
    await click(open);
    const examples = document.querySelector('tr[data-examples="c-stream"]');
    assert.ok(examples);
    assert.match(examples.textContent, /05\/09\/2026/);
    assert.match(examples.textContent, /STREAMING ALFA 08/);
    assert.match(examples.textContent, /R\$ 39\.90/);
    assert.equal(byLabel('button', 'Ver exemplos de Streaming Alfa').getAttribute('aria-expanded'), 'true');
    assert.equal(document.querySelector('tr[data-examples="c-power"]'), null, 'only the expanded one');
    await click(byLabel('button', 'Ver exemplos de Streaming Alfa'));
    assert.equal(document.querySelector('tr[data-examples]'), null);
  });

  ds('DR4 bulk toggles: "marcar todas as estáveis" and "as contas" touch only their kind and flip to "desmarcar"', async () => {
    await mountDetect(newServer());
    await click(btn(/^Marcar todas as estáveis$/));
    assert.deepEqual(ticks(), { 'c-stream': true, 'c-gym': true, 'c-power': true, 'c-water': false });
    await click(btn(/^Marcar todas as contas$/));
    assert.deepEqual(ticks(), { 'c-stream': true, 'c-gym': true, 'c-power': true, 'c-water': true });
    assert.ok(btn(/^Desmarcar todas as estáveis$/) && btn(/^Desmarcar todas as contas$/));
    await click(btn(/^Desmarcar todas as contas$/));
    assert.deepEqual(ticks(), { 'c-stream': true, 'c-gym': true, 'c-power': false, 'c-water': false });
    await click(btn(/^Desmarcar todas as estáveis$/));
    assert.deepEqual(ticks(), { 'c-stream': false, 'c-gym': false, 'c-power': false, 'c-water': false });
    assert.equal(summaryText(), 'Nada marcado.');
    assert.ok(applyBtn().disabled);
    assert.equal(blockerText(), 'Marque ao menos uma despesa.');
  });

  ds('DR5 adjustment validation: amount, day and description; the button and the reason follow; a fix unblocks', async () => {
    await mountDetect(newServer());
    assert.ok(!applyBtn().disabled);
    await typeInto(field('Valor de Streaming Alfa'), 'abc');
    assert.match(rowOf('c-stream').textContent, /Valor inválido\./);
    assert.ok(applyBtn().disabled);
    assert.equal(blockerText(), 'Corrija o ajuste inválido antes de criar.');
    await typeInto(field('Valor de Streaming Alfa'), '0');
    assert.match(rowOf('c-stream').textContent, /O valor precisa ser maior que zero\./);
    await typeInto(field('Valor de Streaming Alfa'), '');
    assert.match(rowOf('c-stream').textContent, /Informe o valor\./);
    await typeInto(field('Valor de Streaming Alfa'), '41,90');
    assert.doesNotMatch(rowOf('c-stream').textContent, /Valor inválido|Informe o valor|maior que zero/);
    await typeInto(field('Dia do mês de Conta de energia'), '32');
    assert.match(rowOf('c-power').textContent, /Informe um dia de 1 a 31\./);
    await typeInto(field('Descrição de Conta de energia'), '   ');
    assert.match(rowOf('c-power').textContent, /Informe a descrição\./);
    assert.match(blockerText(), /Corrija os 1 ajustes inválidos|Corrija o ajuste inválido/);
    assert.ok(applyBtn().disabled);
    await typeInto(field('Dia do mês de Conta de energia'), '31');
    await typeInto(field('Descrição de Conta de energia'), 'Energia');
    assert.ok(!applyBtn().disabled, 'all fixed');
    assert.equal(blockerText(), null);
    assert.match(summaryText(), /R\$ 41\.90|R\$ 229\.33/, 'the typed amount is what the monthly total uses');
  });

  ds('DR6 an invalid adjustment on a candidate that is NOT ticked does not block', async () => {
    await mountDetect(newServer());
    await typeInto(field('Dia do mês de Academia Beta'), '99');
    assert.ok(!applyBtn().disabled);
    await toggle(box('Criar recorrência: Academia Beta'));
    assert.ok(applyBtn().disabled, 'ticking it brings the error back');
  });

  ds('DR7 apply: one request with the ticked ids and ONLY the adjusted fields; result step, toast and the lists are invalidated', async () => {
    const server = newServer();
    const { qc } = await mountDetect(server);
    await typeInto(field('Valor de Conta de energia'), '195,50');
    await typeInto(field('Dia do mês de Conta de energia'), '25');
    await typeInto(field('Descrição de Conta de energia'), '  Energia da casa ');
    await click(applyBtn());
    await flush(30);
    assert.equal(calls('apply').length, 1);
    assert.deepEqual(lastApply(), {
      householdId: 'h1',
      items: [{ id: 'c-stream' }, { id: 'c-power', amount: 195.5, dayOfMonth: 25, description: 'Energia da casa' }],
    });
    assert.deepEqual(server.state.created.map((c) => [c.candidateId, c.amount, c.dayOfMonth, c.description, c.followLastAmount]), [
      ['c-stream', 39.9, 5, 'Streaming Alfa', true], ['c-power', 195.5, 25, 'Energia da casa', true],
    ]);
    assert.match(bodyText(), /Recorrências criadas/);
    assert.match(bodyText(), /2 recorrências criadas\./);
    assert.match(bodyText(), /3 transações do histórico vinculadas\./);
    assert.deepEqual(toasts().at(-1), ['success', '2 recorrências criadas. 3 transações do histórico vinculadas.']);
    assert.equal(qc.getQueryState(['recurring-transactions', { householdId: 'h1' }]).isInvalidated, true, 'recurrences refetch');
    assert.equal(qc.getQueryState(['transactions', 'list', { householdId: 'h1' }]).isInvalidated, true, 'transactions refetch');
    assert.equal(qc.getQueryState(['people', 'balances', 'h1']).isInvalidated, false, 'nothing else is touched');
    await click(btn(/^Fechar$/));
    assert.equal(current.counters.closed, 1);
  });

  ds('DR8 follow the last amount: on by default, per-row toggle and the bulk toggle; the item says so only when it differs', async () => {
    const server = newServer();
    await mountDetect(server);
    for (const c of ALL) assert.equal(follow(c).checked, true, c.description);
    await toggle(follow(STREAM));
    assert.equal(follow(STREAM).checked, false);
    assert.match(summaryText(), /1 acompanha o último valor/);
    await click(btn(/^Ligar “acompanhar o último valor” em todas$/));
    for (const c of ALL) assert.equal(follow(c).checked, true, `${c.description} after "ligar em todas"`);
    await click(btn(/^Desligar “acompanhar o último valor” em todas$/));
    for (const c of ALL) assert.equal(follow(c).checked, false, `${c.description} after "desligar em todas"`);
    await toggle(follow(POWER));
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().items, [{ id: 'c-stream', followLastAmount: false }, { id: 'c-power' }]);
    assert.deepEqual(server.state.created.map((c) => [c.candidateId, c.followLastAmount]), [['c-stream', false], ['c-power', true]]);
  });

  ds('DR9 a candidate the server says does not follow keeps that, and turning it on is sent', async () => {
    const server = newServer({ candidates: [cand('c-fixed', 'Plano fixo', { followLastAmount: false })] });
    await mountDetect(server);
    const c = { description: 'Plano fixo' };
    assert.equal(follow(c).checked, false);
    await toggle(follow(c));
    await click(applyBtn());
    await flush(30);
    assert.deepEqual(lastApply().items, [{ id: 'c-fixed', followLastAmount: true }]);
  });

  ds('DR10 a failed apply: error, the list is stale (Criar disabled with the reason), choices are kept; detecting again unblocks', async () => {
    const server = newServer();
    await mountDetect(server);
    await toggle(box('Criar recorrência: Academia Beta'));
    await typeInto(field('Valor de Streaming Alfa'), '45,00');
    server.failNext('apply', 500, 'Falha do servidor');
    await click(applyBtn());
    await flush(30);
    assert.equal(calls('apply').length, 1);
    assert.match(bodyText(), /Falha do servidor\. A criação pode ter sido parcial: detecte de novo/);
    assert.deepEqual(toasts().at(-1)[0], 'error');
    assert.equal(current.qc.getQueryState(['recurring-transactions', { householdId: 'h1' }]).isInvalidated, true, 'a failed request may have created some: the lists refetch');
    assert.equal(current.qc.getQueryState(['transactions', 'list', { householdId: 'h1' }]).isInvalidated, true);
    assert.ok(applyBtn().disabled, 'blocked');
    assert.match(blockerText(), /Detecte de novo antes de criar/);
    await click(applyBtn());
    assert.equal(calls('apply').length, 1, 'a click on the disabled button sends nothing');
    // toggling a row does not unblock a stale list
    await toggle(box('Criar recorrência: Conta de agua'));
    assert.ok(applyBtn().disabled);
    await click(btn(/^Detectar de novo$/, 'error'));
    await flush(30);
    assert.equal(calls('detect').length, 2);
    assert.doesNotMatch(bodyText(), /A criação pode ter sido parcial/);
    assert.ok(!applyBtn().disabled, 'unblocked once the list is fresh');
    assert.equal(box('Criar recorrência: Academia Beta').checked, true, 'what the user decided survives the new detection');
    assert.equal(field('Valor de Streaming Alfa').value, '45,00');
    await click(applyBtn());
    await flush(30);
    assert.equal(calls('apply').length, 2);
    assert.match(bodyText(), /Recorrências criadas/);
  });

  ds('DR11 a 4xx apply says nothing was created', async () => {
    const server = newServer();
    await mountDetect(server);
    server.failNext('apply', 403, 'Sem permissão');
    await click(applyBtn());
    await flush(30);
    assert.match(bodyText(), /Sem permissão\. Nada foi criado: detecte de novo\./);
  });

  ds('DR12 latest-wins: a slower, older detection never overwrites a newer one', async () => {
    const server = newServer();
    await mountDetect(server);
    const first = server.hold('detect');
    const second = server.hold('detect');
    await click(redetectBtn());
    await click(redetectBtn());
    assert.equal(calls('detect').length, 3);
    second.release({ candidates: [cand('c-new', 'Seguro Gama', { amount: 77 })], skipped: EMPTY_SKIPPED });
    await flush(20);
    assert.ok(box('Criar recorrência: Seguro Gama'), 'the newest answer is on screen');
    first.release({ candidates: [cand('c-old', 'Resposta antiga')], skipped: EMPTY_SKIPPED });
    await flush(20);
    assert.ok(box('Criar recorrência: Seguro Gama'));
    assert.equal(box('Criar recorrência: Resposta antiga'), undefined, 'the stale answer is ignored');
    assert.equal(all('tr[data-candidate]').length, 1);
  });

  ds('DR13 close guard: while applying, ESC, the backdrop, the X and Fechar do nothing; afterwards they work', async () => {
    const server = newServer();
    const { counters } = await mountDetect(server);
    const held = server.hold('apply');
    await click(applyBtn());
    await flush(10);
    assert.equal(calls('apply').length, 1);
    assert.match(applyBtn().textContent, /Criando…/);
    await pressEscape();
    await click(backdrop());
    const x = byLabel('button', 'Fechar modal');
    assert.ok(x.disabled, 'the X is disabled');
    await click(x);
    assert.ok(btn(/^Fechar$/).disabled);
    assert.equal(counters.closed, 0);
    assert.ok(field('Valor de Streaming Alfa').disabled, 'fields are locked while applying');
    held.release();
    await flush(30);
    assert.match(bodyText(), /Recorrências criadas/);
    await pressEscape();
    assert.equal(counters.closed, 1);
  });

  ds('DR23 Criar is disabled while a re-detection is in flight and works again once it lands', async () => {
    const server = newServer();
    await mountDetect(server);
    assert.ok(!applyBtn().disabled);
    const held = server.hold('detect');
    await click(redetectBtn());
    assert.ok(applyBtn().disabled, 'the list on screen is about to change');
    await click(applyBtn());
    assert.equal(calls('apply').length, 0, 'a click on it sends nothing');
    held.release();
    await flush(30);
    assert.ok(!applyBtn().disabled);
    await click(applyBtn());
    await flush(30);
    assert.equal(calls('apply').length, 1);
  });

  ds('DR14 a double click on Criar sends one request', async () => {
    const server = newServer();
    await mountDetect(server);
    const held = server.hold('apply');
    const b = applyBtn();
    await B.act(async () => {
      b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await flush(10);
    held.release();
    await flush(30);
    assert.equal(calls('apply').length, 1);
  });

  ds('DR15 viewer: sees the candidates but no way to choose, adjust or create', async () => {
    const server = newServer();
    await mountDetect(server, { canWrite: false });
    assert.equal(calls('detect').length, 1, 'reading is allowed');
    assert.match(bodyText(), /Streaming Alfa/);
    assert.match(bodyText(), /Conta de energia/);
    assert.equal(all('input[type=text]').length, 0, 'no editable field');
    assert.equal(all('input[type=checkbox]').filter((i) => !(i.getAttribute('aria-label') ?? '').startsWith('Acompanhar')).length, 0, 'no selection');
    assert.ok(all('input[type=checkbox]').every((i) => i.disabled), 'the follow marks are read-only');
    assert.equal(applyBtn(), undefined);
    assert.equal(btn(/^Marcar todas/), undefined);
    assert.equal(btn(/acompanhar o último valor” em todas/), undefined);
    assert.equal(summaryText(), null);
    assert.ok(btn(/^Fechar$/));
    assert.equal(calls('apply').length, 0);
  });

  ds('DR16 empty: the reasons come from the skipped counts; detecting again works', async () => {
    const server = newServer({ candidates: [], skipped: { alreadyRecurring: 3, installments: 0, sparse: 2, consumption: 5 } });
    await mountDetect(server);
    assert.match(bodyText(), /Nenhuma despesa recorrente nova foi encontrada no histórico\./);
    const text = bodyText();
    assert.match(text, /3 já são recorrências/);
    assert.match(text, /2 aparecem com lacunas demais/);
    assert.match(text, /5 são consumo variável/);
    assert.doesNotMatch(text, /parcela/);
    assert.equal(all('table').length, 0);
    assert.equal(applyBtn(), undefined);
    server.state.candidates = [STREAM];
    await click(redetectBtn());
    await flush(30);
    assert.ok(box('Criar recorrência: Streaming Alfa'));
  });

  ds('DR17 detection fails on open: the error with "Tentar de novo"; the retry works', async () => {
    const server = newServer();
    server.failNext('detect', 500, 'Servidor fora');
    await mountDetect(server);
    assert.match(bodyText(), /Servidor fora/);
    assert.deepEqual(toasts().at(-1), ['error', 'Servidor fora']);
    assert.equal(all('table').length, 0);
    await click(btn(/^Tentar de novo$/));
    await flush(30);
    assert.equal(calls('detect').length, 2);
    assert.ok(box('Criar recorrência: Streaming Alfa'));
  });

  ds('DR18 a failed re-detection keeps the list and says so', async () => {
    const server = newServer();
    await mountDetect(server);
    server.failNext('detect', 500, 'Oscilou');
    await click(redetectBtn());
    await flush(30);
    assert.ok(box('Criar recorrência: Streaming Alfa'), 'the list stays');
    assert.match(bodyText(), /Oscilou/);
  });

  ds('DR19 under StrictMode the list still renders once the dust settles and an apply sends one request', async () => {
    const server = newServer();
    await mountDetect(server, { strict: true });
    assert.ok(box('Criar recorrência: Streaming Alfa'));
    await click(applyBtn());
    await flush(30);
    assert.equal(calls('apply').length, 1);
  });

  ds('DR20 closing and reopening starts over: a fresh detection, no leftover choices', async () => {
    const server = newServer();
    const ctx = await mountDetect(server);
    await toggle(box('Criar recorrência: Academia Beta'));
    await typeInto(field('Valor de Streaming Alfa'), '50');
    ctx.props.open = false;
    await ctx.rerender();
    assert.equal(all('[role=dialog]').length, 0);
    ctx.props.open = true;
    await ctx.rerender();
    await flush(30);
    assert.equal(calls('detect').length, 2);
    assert.equal(box('Criar recorrência: Academia Beta').checked, false);
    assert.equal(field('Valor de Streaming Alfa').value, '39,90');
  });

  ds('DR21 a detection that finishes after the dialog closed is ignored', async () => {
    const server = newServer();
    const ctx = await mountDetect(server);
    const held = server.hold('detect');
    await click(redetectBtn());
    ctx.props.open = false;
    await ctx.rerender();
    held.release({ candidates: [cand('c-late', 'Chegou tarde')], skipped: EMPTY_SKIPPED });
    await flush(20);
    ctx.props.open = true;
    await ctx.rerender();
    await flush(30);
    assert.equal(box('Criar recorrência: Chegou tarde'), undefined);
    assert.ok(box('Criar recorrência: Streaming Alfa'));
  });

  ds('DR22 results with warnings and skipped items are shown', async () => {
    const server = newServer();
    await mountDetect(server);
    const held = server.hold('apply');
    await click(applyBtn());
    held.release({ created: 1, skipped: 1, linkedTransactions: 0, warnings: ['Conta de energia: a data foi ajustada para o dia 28.'] });
    await flush(30);
    assert.match(bodyText(), /1 recorrência criada\./);
    assert.match(bodyText(), /1 item ignorado \(já eram recorrentes ou não aparecem mais\)\./);
    assert.match(bodyText(), /a data foi ajustada para o dia 28/);
    assert.deepEqual(toasts().at(-1), ['success', '1 recorrência criada. 1 item ignorado (já eram recorrentes ou não aparecem mais).']);
  });
}
