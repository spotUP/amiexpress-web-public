/**
 * Minimal test runner for the Frogger door.
 *
 * Same pattern as Doors/super-qix/tests/run-tests.ts: dependency-free plain
 * async functions plus node assert, run via tsx (`npm test`). Each test file
 * exports named async functions; a test fails by throwing.
 */

/* eslint-disable no-console */

const TEST_MODULES = [
  './levels.test',
  './scoring.test',
  './hazards.test',
  './attract.test',
  './render.test',
  './layout.test',
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
