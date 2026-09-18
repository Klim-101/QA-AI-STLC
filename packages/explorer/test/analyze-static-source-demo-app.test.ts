// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeStaticSource } from '../src/analyze-static-source.js';

// Exercises static analysis against real project source rather than a hand-written fixture
// (AGENTS.md section 13, and the exit criterion for issue #27: "Findings merged into the registry
// with source: static on the demo app"). The demo app is server-rendered EJS, not React/Vue/
// Angular, but EJS's markup is plain HTML — the same literal-attribute shape analyzeStaticSource
// looks for in any of the three frameworks' templates — so it is still a real, unmodified source
// file, not a synthetic one. Its login form deliberately has no `data-testid`/`aria-label` on any
// field (development plan's BUG-006 catalogue), which is exactly the "missing test ID" signal
// P1-13 will report on: every finding here has an empty `locatorCandidates`.
describe('analyzeStaticSource (demo app)', () => {
  it("finds the login form's button and inputs, none with a locator candidate", async () => {
    const filePath = 'examples/demo-app/src/views/login.ejs';
    const absolutePath = fileURLToPath(
      new URL('../../../examples/demo-app/src/views/login.ejs', import.meta.url),
    );
    const content = await readFile(absolutePath, 'utf8');

    const { elements } = analyzeStaticSource({ files: [{ filePath, content }] });

    // Exactly the button and the two inputs: the `<p role="alert">` error message, the `<label>`s,
    // the `<link>`/`<meta>` head tags and every other tag in the file are neither a mapped tag name
    // nor a button/link role, so they are correctly not observed at all.
    expect(elements).toHaveLength(3);
    const byKind = (kind: string) => elements.filter((element) => element.kind === kind);
    expect(byKind('button')).toHaveLength(1);
    expect(byKind('input')).toHaveLength(2);
    expect(elements.every((element) => element.locatorCandidates.length === 0)).toBe(true);
    expect(elements.every((element) => element.sourceLocation?.filePath === filePath)).toBe(true);
  });
});
