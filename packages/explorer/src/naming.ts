// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Splits on anything that is not a letter or digit, dropping empty segments, so accented and
// non-Latin text collapses to nothing rather than surviving as invalid identifier characters.
function wordsOf(text: string): string[] {
  return text.split(/[^A-Za-z0-9]+/u).filter((word) => word.length > 0);
}

// An accessible name equal to a reserved word ("Export", "Delete") would otherwise produce a
// locator module export that fails to compile.
const RESERVED_WORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

// `.charAt(0)` (unlike `word[0]`) always returns a plain `string` even under
// `noUncheckedIndexedAccess`, so this never needs an `undefined` fallback for an empty `word`.
function upperFirst(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * Turns human-meaningful, untrusted text (an accessible name, an ARIA label) into a valid camelCase
 * identifier, falling back to `fallback` (a domain word guaranteed non-empty, like an element
 * `kind`) when `text` has no letters or digits at all (e.g. an icon-only "→" accessible name).
 * Never returns a reserved word or an identifier starting with a digit.
 */
export function toCamelCaseIdentifier(text: string, fallback: string): string {
  const words = wordsOf(text);
  const source = words.length > 0 ? words : wordsOf(fallback);
  const identifier = source
    .map((word, index) => (index === 0 ? word.toLowerCase() : upperFirst(word.toLowerCase())))
    .join('');
  if (/^[0-9]/u.test(identifier)) {
    return `element${upperFirst(identifier)}`;
  }
  return RESERVED_WORDS.has(identifier) ? `${identifier}Element` : identifier;
}

/**
 * Produces the camelCase export name a registry element's locator module entry will use
 * (ADR-006). Each call to the returned function assigns one element's name; two elements
 * resolving to the same base name (e.g. two buttons both named "Submit") get a numeric suffix,
 * tracked across every call against the same namer, so no two elements it names ever collide.
 */
export function createElementNamer(): (text: string, fallback: string) => string {
  const seenNameCounts = new Map<string, number>();
  return (text, fallback) => {
    const base = toCamelCaseIdentifier(text, fallback);
    const seen = seenNameCounts.get(base) ?? 0;
    seenNameCounts.set(base, seen + 1);
    return seen === 0 ? base : `${base}${String(seen + 1)}`;
  };
}
