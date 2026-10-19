// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { resolveContractFetchSettings } from './api-contract-environment.js';

function environment(overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
  return {
    baseUrl: 'https://app.example.test',
    allowlist: ['app.example.test', 'api.example.test'],
    ...overrides,
  };
}

describe('resolveContractFetchSettings', () => {
  it('uses the defaults when no environment is configured', () => {
    expect(resolveContractFetchSettings('https://api.example.test/spec', {})).toEqual({ tlsInsecure: false });
  });

  it('uses the defaults when no environment serves the contract host', () => {
    const environments = { staging: environment({ tlsInsecure: true, reachabilityTimeoutMs: 20_000 }) };

    expect(resolveContractFetchSettings('https://other.example.test/spec', environments)).toEqual({
      tlsInsecure: false,
    });
  });

  it('does not match a contract on another port or scheme than the environment', () => {
    const environments = { staging: environment({ tlsInsecure: true, reachabilityTimeoutMs: 20_000 }) };

    expect(resolveContractFetchSettings('https://api.example.test:8443/spec', environments)).toEqual({
      tlsInsecure: false,
    });
    expect(resolveContractFetchSettings('http://api.example.test/spec', environments)).toEqual({
      tlsInsecure: false,
    });
  });

  it('takes tlsInsecure and the limit from the environment that serves the contract', () => {
    const environments = { staging: environment({ tlsInsecure: true, reachabilityTimeoutMs: 20_000 }) };

    expect(resolveContractFetchSettings('https://api.example.test/spec', environments)).toEqual({
      tlsInsecure: true,
      timeoutMs: 20_000,
    });
  });

  it('leaves tlsInsecure off when the serving environment does not ask for it', () => {
    const environments = { staging: environment({ tlsInsecure: false }), other: environment() };

    expect(resolveContractFetchSettings('https://api.example.test/spec', environments)).toEqual({
      tlsInsecure: false,
    });
  });

  it('skips TLS validation only when every serving environment asks for it', () => {
    const environments = { insecure: environment({ tlsInsecure: true }), strict: environment() };

    expect(resolveContractFetchSettings('https://api.example.test/spec', environments).tlsInsecure).toBe(
      false,
    );
  });

  it('takes the longest limit among the serving environments', () => {
    const environments = {
      fast: environment({ reachabilityTimeoutMs: 3000 }),
      slow: environment({ reachabilityTimeoutMs: 30_000 }),
      unset: environment(),
    };

    expect(resolveContractFetchSettings('https://api.example.test/spec', environments)).toEqual({
      tlsInsecure: false,
      timeoutMs: 30_000,
    });
  });

  it.each(['', 'discover', 'synthesize', 'openapi.yaml'])(
    'uses the defaults for "%s", which is not a URL',
    (source) => {
      const environments = { staging: environment({ tlsInsecure: true, reachabilityTimeoutMs: 20_000 }) };

      expect(resolveContractFetchSettings(source, environments)).toEqual({ tlsInsecure: false });
    },
  );
});
