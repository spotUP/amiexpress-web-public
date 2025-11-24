#!/usr/bin/env node

/**
 * Interactive BBS Command Tester
 * Tests specific commands and validates responses
 */

const io = require('socket.io-client');
const readline = require('readline');

let socket;
let allOutput = '';
let lastOutput = '';
let commandInProgress = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\n> '
});

function log(message) {
  console.log(`\x1b[90m[${new Date().toISOString().split('T')[1].split('.')[0]}]\x1b[0m ${message}`);
}

function setupSocket() {
  socket = io('http://localhost:3001', {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('connect', () => {
    log('✓ Connected to BBS');
    console.log('\nType commands to test, or "help" for options');
    console.log('Commands: test-j, test-x, test-nav, test-msg, quit\n');
    rl.prompt();
  });

  socket.on('ansi-output', (data) => {
    allOutput += data;
    lastOutput += data;

    // Strip ANSI codes for display
    const clean = data.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
    process.stdout.write(clean);
  });

  socket.on('disconnect', () => {
    log('✗ Disconnected from BBS');
    process.exit(0);
  });

  socket.on('error', (error) => {
    log(`✗ Error: ${error.message}`);
  });
}

async function waitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendCommand(cmd) {
  lastOutput = '';
  socket.emit('ansi-input', cmd + '\r');
  await waitFor(300);
}

async function testJCommand() {
  log('Testing J command with parameters...');

  console.log('\n--- Testing: J 1 (Join conference 1) ---');
  await sendCommand('J 1');
  await waitFor(1000);

  if (lastOutput.includes('joined') || lastOutput.includes('Conf') || lastOutput.includes('BULL')) {
    log('✓ J 1 works - joined conference');
  } else {
    log('✗ J 1 failed - unexpected response');
  }

  console.log('\n--- Testing: J 4 (Invalid conference) ---');
  await sendCommand('J 4');
  await waitFor(1000);

  if (lastOutput.includes('Conference Number') || lastOutput.includes('AVAILABLE CONFERENCES')) {
    log('✓ J 4 works - shows conference list again (no error)');
  } else {
    log('✗ J 4 failed - should show conference list');
  }

  rl.prompt();
}

async function testExpertMode() {
  log('Testing expert mode toggle (X command)...');

  console.log('\n--- Testing: X (Toggle expert mode) ---');
  await sendCommand('X');
  await waitFor(500);

  if (lastOutput.includes('Expert') || lastOutput.includes('mode')) {
    log('✓ X command responded');
  } else {
    log('✗ X command - no response detected');
  }

  // Toggle back
  await sendCommand('X');
  await waitFor(500);

  rl.prompt();
}

async function testNavigation() {
  log('Testing conference navigation...');

  console.log('\n--- Testing: > (Next conference) ---');
  await sendCommand('>');
  await waitFor(1000);

  console.log('\n--- Testing: < (Previous conference) ---');
  await sendCommand('<');
  await waitFor(1000);

  console.log('\n--- Testing: >> (Next message base) ---');
  await sendCommand('>>');
  await waitFor(1000);

  console.log('\n--- Testing: << (Previous message base) ---');
  await sendCommand('<<');
  await waitFor(1000);

  log('✓ Navigation commands sent');
  rl.prompt();
}

async function testMessageCommands() {
  log('Testing message commands...');

  console.log('\n--- Testing: R (Read messages) ---');
  await sendCommand('R');
  await waitFor(1000);

  // Send Q to quit message reader
  console.log('\n--- Sending Q to quit reader ---');
  await sendCommand('Q');
  await waitFor(500);

  log('✓ Message commands tested');
  rl.prompt();
}

async function login() {
  log('Logging in as sysop...');
  await waitFor(2000);
  await sendCommand('sysop');
  await waitFor(500);
  await sendCommand('sysop');
  await waitFor(3000);
  log('✓ Login complete');
  rl.prompt();
}

// Handle user input
rl.on('line', async (line) => {
  const input = line.trim();

  if (commandInProgress) {
    console.log('Wait for current command to finish...');
    return;
  }

  commandInProgress = true;

  switch (input) {
    case 'help':
      console.log('\nAvailable commands:');
      console.log('  test-j      - Test J command with parameters');
      console.log('  test-x      - Test expert mode toggle');
      console.log('  test-nav    - Test conference navigation');
      console.log('  test-msg    - Test message reading');
      console.log('  quit        - Exit tester');
      console.log('  <any text>  - Send directly to BBS\n');
      break;

    case 'test-j':
      await testJCommand();
      break;

    case 'test-x':
      await testExpertMode();
      break;

    case 'test-nav':
      await testNavigation();
      break;

    case 'test-msg':
      await testMessageCommands();
      break;

    case 'quit':
    case 'exit':
      console.log('Goodbye!');
      socket.disconnect();
      process.exit(0);
      break;

    default:
      if (input.length > 0) {
        await sendCommand(input);
        await waitFor(300);
      }
      break;
  }

  commandInProgress = false;
  rl.prompt();
});

rl.on('close', () => {
  console.log('\nGoodbye!');
  if (socket) socket.disconnect();
  process.exit(0);
});

// Main
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  BBS Interactive Command Tester');
  console.log('═══════════════════════════════════════');

  setupSocket();

  await waitFor(1000);

  if (!socket.connected) {
    log('✗ Failed to connect');
    process.exit(1);
  }

  await login();
}

main();
