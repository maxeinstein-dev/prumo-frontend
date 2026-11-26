import { summary } from './harness.mts';

// Only the shifted rows / realignment suite (t35): the one the bite-checks (bite-realign.mjs) run.
await import('./t35_maxfin_realign.mts');
summary();
