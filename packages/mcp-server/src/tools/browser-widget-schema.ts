// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { SessionIdInputSchema } from './browser-dependencies.js';

/** The input every widget action shares: which session, which widget, which case step. */
export const WidgetActionInputSchema = SessionIdInputSchema.extend({
  selector: z
    .string()
    .describe(
      "A Playwright selector for the widget's wrapper, the element the registry holds for it (not an inner input or button).",
    ),
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this action performs, when executing a registered case.",
    ),
});

export const WidgetActionOutputSchema = z.object({
  sessionId: z.string(),
  selector: z.string(),
  url: z.string(),
  evidence: EvidenceSchema,
});
