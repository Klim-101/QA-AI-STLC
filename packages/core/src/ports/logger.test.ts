// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { noopLogger } from './logger.js';

describe('noopLogger', () => {
  it('does nothing for every level', () => {
    expect(() => {
      noopLogger.debug('debug');
      noopLogger.info('info', { key: 'value' });
      noopLogger.warn('warn');
      noopLogger.error('error');
    }).not.toThrow();
  });
});
