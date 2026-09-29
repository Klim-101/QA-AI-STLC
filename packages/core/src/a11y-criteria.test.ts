// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import axeCore from 'axe-core';
import { describe, expect, it } from 'vitest';
import { buildManualChecklist, listApplicableCriteria, WCAG_CRITERIA } from './a11y-criteria.js';

type Version = '2.0' | '2.1' | '2.2';

function idsFor(wcagVersion: Version, level: 'A' | 'AA' | 'AAA'): string[] {
  return listApplicableCriteria({ wcagVersion, level }).map((criterion) => criterion.id);
}

function countsByLevel(wcagVersion: Version): number[] {
  return (['A', 'AA', 'AAA'] as const).map(
    (level) =>
      listApplicableCriteria({ wcagVersion, level: 'AAA' }).filter((criterion) => criterion.level === level)
        .length,
  );
}

function toCriterionTag(id: string): string {
  return `wcag${id.replaceAll('.', '')}`;
}

describe('WCAG_CRITERIA', () => {
  it('has unique criterion numbers in ascending order', () => {
    const ids = WCAG_CRITERIA.map((criterion) => criterion.id);
    const sorted = ids
      .map((id) => id.split('.').map(Number))
      .sort((left, right) => left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!)
      .map((parts) => parts.join('.'));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(sorted);
  });

  it('has the published number of criteria per version and level', () => {
    expect(countsByLevel('2.0')).toEqual([25, 13, 23]);
    expect(countsByLevel('2.1')).toEqual([30, 20, 28]);
    expect(countsByLevel('2.2')).toEqual([31, 24, 31]);
  });

  it('gives every partial and manual criterion a check, and no automated one', () => {
    for (const criterion of WCAG_CRITERIA) {
      const hasCheck = criterion.manualCheck !== undefined && criterion.manualCheck.length > 0;
      expect(hasCheck, criterion.id).toBe(criterion.coverage !== 'automated');
    }
  });

  it('lists axe-core rules exactly for the criteria axe-core reports on', () => {
    for (const criterion of WCAG_CRITERIA) {
      expect(criterion.axeRuleIds.length > 0, criterion.id).toBe(criterion.coverage !== 'manual');
    }
  });

  it('maps only to rules that exist in the bundled axe-core and are tagged with the criterion', () => {
    const tagsByRuleId = new Map(axeCore.getRules().map((rule) => [rule.ruleId, rule.tags]));
    for (const criterion of WCAG_CRITERIA) {
      for (const ruleId of criterion.axeRuleIds) {
        expect(tagsByRuleId.get(ruleId), `${criterion.id} ${ruleId}`).toContain(toCriterionTag(criterion.id));
      }
    }
  });

  it('lists every active axe-core rule tagged with a criterion under that criterion', () => {
    const criterionByTag = new Map(
      WCAG_CRITERIA.map((criterion) => [toCriterionTag(criterion.id), criterion]),
    );
    for (const rule of axeCore.getRules()) {
      if (rule.tags.includes('deprecated')) {
        continue;
      }
      for (const tag of rule.tags.filter((candidate) => /^wcag\d{3,4}$/.test(candidate))) {
        expect(criterionByTag.get(tag)?.axeRuleIds, `${tag} ${rule.ruleId}`).toContain(rule.ruleId);
      }
    }
  });
});

describe('listApplicableCriteria', () => {
  it('covers the level and every level below it', () => {
    expect(idsFor('2.1', 'A')).toHaveLength(30);
    expect(idsFor('2.1', 'AA')).toHaveLength(50);
    expect(idsFor('2.1', 'AAA')).toHaveLength(78);
  });

  it('adds the criteria a newer version introduced only from that version on', () => {
    expect(idsFor('2.0', 'AA')).not.toContain('1.4.10');
    expect(idsFor('2.1', 'AA')).toContain('1.4.10');
    expect(idsFor('2.1', 'AA')).not.toContain('2.5.8');
    expect(idsFor('2.2', 'AA')).toContain('2.5.8');
  });

  it('drops 4.1.1 from 2.2, where the standard removed it', () => {
    expect(idsFor('2.1', 'A')).toContain('4.1.1');
    expect(idsFor('2.2', 'A')).not.toContain('4.1.1');
  });
});

describe('buildManualChecklist', () => {
  const target = { wcagVersion: '2.1', level: 'AA' } as const;

  it('lists exactly the in-scope criteria that are not fully automated', () => {
    const checklist = buildManualChecklist(target);

    expect(checklist.items.map((item) => item.criterionId)).toEqual(
      listApplicableCriteria(target)
        .filter((criterion) => criterion.coverage !== 'automated')
        .map((criterion) => criterion.id),
    );
    expect(checklist.items.map((item) => item.criterionId)).not.toContain('3.1.1');
    expect(checklist.items).toHaveLength(49);
  });

  it('carries the level, coverage and check text of each item', () => {
    const item = buildManualChecklist(target).items.find((candidate) => candidate.criterionId === '1.4.3');

    expect(item).toMatchObject({ name: 'Text contrast', level: 'AA', coverage: 'partial' });
    expect(item?.check).toContain('contrast');
    expect(item?.incompleteRuleIds).toEqual([]);
  });

  it('keeps a partially covered criterion when its rules passed', () => {
    const scanResult = { violations: [], incomplete: [], passes: [{ id: 'color-contrast' }] };

    const ids = buildManualChecklist(target, scanResult).items.map((item) => item.criterionId);

    expect(ids).toContain('1.4.3');
  });

  it('annotates an item with the rules axe-core could not decide', () => {
    const scanResult = { incomplete: [{ id: 'color-contrast' }, { id: 'color-contrast' }] };

    const item = buildManualChecklist(target, scanResult).items.find(
      (candidate) => candidate.criterionId === '1.4.3',
    );

    expect(item?.incompleteRuleIds).toEqual(['color-contrast']);
  });

  it('reports an automated criterion with an incomplete rule instead of assuming it passed', () => {
    expect(
      buildManualChecklist(target, { incomplete: [{ id: 'html-lang-valid' }] })
        .undecidedAutomatedCriterionIds,
    ).toEqual(['3.1.1']);
    expect(buildManualChecklist(target, { incomplete: [] }).undecidedAutomatedCriterionIds).toEqual([]);
    expect(buildManualChecklist(target).undecidedAutomatedCriterionIds).toEqual([]);
  });

  it('leaves out criteria above the target level', () => {
    const ids = buildManualChecklist({ wcagVersion: '2.1', level: 'A' }).items.map(
      (item) => item.criterionId,
    );

    expect(ids).not.toContain('1.4.3');
    expect(ids).toContain('1.1.1');
  });
});
