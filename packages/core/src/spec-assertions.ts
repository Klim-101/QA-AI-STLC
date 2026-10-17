// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ReviewAssertion, ReviewAssertionSubject, ReviewFinding } from '@qa-ai-stlc/schemas';
import ts from 'typescript';

const STEP_TITLE_PATTERN = /\[(step-\d+|expected-result)\]/u;
const MIN_GROUNDED_VALUE_LENGTH = 3;

export interface AnalyzeSpecAssertionsOptions {
  /** The locator functions the locator module exports; absent when there is no module to compare with. */
  readonly locatorNames?: ReadonlySet<string>;
  /** Every string the case and its proven session contain, normalized: what an expected value may rest on. */
  readonly groundingCorpus: string;
}

/** Lowercases and collapses whitespace, so a formatter or a case change cannot hide a match. */
export function normalizeForGrounding(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Every string leaf of a JSON value, joined into one normalized corpus. */
export function collectGroundingStrings(...values: readonly unknown[]): string {
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      strings.push(normalizeForGrounding(value));
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(visit);
    }
  };
  values.forEach(visit);
  return strings.join('\n');
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isExpectCallee(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) {
    return callee.text === 'expect';
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'expect'
  );
}

// The `expect(...)` call a matcher call such as `expect(x).not.toBe(y)` hangs from, if it does.
function findExpectCall(callee: ts.Expression): ts.CallExpression | undefined {
  let node: ts.Expression = callee;
  for (;;) {
    if (ts.isPropertyAccessExpression(node)) {
      node = node.expression;
    } else if (ts.isCallExpression(node)) {
      if (isExpectCallee(node.expression)) {
        return node;
      }
      node = node.expression;
    } else {
      return undefined;
    }
  }
}

function isLiteral(expression: ts.Expression): boolean {
  return (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression) ||
    ts.isArrayLiteralExpression(expression) ||
    ts.isObjectLiteralExpression(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand))
  );
}

// The identifier a chain of property accesses and calls starts from, and the first member taken
// from it: `page.getByRole(...).first()` is `page` and `getByRole`.
function chainRoot(
  expression: ts.Expression,
): { readonly root: string; readonly member?: string } | undefined {
  let node: ts.Expression = expression;
  let member: string | undefined;
  for (;;) {
    if (ts.isCallExpression(node)) {
      node = node.expression;
    } else if (ts.isPropertyAccessExpression(node)) {
      member = node.name.text;
      node = node.expression;
    } else if (ts.isIdentifier(node)) {
      return member === undefined ? { root: node.text } : { root: node.text, member };
    } else {
      return undefined;
    }
  }
}

const INLINE_LOCATOR_MEMBERS: ReadonlySet<string> = new Set(['locator', 'frameLocator', '$', '$$']);

function classifySubject(argument: ts.Expression | undefined): ReviewAssertionSubject {
  if (argument === undefined) {
    return { kind: 'other' };
  }
  const subject = unwrap(argument);
  if (isLiteral(subject)) {
    return { kind: 'literal' };
  }
  if (ts.isIdentifier(subject) && subject.text === 'page') {
    return { kind: 'page' };
  }
  if (
    ts.isCallExpression(subject) &&
    ts.isIdentifier(subject.expression) &&
    subject.arguments.length === 1 &&
    subject.arguments[0] !== undefined &&
    ts.isIdentifier(subject.arguments[0]) &&
    subject.arguments[0].text === 'page'
  ) {
    return { kind: 'locator', name: subject.expression.text };
  }
  const root = chainRoot(subject);
  if (
    root?.root === 'page' &&
    root.member !== undefined &&
    (root.member.startsWith('getBy') || INLINE_LOCATOR_MEMBERS.has(root.member))
  ) {
    return { kind: 'inline-locator' };
  }
  return { kind: 'other' };
}

function unescapeRegexSource(source: string): string {
  return source.replace(/\\(.)/gu, '$1');
}

