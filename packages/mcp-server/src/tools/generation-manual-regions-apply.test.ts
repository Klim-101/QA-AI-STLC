// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { generationManualRegionsApplyTool } from './generation-manual-regions-apply.js';

describe('generationManualRegionsApplyTool', () => {
  it('splices a preserved region into a freshly generated template', async () => {
    const templateSource = [
      'export const GENERATOR_VERSION = "1.0.1";',
      '// qa:manual:start helper',
      '// qa:manual:end helper',
    ].join('\n');

    const result = await generationManualRegionsApplyTool.handler({
      templateSource,
      existingRegions: [{ id: 'helper', content: 'function helper() { return 1; }' }],
    });

    expect(result.content).toBe(
      [
        'export const GENERATOR_VERSION = "1.0.1";',
        '// qa:manual:start helper',
        'function helper() { return 1; }',
        '// qa:manual:end helper',
      ].join('\n'),
    );
  });

  it('throws when the fresh template dropped a marker a preserved region still needs', async () => {
    await expect(
      generationManualRegionsApplyTool.handler({
        templateSource: 'export const GENERATOR_VERSION = "1.0.1";',
        existingRegions: [{ id: 'helper', content: 'function helper() { return 1; }' }],
      }),
    ).rejects.toMatchObject({ code: 'core.manual_regions.dropped' });
  });
});
