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

// Scheme and port are checked separately, against the environment's baseUrl (packages/core's
// browser-allowlist.ts compares URL.hostname, which is always port-stripped) -- an entry that
// looks like a full origin (a port suffix, a scheme prefix, a path) matches nothing at runtime and
// used to fail silently instead of being rejected here (#329).
const HOSTNAME_PATTERN =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export const EnvironmentConfigSchema = z.object({
  baseUrl: z.string().min(1),
  allowlist: z
    .array(
      z
        .string()
        .min(1)
        .regex(
          HOSTNAME_PATTERN,
          'must be a bare hostname, with no scheme, port or path -- for example "staging.example.com", not "staging.example.com:8080" or "https://staging.example.com"',
        ),
    )
    .min(1),
  // Off by default (P2-18): bypasses TLS certificate validation for this environment's HTTP and
  // browser traffic, for reaching a server behind a self-signed or internal-CA certificate.
  tlsInsecure: z.boolean().optional(),
  // Playwright's own default (30 seconds) applies when omitted (P6-23); a value that differs per
  // environment is a field here rather than a generic overrides block (ADR-011), for a staging
  // server that is consistently slower than a local one.
  navigationTimeoutMs: z.number().int().positive().optional(),
  actionTimeoutMs: z.number().int().positive().optional(),
});
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

export const IdentityAuthSchema = z.enum(['cdp-attach', 'storage-state']);
export type IdentityAuth = z.infer<typeof IdentityAuthSchema>;

// A missing selector falls back to `selectors.defaultLoginSelectors` (development plan section
// 6.2); given only when the application's login form does not match it.
export const LoginSelectorsSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  submit: z.string().min(1).optional(),
});
export type LoginSelectors = z.infer<typeof LoginSelectorsSchema>;

export const DefaultLoginSelectorsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  submit: z.string().min(1),
});
export type DefaultLoginSelectors = z.infer<typeof DefaultLoginSelectorsSchema>;

// The project-wide fallback (P6-23) used when neither an identity's own `selectors` nor its
// individual fields name one; today's hardcoded values, so a project with a non-standard login
// form can change them once instead of repeating an override on every identity.
export const DEFAULT_LOGIN_SELECTORS: DefaultLoginSelectors = {
  username:
    'input[type="email"], input[name="username"], input[id="username"], input[autocomplete="username"]',
  password: 'input[type="password"]',
  submit: 'button[type="submit"], input[type="submit"]',
};

// The name of an environment variable holding a credential, never the credential itself
// (AGENTS.md 5.8, 14): for example `QA_ADMIN_PASSWORD`. A literal secret cannot match this shape
// by accident, so writing one into the configuration fails validation.
export const QaVariableNameSchema = z
  .string()
  .regex(/^QA_[A-Z0-9_]+$/, 'must be a QA_-prefixed environment variable name');

