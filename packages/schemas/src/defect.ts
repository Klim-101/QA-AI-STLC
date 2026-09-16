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

// A defect draft is tracker-neutral (AGENTS.md 2.3, development plan section 2.4): the operator
// files it in their own tracker. The `security*` fields are populated only for
// `category: "security"` drafts produced by the on-demand audit.
export const DefectDraftSchema = z
  .object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    id: IdentifierSchema,
    title: z.string().min(1),
    severityProposal: DefectSeverityProposalSchema,
    category: DefectCategorySchema,
    steps: z.array(z.string().min(1)).min(1),
    expectedResult: z.string().min(1),
    actualResult: z.string().min(1),
    environment: z.string().min(1),
    requirementIds: z.array(IdentifierSchema),
    evidencePaths: z.array(RelativePathSchema),
    status: DefectStatusSchema,
    createdAt: IsoDateTimeSchema,
    securityRiskArea: z.string().optional(),
    securityConfidence: SecurityConfidenceSchema.optional(),
    securitySuggestedRemediation: z.string().optional(),
    securityRegressionCheck: z.string().optional(),
  })
  .refine((defect) => defect.category === 'security' || defect.securityRiskArea === undefined, {
    message: 'security fields are only valid on a "security" category defect',
    path: ['securityRiskArea'],
  });
export type DefectDraft = z.infer<typeof DefectDraftSchema>;
