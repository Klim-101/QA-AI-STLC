// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserSessionStore } from '../browser-session-store.js';
import type { EngineContext } from '../engine-context.js';

/**
 * What a `browser.*` operation needs on top of the ordinary `EngineContext`: the live sessions,
 * which have to outlive a single call because an exploratory session arrives as a sequence of
 * separate MCP requests (ADR-005).
 *
 * Kept as a second, browser-only context rather than a field on `EngineContext` so that every
 * other operation — and every host that builds a context per call — stays free of browser
 * session state it never uses.
 */
export interface BrowserOperationContext {
  readonly engine: EngineContext;
  readonly sessions: BrowserSessionStore;
}