export const IdentityConfigSchema = z
  .object({
    auth: IdentityAuthSchema,
    secret: QaVariableNameSchema,
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

export const ViewportSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ViewportSize = z.infer<typeof ViewportSizeSchema>;

// Desktop, tablet and mobile (development plan section 6.3.5): a locator candidate must resolve
// uniquely at each of these sizes, not only the one it was first observed at, to count as stable.
export const DEFAULT_STABILITY_VIEWPORTS: readonly ViewportSize[] = [
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
];

function isValidRegexSource(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

export const SelectorsConfigSchema = z.object({
  policy: SelectorPolicySchema,
  testIdAttribute: z.string().min(1),
  stabilityViewports: z
    .array(ViewportSizeSchema)
    .min(1)
    .default([...DEFAULT_STABILITY_VIEWPORTS]),
  defaultLoginSelectors: DefaultLoginSelectorsSchema.default(DEFAULT_LOGIN_SELECTORS),
  // Attributes, beyond `testIdAttribute`, synthesized as an extra CSS candidate when present — for
  // a project whose own convention marks an element stable without using a `data-testid`-style
  // attribute. Empty by default: no project convention is assumed.
  extraStableAttributes: z.array(z.string().min(1)).default([]),
  // An `id` matching one of these regular expressions (source text) is never used for the CSS
  // fallback candidate: a framework-generated id (React's `useId`, a CSS-module hash) looks unique
  // right now but is not stable across renders. Empty by default: no id is excluded.
  generatedIdPatterns: z
    .array(z.string().min(1).refine(isValidRegexSource, 'must be a valid regular expression'))
    .default([]),
});
export type SelectorsConfig = z.infer<typeof SelectorsConfigSchema>;

export const AgentsConfigSchema = z.object({
  parallelism: z.number().int().positive(),
  spokeTimeoutSeconds: z.number().int().positive(),
  retries: z.number().int().nonnegative(),
});
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

// Flaky detection (development plan section 6, "Quarantine mathematics" simplified per the
// deferred-features table): a case is flagged flaky from its own recorded history in `.qa/runs`,
// not a fixed formula — `historyWindow` and `minStatusChanges` are configurable thresholds.
export const FlakyDetectionConfigSchema = z.object({
  // How many of a case's most recent results to inspect.
  historyWindow: z.number().int().positive(),
  // How many status changes within that window flag the case as flaky.
  minStatusChanges: z.number().int().positive(),
});
export type FlakyDetectionConfig = z.infer<typeof FlakyDetectionConfigSchema>;

export const EvidenceConfigSchema = z.object({
  // Response bodies longer than this are stored truncated, with `truncated: true` set
  // (`qa.http_execute`); the secret scan still covers the whole stored preview.
  httpBodyPreviewMaxLength: z.number().int().positive(),
});
export type EvidenceConfig = z.infer<typeof EvidenceConfigSchema>;

export const DEFAULT_EVIDENCE_CONFIG: EvidenceConfig = { httpBodyPreviewMaxLength: 4000 };

// YAML reads an unquoted 2.1 as a number, so the message tells the author to quote it.
export const A11yWcagVersionSchema = z.enum(['2.0', '2.1', '2.2'], {
  error: 'must be the quoted string "2.0", "2.1" or "2.2"',
});
export type A11yWcagVersion = z.infer<typeof A11yWcagVersionSchema>;

export const A11yConformanceLevelSchema = z.enum(['A', 'AA', 'AAA']);
export type A11yConformanceLevel = z.infer<typeof A11yConformanceLevelSchema>;

const A11Y_LEVELS_ASCENDING: readonly A11yConformanceLevel[] = ['A', 'AA', 'AAA'];

/**
 * Conformance levels are cumulative: a target of `AA` covers every level A and level AA criterion,
 * so the levels a scan must check are all of them up to and including the target.
 */
export function listA11yLevelsUpTo(level: A11yConformanceLevel): readonly A11yConformanceLevel[] {
  return A11Y_LEVELS_ASCENDING.slice(0, A11Y_LEVELS_ASCENDING.indexOf(level) + 1);
}

// A known accessibility issue the team has accepted for now. It stays visible in reports as
// excepted rather than disappearing, and stops applying after `expires` (an ISO date, inclusive).
export const A11yExceptionSchema = z.object({
  ruleId: z.string().min(1),
  reason: z.string().min(1),
  expires: z.iso.date().optional(),
});
export type A11yException = z.infer<typeof A11yExceptionSchema>;

export const A11yConfigSchema = z.object({
  wcagVersion: A11yWcagVersionSchema.default('2.1'),
  level: A11yConformanceLevelSchema.default('AA'),
  // axe-core best-practice rules go beyond WCAG success criteria; off unless asked for.
  bestPractices: z.boolean().default(false),
  include: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
  exceptions: z.array(A11yExceptionSchema).default([]),
});
export type A11yConfig = z.infer<typeof A11yConfigSchema>;

export const DEFAULT_A11Y_CONFIG: A11yConfig = {
  wcagVersion: '2.1',
  level: 'AA',
  bestPractices: false,
  include: [],
  exclude: [],
  exceptions: [],
};

// RFC 9110 token characters: what a header name may contain.
const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const HeaderNameSchema = z.string().regex(HEADER_NAME_PATTERN, 'must be a valid HTTP header name');
const QueryParameterNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9._~-]+$/, 'must be a plain query parameter name');

// Where the engine reads a token from a live browser session, the way an operator would in
// developer tools (ADR-0012). `jsonPath` is a dot-separated path into a JSON value.
export const BrowserTokenSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cookie'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('local-storage'),
    key: z.string().min(1),
    jsonPath: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('session-storage'),
    key: z.string().min(1),
    jsonPath: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('request-header'),
    header: HeaderNameSchema.default('Authorization'),
  }),
]);
export type BrowserTokenSource = z.infer<typeof BrowserTokenSourceSchema>;

