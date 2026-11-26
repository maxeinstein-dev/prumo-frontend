// usage: node confirm-scenarios.mjs [nameFilter]   -- the REAL ConfirmReceiptDialog (bundled by build-confirm.mjs) under jsdom, against a tiny
// stateful fake of PATCH /transactions/:id (written independently of the client: it keeps the balance and the recurrence itself,
// moves the balance once per change, answers 409 on demand). Names CF*. Every name and amount is invented.
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const req = createRequire(process.env.JSDOM_FROM || new URL('../../package.json', import.meta.url));
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
const B = await import(pathToFileURL(path.join(here, 'out', 'confirm.mjs')).href);

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = new Date(2026, 9, 6); // pinned clock: 06/10/2026
const TODAY_ISO = iso(TODAY);

// ---- fake server --------------------------------------------------------------------------------------------
function createServer({ followLast = true } = {}) {
  const state = {
    balance: 1000, requests: [], held: [], failNext: null,
    recurrence: { id: 'rec-1', amount: 600, followLastAmount: followLast },
    tx: { id: 'tx-1', type: 'INCOME', amount: 600, date: '2026-09-25', paid: false, competenceMonth: '2026-10', recurringTransactionId: 'rec-1', notes: null },
  };
  const apply = (body) => {
    const t = state.tx;
    const oldPaid = t.paid;
    const oldAmount = t.amount;
    const sign = t.type === 'INCOME' ? 1 : -1;
    const newAmount = body.amount ?? t.amount;
    if (oldPaid && body.paid !== false && newAmount !== oldAmount) state.balance += sign * (newAmount - oldAmount); // an edit of a settled row
    else if (!oldPaid && body.paid === true) state.balance += sign * newAmount; // settles once, with the amount sent now
    t.amount = newAmount;
    if (body.date) t.date = body.date;
    if (body.paid !== undefined) t.paid = body.paid;
    if (body.notes !== undefined) t.notes = body.notes;
    if (body.competenceMonth !== undefined) t.competenceMonth = body.competenceMonth;
    const out = { ...t };
    if (body.amount !== undefined && state.recurrence.followLastAmount && state.recurrence.amount !== body.amount && body.amount > 0) {
      state.recurrence.amount = body.amount;
      out.recurringUpdated = { id: 'rec-1', amount: body.amount };
    }
    return out;
  };
  return {
    state,
    patch(body) {
      state.requests.push(JSON.parse(JSON.stringify(body)));
      if (state.failNext) { const f = state.failNext; state.failNext = null; return Promise.reject(Object.assign(new Error(f.message), { status: f.status })); }
      if (state.holdNext) {
        state.holdNext = false;
        return new Promise((resolve) => state.held.push({ release: () => resolve(apply(body)) }));
      }
      return Promise.resolve(apply(body));
    },
    hold() { state.holdNext = true; },
    fail(status, message) { state.failNext = { status, message }; },
  };
}

// what the app context sends for a patch (formatDateForAPI + the notes rule), modelled here independently
const wire = (patch) => ({
  ...(patch.amount !== undefined && { amount: patch.amount }), paid: patch.paid, date: iso(patch.date),
  ...(patch.notes !== undefined && { notes: patch.notes || null }),
  ...(patch.competenceMonth !== undefined && { competenceMonth: patch.competenceMonth }),
});

// ---- mount --------------------------------------------------------------------------------------------------
let current = null;
async function mount(server, { strict = false, tx, followsLastAmount = true } = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = B.createRoot(document.getElementById('root'));
  const log = { closed: 0, confirmed: [] };
  const base = tx ?? { ...server.state.tx, description: 'Vale alimentação' };
  const props = {
    transaction: base, baseCurrency: 'BRL', followsLastAmount, today: () => TODAY,
    onConfirm: (patch) => server.patch(wire(patch)),
    onConfirmed: (info) => log.confirmed.push(info), onClose: () => { log.closed += 1; },
  };
  const tree = () => { const el = B.createElement(B.ConfirmDialog, { ...props }); return strict ? B.createElement(B.StrictMode, null, el) : el; };
  await B.act(async () => { root.render(tree()); });
  await flush(10);
  current = { root, log, props, set: async (next) => { Object.assign(props, next); await B.act(async () => { root.render(tree()); }); await flush(10); } };
  return current;
}
async function unmount() { if (!current) return; const { root } = current; current = null; await B.act(async () => { root.unmount(); }); document.body.innerHTML = ''; }

