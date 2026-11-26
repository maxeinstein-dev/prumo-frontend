// usage: node bite-people.mjs [mutantNameFilter]
// Bite-checks of phase 4 (people and shared expenses): every mutant breaks ONE guard in a scratch copy made by
// mutate.mjs (mut/<name>/src) and the named test must then FAIL, in the pure suites (../run.mts with PEOPLE_MODULE /
// ORGANIZE_MODULE pointing at the mutated utils) or in the dialog simulation (build + the filtered scenarios).
// `survives: true` marks a guard the simulation cannot observe (documented, not a failure of this script).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FE_TESTS = path.resolve(here, '..');
const TSX_CLI = path.resolve(here, '../../node_modules/tsx/dist/cli.mjs');
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const PEOPLE = 'utils/people.ts';
const ORG = 'utils/organizeShares.ts';
const UI = 'components/people/ui.tsx';
const SETTLE = 'components/people/SettlementDialog.tsx';
const DIVIDE = 'components/people/DivideTransactionDialog.tsx';
const WIZARD = 'components/people/OrganizeSharesDialog.tsx';
const HOOK = 'hooks/api/usePeople.ts';
const PAGE = 'pages/People.tsx';

const MUTANTS = [
  // ---- utils/people.ts (t9_people.mts) -------------------------------------------------------------------------
  { name: 'p-remainder-last', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'base + (index === 0 ? remainder : 0)', neu: 'base + (index === rows.length - 1 ? remainder : 0)', expect: 'equal: I count as one' },
  { name: 'p-equal-without-me', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'Math.floor(totalCents / (n + 1));\n    const remainder = totalCents - base * (n + 1);', neu: 'Math.floor(totalCents / n);\n    const remainder = totalCents - base * n;', expect: 'equal: I count as one' },
  { name: 'p-percent-rounds', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'const parts = rows.map((r) => floorShare(totalCents, r.hundredths ?? 0, 10000));', neu: 'const parts = rows.map((r) => Math.round(((totalCents) * (r.hundredths ?? 0)) / 10000));', expect: 'percent: of the total' },
  { name: 'p-percent-remainder-always', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'const covered = rows.reduce((sum, r) => sum + (r.hundredths ?? 0), 0) === 10000;', neu: 'const covered = true;', expect: 'percent: of the total' },
  { name: 'p-shares-without-my-shares', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'const denominator = myShares + rows', neu: 'const denominator = 0 + rows', expect: 'shares: myShares count' },
  { name: 'p-sum-over-total-allowed', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'errors.size === 0 && sumCents > totalCents) {', neu: 'errors.size === 0 && sumCents > totalCents * 2) {', expect: 'the sum above the transaction is refused' },
  { name: 'p-zero-part-allowed', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'if (cents[index] <= 0) errors.set(row.key, SHARE_MESSAGES.zeroPart);', neu: 'if (cents[index] < 0) errors.set(row.key, SHARE_MESSAGES.zeroPart);', expect: 'equal: a part that rounds to zero' },
  { name: 'p-duplicate-person-allowed', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'else if (seen.has(row.personId)) error = SHARE_MESSAGES.duplicate;', neu: 'else if (false) error = SHARE_MESSAGES.duplicate;', expect: 'row validation' },
  { name: 'p-percent-over-100-allowed', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'if (total > 10000) formError = SHARE_MESSAGES.percentOver;', neu: 'if (total > 20000) formError = SHARE_MESSAGES.percentOver;', expect: 'percentages above 100%' },
  { name: 'p-thousands-dot', suite: 'pure', mod: 'people', rel: PEOPLE, old: '} else if (/^\\d{1,3}(\\.\\d{3})+$/.test(value)) {', neu: '} else if (false) {', expect: 'parseMoneyToCents' },
  { name: 'p-cents-truncate', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'Math.round(value * 100 + (value < 0 ? -1e-6 : 1e-6))', neu: 'Math.trunc(value * 100)', expect: 'reais <-> cents never drift' },
  { name: 'p-balance-sign', suite: 'pure', mod: 'people', rel: PEOPLE, old: "if (cents > 0) return { kind: 'owes-me'", neu: "if (cents < 0) return { kind: 'owes-me'", expect: 'balanceStatus / balanceSentence' },
  { name: 'p-settlement-direction', suite: 'pure', mod: 'people', rel: PEOPLE, old: "return cents < 0 ? { direction: 'PAID', amountCents: -cents } : { direction: 'RECEIVED', amountCents: cents };", neu: "return cents > 0 ? { direction: 'PAID', amountCents: cents } : { direction: 'RECEIVED', amountCents: -cents };", expect: 'suggestSettlement' },
  { name: 'p-settlement-link-sends-create', suite: 'pure', mod: 'people', rel: PEOPLE, old: "if (draft.mode === 'create') {\n    const description", neu: "if (draft.mode !== 'none') {\n    const description", expect: 'buildSettlementInput' },
  { name: 'p-settlement-balance-after', suite: 'pure', mod: 'people', rel: PEOPLE, old: "return direction === 'RECEIVED' ? balanceCents - amountCents : balanceCents + amountCents;", neu: "return direction === 'RECEIVED' ? balanceCents + amountCents : balanceCents - amountCents;", expect: 'balanceAfterSettlement' },
  { name: 'p-inactive-with-balance-hidden', suite: 'pure', mod: 'people', rel: PEOPLE, old: '.filter((row) => row.person.isActive || showInactive || row.balanceCents !== 0)', neu: '.filter((row) => row.person.isActive || showInactive)', expect: 'mergePeopleRows' },
  { name: 'p-self-conflict', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'if (other.id === editingId) continue;', neu: '', expect: 'validatePersonForm' },
  { name: 'p-remembered-account-wipes-others', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'JSON.stringify({ ...current, [householdId]: accountId })', neu: 'JSON.stringify({ [householdId]: accountId })', expect: 'remembered account' },
  { name: 'p-note-untrimmed', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'const note = row.note.trim();', neu: 'const note = row.note;', expect: 'exact: personId, amount in reais' },
  { name: 'p-equal-sends-percent', suite: 'pure', mod: 'people', rel: PEOPLE, old: "if (draft.strategy === 'percent') entry.percent =", neu: "if (draft.strategy !== 'exact') entry.percent =", expect: 'percent: percent as a number' },
  // ---- utils/organizeShares.ts (t10_organize.mts) --------------------------------------------------------------
  { name: 'o-default-ignores-server-mark', suite: 'pure', mod: 'organize', rel: ORG, old: 'choices.proposals[p.id] = p.defaultSelected === true;', neu: 'choices.proposals[p.id] = true;', expect: 'defaultChoices' },
  { name: 'o-review-starts-ticked', suite: 'pure', mod: 'organize', rel: ORG, old: '    include: false,\n    personRef: line.suggestedPersonId', neu: '    include: true,\n    personRef: line.suggestedPersonId', expect: 'defaultChoices' },
  { name: 'o-merge-loses-alias', suite: 'pure', mod: 'organize', rel: ORG, old: '      ...group.members.map((m) => m.name),\n', neu: '', expect: 'merge: Fofinho assigned' },
  { name: 'o-unused-person-created', suite: 'pure', mod: 'organize', rel: ORG, old: '    if (!group.used) continue;\n', neu: '', expect: 'a new person nothing selected points at' },
  { name: 'o-override-stays-by-id', suite: 'pure', mod: 'organize', rel: ORG, old: 'if (item.overrideCents !== null && item.target) {', neu: 'if (false) {', expect: 'an adjusted proposal leaves proposalIds' },
  { name: 'o-percent-rounds-up', suite: 'pure', mod: 'organize', rel: ORG, old: 'Math.floor((reaisToCents(line.transactionAmount) * hundredths) / 10000)', neu: 'Math.round((reaisToCents(line.transactionAmount) * hundredths) / 10000)', expect: 'percent of the transaction (rounded down)' },
  { name: 'o-over-total-ignored', suite: 'pure', mod: 'organize', rel: ORG, old: "if (over) return { code: 'over-total', message: over };", neu: '', expect: 'over-total' },
  { name: 'o-refresh-after-choices', suite: 'pure', mod: 'organize', rel: ORG, old: "if (state.needsRefresh) return { code: 'needs-refresh',", neu: "if (state.needsRefresh && built && built.problem === null) return { code: 'needs-refresh',", expect: 'organizeBlocker' },
  { name: 'o-reconcile-forgets', suite: 'pure', mod: 'organize', rel: ORG, old: 'out.proposals[id] = had.proposals.has(id) && id in prev.proposals ? prev.proposals[id] : fresh.proposals[id];', neu: 'out.proposals[id] = fresh.proposals[id];', expect: 'reconcileChoices: what the user decided survives' },
  { name: 'o-merge-into-non-root', suite: 'pure', mod: 'organize', rel: ORG, old: "    if ((choices.assignments[into] ?? '') !== '') return choices;\n", neu: '', expect: 'merge keeps the structure flat' },
  { name: 'o-merge-not-flattened', suite: 'pure', mod: 'organize', rel: ORG, old: "assignments[key] = target === '' ? value : target;", neu: 'assignments[key] = value;', expect: 'merge keeps the structure flat' },
  { name: 'o-registered-name-allowed', suite: 'pure', mod: 'organize', rel: ORG, old: '      if (taken.has(key)) return', neu: '      if (false) return', expect: 'a name that collides with a registered person' },
  // ---- dialogs and page ---------------------------------------------------------------------------------------
  { name: 'd-esc-closes-while-saving', suite: 'dialog', filter: '^P-D10', rel: UI, old: 'if (canCloseRef.current) onCloseRef.current();', neu: 'onCloseRef.current();', expect: 'P-D10' },
  { name: 'd-backdrop-closes-while-saving', suite: 'dialog', filter: '^P-D10', rel: UI, old: '    if (canCloseRef.current) onClose();\n  };\n  return createPortal(', neu: '    onClose();\n  };\n  return createPortal(', expect: 'P-D10' },
  { name: 'd-divide-clear-one-direction', suite: 'dialog', filter: '^P-D9', rel: DIVIDE, old: 'for (const direction of DIRECTIONS) {', neu: 'for (const direction of DIRECTIONS.slice(0, 1)) {', expect: 'P-D9' },
  { name: 'd-divide-stale-server-check', suite: 'dialog', filter: '^P-D7', rel: DIVIDE, old: 'serverCheck && serverCheck.inputKey === requestInputKey ? serverCheck : null', neu: 'serverCheck', expect: 'P-D7' },
  // seq guard and inputKey guard cover the same late answer: either alone is enough, so this one survives.
  { name: 'd-divide-check-seq-guard', suite: 'dialog', filter: '^P-D8', rel: DIVIDE, old: '      if (!mountedRef.current || run !== checkSeqRef.current) return;\n      setServerCheck({ inputKey, result, error: null });', neu: '      setServerCheck({ inputKey, result, error: null });', expect: 'P-D8', survives: true },
  { name: 'd-divide-created-person-lost', suite: 'dialog', filter: '^P-D13', rel: DIVIDE, old: '          setCreatedPeople((list) => [...list, person]);\n', neu: '', expect: 'P-D13' },
  { name: 'd-divide-save-writes-in-readonly', suite: 'dialog', filter: '^P-D17', rel: DIVIDE, old: '{!readOnly && (\n                <button type="button" onClick={() => void handleSave()}', neu: '{(\n                <button type="button" onClick={() => void handleSave()}', expect: 'P-D17' },
  { name: 'd-settle-account-repicked', suite: 'dialog', filter: '^P-S7', rel: SETTLE, old: 'if (!open || !draft || accountPickedRef.current || accounts.length === 0) return;', neu: 'if (!open || !draft || accounts.length === 0) return;', expect: 'P-S7' },
  { name: 'd-settle-fetches-candidates-always', suite: 'dialog', filter: '^P-S4', rel: SETTLE, old: "const linking = open && draft?.mode === 'link';", neu: 'const linking = open;', expect: 'P-S4' },
  { name: 'd-settle-no-hint-on-different-amount', suite: 'dialog', filter: '^P-S5', rel: SETTLE, old: 'candidateCents !== null && amountCents !== null && candidateCents !== amountCents &&', neu: 'false &&', expect: 'P-S5' },
  { name: 'h-ledger-cursor-dropped', suite: 'dialog', filter: '^P-L1', rel: HOOK, old: '        cursor: pageParam,\n', neu: '', expect: 'P-L1' },
  { name: 'h-delete-status-ignored', suite: 'dialog', filter: '^P-L4', rel: HOOK, old: 'if (response.status === 204) return { deleted: true, person: null };', neu: 'if (false) return { deleted: true, person: null };', expect: 'P-L4' },
  { name: 'h-settlement-invalidate-success-only', suite: 'dialog', filter: '^P-H1', rel: HOOK, old: "    // On error too: a failed request may have created the transaction before failing.\n    onSettled: () => {", neu: "    onSuccess: () => {", expect: 'P-H1' },
  { name: 'h-settlement-no-money-queries', suite: 'dialog', filter: '^P-H1', rel: HOOK, old: "    // On error too: a failed request may have created the transaction before failing.\n    onSettled: () => {\n      invalidatePeopleData(queryClient, { money: true });", neu: "    onSettled: () => {\n      invalidatePeopleData(queryClient, { money: false });", expect: 'P-H1' },
  { name: 'h-shares-invalidate-success-only', suite: 'dialog', filter: '^P-H2', rel: HOOK, old: '/shares`, input);\n      return response.data!;\n    },\n    onSettled: () => {', neu: '/shares`, input);\n      return response.data!;\n    },\n    onSuccess: () => {', expect: 'P-H2' },
  { name: 'h-apply-invalidate-success-only', suite: 'dialog', filter: '^P-H3', rel: HOOK, old: "'/people/organize/apply', input);\n      return response.data!;\n    },\n    onSettled: () => {", neu: "'/people/organize/apply', input);\n      return response.data!;\n    },\n    onSuccess: () => {", expect: 'P-H3' },
  { name: 'd-wizard-not-blocked-after-failure', suite: 'dialog', filter: '^P-O13', rel: WIZARD, old: 'needsRefresh: applyError !== null,', neu: 'needsRefresh: false,', expect: 'P-O13' },
  { name: 'd-wizard-refresh-forgets-choices', suite: 'dialog', filter: '^P-O13', rel: WIZARD, old: 'reconcileChoices(prev, current, data, existingRef.current)', neu: 'reconcileChoices(null, current, data, existingRef.current)', expect: 'P-O13' },
  { name: 'd-wizard-closes-while-applying', suite: 'dialog', filter: '^P-O14', rel: WIZARD, old: 'canClose={!applying} titleId="organize-dialog-title"', neu: 'canClose titleId="organize-dialog-title"', expect: 'P-O14' },
  { name: 'd-wizard-late-preview-after-close', suite: 'dialog', filter: '^P-O15', rel: WIZARD, old: '    return () => {\n      seqRef.current += 1;\n    };\n  }, [open]);', neu: '  }, [open]);', expect: 'P-O15' },
  { name: 'd-wizard-options-not-echoed', suite: 'dialog', filter: '^P-O2', rel: WIZARD, old: 'appliedOptions ?? {}, preview, choices, existing)', neu: '{}, preview, choices, existing)', expect: 'P-O2' },
  // ---- review round 1 ------------------------------------------------------------------------------------
  { name: 'p-percent-convert-drift', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'if (!after.valid || after.parts.some((p, index) => p.cents !== before[index])) {', neu: 'if (false) {', expect: 'convertDraftStrategy -> percent never changes the parts' },
  { name: 'p-percent-convert-inexact-filled', suite: 'pure', mod: 'people', rel: PEOPLE, old: "percentText: exact ? formatHundredthsInput(hundredths) : '' };", neu: "percentText: formatHundredthsInput(hundredths) };", expect: 'convertDraftStrategy -> percent never changes the parts', survives: true },
  { name: 'p-can-write-unknown-household', suite: 'pure', mod: 'people', rel: PEOPLE, old: "return !!household && household.role !== 'VIEWER';", neu: "return household?.role !== 'VIEWER';", expect: 'canWritePeople' },
  { name: 'p-saved-message-direction', suite: 'pure', mod: 'people', rel: PEOPLE, old: "if (direction === 'THEY_OWE_ME') return `Divisão salva. Sua parte", neu: "if (direction !== 'THEY_OWE_ME') return `Divisão salva. Sua parte", expect: 'savedSharesMessage' },
  { name: 'p-shares-above-1000', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'return n >= 1 && n <= MAX_SHARES ? n : null;', neu: 'return n >= 1 ? n : null;', expect: 'shares are whole numbers from 1 to 1000' },
  { name: 'p-my-shares-zero-refused', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'return n <= MAX_SHARES ? n : null;', neu: 'return n >= 1 && n <= MAX_SHARES ? n : null;', expect: 'shares are whole numbers from 1 to 1000' },
  { name: 'p-more-than-50-people', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'if (rows.length > MAX_SPLIT_ENTRIES) formError', neu: 'if (rows.length > 500) formError', expect: 'more than 50 people' },
  { name: 'p-alias-cap', suite: 'pure', mod: 'people', rel: PEOPLE, old: 'if (cleaned.length > MAX_ALIASES)', neu: 'if (cleaned.length > 99)', expect: 'validatePersonForm: at most 20 aliases' },
  { name: 'o-4xx-says-partial', suite: 'pure', mod: 'organize', rel: ORG, old: 'if (status !== undefined && status >= 400 && status < 500)', neu: 'if (false)', expect: 'result texts' },
  { name: 'o-existing-alias-unchecked', suite: 'pure', mod: 'organize', rel: ORG, old: "if (owner && (group.target.kind === 'new' || owner.id !== (group.target as { personId: string }).personId)) {", neu: "if (owner && group.target.kind === 'new') {", expect: 'aliases typed for a registered person' },
  { name: 'o-alias-cap-unchecked', suite: 'pure', mod: 'organize', rel: ORG, old: 'group.aliases.length + (own?.aliases.length ?? 0) > MAX_ALIASES', neu: 'group.aliases.length + (own?.aliases.length ?? 0) > 9999', expect: 'aliases typed for a registered person' },
  { name: 'd-settle-hidden-link-id', suite: 'dialog', filter: '^P-R1 ', rel: SETTLE, old: "const chosen = draft && candidates.some((c) => c.id === draft.transactionId) ? draft.transactionId : '';", neu: "const chosen = draft ? draft.transactionId : '';", expect: 'P-R1' },
  { name: 'd-settle-guesses-first-account', suite: 'dialog', filter: '^P-S1 ', rel: SETTLE, old: 'if (!accounts.some((a) => a.id === remembered)) return;', neu: "if (!accounts.some((a) => a.id === remembered)) { setDraft((d) => (d && !d.accountId ? { ...d, accountId: accounts[0].id } : d)); return; }", expect: 'P-S1' },
  { name: 'd-settle-remembered-other-household', suite: 'dialog', filter: '^P-S3', rel: HOOK, old: 'return parseSavedSettlementAccount(window.localStorage.getItem(SETTLEMENT_ACCOUNT_STORAGE_KEY), householdId);', neu: 'return parseSavedSettlementAccount(window.localStorage.getItem(SETTLEMENT_ACCOUNT_STORAGE_KEY), \'h2\');', expect: 'P-S3' },
  { name: 'd-shell-esc-reaches-every-shell', suite: 'dialog', filter: '^P-R2', rel: UI, old: "if (e.key !== 'Escape' || openShells[openShells.length - 1] !== id) return;", neu: "if (e.key !== 'Escape') return;", expect: 'P-R2' },
  { name: 'd-shell-unlocks-scroll-early', suite: 'dialog', filter: '^P-R[23]', rel: UI, old: 'if (openShells.length === 0) document.body.style.overflow = savedOverflow;', neu: 'document.body.style.overflow = savedOverflow;', expect: 'P-R2' },
  { name: 'd-shell-no-focus-in', suite: 'dialog', filter: '^P-R17', rel: UI, old: '      field.focus();\n', neu: '', expect: 'P-R17' },
  { name: 'd-settle-double-submit', suite: 'dialog', filter: '^P-R6', rel: SETTLE, old: 'if (!draft || !effective || !person || !householdId || savingRef.current) return;', neu: 'if (!draft || !effective || !person || !householdId) return;', expect: 'P-R6' },
  { name: 'd-divide-double-submit', suite: 'dialog', filter: '^P-R7', rel: DIVIDE, old: 'if (!transactionId || !putInput || savingRef.current || readOnly) return;', neu: 'if (!transactionId || !putInput || readOnly) return;', expect: 'P-R7' },
  { name: 'd-divide-clear-double-submit', suite: 'dialog', filter: '^P-R9', rel: DIVIDE, old: 'if (!transactionId || savingRef.current || readOnly) return;', neu: 'if (!transactionId || readOnly) return;', expect: 'P-R9' },
  { name: 'd-wizard-double-apply', suite: 'dialog', filter: '^P-R8', rel: WIZARD, old: 'if (!built || blocker || applying || applyingRef.current) return;', neu: 'if (!built || blocker || applying) return;', expect: 'P-R8' },
  { name: 'd-divide-clear-without-confirm', suite: 'dialog', filter: '^P-D9', rel: DIVIDE, old: 'onClick={() => setConfirmingClear(true)}', neu: 'onClick={() => void handleClearAll()}', expect: 'P-D9' },
  { name: 'd-divide-rows-uncapped', suite: 'dialog', filter: '^P-R10', rel: DIVIDE, old: 'disabled={saving || draft.rows.length >= MAX_SPLIT_ENTRIES}', neu: 'disabled={saving}', expect: 'P-R10' },
  // ---- review round 2 ------------------------------------------------------------------------------------
  { name: 'o-bulk-ticks-registered-left-out', suite: 'pure', mod: 'organize', rel: ORG, old: 'for (const p of preview.proposals) if (!selected || bulkTickable(p)) proposals[p.id] = selected;', neu: 'for (const p of preview.proposals) proposals[p.id] = selected;', expect: 'items of new people (person.id null) can arrive unticked' },
  { name: 'o-bulk-skips-new-people', suite: 'pure', mod: 'organize', rel: ORG, old: 'return item.defaultSelected === true || item.person.id === null;', neu: 'return item.defaultSelected === true;', expect: 'items of new people (person.id null) can arrive unticked' },
  { name: 'o-detected-items-wrong-person', suite: 'pure', mod: 'organize', rel: ORG, old: 'p.person.id === null && normalizeLabel(p.person.name) === detectedKey;', neu: 'p.person.id === null;', expect: 'items of new people (person.id null) can arrive unticked' },
  { name: 'o-left-out-counts-ticked', suite: 'pure', mod: 'organize', rel: ORG, old: 'const off = (id: string, defaultSelected: boolean, map?: Record<string, boolean>) => (map ? map[id] !== true : defaultSelected !== true);', neu: 'const off = (id: string, defaultSelected: boolean, map?: Record<string, boolean>) => (map ? false : defaultSelected !== true);', expect: 'items of new people (person.id null) can arrive unticked' },
  { name: 'd-wizard-no-new-people-note', suite: 'dialog', filter: '^P-O21', rel: WIZARD, old: 'if (arrived.proposals + arrived.settlements === 0) return null;', neu: 'return null;', expect: 'P-O21' },
  { name: 'd-wizard-no-left-out-line', suite: 'dialog', filter: '^P-O2[12]', rel: WIZARD, old: '{leftOut > 0 && (', neu: '{false && (', expect: 'P-O2' },
  { name: 'd-wizard-no-tick-all-of-person', suite: 'dialog', filter: '^P-O21', rel: WIZARD, old: 'onClick={() => onChoices((c) => setDetectedItems(c, preview, detected.key, !allTicked))}>', neu: 'onClick={() => undefined}>', expect: 'P-O21' },
  { name: 'd-shell-focus-captured-late', suite: 'dialog', filter: '^P-R16', rel: UI, old: '    const returnTo = returnFocusRef.current;', neu: '    const returnTo = (document.activeElement as HTMLElement | null) ?? null;', expect: 'P-R16' },
  { name: 'd-shell-focus-lost-on-close', suite: 'dialog', filter: '^P-R1[36]', rel: UI, old: 'if (returnTo && returnTo.isConnected) returnTo.focus();', neu: '', expect: 'P-R1' },
  { name: 'd-shell-focuses-a-button-while-loading', suite: 'dialog', filter: '^P-R17', rel: UI, old: "const FIELDS = 'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])';", neu: "const FIELDS = 'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-shell-close])';", expect: 'P-R17' },
  { name: 'd-shell-no-focus-after-load', suite: 'dialog', filter: '^P-R17', rel: UI, old: '    } else if (document.activeElement !== panel) panel.focus();', neu: '    }', expect: 'P-R17' },
  { name: 'd-divide-remove-not-danger', suite: 'dialog', filter: '^P-R18', rel: DIVIDE, old: "disabled={saving} className={BTN_DANGER}>{saving ? 'Removendo…' : 'Remover'}", neu: "disabled={saving} className={BTN_PRIMARY}>{saving ? 'Removendo…' : 'Remover'}", expect: 'P-R18' },
  { name: 'd-page-viewer-can-write', suite: 'dialog', filter: '^P-G4', rel: PAGE, old: 'const canEdit = canWritePeople(household);', neu: 'const canEdit = true;', expect: 'P-G4' },
];

