// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IsoDateTimeSchema, SourceLocationSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// Sitemap discovery has no referrer inside the crawled page graph; a link click always does
// (development plan section 6.3 step 2). `static` (P1-19) has neither: it comes from a client-side
// router declaration in source, never a live navigation. The last three are how a single-page
// application's routes are found without an `<a href>` (P6-78, ADR-0015): a router attribute on the
// page, a URL the page pushed through the History API, and the URL a probed control navigated to.
export const RouteDiscoveryMethodSchema = z.enum([
  'link',
  'sitemap',
  'static',
  'router-attribute',
  'history-api',
  'click-probe',
]);
export type RouteDiscoveryMethod = z.infer<typeof RouteDiscoveryMethodSchema>;

export const DiscoveredRouteSchema = z.object({
  url: z.string().min(1),
  discoveredVia: RouteDiscoveryMethodSchema,
  discoveredFrom: z.string().min(1).optional(),
  httpStatus: z.number().int().optional(),
  // Set only for `discoveredVia: 'static'`: where the route declaration was found, since there is
  // no live navigation to point at instead.
  sourceLocation: SourceLocationSchema.optional(),
});
export type DiscoveredRoute = z.infer<typeof DiscoveredRouteSchema>;

// The crawler's own output (development plan section 6.3 step 2): every URL it reached while
// staying inside the configured domain allowlist. Page analysis (section 6.3 step 3) and the
// selector registry (step 6) are built from this in later phases, not by the crawler itself.
export const RouteMapSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  startUrl: z.string().min(1),
  routes: z.array(DiscoveredRouteSchema),
});
export type RouteMap = z.infer<typeof RouteMapSchema>;
