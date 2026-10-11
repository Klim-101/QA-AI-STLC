// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { runCodeCheck } from '../test-support/run-code-check.js';
import { sourceFixture } from '../test-support/source-fixture.js';
import { configurationCheck } from './configuration-check.js';

async function idsFor(files: Readonly<Record<string, string>>): Promise<string[]> {
  const { outcome } = await runCodeCheck(configurationCheck, sourceFixture(files));
  return outcome.findings.map((finding) => finding.id);
}

describe('configurationCheck', () => {
  it('is skipped, not passed, without a source checkout', async () => {
    const { outcome } = await runCodeCheck(configurationCheck, undefined);

    expect(outcome).toMatchObject({ status: 'skipped', findings: [] });
  });

  it.each([
    ['cookie-http-only-disabled', 'app.use(session({ cookie: { httpOnly: false } }));'],
    ['cookie-secure-disabled', 'cookie: { secure: false }'],
    ['debug-mode-enabled', 'app.config = { debug: true };'],
    ['debug-mode-enabled', 'app.run(host="0.0.0.0", debug=True)'],
    ['tls-verification-disabled', 'new https.Agent({ rejectUnauthorized: false })'],
    ['tls-verification-disabled', "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';"],
    ['cors-any-origin', "app.use(cors({ origin: '*' }));"],
    ['debug-endpoint', "app.get('/debug/state', handler);"],
    ['debug-endpoint', "router.post('/__test/reset', handler);"],
    ['debug-endpoint', '@app.route("/debug")'],
  ])('reports %s', async (rule, line) => {
    expect(await idsFor({ 'app/server.ts': `${line}\n` })).toEqual([`configuration-${rule}-app-server-ts`]);
  });

  it('cites the file and line, with the confidence the rule carries', async () => {
    const source = sourceFixture({
      'app/server.ts': 'const a = 1;\napp.use(session({ cookie: { httpOnly: false } }));',
    });

    const { outcome } = await runCodeCheck(configurationCheck, source);

    expect(outcome.findings[0]).toMatchObject({
      checkClass: 'configuration',
      confidence: 'high',
      requestIndexes: [],
      codeReferences: [{ path: 'app/server.ts', line: 2 }],
    });
  });

  it('does not report a setting wrapped in an environment check, in the same line or just above', async () => {
    expect(
      await idsFor({
        'app/a.ts': "if (process.env.NODE_ENV !== 'production') {\n  app.get('/debug', handler);\n}",
        'app/b.ts': 'cookie: { secure: false } // isDev',
      }),
    ).toEqual([]);
  });

  it('reports a setting whose guard is far above it', async () => {
    const far = [
      '// NODE_ENV is read elsewhere',
      ...Array.from({ length: 8 }, () => ''),
      'cookie: { secure: false }',
    ];

    expect(await idsFor({ 'app/a.ts': far.join('\n') })).toEqual([
      'configuration-cookie-secure-disabled-app-a-ts',
    ]);
  });

  it('does not report a route whose name only starts like a debug route, or anything in test code', async () => {
    expect(
      await idsFor({
        'app/a.ts': "app.get('/debuggable-things', handler);",
        'app/test/b.ts': "app.get('/debug', handler);",
        'app/c.test.ts': 'cookie: { httpOnly: false }',
        'app/notes.md': 'cookie: { httpOnly: false }',
      }),
    ).toEqual([]);
  });

  it('is uncertain when nothing matched: patterns in text do not show what a build runs', async () => {
    const { outcome } = await runCodeCheck(
      configurationCheck,
      sourceFixture({ 'app/a.ts': 'export const a = 1;', 'app/b.ts': 'export const b = 2;' }),
    );

    expect(outcome.status).toBe('uncertain');
    expect(outcome.note).toContain('2 configuration or code file(s)');
  });

  it('says when the file limit stopped the scan', async () => {
    const { outcome } = await runCodeCheck(
      configurationCheck,
      sourceFixture({ 'app/a.ts': 'a', 'app/b.ts': 'b' }, { maxFiles: 1 }),
    );

    expect(outcome.note).toContain('file limit');
  });
});
