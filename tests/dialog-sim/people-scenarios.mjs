// Phase 4 (people and shared expenses): scenarios of the REAL "Dividir" dialog, the settlement dialog, the person form,
// the person detail (ledger pagination) and, in organize-scenarios.mjs, the organize wizard. They run against the
// stateful fake of people-fake.mjs wired through stubs/api.ts (`fake.people`). Registered by scenarios.mjs (names P*, O*).
// Every name and amount is invented.
import assert from 'node:assert/strict';
import { createPeopleServer } from './people-fake.mjs';
import { registerOrganizeScenarios } from './organize-scenarios.mjs';

export function registerPeopleScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click }) {
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ---- fixtures ---------------------------------------------------------------------------------------------
  const ANA = { id: 'p-ana', householdId: 'h1', name: 'Ana', aliases: ['Aninha'], userId: null, isActive: true };
  const BIA = { id: 'p-bia', householdId: 'h1', name: 'Bia', aliases: [], userId: null, isActive: true };
  const CAIO = { id: 'p-caio', householdId: 'h1', name: 'Caio', aliases: [], userId: null, isActive: true };
  const OLD = { id: 'p-old', householdId: 'h1', name: 'Dora', aliases: [], userId: null, isActive: false };
  const TXS = [
    { id: 't-super', description: 'Mercado Central', amount: 100, type: 'EXPENSE', date: '2026-10-03' },
    { id: 't-pizza', description: 'Pizzaria Sol', amount: 90.01, type: 'EXPENSE', date: '2026-10-04' },
    { id: 't-refund', description: 'Reembolso Ana', amount: 55, type: 'INCOME', date: '2026-10-08' },
  ];
  const ACCOUNTS = [
    { id: 'acc-main', householdId: 'h1', name: 'Conta Principal', type: 'CHECKING', isActive: true },
    { id: 'acc-card', householdId: 'h1', name: 'Nubank', type: 'CREDIT', isActive: true },
    { id: 'acc-sav', householdId: 'h1', name: 'Poupança', type: 'SAVINGS', isActive: true },
    { id: 'acc-old', householdId: 'h1', name: 'Conta Antiga', type: 'CHECKING', isActive: false },
  ];
  const newServer = (o = {}) => createPeopleServer({ people: o.people ?? [ANA, BIA, CAIO, OLD], transactions: o.transactions ?? TXS });

  // ---- mount ------------------------------------------------------------------------------------------------
  let current = null;
  async function mountWith(server, render, { strict = false, storage = {}, household = null } = {}) {
    document.body.innerHTML = '<div id="root"></div>';
    w.localStorage.clear();
    for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
    fake.calls = [];
    for (const key of ['preview', 'workbook', 'confirm', 'cardPreview', 'cardConfirm', 'statementPreview']) fake[key] = null;
    fake.people = (method, url, payload) => server.handle(method, url, payload);
    globalThis.__toasts = [];
    globalThis.__defaultHousehold = household ? household.id : undefined;
    globalThis.__household = household ?? undefined;
    globalThis.__accountsPayload = { accounts: clone(ACCOUNTS), totals: [] };
    globalThis.__categoriesPayload = [];
    globalThis.__transactionsFor = undefined;
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    const counters = { closed: 0, edited: [], settled: [], deleted: 0 };
    const callbacks = {
      onClose: () => { counters.closed += 1; },
      onEdit: (p) => counters.edited.push(p.id),
      onSettle: (p) => counters.settled.push(p.id),
      onDeleted: () => { counters.deleted += 1; },
    };
    const tree = () => {
      const el = B.createElement(B.QueryClientProvider, { client: qc }, render(callbacks));
      return strict ? B.createElement(B.StrictMode, null, el) : el;
    };
    await B.act(async () => { root.render(tree()); });
    await flush(30);
    current = { root, qc, server, counters, rerender: async () => { await B.act(async () => { root.render(tree()); }); await flush(10); } };
    return current;
  }
  async function unmount() {
    if (!current) return;
    const { root } = current;
    current = null;
    await B.act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
  /** Every people scenario unmounts its own tree, failing or not. */
  const ps = (name, fn) => scenario(name, async () => {
    try { await fn(); } finally { await unmount(); }
  });

  // ---- DOM helpers ------------------------------------------------------------------------------------------
  async function typeInto(el, value) {
    assert.ok(el, 'input missing');
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    await B.act(async () => { setter.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })); });
    await flush(5);
  }
  async function changeSelect(el, value) {
    assert.ok(el, 'select missing');
    await B.act(async () => { el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); });
    await flush(10);
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
  const byId = (id) => document.getElementById(id);
  const labelled = (re) => all('[aria-label]').find((e) => re.test(e.getAttribute('aria-label') ?? ''));
  const calls = (method, urlRe) => fake.calls.filter((c) => c.kind === 'people' && c.method === method && urlRe.test(c.url));
  const toasts = () => globalThis.__toasts ?? [];
  const backdrop = () => all('div[aria-hidden="true"]').find((d) => d.className.includes('bg-black/40'));
  const dd = (label, root = document) => [...root.querySelectorAll('dt')].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent ?? null;
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const H = {
    B, w, fake, scenario: ps, flush, all, btn, bodyText, click, typeInto, changeSelect, toggle, pressEscape, byId, labelled, calls, toasts, backdrop, dd,
    mountWith, newServer, unmount, clone, ANA, BIA, CAIO, OLD, TXS, ACCOUNTS, get current() { return current; },
  };

  // =====================================================================================================================
  // Dividir
  // =====================================================================================================================

  const mountDivide = (server, { transaction = { id: 't-super', description: 'Mercado Central', amount: 100 }, readOnly = false, strict = false } = {}) =>
    mountWith(server, (cb) => B.createElement(B.DivideDialog, { open: true, onClose: cb.onClose, householdId: 'h1', transaction, readOnly }), { strict });
  const personSelects = () => all('select').filter((s) => /^divide-person-/.test(s.id));
  const inputsByPrefix = (prefix) => all('input').filter((i) => i.id.startsWith(prefix));
  const partCell = (n) => document.querySelector(`p[aria-label="Parte ${n}"]`)?.textContent;
  const summary = () => document.querySelector('dl[aria-label="Resumo da divisão"]');
  const saveBtn = () => btn(/^(Salvar divisão|Remover as partes|Salvando…)$/);
  const putCalls = () => calls('PUT', /\/shares$/);
  const previewCalls = () => calls('POST', /\/shares\/preview$/);

  async function setRowPerson(index, personId) { await changeSelect(personSelects()[index], personId); }
  async function pickStrategy(strategy) { await changeSelect(byId('divide-strategy'), strategy); }

  ps('P-D1 opens on the stored division: exact values, "sua parte" from the server amount', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountDivide(server);
    assert.equal(byId('divide-strategy').value, 'exact');
    assert.equal(byId('divide-direction').value, 'THEY_OWE_ME');
    assert.equal(personSelects()[0].value, 'p-ana');
    assert.equal(inputsByPrefix('divide-amount-')[0].value, '30,00');
    assert.equal(partCell(1), 'R$ 30.00');
    assert.equal(dd('Valor da transação', summary()), 'R$ 100.00');
    assert.equal(dd('Sua parte', summary()), 'R$ 70.00');
    assert.equal(putCalls().length, 0, 'opening writes nothing');
    assert.match(bodyText(), /Mercado Central/);
  });

  ps('P-D2 equal: me + the people, remainder to the first; PUT carries only the strategy and the people', async () => {
    const server = newServer();
    await mountDivide(server);
    assert.equal(byId('divide-strategy').value, 'equal', 'no stored division: the quick split');
    await setRowPerson(0, 'p-ana');
    await click(btn(/^Adicionar pessoa$/));
    await setRowPerson(1, 'p-bia');
    assert.equal(partCell(1), 'R$ 33.34');
    assert.equal(partCell(2), 'R$ 33.33');
    assert.equal(dd('Dividido (elas te devem)', summary()), 'R$ 66.67');
    assert.equal(dd('Sua parte', summary()), 'R$ 33.33');
    await click(saveBtn());
    await flush(20);
    const [put] = putCalls();
    assert.equal(putCalls().length, 1);
    assert.equal(put.url, '/transactions/t-super/shares');
    assert.deepEqual(put.payload, { direction: 'THEY_OWE_ME', strategy: 'equal', entries: [{ personId: 'p-ana' }, { personId: 'p-bia' }] });
    assert.deepEqual(server.sharesOf('t-super').shares.map((s) => [s.personId, s.amount]), [['p-ana', 33.34], ['p-bia', 33.33]], 'the server agrees with the preview');
    assert.deepEqual(toasts().at(-1), ['success', 'Divisão salva. Sua parte: R$ 33,33.']);
    assert.equal(current.counters.closed, 1);
  });

  ps('P-D3 percent: of the total, the rest is mine; PUT carries percent', async () => {
    const server = newServer();
    await mountDivide(server);
    await pickStrategy('percent');
    await setRowPerson(0, 'p-ana');
    await typeInto(inputsByPrefix('divide-percent-')[0], '33,33');
    assert.equal(partCell(1), 'R$ 33.33');
    assert.equal(dd('Sua parte', summary()), 'R$ 66.67');
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(putCalls()[0].payload, { direction: 'THEY_OWE_ME', strategy: 'percent', entries: [{ personId: 'p-ana', percent: 33.33 }] });
  });

  ps('P-D4 shares: my shares count; PUT carries shares and myShares', async () => {
    const server = newServer();
    await mountDivide(server);
    await pickStrategy('shares');
    assert.ok(byId('divide-my-shares'), 'my shares field only for this strategy');
    await setRowPerson(0, 'p-ana');
    await click(btn(/^Adicionar pessoa$/));
    await setRowPerson(1, 'p-bia');
    await typeInto(inputsByPrefix('divide-shares-')[0], '2');
    assert.equal(partCell(1), 'R$ 50.00');
    assert.equal(partCell(2), 'R$ 25.00');
    assert.equal(dd('Sua parte', summary()), 'R$ 25.00');
    await typeInto(byId('divide-my-shares'), '2');
    assert.equal(partCell(1), 'R$ 40.00', 'denominator 5');
    await typeInto(byId('divide-my-shares'), '1');
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(putCalls()[0].payload, {
      direction: 'THEY_OWE_ME', strategy: 'shares', entries: [{ personId: 'p-ana', shares: 2 }, { personId: 'p-bia', shares: 1 }], myShares: 1,
    });
  });

  ps('P-D5 exact: parts above the transaction are refused, nothing is sent; exactly the total is fine', async () => {
    const server = newServer();
    await mountDivide(server);
    await pickStrategy('exact');
    await setRowPerson(0, 'p-ana');
    await click(btn(/^Adicionar pessoa$/));
    await setRowPerson(1, 'p-bia');
    const [a, b] = inputsByPrefix('divide-amount-');
    await typeInto(a, '60,00');
    await typeInto(b, '50,00');
    assert.match(bodyText(), /As partes somam R\$ 110,00, mais que o valor da transação \(R\$ 100,00\)\./);
    assert.ok(saveBtn().disabled);
    await click(saveBtn());
    assert.equal(putCalls().length, 0);
    await typeInto(b, '40');
    assert.ok(!saveBtn().disabled);
    assert.equal(dd('Sua parte', summary()), 'R$ 0.00');
  });

  ps('P-D6 a person already in the division is not offered again on the other rows', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    await click(btn(/^Adicionar pessoa$/));
    const second = personSelects()[1];
    assert.ok(![...second.options].some((o) => o.value === 'p-ana'), 'Ana is taken');
    assert.ok([...second.options].some((o) => o.value === 'p-bia'));
    assert.ok(![...second.options].some((o) => o.value === 'p-old'), 'inactive people are not offered');
  });

  ps('P-D7 "Conferir no servidor": same parts -> confirmed; different parts -> the warning and "usar os valores do servidor"', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    await click(btn(/^Conferir no servidor$/));
    await flush(20);
    assert.equal(previewCalls().length, 1);
    assert.deepEqual(previewCalls()[0].payload, { direction: 'THEY_OWE_ME', strategy: 'equal', entries: [{ personId: 'p-ana' }] });
    assert.match(bodyText(), /Conferido: o servidor calcula as mesmas partes\./);
    server.override((m, u) => m === 'POST' && /shares\/preview/.test(u), async () => ({ status: 200, body: { success: true, data: { shares: [{ personId: 'p-ana', amount: 50.01 }], myPart: 49.99 } } }));
    await click(btn(/^Conferir no servidor$/));
    await flush(20);
    assert.match(bodyText(), /O servidor calcula diferente/);
    assert.match(bodyText(), /Ana: servidor R\$ 50\.01, aqui R\$ 50\.00/);
    await click(btn(/^Usar os valores do servidor$/));
    assert.equal(byId('divide-strategy').value, 'exact');
    assert.equal(inputsByPrefix('divide-amount-')[0].value, '50,01');
    assert.doesNotMatch(bodyText(), /O servidor calcula diferente/, 'the answer belonged to the old draft');
    assert.doesNotMatch(bodyText(), /Conferido/, 'and it is not reused for the new draft either');
    assert.equal(putCalls().length, 0, 'checking never saves');
  });

  ps('P-D8 latest wins: a server check answering after the draft changed is dropped', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    const gate = server.gate((m, u) => m === 'POST' && /shares\/preview/.test(u));
    await click(btn(/^Conferir no servidor$/));
    await flush(5);
    assert.ok(btn(/^Conferindo…$/), 'in flight');
    await setRowPerson(0, 'p-bia');
    assert.ok(btn(/^Conferir no servidor$/), 'editing frees the button');
    gate.ok();
    await flush(30);
    assert.doesNotMatch(bodyText(), /Conferido|servidor calcula/);
  });

  ps('P-D9 "Limpar divisão" asks first ("Remover todas as partes?"), then removes both directions: one PUT with no entries per direction', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30, 'THEY_OWE_ME');
    server.addShare('t-super', 'p-bia', 10, 'I_OWE_THEM');
    await mountDivide(server);
    await click(btn(/^Limpar divisão$/));
    assert.match(bodyText(), /Remover todas as partes\?/);
    assert.equal(putCalls().length, 0, 'asking removes nothing');
    await click(btn(/^Manter$/));
    assert.ok(!labelled(/^Confirmar limpeza$/), 'kept: the question goes away');
    assert.equal(putCalls().length, 0);
    await click(btn(/^Limpar divisão$/));
    await click(btn(/^Remover$/));
    await flush(20);
    assert.deepEqual(putCalls().map((c) => c.payload), [
      { direction: 'THEY_OWE_ME', strategy: 'exact', entries: [] }, { direction: 'I_OWE_THEM', strategy: 'exact', entries: [] },
    ]);
    assert.equal(server.sharesOf('t-super').shares.length, 0);
    assert.deepEqual(toasts().at(-1), ['success', 'Divisão removida.']);
    assert.equal(current.counters.closed, 1);
  });

  ps('P-D10 no closing while the PUT is in flight (ESC, backdrop, X, Cancelar); it closes when the save succeeds', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    const gate = server.gate((m) => m === 'PUT');
    await click(saveBtn());
    await flush(5);
    assert.ok(btn(/^Salvando…$/));
    await pressEscape();
    await click(backdrop());
    await click(btn(/^Fechar modal$/));
    assert.ok(btn(/^Fechar modal$/).disabled);
    assert.ok(btn(/^Cancelar$/).disabled);
    assert.equal(current.counters.closed, 0, 'nothing closed it');
    await click(btn(/^Salvando…$/));
    assert.equal(putCalls().length, 1, 'no second PUT');
    gate.ok();
    await flush(30);
    assert.equal(current.counters.closed, 1);
  });

  ps('P-D20 Tab and Shift+Tab stay inside the dialog: from the last control back to the first, from the first to the last, from outside in', async () => {
    const server = newServer();
    await mountDivide(server);
    const panel = document.querySelector('[role="dialog"]');
    const tabbables = () => [...panel.querySelectorAll('a[href], button, input, select, textarea')].filter((e) => !e.disabled && e.type !== 'hidden');
    const pressTab = async (shiftKey) => {
      const ev = new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      await B.act(async () => { w.dispatchEvent(ev); });
      return ev.defaultPrevented;
    };
    const items = tabbables();
    assert.ok(items.length > 2, 'the dialog has controls to cycle through');
    const first = items[0];
    const last = items[items.length - 1];

    last.focus();
    assert.equal(await pressTab(false), true, 'Tab on the last control is taken over');
    assert.ok(document.activeElement === first, 'and wraps to the first');
    assert.equal(await pressTab(true), true, 'Shift+Tab on the first control is taken over');
    assert.ok(document.activeElement === last, 'and wraps to the last');

    items[1].focus();
    assert.equal(await pressTab(false), false, 'in the middle the browser moves the focus itself');
    assert.ok(document.activeElement === items[1]);

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    assert.ok(document.activeElement === outside, 'focus is outside the dialog');
    assert.equal(await pressTab(false), true, 'focus outside the dialog is pulled back in');
    assert.ok(panel.contains(document.activeElement));
    outside.remove();
  });

  ps('P-D11 a failed save keeps the dialog open and the draft, shows the error and allows another try', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    server.failNext((m) => m === 'PUT', Object.assign(new Error('Falha de rede'), { status: 500 }));
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(toasts().at(-1), ['error', 'Falha de rede']);
    assert.equal(current.counters.closed, 0);
    assert.ok(!saveBtn().disabled);
    assert.equal(personSelects()[0].value, 'p-ana');
    await click(saveBtn());
    await flush(20);
    assert.equal(putCalls().length, 2);
    assert.equal(current.counters.closed, 1);
  });

  ps('P-D12 switching the direction shows the stored division of that direction; the other one is left alone', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30, 'THEY_OWE_ME');
    server.addShare('t-super', 'p-bia', 10, 'I_OWE_THEM');
    await mountDivide(server);
    assert.match(bodyText(), /também tem 1 parte no outro sentido \(Bia R\$ 10\.00\)/);
    await changeSelect(byId('divide-direction'), 'I_OWE_THEM');
    assert.equal(personSelects()[0].value, 'p-bia');
    assert.equal(inputsByPrefix('divide-amount-')[0].value, '10,00');
    assert.match(bodyText(), /\(Ana R\$ 30\.00\)/);
    assert.equal(dd('Você deve', summary()), 'R$ 10.00');
    await typeInto(inputsByPrefix('divide-amount-')[0], '20');
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(putCalls()[0].payload, { direction: 'I_OWE_THEM', strategy: 'exact', entries: [{ personId: 'p-bia', amount: 20 }] });
    assert.deepEqual(server.sharesOf('t-super').shares.map((s) => [s.personId, s.direction, s.amount]), [['p-ana', 'THEY_OWE_ME', 30], ['p-bia', 'I_OWE_THEM', 20]]);
    assert.deepEqual(toasts().at(-1), ['success', 'Divisão salva. Você deve R$ 20,00.'], 'the other direction says what I owe, not sua parte');
  });

  ps('P-D13 a new person from the row: the form opens above, the created person is selected', async () => {
    const server = newServer();
    await mountDivide(server);
    await changeSelect(personSelects()[0], '__new__');
    assert.ok(byId('person-name'), 'person form open');
    await typeInto(byId('person-name'), 'Duda');
    // The people lists refetch after the create: hold them, the new person must be selectable before they answer.
    const holds = [server.gate((m, u) => m === 'GET' && u === '/people'), server.gate((m, u) => m === 'GET' && u === '/people')];
    await click(btn(/^Salvar$/));
    await flush(30);
    const [post] = calls('POST', /^\/people$/);
    assert.deepEqual(post.payload, { householdId: 'h1', name: 'Duda', aliases: [] });
    assert.ok(!byId('person-name'), 'form closed');
    const created = server.state.people.find((p) => p.name === 'Duda');
    assert.equal(personSelects()[0].value, created.id, 'selected at once, before the people list refetched');
    assert.equal(personSelects()[0].selectedOptions[0].textContent, 'Duda', 'with her name, not a placeholder');
    assert.equal(partCell(1), 'R$ 50.00');
    assert.equal(current.counters.closed, 0, 'the division dialog stayed');
    for (const hold of holds) hold.ok();
    await flush(20);
    assert.equal(personSelects()[0].selectedOptions[0].textContent, 'Duda', 'and still after the lists answered');
  });

  ps('P-D14 removing every row removes the stored shares of the direction; with nothing stored there is nothing to remove', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountDivide(server);
    await click(labelled(/^Remover pessoa 1$/));
    assert.equal(saveBtn().textContent, 'Remover as partes');
    assert.ok(!saveBtn().disabled);
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(putCalls()[0].payload, { direction: 'THEY_OWE_ME', strategy: 'exact', entries: [] });
    await unmount();
    const empty = newServer();
    await mountDivide(empty);
    await click(labelled(/^Remover pessoa 1$/));
    assert.ok(saveBtn().disabled, 'nothing stored: nothing to remove');
  });

  ps('P-D15 switching strategy keeps the computed parts (equal -> exact)', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    await click(btn(/^Adicionar pessoa$/));
    await setRowPerson(1, 'p-bia');
    await pickStrategy('exact');
    assert.deepEqual(inputsByPrefix('divide-amount-').map((i) => i.value), ['33,34', '33,33']);
    await pickStrategy('percent');
    assert.deepEqual(inputsByPrefix('divide-percent-').map((i) => i.value), ['33,34', '33,33']);
  });

  ps('P-D16 the server amount is the total (the list row said something else)', async () => {
    const server = newServer();
    await mountDivide(server, { transaction: { id: 't-super', description: 'Mercado Central', amount: 90 } });
    assert.equal(dd('Valor da transação', summary()), 'R$ 100.00');
  });

  ps('P-D17 read only (viewer): the division is visible, nothing can be changed or saved', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountDivide(server, { readOnly: true });
    assert.equal(partCell(1), 'R$ 30.00');
    assert.ok(personSelects()[0].disabled && byId('divide-strategy').disabled);
    assert.ok(!btn(/^Salvar divisão$/) && !btn(/^Remover as partes$/) && !btn(/^Limpar divisão$/) && !btn(/^Adicionar pessoa$/));
    assert.ok(btn(/^Fechar$/));
  });

  ps('P-D18 a load error is shown with a retry; nothing to edit until it loads', async () => {
    const server = newServer();
    server.failNext((m, u) => m === 'GET' && /shares$/.test(u), Object.assign(new Error('Servidor indisponível'), { status: 503 }));
    await mountDivide(server);
    assert.match(bodyText(), /Servidor indisponível/);
    assert.equal(personSelects().length, 0);
    await click(btn(/^Tentar de novo$/));
    await flush(20);
    assert.equal(personSelects().length, 1);
  });

  ps('P-D19 StrictMode: one stored division read, one draft, one PUT', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountDivide(server, { strict: true });
    assert.equal(personSelects().length, 1);
    await click(saveBtn());
    await flush(20);
    assert.equal(putCalls().length, 1);
  });

  // =====================================================================================================================
  // Settlement
  // =====================================================================================================================

  const mountSettle = (server, { person = ANA, balance = 25.4 } = {}, remembered = null) =>
    mountWith(server, (cb) => B.createElement(B.SettlementDialog, { open: true, onClose: cb.onClose, householdId: 'h1', person, balance }),
      { storage: remembered ? { 'prumo.people.settlementAccount': JSON.stringify(remembered) } : {} });
  const settleBtn = () => btn(/^(Registrar acerto|Registrando…)$/);
  const settlePosts = () => calls('POST', /\/settlements$/);
  const mode = (value) => all('input[type=radio]').find((r) => r.value === value);

  ps('P-S1 defaults from the balance: she owes me -> RECEIVED with the balance; I owe her -> PAID', async () => {
    await mountSettle(newServer(), { balance: 25.4 });
    assert.equal(byId('settle-direction').value, 'RECEIVED');
    assert.equal(byId('settle-amount').value, '25,40');
    assert.equal(byId('settle-description').value, 'Acerto recebido de Ana');
    assert.ok(mode('create').checked);
    assert.match(bodyText(), /Ana te deve R\$ 25,40/);
    assert.match(bodyText(), /Saldo depois do acerto: Quite com Ana\./);
    assert.deepEqual([...byId('settle-account').options].map((o) => o.value), ['', 'acc-main', 'acc-sav'], 'no credit card, no inactive account');
    assert.equal(byId('settle-account').value, '', 'nothing remembered: no account is guessed');
    assert.ok(settleBtn().disabled, 'and the button waits for one');
    assert.match(bodyText(), /Escolha a conta\./);
    await unmount();
    await mountSettle(newServer(), { balance: -8 });
    assert.equal(byId('settle-direction').value, 'PAID');
    assert.equal(byId('settle-amount').value, '8,00');
    assert.equal(byId('settle-description').value, 'Acerto pago a Ana');
    assert.match(bodyText(), /Você deve R\$ 8,00 a Ana/);
  });

  ps('P-S2 create the real transaction: POST carries createTransaction, not transactionId; the account is remembered', async () => {
    const server = newServer();
    await mountSettle(server);
    await changeSelect(byId('settle-account'), 'acc-sav');
    await click(settleBtn());
    await flush(20);
    const [post] = settlePosts();
    assert.equal(settlePosts().length, 1);
    assert.equal(post.url, '/people/p-ana/settlements');
    assert.deepEqual(post.payload, {
      householdId: 'h1', direction: 'RECEIVED', amount: 25.4, date: todayIso(), createTransaction: { accountId: 'acc-sav', description: 'Acerto recebido de Ana' },
    });
    const created = server.state.transactions.find((t) => t.id.startsWith('tx-settle-'));
    assert.equal(created.type, 'INCOME');
    assert.equal(created.accountId, 'acc-sav');
    assert.deepEqual(JSON.parse(w.localStorage.getItem('prumo.people.settlementAccount')), { h1: 'acc-sav' });
    assert.match(toasts().at(-1)[1], /Acerto registrado\. A receita foi lançada na conta\./);
    assert.equal(current.counters.closed, 1);
    assert.equal(server.balanceOf('p-ana').balance, -25.4, 'the fake balance moved (the ledger the page shows next)');
  });

  ps('P-S3 only the account remembered for THIS household is preselected, and only while it still exists', async () => {
    const server = newServer();
    await mountSettle(server, {}, { h1: 'acc-sav', h2: 'acc-main' });
    assert.equal(byId('settle-account').value, 'acc-sav');
    assert.ok(!settleBtn().disabled);
    await unmount();
    await mountSettle(server, {}, { h1: 'acc-gone' });
    assert.equal(byId('settle-account').value, '', 'a remembered account that no longer exists: none');
    await unmount();
    await mountSettle(server, {}, { h1: 'acc-card' });
    assert.equal(byId('settle-account').value, '', 'a credit card is not a destination');
    await unmount();
    await mountSettle(server, {}, { h2: 'acc-sav' });
    assert.equal(byId('settle-account').value, '', 'another household remembered its own');
  });

  ps('P-S4 link an existing transaction: candidates by type and search, POST carries transactionId only', async () => {
    const server = newServer();
    await mountSettle(server, { balance: 55 });
    globalThis.__transactionsFor = (params) => ({
      data: [{ id: 't-refund', description: 'Reembolso Ana', amount: 55, date: '2026-10-08T00:00:00.000Z', type: 'INCOME' }, { id: 't-other', description: 'Pix Ana', amount: 40, date: '2026-10-09', type: 'INCOME' }]
        .filter((t) => !params.search || t.description.toLowerCase().includes(params.search.toLowerCase())),
      pagination: { nextCursor: null, hasMore: false },
    });
    assert.equal(fake.calls.filter((c) => c.kind === 'transactions-list').length, 0, 'candidates are only fetched in link mode');
    await click(mode('link'));
    await flush(20);
    const listCall = fake.calls.filter((c) => c.kind === 'transactions-list').at(-1);
    assert.deepEqual({ ...listCall.params }, { householdId: 'h1', type: 'INCOME', search: 'Ana', limit: 25 });
    assert.ok(settleBtn().disabled, 'a transaction must be chosen');
    assert.match(bodyText(), /Escolha a transação a vincular\./);
    assert.deepEqual([...byId('settle-transaction').options].map((o) => o.value), ['', 't-refund', 't-other']);
    await changeSelect(byId('settle-transaction'), 't-refund');
    assert.ok(!settleBtn().disabled);
    await click(settleBtn());
    await flush(20);
    assert.deepEqual(settlePosts()[0].payload, { householdId: 'h1', direction: 'RECEIVED', amount: 55, date: todayIso(), transactionId: 't-refund' });
    assert.equal(server.state.settlements[0].transactionId, 't-refund');
    assert.equal(server.state.transactions.filter((t) => t.id.startsWith('tx-settle-')).length, 0, 'no transaction created');
    assert.equal(current.counters.closed, 1);
  });

  ps('P-S5 linking: the candidates of a PAID settlement are expenses; a different amount offers the transaction value', async () => {
    const server = newServer();
    await mountSettle(server, { balance: -8 });
    globalThis.__transactionsFor = () => ({ data: [{ id: 't-pix', description: 'Pix para Ana', amount: 10.5, date: '2026-10-09', type: 'EXPENSE' }], pagination: { nextCursor: null, hasMore: false } });
    await click(mode('link'));
    await flush(20);
    assert.equal(fake.calls.filter((c) => c.kind === 'transactions-list').at(-1).params.type, 'EXPENSE');
    await changeSelect(byId('settle-transaction'), 't-pix');
    assert.match(bodyText(), /A transação é de R\$ 10\.50 e o acerto de R\$ 8\.00\./);
    await click(btn(/^Usar o valor da transação$/));
    assert.equal(byId('settle-amount').value, '10,50');
    assert.doesNotMatch(bodyText(), /A transação é de/);
  });

  ps('P-S6 only register the settlement: no transaction field in the body; the note is trimmed', async () => {
    const server = newServer();
    await mountSettle(server);
    await click(mode('none'));
    await typeInto(byId('settle-note'), '  pix de outubro ');
    await click(settleBtn());
    await flush(20);
    assert.deepEqual(settlePosts()[0].payload, { householdId: 'h1', direction: 'RECEIVED', amount: 25.4, date: todayIso(), note: 'pix de outubro' });
    assert.equal(w.localStorage.getItem('prumo.people.settlementAccount'), null, 'no account used: none remembered');
  });

  ps('P-S7 validation: amount > 0, a valid date, an account in create mode; the button follows', async () => {
    const server = newServer();
    await mountSettle(server, { balance: 0 });
    assert.equal(byId('settle-amount').value, '', 'no balance: no suggestion');
    assert.ok(settleBtn().disabled);
    await typeInto(byId('settle-amount'), '0');
    assert.match(bodyText(), /Informe um valor maior que zero\./);
    await typeInto(byId('settle-amount'), '12,5');
    assert.ok(settleBtn().disabled, 'still no account');
    await changeSelect(byId('settle-account'), 'acc-main');
    assert.ok(!settleBtn().disabled);
    await typeInto(byId('settle-date'), '');
    assert.match(bodyText(), /Informe uma data válida\./);
    assert.ok(settleBtn().disabled);
    await typeInto(byId('settle-date'), '2026-10-05');
    await changeSelect(byId('settle-account'), '');
    assert.match(bodyText(), /Escolha a conta\./);
    assert.ok(settleBtn().disabled);
    await click(settleBtn());
    assert.equal(settlePosts().length, 0);
  });

  ps('P-S8 a failure keeps the form with the error; no double POST while saving and no closing', async () => {
    const server = newServer();
    await mountSettle(server);
    await changeSelect(byId('settle-account'), 'acc-main');
    server.failNext((m, u) => m === 'POST' && /settlements$/.test(u), Object.assign(new Error('Transação já ligada'), { status: 409 }));
    await click(settleBtn());
    await flush(20);
    assert.match(bodyText(), /Transação já ligada/);
    assert.deepEqual(toasts().at(-1), ['error', 'Transação já ligada']);
    assert.equal(current.counters.closed, 0);
    const gate = server.gate((m, u) => m === 'POST' && /settlements$/.test(u));
    await click(settleBtn());
    await flush(5);
    await click(btn(/^Registrando…$/));
    await pressEscape();
    await click(backdrop());
    assert.equal(settlePosts().length, 2, 'the failed one and the gated one');
    assert.equal(current.counters.closed, 0);
    gate.ok();
    await flush(30);
    assert.equal(current.counters.closed, 1);
  });

  ps('P-S9 the description follows the direction until the user edits it', async () => {
    await mountSettle(newServer());
    await changeSelect(byId('settle-direction'), 'PAID');
    assert.equal(byId('settle-description').value, 'Acerto pago a Ana');
    await typeInto(byId('settle-description'), 'Meu texto');
    await changeSelect(byId('settle-direction'), 'RECEIVED');
    assert.equal(byId('settle-description').value, 'Meu texto');
  });

  // =====================================================================================================================
  // Person form
  // =====================================================================================================================

  const mountForm = (server, person = null) =>
    mountWith(server, (cb) => B.createElement(B.PersonFormDialog, { open: true, onClose: cb.onClose, householdId: 'h1', person }));

  ps('P-F1 create: trimmed name, cleaned aliases, POST body, closes with a toast', async () => {
    const server = newServer();
    await mountForm(server);
    assert.ok(byId('person-name') && !byId('person-active'), 'no active checkbox on a new person');
    await typeInto(byId('person-name'), '  Duda ');
    await typeInto(byId('person-aliases'), 'Dudinha, dudinha ; Dudu,,');
    await click(btn(/^Salvar$/));
    await flush(20);
    assert.deepEqual(calls('POST', /^\/people$/)[0].payload, { householdId: 'h1', name: 'Duda', aliases: ['Dudinha', 'Dudu'] });
    assert.deepEqual(toasts().at(-1), ['success', 'Pessoa cadastrada.']);
    assert.equal(current.counters.closed, 1);
  });

  ps('P-F2 a name or alias of another person is refused before any request', async () => {
    await mountForm(newServer());
    await typeInto(byId('person-name'), 'ana');
    assert.match(bodyText(), /"ana" já é o nome ou apelido de Ana/);
    assert.ok(btn(/^Salvar$/).disabled);
    await typeInto(byId('person-name'), 'Duda');
    await typeInto(byId('person-aliases'), 'aninha');
    assert.match(bodyText(), /"aninha" já é o nome ou apelido de Ana/);
    await click(btn(/^Salvar$/));
    assert.equal(calls('POST', /^\/people$/).length, 0);
    await typeInto(byId('person-name'), '');
    assert.ok(btn(/^Salvar$/).disabled);
  });

  ps('P-F3 a 409 from the server (a race the client could not see) says the name is taken and stays open', async () => {
    const server = newServer();
    await mountForm(server);
    await typeInto(byId('person-name'), 'Duda');
    server.failNext((m, u) => m === 'POST' && u === '/people', Object.assign(new Error('conflito'), { status: 409 }));
    await click(btn(/^Salvar$/));
    await flush(20);
    assert.match(bodyText(), /Já existe uma pessoa com este nome ou apelido\./);
    assert.equal(current.counters.closed, 0);
  });

  ps('P-F4 edit: prefilled, PATCH carries name, aliases and isActive; editing yourself is not a conflict', async () => {
    const server = newServer();
    await mountForm(server, ANA);
    assert.equal(byId('person-name').value, 'Ana');
    assert.equal(byId('person-aliases').value, 'Aninha');
    assert.ok(byId('person-active').checked);
    assert.ok(!btn(/^Salvar$/).disabled, 'her own name and alias are not conflicts');
    await toggle(byId('person-active'));
    await click(btn(/^Salvar$/));
    await flush(20);
    const [patch] = calls('PATCH', /^\/people\/p-ana$/);
    assert.deepEqual(patch.payload, { name: 'Ana', aliases: ['Aninha'], isActive: false });
    assert.equal(server.state.people.find((p) => p.id === 'p-ana').isActive, false);
    assert.deepEqual(toasts().at(-1), ['success', 'Pessoa atualizada.']);
  });

  // =====================================================================================================================
  // Person detail: ledger pagination, undo, delete
  // =====================================================================================================================

  const mountDetail = (server, { person = ANA, canEdit = true } = {}) =>
    mountWith(server, (cb) => B.createElement(B.PersonDetail, {
      householdId: 'h1', person, balance: server.balanceOf(person.id), canEdit, onEdit: cb.onEdit, onSettle: cb.onSettle, onDeleted: cb.onDeleted,
    }));
  const ledgerRows = () => all('tr[data-entry]');
  const ledgerCalls = () => calls('GET', /\/ledger$/);
  const day = (i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;

  ps('P-L1 ledger: 25 per page with "Carregar mais", the running balance comes from the server, the button goes away at the end', async () => {
    const server = newServer();
    for (let i = 0; i < 60; i += 1) server.addSettlement('p-ana', 1, day(i), 'RECEIVED');
    await mountDetail(server);
    assert.equal(ledgerRows().length, 25);
    assert.match(bodyText(), /Mostrando 25 de 60 lançamentos/);
    assert.deepEqual(ledgerCalls().map((c) => [c.payload.limit, c.payload.cursor]), [[25, undefined]]);
    assert.equal(ledgerRows()[0].children[4].textContent, '-R$ 60,00', 'newest first (the server default): the current balance on top');
    assert.equal(ledgerRows()[24].children[4].textContent, '-R$ 36,00', 'the running balance is chronological: the 25th newest is the 36th oldest');
    const gate = server.gate((m, u) => m === 'GET' && /ledger$/.test(u));
    await click(btn(/^Carregar mais$/));
    await flush(5);
    assert.ok(btn(/^Carregando…$/).disabled, 'one page at a time');
    gate.ok();
    await flush(30);
    assert.equal(ledgerRows().length, 50);
    await click(btn(/^Carregar mais$/));
    await flush(20);
    assert.equal(ledgerRows().length, 60);
    assert.deepEqual(ledgerCalls().map((c) => c.payload.cursor), [undefined, 'c25', 'c50']);
    assert.ok(!btn(/^Carregar mais$/), 'no more pages');
    assert.match(bodyText(), /Mostrando 60 de 60 lançamentos/);
    assert.equal(ledgerRows()[59].children[4].textContent, '-R$ 1,00', 'the oldest entry ends the list');
  });

  ps('P-L2 the ledger shows shares and settlements with their labels, amounts and the balance sentence', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    server.addSettlement('p-ana', 10, '2026-10-10', 'RECEIVED');
    await mountDetail(server);
    const rows = ledgerRows();
    assert.equal(rows.length, 2);
    assert.match(rows[1].textContent, /03\/10\/2026.*Mercado Central.*de R\$ 100\.00.*Parte dela.*\+R\$ 30,00.*\+R\$ 30,00/);
    assert.match(rows[0].textContent, /10\/10\/2026.*Acerto.*Ela te pagou.*-R\$ 10,00.*\+R\$ 20,00/);
    assert.match(bodyText(), /Ana te deve R\$ 20,00/);
    assert.deepEqual(['Partes dela', 'Suas partes', 'Ela te pagou', 'Você pagou'].map((l) => dd(l)), ['R$ 30.00', 'R$ 0.00', 'R$ 10.00', 'R$ 0.00']);
  });

  ps('P-L3 undo a settlement: asks first, deletes only the settlement, refreshes the ledger', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    server.addSettlement('p-ana', 10, '2026-10-10', 'RECEIVED');
    await mountDetail(server);
    await click(labelled(/^Desfazer acerto de 10\/10\/2026$/));
    assert.match(bodyText(), /A transação vinculada não é apagada\./);
    assert.equal(calls('DELETE', /settlements/).length, 0);
    await click(btn(/^Cancelar$/));
    assert.equal(calls('DELETE', /settlements/).length, 0);
    await click(labelled(/^Desfazer acerto de 10\/10\/2026$/));
    await click(btn(/^Desfazer$/));
    await flush(30);
    assert.equal(calls('DELETE', /^\/settlements\/st-/).length, 1);
    assert.equal(ledgerRows().length, 1, 'the ledger refetched');
    assert.deepEqual(toasts().at(-1), ['success', 'Acerto desfeito. A transação vinculada continua nas contas.']);
  });

  ps('P-L4 delete: a person without data is gone (204); one with data is only deactivated (200)', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-bia', 20);
    await mountDetail(server, { person: CAIO });
    await click(btn(/^Excluir$/));
    assert.ok(labelled(/^Confirmar exclusão$/), 'confirmation first');
    assert.equal(calls('DELETE', /people/).length, 0);
    await click(labelled(/^Confirmar exclusão$/).querySelector('button'));
    await flush(30);
    assert.equal(calls('DELETE', /^\/people\/p-caio$/).length, 1);
    assert.deepEqual(toasts().at(-1), ['success', 'Pessoa excluída.']);
    assert.equal(current.counters.deleted, 1);
    assert.ok(!server.state.people.some((p) => p.id === 'p-caio'));
    await unmount();
    await mountDetail(server, { person: BIA });
    await click(btn(/^Excluir$/));
    await click(labelled(/^Confirmar exclusão$/).querySelector('button'));
    await flush(30);
    assert.deepEqual(toasts().at(-1), ['success', 'A pessoa tem divisões ou acertos: ela foi desativada em vez de excluída.']);
    assert.equal(current.counters.deleted, 0, 'still listed: she is only inactive');
    assert.equal(server.state.people.find((p) => p.id === 'p-bia').isActive, false);
  });

  ps('P-L8 opening the delete confirmation moves focus to Cancelar (the safe choice); Cancelar closes it', async () => {
    const server = newServer();
    await mountDetail(server, { person: CAIO });
    await click(btn(/^Excluir$/));
    const panel = labelled(/^Confirmar exclusão$/);
    assert.ok(panel, 'confirmation shown');
    const cancel = [...panel.querySelectorAll('button')].find((b) => /^Cancelar$/.test(b.textContent.trim()));
    assert.ok(document.activeElement === cancel, 'focus is on Cancelar');
    assert.equal(calls('DELETE', /people/).length, 0);
    await click(cancel);
    assert.ok(!labelled(/^Confirmar exclusão$/), 'closed');
  });

  ps('P-L5 a viewer sees the ledger but no actions', async () => {
    const server = newServer();
    server.addSettlement('p-ana', 10, '2026-10-10', 'RECEIVED');
    await mountDetail(server, { canEdit: false });
    assert.equal(ledgerRows().length, 1);
    for (const label of [/^Registrar acerto$/, /^Editar$/, /^Excluir$/, /^Desfazer acerto$/]) assert.ok(!btn(label), String(label));
  });

  ps('P-L6 a ledger error has a retry; an empty ledger says what to do; the actions call back', async () => {
    const server = newServer();
    server.failNext((m, u) => m === 'GET' && /ledger$/.test(u), Object.assign(new Error('Falha ao carregar'), { status: 500 }));
    await mountDetail(server);
    assert.match(bodyText(), /Falha ao carregar/);
    await click(btn(/^Tentar de novo$/));
    await flush(20);
    assert.match(bodyText(), /Nada no extrato ainda/);
    await click(btn(/^Registrar acerto$/));
    await click(btn(/^Editar$/));
    assert.deepEqual(current.counters.settled, ['p-ana']);
    assert.deepEqual(current.counters.edited, ['p-ana']);
  });

  ps('P-L7 people queries are invalidated by a settlement: the ledger shown refetches', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountDetail(server);
    assert.equal(ledgerRows().length, 1);
    server.addSettlement('p-ana', 5, '2026-10-11', 'RECEIVED');
    await B.act(async () => { await current.qc.invalidateQueries({ queryKey: ['people'] }); });
    await flush(20);
    assert.equal(ledgerRows().length, 2);
  });

  // =====================================================================================================================
  // Query invalidation (the lists the screens show must not go stale, on success AND on failure)
  // =====================================================================================================================

  const SEEDS = { people: ['people', 'seed'], transactions: ['transactions', 'seed'], accounts: ['accounts', 'seed'], dashboard: ['dashboard', 'seed'] };
  const seed = () => { for (const key of Object.values(SEEDS)) current.qc.setQueryData(key, { seeded: true }); };
  const invalidated = () => Object.fromEntries(Object.entries(SEEDS).map(([name, key]) => [name, current.qc.getQueryState(key)?.isInvalidated === true]));

  ps('P-H1 a settlement invalidates people, transactions, accounts and dashboard, on success and on failure', async () => {
    const server = newServer();
    await mountSettle(server);
    await changeSelect(byId('settle-account'), 'acc-main');
    seed();
    server.failNext((m, u) => m === 'POST' && /settlements$/.test(u), Object.assign(new Error('Falha'), { status: 500 }));
    await click(settleBtn());
    await flush(20);
    assert.deepEqual(invalidated(), { people: true, transactions: true, accounts: true, dashboard: true }, 'after a failed request');
    seed();
    assert.deepEqual(invalidated(), { people: false, transactions: false, accounts: false, dashboard: false });
    await click(settleBtn());
    await flush(20);
    assert.deepEqual(invalidated(), { people: true, transactions: true, accounts: true, dashboard: true }, 'after a successful one');
  });

  ps('P-H2 saving a division invalidates people and transactions (not accounts or the dashboard), on success and on failure', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    seed();
    server.failNext((m) => m === 'PUT', Object.assign(new Error('Falha'), { status: 500 }));
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(invalidated(), { people: true, transactions: true, accounts: false, dashboard: false }, 'after a failed request');
    seed();
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(invalidated(), { people: true, transactions: true, accounts: false, dashboard: false }, 'after a successful one');
  });

  ps('P-H3 a failed organize apply still invalidates people and transactions (it may have written part of it)', async () => {
    const server = newServer();
    await toPreviewForHooks(server);
    seed();
    server.state.organizeApply = async () => { throw Object.assign(new Error('Falha de rede'), { status: 500 }); };
    await click(btn(/^Aplicar$/));
    await flush(30);
    assert.deepEqual(invalidated(), { people: true, transactions: true, accounts: false, dashboard: false });
  });
  async function toPreviewForHooks(server) {
    server.state.organizePreview = () => ({
      proposals: [{ id: 'pr1', transactionId: 't-super', description: 'Mercado', date: '2026-10-03', transactionAmount: 100, note: '*Dividir com Ana', person: { id: 'p-ana', name: 'Ana' }, direction: 'THEY_OWE_ME', amount: 50, percent: 50, defaultSelected: true }],
      review: [], settlements: [], newPeople: [], alreadyDone: 0, warnings: [],
    });
    await mountWith(server, (cb) => B.createElement(B.OrganizeDialog, { open: true, onClose: cb.onClose, householdId: 'h1' }));
    await click(btn(/^Analisar$/));
    await flush(30);
  }

  // =====================================================================================================================
  // The People page (list, summary, detail, dialogs wired together)
  // =====================================================================================================================

  const mountPage = (server, role = 'OWNER') =>
    mountWith(server, () => B.createElement(B.PeoplePage), { household: { id: 'h1', name: 'Casa', role } });
  const personCards = () => all('section[aria-label="Pessoas"] li button');

  ps('P-G1 the page: summary (she owes me / I owe / net), a card per person, inactive ones on demand, detail on click', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    server.addShare('t-pizza', 'p-bia', 10, 'I_OWE_THEM');
    await mountPage(server);
    assert.equal(dd('Elas me devem'), 'R$ 30.00');
    assert.equal(dd('Eu devo'), 'R$ 10.00');
    assert.match(document.querySelector('dl[aria-label="Resumo dos saldos"]').textContent, /LíquidoR\$ 20\.00a receber/);
    assert.deepEqual(personCards().map((b) => b.textContent), [
      'AnaAna te deve R$ 30,001 parte cadastrada', 'BiaVocê deve R$ 10,00 a Bia1 parte cadastrada', 'CaioQuite com Caio0 partes cadastradas',
    ]);
    assert.ok(!personCards().some((b) => /Dora/.test(b.textContent)), 'inactive and settled: hidden');
    assert.match(bodyText(), /Escolha uma pessoa para ver o extrato/);
    await toggle(byId('people-show-inactive'));
    await flush(20);
    assert.ok(personCards().some((b) => /Dora/.test(b.textContent) && /inativa/.test(b.textContent)));
    assert.deepEqual(calls('GET', /^\/people$/).map((c) => c.payload.includeInactive), [undefined, true]);
    await click(personCards()[0]);
    await flush(20);
    assert.ok(document.querySelector('section[aria-label="Extrato de Ana"]'));
    assert.equal(all('tr[data-entry]').length, 1);
  });

  ps('P-G2 register a settlement from the page: the dialog starts from the balance and the page balances refresh after it', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountPage(server);
    await click(personCards()[0]);
    await flush(20);
    await click(btn(/^Registrar acerto$/));
    await flush(20);
    assert.equal(byId('settle-amount').value, '30,00');
    await changeSelect(byId('settle-account'), 'acc-main');
    await click(all('button').filter((b) => /^Registrar acerto$/.test(b.textContent.trim())).at(-1)); // the dialog's, rendered last
    await flush(40);
    assert.equal(calls('POST', /\/settlements$/).length, 1);
    assert.ok(!byId('settle-amount'), 'dialog closed');
    assert.equal(dd('Elas me devem'), 'R$ 0.00');
    assert.match(personCards()[0].textContent, /Quite com Ana/);
    assert.equal(all('tr[data-entry]').length, 2, 'the ledger of the open person refetched');
  });

  ps('P-G3 a new person from the page is selected at once; editing opens the form with her data', async () => {
    const server = newServer();
    await mountPage(server);
    await click(btn(/^Nova pessoa/)); // PageButton renders its label twice (desktop and mobile spans)
    await typeInto(byId('person-name'), 'Duda');
    await click(btn(/^Salvar$/));
    await flush(40);
    assert.ok(document.querySelector('section[aria-label="Extrato de Duda"]'), 'selected after creating');
    await click(btn(/^Editar$/));
    assert.equal(byId('person-name').value, 'Duda');
  });

  ps('P-G4 a viewer reads the page without any write action', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountPage(server, 'VIEWER');
    await click(personCards()[0]);
    await flush(20);
    for (const label of [/^Nova pessoa/, /^Organizar divisões/, /^Registrar acerto$/, /^Editar$/, /^Excluir$/]) assert.ok(!btn(label), String(label));
    assert.equal(all('tr[data-entry]').length, 1);
    await unmount();
    await mountPage(server, 'EDITOR');
    assert.ok(btn(/^Nova pessoa/) && btn(/^Organizar divisões/), 'an editor does see them (the check above is not vacuous)');
  });

  ps('P-G5 an empty household says what to do; "Organizar divisões" opens the wizard', async () => {
    const server = newServer({ people: [] });
    await mountPage(server);
    assert.match(bodyText(), /Nenhuma pessoa ainda\./);
    server.state.organizePreview = () => ({ proposals: [], review: [], settlements: [], newPeople: [], alreadyDone: 0, warnings: [] });
    await click(btn(/^Organizar divisões/));
    assert.ok(byId('organize-only-imported'), 'wizard open');
  });

  // =====================================================================================================================
  // Review round 1: hidden link id, nested ESC and scroll lock, double submits, limits, focus
  // =====================================================================================================================

  /** Two clicks in the same tick: the second arrives before React re-rendered the first one's state. */
  const twoClicks = async (el) => {
    await B.act(async () => {
      el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await flush(30);
  };

  ps('P-R1 linking: a candidate that a new search no longer offers is not chosen any more -- not shown, not validated, not sent', async () => {
    const server = newServer();
    await mountSettle(server, { balance: 55 });
    globalThis.__transactionsFor = (params) => ({
      data: [{ id: 't-refund', description: 'Reembolso Ana', amount: 55, date: '2026-10-08', type: 'INCOME' }, { id: 't-other', description: 'Pix Carla', amount: 40, date: '2026-10-09', type: 'INCOME' }]
        .filter((t) => !params.search || t.description.toLowerCase().includes(params.search.toLowerCase())),
      pagination: { nextCursor: null, hasMore: false },
    });
    await click(mode('link'));
    await flush(20);
    await changeSelect(byId('settle-transaction'), 't-refund');
    assert.ok(!settleBtn().disabled);
    await typeInto(byId('settle-search'), 'Carla');
    await flush(400);
    await flush(30);
    assert.deepEqual([...byId('settle-transaction').options].map((o) => o.value), ['', 't-other']);
    assert.equal(byId('settle-transaction').value, '', 'the select shows nothing chosen');
    assert.ok(settleBtn().disabled, 'and the button agrees');
    assert.match(bodyText(), /Escolha a transação a vincular\./);
    await click(settleBtn());
    assert.equal(settlePosts().length, 0, 'nothing is sent with an id the user no longer sees');
    await typeInto(byId('settle-search'), 'Ana');
    await flush(400);
    await flush(30);
    assert.equal(byId('settle-transaction').value, 't-refund', 'offered again: chosen again (it is still what the draft holds)');
    await click(settleBtn());
    await flush(20);
    assert.equal(settlePosts()[0].payload.transactionId, 't-refund');
  });

  ps('P-R2 ESC with the person form open above the Dividir dialog closes the form only; the page stays locked until both are gone', async () => {
    const server = newServer();
    let shown = true;
    await mountWith(server, () => (shown ? B.createElement(B.DivideDialog, { open: true, onClose: () => { shown = false; }, householdId: 'h1', transaction: { id: 't-super', description: 'Mercado Central', amount: 100 } }) : null));
    await changeSelect(personSelects()[0], '__new__');
    assert.ok(byId('person-name'));
    await pressEscape();
    await flush(20);
    assert.ok(!byId('person-name'), 'the form closed');
    assert.ok(byId('divide-strategy'), 'the Dividir dialog is still there');
    assert.equal(shown, true);
    assert.equal(document.body.style.overflow, 'hidden', 'the page is still locked behind the dialog that is left');
    await pressEscape();
    await current.rerender();
    await flush(20);
    assert.equal(shown, false, 'the second ESC closes the Dividir dialog');
    assert.equal(document.querySelectorAll('[role=dialog]').length, 0);
    assert.equal(document.body.style.overflow, '', 'page scroll unlocked');
  });

  ps('P-R3 a nested form that closes its parent first (unmount order) still leaves the page scroll unlocked', async () => {
    const server = newServer();
    let shown = true;
    await mountWith(server, () => (shown ? B.createElement(B.DivideDialog, { open: true, onClose: () => { shown = false; }, householdId: 'h1', transaction: { id: 't-super', description: 'Mercado Central', amount: 100 } }) : null));
    await changeSelect(personSelects()[0], '__new__');
    shown = false;
    await current.rerender();
    await flush(20);
    assert.equal(document.querySelectorAll('[role=dialog]').length, 0);
    assert.equal(document.body.style.overflow, '');
  });

  ps('P-R6 a double click on "Registrar acerto" sends one POST', async () => {
    const server = newServer();
    await mountSettle(server);
    await changeSelect(byId('settle-account'), 'acc-main');
    server.gate((m, u) => m === 'POST' && /settlements$/.test(u));
    await twoClicks(settleBtn());
    assert.equal(settlePosts().length, 1);
  });

  ps('P-R7 a double click on "Salvar divisão" sends one PUT', async () => {
    const server = newServer();
    await mountDivide(server);
    await setRowPerson(0, 'p-ana');
    server.gate((m, u) => m === 'PUT' && /shares$/.test(u));
    await twoClicks(saveBtn());
    assert.equal(putCalls().length, 1);
  });

  ps('P-R9 a double click on "Remover" in the clear confirmation sends one PUT per direction, not two', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30, 'THEY_OWE_ME');
    await mountDivide(server);
    await click(btn(/^Limpar divisão$/));
    server.gate((m, u) => m === 'PUT' && /shares$/.test(u));
    await twoClicks(btn(/^Remover$/));
    assert.equal(putCalls().length, 1);
  });

  ps('P-R10 the Dividir dialog caps the people at 50 (the server cap): the button goes away and says why', async () => {
    const server = newServer();
    await mountDivide(server);
    for (let i = 0; i < 49; i += 1) await click(btn(/^Adicionar pessoa$/));
    assert.equal(personSelects().length, 50);
    assert.ok(btn(/^Adicionar pessoa$/).disabled);
    assert.match(bodyText(), /Uma divisão aceita no máximo 50 pessoas\./);
  });

  ps('P-R11 shares follow the server limits: 1 to 1000 for a person, 0 to 1000 for me (0 = the people pay it all)', async () => {
    const server = newServer();
    await mountDivide(server);
    await pickStrategy('shares');
    await setRowPerson(0, 'p-ana');
    await typeInto(inputsByPrefix('divide-shares-')[0], '1001');
    assert.match(bodyText(), /Informe as cotas \(número inteiro de 1 a 1000\)\./);
    assert.ok(saveBtn().disabled);
    await typeInto(inputsByPrefix('divide-shares-')[0], '1000');
    await typeInto(byId('divide-my-shares'), '1001');
    assert.match(bodyText(), /As suas cotas devem ser um número inteiro de 0 a 1000\./);
    await typeInto(byId('divide-my-shares'), '0');
    assert.equal(partCell(1), 'R$ 100.00');
    assert.equal(dd('Sua parte', summary()), 'R$ 0.00');
    await click(saveBtn());
    await flush(20);
    assert.deepEqual(putCalls()[0].payload, { direction: 'THEY_OWE_ME', strategy: 'shares', entries: [{ personId: 'p-ana', shares: 1000 }], myShares: 0 });
    assert.equal(current.counters.closed, 1, 'the server accepted myShares 0');
  });

  ps('P-R12 the person form refuses more than 20 aliases (the server cap) before any request', async () => {
    await mountForm(newServer());
    await typeInto(byId('person-name'), 'Duda');
    await typeInto(byId('person-aliases'), Array.from({ length: 21 }, (_, i) => `Apelido ${i}`).join(', '));
    assert.match(bodyText(), /No máximo 20 apelidos\./);
    assert.ok(btn(/^Salvar$/).disabled);
    await typeInto(byId('person-aliases'), Array.from({ length: 20 }, (_, i) => `Apelido ${i}`).join(', '));
    assert.ok(!btn(/^Salvar$/).disabled);
  });

  const who = (el) => (el ? `${el.tagName.toLowerCase()}#${el.id || '-'} "${(el.textContent || '').slice(0, 24)}"` : 'null');
  ps('P-R16 focus returns to the control that opened a nested dialog (the "Nova pessoa…" select), not to the page', async () => {
    const server = newServer();
    await mountDivide(server);
    const sel = personSelects()[0];
    sel.focus();
    await changeSelect(sel, '__new__');
    await flush(20);
    assert.ok(document.activeElement === byId('person-name'), `the form takes the focus (its field); active: ${who(document.activeElement)}`);
    await pressEscape();
    await flush(20);
    assert.ok(!byId('person-name'));
    assert.ok(document.activeElement === personSelects()[0], `back on the select that opened it; active: ${who(document.activeElement)}`);
  });

  ps('P-R17 while a dialog is loading the focus is on the panel, not on "Cancelar"; when the data arrives it moves to the first field', async () => {
    const server = newServer();
    const gate = server.gate((m, u) => m === 'GET' && /shares$/.test(u));
    await mountDivide(server);
    const panel = document.querySelector('[role=dialog]');
    assert.ok(document.activeElement === panel, `loading: nothing to type in yet; active: ${who(document.activeElement)}`);
    gate.ok();
    await flush(30);
    assert.ok(document.activeElement === byId('divide-direction'), `loaded: the first field; active: ${who(document.activeElement)}`);
    // and a field the user already moved to is not taken away by later renders
    const note = inputsByPrefix('divide-note-')[0];
    note.focus();
    await typeInto(note, 'x');
    assert.ok(document.activeElement === note, who(document.activeElement));
  });

  ps('P-R18 the confirmed removal of a whole division uses the danger style', async () => {
    const server = newServer();
    server.addShare('t-super', 'p-ana', 30);
    await mountDivide(server);
    await click(btn(/^Limpar divisão$/));
    assert.match(btn(/^Remover$/).className, /bg-red-500/);
    assert.doesNotMatch(btn(/^Manter$/).className, /bg-red-500/);
  });

  ps('P-R13 focus goes into the dialog when it opens and back to the control that opened it when it closes', async () => {
    const server = newServer();
    let open = false;
    await mountWith(server, (cb) => B.createElement('div', null,
      B.createElement('button', { id: 'opener', type: 'button' }, 'Abrir'),
      B.createElement(B.SettlementDialog, { open, onClose: cb.onClose, householdId: 'h1', person: ANA, balance: 10 })));
    const opener = byId('opener');
    opener.focus();
    assert.equal(document.activeElement, opener);
    open = true;
    await current.rerender();
    await flush(20);
    const dialog = document.querySelector('[role=dialog]');
    assert.ok(dialog && dialog.contains(document.activeElement), 'focus is inside the dialog');
    open = false;
    await current.rerender();
    await flush(20);
    assert.ok(document.activeElement === opener, `and back on the opener; active: ${who(document.activeElement)}`);
  });

  registerOrganizeScenarios(H);
}
