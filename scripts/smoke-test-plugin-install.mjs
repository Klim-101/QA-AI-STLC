// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// P2-13: proves the generated Claude Code plugin (`adapters/claude-plugin/`) installs correctly
// from a local marketplace with the rest of this repository absent from disk — the situation a
// real operator is in. Copies only the generated plugin tree into an isolated temp directory,
// builds a throwaway local marketplace around it, and drives the `claude` CLI's own
// `plugin marketplace add` / `plugin install` / `plugin list` / `plugin details` subcommands
// against a throwaway project directory (`--scope local`, so nothing is written to the operator's
// real `~/.claude/settings.json`). Requires the `claude` CLI on PATH (CI installs
// `@anthropic-ai/claude-code` globally for this job only; it is never a dependency of any
// `package.json` in this repository — AGENTS.md's "no LLM SDK dependency" boundary is about the
// framework's own packages, and this script makes no model call, only exercises plugin/marketplace
// CLI mechanics).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const pluginSourceDir = join(repoRoot, 'adapters', 'claude-plugin');
const marketplaceName = 'p213-smoke-marketplace';
const pluginId = `qa-ai-stlc@${marketplaceName}`;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// A globally `npm install -g`'d CLI resolves to a `.cmd` shim on Windows, which Node's own
// `child_process` cannot spawn directly (`EINVAL`) without `shell: true` -- and `shell: true`
// with a separate `args` array only concatenates them unescaped (Node's own DEP0190), which is
// exactly the shell-string-building AGENTS.md 5.6 forbids. `cross-spawn` (MIT) is the standard,
// widely-used fix: it resolves `.cmd`/`.bat` shims through `cmd.exe` with each argument correctly
// re-escaped, with no `shell: true` and no manual string concatenation.
function runClaude(args, options = {}) {
  const result = spawn.sync('claude', args, { encoding: 'utf8', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`"claude ${args.join(' ')}" exited with code ${String(result.status)}\n${result.stderr}`);
  }
  return result.stdout;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/** How many components the generator actually put in the plugin, read from its own output. */
function expectedInventory() {
  const pluginJson = readJson(join(pluginSourceDir, '.claude-plugin', 'plugin.json'));
  const hooksJson = readJson(join(pluginSourceDir, 'hooks', 'hooks.json'));
  return {
    version: pluginJson.version,
    hookEventCount: Object.keys(hooksJson.hooks).length,
  };
}

function setUpMarketplace(tempDir) {
  const marketplaceDir = join(tempDir, 'marketplace');
  cpSync(pluginSourceDir, join(marketplaceDir, 'plugin'), { recursive: true });
  mkdirSync(join(marketplaceDir, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(marketplaceDir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(
      {
        name: marketplaceName,
        owner: { name: 'P2-13 smoke test' },
        description: 'Throwaway local marketplace for the plugin-install smoke test (P2-13).',
        plugins: [{ name: 'qa-ai-stlc', source: './plugin', description: 'QA-AI-STLC plugin under test' }],
      },
      null,
      2,
    ),
  );
  return marketplaceDir;
}

function main() {
  const expected = expectedInventory();
  const tempDir = mkdtempSync(join(tmpdir(), 'qa-ai-stlc-plugin-smoke-'));
  const marketplaceDir = setUpMarketplace(tempDir);
  const projectDir = join(tempDir, 'project');
  mkdirSync(projectDir, { recursive: true });

  let installed = false;
  let marketplaceAdded = false;
  try {
    console.log('Validating the generated plugin manifest...');
    runClaude(['plugin', 'validate', join(marketplaceDir, 'plugin'), '--strict']);

    console.log('Validating the throwaway marketplace manifest...');
    runClaude(['plugin', 'validate', marketplaceDir, '--strict']);

    console.log('Adding the local marketplace (scope: local)...');
    runClaude(['plugin', 'marketplace', 'add', marketplaceDir, '--scope', 'local'], { cwd: projectDir });
    marketplaceAdded = true;

    console.log('Installing the plugin from it (scope: local)...');
    runClaude(['plugin', 'install', pluginId, '--scope', 'local', '-y'], { cwd: projectDir });
    installed = true;

    console.log('Checking `plugin list --json`...');
    const list = JSON.parse(runClaude(['plugin', 'list', '--json'], { cwd: projectDir }));
    const entry = list.find((item) => item.id === pluginId);
    assert(entry !== undefined, `${pluginId} is not in "plugin list --json"`);
    assert(entry.enabled === true, `${pluginId} is installed but not enabled`);
    assert(entry.version === expected.version, `expected version ${expected.version}, got ${entry.version}`);
    const mcpArgs = entry.mcpServers?.['qa-ai-stlc']?.args ?? [];
    assert(
      mcpArgs.some((arg) => arg === `@qa-ai-stlc/mcp-server@${expected.version}`),
      `mcpServers.qa-ai-stlc does not pin @qa-ai-stlc/mcp-server@${expected.version}`,
    );

    console.log('Checking `plugin details`...');
    const details = runClaude(['plugin', 'details', pluginId], { cwd: projectDir });
    const hookMatch = /Hooks \((\d+)\)/.exec(details);
    assert(hookMatch !== null, 'plugin details did not report a hook count');
    assert(
      Number(hookMatch[1]) === expected.hookEventCount,
      `expected ${expected.hookEventCount} hook event(s), plugin details reported ${hookMatch[1]}`,
    );
    const mcpMatch = /MCP servers \((\d+)\)/.exec(details);
    assert(
      mcpMatch !== null && Number(mcpMatch[1]) === 1,
      'plugin details did not report exactly one MCP server',
    );

    console.log('Local marketplace plugin-install smoke test passed.');
  } finally {
    if (installed) {
      runClaude(['plugin', 'uninstall', pluginId, '--scope', 'local', '-y'], { cwd: projectDir });
    }
    if (marketplaceAdded) {
      runClaude(['plugin', 'marketplace', 'remove', marketplaceName, '--scope', 'local'], {
        cwd: projectDir,
      });
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
