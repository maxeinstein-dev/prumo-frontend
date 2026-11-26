// Unified import: scenarios of the REAL ImportHubDialog (detection, override, mixed kinds, hand-off), of the queue
// of card invoices (ImportCardOfxDialog `files`) and of bank statements (ImportTransactionsDialog `initialFiles`),
// and of the onboarding account step with the closing day. Registered by scenarios.mjs (names `H*`, `Q*`, `S*`,
// `O*`); the fake server is the one of stubs/api.ts. Every fixture is invented.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(here, '../..');

export function registerHubScenarios({ B, w, fake, scenario, flush, all, btn, bodyText, click }) {
  // The hub reads the start of each file with FileReader when Blob.arrayBuffer is not there (jsdom).
  if (!globalThis.FileReader) globalThis.FileReader = w.FileReader;

  // ---- fixtures ---------------------------------------------------------------------------------------------
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const ACCOUNTS = [
    { id: 'acc-main', householdId: 'h1', name: 'Conta Principal', type: 'CHECKING', isActive: true },
    { id: 'acc-card', householdId: 'h1', name: 'Nubank', type: 'CREDIT', isActive: true, closingDay: 2 },
    { id: 'acc-card2', householdId: 'h1', name: 'Outro Cartão', type: 'CREDIT', isActive: true, closingDay: 5 },
    { id: 'acc-savings', householdId: 'h1', name: 'Poupança', type: 'SAVINGS', isActive: true },
  ];
  const cardOfx = (start) =>
    `OFXHEADER:100\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST><DTSTART>${start}000000[-3:BRT]<DTEND>${start}</BANKTRANLIST>`;
  const bankOfx = (start) => `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><DTSTART>${start}000000<DTEND>${start}`;
  const SHEET_CSV = [
    '"Mês de setembro de 2026\n(planilha de exemplo)",,,,,,,,,',
    ',Descrição,Categoria,Previsto,Recebido,,Previsto,Realizado,,Notas',
    ',Salário Exemplo,,"R$ 1.000,00","R$ 1.000,00",,,,,',
    ',Aluguel,Casa,,,,"R$ 500,00","R$ 500,00",,',
    ',Total,,,,,"R$ 500,00","R$ 500,00",,',
    ',Mercado Alfa,Casa,,,,"R$ 80,00","R$ 80,00",,',
    ',Total,,,,,"R$ 80,00",,,',
    ',Pix Padaria,Casa,,,,"R$ 35,00","R$ 35,00",,',
    ',Total,,,,,"R$ 35,00","R$ 35,00",,',
  ].join('\r\n');
  const STATEMENT_CSV = 'Data,Descrição,Valor\n2026-09-01,Padaria Beta,-12.50\n';
  const file = (name, text = 'x') => new w.File([text], name);
  const xlsx = (name) => new w.File([new Uint8Array([0x50, 0x4b, 3, 4])], name);

  // ---- mounting ---------------------------------------------------------------------------------------------
  let current = null;
  async function mountWith(render, { accounts = ACCOUNTS, setup = null } = {}) {
    document.body.innerHTML = '<div id="root"></div>';
    w.localStorage.clear();
    fake.calls = [];
    for (const key of ['preview', 'workbook', 'confirm', 'cardPreview', 'cardConfirm', 'statementPreview']) fake[key] = null;
    globalThis.__toasts = [];
    globalThis.__defaultHousehold = undefined;
    globalThis.__accountsPayload = { accounts: clone(accounts), totals: [] };
    globalThis.__categoriesPayload = [];
    if (setup) setup();
    const qc = new B.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const root = B.createRoot(document.getElementById('root'));
    let closed = 0;
    const onClose = () => { closed += 1; };
    await B.act(async () => { root.render(B.createElement(B.QueryClientProvider, { client: qc }, render(onClose))); });
    await flush(30);
    current = { root, qc, get closed() { return closed; } };
    return current;
  }
  async function unmountAll() {
    if (!current) return;
    const { root } = current;
    current = null;
    await B.act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
  const hubScenario = (name, fn) => scenario(name, async () => {
    try { await fn(); } finally { await unmountAll(); delete globalThis.__translations; }
  });
  const mountHub = (opts = {}) => mountWith((onClose) =>
    B.createElement(B.HubDialog, { open: true, onClose, householdId: 'h1', defaultAccountId: opts.defaultAccountId ?? null }), opts);

  // ---- DOM helpers ------------------------------------------------------------------------------------------
  async function pickFiles(files) {
    const input = document.getElementById('import-hub-file');
    assert.ok(input, 'hub file input missing');
    assert.equal(input.multiple, true, 'the picker takes several files');
    assert.equal(input.getAttribute('accept'), '.csv,.ofx,.xlsx');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    await B.act(async () => { input.dispatchEvent(new w.Event('change', { bubbles: true })); });
    await flush(40);
  }
  async function changeSelect(el, value) {
    assert.ok(el, 'select missing');
    await B.act(async () => { el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); });
    await flush(10);
  }
  async function typeInto(el, value) {
    assert.ok(el, 'input missing');
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    await B.act(async () => { setter.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })); });
    await flush(10);
  }
  const rows = () => all('ul[aria-label="Arquivos selecionados"] > li');
  const rowFor = (name) => rows().find((li) => li.querySelector('span[title]')?.getAttribute('title') === name);
  const rowNames = () => rows().map((li) => li.querySelector('span[title]').getAttribute('title'));
  const typeSelect = (name) => all('select').find((s) => s.getAttribute('aria-label') === `Tipo de ${name}`);
  const continueBtn = () => btn(/^Continuar$/);
  const sel = (id) => document.getElementById(id);
  const optionLabels = (el) => [...el.querySelectorAll('option')].map((o) => o.textContent);
  const alertText = () => all('[role="alert"]').map((a) => a.textContent).join(' | ');
  const calls = (kind) => fake.calls.filter((c) => c.kind === kind);

  // =======================================================================================================
  // Hub
  // =======================================================================================================

  hubScenario('H1 the hub detects each file by name and a sniff of its content, and shows it next to the file', async () => {
    await mountHub();
    await pickFiles([
      file('fatura.ofx', cardOfx('20260902')), file('extrato.ofx', bankOfx('20260901')), file('OUT.csv', SHEET_CSV), xlsx('ANO.xlsx'),
      file('banco.csv', STATEMENT_CSV),
    ]);
    const detected = (name) => /Detectado:\s*(.*?)\s*Tipo/s.exec(rowFor(name).textContent)?.[1];
    assert.equal(detected('fatura.ofx'), 'Fatura do cartão (OFX)');
    assert.equal(detected('extrato.ofx'), 'Extrato (OFX/CSV)');
    assert.equal(detected('OUT.csv'), 'Planilha mensal (CSV)');
    assert.equal(detected('ANO.xlsx'), 'Pasta de trabalho (XLSX)');
    assert.equal(detected('banco.csv'), 'Extrato (OFX/CSV)', 'a csv with a Descrição column but no Total rows is a statement');
    assert.equal(typeSelect('fatura.ofx').value, 'card');
    assert.equal(typeSelect('OUT.csv').value, 'sheet');
    assert.equal(typeSelect('ANO.xlsx').value, 'workbook');
    assert.deepEqual(optionLabels(typeSelect('fatura.ofx')), ['Fatura do cartão (OFX)', 'Extrato (OFX/CSV)']);
    assert.deepEqual(optionLabels(typeSelect('OUT.csv')), ['Planilha mensal (CSV)', 'Extrato (OFX/CSV)']);
    assert.equal(typeSelect('ANO.xlsx').disabled, true, 'a workbook can only be a workbook');
    assert.equal(rowFor('fatura.ofx').textContent.includes('Período desde 02/09/2026 (início do período no OFX)'), true);
  });

  hubScenario('H2 the "Tipo" select overrides the detection and changes what the hub asks for', async () => {
    await mountHub();
    await pickFiles([file('banco.csv', STATEMENT_CSV)]);
    assert.ok(sel('import-hub-account'), 'a statement asks for the destination account');
    assert.equal(sel('import-hub-account-income'), null);
    await changeSelect(typeSelect('banco.csv'), 'sheet');
    assert.equal(sel('import-hub-account'), null);
    for (const key of ['income', 'bills', 'credit', 'debit']) assert.ok(sel(`import-hub-account-${key}`), `block ${key}`);
    assert.match(rowFor('banco.csv').textContent, /Detectado:\s*Extrato \(OFX\/CSV\)/, 'the detection stays visible');
    await changeSelect(typeSelect('banco.csv'), 'statement');
    assert.ok(sel('import-hub-account'));
    await unmountAll();

    await mountHub();
    await pickFiles([file('fatura.ofx', cardOfx('20260902'))]);
    assert.ok(sel('import-hub-card'));
    await changeSelect(typeSelect('fatura.ofx'), 'statement');
    assert.ok(sel('import-hub-account'), 'an invoice sent as a statement asks for a bank account');
    assert.equal(sel('import-hub-card'), null);
  });

  hubScenario('H3 mixed kinds: a clear message says to import them separately and Continue stays off', async () => {
    await mountHub();
    await pickFiles([file('fatura.ofx', cardOfx('20260902')), file('extrato.ofx', bankOfx('20260901'))]);
    assert.match(alertText(), /tipos diferentes/);
    assert.match(alertText(), /Fatura do cartão \(OFX\)/);
    assert.match(alertText(), /Extrato \(OFX\/CSV\)/);
    assert.match(alertText(), /Importe cada tipo separadamente/);
    assert.equal(continueBtn().disabled, true);
    assert.equal(sel('import-hub-card'), null, 'no destination is asked while the selection is mixed');
    // fixing it: remove the odd one out
    await click(btn(/^Remover extrato\.ofx$/));
    assert.doesNotMatch(alertText(), /tipos diferentes/);
    assert.ok(sel('import-hub-card'));
    // or turning it into the same kind with the select
    await pickFiles([file('extrato.ofx', bankOfx('20260901'))]);
    assert.match(alertText(), /tipos diferentes/);
    await changeSelect(typeSelect('extrato.ofx'), 'card');
    assert.doesNotMatch(alertText(), /tipos diferentes/);
    assert.deepEqual(rowNames().length, 2);
  });

  hubScenario('H4 one card invoice: the card chosen on the credit card page is preselected and the invoice dialog opens on it', async () => {
    const m = await mountHub({ defaultAccountId: 'acc-card2' });
    await pickFiles([file('fatura.ofx', cardOfx('20260902'))]);
    assert.equal(sel('import-hub-card').value, 'acc-card2');
    assert.deepEqual(optionLabels(sel('import-hub-card')), ['Selecione um cartão', 'Nubank', 'Outro Cartão']);
    fake.cardPreview = async (_u, body) => ({ data: { data: emptyCardPreview(body.get('accountId'), 1) } });
    await click(continueBtn());
    await flush(30);
    assert.match(bodyText(), /Importar fatura do cartão \(OFX\)/);
    const [call] = calls('card-preview');
    assert.equal(call.body.get('accountId'), 'acc-card2');
    assert.equal(call.body.get('file').name, 'fatura.ofx');
    assert.equal(m.closed, 0);
    assert.equal(document.querySelector('section[aria-label="Fila de importação"]'), null, 'a single invoice has no queue panel');
  });

  hubScenario('H5 several invoices are ordered by the start of the period in the OFX header, oldest first', async () => {
    await mountHub({ defaultAccountId: 'acc-card' });
    await pickFiles([file('fatura-c.ofx', cardOfx('20261002')), file('fatura-a.ofx', cardOfx('20260802')), file('fatura-b.ofx', cardOfx('20260902'))]);
    assert.deepEqual(rowNames(), ['fatura-a.ofx', 'fatura-b.ofx', 'fatura-c.ofx']);
    assert.match(rowFor('fatura-a.ofx').textContent, /1\./);
    assert.match(bodyText(), /3 faturas em ordem de período/);
    fake.cardPreview = async (_u, body) => ({ data: { data: emptyCardPreview(body.get('accountId'), 1) } });
    await click(continueBtn());
    await flush(30);
    assert.match(bodyText(), /Fatura 1 de 3/);
    assert.deepEqual(calls('card-preview').map((c) => c.body.get('file').name), ['fatura-a.ofx'], 'only the oldest is previewed');
  });

  hubScenario('H6 a bank statement goes to a non-credit account and imports through the statement preview', async () => {
    const m = await mountHub({ defaultAccountId: 'acc-card' });
    await pickFiles([file('extrato.ofx', bankOfx('20260901'))]);
    assert.deepEqual(optionLabels(sel('import-hub-account')), ['Selecione uma conta', 'Conta Principal', 'Poupança'], 'no credit card');
    assert.equal(sel('import-hub-account').value, '', 'the card the hub was opened for does not fit a statement');
    assert.equal(continueBtn().disabled, true, 'a destination is needed');
    await changeSelect(sel('import-hub-account'), 'acc-main');
    assert.equal(continueBtn().disabled, false);
    fake.statementPreview = async () => ({ data: { data: { rows: [
      { index: 0, date: '2026-09-01', description: 'Padaria Beta', amount: 12.5, type: 'EXPENSE', duplicate: false },
      { index: 1, date: '2026-09-02', description: 'Mercado Alfa', amount: 40, type: 'EXPENSE', duplicate: true },
    ], total: 2, duplicateCount: 1, newCount: 1 } } });
    await click(continueBtn());
    await flush(30);
    const [call] = calls('statement-preview');
    assert.equal(call.body.get('accountId'), 'acc-main');
    assert.equal(call.body.get('file').name, 'extrato.ofx');
    assert.match(bodyText(), /Padaria Beta/);
    fake.confirm = async (_u, payload) => ({ data: { imported: payload.rows.filter((r) => r.description !== 'Mercado Alfa').length, skipped: 1, ids: [] } });
    await click(btn(/^Confirmar importação$/));
    await flush(30);
    const [confirm] = calls('confirm');
    assert.equal(confirm.payload.accountId, 'acc-main');
    assert.deepEqual(confirm.payload.rows.map((r) => r.description), ['Padaria Beta', 'Mercado Alfa'], 'the whole file goes, the duplicate row included: the server counts identical rows by occurrence over the same list');
    assert.equal(m.closed, 1, 'a single statement closes after the confirm, like the old dialog');
  });

  hubScenario('H7 a monthly sheet asks for the four accounts (remembered choices first) and starts its preview with them', async () => {
    await mountHub();
    w.localStorage.setItem('prumo.maxfin.accounts', JSON.stringify({ h1: { income: 'acc-savings', bills: 'acc-main', credit: 'acc-card2', debit: 'acc-main' } }));
    await pickFiles([file('OUT.csv', SHEET_CSV)]);
    assert.equal(sel('import-hub-account-income').value, 'acc-savings');
    assert.equal(sel('import-hub-account-credit').value, 'acc-card2');
    assert.equal(sel('import-hub-account-debit').value, 'acc-main');
    await changeSelect(sel('import-hub-account-bills'), 'acc-savings');
    fake.preview = async () => { throw new Error('servidor de teste'); };
    await click(continueBtn());
    await flush(40);
    const [call] = calls('preview');
    assert.ok(call, 'the monthly sheet preview started without asking again');
    assert.equal(call.body.get('file').name, 'OUT.csv');
    assert.deepEqual(JSON.parse(call.body.get('accounts')), { income: 'acc-savings', bills: 'acc-savings', credit: 'acc-card2', debit: 'acc-main' });
    assert.match(bodyText(), /Arquivo da planilha \(\.csv ou \.xlsx/, 'the sheet dialog is showing (its preview failed in this fake)');
    assert.equal(document.getElementById('maxfin-account-bills').value, 'acc-savings');
  });

  hubScenario('H7b no remembered choice: the card block gets the first credit card, the others the first other account', async () => {
    await mountHub();
    await pickFiles([file('OUT.csv', SHEET_CSV)]);
    assert.deepEqual(['income', 'bills', 'credit', 'debit'].map((k) => sel(`import-hub-account-${k}`).value), ['acc-main', 'acc-main', 'acc-card', 'acc-main']);
  });

  hubScenario('H8 a workbook (.xlsx) starts the workbook preview', async () => {
    await mountHub();
    await pickFiles([xlsx('ANO.xlsx')]);
    fake.workbook = async () => { throw new Error('servidor de teste'); };
    await click(continueBtn());
    await flush(40);
    const [call] = calls('workbook');
    assert.ok(call, 'workbook preview called');
    assert.equal(call.body.get('file').name, 'ANO.xlsx');
    assert.deepEqual(JSON.parse(call.body.get('accounts')), { income: 'acc-main', bills: 'acc-main', credit: 'acc-card', debit: 'acc-main' });
  });

  hubScenario('H9 sheets and workbooks go one file at a time', async () => {
    await mountHub();
    await pickFiles([file('OUT.csv', SHEET_CSV), file('SET.csv', SHEET_CSV)]);
    assert.match(alertText(), /um arquivo por vez/);
    assert.equal(continueBtn().disabled, true);
    await click(btn(/^Remover SET\.csv$/));
    assert.equal(continueBtn().disabled, false);
  });

  hubScenario('H10 a format the hub does not take is ignored with a notice; the same file twice is added once', async () => {
    await mountHub();
    await pickFiles([file('foto.png'), file('extrato.ofx', bankOfx('20260901'))]);
    assert.deepEqual(rowNames(), ['extrato.ofx']);
    assert.match(bodyText(), /Ignorado \(formato não suportado, use \.csv, \.ofx ou \.xlsx\): foto\.png\./);
    const again = file('extrato.ofx', bankOfx('20260901'));
    await pickFiles([again]);
    assert.equal(rows().length >= 1, true);
  });

  hubScenario('H11 statements without an OFX header are ordered by the date in the file name; undated ones go last', async () => {
    await mountHub();
    await pickFiles([file('extrato-2026-10.csv', STATEMENT_CSV), file('sem-data.csv', STATEMENT_CSV), file('extrato-2026-08.csv', STATEMENT_CSV),
      file('banco.ofx', bankOfx('20260901'))]);
    assert.deepEqual(rowNames(), ['extrato-2026-08.csv', 'banco.ofx', 'extrato-2026-10.csv', 'sem-data.csv']);
    assert.match(rowFor('extrato-2026-08.csv').textContent, /data no nome do arquivo/);
    assert.match(rowFor('sem-data.csv').textContent, /Sem data/);
    await changeSelect(sel('import-hub-account'), 'acc-main');
    fake.statementPreview = async () => { throw new Error('servidor de teste'); };
    await click(continueBtn());
    await flush(40);
    assert.deepEqual(calls('statement-preview').map((c) => c.body.get('file').name), ['extrato-2026-08.csv']);
    assert.match(bodyText(), /Arquivo 1 de 4/);
  });

  hubScenario('H12 files dropped on the area are read like picked ones', async () => {
    await mountHub();
    const zone = document.querySelector('div.border-dashed');
    assert.ok(zone, 'drop area');
    const drop = new w.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file('fatura.ofx', cardOfx('20260902'))] } });
    await B.act(async () => { zone.dispatchEvent(drop); });
    await flush(40);
    assert.deepEqual(rowNames(), ['fatura.ofx']);
    assert.match(rowFor('fatura.ofx').textContent, /Fatura do cartão/);
  });

  hubScenario('H13 an .ofx over 5 MB is not read: it is a statement, with the reason; forced to card it shows the limit and blocks Continue', async () => {
    await mountHub({ defaultAccountId: 'acc-card' });
    await pickFiles([new w.File([cardOfx('20260902'), new Uint8Array(5 * 1024 * 1024)], 'grande.ofx')]);
    assert.match(rowFor('grande.ofx').textContent, /Detectado:\s*Extrato/);
    assert.match(rowFor('grande.ofx').textContent, /Maior que 5 MB, o limite de uma fatura de cartão: tratado como extrato/);
    await changeSelect(typeSelect('grande.ofx'), 'card');
    assert.match(alertText(), /limite de 5 MB/);
    assert.equal(continueBtn().disabled, true);
  });

  hubScenario('H15 an .ofx is read whole: a card section after a bank section over 64 KB is a card invoice', async () => {
    await mountHub();
    const bank = '<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><DTSTART>20260801</DTSTART>' + '<STMTTRN><TRNAMT>-1</TRNAMT><MEMO>x</MEMO></STMTTRN>\n'.repeat(3000) + '</STMTRS></STMTTRNRS></BANKMSGSRSV1>';
    const text = bank + '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>';
    assert.ok(bank.length > 64 * 1024);
    await pickFiles([file('misto.ofx', text)]);
    assert.match(rowFor('misto.ofx').textContent, /Detectado:\s*Fatura do cartão/);
    assert.ok(sel('import-hub-card'));
  });

  hubScenario('H16 a file that cannot be read has no kind: the Tipo has to be chosen, never a silent statement', async () => {
    await mountHub();
    const broken = new w.File(['x'], 'ilegivel.ofx');
    broken.slice = () => ({ arrayBuffer: () => Promise.reject(new Error('leitura falhou')) });
    await pickFiles([broken]);
    assert.match(rowFor('ilegivel.ofx').textContent, /não foi possível ler o arquivo/);
    assert.equal(typeSelect('ilegivel.ofx').value, '');
    assert.equal(sel('import-hub-account'), null, 'no destination is asked before the Tipo is chosen');
    assert.match(alertText(), /ilegivel\.ofx: não foi possível ler o arquivo\. Escolha o Tipo\./);
    assert.equal(continueBtn().disabled, true);
    await changeSelect(typeSelect('ilegivel.ofx'), 'card');
    assert.ok(sel('import-hub-card'));
    assert.doesNotMatch(alertText(), /Escolha o Tipo/);
  });

  hubScenario('H17 a bank csv with "Total ..." descriptions is a statement', async () => {
    await mountHub();
    const bank = 'Data,Descrição,Valor\n01/09/2026,Mercado,-10\n02/09/2026,Total Pass academia,-99\n03/09/2026,TOTAL PAGO FATURA,-1\n';
    await pickFiles([file('extrato.csv', bank)]);
    assert.match(rowFor('extrato.csv').textContent, /Detectado:\s*Extrato/);
  });

  hubScenario('H14 closing the hub: Escape and Cancelar call onClose', async () => {
    const m = await mountHub();
    await B.act(async () => { window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); });
    assert.equal(m.closed, 1);
    await click(btn(/^Cancelar$/));
    assert.equal(m.closed, 2);
  });

  // =======================================================================================================
  // Queue of card invoices
  // =======================================================================================================

  const OK_CARD = { enriched: 1, consumedFutures: 0, created: 1, futureInstallments: 0, reversalsImported: 0, payment: null, skipped: 0, createdCategories: [], warnings: [] };
  const fileNo = (name) => Number(/(\d+)/.exec(name)[1]);

  function emptyCardPreview(accountId, n) {
    return {
      accountId, householdId: 'h1', month: { year: 2026, month: n }, monthKey: `2026-0${n}`, monthSource: 'statement',
      period: { start: `2026-0${n}-02`, end: `2026-0${n + 1}-02` }, ofxTotal: 0, lines: [], proposals: [], sheetOnly: [], payment: null, categoryMap: [],
      totals: { lines: 0, reconciled: 0, proposals: 0, create: 0, sheetOnly: 0 }, warnings: [],
    };
  }

  /** The invoice number `n`: exact + new proposals ticked by the server, one ambiguous and one reversal that are not. */
  function cardPreviewFor(accountId, n, plan = {}) {
    if (plan.empty) return { ...emptyCardPreview(accountId, n), warnings: plan.warnings ?? [] };
    if (plan.reconciled) {
      // An invoice imported before: every line is already in Prumo, no proposal, no payment to apply.
      const done = [30, 45, 12.5].map((amount, k) => ({
        ref: `ofx:R${n}${k}:0000000${k}`, fitid: `R${n}${k}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo: `Compra ${n}.${k}`,
        merchant: `Compra ${n}.${k}`, installment: null, status: 'reconciled', group: null,
      }));
      return { ...emptyCardPreview(accountId, n), ofxTotal: 87.5, lines: done, totals: { lines: 3, reconciled: 3, proposals: 0, create: 0, sheetOnly: 0 } };
    }
    const ln = (k, memo, amount, o = {}) => ({
      ref: `ofx:Q${n}${k}:0000000${k}`, fitid: `Q${n}${k}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo, merchant: memo,
      installment: null, status: 'proposed', group: null, ...o,
    });
    const a = ln(1, `Padaria ${n}`, 20, { group: 'g-exact' });
    const c = ln(2, `Livraria ${n}`, 45, { group: 'g-new' });
    const b1 = ln(3, `Farmacia ${n}`, 30, { group: 'g-amb' });
    const b2 = ln(4, `Farmacia ${n}`, 20, { group: 'g-amb' });
    const d = ln(5, `Loja ${n}`, 10, { group: 'g-rev' });
    const e = ln(6, `Loja ${n}`, 10, { group: 'g-rev', type: 'INCOME', kind: 'refund' });
    const pay = ln(7, 'Pagamento recebido', 400, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-09' });
    const T = (id, amount) => ({ transactionId: id, description: id, amount, type: 'EXPENSE', date: '2026-09-08', sourceRef: null });
    const P = (group, kind, lines, o = {}) => ({ group, kind, refs: lines.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, result: null, futureInstallments: 0, ...o });
    const payment = plan.payment === 'create'
      ? { ref: pay.ref, amount: 400, date: '2026-09-09', invoiceMonthKey: `2026-0${n}`, proposal: 'create', recorded: null }
      : plan.payment === 'adjust'
        ? { ref: pay.ref, amount: 400, date: '2026-09-09', invoiceMonthKey: `2026-0${n}`, proposal: 'adjust', recorded: { transactionId: 't-pay', amount: 390, date: '2026-09-10', sourceAccountId: 'acc-main' } }
        : null;
    const everything = [
        P('g-exact', 'enrich-exact', [a], { target: T(`Padaria ${n} (planilha)`, 20), result: { date: '2026-09-10', description: `Padaria ${n}`, notesAppend: null } }),
        P('g-new', 'create', [c]),
        P('g-amb', 'enrich-sum', [b1, b2], { defaultSelected: false, ambiguous: true, target: T(`Farmácia ${n} 50`, 50), result: { date: '2026-09-10', description: `Farmácia ${n} 50`, notesAppend: null } }),
        P('g-rev', 'reversal', [d, e], { defaultSelected: false }),
    ];
    return {
      ...emptyCardPreview(accountId, n), ofxTotal: 135, lines: [a, c, b1, b2, d, e, pay],
      proposals: plan.onlyAmbiguous ? everything.filter((p) => p.group === 'g-amb') : everything,
      warnings: plan.warnings ?? [],
      payment: plan.onlyAmbiguous ? null : payment,
      categoryMap: [{ key: `Livraria ${n}`, type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'default', label: 'Padrão' } }],
      totals: { lines: 7, reconciled: 0, proposals: 4, create: 1, sheetOnly: 0 },
    };
  }

  /**
   * Fake server for the invoices named `fatura-N.ofx`. `plans[name]` shapes the file: { payment, empty, previewError,
   * confirmError } (the errors are programmed per call number: 'first', 'always'). `log` is the order of the requests.
   */
  function serveInvoices(plans = {}, { gate = false } = {}) {
    const log = [];
    const gates = [];
    const failed = new Set();
    fake.cardPreview = async (_u, body) => {
      const name = body.get('file').name;
      log.push(`preview:${fileNo(name)}`);
      const plan = plans[name] ?? {};
      if (plan.gatePreview) await new Promise((resolve) => gates.push(resolve));
      if (plan.previewError === 'always' || (plan.previewError === 'first' && !failed.has(`p${name}`))) {
        failed.add(`p${name}`);
        throw new Error(`Falha ao ler ${name}`);
      }
      return { data: { data: cardPreviewFor(body.get('accountId'), fileNo(name), plan) } };
    };
    fake.cardConfirm = async (_u, payload) => {
      const n = Number(payload.monthKey.slice(-2));
      log.push(`confirm:${n}`);
      const plan = plans[`fatura-${n}.ofx`] ?? {};
      if (gate) await new Promise((resolve) => gates.push(resolve));
      if (plan.confirmError === 'always' || (plan.confirmError === 'first' && !failed.has(`c${n}`))) {
        failed.add(`c${n}`);
        throw new Error('Tempo esgotado');
      }
      return { data: OK_CARD };
    };
    return { log, gates };
  }
  const invoices = (n) => Array.from({ length: n }, (_, i) => file(`fatura-${i + 1}.ofx`, cardOfx(`2026080${i + 1}`)));
  const confirmBtn = () => btn(/^(Confirmar e continuar|Confirmar importação|Importando…)$/);
  const closeX = () => btn(/^Fechar modal$/);
  const backdrop = () => all('div[aria-hidden="true"]').find((d) => d.className.includes('bg-black/40'));
  const headerLabel = () => document.querySelector('section[aria-label="Fila de importação"] h4')?.textContent ?? null;
  const progress = () => all('ol[aria-label="Progresso da fila"] > li').map((li) => li.textContent.replace(/\s+/g, ' ').trim());
  const queueSourceSelect = () => sel('card-ofx-queue-source');
  async function release(gates, times = 1) {
    for (let i = 0; i < times; i += 1) {
      await flush(15);
      while (gates.length) gates.shift()();
      await flush(15);
    }
  }


  /** Mounts the invoice queue with the fake server in place BEFORE the first preview (the dialog starts it on open). */
  async function mountQueue(count, plans = {}, opts = {}) {
    let server;
    const m = await mountWith(
      (onClose) => B.createElement(B.CardDialog, { open: true, onClose, accountId: 'acc-card', householdId: 'h1', files: invoices(count) }),
      { accounts: opts.accounts, setup: () => { server = serveInvoices(plans, opts); } },
    );
    return { m, ...server };
  }
  const progressRows = () => all('ol[aria-label="Progresso da fila"] > li').map((li) => [...li.querySelectorAll(':scope > span')].map((s) => s.textContent).join('|'));
  const applyBtn = () => btn(/^Confirmar esta e aplicar o padrão nas restantes/);
  const skipBtn = () => btn(/^Pular (esta fatura|este arquivo)$/);
  const refreshBtn = () => btn(/^Atualizar pré-visualização$/);
  const stopBanner = () => all('[role="alert"]').map((a) => a.textContent).find((t) => t.startsWith('A aplicação do padrão parou')) ?? null;
  const cardConfirms = () => calls('card-confirm');

  hubScenario('Q1 two invoices: "Fatura N de M", confirm and continue, then the final summary of all files', async () => {
    const { m, log } = await mountQueue(2);
    assert.equal(headerLabel(), 'Fatura 1 de 2');
    assert.match(document.querySelector('section[aria-label="Fila de importação"]').textContent, /fatura-1\.ofx/);
    assert.deepEqual(progressRows(), ['fatura-1.ofx|Pronta para revisar', 'fatura-2.ofx|Aguardando']);
    assert.equal(confirmBtn().textContent, 'Confirmar e continuar');
    assert.equal(btn(/^Voltar$/), undefined, 'going back would swap the file: not offered in a queue');
    assert.deepEqual(log, ['preview:1'], 'only the first invoice is previewed');
    assert.equal(sel('card-ofx-file'), null, 'no file picker in a queue');
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2'], 'the next preview only after the confirm');
    assert.equal(headerLabel(), 'Fatura 2 de 2');
    assert.equal(progressRows()[0].startsWith('fatura-1.ofx|Importada|'), true);
    assert.equal(progressRows()[1], 'fatura-2.ofx|Pronta para revisar');
    assert.equal(confirmBtn().textContent, 'Confirmar importação', 'the last one does not continue');
    assert.equal(cardConfirms()[0].payload.accountId, 'acc-card');
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2', 'confirm:2']);
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /2 faturas importadas\./);
    assert.match(bodyText(), /Total: 2 lançamentos enriquecidos, 2 transações criadas\./);
    assert.deepEqual(progressRows().map((r) => r.split('|').slice(0, 2).join('|')), ['fatura-1.ofx|Importada', 'fatura-2.ofx|Importada']);
    assert.equal(document.querySelector('section[aria-label="Fila de importação"] h4'), null, 'the queue panel is gone');
    await click(btn(/^Fechar$/));
    assert.equal(m.closed, 1);
  });

  hubScenario('Q2 while the confirm of a file is running the next one is not previewed and the dialog cannot be closed', async () => {
    const { m, log, gates } = await mountQueue(2, {}, { gate: true });
    await click(confirmBtn());
    await flush(30);
    assert.deepEqual(log, ['preview:1', 'confirm:1'], 'no preview of the second file yet');
    assert.equal(confirmBtn().textContent, 'Importando…');
    assert.equal(closeX().disabled, true);
    await click(backdrop());
    await B.act(async () => { window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); });
    assert.equal(m.closed, 0, 'neither the backdrop nor Escape closes it');
    await release(gates);
    await flush(30);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2']);
    assert.equal(closeX().disabled, false);
    await click(closeX());
    assert.equal(m.closed, 1);
  });

  hubScenario('Q3 "Pular esta fatura" leaves the file out without a confirm; the last file confirms as the last', async () => {
    const { log } = await mountQueue(2);
    await click(skipBtn());
    await flush(30);
    assert.deepEqual(log, ['preview:1', 'preview:2']);
    assert.equal(cardConfirms().length, 0);
    assert.equal(headerLabel(), 'Fatura 2 de 2');
    assert.equal(progressRows()[0], 'fatura-1.ofx|Pulada');
    assert.equal(confirmBtn().textContent, 'Confirmar importação');
    await click(confirmBtn());
    await flush(30);
    assert.match(bodyText(), /1 fatura importada, 1 pulada\./);
  });

  hubScenario('Q3b skipping the last file finishes the queue', async () => {
    await mountQueue(1);
    await click(skipBtn());
    await flush(20);
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /1 pulada\./);
    assert.match(bodyText(), /Nenhuma fatura foi importada|1 pulada/);
  });

  hubScenario('Q4 a failed confirm blocks the file until its preview is refreshed; the queue does not move on', async () => {
    const { log } = await mountQueue(2, { 'fatura-1.ofx': { confirmError: 'first' } });
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1'], 'the second file is not previewed after a failure');
    assert.equal(confirmBtn().disabled, true);
    assert.match(alertText(), /Tempo esgotado/);
    assert.match(alertText(), /Atualize a pré-visualização antes de confirmar de novo/);
    assert.match(sel('card-ofx-confirm-blocker').textContent, /Atualize a pré-visualização antes de confirmar de novo\./);
    assert.equal(progressRows()[0].startsWith('fatura-1.ofx|Falhou|'), true);
    assert.equal(headerLabel(), 'Fatura 1 de 2');
    assert.equal(applyBtn().disabled, true, 'apply-the-default does not walk over a blocked file');
    await click(refreshBtn());
    await flush(30);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:1']);
    assert.equal(progressRows()[0], 'fatura-1.ofx|Pronta para revisar');
    assert.equal(confirmBtn().disabled, false);
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:1', 'confirm:1', 'preview:2']);
    assert.equal(headerLabel(), 'Fatura 2 de 2');
  });

  hubScenario('Q4b a blocked file can be skipped', async () => {
    await mountQueue(2, { 'fatura-1.ofx': { confirmError: 'always' } });
    await click(confirmBtn());
    await flush(40);
    assert.equal(confirmBtn().disabled, true);
    assert.equal(skipBtn().disabled, false);
    await click(skipBtn());
    await flush(30);
    assert.equal(headerLabel(), 'Fatura 2 de 2');
    assert.equal(progressRows()[0].startsWith('fatura-1.ofx|Pulada'), true);
    assert.equal(confirmBtn().disabled, false);
  });

  const PAY_CREATE = Object.fromEntries([1, 2, 3].map((n) => [`fatura-${n}.ofx`, { payment: 'create' }]));

  const tick = async (label) => {
    const box = all('input[type=checkbox]').find((i) => i.getAttribute('aria-label') === label);
    assert.ok(box, `checkbox "${label}" missing`);
    await B.act(async () => { box.click(); });
    await flush(10);
  };

  hubScenario('Q5 "Confirmar esta e aplicar o padrão nas restantes": same rules as Confirmar e continuar for this file (its marks, the payment source), then the defaults on the following ones', async () => {
    const { m, log } = await mountQueue(3, PAY_CREATE);
    assert.equal(applyBtn().textContent.replace(/\s+/g, ' ').trim(), 'Confirmar esta e aplicar o padrão nas restantes');
    assert.equal(applyBtn().disabled, true, 'the payment needs a source account: the same blocker as Confirmar e continuar');
    assert.equal(confirmBtn().disabled, true);
    assert.match(applyBtn().title, /conta de origem/);
    await click(applyBtn());
    await flush(30);
    assert.equal(cardConfirms().length, 0, 'a blocked button does nothing');
    await changeSelect(queueSourceSelect(), 'acc-main');
    assert.equal(applyBtn().disabled, false);
    assert.match(applyBtn().title, /nas 2 seguintes/);
    await tick('Importar nova: Livraria 1'); // the user's own mark on this file
    await click(applyBtn());
    await flush(150);
    assert.equal(cardConfirms().length, 3);
    assert.deepEqual(cardConfirms()[0].payload.selectedGroups, ['g-exact'], 'this file goes with the marks of the user');
    assert.deepEqual(cardConfirms()[1].payload.selectedGroups, ['g-exact', 'g-new'], 'the following ones with what the server marks (not the ambiguous sum nor the reversal pair)');
    assert.deepEqual(cardConfirms()[2].payload.selectedGroups, ['g-exact', 'g-new']);
    for (const c of cardConfirms()) assert.deepEqual(c.payload.payment, { apply: true, sourceAccountId: 'acc-main' });
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2', 'confirm:2', 'preview:3', 'confirm:3'], 'one file at a time, preview then confirm');
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /3 faturas importadas\./);
    assert.equal(stopBanner(), null);
    await click(btn(/^Fechar$/));
    assert.equal(m.closed, 1);
  });

  hubScenario('Q5e the first payment source picked in the payment block of the file on screen becomes the queue source', async () => {
    const { log } = await mountQueue(3, PAY_CREATE);
    assert.equal(queueSourceSelect().value, '');
    await changeSelect(sel('card-ofx-payment-source'), 'acc-main');
    assert.equal(queueSourceSelect().value, 'acc-main', 'copied to the queue');
    assert.equal(applyBtn().disabled, false);
    await click(applyBtn());
    await flush(150);
    assert.equal(cardConfirms().length, 3, 'the loop did not stop at file 2 asking for the account');
    assert.equal(stopBanner(), null);
    assert.deepEqual(log.slice(-2), ['preview:3', 'confirm:3']);
  });

  hubScenario('Q5f a source picked after the queue one was set does not replace it', async () => {
    await mountQueue(2, PAY_CREATE);
    await changeSelect(queueSourceSelect(), 'acc-main');
    await changeSelect(sel('card-ofx-payment-source'), 'acc-savings');
    assert.equal(queueSourceSelect().value, 'acc-main');
  });

  hubScenario('Q5d the button is not there for the last file', async () => {
    await mountQueue(2);
    assert.ok(applyBtn());
    await click(skipBtn());
    await flush(30);
    assert.equal(applyBtn(), undefined);
  });

  hubScenario('Q5c the account chosen for the queue fills the payment source of every file, including the ones previewed later', async () => {
    const { log } = await mountQueue(2, PAY_CREATE);
    await changeSelect(queueSourceSelect(), 'acc-main');
    assert.equal(sel('card-ofx-payment-source').value, 'acc-main', 'the first file');
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2']);
    assert.equal(sel('card-ofx-payment-source').value, 'acc-main', 'the second file comes with it already');
    assert.equal(confirmBtn().disabled, false);
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(cardConfirms().map((c) => c.payload.payment), [{ apply: true, sourceAccountId: 'acc-main' }, { apply: true, sourceAccountId: 'acc-main' }]);
  });

  hubScenario('Q5b the loop stops at a following file whose payment needs a source account that was not chosen', async () => {
    const plans = { 'fatura-1.ofx': { payment: 'adjust' }, 'fatura-2.ofx': { payment: 'create' }, 'fatura-3.ofx': { payment: 'create' } };
    const { log } = await mountQueue(3, plans);
    assert.equal(applyBtn().disabled, false, 'file 1 adjusts a payment that already has its account');
    await click(applyBtn());
    await flush(80);
    assert.equal(cardConfirms().length, 1);
    assert.deepEqual(cardConfirms()[0].payload.payment, { apply: true });
    assert.match(stopBanner(), /fatura-2\.ofx: O pagamento da fatura anterior precisa de uma conta de origem/);
    assert.equal(headerLabel(), 'Fatura 2 de 3');
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2'], 'the stopped file is shown with the preview the loop already got');
    await changeSelect(queueSourceSelect(), 'acc-main');
    assert.equal(sel('card-ofx-payment-source').value, 'acc-main');
    await click(applyBtn());
    await flush(120);
    assert.equal(cardConfirms().length, 3);
    assert.match(bodyText(), /3 faturas importadas\./);
  });

  hubScenario('Q4c when the confirm of this file fails (or is cut short) nothing else runs', async () => {
    const { log } = await mountQueue(3, { 'fatura-1.ofx': { confirmError: 'always' } });
    await click(applyBtn());
    await flush(60);
    assert.deepEqual(log, ['preview:1', 'confirm:1']);
    assert.equal(progressRows()[0].startsWith('fatura-1.ofx|Falhou'), true);
    assert.equal(stopBanner(), null, 'no loop was started, so there is no loop to stop');
    assert.equal(applyBtn().disabled, true);
    assert.equal(closeX().disabled, false, 'the dialog can be closed again');
  });

  hubScenario('Q6 a following file with nothing to import is left out ("Já importada") and the loop goes on', async () => {
    const { log } = await mountQueue(3, { 'fatura-2.ofx': { empty: true } });
    await click(applyBtn());
    await flush(120);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2', 'preview:3', 'confirm:3']);
    assert.equal(cardConfirms().length, 2);
    assert.equal(stopBanner(), null);
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /2 faturas importadas, 1 já conciliada\./);
    assert.equal(progressRows()[1].startsWith('fatura-2.ofx|Já conciliada|Nada a importar'), true);
  });

  hubScenario('Q6b a real blocker (only proposals the server does not mark) stops the loop with the reason and leaves the rest alone', async () => {
    const { log } = await mountQueue(3, { 'fatura-2.ofx': { onlyAmbiguous: true } });
    await click(applyBtn());
    await flush(80);
    assert.equal(cardConfirms().length, 1);
    assert.match(stopBanner(), /fatura-2\.ofx: Selecione ao menos uma proposta/);
    assert.equal(headerLabel(), 'Fatura 2 de 3');
    assert.deepEqual(progressRows().map((r) => r.split('|').slice(0, 2).join('|')), ['fatura-1.ofx|Importada', 'fatura-2.ofx|Pronta para revisar', 'fatura-3.ofx|Aguardando']);
    assert.equal(log.includes('preview:3'), false, 'the third file was never previewed');
    assert.equal(confirmBtn().disabled, true);
    await click(skipBtn());
    await flush(30);
    assert.equal(headerLabel(), 'Fatura 3 de 3');
    assert.equal(stopBanner(), null, 'the banner goes away with the file');
  });

  hubScenario('Q7 apply stops at a preview error and says which file and why', async () => {
    const { log } = await mountQueue(3, { 'fatura-2.ofx': { previewError: 'always' } });
    await click(applyBtn());
    await flush(80);
    assert.equal(cardConfirms().length, 1);
    assert.match(stopBanner(), /fatura-2\.ofx: Falha ao ler fatura-2\.ofx/);
    assert.equal(headerLabel(), 'Fatura 2 de 3');
    assert.ok(btn(/^Pré-visualizar$/), 'the file step offers to try again');
    assert.equal(log.includes('preview:3'), false);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2'], 'the file that failed to preview is not previewed again');
    assert.equal(progressRows()[1], 'fatura-2.ofx|Aguardando');
  });

  hubScenario('Q8 apply stops at a confirm that failed: the file is blocked until refreshed', async () => {
    const { log } = await mountQueue(3, { 'fatura-2.ofx': { confirmError: 'first' } });
    await click(applyBtn());
    await flush(80);
    assert.equal(cardConfirms().length, 2);
    assert.match(stopBanner(), /fatura-2\.ofx: Tempo esgotado/);
    assert.equal(headerLabel(), 'Fatura 2 de 3');
    assert.equal(progressRows()[1].startsWith('fatura-2.ofx|Falhou'), true);
    assert.equal(confirmBtn().disabled, true);
    assert.ok(refreshBtn());
    assert.equal(log.includes('preview:3'), false);
    await click(refreshBtn());
    await flush(30);
    assert.equal(confirmBtn().disabled, false);
    assert.equal(progressRows()[1], 'fatura-2.ofx|Pronta para revisar');
  });

  hubScenario('Q9 the dialog cannot be closed while "apply the default" runs (X, backdrop, Escape), also between two requests; it can once it is over', async () => {
    const { m, log, gates } = await mountQueue(2, { 'fatura-2.ofx': { gatePreview: true } }, { gate: true });
    const tryClose = async () => {
      await click(closeX());
      await click(backdrop());
      await B.act(async () => { window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); });
    };
    await click(applyBtn());
    await flush(40);
    assert.deepEqual(log.slice(-1), ['confirm:1']);
    assert.equal(confirmBtn().textContent, 'Importando…');
    assert.equal(closeX().disabled, true);
    await tryClose();
    assert.equal(m.closed, 0, 'while the confirm of file 1 runs');
    // the confirm of file 1 is over and the preview of file 2 is held: no confirm is running, only the loop
    await release(gates);
    assert.deepEqual(log.slice(-1), ['preview:2']);
    assert.match(bodyText(), /Aplicando o padrão: fatura-2\.ofx/);
    assert.equal(closeX().disabled, true, 'between two files of the loop');
    await tryClose();
    assert.equal(m.closed, 0, 'between two files of the loop');
    await release(gates, 4);
    assert.match(bodyText(), /Importação concluída/);
    assert.equal(closeX().disabled, false);
    await click(btn(/^Fechar$/));
    assert.equal(m.closed, 1);
  });

  hubScenario('Q10 the closing day notice: shown for a card with none (file step and preview), not for one that has it, never blocking', async () => {
    const noDay = ACCOUNTS.map((a) => (a.id === 'acc-card' ? { ...a, closingDay: undefined } : a));
    const SERVER_WARNING = 'O cartão "Nubank" não tem dia de fechamento configurado: no Prumo as faturas seguem o mês calendário, e a data real de uma compra pode levá-la para outra fatura.';
    const OTHER_WARNING = 'O saldo da fatura no OFX (R$ 100,00) difere do total das linhas (R$ 195,90).';
    const mountSingle = (accounts, initialFile) => mountWith(
      (onClose) => B.createElement(B.CardDialog, { open: true, onClose, accountId: 'acc-card', householdId: 'h1', initialFile }),
      { accounts, setup: () => { serveInvoices({ 'fatura-1.ofx': { warnings: [SERVER_WARNING, OTHER_WARNING] } }); } },
    );
    const notices = () => all('[role="note"]').map((n) => n.textContent);
    await mountSingle(noDay, null);
    assert.equal(notices().length, 1);
    assert.match(notices()[0], /Este cartão não tem dia de fechamento nem de vencimento: o mês da fatura segue o mês do calendário\./);
    assert.match(notices()[0], /edite a conta do cartão \(campos Dia de vencimento e Dia de fechamento\)/);
    assert.ok(btn(/^Pré-visualizar$/), 'the file step is usable');
    await unmountAll();
    await mountSingle(noDay, invoices(1)[0]);
    await flush(30);
    assert.equal(notices().length, 1, 'also on the preview');
    assert.equal(confirmBtn().disabled, false, 'it does not block');
    assert.doesNotMatch(bodyText(), /não tem dia de fechamento configurado/, 'the duplicate warning of the server is hidden while the notice is shown');
    assert.match(bodyText(), /difere do total das linhas/, 'the other warnings stay');
    await unmountAll();
    await mountSingle(ACCOUNTS, invoices(1)[0]);
    await flush(30);
    assert.equal(notices().length, 0, 'a card with a closing day has no notice');
    assert.match(bodyText(), /não tem dia de fechamento configurado/, 'without the notice the server warning is listed');
    await unmountAll();
    await mountWith((onClose) => B.createElement(B.CardDialog, { open: true, onClose, accountId: 'acc-card', householdId: 'h1', files: invoices(2) }),
      { accounts: noDay, setup: () => { serveInvoices(); } });
    assert.equal(notices().length, 1, 'and in a queue');
    await unmountAll();
    // Only a due day: the closing day is derived (due - 7), so the "no closing day" notice is gone and the derived day is named.
    const dueOnly = ACCOUNTS.map((a) => (a.id === 'acc-card' ? { ...a, closingDay: undefined, dueDay: 9 } : a));
    await mountSingle(dueOnly, invoices(1)[0]);
    await flush(30);
    assert.deepEqual(notices(), ['Fechamento calculado: dia 2 (7 dias antes do vencimento)'], 'a card with a due day only: the derived closing day');
    assert.doesNotMatch(bodyText(), /Este cartão não tem dia de fechamento/);
    assert.equal(confirmBtn().disabled, false, 'it does not block');
    await unmountAll();
    const dueEarly = ACCOUNTS.map((a) => (a.id === 'acc-card' ? { ...a, closingDay: null, dueDay: 3 } : a));
    await mountSingle(dueEarly, invoices(1)[0]);
    await flush(30);
    assert.deepEqual(notices(), ['Fechamento calculado: dia 26 (7 dias antes do vencimento)'], 'due 3 wraps to 26');
  });

  // =======================================================================================================
  // Queue of bank statements
  // =======================================================================================================

  /** Statement `extrato-N.ofx`: `plans[name].rows` is a list of "is this row a duplicate"; descriptions end with (N). */
  function serveStatements(plans = {}, { gate = false } = {}) {
    const log = [];
    const gates = [];
    const failed = new Set();
    fake.statementPreview = async (_u, body) => {
      const name = body.get('file').name;
      const n = fileNo(name);
      log.push(`preview:${n}`);
      const plan = plans[name] ?? {};
      if (plan.gatePreview) await new Promise((resolve) => gates.push(resolve));
      if (plan.previewError) throw new Error(`Falha ao ler ${name}`);
      if (plan.rawPreview) return { data: { data: plan.rawPreview } };
      const flags = plan.rows ?? [false, false];
      const stmtRows = flags.map((dup, i) => ({ index: i, date: `2026-09-0${i + 1}`, description: `Linha ${i + 1} (${n})`, amount: 10 * (i + 1), type: 'EXPENSE', duplicate: dup }));
      const dups = flags.filter(Boolean).length;
      return { data: { data: { rows: stmtRows, total: stmtRows.length, duplicateCount: dups, newCount: stmtRows.length - dups } } };
    };
    fake.confirm = async (_u, payload) => {
      const n = Number(/\((\d+)\)/.exec(payload.rows[0].description)[1]);
      log.push(`confirm:${n}`);
      const plan = plans[`extrato-${n}.ofx`] ?? {};
      const flags = plan.rows ?? [false, false];
      const newRows = payload.rows.filter((r) => !flags[Number(/Linha (\d+)/.exec(r.description)[1]) - 1]);
      if (gate) await new Promise((resolve) => gates.push(resolve));
      if (plan.confirmError === 'always' || (plan.confirmError === 'first' && !failed.has(n))) {
        failed.add(n);
        throw new Error('Tempo esgotado');
      }
      return { data: { imported: newRows.length, skipped: payload.rows.length - newRows.length, ids: [] } };
    };
    return { log, gates };
  }
  const statements = (n) => Array.from({ length: n }, (_, i) => file(`extrato-${i + 1}.ofx`, bankOfx(`2026080${i + 1}`)));
  async function mountStatements(count, plans = {}, opts = {}) {
    let server;
    const m = await mountWith(
      (onClose) => B.createElement(B.StatementDialog, { open: true, onClose, householdId: 'h1', defaultAccountId: 'acc-main', initialFiles: statements(count) }),
      { setup: () => { server = serveStatements(plans, opts); } },
    );
    return { m, ...server };
  }
  const stmtConfirms = () => calls('confirm');

  hubScenario('S1 two statements: "Arquivo N de M", confirm and continue, the next preview only after the confirm, final summary', async () => {
    const { m, log } = await mountStatements(2, { 'extrato-2.ofx': { rows: [false, true, false] } });
    assert.equal(headerLabel(), 'Arquivo 1 de 2');
    assert.deepEqual(progressRows(), ['extrato-1.ofx|Pronto para revisar', 'extrato-2.ofx|Aguardando']);
    assert.equal(confirmBtn().textContent, 'Confirmar e continuar');
    assert.equal(btn(/^Voltar$/), undefined);
    assert.match(bodyText(), /Linha 1 \(1\)/);
    assert.deepEqual(log, ['preview:1']);
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2']);
    assert.equal(headerLabel(), 'Arquivo 2 de 2');
    assert.equal(confirmBtn().textContent, 'Confirmar importação');
    assert.deepEqual(stmtConfirms()[0].payload.rows.map((r) => r.description), ['Linha 1 (1)', 'Linha 2 (1)']);
    assert.equal(stmtConfirms()[0].payload.accountId, 'acc-main');
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(stmtConfirms()[1].payload.rows.map((r) => r.description), ['Linha 1 (2)', 'Linha 2 (2)', 'Linha 3 (2)'], 'the whole file goes, the duplicate row included');
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /2 arquivos importados\./);
    assert.match(bodyText(), /Total: 4 transações importadas\./);
    await click(btn(/^Fechar$/));
    assert.equal(m.closed, 1);
  });

  hubScenario('S2 "Confirmar esta e aplicar o padrão nas restantes": this file, then every new row of the following ones; a file with nothing new is left out ("Sem novidades")', async () => {
    const { log } = await mountStatements(3, { 'extrato-2.ofx': { rows: [false, true, false] }, 'extrato-3.ofx': { rows: [true, true] } });
    assert.equal(applyBtn().textContent.replace(/\s+/g, ' ').trim(), 'Confirmar esta e aplicar o padrão nas restantes');
    await click(applyBtn());
    await flush(120);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2', 'confirm:2', 'preview:3']);
    assert.equal(stmtConfirms().length, 2);
    assert.deepEqual(stmtConfirms()[1].payload.rows.map((r) => r.description), ['Linha 1 (2)', 'Linha 2 (2)', 'Linha 3 (2)'], 'the loop sends the whole file too, the duplicate row included');
    assert.equal(stopBanner(), null);
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /2 arquivos importados, 1 sem novidades\./);
    assert.deepEqual(progressRows().map((r) => r.split('|').slice(0, 2).join('|')), ['extrato-1.ofx|Importado', 'extrato-2.ofx|Importado', 'extrato-3.ofx|Sem novidades']);
  });

  hubScenario('S2b a file with no row at all stops the loop (error or unparseable); a preview error stops it and is not asked again', async () => {
    const { log } = await mountStatements(3, { 'extrato-2.ofx': { rows: [] } });
    await click(applyBtn());
    await flush(120);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2']);
    assert.match(stopBanner(), /extrato-2\.ofx: Nenhuma transação encontrada no arquivo\./);
    assert.equal(headerLabel(), 'Arquivo 2 de 3');
    assert.equal(stmtConfirms().length, 1);
    await unmountAll();
    const run = await mountStatements(3, { 'extrato-2.ofx': { previewError: true } });
    await click(applyBtn());
    await flush(80);
    assert.match(stopBanner(), /extrato-2\.ofx: Falha ao ler extrato-2\.ofx/);
    assert.deepEqual(run.log, ['preview:1', 'confirm:1', 'preview:2'], 'the file that failed to preview is not previewed again');
    assert.equal(stmtConfirms().length, 1);
    assert.ok(btn(/^Pré-visualizar$/), 'try again is offered');
  });

  hubScenario('S2c when the confirm of this statement fails nothing else runs', async () => {
    const { log } = await mountStatements(3, { 'extrato-1.ofx': { confirmError: 'always' } });
    await click(applyBtn());
    await flush(60);
    assert.deepEqual(log, ['preview:1', 'confirm:1']);
    assert.equal(progressRows()[0].startsWith('extrato-1.ofx|Falhou'), true);
    assert.equal(applyBtn().disabled, true);
    assert.equal(closeX().disabled, false);
  });

  hubScenario('S3 a failed confirm blocks the file until its preview is refreshed; apply does not run over it; it can be skipped', async () => {
    const { log } = await mountStatements(2, { 'extrato-1.ofx': { confirmError: 'first' } });
    await click(confirmBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1']);
    assert.equal(confirmBtn().disabled, true);
    assert.match(alertText(), /Tempo esgotado/);
    assert.ok(refreshBtn());
    assert.equal(progressRows()[0].startsWith('extrato-1.ofx|Falhou'), true);
    assert.equal(applyBtn().disabled, true);
    await click(refreshBtn());
    await flush(30);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:1']);
    assert.equal(confirmBtn().disabled, false);
    assert.equal(progressRows()[0], 'extrato-1.ofx|Pronto para revisar');
    await click(confirmBtn());
    await flush(40);
    assert.equal(headerLabel(), 'Arquivo 2 de 2');
    await unmountAll();

    await mountStatements(2, { 'extrato-1.ofx': { confirmError: 'always' } });
    await click(confirmBtn());
    await flush(40);
    await click(skipBtn());
    await flush(30);
    assert.equal(headerLabel(), 'Arquivo 2 de 2');
    assert.equal(progressRows()[0].startsWith('extrato-1.ofx|Pulado'), true);
  });

  hubScenario('S4 the dialog cannot be closed while a confirm or the apply loop runs (also between two requests of the loop)', async () => {
    const tryClose = async () => {
      await click(closeX());
      await click(backdrop());
      await B.act(async () => { window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); });
    };
    let run = await mountStatements(2, {}, { gate: true });
    await click(confirmBtn());
    await flush(30);
    assert.deepEqual(run.log, ['preview:1', 'confirm:1']);
    assert.equal(closeX().disabled, true);
    await tryClose();
    assert.equal(run.m.closed, 0, 'while a confirm runs');
    await release(run.gates, 3);
    await click(btn(/^Fechar modal$/));
    await unmountAll();

    run = await mountStatements(2, { 'extrato-2.ofx': { gatePreview: true } }, { gate: true });
    await click(applyBtn());
    await flush(40);
    assert.deepEqual(run.log.slice(-1), ['confirm:1']);
    assert.equal(confirmBtn().textContent, 'Importando…');
    assert.equal(closeX().disabled, true);
    await tryClose();
    assert.equal(run.m.closed, 0, 'while the confirm of file 1 runs');
    await release(run.gates);
    assert.deepEqual(run.log.slice(-1), ['preview:2']);
    assert.match(bodyText(), /Aplicando o padrão: extrato-2\.ofx/);
    assert.equal(closeX().disabled, true, 'between two files of the loop');
    await tryClose();
    assert.equal(run.m.closed, 0, 'between two files of the loop');
    await release(run.gates, 4);
    assert.match(bodyText(), /Importação concluída/);
    await click(btn(/^Fechar$/));
    assert.equal(run.m.closed, 1);
  });

  hubScenario('S5 one statement through the queue props has no queue panel and closes after the confirm', async () => {
    const { m, log } = await mountStatements(1);
    assert.equal(document.querySelector('section[aria-label="Fila de importação"]'), null);
    assert.equal(skipBtn(), undefined);
    assert.equal(confirmBtn().textContent, 'Confirmar importação');
    await click(confirmBtn());
    await flush(30);
    assert.deepEqual(log, ['preview:1', 'confirm:1']);
    assert.equal(m.closed, 1);
  });

  hubScenario('G1 the preview shows the day printed in the file and lists the lines the server could not read, with the reason', async () => {
    assert.equal(new Date(2026, 10, 5).getTimezoneOffset(), 180, 'run the simulation with TZ=America/Sao_Paulo: the day must not shift in a zone behind UTC');
    await mountStatements(1, {
      'extrato-1.ofx': {
        rawPreview: {
          rows: [{ index: 0, date: '2026-11-05T00:00:00.000Z', description: 'Padaria Beta', amount: 12.5, type: 'EXPENSE', duplicate: false }],
          total: 1,
          duplicateCount: 0,
          newCount: 1,
          skipped: [{ line: 3, reason: 'invalid-date' }, { line: 5, reason: 'ambiguous-amount' }],
          skippedCount: 7,
        },
      },
    });
    const text = bodyText();
    assert.ok(text.includes('2026-11-05'), 'the day of the file (the simulated formatDate prints YYYY-MM-DD), not the day before it in the browser zone: ' + text.slice(0, 300));
    assert.ok(text.includes('7 linhas do arquivo foram ignoradas'), text.slice(0, 400));
    assert.ok(text.includes('Lançamento 3: data inválida'), 'an OFX counts entries');
    assert.ok(text.includes('Lançamento 5: valor ambíguo'), 'the reason of each line');
    assert.ok(text.includes('E mais 5'), 'the list holds the first lines only, and says how many are not shown');
  });

  hubScenario('G1b a preview from a server that does not send the skipped lines shows no notice', async () => {
    await mountStatements(1, { 'extrato-1.ofx': { rows: [false, true] } });
    assert.ok(!bodyText().includes('ignorada'), 'nothing to say about skipped lines');
  });

  hubScenario('G2 the confirm sends the whole file, duplicates included, and waits in proportion to the rows', async () => {
    const run = await mountStatements(1, { 'extrato-1.ofx': { rows: [false, true, false] } });
    await click(confirmBtn());
    await flush(30);
    const [confirm] = calls('confirm');
    assert.deepEqual(confirm.payload.rows.map((r) => r.description), ['Linha 1 (1)', 'Linha 2 (1)', 'Linha 3 (1)']);
    assert.equal(confirm.cfg.timeout, 30_300, '30 s plus 100 ms for each of the 3 rows sent');
    assert.ok(globalThis.__toasts.some((t) => t[1].includes('2 transações importadas')), 'the count is what the server imported, not the rows sent');
    assert.equal(run.m.closed, 1);
  });

  hubScenario('G3 a timeout says the import may still be running (never "0 importadas"); a 409 says another import of the account is running', async () => {
    await mountStatements(1);
    fake.confirm = async () => { throw new Error('Network error: Request timeout - server took too long to respond'); };
    await click(confirmBtn());
    await flush(30);
    assert.ok(alertText().includes('pode ainda estar em andamento no servidor'), alertText());
    assert.ok(alertText().includes('ignora o que já entrou'), alertText());
    assert.ok(!alertText().includes('0 importad'), 'no "0 importadas": ' + alertText());
    await unmountAll();

    await mountStatements(1);
    fake.confirm = async () => { throw Object.assign(new Error('An import is already running for this account.'), { status: 409 }); };
    await click(confirmBtn());
    await flush(30);
    assert.ok(alertText().includes('Já existe uma importação em andamento nesta conta'), alertText());
  });

  // =======================================================================================================
  // Onboarding: the closing day of a card
  // =======================================================================================================

  const maskStub = { value: '', numericValue: 0, onChange: () => undefined, setValue: () => undefined };
  function loadTranslations() {
    return JSON.parse(fs.readFileSync(path.join(FRONT, 'src', 'i18n', 'pt-BR.json'), 'utf8'));
  }
  async function mountOnboarding(accountType) {
    globalThis.__translations = loadTranslations();
    const submitted = [];
    const Harness = () => {
      const schemas = B.createSchemas(globalThis.__translations);
      const form = B.useForm({
        resolver: B.zodResolver(schemas.onboardingAccountSchema),
        defaultValues: { accountName: 'Cartão Exemplo', accountType, balance: 0, creditLimit: undefined, dueDay: undefined, closingDay: undefined },
      });
      globalThis.__onbForm = form;
      return B.createElement(B.OnboardingStep5, {
        accountForm: form, accountCurrencyMask: maskStub, creditLimitCurrencyMask: maskStub, accounts: [], baseCurrency: 'BRL',
        getAccountTypeLabel: (t) => t, hasExistingAccounts: false, isTransitioning: false, stepHeadingRef: { current: null },
        onSubmit: (data) => submitted.push(data),
      });
    };
    await mountWith(() => B.createElement(Harness));
    return submitted;
  }
  /** The limit and the due day, which this step already asks for: filled so that only the closing day decides the outcome. */
  const fillCardBasics = async () => {
    await typeInto(sel('creditLimit'), '100000');
    await typeInto(sel('dueDay'), '9');
  };
  const submitForm = async () => {
    const form = document.querySelector('form');
    await B.act(async () => { form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); });
    await flush(30);
  };

  hubScenario('O1 the card account step has the closing day field with the label and the "usually 7 days before the due day" hint', async () => {
    await mountOnboarding('CREDIT');
    const input = sel('closingDay');
    assert.ok(input, 'closing day input');
    assert.equal(input.type, 'number');
    assert.equal(input.min, '1');
    assert.equal(input.max, '31');
    const label = document.querySelector('label[for="closingDay"]');
    assert.equal(label.textContent, 'Dia de Fechamento');
    assert.equal(sel('closingDayHint').textContent, 'Normalmente 7 dias antes do vencimento');
    assert.equal(input.getAttribute('aria-describedby'), 'closingDayHint');
    assert.ok(sel('dueDay'), 'the due day is still there');
  });

  hubScenario('O8 the closing day follows the due day (due - 7, wrapping), keeps a typed value, clears with the due day, and is the placeholder', async () => {
    const submitted = await mountOnboarding('CREDIT');
    const closing = () => sel('closingDay').value;
    assert.equal(closing(), '');
    await typeInto(sel('dueDay'), '9');
    assert.equal(closing(), '2', 'due 9 fills closing 2');
    assert.equal(sel('closingDay').placeholder, '2', 'the suggestion is the placeholder');
    await typeInto(sel('dueDay'), '3');
    assert.equal(closing(), '26', 'still the suggestion: it follows (wraps into the previous month)');
    await typeInto(sel('closingDay'), '20');
    await typeInto(sel('dueDay'), '10');
    assert.equal(closing(), '20', 'a typed closing day is kept');
    await submitForm();
    assert.equal(submitted.length, 1, 'alerts: ' + alertText());
    assert.deepEqual([submitted[0].dueDay, submitted[0].closingDay], [10, 20]);
    await unmountAll();
    const second = await mountOnboarding('CREDIT');
    await typeInto(sel('dueDay'), '9');
    await typeInto(sel('dueDay'), '');
    assert.equal(sel('closingDay').value, '', 'clearing the due day clears the automatic closing day');
    assert.equal(sel('closingDay').placeholder, 'Ex: 15', 'and the placeholder is the example again');
    await typeInto(sel('dueDay'), '9');
    await submitForm();
    assert.equal(second.length, 1, 'alerts: ' + alertText());
    assert.deepEqual([second[0].dueDay, second[0].closingDay], [9, 2], 'the derived value is submitted');
  });

  hubScenario('O2 other account types have no closing day field', async () => {
    await mountOnboarding('CHECKING');
    assert.equal(sel('closingDay'), null);
    assert.equal(sel('dueDay'), null);
  });

  hubScenario('O3 a closing day typed in the step reaches the submit as a number', async () => {
    const submitted = await mountOnboarding('CREDIT');
    await fillCardBasics();
    await typeInto(sel('closingDay'), '7');
    await submitForm();
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].closingDay, 7);
    assert.equal(submitted[0].dueDay, 9);
    assert.equal(submitted[0].accountType, 'CREDIT');
  });

  hubScenario('O4 the closing day is optional: empty, or typed and cleared, submits without it', async () => {
    let submitted = await mountOnboarding('CREDIT');
    await submitForm();
    assert.equal(submitted.length, 1, 'alerts: ' + alertText());
    assert.equal(submitted[0].closingDay, undefined);
    await unmountAll();
    submitted = await mountOnboarding('CREDIT');
    await fillCardBasics();
    await typeInto(sel('closingDay'), '7');
    await typeInto(sel('closingDay'), '');
    await submitForm();
    assert.equal(submitted.length, 1, 'a cleared field (NaN) is not an error');
    assert.equal(submitted[0].closingDay, undefined);
  });

  hubScenario('O6 the credit limit and the due day are optional too: left empty (or cleared) they submit as not set', async () => {
    let submitted = await mountOnboarding('CREDIT');
    await submitForm();
    assert.equal(submitted.length, 1, 'alerts: ' + alertText());
    assert.deepEqual([submitted[0].creditLimit, submitted[0].dueDay, submitted[0].closingDay], [undefined, undefined, undefined]);
    await unmountAll();
    submitted = await mountOnboarding('CREDIT');
    await typeInto(sel('creditLimit'), '100000');
    await typeInto(sel('dueDay'), '9');
    await typeInto(sel('dueDay'), '');
    await submitForm();
    assert.equal(submitted.length, 1, 'alerts: ' + alertText());
    assert.equal(submitted[0].creditLimit, 1000);
    assert.equal(submitted[0].dueDay, undefined);
  });

  hubScenario('O7 leaving the card type clears the errors of the card fields (a hidden error would block a checking account)', async () => {
    const submitted = await mountOnboarding('CREDIT');
    await fillCardBasics();
    await typeInto(sel('closingDay'), '99');
    await submitForm();
    assert.equal(submitted.length, 0);
    assert.ok(globalThis.__onbForm.getFieldState('closingDay').error, 'the error is there');
    await B.act(async () => { globalThis.__onbForm.setValue('accountType', 'CHECKING'); });
    await flush(30);
    assert.equal(sel('closingDay'), null);
    for (const name of ['closingDay', 'dueDay', 'creditLimit']) assert.equal(globalThis.__onbForm.getFieldState(name).error, undefined, name);
    await submitForm();
    assert.equal(submitted.length, 1, 'the checking account goes through');
    assert.equal(submitted[0].accountType, 'CHECKING');
  });

  hubScenario('O5 a closing day outside 1..31 is refused with an alert on the field and nothing is submitted', async () => {
    for (const bad of ['0', '32']) {
      const submitted = await mountOnboarding('CREDIT');
      await fillCardBasics();
      await typeInto(sel('closingDay'), bad);
      await submitForm();
      assert.equal(submitted.length, 0, `closingDay=${bad} must not submit`);
      assert.match(alertText(), /Dia deve ser entre 1 e 31/);
      assert.equal(sel('closingDay').closest('div').querySelector('[role="alert"]')?.textContent, 'Dia deve ser entre 1 e 31');
      await unmountAll();
    }
  });

  // =======================================================================================================
  // A file with nothing to apply never stalls a queue
  // =======================================================================================================

  const continueNextBtn = () => btn(/^Continuar para (a próxima|o próximo)$/);
  const applyRestBtn = () => btn(/^(Confirmar esta e aplicar|Aplicar) o padrão nas restantes/);
  const queueNote = () => document.querySelector('[data-queue-note]')?.textContent ?? null;
  const queueBlocker = () => document.querySelector('[data-queue-blocker]')?.textContent ?? null;
  const currentIcon = () => document.querySelector('ol[aria-label="Progresso da fila"] > li[aria-current="step"] svg');
  const spinning = () => (currentIcon()?.getAttribute('class') ?? '').includes('animate-spin');
  const RECONCILED_FIRST = { 'fatura-1.ofx': { reconciled: true } };

  hubScenario('QN1 a queue of 3 whose first invoice is already reconciled: a clear note and "Continuar para a próxima", counted as "já conciliada"', async () => {
    const { m, log } = await mountQueue(3, RECONCILED_FIRST);
    assert.equal(headerLabel(), 'Fatura 1 de 3');
    assert.equal(queueNote(), 'Esta fatura já está conciliada: nada a importar.');
    assert.deepEqual(progressRows()[0], 'fatura-1.ofx|Já conciliada');
    assert.equal(spinning(), false, 'no spinner: nothing is in flight');
    assert.ok(continueNextBtn() && !continueNextBtn().disabled, 'the way forward is a primary button');
    assert.equal(confirmBtn()?.disabled ?? true, true, 'there is nothing to confirm');
    assert.ok(applyRestBtn() && !applyRestBtn().disabled, 'apply the default to the rest stays available');
    assert.equal(queueBlocker(), null);
    assert.deepEqual(log, ['preview:1']);
    await click(continueNextBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'preview:2'], 'the next invoice is previewed; nothing was confirmed');
    assert.equal(cardConfirms().length, 0);
    assert.equal(headerLabel(), 'Fatura 2 de 3');
    assert.equal(progressRows()[0], 'fatura-1.ofx|Já conciliada|Já conciliada: nada a importar');
    assert.deepEqual(progressRows().slice(1).map((r) => r.split('|').slice(0, 2).join('|')), ['fatura-2.ofx|Pronta para revisar', 'fatura-3.ofx|Aguardando']);
    assert.equal(queueNote(), null);
    await click(confirmBtn());
    await flush(40);
    await click(confirmBtn());
    await flush(40);
    assert.match(bodyText(), /2 faturas importadas, 1 já conciliada\./);
    assert.doesNotMatch(bodyText(), /pulada/);
    assert.equal(cardConfirms().length, 2);
    await click(btn(/^Fechar$/));
    assert.equal(m.closed, 1);
  });

  hubScenario('QN2 "Aplicar o padrão nas restantes" from a reconciled first invoice: it is left out and the loop takes files 2 and 3', async () => {
    const { log } = await mountQueue(3, RECONCILED_FIRST);
    await click(applyRestBtn());
    await flush(150);
    assert.deepEqual(log, ['preview:1', 'preview:2', 'confirm:2', 'preview:3', 'confirm:3']);
    assert.equal(stopBanner(), null);
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /2 faturas importadas, 1 já conciliada\./);
    assert.deepEqual(progressRows().map((r) => r.split('|').slice(0, 2).join('|')), ['fatura-1.ofx|Importada'.replace('Importada', 'Já conciliada'), 'fatura-2.ofx|Importada', 'fatura-3.ofx|Importada']);
  });

  hubScenario('QN3 the reconciled file is in the middle or the last: the loop and the continue button keep working', async () => {
    const { log } = await mountQueue(3, { 'fatura-3.ofx': { reconciled: true } });
    await click(confirmBtn());
    await flush(40);
    await click(confirmBtn());
    await flush(40);
    assert.equal(headerLabel(), 'Fatura 3 de 3');
    assert.equal(queueNote(), 'Esta fatura já está conciliada: nada a importar.');
    assert.equal(applyRestBtn(), undefined, 'no file after the last one: no "apply to the rest"');
    await click(continueNextBtn());
    await flush(40);
    assert.match(bodyText(), /Importação concluída/);
    assert.match(bodyText(), /2 faturas importadas, 1 já conciliada\./);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:2', 'confirm:2', 'preview:3']);
  });

  hubScenario('QN4 apply-to-rest from a reconciled invoice, followed by another reconciled one: both are left out', async () => {
    const { log } = await mountQueue(3, { 'fatura-1.ofx': { reconciled: true }, 'fatura-2.ofx': { reconciled: true } });
    await click(applyRestBtn());
    await flush(150);
    assert.deepEqual(log, ['preview:1', 'preview:2', 'preview:3', 'confirm:3']);
    assert.match(bodyText(), /1 fatura importada, 2 já conciliadas\./);
  });

  hubScenario('QN5 "Em análise" and the spinner only while the preview is in flight', async () => {
    const { gates } = await mountQueue(2, { 'fatura-1.ofx': { gatePreview: true } });
    assert.equal(progressRows()[0], 'fatura-1.ofx|Em análise');
    assert.equal(spinning(), true, 'the spinner while the request runs');
    assert.equal(continueNextBtn(), undefined);
    assert.equal(applyRestBtn().disabled, true);
    await release(gates);
    await flush(20);
    assert.equal(progressRows()[0], 'fatura-1.ofx|Pronta para revisar');
    assert.equal(spinning(), false, 'no spinner once the preview is on screen');
    assert.equal(applyRestBtn().disabled, false);
  });

  hubScenario('QN6 a preview that failed is "Aguardando" with no spinner (not "Em análise")', async () => {
    await mountQueue(2, { 'fatura-1.ofx': { previewError: 'always' } });
    assert.equal(progressRows()[0], 'fatura-1.ofx|Aguardando');
    assert.equal(spinning(), false);
    assert.equal(continueNextBtn(), undefined, 'no preview: nothing is known about the file');
    assert.equal(applyRestBtn().disabled, true);
  });

  hubScenario('QN7 another blocker keeps the buttons disabled and says why as visible text, not only a tooltip', async () => {
    await mountQueue(2);
    for (const label of ['Padaria 1', 'Livraria 1']) {
      const box = all('input[type=checkbox]').find((i) => (i.getAttribute('aria-label') ?? '').includes(label));
      await B.act(async () => { box.click(); });
    }
    await flush(10);
    assert.equal(queueBlocker(), 'Selecione ao menos uma proposta ou o pagamento da fatura anterior.');
    assert.equal(continueNextBtn(), undefined, 'a file that still has things to apply is not "already reconciled"');
    assert.equal(applyRestBtn().disabled, true);
    assert.equal(queueNote(), null);
  });

  hubScenario('QN8 the refresh notice after a failed confirm is visible text and the file is not offered as reconciled', async () => {
    await mountQueue(2, { 'fatura-1.ofx': { confirmError: 'always' } });
    await click(confirmBtn());
    await flush(40);
    assert.equal(queueBlocker(), 'Atualize a pré-visualização antes de confirmar de novo.');
    assert.equal(continueNextBtn(), undefined);
    assert.equal(applyRestBtn().disabled, true);
  });

  hubScenario('QN9 the confirms of a queue refresh the app once, at the end; a single invoice refreshes at once', async () => {
    const { m } = await mountQueue(3);
    const keys = [];
    const original = m.qc.invalidateQueries.bind(m.qc);
    m.qc.invalidateQueries = (filters, ...rest) => { keys.push(filters?.queryKey?.[0]); return original(filters, ...rest); };
    const count = () => keys.filter((k) => k === 'transactions').length;
    await click(confirmBtn());
    await flush(40);
    await click(confirmBtn());
    await flush(40);
    assert.equal(count(), 0, 'two confirms, no refetch of the transactions yet');
    await click(confirmBtn());
    await flush(40);
    assert.match(bodyText(), /Importação concluída/);
    assert.equal(count(), 1, 'once, when the queue ends');
    assert.deepEqual([...new Set(keys)].sort(), ['accounts', 'categories', 'dashboard', 'transactions']);
    await unmountAll();
    const single = await mountWith((onClose) => B.createElement(B.CardDialog, { open: true, onClose, accountId: 'acc-card', householdId: 'h1', files: invoices(1) }),
      { setup: () => { serveInvoices(); } });
    const keys1 = [];
    const original1 = single.qc.invalidateQueries.bind(single.qc);
    single.qc.invalidateQueries = (filters, ...rest) => { keys1.push(filters?.queryKey?.[0]); return original1(filters, ...rest); };
    await click(confirmBtn());
    await flush(40);
    assert.equal(keys1.filter((k) => k === 'transactions').length, 1, 'a single invoice invalidates right after its confirm');
  });

  hubScenario('QN10 a confirm that fails in a queue still refreshes at once (it may have applied part of it)', async () => {
    const { m } = await mountQueue(2, { 'fatura-1.ofx': { confirmError: 'always' } });
    const keys = [];
    const original = m.qc.invalidateQueries.bind(m.qc);
    m.qc.invalidateQueries = (filters, ...rest) => { keys.push(filters?.queryKey?.[0]); return original(filters, ...rest); };
    await click(confirmBtn());
    await flush(40);
    assert.equal(keys.filter((k) => k === 'transactions').length, 1);
  });

  hubScenario('QN11 the loop refreshes once when it ends and once more is not needed', async () => {
    const { m } = await mountQueue(3);
    const keys = [];
    const original = m.qc.invalidateQueries.bind(m.qc);
    m.qc.invalidateQueries = (filters, ...rest) => { keys.push(filters?.queryKey?.[0]); return original(filters, ...rest); };
    await click(applyBtn());
    await flush(150);
    assert.match(bodyText(), /Importação concluída/);
    assert.equal(keys.filter((k) => k === 'transactions').length, 1, 'three confirms, one refresh');
  });

  hubScenario('QN12 StrictMode runs the open effect twice but the invoice is previewed with one request', async () => {
    let server;
    await mountWith((onClose) => B.createElement(B.StrictMode, null,
      B.createElement(B.CardDialog, { open: true, onClose, accountId: 'acc-card', householdId: 'h1', initialFile: file('fatura-1.ofx', cardOfx('20260801')) })),
    { setup: () => { server = serveInvoices(); } });
    assert.deepEqual(server.log, ['preview:1']);
    assert.equal(calls('card-preview').length, 1, 'one network call, not two');
    assert.ok(confirmBtn(), 'and the preview is on screen');
  });

  hubScenario('QN13 a second preview of the same file after the first settled is a new request (refresh still works)', async () => {
    const { log } = await mountQueue(2, { 'fatura-1.ofx': { confirmError: 'first' } });
    await click(confirmBtn());
    await flush(40);
    await click(refreshBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'confirm:1', 'preview:1']);
  });

  hubScenario('QN14 a loop that stops (preview error on file 2) still refreshes the app once for what it confirmed', async () => {
    const { m } = await mountQueue(3, { 'fatura-2.ofx': { previewError: 'always' } });
    const keys = [];
    const original = m.qc.invalidateQueries.bind(m.qc);
    m.qc.invalidateQueries = (filters, ...rest) => { keys.push(filters?.queryKey?.[0]); return original(filters, ...rest); };
    await click(applyBtn());
    await flush(150);
    assert.ok(stopBanner(), 'the loop stopped at file 2');
    assert.equal(cardConfirms().length, 1);
    assert.equal(keys.filter((k) => k === 'transactions').length, 1, 'the one confirm that went through is refreshed when the loop stops');
  });

  // ---- statements ---------------------------------------------------------------------------------------

  hubScenario('QN20 a statement whose rows are all in Prumo: note, "Continuar para o próximo" ("Sem novidades"), apply-to-rest from it', async () => {
    const { log } = await mountStatements(3, { 'extrato-1.ofx': { rows: [true, true] } });
    assert.equal(queueNote(), 'Este arquivo não tem novidades: todas as linhas já estão no Prumo.');
    assert.equal(progressRows()[0], 'extrato-1.ofx|Sem novidades');
    assert.equal(spinning(), false);
    assert.ok(continueNextBtn() && !continueNextBtn().disabled);
    assert.ok(!applyRestBtn().disabled);
    await click(continueNextBtn());
    await flush(40);
    assert.deepEqual(log, ['preview:1', 'preview:2']);
    assert.equal(progressRows()[0], 'extrato-1.ofx|Sem novidades|Sem novidades: nada a importar');
    assert.equal(progressRows()[1], 'extrato-2.ofx|Pronto para revisar');
    await click(confirmBtn());
    await flush(40);
    await click(confirmBtn());
    await flush(40);
    assert.match(bodyText(), /2 arquivos importados, 1 sem novidades\./);
  });

  hubScenario('QN21 statements: apply-to-rest from a file with nothing new takes the rest', async () => {
    const { log } = await mountStatements(3, { 'extrato-1.ofx': { rows: [true] } });
    await click(applyRestBtn());
    await flush(150);
    assert.deepEqual(log, ['preview:1', 'preview:2', 'confirm:2', 'preview:3', 'confirm:3']);
    assert.match(bodyText(), /2 arquivos importados, 1 sem novidades\./);
    assert.equal(stmtConfirms().length, 2);
  });

  hubScenario('QN22 statements: a file with no row at all is not "sem novidades": the buttons stay disabled with the reason as text', async () => {
    await mountStatements(2, { 'extrato-1.ofx': { rows: [] } });
    assert.equal(continueNextBtn(), undefined);
    assert.equal(applyRestBtn().disabled, true);
    assert.equal(queueBlocker(), 'Nenhuma transação encontrada no arquivo.');
  });

  hubScenario('QN23 statements: "Em análise" only while the preview is in flight', async () => {
    const { gates } = await mountStatements(2, { 'extrato-1.ofx': { gatePreview: true } });
    assert.equal(progressRows()[0], 'extrato-1.ofx|Em análise');
    assert.equal(spinning(), true);
    await release(gates);
    await flush(20);
    assert.equal(progressRows()[0], 'extrato-1.ofx|Pronto para revisar');
    assert.equal(spinning(), false);
  });
}
