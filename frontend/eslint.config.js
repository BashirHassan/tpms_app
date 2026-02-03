/**
 * ESLint Configuration for DigitalTP Frontend
 * 
 * This configuration disallows native alert, confirm, and prompt dialogs
 * in favor of the custom Dialog and AlertDialog components.
 */

export default {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  settings: {
    react: {
      version: '18.2',
    },
  },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // Disallow native alert, confirm, and prompt
    'no-alert': 'error',
    // Additional helpful rules
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'react/prop-types': 'off',
  },
};
