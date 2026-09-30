// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { loadApiContract, loadConfig, snapshotApiContract, type Runner } from '@qa-ai-stlc/core';
import { runPlaywrightSpecs } from '@qa-ai-stlc/runner-playwright';
import { assertApiSpecsInContract } from './check-api-specs.js';

/**
 * Runs `api` specs (Playwright `APIRequestContext`) through the shared Playwright mechanics after
 * checking every case against the configured contract (P6-04). Nothing is sent to the application
 * until the whole spec set passes the check; the contract text is then snapshotted into the
 * manifest so the hash the run relied on is on record.
 */
export const apiRunner: Runner = {
  testType: 'api',
  async run(engine, input) {
    const config = await loadConfig(engine);
    const contract = await loadApiContract(engine, config, input.environment);
    await assertApiSpecsInContract(engine, input.specFiles, contract);
    await snapshotApiContract(engine, contract);
    return runPlaywrightSpecs(engine, input, 'api');
  },
};
