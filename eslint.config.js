import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

// Node 20+ ships with the Web platform fetch APIs (fetch, Response, Request,
// Headers, AbortController, AbortSignal). Plus the standard Node globals.
const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  Request: 'readonly',
  Headers: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  RequestInit: 'readonly',
  ResponseInit: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: nodeGlobals,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // TypeScript's parser already understands ambient globals via @types/node.
      // ESLint's no-undef is redundant and produces false positives.
      'no-undef': 'off',
    },
  },
  {
    // Root ESLint config covers backend code only. Each app under apps/ has
    // its own ESLint config (Next.js apps use `next lint`, for example).
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'apps/**'],
  },
];
