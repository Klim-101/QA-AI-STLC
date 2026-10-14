// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  CaseExpectation,
  ExpectationAssertion,
  LocatorModuleExport,
  SelectorElement,
  SelectorRegistry,
  SpokeValidationIssue,
  TestCase,
  UnresolvedExpectation,
} from '@qa-ai-stlc/schemas';
import { STEP_ID_PREFIX } from './step-ids.js';

/** True when the case declares at least one expectation, at any step or for the result. */
export function hasDeclaredExpectations(testCase: Pick<TestCase, 'steps' | 'resultExpectations'>): boolean {
  return listDeclaredExpectations(testCase).length > 0;
}

/** The `where` of a result expectation, which a spec may check in any step. */
export const RESULT_EXPECTATION_WHERE = 'result';

export interface DerivedExpectationAssertions {
  readonly assertions: readonly ExpectationAssertion[];
  readonly unresolved: readonly UnresolvedExpectation[];
}

interface DeclaredExpectation {
  readonly where: string;
  readonly expectation: CaseExpectation;
}

/** Every expectation the case declares, per step in case order, then the result's. */
function listDeclaredExpectations(
  testCase: Pick<TestCase, 'steps' | 'resultExpectations'>,
): DeclaredExpectation[] {
  return [
    ...testCase.steps.flatMap((step, index) =>
      (step.expectations ?? []).map((expectation) => ({
        where: `${STEP_ID_PREFIX}${String(index + 1)}`,
        expectation,
      })),
    ),
    ...(testCase.resultExpectations ?? []).map((expectation) => ({
      where: RESULT_EXPECTATION_WHERE,
      expectation,
    })),
  ];
}

