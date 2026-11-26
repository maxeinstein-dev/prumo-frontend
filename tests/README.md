# Frontend tests

The tests live with the code: each branch carries the tests of its own code, and CI runs them in the `build` job.
All fixtures are invented; never put real data here (this repository is public).

    npm test           # pure logic (tests/run.mts, with tsx)
    npm run test:sim   # the real dialogs bundled with esbuild and driven under jsdom (tests/dialog-sim)

Rules:

- `run.mts` imports every suite directly. A suite whose module is missing is a failure, never a skip.
- A test written for a branch that has not landed goes in `tests/pending.json` (start of the test name -> that branch).
  It still runs: a failure prints `pend` with the reason; a pass fails the suite until the entry is removed.
- A branch that changes behavior changes its tests in the same branch. Never edit tests in a folder shared by branches.

The notes below come from the time these tests lived outside the repository (`Recta/tools/fe-tests`); `FRONTEND_DIR`
still points a run at another checkout, and the `bite-*.mjs` scripts still make one mutant per guard.

    npx tsx tests/run.mts

Set `MAXFIN_MODULE` to a file path to run the same suite against a mutated copy of the module (bite-checks).

Phase 2 (workbook .xlsx): `t6_workbook.mts` covers `src/utils/maxfinWorkbook.ts` and `t7_credits.mts` the net card
invoice (negative sheet values as credits). Set `MAXFIN_WORKBOOK_MODULE` to a mutated copy of `maxfinWorkbook.ts`
(next to a copy of `maxfinPayload.ts` and `../lib/enums.ts`) the same way as `MAXFIN_MODULE`.
`dialog-sim/bite-workbook.mjs` runs the phase-2 bite-checks (one mutant per guard, pure suite or dialog scenarios).

Phase 3 (card invoice .ofx): `t8_card_ofx.mts` covers `src/utils/cardOfx.ts` (sections, selection by group, payload,
totals in integer cents, payment rules, blocker, result texts); set `CARD_OFX_MODULE` to a mutated copy the same way.
`dialog-sim/card-scenarios.mjs` (registered by `scenarios.mjs`, names `K*`) drives the real `ImportCardOfxDialog` and the
hand-off from `ImportTransactionsDialog`; the fake server answers `/card-ofx/preview|confirm` (`fake.cardPreview`,
`fake.cardConfirm`) and the generic statement preview (`fake.statementPreview`). `dialog-sim/bite-card-ofx.mjs` makes one
mutant per guard with `mutate.mjs` and checks that the named test fails.

Phase 4 (people and shared expenses): `t9_people.mts` covers `src/utils/people.ts` (money/percent/share inputs in integer
cents, the split strategies mirrored for the live preview, the PUT body, balances, settlements, person form; set
`PEOPLE_MODULE` to a mutated copy) and `t10_organize.mts` covers `src/utils/organizeShares.ts` (options, default and
reconciled choices, people registry with merges and aliases, review lines, the apply payload, blocker; `ORGANIZE_MODULE`).
`dialog-sim/people-scenarios.mjs` + `organize-scenarios.mjs` (registered by `scenarios.mjs`, names `P-*`) drive the real
`DivideTransactionDialog`, `SettlementDialog`, `PersonFormDialog`, `PersonDetail` (ledger pagination), `OrganizeSharesDialog`
and the `People` page against `people-fake.mjs`, a small stateful fake of the phase 4 endpoints (written independently of the
client: it computes the strategies, balances and ledger itself) that `stubs/api.ts` routes `get/put/patch/delete/post` to
(`fake.people(method, url, payload)`; `server.gate(...)` holds a request, `failNext`/`override` change an answer).
`dialog-sim/bite-people.mjs` makes one mutant per guard with `mutate.mjs` (pure suites and dialogs) and checks that the named
test fails; it builds with a private copy of `build.mjs` and a private runner so other lanes' blocks do not get in the way.

Run the phase 4 lane alone with `dialog-sim/run-phase4.sh` (pure suites + simulation; it leaves out the unified-import lane, whose suite needs its own branch).

