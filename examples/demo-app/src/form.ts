// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// `express.urlencoded()` types `request.body` as `any`; this narrows it to `unknown` first so
// every form field read goes through an explicit check instead of an unsafe member access
// (AGENTS.md 5.2: no `any`, use `unknown` and narrow).
export function formField(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function priorityField(
  body: unknown,
  key: string,
  fallback: 'low' | 'medium' | 'high',
): 'low' | 'medium' | 'high' {
  const value = formField(body, key);
  return value === 'high' || value === 'medium' || value === 'low' ? value : fallback;
}
