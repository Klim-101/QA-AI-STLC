// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserDialogKind } from '@qa-ai-stlc/schemas';
import { isUrlAllowed } from './browser-allowlist.js';
import { sanitizeLoggedText, templateUrl } from './browser-event-log.js';
import type {
  BrowserSession,
  BrowserTab,
  QueuedBrowserRecord,
  SessionNotice,
} from './browser-session-store.js';
import { truncateText } from './normalize.js';
import type { BrowserOperationContext } from './operations/browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './operations/browser-evidence.js';
import type { AuthPage, PageDialog } from './ports/browser-launcher.js';

/** A page the application has only just opened is `about:blank` until its first navigation commits. */
const BLANK_PAGE_URL = 'about:blank';

const BROWSER_ERROR_PAGE_PREFIX = 'chrome-error:';

const DIALOG_KINDS: readonly BrowserDialogKind[] = ['alert', 'confirm', 'prompt', 'beforeunload'];

function toDialogKind(type: string): BrowserDialogKind {
  return DIALOG_KINDS.find((kind) => kind === type) ?? 'alert';
}

/**
 * Starts the dialog and tab handling of a freshly opened session (P6-59): every JavaScript dialog
 * is handled by the session's policy and recorded, and every page the application opens joins the
 * session as a tab, held to the same allowlist as the first one. Handling happens in event
 * callbacks, so each piece of it is tracked on the session and `drainNotices` waits for it.
 */
export function watchSessionPages(context: BrowserOperationContext, session: BrowserSession): void {
  const watcher = new SessionPageWatcher(context, session);
  watcher.attach(session.page, 'tab-1');
  session.context.on('page', (page) => {
    const tab = context.sessions.addTab(session.sessionId, page);
    if (tab === undefined) {
      return;
    }
    watcher.attach(page, tab.tabId);
    watcher.track(() => watcher.admitTab(tab));
  });
}

/**
 * Closes every tab but the first that sits on a page off the allowlist, reporting each. Called
 * before the tabs are listed or switched to, so a page that was admitted while blank and then
 * navigated somewhere it should not be cannot stay a target.
 */
export async function closeDisallowedTabs(
  context: BrowserOperationContext,
  session: BrowserSession,
): Promise<void> {
  const watcher = new SessionPageWatcher(context, session);
  for (const tab of session.tabs.slice(1)) {
    await watcher.enforceAllowlist(tab);
  }
}

class SessionPageWatcher {
  constructor(
    private readonly context: BrowserOperationContext,
    private readonly session: BrowserSession,
  ) {}

