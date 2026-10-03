// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserUpload } from '@qa-ai-stlc/core';
import { BrowserUploadedFileSchema, EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  ELEMENT_TARGET_FIELDS,
  NOTICES_OUTPUT_FIELD,
  SessionIdInputSchema,
  toBrowserOperationContext,
  toElementTarget,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  ...ELEMENT_TARGET_FIELDS,
  paths: z
    .array(z.string())
    .describe(
      'Project-relative paths with forward slashes, 1 to 10 files. Nothing outside the project root, and nothing under .qa/ or .git/, is accepted.',
    ),
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this upload performs, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  selector: z.string(),
  files: z
    .array(BrowserUploadedFileSchema)
    .describe('Name, size and SHA-256 of each file sent; never its content.'),
  url: z.string(),
  evidence: EvidenceSchema,
  ...NOTICES_OUTPUT_FIELD,
});

/** `qa.browser_upload` (P6-60): sets project files on a file input and records name, size and hash. */
export function createBrowserUploadTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_upload',
    description:
      'Sets files on a file input (by `selector` or a snapshot `ref`) from project-relative ' +
      '`paths`, then reads the input back and records the name, size and hash of each file as ' +
      'evidence, never its content. Use for a step that attaches a file. Each file is scanned for ' +
      'secrets before it is sent. Errors: BROWSER_UPLOAD_PATH_INVALID (outside the project, a ' +
      'symbolic link out of it, or under .qa/ or .git/), BROWSER_UPLOAD_FILE_MISSING, ' +
      'BROWSER_UPLOAD_SECRET (the file matched a secret pattern), BROWSER_UPLOAD_TOO_LARGE (over ' +
      '10 MB), BROWSER_UPLOAD_NOT_APPLIED (the page did not end up holding the files; nothing is ' +
      'recorded). Safe mode still blocks any non-GET request the page makes with the file.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserUpload(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        paths: input.paths,
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
