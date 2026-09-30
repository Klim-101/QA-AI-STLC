// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

const REDACTED = '[REDACTED]';
const ALWAYS_SENSITIVE_HEADER_NAMES: readonly string[] = ['authorization', 'cookie', 'set-cookie'];

/** Header and query-parameter names that carry a credential, compared case-insensitively. */
export interface SensitiveNames {
  readonly headers: readonly string[];
  readonly queryParameters: readonly string[];
}

// A response can echo a credential either verbatim or percent-encoded (a query string), so both
// spellings are scrubbed. Empty values are skipped: replacing "" would insert the placeholder
// between every character.
function spellingsOf(secretValues: readonly string[]): readonly string[] {
  const spellings = new Set<string>();
  for (const value of secretValues) {
    if (value.length === 0) {
      continue;
    }
    spellings.add(value);
    spellings.add(encodeURIComponent(value));
  }
  // Longest first, so a secret that contains another one is not left half-visible.
  return [...spellings].sort((left, right) => right.length - left.length);
}

/** Replaces every occurrence of a known secret value in `text`. */
export function scrubSecretValues(text: string, secretValues: readonly string[]): string {
  return spellingsOf(secretValues).reduce(
    (scrubbed, spelling) => scrubbed.replaceAll(spelling, REDACTED),
    text,
  );
}

/** Redacts the value of every header that is sensitive by name, then scrubs known values. */
export function redactHeaderValues(
  headers: Readonly<Record<string, string>>,
  names: SensitiveNames,
  secretValues: readonly string[],
): Record<string, string> {
  const sensitive = new Set([
    ...ALWAYS_SENSITIVE_HEADER_NAMES,
    ...names.headers.map((name) => name.toLowerCase()),
  ]);
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      sensitive.has(name.toLowerCase()) ? REDACTED : scrubSecretValues(value, secretValues),
    ]),
  );
}

function decodeQueryName(rawName: string): string {
  try {
    return decodeURIComponent(rawName.replace(/\+/gu, ' '));
  } catch {
    // A malformed escape cannot match a configured name, so the raw text is compared instead.
    return rawName;
  }
}

/** Redacts sensitive query parameters by name, then scrubs known values from the whole URL. */
export function redactUrl(url: string, names: SensitiveNames, secretValues: readonly string[]): string {
  const sensitive = new Set(names.queryParameters.map((name) => name.toLowerCase()));
  const queryStart = url.indexOf('?');
  if (queryStart === -1 || sensitive.size === 0) {
    return scrubSecretValues(url, secretValues);
  }
  const fragmentStart = url.indexOf('#', queryStart);
  const queryEnd = fragmentStart === -1 ? url.length : fragmentStart;
  const redactedQuery = url
    .slice(queryStart + 1, queryEnd)
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator === -1) {
        return pair;
      }
      const rawName = pair.slice(0, separator);
      return sensitive.has(decodeQueryName(rawName).toLowerCase()) ? `${rawName}=${REDACTED}` : pair;
    })
    .join('&');
  return scrubSecretValues(
    `${url.slice(0, queryStart + 1)}${redactedQuery}${url.slice(queryEnd)}`,
    secretValues,
  );
}
