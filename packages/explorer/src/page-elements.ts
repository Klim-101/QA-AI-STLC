// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import type {
  Dialog,
  Form,
  FormField,
  InteractiveElement,
  InteractiveElementKind,
  Table,
} from '@qa-ai-stlc/schemas';
import type { WidgetRecognizer } from './component-library-profile.js';
import { capArray, truncateText, type NormalizeLimits } from './normalize.js';

interface RawPageElements {
  readonly interactiveElements: readonly RawInteractiveElement[];
  readonly forms: readonly RawForm[];
  readonly tables: readonly RawTable[];
  readonly dialogs: readonly RawDialog[];
}

interface RawInteractiveElement {
  readonly kind: string;
  readonly accessibleName: string | undefined;
  readonly testId: string | undefined;
  readonly role: string | undefined;
  readonly label: string | undefined;
  readonly placeholder: string | undefined;
  readonly htmlId: string | undefined;
  readonly tagName: string;
  readonly nthOfType: number;
  // Absent from a `RawInteractiveElement` an older extraction (or a hand-built test fixture)
  // produced before P6-23 added it; `page.evaluate()`'s own result is `unknown` at this boundary,
  // so the type here does not guarantee the key was ever actually written.
  readonly extraAttributeValues?: Readonly<Record<string, string>>;
  // Present only on a widget a component-library profile recognized (P6-37).
  readonly widgetKind?: string;
  readonly popupId?: string;
}

interface RawForm {
  readonly action: string | undefined;
  readonly method: string;
  readonly fields: readonly RawFormField[];
}

interface RawFormField {
  readonly name: string | undefined;
  readonly type: string;
  readonly required: boolean;
}

interface RawTable {
  readonly columnHeaders: readonly string[];
  readonly rowCount: number;
}

interface RawDialog {
  readonly accessibleName: string | undefined;
  readonly open: boolean;
}

export interface PageElements {
  readonly interactiveElements: InteractiveElement[];
  readonly forms: Form[];
  readonly tables: Table[];
  readonly dialogs: Dialog[];
  readonly truncated: boolean;
}

const INTERACTIVE_ELEMENT_KINDS: readonly InteractiveElementKind[] = [
  'button',
  'link',
  'input',
  'select',
  'textarea',
  'widget',
];

