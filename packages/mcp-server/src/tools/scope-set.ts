// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runScopeSet } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  requirementIds: z
    .array(z.string())
    .min(1)
    .describe('Ids of the requirements to move, as qa.scope reported them (the slug of each heading).'),
  inScope: z.boolean().describe('false takes the requirements out of scope; true puts them back into scope.'),
});

const OutputSchema = z.object({
  scopePath: z.string(),
  changed: z.number(),
  inScopeCount: z.number(),
  outOfScopeCount: z.number(),
});

/**
 * `qa.scope_set`: the same `runScopeSet` core call `qa scope set` uses. It is the only way to take a
 * requirement out of scope, because the artifact is the engine's and must not be edited by hand.
 */
export const scopeSetTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.scope_set',
  description:
    'Takes requirements out of scope (inScope false) or puts them back (inScope true) in ' +
    'artifacts/scope.json. Use it when the operator drops a requirement, or when qa.scope reports ' +
    'one as orphaned. Out-of-scope requirements stay in the file but are left out of coverage and ' +
    'traceability. Changing the scope reopens an approved scope gate, because the approval is bound ' +
    'to the artifact hash. Fails with SCOPE_NOT_FOUND before qa.scope has run and with ' +
    'SCOPE_REQUIREMENT_NOT_FOUND for an unknown id; a call that changes nothing writes nothing. ' +
    "Only call it on the operator's decision, never to decide scope yourself.",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runScopeSet(createNodeEngineContext(), {
      requirementIds: input.requirementIds,
      inScope: input.inScope,
    }),
};
