// @ts-check

// eslint.config.mjs
// see https://github.com/typescript-eslint/typescript-eslint/blob/main/eslint.config.mjs

import url from 'node:url';

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import deprecationPlugin from 'eslint-plugin-deprecation';
import eslintCommentsPlugin from 'eslint-plugin-eslint-comments';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import tsdocPlugin from 'eslint-plugin-tsdoc';
import globals from 'globals';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export default tseslint.config(
  // register all of the plugins up-front
  {
    plugins: {
      ['@typescript-eslint']: tseslint.plugin,
      ['deprecation']: deprecationPlugin,
      ['eslint-comments']: eslintCommentsPlugin,
      ['jsdoc']: jsdocPlugin
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**'
    ],
  },

  // extends ...
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsdocPlugin.configs['flat/recommended-typescript-error'],

  // base config
  {
    languageOptions: {
      globals: {
        ...globals.es2020,
        ...globals.node,
      },
      parserOptions: {
        allowAutomaticSingleRunInference: true,
        project: [
          'tsconfig.json',
        ],
        tsconfigRootDir: __dirname,
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },

    rules: {
      // avoid deprecated APIs
      'deprecation/deprecation': 'error',

      // TODO(#7130): Investigate changing these in or removing these from presets
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/prefer-string-starts-ends-with': 'off',

      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 5,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: true },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowIIFEs: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-constant-condition': 'off',
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: true },
      ],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/prefer-literal-enum-member': [
        'error',
        {
          allowBitwiseExpressions: true,
        },
      ],
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
          allowAny: true,
          allowNullish: true,
          allowRegExp: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          caughtErrors: 'all',
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        {
          ignoreConditionalTests: true,
          ignorePrimitives: true,
        },
      ],

      curly: ['error', 'all'],
      eqeqeq: [
        'error',
        'always',
        {
          null: 'never',
        },
      ],
      'logical-assignment-operators': 'error',
      'no-else-return': 'error',
      'no-mixed-operators': 'error',
      'no-console': 'off',
      'no-process-exit': 'error',
      'no-fallthrough': [
        'error',
        { commentPattern: '.*intentional fallthrough.*' },
      ],
      'one-var': ['error', 'never'],

      // require a eslint-enable comment for every eslint-disable comment
      'eslint-comments/disable-enable-pair': [
        'error',
        {
          allowWholeFile: true,
        },
      ],
      'eslint-comments/no-aggregating-enable': 'error',
      'eslint-comments/no-duplicate-disable': 'error',
      'eslint-comments/no-unlimited-disable': 'error',
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/no-unused-enable': 'error',
      'eslint-comments/no-use': [
        'error',
        {
          allow: [
            'eslint-disable',
            'eslint-disable-line',
            'eslint-disable-next-line',
            'eslint-enable',
            'global',
          ],
        },
      ],

      // We often use @todo or other ad-hoc tag names
      'jsdoc/check-tag-names': 'off',
      'jsdoc/check-param-names': 'warn',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'warn',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-yields': 'off',
      'jsdoc/tag-lines': 'off'
    }
  }
);