// ---- DOM helpers --------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = async (ms = 0) => { await B.act(async () => { await sleep(ms); }); };
const all = (sel) => [...document.body.querySelectorAll(sel)];
const btn = (re) => all('button').find((b) => re.test((b.textContent ?? '').trim()));
const bodyText = () => document.body.textContent ?? '';
const byId = (id) => document.getElementById(id);
async function click(el) { assert.ok(el, 'click target missing'); await B.act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); }); await flush(0); }
async function typeInto(el, value) {
  assert.ok(el, 'input missing');
  const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
  await B.act(async () => { setter.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })); });
  await flush(5);
}
async function pressEscape() { await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await flush(5); }
const submit = () => btn(/^(Confirmar recebimento|Confirmar pagamento|Confirmando…)$/);
const alerts = () => all('[role="alert"]').map((e) => e.textContent);
const hint = () => document.querySelector('[data-testid="confirm-hint"]')?.textContent ?? null;

const results = [];
const scenario = async (name, fn) => {
  if (filter && !filter.test(name)) return;
  try { await fn(); results.push([name, null]); console.log(`  ok   ${name}`); } catch (e) { results.push([name, e]); console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').slice(0, 6).join('\n       ')}`); } finally { await unmount(); }
};

// ---- scenarios ----------------------------------------------------------------------------------------------
await scenario('CF1 opens prefilled with the expected amount, today (the expected day is past) and the reference chip; nothing is sent', async () => {
  const server = createServer();
  await mount(server);
  assert.match(bodyText(), /Confirmar recebimento/);
  assert.match(bodyText(), /Vale alimentação/);
  assert.match(bodyText(), /esperado R\$ 600\.00 em 25\/09\/2026/);
  assert.match(bodyText(), /ref\. 10\/2026/);
  assert.equal(byId('confirm-amount').value, 'R$ 600.00');
  assert.equal(byId('confirm-date').value, TODAY_ISO);
  assert.equal(submit().disabled, false);
  assert.equal(hint(), null, 'no difference yet');
  assert.equal(server.state.requests.length, 0);
});

await scenario('CF2 an expense says "pagamento"', async () => {
  const server = createServer();
  await mount(server, { tx: { ...server.state.tx, type: 'EXPENSE', description: 'Conta de luz', amount: 100 } });
  assert.match(bodyText(), /Confirmar pagamento/);
  assert.match(bodyText(), /Valor pago/);
  assert.match(bodyText(), /Data do pagamento/);
});

await scenario('CF3 edited amount and date: ONE PATCH {amount, date, paid:true}; the balance moves once with the ACTUAL amount; the dialog closes', async () => {
  const server = createServer();
  await mount(server);
  await typeInto(byId('confirm-amount'), '64000');
  assert.equal(byId('confirm-amount').value, 'R$ 640.00');
  await typeInto(byId('confirm-date'), '2026-09-27');
  await click(submit());
  await flush(20);
  assert.deepEqual(server.state.requests, [{ amount: 640, paid: true, date: '2026-09-27' }]);
  assert.equal(server.state.balance, 1000 + 640);
  assert.equal(server.state.tx.competenceMonth, '2026-10', 'the reference month is untouched');
  assert.equal(current.log.closed, 1);
  assert.equal(current.log.confirmed.length, 1);
  assert.deepEqual(current.log.confirmed[0].result.recurringUpdated, { id: 'rec-1', amount: 640 }, 'the follow-last notice reaches the caller (toast)');
  assert.equal(server.state.recurrence.amount, 640);
});

await scenario('CF4 confirming as expected sends NO amount (a recurrence that follows the last amount must not adopt the stored one)', async () => {
  const server = createServer();
  server.state.recurrence.amount = 650; // the recurrence moved on since this occurrence was created
  await mount(server);
  await click(submit());
  await flush(20);
  assert.deepEqual(server.state.requests, [{ paid: true, date: TODAY_ISO }]);
  assert.equal(server.state.recurrence.amount, 650, 'the recurrence is not reverted');
  assert.equal(server.state.balance, 1000 + 600);
});

await scenario('CF5 difference hint: expected vs received, and the next occurrences when the recurrence follows the last amount', async () => {
  const server = createServer();
  await mount(server, { followsLastAmount: true });
  await typeInto(byId('confirm-amount'), '64000');
  assert.equal(hint(), 'Esperado R$ 600.00, recebido R$ 640.00; as próximas ocorrências passam a usar R$ 640.00.');
  await typeInto(byId('confirm-amount'), '60000');
  assert.equal(hint(), null, 'back to the expected amount: no hint');
  await current.set({ followsLastAmount: false });
  await typeInto(byId('confirm-amount'), '55000');
  assert.equal(hint(), 'Esperado R$ 600.00, recebido R$ 550.00.', 'no promise about next occurrences when it does not follow');
});

await scenario('CF6 double click: the second click sends nothing, fields are locked and the dialog cannot be closed while saving', async () => {
  const server = createServer();
  await mount(server);
  await typeInto(byId('confirm-amount'), '64000');
  server.hold();
  const button = submit();
  // three clicks in the same tick: the button is not disabled yet, only the in-flight guard can stop them
  await B.act(async () => { for (let i = 0; i < 3; i += 1) button.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); });
  await flush(0);
  assert.equal(server.state.requests.length, 1);
  assert.equal(submit().textContent, 'Confirmando…');
  assert.equal(byId('confirm-amount').disabled, true);
  await pressEscape();
  await click(btn(/^Cancelar$/));
  assert.equal(current.log.closed, 0);
  server.state.held[0].release();
  await flush(20);
  assert.equal(server.state.requests.length, 1);
  assert.equal(server.state.balance, 1640, 'moved once');
  assert.equal(current.log.closed, 1);
});

