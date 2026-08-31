"use strict";
/**
 * Minimal test runner for the Donkey Kong door.
 *
 * Same pattern as the other arcade doors: dependency-free plain async
 * functions plus node assert, run via tsx. A test fails by throwing.
 */
/* eslint-disable no-console */
const TEST_MODULES = [
    './layout.test',
    './sprites.test',
];
(async () => {
    let passed = 0;
    const failures = [];
    for (const mod of TEST_MODULES) {
        const tests = await import(mod);
        for (const [name, fn] of Object.entries(tests)) {
            if (typeof fn !== 'function')
                continue;
            try {
                await fn();
                passed++;
                console.log(`  [OK] ${mod.replace('./', '')} :: ${name}`);
            }
            catch (error) {
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
