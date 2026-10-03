// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { EventLog, MAX_LOGGED_TEXT_CHARS, sanitizeLoggedText, templateUrl } from './browser-event-log.js';
import { redactSecrets } from './secret-scan.js';

interface Entry {
  readonly seq: number;
  readonly label: string;
}

function logOf(capacity: number, count: number): EventLog<Entry> {
  const log = new EventLog<Entry>(capacity);
  for (let index = 1; index <= count; index += 1) {
    log.append((seq) => ({ seq, label: `event ${String(index)}` }));
  }
  return log;
}

describe('EventLog (P6-61)', () => {
  it('numbers events from 1 and returns what came after a cursor', () => {
    const log = logOf(10, 3);

    expect(log.read(0)).toMatchObject({
      entries: [{ seq: 1 }, { seq: 2 }, { seq: 3 }],
      missedCount: 0,
      latestSeq: 3,
    });
    expect(log.read(2).entries.map((entry) => entry.seq)).toEqual([3]);
    expect(log.read(3).entries).toEqual([]);
  });

  it('is empty before anything happened', () => {
    expect(new EventLog<Entry>().read(0)).toEqual({ entries: [], missedCount: 0, latestSeq: 0 });
  });

  it('drops the oldest events past its capacity and says how many a cursor missed', () => {
    const log = logOf(3, 5);

    expect(log.read(0)).toMatchObject({ entries: [{ seq: 3 }, { seq: 4 }, { seq: 5 }], missedCount: 2 });
    expect(log.read(1)).toMatchObject({ missedCount: 1 });
    expect(log.read(2)).toMatchObject({ missedCount: 0 });
    expect(log.read(4).entries.map((entry) => entry.seq)).toEqual([5]);
  });

  it('keeps events in a log that has a larger capacity than the default only up to the default', () => {
    const log = new EventLog<Entry>();
    for (let index = 0; index < 505; index += 1) {
      log.append((seq) => ({ seq, label: 'x' }));
    }

    expect(log.read(0).entries).toHaveLength(500);
    expect(log.read(0).missedCount).toBe(5);
  });
});

describe('sanitizeLoggedText (P6-61)', () => {
  it('redacts secret shapes and caps the length', () => {
    expect(sanitizeLoggedText('sent Bearer abcdefghijklmnopqrstuvwxyz0123 ok')).toBe('sent [REDACTED] ok');
    expect(sanitizeLoggedText('x'.repeat(MAX_LOGGED_TEXT_CHARS + 50))).toBe(
      `${'x'.repeat(MAX_LOGGED_TEXT_CHARS)}…`,
    );
  });
});

describe('redactSecrets (P6-61)', () => {
  it('replaces every match of every pattern, and leaves clean text alone', () => {
    expect(redactSecrets('plain text')).toBe('plain text');
    // Built at run time so no key-shaped literal sits in the repository for a secret scanner to find.
    const first = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
    const second = ['AKIA', 'QRSTUVWXYZ123456'].join('');
    expect(redactSecrets(`${first} and ${second}`)).toBe('[REDACTED] and [REDACTED]');
    expect(redactSecrets('a password=hunter22 b')).toBe('a [REDACTED] b');
  });
});

describe('templateUrl (P6-61)', () => {
  it('keeps the origin and the path and templates identifier segments', () => {
    expect(templateUrl('https://app.example.test/orders/1234/items/7')).toBe(
      'https://app.example.test/orders/:id/items/:id',
    );
    expect(templateUrl('https://app.example.test/u/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      'https://app.example.test/u/:id',
    );
    expect(templateUrl('https://app.example.test/f/deadbeefdeadbeef00')).toBe(
      'https://app.example.test/f/:id',
    );
    expect(templateUrl('https://app.example.test/t/abcdefghijklmnopqrstuvwxyz')).toBe(
      'https://app.example.test/t/:id',
    );
    expect(templateUrl('https://app.example.test/api/orders')).toBe('https://app.example.test/api/orders');
  });

  it('keeps query parameter names, sorted and without repeats, and never their values', () => {
    expect(templateUrl('https://app.example.test/s?q=secret&page=2&q=again')).toBe(
      'https://app.example.test/s?page&q',
    );
  });

  it('drops the fragment and any credentials in the URL', () => {
    expect(templateUrl('https://user:hunter2@app.example.test:8443/a#token=abc')).toBe(
      'https://app.example.test:8443/a',
    );
  });

  it('reports a URL it cannot parse without echoing it', () => {
    expect(templateUrl('not a url with Bearer abcdefghijklmnopqrstuvwxyz')).toBe('[invalid url]');
  });
});
