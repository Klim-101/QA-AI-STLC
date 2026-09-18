// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

// Regression guard for a real crash found running `qa doctor` against a live application
// (P1-16, issue #31): calling `process.exit()` in packages/cli/src/bin/qa.ts immediately after a
// real `fetch()` (the environment reachability check) crashed the whole process on Windows with
// a libuv assertion ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"), because undici's
// keep-alive socket handle had not finished closing when the forced exit tore down the event
// loop. It reproduced reliably against the real server but never against a trivial
// `node:http` one in this test file — the race depends on connection/keep-alive characteristics
// a few lines of synthetic server code do not recreate — so a behavioral test here would be
// dishonest about what it actually catches. This checks the fix directly instead: the bin entry
// point sets `process.exitCode` (letting Node drain the event loop naturally) rather than forcing
// an immediate `process.exit()`.
describe('bin/qa.ts', () => {
  it('sets process.exitCode instead of calling process.exit()', async () => {
    const source = await readFile(fileURLToPath(new URL('../src/bin/qa.ts', import.meta.url)), 'utf8');
    const codeLines = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(codeLines).toContain('process.exitCode =');
    expect(codeLines).not.toMatch(/process\.exit\(/);
  });
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the fake HTTP server to bind a port.');
  }
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

// Exercises the real built binary end to end (AGENTS.md section 4: the CLI boundary needs an
// integration test), spawned as its own process rather than calling runCli() in-process, since
// that is the only way to observe the entry point's own exit behavior at all.
describe('qa doctor (spawned binary)', () => {
  it('exits cleanly after checking a real environment reachability over HTTP', async () => {
    await withTempDir(async (projectRoot) => {
      const qaDir = join(projectRoot, '.qa');
      await mkdir(qaDir, { recursive: true });
      await writeFile(
        join(qaDir, 'config.yaml'),
        [
          'schemaVersion: 1',
          'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
          'environments:',
          `  staging: { baseUrl: "${baseUrl}", allowlist: ["127.0.0.1"] }`,
          'identities: {}',
          'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
          'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
          'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
          '',
        ].join('\n'),
      );

      const binPath = fileURLToPath(new URL('../dist/bin/qa.js', import.meta.url));
      // `qa doctor` exits non-zero here (no browser installed in this temp project), so
      // execFile's promise rejects; the rejection still carries stdout/stderr, which is what
      // this test actually cares about, not the exit code.
      const result = await execFileAsync(process.execPath, [binPath, 'doctor'], {
        cwd: projectRoot,
      }).catch((error: unknown) => error as { stdout?: string; stderr?: string });

      expect(result.stderr ?? '').not.toContain('Assertion failed');
      expect(result.stdout ?? '').toContain('environment:staging');
    });
  }, 30_000);
});
