// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { A11yScanRecord } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { buildA11yConformanceReport, type A11yScanInput } from './a11y-conformance.js';
import { listApplicableCriteria } from './a11y-criteria.js';

const TARGET = { wcagVersion: '2.1', level: 'AA' } as const;

function scan(evidenceId: string, overrides: Partial<A11yScanRecord> = {}): A11yScanInput {
  return {
    evidenceId,
    record: {
      schemaVersion: 1,
      type: 'a11y-scan',
      axeVersion: '4.13.0',
      configHash: 'a'.repeat(64),
      wcagVersion: '2.1',
      level: 'AA',
      bestPractices: false,
      tags: [],
      include: [],
      exclude: [],
      violations: [],
      excepted: [],
      expiredExceptions: [],
      uncertain: [],
      passedRuleIds: [],
      inapplicableRuleIds: [],
      ...overrides,
    },
  };
}

function statusOf(report: ReturnType<typeof buildA11yConformanceReport>, criterionId: string): string {
  return report.criteria.find((criterion) => criterion.criterionId === criterionId)?.status ?? 'missing';
}

describe('buildA11yConformanceReport', () => {
  it('lists every in-scope criterion, all needing a manual check when there is no scan', () => {
    const report = buildA11yConformanceReport(TARGET, []);

    expect(report.criteria).toHaveLength(listApplicableCriteria(TARGET).length);
    expect(report.criteria.every((criterion) => criterion.status === 'needs-manual-check')).toBe(true);
    expect(report.counts).toEqual({
      passed: 0,
      failed: 0,
      'needs-manual-check': 50,
      'not-applicable': 0,
      excepted: 0,
    });
    expect(report.scanCount).toBe(0);
  });

  it('passes an automated criterion whose rules passed', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { passedRuleIds: ['html-has-lang'] }),
    ]);

    expect(statusOf(report, '3.1.1')).toBe('passed');
    expect(report.criteria.find((criterion) => criterion.criterionId === '3.1.1')?.evidenceIds).toEqual([
      'evidence-1',
    ]);
  });

  it('never passes a partly covered criterion, even when its rules passed', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { passedRuleIds: ['color-contrast', 'image-alt'] }),
    ]);

    expect(statusOf(report, '1.4.3')).toBe('needs-manual-check');
    expect(statusOf(report, '1.1.1')).toBe('needs-manual-check');
    expect(report.criteria.find((criterion) => criterion.criterionId === '1.4.3')?.evidenceIds).toEqual([
      'evidence-1',
    ]);
  });

  it('fails a criterion with a violation, whatever its coverage', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { violations: [{ id: 'color-contrast' }, { id: 'html-lang-valid' }] }),
    ]);

    expect(statusOf(report, '1.4.3')).toBe('failed');
    expect(statusOf(report, '3.1.1')).toBe('failed');
  });

  it('reports a violation excepted by configuration as excepted, and a real one alongside as failed', () => {
    const excepted = { ruleId: 'image-alt', reason: 'Legacy logo', violation: { id: 'image-alt' } };

    const onlyExcepted = buildA11yConformanceReport(TARGET, [scan('evidence-1', { excepted: [excepted] })]);
    const both = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { excepted: [excepted], violations: [{ id: 'input-image-alt' }] }),
    ]);

    expect(statusOf(onlyExcepted, '1.1.1')).toBe('excepted');
    expect(statusOf(both, '1.1.1')).toBe('failed');
  });

  it('keeps an automated criterion undecided when a rule came back incomplete', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { passedRuleIds: ['html-has-lang'], uncertain: [{ id: 'html-lang-valid' }] }),
    ]);

    expect(statusOf(report, '3.1.1')).toBe('needs-manual-check');
  });

  it('marks an automated criterion not applicable when its rules found nothing to check', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { inapplicableRuleIds: ['html-xml-lang-mismatch'] }),
    ]);

    expect(statusOf(report, '3.1.1')).toBe('not-applicable');
  });

  it('combines several scans, so a failure on any page fails the criterion', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { passedRuleIds: ['html-has-lang'] }),
      scan('evidence-2', { violations: [{ id: 'html-has-lang' }] }),
    ]);

    expect(statusOf(report, '3.1.1')).toBe('failed');
    expect(report.scanCount).toBe(2);
    expect(report.criteria.find((criterion) => criterion.criterionId === '3.1.1')?.evidenceIds).toEqual([
      'evidence-1',
      'evidence-2',
    ]);
  });

  it('ignores scans recorded for a different version or level', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', { level: 'A', passedRuleIds: ['html-has-lang'] }),
      scan('evidence-2', { wcagVersion: '2.0', passedRuleIds: ['html-has-lang'] }),
      scan('evidence-3', { passedRuleIds: ['html-has-lang'] }),
    ]);

    expect(report.scanCount).toBe(1);
    expect(report.ignoredScanCount).toBe(2);
    expect(report.criteria.find((criterion) => criterion.criterionId === '3.1.1')?.evidenceIds).toEqual([
      'evidence-3',
    ]);
  });

  it('counts each outcome', () => {
    const report = buildA11yConformanceReport(TARGET, [
      scan('evidence-1', {
        passedRuleIds: ['html-has-lang'],
        violations: [{ id: 'color-contrast' }],
        excepted: [{ ruleId: 'image-alt', reason: 'Legacy logo', violation: {} }],
        inapplicableRuleIds: [],
      }),
    ]);

    expect(report.counts).toEqual({
      passed: 1,
      failed: 1,
      'needs-manual-check': 47,
      'not-applicable': 0,
      excepted: 1,
    });
  });
});
