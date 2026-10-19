// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { SCHEMA_VERSION, type SelectorElement } from '@qa-ai-stlc/schemas';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { QaStore } from './qa-store.js';
import { createFakeEngineContext } from './test-support/fake-engine-context.js';
import { readRegistryForEnvironment } from './scoped-registry.js';

const LOCAL_URL = 'http://localhost:4200/home';
const PUBLIC_URL = 'https://shop.example.test/home';

const TWO_ENVIRONMENTS = [
  'environments:',
  `  local: { baseUrl: "${LOCAL_URL}", allowlist: ["localhost"] }`,
  `  public: { baseUrl: "${PUBLIC_URL}", allowlist: ["shop.example.test"] }`,
].join('\n');
const ONE_ENVIRONMENT = `environments:\n  local: { baseUrl: "${LOCAL_URL}", allowlist: ["localhost"] }`;

function configYaml(environments: string): string {
  return `${[
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    environments,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  ].join('\n')}\n`;
}

function element(elementId: string, overrides: Partial<SelectorElement> = {}): SelectorElement {
  return {
    elementId,
    kind: 'button',
    locatorCandidates: [{ strategy: 'testId', value: elementId, fragile: false }],
    stabilityScore: 1,
    lastVerifiedAt: '2026-10-19T10:00:00.000Z',
    source: 'crawl',
    ...overrides,
  };
}

async function seed(
  fs: FakeFileSystem,
  options: { readonly environments?: string; readonly elements?: readonly SelectorElement[] },
): Promise<void> {
  await fs.mkdir(join('project', '.qa', 'selectors'));
  if (options.environments !== undefined) {
    await fs.writeFile(join('project', '.qa', 'config.yaml'), configYaml(options.environments));
  }
  if (options.elements !== undefined) {
    await fs.writeFile(
      join('project', '.qa', 'selectors', 'registry.json'),
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        generatedAt: '2026-10-19T10:00:00.000Z',
        elements: options.elements,
      }),
    );
  }
}

async function read(
  fs: FakeFileSystem,
  environment: string | undefined,
): Promise<readonly string[] | undefined> {
  const context = createFakeEngineContext({ fs });
  const store = new QaStore({ projectRoot: context.projectRoot, fs });
  const registry = await readRegistryForEnvironment(context, store, environment);
  return registry?.elements.map((entry) => entry.elementId);
}

const STORED = [
  element('local-1', { pageUrl: LOCAL_URL, environment: 'local' }),
  element('public-1', { pageUrl: PUBLIC_URL, environment: 'public' }),
  element('old-local', { pageUrl: 'http://localhost:4200/old' }),
  element('old-public', { pageUrl: 'https://shop.example.test/old' }),
  element('from-source', { source: 'static' }),
];

describe('readRegistryForEnvironment (ADR-0020)', () => {
  it('is undefined when there is no registry yet', async () => {
    const fs = createFakeFileSystem();
    await seed(fs, { environments: TWO_ENVIRONMENTS });

    expect(await read(fs, 'local')).toBeUndefined();
  });

  it('returns only the elements of the environment it was given, claimed or recorded', async () => {
    const fs = createFakeFileSystem();
    await seed(fs, { environments: TWO_ENVIRONMENTS, elements: STORED });

    expect(await read(fs, 'local')).toEqual(['local-1', 'old-local', 'from-source']);
    expect(await read(fs, 'public')).toEqual(['public-1', 'old-public', 'from-source']);
  });

  it('uses the only environment when none is given', async () => {
    const fs = createFakeFileSystem();
    await seed(fs, { environments: ONE_ENVIRONMENT, elements: STORED });

    expect(await read(fs, undefined)).toEqual(['local-1', 'old-local', 'from-source']);
  });

  it('asks which environment when there are several and none is given', async () => {
    const fs = createFakeFileSystem();
    await seed(fs, { environments: TWO_ENVIRONMENTS, elements: STORED });

    await expect(read(fs, undefined)).rejects.toMatchObject({ code: 'BROWSER_ENVIRONMENT_AMBIGUOUS' });
  });

  it('names an environment that is not configured', async () => {
    const fs = createFakeFileSystem();
    await seed(fs, { environments: TWO_ENVIRONMENTS, elements: STORED });

    await expect(read(fs, 'staging')).rejects.toMatchObject({ code: 'BROWSER_ENVIRONMENT_UNKNOWN' });
  });

  it('returns the registry whole when the project has no configuration to tell environments apart', async () => {
    const fs = createFakeFileSystem();
    await seed(fs, { elements: STORED });

    expect(await read(fs, undefined)).toEqual(STORED.map((entry) => entry.elementId));
  });
});
