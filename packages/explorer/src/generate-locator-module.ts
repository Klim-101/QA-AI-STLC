// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from '@qa-ai-stlc/core';
import type {
  LocatorCandidate,
  SelectorElement,
  SelectorRegistry,
  UiComponentLibrary,
} from '@qa-ai-stlc/schemas';
import {
  BUILT_IN_PROFILES,
  type ComponentLibraryProfiles,
  type WidgetAction,
  type WidgetRecognizer,
} from './component-library-profile.js';
import { WIDGET_RUNTIME_SOURCE } from './widget-runtime-source.js';

export interface GenerateLocatorModuleOptions {
  /** Stamped into the module header and `GENERATOR_VERSION` so a stale file can be detected. */
  readonly generatorVersion: string;
  /** Overrides the shipped component-library profiles; a test seam, unset in production. */
  readonly profiles?: ComponentLibraryProfiles;
}

export interface MissingLocatorElement {
  readonly elementId: string;
  readonly kind: string;
}

export interface GenerateLocatorModuleResult {
  /** The `tests/qa/locators.ts` file contents (ADR-006), ready to write as-is. */
  readonly source: string;
  /** Elements with no export: no locator candidate, or no export name assigned yet. */
  readonly missingLocators: readonly MissingLocatorElement[];
}

function roleCall(candidate: LocatorCandidate): string {
  const parsed: unknown = JSON.parse(candidate.value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('role' in parsed) ||
    !('name' in parsed) ||
    typeof parsed.role !== 'string' ||
    typeof parsed.name !== 'string'
  ) {
    throw new QaError(
      'explorer.locator_module.invalid_role_candidate',
      `role candidate value is not a {role, name} pair: ${candidate.value}`,
    );
  }
  return `page.getByRole(${JSON.stringify(parsed.role)}, { name: ${JSON.stringify(parsed.name)} })`;
}

function locatorCall(candidate: LocatorCandidate): string {
  switch (candidate.strategy) {
    case 'role':
      return roleCall(candidate);
    case 'testId':
      return `page.getByTestId(${JSON.stringify(candidate.value)})`;
    case 'label':
      return `page.getByLabel(${JSON.stringify(candidate.value)})`;
    case 'placeholder':
      return `page.getByPlaceholder(${JSON.stringify(candidate.value)})`;
    case 'text':
      return `page.getByText(${JSON.stringify(candidate.value)})`;
    case 'css':
      return `page.locator(${JSON.stringify(candidate.value)})`;
    default:
      throw new QaError(
        'explorer.locator_module.unknown_strategy',
        `unknown locator strategy: ${candidate.strategy}`,
      );
  }
}

function isGeneratable(element: SelectorElement): element is SelectorElement & { name: string } {
  return element.name !== undefined && element.deprecatedAt === undefined;
}

interface GeneratableEntry {
  readonly element: SelectorElement & { name: string };
  readonly primary: LocatorCandidate;
}

// Pairs each generatable element with its primary candidate in one pass, narrowing out elements
// with an empty `locatorCandidates` by the presence of `primary` rather than by re-checking
// `.length`, so the later render step never needs to handle an "impossible" missing primary.
function toGeneratableEntry(element: SelectorElement & { name: string }): GeneratableEntry | undefined {
  const primary = element.locatorCandidates[0];
  return primary === undefined ? undefined : { element, primary };
}

function findWidgetRecognizer(
  element: SelectorElement,
  profiles: ComponentLibraryProfiles,
): WidgetRecognizer | undefined {
  if (element.library === undefined) {
    return undefined;
  }
  const profile = profiles[element.library as UiComponentLibrary];
  return profile?.widgets.find((widget) => widget.widgetKind === element.kind);
}

interface WidgetHelperContext {
  readonly name: string;
  /** The expression that finds the widget wrapper from the element's own locator. */
  readonly root: string;
  /** The `, "<selector>"` argument naming the widget's popup toggle, empty when it has none. */
  readonly toggleArgument: string;
  /** The `, "digits"` argument for a date input that must be typed, empty when the text is filled. */
  readonly dateEntryArgument: string;
}

interface WidgetHelper {
  readonly exportName: string;
  readonly source: string;
}

function helper(exportName: string, parameters: string, call: string): WidgetHelper {
  return {
    exportName,
    source: `export async function ${exportName}(page: Page${parameters}): Promise<void> {\n  await ${call};\n}`,
  };
}

