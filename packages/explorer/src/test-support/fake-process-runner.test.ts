// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeProcessRunner } from './fake-process-runner.js';

describe('createFakeProcessRunner', () => {
  it('resolves with the given result regardless of the command run', async () => {
    const runner = createFakeProcessRunner({ exitCode: 0, stdout: 'ok', stderr: '' });

    const result = await runner.run('anything', ['--flag']);

    expect(result).toStrictEqual({ exitCode: 0, stdout: 'ok', stderr: '' });
  });
});
