// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config-loader.js';
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
identities: {}
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

function createStore(files: Readonly<Record<string, string>> = {}): QaStore {
  const projectRoot = join('project');
  const configPath = join(projectRoot, '.qa', 'config.yaml');
  return new QaStore({
    projectRoot,
    fs: createFakeFileSystem(files.configYaml === undefined ? {} : { [configPath]: files.configYaml }),
  });
}

describe('loadConfig', () => {
  it('throws CONFIG_MISSING when .qa/config.yaml does not exist', async () => {
    const store = createStore();

    const error = await loadConfig(store).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CONFIG_MISSING');
  });

  it('throws CONFIG_MALFORMED for content that is not valid YAML', async () => {
    const store = createStore({ configYaml: 'testing: [unclosed' });

    const error = await loadConfig(store).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CONFIG_MALFORMED');
  });

  it('throws CONFIG_INVALID for YAML that does not match the schema', async () => {
    const store = createStore({ configYaml: 'testing: {}\n' });

    const error = await loadConfig(store).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CONFIG_INVALID');
    expect((error as QaError).message).toContain('e2e');
  });

  it('parses and validates a well-formed config.yaml', async () => {
    const store = createStore({ configYaml: VALID_CONFIG_YAML });

    const config = await loadConfig(store);

    expect(config.testing.e2e).toBe('in-scope');
    expect(config.environments.staging?.baseUrl).toBe('https://staging.example.com');
    expect(config.schemaVersion).toBe(1);
  });
});
