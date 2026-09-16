// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const SPDX_HEADER_LINES = ['// Copyright The QA-AI-STLC Authors', '// SPDX-License-Identifier: Apache-2.0'];

// AGENTS.md 9.1 requires this header on every source file; there is no ESLint flat-config
// plugin for it that is both maintained and dependency-free, so it is a small local rule.
const spdxHeaderRule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      missing: 'Add the Apache-2.0 SPDX header required by AGENTS.md section 9.1.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const sourceCode = context.sourceCode;
        // Compare after normalizing line endings: a Windows checkout can leave CRLF on disk for
        // a file whose committed blob is LF, and the header check should not depend on that.
        const text = sourceCode.getText().replace(/\r\n/g, '\n');
        if (!text.startsWith(SPDX_HEADER_LINES.join('\n'))) {
          context.report({
            node,
            messageId: 'missing',
            fix: (fixer) => fixer.insertTextBefore(node, `${SPDX_HEADER_LINES.join('\n')}\n\n`),
          });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    // docs/dev is local, git-ignored maintainer tooling (AGENTS.md section 3); it is never
    // committed or reviewed, so repository lint rules do not apply to it.
    ignores: ['**/dist/**', '**/node_modules/**', 'adapters/**', '**/coverage/**', 'docs/dev/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    plugins: { local: { rules: { 'spdx-header': spdxHeaderRule } } },
    rules: { 'local/spdx-header': 'error' },
  },
  eslintConfigPrettier,
);
