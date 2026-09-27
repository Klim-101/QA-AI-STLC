// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { injectPickModeOverlay, waitForPickModeCompletion } from '../src/pick-mode.js';

// A minimal, self-contained reproduction of a pattern real component libraries use (e.g. Kendo UI
// for Angular's floating-label inputs): a decorative label drawn as a SIBLING absolutely
// positioned over the real control, not an ancestor/descendant of it. `Element.closest()` only
// walks ancestors, so a click landing on the label resolves to nothing under the old
// implementation and the capture is silently dropped (issue #421, reported against a live Kendo
// login form: pick mode ended a session with zero captures). The demo app has no such overlapping
// markup, so this is a synthetic page rather than an examples/demo-app fixture.
const OVERLAY_HTML = `
<!doctype html>
<html>
  <body style="margin:0">
    <div style="position:relative;width:200px;height:40px">
      <input id="username" type="text" style="position:absolute;inset:0;width:100%;height:100%" />
      <span id="floating-label" style="position:absolute;inset:0;width:100%;height:100%">Username</span>
    </div>
  </body>
</html>
`;

describe('pick mode click capture (overlay demo app)', () => {
  it('resolves a click on a decorative sibling overlay to the real control underneath (#421)', async () => {
    const browser = await playwrightBrowserLauncher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`data:text/html,${encodeURIComponent(OVERLAY_HTML)}`);

    await injectPickModeOverlay(page, 'data-testid');
    // The label fully covers the input, so a click here lands on #floating-label, not #username.
    await page.click('#floating-label');
    await page.click('#qa-pick-mode-finish');

    const captures = await waitForPickModeCompletion(page, { wait: () => Promise.resolve() });

    expect(captures).toEqual([
      expect.objectContaining({ kind: 'input', tagName: 'input', htmlId: 'username' }),
    ]);

    await context.close();
    await browser.close();
  }, 30_000);
});
