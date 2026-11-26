// Category manager simulation: drives the REAL CategoryManager, CategoryFormDialog, CategoryMergeDialog and CategoryCombobox
// (bundled with esbuild, real hooks and real DialogShell) under jsdom against a small stateful fake server written independently
// of the client. usage:  FRONTEND_DIR=<frontend checkout> node category-sim.mjs [nameFilter]
// jsdom comes from JSDOM_FROM (a package.json whose node_modules has it), like scenarios.mjs.
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(here, '../..');
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const SRC = (process.env.SRC_OVERRIDE ?? path.join(FRONT, 'src')).split(path.sep).join('/');
const variant = process.env.SIM_VARIANT ?? 'categories';

// ---- build ------------------------------------------------------------------------------------------------------------
const esbuild = createRequire(path.join(FRONT, 'package.json'))('esbuild');
const posix = (p) => p.split(path.sep).join('/');
const STUBS = {
  'utils/api': 'api-categories.ts',
  'context/ToastContext': 'ToastContext.ts',
  'context/I18nContext': 'I18nContext.ts',
};
const entryPath = path.join(here, `entry.${variant}.tsx`);
fs.writeFileSync(entryPath, `
import { createElement, StrictMode, useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CategoryManager from ${JSON.stringify(`${SRC}/components/categories/CategoryManager.tsx`)};
import CategoryCombobox from ${JSON.stringify(`${SRC}/components/CategoryCombobox.tsx`)};
function ComboHarness(props: any) {
  const [value, setValue] = useState('');
  (globalThis as any).__comboValue = value;
  return createElement('div', null, createElement(CategoryCombobox, { ...props, value, onValueChange: setValue }));
}
export { createElement, StrictMode, createRoot, act, QueryClient, QueryClientProvider, CategoryManager, CategoryCombobox, ComboHarness };
`);
await esbuild.build({
  entryPoints: [entryPath], outfile: path.join(here, 'out', `${variant}.mjs`), bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
  jsx: 'automatic', nodePaths: [path.join(FRONT, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
  plugins: [{
    name: 'stubs',
    setup(build) {
      build.onResolve({ filter: /^\./ }, (args) => {
        if (!args.importer) return null;
        const rel = posix(path.relative(SRC, posix(path.resolve(path.dirname(args.importer), args.path))));
        return rel in STUBS ? { path: path.join(here, 'stubs', STUBS[rel]) } : null;
      });
    },
  }],
  logLevel: 'warning', absWorkingDir: here,
});

// ---- jsdom ------------------------------------------------------------------------------------------------------------
const req = createRequire(process.env.JSDOM_FROM || new URL('../../package.json', import.meta.url));
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
globalThis.window = w;
for (const key of Object.getOwnPropertyNames(w)) {
  // every DOM constructor (Element, CustomEvent, ...) that Radix/floating-ui look up on the global object
  if (/^[A-Z]/.test(key) && !(key in globalThis)) { try { globalThis[key] = w[key]; } catch { /* read-only */ } }
}
for (const key of ['CustomEvent', 'EventTarget', 'AbortController', 'AbortSignal', 'document', 'localStorage', 'getComputedStyle', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'HTMLElement', 'Node', 'File']) {
  try { globalThis[key] = typeof w[key] === 'function' && key === 'getComputedStyle' ? w[key].bind(w) : w[key]; } catch { /* read-only */ }
}
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.ResizeObserver = globalThis.ResizeObserver;
w.HTMLElement.prototype.scrollIntoView = () => {};
w.HTMLElement.prototype.hasPointerCapture = () => false;

const B = await import(pathToFileURL(path.join(here, 'out', `${variant}.mjs`)).href);

// ---- the fake server (independent of the client: it computes usage and merges itself) -------------------------------------
const SYSTEM = [
  { id: 'SALARY', name: 'Salário', type: 'INCOME' }, { id: 'INVESTMENTS', name: 'Investimentos', type: 'INCOME' },
  { id: 'OTHER_INCOME', name: 'Outras Receitas', type: 'INCOME' },
  { id: 'FOOD', name: 'Alimentação', type: 'EXPENSE' }, { id: 'OTHER_EXPENSES', name: 'Outras Despesas', type: 'EXPENSE' },
];
const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const fakeState = () => ({
  custom: [
    { id: 'c-inv', name: 'Teste Investimento', type: 'INCOME', color: '#3B82F6', icon: null },
    { id: 'c-ren', name: 'Teste Rendimento', type: 'INCOME', color: null, icon: null },
    { id: 'c-vazia', name: 'Teste Vazia', type: 'EXPENSE', color: null, icon: null },
    { id: 'c-lazer', name: 'Teste Lazer', type: 'EXPENSE', color: null, icon: null },
  ],
  // [table, categoryName] rows: what is "used"
  rows: [
    ...Array.from({ length: 3 }, () => ['transactions', 'CUSTOM:c-inv']), ['recurring', 'CUSTOM:c-inv'],
    ...Array.from({ length: 2 }, () => ['transactions', 'CUSTOM:c-ren']), ['budgets', 'CUSTOM:c-ren'],
    ['transactions', 'INVESTMENTS'], ['transactions', 'CUSTOM:c-lazer'],
  ],
  nextId: 1, hold: {}, fail: {},
});
let S = fakeState();
const usageOf = (name) => ({
  transactions: S.rows.filter(([t, n]) => t === 'transactions' && n === name).length,
  recurringTransactions: S.rows.filter(([t, n]) => t === 'recurring' && n === name).length,
  budgets: S.rows.filter(([t, n]) => t === 'budgets' && n === name).length,
});
const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const gate = async (key) => { if (S.hold[key]) await S.hold[key].promise; if (S.fail[key]) { const f = S.fail[key]; delete S.fail[key]; throw f; } };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

globalThis.__catServer = async (method, url, payload) => {
  const [pathname, query = ''] = url.split('?');
  if (method === 'GET' && pathname === '/categories') {
    await gate('list');
    const withUsage = payload?.includeUsage === true;
    const list = [
      ...SYSTEM.filter((c) => !payload?.type || c.type === payload.type).map((c) => ({ ...c, color: '#888888', icon: null, isSystem: true, ...(withUsage && { usage: usageOf(c.id) }) })),
      ...S.custom.filter((c) => !payload?.type || c.type === payload.type).map((c) => ({ ...c, color: c.color ?? '#64748B', isSystem: false, ...(withUsage && { usage: usageOf(`CUSTOM:${c.id}`) }) })),
    ];
    return { success: true, data: list };
  }
  if (method === 'POST' && pathname === '/categories') {
    await gate('create');
    const clash = [...SYSTEM, ...S.custom].find((c) => c.type === payload.type && norm(c.name) === norm(payload.name));
    if (clash) throw err(409, 'CATEGORY_NAME_TAKEN', 'Category with this name and type already exists');
    const made = { id: `c-new-${S.nextId++}`, name: payload.name, type: payload.type, color: payload.color ?? null, icon: null };
    S.custom.push(made);
    return { success: true, data: { ...made, householdId: payload.householdId, isSystem: false } };
  }
  const merge = /^\/categories\/([^/]+)\/merge$/.exec(pathname);
  if (method === 'POST' && merge) {
    const preview = query.includes('preview=true');
    await gate(preview ? 'preview' : 'merge');
    const source = S.custom.find((c) => c.id === merge[1]);
    if (!source) throw err(404, 'NOT_FOUND', 'Category not found');
    const target = payload.targetCategoryId ? S.custom.find((c) => c.id === payload.targetCategoryId) : SYSTEM.find((c) => c.id === payload.targetSystemName);
    if (!target) throw err(404, 'NOT_FOUND', 'Target category not found');
    if (target.type !== source.type) throw err(400, 'CATEGORY_MERGE_TYPE_MISMATCH', 'Categories of different types cannot be merged');
    const from = `CUSTOM:${source.id}`;
    const to = payload.targetCategoryId ? `CUSTOM:${target.id}` : target.id;
    const counts = { transactions: usageOf(from).transactions, recurringTransactions: usageOf(from).recurringTransactions, budgets: usageOf(from).budgets, budgetsCombined: payload.targetCategoryId === 'c-ren' ? 1 : 0 };
    if (!preview) {
      S.rows = S.rows.map(([t, n]) => [t, n === from ? to : n]);
      S.custom = S.custom.filter((c) => c.id !== source.id);
    }
    return { success: true, data: { preview, sourceId: source.id, sourceName: source.name, type: source.type, target: { id: target.id, name: target.name, isSystem: !payload.targetCategoryId }, counts } };
  }
  const one = /^\/categories\/([^/]+)$/.exec(pathname);
  if (method === 'PATCH' && one) {
    await gate('patch');
    const cat = S.custom.find((c) => c.id === one[1]);
    if (!cat) throw err(404, 'NOT_FOUND', 'Category not found');
    if (payload.name && [...SYSTEM, ...S.custom].some((c) => c.id !== cat.id && c.type === cat.type && norm(c.name) === norm(payload.name))) throw err(409, 'CATEGORY_NAME_TAKEN', 'taken');
    Object.assign(cat, payload);
    return { success: true, data: { ...cat, isSystem: false } };
  }
  if (method === 'DELETE' && one) {
    await gate('delete');
    const used = usageOf(`CUSTOM:${one[1]}`);
    if (used.transactions + used.recurringTransactions + used.budgets > 0) throw err(400, 'CATEGORY_IN_USE', 'Category is in use');
    S.custom = S.custom.filter((c) => c.id !== one[1]);
    return { success: true };
  }
  throw new Error(`unexpected ${method} ${url}`);
};

// ---- DOM helpers ------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = async (ms = 0) => { await B.act(async () => { await sleep(ms); }); };
const all = (sel) => [...document.body.querySelectorAll(sel)];
const text = (el) => (el.textContent ?? '').trim();
const btn = (re) => all('button').find((b) => re.test(text(b)) || re.test(b.getAttribute('aria-label') ?? '') || re.test(b.getAttribute('title') ?? ''));
const bodyText = () => document.body.textContent ?? '';
const calls = (method, re) => globalThis.__catCalls.filter((c) => c.method === method && re.test(c.url));
async function click(el) {
  assert.ok(el, 'click target missing');
  await B.act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); });
  await flush(0);
}
async function typeInto(el, value) {
  assert.ok(el, 'input missing');
  await B.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
  });
  await flush(0);
}
async function select(el, value) {
  await B.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new w.Event('change', { bubbles: true }));
  });
  await flush(0);
}
async function key(el, k) {
  await B.act(async () => { el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
  await flush(0);
}

let current = null;
async function mountManager({ canEdit = true } = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  S = fakeState();
  globalThis.__catCalls = [];
  globalThis.__toasts = [];
  globalThis.__translations = { delete: 'Excluir', cancel: 'Cancelar', loading: 'Carregando…' };
  const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const root = B.createRoot(document.getElementById('root'));
  await B.act(async () => { root.render(B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.CategoryManager, { householdId: 'h1', canEdit }))); });
  await flush(20);
  current = { root, qc };
}
async function mountCombo(props) {
  document.body.innerHTML = '<div id="root"></div>';
  S = fakeState();
  globalThis.__catCalls = [];
  globalThis.__toasts = [];
  globalThis.__comboValue = '';
  const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const root = B.createRoot(document.getElementById('root'));
  await B.act(async () => { root.render(B.createElement(B.QueryClientProvider, { client: qc }, B.createElement(B.ComboHarness, { householdId: 'h1', ...props }))); });
  await flush(20);
  current = { root, qc };
}
async function unmount() {
  if (!current) return;
  await B.act(async () => { current.root.unmount(); });
  document.body.innerHTML = '';
  current = null;
}
const row = (name) => all('li').find((li) => text(li).includes(name));
const dialog = () => document.querySelector('[role=dialog]');
const alertText = () => (dialog()?.querySelector('[role=alert]') ? text(dialog().querySelector('[role=alert]')) : '');

