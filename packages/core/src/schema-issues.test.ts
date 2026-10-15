// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatSchemaIssues, parseInlineContent } from './schema-issues.js';

describe('formatSchemaIssues', () => {
  it('names each invalid field by its path and says what is allowed', () => {
    const schema = z.object({ category: z.enum(['functional', 'ui']), steps: z.array(z.string()) });

    const result = schema.safeParse({ category: 'bug', steps: [1] });

    expect(result.success).toBe(false);
    const text = formatSchemaIssues(result.error as z.ZodError);
    expect(text).toContain('category:');
    expect(text).toContain('"functional"');
    expect(text).toContain('steps.0:');
  });

  it('calls a failure at the top level the root', () => {
    const result = z.object({}).safeParse('text');

    expect(formatSchemaIssues(result.error as z.ZodError)).toMatch(/^\(root\): /u);
  });
});

describe('parseInlineContent', () => {
  const schema = z.object({ category: z.enum(['functional', 'ui']) });

  it('returns the parsed content', () => {
    expect(parseInlineContent(schema, { category: 'ui' }, { code: 'X_INVALID', subject: 'draft' })).toEqual({
      category: 'ui',
    });
  });

  it('throws a coded error that names the invalid field', () => {
    expect(() =>
      parseInlineContent(schema, { category: 'bug' }, { code: 'X_INVALID', subject: 'draft' }),
    ).toThrow(
      expect.objectContaining({
        code: 'X_INVALID',
        message: 'The draft does not match its schema',
        remediation: expect.stringContaining('category:') as unknown,
      }),
    );
  });
});
