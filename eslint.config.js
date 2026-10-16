// ESLint flat config: type-aware basics + React hooks. No formatting rules
// (Prettier owns formatting — see .prettierrc).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'src-tauri/target/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Console output is intentional in services (error paths), not noise.
      'no-console': 'off',
      // The codebase predates strict null discipline; keep any-errors loud
      // but don't fail the build on them yet — fix incrementally.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Fetch-on-mount effects are the codebase's standard data-loading
      // idiom; the rule's cascading-render concern doesn't apply to them.
      'react-hooks/set-state-in-effect': 'off',
    },
  }
);
