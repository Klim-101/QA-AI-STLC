// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  CODEX_PLUGIN_SOURCE_PATH,
  buildMarketplace,
  buildMcpConfig,
  buildPluginManifest,
} from './manifests.mjs';

const CONFIG = {
  name: 'demo-plugin',
  displayName: 'Demo Plugin',
  description: 'Does demo things.',
  author: { name: 'The Authors' },
  homepage: 'https://example.test/home',
  repository: 'https://example.test/repo',
  license: 'Apache-2.0',
  keywords: ['qa'],
  mcpPackage: '@demo/mcp-server',
  codex: { category: 'Coding', defaultPrompt: ['Start'] },
};

describe('buildPluginManifest', () => {
  it('carries identity at the root and presentation under the OpenAI extension', () => {
    const manifest = buildPluginManifest(CONFIG, '2.3.4');

    expect(manifest).toMatchObject({ name: 'demo-plugin', version: '2.3.4', license: 'Apache-2.0' });
    expect(manifest.extensions['com.openai'].interface).toEqual({
      displayName: 'Demo Plugin',
      shortDescription: 'Does demo things.',
      developerName: 'The Authors',
      category: 'Coding',
      websiteURL: 'https://example.test/home',
      defaultPrompt: ['Start'],
    });
  });

  it('declares no component keys, which the manifest schema forbids', () => {
    const manifest = buildPluginManifest(CONFIG, '2.3.4');

    expect(manifest).not.toHaveProperty('skills');
    expect(manifest).not.toHaveProperty('mcpServers');
  });
});

describe('buildMcpConfig', () => {
  it('pins the engine package and the expected version for the handshake', () => {
    const server = buildMcpConfig(CONFIG, '2.3.4').mcpServers['demo-plugin'];

    expect(server).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@demo/mcp-server@2.3.4'],
      env: { QA_EXPECTED_ENGINE_VERSION: '2.3.4' },
    });
  });
});

describe('buildMarketplace', () => {
  it('lists the generated plugin by a path relative to the repository root', () => {
    const [entry] = buildMarketplace(CONFIG).plugins;

    expect(entry).toEqual({
      name: 'demo-plugin',
      source: { source: 'local', path: CODEX_PLUGIN_SOURCE_PATH },
      policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
      category: 'Coding',
    });
  });
});
