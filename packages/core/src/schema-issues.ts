// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';
import { QaError } from './errors.js';

/**
 * One line per schema issue: the path of the invalid field and what is wrong with it. Zod's message
 * for a closed set of values already lists the allowed ones, so an agent can correct a draft without
 * reading the schema package.
 */
export function formatSchemaIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Validates content an agent passed inline instead of as a file. A failure is a `QaError` whose
 * remediation names every invalid field, so the caller never has to read the schema package.
 */
export function parseInlineContent<Schema extends z.ZodType>(
  schema: Schema,
  content: unknown,
  failure: { readonly code: string; readonly subject: string },
): z.infer<Schema> {
  const result = schema.safeParse(content);
  if (!result.success) {
    throw new QaError(failure.code, `The ${failure.subject} does not match its schema`, {
      remediation: formatSchemaIssues(result.error),
      cause: result.error,
    });
  }
  return result.data;
}