Unified import (one "Importar" hub, queues of invoices/statements, onboarding closing day): `tu_unified_import.mts` (a loader: it skips itself on a checkout without the code; the checks are in `tu_unified_import_checks.mts`) covers the
pure parts: `utils/importHub.ts` (what a file is, by name and a sniff of its first 64 KB; OFX period start and file name date;
ordering oldest first; mixed kinds; destinations), `utils/importQueue.ts` (the queue state machine and the loop of "apply the
default to the rest"), `utils/cardOfxQueue.ts` (the default plan of an invoice, closing day notice, totals),
`utils/statementQueue.ts` and the onboarding account schema (`schemas/index.ts`, closing day). Point `IMPORT_HUB_MODULE`,
`IMPORT_QUEUE_MODULE`, `CARD_QUEUE_MODULE`, `STATEMENT_QUEUE_MODULE` or `ONBOARDING_SCHEMA_MODULE` at a mutated copy for
bite-checks. `dialog-sim/hub-scenarios.mjs` (registered by `scenarios.mjs`, names `H*` hub, `Q*` invoice queue, `S*` statement
queue, `O*` onboarding step) drives the real `ImportHubDialog`, the queue mode of `ImportCardOfxDialog` (`files`) and
`ImportTransactionsDialog` (`initialFiles`) and the real `OnboardingStep5Accounts`. `dialog-sim/bite-unified-import.mjs` makes
one mutant per guard (scratch copies in `mut-unified/`) and checks that the named test fails.

Against another checkout or git worktree: `FRONTEND_DIR=<absolute path> ../../recta-selfhosted-backend/node_modules/.bin/tsx.cmd run.mts`
and `FRONTEND_DIR=<absolute path> SIM_VARIANT=<name> dialog-sim/run.sh` (the bundle is `out/<name>.mjs`, so two runs do not clash).
`build.mjs` leaves out the entry imports whose files that checkout does not have (the scenarios check `B.<Export>` first).

Phase 5 (recurring expenses): `t11_recurring_detect.mts` covers `src/utils/recurringDetect.ts` (default selection, groups by kind, bulk
toggles, adjustments with validation in integer cents, follow-last defaults, the apply payload with only the adjusted fields, totals,
blocker, texts; `RECURRING_DETECT_MODULE`) and `t12_recurring_status.mts` the `matches-recurring` row status of the monthly preview
(defaults, `replace:true`, armed count, counts, result line "assumiu N recorrentes", workbook totals) plus `src/utils/recurringFollow.ts`
(the hint "Este valor será usado nos próximos meses" and the "Recorrência atualizada para R$ X" text; `RECURRING_FOLLOW_MODULE`).
`dialog-sim/detect-scenarios.mjs` (names `DR*`, registered by `scenarios.mjs`) drives the real `DetectRecurringDialog` against
`recurring-fake.mjs` (stateful fake of `POST /recurring-transactions/detect` and `/detect/apply`, routed by `stubs/api.ts` to
`fake.recurring`; `server.hold(kind)` holds a request, `server.failNext(kind, status, message)` fails one); the importer scenarios
`MR*` are in `scenarios.mjs`. `dialog-sim/bite-recurring.mjs` makes one mutant per guard (pure suites and dialogs) and checks that the
named test fails. Not simulated: the hint inside `TransactionModal` (only its pure rule is tested) and the follow-last checkbox/badge on
the Recurring page.

Gaps A/B/C of the card OFX import (merges `enrich-merge`, reason chips, statement closing, review queue of rows without a receipt):
`t13_closing_review.mts` covers `utils/cardOfx.ts` (merge section/labels/estimate, `proposalReasonChip`, `absorbedRows` texts), `utils/cardOfxClosing.ts`
(the server closing, and its recomputation for the selection on screen: checked against an independent port of the backend's closing over every
combination of 8 proposals, plus hand-computed cents) and `utils/cardOfxReview.ts` (decisions, bulk, request, blocker, the partial answer read row by
row, months, kept view). Point `CARD_OFX_MODULE`, `CARD_CLOSING_MODULE`, `CARD_REVIEW_MODULE` or `CARD_QUEUE_MODULE` at a mutated copy for bite-checks.
`dialog-sim/review-scenarios.mjs` (registered by `scenarios.mjs`, names `RQ*` review dialog, `CL*` closing/merge/reasons in the card import dialog) drives the
real `CardOfxReviewDialog` against `review-fake.mjs`, a stateful fake of `GET .../card-ofx/review-queue` and `POST .../review-queue/actions` written
independently of the client (`stubs/api.ts` routes both to `fake.review`; `server.hold('get'|'post')`, `failNext`, `failRow(id, reason)`,
`changeUnderfoot(id, patch)`, `overrideNext`). `dialog-sim/bite-closing-review.mjs` makes one mutant per guard (scratch copies in `mut-closing/`) and checks
that the named test fails. Not simulated: the entry button on the Cartões page (`pages/CreditCards.tsx`, only its wiring), the z-index of the nested review dialog,
and the real backend (the closing numbers of the fixtures are computed by hand, not by `card-ofx-closing.ts`).

Advance payments (backend a8de11c: kind `advance-payment`, reasons `sheet-credit-near` and `changed-in-statement`, confirm field `advancePayments`):
`t17_advance_payment.mts` covers the kind (section `advance`, label, sendable, unknown kinds stay unsent), the reason chips and the visible
counterpart line, the result lines / toast / queue totals, the default plan of a queued invoice, and the closing recomputation checked against an
independent oracle over every combination of 7 proposals, with and without `endInclusive`. `dialog-sim/review-scenarios.mjs` has `CL12`-`CL14`
(section, texts, closing following the ticks, confirm payload and result). `dialog-sim/bite-closing-review.mjs` has the `ap-*` mutants (run them
alone with `node bite-closing-review.mjs '^ap-'`; the pure ones run `t17`). `mutate.mjs` now also copies `utils/closingDay.ts` and
`hooks/useClosingDayAutoFill.ts` (the scratch bundle did not build without them).

Card statement panel (invoice amount, open amount from earlier invoices, debt, dates, forecast at closing): `t18_invoice_statement.mts`
covers `src/utils/invoiceStatement.ts` (view model of the new `GET /transactions/credit-cards/:id/invoice/:month` fields, fallback to the
legacy fields, `dd/MM` labels cut from the string, whole-cent sums). `STATEMENT_MODULE` points at a mutated copy for the bite-checks
(no cent rounding -> IS-g, debt without clamp -> IS-e, forecast shown on a closed invoice -> IS-c, dates through `new Date` -> IS-a/b/c/f,
statement taken from `total` -> IS-a/b/e/g).

Ajustar saldo (opening-balance adjustment of an account, `POST /accounts/:id/adjust-balance` with `newBalance`, `date`, `reason`): `t19_adjust_balance.mts`
covers `src/utils/adjustBalance.ts` (currency mask in integer cents with minus sign, the reason that follows the date: "Saldo inicial" before the
current year, validation of target / date / reason, the request body, the entry wording); `ADJUST_BALANCE_MODULE` points at a mutated copy for the
bite-checks. `dialog-sim/adjust-scenarios.mjs` (registered by `scenarios.mjs`, names `AJ*`) drives the real `AdjustBalanceDialog` against a tiny
stateful fake of the endpoint (`stubs/api.ts` routes it to `fake.adjust`, `stubs/useAccounts.ts` has the mutation hook): blank opening, mask,
"Usar 31/12", exact body, double submit and close guards while saving, error and retry, "already at that balance", latest wins after a reopen,
StrictMode, negative target. `dialog-sim/bite-adjust.mjs` makes one mutant per guard (39) and checks that the named test fails; the one that
survives (`dlg-ref-guard-only`) documents that the disabled button covers the double submit when only the ref guard is removed. The real backend
is covered by `tools/smoke-adjust-balance-db.mts` (scratch Postgres). Not simulated: the menu item in `AccountActionsMenu` (checked in the real UI).

Category manager (Settings section, merge dialog, inline "Criar" in the category combobox): `t20_categories.mts` covers
`src/utils/categoryManager.ts` (grouping Receitas/Despesas, usage labels, merge targets of the same type, merge request and preview sentence,
name validation against system and custom names ignoring case/accents/spaces, create option, failure messages by server code, PATCH body).
`CATEGORY_MANAGER_MODULE` points at a mutated copy; `bite-categories.mjs` (this folder) makes 18 mutants of it. Run the suite alone with
`FRONTEND_DIR=<frontend> node <tsx cli.mjs> run-categories.mts`. `dialog-sim/category-sim.mjs` is a self-contained simulation (its own esbuild
bundle, real hooks and `DialogShell`, `stubs/api-categories.ts` + a stateful fake of `/categories`, written independently of the client): scenarios
`CM1-CM14` (manager, form, delete, merge preview/confirm, latest-wins, close guards, 404) and `CC1-CC4` (combobox inline create). Run:
`FRONTEND_DIR=<frontend> node category-sim.mjs [filter]`; `dialog-sim/bite-categories.mjs` rebuilds the real components with 12 mutants (scratch
copy of `src`) and checks the named scenario fails. The real-Postgres merge smoke is `tools/smoke-category-merge-db.mts` (run from the backend folder).

Reference month (competencia) and "Confirmar recebimento / pagamento": `t21_reference_month.mts` covers `src/utils/referenceMonth.ts` (effective month,
the "ref. MM/YYYY" chip, +-24 months rule, offsets of a recurrence) and `src/utils/confirmReceipt.ts` (what can be confirmed, the "A confirmar" list,
prefill, the cents mask, the patch that sends the amount only when it changed, the difference hint, 409 text, `expectedAmountFor`); run it alone with
`FRONTEND_DIR=<abs path> ../../recta-selfhosted-backend/node_modules/.bin/tsx.cmd run-reference.mts`. `REFERENCE_MONTH_MODULE` / `CONFIRM_RECEIPT_MODULE` point at
mutated copies. `dialog-sim/run-confirm.sh` (own build `build-confirm.mjs` -> `out/confirm.mjs`, own runner `confirm-scenarios.mjs`, names `CF*`) drives the real
`ConfirmReceiptDialog` against a stateful fake of PATCH /transactions/:id (balance moved once, 409 on demand, follow-last recurrence);
`dialog-sim/bite-confirm.mjs` makes one mutant per guard and checks that the named scenario fails. Not simulated: the page wiring (`DueToConfirmPanel`, menu item,
`useConfirmReceipt`) and the forms (`ReferenceMonthField`, `ReferenceOffsetField`), which are checked in the real UI.

Local sign-in hardening (AUTH_MODE=local): `t24_local_auth.mts` covers `src/utils/localSession.ts` (status to failure code, token source by mode, when a 401 ends the
local session, the login-page rules for closed registration, the i18n keys in the 8 languages) and drives the real `utils/api.ts` (bundled with the frontend's
own esbuild, firebase stubbed, fake axios adapter): the Authorization header by mode, a 401 clearing the session and going to `/login`, and `config/authMode.ts`
remembering `registrationEnabled`. Needs the frontend's `node_modules` (`FRONTEND_DIR`, default the sibling checkout). Run alone with `run-local-auth.mts`.
`LOCAL_SESSION_MODULE` / `LOCAL_API_SRC` point at mutated copies. Not simulated: the login page itself (no DOM runner; its decisions are the pure functions above).

`t29_card_commitment.mts` covers the card commitment panel (`src/utils/cardCommitment.ts`, `cardCommitmentTexts.ts`): month choices, rows in cents, installments / recurrences / purchases split, heaviest and over-income marks, the rise warning, empty state and the i18n keys. `CARD_COMMITMENT_MODULE` points it at a mutated copy. Run with `FRONTEND_DIR=<frontend checkout or worktree>` to test a branch other than the default sibling checkout.

Early-payment discount (lote DE2): `t43_early_discount.mts` covers `src/utils/earlyDiscount.ts` (discounted amount with percent rounded up, typed value, draft validation mirroring the backend, what the form sends on create and update, the "Pague até {data} e economize" notice and its highlight on the three days before the limit and the limit day, the `canPayNow` button rule, 409/400 messages) and the bills side of `src/utils/billsChecklist.ts` (`payNext` action, discount kept on the bill, the paid counter by reference month so a bill paid on 28/11 for December counts once, in December, `paidWindowStart`). `EARLY_DISCOUNT_MODULE` / `BILLS_CHECKLIST_MODULE` point at mutated copies. Run with `FRONTEND_DIR=<worktree> ../../recta-selfhosted-backend/node_modules/.bin/tsx.cmd t43_early_discount.mts`. The fake API `../fe-mock/server.mjs` has `MOCK_FLOW=discount` (events with `earlyDiscount`, `GET/POST/PATCH /recurring-transactions`, `POST .../pay-next` with a 409 for `rec-conflict`). Not simulated: the dialogs and rows themselves (checked in the real UI at 360 and 1366 px).
