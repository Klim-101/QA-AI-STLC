// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { checkEngineVersionHandshake } from './version-handshake.js';

describe('checkEngineVersionHandshake', () => {
  it('does nothing when the actual and expected versions match', () => {
    expect(() => {
      checkEngineVersionHandshake({ actualVersion: '1.2.3', expectedVersion: '1.2.3' });
    }).not.toThrow();
  });

  it('does nothing when no expected version was given', () => {
    expect(() => {
      checkEngineVersionHandshake({ actualVersion: '1.2.3', expectedVersion: undefined });
    }).not.toThrow();
  });

  it('throws a coded, remediated QaError on a mismatch', () => {
    try {
      checkEngineVersionHandshake({ actualVersion: '1.2.3', expectedVersion: '1.0.0' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(QaError);
      const qaError = error as QaError;
      expect(qaError.code).toBe('ENGINE_VERSION_MISMATCH');
      expect(qaError.message).toContain('1.0.0');
      expect(qaError.message).toContain('1.2.3');
      expect(qaError.remediation).toContain('npm run generate');
    }
  });
});
