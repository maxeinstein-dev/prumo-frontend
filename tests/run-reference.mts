import { summary } from './harness.mts';

// Only the reference month / confirm receipt suite (the full run.mts needs every lane's modules in the checkout).
await import('./t21_reference_month.mts');
summary();
