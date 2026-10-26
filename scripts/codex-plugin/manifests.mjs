// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Pure builders for the Codex plugin's JSON files (P5-02). Layout verified against Codex CLI
// 0.149.1: the portable root `plugin.json` plus `mcp.json` install and register the MCP server,
// and the manifest schema forbids any key outside its fixed list, so skills are discovered from
// `skills/` rather than declared.
export const PLUGIN_SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const MCP_SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
export const CODEX_PLUGIN_SOURCE_PATH = './adapters/codex-plugin';

export function buildPluginManifest(pluginConfig, engineVersion) {
  return {
    $schema: PLUGIN_SCHEMA_URL,
    name: pluginConfig.name,
    version: engineVersion,
    description: pluginConfig.description,
    author: pluginConfig.author,
    homepage: pluginConfig.homepage,
    repository: pluginConfig.repository,
    license: pluginConfig.license,
    keywords: [...pluginConfig.keywords],
    extensions: {
      'com.openai': {
        interface: {
          displayName: pluginConfig.displayName,
          shortDescription: pluginConfig.description,
          developerName: pluginConfig.author.name,
          category: pluginConfig.codex.category,
          websiteURL: pluginConfig.homepage,
          defaultPrompt: [...pluginConfig.codex.defaultPrompt],
        },
      },
    },
  };
}

export function buildMcpConfig(pluginConfig, engineVersion) {
  return {
    $schema: MCP_SCHEMA_URL,
    mcpServers: {
      [pluginConfig.name]: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', `${pluginConfig.mcpPackage}@${engineVersion}`],
        // Read by the version handshake (ADR-007) so a stale npx cache produces a coded error
        // instead of silently running a different engine than this plugin was generated against.
        env: { QA_EXPECTED_ENGINE_VERSION: engineVersion },
      },
    },
  };
}

/**
 * The repository root's Codex marketplace: declares the generated plugin by a path relative to the
 * repository root, so `codex plugin marketplace add <owner>/<repo>` needs no second repository.
 */
export function buildMarketplace(pluginConfig) {
  return {
    name: pluginConfig.name,
    interface: { displayName: pluginConfig.displayName },
    plugins: [
      {
        name: pluginConfig.name,
        source: { source: 'local', path: CODEX_PLUGIN_SOURCE_PATH },
        // The plugin needs no account, so nothing is asked of the user at install time.
        policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
        category: pluginConfig.codex.category,
      },
    ],
  };
}
