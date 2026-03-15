import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Fastify requires async plugin functions and handlers even without await
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    ignores: ['dist/'],
  },
);
