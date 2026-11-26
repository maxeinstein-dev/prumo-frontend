// usage: node scenarios.mjs <variant> [nameFilter]   -- drives the REAL dialog (bundled) under jsdom with a fake server (no network).
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { outcome, pendingReason } from '../pending.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const variant = process.argv[2] ?? 'real';
const filter = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;

// jsdom is not a dependency of Prumo: JSDOM_FROM points at any package.json whose node_modules has it.
const req = createRequire(process.env.JSDOM_FROM || new URL('../../package.json', import.meta.url));
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
globalThis.window = w;
globalThis.document = w.document;
globalThis.localStorage = w.localStorage;
globalThis.File = w.File;
globalThis.FormData = w.FormData;
globalThis.Event = w.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);

const B = await import(pathToFileURL(path.join(here, 'out', `${variant}.mjs`)).href);
const fake = (globalThis.__fake ??= { preview: null, workbook: null, confirm: null, calls: [] });

// ---- fixtures -----------------------------------------------------------------------------------------------
let line = 1;
const mkRow = (o = {}) => {
  line += 1;
  const section = o.section ?? 'credit';
  return {
    sourceLine: line, sourceRef: `maxfin:2026-09:${section}:${line}`, section, accountId: section === 'credit' ? 'acc-card' : 'acc-main',
    type: section === 'income' ? 'INCOME' : 'EXPENSE', description: `Item ${line}`, categoryKey: 'Mercado', amount: 10, planned: null, realized: null,
    paid: true, date: '2026-09-05', notes: null, flag: null, installment: null, futureInstallments: 0, shareHint: null, status: 'new',
    statusDetail: null, existingTransactionId: null, ...o,
  };
};
const CLOSED = { closedMonth: true, payInvoice: true, generateFutureInstallments: false };
const sumCents = (rows) => rows.filter((r) => r.section === 'credit' && ['new', 'changed', 'replaces-future'].includes(r.status))
  .reduce((a, r) => a + Math.round(r.amount * 100 + 1e-6), 0) / 100;
function makePreview({ rows, options = CLOSED, invoice = 'auto', month = { year: 2026, month: 9 }, warnings = [], categoryMap } = {}) {
  const inv = invoice === 'auto'
    ? { creditAccountId: 'acc-card', sourceAccountId: 'acc-main', month: '2026-09', paymentDate: '2026-10-10', amount: sumCents(rows), dueDay: 10, closingDay: 3, alreadyPaid: false, willPay: true }
    : invoice;
  return {
    month, monthKey: month ? '2026-09' : null, monthSource: month ? 'title' : 'none', householdId: 'h1',
    accounts: { income: 'acc-main', bills: 'acc-main', credit: 'acc-card', debit: 'acc-main' }, options,
    sections: [{ key: 'credit', label: 'Cartão', accountId: 'acc-card', count: rows.length, sum: sumCents(rows), sheetTotalPlanned: null, sheetTotalRealized: null, newCount: rows.filter((r) => r.status === 'new').length, duplicateCount: 0, changedCount: 0 }],
    rows, skipped: [], invoice: inv, warnings,
    categoryMap: categoryMap ?? [{ key: 'Mercado', type: 'EXPENSE', count: rows.length, sections: ['credit'], suggestion: { kind: 'default', label: 'Padrão' } }],
    totals: { rows: rows.length, new: 0, duplicate: 0, changed: 0, legacyDuplicate: 0, skipped: 0 },
  };
}
const optionsOf = (body) => { const raw = body.get('options'); return raw ? JSON.parse(raw) : null; };
/** Fake preview server: `builder(requestedOptions)` returns the preview (or throws to simulate an error). */
const servePreview = (builder) => { fake.preview = async (_u, body) => ({ data: { data: builder(optionsOf(body)) } }); };
const OK_CONFIRM = { imported: 2, skipped: 0, replaced: 0, consumedFutureInstallments: 0, futureInstallments: 0, createdCategories: [], invoicePayment: null, ids: [], warnings: [] };

// ---- DOM helpers --------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = async (ms = 0) => { await B.act(async () => { await sleep(ms); }); };
const all = (sel) => [...document.body.querySelectorAll(sel)];
const btn = (re) => all('button').find((b) => re.test((b.textContent ?? '').trim()) || re.test(b.getAttribute('aria-label') ?? ''));
const bodyText = () => document.body.textContent ?? '';
async function click(el) {
  assert.ok(el, 'click target missing');
  await B.act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); });
  await flush(0);
}
async function setFile(name = 'OUT.csv') {
  const input = document.getElementById('maxfin-file');
  assert.ok(input, 'file input missing');
  const file = new w.File(['a,b\n1,2'], name, { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await B.act(async () => { input.dispatchEvent(new w.Event('change', { bubbles: true })); });
}
const confirmCalls = () => fake.calls.filter((c) => c.kind === 'confirm');
const previewCalls = () => fake.calls.filter((c) => c.kind === 'preview');

let current = null;
async function mount({ householdId = 'h1', defaultHousehold } = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  w.localStorage.clear();
  fake.calls = []; fake.preview = null; fake.workbook = null; fake.confirm = null;
  globalThis.__toasts = [];
  globalThis.__defaultHousehold = defaultHousehold;
  globalThis.__accountsPayload = { accounts: [
    { id: 'acc-main', householdId: 'h1', name: 'Conta Principal', type: 'CHECKING', isActive: true },
    { id: 'acc-card', householdId: 'h1', name: 'Nubank', type: 'CREDIT', isActive: true },
  ], totals: [] };
  globalThis.__categoriesPayload = [];
  const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const root = B.createRoot(document.getElementById('root'));
  let closed = 0;
  const onClose = () => { closed += 1; };
  const tree = (hid = householdId, isOpen = true) => B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.Dialog, { open: isOpen, onClose, householdId: hid }));
  await B.act(async () => { root.render(tree()); });
  await flush(30);
  current = { root, qc, tree, get closed() { return closed; } };
  return current;
}
async function unmount() { if (!current) return; await B.act(async () => { current.root.unmount(); }); document.body.innerHTML = ''; current = null; }
async function toPreview(builder) {
  servePreview(builder);
  await setFile();
  const go = btn(/^Pré-visualizar$/);
  assert.ok(go && !go.disabled, 'Pré-visualizar must be enabled once file + accounts are set');
  await click(go);
  await flush(20);
  assert.ok(btn(/Confirmar importação|Confirmar e substituir/), 'preview step should show the confirm button');
}
const confirmBtn = () => btn(/Confirmar importação|Confirmar e substituir|Importando/);
const refreshBtn = () => btn(/^Atualizar pré-visualização$/);
const categorySelect = () => all('select').find((s) => /Destino para/.test(s.getAttribute('aria-label') ?? ''));
const firstRowBox = () => all('input[type=checkbox]').find((i) => /^(Importar linha|Importar e substituir)/.test(i.getAttribute('aria-label') ?? ''));

// ---- scenarios ----------------------------------------------------------------------------------------------
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// R2-1 -----------------------------------------------------------------------------------------------------------
scenario('R2-1a invoice present, closed month: notice and footer promise the payment', async () => {
  await mount();
  const rows = [mkRow({ amount: 80 }), mkRow({ amount: 20.5 })];
  await toPreview(() => makePreview({ rows }));
  const t = bodyText();
  assert.match(t, /Pagamento da fatura: R\$ 100\.50/);
  assert.match(t, /será registrado/);
  assert.match(t, /Fatura de R\$ 100\.50 será registrada\./);
  await unmount();
});
scenario('R2-1b server sent NO invoice (non-credit card account / unknown month): no payment promise anywhere', async () => {
  await mount();
  const rows = [mkRow({ amount: 80 }), mkRow({ amount: 20.5 })];
  await toPreview(() => makePreview({ rows, invoice: null, warnings: ['A conta escolhida para o cartão ("Nubank") não é um cartão de crédito; o pagamento de fatura não será registrado.'] }));
  const t = bodyText();
  assert.doesNotMatch(t, /Pagamento da fatura/, 'notice must not render');
  assert.doesNotMatch(t, /será registrad[oa]\b(?!\.)/, 'no promise of a payment');
  assert.doesNotMatch(t, /Fatura de R\$/, 'no footer promise');
  assert.match(t, /não é um cartão de crédito/, 'the server warning is still rendered');
  assert.ok(!confirmBtn().disabled, 'rows are still importable');
  await unmount();
});
scenario('R2-1c invoice present, option off: notice shown with the reason, no footer promise', async () => {
  await mount();
  const rows = [mkRow({ amount: 80 })];
  await toPreview((opts) => makePreview({ rows, options: opts ?? { ...CLOSED, payInvoice: false } }));
  const t = bodyText();
  assert.match(t, /Pagamento da fatura/);
  assert.match(t, /não será registrado \(opção desligada\)/);
  assert.doesNotMatch(t, /Fatura de R\$ .* será registrada/);
  await unmount();
});
scenario('R2-1d request body never carries an invoice field (payload is rows/options/accounts/categoryMap/month)', async () => {
  await mount();
  const rows = [mkRow({ amount: 80 })];
  await toPreview(() => makePreview({ rows, invoice: null }));
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await click(confirmBtn());
  await flush(20);
  const c = confirmCalls();
  assert.equal(c.length, 1);
  assert.deepEqual(Object.keys(c[0].payload).sort(), ['accounts', 'categoryMap', 'month', 'options', 'rows']);
  assert.equal(c[0].payload.options.payInvoice, true, 'options echo is sent as is (the server answers with its own warning)');
  await unmount();
});

