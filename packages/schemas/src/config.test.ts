// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ConfigSchema } from './config.js';

function validConfig() {
  return {
    testing: { e2e: 'in-scope', api: 'in-scope', a11y: 'out-of-scope', security: 'undecided' },
    source: { path: 'app' },
    api: { contract: 'openapi', source: './openapi.yaml' },
    environments: {
      staging: { baseUrl: '${QA_BASE_URL}', allowlist: ['staging.example.com'] },
    },
    identities: {
      admin: { auth: 'storage-state', secret: 'QA_ADMIN_PASSWORD' },
    },
    data: { strategy: 'disposable', ownerMarker: 'qa-${runId}' },
    selectors: { policy: 'testid-first', testIdAttribute: 'data-testid' },
    agents: { parallelism: 4, spokeTimeoutSeconds: 300, retries: 2 },
  };
}

describe('ConfigSchema', () => {
  it('accepts a fully specified config and stamps the default schema version', () => {
    const result = ConfigSchema.parse(validConfig());
    expect(result.schemaVersion).toBe(1);
  });

  it('rejects a config with api in scope but no api block', () => {
    const config = validConfig();
    delete (config as { api?: unknown }).api;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('accepts api out of scope with no api block', () => {
    const config = validConfig();
    config.testing.api = 'out-of-scope';
    delete (config as { api?: unknown }).api;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects an identity secret that is not a QA_-prefixed environment variable name', () => {
    const config = validConfig();
    config.identities.admin.secret = 'admin_password';
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown testing scope decision', () => {
    const config = validConfig();
    (config.testing as Record<string, string>).e2e = 'maybe';
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
