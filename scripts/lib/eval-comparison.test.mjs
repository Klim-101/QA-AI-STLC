// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildComparison, renderComparisonMarkdown } from './eval-comparison.mjs';

function run(label, parallelism, overrides = {}) {
  return {
    label,
    parallelism,
    report: {
      bugs: {
        detectedCount: 4,
        expectedCount: 5,
        results: [{ bugId: 'BUG-001', isDetected: true, evidence: 'a' }],
        ...overrides.bugs,
      },
      spokes: { validResponseRate: 1, okResponses: 7, attempts: 7, ...overrides.spokes },
    },
    metrics: {
      dispatch: { attempts: 7 },
      retries: { used: 0 },
      timing: { spanMs: 12_300, busyMs: 9000, activeMs: 6000, overlapSavingMs: 3000, ...overrides.timing },
      concurrency: { peak: parallelism, isWithinBudget: true, ...overrides.concurrency },
    },
  };
}

describe('buildComparison', () => {
  it('has one row per run, with the figures of its report and its metrics', () => {
    const comparison = buildComparison('demo', [run('sequential', 1), run('parallel', 4)]);

    expect(comparison.rows).toEqual([
      expect.objectContaining({
        label: 'sequential',
        parallelism: 1,
        bugsDetected: 4,
        bugsExpected: 5,
        validResponseRate: 1,
        attempts: 7,
        retriesUsed: 0,
        spanMs: 12_300,
        busyMs: 9000,
        activeMs: 6000,
        overlapSavingMs: 3000,
        peakConcurrency: 1,
        isWithinBudget: true,
      }),
      expect.objectContaining({ label: 'parallel', peakConcurrency: 4 }),
    ]);
    expect(comparison.notMeasured).toEqual(['tokens', 'cost']);
  });

  it('says the modes agree when they found the same bugs and had the same valid responses', () => {
    const comparison = buildComparison('demo', [run('sequential', 1), run('parallel', 4)]);

    expect(comparison).toMatchObject({ sameFindings: true, sameResponses: true });
  });

  it('says they differ when a bug was found in one mode only, or a response was valid in one only', () => {
    const differentBug = buildComparison('demo', [
      run('sequential', 1),
      run('parallel', 4, { bugs: { results: [{ bugId: 'BUG-001', isDetected: false }] } }),
    ]);
    const differentResponses = buildComparison('demo', [
      run('sequential', 1),
      run('parallel', 4, { spokes: { okResponses: 6 } }),
    ]);

    expect(differentBug).toMatchObject({ sameFindings: false, sameResponses: true });
    expect(differentResponses).toMatchObject({ sameFindings: true, sameResponses: false });
  });

  it('has nothing to disagree about with no run, or with one', () => {
    expect(buildComparison('demo', [])).toMatchObject({ rows: [], sameFindings: true, sameResponses: true });
    expect(buildComparison('demo', [run('only', 1)])).toMatchObject({
      sameFindings: true,
      sameResponses: true,
    });
  });
});

describe('renderComparisonMarkdown', () => {
  it('renders a table with the time in seconds and says whether the modes agree', () => {
    const markdown = renderComparisonMarkdown(
      buildComparison('demo', [run('sequential', 1), run('parallel', 4)]),
    );

    expect(markdown).toContain('# Sequential and parallel: demo');
    expect(markdown).toContain(
      '| sequential | 1 | 4 of 5 | 100.0% | 7 | 0 | 12.3 s | 9.0 s | 6.0 s | 3.0 s | 1 |',
    );
    expect(markdown).toContain(
      '| parallel | 4 | 4 of 5 | 100.0% | 7 | 0 | 12.3 s | 9.0 s | 6.0 s | 3.0 s | 4 |',
    );
    expect(markdown).toContain(
      'The same bugs were found in every mode: yes. The same responses were valid: yes.',
    );
    expect(markdown).toContain('Not measured: tokens, cost.');
  });

  it('says n/a where there is no figure, flags a run over budget and a disagreement', () => {
    const markdown = renderComparisonMarkdown(
      buildComparison('demo', [
        run('sequential', 1, {
          timing: { spanMs: null },
          spokes: { validResponseRate: null, okResponses: 0 },
        }),
        run('parallel', 2, { concurrency: { peak: 3, isWithinBudget: false } }),
      ]),
    );

    expect(markdown).toContain('| n/a | 7 | 0 | n/a |');
    expect(markdown).toContain('| 3 (over budget) |');
    expect(markdown).toContain('The same responses were valid: NO.');
  });
});