// R2-2 -----------------------------------------------------------------------------------------------------------
async function failedConfirmState() {
  await mount();
  const rows = [mkRow({ amount: 80 }), mkRow({ amount: 20 })];
  await toPreview(() => makePreview({ rows }));
  fake.confirm = async () => { throw new Error('Falha de rede'); };
  await click(confirmBtn());
  await flush(20);
  return rows;
}
scenario('R2-2a after a failed confirm: Confirm disabled, needs-refresh blocker, refresh button, error alert', async () => {
  await failedConfirmState();
  const cb = confirmBtn();
  assert.ok(cb.disabled, 'Confirm must be disabled after a failed confirm');
  assert.match(bodyText(), /Atualize a pré-visualização antes de confirmar de novo\./);
  assert.match(bodyText(), /A importação pode ter sido parcial/);
  assert.ok(refreshBtn() && !refreshBtn().disabled, 'refresh button must be available');
  assert.equal(confirmCalls().length, 1);
  await unmount();
});
scenario('R2-2b clicking the disabled Confirm / no form to submit with Enter: no second request', async () => {
  await failedConfirmState();
  assert.equal(document.body.querySelectorAll('form').length, 0, 'no form: Enter cannot submit');
  await click(confirmBtn());
  const cb = confirmBtn();
  await B.act(async () => {
    cb.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cb.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
  });
  await flush(10);
  assert.equal(confirmCalls().length, 1, 'still only the first request');
  await unmount();
});
scenario('R2-2c refresh (preview ok): error cleared, Confirm enabled again with the refreshed rows (stored ones come back as duplicates)', async () => {
  const rows = await failedConfirmState();
  servePreview(() => makePreview({ rows: [{ ...rows[0], status: 'duplicate' }, rows[1]] }));
  await click(refreshBtn());
  await flush(20);
  assert.doesNotMatch(bodyText(), /A importação pode ter sido parcial/);
  assert.doesNotMatch(bodyText(), /Atualize a pré-visualização antes/);
  assert.ok(!confirmBtn().disabled, 'Confirm enabled after the refresh');
  assert.match(bodyText(), /1 linha selecionada/);
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await click(confirmBtn());
  await flush(20);
  const sent = confirmCalls().at(-1).payload.rows;
  assert.deepEqual(sent.map((r) => r.sourceRef), [rows[1].sourceRef], 'only the row that is still new is sent');
  await unmount();
});
scenario('R2-2d refresh FAILS: still blocked, can retry the refresh, can go Back (no deadlock)', async () => {
  const rows = await failedConfirmState();
  fake.preview = async () => { throw new Error('preview offline'); };
  await click(refreshBtn());
  await flush(20);
  assert.ok(confirmBtn().disabled, 'still blocked');
  assert.ok(refreshBtn() && !refreshBtn().disabled, 'refresh available again');
  assert.ok(btn(/^Voltar$/) && !btn(/^Voltar$/).disabled, 'Back available');
  servePreview(() => makePreview({ rows }));
  await click(refreshBtn());
  await flush(20);
  assert.ok(!confirmBtn().disabled, 'second refresh works and unblocks');
  await unmount();
});
scenario('R2-2e Back clears the error: a fresh preview is confirmable', async () => {
  const rows = await failedConfirmState();
  await click(btn(/^Voltar$/));
  assert.ok(btn(/^Pré-visualizar$/), 'back at the setup step');
  servePreview(() => makePreview({ rows }));
  await click(btn(/^Pré-visualizar$/));
  await flush(20);
  assert.ok(!confirmBtn().disabled);
  assert.doesNotMatch(bodyText(), /A importação pode ter sido parcial/);
  await unmount();
});
scenario('R2-2f changing an option after a failed confirm re-runs the preview and clears the error', async () => {
  const rows = await failedConfirmState();
  servePreview((opts) => makePreview({ rows, options: opts ?? CLOSED }));
  const chk = document.getElementById('maxfin-opt-invoice');
  await B.act(async () => { chk.click(); });
  await flush(20);
  assert.doesNotMatch(bodyText(), /A importação pode ter sido parcial/);
  assert.ok(!confirmBtn().disabled);
  await unmount();
});
scenario('R2-2g toggling a row after a failed confirm does NOT unblock Confirm', async () => {
  await failedConfirmState();
  const box = firstRowBox();
  await B.act(async () => { box.click(); });
  await B.act(async () => { box.click(); });
  assert.ok(confirmBtn().disabled, 'still blocked');
  await unmount();
});
scenario('R2-2h the success path is unchanged: confirm ok closes the dialog (no leftover block)', async () => {
  const m = await mount();
  await toPreview(() => makePreview({ rows: [mkRow({ amount: 80 })] }));
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await click(confirmBtn());
  await flush(20);
  assert.equal(m.closed, 1, 'onClose called once');
  assert.equal(confirmCalls().length, 1);
  await unmount();
});

// (c) replace semantics ---------------------------------------------------------------------------------------------
const replRows = () => [mkRow({ amount: 80, status: 'replaces-future', statusDetail: 'substitui' }), mkRow({ amount: 20 })];
scenario('C1 replace: first click arms, immediate second click ignored (600ms guard), later click sends replace:true', async () => {
  await mount();
  await toPreview(() => makePreview({ rows: replRows() }));
  fake.confirm = async () => ({ data: OK_CONFIRM });
  assert.match(bodyText(), /1 linha substitui dados já registrados/);
  await click(confirmBtn());
  assert.match(confirmBtn().textContent, /Confirmar e substituir 1/);
  assert.match(bodyText(), /dados que já estão registrados serão substituídos/);
  await click(confirmBtn());
  assert.equal(confirmCalls().length, 0, 'second click inside the guard window is ignored');
  assert.match(confirmBtn().textContent, /Confirmar e substituir 1/, 'still armed');
  await flush(700);
  await click(confirmBtn());
  await flush(20);
  const c = confirmCalls();
  assert.equal(c.length, 1);
  assert.equal(c[0].payload.rows.filter((r) => r.replace === true).length, 1);
  await unmount();
});
scenario('C2 armed state survives a parent re-render and an equal-data accounts refetch (no spurious disarm)', async () => {
  const m = await mount();
  await toPreview(() => makePreview({ rows: replRows() }));
  await click(confirmBtn());
  assert.match(confirmBtn().textContent, /Confirmar e substituir/);
  await B.act(async () => { m.root.render(m.tree()); });
  await flush(10);
  assert.match(confirmBtn().textContent, /Confirmar e substituir/, 'parent re-render keeps it armed');
  await B.act(async () => { await m.qc.invalidateQueries({ queryKey: ['accounts'] }); await m.qc.invalidateQueries({ queryKey: ['categories'] }); });
  await flush(30);
  assert.match(confirmBtn().textContent, /Confirmar e substituir/, 'refetch with equal data (structural sharing) keeps it armed');
  await unmount();
});
scenario('C3 anything that changes the request disarms: row toggle / category / option / accounts data', async () => {
  const m = await mount();
  const arm = async () => { await click(confirmBtn()); assert.match(confirmBtn().textContent, /Confirmar e substituir/); };
  await toPreview((opts) => makePreview({ rows: replRows(), options: opts ?? CLOSED }));
  await arm();
  const box = all('input[type=checkbox]').find((i) => /^Importar linha/.test(i.getAttribute('aria-label') ?? ''));
  await B.act(async () => { box.click(); });
  assert.match(confirmBtn().textContent, /Confirmar importação/, 'row toggle disarms');
  await B.act(async () => { box.click(); });
  await arm();
  const sel = categorySelect();
  const other = [...sel.options].find((o) => o.value !== sel.value).value;
  await B.act(async () => { sel.value = other; sel.dispatchEvent(new w.Event('change', { bubbles: true })); });
  assert.match(confirmBtn().textContent, /Confirmar importação/, 'category change disarms');
  await arm();
  await B.act(async () => { document.getElementById('maxfin-opt-invoice').click(); });
  await flush(20);
  assert.match(confirmBtn().textContent, /Confirmar importação/, 'option change disarms');
  await arm();
  globalThis.__accountsPayload.accounts[0].name = 'Renomeada';
  await B.act(async () => { await m.qc.invalidateQueries({ queryKey: ['accounts'] }); });
  await flush(30);
  assert.match(confirmBtn().textContent, /Confirmar importação/, 'changed accounts data disarms (safe direction)');
  await unmount();
});
scenario('C4 armed + failed confirm: not armed afterwards and blocked until refresh', async () => {
  await mount();
  await toPreview(() => makePreview({ rows: replRows() }));
  fake.confirm = async () => { throw new Error('timeout'); };
  await click(confirmBtn());
  await flush(700);
  await click(confirmBtn());
  await flush(20);
  assert.equal(confirmCalls().length, 1);
  assert.ok(confirmBtn().disabled);
  assert.doesNotMatch(confirmBtn().textContent, /Confirmar e substituir/);
  assert.doesNotMatch(bodyText(), /Clique de novo para confirmar/);
  await unmount();
});

// R2-3 / (e) storage ------------------------------------------------------------------------------------------------
const KEY = 'prumo.maxfin.categoryChoices';
const OLD_KEY = 'prumo.maxfin.categoryMap';
async function pickCategory(i = 1) {
  const sel = categorySelect();
  const v = [...sel.options][i].value;
  await B.act(async () => { sel.value = v; sel.dispatchEvent(new w.Event('change', { bubbles: true })); });
  return v;
}
scenario('R2-3a a category choice is stored under the household in the NEW key; the old key is untouched and unread', async () => {
  await mount();
  const legacy = JSON.stringify({ 'EXPENSE|mercado': { kind: 'system', categoryName: 'ENTERTAINMENT' } });
  w.localStorage.setItem(OLD_KEY, legacy);
  await toPreview(() => makePreview({ rows: [mkRow()] }));
  assert.equal(categorySelect().value, 'default', 'legacy global key is ignored');
  await pickCategory(1);
  const stored = JSON.parse(w.localStorage.getItem(KEY));
  assert.deepEqual(Object.keys(stored), ['h1']);
  assert.ok(stored.h1['EXPENSE|mercado']);
  assert.equal(w.localStorage.getItem(OLD_KEY), legacy, 'old key left as is');
  await unmount();
});
scenario('R2-3b household h2 does not see h1 choices, and saving for h2 keeps h1', async () => {
  await mount({ householdId: 'h1' });
  await toPreview(() => makePreview({ rows: [mkRow()] }));
  const picked = await pickCategory(2);
  const saved = w.localStorage.getItem(KEY);
  await unmount();
  await mount({ householdId: 'h2' });
  w.localStorage.setItem(KEY, saved);
  await toPreview(() => makePreview({ rows: [mkRow()] }));
  assert.equal(categorySelect().value, 'default', `h2 must not inherit h1 choice (${picked})`);
  await pickCategory(1);
  const stored = JSON.parse(w.localStorage.getItem(KEY));
  assert.deepEqual(Object.keys(stored).sort(), ['h1', 'h2']);
  await unmount();
  await mount({ householdId: 'h1' });
  w.localStorage.setItem(KEY, JSON.stringify(stored));
  await toPreview(() => makePreview({ rows: [mkRow()] }));
  assert.equal(categorySelect().value, picked, 'h1 gets its own choice back on the next preview');
  await unmount();
});
scenario('R2-3c wrappers: no household (undefined/null/empty) neither reads nor writes', async () => {
  await mount();
  const { Hook } = B;
  w.localStorage.setItem(KEY, JSON.stringify({ h1: { 'EXPENSE|x': { kind: 'default' } } }));
  const before = w.localStorage.getItem(KEY);
  for (const h of [undefined, null, '']) {
    Hook.saveCategoryChoices(h, { 'EXPENSE|y': { kind: 'default' } });
    assert.deepEqual(Hook.loadSavedCategoryChoices(h), {});
  }
  assert.equal(w.localStorage.getItem(KEY), before, 'nothing written for an empty household');
  assert.deepEqual(Hook.loadSavedCategoryChoices('h1'), { 'EXPENSE|x': { kind: 'default' } });
  await unmount();
});
scenario('R2-3d accounts and category choices use the same household key; corrupt storage never throws', async () => {
  await mount();
  await toPreview(() => makePreview({ rows: [mkRow()] }));
  await pickCategory(1);
  const acc = JSON.parse(w.localStorage.getItem('prumo.maxfin.accounts'));
  const cat = JSON.parse(w.localStorage.getItem(KEY));
  assert.deepEqual(Object.keys(acc), ['h1']);
  assert.deepEqual(Object.keys(cat), ['h1']);
  w.localStorage.setItem(KEY, '{corrupt');
  await pickCategory(2);
  assert.deepEqual(Object.keys(JSON.parse(w.localStorage.getItem(KEY))), ['h1']);
  await unmount();
});