// Keyed by `WidgetAction`, so adding an action to the profile type fails to compile until the
// module knows how to render it.
const WIDGET_HELPER_RENDERERS: Record<WidgetAction, (context: WidgetHelperContext) => WidgetHelper[]> = {
  'select-option': ({ name, root, toggleArgument }) => [
    helper(
      `${name}SelectOption`,
      ', optionText: string',
      `selectWidgetOption(${root}, optionText${toggleArgument})`,
    ),
  ],
  'set-date': ({ name, root, dateEntryArgument }) => [
    helper(`${name}SetDate`, ', value: string', `setWidgetDate(${root}, value${dateEntryArgument})`),
  ],
  popup: ({ name, root, toggleArgument }) => [
    helper(`${name}OpenPopup`, '', `setWidgetPopup(${root}, true${toggleArgument})`),
    helper(`${name}ClosePopup`, '', `setWidgetPopup(${root}, false${toggleArgument})`),
  ],
};

// One helper per action the widget's profile declares (P6-43), so a generated spec calls
// `statusSelectOption(page, 'Open')` instead of replaying the click sequence that opens the list.
// The helpers share the runtime in `widget-runtime-source.ts`, which the module carries itself:
// a generated spec must not depend on this framework at run time.
function renderWidgetHelpers(
  element: SelectorElement & { name: string },
  widget: WidgetRecognizer,
): WidgetHelper[] {
  const context: WidgetHelperContext = {
    name: element.name,
    root: `widgetRoot(${element.name}(page), ${JSON.stringify(widget.wrapperSelector)})`,
    toggleArgument:
      widget.popupToggleSelector === undefined ? '' : `, ${JSON.stringify(widget.popupToggleSelector)}`,
    dateEntryArgument: widget.dateEntry === 'digits' ? ', "digits"' : '',
  };
  return (widget.actions ?? []).flatMap((action) => WIDGET_HELPER_RENDERERS[action](context));
}

function byName(a: GeneratableEntry, b: GeneratableEntry): number {
  return a.element.name.localeCompare(b.element.name);
}

/**
 * Renders the selector registry into a typed, deterministic `tests/qa/locators.ts` module (ADR-006):
 * one exported function per element, named after its registry `name`, returning a Playwright
 * `Locator` built from the element's primary (highest-preference) candidate. An element with no
 * candidate, or predating the `name` field, gets no export and is reported in `missingLocators`
 * instead of failing generation.
 */
export function generateLocatorModule(
  registry: SelectorRegistry,
  options: GenerateLocatorModuleOptions,
): GenerateLocatorModuleResult {
  const active = registry.elements.filter((element) => element.deprecatedAt === undefined);

  const missingLocators: MissingLocatorElement[] = active
    .filter((element) => !isGeneratable(element) || element.locatorCandidates.length === 0)
    .map((element) => ({ elementId: element.elementId, kind: element.kind }))
    .sort((a, b) => a.elementId.localeCompare(b.elementId));

  const generatable = active
    .filter((element): element is SelectorElement & { name: string } => isGeneratable(element))
    .map(toGeneratableEntry)
    .filter((entry): entry is GeneratableEntry => entry !== undefined)
    .sort(byName);

  const functions = generatable.map(
    ({ element, primary }) =>
      `export function ${element.name}(page: Page): Locator {\n  return ${locatorCall(primary)};\n}`,
  );

  const profiles = options.profiles ?? BUILT_IN_PROFILES;
  const exportedNames = new Set(generatable.map(({ element }) => element.name));
  // A helper never replaces the locator function of another element that happens to share its name.
  const widgetHelpers = generatable
    .flatMap(({ element }) => {
      const widget = findWidgetRecognizer(element, profiles);
      return widget === undefined ? [] : renderWidgetHelpers(element, widget);
    })
    .filter((helper) => !exportedNames.has(helper.exportName));

  const header = [
    '// Copyright The QA-AI-STLC Authors',
    '// SPDX-License-Identifier: Apache-2.0',
    '',
    `// Generated by @qa-ai-stlc/explorer@${options.generatorVersion} from the selector registry`,
    '// (ADR-006). Do not edit by hand; regenerate with `qa explore`.',
    '',
    "import type { Locator, Page } from 'playwright';",
    '',
    `export const GENERATOR_VERSION = ${JSON.stringify(options.generatorVersion)};`,
  ].join('\n');

  const widgetSection =
    widgetHelpers.length === 0 ? [] : [...widgetHelpers.map((entry) => entry.source), WIDGET_RUNTIME_SOURCE];
  const source = `${[header, ...functions, ...widgetSection].join('\n\n')}\n`;

  return { source, missingLocators };
}