// ---- scenarios --------------------------------------------------------------------------------------------------------
const scenarios = [];
const scenario = (name, fn) => scenarios.push([name, fn]);

scenario('CM1 lists Receitas and Despesas: system rows read-only with the Padrão badge, custom rows with usage', async () => {
  await mountManager();
  assert.ok(all('section[aria-label="Receitas"]').length === 1 && all('section[aria-label="Despesas"]').length === 1);
  const inv = row('Teste Investimento');
  assert.match(text(inv), /3 transações e 1 recorrência/);
  assert.ok(inv.querySelector('button[aria-label="Editar Teste Investimento"]') && inv.querySelector('button[aria-label^="Unir Teste Investimento"]'));
  const sys = row('Investimentos');
  assert.match(text(sys), /Padrão/);
  assert.match(text(sys), /1 transação/);
  assert.equal(sys.querySelectorAll('button').length, 0, 'system rows have no actions');
  assert.ok(!bodyText().includes('Transferência') && !bodyText().includes('Alocação'));
  assert.ok(!/CUSTOM:|INVESTMENTS|OTHER_INCOME/.test(bodyText()), 'no raw slugs');
  assert.equal(all('li').filter((li) => /Teste Vazia/.test(text(li)))[0].querySelector('button[aria-label="Excluir Teste Vazia"]') !== null, true, 'unused: delete offered');
  assert.equal(row('Teste Investimento').querySelector('button[aria-label^="Excluir"]'), null, 'used: no delete');
  assert.match(text(row('Teste Investimento')), /em uso/);
  await unmount();
});

