// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ManualRegion } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';

const MANUAL_REGION_START_PREFIX = '// qa:manual:start';
const MANUAL_REGION_END_PREFIX = '// qa:manual:end';

// A trailing space is required before an id (`// qa:manual:start x`), so an unrelated comment that
// merely starts with the same words (`// qa:manual:starting soon`) never matches; an exact match
// with no id at all (`// qa:manual:start`) is still recognized, with an empty id, so it is rejected
// by its caller instead of silently read as ordinary content.
function manualMarkerId(line: string, prefix: string): string | undefined {
  const trimmed = line.trim();
  if (trimmed === prefix) {
    return '';
  }
  return trimmed.startsWith(`${prefix} `) ? trimmed.slice(prefix.length + 1).trim() : undefined;
}

/**
 * Reads every `// qa:manual:start <id>` / `// qa:manual:end <id>` block out of a generated spec's
 * source, in file order. A spoke's retry loop (P3-06) and a later `qa upgrade` (P7-01) call this on
 * the file about to be overwritten, then pass the result to `applyManualRegions` so hand-written
 * additions survive regeneration.
 */
export function extractManualRegions(source: string): readonly ManualRegion[] {
  const regions: ManualRegion[] = [];
  const seenIds = new Set<string>();
  let openId: string | undefined;
  let contentLines: string[] = [];

  for (const line of source.split('\n')) {
    const startId = manualMarkerId(line, MANUAL_REGION_START_PREFIX);
    const endId = manualMarkerId(line, MANUAL_REGION_END_PREFIX);

    if (startId !== undefined) {
      if (openId !== undefined) {
        throw new QaError(
          'core.manual_regions.nested_region',
          `"qa:manual:start ${startId}" opens before "qa:manual:end ${openId}" closes`,
        );
      }
      if (startId === '') {
        throw new QaError('core.manual_regions.missing_id', '"qa:manual:start" has no id');
      }
      openId = startId;
      contentLines = [];
      continue;
    }

    if (endId !== undefined) {
      if (openId === undefined) {
        throw new QaError(
          'core.manual_regions.unmatched_end',
          `"qa:manual:end ${endId}" has no matching "qa:manual:start"`,
        );
      }
      if (endId !== openId) {
        throw new QaError(
          'core.manual_regions.mismatched_end',
          `"qa:manual:end ${endId}" does not match the open "qa:manual:start ${openId}"`,
        );
      }
      if (seenIds.has(openId)) {
        throw new QaError('core.manual_regions.duplicate_id', `duplicate "qa:manual" region id "${openId}"`);
      }
      seenIds.add(openId);
      regions.push({ id: openId, content: contentLines.join('\n') });
      openId = undefined;
      continue;
    }

    if (openId !== undefined) {
      contentLines.push(line);
    }
  }

  if (openId !== undefined) {
    throw new QaError(
      'core.manual_regions.unclosed_region',
      `"qa:manual:start ${openId}" is never closed by a matching "qa:manual:end"`,
    );
  }

  return regions;
}

/**
 * Splices previously preserved `// qa:manual` regions into a freshly generated template, replacing
 * each marker pair's placeholder content with the matching region from `existingRegions`. A region
 * whose marker the newly generated template no longer has is a real loss of hand-written code, not
 * a silent drop, so it fails loudly instead.
 */
export function applyManualRegions(templateSource: string, existingRegions: readonly ManualRegion[]): string {
  const templateRegionIds = new Set(extractManualRegions(templateSource).map((region) => region.id));
  const duplicateIds = existingRegions
    .map((region) => region.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new QaError(
      'core.manual_regions.duplicate_id',
      `duplicate "qa:manual" region id: ${Array.from(new Set(duplicateIds)).join(', ')}`,
    );
  }
  const droppedIds = existingRegions.map((region) => region.id).filter((id) => !templateRegionIds.has(id));
  if (droppedIds.length > 0) {
    throw new QaError(
      'core.manual_regions.dropped',
      `regenerated spec no longer has a "qa:manual" marker for: ${droppedIds.join(', ')}`,
      {
        remediation:
          'Keep the marker in the generated template, or move the preserved code out before regenerating.',
      },
    );
  }

  const preservedById = new Map(existingRegions.map((region) => [region.id, region.content]));
  const output: string[] = [];
  let openId: string | undefined;

  for (const line of templateSource.split('\n')) {
    const startId = manualMarkerId(line, MANUAL_REGION_START_PREFIX);
    const endId = manualMarkerId(line, MANUAL_REGION_END_PREFIX);

    if (startId !== undefined) {
      openId = startId;
      output.push(line);
      const preserved = preservedById.get(startId);
      if (preserved !== undefined) {
        output.push(preserved);
      }
      continue;
    }

    if (endId !== undefined) {
      openId = undefined;
      output.push(line);
      continue;
    }

    if (openId !== undefined && preservedById.has(openId)) {
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}
