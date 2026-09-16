// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import type { Sha256Hex } from '@qa-ai-stlc/schemas';

// A checkout on Windows can leave CRLF line endings for a file whose committed, hashed content
// used LF, which would otherwise make the same artifact hash differently by OS (AGENTS.md 5.6).
export function hashText(content: string): Sha256Hex {
  const normalized = content.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}
