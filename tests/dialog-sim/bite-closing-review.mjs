// usage: node bite-closing-review.mjs [mutantNameFilter]
// Bite-checks of gaps A/B/C of the card OFX import (merges, reason chips, closing, review queue): every mutant breaks ONE
// guard in a scratch copy made by mutate.mjs (mut-closing/<name>/src) and the named test must then FAIL, in the pure suite
// (../t13_closing_review.mts with CARD_OFX_MODULE / CARD_CLOSING_MODULE / CARD_REVIEW_MODULE / CARD_QUEUE_MODULE pointing
// at the mutated file) or in the dialog simulation (build + the filtered scenarios).
// `survives: true` marks a guard the simulation cannot observe (documented, not a failure of this script).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const MUT = 'mut-closing';
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const CARD = 'utils/cardOfx.ts';
const QUEUE = 'utils/cardOfxQueue.ts';
const CLOSING = 'utils/cardOfxClosing.ts';
const REVIEW = 'utils/cardOfxReview.ts';
const RDLG = 'components/CardOfxReviewDialog.tsx';
const IDLG = 'components/ImportCardOfxDialog.tsx';
const RHOOK = 'hooks/api/useCardOfxReview.ts';
const CONFLICT = 'utils/transactionConflict.ts';
const ENV = { [CARD]: 'CARD_OFX_MODULE', [QUEUE]: 'CARD_QUEUE_MODULE', [CLOSING]: 'CARD_CLOSING_MODULE', [REVIEW]: 'CARD_REVIEW_MODULE', [CONFLICT]: 'CARD_CONFLICT_MODULE' };

