// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ApiAuthProfileSchema, type ApiAuthProfile } from '@qa-ai-stlc/schemas';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { loadCommittedConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';

export interface ConfigAddApiAuthProfileOptions {
  readonly name: string;
  /** Validated here against `ApiAuthProfileSchema`; every secret in it is the NAME of a `QA_*` variable. */
  readonly profile: unknown;
  /** Makes this the profile the environment's API calls use when the caller names none. */
  readonly defaultForEnvironment?: string;
  readonly force?: boolean;
}

export interface ConfigAddApiAuthProfileResult {
  readonly name: string;
  readonly profile: ApiAuthProfile;
  readonly defaultForEnvironment?: string;
}

/**
 * `qa.config_add_api_auth` (P6-93): adds one `apiAuth` profile, and optionally an environment's
 * default, to the committed `config.yaml` without hand-editing YAML. Same technique as
 * `runConfigAddIdentity`. The profile schema holds only variable names and token locations, so no
 * token or secret value can be written; a literal one fails the `QA_` name pattern. `apiAuth` is a
 * committed-only section (ADR-011), so it is never written to the local layer.
 */
export async function runConfigAddApiAuthProfile(
  context: EngineContext,
  options: ConfigAddApiAuthProfileOptions,
): Promise<ConfigAddApiAuthProfileResult> {
  if (options.name.trim().length === 0) {
    throw new QaError('CONFIG_ADD_NAME_INVALID', 'A profile name is required', {
      remediation: 'Pass a non-empty name, for example "staging" or "admin-api".',
    });
  }
  const parsed = ApiAuthProfileSchema.safeParse(options.profile);
  if (!parsed.success) {
    throw new QaError(
      'CONFIG_ADD_VALUE_INVALID',
      `The apiAuth profile is not valid:\n${z.prettifyError(parsed.error)}`,
      {
        remediation:
          'Pass a profile of a known type. Every secret is the name of a QA_-prefixed environment variable, never its value; a from-browser profile names where the token is read from.',
        cause: parsed.error,
      },
    );
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadCommittedConfig(store);
  if (options.force !== true && options.name in config.apiAuth.profiles) {
    throw new QaError('CONFIG_ADD_NAME_EXISTS', `API auth profile "${options.name}" already exists`, {
      remediation: 'Choose a different name, or pass force to overwrite it.',
    });
  }
  const { defaultForEnvironment } = options;
  if (defaultForEnvironment !== undefined && !(defaultForEnvironment in config.environments)) {
    throw new QaError(
      'CONFIG_ADD_VALUE_INVALID',
      `"${defaultForEnvironment}" is not a configured environment`,
      { remediation: `Use one of: ${Object.keys(config.environments).join(', ') || '(none configured)'}.` },
    );
  }

  // `parsed.data` satisfies the schema `ConfigSchema` embeds, and the default names a profile
  // written in the same edit, so the document stays valid.
  const document = parseDocument(await store.readText('config.yaml'));
  document.setIn(['apiAuth', 'profiles', options.name], parsed.data);
  if (defaultForEnvironment !== undefined) {
    document.setIn(['apiAuth', 'defaults', defaultForEnvironment], options.name);
  }
  await store.writeText('config.yaml', document.toString());
  return {
    name: options.name,
    profile: parsed.data,
    ...(defaultForEnvironment === undefined ? {} : { defaultForEnvironment }),
  };
}
