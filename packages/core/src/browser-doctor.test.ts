// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkBaseUrlReachable,
  checkBrowserInstalled,
  checkIdentitiesPresent,
  checkNodeVersion,
  installBrowsers,
  resolveBrowserExecutablePath,
} from './browser-doctor.js';
import type { HttpClient } from './ports/http-client.js';
import type { ProcessRunner } from './ports/process-runner.js';
import { createFakeFileSystem } from './test-support/fake-file-system.js';

describe('resolveBrowserExecutablePath', () => {
  it('resolves a path for every supported browser', () => {
    expect(resolveBrowserExecutablePath('chromium')).toBeTruthy();
    expect(resolveBrowserExecutablePath('firefox')).toBeTruthy();
    expect(resolveBrowserExecutablePath('webkit')).toBeTruthy();
  });
});

describe('checkNodeVersion', () => {
  it('passes for a version above the floor', () => {
    expect(checkNodeVersion('v22.20.3')).toMatchObject({ status: 'pass' });
  });

  it('passes for a version exactly at the floor', () => {
    expect(checkNodeVersion('v22.12.0')).toMatchObject({ status: 'pass' });
  });

  it('fails for a version below the floor', () => {
    expect(checkNodeVersion('v20.10.0')).toMatchObject({ status: 'fail' });
  });

  it('fails for an unparseable version string', () => {
    expect(checkNodeVersion('not-a-version')).toMatchObject({ status: 'fail', name: 'node-version' });
  });

  it('defaults to the running process version', () => {
    expect(checkNodeVersion().name).toBe('node-version');
  });
});

describe('checkBrowserInstalled', () => {
  it('passes when the resolved executable exists', async () => {
    const path = resolveBrowserExecutablePath('chromium');
    const fs = createFakeFileSystem();
    await fs.writeFile(path, 'x');

    expect(await checkBrowserInstalled(fs, 'chromium')).toMatchObject({ status: 'pass' });
  });

  it('fails with a remediation when the executable is missing', async () => {
    const fs = createFakeFileSystem();

    const result = await checkBrowserInstalled(fs, 'firefox');

    expect(result.status).toBe('fail');
    expect(result.remediation).toContain('qa doctor --fix');
  });
});

describe('checkBaseUrlReachable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the real fetch-backed HTTP client and the default timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await checkBaseUrlReachable('https://example.com');

    expect(result).toMatchObject({ status: 'pass' });
  });

  it('accepts an explicit timeout', async () => {
    const httpClient: HttpClient = { get: () => Promise.resolve({ ok: true, status: 200 }) };

    const result = await checkBaseUrlReachable('https://example.com', { httpClient, timeoutMs: 50 });

    expect(result).toMatchObject({ status: 'pass' });
  });

  it('passes when the HTTP client resolves', async () => {
    const httpClient: HttpClient = { get: () => Promise.resolve({ ok: true, status: 200 }) };

    expect(await checkBaseUrlReachable('https://example.com', { httpClient })).toMatchObject({
      status: 'pass',
    });
  });

  it('fails when the request does not resolve before the timeout', async () => {
    const httpClient: HttpClient = {
      get: (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    };

    const result = await checkBaseUrlReachable('https://example.com', { httpClient, timeoutMs: 5 });

    expect(result.status).toBe('fail');
  });

  it('fails with a remediation when the HTTP client rejects', async () => {
    const httpClient: HttpClient = {
      get: () => Promise.reject(new Error('network down')),
    };

    const result = await checkBaseUrlReachable('https://example.com', { httpClient });

    expect(result.status).toBe('fail');
    expect(result.remediation).toBeDefined();
  });
});

describe('checkIdentitiesPresent', () => {
  const identities = {
    admin: { auth: 'storage-state' as const, secret: 'QA_ADMIN_PASSWORD' },
    viewer: { auth: 'cdp-attach' as const, secret: 'QA_VIEWER_PASSWORD' },
  };

  it('passes for identities whose secret is set and fails for empty or missing ones', () => {
    const results = checkIdentitiesPresent(identities, {
      QA_ADMIN_PASSWORD: 'hunter22',
      QA_VIEWER_PASSWORD: '',
    });

    expect(results).toEqual([
      { name: 'identity:admin', status: 'pass', message: 'QA_ADMIN_PASSWORD is set' },
      expect.objectContaining({ name: 'identity:viewer', status: 'fail' }),
    ]);
  });
});

describe('installBrowsers', () => {
  it('runs the Playwright CLI with install and the requested browsers, resolving pass on success', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const processRunner: ProcessRunner = {
      run: (command, args) => {
        calls.push({ command, args });
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      },
    };

    const result = await installBrowsers(processRunner, ['chromium']);

    expect(result).toMatchObject({ status: 'pass' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.slice(-2)).toEqual(['install', 'chromium']);
    expect(calls[0]?.args[0]).toMatch(/cli\.js$/);
  });

  it('reports failure with stderr as remediation when the install exits nonzero', async () => {
    const processRunner: ProcessRunner = {
      run: () => Promise.resolve({ exitCode: 1, stdout: '', stderr: 'network unreachable' }),
    };

    const result = await installBrowsers(processRunner, ['webkit']);

    expect(result).toMatchObject({ status: 'fail', remediation: 'network unreachable' });
  });

  it('falls back to a generic remediation when stderr is empty', async () => {
    const processRunner: ProcessRunner = {
      run: () => Promise.resolve({ exitCode: 1, stdout: '', stderr: '   ' }),
    };

    const result = await installBrowsers(processRunner, ['webkit']);

    expect(result.remediation).toContain('npx playwright install');
  });

  it('defaults to installing every supported browser', async () => {
    const calls: (readonly string[])[] = [];
    const processRunner: ProcessRunner = {
      run: (_command, args) => {
        calls.push(args);
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      },
    };

    await installBrowsers(processRunner);

    expect(calls[0]?.slice(-3)).toEqual(['chromium', 'firefox', 'webkit']);
  });
});
