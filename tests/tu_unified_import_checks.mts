import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, checkAsync, frontSrc } from './harness.mts';

// Unified import: file type detection and sniffing (utils/importHub.ts), the queue state machine and the loop of
// "apply the default to the rest" (utils/importQueue.ts), the default plan of a card invoice / statement and the
// closing day notice (utils/cardOfxQueue.ts, utils/statementQueue.ts) and the onboarding account schema (closing day).
// Each module can be pointed at a mutated copy for the bite-checks:
//   IMPORT_HUB_MODULE, IMPORT_QUEUE_MODULE, CARD_QUEUE_MODULE, STATEMENT_QUEUE_MODULE, ONBOARDING_SCHEMA_MODULE.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const load = async (envName: string, rel: string): Promise<Any> => import(pathToFileURL(process.env[envName] || frontSrc(rel)).href);
const H = await load('IMPORT_HUB_MODULE', 'utils/importHub.ts');
const Q = await load('IMPORT_QUEUE_MODULE', 'utils/importQueue.ts');
const CQ = await load('CARD_QUEUE_MODULE', 'utils/cardOfxQueue.ts');
const SQ = await load('STATEMENT_QUEUE_MODULE', 'utils/statementQueue.ts');
const SCH = await load('ONBOARDING_SCHEMA_MODULE', 'schemas/index.ts');

// ---- Fixtures (invented) -----------------------------------------------------------------------------------

const SHEET_CSV = [
  '"Mês de setembro de 2026\n(planilha de exemplo)",,,,,,,,,',
  ',Descrição,Categoria,Previsto,Recebido,,Previsto,Realizado,,Notas',
  ',Salário Exemplo,,"R$ 1.000,00","R$ 1.000,00",,,,,',
  ',Aluguel,Casa,,,,"R$ 500,00","R$ 500,00",,',
  ',Total,,,,,"R$ 500,00","R$ 500,00",,',
  ',Mercado Alfa,Casa,,,,"R$ 80,00","R$ 80,00",,',
  ',Total,,,,,"R$ 80,00",,,',
  ',Pix Padaria,Casa,,,,"R$ 35,00","R$ 35,00",,',
  ',Total:,,,,,"R$ 35,00",,,',
].join('\r\n');
const STATEMENT_CSV = 'Data,Descrição,Valor\n2026-09-01,Padaria Beta,-12.50\n2026-09-02,Salário Exemplo,1000.00\n';
const CARD_OFX = 'OFXHEADER:100\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST><DTSTART>20260902000000[-3:BRT]<DTEND>20261002000000[-3:BRT]';
const CARD_OFX_XML = '<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST><DTSTART>20260802</DTSTART></BANKTRANLIST>';
const BANK_OFX = 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><DTSTART>20260901000000<DTEND>20260930000000';

console.log('\n[U1] what a file is: name and a sniff of its first bytes');

check('extension: .xlsx is a workbook, others by content, anything else is not taken (case-insensitive)', () => {
  assert.equal(H.detectImportKind('pasta.xlsx', null), 'workbook');
  assert.equal(H.detectImportKind('PASTA.XLSX', 'lixo'), 'workbook', 'an xlsx is never sniffed');
  assert.equal(H.detectImportKind('foto.png', ''), null);
  assert.equal(H.detectImportKind('antigo.xls', ''), null);
  assert.equal(H.importExtension('A.CSV'), 'csv');
  assert.equal(H.importExtension('semextensao'), null);
});

check('.ofx: CCSTMTRS or CREDITCARDMSGSRSV1 is a card invoice; a bank statement (STMTRS) is a statement', () => {
  assert.equal(H.detectImportKind('fatura.ofx', CARD_OFX), 'card');
  assert.equal(H.detectImportKind('fatura.ofx', 'x<creditcardmsgsrsv1>x'), 'card', 'case-insensitive');
  assert.equal(H.detectImportKind('fatura.ofx', 'x<CCSTMTRS>x'), 'card');
  assert.equal(H.detectImportKind('extrato.ofx', BANK_OFX), 'statement');
  assert.equal(H.detectImportKind('extrato.ofx', null), null, 'unreadable: not silently a statement, the user has to choose');
});

check('.csv: monthly sheet when column B of an early row is "Descrição" AND Total rows follow; else a statement', () => {
  assert.equal(H.detectImportKind('OUT.csv', SHEET_CSV), 'sheet');
  assert.equal(H.detectImportKind('OUT.csv', SHEET_CSV.replace(/,/g, ';').replace(/"R\$ (\d+);(\d+)"/g, '"R$ $1,$2"')), 'sheet', 'semicolon delimiter');
  assert.equal(H.detectImportKind('OUT.csv', `﻿${SHEET_CSV}`), 'sheet', 'BOM');
  assert.equal(H.detectImportKind('extrato.csv', STATEMENT_CSV), 'statement', 'a Descrição column alone (bank csv) is not the sheet');
  assert.equal(H.detectImportKind('x.csv', null), null, 'unreadable: the user has to choose');
  assert.equal(H.detectImportKind('x.csv', ',Mercado,Casa\n,Total,10\n,Total,10\n,Total,10\n'), 'statement', 'Total rows without the Descrição header');
  assert.equal(H.detectImportKind('x.csv', ',Descrição,Categoria\n,Mercado,Casa\n'), 'statement', 'header without Total rows');
});

check('csv sniff: header accent-insensitive, within the first rows only, Total only after the header', () => {
  const threeTotals = ',Total,1\n,Total,2\n,Total,3\n';
  assert.equal(H.isMonthlySheetCsv(`,DESCRICAO,Categoria\n,Mercado,Casa\n${threeTotals}`), true);
  const late = `${'a,b\n'.repeat(60)},Descrição,Cat\n${threeTotals}`;
  assert.equal(H.isMonthlySheetCsv(late), false, 'header after the 40th row is not the sheet');
  assert.equal(H.isMonthlySheetCsv(`${threeTotals},Descrição,Cat\n,Mercado,Casa\n`), false, 'Total before the header does not count');
  assert.equal(H.isMonthlySheetCsv('Total,Descrição\nTotal,1\n'), false, 'column A is not column B');
});

