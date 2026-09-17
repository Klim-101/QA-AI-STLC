// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IsoDateTimeSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// Page-derived content is untrusted (development plan section 2.6): every string here has passed
// through the explorer's length caps before reaching this schema, and the tree itself is capped
// in node count. This schema records structural signals only — role, name, interactive state —
// never a "state" judgment like empty/loading/error, which stays an interpretation for the agent
// layer, not a determinstic classification the engine could get wrong silently.
export const AccessibilityNodeSchema: z.ZodType<AccessibilityNode> = z.lazy(() =>
  z.object({
    role: z.string().min(1),
    name: z.string().optional(),
    text: z.string().optional(),
    checked: z.boolean().optional(),
    disabled: z.boolean().optional(),
    expanded: z.boolean().optional(),
    pressed: z.boolean().optional(),
    selected: z.boolean().optional(),
    children: z.array(AccessibilityNodeSchema).optional(),
  }),
);
// Every optional field's type includes `| undefined` explicitly, matching zod's own `_output`
// shape exactly: `exactOptionalPropertyTypes` treats an optional key typed only `T` as
// incompatible with one zod (or any caller) may assign `undefined` to.
export interface AccessibilityNode {
  role: string;
  name?: string | undefined;
  text?: string | undefined;
  checked?: boolean | undefined;
  disabled?: boolean | undefined;
  expanded?: boolean | undefined;
  selected?: boolean | undefined;
  pressed?: boolean | undefined;
  children?: AccessibilityNode[] | undefined;
}

export const InteractiveElementKindSchema = z.enum(['button', 'link', 'input', 'select', 'textarea']);
export type InteractiveElementKind = z.infer<typeof InteractiveElementKindSchema>;

export const InteractiveElementSchema = z.object({
  kind: InteractiveElementKindSchema,
  accessibleName: z.string().optional(),
  testId: z.string().optional(),
});
export type InteractiveElement = z.infer<typeof InteractiveElementSchema>;

export const FormFieldSchema = z.object({
  name: z.string().optional(),
  type: z.string().min(1),
  required: z.boolean(),
});
export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchema = z.object({
  action: z.string().optional(),
  method: z.string().min(1),
  fields: z.array(FormFieldSchema),
});
export type Form = z.infer<typeof FormSchema>;

export const TableSchema = z.object({
  columnHeaders: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
});
export type Table = z.infer<typeof TableSchema>;

export const DialogSchema = z.object({
  accessibleName: z.string().optional(),
  open: z.boolean(),
});
export type Dialog = z.infer<typeof DialogSchema>;

export const PageModelSchema = z.object({
  url: z.string().min(1),
  accessibilityTree: AccessibilityNodeSchema,
  interactiveElements: z.array(InteractiveElementSchema),
  forms: z.array(FormSchema),
  tables: z.array(TableSchema),
  dialogs: z.array(DialogSchema),
  // Set when a length or node-count cap actually cut something, so a caller can tell a complete
  // model from one the untrusted-data caps had to shrink (development plan section 2.6).
  truncated: z.boolean(),
});
export type PageModel = z.infer<typeof PageModelSchema>;

export const PageModelSetSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  pages: z.array(PageModelSchema),
});
export type PageModelSet = z.infer<typeof PageModelSetSchema>;
