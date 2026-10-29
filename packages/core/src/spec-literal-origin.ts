// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

function escapeForRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * The configured environment's origin when `specContent` writes it out as a literal, otherwise
 * `undefined`. A spec reaches its application through the Playwright `baseURL`, so a literal origin
 * breaks in any other environment and bypasses the configured one (AGENTS.md 12.6). Only a complete
 * origin counts: `http://localhost:43100` is another origin than `http://localhost:4310`, and so is
 * `http://staging.example.com.evil`.
 */
export function findLiteralOrigin(specContent: string, baseUrl: string): string | undefined {
  const { origin } = new URL(baseUrl);
  const literal = new RegExp(`${escapeForRegExp(origin)}(?![\\w:-]|\\.\\w)`, 'iu');
  return literal.test(specContent) ? origin : undefined;
}
