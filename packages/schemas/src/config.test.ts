// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  A11yConfigSchema,
  CONFIG_SECTION_LAYERING,
  ConfigSchema,
  DEFAULT_A11Y_CONFIG,
  DEFAULT_EVIDENCE_CONFIG,
  DEFAULT_LOGIN_SELECTORS,
  DEFAULT_STABILITY_VIEWPORTS,
  EnvironmentConfigSchema,
  EvidenceConfigSchema,
  FlakyDetectionConfigSchema,
  SelectorsConfigSchema,
  isLocalOverridableConfigSection,
  listA11yLevelsUpTo,
} from './config.js';

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

  it('defaults evidence.httpBodyPreviewMaxLength when omitted (P6-23)', () => {
    const result = ConfigSchema.parse(validConfig());
    expect(result.evidence).toEqual(DEFAULT_EVIDENCE_CONFIG);
  });

  it('accepts an explicit evidence.httpBodyPreviewMaxLength', () => {
    const result = ConfigSchema.parse({ ...validConfig(), evidence: { httpBodyPreviewMaxLength: 200 } });
    expect(result.evidence).toEqual({ httpBodyPreviewMaxLength: 200 });
  });

  it('defaults selectors.stabilityViewports, defaultLoginSelectors, extraStableAttributes and generatedIdPatterns when omitted (P6-23)', () => {
    const result = ConfigSchema.parse(validConfig());
    expect(result.selectors.stabilityViewports).toEqual(DEFAULT_STABILITY_VIEWPORTS);
    expect(result.selectors.defaultLoginSelectors).toEqual(DEFAULT_LOGIN_SELECTORS);
    expect(result.selectors.extraStableAttributes).toEqual([]);
    expect(result.selectors.generatedIdPatterns).toEqual([]);
  });

  it('accepts an explicit override of every new selectors field (P6-23)', () => {
    const config = validConfig();
    const result = ConfigSchema.parse({
      ...config,
      selectors: {
        ...config.selectors,
        stabilityViewports: [{ width: 400, height: 300 }],
        defaultLoginSelectors: { username: '#u', password: '#p', submit: '#s' },
        extraStableAttributes: ['data-qa'],
        generatedIdPatterns: ['^:r[0-9a-z]+:$'],
      },
    });
    expect(result.selectors.stabilityViewports).toEqual([{ width: 400, height: 300 }]);
    expect(result.selectors.defaultLoginSelectors).toEqual({ username: '#u', password: '#p', submit: '#s' });
    expect(result.selectors.extraStableAttributes).toEqual(['data-qa']);
    expect(result.selectors.generatedIdPatterns).toEqual(['^:r[0-9a-z]+:$']);
  });
});

describe('EvidenceConfigSchema', () => {
  it('rejects a non-positive httpBodyPreviewMaxLength', () => {
    const result = EvidenceConfigSchema.safeParse({ httpBodyPreviewMaxLength: 0 });
    expect(result.success).toBe(false);
  });
});

