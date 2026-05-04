/**
 * Jest config for the SDK package.
 *
 * Without this file, jest defaults to babel-jest for `.ts` files, which
 * can't parse TypeScript-only syntax like `expr as Type` and dies on
 * every test. ts-jest handles the full TS grammar so the test files
 * already in `test/` and `tests/unit/` actually run.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: [
    '<rootDir>/test/**/*.test.ts',
    '<rootDir>/tests/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-esm/',
    '/dist-cjs/',
  ],
  // History note: when this config first landed (2026-05-04), six legacy
  // test files were skip-listed here because they referenced SDK APIs
  // that had drifted (Textbox.name, List.ritems, GraphicsEngine.moveCamera,
  // Question.ask 2-arg form, gravity-as-vector, InputEngine.mapKey/addMacro,
  // single-arg physics.onCollision). All six were repaired or rewritten the
  // same day. Four individual `.skip()`'d tests remain in the suites
  // themselves — see the in-test comments for why.
  // Most SDK tests construct blessed Screens; CJS via ts-jest matches
  // how the package is built (tsconfig.json sets module: 'commonjs').
  // No transformIgnorePatterns override needed for now — the bare
  // ts-jest preset handles every TS file in test/ + tests/.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      // Tests don't need declaration files or strict declaration emit.
      diagnostics: {
        // Silence "TS18002: 'files' list cannot be empty" if a test
        // touches a path tsconfig.json doesn't include explicitly.
        ignoreCodes: [18002, 18003],
      },
    }],
  },
};
