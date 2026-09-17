// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

const REDACTED = '[REDACTED]';
const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'cookie', 'set-cookie']);

interface HarHeader {
  readonly name?: unknown;
  readonly value?: unknown;
}

interface HarMessage {
  readonly headers?: unknown;
  readonly cookies?: unknown;
}

interface HarEntry {
  readonly request?: HarMessage;
  readonly response?: HarMessage;
}

function redactHeaders(headers: unknown): unknown {
  if (!Array.isArray(headers)) {
    return headers;
  }
  return headers.map((header: HarHeader) => {
    const name = typeof header.name === 'string' ? header.name.toLowerCase() : '';
    return SENSITIVE_HEADER_NAMES.has(name) ? { ...header, value: REDACTED } : header;
  });
}

function redactCookies(cookies: unknown): unknown {
  if (!Array.isArray(cookies)) {
    return cookies;
  }
  return cookies.map((cookie: Record<string, unknown>) => ({ ...cookie, value: REDACTED }));
}

function redactMessage(message: HarMessage | undefined): HarMessage | undefined {
  if (message === undefined) {
    return message;
  }
  return { ...message, headers: redactHeaders(message.headers), cookies: redactCookies(message.cookies) };
}

/**
 * Strips authorization headers, cookies and set-cookie headers from a captured HAR document
 * before it is ever written to disk (development plan section 6.4, AGENTS.md 5.8). Content that
 * fails to parse as JSON is returned unchanged, `redacted: false` — the secret scan is the
 * fallback safety net for anything this proactive pass could not understand.
 */
export function redactHar(harJson: string): { readonly content: string; readonly redacted: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(harJson);
  } catch {
    return { content: harJson, redacted: false };
  }

  const har = parsed as { log?: { entries?: HarEntry[] } };
  const entries = har.log?.entries;
  if (!Array.isArray(entries)) {
    return { content: harJson, redacted: false };
  }

  const redactedEntries = entries.map((entry) => ({
    ...entry,
    request: redactMessage(entry.request),
    response: redactMessage(entry.response),
  }));
  const redactedHar = { ...har, log: { ...har.log, entries: redactedEntries } };
  return { content: JSON.stringify(redactedHar), redacted: true };
}
