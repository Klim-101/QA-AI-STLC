// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { type ApiDiffFinding, type ApiEndpoint, type ApiSurface } from '@qa-ai-stlc/schemas';

// Parameter names differ between a contract (`{taskId}`) and a templated observation (`{id}`), so
// the comparison key collapses every `{...}` segment to `{}`.
function comparablePath(path: string): string {
  return path.replace(/\{[^}/]*\}/gu, '{}');
}

function compareFindings(a: ApiDiffFinding, b: ApiDiffFinding): number {
  return a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
}

/**
 * Classifies each discrepancy between a contract's endpoints and the discovered `ApiSurface`
 * (P6-02). An observed endpoint is `matched`, `method-not-documented` (its path is in the
 * contract under other methods) or `undocumented`; a contract endpoint never observed is
 * `unobserved`. Output is sorted for stable, diffable reports.
 */
export function diffApiSurface(contract: readonly ApiEndpoint[], observed: ApiSurface): ApiDiffFinding[] {
  const contractByKey = new Map<string, ApiEndpoint>();
  const contractPaths = new Set<string>();
  for (const endpoint of contract) {
    const path = comparablePath(endpoint.path);
    contractByKey.set(`${endpoint.method} ${path}`, endpoint);
    contractPaths.add(path);
  }

  const findings: ApiDiffFinding[] = [];
  const seen = new Set<string>();
  for (const endpoint of observed.endpoints) {
    const path = comparablePath(endpoint.path);
    const key = `${endpoint.method} ${path}`;
    seen.add(key);
    const inContract = contractByKey.get(key);
    const examples = endpoint.examples === undefined ? {} : { examples: endpoint.examples };
    if (inContract !== undefined) {
      findings.push({
        kind: 'matched',
        method: endpoint.method,
        path: endpoint.path,
        ...(inContract.path === endpoint.path ? {} : { contractPath: inContract.path }),
        ...examples,
      });
    } else {
      findings.push({
        kind: contractPaths.has(path) ? 'method-not-documented' : 'undocumented',
        method: endpoint.method,
        path: endpoint.path,
        ...examples,
      });
    }
  }
  for (const [key, endpoint] of contractByKey) {
    if (!seen.has(key)) {
      findings.push({ kind: 'unobserved', method: endpoint.method, path: endpoint.path });
    }
  }
  return findings.sort(compareFindings);
}
