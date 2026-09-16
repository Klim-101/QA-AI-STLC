// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// A package's "clean" script needs to remove its build output on every platform without a shell
// (AGENTS.md 5.6), so this replaces the POSIX-only `rm -rf` a shell script would otherwise use.
import { rmSync } from 'node:fs';

const [targetPath] = process.argv.slice(2);
if (!targetPath) {
  console.error('Usage: clean-dir.mjs <path>');
  process.exit(1);
}

rmSync(targetPath, { recursive: true, force: true });
