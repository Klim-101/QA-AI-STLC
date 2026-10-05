// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserDialogKind } from '@qa-ai-stlc/schemas';
import type { ElementRefTable } from './element-refs.js';
import { EventLog, type ConsoleLogEntry, type NetworkLogEntry } from './browser-event-log.js';
import type { PageViewEntry } from './page-view.js';
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

/** How many snapshots a session keeps to compare a later one with; the oldest is forgotten first. */
export const MAX_REMEMBERED_SNAPSHOTS = 5;

/** How a date picker's input takes a date. */
export type DateEntry = 'text' | 'digits';

/**
 * One kind of component-library widget the widget actions (P6-43) can drive: the actions find the
 * widget wrapper by `wrapperSelector`, whichever element inside it a locator resolved to, and open
 * its popup by clicking `popupToggleSelector` inside it (the wrapper itself when there is none).
 */
export interface WidgetTarget {
  readonly wrapperSelector: string;
  readonly popupToggleSelector?: string;
  /**
   * How a date is entered: `text` (the default) fills the input with the formatted date; `digits`
   * types only its digits with key presses, for a segmented masked input that garbles a filled value.
   */
  readonly dateEntry?: DateEntry;
  /** Present when the widget is a data grid the grid actions (P6-44) can search. */
  readonly grid?: GridControls;
}

/**
 * How to move through the rows of a grid that does not render them all. Selectors are CSS,
 * relative to the grid wrapper. A grid with a pager is searched page by page, one with a
 * scrollable container that renders only the rows near the viewport by scrolling it.
 */
export interface GridControls {
  readonly nextPageSelector?: string;
  readonly previousPageSelector?: string;
  readonly scrollContainerSelector?: string;
}

/** One page of a session: the first one, or one the application opened (P6-59). */
export interface BrowserTab {
  /** The session's own id for the page (`tab-1`, `tab-2`, ...); never reused within a session. */
  readonly tabId: string;
  readonly page: AuthPage;
}

/**
 * Something that happened to the session's pages that the agent did not ask for: it is reported
 * once, in the result of the next tool call that reports notices (P6-59). `message` and `url`
 * come from the page and are untrusted.
 */
export type SessionNotice =
  | {
      readonly kind: 'dialog';
      readonly tabId: string;
      readonly dialogKind: BrowserDialogKind;
      readonly message: string;
      readonly handled: 'dismissed' | 'accepted';
    }
  | { readonly kind: 'tab-opened'; readonly tabId: string; readonly url: string }
  | { readonly kind: 'tab-blocked'; readonly url: string };

/**
 * An evidence record an event handler wants written. Handlers never write evidence themselves:
 * the manifest is read, changed and written back whole, so a write from an event callback would
 * race the one the running tool call is making. The record waits here, with the time it
 * happened, until the tool call that is running (or the next one) writes it.
 */
export interface QueuedBrowserRecord {
  readonly type: 'dialog' | 'tab-opened' | 'tab-blocked';
  readonly tabId: string;
  readonly at: Date;
  readonly url?: string;
  readonly dialog?: {
    readonly kind: BrowserDialogKind;
    readonly message: string;
    readonly handled: 'dismissed' | 'accepted';
  };
}

/** What the session's dialog policy does with a JavaScript dialog; dismissing is the default. */
export type DialogPolicy = 'dismiss' | 'accept';

/** What a session has seen the page log and request, for `qa.browser_console` and `qa.browser_network` (P6-61). */
export interface SessionEventLogs {
  readonly console: EventLog<ConsoleLogEntry>;
  readonly network: EventLog<NetworkLogEntry>;
}

