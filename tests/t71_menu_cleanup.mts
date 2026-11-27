import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { check, frontSrc } from './harness.mts';

// The side menu (desktop) and the "Mais" sheet (mobile) no longer offer the community link (Reddit of the original
// project) nor the feedback form, and the React Query devtools button is gone from the app. Read from the sources.
const read = (rel: string): string => readFileSync(frontSrc(rel), 'utf8');

console.log('\n[menu cleanup] Layout, MobileShell, App');

check('desktop side menu: no community link and no feedback button', () => {
  const layout = read('components/Layout.tsx');
  assert.doesNotMatch(layout, /reddit\.com/);
  assert.doesNotMatch(layout, /t\.community/);
  assert.doesNotMatch(layout, /giveFeedback/);
  assert.doesNotMatch(layout, /FeedbackModal/);
});

check('mobile "Mais" sheet: no community link and no feedback button', () => {
  const shell = read('components/mobile/MobileShell.tsx');
  assert.doesNotMatch(shell, /COMMUNITY_URL|reddit\.com/);
  assert.doesNotMatch(shell, /onOpenFeedback|giveFeedback/);
});

check('the feedback modal is gone', () => {
  assert.equal(existsSync(frontSrc('components/FeedbackModal.tsx')), false);
});

check('no React Query devtools in the app nor in the dependencies', () => {
  assert.doesNotMatch(read('App.tsx'), /react-query-devtools|ReactQueryDevtools/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies?.['@tanstack/react-query-devtools'], undefined);
  assert.equal(pkg.devDependencies?.['@tanstack/react-query-devtools'], undefined);
});