  /**
   * Runs event-callback work on the session's tracked list. It never rejects: there is no caller
   * to receive the error, and an unhandled rejection would take the whole MCP server down.
   */
  track(work: () => Promise<void>): void {
    this.context.sessions.trackTabWork(
      this.session.sessionId,
      (async () => {
        try {
          await work();
        } catch (error) {
          this.context.engine.logger.error('Dialog or tab handling failed', {
            code: 'BROWSER_TAB_HANDLING_FAILED',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })(),
    );
  }

  attach(page: AuthPage, tabId: string): void {
    page.on('dialog', (dialog) => {
      this.track(() => this.handleDialog(dialog, tabId));
    });
    page.on('console', (message) => {
      this.session.eventLogs.console.append((seq) => ({
        seq,
        tabId,
        level: message.type(),
        text: sanitizeLoggedText(message.text()),
      }));
    });
    page.on('pageerror', (error) => {
      this.session.eventLogs.console.append((seq) => ({
        seq,
        tabId,
        level: 'pageerror',
        text: sanitizeLoggedText(error.message),
      }));
    });
    page.on('response', (response) => {
      this.session.eventLogs.network.append((seq) => ({
        seq,
        tabId,
        method: response.request().method(),
        status: response.status(),
        url: templateUrl(response.url()),
      }));
    });
    page.on('requestfailed', (request) => {
      this.session.eventLogs.network.append((seq) => ({
        seq,
        tabId,
        method: request.method(),
        failure: sanitizeLoggedText(request.failure()?.errorText ?? 'failed'),
        url: templateUrl(request.url()),
      }));
    });
    page.on('close', () => {
      this.context.sessions.removeTab(this.session.sessionId, page);
    });
  }

  async admitTab(tab: BrowserTab): Promise<void> {
    try {
      await tab.page.waitForLoadState('domcontentloaded');
    } catch {
      // A page whose first load fails is still judged by where it ended up below: an unloaded
      // page that is not blank is off the allowlist or broken, and either way is not kept.
    }
    if (await this.enforceAllowlist(tab)) {
      const url = tab.page.url();
      this.context.sessions.addNotice(this.session.sessionId, { kind: 'tab-opened', tabId: tab.tabId, url });
      this.queueRecord('tab-opened', { tabId: tab.tabId, url });
    }
  }

  /** Returns true when the tab may stay; otherwise it was closed and reported. */
  async enforceAllowlist(tab: BrowserTab): Promise<boolean> {
    const url = tab.page.url();
    if (url === BLANK_PAGE_URL || isUrlAllowed(url, this.session.allowlist, this.session.baseUrl)) {
      return true;
    }
    try {
      await tab.page.close();
    } catch (error) {
      this.context.engine.logger.error('Could not close a page that is off the allowlist', {
        code: 'BROWSER_TAB_CLOSE_FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.context.sessions.removeTab(this.session.sessionId, tab.page);
    const reportedUrl = this.describeBlockedUrl(url);
    this.context.sessions.addNotice(this.session.sessionId, { kind: 'tab-blocked', url: reportedUrl });
    this.queueRecord('tab-blocked', { tabId: tab.tabId, url: reportedUrl });
    return false;
  }

  /**
   * A page whose first request safe mode aborted shows the browser's own error page, which says
   * nothing about where it was going; the request safe mode last aborted is the best account of it.
   */
  private describeBlockedUrl(url: string): string {
    if (!url.startsWith(BROWSER_ERROR_PAGE_PREFIX)) {
      return url;
    }
    return this.session.blockedRequests.at(-1)?.url ?? url;
  }

  private async handleDialog(dialog: PageDialog, tabId: string): Promise<void> {
    const kind = toDialogKind(dialog.type());
    const message = truncateText(dialog.message()).text;
    const handled = this.session.dialogPolicy === 'accept' ? 'accepted' : 'dismissed';
    // The page is blocked until the dialog is handled, so this comes before anything that can fail.
    try {
      await (handled === 'accepted' ? dialog.accept() : dialog.dismiss());
    } catch (error) {
      this.context.engine.logger.error('Could not handle a dialog', {
        code: 'BROWSER_DIALOG_FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    this.context.sessions.addNotice(this.session.sessionId, {
      kind: 'dialog',
      tabId,
      dialogKind: kind,
      message,
      handled,
    });
    this.queueRecord('dialog', { tabId, dialog: { kind, message, handled } });
  }

  private queueRecord(
    type: QueuedBrowserRecord['type'],
    details: Pick<QueuedBrowserRecord, 'tabId' | 'url' | 'dialog'>,
  ): void {
    this.context.sessions.queueRecord(this.session.sessionId, {
      type,
      at: this.context.engine.clock.now(),
      ...details,
    });
  }
}

/**
 * Waits for dialog and tab handling still in flight, writes the evidence it queued, and returns
 * the notices it produced. Every tool that reports notices calls this after its own evidence is
 * written, so the writes never overlap.
 */
export async function settleSessionPages(
  context: BrowserOperationContext,
  session: BrowserSession,
): Promise<SessionNotice[]> {
  const notices = await context.sessions.drainNotices(session.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  for (const record of context.sessions.takeQueuedRecords(session.sessionId)) {
    await registerBrowserAction({
      evidenceStore,
      evidenceId: context.sessions.nextEvidenceId(),
      session,
      now: record.at,
      action: {
        type: record.type,
        tabId: record.tabId,
        ...(record.url === undefined ? {} : { url: record.url }),
        ...(record.dialog === undefined ? {} : { dialog: record.dialog }),
      },
    });
  }
  return notices;
}

/** The `notices` field of a tool result: the session's unreported notices, absent when there are none. */
export async function collectNotices(
  context: BrowserOperationContext,
  session: BrowserSession,
): Promise<{ readonly notices?: SessionNotice[] }> {
  const notices = await settleSessionPages(context, session);
  return notices.length === 0 ? {} : { notices };
}
