// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ConfigSchema, EnvironmentConfigSchema, FlakyDetectionConfigSchema } from './config.js';

function validConfig() {
  return {
    testing: { e2e: 'in-scope', api: 'in-scope', a11y: 'out-of-scope', security: 'undecided' },
    source: { path: 'app' },
    api: { contract: 'openapi', source: './openapi.yaml' },
    environments: {
      staging: { baseUrl: '${QA_BASE_URL}', allowlist: ['staging.example.com'] },
    },
    identities: {
      admin: {
        auth: 'storage-state',
        secret: 'QA_ADMIN_PASSWORD',
        loginUrl: '/login',
        username: 'qa.admin@example.com',
      },
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

  it('accepts an environment with tlsInsecure set (P2-18)', () => {
    const config = validConfig();
    const result = ConfigSchema.parse({
      ...config,
      environments: {
        staging: { ...config.environments.staging, tlsInsecure: true },
      },
    });
    expect(result.environments.staging?.tlsInsecure).toBe(true);
  });

  it('defaults tlsInsecure to undefined, not true, when omitted', () => {
    const result = ConfigSchema.parse(validConfig());
    expect(result.environments.staging?.tlsInsecure).toBeUndefined();
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

  it('rejects a "storage-state" identity with no loginUrl', () => {
    const config = validConfig();
    delete (config.identities.admin as { loginUrl?: string }).loginUrl;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects a "storage-state" identity with no username', () => {
    const config = validConfig();
    delete (config.identities.admin as { username?: string }).username;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('accepts a "cdp-attach" identity with no loginUrl or username', () => {
    const config = validConfig();
    const admin = config.identities.admin as { auth: string; loginUrl?: string; username?: string };
    admin.auth = 'cdp-attach';
    delete admin.loginUrl;
    delete admin.username;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('defaults flaky detection thresholds when omitted', () => {
    const result = ConfigSchema.parse(validConfig());
    expect(result.flaky).toEqual({ historyWindow: 10, minStatusChanges: 2 });
  });

  it('accepts explicit flaky detection thresholds', () => {
    const result = ConfigSchema.parse({
      ...validConfig(),
      flaky: { historyWindow: 5, minStatusChanges: 3 },
    });
    expect(result.flaky).toEqual({ historyWindow: 5, minStatusChanges: 3 });
  });
});

describe('FlakyDetectionConfigSchema', () => {
  it('rejects a non-positive historyWindow', () => {
    const result = FlakyDetectionConfigSchema.safeParse({ historyWindow: 0, minStatusChanges: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive minStatusChanges', () => {
    const result = FlakyDetectionConfigSchema.safeParse({ historyWindow: 10, minStatusChanges: 0 });
    expect(result.success).toBe(false);
  });
});

describe('EnvironmentConfigSchema', () => {
  it('accepts a bare hostname allowlist entry', () => {
    const result = EnvironmentConfigSchema.safeParse({
      baseUrl: 'http://localhost:4310',
      allowlist: ['localhost'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a multi-label bare hostname', () => {
    const result = EnvironmentConfigSchema.safeParse({
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an allowlist entry carrying a port (#329)', () => {
    const result = EnvironmentConfigSchema.safeParse({
      baseUrl: 'http://localhost:4310',
      allowlist: ['localhost:4310'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an allowlist entry carrying a scheme', () => {
    const result = EnvironmentConfigSchema.safeParse({
      baseUrl: 'https://staging.example.com',
      allowlist: ['https://staging.example.com'],
    });
    expect(result.success).toBe(false);
  });
});
