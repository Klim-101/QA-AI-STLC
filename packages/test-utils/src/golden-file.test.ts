// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'vitest';
import { expectMatchesGoldenFile } from './golden-file.js';

describe('expectMatchesGoldenFile', () => {
  it('matches a stored golden file', async () => {
    await expectMatchesGoldenFile('hello, golden file\n', './__snapshots__/hello.golden.txt');
  });

  it('normalizes CRLF before comparing', async () => {
    await expectMatchesGoldenFile('hello, golden file\r\n', './__snapshots__/hello.golden.txt');
  });
});