function expectedValuesOf(call: ts.CallExpression): string[] {
  const values: string[] = [];
  for (const argument of call.arguments) {
    if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
      values.push(argument.text);
    } else if (ts.isRegularExpressionLiteral(argument)) {
      values.push(unescapeRegexSource(argument.text.slice(1, argument.text.lastIndexOf('/'))));
    } else if (
      ts.isNewExpression(argument) &&
      ts.isIdentifier(argument.expression) &&
      argument.expression.text === 'RegExp'
    ) {
      const source = argument.arguments?.[0];
      if (
        source !== undefined &&
        (ts.isStringLiteral(source) || ts.isNoSubstitutionTemplateLiteral(source))
      ) {
        values.push(unescapeRegexSource(source.text));
      }
    }
  }
  return values;
}

function stepIdOf(node: ts.Node): string | undefined {
  for (let current: ts.Node = node.parent; !ts.isSourceFile(current); current = current.parent) {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === 'test' &&
      current.expression.name.text === 'step'
    ) {
      const title = current.arguments[0];
      if (title !== undefined && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
        const found = STEP_TITLE_PATTERN.exec(title.text)?.[1];
        if (found !== undefined) {
          return found;
        }
      }
    }
  }
  return undefined;
}

function findingsOf(
  subject: ReviewAssertionSubject,
  expectedValues: readonly string[],
  options: AnalyzeSpecAssertionsOptions,
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  if (subject.kind === 'literal') {
    findings.push({
      code: 'tautology',
      severity: 'error',
      message:
        'The assertion is about a literal, not about the application, so it holds whatever the application does.',
    });
  }
  if (subject.kind === 'inline-locator') {
    findings.push({
      code: 'inline-locator',
      severity: 'error',
      message:
        'The assertion finds its element with a selector written into the spec instead of a locator-module function.',
    });
  }
  if (
    subject.kind === 'locator' &&
    subject.name !== undefined &&
    options.locatorNames !== undefined &&
    !options.locatorNames.has(subject.name)
  ) {
    findings.push({
      code: 'unknown-locator',
      severity: 'error',
      message: `"${subject.name}" is not a function the locator module exports, so no registered element backs it.`,
    });
  }
  const ungrounded = expectedValues.filter((value) => {
    // Punctuation round the edges is how a path or a pattern is written (`/dashboard`), not part of
    // the word a case would use for it.
    const normalized = normalizeForGrounding(value).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return normalized.length >= MIN_GROUNDED_VALUE_LENGTH && !options.groundingCorpus.includes(normalized);
  });
  if (ungrounded.length > 0) {
    findings.push({
      code: 'ungrounded-value',
      severity: 'warning',
      message: `Expected ${ungrounded.map((value) => `"${value}"`).join(', ')} appears in neither the case nor its proven session.`,
    });
  }
  return findings;
}

/**
 * Reads the `expect(...)` calls of a generated spec, in source order, and says what the engine can
 * tell about each: whether it is about the application at all, whether its element is a registered
 * one, and whether the values it expects rest on the case or on what a real session observed. A
 * finding is evidence for the reviewer, not a verdict; an `error` is one no approval can stand on.
 */
export function analyzeSpecAssertions(
  specContent: string,
  options: AnalyzeSpecAssertionsOptions,
): readonly ReviewAssertion[] {
  const sourceFile = ts.createSourceFile('spec.ts', specContent, ts.ScriptTarget.Latest, true);
  const found: {
    readonly call: ts.CallExpression;
    readonly expectCall: ts.CallExpression;
    readonly matcher: string;
  }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      /^to[A-Z]/u.test(node.expression.name.text)
    ) {
      const expectCall = findExpectCall(node.expression.expression);
      if (expectCall !== undefined) {
        found.push({ call: node, expectCall, matcher: node.expression.name.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return found
    .toSorted((a, b) => a.call.getStart() - b.call.getStart())
    .map(({ call, expectCall, matcher }, index) => {
      const subject = classifySubject(expectCall.arguments[0]);
      const expectedValues = expectedValuesOf(call);
      const stepId = stepIdOf(call);
      return {
        id: `a${String(index + 1)}`,
        line: sourceFile.getLineAndCharacterOfPosition(call.getStart()).line + 1,
        ...(stepId === undefined ? {} : { stepId }),
        subject:
          subject.name === undefined ? { kind: subject.kind } : { kind: subject.kind, name: subject.name },
        matcher,
        expectedValues,
        findings: findingsOf(subject, expectedValues, options),
      };
    });
}