scenario('CM2 a viewer sees the list but no create/edit/merge/delete', async () => {
  await mountManager({ canEdit: false });
  assert.ok(row('Teste Investimento'));
  assert.equal(all('button').length, 0);
  await unmount();
});

scenario('CM3 create: type + name, POST once with the household, list refreshes, dialog closes', async () => {
  await mountManager();
  await click(btn(/Nova categoria de receita/));
  assert.ok(dialog());
  const input = document.getElementById('category-name');
  await typeInto(input, '  Vale   Alimentação ');
  const save = btn(/^Criar$/);
  assert.ok(!save.disabled);
  await click(save);
  await flush(20);
  const posts = calls('POST', /^\/categories$/);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].payload, { householdId: 'h1', name: 'Vale Alimentação', type: 'INCOME', color: null });
  assert.equal(dialog(), null, 'closed after saving');
  assert.ok(row('Vale Alimentação'));
  assert.deepEqual(globalThis.__toasts.at(-1), ['success', 'Categoria criada.']);
  await unmount();
});

scenario('CM4 a name equal to a system or custom category is refused before any request, with the reason', async () => {
  await mountManager();
  await click(btn(/Nova categoria de receita/));
  await typeInto(document.getElementById('category-name'), 'investimentos');
  assert.match(alertText(), /categoria padrão "Investimentos"/);
  assert.ok(btn(/^Criar$/).disabled);
  await typeInto(document.getElementById('category-name'), 'teste  INVESTIMENTO');
  assert.match(alertText(), /Teste Investimento/);
  await typeInto(document.getElementById('category-name'), 'Investimento');
  assert.equal(alertText(), '');
  assert.ok(!btn(/^Criar$/).disabled, 'singular is a different name');
  assert.equal(calls('POST', /^\/categories$/).length, 0);
  await unmount();
});

