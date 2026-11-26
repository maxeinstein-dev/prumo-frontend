// Bite-checks of the shifted rows / realignment lane: one mutant at a time on a scratch COPY of the frontend `src`
// (never on the checkout), the pure suite (run-realign.mts) or the dialog scenarios (dialog-sim/run.sh '^RL') run against it,
// and the check that a named test fails.
//
//   node bite-realign.mjs [filter-regex]
//   env: COPY_DIR=<scratch dir that has package.json and a node_modules junction/link of the frontend> (required)
//        FRONTEND_DIR=<the real frontend checkout> (default: sibling)
// The scratch copy is overwritten (src + package.json); nothing in it is ever deleted.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const real = process.env.FRONTEND_DIR || path.resolve(here, '..');
const copy = process.env.COPY_DIR;
if (!copy || !existsSync(path.join(copy, 'node_modules'))) throw new Error('COPY_DIR must be a dir with a node_modules (junction) of the frontend');
const tsx = path.resolve(here, '../node_modules/.bin/tsx.cmd');
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const norm = (s) => s.replace(/\r\n/g, '\n');
const REALIGN = 'src/utils/maxfinRealign.ts';
const PAYLOAD = 'src/utils/maxfinPayload.ts';
const WORKBOOK = 'src/utils/maxfinWorkbook.ts';
const DIALOG = 'src/components/ImportMaxFinDialog.tsx';

// [name, file, from, to, kind ('pure' | 'sim'), the test ids expected to fail (any of them)]
const MUTANTS = [
  ['requirements are not enforced (no fixpoint)', REALIGN, 'if (chosen[p.id] && p.requires.some((dep) => chosen[dep] !== true)) {', 'if (false) {', 'pure', ['RB-b', 'RB-d', 'RB-e', 'RC-e']],
  ['an ambiguous proposal is ticked when the server says defaultSelected', REALIGN, 'return proposal.defaultSelected === true && proposal.ambiguous !== true;', 'return proposal.defaultSelected === true;', 'pure', ['RB-a']],
  ['every decision is sent as apply true', REALIGN, 'apply: effective[p.id] === true,', 'apply: true,', 'pure', ['RC-a', 'RC-d', 'RC-e']],
  ['inserted rows are not held back with a pending block', REALIGN, '...p.insertedRefs];', '];', 'pure', ['RC-i2']],
  ['a block can be ticked while its requirement is unticked', REALIGN, 'return unmetRequirements(proposals, selection, id).length === 0;', 'return true;', 'pure', ['RB-c', 'RB-d', 'RE-e']],
  ['the requirements are not echoed in the decision', REALIGN, 'requires: [...p.requires],', 'requires: [],', 'pure', ['RC-a', 'RC-e']],
  ['the sheet row is not echoed (sheet: null)', REALIGN, 'sheet: m.sheet\n          ? { description: m.sheet.description, type: m.sheet.type, amount: m.sheet.amount, installment: m.sheet.installment }\n          : null,', 'sheet: null,', 'pure', ['RC-a', 'RC-b']],
  ['removed rows are not counted among the moves', REALIGN, 'totals.moves += p.moves.length + p.removed.length;', 'totals.moves += p.moves.length;', 'pure', ['RC-j', 'RE-f']],
  ['a proposal over the move limit can still be sent', REALIGN, 'proposal.moves.length > MAXFIN_MAX_REALIGN_MOVES', 'false', 'pure', ['RB-g']],
  ['a result with only applied blocks is not shown', REALIGN, 'return Array.isArray(outcomes) && outcomes.length > 0;', "return Array.isArray(outcomes) && outcomes.some((o) => o.status === 'skipped');", 'pure', ['RF-c']],
  ['the block of a ticked-then-unticked requirement is not reconciled (kept choices ignored)', REALIGN, "if (old && realignSignature(old) === realignSignature(p) && typeof prevSelection[p.id] === 'boolean') kept[p.id] = prevSelection[p.id];", '', 'pure', ['RB-h', 'RG-e']],
  ['held rows are still sent', PAYLOAD, '&& !(heldRefs?.has(row.sourceRef) && row.status === \'new\'),', ',', 'pure', ['RC-g']],
  ['the payload never carries realignments', PAYLOAD, '...(proposals.length > 0 ? { realignments: buildRealignDecisions(proposals, realignSelection) } : {}),', '', 'pure', ['RC-c', 'RC-d', 'RC-e']],
  ['a confirm that only realigns is blocked', PAYLOAD, 'if (count === 0 && realign.applied === 0) {', 'if (count === 0) {', 'pure', ['RD-a']],
  ['shifted is sendable', PAYLOAD, "const SENDABLE_STATUSES: readonly string[] = ['new',", "const SENDABLE_STATUSES: readonly string[] = ['shifted', 'new',", 'pure', ['RC-f']],
  ['the summary leaves out the realigned count', PAYLOAD, 'if (realigned) parts.push(realigned);', '', 'pure', ['RF-a', 'RG-d']],
  ['shifted rows count as unknown again', PAYLOAD, "      case 'shifted':\n        // Known, but not a bucket of its own here: countShiftedRows (maxfinRealign.ts) counts them.\n        break;\n", '', 'pure', ['RE-a']],
  ['too many blocks are not blocked', PAYLOAD, 'if (realign.total > MAXFIN_MAX_REALIGN_DECISIONS) {', 'if (false) {', 'pure', ['RD-c']],
  ['a workbook month with only a realignment is not a step', WORKBOOK, 'if (built.rowsSent.length === 0 && built.totals.realign.applied === 0) {', 'if (built.rowsSent.length === 0) {', 'pure', ['RG-a']],
  ['the workbook run summary forgets the realigned count', WORKBOOK, "summary.realigned += typeof result.realigned === 'number' ? result.realigned : 0;", '', 'pure', ['RG-d']],
  ['the workbook plan ignores the realignment ticks', WORKBOOK, 'context, realignSelection[id]),', 'context),', 'pure', ['RG-a', 'RG-b']],
  ['the card says the wrong direction for an insertion', REALIGN, "p.kind === 'insertion' ? 'maxfinRealignInsertion' : 'maxfinRealignRemoval'", "p.kind === 'insertion' ? 'maxfinRealignRemoval' : 'maxfinRealignInsertion'", 'pure', ['RE-b', 'RE-c']],
  ['the shifted row detail reads the wrong line', REALIGN, "from: lineOfRef(move.from), to: lineOfRef(move.to) });", "from: lineOfRef(move.to), to: lineOfRef(move.from) });", 'pure', ['RF-e']],
  // dialog (scenarios)
  ['dialog: shifted rows get a checkbox of their own', DIALOG, '{shifted ? (', '{false ? (', 'sim', ['RL1']],
  ['dialog: a held new row is not held on screen', DIALOG, 'held={proposalHoldingRow(row, proposals, realignSelection) !== null}', 'held={false}', 'sim', ['RL3']],
  ['dialog: a block whose requirement is unticked can be ticked', DIALOG, 'disabled={disabled || (view.tickDisabled && !view.checked)}', 'disabled={disabled}', 'sim', ['RL5']],
  ['dialog: the toggle ignores `requires`', DIALOG, 'setRealignSelection((prev) => toggleRealign(proposals, prev, id, checked));', 'setRealignSelection((prev) => ({ ...prev, [id]: checked }));', 'sim', ['RL5']],
  ['dialog: the payload is built without the realignment ticks', DIALOG, 'customIdsByType }, realignSelection) : null),', 'customIdsByType }) : null),', 'sim', ['RL3', 'RL3b', 'RL4']],
  ['dialog: the result does not list the blocks', DIALOG, '{realignLines.length > 0 && (', '{false && (', 'sim', ['RL2', 'RL3', 'RL3b']],
  ['dialog: the month detail drops the proposals', DIALOG, 'const proposals = realignProposals(month.preview);', 'const proposals: MaxFinRealignProposal[] = [];', 'sim', ['RL8']],
  ['dialog: the status chip does not say Deslocada', DIALOG, "label: tx('maxfinRealignRowShifted') }", "label: 'Alterada' }", 'sim', ['RL1']],
];

