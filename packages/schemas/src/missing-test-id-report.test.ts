// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { MissingTestIdReportSchema } from './missing-test-id-report.js';

describe('MissingTestIdReportSchema', () => {
  it('accepts an entry with a source file location and one without', () => {
    const result = MissingTestIdReportSchema.safeParse({
      generatedAt: '2026-09-18T00:00:00Z',
      entries: [
        {
          elementId: 'a',
          name: 'submit',
          kind: 'button',
          source: 'static',
          sourceLocation: { filePath: 'src/components/LoginForm.tsx', line: 12 },
        },
        { elementId: 'b', kind: 'button', source: 'crawl' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a line number that is not a positive integer', () => {
    const result = MissingTestIdReportSchema.safeParse({
      generatedAt: '2026-09-18T00:00:00Z',
      entries: [
        {
          elementId: 'a',
          kind: 'button',
          source: 'static',
          sourceLocation: { filePath: 'src/App.tsx', line: 0 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an absolute file path', () => {
    const result = MissingTestIdReportSchema.safeParse({
      generatedAt: '2026-09-18T00:00:00Z',
      entries: [
        {
          elementId: 'a',
          kind: 'button',
          source: 'static',
          sourceLocation: { filePath: '/src/App.tsx', line: 1 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