scenario('CM5 the server saying the name is taken is shown in words, the dialog stays open', async () => {
  await mountManager();
  await click(btn(/Nova categoria de despesa/));
  await typeInto(document.getElementById('category-name'), 'Nome livre');
  S.fail.create = err(409, 'CATEGORY_NAME_TAKEN', 'Category with this name and type already exists');
  await click(btn(/^Criar$/));
  await flush(20);
  assert.ok(dialog(), 'stays open');
  assert.match(alertText(), /Já existe uma categoria com esse nome/);
  assert.ok(!/CATEGORY_NAME_TAKEN/.test(bodyText()));
  assert.equal(globalThis.__toasts.at(-1)[0], 'error');
  await unmount();
});

scenario('CM6 rename sends only the name; nothing changed disables Salvar; colour sends only the colour', async () => {
  await mountManager();
  await click(btn(/^Editar Teste Rendimento$/));
  const save = () => btn(/^Salvar$/);
  assert.ok(save().disabled, 'unchanged');
  await typeInto(document.getElementById('category-name'), 'Teste Rendimentos');
  assert.ok(!save().disabled);
  await click(save());
  await flush(20);
  const patches = calls('PATCH', /^\/categories\/c-ren$/);
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0].payload, { name: 'Teste Rendimentos' });
  assert.ok(row('Teste Rendimentos'));
  await click(btn(/^Editar Teste Rendimentos$/));
  await click(btn(/^Cor #22C55E$/));
  await click(save());
  await flush(20);
  assert.deepEqual(calls('PATCH', /^\/categories\/c-ren$/)[1].payload, { color: '#22C55E' });
  await unmount();
});

