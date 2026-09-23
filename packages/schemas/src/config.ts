// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { RelativePathSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const TestingScopeDecisionSchema = z.enum(['in-scope', 'out-of-scope', 'undecided']);
export type TestingScopeDecision = z.infer<typeof TestingScopeDecisionSchema>;

export const TestingScopeSchema = z.object({
  e2e: TestingScopeDecisionSchema,
  api: TestingScopeDecisionSchema,
  a11y: TestingScopeDecisionSchema,
  security: TestingScopeDecisionSchema,
});
export type TestingScope = z.infer<typeof TestingScopeSchema>;

export const SourceConfigSchema = z.object({
  path: RelativePathSchema,
});
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

// v1 supports an OpenAPI 3.x contract only (development plan section 2.7); GraphQL and other
// contract formats are deferred.
export const ApiConfigSchema = z.object({
  contract: z.literal('openapi'),
  source: z.union([z.string().min(1), z.literal('discover'), z.literal('synthesize')]),
});
export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export const EnvironmentConfigSchema = z.object({
  baseUrl: z.string().min(1),
  allowlist: z.array(z.string().min(1)).min(1),
  // Off by default (P2-18): bypasses TLS certificate validation for this environment's HTTP and
  // browser traffic, for reaching a server behind a self-signed or internal-CA certificate.
  tlsInsecure: z.boolean().optional(),
});
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

export const IdentityAuthSchema = z.enum(['cdp-attach', 'storage-state']);
export type IdentityAuth = z.infer<typeof IdentityAuthSchema>;

// A missing selector falls back to a generic default (development plan section 6.2); given only
// when the application's login form does not match it.
export const LoginSelectorsSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  submit: z.string().min(1).optional(),
});
export type LoginSelectors = z.infer<typeof LoginSelectorsSchema>;

export const IdentityConfigSchema = z
  .object({
    auth: IdentityAuthSchema,
    // The name of an environment variable holding the credential, never the credential itself
    // (AGENTS.md 5.8, 14): for example `QA_ADMIN_PASSWORD`.
    secret: z.string().regex(/^QA_[A-Z0-9_]+$/, 'must be a QA_-prefixed environment variable name'),
    // Scripted login only ("storage-state" auth, development plan section 6.2); "cdp-attach"
    // reuses a session the operator already signed into and needs neither.
    loginUrl: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    selectors: LoginSelectorsSchema.optional(),
  })
  .refine((identity) => identity.auth !== 'storage-state' || identity.loginUrl !== undefined, {
    message: '"loginUrl" is required when auth is "storage-state"',
    path: ['loginUrl'],
  })
  .refine((identity) => identity.auth !== 'storage-state' || identity.username !== undefined, {
    message: '"username" is required when auth is "storage-state"',
    path: ['username'],
  });
export type IdentityConfig = z.infer<typeof IdentityConfigSchema>;

export const DataStrategySchema = z.enum(['disposable', 'reset-endpoint', 'manual']);
export type DataStrategy = z.infer<typeof DataStrategySchema>;

export const DataConfigSchema = z.object({
  strategy: DataStrategySchema,
  ownerMarker: z.string().min(1),
});
export type DataConfig = z.infer<typeof DataConfigSchema>;

export const SelectorPolicySchema = z.enum(['playwright-default', 'testid-first', 'strict-no-css']);
export type SelectorPolicy = z.infer<typeof SelectorPolicySchema>;

export const SelectorsConfigSchema = z.object({
  policy: SelectorPolicySchema,
  testIdAttribute: z.string().min(1),
});
export type SelectorsConfig = z.infer<typeof SelectorsConfigSchema>;

export const AgentsConfigSchema = z.object({
  parallelism: z.number().int().positive(),
  spokeTimeoutSeconds: z.number().int().positive(),
  retries: z.number().int().nonnegative(),
});
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

export const ConfigSchema = z
  .object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    testing: TestingScopeSchema,
    source: SourceConfigSchema.optional(),
    api: ApiConfigSchema.optional(),
    environments: z.record(z.string().min(1), EnvironmentConfigSchema),
    identities: z.record(z.string().min(1), IdentityConfigSchema),
    data: DataConfigSchema,
    selectors: SelectorsConfigSchema,
    agents: AgentsConfigSchema,
  })
  // The testing scope survey (development plan section 2.7) is the single source of truth for
  // whether a contract or a source checkout is required; a config that claims API is in scope
  // without a contract source, or security code-assisted checks without `source.path`, would let
  // `qa doctor` pass while the pipeline has nothing to run against.
  .refine((config) => config.testing.api !== 'in-scope' || config.api !== undefined, {
    message: '"api" is required when testing.api is "in-scope"',
    path: ['api'],
  });
export type Config = z.infer<typeof ConfigSchema>;
