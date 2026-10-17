// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { BASELINE_CASES, DEFAULT_PARALLELISM, classifyByHint, configYaml } from './eval-baseline.mjs';

describe('configYaml', () => {
  it('writes the parallelism the baseline is to run with, 4 by default and 1 for sequential', () => {
    expect(configYaml('http://localhost:1/')).toContain(`parallelism: ${String(DEFAULT_PARALLELISM)},`);
    expect(configYaml('http://localhost:1/', 1)).toContain(
      'agents: { parallelism: 1, spokeTimeoutSeconds: 120, retries: 1 }',
    );
  });

  it('points the staging environment at the demo app it was given', () => {
    expect(configYaml('http://localhost:4696/')).toContain('baseUrl: "http://localhost:4696/"');
  });
});

describe('classifyByHint', () => {
  it.each([
    ['assertion-mismatch', 'product-bug', 'medium'],
    ['network', 'environment', 'medium'],
    ['locator-not-found', 'uncertain', 'low'],
    ['other', 'uncertain', 'low'],
  ])('classifies a %s failure as %s with %s confidence', (kind, category, confidence) => {
    expect(classifyByHint(kind)).toEqual({ category, confidence });
  });
});

describe('BASELINE_CASES', () => {
  it('has more cases than one batch of the default parallelism, so batching is exercised', () => {
    expect(BASELINE_CASES.length).toBeGreaterThan(DEFAULT_PARALLELISM);
  });
});
