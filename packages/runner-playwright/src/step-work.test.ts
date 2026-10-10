// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { classifyStep, findStepsWithoutWork, StepWorkRecorder, type StepWork } from './step-work.js';

const NO_WORK: StepWork = { actions: 0, assertions: 0, webFirstAssertions: 0 };

describe('classifyStep', () => {
  it('treats a page or request action as an action', () => {
    expect(classifyStep('pw:api', 'Click')).toEqual({ category: 'pw:api', isWebFirst: false });
  });

  it('treats a retrying page matcher as a web-first assertion', () => {
    expect(classifyStep('expect', 'Expect "toBeVisible"')).toEqual({ category: 'expect', isWebFirst: true });
  });

  it('treats a generic matcher as an assertion that is not web-first', () => {
    expect(classifyStep('expect', 'Expect "toBe"')).toEqual({ category: 'expect', isWebFirst: false });
  });

  it('does not count toPass, which only wraps assertions that are counted themselves', () => {
    expect(classifyStep('expect', 'Expect "toPass"')).toEqual({ category: 'expect', isWebFirst: false });
  });

  it('does not recognize an assertion title it cannot parse as web-first', () => {
    expect(classifyStep('expect', 'Poll something')).toEqual({ category: 'expect', isWebFirst: false });
  });

  it.each(['fixture', 'hook', 'test.step', 'attach'])('ignores a %s step', (category) => {
    expect(classifyStep(category, 'anything')).toBeUndefined();
  });
});

describe('StepWorkRecorder', () => {
  it('credits the work to every enclosing step', () => {
    const recorder = new StepWorkRecorder();

    recorder.record({ category: 'pw:api', isWebFirst: false }, ['step-1', 'outer']);
    recorder.record({ category: 'expect', isWebFirst: true }, ['step-1']);
    recorder.record({ category: 'expect', isWebFirst: false }, ['step-1']);

    expect(recorder.toRecord()).toEqual({
      'step-1': { actions: 1, assertions: 2, webFirstAssertions: 1 },
      outer: { actions: 1, assertions: 0, webFirstAssertions: 0 },
    });
  });

  it('records nothing for work outside any step', () => {
    const recorder = new StepWorkRecorder();

    recorder.record({ category: 'pw:api', isWebFirst: false }, []);

    expect(recorder.toRecord()).toEqual({});
  });
});

describe('findStepsWithoutWork', () => {
  const required = ['step-1', 'expected-result'];

  it('flags a step that contains neither an action nor an assertion', () => {
    expect(findStepsWithoutWork(required, 'expected-result', {}, 'web-first-assertion')).toEqual([
      'step-1',
      'expected-result',
    ]);
  });

  it('accepts a step that only asserts, and a step that only acts', () => {
    const work = { 'step-1': { ...NO_WORK, assertions: 1 }, 'expected-result': NO_WORK };

    expect(findStepsWithoutWork(['step-1'], 'expected-result', work, 'any-assertion')).toEqual([]);
    expect(
      findStepsWithoutWork(
        ['step-1'],
        'expected-result',
        { 'step-1': { ...NO_WORK, actions: 1 } },
        'any-assertion',
      ),
    ).toEqual([]);
  });

  it('wants a web-first assertion in the expected result of a browser test', () => {
    const work = { 'expected-result': { actions: 0, assertions: 1, webFirstAssertions: 0 } };

    expect(findStepsWithoutWork(['expected-result'], 'expected-result', work, 'web-first-assertion')).toEqual(
      ['expected-result'],
    );
    expect(
      findStepsWithoutWork(
        ['expected-result'],
        'expected-result',
        { 'expected-result': { actions: 0, assertions: 1, webFirstAssertions: 1 } },
        'web-first-assertion',
      ),
    ).toEqual([]);
  });

  it('accepts any assertion in the expected result of an API test, but not an action alone', () => {
    const acting = { 'expected-result': { ...NO_WORK, actions: 2 } };
    const asserting = { 'expected-result': { ...NO_WORK, assertions: 1 } };

    expect(findStepsWithoutWork(['expected-result'], 'expected-result', acting, 'any-assertion')).toEqual([
      'expected-result',
    ]);
    expect(findStepsWithoutWork(['expected-result'], 'expected-result', asserting, 'any-assertion')).toEqual(
      [],
    );
  });

  it('holds the expected result of a scan-based test to the ordinary rule', () => {
    const acting = { 'expected-result': { ...NO_WORK, actions: 1 } };

    expect(findStepsWithoutWork(['expected-result'], 'expected-result', acting, 'any-work')).toEqual([]);
    expect(findStepsWithoutWork(['expected-result'], 'expected-result', {}, 'any-work')).toEqual([
      'expected-result',
    ]);
  });
});
