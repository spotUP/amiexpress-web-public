/**
 * Cross-door test runner.
 *
 * Dependency-free: plain async functions + node assert, run via tsx
 * (`npm run test:doors` from the repo root). Each test file exports named
 * async functions; a test fails by throwing. Same pattern as
 * Doors/grandmaster/tests/run-tests.ts.
 */

/* eslint-disable no-console */

const TEST_MODULES = [
  './door-regressions.test',
];

(async () => {
  let passed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];

  for (const mod of TEST_MODULES) {
    const tests = await import(mod);
    for (const [name, fn] of Object.entries(tests)) {
      if (typeof fn !== 'function') continue;
      try {
        await (fn as () => Promise<void>)();
        passed++;
        console.log(`  [OK] ${mod.replace('./', '')} :: ${name}`);
      } catch (error) {
        failures.push({ name: `${mod} :: ${name}`, error });
        console.log(`  [FAIL] ${mod.replace('./', '')} :: ${name}`);
        console.log(`         ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length > 0 ? 1 : 0);
})().catch(e => {
  console.log('Test runner crashed:', e);
  process.exit(1);
});
