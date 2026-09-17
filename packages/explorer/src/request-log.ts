// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export interface RequestLogEntry {
  readonly method: string;
  readonly url: string;
  /** Absent for a request safe mode blocked before it ever reached the network. */
  readonly status?: number;
  readonly blocked: boolean;
}

// HAR 1.2 shaped so `@qa-ai-stlc/core`'s `redactHar` (development plan section 6.4) can strip
// authorization headers, cookies and set-cookie headers before this is ever registered as
// evidence; headers and cookies are always present, even empty, so redaction has something to
// walk.
export function buildRequestLogHar(entries: readonly RequestLogEntry[], generatedAt: string): string {
  return JSON.stringify({
    log: {
      version: '1.2',
      creator: { name: 'qa-ai-stlc-explorer', version: '0' },
      entries: entries.map((entry) => ({
        startedDateTime: generatedAt,
        blocked: entry.blocked,
        request: { method: entry.method, url: entry.url, headers: [], cookies: [] },
        response: entry.status === undefined ? undefined : { status: entry.status, headers: [], cookies: [] },
      })),
    },
  });
}
