// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { securityApproveTool } from '../src/tools/security-approve.js';
import { securityAuditTool } from '../src/tools/security-audit.js';
import { securityAuthorizeTool } from '../src/tools/security-authorize.js';

const HARDENED_HEADERS = {
  'content-security-policy': "frame-ancestors 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function configYaml(baseUrl: string, security: string): string {
  return [
    'schemaVersion: 1',
    `testing: { e2e: undecided, api: undecided, a11y: undecided, security: ${security} }`,
    'environments:',
    `  local: { baseUrl: "${baseUrl}", allowlist: ["localhost"] }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

function authorization(baseUrl: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    environment: { name: 'local', baseUrl, allowlist: ['localhost'] },
    checks: ['headers'],
    identities: [],
    prohibitedActions: ['brute force'],
    allowedMutations: [],
    restrictedRoutes: [],
    rateLimit: { requestsPerSecond: 50, maxRequests: 100 },
    createdAt: '2026-10-10T10:00:00Z',
  });
}

// A real server on a port the operating system picks, so no other test file can collide with it.
// What it sends decides whether the audit finds anything.
describe('security tools (real filesystem, local server)', () => {
  let originalCwd: string;
  let server: Server;
  let isHardened: boolean;
  let baseUrl: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    isHardened = false;
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html', ...(isHardened ? HARDENED_HEADERS : {}) });
      response.end('<html><body>ok</body></html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://localhost:${String((server.address() as AddressInfo).port)}/`;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  });

  async function withProject(security: string, run: (projectRoot: string) => Promise<void>): Promise<void> {
    await withTempDir(async (directory) => {
      const projectRoot = await realpath(directory);
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(baseUrl, security), 'utf-8');
      await writeFile(join(projectRoot, 'authorization.json'), authorization(baseUrl), 'utf-8');
      process.chdir(projectRoot);
      try {
        await run(projectRoot);
      } finally {
        process.chdir(originalCwd);
      }
    });
  }

  it('registers the authorization, takes the operator approval and then audits, filing a draft per finding', async () => {
    await withProject('in-scope', async (projectRoot) => {
      const registered = await securityAuthorizeTool.handler({ path: 'authorization.json' });
      const early = await securityAuditTool.handler({}).catch((caught: unknown) => caught);
      const approved = await securityApproveTool.handler({ approvedBy: 'operator', note: 'local only' });
      const repeated = await securityApproveTool.handler({ approvedBy: 'operator' });
      const summary = await securityAuditTool.handler({});

      expect(registered).toStrictEqual({
        authorizationPath: 'artifacts/security/authorization.json',
        checks: ['headers'],
        environment: 'local',
      });
      expect(early).toMatchObject({ code: 'SECURITY_NOT_AUTHORIZED' });
      expect(approved).toStrictEqual({ wasAlreadyApproved: false });
      expect(repeated).toStrictEqual({ wasAlreadyApproved: true });
      expect(summary).toMatchObject({ environment: 'local', status: 'completed' });
      expect(summary.findingCount).toBeGreaterThan(0);
      expect(summary.draftIds).toHaveLength(summary.findingCount);
      const draft = JSON.parse(
        await readFile(
          join(projectRoot, '.qa', 'artifacts', 'defects', `${summary.draftIds[0] ?? ''}.json`),
          'utf-8',
        ),
      ) as { status: string; category: string };
      expect(draft).toMatchObject({ status: 'draft', category: 'security' });
    });
  });

  it('reports a hardened site as passed, with no draft', async () => {
    isHardened = true;
    await withProject('in-scope', async () => {
      await securityAuthorizeTool.handler({ path: 'authorization.json' });
      await securityApproveTool.handler({ approvedBy: 'operator' });

      const summary = await securityAuditTool.handler({});

      expect(summary).toMatchObject({ status: 'completed', findingCount: 0, draftIds: [] });
      expect(summary.checks.find((entry) => entry.checkClass === 'headers')?.status).toBe('passed');
    });
  });

  it('refuses all three tools while security testing is not in scope', async () => {
    await withProject('out-of-scope', async () => {
      const results = await Promise.all([
        securityAuthorizeTool.handler({ path: 'authorization.json' }).catch((caught: unknown) => caught),
        securityApproveTool.handler({ approvedBy: 'operator' }).catch((caught: unknown) => caught),
        securityAuditTool.handler({}).catch((caught: unknown) => caught),
      ]);

      for (const result of results) {
        expect(result).toMatchObject({ code: 'SECURITY_OUT_OF_SCOPE' });
      }
    });
  });
});