// R3 -------------------------------------------------------------------------------------------------------------
scenario('R3-a after a failed confirm the invoice promise (notice and footer) is hidden until the preview is refreshed', async () => {
  const rows = await failedConfirmState();
  const t = bodyText();
  assert.doesNotMatch(t, /Pagamento da fatura/, 'notice hidden while stale');
  assert.doesNotMatch(t, /será registrad[oa]\b/, 'no promise while stale');
  assert.doesNotMatch(t, /Fatura de R\$/, 'no footer promise while stale');
  servePreview(() => makePreview({ rows }));
  await click(refreshBtn());
  await flush(20);
  assert.match(bodyText(), /Pagamento da fatura: R\$ 100\.00/, 'the notice is back after the refresh');
  assert.match(bodyText(), /Fatura de R\$ 100\.00 será registrada\./, 'the footer line is back after the refresh');
  await unmount();
});
scenario('R3-b preview without the invoice key at all: no payment promise anywhere (fails closed like null)', async () => {
  await mount();
  const rows = [mkRow({ amount: 80 }), mkRow({ amount: 20.5 })];
  await toPreview(() => { const p = makePreview({ rows }); delete p.invoice; return p; });
  const t = bodyText();
  assert.doesNotMatch(t, /Pagamento da fatura/, 'notice must not render');
  assert.doesNotMatch(t, /Fatura de R\$/, 'no footer promise');
  assert.ok(!confirmBtn().disabled, 'rows are still importable');
  await unmount();
});

// ---- workbook (.xlsx) ----------------------------------------------------------------------------------------------
const WB_TODAY = '2026-10'; // the fake server's current month: default months go up to it, closedThrough defaults to the one before
const WB_ACCOUNTS = { income: 'acc-main', bills: 'acc-main', credit: 'acc-card', debit: 'acc-main' };
const keyToMonth = (key) => { const [year, month] = key.split('-').map(Number); return { year, month }; };
const shiftKey = (key, delta) => {
  const { year, month } = keyToMonth(key);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};
let wbLine = 500;
const wbRow = (key, o = {}) => {
  wbLine += 1;
  const section = o.section ?? 'credit';
  const income = section === 'income';
  return {
    sourceLine: wbLine, sourceRef: `maxfin:${key}:${section}:${wbLine}`, section, accountId: section === 'credit' ? 'acc-card' : 'acc-main',
    type: income ? 'INCOME' : 'EXPENSE', description: `${key} item ${wbLine}`, categoryKey: income ? 'Salário' : 'Mercado', amount: 10,
    planned: null, realized: null, paid: true, date: `${key}-01`, notes: null, flag: null, installment: null, futureInstallments: 0,
    shareHint: null, status: 'new', statusDetail: null, existingTransactionId: null, ...o,
  };
};
/** AGO and SET hidden (like the real workbook), NOV a future month, two sheets the server skips. */
const wbSheets = (rowsFor = {}) => [
  { name: 'AGO', monthKey: '2026-08', hidden: true, rows: rowsFor['2026-08'] ?? [wbRow('2026-08', { amount: 100 }), wbRow('2026-08', { section: 'bills', amount: 50 })] },
  { name: 'Resumo', monthKey: null, skip: 'sem cabeçalho "Descrição"' },
  { name: 'SET', monthKey: '2026-09', hidden: true, rows: rowsFor['2026-09'] ?? [wbRow('2026-09', { amount: 200 }), wbRow('2026-09', { section: 'debit', amount: 20 })] },
  { name: 'OUT', monthKey: '2026-10', rows: rowsFor['2026-10'] ?? [wbRow('2026-10', { amount: 30 }), wbRow('2026-10', { section: 'income', amount: 1000 })] },
  { name: 'NOV', monthKey: '2026-11', rows: rowsFor['2026-11'] ?? [wbRow('2026-11', { amount: 40 })] },
  { name: 'SET (2)', monthKey: '2026-09', skip: 'mês repetido (vale a primeira aba)' },
];
/**
 * Fake of the workbook preview following the contract: default months = detected months up to WB_TODAY, closedThrough
 * defaults to the month before; per month closedMonth = key <= closedThrough, payInvoice echoed as sent (like the backend; only closed months pay), future
 * installments only for the last selected month when open. Rows already stored by the fake confirm come back as duplicates.
 */
function workbookServer(sheets, { warningsFor = {} } = {}) {
  const stored = new Set();
  const build = (requested) => {
    const opts = requested ?? {};
    const monthSheets = sheets.filter((s) => !s.skip);
    const months = [...new Set(opts.months ?? monthSheets.map((s) => s.monthKey).filter((k) => k <= WB_TODAY))].sort();
    const closedThrough = opts.closedThrough === undefined ? shiftKey(WB_TODAY, -1) : opts.closedThrough;
    const payInvoice = opts.payInvoice ?? true;
    const generateFutureInstallments = opts.generateFutureInstallments ?? true;
    const last = months[months.length - 1];
    const previews = months.map((key) => {
      const sheet = monthSheets.find((s) => s.monthKey === key);
      const closed = closedThrough !== null && key <= closedThrough;
      const options = { closedMonth: closed, payInvoice, generateFutureInstallments: !closed && generateFutureInstallments && key === last };
      const rows = sheet.rows.map((r) => (stored.has(r.sourceRef) ? { ...r, status: 'duplicate' } : r));
      const entries = new Map();
      for (const r of rows) {
        const id = `${r.type}|${r.categoryKey}`;
        const e = entries.get(id) ?? { key: r.categoryKey, type: r.type, count: 0, sections: [], suggestion: { kind: 'default', label: 'Padrão' } };
        e.count += 1;
        if (!e.sections.includes(r.section)) e.sections.push(r.section);
        entries.set(id, e);
      }
      const credit = rows.filter((r) => r.section === 'credit');
      return {
        month: keyToMonth(key), monthKey: key, monthSource: 'sheet', householdId: 'h1', accounts: WB_ACCOUNTS, options,
        sections: [{ key: 'credit', label: 'Cartão', accountId: 'acc-card', count: credit.length, sum: sumCents(credit), sheetTotalPlanned: null, sheetTotalRealized: null,
          newCount: credit.filter((r) => r.status === 'new').length, duplicateCount: credit.filter((r) => r.status === 'duplicate').length, changedCount: 0 }],
        rows, skipped: [], warnings: warningsFor[key] ?? [],
        invoice: { creditAccountId: 'acc-card', sourceAccountId: 'acc-main', month: key, paymentDate: `${shiftKey(key, 1)}-10`, amount: sumCents(rows), dueDay: 10,
          closingDay: 3, alreadyPaid: false, willPay: closed && options.payInvoice },
        categoryMap: [...entries.values()],
        totals: { rows: rows.length, new: rows.filter((r) => r.status === 'new').length, duplicate: rows.filter((r) => r.status === 'duplicate').length,
          changed: 0, legacyDuplicate: 0, skipped: 0 },
      };
    });
    const merged = new Map();
    for (const p of previews) {
      for (const e of p.categoryMap) {
        const id = `${e.type}|${e.key}`;
        const m = merged.get(id);
        if (m) m.count += e.count;
        else merged.set(id, { ...e, sections: [...e.sections] });
      }
    }
    return {
      filename: 'pasta.xlsx', householdId: 'h1', accounts: WB_ACCOUNTS,
      options: { months, closedThrough, payInvoice, generateFutureInstallments },
      sheets: sheets.map((s) => ({ name: s.name, monthKey: s.monthKey, status: s.skip ? 'skipped' : months.includes(s.monthKey) ? 'selected' : 'available',
        reason: s.skip ?? null, rowCount: s.skip ? 0 : s.rows.length, hidden: !!s.hidden })),
      months: previews, categoryMap: [...merged.values()], warnings: [],
    };
  };
  const server = {
    stored,
    build,
    confirmOk(payload, extra = {}) {
      for (const r of payload.rows) stored.add(r.sourceRef);
      return { ...OK_CONFIRM, imported: payload.rows.length, ...extra };
    },
  };
  fake.workbook = async (_u, body) => ({ data: { data: build(optionsOf(body)) } });
  fake.confirm = async (_u, payload) => ({ data: server.confirmOk(payload) });
  return server;
}
const workbookCalls = () => fake.calls.filter((c) => c.kind === 'workbook');
const lastWorkbookOptions = () => optionsOf(workbookCalls().at(-1).body);
const wbConfirmBtn = () => btn(/^(Importar( \d+ m(ês|eses))?|Confirmar e substituir \d+|Importando…)$/);
const monthBox = (label) => all('input[type=checkbox]').find((i) => (i.getAttribute('aria-label') ?? '').startsWith(`Importar ${label} (aba `));
const monthBoxes = () => all('input[type=checkbox]').filter((i) => /^Importar .+ \(aba .+\)$/.test(i.getAttribute('aria-label') ?? ''));
const rowBox = (descr) => all('input[type=checkbox]').find((i) => (i.getAttribute('aria-label') ?? '').endsWith(`: ${descr}`));
const closedSelect = () => document.getElementById('maxfin-wb-closed');
const detailSelect = () => document.getElementById('maxfin-wb-detail');
const backdrop = () => all('div[aria-hidden="true"]').find((d) => d.className.includes('bg-black/40'));
const sheetRow = (name) => all('tr').find((tr) => tr.querySelector('td span span')?.textContent === name);
async function toWorkbook(name = 'pasta.xlsx') {
  await setFile(name);
  const go = btn(/^Pré-visualizar$/);
  assert.ok(go && !go.disabled, 'Pré-visualizar must be enabled once file + accounts are set');
  await click(go);
  await flush(20);
  assert.match(bodyText(), /Meses da planilha/, 'the workbook step shows the months table');
}
async function changeSelect(el, value) {
  assert.ok(el, 'select missing');
  await B.act(async () => { el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); });
  await flush(20);
}
async function toggle(el) {
  assert.ok(el, 'checkbox missing');
  await B.act(async () => { el.click(); });
  await flush(20);
}
/** Confirm requests answered by hand: `queue[i].ok(extra)` / `queue[i].fail(error)`. */
function deferredConfirms(server) {
  const queue = [];
  fake.confirm = (_u, payload) => new Promise((resolve, reject) => {
    queue.push({ payload, ok: (extra) => resolve({ data: server.confirmOk(payload, extra) }), fail: (e) => reject(e) });
  });
  return queue;
}
async function settle(entry, extra) { await B.act(async () => { entry.ok(extra); }); await flush(20); }
const CTX = { accounts: [{ id: 'acc-main', type: 'CHECKING' }, { id: 'acc-card', type: 'CREDIT' }], customIdsByType: { INCOME: new Set(), EXPENSE: new Set() } };

