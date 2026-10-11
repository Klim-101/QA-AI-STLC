// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { runCodeCheck } from '../test-support/run-code-check.js';
import { sourceFixture } from '../test-support/source-fixture.js';
import { secretsCheck } from './secrets-check.js';

// Built from parts so this file does not itself look like a leaked credential to a scanner.
const AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const PRIVATE_KEY_HEADER = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ');

describe('secretsCheck', () => {
  it('is skipped, not passed, without a source checkout', async () => {
    const { outcome } = await runCodeCheck(secretsCheck, undefined);

    expect(outcome).toMatchObject({ status: 'skipped', findings: [] });
  });

  it('reports a provider key with its file and line, high confidence, and never its value', async () => {
    const source = sourceFixture({ 'app/config.ts': `const a = 1;\nconst key = '${AWS_KEY}';\n` });

    const { outcome, requests } = await runCodeCheck(secretsCheck, source);

    expect(outcome.findings).toHaveLength(1);
    const [finding] = outcome.findings;
    expect(finding).toMatchObject({
      id: 'secrets-aws-access-key-id-app-config-ts',
      checkClass: 'secrets',
      confidence: 'high',
      severityProposal: 'critical',
      requestIndexes: [],
      codeReferences: [{ path: 'app/config.ts', line: 2 }],
    });
    expect(JSON.stringify(finding)).not.toContain(AWS_KEY);
    expect(requests).toEqual([]);
  });

  it('reports a private key header', async () => {
    const source = sourceFixture({ 'app/deploy/key.pem': `${PRIVATE_KEY_HEADER}\nMIIB\n` });

    const { outcome } = await runCodeCheck(secretsCheck, source);

    expect(outcome.findings.map((finding) => finding.id)).toEqual(['secrets-private-key-app-deploy-key-pem']);
  });

  it('reports a hard-coded secret and a literal fallback behind an environment variable', async () => {
    const source = sourceFixture({
      'app/server.ts': [
        "const a = { secret: process.env.SESSION_SECRET ?? 'fallback-session-secret' };",
        "const b = { clientSecret: 'a-literal-client-secret' };",
      ].join('\n'),
    });

    const { outcome } = await runCodeCheck(secretsCheck, source);

    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]).toMatchObject({
      confidence: 'medium',
      severityProposal: 'major',
      codeReferences: [
        { path: 'app/server.ts', line: 1 },
        { path: 'app/server.ts', line: 2 },
      ],
    });
  });

  it('does not report the name of an environment variable or a secret read from one', async () => {
    const source = sourceFixture({
      'app/config.ts': [
        "const identity = { secret: 'QA_ADMIN_PASSWORD' };",
        'const fromEnvironment = { secret: process.env.SESSION_SECRET };',
      ].join('\n'),
    });

    const { outcome } = await runCodeCheck(secretsCheck, source);

    expect(outcome.findings).toEqual([]);
  });

  it('reports a match in test code or sample data with low confidence and a minor severity', async () => {
    const source = sourceFixture({
      'app/test/fixtures/users.ts': "const user = { password: 'hunter2-example' };",
    });

    const { outcome } = await runCodeCheck(secretsCheck, source);

    expect(outcome.findings[0]).toMatchObject({ confidence: 'low', severityProposal: 'minor' });
  });

  it('cites at most five lines of one file', async () => {
    const lines = Array.from({ length: 8 }, (_, index) => `const key${String(index)} = '${AWS_KEY}';`);
    const source = sourceFixture({ 'app/many.ts': lines.join('\n') });

    const { outcome } = await runCodeCheck(secretsCheck, source);

    expect(outcome.findings[0]?.codeReferences).toHaveLength(5);
    expect(outcome.findings[0]?.actualResult).toContain('8 line(s)');
  });

  it('skips lockfiles and minified lines', async () => {
    const source = sourceFixture({
      'app/package-lock.json': `{"integrity": "${AWS_KEY}"}`,
      'app/bundle.js': `var a='${AWS_KEY}';${'x'.repeat(1200)}`,
    });

    const { outcome } = await runCodeCheck(secretsCheck, source);

    expect(outcome.findings).toEqual([]);
  });

  it('passes only when every file was read', async () => {
    const clean = await runCodeCheck(secretsCheck, sourceFixture({ 'app/a.ts': 'export const a = 1;' }));
    const partial = await runCodeCheck(
      secretsCheck,
      sourceFixture({ 'app/a.ts': 'export const a = 1;', 'app/b.dat': new Uint8Array([0, 1]) }),
    );
    const truncated = await runCodeCheck(
      secretsCheck,
      sourceFixture({ 'app/a.ts': 'a', 'app/b.ts': 'b' }, { maxFiles: 1 }),
    );
    const empty = await runCodeCheck(secretsCheck, sourceFixture({}));

    expect(clean.outcome.status).toBe('passed');
    expect(partial.outcome.status).toBe('uncertain');
    expect(partial.outcome.note).toContain('1 binary or oversized');
    expect(truncated.outcome.status).toBe('uncertain');
    expect(truncated.outcome.note).toContain('file limit');
    expect(empty.outcome.status).toBe('uncertain');
  });
});
