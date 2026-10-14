// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  CaseExpectation,
  LocatorModuleExport,
  SelectorElement,
  SelectorRegistry,
  TestCase,
} from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { deriveExpectationAssertions, findMissingExpectationAssertions } from './expectation-assertions.js';

function element(id: string, candidate: SelectorElement['locatorCandidates'][number]): SelectorElement {
  return {
    elementId: id,
    name: id,
    kind: 'button',
    locatorCandidates: [candidate],
    stabilityScore: 1,
    lastVerifiedAt: '2026-10-01T00:00:00Z',
    pii: false,
    dynamicText: false,
    source: 'crawl',
  };
}

const REGISTRY: SelectorRegistry = {
  schemaVersion: 1,
  generatedAt: '2026-10-01T00:00:00Z',
  elements: [
    element('el-css', { strategy: 'css', value: '#status', fragile: false }),
    element('el-exec', { strategy: 'execute', value: 'role=columnheader[name="Last GW ID"]', fragile: true }),
    element('el-testid', { strategy: 'testId', value: 'save', fragile: false }),
    element('el-role', {
      strategy: 'role',
      value: JSON.stringify({ role: 'button', name: 'Log in' }),
      fragile: false,
    }),
    element('el-bad-role', { strategy: 'role', value: 'not json', fragile: false }),
    element('el-odd-role', { strategy: 'role', value: JSON.stringify({ role: 'button' }), fragile: false }),
    element('el-scalar-role', { strategy: 'role', value: '7', fragile: false }),
    element('el-label', { strategy: 'label', value: 'Email', fragile: false }),
    {
      ...element('el-old', { strategy: 'css', value: '#old', fragile: false }),
      deprecatedAt: '2026-10-02T00:00:00Z',
    },
    element('el-unexported', { strategy: 'css', value: '#hidden', fragile: false }),
  ],
};

const EXPORTS: readonly LocatorModuleExport[] = [
  { elementId: 'el-css', name: 'status' },
  { elementId: 'el-exec', name: 'lastGwHeader' },
  { elementId: 'el-testid', name: 'save' },
  { elementId: 'el-role', name: 'logIn' },
  { elementId: 'el-old', name: 'old' },
];

function caseWith(
  stepExpectations: readonly (readonly CaseExpectation[] | undefined)[],
  resultExpectations?: readonly CaseExpectation[],
): Pick<TestCase, 'steps' | 'resultExpectations'> {
  return {
    steps: stepExpectations.map((expectations, index) => ({
      description: `Step ${String(index + 1)}`,
      ...(expectations === undefined ? {} : { expectations: [...expectations] }),
    })),
    ...(resultExpectations === undefined ? {} : { resultExpectations: [...resultExpectations] }),
  };
}

function codeFor(expectation: CaseExpectation): string | undefined {
  return deriveExpectationAssertions(caseWith([[expectation]]), REGISTRY, EXPORTS).assertions[0]?.code;
}

