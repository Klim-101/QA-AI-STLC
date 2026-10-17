// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const DefectSeverityProposalSchema = z.enum(['blocker', 'critical', 'major', 'minor', 'trivial']);
export type DefectSeverityProposal = z.infer<typeof DefectSeverityProposalSchema>;

// `security` findings from the on-demand audit (development plan section 2.7) enter the same
// defect-acceptance and RCA flow as every other category.
export const DefectCategorySchema = z.enum([
  'functional',
  'ui',
  'accessibility',
  'api',
  'performance',
  'security',
]);
export type DefectCategory = z.infer<typeof DefectCategorySchema>;

export const DefectStatusSchema = z.enum(['draft', 'accepted', 'rejected']);
export type DefectStatus = z.infer<typeof DefectStatusSchema>;

export const SecurityConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type SecurityConfidence = z.infer<typeof SecurityConfidenceSchema>;

// Where in the source checkout a finding was seen. The path is project-relative; the line is
// absent when the evidence is a whole file or a package rather than one line.
export const SecurityCodeReferenceSchema = z.object({
  path: RelativePathSchema,
  line: z.number().int().positive().optional(),
});
export type SecurityCodeReference = z.infer<typeof SecurityCodeReferenceSchema>;

// The failed result a draft was written from. The engine holds a draft that names one to the
// triage of its run: only a failure the triage called a product bug can be drafted this way, and
// only with the evidence the triage cited for it.
export const DefectSourceSchema = z.object({
  runId: IdentifierSchema,
  resultId: IdentifierSchema,
});
export type DefectSource = z.infer<typeof DefectSourceSchema>;

// A defect draft is tracker-neutral (AGENTS.md 2.3, development plan section 2.4): the operator
// files it in their own tracker. The `security*` fields are populated only for
// `category: "security"` drafts produced by the on-demand audit.
export const DefectDraftSchema = z
  .object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    id: IdentifierSchema,
    title: z.string().min(1),
    severityProposal: DefectSeverityProposalSchema,
    category: DefectCategorySchema.describe(
      'Where the defect lies: functional, ui, accessibility, api, performance or security.',
    ),
    steps: z.array(z.string().min(1)).min(1).describe('The steps to reproduce, one plain string each.'),
    expectedResult: z.string().min(1),
    actualResult: z.string().min(1),
    environment: z.string().min(1),
    requirementIds: z.array(IdentifierSchema),
    evidencePaths: z
      .array(RelativePathSchema)
      .describe('Project-relative paths of evidence the engine registered; never a file made by hand.'),
    source: DefectSourceSchema.optional(),
    status: DefectStatusSchema.describe(
      'A new draft is always "draft"; the operator accepts it in a separate step.',
    ),
    createdAt: IsoDateTimeSchema,
    securityRiskArea: z.string().optional(),
    securityConfidence: SecurityConfidenceSchema.optional(),
    securitySuggestedRemediation: z.string().optional(),
    securityRegressionCheck: z.string().optional(),
    securityCodeReferences: z.array(SecurityCodeReferenceSchema).optional(),
  })
  .refine(
    (defect) =>
      defect.category === 'security' ||
      (defect.securityRiskArea === undefined && defect.securityCodeReferences === undefined),
    {
      message: 'security fields are only valid on a "security" category defect',
      path: ['securityRiskArea'],
    },
  );
export type DefectDraft = z.infer<typeof DefectDraftSchema>;