// A named way to authenticate an API call (ADR-0012). Every secret is the name of a `QA_*`
// variable, never a value; the engine resolves it at request time and an agent refers to the
// profile by name only.
export const ApiAuthProfileSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({
    type: z.literal('basic'),
    usernameVariable: QaVariableNameSchema,
    passwordVariable: QaVariableNameSchema,
  }),
  z.object({ type: z.literal('bearer'), tokenVariable: QaVariableNameSchema }),
  z
    .object({
      type: z.literal('api-key'),
      keyVariable: QaVariableNameSchema,
      in: z.enum(['header', 'query']),
      name: z.string().min(1),
    })
    // A header name and a query parameter name follow different grammars.
    .refine(
      (profile) =>
        (profile.in === 'header' ? HeaderNameSchema : QueryParameterNameSchema).safeParse(profile.name)
          .success,
      { message: '"name" is not a valid name for where the key is sent', path: ['name'] },
    ),
  z.object({
    type: z.literal('custom-headers'),
    headers: z
      .record(HeaderNameSchema, QaVariableNameSchema)
      .refine((headers) => Object.keys(headers).length > 0, {
        message: 'must name at least one header',
      }),
  }),
  z.object({
    type: z.literal('oauth2-client-credentials'),
    tokenUrl: z.url({ protocol: /^https?$/ }),
    clientIdVariable: QaVariableNameSchema,
    clientSecretVariable: QaVariableNameSchema,
    scope: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal('from-browser'), source: BrowserTokenSourceSchema }),
]);
export type ApiAuthProfile = z.infer<typeof ApiAuthProfileSchema>;

export const ApiAuthConfigSchema = z.object({
  profiles: z.record(z.string().min(1), ApiAuthProfileSchema).default({}),
  // The profile an environment's API calls use when the caller names none, keyed by environment.
  defaults: z.record(z.string().min(1), z.string().min(1)).default({}),
});
export type ApiAuthConfig = z.infer<typeof ApiAuthConfigSchema>;

export const DEFAULT_API_AUTH_CONFIG: ApiAuthConfig = { profiles: {}, defaults: {} };

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
    flaky: FlakyDetectionConfigSchema.default({ historyWindow: 10, minStatusChanges: 2 }),
    evidence: EvidenceConfigSchema.default(DEFAULT_EVIDENCE_CONFIG),
    a11y: A11yConfigSchema.default(DEFAULT_A11Y_CONFIG),
    apiAuth: ApiAuthConfigSchema.default(DEFAULT_API_AUTH_CONFIG),
  })
  // The testing scope survey (development plan section 2.7) is the single source of truth for
  // whether a contract or a source checkout is required; a config that claims API is in scope
  // without a contract source, or security code-assisted checks without `source.path`, would let
  // `qa doctor` pass while the pipeline has nothing to run against.
  .refine((config) => config.testing.api !== 'in-scope' || config.api !== undefined, {
    message: '"api" is required when testing.api is "in-scope"',
    path: ['api'],
  })
  .superRefine((config, context) => {
    for (const [environmentName, profileName] of Object.entries(config.apiAuth.defaults)) {
      if (!(environmentName in config.environments)) {
        context.addIssue({
          code: 'custom',
          message: `"${environmentName}" is not a configured environment`,
          path: ['apiAuth', 'defaults', environmentName],
        });
      }
      if (!(profileName in config.apiAuth.profiles)) {
        context.addIssue({
          code: 'custom',
          message: `"${profileName}" is not a configured apiAuth profile`,
          path: ['apiAuth', 'defaults', environmentName],
        });
      }
    }
  });
export type Config = z.infer<typeof ConfigSchema>;

export type ConfigSectionName = keyof Config;
export type ConfigSectionLayering = 'committed-only' | 'local-overridable';

/**
 * Which top-level sections the local configuration layer may set (ADR-011). A `Record` over every
 * section forces a new section to be classified when it is added; a section that feeds a gate, a
 * hash or generated code must stay `committed-only` so every machine produces the same results.
 */
export const CONFIG_SECTION_LAYERING: Readonly<Record<ConfigSectionName, ConfigSectionLayering>> = {
  schemaVersion: 'committed-only',
  testing: 'committed-only',
  source: 'local-overridable',
  api: 'committed-only',
  environments: 'local-overridable',
  identities: 'local-overridable',
  data: 'committed-only',
  selectors: 'committed-only',
  agents: 'local-overridable',
  flaky: 'committed-only',
  evidence: 'committed-only',
  // Sets what an accessibility report claims and feeds its hash, so every machine must agree.
  a11y: 'committed-only',
  // Names the variables, token endpoint and headers a credential is read from and sent to, so an
  // override file must not be able to redirect one (ADR-0012).
  apiAuth: 'committed-only',
};

/** True when `key` is a known section the local layer may set; unknown keys are never overridable. */
export function isLocalOverridableConfigSection(key: string): key is ConfigSectionName {
  const layeringBySection: Readonly<Record<string, ConfigSectionLayering>> = CONFIG_SECTION_LAYERING;
  return layeringBySection[key] === 'local-overridable';
}
