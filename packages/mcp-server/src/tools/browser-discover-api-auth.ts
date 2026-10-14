// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserDiscoverApiAuth } from '@qa-ai-stlc/core';
import { ApiAuthProfileSchema, BrowserTokenSourceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema;

const OutputSchema = z.object({
  sessionId: z.string(),
  tokenHeader: z.string().describe('The request header the application sends its token in.'),
  sources: z
    .array(BrowserTokenSourceSchema)
    .describe('Where the same token is stored in the session, most robust first, then the header itself.'),
  proposedProfile: ApiAuthProfileSchema.describe('The from-browser profile for the first source.'),
});

/** `qa.browser_discover_api_auth` (P6-93): where the signed-in application keeps its API token, as names only. */
export function createBrowserDiscoverApiAuthTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_discover_api_auth',
    description:
      'After signing in (qa.browser_open with an identity, or qa.browser_attach) and opening a page ' +
      'that calls the application API, reports which request header carries the bearer token and ' +
      'which cookie, localStorage or sessionStorage key holds the same token, as names only: a ' +
      'token value is never returned. Returns a proposedProfile to pass to qa.config_add_api_auth. ' +
      'Requests are observed only while the session is open. Fails with API_AUTH_DISCOVERY_NO_TOKEN ' +
      'when no request carried a bearer token yet.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    async handler(input) {
      const result = await runBrowserDiscoverApiAuth(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
      });
      return { ...result, sources: [...result.sources] };
    },
  };
}