export interface BrowserSession {
  readonly sessionId: string;
  /** The run every piece of evidence this session registers is filed under (`.qa/evidence/<runId>/`). */
  readonly runId: string;
  readonly browser: AuthBrowser;
  readonly context: AuthBrowserContext;
  /**
   * False for a browser the operator started and the session only attached to (P6-50): closing the
   * session then disconnects and leaves their browser and its tabs alone.
   */
  readonly ownsBrowser: boolean;
  /** The active page: the one every action acts on. It follows `qa.browser_tabs` switches. */
  readonly page: AuthPage;
  /** Every page the session still has open, in the order they opened. */
  readonly tabs: readonly BrowserTab[];
  readonly activeTabId: string;
  /** The page's console messages and requests since the session opened, bounded. */
  readonly eventLogs: SessionEventLogs;
  /** The number the next tab id gets; it never goes back, so a closed tab's id is never reused. */
  readonly nextTabNumber: number;
  /** What the session does with an `alert`, `confirm` or `prompt`; fixed for the session's life. */
  readonly dialogPolicy: DialogPolicy;
  readonly allowlist: readonly string[];
  /** The environment's configured URL (#306): every allowed host must share its scheme and port. */
  readonly baseUrl: string;
  /** The environment's resolved navigation/action timeouts (P6-23), fixed for the session's life. */
  readonly navigationTimeoutMs: number;
  readonly actionTimeoutMs: number;
  /** Selectors of busy indicators every engine browser action waits to clear (P6-42), fixed for the session's life. */
  readonly busySelectors: readonly string[];
  /** The widgets the widget actions (P6-43) know how to drive, fixed for the session's life. */
  readonly widgetTargets: readonly WidgetTarget[];
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  /** Every non-GET request safe mode aborted during this session, in order. */
  readonly blockedRequests: readonly BlockedRequest[];
  /**
   * The latest value of each request header a `from-browser` profile replays (lower-cased name),
   * seen on a request to an allowlisted host. In memory only (ADR-0012).
   */
  readonly observedRequestHeaders: ReadonlyMap<string, string>;
  /** The refs of the latest snapshot; absent before the first one and after a navigation. */
  readonly elementRefs: ElementRefTable | undefined;
  /** The number the next ref handed out gets; it never goes back, so an old ref is never reused. */
  readonly nextRefNumber: number;
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
  /** Omit for a browser the engine launched; `false` for one it only attached to. */
  readonly ownsBrowser?: boolean;
  /** Omit for the default, which dismisses every dialog. */
  readonly dialogPolicy?: DialogPolicy;
  readonly allowlist: readonly string[];
  readonly baseUrl: string;
  readonly navigationTimeoutMs: number;
  readonly actionTimeoutMs: number;
  /** Omit for a session that never waits on busy indicators. */
  readonly busySelectors?: readonly string[];
  /** Omit for a session with no component library: the widget actions then work on the element as given. */
  readonly widgetTargets?: readonly WidgetTarget[];
  /** The array safe mode's route handler pushes into, so the session can report what it blocked. */
  readonly blockedRequests: readonly BlockedRequest[];
  /** The map the request observer writes into; a fresh empty one when omitted. */
  readonly observedRequestHeaders?: ReadonlyMap<string, string>;
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
  private readonly notices = new Map<string, SessionNotice[]>();
  private readonly queuedRecords = new Map<string, QueuedBrowserRecord[]>();
  private readonly snapshots = new Map<string, Map<string, readonly PageViewEntry[]>>();
  private readonly pendingTabWork = new Map<string, Set<Promise<void>>>();
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
      ownsBrowser: options.ownsBrowser ?? true,
      page: options.page,
      tabs: [{ tabId: 'tab-1', page: options.page }],
      activeTabId: 'tab-1',
      eventLogs: { console: new EventLog(), network: new EventLog() },
      nextTabNumber: 2,
      dialogPolicy: options.dialogPolicy ?? 'dismiss',
      allowlist: [...options.allowlist],
      baseUrl: options.baseUrl,
      navigationTimeoutMs: options.navigationTimeoutMs,
      actionTimeoutMs: options.actionTimeoutMs,
      busySelectors: [...(options.busySelectors ?? [])],
      widgetTargets: [...(options.widgetTargets ?? [])],
      createdAt: now,
      lastActivityAt: now,
      blockedRequests: options.blockedRequests,
      observedRequestHeaders: options.observedRequestHeaders ?? new Map<string, string>(),
      elementRefs: undefined,
      nextRefNumber: 1,
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  /** Adds a page the application opened as a tab, without switching to it. */
  addTab(sessionId: string, page: AuthPage): BrowserTab | undefined {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return undefined;
    }
    const tab: BrowserTab = { tabId: `tab-${String(session.nextTabNumber)}`, page };
    session.nextTabNumber += 1;
    session.tabs = [...session.tabs, tab];
    return tab;
  }

  /**
   * Forgets a page that closed. When it was the active one the session falls back to the page that
   * opened last before it, so an action never targets a closed page while another one is open.
   */
  removeTab(sessionId: string, page: AuthPage): void {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return;
    }
    const remaining = session.tabs.filter((tab) => tab.page !== page);
    const wasActive = session.page === page;
    session.tabs = remaining;
    const fallback = remaining.at(-1);
    if (wasActive && fallback !== undefined) {
      session.page = fallback.page;
      session.activeTabId = fallback.tabId;
      session.elementRefs = undefined;
    }
  }

  /** Makes a tab the active page. The refs of the page it replaces are retired with it. */
  activateTab(sessionId: string, tabId: string): BrowserTab {
    const session = this.sessions.get(sessionId);
    const tab = session?.tabs.find((candidate) => candidate.tabId === tabId);
    if (session === undefined || tab === undefined) {
      throw new QaError('BROWSER_TAB_NOT_FOUND', `No open tab "${tabId}" in session "${sessionId}"`, {
        remediation: 'List the open tabs with qa.browser_tabs and use one of their ids.',
      });
    }
    if (session.page !== tab.page) {
      session.elementRefs = undefined;
    }
    session.page = tab.page;
    session.activeTabId = tab.tabId;
    return tab;
  }

  /** Queues a notice for the next tool result that reports them. */
  addNotice(sessionId: string, notice: SessionNotice): void {
    const queue = this.notices.get(sessionId) ?? [];
    queue.push(notice);
    this.notices.set(sessionId, queue);
  }

  /** Queues an evidence record an event handler wants written; see {@link QueuedBrowserRecord}. */
  queueRecord(sessionId: string, record: QueuedBrowserRecord): void {
    const queue = this.queuedRecords.get(sessionId) ?? [];
    queue.push(record);
    this.queuedRecords.set(sessionId, queue);
  }

  /** Returns and clears the queued records, oldest first. */
  takeQueuedRecords(sessionId: string): QueuedBrowserRecord[] {
    const queue = this.queuedRecords.get(sessionId) ?? [];
    this.queuedRecords.delete(sessionId);
    return queue;
  }

  /** Tracks work an event handler started, so `drainNotices` can wait for it instead of racing it. */
  trackTabWork(sessionId: string, work: Promise<void>): void {
    const pending = this.pendingTabWork.get(sessionId) ?? new Set<Promise<void>>();
    pending.add(work);
    this.pendingTabWork.set(sessionId, pending);
  }

  /** Waits for in-flight dialog and tab handling, then returns and clears the queued notices. */
  async drainNotices(sessionId: string): Promise<SessionNotice[]> {
    // Work that finishes can start more (a popup that opens another), so keep going until none is left.
    for (let pending = this.takePendingTabWork(sessionId); pending.length > 0;) {
      await Promise.allSettled(pending);
      pending = this.takePendingTabWork(sessionId);
    }
    const queue = this.notices.get(sessionId) ?? [];
    this.notices.delete(sessionId);
    return queue;
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

  /** Replaces a session's refs with those of a new snapshot, which retires every earlier ref. */
  setElementRefs(sessionId: string, table: ElementRefTable): void {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) {
      session.elementRefs = table;
      // A diff keeps the refs of lines it did not change, so the table can hold old numbers: the
      // next number to hand out is past the highest one in use, never just past the table's size.
      const highest = Math.max(0, ...[...table.byRef.keys()].map((ref) => Number(ref.slice(1))));
      session.nextRefNumber = Math.max(session.nextRefNumber, highest + 1);
    }
  }

  /** Remembers the outline of a snapshot so a later one can be compared with it. */
  rememberSnapshot(sessionId: string, snapshotId: string, entries: readonly PageViewEntry[]): void {
    const remembered = this.snapshots.get(sessionId) ?? new Map<string, readonly PageViewEntry[]>();
    remembered.set(snapshotId, entries);
    for (const oldest of [...remembered.keys()].slice(0, -MAX_REMEMBERED_SNAPSHOTS)) {
      remembered.delete(oldest);
    }
    this.snapshots.set(sessionId, remembered);
  }

  /** The outline of a snapshot this session took, or undefined for an id it never took or has forgotten. */
  recallSnapshot(sessionId: string, snapshotId: string): readonly PageViewEntry[] | undefined {
    return this.snapshots.get(sessionId)?.get(snapshotId);
  }

  /** Forgets a session's refs, for when the page they were read from is gone. */
  clearElementRefs(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) {
      session.elementRefs = undefined;
    }
  }

  private takePendingTabWork(sessionId: string): Promise<void>[] {
    const pending = [...(this.pendingTabWork.get(sessionId) ?? [])];
    this.pendingTabWork.delete(sessionId);
    return pending;
  }

  /** Closes a session's browser and forgets it. Unknown or already-closed ids are a no-op. */
  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return;
    }
    this.sessions.delete(sessionId);
    this.notices.delete(sessionId);
    this.queuedRecords.delete(sessionId);
    this.snapshots.delete(sessionId);
    this.pendingTabWork.delete(sessionId);
    if (!session.ownsBrowser) {
      // Closing an attached browser's context would close the operator's own tabs; closing the
      // connection only disconnects.
      await session.browser.close();
      return;
    }
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
