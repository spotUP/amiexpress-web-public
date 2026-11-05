/**
 * Minimal test runner for the petscii-editor door.
 *
 * Same pattern as the sprite editor and the arcade doors: dependency-free
 * plain async functions plus node assert, run via tsx (`npm test`). A test
 * fails by throwing.
 *
 * ADD EVERY NEW FILE TO THIS LIST. It is explicit on purpose, and a file left
 * out of it runs nowhere - compare the passed count after adding one.
 */

/* eslint-disable no-console */

const TEST_MODULES = ['./opens.test', './saving.test'];

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
