// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { judgeExpectation, type ElementReading, type PageObservation } from './expectation.js';

const URL = 'https://staging.example.test/tasks?page=2';
const READING: ElementReading = {
  visible: true,
  text: '  Task  saved \n now ',
  value: 'casey',
  checked: false,
  inputType: 'text',
};

function one(overrides: Partial<ElementReading> = {}): PageObservation {
  return { url: URL, matchCount: 1, element: { ...READING, ...overrides } };
}

const NONE: PageObservation = { url: URL, matchCount: 0 };
const MANY: PageObservation = { url: URL, matchCount: 3 };
const UNREADABLE: PageObservation = { url: URL, matchCount: 1 };

describe('judgeExpectation', () => {
  describe('visible', () => {
    it.each([
      [one(), true, 'visible'],
      [one({ visible: false }), false, 'hidden'],
      [NONE, false, 'absent'],
      [MANY, false, 'ambiguous'],
      [UNREADABLE, false, 'unreadable'],
    ])('observing %j', (observation, passed, observed) => {
      expect(judgeExpectation({ kind: 'visible', exact: false }, observation)).toEqual({ passed, observed });
    });
  });

  describe('hidden', () => {
    it.each([
      [one(), false, 'visible'],
      [one({ visible: false }), true, 'hidden'],
      [NONE, true, 'absent'],
      [MANY, false, 'ambiguous'],
      [UNREADABLE, false, 'unreadable'],
    ])('observing %j', (observation, passed, observed) => {
      expect(judgeExpectation({ kind: 'hidden', exact: false }, observation)).toEqual({ passed, observed });
    });
  });

  describe('text', () => {
    it('matches by containment, ignoring whitespace and its amount', () => {
      expect(judgeExpectation({ kind: 'text', expected: 'Task saved now', exact: false }, one())).toEqual({
        passed: true,
        observed: READING.text,
      });
    });

    it('matches in full when exact, still ignoring whitespace', () => {
      expect(
        judgeExpectation({ kind: 'text', expected: 'Task saved now', exact: true }, one()),
      ).toMatchObject({
        passed: true,
      });
      expect(judgeExpectation({ kind: 'text', expected: 'Task saved', exact: true }, one())).toMatchObject({
        passed: false,
      });
    });

    it('is case sensitive', () => {
      expect(judgeExpectation({ kind: 'text', expected: 'task', exact: false }, one())).toMatchObject({
        passed: false,
      });
    });

    it.each([NONE, MANY])('fails without an observed value for %j', (observation) => {
      expect(judgeExpectation({ kind: 'text', expected: 'Task', exact: false }, observation)).toEqual({
        passed: false,
      });
    });
  });

  describe('value', () => {
    it('compares the value exactly', () => {
      expect(judgeExpectation({ kind: 'value', expected: 'casey', exact: false }, one())).toEqual({
        passed: true,
        observed: 'casey',
      });
      expect(judgeExpectation({ kind: 'value', expected: 'case', exact: false }, one())).toEqual({
        passed: false,
        observed: 'casey',
      });
    });

    it.each([one({ value: null }), NONE, MANY])('fails without an observed value for %j', (observation) => {
      expect(judgeExpectation({ kind: 'value', expected: '', exact: false }, observation)).toEqual({
        passed: false,
      });
    });
  });

  describe('checked', () => {
    it('compares the checked state', () => {
      expect(judgeExpectation({ kind: 'checked', expected: false, exact: false }, one())).toEqual({
        passed: true,
        observed: false,
      });
      expect(judgeExpectation({ kind: 'checked', expected: true, exact: false }, one())).toEqual({
        passed: false,
        observed: false,
      });
    });

    it.each([one({ checked: null }), NONE, MANY])('fails without an observed state for %j', (observation) => {
      expect(judgeExpectation({ kind: 'checked', expected: true, exact: false }, observation)).toEqual({
        passed: false,
      });
    });
  });

  describe('count', () => {
    it.each([
      [0, NONE, true],
      [1, one(), true],
      [3, MANY, true],
      [2, MANY, false],
    ])('expecting %i of %j', (expected, observation, passed) => {
      expect(judgeExpectation({ kind: 'count', expected, exact: false }, observation)).toEqual({
        passed,
        observed: observation.matchCount,
      });
    });
  });

  describe('url', () => {
    it('matches by containment, or in full when exact', () => {
      expect(judgeExpectation({ kind: 'url', expected: '/tasks', exact: false }, NONE)).toEqual({
        passed: true,
        observed: URL,
      });
      expect(judgeExpectation({ kind: 'url', expected: '/tasks', exact: true }, NONE)).toEqual({
        passed: false,
        observed: URL,
      });
      expect(judgeExpectation({ kind: 'url', expected: URL, exact: true }, NONE)).toMatchObject({
        passed: true,
      });
    });
  });

  it('refuses a kind it does not know', () => {
    expect(() => judgeExpectation({ kind: 'colour' as never, exact: false }, NONE)).toThrow(
      'Unhandled expectation kind',
    );
  });
});
