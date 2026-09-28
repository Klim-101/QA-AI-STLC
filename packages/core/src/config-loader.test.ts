// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCommittedConfig, loadConfig, loadLayeredConfig, type ConfigSource } from './config-loader.js';
import { QaError } from './errors.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

const VALID_CONFIG_YAML = `
testing:
  e2e: in-scope
  api: out-of-scope
  a11y: undecided
  security: undecided
environments:
  staging:
    baseUrl: https://staging.example.com
    allowlist: [staging.example.com]
identities:
  admin:
    auth: cdp-attach
    secret: QA_ADMIN_PASSWORD
data:
  strategy: disposable
  ownerMarker: qa-\${runId}
selectors:
  policy: testid-first
  testIdAttribute: data-testid
agents:
  parallelism: 4
  spokeTimeoutSeconds: 300
  retries: 2
`;

const PROJECT_ROOT = join('project');
const COMMITTED_PATH = join(PROJECT_ROOT, '.qa', 'config.yaml');
const DEFAULT_LOCAL_PATH = join(PROJECT_ROOT, '.qa', 'config.local.yaml');

interface SourceFiles {
  readonly committed?: string;
  readonly local?: string;
  readonly extra?: Readonly<Record<string, string>>;
}

function createSource(files: SourceFiles, env: ConfigSource['env'] = {}): ConfigSource {
  return {
    projectRoot: PROJECT_ROOT,
    env,
    fs: createFakeFileSystem({
      ...(files.committed === undefined ? {} : { [COMMITTED_PATH]: files.committed }),
      ...(files.local === undefined ? {} : { [DEFAULT_LOCAL_PATH]: files.local }),
      ...files.extra,
    }),
  };
}

async function captureQaError(promise: Promise<unknown>): Promise<QaError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(QaError);
  return error as QaError;
}

describe('loadConfig', () => {
  it('throws CONFIG_MISSING when .qa/config.yaml does not exist', async () => {
    const error = await captureQaError(loadConfig(createSource({})));

    expect(error.code).toBe('CONFIG_MISSING');
  });

  it('throws CONFIG_MALFORMED for content that is not valid YAML', async () => {
    const error = await captureQaError(loadConfig(createSource({ committed: 'testing: [unclosed' })));

    expect(error.code).toBe('CONFIG_MALFORMED');
    expect(error.message).toContain('.qa/config.yaml');
  });

  it('throws CONFIG_INVALID for YAML that does not match the schema, without naming a layer', async () => {
    const error = await captureQaError(loadConfig(createSource({ committed: 'testing: {}\n' })));

    expect(error.code).toBe('CONFIG_INVALID');
    expect(error.message).toContain('testing.e2e');
    expect(error.message).not.toContain('(from');
  });

  it('reports a root-level schema issue at "(root)"', async () => {
    const error = await captureQaError(loadConfig(createSource({ committed: '- not a mapping\n' })));

    expect(error.code).toBe('CONFIG_INVALID');
    expect(error.message).toContain('(root)');
  });

  it('parses and validates a well-formed config.yaml', async () => {
    const config = await loadConfig(createSource({ committed: VALID_CONFIG_YAML }));

    expect(config.testing.e2e).toBe('in-scope');
    expect(config.environments.staging?.baseUrl).toBe('https://staging.example.com');
    expect(config.schemaVersion).toBe(1);
  });
});

