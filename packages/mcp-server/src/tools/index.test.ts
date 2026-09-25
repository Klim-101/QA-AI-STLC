// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { BUILTIN_TOOLS, createBuiltinTools } from './index.js';
import { pingTool } from './ping.js';

describe('BUILTIN_TOOLS', () => {
  it('includes the ping health check', () => {
    expect(BUILTIN_TOOLS).toContain(pingTool);
  });
});

describe('createBuiltinTools', () => {
  it('adds the browser tools and the session-bound execution tool to the stateless ones', () => {
    const names = createBuiltinTools().map((tool) => tool.name);

    expect(names).toContain('qa.ping');
    expect(names.filter((name) => name.startsWith('qa.browser_'))).toEqual([
      'qa.browser_open',
      'qa.browser_navigate',
      'qa.browser_click',
      'qa.browser_fill',
      'qa.browser_snapshot',
      'qa.browser_accessibility_scan',
      'qa.browser_close',
    ]);
    expect(names).toContain('qa.registry_execute_register');
  });

  it('gives every tool a unique name', () => {
    const names = createBuiltinTools().map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
  });
});
