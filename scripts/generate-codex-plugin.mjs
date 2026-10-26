// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Generates the installable Codex plugin (`adapters/codex-plugin/`, P5-02) from `agents/` and
// `plugin.config.ts`, plus the repository root's `.agents/plugins/marketplace.json`, which makes
// this public repository itself a Codex marketplace. Same contract as `generate-claude-plugin.mjs`:
// the sources stay the only hand-edited files and `--check` flags drift and stray files. The Claude
// plugin's hook and eval suite are deliberately not carried over: plugins with hooks cannot be
// submitted to Codex's public directory, and the evals are `claude plugin eval` files.
// The MCP server is deliberately not declared by the plugin (P5-07); the README tells the
// operator to register it with `codex mcp add`. Run with `node --experimental-strip-types` so `plugin.config.ts` can be imported directly.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildMarketplace, buildPluginManifest } from './codex-plugin/manifests.mjs';
import { renderForHost } from './lib/host-blocks.mjs';
import { checkTree, copyDirectory, readLfText, renderJson, writeTree } from './lib/generated-tree.mjs';

const repoRoot = join(import.meta.dirname, '..');
const outDir = join(repoRoot, 'adapters', 'codex-plugin');
const agentsDir = join(repoRoot, 'agents');
const readmeSourcePath = join(repoRoot, 'scripts', 'codex-plugin', 'README.md');
const marketplaceJsonPath = join(repoRoot, '.agents', 'plugins', 'marketplace.json');

const { default: pluginConfig } = await import(pathToFileURL(join(repoRoot, 'plugin.config.ts')).href);
const engineVersion = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'mcp-server', 'package.json'), 'utf8'),
).version;

const files = new Map();
const renderMarkdown = (content, sourcePath) => renderForHost(content, 'codex', sourcePath);
for (const skillName of readdirSync(join(agentsDir, 'skills'))) {
  // `_example` is a format template, never a real skill (agents/README.md) — it must never ship.
  if (skillName !== '_example') {
    copyDirectory(join(agentsDir, 'skills', skillName), join('skills', skillName), files, renderMarkdown);
  }
}
copyDirectory(join(agentsDir, 'hub'), 'hub', files, renderMarkdown);
copyDirectory(join(agentsDir, 'phase-prompts'), 'phase-prompts', files, renderMarkdown);
copyDirectory(join(agentsDir, 'references'), 'references', files, renderMarkdown);

files.set('README.md', {
  content: readLfText(readmeSourcePath)
    .replaceAll('{{engineVersion}}', engineVersion)
    .replaceAll('{{mcpPackage}}', pluginConfig.mcpPackage),
});
files.set('LICENSE', { content: readLfText(join(repoRoot, 'LICENSE')) });
files.set('NOTICE', { content: readLfText(join(repoRoot, 'NOTICE')) });
files.set('plugin.json', {
  content: await renderJson(buildPluginManifest(pluginConfig, engineVersion), join(outDir, 'plugin.json')),
});

const extraFiles = new Map([
  [marketplaceJsonPath, await renderJson(buildMarketplace(pluginConfig), marketplaceJsonPath)],
]);

if (!process.argv.includes('--check')) {
  writeTree({ repoRoot, outDir, files, extraFiles });
  process.exit(0);
}
if (checkTree({ repoRoot, outDir, files, extraFiles })) {
  process.exit(1);
}
console.log('adapters/codex-plugin and .agents/plugins/marketplace.json are up to date.');
