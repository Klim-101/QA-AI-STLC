// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { FeatureIdSchema, IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';

describe('Sha256HexSchema', () => {
  it('accepts a 64-character lowercase hex digest', () => {
    expect(Sha256HexSchema.safeParse('a'.repeat(64)).success).toBe(true);
  });

  it('rejects uppercase hex and the wrong length', () => {
    expect(Sha256HexSchema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(Sha256HexSchema.safeParse('a'.repeat(63)).success).toBe(false);
  });
});

describe('RelativePathSchema', () => {
  it('accepts a forward-slash project-relative path', () => {
    expect(RelativePathSchema.safeParse('evidence/run-1/step.png').success).toBe(true);
  });

  it('rejects an absolute path, a backslash path and a path escaping the project', () => {
    expect(RelativePathSchema.safeParse('/etc/passwd').success).toBe(false);
    expect(RelativePathSchema.safeParse('evidence\\run-1\\step.png').success).toBe(false);
    expect(RelativePathSchema.safeParse('../outside/step.png').success).toBe(false);
  });

  it('rejects a Windows drive-absolute path', () => {
    expect(RelativePathSchema.safeParse('C:/outside/file.json').success).toBe(false);
    expect(RelativePathSchema.safeParse('C:outside/file.json').success).toBe(false);
  });
});

describe('FeatureIdSchema', () => {
  it('accepts a lowercase kebab-case name', () => {
    expect(FeatureIdSchema.safeParse('checkout').success).toBe(true);
    expect(FeatureIdSchema.safeParse('checkout-flow-2').success).toBe(true);
  });

  it('rejects uppercase letters, spaces, underscores and a leading/trailing hyphen', () => {
    expect(FeatureIdSchema.safeParse('Checkout').success).toBe(false);
    expect(FeatureIdSchema.safeParse('checkout flow').success).toBe(false);
    expect(FeatureIdSchema.safeParse('checkout_flow').success).toBe(false);
    expect(FeatureIdSchema.safeParse('-checkout').success).toBe(false);
    expect(FeatureIdSchema.safeParse('checkout-').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(FeatureIdSchema.safeParse('').success).toBe(false);
  });
});

describe('IsoDateTimeSchema', () => {
  it('accepts an offset ISO 8601 timestamp', () => {
    expect(IsoDateTimeSchema.safeParse('2026-09-16T12:00:00Z').success).toBe(true);
  });

  it('rejects a bare date with no time component', () => {
    expect(IsoDateTimeSchema.safeParse('2026-09-16').success).toBe(false);
  });
});