// An element whose locator is the very selector the expectation names, written the way the browser
// tools take it: a CSS selector (also what a session registers as `execute`), a `data-testid`
// attribute selector, or Playwright's `role=` engine. Anything else is not guessed at.
function candidateMatchesSelector(
  candidate: SelectorElement['locatorCandidates'][number],
  selector: string,
): boolean {
  switch (candidate.strategy) {
    case 'css':
    case 'execute':
      return candidate.value === selector;
    case 'testId':
      return selector === `[data-testid="${candidate.value}"]`;
    case 'role': {
      try {
        const parsed: unknown = JSON.parse(candidate.value);
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          'role' in parsed &&
          'name' in parsed &&
          selector === `role=${String(parsed.role)}[name="${String(parsed.name)}"]`
        );
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function findElementForSelector(registry: SelectorRegistry, selector: string): SelectorElement | undefined {
  return registry.elements.find(
    (element) =>
      element.deprecatedAt === undefined &&
      element.locatorCandidates.some((candidate) => candidateMatchesSelector(candidate, selector)),
  );
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// What the engine compares, per kind, ignoring whitespace so a formatter cannot break the match. A
// `{ ... }` pattern is a regular expression source over the whitespace-free spec text; the rest are
// literal substrings.
interface AssertionForm {
  /** The line a spec contains. */
  readonly code: string;
  /** Matches the same assertion with the whitespace removed from it. */
  readonly pattern: RegExp;
}

function literalForm(code: string): AssertionForm {
  return { code, pattern: new RegExp(escapeForRegExp(stripWhitespace(code).replace(/;$/u, ''))) };
}

function stripWhitespace(text: string): string {
  return text.replace(/\s+/gu, '');
}

// What a formatter may change in a call without changing it: whitespace, and a trailing comma
// before a closing parenthesis once the arguments are split over lines.
function normalizeCode(text: string): string {
  return stripWhitespace(text).replace(/,\)/gu, ')');
}

function renderBrowserForm(expectation: CaseExpectation, locatorName: string): AssertionForm | undefined {
  const target = `expect(${locatorName}(page))`;
  switch (expectation.kind) {
    case 'visible':
      return literalForm(`await ${target}.toBeVisible();`);
    case 'hidden':
      return literalForm(`await ${target}.toBeHidden();`);
    case 'text':
      return literalForm(`await ${target}.toContainText(${JSON.stringify(expectation.expected)});`);
    case 'value':
      return literalForm(`await ${target}.toHaveValue(${JSON.stringify(expectation.expected)});`);
    case 'count':
      return literalForm(`await ${target}.toHaveCount(${String(expectation.expected)});`);
    case 'checked':
      return literalForm(
        expectation.expected === false
          ? `await ${target}.not.toBeChecked();`
          : `await ${target}.toBeChecked();`,
      );
    default:
      return undefined;
  }
}

/** The assertion of a kind that names no element: the page's URL, a response, an accessibility scan. */
function renderPageForm(expectation: CaseExpectation): AssertionForm | undefined {
  switch (expectation.kind) {
    case 'url': {
      const source = JSON.stringify(escapeForRegExp(expectation.expected));
      return literalForm(`await expect(page).toHaveURL(new RegExp(${source}));`);
    }
    case 'http-status':
      return {
        code: `expect(response.status()).toBe(${String(expectation.expected)});`,
        pattern: new RegExp(
          `expect\\([A-Za-z_$][\\w$.]*\\.status\\(\\)\\)\\.toBe\\(${String(expectation.expected)}\\)`,
        ),
      };
    case 'http-body-contains': {
      const fragment = escapeForRegExp(stripWhitespace(JSON.stringify(expectation.expected)));
      return {
        code: `expect(await response.text()).toContain(${JSON.stringify(expectation.expected)});`,
        pattern: new RegExp(`expect\\(await[A-Za-z_$][\\w$.]*\\.text\\(\\)\\)\\.toContain\\(${fragment}\\)`),
      };
    }
    case 'a11y-clean':
      return { code: 'await scanAccessibility(page, testInfo);', pattern: /scanAccessibility\(/u };
    default:
      return undefined;
  }
}

function selectorOf(expectation: CaseExpectation): string | undefined {
  return 'selector' in expectation ? expectation.selector : undefined;
}

interface ResolvedExpectation extends DeclaredExpectation {
  readonly form: AssertionForm;
}

interface Resolution {
  readonly resolved: readonly ResolvedExpectation[];
  readonly unresolved: readonly UnresolvedExpectation[];
}

function resolveExpectations(
  testCase: Pick<TestCase, 'steps' | 'resultExpectations'>,
  registry: SelectorRegistry | undefined,
  moduleExports: readonly LocatorModuleExport[],
): Resolution {
  const resolved: ResolvedExpectation[] = [];
  const unresolved: UnresolvedExpectation[] = [];
  for (const declared of listDeclaredExpectations(testCase)) {
    const { where, expectation } = declared;
    const selector = selectorOf(expectation);
    if (selector === undefined) {
      const form = renderPageForm(expectation);
      if (form !== undefined) {
        resolved.push({ ...declared, form });
      }
      continue;
    }
    const element = registry === undefined ? undefined : findElementForSelector(registry, selector);
    const locatorName = moduleExports.find((entry) => entry.elementId === element?.elementId)?.name;
    const form = locatorName === undefined ? undefined : renderBrowserForm(expectation, locatorName);
    if (form !== undefined) {
      resolved.push({ ...declared, form });
    } else {
      unresolved.push({
        where,
        kind: expectation.kind,
        selector,
        reason: element === undefined ? 'selector-not-in-registry' : 'element-not-exported',
      });
    }
  }
  return { resolved, unresolved };
}

/**
 * Turns the expectations a case declares (ADR-0016) into the assertions its generated spec has to
 * make (P6-86). A selector reaches the spec only as a function of the generated locator module
 * (AGENTS.md 12.6), found through the registry; an expectation whose selector names no registry
 * element, or whose element has no function in the module, is reported as unresolved and never
 * inlined. `registry` is absent for an api case, which has no selector expectations.
 */
export function deriveExpectationAssertions(
  testCase: Pick<TestCase, 'steps' | 'resultExpectations'>,
  registry: SelectorRegistry | undefined,
  moduleExports: readonly LocatorModuleExport[],
): DerivedExpectationAssertions {
  const { resolved, unresolved } = resolveExpectations(testCase, registry, moduleExports);
  return {
    assertions: resolved.map(({ where, expectation, form }) => ({
      where,
      kind: expectation.kind,
      code: form.code,
    })),
    unresolved,
  };
}

// Removes `//` and `/* */` comments, leaving the inside of string and template literals alone, so a
// commented-out assertion does not count and a URL in a string is not cut at `//`. A regular
// expression literal holding a quote is not understood; generated specs use `new RegExp(...)`.
function stripComments(source: string): string {
  let output = '';
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    if (char === '"' || char === "'" || char === '`') {
      let end = index + 1;
      while (end < source.length && source.charAt(end) !== char) {
        end += source.charAt(end) === '\\' ? 2 : 1;
      }
      output += source.slice(index, end + 1);
      index = end + 1;
    } else if (char === '/' && next === '/') {
      const lineEnd = source.indexOf('\n', index);
      index = lineEnd === -1 ? source.length : lineEnd;
    } else if (char === '/' && next === '*') {
      const commentEnd = source.indexOf('*/', index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
    } else {
      output += char;
      index += 1;
    }
  }
  return output;
}

const STEP_TITLE_PATTERN = /\[(step-\d+|expected-result)\]/gu;

// The code of each `test.step('[step-N] ...')` block, taken as the text from its title to the next
// step title (or the end), keyed by step id. A generated spec lists its steps in order, so this is
// where the step's own assertions are.
function segmentByStep(code: string): ReadonlyMap<string, string> {
  const marks = [...code.matchAll(STEP_TITLE_PATTERN)].map((match) => ({
    stepId: match[1] ?? '',
    start: match.index,
  }));
  const segments = new Map<string, string>();
  marks.forEach((mark, position) => {
    const end = marks[position + 1]?.start ?? code.length;
    segments.set(mark.stepId, `${segments.get(mark.stepId) ?? ''}${code.slice(mark.start, end)}`);
  });
  return segments;
}

/**
 * Looks in a generated spec for each assertion `deriveExpectationAssertions` asked for and returns
 * one issue per assertion that is not there, in the shape the verification loop already reports.
 * A step's expectation has to sit in that step's `test.step`; a result expectation may sit in any.
 * Comments and whitespace are ignored. This checks the spec text; that the assertion runs and
 * passes is what the execution that follows shows.
 */
export function findMissingExpectationAssertions(
  testCase: Pick<TestCase, 'steps' | 'resultExpectations'>,
  registry: SelectorRegistry | undefined,
  moduleExports: readonly LocatorModuleExport[],
  specContent: string,
): readonly SpokeValidationIssue[] {
  const { resolved } = resolveExpectations(testCase, registry, moduleExports);
  const code = normalizeCode(stripComments(specContent));
  const segments = segmentByStep(stripComments(specContent));
  return resolved.flatMap(({ where, expectation, form }) => {
    const scope = where === RESULT_EXPECTATION_WHERE ? code : normalizeCode(segments.get(where) ?? '');
    return form.pattern.test(scope)
      ? []
      : [
          {
            path: [where],
            message: `The ${expectation.kind} expectation declared for ${where === RESULT_EXPECTATION_WHERE ? 'the result' : `"${where}"`} is not asserted. Add: ${form.code}`,
          },
        ];
  });
}
