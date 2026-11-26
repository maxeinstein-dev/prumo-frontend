// Tests written for a branch that is not in this one yet. They still run: a failure is reported as "pend" with the reason
// and does not fail the suite; a pass FAILS the suite, so the entry is removed as soon as the branch lands (the list never
// goes stale). Keys are the start of the test name; values say which branch the expectation comes from.
import { readFileSync } from 'node:fs';

const PENDING = JSON.parse(readFileSync(new URL('./pending.json', import.meta.url), 'utf8'));

/** The reason a test is pending, or null when it is an ordinary test. */
export function pendingReason(name) {
  for (const [prefix, reason] of Object.entries(PENDING)) {
    if (prefix.startsWith('_')) continue;
    if (name.startsWith(prefix)) return reason;
  }
  return null;
}

/**
 * Outcome of one test: 'ok' | 'fail' | 'pend' | 'pending-passed'.
 * A pending test that passes is reported as a failure: take it out of tests/pending.json.
 */
export function outcome(name, passed) {
  const reason = pendingReason(name);
  if (reason === null) return passed ? 'ok' : 'fail';
  return passed ? 'pending-passed' : 'pend';
}