scenario('W1 .xlsx goes to the workbook preview (no options): months table with selected, available, hidden and skipped sheets', async () => {
  await mount();
  workbookServer(wbSheets(), { warningsFor: { '2026-09': ['Total do cartão difere da soma', 'Total das fixas difere da soma'] } });
  await toWorkbook();
  assert.equal(previewCalls().length, 0, 'the monthly (.csv) preview is not called');
  const [call] = workbookCalls();
  assert.equal(call.url, '/transactions/import/maxfin/workbook/preview');
  assert.equal(call.body.get('options'), null, 'the first request leaves the options to the server defaults');
  assert.equal(call.body.get('file').name, 'pasta.xlsx');
  assert.deepEqual(JSON.parse(call.body.get('accounts')), WB_ACCOUNTS);
  assert.deepEqual(monthBoxes().map((b) => [b.getAttribute('aria-label'), b.checked]), [
    ['Importar agosto/2026 (aba AGO)', true], ['Importar setembro/2026 (aba SET)', true], ['Importar outubro/2026 (aba OUT)', true],
    ['Importar novembro/2026 (aba NOV)', false],
  ]);
  const t = bodyText();
  assert.match(t, /Ignorada: sem cabeçalho "Descrição"/);
  assert.match(t, /Ignorada: mês repetido \(vale a primeira aba\)/);
  assert.equal(all('span').filter((s) => s.textContent === 'oculta').length, 2, 'AGO and SET carry the hidden marker');
  assert.match(sheetRow('AGO').textContent, /fechado/);
  assert.match(sheetRow('OUT').textContent, /aberto.*gera parcelas futuras/);
  assert.match(sheetRow('AGO').textContent, /R\$ 100\.00/, 'invoice of AGO');
  assert.match(sheetRow('SET').textContent, /R\$ 200\.00/, 'invoice of SET');
  assert.doesNotMatch(sheetRow('OUT').textContent, /R\$/, 'no invoice for the open month');
  assert.match(sheetRow('NOV').textContent, /1 linha/, 'an available month shows the rows the parser read');
  assert.equal(closedSelect().value, '2026-09');
  assert.deepEqual([...closedSelect().options].map((o) => o.value), ['none', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.ok(document.getElementById('maxfin-wb-invoice').checked && document.getElementById('maxfin-wb-future').checked);
  assert.match(t, /2 faturas serão registradas: R\$ 300\.00\./);
  assert.match(t, /3 meses · 6 linhas selecionadas · Receitas: R\$ 1000\.00 · Despesas: R\$ 400\.00/);
  assert.equal(wbConfirmBtn().textContent, 'Importar 3 meses');
  assert.ok(!wbConfirmBtn().disabled);
  // per-month warnings stay compact: a count in the table, a collapsed list in the detail
  assert.match(sheetRow('SET').textContent, /2 avisos/);
  assert.doesNotMatch(t, /Total do cartão difere da soma/, 'warnings are not listed in full');
  assert.equal(detailSelect().value, '2026-08', 'the detail starts with the oldest month');
  await changeSelect(detailSelect(), '2026-09');
  assert.match(bodyText(), /2 avisos deste mês/);
  assert.match(bodyText(), /identificado pelo nome da aba/);
  assert.doesNotMatch(bodyText(), /Total do cartão difere da soma/);
  await click(btn(/2 avisos deste mês/));
  assert.match(bodyText(), /Total do cartão difere da soma/);
  await unmount();
});

scenario('W2 ticking a month re-runs the workbook preview with every option explicit; the last month cannot be unticked', async () => {
  await mount();
  workbookServer(wbSheets());
  await toWorkbook();
  await toggle(monthBox('setembro/2026'));
  assert.equal(workbookCalls().length, 2);
  assert.deepEqual(lastWorkbookOptions(), { months: ['2026-08', '2026-10'], closedThrough: '2026-09', payInvoice: true, generateFutureInstallments: true });
  assert.equal(monthBox('setembro/2026').checked, false);
  assert.equal(wbConfirmBtn().textContent, 'Importar 2 meses');
  await toggle(monthBox('novembro/2026'));
  assert.deepEqual(lastWorkbookOptions().months, ['2026-08', '2026-10', '2026-11'], 'sorted, oldest first');
  assert.equal(wbConfirmBtn().textContent, 'Importar 3 meses');
  await toggle(monthBox('agosto/2026'));
  await toggle(monthBox('novembro/2026'));
  assert.deepEqual(lastWorkbookOptions().months, ['2026-10']);
  const lastBox = monthBox('outubro/2026');
  assert.ok(lastBox.checked && lastBox.disabled, 'the only ticked month stays ticked');
  const before = workbookCalls().length;
  await toggle(lastBox);
  assert.equal(workbookCalls().length, before, 'no request for an empty selection');
  await unmount();
});

scenario('W3 "Meses fechados até" and the two options go explicit in the request; "nenhum" sends null', async () => {
  await mount();
  workbookServer(wbSheets());
  await toWorkbook();
  await changeSelect(closedSelect(), '2026-10');
  assert.deepEqual(lastWorkbookOptions(), { months: ['2026-08', '2026-09', '2026-10'], closedThrough: '2026-10', payInvoice: true, generateFutureInstallments: true });
  assert.match(sheetRow('OUT').textContent, /fechado/);
  assert.match(sheetRow('OUT').textContent, /R\$ 30\.00/);
  assert.match(bodyText(), /3 faturas serão registradas: R\$ 330\.00\./);
  await changeSelect(closedSelect(), 'none');
  assert.equal(lastWorkbookOptions().closedThrough, null);
  assert.equal(closedSelect().value, 'none');
  assert.doesNotMatch(bodyText(), /serão registradas|será registrada/, 'no closed month, no invoice');
  assert.ok(['AGO', 'SET', 'OUT'].every((name) => /aberto/.test(sheetRow(name).textContent)));
  await toggle(document.getElementById('maxfin-wb-invoice'));
  assert.deepEqual(lastWorkbookOptions(), { months: ['2026-08', '2026-09', '2026-10'], closedThrough: null, payInvoice: false, generateFutureInstallments: true });
  await toggle(document.getElementById('maxfin-wb-future'));
  assert.equal(lastWorkbookOptions().generateFutureInstallments, false);
  assert.equal(lastWorkbookOptions().payInvoice, false, 'the earlier change is kept');
  await unmount();
});

scenario('W4a while a workbook re-run is in flight every month and option is disabled: a quick second toggle sends nothing', async () => {
  await mount();
  const server = workbookServer(wbSheets());
  await toWorkbook();
  const gates = [];
  fake.workbook = (_u, body) => new Promise((resolve) => {
    const opts = optionsOf(body);
    gates.push(() => resolve({ data: { data: server.build(opts) } }));
  });
  // Two clicks in a row: the first re-run disables the table before the second click lands.
  await B.act(async () => {
    monthBox('setembro/2026').click();
    monthBox('novembro/2026').click();
  });
  await flush(10);
  assert.equal(gates.length, 1, 'one request only');
  assert.ok(monthBoxes().every((box) => box.disabled), 'every month checkbox disabled while refreshing');
  assert.ok(closedSelect().disabled && document.getElementById('maxfin-wb-invoice').disabled && document.getElementById('maxfin-wb-future').disabled);
  assert.ok(wbConfirmBtn().disabled && btn(/^Voltar$/).disabled);
  await B.act(async () => { gates[0](); });
  await flush(20);
  assert.equal(wbConfirmBtn().textContent, 'Importar 2 meses');
  assert.ok(!monthBox('novembro/2026').checked && !monthBox('novembro/2026').disabled);
  await unmount();
});

scenario('W4b latest wins: a workbook preview answering after the dialog was closed and reopened never shows up', async () => {
  const m = await mount();
  const server = workbookServer(wbSheets());
  const gates = [];
  fake.workbook = (_u, body) => new Promise((resolve) => {
    const opts = optionsOf(body);
    gates.push(() => resolve({ data: { data: server.build(opts) } }));
  });
  await setFile('pasta.xlsx');
  await click(btn(/^Pré-visualizar$/));
  await flush(10);
  assert.equal(gates.length, 1);
  await B.act(async () => { m.root.render(m.tree(undefined, false)); });
  await B.act(async () => { m.root.render(m.tree(undefined, true)); });
  await flush(10);
  await B.act(async () => { gates[0](); });
  await flush(20);
  assert.doesNotMatch(bodyText(), /Meses da planilha/, 'the old response is dropped');
  assert.ok(btn(/^Pré-visualizar$/), 'still at the setup step of the new session');
  await unmount();
});

scenario('W5 confirm: one request per month, oldest first, each the .csv request of that month; progress; no closing mid-run', async () => {
  const m = await mount();
  const server = workbookServer(wbSheets());
  await toWorkbook();
  // What the .csv flow would send for each month (same preview, default selection, default categories).
  const shown = server.build(null);
  const choices = B.Payload.resolveCategoryChoices(shown.categoryMap, {}, {}, CTX.customIdsByType);
  const expected = shown.months.map((month) => B.Payload.buildConfirmPayload(month, B.Payload.reconcileSelection([], {}, month.rows), choices, CTX).payload);
  const queue = deferredConfirms(server);
  await click(wbConfirmBtn());
  await flush(10);
  assert.equal(queue.length, 1);
  assert.match(bodyText(), /Importando agosto\/2026 \(1 de 3\)…/);
  assert.equal(wbConfirmBtn().textContent, 'Importando…');
  assert.ok(btn(/Fechar modal/).disabled, 'X disabled during the run');
  await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await click(backdrop());
  assert.equal(m.closed, 0, 'neither ESC nor the backdrop closes mid-run');
  await settle(queue[0]);
  assert.equal(queue.length, 2);
  assert.match(bodyText(), /Importando setembro\/2026 \(2 de 3\)…/);
  await B.act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(m.closed, 0);
  await settle(queue[1]);
  assert.match(bodyText(), /Importando outubro\/2026 \(3 de 3\)…/);
  await settle(queue[2]);
  const sent = confirmCalls().map((c) => c.payload);
  assert.deepEqual(sent.map((p) => p.month), [{ year: 2026, month: 8 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }]);
  assert.deepEqual(sent.map((p) => p.options), [
    { closedMonth: true, payInvoice: true, generateFutureInstallments: false },
    { closedMonth: true, payInvoice: true, generateFutureInstallments: false },
    { closedMonth: false, payInvoice: true, generateFutureInstallments: true }, // the backend echoes the global value; open months never pay
  ]);
  sent.forEach((p, i) => assert.deepEqual(p, expected[i], `request ${i + 1} equals the .csv request of its month`));
  for (const p of sent) assert.ok(p.rows.every((r) => r.sourceRef.startsWith(`maxfin:2026-${String(p.month.month).padStart(2, '0')}:`)));
  assert.equal(m.closed, 1, 'nothing to review: the dialog closes');
  assert.deepEqual(globalThis.__toasts.at(-1), ['success', '3 meses importados: 6 transações importadas.']);
  await unmount();
});

scenario('W6 failure on the second month: the run stops, says what was stored, and Confirm waits for a refresh', async () => {
  const m = await mount();
  const server = workbookServer(wbSheets());
  await toWorkbook();
  let n = 0;
  fake.confirm = async (_u, payload) => {
    n += 1;
    if (n === 2) throw new Error('Falha de rede');
    return { data: server.confirmOk(payload) };
  };
  const optionsBefore = lastWorkbookOptions() ?? server.build(null).options;
  await click(wbConfirmBtn());
  await flush(30);
  assert.equal(confirmCalls().length, 2, 'the third month is never sent');
  const t = bodyText();
  assert.match(t, /Falha ao importar setembro\/2026: Falha de rede\. Meses importados: agosto\/2026\./);
  assert.match(t, /A importação de setembro\/2026 pode ter sido parcial\. Não enviados: outubro\/2026\./);
  assert.match(t, /as linhas já importadas aparecem como duplicadas/);
  assert.ok(globalThis.__toasts.some(([kind, msg]) => kind === 'error' && /Falha ao importar setembro\/2026/.test(msg)));
  assert.ok(wbConfirmBtn().disabled, 'blocked until the preview is refreshed');
  assert.match(t, /Atualize a pré-visualização antes de confirmar de novo\./);
  assert.ok(!all('th').some((th) => th.textContent === 'Fatura'), 'no invoice column while stale');
  assert.doesNotMatch(t, /serão registradas|será registrad/, 'no invoice promise while stale');
  assert.doesNotMatch(t, /Pagamento da fatura/, 'no invoice notice in the detail while stale');
  assert.ok(!btn(/Fechar modal/).disabled, 'the run is over: the dialog can close again');
  assert.equal(m.closed, 0);
  await click(refreshBtn());
  await flush(20);
  assert.deepEqual(lastWorkbookOptions(), { months: optionsBefore.months, closedThrough: optionsBefore.closedThrough,
    payInvoice: optionsBefore.payInvoice, generateFutureInstallments: optionsBefore.generateFutureInstallments }, 'refresh repeats the options, explicit');
  assert.doesNotMatch(bodyText(), /Falha ao importar/);
  assert.match(bodyText(), /Sem linhas para importar: agosto\/2026\./, 'the stored month comes back as duplicates');
  assert.equal(wbConfirmBtn().textContent, 'Importar 2 meses');
  assert.ok(!wbConfirmBtn().disabled);
  fake.confirm = async (_u, payload) => ({ data: server.confirmOk(payload) });
  await click(wbConfirmBtn());
  await flush(30);
  assert.deepEqual(confirmCalls().slice(2).map((c) => c.payload.month.month), [9, 10]);
  assert.equal(m.closed, 1);
  await unmount();
});

scenario('W7 replacement: the first click arms, a quick second click is ignored, a later click sends every month', async () => {
  await mount();
  workbookServer(wbSheets({ '2026-09': [wbRow('2026-09', { amount: 200, status: 'replaces-future', statusDetail: 'substitui 2 parcelas futuras' }), wbRow('2026-09', { section: 'debit', amount: 20 })] }));
  await toWorkbook();
  assert.match(bodyText(), /1 linha substitui dados já registrados/);
  await click(wbConfirmBtn());
  assert.equal(wbConfirmBtn().textContent, 'Confirmar e substituir 1');
  assert.match(bodyText(), /dados que já estão registrados serão substituídos\. Clique de novo para confirmar\./);
  await click(wbConfirmBtn());
  assert.equal(confirmCalls().length, 0, 'second click inside the guard window is ignored');
  await flush(700);
  await click(wbConfirmBtn());
  await flush(30);
  const sent = confirmCalls().map((c) => c.payload);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((p) => p.rows.filter((r) => r.replace === true).length), [0, 1, 0]);
  await unmount();
});

scenario('W8 result step: one line per month and the warnings with their month; Fechar closes', async () => {
  const m = await mount();
  const server = workbookServer(wbSheets());
  await toWorkbook();
  fake.confirm = async (_u, payload) => ({
    data: server.confirmOk(payload, payload.month.month === 8 ? { warnings: ['Soma do cartão difere do total da planilha'] } : {}),
  });
  await click(wbConfirmBtn());
  await flush(30);
  assert.equal(m.closed, 0, 'there is something to read');
  const items = all('li').map((li) => li.textContent);
  assert.ok(items.includes('agosto/2026: 2 transações importadas. 1 aviso.'), JSON.stringify(items));
  assert.ok(items.includes('setembro/2026: 2 transações importadas.'));
  assert.ok(items.includes('outubro/2026: 2 transações importadas.'));
  assert.ok(items.includes('agosto/2026: Soma do cartão difere do total da planilha'));
  assert.match(bodyText(), /Importação concluída/);
  await click(btn(/^Fechar$/));
  assert.equal(m.closed, 1);
  await unmount();
});

scenario('W9 row choices are per month and survive a re-preview; the detail switcher shows one month at a time', async () => {
  await mount();
  const sheets = wbSheets();
  workbookServer(sheets);
  await toWorkbook();
  const [agoCard, agoBill] = sheets[0].rows;
  assert.ok(rowBox(agoCard.description).checked);
  await toggle(rowBox(agoCard.description));
  assert.match(bodyText(), /3 meses · 5 linhas selecionadas/);
  await changeSelect(detailSelect(), '2026-10');
  assert.ok(!rowBox(agoCard.description), 'AGO rows are not on screen');
  assert.ok(rowBox(sheets[3].rows[0].description), 'OUT rows are');
  await toggle(monthBox('novembro/2026'));
  assert.equal(detailSelect().value, '2026-10', 'the month picked for the detail stays after a re-preview');
  await changeSelect(detailSelect(), '2026-08');
  assert.equal(rowBox(agoCard.description).checked, false, 'the AGO choice survived the re-preview');
  await click(wbConfirmBtn());
  await flush(30);
  const ago = confirmCalls().find((c) => c.payload.month.month === 8).payload;
  assert.deepEqual(ago.rows.map((r) => r.sourceRef), [agoBill.sourceRef]);
  assert.equal(confirmCalls().length, 4, 'AGO, SET, OUT and NOV');
  await unmount();
});

scenario('W10 unmounting mid-run stops the loop: the month in flight finishes, no further month is sent', async () => {
  await mount();
  const server = workbookServer(wbSheets());
  await toWorkbook();
  const queue = deferredConfirms(server);
  await click(wbConfirmBtn());
  await flush(10);
  assert.equal(queue.length, 1);
  await unmount();
  await B.act(async () => { queue[0].ok(); });
  await flush(30);
  assert.equal(confirmCalls().length, 1, 'no request after the dialog went away');
  assert.ok(globalThis.__toasts.some(([kind, msg]) => kind === 'error'
    && msg === 'Importação interrompida. Meses importados: agosto/2026. Não enviados: setembro/2026, outubro/2026.'));
});

scenario('W11 one category table for every month: the choice goes to each month request and is remembered for the household', async () => {
  await mount();
  workbookServer(wbSheets());
  await toWorkbook();
  assert.equal(all('select').filter((s) => /^Destino para/.test(s.getAttribute('aria-label') ?? '')).length, 2, 'Mercado and Salário, once each');
  const picked = await pickCategory(1);
  assert.match(picked, /^system:/);
  await click(wbConfirmBtn());
  await flush(30);
  for (const c of confirmCalls()) {
    const entry = c.payload.categoryMap.find((e) => e.key === 'Mercado');
    assert.deepEqual(entry.target, { kind: 'system', categoryName: picked.slice('system:'.length) }, `month ${c.payload.month.month}`);
  }
  assert.ok(JSON.parse(w.localStorage.getItem(KEY)).h1['EXPENSE|mercado']);
  await unmount();
});

scenario('W12 .xls is refused naming both formats; .XLSX (any case) goes to the workbook endpoint', async () => {
  await mount();
  const input = document.getElementById('maxfin-file');
  assert.equal(input.getAttribute('accept'), '.csv,.xlsx');
  assert.match(bodyText(), /Arquivo da planilha \(\.csv ou \.xlsx, até 5 MB\)/);
  await setFile('pasta.xls');
  assert.match(bodyText(), /Formato inválido\. Envie a aba do mês exportada como \.csv ou a planilha inteira como \.xlsx\./);
  assert.ok(btn(/^Pré-visualizar$/).disabled);
  workbookServer(wbSheets());
  await toWorkbook('PASTA.XLSX');
  assert.equal(workbookCalls().length, 1);
  assert.equal(previewCalls().length, 0);
  await unmount();
});

scenario('N1 a refund in the card block reads as a credit and the invoice is net (purchases minus refunds)', async () => {
  await mount();
  const buy = mkRow({ amount: 300, description: 'Compra' });
  const refund = mkRow({ amount: 50, type: 'INCOME', description: 'Estorno', notes: 'valor negativo na planilha: lançado como crédito' });
  const back = mkRow({ section: 'income', type: 'EXPENSE', amount: 15, description: 'Devolução', categoryKey: 'Salário' });
  const invoice = { creditAccountId: 'acc-card', sourceAccountId: 'acc-main', month: '2026-09', paymentDate: '2026-10-10', amount: 250, dueDay: 10,
    closingDay: 3, alreadyPaid: false, willPay: true };
  await toPreview(() => makePreview({ rows: [buy, refund, back], invoice }));
  const t = bodyText();
  assert.match(t, /Pagamento da fatura: R\$ 250\.00/);
  assert.match(t, /Compras selecionadas: R\$ 300\.00 − créditos \(valores negativos na planilha\): R\$ 50\.00\./);
  assert.match(t, /Fatura de R\$ 250\.00 será registrada\./);
  assert.doesNotMatch(t, /No arquivo:/, 'the server net equals the selected net');
  assert.match(t, /Receitas: R\$ 50\.00 · Despesas: R\$ 315\.00/);
  // Badges are checked as chips: the generated note of the refund also says "crédito".
  const chips = (tr) => [...tr.querySelectorAll('span')].map((s) => s.textContent);
  const refundRow = all('tr').find((tr) => tr.textContent.includes('Estorno'));
  assert.ok(chips(refundRow).includes('crédito'), 'the credit badge');
  assert.match(refundRow.textContent, /\+R\$ 50\.00/);
  const backRow = all('tr').find((tr) => tr.textContent.includes('Devolução'));
  assert.ok(chips(backRow).includes('despesa'), 'the expense badge in the income block');
  assert.match(backRow.textContent, /−R\$ 15\.00/);
  const buyRow = all('tr').find((tr) => tr.textContent.includes('Compra') && !tr.textContent.includes('Compras'));
  assert.ok(!chips(buyRow).includes('crédito') && !/\+R\$/.test(buyRow.textContent), 'a purchase has no credit marker');
  await toggle(rowBox('Compra'));
  assert.match(bodyText(), /não será registrado \(os créditos igualam ou superam as compras selecionadas\)/);
  assert.doesNotMatch(bodyText(), /Fatura de R\$/);
  await toggle(rowBox('Compra'));
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await click(confirmBtn());
  await flush(20);
  const sentRefund = confirmCalls()[0].payload.rows.find((r) => r.description === 'Estorno');
  assert.equal(sentRefund.type, 'INCOME');
  assert.equal(sentRefund.amount, 50);
  await unmount();
});

scenario('N2 the month source "sheet" reads "pelo nome da aba"; an unknown source shows nothing in parentheses', async () => {
  await mount();
  await toPreview(() => ({ ...makePreview({ rows: [mkRow()] }), monthSource: 'sheet' }));
  assert.match(bodyText(), /Setembro\/2026 \(pelo nome da aba\)/);
  await unmount();
  await mount();
  await toPreview(() => ({ ...makePreview({ rows: [mkRow()] }), monthSource: 'from-the-future' }));
  assert.match(bodyText(), /Setembro\/2026/);
  assert.doesNotMatch(bodyText(), /Setembro\/2026 \(/);
  await unmount();
});

// ---- reviewer scenarios (round 1): proposed regression tests, spliced before the run section ----------------------
async function failSecondMonth(server) {
  let n = 0;
  fake.confirm = async (_u, payload) => {
    n += 1;
    if (n === 2) throw new Error('Falha de rede');
    return { data: server.confirmOk(payload) };
  };
  await click(wbConfirmBtn());
  await flush(30);
  assert.equal(confirmCalls().length, 2, 'the run stopped on the second month');
  assert.ok(wbConfirmBtn().disabled, 'blocked after the failed run');
}

scenario('RV1 workbook: after a failed run a refresh that FAILS keeps Confirm blocked and the invoices hidden; a good refresh unblocks', async () => {
  await mount();
  const server = workbookServer(wbSheets());
  await toWorkbook();
  await failSecondMonth(server);
  fake.workbook = async () => { throw new Error('Servidor indisponível'); };
  await click(refreshBtn());
  await flush(20);
  assert.ok(wbConfirmBtn().disabled, 'a failed refresh must not unblock Confirm');
  assert.match(bodyText(), /Atualize a pré-visualização antes de confirmar de novo\./);
  assert.doesNotMatch(bodyText(), /serão registradas|será registrad/, 'no invoice promise while stale');
  assert.ok(!all('th').some((th) => th.textContent === 'Fatura'), 'no invoice column while stale');
  await click(wbConfirmBtn());
  await flush(20);
  assert.equal(confirmCalls().length, 2, 'nothing sent from the stale preview');
  fake.workbook = async (_u, body) => ({ data: { data: server.build(optionsOf(body)) } });
  await click(refreshBtn());
  await flush(20);
  assert.ok(!wbConfirmBtn().disabled, 'a successful refresh unblocks');
  await unmount();
});

scenario('RV1b workbook: after a failed run, a month toggle whose re-preview FAILS keeps Confirm blocked', async () => {
  await mount();
  const server = workbookServer(wbSheets());
  await toWorkbook();
  await failSecondMonth(server);
  fake.workbook = async () => { throw new Error('Servidor indisponível'); };
  await toggle(monthBox('novembro/2026'));
  assert.ok(wbConfirmBtn().disabled, 'still blocked');
  await click(wbConfirmBtn());
  await flush(20);
  assert.equal(confirmCalls().length, 2, 'nothing sent from the stale preview');
  await unmount();
});

scenario('RV2 workbook: armed by a replacement in SET, a row toggled in OUT or a category change disarms; the next click only re-arms', async () => {
  await mount();
  const sheets = wbSheets({ '2026-09': [wbRow('2026-09', { amount: 200, status: 'replaces-future', statusDetail: 'substitui 2 parcelas futuras' }), wbRow('2026-09', { section: 'debit', amount: 20 })] });
  workbookServer(sheets);
  await toWorkbook();
  await click(wbConfirmBtn());
  assert.equal(wbConfirmBtn().textContent, 'Confirmar e substituir 1', 'armed');
  await flush(700);
  await changeSelect(detailSelect(), '2026-10');
  assert.equal(wbConfirmBtn().textContent, 'Confirmar e substituir 1', 'switching the month on screen changes nothing that is sent');
  await toggle(rowBox(sheets[3].rows[0].description));
  assert.equal(wbConfirmBtn().textContent, 'Importar 3 meses', 'a row change in another month disarms');
  await click(wbConfirmBtn());
  assert.equal(confirmCalls().length, 0, 'the click after a disarm only arms again');
  assert.equal(wbConfirmBtn().textContent, 'Confirmar e substituir 1');
  await flush(700);
  const sel = all('select').find((s) => /^Destino para/.test(s.getAttribute('aria-label') ?? ''));
  await B.act(async () => { sel.value = [...sel.options][1].value; sel.dispatchEvent(new w.Event('change', { bubbles: true })); });
  await flush(20);
  assert.equal(wbConfirmBtn().textContent, 'Importar 3 meses', 'a category change disarms');
  assert.equal(confirmCalls().length, 0);
  await unmount();
});

scenario('RV3 workbook: a re-preview that fails puts the month and option controls back to what the plan holds', async () => {
  await mount();
  workbookServer(wbSheets());
  await toWorkbook();
  fake.workbook = async () => { throw new Error('Servidor indisponível'); };
  await toggle(monthBox('novembro/2026'));
  assert.equal(monthBox('novembro/2026').checked, false, 'NOV is not in the plan: its box must not read as ticked');
  assert.equal(wbConfirmBtn().textContent, 'Importar 3 meses');
  await changeSelect(closedSelect(), 'none');
  assert.equal(closedSelect().value, '2026-09', 'the select shows the applied value again');
  await unmount();
});

scenario('RV4 workbook: the household saved category choice reaches every month; accounts are remembered under the household', async () => {
  await mount({ householdId: 'h1' });
  w.localStorage.setItem(KEY, JSON.stringify({
    h1: { 'EXPENSE|mercado': { kind: 'system', categoryName: 'ENTERTAINMENT' } },
    h2: { 'EXPENSE|mercado': { kind: 'system', categoryName: 'HEALTH' } },
  }));
  workbookServer(wbSheets());
  await toWorkbook();
  await click(wbConfirmBtn());
  await flush(30);
  assert.equal(confirmCalls().length, 3);
  for (const c of confirmCalls()) {
    const entry = c.payload.categoryMap.find((e) => e.key === 'Mercado');
    assert.deepEqual(entry?.target, { kind: 'system', categoryName: 'ENTERTAINMENT' }, `month ${c.payload.month.month}`);
  }
  const acc = JSON.parse(w.localStorage.getItem('prumo.maxfin.accounts') ?? 'null');
  assert.deepEqual(acc && Object.keys(acc), ['h1']);
  await unmount();
});

// ---- phase 5: the sheet takes over what a recurrence generated (status matches-recurring) ----------------------------
const recurRows = () => [
  mkRow({ section: 'bills', description: 'Conta de energia', amount: 187.43, status: 'matches-recurring', statusDetail: 'atualiza a transação gerada de 05/10', existingTransactionId: 'tx-gen-1' }),
  mkRow({ section: 'bills', description: 'Internet fibra', amount: 99.9, status: 'matches-recurring', statusDetail: 'assume a recorrência e adianta a próxima execução' }),
  mkRow({ section: 'credit', description: 'Padaria', amount: 12, status: 'new' }),
];
scenario('MR1 matches-recurring rows: ticked by default, "Recorrente" badge, the detail line, a count chip and the replace footer', async () => {
  await mount();
  await toPreview(() => makePreview({ rows: recurRows() }));
  const boxes = all('input[type=checkbox]').filter((i) => /^(Importar|Substituir)/.test(i.getAttribute('aria-label') ?? ''));
  const byLabel = (re) => boxes.find((i) => re.test(i.getAttribute('aria-label') ?? ''));
  assert.equal(byLabel(/assumir a conta recorrente: Conta de energia/).checked, true);
  assert.equal(byLabel(/assumir a conta recorrente: Internet fibra/).checked, true);
  assert.equal(byLabel(/Importar linha: Padaria/).checked, true);
  assert.ok(!byLabel(/assumir a conta recorrente: Conta de energia/).disabled, 'sendable');
  const t = bodyText();
  assert.match(t, /Recorrente/);
  assert.match(t, /atualiza a transação gerada de 05\/10/, 'the detail is readable without hovering');
  assert.match(t, /assume a recorrência e adianta a próxima execução/);
  assert.match(t, /2 recorrentes/);
  assert.match(t, /3 linhas selecionadas/);
  assert.match(t, /2 linhas substituem dados já registrados \(2 assumem recorrentes\)/);
  await unmount();
});
scenario('MR5 matches-recurring detail shows "old → new" when existingAmount is sent, and the server text alone when it is not', async () => {
  await mount();
  const rows = recurRows();
  rows[0] = { ...rows[0], existingAmount: 180 };
  await toPreview(() => makePreview({ rows }));
  const t = bodyText();
  assert.match(t, /atualiza a transação gerada de 05\/10: R\$ 180\.00 → R\$ 187\.43/);
  assert.match(t, /assume a recorrência e adianta a próxima execução(?!:)/, 'no stored amount: the server text only');
  await unmount();
});
scenario('MR2 matches-recurring is armed like a replacement and sent with replace:true; the result says "assumiu N recorrentes"', async () => {
  await mount();
  await toPreview(() => makePreview({ rows: recurRows() }));
  fake.confirm = async () => ({ data: { ...OK_CONFIRM, imported: 3, replaced: 2, assumedRecurring: 2 } });
  await click(confirmBtn());
  assert.match(confirmBtn().textContent, /Confirmar e substituir 2/);
  assert.match(bodyText(), /dados que já estão registrados serão substituídos/);
  await click(confirmBtn());
  assert.equal(confirmCalls().length, 0, 'the quick second click is ignored');
  await flush(700);
  await click(confirmBtn());
  await flush(30);
  const sent = confirmCalls().map((c) => c.payload.rows);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].map((r) => [r.description, r.replace === true]), [['Conta de energia', true], ['Internet fibra', true], ['Padaria', false]]);
  for (const row of sent[0]) for (const key of ['status', 'statusDetail', 'existingTransactionId']) assert.equal(key in row, false, key);
  assert.deepEqual(globalThis.__toasts.at(-1), ['success', '3 transações importadas, 2 substituídas, assumiu 2 recorrentes.']);
  await unmount();
});
scenario('MR3 unticking a matches-recurring row removes it from the request and from the armed count', async () => {
  await mount();
  await toPreview(() => makePreview({ rows: recurRows() }));
  const energy = all('input[type=checkbox]').find((i) => /assumir a conta recorrente: Conta de energia/.test(i.getAttribute('aria-label') ?? ''));
  await B.act(async () => { energy.click(); });
  assert.match(bodyText(), /1 linha substitui dados já registrados \(1 assume uma recorrente\)/);
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await click(confirmBtn());
  await flush(700);
  await click(confirmBtn());
  await flush(30);
  assert.deepEqual(confirmCalls()[0].payload.rows.map((r) => r.description), ['Internet fibra', 'Padaria']);
  await unmount();
});
scenario('MR4 workbook: the month table counts the recurrences, the footer arms the replacement and the result names the assumed ones', async () => {
  await mount();
  const sheets = wbSheets({ '2026-09': [wbRow('2026-09', { section: 'bills', description: 'Conta de energia', amount: 187.43, status: 'matches-recurring', statusDetail: 'atualiza a transação gerada de 05/10' }), wbRow('2026-09', { section: 'debit', amount: 20 })] });
  const server = workbookServer(sheets);
  await toWorkbook();
  assert.match(bodyText(), /1 recorrente/);
  assert.match(bodyText(), /1 linha substitui dados já registrados \(1 assume uma recorrente\)/);
  fake.confirm = async (_u, payload) => ({ data: server.confirmOk(payload, payload.month.month === 9 ? { assumedRecurring: 1, replaced: 1 } : {}) });
  await click(wbConfirmBtn());
  assert.equal(wbConfirmBtn().textContent, 'Confirmar e substituir 1');
  await flush(700);
  await click(wbConfirmBtn());
  await flush(30);
  const sept = confirmCalls().map((c) => c.payload).find((p) => p.month.month === 9);
  assert.deepEqual(sept.rows.map((r) => [r.description, r.replace === true]).filter(([d]) => d === 'Conta de energia'), [['Conta de energia', true]]);
  assert.match(globalThis.__toasts.at(-1)[1] + all('li').map((li) => li.textContent).join(' '), /assumiu 1 recorrente/);
  await unmount();
});

