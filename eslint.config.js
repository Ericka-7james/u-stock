import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 🌵 Global ignores for flat config (replaces .eslintignore)
  globalIgnores([
    'dist',
    'coverage',
    'coverage/**',
    'node_modules',
  ]),

  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // allow intentionally-unused UPPER_SNAKE_CASE vars (like ENV-style constants)
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },

  // 🔥 Vitest / Jest-style test environment
  {
    files: [
      '**/*.test.js',
      '**/*.test.jsx',
      '**/__tests__/**/*.[jt]s?(x)',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,  // describe / it / expect / beforeEach / etc.
        vi: 'readonly',   // vitest mock function
      },
    },
  },
])
