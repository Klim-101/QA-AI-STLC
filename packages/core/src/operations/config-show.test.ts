// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runConfigShow } from './config-show.js';

const PROJECT_ROOT = join('project');
const CONFIG_PATH = join(PROJECT_ROOT, '.qa', 'config.yaml');
const LOCAL_PATH = join(PROJECT_ROOT, '.qa', 'config.local.yaml');

const CONFIG_YAML = [
  'testing: { e2e: in-scope, api: out-of-scope, a11y: undecided, security: undecided }',
  'environments:',
  '  staging:',
  '    baseUrl: https://staging.example.com',
  '    allowlist: [staging.example.com]',
  'identities:',
  '  admin:',
  '    auth: cdp-attach',
  '    secret: QA_ADMIN_PASSWORD',
  'data: { strategy: disposable, ownerMarker: qa }',
  'selectors: { policy: testid-first, testIdAttribute: data-testid }',
  'agents: { parallelism: 4, spokeTimeoutSeconds: 300, retries: 2 }',
  '',
].join('\n');

describe('runConfigShow', () => {
  it('reports every value from the committed layer as "committed" with no local layer', async () => {
    const context = createFakeEngineContext({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }),
    });

    const result = await runConfigShow(context);

    expect(result.localLayerPath).toBeUndefined();
    expect(result.relaxations).toStrictEqual([]);
    const e2e = result.values.find((value) => value.path.join('.') === 'testing.e2e');
    expect(e2e).toStrictEqual({ path: ['testing', 'e2e'], value: 'in-scope', layer: 'committed' });
  });

  it('reports the source layer, the local file path and the relaxations of a merged configuration', async () => {
    const local = [
      'environments:',
      '  staging:',
      '    baseUrl: https://staging-2.example.com',
      '    tlsInsecure: true',
      '',
    ].join('\n');
    const context = createFakeEngineContext({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML, [LOCAL_PATH]: local }),
    });

    const result = await runConfigShow(context);

    expect(result.localLayerPath).toBe('.qa/config.local.yaml');
    const baseUrl = result.values.find((value) => value.path.join('.') === 'environments.staging.baseUrl');
    expect(baseUrl).toStrictEqual({
      path: ['environments', 'staging', 'baseUrl'],
      value: 'https://staging-2.example.com',
      layer: 'local',
    });
    const allowlist = result.values.find(
      (value) => value.path.join('.') === 'environments.staging.allowlist',
    );
    expect(allowlist?.layer).toBe('committed');
    expect(result.relaxations).toStrictEqual([
      { kind: 'tls-insecure', environment: 'staging', localLayerPath: '.qa/config.local.yaml' },
    ]);
  });

  it('never resolves a secret name to the value of its environment variable', async () => {
    const context = createFakeEngineContext({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }),
      env: { QA_ADMIN_PASSWORD: 'super-secret-value' },
    });

    const result = await runConfigShow(context);

    expect(JSON.stringify(result)).not.toContain('super-secret-value');
    const secret = result.values.find((value) => value.path.join('.') === 'identities.admin.secret');
    expect(secret?.value).toBe('QA_ADMIN_PASSWORD');
  });
});
