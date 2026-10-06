// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '../errors.js';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { runConfigAddEnvironment, runConfigAddIdentity } from './config-add.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

const BASE_CONFIG = [
  'schemaVersion: 1',
  '# A comment worth preserving.',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return createFakeEngineContext({
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({ [join(QA_DIR, 'config.yaml')]: BASE_CONFIG, ...files }),
    env: {},
  });
}

interface ParsedConfig {
  environments: Record<string, { baseUrl: string; allowlist: string[] }>;
  identities: Record<string, { auth: string; secret: string; loginUrl?: string; username?: string }>;
}

async function readConfig(context: EngineContext): Promise<ParsedConfig> {
  return parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as ParsedConfig;
}

describe('runConfigAddEnvironment', () => {
  it('adds a new environment and writes it back', async () => {
    const context = fakeContext();

    const result = await runConfigAddEnvironment(context, {
      name: 'staging',
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
    });

    expect(result).toEqual({
      name: 'staging',
      environment: { baseUrl: 'https://staging.example.com', allowlist: ['staging.example.com'] },
    });
    const written = await readConfig(context);
    expect(written.environments.staging).toEqual({
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
    });
  });

  it('preserves comments and the rest of the file', async () => {
    const context = fakeContext();

    await runConfigAddEnvironment(context, {
      name: 'staging',
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
    });

    const raw = await context.fs.readFile(join(QA_DIR, 'config.yaml'));
    expect(raw).toContain('# A comment worth preserving.');
  });

  it('rejects an empty name', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddEnvironment(context, { name: '  ', baseUrl: 'https://a.example.com', allowlist: ['a'] }),
    ).rejects.toThrow(QaError);
  });

  it('rejects an empty allowlist', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddEnvironment(context, { name: 'staging', baseUrl: 'https://a.example.com', allowlist: [] }),
    ).rejects.toThrow(QaError);
  });

  it('rejects an empty baseUrl', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddEnvironment(context, { name: 'staging', baseUrl: '', allowlist: ['a'] }),
    ).rejects.toThrow(QaError);
  });

  it('refuses to overwrite an existing environment without --force', async () => {
    const withEnv = BASE_CONFIG.replace(
      'environments: {}',
      'environments: { staging: { baseUrl: "https://old.example.com", allowlist: ["old.example.com"] } }',
    );
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: withEnv });

    await expect(
      runConfigAddEnvironment(context, {
        name: 'staging',
        baseUrl: 'https://new.example.com',
        allowlist: ['new.example.com'],
      }),
    ).rejects.toThrow(QaError);
  });

  it('overwrites an existing environment with --force', async () => {
    const withEnv = BASE_CONFIG.replace(
      'environments: {}',
      'environments: { staging: { baseUrl: "https://old.example.com", allowlist: ["old.example.com"] } }',
    );
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: withEnv });

    const result = await runConfigAddEnvironment(context, {
      name: 'staging',
      baseUrl: 'https://new.example.com',
      allowlist: ['new.example.com'],
      force: true,
    });

    expect(result.environment.baseUrl).toBe('https://new.example.com');
  });

  it('throws a coded error when config.yaml does not exist yet', async () => {
    const context = createFakeEngineContext({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem(),
      env: {},
    });

    await expect(
      runConfigAddEnvironment(context, {
        name: 'staging',
        baseUrl: 'https://a.example.com',
        allowlist: ['a'],
      }),
    ).rejects.toThrow(QaError);
  });

  it('writes the safe non-GET requests it is given, validated by the schema (ADR-0014)', async () => {
    const context = fakeContext();
    const request = { method: 'POST', path: '/auth/refresh-token', reason: 'Exchanges the refresh cookie.' };

    const result = await runConfigAddEnvironment(context, {
      name: 'staging',
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
      safeNonGetRequests: [request],
    });

    expect(result.environment.safeNonGetRequests).toEqual([request]);
    expect((await readConfig(context)).environments.staging).toMatchObject({ safeNonGetRequests: [request] });
  });

  it('writes no list for an empty one', async () => {
    const context = fakeContext();

    const result = await runConfigAddEnvironment(context, {
      name: 'staging',
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
      safeNonGetRequests: [],
    });

    expect(result.environment.safeNonGetRequests).toBeUndefined();
  });

  it.each([
    ['a method other than POST', { method: 'DELETE', path: '/api/orders/1', reason: 'Removes an order.' }],
    ['a pattern', { method: 'POST', path: '/api/*', reason: 'Everything under the API.' }],
    ['no reason', { method: 'POST', path: '/api/x', reason: '' }],
  ])('rejects %s and writes nothing', async (_label, request) => {
    const context = fakeContext();

    await expect(
      runConfigAddEnvironment(context, {
        name: 'staging',
        baseUrl: 'https://staging.example.com',
        allowlist: ['staging.example.com'],
        safeNonGetRequests: [request],
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_ADD_VALUE_INVALID' });

    expect(Object.keys((await readConfig(context)).environments)).toEqual([]);
  });
});

describe('runConfigAddIdentity', () => {
  it('adds a cdp-attach identity, which needs no loginUrl/username', async () => {
    const context = fakeContext();

    const result = await runConfigAddIdentity(context, {
      name: 'admin',
      auth: 'cdp-attach',
      secret: 'QA_ADMIN_PASSWORD',
    });

    expect(result).toEqual({ name: 'admin', identity: { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' } });
    const written = await readConfig(context);
    expect(written.identities.admin).toEqual({ auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' });
  });

  it('adds a storage-state identity with loginUrl and username', async () => {
    const context = fakeContext();

    const result = await runConfigAddIdentity(context, {
      name: 'admin',
      auth: 'storage-state',
      secret: 'QA_ADMIN_PASSWORD',
      loginUrl: 'https://staging.example.com/login',
      username: 'admin@example.com',
    });

    expect(result.identity).toEqual({
      auth: 'storage-state',
      secret: 'QA_ADMIN_PASSWORD',
      loginUrl: 'https://staging.example.com/login',
      username: 'admin@example.com',
    });
  });

  it('rejects storage-state auth with no loginUrl', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddIdentity(context, {
        name: 'admin',
        auth: 'storage-state',
        secret: 'QA_ADMIN_PASSWORD',
        username: 'admin@example.com',
      }),
    ).rejects.toThrow(QaError);
  });

  it('rejects storage-state auth with no username', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddIdentity(context, {
        name: 'admin',
        auth: 'storage-state',
        secret: 'QA_ADMIN_PASSWORD',
        loginUrl: 'https://staging.example.com/login',
      }),
    ).rejects.toThrow(QaError);
  });

  it('rejects a secret not prefixed with QA_', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddIdentity(context, { name: 'admin', auth: 'cdp-attach', secret: 'ADMIN_PASSWORD' }),
    ).rejects.toThrow(QaError);
  });

  it('rejects an invalid auth value', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddIdentity(context, { name: 'admin', auth: 'password', secret: 'QA_ADMIN_PASSWORD' }),
    ).rejects.toThrow(QaError);
  });

  it('rejects an empty name', async () => {
    const context = fakeContext();

    await expect(
      runConfigAddIdentity(context, { name: '', auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' }),
    ).rejects.toThrow(QaError);
  });

  it('refuses to overwrite an existing identity without --force', async () => {
    const withIdentity = BASE_CONFIG.replace(
      'identities: {}',
      'identities: { admin: { auth: "cdp-attach", secret: "QA_OLD" } }',
    );
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: withIdentity });

    await expect(
      runConfigAddIdentity(context, { name: 'admin', auth: 'cdp-attach', secret: 'QA_NEW' }),
    ).rejects.toThrow(QaError);
  });

  it('overwrites an existing identity with --force', async () => {
    const withIdentity = BASE_CONFIG.replace(
      'identities: {}',
      'identities: { admin: { auth: "cdp-attach", secret: "QA_OLD" } }',
    );
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: withIdentity });

    const result = await runConfigAddIdentity(context, {
      name: 'admin',
      auth: 'cdp-attach',
      secret: 'QA_NEW',
      force: true,
    });

    expect(result.identity.secret).toBe('QA_NEW');
  });

  it('throws a coded error when config.yaml does not exist yet', async () => {
    const context = createFakeEngineContext({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem(),
      env: {},
    });

    await expect(
      runConfigAddIdentity(context, { name: 'admin', auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' }),
    ).rejects.toThrow(QaError);
  });
});
