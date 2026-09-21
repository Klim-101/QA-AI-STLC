// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createLocatorMethods } from './locator-stub.js';

describe('createLocatorMethods', () => {
  it('every getBy*/locator method resolves to exactly one match by default', async () => {
    const methods = createLocatorMethods();

    expect(await methods.getByRole('button').count()).toBe(1);
    expect(await methods.getByTestId('save').count()).toBe(1);
    expect(await methods.getByLabel('Email').count()).toBe(1);
    expect(await methods.getByPlaceholder('you@example.com').count()).toBe(1);
    expect(await methods.getByText('Save').count()).toBe(1);
    expect(await methods.locator('#save').count()).toBe(1);
  });

  it('consumes configured locatorCounts one count() call at a time, repeating the last value', async () => {
    const methods = createLocatorMethods({ locatorCounts: [1, 0] });
    const target = methods.locator('#save');

    expect(await target.count()).toBe(1);
    expect(await target.count()).toBe(0);
    expect(await target.count()).toBe(0);
  });

  it('defaults to a count of 1 when locatorCounts is configured empty', async () => {
    const methods = createLocatorMethods({ locatorCounts: [] });

    expect(await methods.locator('#save').count()).toBe(1);
  });

  it('defaults reload() to a 200 response and honors an explicitly configured null', async () => {
    expect((await createLocatorMethods().reload())?.status()).toBe(200);
    await expect(createLocatorMethods({ reloadResponse: null }).reload()).resolves.toBeNull();
  });

  it('resolves setViewportSize()', async () => {
    await expect(
      createLocatorMethods().setViewportSize({ width: 375, height: 667 }),
    ).resolves.toBeUndefined();
  });

  it('defaults viewportSize() to 1280x720 and honors a configured value, including null', () => {
    expect(createLocatorMethods().viewportSize()).toEqual({ width: 1280, height: 720 });
    expect(createLocatorMethods({ viewportSize: { width: 375, height: 667 } }).viewportSize()).toEqual({
      width: 375,
      height: 667,
    });
    expect(createLocatorMethods({ viewportSize: null }).viewportSize()).toBeNull();
  });

  it('defaults url() and title(), honors configured values, and returns screenshot bytes', async () => {
    expect(createLocatorMethods().url()).toBe('about:blank');
    expect(await createLocatorMethods().title()).toBe('');
    expect(createLocatorMethods({ url: 'https://example.com/' }).url()).toBe('https://example.com/');
    expect(await createLocatorMethods({ title: 'Home' }).title()).toBe('Home');
    expect((await createLocatorMethods().screenshot()).byteLength).toBeGreaterThan(0);
  });
});
