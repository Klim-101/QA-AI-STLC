// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { assertCaseSelectorsSupported } from './case-selectors.js';

function caseWith(overrides: Pick<TestCase, 'steps'> & Partial<Pick<TestCase, 'resultExpectations'>>) {
  return { id: 'login', ...overrides };
}

describe('assertCaseSelectorsSupported', () => {
  it('accepts supported selectors, page-level kinds and steps without expectations', () => {
    expect(() => {
      assertCaseSelectorsSupported(
        caseWith({
          steps: [
            { description: 'Open' },
            {
              description: 'Check',
              expectations: [{ kind: 'visible', selector: 'role=button[name="Save"]' }],
            },
            { description: 'Land', expectations: [{ kind: 'url', expected: '/tasks' }] },
          ],
          resultExpectations: [{ kind: 'count', selector: '[data-testid="row"]', expected: 2 }],
        }),
      );
    }).not.toThrow();
  });

  it('names the step and the accepted forms for an unsupported engine', () => {
    expect(() => {
      assertCaseSelectorsSupported(
        caseWith({
          steps: [
            { description: 'Open' },
            { description: 'Check', expectations: [{ kind: 'visible', selector: 'label=Title' }] },
          ],
        }),
      );
    }).toThrow('step 2 (step-2)');
  });

  it('checks the result expectations too', () => {
    expect(() => {
      assertCaseSelectorsSupported(
        caseWith({ steps: [], resultExpectations: [{ kind: 'hidden', selector: 'testid=x' }] }),
      );
    }).toThrow('the result expectations');
  });
});