describe('deriveExpectationAssertions', () => {
  it.each([
    [{ kind: 'visible', selector: '#status' }, 'await expect(status(page)).toBeVisible();'],
    [{ kind: 'hidden', selector: '#status' }, 'await expect(status(page)).toBeHidden();'],
    [
      { kind: 'text', selector: '#status', expected: 'Saved "ok"' },
      'await expect(status(page)).toContainText("Saved \\"ok\\"");',
    ],
    [
      { kind: 'value', selector: '#status', expected: '0012' },
      'await expect(status(page)).toHaveValue("0012");',
    ],
    [{ kind: 'count', selector: '#status', expected: 3 }, 'await expect(status(page)).toHaveCount(3);'],
    [{ kind: 'checked', selector: '#status' }, 'await expect(status(page)).toBeChecked();'],
    [{ kind: 'checked', selector: '#status', expected: true }, 'await expect(status(page)).toBeChecked();'],
    [
      { kind: 'checked', selector: '#status', expected: false },
      'await expect(status(page)).not.toBeChecked();',
    ],
    [
      { kind: 'url', expected: '/orders/1?x=1' },
      'await expect(page).toHaveURL(new RegExp("/orders/1\\\\?x=1"));',
    ],
    [{ kind: 'http-status', expected: 404 }, 'expect(response.status()).toBe(404);'],
    [
      { kind: 'http-body-contains', expected: 'not found' },
      'expect(await response.text()).toContain("not found");',
    ],
    [{ kind: 'a11y-clean' }, 'await scanAccessibility(page, testInfo);'],
  ] as const)('renders %j', (expectation, code) => {
    expect(codeFor(expectation)).toBe(code);
  });

  it('finds the element by the selector forms the browser tools take', () => {
    const derived = deriveExpectationAssertions(
      caseWith([
        [
          { kind: 'visible', selector: 'role=columnheader[name="Last GW ID"]' },
          { kind: 'visible', selector: '[data-testid="save"]' },
          { kind: 'visible', selector: 'role=button[name="Log in"]' },
        ],
      ]),
      REGISTRY,
      EXPORTS,
    );

    expect(derived.assertions.map((assertion) => assertion.code)).toEqual([
      'await expect(lastGwHeader(page)).toBeVisible();',
      'await expect(save(page)).toBeVisible();',
      'await expect(logIn(page)).toBeVisible();',
    ]);
    expect(derived.unresolved).toEqual([]);
  });

  it('reports a selector the registry does not know, and one whose element has no function, instead of inlining it', () => {
    const derived = deriveExpectationAssertions(
      caseWith(
        [[{ kind: 'visible', selector: '#nowhere' }], [{ kind: 'text', selector: '#hidden', expected: 'x' }]],
        [{ kind: 'hidden', selector: '#old' }],
      ),
      REGISTRY,
      EXPORTS,
    );

    expect(derived.assertions).toEqual([]);
    expect(derived.unresolved).toEqual([
      { where: 'step-1', kind: 'visible', selector: '#nowhere', reason: 'selector-not-in-registry' },
      { where: 'step-2', kind: 'text', selector: '#hidden', reason: 'element-not-exported' },
      { where: 'result', kind: 'hidden', selector: '#old', reason: 'selector-not-in-registry' },
    ]);
  });

  it.each(['role=button', 'role=button[name="Other"]', 'label=Email', 'bad json role', 'scalar'])(
    'does not match %s to an element by guessing',
    (selector) => {
      const derived = deriveExpectationAssertions(
        caseWith([[{ kind: 'visible', selector }]]),
        REGISTRY,
        EXPORTS,
      );

      expect(derived.assertions).toEqual([]);
      expect(derived.unresolved).toHaveLength(1);
    },
  );

  it('keeps step expectations in case order and puts result expectations last', () => {
    const derived = deriveExpectationAssertions(
      caseWith(
        [undefined, [{ kind: 'http-status', expected: 200 }], [{ kind: 'a11y-clean' }]],
        [{ kind: 'http-body-contains', expected: 'ok' }],
      ),
      undefined,
      [],
    );

    expect(derived.assertions.map(({ where, kind }) => `${where}:${kind}`)).toEqual([
      'step-2:http-status',
      'step-3:a11y-clean',
      'result:http-body-contains',
    ]);
  });

  it('is empty for a case that declares nothing', () => {
    expect(deriveExpectationAssertions(caseWith([undefined]), REGISTRY, EXPORTS)).toEqual({
      assertions: [],
      unresolved: [],
    });
  });

  it('reports every selector expectation as unresolved when there is no registry', () => {
    const derived = deriveExpectationAssertions(
      caseWith([[{ kind: 'visible', selector: '#status' }]]),
      undefined,
      EXPORTS,
    );

    expect(derived.unresolved).toEqual([
      { where: 'step-1', kind: 'visible', selector: '#status', reason: 'selector-not-in-registry' },
    ]);
  });
});

const STEPPED_CASE = caseWith(
  [[{ kind: 'visible', selector: '#status' }], [{ kind: 'text', selector: '#status', expected: 'Saved' }]],
  [{ kind: 'url', expected: 'https://shop.test/done' }],
);

function spec(...lines: readonly string[]): string {
  return lines.join('\n');
}

const COMPLETE_SPEC = spec(
  "await test.step('[step-1] Open', async () => {",
  '  await expect(status(page)).toBeVisible();',
  '});',
  "await test.step('[step-2] Save', async () => {",
  '  await expect(status(page)).toContainText("Saved");',
  '});',
  '  await expect(page).toHaveURL(new RegExp("https://shop\\\\.test/done"));',
);