function copySrc() {
  cpSync(path.join(real, 'src'), path.join(copy, 'src'), { recursive: true });
  cpSync(path.join(real, 'package.json'), path.join(copy, 'package.json'));
}

function run(kind, variant) {
  const env = { ...process.env, FRONTEND_DIR: copy };
  if (kind === 'pure') {
    const r = spawnSync('"' + tsx + '"', ['run-realign.mts'], { cwd: here, env, encoding: 'utf8', shell: true });
    return r.stdout + r.stderr;
  }
  const r = spawnSync('bash', ['run.sh', '^RL'], { cwd: path.join(here, 'dialog-sim'), env: { ...env, SIM_VARIANT: variant }, encoding: 'utf8', timeout: 170000 });
  return r.stdout + r.stderr;
}

const failedNames = (out) => [...out.matchAll(/^ {2}FAIL (\S+)/gm)].map((m) => m[1].replace(/:$/, ''));

let bitten = 0;
let ran = 0;
const survivors = [];
for (const [i, [name, file, from, to, kind, expected]] of MUTANTS.entries()) {
  if (filter && !filter.test(name)) continue;
  copySrc();
  const target = path.join(copy, file);
  const original = norm(readFileSync(target, 'utf8'));
  if (!original.includes(from)) {
    console.log(`  ERR  #${i} ${name}: the code to mutate was not found (the mutant is stale)`);
    survivors.push(`${name} (stale)`);
    continue;
  }
  if (original.split(from).length > 2) {
    console.log(`  ERR  #${i} ${name}: the code to mutate is not unique`);
    survivors.push(`${name} (ambiguous)`);
    continue;
  }
  writeFileSync(target, original.replace(from, () => to));
  const out = run(kind, `mut${i}`);
  const failed = failedNames(out);
  if (!/\d+ passed, \d+ failed/.test(out)) {
    console.log(`  ERR  #${i} ${name}: the run produced no summary:\n${out.slice(-600)}`);
    survivors.push(`${name} (run error)`);
    continue;
  }
  const hit = failed.filter((n) => expected.some((e) => n === e || n.startsWith(`${e}:`)));
  ran += 1;
  if (hit.length > 0) {
    bitten += 1;
    console.log(`  BITE #${i} ${name}\n        failed: ${failed.join(', ')}`);
  } else {
    survivors.push(name);
    console.log(`  LIVE #${i} ${name}\n        expected one of ${expected.join(', ')}; failed: ${failed.join(', ') || '(none)'}`);
  }
}
copySrc();
console.log(`\n${bitten} of ${ran} mutants caught${survivors.length ? `; survivors: ${survivors.join(' | ')}` : ''}`);
process.exitCode = survivors.length ? 1 : 0;
