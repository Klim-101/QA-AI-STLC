// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ComponentLibraryProfile } from '../component-library-profile.js';

/** A made-up library, so tests exercise the mechanism without any real library's markup. */
export const SYNTHETIC_PROFILE: ComponentLibraryProfile = {
  id: 'synthetic-ui',
  widgets: [
    {
      widgetKind: 'dropdown',
      wrapperSelector: '.syn-dropdown',
      role: 'combobox',
      nativeControlSelector: 'select, input[type="hidden"]',
    },
    { widgetKind: 'datepicker', wrapperSelector: '.syn-datepicker', role: 'textbox' },
  ],
  generatedIdPatterns: ['^syn-\\d+$'],
  busySelectors: ['.syn-loading'],
};