describe('loadLayeredConfig', () => {
  it('relaxes nothing and names no local layer when the local layer is absent', async () => {
    const loaded = await loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML }));

    expect(loaded.localLayerPath).toBeUndefined();
    expect(loaded.relaxations).toStrictEqual([]);
    expect(loaded.sources.every((source) => source.layer === 'committed')).toBe(true);
  });

  it('adds an environment and an identity from the local layer', async () => {
    const local = `
environments:
  dev:
    baseUrl: http://localhost:4310
    allowlist: [localhost]
identities:
  tester:
    auth: cdp-attach
    secret: QA_TESTER_PASSWORD
`;
    const loaded = await loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local }));

    expect(loaded.localLayerPath).toBe('.qa/config.local.yaml');
    expect(Object.keys(loaded.config.environments).sort()).toStrictEqual(['dev', 'staging']);
    expect(Object.keys(loaded.config.identities).sort()).toStrictEqual(['admin', 'tester']);
    expect(loaded.sources).toContainEqual({ path: ['environments', 'dev', 'baseUrl'], layer: 'local' });
    expect(loaded.sources).toContainEqual({ path: ['identities', 'admin', 'secret'], layer: 'committed' });
  });

  it('changes single fields of an existing environment and identity, keeping the rest', async () => {
    const local = `
environments:
  staging:
    baseUrl: https://staging-2.example.com
identities:
  admin:
    secret: QA_LOCAL_ADMIN_PASSWORD
agents:
  parallelism: 1
`;
    const loaded = await loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local }));

    expect(loaded.config.environments.staging).toStrictEqual({
      baseUrl: 'https://staging-2.example.com',
      allowlist: ['staging.example.com'],
    });
    expect(loaded.config.identities.admin).toStrictEqual({
      auth: 'cdp-attach',
      secret: 'QA_LOCAL_ADMIN_PASSWORD',
    });
    expect(loaded.config.agents).toStrictEqual({ parallelism: 1, spokeTimeoutSeconds: 300, retries: 2 });
    expect(loaded.sources).toContainEqual({ path: ['environments', 'staging', 'baseUrl'], layer: 'local' });
    expect(loaded.sources).toContainEqual({
      path: ['environments', 'staging', 'allowlist'],
      layer: 'committed',
    });
    expect(loaded.relaxations).toStrictEqual([]);
  });

  it('replaces an array rather than concatenating it', async () => {
    const local = 'environments:\n  staging:\n    allowlist: [staging-2.example.com]\n';
    const loaded = await loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local }));

    expect(loaded.config.environments.staging?.allowlist).toStrictEqual(['staging-2.example.com']);
  });

  it('treats an empty local file as overriding nothing', async () => {
    const loaded = await loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local: '' }));

    expect(loaded.localLayerPath).toBe('.qa/config.local.yaml');
    expect(loaded.relaxations).toStrictEqual([]);
  });

  it('reads the file named by QA_CONFIG_LOCAL, relative to the project root, instead of the default', async () => {
    const source = createSource(
      {
        committed: VALID_CONFIG_YAML,
        local: 'agents:\n  parallelism: 8\n',
        extra: { [join(PROJECT_ROOT, 'ci', 'qa.local.yaml')]: 'agents:\n  parallelism: 2\n' },
      },
      { QA_CONFIG_LOCAL: 'ci/qa.local.yaml' },
    );

    const loaded = await loadLayeredConfig(source);

    expect(loaded.localLayerPath).toBe('ci/qa.local.yaml');
    expect(loaded.config.agents.parallelism).toBe(2);
  });

  it('reads an absolute QA_CONFIG_LOCAL path as given', async () => {
    const absolutePath = resolve('ci-runner', 'qa.local.yaml');
    const source = createSource(
      { committed: VALID_CONFIG_YAML, extra: { [absolutePath]: 'agents:\n  retries: 0\n' } },
      { QA_CONFIG_LOCAL: absolutePath },
    );

    const loaded = await loadLayeredConfig(source);

    expect(loaded.config.agents.retries).toBe(0);
  });

  it('fails with CONFIG_LOCAL_MISSING when QA_CONFIG_LOCAL names a missing file', async () => {
    const source = createSource(
      { committed: VALID_CONFIG_YAML, local: 'agents:\n  parallelism: 8\n' },
      { QA_CONFIG_LOCAL: 'ci/missing.yaml' },
    );

    const error = await captureQaError(loadLayeredConfig(source));

    expect(error.code).toBe('CONFIG_LOCAL_MISSING');
    expect(error.message).toContain('ci/missing.yaml');
  });

  it('treats an empty QA_CONFIG_LOCAL as unset', async () => {
    const source = createSource(
      { committed: VALID_CONFIG_YAML, local: 'agents:\n  parallelism: 8\n' },
      { QA_CONFIG_LOCAL: '' },
    );

    const loaded = await loadLayeredConfig(source);

    expect(loaded.config.agents.parallelism).toBe(8);
  });

  it('rejects a committed-only section in the local layer, naming the key and the file', async () => {
    const local = 'testing:\n  e2e: out-of-scope\n';
    const error = await captureQaError(
      loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local })),
    );

    expect(error.code).toBe('CONFIG_OVERRIDE_NOT_ALLOWED');
    expect(error.message).toContain('"testing"');
    expect(error.message).toContain('.qa/config.local.yaml');
  });

  it('rejects an unknown section in the local layer rather than ignoring it', async () => {
    const local = 'enviroments:\n  dev: {}\n';
    const error = await captureQaError(
      loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local })),
    );

    expect(error.code).toBe('CONFIG_OVERRIDE_NOT_ALLOWED');
    expect(error.message).toContain('"enviroments"');
  });

  it('throws CONFIG_MALFORMED naming the local file for invalid YAML', async () => {
    const error = await captureQaError(
      loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local: 'agents: [unclosed' })),
    );

    expect(error.code).toBe('CONFIG_MALFORMED');
    expect(error.message).toContain('.qa/config.local.yaml');
  });

  it('throws CONFIG_MALFORMED when the local layer is not a mapping', async () => {
    const error = await captureQaError(
      loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local: '- environments\n' })),
    );

    expect(error.code).toBe('CONFIG_MALFORMED');
    expect(error.message).toContain('mapping');
  });

  it('reports an invalid merged value with the layer it came from', async () => {
    const local =
      'environments:\n  dev:\n    baseUrl: http://localhost:4310\n    allowlist: ["localhost:4310"]\n';
    const error = await captureQaError(
      loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local })),
    );

    expect(error.code).toBe('CONFIG_INVALID');
    expect(error.message).toContain('environments.dev.allowlist.0');
    expect(error.message).toContain('(from .qa/config.local.yaml)');
  });

  it('blames the committed layer for a committed value that fails after merging', async () => {
    const committed = VALID_CONFIG_YAML.replace('spokeTimeoutSeconds: 300', 'spokeTimeoutSeconds: -1');
    const error = await captureQaError(
      loadLayeredConfig(createSource({ committed, local: 'agents:\n  parallelism: 1\n' })),
    );

    expect(error.message).toContain('agents.spokeTimeoutSeconds');
    expect(error.message).toContain('(from .qa/config.yaml)');
  });

  it('detects an allowlist entry and tlsInsecure added by the local layer as relaxations', async () => {
    const local = `
environments:
  staging:
    allowlist: [staging.example.com, internal.example.com]
    tlsInsecure: true
  dev:
    baseUrl: http://localhost:4310
    allowlist: [localhost]
`;
    const loaded = await loadLayeredConfig(createSource({ committed: VALID_CONFIG_YAML, local }));

    expect(loaded.relaxations).toStrictEqual([
      {
        kind: 'allowlist-entry',
        environment: 'staging',
        hostname: 'internal.example.com',
        localLayerPath: '.qa/config.local.yaml',
      },
      { kind: 'tls-insecure', environment: 'staging', localLayerPath: '.qa/config.local.yaml' },
      {
        kind: 'allowlist-entry',
        environment: 'dev',
        hostname: 'localhost',
        localLayerPath: '.qa/config.local.yaml',
      },
    ]);
  });

  it('does not report tlsInsecure the committed layer already sets', async () => {
    const committed = VALID_CONFIG_YAML.replace(
      'allowlist: [staging.example.com]',
      'allowlist: [staging.example.com]\n    tlsInsecure: true',
    );
    const loaded = await loadLayeredConfig(
      createSource({
        committed,
        local: 'environments:\n  staging:\n    baseUrl: https://staging-2.example.com\n',
      }),
    );

    expect(loaded.relaxations).toStrictEqual([]);
  });
});

describe('loadCommittedConfig', () => {
  it('validates .qa/config.yaml alone, ignoring the local layer', async () => {
    const fs = createFakeFileSystem({
      [COMMITTED_PATH]: VALID_CONFIG_YAML,
      [DEFAULT_LOCAL_PATH]: 'testing:\n  e2e: out-of-scope\n',
    });

    const config = await loadCommittedConfig(new QaStore({ projectRoot: PROJECT_ROOT, fs }));

    expect(config.testing.e2e).toBe('in-scope');
  });
});