const T17 = 't17_advance_payment.mts';
const MUTANTS = [
  // ---- utils/cardOfx.ts: merges and reasons (GA) ------------------------------------------------------------
  { name: 'a-merge-not-matched', suite: 'pure', rel: CARD, old: "  'enrich-merge': 'matched',\n", neu: '', expect: 'GA1' },
  { name: 'a-merge-count-forgets-target', suite: 'pure', rel: CARD, old: 'return 1 + (proposal.absorbed?.length ?? 0);', neu: 'return proposal.absorbed?.length ?? 0;', expect: 'GA2' },
  { name: 'a-estimate-merge-ticked-keeps-sheet', suite: 'pure', rel: CARD, old: '      if (isGroupSelected(selection, group)) {\n        prumoCents += group.netCents;', neu: '      if (isGroupSelected(selection, group)) {\n        prumoCents += signedCents(target.amount, target.type);', expect: 'GA4' },
  { name: 'a-estimate-merge-unticked-forgets-absorbed', suite: 'pure', rel: CARD, old: ' + sumSignedCents(group.proposal.absorbed ?? []);', neu: ';', expect: 'GA4' },
  { name: 'a-reason-residue-without-amount', suite: 'pure', rel: CARD, old: 'text: `parecida com a planilha: ${formatAmount(c.amount, c.type)}`,', neu: "text: 'parecida com a planilha',", expect: 'GA5' },
  { name: 'a-reason-unknown-hidden', skip: true /* stale since the unknown-reason chip stopped showing the slug; n-reason-slug-leaks covers it */, suite: 'pure', rel: CARD, old: "      return { reason, tone: 'gray', text: reason, title:", neu: '      return null; // ', expect: 'GA5' },
  { name: 'a-result-lines-forget-absorbed', suite: 'pure', rel: CARD, old: '  if ((result.absorbedRows ?? 0) > 0) {\n    lines.push', neu: '  if (false) {\n    lines.push', expect: 'GA6' },
  { name: 'a-summary-forgets-absorbed', suite: 'pure', rel: CARD, old: '  if ((result.absorbedRows ?? 0) > 0) parts.push(', neu: '  if (false) parts.push(', expect: 'GA6' },
  { name: 'a-queue-totals-forget-absorbed', suite: 'pure', rel: QUEUE, old: '    totals.absorbedRows += r.absorbedRows ?? 0;\n', neu: '', expect: 'GA6' },
  // ---- utils/cardOfxClosing.ts (GC) -------------------------------------------------------------------------
  { name: 'c-default-not-detected', suite: 'pure', rel: CLOSING, old: "  if (changed.length === 0) return serverClosingView(closing, 'default', 0);\n", neu: '', expect: 'GC2' },
  { name: 'c-untick-create-not-uncreated', suite: 'pure', rel: CLOSING, old: "    if (!selected) return { ...NO_EFFECT, uncreated: group.netCents };\n    const recorded", neu: "    if (!selected) return NO_EFFECT;\n    const recorded", expect: 'GC3' },
  { name: 'c-create-ignores-period', suite: 'pure', rel: CLOSING, old: '(inPeriod(line.date) ? signedCents(line.amount, line.type) : 0)', neu: '(signedCents(line.amount, line.type))', expect: 'GC9' },
  { name: 'c-merge-keeps-target-amount', suite: 'pure', rel: CLOSING, old: "proposal.kind === 'enrich-merge' || proposal.kind === 'consume-future' ? group.netCents", neu: "proposal.kind === 'consume-future' ? group.netCents", expect: 'GC8' },
  { name: 'c-absorbed-not-standing', suite: 'pure', rel: CLOSING, old: '  const standing = [target, ...(proposal.absorbed ?? [])]', neu: '  const standing = [target]', expect: 'GC8' },
  { name: 'c-advance-forgotten', suite: 'pure', rel: CLOSING, old: ' && group.lines.every((line) => line.kind === \'payment\') ? counted : 0;', neu: ' && group.lines.every((line) => line.kind === \'payment\') ? 0 : 0;', expect: 'GC8' },
  { name: 'c-uncoverable-guessed', suite: 'pure', rel: CLOSING, old: "  if (!changed.every(recomputable)) return serverClosingView(closing, 'server-default', changed.length);\n", neu: '', expect: 'GC10' },
  { name: 'c-end-always-inclusive', suite: 'pure', rel: CLOSING, old: '(closing.endInclusive ? date <= end : date < end)', neu: '(date <= end)', expect: 'GC9' },
  { name: 'c-explained-live-strict', suite: 'pure', rel: CLOSING, old: '    explained: Math.abs(components.residual) <= CLOSING_TOLERANCE_CENTS,', neu: '    explained: Math.abs(components.residual) < CLOSING_TOLERANCE_CENTS,', expect: 'GC14' },
  { name: 'c-explained-server-loose', suite: 'pure', rel: CLOSING, old: '    explained: Math.abs(residual) <= CLOSING_TOLERANCE_CENTS,', neu: '    explained: Math.abs(residual) <= CLOSING_TOLERANCE_CENTS + 1,', expect: 'GC14' },
  { name: 'c-residual-row-hidden-at-zero', suite: 'pure', rel: CLOSING, old: "    .filter((key) => key === 'residual' || view.components[key] !== 0)", neu: '    .filter((key) => view.components[key] !== 0)', expect: 'GC12' },
  { name: 'c-rows-sign-sheet-only', suite: 'pure', rel: CLOSING, old: "    hint: 'Linhas da planilha do mês sem linha no OFX, datadas dentro do período: sobram no cartão.',\n    sign: -1,", neu: "    hint: 'Linhas da planilha do mês sem linha no OFX, datadas dentro do período: sobram no cartão.',\n    sign: 1,", expect: 'GC12' },
  // ---- utils/cardOfxReview.ts (GR) --------------------------------------------------------------------------
  { name: 'r-blocked-accepts-delete', suite: 'pure', rel: REVIEW, old: "  item.blocked ? ['none', 'keep'] : ['none', 'keep', 'move', 'delete'];", neu: "  ['none', 'keep', 'move', 'delete'];", expect: 'GR1' },
  { name: 'r-bulk-blocked-uncounted', suite: 'pure', rel: REVIEW, old: '    if (!isActionAllowed(item, action)) {\n      blockedSkipped += 1;\n      continue;\n    }', neu: '    if (!isActionAllowed(item, action)) continue;', expect: 'GR2' },
  { name: 'r-move-to-card', suite: 'pure', rel: REVIEW, old: '  return accounts.filter((a) => a.type !== AccountType.CREDIT && a.isActive !== false);', neu: '  return accounts.filter((a) => a.isActive !== false);', expect: 'GR3' },
  { name: 'r-move-to-inactive', suite: 'pure', rel: REVIEW, old: '  if (account.isActive === false) return MOVE_TARGET_PROBLEM.inactive;', neu: '', expect: 'GR3' },
  { name: 'r-keep-carries-target', suite: 'pure', rel: REVIEW, old: "      actions.push({ transactionId: item.transactionId, action: 'keep' });", neu: "      actions.push({ transactionId: item.transactionId, action: 'keep', targetAccountId: choice.targetAccountId });", expect: 'GR4' },
  { name: 'r-delete-cents-unsigned', suite: 'pure', rel: REVIEW, old: '      counts.deleteCents += signedCents(item.amount, item.type);', neu: '      counts.deleteCents += Math.round(item.amount * 100);', expect: 'GR4' },
  { name: 'r-move-problem-sent', suite: 'pure', rel: REVIEW, old: '        problems.push({ transactionId: item.transactionId, message: problem });\n        continue;', neu: '        problems.push({ transactionId: item.transactionId, message: problem });', expect: 'GR5' },
  { name: 'r-refresh-after-nothing', suite: 'pure', rel: REVIEW,
    old: "  if (state.needsRefresh) return { code: 'needs-refresh', message: REVIEW_REFRESH_NOTICE };\n  if (!built || (built.counts.total === 0 && built.problems.length === 0)) {\n    return { code: 'nothing', message: 'Escolha uma ação para ao menos um lançamento.' };\n  }",
    neu: "  if (!built || (built.counts.total === 0 && built.problems.length === 0)) {\n    return { code: 'nothing', message: 'Escolha uma ação para ao menos um lançamento.' };\n  }\n  if (state.needsRefresh) return { code: 'needs-refresh', message: REVIEW_REFRESH_NOTICE };", expect: 'GR6' },
  { name: 'r-max-actions-500', suite: 'pure', rel: REVIEW, old: 'export const REVIEW_MAX_ACTIONS = 200;', neu: 'export const REVIEW_MAX_ACTIONS = 500;', expect: 'GR6' },
  { name: 'r-missing-not-reported', suite: 'pure', rel: REVIEW, old: '  summary.missing = sent.filter((a) => !seen.has(`${a.transactionId}|${a.action}`)).map((a) => a.transactionId);', neu: '  summary.missing = [];', expect: 'GR7' },
  { name: 'r-totals-trusted', suite: 'pure', rel: REVIEW, old: '  summary.inconsistent =\n', neu: '  summary.inconsistent = false &&\n', expect: 'GR7' },
  { name: 'r-repeated-result-counted', suite: 'pure', rel: REVIEW, old: '    if (!sentKey.has(key) || seen.has(key) || !KNOWN_STATUS.has(r.status)) {', neu: '    if (!sentKey.has(key) || !KNOWN_STATUS.has(r.status)) {', expect: 'GR7' },
  { name: 'r-unknown-status-counted', suite: 'pure', rel: REVIEW, old: '    if (!sentKey.has(key) || seen.has(key) || !KNOWN_STATUS.has(r.status)) {', neu: '    if (!sentKey.has(key) || seen.has(key)) {', expect: 'GR7' },
  { name: 'r-failed-decision-dropped', suite: 'pure', rel: REVIEW, old: "  for (const r of summary.results) if (r.status === 'failed') keep.add(r.transactionId);", neu: '', expect: 'GR8' },
  { name: 'r-blocked-outcome-forgotten', suite: 'pure', rel: REVIEW, old: "  for (const r of summary.results) if (r.status === 'failed' || r.status === 'blocked') out[r.transactionId] = r;", neu: "  for (const r of summary.results) if (r.status === 'failed') out[r.transactionId] = r;", expect: 'GR8' },
  { name: 'r-reconcile-keeps-blocked-delete', suite: 'pure', rel: REVIEW, old: '    if (item && isActionAllowed(item, choice.action)) next[id] = choice;', neu: '    if (item) next[id] = choice;', expect: 'GR8' },
  { name: 'r-sections-newest-first', suite: 'pure', rel: REVIEW, old: '  const keys = [...new Set([...byMonth.keys(), ...totals.keys()])].sort();', neu: '  const keys = [...new Set([...byMonth.keys(), ...totals.keys()])].sort().reverse();', expect: 'GR10' },
  { name: 'r-4xx-partial', suite: 'pure', rel: REVIEW, old: 'status !== undefined && status >= 400 && status < 500;', neu: 'false;', expect: 'GR12' },
  { name: 'r-blocked-reason-lost', suite: 'pure', rel: REVIEW, old: "outcome.reason ?? (outcome.status === 'blocked' ? 'blocked' : undefined)", neu: 'outcome.reason', expect: 'GR12' },
  // ---- components/CardOfxReviewDialog.tsx (RQ) --------------------------------------------------------------
  { name: 'd-apply-without-confirmation', suite: 'dialog', filter: '^RQ3', rel: RDLG, old: 'onClick={() => setConfirming(true)} disabled={busy || blocker !== null}', neu: 'onClick={() => { setConfirming(true); void send(built.payload, draftRef.current); }} disabled={busy || blocker !== null}', expect: 'RQ3' },
  { name: 'd-closes-while-applying', suite: 'dialog', filter: '^RQ11', rel: RDLG, old: 'canClose={!applying}', neu: 'canClose', expect: 'RQ11' },
  { name: 'd-close-button-while-applying', suite: 'dialog', filter: '^RQ11', rel: RDLG, old: '<button type="button" onClick={onClose} disabled={applying} className={BTN_SECONDARY}>Fechar</button>', neu: '<button type="button" onClick={onClose} className={BTN_SECONDARY}>Fechar</button>', expect: 'RQ11' },
  { name: 'd-late-read-wins', suite: 'dialog', filter: '^RQ13', rel: RDLG, old: '    const isCurrent = () => mountedRef.current && run === seqRef.current;\n    setLoading(true);', neu: '    const isCurrent = () => mountedRef.current;\n    setLoading(true);', expect: 'RQ13' },
  { name: 'd-failure-keeps-list-trusted', suite: 'dialog', filter: '^RQ9', rel: RDLG, old: '        if (!isRefusedBeforeWriting(status)) setNeedsRefresh(true);', neu: '', expect: 'RQ9' },
  { name: 'd-refusal-needs-refresh', suite: 'dialog', filter: '^RQ15', rel: RDLG, old: '        if (!isRefusedBeforeWriting(status)) setNeedsRefresh(true);', neu: '        setNeedsRefresh(true);', expect: 'RQ15' },
  { name: 'd-no-reload-after-answer', suite: 'dialog', filter: '^RQ3', rel: RDLG, old: '    await load(view, monthFilter);\n  };\n\n  const handleConfirm', neu: '  };\n\n  const handleConfirm', expect: 'RQ3' },
  { name: 'd-load-error-keeps-list-trusted', suite: 'dialog', filter: '^RQ10', rel: RDLG, old: '      // A list that could not be read after an apply no longer shows what is there.\n      setNeedsRefresh(true);\n', neu: '', expect: 'RQ10' },
  { name: 'd-missing-rows-not-said', suite: 'dialog', filter: '^RQ7', rel: RDLG, old: '            {summary.missing.length > 0 && (', neu: '            {false && (', expect: 'RQ7' },
  { name: 'd-outcome-chip-dropped', suite: 'dialog', filter: '^RQ6', rel: RDLG, old: '    const outcome = outcomes[id];\n    if (!outcome) return null;', neu: '    return null;\n    const outcome = outcomes[id];\n    if (!outcome) return null;', expect: 'RQ6' },
  { name: 'd-all-accounts-as-targets', suite: 'dialog', filter: '^RQ3', rel: RDLG, old: 'const targets = useMemo(() => moveTargetAccounts(accounts), [accounts]);', neu: 'const targets = accounts;', expect: 'RQ3' },
  { name: 'd-failed-decision-not-kept', suite: 'dialog', filter: '^RQ6', rel: RDLG, old: '    setDraft(draftAfterResults(keepDraft, result));', neu: '    setDraft(EMPTY_REVIEW_DRAFT);', expect: 'RQ6' },
  { name: 'd-kept-view-has-decisions', suite: 'dialog', filter: '^RQ12', rel: RDLG, old: '{queue && !kept && items.length > 0 && (\n          <div className="rounded-md border', neu: '{queue && items.length > 0 && (\n          <div className="rounded-md border', expect: 'RQ12' },
  { name: 'd-unkeep-needs-no-view', suite: 'dialog', filter: '^RQ12', rel: RDLG, old: "  const handleUnkeep = (item: CardOfxReviewItem) => {\n    if (applyingRef.current || loading) return;\n    void send(unkeepRequest(accountId, item.transactionId), EMPTY_REVIEW_DRAFT);", neu: "  const handleUnkeep = (item: CardOfxReviewItem) => {\n    if (applyingRef.current || loading) return;\n    void send({ accountId, actions: [{ transactionId: item.transactionId, action: 'keep' }] }, EMPTY_REVIEW_DRAFT);", expect: 'RQ12' },
  { name: 'd-month-filter-ignored', suite: 'dialog', filter: '^RQ14', rel: RDLG, old: "        accountId, view: nextView, limit: REVIEW_LIMIT, ...(nextMonth ? { monthKey: nextMonth } : {}),", neu: '        accountId, view: nextView, limit: REVIEW_LIMIT,', expect: 'RQ14' },
  { name: 'd-limit-dropped', suite: 'dialog', filter: '^RQ1', rel: RHOOK, old: '      if (params.limit) query.limit = params.limit;\n', neu: '', expect: 'RQ1' },
  { name: 'd-bulk-blocked-silent', suite: 'dialog', filter: '^RQ4', rel: RDLG, old: '      result.blockedSkipped > 0\n', neu: '      false\n', expect: 'RQ4' },
  // ---- round 4 ------------------------------------------------------------------------------------------
  { name: 'n-near-not-matched', suite: 'pure', rel: CARD, old: "  'enrich-near': 'matched',\n", neu: '', expect: 'R4-1' },
  { name: 'n-neighbour-not-matched', suite: 'pure', rel: CARD, old: "  'enrich-neighbour': 'matched',\n", neu: '', expect: 'R4-1' },
  { name: 'n-group-not-matched', suite: 'pure', rel: CARD, old: "  'enrich-group': 'matched',\n", neu: '', expect: 'R4-1' },
  { name: 'n-near-diff-sign', suite: 'pure', rel: CARD, old: 'diffCents: lineNetCents - oldCents };', neu: 'diffCents: oldCents - lineNetCents };', expect: 'R4-2' },
  { name: 'n-near-singular', suite: 'pure', rel: CARD, old: "abs === 1 ? 'centavo' : 'centavos'", neu: "'centavos'", expect: 'R4-2' },
  { name: 'n-reason-slug-leaks', suite: 'pure', rel: CARD, old: "text: 'desmarcada pelo servidor', title:", neu: "text: reason, title:", expect: 'GA5' },
  { name: 'n-neighbour-weak-silent', suite: 'pure', rel: CARD, old: "reason, tone: 'yellow', text: 'mês vizinho, pouca semelhança',", neu: "reason, tone: 'yellow', text: reason,", expect: 'R4-3' },
  { name: 'n-pool-text-slug', suite: 'pure', rel: CARD, old: "text: 'muitas compras do comerciante',", neu: "text: 'pool-too-large',", expect: 'R4-3' },
  { name: 'n-near-estimate-keeps-sheet', suite: 'pure', rel: CARD, old: "(group.proposal.kind === 'enrich-merge' || group.proposal.kind === 'enrich-near') && group.proposal.target", neu: "group.proposal.kind === 'enrich-merge' && group.proposal.target", expect: 'R4-7' },
  { name: 'c-near-keeps-sheet-amount', suite: 'pure', rel: CLOSING, old: " || proposal.kind === 'enrich-near' ? group.netCents", neu: ' ? group.netCents', expect: 'R4-4' },
  { name: 'c-residual-cents-called-explained', suite: 'pure', rel: CLOSING, old: 'if (left === 0 && view.explained) return', neu: 'if (view.explained) return', expect: 'GC12' },
  { name: 'c-residual-server-flag-ignored', suite: 'pure', rel: CLOSING, old: '  if (view.explained) {\n    return {\n      tone: \'yellow\',', neu: '  if (left <= 5) {\n    return {\n      tone: \'yellow\',', expect: 'GC12' },
  { name: 'r-category-custom-raw', suite: 'pure', rel: REVIEW, old: "return customNames[value.slice('CUSTOM:'.length)] || 'Categoria';", neu: "return customNames[value.slice('CUSTOM:'.length)] || value;", expect: 'R4-5' },
  { name: 'r-category-slug-raw', suite: 'pure', rel: REVIEW, old: "return /^[A-Z0-9_]+$/.test(value) ? 'Categoria' : value;", neu: 'return value;', expect: 'R4-5' },
  { name: 'r-blocked-code-raw', suite: 'pure', rel: REVIEW, old: "return REASON_TEXT[reason] ?? 'Erro inesperado ao aplicar';", neu: 'return REASON_TEXT[reason] ?? reason;', expect: 'GR12' },
  { name: 'r-blocked-code-unmapped', suite: 'pure', rel: REVIEW, old: "  'has-shares-split-settlement-recurrence-or-attachment': BLOCKED_TEXT,\n", neu: '', expect: 'GR12' },
  { name: 't-conflict-ignored', suite: 'pure', rel: CONFLICT, old: '(err as { status?: number } | null)?.status === 409', neu: 'false', expect: 'R4-6' },
  { name: 't-conflict-wrong-text', suite: 'pure', rel: CONFLICT, old: "  if (isConflict(err)) return CONFLICT_MESSAGE;\n", neu: '', expect: 'R4-6' },
  { name: 'd-category-chip-raw', suite: 'dialog', filter: '^RQ19', rel: RDLG, old: '{categoryChipLabel(item.categoryName, customNames) && <Chip tone="gray">{categoryChipLabel(item.categoryName, customNames)}</Chip>}', neu: '{item.categoryName && <Chip tone="gray">{item.categoryName}</Chip>}', expect: 'RQ19' },
  { name: 'd-no-scroll-into-view', suite: 'dialog', filter: '^RQ20', rel: RDLG, old: "if (confirming && el && typeof el.scrollIntoView === 'function')", neu: 'if (false && el)', expect: 'RQ20' },
  { name: 'd-tables-auto-width', suite: 'dialog', filter: '^RQ20', rel: RDLG, old: 'w-full min-w-[760px] table-fixed text-sm', neu: 'w-full text-sm', expect: 'RQ20' },
  { name: 'i-novas-without-heading', suite: 'dialog', filter: '^CL11', rel: IDLG, old: "  new: ['Compra do OFX (será criada)'],", neu: "  new: [],", expect: 'CL11' },
  { name: 'i-residual-chip-explicada', suite: 'dialog', filter: '^CL10', rel: IDLG, old: '<Chip tone={residual.tone}>{residual.chip}</Chip>', neu: "<Chip tone={residual.tone}>{view.explained ? 'explicada' : 'não explicada'}</Chip>", expect: 'CL10' },
  { name: 'i-near-change-hidden', suite: 'dialog', filter: '^CL9', rel: IDLG, old: '{near && <p data-near-change', neu: '{false && near && <p data-near-change', expect: 'CL9' },
  { name: 'i-neighbour-month-hidden', suite: 'dialog', filter: '^CL9', rel: IDLG, old: '{month && <p className', neu: '{false && month && <p className', expect: 'CL9' },
  { name: 'i-unknown-kind-slug', suite: 'dialog', filter: '^CL3', rel: IDLG, old: "<td className={`${TD_CLS} ${MUTED_CLS}`}>Tipo de proposta desconhecido</td>", neu: "<td className={`${TD_CLS} ${MUTED_CLS}`}>{proposal.kind}</td>", expect: 'CL3' },
  // ---- advance payments (t17 and CL12-CL14) -----------------------------------------------------------------
  { name: 'ap-kind-unknown', suite: 'pure', test: T17, rel: CARD, old: "  'advance-payment': 'advance',\n", neu: '', expect: 'AP1' },
  { name: 'ap-paired-lists-advance-group', suite: 'pure', test: T17, rel: CARD, old: "if (line.kind === 'payment' && !advanceRefs.has(line.ref)) sections", neu: "if (line.kind === 'payment') sections", expect: 'AP2' },
  { name: 'ap-section-not-sent-guard', suite: 'pure', test: T17, rel: CARD, old: "sendable: section !== 'other' && !!proposal.group", neu: "sendable: !!proposal.group", expect: 'AP3' },
  { name: 'ap-totals-advance-lost', suite: 'pure', test: T17, rel: CARD, old: "group.section === 'advance' ? advance : reversal;", neu: 'reversal;', expect: 'AP4' },
  { name: 'ap-headline-missing', suite: 'pure', test: T17, rel: CARD, old: "    case 'advance-payment':\n      return ADVANCE_PAYMENT_HEADLINE;\n", neu: '', expect: 'AP6' },
  { name: 'ap-effect-without-date', suite: 'pure', test: T17, rel: CARD, old: ' no cartão, na data do banco (${formatDate(line.date)})`', neu: ' no cartão`', expect: 'AP6' },
  { name: 'ap-chip-near-slug', suite: 'pure', test: T17, rel: CARD, old: "reason, tone: 'orange', text: 'parece o crédito que já está na planilha',\n        title: `Pode", neu: "reason, tone: 'orange', text: reason,\n        title: `Pode", expect: 'AP7' },
  { name: 'ap-chip-changed-generic', suite: 'pure', test: T17, rel: CARD, old: "text: 'a compra mudou neste arquivo: confira antes de importar',\n        title: `Esta compra", neu: "text: 'desmarcada pelo servidor',\n        title: `Esta compra", expect: 'AP7' },
  { name: 'ap-chip-changed-no-counterpart', suite: 'pure', test: T17, rel: CARD, old: "const what = c ? ` como ${c.description} · ${formatDate(c.date)} · ${formatAmount(c.amount, c.type)}` : '';", neu: "const what = '';", expect: 'AP7' },
  { name: 'ap-counterpart-note-any-reason', suite: 'pure', test: T17, rel: CARD, old: "  if (proposal.reason === 'changed-in-statement') return", neu: "  if (proposal.reason) return", expect: 'AP8' },
  { name: 'ap-result-forgets-advance', suite: 'pure', test: T17, rel: CARD, old: "  if ((result.advancePayments ?? 0) > 0) {\n    lines.push", neu: "  if (false) {\n    lines.push", expect: 'AP9' },
  { name: 'ap-summary-forgets-advance', suite: 'pure', test: T17, rel: CARD, old: "  if ((result.advancePayments ?? 0) > 0) parts.push(", neu: "  if (false) parts.push(", expect: 'AP9' },
  { name: 'ap-queue-totals-forget-advance', suite: 'pure', test: T17, rel: QUEUE, old: '    totals.advancePayments += r.advancePayments ?? 0;\n', neu: '', expect: 'AP9' },
  { name: 'ap-queue-line-forgets-advance', suite: 'pure', test: T17, rel: QUEUE, old: "  if (totals.advancePayments > 0) parts.push(", neu: "  if (false) parts.push(", expect: 'AP9' },
  { name: 'ap-closing-advance-not-recomputable', suite: 'pure', test: T17, rel: CLOSING, old: " || group.section === 'advance') return true;", neu: ') return true;', expect: 'AP11' },
  { name: 'ap-closing-advance-ignores-period', suite: 'pure', test: T17, rel: CLOSING, old: 'const cents = line && inPeriod(line.date) ? signedCents(line.amount, line.type) : 0;', neu: 'const cents = line ? signedCents(line.amount, line.type) : 0;', expect: 'AP12' },
  { name: 'ap-closing-advance-not-advance', suite: 'pure', test: T17, rel: CLOSING, old: 'return { ...NO_EFFECT, recorded: cents, advance: cents };', neu: 'return { ...NO_EFFECT, recorded: cents };', expect: 'AP11' },
  { name: 'ap-closing-unticked-advance-uncreated', suite: 'pure', test: T17, rel: CLOSING, old: "    if (!selected) return NO_EFFECT;\n    const line = group.lines.find", neu: "    if (!selected) return { ...NO_EFFECT, uncreated: group.netCents };\n    const line = group.lines.find", expect: 'AP13' },
  { name: 'ap-closing-row-label-old', suite: 'pure', test: T17, rel: CLOSING, old: "label: 'Créditos de pagamentos antecipados',", neu: "label: 'Créditos da planilha de pagamentos antecipados',", expect: 'AP15' },
  { name: 'ap-dialog-section-hidden', suite: 'dialog', filter: '^CL12', rel: IDLG, old: '<GroupSection id="card-ofx-advance" title="Pagamentos antecipados a registrar" groups={sections.advance}', neu: '<GroupSection id="card-ofx-advance" title="Pagamentos antecipados a registrar" groups={[]}', expect: 'CL12' },
  { name: 'ap-dialog-effect-hidden', suite: 'dialog', filter: '^CL12', rel: IDLG, old: '<p className="font-medium text-gray-900 dark:text-white">{ADVANCE_PAYMENT_HEADLINE}</p>', neu: '', expect: 'CL12' },
  { name: 'ap-dialog-counterpart-hidden', suite: 'dialog', filter: '^CL1[24]', rel: IDLG, old: '{counterpart && <p data-counterpart', neu: '{false && counterpart && <p data-counterpart', expect: 'CL12' },
  { name: 'ap-dialog-footer-forgets-advance', suite: 'dialog', filter: '^CL13', rel: IDLG, old: '  if (totals.advance.groups > 0) parts.push(', neu: '  if (false) parts.push(', expect: 'CL13' },
  { name: 'ap-dialog-closing-ignores-advance-tick', suite: 'dialog', filter: '^CL13', rel: CLOSING, old: "    if (!selected) return NO_EFFECT;\n    const line = group.lines.find", neu: "    return NO_EFFECT;\n    const line = group.lines.find", expect: 'CL13' },
  // ---- round 2: ledgerBalance echo, payment-ambiguous, changed advance payment ------------------------------------
  { name: 'ap2-echo-dropped', suite: 'pure', test: T17, rel: CARD, old: "...(typeof preview.ledgerBalance === 'number' && Number.isFinite(preview.ledgerBalance) ? { ledgerBalance: preview.ledgerBalance } : {}),", neu: '', expect: 'AP16' },
  { name: 'ap2-echo-zero-dropped', suite: 'pure', test: T17, rel: CARD, old: "typeof preview.ledgerBalance === 'number' && Number.isFinite(preview.ledgerBalance) ?", neu: 'preview.ledgerBalance ?', expect: 'AP16' },
  { name: 'ap2-echo-null-sent', suite: 'pure', test: T17, rel: CARD, old: "...(typeof preview.ledgerBalance === 'number' && Number.isFinite(preview.ledgerBalance) ? { ledgerBalance: preview.ledgerBalance } : {}),", neu: 'ledgerBalance: preview.ledgerBalance ?? null,', expect: 'AP16' },
  { name: 'ap2-ambiguous-slug', suite: 'pure', test: T17, rel: CARD, old: "text: 'não deu para saber qual é o pagamento principal da fatura: confira antes de importar',", neu: "text: reason,", expect: 'AP18' },
  { name: 'ap2-ambiguous-unknown', suite: 'pure', test: T17, rel: CARD, old: "    case 'payment-ambiguous':\n", neu: "    case 'payment-ambiguous-x':\n", expect: 'AP18' },
  { name: 'ap2-changed-advance-as-purchase', suite: 'pure', test: T17, rel: CARD, old: "if (proposal.kind === 'advance-payment') {\n        return {\n          reason, tone: 'orange', text: 'o pagamento antecipado", neu: "if (false) {\n        return {\n          reason, tone: 'orange', text: 'o pagamento antecipado", expect: 'AP19' },
  { name: 'ap2-changed-purchase-as-advance', suite: 'pure', test: T17, rel: CARD, old: "if (proposal.kind === 'advance-payment') {\n        return {\n          reason, tone: 'orange', text: 'o pagamento antecipado", neu: "if (true) {\n        return {\n          reason, tone: 'orange', text: 'o pagamento antecipado", expect: 'AP19' },
  { name: 'ap2-dialog-chip-kind-lost', suite: 'dialog', filter: '^CL16', rel: IDLG, old: 'proposalReasonChip(proposal, (value, type)', neu: 'proposalReasonChip({ reason: proposal.reason, counterpart: proposal.counterpart }, (value, type)', expect: 'CL16' },
  { name: 'ap2-dialog-echo-dropped-queue', suite: 'dialog', filter: '^CL15', rel: QUEUE, old: "  const built = buildCardOfxConfirm(preview, selection, choices, { apply, sourceAccountId }, context);", neu: "  const { ledgerBalance: _dropped, ...rest } = preview;\n  const built = buildCardOfxConfirm(rest as typeof preview, selection, choices, { apply, sourceAccountId }, context);", expect: 'CL15' },
  // ---- round 3: paymentLineRef echo and "Reabra a prévia" -----------------------------------------------------------
  { name: 'ap3-ref-dropped', suite: 'pure', test: T17, rel: CARD, old: "    ...(typeof preview.payment?.ref === 'string' && preview.payment.ref !== '' ? { paymentLineRef: preview.payment.ref } : {}),\n", neu: '', expect: 'AP21' },
  { name: 'ap3-ref-null-sent', suite: 'pure', test: T17, rel: CARD, old: "...(typeof preview.payment?.ref === 'string' && preview.payment.ref !== '' ? { paymentLineRef: preview.payment.ref } : {}),", neu: 'paymentLineRef: preview.payment?.ref ?? null,', expect: 'AP21' },
  { name: 'ap3-ref-needs-balance', suite: 'pure', test: T17, rel: CARD, old: "...(typeof preview.payment?.ref === 'string' && preview.payment.ref !== ''", neu: "...(typeof preview.payment?.ref === 'string' && preview.ledgerBalance == null", expect: 'AP21' },
  { name: 'ap3-reopen-silent', suite: 'pure', test: T17, rel: CARD, old: "  if (paymentsNotApplied(result)) lines.push(PAYMENTS_NOT_APPLIED_TEXT);", neu: '', expect: 'AP23' },
  { name: 'ap3-reopen-toast-silent', suite: 'pure', test: T17, rel: CARD, old: "  if (paymentsNotApplied(result)) parts.push('pagamentos não aplicados: reabra a prévia');", neu: '', expect: 'AP23' },
  { name: 'ap3-reopen-always', suite: 'pure', test: T17, rel: CARD, old: "some((warning) => /reabra a prévia/i.test(warning));", neu: "some(() => true);", expect: 'AP23' },
  { name: 'ap3-dialog-queue-plan-drops-ref', suite: 'dialog', filter: '^CL17', rel: QUEUE, old: "  const built = buildCardOfxConfirm(preview, selection, choices, { apply, sourceAccountId }, context);", neu: "  const { payment: _p, ...rest } = preview as typeof preview & { payment: unknown };\n  const built = buildCardOfxConfirm({ ...rest, payment: null } as typeof preview, selection, choices, { apply, sourceAccountId }, context);", expect: 'CL17' },
  { name: 'ap3-dialog-result-note-hidden', suite: 'dialog', filter: '^CL17', rel: CARD, old: "  if (paymentsNotApplied(result)) lines.push(PAYMENTS_NOT_APPLIED_TEXT);", neu: '', expect: 'CL17' },
  // ---- components/ImportCardOfxDialog.tsx (CL) --------------------------------------------------------------
  { name: 'i-esc-closes-both', suite: 'dialog', filter: '^CL7', rel: IDLG, old: ' && !reviewOpenRef.current) onClose();', neu: ') onClose();', expect: 'CL7' },
  { name: 'i-reason-chip-hidden', suite: 'dialog', filter: '^CL6', rel: IDLG, old: '          {reasonChip ? (', neu: '          {false ? (', expect: 'CL6' },
  { name: 'i-ambiguous-twice', suite: 'dialog', filter: '^CL6', rel: IDLG, old: "{reasonChip && proposal.ambiguous && reasonChip.reason !== 'ambiguous' && (", neu: '{reasonChip && proposal.ambiguous && (', expect: 'CL6' },
  { name: 'i-merge-cell-missing', suite: 'dialog', filter: '^CL5', rel: IDLG, old: "{proposal.kind === 'enrich-merge' && proposal.target\n              ?", neu: "{false && proposal.target\n              ?", expect: 'CL5' },
  { name: 'i-closing-panel-hidden', suite: 'dialog', filter: '^CL1', rel: IDLG, old: '{closing && <ClosingPanel view={closing} currency={baseCurrency} />}', neu: '', expect: 'CL1' },
  { name: 'i-header-estimate-wins', suite: 'dialog', filter: '^CL1', rel: IDLG, old: 'const diff = closing ? closing.deltaCents : totals.differenceCents;', neu: 'const diff = totals.differenceCents;', expect: 'CL1' },
  { name: 'i-closing-ignores-selection', suite: 'dialog', filter: '^CL2', rel: IDLG, old: 'buildClosingView(preview.closing, built.sections.groups, selection)', neu: 'buildClosingView(preview.closing, built.sections.groups, Object.fromEntries(preview.proposals.map((p) => [p.group, p.defaultSelected === true])))', expect: 'CL2' },
  { name: 'i-review-button-missing-result', suite: 'dialog', filter: '^CL7', rel: IDLG, old: 'onClose={requestClose} onReview={() => setReviewOpen(true)} />\n          ) : preview', neu: 'onClose={requestClose} onReview={() => undefined} />\n          ) : preview', expect: 'CL7' },
  { name: 'i-review-button-missing-queue', suite: 'dialog', filter: '^CL8', rel: IDLG, old: '<QueueSummary state={queue} results={queueResults} onClose={requestClose} onReview={() => setReviewOpen(true)} />', neu: '<QueueSummary state={queue} results={queueResults} onClose={requestClose} onReview={() => undefined} />', expect: 'CL8' },
  { name: 'i-review-under-import', suite: 'dialog', filter: '^CL7', rel: IDLG, old: 'zClass="z-[70]"', neu: 'zClass="z-[10]"', expect: 'CL7', survives: true },
];

