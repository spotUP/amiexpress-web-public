/**
 * ESLint for the frontend.
 *
 * There was NO config anywhere in the repo, so `npm run lint` - which
 * package.json has always declared - could not run at all, while RULES.md
 * asks for zero lint warnings. A rule set nobody can execute is worse than a
 * small one that runs, so this starts at the errors that catch real bugs
 * (the hooks rules especially) rather than a style sweep over a codebase
 * this size.
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  // Scratch probe scripts live at the package root (test-mtop-socket.ts and
  // friends): one-off developer tools with hardcoded paths, not app code.
  ignorePatterns: [
    'dist', 'coverage', 'node_modules',
    '.eslintrc.cjs', '*.config.ts', '*.config.js',
    'test-*.ts',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
  rules: {
    // The codebase leans on `any` at the door/socket boundary, where the
    // payloads genuinely are untyped. Flagging every one would bury the
    // findings that matter.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