check('bank csv with "Total ..." descriptions is a statement; a sheet needs three bare Total rows (the parser rule: the whole cell)', () => {
  const bank = 'Data,Descrição,Valor\n01/09/2026,Mercado,-10\n02/09/2026,Total Pass academia,-99\n03/09/2026,Total Pass,-9\n04/09/2026,TOTAL PAGO FATURA,-1\n';
  assert.equal(H.detectImportKind('extrato.csv', bank), 'statement');
  assert.equal(H.detectImportKind('extrato.csv', bank.replace(/,/g, ';')), 'statement', 'semicolon');
  assert.equal(H.isTotalCell(' Total '), true);
  assert.equal(H.isTotalCell('TOTAL:'), true);
  assert.equal(H.isTotalCell('Total geral'), false);
  assert.equal(H.isTotalCell('Totalizador'), false);
  assert.equal(H.isMonthlySheetCsv(',Descrição,V\n,Total,1\n,Total,2\n'), false, 'two are not enough');
  assert.equal(H.detectImportKind('OUT.csv', SHEET_CSV), 'sheet', 'a real sheet stays a sheet');
});

check('an .ofx is read whole and is a card invoice when CCSTMTRS is anywhere in it, also after a bank section over 64 KB', () => {
  const bank = '<BANKMSGSRSV1><STMTTRNRS><STMTRS>' + '<STMTTRN><TRNAMT>-1</TRNAMT><MEMO>x</MEMO></STMTTRN>\n'.repeat(3000) + '</STMTRS></STMTTRNRS></BANKMSGSRSV1>';
  const both = bank + '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>';
  assert.ok(bank.length > H.SNIFF_BYTES);
  const size = both.length;
  assert.deepEqual(H.sniffPlan('x.ofx', size), { read: 'full', note: null });
  assert.deepEqual(H.classifyFile({ name: 'x.ofx', size }, both), { kind: 'card', note: null }, 'whole text: card');
  assert.equal(H.classifyFile({ name: 'x.ofx', size }, both.slice(0, H.SNIFF_BYTES)).kind, 'statement', 'what the old head sniff would have said');
  assert.deepEqual(H.classifyFile({ name: 'x.ofx', size }, bank), { kind: 'statement', note: null });
});

check('an .ofx over 5 MB is not read and is a statement, with the reason; an unreadable file has no kind (the user chooses)', () => {
  const big = 5 * 1024 * 1024 + 1;
  const plan = H.sniffPlan('grande.ofx', big);
  assert.equal(plan.read, 'none');
  assert.match(plan.note, /Maior que 5 MB/);
  const r = H.classifyFile({ name: 'grande.ofx', size: big }, null);
  assert.equal(r.kind, 'statement');
  assert.match(r.note, /tratado como extrato/);
  assert.deepEqual(H.classifyFile({ name: 'x.ofx', size: 10 }, null), { kind: null, note: null }, 'read failed');
  assert.deepEqual(H.classifyFile({ name: 'x.csv', size: 10 }, null), { kind: null, note: null });
  assert.equal(H.classifyFile({ name: 'x.xlsx', size: 10 }, null).kind, 'workbook');
  assert.deepEqual(H.sniffPlan('x.csv', 10), { read: 'head', note: null });
  assert.equal(H.sniffPlan('x.xlsx', 10).read, 'none');
  const check1 = H.checkHubSelection([{ name: 'x.ofx', kind: null, problem: null }, { name: 'y.ofx', kind: 'card', problem: null }]);
  assert.equal(check1.ok, false);
  assert.match(check1.message, /x\.ofx: não foi possível ler o arquivo\. Escolha o Tipo\./);
});

check('parseCsvHead: quotes, doubled quotes and line breaks inside quotes; row limit', () => {
  const rows = H.parseCsvHead('a,"b ""q""\nc",d\r\ne,f\n', ',');
  assert.deepEqual(rows, [['a', 'b "q"\nc', 'd'], ['e', 'f']]);
  assert.equal(H.parseCsvHead('1\n2\n3\n4\n', ',', 2).length, 2);
});

check('decodeSniffBytes: UTF-8 (also cut mid-character at the end), else Windows-1252', () => {
  const enc = new TextEncoder();
  assert.equal(H.decodeSniffBytes(enc.encode('Descrição')), 'Descrição');
  const cut = enc.encode('Descrição').slice(0, 9); // D e s c r i + ç (2 bytes) + the first byte of "ã" (2 bytes)
  assert.equal(cut.length, 9);
  assert.equal(H.decodeSniffBytes(cut), 'Descriç', 'a character cut by the slice is dropped, the text does not flip to 1252');
  assert.equal(H.decodeSniffBytes(new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f])), 'Descrição', 'cp1252 bytes');
});

console.log('\n[U2] the date used to order the files');

check('ofxPeriodStart: SGML (with time and zone) and XML forms; impossible dates are not dates', () => {
  assert.equal(H.ofxPeriodStart(CARD_OFX), '2026-09-02');
  assert.equal(H.ofxPeriodStart(CARD_OFX_XML), '2026-08-02');
  assert.equal(H.ofxPeriodStart('<dtstart> 20260930'), '2026-09-30', 'case-insensitive, spaces');
  assert.equal(H.ofxPeriodStart('<DTSTART>20261340'), null);
  assert.equal(H.ofxPeriodStart('<DTEND>20261002'), null, 'DTEND is not the start');
});

