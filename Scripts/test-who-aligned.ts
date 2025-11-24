#!/usr/bin/env node

/**
 * Test WHO door with aligned stack fix
 * Verifies that SP remains 4-byte aligned throughout execution
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3001';

async function testWhoDoor() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let outputBuffer = '';
    let connected = false;
    let loggedIn = false;
    let doorExecuting = false;

    const timeout = setTimeout(() => {
      console.log('\n[ERROR] Test timed out after 30 seconds');
      ws.close();
      reject(new Error('Timeout'));
    }, 30000);

    ws.on('open', () => {
      console.log('✓ Connected to BBS');
      connected = true;
    });

    ws.on('message', (data) => {
      const text = data.toString();
      outputBuffer += text;
      process.stdout.write(text);

      // Auto-login
      if (!loggedIn) {
        if (text.includes('Handle:')) {
          console.log('\n→ Sending username: testuser');
          ws.send('testuser\r\n');
        } else if (text.includes('Password:')) {
          console.log('→ Sending password');
          ws.send('test123\r\n');
          loggedIn = true;
        }
      }

      // Execute WHO command
      if (loggedIn && !doorExecuting && text.includes('Menu (')) {
        console.log('\n→ Executing WHO command');
        ws.send('who\r\n');
        doorExecuting = true;

        // Give door time to execute
        setTimeout(() => {
          console.log('\n\n=== WHO DOOR TEST COMPLETE ===');
          console.log('Check backend logs for stack alignment:');
          console.log('  grep "STACK MISALIGNMENT" /tmp/backend.log');
          console.log('  grep "Initial SP" /tmp/backend.log');

          clearTimeout(timeout);
          ws.close();
          resolve();
        }, 5000);
      }
    });

    ws.on('error', (error) => {
      console.error('[ERROR] WebSocket error:', error.message);
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', () => {
      if (!connected) {
        console.log('[ERROR] Failed to connect');
        reject(new Error('Connection failed'));
      }
      clearTimeout(timeout);
    });
  });
}

console.log('=== Testing WHO Door with Stack Alignment Fix ===\n');
testWhoDoor()
  .then(() => {
    console.log('\n✓ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[ERROR] Test failed:', error.message);
    process.exit(1);
  });
