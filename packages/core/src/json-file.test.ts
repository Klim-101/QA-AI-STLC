// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { QaError } from './errors.js';
import { readJsonFile, toCanonicalJson, writeJsonFile } from './json-file.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

const PointSchema = z.object({ x: z.number(), y: z.number() });

describe('toCanonicalJson', () => {
  it('serializes with two-space indentation and a trailing newline', () => {
    expect(toCanonicalJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});

describe('writeJsonFile and readJsonFile', () => {
  it('round-trips a value validated against its schema', async () => {
    const fs = createFakeFileSystem();
    await writeJsonFile(fs, '/root/point.json', { x: 1, y: 2 });

    expect(await readJsonFile(fs, '/root/point.json', PointSchema)).toEqual({ x: 1, y: 2 });
  });

  it('rejects reading a path that was never written', async () => {
    const fs = createFakeFileSystem();
    await expect(fs.readFile('/root/missing.json')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('throws a coded QaError for malformed JSON', async () => {
    const fs = createFakeFileSystem({ '/root/point.json': 'not json' });
    await expect(readJsonFile(fs, '/root/point.json', PointSchema)).rejects.toMatchObject({
      code: 'JSON_FILE_MALFORMED',
    });
  });

  it('throws a coded QaError when the content does not match the schema', async () => {
    const fs = createFakeFileSystem({ '/root/point.json': '{"x": "not a number"}' });
    const error = await readJsonFile(fs, '/root/point.json', PointSchema).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('JSON_FILE_INVALID');
  });
});
