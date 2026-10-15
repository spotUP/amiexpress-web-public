/**
 * Turns the backend's running commentary off during tests.
 *
 * WHY
 * ---
 * `src/` carries 2,967 `console.log` calls, and jest prints each one as a
 * five-line block: the level, the originating stack frame, the message, a
 * blank line. One run of `tests/doors` produced 29,036 of them - 6.2 MB of
 * log for 146 suites - and a redirected full run costs hundreds of MB. About
 * 10 GB of dead logs accumulated across three sessions on 2026-09-06, on a
 * disk that was already down to 287 MiB.
 *
 * WHAT IS KEPT
 * ------------
 * `console.warn` and `console.error` are untouched. They are where a swallowed
 * exception explains itself, and a test that fails with no explanation is
 * worse than a large log. Only the informational levels - `log`, `info`,
 * `debug` - are dropped, and they come back in full with `TEST_VERBOSE=1`:
 *
 *     TEST_VERBOSE=1 npx jest --config dev-scripts/jest.config.ts --rootDir . <path>
 *
 * Jest's own output is not affected by any of this: failure messages, expect
 * diffs and stack traces are reported, not logged.
 *
 * WHAT WAS REJECTED
 * -----------------
 * `silent: true` in the jest config: one flag, and it takes `console.error`
 * with it, which is exactly the output a failing test's diagnosis depends on.
 * A custom `testEnvironment` that buffers every level and flushes it only for
 * a test that FAILED is the better answer - nothing lost, nothing printed on
 * green - but swapping the environment under all 693 suites is its own
 * change, not a cleanup. It is the follow-up if the levels kept here still
 * turn out to be too loud.
 */
const QUIET_LEVELS = ['log', 'info', 'debug'] as const;

const verbose = process.env.TEST_VERBOSE === '1' || process.env.TEST_VERBOSE === 'true';

if (!verbose) {
  const target = console as unknown as Record<string, unknown>;
  for (const level of QUIET_LEVELS) {
    const quiet = function quietedByTestSetup(): void {
      /* dropped; see tests/quiet-console.ts */
    };
    // A marker rather than a comment, so the pin in
    // tests/infra/quiet-console.test.ts can tell "quieted" from "the suite
    // happens not to log".
    (quiet as unknown as Record<string, unknown>).quietedByTestSetup = true;
    target[level] = quiet;
  }
}
