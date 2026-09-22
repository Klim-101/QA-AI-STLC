// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { scanForSecrets } from './secret-scan.js';

describe('scanForSecrets', () => {
  it('finds nothing in ordinary content', () => {
    expect(scanForSecrets('the button says "Submit"')).toEqual([]);
  });

  it('detects an AWS access key ID', () => {
    expect(scanForSecrets('key=AKIAIOSFODNN7EXAMPLE')).toEqual([{ pattern: 'aws-access-key-id' }]);
  });

  it('detects a GitHub personal access token', () => {
    expect(scanForSecrets(`token: ghp_${'a'.repeat(36)}`)).toEqual([{ pattern: 'github-token' }]);
  });

  it('detects a Slack token', () => {
    expect(scanForSecrets('xoxb-not-a-real-token-000000')).toEqual([{ pattern: 'slack-token' }]);
  });

  it('detects a JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub3QtcmVhbCJ9.notarealsignaturevalue000000'; // gitleaks:allow
    expect(scanForSecrets(jwt)).toEqual([{ pattern: 'jwt' }]);
  });

  it('detects a Bearer authorization header', () => {
    expect(scanForSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345')).toEqual([
      { pattern: 'bearer-token' },
    ]);
  });

  it('detects a password assignment', () => {
    expect(scanForSecrets('{"password": "hunter22"}')).toEqual([{ pattern: 'password-assignment' }]);
  });

  it('detects an apiKey assignment', () => {
    expect(scanForSecrets('apiKey: "example-not-a-real-key-000"')).toEqual([
      { pattern: 'api-key-assignment' },
    ]);
  });

  it('reports every pattern that matches, not just the first', () => {
    const content = `AKIAIOSFODNN7EXAMPLE and password: "hunter222"`;
    const matches = scanForSecrets(content).map((match) => match.pattern);
    expect(matches).toEqual(expect.arrayContaining(['aws-access-key-id', 'password-assignment']));
    expect(matches).toHaveLength(2);
  });

  it('detects an unquoted password in a URL-encoded form body (regression, #285)', () => {
    expect(scanForSecrets('username=alice&password=hunter2')).toEqual([{ pattern: 'password-assignment' }]);
  });

  it('detects an unquoted apiKey in a URL-encoded form body (regression, #285)', () => {
    expect(scanForSecrets('apiKey=example-not-a-real-key-000')).toEqual([{ pattern: 'api-key-assignment' }]);
  });
});
