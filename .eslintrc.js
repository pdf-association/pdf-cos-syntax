// eslint-disable-next-line no-undef
module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
		"@typescript-eslint/eslint-plugin",
		"eslint-plugin-tsdoc"
	],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
	],
	rules: {
		'semi': [2, "always"],
		'@typescript-eslint/no-unused-vars': 0,
		'@typescript-eslint/no-explicit-any': 0,
		"tsdoc/syntax": "warn"
	}
};
