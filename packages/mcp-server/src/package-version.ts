// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from 'node:module';

/** The published version of this server package, read from its own `package.json`. */
export function readPackageVersion(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require('../package.json') as { readonly version: string };
  return packageJson.version;
}