check('dateFromFileName: ISO, dd-mm-yyyy, yyyymmdd and yyyy-mm; invalid or absent give null', () => {
  assert.equal(H.dateFromFileName('Nubank_2026-10-09.ofx'), '2026-10-09');
  assert.equal(H.dateFromFileName('fatura 2026_09_02.ofx'), '2026-09-02');
  assert.equal(H.dateFromFileName('fatura-02-09-2026.ofx'), '2026-09-02');
  assert.equal(H.dateFromFileName('fatura20260902.ofx'), '2026-09-02');
  assert.equal(H.dateFromFileName('fatura-2026-09.ofx'), '2026-09-01');
  assert.equal(H.dateFromFileName('fatura-2026-13-40.ofx'), null);
  assert.equal(H.dateFromFileName('fatura-2026-02-30.ofx'), null, 'February 30th');
  assert.equal(H.dateFromFileName('fatura.ofx'), null);
  assert.equal(H.dateFromFileName('cod12345678901.ofx'), null, 'a long number is not a date');
});

check('periodStartOf: the OFX header wins over the name; the name is the fallback; csv never reads a header', () => {
  assert.deepEqual(H.periodStartOf('Nubank_2026-10-09.ofx', CARD_OFX), { date: '2026-09-02', source: 'ofx' });
  assert.deepEqual(H.periodStartOf('Nubank_2026-10-09.ofx', 'OFXHEADER:100'), { date: '2026-10-09', source: 'name' });
  assert.deepEqual(H.periodStartOf('Nubank_2026-10-09.ofx', null), { date: '2026-10-09', source: 'name' });
  assert.deepEqual(H.periodStartOf('extrato-2026-07.csv', '<DTSTART>20250101'), { date: '2026-07-01', source: 'name' });
  assert.equal(H.periodStartOf('extrato.ofx', 'OFXHEADER:100'), null);
});

check('orderByPeriod: oldest first; undated last in selection order; ties keep selection order', () => {
  const items = [
    { n: 'c', periodStart: '2026-10-02' }, { n: 'u1', periodStart: null }, { n: 'a', periodStart: '2026-08-02' },
    { n: 'u2', periodStart: null }, { n: 'b1', periodStart: '2026-09-02' }, { n: 'b2', periodStart: '2026-09-02' },
  ];
  assert.deepEqual(H.orderByPeriod(items).map((i: Any) => i.n), ['a', 'b1', 'b2', 'c', 'u1', 'u2']);
  assert.deepEqual(items.map((i) => i.n), ['c', 'u1', 'a', 'u2', 'b1', 'b2'], 'the input is not mutated');
});

console.log('\n[U3] what the selection needs');

check('fileProblem: the kind must fit the extension; card and sheet files are limited to 5 MB', () => {
  assert.equal(H.fileProblem('card', { name: 'f.ofx', size: 10 }), null);
  assert.match(H.fileProblem('card', { name: 'f.csv', size: 10 }), /não aceita arquivos \.csv/);
  assert.match(H.fileProblem('workbook', { name: 'f.ofx', size: 10 }), /não aceita arquivos \.ofx/);
  assert.match(H.fileProblem('sheet', { name: 'f.png', size: 10 }), /Formato não suportado/);
  assert.match(H.fileProblem('card', { name: 'f.ofx', size: 5 * 1024 * 1024 + 1 }), /limite de 5 MB/);
  assert.match(H.fileProblem('workbook', { name: 'f.xlsx', size: 6 * 1024 * 1024 }), /limite de 5 MB/);
  assert.equal(H.fileProblem('statement', { name: 'f.csv', size: 50 * 1024 * 1024 }), null, 'no client limit for statements');
});

check('checkHubSelection: mixed kinds are refused with a message that names them and says to import separately', () => {
  const r = H.checkHubSelection([
    { name: 'a.ofx', kind: 'card', problem: null }, { name: 'b.ofx', kind: 'statement', problem: null },
  ]);
  assert.equal(r.ok, false);
  assert.match(r.message, /tipos diferentes/);
  assert.match(r.message, /Fatura do cartão \(OFX\)/);
  assert.match(r.message, /Extrato \(OFX\/CSV\)/);
  assert.match(r.message, /separadamente/);
});

check('checkHubSelection: one kind goes on; empty has no message; a file with a problem blocks; sheet/workbook are one file at a time', () => {
  assert.deepEqual(H.checkHubSelection([]), { ok: false, kind: null, message: null });
  assert.deepEqual(H.checkHubSelection([{ name: 'a.ofx', kind: 'card', problem: null }, { name: 'b.ofx', kind: 'card', problem: null }]),
    { ok: true, kind: 'card' });
  assert.deepEqual(H.checkHubSelection([{ name: 'a.csv', kind: 'statement', problem: null }, { name: 'b.ofx', kind: 'statement', problem: null }]),
    { ok: true, kind: 'statement' }, 'ofx and csv statements go together');
  const broken = H.checkHubSelection([{ name: 'a.ofx', kind: 'card', problem: 'grande demais' }]);
  assert.equal(broken.ok, false);
  assert.match(broken.message, /a\.ofx: grande demais/);
  const sheets = H.checkHubSelection([{ name: 'a.csv', kind: 'sheet', problem: null }, { name: 'b.csv', kind: 'sheet', problem: null }]);
  assert.equal(sheets.ok, false);
  assert.match(sheets.message, /um arquivo por vez/);
  assert.equal(H.checkHubSelection([{ name: 'a.xlsx', kind: 'workbook', problem: null }, { name: 'b.xlsx', kind: 'workbook', problem: null }]).ok, false);
  assert.equal(H.checkHubSelection([{ name: 'a.csv', kind: 'sheet', problem: null }]).ok, true);
});

check('kindsForExtension: what the "Tipo" select offers per extension', () => {
  assert.deepEqual(H.kindsForExtension('ofx'), ['card', 'statement']);
  assert.deepEqual(H.kindsForExtension('csv'), ['sheet', 'statement']);
  assert.deepEqual(H.kindsForExtension('xlsx'), ['workbook']);
  assert.deepEqual(H.kindsForExtension(null), []);
});

