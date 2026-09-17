// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { processIO } from './cli-io.js';

describe('processIO', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a newline-terminated line to stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    processIO.stdout('hello');

    expect(write).toHaveBeenCalledWith('hello\n');
  });

  it('writes a newline-terminated line to stderr', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    processIO.stderr('oops');

    expect(write).toHaveBeenCalledWith('oops\n');
  });
});