// ---- shifted rows and realignment proposals (status shifted, preview.realignments, confirm realignments) -----------------
const rl = (section, n) => `maxfin:2026-09:${section}:${n}`;
const rlMove = (n, from, to, section = 'credit') => ({
  transactionId: `tx-${section}-${n}`, from: rl(section, from), to: rl(section, to), sheetLine: to, verified: true,
  sheet: { description: `Compra ${n}`, type: 'EXPENSE', amount: n * 10, installment: null }, storedDescription: `Compra ${n}`, storedAmount: n * 10,
});
const rlProp = (o = {}) => ({
  id: 'credit:5:2', section: 'credit', kind: 'insertion', shift: 2, firstLine: 5, lastLine: 7, moves: [rlMove(1, 3, 5), rlMove(2, 4, 6), rlMove(3, 5, 7)],
  removed: [], insertedRefs: [rl('credit', 3), rl('credit', 4)], requires: [], defaultSelected: true, ambiguous: false, reason: null, detail: 'x', ...o,
});
const rlNew = (n) => mkRow({ sourceRef: rl('credit', n), sourceLine: n, description: `Nova ${n}`, amount: 5 });
const rlShifted = (n) => mkRow({
  sourceRef: rl('credit', n), sourceLine: n, description: `Compra ${n - 2}`, amount: (n - 2) * 10, status: 'shifted',
  statusDetail: 'texto do servidor', existingTransactionId: `tx-credit-${n - 2}`,
});
const rlRows = () => [rlNew(3), rlNew(4), rlShifted(5), rlShifted(6), rlShifted(7)];
const realignPreview = (rows, realignments) => () => ({ ...makePreview({ rows }), ...(realignments ? { realignments } : {}) });
const rlBox = (re) => all('input[type=checkbox]').find((i) => re.test(i.getAttribute('aria-label') ?? ''));
const realignBox = (first, last, section = 'Cartão') => rlBox(new RegExp(`^Realinhar ${section}, linhas ${first} a ${last}$`));
const rlConfirm = async () => { await click(confirmBtn()); await flush(30); };

