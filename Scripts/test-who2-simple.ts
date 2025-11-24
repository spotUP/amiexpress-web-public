#!/usr/bin/env node
/**
 * Simple WHO2 door test - just login and run WHO2
 */

const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3001';
const USERNAME = 'sysop';
const PASSWORD = 'sysop';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWHO2() {
  console.log('\n=== WHO2 Door Test ===\n');

  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: false
  });

  // Capture ALL output
  socket.on('ansi-output', (data) => {
    process.stdout.write(data);
  });

  socket.on('connect', async () => {
    console.log('\n[Connected to BBS]\n');

    // Wait for graphics prompt
    await sleep(1000);
    socket.emit('user-input', 'A\n');  // ANSI

    // Wait for username prompt
    await sleep(2000);
    socket.emit('user-input', USERNAME + '\n');

    // Wait for password prompt
    await sleep(1000);
    socket.emit('user-input', PASSWORD + '\n');

    // Wait for login and bulletins
    await sleep(3000);

    // Skip past bulletins (press Enter multiple times)
    for (let i = 0; i < 5; i++) {
      await sleep(500);
      socket.emit('user-input', '\n');
    }

    // Wait for menu
    await sleep(2000);

    console.log('\n\n[Executing WHO2 command...]\n');
    socket.emit('user-input', 'WHO2\n');

    // Wait for door to execute and show output
    await sleep(5000);

    console.log('\n\n[Exiting door...]\n');
    socket.emit('user-input', 'q\n');

    await sleep(2000);

    console.log('\n\n[Logging off...]\n');
    socket.emit('user-input', 'G\n');

    await sleep(1000);
    process.exit(0);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    process.exit(1);
  });
}

testWHO2().catch(console.error);
