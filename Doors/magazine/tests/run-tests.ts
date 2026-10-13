/**
 * Minimal test runner for the magazine reader door.
 *
 * Same pattern as the arcade doors: dependency-free plain async
 * functions plus node assert, run via tsx. A test fails by throwing.
 */

/* eslint-disable no-console */

const realLog = console.log;

const TEST_MODULES = [
  './columns.test',
  './library.test',
  './layout.test',
  './reader.test',
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
        realLog(`  [OK] ${mod.replace('./', '')} :: ${name}`);
      } catch (error) {
        failures.push({ name: `${mod} :: ${name}`, error });
        realLog(`  [FAIL] ${mod.replace('./', '')} :: ${name}`);
        realLog(`         ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  realLog(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length > 0 ? 1 : 0);
})().catch((e) => {
  realLog('Test runner crashed:', e);
  process.exit(1);
});
