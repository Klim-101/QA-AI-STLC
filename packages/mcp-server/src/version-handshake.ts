// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from '@qa-ai-stlc/core';

export interface VersionHandshakeOptions {
  /** This process's own `@qa-ai-stlc/mcp-server` version (`readPackageVersion`). */
  readonly actualVersion: string;
  /**
   * The version the plugin was generated against, normally pinned into the `npx` invocation that
   * started this process (ADR-007). `undefined` when the server was started outside a generated
   * plugin, for example directly from the CLI during development.
   */
  readonly expectedVersion: string | undefined;
}

/**
 * Fails loudly, before the transport connects, when a generated plugin's expected engine version
 * does not match the version actually running (ADR-007) — for example because `.mcp.json` was
 * hand-edited, or a cached `npx` install no longer matches the plugin manifest it was generated
 * with. A missing expected version is not a mismatch: it means no plugin declared one.
 */
export function checkEngineVersionHandshake(options: VersionHandshakeOptions): void {
  const { actualVersion, expectedVersion } = options;
  if (expectedVersion === undefined || expectedVersion === actualVersion) {
    return;
  }
  throw new QaError(
    'ENGINE_VERSION_MISMATCH',
    `The plugin expects engine version "${expectedVersion}" but "${actualVersion}" is running`,
    {
      remediation:
        'Regenerate the plugin with "npm run generate", or clear the npx cache for ' +
        '"@qa-ai-stlc/mcp-server" so it re-fetches the pinned version.',
    },
  );
}