scenario('CM7 delete: only an unused category, after a confirmation, one DELETE', async () => {
  await mountManager();
  await click(btn(/^Excluir Teste Vazia$/));
  assert.match(bodyText(), /Excluir "Teste Vazia"\?/);
  assert.equal(calls('DELETE', /./).length, 0, 'nothing before the confirmation');
  const confirm = all('button').filter((b) => text(b) === 'Excluir').pop();
  await click(confirm);
  await flush(20);
  assert.equal(calls('DELETE', /^\/categories\/c-vazia$/).length, 1);
  assert.ok(!row('Teste Vazia'));
  await unmount();
});

scenario('CM8 merge: the target list is of the same type, preview counts shown, confirm moves and closes', async () => {
  await mountManager();
  await click(btn(/^Unir Teste Investimento com/));
  const sel = document.getElementById('category-merge-target');
  const options = [...sel.querySelectorAll('option')].map((o) => text(o));
  assert.deepEqual(options, ['Escolha…', 'Teste Rendimento', 'Investimentos', 'Outras Receitas', 'Salário']);
  assert.ok(btn(/^Unir categorias$/).disabled, 'no confirm before a target and its preview');
  await select(sel, 'custom:c-ren');
  await flush(20);
  assert.equal(calls('POST', /merge\?preview=true$/).length, 1);
  assert.deepEqual(calls('POST', /merge\?preview=true$/)[0].payload, { targetCategoryId: 'c-ren' });
  assert.match(text(dialog()), /Vão para Teste Rendimento: 3 transações, 1 recorrência e 1 orçamento/);
  assert.match(text(dialog()), /limites dos dois serão somados/);
  assert.match(text(dialog()), /não pode ser desfeita/);
  await click(btn(/^Unir categorias$/));
  await flush(20);
  const merges = calls('POST', /\/merge$/);
  assert.equal(merges.length, 1);
  assert.deepEqual(merges[0].payload, { targetCategoryId: 'c-ren' });
  assert.equal(dialog(), null);
  assert.ok(!row('Teste Investimento'), 'source gone from the list');
  assert.match(text(row('Teste Rendimento')), /5 transações, 1 recorrência e 1 orçamento/);
  assert.match(globalThis.__toasts.at(-1)[1], /foi unida com "Teste Rendimento"/);
  await unmount();
});

scenario('CM9 merge into a system category sends targetSystemName', async () => {
  await mountManager();
  await click(btn(/^Unir Teste Investimento com/));
  await select(document.getElementById('category-merge-target'), 'system:INVESTMENTS');
  await flush(20);
  assert.deepEqual(calls('POST', /merge\?preview=true$/)[0].payload, { targetSystemName: 'INVESTMENTS' });
  await click(btn(/^Unir categorias$/));
  await flush(20);
  assert.deepEqual(calls('POST', /\/merge$/)[0].payload, { targetSystemName: 'INVESTMENTS' });
  assert.match(text(row('Investimentos')), /Padrão/);
  assert.match(text(row('Investimentos')), /4 transações e 1 recorrência/);
  await unmount();
});

