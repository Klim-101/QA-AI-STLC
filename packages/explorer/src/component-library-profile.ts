// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage, DateEntry, GridControls, WidgetTarget } from '@qa-ai-stlc/core';
import type { UiComponentLibrary } from '@qa-ai-stlc/schemas';
import { KENDO_ANGULAR_PROFILE } from './profiles/kendo-angular.js';
import { KENDO_JQUERY_PROFILE } from './profiles/kendo-jquery.js';

/**
 * One kind of widget a component library renders. The wrapper is the element that carries the
 * stable locator: UI libraries typically hide the native control and render a styled wrapper the
 * user actually sees and clicks.
 */
export interface WidgetRecognizer {
  /** Domain name of the widget, recorded in the registry as the element kind (`dropdown`). */
  readonly widgetKind: string;
  /** CSS selector matching the visible wrapper: the DOM signature of this widget. */
  readonly wrapperSelector: string;
  /** ARIA role used for the widget when the wrapper does not declare one itself. */
  readonly role: string;
  /**
   * CSS selector for native controls inside the wrapper that only back the widget (a hidden
   * `input` or `select`). They are not registered separately: the wrapper represents them.
   */
  readonly nativeControlSelector?: string;
  /**
   * What the engine can do to this widget (P6-43): `select-option` picks an option of its list by
   * visible text, `set-date` types a date, `popup` opens and closes its popup. The generated
   * locator module gets a helper per action; omitted, the widget has none.
   */
  readonly actions?: readonly WidgetAction[];
  /**
   * CSS selector, relative to the wrapper, of the control that opens the widget's popup, when
   * clicking the wrapper itself does not (a drop-down button, an inner input).
   */
  readonly popupToggleSelector?: string;
  /**
   * How the `set-date` action enters a date. `digits` types only the digits, one key at a time, for
   * a segmented masked input that rewrites a filled string; omitted means the formatted text is filled.
   */
  readonly dateEntry?: DateEntry;
  /** Present on a data grid: how the grid actions page or scroll to a row that is not rendered (P6-44). */
  readonly grid?: GridControls;
}

export type WidgetAction = 'select-option' | 'set-date' | 'popup';

/** The widgets a profile gives actions or grid navigation to, in the shape the engine's browser session takes. */
export function listWidgetTargets(profile: ComponentLibraryProfile | undefined): readonly WidgetTarget[] {
  return (profile?.widgets ?? [])
    .filter((widget) => (widget.actions ?? []).length > 0 || widget.grid !== undefined)
    .map((widget) => ({
      wrapperSelector: widget.wrapperSelector,
      ...(widget.popupToggleSelector === undefined
        ? {}
        : { popupToggleSelector: widget.popupToggleSelector }),
      ...(widget.dateEntry === undefined ? {} : { dateEntry: widget.dateEntry }),
      ...(widget.grid === undefined ? {} : { grid: widget.grid }),
    }));
}

/**
 * Everything the explorer needs to know about one UI component library. Profiles are data: no
 * library-specific code exists outside them.
 */
export interface ComponentLibraryProfile {
  readonly id: string;
  readonly widgets: readonly WidgetRecognizer[];
  /** Regular-expression sources of ids the library generates; added to `selectors.generatedIdPatterns`. */
  readonly generatedIdPatterns: readonly string[];
  /** Selectors of busy indicators (spinners, overlays) that must be gone before a page is read. */
  readonly busySelectors: readonly string[];
}

export type ComponentLibraryProfiles = Readonly<Partial<Record<UiComponentLibrary, ComponentLibraryProfile>>>;

export const BUILT_IN_PROFILES: ComponentLibraryProfiles = {
  'kendo-jquery': KENDO_JQUERY_PROFILE,
  'kendo-angular': KENDO_ANGULAR_PROFILE,
};

/** The profile for `ui.componentLibrary`, or `undefined` when none is selected or shipped. */
export function resolveComponentLibraryProfile(
  library: UiComponentLibrary,
  profiles: ComponentLibraryProfiles = BUILT_IN_PROFILES,
): ComponentLibraryProfile | undefined {
  return profiles[library];
}

/** The configured generated-id patterns plus the ones the profile contributes, without repeats. */
export function mergeGeneratedIdPatterns(
  configured: readonly string[],
  profile: ComponentLibraryProfile | undefined,
): string[] {
  return [...new Set([...configured, ...(profile?.generatedIdPatterns ?? [])])];
}

export const DEFAULT_READY_TIMEOUT_MS = 5_000;

interface ReadyArgs {
  readonly busySelectors: readonly string[];
  readonly timeoutMs: number;
}

/**
 * Waits until none of the profile's busy indicators is on the page, so widgets are read in their
 * settled state. Gives up silently after the timeout: a spinner that never leaves must not block
 * exploration of the rest of the page.
 */
export async function waitUntilLibraryReady(
  page: AuthPage,
  profile: ComponentLibraryProfile | undefined,
  timeoutMs: number = DEFAULT_READY_TIMEOUT_MS,
): Promise<void> {
  if (profile === undefined || profile.busySelectors.length === 0) {
    return;
  }
  /* v8 ignore start -- runs in the browser's own V8 instance, invisible to Node coverage */
  await page.evaluate(
    async ({ busySelectors, timeoutMs }: ReadyArgs) => {
      const deadline = Date.now() + timeoutMs;
      const isBusy = (): boolean =>
        busySelectors.some((selector) => document.querySelector(selector) !== null);
      while (isBusy() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    { busySelectors: profile.busySelectors, timeoutMs },
  );
  /* v8 ignore stop */
}