scenario('RL1 shifted rows: "Deslocada" chip and no checkbox of their own; one card per block with the explanation, counts and a ticked "Realinhar"', async () => {
  await mount();
  await toPreview(realignPreview(rlRows(), [rlProp()]));
  const t = bodyText();
  assert.match(t, /Linhas deslocadas na planilha/);
  assert.match(t, /Realinhar só muda a posição da linha na planilha: valores, datas e descrições não são alterados\./);
  assert.match(t, /3 lançamentos descem 2 linhas \(linhas inseridas acima\)/);
  assert.match(t, /2 linhas novas só entram depois deste realinhamento/);
  assert.match(t, /Cartão · linhas 5 a 7 da planilha/);
  assert.equal(realignBox(5, 7).checked, true);
  assert.ok(!realignBox(5, 7).disabled);
  assert.equal(all('td').filter((td) => td.textContent === 'Deslocada').length, 3, 'one chip per shifted row');
  assert.match(t, /3 deslocadas/, 'count chip');
  assert.doesNotMatch(t, /status desconhecido|Status desconhecido/, 'shifted is a known status');
  assert.doesNotMatch(t, /texto do servidor/, 'the row says it in the language of the screen, not with the text of the server');
  assert.match(t, /Mesmo lançamento que está hoje na linha 3; vai para a linha 5 ao realinhar/, 'the row says where it moves, without hovering');
  // Shifted rows have no checkbox: only the two new rows and the block box exist.
  const rowBoxes = all('input[type=checkbox]').filter((i) => /^(Importar|Substituir|Linha com status)/.test(i.getAttribute('aria-label') ?? ''));
  assert.deepEqual(rowBoxes.map((i) => i.getAttribute('aria-label')), ['Importar linha: Nova 3', 'Importar linha: Nova 4']);
  assert.match(t, /2 linhas selecionadas/);
  assert.match(t, /1 bloco será realinhado \(3 lançamentos mudam de linha\)/);
  await unmount();
});

