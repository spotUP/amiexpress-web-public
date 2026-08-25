/**
 * Minimal test runner for the Grandmaster door.
 *
 * First test harness this door has ever had — added 2026-08-25 after a
 * session in which the AI's inverted evaluation weights, a hardcoded
 * 3-opponent CPU battle, and a completely unwired attack/garbage system all
 * shipped unnoticed, precisely because nothing here was executable as a test.
 *
 * Deliberately dependency-free: plain async functions + node assert, run via
 * tsx (`npm test`). Each test file exports named async functions; a test
 * fails by throwing. No jest, no config, nothing to drift.
 */

/* eslint-disable no-console */

const TEST_MODULES = [
  './attack-routing.test',
  './network-wiring.test',
  './board-clear.test',
  './lockout.test',
  './tetrinet-bots.test',
  './tetrinet-routing.test',
  './tetrinet-lobby.test',
  './tetrinet-netplay.test',
  './tetrinet-score-report.test',
  './tetrinet-hold.test',
  './tetrinet-specials-input.test',
  './tetrinet-ai.test',
  './tetrinet-protocol.test',
  './tetrinet-winlist.test',
  './spectator.test',
  './tetrinet-layout.test',
];

// Blessed screens and engines log freely; keep test output readable.
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