const ACCS = [
  { id: 'main', type: 'CHECKING' }, { id: 'card1', type: 'CREDIT' }, { id: 'card2', type: 'CREDIT' }, { id: 'old', type: 'CREDIT', isActive: false },
  { id: 'sav', type: 'SAVINGS' },
];

check('destination: the preferred account when it fits the kind, the only fitting account otherwise, never an inactive card', () => {
  assert.equal(H.defaultDestination('card', ACCS, 'card2'), 'card2');
  assert.equal(H.defaultDestination('card', ACCS, 'main'), '', 'a checking account is not a card; two cards: no guess');
  assert.equal(H.defaultDestination('card', ACCS, 'old'), '', 'inactive');
  assert.equal(H.defaultDestination('card', [{ id: 'only', type: 'CREDIT' }], null), 'only');
  assert.equal(H.defaultDestination('statement', ACCS, 'card1'), '', 'a card is not a statement account');
  assert.equal(H.defaultDestination('statement', ACCS, 'sav'), 'sav');
  assert.deepEqual(H.cardAccounts(ACCS).map((a: Any) => a.id), ['card1', 'card2']);
  assert.deepEqual(H.statementAccounts(ACCS).map((a: Any) => a.id), ['main', 'sav']);
});

check('defaultSheetAccounts: remembered choices that still fit, else the first card / first other account; keeps what is chosen', () => {
  const empty = { income: '', bills: '', credit: '', debit: '' };
  assert.deepEqual(H.defaultSheetAccounts(ACCS, {}, empty), { income: 'main', bills: 'main', credit: 'card1', debit: 'main' });
  assert.deepEqual(H.defaultSheetAccounts(ACCS, { income: 'sav', credit: 'card2', debit: 'ghost' }, empty),
    { income: 'sav', bills: 'main', credit: 'card2', debit: 'main' }, 'a vanished account falls back');
  assert.equal(H.defaultSheetAccounts(ACCS, { credit: 'main' }, empty).credit, 'card1', 'a saved non-card cannot be the card block');
  assert.equal(H.defaultSheetAccounts(ACCS, {}, { ...empty, income: 'sav' }).income, 'sav', 'the user choice is not overridden');
});

check('destinationProblem: card and statement need one account, sheets all four blocks', () => {
  const sheet = { income: 'a', bills: 'a', credit: 'b', debit: 'a' };
  assert.match(H.destinationProblem('card', { accountId: '', sheetAccounts: sheet }), /cartão/);
  assert.equal(H.destinationProblem('card', { accountId: 'x', sheetAccounts: { ...sheet, income: '' } }), null);
  assert.match(H.destinationProblem('statement', { accountId: '', sheetAccounts: sheet }), /conta de destino/);
  assert.equal(H.destinationProblem('sheet', { accountId: '', sheetAccounts: sheet }), null);
  assert.match(H.destinationProblem('workbook', { accountId: 'x', sheetAccounts: { ...sheet, debit: '' } }), /cada bloco/);
});

// ---- Queue state machine -----------------------------------------------------------------------------------

console.log('\n[U4] the queue: state machine');

const names = ['a.ofx', 'b.ofx', 'c.ofx'];

check('createQueue / queueLabel: "Fatura N de M", empty once finished', () => {
  const q = Q.createQueue(names);
  assert.equal(Q.queueLabel(q, 'Fatura'), 'Fatura 1 de 3');
  assert.equal(Q.currentItem(q).name, 'a.ofx');
  assert.equal(Q.isQueueFinished(q), false);
  const done = Q.skipCurrent(Q.skipCurrent(Q.skipCurrent(q)));
  assert.equal(Q.isQueueFinished(done), true);
  assert.equal(Q.queueLabel(done, 'Fatura'), '');
  assert.equal(Q.currentItem(done), null);
});

check('completeCurrent: marks done with a note and moves to the next; nothing after the end', () => {
  let q = Q.completeCurrent(Q.createQueue(names), '3 criadas');
  assert.equal(q.index, 1);
  assert.deepEqual([q.items[0].status, q.items[0].note], ['done', '3 criadas']);
  assert.equal(Q.queueLabel(q, 'Fatura'), 'Fatura 2 de 3');
  q = Q.completeCurrent(Q.completeCurrent(q, null), null);
  assert.equal(Q.isQueueFinished(q), true);
  assert.equal(Q.completeCurrent(q, 'x'), q, 'finished: unchanged');
});

check('a failed file stays on screen, blocked: it cannot be completed until it is refreshed (retryCurrent)', () => {
  const q = Q.failCurrent(Q.createQueue(names), 'rede');
  assert.equal(q.index, 0);
  assert.equal(q.items[0].status, 'failed');
  assert.equal(Q.canConfirmCurrent(q), false);
  assert.equal(Q.completeCurrent(q, 'x'), q, 'completeCurrent refuses a failed file');
  const again = Q.retryCurrent(q);
  assert.equal(Q.canConfirmCurrent(again), true);
  assert.equal(again.items[0].note, null);
  assert.equal(Q.completeCurrent(again, 'ok').index, 1);
  assert.equal(Q.failCurrent(q, 'outra'), q, 'failing twice changes nothing');
  assert.equal(Q.retryCurrent(Q.createQueue(names)).items[0].status, 'pending');
});

check('skipCurrent: from pending or failed, moves on and counts as skipped', () => {
  const failed = Q.failCurrent(Q.createQueue(names), 'rede');
  const q = Q.skipCurrent(failed);
  assert.equal(q.index, 1);
  assert.equal(q.items[0].status, 'skipped');
  const totals = Q.queueTotals(Q.completeCurrent(q, 'x'));
  assert.deepEqual(totals, { done: 1, skipped: 1, uptodate: 0, failed: 0, pending: 1 });
  assert.equal(Q.queueSummaryLine(Q.completeCurrent(q, 'x'), { done: ['importada', 'importadas'], skipped: ['pulada', 'puladas'], uptodate: ['já importada', 'já importadas'], failed: ['falha', 'falhas'] }),
    '1 importada, 1 pulada');
});

