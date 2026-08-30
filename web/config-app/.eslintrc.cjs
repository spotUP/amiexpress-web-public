/**
 * ESLint for the admin app.
 *
 * `npm run lint` has been declared in package.json since the app was created
 * and could never run: there was no config here, so it exited with "ESLint
 * couldn't find a configuration file". This mirrors web/frontend's rule set
 * so both packages are linted the same way.
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist', 'coverage', 'node_modules',
    '.eslintrc.cjs', '*.config.ts', '*.config.js',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
  rules: {
    // The API client and several page forms carry `any` at the request and
    // response boundary, where the payloads genuinely are untyped. Flagging
    // every one would bury the findings that matter.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    // This is a terminal admin: ESC (\x1b) in a regular expression is the
    // subject matter, not a typo. Every hit was an ANSI parser.
    'no-control-regex': 'off',
  },
};
