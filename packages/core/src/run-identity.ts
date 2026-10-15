// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config, EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';
import type { Runner } from './runner.js';

/**
 * The identity a run signs in as: the one the caller named, else the environment's own default,
 * else none. A runner that never opens a browser page (`signsIn` unset) gets none, so a run record
 * never claims a sign-in that did not happen.
 */
export function resolveRunIdentity(
  config: Config,
  environment: EnvironmentConfig,
  runner: Runner,
  requestedIdentity: string | undefined,
): string | undefined {
  if (runner.signsIn !== true) {
    return undefined;
  }
  const identity = requestedIdentity ?? environment.identity;
  if (identity === undefined) {
    return undefined;
  }
  if (!(identity in config.identities)) {
    throw new QaError('RUN_IDENTITY_UNKNOWN', `No identity named "${identity}" in config.yaml`, {
      remediation: `Use one of: ${Object.keys(config.identities).join(', ') || '(none configured)'}.`,
    });
  }
  return identity;
}

/**
 * The identity handed to a runner as `RunnerInput.identity`: the recorded one, plus the identity a
 * runner that never opens a page reads a credential through (`readsIdentity`). The run record keeps
 * `resolveRunIdentity`'s answer, so it never claims a browser sign-in an API run did not make.
 */
export function resolveRunnerInputIdentity(
  config: Config,
  environment: EnvironmentConfig,
  runner: Runner,
  requestedIdentity: string | undefined,
): string | undefined {
  if (runner.readsIdentity !== true) {
    return resolveRunIdentity(config, environment, runner, requestedIdentity);
  }
  return resolveRunIdentity(config, environment, { ...runner, signsIn: true }, requestedIdentity);
}
