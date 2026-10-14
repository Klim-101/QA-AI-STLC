// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runConfigAddApiAuthProfile } from './config-add-api-auth.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

const BASE_CONFIG = [
  'schemaVersion: 1',
  '# A comment worth preserving.',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function fakeContext(config: string = BASE_CONFIG): EngineContext {
  return createFakeEngineContext({
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({ [join(QA_DIR, 'config.yaml')]: config }),
  });
}

interface ParsedConfig {
  apiAuth: { profiles: Record<string, unknown>; defaults: Record<string, string> };
}

async function readRaw(context: EngineContext): Promise<string> {
  return context.fs.readFile(join(QA_DIR, 'config.yaml'));
}

const FROM_BROWSER = {
  type: 'from-browser',
  source: { kind: 'local-storage', key: 'auth', jsonPath: 'token' },
};

async function failureOf(promise: Promise<unknown>): Promise<{ code: string; remediation?: string }> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return error as { code: string; remediation?: string };
}

describe('runConfigAddApiAuthProfile', () => {
  it('adds a profile and an environment default, keeping the rest of the file', async () => {
    const context = fakeContext();

    const result = await runConfigAddApiAuthProfile(context, {
      name: 'staging-api',
      profile: FROM_BROWSER,
      defaultForEnvironment: 'staging',
    });

    expect(result).toEqual({
      name: 'staging-api',
      profile: FROM_BROWSER,
      defaultForEnvironment: 'staging',
    });
    const raw = await readRaw(context);
    const written = parseYaml(raw) as ParsedConfig;
    expect(written.apiAuth.profiles['staging-api']).toEqual(FROM_BROWSER);
    expect(written.apiAuth.defaults).toEqual({ staging: 'staging-api' });
    expect(raw).toContain('# A comment worth preserving.');
  });

  it('adds a profile without touching the defaults', async () => {
    const context = fakeContext();

    const result = await runConfigAddApiAuthProfile(context, {
      name: 'service',
      profile: { type: 'bearer', tokenVariable: 'QA_SERVICE_TOKEN' },
    });

    expect(result).not.toHaveProperty('defaultForEnvironment');
    const written = parseYaml(await readRaw(context)) as ParsedConfig;
    expect(written.apiAuth.profiles.service).toEqual({ type: 'bearer', tokenVariable: 'QA_SERVICE_TOKEN' });
    expect(written.apiAuth.defaults).toBeUndefined();
  });

  it('fills the default header of a request-header source', async () => {
    const context = fakeContext();

    const result = await runConfigAddApiAuthProfile(context, {
      name: 'header',
      profile: { type: 'from-browser', source: { kind: 'request-header' } },
    });

    expect(result.profile).toEqual({
      type: 'from-browser',
      source: { kind: 'request-header', header: 'Authorization' },
    });
  });

  it('refuses a literal secret where a variable name is expected, without echoing it', async () => {
    const context = fakeContext();

    const error = await failureOf(
      runConfigAddApiAuthProfile(context, {
        name: 'service',
        profile: { type: 'bearer', tokenVariable: 'a-literal-token-value' },
      }),
    );

    expect(error.code).toBe('CONFIG_ADD_VALUE_INVALID');
    expect(await readRaw(context)).not.toContain('a-literal-token-value');
  });

  it('refuses an unknown profile type', async () => {
    const error = await failureOf(
      runConfigAddApiAuthProfile(fakeContext(), { name: 'x', profile: { type: 'magic' } }),
    );

    expect(error.code).toBe('CONFIG_ADD_VALUE_INVALID');
  });

  it('refuses a blank name', async () => {
    const error = await failureOf(
      runConfigAddApiAuthProfile(fakeContext(), { name: '  ', profile: { type: 'none' } }),
    );

    expect(error.code).toBe('CONFIG_ADD_NAME_INVALID');
  });

  it('refuses an existing name unless forced', async () => {
    const context = fakeContext();
    await runConfigAddApiAuthProfile(context, { name: 'service', profile: { type: 'none' } });

    const error = await failureOf(
      runConfigAddApiAuthProfile(context, {
        name: 'service',
        profile: { type: 'bearer', tokenVariable: 'QA_SERVICE_TOKEN' },
      }),
    );
    await runConfigAddApiAuthProfile(context, {
      name: 'service',
      profile: { type: 'bearer', tokenVariable: 'QA_SERVICE_TOKEN' },
      force: true,
    });

    expect(error.code).toBe('CONFIG_ADD_NAME_EXISTS');
    const written = parseYaml(await readRaw(context)) as ParsedConfig;
    expect(written.apiAuth.profiles.service).toEqual({ type: 'bearer', tokenVariable: 'QA_SERVICE_TOKEN' });
  });

  it('refuses a default for an environment the project does not have, naming the ones it has', async () => {
    const error = await failureOf(
      runConfigAddApiAuthProfile(fakeContext(), {
        name: 'service',
        profile: { type: 'none' },
        defaultForEnvironment: 'prod',
      }),
    );

    expect(error.code).toBe('CONFIG_ADD_VALUE_INVALID');
    expect(error.remediation).toContain('staging');
  });

  it('says so when the project has no environment at all', async () => {
    const context = fakeContext(
      BASE_CONFIG.replace(/environments:\n {2}staging:.*\n/u, 'environments: {}\n'),
    );

    const error = await failureOf(
      runConfigAddApiAuthProfile(context, {
        name: 'service',
        profile: { type: 'none' },
        defaultForEnvironment: 'prod',
      }),
    );

    expect(error.remediation).toContain('(none configured)');
  });
});