function makeMutant({ name, rel, old, neu }) {
  const out = spawnSync(process.execPath, ['mutate.mjs', name, rel, old, neu], { cwd: here, encoding: 'utf8', env: { ...process.env, MUT_DIR: MUT } });
  if (out.status !== 0) throw new Error(`${name}: mutate.mjs failed\n${out.stdout}${out.stderr}`);
  return path.join(here, MUT, name, 'src');
}

function cleanup(name) {
  fs.rmSync(path.join(here, MUT, name), { recursive: true, force: true });
  fs.rmSync(path.join(here, 'out', `${name}.mjs`), { force: true });
  fs.rmSync(path.join(here, `entry.${name}.tsx`), { force: true });
}

function runPure(src, rel, test = 't13_closing_review.mts') {
  return spawnSync(process.execPath, [TSX_CLI, test], {
    cwd: FE_TESTS, encoding: 'utf8', env: { ...process.env, [ENV[rel]]: path.join(src, rel) },
  });
}

function runDialog(name, src, nameFilter) {
  const build = spawnSync(process.execPath, ['build.mjs', name, src], { cwd: here, encoding: 'utf8' });
  if (build.status !== 0) return build;
  return spawnSync(process.execPath, ['scenarios.mjs', name, nameFilter], { cwd: here, encoding: 'utf8' });
}

