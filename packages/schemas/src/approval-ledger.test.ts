// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ApprovalLedgerSchema } from './approval-ledger.js';

describe('ApprovalLedgerSchema', () => {
  it('accepts an approval bound to an artifact hash', () => {
    const result = ApprovalLedgerSchema.safeParse({
      approvals: [
        {
          gate: 'case-review',
          artifactPath: 'artifacts/cases/case-1.json',
          artifactSha256: 'c'.repeat(64),
          approvedBy: 'operator@example.com',
          approvedAt: '2026-09-16T12:00:00Z',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an approval whose artifact path is absolute', () => {
    const result = ApprovalLedgerSchema.safeParse({
      approvals: [
        {
          gate: 'case-review',
          artifactPath: '/artifacts/cases/case-1.json',
          artifactSha256: 'c'.repeat(64),
          approvedBy: 'operator@example.com',
          approvedAt: '2026-09-16T12:00:00Z',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
