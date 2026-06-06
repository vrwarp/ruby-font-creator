import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['frontend/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['frontend/public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    ignores: [
      'build/',
      'dist/',
      'dist-web/',
      'node_modules/',
      'scratch/',
      'frontend/public/',
      '**/*.timestamp-*',
    ],
  },
)
