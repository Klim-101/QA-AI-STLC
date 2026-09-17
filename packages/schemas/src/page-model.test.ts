// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { PageModelSetSchema } from './page-model.js';

describe('PageModelSetSchema', () => {
  it('accepts a page model with a nested accessibility tree, forms, tables and dialogs', () => {
    const result = PageModelSetSchema.safeParse({
      generatedAt: '2026-09-17T00:00:00Z',
      pages: [
        {
          url: 'https://staging.example.com/tasks',
          accessibilityTree: {
            role: 'document',
            name: 'Tasks',
            children: [{ role: 'button', name: 'New task', pressed: false }],
          },
          interactiveElements: [
            {
              kind: 'button',
              accessibleName: 'New task',
              testId: 'new-task',
              tagName: 'button',
              nthOfType: 1,
            },
          ],
          forms: [
            { action: '/tasks', method: 'post', fields: [{ name: 'title', type: 'text', required: true }] },
          ],
          tables: [{ columnHeaders: ['Title', 'Status'], rowCount: 3 }],
          dialogs: [{ accessibleName: 'Edit task', open: false }],
          truncated: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an interactive element carrying the locator-synthesis attributes', () => {
    const result = PageModelSetSchema.safeParse({
      generatedAt: '2026-09-17T00:00:00Z',
      pages: [
        {
          url: 'https://staging.example.com/login',
          accessibilityTree: { role: 'document' },
          interactiveElements: [
            {
              kind: 'input',
              role: 'textbox',
              label: 'Email',
              placeholder: 'you@example.com',
              htmlId: 'email',
              tagName: 'input',
              nthOfType: 1,
            },
          ],
          forms: [],
          tables: [],
          dialogs: [],
          truncated: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an interactive element kind outside the known set', () => {
    const result = PageModelSetSchema.safeParse({
      generatedAt: '2026-09-17T00:00:00Z',
      pages: [
        {
          url: 'https://staging.example.com/tasks',
          accessibilityTree: { role: 'document' },
          interactiveElements: [{ kind: 'video', tagName: 'video', nthOfType: 1 }],
          forms: [],
          tables: [],
          dialogs: [],
          truncated: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
