// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { BUILTIN_TOOLS } from './index.js';
import { pingTool } from './ping.js';

describe('BUILTIN_TOOLS', () => {
  it('includes the ping health check', () => {
    expect(BUILTIN_TOOLS).toContain(pingTool);
  });
});
