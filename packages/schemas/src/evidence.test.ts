// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { BrowserActionSchema, EvidenceQuarantineReceiptSchema, EvidenceSchema } from './evidence.js';

const validHash = 'a'.repeat(64);

describe('EvidenceSchema', () => {
  it('accepts a registered screenshot', () => {
    const result = EvidenceSchema.safeParse({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'screenshot',
      path: 'evidence/run-1/step-3.png',
      sha256: validHash,
      createdAt: '2026-09-16T12:00:00Z',
      redacted: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a hash that is not 64 lowercase hex characters', () => {
    const result = EvidenceSchema.safeParse({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'screenshot',
      path: 'evidence/run-1/step-3.png',
      sha256: 'ABCDEF',
      createdAt: '2026-09-16T12:00:00Z',
      redacted: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an absolute path', () => {
    const result = EvidenceSchema.safeParse({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'screenshot',
      path: '/etc/passwd',
      sha256: validHash,
      createdAt: '2026-09-16T12:00:00Z',
      redacted: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('EvidenceQuarantineReceiptSchema', () => {
  it('accepts a receipt naming only pattern kinds, never a matched value', () => {
    const result = EvidenceQuarantineReceiptSchema.safeParse({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'trace',
      createdAt: '2026-09-16T12:00:00Z',
      reason: 'secret-detected',
      patterns: ['bearer-token'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a receipt with no patterns', () => {
    const result = EvidenceQuarantineReceiptSchema.safeParse({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'trace',
      createdAt: '2026-09-16T12:00:00Z',
      reason: 'secret-detected',
      patterns: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('BrowserActionSchema', () => {
  it('accepts a navigation record', () => {
    const result = BrowserActionSchema.safeParse({
      type: 'navigate',
      sessionId: 'session-1',
      url: 'https://staging.example.test/login',
      httpStatus: 200,
      at: '2026-09-21T12:00:00Z',
    });
    expect(result.success).toBe(true);
    expect(result.data?.schemaVersion).toBe(1);
  });

  it('accepts a fill record described only by its length', () => {
    const result = BrowserActionSchema.safeParse({
      type: 'fill',
      sessionId: 'session-1',
      selector: '#password',
      valueLength: 12,
      at: '2026-09-21T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an action type the engine does not perform', () => {
    const result = BrowserActionSchema.safeParse({
      type: 'download',
      sessionId: 'session-1',
      at: '2026-09-21T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative value length', () => {
    const result = BrowserActionSchema.safeParse({
      type: 'fill',
      sessionId: 'session-1',
      selector: '#password',
      valueLength: -1,
      at: '2026-09-21T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('EvidenceKindSchema', () => {
  it('accepts the action kind a browser session registers', () => {
    const result = EvidenceSchema.safeParse({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'action',
      path: 'evidence/run-1/evidence-1.json',
      sha256: validHash,
      createdAt: '2026-09-16T12:00:00Z',
      redacted: false,
    });
    expect(result.success).toBe(true);
  });
});
