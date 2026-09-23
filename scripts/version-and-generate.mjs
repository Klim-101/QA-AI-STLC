// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// `changesets/action`'s `version-script` input is exec'd as a single command with no shell
// interpretation: a `&&`-chained value (`npx changeset version && npm run generate`) is passed
// straight through to `npx` as literal arguments, which fails with `CACError: Unused args: &&,
// npm, run, generate` instead of running the second command. Bumping versions (#308) and
// regenerating the Claude Code plugin from them (so `adapters/claude-plugin/` never carries a
// stale pinned engine version) therefore has to be one script, not a shell-chained pair.
import { execFileSync } from 'node:child_process';

execFileSync('npx', ['changeset', 'version'], { stdio: 'inherit' });
execFileSync('npm', ['run', 'generate'], { stdio: 'inherit' });
