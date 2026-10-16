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
import { readReachableSpecCode } from './reachable-spec-code.js';
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

type SelectorExpectation = Extract<CaseExpectation, { selector: string }>;
type PageExpectation = Exclude<CaseExpectation, SelectorExpectation>;

function renderSelectorForm(expectation: SelectorExpectation, locatorName: string): AssertionForm {
  const target = `expect(${locatorName}(page))`;
  switch (expectation.kind) {
    case 'visible':
      return literalForm(`await ${target}.toBeVisible();`);
    case 'hidden':
      return literalForm(`await ${target}.toBeHidden();`);
    case 'text':
      // `toContainText("")` passes on any element, so an empty expectation must compare in full.
      return literalForm(
        expectation.expected === ''
          ? `await ${target}.toHaveText("");`
          : `await ${target}.toContainText(${JSON.stringify(expectation.expected)});`,
      );
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
  }
}

/** The assertion of a kind that names no element: the page's URL, a response, an accessibility scan. */
function renderPageForm(expectation: PageExpectation): AssertionForm {
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
      return {
        code: 'await scanAccessibility(page, testInfo);',
        pattern: /awaitscanAccessibility\(page,testInfo\)/u,
      };
  }
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
    if (!('selector' in expectation)) {
      resolved.push({ ...declared, form: renderPageForm(expectation) });
      continue;
    }
    const { selector } = expectation;
    const element = registry === undefined ? undefined : findElementForSelector(registry, selector);
    const locatorName = moduleExports.find((entry) => entry.elementId === element?.elementId)?.name;
    const form = locatorName === undefined ? undefined : renderSelectorForm(expectation, locatorName);
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

/**
 * Looks in a generated spec for each assertion `deriveExpectationAssertions` asked for and returns
 * one issue per assertion that is not there, in the shape the verification loop already reports.
 * A step's expectation has to sit in that step's `test.step`; a result expectation may sit in any.
 * The assertion has to be a statement that always runs (see `readReachableSpecCode`), and the
 * statement has to be the assertion and nothing more, so a trailing `.catch(...)` does not count.
 * Comments and whitespace are ignored. That the assertion passes is what the execution shows.
 */
export function findMissingExpectationAssertions(
  testCase: Pick<TestCase, 'steps' | 'resultExpectations'>,
  registry: SelectorRegistry | undefined,
  moduleExports: readonly LocatorModuleExport[],
  specContent: string,
): readonly SpokeValidationIssue[] {
  const { resolved } = resolveExpectations(testCase, registry, moduleExports);
  const reachable = readReachableSpecCode(specContent);
  return resolved.flatMap(({ where, expectation, form }) => {
    const isResult = where === RESULT_EXPECTATION_WHERE;
    const exact = new RegExp(`^(?:${form.pattern.source});?$`, form.pattern.flags);
    const scope = isResult ? reachable.statements : (reachable.statementsByStep.get(where) ?? []);
    if (scope.some((statement) => exact.test(statement))) {
      return [];
    }
    const target = isResult ? 'the result' : `"${where}"`;
    const isWritten = form.pattern.test(reachable.text);
    return [
      {
        path: [where],
        message: isWritten
          ? `The ${expectation.kind} expectation declared for ${target} is written but may never run. Put this line at the top level of ${isResult ? 'a test.step' : 'its test.step'}, not inside a condition, loop, try, function, skipped step or after a return or throw, and do not chain anything onto it: ${form.code}`
          : `The ${expectation.kind} expectation declared for ${target} is not asserted. Add: ${form.code}`,
      },
    ];
  });
}
