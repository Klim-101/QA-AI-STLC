// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ComponentLibraryProfile } from '../component-library-profile.js';

// Kendo UI for Angular renders each widget inside a `kendo-*` host element. The host is what a
// user sees and the only element worth a locator; the inputs and buttons it renders inside only
// back the widget.
const INNER_CONTROLS = 'input, select, button';
const POPUP_BUTTON = '.k-input-button';

export const KENDO_ANGULAR_PROFILE: ComponentLibraryProfile = {
  id: 'kendo-angular',
  widgets: [
    {
      widgetKind: 'dropdownlist',
      wrapperSelector: 'kendo-dropdownlist',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['select-option', 'popup'],
    },
    {
      widgetKind: 'combobox',
      wrapperSelector: 'kendo-combobox',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['select-option', 'popup'],
      popupToggleSelector: POPUP_BUTTON,
    },
    {
      widgetKind: 'multiselect',
      wrapperSelector: 'kendo-multiselect',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['select-option', 'popup'],
    },
    {
      widgetKind: 'datepicker',
      wrapperSelector: 'kendo-datepicker',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['set-date', 'popup'],
      popupToggleSelector: POPUP_BUTTON,
    },
    {
      widgetKind: 'numerictextbox',
      wrapperSelector: 'kendo-numerictextbox',
      role: 'spinbutton',
      nativeControlSelector: INNER_CONTROLS,
    },
    // A tab strip wraps the page content of its tabs, so none of it is absorbed.
    { widgetKind: 'tabstrip', wrapperSelector: 'kendo-tabstrip', role: 'tablist' },
    {
      widgetKind: 'window',
      wrapperSelector: 'kendo-window',
      role: 'dialog',
      nativeControlSelector: '.k-window-titlebar *',
    },
    {
      widgetKind: 'grid',
      wrapperSelector: 'kendo-grid',
      role: 'grid',
      grid: {
        nextPageSelector: '[aria-label="Go to the next page"]',
        previousPageSelector: '[aria-label="Go to the previous page"]',
        scrollContainerSelector: '.k-grid-container',
      },
    },
  ],
  // Generated ids are random per page load: `k-` plus a UUID prefix, with a suffix for the
  // elements derived from it (the popup list).
  generatedIdPatterns: ['^k-[0-9a-f]{8}(?:-[a-z]+)*$'],
  busySelectors: ['.k-loading-mask', 'kendo-loader', '.k-loader-container'],
};
