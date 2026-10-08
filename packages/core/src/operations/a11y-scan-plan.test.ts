// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_A11Y_CONFIG, type A11yConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { axeResult } from '../test-support/axe-result.js';
import {
  buildA11yScanRecord,
  classifyAxeResult,
  listRuleIds,
  parseAxeResult,
  planAxeRun,
  toAxeContext,
} from './a11y-scan-plan.js';

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

describe('listRuleIds', () => {
  it('reads the requested result key', () => {
    const scanResult = { passes: [{ id: 'a' }], inapplicable: [{ id: 'b' }] };

    expect(listRuleIds(scanResult, 'passes')).toEqual(['a']);
    expect(listRuleIds(scanResult, 'inapplicable')).toEqual(['b']);
  });

  it('lists each incomplete rule once and ignores entries without an id', () => {
    const scanResult = { incomplete: [{ id: 'label' }, { id: 'label' }, { nope: 1 }, { id: 7 }] };

    expect(listRuleIds(scanResult, 'incomplete')).toEqual(['label']);
  });

  it('is empty when the result has no incomplete entries', () => {
    expect(listRuleIds({}, 'incomplete')).toEqual([]);
    expect(listRuleIds(null, 'incomplete')).toEqual([]);
  });
});

describe('parseAxeResult', () => {
  const plan = planAxeRun(configWith({}));

  it('accepts a complete result and keeps what axe-core reported', () => {
    const parsed = parseAxeResult(axeResult({ violations: [{ id: 'image-alt', impact: 'critical' }] }), plan);

    expect(parsed.violations).toEqual([{ id: 'image-alt', impact: 'critical' }]);
  });

  it.each([
    ['an empty object', {}],
    ['null', null],
    ['an array', []],
    ['a string', 'oops'],
    ['a missing result list', { ...axeResult(), passes: undefined }],
    ['a result list of the wrong type', { ...axeResult(), violations: {} }],
    ['an entry without an id', { ...axeResult(), violations: [{ note: 'no id' }] }],
    ['an entry with a numeric id', { ...axeResult(), violations: [{ id: 7 }] }],
    ['missing tool options', { ...axeResult(), toolOptions: undefined }],
    ['no url', { ...axeResult(), url: '' }],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseAxeResult(raw, plan)).toThrow(
      expect.objectContaining({ code: 'A11Y_SCAN_RESULT_INVALID' }) as Error,
    );
  });

  it('names the problems, and at most three of them', () => {
    expect(() => parseAxeResult({}, plan)).toThrow(/testEngine.*url.*toolOptions/s);
  });

  it('describes a non-object result as the root', () => {
    expect(() => parseAxeResult(null, plan)).toThrow(/\(root\)/);
  });

  it('rejects a result that ran other rule tags than the plan', () => {
    expect(() => parseAxeResult(axeResult({ tags: ['wcag2a'] }), plan)).toThrow(
      expect.objectContaining({ code: 'A11Y_SCAN_CONFIG_MISMATCH' }) as Error,
    );
  });

  it('rejects a result that ran the same number of tags but different ones', () => {
    const tags = [...plan.tags.slice(0, -1), 'wcag22aa'];

    expect(() => parseAxeResult(axeResult({ tags }), plan)).toThrow(
      expect.objectContaining({ code: 'A11Y_SCAN_CONFIG_MISMATCH' }) as Error,
    );
  });

  it('accepts the same tags in another order', () => {
    expect(() => parseAxeResult(axeResult({ tags: [...plan.tags].reverse() }), plan)).not.toThrow();
  });
});

describe('buildA11yScanRecord', () => {
  const scanResult = axeResult({
    violations: [{ id: 'image-alt' }, { id: 'color-contrast' }],
    incomplete: [{ id: 'link-name' }],
    passes: [{ id: 'html-has-lang' }],
    inapplicable: [{ id: 'video-caption' }],
  });

  it('records the configuration the scan ran with and how each rule was classified', () => {
    const a11y = configWith({
      include: ['main'],
      exceptions: [{ ruleId: 'color-contrast', reason: 'Known issue' }],
    });

    const record = buildA11yScanRecord({
      a11y,
      plan: planAxeRun(a11y),
      axeVersion: '4.0.0',
      configHash: 'a'.repeat(64),
      scanResult,
      today: '2026-10-06',
    });

    expect(record).toMatchObject({
      type: 'a11y-scan',
      axeVersion: '4.0.0',
      configHash: 'a'.repeat(64),
      wcagVersion: '2.1',
      level: 'AA',
      bestPractices: false,
      include: ['main'],
      exclude: [],
      violations: [{ id: 'image-alt' }],
      uncertain: [{ id: 'link-name' }],
      expiredExceptions: [],
      passedRuleIds: ['html-has-lang'],
      inapplicableRuleIds: ['video-caption'],
    });
    expect(record.excepted).toMatchObject([{ ruleId: 'color-contrast', reason: 'Known issue' }]);
    expect(record.tags).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  });
});