check('markUpToDateCurrent: leaves a pending file out on its own, counted apart from the skipped; refused for a failed one', () => {
  let q = Q.markUpToDateCurrent(Q.createQueue(names), 'nada a importar');
  assert.equal(q.index, 1);
  assert.deepEqual([q.items[0].status, q.items[0].note], ['uptodate', 'nada a importar']);
  q = Q.skipCurrent(q);
  const nouns = { done: ['importada', 'importadas'], skipped: ['pulada', 'puladas'], uptodate: ['já importada', 'já importadas'], failed: ['falha', 'falhas'] };
  assert.equal(Q.queueSummaryLine(q, nouns), '1 pulada, 1 já importada');
  const failed = Q.failCurrent(Q.createQueue(names), 'rede');
  assert.equal(Q.markUpToDateCurrent(failed, 'x'), failed);
  assert.equal(Q.remainingCount(Q.markUpToDateCurrent(Q.createQueue(names), null)), 2);
});

check('remainingCount / followingCount: the file on screen plus the waiting ones / only the ones after it', () => {
  let q = Q.createQueue(names);
  assert.equal(Q.remainingCount(q), 3);
  assert.equal(Q.followingCount(q), 2);
  q = Q.completeCurrent(q, null);
  assert.equal(Q.remainingCount(q), 2);
  assert.equal(Q.followingCount(q), 1);
  q = Q.completeCurrent(q, null);
  assert.equal(Q.followingCount(q), 0);
  assert.equal(Q.remainingCount(q), 1);
  assert.equal(Q.remainingCount(Q.skipCurrent(q)), 0);
});

console.log('\n[U5] the queue: "apply the default to the rest"');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await checkAsync('applyDefaultsToRemaining: one file at a time (the next starts only after the previous resolved), in order, all done', async () => {
  const log: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const run = await Q.applyDefaultsToRemaining(Q.createQueue(names), async (_i: number, item: Any) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    log.push(`start ${item.name}`);
    await sleep(5);
    log.push(`end ${item.name}`);
    running -= 1;
    return { ok: true, note: `ok ${item.name}` };
  });
  assert.equal(maxRunning, 1);
  assert.deepEqual(log, ['start a.ofx', 'end a.ofx', 'start b.ofx', 'end b.ofx', 'start c.ofx', 'end c.ofx']);
  assert.equal(run.stop, null);
  assert.equal(Q.isQueueFinished(run.state), true);
  assert.deepEqual(run.state.items.map((i: Any) => i.note), ['ok a.ofx', 'ok b.ofx', 'ok c.ofx']);
});

await checkAsync('applyDefaultsToRemaining: starts at the file on screen, not at the beginning', async () => {
  const seen: string[] = [];
  const start = Q.completeCurrent(Q.createQueue(names), 'antes');
  const run = await Q.applyDefaultsToRemaining(start, async (_i: number, item: Any) => { seen.push(item.name); return { ok: true, note: 'x' }; });
  assert.deepEqual(seen, ['b.ofx', 'c.ofx']);
  assert.equal(run.state.items[0].note, 'antes');
});

await checkAsync('a file with nothing to import is left out and the loop goes on (it is not a stop)', async () => {
  const seen: string[] = [];
  const run = await Q.applyDefaultsToRemaining(Q.createQueue(names), async (_i: number, item: Any) => {
    seen.push(item.name);
    return item.name === 'b.ofx' ? { ok: true, upToDate: true, note: 'Nada a importar' } : { ok: true, note: 'x' };
  });
  assert.deepEqual(seen, ['a.ofx', 'b.ofx', 'c.ofx']);
  assert.equal(run.stop, null);
  assert.equal(Q.isQueueFinished(run.state), true);
  assert.deepEqual(run.state.items.map((i: Any) => i.status), ['done', 'uptodate', 'done']);
});

await checkAsync('stops at the first file that cannot proceed (nothing written): it stays on screen, pending, and the rest is untouched', async () => {
  const seen: string[] = [];
  const run = await Q.applyDefaultsToRemaining(Q.createQueue(names), async (_i: number, item: Any) => {
    seen.push(item.name);
    return item.name === 'b.ofx' ? { ok: false, written: false, reason: 'Selecione ao menos uma proposta.' } : { ok: true, note: 'x' };
  });
  assert.deepEqual(seen, ['a.ofx', 'b.ofx'], 'c.ofx was never touched');
  assert.deepEqual(run.stop, { index: 1, name: 'b.ofx', reason: 'Selecione ao menos uma proposta.' });
  assert.equal(run.state.index, 1);
  assert.deepEqual(run.state.items.map((i: Any) => i.status), ['done', 'pending', 'pending']);
});

await checkAsync('a confirm that failed (written) blocks the file until refreshed, and the loop does not walk over a failed file', async () => {
  const run = await Q.applyDefaultsToRemaining(Q.createQueue(names), async (_i: number) => ({ ok: false, written: true, reason: 'timeout' }));
  assert.equal(run.state.items[0].status, 'failed');
  assert.equal(run.state.index, 0);
  assert.equal(run.stop.reason, 'timeout');
  let calls = 0;
  const again = await Q.applyDefaultsToRemaining(run.state, async () => { calls += 1; return { ok: true, note: 'x' }; });
  assert.equal(calls, 0, 'still failed: nothing is requested');
  assert.equal(again.stop.index, 0);
  const refreshed = Q.retryCurrent(run.state);
  const third = await Q.applyDefaultsToRemaining(refreshed, async () => ({ ok: true, note: 'ok' }));
  assert.equal(Q.isQueueFinished(third.state), true);
});

