// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Runs inside the page under test, where nothing from the surrounding module exists, and this
// package compiles without DOM types. The browser's own V8 instance is invisible to Node coverage,
// so the real-browser test (`test/browser-upload-demo-app.test.ts`) is what exercises it.
/* v8 ignore start */

interface UploadInput {
  readonly files?: ArrayLike<{ readonly name: string }> | null;
}

/** The names of the files a file input now holds; null when the element is not a file input. */
export function readSelectedFileNames(element: UploadInput): unknown {
  return element.files === undefined || element.files === null
    ? null
    : Array.from(element.files, (file) => file.name);
}
