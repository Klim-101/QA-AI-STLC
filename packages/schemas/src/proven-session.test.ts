// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ProvenActionSchema, ProvenSessionSchema, ProvenStepSchema } from './proven-session.js';

describe('ProvenActionSchema', () => {
  it('accepts a browser action', () => {
    const result = ProvenActionSchema.safeParse({
      type: 'click',
      sessionId: 'session-1',
      stepId: 'step-1',
      selector: 'role=button[name="Log in"]',
      at: '2026-09-25T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an http request record', () => {
    const result = ProvenActionSchema.safeParse({
      type: 'http-request',
      stepId: 'step-1',
      method: 'GET',
      url: 'https://staging.example.test/',
      status: 200,
      responseHeaders: {},
      bodyPreview: '',
      truncated: false,
      at: '2026-09-25T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a record matching neither shape', () => {
    const result = ProvenActionSchema.safeParse({ type: 'unknown' });
    expect(result.success).toBe(false);
  });
});

describe('ProvenStepSchema', () => {
  it('accepts a step with at least one action', () => {
    const result = ProvenStepSchema.safeParse({
      stepId: 'step-1',
      description: 'Click the login button',
      actions: [
        {
          type: 'click',
          sessionId: 'session-1',
          stepId: 'step-1',
          at: '2026-09-25T12:00:00Z',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a step with no actions', () => {
    const result = ProvenStepSchema.safeParse({
      stepId: 'step-1',
      description: 'Click the login button',
      actions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ProvenSessionSchema', () => {
  it('accepts a session with at least one step', () => {
    const result = ProvenSessionSchema.safeParse({
      testCaseId: 'login-valid-credentials',
      runResultId: 'run-result-1',
      steps: [
        {
          stepId: 'step-1',
          description: 'Click the login button',
          actions: [{ type: 'click', sessionId: 'session-1', stepId: 'step-1', at: '2026-09-25T12:00:00Z' }],
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.schemaVersion).toBe(1);
  });

  it('rejects a session with no steps', () => {
    const result = ProvenSessionSchema.safeParse({
      testCaseId: 'login-valid-credentials',
      runResultId: 'run-result-1',
      steps: [],
    });
    expect(result.success).toBe(false);
  });
});