scenario('CM10 latest wins: a slow preview of an earlier pick never replaces the newer one', async () => {
  await mountManager();
  await click(btn(/^Unir Teste Investimento com/));
  const sel = document.getElementById('category-merge-target');
  S.hold.preview = deferred();
  await select(sel, 'custom:c-ren'); // held
  const first = S.hold.preview;
  S.hold.preview = null;
  await select(sel, 'system:INVESTMENTS'); // answers at once
  await flush(20);
  assert.match(text(dialog()), /Vão para Investimentos:/);
  first.resolve();
  await flush(20);
  assert.match(text(dialog()), /Vão para Investimentos:/, 'the late answer is dropped');
  assert.ok(!/Teste Rendimento:/.test(text(dialog())));
  await click(btn(/^Unir categorias$/));
  await flush(20);
  assert.deepEqual(calls('POST', /\/merge$/)[0].payload, { targetSystemName: 'INVESTMENTS' }, 'the confirm uses the newest pick');
  await unmount();
});

scenario('CM11 while the merge runs the dialog cannot be closed and the button cannot fire twice', async () => {
  await mountManager();
  await click(btn(/^Unir Teste Investimento com/));
  await select(document.getElementById('category-merge-target'), 'custom:c-ren');
  await flush(20);
  S.hold.merge = deferred();
  await click(btn(/^Unir categorias$/));
  assert.ok(btn(/^Unindo…$/).disabled);
  await key(document, 'Escape');
  await B.act(async () => { window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await click(dialog().querySelector('[data-shell-close]'));
  assert.ok(dialog(), 'ESC and the X are ignored while merging');
  await click(btn(/^Unindo…$/));
  S.hold.merge.resolve();
  await flush(20);
  assert.equal(calls('POST', /\/merge$/).length, 1);
  assert.equal(dialog(), null);
  await unmount();
});

scenario('CM12 the source already merged elsewhere: clear message, list refreshed, nothing sent twice', async () => {
  await mountManager();
  await click(btn(/^Unir Teste Investimento com/));
  await select(document.getElementById('category-merge-target'), 'custom:c-ren');
  await flush(20);
  S.custom = S.custom.filter((c) => c.id !== 'c-inv'); // somebody else merged it meanwhile
  await click(btn(/^Unir categorias$/));
  await flush(20);
  assert.match(alertText(), /não existe mais/);
  assert.ok(!/NOT_FOUND|Category not found/.test(bodyText().replace(/Teste/g, '')) || !/NOT_FOUND/.test(bodyText()));
  await click(btn(/^Cancelar$/));
  await flush(20);
  assert.ok(!row('Teste Investimento'), 'list refetched');
  await unmount();
});

scenario('CM14 the source is gone before the preview: the preview says so and the list is refreshed (merge button stays off)', async () => {
  await mountManager();
  await click(btn(/^Unir Teste Investimento com/));
  S.custom = S.custom.filter((c) => c.id !== 'c-inv'); // merged elsewhere while the dialog was open
  await select(document.getElementById('category-merge-target'), 'custom:c-ren');
  await flush(20);
  assert.match(alertText(), /não existe mais/);
  assert.ok(btn(/^Unir categorias$/).disabled);
  assert.equal(calls('POST', /\/merge$/).length, 0, 'nothing was merged');
  await click(btn(/^Cancelar$/));
  await flush(20);
  assert.ok(!row('Teste Investimento'), 'the list was refetched by the preview failure alone');
  await unmount();
});

scenario('CM13 while a category is being saved the form cannot be closed and saves once', async () => {
  await mountManager();
  await click(btn(/Nova categoria de despesa/));
  await typeInto(document.getElementById('category-name'), 'Nome lento');
  S.hold.create = deferred();
  await click(btn(/^Criar$/));
  await B.act(async () => { window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await click(dialog().querySelector('[data-shell-close]'));
  assert.ok(dialog(), 'ESC and the X are ignored while saving');
  assert.ok(btn(/^Salvando…$/).disabled);
  S.hold.create.resolve();
  await flush(20);
  assert.equal(calls('POST', /^\/categories$/).length, 1);
  assert.equal(dialog(), null);
  await unmount();
});

const COMBO = { type: 'INCOME', allowCreate: true };
const openCombo = async () => { await click(all('button').find((b) => b.getAttribute('aria-haspopup') === 'dialog' || /Selecione|Categoria|categoria/i.test(text(b)))); await flush(10); };
const searchBox = () => document.querySelector('input[type=text]');
const createBtn = () => btn(/^Criar “/);

scenario('CC1 inline create: text that matches nothing offers Criar “texto”; one POST of the form type; selected by name', async () => {
  await mountCombo(COMBO);
  await openCombo();
  await typeInto(searchBox(), 'Vale Alimentação');
  assert.ok(createBtn(), 'offered');
  assert.equal(text(createBtn()), 'Criar “Vale Alimentação”');
  S.hold.list = deferred(); // the list refetch after the create is slow: the name must show before it arrives
  await click(createBtn());
  await flush(20);
  const posts = calls('POST', /^\/categories$/);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].payload, { householdId: 'h1', name: 'Vale Alimentação', type: 'INCOME' });
  assert.match(globalThis.__comboValue, /^CUSTOM:c-new-1$/);
  assert.match(text(document.getElementById('root')), /Vale Alimentação/, 'the trigger shows the name');
  assert.ok(!/CUSTOM:/.test(text(document.getElementById('root'))), 'never the raw value');
  S.hold.list.resolve();
  await flush(20);
  assert.match(text(document.getElementById('root')), /Vale Alimentação/);
  await unmount();
});

scenario('CC2 no create option for a name that already exists (case/accents), for empty text or without allowCreate', async () => {
  await mountCombo(COMBO);
  await openCombo();
  await typeInto(searchBox(), 'investimentos');
  assert.equal(createBtn(), undefined, 'system category matches');
  await typeInto(searchBox(), 'TESTE rendimento');
  assert.equal(createBtn(), undefined, 'custom category matches');
  await typeInto(searchBox(), '   ');
  assert.equal(createBtn(), undefined);
  await unmount();
  await mountCombo({ type: 'INCOME' });
  await openCombo();
  await typeInto(searchBox(), 'Nome inexistente');
  assert.equal(createBtn(), undefined, 'off by default (filters)');
  await unmount();
  await mountCombo({ allowCreate: true });
  await openCombo();
  await typeInto(searchBox(), 'Nome inexistente');
  assert.equal(createBtn(), undefined, 'needs the form type');
  await unmount();
});

scenario('CC3 Enter with no match creates; a double activation creates once', async () => {
  await mountCombo({ type: 'EXPENSE', allowCreate: true });
  await openCombo();
  await typeInto(searchBox(), 'Pet Shop');
  S.hold.create = deferred();
  await key(searchBox(), 'Enter');
  await key(searchBox(), 'Enter');
  assert.ok(btn(/^Criando…$/).disabled, 'busy label, button disabled');
  await click(btn(/^Criando…$/));
  assert.equal(calls('POST', /^\/categories$/).length, 1, 'one request while one is in flight');
  S.hold.create.resolve();
  await flush(20);
  assert.equal(calls('POST', /^\/categories$/).length, 1);
  assert.deepEqual(calls('POST', /^\/categories$/)[0].payload, { householdId: 'h1', name: 'Pet Shop', type: 'EXPENSE' });
  assert.equal(globalThis.__comboValue, 'CUSTOM:c-new-1');
  await unmount();
});

scenario('CC4 a failed create keeps the popover, says why in words and selects nothing', async () => {
  await mountCombo(COMBO);
  await openCombo();
  await typeInto(searchBox(), 'Outro Nome');
  S.fail.create = err(409, 'CATEGORY_NAME_TAKEN', 'x');
  await click(createBtn());
  await flush(20);
  assert.ok(searchBox(), 'popover still open');
  assert.match(text(document.querySelector('[role=alert]')), /Já existe uma categoria com esse nome/);
  assert.equal(globalThis.__comboValue, '');
  await unmount();
});

// ---- run --------------------------------------------------------------------------------------------------------------
let failed = 0;
for (const [name, fn] of scenarios) {
  if (filter && !filter.test(name)) continue;
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').slice(0, 6).join('\n       ')}`);
    try { await unmount(); } catch { /* ignore */ }
  }
}
console.log(failed === 0 ? `${scenarios.length} scenarios ok` : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