function isInteractiveElementKind(value: string): value is InteractiveElementKind {
  return (INTERACTIVE_ELEMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Reads every interactive element, form, table and dialog on the current page. The callback runs
 * inside the browser (Playwright serializes it across the CDP boundary), so it can reference DOM
 * globals unavailable to the rest of this package.
 */
interface ExtractionArgs {
  readonly testIdAttribute: string;
  /** `config.selectors.extraStableAttributes` (P6-23): read off each element, if present. */
  readonly extraStableAttributes: readonly string[];
  /** Widget recognizers of the selected component-library profile (P6-37); empty without one. */
  readonly widgets: readonly WidgetRecognizer[];
}

async function readRawPageElements(
  page: AuthPage,
  testIdAttribute: string,
  extraStableAttributes: readonly string[],
  widgets: readonly WidgetRecognizer[],
): Promise<RawPageElements | undefined> {
  /* v8 ignore start -- runs in the browser's own V8 instance, invisible to Node coverage */
  const result = await page.evaluate(
    ({ testIdAttribute, extraStableAttributes, widgets }: ExtractionArgs) => {
      function accessibleName(element: Element): string | undefined {
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel !== null && ariaLabel.trim().length > 0) {
          return ariaLabel;
        }
        const text = element.textContent.trim();
        return text.length > 0 ? text : undefined;
      }

      // A small, explicit table rather than full ARIA role computation: locator synthesis only
      // needs a role plausible enough for `getByRole`, and the five kinds below are the only ones
      // this extractor recognizes in the first place.
      function computeRole(element: Element, kind: string): string | undefined {
        const explicit = element.getAttribute('role');
        if (explicit !== null && explicit.trim().length > 0) {
          return explicit;
        }
        if (kind === 'textarea') {
          return 'textbox';
        }
        if (kind === 'select') {
          return 'combobox';
        }
        if (kind === 'input') {
          const type = (element.getAttribute('type') ?? 'text').toLowerCase();
          if (type === 'checkbox' || type === 'radio') {
            return type;
          }
          if (type === 'button' || type === 'submit' || type === 'reset') {
            return 'button';
          }
          return 'textbox';
        }
        return kind === 'button' || kind === 'link' ? kind : undefined;
      }

      // `for`/`id` association first, then an ancestor `<label>` that wraps the field.
      function labelText(element: Element): string | undefined {
        const id = element.getAttribute('id');
        if (id !== null && id.length > 0) {
          const associated = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          const text = associated?.textContent.trim();
          if (text !== undefined && text.length > 0) {
            return text;
          }
        }
        const wrapping = element.closest('label')?.textContent.trim();
        return wrapping !== undefined && wrapping.length > 0 ? wrapping : undefined;
      }

      // Position among same-tag siblings, so a CSS fallback candidate can be built without a live
      // page: `tagName:nth-of-type(nthOfType)` scoped to the element's own parent.
      function nthOfType(element: Element): number {
        const parent = element.parentElement;
        if (parent === null) {
          return 1;
        }
        let index = 0;
        for (const sibling of parent.children) {
          if (sibling.tagName === element.tagName) {
            index += 1;
            if (sibling === element) {
              return index;
            }
          }
        }
        return 1;
      }

      function extraAttributeValues(element: Element): Record<string, string> {
        const values: Record<string, string> = {};
        for (const attribute of extraStableAttributes) {
          const value = element.getAttribute(attribute);
          if (value !== null) {
            values[attribute] = value;
          }
        }
        return values;
      }

      function describe(element: Element, kind: string): Record<string, unknown> {
        return {
          kind,
          accessibleName: accessibleName(element),
          testId: element.getAttribute(testIdAttribute) ?? undefined,
          role: computeRole(element, kind),
          label: labelText(element),
          placeholder: element.getAttribute('placeholder') ?? undefined,
          htmlId: element.getAttribute('id') ?? undefined,
          tagName: element.tagName.toLowerCase(),
          nthOfType: nthOfType(element),
          extraAttributeValues: extraAttributeValues(element),
        };
      }

      // A popup is usually attached to `body`, not nested in its widget, so the only reliable link
      // is the id the widget (or its focusable part) names in `aria-controls` or `aria-owns`.
      function popupId(element: Element, inner: readonly Element[]): string | undefined {
        const holder = element.matches('[aria-controls], [aria-owns]')
          ? element
          : inner.find((control) => control.matches('[aria-controls], [aria-owns]'));
        return holder?.getAttribute('aria-controls') ?? holder?.getAttribute('aria-owns') ?? undefined;
      }

      // A wrapper's text content is its popup items and hidden options, not its name, so a widget
      // is named only by an explicit label: `aria-labelledby`, `aria-label`, or the label of a
      // control inside it.
      function widgetLabel(wrapper: Element, inner: readonly Element[]): string | undefined {
        const holder = wrapper.matches('[aria-labelledby]')
          ? wrapper
          : inner.find((control) => control.hasAttribute('aria-labelledby'));
        const labelled = (holder?.getAttribute('aria-labelledby') ?? '')
          .split(/s+/)
          .map((id) => document.getElementById(id)?.textContent.trim() ?? '')
          .filter((text) => text.length > 0)
          .join(' ');
        if (labelled.length > 0) {
          return labelled;
        }
        const ariaLabel = wrapper.getAttribute('aria-label')?.trim();
        if (ariaLabel !== undefined && ariaLabel.length > 0) {
          return ariaLabel;
        }
        for (const control of inner) {
          const text = labelText(control);
          if (text !== undefined) {
            return text;
          }
        }
        return undefined;
      }

      // A native control that only backs a recognized widget is represented by the widget's
      // wrapper; registering it too would hand out a hidden element as a locator.
      function isAbsorbedByWidget(element: Element): boolean {
        return widgets.some(
          (widget) =>
            widget.nativeControlSelector !== undefined &&
            element.matches(widget.nativeControlSelector) &&
            element.closest(widget.wrapperSelector) !== null,
        );
      }

      const kindByTagName: Record<string, string> = {
        a: 'link',
        button: 'button',
        input: 'input',
        select: 'select',
        textarea: 'textarea',
      };
      const nativeElements = Array.from(document.querySelectorAll('button, a[href], input, select, textarea'))
        .filter((element) => !isAbsorbedByWidget(element))
        .map((element) => describe(element, kindByTagName[element.tagName.toLowerCase()] ?? 'unknown'));

      const seenWrappers = new Set<Element>();
      const widgetElements = widgets.flatMap((widget) =>
        Array.from(document.querySelectorAll(widget.wrapperSelector)).flatMap((wrapper) => {
          if (seenWrappers.has(wrapper)) {
            return [];
          }
          seenWrappers.add(wrapper);
          // Only the controls that back the widget are searched: a tab strip or grid also contains
          // unrelated content whose labels and `aria-controls` must not leak into its own.
          const inner =
            widget.nativeControlSelector === undefined
              ? []
              : Array.from(wrapper.querySelectorAll(widget.nativeControlSelector));
          const described = describe(wrapper, 'widget');
          return [
            {
              ...described,
              accessibleName: undefined,
              label: widgetLabel(wrapper, inner),
              role: described.role ?? widget.role,
              widgetKind: widget.widgetKind,
              popupId: popupId(wrapper, inner),
            },
          ];
        }),
      );
      const interactiveElements = [...nativeElements, ...widgetElements];

      const forms = Array.from(document.querySelectorAll('form')).map((form) => ({
        action: form.getAttribute('action') ?? undefined,
        method: (form.getAttribute('method') ?? 'get').toLowerCase(),
        fields: Array.from(form.querySelectorAll('input, select, textarea')).map((field) => ({
          name: field.getAttribute('name') ?? undefined,
          type: field.getAttribute('type') ?? field.tagName.toLowerCase(),
          required: field.hasAttribute('required'),
        })),
      }));

      const tables = Array.from(document.querySelectorAll('table')).map((table) => ({
        columnHeaders: Array.from(table.querySelectorAll('thead th')).map((header) =>
          header.textContent.trim(),
        ),
        rowCount: table.querySelectorAll('tbody tr').length,
      }));

      const dialogs = Array.from(document.querySelectorAll('dialog, [role="dialog"]')).map((dialog) => ({
        accessibleName: accessibleName(dialog),
        open: dialog.hasAttribute('open'),
      }));

      return { interactiveElements, forms, tables, dialogs };
    },
    { testIdAttribute, extraStableAttributes, widgets },
  );
  /* v8 ignore stop */
  return isRawPageElements(result) ? result : undefined;
}

function isRawPageElements(value: unknown): value is RawPageElements {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.interactiveElements) &&
    Array.isArray(record.forms) &&
    Array.isArray(record.tables) &&
    Array.isArray(record.dialogs)
  );
}

