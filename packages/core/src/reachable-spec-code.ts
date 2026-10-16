// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import ts from 'typescript';

export interface ReachableSpecCode {
  /** The statements that always run directly in each `test.step`, by step id, in source order. */
  readonly statementsByStep: ReadonlyMap<string, readonly string[]>;
  /** Every statement that always runs in a test, inside a step or beside one. */
  readonly statements: readonly string[];
  /** The whole spec as one string, comments removed, whether or not its code can run. */
  readonly text: string;
}

const STEP_TITLE_PATTERN = /\[(step-\d+|expected-result)\]/u;

// Comments are dropped and whitespace removed, so a formatter or a comment inside a statement
// cannot change what is compared.
const printer = ts.createPrinter({ removeComments: true });

function normalizeCode(text: string): string {
  return text.replace(/\s+/gu, '').replace(/,\)/gu, ')');
}

function isTestMember(call: ts.CallExpression, member: readonly string[]): boolean {
  const { expression } = call;
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'test' &&
    member.includes(expression.name.text)
  );
}

function isTestStepCall(call: ts.CallExpression): boolean {
  return isTestMember(call, ['step']);
}

function stepIdOf(call: ts.CallExpression): string | undefined {
  const title = call.arguments[0];
  if (title === undefined || !(ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
    return undefined;
  }
  return STEP_TITLE_PATTERN.exec(title.text)?.[1];
}

function callbackStatements(call: ts.CallExpression): readonly ts.Statement[] {
  const callback = call.arguments.at(-1);
  if (
    callback !== undefined &&
    (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
    ts.isBlock(callback.body)
  ) {
    return callback.body.statements;
  }
  return [];
}

// Walks only the statements that run every time their parent runs, in order, and stops at the first
// one after which the rest cannot run. An `if` counts only on a literal `true` or `false`; anything
// that depends on a value, and every loop, `try`, function declaration and skipped step, is left
// out because the walk cannot prove it runs.
class StatementCollector {
  readonly statementsByStep = new Map<string, string[]>();
  readonly statements: string[] = [];

  constructor(private readonly sourceFile: ts.SourceFile) {}

  collectTest(call: ts.CallExpression): void {
    this.collect(callbackStatements(call), undefined);
  }

  // Returns false once no later statement in the same block can run.
  private collect(statements: readonly ts.Statement[], stepId: string | undefined): boolean {
    for (const statement of statements) {
      if (!this.collectStatement(statement, stepId)) {
        return false;
      }
    }
    return true;
  }

  private collectStatement(statement: ts.Statement, stepId: string | undefined): boolean {
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
      return false;
    }
    if (ts.isBlock(statement)) {
      return this.collect(statement.statements, stepId);
    }
    if (ts.isIfStatement(statement)) {
      const branch =
        statement.expression.kind === ts.SyntaxKind.TrueKeyword
          ? statement.thenStatement
          : statement.expression.kind === ts.SyntaxKind.FalseKeyword
            ? statement.elseStatement
            : undefined;
      return branch === undefined ? true : this.collectStatement(branch, stepId);
    }
    if (!ts.isExpressionStatement(statement)) {
      return true;
    }
    return this.collectExpression(statement, stepId);
  }

  private collectExpression(statement: ts.ExpressionStatement, stepId: string | undefined): boolean {
    const awaited = ts.isAwaitExpression(statement.expression);
    const expression = ts.isAwaitExpression(statement.expression)
      ? statement.expression.expression
      : statement.expression;
    if (ts.isCallExpression(expression)) {
      if (isTestMember(expression, ['skip', 'fixme'])) {
        return false;
      }
      // A step that is not awaited runs on its own, so a failure in it does not stop the test.
      if (isTestStepCall(expression) && awaited) {
        this.collect(callbackStatements(expression), stepIdOf(expression) ?? stepId);
        return true;
      }
    }
    this.record(statement, stepId);
    return true;
  }

  private record(statement: ts.Statement, stepId: string | undefined): void {
    const code = normalizeCode(printer.printNode(ts.EmitHint.Unspecified, statement, this.sourceFile));
    this.statements.push(code);
    if (stepId !== undefined) {
      this.statementsByStep.set(stepId, [...(this.statementsByStep.get(stepId) ?? []), code]);
    }
  }
}

/**
 * Reads a generated spec and returns the code that is certain to run, so an assertion that sits in
 * a branch that is never taken, after a `return`, or in a skipped step is not mistaken for one that
 * runs (AGENTS.md 12.1). Only the callback of a top-level `test(...)` is read.
 */
export function readReachableSpecCode(specContent: string): ReachableSpecCode {
  const sourceFile = ts.createSourceFile('spec.ts', specContent, ts.ScriptTarget.Latest, true);
  const collector = new StatementCollector(sourceFile);
  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) &&
      statement.expression.expression.text === 'test'
    ) {
      collector.collectTest(statement.expression);
    }
  }
  return {
    statementsByStep: collector.statementsByStep,
    statements: collector.statements,
    text: normalizeCode(printer.printFile(sourceFile)),
  };
}
