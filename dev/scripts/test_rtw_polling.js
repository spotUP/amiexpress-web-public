#!/usr/bin/env node
/**
 * Test RTW door to analyze polling loop behavior
 * Run with: node dev/scripts/test_rtw_polling.js
 */

const io = require('socket.io-client');

const BACKEND_URL = 'http://localhost:3001';

async function testRTWPolling() {
  console.log('='.repeat(80));
  console.log('RTW POLLING LOOP ANALYSIS TEST');
  console.log('='.repeat(80));

  const socket = io(BACKEND_URL, {
    transports: ['websocket'],
    reconnection: false
  });

  return new Promise((resolve, reject) => {
    let outputBuffer = '';
    const timeout = setTimeout(() => {
      console.log('\n[TIMEOUT] Test timed out after 30 seconds');
      socket.close();
      reject(new Error('Test timeout'));
    }, 30000);

    socket.on('connect', () => {
      console.log('[CONNECTED] Socket connected, waiting for ANSI prompt...\n');
    });

    socket.on('ansi-output', (data) => {
      process.stdout.write(data);
      outputBuffer += data;

      // Wait for ANSI prompt
      if (outputBuffer.includes('ANSI, RIP or No graphics')) {
        console.log('\n[ACTION] Sending ANSI selection...');
        socket.emit('user-input', 'A\n');
        outputBuffer = '';
      }
      // Wait for login prompt
      else if (outputBuffer.includes('nter your name') || outputBuffer.includes('First name:')) {
        console.log('\n[ACTION] Logging in as test user...');
        socket.emit('user-input', 'test\n');
        outputBuffer = '';
      }
      // Wait for password prompt
      else if (outputBuffer.includes('assword:')) {
        console.log('\n[ACTION] Sending password...');
        socket.emit('user-input', 'test\n');
        outputBuffer = '';
      }
      // Wait for main menu
      else if (outputBuffer.includes('ommand:') || outputBuffer.includes('AmiExpress')) {
        console.log('\n[ACTION] At main menu, executing RTW door...');
        socket.emit('user-input', 'DOOR RTW\n');
        outputBuffer = '';
      }
      // RTW completion - look for "Press ENTER"
      else if (outputBuffer.includes('Press ENTER to continue')) {
        console.log('\n[SUCCESS] RTW door completed');
        console.log('\n[INFO] Check backend logs for [RTW-POLL] messages to see polling loop behavior');
        clearTimeout(timeout);
        socket.close();
        setTimeout(() => resolve(), 1000);
      }
    });

    socket.on('disconnect', () => {
      console.log('\n[DISCONNECTED] Socket closed');
    });

    socket.on('connect_error', (error) => {
      console.error('[ERROR] Connection failed:', error.message);
      clearTimeout(timeout);
      reject(error);
    });

    socket.on('error', (error) => {
      console.error('[ERROR]', error);
      clearTimeout(timeout);
      reject(error);
    });
  });
}

// Run test
testRTWPolling()
  .then(() => {
    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETED - Check backend logs for [RTW-POLL] analysis');
    console.log('Look for patterns in:');
    console.log('  - Opcodes being executed');
    console.log('  - Register values (especially condition codes)');
    console.log('  - Memory access patterns');
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[FAILED]', error.message);
    process.exit(1);
  });