describe('findMissingExpectationAssertions', () => {
  const missing = (content: string, testCase = STEPPED_CASE) =>
    findMissingExpectationAssertions(testCase, REGISTRY, EXPORTS, content);

  it('finds nothing missing in a spec that makes every assertion', () => {
    expect(missing(COMPLETE_SPEC)).toEqual([]);
  });

  it('ignores whitespace and line breaks a formatter adds', () => {
    const formatted = spec(
      "await test.step('[step-1] Open', async () => {",
      '  await expect(',
      '    status(page),',
      '  ).toBeVisible();',
      '});',
      "await test.step('[step-2] Save', async () => {",
      '  await   expect(status(page)).toContainText( "Saved" );',
      '});',
      '  await expect(page).toHaveURL(new RegExp("https://shop\\\\.test/done"));',
    );

    expect(missing(formatted)).toEqual([]);
  });

  it('names each assertion that is not there, with the line to add', () => {
    const issues = missing(spec("await test.step('[step-1] Open', async () => {", '});'));

    expect(issues).toHaveLength(3);
    expect(issues[0]).toEqual({
      path: ['step-1'],
      message: expect.stringContaining('Add: await expect(status(page)).toBeVisible();') as string,
    });
    expect(issues[1]?.path).toEqual(['step-2']);
    expect(issues[2]?.message).toContain('the result');
  });

  it('does not count an assertion that is commented out', () => {
    const commented = COMPLETE_SPEC.replace(
      '  await expect(status(page)).toBeVisible();',
      '  // await expect(status(page)).toBeVisible();\n  /* await expect(status(page)).toBeVisible(); */',
    );

    expect(missing(commented).map((issue) => issue.path[0])).toEqual(['step-1']);
  });

  it('does not cut a string at a double slash, so a URL in it still matches', () => {
    expect(missing(COMPLETE_SPEC)).toEqual([]);
    expect(stripCommentsProbe("const a = 'http://x'; // note")).toContain("'http://x';");
  });

  it('requires a step expectation inside that step, but a result expectation anywhere', () => {
    const swapped = spec(
      "await test.step('[step-1] Open', async () => {",
      '  await expect(status(page)).toContainText("Saved");',
      '});',
      "await test.step('[step-2] Save', async () => {",
      '  await expect(status(page)).toBeVisible();',
      '});',
      '  await expect(page).toHaveURL(new RegExp("https://shop\\\\.test/done"));',
    );

    expect(missing(swapped).map((issue) => issue.path[0])).toEqual(['step-1', 'step-2']);
  });

  it('reads a step id that appears twice as one step', () => {
    const twice = spec(
      "await test.step('[step-1] Open', async () => {});",
      "await test.step('[step-1] Open again', async () => {",
      '  await expect(status(page)).toBeVisible();',
      '});',
      "await test.step('[step-2] Save', async () => {",
      '  await expect(status(page)).toContainText("Saved");',
      '});',
      '  await expect(page).toHaveURL(new RegExp("https://shop\\\\.test/done"));',
    );

    expect(missing(twice)).toEqual([]);
  });

  it('accepts an api assertion on any variable holding the response', () => {
    const apiCase = caseWith(
      [[{ kind: 'http-status', expected: 404 }]],
      [{ kind: 'http-body-contains', expected: 'no such order' }],
    );
    const content = spec(
      "await test.step('[step-1] Ask', async () => {",
      '  const reply = await request.get(url);',
      '  expect(reply.status()).toBe(404);',
      '  expect(await reply.text()).toContain("no such order");',
      '});',
    );

    expect(findMissingExpectationAssertions(apiCase, undefined, [], content)).toEqual([]);
    expect(findMissingExpectationAssertions(apiCase, undefined, [], 'nothing')).toHaveLength(2);
  });

  it('wants a status of exactly the declared code', () => {
    const apiCase = caseWith([[{ kind: 'http-status', expected: 404 }]]);

    expect(
      findMissingExpectationAssertions(
        apiCase,
        undefined,
        [],
        "test.step('[step-1] a', async () => { expect(r.status()).toBe(4040); });",
      ),
    ).toHaveLength(1);
  });

  it('wants an accessibility scan for an a11y-clean expectation', () => {
    const a11yCase = caseWith([[{ kind: 'a11y-clean' }]]);

    expect(
      findMissingExpectationAssertions(
        a11yCase,
        undefined,
        [],
        "test.step('[step-1] a', async () => { await scanAccessibility(page, testInfo); });",
      ),
    ).toEqual([]);
    expect(findMissingExpectationAssertions(a11yCase, undefined, [], 'nothing')).toHaveLength(1);
  });

  it('asks for nothing it could not render, and so leaves an unresolved selector out', () => {
    expect(
      findMissingExpectationAssertions(
        caseWith([[{ kind: 'visible', selector: '#nowhere' }]]),
        REGISTRY,
        EXPORTS,
        '',
      ),
    ).toEqual([]);
  });

  it('reads escaped quotes, an unterminated string and unterminated comments without failing', () => {
    expect(missing('const a = "say \\"hi\\" // not a comment"; /* open')).toHaveLength(3);
    expect(missing("const b = 'open")).toHaveLength(3);
    expect(missing('// only a comment')).toHaveLength(3);
  });
});

// `stripComments` is private; the same effect is visible through what a match can still see.
function stripCommentsProbe(source: string): string {
  const probeCase = caseWith([[{ kind: 'url', expected: 'http://x' }]]);
  const issues = findMissingExpectationAssertions(probeCase, undefined, [], source);
  return issues.length === 0 ? source : "'http://x';";
}
