// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_A11Y_CONFIG, type A11yConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { classifyAxeResult, planAxeRun, toAxeContext } from './a11y-scan-plan.js';

function configWith(overrides: Partial<A11yConfig>): A11yConfig {
  return { ...DEFAULT_A11Y_CONFIG, ...overrides };
}

describe('planAxeRun', () => {
  it('selects the cumulative 2.0 and 2.1 tags up to AA by default', () => {
    expect(planAxeRun(DEFAULT_A11Y_CONFIG).tags).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  });

  it('selects only level A tags for a level A target', () => {
    expect(planAxeRun(configWith({ level: 'A' })).tags).toEqual(['wcag2a', 'wcag21a']);
  });

  it('limits a 2.0 target to the 2.0 tags', () => {
    expect(planAxeRun(configWith({ wcagVersion: '2.0' })).tags).toEqual(['wcag2a', 'wcag2aa']);
  });

  it('adds the 2.2 tags for a 2.2 target and skips tags axe-core has no rules for', () => {
    const { tags } = planAxeRun(configWith({ wcagVersion: '2.2', level: 'AAA' }));

    expect(tags).toContain('wcag22aa');
    expect(tags).toContain('wcag2aaa');
    expect(tags).not.toContain('wcag21aaa');
  });

  it('adds the best-practice tag only when asked for', () => {
    expect(planAxeRun(DEFAULT_A11Y_CONFIG).tags).not.toContain('best-practice');
    expect(planAxeRun(configWith({ bestPractices: true })).tags).toContain('best-practice');
  });

  it('lists the rules to enable, including the AAA rules axe-core disables by default', () => {
    expect(planAxeRun(DEFAULT_A11Y_CONFIG).ruleIds).not.toContain('color-contrast-enhanced');
    expect(planAxeRun(configWith({ level: 'AAA' })).ruleIds).toContain('color-contrast-enhanced');
  });
});

describe('toAxeContext', () => {
  it('scans the whole document when nothing is included or excluded', () => {
    expect(toAxeContext(planAxeRun(DEFAULT_A11Y_CONFIG))).toBeUndefined();
  });

  it('sets only the side that has selectors', () => {
    expect(toAxeContext(planAxeRun(configWith({ include: ['main'] })))).toEqual({ include: [['main']] });
    expect(toAxeContext(planAxeRun(configWith({ exclude: ['.ad'] })))).toEqual({ exclude: [['.ad']] });
  });

  it('wraps each include and exclude selector for axe-core', () => {
    const plan = planAxeRun(configWith({ include: ['main'], exclude: ['.ad', '#chat'] }));

    expect(toAxeContext(plan)).toEqual({ include: [['main']], exclude: [['.ad'], ['#chat']] });
  });
});

describe('classifyAxeResult', () => {
  const scanResult = {
    violations: [{ id: 'color-contrast' }, { id: 'image-alt' }, { note: 'no id' }],
    incomplete: [{ id: 'color-contrast' }],
  };

  it('keeps every violation and maps incomplete to uncertain when nothing is excepted', () => {
    const classified = classifyAxeResult(scanResult, [], '2026-09-29');

    expect(classified.violations).toHaveLength(3);
    expect(classified.excepted).toEqual([]);
    expect(classified.uncertain).toEqual([{ id: 'color-contrast' }]);
  });

  it('reports an excepted violation as excepted with its reason, not as dropped', () => {
    const classified = classifyAxeResult(
      scanResult,
      [{ ruleId: 'image-alt', reason: 'Legacy logo', expires: '2026-12-31' }],
      '2026-09-29',
    );

    expect(classified.violations).toEqual([{ id: 'color-contrast' }, { note: 'no id' }]);
    expect(classified.excepted).toEqual([
      { ruleId: 'image-alt', reason: 'Legacy logo', expires: '2026-12-31', violation: { id: 'image-alt' } },
    ]);
  });

  it('omits expires from an excepted violation whose exception never expires', () => {
    const classified = classifyAxeResult(
      scanResult,
      [{ ruleId: 'image-alt', reason: 'Legacy' }],
      '2026-09-29',
    );

    expect(classified.excepted[0]).not.toHaveProperty('expires');
  });

  it('applies an exception on its expiry day but not after', () => {
    const exception = { ruleId: 'image-alt', reason: 'Legacy', expires: '2026-09-29' };

    expect(classifyAxeResult(scanResult, [exception], '2026-09-29').excepted).toHaveLength(1);
    const lapsed = classifyAxeResult(scanResult, [exception], '2026-09-30');
    expect(lapsed.excepted).toEqual([]);
    expect(lapsed.violations).toHaveLength(3);
    expect(lapsed.expiredExceptions).toEqual([exception]);
  });

  it('uses the first active exception when several name the same rule', () => {
    const classified = classifyAxeResult(
      scanResult,
      [
        { ruleId: 'image-alt', reason: 'First' },
        { ruleId: 'image-alt', reason: 'Second' },
      ],
      '2026-09-29',
    );

    expect(classified.excepted).toHaveLength(1);
    expect(classified.excepted[0]?.reason).toBe('First');
  });

  it.each([null, 'oops', {}, { violations: 'oops', incomplete: 3 }])(
    'yields nothing from a malformed scan result (%j)',
    (malformed) => {
      const classified = classifyAxeResult(malformed, [], '2026-09-29');

      expect(classified.violations).toEqual([]);
      expect(classified.uncertain).toEqual([]);
    },
  );

  it('treats a non-string rule id as having no rule id', () => {
    const classified = classifyAxeResult(
      { violations: [{ id: 7 }] },
      [{ ruleId: '7', reason: 'x' }],
      '2026-09-29',
    );

    expect(classified.violations).toHaveLength(1);
  });
});
