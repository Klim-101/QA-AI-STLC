// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Emits one JSON Schema file per artifact kind into dist/json-schema/, from the built
// `artifactSchemas` registry (packages/schemas/src/artifacts.ts). Run after `tsc` as part of the
// schemas package's own `build` script, with the package directory as the working directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { artifactSchemas } from '../packages/schemas/dist/index.js';

const outDir = join(process.cwd(), 'dist', 'json-schema');
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(artifactSchemas)) {
  const jsonSchema = z.toJSONSchema(schema);
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(jsonSchema, null, 2)}\n`);
}

console.log(`Generated ${Object.keys(artifactSchemas).length} JSON Schema files in ${outDir}`);
