// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export interface SecretMatch {
  /** A stable, public name for the kind of secret found — never the matched value itself. */
  readonly pattern: string;
}

// Deliberately conservative: each pattern targets a specific, well-known secret shape (AWS access
// key IDs, GitHub/Slack tokens, JWTs, Bearer headers) or an explicit `password`/`apiKey`
// assignment, rather than a generic high-entropy-string heuristic. Evidence content is real
// application data (network bodies, console output); a scanner that flags too eagerly makes every
// run untrustworthy and trains operators to ignore quarantine receipts.
const SECRET_PATTERNS: readonly { readonly pattern: string; readonly regex: RegExp }[] = [
  { pattern: 'aws-access-key-id', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { pattern: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { pattern: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { pattern: 'jwt', regex: /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/ },
  { pattern: 'bearer-token', regex: /\bBearer\s+[A-Za-z0-9\-._~+/]{16,}=*/i },
  { pattern: 'password-assignment', regex: /["']?password["']?\s*[:=]\s*["'][^"'\s]{4,}["']/i },
  { pattern: 'api-key-assignment', regex: /["']?api[_-]?key["']?\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/i },
];

/** Scans text for well-known secret shapes before it is registered as evidence (AGENTS.md 12.5). */
export function scanForSecrets(content: string): readonly SecretMatch[] {
  return SECRET_PATTERNS.filter(({ regex }) => regex.test(content)).map(({ pattern }) => ({ pattern }));
}