await checkAsync('an exception in a step is a stop, not a crash', async () => {
  const run = await Q.applyDefaultsToRemaining(Q.createQueue(names), async () => { throw new Error('boom'); });
  assert.equal(run.stop.reason, 'boom');
  assert.equal(run.state.items[0].status, 'pending');
});

await checkAsync('the loop never asks twice for a file the queue refuses to move past', async () => {
  // An inconsistent state (the file on screen is already done): completeCurrent refuses it. Must stop, not spin.
  const stuck = { items: [{ id: 'q0', name: 'a.ofx', status: 'done', note: null }], index: 0 };
  let calls = 0;
  const run = await Q.applyDefaultsToRemaining(stuck, async () => { calls += 1; if (calls > 5) throw new Error('asked again and again'); return { ok: true, note: 'x' }; });
  assert.equal(calls, 1);
  assert.match(run.stop.reason, /A fila não avançou/);
});

await checkAsync('shouldStop ends the loop before the next file; onProgress sees every state', async () => {
  let stopAfter = 1;
  const progress: number[] = [];
  const run = await Q.applyDefaultsToRemaining(Q.createQueue(names), async () => ({ ok: true, note: 'x' }), {
    shouldStop: () => stopAfter-- <= 0,
    onProgress: (s: Any) => progress.push(s.index),
  });
  assert.equal(run.state.index, 1);
  assert.equal(run.stop, null);
  assert.deepEqual(progress, [1]);
});

// ---- Default plan of a card invoice ------------------------------------------------------------------------

console.log('\n[U6] card queue: default plan, closing day, totals');

