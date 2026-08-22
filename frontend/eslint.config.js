/**
 * ESLint Configuration for DigitalTP Frontend (flat config)
 *
 * Notably, this disallows native alert, confirm, and prompt dialogs
 * in favor of the custom Dialog and AlertDialog components.
 */

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/tinymce/**', 'coverage/**'],
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    settings: {
      react: { version: '18.2' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,

      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Disallow native alert, confirm, and prompt
      'no-alert': 'error',
      // Additional helpful rules - debug is allowed for intentional low-noise
      // diagnostics (hidden by default in browser consoles)
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
      'react/prop-types': 'off',
      // Unused function args are common in (value, row, index) style callbacks
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_|^err$|^error$',
      }],
    },
  },

  // Fast Refresh requires a module to export *only* components. Three areas
  // legitimately break that and splitting them would be churn for no benefit:
  //   - context/: provider + its consumer hook are colocated by convention
  //   - components/ui/: primitives ship with their cva variants and helpers
  //     (Button + buttonVariants, DataTable + columnHelpers), the shadcn pattern
  //   - *.examples.jsx: reference files that are never rendered
  // The rule still applies to every page and feature component, where an HMR
  // reload actually costs the developer state.
  {
    files: [
      'src/context/**/*.jsx',
      'src/components/ui/**/*.jsx',
      '**/*.examples.jsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Build/tooling files run in Node, not the browser
  {
    files: ['*.config.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
