// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { toToolErrorPayload } from './tool-error.js';

describe('toToolErrorPayload', () => {
  it('carries a QaError code and remediation through unchanged', () => {
    const error = new QaError('CONFIG_MISSING', 'No .qa/config.yaml found', {
      remediation: 'Run "qa init".',
    });

    expect(toToolErrorPayload(error)).toEqual({
      code: 'CONFIG_MISSING',
      message: 'No .qa/config.yaml found',
      remediation: 'Run "qa init".',
    });
  });

  it('omits remediation when the QaError has none', () => {
    const error = new QaError('CONFIG_MISSING', 'No .qa/config.yaml found');

    expect(toToolErrorPayload(error)).toEqual({
      code: 'CONFIG_MISSING',
      message: 'No .qa/config.yaml found',
    });
  });

  it('maps a plain Error to a generic internal-error code with its message', () => {
    expect(toToolErrorPayload(new Error('boom'))).toEqual({
      code: 'MCP_TOOL_INTERNAL_ERROR',
      message: 'boom',
    });
  });

  it('maps a non-Error throw to a generic internal-error code with its string form', () => {
    expect(toToolErrorPayload('boom')).toEqual({
      code: 'MCP_TOOL_INTERNAL_ERROR',
      message: 'boom',
    });
  });
});
