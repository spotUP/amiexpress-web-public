/**
 * Minimal test runner for the Scrollwars door.
 *
 * Same pattern as WHIP, LiveChat and CARD LOBBY: dependency-free async
 * functions plus node assert, run via tsx (`npm test`). A test fails by
 * throwing.
 */

/* eslint-disable no-console */

const TEST_MODULES = ['./status-bar.test'];

const realLog = console.log;
console.log = () => {};

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
})().catch(e => {
  realLog('Test runner crashed:', e);
  process.exit(1);
});
