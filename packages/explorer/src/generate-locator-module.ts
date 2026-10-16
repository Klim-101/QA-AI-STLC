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
import { toCamelCaseIdentifier, toLocatorFunctionName } from './naming.js';
import { WIDGET_RUNTIME_SOURCE } from './widget-runtime-source.js';

export interface GenerateLocatorModuleOptions {
  /** Stamped into the module header and `GENERATOR_VERSION` so a stale file can be detected. */
  readonly generatorVersion: string;
  /** Overrides the shipped component-library profiles; a test seam, unset in production. */
  readonly profiles?: ComponentLibraryProfiles;
}

export type SkippedLocatorReason = 'no-locator-candidate' | 'no-name';

export interface MissingLocatorElement {
  readonly elementId: string;
  readonly kind: string;
  readonly reason: SkippedLocatorReason;
}

/** An element that has no function of its own because an element with the identical locator does. */
export interface SharedLocatorElement {
  readonly elementId: string;
  readonly exportName: string;
}

export interface GenerateLocatorModuleResult {
  /** The `tests/qa/locators.ts` file contents (ADR-006), ready to write as-is. */
  readonly source: string;
  /** Elements with no export: no locator candidate, or no export name assigned yet. */
  readonly missingLocators: readonly MissingLocatorElement[];
  /**
   * Elements whose locator is identical to another element's, answered by that element's function.
   * Every active registry element is exactly one of: the owner of an export, shared, or missing.
   */
  readonly sharedLocators: readonly SharedLocatorElement[];
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
    // An `execute` selector is what the browser tool passed to `page.locator()`, so it is valid there
    // as it stands (`role=columnheader[name="Last GW ID"]`, `text=Save`, a CSS selector).
    case 'execute':
      return `page.locator(${JSON.stringify(candidate.value)})`;
    default:
      throw new QaError(
        'explorer.locator_module.unknown_strategy',
        `unknown locator strategy: ${candidate.strategy}`,
      );
  }
}

// A session-added element may have been registered without a name; one is derived from its selector
// (`role=columnheader[name="Last GW ID"]` becomes `columnheaderLastGwId`) so it still gets a function.
function nameFromExecuteSelector(selector: string, kind: string): string {
  const role = /^role=([A-Za-z]+)(?:\[name="(.*)"\])?/u.exec(selector);
  if (role !== null) {
    // The unmatched name group is `undefined` at run time, which `join` renders as nothing.
    return toCamelCaseIdentifier(role.slice(1).join(' '), kind);
  }
  return toCamelCaseIdentifier(selector.replace(/^[a-z-]+=/u, ''), kind);
}

function resolveName(element: SelectorElement, primary: LocatorCandidate | undefined): string | undefined {
  if (element.name !== undefined) {
    return toLocatorFunctionName(element.name, element.kind);
  }
  return primary?.strategy === 'execute' ? nameFromExecuteSelector(primary.value, element.kind) : undefined;
}

