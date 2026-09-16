// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';

describe('QaError', () => {
  it('carries a stable code and message', () => {
    const error = new QaError('SOME_CODE', 'something went wrong');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('QaError');
    expect(error.code).toBe('SOME_CODE');
    expect(error.message).toBe('something went wrong');
    expect(error.remediation).toBeUndefined();
  });

  it('carries an optional remediation and cause', () => {
    const cause = new Error('root cause');
    const error = new QaError('SOME_CODE', 'something went wrong', {
      remediation: 'do this instead',
      cause,
    });
    expect(error.remediation).toBe('do this instead');
    expect(error.cause).toBe(cause);
  });
});