scenario('RL2 confirm sends the decision of every block (echoing what the server checks) and the result shows the count and the status of each block', async () => {
  await mount();
  await toPreview(realignPreview(rlRows(), [rlProp()]));
  fake.confirm = async () => ({ data: { ...OK_CONFIRM, imported: 2, realigned: 3, realignments: [{ id: 'credit:5:2', status: 'applied', moved: 3, reason: null }] } });
  await rlConfirm();
  const [call] = confirmCalls();
  assert.deepEqual(call.payload.rows.map((r) => r.description), ['Nova 3', 'Nova 4']);
  assert.equal(call.payload.realignments.length, 1);
  const d = call.payload.realignments[0];
  assert.deepEqual([d.id, d.apply, d.section, d.shift, d.requires], ['credit:5:2', true, 'credit', 2, []]);
  assert.deepEqual(d.moves[0], { transactionId: 'tx-credit-1', from: rl('credit', 3), to: rl('credit', 5), sheetLine: 5, verified: true,
    sheet: { description: 'Compra 1', type: 'EXPENSE', amount: 10, installment: null } });
  assert.equal('storedDescription' in d.moves[0], false);
  assert.deepEqual(globalThis.__toasts.at(-1), ['success', '2 transações importadas, 3 lançamentos realinhados.']);
  const t = bodyText();
  assert.match(t, /Realinhamento/);
  assert.match(t, /Cartão, linhas 5 a 7: Realinhado \(3\)/);
  assert.match(t, /2 transações importadas, 3 lançamentos realinhados\./);
  await unmount();
});

scenario('RL3 unticking a block: it stays pending (declined in the request), its new rows are held back, the footer says so, and with nothing else the confirm is blocked', async () => {
  await mount();
  await toPreview(realignPreview([...rlRows(), rlNew(20)], [rlProp()]));
  await B.act(async () => { realignBox(5, 7).click(); });
  const t = bodyText();
  assert.equal(realignBox(5, 7).checked, false);
  assert.match(t, /1 bloco deslocado ficará pendente: nada nele será importado nem substituído/);
  assert.match(t, /Fica pendente enquanto o realinhamento do bloco não for aplicado/);
  const nova3 = rlBox(/^Importar linha: Nova 3$/);
  assert.equal(nova3.checked, false);
  assert.equal(nova3.disabled, true);
  assert.equal(rlBox(/^Importar linha: Nova 20$/).checked, true, 'a row outside the block is untouched');
  assert.match(t, /1 linha selecionada/);
  fake.confirm = async () => ({ data: { ...OK_CONFIRM, imported: 1, realignments: [{ id: 'credit:5:2', status: 'declined', moved: 0, reason: 'bloco deixado pendente por escolha: nada nele foi alterado' }] } });
  await rlConfirm();
  const [call] = confirmCalls();
  assert.deepEqual(call.payload.rows.map((r) => r.description), ['Nova 20']);
  assert.deepEqual(call.payload.realignments.map((d) => [d.id, d.apply]), [['credit:5:2', false]]);
  assert.match(bodyText(), /Cartão, linhas 5 a 7: Deixado pendente\. bloco deixado pendente por escolha/);
  await unmount();
});

