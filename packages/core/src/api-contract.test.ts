// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { ConfigSchema } from '@qa-ai-stlc/schemas';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { loadApiContract, snapshotApiContract } from './api-contract.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import type { HttpClient } from './ports/http-client.js';
import { createFakeEngineContext } from './test-support/fake-engine-context.js';

const BASE_URL = 'https://staging.example.com';
const SPEC = JSON.stringify({ openapi: '3.0.3', paths: { '/a': { get: {} } } });

function config(apiSource: string | undefined, tlsInsecure = false, extraEnvironment = false) {
  const environments: Record<string, unknown> = {
    staging: {
      baseUrl: BASE_URL,
      allowlist: ['staging.example.com'],
      ...(tlsInsecure ? { tlsInsecure: true } : {}),
    },
  };
  if (extraEnvironment) {
    environments.other = { baseUrl: 'https://other.example.com', allowlist: ['other.example.com'] };
  }
  return ConfigSchema.parse(
    parseYaml(
      JSON.stringify({
        schemaVersion: 1,
        testing: { e2e: 'undecided', api: 'undecided', a11y: 'undecided', security: 'undecided' },
        environments,
        identities: {},
        data: { strategy: 'manual', ownerMarker: 'qa-ai-stlc' },
        selectors: { policy: 'playwright-default', testIdAttribute: 'data-testid' },
        agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 },
        ...(apiSource === undefined ? {} : { api: { contract: 'openapi', source: apiSource } }),
      }),
    ),
  );
}

function httpServing(
  routes: Readonly<Record<string, { status: number; bodyText: string }>>,
  seen: (boolean | undefined)[] = [],
): HttpClient {
  return {
    get: () => Promise.reject(new Error('unused')),
    request: (url, options) => {
      seen.push(options?.tlsInsecure);
      const route = routes[url] ?? { status: 404, bodyText: '' };
      return Promise.resolve({
        ok: route.status < 400,
        status: route.status,
        headers: {},
        bodyText: route.bodyText,
      });
    },
  };
}

function contextWith(files: Record<string, string>, httpClient: HttpClient = httpServing({})): EngineContext {
  return createFakeEngineContext({
    fs: createFakeFileSystem(files),
    httpClient,
    clock: { now: () => new Date('2026-09-30T12:00:00Z') },
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return error instanceof QaError ? error.code : undefined;
}

describe('loadApiContract', () => {
  it('reads a project-relative file and hashes the text it parsed', async () => {
    const context = contextWith({ [join('project', 'openapi.json')]: SPEC });

    const contract = await loadApiContract(context, config('openapi.json'), undefined);

    expect(contract).toMatchObject({ source: 'openapi.json', text: SPEC, sha256: hashText(SPEC) });
    expect(contract.document.openapi).toBe('3.0.3');
  });

  it('probes the known paths for "discover", passing tlsInsecure through', async () => {
    const seen: (boolean | undefined)[] = [];
    const context = contextWith(
      {},
      httpServing({ [`${BASE_URL}/openapi.json`]: { status: 200, bodyText: SPEC } }, seen),
    );

    const contract = await loadApiContract(context, config('discover', true), 'staging');

    expect(contract.source).toBe(`${BASE_URL}/openapi.json`);
    expect(seen).toEqual([true]);
  });

  it('fetches an allowlisted contract URL, passing tlsInsecure through when set', async () => {
    const url = `${BASE_URL}/docs/spec.json`;
    const seen: (boolean | undefined)[] = [];
    const context = contextWith({}, httpServing({ [url]: { status: 200, bodyText: SPEC } }, seen));

    expect((await loadApiContract(context, config(url, true), undefined)).source).toBe(url);
    expect(seen).toEqual([true]);
  });

  it('does not send tlsInsecure for a contract URL unless the environment opts in', async () => {
    const url = `${BASE_URL}/docs/spec.json`;
    const seen: (boolean | undefined)[] = [];
    const context = contextWith({}, httpServing({ [url]: { status: 200, bodyText: SPEC } }, seen));

    await loadApiContract(context, config(url), undefined);

    expect(seen).toEqual([undefined]);
  });

  it.each([
    ['API_CONTRACT_NOT_CONFIGURED', undefined, {}],
    ['API_CONTRACT_SYNTHESIZE_UNSUPPORTED', 'synthesize', {}],
    ['API_CONTRACT_DISCOVERY_FAILED', 'discover', {}],
    ['API_CONTRACT_URL_NOT_ALLOWED', 'https://elsewhere.example.org/spec.json', {}],
    ['API_CONTRACT_URL_NOT_ALLOWED', 'http://staging.example.com/spec.json', {}],
    ['API_CONTRACT_UNREADABLE', `${BASE_URL}/missing.json`, {}],
    ['API_CONTRACT_UNREADABLE', 'absent.json', {}],
    ['API_CONTRACT_NOT_OPENAPI', 'page.html', { [join('project', 'page.html')]: '<html></html>' }],
  ])('throws %s', async (code, apiSource, files) => {
    expect(await codeOf(loadApiContract(contextWith(files), config(apiSource), undefined))).toBe(code);
  });

  it('requires an environment name when the project has more than one', async () => {
    const context = contextWith({ [join('project', 'openapi.json')]: SPEC });

    expect(await codeOf(loadApiContract(context, config('openapi.json', false, true), undefined))).toBe(
      'BROWSER_ENVIRONMENT_AMBIGUOUS',
    );
  });
});

describe('snapshotApiContract', () => {
  it('stores the contract text and registers its hash in the manifest', async () => {
    const context = contextWith({ [join('project', 'openapi.json')]: SPEC });
    const contract = await loadApiContract(context, config('openapi.json'), undefined);

    await snapshotApiContract(context, contract);

    expect(await context.fs.readFile(join('project', '.qa', 'artifacts', 'api-contract.txt'))).toBe(SPEC);
    const manifest = JSON.parse(await context.fs.readFile(join('project', '.qa', 'manifest.json'))) as {
      artifacts: Record<string, { sha256: string }>;
    };
    expect(manifest.artifacts['artifacts/api-contract.txt']?.sha256).toBe(contract.sha256);
  });
});
