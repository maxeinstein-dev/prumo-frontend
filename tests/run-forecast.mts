import { summary } from './harness.mts';

// Only the forecast strategies suite (the full run.mts needs every lane's modules in the checkout).
await import('./t22_forecast_strategies.mts');
summary();
