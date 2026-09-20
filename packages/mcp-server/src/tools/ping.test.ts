// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { pingTool } from './ping.js';

describe('pingTool', () => {
  it('reports pong: true and the package version', async () => {
    const result = await pingTool.handler({});

    expect(result.pong).toBe(true);
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
