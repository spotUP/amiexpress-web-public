/**
 * Test 68K doors to verify the fix
 */

import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';

async function testDoor(command, timeout = 10000) {
  return new Promise((resolve) => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      reconnection: false
    });

    let output = '';
    let timer;

    socket.on('connect', () => {
      console.log(`\n[${command}] Connected, authenticating...`);
      socket.emit('authenticate', {
        username: 'spot',
        password: 'test'
      });
    });

    socket.on('authenticated', () => {
      console.log(`[${command}] Authenticated, executing command...`);
      socket.emit('command', command);

      timer = setTimeout(() => {
        socket.disconnect();
        resolve({
          command,
          success: output.length > 0,
          output: output.substring(0, 500)
        });
      }, timeout);
    });

    socket.on('ansi-output', (data) => {
      output += data;
    });

    socket.on('auth-error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      resolve({
        command,
        success: false,
        output: '',
        error: `Auth failed: ${error}`
      });
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      resolve({
        command,
        success: false,
        output: '',
        error: `Connection failed: ${error.message}`
      });
    });
  });
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Testing 68K Door Fix');
  console.log('='.repeat(80));

  const tests = [
    { cmd: 'B', name: 'Bulletins' },
    { cmd: 'J', name: 'JoinConf' },
  ];

  for (const test of tests) {
    console.log(`\nTesting: ${test.name} (${test.cmd})`);

    const result = await testDoor(test.cmd, 8000);

    console.log(`\nRESULT for ${test.cmd}:`);
    console.log(`  Success: ${result.success ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  Output length: ${result.output.length} chars`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    if (result.output) {
      const clean = result.output
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\r/g, '')
        .substring(0, 300);
      console.log(`\nOutput preview:\n${clean}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('Tests complete!');
  console.log('='.repeat(80));
  process.exit(0);
}

runTests().catch(console.error);
