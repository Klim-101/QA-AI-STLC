// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeHttpClient } from './fake-http-client.js';

describe('createFakeHttpClient', () => {
  it('resolves with the given response', async () => {
    const client = createFakeHttpClient({ ok: true, status: 200 });

    await expect(client.get('https://example.com')).resolves.toStrictEqual({ ok: true, status: 200 });
  });

  it('rejects with the given error', async () => {
    const client = createFakeHttpClient(new Error('network down'));

    await expect(client.get('https://example.com')).rejects.toThrow('network down');
  });
});