await scenario('CF7 409 (the row was changed at the same moment): pt-BR message, dialog stays open, nothing moved, retry is one more request', async () => {
  const server = createServer();
  await mount(server);
  await typeInto(byId('confirm-amount'), '64000');
  server.fail(409, 'A transação foi alterada por outra pessoa; recarregue e tente de novo.');
  await click(submit());
  await flush(20);
  assert.match(alerts().join(' '), /acabou de ser alterada por outra operação/);
  assert.equal(current.log.closed, 0);
  assert.equal(server.state.balance, 1000, 'nothing moved');
  assert.equal(submit().disabled, false);
  await click(submit());
  await flush(20);
  assert.equal(server.state.requests.length, 2);
  assert.equal(server.state.balance, 1640);
  assert.equal(current.log.closed, 1);
});

await scenario('CF8 another error keeps its own message', async () => {
  const server = createServer();
  await mount(server);
  server.fail(404, 'Transaction not found');
  await click(submit());
  await flush(20);
  assert.match(alerts().join(' '), /Transaction not found/);
  assert.equal(current.log.closed, 0);
});

await scenario('CF9 confirming a row the server already has paid with the same values does not move the balance again', async () => {
  const server = createServer();
  await mount(server);
  await typeInto(byId('confirm-amount'), '64000');
  await click(submit());
  await flush(20);
  assert.equal(server.state.balance, 1640);
  await unmount();
  // a stale dialog (another tab) confirms the same values again
  await mount(server, { tx: { ...server.state.tx, paid: false, amount: 600, description: 'Vale alimentação' } });
  await typeInto(byId('confirm-amount'), '64000');
  await click(submit());
  await flush(20);
  assert.equal(server.state.balance, 1640, 'no second move');
});

