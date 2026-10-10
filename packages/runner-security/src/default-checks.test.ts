// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { DEFAULT_SECURITY_CHECKS } from './default-checks.js';

describe('DEFAULT_SECURITY_CHECKS', () => {
  it('lists each implemented class exactly once', () => {
    expect(DEFAULT_SECURITY_CHECKS.map((check) => check.checkClass)).toEqual([
      'headers',
      'cookies',
      'cors',
      'errors',
      'encoding',
    ]);
  });
});
