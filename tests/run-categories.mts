import { summary } from './harness.mts';

// Only the category manager suite (run.mts needs every lane's modules in the checkout).
await import('./t20_categories.mts');
summary();
