// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { hashText, systemClock, type Clock } from '@qa-ai-stlc/core';
import type { InteractiveElementKind, LocatorCandidate, SelectorElement } from '@qa-ai-stlc/schemas';
import { createElementNamer } from './naming.js';

export interface StaticSourceFile {
  /** Project-relative, forward-slash path (`RelativePathSchema`), recorded on every finding. */
  readonly filePath: string;
  readonly content: string;
}

export interface AnalyzeStaticSourceOptions {
  readonly files: readonly StaticSourceFile[];
  readonly clock?: Clock;
}

export interface AnalyzeStaticSourceResult {
  readonly elements: readonly SelectorElement[];
}

const TAG_KIND: Readonly<Record<string, InteractiveElementKind>> = {
  button: 'button',
  a: 'link',
  input: 'input',
  select: 'select',
  textarea: 'textarea',
};

// A role value that unambiguously identifies its own element kind, for a custom component
// (`<div role="button">`, common in React/Vue/Angular design systems) that no tag-name mapping
// above can classify. Other roles (`textbox`, `combobox`, ...) are still captured as a locator
// candidate below; they just cannot alone decide the schema's fixed `kind` enum.
const KIND_BY_ROLE: Readonly<Record<string, InteractiveElementKind>> = {
  button: 'button',
  link: 'link',
};

// A literal attribute value only: `(?<=\s)` requires the attribute name be preceded by whitespace
// (never `:`, `.` or `[`), which is how every plain HTML/JSX attribute is written and how Vue's
// `:name=`/`v-bind:name=` and Angular's `[attr.name]=`/`[name]=` bindings never are — so a bound,
// non-literal value (a JS expression, not stable text) is never captured as one. The attrs chunk
// is padded with a leading space so an attribute at the very start of it still matches.
// Exported for analyze-static-routes.ts (P1-19), which reads the same literal-attribute shape
// out of a `<Route path="...">` tag.
export function literalAttribute(attrs: string, name: string): string | undefined {
  const pattern = new RegExp(`(?<=\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'u');
  const match = pattern.exec(` ${attrs}`);
  return match?.[1] ?? match?.[2];
}

/** Exported for analyze-static-routes.ts (P1-19): both scan the same raw source text for findings. */
export function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

interface StaticFinding {
  readonly kind: InteractiveElementKind;
  readonly tagName: string;
  readonly testId: string | undefined;
  readonly ariaLabel: string | undefined;
  readonly role: string | undefined;
  readonly filePath: string;
  readonly line: number;
}

// Splits `<button data-testid="x">`'s inner text ("button data-testid=\"x\"") into its tag name
// and the rest, on plain string search/slice rather than a second regex capture group: unlike a
// capture group, `.search()`/`.slice()` are never `string | undefined` under
// `noUncheckedIndexedAccess`, and every opening tag genuinely has a name, so there is no real
// "missing" case here to guard against.
function splitTag(tagText: string): { tagName: string; attrs: string } {
  const boundary = tagText.search(/[\s/]/u);
  const nameEnd = boundary === -1 ? tagText.length : boundary;
  return { tagName: tagText.slice(0, nameEnd).toLowerCase(), attrs: tagText.slice(nameEnd) };
}

// A lexical scan of the raw text for `<tag ...>`, JSX/Vue/Angular alike (React's JSX, Vue's SFC
// template block and Angular's component template all put literal HTML-shaped attributes on an
// opening tag the same way), not a per-framework parser. It stops at the first `>` even inside a
// quoted attribute value, and can match a `<` that starts a string or comment rather than a real
// tag — an accepted, documented false-positive risk in exchange for needing no `@babel/parser`,
// `vue/compiler-sfc` or `@angular/compiler` dependency.
function findStaticElements(file: StaticSourceFile): StaticFinding[] {
  const findings: StaticFinding[] = [];
  let cursor = 0;
  for (;;) {
    const tagStart = file.content.indexOf('<', cursor);
    if (tagStart === -1) {
      break;
    }
    const tagEnd = file.content.indexOf('>', tagStart);
    if (tagEnd === -1) {
      break;
    }
    cursor = tagEnd + 1;

    const tagText = file.content.slice(tagStart + 1, tagEnd);
    if (!/^[A-Za-z]/u.test(tagText)) {
      continue; // a closing tag, comment, doctype or fragment, never an opening tag with attributes
    }

    const { tagName, attrs } = splitTag(tagText);
    const role = literalAttribute(attrs, 'role');
    const kind = TAG_KIND[tagName] ?? (role === undefined ? undefined : KIND_BY_ROLE[role]);
    if (kind === undefined) {
      continue;
    }
    findings.push({
      kind,
      tagName,
      testId: literalAttribute(attrs, 'data-testid'),
      ariaLabel: literalAttribute(attrs, 'aria-label'),
      role,
      filePath: file.filePath,
      line: lineNumberAt(file.content, tagStart),
    });
  }
  return findings;
}

function findingNameSource(finding: StaticFinding): string {
  return finding.testId ?? finding.ariaLabel ?? finding.role ?? `${finding.tagName}:${String(finding.line)}`;
}

function candidatesFor(finding: StaticFinding): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];
  if (finding.role !== undefined && finding.ariaLabel !== undefined) {
    candidates.push({
      strategy: 'role',
      value: JSON.stringify({ role: finding.role, name: finding.ariaLabel }),
      fragile: false,
    });
  }
  if (finding.testId !== undefined) {
    candidates.push({ strategy: 'testId', value: finding.testId, fragile: false });
  }
  return candidates;
}

/**
 * Extracts `data-testid`, `aria-label` and `role` from literal (never dynamically bound) HTML-shaped
 * attributes across React, Angular and Vue sources (development plan 6.1.2), and turns each finding
 * into a `SelectorElement` with `source: 'static'` and a `sourceLocation` the "missing test ID"
 * report (P1-13) can point a developer at. Never touches routes (P1-19) or a live page: `kind` comes
 * only from the tag name or, for a custom component, a `role` of `'button'`/`'link'`; every other
 * element the source contains and does not name through one of those signals is not observed at all.
 */
export function analyzeStaticSource(options: AnalyzeStaticSourceOptions): AnalyzeStaticSourceResult {
  const clock = options.clock ?? systemClock;
  const lastVerifiedAt = clock.now().toISOString();
  const nameFor = createElementNamer();

  const elements = options.files.flatMap((file) =>
    findStaticElements(file).map((finding) => ({
      elementId: hashText(
        `${finding.filePath} ${String(finding.line)} ${finding.kind} ${findingNameSource(finding)}`,
      ),
      name: nameFor(findingNameSource(finding), finding.kind),
      kind: finding.kind,
      locatorCandidates: candidatesFor(finding),
      stabilityScore: 0,
      lastVerifiedAt,
      pii: false,
      dynamicText: false,
      source: 'static' as const,
      sourceLocation: { filePath: finding.filePath, line: finding.line },
    })),
  );

  return { elements };
}
