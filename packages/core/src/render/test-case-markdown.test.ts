// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { renderTestCaseMarkdown } from './test-case-markdown.js';

function baseCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    schemaVersion: 1,
    id: 'login-invalid-credentials',
    feature: 'auth',
    requirementIds: ['authentication'],
    testType: 'e2e',
    title: 'Invalid credentials show an error and stay on the login page',
    steps: [
      { description: 'Enter a registered account\'s email into the "Email" field' },
      { description: 'Click the "Log in" button' },
    ],
    expectedResult: 'The login page is redisplayed with an error message.',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
    ...overrides,
  };
}

describe('renderTestCaseMarkdown', () => {
  it('renders the title, metadata, steps and expected result', () => {
    const markdown = renderTestCaseMarkdown(baseCase());

    expect(markdown).toContain('# Invalid credentials show an error and stay on the login page');
    expect(markdown).toContain('**Feature:** auth');
    expect(markdown).toContain('**Requirements:** authentication');
    expect(markdown).toContain('**Test type:** e2e');
    expect(markdown).toContain('**Status:** draft');
    expect(markdown).toContain('## Steps');
    expect(markdown).toContain('1. Enter a registered account\'s email into the "Email" field');
    expect(markdown).toContain('2. Click the "Log in" button');
    expect(markdown).toContain('## Expected result');
    expect(markdown).toContain('The login page is redisplayed with an error message.');
  });

  it('joins multiple requirement ids with a comma', () => {
    const markdown = renderTestCaseMarkdown(baseCase({ requirementIds: ['authentication', 'session'] }));

    expect(markdown).toContain('**Requirements:** authentication, session');
  });

  it('numbers preconditions when present', () => {
    const markdown = renderTestCaseMarkdown(
      baseCase({ preconditions: ['The user is on the login page', 'No session is active'] }),
    );

    expect(markdown).toContain('## Preconditions');
    expect(markdown).toContain('1. The user is on the login page');
    expect(markdown).toContain('2. No session is active');
  });

  it('omits the preconditions section when there are none', () => {
    const markdown = renderTestCaseMarkdown(baseCase());

    expect(markdown).not.toContain('## Preconditions');
  });

  it('omits the preconditions section when the array is present but empty', () => {
    const markdown = renderTestCaseMarkdown(baseCase({ preconditions: [] }));

    expect(markdown).not.toContain('## Preconditions');
  });

  it('includes the regression tier when present', () => {
    const markdown = renderTestCaseMarkdown(baseCase({ regressionTier: 'smoke' }));

    expect(markdown).toContain('**Regression tier:** smoke');
  });

  it('omits the regression tier line when absent', () => {
    const markdown = renderTestCaseMarkdown(baseCase());

    expect(markdown).not.toContain('**Regression tier:**');
  });

  it('includes the description under the title when present', () => {
    const markdown = renderTestCaseMarkdown(baseCase({ description: 'Covers the negative login path.' }));

    expect(markdown).toContain('Covers the negative login path.');
  });

  it('ends with a single trailing newline', () => {
    const markdown = renderTestCaseMarkdown(baseCase());

    expect(markdown.endsWith('\n')).toBe(true);
    expect(markdown.endsWith('\n\n')).toBe(false);
  });
});