function normalizeInteractiveElement(
  raw: RawInteractiveElement,
  limits: NormalizeLimits,
  onTruncated: () => void,
): InteractiveElement | undefined {
  if (!isInteractiveElementKind(raw.kind)) {
    return undefined;
  }
  const element: InteractiveElement = { kind: raw.kind, tagName: raw.tagName, nthOfType: raw.nthOfType };
  if (raw.accessibleName !== undefined) {
    const { text, truncated } = truncateText(raw.accessibleName, limits);
    element.accessibleName = text;
    if (truncated) {
      onTruncated();
    }
  }
  if (raw.widgetKind !== undefined) {
    element.widgetKind = raw.widgetKind;
  }
  if (raw.popupId !== undefined) {
    element.popupId = raw.popupId;
  }
  if (raw.testId !== undefined) {
    element.testId = raw.testId;
  }
  if (raw.role !== undefined) {
    element.role = raw.role;
  }
  if (raw.label !== undefined) {
    const { text, truncated } = truncateText(raw.label, limits);
    element.label = text;
    if (truncated) {
      onTruncated();
    }
  }
  if (raw.placeholder !== undefined) {
    const { text, truncated } = truncateText(raw.placeholder, limits);
    element.placeholder = text;
    if (truncated) {
      onTruncated();
    }
  }
  if (raw.htmlId !== undefined) {
    const { text, truncated } = truncateText(raw.htmlId, limits);
    element.htmlId = text;
    if (truncated) {
      onTruncated();
    }
  }
  const extraAttributeValues = normalizeExtraAttributeValues(
    raw.extraAttributeValues ?? {},
    limits,
    onTruncated,
  );
  if (extraAttributeValues !== undefined) {
    element.extraAttributeValues = extraAttributeValues;
  }
  return element;
}

