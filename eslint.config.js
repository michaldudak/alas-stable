import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{ ignores: ['dist/**', 'artifacts/**', 'node_modules/**'] },
	js.configs.recommended,
	tseslint.configs.recommended,
	{
		files: ['**/*.{js,mjs,ts}'],
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_' },
			],
		},
	},
	prettier,
);
