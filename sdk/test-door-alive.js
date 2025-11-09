#!/usr/bin/env node
/**
 * Test script to verify doors stay alive after the fix
 */

const { spawn } = require('child_process');
const path = require('path');

const testDoor = (doorName) => {
  return new Promise((resolve) => {
    console.log(`\nTesting ${doorName}...`);

    const doorPath = path.join(__dirname, 'examples', doorName);
    const startTime = Date.now();

    const proc = spawn('npx', ['ts-node', 'index.ts'], {
      cwd: doorPath,
      env: { ...process.env, PREVIEW_MODE: '1' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Check if process is still alive after 2 seconds
    setTimeout(() => {
      const elapsed = Date.now() - startTime;

      // Try to kill the process
      try {
        process.kill(proc.pid, 0); // Check if process exists

        // Process is still alive - SUCCESS!
        console.log(`✓ ${doorName}: Process stayed alive for ${elapsed}ms`);
        proc.kill();
        resolve({ success: true, elapsed, exitCode: null });
      } catch (e) {
        // Process already exited - FAILURE
        console.log(`✗ ${doorName}: Process exited prematurely`);
        resolve({ success: false, elapsed, exitCode: proc.exitCode || 'unknown' });
      }
    }, 2000);

    proc.on('exit', (code) => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 1900) { // Exited before our 2s check
        console.log(`✗ ${doorName}: Exited with code ${code} after ${elapsed}ms`);
        if (stderr) console.log(`   Error: ${stderr.substring(0, 200)}`);
        resolve({ success: false, elapsed, exitCode: code });
      }
    });
  });
};

async function main() {
  console.log('='.repeat(60));
  console.log('Door Lifecycle Test - Verifying doors stay alive');
  console.log('='.repeat(60));

  const doors = ['bug-tracker', 'dungeon-rpg'];
  const results = [];

  for (const door of doors) {
    const result = await testDoor(door);
    results.push({ door, ...result });
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Results:');
  console.log('='.repeat(60));

  results.forEach(r => {
    const status = r.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} - ${r.door} (${r.elapsed}ms, exit: ${r.exitCode || 'N/A'})`);
  });

  const allPassed = results.every(r => r.success);
  console.log('\n' + (allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'));

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