function makeMutant({ name, rel, old, neu }) {
  const out = spawnSync(process.execPath, ['mutate.mjs', name, rel, old, neu], { cwd: here, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`${name}: mutate.mjs failed\n${out.stdout}${out.stderr}`);
  return path.join(here, 'mut', name, 'src');
}

function cleanup(name) {
  fs.rmSync(path.join(here, 'mut', name), { recursive: true, force: true });
  fs.rmSync(path.join(here, 'out', `${name}.mjs`), { force: true });
  fs.rmSync(path.join(here, `entry.${name}.tsx`), { force: true });
}

/**
 * build.mjs may carry blocks of other lanes (the unified import) that need files a mutated copy of THIS lane does not
 * have: the bite-checks build with a private copy of it without those appended blocks.
 */
function privateBuilder() {
  const source = fs.readFileSync(path.join(here, 'build.mjs'), 'utf8');
  const a = source.indexOf('// Unified import');
  const b = source.indexOf('const stubPlugin');
  const text = a !== -1 && b !== -1 && a < b ? source.slice(0, a) + source.slice(b) : source;
  const file = path.join(here, '_build_people.mjs');
  fs.writeFileSync(file, text);
  return file;
}

function runPure(mutant, src) {
  const env = { ...process.env };
  if (mutant.mod === 'people') env.PEOPLE_MODULE = path.join(src, PEOPLE);
  else env.ORGANIZE_MODULE = path.join(src, ORG);
  // A private runner without the suites of other lanes (they import files this lane's copy does not have).
  const runner = path.join(FE_TESTS, '_run_people.mts');
  const runnerSource = fs.readFileSync(path.join(FE_TESTS, 'run.mts'), 'utf8').split('\n').filter((l) => !l.includes('tu_unified')).join('\n');
  fs.writeFileSync(runner, runnerSource);
  try {
    return spawnSync(process.execPath, [TSX_CLI, runner], { cwd: FE_TESTS, encoding: 'utf8', env });
  } finally {
    fs.rmSync(runner, { force: true });
  }
}

function runDialog(builder, name, src, nameFilter) {
  const build = spawnSync(process.execPath, [builder, name, src], { cwd: here, encoding: 'utf8' });
  if (build.status !== 0) return build;
  return spawnSync(process.execPath, ['scenarios.mjs', name, nameFilter], { cwd: here, encoding: 'utf8' });
}

const builder = privateBuilder();
const results = [];
for (const mutant of MUTANTS) {
  if (filter && !filter.test(mutant.name)) continue;
  const src = makeMutant(mutant);
  const out = mutant.suite === 'pure' ? runPure(mutant, src) : runDialog(builder, mutant.name, src, mutant.filter);
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const failLines = text.split('\n').filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  const bit = out.status !== 0 && failLines.some((l) => l.includes(mutant.expect));
  const verdict = bit ? (mutant.survives ? 'BIT (unexpected)' : 'bit') : mutant.survives ? 'survived (expected)' : 'SURVIVED';
  results.push({ name: mutant.name, verdict, fails: failLines.length });
  console.log(`${verdict.padEnd(20)} ${mutant.name}  (${failLines.length} failing: ${failLines.slice(0, 2).join(' | ').slice(0, 200)})`);
  if (!bit && !mutant.survives) console.log(text.split('\n').slice(-12).join('\n'));
  cleanup(mutant.name);
}
fs.rmSync(path.join(here, 'mut'), { recursive: true, force: true });
fs.rmSync(builder, { force: true });
const bad = results.filter((r) => r.verdict === 'SURVIVED' || r.verdict === 'BIT (unexpected)');
console.log(`\n${results.length} mutants: ${results.filter((r) => r.verdict === 'bit').length} bit, `
  + `${results.filter((r) => r.verdict === 'survived (expected)').length} survived as documented, ${bad.length} unexpected`);
process.exit(bad.length ? 1 : 0);
