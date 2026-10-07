// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { DefectDraft } from '@qa-ai-stlc/schemas';
import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { renderDefectDraftMarkdown } from './defect-draft-markdown.js';

const DEFECT: DefectDraft = {
  schemaVersion: 1,
  id: 'defect-login-error-missing',
  title: 'Invalid credentials show no error message',
  severityProposal: 'major',
  category: 'functional',
  steps: ['Open the login page', 'Enter an unregistered email and any password', 'Click the "Log in" button'],
  expectedResult: 'The login page is redisplayed with an error message.',
  actualResult: 'The login page is redisplayed with no message.',
  environment: 'staging',
  requirementIds: ['authentication', 'session'],
  evidencePaths: ['evidence/run-demo-1/screenshot-1.png', 'evidence/run-demo-1/trace-1.zip'],
  status: 'draft',
  createdAt: '2026-10-06T10:00:00Z',
};

const SECURITY_DEFECT: DefectDraft = {
  ...DEFECT,
  id: 'defect-session-cookie-flags',
  title: 'Session cookie lacks the Secure flag',
  category: 'security',
  securityRiskArea: 'session management',
  securityConfidence: 'high',
  securitySuggestedRemediation: 'Set the Secure and HttpOnly attributes on the session cookie.',
  securityRegressionCheck: 'Assert the Set-Cookie header of the login response carries Secure.',
};

describe('renderDefectDraftMarkdown', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderDefectDraftMarkdown(DEFECT),
      './__snapshots__/defect-draft.golden.md',
    );
  });

  it('matches the golden file for a security draft', async () => {
    await expectMatchesGoldenFile(
      renderDefectDraftMarkdown(SECURITY_DEFECT),
      './__snapshots__/defect-draft-security.golden.md',
    );
  });

  it('omits the optional sections when the draft has no requirements and no evidence', () => {
    const markdown = renderDefectDraftMarkdown({ ...DEFECT, requirementIds: [], evidencePaths: [] });

    expect(markdown).not.toContain('**Requirements:**');
    expect(markdown).not.toContain('## Evidence');
  });

  it('omits the security section when a security draft carries no security fields', () => {
    const markdown = renderDefectDraftMarkdown({ ...DEFECT, category: 'security' });

    expect(markdown).not.toContain('## Security assessment');
  });

  it('renders only the security fields a security draft has', () => {
    const markdown = renderDefectDraftMarkdown({
      ...DEFECT,
      category: 'security',
      securityConfidence: 'low',
    });

    expect(markdown).toContain('**Confidence:** low');
    expect(markdown).not.toContain('**Risk area:**');
    expect(markdown).not.toContain('**Suggested remediation:**');
    expect(markdown).not.toContain('**Regression check:**');
  });

  it('ends with a single trailing newline', () => {
    const markdown = renderDefectDraftMarkdown(DEFECT);

    expect(markdown.endsWith('\n')).toBe(true);
    expect(markdown.endsWith('\n\n')).toBe(false);
  });
});
