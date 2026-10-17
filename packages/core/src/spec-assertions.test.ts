// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { analyzeSpecAssertions, collectGroundingStrings, normalizeForGrounding } from './spec-assertions.js';

const LOCATORS = new Set(['loginButton', 'statusText']);
const CORPUS = collectGroundingStrings({ title: 'Log in', expected: 'The dashboard greets Alex' }, undefined);

function analyze(body: string, options: { locators?: ReadonlySet<string> | null; corpus?: string } = {}) {
  const source = [
    "test('t', async ({ page }) => {",
    "  await test.step('[step-1] Open', async () => {",
    ...body.split('\n').map((line) => `    ${line}`),
    '  });',
    '});',
  ].join('\n');
  return analyzeSpecAssertions(source, {
    ...(options.locators === null ? {} : { locatorNames: options.locators ?? LOCATORS }),
    groundingCorpus: options.corpus ?? CORPUS,
  });
}

describe('analyzeSpecAssertions: what an assertion is about', () => {
  it('reads a locator-module function as a locator and a page as the page', () => {
    const [byLocator, byPage] = analyze(
      ['await expect(loginButton(page)).toBeVisible();', 'await expect(page).toHaveURL(/dashboard/);'].join(
        '\n',
      ),
    );

    expect(byLocator).toMatchObject({
      id: 'a1',
      stepId: 'step-1',
      subject: { kind: 'locator', name: 'loginButton' },
      matcher: 'toBeVisible',
      findings: [],
    });
    expect(byPage).toMatchObject({ id: 'a2', subject: { kind: 'page' }, matcher: 'toHaveURL' });
  });

  it('numbers assertions in source order and records the line', () => {
    const assertions = analyze(
      'await expect(page).toHaveTitle("Log in");\nawait expect(page).toHaveURL(/login/);',
    );

    expect(assertions.map((assertion) => [assertion.id, assertion.line])).toEqual([
      ['a1', 3],
      ['a2', 4],
    ]);
  });

  it.each([
    ['a string', 'expect("ok").toBe("ok")'],
    ['a number', 'expect(1).toBe(1)'],
    ['a negative number', 'expect(-1).toBeLessThan(0)'],
    ['true', 'expect(true).toBeTruthy()'],
    ['false', 'expect(false).toBeFalsy()'],
    ['null', 'expect(null).toBeNull()'],
    ['an array', 'expect([1, 2]).toHaveLength(2)'],
    ['an object', 'expect({ a: 1 }).toEqual({ a: 1 })'],
    ['a template', 'expect(`x`).toBe("x")'],
  ])('flags %s as the subject as a tautology', (_name, statement) => {
    const [assertion] = analyze(statement);

    expect(assertion?.subject.kind).toBe('literal');
    expect(assertion?.findings).toMatchObject([{ code: 'tautology', severity: 'error' }]);
  });

  it.each([
    ["page.getByRole('button', { name: 'Log in' })"],
    ["page.locator('#email')"],
    ["page.getByTestId('x').first()"],
    ["page.frameLocator('iframe').locator('a')"],
    ["page.$('a')"],
  ])('flags %s as an inline locator', (subject) => {
    const [assertion] = analyze(`await expect(${subject}).toBeVisible();`);

    expect(assertion?.subject.kind).toBe('inline-locator');
    expect(assertion?.findings).toMatchObject([{ code: 'inline-locator', severity: 'error' }]);
  });

  it('flags a locator function the module does not export, and only when there is a module to compare with', () => {
    const unknown = analyze('await expect(ghostButton(page)).toBeVisible();');
    const noModule = analyze('await expect(ghostButton(page)).toBeVisible();', { locators: null });

    expect(unknown[0]?.findings).toMatchObject([{ code: 'unknown-locator', severity: 'error' }]);
    expect(unknown[0]?.findings[0]?.message).toContain('"ghostButton"');
    expect(noModule[0]?.findings).toEqual([]);
  });

  it.each([
    ['a response status', 'expect(response.status()).toBe(200)'],
    ['a page member that is not a locator', 'expect(page.url()).toContain("login")'],
    ['an awaited value', 'expect(await page.title()).toBe("Log in")'],
    ['a parenthesized value', 'expect((await page.title())).toBe("Log in")'],
    ['a call with no argument', 'expect().toBe(1)'],
    ['a call that is not of a page', 'expect(compute(page, 1)).toBe(1)'],
    ['a plain variable', 'expect(count).toBe(3)'],
  ])('leaves %s as other, with no finding of its own', (_name, statement) => {
    const [assertion] = analyze(statement);

    expect(assertion?.subject.kind).toBe('other');
    expect(assertion?.findings.filter((finding) => finding.code !== 'ungrounded-value')).toEqual([]);
  });

  it('finds assertions with .not, expect.soft, expect.poll and an await in front', () => {
    const assertions = analyze(
      [
        'await expect(loginButton(page)).not.toBeVisible();',
        'await expect.soft(loginButton(page)).toBeEnabled();',
        'await expect.poll(() => 1).toBe(1);',
        'expect(loginButton(page)).toBeHidden();',
      ].join('\n'),
    );

    expect(assertions.map((assertion) => assertion.matcher)).toEqual([
      'toBeVisible',
      'toBeEnabled',
      'toBe',
      'toBeHidden',
    ]);
  });

  it('ignores a call that only looks like an assertion', () => {
    expect(analyze('await somethingElse(page).toBeVisible();\nawait helper.toBeVisible();\nfoo();')).toEqual(
      [],
    );
  });

  it('reports no step for an assertion outside a titled test.step', () => {
    const outside = analyzeSpecAssertions(
      [
        "test('t', async ({ page }) => {",
        "  await expect(page).toHaveTitle('Log in');",
        "  await test.step('Open the page', async () => {",
        "    await expect(page).toHaveTitle('Log in');",
        '  });',
        '  await test.step(title, async () => {',
        "    await expect(page).toHaveTitle('Log in');",
        '  });',
        '  await other.step("[step-9] x", async () => {',
        "    await expect(page).toHaveTitle('Log in');",
        '  });',
        '});',
      ].join('\n'),
      { groundingCorpus: CORPUS },
    );

    expect(assertions(outside)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('reads the step of a template-literal title and of the expected result', () => {
    const [first, second] = analyzeSpecAssertions(
      [
        "test('t', async ({ page }) => {",
        '  await test.step(`[step-2] Save`, async () => {',
        "    await expect(page).toHaveTitle('Log in');",
        '  });',
        "  await test.step('[expected-result] Done', async () => {",
        "    await expect(page).toHaveTitle('Log in');",
        '  });',
        '});',
      ].join('\n'),
      { groundingCorpus: CORPUS },
    );

    expect([first?.stepId, second?.stepId]).toEqual(['step-2', 'expected-result']);
  });
});

function assertions(list: ReturnType<typeof analyzeSpecAssertions>): (string | undefined)[] {
  return list.map((assertion) => assertion.stepId);
}

describe('analyzeSpecAssertions: expected values', () => {
  it('reads the values a matcher expects from strings, templates, regular expressions and new RegExp', () => {
    const [a, b, c, d, e] = analyze(
      [
        'await expect(page).toHaveTitle("Log in");',
        'await expect(page).toHaveTitle(`Log in`);',
        'await expect(page).toHaveURL(/log\\.in/);',
        'await expect(page).toHaveURL(new RegExp("log\\\\.in"));',
        'await expect(statusText(page)).toHaveCount(3);',
      ].join('\n'),
    );

    expect(a?.expectedValues).toEqual(['Log in']);
    expect(b?.expectedValues).toEqual(['Log in']);
    expect(c?.expectedValues).toEqual(['log.in']);
    expect(d?.expectedValues).toEqual(['log.in']);
    expect(e?.expectedValues).toEqual([]);
  });

  it('ignores a RegExp built from something that is not a string, and a constructor that is not RegExp', () => {
    const [a, b] = analyze(
      [
        'await expect(page).toHaveURL(new RegExp(pattern));',
        'await expect(page).toHaveURL(new Thing("x"));',
      ].join('\n'),
    );

    expect(a?.expectedValues).toEqual([]);
    expect(b?.expectedValues).toEqual([]);
  });

  it('ignores a RegExp built with no argument', () => {
    expect(analyze('await expect(page).toHaveURL(new RegExp);')[0]?.expectedValues).toEqual([]);
  });

  it('warns about a value that neither the case nor its session contains, listing each', () => {
    const [assertion] = analyze(
      'await expect(page).toHaveText(["Order #4242 confirmed", "dashboard greets alex"]);',
    );
    const [single] = analyze('await expect(page).toContainText("Order #4242 confirmed");');

    expect(single?.findings).toMatchObject([{ code: 'ungrounded-value', severity: 'warning' }]);
    expect(single?.findings[0]?.message).toContain('"Order #4242 confirmed"');
    expect(assertion?.expectedValues).toEqual([]);
  });

  it('accepts a path or a pattern whose word the case contains, ignoring the punctuation round it', () => {
    const [path, pattern] = analyze(
      [
        'await expect(page).toHaveURL(/\\/dashboard/);',
        'await expect(page).toHaveURL(new RegExp("^/dashboard$"));',
      ].join('\n'),
    );

    expect(path?.findings).toEqual([]);
    expect(pattern?.findings).toEqual([]);
  });

  it('accepts a value the case contains, whatever its case or spacing, and skips a very short one', () => {
    const grounded = analyze('await expect(page).toContainText("the  DASHBOARD greets alex");');
    const short = analyze('await expect(page).toContainText("ab");');

    expect(grounded[0]?.findings).toEqual([]);
    expect(short[0]?.findings).toEqual([]);
  });
});

describe('collectGroundingStrings and normalizeForGrounding', () => {
  it('collects every string of nested values, normalized, and skips what is not text', () => {
    const corpus = collectGroundingStrings(
      { a: 'Hello   World', b: [1, 'Next', { c: null, d: 'Deep' }] },
      'Top',
      undefined,
    );

    expect(corpus.split('\n')).toEqual(['hello world', 'next', 'deep', 'top']);
  });

  it('lowercases and collapses whitespace', () => {
    expect(normalizeForGrounding('  A\n\tB  ')).toBe('a b');
  });
});