function normalizeExtraAttributeValues(
  raw: Readonly<Record<string, string>>,
  limits: NormalizeLimits,
  onTruncated: () => void,
): Record<string, string> | undefined {
  const entries = Object.entries(raw);
  if (entries.length === 0) {
    return undefined;
  }
  const values: Record<string, string> = {};
  for (const [attribute, value] of entries) {
    const { text, truncated } = truncateText(value, limits);
    values[attribute] = text;
    if (truncated) {
      onTruncated();
    }
  }
  return values;
}

function normalizeForm(raw: RawForm): Form {
  const form: Form = {
    method: raw.method,
    fields: raw.fields.map((field): FormField => {
      const result: FormField = { type: field.type, required: field.required };
      if (field.name !== undefined) {
        result.name = field.name;
      }
      return result;
    }),
  };
  if (raw.action !== undefined) {
    form.action = raw.action;
  }
  return form;
}

function normalizeTable(raw: RawTable, limits: NormalizeLimits, onTruncated: () => void): Table {
  const headers = raw.columnHeaders.map((header) => {
    const { text, truncated } = truncateText(header, limits);
    if (truncated) {
      onTruncated();
    }
    return text;
  });
  return { columnHeaders: headers, rowCount: raw.rowCount };
}

function normalizeDialog(raw: RawDialog, limits: NormalizeLimits, onTruncated: () => void): Dialog {
  const dialog: Dialog = { open: raw.open };
  if (raw.accessibleName !== undefined) {
    const { text, truncated } = truncateText(raw.accessibleName, limits);
    dialog.accessibleName = text;
    if (truncated) {
      onTruncated();
    }
  }
  return dialog;
}

/** Extracts and normalizes every interactive element, form, table and dialog on the current page. */
export async function extractPageElements(
  page: AuthPage,
  limits: NormalizeLimits,
  testIdAttribute: string,
  extraStableAttributes: readonly string[] = [],
  widgets: readonly WidgetRecognizer[] = [],
): Promise<PageElements> {
  const raw = await readRawPageElements(page, testIdAttribute, extraStableAttributes, widgets);
  if (raw === undefined) {
    return { interactiveElements: [], forms: [], tables: [], dialogs: [], truncated: true };
  }

  let truncated = false;
  const markTruncated = (): void => {
    truncated = true;
  };

  const interactiveElements = capArray(raw.interactiveElements, limits);
  if (interactiveElements.truncated) {
    truncated = true;
  }
  const forms = capArray(raw.forms, limits);
  if (forms.truncated) {
    truncated = true;
  }
  const tables = capArray(raw.tables, limits);
  if (tables.truncated) {
    truncated = true;
  }
  const dialogs = capArray(raw.dialogs, limits);
  if (dialogs.truncated) {
    truncated = true;
  }

  const normalizedInteractiveElements = interactiveElements.items
    .map((element) => normalizeInteractiveElement(element, limits, markTruncated))
    .filter((element): element is InteractiveElement => element !== undefined);

  return {
    interactiveElements: normalizedInteractiveElements,
    forms: forms.items.map(normalizeForm),
    tables: tables.items.map((table) => normalizeTable(table, limits, markTruncated)),
    dialogs: dialogs.items.map((dialog) => normalizeDialog(dialog, limits, markTruncated)),
    truncated,
  };
}
