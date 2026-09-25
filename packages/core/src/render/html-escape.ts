// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/** Escapes text pulled from a JSON artifact (a title, a URL) before it lands inside HTML markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