await scenario('CF10 validation: zero or empty amount and a missing date block the button; messages appear', async () => {
  const server = createServer();
  await mount(server);
  await typeInto(byId('confirm-amount'), '0');
  assert.equal(submit().disabled, true);
  assert.match(alerts().join(' '), /maior que zero/);
  await typeInto(byId('confirm-amount'), '');
  assert.equal(submit().disabled, true);
  await typeInto(byId('confirm-amount'), '60000');
  await typeInto(byId('confirm-date'), '');
  assert.equal(submit().disabled, true);
  assert.match(alerts().join(' '), /Informe a data/);
  assert.equal(server.state.requests.length, 0);
});

await scenario('CF11 the note is sent only when edited', async () => {
  const server = createServer();
  await mount(server);
  await typeInto(byId('confirm-note'), 'caiu no app do banco');
  await click(submit());
  await flush(20);
  assert.deepEqual(server.state.requests, [{ paid: true, date: TODAY_ISO, notes: 'caiu no app do banco' }]);
});

await scenario('CF12 reopened for another transaction: a fresh form, and a late answer of the first does not close the new dialog', async () => {
  const server = createServer();
  await mount(server);
  await typeInto(byId('confirm-amount'), '64000');
  server.hold();
  await click(submit());
  await current.set({ transaction: { id: 'tx-2', type: 'INCOME', amount: 300, date: '2026-10-01', paid: false, description: 'Outro', notes: null } });
  assert.equal(byId('confirm-amount').value, 'R$ 300.00', 'a fresh form');
  server.state.held[0].release();
  await flush(20);
  assert.equal(current.log.closed, 0);
  assert.equal(current.log.confirmed.length, 0);
});

await scenario('CF13 StrictMode: still one request per submit', async () => {
  const server = createServer();
  await mount(server, { strict: true });
  server.hold();
  await click(submit());
  await click(submit());
  await flush(20);
  assert.equal(server.state.requests.length, 1);
});

await scenario('CF14 a future expected day is kept as the default date', async () => {
  const server = createServer();
  await mount(server, { tx: { ...server.state.tx, date: '2026-10-25', description: 'Vale' } });
  assert.equal(byId('confirm-date').value, '2026-10-25');
});

await scenario('CF15 received in another month than expected: the month the row counts for does not change (500 expected 01/10, received 30/09)', async () => {
  const server = createServer();
  server.state.tx = { ...server.state.tx, amount: 500, date: '2026-10-01', competenceMonth: null };
  const effective = () => server.state.tx.competenceMonth ?? server.state.tx.date.slice(0, 7);
  assert.equal(effective(), '2026-10');
  await mount(server, { tx: { ...server.state.tx, description: 'Receita' } });
  await typeInto(byId('confirm-date'), '2026-09-30');
  assert.match(bodyText(), /Continua contando para 10\/2026/);
  await click(submit());
  await flush(20);
  assert.equal(server.state.tx.date, '2026-09-30');
  assert.equal(effective(), '2026-10', 'October total unchanged');
  assert.equal(server.state.balance, 1500, 'the balance moved by DATE, once');
  // a date in the same month shows no notice and pins nothing
  await unmount();
  const server2 = createServer();
  server2.state.tx = { ...server2.state.tx, amount: 500, date: '2026-10-01', competenceMonth: null };
  await mount(server2, { tx: { ...server2.state.tx, description: 'Receita' } });
  await typeInto(byId('confirm-date'), '2026-10-20');
  assert.doesNotMatch(bodyText(), /Continua contando/);
  await click(submit());
  await flush(20);
  assert.equal('competenceMonth' in server2.state.requests[0], false);
});

const failed = results.filter(([, e]) => e);
console.log(`\nconfirm dialog: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
