// "Ajustar saldo": scenarios of the REAL AdjustBalanceDialog against a tiny stateful fake of POST /accounts/:id/adjust-balance
// (stubs/api.ts routes it to `fake.adjust`; the fake keeps the balances and the entries itself, written independently of the
// client). Registered by scenarios.mjs, names AJ*. Every name and amount is invented.
import assert from 'node:assert/strict';

export function registerAdjustScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click }) {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const TODAY = iso(new Date());
  const OPENING = `${new Date().getFullYear() - 1}-12-31`;

  // ---- fake server ------------------------------------------------------------------------------------------
  function createServer(accounts) {
    const state = { accounts: clone(accounts), entries: [], requests: [], held: [], failure: null };
    const cents = (reais) => Math.round(reais * 100 + (reais < 0 ? -1e-6 : 1e-6));
    const run = (url, payload) => {
      const id = /^\/accounts\/([^/]+)\/adjust-balance$/.exec(url)[1];
      const account = state.accounts.find((a) => a.id === id);
      if (!account) throw new Error('Account not found');
      if (typeof payload.newBalance !== 'number') throw new Error('newBalance must be a number');
      if (payload.date && payload.date > TODAY) throw new Error('date cannot be in the future');
      const diff = cents(payload.newBalance) - cents(account.totalBalance);
      if (diff === 0) return { success: true, data: { account: clone(account), adjustment: null } };
      account.totalBalance = payload.newBalance;
      account.balance = payload.newBalance;
      const entry = {
        id: `e${state.entries.length + 1}`, accountId: id, type: diff > 0 ? 'INCOME' : 'EXPENSE', amount: Math.abs(diff) / 100,
        date: payload.date ?? TODAY, description: payload.reason ?? 'Balance adjustment',
      };
      state.entries.push(entry);
      return { success: true, data: { account: clone(account), adjustment: entry } };
    };
    return {
      state,
      handle: (url, payload) => {
        state.requests.push({ url, payload: clone(payload) });
        if (state.failure) { const f = state.failure; state.failure = null; return Promise.reject(new Error(f)); }
        if (state.holdNext) {
          const gate = {};
          gate.promise = new Promise((resolve, reject) => { gate.release = () => { try { resolve(run(url, payload)); } catch (e) { reject(e); } }; });
          state.holdNext = false;
          state.held.push(gate);
          return gate.promise;
        }
        try { return Promise.resolve(run(url, payload)); } catch (e) { return Promise.reject(e); }
      },
      hold: () => { state.holdNext = true; },
      failNext: (message) => { state.failure = message; },
    };
  }

  const MP = { id: 'acc-mp', householdId: 'h1', name: 'Mercado Pago', type: 'CHECKING', totalBalance: 3665.04, balance: 3665.04 };
  const OTHER = { id: 'acc-other', householdId: 'h1', name: 'Carteira', type: 'CASH', totalBalance: 50, balance: 50 };

  // ---- mount ------------------------------------------------------------------------------------------------
  let current = null;
  async function mount(server, { strict = false } = {}) {
    document.body.innerHTML = '<div id="root"></div>';
    w.localStorage.clear();
    fake.calls = [];
    fake.adjust = (url, payload) => server.handle(url, payload);
    globalThis.__toasts = [];
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    const props = { open: true, accountId: MP.id, accountName: MP.name, currentBalance: MP.totalBalance };
    let closed = 0;
    const tree = () => {
      const el = B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.AdjustDialog, { ...props, onClose: () => { closed += 1; } }));
      return strict ? B.createElement(B.StrictMode, null, el) : el;
    };
    await B.act(async () => { root.render(tree()); });
    await flush(10);
    current = {
      root, qc, server, get closed() { return closed; },
      set: async (next) => { Object.assign(props, next); await B.act(async () => { root.render(tree()); }); await flush(10); },
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
  const as = (name, fn) => scenario(name, async () => { try { await fn(); } finally { await unmount(); } });

  // ---- DOM helpers ------------------------------------------------------------------------------------------
  const byId = (id) => document.getElementById(id);
  async function typeInto(el, value) {
    assert.ok(el, 'input missing');
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    await B.act(async () => { setter.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })); });
    await flush(5);
  }
  async function pressEscape() {
    await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush(5);
  }
  const confirmBox = () => document.querySelector('input[type="checkbox"]');
  const submitBtn = () => btn(/^(Ajustar saldo|Ajustando…)$/);
  const alerts = () => all('[role="alert"]').map((e) => e.textContent);
  const adjustCalls = () => fake.calls.filter((c) => c.kind === 'adjust');
  const toasts = () => globalThis.__toasts ?? [];
  const backdrop = () => all('div[aria-hidden="true"]').find((d) => d.className.includes('bg-black/40'));
  async function fill(typed, { date, reason, confirm = true } = {}) {
    await typeInto(byId('adjust-target'), typed);
    if (date !== undefined) await typeInto(byId('adjust-date'), date);
    if (reason !== undefined) await typeInto(byId('adjust-reason'), reason);
    if (confirm) await click(confirmBox());
  }

  // ---- scenarios --------------------------------------------------------------------------------------------
  as('AJ1 opens blank: the balance, an empty target, today, the default reason; nothing can be sent yet', async () => {
    const server = createServer([MP]);
    await mount(server);
    assert.match(bodyText(), /Ajustar saldo de Mercado Pago/);
    assert.match(bodyText(), /Saldo atual no Recta:\s*R\$ 3665\.04/);
    assert.equal(byId('adjust-target').value, '');
    assert.equal(byId('adjust-date').value, TODAY);
    assert.equal(byId('adjust-reason').value, 'Ajuste de saldo');
    assert.equal(submitBtn().disabled, true);
    assert.equal(confirmBox().disabled, true, 'nothing to confirm yet');
    assert.deepEqual(alerts(), [], 'no error before the user typed anything');
    assert.equal(adjustCalls().length, 0, 'opening writes nothing');
  });

  as('AJ2 the target is a currency mask in cents; the difference and the entry are shown; Confirm needs the checkbox', async () => {
    const server = createServer([MP]);
    await mount(server);
    await typeInto(byId('adjust-target'), '380227');
    assert.equal(byId('adjust-target').value, 'R$ 3.802,27');
    assert.match(bodyText(), /Diferença:\s*\+R\$ 137\.23/);
    assert.match(bodyText(), /Será criada uma entrada de R\$ 137\.23 em /);
    assert.match(bodyText(), /o saldo passa a ser R\$ 3802\.27/);
    assert.match(bodyText(), /Nenhuma transação ou pagamento que já existe é alterado/);
    assert.equal(submitBtn().disabled, true, 'not confirmed yet');
    await click(confirmBox());
    assert.equal(submitBtn().disabled, false);
    assert.equal(adjustCalls().length, 0);
  });

  as('AJ3 "Usar 31/12/..." fills the date and the reason becomes "Saldo inicial"; a typed reason is kept when the date changes', async () => {
    const server = createServer([MP]);
    await mount(server);
    assert.match(bodyText(), new RegExp(`use ${OPENING.split('-').reverse().join('/')}`, 'i'));
    await click(btn(/^Usar \d\d\/12\/\d{4}$/));
    assert.equal(byId('adjust-date').value, OPENING);
    assert.equal(byId('adjust-reason').value, 'Saldo inicial');
    await typeInto(byId('adjust-date'), TODAY);
    assert.equal(byId('adjust-reason').value, 'Ajuste de saldo', 'the default follows the date');
    await typeInto(byId('adjust-reason'), 'Conferido no app do banco');
    await click(btn(/^Usar \d\d\/12\/\d{4}$/));
    assert.equal(byId('adjust-reason').value, 'Conferido no app do banco', 'a reason the user typed is never overwritten');
  });

  as('AJ4 submit: ONE request with the exact body (cents / 100, date, reason), a success toast, the dialog closes', async () => {
    const server = createServer([MP]);
    await mount(server);
    await click(btn(/^Usar \d\d\/12\/\d{4}$/));
    await fill('380227');
    await click(submitBtn());
    await flush(20);
    assert.equal(adjustCalls().length, 1);
    assert.equal(adjustCalls()[0].url, '/accounts/acc-mp/adjust-balance');
    assert.deepEqual(adjustCalls()[0].payload, { newBalance: 3802.27, date: OPENING, reason: 'Saldo inicial' });
    assert.deepEqual(server.state.entries.map((e) => [e.type, e.amount, e.date]), [['INCOME', 137.23, OPENING]], 'the fake server built one dated INCOME');
    assert.equal(toasts().at(-1)[0], 'success');
    assert.match(toasts().at(-1)[1], /uma entrada de R\$ 137\.23 em 31\/12\/\d{4}/);
    assert.equal(current.closed, 1);
    assert.equal(current.qc.getQueryState(['accounts'])?.isInvalidated ?? true, true);
  });

  as('AJ5 a lower target is an expense and goes out negative-free: body newBalance as typed, wording "saída"', async () => {
    const server = createServer([MP]);
    await mount(server);
    await fill('100000');
    assert.match(bodyText(), /Diferença:\s*-R\$ 2665\.04/);
    assert.match(bodyText(), /uma saída de R\$ 2665\.04/);
    await click(submitBtn());
    await flush(20);
    assert.deepEqual(adjustCalls()[0].payload, { newBalance: 1000, date: TODAY, reason: 'Ajuste de saldo' });
    assert.equal(server.state.entries[0].type, 'EXPENSE');
    assert.equal(server.state.entries[0].amount, 2665.04, 'a positive amount');
  });

  as('AJ6 the same balance is refused in the dialog (nothing to adjust), no confirmation, no request', async () => {
    const server = createServer([MP]);
    await mount(server);
    await typeInto(byId('adjust-target'), '366504');
    assert.match(alerts().join(' '), /não há o que ajustar/);
    assert.equal(confirmBox().disabled, true);
    assert.equal(submitBtn().disabled, true);
    assert.equal(adjustCalls().length, 0);
  });

  as('AJ7 a future date and a missing date are refused; today is fine; the date input cannot go past today', async () => {
    const server = createServer([MP]);
    await mount(server);
    assert.equal(byId('adjust-date').max, TODAY);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    await fill('380227', { date: iso(tomorrow), confirm: false });
    assert.match(alerts().join(' '), /não pode ser no futuro/);
    assert.equal(confirmBox().disabled, true);
    await typeInto(byId('adjust-date'), '');
    assert.match(alerts().join(' '), /Informe a data/);
    assert.equal(submitBtn().disabled, true);
    await typeInto(byId('adjust-date'), TODAY);
    assert.deepEqual(alerts(), []);
    assert.equal(confirmBox().disabled, false);
    assert.equal(adjustCalls().length, 0);
  });

  as('AJ8 editing anything after confirming takes the confirmation back (what is confirmed is what is sent)', async () => {
    const server = createServer([MP]);
    await mount(server);
    await fill('380227');
    assert.equal(submitBtn().disabled, false);
    await typeInto(byId('adjust-target'), 'R$ 3.802,270');
    assert.equal(confirmBox().checked, false);
    assert.equal(submitBtn().disabled, true);
    await click(confirmBox());
    await click(btn(/^Usar \d\d\/12\/\d{4}$/));
    assert.equal(confirmBox().checked, false, 'a new date needs a new confirmation');
    await click(confirmBox());
    await typeInto(byId('adjust-reason'), 'Outro motivo');
    assert.equal(confirmBox().checked, false);
    assert.equal(adjustCalls().length, 0);
  });

  as('AJ9 double submit: while the request is in flight a second click sends nothing, and ESC / backdrop / Cancelar do not close', async () => {
    const server = createServer([MP]);
    await mount(server);
    await fill('380227');
    server.hold();
    await click(submitBtn());
    await click(submitBtn());
    await click(submitBtn());
    assert.equal(adjustCalls().length, 1, 'one request');
    assert.equal(submitBtn().textContent, 'Ajustando…');
    assert.equal(byId('adjust-target').disabled, true, 'fields locked while saving');
    await pressEscape();
    await click(backdrop());
    await click(btn(/^Cancelar$/));
    assert.equal(current.closed, 0, 'not closable while saving');
    server.state.held[0].release();
    await flush(20);
    assert.equal(adjustCalls().length, 1);
    assert.equal(current.closed, 1);
    assert.equal(server.state.entries.length, 1, 'applied once');
  });

  as('AJ10 a server error keeps the dialog open with the message and a toast; a retry is one more request', async () => {
    const server = createServer([MP]);
    await mount(server);
    await fill('380227');
    server.failNext('date cannot be in the future');
    await click(submitBtn());
    await flush(20);
    assert.match(alerts().join(' '), /date cannot be in the future/);
    assert.equal(toasts().at(-1)[0], 'error');
    assert.equal(current.closed, 0);
    assert.equal(submitBtn().disabled, false, 'can try again');
    await click(submitBtn());
    await flush(20);
    assert.equal(adjustCalls().length, 2);
    assert.equal(current.closed, 1);
  });

  as('AJ11 the server answering "already at that balance" (adjustment null): honest toast, no entry, dialog closes', async () => {
    const server = createServer([MP]);
    await mount(server);
    await fill('380227');
    server.state.accounts[0].totalBalance = 3802.27; // another tab applied the same adjustment first
    await click(submitBtn());
    await flush(20);
    assert.equal(server.state.entries.length, 0);
    assert.match(toasts().at(-1)[1], /já estava com esse saldo; nada foi lançado/);
    assert.equal(current.closed, 1);
  });

  as('AJ12 latest wins: an answer that arrives after the dialog was reopened for another account changes nothing on screen', async () => {
    const server = createServer([MP, OTHER]);
    await mount(server);
    await fill('380227');
    server.hold();
    await click(submitBtn());
    await current.set({ open: false });
    await current.set({ open: true, accountId: OTHER.id, accountName: OTHER.name, currentBalance: OTHER.totalBalance });
    assert.match(bodyText(), /Ajustar saldo de Carteira/);
    assert.equal(byId('adjust-target').value, '', 'a fresh form');
    server.state.held[0].release();
    await flush(20);
    assert.equal(current.closed, 0, 'the old answer does not close the new dialog');
    assert.match(bodyText(), /Ajustar saldo de Carteira/);
    assert.deepEqual(alerts(), []);
    assert.equal(byId('adjust-target').disabled, false, 'the new form is usable');
    assert.equal(server.state.entries.length, 1, 'the first request itself still applied once');
  });

  as('AJ13 every opening starts blank and unconfirmed (nothing typed survives a close)', async () => {
    const server = createServer([MP]);
    await mount(server);
    await fill('380227', { reason: 'Algo' });
    await current.set({ open: false });
    await current.set({ open: true });
    assert.equal(byId('adjust-target').value, '');
    assert.equal(byId('adjust-reason').value, 'Ajuste de saldo');
    assert.equal(confirmBox().checked, false);
    assert.equal(submitBtn().disabled, true);
  });

  as('AJ14 StrictMode: still one request per submit', async () => {
    const server = createServer([MP]);
    await mount(server, { strict: true });
    await fill('380227');
    await click(submitBtn());
    await click(submitBtn());
    await flush(20);
    assert.equal(adjustCalls().length, 1);
  });

  as('AJ15 a negative target (overdraft) is typed with a minus sign and sent negative', async () => {
    const server = createServer([MP]);
    await mount(server);
    await typeInto(byId('adjust-target'), '-5000');
    assert.equal(byId('adjust-target').value, '-R$ 50,00');
    await click(confirmBox());
    await click(submitBtn());
    await flush(20);
    assert.equal(adjustCalls()[0].payload.newBalance, -50);
    assert.equal(server.state.entries[0].type, 'EXPENSE');
  });
}
