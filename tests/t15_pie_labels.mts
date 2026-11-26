import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Pie percentage labels never get clipped: the widgets size the pie with pieOuterRadius(height), and a label at any angle
// keeps clear of every edge. PIE_MODULE points at a mutated copy of utils/pieLabel.ts for the bite-checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = await import(pathToFileURL(process.env.PIE_MODULE || frontSrc('utils/pieLabel.ts')).href);

console.log('\n[PL] pie chart labels');

// Chart heights used by the widgets (the inline height of ResponsiveContainer) and the narrowest card we render.
const HEIGHTS = [180, 200, 250, 300];
const WIDTHS = [240, 320, 480, 1200];

check('PL-a: pieOuterRadius(height) keeps every label inside the chart at every angle and width', () => {
  for (const h of HEIGHTS) {
    for (const w of WIDTHS) {
      const c = P.pieLabelClearance(w, h, P.pieOuterRadius(h));
      assert.ok(c.min >= 0, `labels cut at ${w}x${h}: ${JSON.stringify(c)}`);
    }
  }
});

check('PL-b: the old fixed radius of 80 cut the label of a 200px chart (the bug this guards)', () => {
  assert.ok(P.pieLabelClearance(320, 200, 80).top < 0);
  assert.ok(P.pieLabelClearance(320, 180, 70).top < 0);
});

check('PL-c: the radius leaves a usable pie, and the label sits outside the slice on the side it belongs to', () => {
  for (const h of HEIGHTS) assert.ok(P.pieOuterRadius(h) >= 50, `radius too small for ${h}`);
  const right = P.pieLabelPlacement(100, 100, 0, 70);
  assert.equal(right.anchor, 'start');
  assert.ok(right.x > 170);
  const left = P.pieLabelPlacement(100, 100, 180, 70);
  assert.equal(left.anchor, 'end');
  assert.ok(left.x < 30);
  const top = P.pieLabelPlacement(100, 100, 90, 70);
  assert.ok(top.y < 30);
});

check('PL-d: small slices get no label; others are rounded percentages', () => {
  assert.equal(P.pieLabelFormat(0.04), null);
  assert.equal(P.pieLabelFormat(Number.NaN), null);
  assert.equal(P.pieLabelFormat(0.6), '60%');
  assert.equal(P.pieLabelFormat(1), '100%');
});

check('PL-e: every pie widget sizes the pie with pieOuterRadius and draws labels through PiePercentLabel', () => {
  const dir = frontSrc('components/widgets');
  const files = ['IncomeByCategoryWidget.tsx', 'ExpensesByCategoryWidget.tsx', 'FixedVsVariableWidget.tsx'];
  for (const f of files) {
    const src = readFileSync(`${dir}/${f}`, 'utf8');
    assert.match(src, /outerRadius=\{pieOuterRadius\(PIE_CHART_HEIGHT\)\}/, `${f}: outerRadius must come from pieOuterRadius`);
    assert.match(src, /height=\{PIE_CHART_HEIGHT\}/, `${f}: the chart height must be the same constant`);
    assert.match(src, /<PiePercentLabel /, `${f}: labels must use PiePercentLabel`);
    assert.doesNotMatch(src, /outerRadius=\{\d+\}/, `${f}: no hard-coded outerRadius`);
  }
});

check('PL-f: no other Pie in the app hard-codes an outer radius that is not checked here', () => {
  const dir = frontSrc('');
  const walk = (d: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(p)); else if (/\.tsx$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const offenders = walk(dir).filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /<Pie[\s>]/.test(s) && /label=/.test(s) && !/PiePercentLabel/.test(s) && !/LandingPage/.test(f);
  });
  assert.deepEqual(offenders, [], `pies with an unchecked label: ${offenders.join(', ')}`);
});
