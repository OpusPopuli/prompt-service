module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['sonarjs'],
  extends: ['plugin:sonarjs/recommended'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  rules: {
    'sonarjs/cognitive-complexity': ['error', 15],
  },
  overrides: [
    {
      files: ['**/*.spec.ts', 'test/**/*.ts'],
      rules: {
        'sonarjs/no-duplicate-string': 'off',
      },
    },
  ],
};
