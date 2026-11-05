/* Minimal runner, the same shape grandmaster and doorrepo-c use: each test
 * file exports named async functions, a test fails by throwing. */
/* eslint-disable no-console */
const MODULES = ['./completion.test'];

(async () => {
  let passed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];
  for (const mod of MODULES) {
    const tests = await import(mod);
    for (const [name, fn] of Object.entries(tests)) {
      if (typeof fn !== 'function') continue;
      try {
        await (fn as () => Promise<void>)();
        passed++;
        console.log(`  [OK] ${name}`);
      } catch (error) {
        failures.push({ name, error });
        console.log(`  [FAIL] ${name}`);
      }
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`\n${f.name}:\n`, f.error);
  process.exit(failures.length > 0 ? 1 : 0);
})();
