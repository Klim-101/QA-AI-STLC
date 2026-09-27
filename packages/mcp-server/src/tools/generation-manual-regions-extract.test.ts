// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { generationManualRegionsExtractTool } from './generation-manual-regions-extract.js';

describe('generationManualRegionsExtractTool', () => {
  it('reads every qa:manual region out of a generated spec\'s source, in file order', async () => {
    const source = [
      'export const GENERATOR_VERSION = "1.0.0";',
      '// qa:manual:start helper',
      'function helper() { return 1; }',
      '// qa:manual:end helper',
    ].join('\n');

    const result = await generationManualRegionsExtractTool.handler({ source });

    expect(result.regions).toEqual([{ id: 'helper', content: 'function helper() { return 1; }' }]);
  });

  it('returns no regions for a source with no qa:manual markers', async () => {
    const result = await generationManualRegionsExtractTool.handler({ source: 'export const x = 1;' });

    expect(result.regions).toEqual([]);
  });

  it('rejects malformed markers as a coded error, not a synchronous throw', async () => {
    await expect(
      generationManualRegionsExtractTool.handler({ source: '// qa:manual:end helper' }),
    ).rejects.toMatchObject({ code: 'core.manual_regions.unmatched_end' });
  });
});
