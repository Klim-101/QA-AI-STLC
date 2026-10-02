// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { BrowserSessionStore, type BrowserOperationContext, type EngineContext } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';

/**
 * What the `qa.browser_*` tools are built from. A browsing session spans several tool calls —
 * open, navigate, click, snapshot, close each arrive as a separate MCP request — so unlike every
 * other tool, these cannot rebuild their whole world per call: the session store is created once
 * by the server's entry point and closed over by the tool handlers. The `EngineContext` still is
 * rebuilt per call, exactly as the other tools do it.
 */
export interface BrowserToolDependencies {
  readonly sessions: BrowserSessionStore;
  readonly createContext: () => EngineContext;
}

export function createBrowserToolDependencies(): BrowserToolDependencies {
  return { sessions: new BrowserSessionStore(), createContext: createNodeEngineContext };
}

/** The per-call `BrowserOperationContext` a tool handler passes to its core operation. */
export function toBrowserOperationContext(dependencies: BrowserToolDependencies): BrowserOperationContext {
  return { engine: dependencies.createContext(), sessions: dependencies.sessions };
}

/** The element an action tool acts on: a selector, or a ref from `qa.browser_snapshot`. */
export const ELEMENT_TARGET_FIELDS = {
  selector: z
    .string()
    .optional()
    .describe('A Playwright selector for the element. Give this or `ref`, not both.'),
  ref: z
    .string()
    .optional()
    .describe(
      'A ref such as e3 from the latest qa.browser_snapshot of this session. Give this or `selector`, not both. Fails with BROWSER_REF_STALE after a navigation, a newer snapshot, or when the element changed.',
    ),
};

/** The `selector`/`ref` pair of a tool input, as the core operation's options take it. */
export function toElementTarget(input: {
  readonly selector?: string | undefined;
  readonly ref?: string | undefined;
}): { readonly selector?: string; readonly ref?: string } {
  return {
    ...(input.selector !== undefined ? { selector: input.selector } : {}),
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
  };
}

export const SessionIdInputSchema = z.object({
  sessionId: z.string().describe('The session id returned by qa.browser_open.'),
});
