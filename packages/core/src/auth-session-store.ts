// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { RelativePath } from '@qa-ai-stlc/schemas';
import type { StorageState } from './ports/browser-launcher.js';
import type { QaStore } from './qa-store.js';

// Playwright's own storageState shape has no published Zod schema to import; this is a loose
// structural check, not a full re-validation of every field.
const StorageStateSchema = z.object({
  cookies: z.array(z.record(z.string(), z.unknown())),
  origins: z.array(z.record(z.string(), z.unknown())),
}) as unknown as z.ZodType<StorageState>;

/**
 * Persists `storageState` per identity under `.qa/auth/`, outside the manifest and evidence: it
 * holds live session cookies and tokens, which must never be treated as a registered, hashed
 * artifact or shared the way evidence is (AGENTS.md 5.8, development plan section 6.4).
 */
export class AuthSessionStore {
  constructor(private readonly store: QaStore) {}

  private pathFor(identityName: string): RelativePath {
    return `auth/${identityName}.json`;
  }

  async save(identityName: string, storageState: StorageState): Promise<void> {
    await this.store.writeJson(this.pathFor(identityName), storageState);
  }

  async load(identityName: string): Promise<StorageState | undefined> {
    const relativePath = this.pathFor(identityName);
    if (!(await this.store.pathExists(relativePath))) {
      return undefined;
    }
    return this.store.readJson(relativePath, StorageStateSchema);
  }
}
