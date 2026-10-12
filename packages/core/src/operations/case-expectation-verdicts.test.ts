// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserAction, CaseExpectation, HttpRequestRecord, TestCase } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { countCaseExpectations, evaluateCaseExpectations } from './case-expectation-verdicts.js';
import type { CitedObservation } from './case-result-observations.js';

function testCase(
  testType: TestCase['testType'],
  steps: readonly { expectations?: CaseExpectation[] }[],
  resultExpectations?: CaseExpectation[],
): TestCase {
  return {
    schemaVersion: 1,
    id: 'case-1',
    feature: 'checkout',
    requirementIds: ['r1'],
    testType,
    title: 'A case',
    steps: steps.map((step, index) => ({ description: `Step ${String(index + 1)}`, ...step })),
    expectedResult: 'It works',
    ...(resultExpectations === undefined ? {} : { resultExpectations }),
    status: 'approved',
    createdAt: '2026-09-20T12:00:00Z',
  };
}

function expectAction(
  stepId: string | undefined,
  recorded: { kind: string; passed: boolean; expected?: string | number | boolean },
  options: { selector?: string; at?: string } = {},
): CitedObservation {
  const action = {
    type: 'expect',
    sessionId: 'session-1',
    ...(stepId === undefined ? {} : { stepId }),
    ...(options.selector === undefined ? {} : { selector: options.selector }),
    expectation: recorded,
    at: options.at ?? '2026-09-20T12:00:10Z',
  } as unknown as BrowserAction;
  return { source: 'action', ...(stepId === undefined ? {} : { stepId }), action };
}

function request(
  stepId: string | undefined,
  status: number,
  bodyPreview = '',
  at = '2026-09-20T12:00:10Z',
): CitedObservation {
  const record: HttpRequestRecord = {
    schemaVersion: 1,
    type: 'http-request',
    method: 'GET',
    url: 'https://staging.example.test/x',
    status,
    responseHeaders: {},
    bodyPreview,
    truncated: false,
    at,
  };
  return { source: 'http', ...(stepId === undefined ? {} : { stepId }), record };
}

function scan(
  stepId: string | undefined,
  found: { violations?: number; uncertain?: number },
): CitedObservation {
  return {
    source: 'scan',
    ...(stepId === undefined ? {} : { stepId }),
    record: {
      schemaVersion: 1,
      type: 'a11y-scan',
      axeVersion: '4.0.0',
      configHash: 'a'.repeat(64),
      wcagVersion: '2.1',
      level: 'AA',
      bestPractices: false,
      tags: [],
      include: [],
      exclude: [],
      violations: Array.from({ length: found.violations ?? 0 }, () => ({ id: 'color-contrast' })),
      excepted: [],
      expiredExceptions: [],
      uncertain: Array.from({ length: found.uncertain ?? 0 }, () => ({ id: 'color-contrast' })),
      passedRuleIds: [],
      inapplicableRuleIds: [],
    },
  };
}

const verdictsOf = (subject: TestCase, observations: readonly CitedObservation[]): readonly string[] =>
  evaluateCaseExpectations(subject, observations).map((outcome) => outcome.verdict);

