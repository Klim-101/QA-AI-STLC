// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RequirementSource } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { extractRequirements } from './requirement-extraction.js';

const SOURCE: RequirementSource = { kind: 'file', path: 'docs/requirements.md' };

describe('extractRequirements', () => {
  it('extracts one requirement per level-2 heading, with the heading as its title', () => {
    const requirements = extractRequirements('## Login with email\n\nA user can log in.\n', SOURCE);

    expect(requirements).toEqual([
      {
        id: 'login-with-email',
        title: 'Login with email',
        description: 'A user can log in.',
        source: SOURCE,
        inScope: true,
      },
    ]);
  });

  it('extracts every heading in document order', () => {
    const requirements = extractRequirements('## First\nbody one\n## Second\nbody two\n', SOURCE);

    expect(requirements.map((requirement) => requirement.title)).toEqual(['First', 'Second']);
  });

  it('returns an empty array for a document with no level-2 heading', () => {
    expect(extractRequirements('# Requirements\n\nJust a title, no items yet.\n', SOURCE)).toEqual([]);
  });

  it('drops content before the first level-2 heading as preamble', () => {
    const requirements = extractRequirements(
      '# Requirements\n\nSome preamble text.\n\n## Real item\nbody\n',
      SOURCE,
    );

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.title).toBe('Real item');
  });

  it('omits description when a heading has no body', () => {
    const requirements = extractRequirements('## No body here\n## Next\n', SOURCE);

    expect(requirements[0]).not.toHaveProperty('description');
  });

  it('deduplicates a repeated heading with a numeric suffix, in document order', () => {
    const requirements = extractRequirements('## Login\nfirst\n## Login\nsecond\n## Login\nthird\n', SOURCE);

    expect(requirements.map((requirement) => requirement.id)).toEqual(['login', 'login-2', 'login-3']);
  });

  it('falls back to a generic id when the title has no alphanumeric characters to slugify', () => {
    const requirements = extractRequirements('## !!!\nbody\n', SOURCE);

    expect(requirements[0]?.id).toBe('requirement');
  });

  it('slugifies non-alphanumeric characters in the title', () => {
    const requirements = extractRequirements('## Login & Sign-up (v2)!\nbody\n', SOURCE);

    expect(requirements[0]?.id).toBe('login-sign-up-v2');
  });

  it('marks every extracted requirement in scope and attributes it to the given source', () => {
    const textSource: RequirementSource = { kind: 'text', label: 'operator input' };

    const requirements = extractRequirements('## Item\nbody\n', textSource);

    expect(requirements[0]?.inScope).toBe(true);
    expect(requirements[0]?.source).toEqual(textSource);
  });
});