scenario('RL3b only the block and no rows: with it unticked the confirm is blocked with its own message; ticked, it goes with no rows', async () => {
  await mount();
  await toPreview(realignPreview([rlShifted(5), rlShifted(6), rlShifted(7)], [rlProp()]));
  assert.ok(!confirmBtn().disabled, 'a confirm that only realigns can go');
  await B.act(async () => { realignBox(5, 7).click(); });
  assert.ok(confirmBtn().disabled);
  assert.match(bodyText(), /Selecione ao menos uma transação ou um realinhamento\./);
  await B.act(async () => { realignBox(5, 7).click(); });
  fake.confirm = async () => ({ data: { ...OK_CONFIRM, imported: 0, realigned: 3, realignments: [{ id: 'credit:5:2', status: 'skipped', moved: 0, reason: 'a referência maxfin:2026-09:credit:5 já está em uso por outro lançamento' }] } });
  await rlConfirm();
  const [call] = confirmCalls();
  assert.deepEqual(call.payload.rows, []);
  assert.equal(call.payload.realignments[0].apply, true);
  assert.match(bodyText(), /Cartão, linhas 5 a 7: Não aplicado\. a referência maxfin:2026-09:credit:5 já está em uso por outro lançamento/, 'a failure or conflict is shown');
  await unmount();
});

scenario('RL4 an ambiguous block comes unticked with the reason; ticking it is up to the user; ticked, it is sent as apply true', async () => {
  await mount();
  const amb = rlProp({ defaultSelected: false, ambiguous: true, reason: 'há linhas iguais lado a lado (mesma descrição e valor)' });
  await toPreview(realignPreview(rlRows(), [amb]));
  const t = bodyText();
  assert.equal(realignBox(5, 7).checked, false);
  assert.match(t, /Ambígua/);
  assert.match(t, /Vem desmarcada: há linhas iguais lado a lado \(mesma descrição e valor\)/);
  assert.match(t, /1 bloco deslocado ficará pendente/);
  assert.ok(!realignBox(5, 7).disabled);
  await B.act(async () => { realignBox(5, 7).click(); });
  assert.equal(realignBox(5, 7).checked, true);
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await rlConfirm();
  assert.equal(confirmCalls()[0].payload.realignments[0].apply, true);
  await unmount();
});

scenario('RL5 `requires`: the upper block cannot be ticked while the lower one is not, and unticking the lower one unticks the upper', async () => {
  await mount();
  const lower = rlProp({ id: 'credit:12:3', firstLine: 12, lastLine: 14, shift: 3, moves: [rlMove(11, 9, 12), rlMove(12, 10, 13), rlMove(13, 11, 14)], insertedRefs: [] });
  const upper = rlProp({ requires: ['credit:12:3'] });
  await toPreview(realignPreview(rlRows(), [upper, lower]));
  let t = bodyText();
  assert.match(t, /Precisa ser aplicado junto com: Cartão, linhas 12 a 14/);
  assert.equal(realignBox(5, 7).checked, true);
  assert.equal(realignBox(12, 14).checked, true);
  await B.act(async () => { realignBox(12, 14).click(); });
  assert.equal(realignBox(12, 14).checked, false);
  assert.equal(realignBox(5, 7).checked, false, 'dragged along');
  assert.equal(realignBox(5, 7).disabled, true, 'cannot be ticked while the lower block is unticked');
  assert.match(bodyText(), /Marque antes: Cartão, linhas 12 a 14/);
  await B.act(async () => { realignBox(5, 7).click(); });
  assert.equal(realignBox(5, 7).checked, false, 'a click on it changes nothing');
  await B.act(async () => { realignBox(12, 14).click(); });
  assert.equal(realignBox(5, 7).disabled, false);
  await B.act(async () => { realignBox(5, 7).click(); });
  assert.equal(realignBox(5, 7).checked, true);
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await rlConfirm();
  assert.deepEqual(confirmCalls()[0].payload.realignments.map((d) => [d.id, d.apply, d.requires]), [['credit:5:2', true, ['credit:12:3']], ['credit:12:3', true, []]]);
  await unmount();
});

scenario('RL6 an older server (no realignments): no panel, no shifted wording, and the request has no realignments key', async () => {
  await mount();
  await toPreview(() => makePreview({ rows: [mkRow({ amount: 80 }), mkRow({ amount: 20 })] }));
  const t = bodyText();
  assert.doesNotMatch(t, /Linhas deslocadas|Realinhar|deslocad/);
  assert.match(t, /2 linhas selecionadas/);
  fake.confirm = async () => ({ data: OK_CONFIRM });
  await rlConfirm();
  assert.equal('realignments' in confirmCalls()[0].payload, false);
  assert.deepEqual(globalThis.__toasts.at(-1), ['success', '2 transações importadas.']);
  await unmount();
});

scenario('RL7 a removal block shows the removed rows that stay in the ledger; the moved transactions are listed', async () => {
  await mount();
  const removal = rlProp({
    id: 'credit:5:-1', kind: 'removal', shift: -1, firstLine: 5, lastLine: 6, moves: [rlMove(1, 6, 5), rlMove(2, 7, 6)], insertedRefs: [],
    removed: [{ transactionId: 'tx-gone', from: rl('credit', 5), to: rl('credit', 7), description: 'Compra apagada', amount: 33 }],
  });
  await toPreview(realignPreview([rlShifted(5), rlShifted(6)], [removal]));
  const t = bodyText();
  assert.match(t, /2 lançamentos sobem 1 linha \(linhas removidas acima\)/);
  assert.match(t, /1 lançamento removido da planilha continua no Prumo e assume a linha que o bloco desocupa/);
  assert.match(t, /Linha 6 → 5: Compra 1 · R\$ 10\.00/);
  assert.match(t, /Linha 5 → 7: Compra apagada · R\$ 33\.00/);
  await unmount();
});

scenario('RL8 workbook: the month with blocks says so, its card sits in the detail, and each month is confirmed with its own decisions', async () => {
  await mount();
  const sheets = wbSheets({ '2026-09': [wbRow('2026-09', { section: 'debit', amount: 20 })] });
  workbookServer(sheets);
  const original = fake.workbook;
  fake.workbook = async (u, b) => {
    const res = await original(u, b);
    for (const m of res.data.data.months) if (m.monthKey === '2026-09') m.realignments = [rlProp()];
    return res;
  };
  await toWorkbook();
  assert.match(bodyText(), /1 bloco deslocado/, 'chip in the months table');
  const monthSelect = document.getElementById('maxfin-wb-detail');
  await B.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set;
    setter.call(monthSelect, '2026-09');
    monthSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  });
  assert.equal(realignBox(5, 7).checked, true);
  assert.match(bodyText(), /1 bloco será realinhado \(3 lançamentos mudam de linha\)/);
  fake.confirm = async (_u, payload) => ({ data: payload.month.month === 9
    ? { ...OK_CONFIRM, imported: payload.rows.length, realigned: 3, realignments: [{ id: 'credit:5:2', status: 'applied', moved: 3, reason: null }] }
    : { ...OK_CONFIRM, imported: payload.rows.length } });
  await click(wbConfirmBtn());
  await flush(30);
  const sept = confirmCalls().map((c) => c.payload).find((p) => p.month.month === 9);
  assert.deepEqual(sept.realignments.map((d) => [d.id, d.apply]), [['credit:5:2', true]]);
  for (const p of confirmCalls().map((c) => c.payload).filter((p) => p.month.month !== 9)) assert.equal('realignments' in p, false, `month ${p.month.month}`);
  const t = bodyText();
  assert.match(t, /setembro\/2026: Cartão, linhas 5 a 7: Realinhado \(3\)/);
  assert.match(t, /3 lançamentos realinhados/);
  await unmount();
});

// ---- phase 3: card invoice (.ofx) dialog and the hand-off from the generic import --------------------------------
const { registerCardScenarios } = await import('./card-scenarios.mjs');
registerCardScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click });

// ---- phase 4: people and shared expenses (Dividir, settlement, person form, ledger, Organizar divisões) -------------
if (B.PeoplePage) {
  const { registerPeopleScenarios } = await import('./people-scenarios.mjs');
  registerPeopleScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click });
}

// ---- phase 5: Detectar recorrentes -----------------------------------------------------------------------------------
if (B.DetectDialog) {
  const { registerDetectScenarios } = await import('./detect-scenarios.mjs');
  registerDetectScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click });
}

// ---- gaps A/B/C of the card OFX import: closing, merges, reason chips, review queue --------------------------------
if (B.ReviewDialog) {
  const { registerReviewScenarios } = await import('./review-scenarios.mjs');
  registerReviewScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click });
}

// ---- unified import: hub, queues of invoices/statements, onboarding closing day -----------------------------------
if (B.HubDialog) {
  const { registerHubScenarios } = await import('./hub-scenarios.mjs');
  registerHubScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click });
}

// ---- Ajustar saldo (opening-balance adjustment of an account) -----------------------------------------------------------
if (B.AdjustDialog) {
  const { registerAdjustScenarios } = await import('./adjust-scenarios.mjs');
  registerAdjustScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click });
}

// ---- run ---------------------------------------------------------------------------------------------------------
let pass = 0; let pending = 0; const failed = [];
for (const s of scenarios) {
  if (filter && !filter.test(s.name)) continue;
  let error = null;
  try { await s.fn(); }
  catch (e) {
    error = e;
    try { await unmount(); } catch { /* ignore */ }
  }
  // tests/pending.json: a pending scenario that fails is "pend"; one that passes is a failure (take it off the list).
  const result = outcome(s.name, error === null);
  if (result === 'ok') { pass += 1; console.log(`  ok   ${s.name}`); }
  else if (result === 'pend') { pending += 1; console.log(`  pend ${s.name}\n       ${pendingReason(s.name)}`); }
  else if (result === 'pending-passed') { failed.push(s.name); console.log(`  FAIL ${s.name}\n       passes now: remove it from tests/pending.json`); }
  else {
    failed.push(s.name);
    console.log(`  FAIL ${s.name}\n       ${String(error.message).split('\n').slice(0, 6).join('\n       ')}`);
  }
}
console.log(`\nvariant: ${variant}\n${pass} passed, ${failed.length} failed, ${pending} pending (tests/pending.json)`);
if (failed.length) console.log(`Failed: ${failed.join(' | ')}`);
process.exit(failed.length ? 1 : 0);
