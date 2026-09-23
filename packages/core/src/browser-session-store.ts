// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from './errors.js';
import type { BlockedRequest } from './browser-safe-mode.js';
import type { AuthBrowser, AuthBrowserContext, AuthPage } from './ports/browser-launcher.js';
import { systemClock, type Clock } from './ports/clock.js';
import { randomIdGenerator, type IdGenerator } from './ports/id-generator.js';

/**
 * How long a session may sit untouched before the next tool call closes it instead of using it.
 * An agent that opens a browser and then wanders off must not leave a real Chromium process
 * running for the rest of the host's lifetime.
 */
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export interface BrowserSession {
  readonly sessionId: string;
  /** The run every piece of evidence this session registers is filed under (`.qa/evidence/<runId>/`). */
  readonly runId: string;
  readonly browser: AuthBrowser;
  readonly context: AuthBrowserContext;
  readonly page: AuthPage;
  readonly allowlist: readonly string[];
  /** The environment's configured URL (#306): every allowed host must share its scheme and port. */
  readonly baseUrl: string;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  /** Every non-GET request safe mode aborted during this session, in order. */
  readonly blockedRequests: readonly BlockedRequest[];
}

type MutableSession = { -readonly [Key in keyof BrowserSession]: BrowserSession[Key] };

export interface BrowserSessionStoreOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly idleTimeoutMs?: number;
}

export interface OpenBrowserSessionOptions {
  readonly browser: AuthBrowser;
  readonly context: AuthBrowserContext;
  readonly page: AuthPage;
  readonly allowlist: readonly string[];
  readonly baseUrl: string;
  /** The array safe mode's route handler pushes into, so the session can report what it blocked. */
  readonly blockedRequests: readonly BlockedRequest[];
}

/**
 * The live browser sessions an agent drives through the `qa.browser_*` tools (ADR-005). Each MCP
 * tool call arrives as a separate request, so the sessions have to outlive any one of them: the
 * host constructs one store and hands it to every browser tool, rather than a module-level
 * singleton, which AGENTS.md 5.3 forbids and which would make the store untestable.
 *
 * The idle timeout is enforced lazily, when a session is next looked up, rather than by a timer:
 * a pending timer would keep the MCP server's event loop alive and would need fake timers to
 * test, for no behavioral gain — nothing observes an expired session except the next call.
 */
export class BrowserSessionStore {
  private readonly sessions = new Map<string, MutableSession>();
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  private readonly idleTimeoutMs: number;

  constructor(options: BrowserSessionStoreOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.idGenerator = options.idGenerator ?? randomIdGenerator;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
  }

  get sessionIds(): readonly string[] {
    return [...this.sessions.keys()];
  }

  /** Registers an already-launched browser as a session and mints its id and run id. */
  open(options: OpenBrowserSessionOptions): BrowserSession {
    const now = this.clock.now();
    const session: MutableSession = {
      sessionId: `session-${this.idGenerator.next()}`,
      runId: `run-${this.idGenerator.next()}`,
      browser: options.browser,
      context: options.context,
      page: options.page,
      allowlist: [...options.allowlist],
      baseUrl: options.baseUrl,
      createdAt: now,
      lastActivityAt: now,
      blockedRequests: options.blockedRequests,
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Looks a session up and marks it used. An idle-expired session is closed and reported as
   * expired rather than silently handed back, so an agent never acts on a dead page.
   */
  async get(sessionId: string): Promise<BrowserSession> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new QaError('BROWSER_SESSION_NOT_FOUND', `No open browser session "${sessionId}"`, {
        remediation: 'Open one with qa.browser_open, or check the session id from its result.',
      });
    }
    const now = this.clock.now();
    if (now.getTime() - session.lastActivityAt.getTime() > this.idleTimeoutMs) {
      await this.close(sessionId);
      throw new QaError(
        'BROWSER_SESSION_EXPIRED',
        `Browser session "${sessionId}" was idle for more than ${String(this.idleTimeoutMs)} ms and has been closed`,
        { remediation: 'Open a new session with qa.browser_open.' },
      );
    }
    session.lastActivityAt = now;
    return session;
  }

  /** Closes a session's browser and forgets it. Unknown or already-closed ids are a no-op. */
  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return;
    }
    this.sessions.delete(sessionId);
    try {
      await session.context.close();
    } finally {
      await session.browser.close();
    }
  }

  /** Closes every open session, for the host's own shutdown path. */
  async closeAll(): Promise<void> {
    await Promise.all(this.sessionIds.map((sessionId) => this.close(sessionId)));
  }

  /**
   * A fresh evidence id. Minted here because the store owns the session's injected id generator,
   * which is also what makes an evidence path assertable in a test (AGENTS.md 12.6).
   */
  nextEvidenceId(): string {
    return `evidence-${this.idGenerator.next()}`;
  }
}
