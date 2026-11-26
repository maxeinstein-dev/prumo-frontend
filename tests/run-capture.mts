import { summary } from './harness.mts';

// Only the Android capture reader suite (utils/captureDevice.ts, utils/captureTexts.ts) and the captures inbox suite (utils/captureInbox.ts, utils/captureRules.ts).
await import('./t26_capture_device.mts');
await import('./t27_captures_inbox.mts');
summary();
