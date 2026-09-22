// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

const REDACTED = '[REDACTED]';
const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'cookie', 'set-cookie']);

// Compared after stripping `-`/`_` and lowercasing, so `api_key`, `api-key` and `apiKey` (and
// their snake_case relatives like `access_token`/`client_secret`) all match one entry (#285).
const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'clientsecret',
  'apikey',
  'authorization',
]);

interface HarHeader {
  readonly name?: unknown;
  readonly value?: unknown;
}

interface HarMessage {
  readonly headers?: unknown;
  readonly cookies?: unknown;
  readonly postData?: unknown;
  readonly content?: unknown;
}

interface HarEntry {
  readonly request?: HarMessage;
  readonly response?: HarMessage;
}

function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(name.toLowerCase().replace(/[-_]/gu, ''));
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

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        isSensitiveFieldName(key) ? REDACTED : redactJsonValue(entryValue),
      ]),
    );
  }
  return value;
}

// A URL-encoded form body (`username=alice&password=hunter2`) is the other common HAR body shape
// alongside JSON. Splitting and rejoining on `&`/`=` is a no-op for text that has neither, so
// running this on a body that turns out to be neither JSON nor a form (plain text, XML) never
// changes it.
function redactUrlEncodedBody(text: string): string {
  return text
    .split('&')
    .map((pair) => {
      const [name, ...rest] = pair.split('=');
      if (name === undefined || rest.length === 0) {
        return pair;
      }
      const decodedName = decodeURIComponent(name.replace(/\+/gu, ' '));
      return isSensitiveFieldName(decodedName) ? `${name}=${REDACTED}` : pair;
    })
    .join('&');
}

function redactBodyText(text: string): string {
  try {
    return JSON.stringify(redactJsonValue(JSON.parse(text)));
  } catch {
    return redactUrlEncodedBody(text);
  }
}

interface HarParam {
  readonly name?: unknown;
  readonly value?: unknown;
}

function redactParams(params: unknown): unknown {
  if (!Array.isArray(params)) {
    return params;
  }
  return params.map((param: HarParam) => {
    const name = typeof param.name === 'string' ? param.name : '';
    return isSensitiveFieldName(name) ? { ...param, value: REDACTED } : param;
  });
}

// `postData.text` is the raw request body (JSON or URL-encoded form); `postData.params` is
// Chrome/Playwright's structured alternative for a URL-encoded form, present instead of or
// alongside `text` depending on capture source. Both are redacted independently since either can
// carry the same credential.
function redactPostData(postData: unknown): unknown {
  if (postData === null || typeof postData !== 'object') {
    return postData;
  }
  const data = postData as { readonly text?: unknown; readonly params?: unknown };
  return {
    ...data,
    ...(typeof data.text === 'string' ? { text: redactBodyText(data.text) } : {}),
    params: redactParams(data.params),
  };
}

function redactContent(content: unknown): unknown {
  if (content === null || typeof content !== 'object') {
    return content;
  }
  const data = content as { readonly text?: unknown };
  return typeof data.text === 'string' ? { ...data, text: redactBodyText(data.text) } : data;
}

function redactMessage(message: HarMessage | undefined): HarMessage | undefined {
  if (message === undefined) {
    return message;
  }
  return {
    ...message,
    headers: redactHeaders(message.headers),
    cookies: redactCookies(message.cookies),
    postData: redactPostData(message.postData),
    content: redactContent(message.content),
  };
}

/**
 * Strips authorization headers, cookies, set-cookie headers, and known-sensitive fields (password,
 * token, secret, API key) from a captured HAR document's request/response bodies before it is ever
 * written to disk (development plan section 6.4, AGENTS.md 5.8). A login form's URL-encoded or
 * JSON POST body is redacted the same way headers/cookies are (#285) — a HAR is not fully redacted
 * just because its headers are clean. Content that fails to parse as JSON is returned unchanged,
 * `redacted: false` — the secret scan is the fallback safety net for anything this proactive pass
 * could not understand.
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
