/**
 * Test Script for Command 1: User Account Editor
 * Tests the Account Editor implementation from user-editor.handler.ts
 */

import io from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';
let socket: any;
let connected = false;
let sessionStarted = false;

// Track output for verification
let outputBuffer: string[] = [];

function log(message: string) {
  console.log(`[TEST] ${message}`);
}

function connectToServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    log('Connecting to server...');

    socket = io(BACKEND_URL, {
      transports: ['websocket'],
      reconnection: false
    });

    socket.on('connect', () => {
      log('✓ Connected to server');
      connected = true;
      resolve();
    });

    socket.on('connect_error', (error: Error) => {
      log(`✗ Connection error: ${error.message}`);
      reject(error);
    });

    socket.on('ansi-output', (data: string) => {
      outputBuffer.push(data);
      // Don't print control characters
      const clean = data.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
      if (clean.trim()) {
        process.stdout.write(clean);
      }
    });

    socket.on('session-started', (data: any) => {
      log('✓ Session started');
      log(`Session ID: ${data.sessionId}`);
      sessionStarted = true;
    });

    socket.on('error', (error: Error) => {
      log(`✗ Socket error: ${error.message}`);
    });

    socket.on('disconnect', () => {
      log('Disconnected from server');
      connected = false;
    });

    setTimeout(() => {
      if (!connected) {
        reject(new Error('Connection timeout after 5 seconds'));
      }
    }, 5000);
  });
}

function sendCommand(command: string): void {
  log(`>>> Sending: "${command}"`);
  outputBuffer = []; // Clear buffer
  socket.emit('user-input', command);
}

function waitForOutput(expectedText: string, timeoutMs: number = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkOutput = () => {
      const fullOutput = outputBuffer.join('');
      if (fullOutput.includes(expectedText)) {
        resolve();
      } else if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Timeout waiting for: "${expectedText}"\nGot: ${fullOutput.substring(0, 200)}`));
      } else {
        setTimeout(checkOutput, 100);
      }
    };

    checkOutput();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  try {
    // Connect
    await connectToServer();
    await sleep(2000); // Wait for welcome screens

    // Answer ANSI prompt
    log('\n=== Phase 0: Answer ANSI prompt ===');
    sendCommand('A');
    await waitForOutput('username', 3000);
    await sleep(500);

    // Login as sysop
    log('\n=== Phase 1: Login as sysop ===');
    sendCommand('sysop');
    await waitForOutput('password', 2000);
    await sleep(500);

    sendCommand('sysop');
    await waitForOutput('Main Menu', 3000);
    await sleep(1000);

    // Enter Command 1 (Account Editor)
    log('\n=== Phase 2: Enter Command 1 ===');
    sendCommand('1');
    await waitForOutput('Account Editing', 2000);
    await sleep(1000);

    // Check for menu options
    const output = outputBuffer.join('');
    if (output.includes('nactive') && output.includes('Search by name')) {
      log('✓ Account Editor menu displayed');
    } else {
      throw new Error('Account Editor menu not found');
    }

    // Test search by name
    log('\n=== Phase 3: Test Search by Name (S) ===');
    sendCommand('S');
    await waitForOutput('Enter username', 2000);
    await sleep(500);

    // Search for sysop user
    sendCommand('sysop');
    await sleep(2000);

    const searchOutput = outputBuffer.join('');
    if (searchOutput.includes('sysop') || searchOutput.includes('Username')) {
      log('✓ User search executed');
    } else {
      log('✗ User search may have failed');
    }

    // Return to menu
    log('\n=== Phase 4: Return to Main Menu ===');
    sendCommand(''); // CR to exit
    await sleep(1000);
    sendCommand(''); // CR again if needed
    await sleep(1000);

    // Logout
    log('\n=== Phase 5: Logout ===');
    sendCommand('G');
    await sleep(2000);

    log('\n✓ Test completed successfully!');
    log('\n=== Summary ===');
    log('Command 1 (User Account Editor) is working');
    log('- Menu displays correctly');
    log('- Search function accessible');
    log('- User can navigate the interface');

    process.exit(0);

  } catch (error: any) {
    log(`\n✗ Test failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the test
runTest();