describe('evaluateCaseExpectations', () => {
  it('judges nothing for a case that declares no expectation', () => {
    expect(evaluateCaseExpectations(testCase('e2e', [{}]), [])).toEqual([]);
    expect(countCaseExpectations(testCase('e2e', [{}]))).toBe(0);
  });

  it('counts the expectations of steps and result together', () => {
    const subject = testCase(
      'e2e',
      [
        { expectations: [{ kind: 'visible', selector: '#a' }] },
        { expectations: [{ kind: 'url', expected: 'u' }] },
      ],
      [{ kind: 'hidden', selector: '#b' }],
    );

    expect(countCaseExpectations(subject)).toBe(3);
  });

  describe('browser expectations', () => {
    it('is met by a passed check of the same kind, target and value, at that step', () => {
      const subject = testCase('e2e', [
        { expectations: [{ kind: 'text', selector: 'h1', expected: 'Thanks' }] },
      ]);

      expect(
        verdictsOf(subject, [
          expectAction('step-1', { kind: 'text', passed: true, expected: 'Thanks' }, { selector: 'h1' }),
        ]),
      ).toEqual(['met']);
    });

    it('is unmet by a failed check and unobserved without one', () => {
      const subject = testCase('e2e', [{ expectations: [{ kind: 'visible', selector: '#done' }] }]);

      expect(
        verdictsOf(subject, [
          expectAction('step-1', { kind: 'visible', passed: false }, { selector: '#done' }),
        ]),
      ).toEqual(['unmet']);
      expect(verdictsOf(subject, [])).toEqual(['unobserved']);
    });

    it.each([
      ['another step', expectAction('step-2', { kind: 'visible', passed: true }, { selector: '#done' })],
      ['another selector', expectAction('step-1', { kind: 'visible', passed: true }, { selector: '#other' })],
      ['another kind', expectAction('step-1', { kind: 'hidden', passed: true }, { selector: '#done' })],
      [
        'a record that is not an expect',
        {
          source: 'action',
          stepId: 'step-1',
          action: { type: 'click', sessionId: 's', at: 'x' },
        } as CitedObservation,
      ],
      [
        'an expect without a verdict',
        {
          source: 'action',
          stepId: 'step-1',
          action: { type: 'expect', sessionId: 's', at: 'x' },
        } as CitedObservation,
      ],
      ['an http record', request('step-1', 200)],
    ])('does not count %s', (_label, observation) => {
      const subject = testCase('e2e', [{ expectations: [{ kind: 'visible', selector: '#done' }] }, {}]);

      expect(verdictsOf(subject, [observation])).toEqual(['unobserved']);
    });

    it('treats a check made for a different expected value as a different check', () => {
      const subject = testCase('e2e', [
        { expectations: [{ kind: 'text', selector: 'h1', expected: 'Thanks' }] },
      ]);

      expect(
        verdictsOf(subject, [
          expectAction('step-1', { kind: 'text', passed: true, expected: '' }, { selector: 'h1' }),
        ]),
      ).toEqual(['unobserved']);
    });

    it('compares count, value and url by their expected value', () => {
      const subject = testCase('e2e', [
        {
          expectations: [
            { kind: 'count', selector: 'li', expected: 3 },
            { kind: 'value', selector: '#e', expected: 'a@b.c' },
            { kind: 'url', expected: 'https://x/done' },
          ],
        },
      ]);

      expect(
        verdictsOf(subject, [
          expectAction('step-1', { kind: 'count', passed: true, expected: 3 }, { selector: 'li' }),
          expectAction('step-1', { kind: 'value', passed: true, expected: 'a@b.c' }, { selector: '#e' }),
          expectAction('step-1', { kind: 'url', passed: true, expected: 'https://x/done' }),
        ]),
      ).toEqual(['met', 'met', 'met']);
    });

    it('reads an absent checked value as checked on both sides', () => {
      const subject = testCase('e2e', [
        {
          expectations: [
            { kind: 'checked', selector: '#a' },
            { kind: 'checked', selector: '#b', expected: false },
          ],
        },
      ]);

      expect(
        verdictsOf(subject, [
          expectAction('step-1', { kind: 'checked', passed: true, expected: true }, { selector: '#a' }),
          expectAction('step-1', { kind: 'checked', passed: true }, { selector: '#b' }),
          expectAction('step-1', { kind: 'checked', passed: true, expected: false }, { selector: '#b' }),
        ]),
      ).toEqual(['met', 'met']);
    });

    it('lets the newest attempt decide, whatever order the evidence was cited in', () => {
      const subject = testCase('e2e', [{ expectations: [{ kind: 'visible', selector: '#done' }] }]);
      const failedEarly = expectAction(
        'step-1',
        { kind: 'visible', passed: false },
        { selector: '#done', at: '2026-09-20T12:00:05Z' },
      );
      const passedLate = expectAction(
        'step-1',
        { kind: 'visible', passed: true },
        { selector: '#done', at: '2026-09-20T12:00:20Z' },
      );

      expect(verdictsOf(subject, [passedLate, failedEarly])).toEqual(['met']);
      expect(verdictsOf(subject, [failedEarly, passedLate])).toEqual(['met']);
      expect(
        verdictsOf(subject, [
          passedLate,
          expectAction(
            'step-1',
            { kind: 'visible', passed: false },
            { selector: '#done', at: '2026-09-20T12:00:30Z' },
          ),
        ]),
      ).toEqual(['unmet']);
    });

    it('lets a result expectation be met by a record of any step', () => {
      const subject = testCase('e2e', [{}, {}], [{ kind: 'url', expected: 'https://x/done' }]);

      expect(
        verdictsOf(subject, [
          expectAction('step-2', { kind: 'url', passed: true, expected: 'https://x/done' }),
        ]),
      ).toEqual(['met']);
      expect(evaluateCaseExpectations(subject, [])[0]).toMatchObject({
        where: 'result',
        verdict: 'unobserved',
      });
    });
  });

  describe('response expectations', () => {
    it('judges a status by the newest request of the step', () => {
      const subject = testCase('api', [{ expectations: [{ kind: 'http-status', expected: 404 }] }]);

      expect(verdictsOf(subject, [request('step-1', 404)])).toEqual(['met']);
      expect(verdictsOf(subject, [request('step-1', 200)])).toEqual(['unmet']);
      expect(
        verdictsOf(subject, [request('step-1', 404, '', '2026-09-20T12:00:01Z'), request('step-1', 200)]),
      ).toEqual(['unmet']);
      expect(verdictsOf(subject, [request('step-2', 404), scan('step-1', {})])).toEqual(['unobserved']);
    });

    it('looks for a fragment in the body preview', () => {
      const subject = testCase('api', [
        { expectations: [{ kind: 'http-body-contains', expected: 'not found' }] },
      ]);

      expect(verdictsOf(subject, [request('step-1', 404, '{"error":"not found"}')])).toEqual(['met']);
      expect(verdictsOf(subject, [request('step-1', 404, '{}')])).toEqual(['unmet']);
      expect(verdictsOf(subject, [scan('step-1', {})])).toEqual(['unobserved']);
    });
  });

  describe('scan expectations', () => {
    it('is met by a clean scan and unmet by violations or uncertain results', () => {
      const subject = testCase('a11y', [{ expectations: [{ kind: 'a11y-clean' }] }]);

      expect(verdictsOf(subject, [scan('step-1', {})])).toEqual(['met']);
      expect(verdictsOf(subject, [scan('step-1', { violations: 1 })])).toEqual(['unmet']);
      expect(verdictsOf(subject, [scan('step-1', { uncertain: 1 })])).toEqual(['unmet']);
      expect(verdictsOf(subject, [scan('step-1', { violations: 1 }), scan('step-1', {})])).toEqual(['met']);
      expect(verdictsOf(subject, [request('step-1', 200)])).toEqual(['unobserved']);
    });
  });

  it('describes each expectation by kind, target and expected value', () => {
    const subject = testCase(
      'e2e',
      [
        {
          expectations: [
            { kind: 'text', selector: 'h1', expected: 'Thanks' },
            { kind: 'hidden', selector: '.x' },
          ],
        },
      ],
      [{ kind: 'url', expected: 'https://x/done' }],
    );

    expect(
      evaluateCaseExpectations(subject, []).map((outcome) => [outcome.where, outcome.description]),
    ).toEqual([
      ['step 1', 'text on "h1" = "Thanks"'],
      ['step 1', 'hidden on ".x"'],
      ['result', 'url = "https://x/done"'],
    ]);
  });
});
