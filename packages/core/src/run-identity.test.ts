// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ConfigSchema, type Config } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import { resolveRunIdentity } from './run-identity.js';
import type { Runner } from './runner.js';

const IDENTITY = {
  auth: 'storage-state',
  secret: 'QA_TESTER_PASSWORD',
  loginUrl: 'https://staging.example.test/login',
  username: 'tester@example.test',
};

function buildConfig(options: {
  readonly environmentIdentity?: string;
  readonly hasIdentities?: boolean;
}): Config {
  return ConfigSchema.parse({
    testing: { e2e: 'undecided', api: 'undecided', a11y: 'undecided', security: 'undecided' },
    environments: {
      staging: {
        baseUrl: 'https://staging.example.test/',
        allowlist: ['staging.example.test'],
        ...(options.environmentIdentity === undefined ? {} : { identity: options.environmentIdentity }),
      },
    },
    identities: options.hasIdentities === false ? {} : { tester: IDENTITY, admin: IDENTITY },
    data: { strategy: 'manual', ownerMarker: 'qa-ai-stlc' },
    selectors: { policy: 'playwright-default', testIdAttribute: 'data-testid' },
    agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 },
  });
}

const browserRunner: Runner = { testType: 'e2e', signsIn: true, run: () => Promise.resolve([]) };
const apiOnlyRunner: Runner = { testType: 'api', run: () => Promise.resolve([]) };

function resolve(config: Config, runner: Runner, requested?: string): string | undefined {
  const environment = config.environments.staging;
  if (environment === undefined) {
    throw new Error('test config has no staging environment');
  }
  return resolveRunIdentity(config, environment, runner, requested);
}

function failureOf(action: () => unknown): QaError {
  try {
    action();
  } catch (caught) {
    expect(caught).toBeInstanceOf(QaError);
    return caught as QaError;
  }
  throw new Error('expected the call to throw');
}

describe('resolveRunIdentity', () => {
  it("defaults to the environment's identity", () => {
    expect(resolve(buildConfig({ environmentIdentity: 'tester' }), browserRunner)).toBe('tester');
  });

  it('prefers the identity the run names over the environment default', () => {
    expect(resolve(buildConfig({ environmentIdentity: 'tester' }), browserRunner, 'admin')).toBe('admin');
  });

  it('is anonymous when neither the run nor the environment names one', () => {
    expect(resolve(buildConfig({}), browserRunner)).toBeUndefined();
  });

  it('is anonymous for a runner that opens no browser page, even when one is named', () => {
    expect(resolve(buildConfig({ environmentIdentity: 'tester' }), apiOnlyRunner, 'admin')).toBeUndefined();
  });

  it('rejects an identity the configuration does not define, naming the ones it does', () => {
    const error = failureOf(() => resolve(buildConfig({}), browserRunner, 'ghost'));

    expect(error.code).toBe('RUN_IDENTITY_UNKNOWN');
    expect(error.remediation).toContain('tester, admin');
  });

  it('says so when the configuration defines no identity at all', () => {
    const error = failureOf(() => resolve(buildConfig({ hasIdentities: false }), browserRunner, 'ghost'));

    expect(error.remediation).toContain('(none configured)');
  });
});
