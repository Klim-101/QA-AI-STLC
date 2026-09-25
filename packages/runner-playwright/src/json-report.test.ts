// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { collectSpecs, PlaywrightJsonReportSchema } from './json-report.js';

function makeSpec(title: string) {
  return {
    title,
    tests: [
      {
        annotations: [],
        results: [
          { status: 'passed' as const, startTime: '2026-09-25T00:00:00.000Z', duration: 1, errors: [] },
        ],
      },
    ],
  };
}

describe('collectSpecs', () => {
  it('flattens specs from the top level of the suite tree', () => {
    const report = PlaywrightJsonReportSchema.parse({
      suites: [{ specs: [makeSpec('a')] }, { specs: [makeSpec('b')] }],
    });
    expect(collectSpecs(report).map((spec) => spec.title)).toEqual(['a', 'b']);
  });

  it('flattens specs nested under child suites, depth first', () => {
    const report = PlaywrightJsonReportSchema.parse({
      suites: [{ specs: [makeSpec('parent')], suites: [{ specs: [makeSpec('child')] }] }],
    });
    expect(collectSpecs(report).map((spec) => spec.title)).toEqual(['parent', 'child']);
  });

  it('returns an empty array for a report with no suites', () => {
    const report = PlaywrightJsonReportSchema.parse({ suites: [] });
    expect(collectSpecs(report)).toEqual([]);
  });
});
