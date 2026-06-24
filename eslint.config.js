// Flat ESLint config for the Madav packages (the to-be brain). Run: npx eslint packages
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['packages/**/*.ts'], rules: { 'no-empty': ['error', { allowEmptyCatch: false }], '@typescript-eslint/no-explicit-any': 'off' } },
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/**', 'src/**', 'electron/**', 'server/**', 'core/**'] },
);
