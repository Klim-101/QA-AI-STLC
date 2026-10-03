// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashBytes } from '../hash.js';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserOpen } from './browser-open.js';
import { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILES, runBrowserUpload } from './browser-upload.js';

const FIXTURE = 'fixtures/avatar.png';
const FIXTURE_BYTES = new TextEncoder().encode('not-really-a-png');

async function openWith(shown: unknown, files: Record<string, string | Uint8Array> = {}) {
  const harness = createBrowserTestHarness({
    launcherOptions: {
      locatorEvaluate: ({ functionName }) => (functionName === 'readSelectedFileNames' ? shown : undefined),
    },
  });
  await harness.fs.writeFile(join('project', 'fixtures', 'avatar.png'), FIXTURE_BYTES);
  for (const [path, content] of Object.entries(files)) {
    await harness.fs.writeFile(join('project', ...path.split('/')), content);
  }
  const { sessionId } = await runBrowserOpen(harness.context);
  return { harness, sessionId };
}

describe('runBrowserUpload (P6-60)', () => {
  it('sends the bytes it read, reads the input back and records name, size and hash only', async () => {
    const { harness, sessionId } = await openWith(['avatar.png']);

    const result = await runBrowserUpload(harness.context, {
      sessionId,
      selector: '#avatar',
      paths: [FIXTURE],
      stepId: 'step-2',
    });

    const sent = harness.launcher.pageCalls.find((call) => call.method === 'setInputFiles');
    expect(sent?.args[0]).toBe('#avatar');
    expect(sent?.args[1]).toEqual([
      { name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(FIXTURE_BYTES) },
    ]);
    const files = [
      { name: 'avatar.png', sizeBytes: FIXTURE_BYTES.byteLength, sha256: hashBytes(FIXTURE_BYTES) },
    ];
    expect(result.files).toEqual(files);
    const record: unknown = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))),
    );
    expect(record).toEqual({
      schemaVersion: 1,
      type: 'upload',
      sessionId,
      stepId: 'step-2',
      selector: '#avatar',
      files,
      url: 'about:blank',
      at: '2026-09-21T10:00:00.000Z',
    });
    expect(JSON.stringify(record)).not.toContain('not-really-a-png');
    expect(JSON.stringify(record)).not.toContain('fixtures');
  });

  it('uploads several files, with a type for known extensions and a generic one for the rest', async () => {
    const { harness, sessionId } = await openWith(['notes.txt', 'data.bin', 'plain'], {
      'fixtures/notes.txt': 'hello',
      'fixtures/data.bin': new Uint8Array([1, 2, 3]),
      'fixtures/plain': 'x',
    });

    const result = await runBrowserUpload(harness.context, {
      sessionId,
      selector: '#files',
      paths: ['fixtures/notes.txt', 'fixtures/data.bin', 'fixtures/plain'],
    });

    const sent = harness.launcher.pageCalls.find((call) => call.method === 'setInputFiles')?.args[1] as {
      mimeType: string;
    }[];
    expect(sent.map((file) => file.mimeType)).toEqual([
      'text/plain',
      'application/octet-stream',
      'application/octet-stream',
    ]);
    expect(result.files.map((file) => file.name)).toEqual(['notes.txt', 'data.bin', 'plain']);
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)))) as unknown,
    ).not.toHaveProperty('stepId');
  });

  it('names the snapshot ref in the record when the input was addressed by one', async () => {
    const { harness, sessionId } = await openWith(['avatar.png']);
    harness.sessions.setElementRefs(sessionId, {
      url: 'about:blank',
      byRef: new Map([['e1', { ref: 'e1', role: 'button', name: 'Upload', isNameTruncated: false }]]),
    });

    const result = await runBrowserUpload(harness.context, { sessionId, ref: 'e1', paths: [FIXTURE] });

    expect(result.selector).toBe('role=button[name="Upload"s]');
  });

  it.each([
    ['an absolute path', '/etc/passwd'],
    ['a parent segment', '../outside.txt'],
    ['a parent segment in the middle', 'fixtures/../../outside.txt'],
    ['a Windows parent segment', 'fixtures\\..\\..\\outside.txt'],
    ['an empty path', ''],
  ])('refuses %s before reading anything', async (_label, path) => {
    const { harness, sessionId } = await openWith(['avatar.png']);

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: [path] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_PATH_INVALID' });
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'setInputFiles')).toEqual([]);
  });

  it.each(['.qa/fixture.txt', '.git/config'])('never uploads from %s', async (path) => {
    const { harness, sessionId } = await openWith(['x'], { [path]: 'content' });

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: [path] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_PATH_INVALID' });
  });

  it('refuses a path whose real location is outside the project, as a symbolic link would make it', async () => {
    const { harness, sessionId } = await openWith(['x']);
    const realPath = harness.fs.realPath.bind(harness.fs);
    harness.fs.realPath = (path) =>
      path.endsWith('link.txt') ? Promise.resolve(join('elsewhere', 'secret.txt')) : realPath(path);
    await harness.fs.writeFile(join('project', 'fixtures', 'link.txt'), 'x');

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: ['fixtures/link.txt'] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_PATH_INVALID' });
  });

  it('refuses the project root itself', async () => {
    const { harness, sessionId } = await openWith(['x']);

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: ['.'] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_PATH_INVALID' });
  });

  it('fails with BROWSER_UPLOAD_FILE_MISSING for a file that is not there', async () => {
    const { harness, sessionId } = await openWith(['x']);

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: ['fixtures/nope.png'] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_FILE_MISSING' });
  });

  it('rethrows a failure to resolve a path that is not a missing file', async () => {
    const { harness, sessionId } = await openWith(['x']);
    const realPath = harness.fs.realPath.bind(harness.fs);
    harness.fs.realPath = (path) =>
      path.endsWith('avatar.png') ? Promise.reject(new Error('disk exploded')) : realPath(path);

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: [FIXTURE] }),
    ).rejects.toThrow('disk exploded');
  });

  it('refuses a file that matches a secret pattern, naming the pattern and not the value', async () => {
    const { harness, sessionId } = await openWith(['x'], {
      'fixtures/creds.txt': 'token Bearer abcdefghijklmnopqrstuvwxyz0123',
    });

    const failure = await runBrowserUpload(harness.context, {
      sessionId,
      selector: '#avatar',
      paths: ['fixtures/creds.txt'],
    }).catch((caught: unknown) => caught);

    expect(failure).toMatchObject({ code: 'BROWSER_UPLOAD_SECRET' });
    expect((failure as Error).message).toContain('bearer-token');
    expect((failure as Error).message).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'setInputFiles')).toEqual([]);
  });

  it('refuses a file larger than the limit', async () => {
    const { harness, sessionId } = await openWith(['x'], {
      'fixtures/big.bin': new Uint8Array(MAX_UPLOAD_FILE_BYTES + 1),
    });

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: ['fixtures/big.bin'] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_TOO_LARGE' });
  });

  it('refuses no files and too many files', async () => {
    const { harness, sessionId } = await openWith(['x']);

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: [] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_INVALID' });
    await expect(
      runBrowserUpload(harness.context, {
        sessionId,
        selector: '#avatar',
        paths: Array.from({ length: MAX_UPLOAD_FILES + 1 }, () => FIXTURE),
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_INVALID' });
  });

  it('registers nothing when the page does not hold the files afterwards', async () => {
    const { harness, sessionId } = await openWith(['other.png']);

    await expect(
      runBrowserUpload(harness.context, { sessionId, selector: '#avatar', paths: [FIXTURE] }),
    ).rejects.toMatchObject({ code: 'BROWSER_UPLOAD_NOT_APPLIED' });
    expect(await harness.fs.listFiles(join('project', '.qa', 'evidence'))).toHaveLength(1);
  });

  it('reports an element that is not a file input as such', async () => {
    const { harness, sessionId } = await openWith(null);

    const failure = await runBrowserUpload(harness.context, {
      sessionId,
      selector: '#avatar',
      paths: [FIXTURE],
    }).catch((caught: unknown) => caught);

    expect(failure).toMatchObject({ code: 'BROWSER_UPLOAD_NOT_APPLIED' });
    expect((failure as Error).message).toContain('no file input');
  });
});