let ln = 0;
const L = (memo: string, amount: number, o: Record<string, Any> = {}): Any => {
  ln += 1;
  return {
    ref: `ofx:Z${ln}:0000000${ln % 10}`, fitid: `Z${ln}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo,
    merchant: memo, installment: null, status: 'proposed', group: null, ...o,
  };
};
const P = (group: string, kind: string, lines: Any[], o: Record<string, Any> = {}): Any => {
  for (const l of lines) l.group = group;
  return { group, kind, refs: lines.map((l: Any) => l.ref), defaultSelected: true, ambiguous: false, target: null, result: null, futureInstallments: 0, ...o };
};
const T = (id: string, amount: number) => ({ transactionId: id, description: id, amount, type: 'EXPENSE', date: '2026-09-08', sourceRef: null });
function cardPreview(o: Record<string, Any> = {}): Any {
  ln = 0;
  const a = L('Padaria Zeta', 20);
  const b1 = L('Farmácia Beta', 30);
  const b2 = L('Farmácia Beta', 20);
  const c = L('Livraria Gama', 45.5);
  const d = L('Loja Delta', 10);
  const e = L('Loja Delta', 10, { type: 'INCOME', kind: 'refund' });
  const f = L('Coisa Nova', 5);
  const pay = L('Pagamento recebido', 400, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-09' });
  const proposals = [
    P('g-exact', 'enrich-exact', [a], { target: T('t-a', 20) }),
    P('g-amb', 'enrich-sum', [b1, b2], { defaultSelected: false, ambiguous: true, target: T('t-b', 50) }),
    P('g-new', 'create', [c]),
    P('g-rev', 'reversal', [d, e], { defaultSelected: false }),
    P('g-unknown', 'mystery-kind', [f]),
  ];
  return {
    accountId: 'card1', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement',
    period: { start: '2026-09-02', end: '2026-10-02' }, ofxTotal: 120.5, lines: [a, b1, b2, c, d, e, f, pay], proposals, sheetOnly: [],
    payment: { ref: pay.ref, amount: 400, date: '2026-09-09', invoiceMonthKey: '2026-09', proposal: 'create', recorded: null },
    categoryMap: [{ key: 'Livraria Gama', type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'system', categoryName: 'EDUCATION', label: 'Educação' } }],
    totals: { lines: 8, reconciled: 0, proposals: 5, create: 1, sheetOnly: 0 }, warnings: [], ...o,
  };
}
const CTX = { accounts: [{ id: 'main', type: 'CHECKING' }, { id: 'card1', type: 'CREDIT' }], customIdsByType: { INCOME: new Set<string>(), EXPENSE: new Set<string>() } };

check('planCardDefaultApply: sends only the groups the server marks (never an ambiguous, reversal-pair or unknown one)', () => {
  const plan = CQ.planCardDefaultApply(cardPreview(), CTX, { sourceAccountId: 'main' });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.built.payload.selectedGroups, ['g-exact', 'g-new']);
  assert.equal(plan.built.payload.lines.length, 8, 'every line of the preview is echoed');
  assert.equal(plan.built.payload.monthKey, '2026-10');
});

check('planCardDefaultApply: the payment to create needs the queue source account; without it the file cannot proceed', () => {
  const missing = CQ.planCardDefaultApply(cardPreview(), CTX, { sourceAccountId: '' });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'payment-source');
  assert.equal(missing.reason, CQ.QUEUE_PAYMENT_SOURCE_MISSING);
  const ok = CQ.planCardDefaultApply(cardPreview(), CTX, { sourceAccountId: 'main' });
  assert.deepEqual(ok.built.payload.payment, { apply: true, sourceAccountId: 'main' });
});

check('planCardDefaultApply: an adjustment whose recorded payment has a source does not need (or send) one', () => {
  const p = cardPreview();
  p.payment = { ...p.payment, proposal: 'adjust', recorded: { transactionId: 'tp', amount: 390, date: '2026-09-10', sourceAccountId: 'main' } };
  const plan = CQ.planCardDefaultApply(p, CTX, { sourceAccountId: '' });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.built.payload.payment, { apply: true });
  p.payment = { ...p.payment, recorded: { transactionId: 'tp', amount: 390, date: '2026-09-10', sourceAccountId: null } };
  assert.equal(CQ.planCardDefaultApply(p, CTX, { sourceAccountId: '' }).code, 'payment-source', 'recorded without a source needs one');
  p.payment = { ...p.payment, proposal: 'ok' };
  const none = CQ.planCardDefaultApply(p, CTX, { sourceAccountId: '' });
  assert.equal(none.ok, true);
  assert.equal(none.built.payload.payment, null, 'nothing to do for the payment');
});

check('planCardDefaultApply: a queue source that cannot pay (a card) or does not exist is the blocker of the file', () => {
  const card = CQ.planCardDefaultApply(cardPreview(), CTX, { sourceAccountId: 'card1' });
  assert.equal(card.ok, false);
  assert.equal(card.code, 'blocker');
  assert.match(card.reason, /cartão de crédito/);
  assert.match(CQ.planCardDefaultApply(cardPreview(), CTX, { sourceAccountId: 'ghost' }).reason, /não foi encontrada/);
});

check('planCardDefaultApply: nothing to apply, or more than 1000 lines, is a blocker with the message of the dialog', () => {
  const empty = cardPreview({ proposals: [], payment: null });
  const r = CQ.planCardDefaultApply(empty, CTX, { sourceAccountId: 'main' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'nothing-to-do', 'the loop leaves such a file out');
  assert.match(r.reason, /Nada a importar/);
  const many = cardPreview();
  many.lines = Array.from({ length: 1001 }, (_, i) => ({ ...many.lines[0], ref: `ofx:M${i}:00000000`, fitid: `M${i}`, group: null }));
  many.proposals = [];
  many.payment = null;
  const tooMany = CQ.planCardDefaultApply(many, CTX, { sourceAccountId: 'main' });
  assert.equal(tooMany.code, 'blocker', 'a real blocker stops the loop');
  assert.match(tooMany.reason, /1001 lançamentos/);
});

check('planCardDefaultApply: only proposals the server does not mark (nothing selected) is a real blocker, not "nothing to import"', () => {
  const p = cardPreview({ payment: null });
  p.proposals = p.proposals.filter((x: Any) => x.group === 'g-amb');
  const plan = CQ.planCardDefaultApply(p, CTX, { sourceAccountId: 'main' });
  assert.equal(plan.ok, false);
  assert.equal(plan.code, 'blocker');
  assert.match(plan.reason, /Selecione ao menos uma proposta/);
});

check('planCardDefaultApply: the remembered category choice of the household reaches the create merchants', () => {
  const saved = { 'EXPENSE|livraria gama': { kind: 'system', categoryName: 'ENTERTAINMENT' } };
  const plan = CQ.planCardDefaultApply(cardPreview(), CTX, { sourceAccountId: 'main', savedChoices: saved });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.built.payload.categoryMap.map((e: Any) => e.target), [{ kind: 'system', categoryName: 'ENTERTAINMENT' }]);
  const fallback = CQ.planCardDefaultApply(cardPreview(), CTX, { sourceAccountId: 'main' });
  assert.deepEqual(fallback.built.payload.categoryMap.map((e: Any) => e.target), [{ kind: 'system', categoryName: 'EDUCATION' }], 'the suggestion otherwise');
});

check('lacksClosingDay: absent, null or out of range is a card without closing day; 1..31 has one; no card, no notice', () => {
  assert.equal(CQ.lacksClosingDay({}), true);
  assert.equal(CQ.lacksClosingDay({ closingDay: null }), true);
  assert.equal(CQ.lacksClosingDay({ closingDay: 0 }), true);
  assert.equal(CQ.lacksClosingDay({ closingDay: 7 }), false);
  assert.equal(CQ.lacksClosingDay({ closingDay: 31 }), false);
  assert.equal(CQ.lacksClosingDay(undefined), false, 'accounts not loaded yet: no notice');
  assert.match(CQ.NO_CLOSING_DAY_NOTICE, /mês do calendário/);
  assert.match(CQ.NO_CLOSING_DAY_NOTICE, /edite a conta do cartão/);
});

check('visibleCardWarnings: the server warning about the closing day is hidden only while the notice is shown', () => {
  const server = 'O cartão "Nubank" não tem dia de fechamento configurado: no Recta as faturas seguem o mês calendário, e a data real de uma compra pode levá-la para outra fatura.';
  const other = 'O saldo da fatura no OFX (R$ 100,00) difere do total das linhas (R$ 195,90).';
  assert.equal(CQ.isClosingDayServerWarning(server), true);
  assert.equal(CQ.isClosingDayServerWarning(other), false);
  assert.deepEqual(CQ.visibleCardWarnings([server, other], true), [other]);
  assert.deepEqual(CQ.visibleCardWarnings([server, other], false), [server, other]);
  assert.deepEqual(CQ.visibleCardWarnings([], true), []);
});

check('sumCardOfxResults / cardQueueTotalsLine: counts add up; zero parts are left out', () => {
  const r = (o: Record<string, Any>) => ({ enriched: 0, consumedFutures: 0, created: 0, futureInstallments: 0, reversalsImported: 0, payment: null, skipped: 0,
    createdCategories: [], warnings: [], ...o });
  const totals = CQ.sumCardOfxResults([
    r({ enriched: 2, created: 1, payment: { action: 'created', transactionId: 'p', amount: 1, date: 'd' }, warnings: ['w'] }),
    r({ enriched: 3, consumedFutures: 1, createdCategories: [{ id: 'c', name: 'n', type: 'EXPENSE' }] }),
  ]);
  assert.equal(totals.enriched, 5);
  assert.equal(totals.payments, 1);
  assert.equal(totals.createdCategories, 1);
  assert.equal(totals.warnings, 1);
  assert.equal(CQ.cardQueueTotalsLine(totals), '5 lançamentos enriquecidos, 1 parcela futura consumida, 1 transação criada, 1 pagamento registrado ou ajustado, 1 categoria criada, 1 aviso');
  assert.equal(CQ.cardQueueTotalsLine(CQ.sumCardOfxResults([])), 'nada foi alterado');
});

// ---- Statement queue ----------------------------------------------------------------------------------------

console.log('\n[U7] statement queue');

const row = (i: number, duplicate: boolean) => ({ index: i, date: '2026-09-0' + i, description: `Linha ${i}`, amount: i * 10, type: 'EXPENSE', duplicate });

check('statementConfirmRows: every row of the file, duplicates included, with the four fields the server takes', () => {
  const rows = SQ.statementConfirmRows({ rows: [row(1, false), row(2, true), row(3, false)] });
  assert.deepEqual(rows, [
    { date: '2026-09-01', description: 'Linha 1', amount: 10, type: 'EXPENSE' },
    { date: '2026-09-02', description: 'Linha 2', amount: 20, type: 'EXPENSE' },
    { date: '2026-09-03', description: 'Linha 3', amount: 30, type: 'EXPENSE' },
  ]);
  assert.equal(SQ.statementNewCount({ rows: [row(1, false), row(2, true), row(3, false)] }), 2);
  assert.equal(SQ.statementNewCount({ rows: [] }), 0);
});

check('planStatementDefaultApply: the whole file goes when something is new; an empty file or one with nothing new cannot proceed', () => {
  assert.deepEqual(SQ.planStatementDefaultApply({ rows: [row(1, false), row(2, true)] }), {
    ok: true,
    newCount: 1,
    rows: [
      { date: '2026-09-01', description: 'Linha 1', amount: 10, type: 'EXPENSE' },
      { date: '2026-09-02', description: 'Linha 2', amount: 20, type: 'EXPENSE' },
    ],
  });
  assert.deepEqual(SQ.planStatementDefaultApply({ rows: [] }), { ok: false, code: 'empty', reason: SQ.STATEMENT_EMPTY_FILE }, 'no row at all is an error, not "up to date"');
  assert.deepEqual(SQ.planStatementDefaultApply({ rows: [row(1, true)] }), { ok: false, code: 'nothing-new', reason: SQ.STATEMENT_NOTHING_NEW });
  assert.equal(SQ.statementImportNote(1), '1 transação importada');
  assert.equal(SQ.statementImportNote(3), '3 transações importadas');
});

// ---- Onboarding schema --------------------------------------------------------------------------------------

console.log('\n[U8] onboarding: the account schema has the closing day');

const TR: Any = new Proxy({}, { get: (_t, key) => `<${String(key)}>` });
TR.dueDayMin = 'dia mínimo 1';
TR.dueDayMax = 'dia máximo 31';
const { onboardingAccountSchema } = SCH.createSchemas(TR);
const parse = (o: Record<string, Any>) => onboardingAccountSchema.safeParse({ accountName: 'Cartão Exemplo', accountType: 'CREDIT', balance: 0, creditLimit: 1000, dueDay: 9, ...o });

check('closingDay is optional: absent, undefined, null, NaN (empty number input) and "" mean "not informed"', () => {
  for (const value of [undefined, null, Number.NaN, '']) {
    const r = parse({ closingDay: value });
    assert.equal(r.success, true, `closingDay=${String(value)} must be valid`);
    assert.equal(r.data.closingDay, undefined);
  }
  assert.equal(parse({}).success, true);
});

check('closingDay accepts the integers 1..31 and keeps them', () => {
  for (const day of [1, 7, 15, 31]) {
    const r = parse({ closingDay: day });
    assert.equal(r.success, true);
    assert.equal(r.data.closingDay, day);
  }
});

check('closingDay outside 1..31 or not an integer is refused, with the dueDay messages, on the closingDay field', () => {
  for (const [day, message] of [[0, TR.dueDayMin], [-3, TR.dueDayMin], [32, TR.dueDayMax], [100, TR.dueDayMax]] as const) {
    const r = parse({ closingDay: day });
    assert.equal(r.success, false, `closingDay=${day} must be refused`);
    const issue = r.error.issues.find((i: Any) => i.path[0] === 'closingDay');
    assert.ok(issue, 'the issue is on closingDay');
    assert.equal(issue.message, message);
  }
  assert.equal(parse({ closingDay: 7.5 }).success, false, 'not an integer');
  assert.equal(parse({ closingDay: '7' }).success, false, 'a string is not a number');
});

check('creditLimit and dueDay are optional too: an empty field (NaN, null, "") means "not informed"', () => {
  for (const value of [undefined, null, Number.NaN, '']) {
    const r = parse({ creditLimit: value, dueDay: value });
    assert.equal(r.success, true, `empty=${String(value)} must be valid`);
    assert.equal(r.data.creditLimit, undefined);
    assert.equal(r.data.dueDay, undefined);
  }
  assert.equal(parse({ creditLimit: 2500.5 }).data.creditLimit, 2500.5);
});

check('creditLimit and dueDay still refuse real mistakes: a limit of zero or less, a day outside 1..31', () => {
  assert.equal(parse({ creditLimit: 0 }).success, false);
  assert.equal(parse({ creditLimit: -10 }).success, false);
  for (const day of [0, 32, 7.5]) assert.equal(parse({ dueDay: day }).success, false, `dueDay=${day}`);
  assert.equal(parse({ dueDay: 1 }).success, true);
  assert.equal(parse({ dueDay: 31 }).success, true);
});

check('the card fields only count for a credit card: leftovers in them do not block another type', () => {
  const r = parse({ accountType: 'CHECKING', creditLimit: -5, dueDay: 99, closingDay: 77 });
  assert.equal(r.success, true);
  assert.deepEqual([r.data.creditLimit, r.data.dueDay, r.data.closingDay], [undefined, undefined, undefined]);
  assert.equal(parse({ accountType: 'CREDIT', closingDay: 77 }).success, false, 'but they are validated for a card');
});

check('the other fields keep working: dueDay still validated, a non-card account with no closing day is valid', () => {
  assert.equal(parse({ dueDay: 40 }).success, false);
  assert.equal(parse({ accountType: 'CHECKING', creditLimit: undefined, dueDay: undefined }).success, true);
});