interface GeneratableEntry {
  readonly element: SelectorElement;
  readonly name: string;
  readonly primary: LocatorCandidate;
  readonly call: string;
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
function renderWidgetHelpers(name: string, widget: WidgetRecognizer): WidgetHelper[] {
  const context: WidgetHelperContext = {
    name,
    root: `widgetRoot(${name}(page), ${JSON.stringify(widget.wrapperSelector)})`,
    toggleArgument:
      widget.popupToggleSelector === undefined ? '' : `, ${JSON.stringify(widget.popupToggleSelector)}`,
    dateEntryArgument: widget.dateEntry === 'digits' ? ', "digits"' : '',
  };
  return (widget.actions ?? []).flatMap((action) => WIDGET_HELPER_RENDERERS[action](context));
}

// A row is found by the text it shows and a cell by the column header's name, because a grid's rows
// are repeated elements that share one locator: indexed copies would silently follow the data order.
// The header carries `aria-colindex` in the grids the shipped profiles cover; a grid without it fails
// loudly instead of reading the wrong column.
function renderGridHelpers(name: string): WidgetHelper[] {
  return [
    {
      exportName: `${name}Row`,
      source: [
        `export function ${name}Row(page: Page, rowText: string): Locator {`,
        `  return ${name}(page).getByRole("row").filter({ hasText: rowText });`,
        '}',
      ].join('\n'),
    },
    {
      exportName: `${name}Cell`,
      source: [
        `export async function ${name}Cell(page: Page, rowText: string, columnName: string): Promise<Locator> {`,
        `  const header = ${name}(page).getByRole("columnheader", { name: columnName, exact: true });`,
        '  const columnIndex = await header.getAttribute("aria-colindex");',
        '  if (columnIndex === null) {',
        '    throw new Error(`Column "${columnName}" has no aria-colindex, so its cells cannot be located.`);',
        '  }',
        `  return ${name}Row(page, rowText).locator(\`[aria-colindex="\${columnIndex}"]\`);`,
        '}',
      ].join('\n'),
    },
  ];
}

function byName(a: { readonly name: string }, b: { readonly name: string }): number {
  return a.name.localeCompare(b.name);
}

// The unsuffixed name is the one a crawl assigned first, so it is the stable one to keep.
function byPreferredName(a: GeneratableEntry, b: GeneratableEntry): number {
  return (
    a.name.length - b.name.length ||
    a.name.localeCompare(b.name) ||
    a.element.elementId.localeCompare(b.element.elementId)
  );
}

interface LocatorGroup {
  readonly owner: GeneratableEntry;
  readonly members: readonly GeneratableEntry[];
  readonly exportName: string;
}

// Elements that share one locator call (the rows of a repeated list, a control rendered twice) are
// one function: the registry holds an element per occurrence, but a spec can only address them by
// what the locator matches. Two different locators that ended up with one name stay separate and
// the later one is suffixed, so no export is ever overwritten.
function groupByLocator(entries: readonly GeneratableEntry[]): LocatorGroup[] {
  const membersByCall = new Map<string, GeneratableEntry[]>();
  for (const entry of entries) {
    membersByCall.set(entry.call, [...(membersByCall.get(entry.call) ?? []), entry]);
  }
  const owned = [...membersByCall.values()].map((members) => ({
    owner: members.reduce((best, member) => (byPreferredName(member, best) < 0 ? member : best)),
    members,
  }));
  const usedNames = new Set<string>();
  return owned
    .sort((a, b) => byName(a.owner, b.owner) || a.owner.call.localeCompare(b.owner.call))
    .map(({ owner, members }) => {
      let exportName = owner.name;
      for (let suffix = 2; usedNames.has(exportName); suffix += 1) {
        exportName = `${owner.name}${String(suffix)}`;
      }
      usedNames.add(exportName);
      return { owner, members, exportName };
    });
}

/**
 * Renders the selector registry into a typed, deterministic `tests/qa/locators.ts` module (ADR-006):
 * one exported function per distinct locator, named after its registry `name`, returning a Playwright
 * `Locator` built from the element's primary (highest-preference) candidate. Elements with an
 * identical locator share one function (`sharedLocators`); an element with no candidate or no name
 * gets no export and is reported in `missingLocators` with the reason instead of failing generation.
 * A data grid also gets `<name>Row` and `<name>Cell` helpers that take the row text and column name.
 */
export function generateLocatorModule(
  registry: SelectorRegistry,
  options: GenerateLocatorModuleOptions,
): GenerateLocatorModuleResult {
  const active = registry.elements.filter((element) => element.deprecatedAt === undefined);

  const missingLocators: MissingLocatorElement[] = [];
  const entries: GeneratableEntry[] = [];
  for (const element of active) {
    const primary = element.locatorCandidates[0];
    const name = resolveName(element, primary);
    if (primary === undefined) {
      missingLocators.push({
        elementId: element.elementId,
        kind: element.kind,
        reason: 'no-locator-candidate',
      });
    } else if (name === undefined) {
      missingLocators.push({ elementId: element.elementId, kind: element.kind, reason: 'no-name' });
    } else {
      entries.push({ element, name, primary, call: locatorCall(primary) });
    }
  }
  missingLocators.sort((a, b) => a.elementId.localeCompare(b.elementId));

  const groups = groupByLocator(entries);
  const sharedLocators: SharedLocatorElement[] = groups
    .flatMap(({ owner, members, exportName }) =>
      members
        .filter((member) => member !== owner)
        .map((member) => ({ elementId: member.element.elementId, exportName })),
    )
    .sort((a, b) => a.elementId.localeCompare(b.elementId));

  // The elements a function answers are written above it, so what a spec may import is read from
  // the module itself and cannot drift from it (`parseLocatorModuleExports` in `@qa-ai-stlc/core`).
  const functions = groups.map(({ owner, members, exportName }) => {
    const elementIds = members.map((member) => member.element.elementId).sort();
    return `// elements: ${elementIds.join(' ')}\nexport function ${exportName}(page: Page): Locator {\n  return ${owner.call};\n}`;
  });

  const profiles = options.profiles ?? BUILT_IN_PROFILES;
  const exportedNames = new Set(groups.map(({ exportName }) => exportName));
  // A helper never replaces the locator function of another element that happens to share its name.
  const widgetHelpers = groups
    .flatMap(({ owner, exportName }) => {
      const widget = findWidgetRecognizer(owner.element, profiles);
      if (widget === undefined) {
        return [];
      }
      return [
        ...renderWidgetHelpers(exportName, widget),
        ...(widget.grid === undefined ? [] : renderGridHelpers(exportName)),
      ];
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

  const isRuntimeNeeded = widgetHelpers.some((entry) => entry.source.includes('widgetRoot('));
  const widgetSection =
    widgetHelpers.length === 0
      ? []
      : [...widgetHelpers.map((entry) => entry.source), ...(isRuntimeNeeded ? [WIDGET_RUNTIME_SOURCE] : [])];
  const source = `${[header, ...functions, ...widgetSection].join('\n\n')}\n`;

  return { source, missingLocators, sharedLocators };
}
