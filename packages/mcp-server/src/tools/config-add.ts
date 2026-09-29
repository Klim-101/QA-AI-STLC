// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, runConfigAddEnvironment, runConfigAddIdentity } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  kind: z.enum(['environment', 'identity']).describe('What to add.'),
  name: z.string().describe('The environment or identity name, for example "staging" or "admin".'),
  baseUrl: z.string().optional().describe('environment: the application base URL.'),
  allowlist: z
    .array(z.string())
    .optional()
    .describe('environment: hosts the browser and HTTP calls may reach.'),
  auth: z.string().optional().describe('identity: "cdp-attach" or "storage-state".'),
  secret: z
    .string()
    .optional()
    .describe(
      'identity: the NAME of a QA_-prefixed environment variable holding the credential, never its value.',
    ),
  loginUrl: z.string().optional().describe('identity with storage-state: the sign-in page.'),
  username: z.string().optional().describe('identity with storage-state: the account name.'),
  force: z.boolean().optional().describe('Overwrite an existing entry of the same name.'),
});

const OutputSchema = z.object({
  kind: z.enum(['environment', 'identity']),
  name: z.string(),
});

function requireField<TValue>(value: TValue | undefined, field: string, kind: string): TValue {
  if (value === undefined) {
    throw new QaError('CONFIG_ADD_VALUE_INVALID', `${field} is required to add an ${kind}`, {
      remediation: `Pass ${field}.`,
    });
  }
  return value;
}

/**
 * `qa.config_add` (P6-48): the same `runConfigAddEnvironment`/`runConfigAddIdentity` core calls
 * `qa config add` uses, writing only the resolved project's committed `.qa/config.yaml`. An
 * identity carries the name of a `QA_*` variable, never a credential value.
 */
export const configAddTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.config_add',
  description:
    'Adds an environment (baseUrl and allowlist) or an identity (auth, and the NAME of a QA_ ' +
    'environment variable holding its credential) to the project .qa/config.yaml. Never pass a ' +
    'password or token: pass only the variable name and ask the operator to set the variable ' +
    'themselves. An existing name is rejected unless force is true.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const context = createNodeEngineContext();
    const force = input.force === true;
    if (input.kind === 'environment') {
      await runConfigAddEnvironment(context, {
        name: input.name,
        baseUrl: requireField(input.baseUrl, 'baseUrl', 'environment'),
        allowlist: requireField(input.allowlist, 'allowlist', 'environment'),
        force,
      });
    } else {
      await runConfigAddIdentity(context, {
        name: input.name,
        auth: requireField(input.auth, 'auth', 'identity'),
        secret: requireField(input.secret, 'secret', 'identity'),
        ...(input.loginUrl !== undefined ? { loginUrl: input.loginUrl } : {}),
        ...(input.username !== undefined ? { username: input.username } : {}),
        force,
      });
    }
    return { kind: input.kind, name: input.name };
  },
};
