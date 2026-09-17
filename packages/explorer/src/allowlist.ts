// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/** Checks `url`'s hostname against the configured domain allowlist (development plan section 6.4). */
export function isAllowedUrl(url: string, allowlist: readonly string[]): boolean {
  const hostname = tryHostname(url);
  return hostname !== undefined && allowlist.includes(hostname);
}

function tryHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** Drops the fragment so `#section` links do not look like distinct routes. */
export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}
