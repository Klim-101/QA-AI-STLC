// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// The only hand-edited source for the generated Claude Code plugin (`adapters/claude-plugin/`,
// P2-11). Static metadata only — the plugin's `version` and the pinned MCP server version come
// from `packages/mcp-server/package.json` at generate time instead of being duplicated here,
// since that package is what `.mcp.json` actually launches via `npx`.
export interface PluginConfig {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly author: { readonly name: string };
  readonly homepage: string;
  readonly repository: string;
  readonly license: string;
  readonly keywords: readonly string[];
  /** The npm package `.mcp.json` launches via `npx -y <mcpPackage>@<version>`. */
  readonly mcpPackage: string;
}

const pluginConfig: PluginConfig = {
  name: 'qa-ai-stlc',
  displayName: 'QA-AI-STLC',
  description: 'Open-source, model-agnostic QA framework: explorer, test design, execution and reporting.',
  author: { name: 'The QA-AI-STLC Authors' },
  homepage: 'https://github.com/Klim-101/QA-AI-STLC',
  repository: 'https://github.com/Klim-101/QA-AI-STLC',
  license: 'Apache-2.0',
  keywords: ['qa', 'testing', 'playwright', 'mcp', 'e2e'],
  mcpPackage: '@qa-ai-stlc/mcp-server',
};

export default pluginConfig;
