// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import {
  API_AUTH_ENVIRONMENT_VARIABLE,
  API_AUTH_MODULE_PATH,
  ensureApiAuthModule,
  extractSpecApiAuthProfiles,
  findCredentialInSpecSource,
  generateApiAuthModule,
  serializeResolvedApiAuth,
} from './api-auth-module.js';
import type { EngineContext } from './engine-context.js';

const NAMES = { headers: ['X-Api-Key'], queryParameters: ['api_key'] };

function engineWith(files: Record<string, string> = {}): EngineContext {
  return {
    projectRoot: 'project',
    fs: createFakeFileSystem(files),
    clock: { now: () => new Date('2026-09-30T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('generateApiAuthModule', () => {
  it('types profile names as a sorted literal union and reads the run-time variable', () => {
    const source = generateApiAuthModule(['zeta', 'alpha']);

    expect(source).toContain('export type ApiAuthProfileName = "alpha" | "zeta";');
    expect(source).toContain(`process.env['${API_AUTH_ENVIRONMENT_VARIABLE}']`);
  });

  it('makes every profile name a type error when none is configured', () => {
    expect(generateApiAuthModule([])).toContain('export type ApiAuthProfileName = never;');
  });

  it('contains no credential value', () => {
    expect(generateApiAuthModule(['service'])).not.toMatch(/Bearer|Basic /u);
  });
});

describe('ensureApiAuthModule', () => {
  const apiAuth = { profiles: { service: { type: 'none' as const } }, defaults: {} };
  const absolutePath = join('project', 'tests', 'qa', 'api-auth.ts');

  it('writes the helper when it is missing', async () => {
    const engine = engineWith();

    const result = await ensureApiAuthModule(engine, apiAuth);

    expect(result).toEqual({ path: API_AUTH_MODULE_PATH, didWrite: true });
    expect(await engine.fs.readFile(absolutePath)).toBe(generateApiAuthModule(['service']));
  });

  it('leaves a current helper alone', async () => {
    const engine = engineWith({ [absolutePath]: generateApiAuthModule(['service']) });

    expect((await ensureApiAuthModule(engine, apiAuth)).didWrite).toBe(false);
  });

  it('rewrites a helper that lists different profiles', async () => {
    const engine = engineWith({ [absolutePath]: generateApiAuthModule(['old']) });

    expect((await ensureApiAuthModule(engine, apiAuth)).didWrite).toBe(true);
    expect(await engine.fs.readFile(absolutePath)).toContain('"service"');
  });
});

describe('extractSpecApiAuthProfiles', () => {
  it('lists each profile a spec names once, in first-use order', () => {
    const source = `request.get('/a', apiAuth('one'));\nrequest.get('/b', apiAuth( "two" ));\napiAuth('one');`;

    expect(extractSpecApiAuthProfiles(source)).toEqual(['one', 'two']);
  });

  it('ignores a call whose argument is not a string literal', () => {
    expect(extractSpecApiAuthProfiles('apiAuth(name); apiAuth(`x`);')).toEqual([]);
  });
});

describe('serializeResolvedApiAuth', () => {
  it('keys headers and query parameters by profile name', () => {
    const json = serializeResolvedApiAuth([
      {
        profileName: 'service',
        profileType: 'api-key',
        headers: { 'X-Api-Key': 'k' },
        queryParameters: { api_key: 'k' },
        secretValues: ['k'],
        isReused: false,
      },
    ]);

    expect(JSON.parse(json)).toEqual({
      service: { headers: { 'X-Api-Key': 'k' }, params: { api_key: 'k' } },
    });
  });
});

describe('findCredentialInSpecSource', () => {
  it.each([
    ['quoted built-in header', "{ 'Authorization': token }", 'Authorization'],
    ['unquoted built-in header key', '{ cookie: value }', 'cookie'],
    ['profile header, any case', "headers['x-api-key']", 'x-api-key'],
    ['profile query parameter', "request.get('/a?api_key=1')", 'api_key'],
    ['inline bearer value', "const v = 'Bearer abcdefgh12345';", 'Bearer'],
  ])('flags a %s', (_label, source, expected) => {
    expect(findCredentialInSpecSource(source, NAMES)).toContain(expected);
  });

  it('accepts a spec that authenticates through the helper', () => {
    const source = [
      "import { apiAuth } from './api-auth.js';",
      "test('no Authorization header is rejected', async ({ request }) => {",
      "  await request.get('/api/whoami', apiAuth('service'));",
      '});',
    ].join('\n');

    expect(findCredentialInSpecSource(source, NAMES)).toBeUndefined();
  });
});
