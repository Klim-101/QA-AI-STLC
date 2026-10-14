// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runConfigAddApiAuthProfile } from '@qa-ai-stlc/core';
import { ApiAuthProfileSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  name: z
    .string()
    .describe('The profile name a spec or qa.http_execute refers to, for example "staging-api".'),
  profile: ApiAuthProfileSchema.describe(
    'How the API call authenticates. Every secret is the NAME of a QA_-prefixed environment variable, never its value. ' +
      'A from-browser profile names where the token is read from; qa.browser_discover_api_auth proposes one.',
  ),
  defaultForEnvironment: z
    .string()
    .optional()
    .describe('Make this the profile that environment’s API calls use when none is named.'),
  force: z.boolean().optional().describe('Overwrite an existing profile of the same name.'),
});

const OutputSchema = z.object({
  name: z.string(),
  profile: ApiAuthProfileSchema,
  defaultForEnvironment: z.string().optional(),
});

/**
 * `qa.config_add_api_auth` (P6-93): the same `runConfigAddApiAuthProfile` core call the CLI uses,
 * writing only the project's committed `.qa/config.yaml`. The profile carries variable names and
 * token locations, never a token.
 */
export const configAddApiAuthTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.config_add_api_auth',
  description:
    'Adds an apiAuth profile (and optionally an environment’s default profile) to the project ' +
    '.qa/config.yaml, so the operator never edits YAML. Pass only variable names and token ' +
    'locations: a secret is the NAME of a QA_ environment variable the operator sets themselves, ' +
    'and a from-browser profile names a cookie, storage key or header, never a token. After ' +
    'signing in, qa.browser_discover_api_auth proposes a from-browser profile to pass here. An ' +
    'existing name is rejected unless force is true.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runConfigAddApiAuthProfile(createNodeEngineContext(), {
      name: input.name,
      profile: input.profile,
      ...(input.defaultForEnvironment !== undefined
        ? { defaultForEnvironment: input.defaultForEnvironment }
        : {}),
      ...(input.force !== undefined ? { force: input.force } : {}),
    });
    return result;
  },
};
