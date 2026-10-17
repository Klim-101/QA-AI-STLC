// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RcaInputEvidence, RelativePath } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';
import { hashBytes } from './hash.js';
import type { ManifestStore } from './manifest-store.js';
import type { QaStore } from './qa-store.js';
import { wrapUntrustedEvidenceText } from './untrusted-evidence-text.js';

const MAX_EVIDENCE_EXCERPT_CHARS = 2_000;
// Evidence worth showing as text; screenshots, traces and videos are referenced by path and hash only.
const TEXT_EVIDENCE_EXTENSIONS: ReadonlySet<string> = new Set(['json', 'log', 'txt']);

/**
 * Describes one registered evidence file for an agent: its hash and size, and for text a bounded
 * excerpt wrapped in the untrusted-data markers. The file is re-checked against the manifest, so a
 * hand-edited one is refused (AGENTS.md 12.7).
 */
export async function describeEvidence(
  store: QaStore,
  manifest: ManifestStore,
  path: RelativePath,
): Promise<RcaInputEvidence> {
  const bytes = await store.readBytes(path);
  if (!(await manifest.verifyContent(path, bytes))) {
    throw new QaError('ARTIFACT_HASH_MISMATCH', `"${path}" does not match its registered hash`, {
      remediation: 'The evidence changed outside the engine; re-run the case to register fresh evidence.',
    });
  }
  const base = { path, sha256: hashBytes(bytes), sizeBytes: bytes.length };
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (!TEXT_EVIDENCE_EXTENSIONS.has(extension)) {
    return { ...base, isTruncated: false };
  }
  const excerpt = wrapUntrustedEvidenceText(Buffer.from(bytes).toString('utf-8'), MAX_EVIDENCE_EXCERPT_CHARS);
  return { ...base, excerpt: excerpt.text, isTruncated: excerpt.isTruncated };
}