describe('SelectorsConfigSchema (P6-23)', () => {
  const base = { policy: 'playwright-default', testIdAttribute: 'data-testid' };

  it('rejects an empty stabilityViewports array', () => {
    const result = SelectorsConfigSchema.safeParse({ ...base, stabilityViewports: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a generatedIdPatterns entry that is not a valid regular expression', () => {
    const result = SelectorsConfigSchema.safeParse({ ...base, generatedIdPatterns: ['(unclosed'] });
    expect(result.success).toBe(false);
  });

  it('accepts a generatedIdPatterns entry that is a valid regular expression', () => {
    const result = SelectorsConfigSchema.safeParse({ ...base, generatedIdPatterns: ['^generated-'] });
    expect(result.success).toBe(true);
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

  it('accepts navigationTimeoutMs and actionTimeoutMs (P6-23)', () => {
    const result = EnvironmentConfigSchema.safeParse({
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
      navigationTimeoutMs: 60_000,
      actionTimeoutMs: 15_000,
    });
    expect(result).toMatchObject({
      success: true,
      data: { navigationTimeoutMs: 60_000, actionTimeoutMs: 15_000 },
    });
  });

  it('defaults navigationTimeoutMs and actionTimeoutMs to undefined when omitted', () => {
    const result = EnvironmentConfigSchema.parse({
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
    });
    expect(result.navigationTimeoutMs).toBeUndefined();
    expect(result.actionTimeoutMs).toBeUndefined();
  });

  it('rejects a non-positive navigationTimeoutMs', () => {
    const result = EnvironmentConfigSchema.safeParse({
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
      navigationTimeoutMs: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive actionTimeoutMs', () => {
    const result = EnvironmentConfigSchema.safeParse({
      baseUrl: 'https://staging.example.com',
      allowlist: ['staging.example.com'],
      actionTimeoutMs: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('CONFIG_SECTION_LAYERING', () => {
  it('classifies every ConfigSchema section and nothing else', () => {
    expect(Object.keys(CONFIG_SECTION_LAYERING).sort()).toStrictEqual(Object.keys(ConfigSchema.shape).sort());
  });

  it('lets the local layer set only machine-specific sections (ADR-011)', () => {
    const overridable = Object.entries(CONFIG_SECTION_LAYERING)
      .filter(([, layering]) => layering === 'local-overridable')
      .map(([section]) => section)
      .sort();
    expect(overridable).toStrictEqual(['agents', 'environments', 'identities', 'source']);
  });
});

describe('isLocalOverridableConfigSection', () => {
  it('accepts a local-overridable section', () => {
    expect(isLocalOverridableConfigSection('environments')).toBe(true);
  });

  it('rejects a committed-only section', () => {
    expect(isLocalOverridableConfigSection('testing')).toBe(false);
  });

  it('rejects an unknown key, including an inherited object property name', () => {
    expect(isLocalOverridableConfigSection('enviroments')).toBe(false);
    expect(isLocalOverridableConfigSection('toString')).toBe(false);
  });
});

describe('a11y config (P6-25)', () => {
  it('defaults to WCAG 2.1 level AA, best practices off, no selectors or exceptions', () => {
    const result = ConfigSchema.parse(validConfig());

    expect(result.a11y).toStrictEqual(DEFAULT_A11Y_CONFIG);
    expect(result.a11y).toStrictEqual({
      wcagVersion: '2.1',
      level: 'AA',
      bestPractices: false,
      include: [],
      exclude: [],
      exceptions: [],
    });
  });

  it('fills the defaults of a partially given block', () => {
    const result = A11yConfigSchema.parse({ level: 'AAA', exclude: ['#cookie-banner'] });

    expect(result).toStrictEqual({ ...DEFAULT_A11Y_CONFIG, level: 'AAA', exclude: ['#cookie-banner'] });
  });

  it('accepts an exception with a reason and an optional expiry', () => {
    const result = A11yConfigSchema.parse({
      exceptions: [
        { ruleId: 'color-contrast', reason: 'Brand palette under review', expires: '2026-12-31' },
        { ruleId: 'region', reason: 'Legacy layout' },
      ],
    });

    expect(result.exceptions).toHaveLength(2);
    expect(result.exceptions[1]?.expires).toBeUndefined();
  });

  it.each([
    ['a missing reason', { ruleId: 'region' }],
    ['an empty reason', { ruleId: 'region', reason: '' }],
    ['an empty rule id', { ruleId: '', reason: 'x' }],
    ['a malformed expiry', { ruleId: 'region', reason: 'x', expires: 'next year' }],
  ])('rejects an exception with %s', (_name, exception) => {
    expect(A11yConfigSchema.safeParse({ exceptions: [exception] }).success).toBe(false);
  });

  it('rejects an unknown level and an unquoted (numeric) WCAG version', () => {
    expect(A11yConfigSchema.safeParse({ level: 'AAAA' }).success).toBe(false);
    const numeric = A11yConfigSchema.safeParse({ wcagVersion: 2.1 });
    expect(numeric.success).toBe(false);
    expect(numeric.error?.issues[0]?.message).toContain('quoted');
  });

  it('treats conformance levels as cumulative', () => {
    expect(listA11yLevelsUpTo('A')).toStrictEqual(['A']);
    expect(listA11yLevelsUpTo('AA')).toStrictEqual(['A', 'AA']);
    expect(listA11yLevelsUpTo('AAA')).toStrictEqual(['A', 'AA', 'AAA']);
  });

  it('is committed-only, since it sets what a report claims', () => {
    expect(isLocalOverridableConfigSection('a11y')).toBe(false);
  });
});
