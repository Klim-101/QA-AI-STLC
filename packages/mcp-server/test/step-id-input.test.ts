// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createBrowserClickTool } from '../src/tools/browser-click.js';
import { createHttpExecuteTool } from '../src/tools/http-execute.js';
import type { BrowserToolDependencies } from '../src/tools/browser-dependencies.js';

// The tools only parse their input here, so no dependency is ever used.
const dependencies = {} as BrowserToolDependencies;

describe('stepId input of the case-execution tools', () => {
  it('refuses an id that is not a case step, such as the expected result', () => {
    const click = createBrowserClickTool(dependencies);
    const request = createHttpExecuteTool(dependencies);

    expect(
      click.inputSchema.safeParse({ sessionId: 's1', selector: '#a', stepId: 'expected-result' }).success,
    ).toBe(false);
    expect(request.inputSchema.safeParse({ url: 'https://a.test/', stepId: 'expected-result' }).success).toBe(
      false,
    );
  });

  it('accepts step-<N>', () => {
    const click = createBrowserClickTool(dependencies);

    expect(click.inputSchema.safeParse({ sessionId: 's1', selector: '#a', stepId: 'step-2' }).success).toBe(
      true,
    );
  });
});
