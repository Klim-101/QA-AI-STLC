// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Test code and sample data are not what reaches production, and the secrets and settings in them
// are placeholders far more often than not, so findings there are weaker or left out.
const TEST_PATH_PATTERN =
  /(?:^|\/)(?:tests?|__tests__|__mocks__|fixtures?|mocks?|examples?|e2e|spec)\/|\.(?:test|spec)\.[a-z]+$/iu;

export function isTestOrFixturePath(path: string): boolean {
  return TEST_PATH_PATTERN.test(path);
}

// Longer lines are minified or generated output, where a line number would point nowhere.
const MAX_SCANNED_LINE_LENGTH = 1000;

export interface SourceLine {
  readonly number: number;
  readonly text: string;
}

export function scannableLines(text: string): readonly SourceLine[] {
  return text
    .split(/\r?\n/u)
    .map((lineText, index) => ({ number: index + 1, text: lineText }))
    .filter(({ text: lineText }) => lineText.length > 0 && lineText.length <= MAX_SCANNED_LINE_LENGTH);
}

/** A finding cites at most this many lines of one file: the file is the subject, not every match. */
export const MAX_CITED_LINES_PER_FILE = 5;
