// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ComponentLibraryProfile } from '../component-library-profile.js';

// Kendo UI for jQuery turns a native `select` or `input` into a styled wrapper `span` and hides the
// original, so the wrapper is what a user sees and the only element worth a locator. Everything
// the widget renders inside its wrapper (inner inputs, buttons, spinners) only backs the widget.
const INNER_CONTROLS = 'input, select, button';
// The drop-down button of a combo box or date picker; the theme versions name it differently.
// A grid's pager buttons, named the way the library labels them.
const PAGER_NEXT = '[aria-label="Go to the next page"], [title="Go to the next page"]';
const PAGER_PREVIOUS = '[aria-label="Go to the previous page"], [title="Go to the previous page"]';
const POPUP_BUTTON = '.k-input-button, .k-select';

export const KENDO_JQUERY_PROFILE: ComponentLibraryProfile = {
  id: 'kendo-jquery',
  widgets: [
    {
      widgetKind: 'dropdownlist',
      wrapperSelector: 'span.k-dropdownlist',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['select-option', 'popup'],
    },
    {
      widgetKind: 'combobox',
      wrapperSelector: 'span.k-combobox',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['select-option', 'popup'],
      popupToggleSelector: POPUP_BUTTON,
    },
    {
      widgetKind: 'multiselect',
      wrapperSelector: 'span.k-multiselect',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['select-option', 'popup'],
    },
    {
      widgetKind: 'datepicker',
      wrapperSelector: 'span.k-datepicker',
      role: 'combobox',
      nativeControlSelector: INNER_CONTROLS,
      actions: ['set-date', 'popup'],
      popupToggleSelector: POPUP_BUTTON,
    },
    {
      widgetKind: 'numerictextbox',
      wrapperSelector: 'span.k-numerictextbox',
      role: 'spinbutton',
      nativeControlSelector: INNER_CONTROLS,
    },
    // A tab strip wraps the page content of its tabs, so none of it is absorbed.
    { widgetKind: 'tabstrip', wrapperSelector: 'div.k-tabstrip', role: 'tablist' },
    {
      widgetKind: 'window',
      wrapperSelector: 'div.k-window',
      role: 'dialog',
      nativeControlSelector: '.k-window-titlebar *',
    },
    {
      widgetKind: 'grid',
      wrapperSelector: 'div.k-grid',
      role: 'grid',
      grid: {
        nextPageSelector: PAGER_NEXT,
        previousPageSelector: PAGER_PREVIOUS,
        scrollContainerSelector: '.k-grid-content',
      },
    },
  ],
  // Generated ids are random per page load: a GUID the library puts on inner elements.
  generatedIdPatterns: ['^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'],
  busySelectors: ['.k-loading-mask', '.k-loading:not(.k-complete)'],
};
