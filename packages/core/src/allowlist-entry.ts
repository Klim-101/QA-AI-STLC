// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * One entry of an environment's allowlist (ADR-0019): a bare host name admits that host on the port
 * of the environment's `baseUrl`, a `host:port` entry admits it on exactly that port.
 */
export interface AllowlistEntry {
  readonly hostname: string;
  /** Absent for a bare host name. */
  readonly port?: number;
}

/**
 * Splits an entry into its host name and optional port. The configuration schema has already
 * rejected anything else; an entry that still does not parse (a hand-built test list, an old
 * artifact) is kept whole as a host name, which matches no real host, so it admits nothing.
 */
export function parseAllowlistEntry(entry: string): AllowlistEntry {
  const separatorIndex = entry.indexOf(':');
  if (separatorIndex === -1) {
    return { hostname: entry };
  }
  const port = Number(entry.slice(separatorIndex + 1));
  return Number.isInteger(port) && port > 0
    ? { hostname: entry.slice(0, separatorIndex), port }
    : { hostname: entry };
}

/** The host names an allowlist names, whatever port each entry carries; cookies and links are not port-scoped. */
export function allowlistHostnames(allowlist: readonly string[]): readonly string[] {
  return allowlist.map((entry) => parseAllowlistEntry(entry).hostname);
}
