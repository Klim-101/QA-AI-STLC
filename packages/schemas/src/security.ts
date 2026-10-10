// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { DefectSeverityProposalSchema, SecurityConfidenceSchema } from './defect.js';
import { IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const SECURITY_CHECK_CLASSES = [
  'headers',
  'cookies',
  'cors',
  'csrf',
  'authz',
  'session',
  'encoding',
  'errors',
] as const;
export const SecurityCheckClassSchema = z.enum(SECURITY_CHECK_CLASSES);
export type SecurityCheckClass = z.infer<typeof SecurityCheckClassSchema>;

// A path on the audited host: absolute-path form only, so an authorization can never name another
// host or a protocol-relative URL (`//host/x`), whatever the environment's allowlist says.
const AuthorizedPathSchema = z
  .string()
  .refine(
    (value) =>
      value.startsWith('/') && !value.startsWith('//') && !/\s/u.test(value) && !value.includes('\\'),
    'must be an absolute path on the audited host, such as "/admin/users"',
  );

export const SecurityMutationMethodSchema = z.enum(['POST', 'PUT', 'PATCH', 'DELETE']);

// The only requests an audit may send that are not GET, HEAD or OPTIONS (development plan 2.7,
// AGENTS.md 12.4). Each one is an exact method and path with a stated reason, so the operator
// approves the precise side effect rather than a class of behavior.
export const SecurityAllowedMutationSchema = z.object({
  method: SecurityMutationMethodSchema,
  path: AuthorizedPathSchema,
  reason: z.string().min(1),
  // A complete request the operator vouches for as harmless (a record carrying the project's owner
  // marker, for instance). The CSRF check sends it without any token: only a request that would
  // succeed is a fair test, because an empty body is refused for reasons that have nothing to do
  // with CSRF. Without it the check can report only `uncertain`.
  body: z.string().min(1).optional(),
  contentType: z.string().min(1).optional(),
});
export type SecurityAllowedMutation = z.infer<typeof SecurityAllowedMutationSchema>;

// `low` is the identity whose access the audit probes; `high` is the identity that may reach what
// `low` must not. Authorization-boundary checks compare the two.
export const SecurityIdentityRoleSchema = z.enum(['low', 'high']);

export const SecurityAuthorizationSchema = z
  .object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    // A snapshot of the environment the operator authorized. The audit refuses to start when the
    // live configuration no longer matches it: consent given for one target is not consent for another.
    environment: z.object({
      name: IdentifierSchema,
      baseUrl: z.string().min(1),
      allowlist: z.array(z.string().min(1)).min(1),
    }),
    checks: z.array(SecurityCheckClassSchema).min(1),
    identities: z.array(z.object({ name: IdentifierSchema, role: SecurityIdentityRoleSchema })),
    prohibitedActions: z.array(z.string().min(1)).min(1),
    allowedMutations: z.array(SecurityAllowedMutationSchema).default([]),
    restrictedRoutes: z.array(AuthorizedPathSchema).default([]),
    logoutPath: AuthorizedPathSchema.optional(),
    rateLimit: z.object({
      requestsPerSecond: z.number().positive(),
      maxRequests: z.number().int().positive(),
    }),
    createdAt: IsoDateTimeSchema,
  })
  .refine((authorization) => new Set(authorization.checks).size === authorization.checks.length, {
    message: 'each check class may be listed once',
    path: ['checks'],
  })
  .refine(
    (authorization) =>
      new Set(authorization.identities.map((identity) => identity.name)).size ===
      authorization.identities.length,
    { message: 'each identity may be listed once', path: ['identities'] },
  );
export type SecurityAuthorization = z.infer<typeof SecurityAuthorizationSchema>;

export const SecurityCheckStatusSchema = z.enum(['passed', 'failed', 'skipped', 'blocked', 'uncertain']);
export type SecurityCheckStatus = z.infer<typeof SecurityCheckStatusSchema>;

export const SecurityFindingSchema = z.object({
  id: IdentifierSchema,
  checkClass: SecurityCheckClassSchema,
  riskArea: z.string().min(1),
  confidence: SecurityConfidenceSchema,
  severityProposal: DefectSeverityProposalSchema,
  title: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  expectedResult: z.string().min(1),
  actualResult: z.string().min(1),
  remediation: z.string().min(1),
  regressionCheck: z.string().min(1),
  /** Positions in the audit's request log that demonstrate the finding. */
  requestIndexes: z.array(z.number().int().nonnegative()),
});
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityRequestOutcomeSchema = z.enum(['sent', 'refused']);

// One line of the audit's request log. The URL is stored with query values removed and never
// carries a credential; `refused` records a request the probe did not send and why.
export const SecurityRequestLogEntrySchema = z.object({
  method: z.string().min(1),
  url: z.string().min(1),
  outcome: SecurityRequestOutcomeSchema,
  status: z.number().int().optional(),
  reason: z.string().optional(),
});
export type SecurityRequestLogEntry = z.infer<typeof SecurityRequestLogEntrySchema>;

export const SecurityAuditResultSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  auditId: IdentifierSchema,
  environment: IdentifierSchema,
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema,
  /** `partial` means the audit stopped early (request budget) or a check was blocked: not a clean bill. */
  status: z.enum(['completed', 'partial']),
  stoppedReason: z.string().optional(),
  checks: z.array(
    z.object({
      checkClass: SecurityCheckClassSchema,
      status: SecurityCheckStatusSchema,
      note: z.string().optional(),
      findingIds: z.array(IdentifierSchema),
    }),
  ),
  findings: z.array(SecurityFindingSchema),
  requests: z.array(SecurityRequestLogEntrySchema),
});
export type SecurityAuditResult = z.infer<typeof SecurityAuditResultSchema>;
