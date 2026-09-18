// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, QaStore, loadConfig } from '@qa-ai-stlc/core';
import {
  EnvironmentConfigSchema,
  IdentityConfigSchema,
  type EnvironmentConfig,
  type IdentityConfig,
} from '@qa-ai-stlc/schemas';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import type { CommandContext } from '../command-context.js';

export interface ConfigAddEnvironmentOptions {
  readonly name: string;
  readonly baseUrl: string;
  readonly allowlist: readonly string[];
  readonly force?: boolean;
}

export interface ConfigAddEnvironmentResult {
  readonly name: string;
  readonly environment: EnvironmentConfig;
}

export interface ConfigAddIdentityOptions {
  readonly name: string;
  readonly auth: string;
  readonly secret: string;
  readonly loginUrl?: string;
  readonly username?: string;
  readonly force?: boolean;
}

export interface ConfigAddIdentityResult {
  readonly name: string;
  readonly identity: IdentityConfig;
}

function requireName(name: string): string {
  if (name.trim().length === 0) {
    throw new QaError('CONFIG_ADD_NAME_INVALID', 'A name is required', {
      remediation: 'Pass a non-empty name, for example "staging" or "admin".',
    });
  }
  return name;
}

/**
 * `qa config add environment <name> --base-url <url> --allowlist <a,b,c>` (P1-20): adds one
 * environment to `config.yaml` without hand-editing YAML. Validates against
 * `EnvironmentConfigSchema` before writing anything, and edits the parsed document in place
 * (same technique as `qa config set`) so existing comments and formatting survive.
 */
export async function runConfigAddEnvironment(
  context: CommandContext,
  options: ConfigAddEnvironmentOptions,
): Promise<ConfigAddEnvironmentResult> {
  const name = requireName(options.name);
  const parsed = EnvironmentConfigSchema.safeParse({
    baseUrl: options.baseUrl,
    allowlist: options.allowlist,
  });
  if (!parsed.success) {
    throw new QaError(
      'CONFIG_ADD_VALUE_INVALID',
      `The environment is not valid:\n${z.prettifyError(parsed.error)}`,
      {
        remediation: 'Provide a non-empty --base-url and at least one --allowlist entry.',
        cause: parsed.error,
      },
    );
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  // Throws a coded QaError (CONFIG_MISSING/CONFIG_MALFORMED/CONFIG_INVALID) if there is nothing
  // valid to edit yet, rather than this command producing its own, differently-worded one.
  const config = await loadConfig(store);
  if (options.force !== true && name in config.environments) {
    throw new QaError('CONFIG_ADD_NAME_EXISTS', `Environment "${name}" already exists`, {
      remediation: 'Choose a different name, or pass --force to overwrite it.',
    });
  }

  // `parsed.data` already satisfies EnvironmentConfigSchema, the same schema ConfigSchema embeds
  // for every `environments` entry, and every other field in the loaded document already passed
  // ConfigSchema in `loadConfig` above — so, unlike `qa config set` (whose testing/api fields
  // interact through a cross-field refine), adding this entry cannot leave the document invalid;
  // there is no further validation step here.
  const raw = await store.readText('config.yaml');
  const document = parseDocument(raw);
  document.setIn(['environments', name], parsed.data);
  await store.writeText('config.yaml', document.toString());
  return { name, environment: parsed.data };
}

/**
 * `qa config add identity <name> --auth <cdp-attach|storage-state> --secret <QA_...> [--login-url
 * <url>] [--username <user>]` (P1-20): same technique as `runConfigAddEnvironment`, validated
 * against `IdentityConfigSchema` — which itself requires `loginUrl`/`username` when
 * `auth: storage-state` — before writing.
 */
export async function runConfigAddIdentity(
  context: CommandContext,
  options: ConfigAddIdentityOptions,
): Promise<ConfigAddIdentityResult> {
  const name = requireName(options.name);
  const parsed = IdentityConfigSchema.safeParse({
    auth: options.auth,
    secret: options.secret,
    ...(options.loginUrl !== undefined ? { loginUrl: options.loginUrl } : {}),
    ...(options.username !== undefined ? { username: options.username } : {}),
  });
  if (!parsed.success) {
    throw new QaError(
      'CONFIG_ADD_VALUE_INVALID',
      `The identity is not valid:\n${z.prettifyError(parsed.error)}`,
      {
        remediation:
          'Provide --auth (cdp-attach or storage-state), --secret (a QA_-prefixed environment variable name), and, for storage-state, --login-url and --username.',
        cause: parsed.error,
      },
    );
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadConfig(store);
  if (options.force !== true && name in config.identities) {
    throw new QaError('CONFIG_ADD_NAME_EXISTS', `Identity "${name}" already exists`, {
      remediation: 'Choose a different name, or pass --force to overwrite it.',
    });
  }

  // Same reasoning as runConfigAddEnvironment above: parsed.data already satisfies
  // IdentityConfigSchema, so re-validating the whole document cannot fail.
  const raw = await store.readText('config.yaml');
  const document = parseDocument(raw);
  document.setIn(['identities', name], parsed.data);
  await store.writeText('config.yaml', document.toString());
  return { name, identity: parsed.data };
}
