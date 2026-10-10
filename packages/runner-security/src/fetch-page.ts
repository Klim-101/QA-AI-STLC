// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ProbeResponse, SecurityProbe } from './security-probe.js';

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_HOPS = 3;

export interface FetchedPage {
  /** The last response reached; for a page that redirected, the page it redirected to. */
  readonly response: ProbeResponse;
  /** The path that produced `response`. */
  readonly path: string;
  /** Every response on the way, first request first. */
  readonly chain: readonly ProbeResponse[];
}

/** The path and query of a redirect target when it stays on the audited origin, else `undefined`. */
function sameOriginTarget(location: string, currentPath: string, baseUrl: string): string | undefined {
  const base = new URL(baseUrl);
  const target = new URL(location, new URL(currentPath, base));
  return target.origin === base.origin ? `${target.pathname}${target.search}` : undefined;
}

/**
 * GETs `path`, following a redirect only while it stays on the audited origin, one request at a
 * time through the probe (so each hop meets the same limits as any other request). A redirect
 * to another host is not followed: that response is the page.
 */
export async function fetchPage(
  probe: SecurityProbe,
  baseUrl: string,
  path: string,
  options: { readonly headers?: Readonly<Record<string, string>>; readonly maxHops?: number } = {},
): Promise<FetchedPage> {
  const chain: ProbeResponse[] = [];
  let currentPath = path;
  for (let hop = 0; ; hop += 1) {
    const response = await probe.request({
      method: 'GET',
      path: currentPath,
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
    });
    chain.push(response);
    const location = response.headers.location;
    const next =
      REDIRECT_STATUSES.has(response.status) && location !== undefined
        ? sameOriginTarget(location, currentPath, baseUrl)
        : undefined;
    if (next === undefined || hop >= (options.maxHops ?? DEFAULT_MAX_HOPS)) {
      return { response, path: currentPath, chain };
    }
    currentPath = next;
  }
}