const results = [];
for (const mutant of MUTANTS) {
  if (mutant.skip) continue;
  if (filter && !filter.test(mutant.name)) continue;
  let src;
  try { src = makeMutant(mutant); } catch (e) {
    // The snippet no longer exists in the source (the mutant went stale): reported, not a bite result.
    results.push({ name: mutant.name, verdict: 'STALE', fails: 0 });
    console.log(`STALE                ${mutant.name}  (pattern not found in the current source)`);
    cleanup(mutant.name);
    continue;
  }
  const out = mutant.suite === 'pure' ? runPure(src, mutant.rel, mutant.test) : runDialog(mutant.name, src, mutant.filter);
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const failLines = text.split('\n').filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  // t13 alone does not set the exit code (only run.mts calls summary()): for the pure suite the FAIL lines decide.
  const bit = (mutant.suite === 'pure' || out.status !== 0) && failLines.some((l) => l.includes(mutant.expect));
  const verdict = bit ? (mutant.survives ? 'BIT (unexpected)' : 'bit') : mutant.survives ? 'survived (expected)' : 'SURVIVED';
  results.push({ name: mutant.name, verdict, fails: failLines.length });
  console.log(`${verdict.padEnd(20)} ${mutant.name}  (${failLines.length} failing: ${failLines.slice(0, 3).join(' | ').slice(0, 200)})`);
  if (!bit && !mutant.survives) console.log(text.split('\n').slice(-12).join('\n'));
  cleanup(mutant.name);
}
fs.rmSync(path.join(here, MUT), { recursive: true, force: true });
const bad = results.filter((r) => r.verdict === 'SURVIVED' || r.verdict === 'BIT (unexpected)' || r.verdict === 'STALE');
console.log(`\n${results.length} mutants: ${results.filter((r) => r.verdict === 'bit').length} bit, `
  + `${results.filter((r) => r.verdict === 'survived (expected)').length} survived as documented, ${bad.length} unexpected`);
process.exit(bad.length ? 1 : 0);
